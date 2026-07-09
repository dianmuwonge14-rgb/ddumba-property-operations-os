"use server";

import { revalidatePath } from "next/cache";
import { logUserAction } from "@/lib/auth/audit";
import { hasAnyPermission, requireAuth, requireCompanyAdminMode } from "@/lib/auth/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMoveInPayableDecision } from "@/lib/landlords/payable-cutoff";

type Db = {
    from: (table: string) => any;
};

type RentRequestRow = Record<string, unknown>;

function assertPositiveRent(value: number) {
    if (!Number.isFinite(value) || value <= 0) throw new Error("Proposed rent must be greater than zero.");
}

function assertReason(value: string) {
    if (!value.trim()) throw new Error("Reason for rent change is required.");
}

function assertDate(value: string) {
    if (!value || Number.isNaN(Date.parse(value))) throw new Error("Effective date is required.");
}

function money(value: number) {
    return `UGX ${Math.round(value).toLocaleString()}`;
}

function revalidateRentPages() {
    revalidatePath("/office/admin");
    revalidatePath("/office/admin/rent-change-requests");
    revalidatePath("/office/notifications");
    revalidatePath("/office/properties");
    revalidatePath("/office/landlords");
    revalidatePath("/office/landlord-payments");
    revalidatePath("/office/collections");
    revalidatePath("/office/payments");
    revalidatePath("/office/admin/payments");
    revalidatePath("/office/dashboard");
    revalidatePath("/office/ceo");
    revalidatePath("/office/reports");
    revalidatePath("/office/spreadsheet");
}

function currentSettlementMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function amount(value: unknown) {
    return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function landlordAdvanceTotal(row: Record<string, unknown>) {
    const explicitTotal = amount(row.total_repayable);
    if (explicitTotal > 0) return explicitTotal;
    const advanceAmount = amount(row.advance_amount);
    if (advanceAmount > 0) return advanceAmount;
    return amount(row.principal_amount) + amount(row.interest_amount);
}

function landlordAdvanceRemaining(row: Record<string, unknown>) {
    const remainingTotal = amount(row.remaining_total_balance);
    if (remainingTotal > 0) return remainingTotal;
    const remainingBalance = amount(row.remaining_balance);
    if (remainingBalance > 0) return remainingBalance;
    const principalInterest = amount(row.remaining_principal_balance) + amount(row.remaining_interest_balance);
    if (principalInterest > 0) return principalInterest;
    return Math.max(0, landlordAdvanceTotal(row) - amount(row.deducted_amount));
}

function isActiveLandlordAdvance(row: Record<string, unknown>) {
    const status = String(row.status ?? "pending").toLowerCase();
    const lifecycle = String(row.lifecycle_status ?? "active").toLowerCase();
    const approved = ["approved", "active", "partially_deducted"].includes(status)
        || Boolean(row.approved_by || row.approved_at || row.approved_date);
    return !["fully_deducted", "cleared", "cancelled", "rejected"].includes(status)
        && !["cleared", "cancelled", "rejected"].includes(lifecycle)
        && approved
        && landlordAdvanceRemaining(row) > 0;
}

function isArchivedRoom(room: Record<string, unknown>) {
    const status = String(room.status ?? "").toLowerCase();
    return ["archived", "inactive", "deleted", "removed"].some((value) => status.includes(value));
}

function isVacantCommissionRoom(room: Record<string, unknown>) {
    const status = String(room.status ?? "").toLowerCase();
    return status.includes("vacant") || status.includes("empty");
}

function parseCommissionMode(value: unknown) {
    return String(value ?? "").toLowerCase() === "occupied_room_based" ? "occupied_room_based" : "portfolio_based";
}

function parseDefaultCommissionRate(value: unknown) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        if (record.rate !== null && record.rate !== undefined && Number.isFinite(Number(record.rate))) return Number(record.rate);
        if (record.commission_rate !== null && record.commission_rate !== undefined && Number.isFinite(Number(record.commission_rate))) {
            return Number(record.commission_rate);
        }
        if (
            record.default_landlord_commission_rate !== null
            && record.default_landlord_commission_rate !== undefined
            && Number.isFinite(Number(record.default_landlord_commission_rate))
        ) {
            return Number(record.default_landlord_commission_rate);
        }
    }
    return 10;
}

