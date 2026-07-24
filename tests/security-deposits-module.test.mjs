import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync("supabase/upgrade_migrations/0218_security_deposits_module.sql", "utf8");
const actions = readFileSync("app/actions/security-deposits.ts", "utf8");
const paymentsEntry = readFileSync("components/office/payments/FastPaymentsEntry.tsx", "utf8");
const roomOccupancy = readFileSync("app/actions/room-occupancy.ts", "utf8");
const vacateAction = readFileSync("app/actions/tenants.ts", "utf8");
const dashboardTypes = readFileSync("lib/dashboard-live/types.ts", "utf8");

test("security deposit module creates a separate liability schema", () => {
  for (const table of [
    "tenant_security_deposits",
    "security_deposit_transactions",
    "security_fund_usage",
    "security_refunds",
    "security_settlements",
  ]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
  }

  assert.match(migration, /create or replace function public\.record_tenant_security_deposit/);
  assert.match(migration, /create or replace function public\.use_security_funds/);
  assert.match(migration, /create or replace function public\.restore_security_funds/);
  assert.match(migration, /create or replace function public\.settle_security_deposit/);
  assert.match(migration, /create or replace view public\.security_deposit_register/);
});

test("security deposits are not posted through rent collection actions", () => {
  assert.match(actions, /record_tenant_security_deposit/);
  assert.doesNotMatch(actions, /recordCollectionLedgerAndCash/);
  assert.doesNotMatch(actions, /createTenantPaymentReceipt/);
  assert.match(migration, /Separate liability ledger\. Not rent, income, advance rent, or landlord payable/);
});

test("payments entry exposes a separate security recording path", () => {
  assert.match(paymentsEntry, /Security Deposit/);
  assert.match(paymentsEntry, /recordSecurityDeposit/);
  assert.match(paymentsEntry, /Rent balances were not changed/);
  assert.match(paymentsEntry, /securityRequired/);
});

test("move-in and vacate workflows carry security metadata", () => {
  assert.match(roomOccupancy, /securityAmount/);
  assert.match(roomOccupancy, /recordSecurityDeposit/);
  assert.match(vacateAction, /securitySettlement/);
  assert.match(vacateAction, /Select a security settlement decision before vacating/);
  assert.match(vacateAction, /settleSecurityDeposit/);
});

test("dashboard tracks security as separate liability cards", () => {
  for (const field of [
    "securityHeld",
    "securityCashAvailable",
    "securityUsedByCompany",
    "securityShortfall",
    "securityPendingSettlements",
  ]) {
    assert.match(dashboardTypes, new RegExp(field));
  }
});
