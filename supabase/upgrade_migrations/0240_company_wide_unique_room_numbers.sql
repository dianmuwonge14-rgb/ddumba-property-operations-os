-- Company-wide room-number uniqueness.
-- Active rooms must be unique by company_id + normalized_room_number across all offices.

create or replace function public.ddumba_normalize_room_number(p_room_number text)
returns text
language sql
immutable
as $$
    select nullif(regexp_replace(upper(trim(coalesce(p_room_number, ''))), '[^A-Z0-9]+', '', 'g'), '')
$$;

alter table public.rooms
    add column if not exists normalized_room_number text;

update public.rooms
set normalized_room_number = public.ddumba_normalize_room_number(room_number)
where normalized_room_number is distinct from public.ddumba_normalize_room_number(room_number);

create or replace function public.ddumba_set_room_normalized_room_number()
returns trigger
language plpgsql
as $$
declare
    v_new_active boolean;
    v_old_active boolean;
    v_should_check boolean;
begin
    new.normalized_room_number := public.ddumba_normalize_room_number(new.room_number);
    if new.normalized_room_number is not null then
        if tg_op = 'INSERT' then
            new.room_number := new.normalized_room_number;
        elsif new.room_number is distinct from old.room_number then
            new.room_number := new.normalized_room_number;
        end if;
    end if;

    v_new_active := coalesce(new.removed, false) = false
        and lower(coalesce(new.status, 'active')) not in ('archived', 'deleted', 'removed')
        and new.normalized_room_number is not null;
    if tg_op = 'UPDATE' then
        v_old_active := coalesce(old.removed, false) = false
            and lower(coalesce(old.status, 'active')) not in ('archived', 'deleted', 'removed')
            and old.normalized_room_number is not null;
        v_should_check := v_new_active and (
            new.company_id is distinct from old.company_id
            or new.normalized_room_number is distinct from old.normalized_room_number
            or not v_old_active
        );
    else
        v_old_active := false;
        v_should_check := v_new_active;
    end if;

    if v_should_check and exists (
        select 1
        from public.rooms r
        where r.company_id = new.company_id
          and r.normalized_room_number = new.normalized_room_number
          and r.id is distinct from new.id
          and coalesce(r.removed, false) = false
          and lower(coalesce(r.status, 'active')) not in ('archived', 'deleted', 'removed')
        limit 1
    ) then
        raise exception 'Room number already exists.';
    end if;

    return new;
end;
$$;

drop trigger if exists trg_rooms_normalized_room_number on public.rooms;
create trigger trg_rooms_normalized_room_number
before insert or update of company_id, room_number, status, removed on public.rooms
for each row
execute function public.ddumba_set_room_normalized_room_number();

create or replace view public.room_number_duplicate_audit as
select
    r.company_id,
    r.normalized_room_number,
    count(*)::integer as duplicate_count,
    jsonb_agg(
        jsonb_build_object(
            'room_id', r.id,
            'room_number', r.room_number,
            'office_id', r.office_id,
            'office', o.name,
            'landlord_id', r.landlord_id,
            'landlord', l.full_name,
            'property_id', r.property_id,
            'property', coalesce(p.property_name, p.name),
            'occupancy_status', r.status
        )
        order by o.name nulls last, r.room_number, r.id
    ) as rooms
from public.rooms r
left join public.offices o on o.id = r.office_id
left join public.landlords l on l.id = r.landlord_id
left join public.properties p on p.id = r.property_id
where r.normalized_room_number is not null
  and coalesce(r.removed, false) = false
  and lower(coalesce(r.status, 'active')) not in ('archived', 'deleted', 'removed')
group by r.company_id, r.normalized_room_number
having count(*) > 1;

do $$
begin
    if not exists (select 1 from public.room_number_duplicate_audit) then
        create unique index if not exists idx_rooms_company_active_normalized_room_unique
            on public.rooms(company_id, normalized_room_number)
            where normalized_room_number is not null
              and coalesce(removed, false) = false
              and lower(coalesce(status, 'active')) not in ('archived', 'deleted', 'removed');
    else
        raise notice 'Existing duplicate room numbers found. New duplicates are blocked by trigger; resolve public.room_number_duplicate_audit before adding idx_rooms_company_active_normalized_room_unique.';
    end if;
end $$;

create index if not exists idx_rooms_company_normalized_room_lookup
    on public.rooms(company_id, normalized_room_number)
    where normalized_room_number is not null;

grant execute on function public.ddumba_normalize_room_number(text) to authenticated, service_role;
grant select on public.room_number_duplicate_audit to authenticated, service_role;