function extractClearedMonth(notes: unknown) {
    const match = /cleared_month=(MAY|JUNE)/i.exec(String(notes ?? ""));
    return match?.[1]?.toUpperCase() ?? "";
}

function normalizePaymentMarker(value: unknown) {
    const marker = String(value ?? "").trim().toUpperCase();
    return marker === "MAY" || marker === "JUNE" ? marker : "";
}

async function getImportedPaymentMarker(db: Db, input: {
    companyId: string;
    officeId: string;
    landlordId: string;
    settlementMonth: string;
}) {
    const result = await db
        .from("landlord_payment_source_records")
        .select("paid_unpaid_marker, imported_at, created_at")
        .eq("company_id", input.companyId)
        .eq("office_id", input.officeId)
        .eq("landlord_id", input.landlordId)
        .eq("settlement_month", input.settlementMonth)
        .eq("active", true)
        .order("imported_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(1);
    if (result.error) throw new Error(result.error.message);
    return normalizePaymentMarker((result.data ?? [])[0]?.paid_unpaid_marker);
}

async function getRoomContext(db: Db, companyId: string, roomId: string) {
    const { data: room, error } = await db
        .from("rooms")
        .select("*, landlords(id, full_name, phone), properties(id, property_name, name), offices(id, office_name, name)")
        .eq("id", roomId)
        .eq("company_id", companyId)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!room) throw new Error("Room not found.");

    const { data: lease, error: leaseError } = await db
        .from("leases")
        .select("*")
        .eq("company_id", companyId)
        .eq("room_id", roomId)
        .eq("status", "active")
        .maybeSingle();
    if (leaseError) throw new Error(leaseError.message);

    const tenantId = lease?.tenant_id ?? room.tenant_id ?? null;
    const { data: tenant, error: tenantError } = tenantId
        ? await db.from("tenants").select("*").eq("company_id", companyId).eq("id", tenantId).maybeSingle()
        : { data: null, error: null };
    if (tenantError) throw new Error(tenantError.message);

    return { room, lease, tenant };
}

async function notify(db: Db, input: {
    companyId: string;
    officeId: string | null;
    title: string;
    message: string;
    recipientType: string;
    severity?: string;
    entityId?: string;
}) {
    const { error } = await db.from("notifications").insert({
        action_url: "/office/notifications",
        channel: "in_app",
        company_id: input.companyId,
        delivery_status: "pending",
        entity_id: input.entityId ?? null,
        entity_type: "room_rent_change_request",
        is_read: false,
        message: input.message,
        office_id: input.officeId,
        recipient_type: input.recipientType,
        severity: input.severity ?? "information",
        title: input.title,
    });
    if (error) throw new Error(error.message);
}

async function updateRoomTenantLeaseRent(db: Db, input: {
    companyId: string;
    roomId: string;
    tenantId: string | null;
    leaseId: string | null;
    newRent: number;
}) {
    const now = new Date().toISOString();
    const { error: roomError } = await db
        .from("rooms")
        .update({ monthly_rent: input.newRent, updated_at: now })
        .eq("id", input.roomId)
        .eq("company_id", input.companyId);
    if (roomError) throw new Error(roomError.message);

    if (input.tenantId) {
        const { error: tenantError } = await db
            .from("tenants")
            .update({ monthly_rent: input.newRent, updated_at: now })
            .eq("id", input.tenantId)
            .eq("company_id", input.companyId);
        if (tenantError) throw new Error(tenantError.message);
    }

    if (input.leaseId) {
        const { error: leaseError } = await db
            .from("leases")
            .update({ monthly_rent: input.newRent, updated_at: now })
            .eq("id", input.leaseId)
            .eq("company_id", input.companyId);
        if (leaseError) throw new Error(leaseError.message);
    }
}

