-- Field Collector permission and linkage repair.
-- Keeps Musakira Adam's existing employee/user/profile and normalises him to the same company-scope collector model.

alter table public.field_collector_profiles
  add column if not exists employee_id uuid references public.employees(id) on delete set null;

create index if not exists idx_field_collector_profiles_employee
  on public.field_collector_profiles(company_id, employee_id)
  where employee_id is not null;

insert into public.permissions(key, name, description, category)
values
  ('collections.read', 'Read Collections', 'View rooms, tenants, balances, receipts, arrears and collection actions.', 'Collections'),
  ('collections.payment.post', 'Post Payments', 'Post tenant payments and receipts.', 'Collections'),
  ('defaulters.view', 'View Defaulters', 'View authorised live defaulters and filters.', 'Collections')
on conflict (key) do nothing;

insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'collector.view',
  'collector.manage',
  'collections.view',
  'collections.manage',
  'collections.read',
  'collections.payment.post',
  'promises.view',
  'promises.manage',
  'dashboard.view',
  'notifications.view',
  'defaulters.view'
)
where r.key in ('field_collector', 'collector')
on conflict (role_id, permission_id) do nothing;

with musakira as (
  select
    e.company_id,
    e.id as employee_id,
    u.id as user_id
  from public.employees e
  join public.users u
    on u.company_id = e.company_id
   and (
        u.id = e.user_id
        or u.employee_id = e.id
        or (
          regexp_replace(coalesce(u.phone, ''), '\D', '', 'g') = regexp_replace(coalesce(e.phone, ''), '\D', '', 'g')
          and lower(regexp_replace(coalesce(u.full_name, ''), '\s+', ' ', 'g')) = lower(regexp_replace(coalesce(e.full_name, ''), '\s+', ' ', 'g'))
        )
   )
  where lower(regexp_replace(coalesce(e.full_name, ''), '\s+', ' ', 'g')) = 'musakira adam'
    and regexp_replace(coalesce(e.phone, ''), '\D', '', 'g') in ('0758575591','256758575591','758575591')
    and lower(coalesce(u.account_type, '')) in ('field_collector', 'collector')
    and lower(coalesce(e.status, 'active')) = 'active'
    and lower(coalesce(u.status, 'active')) = 'active'
),
single_musakira as (
  select (array_agg(distinct company_id))[1] as company_id,
         (array_agg(distinct employee_id))[1] as employee_id,
         (array_agg(distinct user_id))[1] as user_id
  from musakira
  having count(distinct employee_id) = 1 and count(distinct user_id) = 1
),
field_role as (
  select r.company_id, r.id as role_id
  from public.roles r
  join single_musakira m on r.company_id = m.company_id
  where r.key = 'field_collector'
)
update public.users u
set employee_id = m.employee_id,
    account_type = 'field_collector',
    status = 'active',
    updated_at = now()
from single_musakira m
where u.id = m.user_id
  and u.company_id = m.company_id
  and (
    u.employee_id is distinct from m.employee_id
    or lower(coalesce(u.account_type, '')) <> 'field_collector'
    or lower(coalesce(u.status, 'active')) <> 'active'
  );

with musakira as (
  select
    e.company_id,
    e.id as employee_id,
    u.id as user_id,
    u.default_office_id
  from public.employees e
  join public.users u
    on u.company_id = e.company_id
   and (u.id = e.user_id or u.employee_id = e.id)
  where e.id = u.employee_id
    and lower(regexp_replace(coalesce(e.full_name, ''), '\s+', ' ', 'g')) = 'musakira adam'
    and regexp_replace(coalesce(e.phone, ''), '\D', '', 'g') in ('0758575591','256758575591','758575591')
),
single_musakira as (
  select (array_agg(distinct company_id))[1] as company_id,
         (array_agg(distinct employee_id))[1] as employee_id,
         (array_agg(distinct user_id))[1] as user_id,
         (array_agg(distinct default_office_id))[1] as default_office_id
  from musakira
  having count(distinct employee_id) = 1 and count(distinct user_id) = 1
),
field_role as (
  select r.company_id, r.id as role_id
  from public.roles r
  join single_musakira m on r.company_id = m.company_id
  where r.key = 'field_collector'
)
update public.user_office_roles uor
set employee_id = m.employee_id,
    office_id = null,
    scope = 'company',
    status = 'active',
    effective_from = coalesce(uor.effective_from, current_date),
    effective_to = null,
    updated_at = now()
