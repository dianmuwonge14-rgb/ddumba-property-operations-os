import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const pageSource = readFileSync(new URL("../app/office/admin/cash-position/page.tsx", import.meta.url), "utf8");
const dataSource = readFileSync(new URL("../lib/cash-position-centre/data.ts", import.meta.url), "utf8");
const typesSource = readFileSync(new URL("../lib/cash-position-centre/types.ts", import.meta.url), "utf8");
const componentSource = readFileSync(new URL("../components/office/cash-position/CashPositionCentre.tsx", import.meta.url), "utf8");
const errorBoundarySource = readFileSync(new URL("../app/office/admin/cash-position/error.tsx", import.meta.url), "utf8");
const expensesActionSource = readFileSync(new URL("../app/actions/expenses.ts", import.meta.url), "utf8");
const expensesDataSource = readFileSync(new URL("../lib/expenses/data.ts", import.meta.url), "utf8");
const expensesComponentSource = readFileSync(new URL("../components/office/expenses/ExpensesConsole.tsx", import.meta.url), "utf8");
const sidebarSource = readFileSync(new URL("../components/office/shared/OfficeSidebar.tsx", import.meta.url), "utf8");
const loginSource = readFileSync(new URL("../app/api/auth/office-login/route.ts", import.meta.url), "utf8");
const officeHomeSource = readFileSync(new URL("../app/office/page.tsx", import.meta.url), "utf8");
const cashBankingDataSource = readFileSync(new URL("../lib/cash-banking/data.ts", import.meta.url), "utf8");
const cashBankingTypesSource = readFileSync(new URL("../lib/cash-banking/types.ts", import.meta.url), "utf8");
const cashBankingComponentSource = readFileSync(new URL("../components/office/cash-banking/CashBankingConsole.tsx", import.meta.url), "utf8");
const cashBankingActionSource = readFileSync(new URL("../app/actions/cash-banking.ts", import.meta.url), "utf8");

function selectedPeriodOfficeCash({ approvedExpenses = [], banked = [], collections = [], handedToAdmin = [], periodEnd, periodStart }) {
  const inRange = (row) => row.date >= periodStart && row.date <= periodEnd;
  const sum = (rows) => rows.filter(inRange).reduce((total, row) => total + row.amount, 0);
  return sum(collections) - sum(approvedExpenses) - sum(banked) - sum(handedToAdmin);
}

function selectedPeriodCompanyCashPosition({ approvedExpenses = [], collections = [], periodEnd, periodStart }) {
  const inRange = (row) => row.date >= periodStart && row.date <= periodEnd;
  const sum = (rows) => rows.filter(inRange).reduce((total, row) => total + row.amount, 0);
  return sum(collections) - sum(approvedExpenses);
}

function displayedSelectedPeriodOfficeCash(input) {
  const raw = selectedPeriodOfficeCash(input);
  return {
    raw,
    displayed: Math.max(0, raw),
    reconciliationDifference: raw < 0 ? Math.abs(raw) : 0,
  };
}

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
    "Company Cash Position",
    "Approved Expenses",
    "Pending Expenses",
    "Projected Cash After Pending Approval",
    "Offices With Negative or Low Cash",
    "Total Cash Collected",
    "Current Physical Office Cash",
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
    "Projected Cash After Pending Approvals",
  ]) {
    assert.match(dataSource + componentSource, new RegExp(label));
  }
  for (const field of ["cashCollectedToday", "cashHeldInOffice", "cashHeldByCollectors", "alreadyBanked", "outstandingToBank", "bankingPercentage", "weeklyPerformance", "monthlyPerformance", "approvedExpensesPeriod", "pendingExpensesPeriod", "cashBeforeExpenses", "cashAfterApprovedExpenses", "companyCashPosition", "currentPhysicalOfficeCash", "projectedCashAfterPendingExpenses", "expenseCount", "currentAccumulatedOfficeCash", "rawCashAtOffice", "cashReconciliationDifference", "cashReconciliationCause"]) {
    assert.match(typesSource, new RegExp(field));
  }
});

