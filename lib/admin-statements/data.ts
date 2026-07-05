import { requireCompanyAdminMode } from "@/lib/auth/permissions";
import { getScopedSupabase } from "@/lib/auth/query";
import type {
    StatementCategory,
    StatementColumn,
    StatementFilters,
    StatementRow,
    StatementsCentreData,
} from "./types";

type LooseRow = Record<string, any>;

const DEFAULT_COMPANY_ID = "";

const LANDLORD_TYPES = new Set([
    "individual_landlord_paid",
    "individual_landlord_unpaid",
    "individual_landlord_advances",
    "all_landlord_paid",
    "all_landlord_unpaid",
    "all_landlord_advances",
    "active_landlord_advances",
    "closed_landlord_advances",
    "landlord_advances_with_interest",
    "landlord_advances_without_interest",
    "outstanding_advance_balance",
    "expected_future_advance_deductions",
    "landlord_advance_history",
    "landlord_advance_interest_earned",
]);

const TENANT_TYPES = new Set([
    "individual_tenant_payments_received",
    "individual_tenant_payments_not_received",
    "all_tenant_payments_received",
    "all_unpaid_tenant_payments",
    "all_tenants_paid_in_advance",
    "individual_tenant_advance_payments",
]);

const OFFICE_TYPES = new Set([
    "office_money_made",
    "all_offices_money_made",
    "office_landlord_demand",
    "all_offices_landlord_demand",
]);

function amount(value: unknown) {
    return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function advanceTotal(row: LooseRow) {
    const explicitTotal = amount(row.total_repayable);
    if (explicitTotal > 0) return explicitTotal;
    const advanceAmount = amount(row.advance_amount);
    if (advanceAmount > 0) return advanceAmount;
    return amount(row.principal_amount) + amount(row.interest_amount);
}

function advanceRemaining(row: LooseRow) {
    const remainingTotal = amount(row.remaining_total_balance);
    if (remainingTotal > 0) return remainingTotal;
    const remainingBalance = amount(row.remaining_balance);
    if (remainingBalance > 0) return remainingBalance;
    const principalInterest = amount(row.remaining_principal_balance) + amount(row.remaining_interest_balance);
    if (principalInterest > 0) return principalInterest;
    return Math.max(0, advanceTotal(row) - amount(row.deducted_amount));
}

function isActiveAdvance(row: LooseRow) {
    const status = String(row.status ?? "pending").toLowerCase();
    const lifecycle = String(row.lifecycle_status ?? "active").toLowerCase();
    const approved = ["approved", "active", "partially_deducted"].includes(status)
        || Boolean(row.approved_by || row.approved_at || row.approved_date);
    return !["fully_deducted", "cleared", "cancelled", "rejected"].includes(status)
        && !["cleared", "cancelled", "rejected"].includes(lifecycle)
        && approved
        && advanceRemaining(row) > 0;
}

function text(value: unknown, fallback = "") {
    const resolved = String(value ?? "").trim();
    return resolved || fallback;
}

function dateOnly(value: unknown) {
    return String(value ?? "").slice(0, 10);
}

function monthStart(month: string) {
    if (!/^\d{4}-\d{2}$/.test(month)) return "";
    return `${month}-01`;
}

function monthEnd(month: string) {
    if (!/^\d{4}-\d{2}$/.test(month)) return "";
    const [year, rawMonth] = month.split("-").map(Number);
    return new Date(Date.UTC(year, rawMonth, 0)).toISOString().slice(0, 10);
}

function currentMonth() {
    return new Date().toISOString().slice(0, 7);
}

function normalizeCategory(value: unknown): StatementCategory {
    return value === "tenants" || value === "offices" ? value : "landlords";
}

function defaultStatementType(category: StatementCategory) {
    if (category === "tenants") return "all_tenant_payments_received";
    if (category === "offices") return "all_offices_money_made";
    return "all_landlord_unpaid";
}

function normalizeStatementType(category: StatementCategory, value: unknown) {
    const candidate = String(value ?? "").trim();
    if (category === "landlords" && LANDLORD_TYPES.has(candidate)) return candidate;
    if (category === "tenants" && TENANT_TYPES.has(candidate)) return candidate;
    if (category === "offices" && OFFICE_TYPES.has(candidate)) return candidate;
    return defaultStatementType(category);
}

function firstParam(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function resolvePeriod(filters: StatementFilters) {
    if (filters.startDate || filters.endDate) {
        const start = filters.startDate || "1900-01-01";
        const end = filters.endDate || "2999-12-31";
        return { start, end, label: `${start} to ${end}`, mode: "date" as const };
    }
    if (filters.singleMonth) {
        const start = monthStart(filters.singleMonth);
        const end = monthEnd(filters.singleMonth);
        return { start, end, label: filters.singleMonth, mode: "single-month" as const };
    }
    if (filters.startMonth || filters.endMonth) {
        const start = monthStart(filters.startMonth || filters.endMonth);
        const end = monthEnd(filters.endMonth || filters.startMonth);
        return { start, end, label: `${filters.startMonth || filters.endMonth} to ${filters.endMonth || filters.startMonth}`, mode: "month-range" as const };
    }
    const month = currentMonth();
    return { start: monthStart(month), end: monthEnd(month), label: month, mode: "single-month" as const };
}

function monthKeysBetween(start: string, end: string) {
    const result: string[] = [];
    const startDate = new Date(`${start.slice(0, 7)}-01T00:00:00Z`);
    const endDate = new Date(`${end.slice(0, 7)}-01T00:00:00Z`);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return result;
    for (let cursor = startDate; cursor <= endDate; cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))) {
        result.push(cursor.toISOString().slice(0, 10));
    }
    return result;
}

