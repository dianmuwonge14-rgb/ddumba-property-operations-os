"use server";

import { revalidatePath } from "next/cache";
import { canAccessOffice, requirePermission } from "@/lib/auth/permissions";
import { logUserAction } from "@/lib/auth/audit";
import { createNotificationWithEmail } from "@/lib/notifications/email";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPropertyInActiveOffice, getRoomInActiveOffice } from "@/lib/properties/data";
import type {
    ArchivePropertyInput,
    CreateLandlordWithRoomsBulkInput,
    CreatePropertyInput,
    CreateRoomInput,
    EditPropertyInput,
    EditRoomInput,
    UpdateRoomStatusInput,
} from "@/lib/properties/types";

type LooseSupabase = { from: (table: string) => any; rpc?: (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };

async function activeWriteContext() {
    const context = await requirePermission("properties.manage");
    if (!context.activeCompany?.id || !context.activeOffice?.id) {
        throw new Error("Active company and office are required.");
    }
    return context;
}

function normalizeName(value: string) {
    const name = value.trim();
    if (!name) throw new Error("Property name is required.");
    return name;
}

function normalizeRoomNumber(value: string) {
    const roomNumber = value.trim().toUpperCase();
    if (!roomNumber) throw new Error("Room number is required.");
    return roomNumber;
}

function amount(value: unknown) {
    const numeric = Number(value ?? 0);
    return Number.isFinite(numeric) ? numeric : 0;
}

function text(value: unknown) {
    return String(value ?? "").trim();
}

function tenantCode(roomNumber: string) {
    return `TEN-${roomNumber.replace(/[^A-Z0-9]/gi, "").toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
}

function revalidatePropertySurfaces() {
    for (const path of [
        "/office/properties",
        "/office/landlords",
        "/office/vacant-rooms",
        "/office/admin/vacant-rooms",
        "/office/payments",
        "/office/defaulters",
        "/office/admin/defaulters",
        "/office/dashboard",
        "/office/admin",
        "/office/spreadsheet",
        "/office/audit",
        "/office/notifications",
    ]) {
        revalidatePath(path);
    }
}

function summarizeBulkRooms(input: CreateLandlordWithRoomsBulkInput) {
    const totalRooms = input.rooms.length;
    const occupiedRooms = input.rooms.filter((room) => room.status === "occupied").length;
    const vacantRooms = totalRooms - occupiedRooms;
    const rentRoll = input.rooms.reduce((total, room) => total + amount(room.monthlyRent), 0);
    const openingOutstanding = input.rooms.reduce((total, room) => total + (room.outstandingMode === "has_outstanding" ? amount(room.outstandingBalance) : 0), 0);
    const expectedCommission = input.commissionType === "percentage" ? rentRoll * (amount(input.commissionValue) / 100) : amount(input.commissionValue);
    return { totalRooms, occupiedRooms, vacantRooms, rentRoll, openingOutstanding, expectedCommission };
}

async function notifyAdmin(supabase: LooseSupabase, input: {
    companyId: string;
    officeId: string;
    entityId: string;
    message: string;
    title: string;
}) {
    await createNotificationWithEmail(supabase, {
        action_url: "/office/notifications",
        channel: "in_app",
        company_id: input.companyId,
        delivery_status: "pending",
        entity_id: input.entityId,
        entity_type: "landlord_bulk_room_request",
        is_read: false,
        message: input.message,
        office_id: input.officeId,
        recipient_type: "admin",
        severity: "warning",
        title: input.title,
    });
}

async function notifyOffice(supabase: LooseSupabase, input: {
    companyId: string;
    officeId: string;
    entityId: string;
    message: string;
    title: string;
    severity?: string;
}) {
    await createNotificationWithEmail(supabase, {
        action_url: "/office/notifications",
        channel: "in_app",
        company_id: input.companyId,
        delivery_status: "pending",
        entity_id: input.entityId,
        entity_type: "landlord_bulk_room_request",
        is_read: false,
        message: input.message,
        office_id: input.officeId,
        recipient_type: "office",
        severity: input.severity ?? "information",
        title: input.title,
    });
}

async function completeAdminBulkRoomNotification(supabase: LooseSupabase, requestId: string) {
    await supabase
        .from("notifications")
        .update({ delivery_status: "completed", is_read: true })
        .eq("entity_type", "landlord_bulk_room_request")
        .eq("entity_id", requestId)
        .eq("recipient_type", "admin");
}

async function refreshLandlordSearchIndex(supabase: LooseSupabase, landlordId: string) {
    if (!supabase.rpc) return;
    const { error } = await supabase.rpc("ddumba_v1_refresh_landlord_search_index", { p_landlord_id: landlordId });
    if (error) {
        console.warn(`Landlord search index refresh failed for ${landlordId}: ${error.message}`);
    }
}

async function findMaterializedLandlordForRequest(supabase: LooseSupabase, input: {
    companyId: string;
    officeId: string;
    landlordName: string;
    phone?: string | null;
    roomNumbers: string[];
}) {
    let landlordQuery = supabase
        .from("landlords")
        .select("*")
        .eq("company_id", input.companyId)
        .ilike("full_name", input.landlordName)
        .neq("status", "archived")
        .limit(5);
    if (input.phone) landlordQuery = landlordQuery.eq("phone", input.phone);
    const { data: landlords, error } = await landlordQuery;
    if (error) throw new Error(error.message);
    for (const landlord of landlords ?? []) {
        if (!input.roomNumbers.length) return landlord;
        const { data: rooms, error: roomsError } = await supabase
            .from("rooms")
            .select("id")
            .eq("company_id", input.companyId)
            .eq("office_id", input.officeId)
            .eq("landlord_id", landlord.id)
            .in("room_number", input.roomNumbers)
            .limit(input.roomNumbers.length);
        if (roomsError) throw new Error(roomsError.message);
        if ((rooms ?? []).length > 0) return landlord;
    }
    return null;
}

async function getOrCreateBulkProperty(supabase: LooseSupabase, input: {
    companyId: string;
    createdPropertyIds: string[];
    landlordId: string;
    officeId: string;
    propertyId?: string;
    propertyName?: string;
}) {
    if (input.propertyId) {
        const { data, error } = await supabase.from("properties").select("*").eq("company_id", input.companyId).eq("office_id", input.officeId).eq("id", input.propertyId).maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) throw new Error("Selected property/location was not found in this office.");
        return data;
    }
    const propertyName = normalizeName(input.propertyName || "New Landlord Rooms");
    const { data: existing, error: existingError } = await supabase
        .from("properties")
        .select("*")
        .eq("company_id", input.companyId)
        .eq("office_id", input.officeId)
        .ilike("property_name", propertyName)
        .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (existing) return existing;
    const code = `PROP-${propertyName.replace(/[^A-Z0-9]/gi, "").slice(0, 10).toUpperCase() || "LOC"}-${Date.now().toString(36).toUpperCase()}`;
    const { data, error } = await supabase
        .from("properties")
        .insert({
            address: propertyName,
            code,
            company_id: input.companyId,
            landlord_id: input.landlordId,
            name: propertyName,
            office_id: input.officeId,
            property_name: propertyName,
            property_type: "mixed_use",
            status: "active",
            total_units: null,
        })
        .select("*")
        .single();
    if (error) throw new Error(error.message);
    input.createdPropertyIds.push(data.id);
    return data;
}

async function validateBulkInput(supabase: LooseSupabase, input: CreateLandlordWithRoomsBulkInput, companyId: string, officeId: string) {
    const landlordName = normalizeName(input.landlordName);
    if (!input.rooms.length) throw new Error("Add at least one room.");
    const duplicateLandlord = await supabase
        .from("landlords")
        .select("id,full_name")
        .eq("company_id", companyId)
        .ilike("full_name", landlordName)
        .limit(1);
    if (duplicateLandlord.error) throw new Error(duplicateLandlord.error.message);
    if ((duplicateLandlord.data ?? []).length) throw new Error("A landlord with this name already exists. Select the existing landlord instead.");

    const seen = new Set<string>();
    for (const room of input.rooms) {
        const roomNumber = normalizeRoomNumber(room.roomNumber);
        const rent = amount(room.monthlyRent);
        if (rent <= 0) throw new Error(`Room ${roomNumber} needs a valid monthly rent.`);
        const propertyKey = room.propertyId || text(room.propertyName).toLowerCase();
        if (!propertyKey) throw new Error(`Room ${roomNumber} needs a property/location.`);
        const key = `${propertyKey}:${roomNumber}`;
        if (seen.has(key)) throw new Error(`Duplicate room ${roomNumber} in the same property/location.`);
        seen.add(key);
        if (room.propertyId) {
            const duplicateRoom = await supabase
                .from("rooms")
                .select("id")
                .eq("company_id", companyId)
                .eq("office_id", officeId)
                .eq("property_id", room.propertyId)
                .ilike("room_number", roomNumber)
                .limit(1);
            if (duplicateRoom.error) throw new Error(duplicateRoom.error.message);
            if ((duplicateRoom.data ?? []).length) throw new Error(`Room ${roomNumber} already exists in the selected property.`);
        }
        if (room.status === "occupied") {
            if (!text(room.tenantName)) throw new Error(`Room ${roomNumber} is occupied, so tenant name is required.`);
            if (!text(room.tenantPhone)) throw new Error(`Room ${roomNumber} is occupied, so tenant phone is required.`);
            if (room.outstandingMode === "has_outstanding" && amount(room.outstandingBalance) <= 0) {
                throw new Error(`Room ${roomNumber} needs a valid opening outstanding balance.`);
            }
        }
    }
}

export async function createLandlordWithRoomsBulk(input: CreateLandlordWithRoomsBulkInput) {
    const context = await requirePermission("properties.manage");
    const supabase = await createSupabaseServerClient();
    const db = supabase as unknown as LooseSupabase;
    const companyId = context.activeCompany?.id;
    if (!companyId) throw new Error("Active company is required.");
    const isAdmin = context.isCompanyAdmin && !context.isOfficeMode;
    const officeId = isAdmin ? input.officeId : context.activeOffice?.id;
    if (!officeId) throw new Error("Office is required.");
    if (!canAccessOffice(context, officeId)) throw new Error("You cannot create records for this office.");

    await validateBulkInput(db, input, companyId, officeId);
    const actorId = context.profile?.id ?? null;
    const summary = summarizeBulkRooms(input);
    const landlordPayload = {
        landlordName: normalizeName(input.landlordName),
        phone: text(input.phone) || null,
        email: text(input.email) || null,
        nationalId: text(input.nationalId) || null,
        paymentMethods: text(input.paymentMethods) || null,
        commissionType: input.commissionType,
        commissionValue: amount(input.commissionValue),
        notes: text(input.notes) || null,
    };

    if (!isAdmin) {
        const { data, error } = await db
            .from("landlord_bulk_room_requests")
            .insert({
                company_id: companyId,
                landlord_payload: landlordPayload,
                office_id: officeId,
                requested_by: actorId,
                rooms_payload: input.rooms,
                status: "pending",
                summary,
            })
            .select("*")
            .single();
        if (error) throw new Error(`Pending request could not be created. Apply migration 0183_landlord_bulk_room_requests first. ${error.message}`);
        await notifyAdmin(db, {
            companyId,
            officeId,
            entityId: data.id,
            title: "New landlord + rooms pending approval",
            message: `${landlordPayload.landlordName} submitted with ${summary.totalRooms} rooms for Admin approval.`,
        });
        await logUserAction({ action: "landlord_bulk_rooms_requested", entityType: "landlord_bulk_room_request", entityId: data.id, companyId, officeId, afterData: data });
        revalidatePropertySurfaces();
        return { status: "pending", message: "Submitted for Admin approval. Live landlord and room counts were not changed." };
    }

    const created = { landlordId: "", propertyIds: [] as string[], roomIds: [] as string[], tenantIds: [] as string[], leaseIds: [] as string[] };
    try {
        const { data: landlord, error: landlordError } = await db
            .from("landlords")
            .insert({
                commission_input_mode: input.commissionType === "fixed_amount" ? "fixed_amount" : "percentage",
                commission_rate: input.commissionType === "percentage" ? amount(input.commissionValue) : null,
                company_id: companyId,
                email: landlordPayload.email,
                full_name: landlordPayload.landlordName,
                national_id: landlordPayload.nationalId,
                phone: landlordPayload.phone,
                status: "active",
            })
            .select("*")
            .single();
        if (landlordError) throw new Error(landlordError.message);
        created.landlordId = landlord.id;

        for (const draft of input.rooms) {
            const property = await getOrCreateBulkProperty(db, {
                companyId,
                createdPropertyIds: created.propertyIds,
                landlordId: landlord.id,
                officeId,
                propertyId: draft.propertyId,
                propertyName: draft.propertyName,
            });
            await db.from("properties").update({ landlord_id: landlord.id }).eq("id", property.id).eq("company_id", companyId);
            const rent = amount(draft.monthlyRent);
            const status = draft.status === "occupied" ? "occupied" : "vacant";
            const startDate = draft.startDate || draft.moveInDate || new Date().toISOString().slice(0, 10);
            const openingBalance = draft.status === "occupied" && draft.outstandingMode === "has_outstanding" ? amount(draft.outstandingBalance) : 0;
            const { data: room, error: roomError } = await db
                .from("rooms")
                .insert({
                    company_id: companyId,
                    effective_start_date: startDate,
                    landlord_id: landlord.id,
                    monthly_rent: rent,
                    office_id: officeId,
                    outstanding_balance: openingBalance,
                    payable_notes: draft.notes || null,
                    property_id: property.id,
                    room_number: normalizeRoomNumber(draft.roomNumber),
                    status,
                })
                .select("*")
                .single();
            if (roomError) throw new Error(roomError.message);
            created.roomIds.push(room.id);
            await db.from("room_status_history").insert({
                changed_by: actorId,
                company_id: companyId,
                office_id: officeId,
                new_status: status,
                old_status: null,
                reason: draft.notes || "New landlord bulk room creation",
                room_id: room.id,
            });
            if (draft.status === "occupied") {
                const moveInDate = draft.moveInDate || startDate;
                const { data: tenant, error: tenantError } = await db
                    .from("tenants")
                    .insert({
                        balance: openingBalance,
                        company_id: companyId,
                        full_name: text(draft.tenantName),
                        monthly_rent: rent,
                        national_id: text(draft.tenantNationalId) || null,
                        office_id: officeId,
                        phone: text(draft.tenantPhone) || null,
                        property_id: property.id,
                        room_id: room.id,
                        status: "active",
                        tenant_code: tenantCode(String(draft.roomNumber)),
                        tenant_type: "individual",
                    })
                    .select("*")
                    .single();
                if (tenantError) throw new Error(tenantError.message);
                created.tenantIds.push(tenant.id);
                const { data: lease, error: leaseError } = await db
                    .from("leases")
                    .insert({
                        billing_day: Math.min(28, Math.max(1, new Date(`${moveInDate}T00:00:00`).getDate())),
                        company_id: companyId,
                        monthly_rent: rent,
                        office_id: officeId,
                        property_id: property.id,
                        room_id: room.id,
                        start_date: moveInDate,
                        status: "active",
                        tenant_id: tenant.id,
                    })
                    .select("*")
                    .single();
                if (leaseError) throw new Error(leaseError.message);
                created.leaseIds.push(lease.id);
            }
        }

        await logUserAction({
            action: "landlord_bulk_rooms_created_live",
            entityType: "landlord",
            entityId: landlord.id,
            companyId,
            officeId,
            afterData: { landlord, rooms: input.rooms, summary },
        });
        await refreshLandlordSearchIndex(db, landlord.id);
        revalidatePropertySurfaces();
        return { status: "approved", landlordId: landlord.id, message: `Saved live: ${landlordPayload.landlordName}, ${summary.totalRooms} rooms, ${summary.occupiedRooms} occupied, ${summary.vacantRooms} vacant.` };
    } catch (error) {
        if (created.leaseIds.length) await db.from("leases").delete().in("id", created.leaseIds);
        if (created.tenantIds.length) await db.from("tenants").delete().in("id", created.tenantIds);
        if (created.roomIds.length) await db.from("rooms").delete().in("id", created.roomIds);
        if (created.propertyIds.length) await db.from("properties").delete().in("id", created.propertyIds);
        if (created.landlordId) await db.from("landlords").delete().eq("id", created.landlordId);
        throw error;
    }
}

export async function reviewLandlordBulkRoomRequest(input: { requestId: string; decision: "approved" | "rejected"; adminComment?: string }) {
    const context = await requirePermission("properties.manage");
    if (!context.isCompanyAdmin || context.isOfficeMode) {
        throw new Error("Only Admin can approve or reject new landlord + rooms requests.");
    }
    const supabase = await createSupabaseServerClient();
    const db = supabase as unknown as LooseSupabase;
    const companyId = context.activeCompany?.id;
    if (!companyId) throw new Error("Active company is required.");
    const { data: request, error } = await db
        .from("landlord_bulk_room_requests")
        .select("*")
        .eq("company_id", companyId)
        .eq("id", input.requestId)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!request) throw new Error("Request was not found.");
    if (request.status === "rejected") throw new Error("Rejected requests cannot be approved without a new office submission.");
    if (request.status !== "pending" && !(request.status === "approved" && !request.created_landlord_id && input.decision === "approved")) {
        throw new Error("Only pending requests can be reviewed. Approved requests can only be repaired if live materialization was incomplete.");
    }

    const actorId = context.profile?.id ?? null;
    if (input.decision === "rejected") {
        const { error: updateError } = await db
            .from("landlord_bulk_room_requests")
            .update({
                admin_comment: text(input.adminComment) || null,
                reviewed_at: new Date().toISOString(),
                reviewed_by: actorId,
                status: "rejected",
                updated_at: new Date().toISOString(),
            })
            .eq("id", input.requestId);
        if (updateError) throw new Error(updateError.message);
        await completeAdminBulkRoomNotification(db, input.requestId);
        await notifyOffice(db, {
            companyId,
            officeId: request.office_id,
            entityId: input.requestId,
            title: "New landlord + rooms rejected",
            message: `Admin rejected ${request.landlord_payload?.landlordName ?? "the landlord inventory request"}${input.adminComment ? `: ${input.adminComment}` : "."}`,
            severity: "warning",
        });
        await logUserAction({ action: "landlord_bulk_rooms_rejected", entityType: "landlord_bulk_room_request", entityId: input.requestId, companyId, officeId: request.office_id, afterData: { adminComment: input.adminComment } });
        revalidatePropertySurfaces();
        return { status: "rejected", message: "Request rejected. No live landlord, room, or tenant data was changed." };
    }

    const landlordPayload = request.landlord_payload ?? {};
    const roomsPayload = Array.isArray(request.rooms_payload) ? request.rooms_payload : [];
    const requestLandlordName = text(landlordPayload.landlordName ?? landlordPayload.fullName);
    const existingMaterializedLandlord = await findMaterializedLandlordForRequest(db, {
        companyId,
        officeId: request.office_id,
        landlordName: requestLandlordName,
        phone: text(landlordPayload.phone) || null,
        roomNumbers: roomsPayload
            .map((room: { roomNumber?: string; room_number?: string }) => text(room.roomNumber ?? room.room_number))
            .filter(Boolean)
            .map((roomNumber: string) => normalizeRoomNumber(roomNumber)),
    });
    const creationResult = existingMaterializedLandlord ? null : await createLandlordWithRoomsBulk({
        officeId: request.office_id,
        landlordName: requestLandlordName,
        phone: text(landlordPayload.phone) || undefined,
        email: text(landlordPayload.email) || undefined,
        nationalId: text(landlordPayload.nationalId) || undefined,
        paymentMethods: text(landlordPayload.paymentMethods) || undefined,
        commissionType: landlordPayload.commissionType === "fixed_amount" ? "fixed_amount" : "percentage",
        commissionValue: amount(landlordPayload.commissionValue),
        notes: text(landlordPayload.notes) || undefined,
        rooms: roomsPayload,
    });
    const materializedLandlordId = existingMaterializedLandlord?.id ?? creationResult?.landlordId ?? null;
    if (!materializedLandlordId) throw new Error("Approval could not determine the live landlord record.");
    await refreshLandlordSearchIndex(db, materializedLandlordId);
    const { error: updateError } = await db
        .from("landlord_bulk_room_requests")
        .update({
            admin_comment: text(input.adminComment) || null,
            created_landlord_id: materializedLandlordId,
            reviewed_at: new Date().toISOString(),
            reviewed_by: actorId,
            status: "approved",
            updated_at: new Date().toISOString(),
        })
        .eq("id", input.requestId);
    if (updateError) throw new Error(updateError.message);
    await completeAdminBulkRoomNotification(db, input.requestId);
    await notifyOffice(db, {
        companyId,
        officeId: request.office_id,
        entityId: input.requestId,
        title: "New landlord + rooms approved",
        message: `Admin approved ${landlordPayload.landlordName ?? "the landlord inventory request"}. Landlord, rooms, tenants, and vacant rooms are now live.`,
        severity: "success",
    });
    await logUserAction({ action: "landlord_bulk_rooms_approved", entityType: "landlord_bulk_room_request", entityId: input.requestId, companyId, officeId: request.office_id, afterData: request });
    revalidatePropertySurfaces();
    return { status: "approved", message: "Request approved. Landlord, rooms, occupied tenants, and vacant inventory are now live." };
}

export async function createProperty(input: CreatePropertyInput) {
    const context = await activeWriteContext();
    const supabase = await createSupabaseServerClient();
    const propertyName = normalizeName(input.propertyName);

    const { data, error } = await supabase
        .from("properties")
        .insert({
            address: input.address || null,
            city: input.city || null,
            company_id: context.activeCompany!.id,
            expected_collection: input.expectedCollection ?? null,
            landlord_id: input.landlordId || null,
            name: propertyName,
            office_id: context.activeOffice!.id,
            property_name: propertyName,
            property_type: input.propertyType || "commercial",
            region: input.region || null,
            status: "active",
            total_units: input.totalUnits ?? null,
        })
        .select("*")
        .single();

    if (error) throw new Error(error.message);

    await logUserAction({
        action: "property_created",
        entityType: "property",
        entityId: data.id,
        companyId: context.activeCompany!.id,
        officeId: context.activeOffice!.id,
        afterData: data,
    });

    revalidatePath("/office/properties");
    return data;
}

export async function editProperty(input: EditPropertyInput) {
    const context = await activeWriteContext();
    const existing = await getPropertyInActiveOffice(input.propertyId);
    const supabase = await createSupabaseServerClient();
    const propertyName = normalizeName(input.propertyName);

    const { data, error } = await supabase
        .from("properties")
        .update({
            address: input.address || null,
            city: input.city || null,
            expected_collection: input.expectedCollection ?? null,
            landlord_id: input.landlordId || null,
            name: propertyName,
            property_name: propertyName,
            property_type: input.propertyType || existing.property_type,
            region: input.region || null,
            status: input.status || existing.status,
            total_units: input.totalUnits ?? existing.total_units,
        })
        .eq("id", existing.id)
        .select("*")
        .single();

    if (error) throw new Error(error.message);

    await logUserAction({
        action: "property_edited",
        entityType: "property",
        entityId: data.id,
        beforeData: existing,
        afterData: data,
        companyId: context.activeCompany!.id,
        officeId: context.activeOffice!.id,
    });

    revalidatePath("/office/properties");
    return data;
}

export async function archiveProperty(input: ArchivePropertyInput) {
    const context = await activeWriteContext();
    const existing = await getPropertyInActiveOffice(input.propertyId);
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
        .from("properties")
        .update({ status: "archived" })
        .eq("id", existing.id)
        .select("*")
        .single();

    if (error) throw new Error(error.message);

    await logUserAction({
        action: "property_archived",
        entityType: "property",
        entityId: data.id,
        beforeData: existing,
        afterData: { ...data, reason: input.reason ?? null },
        companyId: context.activeCompany!.id,
        officeId: context.activeOffice!.id,
    });

    revalidatePath("/office/properties");
    return data;
}

export async function createRoom(input: CreateRoomInput) {
    const context = await activeWriteContext();
    const property = await getPropertyInActiveOffice(input.propertyId);
    const supabase = await createSupabaseServerClient();
    const monthlyRent = Number(input.monthlyRent);
    if (!Number.isFinite(monthlyRent) || monthlyRent < 0) throw new Error("Monthly rent must be valid.");

    const { data, error } = await supabase
        .from("rooms")
        .insert({
            company_id: context.activeCompany!.id,
            floor: input.floor || null,
            landlord_id: property.landlord_id,
            monthly_rent: monthlyRent,
            office_id: context.activeOffice!.id,
            property_id: property.id,
            room_number: normalizeRoomNumber(input.roomNumber),
            size_sq_m: input.sizeSqM ?? null,
            status: input.status || "vacant",
        })
        .select("*")
        .single();

    if (error) throw new Error(error.message);

    await insertRoomStatusHistory(data.id, null, data.status ?? "vacant", "Room created");
    await logUserAction({
        action: "room_created",
        entityType: "room",
        entityId: data.id,
        companyId: context.activeCompany!.id,
        officeId: context.activeOffice!.id,
        afterData: data,
    });

    revalidatePath("/office/properties");
    return data;
}

export async function editRoom(input: EditRoomInput) {
    const context = await activeWriteContext();
    const existing = await getRoomInActiveOffice(input.roomId);
    await getPropertyInActiveOffice(input.propertyId);
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
        .from("rooms")
        .update({
            floor: input.floor || null,
            monthly_rent: Number(input.monthlyRent),
            outstanding_balance: input.outstandingBalance ?? existing.outstanding_balance,
            property_id: input.propertyId,
            room_number: normalizeRoomNumber(input.roomNumber),
            size_sq_m: input.sizeSqM ?? null,
            status: input.status || existing.status,
        })
        .eq("id", existing.id)
        .select("*")
        .single();

    if (error) throw new Error(error.message);

    if (data.status !== existing.status) {
        await insertRoomStatusHistory(data.id, existing.status, data.status ?? "unknown", "Room edited");
    }

    await logUserAction({
        action: "room_edited",
        entityType: "room",
        entityId: data.id,
        beforeData: existing,
        afterData: data,
        companyId: context.activeCompany!.id,
        officeId: context.activeOffice!.id,
    });

    revalidatePath("/office/properties");
    return data;
}

export async function updateRoomStatus(input: UpdateRoomStatusInput) {
    const context = await activeWriteContext();
    const existing = await getRoomInActiveOffice(input.roomId);
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
        .from("rooms")
        .update({ status: input.status })
        .eq("id", existing.id)
        .select("*")
        .single();

    if (error) throw new Error(error.message);

    await insertRoomStatusHistory(data.id, existing.status, data.status ?? input.status, input.reason);
    await logUserAction({
        action: "room_status_updated",
        entityType: "room",
        entityId: data.id,
        beforeData: existing,
        afterData: data,
        companyId: context.activeCompany!.id,
        officeId: context.activeOffice!.id,
    });

    revalidatePath("/office/properties");
    return data;
}

async function insertRoomStatusHistory(roomId: string, oldStatus: string | null, newStatus: string, reason?: string | null) {
    const context = await activeWriteContext();
    const supabase = await createSupabaseServerClient();

    await supabase.from("room_status_history").insert({
        changed_by: context.profile?.id ?? null,
        company_id: context.activeCompany!.id,
        office_id: context.activeOffice!.id,
        old_status: oldStatus,
        new_status: newStatus,
        reason: reason || null,
        room_id: roomId,
    });
}
