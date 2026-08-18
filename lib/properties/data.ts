import { requirePermission } from "@/lib/auth/permissions";
import { getScopedSupabase } from "@/lib/auth/query";
import { calculateTenantMonthlyLedgerPosition } from "@/lib/financial/monthly-ledger";
import type {
    LandlordRow,
    LeaseRow,
    PropertiesPageData,
    PropertyItem,
    PropertyKpis,
    PropertyRow,
    RoomRow,
    RoomStatusHistoryRow,
    TenantRow,
} from "./types";

function dateOnly(date: Date) {
    return date.toISOString().slice(0, 10);
}

function monthStart() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function groupRowsByKey<T extends Record<string, unknown>>(rows: T[], key: string) {
    const grouped = new Map<string, T[]>();
    for (const row of rows) {
        const value = String(row[key] ?? "");
        if (!value) continue;
        grouped.set(value, [...(grouped.get(value) ?? []), row]);
    }
    return grouped;
}

function addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
}

export async function getPropertiesPageData(): Promise<PropertiesPageData> {
    const context = await requirePermission("properties.read");
    const { supabase } = await getScopedSupabase();
    const db = supabase as unknown as { from: (table: string) => any };
    const companyId = context.activeCompany?.id;
    const officeId = context.activeOffice?.id;

    const isAdminAcrossOffices = (context.isCompanyAdmin || context.isCompanyReadOnlyManager) && !context.isOfficeMode;

    if (!companyId || (!officeId && !isAdminAcrossOffices)) {
        return emptyData();
    }

    const officesPromise = isAdminAcrossOffices
        ? supabase
            .from("offices")
            .select("id,name,office_name")
            .eq("company_id", companyId)
            .order("office_name", { ascending: true, nullsFirst: false })
        : Promise.resolve({
            data: context.activeOffice
                ? [{
                    id: context.activeOffice.id,
                    name: context.activeOffice.name,
                    office_name: context.activeOffice.office_name ?? context.activeOffice.name,
                }]
                : [],
            error: null,
        });

    const landlordsPromise = fetchAllCompanyLandlords(db, companyId);

    let propertiesQuery = supabase
            .from("properties")
            .select("*")
            .eq("company_id", companyId)
            .neq("status", "archived")
            .order("property_name", { ascending: true, nullsFirst: false });
    let roomsQuery = supabase
            .from("rooms")
            .select("id,company_id,office_id,property_id,landlord_id,room_number,monthly_rent,outstanding_balance,status,floor")
            .eq("company_id", companyId)
            .order("room_number", { ascending: true, nullsFirst: false });
    let leasesQuery = supabase
            .from("leases")
            .select("id,company_id,office_id,property_id,room_id,tenant_id,monthly_rent,status,end_date")
            .eq("company_id", companyId)
            .eq("status", "active");
    let tenantsQuery = supabase
            .from("tenants")
            .select("id,company_id,office_id,property_id,room_id,full_name,phone,balance,status")
            .eq("company_id", companyId)
            .eq("status", "active");
    if (!isAdminAcrossOffices && officeId) {
        propertiesQuery = propertiesQuery.eq("office_id", officeId);
        roomsQuery = roomsQuery.eq("office_id", officeId);
        leasesQuery = leasesQuery.eq("office_id", officeId);
        tenantsQuery = tenantsQuery.eq("office_id", officeId);
    }

    const [propertiesResult, roomsResult, leasesResult, tenantsResult, landlordsResult, officesResult, bulkRequestsResult] = await Promise.all([
        propertiesQuery,
        roomsQuery,
        leasesQuery,
        tenantsQuery,
        landlordsPromise,
        officesPromise,
        db
            .from("landlord_bulk_room_requests")
            .select("*")
            .eq("company_id", companyId)
            .eq("office_id", officeId)
            .order("created_at", { ascending: false })
            .limit(25),
    ]);

    for (const result of [propertiesResult, roomsResult, leasesResult, tenantsResult, landlordsResult, officesResult]) {
        if (result.error) {
            throw new Error(result.error.message);
        }
    }

    const properties = propertiesResult.data ?? [];
    const rooms = (roomsResult.data ?? []) as unknown as RoomRow[];
    const activeLeases = (leasesResult.data ?? []) as unknown as LeaseRow[];
    const tenants = (tenantsResult.data ?? []) as unknown as TenantRow[];
    const landlords = (landlordsResult.data ?? []) as unknown as LandlordRow[];
    const histories: RoomStatusHistoryRow[] = [];
    const offices = (officesResult.data ?? []).map((office) => ({
        id: String(office.id),
        name: String(office.office_name ?? office.name ?? "Office"),
    }));
    const officeById = new Map(offices.map((office) => [office.id, office.name]));
    const pendingBulkRequests = bulkRequestsResult.error
        ? []
        : (bulkRequestsResult.data ?? []).map((request: any) => {
            const summary = request.summary ?? {};
            const landlordPayload = request.landlord_payload ?? {};
            return {
                id: String(request.id),
                officeId: String(request.office_id),
                officeName: officeById.get(String(request.office_id)) ?? "Office",
                landlordName: String(landlordPayload.landlordName ?? landlordPayload.fullName ?? "New landlord"),
                roomCount: Number(summary.totalRooms ?? 0),
                occupiedRooms: Number(summary.occupiedRooms ?? 0),
                vacantRooms: Number(summary.vacantRooms ?? 0),
                rentRoll: Number(summary.rentRoll ?? 0),
                openingOutstanding: Number(summary.openingOutstanding ?? 0),
                status: String(request.status ?? "pending"),
                createdAt: String(request.created_at ?? ""),
            };
        });

    const items = buildPropertyItems(properties, rooms, activeLeases, tenants, landlords, histories);
    const kpis = calculateKpis(items);
    const propertyList = items.map((property) => ({ ...property, rooms: [] }));

    return {
        company: context.activeCompany,
        office: context.activeOffice,
        offices,
        landlords,
        pendingBulkRequests,
        kpis,
        initialProperty: null,
        properties: propertyList,
    };
}

