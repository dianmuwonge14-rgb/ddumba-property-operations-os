-- Phase: Landlord Portfolio office access fix
-- Purpose: allow office users to read landlords linked directly through rooms in their office.
-- Safe: additive select policy only. No data deletion, no table/column drops.

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'landlords'
  ) then
    alter table public.landlords enable row level security;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'landlords'
        and policyname = 'ddumba_v1_landlords_room_portfolio_read'
    ) then
      create policy ddumba_v1_landlords_room_portfolio_read
        on public.landlords
        for select
        using (
          company_id = public.ddumba_v1_current_company_id()
          and (
            public.ddumba_v1_is_company_admin()
            or exists (
              select 1
              from public.rooms r
              where r.landlord_id = landlords.id
                and r.company_id = landlords.company_id
                and public.ddumba_v1_can_access_office(r.office_id)
            )
            or exists (
              select 1
              from public.properties p
              where p.landlord_id = landlords.id
                and p.company_id = landlords.company_id
                and public.ddumba_v1_can_access_office(p.office_id)
            )
          )
        );
    end if;
  end if;
end $$;
