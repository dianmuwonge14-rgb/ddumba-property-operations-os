import type { Database } from "@/types/database.types";

export type PropertyRow = Database["public"]["Tables"]["properties"]["Row"];
export type RoomRow = Database["public"]["Tables"]["rooms"]["Row"];
export type RoomStatusHistoryRow = Database["public"]["Tables"]["room_status_history"]["Row"];
export type TenantRow = Database["public"]["Tables"]["tenants"]["Row"];
export type LeaseRow = Database["public"]["Tables"]["leases"]["Row"];
export type LandlordRow = Database["public"]["Tables"]["landlords"]["Row"];
export type OfficeRow = Database["public"]["Tables"]["offices"]["Row"];
export type CompanyRow = Database["public"]["Tables"]["companies"]["Row"];

export type PropertyKpis = {
    totalProperties: number;
    totalRooms: number;
    occupiedRooms: number;
    vacantRooms: number;
    occupancyRate: number;
    rentRoll: number;
    roomsExpiringSoon: number;
};

export type RoomWithOccupancy = RoomRow & {
    tenant: TenantRow | null;
    activeLease: LeaseRow | null;
    statusHistory: RoomStatusHistoryRow[];
};

export type PropertyItem = PropertyRow & {
    landlord: LandlordRow | null;
    office: OfficeRow | null;
    rooms: RoomWithOccupancy[];
    totalRoomsComputed: number;
    occupiedRoomsComputed: number;
    vacantRoomsComputed: number;
    rentRollComputed: number;
    expiringSoonCount: number;
};

export type PropertiesPageData = {
    company: CompanyRow | null;
    office: OfficeRow | null;
    offices: Array<{ id: string; name: string }>;
    landlords: LandlordRow[];
    pendingBulkRequests: Array<{
        id: string;
        officeId: string;
        officeName: string;
        landlordName: string;
        roomCount: number;
        occupiedRooms: number;
        vacantRooms: number;
        rentRoll: number;
        openingOutstanding: number;
        status: string;
        createdAt: string;
    }>;
    kpis: PropertyKpis;
    initialProperty: PropertyItem | null;
    properties: PropertyItem[];
};

export type CreatePropertyInput = {
    propertyName: string;
    propertyType?: string;
    landlordId?: string;
    address?: string;
    city?: string;
    region?: string;
    totalUnits?: number;
    expectedCollection?: number;
};

export type EditPropertyInput = CreatePropertyInput & {
    propertyId: string;
    status?: string;
};

export type ArchivePropertyInput = {
    propertyId: string;
    reason?: string;
};

export type CreateRoomInput = {
    propertyId: string;
    roomNumber: string;
    monthlyRent: number;
    status?: string;
    floor?: string;
    sizeSqM?: number;
};

export type EditRoomInput = CreateRoomInput & {
    roomId: string;
    outstandingBalance?: number;
};

export type UpdateRoomStatusInput = {
    roomId: string;
    status: string;
    reason?: string;
};

export type BulkRoomInput = {
    roomNumber: string;
    monthlyRent: number;
    propertyId?: string;
    propertyName?: string;
    location?: string;
    status: "occupied" | "vacant";
    startDate?: string;
    notes?: string;
    tenantName?: string;
    tenantPhone?: string;
    tenantNationalId?: string;
    moveInDate?: string;
    outstandingMode?: "none" | "has_outstanding";
    outstandingBalance?: number;
    outstandingDate?: string;
    outstandingNotes?: string;
};

export type CreateLandlordWithRoomsBulkInput = {
    officeId?: string;
    landlordName: string;
    phone?: string;
    email?: string;
    nationalId?: string;
    paymentMethods?: string;
    commissionType: "percentage" | "fixed_amount";
    commissionValue: number;
    notes?: string;
    rooms: BulkRoomInput[];
};