from single_musakira m
join field_role fr on fr.company_id = m.company_id
where uor.user_id = m.user_id
  and uor.company_id = m.company_id
  and uor.role_id = fr.role_id;

with musakira as (
  select
    e.company_id,
    e.id as employee_id,
    u.id as user_id,
    u.default_office_id
  from public.employees e
  join public.users u on u.employee_id = e.id and u.company_id = e.company_id
  where lower(regexp_replace(coalesce(e.full_name, ''), '\s+', ' ', 'g')) = 'musakira adam'
    and regexp_replace(coalesce(e.phone, ''), '\D', '', 'g') in ('0758575591','256758575591','758575591')
),
single_musakira as (
  select (array_agg(distinct company_id))[1] as company_id,
         (array_agg(distinct employee_id))[1] as employee_id,
         (array_agg(distinct user_id))[1] as user_id,
         (array_agg(distinct default_office_id))[1] as default_office_id
  from musakira
  having count(distinct employee_id) = 1 and count(distinct user_id) = 1
),
field_role as (
  select r.company_id, r.id as role_id
  from public.roles r
  join single_musakira m on r.company_id = m.company_id
  where r.key = 'field_collector'
)
insert into public.user_office_roles(company_id, user_id, office_id, role_id, scope, employee_id, status, effective_from)
select m.company_id, m.user_id, null, fr.role_id, 'company', m.employee_id, 'active', current_date
from single_musakira m
join field_role fr on fr.company_id = m.company_id
where not exists (
  select 1
  from public.user_office_roles uor
  where uor.company_id = m.company_id
    and uor.user_id = m.user_id
    and uor.role_id = fr.role_id
);

with musakira as (
  select e.company_id, e.id as employee_id, e.user_id, e.office_id
  from public.employees e
  join public.users u on u.employee_id = e.id and u.company_id = e.company_id
  where lower(regexp_replace(coalesce(e.full_name, ''), '\s+', ' ', 'g')) = 'musakira adam'
    and regexp_replace(coalesce(e.phone, ''), '\D', '', 'g') in ('0758575591','256758575591','758575591')
),
single_musakira as (
  select (array_agg(distinct company_id))[1] as company_id,
         (array_agg(distinct employee_id))[1] as employee_id,
         (array_agg(distinct user_id))[1] as user_id,
         (array_agg(distinct office_id))[1] as office_id
  from musakira
  having count(distinct employee_id) = 1 and count(distinct user_id) = 1
)
update public.field_collector_profiles fcp
set employee_id = m.employee_id,
    status = 'active',
    updated_at = now()
from single_musakira m
where fcp.company_id = m.company_id
  and fcp.user_id = m.user_id
  and (
    fcp.employee_id is distinct from m.employee_id
    or lower(coalesce(fcp.status, 'active')) <> 'active'
  );

insert into public.audit_logs(company_id, action, entity_type, entity_id, after_data)
select
  e.company_id,
  'field_collector_permission_repaired',
  'user',
  u.id,
  jsonb_build_object(
    'employee_id', e.id,
    'employee_name', e.full_name,
    'user_id', u.id,
    'account_type', u.account_type,
    'role', 'field_collector',
    'scope', 'company',
    'reason', 'Normalised Musakira Adam to the standard Field Collector account permissions and search scope.'
  )
from public.employees e
join public.users u on u.employee_id = e.id and u.company_id = e.company_id
where lower(regexp_replace(coalesce(e.full_name, ''), '\s+', ' ', 'g')) = 'musakira adam'
  and regexp_replace(coalesce(e.phone, ''), '\D', '', 'g') in ('0758575591','256758575591','758575591');
