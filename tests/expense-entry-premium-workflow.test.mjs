import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const expensesConsole = readFileSync(new URL("../components/office/expenses/ExpensesConsole.tsx", import.meta.url), "utf8");
const expenseTypes = readFileSync(new URL("../lib/expenses/types.ts", import.meta.url), "utf8");
const expenseData = readFileSync(new URL("../lib/expenses/data.ts", import.meta.url), "utf8");
const expenseActions = readFileSync(new URL("../app/actions/expenses.ts", import.meta.url), "utf8");
const entrySearchRoute = readFileSync(new URL("../app/api/expenses/entry-search/route.ts", import.meta.url), "utf8");
const entryDetailRoute = readFileSync(new URL("../app/api/expenses/entry-detail/route.ts", import.meta.url), "utf8");
const allRounderMigration = readFileSync(new URL("../supabase/upgrade_migrations/0233_all_rounder_authorised_expense_search.sql", import.meta.url), "utf8");
const localEmployeeMigration = readFileSync(new URL("../supabase/upgrade_migrations/0239_authorised_expense_local_employee_search.sql", import.meta.url), "utf8");

test("expense entry exposes the approved premium workflow categories plus treasury transfers", () => {
  assert.match(expensesConsole, /type ExpenseEntryMode = "landlord_payment" \| "authorised" \| "unauthorised" \| "banking" \| "cash_handover_admin"/);
  assert.match(expensesConsole, /Landlord Payment/);
  assert.match(expensesConsole, /Authorised Expenses/);
  assert.match(expensesConsole, /Unauthorised Expenses/);
  assert.match(expensesConsole, /Banking/);
  assert.match(expensesConsole, /Cash Handover to Admin/);
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
    "Landlord Payment Due Date",
    "Due Date Status",
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
  assert.match(expensesConsole, /actionLabel=\{isManager \? undefined : "Edit Outstanding Balance"\}/);
  assert.match(expensesConsole, /openLandlordEdit\("landlord_outstanding_balance_edit"\)/);
  assert.match(expensesConsole, /openLandlordEdit\("landlord_payment_date_edit"\)/);
  assert.doesNotMatch(expensesConsole, /openLandlordEdit\("landlord_billing_date_edit"\)/);
  assert.match(expensesConsole, /Payment Due Today/);
  assert.match(expensesConsole, /Due This Week/);
  assert.match(expensesConsole, /Overdue by X days/);
  assert.match(expensesConsole, /Request Admin Approval/);
  assert.match(expensesConsole, /function LandlordEditModal/);
  assert.match(expensesConsole, /Landlord Summary/);
  assert.match(expensesConsole, /Financial Position/);
  assert.match(expensesConsole, /Payment Schedule/);
  assert.match(expensesConsole, /Portfolio/);
  assert.match(expensesConsole, /LandlordEditRequestLedger/);
  assert.match(expenseActions, /submitLandlordExpenseEdit/);
  assert.match(expenseActions, /decideLandlordExpenseEditRequest/);
  assert.match(expenseActions, /An outstanding balance change request is already awaiting Admin approval/);
  assert.match(expenseActions, /Landlord Payment Due Date change request is already awaiting Admin approval/);
  assert.match(expenseData, /landlord_expense_edit_requests/);
  assert.match(entryDetailRoute, /landlord_balance_adjustments/);
  assert.match(expenseTypes, /portfolioValue\?: number/);
  assert.match(expenseData, /landlordPortfolioById/);
});

