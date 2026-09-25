export type InventoryCategory = { id: string; name: string; isActive: boolean };
export type InventoryBranch = { id: string; name: string };
export type Warehouse = { id: string; branchId: string; branchName: string; name: string; isActive: boolean };
export type InventoryItem = { id: string; categoryId: string; sku: string; name: string; unit: string; minStock: number; isActive: boolean };

export type InventoryReferenceData = {
  categories: InventoryCategory[];
  branches: InventoryBranch[];
  warehouses: Warehouse[];
  items: InventoryItem[];
};

export type InventoryBalance = {
  warehouseId: string;
  warehouseName: string;
  branchName: string;
  itemId: string;
  sku: string;
  itemName: string;
  categoryName: string;
  unit: string;
  minStock: number;
  quantity: number;
  stockValue: number;
  nextExpirationDate: string | null;
};

export type StockBatch = {
  id: string;
  warehouseId: string;
  warehouseName: string;
  itemId: string;
  sku: string;
  itemName: string;
  unit: string;
  lotNumber: string | null;
  expirationDate: string | null;
  unitCost: number;
  availableQuantity: number;
  receivedAt: string;
};

export const STOCK_MOVEMENT_TYPES = ["receipt", "issue", "transfer_in", "transfer_out", "write_off", "correction", "procedure_usage"] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export type StockMovement = {
  id: string;
  movementType: StockMovementType;
  warehouseName: string;
  itemName: string;
  sku: string;
  unit: string;
  lotNumber: string | null;
  quantity: number;
  unitCost: number | null;
  note: string | null;
  createdByName: string;
  createdAt: string;
};

export type InventoryServiceOption = { id: string; code: string; name: string; isActive: boolean };

export type ServiceMaterialNorm = {
  id: string;
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  itemId: string;
  itemSku: string;
  itemName: string;
  unit: string;
  quantity: number;
  isActive: boolean;
};

export type PendingProcedureMaterialUsage = {
  performedServiceId: string;
  performedAt: string;
  patientName: string;
  serviceName: string;
  normId: string;
  itemId: string;
  itemName: string;
  itemSku: string;
  unit: string;
  suggestedQuantity: number;
  remainingQuantity: number;
};