export async function refreshAffectedLandlordPayable(db: Db, input: {
    companyId: string;
    officeId: string | null;
    landlordId: string | null;
    settlementMonth?: string | null;
    userId: string | null;
}) {
    if (!input.officeId || !input.landlordId) return null;
    const settlementMonth = input.settlementMonth?.slice(0, 10) || currentSettlementMonth();
    const now = new Date().toISOString();
    const [
        landlordResult,
        officeResult,
        roomsResult,
        settingsResult,
        debtsResult,
        advancesResult,
        existingResult,
    ] = await Promise.all([
        db.from("landlords").select("*").eq("company_id", input.companyId).eq("id", input.landlordId).maybeSingle(),
        db.from("offices").select("id, office_name, name").eq("company_id", input.companyId).eq("id", input.officeId).maybeSingle(),
        db.from("rooms").select("id, monthly_rent, status").eq("company_id", input.companyId).eq("office_id", input.officeId).eq("landlord_id", input.landlordId),
        db.from("company_settings").select("*").eq("company_id", input.companyId).eq("key", "default_landlord_commission_rate"),
        db.from("vacated_tenant_debts").select("*").eq("company_id", input.companyId).eq("office_id", input.officeId).eq("landlord_id", input.landlordId),
        db.from("landlord_advances").select("*").eq("company_id", input.companyId).eq("office_id", input.officeId).eq("landlord_id", input.landlordId),
        db.from("landlord_monthly_payables")
            .select("*")
            .eq("company_id", input.companyId)
            .eq("office_id", input.officeId)
            .eq("landlord_id", input.landlordId)
            .eq("settlement_month", settlementMonth)
            .neq("status", "archived")
            .maybeSingle(),
    ]);
    if (landlordResult.error) throw new Error(landlordResult.error.message);
    if (officeResult.error) throw new Error(officeResult.error.message);
    if (roomsResult.error) throw new Error(roomsResult.error.message);
    if (settingsResult.error) throw new Error(settingsResult.error.message);
    if (debtsResult.error) throw new Error(debtsResult.error.message);
    if (advancesResult.error) throw new Error(advancesResult.error.message);
    if (existingResult.error) throw new Error(existingResult.error.message);
    const landlord = landlordResult.data as Record<string, unknown> | null;
    const office = officeResult.data as Record<string, unknown> | null;
    if (!landlord || !office) return null;

    const existing = existingResult.data as Record<string, unknown> | null;
    const rooms = ((roomsResult.data ?? []) as Record<string, unknown>[]).filter((room) => !isArchivedRoom(room));
    const payableRoomDecisions = rooms.map((room) => ({
        decision: getMoveInPayableDecision({
            landlordPayment: {
                amountPaid: existing?.amount_paid as number | string | null | undefined,
                lastPaidAt: existing?.last_paid_at as string | null | undefined,
                status: existing?.status as string | null | undefined,
            },
            room,
            settlementMonth,
            tenantActive: !isVacantCommissionRoom(room),
        }),
        room,
    }));
    const fullRentRoll = rooms.reduce((total, room) => total + amount(room.monthly_rent), 0);
    const occupiedPayableRent = payableRoomDecisions
        .filter(({ decision }) => decision.payableThisMonth)
        .reduce((total, { room }) => total + amount(room.monthly_rent), 0);
    const vacantRoomDeductions = payableRoomDecisions
        .filter(({ decision }) => !decision.payableThisMonth)
        .reduce((total, { room }) => total + amount(room.monthly_rent), 0);
    const companyExtraProfit = payableRoomDecisions.reduce((total, { decision }) => total + decision.companyExtraProfitAmount, 0);
    const cutoffNotes = payableRoomDecisions
        .filter(({ decision }) => decision.cutoffDecision !== "standard" && decision.cutoffDecision !== "vacant" && decision.cutoffDecision !== "archived")
        .map(({ room, decision }) => `${String(room.room_number ?? room.id)}=${decision.reason}`)
        .join("; ");
    const commissionMode = parseCommissionMode(landlord.commission_calculation_mode);
    const defaultCommissionRate = parseDefaultCommissionRate((settingsResult.data ?? [])[0]?.value);
    const commissionRate = landlord.commission_rate !== null
        && landlord.commission_rate !== undefined
        && Number.isFinite(Number(landlord.commission_rate))
        ? Number(landlord.commission_rate)
        : defaultCommissionRate;
    const commissionBase = commissionMode === "occupied_room_based" ? occupiedPayableRent : fullRentRoll;
    const commissionAmount = Math.round(commissionBase * (commissionRate / 100));
    const landlordPortfolioNet = commissionMode === "occupied_room_based"
        ? Math.max(0, occupiedPayableRent - commissionAmount)
        : Math.max(0, fullRentRoll - commissionAmount - vacantRoomDeductions);
    const activeDebts = ((debtsResult.data ?? []) as Record<string, unknown>[])
        .filter((debt) => ["pending", "partially_applied"].includes(String(debt.status ?? "pending")));
    const requestedRecovery = activeDebts.reduce((total, debt) => total + Math.max(0, amount(debt.amount) - amount(debt.applied_amount)), 0);
    const recoveryDeduction = Math.min(requestedRecovery, landlordPortfolioNet);
    const activeAdvances = ((advancesResult.data ?? []) as Record<string, unknown>[])
        .filter((advance) => isActiveLandlordAdvance(advance));
    const requestedAdvance = activeAdvances.reduce((total, advance) => total + landlordAdvanceRemaining(advance), 0);
    const advanceDeduction = Math.min(requestedAdvance, Math.max(0, landlordPortfolioNet - recoveryDeduction));
    const netPayable = Math.max(0, landlordPortfolioNet - recoveryDeduction - advanceDeduction);
    const clearedMonth = extractClearedMonth(existing?.reasons_notes)
        || await getImportedPaymentMarker(db, {
            companyId: input.companyId,
            landlordId: input.landlordId,
            officeId: input.officeId,
            settlementMonth,
        });
    const previousStatus = String(existing?.status ?? "unpaid");
    const previousPaid = amount(existing?.amount_paid);
    const amountPaid = clearedMonth === "JUNE"
        ? netPayable
        : clearedMonth === "MAY"
            ? 0
            : previousStatus === "paid"
                ? netPayable
                : previousStatus === "unpaid"
                    ? 0
                    : Math.min(netPayable, previousPaid);
    const unpaidBalance = Math.max(0, netPayable - amountPaid);
    const status = unpaidBalance > 0 ? (amountPaid > 0 ? "partially_paid" : "unpaid") : "paid";
    const row = {
        company_id: input.companyId,
        office_id: input.officeId,
        landlord_id: input.landlordId,
        settlement_month: settlementMonth,
        landlord_name: landlord.full_name ?? landlord.name ?? "Landlord",
        office_name: office.office_name ?? office.name ?? "Office",
        full_rent_roll: fullRentRoll,
        commission_mode: commissionMode,
        commission_percentage: commissionRate,
        commission_amount: commissionAmount,
        vacant_room_deductions: vacantRoomDeductions,
        vacated_tenant_debt_deductions: recoveryDeduction,
        advance_deductions: advanceDeduction,
        other_deductions: 0,
        net_payable: netPayable,
        amount_paid: amountPaid,
        unpaid_balance: unpaidBalance,
        status,
        reasons_notes: clearedMonth
            ? `cleared_month=${clearedMonth}; room_source=live_rooms; move_in_cutoff=${cutoffNotes || "none"}; company_extra_profit=${companyExtraProfit}; refreshed_after_room_rent_change=${now}`
            : `room_source=live_rooms; move_in_cutoff=${cutoffNotes || "none"}; company_extra_profit=${companyExtraProfit}; refreshed_after_room_rent_change=${now}`,
        created_by: input.userId,
        updated_at: now,
    };
    const upsert = await db
        .from("landlord_monthly_payables")
        .upsert(row, { onConflict: "company_id,office_id,landlord_id,settlement_month" })
        .select("*")
        .single();
    if (upsert.error) throw new Error(upsert.error.message);
    return upsert.data;
}

