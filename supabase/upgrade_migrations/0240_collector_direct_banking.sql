create extension if not exists pgcrypto;

insert into storage.buckets (id, name, public)
values ('collector-bank-slips', 'collector-bank-slips', false)
on conflict (id) do update set public = false;

create table if not exists public.collector_banking_submissions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid references public.offices(id) on delete set null,
  collector_user_id uuid not null references public.users(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  banking_date date not null,
  bank_name text not null,
  destination_account text,
  deposit_reference text not null,
  slip_file_path text not null,
  slip_original_name text not null,
  slip_mime_type text not null,
  slip_file_size bigint not null check (slip_file_size > 0),
  slip_checksum text,
  slip_uploaded_by uuid references public.users(id) on delete set null,
  slip_uploaded_at timestamptz not null default now(),
  notes text,
  status text not null default 'pending_verification'
    check (status in ('pending_verification','verified','rejected','needs_clearer_image','correction_requested','cancelled')),
  submitted_by uuid references public.users(id) on delete set null,
  submitted_at timestamptz not null default now(),
  verified_by uuid references public.users(id) on delete set null,
  verified_at timestamptz,
  rejected_by uuid references public.users(id) on delete set null,
  rejected_at timestamptz,
  rejection_reason text,
  admin_comment text,
  cash_before_submission numeric(14,2) not null default 0,
  reserved_amount numeric(14,2) not null default 0,
  duplicate_key text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.field_collector_cash_movements
  add column if not exists collector_banking_submission_id uuid references public.collector_banking_submissions(id) on delete set null;

alter table public.field_collector_cash_movements
  drop constraint if exists field_collector_cash_movements_movement_type_check;

alter table public.field_collector_cash_movements
  add constraint field_collector_cash_movements_movement_type_check
  check (movement_type in ('collection_in','submission_pending','submission_approved','submission_rejected','banking_verified','adjustment'));

create index if not exists idx_collector_banking_company_status_date
  on public.collector_banking_submissions(company_id, status, banking_date desc, created_at desc);

create index if not exists idx_collector_banking_collector_date
  on public.collector_banking_submissions(company_id, collector_user_id, banking_date desc);

create index if not exists idx_collector_banking_office_date
  on public.collector_banking_submissions(company_id, office_id, banking_date desc);

create unique index if not exists idx_collector_banking_unique_idempotency
  on public.collector_banking_submissions(company_id, idempotency_key)
  where idempotency_key is not null;

create unique index if not exists idx_collector_banking_unique_verified_source
  on public.cash_transactions(company_id, source_type, source_id)
  where source_type = 'collector_bank_deposit';

alter table public.collector_banking_submissions enable row level security;

drop policy if exists collector_banking_select on public.collector_banking_submissions;
create policy collector_banking_select
on public.collector_banking_submissions
for select
using (
  public.ddumba_v1_is_service_role()
  or public.ddumba_v1_is_company_admin()
  or collector_user_id = auth.uid()
  or exists (
    select 1
    from public.user_office_roles uor
    join public.users u on u.id = uor.user_id
    where u.id = auth.uid()
      and u.company_id = collector_banking_submissions.company_id
      and uor.office_id = collector_banking_submissions.office_id
  )
);

drop policy if exists collector_banking_insert on public.collector_banking_submissions;
create policy collector_banking_insert
on public.collector_banking_submissions
for insert
with check (
  public.ddumba_v1_is_service_role()
  or collector_user_id = auth.uid()
);

drop policy if exists collector_banking_update on public.collector_banking_submissions;
create policy collector_banking_update
on public.collector_banking_submissions
for update
using (
  public.ddumba_v1_is_service_role()
  or public.ddumba_v1_is_company_admin()
)
with check (
  public.ddumba_v1_is_service_role()
  or public.ddumba_v1_is_company_admin()
);

drop policy if exists collector_bank_slips_service on storage.objects;
create policy collector_bank_slips_service
on storage.objects
for all
using (
  bucket_id = 'collector-bank-slips'
  and public.ddumba_v1_is_service_role()
)
with check (
  bucket_id = 'collector-bank-slips'
  and public.ddumba_v1_is_service_role()
);
