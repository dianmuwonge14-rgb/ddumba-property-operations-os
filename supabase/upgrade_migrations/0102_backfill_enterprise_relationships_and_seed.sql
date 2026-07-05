-- Non-destructive bridge/backfill for existing Ddumba records.
-- Rules: no DROP TABLE, no DROP COLUMN, no DELETE, no TRUNCATE.

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
  select 1 from public.roles r where r.company_id is null and r.key = v.key
);

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.company_id is null
  and r.key in ('super_admin','company_admin')
on conflict do nothing;

insert into public.company_settings (company_id, key, value)
select c.id, v.key, v.value::jsonb
from public.companies c
cross join (
  values
    ('currency', '{"default":"UGX"}'),
    ('timezone', '{"default":"Africa/Kampala"}'),
    ('collections', '{"receipt_prefix":"DPM","default_grace_days":0}'),
    ('attendance', '{"grace_minutes":10,"require_gps":true,"require_approved_device":false}')
) as v(key, value)
where c.name = 'Ddumba Property Management'
on conflict (company_id, key) do update set value = excluded.value;

insert into public.property_landlords (
  company_id,
  property_id,
  landlord_id,
  ownership_percentage,
  is_primary
)
select
  p.company_id,
  p.id,
  p.landlord_id,
  100,
  true
from public.properties p
where p.landlord_id is not null
  and p.company_id is not null
on conflict (property_id, landlord_id) do nothing;

insert into public.room_status_history (
  company_id,
  office_id,
  room_id,
  old_status,
  new_status,
  reason
)
select
  r.company_id,
  r.office_id,
  r.id,
  null,
  coalesce(r.status, 'Occupied'),
  'Initial enterprise upgrade snapshot'
from public.rooms r
where r.company_id is not null
  and r.office_id is not null
  and not exists (
    select 1 from public.room_status_history h where h.room_id = r.id
  );

insert into public.leases (
  company_id,
  office_id,
  property_id,
  room_id,
  tenant_id,
  start_date,
  monthly_rent,
  deposit_amount,
  billing_day,
  status
)
select
  t.company_id,
  coalesce(t.office_id, r.office_id, p.office_id),
  coalesce(t.property_id, r.property_id),
  t.room_id,
  t.id,
  coalesce(t.created_at::date, current_date),
  coalesce(t.monthly_rent, r.monthly_rent, 0),
  0,
  1,
  'active'
from public.tenants t
left join public.rooms r on r.id = t.room_id
left join public.properties p on p.id = coalesce(t.property_id, r.property_id)
where t.company_id is not null
  and t.room_id is not null
  and coalesce(t.office_id, r.office_id, p.office_id) is not null
  and coalesce(t.property_id, r.property_id) is not null
  and not exists (
    select 1 from public.leases l where l.tenant_id = t.id and l.room_id = t.room_id and l.status = 'active'
  );

update public.collections c
set lease_id = coalesce(c.lease_id, l.id)
from public.leases l
where c.tenant_id = l.tenant_id
  and c.room_id = l.room_id
  and c.lease_id is null;

update public.promises p
set lease_id = coalesce(p.lease_id, l.id)
from public.leases l
where p.tenant_id = l.tenant_id
  and p.room_id = l.room_id
  and p.lease_id is null;

insert into public.rent_invoices (
  company_id,
  office_id,
  lease_id,
  tenant_id,
  invoice_number,
  invoice_date,
  due_date,
  subtotal,
  total_amount,
  amount_paid,
  status
)
select
  t.company_id,
  l.office_id,
  l.id,
  t.id,
  'LEGACY-BAL-' || t.id::text,
  coalesce(t.created_at::date, current_date),
  coalesce(t.created_at::date, current_date),
  greatest(coalesce(t.balance, 0), 0),
  greatest(coalesce(t.balance, 0), 0),
  0,
  case when coalesce(t.balance, 0) > 0 then 'open' else 'paid' end
from public.tenants t
join public.leases l on l.tenant_id = t.id and l.status = 'active'
where coalesce(t.balance, 0) > 0
on conflict (company_id, invoice_number) do nothing;

insert into public.invoice_lines (
  company_id,
  invoice_id,
  line_type,
  description,
  amount
)
select
  ri.company_id,
  ri.id,
  'legacy_balance',
  'Legacy tenant balance imported during enterprise upgrade',
  ri.total_amount
from public.rent_invoices ri
where ri.invoice_number like 'LEGACY-BAL-%'
  and not exists (
    select 1 from public.invoice_lines il where il.invoice_id = ri.id and il.line_type = 'legacy_balance'
  );

insert into public.payments (
  company_id,
  office_id,
  tenant_id,
  lease_id,
  reference_number,
  amount,
  payment_method,
  paid_at,
  status,
  notes
)
select
  c.company_id,
  c.office_id,
  c.tenant_id,
  c.lease_id,
  'LEGACY-COL-' || c.id::text,
  greatest(coalesce(c.amount_paid, c.amount, 0), 0.01),
  coalesce(c.payment_method, 'legacy'),
  coalesce(c.created_at::timestamptz, now()),
  'posted',
  'Legacy collection imported during enterprise upgrade'
from public.collections c
where c.company_id is not null
  and c.office_id is not null
  and c.tenant_id is not null
  and greatest(coalesce(c.amount_paid, c.amount, 0), 0) > 0
on conflict (company_id, reference_number) do nothing;

insert into public.tenant_ledger_entries (
  company_id,
  office_id,
  tenant_id,
  lease_id,
  source_type,
  source_id,
  entry_type,
  amount,
  balance_after,
  description
)
select
  t.company_id,
  l.office_id,
  t.id,
  l.id,
  'legacy_tenant_balance',
  t.id,
  'debit',
  greatest(coalesce(t.balance, 0), 0),
  coalesce(t.balance, 0),
  'Legacy tenant balance imported during enterprise upgrade'
from public.tenants t
join public.leases l on l.tenant_id = t.id and l.status = 'active'
where coalesce(t.balance, 0) > 0
  and not exists (
    select 1
    from public.tenant_ledger_entries tle
    where tle.source_type = 'legacy_tenant_balance'
      and tle.source_id = t.id
  );

insert into public.cash_accounts (
  company_id,
  office_id,
  account_type,
  name,
  currency,
  status
)
select
  o.company_id,
  o.id,
  'office_cash',
  coalesce(o.name, o.office_name) || ' Cash Account',
  'UGX',
  'active'
from public.offices o
where o.company_id is not null
  and not exists (
    select 1 from public.cash_accounts ca where ca.office_id = o.id and ca.account_type = 'office_cash'
  );

insert into public.cash_transactions (
  company_id,
  office_id,
  cash_account_id,
  transaction_type,
  source_type,
  source_id,
  amount,
  transaction_date,
  description
)
select
  c.company_id,
  c.office_id,
  ca.id,
  'inflow',
  'legacy_collection',
  c.id,
  greatest(coalesce(c.amount_paid, c.amount, 0), 0.01),
  coalesce(c.created_at::timestamptz, now()),
  'Legacy collection cash inflow imported during enterprise upgrade'
from public.collections c
join public.cash_accounts ca on ca.office_id = c.office_id and ca.account_type = 'office_cash'
where greatest(coalesce(c.amount_paid, c.amount, 0), 0) > 0
  and not exists (
    select 1 from public.cash_transactions ct where ct.source_type = 'legacy_collection' and ct.source_id = c.id
  );