function parseFilters(searchParams: Record<string, string | string[] | undefined>): StatementFilters {
    const category = normalizeCategory(firstParam(searchParams.category));
    return {
        category,
        statementType: normalizeStatementType(category, firstParam(searchParams.statementType)),
        startDate: firstParam(searchParams.startDate),
        endDate: firstParam(searchParams.endDate),
        startMonth: firstParam(searchParams.startMonth),
        endMonth: firstParam(searchParams.endMonth),
        singleMonth: firstParam(searchParams.singleMonth) || currentMonth(),
        officeId: firstParam(searchParams.officeId),
    };
}

export async function getStatementsCentreData(searchParams: Record<string, string | string[] | undefined>): Promise<StatementsCentreData> {
    const context = await requireCompanyAdminMode();
    const { supabase } = await getScopedSupabase();
    const companyId = context.activeCompany?.id ?? DEFAULT_COMPANY_ID;
    const filters = parseFilters(searchParams);
    const period = resolvePeriod(filters);
    const db = supabase as unknown as { from: (table: string) => any };

    const officesResult = await db
        .from("offices")
        .select("id,name,office_name")
        .eq("company_id", companyId)
        .order("name", { ascending: true });
    if (officesResult.error) throw new Error(officesResult.error.message);

    const offices = ((officesResult.data ?? []) as LooseRow[]).map((office) => ({
        id: String(office.id),
        name: text(office.office_name ?? office.name, "Office"),
    }));
    const officeById = new Map(offices.map((office) => [office.id, office.name]));

    const base = {
        company: context.activeCompany,
        activeOffice: context.activeOffice,
        generatedAt: new Date().toISOString(),
        filters,
        offices,
    };

    if (!companyId) {
        return {
            ...base,
            title: "Statements Centre",
            description: "No active company found.",
            columns: [],
            rows: [],
            totals: {},
            summary: { primaryLabel: "Total", primaryValue: 0, secondaryLabel: "Rows", secondaryValue: 0, rowCount: 0, periodLabel: period.label },
        };
    }

    if (filters.category === "tenants") return { ...base, ...(await loadTenantStatement({ companyId, db, filters, officeById, period })) };
    if (filters.category === "offices") return { ...base, ...(await loadOfficeStatement({ companyId, db, filters, officeById, offices, period })) };
    return { ...base, ...(await loadLandlordStatement({ companyId, db, filters, officeById, period })) };
}

