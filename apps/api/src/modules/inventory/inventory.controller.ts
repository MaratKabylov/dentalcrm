import {
  confirmMaterialConsumptionSchema, createProductCategorySchema, createProductSchema, createStocktakeSchema,
  createSupplierSchema, createUnitOfMeasureSchema, createWarehouseSchema, receiveStockSchema, transferStockSchema,
  upsertServiceRecipeSchema, uuidSchema, writeoffStockSchema
} from "@dental/contracts";
import { Body, Controller, Get, HttpStatus, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { parseSchema } from "../../common/http/parse-schema.js";
import { ApiException } from "../../common/http/api.exception.js";
import type { AuthContext } from "../identity/auth-context.js";
import { CurrentAuth } from "../identity/current-auth.decorator.js";
import { RequirePermissions } from "../identity/permissions.decorator.js";
import { InventoryService } from "./inventory.service.js";

@ApiTags("inventory") @ApiBearerAuth() @Controller()
export class InventoryController {
  constructor(private readonly inventory:InventoryService) {}

  @Get("inventory/units") @RequirePermissions("inventory.read") units(@CurrentAuth() auth:AuthContext){return this.inventory.listUnits(auth);}
  @Post("inventory/units") @RequirePermissions("inventory.adjust") createUnit(@CurrentAuth() auth:AuthContext,@Body() body:unknown){
    return this.inventory.createUnit(auth,parseSchema(createUnitOfMeasureSchema,body));}
  @Get("inventory/categories") @RequirePermissions("inventory.read") categories(@CurrentAuth() auth:AuthContext){return this.inventory.listCategories(auth);}
  @Post("inventory/categories") @RequirePermissions("inventory.adjust") createCategory(@CurrentAuth() auth:AuthContext,@Body() body:unknown){
    return this.inventory.createCategory(auth,parseSchema(createProductCategorySchema,body));}
  @Get("inventory/suppliers") @RequirePermissions("inventory.read") suppliers(@CurrentAuth() auth:AuthContext){return this.inventory.listSuppliers(auth);}
  @Post("inventory/suppliers") @RequirePermissions("inventory.adjust") createSupplier(@CurrentAuth() auth:AuthContext,@Body() body:unknown){
    return this.inventory.createSupplier(auth,parseSchema(createSupplierSchema,body));}
  @Get("inventory/products") @RequirePermissions("inventory.read") products(@CurrentAuth() auth:AuthContext){return this.inventory.listProducts(auth);}
  @Post("inventory/products") @RequirePermissions("inventory.adjust") createProduct(@CurrentAuth() auth:AuthContext,@Body() body:unknown){
    return this.inventory.createProduct(auth,parseSchema(createProductSchema,body));}
  @Get("inventory/warehouses") @RequirePermissions("inventory.read") warehouses(@CurrentAuth() auth:AuthContext){return this.inventory.listWarehouses(auth);}
  @Post("inventory/warehouses") @RequirePermissions("inventory.adjust") createWarehouse(@CurrentAuth() auth:AuthContext,@Body() body:unknown){
    return this.inventory.createWarehouse(auth,parseSchema(createWarehouseSchema,body));}
  @Get("inventory/stock") @RequirePermissions("inventory.read") stock(@CurrentAuth() auth:AuthContext,@Query("warehouseId") warehouseId?:string,
    @Query("productId") productId?:string){return this.inventory.stock(auth,warehouseId?parseSchema(uuidSchema,warehouseId):undefined,
      productId?parseSchema(uuidSchema,productId):undefined);}
  @Get("inventory/alerts") @RequirePermissions("inventory.read") alerts(@CurrentAuth() auth:AuthContext,@Query("days") rawDays?:string){
    const days=rawDays===undefined?30:Number(rawDays);if(!Number.isInteger(days)||days<0||days>3650)
      throw new ApiException(HttpStatus.BAD_REQUEST,"INVALID_ALERT_HORIZON","days must be an integer from 0 to 3650");
    return this.inventory.alerts(auth,days);}

  @Post("stock/receipts") @RequirePermissions("inventory.receive") receive(@CurrentAuth() auth:AuthContext,@Body() body:unknown){
    return this.inventory.receive(auth,parseSchema(receiveStockSchema,body));}
  @Post("stock/transfers") @RequirePermissions("inventory.transfer") transfer(@CurrentAuth() auth:AuthContext,@Body() body:unknown){
    return this.inventory.transfer(auth,parseSchema(transferStockSchema,body));}
  @Post("stock/writeoffs") @RequirePermissions("inventory.writeoff") writeoff(@CurrentAuth() auth:AuthContext,@Body() body:unknown){
    return this.inventory.writeoff(auth,parseSchema(writeoffStockSchema,body));}
  @Post("stocktakes") @RequirePermissions("inventory.adjust") stocktake(@CurrentAuth() auth:AuthContext,@Body() body:unknown){
    return this.inventory.stocktake(auth,parseSchema(createStocktakeSchema,body));}

  @Get("inventory/recipes") @RequirePermissions("inventory.read") recipes(@CurrentAuth() auth:AuthContext){return this.inventory.recipes(auth);}
  @Post("inventory/recipes") @RequirePermissions("inventory.adjust") upsertRecipe(@CurrentAuth() auth:AuthContext,@Body() body:unknown){
    return this.inventory.upsertRecipe(auth,parseSchema(upsertServiceRecipeSchema,body));}
  @Get("inventory/consumptions") @RequirePermissions("inventory.read") consumptions(@CurrentAuth() auth:AuthContext){return this.inventory.consumptions(auth);}
  @Post("inventory/consumptions/:id/confirm") @RequirePermissions("inventory.writeoff") confirmConsumption(@CurrentAuth() auth:AuthContext,
    @Param("id") id:string,@Body() body:unknown){return this.inventory.confirmConsumption(auth,parseSchema(uuidSchema,id),
      parseSchema(confirmMaterialConsumptionSchema,body));}
}
