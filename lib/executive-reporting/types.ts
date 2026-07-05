import type { Database } from "@/types/database.types";
import type { Company, Office } from "@/lib/auth/types";

export type CollectionRow = Database["public"]["Tables"]["collections"]["Row"];
export type PromiseRow = Database["public"]["Tables"]["promises"]["Row"];
export type PropertyRow = Database["public"]["Tables"]["properties"]["Row"];
export type RoomRow = Database["public"]["Tables"]["rooms"]["Row"];
export type TenantRow = Database["public"]["Tables"]["tenants"]["Row"];
export type LandlordRow = Database["public"]["Tables"]["landlords"]["Row"];
export type ExpenseRow = Database["public"]["Tables"]["expenses"]["Row"];
export type AttendanceEventRow = Database["public"]["Tables"]["attendance_events"]["Row"];
export type EmployeeRow = Database["public"]["Tables"]["employees"]["Row"];

export type ExecutiveKpis = {
    companyCollections: number;
    companyExpenses: number;
    netCashPosition: number;
    occupancyRate: number;
    activeTenants: number;
    outstandingPromises: number;
    collectionRecoveryRate: number;
    attendanceRate: number;
    totalProperties: number;
    totalLandlords: number;
};

export type TrendPoint = {
    label: string;
    date: string;
    value: number;
};

export type TrendAnalytics = {
    collections: TrendPoint[];
    expenses: TrendPoint[];
    occupancy: TrendPoint[];
    attendance: TrendPoint[];
    promiseRecovery: TrendPoint[];
};

export type OfficeScorecard = {
    officeId: string;
    officeName: string;
    collections: number;
    expenses: number;
    netCashPosition: number;
    occupancyRate: number;
    attendanceRate: number;
    promiseRecoveryRate: number;
    collectionRecoveryRate: number;
    totalProperties: number;
    activeTenants: number;
    outstandingPromises: number;
    overallScore: number;
    trend: "up" | "down" | "flat";
};

export type OfficeLeagueRow = OfficeScorecard & {
    rank: number;
};

export type ExecutiveSummary = {
    title: string;
    period: string;
    collections: number;
    expenses: number;
    netCashPosition: number;
    occupancyRate: number;
    attendanceRate: number;
    promiseRecoveryRate: number;
    narrative: string;
};

export type ExecutiveReportingData = {
    company: Company | null;
    activeOffice: Office | null;
    offices: Office[];
    kpis: ExecutiveKpis;
    officeScorecards: OfficeScorecard[];
    leagueTable: OfficeLeagueRow[];
    trends: TrendAnalytics;
    summaries: {
        daily: ExecutiveSummary;
        weekly: ExecutiveSummary;
        monthly: ExecutiveSummary;
    };
};
