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
