import type {
  ConfirmMaterialConsumptionInput, CreateProductCategoryInput, CreateProductInput, CreateStocktakeInput,
  CreateSupplierInput, CreateUnitOfMeasureInput, CreateWarehouseInput, ReceiveStockInput, TransferStockInput,
  UpsertServiceRecipeInput, WriteoffStockInput
} from "@dental/contracts";
import { HttpStatus, Injectable } from "@nestjs/common";
import type { PoolClient } from "pg";
import { ApiException } from "../../common/http/api.exception.js";
import { DatabaseService } from "../../database/database.service.js";
import { AuditService } from "../audit/audit.service.js";
import { assertBranchAccess, assertOrganizationAccess, organizationScopeSql, scopeValues } from "../identity/access-scope.js";
import type { AuthContext } from "../identity/auth-context.js";
import { OutboxService } from "../outbox/outbox.service.js";

interface WarehouseRow { id:string; organizationId:string; branchId:string|null; name:string }
interface ProductRow { id:string; organizationId:string; trackBatches:boolean }
interface Allocation { batchId:string|null; quantity:number }

@Injectable()
export class InventoryService {
  constructor(private readonly database:DatabaseService,private readonly audit:AuditService,private readonly outbox:OutboxService) {}

  listUnits(auth:AuthContext){return this.catalog(auth,`SELECT u.id,u.organization_id AS "organizationId",u.code,u.name,u.symbol,
    u.decimal_places AS "decimalPlaces" FROM units_of_measure u WHERE u.archived_at IS NULL AND {scope} ORDER BY u.name`);}
  createUnit(auth:AuthContext,input:CreateUnitOfMeasureInput){return this.createCatalog(auth,input.organizationId,"units_of_measure","unit_of_measure",
    "UnitOfMeasureCreated",`(tenant_id,organization_id,code,name,symbol,decimal_places,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)
    RETURNING id,organization_id AS "organizationId",code,name,symbol,decimal_places AS "decimalPlaces"`,
    [input.code,input.name,input.symbol,input.decimalPlaces]);}

  listCategories(auth:AuthContext){return this.catalog(auth,`SELECT c.id,c.organization_id AS "organizationId",c.code,c.name
    FROM product_categories c WHERE c.archived_at IS NULL AND {scope} ORDER BY c.name`);}
  createCategory(auth:AuthContext,input:CreateProductCategoryInput){return this.createCatalog(auth,input.organizationId,"product_categories",
    "product_category","ProductCategoryCreated",`(tenant_id,organization_id,code,name,created_by) VALUES($1,$2,$3,$4,$5)
    RETURNING id,organization_id AS "organizationId",code,name`,[input.code,input.name]);}

  listSuppliers(auth:AuthContext){return this.catalog(auth,`SELECT s.id,s.organization_id AS "organizationId",s.code,s.name,s.phone,s.email
    FROM suppliers s WHERE s.archived_at IS NULL AND {scope} ORDER BY s.name`);}
  createSupplier(auth:AuthContext,input:CreateSupplierInput){return this.createCatalog(auth,input.organizationId,"suppliers","supplier",
    "SupplierCreated",`(tenant_id,organization_id,code,name,phone,email,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)
    RETURNING id,organization_id AS "organizationId",code,name,phone,email`,[input.code,input.name,input.phone ?? null,input.email ?? null]);}

  listProducts(auth:AuthContext){return this.catalog(auth,`SELECT p.id,p.organization_id AS "organizationId",p.category_id AS "categoryId",
    p.unit_id AS "unitId",p.sku,p.name,p.track_batches AS "trackBatches",p.minimum_stock::text AS "minimumStock",p.active,
    u.symbol,COALESCE(array_agg(pb.barcode) FILTER(WHERE pb.id IS NOT NULL),'{}') AS barcodes
    FROM products p JOIN units_of_measure u ON u.id=p.unit_id LEFT JOIN product_barcodes pb ON pb.product_id=p.id
    WHERE p.archived_at IS NULL AND {scope} GROUP BY p.id,u.symbol ORDER BY p.name`,true);}

