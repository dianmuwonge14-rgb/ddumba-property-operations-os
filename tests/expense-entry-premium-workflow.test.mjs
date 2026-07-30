import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const expensesConsole = readFileSync(new URL("../components/office/expenses/ExpensesConsole.tsx", import.meta.url), "utf8");
const expenseTypes = readFileSync(new URL("../lib/expenses/types.ts", import.meta.url), "utf8");
const expenseData = readFileSync(new URL("../lib/expenses/data.ts", import.meta.url), "utf8");

test("expense entry exposes only the approved premium workflow categories", () => {
  assert.match(expensesConsole, /type ExpenseEntryMode = "landlord_payment" \| "authorised" \| "unauthorised"/);
  assert.match(expensesConsole, /Landlord Payment/);
  assert.match(expensesConsole, /Authorised Expenses/);
  assert.match(expensesConsole, /Unauthorised Expenses/);
  assert.match(expensesConsole, /Employee Lunch/);
  assert.match(expensesConsole, /Airtime/);
  assert.match(expensesConsole, /Internet/);
  assert.match(expensesConsole, /Transport to Kampala/);
  assert.doesNotMatch(expensesConsole, /\["Office expense", "Fuel", "Lunch", "Transport", "Airtime", "Office supplies", "Employee expense", "Landlord Payment", "Other"\]/);
  assert.doesNotMatch(expensesConsole, /\["Lunch", "Fuel", "Transport", "Airtime", "Field facilitation", "Other"\]/);
});

test("authorised expense limits and office-only rules are visible in the entry workflow", () => {
  assert.match(expensesConsole, /Requested lunch amount exceeds the employee's available lunch balance\. Submit to Admin for approval\./);
  assert.match(expensesConsole, /Internet has already been claimed this month\./);
  assert.match(expensesConsole, /isEntebbeOperationsOffice/);
  assert.match(expensesConsole, /Transport to Kampala can only be recorded by Entebbe Operations Office\./);
  assert.match(expensesConsole, /Monthly Airtime Allocation/);
  assert.match(expensesConsole, /Remaining Internet Allocation/);
  assert.match(expensesConsole, /Trips Recorded/);
});

test("landlord payment entry has payment-style search, cards, and edit affordances", () => {
  assert.match(expensesConsole, /Search landlord/);
  assert.match(expensesConsole, /landlordOptions\.map/);
  for (const label of [
    "Landlord Name",
    "Location",
    "Outstanding Balance",
    "Payment Date",
    "Commission Type",
    "Portfolio Value",
    "Vacated With Debt",
    "Net Payable",
    "Payment Status",
  ]) {
    assert.match(expensesConsole, new RegExp(label));
  }
  assert.match(expensesConsole, /actionLabel="Edit"/);
  assert.match(expenseTypes, /portfolioValue\?: number/);
  assert.match(expenseData, /landlordPortfolioById/);
});

test("expense page keeps the existing queues and recorded expenses ledger below entry", () => {
  assert.match(expensesConsole, /<LandlordPaymentRequestLedger requests=\{data\.landlordPaymentRequests\}/);
  assert.match(expensesConsole, /<GenericExpenseApprovalQueue/);
  assert.match(expensesConsole, /<EmployeeExpenseRequestLedger/);
  assert.match(expensesConsole, /<ExpenseChangeRequestLedger/);
  assert.match(expensesConsole, /Recorded Expenses/);
});
