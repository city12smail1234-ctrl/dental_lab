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
