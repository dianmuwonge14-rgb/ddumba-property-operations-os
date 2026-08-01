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
  assert.match(collections, /Payments can only be recorded for the current date\./);
  assert.match(security, /Security deposits can only be recorded for the current date\./);
  assert.match(expenses, /Expenses can only be recorded for the current date\./);
  assert.match(cash, /Expenses can only be recorded for the current date\./);
});

test("entry date controls are locked to Current Date while report filters remain independent", () => {
  const payments = readFileSync("components/office/payments/FastPaymentsEntry.tsx", "utf8");
  const expenses = readFileSync("components/office/expenses/ExpensesConsole.tsx", "utf8");
  const cash = readFileSync("components/office/cash-banking/CashBankingConsole.tsx", "utf8");

  assert.match(payments, /Current Date/);
  assert.match(payments, /readOnly/);
  assert.doesNotMatch(payments, /Selected payment date/);
  assert.match(expenses, /Current Date/);
  assert.doesNotMatch(expenses, /setExpenseDate\\(filters\\.singleDate\\)/);
  assert.match(cash, /Current Date/);
  assert.match(cash, /readOnly=\{readOnly\}/);
});

test("database migration installs targeted current-date guards for entry tables", () => {
  const migration = readFileSync("supabase/upgrade_migrations/0237_current_business_date_entry_guards.sql", "utf8");

  assert.match(migration, /ddumba_current_business_date/);
  assert.match(migration, /Africa\/Kampala/);
  assert.match(migration, /assert_current_business_date/);
  assert.match(migration, /tenant_security_deposits/);
  assert.match(migration, /date_received/);
  assert.match(migration, /Security deposits can only be recorded for the current date\./);
  assert.match(migration, /landlord_payment_expense_requests/);
  assert.match(migration, /treasury_cash_requests/);
  assert.match(migration, /bank_deposits/);
  assert.match(migration, /Expenses can only be recorded for the current date\./);
});
