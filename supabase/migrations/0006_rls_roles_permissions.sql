-- Phase 3: RLS helper functions, role model, permission model, and policies.

create or replace function public.current_company_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select u.company_id
  from public.users u
  where u.id = auth.uid()
$$;

create or replace function public.is_service_role()
returns boolean
language sql
stable
as $$
  select coalesce(auth.role(), '') = 'service_role'
$$;

create or replace function public.has_permission(permission_key text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.user_office_roles uor
    join public.role_permissions rp on rp.role_id = uor.role_id
    join public.permissions p on p.id = rp.permission_id
    where uor.user_id = auth.uid()
      and p.key = permission_key
  )
$$;

create or replace function public.is_company_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.user_office_roles uor
    join public.roles r on r.id = uor.role_id
    where uor.user_id = auth.uid()
      and uor.office_id is null
      and r.key in ('company_admin','super_admin','hq_executive')
  )
$$;

create or replace function public.can_access_office(target_office_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select target_office_id is null
    or public.is_company_admin()
    or exists (
      select 1
      from public.user_office_roles uor
      where uor.user_id = auth.uid()
        and (uor.office_id = target_office_id or uor.office_id is null)
    )
$$;

create or replace function public.can_manage_office(target_office_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_company_admin()
    or exists (
      select 1
      from public.user_office_roles uor
      join public.role_permissions rp on rp.role_id = uor.role_id
      join public.permissions p on p.id = rp.permission_id
      where uor.user_id = auth.uid()
        and (uor.office_id = target_office_id or uor.office_id is null)
        and p.key in ('office.manage','operations.manage')
    )
$$;

create or replace function public.can_access_entity(entity_company_id uuid, entity_office_id uuid)
returns boolean
language sql
stable
as $$
  select public.is_service_role()
    or (
      entity_company_id = public.current_company_id()
      and public.can_access_office(entity_office_id)
    )
$$;

do $$
declare
  t text;
begin
  for t in
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_type = 'BASE TABLE'
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

-- Direct policies for tenancy/identity bootstrap tables.
drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies
for select
using (public.is_service_role() or id = public.current_company_id());

drop policy if exists companies_admin_update on public.companies;
create policy companies_admin_update on public.companies
for update
using (public.is_service_role() or (id = public.current_company_id() and public.is_company_admin()))
with check (public.is_service_role() or (id = public.current_company_id() and public.is_company_admin()));

drop policy if exists users_self_or_admin_select on public.users;
create policy users_self_or_admin_select on public.users
for select
using (public.is_service_role() or id = auth.uid() or (company_id = public.current_company_id() and public.is_company_admin()));

drop policy if exists users_admin_manage on public.users;
create policy users_admin_manage on public.users
for all
using (public.is_service_role() or (company_id = public.current_company_id() and public.is_company_admin()))
with check (public.is_service_role() or (company_id = public.current_company_id() and public.is_company_admin()));

drop policy if exists user_roles_select on public.user_office_roles;
create policy user_roles_select on public.user_office_roles
for select
using (public.is_service_role() or user_id = auth.uid() or (company_id = public.current_company_id() and public.is_company_admin()));

drop policy if exists role_permission_read on public.permissions;
create policy role_permission_read on public.permissions
for select
using (auth.role() = 'authenticated' or public.is_service_role());

-- Append-oriented tables: authenticated users can read scoped rows; service role or permitted server paths insert.
do $$
declare
  t text;
  has_office boolean;
begin
  foreach t in array array[
    'audit_logs','security_events','tenant_ledger_entries','cash_transactions','receipts',
    'external_transactions','payment_provider_webhook_events','message_delivery_events',
    'communication_provider_logs','report_access_logs'
  ]
  loop
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'office_id'
    ) into has_office;

    execute format('drop policy if exists %I on public.%I', t || '_append_select', t);
    if has_office then
      execute format(
        'create policy %I on public.%I for select using (public.can_access_entity(company_id, office_id))',
        t || '_append_select',
        t
      );
    else
      execute format(
        'create policy %I on public.%I for select using (public.is_service_role() or company_id = public.current_company_id())',
        t || '_append_select',
        t
      );
    end if;

    execute format('drop policy if exists %I on public.%I', t || '_append_insert', t);
    if has_office then
      execute format(
        'create policy %I on public.%I for insert with check (public.is_service_role() or public.can_access_entity(company_id, office_id))',
        t || '_append_insert',
        t
      );
    else
      execute format(
        'create policy %I on public.%I for insert with check (public.is_service_role() or company_id = public.current_company_id())',
        t || '_append_insert',
        t
      );
    end if;
  end loop;
end;
$$;

-- Generic company/office scoped policies for all remaining company-owned tables.
do $$
declare
  t text;
  has_company boolean;
  has_office boolean;
  append_only_tables text[] := array[
    'audit_logs','security_events','tenant_ledger_entries','cash_transactions','receipts',
    'external_transactions','payment_provider_webhook_events','message_delivery_events',
    'communication_provider_logs','report_access_logs','companies','users','permissions','user_office_roles',
    'payments','payment_allocations','landlord_settlements','landlord_payouts','cash_transfers',
    'withdrawal_requests','expenses','payroll_runs','payroll_items'
  ];
begin
  for t in
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_type = 'BASE TABLE'
      and not (table_name = any(append_only_tables))
  loop
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'company_id'
    ) into has_company;

    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'office_id'
    ) into has_office;

    if has_company and has_office then
      execute format('drop policy if exists %I on public.%I', t || '_office_read', t);
      execute format(
        'create policy %I on public.%I for select using (public.can_access_entity(company_id, office_id))',
        t || '_office_read',
        t
      );

      execute format('drop policy if exists %I on public.%I', t || '_office_insert', t);
      execute format(
        'create policy %I on public.%I for insert with check (public.can_access_entity(company_id, office_id))',
        t || '_office_insert',
        t
      );

      execute format('drop policy if exists %I on public.%I', t || '_office_update', t);
      execute format(
        'create policy %I on public.%I for update using (public.can_access_entity(company_id, office_id)) with check (public.can_access_entity(company_id, office_id))',
        t || '_office_update',
        t
      );
    elsif has_company then
      execute format('drop policy if exists %I on public.%I', t || '_company_read', t);
      execute format(
        'create policy %I on public.%I for select using (public.is_service_role() or company_id = public.current_company_id())',
        t || '_company_read',
        t
      );

      execute format('drop policy if exists %I on public.%I', t || '_company_insert', t);
      execute format(
        'create policy %I on public.%I for insert with check (public.is_service_role() or company_id = public.current_company_id())',
        t || '_company_insert',
        t
      );

      execute format('drop policy if exists %I on public.%I', t || '_company_update', t);
      execute format(
        'create policy %I on public.%I for update using (public.is_service_role() or company_id = public.current_company_id()) with check (public.is_service_role() or company_id = public.current_company_id())',
        t || '_company_update',
        t
      );
    end if;
  end loop;
