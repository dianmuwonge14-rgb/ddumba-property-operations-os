import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const validitySource = readFileSync(new URL("../lib/collections/validity.ts", import.meta.url), "utf8");
const expensesData = readFileSync(new URL("../lib/expenses/data.ts", import.meta.url), "utf8");
const collectionsData = readFileSync(new URL("../lib/collections/data.ts", import.meta.url), "utf8");
const cashPositionData = readFileSync(new URL("../lib/cash-position-centre/data.ts", import.meta.url), "utf8");
const dashboardData = readFileSync(new URL("../lib/dashboard-live/data.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/upgrade_migrations/0228_collection_financial_effective_consistency.sql", import.meta.url), "utf8");

test("canonical collection validity excludes corrected, reversed, removed and superseded rows", () => {
  for (const token of [
    "removed_by_admin_approval",
    "reversed",
    "voided",
    "superseded",
    "financial_effective === false",
    "superseded_by_payment_id",
    "corrected_by_payment_id",
    "correction_of_payment_id",
  ]) {
    assert.match(validitySource, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(validitySource, /uniqueFinanciallyEffectiveCollections/);
});

test("collections totals use the shared financial-effectiveness rule across major pages", () => {
  assert.match(expensesData, /uniqueFinanciallyEffectiveCollections/);
  assert.match(expensesData, /collectionAmount\(collection\)/);
  assert.match(collectionsData, /uniqueFinanciallyEffectiveCollections/);
  assert.match(collectionsData, /isFinanciallyEffectiveCollection/);
  assert.match(cashPositionData, /isFinanciallyEffectiveCollection\(row\)/);
  assert.match(dashboardData, /isFinanciallyEffectiveCollection/);
});

test("migration installs production fields, indexes and canonical total function", () => {
  for (const token of [
    "financial_effective",
    "reversed_at",
    "superseded_by_payment_id",
    "corrected_by_payment_id",
    "correction_of_payment_id",
    "idx_collections_company_office_date_effective",
    "get_valid_collections_total",
  ]) {
    assert.match(migration, new RegExp(token));
  }
});
