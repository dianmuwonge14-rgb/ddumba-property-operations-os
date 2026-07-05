-- Phase 147: Landlord advance interest, repayment plans, and monthly deduction schedules.
-- Additive only. Existing advances are preserved and backfilled into the new accounting fields.

alter table public.landlord_advances
    add column if not exists principal_amount numeric(14,2) not null default 0,
    add column if not exists interest_type text not null default 'none',
    add column if not exists interest_rate numeric(8,4) not null default 0,
    add column if not exists interest_amount numeric(14,2) not null default 0,
    add column if not exists total_repayable numeric(14,2) not null default 0,
    add column if not exists deduction_start_date date,
    add column if not exists payment_plan text not null default 'one_time',
    add column if not exists monthly_deduction_amount numeric(14,2) not null default 0,
    add column if not exists expected_end_date date,
    add column if not exists actual_cleared_date date,
    add column if not exists approved_by uuid references public.users(id) on delete set null;

alter table public.landlord_advances
    drop constraint if exists landlord_advances_interest_type_check,
    add constraint landlord_advances_interest_type_check check (interest_type in ('none', 'fixed', 'percentage'));

alter table public.landlord_advances
    drop constraint if exists landlord_advances_payment_plan_check,
    add constraint landlord_advances_payment_plan_check check (payment_plan in ('one_time', 'monthly', 'custom'));

update public.landlord_advances
set
    principal_amount = case when coalesce(principal_amount, 0) <= 0 then coalesce(advance_amount, 0) else principal_amount end,
    total_repayable = case when coalesce(total_repayable, 0) <= 0 then coalesce(advance_amount, 0) else total_repayable end,
    interest_type = coalesce(nullif(interest_type, ''), 'none'),
    deduction_start_date = coalesce(deduction_start_date, date_given, current_date),
    monthly_deduction_amount = case when coalesce(monthly_deduction_amount, 0) <= 0 then greatest(coalesce(advance_amount, 0) - coalesce(deducted_amount, 0), 0) else monthly_deduction_amount end,
    expected_end_date = coalesce(expected_end_date, date_given, current_date)
where true;

create table if not exists public.landlord_advance_repayment_schedule (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    landlord_id uuid not null references public.landlords(id) on delete cascade,
    advance_id uuid not null references public.landlord_advances(id) on delete cascade,
    month_key date not null,
    opening_balance numeric(14,2) not null default 0,
    scheduled_deduction numeric(14,2) not null default 0,
    actual_deduction numeric(14,2) not null default 0,
    interest_portion numeric(14,2) not null default 0,
    principal_portion numeric(14,2) not null default 0,
    closing_balance numeric(14,2) not null default 0,
    status text not null default 'pending',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint landlord_advance_repayment_schedule_status_check check (status in ('pending', 'deducted', 'partial', 'cleared'))
);

create unique index if not exists idx_landlord_advance_repayment_schedule_unique_month
    on public.landlord_advance_repayment_schedule(advance_id, month_key);

create index if not exists idx_landlord_advance_repayment_schedule_scope
    on public.landlord_advance_repayment_schedule(company_id, office_id, landlord_id, month_key, status);

create table if not exists public.landlord_advance_deductions (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    landlord_id uuid not null references public.landlords(id) on delete cascade,
    advance_id uuid not null references public.landlord_advances(id) on delete cascade,
    monthly_payable_id uuid references public.landlord_monthly_payables(id) on delete set null,
    settlement_id uuid references public.landlord_settlements(id) on delete set null,
    amount numeric(14,2) not null default 0,
    deduction_month date not null,
    status text not null default 'deducted',
    notes text,
    created_by uuid references public.users(id) on delete set null,
    created_at timestamptz not null default now(),
    constraint landlord_advance_deductions_amount_check check (amount >= 0),
    constraint landlord_advance_deductions_status_check check (status in ('deducted', 'partial', 'reversed'))
);

create index if not exists idx_landlord_advance_deductions_scope
    on public.landlord_advance_deductions(company_id, office_id, landlord_id, deduction_month, status);

create index if not exists idx_landlord_advance_deductions_advance
    on public.landlord_advance_deductions(advance_id, deduction_month);

create or replace function public.ddumba_v1_touch_landlord_advance_schedule_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_landlord_advance_repayment_schedule_updated_at on public.landlord_advance_repayment_schedule;
create trigger trg_landlord_advance_repayment_schedule_updated_at
before update on public.landlord_advance_repayment_schedule
for each row execute function public.ddumba_v1_touch_landlord_advance_schedule_updated_at();

alter table public.landlord_advance_repayment_schedule enable row level security;
alter table public.landlord_advance_deductions enable row level security;

drop policy if exists landlord_advance_repayment_schedule_read on public.landlord_advance_repayment_schedule;
create policy landlord_advance_repayment_schedule_read
on public.landlord_advance_repayment_schedule
for select
using (
    public.ddumba_v1_is_service_role()
    or public.ddumba_v1_is_company_admin()
    or (office_id is not null and public.ddumba_v1_can_access_office(office_id))
);

drop policy if exists landlord_advance_repayment_schedule_admin_write on public.landlord_advance_repayment_schedule;
create policy landlord_advance_repayment_schedule_admin_write
on public.landlord_advance_repayment_schedule
for all
using (public.ddumba_v1_is_service_role() or public.ddumba_v1_is_company_admin())
with check (public.ddumba_v1_is_service_role() or public.ddumba_v1_is_company_admin());

drop policy if exists landlord_advance_deductions_read on public.landlord_advance_deductions;
create policy landlord_advance_deductions_read
on public.landlord_advance_deductions
for select
using (
    public.ddumba_v1_is_service_role()
    or public.ddumba_v1_is_company_admin()
    or (office_id is not null and public.ddumba_v1_can_access_office(office_id))
);

drop policy if exists landlord_advance_deductions_admin_write on public.landlord_advance_deductions;
create policy landlord_advance_deductions_admin_write
on public.landlord_advance_deductions
for all
using (public.ddumba_v1_is_service_role() or public.ddumba_v1_is_company_admin())
with check (public.ddumba_v1_is_service_role() or public.ddumba_v1_is_company_admin());
