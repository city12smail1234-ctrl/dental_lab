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
