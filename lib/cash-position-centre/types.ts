export type CashPositionFilters = {
    bankingStatus?: string | null;
    collectorId?: string | null;
    endDate?: string;
    expenseStatus?: string | null;
    officeId?: string | null;
    paymentMethod?: string | null;
    period?: string | null;
    startDate?: string;
};

export type CashPositionKpi = {
    label: string;
    previousValue?: number;
    value: number;
    hint: string;
    tone: "green" | "blue" | "cyan" | "amber" | "red" | "violet";
};

export type CashPositionOfficeRow = {
    alreadyBanked: number;
    approvedExpensesPeriod: number;
    bankingPercentage: number;
    cashAfterApprovedExpenses: number;
    cashBeforeExpenses: number;
    cashCollectedToday: number;
    cashHeldByCollectors: number;
    cashHeldInOffice: number;
    collectorCount: number;
    givenToAdmin: number;
    largestPayment: number;
    lastPaymentAt: string | null;
    monthlyPerformance: number;
    numberOfReceipts: number;
    officeId: string;
    officeName: string;
    outstandingToAdmin: number;
    outstandingToBank: number;
    pendingExpensesPeriod: number;
    projectedCashAfterPendingExpenses: number;
    securityDeposits: number;
    status: "healthy" | "attention" | "critical";
    statusReason: string;
    todayPerformance: number;
    trend: "up" | "down" | "flat";
    weeklyPerformance: number;
    receiptBreakdown: CashPositionReceiptBreakdownItem[];
};

export type CashPositionCollectorRow = {
    averageReceipt: number;
    banked: number;
    cashInHand: number;
    cashSubmitted: number;
    collectionSpeed: string;
    collectorId: string;
    collectorName: string;
    currentStatus: "active" | "inactive" | "needs_review";
    customerRating: string;
    largestReceipt: number;
    lastActivity: string | null;
    officeId: string | null;
    officeName: string;
    outstanding: number;
    photoUrl: string | null;
    reliability: number;
    riskScore: number;
    thisMonth: number;
    thisWeek: number;
    todayCollections: number;
};

export type CashPositionInsight = {
    action: string;
    amount: number;
    id: string;
    message: string;
    severity: "success" | "info" | "warning" | "critical";
    title: string;
};

export type CashPositionChartPoint = {
    label: string;
    value: number;
};

export type CashPositionDailyCard = {
    amountBanked: number;
    amountHandedToAdmin: number;
    cashStillHeld: number;
    changeFromPreviousDay: number;
    date: string;
    receiptCount: number;
    strongestCollector: string;
    strongestOffice: string;
    totalCollected: number;
    trend: "up" | "down" | "flat";
    receiptBreakdown: CashPositionReceiptBreakdownItem[];
};

export type CashPositionReceiptBreakdownItem = {
    amount: number;
    auditHref: string;
    collectorId: string | null;
    collectorName: string;
    contributesToCashTotals: boolean;
    contributesToReceiptCount: boolean;
    createdAt: string | null;
    issuedAt: string | null;
    officeId: string | null;
    officeName: string;
    openPaymentHref: string;
    paymentDate: string | null;
    paymentId: string;
    paymentMethod: string;
    receiptId: string | null;
    receiptNumber: string | null;
    roomNumber: string | null;
    status: string;
    tenantName: string;
    viewReceiptHref: string | null;
    warning: string | null;
};

export type CashPositionData = {
    charts: {
        bankingTimeline: CashPositionChartPoint[];
        collectorComparison: CashPositionChartPoint[];
        dailyCashMovement: CashPositionChartPoint[];
        monthlyCollections: CashPositionChartPoint[];
        officeComparison: CashPositionChartPoint[];
        officeRanking: CashPositionChartPoint[];
        securityLiability: CashPositionChartPoint[];
    };
    collectors: CashPositionCollectorRow[];
    companyName: string;
    dailyCards: CashPositionDailyCard[];
    filters: Required<Omit<CashPositionFilters, "expenseStatus" | "officeId" | "paymentMethod">> & {
        bankingStatus: string | null;
        collectorId: string | null;
        expenseStatus: string | null;
        officeId: string | null;
        paymentMethod: string | null;
    };
    generatedAt: string;
    insights: CashPositionInsight[];
    kpis: CashPositionKpi[];
    offices: Array<{ id: string; name: string }>;
    officeRows: CashPositionOfficeRow[];
    totals: {
        approvedExpensesToday: number;
        approvedExpensesPeriod: number;
        approvedExpensesThisMonth: number;
        cashDifferenceAlerts: number;
        cashHeldByCollectors: number;
        cashHeldByOffices: number;
        cashWaitingToBeBanked: number;
        cashAfterExpenses: number;
        cashBeforeExpenses: number;
        companyCashAvailable: number;
        pendingExpensesPeriod: number;
        pendingExpenseRequests: number;
        projectedCashAfterPendingApprovals: number;
        securityDepositsHeld: number;
        totalBanked: number;
        totalCashCollectedToday: number;
        totalCashHandedToAdmin: number;
        unreconciledCash: number;
    };
};
