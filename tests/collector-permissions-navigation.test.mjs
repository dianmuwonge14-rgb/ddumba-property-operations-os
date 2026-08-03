import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const sidebarSource = readFileSync(new URL("../components/office/shared/OfficeSidebar.tsx", import.meta.url), "utf8");
const defaultersData = readFileSync(new URL("../lib/defaulters/data.ts", import.meta.url), "utf8");
const defaultersConsole = readFileSync(new URL("../components/office/defaulters/DefaultersConsole.tsx", import.meta.url), "utf8");
const collectorDefaultersPage = readFileSync(new URL("../app/office/collector/defaulters/page.tsx", import.meta.url), "utf8");
const collectorDefaultersError = readFileSync(new URL("../app/office/collector/defaulters/error.tsx", import.meta.url), "utf8");
const receiptsAction = readFileSync(new URL("../app/actions/receipts.ts", import.meta.url), "utf8");
const collectorsAction = readFileSync(new URL("../app/actions/collectors.ts", import.meta.url), "utf8");
const collectionData = readFileSync(new URL("../lib/collections/data.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/upgrade_migrations/0219_collector_receipt_history_and_defaulters_access.sql", import.meta.url), "utf8");
const musakiraRepairMigration = readFileSync(new URL("../supabase/upgrade_migrations/0248_field_collector_musakira_permission_repair.sql", import.meta.url), "utf8");
const leopardRepairMigration = readFileSync(new URL("../supabase/upgrade_migrations/0252_leopard_collector_employee_salary_linkage.sql", import.meta.url), "utf8");

test("collector navigation includes defaulters in the agreed operational order", () => {
  const collectorNav = sidebarSource.slice(sidebarSource.indexOf("const collectorSections"));
  const order = [
    '/office/collector", label: "Dashboard"',
    '/office/collector/payments", label: "Payments Entry"',
    '/office/receipts", label: "Receipt History"',
    '/office/security-deposits", label: "Security Deposits"',
    '/office/collector/daily", label: "Collections"',
    '/office/collector/defaulters", label: "Defaulters"',
    '/office/collector/promises", label: "Promise Centre"',
  ];
  let cursor = -1;
  for (const marker of order) {
    const next = collectorNav.indexOf(marker);
    assert.ok(next > cursor, `${marker} should appear after the previous collector nav item`);
    cursor = next;
  }
});

test("collector defaulters route is collector-only and uses collector workflows", () => {
  assert.match(collectorDefaultersPage, /isCollectorContext\(context\)/);
  assert.match(collectorDefaultersPage, /redirect\("\/office\/defaulters"\)/);
  assert.match(defaultersData, /const isCollector = isCollectorContext\(context\)/);
  assert.match(defaultersData, /collectorOfficeIds/);
  assert.match(defaultersData, /return query\.in\("office_id", collectorScopedOfficeIds\)/);
  assert.match(defaultersConsole, /data\.isCollector \? "\/office\/collector\/payments"/);
  assert.match(defaultersConsole, /data\.isCollector \? "\/office\/collector\/promises"/);
  assert.match(defaultersConsole, /Collector defaulters/);
});

test("collector defaulters support authorised office and landlord filters", () => {
  assert.match(collectorDefaultersPage, /searchParams/);
  assert.match(collectorDefaultersPage, /officeId: scalar\(params\.officeId\)/);
  assert.match(collectorDefaultersPage, /landlordId: scalar\(params\.landlordId\)/);
  assert.match(defaultersData, /requestedOfficeId/);
  assert.match(defaultersData, /requestedLandlordId/);
  assert.match(defaultersData, /collectorScopedOfficeIds/);
  assert.match(defaultersData, /You do not have permission to view defaulters for that office/);
  assert.match(defaultersData, /You do not have permission to view defaulters for that landlord/);
  assert.match(defaultersData, /landlordOfficeIds/);
  assert.match(defaultersData, /room\.landlord_id \?\? property\?\.landlord_id/);
});

