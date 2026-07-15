-- Phase 208: Transactional office merge RPC.
-- Additive and rollback-safe: the function moves office-scoped rows in one
-- database transaction and preserves the source office as archived/merged
-- history. It never deletes office, finance, receipt, or audit history.

create or replace function public.ddumba_merge_offices(
    p_company_id uuid,
    p_source_office_id uuid,
    p_destination_office_id uuid,
    p_admin_user_id uuid,
    p_reason_note text default null,
    p_confirmation text default null,
    p_user_handling text default 'reassign',
    p_expected_counts jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    source_office record;
    destination_office record;
    batch_id uuid;
    merged_at_value timestamptz := now();
    table_row record;
    has_company_id boolean;
    has_original_office_id boolean;
    has_original_office_name boolean;
    has_merged_into_office_id boolean;
    has_merged_at boolean;
    has_merge_batch_id boolean;
    has_updated_at boolean;
    set_sql text;
    where_sql text;
    moved_count integer := 0;
    transferred_counts jsonb := '{}'::jsonb;
    accounts_reassigned integer := 0;
    active_office_count integer := 0;
    room_conflict_count integer := 0;
begin
    if p_company_id is null then
        raise exception 'Active company is required.';
    end if;
    if p_source_office_id is null then
        raise exception 'Select a source office.';
    end if;
    if p_destination_office_id is null then
        raise exception 'Select a destination office.';
    end if;
    if p_source_office_id = p_destination_office_id then
        raise exception 'Source and destination cannot be the same.';
    end if;

    select id, coalesce(office_name, name, 'Office') as office_name, coalesce(status, 'active') as status
    into source_office
    from public.offices
    where id = p_source_office_id and company_id = p_company_id
    for update;

    if source_office.id is null then
        raise exception 'Source office could not be found.';
    end if;

    select id, coalesce(office_name, name, 'Office') as office_name, coalesce(status, 'active') as status
    into destination_office
    from public.offices
    where id = p_destination_office_id and company_id = p_company_id
    for update;

    if destination_office.id is null then
        raise exception 'Destination office could not be found.';
    end if;

    if lower(source_office.status) in ('archived', 'deleted', 'merged') then
        raise exception 'Source office is not active enough to merge.';
    end if;

    if lower(destination_office.status) in ('archived', 'deleted', 'merged') then
        raise exception 'Destination office is inactive or merged.';
    end if;

    if upper(trim(coalesce(p_confirmation, ''))) not in (upper(source_office.office_name), 'MERGE') then
        raise exception 'Type the source office name or MERGE to confirm this office merge.';
    end if;

    select count(*)
    into active_office_count
    from public.offices
    where company_id = p_company_id
      and lower(coalesce(status, 'active')) not in ('archived', 'deleted', 'merged', 'inactive');

    if active_office_count < 2 then
        raise exception 'The final active company office cannot be merged.';
    end if;

    if to_regclass('public.rooms') is not null
       and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'rooms' and column_name = 'room_number')
    then
        if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'rooms' and column_name = 'property_id') then
            execute $sql$
                select count(*)
                from public.rooms source_room
                join public.rooms destination_room
                  on upper(trim(coalesce(source_room.room_number::text, ''))) = upper(trim(coalesce(destination_room.room_number::text, '')))
                 and coalesce(source_room.property_id::text, 'no-property') = coalesce(destination_room.property_id::text, 'no-property')
                where source_room.company_id = $1
                  and destination_room.company_id = $1
                  and source_room.office_id = $2
                  and destination_room.office_id = $3
                  and lower(coalesce(source_room.status::text, 'active')) not in ('archived','deleted','removed')
                  and lower(coalesce(destination_room.status::text, 'active')) not in ('archived','deleted','removed')
            $sql$ into room_conflict_count using p_company_id, p_source_office_id, p_destination_office_id;
        else
            execute $sql$
                select count(*)
                from public.rooms source_room
                join public.rooms destination_room
                  on upper(trim(coalesce(source_room.room_number::text, ''))) = upper(trim(coalesce(destination_room.room_number::text, '')))
                where source_room.company_id = $1
                  and destination_room.company_id = $1
                  and source_room.office_id = $2
                  and destination_room.office_id = $3
                  and lower(coalesce(source_room.status::text, 'active')) not in ('archived','deleted','removed')
                  and lower(coalesce(destination_room.status::text, 'active')) not in ('archived','deleted','removed')
            $sql$ into room_conflict_count using p_company_id, p_source_office_id, p_destination_office_id;
        end if;
    end if;

    if room_conflict_count > 0 then
        raise exception 'This office has unresolved room-number conflicts in the destination office. Resolve duplicate rooms before merging.';
    end if;

    insert into public.office_merge_batches (
        company_id,
        new_office_id,
        new_office_name,
        source_office_ids,
        source_office_names,
        status,
        admin_user_id,
        affected_counts,
        reason_note,
        warning_acknowledged,
        confirmed_at
    )
    values (
        p_company_id,
        p_destination_office_id,
        destination_office.office_name,
        array[p_source_office_id],
        array[source_office.office_name],
        'confirmed',
        p_admin_user_id,
        coalesce(p_expected_counts, '{}'::jsonb),
        nullif(trim(coalesce(p_reason_note, '')), ''),
        true,
        merged_at_value
    )
    returning id into batch_id;

    for table_row in
        select c.table_name
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.column_name = 'office_id'
          and c.table_name not in ('offices', 'office_merge_batches', 'office_merge_audit')
        group by c.table_name
        order by c.table_name
    loop
        select exists (
            select 1 from information_schema.columns where table_schema = 'public' and table_name = table_row.table_name and column_name = 'company_id'
        ) into has_company_id;
        select exists (
            select 1 from information_schema.columns where table_schema = 'public' and table_name = table_row.table_name and column_name = 'original_office_id'
        ) into has_original_office_id;
        select exists (
            select 1 from information_schema.columns where table_schema = 'public' and table_name = table_row.table_name and column_name = 'original_office_name'
        ) into has_original_office_name;
        select exists (
            select 1 from information_schema.columns where table_schema = 'public' and table_name = table_row.table_name and column_name = 'merged_into_office_id'
        ) into has_merged_into_office_id;
        select exists (
            select 1 from information_schema.columns where table_schema = 'public' and table_name = table_row.table_name and column_name = 'merged_at'
        ) into has_merged_at;
        select exists (
            select 1 from information_schema.columns where table_schema = 'public' and table_name = table_row.table_name and column_name = 'merge_batch_id'
        ) into has_merge_batch_id;
        select exists (
            select 1 from information_schema.columns where table_schema = 'public' and table_name = table_row.table_name and column_name = 'updated_at'
        ) into has_updated_at;

        if table_row.table_name = 'user_office_roles' and p_user_handling = 'disable' then
            set_sql := 'office_id = office_id';
        else
            set_sql := format('office_id = %L::uuid', p_destination_office_id);
        end if;

        if has_original_office_id then
            set_sql := set_sql || format(', original_office_id = coalesce(original_office_id, %L::uuid)', p_source_office_id);
        end if;
        if has_original_office_name then
            set_sql := set_sql || format(', original_office_name = coalesce(original_office_name, %L)', source_office.office_name);
        end if;
        if has_merged_into_office_id then
            set_sql := set_sql || format(', merged_into_office_id = %L::uuid', p_destination_office_id);
        end if;
        if has_merged_at then
            set_sql := set_sql || format(', merged_at = %L::timestamptz', merged_at_value);
        end if;
        if has_merge_batch_id then
            set_sql := set_sql || format(', merge_batch_id = %L::uuid', batch_id);
        end if;
        if has_updated_at then
            set_sql := set_sql || format(', updated_at = %L::timestamptz', merged_at_value);
        end if;

        where_sql := format('office_id = %L::uuid', p_source_office_id);
        if has_company_id then
            where_sql := where_sql || format(' and company_id = %L::uuid', p_company_id);
        end if;

        execute format('update public.%I set %s where %s', table_row.table_name, set_sql, where_sql);
        get diagnostics moved_count = row_count;

        if table_row.table_name = 'user_office_roles' then
            accounts_reassigned := moved_count;
        end if;

        transferred_counts := jsonb_set(transferred_counts, array[table_row.table_name], to_jsonb(moved_count), true);

        insert into public.office_merge_audit (
            company_id,
            merge_batch_id,
            source_office_id,
            source_office_name,
            merged_into_office_id,
            entity_table,
            action,
            before_data,
            after_data,
            admin_user_id
        )
        values (
            p_company_id,
            batch_id,
            p_source_office_id,
            source_office.office_name,
            p_destination_office_id,
            table_row.table_name,
            case when moved_count = 0 then 'office_scope_checked' else 'office_scope_moved' end,
            jsonb_build_object('office_id', p_source_office_id, 'office_name', source_office.office_name),
            jsonb_build_object('office_id', p_destination_office_id, 'office_name', destination_office.office_name, 'rows', moved_count),
            p_admin_user_id
        );
    end loop;

    update public.offices
    set status = 'archived',
        merged_into_office_id = p_destination_office_id,
        merged_at = merged_at_value,
        merge_batch_id = batch_id,
        updated_at = merged_at_value
    where id = p_source_office_id
      and company_id = p_company_id;

    insert into public.office_merge_audit (
        company_id,
        merge_batch_id,
        source_office_id,
        source_office_name,
        merged_into_office_id,
        entity_table,
        action,
        before_data,
        after_data,
        admin_user_id
    )
    values (
        p_company_id,
        batch_id,
        p_source_office_id,
        source_office.office_name,
        p_destination_office_id,
        'offices',
        'source_office_archived_after_merge',
        jsonb_build_object('status', source_office.status),
        jsonb_build_object('status', 'archived', 'merged_into_office_id', p_destination_office_id),
        p_admin_user_id
    );

    update public.office_merge_batches
    set status = 'completed',
        completed_at = merged_at_value
    where id = batch_id;

    return jsonb_build_object(
        'batch_id', batch_id,
        'merge_reference', 'MERGE-' || upper(substr(batch_id::text, 1, 8)),
        'source_office_id', p_source_office_id,
        'source_office_name', source_office.office_name,
        'destination_office_id', p_destination_office_id,
        'destination_office_name', destination_office.office_name,
        'transferred_counts', transferred_counts,
        'accounts_reassigned', accounts_reassigned,
        'source_status', 'archived',
        'merged_at', merged_at_value
    );
exception
    when others then
        raise;
end;
$$;

grant execute on function public.ddumba_merge_offices(uuid, uuid, uuid, uuid, text, text, text, jsonb) to authenticated;
grant execute on function public.ddumba_merge_offices(uuid, uuid, uuid, uuid, text, text, text, jsonb) to service_role;
