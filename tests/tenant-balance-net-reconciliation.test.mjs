import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function reconcile({ outstandingBalance, advanceBalance }) {
  const requestedOutstanding = Math.max(0, Number(outstandingBalance ?? 0));
  const currentAdvance = Math.max(0, Number(advanceBalance ?? 0));
  const advanceConsumed = requestedOutstanding > 0 ? currentAdvance : 0;
  return {
    advanceBalance: requestedOutstanding > 0 ? 0 : currentAdvance,
    advanceConsumed,
    outstandingBalance: requestedOutstanding > 0 ? requestedOutstanding + currentAdvance : 0,
  };
}

test("tenant balance reconciliation keeps unpaid rent inside outstanding", () => {
  assert.deepEqual(reconcile({ advanceBalance: 50_000, outstandingBalance: 40_000 }), {
    advanceBalance: 0,
    advanceConsumed: 50_000,
    outstandingBalance: 90_000,
  });
  assert.deepEqual(reconcile({ advanceBalance: 50_000, outstandingBalance: 50_000 }), {
    advanceBalance: 0,
    advanceConsumed: 50_000,
    outstandingBalance: 100_000,
  });
  assert.deepEqual(reconcile({ advanceBalance: 50_000, outstandingBalance: 60_000 }), {
    advanceBalance: 0,
    advanceConsumed: 50_000,
    outstandingBalance: 110_000,
  });
  assert.deepEqual(reconcile({ advanceBalance: 60_000, outstandingBalance: 20_000 }), {
    advanceBalance: 0,
    advanceConsumed: 60_000,
    outstandingBalance: 80_000,
  });
  assert.deepEqual(reconcile({ advanceBalance: 240_000, outstandingBalance: 270_000 }), {
    advanceBalance: 0,
    advanceConsumed: 240_000,
    outstandingBalance: 510_000,
  });
});

test("tenant balance reconciliation never leaves both advance and outstanding positive", () => {
  for (const outstandingBalance of [0, 10_000, 50_000, 125_000]) {
    for (const advanceBalance of [0, 5_000, 50_000, 200_000]) {
      const result = reconcile({ outstandingBalance, advanceBalance });
      assert.ok(result.outstandingBalance === 0 || result.advanceBalance === 0);
    }
  }
});

test("database migration preserves advance allocations and records consumed amount", () => {
  const originalMigration = fs.readFileSync("supabase/upgrade_migrations/0217_tenant_balance_net_reconciliation.sql", "utf8");
  const repairMigration = fs.readFileSync("supabase/upgrade_migrations/0266_true_tenant_outstanding_balance.sql", "utf8");
  assert.match(originalMigration, /consumed_by_balance_reconciliation/);
  assert.match(originalMigration, /create table if not exists public\.tenant_balance_reconciliations/);
  assert.match(repairMigration, /create or replace function public\.reconcile_tenant_balance/);
  assert.match(repairMigration, /v_outstanding_after := v_requested_outstanding \+ v_advance_before/);
  assert.match(repairMigration, /payment_amount <= due_before/);
  assert.match(repairMigration, /B912/);
  assert.match(repairMigration, /C8019/);
});

test("payment, adjustment and promise paths use canonical tenant balance reconciliation", () => {
  const collections = fs.readFileSync("app/actions/collections.ts", "utf8");
  const promises = fs.readFileSync("app/actions/promises.ts", "utf8");
  assert.match(collections, /reconcileTenantBalanceAfterWrite/);
  assert.match(collections, /rpc\("reconcile_tenant_balance"/);
  assert.match(collections, /sourceType: "collection_payment"/);
  assert.match(collections, /sourceType: "tenant_balance_adjustment"/);
  assert.match(promises, /rpc\("reconcile_tenant_balance"/);
});

test("live search and billing functions subtract consumed advance only once", () => {
  const searchMigration = fs.readFileSync("supabase/upgrade_migrations/0216_payment_search_room_rank_priority.sql", "utf8");
  const billingMigration = fs.readFileSync("supabase/upgrade_migrations/0209_tenant_monthly_billing_engine.sql", "utf8");
  const dataSource = fs.readFileSync("lib/collections/data.ts", "utf8");
  assert.match(searchMigration, /amount_allocated - coalesce\(a\.consumed_by_balance_reconciliation, 0\)/);
  assert.match(billingMigration, /amount_allocated - coalesce\(a\.consumed_by_balance_reconciliation, 0\)/);
  assert.match(dataSource, /availableAdvanceAllocation/);
  assert.match(dataSource, /displayTenantNetBalance/);
});

test("tenant payment allocation creates advance only from true overpayment", () => {
  const allocationSource = fs.readFileSync("lib/collections/move-in-allocation.ts", "utf8");
  assert.match(allocationSource, /genuineAdvanceCredit = Math\.max\(0, amount - totalDueBeforePayment\)/);
  assert.match(allocationSource, /remaining = Math\.min\(remaining, genuineAdvanceCredit\)/);
});
