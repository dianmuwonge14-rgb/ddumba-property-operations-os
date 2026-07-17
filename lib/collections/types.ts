import type { Database } from "@/types/database.types";

export type CollectionRow = Database["public"]["Tables"]["collections"]["Row"];
export type CollectionActionRow = Database["public"]["Tables"]["collection_actions"]["Row"];
export type PromiseRow = Database["public"]["Tables"]["promises"]["Row"];
export type TenantRow = Database["public"]["Tables"]["tenants"]["Row"];
export type RoomRow = Database["public"]["Tables"]["rooms"]["Row"];
export type PropertyRow = Database["public"]["Tables"]["properties"]["Row"];
export type OfficeRow = Database["public"]["Tables"]["offices"]["Row"];
export type LeaseRow = Database["public"]["Tables"]["leases"]["Row"];
export type TenantLedgerRow = Database["public"]["Tables"]["tenant_ledger_entries"]["Row"];
export type LandlordRow = Database["public"]["Tables"]["landlords"]["Row"];

export type RentSponsorPaymentMethod = "bank_cheque" | "bank_transfer" | "cash" | "mobile_money" | "other";
export type CollectionPaymentSource = "tenant" | "employer";

export type TenantRentSponsor = {
    id: string;
    company_id: string;
    office_id: string | null;
    tenant_id: string;
    lease_id: string | null;
    employer_name: string;
    contact_person: string | null;
    employer_phone: string | null;
    payment_method: RentSponsorPaymentMethod;
    covered_amount: number | string;
    tenant_top_up_amount: number | string;
    total_monthly_rent: number | string;
    cheque_reference: string | null;
    notes: string | null;
    status: "active" | "inactive";
    created_at: string | null;
    updated_at: string | null;
};

export type TenantContributionBreakdown = {
    hasSponsor: boolean;
    employerExpected: number;
    employerReceivedThisMonth: number;
    employerBalance: number;
    tenantTopUpExpected: number;
    tenantTopUpPaidThisMonth: number;
    tenantTopUpBalance: number;
    collectFromTenant: number;
};

export type CollectionTenantResult = {
    tenant: TenantRow;
    room: RoomRow | null;
    property: PropertyRow | null;
    office: OfficeRow | null;
    landlord: LandlordRow | null;
    lease: LeaseRow | null;
    outstandingBalance: number;
    previousOutstandingBeforeLastPayment: number;
    totalDueBeforeLastPayment: number;
    lastAmountPaid: number;
    amountUsedToClearOutstanding: number;
    amountAllocatedToNextMonth: number;
    monthlyRent: number;
    billingAnniversaryDay?: number | null;
    currentRentPeriod?: { start: string; end: string } | null;
    lastRentChargeDate?: string | null;
    nextRentChargeDate?: string | null;
    currentMonthPaid: number;
    advanceRentBalance: number;
    advanceRentMonths: Array<{ month: string; label: string; amount: number; coverageStart?: string | null; coverageEnd?: string | null }>;
    rentMonthAllocations: Array<{
        month: string;
        label: string;
        coverageStart?: string | null;
        coverageEnd?: string | null;
        amountDue: number;
        amountPaid: number;
        previouslyPaidAmount: number;
        lastPaymentAmount: number;
        status: "paid" | "partial" | "advance_paid";
        allocationType: "arrears_month" | "rent_month" | "future_advance";
    }>;
    nextMonthCoveredAmount: number;
    nextAdvanceRentMonth: string | null;
    sponsor: TenantRentSponsor | null;
    contribution: TenantContributionBreakdown;
    lastCollection: CollectionRow | null;
    openPromise: PromiseRow | null;
    collections: CollectionRow[];
    promises: PromiseRow[];
    ledgerEntries: TenantLedgerRow[];
    actionHistory: CollectionActionRow[];
};

export type CollectionActionItem = CollectionActionRow & {
    tenantName: string | null;
};

export type CollectionKpis = {
    todayCollections: number;
    monthCollections: number;
    outstandingBalance: number;
    promisesDueToday: number;
    promiseRecoveryRate: number;
};

export type CollectionsPageData = {
    kpis: CollectionKpis;
    recentActions: CollectionActionItem[];
    duePromises: Array<PromiseRow & { tenantName: string | null }>;
};

export type CollectionReportFilters = {
    singleDate?: string;
    startDate?: string;
    endDate?: string;
    singleMonth?: string;
    startMonth?: string;
    endMonth?: string;
    officeId?: string;
    room?: string;
    tenant?: string;
    paymentMethod?: string;
};

