export type MoveInCoverageAllocation = {
    allocationMonth: string;
    allocationType: "current_month" | "advance_month";
    amountAllocated: number;
    coverageStart: string;
    coverageEnd: string;
    coverageIndex: number;
    remainingCredit: number;
    isFullCoverage: boolean;
};

function assertDateOnly(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())) {
        throw new Error("Move-in date must be a valid date.");
    }
}

function clampDay(year: number, monthIndex: number, day: number) {
    return Math.min(day, new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate());
}

function addCalendarMonths(dateOnly: string, months: number) {
    const [year, month, day] = dateOnly.split("-").map(Number);
    const targetMonthIndex = month - 1 + months;
    const targetYear = year + Math.floor(targetMonthIndex / 12);
    const normalizedMonthIndex = ((targetMonthIndex % 12) + 12) % 12;
    const nextDay = clampDay(targetYear, normalizedMonthIndex, day);
    return new Date(Date.UTC(targetYear, normalizedMonthIndex, nextDay)).toISOString().slice(0, 10);
}

function previousDay(dateOnly: string) {
    const [year, month, day] = dateOnly.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}

function monthStart(value: string) {
    return `${value.slice(0, 7)}-01`;
}

export function coveragePeriodForMoveIn(moveInDate: string, coverageIndex: number) {
    assertDateOnly(moveInDate);
    const coverageStart = addCalendarMonths(moveInDate, coverageIndex);
    const nextCoverageStart = addCalendarMonths(moveInDate, coverageIndex + 1);
    return {
        coverageEnd: previousDay(nextCoverageStart),
        coverageStart,
    };
}

export function buildMoveInPaymentAllocations(input: {
    moveInDate: string;
    monthlyRent: number;
    paymentAmount: number;
}): MoveInCoverageAllocation[] {
    assertDateOnly(input.moveInDate);
    const monthlyRent = Math.max(0, Number(input.monthlyRent));
    const paymentAmount = Math.max(0, Number(input.paymentAmount));
    if (!Number.isFinite(monthlyRent) || monthlyRent <= 0) {
        throw new Error("Monthly rent must be greater than zero.");
    }
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) return [];

    const allocations: MoveInCoverageAllocation[] = [];
    let remaining = paymentAmount;
    let coverageIndex = 0;

    while (remaining > 0.004 && coverageIndex < 120) {
        const amountAllocated = Math.min(remaining, monthlyRent);
        const period = coveragePeriodForMoveIn(input.moveInDate, coverageIndex);
        const isFullCoverage = amountAllocated + 0.004 >= monthlyRent;
        remaining = Math.max(0, remaining - amountAllocated);
        allocations.push({
            allocationMonth: monthStart(period.coverageStart),
            allocationType: coverageIndex === 0 ? "current_month" : "advance_month",
            amountAllocated,
            coverageEnd: period.coverageEnd,
            coverageIndex,
            coverageStart: period.coverageStart,
            isFullCoverage,
            remainingCredit: isFullCoverage ? 0 : amountAllocated,
        });
        coverageIndex += 1;
    }

    return allocations;
}

export function summarizeMoveInPaymentCoverage(input: {
    moveInDate: string;
    monthlyRent: number;
    paymentAmount: number;
}) {
    const allocations = buildMoveInPaymentAllocations(input);
    const firstPeriodPaid = allocations
        .filter((allocation) => allocation.coverageIndex === 0)
        .reduce((total, allocation) => total + allocation.amountAllocated, 0);
    const advanceAmount = allocations
        .filter((allocation) => allocation.allocationType === "advance_month")
        .reduce((total, allocation) => total + allocation.amountAllocated, 0);
    return {
        advanceAmount,
        allocations,
        firstCoverageOutstanding: input.paymentAmount > 0
            ? Math.max(0, Math.max(0, Number(input.monthlyRent)) - firstPeriodPaid)
            : 0,
        firstPeriodPaid,
    };
}
