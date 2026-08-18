import { moneyAmount } from "@/lib/tenants/balance-reconciliation";

export type PaymentRemovalPayment = Record<string, unknown>;
export type PaymentRemovalAllocation = Record<string, unknown>;

export function paymentRemovalReversalAmount(payment: PaymentRemovalPayment, allocations: PaymentRemovalAllocation[] = []) {
    const amount = moneyAmount(payment.amount_paid ?? payment.amount);
    const balanceBefore = moneyAmount(payment.balance_before_payment ?? payment.expected_amount);
    const balanceAfter = moneyAmount(payment.balance_after_payment ?? payment.balance);
    const usedToClear = moneyAmount(payment.used_to_clear_outstanding);
    const explicitOutstandingReduction = Math.max(0, balanceBefore - balanceAfter);
    const consumedAdvance = allocations
        .filter((allocation) => String(allocation.allocation_type ?? "") === "advance_month")
        .reduce((total, allocation) => total + moneyAmount(allocation.consumed_by_balance_reconciliation), 0);

    if (usedToClear > 0 || explicitOutstandingReduction > 0 || consumedAdvance > 0) {
        return Math.min(amount, Math.max(usedToClear, explicitOutstandingReduction) + consumedAdvance);
    }

    if (balanceBefore > 0) return Math.min(balanceBefore, amount);
    return 0;
}
