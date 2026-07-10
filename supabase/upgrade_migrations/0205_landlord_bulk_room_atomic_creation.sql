-- Atomic New Landlord + Bulk Rooms materialization.
-- Additive only: no existing landlord, property, room, tenant, or lease rows are modified.

alter table public.landlords add column if not exists created_by uuid references public.users(id) on delete set null;
alter table public.properties add column if not exists created_by uuid references public.users(id) on delete set null;
alter table public.rooms add column if not exists created_by uuid references public.users(id) on delete set null;
alter table public.tenants add column if not exists created_by uuid references public.users(id) on delete set null;
alter table public.leases add column if not exists created_by uuid references public.users(id) on delete set null;

create index if not exists idx_landlords_company_created_by
    on public.landlords(company_id, created_by);

create index if not exists idx_rooms_company_office_property_room_active
    on public.rooms(company_id, office_id, property_id, lower(trim(room_number)))
    where coalesce(removed, false) = false and coalesce(status, '') not in ('archived', 'deleted', 'removed');

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
    v_property_id uuid;
    v_room_id uuid;
    v_tenant_id uuid;
    v_lease_id uuid;
    v_landlord_name text := nullif(trim(coalesce(p_landlord_payload->>'landlordName', p_landlord_payload->>'fullName', p_landlord_payload->>'full_name')), '');
    v_phone text := nullif(trim(coalesce(p_landlord_payload->>'phone', '')), '');
    v_email text := nullif(trim(coalesce(p_landlord_payload->>'email', '')), '');
    v_national_id text := nullif(trim(coalesce(p_landlord_payload->>'nationalId', p_landlord_payload->>'national_id', '')), '');
    v_commission_type text := coalesce(nullif(trim(p_landlord_payload->>'commissionType'), ''), 'percentage');
    v_commission_value numeric := coalesce(nullif(p_landlord_payload->>'commissionValue', '')::numeric, 0);
    v_room jsonb;
    v_room_number text;
    v_property_name text;
    v_rent numeric;
    v_status text;
    v_start_date date;
    v_move_in_date date;
    v_opening_balance numeric;
    v_room_ids uuid[] := '{}';
    v_tenant_ids uuid[] := '{}';
    v_property_ids uuid[] := '{}';
    v_total_rooms integer := 0;
    v_occupied_rooms integer := 0;
    v_vacant_rooms integer := 0;
    v_rent_roll numeric := 0;