export async function getStatementsCentreShell(searchParams: Record<string, string | string[] | undefined>): Promise<StatementsCentreData> {
    const context = await requireCompanyAdminMode();
    const { supabase } = await getScopedSupabase();
    const companyId = context.activeCompany?.id ?? DEFAULT_COMPANY_ID;
    const filters = parseFilters(searchParams);
    const period = resolvePeriod(filters);
    const db = supabase as unknown as { from: (table: string) => any };
    const officesResult = await db
        .from("offices")
        .select("id,name,office_name")
        .eq("company_id", companyId)
        .order("name", { ascending: true });
    if (officesResult.error) throw new Error(officesResult.error.message);
    const offices = ((officesResult.data ?? []) as LooseRow[]).map((office) => ({
        id: String(office.id),
        name: text(office.office_name ?? office.name, "Office"),
    }));

    return {
        company: context.activeCompany,
        activeOffice: context.activeOffice,
        generatedAt: new Date().toISOString(),
        filters,
        offices,
        title: "Choose a statement",
        description: "Select category, type, and period to fetch a live Supabase statement.",
        columns: [],
        rows: [],
        totals: {},
        summary: {
            primaryLabel: "Statement Total",
            primaryValue: 0,
            secondaryLabel: "Rows",
            secondaryValue: 0,
            rowCount: 0,
            periodLabel: period.label,
        },
    };
}

