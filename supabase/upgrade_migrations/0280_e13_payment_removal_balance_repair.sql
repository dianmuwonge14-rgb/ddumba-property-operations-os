-- Targeted E13 repair for the payment-removal reversal bug.
-- This does not rewrite payments or allocations. It restores the active
-- tenant/room balance from the canonical rent-month ledger after removed
-- zero-impact payments were incorrectly added back to outstanding.

begin;

do $$
declare
    v_room record;
    v_tenant record;
    v_expected_outstanding numeric(14,2);
    v_future_advance numeric(14,2);
    v_before jsonb;
    v_after jsonb;
begin
    select r.*
    into v_room
    from public.rooms r
    where upper(trim(r.room_number)) = 'E13'
      and lower(coalesce(r.status, '')) not in ('archived', 'deleted', 'removed')
    order by r.updated_at desc nulls last, r.created_at desc nulls last
    limit 1
    for update;

    if not found then
        raise exception 'E13 repair aborted: active room E13 was not found.';
    end if;

    select t.*
    into v_tenant
    from public.tenants t
    where t.room_id = v_room.id
      and t.company_id = v_room.company_id
      and lower(coalesce(t.status, 'active')) = 'active'
    order by t.updated_at desc nulls last, t.created_at desc nulls last
    limit 1
    for update;

    if not found then
        raise exception 'E13 repair aborted: active tenant for room E13 was not found.';
    end if;

    if lower(coalesce(v_tenant.full_name, '')) not like '%bogere%' then
        raise exception 'E13 repair aborted: active tenant is %, expected bogere.', coalesce(v_tenant.full_name, 'unknown');
    end if;

    select coalesce(sum(greatest(0, coalesce(outstanding_amount, 0))), 0)
    into v_expected_outstanding
    from public.tenant_rent_months
    where company_id = v_room.company_id
      and room_id = v_room.id
      and tenant_id = v_tenant.id;

    select coalesce(sum(greatest(0, coalesce(amount_allocated, 0) - coalesce(consumed_by_balance_reconciliation, 0))), 0)
    into v_future_advance
    from public.tenant_rent_allocations
    where company_id = v_room.company_id
      and room_id = v_room.id
      and tenant_id = v_tenant.id
      and allocation_type = 'advance_month';

    select jsonb_build_object(
        'room', to_jsonb(v_room),
        'tenant', to_jsonb(v_tenant),
        'rent_months', (
            select jsonb_agg(to_jsonb(m) order by m.rent_month)
            from public.tenant_rent_months m
            where m.company_id = v_room.company_id
              and m.room_id = v_room.id
              and m.tenant_id = v_tenant.id
        ),
        'removed_payments', (
            select jsonb_agg(to_jsonb(c) order by c.payment_date, c.created_at)
            from public.collections c
            where c.company_id = v_room.company_id
              and c.room_id = v_room.id
              and c.tenant_id = v_tenant.id
              and lower(coalesce(c.status, '')) = 'removed_by_admin_approval'
        ),
        'expected_outstanding_from_rent_months', v_expected_outstanding,
        'future_advance_from_allocations', v_future_advance
    )
    into v_before;

    update public.tenants
    set balance = v_expected_outstanding,
        updated_at = now()
    where id = v_tenant.id
      and company_id = v_room.company_id;

    update public.rooms
    set outstanding_balance = v_expected_outstanding,
        updated_at = now()
    where id = v_room.id
      and company_id = v_room.company_id;

    select jsonb_build_object(
        'room_balance', (select outstanding_balance from public.rooms where id = v_room.id),
        'tenant_balance', (select balance from public.tenants where id = v_tenant.id),
        'expected_outstanding_from_rent_months', v_expected_outstanding,
        'future_advance_from_allocations', v_future_advance
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
        v_room.company_id,
        v_room.office_id,
        v_tenant.id,
        v_room.id,
        'e13_payment_removal_balance_repair_0280',
        null,
        v_expected_outstanding,
        greatest(0, coalesce(v_tenant.balance, v_room.outstanding_balance, 0)),
        v_future_advance,
        0,
        v_expected_outstanding,
        v_future_advance,
        'E13 balance restored from canonical rent-month ledger after zero-impact removed payments were previously added back to outstanding.',
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
        v_room.company_id,
        v_room.office_id,
        'tenant_balance',
        v_tenant.id,
        'e13_payment_removal_balance_repair_0280',
        v_before,
        v_after,
        now()
    );
end $$;

commit;
