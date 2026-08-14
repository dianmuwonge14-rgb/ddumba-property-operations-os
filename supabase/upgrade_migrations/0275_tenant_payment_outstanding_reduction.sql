-- Critical tenant payment balance fix.
-- Tenant payments must reduce existing outstanding. Genuine advance offsets
-- future due amounts; it must never be added back onto outstanding.

create or replace function public.reconcile_tenant_balance(
    p_company_id uuid,
    p_tenant_id uuid,
    p_room_id uuid default null,
    p_requested_outstanding numeric default null,
    p_source_type text default 'tenant_balance_reconciliation',
    p_source_id uuid default null,
    p_actor_id uuid default null,
    p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_tenant record;
    v_room record;
    v_requested_outstanding numeric(14,2);
    v_outstanding_before numeric(14,2);
    v_advance_before numeric(14,2);
    v_consumed numeric(14,2) := 0;
    v_outstanding_after numeric(14,2);
    v_advance_after numeric(14,2);
    v_reconciliation_id uuid;
    v_resolved_office_id uuid;
    v_resolved_room_id uuid;
begin
    select *
    into v_tenant
    from public.tenants
    where id = p_tenant_id
      and company_id = p_company_id
    for update;

    if not found then
        raise exception 'Tenant not found for balance reconciliation.';
    end if;

    v_resolved_room_id := coalesce(p_room_id, v_tenant.room_id);
    v_resolved_office_id := v_tenant.office_id;

    if v_resolved_room_id is not null then
        select *
        into v_room
        from public.rooms
        where id = v_resolved_room_id
          and company_id = p_company_id
        for update;
        if found then
            v_resolved_office_id := coalesce(v_resolved_office_id, v_room.office_id);
        end if;
    end if;

    v_requested_outstanding := greatest(0, coalesce(p_requested_outstanding, v_tenant.balance, 0));
    v_outstanding_before := greatest(0, coalesce(v_tenant.balance, 0));

    select coalesce(sum(greatest(0, coalesce(amount_allocated, 0) - coalesce(consumed_by_balance_reconciliation, 0))), 0)
    into v_advance_before
    from public.tenant_rent_allocations
    where company_id = p_company_id
      and tenant_id = p_tenant_id
      and allocation_type = 'advance_month';

    if v_requested_outstanding > 0 and v_advance_before > 0 then
        v_consumed := v_advance_before;
    else
        v_consumed := 0;
    end if;

    if v_consumed > 0 then
        with advance_rows as (
            select id,
                   amount_allocated,
                   coalesce(consumed_by_balance_reconciliation, 0) as already_consumed,
                   greatest(0, coalesce(amount_allocated, 0) - coalesce(consumed_by_balance_reconciliation, 0)) as available,
                   sum(greatest(0, coalesce(amount_allocated, 0) - coalesce(consumed_by_balance_reconciliation, 0))) over (order by allocation_month, id) as running_available
            from public.tenant_rent_allocations
            where company_id = p_company_id
              and tenant_id = p_tenant_id
              and allocation_type = 'advance_month'
              and coalesce(amount_allocated, 0) > coalesce(consumed_by_balance_reconciliation, 0)
        ),
        consumed as (
            select id,
                   least(available, greatest(0, v_consumed - (running_available - available))) as consume_amount
            from advance_rows
        )
        update public.tenant_rent_allocations a
        set consumed_by_balance_reconciliation = coalesce(a.consumed_by_balance_reconciliation, 0) + c.consume_amount
        from consumed c
        where a.id = c.id
          and c.consume_amount > 0;
    end if;

    if v_requested_outstanding > 0
       and v_advance_before > 0
       and lower(coalesce(p_source_type, '')) not in (
            'collection_payment',
            'payment_correction_approved',
            'tenant_payment_snapshot_repair'
       ) then
        v_outstanding_after := v_requested_outstanding + v_advance_before;
        v_advance_after := 0;
    else
        v_outstanding_after := v_requested_outstanding;
        v_advance_after := greatest(0, v_advance_before - v_consumed);
    end if;

    update public.tenants
    set balance = v_outstanding_after,
        updated_at = now()
    where id = p_tenant_id
      and company_id = p_company_id;

    if v_resolved_room_id is not null then
        update public.rooms
        set outstanding_balance = v_outstanding_after,
            updated_at = now()
        where id = v_resolved_room_id
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
        v_resolved_office_id,
        p_tenant_id,
        v_resolved_room_id,
        coalesce(nullif(p_source_type, ''), 'tenant_balance_reconciliation'),
        p_source_id,
        v_requested_outstanding,
        v_outstanding_before,
        v_advance_before,
        v_consumed,
        v_outstanding_after,
        v_advance_after,
        p_note,
        p_actor_id
    )
    returning id into v_reconciliation_id;

    if v_consumed > 0 and v_outstanding_after > v_requested_outstanding then
        if to_regclass('public.tenant_ledger_entries') is not null and v_resolved_office_id is not null then
            insert into public.tenant_ledger_entries (
                company_id,
                office_id,
                tenant_id,
                lease_id,
                source_type,
                source_id,
                entry_type,
                amount,
                balance_after,
                description
            )
            values (
                p_company_id,
                v_resolved_office_id,
                p_tenant_id,
                null,
                coalesce(nullif(p_source_type, ''), 'tenant_balance_reconciliation'),
                v_reconciliation_id,
                'debit',
                v_consumed,
                v_outstanding_after,
                coalesce(p_note, 'False advance rent reclassified back into tenant outstanding balance.')
            );
        end if;

        if to_regclass('public.tenant_balance_ledger') is not null then
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
                v_resolved_office_id,
                p_tenant_id,
                v_resolved_room_id,
                coalesce(nullif(p_source_type, ''), 'tenant_balance_reconciliation'),
                v_reconciliation_id,
                'debit',
                v_consumed,
                v_requested_outstanding,
                v_outstanding_after,
                coalesce(p_note, 'False advance rent reclassified back into tenant outstanding balance.'),
                p_actor_id
            );
        end if;
    end if;

    return jsonb_build_object(
        'id', v_reconciliation_id,
        'requestedOutstanding', v_requested_outstanding,
        'outstandingBefore', v_outstanding_before,
        'advanceBefore', v_advance_before,
        'advanceConsumed', v_consumed,
        'outstandingAfter', v_outstanding_after,
        'advanceAfter', v_advance_after
    );
