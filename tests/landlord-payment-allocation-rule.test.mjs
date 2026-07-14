import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("expense-routed landlord payment uses the same total unpaid as the landlord report", () => {
  const reportRows = [
    {
      settlement_month: "2026-06-01",
      monthly_net_payable: 855500,
      net_payable: 855500,
      vacated_tenant_debt_deductions: 190000,
      amount_paid: 0,
      status: "unpaid",
    },
    {
      settlement_month: "2026-07-01",
      monthly_net_payable: 1045500,
      net_payable: 1045500,
      opening_arrears: 1045500,
      vacated_tenant_debt_deductions: 0,
      amount_paid: 0,
      status: "unpaid",
    },
  ];
  const totalReportDue = reportRows.reduce((total, row) => total + monthlyUnpaid(row), 0);
  assert.equal(totalReportDue, 1901000);

  const partial = allocationPlan(1731000, reportRows);
  assert.equal(partial.applied, 1731000);
  assert.equal(partial.advance, 0);
  assert.equal(partial.outstanding, 170000);

  const exact = allocationPlan(1901000, reportRows);
  assert.equal(exact.applied, 1901000);
  assert.equal(exact.advance, 0);
  assert.equal(exact.outstanding, 0);

  const overpayment = allocationPlan(1930000, reportRows);
  assert.equal(overpayment.applied, 1901000);
  assert.equal(overpayment.advance, 29000);
  assert.equal(overpayment.outstanding, 0);
});

test("expenses landlord payment preview does not recompute and double-deduct current month live net", () => {
  const source = readFileSync(new URL("../app/actions/expenses.ts", import.meta.url), "utf8");
  const previewBody = source.slice(source.indexOf("async function getLandlordPaymentPreview"), source.indexOf("export async function createExpense"));
  assert.match(previewBody, /summarizeLandlordPayables/);
  assert.doesNotMatch(previewBody, /getLiveLandlordMonthlyNetPayable/);
  assert.doesNotMatch(previewBody, /liveNet\.recoveryDeduction/);
});

test("landlord payment approval paths do not overwrite canonical monthly payable rows with live-net recalculation", () => {
  const expensesSource = readFileSync(new URL("../app/actions/expenses.ts", import.meta.url), "utf8");
  const expenseApprovalBody = expensesSource.slice(expensesSource.indexOf("export async function decideLandlordPaidExpenseRequest"), expensesSource.indexOf("async function createApprovedLandlordAdvanceFromExpenseRequest"));
  assert.match(expenseApprovalBody, /buildLandlordPaymentAllocationPlan/);
  assert.doesNotMatch(expenseApprovalBody, /reconcileLandlordPayableWithLiveNet/);

  const landlordSource = readFileSync(new URL("../app/actions/landlords.ts", import.meta.url), "utf8");
  const directPaymentBody = landlordSource.slice(landlordSource.indexOf("export async function markLandlordMonthlyPayablePaid"), landlordSource.indexOf("export async function submitLandlordPaymentDetails"));
  assert.match(directPaymentBody, /allocateLandlordPaymentAcrossLedger/);
  assert.doesNotMatch(directPaymentBody, /reconcileLandlordPayableWithLiveNet/);
});

test("admin landlord payment submission resolves the selected landlord office", () => {
  const expensesSource = readFileSync(new URL("../app/actions/expenses.ts", import.meta.url), "utf8");
  assert.match(expensesSource, /resolveLandlordPaymentOfficeId/);
  assert.match(expensesSource, /requestedOfficeId: input\.officeId/);
  assert.match(expensesSource, /if \(!input\.isDirectAdmin\) return input\.activeOfficeId/);
  assert.match(expensesSource, /landlord_monthly_payables/);
});

test("landlord payment forms submit selected office id to shared action", () => {
  const landlordPaymentsSource = readFileSync(new URL("../components/office/landlords/LandlordPaymentsConsole.tsx", import.meta.url), "utf8");
  const expensesConsoleSource = readFileSync(new URL("../components/office/expenses/ExpensesConsole.tsx", import.meta.url), "utf8");
  assert.match(landlordPaymentsSource, /officeId: selectedOfficeId/);
  assert.match(landlordPaymentsSource, /submitLandlordPaymentFromTerminal/);
  assert.match(expensesConsoleSource, /officeId: selectedLandlordOption\?\.officeId/);
});
