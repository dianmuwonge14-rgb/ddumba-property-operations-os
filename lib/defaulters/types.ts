import type { Database } from "@/types/database.types";

export type CompanyRow = Database["public"]["Tables"]["companies"]["Row"];
export type OfficeRow = Database["public"]["Tables"]["offices"]["Row"];

export type DefaulterItem = {
    id: string;
    tenantId: string;
    roomId: string;
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
    paymentDueDay: number;
    paymentDueDate: string;
    dueSource: "move_in_date" | "billing_day" | "default_first";
    daysDefaulted: number;
    monthsDefaulted: number;
    lastPaymentDate: string | null;
    lastPaymentAmount: number;
    openPromiseCount: number;
    failedPromiseCount: number;
    currentMonthPaid: number;
    isPartialPayer: boolean;
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
    offices: Array<{ id: string; name: string }>;
    landlords: Array<{ id: string; name: string }>;
    defaulters: DefaulterItem[];
    assistant: DefaulterAssistant;
    kpis: DefaultersKpis;
    generatedAt: string;
    currentDate: string;
};