end;
$$;

-- Finance-sensitive management policies are intentionally stricter for direct client writes.
-- Application server functions should use service role for final posting/reversal operations.
drop policy if exists payments_finance_read on public.payments;
create policy payments_finance_read on public.payments
for select
using (
  public.is_service_role()
  or (
    company_id = public.current_company_id()
    and public.can_access_office(office_id)
    and public.has_permission('collections.read')
  )
);

drop policy if exists payments_finance_insert on public.payments;
create policy payments_finance_insert on public.payments
for insert
with check (
  public.is_service_role()
  or (
    company_id = public.current_company_id()
    and public.can_access_office(office_id)
    and public.has_permission('collections.payment.post')
  )
);

drop policy if exists payments_finance_update on public.payments;
create policy payments_finance_update on public.payments
for update
using (
  public.is_service_role()
  or (
    company_id = public.current_company_id()
    and public.can_access_office(office_id)
    and public.has_permission('collections.payment.post')
  )
)
with check (
  public.is_service_role()
  or (
    company_id = public.current_company_id()
    and public.can_access_office(office_id)
    and public.has_permission('collections.payment.post')
  )
);

drop policy if exists payment_allocations_finance_read on public.payment_allocations;
create policy payment_allocations_finance_read on public.payment_allocations
for select
using (public.is_service_role() or company_id = public.current_company_id() and public.has_permission('collections.read'));

drop policy if exists payment_allocations_finance_insert on public.payment_allocations;
create policy payment_allocations_finance_insert on public.payment_allocations
for insert
with check (public.is_service_role() or company_id = public.current_company_id() and public.has_permission('collections.payment.post'));

drop policy if exists ledger_service_insert on public.tenant_ledger_entries;
create policy ledger_service_insert on public.tenant_ledger_entries
for insert
with check (public.is_service_role());

