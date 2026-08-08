import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("tenant payment ledger routes cash, bank and mobile money to separate cash account types", () => {
  const source = read("lib/collections/payment-ledger.ts");

  assert.match(source, /paymentMethodBucket\(input\.paymentMethod\)/);
  assert.match(source, /methodBucket === "bank" \? "bank"/);
  assert.match(source, /methodBucket === "mobile_money" \? "mobile_money"/);
  assert.match(source, /: "office_cash"/);
  assert.match(source, /accountQuery\.is\("office_id", null\)/);
  assert.match(source, /office_id: isOfficeScopedAccount \? input\.officeId : null/);
});

test("all tenant payment entry paths pass the selected method to ledger posting", () => {
  const collectionsAction = read("app/actions/collections.ts");
  const roomOccupancyAction = read("app/actions/room-occupancy.ts");
  const promisesAction = read("app/actions/promises.ts");

  assert.match(collectionsAction, /const paymentMethod = canonicalTenantPaymentMethod\(input\.paymentMethod\)/);
  assert.match(collectionsAction, /payment_method: paymentMethod/);
  assert.match(collectionsAction, /paymentMethod,\s*\n\s*recordedBy/s);
  assert.match(roomOccupancyAction, /paymentMethod: input\.paymentMethod/);
  assert.match(promisesAction, /payment_method: input\.paymentMethod \?\? "cash"/);
  assert.match(promisesAction, /paymentMethod: input\.paymentMethod \?\? "cash"/);
});

test("cash position and cash banking reports keep direct bank and mobile money out of physical office cash", () => {
  const cashPosition = read("lib/cash-position-centre/data.ts");
  const cashBanking = read("lib/cash-banking/data.ts");
  const expenses = read("lib/expenses/data.ts");

  for (const source of [cashPosition, cashBanking, expenses]) {
    assert.match(source, /paymentMethodBucket/);
    assert.match(source, /physicalCollectionAmount/);
  }

  assert.match(cashPosition, /const physicalCollectedPeriod = sum\(officeCollections, physicalCollectionAmount\)/);
  assert.match(cashPosition, /const mobileMoney = sum\(mobileMoneyBalances, signedLedgerAmount\)/);
  assert.match(cashPosition, /label: "Money at Bank"/);
  assert.match(cashPosition, /label: "Mobile Money"/);
  assert.match(cashBanking, /if \(amountIn <= 0\) continue/);
  assert.match(expenses, /remainingBalance: physicalCollections - totalExpenses/);
});

test("collections payment method filter uses canonical method buckets instead of raw text matching", () => {
  const source = read("lib/collections/data.ts");

  assert.doesNotMatch(source, /collectionQuery = collectionQuery\.ilike\("payment_method"/);
  assert.match(source, /collectionMethodBucket\(String\(collection\.payment_method \?\? ""\)\) === collectionMethodBucket\(paymentMethodFilter\)/);
});

test("migration reclassifies historical direct bank and mobile-money collection ledgers", () => {
  const source = read("supabase/upgrade_migrations/0258_payment_method_ledger_routing.sql");

  assert.match(source, /account_type = 'bank'/);
  assert.match(source, /account_type = 'mobile_money'/);
  assert.match(source, /source_type = 'collection'/);
  assert.match(source, /source_account\.account_type = 'office_cash'/);
  assert.match(source, /mc\.target_account_type in \('bank', 'mobile_money'\)/);
});
