import type { Database } from "@/types/database.types";
import type { Company, Office } from "@/lib/auth/types";

export type OfficeRow = Database["public"]["Tables"]["offices"]["Row"];
export type CollectionRow = Database["public"]["Tables"]["collections"]["Row"];
export type PromiseRow = Database["public"]["Tables"]["promises"]["Row"];
export type PropertyRow = Database["public"]["Tables"]["properties"]["Row"];
export type RoomRow = Database["public"]["Tables"]["rooms"]["Row"];
export type TenantRow = Database["public"]["Tables"]["tenants"]["Row"];
export type ExpenseRow = Database["public"]["Tables"]["expenses"]["Row"];
export type AttendanceEventRow = Database["public"]["Tables"]["attendance_events"]["Row"];
export type EmployeeRow = Database["public"]["Tables"]["employees"]["Row"];
export type CompanyScorecardRow = Database["public"]["Tables"]["company_scorecards"]["Row"];
export type OfficeScoreRow = Database["public"]["Tables"]["office_scores"]["Row"];
export type OfficeRankingRow = Database["public"]["Tables"]["office_rankings"]["Row"];
export type ExecutiveKpiSnapshotRow = Database["public"]["Tables"]["executive_kpi_snapshots"]["Row"];
export type CompanyCashPositionRow = Database["public"]["Tables"]["company_cash_positions"]["Row"];
export type DailyCashPositionRow = Database["public"]["Tables"]["daily_cash_positions"]["Row"];
export type LandlordRow = Database["public"]["Tables"]["landlords"]["Row"];
export type LandlordPaymentRow = Database["public"]["Tables"]["landlord_payments"]["Row"];
export type CompanySettingRow = Database["public"]["Tables"]["company_settings"]["Row"];

export type TenantRentSponsorRow = {
    id: string;
    company_id: string;
    office_id: string | null;
    tenant_id: string;
    covered_amount: number | string;
    tenant_top_up_amount: number | string;
    total_monthly_rent: number | string;
    status: string | null;
};

export type DashboardKpis = {
    companyCashPosition: number;
    todayCollections: number;
    monthCollections: number;
    expenses: number;
    netPosition: number;
    occupancyRate: number;
    attendanceRate: number;
    promiseRecovery: number;
    officeScore: number;
};

export type DashboardPeriod = {
    label: string;
    startDate: string;
    endDate: string;
};

export type LandlordAdvanceDashboardRow = {
    id: string;
    landlordId: string | null;
    landlordName: string;
    officeName: string;
    amountGiven: number;
    activeBalance: number;
    recoveredAmount: number;
    dateGiven: string | null;
    status: string;
};

export type OfficeLeagueRow = {
    officeId: string;
    officeName: string;
    rank: number;
    officeScore: number;
    collections: number;
    collectionTarget: number;
    collectionsVsTarget: number;
    promiseRecovery: number;
    occupancy: number;
    attendance: number;
    expenses: number;
    expenseControl: number;
    trend: "up" | "down" | "flat";
    status: "excellent" | "strong" | "watch" | "risk";
    storedScore: number | null;
    storedRank: number | null;
};

export type RiskAlert = {
    id: string;
    title: string;
    description: string;
    severity: "critical" | "warning" | "info";
    officeName?: string;
};

export type ActionRequired = {
    id: string;
    title: string;
    description: string;
    count: number;
    priority: "high" | "medium" | "normal";
};

export type DashboardLiveData = {
    company: Company | null;
    activeOffice: Office | null;
    offices: OfficeRow[];
    isAdmin: boolean;
    period: DashboardPeriod;
    lastSyncedAt: string;
    warnings: string[];
    kpis: DashboardKpis;
    league: OfficeLeagueRow[];
    riskAlerts: RiskAlert[];
    actions: ActionRequired[];
    snapshots: {
        companyScorecard: CompanyScorecardRow | null;
        executiveKpi: ExecutiveKpiSnapshotRow | null;
        companyCashPosition: CompanyCashPositionRow | null;
        dailyCashPositions: DailyCashPositionRow[];
    };
    finance: {
        expectedRentRoll: number;
        expectedLandlordPayable: number;
        expectedCompanyCommissionProfit: number;
        collectedSoFarThisMonth: number;
        landlordsPaid: number;
        landlordPaymentsMade: number;
        pendingLandlordPayments: number;
        landlordsNotPaid: number;
        totalAmountNotPaidToLandlords: number;
        outstandingTenantBalances: number;
        approvedExpenses: number;
        pendingExpenses: number;
        amountAtOffice: number;
        amountBanked: number;
        amountGivenToOfficeByAdmin: number;
        amountSentFromOfficeToBank: number;
        landlordAdvancesGiven: number;
        landlordAdvanceActiveBalance: number;
        landlordAdvanceRecovered: number;
        landlordAdvancePendingApprovals: number;
        landlordAdvanceRows: LandlordAdvanceDashboardRow[];
        occupiedRooms: number;
        vacantRooms: number;
        vacantDeductions: number;
        reconciliation: {
            dashboardRentRoll: number;
            liveRoomRentRoll: number;
            dashboardCommission: number;
            liveLandlordCommission: number;
            dashboardLandlordPayable: number;
            liveLandlordNetPayable: number;
            ledgerLandlordPayable: number;
            rentRollDifference: number;
            commissionDifference: number;
            payableDifference: number;
            missingLandlordCount: number;
            missingRoomCount: number;
        };
        employerContributionsExpected: number;
        employerContributionsReceived: number;
        tenantTopUpsExpected: number;
        tenantTopUpsCollected: number;
        tenantTopUpsStillToCollect: number;
        officeLandlordPayables: number;
        unpaidLandlords: number;
        totalMoneyHeldForLandlords: number;
        profitLossToday: number;
        profitLossThisMonth: number;
        collectionProgress: number;
    };
    rentCalendar: {
        currentBusinessDate: string;
        currentRentMonth: string;
        nextRolloverDate: string;
        lastRunAt: string | null;
        lastRunStatus: string | null;
        tenantsChargedThisMonth: number;
        failedRecordCount: number;
        canRunRollover: boolean;
    };
};
