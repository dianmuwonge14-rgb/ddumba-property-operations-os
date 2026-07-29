export type CashPositionFilters = {
    endDate?: string;
    officeId?: string | null;
    paymentMethod?: string | null;
    period?: string | null;
    startDate?: string;
};

export type CashPositionKpi = {
    label: string;
    value: number;
    hint: string;
    tone: "green" | "blue" | "cyan" | "amber" | "red" | "violet";
};

export type CashPositionOfficeRow = {
    alreadyBanked: number;
    bankingPercentage: number;
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
    securityDeposits: number;
    status: "healthy" | "attention" | "critical";
    statusReason: string;
    todayPerformance: number;
    trend: "up" | "down" | "flat";
    weeklyPerformance: number;
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

export type CashPositionData = {
    charts: {
        bankingTimeline: CashPositionChartPoint[];
        collectorComparison: CashPositionChartPoint[];
        dailyCashMovement: CashPositionChartPoint[];
        monthlyCollections: CashPositionChartPoint[];
        officeComparison: CashPositionChartPoint[];
        officeRanking: CashPositionChartPoint[];
    };
    collectors: CashPositionCollectorRow[];
    companyName: string;
    filters: Required<Omit<CashPositionFilters, "officeId" | "paymentMethod">> & {
        officeId: string | null;
        paymentMethod: string | null;
    };
    generatedAt: string;
    insights: CashPositionInsight[];
    kpis: CashPositionKpi[];
    offices: Array<{ id: string; name: string }>;
    officeRows: CashPositionOfficeRow[];
    totals: {
        cashDifferenceAlerts: number;
        cashHeldByCollectors: number;
        cashHeldByOffices: number;
        cashWaitingToBeBanked: number;
        companyCashAvailable: number;
        securityDepositsHeld: number;
        totalBanked: number;
        totalCashCollectedToday: number;
        totalCashHandedToAdmin: number;
        unreconciledCash: number;
    };
};
