-- Admin Collections employee dropdown must come from active real employees, not payment history.
-- These indexes keep employee lookup and combined employee/period filtering fast.

create index if not exists idx_employees_company_status_name
    on public.employees (company_id, lower(coalesce(status, 'active')), lower(coalesce(full_name, '')));

create index if not exists idx_employees_company_phone
    on public.employees (company_id, regexp_replace(coalesce(phone, ''), '\D', '', 'g'))
    where phone is not null;

create index if not exists idx_employees_company_code
    on public.employees (company_id, lower(coalesce(employee_code, '')))
    where employee_code is not null;

create index if not exists idx_employees_company_role_office
    on public.employees (company_id, lower(coalesce(role, job_title, '')), office_id);
