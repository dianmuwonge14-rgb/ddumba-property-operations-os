import { hasPermission, requireAuth } from "@/lib/auth/permissions";
import { getScopedSupabase } from "@/lib/auth/query";
import type { Database } from "@/types/database.types";
import type {
    TenantRelocationPageData,
    TenantRelocationRequest,
    TenantRelocationRoom,
    TenantRelocationTenant,
} from "./types";

type DynamicDb = {
    from: (table: string) => any;
};

type TenantRow = Database["public"]["Tables"]["tenants"]["Row"];
type LeaseRow = Database["public"]["Tables"]["leases"]["Row"];
type RoomRow = Database["public"]["Tables"]["rooms"]["Row"];
type OfficeRow = Database["public"]["Tables"]["offices"]["Row"];
type PropertyRow = Database["public"]["Tables"]["properties"]["Row"];
type LandlordRow = Database["public"]["Tables"]["landlords"]["Row"];
type UserRow = Database["public"]["Tables"]["users"]["Row"];

function amount(value: unknown) {
    const number = Number(value ?? 0);
    return Number.isFinite(number) ? number : 0;
}

function officeName(office: OfficeRow | null | undefined) {
    return office?.office_name ?? office?.name ?? "Needs review";
}

function propertyName(property: PropertyRow | null | undefined) {
    return property?.property_name ?? property?.name ?? property?.village ?? property?.address ?? "No property";
}

function propertyLocation(property: PropertyRow | null | undefined) {
    return [property?.village, property?.address, property?.city, property?.region].filter(Boolean).join(", ") || propertyName(property);
}

function isOccupiedStatus(value: string | null | undefined) {
    const status = String(value ?? "").toLowerCase();
    return status.includes("occupied") || status.includes("active");
}

function isVacantStatus(value: string | null | undefined) {
    const status = String(value ?? "").toLowerCase();
    return status.includes("vacant") || status.includes("empty") || status === "available";
}

function activeTenant(value: string | null | undefined) {
    const status = String(value ?? "").toLowerCase();
    return !status || status === "active" || status === "occupied" || status === "current";
}

