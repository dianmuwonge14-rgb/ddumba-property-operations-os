import { collectionAmount, isFinanciallyEffectiveCollection } from "@/lib/collections/validity";
import { moneyAmount } from "@/lib/tenants/balance-reconciliation";

export type MonthlyLedgerCollection = Record<string, unknown> & {
    amount?: number | string | null;
    amount_paid?: number | string | null;
    paid_at?: string | null;
    payment_date?: string | null;
};

export type TenantMonthlyLedgerPosition = {
    advance: number;
    arrears: number;
    currentMonthRent: number;
    lastPaymentAmount: number;
    lastPaymentDate: string | null;
    lastPaymentId: string | null;
    outstanding: number;
    paymentsThisMonth: number;
    rawBalance: number;
    selectedMonth: string;
    totalDue: number;
};

export function calculateTenantMonthlyPosition({
    arrears,
    currentMonthRent,
    paymentsThisMonth,
}: {
    arrears: number;
    currentMonthRent: number;
    paymentsThisMonth: number;
}) {
    const safeArrears = moneyAmount(arrears);
    const safeRent = moneyAmount(currentMonthRent);
    const safePayments = moneyAmount(paymentsThisMonth);
    const totalDue = safeArrears + safeRent;
    const rawBalance = totalDue - safePayments;
    return {
        advance: Math.max(-rawBalance, 0),
        arrears: safeArrears,
        currentMonthRent: safeRent,
        outstanding: Math.max(rawBalance, 0),
        paymentsThisMonth: safePayments,
        rawBalance,
        totalDue,
    };
}

