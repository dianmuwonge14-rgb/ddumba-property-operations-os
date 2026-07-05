export type AdvanceInterestType = "none" | "fixed" | "percentage";
export type AdvancePaymentPlan = "one_time" | "monthly" | "custom";
export type AdvanceRepaymentType = "simple_advance" | "principal_fixed_interest" | "declining_balance_interest" | "interest_only" | "custom";
export type AdvanceInterestMode = "none" | "fixed_principal" | "declining_balance" | "interest_only";
export type PrincipalClearanceMethod = "deducted_monthly" | "paid_separately" | "cleared_manually";

export type AdvanceScheduleRow = {
    month: string;
    openingBalance: number;
    openingPrincipalBalance: number;
    interestCharged: number;
    scheduledDeduction: number;
    interestPortion: number;
    principalPortion: number;
    closingPrincipalBalance: number;
    closingBalance: number;
    remainingTotalBalance: number;
    status: "pending" | "deducted" | "partial" | "cleared";
};

export type AdvancePlanInput = {
    principalAmount: number;
    repaymentType?: AdvanceRepaymentType | string | null;
    interestMode?: AdvanceInterestMode | string | null;
    interestType?: AdvanceInterestType | string | null;
    interestValue?: number | null;
    interestRate?: number | null;
    fixedInterestAmount?: number | null;
    paymentPlan?: AdvancePaymentPlan | string | null;
    monthlyDeductionAmount?: number | null;
    deductionStartDate?: string | null;
    deductionEndDate?: string | null;
    principalClearanceMethod?: PrincipalClearanceMethod | string | null;
};

export type AdvancePlan = {
    principalAmount: number;
    repaymentType: AdvanceRepaymentType;
    interestMode: AdvanceInterestMode;
    interestType: AdvanceInterestType;
    interestRate: number;
    fixedInterestAmount: number;
    interestAmount: number;
    totalRepayable: number;
    paymentPlan: AdvancePaymentPlan;
    principalClearanceMethod: PrincipalClearanceMethod;
    monthlyDeductionAmount: number;
    deductionStartDate: string;
    expectedEndDate: string;
    numberOfMonths: number;
    remainingPrincipalBalance: number;
    remainingInterestBalance: number;
    remainingTotalBalance: number;
    schedule: AdvanceScheduleRow[];
};

function money(value: number) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.round(value));
}

function parseInterestType(value: AdvancePlanInput["interestType"]): AdvanceInterestType {
    return value === "fixed" || value === "percentage" ? value : "none";
}

function parsePaymentPlan(value: AdvancePlanInput["paymentPlan"]): AdvancePaymentPlan {
    return value === "monthly" || value === "custom" ? value : "one_time";
}

function parseRepaymentType(value: AdvancePlanInput["repaymentType"], interestMode: AdvanceInterestMode): AdvanceRepaymentType {
    if (value === "principal_fixed_interest" || value === "declining_balance_interest" || value === "interest_only" || value === "custom") return value;
    if (interestMode === "fixed_principal") return "principal_fixed_interest";
    if (interestMode === "declining_balance") return "declining_balance_interest";
    if (interestMode === "interest_only") return "interest_only";
    return "simple_advance";
}

function parseInterestMode(input: AdvancePlanInput): AdvanceInterestMode {
    const value = input.interestMode;
    if (value === "fixed_principal" || value === "declining_balance" || value === "interest_only") return value;
    if (input.repaymentType === "declining_balance_interest") return "declining_balance";
    if (input.repaymentType === "interest_only") return "interest_only";
    if (input.interestType === "fixed" || input.interestType === "percentage") return "fixed_principal";
    return "none";
}

function parsePrincipalClearanceMethod(value: AdvancePlanInput["principalClearanceMethod"], interestMode: AdvanceInterestMode): PrincipalClearanceMethod {
    if (value === "paid_separately" || value === "cleared_manually") return value;
    return interestMode === "interest_only" ? "cleared_manually" : "deducted_monthly";
}

