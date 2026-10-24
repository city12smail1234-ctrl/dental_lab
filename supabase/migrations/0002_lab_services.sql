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
