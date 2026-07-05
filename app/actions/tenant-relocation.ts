"use server";

import { revalidatePath } from "next/cache";
import { canAccessOffice, requireCompanyAdminMode, requirePermission } from "@/lib/auth/permissions";
import { logUserAction } from "@/lib/auth/audit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type TenantRow = Database["public"]["Tables"]["tenants"]["Row"];
type LeaseRow = Database["public"]["Tables"]["leases"]["Row"];
type RoomRow = Database["public"]["Tables"]["rooms"]["Row"];
type PropertyRow = Database["public"]["Tables"]["properties"]["Row"];
type AuditJson = Database["public"]["Tables"]["audit_logs"]["Insert"]["after_data"];

type DynamicDb = {
    from: (table: string) => any;
};

type SubmitRelocationInput = {
    tenantId: string;
    newRoomId: string;
    relocationDate: string;
    reason?: string;
};

type DecideRelocationInput = {
    requestId: string;
    decision: "approved" | "rejected";
    adminComment?: string;
};

type RelocationSnapshot = {
    tenant: TenantRow;
    oldRoom: RoomRow;
    newRoom: RoomRow;
    activeLease: LeaseRow | null;
    oldProperty: PropertyRow | null;
    newProperty: PropertyRow | null;
    oldLandlordId: string | null;
    newLandlordId: string | null;
    oldRent: number;
    newRent: number;
    officeId: string;
};

function amount(value: unknown) {
    const number = Number(value ?? 0);
    return Number.isFinite(number) ? number : 0;
}

function dateOk(value: string) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime());
}

function isVacantStatus(value: string | null | undefined) {
    const status = String(value ?? "").toLowerCase();
    return status.includes("vacant") || status.includes("empty") || status === "available";
}

function billingDayFromDate(value: string) {
    const day = Number(value.slice(8, 10)) || 1;
    return Math.min(28, Math.max(1, day));
}

function revalidateRelocationSurfaces() {
    for (const path of [
        "/office/tenant-relocation",
        "/office/admin/tenant-relocation",
        "/office/vacant-rooms",
        "/office/admin/vacant-rooms",
        "/office/landlords",
        "/office/landlord-payments",
        "/office/defaulters",
        "/office/admin/defaulters",
        "/office/payments",
        "/office/admin/payments",
        "/office/collections",
        "/office/dashboard",
        "/office/admin",
        "/office/admin/statements",
        "/office/ai",
        "/office/notifications",
        "/office/audit",
        "/office/properties",
        "/office/spreadsheet",
    ]) {
        revalidatePath(path);
    }
}

export async function submitTenantRelocation(input: SubmitRelocationInput) {
    const context = await requirePermission("collections.manage");
    if (!context.activeCompany?.id) throw new Error("Active company is required.");
    const companyId = context.activeCompany.id;
    const tenantId = input.tenantId?.trim();
    const newRoomId = input.newRoomId?.trim();
    const relocationDate = input.relocationDate?.trim();
    const reason = input.reason?.trim() || null;
    if (!tenantId) throw new Error("Select the tenant being relocated.");
    if (!newRoomId) throw new Error("Select the new vacant room.");
    if (!dateOk(relocationDate)) throw new Error("Enter a valid relocation date.");

    const supabase = await createSupabaseServerClient();
    const db = supabase as unknown as DynamicDb;
    const snapshot = await loadRelocationSnapshot({ companyId, db, newRoomId, tenantId });

    if (!context.canAccessAllOffices && !context.isCompanyAdmin && !canAccessOffice(context, snapshot.officeId)) {
        throw new Error("You can only relocate tenants from your assigned office.");
    }
    if (!context.canAccessAllOffices && !context.isCompanyAdmin && !canAccessOffice(context, snapshot.newRoom.office_id)) {
        throw new Error("You can only move tenants into rooms in your assigned office.");
    }

    const isDirectAdmin = context.isCompanyAdmin && !context.isOfficeMode;
    const now = new Date().toISOString();
    const requestPayload = {
        company_id: companyId,
        office_id: snapshot.officeId,
        tenant_id: snapshot.tenant.id,
        old_room_id: snapshot.oldRoom.id,
        new_room_id: snapshot.newRoom.id,
        old_landlord_id: snapshot.oldLandlordId,
        new_landlord_id: snapshot.newLandlordId,
        old_lease_id: snapshot.activeLease?.id ?? null,
        old_rent: snapshot.oldRent,
        new_rent: snapshot.newRent,
        rent_difference: snapshot.newRent - snapshot.oldRent,
        relocation_date: relocationDate,
        status: isDirectAdmin ? "approved" : "pending",
        reason,
        requested_by: context.profile?.id ?? null,
        approved_by: isDirectAdmin ? context.profile?.id ?? null : null,
        approved_at: isDirectAdmin ? now : null,
        created_at: now,
        updated_at: now,
    };

    const { data: request, error: requestError } = await db
        .from("tenant_relocation_requests")
        .insert(requestPayload)
        .select("*")
        .single();
    if (requestError) throw new Error(requestError.message);

    if (isDirectAdmin) {
        const applied = await applyRelocation({
            companyId,
            db,
            relocationDate,
            requestId: String(request.id),
            snapshot,
            userId: context.profile?.id ?? null,
        });
        await db
            .from("tenant_relocation_requests")
            .update({ new_lease_id: applied.newLease.id, updated_at: new Date().toISOString() })
            .eq("id", request.id);
        await createRelocationNotifications({
            companyId,
            db,
            officeId: snapshot.newRoom.office_id ?? snapshot.officeId,
            recipient: "office",
            title: "Tenant relocated",
            message: `${snapshot.tenant.full_name ?? "Tenant"} moved from ${snapshot.oldRoom.room_number ?? "old room"} to ${snapshot.newRoom.room_number ?? "new room"}.`,
        });
        revalidateRelocationSurfaces();
        return { status: "approved", requestId: String(request.id), applied: true };
    }

    await createRelocationNotifications({
        companyId,
        db,
        officeId: snapshot.officeId,
        recipient: "admin",
        title: "Tenant relocation request",
        message: `${snapshot.tenant.full_name ?? "Tenant"} requested relocation from ${snapshot.oldRoom.room_number ?? "old room"} to ${snapshot.newRoom.room_number ?? "new room"}.`,
    });

    await logUserAction({
        action: "tenant_relocation_requested",
        entityType: "tenant_relocation_request",
        entityId: String(request.id),
        afterData: auditJson({ request, snapshot }),
        companyId,
        officeId: snapshot.officeId,
    });

    revalidateRelocationSurfaces();
    return { status: "pending", requestId: String(request.id), applied: false };
}

