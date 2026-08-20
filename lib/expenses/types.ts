import type { Database } from "@/types/database.types";

export type ExpenseRow = Database["public"]["Tables"]["expenses"]["Row"];
export type ExpenseCategoryRow = Database["public"]["Tables"]["expense_categories"]["Row"];
export type OfficeRow = Database["public"]["Tables"]["offices"]["Row"];
export type CompanyRow = Database["public"]["Tables"]["companies"]["Row"];
export type PropertyRow = Database["public"]["Tables"]["properties"]["Row"];
export type LandlordRow = Database["public"]["Tables"]["landlords"]["Row"];
export type CollectionRow = Database["public"]["Tables"]["collections"]["Row"];
export type CashAccountRow = Database["public"]["Tables"]["cash_accounts"]["Row"];
export type UserRow = Database["public"]["Tables"]["users"]["Row"];
export type EmployeeRow = Database["public"]["Tables"]["employees"]["Row"];
export type ExpensePeriodMode = "single_date" | "date_range" | "single_month" | "month_range" | "all_dates";

export type ExpenseKpis = {
    totalExpenses: number;
    todayExpenses: number;
    monthExpenses: number;
    officeExpenses: number;
    propertyExpenses: number;
    expenseRecoveryRate: number;
    netCashPosition: number;
};

export type ExpenseItem = ExpenseRow & {
    categoryName: string | null;
    employeeId?: string | null;
    employeeName?: string | null;
    officeName?: string | null;
    paymentMethod?: string | null;
    propertyName: string | null;
    landlordName: string | null;
    submittedByName: string | null;
    approvalState: "approved" | "pending" | "rejected";
    status?: string | null;
};

export type EmployeeExpenseOption = {
    id: string;
    name: string;
    officeId: string | null;
    officeName: string | null;
    role: string | null;
    phone: string | null;
    email: string | null;
    assignmentType: string | null;
};

export type ExpenseChangeRequestItem = {
    id: string;
    expenseId: string;
    officeId: string | null;
    officeName: string;
    itemName: string;
    amount: number;
    changeType: string;
    originalValue: Record<string, unknown>;
    requestedValue: Record<string, unknown>;
    reason: string;
    status: string;
    requestedByName: string;
    requestedByAccountType: string | null;
    createdAt: string | null;
    adminComment: string | null;
    reviewedAt?: string | null;
    reviewedByName?: string | null;
    proofUrl?: string | null;
};

export type LandlordExpenseEditRequestItem = {
    id: string;
    landlordId: string;
    landlordName: string;
    officeId: string | null;
    officeName: string;
    requestType: string;
    oldValue: Record<string, unknown>;
    requestedValue: Record<string, unknown>;
    effectiveDate: string | null;
    effectiveMonth: string | null;
    reason: string;
    status: string;
    requestedByName: string;
    createdAt: string | null;
    adminComment: string | null;
    proofUrl?: string | null;
};

export type SalaryPaymentRequestItem = {
    id: string;
    employeeId: string;
    employeeName: string;
    position: string | null;
    payrollOfficeId: string | null;
    payrollOfficeName: string;
    requestingOfficeId: string | null;
    requestingOfficeName: string;
    monthKey: string;
    salaryDueDate: string | null;
    monthlySalary: number;
    alreadyPaid: number;
    eligibleSalary: number;
    requestedAmount: number;
    salaryAmount: number;
    advanceAmount: number;
    paymentMethod: string;
    reference: string | null;
    notes: string | null;
    status: string;
    requestedByName: string;
    createdAt: string | null;
    adminComment: string | null;
    proofUrl?: string | null;
};

