-- Phase 254: Admin-only financial-entry backdating with reason and audit metadata.

insert into public.permissions(key, name, description, category)
values (
  'financial_entries.backdate',
  'Backdate financial entries',
  'Allows the true Admin account to create financial entries using a past Kampala business date with a mandatory reason.',
  'finance'
)
on conflict (key) do nothing;

insert into public.role_permissions(role_id, permission_id, created_at)
select r.id, p.id, now()
from public.roles r
join public.permissions p on p.key = 'financial_entries.backdate'
where r.key in ('company_admin', 'super_admin', 'hq_executive')
on conflict (role_id, permission_id) do nothing;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'collections',
    'tenant_security_deposits',
    'expenses',
    'employee_expenses',
    'employee_expense_requests',
    'landlord_payment_expense_requests',
    'treasury_cash_requests',
    'bank_deposits',
    'admin_cash_movements',
    'office_cash_movements',
    'cash_transactions',
    'employee_salary_payments',
    'salary_payments'
  ]
  loop
    if to_regclass('public.' || v_table) is not null then
      execute format('alter table public.%I add column if not exists backdating_reason text', v_table);
      execute format('alter table public.%I add column if not exists entered_on_date date', v_table);
      execute format('alter table public.%I add column if not exists backdated_by uuid references public.users(id) on delete set null', v_table);
      execute format('alter table public.%I add column if not exists cash_reconciliation_marker text', v_table);
      execute format('alter table public.%I add column if not exists audit_reference text', v_table);
    end if;
  end loop;
end $$;

create or replace function public.ddumba_financial_entry_uuid(value text)
returns uuid
language plpgsql
immutable
as $$
begin
  if value is null or value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return null;
  end if;
  return value::uuid;
end;
$$;

create or replace function public.ddumba_v1_actor_is_company_admin(p_actor_id uuid, p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_office_roles uor
    join public.roles r on r.id = uor.role_id
    where uor.user_id = p_actor_id
      and uor.company_id = p_company_id
      and coalesce(uor.status, 'active') = 'active'
      and coalesce(uor.effective_from, now() - interval '100 years') <= now()
      and (uor.effective_to is null or uor.effective_to >= now())
      and r.key in ('company_admin', 'super_admin', 'hq_executive')
  );
$$;

create or replace function public.ddumba_enforce_financial_entry_date()
returns trigger
language plpgsql
as $$
declare
  v_actor uuid;
  v_column text := tg_argv[0];
  v_company_id uuid;
  v_date date;
  v_message text := coalesce(tg_argv[1], 'Financial entries can only be recorded for the current date.');
  v_reason text;
  v_row jsonb := to_jsonb(new);
  v_today date := public.ddumba_current_business_date();