  createProduct(auth:AuthContext,input:CreateProductInput){return this.database.withTenant(auth,async(client)=>{
    await assertOrganizationAccess(client,auth,input.organizationId);
    await this.assertCatalogReferences(client,input.organizationId,input.unitId,input.categoryId);
    const row=(await client.query<Record<string,unknown> & {id:string}>(`INSERT INTO products
      (tenant_id,organization_id,category_id,unit_id,sku,name,track_batches,minimum_stock,created_by,updated_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING id,organization_id AS "organizationId",category_id AS "categoryId",
      unit_id AS "unitId",sku,name,track_batches AS "trackBatches",minimum_stock::text AS "minimumStock",active`,
      [auth.tenantId,input.organizationId,input.categoryId ?? null,input.unitId,input.sku,input.name,input.trackBatches,input.minimumStock,auth.userId])).rows[0]!;
    if(input.barcode)await client.query(`INSERT INTO product_barcodes(tenant_id,organization_id,product_id,barcode) VALUES($1,$2,$3,$4)`,
      [auth.tenantId,input.organizationId,row.id,input.barcode]);
    const result=numbers({...row,barcodes:input.barcode?[input.barcode]:[]});
    await this.record(client,auth,"product.created","ProductCreated","product",row.id,result,input.organizationId);return result;
  });}

  listWarehouses(auth:AuthContext){return this.catalog(auth,`SELECT w.id,w.organization_id AS "organizationId",w.branch_id AS "branchId",
    w.code,w.name,w.active FROM warehouses w WHERE w.archived_at IS NULL AND {scope} ORDER BY w.name`);}
  createWarehouse(auth:AuthContext,input:CreateWarehouseInput){return this.database.withTenant(auth,async(client)=>{
    await assertOrganizationAccess(client,auth,input.organizationId);
    if(input.branchId){const organizationId=await assertBranchAccess(client,auth,input.branchId);if(organizationId!==input.organizationId)
      throw conflict("WAREHOUSE_BRANCH_MISMATCH","Branch does not belong to the warehouse organization");}
    const row=(await client.query<Record<string,unknown>&{id:string}>(`INSERT INTO warehouses
      (tenant_id,organization_id,branch_id,code,name,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$6)
      RETURNING id,organization_id AS "organizationId",branch_id AS "branchId",code,name,active`,
      [auth.tenantId,input.organizationId,input.branchId ?? null,input.code,input.name,auth.userId])).rows[0]!;
    await this.record(client,auth,"warehouse.created","WarehouseCreated","warehouse",row.id,row,input.organizationId);return row;
  });}

  stock(auth:AuthContext,warehouseId?:string,productId?:string){return this.database.withTenant(auth,async(client)=>{
    if(warehouseId)await this.warehouse(client,auth,warehouseId);
    const scope={sql:organizationScopeSql("w"),values:scopeValues(auth)};
    return (await client.query(`SELECT w.id AS "warehouseId",w.name AS "warehouseName",p.id AS "productId",p.sku,p.name,
      p.minimum_stock::text AS "minimumStock",u.symbol,m.batch_id AS "batchId",b.lot_number AS "lotNumber",b.expires_at AS "expiresAt",
      sum(m.quantity_delta)::text AS quantity FROM stock_movements m JOIN warehouses w ON w.id=m.warehouse_id
      JOIN products p ON p.id=m.product_id JOIN units_of_measure u ON u.id=p.unit_id LEFT JOIN product_batches b ON b.id=m.batch_id
      WHERE ${scope.sql} AND ($3::uuid IS NULL OR w.id=$3) AND ($4::uuid IS NULL OR p.id=$4)
      GROUP BY w.id,p.id,u.symbol,m.batch_id,b.lot_number,b.expires_at HAVING sum(m.quantity_delta)<>0
      ORDER BY w.name,p.name,b.expires_at NULLS LAST,b.lot_number`,[...scope.values,warehouseId ?? null,productId ?? null])).rows.map(numbers);
  });}

