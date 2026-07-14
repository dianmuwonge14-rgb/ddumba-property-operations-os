import type { Company, Office } from "@/lib/auth/types";

export type LandlordMonthlyPayable = {
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
    opening_arrears?: number | string;
    monthly_net_payable?: number | string;
    total_due?: number | string;
    amount_paid: number | string;
    unpaid_balance: number | string;
    overpaid_amount?: number | string;
    advance_created?: number | string;
    closing_arrears?: number | string;
    paid_at?: string | null;
    payment_reference?: string | null;
    accounting_notes?: string | null;
    status: string;
    reasons_notes: string | null;
    last_paid_at: string | null;
    created_at: string;
    updated_at: string;
};

export type LandlordAdvance = {
    id: string;
    company_id: string;
    office_id: string | null;
    landlord_id: string;
    advance_amount: number | string;
    principal_amount?: number | string;
    repayment_type?: string;
    interest_calculation_mode?: string;
    interest_type?: "none" | "fixed" | "percentage" | string;
    interest_rate?: number | string;
    fixed_interest_amount?: number | string;
    interest_amount?: number | string;
    total_repayable?: number | string;
    deducted_amount: number | string;
    remaining_balance: number | string;
    date_given: string;
    deduction_start_date?: string | null;
    deduction_end_date?: string | null;
    payment_plan?: "one_time" | "monthly" | "custom" | string;
    principal_clearance_method?: string;
    monthly_deduction_amount?: number | string;
    expected_end_date?: string | null;
    actual_cleared_date?: string | null;
    remaining_principal_balance?: number | string;
    remaining_interest_balance?: number | string;
    remaining_total_balance?: number | string;
    principal_cleared_at?: string | null;
    lifecycle_status?: "active" | "paused" | "cleared" | "cancelled" | string;
    paused_at?: string | null;
    pause_reason?: string | null;
    resumed_at?: string | null;
    early_settlement_policy?: string;
    early_settlement_discount?: number | string;
    revision_number?: number | string;
    last_revised_at?: string | null;
    reason: string | null;
    note: string | null;
    status: "pending" | "partially_deducted" | "fully_deducted" | string;
    deducted_at: string | null;
    approved_by?: string | null;
    approved_at?: string | null;
    approved_date?: string | null;
    created_at: string;
    updated_at: string;
    landlordName: string;
    officeName: string;
};

export type LandlordAdvanceGroup = {
    landlordId: string;
    landlordName: string;
    officeName: string;
    totalAdvanced: number;
    totalDeducted: number;
    remainingBalance: number;
    nextDeductionMonth: string | null;
    status: string;
    advances: LandlordAdvance[];
};

export type LandlordPayableGroup = {
    landlordId: string;
    landlordName: string;
    officeName: string;
    monthsUnpaid: number;
    totalPayable: number;
    totalPaid: number;
    totalOutstanding: number;
    oldestUnpaidMonth: string | null;
    lastPaidAt: string | null;
    activePaymentDetail?: LandlordPayablePaymentDetail | null;
    approvedPaymentDetails?: LandlordPayablePaymentDetail[];
    rows: LandlordMonthlyPayable[];
};

export type LandlordUnpaidMonthGroup = {
    monthKey: string;
    totalPayable: number;
    totalPaid: number;
    totalDeductions: number;
    totalUnpaid: number;
    rows: Array<{
        id: string;
        landlordId: string;
        landlordName: string;
        officeId: string;
        officeName: string;
        payableAmount: number;
        amountPaid: number;
        unpaidBalance: number;
        deductions: number;
        status: string;
        settlementMonth: string;
    }>;
};

export type LandlordPayablePaymentDetail = {
    id: string;
    label: string | null;
    paymentMethod: "cash" | "mobile_money" | "bank";
    provider: string | null;
    accountName: string | null;
    accountNumber: string | null;
    isDefault: boolean;
    mobileMoneyProvider: string | null;
    mobileMoneyNumber: string | null;
    mobileMoneyAccountName: string | null;
    bankName: string | null;
    bankAccountNumber: string | null;
    bankAccountName: string | null;
    branch: string | null;
};

export type PaidLandlordPayment = {
    id: string;
    landlordId: string | null;
    landlordName: string;
    officeId: string | null;
    officeName: string;
    settlementMonth: string | null;
    netPayable: number;
    amountPaid: number;
    paymentMethod: string;
    paymentDate: string | null;
    reference: string | null;
    paidBy: string | null;
};

export type LandlordPaymentApprovalRequest = {
    id: string;
    officeId: string | null;
    officeName: string;
    landlordId: string | null;
    landlordName: string;
    requestedAmount: number;
    normalPaymentAmount: number;
    advanceAmount: number;
    paymentMonth: string | null;
    paymentDate: string | null;
    paymentMethod: string;
    status: "pending" | "approved" | "rejected" | string;
    submittedAt: string | null;
    reviewedAt: string | null;
    adminComment: string | null;
};

export type LandlordPaymentOption = {
    id: string;
    name: string;
    officeId: string | null;
    officeName: string;
    phone?: string | null;
    searchText?: string | null;
    roomNumbersText?: string | null;
    locationText?: string | null;
};

export type LandlordPaymentOfficeOption = {
    id: string;
    name: string;
};

export type LandlordPayablesData = {
    company: Company | null;
    activeOffice: Office | null;
    canAccessAllOffices: boolean;
    canManage: boolean;
    rows: LandlordMonthlyPayable[];
    groups: LandlordPayableGroup[];
    unpaidMonthGroups: LandlordUnpaidMonthGroup[];
    advances: LandlordAdvance[];
    advanceGroups: LandlordAdvanceGroup[];
    paidPayments: PaidLandlordPayment[];
    approvalRequests: LandlordPaymentApprovalRequest[];
    landlords: LandlordPaymentOption[];
    offices: LandlordPaymentOfficeOption[];
    summary: {
        totalUnpaidLandlordMoney: number;
        totalUnpaidAcrossMonths: number;
        unpaidLandlords: number;
        partialLandlords: number;
        needsReviewLandlords: number;
        totalOutstandingToLandlords: number;
        oldestUnpaidMonth: string | null;
        totalLandlordAdvances: number;
        activeLandlordAdvances: number;
        recoveryDeductions: number;
        paidLandlords: number;
        totalMoneyPaidToLandlords: number;
    };
    debug: {
        currentMonthKey: string;
        totalPayableRows: number;
        paidRows: number;
        unpaidRows: number;
        partialRows: number;
        unknownRows: number;
        excludedRows: Array<{
            id: string;
            landlordName: string;
            status: string;
            marker: string;
            reason: string;
        }>;
    };
};
