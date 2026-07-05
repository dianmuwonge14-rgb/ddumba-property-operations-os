-- Phase 25 follow-up: allow scoped attendance dashboards to read their office workforce rows.
-- Additive only. No data mutation.

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'employees'
      and policyname = 'employees_phase25_scoped_select'
  ) then
    create policy employees_phase25_scoped_select
    on public.employees
    for select
    using (public.ddumba_v1_can_access_entity(company_id, office_id));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'attendance_events'
      and policyname = 'attendance_events_phase25_scoped_select'
  ) then
    create policy attendance_events_phase25_scoped_select
    on public.attendance_events
    for select
    using (public.ddumba_v1_can_access_entity(company_id, office_id));
  end if;
end $$;
