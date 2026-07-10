import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function amount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function monthStart(value) {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    const match = String(value).match(/^(\d{4})-(\d{2})/);
    return match ? `${match[1]}-${match[2]}-01` : null;
  }
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function effectiveDeductionMonth(row) {
  return monthStart(row.applied_month ?? row.advance_payment_month ?? row.vacate_date ?? row.created_at);
}

function deductionRemaining(row) {
  return Math.max(0, amount(row.amount) - amount(row.applied_amount));
}

function deductionAppliesToMonth(row, settlementMonth) {
  const status = String(row.status ?? "pending").toLowerCase();
  return ["pending", "partially_applied"].includes(status)
    && deductionRemaining(row) > 0
    && effectiveDeductionMonth(row) === monthStart(settlementMonth);
}

function monthBalanceDue(row) {
  const monthlyNetPayable = amount(row.monthly_net_payable ?? row.net_payable);
  return Math.max(0, monthlyNetPayable - Math.min(amount(row.amount_paid), monthlyNetPayable));
}

test("a recovery deduction applies only to its own effective month", () => {
  const deduction = {
    amount: 190000,
    applied_amount: 0,
    created_at: "2026-06-28T15:19:34.751Z",
    status: "pending",
  };

  assert.equal(deductionAppliesToMonth(deduction, "2026-06-01"), true);
  assert.equal(deductionAppliesToMonth(deduction, "2026-07-01"), false);
});

test("June deduction does not reduce July full net payable", () => {
  const grossAfterCommission = 1045500;
  const juneDeduction = { amount: 190000, applied_amount: 0, created_at: "2026-06-28", status: "pending" };

  const juneNet = grossAfterCommission - (deductionAppliesToMonth(juneDeduction, "2026-06-01") ? deductionRemaining(juneDeduction) : 0);
  const julyNet = grossAfterCommission - (deductionAppliesToMonth(juneDeduction, "2026-07-01") ? deductionRemaining(juneDeduction) : 0);

  assert.equal(juneNet, 855500);
  assert.equal(julyNet, 1045500);
});

test("final landlord due is the sum of monthly balance-due rows only", () => {
  const rows = [
    {
      settlement_month: "2026-06-01",
      monthly_net_payable: 855500,
      amount_paid: 0,
      opening_arrears: 999999,
      vacated_tenant_debt_deductions: 190000,
    },
    {
      settlement_month: "2026-07-01",
      monthly_net_payable: 1045500,
      amount_paid: 0,
      opening_arrears: 855500,
      vacated_tenant_debt_deductions: 0,
    },
  ];

  const finalDue = rows.reduce((total, row) => total + monthBalanceDue(row), 0);
  assert.equal(finalDue, 1901000);
});

test("paid June is excluded while unpaid July remains", () => {
  const rows = [
    { settlement_month: "2026-06-01", monthly_net_payable: 855500, amount_paid: 855500 },
    { settlement_month: "2026-07-01", monthly_net_payable: 1045500, amount_paid: 0 },
  ];

  const visibleRows = rows.filter((row) => monthBalanceDue(row) > 0);
  assert.deepEqual(visibleRows.map((row) => row.settlement_month), ["2026-07-01"]);
  assert.equal(visibleRows.reduce((total, row) => total + monthBalanceDue(row), 0), 1045500);
});

test("active landlord code uses the month-scoped recovery helper", () => {
  const activeSources = [
    "app/actions/landlords.ts",
    "app/actions/room-rent.ts",
    "lib/landlord-payables/live-net.ts",
    "lib/landlords/data.ts",
  ];

  for (const file of activeSources) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /isRecoveryDeductionActiveForMonth|sumRecoveryDeductionsForMonth/, file);
  }
});
