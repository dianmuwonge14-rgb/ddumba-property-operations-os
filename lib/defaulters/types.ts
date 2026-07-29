import type { Database } from "@/types/database.types";

export type CompanyRow = Database["public"]["Tables"]["companies"]["Row"];
export type OfficeRow = Database["public"]["Tables"]["offices"]["Row"];

export type DefaulterItem = {
    id: string;
    source: "active_tenant" | "vacated_debt" | "recently_cleared";
    tenantId: string;
    roomId: string | null;
    roomNumber: string;
    tenantName: string;
    tenantPhone: string | null;
    officeId: string | null;
    officeName: string;
    landlordId: string | null;
    landlordName: string;
    propertyName: string;
    location: string;
    monthlyRent: number;
    outstandingBalance: number;
    oldestUnpaidPeriod: string;
    unpaidPeriods: number;
    paymentDueDay: number;
    paymentDueDate: string;
    dueSource: "move_in_date" | "billing_day" | "default_first";
    daysDefaulted: number;
    monthsDefaulted: number;
    lastPaymentDate: string | null;
    lastPaymentAmount: number;
    promiseStatus: string;
    openPromiseCount: number;
    failedPromiseCount: number;
    currentMonthPaid: number;
    isPartialPayer: boolean;
    collectorAssigned: string;
    riskLevel: "low" | "medium" | "high";
    lastFollowUp: string | null;
    nextRecommendedAction: string;
    clearedDate: string | null;
    recoveryStatus: string | null;
    landlordDeductionStatus: string | null;
    suggestedActions: string[];
};

export type DefaulterAssistant = {
    justBecameDefaulters: DefaulterItem[];
    longestDefaulted: DefaulterItem | null;
    highestOutstanding: DefaulterItem | null;
    urgentFollowUps: DefaulterItem[];
    failedPromiseTenants: DefaulterItem[];
    partialPayers: DefaulterItem[];
    callToday: DefaulterItem[];
    highestRiskOffice: string;
    insights: Array<{
        id: string;
        title: string;
        message: string;
        severity: "info" | "warning" | "critical";
    }>;
};

export type DefaultersKpis = {
    totalDefaulters: number;
    totalOutstanding: number;
    defaultersAddedToday: number;
    clearedToday: number;
    highRiskDefaulters: number;
    promisesDueToday: number;
    vacatedWithDebt: number;
    oldestOutstandingAccount: string;
    defaultedOneToSevenDays: number;
    defaultedEightToThirtyDays: number;
    defaultedOneMonthPlus: number;
    highestRiskOffice: string;
    highestOutstandingTenant: string;
};

export type DefaultersPageData = {
    company: CompanyRow | null;
    activeOffice: OfficeRow | null;
    isAdmin: boolean;
    isCollector: boolean;
    offices: Array<{ id: string; name: string }>;
    landlords: Array<{ id: string; name: string }>;
    properties: Array<{ id: string; name: string }>;
    collectors: Array<{ id: string; name: string }>;
    defaulters: DefaulterItem[];
    integrityAlerts: string[];
    assistant: DefaulterAssistant;
    kpis: DefaultersKpis;
    generatedAt: string;
    currentDate: string;
};
