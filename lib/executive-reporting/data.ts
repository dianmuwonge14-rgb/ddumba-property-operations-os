import { logUserAction } from "@/lib/auth/audit";
import { requirePermission } from "@/lib/auth/permissions";
import { getScopedSupabase } from "@/lib/auth/query";
import type {
    AttendanceEventRow,
    CollectionRow,
    EmployeeRow,
    ExecutiveKpis,
    ExecutiveReportingData,
    ExecutiveSummary,
    ExpenseRow,
    LandlordRow,
    OfficeScorecard,
    PromiseRow,
    PropertyRow,
    RoomRow,
    TenantRow,
    TrendAnalytics,
    TrendPoint,
} from "./types";

const TIME_ZONE = "Africa/Kampala";

function todayDate() {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date());
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

function monthStart() {
    const date = new Date();
    const year = new Intl.DateTimeFormat("en", { timeZone: TIME_ZONE, year: "numeric" }).format(date);
    const month = new Intl.DateTimeFormat("en", { timeZone: TIME_ZONE, month: "2-digit" }).format(date);
    return `${year}-${month}-01`;
}

function isoStart(date: string) {
    return `${date}T00:00:00+03:00`;
}

function isoEnd(date: string) {
    return `${date}T23:59:59+03:00`;
}

function toMoneyNumber(value: number | null | undefined) {
    return Number(value ?? 0);
}

export async function getExecutiveReportingData(): Promise<ExecutiveReportingData> {
    const context = await requirePermission("reports.read");
    const { supabase } = await getScopedSupabase();
    const companyId = context.activeCompany?.id;

    if (!companyId) return emptyData();

    const startDate = dateOffset(-29);
    const today = todayDate();
    const accessibleOfficeIds = new Set(context.offices.map((office) => office.id));

    const [
        officesResult,
        collectionsResult,
        promisesResult,
        propertiesResult,
        roomsResult,
        tenantsResult,
        landlordsResult,
        expensesResult,
        attendanceResult,
        employeesResult,
    ] = await Promise.all([
        supabase
            .from("offices")
            .select("*")
            .eq("company_id", companyId)
            .neq("status", "archived")
            .order("office_name", { ascending: true }),
        supabase
            .from("collections")
            .select("*")
            .eq("company_id", companyId)
            .gte("paid_at", isoStart(startDate))
            .lte("paid_at", isoEnd(today)),
        supabase.from("promises").select("*").eq("company_id", companyId),
        supabase.from("properties").select("*").eq("company_id", companyId).neq("status", "archived"),
        supabase.from("rooms").select("*").eq("company_id", companyId),
        supabase.from("tenants").select("*").eq("company_id", companyId),
        supabase.from("landlords").select("*").eq("company_id", companyId).neq("status", "archived"),
        supabase
            .from("expenses")
            .select("*")
            .eq("company_id", companyId)
            .gte("expense_date", startDate)
            .lte("expense_date", today),
        supabase
            .from("attendance_events")
            .select("*")
            .eq("company_id", companyId)
            .gte("event_time", isoStart(startDate))
            .lte("event_time", isoEnd(today)),
        supabase.from("employees").select("*").eq("company_id", companyId).neq("status", "archived"),
    ]);

    for (const result of [
        officesResult,
        collectionsResult,
        promisesResult,
        propertiesResult,
        roomsResult,
        tenantsResult,
        landlordsResult,
        expensesResult,
        attendanceResult,
        employeesResult,
    ]) {
        if (result.error) throw new Error(result.error.message);
    }

    const companyOffices = officesResult.data ?? [];
    const offices = context.canAccessAllOffices ? companyOffices : companyOffices.filter((office) => accessibleOfficeIds.has(office.id));
    const officeIds = new Set(offices.map((office) => office.id));
    const collections = filterByOffice(collectionsResult.data ?? [], officeIds);
    const promises = filterByOffice(promisesResult.data ?? [], officeIds);
    const properties = filterByOffice(propertiesResult.data ?? [], officeIds);
    const rooms = filterByOffice(roomsResult.data ?? [], officeIds);
    const tenants = filterByOffice(tenantsResult.data ?? [], officeIds);
    const landlords = landlordsResult.data ?? [];
    const expenses = filterByOffice(expensesResult.data ?? [], officeIds);
    const attendanceEvents = filterByOffice(attendanceResult.data ?? [], officeIds);
    const employees = filterByOffice(employeesResult.data ?? [], officeIds);
    const officeScorecards = buildOfficeScorecards({
        offices,
        collections,
        promises,
        properties,
        rooms,
        tenants,
        expenses,
        attendanceEvents,
        employees,
    });
    const kpis = calculateExecutiveKpis({
        collections,
        promises,
        properties,
        rooms,
        tenants,
        landlords,
        expenses,
        attendanceEvents,
        employees,
    });
    const trends = buildTrendAnalytics({ collections, promises, rooms, tenants, expenses, attendanceEvents, employees });
    const summaries = {
        daily: buildSummary("Daily Executive Summary", today, kpis, collections, expenses, promises, attendanceEvents, 1),
        weekly: buildSummary("Weekly Performance Summary", `${dateOffset(-6)} to ${today}`, kpis, collections, expenses, promises, attendanceEvents, 7),
        monthly: buildSummary("Monthly Consolidated Report", `${monthStart()} to ${today}`, kpis, collections, expenses, promises, attendanceEvents, 30),
    };

    await logUserAction({
        action: "executive_reporting_viewed",
        entityType: "report",
        entityId: "executive_reporting",
        companyId,
        officeId: context.activeOffice?.id ?? null,
        afterData: {
            office_count: offices.length,
            company_collections: kpis.companyCollections,
            company_expenses: kpis.companyExpenses,
            net_cash_position: kpis.netCashPosition,
        },
    });

    return {
        company: context.activeCompany,
        activeOffice: context.activeOffice,
        offices,
        kpis,
        officeScorecards,
        leagueTable: officeScorecards
            .slice()
            .sort((a, b) => b.overallScore - a.overallScore)
            .map((office, index) => ({ ...office, rank: index + 1 })),
        trends,
        summaries,
    };
}

