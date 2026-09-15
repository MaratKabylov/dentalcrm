import {
  closeCashSessionSchema, createCashboxSchema, createChargeSchema, createExpenseCategorySchema,
  createExpenseSchema, createPaymentSchema, createRefundSchema, idempotencyKeySchema,
  openCashSessionSchema, uuidSchema
} from "@dental/contracts";
import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { parseSchema } from "../../common/http/parse-schema.js";
import type { AuthContext } from "../identity/auth-context.js";
import { CurrentAuth } from "../identity/current-auth.decorator.js";
import { RequirePermissions } from "../identity/permissions.decorator.js";
import { FinanceService } from "./finance.service.js";

@ApiTags("finance") @ApiBearerAuth() @Controller()
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Post("charges") @RequirePermissions("finance.charge.create")
  createCharge(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.finance.createCharge(auth, parseSchema(createChargeSchema, body));
  }

  @Post("payments") @RequirePermissions("finance.payment.create")
  createPayment(@CurrentAuth() auth: AuthContext, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    return this.finance.createPayment(auth, parseSchema(idempotencyKeySchema, key), parseSchema(createPaymentSchema, body));
  }

  @Get("payments/:id") @RequirePermissions("finance.read")
  getPayment(@CurrentAuth() auth: AuthContext, @Param("id") id: string) {
    return this.finance.getPayment(auth, parseSchema(uuidSchema, id));
  }

  @Post("payments/:id/refund") @RequirePermissions("finance.payment.refund")
  refund(@CurrentAuth() auth: AuthContext, @Param("id") id: string,
    @Headers("idempotency-key") key: string | undefined, @Body() body: unknown) {
    return this.finance.refund(auth, parseSchema(uuidSchema, id), parseSchema(idempotencyKeySchema, key),
      parseSchema(createRefundSchema, body));
  }

  @Get("patients/:patientId/ledger") @RequirePermissions("finance.read")
  patientLedger(@CurrentAuth() auth: AuthContext, @Param("patientId") patientId: string) {
    return this.finance.patientLedger(auth, parseSchema(uuidSchema, patientId));
  }

  @Get("patients/:patientId/balance") @RequirePermissions("finance.read")
  patientBalance(@CurrentAuth() auth: AuthContext, @Param("patientId") patientId: string) {
    return this.finance.patientBalance(auth, parseSchema(uuidSchema, patientId));
  }

  @Get("patients/:patientId/deposits") @RequirePermissions("finance.read")
  patientDeposits(@CurrentAuth() auth: AuthContext, @Param("patientId") patientId: string) {
    return this.finance.patientDeposits(auth, parseSchema(uuidSchema, patientId));
  }

  @Post("cashboxes") @RequirePermissions("finance.cashbox.manage")
  createCashbox(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.finance.createCashbox(auth, parseSchema(createCashboxSchema, body));
  }

  @Post("cashboxes/:id/sessions/open") @RequirePermissions("finance.cashbox.manage")
  openSession(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    return this.finance.openCashSession(auth, parseSchema(uuidSchema, id), parseSchema(openCashSessionSchema, body));
  }

  @Post("cash-sessions/:id/close") @RequirePermissions("finance.cashbox.manage")
  closeSession(@CurrentAuth() auth: AuthContext, @Param("id") id: string, @Body() body: unknown) {
    return this.finance.closeCashSession(auth, parseSchema(uuidSchema, id), parseSchema(closeCashSessionSchema, body));
  }

  @Post("expense-categories") @RequirePermissions("finance.cashbox.manage")
  createExpenseCategory(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.finance.createExpenseCategory(auth, parseSchema(createExpenseCategorySchema, body));
  }

  @Post("expenses") @RequirePermissions("finance.expense.create")
  createExpense(@CurrentAuth() auth: AuthContext, @Body() body: unknown) {
    return this.finance.createExpense(auth, parseSchema(createExpenseSchema, body));
  }
}
