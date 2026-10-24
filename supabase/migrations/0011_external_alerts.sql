-- Phase 9: alerts outside the website (WhatsApp / Telegram) through a reliable outbox.
-- A message is queued in the same transaction that creates the in-app notification, so it cannot be lost
-- if the API is down; the API worker sends it later and retries failures.
create table public.notification_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  lang text not null default 'ar' check (lang in ('ar','en')),
  whatsapp_number text check (whatsapp_number is null or whatsapp_number ~ '^\+?[0-9]{8,15}$'),
  whatsapp_enabled boolean not null default false,
  telegram_chat_id text check (telegram_chat_id is null or telegram_chat_id ~ '^-?[0-9]{3,20}$'),
  telegram_enabled boolean not null default false,
  topics text[],                              -- null = every alert; otherwise only the listed topics
  updated_at timestamptz not null default now()
);

create table public.telegram_link_codes (      -- one-time codes used to connect a Telegram account safely
  code text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null
);

create table public.notification_outbox (
  id bigint generated always as identity primary key,
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('whatsapp','telegram')),
  destination text not null,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (notification_id, channel)           -- never queue the same message twice
);
create index on public.notification_outbox(status, next_attempt_at);
create index on public.notification_outbox(user_id, id desc);

alter table public.notification_prefs enable row level security;
alter table public.telegram_link_codes enable row level security;
alter table public.notification_outbox enable row level security;   -- service role only (contains phone numbers)

create or replace function public.notif_topic(p_kind text) returns text language sql immutable as $$
  select case
    when p_kind like 'case%' then 'cases'
    when p_kind like 'order%' or p_kind like 'payment%' then 'orders'
    when p_kind like 'doctor%' then 'doctors'
    when p_kind like 'delivery%' then 'deliveries'
    when p_kind = 'test' then 'test'
    else 'other' end;
$$;

create or replace function public.fn_enqueue_outbox() returns trigger language plpgsql security definer set search_path = public as $$
declare p record; v_topic text := notif_topic(new.kind);
begin
  select * into p from notification_prefs where user_id = new.user_id;
  if not found then return new; end if;
  if p.topics is not null and v_topic <> 'test' and not (v_topic = any (p.topics)) then return new; end if;
  if p.whatsapp_enabled and p.whatsapp_number is not null then
    insert into notification_outbox(notification_id, user_id, channel, destination) values (new.id, new.user_id, 'whatsapp', p.whatsapp_number) on conflict do nothing;
  end if;
  if p.telegram_enabled and p.telegram_chat_id is not null then
    insert into notification_outbox(notification_id, user_id, channel, destination) values (new.id, new.user_id, 'telegram', p.telegram_chat_id) on conflict do nothing;
  end if;
  return new;
end $$;
create trigger trg_enqueue_outbox after insert on public.notifications for each row execute function public.fn_enqueue_outbox();

-- The worker claims rows with SKIP LOCKED (safe with several API instances). A claimed row that never reports back is retried after 2 minutes.
create or replace function public.claim_outbox(p_limit int) returns setof public.notification_outbox
language sql security definer set search_path = public as $$
  update notification_outbox o set status = 'sending', attempts = o.attempts + 1, next_attempt_at = now() + interval '2 minutes'
   where o.id in (select id from notification_outbox where status in ('pending','sending') and next_attempt_at <= now() order by id limit p_limit for update skip locked)
  returning o.*;
$$;
revoke execute on function public.claim_outbox(int) from public, anon, authenticated;
