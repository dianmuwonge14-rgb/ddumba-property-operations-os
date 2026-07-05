-- Phase 23: allow authenticated users to read permissions for their assigned roles.
-- Without this, office users can authenticate but cannot load RBAC permissions.

alter table public.role_permissions enable row level security;

drop policy if exists ddumba_v1_role_permissions_assigned_read on public.role_permissions;
create policy ddumba_v1_role_permissions_assigned_read
on public.role_permissions
for select
to public
using (
  public.ddumba_v1_is_service_role()
  or exists (
    select 1
    from public.user_office_roles uor
    where uor.role_id = role_permissions.role_id
      and uor.user_id = auth.uid()
      and uor.company_id = public.ddumba_v1_current_company_id()
  )
  or public.ddumba_v1_has_permission('settings.manage')
);