drop policy if exists landlord_settlements_finance_read on public.landlord_settlements;
create policy landlord_settlements_finance_read on public.landlord_settlements
for select
using (public.is_service_role() or company_id = public.current_company_id() and public.has_permission('landlords.read'));

drop policy if exists landlord_settlements_finance_write on public.landlord_settlements;
create policy landlord_settlements_finance_write on public.landlord_settlements
for all
using (public.is_service_role() or company_id = public.current_company_id() and public.has_permission('landlords.manage'))
with check (public.is_service_role() or company_id = public.current_company_id() and public.has_permission('landlords.manage'));

drop policy if exists landlord_payouts_finance_read on public.landlord_payouts;
create policy landlord_payouts_finance_read on public.landlord_payouts
for select
using (public.is_service_role() or company_id = public.current_company_id() and public.has_permission('landlords.read'));

drop policy if exists landlord_payouts_finance_write on public.landlord_payouts;
create policy landlord_payouts_finance_write on public.landlord_payouts
for all
using (public.is_service_role() or company_id = public.current_company_id() and public.has_permission('landlords.manage'))
with check (public.is_service_role() or company_id = public.current_company_id() and public.has_permission('landlords.manage'));

drop policy if exists cash_transfers_finance_read on public.cash_transfers;
create policy cash_transfers_finance_read on public.cash_transfers
for select
using (public.is_service_role() or company_id = public.current_company_id() and public.has_permission('cash.read'));

drop policy if exists cash_transfers_finance_write on public.cash_transfers;
create policy cash_transfers_finance_write on public.cash_transfers
for all
using (public.is_service_role() or company_id = public.current_company_id() and public.has_permission('cash.manage'))
with check (public.is_service_role() or company_id = public.current_company_id() and public.has_permission('cash.manage'));

drop policy if exists withdrawal_requests_finance_read on public.withdrawal_requests;
create policy withdrawal_requests_finance_read on public.withdrawal_requests
for select
using (public.is_service_role() or company_id = public.current_company_id() and public.has_permission('cash.read'));

drop policy if exists withdrawal_requests_finance_write on public.withdrawal_requests;
create policy withdrawal_requests_finance_write on public.withdrawal_requests
for all
using (public.is_service_role() or company_id = public.current_company_id() and public.has_permission('cash.manage'))
with check (public.is_service_role() or company_id = public.current_company_id() and public.has_permission('cash.manage'));

drop policy if exists expenses_finance_read on public.expenses;
create policy expenses_finance_read on public.expenses
for select
using (
  public.is_service_role()
  or (
    company_id = public.current_company_id()
    and public.can_access_office(office_id)
    and public.has_permission('expenses.read')
  )
);

drop policy if exists expenses_finance_insert on public.expenses;
create policy expenses_finance_insert on public.expenses
for insert
with check (
  public.is_service_role()
  or (
    company_id = public.current_company_id()
    and public.can_access_office(office_id)
    and public.has_permission('expenses.manage')
  )
);

drop policy if exists expenses_finance_update on public.expenses;
create policy expenses_finance_update on public.expenses
for update
using (
  public.is_service_role()
  or (
    company_id = public.current_company_id()
    and public.can_access_office(office_id)
    and public.has_permission('expenses.approve')
  )
)
with check (
  public.is_service_role()
  or (
    company_id = public.current_company_id()
    and public.can_access_office(office_id)
    and public.has_permission('expenses.approve')
  )
);

drop policy if exists payroll_runs_finance_read on public.payroll_runs;
create policy payroll_runs_finance_read on public.payroll_runs
for select
using (public.is_service_role() or company_id = public.current_company_id() and public.has_permission('payroll.read'));

drop policy if exists payroll_runs_finance_write on public.payroll_runs;
create policy payroll_runs_finance_write on public.payroll_runs
for all
using (public.is_service_role() or company_id = public.current_company_id() and public.has_permission('payroll.manage'))
with check (public.is_service_role() or company_id = public.current_company_id() and public.has_permission('payroll.manage'));

drop policy if exists payroll_items_finance_read on public.payroll_items;
create policy payroll_items_finance_read on public.payroll_items
for select
using (public.is_service_role() or company_id = public.current_company_id() and public.has_permission('payroll.read'));

drop policy if exists payroll_items_finance_write on public.payroll_items;
create policy payroll_items_finance_write on public.payroll_items
for all
using (public.is_service_role() or company_id = public.current_company_id() and public.has_permission('payroll.manage'))
with check (public.is_service_role() or company_id = public.current_company_id() and public.has_permission('payroll.manage'));
