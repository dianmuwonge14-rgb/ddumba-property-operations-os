-- Phase 259: append-only backfill for direct Bank/Mobile Money tenant collections
-- that have a valid collection row but no matching bank/mobile cash ledger inflow.

insert into public.cash_accounts(company_id, office_id, account_type, name, currency, status)
select distinct c.company_id, null::uuid, 'bank', 'Company Bank', 'UGX', 'active'
from public.collections c
where (
    lower(coalesce(c.payment_method, '')) like '%bank%'
    or lower(coalesce(c.payment_method, '')) like '%transfer%'
  )
  and not exists (
    select 1
    from public.cash_accounts ca
    where ca.company_id = c.company_id
      and ca.office_id is null
      and ca.account_type = 'bank'
      and lower(coalesce(ca.status, 'active')) = 'active'
  );

insert into public.cash_accounts(company_id, office_id, account_type, name, currency, status)
select distinct c.company_id, null::uuid, 'mobile_money', 'Company Mobile Money', 'UGX', 'active'
from public.collections c
where (
    lower(coalesce(c.payment_method, '')) like '%mobile%'
    or lower(coalesce(c.payment_method, '')) like '%momo%'
    or lower(coalesce(c.payment_method, '')) like '%airtel%'
    or lower(coalesce(c.payment_method, '')) like '%mtn%'
  )
  and not exists (
    select 1
    from public.cash_accounts ca
    where ca.company_id = c.company_id
      and ca.office_id is null
      and ca.account_type = 'mobile_money'
      and lower(coalesce(ca.status, 'active')) = 'active'
  );

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
    coalesce(c.amount_paid, c.amount, 0) as amount,
    c.paid_at,
    c.payment_date,
    c.created_at,
    c.recorded_by,
    c.reference_number,
    c.payment_method,
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
missing_digital_ledger as (
  select
    dc.*,
    ta.account_id as target_cash_account_id
  from digital_collections dc
  join target_accounts ta
    on ta.company_id = dc.company_id
   and ta.account_type = dc.target_account_type
  where dc.target_account_type in ('bank', 'mobile_money')
    and not exists (
      select 1
      from public.cash_transactions ct
      join public.cash_accounts ca on ca.id = ct.cash_account_id
      where ct.company_id = dc.company_id
        and ct.source_type = 'collection'
        and ct.source_id = dc.id
        and ct.transaction_type = 'inflow'
        and ca.account_type = dc.target_account_type
    )
    and not exists (
      select 1
      from public.cash_transactions original_ct
      join public.cash_transactions reclass_ct
        on reclass_ct.company_id = original_ct.company_id
       and reclass_ct.source_type = 'payment_method_reclassification'
       and reclass_ct.source_id = original_ct.id
      join public.cash_accounts reclass_account on reclass_account.id = reclass_ct.cash_account_id
      where original_ct.company_id = dc.company_id
        and original_ct.source_type = 'collection'
        and original_ct.source_id = dc.id
        and reclass_ct.transaction_type = 'inflow'
        and reclass_account.account_type = dc.target_account_type
    )
    and not exists (
      select 1
      from public.cash_transactions existing
      where existing.company_id = dc.company_id
        and existing.source_type = 'digital_collection_backfill'
        and existing.source_id = dc.id
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
  amount,
  target_cash_account_id,
  company_id,
  concat_ws(
    ' ',
    'Direct tenant payment received by ' || replace(target_account_type, '_', ' ') || '.',
    case when nullif(reference_number, '') is not null then 'Reference: ' || reference_number end
  ),
  office_id,
  recorded_by,
  id,
  'digital_collection_backfill',
  coalesce(paid_at, payment_date::timestamptz, created_at, now()),
  'inflow'
from missing_digital_ledger;