export async function decideTenantRelocationRequest(input: DecideRelocationInput) {
    const context = await requireCompanyAdminMode();
    if (!context.activeCompany?.id) throw new Error("Active company is required.");
    const companyId = context.activeCompany.id;
    const requestId = input.requestId?.trim();
    if (!requestId) throw new Error("Relocation request is required.");

    const supabase = await createSupabaseServerClient();
    const db = supabase as unknown as DynamicDb;
    const { data: request, error: requestError } = await db
        .from("tenant_relocation_requests")
        .select("*")
        .eq("id", requestId)
        .eq("company_id", companyId)
        .maybeSingle();
    if (requestError) throw new Error(requestError.message);
    if (!request) throw new Error("Relocation request not found.");
    if (String(request.status) !== "pending") throw new Error("This relocation request has already been decided.");

    const now = new Date().toISOString();
    if (input.decision === "rejected") {
        const { data: rejected, error } = await db
            .from("tenant_relocation_requests")
            .update({
                admin_comment: input.adminComment?.trim() || null,
                approved_by: context.profile?.id ?? null,
                rejected_at: now,
                status: "rejected",
                updated_at: now,
            })
            .eq("id", requestId)
            .select("*")
            .single();
        if (error) throw new Error(error.message);
        await createRelocationNotifications({
            companyId,
            db,
            officeId: String(request.office_id),
            recipient: "office",
            title: "Relocation rejected",
            message: `Tenant relocation request was rejected. ${input.adminComment?.trim() || ""}`.trim(),
        });
        await logUserAction({
            action: "tenant_relocation_rejected",
            entityType: "tenant_relocation_request",
            entityId: requestId,
            beforeData: auditJson(request),
            afterData: auditJson(rejected),
            companyId,
            officeId: String(request.office_id),
        });
        revalidateRelocationSurfaces();
        return { status: "rejected" };
    }

    const snapshot = await loadRelocationSnapshot({
        companyId,
        db,
        newRoomId: String(request.new_room_id),
        tenantId: String(request.tenant_id),
    });
    const applied = await applyRelocation({
        companyId,
        db,
        relocationDate: String(request.relocation_date),
        requestId,
        snapshot,
        userId: context.profile?.id ?? null,
    });
    const { data: approved, error } = await db
        .from("tenant_relocation_requests")
        .update({
            admin_comment: input.adminComment?.trim() || null,
            approved_at: now,
            approved_by: context.profile?.id ?? null,
            new_lease_id: applied.newLease.id,
            status: "approved",
            updated_at: now,
        })
        .eq("id", requestId)
        .select("*")
        .single();
    if (error) throw new Error(error.message);

    await createRelocationNotifications({
        companyId,
        db,
        officeId: snapshot.newRoom.office_id ?? snapshot.officeId,
        recipient: "office",
        title: "Relocation approved",
        message: `${snapshot.tenant.full_name ?? "Tenant"} has been moved to room ${snapshot.newRoom.room_number ?? "new room"}.`,
    });
    await logUserAction({
        action: "tenant_relocation_approved",
        entityType: "tenant_relocation_request",
        entityId: requestId,
        beforeData: auditJson(request),
        afterData: auditJson({ approved, applied }),
        companyId,
        officeId: snapshot.officeId,
    });
    revalidateRelocationSurfaces();
    return { status: "approved" };
}

