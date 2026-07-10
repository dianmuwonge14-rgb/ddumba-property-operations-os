export type RecoveryDeductionLike = Record<string, unknown>;

export function recoveryDeductionAmount(value: unknown) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

export function normalizeRecoveryMonth(value: unknown) {
    if (!value) return null;
    const text = String(value).trim();
    if (!text) return null;
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) {
        const match = text.match(/^(\d{4})-(\d{2})/);
        return match ? `${match[1]}-${match[2]}-01` : null;
    }
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function recoveryDeductionEffectiveMonth(deduction: RecoveryDeductionLike) {
    return normalizeRecoveryMonth(
        deduction.applied_month
        ?? deduction.advance_payment_month
        ?? deduction.vacate_date
        ?? deduction.created_at,
    );
}

export function recoveryDeductionRemaining(deduction: RecoveryDeductionLike) {
    return Math.max(0, recoveryDeductionAmount(deduction.amount) - recoveryDeductionAmount(deduction.applied_amount));
}

export function isRecoveryDeductionActiveForMonth(deduction: RecoveryDeductionLike, settlementMonth: string) {
    const status = String(deduction.status ?? "pending").toLowerCase();
    if (!["pending", "partially_applied"].includes(status)) return false;
    if (recoveryDeductionRemaining(deduction) <= 0) return false;
    const effectiveMonth = recoveryDeductionEffectiveMonth(deduction);
    const targetMonth = normalizeRecoveryMonth(settlementMonth);
    return Boolean(effectiveMonth && targetMonth && effectiveMonth === targetMonth);
}

export function sumRecoveryDeductionsForMonth(deductions: RecoveryDeductionLike[], settlementMonth: string) {
    return deductions
        .filter((deduction) => isRecoveryDeductionActiveForMonth(deduction, settlementMonth))
        .reduce((total, deduction) => total + recoveryDeductionRemaining(deduction), 0);
}
