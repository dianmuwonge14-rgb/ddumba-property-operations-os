-- Phase: Admin landlord room management RLS fix
-- Purpose: allow authenticated company admins to create/update/delete rooms and create active tenant/lease records
-- for landlord room management while keeping office users blocked from admin-only workflows.
-- Safe: additive RLS policies only. No table drops, no column drops, no data deletion.

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'leases') then
    alter table public.leases enable row level security;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'leases'
        and policyname = 'ddumba_v1_leases_admin_landlord_room_management_insert'
    ) then
      create policy ddumba_v1_leases_admin_landlord_room_management_insert
        on public.leases
        for insert
        with check (
          public.ddumba_v1_is_service_role()
          or (
            company_id = public.ddumba_v1_current_company_id()
            and public.ddumba_v1_is_company_admin()
            and public.ddumba_v1_can_access_office(office_id)
          )
        );
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'leases'
        and policyname = 'ddumba_v1_leases_admin_landlord_room_management_update'
    ) then
      create policy ddumba_v1_leases_admin_landlord_room_management_update
        on public.leases
        for update
        using (
          public.ddumba_v1_is_service_role()
          or (
            company_id = public.ddumba_v1_current_company_id()
            and public.ddumba_v1_is_company_admin()
            and public.ddumba_v1_can_access_office(office_id)
          )
        )
        with check (
          public.ddumba_v1_is_service_role()
          or (
            company_id = public.ddumba_v1_current_company_id()
            and public.ddumba_v1_is_company_admin()
            and public.ddumba_v1_can_access_office(office_id)
          )
        );
    end if;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'rooms') then
    alter table public.rooms enable row level security;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'rooms'
        and policyname = 'ddumba_v1_rooms_admin_landlord_room_management_delete'
    ) then
      create policy ddumba_v1_rooms_admin_landlord_room_management_delete
        on public.rooms
        for delete
        using (
          public.ddumba_v1_is_service_role()
          or (
            company_id = public.ddumba_v1_current_company_id()
            and public.ddumba_v1_is_company_admin()
            and public.ddumba_v1_can_access_office(office_id)
          )
        );
    end if;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'tenants') then
    alter table public.tenants enable row level security;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'tenants'
        and policyname = 'ddumba_v1_tenants_admin_landlord_room_management_update'
    ) then
      create policy ddumba_v1_tenants_admin_landlord_room_management_update
        on public.tenants
        for update
        using (
          public.ddumba_v1_is_service_role()
          or (
            company_id = public.ddumba_v1_current_company_id()
            and public.ddumba_v1_is_company_admin()
            and public.ddumba_v1_can_access_office(office_id)
          )
        )
        with check (
          public.ddumba_v1_is_service_role()
          or (
            company_id = public.ddumba_v1_current_company_id()
            and public.ddumba_v1_is_company_admin()
            and public.ddumba_v1_can_access_office(office_id)
          )
        );
    end if;
  end if;
end $$;
