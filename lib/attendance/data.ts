import { requirePermission } from "@/lib/auth/permissions";
import { getScopedSupabase } from "@/lib/auth/query";
import type {
    AttendanceEventRow,
    AttendanceKpis,
    AttendancePageData,
    AttendanceTimelineItem,
    DailyAttendanceRow,
    EmployeeAttendanceProfile,
    EmployeeRow,
    GpsValidationRow,
    OfficeDailyReportDefaults,
    OfficeDailyReportStatus,
    PayrollReportRow,
    PublicHolidayRow,
    UserDeviceRow,
    UserRow,
    WorkScheduleRow,
} from "./types";

const TIME_ZONE = "Africa/Kampala";
const CLOCK_IN_MINUTES = 9 * 60 + 30;
const LATE_AFTER_MINUTES = 10 * 60;
const ABSENT_AFTER_MINUTES = 11 * 60;
const STANDARD_DAY_MINUTES = 8 * 60;

function kampalaDateParts(date = new Date()) {
    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
    const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
    return {
        date: `${parts.year}-${parts.month}-${parts.day}`,
        minutes: Number(parts.hour) * 60 + Number(parts.minute),
    };
}

function monthRange() {
    const now = new Date();
    const year = Number(new Intl.DateTimeFormat("en", { timeZone: TIME_ZONE, year: "numeric" }).format(now));
    const month = Number(new Intl.DateTimeFormat("en", { timeZone: TIME_ZONE, month: "numeric" }).format(now));
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    return { start, end };
}

function localDateFromIso(value: string | null) {
    if (!value) return null;
    return kampalaDateParts(new Date(value)).date;
}

function localMinutesFromIso(value: string | null) {
    if (!value) return null;
    return kampalaDateParts(new Date(value)).minutes;
}

export async function getAttendancePageData(): Promise<AttendancePageData> {
    const context = await requirePermission("attendance.read");
    const { supabase } = await getScopedSupabase();
    const companyId = context.activeCompany?.id;
    const officeId = context.activeOffice?.id;

    if (!companyId || !officeId) return emptyData();

    const today = kampalaDateParts().date;
    const month = monthRange();
    const eventStart = `${month.start}T00:00:00+03:00`;
    const eventEnd = `${today}T23:59:59+03:00`;

    const employeeQuery = supabase
            .from("employees")
            .select("*")
            .eq("company_id", companyId)
            .neq("status", "archived")
            .or(`office_id.eq.${officeId},employee_assignment_type.eq.all_rounder`)
            .order("full_name", { ascending: true, nullsFirst: false });

    const [employeesResult, eventsResult, schedulesResult, holidaysResult, devicesResult, usersResult, gpsResult] = await Promise.all([
        employeeQuery,
        supabase
            .from("attendance_events")
            .select("*")
            .eq("company_id", companyId)
            .eq("office_id", officeId)
            .gte("event_time", eventStart)
            .lte("event_time", eventEnd)
            .order("event_time", { ascending: false }),
        supabase.from("work_schedules").select("*").eq("company_id", companyId).eq("active", true).order("name"),
        supabase
            .from("public_holidays")
            .select("*")
            .or(`company_id.eq.${companyId},company_id.is.null`)
            .gte("holiday_date", month.start)
            .lte("holiday_date", month.end)
            .order("holiday_date"),
        supabase.from("user_devices").select("*").eq("company_id", companyId).order("last_seen_at", { ascending: false, nullsFirst: false }),
        supabase.from("users").select("*").eq("company_id", companyId).eq("status", "active"),
        supabase
            .from("gps_validations")
            .select("*")
            .eq("company_id", companyId)
            .eq("office_id", officeId)
            .gte("created_at", eventStart)
            .lte("created_at", eventEnd),
    ]);

    for (const result of [employeesResult, eventsResult, schedulesResult, holidaysResult, devicesResult, usersResult, gpsResult]) {
        if (result.error) throw new Error(result.error.message);
    }

    const employees = employeesResult.data ?? [];
    const events = eventsResult.data ?? [];
    const schedules = schedulesResult.data ?? [];
    const holidays = holidaysResult.data ?? [];
    const devices = devicesResult.data ?? [];
    const users = usersResult.data ?? [];
    const gpsValidations = gpsResult.data ?? [];

    const profiles = hydrateEmployeeProfiles(employees, events, users);
    const ledger = buildLedger(profiles, events);
    const timeline = hydrateTimeline(events, profiles, devices, gpsValidations);
    const [dailyReport, dailyReportDefaults] = await Promise.all([
        getDailyReportStatus(supabase, officeId),
        getDailyReportDefaults(supabase, companyId, officeId, today),
    ]);
    const payroll = buildPayrollRows(profiles, events, context.activeOffice?.office_name ?? context.activeOffice?.name ?? "Office");

    return {
        company: context.activeCompany,
        office: context.activeOffice,
        employees: profiles,
        events: timeline,
        ledger,
        schedules,
        holidays,
        devices,
        kpis: calculateKpis(profiles, events),
        dailyReport,
        dailyReportDefaults,
        payroll,
    };
}

