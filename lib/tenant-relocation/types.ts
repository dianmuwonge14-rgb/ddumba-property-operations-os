import type { Database } from "@/types/database.types";

export type CompanyRow = Database["public"]["Tables"]["companies"]["Row"];
export type OfficeRow = Database["public"]["Tables"]["offices"]["Row"];

export type TenantRelocationTenant = {
    tenantId: string;
    tenantName: string;
    phone: string | null;
    nationalId: string | null;
    balance: number;
    status: string | null;
    currentRoomId: string;
    currentRoomNumber: string;
    currentRent: number;
    currentOfficeId: string | null;
    currentOfficeName: string;
    currentPropertyId: string | null;
    currentPropertyName: string;
    currentLocation: string;
    currentLandlordId: string | null;
    currentLandlordName: string;
    currentLeaseId: string | null;
    billingDay: number;
};

export type TenantRelocationRoom = {
    roomId: string;
    roomNumber: string;
    monthlyRent: number;
    status: string | null;
    officeId: string | null;
    officeName: string;
    propertyId: string | null;
    propertyName: string;
    location: string;
    landlordId: string | null;
    landlordName: string;
};

export type TenantRelocationRequest = {
    id: string;
    tenantId: string;
    tenantName: string;
    oldRoomId: string;
    oldRoomNumber: string;
    newRoomId: string;
    newRoomNumber: string;
    officeId: string | null;
    officeName: string;
    oldLandlordName: string;
    newLandlordName: string;
    oldRent: number;
    newRent: number;
    rentDifference: number;
    relocationDate: string;
    status: "pending" | "approved" | "rejected";
    reason: string | null;
    adminComment: string | null;
    requestedByName: string | null;
    approvedByName: string | null;
    createdAt: string | null;
    approvedAt: string | null;
    rejectedAt: string | null;
};

export type TenantRelocationInsight = {
    id: string;
    title: string;
    message: string;
    severity: "info" | "warning" | "critical";
};

export type TenantRelocationPageData = {
    company: CompanyRow | null;
    activeOffice: OfficeRow | null;
    isAdmin: boolean;
    canSubmit: boolean;
    canApprove: boolean;
    tenants: TenantRelocationTenant[];
    vacantRooms: TenantRelocationRoom[];
    requests: TenantRelocationRequest[];
    offices: Array<{ id: string; name: string }>;
    generatedAt: string;
};
