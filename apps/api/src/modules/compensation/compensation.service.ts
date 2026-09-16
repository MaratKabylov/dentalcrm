import type {
  CompensationRuleVersionInput, CreateCompensationRuleInput, CreatePayrollAdjustmentInput,
  CreatePayrollPeriodInput, CreateTimesheetInput
} from "@dental/contracts";
import { HttpStatus, Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import { ApiException } from "../../common/http/api.exception.js";
import { DatabaseService } from "../../database/database.service.js";
import { AuditService } from "../audit/audit.service.js";
import { assertOrganizationAccess } from "../identity/access-scope.js";
import type { AuthContext } from "../identity/auth-context.js";
import { OutboxService } from "../outbox/outbox.service.js";

interface PeriodRow { id:string;organizationId:string;startsOn:string;endsOn:string;currency:string;status:string }

@Injectable()
export class CompensationService {
  constructor(private readonly database:DatabaseService,private readonly audit:AuditService,private readonly outbox:OutboxService) {}

  rules(auth:AuthContext){return this.database.withTenant(auth,async(client)=>{
    return (await client.query(`SELECT r.id,r.organization_id AS "organizationId",r.name,r.active,
      COALESCE(jsonb_agg(jsonb_build_object('id',v.id,'versionNumber',v.version_number,'calculationType',v.calculation_type,
        'calculationBasis',v.calculation_basis,'rate',v.rate,'amountMinor',v.amount_minor,'currency',v.currency,
        'validFrom',v.valid_from,'validTo',v.valid_to,'condition',jsonb_build_object('employeeId',c.employee_id,'branchId',c.branch_id,
        'serviceId',c.service_id,'serviceCategoryId',c.service_category_id,'paymentMethod',c.payment_method))
        ORDER BY v.version_number DESC) FILTER(WHERE v.id IS NOT NULL),'[]') AS versions
      FROM compensation_rules r LEFT JOIN compensation_rule_versions v ON v.rule_id=r.id
      LEFT JOIN compensation_rule_conditions c ON c.rule_version_id=v.id
      WHERE r.archived_at IS NULL AND ${auth.tenantWide?"TRUE":"r.organization_id=ANY($1::uuid[])"} GROUP BY r.id ORDER BY r.name`,
      auth.tenantWide?([] as unknown[]):[[...auth.organizationIds]])).rows;
  });}

  createRule(auth:AuthContext,input:CreateCompensationRuleInput){return this.database.withTenant(auth,async(client)=>{
    await assertOrganizationAccess(client,auth,input.organizationId,false);const rule=(await client.query<{id:string}>(`INSERT INTO compensation_rules
      (tenant_id,organization_id,name,created_by) VALUES($1,$2,$3,$4) RETURNING id`,[auth.tenantId,input.organizationId,input.name,auth.userId])).rows[0]!;
    const version=await this.insertVersion(client,auth,rule.id,input.organizationId,1,input.version);
    const result={id:rule.id,organizationId:input.organizationId,name:input.name,active:true,version};
    await this.record(client,auth,"compensation_rule.created","CompensationRuleCreated","compensation_rule",rule.id,result,input.organizationId);return result;
  });}

  addRuleVersion(auth:AuthContext,ruleId:string,input:CompensationRuleVersionInput){return this.database.withTenant(auth,async(client)=>{
    const rule=(await client.query<{organizationId:string;name:string}>(`SELECT organization_id AS "organizationId",name FROM compensation_rules
      WHERE id=$1 AND archived_at IS NULL FOR UPDATE`,[ruleId])).rows[0];if(!rule)throw notFound("COMPENSATION_RULE_NOT_FOUND","Compensation rule not found");
    await assertOrganizationAccess(client,auth,rule.organizationId,false);const number=Number((await client.query<{next:string}>(
      "SELECT COALESCE(max(version_number),0)+1 AS next FROM compensation_rule_versions WHERE rule_id=$1",[ruleId])).rows[0]!.next);
    const version=await this.insertVersion(client,auth,ruleId,rule.organizationId,number,input);
    await this.record(client,auth,"compensation_rule.versioned","CompensationRuleVersionCreated","compensation_rule",ruleId,version,rule.organizationId);return version;
  });}

  createTimesheet(auth:AuthContext,input:CreateTimesheetInput){return this.database.withTenant(auth,async(client)=>{
    await assertOrganizationAccess(client,auth,input.organizationId,false);await this.assertEmployee(client,input.organizationId,input.employeeId);
    for(const entry of input.entries)await this.assertBranch(client,input.organizationId,entry.branchId);
    const sheet=(await client.query<{id:string}>(`INSERT INTO timesheets(tenant_id,organization_id,employee_id,starts_on,ends_on,created_by)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,[auth.tenantId,input.organizationId,input.employeeId,input.startsOn,input.endsOn,auth.userId])).rows[0]!;
    for(const entry of input.entries)await client.query(`INSERT INTO time_entries
      (tenant_id,organization_id,timesheet_id,branch_id,worked_on,minutes,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [auth.tenantId,input.organizationId,sheet.id,entry.branchId,entry.workedOn,entry.minutes,entry.notes ?? null,auth.userId]);
    const result={id:sheet.id,organizationId:input.organizationId,employeeId:input.employeeId,startsOn:input.startsOn,endsOn:input.endsOn,
      status:"draft",entries:input.entries};await this.record(client,auth,"timesheet.created","TimesheetCreated","timesheet",sheet.id,result,input.organizationId);return result;
  });}

  submitTimesheet(auth:AuthContext,id:string){return this.transitionTimesheet(auth,id,"draft","submitted","timesheet.submitted","TimesheetSubmitted");}
  approveTimesheet(auth:AuthContext,id:string){return this.database.withTenant(auth,async(client)=>{const sheet=await this.lockTimesheet(client,auth,id);
    if(sheet.status!=="submitted")throw conflict("TIMESHEET_NOT_SUBMITTED","Only a submitted timesheet can be approved");
    const result=(await client.query(`UPDATE timesheets SET status='approved',approved_at=now(),approved_by=$2,rejection_reason=NULL WHERE id=$1
      RETURNING id,status,approved_at AS "approvedAt"`,[id,auth.userId])).rows[0]!;
    await this.record(client,auth,"timesheet.approved","TimesheetApproved","timesheet",id,result,sheet.organizationId);return result;
  });}
  rejectTimesheet(auth:AuthContext,id:string,reason:string){return this.database.withTenant(auth,async(client)=>{const sheet=await this.lockTimesheet(client,auth,id);
    if(sheet.status!=="submitted")throw conflict("TIMESHEET_NOT_SUBMITTED","Only a submitted timesheet can be rejected");
    const result=(await client.query(`UPDATE timesheets SET status='rejected',rejection_reason=$2 WHERE id=$1 RETURNING id,status,
      rejection_reason AS reason`,[id,reason])).rows[0]!;await this.record(client,auth,"timesheet.rejected","TimesheetRejected","timesheet",id,result,
      sheet.organizationId,reason);return result;
  });}

  createPeriod(auth:AuthContext,input:CreatePayrollPeriodInput){return this.database.withTenant(auth,async(client)=>{
    await assertOrganizationAccess(client,auth,input.organizationId,false);await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
      [`payroll:${input.organizationId}:${input.currency}`]);
    if((await client.query(`SELECT 1 FROM payroll_periods WHERE organization_id=$1 AND currency=$2 AND daterange(starts_on,ends_on,'[]') &&
      daterange($3::date,$4::date,'[]')`,[input.organizationId,input.currency,input.startsOn,input.endsOn])).rows[0])
      throw conflict("PAYROLL_PERIOD_OVERLAP","Payroll period overlaps an existing period");
    const row=(await client.query<Record<string,unknown>&{id:string}>(`INSERT INTO payroll_periods
      (tenant_id,organization_id,starts_on,ends_on,currency,created_by) VALUES($1,$2,$3,$4,$5,$6)
      RETURNING id,organization_id AS "organizationId",starts_on AS "startsOn",ends_on AS "endsOn",currency,status`,
      [auth.tenantId,input.organizationId,input.startsOn,input.endsOn,input.currency,auth.userId])).rows[0]!;
    await this.record(client,auth,"payroll_period.created","PayrollPeriodCreated","payroll_period",row.id,row,input.organizationId);return row;
  });}

  calculate(auth:AuthContext,id:string){return this.database.withTenant(auth,async(client)=>{const period=await this.lockPeriod(client,auth,id);
    if(period.status==="approved")throw conflict("PAYROLL_APPROVED","Approved payroll cannot be recalculated");
    const unsupported=(await client.query(`SELECT 1 FROM compensation_rule_versions v JOIN compensation_rules r ON r.id=v.rule_id
      WHERE r.organization_id=$1 AND r.active AND r.archived_at IS NULL AND v.currency=$2 AND v.calculation_type='formula'
      AND v.valid_from<=$4::date AND COALESCE(v.valid_to,'infinity'::date)>=$3::date LIMIT 1`,
      [period.organizationId,period.currency,period.startsOn,period.endsOn])).rows[0];
    if(unsupported)throw bad("FORMULA_ENGINE_NOT_CONFIGURED","Formula compensation rules require a configured formula evaluator");
    await client.query("DELETE FROM payroll_accruals WHERE payroll_period_id=$1",[id]);
    await this.calculateProcedures(client,auth,period);await this.calculateHourly(client,auth,period);await this.calculateSalary(client,auth,period);
    await client.query(`UPDATE payroll_periods SET status='calculated',calculated_at=now(),calculated_by=$2 WHERE id=$1`,[id,auth.userId]);
    const result=await this.periodAggregate(client,period);await this.record(client,auth,"payroll.calculated","PayrollCalculated","payroll_period",id,
      {id,status:"calculated",totals:result.totals},period.organizationId);return result;
  });}

  addAdjustment(auth:AuthContext,id:string,input:CreatePayrollAdjustmentInput){return this.database.withTenant(auth,async(client)=>{
    const period=await this.lockPeriod(client,auth,id);if(period.status==="approved")throw conflict("PAYROLL_APPROVED","Approved payroll cannot be adjusted");
    await this.assertEmployee(client,period.organizationId,input.employeeId);const row=(await client.query<Record<string,unknown>&{id:string}>(`INSERT INTO payroll_adjustments
      (tenant_id,organization_id,payroll_period_id,employee_id,amount_minor,currency,reason,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING id,employee_id AS "employeeId",amount_minor::text AS "amountMinor",currency,reason,created_at AS "createdAt"`,
      [auth.tenantId,period.organizationId,id,input.employeeId,input.amountMinor,period.currency,input.reason,auth.userId])).rows[0]!;
    const result=money(row);await this.record(client,auth,"payroll.adjusted","PayrollAdjustmentCreated","payroll_adjustment",row.id,result,
      period.organizationId,input.reason);return result;
  });}

  approve(auth:AuthContext,id:string,note?:string){return this.database.withTenant(auth,async(client)=>{const period=await this.lockPeriod(client,auth,id);
    if(period.status!=="calculated")throw conflict("PAYROLL_NOT_CALCULATED","Payroll must be calculated before approval");
    const aggregate=await this.periodAggregate(client,period);const totalAmountMinor=aggregate.totals.reduce((sum,item)=>sum+item.totalAmountMinor,0);
    const approval=(await client.query<{id:string;approvedAt:Date}>(`INSERT INTO payroll_approvals
      (tenant_id,organization_id,payroll_period_id,approved_by,total_amount_minor,employee_totals,note)
      VALUES($1,$2,$3,$4,$5,$6::jsonb,$7) RETURNING id,approved_at AS "approvedAt"`,[auth.tenantId,period.organizationId,id,auth.userId,
      totalAmountMinor,JSON.stringify(aggregate.totals),note ?? null])).rows[0]!;
    await client.query(`UPDATE payroll_periods SET status='approved',approved_at=$2,approved_by=$3 WHERE id=$1`,[id,approval.approvedAt,auth.userId]);
    const result={id,status:"approved",approvalId:approval.id,approvedAt:approval.approvedAt.toISOString(),totalAmountMinor,totals:aggregate.totals};
    await this.record(client,auth,"payroll.approved","PayrollApproved","payroll_period",id,result,period.organizationId,note);return result;
  });}

  period(auth:AuthContext,id:string){return this.database.withTenant(auth,async(client)=>this.periodAggregate(client,await this.findPeriod(client,auth,id)));}

  ownPayroll(auth:AuthContext){return this.database.withTenant(auth,async(client)=>{const employee=(await client.query<{id:string}>(
      "SELECT id FROM employees WHERE user_id=$1 AND status='active'",[auth.userId])).rows[0];if(!employee)return [];
    const rows=(await client.query<Record<string,unknown>>(`SELECT p.id AS "periodId",p.organization_id AS "organizationId",o.name AS "organizationName",
      p.starts_on AS "startsOn",p.ends_on AS "endsOn",p.currency,p.approved_at AS "approvedAt",
      COALESCE((SELECT sum(a.amount_minor) FROM payroll_accruals a WHERE a.payroll_period_id=p.id AND a.employee_id=$1),0)::text AS "accrualAmountMinor",
      COALESCE((SELECT sum(j.amount_minor) FROM payroll_adjustments j WHERE j.payroll_period_id=p.id AND j.employee_id=$1),0)::text AS "adjustmentAmountMinor"
      FROM payroll_periods p JOIN organizations o ON o.id=p.organization_id WHERE p.status='approved' AND EXISTS(
        SELECT 1 FROM payroll_accruals a WHERE a.payroll_period_id=p.id AND a.employee_id=$1 UNION ALL
        SELECT 1 FROM payroll_adjustments j WHERE j.payroll_period_id=p.id AND j.employee_id=$1)
      ORDER BY p.ends_on DESC`,[employee.id])).rows;return rows.map((row)=>{const converted=money(row);return {...converted,
      totalAmountMinor:Number(converted.accrualAmountMinor)+Number(converted.adjustmentAmountMinor)};});
  });}

  private async insertVersion(client:PoolClient,auth:AuthContext,ruleId:string,organizationId:string,versionNumber:number,input:CompensationRuleVersionInput){
    await this.validateCondition(client,organizationId,input.condition);const row=(await client.query<Record<string,unknown>&{id:string}>(`INSERT INTO compensation_rule_versions
      (tenant_id,organization_id,rule_id,version_number,calculation_type,calculation_basis,rate,amount_minor,formula,currency,valid_from,valid_to,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13) RETURNING id,version_number AS "versionNumber",
      calculation_type AS "calculationType",calculation_basis AS "calculationBasis",rate,amount_minor::text AS "amountMinor",currency,
      valid_from AS "validFrom",valid_to AS "validTo"`,[auth.tenantId,organizationId,ruleId,versionNumber,input.calculationType,
      input.calculationBasis,input.rate ?? null,input.amountMinor ?? null,input.formula?JSON.stringify(input.formula):null,input.currency,input.validFrom,
      input.validTo ?? null,auth.userId])).rows[0]!;
    await client.query(`INSERT INTO compensation_rule_conditions(tenant_id,organization_id,rule_version_id,employee_id,branch_id,service_id,
      service_category_id,payment_method) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[auth.tenantId,organizationId,row.id,input.condition.employeeId ?? null,
      input.condition.branchId ?? null,input.condition.serviceId ?? null,input.condition.serviceCategoryId ?? null,input.condition.paymentMethod ?? null]);
    return {...money(row),rate:row.rate===null?null:Number(row.rate),condition:input.condition};
  }

  private async calculateProcedures(client:PoolClient,auth:AuthContext,p:PeriodRow){await client.query(`INSERT INTO payroll_accruals
    (tenant_id,organization_id,payroll_period_id,employee_id,rule_version_id,source_type,source_id,source_amount_minor,quantity,
      amount_minor,currency,rule_snapshot,created_by)
    SELECT $1,$2,$3,d.employee_id,rv.id,'procedure',pr.id,m.source_amount,pr.quantity,
      CASE rv.calculation_type WHEN 'percentage' THEN round(m.source_amount*rv.rate/100)::bigint ELSE rv.amount_minor*pr.quantity END,
      rv.currency,jsonb_build_object('ruleId',r.id,'ruleName',r.name,'ruleVersionId',rv.id,'versionNumber',rv.version_number,
        'calculationType',rv.calculation_type,'calculationBasis',rv.calculation_basis,'rate',rv.rate,'amountMinor',rv.amount_minor,
        'condition',jsonb_build_object('employeeId',rv.employee_id,'branchId',rv.branch_id,'serviceId',rv.service_id,
          'serviceCategoryId',rv.service_category_id,'paymentMethod',rv.payment_method)),$4
    FROM procedures pr JOIN encounters e ON e.id=pr.encounter_id JOIN branches b ON b.id=e.branch_id
    JOIN doctors d ON d.id=pr.doctor_id JOIN services s ON s.id=pr.service_id
    JOIN compensation_rules r ON r.organization_id=b.organization_id AND r.active AND r.archived_at IS NULL
    JOIN LATERAL (SELECT v.*,c.employee_id,c.branch_id,c.service_id,c.service_category_id,c.payment_method
      FROM compensation_rule_versions v LEFT JOIN compensation_rule_conditions c ON c.rule_version_id=v.id
      WHERE v.rule_id=r.id AND v.currency=$5 AND v.calculation_type IN ('percentage','fixed')
        AND v.valid_from<=(pr.completed_at AT TIME ZONE b.timezone)::date
        AND COALESCE(v.valid_to,'infinity'::date)>=(pr.completed_at AT TIME ZONE b.timezone)::date
        AND (c.employee_id IS NULL OR c.employee_id=d.employee_id) AND (c.branch_id IS NULL OR c.branch_id=b.id)
        AND (c.service_id IS NULL OR c.service_id=pr.service_id) AND (c.service_category_id IS NULL OR c.service_category_id=s.category_id)
        AND (c.payment_method IS NULL OR EXISTS(SELECT 1 FROM charge_items cx JOIN payment_allocations pa ON pa.charge_id=cx.charge_id
          JOIN payment_parts pp ON pp.payment_id=pa.payment_id WHERE cx.procedure_id=pr.id AND pp.method=c.payment_method))
      ORDER BY v.version_number DESC LIMIT 1) rv ON true
    LEFT JOIN LATERAL (SELECT COALESCE(sum(ci.total_amount_minor),0)::bigint source_amount FROM charge_items ci WHERE ci.procedure_id=pr.id) m ON true
    WHERE b.organization_id=$2 AND pr.status='completed' AND (pr.completed_at AT TIME ZONE b.timezone)::date BETWEEN $6::date AND $7::date`,
    [auth.tenantId,p.organizationId,p.id,auth.userId,p.currency,p.startsOn,p.endsOn]);}

  private async calculateHourly(client:PoolClient,auth:AuthContext,p:PeriodRow){await client.query(`INSERT INTO payroll_accruals
    (tenant_id,organization_id,payroll_period_id,employee_id,rule_version_id,source_type,source_id,source_amount_minor,quantity,
      amount_minor,currency,rule_snapshot,created_by)
    SELECT $1,$2,$3,t.employee_id,rv.id,'time_entry',te.id,NULL,te.minutes::numeric/60,
      round(rv.amount_minor*te.minutes::numeric/60)::bigint,rv.currency,
      jsonb_build_object('ruleId',r.id,'ruleName',r.name,'ruleVersionId',rv.id,'versionNumber',rv.version_number,
        'calculationType','hourly','calculationBasis',rv.calculation_basis,'amountMinor',rv.amount_minor,
        'condition',jsonb_build_object('employeeId',rv.employee_id,'branchId',rv.branch_id)),$4
    FROM time_entries te JOIN timesheets t ON t.id=te.timesheet_id
    JOIN compensation_rules r ON r.organization_id=t.organization_id AND r.active AND r.archived_at IS NULL
    JOIN LATERAL (SELECT v.*,c.employee_id,c.branch_id FROM compensation_rule_versions v
      LEFT JOIN compensation_rule_conditions c ON c.rule_version_id=v.id WHERE v.rule_id=r.id AND v.currency=$5
      AND v.calculation_type='hourly' AND v.valid_from<=te.worked_on AND COALESCE(v.valid_to,'infinity'::date)>=te.worked_on
      AND (c.employee_id IS NULL OR c.employee_id=t.employee_id) AND (c.branch_id IS NULL OR c.branch_id=te.branch_id)
      AND c.service_id IS NULL AND c.service_category_id IS NULL AND c.payment_method IS NULL ORDER BY v.version_number DESC LIMIT 1) rv ON true
    WHERE t.organization_id=$2 AND t.status='approved' AND te.worked_on BETWEEN $6::date AND $7::date`,
    [auth.tenantId,p.organizationId,p.id,auth.userId,p.currency,p.startsOn,p.endsOn]);}

  private async calculateSalary(client:PoolClient,auth:AuthContext,p:PeriodRow){await client.query(`INSERT INTO payroll_accruals
    (tenant_id,organization_id,payroll_period_id,employee_id,rule_version_id,source_type,source_id,source_amount_minor,quantity,
      amount_minor,currency,rule_snapshot,created_by)
    SELECT $1,$2,$3,staff.employee_id,rv.id,'salary',NULL,NULL,1,rv.amount_minor,rv.currency,
      jsonb_build_object('ruleId',r.id,'ruleName',r.name,'ruleVersionId',rv.id,'versionNumber',rv.version_number,
        'calculationType','salary','calculationBasis',rv.calculation_basis,'amountMinor',rv.amount_minor,
        'condition',jsonb_build_object('employeeId',rv.employee_id,'branchId',rv.branch_id)),$4
    FROM (SELECT DISTINCT eb.employee_id FROM employee_branches eb JOIN branches b ON b.id=eb.branch_id
      JOIN employees e ON e.id=eb.employee_id WHERE b.organization_id=$2 AND e.status='active') staff
    JOIN compensation_rules r ON r.organization_id=$2 AND r.active AND r.archived_at IS NULL
    JOIN LATERAL (SELECT v.*,c.employee_id,c.branch_id FROM compensation_rule_versions v
      LEFT JOIN compensation_rule_conditions c ON c.rule_version_id=v.id WHERE v.rule_id=r.id AND v.currency=$5
      AND v.calculation_type='salary' AND v.valid_from<=$7::date AND COALESCE(v.valid_to,'infinity'::date)>=$6::date
      AND (c.employee_id IS NULL OR c.employee_id=staff.employee_id)
      AND (c.branch_id IS NULL OR EXISTS(SELECT 1 FROM employee_branches eb WHERE eb.employee_id=staff.employee_id AND eb.branch_id=c.branch_id))
      AND c.service_id IS NULL AND c.service_category_id IS NULL AND c.payment_method IS NULL ORDER BY v.version_number DESC LIMIT 1) rv ON true`,
    [auth.tenantId,p.organizationId,p.id,auth.userId,p.currency,p.startsOn,p.endsOn]);}

  private async periodAggregate(client:PoolClient,p:PeriodRow){const period=(await client.query(`SELECT id,organization_id AS "organizationId",starts_on AS "startsOn",
      ends_on AS "endsOn",currency,status,calculated_at AS "calculatedAt",approved_at AS "approvedAt" FROM payroll_periods WHERE id=$1`,[p.id])).rows[0]!;
    const accruals=(await client.query<Record<string,unknown>>(`SELECT a.id,a.employee_id AS "employeeId",e.first_name AS "firstName",e.last_name AS "lastName",
      a.source_type AS "sourceType",a.source_id AS "sourceId",a.source_amount_minor::text AS "sourceAmountMinor",a.quantity::text AS quantity,
      a.amount_minor::text AS "amountMinor",a.currency,a.rule_snapshot AS "ruleSnapshot",a.accrued_at AS "accruedAt"
      FROM payroll_accruals a JOIN employees e ON e.id=a.employee_id WHERE a.payroll_period_id=$1 ORDER BY e.last_name,a.accrued_at,a.id`,[p.id])).rows.map(money);
    const adjustments=(await client.query<Record<string,unknown>>(`SELECT j.id,j.employee_id AS "employeeId",e.first_name AS "firstName",e.last_name AS "lastName",
      j.amount_minor::text AS "amountMinor",j.currency,j.reason,j.created_at AS "createdAt" FROM payroll_adjustments j JOIN employees e ON e.id=j.employee_id
      WHERE j.payroll_period_id=$1 ORDER BY e.last_name,j.created_at`,[p.id])).rows.map(money);
    const totals=(await client.query<Record<string,unknown>>(`WITH amounts AS (
      SELECT employee_id,amount_minor FROM payroll_accruals WHERE payroll_period_id=$1 UNION ALL
      SELECT employee_id,amount_minor FROM payroll_adjustments WHERE payroll_period_id=$1)
      SELECT e.id AS "employeeId",e.first_name AS "firstName",e.last_name AS "lastName",sum(x.amount_minor)::text AS "totalAmountMinor"
      FROM amounts x JOIN employees e ON e.id=x.employee_id GROUP BY e.id ORDER BY e.last_name,e.first_name`,[p.id])).rows.map(money) as Array<Record<string,unknown>&{totalAmountMinor:number}>;
    return {period,totals,accruals,adjustments};}

  private async findPeriod(client:PoolClient,auth:AuthContext,id:string,lock=false){const row=(await client.query<PeriodRow>(`SELECT id,organization_id AS "organizationId",
      starts_on AS "startsOn",ends_on AS "endsOn",currency,status FROM payroll_periods WHERE id=$1${lock?" FOR UPDATE":""}`,[id])).rows[0];
    if(!row)throw notFound("PAYROLL_PERIOD_NOT_FOUND","Payroll period not found");await assertOrganizationAccess(client,auth,row.organizationId,false);return row;}
  private lockPeriod(client:PoolClient,auth:AuthContext,id:string){return this.findPeriod(client,auth,id,true);}
  private async lockTimesheet(client:PoolClient,auth:AuthContext,id:string){const row=(await client.query<{organizationId:string;status:string}>(
      `SELECT organization_id AS "organizationId",status FROM timesheets WHERE id=$1 FOR UPDATE`,[id])).rows[0];
    if(!row)throw notFound("TIMESHEET_NOT_FOUND","Timesheet not found");await assertOrganizationAccess(client,auth,row.organizationId,false);return row;}
  private transitionTimesheet(auth:AuthContext,id:string,from:string,to:string,action:string,event:string){return this.database.withTenant(auth,async(client)=>{
    const sheet=await this.lockTimesheet(client,auth,id);if(sheet.status!==from)throw conflict("INVALID_TIMESHEET_STATUS",`Timesheet must be ${from}`);
    const result=(await client.query(`UPDATE timesheets SET status=$2,submitted_at=CASE WHEN $2='submitted' THEN now() ELSE submitted_at END
      WHERE id=$1 RETURNING id,status,submitted_at AS "submittedAt"`,[id,to])).rows[0]!;await this.record(client,auth,action,event,"timesheet",id,result,
      sheet.organizationId);return result;});}

  private async validateCondition(client:PoolClient,organizationId:string,c:CompensationRuleVersionInput["condition"]){
    if(c.employeeId)await this.assertEmployee(client,organizationId,c.employeeId);if(c.branchId)await this.assertBranch(client,organizationId,c.branchId);
    if(c.serviceId && !(await client.query("SELECT 1 FROM services WHERE id=$1 AND organization_id=$2",[c.serviceId,organizationId])).rows[0])
      throw bad("INVALID_COMPENSATION_SERVICE","Service does not belong to the organization");
    if(c.serviceCategoryId && !(await client.query("SELECT 1 FROM service_categories WHERE id=$1 AND organization_id=$2",[c.serviceCategoryId,organizationId])).rows[0])
      throw bad("INVALID_COMPENSATION_CATEGORY","Service category does not belong to the organization");}
  private async assertEmployee(client:PoolClient,organizationId:string,id:string){if(!(await client.query(`SELECT 1 FROM employees e JOIN employee_branches eb ON eb.employee_id=e.id
      JOIN branches b ON b.id=eb.branch_id WHERE e.id=$1 AND b.organization_id=$2 LIMIT 1`,[id,organizationId])).rows[0])
    throw bad("INVALID_COMPENSATION_EMPLOYEE","Employee does not belong to the organization");}
  private async assertBranch(client:PoolClient,organizationId:string,id:string){if(!(await client.query("SELECT 1 FROM branches WHERE id=$1 AND organization_id=$2",
    [id,organizationId])).rows[0])throw bad("INVALID_COMPENSATION_BRANCH","Branch does not belong to the organization");}
  private async record(client:PoolClient,auth:AuthContext,action:string,eventType:string,entityType:string,id:string,after:unknown,
    organizationId:string,reason?:string){await this.audit.append(client,{tenantId:auth.tenantId,actorUserId:auth.userId,action,entityType,entityId:id,after,
      ...(reason?{reason}:{}),requestId:auth.requestId});await this.outbox.append(client,{tenantId:auth.tenantId,aggregateType:entityType,aggregateId:id,
      eventType,payload:{[`${entityType.replaceAll("_","")}Id`]:id,organizationId},requestId:auth.requestId});}
}

function money<T extends Record<string,unknown>>(row:T):T{for(const [key,value] of Object.entries(row))if(typeof value==="string" &&
  ["amountMinor","sourceAmountMinor","totalAmountMinor","accrualAmountMinor","adjustmentAmountMinor","quantity"].includes(key))
  (row as Record<string,unknown>)[key]=Number(value);return row;}
function bad(code:string,message:string){return new ApiException(HttpStatus.BAD_REQUEST,code,message);}
function conflict(code:string,message:string){return new ApiException(HttpStatus.CONFLICT,code,message);}
function notFound(code:string,message:string){return new ApiException(HttpStatus.NOT_FOUND,code,message);}