export async function getEmployeeInActiveOffice(employeeId: string) {
    const context = await requirePermission("attendance.read");
    const { supabase } = await getScopedSupabase();
    if (!context.activeCompany?.id || !context.activeOffice?.id) throw new Error("Active company and office are required.");

    const { data, error } = await supabase
        .from("employees")
        .select("*")
        .eq("id", employeeId)
        .eq("company_id", context.activeCompany.id)
        .eq("office_id", context.activeOffice.id)
        .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw new Error("Employee not found in active office.");
    return data;
}

function hydrateEmployeeProfiles(
    employees: EmployeeRow[],
    events: AttendanceEventRow[],
    users: UserRow[],
): EmployeeAttendanceProfile[] {
    const userById = new Map(users.map((user) => [user.id, user]));
    const activeEmployees = employees.filter((employee) => employee.status !== "terminated" && employee.status !== "inactive");
    const today = kampalaDateParts();

    return activeEmployees.map((employee) => {
        const employeeEvents = events.filter((event) => event.employee_id === employee.id);
        const todayEvents = employeeEvents.filter((event) => localDateFromIso(event.event_time) === today.date).sort(byEventTime);
        const monthDays = buildMonthlyDays(employeeEvents);
        const firstCheckIn = todayEvents.find((event) => event.event_type === "check_in")?.event_time ?? null;
        const lastCheckOut = [...todayEvents].reverse().find((event) => event.event_type === "check_out")?.event_time ?? null;
        const latestEvent = todayEvents[todayEvents.length - 1] ?? null;
        const lateMinutes = firstCheckIn ? Math.max(0, (localMinutesFromIso(firstCheckIn) ?? CLOCK_IN_MINUTES) - CLOCK_IN_MINUTES) : 0;
        const workedMinutes = calculateWorkedMinutes(todayEvents);
        const presentDays = [...monthDays.values()].filter((day) => day.hasCheckIn).length;
        const lateDays = [...monthDays.values()].filter((day) => day.isLate).length;
        const absentDays = today.minutes >= ABSENT_AFTER_MINUTES && !firstCheckIn ? 1 : 0;
        const user = employee.user_id ? userById.get(employee.user_id) ?? null : null;

        return {
            ...employee,
            userName: user?.full_name ?? null,
            userEmail: user?.email ?? null,
            todayStatus: resolveTodayStatus(firstCheckIn, lastCheckOut, latestEvent?.event_type, today.minutes),
            firstCheckIn,
            lastCheckOut,
            breakMinutes: calculateBreakMinutes(todayEvents),
            workedMinutes,
            lateMinutes,
            monthPresentDays: presentDays,
            monthLateDays: lateDays,
            monthAbsentDays: absentDays,
            attendanceRate: monthDays.size ? Math.round((presentDays / monthDays.size) * 100) : firstCheckIn ? 100 : 0,
        };
    });
}