async function loadLandlordStatement({
    companyId,
    db,
    filters,
    officeById,
    period,
}: {
    companyId: string;
    db: { from: (table: string) => any };
    filters: StatementFilters;
    officeById: Map<string, string>;
    period: { start: string; end: string; label: string };
}) {
    const months = monthKeysBetween(period.start, period.end);
    let payablesQuery = db
        .from("landlord_monthly_payables")
        .select("*")
        .eq("company_id", companyId)
        .neq("status", "archived")
        .gte("settlement_month", months[0] ?? period.start)
        .lte("settlement_month", months.at(-1) ?? period.end)
        .order("settlement_month", { ascending: false });
    let advancesQuery = db
        .from("landlord_advances")
        .select("*")
        .eq("company_id", companyId)
        .gte("date_given", period.start)
        .lte("date_given", period.end)
        .order("date_given", { ascending: false });
    let advanceScheduleQuery = db
        .from("landlord_advance_repayment_schedule")
        .select("*")
        .eq("company_id", companyId)
        .gte("month_key", period.start)
        .lte("month_key", period.end)
        .order("month_key", { ascending: true });
    let advanceDeductionsQuery = db
        .from("landlord_advance_deductions")
        .select("*")
        .eq("company_id", companyId)
        .gte("deduction_month", period.start)
        .lte("deduction_month", period.end)
        .order("deduction_month", { ascending: false });
    let paymentsQuery = db
        .from("landlord_monthly_payable_payments")
        .select("*")
        .eq("company_id", companyId)
        .gte("paid_at", `${period.start}T00:00:00`)
        .lte("paid_at", `${period.end}T23:59:59`)
        .order("paid_at", { ascending: false });
    if (filters.officeId) {
        payablesQuery = payablesQuery.eq("office_id", filters.officeId);
        advancesQuery = advancesQuery.eq("office_id", filters.officeId);
        advanceScheduleQuery = advanceScheduleQuery.eq("office_id", filters.officeId);
        advanceDeductionsQuery = advanceDeductionsQuery.eq("office_id", filters.officeId);
        paymentsQuery = paymentsQuery.eq("office_id", filters.officeId);
    }
    const landlordsQuery = db.from("landlords").select("id,full_name").eq("company_id", companyId).limit(1500);
    const [payablesResult, advancesResult, scheduleResult, deductionResult, paymentsResult, landlordsResult] = await Promise.all([payablesQuery, advancesQuery, advanceScheduleQuery, advanceDeductionsQuery, paymentsQuery, landlordsQuery]);
    for (const result of [payablesResult, advancesResult, scheduleResult, deductionResult, paymentsResult, landlordsResult]) {
        if (result.error) throw new Error(result.error.message);
    }
    const payables = (payablesResult.data ?? []) as LooseRow[];
    const advances = (advancesResult.data ?? []) as LooseRow[];
    const schedules = (scheduleResult.data ?? []) as LooseRow[];
    const advanceDeductions = (deductionResult.data ?? []) as LooseRow[];
    const payments = (paymentsResult.data ?? []) as LooseRow[];
    const landlordById = new Map(((landlordsResult.data ?? []) as LooseRow[]).map((landlord) => [String(landlord.id), text(landlord.full_name, "Landlord")]));
    const advanceByLandlord = new Map<string, number>();
    for (const advance of advances) {
        const key = String(advance.landlord_id ?? "");
        advanceByLandlord.set(key, (advanceByLandlord.get(key) ?? 0) + advanceRemaining(advance));
    }
    const paidByPayableId = new Map<string, number>();
    for (const payment of payments) {
        const key = String(payment.monthly_payable_id ?? "");
        paidByPayableId.set(key, (paidByPayableId.get(key) ?? 0) + amount(payment.amount_paid ?? payment.amount));
    }

    let rows: StatementRow[] = payables.map((row) => {
        const paidAmount = Math.max(amount(row.amount_paid), paidByPayableId.get(String(row.id)) ?? 0);
        return {
            landlord: text(row.landlord_name, "Landlord"),
            office: text(row.office_name, officeById.get(String(row.office_id)) ?? "Office"),
            month: dateOnly(row.settlement_month),
            marker: /cleared_month=([A-Z]+)/i.exec(String(row.reasons_notes ?? ""))?.[1]?.toUpperCase() ?? "UNKNOWN",
            netPayable: amount(row.net_payable),
            paidAmount,
            unpaidAmount: amount(row.unpaid_balance),
            advances: advanceByLandlord.get(String(row.landlord_id)) ?? 0,
            recoveryDeductions: amount(row.vacated_tenant_debt_deductions),
            status: text(row.status, "unknown"),
            reasons: text(row.reasons_notes, "No deductions noted"),
            total: filters.statementType.includes("unpaid") ? amount(row.unpaid_balance) : filters.statementType.includes("advance") ? advanceByLandlord.get(String(row.landlord_id)) ?? 0 : paidAmount,
        };
    });

    if (filters.statementType.includes("paid")) rows = rows.filter((row) => row.marker !== "UNKNOWN" && (String(row.status).toLowerCase() === "paid" || amount(row.paidAmount) > 0));
    if (filters.statementType.includes("unpaid")) rows = rows.filter((row) => row.marker !== "UNKNOWN" && (String(row.status).toLowerCase() === "unpaid" || amount(row.unpaidAmount) > 0));
    const isAdvanceStatement = filters.statementType.includes("advance");
    if (isAdvanceStatement) {
        let visibleAdvances = advances;
        if (filters.statementType === "active_landlord_advances" || filters.statementType === "outstanding_advance_balance") {
            visibleAdvances = visibleAdvances.filter(isActiveAdvance);
        }
        if (filters.statementType === "closed_landlord_advances") {
            visibleAdvances = visibleAdvances.filter((advance) => !isActiveAdvance(advance));
        }
        if (filters.statementType === "landlord_advances_with_interest") {
            visibleAdvances = visibleAdvances.filter((advance) => amount(advance.interest_amount) > 0);
        }
        if (filters.statementType === "landlord_advances_without_interest") {
            visibleAdvances = visibleAdvances.filter((advance) => amount(advance.interest_amount) <= 0);
        }
        if (filters.statementType === "expected_future_advance_deductions") {
            rows = schedules.filter((row) => String(row.status ?? "pending") === "pending").map((row) => ({
                landlord: landlordById.get(String(row.landlord_id)) ?? "Landlord",
                office: officeById.get(String(row.office_id)) ?? "Office",
                month: dateOnly(row.month_key),
                netPayable: 0,
                paidAmount: 0,
                unpaidAmount: amount(row.closing_balance),
                advances: amount(row.opening_balance),
                recoveryDeductions: amount(row.interest_portion),
                status: text(row.status, "pending"),
                reasons: `Scheduled deduction ${Math.round(amount(row.scheduled_deduction)).toLocaleString()}`,
                total: amount(row.scheduled_deduction),
            }));
        } else if (filters.statementType === "landlord_advance_history" || filters.statementType === "landlord_advance_interest_earned") {
            rows = advanceDeductions.map((row) => ({
                landlord: landlordById.get(String(row.landlord_id)) ?? "Landlord",
                office: officeById.get(String(row.office_id)) ?? "Office",
                month: dateOnly(row.deduction_month),
                netPayable: 0,
                paidAmount: amount(row.amount),
                unpaidAmount: amount(row.remaining_total_balance ?? row.remaining_balance),
                advances: amount(row.principal_portion),
                recoveryDeductions: amount(row.interest_portion),
                status: text(row.status, "deducted"),
                reasons: text(row.notes ?? row.reference, "Advance deduction"),
                total: filters.statementType === "landlord_advance_interest_earned" ? amount(row.interest_portion) : amount(row.amount),
            }));
        } else {
            rows = visibleAdvances.map((advance) => ({
            landlord: landlordById.get(String(advance.landlord_id)) ?? "Landlord",
            office: officeById.get(String(advance.office_id)) ?? "Office",
            month: dateOnly(advance.date_given),
            netPayable: 0,
            paidAmount: amount(advance.deducted_amount),
            unpaidAmount: advanceRemaining(advance),
            advances: advanceTotal(advance),
            recoveryDeductions: amount(advance.interest_amount),
            status: text(advance.lifecycle_status ?? advance.status, "pending"),
            reasons: text(advance.reason ?? advance.note, "Landlord advance"),
            total: advanceRemaining(advance),
        }));
        }
    }

    const columns = landlordColumns();
    const totals = sumTotals(rows, ["netPayable", "paidAmount", "unpaidAmount", "advances", "recoveryDeductions", "total"]);
    return {
        title: landlordTitle(filters.statementType),
        description: "Live landlord payable, paid, unpaid, advance, and recovery statement from Supabase.",
        columns,
        rows,
        totals,
        summary: {
            primaryLabel: "Statement Total",
            primaryValue: amount(totals.total),
            secondaryLabel: "Rows",
            secondaryValue: rows.length,
            rowCount: rows.length,
            periodLabel: period.label,
        },
    };
}