function filterByOffice<T extends { office_id: string | null }>(rows: T[], officeIds: Set<string>) {
    return rows.filter((row) => row.office_id && officeIds.has(row.office_id));
}

function calculateExecutiveKpis(input: {
    collections: CollectionRow[];
    promises: PromiseRow[];
    properties: PropertyRow[];
    rooms: RoomRow[];
    tenants: TenantRow[];
    landlords: LandlordRow[];
    expenses: ExpenseRow[];
    attendanceEvents: AttendanceEventRow[];
    employees: EmployeeRow[];
}): ExecutiveKpis {
    const collections = sumCollections(input.collections);
    const expenses = sumExpenses(input.expenses);
    const occupiedRooms = input.rooms.filter(isOccupiedRoom).length;
    const activeTenants = input.tenants.filter(isActiveTenant).length;
    const fulfilledPromises = input.promises.filter(isFulfilledPromise).length;
    const completedCollectionExpected = input.collections.reduce((total, collection) => total + toMoneyNumber(collection.expected_amount ?? collection.amount), 0);

    return {
        companyCollections: collections,
        companyExpenses: expenses,
        netCashPosition: collections - expenses,
        occupancyRate: percentage(occupiedRooms, input.rooms.length),
        activeTenants,
        outstandingPromises: input.promises.filter(isOutstandingPromise).length,
        collectionRecoveryRate: percentage(collections, completedCollectionExpected || collections),
        attendanceRate: calculateAttendanceRate(input.attendanceEvents, input.employees),
        totalProperties: input.properties.length,
        totalLandlords: input.landlords.filter((landlord) => landlord.status !== "archived").length,
    };
}