function buildMonthlyDays(events: AttendanceEventRow[]) {
    const days = new Map<string, { hasCheckIn: boolean; isLate: boolean }>();
    for (const event of events) {
        const day = localDateFromIso(event.event_time);
        if (!day) continue;
        const existing = days.get(day) ?? { hasCheckIn: false, isLate: false };
        if (event.event_type === "check_in") {
            existing.hasCheckIn = true;
            existing.isLate ||= (localMinutesFromIso(event.event_time) ?? 0) > LATE_AFTER_MINUTES;
        }
        days.set(day, existing);
    }
    return days;
}

function buildLedger(profiles: EmployeeAttendanceProfile[], events: AttendanceEventRow[]): DailyAttendanceRow[] {
    const today = kampalaDateParts().date;
    return profiles.map((employee) => ({
        employee,
        events: events
            .filter((event) => event.employee_id === employee.id && localDateFromIso(event.event_time) === today)
            .sort(byEventTime),
        expectedClockIn: "09:30",
        lateAfter: "10:00",
        absentAfter: "11:00",
    }));
}

function hydrateTimeline(
    events: AttendanceEventRow[],
    employees: EmployeeAttendanceProfile[],
    devices: UserDeviceRow[],
    gpsValidations: GpsValidationRow[],
): AttendanceTimelineItem[] {
    const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
    const deviceById = new Map(devices.map((device) => [device.id, device]));
    const gpsById = new Map(gpsValidations.map((gps) => [gps.id, gps]));

    return events.slice(0, 80).map((event) => ({
        ...event,
        employeeName: employeeById.get(event.employee_id)?.full_name ?? null,
        deviceName: event.device_id ? deviceById.get(event.device_id)?.device_name ?? null : null,
        gpsPassed: event.gps_validation_id ? gpsById.get(event.gps_validation_id)?.passed ?? null : null,
    }));
}

function calculateKpis(employees: EmployeeAttendanceProfile[], events: AttendanceEventRow[]): AttendanceKpis {
    const activeEmployees = employees.length;
    const presentToday = employees.filter((employee) => employee.firstCheckIn).length;
    const lateToday = employees.filter((employee) => employee.todayStatus === "late").length;
    const absentToday = employees.filter((employee) => employee.todayStatus === "absent").length;
    const checkedOutToday = employees.filter((employee) => employee.todayStatus === "checked_out").length;
    const notCheckedInToday = Math.max(0, activeEmployees - presentToday);
    const totalHoursWorked = Math.round((employees.reduce((total, employee) => total + employee.workedMinutes, 0) / 60) * 10) / 10;
    const officeAttendanceRate = activeEmployees ? Math.round((presentToday / activeEmployees) * 100) : 0;
    const employeeAttendanceRate = employees.length
        ? Math.round(employees.reduce((total, employee) => total + employee.attendanceRate, 0) / employees.length)
        : 0;
    const overtimeHours = eventsToOvertimeHours(events);
    const officeAttendanceScore = Math.max(0, Math.round(officeAttendanceRate - lateToday * 2 - absentToday * 5));
    const monthlyAttendanceScore = Math.max(0, Math.round(employeeAttendanceRate - lateToday * 2 - absentToday * 5));

    return {
        presentToday,
        notCheckedInToday,
        lateToday,
        absentToday,
        checkedOutToday,
        totalHoursWorked,
        officeAttendanceRate,
        officeAttendanceScore,
        employeeAttendanceRate,
        monthlyAttendanceScore,
        overtimeHours,
    };
}

async function getDailyReportStatus(supabase: unknown, officeId: string): Promise<OfficeDailyReportStatus> {
    const client = supabase as {
        rpc: (
            fn: string,
            args: { p_office_id: string },
        ) => Promise<{ data: Array<{ submitted: boolean; report_id: string | null; submitted_at: string | null }> | null; error: { message: string } | null }>;
    };
    const { data, error } = await client.rpc("ddumba_v1_office_daily_report_status", { p_office_id: officeId });
    if (error) {
        return { submitted: false, reportId: null, submittedAt: null };
    }
    const row = data?.[0];
    return {
        submitted: Boolean(row?.submitted),
        reportId: row?.report_id ?? null,
        submittedAt: row?.submitted_at ?? null,
    };
}

