# Ddumba Property Operations OS Supabase Package

Architecture freeze: Version 1.0 Enterprise Edition.

## Folder Structure

- `migrations/`: executable Supabase SQL migrations in deployment order.
- `policies/`: policy notes and future hand-authored policy overrides.
- `functions/`: database function notes and future RPC/function definitions.
- `triggers/`: trigger notes and future trigger-only migrations.
- `seed/`: seed-data notes and optional environment-specific seed files.
- `docs/`: approval report, deployment checklist, and architecture notes.

## Migration Order

1. `0001_core_identity_settings.sql`
2. `0002_property_tenant_leasing.sql`
3. `0003_finance_collections_cash_approvals.sql`
4. `0004_operations_reporting_ai_automation.sql`
5. `0005_indexes_triggers_audit.sql`
6. `0006_rls_roles_permissions.sql`
7. `0007_seed_defaults.sql`

## Deployment Principle

Run migrations in order against a non-production Supabase project first. Generate TypeScript database types after migration validation and before wiring application queries.

## Deployment Docs

- `docs/TEST_DEPLOYMENT_GUIDE.md`
- `docs/FINAL_PRODUCTION_READINESS_REPORT.md`
- `docs/PRODUCTION_DEPLOYMENT_CHECKLIST.md`
