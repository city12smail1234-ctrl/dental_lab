-- Phase 13: (a) invoices for delivered cases, (b) cash as a payment method for dues, (c) "Our works" gallery managed by the admin

-- (a) An invoice = a delivered case. How much of it is paid is DERIVED from the doctor's payments (oldest invoice first),
--     so partial payments just work: the rest stays open until the next payment.
create or replace function public.case_invoices(p_doctor uuid)
returns table (case_id uuid, case_number text, service_name_ar text, service_name_en text, quantity int, total numeric, delivered_at timestamptz, paid numeric, remaining numeric)
language sql stable security definer set search_path = public as $$
  with c as (
    select lc.id, lc.case_number, lc.service_name_ar, lc.service_name_en, lc.quantity, lc.total,
           coalesce((select max(h.created_at) from lab_case_status_history h where h.case_id = lc.id and h.to_status = 'delivered'), lc.updated_at) as delivered_at
    from lab_cases lc where lc.doctor_id = p_doctor and lc.status = 'delivered' and coalesce(lc.total, 0) > 0
  ),
  credit as (
    select coalesce(-sum(amount), 0) as total from doctor_account_entries
    where doctor_id = p_doctor and source_type = 'manual' and (kind = 'payment' or (kind = 'adjustment' and amount < 0))
  ),
  ordered as (
    select c.*, coalesce(sum(c.total) over (order by c.delivered_at, c.id rows between unbounded preceding and 1 preceding), 0) as before from c
  )
  select o.id, o.case_number, o.service_name_ar, o.service_name_en, o.quantity, o.total, o.delivered_at,
         least(o.total, greatest(0, credit.total - o.before)),
         o.total - least(o.total, greatest(0, credit.total - o.before))
  from ordered o cross join credit order by o.delivered_at desc;
$$;
revoke execute on function public.case_invoices(uuid) from public, anon, authenticated;

-- (b) a doctor can announce a cash payment (to the lab or the courier); the lab confirms when it receives the money
alter table public.account_payments drop constraint account_payments_method_check;
alter table public.account_payments add constraint account_payments_method_check check (method in ('vodafone_cash','instapay','cash'));

-- (c) Our works
create table public.works (
  id uuid primary key default gen_random_uuid(),
  title_ar text not null, title_en text not null,
  description_ar text, description_en text,
  is_published boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger t_works_upd before update on public.works for each row execute function set_updated_at();
create table public.work_images (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.works(id) on delete cascade,
  storage_path text not null unique,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.work_images(work_id);
alter table public.works enable row level security;
alter table public.work_images enable row level security;     -- read and written only through the API

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('works', 'works', true, 5242880, array['image/jpeg','image/png','image/webp']) on conflict (id) do nothing;
