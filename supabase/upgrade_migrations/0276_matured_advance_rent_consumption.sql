-- Matured advance rent consumption.
-- Future rent advance is money already paid for a later billing period. Once
-- that period has arrived, the advance must be consumed into the rent-month
-- ledger instead of sitting beside a collectible outstanding balance.

create index if not exists idx_tenant_rent_allocations_matured_advance
    on public.tenant_rent_allocations(company_id, tenant_id, room_id, coverage_start, allocation_month)
    where allocation_type = 'advance_month'
      and coalesce(amount_allocated, 0) > coalesce(consumed_by_balance_reconciliation, 0);

create index if not exists idx_tenant_rent_months_matured_outstanding
    on public.tenant_rent_months(company_id, tenant_id, room_id, coverage_start, due_date)
    where coalesce(outstanding_amount, 0) > 0;

create table if not exists public.tenant_matured_advance_repair_snapshots (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    room_id uuid references public.rooms(id) on delete set null,
    business_date date not null,
    source_type text not null default 'matured_advance_consumption',
    tenant_balance_before numeric(14,2) not null default 0,
    room_balance_before numeric(14,2) not null default 0,
    due_period_outstanding_before numeric(14,2) not null default 0,
    advance_available_before numeric(14,2) not null default 0,
    snapshot jsonb not null default '{}'::jsonb,
    created_by uuid,
    created_at timestamptz not null default now()
);

create index if not exists idx_tenant_matured_advance_snapshots_tenant
    on public.tenant_matured_advance_repair_snapshots(company_id, tenant_id, created_at desc);

alter table public.tenant_matured_advance_repair_snapshots enable row level security;

drop policy if exists tenant_matured_advance_repair_snapshots_read on public.tenant_matured_advance_repair_snapshots;
create policy tenant_matured_advance_repair_snapshots_read
on public.tenant_matured_advance_repair_snapshots
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

drop policy if exists tenant_matured_advance_repair_snapshots_insert on public.tenant_matured_advance_repair_snapshots;
create policy tenant_matured_advance_repair_snapshots_insert
on public.tenant_matured_advance_repair_snapshots
for insert
with check (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and public.ddumba_v1_is_company_admin()
    )
);

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
    v_total_consumed numeric(14,2) := 0;
    v_tenants_scanned int := 0;
    v_tenants_repaired int := 0;
    v_periods_repaired int := 0;
    v_outstanding_before numeric(14,2);
    v_outstanding_after numeric(14,2);
    v_period_outstanding_after numeric(14,2);
    v_advance_before numeric(14,2);
    v_future_advance_after numeric(14,2);
    v_reconciliation_id uuid;
    v_period_snapshot jsonb;
    v_allocation_snapshot jsonb;
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
            coalesce(t.balance, 0)::numeric as tenant_balance,
            r.id as room_id,
            r.office_id as room_office_id,
            coalesce(r.outstanding_balance, 0)::numeric as room_balance
        from public.tenants t
        left join public.rooms r
          on r.company_id = t.company_id
         and r.id = t.room_id
        where t.company_id = p_company_id
          and lower(coalesce(t.status, 'active')) = 'active'
          and (p_tenant_id is null or t.id = p_tenant_id)
          and (p_room_id is null or t.room_id = p_room_id or r.id = p_room_id)
        order by r.room_number nulls last, t.full_name
        for update of t
    loop
        v_tenants_scanned := v_tenants_scanned + 1;
        v_tenant_consumed := 0;
        v_outstanding_before := greatest(0, coalesce(v_tenant.tenant_balance, v_tenant.room_balance, 0));

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
        into v_period_outstanding_after
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

        select coalesce(jsonb_agg(to_jsonb(a) order by coalesce(a.coverage_start, a.allocation_month), a.created_at, a.id), '[]'::jsonb)
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
                  and coalesce(a.coverage_start, a.allocation_month) <= p_business_date
                order by coalesce(a.coverage_start, a.allocation_month), a.created_at, a.id
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

        if v_tenant_consumed <= 0 then
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
            greatest(0, coalesce(v_period_outstanding_after, 0)),
            v_advance_before,
            jsonb_build_object(
                'tenant', to_jsonb(v_tenant),
                'dueRentMonthsBefore', v_period_snapshot,
                'advanceAllocationsBefore', v_allocation_snapshot
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
          and coalesce(a.coverage_start, a.allocation_month) > p_business_date;

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
            p_note,
            p_actor_id
        )
        returning id into v_reconciliation_id;

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
        'advanceConsumed', v_total_consumed
    );
end;
$$;

grant execute on function public.consume_matured_tenant_advance(uuid, uuid, uuid, date, uuid, text, text) to authenticated, service_role;

