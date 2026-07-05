"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyAdminMode } from "@/lib/auth/permissions";
import { logUserAction } from "@/lib/auth/audit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ReassignRoomInput = {
    roomId: string;
    landlordId: string;
    note?: string;
};

type BulkReassignInput = {
    roomIds: string[];
    landlordId: string;
    note?: string;
};

type ReviewInput = {
    roomId: string;
    note?: string;
};

async function adminContext() {
    const context = await requireCompanyAdminMode();
    if (!context.activeCompany?.id) throw new Error("Active company is required.");
    return context;
}

function cleanId(value: string, label: string) {
    const cleaned = value.trim();
    if (!cleaned) throw new Error(`${label} is required.`);
    return cleaned;
}

export async function reassignLandlordRoom(input: ReassignRoomInput) {
    const context = await adminContext();
    const supabase = await createSupabaseServerClient();
    const roomId = cleanId(input.roomId, "Room");
    const landlordId = cleanId(input.landlordId, "Landlord");

    const { data: room, error: roomError } = await supabase
        .from("rooms")
        .select("*")
        .eq("id", roomId)
        .eq("company_id", context.activeCompany!.id)
        .maybeSingle();
    if (roomError) throw new Error(roomError.message);
    if (!room) throw new Error("Room not found.");

    const { data: landlord, error: landlordError } = await supabase
        .from("landlords")
        .select("*")
        .eq("id", landlordId)
        .eq("company_id", context.activeCompany!.id)
        .maybeSingle();
    if (landlordError) throw new Error(landlordError.message);
    if (!landlord) throw new Error("Landlord not found.");

    const { data: updated, error } = await supabase
        .from("rooms")
        .update({ landlord_id: landlord.id })
        .eq("id", room.id)
        .eq("company_id", context.activeCompany!.id)
        .select("*")
        .single();
    if (error) throw new Error(error.message);

    await logUserAction({
        action: "landlord_room_reassigned",
        entityType: "room",
        entityId: room.id,
        beforeData: room,
        afterData: { ...updated, new_landlord_name: landlord.full_name, note: input.note ?? null },
        companyId: context.activeCompany!.id,
        officeId: room.office_id,
    });

    revalidatePath("/office/admin");
    revalidatePath("/office/landlords");
    return updated;
}

export async function bulkReassignLandlordRooms(input: BulkReassignInput) {
    const roomIds = Array.from(new Set(input.roomIds.map((id) => id.trim()).filter(Boolean)));
    if (!roomIds.length) throw new Error("Select at least one room.");
    const results = [];
    for (const roomId of roomIds) {
        results.push(await reassignLandlordRoom({ roomId, landlordId: input.landlordId, note: input.note }));
    }
    return { updated: results.length };
}

export async function markLandlordAssignmentReviewed(input: ReviewInput) {
    const context = await adminContext();
    const supabase = await createSupabaseServerClient();
    const roomId = cleanId(input.roomId, "Room");

    const { data: room, error } = await supabase
        .from("rooms")
        .select("*")
        .eq("id", roomId)
        .eq("company_id", context.activeCompany!.id)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!room) throw new Error("Room not found.");

    await logUserAction({
        action: "landlord_assignment_issue_reviewed",
        entityType: "room",
        entityId: room.id,
        afterData: { room_id: room.id, room_number: room.room_number, landlord_id: room.landlord_id, note: input.note ?? null },
        companyId: context.activeCompany!.id,
        officeId: room.office_id,
    });

    revalidatePath("/office/admin");
    return { reviewed: true };
}
