begin;

insert into public.permissions(key, name, description, category)
values
  ('admin.dashboard.read', 'Read Admin Dashboard', 'View company-wide admin dashboard data without mutation access.', 'admin'),
  ('admin.cash_position.read', 'Read Cash Position', 'View company-wide cash position data without mutation access.', 'admin'),
  ('admin.collections.read', 'Read Collections', 'View company-wide collections data without mutation access.', 'admin'),
  ('admin.receipts.read', 'Read Receipts', 'View company-wide receipt history without mutation access.', 'admin'),
  ('admin.expenses.read', 'Read Expenses', 'View company-wide expenses and approval queues without mutation access.', 'admin'),
  ('admin.defaulters.read', 'Read Defaulters', 'View company-wide defaulters without mutation access.', 'admin'),
  ('admin.landlords.read', 'Read Landlords', 'View company-wide landlord data without mutation access.', 'admin'),
  ('admin.properties.read', 'Read Properties', 'View company-wide properties and rooms without mutation access.', 'admin'),
  ('admin.employees.read', 'Read Employees', 'View employee records without mutation access.', 'admin'),
  ('admin.salary.read', 'Read Salary Centre', 'View payroll and salary centre data without mutation access.', 'admin'),
  ('admin.reports.read', 'Read Reports', 'View company reports without mutation access.', 'admin'),
  ('admin.audit.read', 'Read Audit History', 'View audit history without mutation access.', 'admin'),
  ('admin.notifications.read', 'Read Notifications', 'View management notifications without mutation access.', 'admin'),
  ('admin.banking.read', 'Read Banking', 'View banking and deposit slip records without mutation access.', 'admin'),
  ('admin.security_deposits.read', 'Read Security Deposits', 'View security deposit records without mutation access.', 'admin'),
  ('reports.read', 'Read Reports', 'View reports.', 'reports'),
  ('collections.read', 'Read Collections', 'View collections.', 'collections'),
  ('collections.view', 'View Collections', 'View collections.', 'collections'),
  ('receipts.read', 'Read Receipts', 'View receipts.', 'receipts'),
  ('expenses.read', 'Read Expenses', 'View expenses.', 'expenses'),
  ('properties.read', 'Read Properties', 'View properties.', 'properties'),
  ('landlords.read', 'Read Landlords', 'View landlords.', 'landlords'),
  ('landlords.view', 'View Landlords', 'View landlords.', 'landlords'),
  ('attendance.read', 'Read Attendance', 'View attendance.', 'attendance'),
  ('cash.read', 'Read Cash', 'View cash and banking records.', 'cash'),
  ('security_deposits.read', 'Read Security Deposits', 'View security deposits.', 'security_deposits'),
  ('salary.read', 'Read Salary', 'View salary records.', 'salary'),
  ('notifications.view', 'View Notifications', 'View notifications.', 'notifications'),
  ('ai.read', 'Read AI Insights', 'View AI intelligence panels.', 'ai')
on conflict (key) do update
set name = excluded.name,
    description = excluded.description,
    category = excluded.category;

do $$
declare
  v_company_id uuid;
  v_employee_id uuid := 'bcb3fc4d-687d-422e-ba0f-9b849d626128'::uuid;
  v_user_id uuid := '9b427de9-7a15-4cfc-842e-3a0f6d8cdf5d'::uuid;
  v_role_id uuid;
  v_assignment_id uuid;
  v_before jsonb;
  v_permission_keys text[] := array[
    'admin.dashboard.read',
    'admin.cash_position.read',
    'admin.collections.read',
    'admin.receipts.read',
    'admin.expenses.read',
    'admin.defaulters.read',
    'admin.landlords.read',
    'admin.properties.read',
    'admin.employees.read',
    'admin.salary.read',
    'admin.reports.read',
    'admin.audit.read',
    'admin.notifications.read',
    'admin.banking.read',
    'admin.security_deposits.read',
    'reports.read',
    'collections.read',
    'collections.view',
    'receipts.read',
    'expenses.read',
    'properties.read',
    'landlords.read',
    'landlords.view',
    'attendance.read',
    'cash.read',
    'security_deposits.read',
    'salary.read',
    'notifications.view',
    'ai.read'
  ];
