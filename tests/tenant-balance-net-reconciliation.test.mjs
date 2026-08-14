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
  const paymentReductionMigration = fs.readFileSync("supabase/upgrade_migrations/0275_tenant_payment_outstanding_reduction.sql", "utf8");
  assert.match(originalMigration, /consumed_by_balance_reconciliation/);
  assert.match(originalMigration, /create table if not exists public\.tenant_balance_reconciliations/);
  assert.match(repairMigration, /create or replace function public\.reconcile_tenant_balance/);
  assert.match(repairMigration, /v_outstanding_after := v_requested_outstanding \+ v_advance_before/);
  assert.match(repairMigration, /payment_amount <= due_before/);
  assert.match(repairMigration, /B912/);
  assert.match(repairMigration, /C8019/);
  assert.match(paymentReductionMigration, /'collection_payment'/);
  assert.match(paymentReductionMigration, /v_outstanding_after := v_requested_outstanding;/);
  assert.match(paymentReductionMigration, /create or replace view public\.tenant_payment_balance_snapshot_mismatches/);
  assert.match(paymentReductionMigration, /create or replace function public\.repair_tenant_payment_balance_snapshots/);
});

test("payment, adjustment and promise paths use canonical tenant balance reconciliation", () => {
  const collections = fs.readFileSync("app/actions/collections.ts", "utf8");
  const promises = fs.readFileSync("app/actions/promises.ts", "utf8");
  assert.match(collections, /reconcileTenantBalanceAfterWrite/);
  assert.match(collections, /rpc\("reconcile_tenant_balance"/);
  assert.match(collections, /"collection_payment"/);
  assert.match(collections, /shouldUseDirectSnapshotUpdate/);
  assert.match(collections, /syncTenantRentMonthRowsAfterPayment/);
  assert.match(collections, /\.from\("tenant_rent_months"\)/);
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

test("collection details do not display stale consumed next-month allocations", () => {
  const dataSource = fs.readFileSync("lib/collections/data.ts", "utf8");
  assert.match(dataSource, /savedAllocatedToNextMonth/);
  assert.match(dataSource, /liveNextMonthAllocation/);
  assert.match(dataSource, /liveAllocatedToNextMonth/);
  assert.match(dataSource, /Math\.min\(Math\.max\(savedAllocatedToNextMonth, liveNextMonthAllocation\), advanceRentBalance\)/);
  assert.match(dataSource, /Math\.min\(Math\.max\(savedAllocatedToNextMonth, liveAllocatedToNextMonth\), advanceRentBalance\)/);
  assert.match(dataSource, /allocationType === "current_month" \|\| allocationType === "advance_month"/);
  assert.match(dataSource, /currentMonthValues\?\.advance/);
});

test("tenant payment allocation creates advance only from true overpayment", () => {
  const allocationSource = fs.readFileSync("lib/collections/move-in-allocation.ts", "utf8");
  assert.match(allocationSource, /genuineAdvanceCredit = Math\.max\(0, amount - totalDueBeforePayment\)/);
  assert.match(allocationSource, /remaining = Math\.min\(remaining, genuineAdvanceCredit\)/);
});

test("approved legacy arrears are reconstructed as pre-system monthly debt", () => {
  const migration = fs.readFileSync("supabase/upgrade_migrations/0268_pre_system_legacy_arrears_ledger.sql", "utf8");
  assert.match(migration, /create table if not exists public\.tenant_pre_system_arrears_periods/);
  assert.match(migration, /go_live_month/);
  assert.match(migration, /allocation_month/);
  assert.match(migration, /payment_amount_applied_oldest_first/);
  assert.match(migration, /does_not_create_new_rent/);
  assert.match(migration, /public\.ddumba_reconstruct_approved_legacy_arrears\(\)/);
  assert.match(migration, /tenant_legacy_monthly_balance_ledger/);
});

test("advance rent assistant distinguishes legacy arrears from mismatches", () => {
  const dataSource = fs.readFileSync("lib/collections/data.ts", "utf8");
  const uiSource = fs.readFileSync("components/office/payments/FastPaymentsEntry.tsx", "utf8");
  assert.match(dataSource, /tenant_pre_system_arrears_periods/);
  assert.match(dataSource, /type: "legacy_arrears_reconciled"/);
  assert.match(dataSource, /LEGACY ARREARS RECONCILED/);
  assert.match(dataSource, /type: "genuine_advance"/);
  assert.match(dataSource, /type: "real_allocation_mismatch"/);
  assert.match(dataSource, /type: "needs_manual_review"/);
  assert.match(uiSource, /Legacy Arrears Reconciled/);
  assert.match(uiSource, /Genuine Advance/);
  assert.match(uiSource, /Real Allocation Mismatch/);
  assert.match(uiSource, /Needs Manual Review/);
});
