-- Tenant anniversary rent-cycle engine.
-- New tenancies are charged from the exact move-in date, then monthly on that anniversary.

alter table public.leases drop constraint if exists leases_billing_day_check;
alter table public.leases add constraint leases_billing_day_check check (billing_day between 1 and 31);

alter table public.tenant_rent_months
    add column if not exists coverage_start date,
    add column if not exists coverage_end date,
    add column if not exists coverage_index integer not null default 0;

create unique index if not exists uniq_tenant_rent_months_coverage_period
    on public.tenant_rent_months(company_id, tenant_id, coverage_start, coverage_end)
    where coverage_start is not null and coverage_end is not null;

create index if not exists idx_tenant_rent_months_due_date
    on public.tenant_rent_months(company_id, due_date, status);

create or replace function public.ddumba_add_anchor_months(
    p_anchor_date date,
    p_months integer
)
returns date
language sql
immutable
as $$
    with target as (
        select (date_trunc('month', p_anchor_date)::date + (p_months || ' months')::interval)::date as month_start,
               extract(day from p_anchor_date)::int as anchor_day
    )
    select make_date(
        extract(year from month_start)::int,
        extract(month from month_start)::int,
        least(anchor_day, extract(day from (date_trunc('month', month_start) + interval '1 month - 1 day'))::int)
    )
    from target;
$$;