export function monthStart(value?: string | null) {
    if (value && /^\d{4}-\d{2}/.test(value)) return `${value.slice(0, 7)}-01`;
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

export function collectionDateOnly(row: MonthlyLedgerCollection) {
    const source = String(row.payment_date ?? row.paid_at ?? "");
    return source.slice(0, 10);
}

export function calculateTenantMonthlyLedgerPosition({
    advanceAllocations = [],
    collections = [],
    legacyArrears = [],
    monthlyRent,
    rentMonths = [],
    selectedMonth,
}: {
    advanceAllocations?: Array<Record<string, unknown>>;
    collections?: MonthlyLedgerCollection[];
    legacyArrears?: Array<Record<string, unknown>>;
    monthlyRent: number;
    rentMonths?: Array<Record<string, unknown>>;
    selectedMonth?: string | null;
}): TenantMonthlyLedgerPosition {
    const selected = monthStart(selectedMonth);
    const selectedKey = selected.slice(0, 7);
    const effectivePayments = collections.filter(isFinanciallyEffectiveCollection);
    const paymentsThisMonth = effectivePayments
        .filter((collection) => collectionDateOnly(collection).slice(0, 7) === selectedKey)
        .reduce((total, collection) => total + collectionAmount(collection), 0);
    const sortedPayments = [...effectivePayments].sort((left, right) => {
        const rightDate = String(right.payment_date ?? right.paid_at ?? right.created_at ?? "");
        const leftDate = String(left.payment_date ?? left.paid_at ?? left.created_at ?? "");
        return rightDate.localeCompare(leftDate);
    });
    const lastPayment = sortedPayments[0] ?? null;

    let currentMonthRent = moneyAmount(monthlyRent);
    let arrears = 0;
    for (const row of rentMonths) {
        const rentMonth = String(row.rent_month ?? row.due_date ?? row.coverage_start ?? "").slice(0, 10);
        if (!rentMonth) continue;
        const outstanding = moneyAmount(row.outstanding_amount);
        if (rentMonth.slice(0, 7) < selectedKey) {
            arrears += outstanding;
        } else if (rentMonth.slice(0, 7) === selectedKey) {
            currentMonthRent = moneyAmount(row.rent_amount) || currentMonthRent;
        }
    }

    for (const row of legacyArrears) {
        const month = String(row.allocation_month ?? "").slice(0, 10);
        if (!month || month.slice(0, 7) < selectedKey) {
            arrears += moneyAmount(row.remaining_amount);
        }
    }

    const position = calculateTenantMonthlyPosition({
        arrears,
        currentMonthRent,
        paymentsThisMonth,
    });

    return {
        advance: position.advance,
        arrears: position.arrears,
        currentMonthRent: position.currentMonthRent,
        lastPaymentAmount: lastPayment ? collectionAmount(lastPayment) : 0,
        lastPaymentDate: lastPayment ? collectionDateOnly(lastPayment) || null : null,
        lastPaymentId: lastPayment?.id ? String(lastPayment.id) : null,
        outstanding: position.outstanding,
        paymentsThisMonth: position.paymentsThisMonth,
        rawBalance: position.rawBalance,
        selectedMonth: selected,
        totalDue: position.totalDue,
    };
}

export type LandlordMonthlyLedgerPosition = {
    arrears: number;
    credit: number;
    deductionsThisMonth: number;
    lastPaymentAmount: number;
    lastPaymentDate: string | null;
    lastPaymentId: string | null;
    netPayable: number;
    outstanding: number;
    paymentsThisMonth: number;
    rawBalance: number;
    settlementMonth: string;
};

export function calculateLandlordMonthlyPosition({
    arrears,
    deductions,
    netPayable,
    payments,
}: {
    arrears: number;
    deductions: number;
    netPayable: number;
    payments: number;
}) {
    const safeArrears = moneyAmount(arrears);
    const safeNetPayable = moneyAmount(netPayable);
    const safeDeductions = moneyAmount(deductions);
    const safePayments = moneyAmount(payments);
    const rawBalance = safeArrears + safeNetPayable - safeDeductions - safePayments;
    return {
        arrears: safeArrears,
        credit: Math.max(-rawBalance, 0),
        deductionsThisMonth: safeDeductions,
        netPayable: safeNetPayable,
        outstanding: Math.max(rawBalance, 0),
        paymentsThisMonth: safePayments,
        rawBalance,
    };
}

export function calculateLandlordMonthlyLedgerPosition({
    arrears,
    deductionsThisMonth,
    netPayable,
    payments = [],
    settlementMonth,
}: {
    arrears: number;
    deductionsThisMonth: number;
    netPayable: number;
    payments?: MonthlyLedgerCollection[];
    settlementMonth?: string | null;
}): LandlordMonthlyLedgerPosition {
    const selected = monthStart(settlementMonth);
    const selectedKey = selected.slice(0, 7);
    const effectivePayments = payments.filter(isFinanciallyEffectiveCollection);
    const paymentsThisMonth = effectivePayments
        .filter((payment) => collectionDateOnly(payment).slice(0, 7) === selectedKey)
        .reduce((total, payment) => total + collectionAmount(payment), 0);
    const sortedPayments = [...effectivePayments].sort((left, right) => {
        const rightDate = String(right.payment_date ?? right.paid_at ?? right.created_at ?? "");
        const leftDate = String(left.payment_date ?? left.paid_at ?? left.created_at ?? "");
        return rightDate.localeCompare(leftDate);
    });
    const lastPayment = sortedPayments[0] ?? null;
    const position = calculateLandlordMonthlyPosition({
        arrears,
        deductions: deductionsThisMonth,
        netPayable,
        payments: paymentsThisMonth,
    });

    return {
        arrears: position.arrears,
        credit: position.credit,
        deductionsThisMonth: position.deductionsThisMonth,
        lastPaymentAmount: lastPayment ? collectionAmount(lastPayment) : 0,
        lastPaymentDate: lastPayment ? collectionDateOnly(lastPayment) || null : null,
        lastPaymentId: lastPayment?.id ? String(lastPayment.id) : null,
        netPayable: position.netPayable,
        outstanding: position.outstanding,
        paymentsThisMonth: position.paymentsThisMonth,
        rawBalance: position.rawBalance,
        settlementMonth: selected,
    };
}
