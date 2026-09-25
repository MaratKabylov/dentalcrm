begin;

create table public.inventory_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 2 and 160),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, name)
);

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  branch_id uuid not null,
  name text not null check (char_length(trim(name)) between 2 and 160),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint warehouses_branch_fkey foreign key (organization_id, branch_id)
    references public.branches(organization_id, id) on delete restrict,
  unique (organization_id, id),
  unique (organization_id, branch_id, name)
);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  category_id uuid not null,
  sku text not null check (char_length(trim(sku)) between 1 and 60),
  name text not null check (char_length(trim(name)) between 2 and 240),
  unit text not null check (char_length(trim(unit)) between 1 and 40),
  min_stock numeric(14,3) not null default 0 check (min_stock >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_items_category_fkey foreign key (organization_id, category_id)
    references public.inventory_categories(organization_id, id) on delete restrict,
  unique (organization_id, id),
  unique (organization_id, sku)
);

create table public.stock_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  warehouse_id uuid not null,
  inventory_item_id uuid not null,
  lot_number text check (lot_number is null or char_length(trim(lot_number)) between 1 and 120),
  expiration_date date,
  unit_cost numeric(14,4) not null check (unit_cost >= 0),
  quantity_received numeric(14,3) not null check (quantity_received > 0),
  received_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint stock_batches_warehouse_fkey foreign key (organization_id, warehouse_id)
    references public.warehouses(organization_id, id) on delete restrict,
  constraint stock_batches_item_fkey foreign key (organization_id, inventory_item_id)
    references public.inventory_items(organization_id, id) on delete restrict,
  unique (organization_id, id)
);

create table public.service_material_norms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  service_id uuid not null,
  inventory_item_id uuid not null,
  quantity numeric(14,3) not null check (quantity > 0),
  is_active boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_material_norms_service_fkey foreign key (organization_id, service_id)
    references public.services(organization_id, id) on delete restrict,
  constraint service_material_norms_item_fkey foreign key (organization_id, inventory_item_id)
    references public.inventory_items(organization_id, id) on delete restrict,
  unique (organization_id, id),
  unique (organization_id, service_id, inventory_item_id)
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  warehouse_id uuid not null,
  inventory_item_id uuid not null,
  stock_batch_id uuid not null,
  movement_type text not null check (movement_type in (
    'receipt', 'issue', 'transfer_in', 'transfer_out', 'write_off', 'correction', 'procedure_usage'
  )),
  quantity numeric(14,3) not null check (quantity <> 0),
  unit_cost numeric(14,4) check (unit_cost is null or unit_cost >= 0),
  source_type text not null check (source_type in ('manual', 'transfer', 'performed_service')),
  source_id uuid,
  service_material_norm_id uuid,
  note text check (note is null or char_length(trim(note)) between 1 and 1000),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint stock_movements_warehouse_fkey foreign key (organization_id, warehouse_id)
    references public.warehouses(organization_id, id) on delete restrict,
  constraint stock_movements_item_fkey foreign key (organization_id, inventory_item_id)
    references public.inventory_items(organization_id, id) on delete restrict,
  constraint stock_movements_batch_fkey foreign key (organization_id, stock_batch_id)
    references public.stock_batches(organization_id, id) on delete restrict,
  constraint stock_movements_norm_fkey foreign key (organization_id, service_material_norm_id)
    references public.service_material_norms(organization_id, id) on delete restrict,
  constraint stock_movements_direction_check check (
    (movement_type in ('receipt', 'transfer_in') and quantity > 0)
    or (movement_type in ('issue', 'transfer_out', 'write_off', 'procedure_usage') and quantity < 0)
    or movement_type = 'correction'
  ),
  constraint stock_movements_procedure_source_check check (
    (movement_type = 'procedure_usage' and source_type = 'performed_service' and source_id is not null and service_material_norm_id is not null)
    or (movement_type <> 'procedure_usage' and service_material_norm_id is null)
  ),
  unique (organization_id, id)
);

create index warehouses_branch_idx on public.warehouses (organization_id, branch_id, is_active);
create index inventory_items_category_idx on public.inventory_items (organization_id, category_id, is_active, name);
create index stock_batches_lookup_idx on public.stock_batches (organization_id, warehouse_id, inventory_item_id, expiration_date);
create index stock_movements_balance_idx on public.stock_movements (organization_id, warehouse_id, inventory_item_id, stock_batch_id);
create index stock_movements_created_idx on public.stock_movements (organization_id, created_at desc);
create index stock_movements_source_idx on public.stock_movements (organization_id, source_type, source_id) where source_id is not null;
create index service_material_norms_service_idx on public.service_material_norms (organization_id, service_id, is_active);
create index performed_services_material_usage_idx on public.performed_services (organization_id, service_id, performed_at desc)
  where voided_at is null;

