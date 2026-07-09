import { requirePermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
    AttendanceEventRow,
    CollectionRow,
    DashboardKpis,
    DashboardLiveData,
    EmployeeRow,
    ExpenseRow,
    LandlordPaymentRow,
    LandlordRow,
    LandlordAdvanceDashboardRow,
    OfficeLeagueRow,
    OfficeRankingRow,
    OfficeRow,
    OfficeScoreRow,
    PromiseRow,
    PropertyRow,
    RiskAlert,
    RoomRow,
    TenantRentSponsorRow,
    TenantRow,
} from "./types";

type DynamicDb = {
    from: (table: string) => any;
};

type CollectionWithSource = CollectionRow & {
    payment_source?: "tenant" | "employer" | null;
};

type DashboardQueryInput = {
    startDate?: string | null;
    endDate?: string | null;
};

type LooseRow = Record<string, any> & { office_id: string | null };

const TIME_ZONE = "Africa/Kampala";
const SUPABASE_PAGE_SIZE = 1000;
const COLLECTION_COLUMNS = "id,office_id,amount,amount_paid,expected_amount,payment_source,status,paid_at,payment_date,created_at";
const PROMISE_COLUMNS = "id,office_id,status,fulfilled_at,promised_date,promise_date";
const PROPERTY_COLUMNS = "id,office_id,status";
const ROOM_COLUMNS = "id,office_id,property_id,landlord_id,monthly_rent,status";
const TENANT_COLUMNS = "id,office_id,room_id,status,balance";
const EXPENSE_COLUMNS = "id,office_id,amount,approved_at,expense_date,created_at";
const ATTENDANCE_COLUMNS = "id,office_id,employee_id,event_type,event_time";
const EMPLOYEE_COLUMNS = "id,office_id,status";
const LANDLORD_COLUMNS = "id,status,commission_rate,commission_calculation_mode,full_name";
const LANDLORD_PAYMENT_COLUMNS = "id,office_id,landlord_id,amount,status,paid_at,created_at";
const LANDLORD_ADVANCE_COLUMNS = [
    "id",
    "office_id",
    "landlord_id",
    "status",
    "lifecycle_status",
    "total_repayable",
    "advance_amount",
    "principal_amount",
    "deducted_amount",
    "remaining_total_balance",
    "remaining_balance",
    "date_given",
    "created_at",
].join(",");

function todayDate() {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date());
}

function monthStart() {
    const date = new Date();
    const year = new Intl.DateTimeFormat("en", { timeZone: TIME_ZONE, year: "numeric" }).format(date);
    const month = new Intl.DateTimeFormat("en", { timeZone: TIME_ZONE, month: "2-digit" }).format(date);
    return `${year}-${month}-01`;
}

function monthEndFromStart(startDate: string) {
    const [year, month] = startDate.split("-").map(Number);
    return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function nextMonthStartFrom(date: string) {
    const [year, month] = date.split("-").map(Number);
    return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
}

function dateOffset(days: number) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(date);
}

function isoStart(date: string) {
    return `${date}T00:00:00+03:00`;
}

function isoEnd(date: string) {
    return `${date}T23:59:59+03:00`;
}

