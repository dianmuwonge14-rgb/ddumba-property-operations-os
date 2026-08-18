import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadMonthlyLedgerModule() {
  const source = fs.readFileSync("lib/financial/monthly-ledger.ts", "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const sandbox = {
    exports: {},
    require(specifier) {
      if (specifier === "@/lib/collections/validity") {
        return {
          collectionAmount: (row) => Number(row?.amount_paid ?? row?.amount ?? 0) || 0,
          isFinanciallyEffectiveCollection: (row) => !["removed", "removed_by_admin_approval", "rejected", "reversed", "superseded"].includes(String(row?.status ?? "posted").toLowerCase()) && row?.financial_effective !== false,
        };
      }
      if (specifier === "@/lib/tenants/balance-reconciliation") {
        return {
          availableAdvanceAllocation: (row) => Math.max(0, Number(row.amount_allocated ?? 0) - Number(row.consumed_by_balance_reconciliation ?? 0)),
          moneyAmount: (value) => Math.max(0, Number(value ?? 0) || 0),
        };
      }
      throw new Error(`Unexpected require: ${specifier}`);
    },
  };
  vm.runInNewContext(transpiled, sandbox);
  return sandbox.exports;
}

test("tenant monthly ledger clears E13-style arrears plus rent with current month payments", () => {
  const { calculateTenantMonthlyLedgerPosition } = loadMonthlyLedgerModule();
  const position = calculateTenantMonthlyLedgerPosition({
    advanceAllocations: [
      { payment_id: "payment-e13", allocation_type: "current_month", allocation_month: "2026-07-01", amount_allocated: 70_000, consumed_by_balance_reconciliation: 0 },
      { payment_id: "payment-e13", allocation_type: "advance_month", allocation_month: "2026-08-01", amount_allocated: 70_000, consumed_by_balance_reconciliation: 70_000 },
    ],
    collections: [{ id: "payment-e13", payment_date: "2026-08-10", amount_paid: 140_000, status: "posted" }],
    monthlyRent: 70_000,
    rentMonths: [
      { rent_month: "2026-07-01", outstanding_amount: 0, rent_amount: 70_000 },
      { rent_month: "2026-08-01", outstanding_amount: 0, rent_amount: 70_000 },
    ],
    selectedMonth: "2026-08-01",
  });

  assert.equal(position.arrears, 70_000);
  assert.equal(position.currentMonthRent, 70_000);
  assert.equal(position.paymentsThisMonth, 140_000);
  assert.equal(position.outstanding, 0);
  assert.equal(position.advance, 0);
  assert.equal(position.lastPaymentId, "payment-e13");
});

test("tenant monthly ledger turns negative raw balance into advance", () => {
  const { calculateTenantMonthlyLedgerPosition } = loadMonthlyLedgerModule();
  const position = calculateTenantMonthlyLedgerPosition({
    collections: [{ payment_date: "2026-08-10", amount_paid: 100_000, status: "posted" }],
    monthlyRent: 70_000,
    selectedMonth: "2026-08-01",
  });

  assert.equal(position.rawBalance, -30_000);
  assert.equal(position.outstanding, 0);
  assert.equal(position.advance, 30_000);
});

test("tenant monthly ledger handles partial payment with arrears", () => {
  const { calculateTenantMonthlyLedgerPosition } = loadMonthlyLedgerModule();
  const position = calculateTenantMonthlyLedgerPosition({
    collections: [{ payment_date: "2026-08-12", amount_paid: 40_000, status: "posted" }],
    monthlyRent: 70_000,
    rentMonths: [{ rent_month: "2026-07-01", outstanding_amount: 50_000, rent_amount: 70_000 }],
    selectedMonth: "2026-08-01",
  });

  assert.equal(position.outstanding, 80_000);
  assert.equal(position.advance, 0);
});