async function fetchAllCompanyLandlords(db: { from: (table: string) => any }, companyId: string) {
    const pageSize = 1000;
    const rows: LandlordRow[] = [];

    for (let from = 0; ; from += pageSize) {
        const { data, error } = await db
            .from("landlords")
            .select("id,company_id,full_name,phone,status")
            .eq("company_id", companyId)
            .neq("status", "archived")
            .order("full_name", { ascending: true, nullsFirst: false })
            .range(from, from + pageSize - 1);

        if (error) return { data: null, error };

        const page = (data ?? []) as LandlordRow[];
        rows.push(...page);
        if (page.length < pageSize) break;
    }

    return { data: rows, error: null };
}

export async function getPropertyDetailInActiveOffice(propertyId: string): Promise<PropertyItem> {
    const context = await requirePermission("properties.read");
    const { supabase } = await getScopedSupabase();
    const companyId = context.activeCompany?.id;
    const officeId = context.activeOffice?.id;

    if (!companyId || !officeId) {
        throw new Error("Active company and office are required.");
    }

    const [propertyResult, roomsResult] = await Promise.all([
        supabase
            .from("properties")
            .select("*")
            .eq("id", propertyId)
            .eq("company_id", companyId)
            .eq("office_id", officeId)
            .neq("status", "archived")
            .maybeSingle(),
        supabase
            .from("rooms")
            .select("*")
            .eq("company_id", companyId)
            .eq("office_id", officeId)
            .eq("property_id", propertyId)
            .order("room_number", { ascending: true, nullsFirst: false }),
    ]);

    if (propertyResult.error) throw new Error(propertyResult.error.message);
    if (roomsResult.error) throw new Error(roomsResult.error.message);
    if (!propertyResult.data) throw new Error("Property not found in the active office.");

    const property = propertyResult.data as PropertyRow;
    const rooms = (roomsResult.data ?? []) as RoomRow[];
    const roomIds = rooms.map((room) => room.id);
    const landlordIds = property.landlord_id ? [property.landlord_id] : [];

    const db = supabase as unknown as { from: (table: string) => any };
    const [leasesResult, landlordsResult] = await Promise.all([
        roomIds.length
            ? supabase
                .from("leases")
                .select("*")
                .eq("company_id", companyId)
                .eq("office_id", officeId)
                .eq("status", "active")
                .in("room_id", roomIds)
            : Promise.resolve({ data: [] as LeaseRow[], error: null }),
        landlordIds.length
            ? supabase
                .from("landlords")
                .select("*")
                .eq("company_id", companyId)
                .in("id", landlordIds)
            : Promise.resolve({ data: [] as LandlordRow[], error: null }),
    ]);

    if (leasesResult.error) throw new Error(leasesResult.error.message);
    if (landlordsResult.error) throw new Error(landlordsResult.error.message);

    const leases = (leasesResult.data ?? []) as LeaseRow[];
    const tenantIds = [...new Set(leases.map((lease) => lease.tenant_id).filter(Boolean))];
    const [tenantsResult, collectionsResult, rentMonthsResult, legacyArrearsResult, allocationsResult] = tenantIds.length
        ? await Promise.all([
            supabase
                .from("tenants")
                .select("*")
                .eq("company_id", companyId)
                .eq("office_id", officeId)
                .in("id", tenantIds),
            db.from("collections").select("*").eq("company_id", companyId).in("tenant_id", tenantIds),
            db.from("tenant_rent_months").select("tenant_id,rent_month,due_date,coverage_start,coverage_end,rent_amount,amount_paid,outstanding_amount,status,created_at,source").eq("company_id", companyId).in("tenant_id", tenantIds),
            db.from("tenant_pre_system_arrears_periods").select("tenant_id,allocation_month,legacy_arrears_amount,payments_applied,remaining_amount,status").eq("company_id", companyId).in("tenant_id", tenantIds),
            db.from("tenant_rent_allocations").select("tenant_id,payment_id,allocation_month,allocation_type,amount_allocated,consumed_by_balance_reconciliation,allocation_source,is_historical_credit,coverage_start,coverage_end,coverage_index").eq("company_id", companyId).in("tenant_id", tenantIds),
        ])
        : [
            { data: [] as TenantRow[], error: null },
            { data: [] as Array<Record<string, unknown>>, error: null },
            { data: [] as Array<Record<string, unknown>>, error: null },
            { data: [] as Array<Record<string, unknown>>, error: null },
            { data: [] as Array<Record<string, unknown>>, error: null },
        ];

    if (tenantsResult.error) throw new Error(tenantsResult.error.message);
    if (collectionsResult.error) throw new Error(collectionsResult.error.message);
    if (rentMonthsResult.error) throw new Error(rentMonthsResult.error.message);
    if (legacyArrearsResult.error) throw new Error(legacyArrearsResult.error.message);
    if (allocationsResult.error) throw new Error(allocationsResult.error.message);
    const roomById = new Map(rooms.map((room) => [room.id, room]));
    const leaseByTenant = new Map(leases.map((lease) => [lease.tenant_id, lease]));
    const collectionsByTenant = groupRowsByKey((collectionsResult.data ?? []) as Array<Record<string, unknown>>, "tenant_id");
    const rentMonthsByTenant = groupRowsByKey((rentMonthsResult.data ?? []) as Array<Record<string, unknown>>, "tenant_id");
    const arrearsByTenant = groupRowsByKey((legacyArrearsResult.data ?? []) as Array<Record<string, unknown>>, "tenant_id");
    const allocationsByTenant = groupRowsByKey((allocationsResult.data ?? []) as Array<Record<string, unknown>>, "tenant_id");
    const selectedMonth = monthStart();
    const hydratedTenants = ((tenantsResult.data ?? []) as TenantRow[]).map((tenant) => {
        const lease = leaseByTenant.get(tenant.id) ?? null;
        const room = tenant.room_id ? roomById.get(tenant.room_id) ?? null : null;
        const position = calculateTenantMonthlyLedgerPosition({
            advanceAllocations: allocationsByTenant.get(tenant.id) ?? [],
            collections: collectionsByTenant.get(tenant.id) ?? [],
            legacyArrears: arrearsByTenant.get(tenant.id) ?? [],
            monthlyRent: Number(lease?.monthly_rent ?? tenant.monthly_rent ?? room?.monthly_rent ?? 0),
            rentMonths: rentMonthsByTenant.get(tenant.id) ?? [],
            selectedMonth,
        });
        return { ...tenant, balance: position.outstanding } as TenantRow;
    });

    const [item] = buildPropertyItems(
        [property],
        rooms,
        leases,
        hydratedTenants,
        (landlordsResult.data ?? []) as LandlordRow[],
        [],
    );
    if (!item) throw new Error("Property details could not be prepared.");
    return item;
}


