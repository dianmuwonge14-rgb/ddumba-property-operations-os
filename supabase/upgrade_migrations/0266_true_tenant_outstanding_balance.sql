-- Critical tenant balance repair: unpaid rent must never be hidden as advance rent.
-- Advance rent is only genuine when the payment exceeds the full amount due.

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
        update public.tenant_rent_allocations
        set consumed_by_balance_reconciliation = amount_allocated
        where company_id = p_company_id
          and tenant_id = p_tenant_id
          and allocation_type = 'advance_month'
          and coalesce(amount_allocated, 0) > coalesce(consumed_by_balance_reconciliation, 0);

        v_consumed := v_advance_before;
        v_outstanding_after := v_requested_outstanding + v_advance_before;
        v_advance_after := 0;
    else
        v_outstanding_after := v_requested_outstanding;
        v_advance_after := v_advance_before;
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

    if v_consumed > 0 then
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

-- Audit-only view for Admin/Codex reconciliation. It intentionally does not
-- rewrite financial rows because payment removals and cash impact must be
-- explicitly approved before production data is changed.
create or replace view public.tenant_false_advance_audit as
select
    c.company_id,
    c.office_id,
    c.tenant_id,
    c.room_id,
    r.room_number,
    c.id as payment_id,
    c.status as payment_status,
    coalesce(c.financial_effective, true) as financial_effective,
    coalesce(c.amount_paid, c.amount, 0)::numeric as payment_amount,
    coalesce(c.balance_before_payment, c.expected_amount, 0)::numeric as due_before,
    greatest(0, coalesce(c.balance_before_payment, c.expected_amount, 0) - coalesce(c.amount_paid, c.amount, 0))::numeric as corrected_outstanding_after_payment,
    coalesce(sum(a.amount_allocated), 0)::numeric as false_advance_recorded,
    coalesce(sum(greatest(0, a.amount_allocated - coalesce(a.consumed_by_balance_reconciliation, 0))), 0)::numeric as active_false_advance,
    'payment_amount <= due_before'::text as reason
from public.collections c
join public.tenant_rent_allocations a
  on a.company_id = c.company_id
 and a.payment_id = c.id
 and a.allocation_type = 'advance_month'
left join public.rooms r
  on r.company_id = c.company_id
 and r.id = c.room_id
where coalesce(c.amount_paid, c.amount, 0) <= coalesce(c.balance_before_payment, c.expected_amount, 0)
group by c.company_id, c.office_id, c.tenant_id, c.room_id, r.room_number, c.id, c.status, c.financial_effective, c.amount_paid, c.amount, c.balance_before_payment, c.expected_amount;

comment on view public.tenant_false_advance_audit is 'Audit candidates such as B912 and C8019 where payment amount was not above due but advance allocations were recorded. Data repair requires explicit financial approval.';

grant select on public.tenant_false_advance_audit to authenticated, service_role;