export async function getDashboardLiveData(input: DashboardQueryInput = {}): Promise<DashboardLiveData> {
    const context = await requirePermission("reports.read");
    const supabase = createSupabaseAdminClient();
    const companyId = context.activeCompany?.id;
    if (!companyId) return emptyData();

    const today = todayDate();
    const startOfMonth = normalizeDate(input.startDate) ?? monthStart();
    const endOfPeriod = normalizeDate(input.endDate) ?? (input.startDate && !input.endDate ? monthEndFromStart(startOfMonth) : today);
    const trendStart = dateOffset(-13);
    const accessibleOfficeIds = new Set(context.offices.map((office) => office.id));
    const officeScopeIds = Array.from(accessibleOfficeIds);
    const shouldScopeOfficeQueries = !(context.canAccessAllOffices || context.isCompanyAdmin) && officeScopeIds.length > 0;
    const warnings: string[] = [];

    const [
        officesResult,
        collectionsResult,
        promisesResult,
        propertiesResult,
        roomsResult,
        tenantsResult,
        expensesResult,
        attendanceResult,
        employeesResult,
        landlordsResult,
        landlordPaymentsResult,
        companySettingsResult,
        companyScorecardResult,
        officeScoresResult,
        officeRankingsResult,
        executiveKpiResult,
        companyCashResult,
        dailyCashResult,
        rentSponsorsResult,
        landlordPayablesResult,
        landlordAdvancesResult,
        bankDepositsResult,
        officeCashMovementsResult,
        adminCashMovementsResult,
        tenantRentMonthsResult,
        rolloverRunsResult,
    ] = await Promise.all([
        applyOfficeScope(supabase.from("offices").select("*").eq("company_id", companyId).neq("status", "archived"), shouldScopeOfficeQueries, officeScopeIds, "id").order("office_name"),
        fetchPagedRows(() => applyOfficeScope(supabase.from("collections").select(COLLECTION_COLUMNS).eq("company_id", companyId).gte("payment_date", startOfMonth).lte("payment_date", endOfPeriod), shouldScopeOfficeQueries, officeScopeIds)),
        fetchPagedRows(() => applyOfficeScope(supabase.from("promises").select(PROMISE_COLUMNS).eq("company_id", companyId), shouldScopeOfficeQueries, officeScopeIds)),
        fetchPagedRows(() => applyOfficeScope(supabase.from("properties").select(PROPERTY_COLUMNS).eq("company_id", companyId).neq("status", "archived"), shouldScopeOfficeQueries, officeScopeIds)),
        fetchPagedRows(() => applyOfficeScope(supabase.from("rooms").select(ROOM_COLUMNS).eq("company_id", companyId), shouldScopeOfficeQueries, officeScopeIds)),
        fetchPagedRows(() => applyOfficeScope(supabase.from("tenants").select(TENANT_COLUMNS).eq("company_id", companyId), shouldScopeOfficeQueries, officeScopeIds)),
        fetchPagedRows(() => applyOfficeScope(supabase.from("expenses").select(EXPENSE_COLUMNS).eq("company_id", companyId).gte("expense_date", startOfMonth).lte("expense_date", endOfPeriod), shouldScopeOfficeQueries, officeScopeIds)),
        fetchPagedRows(() => applyOfficeScope(supabase.from("attendance_events").select(ATTENDANCE_COLUMNS).eq("company_id", companyId).gte("event_time", isoStart(trendStart)).lte("event_time", isoEnd(today)), shouldScopeOfficeQueries, officeScopeIds)),
        fetchPagedRows(() => applyOfficeScope(supabase.from("employees").select(EMPLOYEE_COLUMNS).eq("company_id", companyId).neq("status", "archived"), shouldScopeOfficeQueries, officeScopeIds)),
        fetchPagedRows(() => supabase.from("landlords").select(LANDLORD_COLUMNS).eq("company_id", companyId).neq("status", "archived")),
        fetchPagedRows(() => applyOfficeScope(supabase.from("landlord_payments").select(LANDLORD_PAYMENT_COLUMNS).eq("company_id", companyId).gte("paid_at", isoStart(startOfMonth)).lte("paid_at", isoEnd(endOfPeriod)), shouldScopeOfficeQueries, officeScopeIds)),
        supabase.from("company_settings").select("*").eq("company_id", companyId).eq("key", "default_landlord_commission_rate"),
        supabase.from("company_scorecards").select("*").eq("company_id", companyId).order("score_date", { ascending: false }).limit(1).maybeSingle(),
        applyOfficeScope(supabase.from("office_scores").select("*").eq("company_id", companyId), shouldScopeOfficeQueries, officeScopeIds).order("score_date", { ascending: false, nullsFirst: false }),
        applyOfficeScope(supabase.from("office_rankings").select("*").eq("company_id", companyId), shouldScopeOfficeQueries, officeScopeIds).order("ranking_date", { ascending: false }).order("rank"),
        supabase.from("executive_kpi_snapshots").select("*").eq("company_id", companyId).order("snapshot_date", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("company_cash_positions").select("*").eq("company_id", companyId).order("position_date", { ascending: false }).limit(1).maybeSingle(),
        fetchPagedRows(() => applyOfficeScope(supabase.from("daily_cash_positions").select("office_id,closing_cash").eq("company_id", companyId).gte("position_date", startOfMonth).lte("position_date", endOfPeriod), shouldScopeOfficeQueries, officeScopeIds)),
        fetchPagedRows(() => applyOfficeScope((supabase as unknown as DynamicDb).from("tenant_rent_sponsors").select("office_id,covered_amount,tenant_top_up_amount,status").eq("company_id", companyId).eq("status", "active"), shouldScopeOfficeQueries, officeScopeIds)),
        fetchPagedRows(() => applyOfficeScope((supabase as unknown as DynamicDb).from("landlord_monthly_payables").select("office_id,landlord_id,unpaid_balance,net_payable,status").eq("company_id", companyId).neq("status", "archived"), shouldScopeOfficeQueries, officeScopeIds)),
        fetchPagedRows(() => applyOfficeScope((supabase as unknown as DynamicDb).from("landlord_advances").select(LANDLORD_ADVANCE_COLUMNS).eq("company_id", companyId), shouldScopeOfficeQueries, officeScopeIds)),
        fetchPagedRows(() => applyOfficeScope((supabase as unknown as DynamicDb).from("bank_deposits").select("office_id,amount").eq("company_id", companyId).gte("deposit_date", startOfMonth).lte("deposit_date", endOfPeriod), shouldScopeOfficeQueries, officeScopeIds)),
        fetchPagedRows(() => applyOfficeScope((supabase as unknown as DynamicDb).from("office_cash_movements").select("office_id,amount,movement_type,source_type").eq("company_id", companyId).gte("movement_date", startOfMonth).lte("movement_date", endOfPeriod), shouldScopeOfficeQueries, officeScopeIds)),
        fetchPagedRows(() => applyOfficeScope((supabase as unknown as DynamicDb).from("admin_cash_movements").select("office_id,amount,movement_type,source").eq("company_id", companyId).gte("movement_date", startOfMonth).lte("movement_date", endOfPeriod), shouldScopeOfficeQueries, officeScopeIds)),
        fetchPagedRows(() => applyOfficeScope((supabase as unknown as DynamicDb).from("tenant_rent_months").select("office_id,rent_month").eq("company_id", companyId).eq("rent_month", monthStart()), shouldScopeOfficeQueries, officeScopeIds)),
        fetchPagedRows(() => applyOfficeScope((supabase as unknown as DynamicDb).from("monthly_rollover_runs").select("office_id,rent_month,completed_at,created_at,status,failed_records").eq("company_id", companyId), shouldScopeOfficeQueries, officeScopeIds).order("created_at", { ascending: false }).limit(25)),
    ]);

    for (const [label, result] of [
        ["offices", officesResult],
        ["collections", collectionsResult],
        ["promises", promisesResult],
        ["properties", propertiesResult],
        ["rooms", roomsResult],
        ["tenants", tenantsResult],
        ["expenses", expensesResult],
        ["attendance", attendanceResult],
        ["employees", employeesResult],
        ["landlords", landlordsResult],
        ["landlord payments", landlordPaymentsResult],
        ["company settings", companySettingsResult],
        ["office scores", officeScoresResult],
        ["office rankings", officeRankingsResult],
        ["daily cash positions", dailyCashResult],
        ["rent sponsors", rentSponsorsResult],
        ["landlord payables", landlordPayablesResult],
        ["landlord advances", landlordAdvancesResult],
        ["bank deposits", bankDepositsResult],
        ["office cash movements", officeCashMovementsResult],
        ["admin cash movements", adminCashMovementsResult],
        ["tenant rent months", tenantRentMonthsResult],
        ["monthly rollover runs", rolloverRunsResult],
    ] as const) {
        if (result.error) warnings.push(`${label}: ${result.error.message}`);
    }
    for (const [label, result] of [
        ["company scorecard", companyScorecardResult],
        ["executive KPI", executiveKpiResult],
        ["company cash position", companyCashResult],
    ] as const) {
        if (result.error) warnings.push(`${label}: ${result.error.message}`);
    }
    if (officesResult.error) throw new Error(officesResult.error.message);

    const allProperties = propertiesResult.data ?? [];
    const allLandlords = landlordsResult.data ?? [];
    const propertyById = new Map(allProperties.map((property) => [property.id, property]));
    const landlordByIdForScope = new Map(allLandlords.map((landlord) => [landlord.id, landlord]));
    const offices = (officesResult.data ?? []).filter((office) => context.canAccessAllOffices || accessibleOfficeIds.has(office.id));
    const officeIds = new Set(offices.map((office) => office.id));
    const collections = filterByOffice(collectionsResult.data ?? [], officeIds);
    const promises = filterByOffice(promisesResult.data ?? [], officeIds);
    const properties = filterByOffice(allProperties, officeIds);
    const rooms = filterRoomsByResolvedOffice(roomsResult.data ?? [], propertyById, landlordByIdForScope, officeIds);
    const tenants = filterTenantsByResolvedOffice(tenantsResult.data ?? [], roomsResult.data ?? [], officeIds);
    const expenses = filterByOffice(expensesResult.data ?? [], officeIds);
    const attendanceEvents = filterByOffice(attendanceResult.data ?? [], officeIds);
    const employees = filterByOffice(employeesResult.data ?? [], officeIds);
    const landlords = allLandlords;
    const landlordPayments = filterByOffice(landlordPaymentsResult.data ?? [], officeIds);
    const officeScores = filterNullableOffice(officeScoresResult.data ?? [], officeIds);
    const officeRankings = filterByOffice(officeRankingsResult.data ?? [], officeIds);
    const dailyCashPositions = filterByOffice(dailyCashResult.data ?? [], officeIds);
    const rentSponsors = filterNullableOffice((rentSponsorsResult.data ?? []) as TenantRentSponsorRow[], officeIds);
    const landlordPayables = filterByOffice((landlordPayablesResult.data ?? []) as Array<{ office_id: string | null; landlord_id: string; unpaid_balance: number | string; net_payable: number | string }>, officeIds);
    const landlordAdvances = filterByOffice((landlordAdvancesResult.data ?? []) as LooseRow[], officeIds);
    const bankDeposits = filterByOffice((bankDepositsResult.data ?? []) as LooseRow[], officeIds);
    const officeCashMovements = filterByOffice((officeCashMovementsResult.data ?? []) as LooseRow[], officeIds);
    const adminCashMovements = filterByOffice((adminCashMovementsResult.data ?? []) as LooseRow[], officeIds);
    const tenantRentMonths = filterByOffice((tenantRentMonthsResult.data ?? []) as LooseRow[], officeIds);
    const rolloverRuns = filterRolloverRuns((rolloverRunsResult.data ?? []) as LooseRow[], officeIds, context.canAccessAllOffices || context.isCompanyAdmin);

    const league = buildLeague({
        offices,
        collections,
        promises,
        properties,
        rooms,
        tenants,
        expenses,
        attendanceEvents,
        employees,
        officeScores,
        officeRankings,
    });
    const kpis = buildKpis({
        collections,
        promises,
        rooms,
        tenants,
        expenses,
        attendanceEvents,
        employees,
        league,
        companyCashPosition: companyCashResult.data?.total_position ?? null,
        dailyCashPositions,
    });

    return {
        company: context.activeCompany,
        activeOffice: context.activeOffice,
        offices,
        isAdmin: context.canAccessAllOffices || context.isCompanyAdmin,
        period: {
            label: `${startOfMonth} to ${endOfPeriod}`,
            startDate: startOfMonth,
            endDate: endOfPeriod,
        },
        lastSyncedAt: new Date().toISOString(),
        warnings,
        kpis,
        league,
        riskAlerts: buildRiskAlerts(league, promises, rooms),
        actions: buildActions(promises, expenses, league),
        rentCalendar: buildRentCalendar({
            canRunRollover: context.isCompanyAdmin && !context.isOfficeMode,
            rentMonths: tenantRentMonths,
            runs: rolloverRuns,
            today,
        }),
        finance: buildFinanceSummary({
            rooms,
            tenants,
            collections,
            expenses,
            landlords,
            landlordPayments,
            landlordAdvances,
            bankDeposits,
            officeCashMovements,
            adminCashMovements,
            rentSponsors,
            landlordPayables,
            defaultCommissionRate: parseCommissionSetting(companySettingsResult.data?.[0]?.value, 10),
        }),
        snapshots: {
            companyScorecard: companyScorecardResult.data ?? null,
            executiveKpi: executiveKpiResult.data ?? null,
            companyCashPosition: companyCashResult.data ?? null,
            dailyCashPositions,
        },
    };
}

function normalizeDate(value: string | null | undefined) {
    if (!value) return null;
    const match = value.match(/^\d{4}-\d{2}-\d{2}$/);
    return match ? value : null;
}

async function fetchPagedRows<T = any>(buildQuery: () => any): Promise<{ data: T[]; error: any }> {
    const rows: T[] = [];
    for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
        const to = from + SUPABASE_PAGE_SIZE - 1;
        const { data, error } = await buildQuery().range(from, to);
        if (error) return { data: rows, error };
        const page = (data ?? []) as T[];
        rows.push(...page);
        if (page.length < SUPABASE_PAGE_SIZE) return { data: rows, error: null };
    }
}

