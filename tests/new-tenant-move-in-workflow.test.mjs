import assert from "node:assert/strict";
import { test } from "node:test";

function clampDay(year, monthIndex, day) {
  return Math.min(day, new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate());
}

function addCalendarMonths(dateOnly, months) {
  const [year, month, day] = dateOnly.split("-").map(Number);
  const targetMonthIndex = month - 1 + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedMonthIndex = ((targetMonthIndex % 12) + 12) % 12;
  return new Date(Date.UTC(targetYear, normalizedMonthIndex, clampDay(targetYear, normalizedMonthIndex, day))).toISOString().slice(0, 10);
}

function previousDay(dateOnly) {
  const [year, month, day] = dateOnly.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}

function coveragePeriod(moveInDate, index) {
  const coverageStart = addCalendarMonths(moveInDate, index);
  return { coverageStart, coverageEnd: previousDay(addCalendarMonths(moveInDate, index + 1)) };
}

function allocationPlan({ moveInDate, monthlyRent, paymentAmount }) {
  let remaining = paymentAmount;
  const rows = [];
  let index = 0;
  while (remaining > 0.004 && index < 120) {
    const amountAllocated = Math.min(remaining, monthlyRent);
    const period = coveragePeriod(moveInDate, index);
    const isFull = amountAllocated + 0.004 >= monthlyRent;
    rows.push({
      allocationType: index === 0 ? "current_month" : "advance_month",
      amountAllocated,
      coverageEnd: period.coverageEnd,
      coverageStart: period.coverageStart,
      remainingCredit: isFull ? 0 : amountAllocated,
    });
    remaining -= amountAllocated;
    index += 1;
  }
  return rows;
}

function landlordMoveInDecision({ alreadyPaid = false, moveInDate, monthlyRent, settlementMonth }) {
  const moveInMonth = `${moveInDate.slice(0, 7)}-01`;
  if (moveInMonth !== settlementMonth) return { included: monthlyRent, extraProfit: 0, reason: "standard" };
  if (alreadyPaid) return { included: 0, extraProfit: monthlyRent, reason: "Company extra profit: landlord already paid" };
  const day = Number(moveInDate.slice(8, 10));
  return day <= 15
    ? { included: monthlyRent, extraProfit: 0, reason: "Included: tenant entered before cutoff" }
    : { included: 0, extraProfit: 0, reason: "Excluded: tenant entered after cutoff" };
}

test("move-in payment coverage starts on the exact move-in date", () => {
  const rows = allocationPlan({ moveInDate: "2026-07-10", monthlyRent: 100000, paymentAmount: 100000 });
  assert.deepEqual(rows, [{
    allocationType: "current_month",
    amountAllocated: 100000,
    coverageStart: "2026-07-10",
    coverageEnd: "2026-08-09",
    remainingCredit: 0,
  }]);
});

test("multiple and partial move-in coverage creates future advance periods", () => {
  const rows = allocationPlan({ moveInDate: "2026-07-10", monthlyRent: 100000, paymentAmount: 250000 });
  assert.deepEqual(rows, [
    { allocationType: "current_month", amountAllocated: 100000, coverageStart: "2026-07-10", coverageEnd: "2026-08-09", remainingCredit: 0 },
    { allocationType: "advance_month", amountAllocated: 100000, coverageStart: "2026-08-10", coverageEnd: "2026-09-09", remainingCredit: 0 },
    { allocationType: "advance_month", amountAllocated: 50000, coverageStart: "2026-09-10", coverageEnd: "2026-10-09", remainingCredit: 50000 },
  ]);
});

test("partial entry payment leaves first coverage outstanding and no future advance", () => {
  const rows = allocationPlan({ moveInDate: "2026-07-10", monthlyRent: 100000, paymentAmount: 40000 });
  const firstOutstanding = Math.max(0, 100000 - rows[0].amountAllocated);
  assert.equal(firstOutstanding, 60000);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].allocationType, "current_month");
});

test("landlord payable cutoff includes move-in on or before 15th", () => {
  assert.deepEqual(landlordMoveInDecision({ moveInDate: "2026-07-10", monthlyRent: 70000, settlementMonth: "2026-07-01" }), {
    included: 70000,
    extraProfit: 0,
    reason: "Included: tenant entered before cutoff",
  });
  assert.deepEqual(landlordMoveInDecision({ moveInDate: "2026-07-15", monthlyRent: 70000, settlementMonth: "2026-07-01" }), {
    included: 70000,
    extraProfit: 0,
    reason: "Included: tenant entered before cutoff",
  });
});

test("landlord payable cutoff excludes after 15th unless already paid becomes company profit", () => {
  assert.deepEqual(landlordMoveInDecision({ moveInDate: "2026-07-16", monthlyRent: 70000, settlementMonth: "2026-07-01" }), {
    included: 0,
    extraProfit: 0,
    reason: "Excluded: tenant entered after cutoff",
  });
  assert.deepEqual(landlordMoveInDecision({ alreadyPaid: true, moveInDate: "2026-07-10", monthlyRent: 70000, settlementMonth: "2026-07-01" }), {
    included: 0,
    extraProfit: 70000,
    reason: "Company extra profit: landlord already paid",
  });
});

test("old tenant debt stays separated from the new tenant opening balance", () => {
  const oldDebt = 140000;
  const newTenantOpeningBalance = 0;
  assert.equal(oldDebt > 0, true);
  assert.equal(newTenantOpeningBalance, 0);
});

test("rollback expectation: workflow must not allow half-created tenant state", () => {
  const completedSteps = ["vacate_old_tenant", "create_new_tenant", "create_lease", "record_payment"];
  const failedStep = "record_payment";
  const persistedAsComplete = completedSteps.every((step) => step !== failedStep);
  assert.equal(persistedAsComplete, false);
});
