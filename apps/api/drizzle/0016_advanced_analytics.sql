-- Phase 11: campaign spend and explicit patient attribution for reproducible ROAS.

CREATE TABLE marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),organization_id uuid NOT NULL,
  source_id uuid,channel_id uuid,code varchar(32) NOT NULL,name varchar(180) NOT NULL,currency char(3) NOT NULL DEFAULT 'KZT',
  starts_on date NOT NULL,ends_on date,active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id),updated_at timestamptz NOT NULL DEFAULT now(),updated_by uuid REFERENCES users(id),
  UNIQUE(tenant_id,organization_id,id),UNIQUE(tenant_id,organization_id,code),
  FOREIGN KEY(tenant_id,organization_id) REFERENCES organizations(tenant_id,id),
  FOREIGN KEY(tenant_id,organization_id,source_id) REFERENCES lead_sources(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,organization_id,channel_id) REFERENCES lead_channels(tenant_id,organization_id,id),
  CHECK(ends_on IS NULL OR ends_on>=starts_on)
);

CREATE TABLE marketing_spend_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),organization_id uuid NOT NULL,
  campaign_id uuid NOT NULL,branch_id uuid,occurred_on date NOT NULL,amount_minor bigint NOT NULL CHECK(amount_minor>0),
  currency char(3) NOT NULL,reference varchar(255),idempotency_key varchar(128) NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES users(id),UNIQUE(tenant_id,id),UNIQUE(tenant_id,organization_id,idempotency_key),
  FOREIGN KEY(tenant_id,organization_id,campaign_id) REFERENCES marketing_campaigns(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,organization_id,branch_id) REFERENCES branches(tenant_id,organization_id,id)
);

CREATE TABLE marketing_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),organization_id uuid NOT NULL,
  campaign_id uuid NOT NULL,lead_id uuid,patient_id uuid NOT NULL,branch_id uuid,
  attribution_model varchar(24) NOT NULL CHECK(attribution_model IN ('first_touch','last_touch')),
  attributed_at timestamptz NOT NULL DEFAULT now(),created_at timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL REFERENCES users(id),
  UNIQUE(tenant_id,id),UNIQUE(tenant_id,organization_id,patient_id,attribution_model),
  FOREIGN KEY(tenant_id,organization_id,campaign_id) REFERENCES marketing_campaigns(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,organization_id,lead_id) REFERENCES leads(tenant_id,organization_id,id),
  FOREIGN KEY(tenant_id,patient_id) REFERENCES patients(tenant_id,id),
  FOREIGN KEY(tenant_id,organization_id,branch_id) REFERENCES branches(tenant_id,organization_id,id)
);

CREATE INDEX marketing_spend_range_idx ON marketing_spend_entries(tenant_id,organization_id,occurred_on,campaign_id);
CREATE INDEX marketing_attribution_patient_idx ON marketing_attributions(tenant_id,organization_id,patient_id,attributed_at);
CREATE INDEX treatment_plan_presentations_range_idx ON treatment_plan_presentations(tenant_id,presented_at,treatment_plan_id);
CREATE INDEX appointments_chair_analytics_idx ON appointments(tenant_id,branch_id,chair_id,starts_at) WHERE chair_id IS NOT NULL;
CREATE INDEX charges_analytics_idx ON charges(tenant_id,branch_id,posted_at,currency);
CREATE INDEX stock_movements_analytics_idx ON stock_movements(tenant_id,organization_id,occurred_at,product_id);

CREATE TRIGGER marketing_spend_immutable BEFORE UPDATE OR DELETE ON marketing_spend_entries
  FOR EACH ROW EXECUTE FUNCTION reject_posted_finance_change();
CREATE TRIGGER marketing_attributions_immutable BEFORE UPDATE OR DELETE ON marketing_attributions
  FOR EACH ROW EXECUTE FUNCTION reject_immutable_history_change();

DO $$ DECLARE table_name text;BEGIN
  FOREACH table_name IN ARRAY ARRAY['marketing_campaigns','marketing_spend_entries','marketing_attributions'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id=NULLIF(current_setting(''app.tenant_id'',true),'''')::uuid)',table_name);
  END LOOP;
END $$;

INSERT INTO permissions(key,description) VALUES
  ('analytics.read','Read operational analytics'),
  ('analytics.financial.read','Read revenue, margin, marketing spend, and ROAS analytics'),
  ('analytics.marketing.manage','Manage marketing campaigns, spend, and attribution')
ON CONFLICT(key) DO NOTHING;

GRANT SELECT,INSERT,UPDATE ON marketing_campaigns TO dental_app;
GRANT SELECT,INSERT ON marketing_spend_entries,marketing_attributions TO dental_app;
