import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isCollectorContext } from "@/lib/collectors/data";

type DynamicDb = {
    from: (table: string) => any;
};
type Row = Record<string, unknown>;

function like(value: string) {
    return `%${value.replace(/[%_]/g, "\\$&")}%`;
}

export async function GET(request: Request) {
    const context = await requireAuth();
    if (!context.activeCompany?.id || !(isCollectorContext(context) || context.isCompanyAdmin)) {
        return NextResponse.json({ error: "Collector access required." }, { status: 403 });
    }
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    if (q.length < 2) return NextResponse.json({ results: [] });

    const db = createSupabaseAdminClient() as unknown as DynamicDb;
    const pattern = like(q);
    const [tenantResult, roomResult, landlordResult] = await Promise.all([
        db.from("tenants").select("id, full_name, phone, room_id, office_id, balance").eq("company_id", context.activeCompany.id).or(`full_name.ilike.${pattern},phone.ilike.${pattern}`).limit(20),
        db.from("rooms").select("id, room_number, tenant_id, office_id, landlord_id, outstanding_balance").eq("company_id", context.activeCompany.id).ilike("room_number", pattern).limit(20),
        db.from("landlords").select("id, full_name").eq("company_id", context.activeCompany.id).ilike("full_name", pattern).limit(20),
    ]);
    const tenantIds = new Set<string>();
    const roomIds = new Set<string>();
    for (const tenant of tenantResult.data ?? []) {
        tenantIds.add(String(tenant.id));
        if (tenant.room_id) roomIds.add(String(tenant.room_id));
    }
    for (const room of roomResult.data ?? []) {
        if (room.tenant_id) tenantIds.add(String(room.tenant_id));
        roomIds.add(String(room.id));
    }
    if ((landlordResult.data ?? []).length) {
        const landlordRoomResult = await db
            .from("rooms")
            .select("id, tenant_id")
            .eq("company_id", context.activeCompany.id)
            .in("landlord_id", landlordResult.data.map((row: Record<string, unknown>) => row.id))
            .limit(30);
        for (const room of landlordRoomResult.data ?? []) {
            roomIds.add(String(room.id));
            if (room.tenant_id) tenantIds.add(String(room.tenant_id));
        }
    }

    const [tenants, rooms] = await Promise.all([
        tenantIds.size ? db.from("tenants").select("id, full_name, phone, room_id, office_id, balance").in("id", [...tenantIds]) : Promise.resolve({ data: [] }),
        roomIds.size ? db.from("rooms").select("id, room_number, tenant_id, office_id, landlord_id, outstanding_balance").in("id", [...roomIds]) : Promise.resolve({ data: [] }),
    ]);
    const officeIds = [...new Set([...(tenants.data ?? []).map((row: Record<string, unknown>) => row.office_id), ...(rooms.data ?? []).map((row: Record<string, unknown>) => row.office_id)].filter(Boolean).map(String))];
    const landlordIds = [...new Set((rooms.data ?? []).map((row: Record<string, unknown>) => row.landlord_id).filter(Boolean).map(String))];
    const [officeRows, landlordRows] = await Promise.all([
        officeIds.length ? db.from("offices").select("id, office_name, name").in("id", officeIds) : Promise.resolve({ data: [] }),
        landlordIds.length ? db.from("landlords").select("id, full_name").in("id", landlordIds) : Promise.resolve({ data: [] }),
    ]);
    const tenantRows = (tenants.data ?? []) as Row[];
    const roomRows = (rooms.data ?? []) as Row[];
    const officeList = (officeRows.data ?? []) as Row[];
    const landlordList = (landlordRows.data ?? []) as Row[];
    const tenantById = new Map(tenantRows.map((row) => [String(row.id), row]));
    const roomById = new Map(roomRows.map((row) => [String(row.id), row]));
    const officeById = new Map(officeList.map((row) => [String(row.id), row]));
    const landlordById = new Map(landlordList.map((row) => [String(row.id), row]));

    const results = [...tenantById.values()].map((tenant) => {
        const room = tenant.room_id ? roomById.get(String(tenant.room_id)) ?? null : null;
        const office = officeById.get(String(tenant.office_id ?? room?.office_id ?? ""));
        const landlord = room?.landlord_id ? landlordById.get(String(room.landlord_id)) : null;
        return {
            balance: Number(tenant.balance ?? room?.outstanding_balance ?? 0),
            landlordName: String(landlord?.full_name ?? "No landlord"),
            officeId: String(tenant.office_id ?? room?.office_id ?? ""),
            officeName: String(office?.office_name ?? office?.name ?? "Office"),
            phone: String(tenant.phone ?? ""),
            roomId: room?.id ? String(room.id) : null,
            roomNumber: String(room?.room_number ?? "No room"),
            tenantId: String(tenant.id),
            tenantName: String(tenant.full_name ?? "Unnamed tenant"),
        };
    });

    return NextResponse.json({ results: results.slice(0, 30) });
}