export async function requestRoomRentChange(input: {
    roomId: string;
    proposedRent: number;
    reason: string;
    effectiveDate: string;
}) {
    const context = await requireAuth();
    if (!hasAnyPermission(context, ["properties.manage", "collections.manage", "landlords.manage"])) {
        throw new Error("You do not have permission to request room rent changes.");
    }
    if (!context.activeCompany?.id || !context.activeOffice?.id) throw new Error("Active company and office are required.");
    const db = await createSupabaseServerClient() as unknown as Db;
    const newRent = Number(input.proposedRent);
    assertPositiveRent(newRent);
    assertReason(input.reason);
    assertDate(input.effectiveDate);
    const { room, lease, tenant } = await getRoomContext(db, context.activeCompany.id, input.roomId);
    const roomOfficeId = room.office_id ?? lease?.office_id ?? context.activeOffice.id;
    if (!(context.isCompanyAdmin || context.canAccessAllOffices) && roomOfficeId !== context.activeOffice.id) {
        throw new Error("Room is not in your active office.");
    }
    if (context.isCompanyAdmin && !context.isOfficeMode) {
        return adminDirectRoomRentChange({
            effectiveDate: input.effectiveDate,
            newRent,
            reason: input.reason,
            roomId: input.roomId,
        });
    }

    const { data, error } = await db
        .from("room_rent_change_requests")
        .insert({
            company_id: context.activeCompany.id,
            effective_date: input.effectiveDate,
            landlord_id: room.landlord_id ?? null,
            new_rent: newRent,
            office_id: roomOfficeId,
            old_rent: Number(room.monthly_rent ?? lease?.monthly_rent ?? tenant?.monthly_rent ?? 0),
            property_id: room.property_id ?? null,
            reason: input.reason,
            requested_by: context.profile?.id ?? null,
            room_id: room.id,
            status: "pending",
            tenant_id: tenant?.id ?? null,
        })
        .select("*")
        .single();
    if (error) throw new Error(error.message);

    await notify(db, {
        companyId: context.activeCompany.id,
        entityId: data.id,
        message: `Room ${room.room_number ?? "Unnumbered"} rent change requested from ${money(Number(room.monthly_rent ?? 0))} to ${money(newRent)}. Reason: ${input.reason}`,
        officeId: roomOfficeId,
        recipientType: "admin",
        severity: "warning",
        title: "Pending room rent change approval",
    });

    await logUserAction({
        action: "room_rent_change_requested",
        entityType: "room_rent_change_request",
        entityId: data.id,
        companyId: context.activeCompany.id,
        officeId: roomOfficeId,
        afterData: data,
    });

    revalidateRentPages();
    return data;
}

