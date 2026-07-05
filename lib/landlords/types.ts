import type { Database } from "@/types/database.types";

export type LandlordRow = Database["public"]["Tables"]["landlords"]["Row"];
export type PropertyRow = Database["public"]["Tables"]["properties"]["Row"];
export type RoomRow = Database["public"]["Tables"]["rooms"]["Row"];
export type TenantRow = Database["public"]["Tables"]["tenants"]["Row"];
export type LeaseRow = Database["public"]["Tables"]["leases"]["Row"];
export type CollectionRow = Database["public"]["Tables"]["collections"]["Row"];
export type ExpenseRow = Database["public"]["Tables"]["expenses"]["Row"];
export type OfficeRow = Database["public"]["Tables"]["offices"]["Row"];
export type CompanyRow = Database["public"]["Tables"]["companies"]["Row"];
export type UserRow = Database["public"]["Tables"]["users"]["Row"];
export type LandlordSettlementRow = Database["public"]["Tables"]["landlord_settlements"]["Row"];
export type LandlordSettlementPeriodRow = Database["public"]["Tables"]["landlord_settlement_periods"]["Row"];
export type LandlordSettlementLineRow = Database["public"]["Tables"]["landlord_settlement_lines"]["Row"];
export type LandlordStatementRow = Database["public"]["Tables"]["landlord_statements"]["Row"];
export type LandlordPaymentRow = Database["public"]["Tables"]["landlord_payments"]["Row"];
export type LandlordPayoutRow = Database["public"]["Tables"]["landlord_payouts"]["Row"];
export type PropertyLandlordRow = Database["public"]["Tables"]["property_landlords"]["Row"];

export type LandlordPaymentDetail = {
    id: string;
    landlordId: string;
    officeId: string | null;
    paymentMethod: "cash" | "mobile_money" | "bank";
    label: string | null;
    provider: string | null;
    accountName: string | null;
    accountNumber: string | null;
    mobileMoneyProvider: string | null;
    mobileMoneyNumber: string | null;
    mobileMoneyAccountName: string | null;
    bankName: string | null;
    bankAccountNumber: string | null;
    bankAccountName: string | null;
    branch: string | null;
    notes: string | null;
    status: "pending" | "approved" | "rejected" | "archived";
    isActive: boolean;
    isDefault: boolean;
    adminComment: string | null;
    createdAt: string | null;
    approvedAt: string | null;
};

export type VacatedTenantDebtRow = {
    id: string;
    company_id: string;
    office_id: string;
    tenant_exit_record_id: string;
    tenant_id: string;
    lease_id: string | null;
    room_id: string | null;
    property_id: string | null;
    landlord_id: string | null;
    tenant_name: string | null;
    tenant_phone: string | null;
    room_number: string | null;
    property_name: string | null;
    landlord_name: string | null;
    office_name: string | null;
    original_amount: number | string;
    recovered_amount: number | string;
    remaining_amount: number | string;
    recovery_status: string;
    notes: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
};

export type LandlordDebtDeductionRow = {
    id: string;
    company_id: string;
    office_id: string;
    landlord_id: string | null;
    tenant_id: string | null;
    room_id: string | null;
    property_id: string | null;
    vacated_tenant_debt_id: string;
    settlement_id: string | null;
    tenant_name: string | null;
    room_number: string | null;
    property_name: string | null;
    landlord_name: string | null;
    office_name: string | null;
    amount: number | string;
    applied_amount: number | string;
    status: string;
    applied_at: string | null;
    notes: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
    advance_payment_month?: string | null;
    vacate_date?: string | null;
    reason?: string | null;
    carried_forward_amount?: number | string | null;
};

export type LandlordMonthlyPayableRow = {
    id: string;
    company_id: string;
    office_id: string;
    landlord_id: string;
    settlement_id: string | null;
    settlement_month: string;
    landlord_name: string | null;
    office_name: string | null;
    full_rent_roll: number | string;
    commission_mode: string;
    commission_percentage: number | string;
    commission_amount: number | string;
    vacant_room_deductions: number | string;
    vacated_tenant_debt_deductions: number | string;
    advance_deductions: number | string;
    other_deductions: number | string;
    net_payable: number | string;
    amount_paid: number | string;
    unpaid_balance: number | string;
    status: string;
    reasons_notes: string | null;
    last_paid_at: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
};