end;
$$;

grant execute on function public.reconcile_tenant_balance(uuid, uuid, uuid, numeric, text, uuid, uuid, text) to authenticated, service_role;

create or replace view public.tenant_payment_balance_snapshot_mismatches as
with latest_effective_payment as (
    select distinct on (c.company_id, c.tenant_id)
        c.company_id,
        c.office_id,
        c.tenant_id,
        c.room_id,
        c.id as payment_id,
        c.payment_date,
        c.created_at,
        coalesce(c.amount_paid, c.amount, 0)::numeric as payment_amount,
        coalesce(c.balance_before_payment, c.expected_amount, 0)::numeric as balance_before_payment,
        coalesce(c.balance_after_payment, c.balance, greatest(0, coalesce(c.balance_before_payment, c.expected_amount, 0) - coalesce(c.amount_paid, c.amount, 0)))::numeric as payment_balance_after
    from public.collections c
    where coalesce(c.financial_effective, true) = true
      and lower(coalesce(c.status, 'paid')) not in ('cancelled','canceled','reversed','voided','deleted','removed','removed_by_admin_approval','rejected','superseded')
      and c.tenant_id is not null
    order by c.company_id, c.tenant_id, c.payment_date desc nulls last, c.created_at desc nulls last, c.id desc
),
rent_month_totals as (
    select
        company_id,
        tenant_id,
        coalesce(sum(greatest(0, coalesce(outstanding_amount, 0))), 0)::numeric as rent_month_outstanding
    from public.tenant_rent_months
    where lower(coalesce(status, 'active')) not in ('cancelled','canceled','voided','deleted','reversed')
    group by company_id, tenant_id
)
select
    t.company_id,
    t.office_id,
    t.id as tenant_id,
    t.full_name as tenant_name,
    t.room_id,
    r.room_number,
    coalesce(t.balance, 0)::numeric as tenant_balance,
    coalesce(r.outstanding_balance, 0)::numeric as room_outstanding_balance,
    lep.payment_id,
    lep.payment_amount,
    lep.balance_before_payment,
    lep.payment_balance_after,
    rmt.rent_month_outstanding,
    coalesce(rmt.rent_month_outstanding, lep.payment_balance_after, t.balance, r.outstanding_balance, 0)::numeric as authoritative_outstanding,
    (coalesce(t.balance, 0) - coalesce(rmt.rent_month_outstanding, lep.payment_balance_after, t.balance, r.outstanding_balance, 0))::numeric as tenant_difference,
    (coalesce(r.outstanding_balance, 0) - coalesce(rmt.rent_month_outstanding, lep.payment_balance_after, t.balance, r.outstanding_balance, 0))::numeric as room_difference
