import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dataSource = readFileSync(new URL("../lib/defaulters/data.ts", import.meta.url), "utf8");
const consoleSource = readFileSync(new URL("../components/office/defaulters/DefaultersConsole.tsx", import.meta.url), "utf8");
const typesSource = readFileSync(new URL("../lib/defaulters/types.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/upgrade_migrations/0223_live_defaulters_balance_source.sql", import.meta.url), "utf8");
const activeOnlyMigration = readFileSync(new URL("../supabase/upgrade_migrations/0234_active_defaulters_exclude_vacant_rooms.sql", import.meta.url), "utf8");

test("defaulters are sourced directly from live positive tenant balances", () => {
  assert.match(dataSource, /const outstandingBalance = liveOutstanding\(tenant, room\);/);
  assert.match(dataSource, /displayTenantNetBalance/);
  assert.doesNotMatch(dataSource, /outstandingBalance = Math\.max\(0, amount\(tenant\.balance \?\? room\.outstanding_balance\) - prepaidForCurrentMonth\)/);
  assert.doesNotMatch(dataSource, /if \(dateOnly\(now\) <= paymentDueDate\) continue;/);
  assert.match(dataSource, /if \(outstandingBalance <= 0\) continue;/);
});

test("active defaulters exclude vacated rooms and corrected collection rows", () => {
  assert.match(dataSource, /function isOccupiedRoom/);
  assert.match(dataSource, /return status === "occupied"/);
  assert.match(dataSource, /function isActiveTenancy/);
  assert.match(dataSource, /String\(lease\.status \?\? ""\)\.toLowerCase\(\) !== "active"/);
  assert.match(dataSource, /if \(!isActiveTenancy\(lease, dateOnly\(now\)\)\) continue;/);
  assert.match(dataSource, /if \(!room \|\| !isOccupiedRoom\(room\.status\)\) continue;/);
  assert.match(dataSource, /uniqueFinanciallyEffectiveCollections\(collections\)/);
  assert.match(dataSource, /collectionAmount\(lastPayment\)/);
});

test("admin remains company-wide while offices and collectors are scoped", () => {
  assert.match(dataSource, /const isAdmin = Boolean\(options\.admin && context\.isCompanyAdmin && !context\.isOfficeMode\)/);
  assert.match(dataSource, /const readSupabase = isAdmin \? createSupabaseAdminClient\(\) : supabase/);
  assert.match(dataSource, /pagedRows<TenantRow>/);
  assert.match(dataSource, /pagedRows<RoomRow>/);
  assert.match(dataSource, /else if \(!isAdmin && activeOfficeId\)/);
  assert.match(dataSource, /return query\.in\("office_id", collectorScopedOfficeIds\)/);
  assert.doesNotMatch(dataSource, /if \(isAdmin && activeOfficeId\)/);
});

test("vacated debt and recently cleared accounts have separate list sources", () => {
  assert.match(typesSource, /source: "active_tenant" \| "vacated_debt" \| "recently_cleared"/);
  assert.match(dataSource, /from\("vacated_tenant_debts"\)/);
  assert.match(dataSource, /source: "vacated_debt"/);
  assert.match(dataSource, /source: "recently_cleared"/);
  assert.match(consoleSource, /listFilter === "active" && \(item\.source !== "active_tenant" \|\| item\.outstandingBalance <= 0\)/);
  assert.match(dataSource, /const activeItems = items\.filter\(\(item\) => item\.source === "active_tenant" && item\.outstandingBalance > 0\)/);
  assert.match(consoleSource, /const activeItems = items\.filter\(\(item\) => item\.source === "active_tenant" && item\.outstandingBalance > 0\)/);
});

test("defaulters console refreshes when balance-driving tables change", () => {
  for (const table of ["tenants", "rooms", "leases", "collections", "promises", "collection_actions", "vacated_tenant_debts", "landlord_debt_deductions"]) {
    assert.match(consoleSource, new RegExp(`table: "${table}"`));
  }
  assert.match(consoleSource, /router\.refresh\(\)/);
});

test("defaulters screen exposes required operational fields and filters", () => {
  for (const token of ["oldestUnpaidPeriod", "unpaidPeriods", "promiseStatus", "collectorAssigned", "riskLevel", "lastFollowUp", "nextRecommendedAction", "recoveryStatus", "landlordDeductionStatus"]) {
    assert.match(typesSource, new RegExp(token));
    assert.match(consoleSource, new RegExp(token));
  }
  for (const label of ["All offices", "All Landlords", "All properties", "All collectors", "Vacated with debt", "Recently cleared"]) {
    assert.match(consoleSource, new RegExp(label));
  }
});

test("migration adds live-balance indexes and reconciliation view", () => {
  for (const indexName of [
    "idx_defaulters_tenants_live_balance_scope",
    "idx_defaulters_rooms_live_balance_scope",
    "idx_defaulters_rooms_normalized_room_number",
    "idx_defaulters_tenants_normalized_phone",
    "idx_defaulters_leases_active_tenant_room",
    "idx_defaulters_vacated_debts_remaining",
  ]) {
    assert.match(migration, new RegExp(indexName));
  }
  assert.match(migration, /create or replace view public\.live_defaulter_reconciliation/);
  assert.match(activeOnlyMigration, /create or replace view public\.live_defaulter_reconciliation/);
  assert.match(activeOnlyMigration, /r\.status = 'occupied'/);
  assert.match(activeOnlyMigration, /t\.status = 'active'/);
  assert.match(activeOnlyMigration, /l\.status = 'active'/);
  assert.doesNotMatch(activeOnlyMigration, /vacated_tenant_debts d/);
});