create trigger inventory_categories_set_updated_at before update on public.inventory_categories
for each row execute function public.set_updated_at();
create trigger warehouses_set_updated_at before update on public.warehouses
for each row execute function public.set_updated_at();
create trigger inventory_items_set_updated_at before update on public.inventory_items
for each row execute function public.set_updated_at();
create trigger service_material_norms_set_updated_at before update on public.service_material_norms
for each row execute function public.set_updated_at();

alter table public.inventory_categories enable row level security;
alter table public.warehouses enable row level security;
alter table public.inventory_items enable row level security;
alter table public.stock_batches enable row level security;
alter table public.stock_movements enable row level security;
alter table public.service_material_norms enable row level security;

create policy inventory_categories_select on public.inventory_categories for select to authenticated
using (public.current_user_has_permission(organization_id, 'inventory.read'));
create policy warehouses_select on public.warehouses for select to authenticated
using (public.current_user_has_permission(organization_id, 'inventory.read'));
create policy inventory_items_select on public.inventory_items for select to authenticated
using (public.current_user_has_permission(organization_id, 'inventory.read'));
create policy stock_batches_select on public.stock_batches for select to authenticated
using (public.current_user_has_permission(organization_id, 'inventory.read'));
create policy stock_movements_select on public.stock_movements for select to authenticated
using (public.current_user_has_permission(organization_id, 'inventory.read'));
create policy service_material_norms_select on public.service_material_norms for select to authenticated
using (public.current_user_has_permission(organization_id, 'inventory.read'));

grant select on public.inventory_categories, public.warehouses, public.inventory_items,
  public.stock_batches, public.stock_movements, public.service_material_norms to authenticated;

create or replace function public.seed_branch_warehouse()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.warehouses (organization_id, branch_id, name)
  values (new.organization_id, new.id, 'Основной склад')
  on conflict (organization_id, branch_id, name) do nothing;
  return new;
end;
$$;

create trigger branches_seed_warehouse after insert on public.branches
for each row execute function public.seed_branch_warehouse();

insert into public.warehouses (organization_id, branch_id, name)
select branch.organization_id, branch.id, 'Основной склад'
from public.branches branch
on conflict (organization_id, branch_id, name) do nothing;

insert into public.inventory_categories (organization_id, name)
select organization.id, category.name
from public.organizations organization
cross join (values ('Расходные материалы'), ('Анестезия'), ('Гигиена и дезинфекция')) as category(name)
on conflict (organization_id, name) do nothing;

create or replace function public.seed_inventory_categories()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.inventory_categories (organization_id, name)
  values (new.id, 'Расходные материалы'), (new.id, 'Анестезия'), (new.id, 'Гигиена и дезинфекция')
  on conflict (organization_id, name) do nothing;
  return new;
end;
$$;

create trigger organizations_seed_inventory_categories after insert on public.organizations
for each row execute function public.seed_inventory_categories();