test("employee lunch entry uses live detail cards and duplicate protection", () => {
  for (const label of [
    "Employee Home Office",
    "Submitting Office",
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
  assert.match(entrySearchRoute, /ddumba_v1_expense_employee_search/);
  assert.match(entrySearchRoute, /p_office_id: activeOfficeId/);
  assert.match(entrySearchRoute, /p_include_all_offices: canSeeAll/);
  assert.doesNotMatch(entrySearchRoute, /query = query\.eq\("office_id", activeOfficeId\)/);
  assert.match(entrySearchRoute, /isRealEmployee/);
  assert.match(entryDetailRoute, /createSupabaseAdminClient/);
  assert.doesNotMatch(entryDetailRoute, /employeeQuery = employeeQuery\.eq\("office_id", activeOfficeId\)/);
  assert.match(entryDetailRoute, /isEligibleEmployee/);
  assert.match(entryDetailRoute, /Only active employees in your office or company-wide All Rounders can be selected/);
  assert.match(entryDetailRoute, /dailyAllocation = 7000/);
  assert.match(expenseActions, /Lunch has already been recorded for this employee on this date\./);
  assert.match(expenseActions, /isAllRounderEmployee/);
  assert.match(expenseActions, /isEligibleAuthorisedExpenseEmployee/);
  assert.match(expenseActions, /employee_home_office_id/);
  assert.match(expenseActions, /submitting_office_id/);
  assert.match(expenseActions, /employee_expense_requests/);
  assert.match(allRounderMigration, /ddumba_v1_expense_all_rounder_search/);
  assert.match(allRounderMigration, /ddumba_v1_is_all_rounder_employee/);
  assert.match(allRounderMigration, /employee_assignment_type/);
  assert.match(allRounderMigration, /employee_home_office_id/);
  assert.match(allRounderMigration, /submitting_office_id/);
  assert.match(allRounderMigration, /ddumba_v1_prevent_duplicate_employee_lunch/);
  assert.match(localEmployeeMigration, /ddumba_v1_expense_employee_search/);
  assert.match(localEmployeeMigration, /e\.office_id = p_office_id/);
  assert.match(localEmployeeMigration, /ddumba_v1_is_all_rounder_employee/);
  assert.match(localEmployeeMigration, /p_include_all_offices/);
  assert.match(localEmployeeMigration, /office account/);
  assert.match(localEmployeeMigration, /revoke all on function public\.ddumba_v1_expense_employee_search/);
  assert.match(localEmployeeMigration, /grant execute on function public\.ddumba_v1_expense_employee_search\(uuid, uuid, text, boolean\) to service_role/);
  assert.doesNotMatch(localEmployeeMigration, /to authenticated, service_role/);
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

test("expense records expose amount and deletion correction workflow without office date changes", () => {
  assert.match(expensesConsole, /Change Amount/);
  assert.match(expensesConsole, /Request Deletion Approval/);
  assert.match(expensesConsole, new RegExp("Delete / Reverse Expense"));
  assert.match(expensesConsole, new RegExp("View Changes / Audit History"));
  assert.match(expensesConsole, /Pending Changes/);
  assert.match(expensesConsole, new RegExp("Deleted / Reversed"));
  assert.doesNotMatch(expensesConsole, /Change Date/);
  assert.doesNotMatch(expensesConsole, /Request Edit/);
  assert.doesNotMatch(expensesConsole, /Assign Employee/);
  assert.match(expenseActions, /Only expense amount corrections and deletion requests are allowed here/);
  assert.match(expenseActions, /This expense already has a pending change awaiting Admin approval/);
  assert.match(expenseActions, /financial_effective: false/);
  assert.doesNotMatch(expenseActions, /amount: 0,\\n\\s+deleted_at/);
});

test("expense page keeps the existing queues and recorded expenses ledger below entry", () => {
  assert.match(expensesConsole, /<LandlordPaymentRequestLedger activeOfficeName=\{activeOfficeName\} isAdmin=\{isAdmin\} offices=\{data\.offices\} requests=\{data\.landlordPaymentRequests\}/);
  assert.match(expensesConsole, /<GenericExpenseApprovalQueue/);
  assert.match(expensesConsole, /<EmployeeExpenseRequestLedger/);
  assert.match(expensesConsole, /<TreasuryCashRequestLedger/);
  assert.match(expensesConsole, /<BankingRecordsLedger/);
  assert.match(expensesConsole, /<ExpenseChangeRequestLedger/);
  assert.match(expensesConsole, /Recorded Expenses/);
});

test("expense summary cards and request ledgers are interactive and filterable", () => {
  assert.match(expensesConsole, /interactive\s+label="Total Collections"/);
  assert.match(expensesConsole, /interactive\s+label="Total Expenses"/);
  assert.match(expensesConsole, /function SummaryDrilldownModal/);
  assert.match(expensesConsole, /Total Collections Records/);
  assert.match(expensesConsole, /Total Expenses Records/);
  assert.match(expensesConsole, /aria-label="Close records drill-down"/);
  assert.match(expensesConsole, /aria-label="Close record details"/);
  assert.match(expensesConsole, /function RecordTableFilterBar/);
  assert.match(expensesConsole, /Clear All Filters/);
  assert.match(expensesConsole, /Date filter/);
  assert.match(expensesConsole, /Office filter/);
  assert.match(expensesConsole, /Matching records/);
  assert.match(expensesConsole, /Visible total/);
  assert.match(expenseTypes, /ExpenseReportCollectionItem/);
  assert.match(expenseData, /collections: collectionItems/);
});

test("banking entry uses treasury transfer semantics instead of expense semantics", () => {
  assert.match(expensesConsole, /submitTreasuryCashRequest/);
  assert.match(expensesConsole, /Bank Office Cash/);
  assert.match(expensesConsole, /Current Physical Office Cash/);
  assert.match(expensesConsole, /Expected Money at Bank After Banking/);
  assert.match(expensesConsole, /Banking transfers physical office cash to Money at Bank/);
  assert.match(expensesConsole, /requestType: "banking"/);
  assert.match(expensesConsole, /function BankingRecordsLedger/);
  assert.match(expenseTypes, /banking: \{/);
  assert.match(expenseData, /buildBankingSnapshot/);
});

test("cash handover to admin is an approval-backed expense-impacting treasury movement", () => {
  assert.match(expensesConsole, /Cash Handover Live Summary/);
  assert.match(expensesConsole, /Pending Cash Handover/);
  assert.match(expensesConsole, /Current Cash Held by Admin/);
  assert.match(expensesConsole, /Expected Admin Cash After Approval/);
  assert.match(expensesConsole, /requestType: "cash_handover_admin"/);
  assert.match(expensesConsole, /function TreasuryCashRequestLedger/);
  assert.match(expenseTypes, /treasuryCashRequests/);
  assert.match(expenseData, /treasury_cash_requests/);
  assert.match(expenseData, /pendingCashHandover/);
});
