-- Phase 194: Expense correction requests and responsible employee metadata.
-- Additive only. Admin can edit expenses directly; office/collector users submit requests.

alter table public.expenses
  add column if not exists employee_id uuid references public.employees(id) on delete set null,
  add column if not exists responsible_account_id uuid references public.users(id) on delete set null,
  add column if not exists payment_method text,
  add column if not exists status text not null default 'approved',
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.users(id) on delete set null,
  add column if not exists delete_reason text;

create index if not exists idx_expenses_company_status_date
  on public.expenses(company_id, status, expense_date desc);

create index if not exists idx_expenses_employee_date
  on public.expenses(company_id, employee_id, expense_date desc)
  where employee_id is not null;

create table if not exists public.expense_change_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid references public.offices(id) on delete set null,
  expense_id uuid not null references public.expenses(id) on delete cascade,
  change_type text not null default 'general_edit' check (
    change_type in (
      'general_edit',
      'amount_change',
      'date_change',
      'category_change',
      'employee_assignment',
      'office_change',
      'payment_method_change',
      'notes_change',
      'receipt_change',
      'status_change',
      'delete_request'
    )
  ),
  original_value jsonb not null default '{}'::jsonb,
  requested_value jsonb not null default '{}'::jsonb,
  reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_by uuid references public.users(id) on delete set null,
  requested_by_account_type text,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  admin_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_expense_change_requests_one_pending
  on public.expense_change_requests(expense_id, change_type)
  where status = 'pending';

create index if not exists idx_expense_change_requests_company_status
  on public.expense_change_requests(company_id, status, created_at desc);

create index if not exists idx_expense_change_requests_office_status
  on public.expense_change_requests(office_id, status, created_at desc);

create index if not exists idx_expense_change_requests_expense
  on public.expense_change_requests(expense_id, created_at desc);

create or replace function public.ddumba_touch_expense_change_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_expense_change_requests_updated_at on public.expense_change_requests;
create trigger trg_expense_change_requests_updated_at
before update on public.expense_change_requests
for each row execute function public.ddumba_touch_expense_change_requests_updated_at();

alter table public.expense_change_requests enable row level security;

drop policy if exists expense_change_requests_read on public.expense_change_requests;
create policy expense_change_requests_read
on public.expense_change_requests
for select
using (
  public.ddumba_v1_is_service_role()
  or (
    company_id = public.ddumba_v1_current_company_id()
    and (
      public.ddumba_v1_is_company_admin()
      or public.ddumba_v1_can_access_office(office_id)
      or requested_by = auth.uid()
    )
  )
);

drop policy if exists expense_change_requests_insert on public.expense_change_requests;
create policy expense_change_requests_insert
on public.expense_change_requests
for insert
with check (
  public.ddumba_v1_is_service_role()
  or (
    company_id = public.ddumba_v1_current_company_id()
    and (
      public.ddumba_v1_is_company_admin()
      or public.ddumba_v1_can_access_office(office_id)
      or requested_by = auth.uid()
    )
  )
);

drop policy if exists expense_change_requests_admin_update on public.expense_change_requests;
create policy expense_change_requests_admin_update
on public.expense_change_requests
for update
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
