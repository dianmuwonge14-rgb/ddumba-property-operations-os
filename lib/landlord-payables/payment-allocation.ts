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

export type LandlordPayableSummary = {
    activeAdvanceBalance: number;
    alreadyPaidAmount: number;
    currentMonthAppliedDeductions: number;
    currentMonthFinalNetPayable: number;
    currentMonthGrossPayable: number;
    currentMonthNetPayable: number;
    currentMonthPendingDeductions: number;
    currentMonthPayableId: string | null;
    currentMonthUnpaid: number;
    maxNormalPayment: number;
    oldestUnpaidPayableId: string | null;
    totalOutstandingPayable: number;
    unpaidRows: Array<{
        month: string;
        payableId: string;
        paid: number;
        due: number;
        unpaid: number;
    }>;
};

export function payableAmount(value: unknown) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function kampalaBusinessDate() {
    return new Intl.DateTimeFormat("en-CA", {
        day: "2-digit",
        month: "2-digit",
        timeZone: "Africa/Kampala",
        year: "numeric",
    }).format(new Date());
}

function isCurrentKampalaMonth(month: string) {
    return month.slice(0, 7) === kampalaBusinessDate().slice(0, 7);
}

function isBeforeKampalaDeductionDay() {
    return Number(kampalaBusinessDate().slice(8, 10)) < 15;
}

export function isActiveLandlordPayable(row: LandlordPayableLike) {
    const status = String(row.status ?? "").toLowerCase();
    return !["archived", "reversed", "void", "voided", "cancelled", "canceled", "deleted", "removed"].includes(status);
}

export function landlordMonthlyDeductions(row: LandlordPayableLike) {
    return Math.max(0,
        payableAmount(row.vacant_room_deductions)
        + payableAmount(row.vacated_tenant_debt_deductions)
        + payableAmount(row.advance_deductions)
        + payableAmount(row.other_deductions));
}

export function landlordMonthlyGrossPayable(row: LandlordPayableLike) {
    const fullRentLessCommission = payableAmount(row.full_rent_roll) - payableAmount(row.commission_amount);
    const monthlyNet = payableAmount(row.monthly_net_payable);
    const net = payableAmount(row.net_payable);
    return Math.max(0, fullRentLessCommission, monthlyNet, net);
}

export function landlordMonthlyFinalNetPayable(row: LandlordPayableLike) {
    const net = payableAmount(row.net_payable);
    if (net > 0) return net;
    const monthlyNet = payableAmount(row.monthly_net_payable);
    if (monthlyNet > 0) return monthlyNet;
    return Math.max(0, landlordMonthlyGrossPayable(row) - landlordMonthlyDeductions(row));
}

export function landlordMonthlyAppliedDeductions(row: LandlordPayableLike) {
    const gross = landlordMonthlyGrossPayable(row);
    const finalNet = landlordMonthlyFinalNetPayable(row);
    if (gross > finalNet) return gross - finalNet;
    return landlordMonthlyDeductions(row);
}

export function landlordMonthlyPendingDeductions(row: LandlordPayableLike) {
    const month = payableMonthKey(row);
    if (!isCurrentKampalaMonth(month) || !isBeforeKampalaDeductionDay()) return 0;
    return landlordMonthlyAppliedDeductions(row);
}

export function landlordMonthlyDue(row: LandlordPayableLike) {
    const month = payableMonthKey(row);
    const directMonthlyDue = isCurrentKampalaMonth(month) && isBeforeKampalaDeductionDay()
        ? landlordMonthlyGrossPayable(row)
        : landlordMonthlyFinalNetPayable(row);
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

export function summarizeLandlordPayables({
    activeAdvanceBalance = 0,
    currentMonth,
    payables,
}: {
    activeAdvanceBalance?: number;
    currentMonth?: string | null;
    payables: LandlordPayableLike[];
}): LandlordPayableSummary {
    const activeRows = payables
        .filter(isActiveLandlordPayable)
        .filter((row) => !currentMonth || payableMonthKey(row) <= currentMonth);
    const unpaidRows = activeRows
        .map((row) => {
            const due = landlordMonthlyDue(row);
            const paid = landlordMonthlyPaid(row);
            const unpaid = landlordMonthlyUnpaid(row);
            return {
                due,
                month: payableMonthKey(row),
                paid,
                payableId: String(row.id ?? ""),
                unpaid,
            };
        })
        .filter((row) => row.unpaid > 0)
        .sort((a, b) => a.month.localeCompare(b.month));
    const currentRows = currentMonth
        ? activeRows.filter((row) => payableMonthKey(row) === currentMonth)
        : [];
    const currentUnpaidRow = currentRows.find((row) => landlordMonthlyUnpaid(row) > 0);

    const totalOutstandingPayable = unpaidRows.reduce((total, row) => total + row.unpaid, 0);

    return {
        activeAdvanceBalance: Math.max(0, activeAdvanceBalance),
        alreadyPaidAmount: currentRows.reduce((total, row) => total + landlordMonthlyPaid(row), 0),
        currentMonthAppliedDeductions: currentRows.reduce((total, row) => total + (landlordMonthlyAppliedDeductions(row) - landlordMonthlyPendingDeductions(row)), 0),
        currentMonthFinalNetPayable: currentRows.reduce((total, row) => total + landlordMonthlyDue(row), 0),
        currentMonthGrossPayable: currentRows.reduce((total, row) => total + landlordMonthlyGrossPayable(row), 0),
        currentMonthNetPayable: currentRows.reduce((total, row) => total + landlordMonthlyDue(row), 0),
        currentMonthPendingDeductions: currentRows.reduce((total, row) => total + landlordMonthlyPendingDeductions(row), 0),
        currentMonthPayableId: currentUnpaidRow?.id ? String(currentUnpaidRow.id) : null,
        currentMonthUnpaid: currentRows.reduce((total, row) => total + landlordMonthlyUnpaid(row), 0),
        maxNormalPayment: totalOutstandingPayable,
        oldestUnpaidPayableId: unpaidRows[0]?.payableId ?? null,
        totalOutstandingPayable,
        unpaidRows,
    };
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
