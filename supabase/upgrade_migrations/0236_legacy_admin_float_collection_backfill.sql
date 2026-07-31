-- Phase 236: Backfill legacy Admin-to-office float rows that reused the same visible reference.
-- This creates collection-source records for already-posted cash ledger movements only.

insert into public.collections(
  amount,
  amount_paid,
  collection_number,
  company_id,
  entered_by_account_id,
  entered_by_name,
  financial_effective,
  notes,
  office_id,
  paid_at,
  payment_date,
  payment_method,
  recorded_by,
  reference_number,
  status,
  type
)
select
  ct.amount,
  ct.amount,
  coalesce(nullif(ct.reference, ''), nullif(acm.reference, '') || '-' || left(ct.source_id::text, 8), 'ADMIN-CASH-' || ct.source_id::text),
  ct.company_id,
  ct.recorded_by,
  'Admin',
  true,
  coalesce(ct.description, acm.notes, 'Cash from Admin'),
  ct.office_id,
  coalesce(ct.occurred_at, ct.transaction_date::timestamptz, ct.created_at),
  coalesce(ct.transaction_date::date, ct.created_at::date),
  case when source_account.account_type = 'bank' then 'Admin Bank Transfer' else 'Admin Cash Transfer' end,
  ct.recorded_by,
  coalesce(nullif(ct.reference, ''), nullif(acm.reference, '') || '-' || left(ct.source_id::text, 8), 'ADMIN-CASH-' || ct.source_id::text),
  'paid',
  'ADMIN_CASH_TRANSFER'
from public.cash_transactions ct
join public.cash_accounts office_account
  on office_account.id = ct.cash_account_id
left join public.cash_transfers transfer
  on transfer.id = ct.source_id
left join public.cash_accounts source_account
  on source_account.id = transfer.from_cash_account_id
left join public.admin_cash_movements acm
  on acm.transfer_id = ct.source_id
 and acm.company_id = ct.company_id
 and acm.office_id = ct.office_id
where office_account.account_type = 'office_cash'
  and ct.source_type = 'admin_float'
  and ct.transaction_type = 'inflow'
  and ct.office_id is not null
  and ct.source_id is not null
  and lower(coalesce(ct.status, 'approved')) in ('approved', 'completed', 'posted')
  and not exists (
    select 1
    from public.collections existing
    where existing.company_id = ct.company_id
      and existing.office_id = ct.office_id
      and existing.type = 'ADMIN_CASH_TRANSFER'
      and existing.reference_number in (
        coalesce(ct.reference, acm.reference, 'ADMIN-CASH-' || ct.source_id::text),
        coalesce(nullif(ct.reference, ''), nullif(acm.reference, '') || '-' || left(ct.source_id::text, 8), 'ADMIN-CASH-' || ct.source_id::text)
      )
  )
on conflict do nothing;