test("tenant monthly ledger consumes matured advance for the selected month before showing debt", () => {
  const { calculateTenantMonthlyLedgerPosition } = loadMonthlyLedgerModule();
  const position = calculateTenantMonthlyLedgerPosition({
    advanceAllocations: [{ allocation_type: "advance_month", allocation_month: "2026-09-01", amount_allocated: 30_000, consumed_by_balance_reconciliation: 0 }],
    collections: [],
    monthlyRent: 70_000,
    selectedMonth: "2026-09-01",
  });

  assert.equal(position.advanceAppliedToCurrentMonth, 30_000);
  assert.equal(position.outstanding, 40_000);
  assert.equal(position.advance, 0);
});

test("tenant monthly ledger counts prior consumed advance as opening credit", () => {
  const { calculateTenantMonthlyLedgerPosition } = loadMonthlyLedgerModule();
  const position = calculateTenantMonthlyLedgerPosition({
    advanceAllocations: [{ payment_id: "aug-overpay", allocation_type: "advance_month", allocation_month: "2026-09-01", amount_allocated: 70_000, consumed_by_balance_reconciliation: 70_000 }],
    collections: [{ id: "aug-overpay", payment_date: "2026-08-10", amount_paid: 140_000, status: "posted" }],
    monthlyRent: 70_000,
    rentMonths: [{ rent_month: "2026-09-01", outstanding_amount: 0, rent_amount: 70_000, amount_paid: 70_000 }],
    selectedMonth: "2026-09-01",
  });

  assert.equal(position.advanceAppliedToCurrentMonth, 70_000);
  assert.equal(position.paymentsThisMonth, 0);
  assert.equal(position.outstanding, 0);
  assert.equal(position.advance, 0);
});

test("tenant monthly ledger offsets future advance against current debt before displaying advance", () => {
  const { calculateTenantMonthlyLedgerPosition } = loadMonthlyLedgerModule();
  const position = calculateTenantMonthlyLedgerPosition({
    advanceAllocations: [{ payment_id: "aug-payment", allocation_type: "advance_month", allocation_month: "2026-09-01", amount_allocated: 500_000, consumed_by_balance_reconciliation: 0 }],
    collections: [{ id: "aug-payment", payment_date: "2026-08-05", amount_paid: 1_000_000, status: "posted" }],
    monthlyRent: 500_000,
    rentMonths: [{ rent_month: "2026-08-01", outstanding_amount: 0, rent_amount: 500_000 }],
    selectedMonth: "2026-08-01",
  });

  assert.equal(position.rawBalance, -500_000);
  assert.equal(position.outstanding, 0);
  assert.equal(position.advance, 500_000);
});

test("tenant monthly ledger does not allow debt and advance to coexist", () => {
  const { calculateTenantMonthlyLedgerPosition } = loadMonthlyLedgerModule();
  const position = calculateTenantMonthlyLedgerPosition({
    advanceAllocations: [{ payment_id: "old-payment", allocation_type: "advance_month", allocation_month: "2026-09-01", amount_allocated: 120_000, consumed_by_balance_reconciliation: 0 }],
    collections: [{ id: "old-payment", payment_date: "2026-07-05", amount_paid: 120_000, status: "posted" }],
    monthlyRent: 200_000,
    selectedMonth: "2026-08-01",
  });

  assert.equal(position.outstanding, 80_000);
  assert.equal(position.advance, 0);
});

test("tenant balance card no longer exposes direct outstanding edits", () => {
  const source = fs.readFileSync("components/office/payments/FastPaymentsEntry.tsx", "utf8");
  const tenantBalanceSection = source.slice(source.indexOf("function TenantBalance"), source.indexOf("function AdvanceRentAssistant"));
  assert.match(tenantBalanceSection, /Arrears/);
  assert.match(tenantBalanceSection, /Payments This Month/);
  assert.match(tenantBalanceSection, /Calculated only: arrears \+ rent - payments/);
  assert.doesNotMatch(tenantBalanceSection, /onEditOutstanding/);
});