function applyOfficeScope<T extends { in: (column: string, values: string[]) => T }>(
    query: T,
    shouldScope: boolean,
    officeIds: string[],
    column = "office_id",
) {
    return shouldScope ? query.in(column, officeIds) : query;
}

function filterByOffice<T extends { office_id: string | null }>(rows: T[], officeIds: Set<string>) {
    return rows.filter((row) => row.office_id && officeIds.has(row.office_id));
}

function filterNullableOffice<T extends { office_id: string | null }>(rows: T[], officeIds: Set<string>) {
    return rows.filter((row) => row.office_id && officeIds.has(row.office_id));
}

function filterRolloverRuns<T extends { office_id: string | null }>(rows: T[], officeIds: Set<string>, isAdmin: boolean) {
    if (isAdmin) return rows;
    return rows.filter((row) => row.office_id && officeIds.has(row.office_id));
}

function failedRecordCount(value: unknown) {
    if (Array.isArray(value)) return value.length;
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value) as unknown;
            return Array.isArray(parsed) ? parsed.length : 0;
        } catch {
            return 0;
        }
    }
    return 0;
}

function buildRentCalendar({
    canRunRollover,
    rentMonths,
    runs,
    today,
}: {
    canRunRollover: boolean;
    rentMonths: LooseRow[];
    runs: LooseRow[];
    today: string;
}): DashboardLiveData["rentCalendar"] {
    const currentRentMonth = monthStart();
    const currentMonthRuns = runs.filter((run) => String(run.rent_month ?? "").slice(0, 10) === currentRentMonth);
    const lastRun = currentMonthRuns[0] ?? runs[0] ?? null;
    return {
        canRunRollover,
        currentBusinessDate: today,
        currentRentMonth,
        failedRecordCount: failedRecordCount(lastRun?.failed_records),
        lastRunAt: typeof lastRun?.completed_at === "string" ? lastRun.completed_at : typeof lastRun?.created_at === "string" ? lastRun.created_at : null,
        lastRunStatus: typeof lastRun?.status === "string" ? lastRun.status : null,
        nextRolloverDate: nextMonthStartFrom(today),
        tenantsChargedThisMonth: rentMonths.length,
    };
}

