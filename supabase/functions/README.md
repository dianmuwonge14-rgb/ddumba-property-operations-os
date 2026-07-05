# Database Functions

Primary functions currently live in migrations:

- `set_updated_at()`
- `audit_table_change()`
- `prevent_change_on_append_only()`
- `current_company_id()`
- `is_service_role()`
- `has_permission(permission_key text)`
- `is_company_admin()`
- `can_access_office(target_office_id uuid)`
- `can_manage_office(target_office_id uuid)`
- `can_access_entity(entity_company_id uuid, entity_office_id uuid)`

Future RPC functions should be added in dedicated migrations for:

- Posting payments.
- Reversing payments.
- Generating rent invoices.
- Generating landlord settlements.
- Generating cash positions.
- Generating KPI snapshots.
- Running AI validation batches.
