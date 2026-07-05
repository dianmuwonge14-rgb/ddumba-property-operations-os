export type EmployeeManagementOffice = {
    id: string;
    name: string;
};

export type EmployeeManagementRole = {
    id: string;
    name: string;
};

export type EmployeeFinance = {
    employeeId: string;
    basicSalary: number;
    bonuses: number;
    expenses: number;
    advances: number;
    fines: number;
    lunchEarned: number;
    lunchTaken: number;
    unusedLunchBalance: number;
    finalSalary: number;
    paidThisMonth: number;
    status: string;
};

export type EmployeeProfile = {
    id: string;
    fullName: string;
    age: number | null;
    employeeCode: string;
    phone: string;
    email: string;
    officeId: string | null;
    officeName: string;
    assignmentType: "fixed_office" | "all_rounder";
    defaultOfficeId: string | null;
    roleId: string | null;
    roleName: string;
    startDate: string;
    basicSalary: number;
    salaryDay: number;
    dailyLunchAllowance: number;
    advanceDeductionRule: string;
    probationStartDate: string;
    probationEndDate: string;
    probationSalary: number;
    normalSalaryAfterProbation: number;
    probationStatus: string;
    isFieldAgent: boolean;
    fieldOfficeNames: string[];
    offDayBalance: {
        monthlyEntitlement: number;
        carriedForward: number;
        usedDays: number;
        availableDays: number;
    };
    offDays: string[];
    status: string;
    notes: string;
    references: Array<{ name: string; relationship: string; phone: string }>;
    finance: EmployeeFinance;
    documents: Array<{ id: string; type: string; name: string; url: string }>;
};

export type EmployeeRequestItem = {
    id: string;
    employeeId: string;
    employeeName: string;
    officeId: string | null;
    officeName: string;
    amount?: number;
    startDate?: string;
    endDate?: string;
    requestedDays?: number;
    reason: string;
    status: string;
    createdAt: string;
    isLongLeave?: boolean;
};

export type EmployeePerformanceRow = {
    employeeId: string;
    employeeName: string;
    officeName: string;
    roleName: string;
    score: number;
    strengths: string;
    issues: string;
    aiRecommendation: string;
};

export type EmployeeManagementData = {
    companyName: string;
    monthKey: string;
    offices: EmployeeManagementOffice[];
    roles: EmployeeManagementRole[];
    employees: EmployeeProfile[];
    advanceRequests: EmployeeRequestItem[];
    offDayRequests: EmployeeRequestItem[];
    performance: EmployeePerformanceRow[];
    totals: {
        totalEmployees: number;
        activeEmployees: number;
        terminatedEmployees: number;
        totalBasicSalaries: number;
        totalBonuses: number;
        totalExpenses: number;
        totalAdvances: number;
        totalFines: number;
        totalLunchEarned: number;
        totalLunchTaken: number;
        totalUnusedLunchBalance: number;
        totalFinalSalaryPayable: number;
        salariesDueSoon: number;
        salariesPaidThisMonth: number;
        outstandingSalaries: number;
        companySavingsFromFines: number;
    };
    warnings: string[];
};
