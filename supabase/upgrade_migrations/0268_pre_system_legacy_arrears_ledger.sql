-- Allocate approved imported/pre-system tenant debt into pre-go-live months.
-- This is an audit/balance-explanation ledger only. It does not create new rent,
-- payments, receipts, collections, or cash movement.

create table if not exists public.tenant_pre_system_arrears_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid references public.offices(id) on delete set null,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete set null,
  source_payment_id uuid references public.collections(id) on delete set null,
  source_repair_id uuid references public.tenant_legacy_arrears_repair_audit(id) on delete set null,
  source_type text not null default 'imported_opening_balance',
  source_label text not null default 'Imported opening balance',
  go_live_month date not null,
  allocation_month date not null,
  sequence_index integer not null default 0,
  monthly_rent numeric(14,2) not null default 0,
  legacy_arrears_amount numeric(14,2) not null default 0,
  payments_applied numeric(14,2) not null default 0,
  remaining_amount numeric(14,2) not null default 0,
  status text not null default 'open' check (status in ('open', 'partial', 'cleared')),
  reason text not null default 'Imported/pre-system outstanding allocated backward before authoritative billing period.',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uniq_tenant_pre_system_arrears_source_month
  on public.tenant_pre_system_arrears_periods(company_id, tenant_id, source_payment_id, allocation_month, source_type)
  where source_payment_id is not null;

create index if not exists idx_tenant_pre_system_arrears_tenant
  on public.tenant_pre_system_arrears_periods(company_id, tenant_id, allocation_month);

create index if not exists idx_tenant_pre_system_arrears_room
  on public.tenant_pre_system_arrears_periods(company_id, room_id, allocation_month);

alter table public.tenant_pre_system_arrears_periods enable row level security;

drop policy if exists tenant_pre_system_arrears_periods_read on public.tenant_pre_system_arrears_periods;
create policy tenant_pre_system_arrears_periods_read
on public.tenant_pre_system_arrears_periods
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

drop policy if exists tenant_pre_system_arrears_periods_admin_insert on public.tenant_pre_system_arrears_periods;
create policy tenant_pre_system_arrears_periods_admin_insert
on public.tenant_pre_system_arrears_periods
for insert
with check (public.ddumba_v1_is_service_role() or public.ddumba_v1_is_company_admin());

drop policy if exists tenant_pre_system_arrears_periods_admin_update on public.tenant_pre_system_arrears_periods;
create policy tenant_pre_system_arrears_periods_admin_update
on public.tenant_pre_system_arrears_periods
for update
using (public.ddumba_v1_is_service_role() or public.ddumba_v1_is_company_admin())
with check (public.ddumba_v1_is_service_role() or public.ddumba_v1_is_company_admin());

comment on table public.tenant_pre_system_arrears_periods is
  'Explains imported tenant debt that existed before the authoritative system billing period. These rows allocate existing debt backward for audit and defaulter clarity without creating new rent.';

