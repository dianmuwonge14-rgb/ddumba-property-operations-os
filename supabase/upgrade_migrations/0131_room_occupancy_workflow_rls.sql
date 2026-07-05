-- Phase: Room occupancy workflow RLS.
-- Purpose: allow office-scoped users to create/update leases for rooms in their own office.
-- Admin policies already exist; this adds safe office-scoped write coverage.

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'leases') then
    alter table public.leases enable row level security;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'leases'
        and policyname = 'ddumba_v1_leases_office_occupancy_insert'
    ) then
      create policy ddumba_v1_leases_office_occupancy_insert
        on public.leases
        for insert
        with check (
          public.ddumba_v1_is_service_role()
          or public.ddumba_v1_can_access_entity(company_id, office_id)
        );
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'leases'
        and policyname = 'ddumba_v1_leases_office_occupancy_update'
    ) then
      create policy ddumba_v1_leases_office_occupancy_update
        on public.leases
        for update
        using (
          public.ddumba_v1_is_service_role()
          or public.ddumba_v1_can_access_entity(company_id, office_id)
        )
        with check (
          public.ddumba_v1_is_service_role()
          or public.ddumba_v1_can_access_entity(company_id, office_id)
        );
    end if;
  end if;
end $$;
