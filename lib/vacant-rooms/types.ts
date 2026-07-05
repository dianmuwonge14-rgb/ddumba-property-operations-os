import type { Database } from "@/types/database.types";

export type RoomRow = Database["public"]["Tables"]["rooms"]["Row"];
export type CompanyRow = Database["public"]["Tables"]["companies"]["Row"];
export type OfficeRow = Database["public"]["Tables"]["offices"]["Row"];

export type VacantRoomItem = {
    id: string;
    roomNumber: string;
    officeId: string | null;
    officeName: string;
    propertyName: string;
    location: string;
    landlordId: string | null;
    landlordName: string;
    monthlyRent: number;
    vacantSince: string | null;
    daysVacant: number;
    lastTenantName: string | null;
    status: string;
    commissionRate: number;
    commissionMode: "portfolio_based" | "occupied_room_based";
    companyProfitLost: number;
    yearlyProjectedLoss: number;
    suggestedActions: string[];
    rawRoom: RoomRow;
};

export type VacancyAssistant = {
    roomsVacantLongest: VacantRoomItem[];
    highestRentRooms: VacantRoomItem[];
    landlordsLosingMost: Array<{ landlordId: string | null; landlordName: string; roomCount: number; monthlyLoss: number; companyProfitLoss: number }>;
    companyProfitLossLeaders: VacantRoomItem[];
    officesWithHighestRisk: Array<{ officeId: string | null; officeName: string; roomCount: number; monthlyLoss: number; companyProfitLoss: number; averageDaysVacant: number }>;
    marketFirst: VacantRoomItem[];
    lowRentTenantRooms: VacantRoomItem[];
    highValueTenantRooms: VacantRoomItem[];
    recentlyVacated: VacantRoomItem[];
    stayedVacantTooLong: VacantRoomItem[];
    insights: Array<{
        id: string;
        title: string;
        message: string;
        severity: "info" | "warning" | "critical";
    }>;
};

export type VacantRoomsKpis = {
    totalVacantRooms: number;
    totalMonthlyRentLost: number;
    totalCompanyCollectionsLost: number;
    totalCompanyProfitLost: number;
    averageDaysVacant: number;
    highestVacantRentLoss: number;
    officeWithMostVacantRooms: string;
};

export type VacantRoomsPageData = {
    company: CompanyRow | null;
    activeOffice: OfficeRow | null;
    isAdmin: boolean;
    canManageOccupancy: boolean;
    offices: Array<{ id: string; name: string }>;
    landlords: Array<{ id: string; name: string }>;
    locations: string[];
    rooms: VacantRoomItem[];
    assistant: VacancyAssistant;
    kpis: VacantRoomsKpis;
    generatedAt: string;
};
