-- Phase: landlord performance rebuild.
-- Additive only. Creates lightweight search support without changing business records.

create extension if not exists pg_trgm with schema extensions;

create table if not exists public.landlord_search_index (
    landlord_id uuid primary key references public.landlords(id) on delete cascade,
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete cascade,
    landlord_name text not null,
    normalized_name text not null,
    phone text,
    office_name text,
    location_text text,
    room_numbers_text text,
    tenant_names_text text,
    searchable_text text not null,
    room_count integer not null default 0,
    rent_roll numeric(14,2) not null default 0,
    net_payable numeric(14,2) not null default 0,
    updated_at timestamptz not null default now()
);

create index if not exists idx_landlord_search_index_company_office
    on public.landlord_search_index(company_id, office_id);

create index if not exists idx_landlord_search_index_searchable_trgm
    on public.landlord_search_index using gin (searchable_text gin_trgm_ops);

create index if not exists idx_landlord_search_index_name_trgm
    on public.landlord_search_index using gin (normalized_name gin_trgm_ops);

create index if not exists idx_perf_landlords_normalized_name_trgm
    on public.landlords using gin (lower(regexp_replace(coalesce(full_name, ''), '[^a-zA-Z0-9]+', ' ', 'g')) gin_trgm_ops);

create index if not exists idx_perf_landlords_phone_trgm
    on public.landlords using gin (coalesce(phone, '') gin_trgm_ops);

create index if not exists idx_perf_rooms_room_number_trgm
    on public.rooms using gin (coalesce(room_number, '') gin_trgm_ops);

create index if not exists idx_perf_offices_name_trgm
    on public.offices using gin (lower(coalesce(office_name, name, '')) gin_trgm_ops);

create index if not exists idx_perf_tenants_full_name_trgm
    on public.tenants using gin (coalesce(full_name, '') gin_trgm_ops);

create index if not exists idx_perf_tenants_phone_trgm
    on public.tenants using gin (coalesce(phone, '') gin_trgm_ops);

create or replace function public.ddumba_v1_refresh_landlord_search_index(p_landlord_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.landlord_search_index (
        landlord_id,
        company_id,
        office_id,
        landlord_name,
        normalized_name,
        phone,
        office_name,
        location_text,
        room_numbers_text,
        tenant_names_text,
        searchable_text,
        room_count,
        rent_roll,
        net_payable,
        updated_at
    )
    select
        l.id,
        l.company_id,
        min(r.office_id::text)::uuid,
        coalesce(l.full_name, 'Unnamed landlord'),
        lower(regexp_replace(coalesce(l.full_name, ''), '[^a-zA-Z0-9]+', ' ', 'g')),
        l.phone,
        string_agg(distinct coalesce(o.office_name, o.name), ' '),
        string_agg(distinct coalesce(p.property_name, p.name, p.village, p.city, p.address), ' '),
        string_agg(distinct r.room_number, ' '),
        string_agg(distinct t.full_name, ' '),
        lower(concat_ws(
            ' ',
            l.full_name,
            l.phone,
            l.email,
            l.landlord_code,
            string_agg(distinct coalesce(o.office_name, o.name), ' '),
            string_agg(distinct coalesce(p.property_name, p.name, p.village, p.city, p.address), ' '),
            string_agg(distinct r.room_number, ' '),
            string_agg(distinct t.full_name, ' '),
            string_agg(distinct t.phone, ' ')
        )),
        count(distinct r.id),
        coalesce(sum(coalesce(r.monthly_rent, 0)), 0),
        0,
        now()
    from public.landlords l
    left join public.rooms r
        on r.landlord_id = l.id
        and r.company_id = l.company_id
        and coalesce(lower(r.status), 'active') not in ('archived', 'inactive', 'deleted', 'removed')
    left join public.properties p
        on p.id = r.property_id
        and p.company_id = l.company_id
    left join public.offices o
        on o.id = r.office_id
        and o.company_id = l.company_id
    left join public.tenants t
        on t.room_id = r.id
        and t.company_id = l.company_id
        and coalesce(lower(t.status), 'active') <> 'archived'
    where l.id = p_landlord_id
    group by l.id
    on conflict (landlord_id) do update
    set
        company_id = excluded.company_id,
        office_id = excluded.office_id,
        landlord_name = excluded.landlord_name,
        normalized_name = excluded.normalized_name,
        phone = excluded.phone,
        office_name = excluded.office_name,
        location_text = excluded.location_text,
        room_numbers_text = excluded.room_numbers_text,
        tenant_names_text = excluded.tenant_names_text,
        searchable_text = excluded.searchable_text,
        room_count = excluded.room_count,
        rent_roll = excluded.rent_roll,
        net_payable = excluded.net_payable,
        updated_at = now();
end;
$$;

alter table public.landlord_search_index enable row level security;

drop policy if exists landlord_search_index_read on public.landlord_search_index;
create policy landlord_search_index_read
on public.landlord_search_index
for select
using (
    public.ddumba_v1_is_service_role()
    or public.ddumba_v1_is_company_admin()
    or (office_id is not null and public.ddumba_v1_can_access_office(office_id))
);

drop policy if exists landlord_search_index_admin_write on public.landlord_search_index;
create policy landlord_search_index_admin_write
on public.landlord_search_index
for all
using (public.ddumba_v1_is_service_role() or public.ddumba_v1_is_company_admin())
with check (public.ddumba_v1_is_service_role() or public.ddumba_v1_is_company_admin());
