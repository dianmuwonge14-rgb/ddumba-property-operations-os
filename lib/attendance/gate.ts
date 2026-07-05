import type { AuthContext } from "@/lib/auth/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const TIME_ZONE = "Africa/Kampala";

export type AttendanceGateStatus = {
    required: boolean;
    checkedIn: boolean;
    checkedOut: boolean;
    employeeId: string | null;
    employeeName: string | null;
    officeName: string | null;
    firstCheckIn: string | null;
    lastCheckOut: string | null;
    attendanceDate: string | null;
    status: "not_checked_in" | "on_time" | "late" | "absent" | "checked_out";
    checkoutStatus: "not_checked_out" | "checked_out" | "missed_checkout";
    workDurationMinutes: number;
    timezone: string;
    message: string;
};

function todayRange() {
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date());
    return {
        start: `${date}T00:00:00+03:00`,
        end: `${date}T23:59:59+03:00`,
    };
}

type SelfAttendanceStatusRow = {
    employee_id: string | null;
    employee_name: string | null;
    office_name: string | null;
    checked_in: boolean | null;
    checked_out: boolean | null;
    first_check_in: string | null;
    last_check_out: string | null;
    attendance_date?: string | null;
    attendance_status?: AttendanceGateStatus["status"] | null;
    timezone?: string | null;
    work_duration_minutes?: number | null;
    checkout_status?: AttendanceGateStatus["checkoutStatus"] | null;
};

function todayKampala() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date());
}

function missingCheckInStatus(): AttendanceGateStatus["status"] {
    const formatter = new Intl.DateTimeFormat("en-GB", {
        timeZone: TIME_ZONE,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
    const [hour, minute] = formatter.format(new Date()).split(":").map(Number);
    return hour * 60 + minute > 11 * 60 ? "absent" : "not_checked_in";
}

function statusForCheckIn(value: string | null): AttendanceGateStatus["status"] {
    if (!value) return missingCheckInStatus();
    const formatter = new Intl.DateTimeFormat("en-GB", {
        timeZone: TIME_ZONE,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
    const [hour, minute] = formatter.format(new Date(value)).split(":").map(Number);
    const minutes = hour * 60 + minute;
    if (minutes <= 9 * 60 + 30) return "on_time";
    if (minutes <= 11 * 60) return "late";
    return "absent";
}

export async function getAttendanceGateStatus(context: AuthContext): Promise<AttendanceGateStatus> {
    const officeName = context.activeOffice?.office_name ?? context.activeOffice?.name ?? null;
    if (!context.isOfficeMode || !context.profile?.id || !context.activeCompany?.id || !context.activeOffice?.id) {
        return {
            required: false,
            checkedIn: true,
            checkedOut: false,
            employeeId: null,
            employeeName: null,
            officeName,
            firstCheckIn: null,
            lastCheckOut: null,
            attendanceDate: todayKampala(),
            status: "not_checked_in",
            checkoutStatus: "not_checked_out",
            workDurationMinutes: 0,
            timezone: TIME_ZONE,
            message: "Attendance gate is not required for admin mode.",
        };
    }

    const supabase = await createSupabaseServerClient();
    const rpc = supabase.rpc.bind(supabase) as unknown as (
        fn: "ddumba_v1_self_attendance_status",
        args: { p_office_id: string },
    ) => Promise<{ data: SelfAttendanceStatusRow[] | null; error: { message: string } | null }>;
    const statusResult = await rpc("ddumba_v1_self_attendance_status", { p_office_id: context.activeOffice.id });
    if (!statusResult.error) {
        const status = statusResult.data?.[0] ?? null;
        if (status) {
            return {
                required: true,
                checkedIn: Boolean(status.checked_in),
                checkedOut: Boolean(status.checked_out),
                employeeId: status.employee_id,
                employeeName: status.employee_name ?? context.profile.full_name,
                officeName: status.office_name ?? officeName,
                firstCheckIn: status.first_check_in,
                lastCheckOut: status.last_check_out,
                attendanceDate: status.attendance_date ?? todayKampala(),
                status: status.attendance_status ?? statusForCheckIn(status.first_check_in),
                checkoutStatus: status.checkout_status ?? (status.checked_out ? "checked_out" : "not_checked_out"),
                workDurationMinutes: status.work_duration_minutes ?? 0,
                timezone: status.timezone ?? TIME_ZONE,
                message: status.checked_in ? "Checked in for today." : "Please check in at work before continuing.",
            };
        }
    }

    const { data: employee } = await supabase
        .from("employees")
        .select("*")
        .eq("company_id", context.activeCompany.id)
        .eq("office_id", context.activeOffice.id)
        .eq("user_id", context.profile.id)
        .neq("status", "archived")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

    if (!employee) {
        return {
            required: true,
            checkedIn: false,
            checkedOut: false,
            employeeId: null,
            employeeName: context.profile.full_name,
            officeName,
            firstCheckIn: null,
            lastCheckOut: null,
            attendanceDate: todayKampala(),
            status: missingCheckInStatus(),
            checkoutStatus: "not_checked_out",
            workDurationMinutes: 0,
            timezone: TIME_ZONE,
            message: "Please check in at work before continuing.",
        };
    }

    const range = todayRange();
    const { data: events } = await supabase
        .from("attendance_events")
        .select("*")
        .eq("company_id", context.activeCompany.id)
        .eq("office_id", context.activeOffice.id)
        .eq("employee_id", employee.id)
        .gte("event_time", range.start)
        .lte("event_time", range.end)
        .order("event_time", { ascending: true });

    const firstCheckIn = (events ?? []).find((event) => event.event_type === "check_in")?.event_time ?? null;
    const lastCheckOut = [...(events ?? [])].reverse().find((event) => event.event_type === "check_out")?.event_time ?? null;

    return {
        required: true,
        checkedIn: Boolean(firstCheckIn),
        checkedOut: Boolean(lastCheckOut),
        employeeId: employee.id,
        employeeName: employee.full_name ?? context.profile.full_name,
        officeName,
        firstCheckIn,
        lastCheckOut,
        attendanceDate: todayKampala(),
        status: statusForCheckIn(firstCheckIn),
        checkoutStatus: lastCheckOut ? "checked_out" : "not_checked_out",
        workDurationMinutes: firstCheckIn && lastCheckOut ? Math.max(0, Math.floor((new Date(lastCheckOut).getTime() - new Date(firstCheckIn).getTime()) / 60000)) : 0,
        timezone: TIME_ZONE,
        message: firstCheckIn ? "Checked in for today." : "Please check in at work before continuing.",
    };
}
