import type { Company, Office } from "@/lib/auth/types";

export type SpreadsheetRow = {
    id: string;
    source: "collection" | "promise" | "expense" | "landlord_payment" | "attendance" | "daily_report" | "vacated_debt" | "landlord_deduction";
    date: string;
    officeId: string | null;
    officeName: string;
    tenantName: string;
    phone: string;
    property: string;
    room: string;
    amountPaid: number;
    balanceBefore: number;
    balanceAfter: number;
    promiseAmount: number;
    promiseDate: string | null;
    promiseStatus: string;
    collectedBy: string;
    paymentMethod: string;
    collectionReference: string;
    transactionType: string;
    expenses: number;
    expenseCategory: string;
    paidLandlords: number;
    landlordName: string;
    settlementAmount: number;
    notes: string;
    dateTime: string;
    createdAt: string;
    updatedAt: string;
    createdBy: string;
    auditStatus: string;
};

export type SpreadsheetSummary = {
    collections: number;
    promises: number;
    expenses: number;
    landlordPayments: number;
    attendance: number;
    dailyReports: number;
    vacatedDebts: number;
    landlordDeductions: number;
    balanceAfter: number;
};

export type SpreadsheetData = {
    company: Company | null;
    activeOffice: Office | null;
    canAccessAllOffices: boolean;
    loadedAt: string;
    error: string | null;
    rows: SpreadsheetRow[];
    sourceCounts: {
        collections: number;
        promises: number;
        expenses: number;
        landlordPayments: number;
        attendance: number;
        dailyReports: number;
        vacatedDebts: number;
        landlordDeductions: number;
    };
    offices: Office[];
    collectors: Array<{ id: string; name: string }>;
    properties: Array<{ id: string; name: string }>;
    summary: SpreadsheetSummary;
};
