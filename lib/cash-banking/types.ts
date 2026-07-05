export type CashBankingFilters = {
    startDate?: string;
    endDate?: string;
    officeId?: string | null;
};

export type CashOfficeOption = {
    id: string;
    name: string;
};

export type CashOfficeSummary = {
    officeId: string;
    officeName: string;
    collectedToday: number;
    collectedPeriod: number;
    expensesPeriod: number;
    moneyAtOffice: number;
    moneyBanked: number;
    adminFloatReceived: number;
    bankingCount: number;
};

export type CashLedgerRow = {
    id: string;
    date: string;
    time: string;
    officeId: string | null;
    officeName: string;
    transactionType: "collection" | "bank_deposit" | "admin_float" | "expense" | "cash_adjustment";
    label: string;
    amountIn: number;
    amountOut: number;
    runningBalance: number;
    recordedBy: string;
    reference: string | null;
    notes: string | null;
    transferId?: string | null;
    transferStatus?: string | null;
    canReassign?: boolean;
    canCancel?: boolean;
};

export type CashInsight = {
    id: string;
    severity: "critical" | "warning" | "info" | "success";
    title: string;
    message: string;
    action: string;
};

export type CashBankingData = {
    filters: Required<Omit<CashBankingFilters, "officeId">> & { officeId: string | null };
    generatedAt: string;
    isAdmin: boolean;
    canManage: boolean;
    offices: CashOfficeOption[];
    officeSummaries: CashOfficeSummary[];
    ledger: CashLedgerRow[];
    insights: CashInsight[];
    totals: {
        collectedToday: number;
        collectedPeriod: number;
        expensesPeriod: number;
        moneyAtOffices: number;
        moneyBanked: number;
        moneyAtBank: number;
        adminCashBalance: number;
        companyCashPosition: number;
        adminFloatGiven: number;
    };
};
