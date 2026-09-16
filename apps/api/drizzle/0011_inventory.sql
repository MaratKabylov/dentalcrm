-- Phase 6: append-only inventory ledger, FEFO allocation, recipes, and material consumption.

CREATE TABLE units_of_measure (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  code varchar(32) NOT NULL, name varchar(120) NOT NULL, symbol varchar(16) NOT NULL,
  decimal_places smallint NOT NULL DEFAULT 3 CHECK(decimal_places BETWEEN 0 AND 6),
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  archived_at timestamptz, UNIQUE(tenant_id,organization_id,id), UNIQUE(tenant_id,organization_id,code),
  FOREIGN KEY(tenant_id,organization_id) REFERENCES organizations(tenant_id,id)
);

CREATE TABLE product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  code varchar(32) NOT NULL, name varchar(160) NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id), archived_at timestamptz,
  UNIQUE(tenant_id,organization_id,id), UNIQUE(tenant_id,organization_id,code),
  FOREIGN KEY(tenant_id,organization_id) REFERENCES organizations(tenant_id,id)
);

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  category_id uuid, unit_id uuid NOT NULL, sku varchar(64) NOT NULL, name varchar(180) NOT NULL,
  track_batches boolean NOT NULL DEFAULT true, minimum_stock numeric(18,6) NOT NULL DEFAULT 0 CHECK(minimum_stock>=0),
  active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid REFERENCES users(id), version integer NOT NULL DEFAULT 1 CHECK(version>0),
  archived_at timestamptz, UNIQUE(tenant_id,organization_id,id), UNIQUE(tenant_id,organization_id,sku),
  FOREIGN KEY(tenant_id,organization_id) REFERENCES organizations(tenant_id,id),
  FOREIGN KEY(tenant_id,organization_id,category_id) REFERENCES product_categories(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,organization_id,unit_id) REFERENCES units_of_measure(tenant_id,organization_id,id)
);

CREATE TABLE product_barcodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  product_id uuid NOT NULL, barcode varchar(64) NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id), UNIQUE(tenant_id,barcode),
  FOREIGN KEY(tenant_id,organization_id,product_id) REFERENCES products(tenant_id,organization_id,id)
);

CREATE TABLE warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  branch_id uuid, code varchar(32) NOT NULL, name varchar(160) NOT NULL, active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid REFERENCES users(id), version integer NOT NULL DEFAULT 1 CHECK(version>0),
  archived_at timestamptz, UNIQUE(tenant_id,organization_id,id), UNIQUE(tenant_id,organization_id,code),
  FOREIGN KEY(tenant_id,organization_id) REFERENCES organizations(tenant_id,id),
  FOREIGN KEY(tenant_id,organization_id,branch_id) REFERENCES branches(tenant_id,organization_id,id)
);

CREATE TABLE warehouse_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  warehouse_id uuid NOT NULL, code varchar(32) NOT NULL, name varchar(120) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), archived_at timestamptz,
  UNIQUE(tenant_id,id), UNIQUE(tenant_id,warehouse_id,code),
  FOREIGN KEY(tenant_id,organization_id,warehouse_id) REFERENCES warehouses(tenant_id,organization_id,id)
);

CREATE TABLE suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  code varchar(32) NOT NULL, name varchar(180) NOT NULL, phone varchar(32), email varchar(320),
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id), archived_at timestamptz,
  UNIQUE(tenant_id,organization_id,id), UNIQUE(tenant_id,organization_id,code),
  FOREIGN KEY(tenant_id,organization_id) REFERENCES organizations(tenant_id,id)
);

CREATE TABLE product_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  product_id uuid NOT NULL, lot_number varchar(120) NOT NULL, manufactured_at date, expires_at date,
  purchase_price_minor bigint CHECK(purchase_price_minor IS NULL OR purchase_price_minor>=0), currency char(3) NOT NULL DEFAULT 'KZT',
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,organization_id,product_id,id),
  UNIQUE(tenant_id,organization_id,product_id,lot_number),
  FOREIGN KEY(tenant_id,organization_id,product_id) REFERENCES products(tenant_id,organization_id,id),
  CHECK(expires_at IS NULL OR manufactured_at IS NULL OR expires_at>=manufactured_at)
);

CREATE TABLE stock_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  document_type varchar(24) NOT NULL CHECK(document_type IN ('receipt','transfer','writeoff','stocktake','consumption')),
  status varchar(16) NOT NULL DEFAULT 'posted' CHECK(status IN ('draft','posted','cancelled')),
  source_warehouse_id uuid, destination_warehouse_id uuid, reference varchar(120), notes text,
  occurred_at timestamptz NOT NULL DEFAULT now(), posted_at timestamptz, posted_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  UNIQUE(tenant_id,organization_id,id), FOREIGN KEY(tenant_id,organization_id) REFERENCES organizations(tenant_id,id),
  FOREIGN KEY(tenant_id,organization_id,source_warehouse_id) REFERENCES warehouses(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,organization_id,destination_warehouse_id) REFERENCES warehouses(tenant_id,organization_id,id),
  CHECK((status='posted')=(posted_at IS NOT NULL)),
  CHECK(document_type<>'transfer' OR (source_warehouse_id IS NOT NULL AND destination_warehouse_id IS NOT NULL
    AND source_warehouse_id<>destination_warehouse_id))
);