function filterTenantsByResolvedOffice(
    tenants: TenantRow[],
    rooms: RoomRow[],
    officeIds: Set<string>,
) {
    const roomById = new Map(rooms.map((room) => [room.id, room]));
    return tenants.filter((tenant) => {
        if (tenant.status === "import_review") return false;
        const room = tenant.room_id ? roomById.get(tenant.room_id) ?? null : null;
        const resolvedOfficeId = tenant.office_id ?? room?.office_id ?? null;
        return Boolean(resolvedOfficeId && officeIds.has(resolvedOfficeId));
    });
}

function filterRoomsByResolvedOffice(
    rooms: RoomRow[],
    propertyById: Map<string, PropertyRow>,
    landlordById: Map<string, LandlordRow>,
    officeIds: Set<string>,
) {
    return rooms.filter((room) => {
        if (isArchivedRoom(room)) return false;
        const property = room.property_id ? propertyById.get(room.property_id) ?? null : null;
        const landlord = room.landlord_id ? landlordById.get(room.landlord_id) as (LandlordRow & { office_id?: string | null }) | undefined ?? null : null;
        const officeId = room.office_id ?? property?.office_id ?? landlord?.office_id ?? null;
        return Boolean(officeId && officeIds.has(officeId));
    });
}

function isArchivedRoom(room: RoomRow) {
    return ["archived", "deleted", "removed", "inactive"].some((status) => normalizeStatus(room.status).includes(status));
}

function buildLeague(input: {
    offices: OfficeRow[];
    collections: CollectionRow[];
    promises: PromiseRow[];
    properties: PropertyRow[];
    rooms: RoomRow[];
    tenants: TenantRow[];
    expenses: ExpenseRow[];
    attendanceEvents: AttendanceEventRow[];
    employees: EmployeeRow[];
    officeScores: OfficeScoreRow[];
    officeRankings: OfficeRankingRow[];
}): OfficeLeagueRow[] {
    const latestScoreByOffice = latestByOffice(input.officeScores, "score_date");
    const latestRankingByOffice = latestByOffice(input.officeRankings, "ranking_date");
    const rows = input.offices.map((office) => {
        const collections = input.collections.filter((item) => item.office_id === office.id);
        const promises = input.promises.filter((item) => item.office_id === office.id);
        const rooms = input.rooms.filter((item) => item.office_id === office.id);
        const expenses = input.expenses.filter((item) => item.office_id === office.id);
        const employees = input.employees.filter((item) => item.office_id === office.id);
        const attendanceEvents = input.attendanceEvents.filter((item) => item.office_id === office.id);
        const collectionTarget = Number(office.collection_target ?? collections.reduce((total, item) => total + amount(item.expected_amount ?? item.amount), 0));
        const collectionValue = sumCollections(collections);
        const collectionsVsTarget = percent(collectionValue, collectionTarget || collectionValue);
        const promiseRecovery = percent(promises.filter(isFulfilledPromise).length, promises.length);
        const occupancy = percent(rooms.filter(isOccupiedRoom).length, rooms.length);
        const attendance = attendanceRate(attendanceEvents.filter((event) => sameDay(event.event_time, todayDate())), employees);
        const expenseValue = sumExpenses(expenses);
        const expenseBudget = Number(office.expense_budget ?? 0);
        const expenseControl = expenseBudget ? Math.max(0, Math.min(100, Math.round(((expenseBudget - expenseValue) / expenseBudget) * 100))) : expenseValue ? 65 : 100;
        const formulaScore = Math.round(collectionsVsTarget * 0.3 + promiseRecovery * 0.2 + occupancy * 0.2 + attendance * 0.2 + expenseControl * 0.1);
        const storedScore = latestScoreByOffice.get(office.id)?.overall_score ?? latestScoreByOffice.get(office.id)?.total_score ?? latestRankingByOffice.get(office.id)?.total_score ?? null;

        return {
            officeId: office.id,
            officeName: office.office_name ?? office.name ?? "Office",
            rank: 0,
            officeScore: formulaScore,
            collections: collectionValue,
            collectionTarget,
            collectionsVsTarget,
            promiseRecovery,
            occupancy,
            attendance,
            expenses: expenseValue,
            expenseControl,
            trend: scoreTrend(collections),
            status: scoreStatus(formulaScore),
            storedScore,
            storedRank: latestRankingByOffice.get(office.id)?.rank ?? null,
        };
    });

    return rows
        .sort((a, b) => b.officeScore - a.officeScore)
        .map((row, index) => ({ ...row, rank: index + 1 }));
}

