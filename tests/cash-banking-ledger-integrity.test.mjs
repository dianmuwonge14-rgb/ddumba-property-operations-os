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

test("prior-day office banking calculates from signed office ledger and excludes selected-day cash", () => {
  const migration = readFileSync("supabase/upgrade_migrations/0224_prior_day_office_cash_banking.sql", "utf8");

  assert.match(migration, /ddumba_v1_office_cash_ledger_balance/);
  assert.match(migration, /ddumba_v1_office_daily_cash_remaining/);
  assert.match(migration, /ddumba_v1_calculate_prior_day_bankable_office_cash/);
  assert.match(migration, /ddumba_v1_bank_prior_day_office_cash/);
  assert.match(migration, /v_eligible_amount := greatest\(v_total_office_cash - v_today_cash_remaining, 0\)/);
  assert.match(migration, /source_type = 'bank_deposit'/);
  assert.match(migration, /This deposit reference has already been recorded/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.doesNotMatch(migration, /v_office_balance_before :=[\s\S]*collections c/);
});

test("admin cash entry posts through the authoritative cash transaction ledger", () => {
  const action = readFileSync("app/actions/cash-banking.ts", "utf8");

  assert.match(action, /export async function recordAdminCashMovement/);
  assert.match(action, /source_type: "admin_cash_received"/);
  assert.match(action, /source_type: "admin_cash_out"/);
  assert.match(action, /source_type: "admin_bank_deposit"/);
  assert.ok(action.includes('.from("cash_transactions").insert(rows)'));
});

test("admin money to office uses the atomic transfer RPC and defaults to Admin Cash", () => {
  const action = readFileSync("app/actions/cash-banking.ts", "utf8");
  const giveMoneyBody = action.slice(action.indexOf("export async function giveMoneyToOffice"), action.indexOf("export async function recordAdminCashMovement"));
  const component = readFileSync("components/office/cash-banking/CashBankingConsole.tsx", "utf8");
  const migration = readFileSync("supabase/upgrade_migrations/0235_admin_cash_transfer_to_office_rpc.sql", "utf8");
  const legacyBackfill = readFileSync("supabase/upgrade_migrations/0236_legacy_admin_float_collection_backfill.sql", "utf8");

  assert.match(giveMoneyBody, /ddumba_v1_admin_cash_transfer_to_office/);
  assert.match(giveMoneyBody, /p_office_id: input\.officeId/);
  assert.match(giveMoneyBody, /p_source: input\.source/);
  assert.doesNotMatch(giveMoneyBody, /\.from\("cash_transfers"\)\s*\.insert\(\{/);
  assert.match(component, /source: "admin_cash" as "bank" \| "admin_cash" \| "admin_capital_injection"/);
  assert.match(component, /optionValues=\{\["bank", "admin_cash", "admin_capital_injection"\]\}/);
  assert.match(migration, /create or replace function public\.ddumba_v1_admin_cash_transfer_to_office/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /raise exception '% is insufficient\. Available: UGX %\.'/);
  assert.match(migration, /case when v_source = 'bank' then 'Money at Bank' else 'Admin cash' end/);
  assert.match(migration, /type = 'ADMIN_CASH_TRANSFER'/);
  assert.match(migration, /insert into public\.collections/);
  assert.match(migration, /left join public\.admin_cash_movements acm/);
  assert.match(legacyBackfill, /left\(ct\.source_id::text, 8\)/);
  assert.match(legacyBackfill, /type = 'ADMIN_CASH_TRANSFER'/);
  assert.doesNotMatch(legacyBackfill, /insert into public\.cash_transactions/);
});
