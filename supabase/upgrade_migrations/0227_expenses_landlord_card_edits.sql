alter table public.landlords
  add column if not exists payment_date date,
  add column if not exists billing_date date;

create table if not exists public.landlord_balance_adjustments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid references public.offices(id) on delete set null,
  landlord_id uuid not null references public.landlords(id) on delete cascade,
  old_balance numeric not null default 0,
  new_balance numeric not null default 0,
  adjustment_amount numeric not null default 0,
  effective_date date not null default current_date,
  reason text not null,
  status text not null default 'approved' check (status in ('pending','approved','rejected')),
  requested_by uuid references public.users(id) on delete set null,
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.landlord_expense_edit_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid references public.offices(id) on delete set null,
  landlord_id uuid not null references public.landlords(id) on delete cascade,
  request_type text not null check (request_type in ('landlord_outstanding_balance_edit','landlord_payment_date_edit','landlord_billing_date_edit')),
  old_value jsonb not null default '{}'::jsonb,
  requested_value jsonb not null default '{}'::jsonb,
  effective_date date,
  effective_month text,
  reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','more_info')),
  requested_by uuid references public.users(id) on delete set null,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  admin_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_landlord_expense_edit_one_pending
  on public.landlord_expense_edit_requests(company_id, landlord_id, request_type)
  where status = 'pending';

create index if not exists idx_landlord_expense_edit_company_status
  on public.landlord_expense_edit_requests(company_id, status, created_at desc);

create index if not exists idx_landlord_expense_edit_office_status
  on public.landlord_expense_edit_requests(office_id, status, created_at desc);

create index if not exists idx_landlord_balance_adjustments_landlord
  on public.landlord_balance_adjustments(company_id, landlord_id, status, effective_date desc, created_at desc);

create or replace function public.ddumba_touch_landlord_expense_edit_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_landlord_expense_edit_requests_updated_at on public.landlord_expense_edit_requests;
create trigger trg_landlord_expense_edit_requests_updated_at
before update on public.landlord_expense_edit_requests
for each row execute function public.ddumba_touch_landlord_expense_edit_requests_updated_at();

create or replace function public.ddumba_touch_landlord_balance_adjustments_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_landlord_balance_adjustments_updated_at on public.landlord_balance_adjustments;
create trigger trg_landlord_balance_adjustments_updated_at
before update on public.landlord_balance_adjustments
for each row execute function public.ddumba_touch_landlord_balance_adjustments_updated_at();

alter table public.landlord_balance_adjustments enable row level security;
alter table public.landlord_expense_edit_requests enable row level security;

drop policy if exists landlord_balance_adjustments_read on public.landlord_balance_adjustments;
create policy landlord_balance_adjustments_read
on public.landlord_balance_adjustments
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

drop policy if exists landlord_balance_adjustments_service_write on public.landlord_balance_adjustments;
create policy landlord_balance_adjustments_service_write
on public.landlord_balance_adjustments
for all
using (public.ddumba_v1_is_service_role())
with check (public.ddumba_v1_is_service_role());

drop policy if exists landlord_expense_edit_requests_read on public.landlord_expense_edit_requests;
create policy landlord_expense_edit_requests_read
on public.landlord_expense_edit_requests
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

drop policy if exists landlord_expense_edit_requests_insert on public.landlord_expense_edit_requests;
create policy landlord_expense_edit_requests_insert
on public.landlord_expense_edit_requests
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

drop policy if exists landlord_expense_edit_requests_admin_update on public.landlord_expense_edit_requests;
create policy landlord_expense_edit_requests_admin_update
on public.landlord_expense_edit_requests
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