function buildKpis(input: {
    collections: CollectionRow[];
    promises: PromiseRow[];
    rooms: RoomRow[];
    tenants: TenantRow[];
    expenses: ExpenseRow[];
    attendanceEvents: AttendanceEventRow[];
    employees: EmployeeRow[];
    league: OfficeLeagueRow[];
    companyCashPosition: number | null;
    dailyCashPositions: Array<{ closing_cash: number }>;
}): DashboardKpis {
    const today = todayDate();
    const todayCollections = sumCollections(input.collections.filter((item) => sameDay(item.paid_at, today)));
    const monthCollections = sumCollections(input.collections);
    const expenses = sumExpenses(input.expenses);
    const derivedCash = input.dailyCashPositions.reduce((total, position) => total + Number(position.closing_cash ?? 0), 0);

    return {
        companyCashPosition: Number(input.companyCashPosition ?? derivedCash ?? monthCollections - expenses),
        todayCollections,
        monthCollections,
        expenses,
        netPosition: monthCollections - expenses,
        occupancyRate: percent(input.rooms.filter(isOccupiedRoom).length, input.rooms.length),
        attendanceRate: attendanceRate(input.attendanceEvents.filter((event) => sameDay(event.event_time, today)), input.employees),
        promiseRecovery: percent(input.promises.filter(isFulfilledPromise).length, input.promises.length),
        officeScore: input.league.length ? Math.round(input.league.reduce((sum, office) => sum + office.officeScore, 0) / input.league.length) : 0,
    };
}

function buildRiskAlerts(league: OfficeLeagueRow[], promises: PromiseRow[], rooms: RoomRow[]): RiskAlert[] {
    const overduePromises = promises.filter((promise) => {
        const dueDate = promise.promised_date ?? promise.promise_date;
        return dueDate && dueDate < todayDate() && !isFulfilledPromise(promise);
    }).length;
    const vacantRooms = rooms.filter((room) => !isOccupiedRoom(room)).length;
    const weakOffices = league.filter((office) => office.officeScore < 60);

    return [
        ...weakOffices.slice(0, 3).map((office) => ({
            id: `office-${office.officeId}`,
            title: `${office.officeName} needs executive attention`,
            description: `Office score is ${office.officeScore} with ${office.collectionsVsTarget}% collections target achievement.`,
            severity: "critical" as const,
            officeName: office.officeName,
        })),
        ...(overduePromises ? [{
            id: "overdue-promises",
            title: "Overdue promises require recovery action",
            description: `${overduePromises} promises are past due and still open.`,
            severity: "warning" as const,
        }] : []),
        ...(vacantRooms ? [{
            id: "vacant-rooms",
            title: "Vacancy exposure detected",
            description: `${vacantRooms} rooms are not currently occupied.`,
            severity: "info" as const,
        }] : []),
    ];
}

function buildActions(promises: PromiseRow[], expenses: ExpenseRow[], league: OfficeLeagueRow[]) {
    const dueToday = promises.filter((promise) => (promise.promised_date ?? promise.promise_date) === todayDate() && !isFulfilledPromise(promise)).length;
    const unapprovedExpenses = expenses.filter((expense) => !expense.approved_at).length;
    const officesAtRisk = league.filter((office) => office.status === "risk" || office.status === "watch").length;

    return [
        { id: "promise-follow-up", title: "Promise follow-up", description: "Promises due today need collector action.", count: dueToday, priority: dueToday ? "high" as const : "normal" as const },
        { id: "expense-review", title: "Expense review", description: "Unapproved expenses are waiting for finance review.", count: unapprovedExpenses, priority: unapprovedExpenses ? "medium" as const : "normal" as const },
        { id: "office-score-review", title: "Office score review", description: "Offices below strong performance threshold need coaching.", count: officesAtRisk, priority: officesAtRisk ? "high" as const : "normal" as const },
    ];
}

