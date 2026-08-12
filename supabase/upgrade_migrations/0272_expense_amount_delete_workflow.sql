-- Phase 272: Expense amount correction and deletion/reversal workflow.
-- Additive only: deleted expenses keep their original row and amount for audit.

alter table public.expenses
  add column if not exists financial_effective boolean not null default true,
  add column if not exists reversed_at timestamptz,
  add column if not exists reversed_by uuid references public.users(id) on delete set null;

alter table public.expense_change_requests
  add column if not exists proof_url text;

create index if not exists idx_expenses_company_financial_effective_date
  on public.expenses(company_id, financial_effective, expense_date desc);

create index if not exists idx_expenses_office_financial_effective_date
  on public.expenses(company_id, office_id, financial_effective, expense_date desc);

create unique index if not exists idx_expense_change_requests_one_pending_financial_change
  on public.expense_change_requests(expense_id)
  where status = 'pending'
    and change_type in ('amount_change', 'delete_request');

comment on column public.expenses.financial_effective is
  'False when an expense has been deleted/reversed and must no longer affect active expense totals, cash position, reports, or profit calculations.';

comment on column public.expenses.reversed_at is
  'Timestamp when an expense was financially reversed without deleting audit history.';

comment on column public.expense_change_requests.proof_url is
  'Optional supporting proof reference for amount correction or deletion requests.';
