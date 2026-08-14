-- Targeted production integrity repairs after matured-advance reconciliation.
-- Scope:
-- 1. D124: repair a proven rent-allocation metadata inconsistency without
--    changing the authoritative UGX 200,000 final outstanding balance.
-- 2. R14: preserve the reversed duplicate retry row, but stop it from being
--    financially effective.

begin;

do $$
declare
    v_d124_room_id uuid := '3d294c34-eb8c-4ffa-a58b-0f81781adfe5';
    v_d124_tenant_id uuid := '045f1d6f-ce35-4ff0-b98c-6f3eba6ca564';
    v_d124_company_id uuid;
    v_d124_office_id uuid;
    v_july15_payment_id uuid := '56328742-f778-4535-a58a-dd4bffd43a55';
    v_aug13_payment_id uuid := '3e847e3f-7eeb-461a-a167-4114f265f36f';
    v_before jsonb;
    v_after jsonb;
begin
    select company_id, office_id
    into v_d124_company_id, v_d124_office_id
    from public.rooms
    where id = v_d124_room_id
    for update;

    if v_d124_company_id is null then
        raise exception 'D124 targeted repair aborted: room not found.';
    end if;

    select jsonb_build_object(
        'collections', (
            select jsonb_agg(to_jsonb(c) order by c.payment_date, c.created_at)
            from public.collections c
            where c.id in (v_july15_payment_id, v_aug13_payment_id)
        ),
        'rent_months', (
            select jsonb_agg(to_jsonb(m) order by m.rent_month)
            from public.tenant_rent_months m
            where m.room_id = v_d124_room_id
        ),
        'allocations', (
            select jsonb_agg(to_jsonb(a) order by a.allocation_month, a.created_at)
            from public.tenant_rent_allocations a
            where a.room_id = v_d124_room_id
        ),
        'tenant_balance', (select balance from public.tenants where id = v_d124_tenant_id),
        'room_balance', (select outstanding_balance from public.rooms where id = v_d124_room_id)
    )
    into v_before;

    update public.collections
    set used_to_clear_outstanding = 90000,
        allocated_to_next_month = 0,
        balance = 0,
        balance_after_payment = 0,
        updated_at = now(),
        notes = concat_ws(E'\n', nullif(notes, ''), 'Integrity repair 0279: July 15 D124 payment cleared remaining old arrears; removed false next-month allocation.')
    where id = v_july15_payment_id
      and room_id = v_d124_room_id
      and tenant_id = v_d124_tenant_id
      and coalesce(financial_effective, true) is true;

    insert into public.tenant_rent_allocations (
        company_id,
        office_id,
        tenant_id,
        room_id,
        payment_id,
        allocation_month,
        allocation_type,
        amount_allocated,
        allocation_source,
        is_historical_credit,
        consumed_by_balance_reconciliation,
        created_at
    )
    select
        v_d124_company_id,
        v_d124_office_id,
        v_d124_tenant_id,
        v_d124_room_id,
        v_july15_payment_id,
        date '2026-06-01',
        'arrears',
        90000,
        'integrity_repair_0279',
        false,
        0,
        now()
    where not exists (
        select 1
        from public.tenant_rent_allocations
        where payment_id = v_july15_payment_id
          and room_id = v_d124_room_id
          and allocation_source = 'integrity_repair_0279'
    );

    update public.tenant_rent_allocations
    set allocation_month = date '2026-07-01',
        allocation_type = 'current_month',
        allocation_source = 'integrity_repair_0279',
        coverage_start = date '2026-07-01',
        coverage_end = date '2026-07-31'
    where payment_id = v_aug13_payment_id
      and room_id = v_d124_room_id
      and allocation_month = date '2026-06-01'
      and allocation_type = 'arrears'
      and amount_allocated = 50000;

    update public.tenant_rent_months
    set amount_paid = 200000,
        outstanding_amount = 0,
        status = 'paid',
        coverage_start = coalesce(coverage_start, date '2026-07-01'),
        coverage_end = coalesce(coverage_end, date '2026-07-31'),
        updated_at = now()
    where room_id = v_d124_room_id
      and tenant_id = v_d124_tenant_id
      and rent_month = date '2026-07-01';

    update public.tenant_rent_months
    set amount_paid = 0,
        outstanding_amount = 200000,
        status = 'unpaid',
        coverage_start = coalesce(coverage_start, date '2026-08-01'),
        coverage_end = coalesce(coverage_end, date '2026-08-31'),
        updated_at = now()
    where room_id = v_d124_room_id
      and tenant_id = v_d124_tenant_id
      and rent_month = date '2026-08-01';

    update public.tenants
    set balance = 200000,
        updated_at = now()
    where id = v_d124_tenant_id
      and room_id = v_d124_room_id;

    update public.rooms
    set outstanding_balance = 200000,
        updated_at = now()
    where id = v_d124_room_id;

    select jsonb_build_object(
        'collections', (
            select jsonb_agg(to_jsonb(c) order by c.payment_date, c.created_at)
            from public.collections c
            where c.id in (v_july15_payment_id, v_aug13_payment_id)
        ),
        'rent_months', (
            select jsonb_agg(to_jsonb(m) order by m.rent_month)
            from public.tenant_rent_months m
            where m.room_id = v_d124_room_id
        ),
        'allocations', (
            select jsonb_agg(to_jsonb(a) order by a.allocation_month, a.created_at)
            from public.tenant_rent_allocations a
            where a.room_id = v_d124_room_id
        ),
        'tenant_balance', (select balance from public.tenants where id = v_d124_tenant_id),
        'room_balance', (select outstanding_balance from public.rooms where id = v_d124_room_id)
    )
    into v_after;

    insert into public.tenant_balance_reconciliations (
        company_id,
        office_id,
        tenant_id,
        room_id,
        source_type,
        source_id,
        requested_outstanding,
        outstanding_before,
        advance_before,
        advance_consumed,
        outstanding_after,
        advance_after,
        note,
        created_at
    )
    values (
        v_d124_company_id,
        v_d124_office_id,
        v_d124_tenant_id,
        v_d124_room_id,
        'remaining_integrity_repair_0279',
        v_july15_payment_id,
        200000,
        coalesce((v_before->>'tenant_balance')::numeric, 200000),
        0,
        0,
        200000,
        0,
        'D124 allocation metadata repaired: July 15 payment clears remaining old arrears; August 13 UGX 50,000 finishes July rent; final outstanding remains UGX 200,000 for August.',
        now()
    );

    insert into public.audit_logs (
        company_id,
        office_id,
        entity_type,
        entity_id,
        action,
        before_data,
        after_data,
        created_at
    )
    values (
        v_d124_company_id,
        v_d124_office_id,
        'tenant_balance',
        v_d124_tenant_id,
        'remaining_integrity_repair_0279_d124',
        v_before,
        v_after,
        now()
    );
