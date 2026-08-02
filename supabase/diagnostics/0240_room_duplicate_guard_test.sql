do $$
begin
    begin
        insert into public.rooms (
            company_id,
            office_id,
            property_id,
            landlord_id,
            room_number,
            monthly_rent,
            status
        )
        select
            company_id,
            office_id,
            property_id,
            landlord_id,
            'a 333',
            1,
            'vacant'
        from public.rooms
        where upper(regexp_replace(trim(coalesce(room_number, '')), '[^A-Za-z0-9]+', '', 'g')) = 'A333'
          and coalesce(removed, false) = false
          and lower(coalesce(status, 'active')) not in ('archived', 'deleted', 'removed')
        limit 1;

        raise exception 'duplicate insert unexpectedly succeeded';
    exception
        when others then
            if sqlerrm <> 'Room number already exists.' then
                raise;
            end if;
    end;
end $$;

select 'duplicate guard rejected a 333 as expected' as result;
