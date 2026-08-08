import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const collectionsTypes = readFileSync(new URL("../lib/collections/types.ts", import.meta.url), "utf8");
const collectionsData = readFileSync(new URL("../lib/collections/data.ts", import.meta.url), "utf8");
const collectionsPage = readFileSync(new URL("../app/office/collections/page.tsx", import.meta.url), "utf8");
const collectionsUi = readFileSync(new URL("../components/office/collections/CollectionsRecordsCentre.tsx", import.meta.url), "utf8");
const expensesTypes = readFileSync(new URL("../lib/expenses/types.ts", import.meta.url), "utf8");
const expensesData = readFileSync(new URL("../lib/expenses/data.ts", import.meta.url), "utf8");
const expensesPage = readFileSync(new URL("../app/office/expenses/page.tsx", import.meta.url), "utf8");
const expensesUi = readFileSync(new URL("../components/office/expenses/ExpensesConsole.tsx", import.meta.url), "utf8");

test("admin capital injection is a dedicated breakdown of financially effective collections", () => {
  assert.match(collectionsTypes, /adminCapitalInjectionTotal: number/);
  assert.match(expensesTypes, /adminCapitalInjectionTotal: number/);
  assert.match(collectionsData, /uniqueFinanciallyEffectiveCollections/);
  assert.match(expensesData, /uniqueFinanciallyEffectiveCollections/);
  assert.match(collectionsData, /ADMIN_CAPITAL_INJECTION/);
  assert.match(expensesData, /ADMIN_CAPITAL_INJECTION/);
  assert.match(collectionsData, /acc\.adminCapitalInjectionTotal \+= row\.amountPaid/);
  assert.match(expensesData, /adminCapitalInjectionTotal = collections\.reduce/);
});

test("admin capital injection is not attributed to employee performance", () => {
  assert.match(collectionsData, /if \(String\(row\.type \?\? ""\)\.toUpperCase\(\) === "ADMIN_CAPITAL_INJECTION"\) return null/);
  assert.match(collectionsData, /collectionSourceKey: sourceKey/);
  assert.match(expensesData, /collectionSourceKey/);
});

test("expenses and collections expose a clickable admin capital injection KPI and source drill-down", () => {
  assert.match(collectionsUi, /label="Admin Capital Injection"/);
  assert.match(collectionsUi, /Admin-funded cash received in selected period/);
  assert.match(collectionsUi, /openAdminCapitalInjectionRecords/);
  assert.match(collectionsUi, /collectionSource: "admin_capital_injection"/);
  assert.match(expensesUi, /label="Admin Capital Injection"/);
  assert.match(expensesUi, /setSummaryDrilldown\("adminCapitalInjection"\)/);
  assert.match(expensesUi, /collection\.collectionSourceKey === "admin_capital_injection"/);
  assert.match(expensesUi, /collectionSource=admin_capital_injection/);
  assert.match(collectionsPage, /searchParams/);
  assert.match(collectionsPage, /collectionSource/);
  assert.match(collectionsPage, /getCollectionsRecordsPageData\(filters\)/);
  assert.match(expensesPage, /searchParams/);
  assert.match(expensesPage, /initialFilters/);
  assert.match(expensesUi, /initialFilters\?/);
});