  receive(auth:AuthContext,input:ReceiveStockInput){return this.database.withTenant(auth,async(client)=>{
    const warehouse=await this.warehouse(client,auth,input.warehouseId);if(input.supplierId)await this.assertSupplier(client,warehouse.organizationId,input.supplierId);
    const occurredAt=input.receivedAt ?? new Date().toISOString();const document=await this.document(client,auth,warehouse.organizationId,"receipt",null,
      warehouse.id,input.reference ?? null,null,occurredAt);
    const receipt=(await client.query<{id:string}>(`INSERT INTO purchase_receipts
      (tenant_id,organization_id,document_id,warehouse_id,supplier_id,received_at,reference) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [auth.tenantId,warehouse.organizationId,document.id,warehouse.id,input.supplierId ?? null,occurredAt,input.reference ?? null])).rows[0]!;
    for(const item of input.items){const product=await this.product(client,warehouse.organizationId,item.productId);
      if(product.trackBatches && !item.lotNumber)throw bad("BATCH_REQUIRED","A lot number is required for a batch-tracked product",{productId:item.productId});
      const batchId=item.lotNumber?await this.batch(client,auth,warehouse.organizationId,item):null;
      const lineId=await this.line(client,auth,warehouse.organizationId,document.id,item.productId,batchId,item.quantity);
      await client.query(`INSERT INTO purchase_receipt_lines(tenant_id,receipt_id,document_line_id,purchase_price_minor)
        VALUES($1,$2,$3,$4)`,[auth.tenantId,receipt.id,lineId,item.purchasePriceMinor ?? null]);
      await this.movement(client,auth,warehouse,document.id,lineId,item.productId,batchId,item.quantity,occurredAt);
    }
    const result={id:receipt.id,documentId:document.id,warehouseId:warehouse.id,status:"posted",occurredAt};
    await this.record(client,auth,"stock.received","StockReceived","stock_document",document.id,result,warehouse.organizationId);return result;
  });}

  transfer(auth:AuthContext,input:TransferStockInput){return this.database.withTenant(auth,async(client)=>{
    const source=await this.warehouse(client,auth,input.sourceWarehouseId),destination=await this.warehouse(client,auth,input.destinationWarehouseId);
    if(source.organizationId!==destination.organizationId)throw conflict("WAREHOUSE_ORGANIZATION_MISMATCH","Warehouses must belong to one organization");
    const document=await this.document(client,auth,source.organizationId,"transfer",source.id,destination.id,null,input.notes ?? null);
    const transfer=(await client.query<{id:string}>(`INSERT INTO stock_transfers
      (tenant_id,organization_id,document_id,source_warehouse_id,destination_warehouse_id) VALUES($1,$2,$3,$4,$5) RETURNING id`,
      [auth.tenantId,source.organizationId,document.id,source.id,destination.id])).rows[0]!;
    for(const item of combine(input.items)){await this.product(client,source.organizationId,item.productId);
      for(const allocation of await this.allocate(client,source.id,item.productId,item.quantity)){
        const lineId=await this.line(client,auth,source.organizationId,document.id,item.productId,allocation.batchId,allocation.quantity);
        await this.movement(client,auth,source,document.id,lineId,item.productId,allocation.batchId,-allocation.quantity);
        await this.movement(client,auth,destination,document.id,lineId,item.productId,allocation.batchId,allocation.quantity);
      }}
    const result={id:transfer.id,documentId:document.id,sourceWarehouseId:source.id,destinationWarehouseId:destination.id,status:"posted"};
    await this.record(client,auth,"stock.transferred","StockTransferred","stock_document",document.id,result,source.organizationId);return result;
  });}

  writeoff(auth:AuthContext,input:WriteoffStockInput){return this.database.withTenant(auth,async(client)=>{
    const warehouse=await this.warehouse(client,auth,input.warehouseId);
    const document=await this.document(client,auth,warehouse.organizationId,"writeoff",warehouse.id,null,null,input.reason);
    const writeoff=(await client.query<{id:string}>(`INSERT INTO stock_writeoffs(tenant_id,organization_id,document_id,warehouse_id,reason)
      VALUES($1,$2,$3,$4,$5) RETURNING id`,[auth.tenantId,warehouse.organizationId,document.id,warehouse.id,input.reason])).rows[0]!;
    await this.consume(client,auth,warehouse,document.id,combine(input.items));
    const result={id:writeoff.id,documentId:document.id,warehouseId:warehouse.id,status:"posted",reason:input.reason};
    await this.record(client,auth,"stock.written_off","StockWrittenOff","stock_document",document.id,result,warehouse.organizationId,input.reason);return result;
  });}

  stocktake(auth:AuthContext,input:CreateStocktakeInput){return this.database.withTenant(auth,async(client)=>{
    const warehouse=await this.warehouse(client,auth,input.warehouseId);
    const document=await this.document(client,auth,warehouse.organizationId,"stocktake",warehouse.id,null,null,input.notes ?? null);
    const stocktake=(await client.query<{id:string}>(`INSERT INTO stocktakes(tenant_id,organization_id,document_id,warehouse_id)
      VALUES($1,$2,$3,$4) RETURNING id`,[auth.tenantId,warehouse.organizationId,document.id,warehouse.id])).rows[0]!;
    for(const item of input.items){const product=await this.product(client,warehouse.organizationId,item.productId);
      if(product.trackBatches && !item.batchId)throw bad("BATCH_REQUIRED","batchId is required for a batch-tracked product",{productId:item.productId});
      if(item.batchId)await this.assertBatch(client,warehouse.organizationId,item.productId,item.batchId);
      await this.lockStock(client,warehouse.id,item.productId);const expected=await this.balance(client,warehouse.id,item.productId,item.batchId ?? null);
      const variance=round(item.countedQuantity-expected);const lineId=await this.line(client,auth,warehouse.organizationId,document.id,item.productId,
        item.batchId ?? null,Math.max(item.countedQuantity,expected));
      await client.query(`INSERT INTO stocktake_lines(tenant_id,organization_id,stocktake_id,document_line_id,product_id,batch_id,
        expected_quantity,counted_quantity,variance_quantity) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [auth.tenantId,warehouse.organizationId,stocktake.id,lineId,item.productId,item.batchId ?? null,expected,item.countedQuantity,variance]);
      if(variance!==0)await this.movement(client,auth,warehouse,document.id,lineId,item.productId,item.batchId ?? null,variance);
    }
    const result={id:stocktake.id,documentId:document.id,warehouseId:warehouse.id,status:"posted"};
    await this.record(client,auth,"stock.stocktaken","StocktakePosted","stock_document",document.id,result,warehouse.organizationId);return result;
  });}