begin
    if p_company_id is null then
        raise exception 'Active company is required.';
    end if;
    if p_office_id is null then
        raise exception 'Office is required.';
    end if;
    if v_landlord_name is null then
        raise exception 'Landlord name is required.';
    end if;
    if jsonb_typeof(p_rooms_payload) is distinct from 'array' or jsonb_array_length(p_rooms_payload) = 0 then
        raise exception 'Add at least one room.';
    end if;

    if exists (
        select 1
        from public.landlords
        where company_id = p_company_id
          and lower(trim(full_name)) = lower(trim(v_landlord_name))
          and coalesce(status, 'active') not in ('archived', 'deleted', 'removed')
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

    for v_room in select * from jsonb_array_elements(p_rooms_payload)
    loop
        v_room_number := upper(nullif(trim(coalesce(v_room->>'roomNumber', v_room->>'room_number')), ''));
        v_property_name := nullif(trim(coalesce(v_room->>'propertyName', v_room->>'property_name', v_room->>'location')), '');
        v_rent := coalesce(nullif(v_room->>'monthlyRent', '')::numeric, nullif(v_room->>'monthly_rent', '')::numeric, 0);
        v_status := case when coalesce(v_room->>'status', 'vacant') = 'occupied' then 'occupied' else 'vacant' end;
        v_start_date := coalesce(nullif(v_room->>'startDate', '')::date, nullif(v_room->>'start_date', '')::date, current_date);
        v_move_in_date := coalesce(nullif(v_room->>'moveInDate', '')::date, nullif(v_room->>'move_in_date', '')::date, v_start_date);
        v_opening_balance := case
            when coalesce(v_room->>'outstandingMode', 'none') = 'has_outstanding'
                then coalesce(nullif(v_room->>'outstandingBalance', '')::numeric, nullif(v_room->>'outstanding_balance', '')::numeric, 0)
            else 0
        end;

        if v_room_number is null then
            raise exception 'Every room needs a room number.';
        end if;
        if v_rent <= 0 then
            raise exception 'Room % needs a valid monthly rent.', v_room_number;
        end if;

        if nullif(v_room->>'propertyId', '') is not null then
            select id into v_property_id
            from public.properties
            where company_id = p_company_id
              and office_id = p_office_id
              and id = (v_room->>'propertyId')::uuid
            limit 1;
            if v_property_id is null then
                raise exception 'Selected property/location was not found for room %.', v_room_number;
            end if;
        else
            if v_property_name is null then
                raise exception 'Room % needs a property/location.', v_room_number;
            end if;
            select id into v_property_id
            from public.properties
            where company_id = p_company_id
              and office_id = p_office_id
              and lower(trim(coalesce(property_name, name))) = lower(trim(v_property_name))
            limit 1;

            if v_property_id is null then
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
                    status
                )
                values (
                    v_property_name,
                    'PROP-' || upper(substr(regexp_replace(v_property_name, '[^A-Za-z0-9]+', '', 'g'), 1, 10)) || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
                    p_company_id,
                    p_created_by,
                    v_landlord_id,
                    v_property_name,
                    p_office_id,
                    v_property_name,
                    'mixed_use',
                    'active'
                )
                returning id into v_property_id;
                v_property_ids := array_append(v_property_ids, v_property_id);
            end if;
        end if;

        update public.properties
        set landlord_id = v_landlord_id,
            updated_at = now()
        where id = v_property_id
          and company_id = p_company_id;

        if exists (
            select 1
            from public.rooms
            where company_id = p_company_id
              and office_id = p_office_id
              and property_id = v_property_id
              and lower(trim(room_number)) = lower(trim(v_room_number))
              and coalesce(removed, false) = false
              and coalesce(status, '') not in ('archived', 'deleted', 'removed')
        ) then
            raise exception 'Room % already exists in the selected property/location.', v_room_number;
        end if;

        if v_status = 'occupied' and nullif(trim(coalesce(v_room->>'tenantName', v_room->>'tenant_name')), '') is null then
            raise exception 'Room % is occupied, so tenant name is required.', v_room_number;
        end if;
        if v_status = 'occupied' and nullif(trim(coalesce(v_room->>'tenantPhone', v_room->>'tenant_phone')), '') is null then
            raise exception 'Room % is occupied, so tenant phone is required.', v_room_number;
        end if;

        insert into public.rooms (
            company_id,
            created_by,
            effective_start_date,
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
            v_landlord_id,
            v_rent,
            p_office_id,
            v_opening_balance,
            nullif(trim(coalesce(v_room->>'notes', '')), ''),
            v_property_id,
            v_room_number,
            v_status
        )
        returning id into v_room_id;

        v_room_ids := array_append(v_room_ids, v_room_id);
        v_total_rooms := v_total_rooms + 1;
        v_rent_roll := v_rent_roll + v_rent;
        if v_status = 'occupied' then
            v_occupied_rooms := v_occupied_rooms + 1;
        else
            v_vacant_rooms := v_vacant_rooms + 1;
        end if;

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
            p_office_id,
            v_status,
            null,
            coalesce(nullif(trim(v_room->>'notes'), ''), 'New landlord bulk room creation'),
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
                trim(coalesce(v_room->>'tenantName', v_room->>'tenant_name')),
                v_rent,
                nullif(trim(coalesce(v_room->>'tenantNationalId', v_room->>'tenant_national_id', '')), ''),
                p_office_id,
                nullif(trim(coalesce(v_room->>'tenantPhone', v_room->>'tenant_phone', '')), ''),
                v_property_id,
                v_room_id,
                'active',
                'TEN-' || regexp_replace(v_room_number, '[^A-Za-z0-9]+', '', 'g') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
                'individual',
                v_opening_balance
            )
            returning id into v_tenant_id;
            v_tenant_ids := array_append(v_tenant_ids, v_tenant_id);

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
                least(28, greatest(1, extract(day from v_move_in_date)::integer)),
                p_company_id,
                p_created_by,
                v_rent,
                p_office_id,
                v_property_id,
                v_room_id,
                v_move_in_date,
                'active',
                v_tenant_id
            )
            returning id into v_lease_id;
        end if;
    end loop;

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
            'room_ids', v_room_ids,
            'tenant_ids', v_tenant_ids,
            'property_ids', v_property_ids,
            'source_request_id', p_source_request_id,
            'summary', jsonb_build_object(
                'totalRooms', v_total_rooms,
                'occupiedRooms', v_occupied_rooms,
                'vacantRooms', v_vacant_rooms,
                'rentRoll', v_rent_roll
            )
        ),
        p_company_id,
        v_landlord_id,
        'landlord',
        p_office_id
    );

    return jsonb_build_object(
        'landlordId', v_landlord_id,
        'roomIds', v_room_ids,
        'tenantIds', v_tenant_ids,
        'propertyIds', v_property_ids,
        'summary', jsonb_build_object(
            'totalRooms', v_total_rooms,
            'occupiedRooms', v_occupied_rooms,
            'vacantRooms', v_vacant_rooms,
            'rentRoll', v_rent_roll
        )
    );
end;
$$;

grant execute on function public.ddumba_v1_create_landlord_with_rooms_bulk(uuid, uuid, uuid, jsonb, jsonb, uuid) to authenticated;
grant execute on function public.ddumba_v1_create_landlord_with_rooms_bulk(uuid, uuid, uuid, jsonb, jsonb, uuid) to service_role;