export async function getPropertyInActiveOffice(propertyId: string) {
    const context = await requirePermission("properties.read");
    const { supabase } = await getScopedSupabase();

    if (!context.activeCompany?.id || !context.activeOffice?.id) {
        throw new Error("Active company and office are required.");
    }

    const { data, error } = await supabase
        .from("properties")
        .select("*")
        .eq("id", propertyId)
        .eq("company_id", context.activeCompany.id)
        .eq("office_id", context.activeOffice.id)
        .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw new Error("Property not found in the active office.");
    return data;
}

export async function getRoomInActiveOffice(roomId: string) {
    const context = await requirePermission("properties.read");
    const { supabase } = await getScopedSupabase();

    if (!context.activeCompany?.id || !context.activeOffice?.id) {
        throw new Error("Active company and office are required.");
    }

    const { data, error } = await supabase
        .from("rooms")
        .select("*")
        .eq("id", roomId)
        .eq("company_id", context.activeCompany.id)
        .eq("office_id", context.activeOffice.id)
        .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw new Error("Room not found in the active office.");
    return data;
}

function buildPropertyItems(
    properties: PropertyRow[],
    rooms: RoomRow[],
    activeLeases: LeaseRow[],
    tenants: TenantRow[],
    landlords: LandlordRow[],
    histories: RoomStatusHistoryRow[],
) {
    const landlordById = new Map(landlords.map((landlord) => [landlord.id, landlord]));
    const tenantById = new Map(tenants.map((tenant) => [tenant.id, tenant]));
    const leaseByRoom = new Map(activeLeases.map((lease) => [lease.room_id, lease]));
    const historiesByRoom = new Map<string, RoomStatusHistoryRow[]>();

    for (const history of histories) {
        historiesByRoom.set(history.room_id, [...(historiesByRoom.get(history.room_id) ?? []), history]);
    }

    return properties.map((property): PropertyItem => {
        const propertyRooms = rooms
            .filter((room) => room.property_id === property.id)
            .map((room) => {
                const activeLease = leaseByRoom.get(room.id) ?? null;
                return {
                    ...room,
                    tenant: activeLease ? tenantById.get(activeLease.tenant_id) ?? null : null,
                    activeLease,
                    statusHistory: historiesByRoom.get(room.id) ?? [],
                };
            });
        const occupiedRooms = propertyRooms.filter((room) => isOccupied(room.status, room.activeLease)).length;
        const rentRoll = propertyRooms.reduce(
            (total, room) => total + Number(room.activeLease?.monthly_rent ?? room.monthly_rent ?? 0),
            0,
        );
        const expiringSoon = propertyRooms.filter((room) => isExpiringSoon(room.activeLease)).length;

        return {
            ...property,
            landlord: property.landlord_id ? landlordById.get(property.landlord_id) ?? null : null,
            office: null,
            rooms: propertyRooms,
            totalRoomsComputed: propertyRooms.length,
            occupiedRoomsComputed: occupiedRooms,
            vacantRoomsComputed: Math.max(0, propertyRooms.length - occupiedRooms),
            rentRollComputed: rentRoll,
            expiringSoonCount: expiringSoon,
        };
    });
}