export async function decideRoomRentChange(input: {
    requestId: string;
    decision: "approved" | "rejected";
    comment?: string | null;
}) {
    const context = await requireCompanyAdminMode();
    if (!context.activeCompany?.id) throw new Error("Active company is required.");
    const db = await createSupabaseServerClient() as unknown as Db;
    const { data: request, error } = await db
        .from("room_rent_change_requests")
        .select("*")
        .eq("id", input.requestId)
        .eq("company_id", context.activeCompany.id)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!request) throw new Error("Rent change request not found.");
    if (request.status !== "pending") throw new Error("This rent request has already been decided.");

    const { room, lease, tenant } = await getRoomContext(db, context.activeCompany.id, String(request.room_id));
    if (input.decision === "approved") {
        await updateRoomTenantLeaseRent(db, {
            companyId: context.activeCompany.id,
            leaseId: lease?.id ?? null,
            newRent: Number(request.new_rent ?? 0),
            roomId: String(request.room_id),
            tenantId: tenant?.id ?? (String(request.tenant_id ?? "") || null),
        });
        await refreshAffectedLandlordPayable(db, {
            companyId: context.activeCompany.id,
            landlordId: String(request.landlord_id ?? room.landlord_id ?? "") || null,
            officeId: String(request.office_id ?? room.office_id ?? lease?.office_id ?? "") || null,
            userId: context.profile?.id ?? null,
        });
    }

    const { data: updated, error: updateError } = await db
        .from("room_rent_change_requests")
        .update({
            admin_comment: input.comment ?? null,
            decided_at: new Date().toISOString(),
            decided_by: context.profile?.id ?? null,
            status: input.decision,
        })
        .eq("id", input.requestId)
        .select("*")
        .single();
    if (updateError) throw new Error(updateError.message);

    await notify(db, {
        companyId: context.activeCompany.id,
        entityId: updated.id,
        message: input.decision === "approved"
            ? `Room ${room.room_number ?? "Unnumbered"} rent change approved. New rent: ${money(Number(request.new_rent ?? 0))}.`
            : `Room ${room.room_number ?? "Unnumbered"} rent change rejected. ${input.comment ?? ""}`.trim(),
        officeId: String(request.office_id ?? room.office_id ?? ""),
        recipientType: "office",
        severity: input.decision === "approved" ? "success" : "warning",
        title: input.decision === "approved" ? "Room rent change approved" : "Room rent change rejected",
    });

    await logUserAction({
        action: input.decision === "approved" ? "room_rent_change_approved" : "room_rent_change_rejected",
        entityType: "room_rent_change_request",
        entityId: updated.id,
        companyId: context.activeCompany.id,
        officeId: String(request.office_id ?? room.office_id ?? ""),
        beforeData: request,
        afterData: updated,
    });

    revalidateRentPages();
    return updated;
}

