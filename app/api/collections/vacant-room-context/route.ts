import { NextRequest, NextResponse } from "next/server";
import { canAccessOffice, hasPermission, requireAuth } from "@/lib/auth/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type DynamicDb = { from: (table: string) => any };

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    try {
        const context = await requireAuth();
        const companyId = context.activeCompany?.id;
        const roomId = request.nextUrl.searchParams.get("roomId")?.trim();
        const canOpenNewTenant =
            hasPermission(context, "collections.manage") ||
            hasPermission(context, "properties.manage") ||
            hasPermission(context, "landlords.manage");

        if (!companyId || !roomId) {
            return NextResponse.json({ error: "Room and company are required." }, { status: 400 });
        }
        if (!canOpenNewTenant) {
            return NextResponse.json({ error: "You do not have permission to add tenants." }, { status: 403 });
        }

        const db = await createSupabaseServerClient() as unknown as DynamicDb;
        const { data: room, error: roomError } = await db
            .from("rooms")
            .select("*")
            .eq("id", roomId)
            .eq("company_id", companyId)
            .maybeSingle();
        if (roomError) throw new Error(roomError.message);
        if (!room) return NextResponse.json({ error: "Room could not be found." }, { status: 404 });
        if (!canAccessOffice(context, room.office_id)) {
            return NextResponse.json({ error: "This room is outside your permitted office scope." }, { status: 403 });
        }
        if (String(room.status ?? "").toLowerCase() !== "vacant") {
            return NextResponse.json({ error: "This room is no longer vacant." }, { status: 409 });
        }

        const [officeResult, propertyResult, landlordResult] = await Promise.all([
            room.office_id ? db.from("offices").select("*").eq("id", room.office_id).eq("company_id", companyId).maybeSingle() : Promise.resolve({ data: null, error: null }),
            room.property_id ? db.from("properties").select("*").eq("id", room.property_id).eq("company_id", companyId).maybeSingle() : Promise.resolve({ data: null, error: null }),
            room.landlord_id ? db.from("landlords").select("*").eq("id", room.landlord_id).eq("company_id", companyId).maybeSingle() : Promise.resolve({ data: null, error: null }),
        ]);

        for (const result of [officeResult, propertyResult, landlordResult]) {
            if (result.error) throw new Error(result.error.message);
        }

        return NextResponse.json(
            {
                landlord: landlordResult.data ?? null,
                office: officeResult.data ?? null,
                property: propertyResult.data ?? null,
                room,
            },
            { headers: { "Cache-Control": "no-store" } },
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : "Vacant room context could not load.";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
