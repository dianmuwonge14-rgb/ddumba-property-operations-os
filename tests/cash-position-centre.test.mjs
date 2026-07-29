import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const pageSource = readFileSync(new URL("../app/office/admin/cash-position/page.tsx", import.meta.url), "utf8");
const dataSource = readFileSync(new URL("../lib/cash-position-centre/data.ts", import.meta.url), "utf8");
const typesSource = readFileSync(new URL("../lib/cash-position-centre/types.ts", import.meta.url), "utf8");
const componentSource = readFileSync(new URL("../components/office/cash-position/CashPositionCentre.tsx", import.meta.url), "utf8");
const expensesActionSource = readFileSync(new URL("../app/actions/expenses.ts", import.meta.url), "utf8");
const expensesDataSource = readFileSync(new URL("../lib/expenses/data.ts", import.meta.url), "utf8");
const expensesComponentSource = readFileSync(new URL("../components/office/expenses/ExpensesConsole.tsx", import.meta.url), "utf8");
const sidebarSource = readFileSync(new URL("../components/office/shared/OfficeSidebar.tsx", import.meta.url), "utf8");
const loginSource = readFileSync(new URL("../app/api/auth/office-login/route.ts", import.meta.url), "utf8");
const officeHomeSource = readFileSync(new URL("../app/office/page.tsx", import.meta.url), "utf8");

test("cash position centre is an admin-only live Supabase page", () => {
  assert.match(pageSource, /getCashPositionCentreData/);
  assert.match(dataSource, /requireCompanyAdminMode\(\)/);
  assert.match(dataSource, /createSupabaseAdminClient\(\)/);
  assert.match(dataSource, /\.from\("collections"\)/);
  assert.match(dataSource, /\.from\("cash_transactions"\)/);
  assert.match(dataSource, /\.from\("field_collector_profiles"\)/);
  assert.match(dataSource, /\.from\("security_deposit_register"\)/);
  assert.doesNotMatch(componentSource, /placeholder/i);
});

test("admin navigation makes Cash Position Centre the CFO landing page", () => {
  const cashPosition = sidebarSource.indexOf('/office/admin/cash-position", label: "Cash Position Centre"');
  const dashboard = sidebarSource.indexOf('/office", label: "Dashboard"');
  assert.ok(cashPosition > 0, "Cash Position Centre nav entry should exist");
  assert.ok(cashPosition < dashboard, "Cash Position Centre should be first for Admin");
  assert.match(sidebarSource, /pathname\.includes\("\/cash-position"\)/);
  assert.match(sidebarSource, /logoHref = isAdmin \? "\/office\/admin\/cash-position"/);
  assert.match(loginSource, /isAdmin \? "\/office\/admin\/cash-position"/);
  assert.match(officeHomeSource, /redirect\("\/office\/admin\/cash-position"\)/);
});

test("cash position centre includes requested executive KPIs and live office table fields", () => {
  for (const label of [
    "Total Cash After Approved Expenses",
    "Approved Expenses",
    "Pending Expenses",
    "Projected Cash After Pending Approval",
    "Offices With Negative or Low Cash",
    "Total Cash Collected",
    "Cash Held by Offices",
    "Cash Held by Collectors",
    "Cash Banked",
    "Cash Handed to Admin",
    "Outstanding to Bank",
    "Unreconciled Cash",
    "Security Deposit Cash",
    "Security Shortfall",
    "Today’s Collection Performance",
    "Approved Expenses Today",
    "Approved Expenses This Month",
    "Pending Expense Requests",
    "Cash Before Expenses",
    "Cash After Expenses",
    "Projected Cash After Pending Approvals",
  ]) {
    assert.match(dataSource + componentSource, new RegExp(label));
  }
  for (const field of ["cashCollectedToday", "cashHeldInOffice", "cashHeldByCollectors", "alreadyBanked", "outstandingToBank", "bankingPercentage", "weeklyPerformance", "monthlyPerformance", "approvedExpensesPeriod", "pendingExpensesPeriod", "cashBeforeExpenses", "cashAfterApprovedExpenses", "projectedCashAfterPendingExpenses"]) {
    assert.match(typesSource, new RegExp(field));
  }
});

test("cash position centre ships filters, AI insights, charts and exports", () => {
  for (const label of ["Today", "Yesterday", "Last 7 Days", "This Month", "Previous Month", "This Year", "Custom Date", "Custom Date Range", "Specific Day of Month", "Collector", "Banking Status", "Expense Status"]) {
    assert.match(componentSource, new RegExp(label));
  }
  assert.match(pageSource, /expenseStatus: scalar\(params\.expenseStatus\)/);
  assert.match(dataSource, /expenseStatus: input\.expenseStatus \|\| null/);
  assert.match(componentSource, /updateFilter\("expenseStatus", value\)/);
  assert.match(componentSource, /AI Cash Director/);
  assert.match(componentSource, /Daily Cash Movement/);
  assert.match(componentSource, /Office Performance Comparison/);
  assert.match(componentSource, /Collector Comparison/);
  assert.match(componentSource, /Security Liability vs Available Cash/);
  assert.match(componentSource, /DailyCashCards/);
  assert.match(componentSource, /OfficeComparisonCards/);
  assert.match(componentSource, /CollectorCards/);
  assert.match(componentSource, /CSV/);
  assert.match(componentSource, /Excel/);
  assert.match(componentSource, /PDF/);
  assert.match(componentSource, /window\.print\(\)/);
});