  recipes(auth:AuthContext){return this.catalog(auth,`SELECT r.id,r.organization_id AS "organizationId",r.service_id AS "serviceId",s.name AS "serviceName",
    COALESCE(jsonb_agg(jsonb_build_object('productId',i.product_id,'productName',p.name,'quantity',i.quantity::text))
      FILTER(WHERE i.id IS NOT NULL),'[]') AS items FROM service_material_recipes r JOIN services s ON s.id=r.service_id
    LEFT JOIN service_material_recipe_items i ON i.recipe_id=r.id LEFT JOIN products p ON p.id=i.product_id
    WHERE r.active AND {scope} GROUP BY r.id,s.name ORDER BY s.name`,true);}

  upsertRecipe(auth:AuthContext,input:UpsertServiceRecipeInput){return this.database.withTenant(auth,async(client)=>{
    await assertOrganizationAccess(client,auth,input.organizationId);const service=(await client.query("SELECT 1 FROM services WHERE id=$1 AND organization_id=$2 AND active",
      [input.serviceId,input.organizationId])).rows[0];if(!service)throw bad("INVALID_RECIPE_SERVICE","Service does not belong to the organization");
    const items=combine(input.items);for(const item of items)await this.product(client,input.organizationId,item.productId);
    const recipe=(await client.query<{id:string}>(`INSERT INTO service_material_recipes(tenant_id,organization_id,service_id,created_by,updated_by)
      VALUES($1,$2,$3,$4,$4) ON CONFLICT(tenant_id,organization_id,service_id) DO UPDATE SET active=true,updated_at=now(),updated_by=$4,
      version=service_material_recipes.version+1 RETURNING id`,[auth.tenantId,input.organizationId,input.serviceId,auth.userId])).rows[0]!;
    await client.query("DELETE FROM service_material_recipe_items WHERE recipe_id=$1",[recipe.id]);
    for(const item of items)await client.query(`INSERT INTO service_material_recipe_items
      (tenant_id,organization_id,recipe_id,product_id,quantity) VALUES($1,$2,$3,$4,$5)`,
      [auth.tenantId,input.organizationId,recipe.id,item.productId,item.quantity]);
    const result={id:recipe.id,organizationId:input.organizationId,serviceId:input.serviceId,items};
    await this.record(client,auth,"service_recipe.upserted","ServiceMaterialRecipeUpdated","service_material_recipe",recipe.id,result,input.organizationId);return result;
  });}

