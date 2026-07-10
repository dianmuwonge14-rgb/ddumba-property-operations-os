export type VacancyCutoffRoom = {
    monthly_rent?: number | string | null;
    status?: string | null;
};

export type VacancyCutoffDecision = {
    companyExtraProfitAmount: number;
    cutoffDecision: "vacant_before_or_on_cutoff" | "vacant_after_cutoff" | "vacant" | "occupied";
    effectiveMonth: string | null;
    includedPayableAmount: number;
    payableThisMonth: boolean;
    reason: string;
    vacantRoomDeduction: number;
};

function amount(value: unknown) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

export function normalizeSettlementMonth(value: string | null | undefined) {
    if (!value) return null;
    const match = String(value).match(/^(\d{4})-(\d{2})/);
    return match ? `${match[1]}-${match[2]}-01` : null;
}

function monthAfter(value: string) {
    const date = new Date(`${value}T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + 1);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function vacancyEffectiveMonth(vacateDate: string | null | undefined) {
    const month = normalizeSettlementMonth(vacateDate);
    if (!month) return null;
    const dayMatch = String(vacateDate).match(/^\d{4}-\d{2}-(\d{2})/);
    const day = dayMatch ? Number(dayMatch[1]) : 1;
    return day <= 15 ? month : monthAfter(month);
}

export function isVacantStatus(value: unknown) {
    const status = String(value ?? "").toLowerCase();
    return status.includes("vacant") || status.includes("empty") || status === "available";
}

export function getVacancyCutoffDecision({
    room,
    settlementMonth,
    vacateDate,
}: {
    room: VacancyCutoffRoom;
    settlementMonth: string;
    vacateDate?: string | null;
}): VacancyCutoffDecision {
    const rent = amount(room.monthly_rent);
    const targetMonth = normalizeSettlementMonth(settlementMonth);
    const effectiveMonth = vacancyEffectiveMonth(vacateDate);

    if (!isVacantStatus(room.status)) {
        return {
            companyExtraProfitAmount: 0,
            cutoffDecision: "occupied",
            effectiveMonth: null,
            includedPayableAmount: rent,
            payableThisMonth: true,
            reason: "Included: occupied room.",
            vacantRoomDeduction: 0,
        };
    }

    if (!targetMonth) {
        return {
            companyExtraProfitAmount: 0,
            cutoffDecision: "vacant",
            effectiveMonth,
            includedPayableAmount: 0,
            payableThisMonth: false,
            reason: "No - Invalid settlement month.",
            vacantRoomDeduction: rent,
        };
    }

    if (!effectiveMonth) {
        return {
            companyExtraProfitAmount: 0,
            cutoffDecision: "vacant",
            effectiveMonth,
            includedPayableAmount: 0,
            payableThisMonth: false,
            reason: "No - Vacant room.",
            vacantRoomDeduction: rent,
        };
    }

    if (effectiveMonth > targetMonth) {
        return {
            companyExtraProfitAmount: 0,
            cutoffDecision: "vacant_after_cutoff",
            effectiveMonth,
            includedPayableAmount: rent,
            payableThisMonth: true,
            reason: "Included: vacated after cutoff; vacancy affects next settlement month.",
            vacantRoomDeduction: 0,
        };
    }

    return {
        companyExtraProfitAmount: 0,
        cutoffDecision: "vacant_before_or_on_cutoff",
        effectiveMonth,
        includedPayableAmount: 0,
        payableThisMonth: false,
        reason: "No - Vacant room deduction active for this settlement month.",
        vacantRoomDeduction: rent,
    };
}