test("cash position centre leads with net cash after approved expenses", () => {
  const header = componentSource.indexOf("Total Office Cash After Expenses");
  const filters = componentSource.indexOf("Treasury Filter Bar");
  const firstKpi = componentSource.indexOf("{netKpis.map");
  const gross = componentSource.indexOf("Gross Cash Movement and Control");
  assert.ok(header > 0, "top header should include the net cash summary card");
  assert.ok(filters > header, "filters should sit inside the top header after the net summary");
  assert.ok(firstKpi > filters, "net KPI row should follow the header filters");
  assert.ok(gross > firstKpi, "gross movement section should move below the net KPI row");
});

test("cash position centre cards are responsive and action buttons are wired", () => {
  assert.match(componentSource, /grid-cols-\[repeat\(auto-fit,minmax\(260px,1fr\)\)\]/);
  assert.match(componentSource, /grid-cols-\[repeat\(auto-fit,minmax\(280px,1fr\)\)\]/);
  assert.match(componentSource, /grid-cols-\[repeat\(auto-fit,minmax\(300px,1fr\)\)\]/);
  assert.match(componentSource, /overflow-x-hidden/);
  assert.match(componentSource, /break-words/);
  assert.match(componentSource, /overflow-wrap|break-words/);
  assert.match(componentSource, /actionUrl/);
  assert.match(componentSource, /viewOfficePosition/);
  assert.match(componentSource, /viewOfficeReceipts/);
  assert.match(componentSource, /viewCollectorReceipts/);
  assert.match(componentSource, /openCollectorPanel/);
  assert.match(componentSource, /CollectorActionPanel/);
  for (const label of ["View Office Position", "View Receipts", "View Cash Position", "View Activity", "Reconcile Collector"]) {
    assert.match(componentSource, new RegExp(label));
  }
  assert.doesNotMatch(componentSource, /onClick=\{\(\) => \{\}\}/);
  assert.doesNotMatch(componentSource, /href="#"/);
});

test("cash position action filters reach receipt history", () => {
  assert.match(pageSource, /collectorId: scalar\(params\.collectorId\)/);
  assert.match(pageSource, /bankingStatus: scalar\(params\.bankingStatus\)/);
  assert.match(componentSource, /\/office\/receipts/);
  assert.match(componentSource, /officeId/);
  assert.match(componentSource, /collectorId/);
});

test("cash position receipt counts use canonical payment drill-down rows", () => {
  assert.match(dataSource, /ACTIVE_RECEIPT_STATUSES/);
  assert.match(dataSource, /distinctById/);
  assert.match(dataSource, /\.from\("payment_receipts"\)/);
  assert.match(dataSource, /canonicalReceiptByPayment/);
  assert.match(dataSource, /receiptBreakdown\.filter\(\(item\) => item\.contributesToReceiptCount\)\.length/);
  assert.match(typesSource, /CashPositionReceiptBreakdownItem/);
  assert.match(typesSource, /contributesToCashTotals/);
  assert.match(typesSource, /contributesToReceiptCount/);
  assert.match(componentSource, /ReceiptBreakdownPanel/);
  assert.match(componentSource, /View Receipt/);
  assert.match(componentSource, /Open Payment/);
  assert.match(componentSource, /View Audit History/);
  assert.match(componentSource, /Missing receipt/);
  assert.match(componentSource, /onViewReceiptsBreakdown/);
});

test("cash position centre keeps banking writes on the canonical cash banking workflow", () => {
  assert.match(componentSource, /\/office\/admin\/cash-banking/);
  assert.doesNotMatch(componentSource, /from\("cash_transactions"\)\.insert/);
  assert.doesNotMatch(componentSource, /from\("collections"\)\.insert/);
});

test("non-admin office expenses require admin approval before cash impact", () => {
  assert.match(expensesActionSource, /isDirectAdmin \? "approved" : "pending"/);
  assert.match(expensesActionSource, /expense_submitted_for_admin_approval/);
  assert.match(expensesActionSource, /Expense pending Admin approval/);
  assert.match(expensesActionSource, /if \(isDirectAdmin\) \{\s*await postOfficeCashOutflow/s);
  assert.match(expensesActionSource, /export async function approveExpense/);
  assert.match(expensesActionSource, /requireCompanyAdminMode\(\)/);
  assert.match(expensesActionSource, /\.eq\("status", "pending"\)/);
  assert.match(expensesActionSource, /sourceType: "expense"/);
  assert.match(expensesActionSource, /Expense is already approved/);
  assert.match(expensesActionSource, /Rejection reason is required/);
  assert.match(expensesDataSource, /const approvedExpenses = expenses\.filter\(isApprovedExpense\)/);
  assert.match(expensesComponentSource, /GenericExpenseApprovalQueue/);
  assert.match(expensesComponentSource, /Sent for Admin Approval/);
});
