-- Phase 4: default permissions, roles, company setup, and office setup.
-- Review and edit company/office seed values before production deployment.

insert into public.permissions (key, name, category, description) values
  ('company.manage', 'Manage Company', 'Administration', 'Manage company profile and headquarters settings'),
  ('office.manage', 'Manage Offices', 'Administration', 'Manage office setup and office users'),
  ('operations.manage', 'Manage Operations', 'Operations', 'Manage office operational records'),
  ('properties.read', 'Read Properties', 'Properties', 'View properties, rooms, landlords, tenants, and leases'),
  ('properties.manage', 'Manage Properties', 'Properties', 'Create and update property, room, landlord, tenant, and lease records'),
  ('collections.read', 'Read Collections', 'Collections', 'View invoices, arrears, payments, promises, and collection actions'),
  ('collections.manage', 'Manage Collections', 'Collections', 'Manage collection actions, promises, assignments, and arrears workflows'),
  ('collections.payment.post', 'Post Payments', 'Collections', 'Post tenant payments and receipts'),
  ('cash.read', 'Read Cash Position', 'Finance', 'View cash accounts, balances, reconciliations, and company cash position'),
  ('cash.manage', 'Manage Cash', 'Finance', 'Manage cash accounts, transfers, reconciliations, withdrawals, and adjustments'),
  ('expenses.read', 'Read Expenses', 'Finance', 'View expenses and expense reports'),
  ('expenses.manage', 'Manage Expenses', 'Finance', 'Submit and manage expenses'),
  ('expenses.approve', 'Approve Expenses', 'Finance', 'Approve or reject expenses'),
  ('landlords.read', 'Read Landlord Finance', 'Landlords', 'View landlord settlements, statements, and payouts'),
  ('landlords.manage', 'Manage Landlord Finance', 'Landlords', 'Manage landlord settlements, statements, and payouts'),
  ('attendance.read', 'Read Attendance', 'Attendance', 'View attendance events and summaries'),
  ('attendance.manage', 'Manage Attendance', 'Attendance', 'Manage attendance policies, corrections, and summaries'),
  ('field.read', 'Read Field Operations', 'Field Operations', 'View routes, visits, inspections, and findings'),
  ('field.manage', 'Manage Field Operations', 'Field Operations', 'Manage field agents, routes, visits, inspections, and findings'),
  ('payroll.read', 'Read Payroll', 'Payroll', 'View payroll profiles, periods, runs, and exports'),
  ('payroll.manage', 'Manage Payroll', 'Payroll', 'Run payroll, adjust payroll items, and export payroll'),
  ('communications.manage', 'Manage Communications', 'Communications', 'Manage templates, messages, broadcasts, reminders, and failures'),
  ('reports.read', 'Read Reports', 'Reporting', 'View reports, dashboards, metrics, and scorecards'),
  ('reports.manage', 'Manage Reports', 'Reporting', 'Create reports, run exports, and manage dashboard caches'),
  ('ai.read', 'Read AI Intelligence', 'AI', 'View AI insights, spreadsheet results, and data quality findings'),
  ('ai.manage', 'Manage AI Intelligence', 'AI', 'Approve AI suggestions and manage data quality checks'),
  ('settings.manage', 'Manage Settings', 'Administration', 'Manage settings, feature flags, integrations, and configuration'),
  ('audit.read', 'Read Audit Logs', 'Security', 'View audit logs and security events'),
  ('backup.manage', 'Manage Backup and Recovery', 'Security', 'Manage backup jobs, restore requests, and retention policies')
on conflict (key) do update set
  name = excluded.name,
  category = excluded.category,
  description = excluded.description;

insert into public.roles (company_id, key, name, description, is_system)
select null, v.key, v.name, v.description, true
from (
  values
    ('super_admin', 'Super Admin', 'Unrestricted system administration role template'),
    ('company_admin', 'Company Admin', 'Company administrator with full company access'),
    ('hq_executive', 'HQ Executive', 'Headquarters oversight and consolidated reporting'),
    ('office_manager', 'Office Manager', 'Office-level operations manager'),
    ('finance_manager', 'Finance Manager', 'Cash, expenses, reconciliation, payroll, and landlord settlement manager'),
    ('collector', 'Rent Collector', 'Collections, promises, and field collections'),
    ('field_agent', 'Field Agent', 'Field routes, visits, inspections, and GPS workflows'),
    ('property_inspector', 'Property Inspector', 'Property inspection and finding management'),
    ('payroll_officer', 'Payroll Officer', 'Payroll reporting and export support'),
    ('viewer', 'Viewer', 'Read-only operational access')
) as v(key, name, description)
where not exists (
  select 1 from public.roles r
  where r.company_id is null and r.key = v.key
);

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key in ('super_admin','company_admin')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'reports.read','cash.read','landlords.read','collections.read','attendance.read',
  'properties.read','ai.read','audit.read'
)
where r.key = 'hq_executive'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'office.manage','operations.manage','properties.read','properties.manage',
  'collections.read','collections.manage','attendance.read','attendance.manage',
  'field.read','field.manage','expenses.read','expenses.manage','reports.read',
  'communications.manage'
)
where r.key = 'office_manager'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'cash.read','cash.manage','expenses.read','expenses.manage','expenses.approve',
  'landlords.read','landlords.manage','collections.read','collections.payment.post',
  'payroll.read','reports.read'
)
where r.key = 'finance_manager'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'properties.read','collections.read','collections.manage','collections.payment.post',
  'field.read','communications.manage'
)
where r.key = 'collector'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in ('field.read','field.manage','properties.read','collections.read')
where r.key in ('field_agent','property_inspector')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in ('payroll.read','payroll.manage','attendance.read','reports.read')
where r.key = 'payroll_officer'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'properties.read','collections.read','attendance.read','field.read','reports.read'
)
where r.key = 'viewer'
on conflict do nothing;

do $$
declare
  ddumba_company_id uuid;
begin
  select id into ddumba_company_id
  from public.companies
  where name = 'Ddumba Property Management'
  limit 1;

  if ddumba_company_id is null then
    insert into public.companies (name, legal_name, email, phone)
    values ('Ddumba Property Management', 'Ddumba Property Management', null, null)
    returning id into ddumba_company_id;
  end if;

  insert into public.offices (company_id, name, code, city, region) values
    (ddumba_company_id, 'Lugonjo Office', 'LUGONJO', 'Lugonjo', 'Central'),
    (ddumba_company_id, 'Kigungu Office', 'KIGUNGU', 'Kigungu', 'Central'),
    (ddumba_company_id, 'Kapeeka Office', 'KAPEEKA', 'Kapeeka', 'Central'),
    (ddumba_company_id, 'Mbale Office', 'MBALE', 'Mbale', 'Eastern')
  on conflict (company_id, code) do update set
    name = excluded.name,
    city = excluded.city,
    region = excluded.region;

  insert into public.company_settings (company_id, key, value) values
    (ddumba_company_id, 'currency', '{"default":"UGX"}'),
    (ddumba_company_id, 'timezone', '{"default":"Africa/Kampala"}'),
    (ddumba_company_id, 'collections', '{"receipt_prefix":"DPM","default_grace_days":0}'),
    (ddumba_company_id, 'attendance', '{"grace_minutes":10,"require_gps":true,"require_approved_device":false}')
  on conflict (company_id, key) do update set value = excluded.value;
end;
$$;
