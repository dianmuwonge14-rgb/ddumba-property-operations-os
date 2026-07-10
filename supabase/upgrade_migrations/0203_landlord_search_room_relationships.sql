-- Landlord portfolio search repair.
-- Adds fast lookup support for room/phone/property searches and refreshes the
-- compact landlord search index with rooms linked through properties too.

create extension if not exists pg_trgm with schema extensions;

create index if not exists idx_landlord_search_index_phone_trgm
    on public.landlord_search_index using gin (coalesce(phone, '') gin_trgm_ops);

create index if not exists idx_landlord_search_index_room_numbers_trgm
    on public.landlord_search_index using gin (coalesce(room_numbers_text, '') gin_trgm_ops);

create index if not exists idx_landlord_search_index_office_name_trgm
    on public.landlord_search_index using gin (coalesce(office_name, '') gin_trgm_ops);

create index if not exists idx_landlord_search_index_location_text_trgm
    on public.landlord_search_index using gin (coalesce(location_text, '') gin_trgm_ops);

create index if not exists idx_rooms_company_property_active
    on public.rooms(company_id, property_id, status);

create index if not exists idx_rooms_company_landlord_active
    on public.rooms(company_id, landlord_id, status);

create index if not exists idx_properties_company_landlord_active
    on public.properties(company_id, landlord_id, status);

create index if not exists idx_property_landlords_company_property_landlord
    on public.property_landlords(company_id, property_id, landlord_id);

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
    with target_landlord as (
        select *
        from public.landlords
        where id = p_landlord_id
    ),
    portfolio_rooms as (
        select distinct r.*
        from target_landlord l
        join public.rooms r
            on r.company_id = l.company_id
            and coalesce(lower(r.status), 'active') not in ('archived', 'inactive', 'deleted', 'removed')
        left join public.properties p
            on p.id = r.property_id
            and p.company_id = l.company_id
        left join public.property_landlords pl
            on pl.property_id = r.property_id
            and pl.company_id = l.company_id
        where r.landlord_id = l.id
            or p.landlord_id = l.id
            or pl.landlord_id = l.id
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
    from target_landlord l
    left join portfolio_rooms r
        on true
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
    group by l.id, l.company_id, l.full_name, l.phone, l.email, l.landlord_code
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

do $$
declare
    landlord_record record;
begin
    for landlord_record in
        select id
        from public.landlords
        where coalesce(lower(status), 'active') not in ('archived', 'inactive', 'deleted', 'removed')
    loop
        perform public.ddumba_v1_refresh_landlord_search_index(landlord_record.id);
    end loop;
end $$;
