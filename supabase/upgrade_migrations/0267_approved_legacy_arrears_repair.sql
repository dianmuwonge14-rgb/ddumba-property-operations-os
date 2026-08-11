-- Approved production repair for legacy arrears that were incorrectly displayed
-- as advance rent. This migration is intentionally idempotent and auditable.

create table if not exists public.tenant_legacy_arrears_repair_audit (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid references public.offices(id) on delete set null,
  tenant_id uuid references public.tenants(id) on delete set null,
  room_id uuid references public.rooms(id) on delete set null,
  payment_id uuid references public.collections(id) on delete set null,
  room_number text not null,
  repair_type text not null,
  previous_displayed_outstanding numeric(14,2) not null default 0,
  false_advance_found numeric(14,2) not null default 0,
  genuine_payment_amount numeric(14,2) not null default 0,
  corrected_outstanding numeric(14,2) not null default 0,
  correct_advance numeric(14,2) not null default 0,
  legacy_months_reconstructed text[] not null default array[]::text[],
  before_data jsonb not null default '{}'::jsonb,
  after_data jsonb not null default '{}'::jsonb,
  reason text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_tenant_legacy_arrears_repair_once
  on public.tenant_legacy_arrears_repair_audit(payment_id, repair_type)
  where payment_id is not null;

alter table public.tenant_legacy_arrears_repair_audit enable row level security;

drop policy if exists tenant_legacy_arrears_repair_audit_read on public.tenant_legacy_arrears_repair_audit;
create policy tenant_legacy_arrears_repair_audit_read
on public.tenant_legacy_arrears_repair_audit
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

drop policy if exists tenant_legacy_arrears_repair_audit_service_insert on public.tenant_legacy_arrears_repair_audit;
create policy tenant_legacy_arrears_repair_audit_service_insert
on public.tenant_legacy_arrears_repair_audit
for insert
with check (public.ddumba_v1_is_service_role() or public.ddumba_v1_is_company_admin());

with audited_candidates as (
  select distinct on (a.payment_id)
    a.company_id,
    a.office_id,
    a.tenant_id,
    a.room_id,
    a.payment_id,
    a.room_number,
    coalesce(t.balance, r.outstanding_balance, 0)::numeric(14,2) as previous_displayed_outstanding,
    coalesce(a.false_advance_recorded, 0)::numeric(14,2) as false_advance_found,
    coalesce(c.amount_paid, c.amount, 0)::numeric(14,2) as genuine_payment_amount,
    greatest(coalesce(c.balance_before_payment, c.expected_amount, 0) - coalesce(c.amount_paid, c.amount, 0), 0)::numeric(14,2) as corrected_outstanding,
    array_agg(to_char(tra.allocation_month, 'YYYY-MM') order by tra.allocation_month)
      filter (where tra.id is not null) as legacy_months_reconstructed,
    to_jsonb(c) as before_collection,
    to_jsonb(pr) as before_receipt,
    coalesce((
      select sum(greatest(tra2.amount_allocated - coalesce(tra2.consumed_by_balance_reconciliation, 0), 0))
      from public.tenant_rent_allocations tra2
      where tra2.payment_id = a.payment_id
        and tra2.allocation_type = 'advance_month'
    ), 0)::numeric(14,2) as active_false_advance_before
  from public.tenant_false_advance_audit a
  join public.collections c on c.id = a.payment_id
  join public.rooms r on r.id = a.room_id
  left join public.tenants t on t.id = a.tenant_id
  left join public.payment_receipts pr on pr.payment_id = a.payment_id
  left join public.tenant_rent_allocations tra
    on tra.payment_id = a.payment_id
   and tra.allocation_type = 'advance_month'
  where lower(coalesce(c.status, 'paid')) not in (
      'voided', 'removed', 'removed_by_admin_approval', 'rejected',
      'pending', 'cancelled', 'canceled', 'reversed', 'deleted'
    )
    and coalesce(c.financial_effective, true) is true
    and coalesce(a.false_advance_recorded, 0) > 0
  group by
    a.company_id, a.office_id, a.tenant_id, a.room_id, a.payment_id, a.room_number,
    t.balance, r.outstanding_balance, a.false_advance_recorded, c.amount_paid, c.amount,
    c.balance_before_payment, c.expected_amount, c, pr
),
insert_audit as (
  insert into public.tenant_legacy_arrears_repair_audit (
    company_id,
    office_id,
    tenant_id,
    room_id,
    payment_id,
    room_number,
    repair_type,
    previous_displayed_outstanding,
    false_advance_found,
    genuine_payment_amount,
    corrected_outstanding,
    correct_advance,
    legacy_months_reconstructed,
    before_data,
    after_data,
    reason
  )
  select
    company_id,
    office_id,
    tenant_id,
    room_id,
    payment_id,
    room_number,
    'legacy_arrears_false_advance_reclassification',
    previous_displayed_outstanding,
    false_advance_found,
    genuine_payment_amount,
    corrected_outstanding,
    0,
    coalesce(legacy_months_reconstructed, array[]::text[]),
    jsonb_build_object(
      'collection', before_collection,
      'receipt', before_receipt,
      'active_false_advance_before', active_false_advance_before
    ),
    jsonb_build_object(
      'corrected_payment_balance_after', corrected_outstanding,
      'correct_advance', 0,
      'legacy_arrears_treatment', 'Imported/pre-system debt allocated backward before authoritative billing period; unpaid legacy arrears are not advance rent.'
    ),
    'confirmed false advance during approved legacy-arrears reconciliation'
  from audited_candidates
  on conflict (payment_id, repair_type) where payment_id is not null do nothing
  returning payment_id
),
consume_false_advance as (
  update public.tenant_rent_allocations tra
  set consumed_by_balance_reconciliation = tra.amount_allocated
  from audited_candidates c
  where tra.payment_id = c.payment_id
    and tra.allocation_type = 'advance_month'
  returning tra.payment_id
),
update_collections as (
  update public.collections c
  set
    balance = a.corrected_outstanding,
    balance_after_payment = a.corrected_outstanding,
    allocated_to_next_month = 0,
    notes = concat_ws(
      E'\n',
      nullif(c.notes, ''),
      'Legacy arrears repair: false advance allocation reclassified; advance only exists for genuine overpayment.'
    ),
    updated_at = now()
  from audited_candidates a
  where c.id = a.payment_id
  returning c.id, c.company_id, c.office_id, c.tenant_id, c.room_id, c.recorded_by, a.false_advance_found, a.corrected_outstanding
),
update_receipts as (
  update public.payment_receipts pr
  set
    receipt_snapshot = jsonb_set(
      jsonb_set(
        jsonb_set(
          coalesce(pr.receipt_snapshot, '{}'::jsonb),
          '{remainingOutstandingBalance}',
          to_jsonb(uc.corrected_outstanding),
          true
        ),
        '{advanceBalance}',
        '0'::jsonb,
        true
      ),
      '{advanceAmount}',
      '0'::jsonb,
      true
    ),
    updated_at = now()
  from update_collections uc
  where pr.payment_id = uc.id
  returning pr.payment_id
)
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
select
  uc.company_id,
  uc.office_id,
  uc.tenant_id,
  uc.room_id,
  'legacy_arrears_false_advance_repair',
  uc.id,
  uc.corrected_outstanding,
  coalesce(t.balance, r.outstanding_balance, 0),
  uc.false_advance_found,
  uc.false_advance_found,
  coalesce(t.balance, r.outstanding_balance, 0),
  0,
  'Approved repair: unpaid legacy arrears were incorrectly printed as advance rent. Receipt/payment snapshot reclassified; current tenant balance preserved unless separately restored.',
  uc.recorded_by
from update_collections uc
left join public.tenants t on t.id = uc.tenant_id
left join public.rooms r on r.id = uc.room_id
where not exists (
  select 1
  from public.tenant_balance_reconciliations existing
  where existing.source_type = 'legacy_arrears_false_advance_repair'
    and existing.source_id = uc.id
);

do $$
declare
  v_payment_id uuid := 'a9f441de-e7e2-4ed7-a680-40687374e64d'::uuid;
  v_payment public.collections%rowtype;
  v_room_number text;
  v_before_collection jsonb;
  v_before_receipt jsonb;
  v_before_tenant_balance numeric(14,2);
  v_before_room_balance numeric(14,2);
  v_correct_outstanding numeric(14,2);
  v_payment_amount numeric(14,2);
  v_cash_account_id uuid;
begin
  select *
  into v_payment
  from public.collections
  where id = v_payment_id
  for update;

  if not found then
    raise notice 'C8019 payment % was not found; skipping C8019 restoration.', v_payment_id;
    return;
  end if;

  select r.room_number, r.outstanding_balance
  into v_room_number, v_before_room_balance
  from public.rooms r
  where r.id = v_payment.room_id
  for update;

  if coalesce(v_room_number, '') <> 'C8019' then
    raise exception 'Safety check failed: payment % belongs to room %, expected C8019.', v_payment_id, v_room_number;
  end if;

  select balance
  into v_before_tenant_balance
  from public.tenants
  where id = v_payment.tenant_id
  for update;

  select to_jsonb(c)
  into v_before_collection
  from public.collections c
  where c.id = v_payment_id;

  select to_jsonb(pr)
  into v_before_receipt
  from public.payment_receipts pr
  where pr.payment_id = v_payment_id
  limit 1;

  v_payment_amount := coalesce(v_payment.amount_paid, v_payment.amount, 0);
  v_correct_outstanding := greatest(coalesce(v_payment.balance_before_payment, v_payment.expected_amount, 0) - v_payment_amount, 0);

  if v_correct_outstanding <> 510000 then
    raise exception 'Safety check failed: C8019 restored outstanding calculated as %, expected 510000.', v_correct_outstanding;
  end if;

  update public.collections
  set
    status = 'paid',
    financial_effective = true,
    balance = v_correct_outstanding,
    balance_after_payment = v_correct_outstanding,
    allocated_to_next_month = 0,
    removed = false,
    reversed_at = null,
    reversed_by = null,
    reversal_reason = null,
    voided_at = null,
    deleted_at = null,
    superseded_at = null,
    superseded_by_payment_id = null,
    notes = concat_ws(
      E'\n',
      nullif(notes, ''),
      'Legacy arrears repair: previously removed payment restored as genuine; removal history preserved in audit logs.'
    ),
    updated_at = now()
  where id = v_payment_id;

  update public.tenants
  set balance = v_correct_outstanding, updated_at = now()
  where id = v_payment.tenant_id;

  update public.rooms
  set outstanding_balance = v_correct_outstanding, updated_at = now()
  where id = v_payment.room_id;

  update public.payment_receipts pr
  set
    status = 'issued',
    receipt_snapshot = jsonb_set(
      jsonb_set(
        jsonb_set(
          coalesce(pr.receipt_snapshot, '{}'::jsonb),
          '{remainingOutstandingBalance}',
          to_jsonb(v_correct_outstanding),
          true
        ),
        '{advanceBalance}',
        '0'::jsonb,
        true
      ),
      '{advanceAmount}',
      '0'::jsonb,
      true
    ),
    updated_at = now()
  where pr.payment_id = v_payment_id;

  select ct.cash_account_id
  into v_cash_account_id
  from public.cash_transactions ct
  where ct.company_id = v_payment.company_id
    and ct.source_id = v_payment_id
    and ct.source_type = 'collection'
    and lower(coalesce(ct.transaction_type, '')) = 'inflow'
  order by ct.transaction_date asc
  limit 1;

  if lower(coalesce(v_payment.payment_method, 'cash')) = 'cash' and v_cash_account_id is not null then
    insert into public.cash_transactions (
      company_id,
      office_id,
      cash_account_id,
      transaction_type,
      source_type,
      source_id,
      amount,
      transaction_date,
      description,
      recorded_by,
      status,
      direction,
      payment_method,
      reference,
      occurred_at,
      created_by,
      notes,
      metadata
    )
    select
      v_payment.company_id,
      v_payment.office_id,
      v_cash_account_id,
      'inflow',
      'payment_removal_restoration',
      v_payment_id,
      v_payment_amount,
      now(),
      'Restored C8019 genuine payment after legacy-arrears reconciliation.',
      v_payment.recorded_by,
      'completed',
      'inflow',
      'cash',
      v_payment.reference_number,
      now(),
      v_payment.recorded_by,
      'Reason: confirmed genuine payment during legacy-arrears reconciliation. Previous Admin removal remains preserved in audit/history.',
      jsonb_build_object(
        'restored_payment_id', v_payment_id,
        'room_number', 'C8019',
        'original_payment_method', v_payment.payment_method,
        'repair', 'legacy_arrears_payment_restoration'
      )
    where not exists (
      select 1
      from public.cash_transactions existing
      where existing.company_id = v_payment.company_id
        and existing.source_type = 'payment_removal_restoration'
        and existing.source_id = v_payment_id
    );
  end if;

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
  select
    v_payment.company_id,
    v_payment.office_id,
    v_payment.tenant_id,
    v_payment.lease_id,
    'payment_restoration_legacy_arrears_repair',
    v_payment_id,
    'credit',
    greatest(coalesce(v_before_tenant_balance, v_before_room_balance, v_correct_outstanding) - v_correct_outstanding, 0),
    v_correct_outstanding,
    'C8019 genuine payment restored during legacy-arrears reconciliation; no duplicate payment created.'
  where greatest(coalesce(v_before_tenant_balance, v_before_room_balance, v_correct_outstanding) - v_correct_outstanding, 0) > 0
    and not exists (
      select 1
      from public.tenant_ledger_entries existing
      where existing.source_type = 'payment_restoration_legacy_arrears_repair'
        and existing.source_id = v_payment_id
    );

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
  select
    v_payment.company_id,
    v_payment.office_id,
    v_payment.tenant_id,
    v_payment.room_id,
    'c8019_payment_restoration_legacy_arrears_repair',
    v_payment_id,
    v_correct_outstanding,
    coalesce(v_before_tenant_balance, v_before_room_balance, 0),
    0,
    0,
    v_correct_outstanding,
    0,
    'Approved repair: existing C8019 payment restored as genuine. Previous removal remains visible in audit/history; no duplicate payment created.',
    v_payment.recorded_by
  where not exists (
    select 1
    from public.tenant_balance_reconciliations existing
    where existing.source_type = 'c8019_payment_restoration_legacy_arrears_repair'
      and existing.source_id = v_payment_id
  );

  insert into public.tenant_legacy_arrears_repair_audit (
    company_id,
    office_id,
    tenant_id,
    room_id,
    payment_id,
    room_number,
    repair_type,
    previous_displayed_outstanding,
    false_advance_found,
    genuine_payment_amount,
    corrected_outstanding,
    correct_advance,
    legacy_months_reconstructed,
    before_data,
    after_data,
    reason
  )
  values (
    v_payment.company_id,
    v_payment.office_id,
    v_payment.tenant_id,
    v_payment.room_id,
    v_payment_id,
    'C8019',
    'c8019_genuine_payment_restoration',
    coalesce(v_before_tenant_balance, v_before_room_balance, 0),
    0,
    v_payment_amount,
    v_correct_outstanding,
    0,
    array['legacy-arrears-before-authoritative-billing-period'],
    jsonb_build_object(
      'collection', v_before_collection,
      'receipt', v_before_receipt,
      'tenant_balance', v_before_tenant_balance,
      'room_outstanding_balance', v_before_room_balance
    ),
    jsonb_build_object(
      'status', 'paid',
      'financial_effective', true,
      'tenant_balance', v_correct_outstanding,
      'room_outstanding_balance', v_correct_outstanding,
      'receipt_remaining_outstanding', v_correct_outstanding,
      'advance', 0,
      'cash_restoration_source_type', case when lower(coalesce(v_payment.payment_method, 'cash')) = 'cash' then 'payment_removal_restoration' else null end
    ),
    'confirmed genuine payment during legacy-arrears reconciliation; restored by system-authorised Admin repair'
  )
  on conflict (payment_id, repair_type) where payment_id is not null do nothing;

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
    'legacy_arrears_payment_restored',
    'collection',
    v_payment_id,
    v_before_collection,
    jsonb_build_object(
      'room_number', 'C8019',
      'status', 'paid',
      'financial_effective', true,
      'corrected_outstanding', v_correct_outstanding,
      'advance', 0,
      'reason', 'confirmed genuine payment during legacy-arrears reconciliation'
    ),
    'system-authorised-production-reconciliation'
  where not exists (
    select 1
    from public.audit_logs existing
    where existing.action = 'legacy_arrears_payment_restored'
      and existing.entity_type = 'collection'
      and existing.entity_id = v_payment_id
  );
end $$;