export type LandlordCurrentMonthPaymentStatus = "paid" | "unpaid" | "partial" | "snapshot_needed";

export type LandlordCurrentMonthPayable = {
    month: string;
    source: "snapshot" | "live_fallback";
    status: LandlordCurrentMonthPaymentStatus;
    label: string;
    fullRentRoll: number;
    commissionMode: string;
    commissionPercentage: number;
    commissionAmount: number;
    commissionBaseAmount: number;
    paidAmount: number;
    outstandingAmount: number;
    recoveryDeduction: number;
    netPayable: number;
};

export type LandlordSettlementRoomLine = {
    roomId: string;
    roomNumber: string;
    propertyName: string;
    tenantName: string;
    tenantPhone: string | null;
    monthlyRent: number;
    payableAmount: number;
    status: "occupied" | "vacant";
    reason: string;
};

export type LandlordSettlementRecoveryLine = {
    deductionId: string;
    tenantName: string;
    roomNumber: string;
    propertyName: string;
    roomRent: number;
    amount: number;
    alreadyRecovered: number;
    appliedInEstimate: number;
    remainingAfterEstimate: number;
    reason: string;
    status: string;
};

export type LandlordAdvanceDeductionLine = {
    advanceId: string;
    advanceDate: string | null;
    originalAdvanceAmount: number;
    deductionTerm: string;
    thisMonthDeduction: number;
    remainingAdvanceBalance: number;
};

export type LandlordSettlementEstimate = {
    settlementMonth: string;
    roomsOwned: number;
    occupiedRooms: number;
    vacantRooms: number;
    expectedGrossRent: number;
    occupiedPayableRent: number;
    commissionBaseAmount: number;
    commissionCalculationMode: LandlordCommissionCalculationMode;
    companyCommissionRate: number;
    companyCommissionAmount: number;
    landlordGrossPayable: number;
    previousUnrecoveredTenantDebts: number;
    emptyRoomDeductions: number;
    vacatedTenantDebtDeductions: number;
    netLandlordPayable: number;
    carriedForwardRecoveryBalance: number;
    paymentStatus: "pending" | "paid" | "partially_paid" | "deducted" | "held";
    occupiedRoomLines: LandlordSettlementRoomLine[];
    vacantRoomLines: LandlordSettlementRoomLine[];
    recoveryLines: LandlordSettlementRecoveryLine[];
    advanceDeductionLines: LandlordAdvanceDeductionLine[];
    landlordAdvanceDeductions: number;
};

export type LandlordKpis = {
    totalLandlords: number;
    activeLandlords: number;
    propertiesManaged: number;
    outstandingSettlements: number;
    settlementsDue: number;
    collectionValue: number;
    netPayable: number;
};

export type LandlordItem = LandlordRow & {
    portfolioRoomCount: number;
    searchableText: string;
    commissionRate: number;
    commissionCalculationMode: LandlordCommissionCalculationMode;
    commissionInputMode: "percentage" | "landlord_net_amount";
    landlordNetPayableOverride: number | null;
    commissionSource: "landlord_override" | "company_default";
    commissionUpdatedAt: string | null;
    commissionUpdatedBy: string | null;
    companyDefaultCommissionRate: number;
    offices: OfficeRow[];
    properties: PropertyRow[];
    rooms: LandlordRoomPortfolioItem[];
    locations: string[];
    settlements: LandlordSettlementRow[];
    settlementLines: LandlordSettlementLineRow[];
    statements: LandlordStatementRow[];
    payments: LandlordPaymentRow[];
    payouts: LandlordPayoutRow[];
    collectionValue: number;
    expenseValue: number;
    netPayable: number;
    outstandingSettlementValue: number;
    totalExpectedMonthlyCollection: number;
    totalCollectedThisMonth: number;
    totalOutstandingBalance: number;
    totalLandlordPayable: number;
    vacatedTenantDebts: VacatedTenantDebtRow[];
    landlordDebtDeductions: LandlordDebtDeductionRow[];
    totalVacatedTenantDebt: number;
    totalRecoveredFromLandlord: number;
    remainingRecoveryBalance: number;
    monthlyPayables: LandlordMonthlyPayableRow[];
    currentMonthPayable: LandlordCurrentMonthPayable;
    unpaidMonthlyPayables: LandlordMonthlyPayableRow[];
    totalUnpaidMonthlyPayables: number;
    oldestUnpaidMonth: string | null;
    settlementEstimate: LandlordSettlementEstimate;
    activePaymentDetail: LandlordPaymentDetail | null;
    pendingPaymentDetail: LandlordPaymentDetail | null;
    approvedPaymentDetails: LandlordPaymentDetail[];
    pendingPaymentDetails: LandlordPaymentDetail[];
};