begin
  select company_id into v_company_id
  from public.users
  where id = v_user_id;

  if v_company_id is null then
    raise exception 'Jimmy Makino user account was not found.';
  end if;

  if not exists (
    select 1
    from public.employees
    where id = v_employee_id
      and company_id = v_company_id
      and lower(regexp_replace(coalesce(full_name, ''), '\s+', ' ', 'g')) = 'jimmy makino'
  ) then
    raise exception 'Jimmy Makino employee record was not found or does not match the user company.';
  end if;

  if exists (
    select 1
    from public.employees
    where company_id = v_company_id
      and lower(regexp_replace(trim(coalesce(full_name, '')), '\s+', ' ', 'g')) = 'jimmy makino'
      and id <> v_employee_id
      and coalesce(lower(status), 'active') not in ('deleted', 'archived')
  ) then
    raise exception 'Multiple active Jimmy Makino employee records exist. Resolve duplicates before role conversion.';
  end if;

  select jsonb_build_object(
    'user', to_jsonb(u),
    'employee', to_jsonb(e),
    'roles', coalesce((
      select jsonb_agg(jsonb_build_object('assignment_id', uor.id, 'role_key', r.key, 'office_id', uor.office_id, 'scope', uor.scope, 'status', uor.status))
      from public.user_office_roles uor
      left join public.roles r on r.id = uor.role_id
      where uor.user_id = v_user_id
        and uor.company_id = v_company_id
    ), '[]'::jsonb)
  )
  into v_before
  from public.users u
  join public.employees e on e.id = v_employee_id
  where u.id = v_user_id;

  insert into public.roles(company_id, name, key, description, is_system, updated_at)
  values (
    v_company_id,
    'Company Manager - Read Only',
    'company_manager_read_only',
    'Company-wide executive manager visibility with no create, update, delete, approve, reject, banking, payment, correction, or configuration access.',
    true,
    now()
  )
  on conflict (company_id, key) do update
  set name = excluded.name,
      description = excluded.description,
      is_system = true,
      updated_at = now()
  returning id into v_role_id;

  insert into public.role_permissions(role_id, permission_id)
  select v_role_id, p.id
  from public.permissions p
  where p.key = any(v_permission_keys)
  on conflict (role_id, permission_id) do nothing;

  delete from public.role_permissions rp
  using public.permissions p
  where rp.role_id = v_role_id
    and rp.permission_id = p.id
    and (
      p.key !~ '(\.read|\.view)$'
      or p.key = any(array[
        'settings.view',
        'settings.manage',
        'collections.manage',
        'expenses.manage',
        'cash.manage',
        'properties.manage',
        'landlords.manage',
        'reports.manage'
      ])
    );

  update public.users
  set employee_id = v_employee_id,
      account_type = 'company_manager_read_only',
      status = 'active',
      default_office_id = null,
      updated_at = now()
  where id = v_user_id
    and company_id = v_company_id;

  update public.employees
  set user_id = v_user_id,
      role_id = v_role_id,
      role = 'Company Manager - Read Only',
      role_name = 'Company Manager - Read Only',
      job_title = 'Company Manager - Read Only',
      status = 'active',
      updated_at = now()
  where id = v_employee_id
    and company_id = v_company_id;

  select id into v_assignment_id
  from public.user_office_roles
  where user_id = v_user_id
    and company_id = v_company_id
  order by created_at asc
  limit 1;

  if v_assignment_id is null then
    insert into public.user_office_roles(company_id, user_id, office_id, role_id, scope, employee_id, status, effective_from, updated_at)
    values (v_company_id, v_user_id, null, v_role_id, 'company', v_employee_id, 'active', current_date, now())
    returning id into v_assignment_id;
  else
    update public.user_office_roles
    set office_id = null,
        role_id = v_role_id,
        scope = 'company',
        employee_id = v_employee_id,
        status = 'active',
        effective_from = coalesce(effective_from, current_date),
        effective_to = null,
        updated_at = now()
    where id = v_assignment_id;

    update public.user_office_roles
    set status = 'inactive',
        effective_to = current_date,
        updated_at = now()
    where user_id = v_user_id
      and company_id = v_company_id
      and id <> v_assignment_id;
  end if;

  if to_regclass('public.field_collector_profiles') is not null then
    execute $sql$
      update public.field_collector_profiles
      set status = 'inactive',
          updated_at = now()
      where user_id = $1
    $sql$ using v_user_id;
  end if;

  update public.pin_credentials
  set failed_attempts = 0,
      failed_login_attempts = 0,
      is_locked = false,
      locked_at = null,
      status = 'active',
      updated_at = now()
  where user_id = v_user_id
    and company_id = v_company_id;

  update auth.refresh_tokens
  set revoked = true,
      updated_at = now()
  where user_id = v_user_id::text
    and coalesce(revoked, false) = false;

  delete from auth.sessions
  where user_id = v_user_id;

  insert into public.audit_logs(company_id, office_id, actor_id, action, entity_type, entity_id, before_data, after_data)
  values (
    v_company_id,
    null,
    null,
    'user_role_changed',
    'user',
    v_user_id,
    v_before,
    jsonb_build_object(
      'user_id', v_user_id,
      'employee_id', v_employee_id,
      'previous_role', 'Field Collector',
      'new_role', 'Company Manager - Read Only',
      'reason', 'Converted Jimmy Makino into a company-wide executive read-only management account.',
      'sessions_revoked', true
    )
  );
