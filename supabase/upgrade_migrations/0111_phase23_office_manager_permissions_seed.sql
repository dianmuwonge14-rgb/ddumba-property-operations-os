-- Phase 23: operational permissions for office manager accounts.
-- Additive only: grants existing permissions to the existing office_manager role.

insert into public.role_permissions(role_id, permission_id, created_at)
select r.id, p.id, now()
from public.roles r
join public.permissions p on p.key in (
  'dashboard.view',
  'collections.view',
  'collections.read',
  'collections.manage',
  'collections.payment.post',
  'promises.view',
  'promises.manage',
  'properties.view',
  'properties.read',
  'properties.manage',
  'landlords.view',
  'landlords.read',
  'landlords.manage',
  'expenses.view',
  'expenses.read',
  'expenses.manage',
  'attendance.view',
  'attendance.read',
  'attendance.manage',
  'reports.view',
  'reports.read',
  'ai.view',
  'ai.read',
  'notifications.view',
  'cash.read',
  'field.read'
)
where r.key = 'office_manager'
on conflict (role_id, permission_id) do nothing;
