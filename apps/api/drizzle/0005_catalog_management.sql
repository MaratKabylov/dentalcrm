ALTER TABLE rooms ADD COLUMN archived_by uuid REFERENCES users(id);
ALTER TABLE chairs ADD COLUMN archived_by uuid REFERENCES users(id);

ALTER TABLE service_categories
  ADD COLUMN created_by uuid REFERENCES users(id),
  ADD COLUMN updated_by uuid REFERENCES users(id),
  ADD COLUMN archived_by uuid REFERENCES users(id);

ALTER TABLE diagnoses
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN updated_by uuid REFERENCES users(id),
  ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0);

CREATE INDEX branches_active_name_idx ON branches (tenant_id,name) WHERE archived_at IS NULL;
CREATE INDEX service_categories_active_name_idx ON service_categories (tenant_id,name) WHERE archived_at IS NULL;
CREATE INDEX diagnoses_active_code_idx ON diagnoses (tenant_id,code) WHERE active;