async function loadRelocationSnapshot({
    companyId,
    db,
    newRoomId,
    tenantId,
}: {
    companyId: string;
    db: DynamicDb;
    newRoomId: string;
    tenantId: string;
}): Promise<RelocationSnapshot> {
    const [tenantResult, activeLeaseResult, newRoomResult] = await Promise.all([
        db.from("tenants").select("*").eq("id", tenantId).eq("company_id", companyId).maybeSingle(),
        db.from("leases").select("*").eq("tenant_id", tenantId).eq("company_id", companyId).eq("status", "active").maybeSingle(),
        db.from("rooms").select("*").eq("id", newRoomId).eq("company_id", companyId).maybeSingle(),
    ]);
    if (tenantResult.error) throw new Error(tenantResult.error.message);
    if (activeLeaseResult.error) throw new Error(activeLeaseResult.error.message);
    if (newRoomResult.error) throw new Error(newRoomResult.error.message);
    const tenant = tenantResult.data as TenantRow | null;
    const activeLease = activeLeaseResult.data as LeaseRow | null;
    const newRoom = newRoomResult.data as RoomRow | null;
    if (!tenant) throw new Error("Tenant not found.");
    if (!newRoom) throw new Error("New room not found.");
    const oldRoomId = activeLease?.room_id ?? tenant.room_id;
    if (!oldRoomId) throw new Error("Tenant is not currently assigned to a room.");
    if (oldRoomId === newRoom.id) throw new Error("Select a different room for relocation.");

    const { data: oldRoom, error: oldRoomError } = await db
        .from("rooms")
        .select("*")
        .eq("id", oldRoomId)
        .eq("company_id", companyId)
        .maybeSingle();
    if (oldRoomError) throw new Error(oldRoomError.message);
    if (!oldRoom) throw new Error("Current room not found.");

    const { data: newRoomLease, error: newLeaseError } = await db
        .from("leases")
        .select("id")
        .eq("room_id", newRoom.id)
        .eq("company_id", companyId)
        .eq("status", "active")
        .maybeSingle();
    if (newLeaseError) throw new Error(newLeaseError.message);
    if (newRoomLease || !isVacantStatus(newRoom.status)) throw new Error("The selected new room is not vacant.");
    if (!newRoom.office_id) throw new Error("New room must be linked to an office before relocation.");
    if (!newRoom.property_id) throw new Error("New room must be linked to a property before relocation.");

    const [oldPropertyResult, newPropertyResult] = await Promise.all([
        (oldRoom.property_id ?? tenant.property_id ?? activeLease?.property_id)
            ? db.from("properties").select("*").eq("id", oldRoom.property_id ?? tenant.property_id ?? activeLease?.property_id).eq("company_id", companyId).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        db.from("properties").select("*").eq("id", newRoom.property_id).eq("company_id", companyId).maybeSingle(),
    ]);
    if (oldPropertyResult.error) throw new Error(oldPropertyResult.error.message);
    if (newPropertyResult.error) throw new Error(newPropertyResult.error.message);
    const oldProperty = oldPropertyResult.data as PropertyRow | null;
    const newProperty = newPropertyResult.data as PropertyRow | null;
    if (!newProperty) throw new Error("New room property not found.");

    const officeId = activeLease?.office_id ?? oldRoom.office_id ?? tenant.office_id ?? newRoom.office_id;
    if (!officeId) throw new Error("Current office could not be resolved.");
    return {
        tenant,
        oldRoom,
        newRoom,
        activeLease,
        oldProperty,
        newProperty,
        oldLandlordId: oldRoom.landlord_id ?? oldProperty?.landlord_id ?? null,
        newLandlordId: newRoom.landlord_id ?? newProperty.landlord_id ?? null,
        oldRent: amount(activeLease?.monthly_rent ?? oldRoom.monthly_rent ?? tenant.monthly_rent),
        newRent: amount(newRoom.monthly_rent),
        officeId,
    };
}

