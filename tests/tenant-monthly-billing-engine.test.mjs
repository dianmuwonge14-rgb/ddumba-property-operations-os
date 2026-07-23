import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(new URL("../supabase/upgrade_migrations/0209_tenant_monthly_billing_engine.sql", import.meta.url), "utf8");
const billingHelper = readFileSync(new URL("../lib/tenants/billing-cycle.ts", import.meta.url), "utf8");
const billingAction = readFileSync(new URL("../app/actions/tenant-billing.ts", import.meta.url), "utf8");
const paymentsEntry = readFileSync(new URL("../components/office/payments/FastPaymentsEntry.tsx", import.meta.url), "utf8");
const tenantSnapshot = readFileSync(new URL("../components/office/collections/TenantSnapshot.tsx", import.meta.url), "utf8");
const dueRoute = readFileSync(new URL("../app/api/billing/due-intelligence/route.ts", import.meta.url), "utf8");
const scheduledRoute = readFileSync(new URL("../app/api/billing/run/route.ts", import.meta.url), "utf8");
const pgCronMigration = readFileSync(new URL("../supabase/upgrade_migrations/0210_tenant_billing_hourly_pg_cron.sql", import.meta.url), "utf8");
const fastLookupBillingMigration = readFileSync(new URL("../supabase/upgrade_migrations/0211_fast_payment_lookup_billing_fields.sql", import.meta.url), "utf8");
const fastPaymentSearchMigration = readFileSync(new URL("../supabase/upgrade_migrations/0214_fast_payments_entry_tenant_search.sql", import.meta.url), "utf8");
const paymentSearchRoute = readFileSync(new URL("../app/api/collections/payment-search/route.ts", import.meta.url), "utf8");
const collectionsData = readFileSync(new URL("../lib/collections/data.ts", import.meta.url), "utf8");

function clampDay(year, monthIndex, day) {
  return Math.min(day, new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate());
}

function dateForBillingDay(year, monthIndex, billingDay) {
  return new Date(Date.UTC(year, monthIndex, clampDay(year, monthIndex, billingDay))).toISOString().slice(0, 10);
}

function addBillingMonths(dateOnly, months, billingDay) {
  const [year, month] = dateOnly.split("-").map(Number);
  const targetMonthIndex = month - 1 + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedMonthIndex = ((targetMonthIndex % 12) + 12) % 12;
  return dateForBillingDay(targetYear, normalizedMonthIndex, billingDay);
}

test("missing billing day defaults to day 1 and can be updated live", () => {
  assert.match(migration, /add column if not exists billing_day int/);
  assert.match(migration, /where status = 'active'[\s\S]*billing_day is null/);
  assert.match(migration, /set billing_day = 1/);
  assert.match(billingAction, /setTenantBillingDate/);
  assert.match(billingAction, /Billing date updated successfully/);
  assert.match(billingAction, /\.from\("tenants"\)[\s\S]*billing_day/);
  assert.match(billingAction, /\.from\("leases"\)[\s\S]*billing_day/);
});

test("billing days 29, 30 and 31 bill on the last valid short-month day", () => {
  assert.equal(addBillingMonths("2026-01-29", 1, 29), "2026-02-28");
  assert.equal(addBillingMonths("2026-01-30", 1, 30), "2026-02-28");
  assert.equal(addBillingMonths("2026-01-31", 1, 31), "2026-02-28");
  assert.equal(addBillingMonths("2024-01-31", 1, 31), "2024-02-29");
  assert.equal(addBillingMonths("2026-02-28", 1, 31), "2026-03-31");
  assert.match(billingHelper, /daysInMonth/);
  assert.match(billingHelper, /dateForBillingDay/);
});

test("monthly rent charges are idempotent per tenant billing period", () => {
  assert.match(migration, /uniq_tenant_rent_months_coverage_period/);
  assert.match(migration, /coverage_start, coverage_end/);
  assert.match(migration, /on conflict do nothing/);
  assert.match(migration, /duplicates_prevented/);
  assert.match(migration, /while v_due_date <= p_business_date/);
});

