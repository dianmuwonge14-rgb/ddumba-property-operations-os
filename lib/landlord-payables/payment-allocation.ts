export type LandlordPayableLike = Record<string, unknown>;

export type LandlordPaymentAllocationLine = {
    applied: number;
    month: string;
    payableId: string;
    unpaidBeforePayment: number;
};

export type LandlordPaymentAllocationPlan = {
    advanceAmount: number;
    appliedAmount: number;
    currentMonthPayableId: string | null;
    currentMonthUnpaid: number;
    lines: LandlordPaymentAllocationLine[];
    normalPaymentAmount: number;
    oldestUnpaidPayableId: string | null;
    totalUnpaidPayable: number;
};

export function payableAmount(value: unknown) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

export function isActiveLandlordPayable(row: LandlordPayableLike) {
    const status = String(row.status ?? "").toLowerCase();
    return !["archived", "reversed", "void", "voided", "cancelled", "canceled", "deleted", "removed"].includes(status);
}

export function landlordMonthlyDue(row: LandlordPayableLike) {
    const directMonthlyDue = Math.max(0, payableAmount(row.monthly_net_payable ?? row.net_payable));
    if (directMonthlyDue > 0) return directMonthlyDue;
    return Math.max(0, payableAmount(row.total_due) - payableAmount(row.opening_arrears));
}

export function landlordMonthlyPaid(row: LandlordPayableLike) {
    return Math.max(0, payableAmount(row.amount_paid));
}

export function landlordMonthlyUnpaid(row: LandlordPayableLike) {
    const monthlyDue = landlordMonthlyDue(row);
    const paid = landlordMonthlyPaid(row);
    if (monthlyDue > 0 || paid > 0) {
        return Math.max(0, monthlyDue - Math.min(paid, monthlyDue));
    }
    return Math.max(0, payableAmount(row.unpaid_balance));
}

export function payableMonthKey(row: LandlordPayableLike) {
    return String(row.settlement_month ?? row.month_key ?? row.payment_month ?? "");
}

export function buildLandlordPaymentAllocationPlan({
    amount,
    currentMonth,
    payables,
}: {
    amount: number;
    currentMonth?: string;
    payables: LandlordPayableLike[];
}): LandlordPaymentAllocationPlan {
    const sortedUnpaidRows = payables
        .filter(isActiveLandlordPayable)
        .filter((row) => !currentMonth || payableMonthKey(row) <= currentMonth)
        .map((row) => ({ row, unpaid: landlordMonthlyUnpaid(row), month: payableMonthKey(row) }))
        .filter(({ unpaid }) => unpaid > 0)
        .sort((a, b) => a.month.localeCompare(b.month));

    const totalUnpaidPayable = sortedUnpaidRows.reduce((total, item) => total + item.unpaid, 0);
    let remainingPayment = Math.max(0, amount);
    const lines: LandlordPaymentAllocationLine[] = [];

    for (const item of sortedUnpaidRows) {
        if (remainingPayment <= 0) break;
        const applied = Math.min(remainingPayment, item.unpaid);
        remainingPayment -= applied;
        lines.push({
            applied,
            month: item.month,
            payableId: String(item.row.id ?? ""),
            unpaidBeforePayment: item.unpaid,
        });
    }

    const normalPaymentAmount = Math.min(Math.max(0, amount), totalUnpaidPayable);
    const advanceAmount = Math.max(0, Math.max(0, amount) - totalUnpaidPayable);
    const currentMonthRow = sortedUnpaidRows.find((item) => item.month === currentMonth);

    return {
        advanceAmount,
        appliedAmount: normalPaymentAmount,
        currentMonthPayableId: currentMonthRow?.row.id ? String(currentMonthRow.row.id) : null,
        currentMonthUnpaid: currentMonthRow?.unpaid ?? 0,
        lines,
        normalPaymentAmount,
        oldestUnpaidPayableId: lines[0]?.payableId ?? null,
        totalUnpaidPayable,
    };
}
