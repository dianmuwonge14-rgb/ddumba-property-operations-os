-- Phase 23: expose global role templates for authenticated RBAC loading.
-- Company-specific roles remain governed by the existing company policy.

drop policy if exists ddumba_v1_roles_global_template_read on public.roles;
create policy ddumba_v1_roles_global_template_read
on public.roles
for select
to public
using (
  public.ddumba_v1_is_service_role()
  or (
    auth.role() = 'authenticated'
    and company_id is null
  )
);
