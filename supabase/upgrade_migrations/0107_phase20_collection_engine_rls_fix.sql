-- Phase 20.1 collection engine RLS fix.
-- Additive only: no DROP, DELETE, TRUNCATE, resets, or destructive data changes.
--
-- The Collections Command Centre writes to public.collections, while tenant office
-- context is now resolved through active leases/rooms. Company admins and users
-- with payment-posting access must be able to insert collection rows for offices
-- they are allowed to access, even when tenants.office_id is null.

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'collections'
  ) then
    alter table public.collections enable row level security;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'collections'
        and policyname = 'ddumba_v1_collections_read'
    ) then
      create policy ddumba_v1_collections_read on public.collections
      for select
      using (
        public.ddumba_v1_can_access_entity(company_id, office_id)
        and public.ddumba_v1_has_permission('collections.read')
      );
    end if;

    alter policy ddumba_v1_collections_read on public.collections
    using (
      public.ddumba_v1_can_access_entity(company_id, office_id)
      and (
        public.ddumba_v1_has_permission('collections.read')
        or public.ddumba_v1_has_permission('collections.view')
        or public.ddumba_v1_has_permission('collections.payment.post')
      )
    );

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'collections'
        and policyname = 'ddumba_v1_collections_insert'
    ) then
      create policy ddumba_v1_collections_insert on public.collections
      for insert
      with check (
        public.ddumba_v1_can_access_entity(company_id, office_id)
        and public.ddumba_v1_has_permission('collections.payment.post')
      );
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'collections'
        and policyname = 'ddumba_v1_collections_update'
    ) then
      create policy ddumba_v1_collections_update on public.collections
      for update
      using (
        public.ddumba_v1_can_access_entity(company_id, office_id)
        and public.ddumba_v1_has_permission('collections.payment.post')
      )
      with check (
        public.ddumba_v1_can_access_entity(company_id, office_id)
        and public.ddumba_v1_has_permission('collections.payment.post')
      );
    end if;
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'tenants'
  ) then
    alter table public.tenants enable row level security;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'tenants'
        and policyname = 'ddumba_v1_tenants_collection_balance_update'
    ) then
      create policy ddumba_v1_tenants_collection_balance_update on public.tenants
      for update
      using (
        company_id = public.ddumba_v1_current_company_id()
        and public.ddumba_v1_has_permission('collections.payment.post')
        and (
          public.ddumba_v1_can_access_office(office_id)
          or exists (
            select 1
            from public.rooms r
            where r.id = tenants.room_id
              and r.company_id = tenants.company_id
              and public.ddumba_v1_can_access_office(r.office_id)
          )
        )
      )
      with check (
        company_id = public.ddumba_v1_current_company_id()
        and public.ddumba_v1_has_permission('collections.payment.post')
        and (
          public.ddumba_v1_can_access_office(office_id)
          or exists (
            select 1
            from public.rooms r
            where r.id = tenants.room_id
              and r.company_id = tenants.company_id
              and public.ddumba_v1_can_access_office(r.office_id)
          )
        )
      );
    end if;
  end if;

  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'rooms'
  ) then
    alter table public.rooms enable row level security;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'rooms'
        and policyname = 'ddumba_v1_rooms_collection_balance_update'
    ) then
      create policy ddumba_v1_rooms_collection_balance_update on public.rooms
      for update
      using (
        public.ddumba_v1_can_access_entity(company_id, office_id)
        and public.ddumba_v1_has_permission('collections.payment.post')
      )
      with check (
        public.ddumba_v1_can_access_entity(company_id, office_id)
        and public.ddumba_v1_has_permission('collections.payment.post')
      );
    end if;
  end if;
end;
$$;