async function getDailyReportDefaults(
    supabase: unknown,
    companyId: string,
    officeId: string,
    today: string,
): Promise<OfficeDailyReportDefaults> {
    const client = supabase as {
        from: (table: string) => {
            select: (columns: string, options?: { count?: "exact"; head?: boolean }) => unknown;
        };
    };
    const dayStart = `${today}T00:00:00+03:00`;
    const dayEnd = `${today}T23:59:59+03:00`;

    const [collections, expenses, landlordPayments, vacantRooms, newTenants, brokenPromises] = await Promise.all([
        (client.from("collections").select("*") as QueryBuilder).eq("company_id", companyId).eq("office_id", officeId).gte("paid_at", dayStart).lte("paid_at", dayEnd),
        (client.from("expenses").select("*") as QueryBuilder).eq("company_id", companyId).eq("office_id", officeId).gte("created_at", dayStart).lte("created_at", dayEnd),
        (client.from("landlord_payments").select("*") as QueryBuilder).eq("company_id", companyId).eq("office_id", officeId).gte("created_at", dayStart).lte("created_at", dayEnd),
        (client.from("rooms").select("id", { count: "exact", head: true }) as QueryBuilder).eq("company_id", companyId).eq("office_id", officeId).in("status", ["vacant", "available"]),
        (client.from("tenants").select("id", { count: "exact", head: true }) as QueryBuilder).eq("company_id", companyId).eq("office_id", officeId).gte("created_at", dayStart).lte("created_at", dayEnd),
        (client.from("promises").select("id", { count: "exact", head: true }) as QueryBuilder).eq("company_id", companyId).eq("office_id", officeId).eq("status", "broken").gte("updated_at", dayStart).lte("updated_at", dayEnd),
    ]);

    return {
        reportDate: today,
        totalCollections: sumRows(collections.data, ["amount_paid", "amount"]),
        totalExpenses: sumRows(expenses.data, ["amount"]),
        landlordPayments: sumRows(landlordPayments.data, ["amount"]),
        vacantRooms: vacantRooms.count ?? 0,
        newTenants: newTenants.count ?? 0,
        brokenPromises: brokenPromises.count ?? 0,
    };
}

type QueryResponse = { data?: Array<Record<string, unknown>> | null; count?: number | null; error?: { message: string } | null };
type QueryBuilder = {
    eq: (column: string, value: string) => QueryBuilder;
    gte: (column: string, value: string) => QueryBuilder;
    lte: (column: string, value: string) => QueryBuilder;
    in: (column: string, values: string[]) => Promise<QueryResponse>;
} & Promise<QueryResponse>;

function sumRows(rows: Array<Record<string, unknown>> | null | undefined, keys: string[]) {
    return (rows ?? []).reduce((total, row) => {
        const value = keys.map((key) => Number(row[key] ?? 0)).find((item) => item > 0) ?? 0;
        return total + value;
    }, 0);
}

function buildPayrollRows(
    profiles: EmployeeAttendanceProfile[],
    events: AttendanceEventRow[],
    officeName: string,
): PayrollReportRow[] {
    return profiles.map((employee) => {
        const employeeEvents = events.filter((event) => event.employee_id === employee.id);
        const byDay = groupEventsByDay(employeeEvents);
        let totalWorkedMinutes = 0;
        let overtimeMinutes = 0;

        for (const dayEvents of byDay.values()) {
            const worked = calculateWorkedMinutes(dayEvents);
            totalWorkedMinutes += worked;
            overtimeMinutes += Math.max(0, worked - STANDARD_DAY_MINUTES);
        }

        const score = Math.max(0, Math.min(100, Math.round(employee.attendanceRate - employee.monthLateDays * 2 - employee.monthAbsentDays * 5)));

        return {
            employeeId: employee.id,
            employeeName: employee.full_name ?? employee.employee_code ?? "Employee",
            officeName,
            daysPresent: employee.monthPresentDays,
            daysLate: employee.monthLateDays,
            daysAbsent: employee.monthAbsentDays,
            totalHoursWorked: Math.round((totalWorkedMinutes / 60) * 10) / 10,
            overtimeHours: Math.round((overtimeMinutes / 60) * 10) / 10,
            attendanceScore: score,
        };
    });
}