function calculateKpis(properties: PropertyItem[]): PropertyKpis {
    const totalRooms = properties.reduce((total, property) => total + property.totalRoomsComputed, 0);
    const occupiedRooms = properties.reduce((total, property) => total + property.occupiedRoomsComputed, 0);
    const vacantRooms = Math.max(0, totalRooms - occupiedRooms);
    const rentRoll = properties.reduce((total, property) => total + property.rentRollComputed, 0);

    return {
        totalProperties: properties.length,
        totalRooms,
        occupiedRooms,
        vacantRooms,
        occupancyRate: totalRooms ? Math.round((occupiedRooms / totalRooms) * 100) : 0,
        rentRoll,
        roomsExpiringSoon: properties.reduce((total, property) => total + property.expiringSoonCount, 0),
    };
}

function isOccupied(status: string | null, activeLease: LeaseRow | null) {
    return Boolean(activeLease) || status === "occupied";
}

function isExpiringSoon(lease: LeaseRow | null) {
    if (!lease?.end_date) return false;
    const today = dateOnly(new Date());
    const soon = dateOnly(addDays(new Date(), 30));
    return lease.end_date >= today && lease.end_date <= soon;
}

function emptyData(): PropertiesPageData {
    return {
        company: null,
        office: null,
        offices: [],
        landlords: [],
        pendingBulkRequests: [],
        kpis: {
            totalProperties: 0,
            totalRooms: 0,
            occupiedRooms: 0,
            vacantRooms: 0,
            occupancyRate: 0,
            rentRoll: 0,
            roomsExpiringSoon: 0,
        },
        initialProperty: null,
        properties: [],
    };
}
