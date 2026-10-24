-- Phase 8b: staff notifications and exports now carry the doctor's name and clinic, not just a code.
create or replace function public.doctor_params(p_id uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('doctor', coalesce(p.full_name, p.email, ''), 'clinic', coalesce(d.clinic_name, ''))
  from public.profiles p left join public.doctor_profiles d on d.user_id = p.id where p.id = p_id;
$$;

create or replace function public.fn_n_case_new() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform notify(staff_ids(array['super_admin','lab_manager']), 'case_new', jsonb_build_object('ref', new.case_number) || doctor_params(new.doctor_id), '/admin/cases/' || new.id);
  perform notify(array[new.doctor_id], 'case_received', jsonb_build_object('ref', new.case_number), '/cases/' || new.id);
  return new;
end $$;

create or replace function public.fn_n_case_note() returns trigger language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select * into c from lab_cases where id = new.case_id;
  if new.author_role = 'doctor' then
    perform notify(staff_ids(array['super_admin','lab_manager']) || coalesce(array[c.assigned_to], '{}'), 'case_message', jsonb_build_object('ref', c.case_number) || doctor_params(c.doctor_id), '/admin/cases/' || c.id);
  elsif new.visibility = 'doctor' then
    perform notify(array[c.doctor_id], 'case_message', jsonb_build_object('ref', c.case_number), '/cases/' || c.id);
  end if;
  return new;
end $$;

create or replace function public.fn_n_order_new() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform notify(staff_ids(array['super_admin','lab_manager','order_manager']), 'order_new', jsonb_build_object('ref', new.order_number) || doctor_params(new.doctor_id), '/admin/orders/' || new.id);
  perform notify(array[new.doctor_id], 'order_received', jsonb_build_object('ref', new.order_number), '/store/orders/' || new.id);
  return new;
end $$;

create or replace function public.fn_n_order_pay() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.payment_status = 'awaiting_confirmation' then
    perform notify(staff_ids(array['super_admin','lab_manager','order_manager','accountant']), 'payment_proof', jsonb_build_object('ref', new.order_number) || doctor_params(new.doctor_id), '/admin/orders/' || new.id);
  elsif new.payment_status in ('paid','rejected') then
    perform notify(array[new.doctor_id], 'payment_' || new.payment_status, jsonb_build_object('ref', new.order_number), '/store/orders/' || new.id);
  end if;
  return new;
end $$;

create or replace function public.fn_n_delivery_new() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform notify(staff_ids(array['super_admin','lab_manager','delivery_coordinator']), 'delivery_new', jsonb_build_object('ref', new.reference) || doctor_params(new.doctor_id), '/admin/deliveries/' || new.id);
  return new;
end $$;

create or replace function public.fn_n_delivery_status() returns trigger language plpgsql security definer set search_path = public as $$
declare v_link text := case when new.order_id is not null then '/store/orders/' || new.order_id else '/cases/' || new.case_id end;
begin
  if new.status in ('failed','rescheduled') then
    perform notify(array[new.doctor_id], 'delivery_status', jsonb_build_object('ref', new.reference, 'status_key', 'dv_' || new.status), v_link);
  end if;
  if new.status = 'failed' then
    perform notify(staff_ids(array['super_admin','lab_manager','delivery_coordinator']), 'delivery_failed', jsonb_build_object('ref', new.reference) || doctor_params(new.doctor_id), '/admin/deliveries/' || new.id);
  end if;
  return new;
end $$;

create or replace function public.fn_n_delivery_assigned() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.assigned_to is not null then perform notify(array[new.assigned_to], 'delivery_assigned', jsonb_build_object('ref', new.reference) || doctor_params(new.doctor_id), '/admin/deliveries/' || new.id); end if;
  return new;
end $$;

-- add names to notifications that already exist
update public.notifications n set params = n.params || doctor_params(c.doctor_id)
  from public.lab_cases c where n.link ~ '^/admin/cases/[0-9a-f-]{36}$' and c.id = regexp_replace(n.link, '^/admin/cases/', '')::uuid and not (n.params ? 'doctor');
update public.notifications n set params = n.params || doctor_params(o.doctor_id)
  from public.orders o where n.link ~ '^/admin/orders/[0-9a-f-]{36}$' and o.id = regexp_replace(n.link, '^/admin/orders/', '')::uuid and not (n.params ? 'doctor');
update public.notifications n set params = n.params || doctor_params(d.doctor_id)
  from public.deliveries d where n.link ~ '^/admin/deliveries/[0-9a-f-]{36}$' and d.id = regexp_replace(n.link, '^/admin/deliveries/', '')::uuid and not (n.params ? 'doctor');

-- detailed rows for the CSV export (Cairo time zone), with doctor and clinic names
create or replace function public.report_rows(p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = public as $$
with b as (select (p_from::timestamp at time zone 'Africa/Cairo') as s, ((p_to + 1)::timestamp at time zone 'Africa/Cairo') as e),
 u as (
  select 'order'::text as type, o.order_number as number, o.created_at as at, coalesce(p.full_name, p.email) as doctor, d.clinic_name as clinic, p.phone as phone,
         coalesce((select string_agg(i.name_en || ' x' || i.quantity, '; ') from order_items i where i.order_id = o.id), '') as items,
         o.status as status, o.payment_status as payment, o.total as total
    from orders o join profiles p on p.id = o.doctor_id left join doctor_profiles d on d.user_id = o.doctor_id, b where o.created_at >= b.s and o.created_at < b.e
  union all
  select 'case', c.case_number, c.submitted_at, coalesce(p.full_name, p.email), d.clinic_name, p.phone,
         c.service_name_en || ' x' || c.quantity, c.status, null, coalesce(c.total, 0)
    from lab_cases c join profiles p on p.id = c.doctor_id left join doctor_profiles d on d.user_id = c.doctor_id, b where c.submitted_at >= b.s and c.submitted_at < b.e
 )
select coalesce(jsonb_agg(x order by x.at desc), '[]'::jsonb) from (select * from u order by at desc limit 5000) x;
$$;
revoke execute on function public.report_rows(date,date) from public, anon, authenticated;
