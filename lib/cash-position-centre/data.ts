import "server-only";

import { requireCompanyAdminMode } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
    CashPositionChartPoint,
    CashPositionCollectorRow,
    CashPositionData,
    CashPositionFilters,
    CashPositionInsight,
    CashPositionKpi,
    CashPositionOfficeRow,
    CashPositionReceiptBreakdownItem,
} from "./types";

type Row = Record<string, any>;

const INACTIVE_PAYMENT_STATUSES = new Set(["voided", "removed", "removed_by_admin_approval", "rejected", "pending", "cancelled", "canceled"]);
const ACTIVE_RECEIPT_STATUSES = new Set(["issued", "reissued", "corrected"]);
const APPROVED_EXPENSE_STATUSES = new Set(["approved"]);
const PENDING_EXPENSE_STATUSES = new Set(["pending", "pending_admin_approval", "submitted"]);

function numberValue(value: unknown) {
    const numeric = Number(value ?? 0);
    return Number.isFinite(numeric) ? numeric : 0;
}

function kampalaDate(value = new Date()) {
    return new Intl.DateTimeFormat("en-CA", {
        day: "2-digit",
        month: "2-digit",
        timeZone: "Africa/Kampala",
        year: "numeric",
    }).format(value);
}

function addDays(date: string, days: number) {
    const next = new Date(`${date}T00:00:00+03:00`);
    next.setDate(next.getDate() + days);
    return kampalaDate(next);
}

function monthStart(date: string) {
    return `${date.slice(0, 8)}01`;
}

function yearStart(date: string) {
    return `${date.slice(0, 4)}-01-01`;
}

function periodLabel(startDate: string, endDate: string) {
    return startDate === endDate ? startDate : `${startDate} to ${endDate}`;
}

function previousMonthStart(date: string) {
    const base = new Date(`${monthStart(date)}T00:00:00+03:00`);
    base.setMonth(base.getMonth() - 1);
    return kampalaDate(base).slice(0, 8) + "01";
}

function previousMonthEnd(date: string) {
    return addDays(monthStart(date), -1);
}

function resolveFilters(input: CashPositionFilters = {}) {
    const today = kampalaDate();
    const period = input.period || "today";
    let startDate = input.startDate || today;
    let endDate = input.endDate || today;

    if (period === "yesterday") {
        startDate = addDays(today, -1);
        endDate = startDate;
    } else if (period === "last7") {
        startDate = addDays(today, -6);
        endDate = today;
    } else if (period === "month") {
        startDate = monthStart(today);
        endDate = today;
    } else if (period === "previousMonth") {
        startDate = previousMonthStart(today);
        endDate = previousMonthEnd(today);
    } else if (period === "year" || period === "financialYear") {
        startDate = yearStart(today);
        endDate = today;
    } else if (period === "customDate" || period === "specificDay") {
        endDate = startDate;
    } else if (period !== "custom") {
        startDate = today;
        endDate = today;
    }

    if (startDate > endDate) [startDate, endDate] = [endDate, startDate];
    return {
        bankingStatus: input.bankingStatus || null,
        collectorId: input.collectorId || null,
        endDate,
        expenseStatus: input.expenseStatus || null,
        officeId: input.officeId || null,
        paymentMethod: input.paymentMethod || null,
        period,
        startDate,
    };
}

function dateOnly(value: string | null | undefined) {
    return String(value ?? "").slice(0, 10);
}

function inRange(value: string | null | undefined, startDate: string, endDate: string) {
    const date = dateOnly(value);
    return Boolean(date && date >= startDate && date <= endDate);
}

function isActiveCollection(row: Row) {
    return !INACTIVE_PAYMENT_STATUSES.has(String(row.status ?? "posted").toLowerCase());
}

function isActiveReceipt(row: Row) {
    return ACTIVE_RECEIPT_STATUSES.has(String(row.status ?? "issued").toLowerCase());
}

function expenseStatus(row: Row) {
    return String(row.status ?? (row.approved_at ? "approved" : "pending")).toLowerCase();
}

function isApprovedExpense(row: Row) {
    return APPROVED_EXPENSE_STATUSES.has(expenseStatus(row));
}

function isPendingExpense(row: Row) {
    return PENDING_EXPENSE_STATUSES.has(expenseStatus(row));
}

function expenseAmount(row: Row) {
    return numberValue(row.amount);
}

function expenseDate(row: Row) {
    return dateOnly(row.expense_date ?? row.created_at);
}

function collectionAmount(row: Row) {
    return numberValue(row.amount_paid ?? row.amount);
}

function collectionDate(row: Row) {
    return dateOnly(row.payment_date ?? row.paid_at ?? row.created_at);
}

function distinctById(rows: Row[]) {
    const byId = new Map<string, Row>();
    for (const row of rows) {
        const id = String(row.id ?? "");
        if (!id || byId.has(id)) continue;
        byId.set(id, row);
    }
    return [...byId.values()];
}

function movementDate(row: Row) {
    return dateOnly(row.transaction_date ?? row.created_at);
}

function officeName(row: Row) {
    return String(row.office_name ?? row.name ?? "Office");
}

function signedLedgerAmount(row: Row) {
    const transactionType = String(row.transaction_type ?? "").toLowerCase();
    const direction = String(row.direction ?? "").toLowerCase();
    return direction === "outflow" || transactionType === "outflow" || transactionType === "transfer_out"
        ? -numberValue(row.amount)
        : numberValue(row.amount);
}

function sum<T>(rows: T[], value: (row: T) => number) {
    return rows.reduce((total, row) => total + value(row), 0);
}

function average(values: number[]) {
    const usable = values.filter((value) => Number.isFinite(value));
    return usable.length ? sum(usable, (value) => value) / usable.length : 0;
}

function statusForOffice(input: { moneyAtOffice: number; outstandingToBank: number; unreconciled: number }) {
    if (input.unreconciled > 0 || input.outstandingToBank >= 5_000_000) {
        return { status: "critical" as const, statusReason: input.unreconciled > 0 ? "Cash reconciliation difference requires review" : "Cash exposure is high" };
    }
    if (input.outstandingToBank >= 1_000_000) {
        return { status: "attention" as const, statusReason: "Banking follow-up recommended" };
    }
    return { status: "healthy" as const, statusReason: "Cash position is within control threshold" };
}

