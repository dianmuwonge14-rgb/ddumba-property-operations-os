import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const expensesConsole = readFileSync(new URL("../components/office/expenses/ExpensesConsole.tsx", import.meta.url), "utf8");
const expenseTypes = readFileSync(new URL("../lib/expenses/types.ts", import.meta.url), "utf8");
const expenseData = readFileSync(new URL("../lib/expenses/data.ts", import.meta.url), "utf8");
const expenseActions = readFileSync(new URL("../app/actions/expenses.ts", import.meta.url), "utf8");
const entrySearchRoute = readFileSync(new URL("../app/api/expenses/entry-search/route.ts", import.meta.url), "utf8");
const entryDetailRoute = readFileSync(new URL("../app/api/expenses/entry-detail/route.ts", import.meta.url), "utf8");

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
  assert.match(expensesConsole, /\/api\/expenses\/entry-search\?type=landlord/);
  assert.match(expensesConsole, /\/api\/expenses\/entry-detail\?type=\$\{type\}/);
  assert.doesNotMatch(expensesConsole, /landlordOptions\.map/);
  assert.doesNotMatch(expensesConsole, /employeeOptions\.slice\(0, 18\)\.map/);
  for (const label of [
    "Landlord Name",
    "Location",
    "Outstanding Balance",
    "Last Payment Amount",
    "Last Payment Date",
    "Landlord Payment Date",
    "Landlord Billing Date",
    "Commission Type",
    "Full Rent Roll",
    "Portfolio Value",
    "Vacated With Debt",
    "Net Payable",
    "Advance Balance",
    "Payment Status",
  ]) {
    assert.match(expensesConsole, new RegExp(label));
  }
  assert.match(expensesConsole, /actionLabel="Edit"/);
  assert.match(expensesConsole, /openLandlordEdit\("landlord_outstanding_balance_edit"\)/);
  assert.match(expensesConsole, /openLandlordEdit\("landlord_payment_date_edit"\)/);
  assert.match(expensesConsole, /openLandlordEdit\("landlord_billing_date_edit"\)/);
  assert.match(expensesConsole, /function LandlordEditModal/);
  assert.match(expensesConsole, /Landlord Summary/);
  assert.match(expensesConsole, /Financial Position/);
  assert.match(expensesConsole, /Payment Schedule/);
  assert.match(expensesConsole, /Portfolio/);
  assert.match(expensesConsole, /LandlordEditRequestLedger/);
  assert.match(expenseActions, /submitLandlordExpenseEdit/);
  assert.match(expenseActions, /decideLandlordExpenseEditRequest/);
  assert.match(expenseData, /landlord_expense_edit_requests/);
  assert.match(entryDetailRoute, /landlord_balance_adjustments/);
  assert.match(expenseTypes, /portfolioValue\?: number/);
  assert.match(expenseData, /landlordPortfolioById/);
});

test("employee lunch entry uses live detail cards and duplicate protection", () => {
  for (const label of [
    "Daily Lunch Allocation",
    "Previous Unused Lunch Balance",
    "Lunch Available Today",
    "Total Usable Lunch",
    "Lunch Used Today",
    "Remaining Lunch Balance",
    "Last Lunch Expense Date",
    "Approval Status",
  ]) {
    assert.match(expensesConsole, new RegExp(label));
  }
  assert.match(entrySearchRoute, /from\("employees"\)/);
  assert.match(entrySearchRoute, /isRealEmployee/);
  assert.match(entryDetailRoute, /dailyAllocation = 7000/);
  assert.match(expenseActions, /Lunch has already been recorded for this employee on this date\./);
  assert.match(expenseActions, /employee_expense_requests/);
});

test("recorded expense list filters by business expense date and supports all dates", () => {
  assert.match(expenseTypes, /all_dates/);
  assert.match(expenseData, /mode === "all_dates"/);
  assert.match(expensesConsole, /Today/);
  assert.match(expensesConsole, /Yesterday/);
  assert.match(expensesConsole, /This Week/);
  assert.match(expensesConsole, /This Month/);
  assert.match(expensesConsole, /Custom Date/);
  assert.match(expensesConsole, /Custom Range/);
  assert.match(expensesConsole, /All Dates/);
  assert.match(expensesConsole, /Expense Date/);
  assert.match(expensesConsole, /Employee or Landlord/);
  assert.match(expenseData, /\.gte\("expense_date", resolved\.startDate\)/);
});

test("expense page keeps the existing queues and recorded expenses ledger below entry", () => {
  assert.match(expensesConsole, /<LandlordPaymentRequestLedger requests=\{data\.landlordPaymentRequests\}/);
  assert.match(expensesConsole, /<GenericExpenseApprovalQueue/);
  assert.match(expensesConsole, /<EmployeeExpenseRequestLedger/);
  assert.match(expensesConsole, /<ExpenseChangeRequestLedger/);
  assert.match(expensesConsole, /Recorded Expenses/);
});
