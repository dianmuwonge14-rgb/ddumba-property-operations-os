export type MoveInPayableDecision = {
    startDate: string | null;
    payableThisMonth: boolean;
    reason: string;
    cutoffDecision: "standard" | "before_or_on_cutoff" | "after_cutoff" | "landlord_already_paid" | "vacant" | "archived" | "future" | "invalid";
    landlordAlreadyPaid: boolean;
    includedPayableAmount: number;
    companyExtraProfitAmount: number;
};

type RoomLike = {
    effective_start_date?: string | null;
    explicitly_payable?: boolean | null;
    monthly_rent?: number | string | null;
    status?: string | null;
};

export type LandlordPaymentState = {
    amountPaid?: number | string | null;
    lastPaidAt?: string | null;
    status?: string | null;
};

function amount(value: unknown) {
    return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function dateOnly(value: string | null | undefined) {
    if (!value) return null;
    const match = /^\d{4}-\d{2}-\d{2}/.exec(value);
    return match?.[0] ?? null;
}

function monthStart(value: string) {
    return `${value.slice(0, 7)}-01`;
}

function paidBeforeMoveIn(payment: LandlordPaymentState | null | undefined, moveInDate: string) {
    const paidAmount = amount(payment?.amountPaid);
    const paidStatus = String(payment?.status ?? "").toLowerCase();
    const hasPayment = paidAmount > 0 || ["paid", "overpaid"].includes(paidStatus);
    if (!hasPayment) return false;

    const lastPaidAt = dateOnly(payment?.lastPaidAt ?? null);
    if (!lastPaidAt) return true;
    return lastPaidAt <= moveInDate;
}

export function getMoveInPayableDecision({
    landlordPayment,
    leaseStartDate,
    room,
    settlementMonth,
    tenantActive,
}: {
    landlordPayment?: LandlordPaymentState | null;
    leaseStartDate?: string | null;
    room: RoomLike;
    settlementMonth: string;
    tenantActive: boolean;
}): MoveInPayableDecision {
    const status = String(room.status ?? "active").toLowerCase();
    const startDate = dateOnly(leaseStartDate ?? room.effective_start_date ?? null);
    const explicitlyPayable = Boolean(room.explicitly_payable);
    const monthlyRent = amount(room.monthly_rent);
    const statusIndicatesOccupied = status === "occupied" || status === "active";
    const isOccupied = Boolean(tenantActive || statusIndicatesOccupied || explicitlyPayable);

    if (status === "archived") {
        return { startDate, payableThisMonth: false, reason: "No - Archived.", cutoffDecision: "archived", landlordAlreadyPaid: false, includedPayableAmount: 0, companyExtraProfitAmount: 0 };
    }

    if (status === "vacant" || status === "empty") {
        return { startDate, payableThisMonth: false, reason: "No - Vacant room.", cutoffDecision: "vacant", landlordAlreadyPaid: false, includedPayableAmount: 0, companyExtraProfitAmount: 0 };
    }

    if (!startDate) {
        const payableThisMonth = isOccupied;
        return {
            startDate,
            payableThisMonth,
            reason: payableThisMonth ? "Included: active occupied room" : "No - Not occupied.",
            cutoffDecision: "standard",
            landlordAlreadyPaid: false,
            includedPayableAmount: payableThisMonth ? monthlyRent : 0,
            companyExtraProfitAmount: 0,
        };
    }

    const start = new Date(`${startDate}T00:00:00`);
    if (Number.isNaN(start.getTime())) {
        return { startDate, payableThisMonth: false, reason: "No - Invalid start date.", cutoffDecision: "invalid", landlordAlreadyPaid: false, includedPayableAmount: 0, companyExtraProfitAmount: 0 };
    }

    const settlement = monthStart(settlementMonth);
    const moveInMonth = monthStart(startDate);
    if (moveInMonth > settlement) {
        return { startDate, payableThisMonth: false, reason: "No - Move-in is after this settlement month.", cutoffDecision: "future", landlordAlreadyPaid: false, includedPayableAmount: 0, companyExtraProfitAmount: 0 };
    }

    if (moveInMonth < settlement) {
        const payableThisMonth = isOccupied;
        return {
            startDate,
            payableThisMonth,
            reason: explicitlyPayable ? "Included: Admin marked payable." : payableThisMonth ? "Included: occupied before settlement month." : "No - Not occupied.",
            cutoffDecision: "standard",
            landlordAlreadyPaid: false,
            includedPayableAmount: payableThisMonth ? monthlyRent : 0,
            companyExtraProfitAmount: 0,
        };
    }

    const landlordAlreadyPaid = paidBeforeMoveIn(landlordPayment, startDate);
    if (landlordAlreadyPaid) {
        return {
            startDate,
            payableThisMonth: false,
            reason: "Company extra profit: landlord already paid",
            cutoffDecision: "landlord_already_paid",
            landlordAlreadyPaid: true,
            includedPayableAmount: 0,
            companyExtraProfitAmount: monthlyRent,
        };
    }

    const moveInDay = start.getDate();
    if (moveInDay <= 15 || explicitlyPayable) {
        return {
            startDate,
            payableThisMonth: isOccupied,
            reason: explicitlyPayable ? "Included: Admin marked payable." : "Included: tenant entered before cutoff",
            cutoffDecision: "before_or_on_cutoff",
            landlordAlreadyPaid: false,
            includedPayableAmount: isOccupied ? monthlyRent : 0,
            companyExtraProfitAmount: 0,
        };
    }

    return {
        startDate,
        payableThisMonth: false,
        reason: "Excluded: tenant entered after cutoff",
        cutoffDecision: "after_cutoff",
        landlordAlreadyPaid: false,
        includedPayableAmount: 0,
        companyExtraProfitAmount: 0,
    };
}
