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
  assert.match(dataSource, /!employeeFilterId \|\| employeeId === employeeFilterId/);
  assert.match(dataSource, /uniqueFinanciallyEffectiveCollections/);
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
