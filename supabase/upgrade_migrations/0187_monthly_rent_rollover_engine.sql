-- Monthly rent rollover engine and live rent calendar.
-- Additive only: creates idempotent month charge tables and an RPC.

create table if not exists public.tenant_rent_months (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid not null references public.offices(id) on delete cascade,
    landlord_id uuid references public.landlords(id) on delete set null,
    room_id uuid not null references public.rooms(id) on delete cascade,
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    lease_id uuid references public.leases(id) on delete set null,
    rent_month date not null,
    due_day int not null default 1 check (due_day between 1 and 31),
    due_date date not null,
    rent_amount numeric(14,2) not null default 0,
    amount_paid numeric(14,2) not null default 0,
    outstanding_amount numeric(14,2) not null default 0,
    status text not null default 'unpaid' check (status in ('unpaid','partial','paid')),
    rollover_run_id uuid,
    source text not null default 'monthly_rollover',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(company_id, tenant_id, rent_month)
);

create table if not exists public.tenant_balance_ledger (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid not null references public.offices(id) on delete cascade,
    tenant_id uuid not null references public.tenants(id) on delete cascade,
    room_id uuid references public.rooms(id) on delete set null,
    rent_month date,
    source_type text not null,
    source_id uuid,
    entry_type text not null check (entry_type in ('debit','credit','adjustment')),
    amount numeric(14,2) not null default 0,
    balance_before numeric(14,2) not null default 0,
    balance_after numeric(14,2) not null default 0,
    description text,
    created_by uuid references public.users(id) on delete set null,
    created_at timestamptz not null default now()
);

create table if not exists public.monthly_rollover_runs (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    rent_month date not null,
    business_date date not null,
    timezone text not null default 'Africa/Kampala',
    status text not null default 'running' check (status in ('running','completed','failed','completed_with_errors')),
    tenants_scanned int not null default 0,
    tenants_charged int not null default 0,
    tenants_skipped int not null default 0,
    total_rent_charged numeric(14,2) not null default 0,
    failed_records jsonb not null default '[]'::jsonb,
    run_type text not null default 'manual',
    triggered_by uuid references public.users(id) on delete set null,
    started_at timestamptz not null default now(),
    completed_at timestamptz,
    created_at timestamptz not null default now()
);

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'tenant_rent_months_rollover_run_fk'
          and conrelid = 'public.tenant_rent_months'::regclass
    ) then
        alter table public.tenant_rent_months
            add constraint tenant_rent_months_rollover_run_fk
            foreign key (rollover_run_id) references public.monthly_rollover_runs(id) on delete set null;
    end if;
end $$;

create index if not exists idx_tenant_rent_months_company_month
    on public.tenant_rent_months(company_id, rent_month, status);
create index if not exists idx_tenant_rent_months_office_month
    on public.tenant_rent_months(company_id, office_id, rent_month, status);
create index if not exists idx_tenant_rent_months_room_month
    on public.tenant_rent_months(company_id, room_id, rent_month);
create index if not exists idx_tenant_balance_ledger_tenant_created
    on public.tenant_balance_ledger(company_id, tenant_id, created_at desc);
create index if not exists idx_monthly_rollover_runs_company_month
    on public.monthly_rollover_runs(company_id, rent_month, created_at desc);
create index if not exists idx_monthly_rollover_runs_office_month
    on public.monthly_rollover_runs(company_id, office_id, rent_month, created_at desc);

alter table public.tenant_rent_months enable row level security;
alter table public.tenant_balance_ledger enable row level security;
alter table public.monthly_rollover_runs enable row level security;

drop policy if exists tenant_rent_months_office_scope on public.tenant_rent_months;
create policy tenant_rent_months_office_scope
on public.tenant_rent_months
for all
using (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and (public.ddumba_v1_is_company_admin() or public.ddumba_v1_can_access_office(office_id))
    )
)
with check (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and (public.ddumba_v1_is_company_admin() or public.ddumba_v1_can_access_office(office_id))
    )
);

drop policy if exists tenant_balance_ledger_office_scope on public.tenant_balance_ledger;
create policy tenant_balance_ledger_office_scope
on public.tenant_balance_ledger
for all
using (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and (public.ddumba_v1_is_company_admin() or public.ddumba_v1_can_access_office(office_id))
    )
)
with check (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and (public.ddumba_v1_is_company_admin() or public.ddumba_v1_can_access_office(office_id))
    )
);

