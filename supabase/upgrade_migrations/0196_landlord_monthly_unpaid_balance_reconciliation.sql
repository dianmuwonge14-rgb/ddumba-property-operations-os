-- 0196_landlord_monthly_unpaid_balance_reconciliation.sql
-- Keep landlord monthly payable balances month-scoped.
--
-- opening_arrears remains an informational carry-forward of previous unpaid
-- balances. It must not be stored again inside the current month's
-- unpaid_balance/closing_arrears, otherwise reports double-count the same
-- money.

with recalculated as (
    select
        id,
        greatest(
            0,
            coalesce(monthly_net_payable, net_payable, greatest(0, coalesce(total_due, 0) - coalesce(opening_arrears, 0)), 0)
            - least(
                coalesce(amount_paid, 0),
                coalesce(monthly_net_payable, net_payable, greatest(0, coalesce(total_due, 0) - coalesce(opening_arrears, 0)), 0)
            )
        ) as month_unpaid
    from public.landlord_monthly_payables
    where coalesce(status, '') not in ('archived', 'reversed', 'void', 'voided', 'cancelled', 'canceled', 'deleted', 'removed')
)
update public.landlord_monthly_payables payable
set
    unpaid_balance = recalculated.month_unpaid,
    closing_arrears = recalculated.month_unpaid,
    status = case
        when recalculated.month_unpaid <= 0 then 'paid'
        when coalesce(payable.amount_paid, 0) > 0 then 'partial'
        else 'unpaid'
    end,
    updated_at = now(),
    accounting_notes = concat_ws(
        E'\n',
        nullif(payable.accounting_notes, ''),
        'Integrity repair 0196: unpaid_balance recalculated as month-only balance; opening_arrears preserved for reporting.'
    )
from recalculated
where payable.id = recalculated.id
  and (
    coalesce(payable.unpaid_balance, -1) <> recalculated.month_unpaid
    or coalesce(payable.closing_arrears, -1) <> recalculated.month_unpaid
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
    'landlord_monthly_unpaid_balance_reconciled',
    'landlord_monthly_payables',
    null,
    jsonb_build_object(
        'migration', '0196_landlord_monthly_unpaid_balance_reconciliation',
        'rule', 'Total outstanding is the sum of unpaid month balances only; opening_arrears is not counted as a separate current-month payable.'
    ),
    now()
from public.landlord_monthly_payables
group by company_id
on conflict do nothing;
