# Production Deployment Checklist

## Before Migration

- Confirm a dedicated production Supabase project exists.
- Confirm service role keys are stored only in server-side secret storage.
- Confirm `NEXT_PUBLIC_SUPABASE_ANON_KEY` is treated as public and all access is protected by RLS.
- Review seed data in `0007_seed_defaults.sql` and adjust office/company details.
- Confirm backup and restore plan for the target project.
- Confirm storage buckets and object policies for attachments are designed before enabling document upload.
- Confirm payment provider credentials for MTN Mobile Money, Airtel Money, and bank imports are not stored in plain text.

## Migration Execution

- Apply migrations in numeric order.
- Stop immediately if any migration fails.
- Verify all tables have RLS enabled.
- Verify no direct update/delete succeeds on append-only tables.
- Verify finance-sensitive inserts require the correct permissions.
- Verify service-role jobs can insert audit logs, ledger entries, cash transactions, and snapshots.

## Post-Migration Validation

- Generate Supabase TypeScript types.
- Create the first admin user in Supabase Auth.
- Create a matching `public.users` row for the admin.
- Assign the admin user a company-level `company_admin` role.
- Test office isolation with at least two office-scoped users.
- Test HQ reporting access with a company-level executive role.
- Test payment posting, receipt creation, ledger entry creation, and audit logging.
- Test attendance check-in with GPS and device metadata.
- Test notification delivery failure recording.
- Test landlord settlement generation and payout workflow.
- Test dashboard snapshot generation using service role.

## Production Guardrails

- Do not expose service role keys to the browser.
- Do not write directly to ledger, audit, receipt, or cash transaction tables from client components.
- Use server-side functions or trusted backend jobs for final financial posting.
- Use scheduled jobs for cash positions, arrears snapshots, KPI snapshots, office scores, and company consolidation.
- Archive or partition high-volume tables once data volume requires it.