end $$;

create or replace function public.ddumba_v1_verify_read_only_manager_login(
  p_identifier text,
  p_secret text,
  p_user_agent text default null
)
returns table (
  user_id uuid,
  email text,
  company_id uuid,
  office_id uuid,
  full_name text,
  office_name text,
  is_company_admin boolean,
  auth_mode text,
  redirect_to text,
  login_status text,
  attempts_remaining integer,
  locked boolean
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_login record;
begin
  if coalesce(length(trim(p_identifier)), 0) < 2 or coalesce(length(trim(p_secret)), 0) < 4 then
    return;
  end if;

  select distinct
    u.id,
    u.email,
    u.company_id,
    coalesce(e.full_name, u.full_name) as resolved_full_name,
    pc.id as credential_id,
    u.created_at
  into v_login
  from public.users u
  join public.pin_credentials pc on pc.user_id = u.id
  join public.user_office_roles uor on uor.user_id = u.id and uor.company_id = u.company_id
  join public.roles r on r.id = uor.role_id
  left join public.employees e on e.id = coalesce(u.employee_id, uor.employee_id) or e.user_id = u.id
  where coalesce(lower(u.status), 'active') = 'active'
    and coalesce(lower(u.account_type), '') in ('company_manager_read_only', 'executive_manager_read_only')
    and coalesce(lower(uor.status), 'active') = 'active'
    and uor.office_id is null
    and coalesce(uor.scope, 'company') in ('company', 'headquarters')
    and r.key in ('company_manager_read_only', 'executive_manager_read_only')
    and coalesce(lower(pc.status), 'active') = 'active'
    and coalesce(pc.is_locked, false) = false
    and pc.locked_at is null
    and pc.pin_hash = crypt(trim(p_secret), pc.pin_hash)
    and (
      lower(coalesce(u.full_name, '')) = lower(trim(p_identifier))
      or lower(coalesce(u.email, '')) = lower(trim(p_identifier))
      or regexp_replace(coalesce(u.phone, ''), '\D', '', 'g') = regexp_replace(trim(p_identifier), '\D', '', 'g')
      or lower(coalesce(u.employee_code, '')) = lower(trim(p_identifier))
      or lower(coalesce(e.full_name, '')) = lower(trim(p_identifier))
      or regexp_replace(coalesce(e.phone, ''), '\D', '', 'g') = regexp_replace(trim(p_identifier), '\D', '', 'g')
      or lower(coalesce(e.employee_code, '')) = lower(trim(p_identifier))
    )
  order by u.created_at asc
  limit 1;

  if v_login.id is null then
    return;
  end if;

  update public.pin_credentials
  set failed_attempts = 0,
      failed_login_attempts = 0,
      is_locked = false,
      locked_at = null,
      last_used_at = now(),
      updated_at = now()
  where id = v_login.credential_id;

  user_id := v_login.id;
  email := v_login.email;
  company_id := v_login.company_id;
  office_id := null;
  full_name := v_login.resolved_full_name;
  office_name := null;
  is_company_admin := false;
  auth_mode := 'admin';
  redirect_to := '/office/admin/cash-position';
  login_status := 'success';
  attempts_remaining := 3;
  locked := false;
  return next;
end;
$$;

grant execute on function public.ddumba_v1_verify_read_only_manager_login(text, text, text) to anon, authenticated;

commit;
