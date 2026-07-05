"use server";

import { revalidatePath } from "next/cache";
import { logUserAction } from "@/lib/auth/audit";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AttendanceActionInput, AttendanceEventRow, GeofenceRow, OfficeDailyReportInput, UserDeviceRow } from "@/lib/attendance/types";

const TIME_ZONE = "Africa/Kampala";
const LATE_AFTER_MINUTES = 10 * 60;

function localDate(date = new Date()) {
    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    });
    return formatter.format(date);
}

function localMinutes(date = new Date()) {
    const formatter = new Intl.DateTimeFormat("en-GB", {
        timeZone: TIME_ZONE,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
    const [hour, minute] = formatter.format(date).split(":").map(Number);
    return hour * 60 + minute;
}

function eventLabel(eventType: AttendanceActionInput["eventType"]) {
    return eventType.replace(/_/g, " ");
}

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
    const toRadians = (value: number) => (value * Math.PI) / 180;
    const radius = 6371000;
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function attendanceWriteContext(employeeId: string, targetOfficeId?: string) {
    const context = await getAuthContext();
    if (!context.isAuthenticated || !context.profile) throw new Error("Authentication is required.");
    if (!context.activeCompany?.id || !context.activeOffice?.id) throw new Error("Active company and office are required.");
    const officeId = targetOfficeId || context.activeOffice.id;
    if (!context.offices.some((office) => office.id === officeId) && !context.canAccessAllOffices) {
        throw new Error("You do not have access to the selected work office.");
    }

    const supabase = await createSupabaseServerClient();
    const { data: employee, error } = await supabase
        .from("employees")
        .select("*")
        .eq("id", employeeId)
        .eq("company_id", context.activeCompany.id)
        .maybeSingle();

    if (error) throw new Error(error.message);
    if (!employee) throw new Error("Employee not found.");
    const assignmentType = String((employee as Record<string, unknown>).employee_assignment_type ?? "fixed_office");
    const fixedOfficeId = String((employee as Record<string, unknown>).office_id ?? "");
    if (assignmentType !== "all_rounder" && fixedOfficeId !== officeId) {
        throw new Error("Employee is not assigned to the selected office.");
    }

    const canManage = hasPermission(context, "attendance.manage");
    const isSelf = employee.user_id === context.profile.id;
    if (!canManage && !isSelf) throw new Error("You do not have permission to record attendance for this employee.");

    return { context, employee, canManage, officeId };
}

async function resolveDevice(input: AttendanceActionInput, userId: string, companyId: string) {
    if (!input.deviceFingerprint) return { device: null as UserDeviceRow | null, deviceStatus: "not_supplied" };

    const supabase = await createSupabaseServerClient();
    const { data: existing, error } = await supabase
        .from("user_devices")
        .select("*")
        .eq("company_id", companyId)
        .eq("user_id", userId)
        .eq("device_fingerprint", input.deviceFingerprint)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) throw new Error(error.message);

    if (existing) {
        await supabase.from("user_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", existing.id);
        return { device: existing, deviceStatus: existing.status };
    }

    const { data: created, error: createError } = await supabase
        .from("user_devices")
        .insert({
            company_id: companyId,
            device_fingerprint: input.deviceFingerprint,
            device_name: input.deviceName || "Browser device",
            last_seen_at: new Date().toISOString(),
            platform: input.platform || null,
            status: "pending",
            user_id: userId,
        })
        .select("*")
        .single();

    if (createError) throw new Error(createError.message);
    return { device: created, deviceStatus: "pending" };
}

async function resolveGps(input: AttendanceActionInput, companyId: string, officeId: string) {
    if (typeof input.latitude !== "number" || typeof input.longitude !== "number") {
        return { gpsValidationId: null as string | null, gpsPassed: null as boolean | null };
    }

    const supabase = await createSupabaseServerClient();
    const { data: geofences, error: geofenceError } = await supabase
        .from("geofences")
        .select("*")
        .eq("company_id", companyId)
        .eq("office_id", officeId)
        .eq("active", true);

    if (geofenceError) throw new Error(geofenceError.message);

    const nearest = nearestGeofence(input.latitude, input.longitude, geofences ?? []);
    const passed = nearest ? nearest.distance <= nearest.geofence.radius_meters : true;

    const { data, error } = await supabase
        .from("gps_validations")
        .insert({
            company_id: companyId,
            distance_meters: nearest ? Math.round(nearest.distance) : null,
            entity_type: "attendance_event",
            geofence_id: nearest?.geofence.id ?? null,
            latitude: input.latitude,
            longitude: input.longitude,
            office_id: officeId,
            passed,
        })
        .select("*")
        .single();

    if (error) throw new Error(error.message);
    return { gpsValidationId: data.id, gpsPassed: data.passed };
}

function nearestGeofence(latitude: number, longitude: number, geofences: GeofenceRow[]) {
    return geofences
        .map((geofence) => ({
            geofence,
            distance: distanceMeters(latitude, longitude, geofence.center_latitude, geofence.center_longitude),
        }))
        .sort((a, b) => a.distance - b.distance)[0] ?? null;
}

async function todayEvents(employeeId: string, companyId: string, officeId: string) {
    const today = localDate();
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
        .from("attendance_events")
        .select("*")
        .eq("company_id", companyId)
        .eq("office_id", officeId)
        .eq("employee_id", employeeId)
        .gte("event_time", `${today}T00:00:00+03:00`)
        .lte("event_time", `${today}T23:59:59+03:00`)
        .order("event_time", { ascending: true });

    if (error) throw new Error(error.message);
    return data ?? [];
}

function assertEventOrder(eventType: AttendanceActionInput["eventType"], events: AttendanceEventRow[]) {
    const hasCheckIn = events.some((event) => event.event_type === "check_in");
    const hasCheckOut = events.some((event) => event.event_type === "check_out");
    const latest = events[events.length - 1]?.event_type ?? null;

    if (eventType === "check_in" && hasCheckIn) throw new Error("This employee has already checked in today.");
    if (eventType === "start_break" && (!hasCheckIn || hasCheckOut || latest === "start_break")) {
        throw new Error("A break can only start after check-in and before check-out.");
    }
    if (eventType === "end_break" && latest !== "start_break") throw new Error("A break must be active before it can end.");
    if (eventType === "check_out" && (!hasCheckIn || hasCheckOut || latest === "start_break")) {
        throw new Error("Check-out requires an active checked-in session with no open break.");
    }
}

export async function recordAttendanceEvent(input: AttendanceActionInput) {
    const { context, employee, officeId } = await attendanceWriteContext(input.employeeId, input.officeId);
    const companyId = context.activeCompany!.id;

    if (employee.employee_pin && input.pin && employee.employee_pin !== input.pin) {
        throw new Error("Invalid employee PIN.");
    }
    if (employee.employee_pin && !input.pin && employee.user_id !== context.profile!.id) {
        throw new Error("Employee PIN is required.");
    }

    const existingEvents = await todayEvents(employee.id, companyId, officeId);
    assertEventOrder(input.eventType, existingEvents);

    const supabase = await createSupabaseServerClient();
    const { device, deviceStatus } = await resolveDevice(input, context.profile!.id, companyId);
    const { gpsValidationId, gpsPassed } = await resolveGps(input, companyId, officeId);
    const now = new Date();
    const isLate = input.eventType === "check_in" && localMinutes(now) > LATE_AFTER_MINUTES;
    const status = gpsPassed === false ? "gps_failed" : deviceStatus === "pending" ? "device_pending" : isLate ? "late" : "valid";

    const { data, error } = await supabase
        .from("attendance_events")
        .insert({
            company_id: companyId,
            device_id: device?.id ?? null,
            employee_id: employee.id,
            event_time: now.toISOString(),
            event_type: input.eventType,
            gps_validation_id: gpsValidationId,
            latitude: input.latitude ?? null,
            longitude: input.longitude ?? null,
            office_id: officeId,
            source: input.pin ? "pin" : "web",
            status,
            user_id: context.profile!.id,
        })
        .select("*")
        .single();

    if (error) throw new Error(error.message);

    await logUserAction({
        action: `attendance_${input.eventType}`,
        entityType: "attendance_event",
        entityId: data.id,
        companyId,
        officeId,
        afterData: {
            ...data,
            device_status: deviceStatus,
            gps_passed: gpsPassed,
        },
    });

    revalidatePath("/office/attendance");
    return { event: data, message: `${employee.full_name ?? "Employee"} ${eventLabel(input.eventType)} recorded.` };
}

export async function recordSelfAttendanceEvent(eventType: "check_in" | "check_out") {
    const context = await getAuthContext();
    if (!context.isAuthenticated || !context.profile) throw new Error("Authentication is required.");
    if (!context.activeCompany?.id || !context.activeOffice?.id) throw new Error("Active company and office are required.");
    const supabase = await createSupabaseServerClient();
    const rpc = supabase.rpc.bind(supabase) as unknown as (
        fn: "ddumba_v1_record_self_attendance",
        args: { p_event_type: "check_in" | "check_out"; p_office_id: string },
    ) => Promise<{ data: Array<{ event_id: string; employee_id: string; event_type: string; event_time: string; message: string }> | null; error: { message: string } | null }>;
    const { data, error } = await rpc("ddumba_v1_record_self_attendance", {
        p_event_type: eventType,
        p_office_id: context.activeOffice.id,
    });
    if (error) throw new Error(error.message);

    revalidatePath("/office", "layout");
    revalidatePath("/office/attendance");
    revalidatePath("/office/spreadsheet");
    return { event: data?.[0] ?? null, message: data?.[0]?.message ?? `Attendance ${eventLabel(eventType)} recorded.` };
}

export async function submitOfficeDailyReport(input: OfficeDailyReportInput) {
    const context = await getAuthContext();
    if (!context.isAuthenticated || !context.profile) throw new Error("Authentication is required.");
    if (!context.activeCompany?.id || !context.activeOffice?.id) throw new Error("Active company and office are required.");

    const supabase = await createSupabaseServerClient();
    const rpc = supabase.rpc.bind(supabase) as unknown as (
        fn: "ddumba_v1_submit_office_daily_report",
        args: {
            p_office_id: string;
            p_report_date: string;
            p_total_collections: number;
            p_total_expenses: number;
            p_landlord_payments: number;
            p_vacant_rooms: number;
            p_new_tenants: number;
            p_broken_promises: number;
            p_challenges_faced: string;
            p_general_office_notes: string;
        },
    ) => Promise<{ data: Array<{ report_id: string; submitted_at: string; message: string }> | null; error: { message: string } | null }>;

    const { data, error } = await rpc("ddumba_v1_submit_office_daily_report", {
        p_office_id: context.activeOffice.id,
        p_report_date: input.reportDate,
        p_total_collections: input.totalCollections,
        p_total_expenses: input.totalExpenses,
        p_landlord_payments: input.landlordPayments,
        p_vacant_rooms: input.vacantRooms,
        p_new_tenants: input.newTenants,
        p_broken_promises: input.brokenPromises,
        p_challenges_faced: input.challengesFaced,
        p_general_office_notes: input.generalOfficeNotes,
    });

    if (error) throw new Error(error.message);

    revalidatePath("/office", "layout");
    revalidatePath("/office/attendance");
    revalidatePath("/office/spreadsheet");
    return data?.[0] ?? { report_id: null, submitted_at: new Date().toISOString(), message: "Daily office report submitted." };
}

export async function saveEmployee(input: {
    employeeId?: string | null;
    officeId: string;
    fullName: string;
    email?: string;
    phone?: string;
    jobTitle?: string;
    pin?: string;
    status?: string;
}) {
    const context = await getAuthContext();
    if (!context.isAuthenticated || !context.profile) throw new Error("Authentication is required.");
    if (!context.activeCompany?.id) throw new Error("Active company is required.");
    if (!hasPermission(context, "attendance.manage") && !hasPermission(context, "settings.manage")) {
        throw new Error("You do not have permission to manage employees.");
    }
    if (!input.officeId) throw new Error("Office is required.");
    if (!input.fullName.trim()) throw new Error("Employee name is required.");
    const isAllRounder = input.officeId === "all_rounder";
    if (!isAllRounder && !context.canAccessAllOffices && !context.offices.some((office) => office.id === input.officeId)) {
        throw new Error("You do not have access to the selected office.");
    }

    type DbQuery = {
        select: (...args: unknown[]) => DbQuery;
        eq: (...args: unknown[]) => DbQuery;
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
        update: (payload: Record<string, unknown>) => DbQuery;
        insert: (payload: Record<string, unknown>) => DbQuery;
        single: () => Promise<{ data: Record<string, unknown>; error: { message: string } | null }>;
    };
    const db = createSupabaseAdminClient() as unknown as { from: (table: string) => DbQuery };
    const targetOfficeId = isAllRounder ? null : input.officeId;
    const basePayload: Record<string, unknown> = {
        company_id: context.activeCompany.id,
        office_id: targetOfficeId,
        default_office_id: targetOfficeId,
        primary_office_id: targetOfficeId,
        employee_assignment_type: isAllRounder ? "all_rounder" : "fixed_office",
        full_name: input.fullName.trim(),
        email: input.email?.trim() || null,
        phone: input.phone?.trim() || null,
        job_title: input.jobTitle?.trim() || null,
        role: input.jobTitle?.trim() || null,
        status: input.status || "active",
        is_field_agent: isAllRounder,
        updated_at: new Date().toISOString(),
    };
    if (input.pin?.trim()) basePayload.employee_pin = input.pin.trim();

    const { data: before } = input.employeeId
        ? await db.from("employees").select("*").eq("company_id", context.activeCompany.id).eq("id", input.employeeId).maybeSingle()
        : { data: null };
    const result = input.employeeId
        ? await db.from("employees").update(basePayload).eq("company_id", context.activeCompany.id).eq("id", input.employeeId).select("*").single()
        : await db.from("employees").insert({
            ...basePayload,
            employee_code: `EMP-${Date.now()}`,
            created_at: new Date().toISOString(),
        }).select("*").single();

    if (result.error) throw new Error(result.error.message);
    const savedEmployeeId = String(result.data.id ?? "");
    const beforeData = before ? JSON.parse(JSON.stringify(before)) as Parameters<typeof logUserAction>[0]["beforeData"] : undefined;
    const afterData = JSON.parse(JSON.stringify(result.data)) as Parameters<typeof logUserAction>[0]["afterData"];
    await logUserAction({
        action: input.employeeId ? "employee_updated" : "employee_created",
        entityType: "employee",
        entityId: savedEmployeeId,
        companyId: context.activeCompany.id,
        officeId: targetOfficeId,
        beforeData,
        afterData,
    });

    revalidatePath("/office/attendance");
    revalidatePath("/office/admin");
    return { employee_id: savedEmployeeId, message: isAllRounder ? "All Rounder employee saved." : "Employee saved." };
}