create or replace function public.ddumba_reconstruct_pre_system_arrears_for_payment(
  p_payment_id uuid,
  p_source_type text default 'legacy_arrears_false_advance_reclassification',
  p_reason text default 'Confirmed imported/pre-system arrears during legacy balance reconciliation.'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_payment record;
  v_repair record;
  v_monthly_rent numeric(14,2);
  v_legacy_amount numeric(14,2);
  v_payment_amount numeric(14,2);
  v_go_live_month date;
  v_period_count integer;
  v_index integer;
  v_remainder numeric(14,2);
  v_period_amount numeric(14,2);
  v_payment_remaining numeric(14,2);
  v_payment_slice numeric(14,2);
  v_allocation_month date;
  v_months text[] := array[]::text[];
begin
  select
    c.id,
    c.company_id,
    c.office_id,
    c.tenant_id,
    c.room_id,
    c.amount,
    c.amount_paid,
    c.expected_amount,
    c.balance_before_payment,
    c.payment_date,
    c.created_at,
    c.payment_method,
    c.recorded_by,
    t.monthly_rent as tenant_monthly_rent,
    r.monthly_rent as room_monthly_rent,
    r.room_number,
    (
      select min(trm.rent_month)
      from public.tenant_rent_months trm
      where trm.company_id = c.company_id
        and trm.tenant_id = c.tenant_id
        and trm.room_id = c.room_id
    ) as first_system_rent_month
  into v_payment
  from public.collections c
  left join public.tenants t on t.company_id = c.company_id and t.id = c.tenant_id
  left join public.rooms r on r.company_id = c.company_id and r.id = c.room_id
  where c.id = p_payment_id;

  if not found then
    return jsonb_build_object('processed', false, 'reason', 'payment_not_found');
  end if;

  select *
  into v_repair
  from public.tenant_legacy_arrears_repair_audit a
  where a.payment_id = p_payment_id
    and a.repair_type in ('legacy_arrears_false_advance_reclassification', 'c8019_genuine_payment_restoration')
  order by a.created_at desc
  limit 1;

  v_legacy_amount := greatest(
    coalesce(v_payment.balance_before_payment, v_payment.expected_amount, 0),
    coalesce(v_repair.corrected_outstanding, 0) + coalesce(v_repair.genuine_payment_amount, 0),
    0
  );
  v_payment_amount := greatest(coalesce(v_payment.amount_paid, v_payment.amount, v_repair.genuine_payment_amount, 0), 0);
  v_monthly_rent := greatest(coalesce(v_payment.tenant_monthly_rent, v_payment.room_monthly_rent, 0), 0);
  v_go_live_month := coalesce(
    v_payment.first_system_rent_month,
    date_trunc('month', coalesce(v_payment.payment_date::timestamptz, v_payment.created_at, now()))::date
  );

  if v_legacy_amount <= 0 then
    return jsonb_build_object('processed', false, 'reason', 'no_legacy_amount');
  end if;

  if v_monthly_rent <= 0 then
    v_monthly_rent := v_legacy_amount;
  end if;

  v_period_count := greatest(1, ceil(v_legacy_amount / v_monthly_rent)::integer);
  v_remainder := v_legacy_amount - (v_monthly_rent * (v_period_count - 1));
  if v_remainder <= 0 then
    v_remainder := v_monthly_rent;
  end if;
  v_payment_remaining := v_payment_amount;

  delete from public.tenant_pre_system_arrears_periods
  where company_id = v_payment.company_id
    and tenant_id = v_payment.tenant_id
    and source_payment_id = p_payment_id
    and source_type = p_source_type;

  for v_index in 0..(v_period_count - 1) loop
    v_allocation_month := (v_go_live_month - ((v_period_count - v_index) || ' months')::interval)::date;
    v_period_amount := case when v_index = 0 then v_remainder else v_monthly_rent end;
    v_payment_slice := least(v_payment_remaining, v_period_amount);
    v_payment_remaining := greatest(0, v_payment_remaining - v_payment_slice);

    insert into public.tenant_pre_system_arrears_periods (
      company_id,
      office_id,
      tenant_id,
      room_id,
      source_payment_id,
      source_repair_id,
      source_type,
      source_label,
      go_live_month,
      allocation_month,
      sequence_index,
      monthly_rent,
      legacy_arrears_amount,
      payments_applied,
      remaining_amount,
      status,
      reason,
      metadata
    )
    values (
      v_payment.company_id,
      v_payment.office_id,
      v_payment.tenant_id,
      v_payment.room_id,
      p_payment_id,
      v_repair.id,
      p_source_type,
      'Imported opening balance',
      v_go_live_month,
      v_allocation_month,
      v_index,
      v_monthly_rent,
      v_period_amount,
      v_payment_slice,
      greatest(0, v_period_amount - v_payment_slice),
      case
        when v_payment_slice >= v_period_amount then 'cleared'
        when v_payment_slice > 0 then 'partial'
        else 'open'
      end,
      p_reason,
      jsonb_build_object(
        'room_number', v_payment.room_number,
        'source', 'approved_legacy_arrears_repair',
        'go_live_boundary', v_go_live_month,
        'payment_amount_applied_oldest_first', v_payment_amount,
        'payment_method', v_payment.payment_method,
        'does_not_create_new_rent', true
      )
    );

    v_months := array_append(v_months, to_char(v_allocation_month, 'YYYY-MM'));
  end loop;

  update public.tenant_legacy_arrears_repair_audit
  set
    legacy_months_reconstructed = v_months,
    after_data = coalesce(after_data, '{}'::jsonb) || jsonb_build_object(
      'pre_system_arrears_total', v_legacy_amount,
      'pre_system_arrears_months', v_months,
      'go_live_month', v_go_live_month,
      'monthly_rent_used', v_monthly_rent,
      'payment_application_order', 'oldest_outstanding_first'
    )
  where id = v_repair.id;

  insert into public.audit_logs (
    company_id,
    office_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    before_data,
    after_data,
    user_agent
  )
  select
    v_payment.company_id,
    v_payment.office_id,
    v_payment.recorded_by,
    'legacy_arrears_monthly_reconstructed',
    'collection',
    p_payment_id,
    jsonb_build_object('source_payment_id', p_payment_id),
    jsonb_build_object(
      'room_number', v_payment.room_number,
      'legacy_amount', v_legacy_amount,
      'months', v_months,
      'go_live_month', v_go_live_month,
      'reason', p_reason
    ),
    'system-authorised-production-reconciliation'
  where not exists (
    select 1
    from public.audit_logs existing
    where existing.action = 'legacy_arrears_monthly_reconstructed'
      and existing.entity_type = 'collection'
      and existing.entity_id = p_payment_id
  );

  return jsonb_build_object(
    'processed', true,
    'payment_id', p_payment_id,
    'legacy_amount', v_legacy_amount,
    'payment_amount', v_payment_amount,
    'go_live_month', v_go_live_month,
    'months', v_months,
    'remaining_after_payment', greatest(v_legacy_amount - v_payment_amount, 0)
  );
end;
$$;

grant execute on function public.ddumba_reconstruct_pre_system_arrears_for_payment(uuid, text, text) to authenticated, service_role;

create or replace function public.ddumba_reconstruct_approved_legacy_arrears()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_repair record;
  v_results jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  for v_repair in
    select payment_id, repair_type
    from public.tenant_legacy_arrears_repair_audit
    where payment_id is not null
      and repair_type in ('legacy_arrears_false_advance_reclassification', 'c8019_genuine_payment_restoration')
    order by room_number
  loop
    v_result := public.ddumba_reconstruct_pre_system_arrears_for_payment(
      v_repair.payment_id,
      v_repair.repair_type,
      'Confirmed imported/pre-system arrears during legacy balance reconciliation; allocated before authoritative billing month.'
    );
    v_results := v_results || jsonb_build_array(v_result);
  end loop;

  return jsonb_build_object(
    'processed_count', jsonb_array_length(v_results),
    'results', v_results
  );
end;
$$;

grant execute on function public.ddumba_reconstruct_approved_legacy_arrears() to authenticated, service_role;

create or replace view public.tenant_legacy_monthly_balance_ledger as
select
  p.id,
  p.company_id,
  p.office_id,
  p.tenant_id,
  p.room_id,
  p.source_payment_id,
  p.source_repair_id,
  p.source_type,
  p.source_label,
  p.go_live_month,
  p.allocation_month as ledger_month,
  p.monthly_rent,
  p.legacy_arrears_amount as rent_charged,
  p.legacy_arrears_amount as opening_arrears,
  p.payments_applied,
  p.remaining_amount,
  sum(p.remaining_amount) over (
    partition by p.company_id, p.tenant_id, p.source_payment_id
    order by p.allocation_month, p.sequence_index
    rows between unbounded preceding and current row
  )::numeric(14,2) as closing_balance,
  p.status,
  p.reason,
  p.metadata,
  p.created_at,
  p.updated_at
from public.tenant_pre_system_arrears_periods p;

grant select on public.tenant_pre_system_arrears_periods to authenticated, service_role;
grant select on public.tenant_legacy_monthly_balance_ledger to authenticated, service_role;

select public.ddumba_reconstruct_approved_legacy_arrears();
