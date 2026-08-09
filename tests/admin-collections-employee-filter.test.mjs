import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dataSource = readFileSync(new URL("../lib/collections/data.ts", import.meta.url), "utf8");
const typesSource = readFileSync(new URL("../lib/collections/types.ts", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("../app/api/collections/report/route.ts", import.meta.url), "utf8");
const uiSource = readFileSync(new URL("../components/office/collections/CollectionsRecordsCentre.tsx", import.meta.url), "utf8");
const actionSource = readFileSync(new URL("../app/actions/collections.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/upgrade_migrations/0249_admin_collections_employee_filter.sql", import.meta.url), "utf8");

test("admin collections report supports stable employee filters and summaries", () => {
  for (const token of [
    "employeeId?: string",
    "CollectionEmployeeOption",
    "EmployeeCollectionSummary",
    "employeeOptions",
    "selectedEmployeeSummary",
    "employeePerformance",
    "canUseEmployeeFilter",
  ]) {
    assert.match(typesSource, new RegExp(token));
  }

  assert.match(apiSource, /employeeId:\s*search\.get\("employeeId"\)/);
  assert.match(dataSource, /collectionEmployeeId/);
  assert.match(dataSource, /collected_by_employee_id/);
  assert.match(dataSource, /prepared_by_employee_id/);
  assert.match(dataSource, /recorded_by_employee_id/);
  assert.match(dataSource, /userById\.get\(String\(userId\)\)\?\.employee_id/);
  assert.match(dataSource, /isRealActiveEmployee/);
  assert.match(dataSource, /createSupabaseAdminClient/);
  assert.match(dataSource, /const metadataDb = createSupabaseAdminClient\(\) as unknown as DynamicDb/);
  assert.match(dataSource, /activeEmployees/);
  assert.match(dataSource, /\.from\("employees"\)[\s\S]*\.order\("full_name"/);
  assert.match(dataSource, /!employeeFilterId \|\| employeeId === employeeFilterId/);
  assert.match(dataSource, /uniqueFinanciallyEffectiveCollections/);
  assert.doesNotMatch(dataSource, /\[\.\.\.new Set\(collectionRowsWithEmployees\.map\(\(row\) => row\.employeeId\)/);
  assert.match(dataSource, /const employeeRows = grouped\.get\(employeeId\) \?\? \[\]/);
});

test("office receptionist collections report exposes office employees plus company-wide field collectors", () => {
  assert.match(dataSource, /const canUseEmployeeFilter = isAdmin \|\| Boolean\(officeId\)/);
  assert.match(dataSource, /employeeFilterId = canUseEmployeeFilter \? String\(filters\.employeeId/);
  assert.match(dataSource, /\.from\("user_office_roles"\)[\s\S]*\.eq\("office_id", officeId\)/);
  assert.match(dataSource, /fieldCollectorRoleAssignmentsRequest/);
  assert.match(dataSource, /\.from\("user_office_roles"\)[\s\S]*\.select\("user_id, employee_id, office_id, status, roles\(key, name\)"\)[\s\S]*\.eq\("company_id", companyId\)/);
  assert.match(dataSource, /activeFieldCollectorRoleAssignments/);
  assert.match(dataSource, /isFieldCollectorAssignment/);
  assert.match(dataSource, /fieldCollectorRoleEmployeeIds/);
  assert.match(dataSource, /\.from\("field_collector_profiles"\)/);
  assert.match(dataSource, /activeCollectorProfiles/);
  assert.match(dataSource, /collectorProfileEmployeeIds/);
  assert.doesNotMatch(dataSource, /userIsOfficeScoped/);
  assert.match(dataSource, /fieldCollectorEmployeeIds/);
  assert.match(dataSource, /isFieldCollectorEmployee/);
  assert.match(dataSource, /officeScopedActiveEmployeeIds/);
  assert.match(dataSource, /isCompanyWideFieldCollector/);
  assert.match(dataSource, /isCompanyWideFieldCollector && roleKey\(normalizedEmployeeRole\(employee\)\) === "employee"[\s\S]*\? "Field Collector"/);
  assert.match(dataSource, /group: isCompanyWideFieldCollector \? "field_collectors"/);
  assert.match(dataSource, /officeHistoricalCollectorsRequest/);
  assert.match(dataSource, /historicalOfficeCollections/);
  assert.match(dataSource, /historicalOfficeEmployeeIds/);
  assert.match(dataSource, /historicalOfficeUserEmployeeIds/);
  assert.match(dataSource, /isActiveAssignmentStatus/);
  assert.match(dataSource, /officeAssignedEmployeeIds/);
  assert.match(dataSource, /isAdmin[\s\S]*directEmployeeIds[\s\S]*historicalOfficeEmployeeIds[\s\S]*collectionUserEmployeeIds[\s\S]*historicalOfficeUserEmployeeIds[\s\S]*officeRoleEmployeeIds[\s\S]*officeAssignedEmployeeIds[\s\S]*officeScopedActiveEmployeeIds[\s\S]*fieldCollectorEmployeeIds/);
  assert.match(dataSource, /const optionOfficeId = !isAdmin && officeId \? officeId : employee\.office_id/);
  assert.match(uiSource, /report\.canUseEmployeeFilter \? \(/);
  assert.match(uiSource, /All Office Employees & Collectors/);
  assert.match(uiSource, /Field Collectors/);
  assert.match(uiSource, /All Office Employees & Collectors Collection Performance/);
  assert.doesNotMatch(uiSource, /initialData\.isAdmin && report\.selectedEmployeeSummary/);
});

test("collections UI exposes employee filter, totals and drill-down without redesigning the page", () => {
  for (const token of [
    "Employee / Collected By",
    "All Employees",
    "Total Collected By Employee",
    "All Employees Collection Performance",
    "View Receipt",
    "Open Payment",
    "collections-ledger",
    "employeeSearch",
    "employeeSort",
  ]) {
    assert.match(uiSource, new RegExp(token));
  }
});

test("new payments persist employee attribution and migration backfills indexed columns", () => {
  assert.match(actionSource, /authenticatedEmployeeId/);
  assert.match(actionSource, /collected_by_employee_id:\s*employeeId/);
  assert.match(actionSource, /prepared_by_employee_id:\s*employeeId/);
  assert.match(actionSource, /recorded_by_employee_id:\s*employeeId/);

  for (const token of [
    "add column if not exists recorded_by_employee_id",
    "add column if not exists collected_by_employee_id",
    "add column if not exists prepared_by_employee_id",
    "idx_collections_company_recorded_employee_payment_date",
    "idx_collections_company_collected_employee_payment_date",
    "idx_collections_company_prepared_employee_payment_date",
    "ddumba_set_collection_employee_attribution",
    "trg_ddumba_set_collection_employee_attribution",
  ]) {
    assert.match(migration, new RegExp(token));
  }
});

test("employee filter indexes support active employee lookup beyond collection history", () => {
  const indexMigration = readFileSync(new URL("../supabase/upgrade_migrations/0250_admin_collections_all_employee_filter_indexes.sql", import.meta.url), "utf8");
  for (const token of [
    "idx_employees_company_status_name",
    "idx_employees_company_phone",
    "idx_employees_company_code",
    "idx_employees_company_role_office",
  ]) {
    assert.match(indexMigration, new RegExp(token));
  }
});
