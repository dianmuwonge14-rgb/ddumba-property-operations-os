import { scheduledAdvanceDeductionForMonth } from "@/lib/landlord-advances/calculator";
import { landlordMonthlyDue, landlordMonthlyPaid, type LandlordPayableLike } from "@/lib/landlord-payables/payment-allocation";

type DbLike = { from: (table: string) => any };

type LiveNetResult = {
    advanceDeduction: number;
    commissionAmount: number;
    commissionMode: "portfolio_based" | "occupied_room_based";
    commissionRate: number;
    fullRentRoll: number;
    netPayable: number;
    recoveryDeduction: number;
    vacantRoomDeductions: number;
};

function num(value: unknown) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function isArchivedRoom(row: Record<string, unknown>) {
    const status = String(row.status ?? "").toLowerCase();
    return ["archived", "inactive", "deleted", "removed"].some((value) => status.includes(value));
}

function isVacantRoom(row: Record<string, unknown>) {
    const status = String(row.status ?? "").toLowerCase();
    return status.includes("vacant") || status.includes("empty");
}

function parseDefaultCommissionRate(value: unknown) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        if (Number.isFinite(Number(record.rate))) return Number(record.rate);
        if (Number.isFinite(Number(record.commission_rate))) return Number(record.commission_rate);
        if (Number.isFinite(Number(record.default_landlord_commission_rate))) return Number(record.default_landlord_commission_rate);
    }
    return 10;
}

function parseCommissionMode(landlord: Record<string, unknown>) {
    const direct = landlord.commission_calculation_mode;
    if (direct === "occupied_room_based") return "occupied_room_based" as const;
    if (direct === "portfolio_based") return "portfolio_based" as const;
    try {
        const parsed = JSON.parse(String(landlord.commission_notes ?? "{}")) as Record<string, unknown>;
        return parsed.commission_calculation_mode === "occupied_room_based" ? "occupied_room_based" as const : "portfolio_based" as const;
    } catch {
        return "portfolio_based" as const;
    }
}

function landlordNetOverride(landlord: Record<string, unknown>) {
    if (landlord.commission_input_mode !== "landlord_net_amount") return null;
    const override = num(landlord.landlord_net_payable_override);
    return override > 0 ? override : null;
}

