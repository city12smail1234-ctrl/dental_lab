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
