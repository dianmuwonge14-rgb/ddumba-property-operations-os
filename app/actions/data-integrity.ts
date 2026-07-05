"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireCompanyAdminMode } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type LooseRow = Record<string, unknown>;

export type IntegrityActionState = {
    ok: boolean;
    message: string;
};

export async function archiveDuplicateRoomAction(_state: IntegrityActionState, formData: FormData): Promise<IntegrityActionState> {
    const context = await requireCompanyAdminMode();
    const duplicateId = stringField(formData, "duplicateId");
    const survivorId = stringField(formData, "survivorId");
    const reason = stringField(formData, "reason") || "Archived duplicate room from Admin Data Integrity Centre.";

    if (!duplicateId || !survivorId) {
        return { ok: false, message: "Select both the duplicate room and the surviving room." };
    }
    if (duplicateId === survivorId) {
        return { ok: false, message: "Duplicate room and surviving room cannot be the same record." };
    }

    const supabase = createSupabaseAdminClient() as unknown as SupabaseClient;
    const { data: rooms, error } = await supabase.from("rooms").select("*").in("id", [duplicateId, survivorId]);
    if (error) return { ok: false, message: error.message };

    const duplicate = (rooms as LooseRow[] | null)?.find((room) => room.id === duplicateId);
    const survivor = (rooms as LooseRow[] | null)?.find((room) => room.id === survivorId);
    if (!duplicate || !survivor) return { ok: false, message: "Could not find both room records." };
    if (duplicate.company_id !== context.activeCompany?.id || survivor.company_id !== context.activeCompany?.id) {
        return { ok: false, message: "Room records do not belong to the active company." };
    }

    const raw = objectValue(duplicate.workbook_raw_data);
    const now = new Date().toISOString();
    const updatePayload = {
        status: "archived",
        workbook_comment: `Duplicate Room | Archived by Integrity Repair | Linked to surviving room ${survivorId}`,
        workbook_raw_data: {
            ...raw,
            integrity_repair: {
                ...objectValue(raw.integrity_repair),
                classification: "Duplicate Room",
                archived_by: "Admin Data Integrity Centre",
                duplicate_of_room_id: survivorId,
                previous_status: stringValue(duplicate.status) || null,
                archived_at: now,
                reason,
            },
        },
        updated_at: now,
    };

    const { data: updated, error: updateError } = await supabase.from("rooms").update(updatePayload).eq("id", duplicateId).select("*").single();
    if (updateError) return { ok: false, message: updateError.message };

    const { error: auditError } = await supabase.from("audit_logs").insert({
        company_id: duplicate.company_id,
        office_id: duplicate.office_id,
        actor_id: context.profile?.id ?? null,
        action: "integrity_duplicate_room_archived",
        entity_type: "room",
        entity_id: duplicateId,
        before_data: duplicate,
        after_data: { ...(updated as LooseRow), surviving_room_id: survivorId, reason },
    });
    if (auditError) return { ok: false, message: auditError.message };

    revalidatePath("/office/admin/data-integrity");
    return { ok: true, message: "Duplicate room archived and audit history preserved." };
}

export async function restoreArchivedRoomAction(_state: IntegrityActionState, formData: FormData): Promise<IntegrityActionState> {
    const context = await requireCompanyAdminMode();
    const roomId = stringField(formData, "roomId");
    const reason = stringField(formData, "reason") || "Restored from Admin Data Integrity Centre.";
    if (!roomId) return { ok: false, message: "Select an archived room to restore." };

    const supabase = createSupabaseAdminClient() as unknown as SupabaseClient;
    const { data: room, error } = await supabase.from("rooms").select("*").eq("id", roomId).single();
    if (error) return { ok: false, message: error.message };
    const archivedRoom = room as LooseRow;
    if (archivedRoom.company_id !== context.activeCompany?.id) {
        return { ok: false, message: "Room does not belong to the active company." };
    }
    if (stringValue(archivedRoom.status).toLowerCase() !== "archived") {
        return { ok: false, message: "Only archived rooms can be restored." };
    }

    const duplicateCheck = await supabase
        .from("rooms")
        .select("id")
        .eq("company_id", stringValue(archivedRoom.company_id))
        .eq("office_id", stringValue(archivedRoom.office_id))
        .eq("property_id", stringValue(archivedRoom.property_id))
        .ilike("room_number", stringValue(archivedRoom.room_number))
        .neq("id", roomId)
        .not("status", "in", "(archived,deleted,inactive,voided,removed,rejected,cancelled,canceled,terminated)")
        .limit(1);
    if (duplicateCheck.error) return { ok: false, message: duplicateCheck.error.message };
    if ((duplicateCheck.data ?? []).length > 0) {
        return { ok: false, message: "Restore blocked because an active room with the same number already exists." };
    }

    const raw = objectValue(archivedRoom.workbook_raw_data);
    const repair = objectValue(raw.integrity_repair);
    const previousStatus = stringValue(repair.previous_status) || "vacant";
    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase.from("rooms").update({
        status: previousStatus,
        workbook_raw_data: {
            ...raw,
            integrity_repair: {
                ...repair,
                restored_at: now,
                restored_by: "Admin Data Integrity Centre",
                restore_reason: reason,
            },
        },
        workbook_comment: `Restored by Integrity Repair | ${reason}`,
        updated_at: now,
    }).eq("id", roomId).select("*").single();
    if (updateError) return { ok: false, message: updateError.message };

    const { error: auditError } = await supabase.from("audit_logs").insert({
        company_id: archivedRoom.company_id,
        office_id: archivedRoom.office_id,
        actor_id: context.profile?.id ?? null,
        action: "integrity_archived_room_restored",
        entity_type: "room",
        entity_id: roomId,
        before_data: archivedRoom,
        after_data: { ...(updated as LooseRow), reason },
    });
    if (auditError) return { ok: false, message: auditError.message };

    revalidatePath("/office/admin/data-integrity");
    return { ok: true, message: "Archived room restored after duplicate safety check." };
}

function stringField(formData: FormData, key: string) {
    const value = formData.get(key);
    return typeof value === "string" ? value.trim() : "";
}

function stringValue(value: unknown) {
    return typeof value === "string" ? value : value == null ? "" : String(value);
}

function objectValue(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
