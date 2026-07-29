-- Admin approval for non-Admin office expenses.
-- Additive only: existing approved expenses and cash ledgers are preserved.

alter table public.expenses
    add column if not exists rejected_by uuid references public.users(id) on delete set null,
    add column if not exists rejected_at timestamptz,
    add column if not exists rejection_reason text,
    add column if not exists cash_source_type text,
    add column if not exists cash_source_id uuid,
    add column if not exists supporting_document text;

update public.expenses
set status = 'approved'
where approved_at is not null
  and lower(coalesce(status, 'pending')) not in ('approved','rejected','cancelled','canceled','reversed','deleted');

update public.expenses
set status = 'rejected'
where lower(coalesce(description, '')) like '%[rejected]%'
  and lower(coalesce(status, 'pending')) = 'pending';

create index if not exists idx_expenses_company_status_office_date
    on public.expenses(company_id, status, office_id, expense_date desc, created_at desc);

create index if not exists idx_expenses_pending_admin_queue
    on public.expenses(company_id, office_id, created_at desc)
    where lower(coalesce(status, 'pending')) = 'pending';

create index if not exists idx_expenses_approved_cash_position
    on public.expenses(company_id, office_id, expense_date desc, created_at desc)
    where lower(coalesce(status, 'pending')) = 'approved';

