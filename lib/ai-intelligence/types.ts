import type { Database } from "@/types/database.types";
import type { Company, Office } from "@/lib/auth/types";

export type AiInsightRow = Database["public"]["Tables"]["ai_insights"]["Row"];
export type DataQualityFindingRow = Database["public"]["Tables"]["data_quality_findings"]["Row"];
export type OfficeRow = Database["public"]["Tables"]["offices"]["Row"];
export type CollectionRow = Database["public"]["Tables"]["collections"]["Row"];
export type PromiseRow = Database["public"]["Tables"]["promises"]["Row"];
export type PropertyRow = Database["public"]["Tables"]["properties"]["Row"];
export type RoomRow = Database["public"]["Tables"]["rooms"]["Row"];
export type TenantRow = Database["public"]["Tables"]["tenants"]["Row"];
export type LandlordRow = Database["public"]["Tables"]["landlords"]["Row"];
export type ExpenseRow = Database["public"]["Tables"]["expenses"]["Row"];
export type AttendanceEventRow = Database["public"]["Tables"]["attendance_events"]["Row"];
export type EmployeeRow = Database["public"]["Tables"]["employees"]["Row"];

export type Severity = "critical" | "high" | "medium" | "low";
export type Trend = "up" | "down" | "flat";

export type ExecutiveRisk = {
    id: string;
    title: string;
    officeName: string;
    riskScore: number;
    severity: Severity;
    trend: Trend;
    recommendedAction: string;
};

export type CollectionIntelligence = {
    collectionForecast: number;
    endOfMonthProjection: number;
    likelyRecoveryAmount: number;
    officesLikelyToMissTargets: Array<{
        officeId: string;
        officeName: string;
        projectedTargetGap: number;
        targetAchievement: number;
    }>;
    bestCollectors: Array<{
        collectorId: string;
        collectorName: string;
        collectionValue: number;
        collectionCount: number;
    }>;
};

export type TenantIntelligence = {
    likelyDefaults: Array<{ tenantId: string; tenantName: string; balance: number; riskScore: number; officeName: string }>;
    repeatedLatePayers: Array<{ tenantId: string; tenantName: string; lateCount: number; balance: number }>;
    longOutstandingBalances: Array<{ tenantId: string; tenantName: string; balance: number; daysOutstanding: number }>;
    highValueTenants: Array<{ tenantId: string; tenantName: string; monthlyRent: number; balance: number }>;
    vacantRoomOpportunities: Array<{ roomId: string; roomNumber: string; officeName: string; monthlyRent: number }>;
};

export type LandlordIntelligence = {
    settlementDueAlerts: Array<{ landlordId: string; landlordName: string; balance: number; severity: Severity }>;
    highestRevenueLandlords: Array<{ landlordId: string; landlordName: string; revenue: number; properties: number }>;
    decliningPerformance: Array<{ landlordId: string; landlordName: string; currentRevenue: number; signal: string }>;
    requiringAttention: Array<{ landlordId: string; landlordName: string; reason: string; riskScore: number }>;
};

export type OfficeIntelligence = {
    officeId: string;
    officeName: string;
    healthScore: number;
    performanceScore: number;
    riskScore: number;
    growthScore: number;
    trendScore: number;
    status: "excellent" | "strong" | "watch" | "risk";
};

export type CommandFeedItem = {
    id: string;
    message: string;
    severity: Severity;
    trend: Trend;
    createdAt: string;
};

export type ExecutiveRecommendation = {
    id: string;
    title: string;
    description: string;
    priority: Severity;
    action: string;
};

export type AiIntelligenceData = {
    company: Company | null;
    activeOffice: Office | null;
    risks: ExecutiveRisk[];
    collection: CollectionIntelligence;
    tenant: TenantIntelligence;
    landlord: LandlordIntelligence;
    offices: OfficeIntelligence[];
    commandFeed: CommandFeedItem[];
    recommendations: ExecutiveRecommendation[];
    storedInsights: AiInsightRow[];
    dataQualityFindings: DataQualityFindingRow[];
};