export type ExpensesPageData = {
    company: CompanyRow | null;
    office: OfficeRow | null;
    preparedByName: string | null;
    preparedByRole: string | null;
    offices: Array<{ id: string; name: string }>;
    categories: ExpenseCategoryRow[];
    properties: PropertyRow[];
    landlords: LandlordRow[];
    landlordOptions: Array<{
        id: string;
        name: string;
        officeId: string | null;
        officeName: string | null;
        location?: string | null;
        commissionType?: string | null;
        commissionRate?: number | null;
        portfolioValue?: number;
        numberOfRooms?: number;
        occupiedRooms?: number;
        roomNumbers?: string[];
        searchText?: string;
        vacantRooms?: number;
        vacatedWithDebt?: number;
    }>;
    employeeOptions: EmployeeExpenseOption[];
    expenseChangeRequests: ExpenseChangeRequestItem[];
    landlordExpenseEditRequests: LandlordExpenseEditRequestItem[];
    landlordPaymentRequests: Array<{
        id: string;
        landlordId: string;
        landlordName: string;
        officeId: string;
        officeName: string;
        amount: number;
        normalPaymentAmount: number;
        advanceAmount: number;
        advanceRecoveryAmount: number;
        cashPaymentAmount: number;
        remainingAdvanceBalance: number;
        currentNetPayable: number;
        alreadyPaidAmount: number;
        outstandingAmount: number;
        flagReason: string | null;
        paymentDate: string;
        landlordPaymentDueDate: string | null;
        paymentMonth: string | null;
        paymentMethod: string;
        status: string;
        notes: string | null;
        createdAt: string | null;
        adminComment: string | null;
    }>;
    employeeExpenseRequests: Array<{
        id: string;
        employeeId: string;
        employeeName: string;
        officeId: string | null;
        officeName: string;
        itemKey: string;
        itemName: string;
        amount: number;
        allowedAmount: number;
        alreadySpentAmount: number;
        remainingBefore: number;
        extraAmount: number;
        expenseDate: string;
        status: string;
        note: string | null;
        createdAt: string | null;
        adminComment: string | null;
    }>;
    salaryPaymentRequests: SalaryPaymentRequestItem[];
    banking: {
        records: Array<{
            id: string;
            bankingDate: string;
            officeId: string | null;
            officeName: string;
            amount: number;
            method: string;
            bankAccount: string;
            reference: string | null;
            bankedBy: string;
            status: string;
            createdAt: string | null;
            notes: string | null;
        }>;
        summaries: Array<{
            officeId: string;
            officeName: string;
            currentPhysicalOfficeCash: number;
            collectionsToday: number;
            approvedExpensesToday: number;
            alreadyBankedToday: number;
            cashHandedToAdminToday: number;
            pendingBanking: number;
            pendingCashHandover: number;
            eligibleAmountAvailableToBank: number;
        }>;
        totals: {
            currentMoneyAtBank: number;
            currentCashHeldByAdmin: number;
        };
    };
    treasuryCashRequests: Array<{
        id: string;
        requestType: "banking" | "cash_handover_admin";
        officeId: string;
        officeName: string;
        amount: number;
        businessDate: string;
        method: string | null;
        bankAccountName: string | null;
        reference: string | null;
        reason: string;
        notes: string | null;
        handedOverBy: string | null;
        receivedByAdminName: string | null;
        status: string;
        submittedByName: string;
        approvedByName: string | null;
        createdAt: string | null;
        adminComment: string | null;
    }>;
    cashAccounts: CashAccountRow[];
    kpis: ExpenseKpis;
    expenses: ExpenseItem[];
};

export type ExpenseBalanceFilters = {
    mode?: ExpensePeriodMode;
    singleDate?: string;
    startDate?: string;
    endDate?: string;
    singleMonth?: string;
    startMonth?: string;
    endMonth?: string;
    officeId?: string | null;
};

export type ExpenseBalanceTotals = {
    totalCollections: number;
    adminCapitalInjectionTotal: number;
    totalExpenses: number;
    remainingBalance: number;
    expenseRows: number;
    paymentRows: number;
};

export type PendingCashExpenseProjection = {
    currentActualOfficeCash: number;
    pendingCashExpenses: number;
    pendingCashExpenseCount: number;
    pendingBankExpenses: number;
    pendingMobileMoneyExpenses: number;
    projectedOfficeCashAfterPendingExpenses: number;
};

export type ExpenseReportCollectionItem = CollectionRow & {
    amountValue: number;
    auditReference: string | null;
    collectionSourceKey: "tenant" | "admin_capital_injection" | "other";
    collectionSourceLabel: string;
    createdAt: string | null;
    officeName: string | null;
    paymentDate: string | null;
    paymentMethod: string | null;
    purpose: string | null;
    reference: string | null;
    receiptNumber: string | null;
    recordedByName: string | null;
    roomLabel: string | null;
    notes: string | null;
    statusLabel: string;
    tenantName: string | null;
};

export type ExpenseBalanceReport = {
    filters: Required<Pick<ExpenseBalanceFilters, "mode" | "singleDate" | "startDate" | "endDate" | "singleMonth" | "startMonth" | "endMonth">> & Pick<ExpenseBalanceFilters, "officeId">;
    officeName: string;
    isAdmin: boolean;
    generatedAt: string;
    generatedBy: string;
    totals: ExpenseBalanceTotals;
    cashProjection: PendingCashExpenseProjection;
    pendingCashExpenses: ExpenseItem[];
    expenses: ExpenseItem[];
    collections: ExpenseReportCollectionItem[];
};

