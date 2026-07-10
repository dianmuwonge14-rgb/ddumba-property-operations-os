-- 0200_landlord_recovery_deduction_single_month_guard.sql
-- Recovery deductions belong to exactly one monthly payable row unless an
-- explicit instalment model is introduced. This migration records the source
-- and effective month used by the application and adds a uniqueness guard when
-- existing data is clean enough to enforce it safely.

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

create index if not exists idx_landlord_debt_deductions_source_month
    on public.landlord_debt_deductions(company_id, office_id, landlord_id, deduction_source_id, applied_month);

do $$
begin
    if not exists (
        select 1
        from public.landlord_debt_deductions
        where coalesce(status, 'pending') not in ('archived', 'cancelled', 'canceled', 'rejected', 'reversed', 'deleted', 'removed')
          and deduction_source_id is not null
          and applied_month is not null
        group by company_id, office_id, landlord_id, deduction_source_id, applied_month
        having count(*) > 1
    ) then
        create unique index if not exists idx_landlord_debt_deductions_unique_active_source_month
            on public.landlord_debt_deductions(company_id, office_id, landlord_id, deduction_source_id, applied_month)
            where coalesce(status, 'pending') not in ('archived', 'cancelled', 'canceled', 'rejected', 'reversed', 'deleted', 'removed')
              and deduction_source_id is not null
              and applied_month is not null;
    end if;
end $$;

insert into public.audit_logs (
    company_id,
    action,
    entity_type,
    after_data,
    created_at
)
select
    id,
    'landlord_recovery_deduction_single_month_guard_created',
    'landlord_debt_deductions',
    jsonb_build_object(
        'migration', '0200_landlord_recovery_deduction_single_month_guard',
        'rule', 'A recovery deduction source is associated with one applied_month and must not be carried into later monthly payable totals.'
    ),
    now()
from public.companies
where not exists (
    select 1
    from public.audit_logs
    where action = 'landlord_recovery_deduction_single_month_guard_created'
);