async function applyRelocation({
    companyId,
    db,
    relocationDate,
    requestId,
    snapshot,
    userId,
}: {
    companyId: string;
    db: DynamicDb;
    relocationDate: string;
    requestId: string;
    snapshot: RelocationSnapshot;
    userId: string | null;
}) {
    const now = new Date().toISOString();
    if (snapshot.activeLease) {
        const { error } = await db
            .from("leases")
            .update({ end_date: relocationDate, status: "terminated", updated_at: now })
            .eq("id", snapshot.activeLease.id);
        if (error) throw new Error(error.message);
    }

    const newLeasePayload = {
        billing_day: snapshot.activeLease?.billing_day ?? billingDayFromDate(relocationDate),
        company_id: companyId,
        deposit_amount: 0,
        monthly_rent: snapshot.newRent,
        office_id: snapshot.newRoom.office_id,
        property_id: snapshot.newRoom.property_id,
        room_id: snapshot.newRoom.id,
        start_date: relocationDate,
        status: "active",
        tenant_id: snapshot.tenant.id,
    };
    const { data: newLease, error: leaseError } = await db
        .from("leases")
        .insert(newLeasePayload)
        .select("*")
        .single();
    if (leaseError) throw new Error(leaseError.message);

    const { data: updatedTenant, error: tenantError } = await db
        .from("tenants")
        .update({
            monthly_rent: snapshot.newRent,
            office_id: snapshot.newRoom.office_id,
            property_id: snapshot.newRoom.property_id,
            room_id: snapshot.newRoom.id,
            status: "active",
            updated_at: now,
        })
        .eq("id", snapshot.tenant.id)
        .select("*")
        .single();
    if (tenantError) throw new Error(tenantError.message);

    const [oldRoomUpdate, newRoomUpdate, oldHistory, newHistory, promisesUpdate, actionInsert] = await Promise.all([
        db.from("rooms").update({ outstanding_balance: 0, status: "vacant", updated_at: now }).eq("id", snapshot.oldRoom.id),
        db.from("rooms").update({ outstanding_balance: amount(snapshot.tenant.balance), status: "occupied", updated_at: now }).eq("id", snapshot.newRoom.id),
        db.from("room_status_history").insert({
            changed_by: userId,
            company_id: companyId,
            office_id: snapshot.officeId,
            old_status: snapshot.oldRoom.status,
            new_status: "vacant",
            reason: `Tenant relocated to room ${snapshot.newRoom.room_number ?? "new room"}.`,
            room_id: snapshot.oldRoom.id,
        }),
        db.from("room_status_history").insert({
            changed_by: userId,
            company_id: companyId,
            office_id: snapshot.newRoom.office_id,
            old_status: snapshot.newRoom.status,
            new_status: "occupied",
            reason: `Tenant relocated from room ${snapshot.oldRoom.room_number ?? "old room"}.`,
            room_id: snapshot.newRoom.id,
        }),
        db.from("promises").update({
            lease_id: newLease.id,
            office_id: snapshot.newRoom.office_id,
            room_id: snapshot.newRoom.id,
            updated_at: now,
        }).eq("tenant_id", snapshot.tenant.id).neq("status", "fulfilled"),
        db.from("collection_actions").insert({
            action_type: "tenant_relocated",
            company_id: companyId,
            lease_id: newLease.id,
            notes: `Moved from room ${snapshot.oldRoom.room_number ?? "old room"} to ${snapshot.newRoom.room_number ?? "new room"}. Request ${requestId}.`,
            office_id: snapshot.newRoom.office_id,
            outcome: "relocated",
            performed_by: userId,
            tenant_id: snapshot.tenant.id,
        }),
    ]);
    for (const result of [oldRoomUpdate, newRoomUpdate, oldHistory, newHistory, promisesUpdate, actionInsert]) {
        if (result.error) throw new Error(result.error.message);
    }

    await logUserAction({
        action: "tenant_relocated",
        entityType: "tenant",
        entityId: snapshot.tenant.id,
        beforeData: auditJson({ tenant: snapshot.tenant, lease: snapshot.activeLease, oldRoom: snapshot.oldRoom, newRoom: snapshot.newRoom }),
        afterData: auditJson({ tenant: updatedTenant, newLease, oldRoomStatus: "vacant", newRoomStatus: "occupied", requestId }),
        companyId,
        officeId: snapshot.newRoom.office_id,
    });

    return { newLease, updatedTenant };
}

async function createRelocationNotifications({
    companyId,
    db,
    message,
    officeId,
    recipient,
    title,
}: {
    companyId: string;
    db: DynamicDb;
    message: string;
    officeId: string | null;
    recipient: "admin" | "office";
    title: string;
}) {
    const { error } = await db.from("notifications").insert({
        channel: "in_app",
        company_id: companyId,
        created_at: new Date().toISOString(),
        delivery_status: "pending",
        is_read: false,
        message,
        office_id: officeId,
        recipient_type: recipient,
        title,
    });
    if (error) console.warn("Relocation notification failed:", error.message);
}

function auditJson(value: unknown): AuditJson {
    return JSON.parse(JSON.stringify(value)) as AuditJson;
}