async function loadTenantStatement({
    companyId,
    db,
    filters,
    officeById,
    period,
}: {
    companyId: string;
    db: { from: (table: string) => any };
    filters: StatementFilters;
    officeById: Map<string, string>;
    period: { start: string; end: string; label: string };
}) {
    let collectionsQuery = db
        .from("collections")
        .select("*")
        .eq("company_id", companyId)
        .gte("paid_at", `${period.start}T00:00:00`)
        .lte("paid_at", `${period.end}T23:59:59`)
        .order("paid_at", { ascending: false })
        .limit(800);
    let tenantsQuery = db.from("tenants").select("*").eq("company_id", companyId).limit(1000);
    const roomsQuery = db.from("rooms").select("id,room_number,landlord_id,office_id,monthly_rent").eq("company_id", companyId).limit(1200);
    const landlordsQuery = db.from("landlords").select("id,full_name").eq("company_id", companyId).limit(1200);
    if (filters.officeId) {
        collectionsQuery = collectionsQuery.eq("office_id", filters.officeId);
        tenantsQuery = tenantsQuery.eq("office_id", filters.officeId);
    }
    const [collectionsResult, tenantsResult, roomsResult, landlordsResult] = await Promise.all([collectionsQuery, tenantsQuery, roomsQuery, landlordsQuery]);
    for (const result of [collectionsResult, tenantsResult, roomsResult, landlordsResult]) {
        if (result.error) throw new Error(result.error.message);
    }
    const tenantById = new Map(((tenantsResult.data ?? []) as LooseRow[]).map((tenant) => [String(tenant.id), tenant]));
    const roomById = new Map(((roomsResult.data ?? []) as LooseRow[]).map((room) => [String(room.id), room]));
    const landlordById = new Map(((landlordsResult.data ?? []) as LooseRow[]).map((landlord) => [String(landlord.id), landlord]));

    let rows: StatementRow[] = [];
    if (filters.statementType.includes("received")) {
        rows = ((collectionsResult.data ?? []) as LooseRow[]).map((collection) => {
            const tenant = tenantById.get(String(collection.tenant_id)) ?? {};
            const room = roomById.get(String(collection.room_id ?? tenant.room_id)) ?? {};
            const landlord = landlordById.get(String(collection.landlord_id ?? room.landlord_id)) ?? {};
            return {
                tenant: text(tenant.full_name, "Tenant"),
                room: text(room.room_number, "Room"),
                landlord: text(landlord.full_name, "Landlord"),
                office: officeById.get(String(collection.office_id ?? tenant.office_id)) ?? "Office",
                monthlyRent: amount(tenant.monthly_rent ?? room.monthly_rent),
                amountPaid: amount(collection.amount_paid ?? collection.amount),
                balance: amount(collection.balance ?? tenant.balance),
                advanceAmount: amount(collection.balance) < 0 ? Math.abs(amount(collection.balance)) : 0,
                paymentDate: dateOnly(collection.paid_at ?? collection.created_at),
                collector: text(collection.recorded_by ?? collection.collector_id, "Recorded in Supabase"),
                paymentMethod: text(collection.payment_method, "payment"),
                total: amount(collection.amount_paid ?? collection.amount),
            };
        });
    } else {
        rows = ((tenantsResult.data ?? []) as LooseRow[])
            .filter((tenant) => filters.statementType.includes("advance") ? amount(tenant.balance) < 0 : amount(tenant.balance) > 0)
            .map((tenant) => {
                const room = roomById.get(String(tenant.room_id)) ?? {};
                const landlord = landlordById.get(String(room.landlord_id)) ?? {};
                const balance = amount(tenant.balance);
                return {
                    tenant: text(tenant.full_name, "Tenant"),
                    room: text(room.room_number, "Room"),
                    landlord: text(landlord.full_name, "Landlord"),
                    office: officeById.get(String(tenant.office_id ?? room.office_id)) ?? "Office",
                    monthlyRent: amount(tenant.monthly_rent ?? room.monthly_rent),
                    amountPaid: 0,
                    balance: Math.max(0, balance),
                    advanceAmount: balance < 0 ? Math.abs(balance) : 0,
                    paymentDate: "Not paid in selected period",
                    collector: "",
                    paymentMethod: "",
                    total: balance < 0 ? Math.abs(balance) : Math.max(0, balance),
                };
            });
    }

    const totals = sumTotals(rows, ["monthlyRent", "amountPaid", "balance", "advanceAmount", "total"]);
    return {
        title: tenantTitle(filters.statementType),
        description: "Live tenant collection and balance statement from Supabase collections and tenant balances.",
        columns: tenantColumns(),
        rows,
        totals,
        summary: {
            primaryLabel: "Statement Total",
            primaryValue: amount(totals.total),
            secondaryLabel: "Tenant Rows",
            secondaryValue: rows.length,
            rowCount: rows.length,
            periodLabel: period.label,
        },
    };
}

