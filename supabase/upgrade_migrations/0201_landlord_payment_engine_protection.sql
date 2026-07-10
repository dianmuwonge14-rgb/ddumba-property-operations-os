-- 0201_landlord_payment_engine_protection.sql
-- Permanent accounting safeguards for landlord monthly payable/payment engine.
-- Additive only: no deletes, no truncates, no destructive data rewrites.

alter table public.landlord_monthly_payables
    add constraint landlord_monthly_payables_non_negative_amounts
    check (
        coalesce(full_rent_roll, 0) >= 0
        and coalesce(commission_amount, 0) >= 0
        and coalesce(vacant_room_deductions, 0) >= 0
        and coalesce(vacated_tenant_debt_deductions, 0) >= 0
        and coalesce(advance_deductions, 0) >= 0
        and coalesce(other_deductions, 0) >= 0
        and coalesce(net_payable, 0) >= 0
        and coalesce(monthly_net_payable, 0) >= 0
        and coalesce(amount_paid, 0) >= 0
        and coalesce(unpaid_balance, 0) >= 0
        and coalesce(opening_arrears, 0) >= 0
    ) not valid;

alter table public.landlord_monthly_payables
    validate constraint landlord_monthly_payables_non_negative_amounts;

create unique index if not exists idx_landlord_monthly_payables_one_active_month
    on public.landlord_monthly_payables(company_id, office_id, landlord_id, settlement_month)
    where coalesce(status, 'unpaid') not in ('archived', 'reversed', 'void', 'voided', 'cancelled', 'canceled', 'deleted', 'removed');

alter table public.landlord_monthly_payable_payments
    add column if not exists source_payment_id uuid;

update public.landlord_monthly_payable_payments
set source_payment_id = coalesce(source_payment_id, id)
where source_payment_id is null;

create unique index if not exists idx_landlord_monthly_payable_payments_idempotency
    on public.landlord_monthly_payable_payments(company_id, office_id, landlord_id, monthly_payable_id, source_payment_id);

create unique index if not exists idx_landlord_monthly_payable_payments_reference_guard
    on public.landlord_monthly_payable_payments(company_id, office_id, landlord_id, monthly_payable_id, reference, amount)
    where reference is not null
      and btrim(reference) <> '';

alter table public.landlord_advances
    add column if not exists source_payment_id uuid,
    add column if not exists source_request_id uuid;

create unique index if not exists idx_landlord_advances_unique_source_payment
    on public.landlord_advances(company_id, office_id, landlord_id, source_payment_id)
    where source_payment_id is not null
      and coalesce(status, 'approved') not in ('cancelled', 'canceled', 'rejected', 'reversed', 'deleted', 'removed');

create unique index if not exists idx_landlord_advances_unique_source_request
    on public.landlord_advances(company_id, office_id, landlord_id, source_request_id)
    where source_request_id is not null
      and coalesce(status, 'approved') not in ('cancelled', 'canceled', 'rejected', 'reversed', 'deleted', 'removed');

alter table public.landlord_debt_deductions
    add column if not exists deduction_source_id uuid,
    add column if not exists applied_month date;

update public.landlord_debt_deductions
set
    deduction_source_id = coalesce(deduction_source_id, vacated_tenant_debt_id, id),
    applied_month = coalesce(
        applied_month,
        date_trunc('month', coalesce(advance_payment_month, vacate_date, created_at)::timestamptz)::date
    )
where deduction_source_id is null
   or applied_month is null;

create unique index if not exists idx_landlord_debt_deductions_unique_source_month_v2
    on public.landlord_debt_deductions(company_id, office_id, landlord_id, deduction_source_id, applied_month)
    where coalesce(status, 'pending') not in ('archived', 'cancelled', 'canceled', 'rejected', 'reversed', 'deleted', 'removed')
      and deduction_source_id is not null
      and applied_month is not null;

create or replace function public.ddumba_prevent_paid_landlord_payable_mutation()
returns trigger
language plpgsql
as $$
begin
    if coalesce(old.amount_paid, 0) > 0
       and coalesce(current_setting('app.landlord_payable_correction', true), '') <> 'on'
       and (
            old.full_rent_roll is distinct from new.full_rent_roll
         or old.commission_amount is distinct from new.commission_amount
         or old.vacant_room_deductions is distinct from new.vacant_room_deductions
         or old.vacated_tenant_debt_deductions is distinct from new.vacated_tenant_debt_deductions
         or old.advance_deductions is distinct from new.advance_deductions
         or old.other_deductions is distinct from new.other_deductions
         or old.net_payable is distinct from new.net_payable
         or old.monthly_net_payable is distinct from new.monthly_net_payable
         or old.total_due is distinct from new.total_due
       )
    then
        raise exception 'Paid landlord monthly payable financial fields are immutable outside audited correction workflow.';
    end if;
    return new;
end;
$$;

drop trigger if exists trg_prevent_paid_landlord_payable_mutation on public.landlord_monthly_payables;
create trigger trg_prevent_paid_landlord_payable_mutation
before update on public.landlord_monthly_payables
for each row execute function public.ddumba_prevent_paid_landlord_payable_mutation();

insert into public.audit_logs (
    company_id,
    action,
    entity_type,
    after_data,
    created_at
)
select
    company_id,
    'landlord_payment_engine_protection_installed',
    'landlord_payables',
    jsonb_build_object(
        'migration', '0201_landlord_payment_engine_protection',
        'rules', jsonb_build_array(
            'deduction source belongs to one applied month',
            'opening arrears are informational',
            'final due is sum of monthly unpaid balances',
            'paid monthly payable financial fields are immutable except correction workflow',
            'payment allocations are idempotent'
        )
    ),
    now()
from public.companies
where not exists (
    select 1
    from public.audit_logs
    where action = 'landlord_payment_engine_protection_installed'
);
