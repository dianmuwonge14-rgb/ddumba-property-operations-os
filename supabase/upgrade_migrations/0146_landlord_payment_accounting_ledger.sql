-- Phase 146: Landlord payment accounting ledger.
-- Additive only. No landlord, room, payment, or existing monthly payable records are deleted.

alter table public.landlord_monthly_payables
    add column if not exists month_key date,
    add column if not exists opening_arrears numeric(14,2) not null default 0,
    add column if not exists monthly_net_payable numeric(14,2) not null default 0,
    add column if not exists total_due numeric(14,2) not null default 0,
    add column if not exists overpaid_amount numeric(14,2) not null default 0,
    add column if not exists advance_created numeric(14,2) not null default 0,
    add column if not exists closing_arrears numeric(14,2) not null default 0,
    add column if not exists paid_at timestamptz,
    add column if not exists payment_reference text,
    add column if not exists accounting_notes text;

update public.landlord_monthly_payables
set
    month_key = coalesce(month_key, settlement_month::date),
    monthly_net_payable = case when monthly_net_payable = 0 then coalesce(net_payable, 0) else monthly_net_payable end,
    total_due = case when total_due = 0 then coalesce(opening_arrears, 0) + coalesce(net_payable, 0) else total_due end,
    closing_arrears = case when closing_arrears = 0 then greatest(0, coalesce(unpaid_balance, 0)) else closing_arrears end
where month_key is null
   or monthly_net_payable = 0
   or total_due = 0
   or closing_arrears = 0;

create index if not exists idx_landlord_monthly_payables_accounting
    on public.landlord_monthly_payables(company_id, landlord_id, month_key, status, unpaid_balance);

create index if not exists idx_landlord_monthly_payable_payments_accounting
    on public.landlord_monthly_payable_payments(company_id, landlord_id, paid_at desc);

create index if not exists idx_landlord_advances_accounting
    on public.landlord_advances(company_id, landlord_id, status, remaining_balance);