test("cash position centre ships filters, AI insights, charts and exports", () => {
  for (const label of ["All Dates", "Today", "Yesterday", "Last 7 Days", "This Month", "Previous Month", "This Year", "Custom Date", "Custom Date Range", "Specific Day of Month", "Collector", "Banking Status", "Expense Status"]) {
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
  const header = componentSource.indexOf("Company Cash Position");
  const filters = componentSource.indexOf("Treasury Filter Bar");
  const officeCards = componentSource.indexOf("<OfficeComparisonCards");
  const firstKpi = componentSource.indexOf("{netKpis.map");
  const gross = componentSource.indexOf("Gross Cash Movement and Control");
  assert.ok(header > 0, "top header should include the daily cash-after-expenses summary card");
  assert.ok(filters > header, "filters should sit inside the top header after the net summary");
  assert.ok(officeCards > filters, "office period cash cards should follow the header filters first");
  assert.ok(firstKpi > officeCards, "net KPI row should follow the first office period cards");
  assert.ok(gross > firstKpi, "gross movement section should move below the net KPI row");
});

test("cash position selected-period card excludes carried-forward office cash", () => {
  assert.match(typesSource, /dailyCollected/);
  assert.match(typesSource, /dailyApprovedExpenses/);
  assert.match(typesSource, /dailyBanked/);
  assert.match(typesSource, /dailyHandedToAdmin/);
  assert.match(typesSource, /dailyCashRemainingAtOffice/);
  assert.match(dataSource, /rawDailyCashRemainingAtOffice = dailyCollected - dailyApprovedExpenses - dailyBanked - dailyHandedToAdmin/);
  assert.match(dataSource, /dailyCashRemainingAtOffice = Math\.max\(0, dailyCollected - dailyApprovedExpenses\)/);
  assert.match(dataSource, /cashAfterExpenses = dailyCashRemainingAtOffice/);
  assert.match(dataSource, /currentAccumulatedOfficeCash/);
  assert.match(dataSource, /adminHandedToAdminOutflows/);
  assert.match(dataSource, /\["admin_float", "office_to_admin_transfer"\]/);
  assert.match(componentSource, /Company Cash Position Today/);
  assert.match(componentSource, /Company Cash Position for Selected Period/);
  assert.match(componentSource, /Current Physical Office Cash/);
  assert.match(componentSource, /Company Cash Position/);
  assert.match(componentSource, /Cash Reconciliation Difference/);
});

test("selected period office cash ignores expenses outside the selected range", () => {
  const selectedDayCash = selectedPeriodCompanyCashPosition({
    collections: [{ amount: 2_000_000, date: "2026-07-28" }],
    approvedExpenses: [
      { amount: 500_000, date: "2026-07-28" },
      { amount: 300_000, date: "2026-07-27" },
    ],
    periodStart: "2026-07-28",
    periodEnd: "2026-07-28",
  });

  assert.equal(selectedDayCash, 1_500_000);

  const bankedIsInformational = selectedPeriodCompanyCashPosition({
    collections: [{ amount: 6_685_000, date: "2026-07-29" }],
    approvedExpenses: [{ amount: 3_414_000, date: "2026-07-29" }],
    periodStart: "2026-07-29",
    periodEnd: "2026-07-29",
  });
  assert.equal(bankedIsInformational, 3_271_000);
});

test("cash position displays zero when the raw selected-period cash is fully cleared or overdrawn", () => {
  const fullyBanked = displayedSelectedPeriodOfficeCash({
    collections: [{ amount: 2_000_000, date: "2026-07-28" }],
    approvedExpenses: [{ amount: 500_000, date: "2026-07-28" }],
    banked: [{ amount: 1_500_000, date: "2026-07-28" }],
    handedToAdmin: [{ amount: 0, date: "2026-07-28" }],
    periodStart: "2026-07-28",
    periodEnd: "2026-07-28",
  });
  assert.equal(fullyBanked.raw, 0);
  assert.equal(fullyBanked.displayed, 0);
  assert.equal(fullyBanked.reconciliationDifference, 0);

  const overdrawn = displayedSelectedPeriodOfficeCash({
    collections: [{ amount: 2_000_000, date: "2026-07-28" }],
    approvedExpenses: [{ amount: 500_000, date: "2026-07-28" }],
    banked: [{ amount: 1_600_000, date: "2026-07-28" }],
    handedToAdmin: [{ amount: 0, date: "2026-07-28" }],
    periodStart: "2026-07-28",
    periodEnd: "2026-07-28",
  });
  assert.equal(overdrawn.raw, -100_000);
  assert.equal(overdrawn.displayed, 0);
  assert.equal(overdrawn.reconciliationDifference, 100_000);

  assert.match(dataSource, /Math\.max\(0, rawCashAtOffice\)/);
  assert.match(dataSource, /companyCashPosition = Math\.max\(0, collectedPeriod - approvedExpensesPeriod\)/);
  assert.match(dataSource, /cashReconciliationDifference = rawCashAtOffice < 0 \? Math\.abs\(rawCashAtOffice\) : 0/);
  assert.match(dataSource, /detectCashReconciliationCause/);
});

test("cash position filters can be cleared independently without restoring today", () => {
  assert.match(dataSource, /const period = input\.period \|\| null/);
  assert.match(componentSource, /\["", "All Dates"\]/);
  assert.match(componentSource, /function clearFilter/);
  assert.match(componentSource, /Clear All Filters/);
  assert.match(componentSource, /Showing all authorised cash-position records/);
  assert.match(componentSource, /Showing results for:/);
  assert.match(componentSource, /onClear=\{\(\) => clearFilter\("period"\)\}/);
  assert.match(componentSource, /onClear=\{\(\) => clearFilter\("startDate"\)\}/);
  assert.match(componentSource, /onClear=\{\(\) => clearFilter\("endDate"\)\}/);
  assert.match(componentSource, /onClear=\{\(\) => clearFilter\("officeId"\)\}/);
  assert.match(componentSource, /onClear=\{\(\) => clearFilter\("collectorId"\)\}/);
  assert.match(componentSource, /onClear=\{\(\) => clearFilter\("paymentMethod"\)\}/);
  assert.match(componentSource, /onClear=\{\(\) => clearFilter\("bankingStatus"\)\}/);
  assert.match(componentSource, /onClear=\{\(\) => clearFilter\("expenseStatus"\)\}/);
  assert.match(componentSource, /if \(nextFilters\.period\) params\.set\("period"/);
  assert.doesNotMatch(componentSource, /period: data\.filters\.period \?\? "today"/);
});

test("cash banking display also clamps negative office cash and reports reconciliation difference", () => {
  assert.match(cashBankingTypesSource, /rawMoneyAtOffice/);
  assert.match(cashBankingTypesSource, /cashReconciliationDifference/);
  assert.match(cashBankingTypesSource, /cashReconciliationCause/);
  assert.match(cashBankingDataSource, /moneyAtOffice: Math\.max\(0, rawMoneyAtOffice\)/);
  assert.match(cashBankingDataSource, /cashReconciliationDifference = rawMoneyAtOffice < 0 \? Math\.abs\(rawMoneyAtOffice\) : 0/);
  assert.match(cashBankingActionSource, /displayedOfficeBalanceAfter = Math\.max\(0, officeBalanceAfter\)/);
  assert.match(cashBankingComponentSource, /Cash Reconciliation Difference/);
  assert.match(cashBankingComponentSource, /Raw Money At Office/);
});

test("cash position data loader names query failures and uses production-safe enrichment columns", () => {
  assert.match(dataSource, /logCashPositionQueryError/);
  assert.match(dataSource, /assertRequiredQuery\("collectionRowsResult"/);
  assert.match(dataSource, /assertRequiredQuery\("bankingAndHandoverRowsResult"/);
  assert.match(dataSource, /optionalRows\("receiptRowsResult"/);
  assert.match(dataSource, /optionalRows\("roomRowsResult"/);
  assert.match(dataSource, /optionalRows\("tenantRowsResult"/);
  assert.match(dataSource, /dateFrom/);
  assert.match(dataSource, /dateTo/);
  assert.match(dataSource, /select\("id, room_number, office_id"\)/);
  assert.match(dataSource, /select\("id, full_name, phone, office_id"\)/);
  assert.doesNotMatch(dataSource, /room_label/);
  assert.doesNotMatch(dataSource, /unit_number/);
  assert.doesNotMatch(dataSource, /first_name/);
  assert.doesNotMatch(dataSource, /last_name/);
  assert.match(dataSource, /enrichmentCollections/);
});

test("cash position route has a safe retryable error boundary", () => {
  assert.match(errorBoundarySource, /Cash Position data could not be loaded/);
  assert.match(errorBoundarySource, /Error reference ID/);
  assert.match(errorBoundarySource, /Retry/);
  assert.match(errorBoundarySource, /Return to Dashboard/);
  assert.doesNotMatch(errorBoundarySource, /error\.message/);
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
