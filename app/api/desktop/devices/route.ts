import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { OfflineDeviceRegistration } from "@/lib/offline/types";

type DynamicDb = {
    from: (table: string) => any;
};

export async function GET() {
    const context = await requireAuth();
    if (!context.activeCompany?.id || !context.profile?.id) {
        return NextResponse.json({ success: false, code: "AUTH_CONTEXT_MISSING", message: "Active company and user are required." }, { status: 400 });
    }

    const db = createSupabaseAdminClient() as unknown as DynamicDb;
    const query = db
        .from("desktop_devices")
        .select("id, device_id, device_name, app_version, platform, status, last_online_at, last_sync_at, pending_count, created_at")
        .eq("company_id", context.activeCompany.id)
        .order("last_online_at", { ascending: false, nullsFirst: false })
        .limit(100);

    const scopedQuery = context.isCompanyAdmin || context.isCompanyReadOnlyManager
        ? query
        : query.eq("user_id", context.profile.id);
    const { data, error } = await scopedQuery;
    if (error) {
        return NextResponse.json({ success: false, code: "DEVICE_LOOKUP_FAILED", message: "Desktop devices could not be loaded." }, { status: 500 });
    }

    return NextResponse.json({ success: true, devices: data ?? [] });
}

export async function POST(request: Request) {
    const context = await requireAuth();
    if (!context.activeCompany?.id || !context.profile?.id) {
        return NextResponse.json({ success: false, code: "AUTH_CONTEXT_MISSING", message: "Active company and user are required." }, { status: 400 });
    }

    const payload = await request.json().catch(() => null) as Partial<OfflineDeviceRegistration> | null;
    const deviceId = String(payload?.deviceId ?? "").trim();
    if (!deviceId) {
        return NextResponse.json({ success: false, code: "DEVICE_ID_REQUIRED", message: "Desktop device ID is required." }, { status: 400 });
    }

    const db = createSupabaseAdminClient() as unknown as DynamicDb;
    const now = new Date().toISOString();
    const { data, error } = await db
        .from("desktop_devices")
        .upsert({
            app_version: String(payload?.appVersion ?? "unknown").slice(0, 80),
            company_id: context.activeCompany.id,
            device_id: deviceId,
            device_name: String(payload?.deviceName ?? "Desktop device").slice(0, 160),
            employee_id: (context.profile as unknown as { employee_id?: string | null }).employee_id ?? null,
            last_online_at: now,
            office_id: context.activeOffice?.id ?? null,
            platform: String(payload?.platform ?? "desktop").slice(0, 80),
            status: "active",
            updated_at: now,
            user_agent: String(payload?.userAgent ?? request.headers.get("user-agent") ?? "").slice(0, 400),
            user_id: context.profile.id,
        }, { onConflict: "company_id,device_id" })
        .select("id, device_id, status, last_online_at")
        .single();

    if (error) {
        return NextResponse.json({ success: false, code: "DEVICE_REGISTRATION_FAILED", message: "Desktop device could not be registered." }, { status: 500 });
    }

    return NextResponse.json({ success: true, device: data });
}

export async function PATCH(request: Request) {
    const context = await requireAuth();
    if (!context.isCompanyAdmin || context.isOfficeMode || !context.activeCompany?.id || !context.profile?.id) {
        return NextResponse.json({ success: false, code: "PERMISSION_DENIED", message: "Only Admin may revoke desktop devices." }, { status: 403 });
    }

    const payload = await request.json().catch(() => null) as { deviceId?: string; reason?: string } | null;
    const deviceId = String(payload?.deviceId ?? "").trim();
    if (!deviceId) {
        return NextResponse.json({ success: false, code: "DEVICE_ID_REQUIRED", message: "Desktop device ID is required." }, { status: 400 });
    }

    const db = createSupabaseAdminClient() as unknown as DynamicDb;
    const { data, error } = await db
        .from("desktop_devices")
        .update({
            revoke_reason: String(payload?.reason ?? "Revoked by Admin").slice(0, 240),
            revoked_at: new Date().toISOString(),
            revoked_by: context.profile.id,
            status: "revoked",
            updated_at: new Date().toISOString(),
        })
        .eq("company_id", context.activeCompany.id)
        .eq("device_id", deviceId)
        .select("id, device_id, status, revoked_at")
        .maybeSingle();

    if (error) {
        return NextResponse.json({ success: false, code: "DEVICE_REVOKE_FAILED", message: "Desktop device could not be revoked." }, { status: 500 });
    }
    if (!data) {
        return NextResponse.json({ success: false, code: "DEVICE_NOT_FOUND", message: "Desktop device was not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true, device: data });
}
