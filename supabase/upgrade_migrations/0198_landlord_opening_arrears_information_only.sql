-- 0198_landlord_opening_arrears_information_only.sql
-- Permanent landlord arrears rule:
-- opening_arrears is informational/history only and must never be added to
-- total_due, unpaid_balance, or total outstanding calculations.

with recalculated as (
    select
        id,
        greatest(
            0,
            coalesce(
                nullif(monthly_net_payable, 0),
                nullif(net_payable, 0),
                nullif(greatest(0, coalesce(total_due, 0) - coalesce(opening_arrears, 0)), 0),
                0
            )
        ) as month_due,
        greatest(0, coalesce(amount_paid, 0)) as paid
    from public.landlord_monthly_payables
    where coalesce(status, '') not in ('archived','reversed','void','voided','cancelled','canceled','deleted','removed')
),
normalized as (
    select
        id,
        month_due,
        paid,
        greatest(0, month_due - least(paid, month_due)) as month_unpaid,
        greatest(0, paid - month_due) as overpaid
    from recalculated
)
update public.landlord_monthly_payables payable
set
    monthly_net_payable = normalized.month_due,
    total_due = normalized.month_due,
    unpaid_balance = normalized.month_unpaid,
    closing_arrears = normalized.month_unpaid,
    overpaid_amount = normalized.overpaid,
    status = case
        when normalized.overpaid > 0 then 'overpaid'
        when normalized.month_unpaid <= 0 then 'paid'
        when normalized.paid > 0 then 'partial'
        else 'unpaid'
    end,
    accounting_notes = concat_ws(
        E'\n',
        nullif(payable.accounting_notes, ''),
        'Integrity repair 0198: opening_arrears preserved as history only; total_due/unpaid_balance recalculated from monthly payable only.'
    ),
    updated_at = now()
from normalized
where payable.id = normalized.id
  and (
      coalesce(payable.total_due, -1) <> normalized.month_due
      or coalesce(payable.unpaid_balance, -1) <> normalized.month_unpaid
      or coalesce(payable.closing_arrears, -1) <> normalized.month_unpaid
  );

insert into public.audit_logs (
    company_id,
    action,
    entity_type,
    entity_id,
    after_data,
    created_at
)
select
    company_id,
    'landlord_opening_arrears_information_only_reconciled',
    'landlord_monthly_payables',
    null,
    jsonb_build_object(
        'migration', '0198_landlord_opening_arrears_information_only',
        'rule', 'Opening arrears is informational only. Total outstanding is the sum of unpaid monthly balances only.',
        'rows_checked', count(*)
    ),
    now()
from public.landlord_monthly_payables
group by company_id;
