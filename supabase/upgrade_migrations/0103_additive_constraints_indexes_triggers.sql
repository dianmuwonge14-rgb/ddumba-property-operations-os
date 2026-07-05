-- Additive constraints, indexes, and triggers for the non-destructive enterprise upgrade.
-- Rules: no DROP TABLE, no DROP COLUMN, no DELETE, no TRUNCATE.

create or replace function public.ddumba_v1_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.ddumba_v1_prevent_change_on_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Table % is append-only and cannot be updated or removed', tg_table_name;
end;
$$;

create or replace function public.ddumba_v1_audit_table_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_company_id uuid;
  row_office_id uuid;
  row_entity_id uuid;
begin
  row_entity_id := coalesce((to_jsonb(new)->>'id')::uuid, (to_jsonb(old)->>'id')::uuid);

  if tg_table_name = 'companies' then
    row_company_id := row_entity_id;
  else
    row_company_id := coalesce(nullif(to_jsonb(new)->>'company_id','')::uuid, nullif(to_jsonb(old)->>'company_id','')::uuid);
  end if;

  row_office_id := coalesce(nullif(to_jsonb(new)->>'office_id','')::uuid, nullif(to_jsonb(old)->>'office_id','')::uuid);

  if row_company_id is null then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  insert into public.audit_logs (
    company_id,
    office_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    before_data,
    after_data
  )
  values (
    row_company_id,
    row_office_id,
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    row_entity_id,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'companies','offices','landlords','properties','rooms','tenants','employees',
    'collections','promises','expenses','attendance','landlord_payments',
    'cash_position','office_scores','ai_insights','company_settings','office_settings',
    'leases','rent_invoices','payments','cash_accounts','cash_reconciliations',
    'landlord_settlements','landlord_payouts','field_agents','field_visits',
    'property_inspections','attendance_daily_summaries','attendance_corrections',
    'payroll_profiles','reports','automation_rules'
  ]
  loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = tbl and column_name = 'updated_at'
    )
    and not exists (
      select 1 from pg_trigger
      where tgname = 'trg_ddumba_v1_' || tbl || '_updated_at'
    ) then
      execute format(
        'create trigger %I before update on public.%I for each row execute function public.ddumba_v1_set_updated_at()',
        'trg_ddumba_v1_' || tbl || '_updated_at',
        tbl
      );
    end if;
  end loop;
end;
$$;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'companies','offices','landlords','properties','rooms','tenants','employees',
    'collections','promises','expenses','attendance','landlord_payments',
    'leases','rent_invoices','payments','tenant_ledger_entries','cash_transactions',
    'cash_reconciliations','landlord_settlements','landlord_payouts',
    'attendance_events','payroll_runs','payroll_items','messages','ai_insights'
  ]
  loop
    if not exists (
      select 1 from pg_trigger
      where tgname = 'trg_ddumba_v1_' || tbl || '_audit'
    ) then
      execute format(
        'create trigger %I after insert or update on public.%I for each row execute function public.ddumba_v1_audit_table_change()',
        'trg_ddumba_v1_' || tbl || '_audit',
        tbl
      );
    end if;
  end loop;
end;
$$;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'audit_logs','security_events','tenant_ledger_entries','cash_transactions','receipts',
    'external_transactions','payment_provider_webhook_events','message_delivery_events',
    'communication_provider_logs','report_access_logs'
  ]
  loop
    if not exists (
      select 1 from pg_trigger
      where tgname = 'trg_ddumba_v1_' || tbl || '_append_only'
    ) then
      execute format(
        'create trigger %I before update on public.%I for each row execute function public.ddumba_v1_prevent_change_on_append_only()',
        'trg_ddumba_v1_' || tbl || '_append_only',
        tbl
      );
    end if;
  end loop;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'collections_lease_id_fkey_v1') then
    alter table public.collections
      add constraint collections_lease_id_fkey_v1
      foreign key (lease_id) references public.leases(id) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'promises_lease_id_fkey_v1') then
    alter table public.promises
      add constraint promises_lease_id_fkey_v1
      foreign key (lease_id) references public.leases(id) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'landlord_payments_settlement_id_fkey_v1') then
    alter table public.landlord_payments
      add constraint landlord_payments_settlement_id_fkey_v1
      foreign key (settlement_id) references public.landlord_settlements(id) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'expenses_category_id_fkey_v1') then
    alter table public.expenses
      add constraint expenses_category_id_fkey_v1
      foreign key (category_id) references public.expense_categories(id) not valid;
  end if;
end;
$$;

create index if not exists idx_ddumba_v1_offices_company_id on public.offices(company_id);
create index if not exists idx_ddumba_v1_offices_company_code on public.offices(company_id, code);
create index if not exists idx_ddumba_v1_landlords_company_id on public.landlords(company_id);
create index if not exists idx_ddumba_v1_properties_company_office on public.properties(company_id, office_id);
create index if not exists idx_ddumba_v1_properties_company_code on public.properties(company_id, code);
create index if not exists idx_ddumba_v1_rooms_company_office on public.rooms(company_id, office_id);
create index if not exists idx_ddumba_v1_rooms_property_status on public.rooms(property_id, status);
create index if not exists idx_ddumba_v1_tenants_company_office on public.tenants(company_id, office_id);
create index if not exists idx_ddumba_v1_tenants_room_id on public.tenants(room_id);
create index if not exists idx_ddumba_v1_employees_company_office on public.employees(company_id, office_id);
create index if not exists idx_ddumba_v1_leases_tenant_status on public.leases(tenant_id, status);
create index if not exists idx_ddumba_v1_leases_room_status on public.leases(room_id, status);
create index if not exists idx_ddumba_v1_rent_invoices_tenant_status on public.rent_invoices(tenant_id, status);
create index if not exists idx_ddumba_v1_payments_tenant_paid_at on public.payments(tenant_id, paid_at desc);
create index if not exists idx_ddumba_v1_collections_company_office on public.collections(company_id, office_id);
create index if not exists idx_ddumba_v1_promises_company_status_date on public.promises(company_id, status, promised_date);
create index if not exists idx_ddumba_v1_expenses_office_date on public.expenses(office_id, expense_date desc);
create index if not exists idx_ddumba_v1_attendance_employee_date on public.attendance(employee_id, work_date desc);
create index if not exists idx_ddumba_v1_cash_transactions_account_date on public.cash_transactions(cash_account_id, transaction_date desc);
create index if not exists idx_ddumba_v1_audit_logs_company_created on public.audit_logs(company_id, created_at desc);
create index if not exists idx_ddumba_v1_ai_insights_company_status on public.ai_insights(company_id, status, severity);
