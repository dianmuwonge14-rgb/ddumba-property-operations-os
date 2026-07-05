# Deployment Attempt Report

## Status

Deployment stopped before applying migrations.

No migrations were pushed.
No tables were dropped.
No data was deleted.
No columns were dropped.
No frontend deployment was performed.

## Project Verification

Target project:

- Project ref: `nkypietptxwzdfesyawx`
- Project name: `Ddumba-attendance`
- Status: active/healthy

The local repo was successfully linked to the Supabase project.

## Migration Dry Run

The Supabase CLI dry run showed these migrations would be applied:

1. `0001_core_identity_settings.sql`
2. `0002_property_tenant_leasing.sql`
3. `0003_finance_collections_cash_approvals.sql`
4. `0004_operations_reporting_ai_automation.sql`
5. `0005_indexes_triggers_audit.sql`
6. `0006_rls_roles_permissions.sql`
7. `0007_seed_defaults.sql`

## Why Deployment Was Stopped

The remote public schema already contains existing tables that overlap with the Version 1.0 Enterprise schema:

- `ai_insights`
- `employees`
- `expenses`
- `landlords`
- `office_scores`
- `offices`
- `promises`
- `properties`
- `rooms`
- `tenants`

Those existing tables do not match the new enterprise table definitions. For example:

- Existing `offices` uses `office_name` and `office_code`.
- Enterprise v1 expects `name`, `code`, and `company_id`.
- Existing `tenants` directly references `room_id`, `property_id`, and `office_id`.
- Enterprise v1 moves tenancy through `leases` and company-scoped relationships.

Applying the greenfield migrations as-is would likely fail and could replace existing named RLS policies/triggers in later migrations.

## Existing Remote Row Counts

Existing data was found:

| Table | Rows |
|---|---:|
| `offices` | 5 |
| `landlords` | 3 |
| `properties` | 3 |
| `rooms` | 5 |
| `tenants` | 3 |

Other inspected operational tables currently had zero rows.

## Existing Policies And Triggers

Existing public RLS policies:

- `rooms`: `Allow read access`
- `tenants`: `Allow read access`

Existing public triggers:

- None found.

## Safe Next Options

### Option A: Fresh Test Project

Recommended for validating the enterprise schema quickly.

Create a new disposable Supabase project and run the current Version 1.0 Enterprise migrations there. This avoids touching the existing project data and lets us validate all migrations, RLS, triggers, seed data, and generated types.

### Option B: Non-Destructive Upgrade Migration

Recommended if `nkypietptxwzdfesyawx` must remain the target project.

Create a compatibility migration that:

1. Adds `companies`.
2. Adds `company_id` columns to existing tables where needed.
3. Backfills the current Ddumba company ID.
4. Adds missing columns to existing tables instead of recreating them.
5. Creates new enterprise tables that do not already exist.
6. Preserves existing rows in `offices`, `landlords`, `properties`, `rooms`, and `tenants`.
7. Preserves or deliberately replaces existing RLS policies only after explicit approval.
8. Adds compatibility views if the current app still expects old column names.

### Option C: Parallel Enterprise Schema

Create the enterprise schema under a new PostgreSQL schema, such as `enterprise_v1`, while leaving existing public tables untouched. This is safest for coexistence but requires the app to query the new schema explicitly.

## Recommendation

Do not apply the current greenfield migrations to the existing project.

Proceed with either:

1. A fresh test Supabase project for initial validation, or
2. A non-destructive upgrade migration for the current project.
