import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const TIME_ZONE = "Africa/Kampala";

function todayKampala() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date());
}

function periodStart(period: string) {
    const today = new Date(`${todayKampala()}T12:00:00+03:00`);
    if (period === "month") return new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
    if (period === "week") {
        const day = today.getDay() || 7;
        const start = new Date(today);
        start.setDate(today.getDate() - day + 1);
        return start.toISOString().slice(0, 10);
    }
    return todayKampala();
}

type AttendanceRow = {
    id: string;
    attendance_date: string;
    check_in_time: string | null;
    check_out_time: string | null;
    status: string | null;
    checkout_status: string | null;
    work_duration_minutes: number | null;
    office_id: string | null;
    user_id: string | null;
};

type NamedRow = { id: string; office_name?: string | null; name?: string | null; full_name?: string | null; email?: string | null };

export async function GET(request: Request) {
    try {
        const context = await getAuthContext();
        if (!context.isAuthenticated || !context.profile?.id || !context.activeCompany?.id) {
            return NextResponse.json({ rows: [] });
        }

        const url = new URL(request.url);
        const period = url.searchParams.get("period") ?? "today";
        const start = periodStart(period);
        const end = todayKampala();
        const isAdmin = context.isCompanyAdmin && !context.isOfficeMode;

        const supabase = await createSupabaseServerClient();
        const db = supabase as unknown as {
            from: (table: string) => any;
        };
        let query = db
            .from("office_daily_attendance")
            .select("id, attendance_date, check_in_time, check_out_time, status, checkout_status, work_duration_minutes, office_id, user_id")
            .eq("company_id", context.activeCompany.id)
            .gte("attendance_date", start)
            .lte("attendance_date", end)
            .order("attendance_date", { ascending: false })
            .limit(60);

        if (!isAdmin) {
            if (!context.activeOffice?.id) return NextResponse.json({ rows: [] });
            query = query.eq("office_id", context.activeOffice.id).eq("user_id", context.profile.id);
        }

        const { data, error } = await query;
        if (error) throw new Error(error.message);

        const rows = (data ?? []) as AttendanceRow[];
        const officeIds = [...new Set(rows.map((row) => row.office_id).filter(Boolean))] as string[];
        const userIds = [...new Set(rows.map((row) => row.user_id).filter(Boolean))] as string[];

        const [officesResult, usersResult] = await Promise.all([
            officeIds.length ? db.from("offices").select("id, office_name, name").in("id", officeIds) : Promise.resolve({ data: [] as NamedRow[] }),
            userIds.length ? db.from("users").select("id, full_name, email").in("id", userIds) : Promise.resolve({ data: [] as NamedRow[] }),
        ]);

        const officeById = new Map(((officesResult.data ?? []) as NamedRow[]).map((office) => [office.id, office.office_name ?? office.name ?? "Office"]));
        const userById = new Map(((usersResult.data ?? []) as NamedRow[]).map((user) => [user.id, user.full_name ?? user.email ?? "Office user"]));

        return NextResponse.json({
            rows: rows.map((row) => ({
                id: row.id,
                attendanceDate: row.attendance_date,
                officeName: row.office_id ? officeById.get(row.office_id) ?? "Office" : "Office",
                recordedBy: row.user_id ? userById.get(row.user_id) ?? "Office user" : "Office user",
                checkInTime: row.check_in_time,
                checkOutTime: row.check_out_time,
                status: row.status ?? "not_checked_in",
                checkoutStatus: row.checkout_status ?? "not_checked_out",
                workDurationMinutes: row.work_duration_minutes ?? 0,
            })),
        });
    } catch (error) {
        return NextResponse.json(
            { rows: [], error: error instanceof Error ? error.message : "Attendance history could not load." },
            { status: 500 },
        );
    }
}
