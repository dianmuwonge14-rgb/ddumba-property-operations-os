-- Phase 148: Enterprise lifecycle controls for landlord advances.
-- Additive only. Existing advances, schedules, and deductions remain intact.

alter table public.landlord_advances
    add column if not exists lifecycle_status text not null default 'active',
    add column if not exists paused_at timestamptz,
    add column if not exists paused_by uuid references public.users(id) on delete set null,
    add column if not exists pause_reason text,
    add column if not exists resumed_at timestamptz,
    add column if not exists resumed_by uuid references public.users(id) on delete set null,
    add column if not exists resume_note text,
    add column if not exists early_settlement_policy text not null default 'collect_remaining_balance',
    add column if not exists early_settlement_discount numeric(14,2) not null default 0,
    add column if not exists revision_number integer not null default 1,
    add column if not exists last_revised_at timestamptz,
    add column if not exists last_revised_by uuid references public.users(id) on delete set null;

alter table public.landlord_advances
    drop constraint if exists landlord_advances_lifecycle_status_check,
    add constraint landlord_advances_lifecycle_status_check check (lifecycle_status in ('active', 'paused', 'cleared', 'cancelled'));

alter table public.landlord_advances
    drop constraint if exists landlord_advances_early_settlement_policy_check,
    add constraint landlord_advances_early_settlement_policy_check check (early_settlement_policy in ('collect_remaining_balance', 'waive_unearned_interest'));

update public.landlord_advances
set lifecycle_status = case
        when status = 'fully_deducted' then 'cleared'
        when lifecycle_status is null then 'active'
        else lifecycle_status
    end,
    actual_cleared_date = case
        when status = 'fully_deducted' and actual_cleared_date is null then coalesce(deducted_at::date, updated_at::date, current_date)
        else actual_cleared_date
    end
where true;

alter table public.landlord_advance_repayment_schedule
    add column if not exists revision_number integer not null default 1,
    add column if not exists superseded_at timestamptz,
    add column if not exists superseded_by uuid references public.users(id) on delete set null,
    add column if not exists skipped_reason text;

drop index if exists public.idx_landlord_advance_repayment_schedule_unique_month;
create unique index if not exists idx_landlord_advance_repayment_schedule_unique_revision_month
    on public.landlord_advance_repayment_schedule(advance_id, revision_number, month_key);

alter table public.landlord_advance_deductions
    add column if not exists interest_portion numeric(14,2) not null default 0,
    add column if not exists principal_portion numeric(14,2) not null default 0,
    add column if not exists remaining_balance numeric(14,2) not null default 0,
    add column if not exists reference text;

create table if not exists public.landlord_advance_revisions (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    landlord_id uuid not null references public.landlords(id) on delete cascade,
    advance_id uuid not null references public.landlord_advances(id) on delete cascade,
    revision_number integer not null,
    action text not null,
    before_data jsonb,
    after_data jsonb,
    reason text,
    created_by uuid references public.users(id) on delete set null,
    created_at timestamptz not null default now()
);

create index if not exists idx_landlord_advance_revisions_scope
    on public.landlord_advance_revisions(company_id, office_id, landlord_id, advance_id, revision_number desc);

create index if not exists idx_landlord_advances_lifecycle
    on public.landlord_advances(company_id, office_id, landlord_id, lifecycle_status, status, expected_end_date);

create index if not exists idx_landlord_advance_schedule_revision
    on public.landlord_advance_repayment_schedule(company_id, advance_id, revision_number, month_key, status);

alter table public.landlord_advance_revisions enable row level security;

drop policy if exists landlord_advance_revisions_read on public.landlord_advance_revisions;
create policy landlord_advance_revisions_read
on public.landlord_advance_revisions
for select
using (
    public.ddumba_v1_is_service_role()
    or public.ddumba_v1_is_company_admin()
    or (office_id is not null and public.ddumba_v1_can_access_office(office_id))
);

drop policy if exists landlord_advance_revisions_admin_write on public.landlord_advance_revisions;
create policy landlord_advance_revisions_admin_write
on public.landlord_advance_revisions
for all
using (public.ddumba_v1_is_service_role() or public.ddumba_v1_is_company_admin())
with check (public.ddumba_v1_is_service_role() or public.ddumba_v1_is_company_admin());
