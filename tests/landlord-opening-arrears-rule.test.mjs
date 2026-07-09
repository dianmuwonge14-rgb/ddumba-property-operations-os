import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function monthUnpaid(row) {
  const monthlyDue = Number(row.monthly_net_payable ?? row.net_payable ?? 0);
  const paid = Math.max(0, Number(row.amount_paid ?? 0));
  return Math.max(0, monthlyDue - Math.min(paid, monthlyDue));
}

test("opening arrears is informational and not added into landlord outstanding", () => {
  const monthOne = {
    monthly_net_payable: 280000,
    opening_arrears: 999999,
    amount_paid: 0,
  };
  const monthTwo = {
    monthly_net_payable: 280000,
    opening_arrears: 280000,
    amount_paid: 0,
  };

  const totalOutstanding = [monthOne, monthTwo].reduce((total, row) => total + monthUnpaid(row), 0);

  assert.equal(monthUnpaid(monthOne), 280000);
  assert.equal(monthUnpaid(monthTwo), 280000);
  assert.equal(totalOutstanding, 560000);
});

test("active landlord code does not rebuild total due from opening arrears plus monthly payable", () => {
  const activeSources = [
    "app/actions/landlords.ts",
    "lib/landlords/data.ts",
    "lib/landlord-payables/data.ts",
    "components/office/landlords/LandlordPaymentsConsole.tsx",
    "components/office/landlords/LandlordProfile.tsx",
    "supabase/upgrade_migrations/0187_monthly_rent_rollover_engine.sql",
    "supabase/upgrade_migrations/0198_landlord_opening_arrears_information_only.sql",
  ];

  for (const file of activeSources) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /openingArrears\s*\+\s*(netPayable|monthlyNetPayable)/, file);
    assert.doesNotMatch(source, /opening_arrears[^;\n]+(\+|\|\|)[^;\n]+(net_payable|monthly_net_payable)/i, file);
  }
});