CREATE TABLE stock_document_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  document_id uuid NOT NULL, product_id uuid NOT NULL, batch_id uuid, requested_quantity numeric(18,6) NOT NULL CHECK(requested_quantity>=0),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,organization_id,document_id) REFERENCES stock_documents(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,organization_id,product_id) REFERENCES products(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,organization_id,product_id,batch_id) REFERENCES product_batches(tenant_id,organization_id,product_id,id)
);

CREATE TABLE stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  warehouse_id uuid NOT NULL, location_id uuid, product_id uuid NOT NULL, batch_id uuid, document_id uuid NOT NULL,
  document_line_id uuid NOT NULL, quantity_delta numeric(18,6) NOT NULL CHECK(quantity_delta<>0),
  occurred_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,organization_id,warehouse_id) REFERENCES warehouses(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,location_id) REFERENCES warehouse_locations(tenant_id,id),
  FOREIGN KEY(tenant_id,organization_id,product_id) REFERENCES products(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,organization_id,product_id,batch_id) REFERENCES product_batches(tenant_id,organization_id,product_id,id),
  FOREIGN KEY(tenant_id,organization_id,document_id) REFERENCES stock_documents(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,document_line_id) REFERENCES stock_document_lines(tenant_id,id)
);

CREATE TABLE purchase_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  document_id uuid NOT NULL, warehouse_id uuid NOT NULL, supplier_id uuid, received_at timestamptz NOT NULL DEFAULT now(),
  reference varchar(120), UNIQUE(tenant_id,id), UNIQUE(tenant_id,document_id),
  FOREIGN KEY(tenant_id,organization_id,document_id) REFERENCES stock_documents(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,organization_id,warehouse_id) REFERENCES warehouses(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,organization_id,supplier_id) REFERENCES suppliers(tenant_id,organization_id,id)
);

CREATE TABLE purchase_receipt_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), receipt_id uuid NOT NULL,
  document_line_id uuid NOT NULL, purchase_price_minor bigint CHECK(purchase_price_minor IS NULL OR purchase_price_minor>=0),
  UNIQUE(tenant_id,id), UNIQUE(tenant_id,document_line_id), FOREIGN KEY(tenant_id,receipt_id) REFERENCES purchase_receipts(tenant_id,id),
  FOREIGN KEY(tenant_id,document_line_id) REFERENCES stock_document_lines(tenant_id,id)
);

CREATE TABLE stock_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  document_id uuid NOT NULL, source_warehouse_id uuid NOT NULL, destination_warehouse_id uuid NOT NULL,
  UNIQUE(tenant_id,id), UNIQUE(tenant_id,document_id), FOREIGN KEY(tenant_id,organization_id,document_id) REFERENCES stock_documents(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,organization_id,source_warehouse_id) REFERENCES warehouses(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,organization_id,destination_warehouse_id) REFERENCES warehouses(tenant_id,organization_id,id),
  CHECK(source_warehouse_id<>destination_warehouse_id)
);

CREATE TABLE stock_writeoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  document_id uuid NOT NULL, warehouse_id uuid NOT NULL, reason varchar(1000) NOT NULL,
  UNIQUE(tenant_id,id), UNIQUE(tenant_id,document_id), FOREIGN KEY(tenant_id,organization_id,document_id) REFERENCES stock_documents(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,organization_id,warehouse_id) REFERENCES warehouses(tenant_id,organization_id,id)
);

CREATE TABLE stocktakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  document_id uuid NOT NULL, warehouse_id uuid NOT NULL, counted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id), UNIQUE(tenant_id,document_id), FOREIGN KEY(tenant_id,organization_id,document_id) REFERENCES stock_documents(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,organization_id,warehouse_id) REFERENCES warehouses(tenant_id,organization_id,id)
);

CREATE TABLE stocktake_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  stocktake_id uuid NOT NULL,
  document_line_id uuid NOT NULL, product_id uuid NOT NULL, batch_id uuid, expected_quantity numeric(18,6) NOT NULL,
  counted_quantity numeric(18,6) NOT NULL CHECK(counted_quantity>=0), variance_quantity numeric(18,6) NOT NULL,
  UNIQUE(tenant_id,id), UNIQUE(tenant_id,stocktake_id,product_id,batch_id),
  FOREIGN KEY(tenant_id,stocktake_id) REFERENCES stocktakes(tenant_id,id),
  FOREIGN KEY(tenant_id,document_line_id) REFERENCES stock_document_lines(tenant_id,id),
  FOREIGN KEY(tenant_id,organization_id,product_id) REFERENCES products(tenant_id,organization_id,id)
);