function detectCashReconciliationCause(input: {
    approvedExpenses: number;
    banked: number;
    collections: number;
    handedToAdmin: number;
    rawCashAtOffice: number;
}) {
    if (input.rawCashAtOffice >= 0) return "Balanced";
    const cashAfterExpenses = input.collections - input.approvedExpenses;
    const cashAfterBanking = cashAfterExpenses - input.banked;
    if (input.banked > Math.max(0, cashAfterExpenses - input.handedToAdmin)) {
        return "Banking exceeds selected-period available cash; review excessive banking, duplicate banking or date mismatch.";
    }
    if (input.handedToAdmin > Math.max(0, cashAfterExpenses - input.banked)) {
        return "Admin handover exceeds selected-period available cash; review duplicate handover or date mismatch.";
    }
    if (input.approvedExpenses > input.collections) {
        return "Approved expenses exceed selected-period collections; review expense date, status or duplicate deduction.";
    }
    if (cashAfterBanking < 0) {
        return "Banking and expense deductions exceed selected-period collections; review transaction dates.";
    }
    return "Selected-period deductions exceed collections; review excessive banking, duplicate handover, expense deduction or date mismatch.";
}

function chartTop(rows: CashPositionChartPoint[], limit = 8) {
    return [...rows].sort((a, b) => b.value - a.value).slice(0, limit);
}

function logCashPositionQueryError(input: {
    details?: string | null;
    endDate: string;
    hint?: string | null;
    message?: string | null;
    name: string;
    period: string | null;
    startDate: string;
    code?: string | null;
}) {
    console.error("Cash Position Centre query failed", {
        code: input.code ?? null,
        dateFrom: `${input.startDate}T00:00:00+03:00`,
        dateTo: `${input.endDate}T23:59:59.999+03:00`,
        details: input.details ?? null,
        hint: input.hint ?? null,
        message: input.message ?? null,
        period: input.period,
        query: input.name,
    });
}

function assertRequiredQuery(name: string, result: { error?: any }, filters: ReturnType<typeof resolveFilters>) {
    if (!result.error) return;
    logCashPositionQueryError({
        code: result.error.code,
        details: result.error.details,
        endDate: filters.endDate,
        hint: result.error.hint,
        message: result.error.message,
        name,
        period: filters.period,
        startDate: filters.startDate,
    });
    throw new Error(`Cash Position required query failed: ${name}`);
}

function optionalRows(name: string, result: { data?: unknown[] | null; error?: any }, filters: ReturnType<typeof resolveFilters>): Row[] {
    if (!result.error) return (result.data ?? []) as Row[];
    logCashPositionQueryError({
        code: result.error.code,
        details: result.error.details,
        endDate: filters.endDate,
        hint: result.error.hint,
        message: result.error.message,
        name,
        period: filters.period,
        startDate: filters.startDate,
    });
    return [];
}

function buildInsights(input: {
    collectors: CashPositionCollectorRow[];
    offices: CashPositionOfficeRow[];
    securityShortfall: number;
    totals: CashPositionData["totals"];
}): CashPositionInsight[] {
    const insights: CashPositionInsight[] = [];
    const highestNetOffice = [...input.offices].sort((a, b) => b.cashAfterApprovedExpenses - a.cashAfterApprovedExpenses)[0];
    if (highestNetOffice) {
        insights.push({
            action: "Use net cash as the first treasury control figure.",
            amount: highestNetOffice.cashAfterApprovedExpenses,
            id: `net-office-${highestNetOffice.officeId}`,
            message: `${highestNetOffice.officeName} has UGX ${Math.round(highestNetOffice.cashAfterApprovedExpenses).toLocaleString()} available after approved expenses.`,
            severity: highestNetOffice.cashReconciliationDifference > 0 ? "critical" : highestNetOffice.cashAfterApprovedExpenses < 1_000_000 ? "warning" : "success",
            title: "Net cash after approved expenses",
        });
    }
    const reconciliationOffice = input.offices.find((office) => office.cashReconciliationDifference > 0);
    if (reconciliationOffice) {
        insights.push({
            action: "Open the office cash records and compare banking, handovers, expenses and transaction dates.",
            amount: reconciliationOffice.cashReconciliationDifference,
            id: `cash-reconciliation-${reconciliationOffice.officeId}`,
            message: `${reconciliationOffice.officeName} displays UGX 0 at office, but raw selected-period cash is short by UGX ${Math.round(reconciliationOffice.cashReconciliationDifference).toLocaleString()}. ${reconciliationOffice.cashReconciliationCause}`,
            severity: "critical",
            title: "Cash reconciliation difference",
        });
    }
    const highestExpenseOffice = [...input.offices].sort((a, b) => b.approvedExpensesPeriod - a.approvedExpensesPeriod)[0];
    if (highestExpenseOffice?.approvedExpensesPeriod > 0) {
        const percentage = highestExpenseOffice.cashBeforeExpenses > 0 ? Math.round((highestExpenseOffice.approvedExpensesPeriod / highestExpenseOffice.cashBeforeExpenses) * 100) : 0;
        insights.push({
            action: "Review approved expense pressure against collections.",
            amount: highestExpenseOffice.approvedExpensesPeriod,
            id: `approved-expense-${highestExpenseOffice.officeId}`,
            message: `${highestExpenseOffice.officeName} approved expenses consumed ${percentage}% of available office cash in this period.`,
            severity: percentage >= 35 ? "warning" : "info",
            title: "Approved expense pressure",
        });
    }
    if (input.totals.pendingExpensesPeriod > 0) {
        insights.push({
            action: "Approve only where projected cash remains healthy.",
            amount: input.totals.pendingExpensesPeriod,
            id: "pending-expense-projection",
            message: `Pending expenses would reduce company office cash by UGX ${Math.round(input.totals.pendingExpensesPeriod).toLocaleString()} if approved.`,
            severity: input.totals.projectedCashAfterPendingApprovals < 0 ? "critical" : "warning",
            title: "Pending expense projection",
        });
    }
    const projectedNegativeOffice = input.offices.find((office) => office.projectedCashAfterPendingExpenses < 0);
    if (projectedNegativeOffice) {
        insights.push({
            action: "Hold or sequence pending approvals for this office.",
            amount: projectedNegativeOffice.projectedCashAfterPendingExpenses,
            id: `projected-negative-${projectedNegativeOffice.officeId}`,
            message: `${projectedNegativeOffice.officeName} may enter a negative cash position after pending expenses.`,
            severity: "critical",
            title: "Projected negative office cash",
        });
    }
    const highestOffice = [...input.offices].sort((a, b) => b.cashHeldInOffice - a.cashHeldInOffice)[0];
    if (highestOffice?.outstandingToBank > 0) {
        insights.push({
            action: highestOffice.outstandingToBank >= 1_000_000 ? "Bank immediately to reduce exposure." : "Monitor before close of day.",
            amount: highestOffice.outstandingToBank,
            id: `bank-${highestOffice.officeId}`,
            message: `${highestOffice.officeName} has UGX ${Math.round(highestOffice.outstandingToBank).toLocaleString()} waiting to be banked.`,
            severity: highestOffice.outstandingToBank >= 5_000_000 ? "critical" : "warning",
            title: "Office cash waiting for banking",
        });
    }
    const topCollector = [...input.collectors].sort((a, b) => b.todayCollections - a.todayCollections)[0];
    if (topCollector?.todayCollections > 0) {
        insights.push({
            action: "Keep the collector route active and reconcile cash at day end.",
            amount: topCollector.todayCollections,
            id: `collector-${topCollector.collectorId}`,
            message: `${topCollector.collectorName} is the strongest collector today with UGX ${Math.round(topCollector.todayCollections).toLocaleString()}.`,
            severity: "success",
            title: "Top collector performance",
        });
    }
    const riskyCollector = [...input.collectors].sort((a, b) => b.cashInHand - a.cashInHand)[0];
    if (riskyCollector?.cashInHand >= 500_000) {
        insights.push({
            action: "Request submission or confirm why cash remains in hand.",
            amount: riskyCollector.cashInHand,
            id: `collector-risk-${riskyCollector.collectorId}`,
            message: `${riskyCollector.collectorName} is holding UGX ${Math.round(riskyCollector.cashInHand).toLocaleString()}.`,
            severity: riskyCollector.cashInHand >= 2_000_000 ? "critical" : "warning",
            title: "Collector cash holding risk",
        });
    }
    if (input.securityShortfall > 0) {
        insights.push({
            action: "Review Security Deposits and record replacement of used security funds.",
            amount: input.securityShortfall,
            id: "security-shortfall",
            message: `Security liabilities exceed available security cash by UGX ${Math.round(input.securityShortfall).toLocaleString()}.`,
            severity: "critical",
            title: "Security deposit exposure",
        });
    }
    insights.push({
        action: "Use this centre as the daily CFO cash control desk.",
        amount: input.totals.cashAfterExpenses,
        id: "cash-after-expense-forecast",
        message: `Selected-period office cash movement is UGX ${Math.round(input.totals.cashAfterExpenses).toLocaleString()} after approved expenses, banking and Admin handovers; reconciliation difference is UGX ${Math.round(input.totals.cashReconciliationDifference).toLocaleString()}.`,
        severity: input.totals.cashReconciliationDifference > 0 ? "warning" : "info",
        title: "Cash flow position",
    });
    return insights.slice(0, 8);
}