function buildFinanceSummary(input: {
    rooms: RoomRow[];
    tenants: TenantRow[];
    collections: CollectionRow[];
    expenses: ExpenseRow[];
    landlords: LandlordRow[];
    landlordPayments: LandlordPaymentRow[];
    landlordAdvances: LooseRow[];
    bankDeposits: LooseRow[];
    officeCashMovements: LooseRow[];
    adminCashMovements: LooseRow[];
    rentSponsors: TenantRentSponsorRow[];
    landlordPayables: Array<{ landlord_id: string; unpaid_balance: number | string; net_payable: number | string }>;
    defaultCommissionRate: number;
}): DashboardLiveData["finance"] {
    const landlordById = new Map(input.landlords.map((landlord) => [landlord.id, landlord]));
    const expectedRentRoll = input.rooms.reduce((total, room) => total + amount(room.monthly_rent), 0);
    const landlordFinance = calculateLandlordFinanceForRooms({
        rooms: input.rooms,
        landlordById,
        defaultCommissionRate: input.defaultCommissionRate,
    });
    const expectedCompanyCommissionProfit = landlordFinance.companyCommission;
    const expectedLandlordPayable = landlordFinance.landlordPayable;
    const occupiedRooms = input.rooms.filter(isOccupiedRoom).length;
    const vacantRooms = input.rooms.filter(isVacantRoom).length;
    const vacantDeductions = landlordFinance.vacantDeductions;
    const activeCollections = input.collections.filter(isActiveFinancialRow);
    const approvedExpenses = input.expenses.filter(isApprovedExpense);
    const activeLandlordPayments = input.landlordPayments.filter(isActiveFinancialRow);
    const collectedSoFarThisMonth = sumCollections(activeCollections);
    const expenses = sumExpenses(approvedExpenses);
    const landlordPaymentsMade = activeLandlordPayments.reduce((total, payment) => total + amount(payment.amount), 0);
    const landlordsPaid = new Set(activeLandlordPayments.map((payment) => payment.landlord_id).filter(Boolean)).size;
    const employerContributionsExpected = input.rentSponsors.reduce((total, sponsor) => total + amount(sponsor.covered_amount), 0);
    const tenantTopUpsExpected = input.rentSponsors.reduce((total, sponsor) => total + amount(sponsor.tenant_top_up_amount), 0);
    const employerContributionsReceived = (activeCollections as CollectionWithSource[])
        .filter((collection) => collection.payment_source === "employer")
        .reduce((total, collection) => total + amount(collection.amount_paid ?? collection.amount), 0);
    const tenantTopUpsCollected = (activeCollections as CollectionWithSource[])
        .filter((collection) => collection.payment_source !== "employer")
        .reduce((total, collection) => total + amount(collection.amount_paid ?? collection.amount), 0);
    const pendingLandlordPayments = Math.max(0, expectedLandlordPayable - landlordPaymentsMade);
    const activeTenantRoomIds = new Set(input.tenants.map((tenant) => tenant.room_id).filter(Boolean));
    const outstandingTenantBalances = input.tenants.reduce((total, tenant) => total + amount(tenant.balance), 0) +
        input.rooms
            .filter((room) => !activeTenantRoomIds.has(room.id))
            .reduce((total, room) => total + amount(room.outstanding_balance), 0);
    const todayCollections = sumCollections(activeCollections.filter((collection) => sameDay(collectionBusinessDate(collection), todayDate())));
    const todayExpenses = sumExpenses(approvedExpenses.filter((expense) => sameDay(expense.expense_date ?? expense.created_at, todayDate())));
    const todayLandlordPayments = activeLandlordPayments
        .filter((payment) => sameDay(payment.paid_at ?? payment.created_at, todayDate()))
        .reduce((total, payment) => total + amount(payment.amount), 0);
    const ledgerMoneyHeldForLandlords = input.landlordPayables.reduce((total, payable) => total + amount(payable.unpaid_balance), 0);
    const ledgerLandlordPayables = input.landlordPayables.reduce((total, payable) => total + amount(payable.net_payable), 0);
    const paidByLandlord = new Map<string, number>();
    for (const payment of activeLandlordPayments) {
        if (!payment.landlord_id) continue;
        paidByLandlord.set(payment.landlord_id, (paidByLandlord.get(payment.landlord_id) ?? 0) + amount(payment.amount));
    }
    const liveUnpaidLandlordRows = landlordFinance.byLandlord.filter((row) => row.landlordId && Math.max(0, row.landlordPayable - (paidByLandlord.get(row.landlordId) ?? 0)) > 0);
    const unpaidLandlords = liveUnpaidLandlordRows.length;
    const totalAmountNotPaidToLandlords = liveUnpaidLandlordRows.reduce((total, row) => {
        const landlordId = row.landlordId;
        return total + Math.max(0, row.landlordPayable - (landlordId ? paidByLandlord.get(landlordId) ?? 0 : 0));
    }, 0);
    const activeAdvances = input.landlordAdvances.filter(isActiveLandlordAdvance);
    const pendingAdvances = input.landlordAdvances.filter((advance) => normalizeStatus(advance.status) === "pending");
    const landlordAdvanceRows = buildLandlordAdvanceRows(activeAdvances, landlordById);
    const landlordAdvancesGiven = activeAdvances.reduce((total, advance) => total + advanceTotalAmount(advance), 0);
    const landlordAdvanceRecovered = activeAdvances.reduce((total, advance) => total + amount(advance.deducted_amount ?? advance.amount_repaid ?? advance.recovered_amount), 0);
    const landlordAdvanceActiveBalance = activeAdvances.reduce((total, advance) => total + advanceRemainingAmount(advance), 0);
    const amountBanked = input.bankDeposits.filter(isActiveFinancialRow).reduce((total, row) => total + amount(row.amount), 0);
    const amountSentFromOfficeToBank = input.officeCashMovements
        .filter((row) => String(row.movement_type ?? row.source_type ?? "").toLowerCase().includes("bank"))
        .reduce((total, row) => total + amount(row.amount), 0) || amountBanked;
    const amountGivenToOfficeByAdmin = input.adminCashMovements
        .filter((row) => ["money_sent_to_office", "admin_float", "office_float"].includes(String(row.movement_type ?? row.source ?? row.source_type ?? "").toLowerCase()))
        .reduce((total, row) => total + amount(row.amount), 0);
    const amountAtOffice = collectedSoFarThisMonth + amountGivenToOfficeByAdmin - expenses - amountSentFromOfficeToBank - landlordPaymentsMade;

    return {
        expectedRentRoll,
        expectedLandlordPayable,
        expectedCompanyCommissionProfit,
        collectedSoFarThisMonth,
        landlordsPaid,
        landlordPaymentsMade,
        pendingLandlordPayments,
        landlordsNotPaid: unpaidLandlords,
        totalAmountNotPaidToLandlords,
        outstandingTenantBalances,
        approvedExpenses: expenses,
        pendingExpenses: input.expenses.filter((expense) => !isApprovedExpense(expense)).reduce((total, expense) => total + amount(expense.amount), 0),
        amountAtOffice,
        amountBanked,
        amountGivenToOfficeByAdmin,
        amountSentFromOfficeToBank,
        landlordAdvancesGiven,
        landlordAdvanceActiveBalance,
        landlordAdvanceRecovered,
        landlordAdvancePendingApprovals: pendingAdvances.reduce((total, advance) => total + advanceTotalAmount(advance), 0),
        landlordAdvanceRows,
        occupiedRooms,
        vacantRooms,
        vacantDeductions,
        employerContributionsExpected,
        employerContributionsReceived,
        tenantTopUpsExpected,
        tenantTopUpsCollected,
        tenantTopUpsStillToCollect: Math.max(0, tenantTopUpsExpected - tenantTopUpsCollected),
        officeLandlordPayables: expectedLandlordPayable,
        unpaidLandlords,
        totalMoneyHeldForLandlords: totalAmountNotPaidToLandlords || ledgerMoneyHeldForLandlords,
        reconciliation: {
            dashboardRentRoll: expectedRentRoll,
            liveRoomRentRoll: expectedRentRoll,
            dashboardCommission: expectedCompanyCommissionProfit,
            liveLandlordCommission: expectedCompanyCommissionProfit,
            dashboardLandlordPayable: expectedLandlordPayable,
            liveLandlordNetPayable: expectedLandlordPayable,
            ledgerLandlordPayable: ledgerLandlordPayables,
            rentRollDifference: 0,
            commissionDifference: 0,
            payableDifference: expectedLandlordPayable - ledgerLandlordPayables,
            missingLandlordCount: landlordFinance.byLandlord.filter((row) => row.landlordId && !input.landlordPayables.some((payable) => payable.landlord_id === row.landlordId)).length,
            missingRoomCount: 0,
        },
        profitLossToday: todayCollections - todayExpenses - todayLandlordPayments,
        profitLossThisMonth: expectedCompanyCommissionProfit - expenses - landlordAdvanceActiveBalance,
        collectionProgress: percent(collectedSoFarThisMonth, expectedRentRoll),
    };
}