async function loadOfficeStatement({
    companyId,
    db,
    filters,
    officeById,
    offices,
    period,
}: {
    companyId: string;
    db: { from: (table: string) => any };
    filters: StatementFilters;
    officeById: Map<string, string>;
    offices: Array<{ id: string; name: string }>;
    period: { start: string; end: string; label: string };
}) {
    const monthKeys = monthKeysBetween(period.start, period.end);
    let collectionsQuery = db.from("collections").select("*").eq("company_id", companyId).gte("paid_at", `${period.start}T00:00:00`).lte("paid_at", `${period.end}T23:59:59`).limit(1500);
    let expensesQuery = db.from("expenses").select("*").eq("company_id", companyId).gte("expense_date", period.start).lte("expense_date", period.end).limit(1500);
    let payablesQuery = db.from("landlord_monthly_payables").select("*").eq("company_id", companyId).neq("status", "archived").gte("settlement_month", monthKeys[0] ?? period.start).lte("settlement_month", monthKeys.at(-1) ?? period.end).limit(1500);
    let advancesQuery = db.from("landlord_advances").select("*").eq("company_id", companyId).gte("date_given", period.start).lte("date_given", period.end).limit(1500);
    let deductionsQuery = db.from("landlord_debt_deductions").select("*").eq("company_id", companyId).gte("created_at", `${period.start}T00:00:00`).lte("created_at", `${period.end}T23:59:59`).limit(1500);
    if (filters.officeId) {
        collectionsQuery = collectionsQuery.eq("office_id", filters.officeId);
        expensesQuery = expensesQuery.eq("office_id", filters.officeId);
        payablesQuery = payablesQuery.eq("office_id", filters.officeId);
        advancesQuery = advancesQuery.eq("office_id", filters.officeId);
        deductionsQuery = deductionsQuery.eq("office_id", filters.officeId);
    }
    const [collectionsResult, expensesResult, payablesResult, advancesResult, deductionsResult] = await Promise.all([
        collectionsQuery,
        expensesQuery,
        payablesQuery,
        advancesQuery,
        deductionsQuery,
    ]);
    for (const result of [collectionsResult, expensesResult, payablesResult, advancesResult, deductionsResult]) {
        if (result.error) throw new Error(result.error.message);
    }
    const officeIds = filters.officeId ? [filters.officeId] : offices.map((office) => office.id);
    const rows = officeIds.map((officeId) => {
        const collections = ((collectionsResult.data ?? []) as LooseRow[]).filter((row) => String(row.office_id) === officeId);
        const expenses = ((expensesResult.data ?? []) as LooseRow[]).filter((row) => String(row.office_id) === officeId);
        const payables = ((payablesResult.data ?? []) as LooseRow[]).filter((row) => String(row.office_id) === officeId);
        const advances = ((advancesResult.data ?? []) as LooseRow[]).filter((row) => String(row.office_id) === officeId);
        const deductions = ((deductionsResult.data ?? []) as LooseRow[]).filter((row) => String(row.office_id) === officeId);
        const totalCollections = collections.reduce((total, row) => total + amount(row.amount_paid ?? row.amount), 0);
        const companyCommission = payables.reduce((total, row) => total + amount(row.commission_amount), 0);
        const landlordPayable = payables.reduce((total, row) => total + amount(row.net_payable), 0);
        const landlordUnpaid = payables.reduce((total, row) => total + amount(row.unpaid_balance), 0);
        const totalExpenses = expenses.reduce((total, row) => total + amount(row.amount), 0);
        const totalAdvances = advances.reduce((total, row) => total + advanceRemaining(row), 0);
        const recoveryDeductions = deductions.reduce((total, row) => total + Math.max(0, amount(row.amount) - amount(row.applied_amount)), 0);
        return {
            office: officeById.get(officeId) ?? "Office",
            totalCollections,
            companyCommission,
            landlordPayable,
            landlordUnpaid,
            expenses: totalExpenses,
            advances: totalAdvances,
            recoveryDeductions,
            profitLoss: totalCollections + companyCommission + recoveryDeductions - totalExpenses - landlordPayable - totalAdvances,
            total: filters.statementType.includes("demand") ? landlordUnpaid : totalCollections,
        };
    });
    const visibleRows = filters.statementType.includes("demand") ? rows.filter((row) => amount(row.landlordUnpaid) > 0) : rows;
    const totals = sumTotals(visibleRows, ["totalCollections", "companyCommission", "landlordPayable", "landlordUnpaid", "expenses", "advances", "recoveryDeductions", "profitLoss", "total"]);
    return {
        title: officeTitle(filters.statementType),
        description: "Live office statement from collections, landlord payables, advances, deductions, and expenses.",
        columns: officeColumns(),
        rows: visibleRows,
        totals,
        summary: {
            primaryLabel: "Statement Total",
            primaryValue: amount(totals.total),
            secondaryLabel: "Offices",
            secondaryValue: visibleRows.length,
            rowCount: visibleRows.length,
            periodLabel: period.label,
        },
    };
}