  consumptions(auth:AuthContext){return this.catalog(auth,`SELECT c.id,c.organization_id AS "organizationId",c.procedure_id AS "procedureId",
    c.warehouse_id AS "warehouseId",c.status,c.created_at AS "createdAt",c.confirmed_at AS "confirmedAt",
    COALESCE(jsonb_agg(jsonb_build_object('productId',l.product_id,'productName',p.name,'plannedQuantity',l.planned_quantity::text,
      'actualQuantity',l.actual_quantity::text)) FILTER(WHERE l.id IS NOT NULL),'[]') AS items
    FROM material_consumptions c LEFT JOIN material_consumption_lines l ON l.consumption_id=c.id LEFT JOIN products p ON p.id=l.product_id
    WHERE {scope} GROUP BY c.id ORDER BY c.created_at DESC`,true);}

  confirmConsumption(auth:AuthContext,id:string,input:ConfirmMaterialConsumptionInput){return this.database.withTenant(auth,async(client)=>{
    const consumption=(await client.query<{organizationId:string;status:string}>(`SELECT organization_id AS "organizationId",status
      FROM material_consumptions WHERE id=$1 FOR UPDATE`,[id])).rows[0];if(!consumption)throw notFound("MATERIAL_CONSUMPTION_NOT_FOUND","Material consumption not found");
    await assertOrganizationAccess(client,auth,consumption.organizationId);if(consumption.status!=="planned")
      throw conflict("MATERIAL_CONSUMPTION_CLOSED","Material consumption is already closed");
    const warehouse=await this.warehouse(client,auth,input.warehouseId);if(warehouse.organizationId!==consumption.organizationId)
      throw conflict("WAREHOUSE_ORGANIZATION_MISMATCH","Warehouse belongs to another organization");
    const planned=(await client.query<{productId:string;quantity:string}>(`SELECT product_id AS "productId",planned_quantity::text AS quantity
      FROM material_consumption_lines WHERE consumption_id=$1`,[id])).rows.map((row)=>({productId:row.productId,quantity:Number(row.quantity)}));
    const actual=input.items?combine(input.items):planned;if(actual.length===0)throw conflict("EMPTY_MATERIAL_CONSUMPTION","The recipe has no material lines");
    const plannedIds=new Set(planned.map((item)=>item.productId));
    if(actual.length!==plannedIds.size || actual.some((item)=>!plannedIds.has(item.productId)))
      throw bad("INVALID_CONSUMPTION_PRODUCTS","Actual consumption must contain every planned product exactly once");
    const document=await this.document(client,auth,consumption.organizationId,"consumption",warehouse.id,null,`procedure-consumption:${id}`,null);
    await this.consume(client,auth,warehouse,document.id,actual);
    for(const item of actual){const updated=await client.query(`UPDATE material_consumption_lines SET actual_quantity=$3
      WHERE consumption_id=$1 AND product_id=$2`,[id,item.productId,item.quantity]);if(updated.rowCount===0)throw bad("INVALID_CONSUMPTION_PRODUCT",
        "Actual consumption contains a product outside the planned recipe",{productId:item.productId});}
    await client.query(`UPDATE material_consumptions SET status='confirmed',warehouse_id=$2,document_id=$3,confirmed_at=now(),confirmed_by=$4 WHERE id=$1`,
      [id,warehouse.id,document.id,auth.userId]);const result={id,status:"confirmed",warehouseId:warehouse.id,documentId:document.id,items:actual};
    await this.record(client,auth,"material_consumption.confirmed","MaterialConsumptionConfirmed","material_consumption",id,result,
      consumption.organizationId);return result;
  });}