function buildOfficeScorecards(input: {
    offices: Array<{ id: string; office_name: string; name: string | null; collection_target: number | null }>;
    collections: CollectionRow[];
    promises: PromiseRow[];
    properties: PropertyRow[];
    rooms: RoomRow[];
    tenants: TenantRow[];
    expenses: ExpenseRow[];
    attendanceEvents: AttendanceEventRow[];
    employees: EmployeeRow[];
}): OfficeScorecard[] {
    return input.offices.map((office) => {
        const collections = input.collections.filter((row) => row.office_id === office.id);
        const promises = input.promises.filter((row) => row.office_id === office.id);
        const rooms = input.rooms.filter((row) => row.office_id === office.id);
        const tenants = input.tenants.filter((row) => row.office_id === office.id);
        const expenses = input.expenses.filter((row) => row.office_id === office.id);
        const attendanceEvents = input.attendanceEvents.filter((row) => row.office_id === office.id);
        const employees = input.employees.filter((row) => row.office_id === office.id);
        const collectionValue = sumCollections(collections);
        const expenseValue = sumExpenses(expenses);
        const collectionExpected = office.collection_target || collections.reduce((total, collection) => total + toMoneyNumber(collection.expected_amount ?? collection.amount), 0);
        const collectionRecoveryRate = percentage(collectionValue, collectionExpected || collectionValue);
        const promiseRecoveryRate = percentage(promises.filter(isFulfilledPromise).length, promises.length);
        const occupancyRate = percentage(rooms.filter(isOccupiedRoom).length, rooms.length);
        const attendanceRate = calculateAttendanceRate(attendanceEvents, employees);
        const overallScore = Math.round((collectionRecoveryRate * 0.35) + (promiseRecoveryRate * 0.2) + (occupancyRate * 0.25) + (attendanceRate * 0.2));

        return {
            officeId: office.id,
            officeName: office.office_name ?? office.name ?? "Office",
            collections: collectionValue,
            expenses: expenseValue,
            netCashPosition: collectionValue - expenseValue,
            occupancyRate,
            attendanceRate,
            promiseRecoveryRate,
            collectionRecoveryRate,
            totalProperties: input.properties.filter((row) => row.office_id === office.id).length,
            activeTenants: tenants.filter(isActiveTenant).length,
            outstandingPromises: promises.filter(isOutstandingPromise).length,
            overallScore,
            trend: resolveTrend(collections),
        };
    });
}

function buildTrendAnalytics(input: {
    collections: CollectionRow[];
    promises: PromiseRow[];
    rooms: RoomRow[];
    tenants: TenantRow[];
    expenses: ExpenseRow[];
    attendanceEvents: AttendanceEventRow[];
    employees: EmployeeRow[];
}): TrendAnalytics {
    const days = Array.from({ length: 30 }, (_, index) => dateOffset(index - 29));
    return {
        collections: days.map((date) => trendPoint(date, sumCollections(input.collections.filter((row) => sameDate(row.paid_at, date))))),
        expenses: days.map((date) => trendPoint(date, sumExpenses(input.expenses.filter((row) => row.expense_date === date)))),
        occupancy: days.map((date) => {
            const activeTenants = input.tenants.filter((tenant) => tenant.created_at && dateOnly(tenant.created_at) <= date && isActiveTenant(tenant)).length;
            return trendPoint(date, percentage(activeTenants, input.rooms.length));
        }),
        attendance: days.map((date) => {
            const dayEvents = input.attendanceEvents.filter((event) => sameDate(event.event_time, date));
            return trendPoint(date, calculateAttendanceRate(dayEvents, input.employees));
        }),
        promiseRecovery: days.map((date) => {
            const duePromises = input.promises.filter((promise) => (promise.promised_date ?? promise.promise_date) === date);
            return trendPoint(date, percentage(duePromises.filter(isFulfilledPromise).length, duePromises.length));
        }),
    };
}

function buildSummary(
    title: string,
    period: string,
    kpis: ExecutiveKpis,
    collections: CollectionRow[],
    expenses: ExpenseRow[],
    promises: PromiseRow[],
    attendanceEvents: AttendanceEventRow[],
    days: number,
): ExecutiveSummary {
    const start = dateOffset(-(days - 1));
    const scopedCollections = collections.filter((collection) => collection.paid_at && dateOnly(collection.paid_at) >= start);
    const scopedExpenses = expenses.filter((expense) => expense.expense_date && expense.expense_date >= start);
    const scopedPromises = promises.filter((promise) => (promise.promised_date ?? promise.promise_date ?? "") >= start);
    const scopedAttendance = attendanceEvents.filter((event) => dateOnly(event.event_time) >= start);
    const collectionValue = sumCollections(scopedCollections);
    const expenseValue = sumExpenses(scopedExpenses);
    const promiseRecoveryRate = percentage(scopedPromises.filter(isFulfilledPromise).length, scopedPromises.length);
    const attendanceRate = scopedAttendance.length ? kpis.attendanceRate : 0;

    return {
        title,
        period,
        collections: collectionValue,
        expenses: expenseValue,
        netCashPosition: collectionValue - expenseValue,
        occupancyRate: kpis.occupancyRate,
        attendanceRate,
        promiseRecoveryRate,
        narrative: `${title} shows UGX ${Math.round(collectionValue).toLocaleString()} collected against UGX ${Math.round(expenseValue).toLocaleString()} in expenses, with ${kpis.occupancyRate}% occupancy and ${promiseRecoveryRate}% promise recovery.`,
    };
}

