create index if not exists idx_employees_company_name_office_live
    on public.employees(company_id, office_id, full_name)
    where coalesce(status, 'active') not in ('terminated', 'archived', 'deleted', 'inactive');

create index if not exists idx_employee_expenses_lunch_lookup
    on public.employee_expenses(company_id, employee_id, expense_date, category, status)
    where active = true;

create index if not exists idx_employee_expense_requests_lunch_lookup
    on public.employee_expense_requests(company_id, employee_id, expense_date, requested_item_key, status)
    where active = true;

create index if not exists idx_expenses_company_date_status
    on public.expenses(company_id, expense_date, status);

create index if not exists idx_landlord_payments_company_landlord_paid
    on public.landlord_payments(company_id, landlord_id, paid_at desc, created_at desc);

create index if not exists idx_landlords_company_name
    on public.landlords(company_id, full_name);

create or replace function public.ddumba_prevent_duplicate_employee_lunch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if coalesce(new.active, true)
       and coalesce(new.category, '') = 'lunch'
       and coalesce(new.status, 'approved') in ('approved', 'pending') then
        if exists (
            select 1
            from public.employee_expenses ee
            where ee.company_id = new.company_id
              and ee.employee_id = new.employee_id
              and ee.expense_date = new.expense_date
              and ee.category = 'lunch'
              and coalesce(ee.active, true)
              and coalesce(ee.status, 'approved') in ('approved', 'pending')
              and ee.id is distinct from new.id
        ) or exists (
            select 1
            from public.employee_expense_requests er
            where er.company_id = new.company_id
              and er.employee_id = new.employee_id
              and er.expense_date = new.expense_date
              and er.requested_item_key = 'lunch'
              and coalesce(er.active, true)
              and coalesce(er.status, 'pending') = 'pending'
        ) then
            raise exception 'Lunch has already been recorded for this employee on this date.';
        end if;
    end if;
    return new;
end;
$$;

create or replace function public.ddumba_prevent_duplicate_employee_lunch_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if coalesce(new.active, true)
       and coalesce(new.requested_item_key, '') = 'lunch'
       and coalesce(new.status, 'pending') = 'pending' then
        if exists (
            select 1
            from public.employee_expenses ee
            where ee.company_id = new.company_id
              and ee.employee_id = new.employee_id
              and ee.expense_date = new.expense_date
              and ee.category = 'lunch'
              and coalesce(ee.active, true)
              and coalesce(ee.status, 'approved') in ('approved', 'pending')
        ) or exists (
            select 1
            from public.employee_expense_requests er
            where er.company_id = new.company_id
              and er.employee_id = new.employee_id
              and er.expense_date = new.expense_date
              and er.requested_item_key = 'lunch'
              and coalesce(er.active, true)
              and coalesce(er.status, 'pending') = 'pending'
              and er.id is distinct from new.id
        ) then
            raise exception 'Lunch has already been recorded for this employee on this date.';
        end if;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_ddumba_prevent_duplicate_employee_lunch on public.employee_expenses;
create trigger trg_ddumba_prevent_duplicate_employee_lunch
before insert or update on public.employee_expenses
for each row execute function public.ddumba_prevent_duplicate_employee_lunch();

drop trigger if exists trg_ddumba_prevent_duplicate_employee_lunch_request on public.employee_expense_requests;
create trigger trg_ddumba_prevent_duplicate_employee_lunch_request
before insert or update on public.employee_expense_requests
for each row execute function public.ddumba_prevent_duplicate_employee_lunch_request();
