import type { Company, Office } from "@/lib/auth/types";
import type { Database } from "@/types/database.types";

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
export type AiInsightRow = Database["public"]["Tables"]["ai_insights"]["Row"];
export type AutomationRunRow = Database["public"]["Tables"]["automation_runs"]["Row"];
export type AuditLogRow = Database["public"]["Tables"]["audit_logs"]["Row"];
export type SecurityEventRow = Database["public"]["Tables"]["security_events"]["Row"];
export type CompanyScorecardRow = Database["public"]["Tables"]["company_scorecards"]["Row"];
export type ExecutiveSnapshotRow = Database["public"]["Tables"]["executive_kpi_snapshots"]["Row"];
export type PerformanceTargetRow = Database["public"]["Tables"]["performance_targets"]["Row"];
export type LandlordPaymentRow = Database["public"]["Tables"]["landlord_payments"]["Row"];
export type LandlordSettlementRow = Database["public"]["Tables"]["landlord_settlements"]["Row"];
export type UserRow = Database["public"]["Tables"]["users"]["Row"];

export type CeoSeverity = "critical" | "high" | "medium" | "low" | "healthy";
export type CeoTrend = "up" | "down" | "flat";

export type CeoOverview = {
    companyScore: number;
    companyHealth: number;
    riskScore: number;
    growthScore: number;
    executiveReadinessScore: number;
};

export type CashPosition = {
    todayCollections: number;
    todayExpenses: number;
    todayLandlordPayments: number;
    monthlyCollections: number;
    expenses: number;
    landlordPayments: number;
    netCashPosition: number;
    availableCash: number;
    forecastCashPosition: number;
    windows: {
        today: number;
        week: number;
        month: number;
    };
};

export type GrowthCentre = {
    occupancyGrowth: number;
    tenantGrowth: number;
    collectionGrowth: number;
    officeGrowth: number;
    revenueGrowth: number;
};

export type OfficeWarRoomRow = {
    officeId: string;
    officeName: string;
    rank: number;
    score: number;
    collectionPerformance: number;
    collectionTarget: number;
    occupancy: number;
    occupancyTarget: number;
    promiseRecovery: number;
    promiseRecoveryTarget: number;
    attendance: number;
    expenseControl: number;
    expenseBudget: number;
    reportCompliance: number;
    landlordSettlementTarget: number;
    collections: number;
    expenses: number;
    netPosition: number;
    trend: CeoTrend;
    status: "elite" | "strong" | "watch" | "risk";
};

export type OfficeTargetSet = {
    officeId: string;
    officeName: string;
    periodStart: string;
    periodEnd: string;
    collectionTarget: number;
    expenseBudget: number;
    landlordSettlementTarget: number;
    promiseRecoveryTarget: number;
    occupancyTarget: number;
};

export type PromiseRecoveryCommand = {
    openPromises: number;
    dueToday: number;
    dueTomorrow: number;
    overduePromises: number;
    fulfilledPromises: number;
    successRate: number;
    recoveryAmount: number;
    recoveryPercent: number;
};

export type LandlordSettlementCentreRow = {
    landlordId: string;
    landlordName: string;
    officeId: string | null;
    officeName: string;
    propertyNames: string[];
    collections: number;
    expenses: number;
    netAmountDue: number;
    lastSettlementDate: string | null;
    amountPaid: number;
    balanceDue: number;
};

export type ExecutiveAlert = {
    id: string;
    severity: CeoSeverity;
    title: string;
    description: string;
    officeName?: string;
};

export type AuditTimelineItem = {
    id: string;
    user: string;
    office: string;
    action: string;
    entityType: string;
    date: string;
    time: string;
};

export type AiPrediction = {
    id: string;
    title: string;
    value: string;
    severity: CeoSeverity;
    explanation: string;
};

export type RiskHeatMapItem = {
    id: string;
    label: string;
    category: "office" | "property" | "tenant" | "landlord" | "employee";
    riskScore: number;
    severity: CeoSeverity;
    signal: string;
};

export type IntelligenceFeedItem = {
    id: string;
    source: "critical" | "ai" | "automation" | "audit" | "security";
    title: string;
    message: string;
    severity: CeoSeverity;
    createdAt: string;
};

export type ForecastPoint = {
    label: string;
    value: number;
};

export type ForecastEngine = {
    collections: ForecastPoint[];
    occupancy: ForecastPoint[];
    cashFlow: ForecastPoint[];
    revenue: ForecastPoint[];
    riskTrend: ForecastPoint[];
};

export type ExecutiveAction = {
    id: string;
    title: string;
    description: string;
    severity: CeoSeverity;
    owner: string;
    due: string;
};

export type CompanyLeague = {
    bestOffice: OfficeWarRoomRow | null;
    worstOffice: OfficeWarRoomRow | null;
    fastestImprovingOffice: OfficeWarRoomRow | null;
    mostEfficientOffice: OfficeWarRoomRow | null;
    mostProfitableOffice: OfficeWarRoomRow | null;
};

export type DailyBriefing = {
    happenedToday: string[];
    needsAttention: string[];
    biggestRisks: string[];
    biggestOpportunities: string[];
    recommendedActions: string[];
};

export type CeoCommandData = {
    company: Company | null;
    activeOffice: Office | null;
    overview: CeoOverview;
    cash: CashPosition;
    growth: GrowthCentre;
    offices: OfficeWarRoomRow[];
    risks: RiskHeatMapItem[];
    intelligence: IntelligenceFeedItem[];
    forecast: ForecastEngine;
    actions: ExecutiveAction[];
    league: CompanyLeague;
    briefing: DailyBriefing;
    targets: OfficeTargetSet[];
    promiseRecovery: PromiseRecoveryCommand;
    landlordSettlements: LandlordSettlementCentreRow[];
    alerts: ExecutiveAlert[];
    auditTimeline: AuditTimelineItem[];
    aiPredictions: AiPrediction[];
    raw: {
        companyScorecards: CompanyScorecardRow[];
        executiveSnapshots: ExecutiveSnapshotRow[];
    };
};