create or replace function public.run_monthly_rent_rollover(
    p_company_id uuid,
    p_office_id uuid default null,
    p_business_date date default ((now() at time zone 'Africa/Kampala')::date),
    p_triggered_by uuid default null,
    p_run_type text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_rent_month date := public.ddumba_month_start(p_business_date);
    v_run_id uuid;
    v_scanned int := 0;
    v_charged int := 0;
    v_skipped int := 0;
    v_total numeric := 0;
    v_failed jsonb := '[]'::jsonb;
    candidate record;
    v_anchor_day int;
    v_month_delta int;
    v_coverage_index int;
    v_coverage_start date;
    v_next_coverage_start date;
    v_coverage_end date;
    v_balance_before numeric;
    v_balance_after numeric;
    v_prepaid numeric;
    v_outstanding_charge numeric;
    v_month_row_id uuid;
    v_rent_amount numeric;
begin
    if p_company_id is null then
        raise exception 'company_id is required';
    end if;

    insert into public.monthly_rollover_runs (
        company_id,
        office_id,
        rent_month,
        business_date,
        run_type,
        triggered_by,
        status
    )
    values (
        p_company_id,
        p_office_id,
        v_rent_month,
        p_business_date,
        coalesce(nullif(p_run_type, ''), 'manual'),
        p_triggered_by,
        'running'
    )
    returning id into v_run_id;

    for candidate in
        with active_leases as (
            select distinct on (l.room_id) l.*
            from public.leases l
            where l.company_id = p_company_id
              and l.status = 'active'
            order by l.room_id, l.start_date desc nulls last, l.created_at desc nulls last
        ),
        active_tenants as (
            select distinct on (t.room_id) t.*
            from public.tenants t
            where t.company_id = p_company_id
              and t.status = 'active'
              and t.room_id is not null
            order by t.room_id, t.updated_at desc nulls last, t.created_at desc nulls last
        )
        select
            t.id as tenant_id,
            t.full_name as tenant_name,
            t.balance as tenant_balance,
            r.id as room_id,
            r.office_id,
            r.landlord_id,
            r.property_id,
            r.monthly_rent as room_rent,
            r.outstanding_balance as room_balance,
            l.id as lease_id,
            l.monthly_rent as lease_rent,
            l.billing_day,
            l.start_date,
            t.monthly_rent as tenant_rent
        from public.rooms r
        join active_tenants t on t.room_id = r.id
        left join active_leases l on l.room_id = r.id and l.tenant_id = t.id
        where r.company_id = p_company_id
          and (p_office_id is null or r.office_id = p_office_id)
          and lower(coalesce(r.status, 'occupied')) in ('occupied','active')
          and coalesce(l.start_date, t.created_at::date, r.created_at::date) <= p_business_date
    loop
        v_scanned := v_scanned + 1;
        begin
            v_anchor_day := greatest(1, least(31, coalesce(candidate.billing_day, extract(day from candidate.start_date)::int, 1)));
            v_month_delta := ((extract(year from p_business_date)::int - extract(year from candidate.start_date)::int) * 12)
                + (extract(month from p_business_date)::int - extract(month from candidate.start_date)::int);
            v_coverage_index := greatest(0, v_month_delta);
            v_coverage_start := public.ddumba_add_anchor_months(candidate.start_date, v_coverage_index);
            if v_coverage_start > p_business_date and v_coverage_index > 0 then
                v_coverage_index := v_coverage_index - 1;
                v_coverage_start := public.ddumba_add_anchor_months(candidate.start_date, v_coverage_index);
            end if;
            if v_coverage_start > p_business_date then
                v_skipped := v_skipped + 1;
                continue;
            end if;

            v_next_coverage_start := public.ddumba_add_anchor_months(candidate.start_date, v_coverage_index + 1);
            v_coverage_end := v_next_coverage_start - 1;

            if exists (
                select 1 from public.tenant_rent_months trm
                where trm.company_id = p_company_id
                  and trm.tenant_id = candidate.tenant_id
                  and (
                    trm.coverage_start = v_coverage_start
                    or (trm.coverage_start is null and trm.rent_month = public.ddumba_month_start(v_coverage_start))
                  )
            ) then
                v_skipped := v_skipped + 1;
                continue;
            end if;

            v_rent_amount := coalesce(candidate.lease_rent, candidate.tenant_rent, candidate.room_rent, 0);
            v_prepaid := coalesce((
                select sum(a.amount_allocated)
                from public.tenant_rent_allocations a
                where a.company_id = p_company_id
                  and a.tenant_id = candidate.tenant_id
                  and a.room_id = candidate.room_id
                  and a.allocation_type = 'advance_month'
                  and (
                    a.coverage_start = v_coverage_start
                    or (a.coverage_start is null and date_trunc('month', a.allocation_month)::date = public.ddumba_month_start(v_coverage_start))
                  )
            ), 0);

            v_outstanding_charge := greatest(0, v_rent_amount - v_prepaid);
            v_balance_before := greatest(0, coalesce(candidate.tenant_balance, candidate.room_balance, 0));
            v_balance_after := v_balance_before + v_outstanding_charge;

            insert into public.tenant_rent_months (
                company_id,
                office_id,
                landlord_id,
                room_id,
                tenant_id,
                lease_id,
                rent_month,
                due_day,
                due_date,
                coverage_start,
                coverage_end,
                coverage_index,
                rent_amount,
                amount_paid,
                outstanding_amount,
                status,
                rollover_run_id
            )
            values (
                p_company_id,
                candidate.office_id,
                candidate.landlord_id,
                candidate.room_id,
                candidate.tenant_id,
                candidate.lease_id,
                public.ddumba_month_start(v_coverage_start),
                v_anchor_day,
                v_coverage_start,
                v_coverage_start,
                v_coverage_end,
                v_coverage_index,
                v_rent_amount,
                least(v_rent_amount, v_prepaid),
                v_outstanding_charge,
                case
                    when v_outstanding_charge <= 0 then 'paid'
                    when v_prepaid > 0 then 'partial'
                    else 'unpaid'
                end,
                v_run_id
            )
            on conflict do nothing
            returning id into v_month_row_id;

            if v_month_row_id is null then
                v_skipped := v_skipped + 1;
                continue;
            end if;

            if v_outstanding_charge > 0 then
                update public.tenants
                set balance = v_balance_after,
                    updated_at = now()
                where id = candidate.tenant_id
                  and company_id = p_company_id;

                update public.rooms
                set outstanding_balance = v_balance_after,
                    updated_at = now()
                where id = candidate.room_id
                  and company_id = p_company_id;

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
                    candidate.office_id,
                    candidate.tenant_id,
                    candidate.lease_id,
                    'monthly_rent_rollover',
                    v_month_row_id,
                    'debit',
                    v_outstanding_charge,
                    v_balance_after,
                    'Monthly rent charge for coverage ' || v_coverage_start || ' to ' || v_coverage_end
                );

                insert into public.tenant_balance_ledger (
                    company_id,
                    office_id,
                    tenant_id,
                    room_id,
                    rent_month,
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
                    candidate.office_id,
                    candidate.tenant_id,
                    candidate.room_id,
                    public.ddumba_month_start(v_coverage_start),
                    'monthly_rent_rollover',
                    v_month_row_id,
                    'debit',
                    v_outstanding_charge,
                    v_balance_before,
                    v_balance_after,
                    'Monthly rent charge for coverage ' || v_coverage_start || ' to ' || v_coverage_end,
                    p_triggered_by
                );
            end if;

            v_charged := v_charged + 1;
            v_total := v_total + v_outstanding_charge;
        exception when others then
            v_failed := v_failed || jsonb_build_array(jsonb_build_object(
                'tenant_id', candidate.tenant_id,
                'room_id', candidate.room_id,
                'error', sqlerrm
            ));
        end;
    end loop;

    perform public.ddumba_recalculate_landlord_payables_for_month(p_company_id, v_rent_month);

    update public.monthly_rollover_runs
    set status = case when jsonb_array_length(v_failed) > 0 then 'completed_with_errors' else 'completed' end,
        tenants_scanned = v_scanned,
        tenants_charged = v_charged,
        tenants_skipped = v_skipped,
        total_rent_charged = v_total,
        failed_records = v_failed,
        completed_at = now()
    where id = v_run_id;

    return jsonb_build_object(
        'run_id', v_run_id,
        'rent_month', v_rent_month,
        'business_date', p_business_date,
        'tenants_scanned', v_scanned,
        'tenants_charged', v_charged,
        'tenants_skipped', v_skipped,
        'total_rent_charged', v_total,
        'failed_records', v_failed
    );
exception when others then
    if v_run_id is not null then
        update public.monthly_rollover_runs
        set status = 'failed',
            failed_records = jsonb_build_array(jsonb_build_object('error', sqlerrm)),
            completed_at = now()
        where id = v_run_id;
    end if;
    raise;
end;
$$;

grant execute on function public.ddumba_add_anchor_months(date, integer) to authenticated, service_role;
grant execute on function public.run_monthly_rent_rollover(uuid, uuid, date, uuid, text) to authenticated, service_role;
