-- Phase 143: Admin office merge foundation.
-- Additive only. This creates future-safe merge tracking and provenance columns.
-- It does not merge, delete, truncate, or reset any existing office/business data.

create table if not exists public.office_merge_batches (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    new_office_id uuid references public.offices(id) on delete set null,
    new_office_name text not null,
    source_office_ids uuid[] not null default '{}',
    source_office_names text[] not null default '{}',
    status text not null default 'preview'
        check (status in ('preview','confirmed','completed','cancelled','failed')),
    admin_user_id uuid references public.users(id) on delete set null,
    affected_counts jsonb not null default '{}',
    reason_note text,
    warning_acknowledged boolean not null default false,
    created_at timestamptz not null default now(),
    confirmed_at timestamptz,
    completed_at timestamptz,
    error_message text
);

create table if not exists public.office_merge_audit (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    merge_batch_id uuid not null references public.office_merge_batches(id) on delete cascade,
    source_office_id uuid references public.offices(id) on delete set null,
    source_office_name text,
    merged_into_office_id uuid references public.offices(id) on delete set null,
    entity_table text not null,
    entity_id uuid,
    action text not null,
    before_data jsonb not null default '{}',
    after_data jsonb not null default '{}',
    admin_user_id uuid references public.users(id) on delete set null,
    created_at timestamptz not null default now()
);

create index if not exists idx_office_merge_batches_company_status
    on public.office_merge_batches(company_id, status, created_at desc);

create index if not exists idx_office_merge_audit_company_batch
    on public.office_merge_audit(company_id, merge_batch_id, created_at desc);

create index if not exists idx_office_merge_audit_entity
    on public.office_merge_audit(entity_table, entity_id);

alter table public.office_merge_batches enable row level security;
alter table public.office_merge_audit enable row level security;

drop policy if exists office_merge_batches_admin_read on public.office_merge_batches;
create policy office_merge_batches_admin_read
on public.office_merge_batches
for select
using (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and public.ddumba_v1_is_company_admin()
    )
);

drop policy if exists office_merge_batches_admin_write on public.office_merge_batches;
create policy office_merge_batches_admin_write
on public.office_merge_batches
for all
using (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and public.ddumba_v1_is_company_admin()
    )
)
with check (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and public.ddumba_v1_is_company_admin()
    )
);

drop policy if exists office_merge_audit_admin_read on public.office_merge_audit;
create policy office_merge_audit_admin_read
on public.office_merge_audit
for select
using (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and public.ddumba_v1_is_company_admin()
    )
);

drop policy if exists office_merge_audit_admin_write on public.office_merge_audit;
create policy office_merge_audit_admin_write
on public.office_merge_audit
for all
using (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and public.ddumba_v1_is_company_admin()
    )
)
with check (
    public.ddumba_v1_is_service_role()
    or (
        company_id = public.ddumba_v1_current_company_id()
        and public.ddumba_v1_is_company_admin()
    )
);

do $$
declare
    target_table text;
begin
    foreach target_table in array array[
        'offices',
        'landlords',
        'properties',
        'rooms',
        'tenants',
        'leases',
        'collections',
        'promises',
        'expenses',
        'attendance_events',
        'office_daily_reports',
        'landlord_monthly_payables',
        'landlord_monthly_payable_payments',
        'landlord_advances',
        'landlord_debt_deductions',
        'tenant_ledger_entries',
        'notifications',
        'audit_logs',
        'employees',
        'user_office_roles',
        'landlord_summary',
        'office_finance_summary',
        'landlord_search_index'
    ]
    loop
        if to_regclass('public.' || target_table) is not null then
            execute format('alter table public.%I add column if not exists original_office_id uuid references public.offices(id) on delete set null', target_table);
            execute format('alter table public.%I add column if not exists original_office_name text', target_table);
            execute format('alter table public.%I add column if not exists merged_into_office_id uuid references public.offices(id) on delete set null', target_table);
            execute format('alter table public.%I add column if not exists merged_at timestamptz', target_table);
            execute format('alter table public.%I add column if not exists merge_batch_id uuid references public.office_merge_batches(id) on delete set null', target_table);
            execute format('create index if not exists idx_%s_merge_batch on public.%I(merge_batch_id)', target_table, target_table);
            execute format('create index if not exists idx_%s_original_office on public.%I(original_office_id)', target_table, target_table);
        end if;
    end loop;
end $$;
