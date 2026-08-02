export function normalizeRoomNumberForUniqueness(value: string | null | undefined) {
    return String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

export function formatRoomDuplicateError(message: string | null | undefined) {
    const text = String(message ?? "").toLowerCase();
    if (
        text.includes("idx_rooms_company_active_normalized_room_unique")
        || text.includes("rooms_company_active_normalized_room_unique")
        || (text.includes("duplicate key") && text.includes("normalized_room_number"))
        || text.includes("room number already exists")
    ) {
        return "Room number already exists.";
    }
    return message || "Room could not be saved.";
}