create or replace function public.repair_company_matured_tenant_advances(
    p_company_id uuid,
    p_office_id uuid default null,
    p_business_date date default ((now() at time zone 'Africa/Kampala')::date),
    p_actor_id uuid default null,
    p_note text default 'Company-wide matured advance rent repair.'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_room record;
    v_result jsonb;
    v_scanned int := 0;
    v_repaired int := 0;
    v_periods int := 0;
    v_consumed numeric(14,2) := 0;
begin
    if p_company_id is null then
        raise exception 'company_id is required';
    end if;

    for v_room in
        select distinct t.id as tenant_id, t.room_id
        from public.tenants t
        left join public.rooms r
          on r.company_id = t.company_id
         and r.id = t.room_id
        where t.company_id = p_company_id
          and lower(coalesce(t.status, 'active')) = 'active'
          and t.room_id is not null
          and (p_office_id is null or coalesce(t.office_id, r.office_id) = p_office_id)
        order by t.id
    loop
        v_result := public.consume_matured_tenant_advance(
            p_company_id,
            v_room.tenant_id,
            v_room.room_id,
            p_business_date,
            p_actor_id,
            'matured_advance_company_repair',
            p_note
        );
        v_scanned := v_scanned + coalesce((v_result->>'tenantsScanned')::int, 0);
        v_repaired := v_repaired + coalesce((v_result->>'tenantsRepaired')::int, 0);
        v_periods := v_periods + coalesce((v_result->>'periodsRepaired')::int, 0);
        v_consumed := v_consumed + coalesce((v_result->>'advanceConsumed')::numeric, 0);
    end loop;

    return jsonb_build_object(
        'businessDate', p_business_date,
        'tenantsScanned', v_scanned,
        'tenantsRepaired', v_repaired,
        'periodsRepaired', v_periods,
        'advanceConsumed', v_consumed
    );
end;
$$;

grant execute on function public.repair_company_matured_tenant_advances(uuid, uuid, date, uuid, text) to authenticated, service_role;

create or replace view public.tenant_matured_advance_mismatches as
with available_advance as (
    select
        a.company_id,
        a.office_id,
        a.tenant_id,
        a.room_id,
        coalesce(sum(greatest(0, coalesce(a.amount_allocated, 0) - coalesce(a.consumed_by_balance_reconciliation, 0))) filter (
            where coalesce(a.coverage_start, a.allocation_month) <= ((now() at time zone 'Africa/Kampala')::date)
        ), 0) as matured_advance,
        coalesce(sum(greatest(0, coalesce(a.amount_allocated, 0) - coalesce(a.consumed_by_balance_reconciliation, 0))) filter (
            where coalesce(a.coverage_start, a.allocation_month) > ((now() at time zone 'Africa/Kampala')::date)
        ), 0) as future_advance
    from public.tenant_rent_allocations a
    where a.allocation_type = 'advance_month'
      and coalesce(a.amount_allocated, 0) > coalesce(a.consumed_by_balance_reconciliation, 0)
    group by a.company_id, a.office_id, a.tenant_id, a.room_id
),
periods as (
    select
        m.company_id,
        m.tenant_id,
        m.room_id,
        coalesce(sum(greatest(0, coalesce(m.outstanding_amount, 0))) filter (
            where coalesce(m.coverage_start, m.due_date, m.rent_month) <= ((now() at time zone 'Africa/Kampala')::date)
        ), 0) as due_period_outstanding
    from public.tenant_rent_months m
    where lower(coalesce(m.status, 'unpaid')) not in ('cancelled','canceled','voided','deleted','reversed')
    group by m.company_id, m.tenant_id, m.room_id
)
select
    t.company_id,
    coalesce(t.office_id, r.office_id, aa.office_id) as office_id,
    t.id as tenant_id,
    t.full_name as tenant_name,
    t.room_id,
    r.room_number,
    coalesce(t.balance, 0)::numeric as tenant_balance,
    coalesce(r.outstanding_balance, 0)::numeric as room_outstanding_balance,
    coalesce(p.due_period_outstanding, 0)::numeric as due_period_outstanding,
    coalesce(aa.matured_advance, 0)::numeric as matured_advance,
    coalesce(aa.future_advance, 0)::numeric as future_advance,
    greatest(0, coalesce(p.due_period_outstanding, 0) - coalesce(aa.matured_advance, 0))::numeric as expected_due_after_consumption
from public.tenants t
left join public.rooms r
  on r.company_id = t.company_id
 and r.id = t.room_id
left join available_advance aa
  on aa.company_id = t.company_id
 and aa.tenant_id = t.id
left join periods p
  on p.company_id = t.company_id
 and p.tenant_id = t.id
where lower(coalesce(t.status, 'active')) = 'active'
  and (
    coalesce(aa.matured_advance, 0) > 0
    or abs(coalesce(t.balance, 0) - coalesce(p.due_period_outstanding, 0)) > 0.004
    or abs(coalesce(r.outstanding_balance, 0) - coalesce(p.due_period_outstanding, 0)) > 0.004
  );

grant select on public.tenant_matured_advance_mismatches to authenticated, service_role;

do $$
begin
    if exists (select 1 from pg_namespace where nspname = 'cron') then
        begin
            perform cron.unschedule('ddumba_tenant_billing_hourly');
        exception when others then
            null;
        end;

        perform cron.schedule(
            'ddumba_tenant_billing_hourly',
            '0 * * * *',
            $job$
            do $billing$
            declare
                company_row record;
                v_business_date date := ((now() at time zone 'Africa/Kampala')::date);
            begin
                for company_row in
                    select id
                    from public.companies
                    order by created_at nulls last
                loop
                    perform public.run_monthly_rent_rollover(
                        company_row.id,
                        null,
                        v_business_date,
                        null,
                        'scheduled_hourly_pg_cron'
                    );

                    perform public.repair_company_matured_tenant_advances(
                        company_row.id,
                        null,
                        v_business_date,
                        null,
                        'Scheduled billing consumed matured advance rent after monthly rollover.'
                    );
                end loop;
            end
            $billing$;
            $job$
        );
    end if;
exception when others then
    raise notice 'Could not refresh ddumba_tenant_billing_hourly matured-advance job: %', sqlerrm;
end $$;