function latestByOffice<T extends { office_id: string | null }>(rows: T[], dateKey: keyof T) {
    const map = new Map<string, T>();
    for (const row of rows) {
        if (!row.office_id) continue;
        const existing = map.get(row.office_id);
        if (!existing || String(row[dateKey] ?? "") > String(existing[dateKey] ?? "")) {
            map.set(row.office_id, row);
        }
    }
    return map;
}

function sumCollections(collections: CollectionRow[]) {
    return collections.filter(isActiveFinancialRow).reduce((total, collection) => total + amount(collection.amount_paid ?? collection.amount), 0);
}

function sumExpenses(expenses: ExpenseRow[]) {
    return expenses.filter(isApprovedExpense).reduce((total, expense) => total + amount(expense.amount), 0);
}

function amount(value: unknown) {
    return Number(value ?? 0);
}

function percent(numerator: number, denominator: number) {
    if (!denominator) return 0;
    return Math.max(0, Math.min(100, Math.round((numerator / denominator) * 100)));
}

function isFulfilledPromise(promise: PromiseRow) {
    const status = (promise.status ?? "").toLowerCase();
    return Boolean(promise.fulfilled_at) || status === "fulfilled" || status === "paid";
}

function isOccupiedRoom(room: RoomRow) {
    return (room.status ?? "").toLowerCase().includes("occupied");
}

function attendanceRate(events: AttendanceEventRow[], employees: EmployeeRow[]) {
    const activeEmployees = employees.filter((employee) => !["terminated", "inactive", "archived"].includes((employee.status ?? "").toLowerCase()));
    const checkedIn = new Set(events.filter((event) => event.event_type === "check_in").map((event) => event.employee_id));
    return percent(checkedIn.size, activeEmployees.length);
}

function sameDay(value: string | null, day: string) {
    return value ? value.slice(0, 10) === day : false;
}

function collectionBusinessDate(collection: CollectionRow) {
    return String((collection as CollectionRow & { payment_date?: string | null }).payment_date ?? collection.paid_at ?? collection.created_at ?? "");
}

function normalizeStatus(value: unknown) {
    return String(value ?? "").trim().toLowerCase();
}

function isActiveFinancialRow(row: Record<string, any>) {
    const status = normalizeStatus(row.status || "active");
    return !["voided", "removed", "removed_by_admin_approval", "rejected", "pending", "cancelled", "canceled", "archived", "deleted"].includes(status);
}

function isApprovedExpense(expense: ExpenseRow) {
    const status = normalizeStatus((expense as ExpenseRow & { status?: string | null }).status);
    if (["pending", "rejected", "voided", "cancelled", "canceled", "archived", "deleted"].includes(status)) return false;
    return Boolean(expense.approved_at) || status === "" || status === "approved" || status === "active" || status === "recorded";
}

function isActiveLandlordAdvance(advance: LooseRow) {
    const status = normalizeStatus(advance.status);
    const lifecycle = normalizeStatus(advance.lifecycle_status);
    if (["pending", "rejected", "cancelled", "canceled", "archived", "voided"].includes(status)) return false;
    if (["cleared", "cancelled", "canceled", "archived"].includes(lifecycle)) return false;
    return status === "approved" || status === "partially_deducted" || status === "active" || lifecycle === "active" || lifecycle === "paused";
}

function advanceTotalAmount(advance: LooseRow) {
    return amount(advance.total_repayable ?? advance.advance_amount ?? advance.principal_amount ?? advance.amount);
}

function advanceRemainingAmount(advance: LooseRow) {
    const explicit = amount(advance.remaining_total_balance ?? advance.remaining_balance ?? advance.balance_remaining);
    if (explicit > 0) return explicit;
    return Math.max(0, advanceTotalAmount(advance) - amount(advance.deducted_amount ?? advance.amount_repaid ?? advance.recovered_amount));
}

function buildLandlordAdvanceRows(advances: LooseRow[], landlordById: Map<string, LandlordRow>): LandlordAdvanceDashboardRow[] {
    return advances
        .map((advance) => {
            const landlordId = typeof advance.landlord_id === "string" ? advance.landlord_id : null;
            const landlord = landlordId ? landlordById.get(landlordId) ?? null : null;
            const landlordDisplay = landlord as (LandlordRow & { full_name?: string | null }) | null;
            return {
                id: String(advance.id ?? `${landlordId ?? "advance"}-${advance.date_given ?? advance.created_at ?? ""}`),
                landlordId,
                landlordName: String(landlordDisplay?.full_name ?? "Landlord"),
                officeName: String(advance.office_name ?? "Office"),
                amountGiven: advanceTotalAmount(advance),
                activeBalance: advanceRemainingAmount(advance),
                recoveredAmount: amount(advance.deducted_amount ?? advance.amount_repaid ?? advance.recovered_amount),
                dateGiven: advance.date_given ? String(advance.date_given).slice(0, 10) : null,
                status: String(advance.lifecycle_status ?? advance.status ?? "active"),
            };
        })
        .sort((a, b) => b.activeBalance - a.activeBalance)
        .slice(0, 8);
}

function parseCommissionSetting(value: unknown, fallback: number) {
    if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
    if (typeof value === "string") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }
    if (value && typeof value === "object" && "rate" in value) {
        const parsed = Number((value as { rate?: unknown }).rate);
        return Number.isFinite(parsed) ? parsed : fallback;
    }
    return fallback;
}

function commissionRate(landlord: LandlordRow | null, fallback: number) {
    const rate = Number((landlord as (LandlordRow & { commission_rate?: number | string | null }) | null)?.commission_rate ?? NaN);
    return Number.isFinite(rate) ? rate : fallback;
}

