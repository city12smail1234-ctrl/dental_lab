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
