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
