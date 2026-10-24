-- ===== 0001_foundation.sql =====
-- Phase 1: identity, roles, doctors, addresses, staff, audit
create extension if not exists "pgcrypto";

create type app_role as enum (
  'super_admin','lab_manager','technician','order_manager',
  'delivery_coordinator','accountant','inventory_manager','delivery_staff','doctor'
);
create type approval_status as enum ('pending','approved','rejected','suspended');

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  locale text not null default 'ar' check (locale in ('ar','en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.doctor_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  clinic_name text,
  clinic_address text,
  business_info jsonb not null default '{}',
  status approval_status not null default 'pending',
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.doctor_profiles(status);

create table public.clinic_addresses (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctor_profiles(user_id) on delete cascade,
  label text,
  address_line text not null,
  city text,
  phone text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.clinic_addresses(doctor_id);

create table public.staff_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  job_title text,
  extra_permissions text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id),
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.audit_logs(entity, entity_id);
create index on public.audit_logs(actor_id);

create trigger t_profiles_upd before update on public.profiles for each row execute function set_updated_at();
create trigger t_doctors_upd before update on public.doctor_profiles for each row execute function set_updated_at();

-- On signup: create profile + pending doctor + 'doctor' role. Admin roles are NEVER auto-assigned.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'));
  insert into public.doctor_profiles(user_id) values (new.id);
  insert into public.user_roles(user_id, role) values (new.id, 'doctor');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_staff(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from user_roles where user_id = uid and role <> 'doctor');
$$;

-- RLS (second layer; the API uses the service role and enforces its own checks)
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.doctor_profiles enable row level security;
alter table public.clinic_addresses enable row level security;
alter table public.staff_profiles enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_self_read on public.profiles for select using (id = auth.uid() or is_staff(auth.uid()));
create policy profiles_self_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy roles_self_read on public.user_roles for select using (user_id = auth.uid());
create policy doctor_read on public.doctor_profiles for select using (user_id = auth.uid() or is_staff(auth.uid()));
-- Doctors may edit their own info but NOT their approval status (changed only via the API).
create policy doctor_update on public.doctor_profiles for update
  using (user_id = auth.uid()) with check (user_id = auth.uid() and status = (select status from public.doctor_profiles d where d.user_id = auth.uid()));
create policy addr_owner on public.clinic_addresses for all using (doctor_id = auth.uid()) with check (doctor_id = auth.uid());
create policy staff_read on public.staff_profiles for select using (user_id = auth.uid());
-- audit_logs: no policies => only the service role can read/write.

-- ===== 0002_lab_services.sql =====
-- Phase 4a: laboratory price list (managed from the admin dashboard)
create table public.lab_service_categories (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null,
  name_en text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.lab_services (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.lab_service_categories(id),
  name_ar text not null,
  name_en text not null,
  description_ar text,
  description_en text,
  material text,
  price numeric(12,2) not null check (price >= 0),   -- CURRENT price only; orders/invoices must snapshot it
  turnaround_days int check (turnaround_days between 0 and 365),
  notes text,
  is_active boolean not null default true,           -- deactivate instead of delete (history stays valid)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.lab_services(category_id);
create index on public.lab_services(is_active);
create trigger t_lab_services_upd before update on public.lab_services for each row execute function set_updated_at();

alter table public.lab_service_categories enable row level security;
alter table public.lab_services enable row level security;
create policy cats_read on public.lab_service_categories for select to authenticated using (is_active);
create policy services_read on public.lab_services for select to authenticated using (is_active);
-- writes: service role (API) only.

-- DEMO DATA (categories only; no invented prices). Edit freely from the admin dashboard.
insert into public.lab_service_categories(name_ar, name_en, sort_order) values
  ('تيجان وجسور', 'Crowns & bridges', 1),
  ('فينير', 'Veneers', 2),
  ('زراعة الأسنان', 'Implants', 3),
  ('أطقم الأسنان', 'Dentures', 4);

-- ===== 0003_products.sql =====
-- Phase 4b: dental supplies store (catalog, images, inventory)
create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.product_categories(id),
  name_ar text not null,
  name_en text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  category_id uuid not null references public.product_categories(id),
  name_ar text not null,
  name_en text not null,
  description_ar text,
  description_en text,
  brand text,
  price numeric(12,2) not null check (price >= 0),
  discount_price numeric(12,2) check (discount_price >= 0 and discount_price < price),
  stock_quantity int not null default 0 check (stock_quantity >= 0),   -- never negative: DB-enforced
  min_order_qty int not null default 1 check (min_order_qty >= 1),
  low_stock_threshold int not null default 5 check (low_stock_threshold >= 0),
  is_active boolean not null default true,    -- deactivate, never delete (order history)
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.products(category_id);
create index on public.products(is_active, is_featured);
create trigger t_products_upd before update on public.products for each row execute function set_updated_at();

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  storage_path text not null unique,
  is_primary boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.product_images(product_id);

create table public.inventory_movements (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.products(id),
  delta int not null check (delta <> 0),
  reason text not null check (reason in ('initial','purchase','sale','adjustment','return','damage')),
  note text,
  stock_after int not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index on public.inventory_movements(product_id, created_at desc);

-- Atomic, concurrency-safe stock change: one UPDATE guarded by the >= 0 check, plus its movement row.
create or replace function public.adjust_stock(p_product uuid, p_delta int, p_reason text, p_note text, p_user uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_new int;
begin
  update products set stock_quantity = stock_quantity + p_delta
   where id = p_product and stock_quantity + p_delta >= 0
   returning stock_quantity into v_new;
  if v_new is null then raise exception 'insufficient_stock_or_missing_product'; end if;
  insert into inventory_movements(product_id, delta, reason, note, stock_after, created_by)
  values (p_product, p_delta, p_reason, p_note, v_new, p_user);
  return v_new;
end $$;
revoke execute on function public.adjust_stock(uuid, int, text, text, uuid) from public, anon, authenticated;

alter table public.product_categories enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.inventory_movements enable row level security;
create policy pcats_read on public.product_categories for select to authenticated using (is_active);
create policy products_read on public.products for select to authenticated using (is_active);
create policy pimages_read on public.product_images for select to authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.is_active));
-- inventory_movements: no policies => service role only. All writes go through the API.

-- Public bucket for product media only (case files will use a PRIVATE bucket later).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- DEMO DATA: categories only. Add real products from the admin dashboard.
insert into public.product_categories(name_ar, name_en, sort_order) values
  ('مواد ترميمية', 'Restorative materials', 1), ('مستلزمات العصب', 'Endodontic supplies', 2),
  ('مواد حشو', 'Filling materials', 3), ('سنابل وأدوات', 'Burs & instruments', 4),
  ('مواد طبعة', 'Impression materials', 5), ('مستهلكات', 'Disposables', 6);

-- ===== 0004_cart.sql =====
-- Phase 5a: server-side cart (one cart per user, so no separate carts table is needed)
create table public.cart_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity int not null check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
create trigger t_cart_upd before update on public.cart_items for each row execute function set_updated_at();

alter table public.cart_items enable row level security;
create policy cart_own on public.cart_items for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Prices are never stored here: the API reads them from `products` every time.

-- ===== 0005_orders_settings.sql =====
-- Phase 5b: orders, payments, settings, service images
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;   -- service role only
insert into public.app_settings(key, value) values
  ('business', '{"name":"City Smile Dental Lab","phone":"","address":""}'),
  ('delivery', '{"flat_fee":0,"free_over":null}'),
  ('payments', '{"cod":{"enabled":true},"vodafone_cash":{"enabled":false,"number":"","name":""},"instapay":{"enabled":false,"handle":"","name":""}}')
on conflict (key) do nothing;

alter table public.lab_services add column image_path text;

create sequence public.order_seq;
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  doctor_id uuid not null references public.profiles(id),
  status text not null default 'pending' check (status in ('pending','confirmed','processing','out_for_delivery','delivered','cancelled')),
  payment_method text not null check (payment_method in ('cod','vodafone_cash','instapay')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','awaiting_confirmation','paid','rejected')),
  subtotal numeric(12,2) not null default 0,
  delivery_fee numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  phone text not null,
  address text not null,
  delivery_instructions text,
  notes text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (doctor_id, idempotency_key)          -- duplicate submissions can never create two orders
);
create index on public.orders(doctor_id, created_at desc);
create index on public.orders(status);
create trigger t_orders_upd before update on public.orders for each row execute function set_updated_at();

create table public.order_items (          -- snapshot: later price/name changes never alter old orders
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  sku text not null, name_ar text not null, name_en text not null,
  unit_price numeric(12,2) not null, list_price numeric(12,2) not null,
  quantity int not null check (quantity > 0),
  line_total numeric(12,2) not null
);
create index on public.order_items(order_id);

create table public.order_status_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  status text not null, note text,
  changed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index on public.order_status_history(order_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  method text not null,
  amount numeric(12,2) not null,
  reference text,
  proof_path text,                          -- private bucket 'payment-proofs'
  status text not null default 'pending' check (status in ('pending','confirmed','rejected')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.payments(order_id);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_history enable row level security;
alter table public.payments enable row level security;
create policy orders_own on public.orders for select to authenticated using (doctor_id = auth.uid());
create policy items_own on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.doctor_id = auth.uid()));
create policy history_own on public.order_status_history for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and o.doctor_id = auth.uid()));
-- payments: service role only (proof paths are private).

-- Atomic checkout: validates, decrements stock, writes order + items + history, clears the cart. One transaction.
create or replace function public.create_order(
  p_user uuid, p_key text, p_method text, p_phone text, p_address text, p_instr text, p_notes text,
  p_flat_fee numeric, p_free_over numeric
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_order uuid; v_num text; v_sub numeric(12,2) := 0; v_fee numeric(12,2); v_unit numeric(12,2); r record;
begin
  select id into v_order from orders where doctor_id = p_user and idempotency_key = p_key;
  if v_order is not null then return v_order; end if;
  if not exists (select 1 from doctor_profiles where user_id = p_user and status = 'approved') then raise exception 'doctor_not_approved'; end if;
  if not exists (select 1 from cart_items where user_id = p_user) then raise exception 'empty_cart'; end if;

  v_order := gen_random_uuid();
  v_num := 'CS-O-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('order_seq')::text, 5, '0');
  insert into orders(id, order_number, doctor_id, payment_method, phone, address, delivery_instructions, notes, idempotency_key)
  values (v_order, v_num, p_user, p_method, p_phone, p_address, p_instr, p_notes, p_key);

  for r in
    select c.quantity as qty, p.id, p.sku, p.name_ar, p.name_en, p.price, p.discount_price, p.stock_quantity, p.min_order_qty, p.is_active
    from cart_items c join products p on p.id = c.product_id
    where c.user_id = p_user order by p.id for update of p
  loop
    if not r.is_active then raise exception 'product_unavailable:%', r.sku; end if;
    if r.qty < r.min_order_qty then raise exception 'below_min:%', r.sku; end if;
    if r.stock_quantity < r.qty then raise exception 'insufficient_stock:%', r.sku; end if;
    v_unit := coalesce(r.discount_price, r.price);
    update products set stock_quantity = stock_quantity - r.qty where id = r.id;
    insert into inventory_movements(product_id, delta, reason, note, stock_after, created_by)
    values (r.id, -r.qty, 'sale', v_num, r.stock_quantity - r.qty, p_user);
    insert into order_items(order_id, product_id, sku, name_ar, name_en, unit_price, list_price, quantity, line_total)
    values (v_order, r.id, r.sku, r.name_ar, r.name_en, v_unit, r.price, r.qty, v_unit * r.qty);
    v_sub := v_sub + v_unit * r.qty;
  end loop;

  v_fee := case when p_free_over is not null and v_sub >= p_free_over then 0 else coalesce(p_flat_fee, 0) end;
  update orders set subtotal = v_sub, delivery_fee = v_fee, total = v_sub + v_fee where id = v_order;
  insert into order_status_history(order_id, status, note, changed_by) values (v_order, 'pending', 'Order placed', p_user);
  delete from cart_items where user_id = p_user;
  return v_order;
end $$;

-- Validated status change; cancelling returns stock in the same transaction.
create or replace function public.set_order_status(p_order uuid, p_status text, p_note text, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_cur text; i record; v_stock int;
begin
  select status into v_cur from orders where id = p_order for update;
  if v_cur is null then raise exception 'order_not_found'; end if;
  if not ((v_cur = 'pending' and p_status in ('confirmed','cancelled'))
       or (v_cur = 'confirmed' and p_status in ('processing','cancelled'))
       or (v_cur = 'processing' and p_status in ('out_for_delivery','cancelled'))
       or (v_cur = 'out_for_delivery' and p_status = 'delivered')) then
    raise exception 'invalid_transition';
  end if;
  if p_status = 'cancelled' then
    for i in select product_id, quantity from order_items where order_id = p_order loop
      update products set stock_quantity = stock_quantity + i.quantity where id = i.product_id returning stock_quantity into v_stock;
      insert into inventory_movements(product_id, delta, reason, note, stock_after, created_by)
      values (i.product_id, i.quantity, 'return', 'order cancelled', v_stock, p_user);
    end loop;
  end if;
  update orders set status = p_status where id = p_order;
  insert into order_status_history(order_id, status, note, changed_by) values (p_order, p_status, p_note, p_user);
end $$;

revoke execute on function public.create_order(uuid,text,text,text,text,text,text,numeric,numeric) from public, anon, authenticated;
revoke execute on function public.set_order_status(uuid,text,text,uuid) from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('service-images', 'service-images', true, 3145728, array['image/jpeg','image/png','image/webp']),
  ('payment-proofs', 'payment-proofs', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- ===== 0006_lab_cases.sql =====
-- Phase 6a: laboratory cases (the lab's real work, separate from store orders)
create sequence public.case_seq;

create table public.lab_cases (
  id uuid primary key default gen_random_uuid(),
  case_number text not null unique default ('CS-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.case_seq')::text, 5, '0')),
  doctor_id uuid not null references public.profiles(id),
  service_id uuid not null references public.lab_services(id),
  service_name_ar text not null, service_name_en text not null,        -- snapshot
  patient_ref text not null,            -- internal identifier only; avoid real patient names
  tooth_numbers text, material text, shade text, instructions text,
  status text not null default 'submitted' check (status in
    ('submitted','info_required','approved','designing','milling','finishing','quality_control',
     'ready_for_delivery','out_for_delivery','delivered','on_hold','rejected','cancelled')),
  assigned_to uuid references auth.users(id),
  estimated_completion date,
  idempotency_key text not null,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (doctor_id, idempotency_key)
);
create index on public.lab_cases(doctor_id, submitted_at desc);
create index on public.lab_cases(status);
create index on public.lab_cases(assigned_to);
create trigger t_cases_upd before update on public.lab_cases for each row execute function set_updated_at();

create table public.lab_case_status_history (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.lab_cases(id) on delete cascade,
  from_status text, to_status text not null, note text,
  changed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index on public.lab_case_status_history(case_id);

create table public.lab_case_notes (       -- internal staff notes are kept apart from doctor-visible messages
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.lab_cases(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  author_role text not null check (author_role in ('staff','doctor')),
  visibility text not null check (visibility in ('internal','doctor')),
  body text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  check (author_role <> 'doctor' or visibility = 'doctor')
);
create index on public.lab_case_notes(case_id);

alter table public.lab_cases enable row level security;
alter table public.lab_case_status_history enable row level security;
alter table public.lab_case_notes enable row level security;
create policy cases_own on public.lab_cases for select to authenticated using (doctor_id = auth.uid());
create policy chist_own on public.lab_case_status_history for select to authenticated
  using (exists (select 1 from public.lab_cases c where c.id = case_id and c.doctor_id = auth.uid()));
create policy cnotes_own on public.lab_case_notes for select to authenticated
  using (visibility = 'doctor' and exists (select 1 from public.lab_cases c where c.id = case_id and c.doctor_id = auth.uid()));

create or replace function public.create_case(p_user uuid, p_key text, p_service uuid, p_patient text, p_teeth text, p_material text, p_shade text, p_instr text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; s record;
begin
  select id into v_id from lab_cases where doctor_id = p_user and idempotency_key = p_key;
  if v_id is not null then return v_id; end if;
  if not exists (select 1 from doctor_profiles where user_id = p_user and status = 'approved') then raise exception 'doctor_not_approved'; end if;
  select * into s from lab_services where id = p_service and is_active;
  if s.id is null then raise exception 'service_unavailable'; end if;
  insert into lab_cases(doctor_id, service_id, service_name_ar, service_name_en, patient_ref, tooth_numbers, material, shade, instructions, idempotency_key)
  values (p_user, p_service, s.name_ar, s.name_en, p_patient, p_teeth, p_material, p_shade, p_instr, p_key) returning id into v_id;
  insert into lab_case_status_history(case_id, from_status, to_status, note, changed_by) values (v_id, null, 'submitted', 'Case submitted', p_user);
  return v_id;
end $$;

-- Server-side workflow rules. Staff and doctors have different allowed moves.
create or replace function public.set_case_status(p_case uuid, p_status text, p_note text, p_user uuid, p_staff boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_cur text; ok boolean; v_prod text[] := array['approved','designing','milling','finishing','quality_control'];
begin
  select status into v_cur from lab_cases where id = p_case for update;
  if v_cur is null then raise exception 'case_not_found'; end if;
  if v_cur in ('delivered','rejected','cancelled') then raise exception 'case_closed'; end if;
  if v_cur = p_status then raise exception 'invalid_transition'; end if;
  if not p_staff then
    ok := (v_cur in ('submitted','info_required') and p_status = 'cancelled') or (v_cur = 'info_required' and p_status = 'submitted');
  else
    ok := case
      when p_status = 'info_required' then v_cur = 'submitted'
      when p_status = 'rejected' then v_cur in ('submitted','info_required')
      when p_status = 'on_hold' then v_cur in ('submitted','approved','designing','milling','finishing','quality_control','ready_for_delivery')
      when p_status = 'cancelled' then true
      when p_status = 'approved' then v_cur in ('submitted','info_required','on_hold')
      when p_status in ('designing','milling','finishing','quality_control') then v_cur = any(v_prod) or v_cur = 'on_hold'
      when p_status = 'ready_for_delivery' then v_cur in ('finishing','quality_control','on_hold')
      when p_status = 'out_for_delivery' then v_cur = 'ready_for_delivery'
      when p_status = 'delivered' then v_cur = 'out_for_delivery'
      else false end;
  end if;
  if not ok then raise exception 'invalid_transition'; end if;
  update lab_cases set status = p_status where id = p_case;
  insert into lab_case_status_history(case_id, from_status, to_status, note, changed_by) values (p_case, v_cur, p_status, p_note, p_user);
end $$;

revoke execute on function public.create_case(uuid,text,uuid,text,text,text,text,text) from public, anon, authenticated;
revoke execute on function public.set_case_status(uuid,text,text,uuid,boolean) from public, anon, authenticated;

-- ===== 0007_doctor_accounts.sql =====
-- Phase 6b: doctor account ledger. Every case/order is charged to the doctor's account; payments are recorded against it.
create table public.doctor_account_entries (
  id bigint generated always as identity primary key,
  doctor_id uuid not null references public.profiles(id),
  kind text not null check (kind in ('charge','reversal','payment','adjustment')),
  amount numeric(12,2) not null check (amount <> 0),      -- signed: positive = the doctor owes the lab more
  source_type text not null check (source_type in ('order','case','manual')),
  source_id uuid,
  reference text,           -- order / case number
  method text,              -- how a payment was made
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check ((kind = 'charge' and amount > 0) or (kind in ('reversal','payment') and amount < 0) or kind = 'adjustment')
);
create index on public.doctor_account_entries(doctor_id, created_at desc);
-- at most one charge and one reversal per order/case: a charge can never be duplicated
create unique index uq_account_once on public.doctor_account_entries(source_type, source_id, kind)
  where kind in ('charge','reversal') and source_id is not null;

alter table public.doctor_account_entries enable row level security;
create policy account_own on public.doctor_account_entries for select to authenticated using (doctor_id = auth.uid());

create view public.doctor_balances with (security_invoker = true) as
select p.id as doctor_id, p.full_name, p.email, d.clinic_name,
       coalesce(sum(e.amount), 0)                                  as balance,
       coalesce(sum(e.amount) filter (where e.amount > 0), 0)      as charged,
       coalesce(-sum(e.amount) filter (where e.amount < 0), 0)     as credited
from public.profiles p
join public.doctor_profiles d on d.user_id = p.id
left join public.doctor_account_entries e on e.doctor_id = p.id
group by p.id, p.full_name, p.email, d.clinic_name;

-- ---- case pricing (snapshot at submission) ----
alter table public.lab_cases
  add column quantity int not null default 1 check (quantity between 1 and 100),
  add column unit_price numeric(12,2),
  add column total numeric(12,2);

drop function public.create_case(uuid,text,uuid,text,text,text,text,text);
create or replace function public.create_case(p_user uuid, p_key text, p_service uuid, p_patient text, p_teeth text, p_material text, p_shade text, p_instr text, p_qty int)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; s record;
begin
  select id into v_id from lab_cases where doctor_id = p_user and idempotency_key = p_key;
  if v_id is not null then return v_id; end if;
  if not exists (select 1 from doctor_profiles where user_id = p_user and status = 'approved') then raise exception 'doctor_not_approved'; end if;
  select * into s from lab_services where id = p_service and is_active;
  if s.id is null then raise exception 'service_unavailable'; end if;
  if p_qty is null or p_qty < 1 or p_qty > 100 then raise exception 'invalid_quantity'; end if;
  insert into lab_cases(doctor_id, service_id, service_name_ar, service_name_en, patient_ref, tooth_numbers, material, shade, instructions, idempotency_key, quantity, unit_price, total)
  values (p_user, p_service, s.name_ar, s.name_en, p_patient, p_teeth, p_material, p_shade, p_instr, p_key, p_qty, s.price, s.price * p_qty) returning id into v_id;
  insert into lab_case_status_history(case_id, from_status, to_status, note, changed_by) values (v_id, null, 'submitted', 'Case submitted', p_user);
  return v_id;
end $$;
revoke execute on function public.create_case(uuid,text,uuid,text,text,text,text,text,int) from public, anon, authenticated;

-- ---- automatic ledger entries (triggers keep the earlier order/case functions unchanged) ----
create or replace function public.fn_charge_order() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into doctor_account_entries(doctor_id, kind, amount, source_type, source_id, reference, note)
  values (new.doctor_id, 'charge', new.total, 'order', new.id, new.order_number, 'Supplies order') on conflict do nothing;
  return new;
end $$;
create trigger trg_order_charge after update of total on public.orders
  for each row when (old.total = 0 and new.total > 0) execute function public.fn_charge_order();

create or replace function public.fn_charge_case() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into doctor_account_entries(doctor_id, kind, amount, source_type, source_id, reference, note)
  values (new.doctor_id, 'charge', new.total, 'case', new.id, new.case_number, new.service_name_en || ' x' || new.quantity) on conflict do nothing;
  return new;
end $$;
create trigger trg_case_charge after insert on public.lab_cases
  for each row when (new.total is not null and new.total > 0) execute function public.fn_charge_case();

create or replace function public.fn_reverse_charge() returns trigger language plpgsql security definer set search_path = public as $$
declare v_type text := tg_argv[0]; v_amt numeric; v_ref text;
begin
  select amount, reference into v_amt, v_ref from doctor_account_entries where source_type = v_type and source_id = new.id and kind = 'charge';
  if found then
    insert into doctor_account_entries(doctor_id, kind, amount, source_type, source_id, reference, note)
    values (new.doctor_id, 'reversal', -v_amt, v_type, new.id, v_ref, 'Cancelled / rejected') on conflict do nothing;
  end if;
  return new;
end $$;
create trigger trg_order_reverse after update of status on public.orders
  for each row when (new.status = 'cancelled' and old.status <> 'cancelled') execute function public.fn_reverse_charge('order');
create trigger trg_case_reverse after update of status on public.lab_cases
  for each row when (new.status in ('cancelled','rejected') and old.status not in ('cancelled','rejected')) execute function public.fn_reverse_charge('case');

-- when the lab confirms an order's payment it is credited to the account (and un-credited if reverted)
create or replace function public.fn_order_payment() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.payment_status = 'paid' and old.payment_status <> 'paid' then
    insert into doctor_account_entries(doctor_id, kind, amount, source_type, source_id, reference, method, note)
    values (new.doctor_id, 'payment', -new.total, 'order', new.id, new.order_number, new.payment_method, 'Payment confirmed');
  elsif old.payment_status = 'paid' and new.payment_status <> 'paid' then
    insert into doctor_account_entries(doctor_id, kind, amount, source_type, source_id, reference, note)
    values (new.doctor_id, 'adjustment', new.total, 'order', new.id, new.order_number, 'Payment reverted');
  end if;
  return new;
end $$;
create trigger trg_order_payment after update of payment_status on public.orders
  for each row execute function public.fn_order_payment();

-- ---- "on account" (pay later) as an order payment method ----
alter table public.orders drop constraint orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check check (payment_method in ('cod','vodafone_cash','instapay','account'));
update public.app_settings set value = jsonb_set(value, '{account}', '{"enabled":false}') where key = 'payments';

-- ===== 0008_files_notifications.sql =====
-- Phase 7a: private case files + persistent notifications
create table public.lab_case_files (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.lab_cases(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id),
  uploader_role text not null check (uploader_role in ('doctor','staff')),
  storage_path text not null unique,
  original_name text not null,
  mime_type text,
  size_bytes bigint not null check (size_bytes > 0),
  created_at timestamptz not null default now()
);
create index on public.lab_case_files(case_id);
alter table public.lab_case_files enable row level security;
create policy cfiles_own on public.lab_case_files for select to authenticated
  using (exists (select 1 from public.lab_cases c where c.id = case_id and c.doctor_id = auth.uid()));

-- PRIVATE bucket: files are only reachable through short-lived signed links issued by the API after an ownership check.
insert into storage.buckets (id, name, public, file_size_limit)
values ('case-files', 'case-files', false, 26214400) on conflict (id) do nothing;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  params jsonb not null default '{}',     -- the UI translates text from kind + params
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications(user_id, created_at desc);
create index on public.notifications(user_id) where read_at is null;
alter table public.notifications enable row level security;
create policy notif_own on public.notifications for select to authenticated using (user_id = auth.uid());

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;   -- lets connected dashboards update instantly
  end if;
end $$;

create or replace function public.staff_ids(p_roles text[]) returns uuid[] language sql stable as $$
  select coalesce(array_agg(distinct user_id), '{}') from public.user_roles where role::text = any (p_roles);
$$;

create or replace function public.notify(p_users uuid[], p_kind text, p_params jsonb, p_link text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into notifications(user_id, kind, params, link)
  select distinct u, p_kind, p_params, p_link from unnest(p_users) as u where u is not null;
end $$;

-- ---- cases ----
create or replace function public.fn_n_case_new() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform notify(staff_ids(array['super_admin','lab_manager']), 'case_new', jsonb_build_object('ref', new.case_number), '/admin/cases/' || new.id);
  perform notify(array[new.doctor_id], 'case_received', jsonb_build_object('ref', new.case_number), '/cases/' || new.id);
  return new;
end $$;
create trigger trg_n_case_new after insert on public.lab_cases for each row execute function public.fn_n_case_new();

create or replace function public.fn_n_case_status() returns trigger language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select * into c from lab_cases where id = new.case_id;
  perform notify(array[c.doctor_id], 'case_status', jsonb_build_object('ref', c.case_number, 'status_key', 'cs_' || new.to_status), '/cases/' || c.id);
  return new;
end $$;
create trigger trg_n_case_status after insert on public.lab_case_status_history
  for each row when (new.from_status is not null) execute function public.fn_n_case_status();

create or replace function public.fn_n_case_note() returns trigger language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select * into c from lab_cases where id = new.case_id;
  if new.author_role = 'doctor' then
    perform notify(staff_ids(array['super_admin','lab_manager']) || coalesce(array[c.assigned_to], '{}'), 'case_message', jsonb_build_object('ref', c.case_number), '/admin/cases/' || c.id);
  elsif new.visibility = 'doctor' then
    perform notify(array[c.doctor_id], 'case_message', jsonb_build_object('ref', c.case_number), '/cases/' || c.id);
  end if;
  return new;
end $$;
create trigger trg_n_case_note after insert on public.lab_case_notes for each row execute function public.fn_n_case_note();

-- ---- orders ----
create or replace function public.fn_n_order_new() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform notify(staff_ids(array['super_admin','lab_manager','order_manager']), 'order_new', jsonb_build_object('ref', new.order_number), '/admin/orders/' || new.id);
  perform notify(array[new.doctor_id], 'order_received', jsonb_build_object('ref', new.order_number), '/store/orders/' || new.id);
  return new;
end $$;
create trigger trg_n_order_new after update of total on public.orders
  for each row when (old.total = 0 and new.total > 0) execute function public.fn_n_order_new();

create or replace function public.fn_n_order_status() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform notify(array[new.doctor_id], 'order_status', jsonb_build_object('ref', new.order_number, 'status_key', 'os_' || new.status), '/store/orders/' || new.id);
  return new;
end $$;
create trigger trg_n_order_status after update of status on public.orders
  for each row when (old.status <> new.status) execute function public.fn_n_order_status();

create or replace function public.fn_n_order_pay() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.payment_status = 'awaiting_confirmation' then
    perform notify(staff_ids(array['super_admin','lab_manager','order_manager','accountant']), 'payment_proof', jsonb_build_object('ref', new.order_number), '/admin/orders/' || new.id);
  elsif new.payment_status in ('paid','rejected') then
    perform notify(array[new.doctor_id], 'payment_' || new.payment_status, jsonb_build_object('ref', new.order_number), '/store/orders/' || new.id);
  end if;
  return new;
end $$;
create trigger trg_n_order_pay after update of payment_status on public.orders
  for each row when (old.payment_status <> new.payment_status) execute function public.fn_n_order_pay();

-- ---- doctors ----
create or replace function public.fn_n_doctor_new() returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  select coalesce(full_name, email) into v_name from profiles where id = new.user_id;
  perform notify(staff_ids(array['super_admin','lab_manager']), 'doctor_new', jsonb_build_object('ref', coalesce(v_name, '')), '/admin/doctors');
  return new;
end $$;
create trigger trg_n_doctor_new after insert on public.doctor_profiles for each row execute function public.fn_n_doctor_new();

create or replace function public.fn_n_doctor_status() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform notify(array[new.user_id], 'doctor_status', jsonb_build_object('status_key', 'ds_' || new.status), '/dashboard');
  return new;
end $$;
create trigger trg_n_doctor_status after update of status on public.doctor_profiles
  for each row when (old.status <> new.status) execute function public.fn_n_doctor_status();

-- ===== 0009_deliveries_reports.sql =====
-- Phase 8: deliveries (orders + finished cases) and the reports function
create sequence public.delivery_seq;
create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('DL-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.delivery_seq')::text, 5, '0')),
  doctor_id uuid not null references public.profiles(id),
  order_id uuid references public.orders(id),
  case_id uuid references public.lab_cases(id),
  phone text not null default '',
  address text not null default '',
  instructions text,
  fee numeric(12,2) not null default 0,
  status text not null default 'awaiting_confirmation' check (status in
    ('awaiting_confirmation','confirmed','preparing','ready_for_dispatch','out_for_delivery','delivered','failed','rescheduled','cancelled')),
  assigned_to uuid references auth.users(id),
  scheduled_for date,
  delivered_at timestamptz,
  received_by text,                       -- proof of delivery: who received it + timestamp
  delivery_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((order_id is not null)::int + (case_id is not null)::int = 1)
);
create unique index uq_delivery_order on public.deliveries(order_id) where order_id is not null and status <> 'cancelled';
create unique index uq_delivery_case on public.deliveries(case_id) where case_id is not null and status <> 'cancelled';
create index on public.deliveries(doctor_id);
create index on public.deliveries(status);
create index on public.deliveries(assigned_to);
create trigger t_deliveries_upd before update on public.deliveries for each row execute function set_updated_at();

create table public.delivery_status_history (
  id bigint generated always as identity primary key,
  delivery_id uuid not null references public.deliveries(id) on delete cascade,
  from_status text, to_status text not null, note text,
  changed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index on public.delivery_status_history(delivery_id);

alter table public.deliveries enable row level security;
alter table public.delivery_status_history enable row level security;
create policy deliveries_own on public.deliveries for select to authenticated using (doctor_id = auth.uid());
create policy dhist_own on public.delivery_status_history for select to authenticated
  using (exists (select 1 from public.deliveries d where d.id = delivery_id and d.doctor_id = auth.uid()));

-- One place that moves a delivery. p_force is used only by automatic syncing from orders/cases.
create or replace function public.delivery_move(p_id uuid, p_status text, p_note text, p_user uuid, p_force boolean default false, p_received_by text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_cur text; ok boolean;
begin
  select status into v_cur from deliveries where id = p_id for update;
  if v_cur is null then raise exception 'delivery_not_found'; end if;
  if v_cur = p_status then return; end if;               -- idempotent: keeps mirrored updates from looping
  if v_cur in ('delivered','cancelled') then
    if p_force then return; end if;
    raise exception 'delivery_closed';
  end if;
  if not p_force then
    ok := case v_cur
      when 'awaiting_confirmation' then p_status in ('confirmed','cancelled')
      when 'confirmed' then p_status in ('preparing','ready_for_dispatch','cancelled')
      when 'preparing' then p_status in ('ready_for_dispatch','cancelled')
      when 'ready_for_dispatch' then p_status in ('out_for_delivery','cancelled')
      when 'out_for_delivery' then p_status in ('delivered','failed')
      when 'failed' then p_status in ('rescheduled','out_for_delivery','cancelled')
      when 'rescheduled' then p_status in ('ready_for_dispatch','out_for_delivery','cancelled')
      else false end;
    if not ok then raise exception 'invalid_transition'; end if;
  end if;
  update deliveries set status = p_status,
         delivered_at = case when p_status = 'delivered' then now() else delivered_at end,
         received_by = case when p_status = 'delivered' then coalesce(p_received_by, received_by) else received_by end
   where id = p_id;
  insert into delivery_status_history(delivery_id, from_status, to_status, note, changed_by) values (p_id, v_cur, p_status, p_note, p_user);
end $$;
revoke execute on function public.delivery_move(uuid,text,text,uuid,boolean,text) from public, anon, authenticated;

-- a delivery request is created automatically when an order is placed ...
create or replace function public.fn_delivery_from_order() returns trigger language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into deliveries(doctor_id, order_id, phone, address, instructions, fee) values (new.doctor_id, new.id, new.phone, new.address, new.delivery_instructions, new.delivery_fee)
  on conflict do nothing returning id into v_id;
  if v_id is not null then insert into delivery_status_history(delivery_id, from_status, to_status, note) values (v_id, null, 'awaiting_confirmation', 'Delivery requested'); end if;
  return new;
end $$;
create trigger trg_delivery_from_order after update of total on public.orders
  for each row when (old.total = 0 and new.total > 0) execute function public.fn_delivery_from_order();

-- ... and when a case is finished in the lab (production status stays separate from delivery status)
create or replace function public.fn_delivery_from_case() returns trigger language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_phone text; v_addr text;
begin
  select phone into v_phone from profiles where id = new.doctor_id;
  select coalesce(d.clinic_address, (select a.address_line from clinic_addresses a where a.doctor_id = new.doctor_id order by a.created_at desc limit 1), '')
    into v_addr from doctor_profiles d where d.user_id = new.doctor_id;
  insert into deliveries(doctor_id, case_id, phone, address, status) values (new.doctor_id, new.id, coalesce(v_phone, ''), coalesce(v_addr, ''), 'ready_for_dispatch')
  on conflict do nothing returning id into v_id;
  if v_id is not null then insert into delivery_status_history(delivery_id, from_status, to_status, note) values (v_id, null, 'ready_for_dispatch', 'Case ready for delivery'); end if;
  return new;
end $$;
create trigger trg_delivery_from_case after update of status on public.lab_cases
  for each row when (new.status = 'ready_for_delivery' and old.status <> 'ready_for_delivery') execute function public.fn_delivery_from_case();

-- order/case status  ->  delivery
create or replace function public.fn_sync_delivery_from_order() returns trigger language plpgsql security definer set search_path = public as $$
declare v_t text; d record;
begin
  v_t := case new.status when 'confirmed' then 'confirmed' when 'processing' then 'preparing' when 'out_for_delivery' then 'out_for_delivery' when 'delivered' then 'delivered' when 'cancelled' then 'cancelled' end;
  if v_t is not null then for d in select id from deliveries where order_id = new.id loop perform delivery_move(d.id, v_t, 'Order ' || new.status, null, true); end loop; end if;
  return new;
end $$;
create trigger trg_sync_delivery_order after update of status on public.orders
  for each row when (old.status <> new.status) execute function public.fn_sync_delivery_from_order();

create or replace function public.fn_sync_delivery_from_case() returns trigger language plpgsql security definer set search_path = public as $$
declare v_t text; d record;
begin
  v_t := case new.status when 'out_for_delivery' then 'out_for_delivery' when 'delivered' then 'delivered' when 'cancelled' then 'cancelled' end;
  if v_t is not null then for d in select id from deliveries where case_id = new.id loop perform delivery_move(d.id, v_t, 'Case ' || new.status, null, true); end loop; end if;
  return new;
end $$;
create trigger trg_sync_delivery_case after update of status on public.lab_cases
  for each row when (old.status <> new.status) execute function public.fn_sync_delivery_from_case();

-- delivery  ->  order/case (only when the move is valid for them; otherwise ignored)
create or replace function public.fn_mirror_delivery() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('out_for_delivery','delivered') then
    if new.order_id is not null then begin perform set_order_status(new.order_id, new.status, 'Delivery update', null); exception when others then null; end; end if;
    if new.case_id is not null then begin perform set_case_status(new.case_id, new.status, 'Delivery update', null, true); exception when others then null; end; end if;
  end if;
  return new;
end $$;
create trigger trg_mirror_delivery after update of status on public.deliveries
  for each row when (old.status <> new.status) execute function public.fn_mirror_delivery();

-- notifications
create or replace function public.fn_n_delivery_new() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform notify(staff_ids(array['super_admin','lab_manager','delivery_coordinator']), 'delivery_new', jsonb_build_object('ref', new.reference), '/admin/deliveries/' || new.id);
  return new;
end $$;
create trigger trg_n_delivery_new after insert on public.deliveries for each row execute function public.fn_n_delivery_new();

create or replace function public.fn_n_delivery_status() returns trigger language plpgsql security definer set search_path = public as $$
declare v_link text := case when new.order_id is not null then '/store/orders/' || new.order_id else '/cases/' || new.case_id end;
begin
  if new.status in ('failed','rescheduled') then
    perform notify(array[new.doctor_id], 'delivery_status', jsonb_build_object('ref', new.reference, 'status_key', 'dv_' || new.status), v_link);
  end if;
  if new.status = 'failed' then
    perform notify(staff_ids(array['super_admin','lab_manager','delivery_coordinator']), 'delivery_failed', jsonb_build_object('ref', new.reference), '/admin/deliveries/' || new.id);
  end if;
  return new;
end $$;
create trigger trg_n_delivery_status after update of status on public.deliveries
  for each row when (old.status <> new.status) execute function public.fn_n_delivery_status();

create or replace function public.fn_n_delivery_assigned() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.assigned_to is not null then perform notify(array[new.assigned_to], 'delivery_assigned', jsonb_build_object('ref', new.reference), '/admin/deliveries/' || new.id); end if;
  return new;
end $$;
create trigger trg_n_delivery_assigned after update of assigned_to on public.deliveries
  for each row when (old.assigned_to is distinct from new.assigned_to) execute function public.fn_n_delivery_assigned();

-- ---- reports (Cairo time zone) ----
create or replace function public.report_summary(p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = public as $$
with
 b as (select (p_from::timestamp at time zone 'Africa/Cairo') as s, ((p_to + 1)::timestamp at time zone 'Africa/Cairo') as e),
 o as (select * from orders, b where status <> 'cancelled' and created_at >= b.s and created_at < b.e),
 c as (select * from lab_cases, b where status not in ('cancelled','rejected') and total is not null and submitted_at >= b.s and submitted_at < b.e),
 led as (select l.* from doctor_account_entries l, b where l.created_at >= b.s and l.created_at < b.e)
select jsonb_build_object(
  'orders', jsonb_build_object('count', (select count(*) from o), 'total', coalesce((select sum(total) from o), 0)),
  'cases', jsonb_build_object('count', (select count(*) from c), 'total', coalesce((select sum(total) from c), 0)),
  'billed', coalesce((select sum(amount) from led where kind in ('charge','reversal')), 0),
  'collected', coalesce((select -sum(amount) from led where kind = 'payment'), 0),
  'outstanding', coalesce((select sum(balance) from doctor_balances where balance > 0), 0),
  'by_doctor', coalesce((select jsonb_agg(x) from (select p.full_name as name, sum(l.amount) as billed from led l join profiles p on p.id = l.doctor_id where l.kind in ('charge','reversal') group by p.full_name order by 2 desc limit 10) x), '[]'),
  'top_products', coalesce((select jsonb_agg(x) from (select i.sku, i.name_en as name, sum(i.quantity) as qty, sum(i.line_total) as revenue from order_items i join o on o.id = i.order_id group by i.sku, i.name_en order by 4 desc limit 10) x), '[]'),
  'daily', coalesce((select jsonb_agg(x order by x.day) from (
      select d::date as day,
             coalesce((select sum(o.total) from o where (o.created_at at time zone 'Africa/Cairo')::date = d::date), 0) as orders,
             coalesce((select sum(c.total) from c where (c.submitted_at at time zone 'Africa/Cairo')::date = d::date), 0) as cases
      from generate_series(p_from, p_to, interval '1 day') d) x), '[]')
);
$$;
revoke execute on function public.report_summary(date,date) from public, anon, authenticated;

-- ===== 0010_doctor_names.sql =====
-- Phase 8b: staff notifications and exports now carry the doctor's name and clinic, not just a code.
create or replace function public.doctor_params(p_id uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('doctor', coalesce(p.full_name, p.email, ''), 'clinic', coalesce(d.clinic_name, ''))
  from public.profiles p left join public.doctor_profiles d on d.user_id = p.id where p.id = p_id;
$$;

create or replace function public.fn_n_case_new() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform notify(staff_ids(array['super_admin','lab_manager']), 'case_new', jsonb_build_object('ref', new.case_number) || doctor_params(new.doctor_id), '/admin/cases/' || new.id);
  perform notify(array[new.doctor_id], 'case_received', jsonb_build_object('ref', new.case_number), '/cases/' || new.id);
  return new;
end $$;

create or replace function public.fn_n_case_note() returns trigger language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select * into c from lab_cases where id = new.case_id;
  if new.author_role = 'doctor' then
    perform notify(staff_ids(array['super_admin','lab_manager']) || coalesce(array[c.assigned_to], '{}'), 'case_message', jsonb_build_object('ref', c.case_number) || doctor_params(c.doctor_id), '/admin/cases/' || c.id);
  elsif new.visibility = 'doctor' then
    perform notify(array[c.doctor_id], 'case_message', jsonb_build_object('ref', c.case_number), '/cases/' || c.id);
  end if;
  return new;
end $$;

create or replace function public.fn_n_order_new() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform notify(staff_ids(array['super_admin','lab_manager','order_manager']), 'order_new', jsonb_build_object('ref', new.order_number) || doctor_params(new.doctor_id), '/admin/orders/' || new.id);
  perform notify(array[new.doctor_id], 'order_received', jsonb_build_object('ref', new.order_number), '/store/orders/' || new.id);
  return new;
end $$;

create or replace function public.fn_n_order_pay() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.payment_status = 'awaiting_confirmation' then
    perform notify(staff_ids(array['super_admin','lab_manager','order_manager','accountant']), 'payment_proof', jsonb_build_object('ref', new.order_number) || doctor_params(new.doctor_id), '/admin/orders/' || new.id);
  elsif new.payment_status in ('paid','rejected') then
    perform notify(array[new.doctor_id], 'payment_' || new.payment_status, jsonb_build_object('ref', new.order_number), '/store/orders/' || new.id);
  end if;
  return new;
end $$;

create or replace function public.fn_n_delivery_new() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform notify(staff_ids(array['super_admin','lab_manager','delivery_coordinator']), 'delivery_new', jsonb_build_object('ref', new.reference) || doctor_params(new.doctor_id), '/admin/deliveries/' || new.id);
  return new;
end $$;

create or replace function public.fn_n_delivery_status() returns trigger language plpgsql security definer set search_path = public as $$
declare v_link text := case when new.order_id is not null then '/store/orders/' || new.order_id else '/cases/' || new.case_id end;
begin
  if new.status in ('failed','rescheduled') then
    perform notify(array[new.doctor_id], 'delivery_status', jsonb_build_object('ref', new.reference, 'status_key', 'dv_' || new.status), v_link);
  end if;
  if new.status = 'failed' then
    perform notify(staff_ids(array['super_admin','lab_manager','delivery_coordinator']), 'delivery_failed', jsonb_build_object('ref', new.reference) || doctor_params(new.doctor_id), '/admin/deliveries/' || new.id);
  end if;
  return new;
end $$;

create or replace function public.fn_n_delivery_assigned() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.assigned_to is not null then perform notify(array[new.assigned_to], 'delivery_assigned', jsonb_build_object('ref', new.reference) || doctor_params(new.doctor_id), '/admin/deliveries/' || new.id); end if;
  return new;
end $$;

-- add names to notifications that already exist
update public.notifications n set params = n.params || doctor_params(c.doctor_id)
  from public.lab_cases c where n.link ~ '^/admin/cases/[0-9a-f-]{36}$' and c.id = regexp_replace(n.link, '^/admin/cases/', '')::uuid and not (n.params ? 'doctor');
update public.notifications n set params = n.params || doctor_params(o.doctor_id)
  from public.orders o where n.link ~ '^/admin/orders/[0-9a-f-]{36}$' and o.id = regexp_replace(n.link, '^/admin/orders/', '')::uuid and not (n.params ? 'doctor');
update public.notifications n set params = n.params || doctor_params(d.doctor_id)
  from public.deliveries d where n.link ~ '^/admin/deliveries/[0-9a-f-]{36}$' and d.id = regexp_replace(n.link, '^/admin/deliveries/', '')::uuid and not (n.params ? 'doctor');

-- detailed rows for the CSV export (Cairo time zone), with doctor and clinic names
create or replace function public.report_rows(p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = public as $$
with b as (select (p_from::timestamp at time zone 'Africa/Cairo') as s, ((p_to + 1)::timestamp at time zone 'Africa/Cairo') as e),
 u as (
  select 'order'::text as type, o.order_number as number, o.created_at as at, coalesce(p.full_name, p.email) as doctor, d.clinic_name as clinic, p.phone as phone,
         coalesce((select string_agg(i.name_en || ' x' || i.quantity, '; ') from order_items i where i.order_id = o.id), '') as items,
         o.status as status, o.payment_status as payment, o.total as total
    from orders o join profiles p on p.id = o.doctor_id left join doctor_profiles d on d.user_id = o.doctor_id, b where o.created_at >= b.s and o.created_at < b.e
  union all
  select 'case', c.case_number, c.submitted_at, coalesce(p.full_name, p.email), d.clinic_name, p.phone,
         c.service_name_en || ' x' || c.quantity, c.status, null, coalesce(c.total, 0)
    from lab_cases c join profiles p on p.id = c.doctor_id left join doctor_profiles d on d.user_id = c.doctor_id, b where c.submitted_at >= b.s and c.submitted_at < b.e
 )
select coalesce(jsonb_agg(x order by x.at desc), '[]'::jsonb) from (select * from u order by at desc limit 5000) x;
$$;
revoke execute on function public.report_rows(date,date) from public, anon, authenticated;

-- ===== 0011_external_alerts.sql =====
-- Phase 9: alerts outside the website (WhatsApp / Telegram) through a reliable outbox.
-- A message is queued in the same transaction that creates the in-app notification, so it cannot be lost
-- if the API is down; the API worker sends it later and retries failures.
create table public.notification_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  lang text not null default 'ar' check (lang in ('ar','en')),
  whatsapp_number text check (whatsapp_number is null or whatsapp_number ~ '^\+?[0-9]{8,15}$'),
  whatsapp_enabled boolean not null default false,
  telegram_chat_id text check (telegram_chat_id is null or telegram_chat_id ~ '^-?[0-9]{3,20}$'),
  telegram_enabled boolean not null default false,
  topics text[],                              -- null = every alert; otherwise only the listed topics
  updated_at timestamptz not null default now()
);

create table public.telegram_link_codes (      -- one-time codes used to connect a Telegram account safely
  code text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null
);

create table public.notification_outbox (
  id bigint generated always as identity primary key,
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('whatsapp','telegram')),
  destination text not null,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (notification_id, channel)           -- never queue the same message twice
);
create index on public.notification_outbox(status, next_attempt_at);
create index on public.notification_outbox(user_id, id desc);

alter table public.notification_prefs enable row level security;
alter table public.telegram_link_codes enable row level security;
alter table public.notification_outbox enable row level security;   -- service role only (contains phone numbers)

create or replace function public.notif_topic(p_kind text) returns text language sql immutable as $$
  select case
    when p_kind like 'case%' then 'cases'
    when p_kind like 'order%' or p_kind like 'payment%' then 'orders'
    when p_kind like 'doctor%' then 'doctors'
    when p_kind like 'delivery%' then 'deliveries'
    when p_kind = 'test' then 'test'
    else 'other' end;
$$;

create or replace function public.fn_enqueue_outbox() returns trigger language plpgsql security definer set search_path = public as $$
declare p record; v_topic text := notif_topic(new.kind);
begin
  select * into p from notification_prefs where user_id = new.user_id;
  if not found then return new; end if;
  if p.topics is not null and v_topic <> 'test' and not (v_topic = any (p.topics)) then return new; end if;
  if p.whatsapp_enabled and p.whatsapp_number is not null then
    insert into notification_outbox(notification_id, user_id, channel, destination) values (new.id, new.user_id, 'whatsapp', p.whatsapp_number) on conflict do nothing;
  end if;
  if p.telegram_enabled and p.telegram_chat_id is not null then
    insert into notification_outbox(notification_id, user_id, channel, destination) values (new.id, new.user_id, 'telegram', p.telegram_chat_id) on conflict do nothing;
  end if;
  return new;
end $$;
create trigger trg_enqueue_outbox after insert on public.notifications for each row execute function public.fn_enqueue_outbox();

-- The worker claims rows with SKIP LOCKED (safe with several API instances). A claimed row that never reports back is retried after 2 minutes.
create or replace function public.claim_outbox(p_limit int) returns setof public.notification_outbox
language sql security definer set search_path = public as $$
  update notification_outbox o set status = 'sending', attempts = o.attempts + 1, next_attempt_at = now() + interval '2 minutes'
   where o.id in (select id from notification_outbox where status in ('pending','sending') and next_attempt_at <= now() order by id limit p_limit for update skip locked)
  returning o.*;
$$;
revoke execute on function public.claim_outbox(int) from public, anon, authenticated;

-- ===== 0012_due_dates.sql =====
-- Phase 10: delivery deadline with a live countdown (set by the lab, shown to the doctor)
alter table public.lab_cases add column due_at timestamptz;
alter table public.orders add column due_at timestamptz;

