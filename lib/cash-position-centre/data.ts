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
} from "./types";

type Row = Record<string, any>;

const INACTIVE_PAYMENT_STATUSES = new Set(["voided", "removed", "removed_by_admin_approval", "rejected", "pending", "cancelled", "canceled"]);

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
    } else if (period !== "custom" && period !== "specificDay") {
        startDate = today;
        endDate = today;
    }

    if (startDate > endDate) [startDate, endDate] = [endDate, startDate];
    return {
        endDate,
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

function collectionAmount(row: Row) {
    return numberValue(row.amount_paid ?? row.amount);
}

function collectionDate(row: Row) {
    return dateOnly(row.payment_date ?? row.paid_at ?? row.created_at);
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
    if (input.unreconciled > 0 || input.moneyAtOffice < 0 || input.outstandingToBank >= 5_000_000) {
        return { status: "critical" as const, statusReason: input.moneyAtOffice < 0 ? "Negative office cash requires reconciliation" : "Cash exposure is high" };
    }
    if (input.outstandingToBank >= 1_000_000) {
        return { status: "attention" as const, statusReason: "Banking follow-up recommended" };
    }
    return { status: "healthy" as const, statusReason: "Cash position is within control threshold" };
}

function chartTop(rows: CashPositionChartPoint[], limit = 8) {
    return [...rows].sort((a, b) => b.value - a.value).slice(0, limit);
}

function buildInsights(input: {
    collectors: CashPositionCollectorRow[];
    offices: CashPositionOfficeRow[];
    securityShortfall: number;
    totals: CashPositionData["totals"];
}): CashPositionInsight[] {
    const insights: CashPositionInsight[] = [];
    const highestOffice = [...input.offices].sort((a, b) => b.outstandingToBank - a.outstandingToBank)[0];
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
        amount: input.totals.companyCashAvailable,
        id: "cash-forecast",
        message: `Projected immediately visible cash available is UGX ${Math.round(input.totals.companyCashAvailable).toLocaleString()} before next banking cycle.`,
        severity: "info",
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
        cashAccountsResult,
        cashTransactionsResult,
        collectorProfilesResult,
        usersResult,
        securityResult,
    ] = await Promise.all([
        db.from("offices").select("id, office_name, name, status").eq("company_id", companyId).order("office_name", { ascending: true, nullsFirst: false }).limit(1000),
        db.from("collections").select("id, company_id, office_id, amount, amount_paid, payment_date, paid_at, created_at, payment_method, reference_number, recorded_by, status").eq("company_id", companyId).limit(10000),
        db.from("cash_accounts").select("id, company_id, office_id, account_type, name, status").eq("company_id", companyId).eq("status", "active").limit(2000),
        db.from("cash_transactions").select("id, company_id, office_id, cash_account_id, amount, transaction_type, source_type, source_id, transaction_date, created_at, description, recorded_by").eq("company_id", companyId).limit(10000),
        db.from("field_collector_profiles").select("*").eq("company_id", companyId).limit(1000),
        db.from("users").select("id, full_name, email, phone, account_type, status").eq("company_id", companyId).limit(2000),
        db.from("security_deposit_register").select("id, office_id, liability_balance, cash_available, amount_used_by_company, amount_restored_by_company, company_shortfall, status").eq("company_id", companyId).limit(10000),
    ]);

    for (const result of [officesResult, collectionsResult, cashAccountsResult, cashTransactionsResult, collectorProfilesResult, usersResult, securityResult]) {
        if (result.error) throw new Error(result.error.message);
    }

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
        .filter((row) => !filters.paymentMethod || String(row.payment_method ?? "").toLowerCase() === filters.paymentMethod.toLowerCase());
    const periodCollections = allCollections.filter((row) => inRange(collectionDate(row), filters.startDate, filters.endDate));
    const today = kampalaDate();
    const todayCollections = allCollections.filter((row) => collectionDate(row) === today);
    const weekCollections = allCollections.filter((row) => inRange(collectionDate(row), addDays(today, -6), today));
    const monthCollections = allCollections.filter((row) => inRange(collectionDate(row), monthStart(today), today));
    const previousComparableCollections = allCollections.filter((row) => inRange(collectionDate(row), addDays(filters.startDate, -7), addDays(filters.endDate, -7)));

    const cashAccounts = ((cashAccountsResult.data ?? []) as Row[]).filter((row) => !row.office_id || visibleOfficeIds.has(String(row.office_id)));
    const accountById = new Map(cashAccounts.map((row) => [String(row.id), row]));
    const cashTransactions = ((cashTransactionsResult.data ?? []) as Row[])
        .filter((row) => !row.office_id || visibleOfficeIds.has(String(row.office_id)))
        .filter((row) => accountById.has(String(row.cash_account_id)));
    const bankOutflows = cashTransactions.filter((row) => accountById.get(String(row.cash_account_id))?.account_type === "office_cash" && row.source_type === "bank_deposit" && row.transaction_type === "outflow");
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

    const officeRows: CashPositionOfficeRow[] = offices.map((office) => {
        const officeCollections = periodCollections.filter((row) => row.office_id === office.id);
        const officeToday = todayCollections.filter((row) => row.office_id === office.id);
        const officeWeek = weekCollections.filter((row) => row.office_id === office.id);
        const officeMonth = monthCollections.filter((row) => row.office_id === office.id);
        const officePrevious = previousComparableCollections.filter((row) => row.office_id === office.id);
        const officeLedger = cashTransactions.filter((row) => row.office_id === office.id && accountById.get(String(row.cash_account_id))?.account_type === "office_cash");
        const officeBanked = bankOutflows.filter((row) => row.office_id === office.id && inRange(movementDate(row), filters.startDate, filters.endDate));
        const cashHeldInOffice = sum(officeLedger, signedLedgerAmount);
        const alreadyBanked = sum(officeBanked, (row) => numberValue(row.amount));
        const cashHeldByCollectors = collectorCashByOffice.get(office.id) ?? 0;
        const outstandingToBank = Math.max(0, cashHeldInOffice);
        const collectedPeriod = sum(officeCollections, collectionAmount);
        const previousPeriod = sum(officePrevious, collectionAmount);
        const trend = collectedPeriod > previousPeriod ? "up" : collectedPeriod < previousPeriod ? "down" : "flat";
        const unreconciled = cashHeldInOffice < 0 ? Math.abs(cashHeldInOffice) : 0;
        const status = statusForOffice({ moneyAtOffice: cashHeldInOffice, outstandingToBank, unreconciled });
        const officeAmounts = officeCollections.map(collectionAmount);
        return {
            alreadyBanked,
            bankingPercentage: collectedPeriod > 0 ? Math.min(100, Math.round((alreadyBanked / collectedPeriod) * 100)) : alreadyBanked > 0 ? 100 : 0,
            cashCollectedToday: sum(officeToday, collectionAmount),
            cashHeldByCollectors,
            cashHeldInOffice,
            collectorCount: collectors.filter((collector) => collector.officeId === office.id).length,
            givenToAdmin: 0,
            largestPayment: officeAmounts.length ? Math.max(...officeAmounts) : 0,
            lastPaymentAt: officeCollections.sort((a, b) => String(b.created_at ?? b.paid_at).localeCompare(String(a.created_at ?? a.paid_at)))[0]?.created_at ?? null,
            monthlyPerformance: sum(officeMonth, collectionAmount),
            numberOfReceipts: officeCollections.length,
            officeId: office.id,
            officeName: office.name,
            outstandingToAdmin: 0,
            outstandingToBank,
            securityDeposits: securityHeldByOffice.get(office.id) ?? 0,
            status: status.status,
            statusReason: status.statusReason,
            todayPerformance: sum(officeToday, collectionAmount),
            trend,
            weeklyPerformance: sum(officeWeek, collectionAmount),
        };
    });

    const cashHeldByOffices = sum(officeRows, (row) => row.cashHeldInOffice);
    const cashHeldByCollectors = sum(collectors, (row) => row.cashInHand);
    const totalBanked = sum(bankOutflows, (row) => numberValue(row.amount));
    const totalCashHandedToAdmin = sum(adminCashReceived, (row) => numberValue(row.amount));
    const cashWaitingToBeBanked = sum(officeRows, (row) => row.outstandingToBank);
    const unreconciledCash = sum(officeRows, (row) => row.cashHeldInOffice < 0 ? Math.abs(row.cashHeldInOffice) : 0);
    const moneyAtBank = sum(bankBalances, signedLedgerAmount);
    const adminCash = sum(hqCashBalances, signedLedgerAmount);
    const totals = {
        cashDifferenceAlerts: officeRows.filter((row) => row.status !== "healthy").length,
        cashHeldByCollectors,
        cashHeldByOffices,
        cashWaitingToBeBanked,
        companyCashAvailable: moneyAtBank + adminCash + cashHeldByOffices + cashHeldByCollectors,
        securityDepositsHeld,
        totalBanked,
        totalCashCollectedToday: sum(todayCollections, collectionAmount),
        totalCashHandedToAdmin,
        unreconciledCash,
    };
    const kpis: CashPositionKpi[] = [
        { label: "Total Cash Collected Today", value: totals.totalCashCollectedToday, hint: "Posted collections dated today", tone: "green" },
        { label: "Cash Held By Offices", value: totals.cashHeldByOffices, hint: "Live office cash ledger", tone: totals.cashHeldByOffices < 0 ? "red" : "blue" },
        { label: "Cash Held By Collectors", value: totals.cashHeldByCollectors, hint: "Field collector profile balances", tone: "cyan" },
        { label: "Total Cash Already Banked", value: totals.totalBanked, hint: "Bank deposit outflows", tone: "violet" },
        { label: "Total Cash Handed To Admin", value: totals.totalCashHandedToAdmin, hint: "Admin cash received ledger", tone: "amber" },
        { label: "Security Deposits Held", value: totals.securityDepositsHeld, hint: "Separate tenant liability", tone: "violet" },
        { label: "Company Cash Available", value: totals.companyCashAvailable, hint: "Bank + admin + office + collector cash", tone: totals.companyCashAvailable < 0 ? "red" : "green" },
        { label: "Cash Waiting To Be Banked", value: totals.cashWaitingToBeBanked, hint: "Positive office cash exposure", tone: totals.cashWaitingToBeBanked > 1_000_000 ? "amber" : "blue" },
        { label: "Unreconciled Cash", value: totals.unreconciledCash, hint: "Negative office cash requiring review", tone: totals.unreconciledCash > 0 ? "red" : "green" },
        { label: "Cash Difference Alerts", value: totals.cashDifferenceAlerts, hint: "Offices in attention or critical state", tone: totals.cashDifferenceAlerts > 0 ? "red" : "green" },
    ];

    const byDay = new Map<string, number>();
    for (let i = 6; i >= 0; i--) byDay.set(addDays(today, -i), 0);
    for (const row of allCollections) {
        const date = collectionDate(row);
        if (byDay.has(date)) byDay.set(date, (byDay.get(date) ?? 0) + collectionAmount(row));
    }
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
        officeComparison: chartTop(officeRows.map((row) => ({ label: row.officeName, value: row.monthlyPerformance }))),
        officeRanking: chartTop(officeRows.map((row) => ({ label: row.officeName, value: row.cashCollectedToday }))),
    };

    return {
        charts,
        collectors: collectors.sort((a, b) => b.todayCollections - a.todayCollections),
        companyName: context.activeCompany?.name ?? "Ddumba OS",
        filters,
        generatedAt: new Date().toISOString(),
        insights: buildInsights({ collectors, offices: officeRows, securityShortfall, totals }),
        kpis,
        offices,
        officeRows: officeRows.sort((a, b) => b.cashCollectedToday - a.cashCollectedToday),
        totals,
    };
}