function trendPoint(date: string, value: number): TrendPoint {
    return {
        date,
        label: date.slice(5),
        value: Math.round(value),
    };
}

function sumCollections(collections: CollectionRow[]) {
    return collections.reduce((total, collection) => total + toMoneyNumber(collection.amount_paid ?? collection.amount), 0);
}

function sumExpenses(expenses: ExpenseRow[]) {
    return expenses.reduce((total, expense) => total + toMoneyNumber(expense.amount), 0);
}

function percentage(numerator: number, denominator: number) {
    if (!denominator) return 0;
    return Math.max(0, Math.min(100, Math.round((numerator / denominator) * 100)));
}

function isOccupiedRoom(room: RoomRow) {
    return (room.status ?? "").toLowerCase().includes("occupied");
}

function isActiveTenant(tenant: TenantRow) {
    const status = (tenant.status ?? "").toLowerCase();
    return status === "active" || status === "current" || status === "occupied";
}

function isFulfilledPromise(promise: PromiseRow) {
    const status = (promise.status ?? "").toLowerCase();
    return status === "fulfilled" || status === "paid" || Boolean(promise.fulfilled_at);
}

function isOutstandingPromise(promise: PromiseRow) {
    const status = (promise.status ?? "").toLowerCase();
    return !["fulfilled", "paid", "broken", "cancelled", "canceled"].includes(status);
}

function calculateAttendanceRate(events: AttendanceEventRow[], employees: EmployeeRow[]) {
    const activeEmployees = employees.filter((employee) => !["terminated", "inactive", "archived"].includes((employee.status ?? "").toLowerCase()));
    const checkedInEmployeeIds = new Set(events.filter((event) => event.event_type === "check_in").map((event) => event.employee_id));
    return percentage(checkedInEmployeeIds.size, activeEmployees.length);
}

function resolveTrend(collections: CollectionRow[]): OfficeScorecard["trend"] {
    const today = todayDate();
    const currentWeekStart = dateOffset(-6);
    const previousWeekStart = dateOffset(-13);
    const current = sumCollections(collections.filter((collection) => collection.paid_at && dateOnly(collection.paid_at) >= currentWeekStart));
    const previous = sumCollections(collections.filter((collection) => {
        const date = collection.paid_at ? dateOnly(collection.paid_at) : "";
        return date >= previousWeekStart && date < currentWeekStart;
    }));
    if (current > previous * 1.05) return "up";
    if (current < previous * 0.95 && today) return "down";
    return "flat";
}

function sameDate(value: string | null, date: string) {
    return value ? dateOnly(value) === date : false;
}

function dateOnly(value: string) {
    return value.slice(0, 10);
}

function emptyData(): ExecutiveReportingData {
    const emptySummary = {
        title: "Executive Summary",
        period: todayDate(),
        collections: 0,
        expenses: 0,
        netCashPosition: 0,
        occupancyRate: 0,
        attendanceRate: 0,
        promiseRecoveryRate: 0,
        narrative: "No active company context is available.",
    };

    return {
        company: null,
        activeOffice: null,
        offices: [],
        kpis: {
            companyCollections: 0,
            companyExpenses: 0,
            netCashPosition: 0,
            occupancyRate: 0,
            activeTenants: 0,
            outstandingPromises: 0,
            collectionRecoveryRate: 0,
            attendanceRate: 0,
            totalProperties: 0,
            totalLandlords: 0,
        },
        officeScorecards: [],
        leagueTable: [],
        trends: {
            collections: [],
            expenses: [],
            occupancy: [],
            attendance: [],
            promiseRecovery: [],
        },
        summaries: {
            daily: emptySummary,
            weekly: { ...emptySummary, title: "Weekly Performance Summary" },
            monthly: { ...emptySummary, title: "Monthly Consolidated Report" },
        },
    };
}
