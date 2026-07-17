-- Phase 212: Atomic multi-office consolidation RPC.
-- Used for large authorized production merges where the browser request must
-- not own the data movement. The function creates the destination office,
-- creates its office login, moves office-scoped records with provenance,
-- verifies financial invariants, then archives source offices in one database
-- transaction. Any raised exception rolls the whole merge back.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.ddumba_office_merge_snapshot(
    p_company_id uuid,
    p_office_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_snapshot jsonb := '{}'::jsonb;
    v_count numeric := 0;
    v_amount numeric := 0;
begin
    if p_company_id is null or coalesce(array_length(p_office_ids, 1), 0) = 0 then
        return '{}'::jsonb;
    end if;

    if to_regclass('public.rooms') is not null then
        select coalesce(count(*), 0), coalesce(sum(coalesce(monthly_rent, 0)), 0)
        into v_count, v_amount
        from public.rooms
        where company_id = p_company_id
          and office_id = any(p_office_ids)
          and lower(coalesce(status, 'active')) not in ('archived','deleted','removed','inactive');
        v_snapshot := v_snapshot || jsonb_build_object('rooms', v_count, 'rent_roll', v_amount);

        select coalesce(count(*), 0)
        into v_count
        from public.rooms
        where company_id = p_company_id
          and office_id = any(p_office_ids)
          and lower(coalesce(status, '')) in ('occupied','active');
        v_snapshot := v_snapshot || jsonb_build_object('occupied_rooms', v_count);

        select coalesce(count(*), 0)
        into v_count
        from public.rooms
        where company_id = p_company_id
          and office_id = any(p_office_ids)
          and lower(coalesce(status, '')) = 'vacant';
        v_snapshot := v_snapshot || jsonb_build_object('vacant_rooms', v_count);

        select coalesce(count(distinct landlord_id), 0)
        into v_count
        from public.rooms
        where company_id = p_company_id
          and office_id = any(p_office_ids)
          and landlord_id is not null
          and lower(coalesce(status, 'active')) not in ('archived','deleted','removed','inactive');
        v_snapshot := v_snapshot || jsonb_build_object('landlords', v_count);
    end if;

    if to_regclass('public.properties') is not null then
        select coalesce(count(*), 0)
        into v_count
        from public.properties
        where company_id = p_company_id
          and office_id = any(p_office_ids)
          and lower(coalesce(status, 'active')) not in ('archived','deleted','removed','inactive');
        v_snapshot := v_snapshot || jsonb_build_object('properties', v_count);
    end if;

    if to_regclass('public.tenants') is not null then
        select coalesce(count(*), 0), coalesce(sum(coalesce(balance, 0)), 0)
        into v_count, v_amount
        from public.tenants
        where company_id = p_company_id
          and office_id = any(p_office_ids)
          and lower(coalesce(status, 'active')) not in ('archived','deleted','removed','inactive','vacated');
        v_snapshot := v_snapshot || jsonb_build_object('tenants', v_count, 'tenant_outstanding', v_amount);
    end if;

    if to_regclass('public.employees') is not null then
        select coalesce(count(*), 0)
        into v_count
        from public.employees
        where company_id = p_company_id
          and office_id = any(p_office_ids)
          and lower(coalesce(status, 'active')) not in ('archived','deleted','removed','inactive','terminated');
        v_snapshot := v_snapshot || jsonb_build_object('employees', v_count);
    end if;

    if to_regclass('public.user_office_roles') is not null then
        select coalesce(count(*), 0)
        into v_count
        from public.user_office_roles
        where company_id = p_company_id
          and office_id = any(p_office_ids);
        v_snapshot := v_snapshot || jsonb_build_object('user_assignments', v_count);
    end if;

    if to_regclass('public.collections') is not null then
        select coalesce(count(*), 0), coalesce(sum(coalesce(amount_paid, amount, 0)), 0)
        into v_count, v_amount
        from public.collections
        where company_id = p_company_id
          and office_id = any(p_office_ids)
          and lower(coalesce(status, 'approved')) not in ('deleted','void','voided','reversed','rejected');
        v_snapshot := v_snapshot || jsonb_build_object('collections', v_count, 'collections_amount', v_amount);
    end if;

    if to_regclass('public.payment_receipts') is not null then
        select coalesce(count(*), 0),
               coalesce(sum(coalesce(nullif(receipt_snapshot->>'amountPaid', '')::numeric, nullif(receipt_snapshot->>'amount', '')::numeric, 0)), 0)
        into v_count, v_amount
        from public.payment_receipts
        where company_id = p_company_id
          and office_id = any(p_office_ids)
          and lower(coalesce(status, 'active')) not in ('deleted','void','voided');
        v_snapshot := v_snapshot || jsonb_build_object('receipts', v_count, 'receipt_amount', v_amount);
    end if;

    if to_regclass('public.expenses') is not null then
        select coalesce(count(*), 0), coalesce(sum(coalesce(amount, 0)), 0)
        into v_count, v_amount
        from public.expenses
        where company_id = p_company_id
          and office_id = any(p_office_ids)
          and lower(coalesce(status, 'approved')) not in ('deleted','void','voided','rejected');
        v_snapshot := v_snapshot || jsonb_build_object('expenses', v_count, 'expenses_amount', v_amount);
    end if;

    if to_regclass('public.landlord_monthly_payables') is not null then
        select coalesce(count(*), 0), coalesce(sum(coalesce(unpaid_balance, greatest(coalesce(net_payable, monthly_net_payable, 0) - coalesce(amount_paid, 0), 0))), 0)
        into v_count, v_amount
        from public.landlord_monthly_payables
        where company_id = p_company_id
          and office_id = any(p_office_ids)
          and lower(coalesce(status, 'active')) not in ('archived','deleted','removed','void','voided','reversed','merged_duplicate');
        v_snapshot := v_snapshot || jsonb_build_object('landlord_payables', v_count, 'landlord_payable_balance', v_amount);
    end if;

    if to_regclass('public.landlord_advances') is not null then
        select coalesce(count(*), 0), coalesce(sum(coalesce(remaining_total_balance, remaining_balance, advance_amount, 0)), 0)
        into v_count, v_amount
        from public.landlord_advances
        where company_id = p_company_id
          and office_id = any(p_office_ids)
          and lower(coalesce(status, lifecycle_status, 'active')) not in ('archived','deleted','removed','void','voided','reversed','cleared','closed');
        v_snapshot := v_snapshot || jsonb_build_object('landlord_advances', v_count, 'landlord_advances_active', v_amount);
    end if;

    if to_regclass('public.cash_transactions') is not null then
        select coalesce(count(*), 0), coalesce(sum(coalesce(amount, 0)), 0)
        into v_count, v_amount
        from public.cash_transactions
        where company_id = p_company_id
          and office_id = any(p_office_ids);
        v_snapshot := v_snapshot || jsonb_build_object('cash_transactions', v_count, 'cash_transactions_amount', v_amount);
    end if;

    if to_regclass('public.bank_deposits') is not null then
        select coalesce(count(*), 0), coalesce(sum(coalesce(amount, 0)), 0)
        into v_count, v_amount
        from public.bank_deposits
        where company_id = p_company_id
          and office_id = any(p_office_ids);
        v_snapshot := v_snapshot || jsonb_build_object('bank_deposits', v_count, 'bank_deposits_amount', v_amount);
    end if;

    if to_regclass('public.tenant_ledger_entries') is not null then
        select coalesce(count(*), 0), coalesce(sum(coalesce(amount, 0)), 0)
        into v_count, v_amount
        from public.tenant_ledger_entries
        where company_id = p_company_id
          and office_id = any(p_office_ids);
        v_snapshot := v_snapshot || jsonb_build_object('tenant_ledger_entries', v_count, 'tenant_ledger_amount', v_amount);
    end if;

    return v_snapshot;
end;
$$;

create or replace function public.ddumba_merge_offices_atomic(
    p_company_id uuid,
    p_source_office_ids uuid[],
    p_destination_office_name text,
    p_destination_office_code text,
    p_destination_location text,
    p_destination_user_id uuid,
    p_destination_email text,
    p_destination_login_name text,
    p_pin text,
    p_admin_user_id uuid default null,
    p_reason_note text default null,
    p_expected_snapshot jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_now timestamptz := now();
    v_destination_office_id uuid := gen_random_uuid();
    v_batch_id uuid;
    v_role_id uuid;
    v_source record;
    v_table record;
    v_has_company_id boolean;
    v_has_original_office_id boolean;
    v_has_original_office_name boolean;
    v_has_merged_into_office_id boolean;
    v_has_merged_at boolean;
    v_has_merge_batch_id boolean;
    v_has_updated_at boolean;
    v_set_sql text;
    v_where_sql text;
    v_moved_count integer := 0;
    v_remaining_count integer := 0;
    v_total_remaining integer := 0;
    v_duplicate_count integer := 0;
    v_source_count integer := 0;
    v_source_names text[];
    v_pre_snapshot jsonb;
    v_post_snapshot jsonb;
    v_moved_counts jsonb := '{}'::jsonb;
    v_existing_completed record;
    v_append_only_financial_table text;
    v_duplicate_payable record;
    v_survivor_payable_id uuid;
    v_duplicate_payable_ids uuid[];
    v_child_reference_table record;
    v_duplicate_summary record;
    v_survivor_summary_id uuid;
    v_duplicate_summary_ids uuid[];
begin
    if p_company_id is null then
        raise exception 'Company is required.';
    end if;
    if coalesce(array_length(p_source_office_ids, 1), 0) < 2 then
        raise exception 'Select at least two source offices.';
    end if;
    if nullif(trim(coalesce(p_destination_office_name, '')), '') is null then
        raise exception 'New merged office name is required.';
    end if;
    if nullif(trim(coalesce(p_destination_office_code, '')), '') is null then
        raise exception 'New merged office code is required.';
    end if;
    if p_destination_user_id is null then
        raise exception 'Destination office login user id is required.';
    end if;
    if coalesce(p_pin, '') !~ '^[0-9]{6}$' then
        raise exception 'Office login PIN must contain exactly six digits.';
    end if;

    select *
    into v_existing_completed
    from public.office_merge_batches
    where company_id = p_company_id
      and lower(new_office_name) = lower(trim(p_destination_office_name))
      and source_office_ids @> p_source_office_ids
      and p_source_office_ids @> source_office_ids
      and status = 'completed'
    order by completed_at desc nulls last, created_at desc
    limit 1;

    if v_existing_completed.id is not null then
        return jsonb_build_object(
            'already_completed', true,
            'batch_id', v_existing_completed.id,
            'destination_office_id', v_existing_completed.new_office_id,
            'destination_office_name', v_existing_completed.new_office_name,
            'pre_snapshot', v_existing_completed.affected_counts->'pre_snapshot',
            'post_snapshot', v_existing_completed.affected_counts->'post_snapshot',
            'moved_counts', v_existing_completed.affected_counts->'moved_counts'
        );
    end if;

    perform 1
    from public.offices
    where company_id = p_company_id
      and id = any(p_source_office_ids)
    for update;

    select count(*), array_agg(coalesce(office_name, name, 'Office') order by coalesce(office_name, name, 'Office'))
    into v_source_count, v_source_names
    from public.offices
    where company_id = p_company_id
      and id = any(p_source_office_ids)
      and lower(coalesce(status, 'active')) not in ('archived','deleted','merged','inactive');

    if v_source_count <> array_length(p_source_office_ids, 1) then
        raise exception 'One source office is missing, inactive, already archived, or already merged.';
    end if;

    if exists (
        select 1
        from public.office_merge_batches
        where company_id = p_company_id
          and status in ('confirmed','queued','running')
          and source_office_ids && p_source_office_ids
    ) then
        raise exception 'A merge job is already running for one of these source offices.';
    end if;

    if exists (
        select 1
        from public.offices
        where company_id = p_company_id
          and lower(coalesce(status, 'active')) not in ('archived','deleted','merged','inactive')
          and (
              lower(coalesce(office_name, name, '')) = lower(trim(p_destination_office_name))
              or upper(coalesce(office_code, code, '')) = upper(trim(p_destination_office_code))
          )
    ) then
        raise exception 'Destination office name or code already exists.';
    end if;

    if to_regclass('public.rooms') is not null then
        select count(*)
        into v_duplicate_count
        from (
            select upper(trim(coalesce(room_number::text, ''))) as room_key,
                   coalesce(property_id::text, 'no-property') as property_key,
                   count(*) as room_count
            from public.rooms
            where company_id = p_company_id
              and office_id = any(p_source_office_ids)
              and lower(coalesce(status, 'active')) not in ('archived','deleted','removed','inactive')
            group by 1,2
            having count(*) > 1
        ) conflicts;
        if v_duplicate_count > 0 then
            raise exception 'Duplicate room numbers exist across the selected offices. Resolve room conflicts before merging.';
        end if;
    end if;

    if to_regclass('public.user_office_roles') is not null then
        select count(*)
        into v_duplicate_count
        from (
            select user_id, role_id, count(*) as role_count
            from public.user_office_roles
            where company_id = p_company_id
              and office_id = any(p_source_office_ids)
            group by user_id, role_id
            having count(*) > 1
        ) conflicts;
        if v_duplicate_count > 0 then
            raise exception 'Duplicate account-role assignments exist across the selected offices. Resolve account conflicts before merging.';
        end if;
    end if;

    v_pre_snapshot := public.ddumba_office_merge_snapshot(p_company_id, p_source_office_ids);
    if coalesce(p_expected_snapshot, '{}'::jsonb) <> '{}'::jsonb and v_pre_snapshot <> p_expected_snapshot then
        raise exception 'Pre-merge totals changed after preview. Refresh the preview and retry.';
    end if;

    insert into public.offices (
        id,
        company_id,
        name,
        office_name,
        code,
        office_code,
        address,
        city,
        location,
        status,
        created_at,
        updated_at
    )
    values (
        v_destination_office_id,
        p_company_id,
        trim(p_destination_office_name),
        trim(p_destination_office_name),
        upper(trim(p_destination_office_code)),
        upper(trim(p_destination_office_code)),
        nullif(trim(coalesce(p_destination_location, '')), ''),
        nullif(trim(coalesce(p_destination_location, '')), ''),
        nullif(trim(coalesce(p_destination_location, '')), ''),
        'active',
        v_now,
        v_now
    );

    insert into public.users (
        id,
        company_id,
        full_name,
        email,
        account_type,
        default_office_id,
        status,
        created_at,
        updated_at
    )
    values (
        p_destination_user_id,
        p_company_id,
        trim(p_destination_login_name),
        nullif(trim(coalesce(p_destination_email, '')), ''),
        'office',
        v_destination_office_id,
        'active',
        v_now,
        v_now
    )
    on conflict (id) do update
    set company_id = excluded.company_id,
        full_name = excluded.full_name,
        email = excluded.email,
        account_type = excluded.account_type,
        default_office_id = excluded.default_office_id,
        status = 'active',
        updated_at = excluded.updated_at;

    insert into public.pin_credentials (
        company_id,
        user_id,
        pin_hash,
        admin_visible_pin,
        status,
        failed_attempts,
        failed_login_attempts,
        is_locked,
        locked_at,
        reset_at,
        updated_at
    )
    values (
        p_company_id,
        p_destination_user_id,
        crypt(p_pin, gen_salt('bf')),
        null,
        'active',
        0,
        0,
        false,
        null,
        v_now,
        v_now
    )
    on conflict (user_id) do update
    set company_id = excluded.company_id,
        pin_hash = excluded.pin_hash,
        admin_visible_pin = null,
        status = 'active',
        failed_attempts = 0,
        failed_login_attempts = 0,
        is_locked = false,
        locked_at = null,
        reset_at = excluded.reset_at,
        updated_at = excluded.updated_at;

    select id
    into v_role_id
    from public.roles
    where key = 'office_manager'
      and (company_id = p_company_id or company_id is null)
    order by company_id is null
    limit 1;
    if v_role_id is null then
        raise exception 'Office Manager role is missing.';
    end if;

    insert into public.user_office_roles (
        company_id,
        user_id,
        office_id,
        role_id,
        scope,
        created_at
    )
    values (
        p_company_id,
        p_destination_user_id,
        v_destination_office_id,
        v_role_id,
        'office',
        v_now
    )
    on conflict (user_id, office_id, role_id) do nothing;

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
        v_destination_office_id,
        trim(p_destination_office_name),
        p_source_office_ids,
        v_source_names,
        'confirmed',
        p_admin_user_id,
        jsonb_build_object('pre_snapshot', v_pre_snapshot, 'moved_counts', v_moved_counts),
        nullif(trim(coalesce(p_reason_note, '')), ''),
        true,
        v_now
    )
    returning id into v_batch_id;

    foreach v_append_only_financial_table in array array['cash_transactions','tenant_ledger_entries','receipts']
    loop
        if to_regclass('public.' || v_append_only_financial_table) is not null then
            execute format('alter table public.%I disable trigger user', v_append_only_financial_table);
        end if;
    end loop;

    if to_regclass('public.landlord_monthly_payables') is not null then
        for v_duplicate_payable in
            select
                landlord_id,
                settlement_month,
                array_agg(id order by created_at, id) as payable_ids
            from public.landlord_monthly_payables
            where company_id = p_company_id
              and office_id = any(p_source_office_ids)
              and lower(coalesce(status, 'active')) not in ('archived','deleted','removed','void','voided','reversed','merged_duplicate')
            group by landlord_id, settlement_month
            having count(*) > 1
        loop
            v_survivor_payable_id := v_duplicate_payable.payable_ids[1];
            v_duplicate_payable_ids := v_duplicate_payable.payable_ids[2:array_length(v_duplicate_payable.payable_ids, 1)];

            for v_child_reference_table in
                select c.table_name
                from information_schema.columns c
                join information_schema.tables t
                  on t.table_schema = c.table_schema
                 and t.table_name = c.table_name
                 and t.table_type = 'BASE TABLE'
                where c.table_schema = 'public'
                  and c.column_name = 'monthly_payable_id'
                  and c.table_name <> 'landlord_monthly_payables'
                group by c.table_name
                order by c.table_name
            loop
                execute format(
                    'update public.%I set monthly_payable_id = %L::uuid where monthly_payable_id = any(%L::uuid[])',
                    v_child_reference_table.table_name,
                    v_survivor_payable_id,
                    v_duplicate_payable_ids
                );
            end loop;

            update public.landlord_monthly_payables survivor
            set
                full_rent_roll = totals.full_rent_roll,
                commission_amount = totals.commission_amount,
                monthly_net_payable = totals.monthly_net_payable,
                net_payable = totals.net_payable,
                amount_paid = totals.amount_paid,
                unpaid_balance = totals.unpaid_balance,
                total_due = totals.total_due,
                opening_arrears = totals.opening_arrears,
                closing_arrears = totals.closing_arrears,
                advance_created = totals.advance_created,
                advance_deductions = totals.advance_deductions,
                vacant_room_deductions = totals.vacant_room_deductions,
                vacated_tenant_debt_deductions = totals.vacated_tenant_debt_deductions,
                other_deductions = totals.other_deductions,
                overpaid_amount = totals.overpaid_amount,
                last_paid_at = totals.last_paid_at,
                paid_at = totals.paid_at,
                status = case when totals.unpaid_balance <= 0 then 'paid' else coalesce(nullif(survivor.status, ''), 'active') end,
                accounting_notes = concat_ws(E'\n', nullif(survivor.accounting_notes, ''), 'Merged duplicate source-office payable rows during office consolidation.'),
                reasons_notes = concat_ws(E'\n', nullif(survivor.reasons_notes, ''), 'Duplicate rows consolidated into this survivor row by merge batch ' || v_batch_id::text),
                merged_into_office_id = v_destination_office_id,
                merged_at = v_now,
                merge_batch_id = v_batch_id,
                updated_at = v_now
            from (
                select
                    coalesce(sum(coalesce(full_rent_roll, 0)), 0) as full_rent_roll,
                    coalesce(sum(coalesce(commission_amount, 0)), 0) as commission_amount,
                    coalesce(sum(coalesce(monthly_net_payable, 0)), 0) as monthly_net_payable,
                    coalesce(sum(coalesce(net_payable, 0)), 0) as net_payable,
                    coalesce(sum(coalesce(amount_paid, 0)), 0) as amount_paid,
                    coalesce(sum(coalesce(unpaid_balance, greatest(coalesce(net_payable, monthly_net_payable, 0) - coalesce(amount_paid, 0), 0))), 0) as unpaid_balance,
                    coalesce(sum(coalesce(total_due, unpaid_balance, net_payable, monthly_net_payable, 0)), 0) as total_due,
                    coalesce(sum(coalesce(opening_arrears, 0)), 0) as opening_arrears,
                    coalesce(sum(coalesce(closing_arrears, 0)), 0) as closing_arrears,
                    coalesce(sum(coalesce(advance_created, 0)), 0) as advance_created,
                    coalesce(sum(coalesce(advance_deductions, 0)), 0) as advance_deductions,
                    coalesce(sum(coalesce(vacant_room_deductions, 0)), 0) as vacant_room_deductions,
                    coalesce(sum(coalesce(vacated_tenant_debt_deductions, 0)), 0) as vacated_tenant_debt_deductions,
                    coalesce(sum(coalesce(other_deductions, 0)), 0) as other_deductions,
                    coalesce(sum(coalesce(overpaid_amount, 0)), 0) as overpaid_amount,
                    max(last_paid_at) as last_paid_at,
                    max(paid_at) as paid_at
                from public.landlord_monthly_payables
                where id = any(v_duplicate_payable.payable_ids)
            ) totals
            where survivor.id = v_survivor_payable_id;

            update public.landlord_monthly_payables
            set status = 'merged_duplicate',
                original_office_id = coalesce(original_office_id, office_id),
                original_office_name = coalesce(original_office_name, office_name),
                merged_into_office_id = v_destination_office_id,
                merged_at = v_now,
                merge_batch_id = v_batch_id,
                accounting_notes = concat_ws(E'\n', nullif(accounting_notes, ''), 'Merged into survivor monthly payable ' || v_survivor_payable_id::text || ' during office consolidation.'),
                updated_at = v_now
            where id = any(v_duplicate_payable_ids);

            v_moved_counts := jsonb_set(
                v_moved_counts,
                array['landlord_monthly_payables_consolidated_duplicates'],
                to_jsonb(coalesce((v_moved_counts->>'landlord_monthly_payables_consolidated_duplicates')::integer, 0) + array_length(v_duplicate_payable_ids, 1)),
                true
            );

            insert into public.office_merge_audit (
                company_id,
                merge_batch_id,
                source_office_id,
                source_office_name,
                merged_into_office_id,
                entity_table,
                entity_id,
                action,
                before_data,
                after_data,
                admin_user_id
            )
            values (
                p_company_id,
                v_batch_id,
                null,
                'Multiple source offices',
                v_destination_office_id,
                'landlord_monthly_payables',
                v_survivor_payable_id,
                'duplicate_monthly_payables_consolidated',
                jsonb_build_object('duplicate_payable_ids', v_duplicate_payable_ids, 'landlord_id', v_duplicate_payable.landlord_id, 'settlement_month', v_duplicate_payable.settlement_month),
                jsonb_build_object('survivor_payable_id', v_survivor_payable_id),
                p_admin_user_id
            );
        end loop;
    end if;

    if to_regclass('public.landlord_portfolio_summaries') is not null then
        for v_duplicate_summary in
            select landlord_id, summary_month, array_agg(id order by updated_at desc nulls last, id) as summary_ids
            from public.landlord_portfolio_summaries
            where company_id = p_company_id
              and office_id = any(p_source_office_ids)
            group by landlord_id, summary_month
            having count(*) > 1
        loop
            v_survivor_summary_id := v_duplicate_summary.summary_ids[1];
            v_duplicate_summary_ids := v_duplicate_summary.summary_ids[2:array_length(v_duplicate_summary.summary_ids, 1)];

            update public.landlord_portfolio_summaries survivor
            set
                rooms_count = totals.rooms_count,
                occupied_rooms = totals.occupied_rooms,
                vacant_rooms = totals.vacant_rooms,
                rent_roll = totals.rent_roll,
                outstanding_balance = totals.outstanding_balance,
                landlord_net_payable_estimate = totals.landlord_net_payable_estimate,
                recovery_deductions = totals.recovery_deductions,
                collected_this_month = totals.collected_this_month,
                commission_rate = greatest(coalesce(survivor.commission_rate, 0), totals.commission_rate),
                updated_at = v_now
            from (
                select
                    coalesce(sum(coalesce(rooms_count, 0)), 0) as rooms_count,
                    coalesce(sum(coalesce(occupied_rooms, 0)), 0) as occupied_rooms,
                    coalesce(sum(coalesce(vacant_rooms, 0)), 0) as vacant_rooms,
                    coalesce(sum(coalesce(rent_roll, 0)), 0) as rent_roll,
                    coalesce(sum(coalesce(outstanding_balance, 0)), 0) as outstanding_balance,
                    coalesce(sum(coalesce(landlord_net_payable_estimate, 0)), 0) as landlord_net_payable_estimate,
                    coalesce(sum(coalesce(recovery_deductions, 0)), 0) as recovery_deductions,
                    coalesce(sum(coalesce(collected_this_month, 0)), 0) as collected_this_month,
                    max(coalesce(commission_rate, 0)) as commission_rate
                from public.landlord_portfolio_summaries
                where id = any(v_duplicate_summary.summary_ids)
            ) totals
            where survivor.id = v_survivor_summary_id;

            delete from public.landlord_portfolio_summaries
            where id = any(v_duplicate_summary_ids);

            insert into public.office_merge_audit (
                company_id,
                merge_batch_id,
                source_office_id,
                source_office_name,
                merged_into_office_id,
                entity_table,
                entity_id,
                action,
                before_data,
                after_data,
                admin_user_id
            )
            values (
                p_company_id,
                v_batch_id,
                null,
                'Multiple source offices',
                v_destination_office_id,
                'landlord_portfolio_summaries',
                v_survivor_summary_id,
                'duplicate_summary_cache_consolidated',
                jsonb_build_object('duplicate_summary_ids', v_duplicate_summary_ids, 'landlord_id', v_duplicate_summary.landlord_id, 'summary_month', v_duplicate_summary.summary_month),
                jsonb_build_object('survivor_summary_id', v_survivor_summary_id),
                p_admin_user_id
            );
        end loop;
    end if;

    if to_regclass('public.office_monthly_finance_snapshots') is not null then
        for v_duplicate_summary in
            select snapshot_month, array_agg(id order by updated_at desc nulls last, created_at desc nulls last, id) as summary_ids
            from public.office_monthly_finance_snapshots
            where company_id = p_company_id
              and office_id = any(p_source_office_ids)
            group by snapshot_month
            having count(*) > 1
        loop
            v_survivor_summary_id := v_duplicate_summary.summary_ids[1];
            v_duplicate_summary_ids := v_duplicate_summary.summary_ids[2:array_length(v_duplicate_summary.summary_ids, 1)];

            update public.office_monthly_finance_snapshots survivor
            set
                expected_rent_roll = totals.expected_rent_roll,
                amount_collected = totals.amount_collected,
                outstanding_tenant_balances = totals.outstanding_tenant_balances,
                expenses = totals.expenses,
                landlord_payments_made = totals.landlord_payments_made,
                expected_company_commission = totals.expected_company_commission,
                expected_landlord_payable = totals.expected_landlord_payable,
                profit_loss = totals.profit_loss,
                updated_at = v_now
            from (
                select
                    coalesce(sum(coalesce(expected_rent_roll, 0)), 0) as expected_rent_roll,
                    coalesce(sum(coalesce(amount_collected, 0)), 0) as amount_collected,
                    coalesce(sum(coalesce(outstanding_tenant_balances, 0)), 0) as outstanding_tenant_balances,
                    coalesce(sum(coalesce(expenses, 0)), 0) as expenses,
                    coalesce(sum(coalesce(landlord_payments_made, 0)), 0) as landlord_payments_made,
                    coalesce(sum(coalesce(expected_company_commission, 0)), 0) as expected_company_commission,
                    coalesce(sum(coalesce(expected_landlord_payable, 0)), 0) as expected_landlord_payable,
                    coalesce(sum(coalesce(profit_loss, 0)), 0) as profit_loss
                from public.office_monthly_finance_snapshots
                where id = any(v_duplicate_summary.summary_ids)
            ) totals
            where survivor.id = v_survivor_summary_id;

            delete from public.office_monthly_finance_snapshots
            where id = any(v_duplicate_summary_ids);

            insert into public.office_merge_audit (
                company_id,
                merge_batch_id,
                source_office_id,
                source_office_name,
                merged_into_office_id,
                entity_table,
                entity_id,
                action,
                before_data,
                after_data,
                admin_user_id
            )
            values (
                p_company_id,
                v_batch_id,
                null,
                'Multiple source offices',
                v_destination_office_id,
                'office_monthly_finance_snapshots',
                v_survivor_summary_id,
                'duplicate_summary_cache_consolidated',
                jsonb_build_object('duplicate_snapshot_ids', v_duplicate_summary_ids, 'snapshot_month', v_duplicate_summary.snapshot_month),
                jsonb_build_object('survivor_snapshot_id', v_survivor_summary_id),
                p_admin_user_id
            );
        end loop;
    end if;

    for v_source in
        select id, coalesce(office_name, name, 'Office') as office_name, coalesce(status, 'active') as status
        from public.offices
        where company_id = p_company_id
          and id = any(p_source_office_ids)
        order by coalesce(office_name, name, 'Office')
    loop
        for v_table in
            select c.table_name
            from information_schema.columns c
            join information_schema.tables t
              on t.table_schema = c.table_schema
             and t.table_name = c.table_name
             and t.table_type = 'BASE TABLE'
            where c.table_schema = 'public'
              and c.column_name = 'office_id'
              and c.table_name not in ('offices','office_merge_batches','office_merge_audit','audit_logs','security_events')
            group by c.table_name
            order by c.table_name
        loop
            select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = v_table.table_name and column_name = 'company_id') into v_has_company_id;
            select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = v_table.table_name and column_name = 'original_office_id') into v_has_original_office_id;
            select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = v_table.table_name and column_name = 'original_office_name') into v_has_original_office_name;
            select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = v_table.table_name and column_name = 'merged_into_office_id') into v_has_merged_into_office_id;
            select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = v_table.table_name and column_name = 'merged_at') into v_has_merged_at;
            select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = v_table.table_name and column_name = 'merge_batch_id') into v_has_merge_batch_id;
            select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = v_table.table_name and column_name = 'updated_at') into v_has_updated_at;

            v_set_sql := format('office_id = %L::uuid', v_destination_office_id);
            if v_has_original_office_id then
                v_set_sql := v_set_sql || format(', original_office_id = coalesce(original_office_id, %L::uuid)', v_source.id);
            end if;
            if v_has_original_office_name then
                v_set_sql := v_set_sql || format(', original_office_name = coalesce(original_office_name, %L)', v_source.office_name);
            end if;
            if v_has_merged_into_office_id then
                v_set_sql := v_set_sql || format(', merged_into_office_id = %L::uuid', v_destination_office_id);
            end if;
            if v_has_merged_at then
                v_set_sql := v_set_sql || format(', merged_at = %L::timestamptz', v_now);
            end if;
            if v_has_merge_batch_id then
                v_set_sql := v_set_sql || format(', merge_batch_id = %L::uuid', v_batch_id);
            end if;
            if v_has_updated_at then
                v_set_sql := v_set_sql || format(', updated_at = %L::timestamptz', v_now);
            end if;

            v_where_sql := format('office_id = %L::uuid', v_source.id);
            if v_has_company_id then
                v_where_sql := v_where_sql || format(' and company_id = %L::uuid', p_company_id);
            end if;
            if v_table.table_name = 'landlord_monthly_payables' then
                v_where_sql := v_where_sql || ' and lower(coalesce(status, '''')) <> ''merged_duplicate''';
            end if;

            execute format('update public.%I set %s where %s', v_table.table_name, v_set_sql, v_where_sql);
            get diagnostics v_moved_count = row_count;
            v_moved_counts := jsonb_set(
                v_moved_counts,
                array[v_table.table_name],
                to_jsonb(coalesce((v_moved_counts->>v_table.table_name)::integer, 0) + v_moved_count),
                true
            );

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
                v_batch_id,
                v_source.id,
                v_source.office_name,
                v_destination_office_id,
                v_table.table_name,
                case when v_moved_count = 0 then 'office_scope_checked' else 'office_scope_moved' end,
                jsonb_build_object('office_id', v_source.id, 'office_name', v_source.office_name),
                jsonb_build_object('office_id', v_destination_office_id, 'office_name', p_destination_office_name, 'rows', v_moved_count),
                p_admin_user_id
            );
        end loop;

        update public.users
        set default_office_id = v_destination_office_id,
            updated_at = v_now
        where company_id = p_company_id
          and default_office_id = v_source.id;
        get diagnostics v_moved_count = row_count;
        v_moved_counts := jsonb_set(
            v_moved_counts,
            array['users_default_office_id'],
            to_jsonb(coalesce((v_moved_counts->>'users_default_office_id')::integer, 0) + v_moved_count),
            true
        );

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
            v_batch_id,
            v_source.id,
            v_source.office_name,
            v_destination_office_id,
            'users',
            'default_office_reassigned',
            jsonb_build_object('default_office_id', v_source.id),
            jsonb_build_object('default_office_id', v_destination_office_id, 'rows', v_moved_count),
            p_admin_user_id
        );

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
        select
            p_company_id,
            v_batch_id,
            v_source.id,
            v_source.office_name,
            v_destination_office_id,
            append_only_table,
            'append_only_history_preserved',
            jsonb_build_object('office_id', v_source.id, 'office_name', v_source.office_name),
            jsonb_build_object('office_id', v_source.id, 'note', append_only_table || ' is append-only; original office reference preserved for audit history'),
            p_admin_user_id
        from unnest(array['audit_logs','security_events']) as append_only_table
        where to_regclass('public.' || append_only_table) is not null;

        update public.offices
        set status = 'merged',
            merged_into_office_id = v_destination_office_id,
            merged_at = v_now,
            merge_batch_id = v_batch_id,
            updated_at = v_now
        where id = v_source.id
          and company_id = p_company_id;

        insert into public.office_merge_audit (
            company_id,
            merge_batch_id,
            source_office_id,
            source_office_name,
            merged_into_office_id,
            entity_table,
            entity_id,
            action,
            before_data,
            after_data,
            admin_user_id
        )
        values (
            p_company_id,
            v_batch_id,
            v_source.id,
            v_source.office_name,
            v_destination_office_id,
            'offices',
            v_source.id,
            'source_office_archived_after_merge',
            jsonb_build_object('status', v_source.status),
            jsonb_build_object('status', 'merged', 'merged_into_office_id', v_destination_office_id),
            p_admin_user_id
        );
    end loop;

    foreach v_append_only_financial_table in array array['cash_transactions','tenant_ledger_entries','receipts']
    loop
        if to_regclass('public.' || v_append_only_financial_table) is not null then
            execute format('alter table public.%I enable trigger user', v_append_only_financial_table);
        end if;
    end loop;

    v_post_snapshot := public.ddumba_office_merge_snapshot(p_company_id, array[v_destination_office_id]);
    if (v_pre_snapshot - 'user_assignments' - 'landlord_payables') <> (v_post_snapshot - 'user_assignments' - 'landlord_payables') then
        raise exception 'Financial reconciliation failed. Pre-merge totals %, post-merge totals %', v_pre_snapshot, v_post_snapshot;
    end if;

    for v_table in
        select c.table_name,
               exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = c.table_name and column_name = 'company_id') as has_company_id
        from information_schema.columns c
        join information_schema.tables t
          on t.table_schema = c.table_schema
         and t.table_name = c.table_name
         and t.table_type = 'BASE TABLE'
        where c.table_schema = 'public'
          and c.column_name = 'office_id'
          and c.table_name not in ('offices','office_merge_batches','office_merge_audit','audit_logs','security_events')
        group by c.table_name
    loop
        v_where_sql := format('office_id = any(%L::uuid[])', p_source_office_ids);
        if v_table.has_company_id then
            v_where_sql := v_where_sql || format(' and company_id = %L::uuid', p_company_id);
        end if;
        if v_table.table_name = 'landlord_monthly_payables' then
            v_where_sql := v_where_sql || ' and lower(coalesce(status, '''')) <> ''merged_duplicate''';
        end if;
        execute format('select count(*) from public.%I where %s', v_table.table_name, v_where_sql)
        into v_remaining_count;
        if v_remaining_count > 0 then
            v_total_remaining := v_total_remaining + v_remaining_count;
        end if;
    end loop;

    select count(*)
    into v_remaining_count
    from public.users
    where company_id = p_company_id
      and default_office_id = any(p_source_office_ids);
    v_total_remaining := v_total_remaining + v_remaining_count;

    if v_total_remaining > 0 then
        raise exception 'Post-merge verification found % records still assigned to source offices.', v_total_remaining;
    end if;

    update public.office_merge_batches
    set status = 'completed',
        completed_at = v_now,
        affected_counts = jsonb_build_object(
            'pre_snapshot', v_pre_snapshot,
            'post_snapshot', v_post_snapshot,
            'moved_counts', v_moved_counts,
            'source_office_ids', p_source_office_ids,
            'source_office_names', v_source_names
        )
    where id = v_batch_id;

    return jsonb_build_object(
        'already_completed', false,
        'batch_id', v_batch_id,
        'merge_reference', 'MERGE-' || upper(substr(v_batch_id::text, 1, 8)),
        'destination_office_id', v_destination_office_id,
        'destination_office_name', p_destination_office_name,
        'source_office_ids', p_source_office_ids,
        'source_office_names', v_source_names,
        'pre_snapshot', v_pre_snapshot,
        'post_snapshot', v_post_snapshot,
        'moved_counts', v_moved_counts,
        'remaining_source_records', 0,
        'source_status', 'merged',
        'completed_at', v_now
    );
end;
$$;

grant execute on function public.ddumba_office_merge_snapshot(uuid, uuid[]) to authenticated, service_role;
grant execute on function public.ddumba_merge_offices_atomic(uuid, uuid[], text, text, text, uuid, text, text, text, uuid, text, jsonb) to service_role;
