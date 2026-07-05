# RLS Policies

Primary RLS implementation lives in:

- `../migrations/0006_rls_roles_permissions.sql`

Policy model:

- Company isolation through `company_id`.
- Office isolation through `office_id`.
- Headquarters oversight through company-level roles with `office_id = null`.
- Finance-sensitive tables use explicit policies instead of generic write policies.
- Append-oriented tables are protected by RLS and trigger-level update/delete blocking.