export type LandlordRoomAssignmentOption = {
    roomId: string;
    roomNumber: string;
    officeId: string | null;
    officeName: string;
    propertyId: string | null;
    propertyName: string;
    currentLandlordId: string | null;
    currentLandlordName: string;
    monthlyRent: number;
    status: string;
};

export type LandlordRoomPaymentStatus = "paid" | "partial" | "unpaid" | "vacant";
export type LandlordCommissionCalculationMode = "portfolio_based" | "occupied_room_based";

export type LandlordRoomPortfolioItem = {
    room: RoomRow;
    property: PropertyRow | null;
    tenant: TenantRow | null;
    lease: LeaseRow | null;
    monthlyRent: number;
    previousBalance: number;
    currentMonthRent: number;
    outstandingBalance: number;
    totalOutstandingBalance: number;
    collectedThisMonth: number;
    unpaidBalance: number;
    startDate: string | null;
    payableThisMonth: boolean;
    payableReason: string;
    paymentStatus: LandlordRoomPaymentStatus;
};

export type LandlordsPageData = {
    company: CompanyRow | null;
    office: OfficeRow | null;
    kpis: LandlordKpis;
    landlords: LandlordItem[];
    pagination: {
        page: number;
        pageSize: number;
        totalLandlords: number;
        totalPages: number;
        search: string;
        hasPreviousPage: boolean;
        hasNextPage: boolean;
    };
    selectedLandlordId: string | null;
    unassignedProperties: PropertyRow[];
    companyDefaultCommissionRate: number;
    roomAssignmentOptions: LandlordRoomAssignmentOption[];
};

export type CreateLandlordInput = {
    fullName: string;
    phone?: string;
    email?: string;
    nationalId?: string;
    landlordCode?: string;
    expectedIncome?: number;
};

export type EditLandlordInput = CreateLandlordInput & {
    landlordId: string;
    status?: string;
};

export type ArchiveLandlordInput = {
    landlordId: string;
    reason?: string;
};

export type AssignPropertyInput = {
    landlordId: string;
    propertyId: string;
    ownershipPercentage?: number;
};

export type GenerateSettlementInput = {
    landlordId: string;
    periodStart: string;
    periodEnd: string;
    managementFeeRate?: number;
};

export type GenerateStatementInput = {
    settlementId: string;
};

export type UpdateLandlordCommissionInput = {
    landlordId: string;
    commissionRate: number | null;
    commissionCalculationMode?: LandlordCommissionCalculationMode;
    inputMode?: "percentage" | "landlord_net_amount";
    landlordNetAmount?: number | null;
    notes?: string;
};

export type AssignLandlordRoomsInput = {
    roomIds: string[];
    landlordId: string | null;
    reason?: string;
};

export type AddLandlordRoomInput = {
    landlordId: string;
    roomNumber: string;
    monthlyRent: number;
    startDate: string;
    officeId: string;
    propertyId?: string | null;
    propertyLocation?: string | null;
    roomLocation?: string | null;
    status: "occupied" | "vacant";
    tenantName?: string | null;
    tenantPhone?: string | null;
    notes?: string | null;
};

export type DeleteLandlordRoomInput = {
    landlordId: string;
    roomId: string;
    reason?: string | null;
};
