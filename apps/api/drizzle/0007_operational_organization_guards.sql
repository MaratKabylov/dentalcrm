-- A chair may only reference a room from its own branch.
ALTER TABLE rooms ADD CONSTRAINT rooms_tenant_branch_id_unique UNIQUE (tenant_id,branch_id,id);
ALTER TABLE chairs ADD CONSTRAINT chairs_room_branch_fk FOREIGN KEY (tenant_id,branch_id,room_id)
  REFERENCES rooms(tenant_id,branch_id,id);