export async function adminDirectRoomRentChange(input: {
    roomId: string;
    newRent: number;
    reason: string;
    effectiveDate: string;
}) {
    const context = await requireCompanyAdminMode();
    if (!context.activeCompany?.id) throw new Error("Active company is required.");
    const db = await createSupabaseServerClient() as unknown as Db;
    const newRent = Number(input.newRent);
    assertPositiveRent(newRent);
    assertReason(input.reason);
    assertDate(input.effectiveDate);
    const { room, lease, tenant } = await getRoomContext(db, context.activeCompany.id, input.roomId);
    const oldRent = Number(room.monthly_rent ?? lease?.monthly_rent ?? tenant?.monthly_rent ?? 0);
    await updateRoomTenantLeaseRent(db, {
        companyId: context.activeCompany.id,
        leaseId: lease?.id ?? null,
        newRent,
        roomId: room.id,
        tenantId: tenant?.id ?? null,
    });
    const refreshedPayable = await refreshAffectedLandlordPayable(db, {
        companyId: context.activeCompany.id,
        landlordId: String(room.landlord_id ?? "") || null,
        officeId: String(room.office_id ?? lease?.office_id ?? "") || null,
        userId: context.profile?.id ?? null,
    });

    const { data, error } = await db
        .from("room_rent_change_requests")
        .insert({
            admin_comment: input.reason,
            company_id: context.activeCompany.id,
            decided_at: new Date().toISOString(),
            decided_by: context.profile?.id ?? null,
            effective_date: input.effectiveDate,
            landlord_id: room.landlord_id ?? null,
            new_rent: newRent,
            office_id: room.office_id ?? lease?.office_id ?? null,
            old_rent: oldRent,
            property_id: room.property_id ?? null,
            reason: input.reason,
            requested_by: context.profile?.id ?? null,
            room_id: room.id,
            status: "approved",
            tenant_id: tenant?.id ?? null,
        })
        .select("*")
        .single();
    if (error) throw new Error(error.message);

    await logUserAction({
        action: "Admin changed room rent directly",
        entityType: "room_rent_change_request",
        entityId: data.id,
        companyId: context.activeCompany.id,
        officeId: room.office_id ?? lease?.office_id ?? null,
        beforeData: { room, lease, tenant, oldRent },
        afterData: { ...data, refreshedPayable },
    });

    revalidateRentPages();
    return data;
}

