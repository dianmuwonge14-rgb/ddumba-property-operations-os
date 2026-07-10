import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function amount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function monthlyDue(row) {
  return Math.max(0, amount(row.monthly_net_payable ?? row.net_payable));
}

function monthlyUnpaid(row) {
  const due = monthlyDue(row);
  return Math.max(0, due - Math.min(amount(row.amount_paid), due));
}

function validate(rows, allocations = []) {
  const issues = [];
  const monthCounts = new Map();
  for (const row of rows.filter((row) => !["archived", "reversed", "voided", "cancelled"].includes(String(row.status ?? "").toLowerCase()))) {
    const month = String(row.settlement_month ?? "").slice(0, 10);
    monthCounts.set(month, (monthCounts.get(month) ?? 0) + 1);
    if (Math.round(amount(row.unpaid_balance)) !== Math.round(monthlyUnpaid(row))) issues.push("monthly_unpaid_mismatch");
    if (amount(row.advance_created) > 0 && rows.some((candidate) => monthlyUnpaid(candidate) > 0)) issues.push("advance_with_unpaid_balance");
  }
  for (const count of monthCounts.values()) if (count > 1) issues.push("duplicate_monthly_payable");
  const sorted = [...rows].sort((a, b) => String(a.settlement_month).localeCompare(String(b.settlement_month)));
  const firstUnpaid = sorted.findIndex((row) => monthlyUnpaid(row) > 0);
  if (firstUnpaid >= 0 && sorted.slice(firstUnpaid + 1).some((row) => amount(row.amount_paid) > 0)) issues.push("paid_later_month_before_older_unpaid");

  const seen = new Set();
  for (const row of allocations) {
    const key = `${row.reference}:${row.monthly_payable_id}:${Math.round(amount(row.amount))}`;
    if (seen.has(key)) issues.push("duplicate_payment_allocation");
    seen.add(key);
  }
  return issues;
}

test("integrity checker rejects duplicate monthly payable rows", () => {
  const issues = validate([
    { id: "a", settlement_month: "2026-07-01", monthly_net_payable: 100, amount_paid: 0, unpaid_balance: 100 },
    { id: "b", settlement_month: "2026-07-01", monthly_net_payable: 100, amount_paid: 0, unpaid_balance: 100 },
  ]);
  assert.ok(issues.includes("duplicate_monthly_payable"));
});

test("integrity checker rejects advance while unpaid balances remain", () => {
  const issues = validate([
    { settlement_month: "2026-06-01", monthly_net_payable: 100, amount_paid: 80, unpaid_balance: 20 },
    { settlement_month: "2026-07-01", monthly_net_payable: 100, amount_paid: 100, unpaid_balance: 0, advance_created: 50 },
  ]);
  assert.ok(issues.includes("advance_with_unpaid_balance"));
});

test("integrity checker rejects paying a later month while older month remains unpaid", () => {
  const issues = validate([
    { settlement_month: "2026-06-01", monthly_net_payable: 100, amount_paid: 50, unpaid_balance: 50 },
    { settlement_month: "2026-07-01", monthly_net_payable: 100, amount_paid: 20, unpaid_balance: 80 },
  ]);
  assert.ok(issues.includes("paid_later_month_before_older_unpaid"));
});

test("integrity checker rejects duplicate payment allocation rows", () => {
  const issues = validate([], [
    { reference: "REF-1", monthly_payable_id: "month-1", amount: 300000 },
    { reference: "REF-1", monthly_payable_id: "month-1", amount: 300000 },
  ]);
  assert.ok(issues.includes("duplicate_payment_allocation"));
});

test("landlord payment write paths run integrity check after approval", () => {
  const sources = ["app/actions/expenses.ts", "app/actions/landlords.ts"];
  for (const file of sources) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /assertLandlordPayableIntegrity/, file);
  }
});

test("database migration installs duplicate and immutability safeguards", () => {
  const source = readFileSync("supabase/upgrade_migrations/0201_landlord_payment_engine_protection.sql", "utf8");
  assert.match(source, /idx_landlord_monthly_payables_one_active_month/);
  assert.match(source, /idx_landlord_debt_deductions_unique_source_month_v2/);
  assert.match(source, /idx_landlord_monthly_payable_payments_reference_guard/);
  assert.match(source, /ddumba_prevent_paid_landlord_payable_mutation/);
});
