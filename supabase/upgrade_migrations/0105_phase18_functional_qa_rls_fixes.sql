-- Phase 18 functional QA RLS fixes.
-- Additive only: no DROP, DELETE, TRUNCATE, resets, or destructive data changes.

alter table if exists public.offices enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'offices'
      and policyname = 'ddumba_v1_offices_read'
  ) then
    create policy ddumba_v1_offices_read on public.offices
    for select
    using (
      public.ddumba_v1_is_service_role()
      or company_id = public.ddumba_v1_current_company_id()
      or public.ddumba_v1_can_access_office(id)
    );
  end if;
end;
$$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'promises') then
    alter table public.promises enable row level security;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'promises' and policyname = 'ddumba_v1_promises_read'
    ) then
      create policy ddumba_v1_promises_read on public.promises
      for select
      using (public.ddumba_v1_can_access_entity(company_id, office_id));
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'promises' and policyname = 'ddumba_v1_promises_insert'
    ) then
      create policy ddumba_v1_promises_insert on public.promises
      for insert
      with check (public.ddumba_v1_can_access_entity(company_id, office_id));
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'promises' and policyname = 'ddumba_v1_promises_update'
    ) then
      create policy ddumba_v1_promises_update on public.promises
      for update
      using (public.ddumba_v1_can_access_entity(company_id, office_id))
      with check (public.ddumba_v1_can_access_entity(company_id, office_id));
    end if;
  end if;
end;
$$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'promise_followups') then
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'promise_followups' and policyname = 'ddumba_v1_promise_followups_insert'
    ) then
      create policy ddumba_v1_promise_followups_insert on public.promise_followups
      for insert
      with check (
        public.ddumba_v1_is_service_role()
        or company_id = public.ddumba_v1_current_company_id()
      );
    end if;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'collection_actions') then
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'collection_actions' and policyname = 'ddumba_v1_collection_actions_insert'
    ) then
      create policy ddumba_v1_collection_actions_insert on public.collection_actions
      for insert
      with check (public.ddumba_v1_can_access_entity(company_id, office_id));
    end if;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'audit_logs') then
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'audit_logs' and policyname = 'ddumba_v1_audit_logs_insert'
    ) then
      create policy ddumba_v1_audit_logs_insert on public.audit_logs
      for insert
      with check (
        public.ddumba_v1_is_service_role()
        or company_id = public.ddumba_v1_current_company_id()
      );
    end if;
  end if;
end;
$$;