  alerts(auth:AuthContext,days:number){return this.database.withTenant(auth,async(client)=>{const scope={sql:organizationScopeSql("w"),values:scopeValues(auth)};
    const rows=(await client.query(`WITH balances AS (SELECT warehouse_id,product_id,batch_id,sum(quantity_delta) quantity FROM stock_movements
      GROUP BY warehouse_id,product_id,batch_id HAVING sum(quantity_delta)>0), product_totals AS (
      SELECT warehouse_id,product_id,sum(quantity) quantity FROM balances GROUP BY warehouse_id,product_id)
      SELECT w.organization_id AS "organizationId",w.id AS "warehouseId",w.name AS "warehouseName",p.id AS "productId",p.name AS "productName",
        b.batch_id AS "batchId",pb.lot_number AS "lotNumber",pb.expires_at AS "expiresAt",b.quantity::text AS quantity,
        CASE WHEN pb.expires_at<current_date THEN 'expired' ELSE 'expiring' END AS "alertType"
      FROM balances b JOIN warehouses w ON w.id=b.warehouse_id JOIN products p ON p.id=b.product_id JOIN product_batches pb ON pb.id=b.batch_id
      WHERE ${scope.sql} AND pb.expires_at<=current_date+$3::int
      UNION ALL
      SELECT w.organization_id,w.id,w.name,p.id,p.name,NULL,NULL,NULL,t.quantity::text,'low_stock'
      FROM product_totals t JOIN warehouses w ON w.id=t.warehouse_id JOIN products p ON p.id=t.product_id
      WHERE ${scope.sql.replaceAll("$1","$4").replaceAll("$2","$5")} AND t.quantity<p.minimum_stock
      ORDER BY "warehouseName","productName","expiresAt"`,[...scope.values,days,...scope.values])).rows;return rows.map(numbers);
  });}

  private catalog(auth:AuthContext,sql:string,convert=false){const scope={sql:organizationScopeSql(sql.includes(" w ")?"w":sql.includes(" p ")?"p":
    sql.includes(" c ")?"c":sql.includes(" s ")?"s":sql.includes(" r ")?"r":"u"),values:scopeValues(auth)};
    return this.database.withTenant(auth,async(client)=>{const rows=(await client.query(sql.replace("{scope}",scope.sql),scope.values)).rows;
      return convert?rows.map(deepNumbers):rows;});}

  private createCatalog(auth:AuthContext,organizationId:string,table:string,entityType:string,eventType:string,sql:string,values:unknown[]){
    return this.database.withTenant(auth,async(client)=>{await assertOrganizationAccess(client,auth,organizationId);
      const row=(await client.query<Record<string,unknown>&{id:string}>(`INSERT INTO ${table} ${sql}`,[auth.tenantId,organizationId,...values,auth.userId])).rows[0]!;
      await this.record(client,auth,`${entityType}.created`,eventType,entityType,row.id,row,organizationId);return row;});}

