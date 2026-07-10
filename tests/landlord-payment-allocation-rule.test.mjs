import assert from "node:assert/strict";
import { test } from "node:test";

function amount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function monthlyDue(row) {
  const directMonthlyDue = Math.max(0, amount(row.monthly_net_payable ?? row.net_payable));
  if (directMonthlyDue > 0) return directMonthlyDue;
  return Math.max(0, amount(row.total_due) - amount(row.opening_arrears));
}

function monthlyUnpaid(row) {
  const due = monthlyDue(row);
  const paid = Math.max(0, amount(row.amount_paid));
  if (due > 0 || paid > 0) return Math.max(0, due - Math.min(paid, due));
  return Math.max(0, amount(row.unpaid_balance));
}

function allocationPlan(paymentAmount, rows) {
  const unpaidRows = rows
    .filter((row) => !["archived", "reversed", "voided", "cancelled"].includes(String(row.status ?? "").toLowerCase()))
    .map((row) => ({ ...row, unpaid: monthlyUnpaid(row) }))
    .filter((row) => row.unpaid > 0)
    .sort((a, b) => String(a.settlement_month).localeCompare(String(b.settlement_month)));

  const totalUnpaid = unpaidRows.reduce((total, row) => total + row.unpaid, 0);
  let remaining = paymentAmount;
  const lines = [];
  for (const row of unpaidRows) {
    if (remaining <= 0) break;
    const applied = Math.min(remaining, row.unpaid);
    remaining -= applied;
    lines.push({ month: row.settlement_month, applied });
  }
  return {
    advance: Math.max(paymentAmount - totalUnpaid, 0),
    applied: Math.min(paymentAmount, totalUnpaid),
    lines,
    outstanding: Math.max(totalUnpaid - paymentAmount, 0),
  };
}

test("partial landlord payment reduces current unpaid payable before advance", () => {
  const plan = allocationPlan(300000, [{ settlement_month: "2026-07-01", monthly_net_payable: 360000, amount_paid: 0 }]);
  assert.equal(plan.applied, 300000);
  assert.equal(plan.advance, 0);
  assert.equal(plan.outstanding, 60000);
});

test("exact landlord payment creates no advance", () => {
  const plan = allocationPlan(360000, [{ settlement_month: "2026-07-01", monthly_net_payable: 360000, amount_paid: 0 }]);
  assert.equal(plan.applied, 360000);
  assert.equal(plan.advance, 0);
  assert.equal(plan.outstanding, 0);
});

test("landlord overpayment creates advance only after all unpaid payables are cleared", () => {
  const plan = allocationPlan(500000, [{ settlement_month: "2026-07-01", monthly_net_payable: 360000, amount_paid: 0 }]);
  assert.equal(plan.applied, 360000);
  assert.equal(plan.advance, 140000);
  assert.equal(plan.outstanding, 0);
});

test("landlord payment clears multiple unpaid months oldest first", () => {
  const plan = allocationPlan(500000, [
    { settlement_month: "2026-07-01", monthly_net_payable: 360000, amount_paid: 0 },
    { settlement_month: "2026-05-01", monthly_net_payable: 280000, amount_paid: 0 },
    { settlement_month: "2026-06-01", monthly_net_payable: 280000, amount_paid: 280000 },
  ]);
  assert.deepEqual(plan.lines, [
    { month: "2026-05-01", applied: 280000 },
    { month: "2026-07-01", applied: 220000 },
  ]);
  assert.equal(plan.advance, 0);
  assert.equal(plan.outstanding, 140000);
});

test("fully paid previous landlord month is excluded from reports and allocation", () => {
  const plan = allocationPlan(300000, [
    { settlement_month: "2026-06-01", monthly_net_payable: 360000, amount_paid: 360000 },
    { settlement_month: "2026-07-01", monthly_net_payable: 360000, amount_paid: 0 },
  ]);
  assert.deepEqual(plan.lines, [{ month: "2026-07-01", applied: 300000 }]);
  assert.equal(plan.advance, 0);
});

test("opening arrears are informational and never create a third unpaid month", () => {
  const plan = allocationPlan(0, [
    { settlement_month: "2026-06-01", monthly_net_payable: 280000, opening_arrears: 280000, amount_paid: 0 },
    { settlement_month: "2026-07-01", monthly_net_payable: 280000, opening_arrears: 560000, amount_paid: 0 },
  ]);
  assert.equal(plan.outstanding, 560000);
});
