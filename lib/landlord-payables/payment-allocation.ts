export type LandlordPayableLike = Record<string, unknown>;

export type LandlordPaymentAllocationLine = {
    applied: number;
    advanceRecoveryApplied: number;
    month: string;
    payableId: string;
    totalApplied: number;
    unpaidBeforePayment: number;
};

export type LandlordPaymentAllocationPlan = {
    advanceAmount: number;
    advanceRecoveryAmount: number;
    appliedAmount: number;
    cashPayableToLandlord: number;
    currentMonthPayableId: string | null;
    currentMonthUnpaid: number;
    lines: LandlordPaymentAllocationLine[];
    normalPaymentAmount: number;
    oldestUnpaidPayableId: string | null;
    payableAfterAdvanceRecovery: number;
    remainingAfterPayment: number;
    totalUnpaidPayable: number;
};

export type LandlordSettlementTiming = "current_month" | "previous_month";

export type LandlordPayableSummary = {
    activeAdvanceBalance: number;
    alreadyPaidAmount: number;
    currentMonthExcludedFromOutstanding: boolean;
    currentMonthAppliedDeductions: number;
    currentMonthFinalNetPayable: number;
    currentMonthGrossPayable: number;
    currentMonthNetPayable: number;
    currentMonthPendingSettlement: number;
    currentMonthPendingDeductions: number;
    currentMonthPayableId: string | null;
    currentMonthUnpaid: number;
    maxNormalPayment: number;
    oldestUnpaidPayableId: string | null;
    payablePeriod: string | null;
    settlementTiming: LandlordSettlementTiming;
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

function nearlyEqual(left: number, right: number) {
    return Math.abs(left - right) < 1;
}

export function landlordMonthlyDeductionComponents(row: LandlordPayableLike) {
    return {
        advanceRecoveryComponent: Math.max(0, payableAmount(row.advance_deductions)),
        otherDeductionComponent: Math.max(0, payableAmount(row.other_deductions)),
        recoveryTotalOrComponent: Math.max(0, payableAmount(row.vacated_tenant_debt_deductions)),
        vacantRoomComponent: Math.max(0, payableAmount(row.vacant_room_deductions)),
    };
}

export function landlordMonthlyRawComponentDeductions(row: LandlordPayableLike) {
    const components = landlordMonthlyDeductionComponents(row);
    return Math.max(0,
        components.vacantRoomComponent
        + components.recoveryTotalOrComponent
        + components.advanceRecoveryComponent
        + components.otherDeductionComponent);
}

export function landlordMonthlyGrossPayable(row: LandlordPayableLike) {
    const fullRentLessCommission = payableAmount(row.full_rent_roll) - payableAmount(row.commission_amount);
    const monthlyNet = payableAmount(row.monthly_net_payable);
    const net = payableAmount(row.net_payable);
    return Math.max(0, fullRentLessCommission, monthlyNet, net);
}

export function landlordMonthlyDeductions(row: LandlordPayableLike) {
    const gross = landlordMonthlyGrossPayable(row);
    const storedNet = payableAmount(row.net_payable);
    const storedApplied = storedNet > 0 ? Math.max(0, gross - storedNet) : 0;
    const components = landlordMonthlyDeductionComponents(row);
    const rawComponentTotal = landlordMonthlyRawComponentDeductions(row);

    if (storedNet > 0 && storedApplied <= 0) return 0;

    if (storedApplied > 0 && nearlyEqual(storedApplied, rawComponentTotal)) {
        const hasAggregateRecovery = components.recoveryTotalOrComponent > 0
            && components.vacantRoomComponent > 0
            && components.recoveryTotalOrComponent >= components.vacantRoomComponent;
        if (hasAggregateRecovery) {
            return Math.max(
                0,
                components.recoveryTotalOrComponent
                + components.advanceRecoveryComponent
                + components.otherDeductionComponent,
            );
        }
        return storedApplied;
    }

    if (storedApplied > 0) return storedApplied;

    if (components.recoveryTotalOrComponent > 0 && components.vacantRoomComponent > 0 && components.recoveryTotalOrComponent >= components.vacantRoomComponent) {
        return Math.max(0, components.recoveryTotalOrComponent + components.advanceRecoveryComponent + components.otherDeductionComponent);
    }

    return rawComponentTotal;
}

export function landlordMonthlyFinalNetPayable(row: LandlordPayableLike) {
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

export function normalizeSettlementTiming(value: unknown): LandlordSettlementTiming {
    return String(value ?? "").toLowerCase() === "current_month" ? "current_month" : "previous_month";
}

export function previousMonthStart(month: string) {
    const base = new Date(`${month.slice(0, 7) || kampalaBusinessDate().slice(0, 7)}-01T00:00:00`);
    base.setMonth(base.getMonth() - 1);
    return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-01`;
}

export function eligibleLandlordPayableMonth(currentMonth: string | null | undefined, settlementTiming: unknown) {
    const month = String(currentMonth || kampalaBusinessDate()).slice(0, 7);
    if (normalizeSettlementTiming(settlementTiming) === "current_month") return `${month}-01`;
    return previousMonthStart(`${month}-01`);
}

export function summarizeLandlordPayables({
    activeAdvanceBalance = 0,
    currentMonth,
    payables,
    settlementTiming = "current_month",
}: {
    activeAdvanceBalance?: number;
    currentMonth?: string | null;
    payables: LandlordPayableLike[];
    settlementTiming?: LandlordSettlementTiming | string | null;
}): LandlordPayableSummary {
    const timing = normalizeSettlementTiming(settlementTiming);
    const payablePeriod = currentMonth ? eligibleLandlordPayableMonth(currentMonth, timing) : null;
    const activeRows = payables
        .filter(isActiveLandlordPayable)
        .filter((row) => !payablePeriod || payableMonthKey(row) <= payablePeriod);
    const visibleRows = payables
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
        ? visibleRows.filter((row) => payableMonthKey(row) === currentMonth)
        : [];
    const payablePeriodRows = payablePeriod
        ? activeRows.filter((row) => payableMonthKey(row) === payablePeriod)
        : [];
    const currentUnpaidRow = currentRows.find((row) => landlordMonthlyUnpaid(row) > 0);

    const totalOutstandingPayable = unpaidRows.reduce((total, row) => total + row.unpaid, 0);
    const currentMonthUnpaid = currentRows.reduce((total, row) => total + landlordMonthlyUnpaid(row), 0);
    const currentMonthExcludedFromOutstanding = Boolean(currentMonth && timing === "previous_month" && payablePeriod !== currentMonth);

    return {
        activeAdvanceBalance: Math.max(0, activeAdvanceBalance),
        alreadyPaidAmount: payablePeriodRows.reduce((total, row) => total + landlordMonthlyPaid(row), 0),
        currentMonthExcludedFromOutstanding,
        currentMonthAppliedDeductions: payablePeriodRows.reduce((total, row) => total + (landlordMonthlyAppliedDeductions(row) - landlordMonthlyPendingDeductions(row)), 0),
        currentMonthFinalNetPayable: payablePeriodRows.reduce((total, row) => total + landlordMonthlyDue(row), 0),
        currentMonthGrossPayable: payablePeriodRows.reduce((total, row) => total + landlordMonthlyGrossPayable(row), 0),
        currentMonthNetPayable: payablePeriodRows.reduce((total, row) => total + landlordMonthlyDue(row), 0),
        currentMonthPendingSettlement: currentMonthExcludedFromOutstanding ? currentMonthUnpaid : 0,
        currentMonthPendingDeductions: payablePeriodRows.reduce((total, row) => total + landlordMonthlyPendingDeductions(row), 0),
        currentMonthPayableId: currentUnpaidRow?.id ? String(currentUnpaidRow.id) : null,
        currentMonthUnpaid: payablePeriodRows.reduce((total, row) => total + landlordMonthlyUnpaid(row), 0),
        maxNormalPayment: totalOutstandingPayable,
        oldestUnpaidPayableId: unpaidRows[0]?.payableId ?? null,
        payablePeriod,
        settlementTiming: timing,
        totalOutstandingPayable,
        unpaidRows,
    };
}

export function buildLandlordPaymentAllocationPlan({
    advanceRecoveryAmount = 0,
    amount,
    currentMonth,
    payables,
    settlementTiming = "current_month",
}: {
    advanceRecoveryAmount?: number;
    amount: number;
    currentMonth?: string;
    payables: LandlordPayableLike[];
    settlementTiming?: LandlordSettlementTiming | string | null;
}): LandlordPaymentAllocationPlan {
    const payablePeriod = currentMonth ? eligibleLandlordPayableMonth(currentMonth, settlementTiming) : null;
    const sortedUnpaidRows = payables
        .filter(isActiveLandlordPayable)
        .filter((row) => !payablePeriod || payableMonthKey(row) <= payablePeriod)
        .map((row) => ({ row, unpaid: landlordMonthlyUnpaid(row), month: payableMonthKey(row) }))
        .filter(({ unpaid }) => unpaid > 0)
        .sort((a, b) => a.month.localeCompare(b.month));

    const totalUnpaidPayable = sortedUnpaidRows.reduce((total, item) => total + item.unpaid, 0);
    const selectedAdvanceRecovery = Math.min(
        Math.max(0, advanceRecoveryAmount),
        totalUnpaidPayable,
    );
    let remainingAdvanceRecovery = selectedAdvanceRecovery;
    const payableAfterAdvanceRecovery = Math.max(0, totalUnpaidPayable - selectedAdvanceRecovery);
    let remainingPayment = Math.max(0, amount);
    const lines: LandlordPaymentAllocationLine[] = [];

    for (const item of sortedUnpaidRows) {
        if (remainingPayment <= 0 && remainingAdvanceRecovery <= 0) break;
        const advanceRecoveryApplied = Math.min(remainingAdvanceRecovery, item.unpaid);
        remainingAdvanceRecovery -= advanceRecoveryApplied;
        const unpaidAfterRecovery = Math.max(0, item.unpaid - advanceRecoveryApplied);
        const applied = Math.min(remainingPayment, unpaidAfterRecovery);
        remainingPayment -= applied;
        if (applied <= 0 && advanceRecoveryApplied <= 0) continue;
        lines.push({
            applied,
            advanceRecoveryApplied,
            month: item.month,
            payableId: String(item.row.id ?? ""),
            totalApplied: applied + advanceRecoveryApplied,
            unpaidBeforePayment: item.unpaid,
        });
    }

    const normalPaymentAmount = Math.min(Math.max(0, amount), payableAfterAdvanceRecovery);
    const advanceAmount = Math.max(0, Math.max(0, amount) - payableAfterAdvanceRecovery);
    const remainingAfterPayment = Math.max(0, payableAfterAdvanceRecovery - normalPaymentAmount);
    const currentMonthRow = sortedUnpaidRows.find((item) => item.month === payablePeriod);

    return {
        advanceAmount,
        advanceRecoveryAmount: selectedAdvanceRecovery,
        appliedAmount: normalPaymentAmount,
        cashPayableToLandlord: normalPaymentAmount,
        currentMonthPayableId: currentMonthRow?.row.id ? String(currentMonthRow.row.id) : null,
        currentMonthUnpaid: currentMonthRow?.unpaid ?? 0,
        lines,
        normalPaymentAmount,
        oldestUnpaidPayableId: lines[0]?.payableId ?? null,
        payableAfterAdvanceRecovery,
        remainingAfterPayment,
        totalUnpaidPayable,
    };
}