  private async warehouse(client:PoolClient,auth:AuthContext,id:string){const row=(await client.query<WarehouseRow>(`SELECT id,organization_id AS "organizationId",
    branch_id AS "branchId",name FROM warehouses WHERE id=$1 AND active AND archived_at IS NULL`,[id])).rows[0];
    if(!row)throw notFound("WAREHOUSE_NOT_FOUND","Warehouse not found");if(row.branchId)await assertBranchAccess(client,auth,row.branchId);
    else await assertOrganizationAccess(client,auth,row.organizationId);return row;}
  private async product(client:PoolClient,organizationId:string,id:string){const row=(await client.query<ProductRow>(`SELECT id,organization_id AS "organizationId",
    track_batches AS "trackBatches" FROM products WHERE id=$1 AND organization_id=$2 AND active AND archived_at IS NULL`,[id,organizationId])).rows[0];
    if(!row)throw bad("INVALID_INVENTORY_PRODUCT","Product does not belong to the organization",{productId:id});return row;}
  private async assertCatalogReferences(client:PoolClient,organizationId:string,unitId:string,categoryId?:string){
    if(!(await client.query("SELECT 1 FROM units_of_measure WHERE id=$1 AND organization_id=$2 AND archived_at IS NULL",[unitId,organizationId])).rows[0])
      throw bad("INVALID_PRODUCT_UNIT","Unit does not belong to the organization");
    if(categoryId && !(await client.query("SELECT 1 FROM product_categories WHERE id=$1 AND organization_id=$2 AND archived_at IS NULL",[categoryId,organizationId])).rows[0])
      throw bad("INVALID_PRODUCT_CATEGORY","Category does not belong to the organization");}
  private async assertSupplier(client:PoolClient,organizationId:string,id:string){if(!(await client.query(
    "SELECT 1 FROM suppliers WHERE id=$1 AND organization_id=$2 AND archived_at IS NULL",[id,organizationId])).rows[0])
    throw bad("INVALID_RECEIPT_SUPPLIER","Supplier does not belong to the organization");}
  private async assertBatch(client:PoolClient,organizationId:string,productId:string,batchId:string){if(!(await client.query(
    "SELECT 1 FROM product_batches WHERE id=$1 AND organization_id=$2 AND product_id=$3",[batchId,organizationId,productId])).rows[0])
    throw bad("INVALID_PRODUCT_BATCH","Batch does not belong to the product");}

  private async batch(client:PoolClient,auth:AuthContext,organizationId:string,item:ReceiveStockInput["items"][number]){
    return (await client.query<{id:string}>(`INSERT INTO product_batches
      (tenant_id,organization_id,product_id,lot_number,manufactured_at,expires_at,purchase_price_minor,currency)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(tenant_id,organization_id,product_id,lot_number) DO UPDATE SET
      manufactured_at=COALESCE(product_batches.manufactured_at,EXCLUDED.manufactured_at),expires_at=COALESCE(product_batches.expires_at,EXCLUDED.expires_at),
      purchase_price_minor=COALESCE(EXCLUDED.purchase_price_minor,product_batches.purchase_price_minor)
      RETURNING id`,[auth.tenantId,organizationId,item.productId,item.lotNumber,item.manufacturedAt ?? null,item.expiresAt ?? null,
      item.purchasePriceMinor ?? null,item.currency])).rows[0]!.id;}
  private async document(client:PoolClient,auth:AuthContext,organizationId:string,type:string,source:string|null,destination:string|null,
    reference:string|null,notes:string|null,occurredAt=new Date().toISOString()){
    return (await client.query<{id:string}>(`INSERT INTO stock_documents(tenant_id,organization_id,document_type,status,source_warehouse_id,
      destination_warehouse_id,reference,notes,occurred_at,posted_at,posted_by,created_by) VALUES($1,$2,$3,'posted',$4,$5,$6,$7,$8,now(),$9,$9)
      RETURNING id`,[auth.tenantId,organizationId,type,source,destination,reference,notes,occurredAt,auth.userId])).rows[0]!;}
  private async line(client:PoolClient,auth:AuthContext,organizationId:string,documentId:string,productId:string,batchId:string|null,quantity:number){
    return (await client.query<{id:string}>(`INSERT INTO stock_document_lines(tenant_id,organization_id,document_id,product_id,batch_id,
      requested_quantity) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,[auth.tenantId,organizationId,documentId,productId,batchId,quantity])).rows[0]!.id;}
  private async movement(client:PoolClient,auth:AuthContext,warehouse:WarehouseRow,documentId:string,lineId:string,productId:string,
    batchId:string|null,delta:number,occurredAt=new Date().toISOString()){await client.query(`INSERT INTO stock_movements
      (tenant_id,organization_id,warehouse_id,product_id,batch_id,document_id,document_line_id,quantity_delta,occurred_at,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[auth.tenantId,warehouse.organizationId,warehouse.id,productId,batchId,documentId,lineId,delta,occurredAt,auth.userId]);}
  private async consume(client:PoolClient,auth:AuthContext,warehouse:WarehouseRow,documentId:string,items:Array<{productId:string;quantity:number}>){
    for(const item of items){await this.product(client,warehouse.organizationId,item.productId);
      for(const allocation of await this.allocate(client,warehouse.id,item.productId,item.quantity)){
        const lineId=await this.line(client,auth,warehouse.organizationId,documentId,item.productId,allocation.batchId,allocation.quantity);
        await this.movement(client,auth,warehouse,documentId,lineId,item.productId,allocation.batchId,-allocation.quantity);}}}
  private async allocate(client:PoolClient,warehouseId:string,productId:string,quantity:number):Promise<Allocation[]>{await this.lockStock(client,warehouseId,productId);
    const rows=(await client.query<{batchId:string|null;quantity:string}>(`SELECT m.batch_id AS "batchId",sum(m.quantity_delta)::text AS quantity
      FROM stock_movements m LEFT JOIN product_batches b ON b.id=m.batch_id WHERE m.warehouse_id=$1 AND m.product_id=$2
      GROUP BY m.batch_id,b.expires_at,b.manufactured_at HAVING sum(m.quantity_delta)>0
      ORDER BY b.expires_at ASC NULLS LAST,b.manufactured_at ASC NULLS LAST,m.batch_id NULLS LAST`,[warehouseId,productId])).rows;
    let remaining=quantity;const result:Allocation[]=[];for(const row of rows){const take=Math.min(remaining,Number(row.quantity));if(take>0)result.push({batchId:row.batchId,quantity:round(take)});
      remaining=round(remaining-take);if(remaining<=0)break;}if(remaining>0)throw conflict("INSUFFICIENT_STOCK","Insufficient stock",{productId,requested:quantity,available:round(quantity-remaining)});return result;}
  private lockStock(client:PoolClient,warehouseId:string,productId:string){return client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`${warehouseId}:${productId}`]);}
  private async balance(client:PoolClient,warehouseId:string,productId:string,batchId:string|null){const row=(await client.query<{quantity:string}>(`SELECT
    COALESCE(sum(quantity_delta),0)::text AS quantity FROM stock_movements WHERE warehouse_id=$1 AND product_id=$2 AND batch_id IS NOT DISTINCT FROM $3`,
    [warehouseId,productId,batchId])).rows[0]!;return Number(row.quantity);}
  private async record(client:PoolClient,auth:AuthContext,action:string,eventType:string,entityType:string,id:string,after:unknown,
    organizationId:string,reason?:string){await this.audit.append(client,{tenantId:auth.tenantId,actorUserId:auth.userId,action,entityType,entityId:id,after,
      ...(reason?{reason}:{}),requestId:auth.requestId});await this.outbox.append(client,{tenantId:auth.tenantId,aggregateType:entityType,
      aggregateId:id,eventType,payload:{[`${entityType.replaceAll("_","")}Id`]:id,organizationId},requestId:auth.requestId});}
}

