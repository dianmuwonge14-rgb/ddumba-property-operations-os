select
    upper(regexp_replace(trim(coalesce(room_number, '')), '[^A-Za-z0-9]+', '', 'g')) as normalized_room_number,
    count(*) as duplicate_count,
    jsonb_agg(
        jsonb_build_object(
            'room_id', id,
            'room_number', room_number,
            'office_id', office_id,
            'landlord_id', landlord_id,
            'property_id', property_id,
            'status', status
        )
        order by room_number, id
    ) as rooms
from public.rooms
where nullif(upper(regexp_replace(trim(coalesce(room_number, '')), '[^A-Za-z0-9]+', '', 'g')), '') is not null
  and coalesce(removed, false) = false
  and lower(coalesce(status, 'active')) not in ('archived', 'deleted', 'removed')
group by company_id, upper(regexp_replace(trim(coalesce(room_number, '')), '[^A-Za-z0-9]+', '', 'g'))
having count(*) > 1
order by duplicate_count desc, normalized_room_number
limit 50;