drop policy if exists monthly_rollover_runs_office_scope on public.monthly_rollover_runs;
create policy monthly_rollover_runs_office_scope
on public.monthly_rollover_runs
for all
using (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and (
            public.ddumba_v1_is_company_admin()
            or office_id is null
            or public.ddumba_v1_can_access_office(office_id)
        )
    )
)
with check (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and (
            public.ddumba_v1_is_company_admin()
            or office_id is null
            or public.ddumba_v1_can_access_office(office_id)
        )
    )
);

create or replace function public.ddumba_month_start(p_date date)
returns date
language sql
immutable
as $$
    select date_trunc('month', p_date)::date;
$$;

create or replace function public.ddumba_recalculate_landlord_payables_for_month(
    p_company_id uuid,
    p_rent_month date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.landlord_monthly_payables (
        company_id,
        office_id,
        landlord_id,
        settlement_month,
        landlord_name,
        office_name,
        full_rent_roll,
        commission_mode,
        commission_percentage,
        commission_amount,
        vacant_room_deductions,
        net_payable,
        monthly_net_payable,
        total_due,
        unpaid_balance,
        status,
        accounting_notes,
        updated_at
    )
    select
        grouped.company_id,
        grouped.office_id,
        grouped.landlord_id,
        public.ddumba_month_start(p_rent_month),
        grouped.landlord_name,
        grouped.office_name,
        grouped.full_rent_roll,
        grouped.commission_mode,
        grouped.commission_rate,
        grouped.commission_amount,
        grouped.vacant_room_deductions,
        grouped.net_payable,
        grouped.net_payable,
        grouped.net_payable,
        greatest(0, grouped.net_payable - grouped.amount_paid),
        case
            when grouped.amount_paid <= 0 then 'unpaid'
            when grouped.amount_paid >= grouped.net_payable then 'paid'
            else 'partial'
        end,
        'Generated/refreshed by monthly rent rollover.',
        now()
    from (
        select
            r.company_id,
            r.office_id,
            r.landlord_id,
            coalesce(l.full_name, 'Landlord') as landlord_name,
            coalesce(o.office_name, o.name, 'Office') as office_name,
            coalesce(nullif(l.commission_calculation_mode, ''), 'portfolio_based') as commission_mode,
            coalesce(l.commission_rate, l.commission_percent, 10) as commission_rate,
            sum(coalesce(r.monthly_rent, 0)) as full_rent_roll,
            coalesce(sum(coalesce(r.monthly_rent, 0)) filter (where lower(coalesce(r.status, '')) in ('vacant','empty')), 0) as vacant_room_deductions,
            coalesce((
                select sum(coalesce(lp.amount, 0))
                from public.landlord_payments lp
                where lp.company_id = r.company_id
                  and lp.office_id = r.office_id
                  and lp.landlord_id = r.landlord_id
                  and date_trunc('month', coalesce(lp.paid_at, lp.created_at))::date = public.ddumba_month_start(p_rent_month)
                  and coalesce(lp.status, 'approved') not in ('pending','rejected','voided','cancelled','canceled')
            ), 0) as amount_paid,
            case
                when coalesce(nullif(l.commission_calculation_mode, ''), 'portfolio_based') = 'occupied_room_based'
                    then round(sum(coalesce(r.monthly_rent, 0)) filter (where lower(coalesce(r.status, '')) in ('occupied','active')) * coalesce(l.commission_rate, l.commission_percent, 10) / 100.0, 2)
                else round(sum(coalesce(r.monthly_rent, 0)) * coalesce(l.commission_rate, l.commission_percent, 10) / 100.0, 2)
            end as commission_amount,
            greatest(
                0,
                sum(coalesce(r.monthly_rent, 0))
                - case
                    when coalesce(nullif(l.commission_calculation_mode, ''), 'portfolio_based') = 'occupied_room_based'
                        then round(sum(coalesce(r.monthly_rent, 0)) filter (where lower(coalesce(r.status, '')) in ('occupied','active')) * coalesce(l.commission_rate, l.commission_percent, 10) / 100.0, 2)
                    else round(sum(coalesce(r.monthly_rent, 0)) * coalesce(l.commission_rate, l.commission_percent, 10) / 100.0, 2)
                  end
                - coalesce(sum(coalesce(r.monthly_rent, 0)) filter (where lower(coalesce(r.status, '')) in ('vacant','empty')), 0)
            ) as net_payable
        from public.rooms r
        join public.landlords l on l.id = r.landlord_id and l.company_id = r.company_id
        left join public.offices o on o.id = r.office_id
        where r.company_id = p_company_id
          and r.landlord_id is not null
          and lower(coalesce(r.status, '')) not in ('archived','deleted','removed','inactive')
        group by r.company_id, r.office_id, r.landlord_id, l.full_name, o.office_name, o.name, l.commission_calculation_mode, l.commission_rate, l.commission_percent
    ) grouped
    on conflict (company_id, office_id, landlord_id, settlement_month)
    do update set
        landlord_name = excluded.landlord_name,
        office_name = excluded.office_name,
        full_rent_roll = excluded.full_rent_roll,
        commission_mode = excluded.commission_mode,
        commission_percentage = excluded.commission_percentage,
        commission_amount = excluded.commission_amount,
        vacant_room_deductions = excluded.vacant_room_deductions,
        net_payable = excluded.net_payable,
        monthly_net_payable = excluded.monthly_net_payable,
        total_due = excluded.total_due,
        unpaid_balance = greatest(0, excluded.net_payable - landlord_monthly_payables.amount_paid),
        status = case
            when landlord_monthly_payables.amount_paid <= 0 then 'unpaid'
            when landlord_monthly_payables.amount_paid >= excluded.net_payable then 'paid'
            else 'partial'
        end,
        accounting_notes = excluded.accounting_notes,
        updated_at = now();
end;
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
    v_day int := extract(day from p_business_date)::int;
    v_scanned int := 0;
    v_charged int := 0;
    v_skipped int := 0;
    v_total numeric := 0;
    v_failed jsonb := '[]'::jsonb;
    candidate record;
    v_balance_before numeric;
    v_balance_after numeric;
    v_prepaid numeric;
    v_outstanding_charge numeric;
    v_due_day int;
    v_due_date date;
    v_month_row_id uuid;
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
    loop
        v_scanned := v_scanned + 1;
        begin
            v_due_day := least(28, greatest(1, coalesce(candidate.billing_day, extract(day from candidate.start_date)::int, 1)));
            if v_due_day > v_day then
                v_skipped := v_skipped + 1;
                continue;
            end if;

            if exists (
                select 1 from public.tenant_rent_months trm
                where trm.company_id = p_company_id
                  and trm.tenant_id = candidate.tenant_id
                  and trm.rent_month = v_rent_month
            ) then
                v_skipped := v_skipped + 1;
                continue;
            end if;

            v_prepaid := coalesce((
                select sum(a.amount_allocated)
                from public.tenant_rent_allocations a
                where a.company_id = p_company_id
                  and a.tenant_id = candidate.tenant_id
                  and a.room_id = candidate.room_id
                  and a.allocation_type = 'advance_month'
                  and date_trunc('month', a.allocation_month)::date = v_rent_month
            ), 0);

            v_outstanding_charge := greatest(0, coalesce(candidate.lease_rent, candidate.tenant_rent, candidate.room_rent, 0) - v_prepaid);
            v_balance_before := greatest(0, coalesce(candidate.tenant_balance, candidate.room_balance, 0));
            v_balance_after := v_balance_before + v_outstanding_charge;
            v_due_date := (v_rent_month + ((v_due_day - 1) || ' days')::interval)::date;

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
                v_rent_month,
                v_due_day,
                v_due_date,
                coalesce(candidate.lease_rent, candidate.tenant_rent, candidate.room_rent, 0),
                least(coalesce(candidate.lease_rent, candidate.tenant_rent, candidate.room_rent, 0), v_prepaid),
                v_outstanding_charge,
                case
                    when v_outstanding_charge <= 0 then 'paid'
                    when v_prepaid > 0 then 'partial'
                    else 'unpaid'
                end,
                v_run_id
            )
            on conflict (company_id, tenant_id, rent_month) do nothing
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
                    'Monthly rent charge for ' || to_char(v_rent_month, 'FMMonth YYYY')
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
                    v_rent_month,
                    'monthly_rent_rollover',
                    v_month_row_id,
                    'debit',
                    v_outstanding_charge,
                    v_balance_before,
                    v_balance_after,
                    'Monthly rent charge for ' || to_char(v_rent_month, 'FMMonth YYYY'),
                    p_triggered_by
                );
            end if;

            v_charged := v_charged + 1;
            v_total := v_total + v_outstanding_charge;
        exception when others then
            v_failed := v_failed || jsonb_build_array(jsonb_build_object(
                'tenant_id', candidate.tenant_id,
                'room_id', candidate.room_id,
                'room_number', candidate.room_id,
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

grant execute on function public.run_monthly_rent_rollover(uuid, uuid, date, uuid, text) to authenticated, service_role;
grant execute on function public.ddumba_recalculate_landlord_payables_for_month(uuid, date) to authenticated, service_role;