function calculateLandlordFinanceForRooms(input: {
    rooms: RoomRow[];
    landlordById: Map<string, LandlordRow>;
    defaultCommissionRate: number;
}) {
    const roomsByLandlord = new Map<string, RoomRow[]>();
    for (const room of input.rooms) {
        const key = room.landlord_id ?? `unassigned:${room.id}`;
        const group = roomsByLandlord.get(key) ?? [];
        group.push(room);
        roomsByLandlord.set(key, group);
    }

    let companyCommission = 0;
    let landlordPayable = 0;
    let vacantDeductions = 0;
    const byLandlord: Array<{
        landlordId: string | null;
        rentRoll: number;
        companyCommission: number;
        landlordPayable: number;
        vacantDeductions: number;
        occupiedRooms: number;
        vacantRooms: number;
    }> = [];
    for (const [landlordId, rooms] of roomsByLandlord.entries()) {
        const landlord = landlordId.startsWith("unassigned:") ? null : input.landlordById.get(landlordId) ?? null;
        const gross = rooms.reduce((total, room) => total + amount(room.monthly_rent), 0);
        const vacantDeduction = rooms.filter(isVacantRoom).reduce((total, room) => total + amount(room.monthly_rent), 0);
        const occupiedPayableRent = Math.max(0, gross - vacantDeduction);
        const rate = commissionRate(landlord, input.defaultCommissionRate);
        const mode = commissionCalculationMode(landlord);
        const commissionBase = mode === "occupied_room_based" ? occupiedPayableRent : gross;
        const commission = Math.round(commissionBase * rate / 100);

        companyCommission += commission;
        const payable = mode === "occupied_room_based"
            ? Math.max(0, occupiedPayableRent - commission)
            : Math.max(0, gross - commission - vacantDeduction);
        landlordPayable += payable;
        vacantDeductions += vacantDeduction;
        byLandlord.push({
            landlordId: landlordId.startsWith("unassigned:") ? null : landlordId,
            rentRoll: gross,
            companyCommission: commission,
            landlordPayable: payable,
            vacantDeductions: vacantDeduction,
            occupiedRooms: rooms.filter(isOccupiedRoom).length,
            vacantRooms: rooms.filter(isVacantRoom).length,
        });
    }

    return { byLandlord, companyCommission, landlordPayable, vacantDeductions };
}

function commissionCalculationMode(landlord: LandlordRow | null) {
    const mode = (landlord as (LandlordRow & { commission_calculation_mode?: string | null }) | null)?.commission_calculation_mode;
    return mode === "occupied_room_based" ? "occupied_room_based" : "portfolio_based";
}

function isVacantRoom(room: RoomRow) {
    const status = (room.status ?? "").toLowerCase();
    return status.includes("vacant") || status.includes("empty");
}

function scoreTrend(collections: CollectionRow[]): OfficeLeagueRow["trend"] {
    const currentStart = dateOffset(-6);
    const previousStart = dateOffset(-13);
    const current = sumCollections(collections.filter((collection) => collection.paid_at && collection.paid_at.slice(0, 10) >= currentStart));
    const previous = sumCollections(collections.filter((collection) => {
        const date = collection.paid_at?.slice(0, 10) ?? "";
        return date >= previousStart && date < currentStart;
    }));
    if (current > previous * 1.05) return "up";
    if (current < previous * 0.95) return "down";
    return "flat";
}

function scoreStatus(score: number): OfficeLeagueRow["status"] {
    if (score >= 85) return "excellent";
    if (score >= 72) return "strong";
    if (score >= 60) return "watch";
    return "risk";
}

function emptyData(): DashboardLiveData {
    return {
        company: null,
        activeOffice: null,
        offices: [],
        isAdmin: false,
        period: {
            label: "",
            startDate: todayDate(),
            endDate: todayDate(),
        },
        lastSyncedAt: new Date().toISOString(),
        warnings: [],
        kpis: {
            companyCashPosition: 0,
            todayCollections: 0,
            monthCollections: 0,
            expenses: 0,
            netPosition: 0,
            occupancyRate: 0,
            attendanceRate: 0,
            promiseRecovery: 0,
            officeScore: 0,
        },
        league: [],
        riskAlerts: [],
        actions: [],
        finance: {
            expectedRentRoll: 0,
            expectedLandlordPayable: 0,
            expectedCompanyCommissionProfit: 0,
            collectedSoFarThisMonth: 0,
            landlordsPaid: 0,
            landlordPaymentsMade: 0,
            pendingLandlordPayments: 0,
            landlordsNotPaid: 0,
            totalAmountNotPaidToLandlords: 0,
            outstandingTenantBalances: 0,
            approvedExpenses: 0,
            pendingExpenses: 0,
            amountAtOffice: 0,
            amountBanked: 0,
            amountGivenToOfficeByAdmin: 0,
            amountSentFromOfficeToBank: 0,
            landlordAdvancesGiven: 0,
            landlordAdvanceActiveBalance: 0,
            landlordAdvanceRecovered: 0,
            landlordAdvancePendingApprovals: 0,
            landlordAdvanceRows: [],
            occupiedRooms: 0,
            vacantRooms: 0,
            vacantDeductions: 0,
            reconciliation: {
                dashboardRentRoll: 0,
                liveRoomRentRoll: 0,
                dashboardCommission: 0,
                liveLandlordCommission: 0,
                dashboardLandlordPayable: 0,
                liveLandlordNetPayable: 0,
                ledgerLandlordPayable: 0,
                rentRollDifference: 0,
                commissionDifference: 0,
                payableDifference: 0,
                missingLandlordCount: 0,
                missingRoomCount: 0,
            },
            employerContributionsExpected: 0,
            employerContributionsReceived: 0,
            tenantTopUpsExpected: 0,
            tenantTopUpsCollected: 0,
            tenantTopUpsStillToCollect: 0,
            officeLandlordPayables: 0,
            unpaidLandlords: 0,
            totalMoneyHeldForLandlords: 0,
            profitLossToday: 0,
            profitLossThisMonth: 0,
            collectionProgress: 0,
        },
        rentCalendar: {
            canRunRollover: false,
            currentBusinessDate: todayDate(),
            currentRentMonth: monthStart(),
            failedRecordCount: 0,
            lastRunAt: null,
            lastRunStatus: null,
            nextRolloverDate: nextMonthStartFrom(todayDate()),
            tenantsChargedThisMonth: 0,
        },
        snapshots: {
            companyScorecard: null,
            executiveKpi: null,
            companyCashPosition: null,
            dailyCashPositions: [],
        },
    };
}
