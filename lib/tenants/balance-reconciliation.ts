export type TenantBalanceState = {
    advanceBalance: number;
    outstandingBalance: number;
};

export type TenantBalanceReconciliation = TenantBalanceState & {
    advanceConsumed: number;
    netBalance: number;
    requestedOutstanding: number;
};

export function moneyAmount(value: unknown) {
    const amount = Number(value ?? 0);
    return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

export function availableAdvanceAllocation(row: Record<string, unknown>) {
    return Math.max(
        0,
        moneyAmount(row.amount_allocated) - moneyAmount(row.consumed_by_balance_reconciliation),
    );
}

export function reconcileTenantBalance(input: TenantBalanceState): TenantBalanceReconciliation {
    const requestedOutstanding = moneyAmount(input.outstandingBalance);
    const currentAdvance = moneyAmount(input.advanceBalance);
    const advanceConsumed = requestedOutstanding > 0 ? currentAdvance : 0;
    const outstandingBalance = requestedOutstanding > 0 ? requestedOutstanding + currentAdvance : 0;
    const advanceBalance = requestedOutstanding > 0 ? 0 : currentAdvance;

    return {
        advanceBalance,
        advanceConsumed,
        netBalance: outstandingBalance - advanceBalance,
        outstandingBalance,
        requestedOutstanding,
    };
}

export function displayTenantNetBalance(input: TenantBalanceState): TenantBalanceState {
    const outstanding = moneyAmount(input.outstandingBalance);
    const advance = moneyAmount(input.advanceBalance);
    if (outstanding > 0 && advance > 0) {
        return { advanceBalance: 0, outstandingBalance: outstanding + advance };
    }
    return {
        advanceBalance: advance,
        outstandingBalance: outstanding,
    };
}