function groupEventsByDay(events: AttendanceEventRow[]) {
    const byDay = new Map<string, AttendanceEventRow[]>();
    for (const event of events) {
        const day = localDateFromIso(event.event_time);
        if (!day) continue;
        byDay.set(day, [...(byDay.get(day) ?? []), event].sort(byEventTime));
    }
    return byDay;
}

function resolveTodayStatus(
    firstCheckIn: string | null,
    lastCheckOut: string | null,
    latestEventType: string | null | undefined,
    currentMinutes: number,
): EmployeeAttendanceProfile["todayStatus"] {
    if (lastCheckOut) return "checked_out";
    if (latestEventType === "start_break") return "on_break";
    if (!firstCheckIn) return currentMinutes >= ABSENT_AFTER_MINUTES ? "absent" : "not_started";
    return (localMinutesFromIso(firstCheckIn) ?? 0) > LATE_AFTER_MINUTES ? "late" : "present";
}

function calculateWorkedMinutes(events: AttendanceEventRow[]) {
    const checkIn = events.find((event) => event.event_type === "check_in")?.event_time;
    const checkOut = [...events].reverse().find((event) => event.event_type === "check_out")?.event_time;
    if (!checkIn || !checkOut) return 0;
    const total = Math.max(0, (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 60000);
    return Math.round(total - calculateBreakMinutes(events));
}

function calculateBreakMinutes(events: AttendanceEventRow[]) {
    let total = 0;
    let breakStart: string | null = null;
    for (const event of events.sort(byEventTime)) {
        if (event.event_type === "start_break") breakStart = event.event_time;
        if (event.event_type === "end_break" && breakStart) {
            total += Math.max(0, (new Date(event.event_time).getTime() - new Date(breakStart).getTime()) / 60000);
            breakStart = null;
        }
    }
    return Math.round(total);
}

function eventsToOvertimeHours(events: AttendanceEventRow[]) {
    const byEmployeeDay = new Map<string, AttendanceEventRow[]>();
    for (const event of events) {
        const day = localDateFromIso(event.event_time);
        if (!day) continue;
        const key = `${event.employee_id}:${day}`;
        byEmployeeDay.set(key, [...(byEmployeeDay.get(key) ?? []), event]);
    }

    let overtimeMinutes = 0;
    for (const dayEvents of byEmployeeDay.values()) {
        overtimeMinutes += Math.max(0, calculateWorkedMinutes(dayEvents) - STANDARD_DAY_MINUTES);
    }

    return Math.round((overtimeMinutes / 60) * 10) / 10;
}

function byEventTime(a: AttendanceEventRow, b: AttendanceEventRow) {
    return new Date(a.event_time).getTime() - new Date(b.event_time).getTime();
}

function emptyData(): AttendancePageData {
    return {
        company: null,
        office: null,
        employees: [],
        events: [],
        ledger: [],
        schedules: [],
        holidays: [],
        devices: [],
        kpis: {
            presentToday: 0,
            notCheckedInToday: 0,
            lateToday: 0,
            absentToday: 0,
            checkedOutToday: 0,
            totalHoursWorked: 0,
            officeAttendanceRate: 0,
            officeAttendanceScore: 0,
            employeeAttendanceRate: 0,
            monthlyAttendanceScore: 0,
            overtimeHours: 0,
        },
        dailyReport: { submitted: false, reportId: null, submittedAt: null },
        dailyReportDefaults: {
            reportDate: kampalaDateParts().date,
            totalCollections: 0,
            totalExpenses: 0,
            landlordPayments: 0,
            vacantRooms: 0,
            newTenants: 0,
            brokenPromises: 0,
        },
        payroll: [],
    };
}