export async function getTenantRelocationPageData(options: { admin?: boolean } = {}): Promise<TenantRelocationPageData> {
    const context = await requireAuth();
    const { supabase } = await getScopedSupabase();
    const db = supabase as unknown as DynamicDb;
    const companyId = context.activeCompany?.id;
    const activeOfficeId = context.activeOffice?.id;
    const isAdmin = Boolean(options.admin && context.isCompanyAdmin && !context.isOfficeMode);

    if (!companyId || (!isAdmin && !activeOfficeId)) {
        return emptyData(context, isAdmin);
    }

    let roomQuery = supabase
        .from("rooms")
        .select("*")
        .eq("company_id", companyId)
        .order("room_number", { ascending: true, nullsFirst: false });
    let tenantQuery = supabase
        .from("tenants")
        .select("*")
        .eq("company_id", companyId)
        .order("full_name", { ascending: true, nullsFirst: false })
        .limit(2000);
    let leaseQuery = supabase
        .from("leases")
        .select("*")
        .eq("company_id", companyId)
        .eq("status", "active")
        .limit(2500);
    let requestQuery = db
        .from("tenant_relocation_requests")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(100);

    if (!isAdmin && activeOfficeId) {
        roomQuery = roomQuery.eq("office_id", activeOfficeId);
        tenantQuery = tenantQuery.eq("office_id", activeOfficeId);
        leaseQuery = leaseQuery.eq("office_id", activeOfficeId);
        requestQuery = requestQuery.eq("office_id", activeOfficeId);
    }

    const [roomsResult, tenantsResult, leasesResult, officesResult, propertiesResult, landlordsResult, requestsResult, usersResult] = await Promise.all([
        roomQuery,
        tenantQuery,
        leaseQuery,
        supabase.from("offices").select("id, office_name, name").eq("company_id", companyId),
        supabase.from("properties").select("*").eq("company_id", companyId),
        supabase.from("landlords").select("*").eq("company_id", companyId),
        requestQuery,
        supabase.from("users").select("id, full_name").eq("company_id", companyId).limit(1000),
    ]);

    for (const result of [roomsResult, tenantsResult, leasesResult, officesResult, propertiesResult, landlordsResult, usersResult]) {
        if (result.error) throw new Error(result.error.message);
    }
    if (requestsResult.error && !/does not exist|schema cache|Could not find/i.test(requestsResult.error.message ?? "")) {
        throw new Error(requestsResult.error.message);
    }

    const rooms = (roomsResult.data ?? []) as RoomRow[];
    const tenants = (tenantsResult.data ?? []) as TenantRow[];
    const leases = (leasesResult.data ?? []) as LeaseRow[];
    const offices = (officesResult.data ?? []) as OfficeRow[];
    const properties = (propertiesResult.data ?? []) as PropertyRow[];
    const landlords = (landlordsResult.data ?? []) as LandlordRow[];
    const requests = ((requestsResult.data ?? []) as Record<string, unknown>[]);
    const users = (usersResult.data ?? []) as UserRow[];

    const roomById = new Map(rooms.map((room) => [room.id, room]));
    const officeById = new Map(offices.map((office) => [office.id, office]));
    const propertyById = new Map(properties.map((property) => [property.id, property]));
    const landlordById = new Map(landlords.map((landlord) => [landlord.id, landlord]));
    const userById = new Map(users.map((user) => [user.id, user]));
    const activeLeaseByTenantId = new Map<string, LeaseRow>();
    const activeLeaseByRoomId = new Map<string, LeaseRow>();
    for (const lease of leases) {
        activeLeaseByTenantId.set(lease.tenant_id, lease);
        activeLeaseByRoomId.set(lease.room_id, lease);
    }

    const tenantItems = tenants
        .filter((tenant) => activeTenant(tenant.status))
        .map((tenant) => {
            const lease = activeLeaseByTenantId.get(tenant.id) ?? null;
            const roomId = lease?.room_id ?? tenant.room_id;
            const room = roomId ? roomById.get(roomId) ?? null : null;
            if (!room) return null;
            const property = (lease?.property_id ?? room.property_id ?? tenant.property_id)
                ? propertyById.get((lease?.property_id ?? room.property_id ?? tenant.property_id) as string) ?? null
                : null;
            const landlordId = room.landlord_id ?? property?.landlord_id ?? null;
            const landlord = landlordId ? landlordById.get(landlordId) ?? null : null;
            const office = (lease?.office_id ?? room.office_id ?? tenant.office_id)
                ? officeById.get((lease?.office_id ?? room.office_id ?? tenant.office_id) as string) ?? null
                : null;
            const rent = amount(lease?.monthly_rent ?? room.monthly_rent ?? tenant.monthly_rent);
            return {
                tenantId: tenant.id,
                tenantName: tenant.full_name ?? "Unnamed tenant",
                phone: tenant.phone,
                nationalId: tenant.national_id,
                balance: amount(tenant.balance),
                status: tenant.status,
                currentRoomId: room.id,
                currentRoomNumber: room.room_number ?? "Unnumbered",
                currentRent: rent,
                currentOfficeId: office?.id ?? room.office_id ?? tenant.office_id,
                currentOfficeName: officeName(office),
                currentPropertyId: property?.id ?? room.property_id ?? tenant.property_id,
                currentPropertyName: propertyName(property),
                currentLocation: propertyLocation(property),
                currentLandlordId: landlord?.id ?? null,
                currentLandlordName: landlord?.full_name ?? "No landlord",
                currentLeaseId: lease?.id ?? null,
                billingDay: Number(lease?.billing_day ?? 1) || 1,
            } satisfies TenantRelocationTenant;
        })
        .filter(Boolean) as TenantRelocationTenant[];

    const vacantRooms = rooms
        .filter((room) => isVacantStatus(room.status) && !activeLeaseByRoomId.has(room.id))
        .map((room) => mapVacantRoom({ room, officeById, propertyById, landlordById }));

    return {
        company: context.activeCompany,
        activeOffice: context.activeOffice,
        isAdmin,
        canSubmit: isAdmin || hasPermission(context, "collections.manage") || hasPermission(context, "properties.manage"),
        canApprove: isAdmin,
        tenants: tenantItems,
        vacantRooms,
        requests: requests.map((request) => mapRequest({ request, roomById, tenantById: new Map(tenants.map((tenant) => [tenant.id, tenant])), officeById, landlordById, userById })),
        offices: offices.map((office) => ({ id: office.id, name: officeName(office) })).sort((a, b) => a.name.localeCompare(b.name)),
        generatedAt: new Date().toISOString(),
    };
}

