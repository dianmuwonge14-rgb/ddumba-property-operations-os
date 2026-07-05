-- Stabilize Employee Management support reads before deployment.
-- Additive only: creates optional support tables used by the employee profile page.

create table if not exists public.employee_bonuses (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    employee_id uuid not null references public.employees(id) on delete cascade,
    month_key date not null,
    amount numeric(14,2) not null default 0 check (amount >= 0),
    reason text,
    bonus_date date not null default current_date,
    status text not null default 'active',
    active boolean not null default true,
    created_by uuid references public.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.employee_documents (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    employee_id uuid not null references public.employees(id) on delete cascade,
    document_type text not null default 'document',
    file_name text not null default 'Document',
    file_path text,
    file_url text,
    notes text,
    active boolean not null default true,
    uploaded_by uuid references public.users(id) on delete set null,
    created_at timestamptz not null default now()
);

create table if not exists public.employee_performance_scores (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    office_id uuid references public.offices(id) on delete set null,
    employee_id uuid not null references public.employees(id) on delete cascade,
    month_key date not null,
    score numeric(6,2) not null default 0,
    attendance_punctuality numeric(6,2) not null default 0,
    days_present integer not null default 0,
    collections_handled integer not null default 0,
    promises_followed integer not null default 0,
    reports_submitted integer not null default 0,
    fines_count integer not null default 0,
    warnings_count integer not null default 0,
    office_manager_score numeric(6,2) not null default 0,
    task_completion numeric(6,2) not null default 0,
    strengths text,
    issues text,
    ai_recommendation text,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(company_id, employee_id, month_key)
);

create index if not exists idx_employee_bonuses_month
    on public.employee_bonuses(company_id, office_id, employee_id, month_key, active);
create index if not exists idx_employee_documents_employee
    on public.employee_documents(company_id, employee_id, document_type, active);
create index if not exists idx_employee_performance_scores_rank
    on public.employee_performance_scores(company_id, office_id, month_key, score desc);

alter table public.employee_bonuses enable row level security;
alter table public.employee_documents enable row level security;
alter table public.employee_performance_scores enable row level security;

do $$
declare
    table_name text;
begin
    foreach table_name in array array[
        'employee_bonuses',
        'employee_documents',
        'employee_performance_scores'
    ] loop
        execute format('drop policy if exists %I_admin_all on public.%I', table_name, table_name);
        execute format(
            'create policy %I_admin_all on public.%I for all using (
                public.ddumba_v1_is_service_role()
                or (%I.company_id = public.ddumba_v1_current_company_id() and public.ddumba_v1_is_company_admin())
            ) with check (
                public.ddumba_v1_is_service_role()
                or (%I.company_id = public.ddumba_v1_current_company_id() and public.ddumba_v1_is_company_admin())
            )',
            table_name,
            table_name,
            table_name,
            table_name
        );

        execute format('drop policy if exists %I_office_read on public.%I', table_name, table_name);
        execute format(
            'create policy %I_office_read on public.%I for select using (
                %I.company_id = public.ddumba_v1_current_company_id()
                and (%I.office_id is null or public.ddumba_v1_can_access_office(%I.office_id))
            )',
            table_name,
            table_name,
            table_name,
            table_name,
            table_name
        );
    end loop;
end $$;
