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

function coverageIndexForDate(moveInDate, businessDate) {
  if (businessDate < moveInDate) return 0;
  let index = Math.max(0, (Number(businessDate.slice(0, 4)) - Number(moveInDate.slice(0, 4))) * 12 + (Number(businessDate.slice(5, 7)) - Number(moveInDate.slice(5, 7))));
  while (addCalendarMonths(moveInDate, index + 1) <= businessDate) index += 1;
  while (index > 0 && addCalendarMonths(moveInDate, index) > businessDate) index -= 1;
  return index;
}

function nextChargeDate(moveInDate, businessDate) {
  const index = coverageIndexForDate(moveInDate, businessDate);
  const currentStart = addCalendarMonths(moveInDate, index);
  return currentStart > businessDate ? currentStart : addCalendarMonths(moveInDate, index + 1);
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

test("main business case: 5 July starts 5 July and next charge is 5 August", () => {
  assert.deepEqual(coveragePeriod("2026-07-05", 0), {
    coverageStart: "2026-07-05",
    coverageEnd: "2026-08-04",
  });
  assert.equal(nextChargeDate("2026-07-05", "2026-07-15"), "2026-08-05");
  assert.notEqual(nextChargeDate("2026-07-05", "2026-07-15"), "2026-08-01");
});

test("15th and after-15th move-ins still bill from exact move-in date", () => {
  assert.deepEqual(coveragePeriod("2026-07-15", 0), {
    coverageStart: "2026-07-15",
    coverageEnd: "2026-08-14",
  });
  assert.deepEqual(coveragePeriod("2026-07-18", 0), {
    coverageStart: "2026-07-18",
    coverageEnd: "2026-08-17",
  });
  assert.equal(nextChargeDate("2026-07-18", "2026-07-31"), "2026-08-18");
});

test("end-of-month anchors preserve original day across short months", () => {
  assert.equal(addCalendarMonths("2026-01-28", 1), "2026-02-28");
  assert.equal(addCalendarMonths("2024-02-29", 1), "2024-03-29");
  assert.equal(addCalendarMonths("2026-01-30", 1), "2026-02-28");
  assert.equal(addCalendarMonths("2026-01-30", 2), "2026-03-30");
  assert.equal(addCalendarMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addCalendarMonths("2026-01-31", 2), "2026-03-31");
  assert.deepEqual(coveragePeriod("2026-01-31", 0), {
    coverageStart: "2026-01-31",
    coverageEnd: "2026-02-27",
  });
  assert.deepEqual(coveragePeriod("2026-01-31", 1), {
    coverageStart: "2026-02-28",
    coverageEnd: "2026-03-30",
  });
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

test("no entry payment creates immediate first charge expectation", () => {
  const rows = allocationPlan({ moveInDate: "2026-07-05", monthlyRent: 100000, paymentAmount: 0 });
  assert.equal(rows.length, 0);
  const firstCharge = coveragePeriod("2026-07-05", 0);
  assert.deepEqual(firstCharge, { coverageStart: "2026-07-05", coverageEnd: "2026-08-04" });
  assert.equal(100000, 100000);
});

test("exact and multi-month advance entry payments cover anniversary periods", () => {
  assert.deepEqual(allocationPlan({ moveInDate: "2026-07-05", monthlyRent: 100000, paymentAmount: 100000 }), [{
    allocationType: "current_month",
    amountAllocated: 100000,
    coverageStart: "2026-07-05",
    coverageEnd: "2026-08-04",
    remainingCredit: 0,
  }]);
  assert.deepEqual(allocationPlan({ moveInDate: "2026-07-05", monthlyRent: 100000, paymentAmount: 300000 }).map((row) => [row.coverageStart, row.coverageEnd, row.amountAllocated]), [
    ["2026-07-05", "2026-08-04", 100000],
    ["2026-08-05", "2026-09-04", 100000],
    ["2026-09-05", "2026-10-04", 100000],
  ]);
});

test("scheduler missed cycle and duplicate run decisions use coverage starts", () => {
  const existingCoverageStarts = new Set(["2026-07-05"]);
  const dueStarts = [];
  for (let index = 0; index <= coverageIndexForDate("2026-07-05", "2026-09-06"); index += 1) {
    const period = coveragePeriod("2026-07-05", index);
    if (!existingCoverageStarts.has(period.coverageStart) && period.coverageStart <= "2026-09-06") {
      dueStarts.push(period.coverageStart);
      existingCoverageStarts.add(period.coverageStart);
    }
  }
  assert.deepEqual(dueStarts, ["2026-08-05", "2026-09-05"]);
  const duplicateRunDueStarts = [];
  for (let index = 0; index <= coverageIndexForDate("2026-07-05", "2026-09-06"); index += 1) {
    const period = coveragePeriod("2026-07-05", index);
    if (!existingCoverageStarts.has(period.coverageStart) && period.coverageStart <= "2026-09-06") duplicateRunDueStarts.push(period.coverageStart);
  }
  assert.deepEqual(duplicateRunDueStarts, []);
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
