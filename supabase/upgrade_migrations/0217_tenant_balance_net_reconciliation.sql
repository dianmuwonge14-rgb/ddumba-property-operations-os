-- Tenant outstanding and advance rent must be a single net position.
-- Additive migration: preserves original payment allocation rows and records how
-- much future advance has been consumed by later charges or balance edits.

alter table public.tenant_rent_allocations
    add column if not exists consumed_by_balance_reconciliation numeric(14,2) not null default 0;

do $$
begin
    alter table public.tenant_rent_allocations
        add constraint tenant_rent_allocations_consumed_nonnegative
        check (consumed_by_balance_reconciliation >= 0 and consumed_by_balance_reconciliation <= amount_allocated);
exception
    when duplicate_object then null;
end $$;

create table if not exists public.tenant_balance_reconciliations (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    room_id uuid references public.rooms(id) on delete set null,
    source_type text not null,
    source_id uuid,
    requested_outstanding numeric(14,2) not null default 0,
    outstanding_before numeric(14,2) not null default 0,
    advance_before numeric(14,2) not null default 0,
    advance_consumed numeric(14,2) not null default 0,
    outstanding_after numeric(14,2) not null default 0,
    advance_after numeric(14,2) not null default 0,
    note text,
    created_by uuid,
    created_at timestamptz not null default now()
);

create index if not exists idx_tenant_balance_reconciliations_tenant
    on public.tenant_balance_reconciliations(company_id, tenant_id, created_at desc);

create index if not exists idx_tenant_rent_allocations_available_advance
    on public.tenant_rent_allocations(company_id, tenant_id, allocation_month, allocation_type)
    where allocation_type = 'advance_month' and amount_allocated > consumed_by_balance_reconciliation;

alter table public.tenant_balance_reconciliations enable row level security;

drop policy if exists tenant_balance_reconciliations_read on public.tenant_balance_reconciliations;
create policy tenant_balance_reconciliations_read
on public.tenant_balance_reconciliations
for select
using (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and (
            public.ddumba_v1_is_company_admin()
            or public.ddumba_v1_can_access_office(office_id)
        )
    )
);

drop policy if exists tenant_balance_reconciliations_service_insert on public.tenant_balance_reconciliations;
create policy tenant_balance_reconciliations_service_insert
on public.tenant_balance_reconciliations
for insert
with check (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and (
            public.ddumba_v1_is_company_admin()
            or public.ddumba_v1_can_access_office(office_id)
        )
    )
);

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
    v_remaining_to_consume numeric(14,2);
    v_consumed numeric(14,2) := 0;
    v_available numeric(14,2);
    v_slice numeric(14,2);
    v_outstanding_after numeric(14,2);
    v_advance_after numeric(14,2);
    v_reconciliation_id uuid;
    v_allocation record;
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

    select coalesce(sum(greatest(0, amount_allocated - consumed_by_balance_reconciliation)), 0)
    into v_advance_before
    from public.tenant_rent_allocations
    where company_id = p_company_id
      and tenant_id = p_tenant_id
      and allocation_type = 'advance_month';

    v_remaining_to_consume := least(v_requested_outstanding, v_advance_before);

    for v_allocation in
        select id, amount_allocated, consumed_by_balance_reconciliation
        from public.tenant_rent_allocations
        where company_id = p_company_id
          and tenant_id = p_tenant_id
          and allocation_type = 'advance_month'
          and amount_allocated > consumed_by_balance_reconciliation
        order by allocation_month asc, created_at asc, id asc
        for update
    loop
        exit when v_remaining_to_consume <= 0;
        v_available := greatest(0, v_allocation.amount_allocated - v_allocation.consumed_by_balance_reconciliation);
        v_slice := least(v_available, v_remaining_to_consume);
        update public.tenant_rent_allocations
        set consumed_by_balance_reconciliation = consumed_by_balance_reconciliation + v_slice
        where id = v_allocation.id;
        v_consumed := v_consumed + v_slice;
        v_remaining_to_consume := v_remaining_to_consume - v_slice;
    end loop;

    v_outstanding_after := greatest(0, v_requested_outstanding - v_consumed);
    v_advance_after := greatest(0, v_advance_before - v_consumed);

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
                'credit',
                v_consumed,
                v_outstanding_after,
                coalesce(p_note, 'Advance rent consumed to keep tenant net balance consistent.')
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
                'credit',
                v_consumed,
                v_requested_outstanding,
                v_outstanding_after,
                coalesce(p_note, 'Advance rent consumed to keep tenant net balance consistent.'),
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
