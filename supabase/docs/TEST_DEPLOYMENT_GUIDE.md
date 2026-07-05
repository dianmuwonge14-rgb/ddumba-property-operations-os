# Ddumba Property Operations OS

## Supabase Test Deployment Guide

This guide deploys the Version 1.0 Enterprise Edition database package to a Supabase test project.

Project ref from `.env.local`: `nkypietptxwzdfesyawx`

Use a disposable Supabase project first if possible. Do not run directly against production until all validation steps pass.

## 1. Exact SQL Migration Order

Run these files in order:

1. `supabase/migrations/0001_core_identity_settings.sql`
2. `supabase/migrations/0002_property_tenant_leasing.sql`
3. `supabase/migrations/0003_finance_collections_cash_approvals.sql`
4. `supabase/migrations/0004_operations_reporting_ai_automation.sql`
5. `supabase/migrations/0005_indexes_triggers_audit.sql`
6. `supabase/migrations/0006_rls_roles_permissions.sql`
7. `supabase/migrations/0007_seed_defaults.sql`

### Dashboard SQL Editor Path

1. Open the Supabase Dashboard.
2. Select the test project.
3. Go to SQL Editor.
4. Open each migration file locally.
5. Paste and run one migration at a time.
6. Stop immediately if any migration fails.
7. Do not skip failed migrations.

### Supabase CLI Path

Required environment variable:

```bash
export SUPABASE_ACCESS_TOKEN="your-supabase-access-token"
```

Then:

```bash
npx supabase link --project-ref nkypietptxwzdfesyawx
npx supabase db push
```

If using a fresh test database and the CLI migrations table is not initialized, prefer the Dashboard SQL Editor path for the first deployment.

## 2. Supabase Prerequisites

- Supabase project created.
- Database password saved securely.
- Supabase Auth enabled.
- Service role key stored only in server-side secret storage.
- Anon key can be public, but RLS must remain enabled.
- SQL Editor access or CLI access token available.
- A first administrator Auth user should be created after migrations.
- A matching row must be added to `public.users` for that administrator.
- That user must be assigned a company-level `company_admin` role through `public.user_office_roles`.

## 3. Required Extensions

Migration `0001` enables:

```sql
create extension if not exists pgcrypto;
```

Optional later extension:

```sql
create extension if not exists postgis;
```

PostGIS is not required for v1.0 deployment because coordinates are stored as numeric latitude/longitude fields. Add it later if geofence distance queries move into PostgreSQL.

## 4. Required Environment Variables

Client-safe:

```bash
NEXT_PUBLIC_SUPABASE_URL="https://nkypietptxwzdfesyawx.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key"
```

Server-only:

```bash
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
SUPABASE_ACCESS_TOKEN="your-cli-access-token"
SUPABASE_DB_PASSWORD="your-database-password"
```

Recommended for typed clients:

```bash
SUPABASE_PROJECT_REF="nkypietptxwzdfesyawx"
```

Future provider secrets:

```bash
MTN_MOMO_API_KEY=""
MTN_MOMO_SUBSCRIPTION_KEY=""
AIRTEL_MONEY_CLIENT_ID=""
AIRTEL_MONEY_CLIENT_SECRET=""
SMS_PROVIDER_API_KEY=""
WHATSAPP_PROVIDER_TOKEN=""
EMAIL_PROVIDER_API_KEY=""
OPENAI_API_KEY=""
```

Never expose service role, provider secrets, database password, or access token to the browser.

## 5. Required Storage Buckets

Create these private buckets before enabling file upload:

| Bucket | Purpose |
|---|---|
| `tenant-documents` | National IDs, tenant records, tenant verification files. |
| `lease-documents` | Signed agreements and lease attachments. |
| `property-inspections` | Inspection photos, reports, findings evidence. |
| `expense-receipts` | Expense receipt files. |
| `landlord-statements` | Generated landlord statement PDFs. |
| `report-exports` | Generated reports and consolidated exports. |
| `payroll-exports` | Payroll export files. |
| `backup-artifacts` | Backup metadata artifacts if stored in Supabase Storage. |
| `communication-attachments` | Attachments for email/WhatsApp/SMS workflows. |

All buckets should be private. Access should be mediated through signed URLs and RLS-aware server actions/API routes.

## 6. Edge Functions Required

No Edge Functions are strictly required to run the schema migration.

Recommended before production workflows go live:

| Function | Purpose |
|---|---|
| `post-payment` | Validates payment, creates receipt, ledger entry, and cash transaction atomically. |
| `reverse-payment` | Handles reversals and audit trail. |
| `generate-rent-invoices` | Scheduled rent invoice generation. |
| `generate-landlord-settlements` | Settlement periods, lines, statements, and payout preparation. |
| `reconcile-provider-transactions` | MTN/Airtel/bank transaction matching. |
| `send-notifications` | Sends SMS, WhatsApp, email and records delivery attempts. |
| `generate-cash-position` | Daily office and company cash positions. |
| `generate-kpi-snapshots` | Executive KPI snapshots and dashboard cache refreshes. |
| `attendance-check-in` | GPS/device/PIN attendance validation. |
| `run-ai-validation` | AI master spreadsheet validation, duplicates, missing data, suggestions. |
| `backup-monitor` | Backup job/run/artifact metadata and restore drill status. |

## 7. Authentication Settings Required

Recommended Supabase Auth settings:

- Disable public signups unless onboarding is controlled.
- Require email confirmation for administrative users.
- Enable MFA for company admins, finance managers, and HQ executives.
- Configure allowed redirect URLs for local, staging, and production domains.
- Use Supabase Auth user IDs as `public.users.id`.
- Do not store raw PINs. `pin_credentials.pin_hash` must contain a secure hash only.
- Use `user_devices` and `device_attendance_locks` for attendance/device restrictions.
- Assign permissions through `roles`, `permissions`, `role_permissions`, and `user_office_roles`.

## 8. Type Generation

Pre-deployment planned-schema types have been generated locally:

```text
types/database.types.ts
```

After the migrations are deployed, regenerate official live Supabase types:

```bash
export SUPABASE_ACCESS_TOKEN="your-supabase-access-token"
npx supabase gen types typescript --project-id nkypietptxwzdfesyawx --schema public > types/database.types.ts
```

The live generation command currently requires `SUPABASE_ACCESS_TOKEN` or `supabase login`.

## 9. Smoke Test Queries

After migration, run:

```sql
select count(*) from public.companies;
select count(*) from public.offices;
select count(*) from public.permissions;
select count(*) from public.roles;

select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
```

Expected:

- `companies` has at least the Ddumba seed company.
- `offices` has Lugonjo, Kigungu, Kapeeka, and Mbale.
- `permissions` has default permission registry rows.
- `roles` has default system role templates.
- Every public table has RLS enabled.