function mapVacantRoom({
    landlordById,
    officeById,
    propertyById,
    room,
}: {
    landlordById: Map<string, LandlordRow>;
    officeById: Map<string, OfficeRow>;
    propertyById: Map<string, PropertyRow>;
    room: RoomRow;
}): TenantRelocationRoom {
    const property = room.property_id ? propertyById.get(room.property_id) ?? null : null;
    const landlord = (room.landlord_id ?? property?.landlord_id) ? landlordById.get((room.landlord_id ?? property?.landlord_id) as string) ?? null : null;
    const office = room.office_id ? officeById.get(room.office_id) ?? null : null;
    return {
        roomId: room.id,
        roomNumber: room.room_number ?? "Unnumbered",
        monthlyRent: amount(room.monthly_rent),
        status: room.status,
        officeId: room.office_id,
        officeName: officeName(office),
        propertyId: room.property_id,
        propertyName: propertyName(property),
        location: propertyLocation(property),
        landlordId: landlord?.id ?? null,
        landlordName: landlord?.full_name ?? "No landlord",
    };
}

function mapRequest({
    landlordById,
    officeById,
    request,
    roomById,
    tenantById,
    userById,
}: {
    landlordById: Map<string, LandlordRow>;
    officeById: Map<string, OfficeRow>;
    request: Record<string, unknown>;
    roomById: Map<string, RoomRow>;
    tenantById: Map<string, TenantRow>;
    userById: Map<string, UserRow>;
}): TenantRelocationRequest {
    const oldRoom = roomById.get(String(request.old_room_id ?? ""));
    const newRoom = roomById.get(String(request.new_room_id ?? ""));
    const tenant = tenantById.get(String(request.tenant_id ?? ""));
    const office = officeById.get(String(request.office_id ?? ""));
    const oldLandlord = landlordById.get(String(request.old_landlord_id ?? ""));
    const newLandlord = landlordById.get(String(request.new_landlord_id ?? ""));
    const requestedBy = userById.get(String(request.requested_by ?? ""));
    const approvedBy = userById.get(String(request.approved_by ?? ""));
    const status = String(request.status ?? "pending");
    return {
        id: String(request.id),
        tenantId: String(request.tenant_id ?? ""),
        tenantName: tenant?.full_name ?? "Unknown tenant",
        oldRoomId: String(request.old_room_id ?? ""),
        oldRoomNumber: oldRoom?.room_number ?? "Unknown room",
        newRoomId: String(request.new_room_id ?? ""),
        newRoomNumber: newRoom?.room_number ?? "Unknown room",
        officeId: String(request.office_id ?? "") || null,
        officeName: officeName(office),
        oldLandlordName: oldLandlord?.full_name ?? "No landlord",
        newLandlordName: newLandlord?.full_name ?? "No landlord",
        oldRent: amount(request.old_rent),
        newRent: amount(request.new_rent),
        rentDifference: amount(request.rent_difference),
        relocationDate: String(request.relocation_date ?? ""),
        status: status === "approved" || status === "rejected" ? status : "pending",
        reason: typeof request.reason === "string" ? request.reason : null,
        adminComment: typeof request.admin_comment === "string" ? request.admin_comment : null,
        requestedByName: requestedBy?.full_name ?? null,
        approvedByName: approvedBy?.full_name ?? null,
        createdAt: typeof request.created_at === "string" ? request.created_at : null,
        approvedAt: typeof request.approved_at === "string" ? request.approved_at : null,
        rejectedAt: typeof request.rejected_at === "string" ? request.rejected_at : null,
    };
}

function emptyData(context: Awaited<ReturnType<typeof requireAuth>>, isAdmin: boolean): TenantRelocationPageData {
    return {
        company: context.activeCompany,
        activeOffice: context.activeOffice,
        isAdmin,
        canSubmit: false,
        canApprove: false,
        tenants: [],
        vacantRooms: [],
        requests: [],
        offices: [],
        generatedAt: new Date().toISOString(),
    };
}
