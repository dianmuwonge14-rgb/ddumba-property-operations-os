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
export type ExpensePeriodMode = "single_date" | "date_range" | "single_month" | "month_range";

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
    officeName?: string | null;
    propertyName: string | null;
    landlordName: string | null;
    submittedByName: string | null;
    approvalState: "approved" | "pending" | "rejected";
};

export type ExpensesPageData = {
    company: CompanyRow | null;
    office: OfficeRow | null;
    offices: Array<{ id: string; name: string }>;
    categories: ExpenseCategoryRow[];
    properties: PropertyRow[];
    landlords: LandlordRow[];
    landlordOptions: Array<{ id: string; name: string; officeId: string | null; officeName: string | null }>;
    employeeOptions: Array<{ id: string; name: string; officeId: string | null; officeName: string | null; role: string | null }>;
    landlordPaymentRequests: Array<{
        id: string;
        landlordId: string;
        landlordName: string;
        officeId: string;
        officeName: string;
        amount: number;
        normalPaymentAmount: number;
        advanceAmount: number;
        currentNetPayable: number;
        alreadyPaidAmount: number;
        outstandingAmount: number;
        flagReason: string | null;
        paymentDate: string;
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
    totalExpenses: number;
    remainingBalance: number;
    expenseRows: number;
    paymentRows: number;
};

export type ExpenseBalanceReport = {
    filters: Required<Pick<ExpenseBalanceFilters, "mode" | "singleDate" | "startDate" | "endDate" | "singleMonth" | "startMonth" | "endMonth">> & Pick<ExpenseBalanceFilters, "officeId">;
    officeName: string;
    isAdmin: boolean;
    generatedAt: string;
    generatedBy: string;
    totals: ExpenseBalanceTotals;
    expenses: ExpenseItem[];
};

export type CreateExpenseInput = {
    amount: number;
    categoryId?: string;
    category?: string;
    propertyId?: string;
    item?: string;
    vendor?: string;
    description?: string;
    expenseDate?: string;
    receiptUrl?: string;
};

export type CreateLandlordPaidExpenseRequestInput = {
    amount: number;
    advanceAgreement?: Record<string, unknown>;
    expenseDate: string;
    landlordId: string;
    paymentMethod?: string;
    paymentMonth?: string;
    notes?: string;
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
    itemName: string;
    monthKey: string;
};

export type CreateEmployeeExpenseInput = {
    amount: number;
    employeeId: string;
    expenseDate: string;
    expenseItem: string;
    note?: string;
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

export type EditExpenseInput = CreateExpenseInput & {
    expenseId: string;
};

export type ExpenseDecisionInput = {
    expenseId: string;
    notes?: string;
};

export type CreateExpenseCategoryInput = {
    key: string;
    name: string;
};
