import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("shared Kampala business-date helper is used by financial entry actions", () => {
  const helper = readFileSync("lib/business-date.ts", "utf8");
  const collections = readFileSync("app/actions/collections.ts", "utf8");
  const security = readFileSync("app/actions/security-deposits.ts", "utf8");
  const expenses = readFileSync("app/actions/expenses.ts", "utf8");
  const cash = readFileSync("app/actions/cash-banking.ts", "utf8");

  assert.match(helper, /timeZone: BUSINESS_TIME_ZONE/);
  assert.match(helper, /Africa\/Kampala/);
  assert.match(helper, /export function assertCurrentBusinessDate/);
  assert.match(helper, /export function assertFinancialEntryDate/);
  assert.match(helper, /financial_entries\.backdate/);
  assert.match(helper, /Future-dated entries are not permitted\./);
  assert.match(helper, /A backdating reason is required\./);
  assert.match(collections, /Payments can only be recorded for the current date\./);
  assert.match(security, /Security deposits can only be recorded for the current date\./);
  assert.match(expenses, /Expenses can only be recorded for the current date\./);
  assert.match(cash, /Expenses can only be recorded for the current date\./);
  assert.match(collections, /backdatingReason/);
  assert.match(security, /backdatingReason/);
  assert.match(expenses, /backdatingReason/);
  assert.match(cash, /backdatingReason/);
});

test("entry date controls keep non-admins locked while exposing Admin backdate authority", () => {
  const payments = readFileSync("components/office/payments/FastPaymentsEntry.tsx", "utf8");
  const expenses = readFileSync("components/office/expenses/ExpensesConsole.tsx", "utf8");
  const cash = readFileSync("components/office/cash-banking/CashBankingConsole.tsx", "utf8");

  assert.match(payments, /Current Date/);
  assert.match(payments, /Admin backdate authority/);
  assert.match(payments, /readOnly=\{!isAdmin\}/);
  assert.match(payments, /Backdating Reason/);
  assert.doesNotMatch(payments, /Selected payment date/);
  assert.match(expenses, /Current Date/);
  assert.match(expenses, /Admin backdate authority/);
  assert.match(expenses, /readOnly=\{!isAdmin\}/);
  assert.match(expenses, /Backdating Reason/);
  assert.doesNotMatch(expenses, /setExpenseDate\\(filters\\.singleDate\\)/);
  assert.match(cash, /Current Date/);
  assert.match(cash, /readOnly=\{readOnly\}/);
});

test("database migration installs Admin-aware backdate guards for entry tables", () => {
  const migration = readFileSync("supabase/upgrade_migrations/0254_admin_financial_entry_backdating.sql", "utf8");

  assert.match(migration, /ddumba_current_business_date/);
  assert.match(migration, /financial_entries\.backdate/);
  assert.match(migration, /ddumba_enforce_financial_entry_date/);
  assert.match(migration, /Only Admin may record a past-date transaction\./);
  assert.match(migration, /A backdating reason is required\./);
  assert.match(migration, /Future-dated entries are not permitted\./);
  assert.match(migration, /collections/);
  assert.match(migration, /payment_date/);
  assert.match(migration, /tenant_security_deposits/);
  assert.match(migration, /date_received/);
  assert.match(migration, /Security deposits can only be recorded for the current date\./);
  assert.match(migration, /landlord_payment_expense_requests/);
  assert.match(migration, /treasury_cash_requests/);
  assert.match(migration, /bank_deposits/);
  assert.match(migration, /Expenses can only be recorded for the current date\./);
});