begin
  execute format('select ($1).%I::date', v_column) using new into v_date;
  if v_date is null then
    raise exception '% date is required.', initcap(replace(v_column, '_', ' ')) using errcode = '22023';
  end if;

  if v_date > v_today then
    raise exception 'Future-dated entries are not permitted.' using errcode = '22023';
  end if;

  if v_date = v_today then
    return new;
  end if;

  v_company_id := public.ddumba_financial_entry_uuid(v_row ->> 'company_id');
  v_actor := coalesce(
    public.ddumba_financial_entry_uuid(v_row ->> 'backdated_by'),
    public.ddumba_financial_entry_uuid(v_row ->> 'recorded_by'),
    public.ddumba_financial_entry_uuid(v_row ->> 'submitted_by'),
    public.ddumba_financial_entry_uuid(v_row ->> 'created_by'),
    public.ddumba_financial_entry_uuid(v_row ->> 'approved_by')
  );
  v_reason := nullif(btrim(coalesce(
    v_row ->> 'backdating_reason',
    substring(coalesce(v_row ->> 'notes', v_row ->> 'description', '') from 'BACKDATED ADMIN ENTRY\s*\|\s*Entered on:\s*[^|]+\|\s*Reason:\s*(.+)$'),
    ''
  )), '');

  if v_reason is null then
    raise exception 'A backdating reason is required.' using errcode = '22023';
  end if;

  if v_actor is null or v_company_id is null or not public.ddumba_v1_actor_is_company_admin(v_actor, v_company_id) then
    raise exception 'Only Admin may record a past-date transaction.' using errcode = '42501';
  end if;

  new.backdating_reason := coalesce(nullif(btrim(new.backdating_reason), ''), v_reason);
  new.entered_on_date := coalesce(new.entered_on_date, v_today);
  new.backdated_by := coalesce(new.backdated_by, v_actor);
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.collections') is not null
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'collections' and column_name = 'payment_date') then
    drop trigger if exists trg_current_date_collections on public.collections;
    drop trigger if exists trg_financial_entry_date_collections on public.collections;
    create trigger trg_financial_entry_date_collections
      before insert on public.collections
      for each row execute function public.ddumba_enforce_financial_entry_date('payment_date', 'Payments can only be recorded for the current date.');
  end if;

  if to_regclass('public.tenant_security_deposits') is not null
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tenant_security_deposits' and column_name = 'date_received') then
    drop trigger if exists trg_current_date_tenant_security_deposits on public.tenant_security_deposits;
    drop trigger if exists trg_financial_entry_date_tenant_security_deposits on public.tenant_security_deposits;
    create trigger trg_financial_entry_date_tenant_security_deposits
      before insert on public.tenant_security_deposits
      for each row execute function public.ddumba_enforce_financial_entry_date('date_received', 'Security deposits can only be recorded for the current date.');
  end if;

  if to_regclass('public.expenses') is not null
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'expenses' and column_name = 'expense_date') then
    drop trigger if exists trg_current_date_expenses on public.expenses;
    drop trigger if exists trg_financial_entry_date_expenses on public.expenses;
    create trigger trg_financial_entry_date_expenses
      before insert on public.expenses
      for each row execute function public.ddumba_enforce_financial_entry_date('expense_date', 'Expenses can only be recorded for the current date.');
  end if;

  if to_regclass('public.employee_expenses') is not null
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'employee_expenses' and column_name = 'expense_date') then
    drop trigger if exists trg_current_date_employee_expenses on public.employee_expenses;
    drop trigger if exists trg_financial_entry_date_employee_expenses on public.employee_expenses;
    create trigger trg_financial_entry_date_employee_expenses
      before insert on public.employee_expenses
      for each row execute function public.ddumba_enforce_financial_entry_date('expense_date', 'Expenses can only be recorded for the current date.');
  end if;

  if to_regclass('public.employee_expense_requests') is not null
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'employee_expense_requests' and column_name = 'expense_date') then
    drop trigger if exists trg_current_date_employee_expense_requests on public.employee_expense_requests;
    drop trigger if exists trg_financial_entry_date_employee_expense_requests on public.employee_expense_requests;
    create trigger trg_financial_entry_date_employee_expense_requests
      before insert on public.employee_expense_requests
      for each row execute function public.ddumba_enforce_financial_entry_date('expense_date', 'Expenses can only be recorded for the current date.');
  end if;

  if to_regclass('public.landlord_payment_expense_requests') is not null
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'landlord_payment_expense_requests' and column_name = 'payment_date') then
    drop trigger if exists trg_current_date_landlord_payment_expense_requests on public.landlord_payment_expense_requests;
    drop trigger if exists trg_financial_entry_date_landlord_payment_expense_requests on public.landlord_payment_expense_requests;
    create trigger trg_financial_entry_date_landlord_payment_expense_requests
      before insert on public.landlord_payment_expense_requests
      for each row execute function public.ddumba_enforce_financial_entry_date('payment_date', 'Expenses can only be recorded for the current date.');
  end if;

  if to_regclass('public.treasury_cash_requests') is not null
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'treasury_cash_requests' and column_name = 'business_date') then
    drop trigger if exists trg_current_date_treasury_cash_requests on public.treasury_cash_requests;
    drop trigger if exists trg_financial_entry_date_treasury_cash_requests on public.treasury_cash_requests;
    create trigger trg_financial_entry_date_treasury_cash_requests
      before insert on public.treasury_cash_requests
      for each row execute function public.ddumba_enforce_financial_entry_date('business_date', 'Expenses can only be recorded for the current date.');
  end if;

  if to_regclass('public.bank_deposits') is not null
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bank_deposits' and column_name = 'deposit_date') then
    drop trigger if exists trg_current_date_bank_deposits on public.bank_deposits;
    drop trigger if exists trg_financial_entry_date_bank_deposits on public.bank_deposits;
    create trigger trg_financial_entry_date_bank_deposits
      before insert on public.bank_deposits
      for each row execute function public.ddumba_enforce_financial_entry_date('deposit_date', 'Expenses can only be recorded for the current date.');
  end if;

  if to_regclass('public.admin_cash_movements') is not null
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'admin_cash_movements' and column_name = 'movement_date') then
    drop trigger if exists trg_financial_entry_date_admin_cash_movements on public.admin_cash_movements;
    create trigger trg_financial_entry_date_admin_cash_movements
      before insert on public.admin_cash_movements
      for each row execute function public.ddumba_enforce_financial_entry_date('movement_date', 'Expenses can only be recorded for the current date.');
  end if;

  if to_regclass('public.salary_payments') is not null
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'salary_payments' and column_name = 'payment_date') then
    drop trigger if exists trg_financial_entry_date_salary_payments on public.salary_payments;
    create trigger trg_financial_entry_date_salary_payments
      before insert on public.salary_payments
      for each row execute function public.ddumba_enforce_financial_entry_date('payment_date', 'Expenses can only be recorded for the current date.');
  end if;
end $$;
