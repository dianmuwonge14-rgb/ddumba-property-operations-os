export type SalaryStatus =
    | "upcoming"
    | "due_today"
    | "pending_payment"
    | "partially_paid"
    | "paid"
    | "overdue"
    | "suspended"
    | "not_configured";

export type SalaryPaymentRecord = {
    id: string;
    amount: number;
    paidAt: string;
    method: string;
    reference: string;
    recordedBy: string;
    approvedBy: string;
    notes: string;
};

export type SalaryCardData = {
    employeeId: string;
    employeeName: string;
    employeeCode: string;
    role: string;
    officeId: string | null;
    officeName: string;
    employmentStatus: string;
    salaryType: string;
    monthlySalary: number;
    allowances: number;
    deductions: number;
    netSalary: number;
    salaryPeriod: string;
    salaryPaymentDay: number;
    salaryPaymentDate: string | null;
    countdownLabel: string;
    salaryEarnedSoFar: number;
    salaryAlreadyPaid: number;
    remainingSalaryBalance: number;
    status: SalaryStatus;
    statusLabel: string;
    lastSalaryPaymentDate: string | null;
    lastSalaryAmount: number;
    nextSalaryDate: string | null;
    payments: SalaryPaymentRecord[];
};

export type PersonalSalaryCentreData = {
    companyName: string;
    employee: SalaryCardData | null;
    history: SalaryCardData[];
    warnings: string[];
};

export type AdminPayrollCentreData = {
    companyName: string;
    monthKey: string;
    employees: SalaryCardData[];
    offices: Array<{ id: string; name: string }>;
    totals: {
        totalMonthlyPayroll: number;
        paidSalaries: number;
        outstandingSalaries: number;
        dueToday: number;
        overdueSalaries: number;
        partiallyPaid: number;
        notConfigured: number;
    };
    warnings: string[];
};
