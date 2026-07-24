-- Security deposits are tenant liabilities, not rent, profit, landlord payable,
-- or advance rent. This module keeps deposit money in a separate ledger.

create table if not exists public.tenant_security_deposits (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    tenant_id uuid references public.tenants(id) on delete set null,
    room_id uuid references public.rooms(id) on delete set null,
    landlord_id uuid references public.landlords(id) on delete set null,
    lease_id uuid references public.leases(id) on delete set null,
    amount numeric(14,2) not null check (amount >= 0),
    amount_refunded numeric(14,2) not null default 0 check (amount_refunded >= 0),
    amount_retained numeric(14,2) not null default 0 check (amount_retained >= 0),
    amount_applied_to_charges numeric(14,2) not null default 0 check (amount_applied_to_charges >= 0),
    amount_used_by_company numeric(14,2) not null default 0 check (amount_used_by_company >= 0),
    amount_restored_by_company numeric(14,2) not null default 0 check (amount_restored_by_company >= 0),
    date_received date not null default current_date,
    payment_method text not null default 'cash',
    reference_number text,
    receipt_number text not null,
    status text not null default 'held' check (
        status in (
            'held',
            'partially_used_by_company',
            'fully_used_by_company',
            'refund_pending',
            'refunded',
            'retained',
            'partially_refunded',
            'applied_to_tenant_charges'
        )
    ),
    recorded_by uuid,
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.security_deposit_transactions (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    deposit_id uuid references public.tenant_security_deposits(id) on delete cascade,
    tenant_id uuid references public.tenants(id) on delete set null,
    room_id uuid references public.rooms(id) on delete set null,
    landlord_id uuid references public.landlords(id) on delete set null,
    transaction_type text not null check (
        transaction_type in (
            'received',
            'admin_used',
            'admin_restored',
            'refund',
            'retain',
            'apply_to_tenant_charges',
            'damage_deduction',
            'settlement_pending',
            'correction'
        )
    ),
    direction text not null default 'memo' check (direction in ('inflow','outflow','liability_reduction','memo')),
    amount numeric(14,2) not null check (amount >= 0),
    transaction_date date not null default current_date,
    payment_method text,
    reference_number text,
    reason text,
    notes text,
    recorded_by uuid,
    approved_by uuid,
    approved_at timestamptz,
    status text not null default 'posted',
    created_at timestamptz not null default now()
);

create table if not exists public.security_fund_usage (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    deposit_id uuid references public.tenant_security_deposits(id) on delete set null,
    tenant_id uuid references public.tenants(id) on delete set null,
    room_id uuid references public.rooms(id) on delete set null,
    amount_used numeric(14,2) not null default 0 check (amount_used >= 0),
    amount_restored numeric(14,2) not null default 0 check (amount_restored >= 0),
    reason text not null,
    expected_replacement_date date,
    authorized_by uuid,
    recorded_by uuid,
    status text not null default 'active' check (status in ('active','partially_restored','restored','cancelled')),
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.security_refunds (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    deposit_id uuid references public.tenant_security_deposits(id) on delete cascade,
    tenant_id uuid references public.tenants(id) on delete set null,
    room_id uuid references public.rooms(id) on delete set null,
    amount numeric(14,2) not null check (amount > 0),
    refund_date date not null default current_date,
    method text not null default 'cash',
    reference_number text,
    recipient_confirmation text,
    voucher_number text not null,
    paid_by uuid,
    approved_by uuid,
    approved_at timestamptz,
    status text not null default 'paid' check (status in ('requested','approved','paid','failed','cancelled')),
    notes text,
    created_at timestamptz not null default now()
);

create table if not exists public.security_settlements (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    deposit_id uuid references public.tenant_security_deposits(id) on delete cascade,
    tenant_id uuid references public.tenants(id) on delete set null,
    room_id uuid references public.rooms(id) on delete set null,
    vacate_date date not null,
    decision text not null check (
        decision in (
            'refund_full',
            'refund_part',
            'retain_full',
            'apply_to_debt',
            'apply_to_damage',
            'pending',
            'refund_later'
        )
    ),
    original_security numeric(14,2) not null default 0,
    refunded_amount numeric(14,2) not null default 0,
    retained_amount numeric(14,2) not null default 0,
    applied_to_debt numeric(14,2) not null default 0,
    damage_deduction numeric(14,2) not null default 0,
    other_deduction numeric(14,2) not null default 0,
    final_refundable_amount numeric(14,2) not null default 0,
    reason text not null,
    status text not null default 'posted',
    requested_by uuid,
    approved_by uuid,
    approved_at timestamptz,
    created_at timestamptz not null default now()
);

create unique index if not exists idx_security_deposit_receipt_number
    on public.tenant_security_deposits(company_id, receipt_number);

create unique index if not exists idx_security_deposit_active_tenancy_once
    on public.tenant_security_deposits(company_id, tenant_id, lease_id)
    where lease_id is not null and status in ('held','partially_used_by_company','fully_used_by_company','refund_pending','partially_refunded');

create index if not exists idx_security_deposits_company_office_status
    on public.tenant_security_deposits(company_id, office_id, status, created_at desc);

create index if not exists idx_security_deposits_tenant_room
    on public.tenant_security_deposits(company_id, tenant_id, room_id);

create index if not exists idx_security_transactions_deposit
    on public.security_deposit_transactions(company_id, deposit_id, created_at desc);

create index if not exists idx_security_fund_usage_company_status
    on public.security_fund_usage(company_id, office_id, status, created_at desc);

create index if not exists idx_security_refunds_company_date
    on public.security_refunds(company_id, office_id, refund_date desc);

create index if not exists idx_security_settlements_company_date
    on public.security_settlements(company_id, office_id, vacate_date desc);

alter table public.tenant_security_deposits enable row level security;
alter table public.security_deposit_transactions enable row level security;
alter table public.security_fund_usage enable row level security;
alter table public.security_refunds enable row level security;
alter table public.security_settlements enable row level security;

do $$
declare
    v_table text;
begin
    foreach v_table in array array[
        'tenant_security_deposits',
        'security_deposit_transactions',
        'security_fund_usage',
        'security_refunds',
        'security_settlements'
    ]
    loop
        execute format('drop policy if exists %I_read on public.%I', v_table, v_table);
        execute format('create policy %I_read on public.%I for select using (
            public.ddumba_v1_is_service_role()
            or (
                company_id = public.ddumba_v1_current_company_id()
                and (
                    public.ddumba_v1_is_company_admin()
                    or public.ddumba_v1_can_access_office(office_id)
                )
            )
        )', v_table, v_table);

        execute format('drop policy if exists %I_insert on public.%I', v_table, v_table);
        execute format('create policy %I_insert on public.%I for insert with check (
            public.ddumba_v1_is_service_role()
            or (
                company_id = public.ddumba_v1_current_company_id()
                and (
                    public.ddumba_v1_is_company_admin()
                    or public.ddumba_v1_can_access_office(office_id)
                )
            )
        )', v_table, v_table);

        execute format('drop policy if exists %I_update on public.%I', v_table, v_table);
        execute format('create policy %I_update on public.%I for update using (
            public.ddumba_v1_is_service_role()
            or (
                company_id = public.ddumba_v1_current_company_id()
                and (
                    public.ddumba_v1_is_company_admin()
                    or public.ddumba_v1_can_access_office(office_id)
                )
            )
        ) with check (
            public.ddumba_v1_is_service_role()
            or (
                company_id = public.ddumba_v1_current_company_id()
                and (
                    public.ddumba_v1_is_company_admin()
                    or public.ddumba_v1_can_access_office(office_id)
                )
            )
        )', v_table, v_table);
    end loop;
end $$;

create or replace function public.ddumba_security_deposit_receipt_number(p_company_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_candidate text;
begin
    loop
        v_candidate := 'SEC-' || to_char(now() at time zone 'Africa/Kampala', 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
        exit when not exists (
            select 1
            from public.tenant_security_deposits
            where company_id = p_company_id
              and receipt_number = v_candidate
        );
    end loop;
    return v_candidate;
end;
$$;

create or replace function public.record_tenant_security_deposit(
    p_company_id uuid,
    p_office_id uuid,
    p_tenant_id uuid,
    p_room_id uuid,
    p_amount numeric,
    p_payment_date date default current_date,
    p_payment_method text default 'cash',
    p_reference_number text default null,
    p_notes text default null,
    p_recorded_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_tenant record;
    v_room record;
    v_lease record;
    v_receipt text;
    v_deposit public.tenant_security_deposits%rowtype;
begin
    if p_amount is null or p_amount <= 0 then
        raise exception 'Security deposit amount must be greater than zero.';
    end if;

    select *
    into v_tenant
    from public.tenants
    where id = p_tenant_id
      and company_id = p_company_id
    for share;
    if not found then
        raise exception 'Tenant not found for security deposit.';
    end if;

    select *
    into v_room
    from public.rooms
    where id = coalesce(p_room_id, v_tenant.room_id)
      and company_id = p_company_id
    for share;
    if not found then
        raise exception 'Room not found for security deposit.';
    end if;

    if coalesce(p_office_id, v_room.office_id, v_tenant.office_id) is null then
        raise exception 'Office is required for security deposit.';
    end if;

    select *
    into v_lease
    from public.leases
    where company_id = p_company_id
      and tenant_id = v_tenant.id
      and room_id = v_room.id
      and status = 'active'
    order by created_at desc
    limit 1;

    if v_lease.id is not null and exists (
        select 1
        from public.tenant_security_deposits
        where company_id = p_company_id
          and tenant_id = v_tenant.id
          and lease_id = v_lease.id
          and status in ('held','partially_used_by_company','fully_used_by_company','refund_pending','partially_refunded')
    ) then
        raise exception 'This active tenancy already has a security deposit. Record an intentional additional deposit from the Security Deposits page.';
    end if;

    v_receipt := public.ddumba_security_deposit_receipt_number(p_company_id);

    insert into public.tenant_security_deposits (
        amount,
        company_id,
        date_received,
        landlord_id,
        lease_id,
        notes,
        office_id,
        payment_method,
        receipt_number,
        recorded_by,
        reference_number,
        room_id,
        status,
        tenant_id
    )
    values (
        p_amount,
        p_company_id,
        coalesce(p_payment_date, current_date),
        v_room.landlord_id,
        v_lease.id,
        p_notes,
        coalesce(p_office_id, v_room.office_id, v_tenant.office_id),
        coalesce(nullif(trim(p_payment_method), ''), 'cash'),
        v_receipt,
        p_recorded_by,
        nullif(trim(coalesce(p_reference_number, '')), ''),
        v_room.id,
        'held',
        v_tenant.id
    )
    returning * into v_deposit;

    insert into public.security_deposit_transactions (
        amount,
        company_id,
        deposit_id,
        direction,
        landlord_id,
        notes,
        office_id,
        payment_method,
        reason,
        recorded_by,
        reference_number,
        room_id,
        status,
        tenant_id,
        transaction_date,
        transaction_type
    )
    values (
        p_amount,
        p_company_id,
        v_deposit.id,
        'inflow',
        v_deposit.landlord_id,
        p_notes,
        v_deposit.office_id,
        v_deposit.payment_method,
        'Security deposit received. Liability held for tenant.',
        p_recorded_by,
        v_deposit.reference_number,
        v_deposit.room_id,
        'posted',
        v_deposit.tenant_id,
        v_deposit.date_received,
        'received'
    );

    insert into public.audit_logs (
        action,
        actor_id,
        after_data,
        company_id,
        entity_id,
        entity_type,
        office_id
    )
    values (
        'tenant_security_deposit_recorded',
        p_recorded_by,
        jsonb_build_object(
            'deposit_id', v_deposit.id,
            'tenant_id', v_deposit.tenant_id,
            'room_id', v_deposit.room_id,
            'amount', v_deposit.amount,
            'receipt_number', v_deposit.receipt_number,
            'note', 'Separate liability ledger. Not rent, income, advance rent, or landlord payable.'
        ),
        p_company_id,
        v_deposit.id,
        'tenant_security_deposit',
        v_deposit.office_id
    );

    return to_jsonb(v_deposit);
end;
$$;

create or replace function public.use_security_funds(
    p_company_id uuid,
    p_office_id uuid,
    p_deposit_id uuid,
    p_amount numeric,
    p_usage_date date default current_date,
    p_reason text default null,
    p_expected_replacement_date date default null,
    p_notes text default null,
    p_authorized_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_deposit public.tenant_security_deposits%rowtype;
    v_liability numeric(14,2);
    v_cash_available numeric(14,2);
    v_usage public.security_fund_usage%rowtype;
begin
    if p_amount is null or p_amount <= 0 then
        raise exception 'Security fund usage amount must be greater than zero.';
    end if;
    if nullif(trim(coalesce(p_reason, '')), '') is null then
        raise exception 'Reason is required when Admin uses security funds.';
    end if;

    select *
    into v_deposit
    from public.tenant_security_deposits
    where id = p_deposit_id
      and company_id = p_company_id
    for update;
    if not found then
        raise exception 'Security deposit not found.';
    end if;

    v_liability := greatest(0, v_deposit.amount - v_deposit.amount_refunded - v_deposit.amount_retained - v_deposit.amount_applied_to_charges);
    v_cash_available := greatest(0, v_deposit.amount - v_deposit.amount_used_by_company + v_deposit.amount_restored_by_company - v_deposit.amount_refunded);
    if p_amount > v_cash_available then
        raise exception 'Security cash available is lower than requested usage.';
    end if;

    update public.tenant_security_deposits
    set amount_used_by_company = amount_used_by_company + p_amount,
        status = case
            when (amount_used_by_company + p_amount) >= v_liability then 'fully_used_by_company'
            else 'partially_used_by_company'
        end,
        updated_at = now()
    where id = v_deposit.id
    returning * into v_deposit;

    insert into public.security_fund_usage (
        amount_used,
        authorized_by,
        company_id,
        deposit_id,
        expected_replacement_date,
        notes,
        office_id,
        reason,
        recorded_by,
        room_id,
        status,
        tenant_id
    )
    values (
        p_amount,
        p_authorized_by,
        p_company_id,
        v_deposit.id,
        p_expected_replacement_date,
        p_notes,
        coalesce(p_office_id, v_deposit.office_id),
        p_reason,
        p_authorized_by,
        v_deposit.room_id,
        'active',
        v_deposit.tenant_id
    )
    returning * into v_usage;

    insert into public.security_deposit_transactions (
        amount,
        company_id,
        deposit_id,
        direction,
        notes,
        office_id,
        reason,
        recorded_by,
        room_id,
        status,
        tenant_id,
        transaction_date,
        transaction_type
    )
    values (
        p_amount,
        p_company_id,
        v_deposit.id,
        'memo',
        p_notes,
        coalesce(p_office_id, v_deposit.office_id),
        p_reason,
        p_authorized_by,
        v_deposit.room_id,
        'posted',
        v_deposit.tenant_id,
        coalesce(p_usage_date, current_date),
        'admin_used'
    );

    insert into public.audit_logs(action, actor_id, after_data, company_id, entity_id, entity_type, office_id)
    values (
        'security_funds_used_by_admin',
        p_authorized_by,
        jsonb_build_object(
            'deposit_id', v_deposit.id,
            'usage_id', v_usage.id,
            'amount_used', p_amount,
            'liability_to_tenant', v_liability,
            'cash_available_after', greatest(0, v_cash_available - p_amount),
            'shortfall_after', greatest(0, v_liability - greatest(0, v_cash_available - p_amount))
        ),
        p_company_id,
        v_usage.id,
        'security_fund_usage',
        coalesce(p_office_id, v_deposit.office_id)
    );

    return jsonb_build_object('deposit', to_jsonb(v_deposit), 'usage', to_jsonb(v_usage));
end;
$$;

create or replace function public.settle_security_deposit(
    p_company_id uuid,
    p_deposit_id uuid,
    p_vacate_date date,
    p_decision text,
    p_refund_amount numeric default 0,
    p_retained_amount numeric default 0,
    p_applied_to_debt numeric default 0,
    p_damage_deduction numeric default 0,
    p_other_deduction numeric default 0,
    p_reason text default null,
    p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_deposit public.tenant_security_deposits%rowtype;
    v_liability numeric(14,2);
    v_total_reduction numeric(14,2);
    v_final_refund numeric(14,2);
    v_settlement public.security_settlements%rowtype;
    v_next_status text;
begin
    if p_decision not in ('refund_full','refund_part','retain_full','apply_to_debt','apply_to_damage','pending','refund_later') then
        raise exception 'Select a valid security settlement decision.';
    end if;
    if nullif(trim(coalesce(p_reason, '')), '') is null then
        raise exception 'Reason is required for security settlement.';
    end if;

    select *
    into v_deposit
    from public.tenant_security_deposits
    where id = p_deposit_id
      and company_id = p_company_id
    for update;
    if not found then
        raise exception 'Security deposit not found.';
    end if;

    v_liability := greatest(0, v_deposit.amount - v_deposit.amount_refunded - v_deposit.amount_retained - v_deposit.amount_applied_to_charges);
    v_total_reduction := greatest(0, coalesce(p_refund_amount, 0)) + greatest(0, coalesce(p_retained_amount, 0)) + greatest(0, coalesce(p_applied_to_debt, 0)) + greatest(0, coalesce(p_damage_deduction, 0)) + greatest(0, coalesce(p_other_deduction, 0));

    if v_total_reduction > v_liability then
        raise exception 'Security settlement cannot exceed current tenant liability.';
    end if;

    v_final_refund := greatest(0, v_liability - v_total_reduction);
    v_next_status := case
        when p_decision in ('pending','refund_later') then 'refund_pending'
        when greatest(0, coalesce(p_refund_amount, 0)) >= v_liability then 'refunded'
        when greatest(0, coalesce(p_retained_amount, 0)) >= v_liability then 'retained'
        when greatest(0, coalesce(p_applied_to_debt, 0)) > 0 then 'applied_to_tenant_charges'
        when greatest(0, coalesce(p_refund_amount, 0)) > 0 then 'partially_refunded'
        else v_deposit.status
    end;

    update public.tenant_security_deposits
    set amount_refunded = amount_refunded + greatest(0, coalesce(p_refund_amount, 0)),
        amount_retained = amount_retained + greatest(0, coalesce(p_retained_amount, 0)) + greatest(0, coalesce(p_damage_deduction, 0)) + greatest(0, coalesce(p_other_deduction, 0)),
        amount_applied_to_charges = amount_applied_to_charges + greatest(0, coalesce(p_applied_to_debt, 0)),
        status = v_next_status,
        updated_at = now()
    where id = v_deposit.id
    returning * into v_deposit;

    insert into public.security_settlements (
        applied_to_debt,
        company_id,
        damage_deduction,
        decision,
        deposit_id,
        final_refundable_amount,
        office_id,
        original_security,
        other_deduction,
        reason,
        refunded_amount,
        retained_amount,
        requested_by,
        room_id,
        status,
        tenant_id,
        vacate_date
    )
    values (
        greatest(0, coalesce(p_applied_to_debt, 0)),
        p_company_id,
        greatest(0, coalesce(p_damage_deduction, 0)),
        p_decision,
        v_deposit.id,
        v_final_refund,
        v_deposit.office_id,
        v_deposit.amount,
        greatest(0, coalesce(p_other_deduction, 0)),
        p_reason,
        greatest(0, coalesce(p_refund_amount, 0)),
        greatest(0, coalesce(p_retained_amount, 0)),
        p_actor_id,
        v_deposit.room_id,
        'posted',
        v_deposit.tenant_id,
        p_vacate_date
    )
    returning * into v_settlement;

    insert into public.security_deposit_transactions (
        amount,
        company_id,
        deposit_id,
        direction,
        notes,
        office_id,
        reason,
        recorded_by,
        room_id,
        status,
        tenant_id,
        transaction_date,
        transaction_type
    )
    values
        (greatest(0, coalesce(p_refund_amount, 0)), p_company_id, v_deposit.id, 'outflow', p_reason, v_deposit.office_id, p_reason, p_actor_id, v_deposit.room_id, 'posted', v_deposit.tenant_id, p_vacate_date, 'refund'),
        (greatest(0, coalesce(p_retained_amount, 0)) + greatest(0, coalesce(p_damage_deduction, 0)) + greatest(0, coalesce(p_other_deduction, 0)), p_company_id, v_deposit.id, 'liability_reduction', p_reason, v_deposit.office_id, p_reason, p_actor_id, v_deposit.room_id, 'posted', v_deposit.tenant_id, p_vacate_date, 'retain'),
        (greatest(0, coalesce(p_applied_to_debt, 0)), p_company_id, v_deposit.id, 'liability_reduction', p_reason, v_deposit.office_id, p_reason, p_actor_id, v_deposit.room_id, 'posted', v_deposit.tenant_id, p_vacate_date, 'apply_to_tenant_charges');

    insert into public.audit_logs(action, actor_id, after_data, company_id, entity_id, entity_type, office_id)
    values (
        'security_deposit_settled',
        p_actor_id,
        jsonb_build_object(
            'deposit_id', v_deposit.id,
            'settlement_id', v_settlement.id,
            'decision', p_decision,
            'liability_before', v_liability,
            'refund', greatest(0, coalesce(p_refund_amount, 0)),
            'retained', greatest(0, coalesce(p_retained_amount, 0)),
            'applied_to_debt', greatest(0, coalesce(p_applied_to_debt, 0)),
            'final_refundable_amount', v_final_refund
        ),
        p_company_id,
        v_settlement.id,
        'security_settlement',
        v_deposit.office_id
    );

    return jsonb_build_object('deposit', to_jsonb(v_deposit), 'settlement', to_jsonb(v_settlement));
end;
$$;

create or replace function public.restore_security_funds(
    p_company_id uuid,
    p_office_id uuid,
    p_deposit_id uuid,
    p_amount numeric,
    p_restore_date date default current_date,
    p_reference_number text default null,
    p_notes text default null,
    p_restored_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_deposit public.tenant_security_deposits%rowtype;
    v_net_used numeric(14,2);
begin
    if p_amount is null or p_amount <= 0 then
        raise exception 'Security restoration amount must be greater than zero.';
    end if;

    select *
    into v_deposit
    from public.tenant_security_deposits
    where id = p_deposit_id
      and company_id = p_company_id
    for update;
    if not found then
        raise exception 'Security deposit not found.';
    end if;

    v_net_used := greatest(0, v_deposit.amount_used_by_company - v_deposit.amount_restored_by_company);
    if p_amount > v_net_used then
        raise exception 'Restoration amount cannot exceed security money currently used by company.';
    end if;

    update public.tenant_security_deposits
    set amount_restored_by_company = amount_restored_by_company + p_amount,
        status = case
            when (amount_used_by_company - (amount_restored_by_company + p_amount)) <= 0 then 'held'
            when (amount_used_by_company - (amount_restored_by_company + p_amount)) < amount then 'partially_used_by_company'
            else 'fully_used_by_company'
        end,
        updated_at = now()
    where id = v_deposit.id
    returning * into v_deposit;

    update public.security_fund_usage
    set amount_restored = least(amount_used, amount_restored + p_amount),
        status = case
            when amount_restored + p_amount >= amount_used then 'restored'
            else 'partially_restored'
        end,
        updated_at = now()
    where id = (
        select id
        from public.security_fund_usage
        where company_id = p_company_id
          and deposit_id = v_deposit.id
          and status in ('active','partially_restored')
        order by created_at
        limit 1
    );

    insert into public.security_deposit_transactions (
        amount,
        company_id,
        deposit_id,
        direction,
        notes,
        office_id,
        payment_method,
        reason,
        recorded_by,
        reference_number,
        room_id,
        status,
        tenant_id,
        transaction_date,
        transaction_type
    )
    values (
        p_amount,
        p_company_id,
        v_deposit.id,
        'inflow',
        p_notes,
        coalesce(p_office_id, v_deposit.office_id),
        'cash',
        'Security money restored by company.',
        p_restored_by,
        nullif(trim(coalesce(p_reference_number, '')), ''),
        v_deposit.room_id,
        'posted',
        v_deposit.tenant_id,
        coalesce(p_restore_date, current_date),
        'admin_restored'
    );

    insert into public.audit_logs(action, actor_id, after_data, company_id, entity_id, entity_type, office_id)
    values (
        'security_funds_restored',
        p_restored_by,
        jsonb_build_object(
            'deposit_id', v_deposit.id,
            'amount_restored', p_amount,
            'used_balance_after', greatest(0, v_deposit.amount_used_by_company - v_deposit.amount_restored_by_company)
        ),
        p_company_id,
        v_deposit.id,
        'tenant_security_deposit',
        coalesce(p_office_id, v_deposit.office_id)
    );

    return to_jsonb(v_deposit);
end;
$$;

create or replace view public.security_deposit_register as
select
    d.*,
    greatest(0, d.amount - d.amount_refunded - d.amount_retained - d.amount_applied_to_charges) as liability_balance,
    greatest(0, d.amount - d.amount_used_by_company + d.amount_restored_by_company - d.amount_refunded) as cash_available,
    greatest(
        0,
        (d.amount - d.amount_refunded - d.amount_retained - d.amount_applied_to_charges)
        - (d.amount - d.amount_used_by_company + d.amount_restored_by_company - d.amount_refunded)
    ) as company_shortfall
from public.tenant_security_deposits d;