function normalizeDate(value: string | null | undefined) {
    if (value && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
    return date.toISOString().slice(0, 10);
}

function addMonths(dateValue: string, months: number) {
    const [year, month, day] = dateValue.slice(0, 10).split("-").map((part) => Number(part));
    const date = new Date(Date.UTC(year, month - 1 + months, day || 1));
    return date.toISOString().slice(0, 10);
}

function monthDiffInclusive(startDate: string, endDate: string | null | undefined) {
    if (!endDate) return 0;
    const [startYear, startMonth] = startDate.slice(0, 7).split("-").map(Number);
    const [endYear, endMonth] = endDate.slice(0, 7).split("-").map(Number);
    if (!startYear || !endYear || !startMonth || !endMonth) return 0;
    return Math.max(1, ((endYear - startYear) * 12) + (endMonth - startMonth) + 1);
}

export function calculateLandlordAdvancePlan(input: AdvancePlanInput): AdvancePlan {
    const principalAmount = money(Number(input.principalAmount ?? 0));
    const interestMode = parseInterestMode(input);
    const repaymentType = parseRepaymentType(input.repaymentType, interestMode);
    const interestType = interestMode === "fixed_principal" ? parseInterestType(input.interestType ?? "percentage") : interestMode === "none" ? "none" : "percentage";
    const paymentPlan = parsePaymentPlan(input.paymentPlan);
    const rawInterestValue = Number(input.interestValue ?? input.interestRate ?? 0);
    const fixedInterestAmount = money(Number(input.fixedInterestAmount ?? (interestType === "fixed" ? input.interestValue ?? 0 : 0)));
    const interestRate = interestMode === "none" || interestType === "fixed" ? 0 : Math.max(0, rawInterestValue);
    const deductionStartDate = normalizeDate(input.deductionStartDate);
    const deductionEndDate = input.deductionEndDate ? normalizeDate(input.deductionEndDate) : null;
    const requestedMonths = monthDiffInclusive(deductionStartDate, deductionEndDate);
    const requestedMonthlyDeduction = money(Number(input.monthlyDeductionAmount ?? 0));
    const principalClearanceMethod = parsePrincipalClearanceMethod(input.principalClearanceMethod, interestMode);
    const schedule: AdvanceScheduleRow[] = [];
    const monthlyInterestRate = interestRate / 100;
    const fixedInterest = interestMode === "fixed_principal"
        ? interestType === "fixed"
            ? fixedInterestAmount
            : money(principalAmount * monthlyInterestRate)
        : 0;
    let principalBalance = principalAmount;
    let totalInterest = fixedInterest;
    let remainingFixedInterest = fixedInterest;
    const projectedTotalRepayable = principalAmount + fixedInterest;
    let monthlyDeductionAmount = requestedMonthlyDeduction;
    const estimateBase = projectedTotalRepayable || principalAmount;
    if (monthlyDeductionAmount <= 0 && requestedMonths > 0) monthlyDeductionAmount = Math.ceil(estimateBase / requestedMonths);
    if (monthlyDeductionAmount <= 0) monthlyDeductionAmount = paymentPlan === "one_time" ? estimateBase : estimateBase;
    if (interestMode === "interest_only") {
        monthlyDeductionAmount = requestedMonthlyDeduction > 0 ? requestedMonthlyDeduction : money(principalAmount * monthlyInterestRate);
    }
    const safeMonthlyDeduction = Math.max(1, monthlyDeductionAmount);

    for (let index = 0; index < 180; index += 1) {
        if (principalBalance <= 0 && remainingFixedInterest <= 0) break;
        if (requestedMonths > 0 && index >= requestedMonths && requestedMonthlyDeduction <= 0) break;
        const openingPrincipalBalance = principalBalance;
        const interestCharged = interestMode === "declining_balance" || interestMode === "interest_only"
            ? money(openingPrincipalBalance * monthlyInterestRate)
            : index === 0
                ? fixedInterest
                : 0;
        totalInterest += interestMode === "declining_balance" || interestMode === "interest_only" ? interestCharged : 0;
        const openingBalance = interestMode === "fixed_principal"
            ? openingPrincipalBalance + remainingFixedInterest
            : openingPrincipalBalance + interestCharged;
        let scheduledDeduction = paymentPlan === "one_time" && index === 0
            ? openingBalance
            : interestMode === "interest_only"
                ? Math.min(safeMonthlyDeduction, interestCharged)
                : Math.min(safeMonthlyDeduction, openingBalance);
        if (interestMode === "interest_only") scheduledDeduction = Math.max(0, scheduledDeduction);
        const interestPortion = interestMode === "fixed_principal"
            ? Math.min(remainingFixedInterest, scheduledDeduction)
            : Math.min(interestCharged, scheduledDeduction);
        const principalPortion = interestMode === "interest_only"
            ? 0
            : Math.min(openingPrincipalBalance, Math.max(0, scheduledDeduction - interestPortion));
        if (interestMode === "fixed_principal") remainingFixedInterest = Math.max(0, remainingFixedInterest - interestPortion);
        principalBalance = Math.max(0, principalBalance - principalPortion);
        const remainingTotalBalance = principalBalance + remainingFixedInterest;
        schedule.push({
            month: addMonths(deductionStartDate, index),
            openingBalance,
            openingPrincipalBalance,
            interestCharged,
            scheduledDeduction,
            interestPortion,
            principalPortion,
            closingPrincipalBalance: principalBalance,
            closingBalance: remainingTotalBalance,
            remainingTotalBalance,
            status: "pending",
        });
        if (interestMode === "interest_only" && requestedMonths > 0 && index + 1 >= requestedMonths) break;
        if (interestMode === "interest_only" && requestedMonthlyDeduction > 0 && index >= 119) break;
    }
    if (interestMode === "none" && schedule.length === 0 && principalAmount > 0) {
        schedule.push({
            month: deductionStartDate,
            openingBalance: principalAmount,
            openingPrincipalBalance: principalAmount,
            interestCharged: 0,
            scheduledDeduction: principalAmount,
            interestPortion: 0,
            principalPortion: principalAmount,
            closingPrincipalBalance: 0,
            closingBalance: 0,
            remainingTotalBalance: 0,
            status: "pending",
        });
    }
    const interestAmount = totalInterest;
    const totalRepayable = principalAmount + interestAmount;
    const numberOfMonths = schedule.length;
    const expectedEndDate = schedule.at(-1)?.month ?? deductionStartDate;
    const remainingPrincipalBalance = schedule.at(-1)?.closingPrincipalBalance ?? principalAmount;
    const remainingInterestBalance = Math.max(0, totalRepayable - principalAmount - schedule.reduce((total, row) => total + row.interestPortion, 0));
    const remainingTotalBalance = interestMode === "interest_only" ? principalAmount + remainingInterestBalance : schedule.at(-1)?.remainingTotalBalance ?? totalRepayable;

    return {
        principalAmount,
        repaymentType,
        interestMode,
        interestType,
        interestRate,
        fixedInterestAmount,
        interestAmount,
        totalRepayable,
        paymentPlan,
        principalClearanceMethod,
        monthlyDeductionAmount: safeMonthlyDeduction,
        deductionStartDate,
        expectedEndDate,
        numberOfMonths,
        remainingPrincipalBalance,
        remainingInterestBalance,
        remainingTotalBalance,
        schedule,
    };
}

export function scheduledAdvanceDeductionForMonth(advance: Record<string, unknown>, settlementMonth: string) {
    const lifecycleStatus = String(advance.lifecycle_status ?? "active");
    if (lifecycleStatus === "paused" || lifecycleStatus === "cleared" || lifecycleStatus === "cancelled") return 0;
    const status = String(advance.status ?? "pending").toLowerCase();
    if (status === "fully_deducted" || status === "rejected" || status === "cancelled") return 0;
    const approved = ["approved", "active", "partially_deducted"].includes(status)
        || Boolean(advance.approved_by || advance.approved_at || advance.approved_date);
    if (!approved) return 0;
    const remainingTotal = Math.max(0, Number(advance.remaining_total_balance ?? 0));
    const remainingBalance = Math.max(0, Number(advance.remaining_balance ?? 0));
    const remainingPrincipalInterest = Math.max(0, Number(advance.remaining_principal_balance ?? 0)) + Math.max(0, Number(advance.remaining_interest_balance ?? 0));
    const totalRepayable = Math.max(0, Number(advance.total_repayable ?? advance.advance_amount ?? 0));
    const remaining = remainingTotal || remainingBalance || remainingPrincipalInterest || Math.max(0, totalRepayable - Math.max(0, Number(advance.deducted_amount ?? 0)));
    if (remaining <= 0) return 0;
    const startDate = String(advance.deduction_start_date ?? advance.date_given ?? settlementMonth);
    const startMonth = startDate.slice(0, 7);
    const targetMonth = settlementMonth.slice(0, 7);
    if (startMonth > targetMonth) return 0;
    const plan = parsePaymentPlan(String(advance.payment_plan ?? "one_time"));
    const monthlyDeduction = Math.max(0, Number(advance.monthly_deduction_amount ?? 0));
    const scheduled = plan === "one_time" ? remaining : monthlyDeduction > 0 ? monthlyDeduction : remaining;
    return Math.min(remaining, scheduled);
}

export function splitAdvanceDeductionPortions(advance: Record<string, unknown>, amount: number) {
    const mode = String(advance.interest_calculation_mode ?? advance.interest_mode ?? "");
    if (mode === "interest_only") return { interestPortion: Math.max(0, amount), principalPortion: 0 };
    const totalInterest = Math.max(0, Number(advance.interest_amount ?? 0));
    const totalPrincipal = Math.max(0, Number(advance.principal_amount ?? Number(advance.advance_amount ?? 0) - totalInterest));
    const totalRepaid = Math.max(0, Number(advance.deducted_amount ?? 0));
    const interestAlreadyPaid = Math.min(totalInterest, totalRepaid);
    const remainingInterest = Math.max(0, totalInterest - interestAlreadyPaid);
    const interestPortion = Math.min(Math.max(0, amount), remainingInterest);
    const principalPortion = Math.min(totalPrincipal, Math.max(0, amount - interestPortion));
    return { interestPortion, principalPortion };
}
