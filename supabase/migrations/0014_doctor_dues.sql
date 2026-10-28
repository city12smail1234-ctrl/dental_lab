-- Phase 12: a doctor pays what he owes (transfer + receipt); once the lab confirms, it is deducted from his account immediately.
create table public.account_payments (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.profiles(id),
  amount numeric(12,2) not null check (amount > 0 and amount <= 10000000),
  method text not null check (method in ('vodafone_cash','instapay')),
  reference text not null,
  proof_path text,                                   -- receipt image, in the PRIVATE bucket 'payment-proofs'
  status text not null default 'pending' check (status in ('pending','confirmed','rejected')),
  reject_reason text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.account_payments(doctor_id, created_at desc);
create index on public.account_payments(status);
alter table public.account_payments enable row level security;       -- service role only
-- a doctor payment can credit the account only once, even if two admins click at the same moment
create unique index uq_ledger_dues_payment on public.doctor_account_entries(source_id) where source_type = 'manual' and kind = 'payment' and source_id is not null;

create or replace function public.confirm_dues(p_id uuid, p_admin uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select * into r from account_payments where id = p_id for update;
  if not found then raise exception 'payment_not_found'; end if;
  if r.status <> 'pending' then raise exception 'already_processed'; end if;
  insert into doctor_account_entries(doctor_id, kind, amount, source_type, source_id, reference, method, note, created_by)
  values (r.doctor_id, 'payment', -r.amount, 'manual', r.id, r.reference, r.method, 'Doctor payment confirmed', p_admin);
  update account_payments set status = 'confirmed', reviewed_by = p_admin, reviewed_at = now() where id = p_id;
end $$;

create or replace function public.reject_dues(p_id uuid, p_admin uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  select status into v_status from account_payments where id = p_id for update;
  if v_status is null then raise exception 'payment_not_found'; end if;
  if v_status <> 'pending' then raise exception 'already_processed'; end if;
  update account_payments set status = 'rejected', reject_reason = p_reason, reviewed_by = p_admin, reviewed_at = now() where id = p_id;
end $$;
revoke execute on function public.confirm_dues(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.reject_dues(uuid, uuid, text) from public, anon, authenticated;

-- notifications: the lab is told about a new payment, the doctor about the decision
create or replace function public.fn_n_dues_new() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform notify(staff_ids(array['super_admin','lab_manager','accountant']), 'dues_submitted', jsonb_build_object('ref', new.amount::text) || doctor_params(new.doctor_id), '/admin/payments');
  return new;
end $$;
create trigger trg_n_dues_new after insert on public.account_payments for each row execute function public.fn_n_dues_new();

create or replace function public.fn_n_dues_status() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform notify(array[new.doctor_id], 'dues_' || new.status, jsonb_build_object('ref', new.amount::text), '/account');
  return new;
end $$;
create trigger trg_n_dues_status after update of status on public.account_payments
  for each row when (old.status = 'pending' and new.status in ('confirmed','rejected')) execute function public.fn_n_dues_status();

create or replace function public.notif_topic(p_kind text) returns text language sql immutable as $$
  select case
    when p_kind like 'case%' then 'cases'
    when p_kind like 'order%' or p_kind like 'payment%' or p_kind like 'dues%' then 'orders'
    when p_kind like 'doctor%' then 'doctors'
    when p_kind like 'delivery%' then 'deliveries'
    when p_kind = 'test' then 'test'
    else 'other' end;
$$;
