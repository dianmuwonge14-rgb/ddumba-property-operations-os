-- Phase 237: Current-business-date guards for normal financial entry workflows.

create or replace function public.ddumba_current_business_date()
returns date
language sql
stable
as $$
  select (now() at time zone 'Africa/Kampala')::date;
$$;

create or replace function public.assert_current_business_date(
  p_date date,
  p_message text default 'Financial entries can only be recorded for the current date.'
)
returns date
language plpgsql
stable
as $$
begin
  if p_date is null or p_date <> public.ddumba_current_business_date() then
    raise exception '%', p_message using errcode = '22023';
  end if;
  return p_date;
end;
$$;

create or replace function public.ddumba_enforce_current_entry_date()
returns trigger
language plpgsql
as $$
declare
  v_date date;
  v_column text := tg_argv[0];
  v_message text := coalesce(tg_argv[1], 'Financial entries can only be recorded for the current date.');
begin
  execute format('select ($1).%I::date', v_column) using new into v_date;
  perform public.assert_current_business_date(v_date, v_message);
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.tenant_security_deposits') is not null
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tenant_security_deposits' and column_name = 'date_received') then
    drop trigger if exists trg_current_date_tenant_security_deposits on public.tenant_security_deposits;
    create trigger trg_current_date_tenant_security_deposits
      before insert on public.tenant_security_deposits
      for each row execute function public.ddumba_enforce_current_entry_date('date_received', 'Security deposits can only be recorded for the current date.');
  end if;

  if to_regclass('public.expenses') is not null
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'expenses' and column_name = 'expense_date') then
    drop trigger if exists trg_current_date_expenses on public.expenses;
    create trigger trg_current_date_expenses
      before insert on public.expenses
      for each row execute function public.ddumba_enforce_current_entry_date('expense_date', 'Expenses can only be recorded for the current date.');
  end if;

  if to_regclass('public.employee_expenses') is not null
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'employee_expenses' and column_name = 'expense_date') then
    drop trigger if exists trg_current_date_employee_expenses on public.employee_expenses;
    create trigger trg_current_date_employee_expenses
      before insert on public.employee_expenses
      for each row execute function public.ddumba_enforce_current_entry_date('expense_date', 'Expenses can only be recorded for the current date.');
  end if;

  if to_regclass('public.employee_expense_requests') is not null
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'employee_expense_requests' and column_name = 'expense_date') then
    drop trigger if exists trg_current_date_employee_expense_requests on public.employee_expense_requests;
    create trigger trg_current_date_employee_expense_requests
      before insert on public.employee_expense_requests
      for each row execute function public.ddumba_enforce_current_entry_date('expense_date', 'Expenses can only be recorded for the current date.');
  end if;

  if to_regclass('public.landlord_payment_expense_requests') is not null
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'landlord_payment_expense_requests' and column_name = 'payment_date') then
    drop trigger if exists trg_current_date_landlord_payment_expense_requests on public.landlord_payment_expense_requests;
    create trigger trg_current_date_landlord_payment_expense_requests
      before insert on public.landlord_payment_expense_requests
      for each row execute function public.ddumba_enforce_current_entry_date('payment_date', 'Expenses can only be recorded for the current date.');
  end if;

  if to_regclass('public.treasury_cash_requests') is not null
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'treasury_cash_requests' and column_name = 'business_date') then
    drop trigger if exists trg_current_date_treasury_cash_requests on public.treasury_cash_requests;
    create trigger trg_current_date_treasury_cash_requests
      before insert on public.treasury_cash_requests
      for each row execute function public.ddumba_enforce_current_entry_date('business_date', 'Expenses can only be recorded for the current date.');
  end if;

  if to_regclass('public.bank_deposits') is not null
     and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bank_deposits' and column_name = 'deposit_date') then
    drop trigger if exists trg_current_date_bank_deposits on public.bank_deposits;
    create trigger trg_current_date_bank_deposits
      before insert on public.bank_deposits
      for each row execute function public.ddumba_enforce_current_entry_date('deposit_date', 'Expenses can only be recorded for the current date.');
  end if;
end $$;