function sumTotals(rows: StatementRow[], keys: string[]) {
    return keys.reduce<StatementRow>((totals, key) => {
        totals[key] = rows.reduce((sum, row) => sum + amount(row[key]), 0);
        return totals;
    }, { label: "Totals" });
}

function landlordColumns(): StatementColumn[] {
    return [
        { key: "landlord", label: "Landlord" },
        { key: "office", label: "Office" },
        { key: "month", label: "Month" },
        { key: "netPayable", label: "Net Payable", align: "right" },
        { key: "paidAmount", label: "Paid", align: "right" },
        { key: "unpaidAmount", label: "Unpaid", align: "right" },
        { key: "advances", label: "Advances", align: "right" },
        { key: "recoveryDeductions", label: "Recovery", align: "right" },
        { key: "status", label: "Status" },
        { key: "reasons", label: "Reasons / Deductions" },
        { key: "total", label: "Total", align: "right" },
    ];
}

function tenantColumns(): StatementColumn[] {
    return [
        { key: "tenant", label: "Tenant" },
        { key: "room", label: "Room" },
        { key: "landlord", label: "Landlord" },
        { key: "office", label: "Office" },
        { key: "monthlyRent", label: "Monthly Rent", align: "right" },
        { key: "amountPaid", label: "Amount Paid", align: "right" },
        { key: "balance", label: "Balance", align: "right" },
        { key: "advanceAmount", label: "Advance", align: "right" },
        { key: "paymentDate", label: "Payment Date" },
        { key: "collector", label: "Collector" },
        { key: "paymentMethod", label: "Method" },
        { key: "total", label: "Total", align: "right" },
    ];
}

