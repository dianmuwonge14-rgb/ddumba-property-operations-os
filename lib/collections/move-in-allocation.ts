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

export type TenantCoverageAllocation = {
    allocationMonth: string;
    allocationType: "arrears" | "current_month" | "advance_month";
    amount: number;
    coverageStart: string;
    coverageEnd: string;
    coverageIndex: number;
};

function assertDateOnly(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())) {
        throw new Error("Move-in date must be a valid date.");
    }
}

function clampDay(year: number, monthIndex: number, day: number) {
    return Math.min(day, new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate());
}

export function addCalendarMonths(dateOnly: string, months: number) {
    const [year, month, day] = dateOnly.split("-").map(Number);
    const targetMonthIndex = month - 1 + months;
    const targetYear = year + Math.floor(targetMonthIndex / 12);
    const normalizedMonthIndex = ((targetMonthIndex % 12) + 12) % 12;
    const nextDay = clampDay(targetYear, normalizedMonthIndex, day);
    return new Date(Date.UTC(targetYear, normalizedMonthIndex, nextDay)).toISOString().slice(0, 10);
}

export function previousDay(dateOnly: string) {
    const [year, month, day] = dateOnly.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}

export function monthStart(value: string) {
    return `${value.slice(0, 7)}-01`;
}

function daysBetween(left: string, right: string) {
    assertDateOnly(left);
    assertDateOnly(right);
    const leftTime = new Date(`${left}T00:00:00Z`).getTime();
    const rightTime = new Date(`${right}T00:00:00Z`).getTime();
    return Math.round((rightTime - leftTime) / 86_400_000);
}

export function billingAnchorDay(moveInDate: string) {
    assertDateOnly(moveInDate);
    return Number(moveInDate.slice(8, 10));
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

export function coverageIndexForDate(moveInDate: string, businessDate: string) {
    assertDateOnly(moveInDate);
    assertDateOnly(businessDate);
    if (businessDate < moveInDate) return 0;
    let index = Math.max(0, (Number(businessDate.slice(0, 4)) - Number(moveInDate.slice(0, 4))) * 12 + (Number(businessDate.slice(5, 7)) - Number(moveInDate.slice(5, 7))));
    while (addCalendarMonths(moveInDate, index + 1) <= businessDate) index += 1;
    while (index > 0 && addCalendarMonths(moveInDate, index) > businessDate) index -= 1;
    return index;
}

export function currentCoveragePeriod(moveInDate: string, businessDate: string) {
    return {
        ...coveragePeriodForMoveIn(moveInDate, coverageIndexForDate(moveInDate, businessDate)),
        coverageIndex: coverageIndexForDate(moveInDate, businessDate),
    };
}

export function nextRentChargeDate(moveInDate: string, businessDate: string) {
    const index = coverageIndexForDate(moveInDate, businessDate);
    const currentStart = addCalendarMonths(moveInDate, index);
    return currentStart > businessDate ? currentStart : addCalendarMonths(moveInDate, index + 1);
}

export function buildTenantPaymentCoverageAllocations(input: {
    amount: number;
    balanceBefore: number;
    monthlyRent: number;
    paymentDate: string;
    moveInDate?: string | null;
}): TenantCoverageAllocation[] {
    assertDateOnly(input.paymentDate);
    const monthlyRent = Math.max(0, Number(input.monthlyRent));
    const amount = Math.max(0, Number(input.amount));
    const moveInDate = input.moveInDate && /^\d{4}-\d{2}-\d{2}$/.test(input.moveInDate) ? input.moveInDate : input.paymentDate;
    assertDateOnly(moveInDate);
    if (!Number.isFinite(monthlyRent) || monthlyRent <= 0 || !Number.isFinite(amount) || amount <= 0) return [];

    const allocations: TenantCoverageAllocation[] = [];
    let remaining = amount;
    const currentIndex = coverageIndexForDate(moveInDate, input.paymentDate);
    const totalDueBeforePayment = Math.max(0, Number(input.balanceBefore));
    const currentOutstandingDue = Math.min(monthlyRent || totalDueBeforePayment, totalDueBeforePayment);
    const arrearsDue = Math.max(0, totalDueBeforePayment - currentOutstandingDue);

    if (arrearsDue > 0 && remaining > 0) {
        const arrearsPeriodCount = Math.max(1, Math.ceil(arrearsDue / monthlyRent));
        let arrearsRemaining = arrearsDue;
        const firstArrearsIndex = Math.max(0, currentIndex - arrearsPeriodCount);
        for (let index = firstArrearsIndex; index < currentIndex && remaining > 0; index += 1) {
            const monthDue = Math.min(monthlyRent, arrearsRemaining);
            const arrearsPaid = Math.min(remaining, monthDue);
            if (arrearsPaid > 0) {
                const period = coveragePeriodForMoveIn(moveInDate, index);
                allocations.push({
                    allocationMonth: monthStart(period.coverageStart),
                    allocationType: "arrears",
                    amount: arrearsPaid,
                    coverageEnd: period.coverageEnd,
                    coverageIndex: index,
                    coverageStart: period.coverageStart,
                });
                remaining -= arrearsPaid;
            }
            arrearsRemaining -= monthDue;
        }
    }

    const currentPaid = Math.min(remaining, currentOutstandingDue);
    if (currentPaid > 0) {
        const period = coveragePeriodForMoveIn(moveInDate, currentIndex);
        allocations.push({
            allocationMonth: monthStart(period.coverageStart),
            allocationType: "current_month",
            amount: currentPaid,
            coverageEnd: period.coverageEnd,
            coverageIndex: currentIndex,
            coverageStart: period.coverageStart,
        });
        remaining -= currentPaid;
    }

    let advanceIndex = currentIndex + 1;
    while (remaining > 0.004 && advanceIndex < currentIndex + 121) {
        const allocationAmount = Math.min(remaining, monthlyRent);
        const period = coveragePeriodForMoveIn(moveInDate, advanceIndex);
        allocations.push({
            allocationMonth: monthStart(period.coverageStart),
            allocationType: "advance_month",
            amount: allocationAmount,
            coverageEnd: period.coverageEnd,
            coverageIndex: advanceIndex,
            coverageStart: period.coverageStart,
        });
        remaining -= allocationAmount;
        advanceIndex += 1;
    }

    return allocations;
}

export function buildDueCoveragePeriods(input: {
    moveInDate: string;
    throughDate: string;
    existingCoverageStarts?: string[];
}) {
    assertDateOnly(input.moveInDate);
    assertDateOnly(input.throughDate);
    if (input.throughDate < input.moveInDate) return [];
    const existing = new Set((input.existingCoverageStarts ?? []).filter(Boolean));
    const periods: Array<{ coverageStart: string; coverageEnd: string; coverageIndex: number; allocationMonth: string; dueDate: string }> = [];
    const maxIndex = coverageIndexForDate(input.moveInDate, input.throughDate);
    for (let index = 0; index <= maxIndex; index += 1) {
        const period = coveragePeriodForMoveIn(input.moveInDate, index);
        if (period.coverageStart > input.throughDate || existing.has(period.coverageStart)) continue;
        periods.push({
            allocationMonth: monthStart(period.coverageStart),
            coverageEnd: period.coverageEnd,
            coverageIndex: index,
            coverageStart: period.coverageStart,
            dueDate: period.coverageStart,
        });
    }
    return periods;
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