export type CreateExpenseInput = {
    amount: number;
    backdatingReason?: string | null;
    categoryId?: string;
    category?: string;
    propertyId?: string;
    item?: string;
    officeId?: string | null;
    vendor?: string;
    description?: string;
    expenseDate?: string;
    paymentMethod?: string;
    receiptUrl?: string;
    supportingProof?: ExpenseProofUploadInput | null;
};

export type ExpenseProofUploadInput = {
    base64: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
};

export type CreateLandlordPaidExpenseRequestInput = {
    amount: number;
    advanceAgreement?: Record<string, unknown>;
    advanceRecoveryAmount?: number;
    backdatingReason?: string | null;
    expenseDate: string;
    landlordId: string;
    officeId?: string | null;
    paymentMethod?: string;
    paymentMonth?: string;
    notes?: string;
    supportingProof?: ExpenseProofUploadInput | null;
};

export type EmployeeExpensePreview = {
    allowanceId: string | null;
    allowanceAmount: number;
    alreadySpentAmount: number;
    pendingAmount: number;
    remainingAllowance: number;
    allowedPortion: number;
    extraAmount: number;
    dailyLunchAllowance: number;
    lunchEarnedThisMonth: number;
    lunchTakenThisMonth: number;
    lunchBalanceBefore: number;
    lunchBalanceAfter: number;
    presentForExpenseDate: boolean;
    attendanceStatus: string;
    salaryImpactAmount: number;
    treatment: "company_expense" | "employee_personal_expense";
    approvalRequired: boolean;
    employeeName: string;
    employeeHomeOfficeId?: string | null;
    submittingOfficeId?: string | null;
    itemName: string;
    monthKey: string;
};

export type CreateEmployeeExpenseInput = {
    amount: number;
    backdatingReason?: string | null;
    employeeId: string;
    expenseDate: string;
    expenseItem: string;
    note?: string;
    officeId?: string | null;
};

export type CreateSalaryPaymentInput = {
    amount: number;
    backdatingReason?: string | null;
    employeeId: string;
    notes?: string | null;
    officeId?: string | null;
    paymentMethod: string;
    reference?: string | null;
    salaryMonth: string;
    supportingProof?: ExpenseProofUploadInput | null;
};

export type DecideSalaryPaymentRequestInput = {
    requestId: string;
    decision: "approved" | "rejected";
    comment?: string;
};

export type DecideEmployeeExpenseRequestInput = {
    requestId: string;
    decision: "approved" | "rejected";
    comment?: string;
};

export type DecideLandlordPaidExpenseRequestInput = {
    requestId: string;
    decision: "approved" | "rejected";
    comment?: string;
};

export type LandlordExpenseEditRequestType =
    | "landlord_outstanding_balance_edit"
    | "landlord_advance_balance_edit"
    | "landlord_payment_date_edit";

export type SubmitLandlordExpenseEditInput = {
    landlordId: string;
    officeId?: string | null;
    requestType: LandlordExpenseEditRequestType;
    oldValue: number | string | null;
    newValue: number | string;
    reason: string;
    effectiveDate?: string;
    effectiveMonth?: string;
    proofUrl?: string | null;
};

export type DecideLandlordExpenseEditRequestInput = {
    requestId: string;
    decision: "approved" | "rejected" | "more_info";
    comment?: string;
};

export type EditExpenseInput = CreateExpenseInput & {
    expenseId: string;
};

export type ExpenseChangePayload = {
    amount?: number | null;
    category?: string | null;
    categoryId?: string | null;
    employeeId?: string | null;
    expenseDate?: string | null;
    item?: string | null;
    officeId?: string | null;
    paymentMethod?: string | null;
    receiptUrl?: string | null;
    status?: string | null;
    vendor?: string | null;
    description?: string | null;
};

export type SubmitExpenseChangeRequestInput = {
    changeType?: string;
    expenseId: string;
    proofUrl?: string | null;
    reason: string;
    requested: ExpenseChangePayload;
};

export type DecideExpenseChangeRequestInput = {
    requestId: string;
    decision: "approved" | "rejected";
    comment?: string;
};

export type DeleteExpenseInput = {
    expenseId: string;
    reason?: string;
};

export type ExpenseDecisionInput = {
    expenseId: string;
    notes?: string;
};

export type CreateExpenseCategoryInput = {
    key: string;
    name: string;
};
