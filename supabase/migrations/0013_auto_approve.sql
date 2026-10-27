-- Phase 11: doctors are active as soon as they register (no manual approval step).
-- The admin can still suspend or reject an account afterwards from the Doctors page.
alter table public.doctor_profiles alter column status set default 'approved';
update public.doctor_profiles set status = 'approved', reviewed_at = now() where status = 'pending';
