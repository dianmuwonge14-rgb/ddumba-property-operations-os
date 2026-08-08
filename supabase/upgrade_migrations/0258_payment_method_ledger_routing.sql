-- Phase 258: route tenant collection ledgers by payment method.
-- Cash tenant payments remain physical office cash. Direct Bank and Mobile Money
-- payments move to company-level bank/mobile ledgers so office cash and
-- eligible-to-bank totals are not inflated.

create index if not exists idx_collections_company_payment_method_date
  on public.collections(company_id, payment_method, payment_date desc);

create index if not exists idx_cash_transactions_collection_source
  on public.cash_transactions(company_id, source_type, source_id);

insert into public.cash_accounts(company_id, office_id, account_type, name, currency, status)
select distinct c.company_id, null::uuid, 'bank', 'Company Bank', 'UGX', 'active'
from public.collections c
where lower(coalesce(c.payment_method, '')) like '%bank%'
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
method_collections as (
  select
    c.id,
    c.company_id,
    case
      when lower(coalesce(c.payment_method, '')) like '%bank%'
        or lower(coalesce(c.payment_method, '')) like '%transfer%' then 'bank'
      when lower(coalesce(c.payment_method, '')) like '%mobile%'
        or lower(coalesce(c.payment_method, '')) like '%momo%'
        or lower(coalesce(c.payment_method, '')) like '%airtel%'
        or lower(coalesce(c.payment_method, '')) like '%mtn%' then 'mobile_money'
      else 'office_cash'
    end as target_account_type
  from public.collections c
  where lower(coalesce(c.status, 'paid')) not in ('voided', 'removed', 'removed_by_admin_approval', 'rejected', 'pending', 'cancelled', 'canceled', 'reversed', 'deleted')
    and coalesce(c.financial_effective, true) is true
),
legacy_office_cash_collection_inflows as (
  select
    ct.id as original_transaction_id,
    ct.amount,
    ct.company_id,
    ct.created_at,
    ct.description,
    ct.office_id,
    ct.recorded_by,
    ct.transaction_date,
    mc.target_account_type,
    ta.account_id as target_cash_account_id,
    ct.cash_account_id as source_cash_account_id
  from public.cash_transactions ct
  join method_collections mc
    on mc.company_id = ct.company_id
   and mc.id = ct.source_id
  join public.cash_accounts source_account
    on source_account.id = ct.cash_account_id
  join target_accounts ta
    on ta.company_id = mc.company_id
   and ta.account_type = mc.target_account_type
  where ct.source_type = 'collection'
    and ct.transaction_type = 'inflow'
    and source_account.account_type = 'office_cash'
    and mc.target_account_type in ('bank', 'mobile_money')
    and not exists (
      select 1
      from public.cash_transactions existing
      where existing.company_id = ct.company_id
        and existing.source_type = 'payment_method_reclassification'
        and existing.source_id = ct.id
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
  source_cash_account_id,
  company_id,
  concat_ws(' ', nullif(description, ''), '[Reclassified out of office cash because tenant paid by ' || replace(target_account_type, '_', ' ') || '.]'),
  office_id,
  recorded_by,
  original_transaction_id,
  'payment_method_reclassification',
  transaction_date,
  'outflow'
from legacy_office_cash_collection_inflows
union all
select
  amount,
  target_cash_account_id,
  company_id,
  concat_ws(' ', nullif(description, ''), '[Reclassified into ' || replace(target_account_type, '_', ' ') || ' ledger from original tenant collection.]'),
  office_id,
  recorded_by,
  original_transaction_id,
  'payment_method_reclassification',
  transaction_date,
  'inflow'
from legacy_office_cash_collection_inflows;