export async function adminSearchRooms(query: string) {
    const context = await requireCompanyAdminMode();
    if (!context.activeCompany?.id) throw new Error("Active company is required.");
    const db = await createSupabaseServerClient() as unknown as Db;
    const term = query.trim();
    if (term.length < 1) return [];

    const { data: rooms, error } = await db
        .from("rooms")
        .select("*, landlords(id, full_name, phone), properties(id, property_name, name), offices(id, office_name, name)")
        .eq("company_id", context.activeCompany.id)
        .or(`room_number.ilike.%${term}%,status.ilike.%${term}%`)
        .limit(20);
    if (error) throw new Error(error.message);

    const tenantMatches = await db
        .from("tenants")
        .select("id, full_name, phone, room_id, office_id, monthly_rent, balance")
        .eq("company_id", context.activeCompany.id)
        .or(`full_name.ilike.%${term}%,phone.ilike.%${term}%`)
        .limit(20);
    if (tenantMatches.error) throw new Error(tenantMatches.error.message);

    const landlordMatches = await db
        .from("landlords")
        .select("id, full_name")
        .eq("company_id", context.activeCompany.id)
        .ilike("full_name", `%${term}%`)
        .limit(20);
    if (landlordMatches.error) throw new Error(landlordMatches.error.message);

    const officeMatches = await db
        .from("offices")
        .select("id, office_name, name")
        .eq("company_id", context.activeCompany.id)
        .or(`office_name.ilike.%${term}%,name.ilike.%${term}%`)
        .limit(20);
    if (officeMatches.error) throw new Error(officeMatches.error.message);

    const propertyMatches = await db
        .from("properties")
        .select("id, property_name, name")
        .eq("company_id", context.activeCompany.id)
        .or(`property_name.ilike.%${term}%,name.ilike.%${term}%`)
        .limit(20);
    if (propertyMatches.error) throw new Error(propertyMatches.error.message);

    const roomIds = new Set<string>((rooms ?? []).map((room: Record<string, unknown>) => String(room.id)));
    for (const tenant of tenantMatches.data ?? []) if (tenant.room_id) roomIds.add(String(tenant.room_id));
    const landlordIds = (landlordMatches.data ?? []).map((landlord: Record<string, unknown>) => String(landlord.id));
    if (landlordIds.length) {
        const landlordRooms = await db.from("rooms").select("id").eq("company_id", context.activeCompany.id).in("landlord_id", landlordIds).limit(50);
        if (landlordRooms.error) throw new Error(landlordRooms.error.message);
        for (const room of landlordRooms.data ?? []) roomIds.add(String(room.id));
    }
    const officeIds = (officeMatches.data ?? []).map((office: Record<string, unknown>) => String(office.id));
    if (officeIds.length) {
        const officeRooms = await db.from("rooms").select("id").eq("company_id", context.activeCompany.id).in("office_id", officeIds).limit(50);
        if (officeRooms.error) throw new Error(officeRooms.error.message);
        for (const room of officeRooms.data ?? []) roomIds.add(String(room.id));
    }
    const propertyIds = (propertyMatches.data ?? []).map((property: Record<string, unknown>) => String(property.id));
    if (propertyIds.length) {
        const propertyRooms = await db.from("rooms").select("id").eq("company_id", context.activeCompany.id).in("property_id", propertyIds).limit(50);
        if (propertyRooms.error) throw new Error(propertyRooms.error.message);
        for (const room of propertyRooms.data ?? []) roomIds.add(String(room.id));
    }

    const finalRooms = roomIds.size
        ? await db
            .from("rooms")
            .select("*, landlords(id, full_name, phone), properties(id, property_name, name), offices(id, office_name, name)")
            .eq("company_id", context.activeCompany.id)
            .in("id", [...roomIds])
            .limit(50)
        : { data: [], error: null };
    if (finalRooms.error) throw new Error(finalRooms.error.message);

    const finalRoomIds = (finalRooms.data ?? []).map((room: Record<string, unknown>) => String(room.id));
    const [leases, tenants, rentHistory] = await Promise.all([
        finalRoomIds.length ? db.from("leases").select("*").eq("company_id", context.activeCompany.id).eq("status", "active").in("room_id", finalRoomIds) : { data: [], error: null },
        finalRoomIds.length ? db.from("tenants").select("*").eq("company_id", context.activeCompany.id).in("room_id", finalRoomIds) : { data: [], error: null },
        finalRoomIds.length ? db.from("room_rent_change_requests").select("*").eq("company_id", context.activeCompany.id).in("room_id", finalRoomIds).order("created_at", { ascending: false }) : { data: [], error: null },
    ]);
    if (leases.error) throw new Error(leases.error.message);
    if (tenants.error) throw new Error(tenants.error.message);
    if (rentHistory.error) throw new Error(rentHistory.error.message);

    const leaseByRoom = new Map((leases.data ?? []).map((lease: Record<string, unknown>) => [String(lease.room_id), lease]));
    const tenantByRoom = new Map((tenants.data ?? []).map((tenant: Record<string, unknown>) => [String(tenant.room_id), tenant]));
    const historyByRoom = new Map<string, Record<string, unknown>>();
    for (const history of rentHistory.data ?? []) {
        const roomId = String(history.room_id);
        if (!historyByRoom.has(roomId)) historyByRoom.set(roomId, history);
    }

    return (finalRooms.data ?? []).map((room: Record<string, unknown>) => {
        const roomId = String(room.id);
        const tenant = tenantByRoom.get(roomId) as Record<string, unknown> | undefined;
        const lease = leaseByRoom.get(roomId) as Record<string, unknown> | undefined;
        const lastChange = historyByRoom.get(roomId);
        return {
            id: roomId,
            roomNumber: room.room_number ?? null,
            status: room.status ?? null,
            officeName: nestedName(room.offices, ["office_name", "name"]),
            propertyName: nestedName(room.properties, ["property_name", "name"]),
            landlordName: nestedName(room.landlords, ["full_name"]),
            landlordPhone: nestedName(room.landlords, ["phone"]),
            tenantName: tenant?.full_name ?? null,
            currentRent: Number(lease?.monthly_rent ?? tenant?.monthly_rent ?? room.monthly_rent ?? 0),
            outstandingBalance: Number(tenant?.balance ?? room.outstanding_balance ?? 0),
            lastRentChange: lastChange ? {
                oldRent: Number(lastChange.old_rent ?? 0),
                newRent: Number(lastChange.new_rent ?? 0),
                status: String(lastChange.status ?? "pending"),
                effectiveDate: String(lastChange.effective_date ?? ""),
                createdAt: String(lastChange.created_at ?? ""),
            } : null,
        };
    });
}

function nestedName(value: unknown, keys: string[]) {
    const row = Array.isArray(value) ? value[0] : value;
    if (!row || typeof row !== "object") return null;
    for (const key of keys) {
        const raw = (row as Record<string, unknown>)[key];
        if (typeof raw === "string" && raw.trim()) return raw;
    }
    return null;
}
