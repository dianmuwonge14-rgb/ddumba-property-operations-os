import type { Company, Office } from "@/lib/auth/types";

export type StatementCategory = "landlords" | "tenants" | "offices";

export type StatementFilters = {
    category: StatementCategory;
    statementType: string;
    startDate: string;
    endDate: string;
    startMonth: string;
    endMonth: string;
    singleMonth: string;
    officeId: string;
};

export type StatementColumn = {
    key: string;
    label: string;
    align?: "left" | "right" | "center";
};

export type StatementRow = Record<string, string | number | null>;

export type StatementSummary = {
    primaryLabel: string;
    primaryValue: number;
    secondaryLabel: string;
    secondaryValue: number;
    rowCount: number;
    periodLabel: string;
};

export type StatementOfficeOption = {
    id: string;
    name: string;
};

export type StatementsCentreData = {
    company: Company | null;
    activeOffice: Office | null;
    generatedAt: string;
    filters: StatementFilters;
    offices: StatementOfficeOption[];
    title: string;
    description: string;
    columns: StatementColumn[];
    rows: StatementRow[];
    totals: StatementRow;
    summary: StatementSummary;
};