from public.tenants t
left join public.rooms r
  on r.company_id = t.company_id
 and r.id = t.room_id
left join latest_effective_payment lep
  on lep.company_id = t.company_id
 and lep.tenant_id = t.id
left join rent_month_totals rmt
  on rmt.company_id = t.company_id
 and rmt.tenant_id = t.id
where lower(coalesce(t.status, 'active')) = 'active'
  and (
      abs(coalesce(t.balance, 0) - coalesce(rmt.rent_month_outstanding, lep.payment_balance_after, t.balance, r.outstanding_balance, 0)) > 0.004
      or abs(coalesce(r.outstanding_balance, 0) - coalesce(rmt.rent_month_outstanding, lep.payment_balance_after, t.balance, r.outstanding_balance, 0)) > 0.004
  );

grant select on public.tenant_payment_balance_snapshot_mismatches to authenticated, service_role;

create or replace function public.repair_tenant_payment_balance_snapshots(
    p_company_id uuid default null,
    p_room_number text default null,
    p_actor_id uuid default null,
    p_reason text default 'Tenant payment balance snapshot repaired from authoritative payment/month ledger.'
)
returns table (
    tenant_id uuid,
    room_id uuid,
    room_number text,
    previous_tenant_balance numeric,
    previous_room_balance numeric,
    corrected_outstanding numeric,
    payment_id uuid
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_row record;
begin
    for v_row in
        select *
        from public.tenant_payment_balance_snapshot_mismatches m
        where (p_company_id is null or m.company_id = p_company_id)
          and (p_room_number is null or lower(m.room_number) = lower(p_room_number))
        order by m.room_number nulls last, m.tenant_name
    loop
        update public.tenants
        set balance = greatest(0, v_row.authoritative_outstanding),
            updated_at = now()
        where company_id = v_row.company_id
          and id = v_row.tenant_id;

        if v_row.room_id is not null then
            update public.rooms
            set outstanding_balance = greatest(0, v_row.authoritative_outstanding),
                updated_at = now()
            where company_id = v_row.company_id
              and id = v_row.room_id;
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
            v_row.company_id,
            v_row.office_id,
            v_row.tenant_id,
            v_row.room_id,
            'tenant_payment_snapshot_repair',
            v_row.payment_id,
            greatest(0, v_row.authoritative_outstanding),
            greatest(0, coalesce(v_row.tenant_balance, v_row.room_outstanding_balance, 0)),
            0,
            0,
            greatest(0, v_row.authoritative_outstanding),
            0,
            p_reason,
            p_actor_id
        );

        if to_regclass('public.tenant_balance_ledger') is not null then
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
                v_row.company_id,
                v_row.office_id,
                v_row.tenant_id,
                v_row.room_id,
                'tenant_payment_snapshot_repair',
                v_row.payment_id,
                case when greatest(0, v_row.authoritative_outstanding) > greatest(0, coalesce(v_row.tenant_balance, v_row.room_outstanding_balance, 0)) then 'debit' else 'credit' end,
                abs(greatest(0, v_row.authoritative_outstanding) - greatest(0, coalesce(v_row.tenant_balance, v_row.room_outstanding_balance, 0))),
                greatest(0, coalesce(v_row.tenant_balance, v_row.room_outstanding_balance, 0)),
                greatest(0, v_row.authoritative_outstanding),
                p_reason,
                p_actor_id
            );
        end if;

        tenant_id := v_row.tenant_id;
        room_id := v_row.room_id;
        room_number := v_row.room_number;
        previous_tenant_balance := v_row.tenant_balance;
        previous_room_balance := v_row.room_outstanding_balance;
        corrected_outstanding := greatest(0, v_row.authoritative_outstanding);
        payment_id := v_row.payment_id;
        return next;
    end loop;
end;
$$;

grant execute on function public.repair_tenant_payment_balance_snapshots(uuid, text, uuid, text) to authenticated, service_role;