end $$;

do $$
declare
    v_before jsonb;
    v_after jsonb;
    v_company_id uuid;
    v_office_id uuid;
begin
    select to_jsonb(c), c.company_id, c.office_id
    into v_before, v_company_id, v_office_id
    from public.collections c
    where c.id = '08194e3e-e4c6-4d8c-b0e3-e79cc511e38d'
      and c.status = 'reversed_duplicate_move_in_retry'
    for update;

    if v_before is not null then
        update public.collections
        set financial_effective = false,
            reversed_at = coalesce(reversed_at, now()),
            updated_at = now(),
            notes = concat_ws(E'\n', nullif(notes, ''), 'Integrity repair 0279: row status already marks this as reversed duplicate move-in retry; financial_effective set false while preserving history.')
        where id = '08194e3e-e4c6-4d8c-b0e3-e79cc511e38d'
          and status = 'reversed_duplicate_move_in_retry';

        select to_jsonb(c)
        into v_after
        from public.collections c
        where c.id = '08194e3e-e4c6-4d8c-b0e3-e79cc511e38d';

        insert into public.audit_logs (
            company_id,
            office_id,
            entity_type,
            entity_id,
            action,
            before_data,
            after_data,
            created_at
        )
        values (
            v_company_id,
            v_office_id,
            'collection',
            '08194e3e-e4c6-4d8c-b0e3-e79cc511e38d',
            'remaining_integrity_repair_0279_r14_reversed_duplicate_ineffective',
            v_before,
            v_after,
            now()
        );
    end if;
end $$;

commit;