create or replace function public.save_inventory_category(
  org_id uuid, target_category_id uuid, category_name text
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare saved_id uuid;
begin
  if not public.current_user_has_permission(org_id, 'inventory.manage') then
    raise exception 'Inventory manage permission required' using errcode = '42501';
  end if;
  if category_name is null or char_length(trim(category_name)) not between 2 and 160 then
    raise exception 'Inventory category name is invalid';
  end if;
  if target_category_id is null then
    insert into public.inventory_categories (organization_id, name)
    values (org_id, trim(category_name)) returning id into saved_id;
  else
    update public.inventory_categories set name = trim(category_name)
    where organization_id = org_id and id = target_category_id returning id into saved_id;
    if saved_id is null then raise exception 'Inventory category not found'; end if;
  end if;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (org_id, auth.uid(), case when target_category_id is null then 'inventory_category.created' else 'inventory_category.updated' end,
    'inventory_category', saved_id, jsonb_build_object('name', trim(category_name)));
  return saved_id;
end;
$$;

create or replace function public.save_warehouse(
  org_id uuid, target_warehouse_id uuid, target_branch_id uuid, warehouse_name text
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare saved_id uuid;
begin
  if not public.current_user_has_permission(org_id, 'inventory.manage') then
    raise exception 'Inventory manage permission required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.branches where organization_id = org_id and id = target_branch_id and is_active) then
    raise exception 'Active branch not found';
  end if;
  if warehouse_name is null or char_length(trim(warehouse_name)) not between 2 and 160 then raise exception 'Warehouse name is invalid'; end if;
  if target_warehouse_id is null then
    insert into public.warehouses (organization_id, branch_id, name)
    values (org_id, target_branch_id, trim(warehouse_name)) returning id into saved_id;
  else
    update public.warehouses set branch_id = target_branch_id, name = trim(warehouse_name)
    where organization_id = org_id and id = target_warehouse_id returning id into saved_id;
    if saved_id is null then raise exception 'Warehouse not found'; end if;
  end if;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (org_id, auth.uid(), case when target_warehouse_id is null then 'warehouse.created' else 'warehouse.updated' end,
    'warehouse', saved_id, jsonb_build_object('branch_id', target_branch_id, 'name', trim(warehouse_name)));
  return saved_id;
end;
$$;

create or replace function public.set_warehouse_active(org_id uuid, target_warehouse_id uuid, target_is_active boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.current_user_has_permission(org_id, 'inventory.manage') then raise exception 'Inventory manage permission required' using errcode = '42501'; end if;
  if not target_is_active and exists (
    select 1 from public.stock_movements movement
    where movement.organization_id = org_id and movement.warehouse_id = target_warehouse_id
    group by movement.inventory_item_id having sum(movement.quantity) <> 0
  ) then raise exception 'Warehouse with stock cannot be archived'; end if;
  update public.warehouses set is_active = target_is_active where organization_id = org_id and id = target_warehouse_id;
  if not found then raise exception 'Warehouse not found'; end if;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (org_id, auth.uid(), 'warehouse.activity_changed', 'warehouse', target_warehouse_id, jsonb_build_object('is_active', target_is_active));
end;
$$;

create or replace function public.save_inventory_item(
  org_id uuid, target_item_id uuid, target_category_id uuid, item_sku text,
  item_name text, item_unit text, item_min_stock numeric
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare saved_id uuid;
begin
  if not public.current_user_has_permission(org_id, 'inventory.manage') then raise exception 'Inventory manage permission required' using errcode = '42501'; end if;
  if not exists (select 1 from public.inventory_categories where organization_id = org_id and id = target_category_id and is_active) then raise exception 'Active inventory category not found'; end if;
  if item_sku is null or char_length(trim(item_sku)) not between 1 and 60
    or item_name is null or char_length(trim(item_name)) not between 2 and 240
    or item_unit is null or char_length(trim(item_unit)) not between 1 and 40
    or item_min_stock is null or item_min_stock < 0 then raise exception 'Inventory item data is invalid'; end if;
  if target_item_id is null then
    insert into public.inventory_items (organization_id, category_id, sku, name, unit, min_stock)
    values (org_id, target_category_id, upper(trim(item_sku)), trim(item_name), trim(item_unit), item_min_stock)
    returning id into saved_id;
  else
    update public.inventory_items set category_id = target_category_id, sku = upper(trim(item_sku)),
      name = trim(item_name), unit = trim(item_unit), min_stock = item_min_stock
    where organization_id = org_id and id = target_item_id returning id into saved_id;
    if saved_id is null then raise exception 'Inventory item not found'; end if;
  end if;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (org_id, auth.uid(), case when target_item_id is null then 'inventory_item.created' else 'inventory_item.updated' end,
    'inventory_item', saved_id, jsonb_build_object('sku', upper(trim(item_sku)), 'min_stock', item_min_stock));
  return saved_id;
end;
$$;

create or replace function public.set_inventory_item_active(org_id uuid, target_item_id uuid, target_is_active boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.current_user_has_permission(org_id, 'inventory.manage') then raise exception 'Inventory manage permission required' using errcode = '42501'; end if;
  if not target_is_active and exists (
    select 1 from public.stock_movements movement
    where movement.organization_id = org_id and movement.inventory_item_id = target_item_id
    group by movement.warehouse_id having sum(movement.quantity) <> 0
  ) then raise exception 'Inventory item with stock cannot be archived'; end if;
  update public.inventory_items set is_active = target_is_active where organization_id = org_id and id = target_item_id;
  if not found then raise exception 'Inventory item not found'; end if;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (org_id, auth.uid(), 'inventory_item.activity_changed', 'inventory_item', target_item_id, jsonb_build_object('is_active', target_is_active));
end;
$$;

create or replace function public.save_service_material_norm(
  org_id uuid, target_norm_id uuid, target_service_id uuid, target_item_id uuid, norm_quantity numeric
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare saved_id uuid;
begin
  if not public.current_user_has_permission(org_id, 'inventory.manage') then raise exception 'Inventory manage permission required' using errcode = '42501'; end if;
  if norm_quantity is null or norm_quantity <= 0 then raise exception 'Material norm quantity is invalid'; end if;
  if not exists (select 1 from public.services where organization_id = org_id and id = target_service_id) then raise exception 'Service not found'; end if;
  if not exists (select 1 from public.inventory_items where organization_id = org_id and id = target_item_id) then raise exception 'Inventory item not found'; end if;
  if target_norm_id is null then
    insert into public.service_material_norms (organization_id, service_id, inventory_item_id, quantity, created_by)
    values (org_id, target_service_id, target_item_id, norm_quantity, auth.uid()) returning id into saved_id;
  else
    update public.service_material_norms set service_id = target_service_id, inventory_item_id = target_item_id,
      quantity = norm_quantity, is_active = true
    where organization_id = org_id and id = target_norm_id returning id into saved_id;
    if saved_id is null then raise exception 'Material norm not found'; end if;
  end if;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (org_id, auth.uid(), case when target_norm_id is null then 'service_material_norm.created' else 'service_material_norm.updated' end,
    'service_material_norm', saved_id, jsonb_build_object('service_id', target_service_id, 'inventory_item_id', target_item_id, 'quantity', norm_quantity));
  return saved_id;
end;
$$;

create or replace function public.set_service_material_norm_active(org_id uuid, target_norm_id uuid, target_is_active boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.current_user_has_permission(org_id, 'inventory.manage') then raise exception 'Inventory manage permission required' using errcode = '42501'; end if;
  update public.service_material_norms set is_active = target_is_active where organization_id = org_id and id = target_norm_id;
  if not found then raise exception 'Material norm not found'; end if;
end;
$$;

create or replace function public.record_inventory_receipt(
  org_id uuid, target_warehouse_id uuid, target_item_id uuid, received_quantity numeric,
  received_unit_cost numeric, received_lot_number text, received_expiration_date date, movement_note text
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare batch_id uuid; movement_id uuid;
begin
  if not public.current_user_has_permission(org_id, 'inventory.manage') then raise exception 'Inventory manage permission required' using errcode = '42501'; end if;
  if received_quantity is null or received_quantity <= 0 or received_unit_cost is null or received_unit_cost < 0 then raise exception 'Receipt quantity or cost is invalid'; end if;
  if not exists (select 1 from public.warehouses where organization_id = org_id and id = target_warehouse_id and is_active) then raise exception 'Active warehouse not found'; end if;
  if not exists (select 1 from public.inventory_items where organization_id = org_id and id = target_item_id and is_active) then raise exception 'Active inventory item not found'; end if;
  insert into public.stock_batches (organization_id, warehouse_id, inventory_item_id, lot_number, expiration_date, unit_cost, quantity_received, created_by)
  values (org_id, target_warehouse_id, target_item_id, nullif(trim(received_lot_number), ''), received_expiration_date,
    received_unit_cost, received_quantity, auth.uid()) returning id into batch_id;
  insert into public.stock_movements (organization_id, warehouse_id, inventory_item_id, stock_batch_id, movement_type,
    quantity, unit_cost, source_type, note, created_by)
  values (org_id, target_warehouse_id, target_item_id, batch_id, 'receipt', received_quantity, received_unit_cost,
    'manual', nullif(trim(movement_note), ''), auth.uid()) returning id into movement_id;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (org_id, auth.uid(), 'stock.received', 'stock_movement', movement_id,
    jsonb_build_object('warehouse_id', target_warehouse_id, 'item_id', target_item_id, 'batch_id', batch_id, 'quantity', received_quantity));
  return movement_id;
end;
$$;

create or replace function public.record_inventory_outflow(
  org_id uuid, target_batch_id uuid, outflow_type text, outflow_quantity numeric, movement_note text
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare resolved_warehouse_id uuid; resolved_item_id uuid; resolved_cost numeric; available_quantity numeric; movement_id uuid;
begin
  if not public.current_user_has_permission(org_id, 'inventory.manage') then raise exception 'Inventory manage permission required' using errcode = '42501'; end if;
  if outflow_type not in ('issue', 'write_off') or outflow_quantity is null or outflow_quantity <= 0 then raise exception 'Outflow data is invalid'; end if;
  if outflow_type = 'write_off' and (movement_note is null or char_length(trim(movement_note)) < 3) then raise exception 'Write-off reason is required'; end if;
  select batch.warehouse_id, batch.inventory_item_id, batch.unit_cost into resolved_warehouse_id, resolved_item_id, resolved_cost
  from public.stock_batches batch where batch.organization_id = org_id and batch.id = target_batch_id for update;
  if resolved_warehouse_id is null then raise exception 'Stock batch not found'; end if;
  select coalesce(sum(movement.quantity), 0) into available_quantity from public.stock_movements movement
  where movement.organization_id = org_id and movement.stock_batch_id = target_batch_id;
  if available_quantity < outflow_quantity then raise exception 'Insufficient batch stock'; end if;
  insert into public.stock_movements (organization_id, warehouse_id, inventory_item_id, stock_batch_id, movement_type,
    quantity, unit_cost, source_type, note, created_by)
  values (org_id, resolved_warehouse_id, resolved_item_id, target_batch_id, outflow_type, -outflow_quantity,
    resolved_cost, 'manual', nullif(trim(movement_note), ''), auth.uid()) returning id into movement_id;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (org_id, auth.uid(), 'stock.' || outflow_type, 'stock_movement', movement_id,
    jsonb_build_object('batch_id', target_batch_id, 'quantity', -outflow_quantity, 'reason', nullif(trim(movement_note), '')));
  return movement_id;
end;
$$;

create or replace function public.record_inventory_correction(
  org_id uuid, target_batch_id uuid, adjustment_quantity numeric, correction_reason text
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare resolved_warehouse_id uuid; resolved_item_id uuid; resolved_cost numeric; available_quantity numeric; movement_id uuid;
begin
  if not public.current_user_has_permission(org_id, 'inventory.manage') then raise exception 'Inventory manage permission required' using errcode = '42501'; end if;
  if adjustment_quantity is null or adjustment_quantity = 0 or correction_reason is null or char_length(trim(correction_reason)) < 3 then raise exception 'Correction data is invalid'; end if;
  select batch.warehouse_id, batch.inventory_item_id, batch.unit_cost into resolved_warehouse_id, resolved_item_id, resolved_cost
  from public.stock_batches batch where batch.organization_id = org_id and batch.id = target_batch_id for update;
  if resolved_warehouse_id is null then raise exception 'Stock batch not found'; end if;
  select coalesce(sum(quantity), 0) into available_quantity from public.stock_movements where organization_id = org_id and stock_batch_id = target_batch_id;
  if available_quantity + adjustment_quantity < 0 then raise exception 'Correction would make stock negative'; end if;
  insert into public.stock_movements (organization_id, warehouse_id, inventory_item_id, stock_batch_id, movement_type,
    quantity, unit_cost, source_type, note, created_by)
  values (org_id, resolved_warehouse_id, resolved_item_id, target_batch_id, 'correction', adjustment_quantity,
    resolved_cost, 'manual', trim(correction_reason), auth.uid()) returning id into movement_id;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (org_id, auth.uid(), 'stock.corrected', 'stock_movement', movement_id,
    jsonb_build_object('batch_id', target_batch_id, 'quantity', adjustment_quantity, 'reason', trim(correction_reason)));
  return movement_id;
end;
$$;

create or replace function public.transfer_inventory_stock(
  org_id uuid, source_batch_id uuid, destination_warehouse_id uuid, transfer_quantity numeric, transfer_note text
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare source_warehouse_id uuid; item_id uuid; batch_lot text; batch_expiration date; batch_cost numeric;
  available_quantity numeric; destination_batch_id uuid; transfer_id uuid := gen_random_uuid(); outgoing_id uuid;
begin
  if not public.current_user_has_permission(org_id, 'inventory.manage') then raise exception 'Inventory manage permission required' using errcode = '42501'; end if;
  if transfer_quantity is null or transfer_quantity <= 0 then raise exception 'Transfer quantity is invalid'; end if;
  select batch.warehouse_id, batch.inventory_item_id, batch.lot_number, batch.expiration_date, batch.unit_cost
  into source_warehouse_id, item_id, batch_lot, batch_expiration, batch_cost
  from public.stock_batches batch where batch.organization_id = org_id and batch.id = source_batch_id for update;
  if source_warehouse_id is null then raise exception 'Source batch not found'; end if;
  if source_warehouse_id = destination_warehouse_id then raise exception 'Warehouses must be different'; end if;
  if not exists (select 1 from public.warehouses where organization_id = org_id and id = destination_warehouse_id and is_active) then raise exception 'Destination warehouse not found'; end if;
  select coalesce(sum(quantity), 0) into available_quantity from public.stock_movements where organization_id = org_id and stock_batch_id = source_batch_id;
  if available_quantity < transfer_quantity then raise exception 'Insufficient batch stock'; end if;
  insert into public.stock_batches (organization_id, warehouse_id, inventory_item_id, lot_number, expiration_date, unit_cost, quantity_received, created_by)
  values (org_id, destination_warehouse_id, item_id, batch_lot, batch_expiration, batch_cost, transfer_quantity, auth.uid())
  returning id into destination_batch_id;
  insert into public.stock_movements (organization_id, warehouse_id, inventory_item_id, stock_batch_id, movement_type,
    quantity, unit_cost, source_type, source_id, note, created_by)
  values (org_id, source_warehouse_id, item_id, source_batch_id, 'transfer_out', -transfer_quantity, batch_cost,
    'transfer', transfer_id, nullif(trim(transfer_note), ''), auth.uid()) returning id into outgoing_id;
  insert into public.stock_movements (organization_id, warehouse_id, inventory_item_id, stock_batch_id, movement_type,
    quantity, unit_cost, source_type, source_id, note, created_by)
  values (org_id, destination_warehouse_id, item_id, destination_batch_id, 'transfer_in', transfer_quantity, batch_cost,
    'transfer', transfer_id, nullif(trim(transfer_note), ''), auth.uid());
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (org_id, auth.uid(), 'stock.transferred', 'stock_movement', outgoing_id,
    jsonb_build_object('transfer_id', transfer_id, 'source_warehouse_id', source_warehouse_id,
      'destination_warehouse_id', destination_warehouse_id, 'quantity', transfer_quantity));
  return transfer_id;
end;
$$;

create or replace function public.write_off_procedure_material(
  org_id uuid, target_performed_service_id uuid, target_norm_id uuid, target_batch_id uuid, usage_quantity numeric
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare performed_service_id uuid; performed_service_quantity numeric; norm_item_id uuid; norm_quantity numeric;
  batch_warehouse_id uuid; batch_item_id uuid; batch_cost numeric; available_quantity numeric; already_used numeric; movement_id uuid;
begin
  if not public.current_user_has_permission(org_id, 'inventory.manage') then raise exception 'Inventory manage permission required' using errcode = '42501'; end if;
  if usage_quantity is null or usage_quantity <= 0 then raise exception 'Procedure usage quantity is invalid'; end if;
  select performed.id, performed.quantity into performed_service_id, performed_service_quantity
  from public.performed_services performed
  join public.service_material_norms norm on norm.organization_id = performed.organization_id and norm.service_id = performed.service_id
  where performed.organization_id = org_id and performed.id = target_performed_service_id
    and performed.voided_at is null and norm.id = target_norm_id and norm.is_active;
  if performed_service_id is null then raise exception 'Performed service or active norm not found'; end if;
  select inventory_item_id, quantity into norm_item_id, norm_quantity from public.service_material_norms
  where organization_id = org_id and id = target_norm_id;
  select warehouse_id, inventory_item_id, unit_cost into batch_warehouse_id, batch_item_id, batch_cost
  from public.stock_batches where organization_id = org_id and id = target_batch_id for update;
  if batch_warehouse_id is null or batch_item_id <> norm_item_id then raise exception 'Batch does not match material norm'; end if;
  select coalesce(sum(quantity), 0) into available_quantity from public.stock_movements
  where organization_id = org_id and stock_batch_id = target_batch_id;
  if available_quantity < usage_quantity then raise exception 'Insufficient batch stock'; end if;
  select coalesce(-sum(quantity), 0) into already_used from public.stock_movements
  where organization_id = org_id and movement_type = 'procedure_usage'
    and source_id = target_performed_service_id and service_material_norm_id = target_norm_id;
  if already_used + usage_quantity > performed_service_quantity * norm_quantity then raise exception 'Procedure material norm exceeded'; end if;
  insert into public.stock_movements (organization_id, warehouse_id, inventory_item_id, stock_batch_id, movement_type,
    quantity, unit_cost, source_type, source_id, service_material_norm_id, note, created_by)
  values (org_id, batch_warehouse_id, norm_item_id, target_batch_id, 'procedure_usage', -usage_quantity, batch_cost,
    'performed_service', target_performed_service_id, target_norm_id, 'Списание по выполненной процедуре', auth.uid())
  returning id into movement_id;
  insert into public.audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (org_id, auth.uid(), 'stock.procedure_usage', 'stock_movement', movement_id,
    jsonb_build_object('performed_service_id', target_performed_service_id, 'norm_id', target_norm_id, 'quantity', -usage_quantity));
  return movement_id;
end;
$$;

create or replace function public.list_inventory_reference_data(org_id uuid)
returns table (entity_type text, id uuid, parent_id uuid, code text, name text, unit text,
  min_stock numeric, is_active boolean, branch_name text)
language sql stable security definer set search_path = public, pg_temp as $$
  select 'category', category.id, null::uuid, null::text, category.name, null::text, null::numeric, category.is_active, null::text
  from public.inventory_categories category where category.organization_id = org_id
    and public.current_user_has_permission(org_id, 'inventory.read')
  union all
  select 'warehouse', warehouse.id, warehouse.branch_id, null, warehouse.name, null, null, warehouse.is_active, branch.name
  from public.warehouses warehouse join public.branches branch on branch.id = warehouse.branch_id and branch.organization_id = warehouse.organization_id
  where warehouse.organization_id = org_id and public.current_user_has_permission(org_id, 'inventory.read')
  union all
  select 'item', item.id, item.category_id, item.sku, item.name, item.unit, item.min_stock, item.is_active, null
  from public.inventory_items item where item.organization_id = org_id
    and public.current_user_has_permission(org_id, 'inventory.read')
  order by entity_type, name;
$$;

create or replace function public.list_inventory_branches(org_id uuid)
returns table (id uuid, name text) language sql stable security definer set search_path = public, pg_temp as $$
  select branch.id, branch.name from public.branches branch
  where branch.organization_id = org_id and branch.is_active
    and public.current_user_has_permission(org_id, 'inventory.read') order by branch.name;
$$;

create or replace function public.list_inventory_balances(org_id uuid)
returns table (warehouse_id uuid, warehouse_name text, branch_name text, item_id uuid, sku text, item_name text,
  category_name text, unit text, min_stock numeric, quantity numeric, stock_value numeric, next_expiration_date date)
language sql stable security definer set search_path = public, pg_temp as $$
  select warehouse.id, warehouse.name, branch.name, item.id, item.sku, item.name, category.name, item.unit, item.min_stock,
    coalesce(sum(movement.quantity), 0)::numeric,
    coalesce(sum(movement.quantity * coalesce(movement.unit_cost, batch.unit_cost)), 0)::numeric,
    min(batch.expiration_date) filter (where batch.expiration_date is not null and movement.quantity is not null)
  from public.warehouses warehouse
  join public.branches branch on branch.id = warehouse.branch_id and branch.organization_id = warehouse.organization_id
  cross join public.inventory_items item
  join public.inventory_categories category on category.id = item.category_id and category.organization_id = item.organization_id
  left join public.stock_movements movement on movement.organization_id = warehouse.organization_id
    and movement.warehouse_id = warehouse.id and movement.inventory_item_id = item.id
  left join public.stock_batches batch on batch.organization_id = movement.organization_id and batch.id = movement.stock_batch_id
  where warehouse.organization_id = org_id and item.organization_id = org_id
    and warehouse.is_active and item.is_active and public.current_user_has_permission(org_id, 'inventory.read')
  group by warehouse.id, warehouse.name, branch.name, item.id, item.sku, item.name, category.name, item.unit, item.min_stock
  order by branch.name, warehouse.name, item.name;
$$;

create or replace function public.list_stock_batches(org_id uuid, include_empty boolean default false)
returns table (id uuid, warehouse_id uuid, warehouse_name text, item_id uuid, sku text, item_name text, unit text,
  lot_number text, expiration_date date, unit_cost numeric, available_quantity numeric, received_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select batch.id, batch.warehouse_id, warehouse.name, batch.inventory_item_id, item.sku, item.name, item.unit,
    batch.lot_number, batch.expiration_date, batch.unit_cost, coalesce(sum(movement.quantity), 0), batch.received_at
  from public.stock_batches batch
  join public.warehouses warehouse on warehouse.organization_id = batch.organization_id and warehouse.id = batch.warehouse_id
  join public.inventory_items item on item.organization_id = batch.organization_id and item.id = batch.inventory_item_id
  left join public.stock_movements movement on movement.organization_id = batch.organization_id and movement.stock_batch_id = batch.id
  where batch.organization_id = org_id and public.current_user_has_permission(org_id, 'inventory.read')
  group by batch.id, warehouse.name, item.sku, item.name, item.unit
  having include_empty or coalesce(sum(movement.quantity), 0) > 0
  order by batch.expiration_date nulls last, batch.received_at;
$$;

create or replace function public.list_stock_movements(org_id uuid, result_limit integer default 200)
returns table (id uuid, movement_type text, warehouse_name text, item_name text, sku text, unit text,
  lot_number text, quantity numeric, unit_cost numeric, note text, created_by_name text, created_at timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select movement.id, movement.movement_type, warehouse.name, item.name, item.sku, item.unit,
    batch.lot_number, movement.quantity, movement.unit_cost, movement.note,
    coalesce(nullif(trim(profile.full_name), ''), 'Сотрудник'), movement.created_at
  from public.stock_movements movement
  join public.warehouses warehouse on warehouse.organization_id = movement.organization_id and warehouse.id = movement.warehouse_id
  join public.inventory_items item on item.organization_id = movement.organization_id and item.id = movement.inventory_item_id
  join public.stock_batches batch on batch.organization_id = movement.organization_id and batch.id = movement.stock_batch_id
  join public.profiles profile on profile.id = movement.created_by
  where movement.organization_id = org_id and public.current_user_has_permission(org_id, 'inventory.read')
  order by movement.created_at desc limit least(greatest(result_limit, 1), 500);
$$;

create or replace function public.list_service_material_norms(org_id uuid)
returns table (id uuid, service_id uuid, service_code text, service_name text, item_id uuid, item_sku text,
  item_name text, unit text, quantity numeric, is_active boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  select norm.id, norm.service_id, service.code, service.name, norm.inventory_item_id, item.sku,
    item.name, item.unit, norm.quantity, norm.is_active
  from public.service_material_norms norm
  join public.services service on service.organization_id = norm.organization_id and service.id = norm.service_id
  join public.inventory_items item on item.organization_id = norm.organization_id and item.id = norm.inventory_item_id
  where norm.organization_id = org_id and public.current_user_has_permission(org_id, 'inventory.read')
  order by service.name, item.name;
$$;

create or replace function public.list_inventory_service_options(org_id uuid)
returns table (id uuid, code text, name text, is_active boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  select service.id, service.code, service.name, service.is_active
  from public.services service
  where service.organization_id = org_id
    and public.current_user_has_permission(org_id, 'inventory.read')
  order by service.name;
$$;

create or replace function public.list_pending_procedure_material_usage(org_id uuid)
returns table (performed_service_id uuid, performed_at timestamptz, patient_name text, service_name text,
  norm_id uuid, item_id uuid, item_name text, item_sku text, unit text, suggested_quantity numeric, remaining_quantity numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  select performed.id, performed.performed_at,
    trim(patient.last_name || ' ' || patient.first_name || coalesce(' ' || patient.middle_name, '')),
    performed.service_name_snapshot, norm.id, item.id, item.name, item.sku, item.unit,
    performed.quantity * norm.quantity,
    performed.quantity * norm.quantity - coalesce(-sum(movement.quantity), 0)
  from public.performed_services performed
  join public.patients patient on patient.organization_id = performed.organization_id and patient.id = performed.patient_id
  join public.service_material_norms norm on norm.organization_id = performed.organization_id
    and norm.service_id = performed.service_id and norm.is_active
  join public.inventory_items item on item.organization_id = norm.organization_id and item.id = norm.inventory_item_id
  left join public.stock_movements movement on movement.organization_id = performed.organization_id
    and movement.movement_type = 'procedure_usage' and movement.source_id = performed.id
    and movement.service_material_norm_id = norm.id
  where performed.organization_id = org_id and performed.voided_at is null
    and public.current_user_has_permission(org_id, 'inventory.read')
  group by performed.id, patient.id, norm.id, item.id
  having performed.quantity * norm.quantity - coalesce(-sum(movement.quantity), 0) > 0
  order by performed.performed_at desc
  limit 500;
$$;

revoke all on function public.save_inventory_category(uuid, uuid, text) from public;
revoke all on function public.save_warehouse(uuid, uuid, uuid, text) from public;
revoke all on function public.set_warehouse_active(uuid, uuid, boolean) from public;
revoke all on function public.save_inventory_item(uuid, uuid, uuid, text, text, text, numeric) from public;
revoke all on function public.set_inventory_item_active(uuid, uuid, boolean) from public;
revoke all on function public.save_service_material_norm(uuid, uuid, uuid, uuid, numeric) from public;
revoke all on function public.set_service_material_norm_active(uuid, uuid, boolean) from public;
revoke all on function public.record_inventory_receipt(uuid, uuid, uuid, numeric, numeric, text, date, text) from public;
revoke all on function public.record_inventory_outflow(uuid, uuid, text, numeric, text) from public;
revoke all on function public.record_inventory_correction(uuid, uuid, numeric, text) from public;
revoke all on function public.transfer_inventory_stock(uuid, uuid, uuid, numeric, text) from public;
revoke all on function public.write_off_procedure_material(uuid, uuid, uuid, uuid, numeric) from public;
revoke all on function public.list_inventory_reference_data(uuid) from public;
revoke all on function public.list_inventory_branches(uuid) from public;
revoke all on function public.list_inventory_balances(uuid) from public;
revoke all on function public.list_stock_batches(uuid, boolean) from public;
revoke all on function public.list_stock_movements(uuid, integer) from public;
revoke all on function public.list_service_material_norms(uuid) from public;
revoke all on function public.list_inventory_service_options(uuid) from public;
revoke all on function public.list_pending_procedure_material_usage(uuid) from public;

grant execute on function public.save_inventory_category(uuid, uuid, text) to authenticated;
grant execute on function public.save_warehouse(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.set_warehouse_active(uuid, uuid, boolean) to authenticated;
grant execute on function public.save_inventory_item(uuid, uuid, uuid, text, text, text, numeric) to authenticated;
grant execute on function public.set_inventory_item_active(uuid, uuid, boolean) to authenticated;
grant execute on function public.save_service_material_norm(uuid, uuid, uuid, uuid, numeric) to authenticated;
grant execute on function public.set_service_material_norm_active(uuid, uuid, boolean) to authenticated;
grant execute on function public.record_inventory_receipt(uuid, uuid, uuid, numeric, numeric, text, date, text) to authenticated;
grant execute on function public.record_inventory_outflow(uuid, uuid, text, numeric, text) to authenticated;
grant execute on function public.record_inventory_correction(uuid, uuid, numeric, text) to authenticated;
grant execute on function public.transfer_inventory_stock(uuid, uuid, uuid, numeric, text) to authenticated;
grant execute on function public.write_off_procedure_material(uuid, uuid, uuid, uuid, numeric) to authenticated;
grant execute on function public.list_inventory_reference_data(uuid) to authenticated;
grant execute on function public.list_inventory_branches(uuid) to authenticated;
grant execute on function public.list_inventory_balances(uuid) to authenticated;
grant execute on function public.list_stock_batches(uuid, boolean) to authenticated;
grant execute on function public.list_stock_movements(uuid, integer) to authenticated;
grant execute on function public.list_service_material_norms(uuid) to authenticated;
grant execute on function public.list_inventory_service_options(uuid) to authenticated;
grant execute on function public.list_pending_procedure_material_usage(uuid) to authenticated;

commit;
