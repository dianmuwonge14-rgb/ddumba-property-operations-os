import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/permissions";
import { calculateTenantMonthlyLedgerPosition } from "@/lib/financial/monthly-ledger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isCollectorContext } from "@/lib/collectors/data";

type DynamicDb = {
    from: (table: string) => any;
};
type Row = Record<string, unknown>;

function like(value: string) {
    return `%${value.replace(/[%_]/g, "\\$&")}%`;
}

function monthStart() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function groupRowsByKey(rows: Row[], key: string) {
    const grouped = new Map<string, Row[]>();
    for (const row of rows) {
        const value = String(row[key] ?? "");
        if (!value) continue;
        grouped.set(value, [...(grouped.get(value) ?? []), row]);
    }
    return grouped;
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
        db.from("tenants").select("id, full_name, phone, room_id, office_id, monthly_rent").eq("company_id", context.activeCompany.id).or(`full_name.ilike.${pattern},phone.ilike.${pattern}`).limit(20),
        db.from("rooms").select("id, room_number, tenant_id, office_id, landlord_id, monthly_rent").eq("company_id", context.activeCompany.id).ilike("room_number", pattern).limit(20),
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
        tenantIds.size ? db.from("tenants").select("id, full_name, phone, room_id, office_id, monthly_rent").in("id", [...tenantIds]) : Promise.resolve({ data: [] }),
        roomIds.size ? db.from("rooms").select("id, room_number, tenant_id, office_id, landlord_id, monthly_rent").in("id", [...roomIds]) : Promise.resolve({ data: [] }),
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
    const selectedMonth = monthStart();
    const [collectionRows, rentMonthRows, legacyArrearsRows, allocationRows] = await Promise.all([
        tenantIds.size ? db.from("collections").select("*").eq("company_id", context.activeCompany.id).in("tenant_id", [...tenantIds]) : Promise.resolve({ data: [] }),
        tenantIds.size ? db.from("tenant_rent_months").select("tenant_id,rent_month,due_date,coverage_start,coverage_end,rent_amount,amount_paid,outstanding_amount,status,created_at,source").eq("company_id", context.activeCompany.id).in("tenant_id", [...tenantIds]) : Promise.resolve({ data: [] }),
        tenantIds.size ? db.from("tenant_pre_system_arrears_periods").select("tenant_id,allocation_month,legacy_arrears_amount,payments_applied,remaining_amount,status").eq("company_id", context.activeCompany.id).in("tenant_id", [...tenantIds]) : Promise.resolve({ data: [] }),
        tenantIds.size ? db.from("tenant_rent_allocations").select("tenant_id,payment_id,allocation_month,allocation_type,amount_allocated,consumed_by_balance_reconciliation,allocation_source,is_historical_credit,coverage_start,coverage_end,coverage_index").eq("company_id", context.activeCompany.id).in("tenant_id", [...tenantIds]) : Promise.resolve({ data: [] }),
    ]);
    const collectionsByTenant = groupRowsByKey((collectionRows.data ?? []) as Row[], "tenant_id");
    const rentMonthsByTenant = groupRowsByKey((rentMonthRows.data ?? []) as Row[], "tenant_id");
    const arrearsByTenant = groupRowsByKey((legacyArrearsRows.data ?? []) as Row[], "tenant_id");
    const allocationsByTenant = groupRowsByKey((allocationRows.data ?? []) as Row[], "tenant_id");

    const results = [...tenantById.values()].map((tenant) => {
        const room = tenant.room_id ? roomById.get(String(tenant.room_id)) ?? null : null;
        const office = officeById.get(String(tenant.office_id ?? room?.office_id ?? ""));
        const landlord = room?.landlord_id ? landlordById.get(String(room.landlord_id)) : null;
        const position = calculateTenantMonthlyLedgerPosition({
            advanceAllocations: allocationsByTenant.get(String(tenant.id)) ?? [],
            collections: collectionsByTenant.get(String(tenant.id)) ?? [],
            legacyArrears: arrearsByTenant.get(String(tenant.id)) ?? [],
            monthlyRent: Number(tenant.monthly_rent ?? room?.monthly_rent ?? 0),
            rentMonths: rentMonthsByTenant.get(String(tenant.id)) ?? [],
            selectedMonth,
        });
        return {
            balance: position.outstanding,
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
