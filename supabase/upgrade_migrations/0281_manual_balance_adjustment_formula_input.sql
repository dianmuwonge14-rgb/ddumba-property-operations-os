-- 0281_manual_balance_adjustment_formula_input.sql
-- Turns tenant balance adjustments into a signed manual formula input.
-- Historical old_balance/new_balance columns remain audit snapshots only.

alter table public.tenant_balance_adjustments
    add column if not exists billing_month date,
    add column if not exists adjustment_type text not null default 'manual_balance_adjustment',
    add column if not exists proof_url text,
    add column if not exists financial_effective boolean not null default false,
    add column if not exists reversed_at timestamptz,
    add column if not exists reversed_by uuid references public.users(id) on delete set null,
    add column if not exists reversal_reason text;

update public.tenant_balance_adjustments
set billing_month = date_trunc('month', effective_date)::date
where billing_month is null;

update public.tenant_balance_adjustments
set financial_effective = true
where status in ('approved', 'direct_admin_change')
  and reversed_at is null
  and financial_effective is distinct from true;

alter table public.tenant_balance_adjustments
    alter column billing_month set default date_trunc('month', current_date)::date;

create index if not exists idx_tenant_balance_adjustments_formula_input
    on public.tenant_balance_adjustments(company_id, tenant_id, billing_month, status, financial_effective)
    where reversed_at is null;

create index if not exists idx_tenant_balance_adjustments_room_formula_input
    on public.tenant_balance_adjustments(company_id, room_id, billing_month, status, financial_effective)
    where reversed_at is null;

comment on column public.tenant_balance_adjustments.adjustment_amount is
    'Signed manual balance adjustment formula input. Positive increases tenant obligation; negative reduces it.';

comment on column public.tenant_balance_adjustments.old_balance is
    'Audit snapshot only. Must not drive live outstanding calculations.';

comment on column public.tenant_balance_adjustments.new_balance is
    'Audit snapshot only. Must not drive live outstanding calculations.';
