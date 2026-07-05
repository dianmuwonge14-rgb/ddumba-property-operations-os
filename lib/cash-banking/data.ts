import { requirePermission, hasPermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { CashBankingData, CashBankingFilters, CashInsight, CashLedgerRow, CashOfficeSummary } from "./types";

type Row = Record<string, any>;

const INACTIVE_PAYMENT_STATUSES = new Set(["voided", "removed", "removed_by_admin_approval", "rejected", "pending", "cancelled", "canceled"]);

function todayKey() {
    return new Date().toISOString().slice(0, 10);
}

function resolveFilters(filters: CashBankingFilters = {}) {
    const today = todayKey();
    let startDate = filters.startDate || today;
    let endDate = filters.endDate || startDate;
    if (startDate > endDate) [startDate, endDate] = [endDate, startDate];
    return { startDate, endDate, officeId: filters.officeId ?? null };
}

function numberValue(value: unknown) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
}

function dateOnly(value: string | null | undefined) {
    return String(value ?? "").slice(0, 10);
}

function timeOnly(value: string | null | undefined) {
    const source = value ? new Date(value) : null;
    if (!source || Number.isNaN(source.getTime())) return "";
    return source.toLocaleTimeString("en-UG", { hour: "2-digit", minute: "2-digit" });
}

function inRange(value: string | null | undefined, startDate: string, endDate: string) {
    const date = dateOnly(value);
    return Boolean(date && date >= startDate && date <= endDate);
}

function isActiveCollection(row: Row) {
    const status = String(row.status ?? "active").toLowerCase();
    return !INACTIVE_PAYMENT_STATUSES.has(status);
}

function officeName(row: Row) {
    return row.office_name ?? row.name ?? "Office";
}

function sum(rows: Row[], value: (row: Row) => number) {
    return rows.reduce((total, row) => total + value(row), 0);
}

function cashAmount(row: Row) {
    return numberValue(row.amount_paid ?? row.amount);
}

function expenseAmount(row: Row) {
    return numberValue(row.amount);
}

function movementDate(row: Row) {
    return dateOnly(row.transaction_date ?? row.created_at);
}

function collectionDate(row: Row) {
    return dateOnly(row.payment_date ?? row.paid_at ?? row.created_at);
}

function expenseDate(row: Row) {
    return dateOnly(row.expense_date ?? row.created_at);
}

function accountKey(row: Row) {
    return String(row.id ?? "");
}

function buildInsights(summaries: CashOfficeSummary[], totals: CashBankingData["totals"]): CashInsight[] {
    const insights: CashInsight[] = [];
    const highCash = summaries.filter((summary) => summary.moneyAtOffice >= 1_000_000).sort((a, b) => b.moneyAtOffice - a.moneyAtOffice);
    if (highCash[0]) {
        insights.push({
            id: `high-cash-${highCash[0].officeId}`,
            severity: "warning",
            title: "Office cash should be banked",
            message: `${highCash[0].officeName} is holding UGX ${Math.round(highCash[0].moneyAtOffice).toLocaleString()} at office.`,
            action: "Ask the office to bank excess cash or explain the delay.",
        });
    }
    const negative = summaries.find((summary) => summary.moneyAtOffice < 0);
    if (negative) {
        insights.push({
            id: `negative-cash-${negative.officeId}`,
            severity: "critical",
            title: "Office cash is negative",
            message: `${negative.officeName} has spent/banked more than the recorded cash available.`,
            action: "Review expenses, removals, and banking entries for this office.",
        });
    }
    const unbanked = summaries.filter((summary) => summary.collectedPeriod > 0 && summary.bankingCount === 0);
    if (unbanked[0]) {
        insights.push({
            id: `unbanked-${unbanked[0].officeId}`,
            severity: "info",
            title: "Collections not banked in selected period",
            message: `${unbanked[0].officeName} collected UGX ${Math.round(unbanked[0].collectedPeriod).toLocaleString()} with no banking entry in this period.`,
            action: "Follow up before close of day.",
        });
    }
    if (totals.companyCashPosition > 0) {
        insights.push({
            id: "cash-position",
            severity: "success",
            title: "Company cash position is live",
            message: `Company cash position is UGX ${Math.round(totals.companyCashPosition).toLocaleString()} across offices and bank.`,
            action: "Use the ledger to reconcile against physical cash and bank slips.",
        });
    }
    return insights;
}

