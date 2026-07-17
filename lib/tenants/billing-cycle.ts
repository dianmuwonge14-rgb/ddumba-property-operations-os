const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function assertDateOnly(value: string, label = "Date") {
    if (!DATE_RE.test(value) || Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())) {
        throw new Error(`${label} must be a valid date.`);
    }
}

export function clampBillingDay(value: number | string | null | undefined) {
    const day = Number(value);
    if (!Number.isFinite(day)) return 1;
    return Math.max(1, Math.min(31, Math.trunc(day)));
}

export function daysInMonth(year: number, monthIndexZeroBased: number) {
    return new Date(Date.UTC(year, monthIndexZeroBased + 1, 0)).getUTCDate();
}

export function dateForBillingDay(year: number, monthIndexZeroBased: number, billingDay: number) {
    const day = Math.min(clampBillingDay(billingDay), daysInMonth(year, monthIndexZeroBased));
    return new Date(Date.UTC(year, monthIndexZeroBased, day)).toISOString().slice(0, 10);
}

export function monthKey(value: string) {
    assertDateOnly(value);
    return value.slice(0, 7);
}

export function addMonthsToBillingDate(dateOnly: string, months: number, originalBillingDay?: number | null) {
    assertDateOnly(dateOnly);
    const [year, month, day] = dateOnly.split("-").map(Number);
    const targetMonthIndex = month - 1 + months;
    const targetYear = year + Math.floor(targetMonthIndex / 12);
    const normalizedMonthIndex = ((targetMonthIndex % 12) + 12) % 12;
    return dateForBillingDay(targetYear, normalizedMonthIndex, originalBillingDay ?? day);
}

export function previousDay(dateOnly: string) {
    assertDateOnly(dateOnly);
    const [year, month, day] = dateOnly.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}

export function billingPeriodForDate(input: {
    billingDay?: number | null;
    businessDate: string;
    leaseStartDate?: string | null;
}) {
    assertDateOnly(input.businessDate, "Business date");
    const billingDay = clampBillingDay(input.billingDay);
    const [year, month] = input.businessDate.split("-").map(Number);
    let periodStart = dateForBillingDay(year, month - 1, billingDay);
    if (periodStart > input.businessDate) {
        periodStart = addMonthsToBillingDate(periodStart, -1, billingDay);
    }
    if (input.leaseStartDate && DATE_RE.test(input.leaseStartDate) && periodStart < input.leaseStartDate) {
        periodStart = input.leaseStartDate;
    }
    const nextStart = addMonthsToBillingDate(periodStart, 1, billingDay);
    return {
        billingDay,
        coverageEnd: previousDay(nextStart),
        coverageStart: periodStart,
        dueDate: periodStart,
        nextChargeDate: nextStart,
    };
}

export function nextBillingDate(input: {
    billingDay?: number | null;
    businessDate: string;
    leaseStartDate?: string | null;
}) {
    const period = billingPeriodForDate(input);
    return period.coverageStart > input.businessDate ? period.coverageStart : period.nextChargeDate;
}

export function billingDayLabel(day: number | null | undefined) {
    const value = clampBillingDay(day);
    if ([11, 12, 13].includes(value % 100)) return `${value}th`;
    if (value % 10 === 1) return `${value}st`;
    if (value % 10 === 2) return `${value}nd`;
    if (value % 10 === 3) return `${value}rd`;
    return `${value}th`;
}
