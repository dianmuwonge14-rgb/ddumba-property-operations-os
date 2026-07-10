import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function monthStart(value) {
  const match = String(value ?? "").match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-01` : null;
}

function monthAfter(value) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function vacancyEffectiveMonth(vacateDate) {
  const month = monthStart(vacateDate);
  const day = Number(String(vacateDate).slice(8, 10));
  return day <= 15 ? month : monthAfter(month);
}

function vacantRoomDecision({ rent, settlementMonth, vacateDate }) {
  const effectiveMonth = vacancyEffectiveMonth(vacateDate);
  return effectiveMonth > monthStart(settlementMonth)
    ? { deduction: 0, payable: rent }
    : { deduction: rent, payable: 0 };
}

test("room vacated before or on cutoff is deducted in that settlement month", () => {
  assert.deepEqual(vacantRoomDecision({ rent: 70000, settlementMonth: "2026-07-01", vacateDate: "2026-07-10" }), {
    deduction: 70000,
    payable: 0,
  });
  assert.deepEqual(vacantRoomDecision({ rent: 70000, settlementMonth: "2026-07-01", vacateDate: "2026-07-15" }), {
    deduction: 70000,
    payable: 0,
  });
});

test("room vacated after cutoff remains payable until next settlement month", () => {
  assert.deepEqual(vacantRoomDecision({ rent: 70000, settlementMonth: "2026-07-01", vacateDate: "2026-07-16" }), {
    deduction: 0,
    payable: 70000,
  });
  assert.deepEqual(vacantRoomDecision({ rent: 70000, settlementMonth: "2026-08-01", vacateDate: "2026-07-16" }), {
    deduction: 70000,
    payable: 0,
  });
});

test("landlord report current summary uses monthly payable row instead of a separate live estimate", () => {
  const source = readFileSync("lib/landlords/data.ts", "utf8");
  assert.match(source, /currentMonthRow\s*\?\s*buildCurrentMonthPayableFromRow\(currentMonthRow\)/);
  assert.doesNotMatch(source, /mergeCurrentMonthPayableWithLiveEstimate/);
});

test("tenant vacation refreshes landlord payable and search index immediately", () => {
  const source = readFileSync("app/actions/tenants.ts", "utf8");
  assert.match(source, /refreshAffectedLandlordPayable/);
  assert.match(source, /ddumba_v1_refresh_landlord_search_index/);
});
