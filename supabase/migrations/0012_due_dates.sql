-- Phase 10: delivery deadline with a live countdown (set by the lab, shown to the doctor)
alter table public.lab_cases add column due_at timestamptz;
alter table public.orders add column due_at timestamptz;