export async function getLiveLandlordMonthlyNetPayable({
    companyId,
    db,
    landlordId,
    officeId,
    settlementMonth,
}: {
    companyId: string;
    db: DbLike;
    landlordId: string;
    officeId: string;
    settlementMonth: string;
}): Promise<LiveNetResult | null> {
    const [roomsResult, landlordResult, settingResult, advancesResult, debtsResult] = await Promise.all([
        db.from("rooms").select("*").eq("company_id", companyId).eq("office_id", officeId).eq("landlord_id", landlordId),
        db.from("landlords").select("*").eq("company_id", companyId).eq("id", landlordId).maybeSingle(),
        db.from("company_settings").select("*").eq("company_id", companyId).eq("key", "default_landlord_commission_rate").limit(1),
        db.from("landlord_advances").select("*").eq("company_id", companyId).eq("office_id", officeId).eq("landlord_id", landlordId),
        db.from("landlord_debt_deductions").select("*").eq("company_id", companyId).eq("office_id", officeId).eq("landlord_id", landlordId),
    ]);
    if (roomsResult.error || landlordResult.error || settingResult.error || advancesResult.error || debtsResult.error) return null;
    if (!landlordResult.data) return null;

    const rooms = ((roomsResult.data ?? []) as Record<string, unknown>[]).filter((room) => !isArchivedRoom(room));
    if (!rooms.length) return null;
    const landlord = landlordResult.data as Record<string, unknown>;
    const fullRentRoll = rooms.reduce((total, room) => total + num(room.monthly_rent), 0);
    const occupiedPayableRent = rooms.filter((room) => !isVacantRoom(room)).reduce((total, room) => total + num(room.monthly_rent), 0);
    const vacantRoomDeductions = rooms.filter(isVacantRoom).reduce((total, room) => total + num(room.monthly_rent), 0);
    const commissionMode = parseCommissionMode(landlord);
    const defaultCommissionRate = parseDefaultCommissionRate((settingResult.data ?? [])[0]?.value);
    const commissionRate = Number.isFinite(Number(landlord.commission_rate)) ? Number(landlord.commission_rate) : defaultCommissionRate;
    const commissionBase = commissionMode === "occupied_room_based" ? occupiedPayableRent : fullRentRoll;
    const commissionAmount = Math.round(commissionBase * (commissionRate / 100));
    const calculatedNet = commissionMode === "occupied_room_based"
        ? Math.max(0, occupiedPayableRent - commissionAmount)
        : Math.max(0, fullRentRoll - commissionAmount - vacantRoomDeductions);
    const portfolioNet = landlordNetOverride(landlord) ?? calculatedNet;
    const recoveryRequested = ((debtsResult.data ?? []) as Record<string, unknown>[])
        .filter((deduction) => ["pending", "partially_applied"].includes(String(deduction.status ?? "pending")))
        .reduce((total, deduction) => total + Math.max(0, num(deduction.amount) - num(deduction.applied_amount)), 0);
    const recoveryDeduction = Math.min(recoveryRequested, portfolioNet);
    const advanceRequested = ((advancesResult.data ?? []) as Record<string, unknown>[])
        .filter((advance) => String(advance.status ?? "pending") !== "fully_deducted")
        .reduce((total, advance) => total + scheduledAdvanceDeductionForMonth(advance, settlementMonth), 0);
    const advanceDeduction = Math.min(advanceRequested, Math.max(0, portfolioNet - recoveryDeduction));

    return {
        advanceDeduction,
        commissionAmount,
        commissionMode,
        commissionRate,
        fullRentRoll,
        netPayable: Math.max(0, portfolioNet - recoveryDeduction - advanceDeduction),
        recoveryDeduction,
        vacantRoomDeductions,
    };
}

export async function reconcileLandlordPayableWithLiveNet({
    companyId,
    db,
    row,
    settlementMonth,
}: {
    companyId: string;
    db: DbLike;
    row: LandlordPayableLike | null;
    settlementMonth: string;
}) {
    if (!row?.id || !row.office_id || !row.landlord_id) return row;
    const live = await getLiveLandlordMonthlyNetPayable({
        companyId,
        db,
        landlordId: String(row.landlord_id),
        officeId: String(row.office_id),
        settlementMonth,
    });
    if (!live) return row;
    const currentDue = landlordMonthlyDue(row);
    if (Math.round(currentDue) === Math.round(live.netPayable)) return row;

    const paid = landlordMonthlyPaid(row);
    const unpaidBalance = Math.max(0, live.netPayable - Math.min(paid, live.netPayable));
    const overpaidAmount = Math.max(0, paid - live.netPayable);
    const status = overpaidAmount > 0 ? "overpaid" : unpaidBalance > 0 ? (paid > 0 ? "partial" : "unpaid") : "paid";
    const update = {
        accounting_notes: `Live payable reconciled before landlord payment allocation. Previous monthly payable UGX ${Math.round(currentDue).toLocaleString()}.`,
        advance_created: overpaidAmount,
        advance_deductions: live.advanceDeduction,
        closing_arrears: unpaidBalance,
        commission_amount: live.commissionAmount,
        commission_mode: live.commissionMode,
        commission_percentage: live.commissionRate,
        full_rent_roll: live.fullRentRoll,
        monthly_net_payable: live.netPayable,
        net_payable: live.netPayable,
        overpaid_amount: overpaidAmount,
        status,
        total_due: live.netPayable,
        unpaid_balance: unpaidBalance,
        updated_at: new Date().toISOString(),
        vacant_room_deductions: live.vacantRoomDeductions,
        vacated_tenant_debt_deductions: live.recoveryDeduction,
    };
    const { data, error } = await db
        .from("landlord_monthly_payables")
        .update(update)
        .eq("id", String(row.id))
        .select("*")
        .maybeSingle();
    if (error) throw new Error(error.message);
    return (data ?? { ...row, ...update }) as LandlordPayableLike;
}
