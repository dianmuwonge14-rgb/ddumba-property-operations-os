import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/permissions";
import { businessErrorResponse } from "@/lib/errors/business-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeRoomNumberForUniqueness } from "@/lib/rooms/room-number";

type DynamicDb = { from: (table: string) => any };

export async function GET(request: Request) {
    try {
        const context = await requirePermission("properties.manage");
        const companyId = context.activeCompany?.id;
        if (!companyId) {
            return NextResponse.json({ error: "Active company is required." }, { status: 400 });
        }

        const url = new URL(request.url);
        const normalizedRoomNumber = normalizeRoomNumberForUniqueness(url.searchParams.get("roomNumber"));
        const excludeRoomId = url.searchParams.get("excludeRoomId") || null;
        if (!normalizedRoomNumber) {
            return NextResponse.json({ available: false, message: "Room number is required.", normalizedRoomNumber });
        }

        const db = await createSupabaseServerClient() as unknown as DynamicDb;
        const { data, error } = await db
            .from("rooms")
            .select("id, room_number, status, removed, office:offices(name), landlord:landlords(full_name), property:properties(property_name,name)")
            .eq("company_id", companyId)
            .eq("normalized_room_number", normalizedRoomNumber)
            .limit(10);

        if (error) {
            if (String(error.message ?? "").includes("normalized_room_number")) {
                return NextResponse.json({ available: true, normalizedRoomNumber });
            }
            throw new Error(error.message);
        }

        const existing = (data ?? []).find((room: any) => {
            if (excludeRoomId && room.id === excludeRoomId) return false;
            if (room.removed) return false;
            return !["archived", "deleted", "removed"].includes(String(room.status ?? "active").toLowerCase());
        });

        if (!existing) {
            return NextResponse.json({ available: true, message: "Room number is available", normalizedRoomNumber });
        }

        return NextResponse.json({
            available: false,
            existingRoom: {
                id: existing.id,
                landlord: existing.landlord?.full_name ?? null,
                office: existing.office?.name ?? null,
                property: existing.property?.property_name ?? existing.property?.name ?? null,
                roomNumber: existing.room_number,
                status: existing.status ?? "active",
            },
            message: "Room number already exists.",
            normalizedRoomNumber,
        });
    } catch (error) {
        return businessErrorResponse(error, "Room availability check failed.");
    }
}