test("collector defaulters UI exposes dependent assigned-office and searchable landlord filters", () => {
  assert.match(defaultersConsole, /All Assigned Offices/);
  assert.match(defaultersConsole, /All Landlords/);
  assert.match(defaultersConsole, /landlordOptions/);
  assert.match(defaultersConsole, /landlord\.officeIds\.includes\(officeId\)/);
  assert.match(defaultersConsole, /changeOffice/);
  assert.match(defaultersConsole, /changeLandlord/);
  assert.match(defaultersConsole, /pushCollectorFilters/);
  assert.match(defaultersConsole, /router\.push\(`\/office\/collector\/defaulters/);
  assert.match(defaultersConsole, /SearchableFilterSelect/);
  assert.match(defaultersConsole, /Search landlords/);
  assert.match(defaultersConsole, /Reset Filters/);
  assert.match(defaultersConsole, /Showing: \{filteredDefaulters\.length\.toLocaleString\(\)\} Defaulters/);
});

test("collector defaulters permission errors are safe and resettable", () => {
  assert.match(collectorDefaultersError, /Defaulters data could not be loaded/);
  assert.match(collectorDefaultersError, /selected office or landlord filter may not be authorised/);
  assert.match(collectorDefaultersError, /Reset Filters/);
  assert.doesNotMatch(collectorDefaultersError, /error\.message/);
});

test("receipt modal permission uses the same collector company-scope guard as print and sharing", () => {
  assert.match(receiptsAction, /const receipt = await getPaymentReceipt\(receiptId\)/);
  assert.match(receiptsAction, /assertReceiptPermission\(context, receipt\)/);
  assert.match(receiptsAction, /if \(context\.authMode === "collector"\) return true/);
});

test("database policies allow field collectors to select company receipt history only", () => {
  assert.match(migration, /ddumba_v1_is_field_collector/);
  assert.match(migration, /company_id = public\.ddumba_v1_current_company_id\(\)/);
  assert.match(migration, /coalesce\(u\.account_type, ''\) in \('field_collector', 'collector'\)/);
  assert.match(migration, /drop policy if exists payment_receipts_select/);
  assert.match(migration, /drop policy if exists payment_receipt_delivery_logs_select/);
  assert.doesNotMatch(migration, /alter table public\.payment_receipts disable row level security/);
});

test("field collectors use the company-wide payment search scope", () => {
  assert.match(collectionData, /const isFieldCollector = context\.authMode === "collector"/);
  assert.match(collectionData, /role\.role\?\.key === "field_collector"/);
  assert.match(collectionData, /context\.canAccessAllOffices \|\| context\.isCompanyAdmin \|\| isFieldCollector/);
  assert.match(collectionData, /p_search_all: canSearchAllOffices/);
});

test("Musakira collector repair normalises the existing account without duplicates", () => {
  assert.match(musakiraRepairMigration, /alter table public\.field_collector_profiles\s+add column if not exists employee_id/);
  assert.match(musakiraRepairMigration, /'collections\.read'/);
  assert.match(musakiraRepairMigration, /'collections\.payment\.post'/);
  assert.match(musakiraRepairMigration, /'defaulters\.view'/);
  assert.match(musakiraRepairMigration, /lower\(regexp_replace\(coalesce\(e\.full_name, ''\), '\\s\+', ' ', 'g'\)\) = 'musakira adam'/);
  assert.match(musakiraRepairMigration, /scope = 'company'/);
  assert.match(musakiraRepairMigration, /office_id = null/);
  assert.doesNotMatch(musakiraRepairMigration, /insert into public\.employees/i);
  assert.doesNotMatch(musakiraRepairMigration, /insert into public\.users/i);
});

test("field collector creation requires and stores a real employee linkage", () => {
  assert.match(collectorsAction, /Create or link a real employee before creating a Field Collector account/);
  assert.match(collectorsAction, /Multiple employees match this collector/);
  assert.match(collectorsAction, /employee_id: linkedEmployee\.id/);
  assert.match(collectorsAction, /\.from\("employees"\)/);
  assert.match(collectorsAction, /\.update\(\{ user_id: authUser\.user\.id/);
});

test("Leopard collector repair links the existing account and backfills collection attribution only", () => {
  assert.match(leopardRepairMigration, /lower\(regexp_replace\(coalesce\(e\.full_name, ''\), '\\s\+', ' ', 'g'\)\) = 'leopard'/);
  assert.match(leopardRepairMigration, /lower\(regexp_replace\(coalesce\(u\.full_name, ''\), '\\s\+', ' ', 'g'\)\) = 'leopold nanjiibwa'/);
  assert.match(leopardRepairMigration, /update public\.users u/);
  assert.match(leopardRepairMigration, /update public\.field_collector_profiles fcp/);
  assert.match(leopardRepairMigration, /update public\.user_office_roles uor/);
  assert.match(leopardRepairMigration, /update public\.collections c/);
  assert.match(leopardRepairMigration, /collected_by_employee_id = coalesce\(c\.collected_by_employee_id, v_employee_id\)/);
  assert.match(leopardRepairMigration, /on conflict \(company_id, employee_id, month_key\) do nothing/);
  assert.doesNotMatch(leopardRepairMigration, /insert into public\.employees/i);
  assert.doesNotMatch(leopardRepairMigration, /insert into public\.users/i);
  assert.doesNotMatch(leopardRepairMigration, /set amount/i);
  assert.doesNotMatch(leopardRepairMigration, /set amount_paid/i);
});
