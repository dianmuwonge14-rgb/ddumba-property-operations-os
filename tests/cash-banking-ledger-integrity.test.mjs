import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const inactiveStatuses = new Set(["voided", "removed", "removed_by_admin_approval", "rejected", "pending", "cancelled", "canceled", "deleted"]);

function officeCashBalance({ collections = [], collectorSubmissions = [], adminInflows = [], expenses = [], landlordPayments = [], deposits = [], transfersOut = [] }) {
  const approved = (row, fallback = "approved") => !inactiveStatuses.has(String(row.status ?? fallback).toLowerCase());
  const sum = (rows) => rows.filter((row) => approved(row)).reduce((total, row) => total + Number(row.amount || 0), 0);
  return (
    sum(collections)
    + sum(collectorSubmissions)
    + sum(adminInflows)
    - sum(expenses)
    - sum(landlordPayments)
    - sum(deposits)
    - sum(transfersOut)
  );
}

test("office cash formula excludes pending and rejected financial movements", () => {
  const balance = officeCashBalance({
    collections: [{ amount: 500_000 }, { amount: 100_000, status: "pending" }],
    collectorSubmissions: [{ amount: 120_000, status: "approved" }],
    adminInflows: [{ amount: 300_000, status: "completed" }],
    expenses: [{ amount: 50_000, status: "approved" }, { amount: 80_000, status: "rejected" }],
    landlordPayments: [{ amount: 200_000, status: "approved" }],
    deposits: [{ amount: 250_000, status: "approved" }, { amount: 40_000, status: "pending" }],
    transfersOut: [{ amount: 30_000, status: "cancelled" }],
  });

  assert.equal(balance, 420_000);
});

test("office banking RPC is protected by transaction lock and duplicate-reference guard", () => {
  const migration = readFileSync("supabase/upgrade_migrations/0202_cash_banking_ledger_integrity.sql", "utf8");

  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /idx_bank_deposits_unique_reference/);
  assert.match(migration, /This deposit reference has already been recorded/);
  assert.match(migration, /collector_money_submission/);
  assert.ok(migration.includes("coalesce(ct.status, 'approved') in ('approved','completed')"));
});

test("admin cash entry posts through the authoritative cash transaction ledger", () => {
  const action = readFileSync("app/actions/cash-banking.ts", "utf8");

  assert.match(action, /export async function recordAdminCashMovement/);
  assert.match(action, /source_type: "admin_cash_received"/);
  assert.match(action, /source_type: "admin_cash_out"/);
  assert.match(action, /source_type: "admin_bank_deposit"/);
  assert.ok(action.includes('.from("cash_transactions").insert(rows)'));
});