function officeColumns(): StatementColumn[] {
    return [
        { key: "office", label: "Office" },
        { key: "totalCollections", label: "Collections", align: "right" },
        { key: "companyCommission", label: "Company Commission", align: "right" },
        { key: "landlordPayable", label: "Landlord Payable", align: "right" },
        { key: "landlordUnpaid", label: "Landlord Unpaid", align: "right" },
        { key: "expenses", label: "Expenses", align: "right" },
        { key: "advances", label: "Advances", align: "right" },
        { key: "recoveryDeductions", label: "Recovery", align: "right" },
        { key: "profitLoss", label: "Profit/Loss", align: "right" },
        { key: "total", label: "Total", align: "right" },
    ];
}

function landlordTitle(type: string) {
    return ({
        individual_landlord_paid: "Individual Landlord Paid Amount",
        individual_landlord_unpaid: "Individual Landlord Unpaid Amount",
        individual_landlord_advances: "Individual Landlord Advances",
        all_landlord_paid: "All Paid Landlord Amounts",
        all_landlord_unpaid: "All Unpaid Landlord Amounts",
        all_landlord_advances: "All Landlord Advances",
        active_landlord_advances: "Active Landlord Advances",
        closed_landlord_advances: "Closed Landlord Advances",
        landlord_advances_with_interest: "Advances With Interest",
        landlord_advances_without_interest: "Advances Without Interest",
        outstanding_advance_balance: "Outstanding Advance Balance",
        expected_future_advance_deductions: "Expected Future Advance Deductions",
        landlord_advance_history: "Advance History",
        landlord_advance_interest_earned: "Interest Earned From Advances",
    } as Record<string, string>)[type] ?? "Landlord Statement";
}

function tenantTitle(type: string) {
    return ({
        individual_tenant_payments_received: "Individual Tenant Payments Received",
        individual_tenant_payments_not_received: "Individual Tenant Payments Not Received",
        all_tenant_payments_received: "All Tenant Payments Received",
        all_unpaid_tenant_payments: "All Unpaid Tenant Payments",
        all_tenants_paid_in_advance: "All Tenants Paid In Advance",
        individual_tenant_advance_payments: "Individual Tenant Advance Payments",
    } as Record<string, string>)[type] ?? "Tenant Statement";
}

function officeTitle(type: string) {
    return ({
        office_money_made: "Money Made By Each Office",
        all_offices_money_made: "Money Made By All Offices",
        office_landlord_demand: "Money Still Being Demanded From Each Office By Landlords",
        all_offices_landlord_demand: "Money Being Demanded From All Offices By Landlords",
    } as Record<string, string>)[type] ?? "Office Statement";
}