export type CollectionReportRow = {
    id: string;
    paidAt: string | null;
    date: string;
    time: string;
    roomNumber: string;
    tenantName: string;
    landlordName: string;
    officeName: string;
    amountPaid: number;
    remainingBalance: number;
    paymentMethod: string;
    recordedBy: string;
};

export type CollectionReportTotals = {
    totalAmount: number;
    paymentCount: number;
    tenantCount: number;
    cashTotal: number;
    bankTotal: number;
    mobileMoneyTotal: number;
    chequeTotal: number;
    outstandingBalanceRemaining: number;
};

export type CollectionReportData = {
    rows: CollectionReportRow[];
    totals: CollectionReportTotals;
    filters: Required<Pick<CollectionReportFilters, "singleDate">> & CollectionReportFilters;
    generatedAt: string;
    generatedBy: string;
    companyName: string;
    activeOfficeName: string | null;
    isAdmin: boolean;
};

export type CollectionsRecordsPageData = {
    report: CollectionReportData;
    offices: Array<{ id: string; name: string }>;
    isAdmin: boolean;
    generatedBy: string;
};

export type CollectionActionType =
    | "call"
    | "whatsapp"
    | "sms"
    | "visit"
    | "notice"
    | "promise_follow_up";

export type CollectionSearchInput = {
    query: string;
};

export type RecordCollectionInput = {
    tenantId: string;
    amount: number;
    paymentMethod: string;
    paymentSource?: CollectionPaymentSource;
    paymentKind?: "tenant_normal" | "tenant_top_up" | "employer_sponsor" | "arrears" | "advance";
    paymentDate?: string;
    payerName?: string;
    referenceNumber?: string;
    chequeReference?: string;
    collectorName?: string;
    notes?: string;
};

export type FastPaymentRecentItem = {
    id: string;
    paidAt: string | null;
    paymentDate: string | null;
    roomId: string | null;
    tenantId: string | null;
    roomNumber: string;
    tenantName: string;
    landlordName: string;
    officeName: string;
    amount: number;
    method: string;
    paymentType: string;
    recordedBy: string;
    balanceAfter: number;
    dateChangeRequestId: string | null;
    dateChangeRequestStatus: "pending" | "approved" | "rejected" | null;
    requestedPaymentDate: string | null;
    correctionRequestId: string | null;
    correctionRequestType: "date_change" | "amount_change" | "room_change" | "remove_payment" | null;
    correctionRequestStatus: "pending" | "approved" | "rejected" | null;
    isCorrected: boolean;
    correctionHistoryCount: number;
};

export type FastPaymentRecentTotals = {
    bankAmount: number;
    cashAmount: number;
    chequeAmount: number;
    mobileMoneyAmount: number;
    outstandingBalance: number;
    tenantCount: number;
    totalAmount: number;
    totalRows: number;
};

export type FastPaymentRecentResult = {
    pagination: {
        page: number;
        pageSize: number;
        totalPages: number;
        totalRows: number;
    };
    payments: FastPaymentRecentItem[];
    totals: FastPaymentRecentTotals;
};

export type AdvanceRentAssistantItem = {
    id: string;
    type: "advance_rent" | "prepaid_multiple_months" | "resolved" | "allocation_mismatch" | "coverage_mismatch";
    severity: "success" | "warning" | "danger";
    roomNumber: string;
    tenantName: string;
    officeName: string;
    monthlyRent: number;
    currentMonthPaid: number;
    outstandingBalance: number;
    advanceRentBalance: number;
    monthsCovered: string[];
    message: string;
};

export type UpsertTenantRentSponsorInput = {
    tenantId: string;
    employerName: string;
    contactPerson?: string;
    employerPhone?: string;
    paymentMethod: RentSponsorPaymentMethod;
    employerCoveredAmount: number;
    chequeReference?: string;
    notes?: string;
};

export type CreatePromiseInput = {
    tenantId: string;
    promisedAmount: number;
    promisedDate: string;
    notes?: string;
};

export type CreateCollectionActionInput = {
    tenantId: string;
    actionType: CollectionActionType;
    outcome?: string;
    notes?: string;
    nextFollowUpAt?: string;
};

export type FollowUpPromiseInput = {
    promiseId: string;
    outcome: string;
    notes?: string;
    nextFollowUpAt?: string;
    markFulfilled?: boolean;
};
