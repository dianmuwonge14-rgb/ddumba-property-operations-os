-- Phase 18 local visual QA seed.
-- Additive only: no DROP, DELETE, TRUNCATE, or destructive updates.
-- Login:
--   Office: Kigungu Office
--   Name: Test CEO
--   Email: test-ceo@ddumba.local
--   PIN/password: 123456

create extension if not exists pgcrypto;

do $$
declare
  v_company_id uuid;
  v_office_id uuid;
  v_user_id uuid := '11111111-1111-4111-8111-111111111111';
  v_role_id uuid;
  v_identity_id_type text;
  v_permission_keys text[] := array[
    'dashboard.view',
    'collections.view',
    'collections.manage',
    'collections.payment.post',
    'promises.view',
    'promises.manage',
    'properties.view',
    'properties.manage',
    'landlords.view',
    'landlords.manage',
    'expenses.view',
    'expenses.manage',
    'attendance.view',
    'attendance.manage',
    'reports.view',
    'reports.read',
    'reports.manage',
    'settings.view',
    'settings.manage',
    'ai.view',
    'notifications.view',
    'notifications.manage'
  ];
  v_key text;
begin
  select id into v_company_id
  from public.companies
  where status = 'active'
  order by created_at nulls last, name
  limit 1;

  if v_company_id is null then
    insert into public.companies (name, legal_name, email, phone, status)
    values ('Ddumba Property Operations', 'Ddumba Property Operations', 'admin@ddumba.local', '+256000000000', 'active')
    returning id into v_company_id;
  end if;

  select id into v_office_id
  from public.offices
  where company_id = v_company_id
    and lower(coalesce(office_name, name, '')) like '%kigungu%'
  order by created_at nulls last
  limit 1;

  if v_office_id is null then
    insert into public.offices (
      company_id,
      office_name,
      name,
      office_code,
      code,
      manager_name,
      location,
      collection_target,
      expense_budget,
      office_score,
      office_health,
      status
    )
    values (
      v_company_id,
      'Kigungu Office',
      'Kigungu Office',
      'KIG',
      'KIG',
      'Test CEO',
      'Kigungu',
      50000000,
      15000000,
      95,
      'excellent',
      'active'
    )
    returning id into v_office_id;
  end if;

  insert into auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    created_at,
    updated_at,
    phone,
    phone_confirmed_at,
    email_change_confirm_status,
    is_sso_user,
    is_anonymous
  )
  values (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'test-ceo@ddumba.local',
    crypt('123456', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Test CEO","qa_user":true}'::jsonb,
    false,
    now(),
    now(),
    null,
    null,
    0,
    false,
    false
  )
  on conflict do nothing;

  select data_type into v_identity_id_type
  from information_schema.columns
  where table_schema = 'auth'
    and table_name = 'identities'
    and column_name = 'id'
  limit 1;

  if v_identity_id_type = 'uuid' then
    execute $sql$
      insert into auth.identities (
        id,
        user_id,
        identity_data,
        provider,
        provider_id,
        last_sign_in_at,
        created_at,
        updated_at
      )
      values (
        '11111111-1111-4111-8111-111111111111'::uuid,
        '11111111-1111-4111-8111-111111111111'::uuid,
        '{"sub":"11111111-1111-4111-8111-111111111111","email":"test-ceo@ddumba.local","email_verified":true,"phone_verified":false}'::jsonb,
        'email',
        'test-ceo@ddumba.local',
        now(),
        now(),
        now()
      )
      on conflict do nothing
    $sql$;
  else
    execute $sql$
      insert into auth.identities (
        id,
        user_id,
        identity_data,
        provider,
        provider_id,
        last_sign_in_at,
        created_at,
        updated_at
      )
      values (
        '11111111-1111-4111-8111-111111111111',
        '11111111-1111-4111-8111-111111111111'::uuid,
        '{"sub":"11111111-1111-4111-8111-111111111111","email":"test-ceo@ddumba.local","email_verified":true,"phone_verified":false}'::jsonb,
        'email',
        'test-ceo@ddumba.local',
        now(),
        now(),
        now()
      )
      on conflict do nothing
    $sql$;
  end if;

  insert into public.users (
    id,
    company_id,
    default_office_id,
    full_name,
    employee_code,
    phone,
    email,
    status
  )
  values (
    v_user_id,
    v_company_id,
    v_office_id,
    'Test CEO',
    'QA-CEO-001',
    '+256000123456',
    'test-ceo@ddumba.local',
    'active'
  )
  on conflict (id) do nothing;

  insert into public.employees (
    company_id,
    user_id,
    office_id,
    employee_code,
    full_name,
    job_title,
    department,
    employment_type,
    phone,
    email,
    role,
    employee_pin,
    status
  )
  select
    v_company_id,
    v_user_id,
    v_office_id,
    'QA-CEO-001',
    'Test CEO',
    'Chief Executive Officer',
    'Executive',
    'full_time',
    '+256000123456',
    'test-ceo@ddumba.local',
    'CEO / Company Admin',
    '123456',
    'active'
  where not exists (
    select 1
    from public.employees
    where company_id = v_company_id
      and employee_code = 'QA-CEO-001'
  );

  insert into public.roles (company_id, name, key, description, is_system)
  values (v_company_id, 'CEO / Company Admin', 'company_admin', 'Local visual QA company administrator role.', false)
  on conflict (company_id, key) do nothing;

  select id into v_role_id
  from public.roles
  where company_id = v_company_id
    and key = 'company_admin'
  limit 1;

  foreach v_key in array v_permission_keys loop
    insert into public.permissions (key, name, description, category)
    values (
      v_key,
      initcap(replace(v_key, '.', ' ')),
      'Visual QA permission for ' || v_key,
      split_part(v_key, '.', 1)
    )
    on conflict (key) do nothing;
  end loop;

  insert into public.role_permissions (role_id, permission_id)
  select v_role_id, p.id
  from public.permissions p
  where p.key = any(v_permission_keys)
  on conflict (role_id, permission_id) do nothing;

  insert into public.user_office_roles (
    company_id,
    user_id,
    office_id,
    role_id,
    scope
  )
  values (
    v_company_id,
    v_user_id,
    null,
    v_role_id,
    'company'
  )
  on conflict do nothing;

  insert into public.user_office_roles (
    company_id,
    user_id,
    office_id,
    role_id,
    scope
  )
  values (
    v_company_id,
    v_user_id,
    v_office_id,
    v_role_id,
    'office'
  )
  on conflict do nothing;

  insert into public.pin_credentials (
    company_id,
    user_id,
    pin_hash,
    status,
    failed_attempts
  )
  values (
    v_company_id,
    v_user_id,
    crypt('123456', gen_salt('bf')),
    'active',
    0
  )
  on conflict (user_id) do nothing;

  insert into public.security_events (
    company_id,
    office_id,
    user_id,
    event_type,
    severity,
    metadata
  )
  values (
    v_company_id,
    v_office_id,
    v_user_id,
    'visual_qa_test_user_seeded',
    'info',
    jsonb_build_object('purpose', 'Phase 18 local visual QA', 'email', 'test-ceo@ddumba.local')
  );

  update auth.users
  set
    confirmation_token = coalesce(confirmation_token, ''),
    recovery_token = coalesce(recovery_token, ''),
    email_change_token_new = coalesce(email_change_token_new, ''),
    email_change = coalesce(email_change, ''),
    email_change_token_current = coalesce(email_change_token_current, ''),
    reauthentication_token = coalesce(reauthentication_token, ''),
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    updated_at = now()
  where id = v_user_id
    and email = 'test-ceo@ddumba.local';

  update auth.identities
  set
    updated_at = now()
  where user_id = v_user_id
    and provider = 'email';
end $$;
