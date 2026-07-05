-- Cash Banking & Office Float compatibility tables.
-- These tables mirror the existing cash_accounts/cash_transactions backbone for office-facing reports.

create table if not exists public.office_cash_balances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete cascade,
  balance_date date not null default current_date,
  money_at_office numeric not null default 0,
  money_banked numeric not null default 0,
  money_received_from_admin numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique(company_id, office_id, balance_date)
);

create table if not exists public.office_cash_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete cascade,
  movement_date date not null default current_date,
  movement_type text not null,
  amount numeric not null check (amount >= 0),
  source_type text,
  source_id uuid,
  reference text,
  notes text,
  recorded_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.bank_deposits (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete cascade,
  transfer_id uuid references public.cash_transfers(id) on delete set null,
  amount numeric not null check (amount > 0),
  deposit_date date not null default current_date,
  deposit_method text not null default 'Bank',
  bank_account_name text not null,
  deposit_reference text,
  notes text,
  recorded_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_cash_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  office_id uuid references public.offices(id) on delete set null,
  transfer_id uuid references public.cash_transfers(id) on delete set null,
  movement_date date not null default current_date,
  movement_type text not null,
  source text not null default 'bank',
  amount numeric not null check (amount > 0),
  reference text,
  notes text,
  recorded_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_office_cash_balances_scope on public.office_cash_balances(company_id, office_id, balance_date desc);
create index if not exists idx_office_cash_movements_scope on public.office_cash_movements(company_id, office_id, movement_date desc);
create index if not exists idx_bank_deposits_scope on public.bank_deposits(company_id, office_id, deposit_date desc);
create index if not exists idx_admin_cash_movements_scope on public.admin_cash_movements(company_id, office_id, movement_date desc);

alter table public.office_cash_balances enable row level security;
alter table public.office_cash_movements enable row level security;
alter table public.bank_deposits enable row level security;
alter table public.admin_cash_movements enable row level security;

drop policy if exists office_cash_balances_read_scope on public.office_cash_balances;
create policy office_cash_balances_read_scope on public.office_cash_balances
for select using (
  public.is_service_role()
  or (
    company_id = public.current_company_id()
    and (
      public.has_permission('cash.manage')
      or public.has_permission('cash.read')
    )
  )
);

drop policy if exists office_cash_balances_service_write on public.office_cash_balances;
create policy office_cash_balances_service_write on public.office_cash_balances
for all using (public.is_service_role())
with check (public.is_service_role());

drop policy if exists office_cash_movements_read_scope on public.office_cash_movements;
create policy office_cash_movements_read_scope on public.office_cash_movements
for select using (
  public.is_service_role()
  or (
    company_id = public.current_company_id()
    and (public.has_permission('cash.read') or public.has_permission('cash.manage'))
  )
);

drop policy if exists office_cash_movements_service_write on public.office_cash_movements;
create policy office_cash_movements_service_write on public.office_cash_movements
for all using (public.is_service_role())
with check (public.is_service_role());

drop policy if exists bank_deposits_read_scope on public.bank_deposits;
create policy bank_deposits_read_scope on public.bank_deposits
for select using (
  public.is_service_role()
  or (
    company_id = public.current_company_id()
    and (public.has_permission('cash.read') or public.has_permission('cash.manage'))
  )
);

drop policy if exists bank_deposits_service_write on public.bank_deposits;
create policy bank_deposits_service_write on public.bank_deposits
for all using (public.is_service_role())
with check (public.is_service_role());

drop policy if exists admin_cash_movements_read_scope on public.admin_cash_movements;
create policy admin_cash_movements_read_scope on public.admin_cash_movements
for select using (
  public.is_service_role()
  or (
    company_id = public.current_company_id()
    and public.has_permission('cash.read')
  )
);

drop policy if exists admin_cash_movements_service_write on public.admin_cash_movements;
create policy admin_cash_movements_service_write on public.admin_cash_movements
for all using (public.is_service_role())
with check (public.is_service_role());
