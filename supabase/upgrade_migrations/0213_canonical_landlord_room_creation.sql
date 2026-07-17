-- Canonical landlord room creation used by New Landlord and Landlord Portfolio.
-- It resolves merged offices to their active destination, rejects duplicate rooms,
-- stores opening outstanding separately from monthly rent, and refreshes search.

create or replace function public.ddumba_v1_resolve_active_office(
    p_company_id uuid,
    p_office_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_resolved_office_id uuid;
begin
    if p_company_id is null then
        raise exception 'Active company is required.';
    end if;
    if p_office_id is null then
        raise exception 'Office is required.';
    end if;

    select coalesce(
        case
            when lower(coalesce(status, 'active')) in ('merged', 'archived')
                 and merged_into_office_id is not null
                then merged_into_office_id
            else id
        end,
        id
    )
    into v_resolved_office_id
    from public.offices
    where id = p_office_id
      and company_id = p_company_id
    limit 1;

    if v_resolved_office_id is null then
        raise exception 'Office not found.';
    end if;

    return v_resolved_office_id;
end;
$$;

create or replace function public.ddumba_v1_create_landlord_room(
    p_company_id uuid,
    p_office_id uuid,
    p_landlord_id uuid,
    p_created_by uuid,
    p_room_payload jsonb,
    p_source text default 'landlord_room_creation'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_resolved_office_id uuid;
    v_property_id uuid;
    v_room_id uuid;
    v_tenant_id uuid;
    v_lease_id uuid;
    v_room_number text := upper(nullif(trim(coalesce(p_room_payload->>'roomNumber', p_room_payload->>'room_number')), ''));
    v_property_name text := nullif(trim(coalesce(p_room_payload->>'propertyName', p_room_payload->>'property_name', p_room_payload->>'propertyLocation', p_room_payload->>'property_location', p_room_payload->>'location')), '');
    v_rent numeric := coalesce(nullif(p_room_payload->>'monthlyRent', '')::numeric, nullif(p_room_payload->>'monthly_rent', '')::numeric, 0);
    v_status text := case when lower(coalesce(p_room_payload->>'status', 'vacant')) = 'occupied' then 'occupied' else 'vacant' end;
    v_start_date date := coalesce(nullif(p_room_payload->>'startDate', '')::date, nullif(p_room_payload->>'start_date', '')::date, current_date);
    v_move_in_date date := coalesce(nullif(p_room_payload->>'moveInDate', '')::date, nullif(p_room_payload->>'move_in_date', '')::date, v_start_date);
    v_opening_balance numeric := coalesce(
        nullif(p_room_payload->>'openingOutstanding', '')::numeric,
        nullif(p_room_payload->>'opening_outstanding', '')::numeric,
        nullif(p_room_payload->>'outstandingBalance', '')::numeric,
        nullif(p_room_payload->>'outstanding_balance', '')::numeric,
        0
    );
    v_room_location text := nullif(trim(coalesce(p_room_payload->>'roomLocation', p_room_payload->>'room_location', p_room_payload->>'floor')), '');
    v_notes text := nullif(trim(coalesce(p_room_payload->>'notes', '')), '');
begin
    if p_company_id is null then
        raise exception 'Active company is required.';
    end if;
    if p_landlord_id is null then
        raise exception 'Landlord is required.';
    end if;
    if not exists (
        select 1 from public.landlords
        where id = p_landlord_id
          and company_id = p_company_id
          and lower(coalesce(status, 'active')) not in ('archived', 'deleted', 'removed')
    ) then
        raise exception 'Landlord not found.';
    end if;
    if v_room_number is null then
        raise exception 'Every room needs a room number.';
    end if;
    if v_rent <= 0 then
        raise exception 'Room % needs a valid monthly rent.', v_room_number;
    end if;
    if v_opening_balance < 0 then
        raise exception 'Room % opening outstanding cannot be negative.', v_room_number;
    end if;

    v_resolved_office_id := public.ddumba_v1_resolve_active_office(p_company_id, p_office_id);

    if nullif(p_room_payload->>'propertyId', '') is not null then
        select id into v_property_id
        from public.properties
        where company_id = p_company_id
          and office_id = v_resolved_office_id
          and id = (p_room_payload->>'propertyId')::uuid
        limit 1;
        if v_property_id is null then
            raise exception 'Selected property/location was not found for room %.', v_room_number;
        end if;
    else
        if v_property_name is null then
            select r.property_id into v_property_id
            from public.rooms r
            where r.company_id = p_company_id
              and r.office_id = v_resolved_office_id
              and r.landlord_id = p_landlord_id
              and r.property_id is not null
              and coalesce(r.removed, false) = false
              and lower(coalesce(r.status, 'active')) not in ('archived', 'deleted', 'removed')
            group by r.property_id
            order by count(*) desc
            limit 1;
        else
            select id into v_property_id
            from public.properties
            where company_id = p_company_id
              and office_id = v_resolved_office_id
              and lower(trim(coalesce(property_name, name))) = lower(trim(v_property_name))
            limit 1;
        end if;

        if v_property_id is null then
            v_property_name := coalesce(v_property_name, 'Default Portfolio');
            insert into public.properties (
                address,
                code,
                company_id,
                created_by,
                landlord_id,
                name,
                office_id,
                property_name,
                property_type,
                status,
                total_units,
                vacant_units,
                occupied_units
            )
            values (
                v_property_name,
                'PROP-' || upper(substr(regexp_replace(v_property_name, '[^A-Za-z0-9]+', '', 'g'), 1, 10)) || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
                p_company_id,
                p_created_by,
                p_landlord_id,
                v_property_name,
                v_resolved_office_id,
                v_property_name,
                'mixed_use',
                'active',
                0,
                0,
                0
            )
            returning id into v_property_id;
        end if;
    end if;

    update public.properties
    set landlord_id = p_landlord_id,
        office_id = v_resolved_office_id,
        updated_at = now()
    where id = v_property_id
      and company_id = p_company_id;

    if exists (
        select 1
        from public.rooms
        where company_id = p_company_id
          and office_id = v_resolved_office_id
          and property_id = v_property_id
          and lower(trim(room_number)) = lower(trim(v_room_number))
          and coalesce(removed, false) = false
          and lower(coalesce(status, 'active')) not in ('archived', 'deleted', 'removed')
    ) then
        raise exception 'Room % already exists in the selected property/location.', v_room_number;
    end if;

    if v_status = 'occupied' and nullif(trim(coalesce(p_room_payload->>'tenantName', p_room_payload->>'tenant_name')), '') is null then
        raise exception 'Room % is occupied, so tenant name is required.', v_room_number;
    end if;
    if v_status = 'occupied' and nullif(trim(coalesce(p_room_payload->>'tenantPhone', p_room_payload->>'tenant_phone')), '') is null then
        raise exception 'Room % is occupied, so tenant phone is required.', v_room_number;
    end if;

    insert into public.rooms (
        company_id,
        created_by,
        effective_start_date,
        explicitly_payable,
        floor,
        landlord_id,
        monthly_rent,
        office_id,
        outstanding_balance,
        payable_notes,
        property_id,
        room_number,
        status
    )
    values (
        p_company_id,
        p_created_by,
        v_start_date,
        false,
        v_room_location,
        p_landlord_id,
        v_rent,
        v_resolved_office_id,
        v_opening_balance,
        v_notes,
        v_property_id,
        v_room_number,
        v_status
    )
    returning id into v_room_id;

    update public.properties
    set total_units = coalesce(total_units, 0) + 1,
        vacant_units = coalesce(vacant_units, 0) + case when v_status = 'vacant' then 1 else 0 end,
        occupied_units = coalesce(occupied_units, 0) + case when v_status = 'occupied' then 1 else 0 end,
        updated_at = now()
    where id = v_property_id;

    insert into public.room_status_history (
        changed_by,
        company_id,
        office_id,
        new_status,
        old_status,
        reason,
        room_id
    )
    values (
        p_created_by,
        p_company_id,
        v_resolved_office_id,
        v_status,
        null,
        coalesce(v_notes, p_source, 'Canonical landlord room creation'),
        v_room_id
    );

    if v_status = 'occupied' then
        insert into public.tenants (
            balance,
            company_id,
            created_by,
            full_name,
            monthly_rent,
            national_id,
            office_id,
            phone,
            property_id,
            room_id,
            status,
            tenant_code,
            tenant_type,
            outstanding_balance_bf
        )
        values (
            v_opening_balance,
            p_company_id,
            p_created_by,
            trim(coalesce(p_room_payload->>'tenantName', p_room_payload->>'tenant_name')),
            v_rent,
            nullif(trim(coalesce(p_room_payload->>'tenantNationalId', p_room_payload->>'tenant_national_id', '')), ''),
            v_resolved_office_id,
            nullif(trim(coalesce(p_room_payload->>'tenantPhone', p_room_payload->>'tenant_phone', '')), ''),
            v_property_id,
            v_room_id,
            'active',
            'TEN-' || regexp_replace(v_room_number, '[^A-Za-z0-9]+', '', 'g') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
            'individual',
            v_opening_balance
        )
        returning id into v_tenant_id;

        insert into public.leases (
            billing_day,
            company_id,
            created_by,
            monthly_rent,
            office_id,
            property_id,
            room_id,
            start_date,
            status,
            tenant_id
        )
        values (
            least(31, greatest(1, extract(day from v_move_in_date)::integer)),
            p_company_id,
            p_created_by,
            v_rent,
            v_resolved_office_id,
            v_property_id,
            v_room_id,
            v_move_in_date,
            'active',
            v_tenant_id
        )
        returning id into v_lease_id;
    end if;

    insert into public.audit_logs (
        action,
        actor_id,
        after_data,
        company_id,
        entity_id,
        entity_type,
        office_id
    )
    values (
        'landlord_room_created_canonical',
        p_created_by,
        jsonb_build_object(
            'room_id', v_room_id,
            'landlord_id', p_landlord_id,
            'property_id', v_property_id,
            'requested_office_id', p_office_id,
            'resolved_office_id', v_resolved_office_id,
            'room_number', v_room_number,
            'monthly_rent', v_rent,
            'opening_outstanding', v_opening_balance,
            'status', v_status,
            'source', p_source
        ),
        p_company_id,
        v_room_id,
        'room',
        v_resolved_office_id
    );

    perform public.ddumba_v1_refresh_landlord_search_index(p_landlord_id);

    return jsonb_build_object(
        'roomId', v_room_id,
        'tenantId', v_tenant_id,
        'leaseId', v_lease_id,
        'propertyId', v_property_id,
        'requestedOfficeId', p_office_id,
        'officeId', v_resolved_office_id,
        'roomNumber', v_room_number,
        'monthlyRent', v_rent,
        'openingOutstanding', v_opening_balance,
        'status', v_status
    );
end;
$$;

create or replace function public.ddumba_v1_create_landlord_rooms_bulk(
    p_company_id uuid,
    p_office_id uuid,
    p_landlord_id uuid,
    p_created_by uuid,
    p_rooms_payload jsonb,
    p_source_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_room jsonb;
    v_created jsonb;
    v_room_ids uuid[] := '{}';
    v_tenant_ids uuid[] := '{}';
    v_property_ids uuid[] := '{}';
    v_total_rooms integer := 0;
    v_occupied_rooms integer := 0;
    v_vacant_rooms integer := 0;
    v_rent_roll numeric := 0;
    v_opening_outstanding numeric := 0;
begin
    if jsonb_typeof(p_rooms_payload) is distinct from 'array' or jsonb_array_length(p_rooms_payload) = 0 then
        raise exception 'Add at least one room.';
    end if;

    for v_room in select * from jsonb_array_elements(p_rooms_payload)
    loop
        v_created := public.ddumba_v1_create_landlord_room(
            p_company_id,
            p_office_id,
            p_landlord_id,
            p_created_by,
            v_room,
            coalesce('landlord_bulk_rooms:' || p_source_request_id::text, 'landlord_bulk_rooms')
        );
        v_room_ids := array_append(v_room_ids, (v_created->>'roomId')::uuid);
        if nullif(v_created->>'tenantId', '') is not null then
            v_tenant_ids := array_append(v_tenant_ids, (v_created->>'tenantId')::uuid);
        end if;
        v_property_ids := array_append(v_property_ids, (v_created->>'propertyId')::uuid);
        v_total_rooms := v_total_rooms + 1;
        v_rent_roll := v_rent_roll + coalesce((v_created->>'monthlyRent')::numeric, 0);
        v_opening_outstanding := v_opening_outstanding + coalesce((v_created->>'openingOutstanding')::numeric, 0);
        if v_created->>'status' = 'occupied' then
            v_occupied_rooms := v_occupied_rooms + 1;
        else
            v_vacant_rooms := v_vacant_rooms + 1;
        end if;
    end loop;

    return jsonb_build_object(
        'landlordId', p_landlord_id,
        'roomIds', v_room_ids,
        'tenantIds', v_tenant_ids,
        'propertyIds', (select array_agg(distinct x) from unnest(v_property_ids) as x),
        'summary', jsonb_build_object(
            'totalRooms', v_total_rooms,
            'occupiedRooms', v_occupied_rooms,
            'vacantRooms', v_vacant_rooms,
            'rentRoll', v_rent_roll,
            'openingOutstanding', v_opening_outstanding
        )
    );
end;
$$;

create or replace function public.ddumba_v1_create_landlord_with_rooms_bulk(
    p_company_id uuid,
    p_office_id uuid,
    p_created_by uuid,
    p_landlord_payload jsonb,
    p_rooms_payload jsonb,
    p_source_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_landlord_id uuid;
    v_result jsonb;
    v_landlord_name text := nullif(trim(coalesce(p_landlord_payload->>'landlordName', p_landlord_payload->>'fullName', p_landlord_payload->>'full_name')), '');
    v_phone text := nullif(trim(coalesce(p_landlord_payload->>'phone', '')), '');
    v_email text := nullif(trim(coalesce(p_landlord_payload->>'email', '')), '');
    v_national_id text := nullif(trim(coalesce(p_landlord_payload->>'nationalId', p_landlord_payload->>'national_id', '')), '');
    v_commission_type text := coalesce(nullif(trim(p_landlord_payload->>'commissionType'), ''), 'percentage');
    v_commission_value numeric := coalesce(nullif(p_landlord_payload->>'commissionValue', '')::numeric, 0);
    v_resolved_office_id uuid;
begin
    if p_company_id is null then
        raise exception 'Active company is required.';
    end if;
    if v_landlord_name is null then
        raise exception 'Landlord name is required.';
    end if;
    if jsonb_typeof(p_rooms_payload) is distinct from 'array' or jsonb_array_length(p_rooms_payload) = 0 then
        raise exception 'Add at least one room.';
    end if;

    v_resolved_office_id := public.ddumba_v1_resolve_active_office(p_company_id, p_office_id);

    if exists (
        select 1
        from public.landlords
        where company_id = p_company_id
          and lower(trim(full_name)) = lower(trim(v_landlord_name))
          and lower(coalesce(status, 'active')) not in ('archived', 'deleted', 'removed')
    ) then
        raise exception 'A landlord with this name already exists. Select the existing landlord instead.';
    end if;

    insert into public.landlords (
        company_id,
        created_by,
        email,
        full_name,
        national_id,
        phone,
        status,
        commission_input_mode,
        commission_rate,
        commission_percent,
        commission_notes
    )
    values (
        p_company_id,
        p_created_by,
        v_email,
        v_landlord_name,
        v_national_id,
        v_phone,
        'active',
        case when v_commission_type = 'fixed_amount' then 'fixed_amount' else 'percentage' end,
        case when v_commission_type = 'percentage' then v_commission_value else null end,
        case when v_commission_type = 'percentage' then v_commission_value else null end,
        nullif(trim(coalesce(p_landlord_payload->>'notes', p_landlord_payload->>'paymentMethods', '')), '')
    )
    returning id into v_landlord_id;

    v_result := public.ddumba_v1_create_landlord_rooms_bulk(
        p_company_id,
        v_resolved_office_id,
        v_landlord_id,
        p_created_by,
        p_rooms_payload,
        p_source_request_id
    );

    insert into public.audit_logs (
        action,
        actor_id,
        after_data,
        company_id,
        entity_id,
        entity_type,
        office_id
    )
    values (
        'landlord_bulk_rooms_created_live_atomic',
        p_created_by,
        jsonb_build_object(
            'landlord_id', v_landlord_id,
            'source_request_id', p_source_request_id,
            'requested_office_id', p_office_id,
            'resolved_office_id', v_resolved_office_id,
            'result', v_result
        ),
        p_company_id,
        v_landlord_id,
        'landlord',
        v_resolved_office_id
    );

    perform public.ddumba_v1_refresh_landlord_search_index(v_landlord_id);

    return v_result;
end;
$$;

grant execute on function public.ddumba_v1_resolve_active_office(uuid, uuid) to authenticated, service_role;
grant execute on function public.ddumba_v1_create_landlord_room(uuid, uuid, uuid, uuid, jsonb, text) to authenticated, service_role;
grant execute on function public.ddumba_v1_create_landlord_rooms_bulk(uuid, uuid, uuid, uuid, jsonb, uuid) to authenticated, service_role;
grant execute on function public.ddumba_v1_create_landlord_with_rooms_bulk(uuid, uuid, uuid, jsonb, jsonb, uuid) to authenticated, service_role;