CREATE TABLE service_material_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  service_id uuid NOT NULL, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid REFERENCES users(id), version integer NOT NULL DEFAULT 1 CHECK(version>0),
  UNIQUE(tenant_id,organization_id,id), UNIQUE(tenant_id,organization_id,service_id),
  FOREIGN KEY(tenant_id,organization_id,service_id) REFERENCES services(tenant_id,organization_id,id)
);

CREATE TABLE service_material_recipe_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  recipe_id uuid NOT NULL, product_id uuid NOT NULL, quantity numeric(18,6) NOT NULL CHECK(quantity>0),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,id), UNIQUE(tenant_id,recipe_id,product_id),
  FOREIGN KEY(tenant_id,organization_id,recipe_id) REFERENCES service_material_recipes(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,organization_id,product_id) REFERENCES products(tenant_id,organization_id,id)
);

CREATE TABLE material_consumptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  procedure_id uuid NOT NULL, warehouse_id uuid, status varchar(16) NOT NULL DEFAULT 'planned'
    CHECK(status IN ('planned','confirmed','cancelled')), document_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(), confirmed_at timestamptz, confirmed_by uuid REFERENCES users(id),
  UNIQUE(tenant_id,organization_id,id), UNIQUE(tenant_id,procedure_id),
  FOREIGN KEY(tenant_id,procedure_id) REFERENCES procedures(tenant_id,id),
  FOREIGN KEY(tenant_id,organization_id,warehouse_id) REFERENCES warehouses(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,organization_id,document_id) REFERENCES stock_documents(tenant_id,organization_id,id),
  CHECK((status='confirmed')=(confirmed_at IS NOT NULL AND document_id IS NOT NULL AND warehouse_id IS NOT NULL))
);

CREATE TABLE material_consumption_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  consumption_id uuid NOT NULL, product_id uuid NOT NULL, planned_quantity numeric(18,6) NOT NULL CHECK(planned_quantity>0),
  actual_quantity numeric(18,6) CHECK(actual_quantity IS NULL OR actual_quantity>0), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,id), UNIQUE(tenant_id,consumption_id,product_id),
  FOREIGN KEY(tenant_id,organization_id,consumption_id) REFERENCES material_consumptions(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,organization_id,product_id) REFERENCES products(tenant_id,organization_id,id)
);

CREATE TABLE stock_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), organization_id uuid NOT NULL,
  warehouse_id uuid NOT NULL, product_id uuid NOT NULL, batch_id uuid, alert_type varchar(24) NOT NULL
    CHECK(alert_type IN ('expiring','expired','low_stock')), status varchar(16) NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),
  due_on date, created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz, UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,organization_id,warehouse_id) REFERENCES warehouses(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,organization_id,product_id) REFERENCES products(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,organization_id,product_id,batch_id) REFERENCES product_batches(tenant_id,organization_id,product_id,id)
);

CREATE INDEX stock_movements_balance_idx ON stock_movements(tenant_id,warehouse_id,product_id,batch_id);
CREATE INDEX product_batches_fefo_idx ON product_batches(tenant_id,product_id,expires_at,id);
CREATE INDEX stock_alerts_open_idx ON stock_alerts(tenant_id,organization_id,due_on) WHERE status='open';
CREATE INDEX material_consumptions_status_idx ON material_consumptions(tenant_id,organization_id,status,created_at);

CREATE FUNCTION reject_stock_movement_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'stock movements are immutable' USING ERRCODE='55000'; END $$;
CREATE TRIGGER stock_movements_immutable BEFORE UPDATE OR DELETE ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION reject_stock_movement_mutation();

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['units_of_measure','product_categories','products','product_barcodes','warehouses',
    'warehouse_locations','suppliers','product_batches','stock_documents','stock_document_lines','stock_movements',
    'purchase_receipts','purchase_receipt_lines','stock_transfers','stock_writeoffs','stocktakes','stocktake_lines',
    'service_material_recipes','service_material_recipe_items','material_consumptions','material_consumption_lines','stock_alerts'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid)',table_name);
  END LOOP;
END $$;

INSERT INTO permissions(key,description) VALUES
  ('inventory.read','Read products, warehouses, balances, and alerts'),
  ('inventory.receive','Post purchase receipts'),('inventory.transfer','Transfer stock between warehouses'),
  ('inventory.writeoff','Write off stock and confirm material consumption'),
  ('inventory.adjust','Post stocktakes and manage inventory catalog and recipes')
ON CONFLICT(key) DO NOTHING;

GRANT SELECT,INSERT,UPDATE ON units_of_measure,product_categories,products,product_barcodes,warehouses,warehouse_locations,
  suppliers,product_batches,stock_documents,stock_document_lines,purchase_receipts,purchase_receipt_lines,stock_transfers,
  stock_writeoffs,stocktakes,stocktake_lines,service_material_recipes,service_material_recipe_items,material_consumptions,
  material_consumption_lines,stock_alerts TO dental_app;
GRANT SELECT,INSERT ON stock_movements TO dental_app;
GRANT DELETE ON service_material_recipe_items TO dental_app;