test("vacant, inactive and vacated tenants are skipped by live billing repair", () => {
  assert.match(migration, /t\.status = 'active'/);
  assert.match(migration, /t\.room_id is not null/);
  assert.match(migration, /lower\(coalesce\(r\.status, 'occupied'\)\) in \('occupied','active'\)/);
  assert.doesNotMatch(migration, /lower\(coalesce\(r\.status.*vacant/);
});

test("payments and tenant detail screens expose the Set Billing Date control", () => {
  assert.match(paymentsEntry, /TenantBillingDateControl/);
  assert.match(paymentsEntry, /Set Billing Date|billingAnniversaryDay/);
  assert.match(paymentsEntry, /reloadRoomDetails\(selectedTenant\.room\.room_number, selectedTenant\.tenant\.id\)/);
  assert.match(tenantSnapshot, /TenantBillingDateControl/);
  assert.match(tenantSnapshot, /lastRentChargeDate/);
  assert.match(tenantSnapshot, /onSaved/);
});

test("scheduled billing automation runs hourly and does not depend on page loads", () => {
  assert.match(scheduledRoute, /run_monthly_rent_rollover/);
  assert.match(scheduledRoute, /scheduled_hourly/);
  assert.match(scheduledRoute, /x-vercel-cron|CRON_SECRET/);
  assert.match(pgCronMigration, /pg_cron/);
  assert.match(pgCronMigration, /ddumba_tenant_billing_hourly/);
  assert.match(pgCronMigration, /'0 \* \* \* \*'/);
});

test("overdue rent intelligence uses a small indexed live sample", () => {
  assert.match(dueRoute, /\.gt\("balance", 0\)/);
  assert.match(dueRoute, /\.limit\(80\)/);
  assert.match(dueRoute, /\.slice\(0, 10\)/);
  assert.match(dueRoute, /Due today/);
  assert.match(dueRoute, /1-7 days overdue/);
  assert.match(dueRoute, /8-30 days overdue/);
  assert.match(dueRoute, /Over 30 days overdue/);
});

test("migration adds performance indexes for billing and outstanding lookups", () => {
  assert.match(migration, /idx_tenants_company_office_status_billing/);
  assert.match(migration, /idx_tenants_company_room_status_balance/);
  assert.match(migration, /idx_leases_company_status_billing/);
  assert.match(migration, /idx_tenant_rent_months_due_lookup/);
  assert.match(migration, /idx_tenant_rent_months_coverage_lookup/);
});

test("fast payment lookup returns saved billing day and lease start for immediate refresh", () => {
  assert.match(fastLookupBillingMigration, /tenant_billing_day int/);
  assert.match(fastLookupBillingMigration, /lease_billing_day int/);
  assert.match(fastLookupBillingMigration, /lease_start_date date/);
  assert.match(fastLookupBillingMigration, /coalesce\(l\.billing_day, t\.billing_day, 1\) as lease_billing_day/);
  assert.match(fastLookupBillingMigration, /coalesce\(t\.billing_day, l\.billing_day, 1\) as tenant_billing_day/);
});

test("payments entry tenant search is compact, debounced, abortable and role-scoped", () => {
  assert.match(paymentsEntry, /setTimeout\(\(\) => \{/);
  assert.match(paymentsEntry, /\}, 250\)/);
  assert.match(paymentsEntry, /lookup\.length < 2/);
  assert.match(paymentsEntry, /abortRef\.current\?\.abort\(\)/);
  assert.match(paymentsEntry, /\/api\/collections\/payment-search\?/);
  assert.match(paymentsEntry, /\/api\/collections\/tenant\?id=/);
  assert.match(paymentsEntry, /All company offices/);
  assert.match(paymentsEntry, /params\.set\("allOffices", "1"\)/);
  assert.match(paymentsEntry, /params\.set\("officeId", adminSearchOfficeId\)/);
  assert.match(collectionsData, /searchFastPaymentTenants/);
  assert.match(collectionsData, /search_payment_tenants_fast/);
  assert.match(collectionsData, /const canAccessCompanyWide = context\.canAccessAllOffices \|\| context\.isCompanyAdmin/);
  assert.match(collectionsData, /const canSearchAllOffices = canAccessCompanyWide && !selectedOfficeId && options\.allOffices !== false/);
  assert.match(collectionsData, /p_company_id: companyId/);
  assert.match(paymentSearchRoute, /max-age=10/);
  assert.match(paymentSearchRoute, /officeId/);
  assert.match(fastPaymentSearchMigration, /idx_payments_entry_tenants_name_trgm/);
  assert.match(fastPaymentSearchMigration, /idx_payments_entry_tenants_phone_digits_trgm/);
  assert.match(fastPaymentSearchMigration, /search_payment_tenants_fast/);
  assert.match(fastPaymentSearchMigration, /limit \(select result_limit from search_input\)/);
});
