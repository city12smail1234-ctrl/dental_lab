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
