-- Phase 6a: laboratory cases (the lab's real work, separate from store orders)
create sequence public.case_seq;

create table public.lab_cases (
  id uuid primary key default gen_random_uuid(),
  case_number text not null unique default ('CS-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.case_seq')::text, 5, '0')),
  doctor_id uuid not null references public.profiles(id),
  service_id uuid not null references public.lab_services(id),
  service_name_ar text not null, service_name_en text not null,        -- snapshot
  patient_ref text not null,            -- internal identifier only; avoid real patient names
  tooth_numbers text, material text, shade text, instructions text,
  status text not null default 'submitted' check (status in
    ('submitted','info_required','approved','designing','milling','finishing','quality_control',
     'ready_for_delivery','out_for_delivery','delivered','on_hold','rejected','cancelled')),
  assigned_to uuid references auth.users(id),
  estimated_completion date,
  idempotency_key text not null,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (doctor_id, idempotency_key)
);
create index on public.lab_cases(doctor_id, submitted_at desc);
create index on public.lab_cases(status);
create index on public.lab_cases(assigned_to);
create trigger t_cases_upd before update on public.lab_cases for each row execute function set_updated_at();

create table public.lab_case_status_history (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.lab_cases(id) on delete cascade,
  from_status text, to_status text not null, note text,
  changed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index on public.lab_case_status_history(case_id);

create table public.lab_case_notes (       -- internal staff notes are kept apart from doctor-visible messages
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.lab_cases(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  author_role text not null check (author_role in ('staff','doctor')),
  visibility text not null check (visibility in ('internal','doctor')),
  body text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  check (author_role <> 'doctor' or visibility = 'doctor')
);
create index on public.lab_case_notes(case_id);

alter table public.lab_cases enable row level security;
alter table public.lab_case_status_history enable row level security;
alter table public.lab_case_notes enable row level security;
create policy cases_own on public.lab_cases for select to authenticated using (doctor_id = auth.uid());
create policy chist_own on public.lab_case_status_history for select to authenticated
  using (exists (select 1 from public.lab_cases c where c.id = case_id and c.doctor_id = auth.uid()));
create policy cnotes_own on public.lab_case_notes for select to authenticated
  using (visibility = 'doctor' and exists (select 1 from public.lab_cases c where c.id = case_id and c.doctor_id = auth.uid()));

create or replace function public.create_case(p_user uuid, p_key text, p_service uuid, p_patient text, p_teeth text, p_material text, p_shade text, p_instr text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; s record;
begin
  select id into v_id from lab_cases where doctor_id = p_user and idempotency_key = p_key;
  if v_id is not null then return v_id; end if;
  if not exists (select 1 from doctor_profiles where user_id = p_user and status = 'approved') then raise exception 'doctor_not_approved'; end if;
  select * into s from lab_services where id = p_service and is_active;
  if s.id is null then raise exception 'service_unavailable'; end if;
  insert into lab_cases(doctor_id, service_id, service_name_ar, service_name_en, patient_ref, tooth_numbers, material, shade, instructions, idempotency_key)
  values (p_user, p_service, s.name_ar, s.name_en, p_patient, p_teeth, p_material, p_shade, p_instr, p_key) returning id into v_id;
  insert into lab_case_status_history(case_id, from_status, to_status, note, changed_by) values (v_id, null, 'submitted', 'Case submitted', p_user);
  return v_id;
end $$;

-- Server-side workflow rules. Staff and doctors have different allowed moves.
create or replace function public.set_case_status(p_case uuid, p_status text, p_note text, p_user uuid, p_staff boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_cur text; ok boolean; v_prod text[] := array['approved','designing','milling','finishing','quality_control'];
begin
  select status into v_cur from lab_cases where id = p_case for update;
  if v_cur is null then raise exception 'case_not_found'; end if;
  if v_cur in ('delivered','rejected','cancelled') then raise exception 'case_closed'; end if;
  if v_cur = p_status then raise exception 'invalid_transition'; end if;
  if not p_staff then
    ok := (v_cur in ('submitted','info_required') and p_status = 'cancelled') or (v_cur = 'info_required' and p_status = 'submitted');
  else
    ok := case
      when p_status = 'info_required' then v_cur = 'submitted'
      when p_status = 'rejected' then v_cur in ('submitted','info_required')
      when p_status = 'on_hold' then v_cur in ('submitted','approved','designing','milling','finishing','quality_control','ready_for_delivery')
      when p_status = 'cancelled' then true
      when p_status = 'approved' then v_cur in ('submitted','info_required','on_hold')
      when p_status in ('designing','milling','finishing','quality_control') then v_cur = any(v_prod) or v_cur = 'on_hold'
      when p_status = 'ready_for_delivery' then v_cur in ('finishing','quality_control','on_hold')
      when p_status = 'out_for_delivery' then v_cur = 'ready_for_delivery'
      when p_status = 'delivered' then v_cur = 'out_for_delivery'
      else false end;
  end if;
  if not ok then raise exception 'invalid_transition'; end if;
  update lab_cases set status = p_status where id = p_case;
  insert into lab_case_status_history(case_id, from_status, to_status, note, changed_by) values (p_case, v_cur, p_status, p_note, p_user);
end $$;

revoke execute on function public.create_case(uuid,text,uuid,text,text,text,text,text) from public, anon, authenticated;
revoke execute on function public.set_case_status(uuid,text,text,uuid,boolean) from public, anon, authenticated;
