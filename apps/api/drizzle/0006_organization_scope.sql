-- Organization-owned catalogs and explicit membership scopes.
-- tenant_id remains the SaaS/RLS boundary; organization_id owns reusable business catalogs.

CREATE TABLE access_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  membership_id uuid NOT NULL,
  scope_type varchar(24) NOT NULL CHECK (scope_type IN ('tenant','organization','branch')),
  organization_id uuid,
  branch_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id),
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,membership_id) REFERENCES memberships(tenant_id,id),
  FOREIGN KEY (tenant_id,organization_id) REFERENCES organizations(tenant_id,id),
  FOREIGN KEY (tenant_id,branch_id) REFERENCES branches(tenant_id,id),
  CHECK (
    (scope_type='tenant' AND organization_id IS NULL AND branch_id IS NULL) OR
    (scope_type='organization' AND organization_id IS NOT NULL AND branch_id IS NULL) OR
    (scope_type='branch' AND organization_id IS NULL AND branch_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX access_scopes_tenant_membership_tenant_unique
  ON access_scopes(tenant_id,membership_id) WHERE scope_type='tenant';
CREATE UNIQUE INDEX access_scopes_tenant_membership_org_unique
  ON access_scopes(tenant_id,membership_id,organization_id) WHERE scope_type='organization';
CREATE UNIQUE INDEX access_scopes_tenant_membership_branch_unique
  ON access_scopes(tenant_id,membership_id,branch_id) WHERE scope_type='branch';
CREATE INDEX access_scopes_membership_idx ON access_scopes(tenant_id,membership_id);

ALTER TABLE access_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_scopes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON access_scopes
  USING (tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id=NULLIF(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE,DELETE ON access_scopes TO dental_app;

-- Existing owners retain tenant-wide access after the fail-closed scope model is enabled.
INSERT INTO access_scopes (tenant_id,membership_id,scope_type,created_by)
SELECT DISTINCT mr.tenant_id,mr.membership_id,'tenant',mr.created_by
FROM membership_roles mr
JOIN roles r ON r.tenant_id=mr.tenant_id AND r.id=mr.role_id
WHERE r.key='owner'
ON CONFLICT DO NOTHING;

-- Make the migration robust for old development tenants that have catalog data but no organization.
INSERT INTO organizations (tenant_id,code,name)
SELECT t.id,'default','Default organization'
FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM organizations o WHERE o.tenant_id=t.id)
  AND EXISTS (
    SELECT 1 FROM service_categories c WHERE c.tenant_id=t.id
    UNION ALL SELECT 1 FROM services s WHERE s.tenant_id=t.id
    UNION ALL SELECT 1 FROM price_lists p WHERE p.tenant_id=t.id
    UNION ALL SELECT 1 FROM diagnoses d WHERE d.tenant_id=t.id
    UNION ALL SELECT 1 FROM expense_categories e WHERE e.tenant_id=t.id
  )
ON CONFLICT (tenant_id,code) DO NOTHING;

ALTER TABLE service_categories ADD COLUMN organization_id uuid;
ALTER TABLE services ADD COLUMN organization_id uuid;
ALTER TABLE price_lists ADD COLUMN organization_id uuid;
ALTER TABLE price_list_items ADD COLUMN organization_id uuid;
ALTER TABLE diagnoses ADD COLUMN organization_id uuid;
ALTER TABLE expense_categories ADD COLUMN organization_id uuid;
ALTER TABLE treatment_plans ADD COLUMN organization_id uuid;
ALTER TABLE treatment_plan_items ADD COLUMN organization_id uuid;

UPDATE service_categories c SET organization_id=(
  SELECT o.id FROM organizations o WHERE o.tenant_id=c.tenant_id ORDER BY o.created_at,o.id LIMIT 1
);
UPDATE services s SET organization_id=COALESCE(
  (SELECT c.organization_id FROM service_categories c WHERE c.tenant_id=s.tenant_id AND c.id=s.category_id),
  (SELECT o.id FROM organizations o WHERE o.tenant_id=s.tenant_id ORDER BY o.created_at,o.id LIMIT 1)
);
UPDATE price_lists p SET organization_id=COALESCE(
  (SELECT b.organization_id FROM branches b WHERE b.tenant_id=p.tenant_id AND b.id=p.branch_id),
  (SELECT o.id FROM organizations o WHERE o.tenant_id=p.tenant_id ORDER BY o.created_at,o.id LIMIT 1)
);
UPDATE price_list_items i SET organization_id=(
  SELECT p.organization_id FROM price_lists p WHERE p.tenant_id=i.tenant_id AND p.id=i.price_list_id
);
UPDATE diagnoses d SET organization_id=(
  SELECT o.id FROM organizations o WHERE o.tenant_id=d.tenant_id ORDER BY o.created_at,o.id LIMIT 1
);
UPDATE expense_categories e SET organization_id=(
  SELECT o.id FROM organizations o WHERE o.tenant_id=e.tenant_id ORDER BY o.created_at,o.id LIMIT 1
);
UPDATE treatment_plan_items i SET organization_id=(
  SELECT s.organization_id FROM services s WHERE s.tenant_id=i.tenant_id AND s.id=i.service_id
);
UPDATE treatment_plans p SET organization_id=COALESCE(
  (SELECT i.organization_id FROM treatment_plan_items i WHERE i.tenant_id=p.tenant_id AND i.treatment_plan_id=p.id ORDER BY i.position LIMIT 1),
  (SELECT o.id FROM organizations o WHERE o.tenant_id=p.tenant_id ORDER BY o.created_at,o.id LIMIT 1)
);

ALTER TABLE service_categories ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE services ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE price_lists ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE price_list_items ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE diagnoses ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE expense_categories ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE treatment_plans ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE treatment_plan_items ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE branches ADD CONSTRAINT branches_tenant_org_id_unique UNIQUE (tenant_id,organization_id,id);
ALTER TABLE service_categories DROP CONSTRAINT service_categories_tenant_id_code_key;
ALTER TABLE services DROP CONSTRAINT services_tenant_id_code_key;
ALTER TABLE diagnoses DROP CONSTRAINT diagnoses_tenant_id_code_key;
ALTER TABLE expense_categories DROP CONSTRAINT expense_categories_tenant_id_code_currency_key;

ALTER TABLE service_categories
  ADD CONSTRAINT service_categories_tenant_org_id_unique UNIQUE (tenant_id,organization_id,id),
  ADD CONSTRAINT service_categories_tenant_org_code_unique UNIQUE (tenant_id,organization_id,code),
  ADD CONSTRAINT service_categories_tenant_org_fk FOREIGN KEY (tenant_id,organization_id) REFERENCES organizations(tenant_id,id),
  ADD CONSTRAINT service_categories_parent_org_fk FOREIGN KEY (tenant_id,organization_id,parent_id)
    REFERENCES service_categories(tenant_id,organization_id,id);

ALTER TABLE services
  ADD CONSTRAINT services_tenant_org_id_unique UNIQUE (tenant_id,organization_id,id),
  ADD CONSTRAINT services_tenant_org_code_unique UNIQUE (tenant_id,organization_id,code),
  ADD CONSTRAINT services_tenant_org_fk FOREIGN KEY (tenant_id,organization_id) REFERENCES organizations(tenant_id,id),
  ADD CONSTRAINT services_category_org_fk FOREIGN KEY (tenant_id,organization_id,category_id)
    REFERENCES service_categories(tenant_id,organization_id,id);

ALTER TABLE price_lists
  ADD CONSTRAINT price_lists_tenant_org_id_unique UNIQUE (tenant_id,organization_id,id),
  ADD CONSTRAINT price_lists_tenant_org_fk FOREIGN KEY (tenant_id,organization_id) REFERENCES organizations(tenant_id,id),
  ADD CONSTRAINT price_lists_branch_org_fk FOREIGN KEY (tenant_id,organization_id,branch_id)
    REFERENCES branches(tenant_id,organization_id,id);

ALTER TABLE price_list_items
  ADD CONSTRAINT price_list_items_price_list_org_fk FOREIGN KEY (tenant_id,organization_id,price_list_id)
    REFERENCES price_lists(tenant_id,organization_id,id),
  ADD CONSTRAINT price_list_items_service_org_fk FOREIGN KEY (tenant_id,organization_id,service_id)
    REFERENCES services(tenant_id,organization_id,id);

ALTER TABLE diagnoses
  ADD CONSTRAINT diagnoses_tenant_org_id_unique UNIQUE (tenant_id,organization_id,id),
  ADD CONSTRAINT diagnoses_tenant_org_code_unique UNIQUE (tenant_id,organization_id,code),
  ADD CONSTRAINT diagnoses_tenant_org_fk FOREIGN KEY (tenant_id,organization_id) REFERENCES organizations(tenant_id,id);

ALTER TABLE expense_categories
  ADD CONSTRAINT expense_categories_tenant_org_id_unique UNIQUE (tenant_id,organization_id,id),
  ADD CONSTRAINT expense_categories_tenant_org_code_currency_unique UNIQUE (tenant_id,organization_id,code,currency),
  ADD CONSTRAINT expense_categories_tenant_org_fk FOREIGN KEY (tenant_id,organization_id) REFERENCES organizations(tenant_id,id);

ALTER TABLE treatment_plans
  ADD CONSTRAINT treatment_plans_tenant_org_id_unique UNIQUE (tenant_id,organization_id,id),
  ADD CONSTRAINT treatment_plans_tenant_org_fk FOREIGN KEY (tenant_id,organization_id) REFERENCES organizations(tenant_id,id);

ALTER TABLE treatment_plan_items
  ADD CONSTRAINT treatment_plan_items_plan_org_fk FOREIGN KEY (tenant_id,organization_id,treatment_plan_id)
    REFERENCES treatment_plans(tenant_id,organization_id,id),
  ADD CONSTRAINT treatment_plan_items_service_org_fk FOREIGN KEY (tenant_id,organization_id,service_id)
    REFERENCES services(tenant_id,organization_id,id);

CREATE INDEX service_categories_tenant_org_active_idx ON service_categories(tenant_id,organization_id,name) WHERE archived_at IS NULL;
CREATE INDEX services_tenant_org_active_idx ON services(tenant_id,organization_id,name) WHERE active;
CREATE INDEX price_lists_tenant_org_active_idx ON price_lists(tenant_id,organization_id,valid_from DESC) WHERE active;
CREATE INDEX diagnoses_tenant_org_active_idx ON diagnoses(tenant_id,organization_id,code) WHERE active;
CREATE INDEX expense_categories_tenant_org_active_idx ON expense_categories(tenant_id,organization_id,name) WHERE archived_at IS NULL;