function combine(items:Array<{productId:string;quantity:number}>){const values=new Map<string,number>();for(const item of items)
  values.set(item.productId,round((values.get(item.productId) ?? 0)+item.quantity));return [...values].map(([productId,quantity])=>({productId,quantity}));}
function round(value:number){return Math.round((value+Number.EPSILON)*1_000_000)/1_000_000;}
function numbers<T extends Record<string,unknown>>(row:T):T{for(const [key,value] of Object.entries(row))if(typeof value==="string" &&
  ["quantity","minimumStock","plannedQuantity","actualQuantity"].includes(key))(row as Record<string,unknown>)[key]=Number(value);return row;}
function deepNumbers<T>(value:T):T{if(Array.isArray(value))return value.map(deepNumbers) as T;if(value && typeof value==="object"){
  const result={...(value as Record<string,unknown>)};for(const [key,item] of Object.entries(result))result[key]=typeof item==="string" &&
    ["quantity","minimumStock","plannedQuantity","actualQuantity"].includes(key)?Number(item):deepNumbers(item);return result as T;}return value;}
function bad(code:string,message:string,details:Record<string,unknown>={}){return new ApiException(HttpStatus.BAD_REQUEST,code,message,details);}
function conflict(code:string,message:string,details:Record<string,unknown>={}){return new ApiException(HttpStatus.CONFLICT,code,message,details);}
function notFound(code:string,message:string){return new ApiException(HttpStatus.NOT_FOUND,code,message);}
