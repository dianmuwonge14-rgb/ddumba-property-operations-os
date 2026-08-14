-- Roll forward unused matured advance.
-- If an old advance allocation has reached/passed its target period but there
-- is no due rent left to consume, keep the original payment intact, retire the
-- stale allocation, and recreate only allocation rows for future billing
-- periods. This keeps Advance Rent Balance future-only.

create or replace function public.consume_matured_tenant_advance(
    p_company_id uuid,
    p_tenant_id uuid default null,
    p_room_id uuid default null,
    p_business_date date default ((now() at time zone 'Africa/Kampala')::date),
    p_actor_id uuid default null,
    p_source_type text default 'matured_advance_consumption',
    p_note text default 'Matured advance rent consumed into due billing periods.'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_tenant record;
    v_period record;
    v_allocation record;
    v_available numeric(14,2);
    v_slice numeric(14,2);
    v_period_consumed numeric(14,2);
    v_tenant_consumed numeric(14,2);
    v_tenant_rolled_forward numeric(14,2);
    v_total_consumed numeric(14,2) := 0;
    v_total_rolled_forward numeric(14,2) := 0;
    v_tenants_scanned int := 0;
    v_tenants_repaired int := 0;
    v_periods_repaired int := 0;
    v_allocations_rolled_forward int := 0;
    v_outstanding_before numeric(14,2);
    v_outstanding_after numeric(14,2);
    v_period_outstanding_before numeric(14,2);
    v_period_outstanding_after numeric(14,2);
    v_advance_before numeric(14,2);
    v_future_advance_after numeric(14,2);
    v_reconciliation_id uuid;
    v_period_snapshot jsonb;
    v_allocation_snapshot jsonb;
    v_billing_day int;
    v_monthly_rent numeric(14,2);
    v_next_due date;
    v_next_end date;
    v_remaining_roll numeric(14,2);
    v_roll_slice numeric(14,2);
    v_roll_index int;
begin
    if p_company_id is null then
        raise exception 'company_id is required';
    end if;

    for v_tenant in
        select
            t.id as tenant_id,
            t.full_name as tenant_name,
            t.office_id as tenant_office_id,
            t.room_id as tenant_room_id,
            t.billing_day as tenant_billing_day,
            t.monthly_rent as tenant_rent,
            coalesce(t.balance, 0)::numeric as tenant_balance,
            r.id as room_id,
            r.office_id as room_office_id,
            r.monthly_rent as room_rent,
            coalesce(r.outstanding_balance, 0)::numeric as room_balance,
            l.id as lease_id,
            l.billing_day as lease_billing_day,
            l.monthly_rent as lease_rent
        from public.tenants t
        left join public.rooms r
          on r.company_id = t.company_id
         and r.id = t.room_id
        left join lateral (
            select *
            from public.leases l
            where l.company_id = t.company_id
              and l.tenant_id = t.id
              and l.status = 'active'
            order by l.start_date desc nulls last, l.created_at desc nulls last
            limit 1
        ) l on true
        where t.company_id = p_company_id
          and lower(coalesce(t.status, 'active')) = 'active'
          and (p_tenant_id is null or t.id = p_tenant_id)
          and (p_room_id is null or t.room_id = p_room_id or r.id = p_room_id)
        order by r.room_number nulls last, t.full_name
        for update of t
    loop
        v_tenants_scanned := v_tenants_scanned + 1;
        v_tenant_consumed := 0;
        v_tenant_rolled_forward := 0;
        v_outstanding_before := greatest(0, coalesce(v_tenant.tenant_balance, v_tenant.room_balance, 0));
        v_billing_day := least(31, greatest(1, coalesce(v_tenant.lease_billing_day, v_tenant.tenant_billing_day, 1)));
        v_monthly_rent := greatest(0, coalesce(v_tenant.lease_rent, v_tenant.tenant_rent, v_tenant.room_rent, 0));

        select coalesce(sum(greatest(0, coalesce(a.amount_allocated, 0) - coalesce(a.consumed_by_balance_reconciliation, 0))), 0)
        into v_advance_before
        from public.tenant_rent_allocations a
        where a.company_id = p_company_id
          and a.tenant_id = v_tenant.tenant_id
          and a.allocation_type = 'advance_month'
          and coalesce(a.amount_allocated, 0) > coalesce(a.consumed_by_balance_reconciliation, 0);

        if v_advance_before <= 0 then
            continue;
        end if;

        select coalesce(sum(greatest(0, coalesce(m.outstanding_amount, 0))), 0)
        into v_period_outstanding_before
        from public.tenant_rent_months m
        where m.company_id = p_company_id
          and m.tenant_id = v_tenant.tenant_id
          and coalesce(m.coverage_start, m.due_date, m.rent_month) <= p_business_date
          and lower(coalesce(m.status, 'unpaid')) not in ('cancelled','canceled','voided','deleted','reversed');

        select coalesce(jsonb_agg(to_jsonb(m) order by coalesce(m.coverage_start, m.due_date, m.rent_month), m.created_at, m.id), '[]'::jsonb)
        into v_period_snapshot
        from public.tenant_rent_months m
        where m.company_id = p_company_id
          and m.tenant_id = v_tenant.tenant_id
          and coalesce(m.coverage_start, m.due_date, m.rent_month) <= p_business_date
          and lower(coalesce(m.status, 'unpaid')) not in ('cancelled','canceled','voided','deleted','reversed');

        select coalesce(jsonb_agg(to_jsonb(a) order by public.ddumba_billing_date_for_month(extract(year from a.allocation_month)::int, extract(month from a.allocation_month)::int, v_billing_day), a.created_at, a.id), '[]'::jsonb)
        into v_allocation_snapshot
        from public.tenant_rent_allocations a
        where a.company_id = p_company_id
          and a.tenant_id = v_tenant.tenant_id
          and a.allocation_type = 'advance_month'
          and coalesce(a.amount_allocated, 0) > coalesce(a.consumed_by_balance_reconciliation, 0);

        for v_period in
            select *
            from public.tenant_rent_months m
            where m.company_id = p_company_id
              and m.tenant_id = v_tenant.tenant_id
              and (p_room_id is null or m.room_id = p_room_id)
              and coalesce(m.outstanding_amount, 0) > 0
              and coalesce(m.coverage_start, m.due_date, m.rent_month) <= p_business_date
              and lower(coalesce(m.status, 'unpaid')) not in ('cancelled','canceled','voided','deleted','reversed')
            order by coalesce(m.coverage_start, m.due_date, m.rent_month), m.created_at, m.id
            for update
        loop
            v_period_consumed := 0;

            for v_allocation in
                select *
                from public.tenant_rent_allocations a
                where a.company_id = p_company_id
                  and a.tenant_id = v_tenant.tenant_id
                  and a.allocation_type = 'advance_month'
                  and coalesce(a.amount_allocated, 0) > coalesce(a.consumed_by_balance_reconciliation, 0)
                  and public.ddumba_billing_date_for_month(extract(year from a.allocation_month)::int, extract(month from a.allocation_month)::int, v_billing_day) <= p_business_date
                order by public.ddumba_billing_date_for_month(extract(year from a.allocation_month)::int, extract(month from a.allocation_month)::int, v_billing_day), a.created_at, a.id
                for update
            loop
                exit when coalesce(v_period.outstanding_amount, 0) - v_period_consumed <= 0;

                v_available := greatest(0, coalesce(v_allocation.amount_allocated, 0) - coalesce(v_allocation.consumed_by_balance_reconciliation, 0));
                v_slice := least(v_available, greatest(0, coalesce(v_period.outstanding_amount, 0) - v_period_consumed));

                if v_slice <= 0 then
                    continue;
                end if;

                update public.tenant_rent_allocations
                set consumed_by_balance_reconciliation = coalesce(consumed_by_balance_reconciliation, 0) + v_slice
                where id = v_allocation.id
                  and company_id = p_company_id;

                v_period_consumed := v_period_consumed + v_slice;
                v_tenant_consumed := v_tenant_consumed + v_slice;
                v_total_consumed := v_total_consumed + v_slice;
            end loop;

            if v_period_consumed > 0 then
                update public.tenant_rent_months
                set amount_paid = least(greatest(coalesce(rent_amount, 0), coalesce(amount_paid, 0)), coalesce(amount_paid, 0) + v_period_consumed),
                    outstanding_amount = greatest(0, coalesce(outstanding_amount, 0) - v_period_consumed),
                    status = case
                        when greatest(0, coalesce(outstanding_amount, 0) - v_period_consumed) <= 0 then 'paid'
                        else 'partial'
                    end,
                    updated_at = now()
                where id = v_period.id
                  and company_id = p_company_id;

                v_periods_repaired := v_periods_repaired + 1;
            end if;
        end loop;

        v_next_due := public.ddumba_billing_date_for_month(
            extract(year from p_business_date)::int,
            extract(month from p_business_date)::int,
            v_billing_day
        );
        if v_next_due <= p_business_date then
            v_next_due := public.ddumba_add_billing_months(v_next_due, 1, v_billing_day);
        end if;
        v_roll_index := 0;

        for v_allocation in
            select *
            from public.tenant_rent_allocations a
            where a.company_id = p_company_id
              and a.tenant_id = v_tenant.tenant_id
              and a.allocation_type = 'advance_month'
              and coalesce(a.amount_allocated, 0) > coalesce(a.consumed_by_balance_reconciliation, 0)
              and public.ddumba_billing_date_for_month(extract(year from a.allocation_month)::int, extract(month from a.allocation_month)::int, v_billing_day) <= p_business_date
            order by public.ddumba_billing_date_for_month(extract(year from a.allocation_month)::int, extract(month from a.allocation_month)::int, v_billing_day), a.created_at, a.id
            for update
        loop
            v_remaining_roll := greatest(0, coalesce(v_allocation.amount_allocated, 0) - coalesce(v_allocation.consumed_by_balance_reconciliation, 0));
            if v_remaining_roll <= 0 then
                continue;
            end if;

            update public.tenant_rent_allocations
            set consumed_by_balance_reconciliation = coalesce(amount_allocated, 0)
            where id = v_allocation.id
              and company_id = p_company_id;

            while v_remaining_roll > 0 and v_roll_index < 240 loop
                v_next_end := public.ddumba_add_billing_months(v_next_due, 1, v_billing_day) - 1;
                v_roll_slice := case
                    when v_monthly_rent > 0 then least(v_monthly_rent, v_remaining_roll)
                    else v_remaining_roll
                end;

                insert into public.tenant_rent_allocations (
                    company_id,
                    office_id,
                    tenant_id,
                    room_id,
                    payment_id,
                    source_lease_id,
                    allocation_month,
                    allocation_type,
                    amount_allocated,
                    allocation_source,
                    is_historical_credit,
                    remaining_credit,
                    coverage_start,
                    coverage_end,
                    coverage_index
                )
                values (
                    p_company_id,
                    coalesce(v_allocation.office_id, v_tenant.tenant_office_id, v_tenant.room_office_id),
                    v_tenant.tenant_id,
                    coalesce(v_allocation.room_id, v_tenant.room_id),
                    v_allocation.payment_id,
                    coalesce(v_allocation.source_lease_id, v_tenant.lease_id),
                    v_next_due,
                    'advance_month',
                    v_roll_slice,
                    'matured_advance_roll_forward',
                    coalesce(v_allocation.is_historical_credit, false),
                    greatest(0, v_remaining_roll - v_roll_slice),
                    v_next_due,
                    v_next_end,
                    v_roll_index
                );

                v_remaining_roll := v_remaining_roll - v_roll_slice;
                v_tenant_rolled_forward := v_tenant_rolled_forward + v_roll_slice;
                v_total_rolled_forward := v_total_rolled_forward + v_roll_slice;
                v_allocations_rolled_forward := v_allocations_rolled_forward + 1;
                v_next_due := public.ddumba_add_billing_months(v_next_due, 1, v_billing_day);
                v_roll_index := v_roll_index + 1;
            end loop;
        end loop;

        if v_tenant_consumed <= 0 and v_tenant_rolled_forward <= 0 then
            continue;
        end if;

        insert into public.tenant_matured_advance_repair_snapshots (
            company_id,
            office_id,
            tenant_id,
            room_id,
            business_date,
            source_type,
            tenant_balance_before,
            room_balance_before,
            due_period_outstanding_before,
            advance_available_before,
            snapshot,
            created_by
        )
        values (
            p_company_id,
            coalesce(v_tenant.tenant_office_id, v_tenant.room_office_id),
            v_tenant.tenant_id,
            v_tenant.room_id,
            p_business_date,
            coalesce(nullif(p_source_type, ''), 'matured_advance_consumption'),
            v_outstanding_before,
            greatest(0, coalesce(v_tenant.room_balance, 0)),
            greatest(0, coalesce(v_period_outstanding_before, 0)),
            v_advance_before,
            jsonb_build_object(
                'tenant', to_jsonb(v_tenant),
                'dueRentMonthsBefore', v_period_snapshot,
                'advanceAllocationsBefore', v_allocation_snapshot,
                'advanceConsumed', v_tenant_consumed,
                'advanceRolledForward', v_tenant_rolled_forward
            ),
            p_actor_id
        );

        select coalesce(sum(greatest(0, coalesce(m.outstanding_amount, 0))), 0)
        into v_period_outstanding_after
        from public.tenant_rent_months m
        where m.company_id = p_company_id
          and m.tenant_id = v_tenant.tenant_id
          and coalesce(m.coverage_start, m.due_date, m.rent_month) <= p_business_date
          and lower(coalesce(m.status, 'unpaid')) not in ('cancelled','canceled','voided','deleted','reversed');

        select coalesce(sum(greatest(0, coalesce(a.amount_allocated, 0) - coalesce(a.consumed_by_balance_reconciliation, 0))), 0)
        into v_future_advance_after
        from public.tenant_rent_allocations a
        where a.company_id = p_company_id
          and a.tenant_id = v_tenant.tenant_id
          and a.allocation_type = 'advance_month'
          and coalesce(a.amount_allocated, 0) > coalesce(a.consumed_by_balance_reconciliation, 0)
          and public.ddumba_billing_date_for_month(extract(year from a.allocation_month)::int, extract(month from a.allocation_month)::int, v_billing_day) > p_business_date;

        v_outstanding_after := greatest(0, coalesce(v_period_outstanding_after, 0));

        update public.tenants
        set balance = v_outstanding_after,
            updated_at = now()
        where id = v_tenant.tenant_id
          and company_id = p_company_id;

        if v_tenant.room_id is not null then
            update public.rooms
            set outstanding_balance = v_outstanding_after,
                updated_at = now()
            where id = v_tenant.room_id
              and company_id = p_company_id;
        end if;

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
            created_by
        )
        values (
            p_company_id,
            coalesce(v_tenant.tenant_office_id, v_tenant.room_office_id),
            v_tenant.tenant_id,
            v_tenant.room_id,
            coalesce(nullif(p_source_type, ''), 'matured_advance_consumption'),
            null,
            v_outstanding_after,
            v_outstanding_before,
            v_advance_before,
            v_tenant_consumed,
            v_outstanding_after,
            v_future_advance_after,
            p_note || case when v_tenant_rolled_forward > 0 then ' Unused matured advance rolled forward to future billing periods.' else '' end,
            p_actor_id
        )
        returning id into v_reconciliation_id;

        if v_tenant_consumed > 0 and to_regclass('public.tenant_balance_ledger') is not null then
            insert into public.tenant_balance_ledger (
                company_id,
                office_id,
                tenant_id,
                room_id,
                source_type,
                source_id,
                entry_type,
                amount,
                balance_before,
                balance_after,
                description,
                created_by
            )
            values (
                p_company_id,
                coalesce(v_tenant.tenant_office_id, v_tenant.room_office_id),
                v_tenant.tenant_id,
                v_tenant.room_id,
                'matured_advance_consumption',
                v_reconciliation_id,
                'credit',
                v_tenant_consumed,
                v_outstanding_before,
                v_outstanding_after,
                p_note,
                p_actor_id
            );
        end if;

        v_tenants_repaired := v_tenants_repaired + 1;
    end loop;

    return jsonb_build_object(
        'businessDate', p_business_date,
        'tenantsScanned', v_tenants_scanned,
        'tenantsRepaired', v_tenants_repaired,
        'periodsRepaired', v_periods_repaired,
        'advanceConsumed', v_total_consumed,
        'advanceRolledForward', v_total_rolled_forward,
        'futureAllocationRowsCreated', v_allocations_rolled_forward
    );
end;
$$;

grant execute on function public.consume_matured_tenant_advance(uuid, uuid, uuid, date, uuid, text, text) to authenticated, service_role;
