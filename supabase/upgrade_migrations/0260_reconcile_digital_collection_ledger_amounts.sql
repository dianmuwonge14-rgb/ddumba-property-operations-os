-- Phase 260: reconcile direct Bank/Mobile Money collection ledger amounts
-- to the current financially effective collection amount. This preserves
-- append-only history by adding a balancing ledger row when legacy rows used
-- a stale amount.

with target_accounts as (
  select
    ca.company_id,
    ca.account_type,
    min(ca.id::text)::uuid as account_id
  from public.cash_accounts ca
  where ca.office_id is null
    and ca.account_type in ('bank', 'mobile_money')
    and lower(coalesce(ca.status, 'active')) = 'active'
  group by ca.company_id, ca.account_type
),
digital_collections as (
  select
    c.id,
    c.company_id,
    c.office_id,
    coalesce(c.amount_paid, c.amount, 0) as expected_amount,
    c.paid_at,
    c.payment_date,
    c.created_at,
    c.recorded_by,
    case
      when lower(coalesce(c.payment_method, '')) like '%bank%'
        or lower(coalesce(c.payment_method, '')) like '%transfer%' then 'bank'
      when lower(coalesce(c.payment_method, '')) like '%mobile%'
        or lower(coalesce(c.payment_method, '')) like '%momo%'
        or lower(coalesce(c.payment_method, '')) like '%airtel%'
        or lower(coalesce(c.payment_method, '')) like '%mtn%' then 'mobile_money'
      else null
    end as target_account_type
  from public.collections c
  where lower(coalesce(c.status, 'paid')) not in ('voided', 'removed', 'removed_by_admin_approval', 'rejected', 'pending', 'cancelled', 'canceled', 'reversed', 'deleted')
    and coalesce(c.financial_effective, true) is true
    and coalesce(c.amount_paid, c.amount, 0) > 0
),
direct_digital_ledger as (
  select
    dc.id as collection_id,
    dc.company_id,
    sum(
      case
        when ct.transaction_type in ('outflow', 'transfer_out') then -ct.amount
        else ct.amount
      end
    ) as ledger_amount
  from digital_collections dc
  join public.cash_transactions ct
    on ct.company_id = dc.company_id
   and ct.source_id = dc.id
   and ct.source_type in ('collection', 'digital_collection_backfill')
  join public.cash_accounts ca
    on ca.id = ct.cash_account_id
   and ca.account_type = dc.target_account_type
  group by dc.id, dc.company_id
),
reclassified_digital_ledger as (
  select
    dc.id as collection_id,
    dc.company_id,
    sum(
      case
        when reclass_ct.transaction_type in ('outflow', 'transfer_out') then -reclass_ct.amount
        else reclass_ct.amount
      end
    ) as ledger_amount
  from digital_collections dc
  join public.cash_transactions original_ct
    on original_ct.company_id = dc.company_id
   and original_ct.source_id = dc.id
   and original_ct.source_type = 'collection'
  join public.cash_transactions reclass_ct
    on reclass_ct.company_id = original_ct.company_id
   and reclass_ct.source_id = original_ct.id
   and reclass_ct.source_type = 'payment_method_reclassification'
  join public.cash_accounts ca
    on ca.id = reclass_ct.cash_account_id
   and ca.account_type = dc.target_account_type
  group by dc.id, dc.company_id
),
ledger_totals as (
  select
    dc.*,
    ta.account_id as target_cash_account_id,
    coalesce(ddl.ledger_amount, 0) + coalesce(rdl.ledger_amount, 0) as ledger_amount
  from digital_collections dc
  join target_accounts ta
    on ta.company_id = dc.company_id
   and ta.account_type = dc.target_account_type
  left join direct_digital_ledger ddl
    on ddl.collection_id = dc.id
   and ddl.company_id = dc.company_id
  left join reclassified_digital_ledger rdl
    on rdl.collection_id = dc.id
   and rdl.company_id = dc.company_id
  where dc.target_account_type in ('bank', 'mobile_money')
),
differences as (
  select
    *,
    round((expected_amount - ledger_amount)::numeric, 2) as difference
  from ledger_totals
  where abs(round((expected_amount - ledger_amount)::numeric, 2)) > 0
    and not exists (
      select 1
      from public.cash_transactions existing
      where existing.company_id = ledger_totals.company_id
        and existing.source_type = 'digital_collection_amount_reconciliation'
        and existing.source_id = ledger_totals.id
    )
)
insert into public.cash_transactions(
  amount,
  cash_account_id,
  company_id,
  description,
  office_id,
  recorded_by,
  source_id,
  source_type,
  transaction_date,
  transaction_type
)
select
  abs(difference),
  target_cash_account_id,
  company_id,
  'Digital collection ledger amount reconciled to current financially effective payment amount.',
  office_id,
  recorded_by,
  id,
  'digital_collection_amount_reconciliation',
  coalesce(paid_at, payment_date::timestamptz, created_at, now()),
  case when difference > 0 then 'inflow' else 'outflow' end
from differences;