export async function getCashPositionCentreData(filtersInput: CashPositionFilters = {}): Promise<CashPositionData> {
    const context = await requireCompanyAdminMode();
    const companyId = context.activeCompany?.id;
    if (!companyId) throw new Error("Active company is required.");
    const filters = resolveFilters(filtersInput);
    const db = createSupabaseAdminClient() as unknown as { from: (table: string) => any };

    const [
        officesResult,
        collectionsResult,
        expensesResult,
        cashAccountsResult,
        cashTransactionsResult,
        collectorProfilesResult,
        usersResult,
        securityResult,
    ] = await Promise.all([
        db.from("offices").select("id, office_name, name, status").eq("company_id", companyId).order("office_name", { ascending: true, nullsFirst: false }).limit(1000),
        db.from("collections").select("id, company_id, office_id, amount, amount_paid, payment_date, paid_at, created_at, payment_method, reference_number, recorded_by, status, room_id, tenant_id").eq("company_id", companyId).limit(10000),
        db.from("expenses").select("id, company_id, office_id, amount, expense_date, created_at, item, category, submitted_by, approved_at, approved_by, status").eq("company_id", companyId).limit(10000),
        db.from("cash_accounts").select("id, company_id, office_id, account_type, name, status").eq("company_id", companyId).eq("status", "active").limit(2000),
        db.from("cash_transactions").select("id, company_id, office_id, cash_account_id, amount, transaction_type, source_type, source_id, transaction_date, created_at, description, recorded_by").eq("company_id", companyId).limit(10000),
        db.from("field_collector_profiles").select("*").eq("company_id", companyId).limit(1000),
        db.from("users").select("id, full_name, email, phone, account_type, status").eq("company_id", companyId).limit(2000),
        db.from("security_deposit_register").select("id, office_id, liability_balance, cash_available, amount_used_by_company, amount_restored_by_company, company_shortfall, status").eq("company_id", companyId).limit(10000),
    ]);

    assertRequiredQuery("officeRowsResult", officesResult, filters);
    assertRequiredQuery("collectionRowsResult", collectionsResult, filters);
    assertRequiredQuery("expenseRowsResult", expensesResult, filters);
    assertRequiredQuery("cashAccountRowsResult", cashAccountsResult, filters);
    assertRequiredQuery("bankingAndHandoverRowsResult", cashTransactionsResult, filters);
    assertRequiredQuery("collectorRowsResult", collectorProfilesResult, filters);
    assertRequiredQuery("userRowsResult", usersResult, filters);
    assertRequiredQuery("securityRowsResult", securityResult, filters);

    const offices = ((officesResult.data ?? []) as Row[])
        .filter((office) => !filters.officeId || office.id === filters.officeId)
        .map((office) => ({ id: String(office.id), name: officeName(office) }));
    const officeById = new Map(offices.map((office) => [office.id, office.name]));
    const visibleOfficeIds = new Set(offices.map((office) => office.id));
    const users = (usersResult.data ?? []) as Row[];
    const userById = new Map(users.map((user) => [String(user.id), user]));

    const allCollections = ((collectionsResult.data ?? []) as Row[])
        .filter((row) => row.office_id && visibleOfficeIds.has(String(row.office_id)))
        .filter(isActiveCollection)
        .filter((row) => !filters.collectorId || String(row.recorded_by ?? "") === filters.collectorId)
        .filter((row) => !filters.paymentMethod || String(row.payment_method ?? "").toLowerCase() === filters.paymentMethod.toLowerCase());
    const periodCollections = allCollections.filter((row) => inRange(collectionDate(row), filters.startDate, filters.endDate));
    const today = kampalaDate();
    const todayCollections = allCollections.filter((row) => collectionDate(row) === today);
    const weekCollections = allCollections.filter((row) => inRange(collectionDate(row), addDays(today, -6), today));
    const monthCollections = allCollections.filter((row) => inRange(collectionDate(row), monthStart(today), today));
    const previousComparableCollections = allCollections.filter((row) => inRange(collectionDate(row), addDays(filters.startDate, -7), addDays(filters.endDate, -7)));
    const expenses = ((expensesResult.data ?? []) as Row[])
        .filter((row) => row.office_id && visibleOfficeIds.has(String(row.office_id)))
        .filter((row) => !filters.expenseStatus || expenseStatus(row) === filters.expenseStatus);
    const approvedExpenses = expenses.filter(isApprovedExpense);
    const pendingExpenses = expenses.filter(isPendingExpense);
    const periodApprovedExpenses = approvedExpenses.filter((row) => inRange(expenseDate(row), filters.startDate, filters.endDate));
    const periodPendingExpenses = pendingExpenses.filter((row) => inRange(expenseDate(row), filters.startDate, filters.endDate));
    const todayApprovedExpenses = approvedExpenses.filter((row) => expenseDate(row) === today);
    const monthApprovedExpenses = approvedExpenses.filter((row) => inRange(expenseDate(row), monthStart(today), today));

    const cashAccounts = ((cashAccountsResult.data ?? []) as Row[]).filter((row) => !row.office_id || visibleOfficeIds.has(String(row.office_id)));
    const accountById = new Map(cashAccounts.map((row) => [String(row.id), row]));
    const cashTransactions = ((cashTransactionsResult.data ?? []) as Row[])
        .filter((row) => !row.office_id || visibleOfficeIds.has(String(row.office_id)))
        .filter((row) => accountById.has(String(row.cash_account_id)));
    const bankOutflows = cashTransactions.filter((row) => accountById.get(String(row.cash_account_id))?.account_type === "office_cash" && row.source_type === "bank_deposit" && row.transaction_type === "outflow");
    const adminHandedToAdminOutflows = cashTransactions.filter((row) => accountById.get(String(row.cash_account_id))?.account_type === "office_cash" && ["admin_float", "office_to_admin_transfer"].includes(String(row.source_type ?? "")) && row.transaction_type === "outflow");
    const adminCashReceived = cashTransactions.filter((row) => accountById.get(String(row.cash_account_id))?.account_type === "hq_cash" && row.source_type === "admin_cash_received" && row.transaction_type === "inflow");
    const bankBalances = cashTransactions.filter((row) => accountById.get(String(row.cash_account_id))?.account_type === "bank");
    const hqCashBalances = cashTransactions.filter((row) => accountById.get(String(row.cash_account_id))?.account_type === "hq_cash");

    const securityRows = ((securityResult.data ?? []) as Row[]).filter((row) => !row.office_id || visibleOfficeIds.has(String(row.office_id)));
    const securityHeldByOffice = new Map<string, number>();
    for (const row of securityRows) {
        const officeId = String(row.office_id ?? "");
        if (!officeId) continue;
        securityHeldByOffice.set(officeId, (securityHeldByOffice.get(officeId) ?? 0) + numberValue(row.liability_balance));
    }
    const securityDepositsHeld = sum(securityRows, (row) => numberValue(row.liability_balance));
    const securityShortfall = sum(securityRows, (row) => numberValue(row.company_shortfall));

    const collectorProfiles = (collectorProfilesResult.data ?? []) as Row[];
    const collectorIds = new Set([
        ...collectorProfiles.map((row) => String(row.user_id ?? "")).filter(Boolean),
        ...users.filter((user) => ["field_collector", "collector"].includes(String(user.account_type ?? "").toLowerCase())).map((user) => String(user.id)),
    ]);
    const collectionsByCollector = new Map<string, Row[]>();
    for (const row of allCollections) {
        const id = String(row.recorded_by ?? "");
        if (!id) continue;
        if (!collectionsByCollector.has(id)) collectionsByCollector.set(id, []);
        collectionsByCollector.get(id)!.push(row);
    }

    const collectors: CashPositionCollectorRow[] = [...collectorIds].map((collectorId) => {
        const profile = collectorProfiles.find((row) => String(row.user_id) === collectorId || String(row.id) === collectorId) ?? {};
        const user = userById.get(collectorId) ?? {};
        const rows = collectionsByCollector.get(collectorId) ?? [];
        const todayRows = rows.filter((row) => collectionDate(row) === today);
        const weekRows = rows.filter((row) => inRange(collectionDate(row), addDays(today, -6), today));
        const monthRows = rows.filter((row) => inRange(collectionDate(row), monthStart(today), today));
        const officeTotals = new Map<string, number>();
        for (const row of rows) {
            const officeId = String(row.office_id ?? "");
            officeTotals.set(officeId, (officeTotals.get(officeId) ?? 0) + collectionAmount(row));
        }
        const topOfficeId = [...officeTotals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
        const amounts = rows.map(collectionAmount);
        const cashInHand = numberValue(profile.cash_balance);
        const riskScore = Math.min(100, Math.round((cashInHand / 2_000_000) * 65 + (rows.length ? 10 : 25)));
        return {
            averageReceipt: average(amounts),
            banked: sum(rows.filter((row) => String(row.payment_method ?? "").toLowerCase().includes("bank")), collectionAmount),
            cashInHand,
            cashSubmitted: Math.max(0, sum(rows, collectionAmount) - cashInHand),
            collectionSpeed: todayRows.length >= 10 ? "Fast" : todayRows.length >= 3 ? "Steady" : "Low today",
            collectorId,
            collectorName: String(user.full_name ?? user.email ?? "Collector"),
            currentStatus: String(profile.status ?? user.status ?? "active").toLowerCase() === "active" ? "active" : "inactive",
            customerRating: "Not scored",
            largestReceipt: amounts.length ? Math.max(...amounts) : 0,
            lastActivity: rows.sort((a, b) => String(b.created_at ?? b.paid_at).localeCompare(String(a.created_at ?? a.paid_at)))[0]?.created_at ?? null,
            officeId: topOfficeId,
            officeName: topOfficeId ? officeById.get(topOfficeId) ?? "Office" : "Company wide",
            outstanding: cashInHand,
            photoUrl: null,
            reliability: Math.max(0, Math.min(100, 100 - riskScore + (cashInHand === 0 ? 10 : 0))),
            riskScore,
            thisMonth: sum(monthRows, collectionAmount),
            thisWeek: sum(weekRows, collectionAmount),
            todayCollections: sum(todayRows, collectionAmount),
        };
    });
    const collectorCashByOffice = new Map<string, number>();
    for (const collector of collectors) {
        if (!collector.officeId) continue;
        collectorCashByOffice.set(collector.officeId, (collectorCashByOffice.get(collector.officeId) ?? 0) + collector.cashInHand);
    }

    const enrichmentStartDate = filters.startDate < addDays(today, -6) ? filters.startDate : addDays(today, -6);
    const enrichmentEndDate = filters.endDate > today ? filters.endDate : today;
    const enrichmentCollections = allCollections.filter((row) => inRange(collectionDate(row), enrichmentStartDate, enrichmentEndDate));
    const paymentIds = [...new Set(enrichmentCollections.map((row) => String(row.id ?? "")).filter(Boolean))];
    const roomIds = [...new Set(enrichmentCollections.map((row) => String(row.room_id ?? "")).filter(Boolean))];
    const tenantIds = [...new Set(enrichmentCollections.map((row) => String(row.tenant_id ?? "")).filter(Boolean))];
    const [receiptRowsResult, roomRowsResult, tenantRowsResult] = paymentIds.length
        ? await Promise.all([
            db.from("payment_receipts").select("id, company_id, office_id, payment_id, payment_type, receipt_number, status, issued_at, created_at").eq("company_id", companyId).eq("payment_type", "tenant_collection").in("payment_id", paymentIds).limit(10000),
            roomIds.length ? db.from("rooms").select("id, room_number, office_id").eq("company_id", companyId).in("id", roomIds).limit(10000) : Promise.resolve({ data: [], error: null }),
            tenantIds.length ? db.from("tenants").select("id, full_name, phone, office_id").eq("company_id", companyId).in("id", tenantIds).limit(10000) : Promise.resolve({ data: [], error: null }),
        ])
        : [
            { data: [], error: null },
            { data: [], error: null },
            { data: [], error: null },
        ];
    const receiptRows = optionalRows("receiptRowsResult", receiptRowsResult, filters);
    const receiptsByPayment = new Map<string, Row[]>();
    for (const receipt of receiptRows) {
        const paymentId = String(receipt.payment_id ?? "");
        if (!paymentId) continue;
        if (!receiptsByPayment.has(paymentId)) receiptsByPayment.set(paymentId, []);
        receiptsByPayment.get(paymentId)!.push(receipt);
    }
    const canonicalReceiptByPayment = new Map<string, Row>();
    const receiptWarningsByPayment = new Map<string, string>();
    for (const [paymentId, rows] of receiptsByPayment.entries()) {
        const activeRows = rows.filter(isActiveReceipt).sort((a, b) => String(b.issued_at ?? b.created_at).localeCompare(String(a.issued_at ?? a.created_at)));
        if (activeRows.length > 1) receiptWarningsByPayment.set(paymentId, "More than one active receipt exists for this payment.");
        if (activeRows[0]) canonicalReceiptByPayment.set(paymentId, activeRows[0]);
    }
    const roomById = new Map(optionalRows("roomRowsResult", roomRowsResult, filters).map((row) => [String(row.id), row]));
    const tenantById = new Map(optionalRows("tenantRowsResult", tenantRowsResult, filters).map((row) => [String(row.id), row]));

    const buildReceiptBreakdown = (rows: Row[]): CashPositionReceiptBreakdownItem[] => distinctById(rows).map((row) => {
        const paymentId = String(row.id);
        const receipt = canonicalReceiptByPayment.get(paymentId) ?? null;
        const tenant = tenantById.get(String(row.tenant_id ?? "")) ?? {};
        const room = roomById.get(String(row.room_id ?? "")) ?? {};
        const collector = userById.get(String(row.recorded_by ?? "")) ?? {};
        const officeId = row.office_id ? String(row.office_id) : null;
        const warning = receiptWarningsByPayment.get(paymentId) ?? (!receipt ? "No active payment receipt snapshot exists for this valid payment." : null);
        return {
            amount: collectionAmount(row),
            auditHref: `/office/audit?entityId=${encodeURIComponent(paymentId)}`,
            collectorId: row.recorded_by ? String(row.recorded_by) : null,
            collectorName: String(collector.full_name ?? collector.email ?? "Unassigned"),
            contributesToCashTotals: true,
            contributesToReceiptCount: true,
            createdAt: row.created_at ?? null,
            issuedAt: receipt?.issued_at ?? receipt?.created_at ?? null,
            officeId,
            officeName: officeId ? officeById.get(officeId) ?? "Office" : "Company wide",
            openPaymentHref: `/office/admin/payments?payment=${encodeURIComponent(paymentId)}`,
            paymentDate: collectionDate(row) || null,
            paymentId,
            paymentMethod: String(row.payment_method ?? "unknown"),
            receiptId: receipt?.id ? String(receipt.id) : null,
            receiptNumber: receipt?.receipt_number ? String(receipt.receipt_number) : null,
            roomNumber: String(room.room_number ?? "Unassigned"),
            status: String(row.status ?? "paid"),
            tenantName: String(tenant.full_name ?? "Unnamed Tenant"),
            viewReceiptHref: receipt?.id ? `/receipt-print/${encodeURIComponent(String(receipt.id))}` : null,
            warning,
        };
    }).sort((a, b) => b.amount - a.amount || a.tenantName.localeCompare(b.tenantName));

    const receiptIntegrityAlerts: CashPositionInsight[] = [];
    const periodReceiptBreakdown = buildReceiptBreakdown(periodCollections);
    for (const item of periodReceiptBreakdown) {
        if (!item.warning) continue;
        receiptIntegrityAlerts.push({
            action: "Open the receipt breakdown and repair the payment receipt snapshot.",
            amount: item.amount,
            id: `receipt-integrity-${item.paymentId}`,
            message: `${item.officeName} payment ${item.paymentId} contributes UGX ${Math.round(item.amount).toLocaleString()} to cash totals but needs receipt integrity review: ${item.warning}`,
            severity: "warning",
            title: "Receipt integrity warning",
        });
    }

    let officeRows: CashPositionOfficeRow[] = offices.map((office) => {
        const officeCollections = periodCollections.filter((row) => row.office_id === office.id);
        const officeReceiptBreakdown = buildReceiptBreakdown(officeCollections);
        const officeToday = todayCollections.filter((row) => row.office_id === office.id);
        const officeWeek = weekCollections.filter((row) => row.office_id === office.id);
        const officeMonth = monthCollections.filter((row) => row.office_id === office.id);
        const officePrevious = previousComparableCollections.filter((row) => row.office_id === office.id);
        const officeLedger = cashTransactions.filter((row) => row.office_id === office.id && accountById.get(String(row.cash_account_id))?.account_type === "office_cash");
        const officeBanked = bankOutflows.filter((row) => row.office_id === office.id && inRange(movementDate(row), filters.startDate, filters.endDate));
        const officeHandedToAdmin = adminHandedToAdminOutflows.filter((row) => row.office_id === office.id && inRange(movementDate(row), filters.startDate, filters.endDate));
        const approvedExpensesPeriod = sum(periodApprovedExpenses.filter((row) => row.office_id === office.id), expenseAmount);
        const pendingExpensesPeriod = sum(periodPendingExpenses.filter((row) => row.office_id === office.id), expenseAmount);
        const cashHeldInOffice = sum(officeLedger, signedLedgerAmount);
        const alreadyBanked = sum(officeBanked, (row) => numberValue(row.amount));
        const handedToAdminPeriod = sum(officeHandedToAdmin, (row) => numberValue(row.amount));
        const cashHeldByCollectors = collectorCashByOffice.get(office.id) ?? 0;
        const collectedPeriod = sum(officeCollections, collectionAmount);
        const rawCashAtOffice = collectedPeriod - approvedExpensesPeriod - alreadyBanked - handedToAdminPeriod;
        const dailyCashRemainingAtOffice = Math.max(0, rawCashAtOffice);
        const cashReconciliationDifference = rawCashAtOffice < 0 ? Math.abs(rawCashAtOffice) : 0;
        const cashReconciliationCause = detectCashReconciliationCause({
            approvedExpenses: approvedExpensesPeriod,
            banked: alreadyBanked,
            collections: collectedPeriod,
            handedToAdmin: handedToAdminPeriod,
            rawCashAtOffice,
        });
        const cashBeforeExpenses = collectedPeriod;
        const projectedCashAfterPendingExpenses = Math.max(0, dailyCashRemainingAtOffice - pendingExpensesPeriod);
        const outstandingToBank = Math.max(0, dailyCashRemainingAtOffice);
        const previousPeriod = sum(officePrevious, collectionAmount);
        const trend = collectedPeriod > previousPeriod ? "up" : collectedPeriod < previousPeriod ? "down" : "flat";
        const status = statusForOffice({ moneyAtOffice: dailyCashRemainingAtOffice, outstandingToBank, unreconciled: cashReconciliationDifference });
        const officeAmounts = officeCollections.map(collectionAmount);
        return {
            alreadyBanked,
            approvedExpensesPeriod,
            bankingPercentage: collectedPeriod > 0 ? Math.min(100, Math.round((alreadyBanked / collectedPeriod) * 100)) : alreadyBanked > 0 ? 100 : 0,
            cashAfterApprovedExpenses: dailyCashRemainingAtOffice,
            cashBeforeExpenses,
            cashReconciliationCause,
            cashReconciliationDifference,
            cashCollectedToday: sum(officeToday, collectionAmount),
            dailyApprovedExpenses: approvedExpensesPeriod,
            dailyBanked: alreadyBanked,
            dailyCashRemainingAtOffice,
            dailyCollected: collectedPeriod,
            dailyHandedToAdmin: handedToAdminPeriod,
            cashHeldByCollectors,
            cashHeldInOffice,
            collectorCount: collectors.filter((collector) => collector.officeId === office.id).length,
            expenseCount: periodApprovedExpenses.filter((row) => row.office_id === office.id).length,
            givenToAdmin: handedToAdminPeriod,
            largestPayment: officeAmounts.length ? Math.max(...officeAmounts) : 0,
            lastPaymentAt: officeCollections.sort((a, b) => String(b.created_at ?? b.paid_at).localeCompare(String(a.created_at ?? a.paid_at)))[0]?.created_at ?? null,
            monthlyPerformance: sum(officeMonth, collectionAmount),
            numberOfReceipts: officeReceiptBreakdown.filter((item) => item.contributesToReceiptCount).length,
            officeId: office.id,
            officeName: office.name,
            outstandingToAdmin: 0,
            outstandingToBank,
            pendingExpensesPeriod,
            projectedCashAfterPendingExpenses,
            rawCashAtOffice,
            securityDeposits: securityHeldByOffice.get(office.id) ?? 0,
            status: status.status,
            statusReason: status.statusReason,
            todayPerformance: sum(officeToday, collectionAmount),
            trend,
            weeklyPerformance: sum(officeWeek, collectionAmount),
            receiptBreakdown: officeReceiptBreakdown,
        };
    });

    if (filters.bankingStatus === "healthy" || filters.bankingStatus === "attention" || filters.bankingStatus === "critical") {
        officeRows = officeRows.filter((row) => row.status === filters.bankingStatus);
    } else if (filters.bankingStatus === "waiting") {
        officeRows = officeRows.filter((row) => row.outstandingToBank > 0);
    } else if (filters.bankingStatus === "banked") {
        officeRows = officeRows.filter((row) => row.alreadyBanked > 0);
    }

    const currentAccumulatedOfficeCash = sum(officeRows, (row) => row.cashHeldInOffice);
    const cashHeldByCollectors = sum(collectors, (row) => row.cashInHand);
    const totalBanked = sum(bankOutflows, (row) => numberValue(row.amount));
    const totalCashHandedToAdmin = sum(adminCashReceived, (row) => numberValue(row.amount));
    const dailyCollected = sum(officeRows, (row) => row.dailyCollected);
    const dailyApprovedExpenses = sum(officeRows, (row) => row.dailyApprovedExpenses);
    const dailyBanked = sum(officeRows, (row) => row.dailyBanked);
    const dailyHandedToAdmin = sum(officeRows, (row) => row.dailyHandedToAdmin);
    const rawDailyCashRemainingAtOffice = dailyCollected - dailyApprovedExpenses - dailyBanked - dailyHandedToAdmin;
    const dailyCashRemainingAtOffice = Math.max(0, rawDailyCashRemainingAtOffice);
    const cashReconciliationDifference = sum(officeRows, (row) => row.cashReconciliationDifference);
    const approvedExpensesToday = sum(todayApprovedExpenses, expenseAmount);
    const approvedExpensesThisMonth = sum(monthApprovedExpenses, expenseAmount);
    const pendingExpenseRequests = periodPendingExpenses.length;
    const cashBeforeExpenses = dailyCollected;
    const cashAfterExpenses = dailyCashRemainingAtOffice;
    const projectedCashAfterPendingApprovals = sum(officeRows, (row) => row.projectedCashAfterPendingExpenses);
    const cashWaitingToBeBanked = sum(officeRows, (row) => row.outstandingToBank);
    const unreconciledCash = cashReconciliationDifference;
    const moneyAtBank = sum(bankBalances, signedLedgerAmount);
    const adminCash = sum(hqCashBalances, signedLedgerAmount);
    const totals = {
        approvedExpensesThisMonth,
        approvedExpensesToday,
        approvedExpensesPeriod: sum(periodApprovedExpenses, expenseAmount),
        dailyApprovedExpenses,
        dailyBanked,
        dailyCashRemainingAtOffice,
        dailyCollected,
        dailyHandedToAdmin,
        rawDailyCashRemainingAtOffice,
        cashReconciliationDifference,
        cashDifferenceAlerts: officeRows.filter((row) => row.status !== "healthy" || row.cashReconciliationDifference > 0).length,
        cashAfterExpenses,
        cashBeforeExpenses,
        cashHeldByCollectors,
        cashHeldByOffices: currentAccumulatedOfficeCash,
        cashWaitingToBeBanked,
        companyCashAvailable: moneyAtBank + adminCash + currentAccumulatedOfficeCash + cashHeldByCollectors,
        currentAccumulatedOfficeCash,
        pendingExpensesPeriod: sum(periodPendingExpenses, expenseAmount),
        pendingExpenseRequests,
        projectedCashAfterPendingApprovals,
        securityDepositsHeld,
        totalBanked,
        totalCashCollectedToday: sum(todayCollections, collectionAmount),
        totalCashHandedToAdmin,
        unreconciledCash,
    };
    const kpis: CashPositionKpi[] = [
        { label: "Total Cash After Approved Expenses", previousValue: 0, value: totals.cashAfterExpenses, hint: "Selected-period collections minus approved expenses, banking and Admin handovers, displayed at zero when fully cleared", tone: totals.cashReconciliationDifference > 0 ? "red" : totals.cashAfterExpenses < 1_000_000 ? "amber" : "green" },
        { label: "Cash Before Expenses", previousValue: 0, value: totals.cashBeforeExpenses, hint: "Selected-period office collections before approved expenses", tone: "cyan" },
        { label: "Approved Expenses", previousValue: 0, value: totals.approvedExpensesPeriod, hint: "Approved expenses dated inside the selected period", tone: totals.approvedExpensesPeriod > totals.cashBeforeExpenses * 0.35 ? "amber" : "blue" },
        { label: "Pending Expenses", previousValue: 0, value: totals.pendingExpensesPeriod, hint: "Pending only; not deducted from live net cash", tone: totals.pendingExpensesPeriod ? "amber" : "green" },
        { label: "Projected Cash After Pending Approval", previousValue: 0, value: totals.projectedCashAfterPendingApprovals, hint: "Cash if pending expenses are approved", tone: totals.projectedCashAfterPendingApprovals < 0 ? "red" : "amber" },
        { label: "Offices With Negative or Low Cash", previousValue: 0, value: totals.cashDifferenceAlerts, hint: "Offices marked attention or critical", tone: totals.cashDifferenceAlerts ? "red" : "green" },
        { label: "Total Cash Collected", previousValue: sum(previousComparableCollections, collectionAmount), value: totals.totalCashCollectedToday, hint: "Posted collections dated today", tone: "green" },
        { label: "Cash Held by Offices", previousValue: 0, value: totals.cashHeldByOffices, hint: "Current accumulated office cash ledger across all dates", tone: totals.cashHeldByOffices < 0 ? "red" : "blue" },
        { label: "Cash Held by Collectors", previousValue: 0, value: totals.cashHeldByCollectors, hint: "Field collector profile balances", tone: "cyan" },
        { label: "Cash Banked", previousValue: sum(bankOutflows.filter((row) => inRange(movementDate(row), addDays(filters.startDate, -7), addDays(filters.endDate, -7))), (row) => numberValue(row.amount)), value: totals.totalBanked, hint: "Bank deposit outflows", tone: "violet" },
        { label: "Cash Handed to Admin", previousValue: 0, value: totals.totalCashHandedToAdmin, hint: "Admin cash received ledger", tone: "amber" },
        { label: "Outstanding to Bank", previousValue: 0, value: totals.cashWaitingToBeBanked, hint: "Positive office cash exposure", tone: totals.cashWaitingToBeBanked > 1_000_000 ? "amber" : "blue" },
        { label: "Cash Reconciliation Difference", previousValue: 0, value: totals.cashReconciliationDifference, hint: "Raw selected-period cash below zero; review banking, handovers, expense deductions or dates", tone: totals.cashReconciliationDifference > 0 ? "red" : "green" },
        { label: "Unreconciled Cash", previousValue: 0, value: totals.unreconciledCash, hint: "Selected-period raw cash below zero requiring review", tone: totals.unreconciledCash > 0 ? "red" : "green" },
        { label: "Security Deposit Cash", previousValue: 0, value: totals.securityDepositsHeld, hint: "Separate tenant liability", tone: "violet" },
        { label: "Security Shortfall", previousValue: 0, value: securityShortfall, hint: "Security liability not physically available", tone: securityShortfall > 0 ? "red" : "green" },
        { label: "Today’s Collection Performance", previousValue: sum(previousComparableCollections, collectionAmount), value: totals.totalCashCollectedToday, hint: "Today versus comparable recent cash", tone: totals.totalCashCollectedToday >= sum(previousComparableCollections, collectionAmount) ? "green" : "amber" },
        { label: "Approved Expenses Today", previousValue: 0, value: totals.approvedExpensesToday, hint: "Approved expense outflows dated today", tone: totals.approvedExpensesToday > totals.totalCashCollectedToday * 0.35 ? "amber" : "blue" },
        { label: "Approved Expenses This Month", previousValue: 0, value: totals.approvedExpensesThisMonth, hint: "Month-to-date approved expenses", tone: "violet" },
        { label: "Pending Expense Requests", previousValue: 0, value: totals.pendingExpenseRequests, hint: "Awaiting Admin decision; not deducted from cash", tone: totals.pendingExpenseRequests ? "amber" : "green" },
        { label: "Cash Before Expenses", previousValue: 0, value: totals.cashBeforeExpenses, hint: "Office cash plus approved expense outflows for the period", tone: "cyan" },
        { label: "Cash After Expenses", previousValue: 0, value: totals.cashAfterExpenses, hint: "Selected-period cash after approved expenses, banking and Admin handovers, displayed at zero when fully cleared", tone: totals.cashReconciliationDifference > 0 ? "red" : "green" },
        { label: "Projected Cash After Pending Approvals", previousValue: 0, value: totals.projectedCashAfterPendingApprovals, hint: "Cash if pending expenses are approved", tone: totals.projectedCashAfterPendingApprovals < 0 ? "red" : "amber" },
        { label: "Unusual Expense Alerts", previousValue: 0, value: officeRows.filter((row) => row.pendingExpensesPeriod > row.cashHeldInOffice && row.pendingExpensesPeriod > 0).length, hint: "Offices where pending approvals may overdraw cash", tone: officeRows.some((row) => row.pendingExpensesPeriod > row.cashHeldInOffice && row.pendingExpensesPeriod > 0) ? "red" : "green" },
    ];

    const byDay = new Map<string, number>();
    for (let i = 6; i >= 0; i--) byDay.set(addDays(today, -i), 0);
    for (const row of allCollections) {
        const date = collectionDate(row);
        if (byDay.has(date)) byDay.set(date, (byDay.get(date) ?? 0) + collectionAmount(row));
    }
    const dailyCards = [...byDay.entries()].map(([date, totalCollected], index, entries) => {
        const rows = allCollections.filter((row) => collectionDate(row) === date);
        const receiptBreakdown = buildReceiptBreakdown(rows);
        const banked = sum(bankOutflows.filter((row) => movementDate(row) === date), (row) => numberValue(row.amount));
        const handedToAdmin = sum(adminHandedToAdminOutflows.filter((row) => movementDate(row) === date), (row) => numberValue(row.amount));
        const approvedExpensesForDay = sum(approvedExpenses.filter((row) => expenseDate(row) === date), expenseAmount);
        const previous = index > 0 ? entries[index - 1][1] : 0;
        const officesForDay = new Map<string, number>();
        const collectorsForDay = new Map<string, number>();
        for (const row of rows) {
            const officeId = String(row.office_id ?? "");
            const collectorId = String(row.recorded_by ?? "");
            officesForDay.set(officeId, (officesForDay.get(officeId) ?? 0) + collectionAmount(row));
            collectorsForDay.set(collectorId, (collectorsForDay.get(collectorId) ?? 0) + collectionAmount(row));
        }
        const topOfficeId = [...officesForDay.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
        const topCollectorId = [...collectorsForDay.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
        const rawCashStillHeld = totalCollected - approvedExpensesForDay - banked - handedToAdmin;
        const cashStillHeld = Math.max(0, rawCashStillHeld);
        return {
            approvedExpenses: approvedExpensesForDay,
            amountBanked: banked,
            amountHandedToAdmin: handedToAdmin,
            cashStillHeld,
            cashReconciliationDifference: rawCashStillHeld < 0 ? Math.abs(rawCashStillHeld) : 0,
            changeFromPreviousDay: totalCollected - previous,
            date,
            receiptCount: receiptBreakdown.filter((item) => item.contributesToReceiptCount).length,
            rawCashStillHeld,
            receiptBreakdown,
            strongestCollector: topCollectorId ? String(userById.get(topCollectorId)?.full_name ?? userById.get(topCollectorId)?.email ?? "Collector") : "No collections",
            strongestOffice: topOfficeId ? officeById.get(topOfficeId) ?? "Office" : "No office",
            totalCollected,
            trend: totalCollected > previous ? "up" as const : totalCollected < previous ? "down" as const : "flat" as const,
        };
    });
    const byMonth = new Map<string, number>();
    for (const row of allCollections) {
        const month = collectionDate(row).slice(0, 7);
        if (!month) continue;
        byMonth.set(month, (byMonth.get(month) ?? 0) + collectionAmount(row));
    }
    const charts = {
        bankingTimeline: chartTop(officeRows.map((row) => ({ label: row.officeName, value: row.alreadyBanked }))),
        collectorComparison: chartTop(collectors.map((row) => ({ label: row.collectorName, value: row.thisMonth }))),
        dailyCashMovement: [...byDay.entries()].map(([label, value]) => ({ label: label.slice(5), value })),
        monthlyCollections: [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-6).map(([label, value]) => ({ label, value })),
        officeComparison: chartTop(officeRows.map((row) => ({ label: row.officeName, value: row.dailyCashRemainingAtOffice }))),
        officeRanking: chartTop(officeRows.map((row) => ({ label: row.officeName, value: row.dailyCollected }))),
        securityLiability: [
            { label: "Liability", value: securityDepositsHeld },
            { label: "Available", value: sum(securityRows, (row) => numberValue(row.cash_available)) },
            { label: "Used", value: sum(securityRows, (row) => numberValue(row.amount_used_by_company)) },
            { label: "Shortfall", value: securityShortfall },
        ],
    };

    return {
        charts,
        collectors: collectors.sort((a, b) => b.todayCollections - a.todayCollections),
        companyName: context.activeCompany?.name ?? "Ddumba OS",
        dailyCards,
        filters,
        generatedAt: new Date().toISOString(),
        insights: [...receiptIntegrityAlerts, ...buildInsights({ collectors, offices: officeRows, securityShortfall, totals })],
        kpis,
        offices,
        officeRows: officeRows.sort((a, b) => b.dailyCashRemainingAtOffice - a.dailyCashRemainingAtOffice),
        selectedPeriodLabel: periodLabel(filters.startDate, filters.endDate),
        selectedPeriodMode: filters.startDate === filters.endDate ? "single-day" : "range",
        totals,
    };
}