export async function getCashBankingData(filtersInput: CashBankingFilters = {}): Promise<CashBankingData> {
    const context = await requirePermission("cash.read");
    const companyId = context.activeCompany?.id;
    if (!companyId) throw new Error("Active company is required.");

    const filters = resolveFilters(filtersInput);
    const isAdmin = context.isCompanyAdmin && !context.isOfficeMode;
    const canManage = isAdmin
        || hasPermission(context, "cash.manage")
        || hasPermission(context, "collections.manage")
        || hasPermission(context, "expenses.manage");
    const allowedOfficeIds = isAdmin
        ? null
        : new Set(context.offices.map((office) => office.id).filter(Boolean));
    const scopedOfficeId = isAdmin ? filters.officeId : context.activeOffice?.id ?? null;

    const admin = createSupabaseAdminClient();
    const [
        officesResult,
        collectionsResult,
        expensesResult,
        accountsResult,
        cashTransactionsResult,
        cashTransfersResult,
        usersResult,
    ] = await Promise.all([
        admin.from("offices").select("id, office_name, name").eq("company_id", companyId).order("office_name", { ascending: true, nullsFirst: false }),
        admin.from("collections").select("id, company_id, office_id, amount, amount_paid, payment_date, paid_at, created_at, payment_method, reference_number, recorded_by, status").eq("company_id", companyId).limit(10000),
        admin.from("expenses").select("id, company_id, office_id, amount, expense_date, created_at, item, description, entered_by, submitted_by").eq("company_id", companyId).limit(10000),
        admin.from("cash_accounts").select("id, company_id, office_id, account_type, name, status").eq("company_id", companyId).eq("status", "active"),
        admin.from("cash_transactions").select("id, company_id, office_id, cash_account_id, amount, transaction_type, source_type, source_id, transaction_date, created_at, description, recorded_by").eq("company_id", companyId).limit(10000),
        admin.from("cash_transfers").select("id, company_id, from_cash_account_id, to_cash_account_id, amount, status, correction_metadata").eq("company_id", companyId).limit(10000),
        admin.from("users").select("id, full_name, email").eq("company_id", companyId).limit(1000),
    ]);

    for (const result of [officesResult, collectionsResult, expensesResult, accountsResult, cashTransactionsResult, cashTransfersResult, usersResult]) {
        if (result.error) throw new Error(result.error.message);
    }

    const allOffices = (officesResult.data ?? []) as Row[];
    const visibleOffices = allOffices
        .filter((office) => (!allowedOfficeIds || allowedOfficeIds.has(office.id)) && (!scopedOfficeId || office.id === scopedOfficeId))
        .map((office) => ({ id: String(office.id), name: officeName(office) }));
    const visibleOfficeIds = new Set(visibleOffices.map((office) => office.id));
    const officeById = new Map(visibleOffices.map((office) => [office.id, office.name]));
    const userById = new Map(((usersResult.data ?? []) as Row[]).map((user) => [String(user.id), user.full_name ?? user.email ?? "User"]));

    const collections = ((collectionsResult.data ?? []) as Row[]).filter((row) => row.office_id && visibleOfficeIds.has(row.office_id) && isActiveCollection(row));
    const expenses = ((expensesResult.data ?? []) as Row[]).filter((row) => row.office_id && visibleOfficeIds.has(row.office_id));
    const accounts = ((accountsResult.data ?? []) as Row[]).filter((row) => !row.office_id || visibleOfficeIds.has(row.office_id));
    const accountById = new Map(accounts.map((row) => [accountKey(row), row]));
    const transferById = new Map(((cashTransfersResult.data ?? []) as Row[]).map((row) => [String(row.id), row]));
    const cashTransactions = ((cashTransactionsResult.data ?? []) as Row[]).filter((row) => {
        if (row.office_id && !visibleOfficeIds.has(row.office_id)) return false;
        const account = accountById.get(String(row.cash_account_id));
        return Boolean(account);
    });

    const periodCollections = collections.filter((row) => inRange(collectionDate(row), filters.startDate, filters.endDate));
    const todayCollections = collections.filter((row) => collectionDate(row) === todayKey());
    const periodExpenses = expenses.filter((row) => inRange(expenseDate(row), filters.startDate, filters.endDate));
    const bankOutflows = cashTransactions.filter((row) => {
        const account = accountById.get(String(row.cash_account_id));
        return account?.account_type === "office_cash" && row.transaction_type === "outflow" && row.source_type === "bank_deposit";
    });
    const adminFloatInflows = cashTransactions.filter((row) => {
        const account = accountById.get(String(row.cash_account_id));
        return account?.account_type === "office_cash" && row.transaction_type === "inflow" && row.source_type === "admin_float";
    });
    const adminFloatOutflows = cashTransactions.filter((row) => {
        const account = accountById.get(String(row.cash_account_id));
        return account?.account_type === "office_cash" && row.transaction_type === "outflow" && row.source_type === "admin_float";
    });
    const bankAccountInflows = cashTransactions.filter((row) => {
        const account = accountById.get(String(row.cash_account_id));
        return account?.account_type === "bank" && row.transaction_type === "inflow";
    });
    const bankAccountOutflows = cashTransactions.filter((row) => {
        const account = accountById.get(String(row.cash_account_id));
        return account?.account_type === "bank" && row.transaction_type === "outflow";
    });
    const adminCashInflows = cashTransactions.filter((row) => {
        const account = accountById.get(String(row.cash_account_id));
        return account?.account_type === "hq_cash" && row.transaction_type === "inflow";
    });
    const adminCashOutflows = cashTransactions.filter((row) => {
        const account = accountById.get(String(row.cash_account_id));
        return account?.account_type === "hq_cash" && row.transaction_type === "outflow";
    });

    const summaries = visibleOffices.map<CashOfficeSummary>((office) => {
        const officeCollections = collections.filter((row) => row.office_id === office.id);
        const officeExpenses = expenses.filter((row) => row.office_id === office.id);
        const officeBanked = bankOutflows.filter((row) => row.office_id === office.id);
        const officeFloat = adminFloatInflows.filter((row) => row.office_id === office.id);
        const officeFloatOut = adminFloatOutflows.filter((row) => row.office_id === office.id);
        const collectedAll = sum(officeCollections, cashAmount);
        const spentAll = sum(officeExpenses, expenseAmount);
        const bankedAll = sum(officeBanked, (row) => numberValue(row.amount));
        const floatAll = sum(officeFloat, (row) => numberValue(row.amount));
        const floatOutAll = sum(officeFloatOut, (row) => numberValue(row.amount));
        return {
            officeId: office.id,
            officeName: office.name,
            collectedToday: sum(todayCollections.filter((row) => row.office_id === office.id), cashAmount),
            collectedPeriod: sum(periodCollections.filter((row) => row.office_id === office.id), cashAmount),
            expensesPeriod: sum(periodExpenses.filter((row) => row.office_id === office.id), expenseAmount),
            moneyAtOffice: collectedAll + floatAll - floatOutAll - spentAll - bankedAll,
            moneyBanked: bankedAll,
            adminFloatReceived: floatAll - floatOutAll,
            bankingCount: officeBanked.filter((row) => inRange(movementDate(row), filters.startDate, filters.endDate)).length,
        };
    });

    const ledgerRows: CashLedgerRow[] = [];
    for (const row of periodCollections) {
        ledgerRows.push({
            id: `collection-${row.id}`,
            date: collectionDate(row),
            time: timeOnly(row.created_at ?? row.paid_at),
            officeId: row.office_id ?? null,
            officeName: officeById.get(row.office_id) ?? "Office",
            transactionType: "collection",
            label: "Tenant collection",
            amountIn: cashAmount(row),
            amountOut: 0,
            runningBalance: 0,
            recordedBy: userById.get(String(row.recorded_by)) ?? "Office user",
            reference: row.reference_number ?? null,
            notes: row.payment_method ?? null,
        });
    }
    for (const row of periodExpenses) {
        ledgerRows.push({
            id: `expense-${row.id}`,
            date: expenseDate(row),
            time: timeOnly(row.created_at),
            officeId: row.office_id ?? null,
            officeName: officeById.get(row.office_id) ?? "Office",
            transactionType: "expense",
            label: row.item ?? "Office expense",
            amountIn: 0,
            amountOut: expenseAmount(row),
            runningBalance: 0,
            recordedBy: userById.get(String(row.entered_by ?? row.submitted_by)) ?? "Office user",
            reference: null,
            notes: row.description ?? null,
        });
    }
    for (const row of cashTransactions.filter((entry) => inRange(movementDate(entry), filters.startDate, filters.endDate))) {
        const account = accountById.get(String(row.cash_account_id));
        if (account?.account_type === "office_cash" && row.source_type === "bank_deposit" && row.transaction_type === "outflow") {
            ledgerRows.push({
                id: `bank-${row.id}`,
                date: movementDate(row),
                time: timeOnly(row.created_at ?? row.transaction_date),
                officeId: row.office_id ?? null,
                officeName: officeById.get(row.office_id) ?? "Office",
                transactionType: "bank_deposit",
                label: "Money banked",
                amountIn: 0,
                amountOut: numberValue(row.amount),
                runningBalance: 0,
                recordedBy: userById.get(String(row.recorded_by)) ?? "Office user",
                reference: row.source_id ?? null,
                notes: row.description ?? null,
            });
        }
        if (account?.account_type === "office_cash" && row.source_type === "admin_float" && row.transaction_type === "inflow") {
            const transfer = transferById.get(String(row.source_id));
            ledgerRows.push({
                id: `float-${row.id}`,
                date: movementDate(row),
                time: timeOnly(row.created_at ?? row.transaction_date),
                officeId: row.office_id ?? null,
                officeName: officeById.get(row.office_id) ?? "Office",
                transactionType: "admin_float",
                label: transfer?.status === "cancelled" ? "Admin float received (cancelled)" : "Admin float received",
                amountIn: numberValue(row.amount),
                amountOut: 0,
                runningBalance: 0,
                recordedBy: userById.get(String(row.recorded_by)) ?? "Admin",
                reference: row.source_id ?? null,
                notes: row.description ?? null,
                transferId: row.source_id ?? null,
                transferStatus: transfer?.status ?? null,
                canReassign: Boolean(isAdmin && transfer?.status === "completed"),
                canCancel: Boolean(isAdmin && transfer?.status === "completed"),
            });
        }
        if (account?.account_type === "office_cash" && row.source_type === "admin_float" && row.transaction_type === "outflow") {
            const transfer = transferById.get(String(row.source_id));
            ledgerRows.push({
                id: `float-out-${row.id}`,
                date: movementDate(row),
                time: timeOnly(row.created_at ?? row.transaction_date),
                officeId: row.office_id ?? null,
                officeName: officeById.get(row.office_id) ?? "Office",
                transactionType: "admin_float",
                label: transfer?.status === "cancelled" ? "Admin float cancelled" : "Admin float correction",
                amountIn: 0,
                amountOut: numberValue(row.amount),
                runningBalance: 0,
                recordedBy: userById.get(String(row.recorded_by)) ?? "Admin",
                reference: row.source_id ?? null,
                notes: row.description ?? null,
                transferId: row.source_id ?? null,
                transferStatus: transfer?.status ?? null,
                canReassign: false,
                canCancel: false,
            });
        }
    }

    ledgerRows.sort((a, b) => `${a.date} ${a.time} ${a.id}`.localeCompare(`${b.date} ${b.time} ${b.id}`));
    let running = 0;
    for (const row of ledgerRows) {
        running += row.amountIn - row.amountOut;
        row.runningBalance = running;
    }

    const moneyAtBank = sum(bankAccountInflows, (row) => numberValue(row.amount)) - sum(bankAccountOutflows, (row) => numberValue(row.amount));
    const adminCashBalance = sum(adminCashInflows, (row) => numberValue(row.amount)) - sum(adminCashOutflows, (row) => numberValue(row.amount));
    const totals = {
        collectedToday: sum(todayCollections, cashAmount),
        collectedPeriod: sum(periodCollections, cashAmount),
        expensesPeriod: sum(periodExpenses, expenseAmount),
        moneyAtOffices: sum(summaries as unknown as Row[], (row) => numberValue(row.moneyAtOffice)),
        moneyBanked: sum(bankOutflows, (row) => numberValue(row.amount)),
        moneyAtBank,
        adminCashBalance,
        companyCashPosition: moneyAtBank + adminCashBalance + sum(summaries as unknown as Row[], (row) => numberValue(row.moneyAtOffice)),
        adminFloatGiven: sum(adminFloatInflows, (row) => numberValue(row.amount)) - sum(adminFloatOutflows, (row) => numberValue(row.amount)),
    };

    return {
        filters,
        generatedAt: new Date().toISOString(),
        isAdmin,
        canManage,
        offices: visibleOffices,
        officeSummaries: summaries,
        ledger: ledgerRows,
        insights: buildInsights(summaries, totals),
        totals,
    };
}
