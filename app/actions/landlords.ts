"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyAdminMode, requirePermission } from "@/lib/auth/permissions";
import { logUserAction } from "@/lib/auth/audit";
import { createNotificationWithEmail } from "@/lib/notifications/email";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getLandlordInCompany, getPropertyForLandlordAssignment } from "@/lib/landlords/data";
import { getMoveInPayableDecision } from "@/lib/landlords/payable-cutoff";
import { scheduledAdvanceDeductionForMonth, splitAdvanceDeductionPortions } from "@/lib/landlord-advances/calculator";
import { reconcileLandlordPayableWithLiveNet } from "@/lib/landlord-payables/live-net";
import { landlordMonthlyDue, landlordMonthlyPaid, landlordMonthlyUnpaid } from "@/lib/landlord-payables/payment-allocation";
import { isRecoveryDeductionActiveForMonth } from "@/lib/landlord-payables/recovery-deductions";
import type {
    ArchiveLandlordInput,
    AssignPropertyInput,
    CreateLandlordInput,
    EditLandlordInput,
    GenerateSettlementInput,
    GenerateStatementInput,
    AssignLandlordRoomsInput,
    AddLandlordRoomInput,
    DeleteLandlordRoomInput,
    UpdateLandlordCommissionInput,
    LandlordCommissionCalculationMode,
} from "@/lib/landlords/types";
import type { Database } from "@/types/database.types";

type AuditJson = Database["public"]["Tables"]["audit_logs"]["Insert"]["after_data"];

type MonthlyLandlordPayableSnapshotInput = {
    settlementMonth?: string;
};

type LandlordPaymentDetailsInput = {
    landlordId: string;
    paymentMethod: "cash" | "mobile_money" | "bank";
    label?: string;
    provider?: string;
    accountName?: string;
    accountNumber?: string;
    mobileMoneyProvider?: string;
    mobileMoneyNumber?: string;
    mobileMoneyAccountName?: string;
    bankName?: string;
    bankAccountNumber?: string;
    bankAccountName?: string;
    branch?: string;
    notes?: string;
    adminComment?: string;
    isDefault?: boolean;
};

async function activeWriteContext() {
    const context = await requirePermission("landlords.manage");
    if (!context.activeCompany?.id || !context.activeOffice?.id) {
        throw new Error("Active company and office are required.");
    }
    return context;
}

async function activeAdminWriteContext() {
    const context = await requireCompanyAdminMode();
    if (!context.activeCompany?.id) {
        throw new Error("Active company is required.");
    }
    return context;
}

function normalizeName(value: string) {
    const name = value.trim();
    if (!name) throw new Error("Landlord name is required.");
    return name;
}

function jsonSafe(value: unknown): AuditJson {
    return JSON.parse(JSON.stringify(value ?? null)) as AuditJson;
}

function numericAmount(value: unknown) {
    return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function revalidateLandlordPaymentDetailsSurfaces() {
    for (const path of ["/office/landlords", "/office/landlord-payments", "/office/expenses", "/office/notifications", "/office/audit", "/office/admin"]) {
        revalidatePath(path);
    }
}

function cleanPaymentMethod(value: unknown): "cash" | "mobile_money" | "bank" {
    return value === "mobile_money" || value === "bank" ? value : "cash";
}

function landlordAdvanceTotal(row: Record<string, unknown>) {
    const explicitTotal = numericAmount(row.total_repayable);
    if (explicitTotal > 0) return explicitTotal;
    const advanceAmount = numericAmount(row.advance_amount);
    if (advanceAmount > 0) return advanceAmount;
    return numericAmount(row.principal_amount) + numericAmount(row.interest_amount);
}

function landlordAdvanceRemaining(row: Record<string, unknown>) {
    const remainingTotal = numericAmount(row.remaining_total_balance);
    if (remainingTotal > 0) return remainingTotal;
    const remainingBalance = numericAmount(row.remaining_balance);
    if (remainingBalance > 0) return remainingBalance;
    const principalInterest = numericAmount(row.remaining_principal_balance) + numericAmount(row.remaining_interest_balance);
    if (principalInterest > 0) return principalInterest;
    return Math.max(0, landlordAdvanceTotal(row) - numericAmount(row.deducted_amount));
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

async function createFinanceNotification(db: LooseDb, input: {
    companyId: string;
    officeId: string | null;
    title: string;
    message: string;
    severity?: string;
    entityId?: string | null;
}) {
    await createNotificationWithEmail(db, {
        action_url: "/office/landlord-payments",
        channel: "in_app",
        company_id: input.companyId,
        delivery_status: "pending",
        entity_id: input.entityId ?? null,
        entity_type: "landlord_advance",
        is_read: false,
        message: input.message,
        office_id: input.officeId,
        recipient_type: "admin",
        severity: input.severity ?? "information",
        title: input.title,
    });
}

export async function createLandlord(input: CreateLandlordInput) {
    const context = await activeWriteContext();
    const supabase = await createSupabaseServerClient();
    const fullName = normalizeName(input.fullName);

    const { data, error } = await supabase
        .from("landlords")
        .insert({
            company_id: context.activeCompany!.id,
            email: input.email || null,
            expected_income: input.expectedIncome ?? null,
            full_name: fullName,
            landlord_code: input.landlordCode || null,
            national_id: input.nationalId || null,
            phone: input.phone || null,
            status: "active",
        })
        .select("*")
        .single();

    if (error) throw new Error(error.message);

    await logUserAction({
        action: "landlord_created",
        entityType: "landlord",
        entityId: data.id,
        companyId: context.activeCompany!.id,
        officeId: context.activeOffice!.id,
        afterData: data,
    });

    revalidatePath("/office/landlords");
    return data;
}

export async function editLandlord(input: EditLandlordInput) {
    const context = await activeWriteContext();
    const existing = await getLandlordInCompany(input.landlordId);
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
        .from("landlords")
        .update({
            email: input.email || null,
            expected_income: input.expectedIncome ?? existing.expected_income,
            full_name: normalizeName(input.fullName),
            landlord_code: input.landlordCode || existing.landlord_code,
            national_id: input.nationalId || null,
            phone: input.phone || null,
            status: input.status || existing.status,
        })
        .eq("id", existing.id)
        .select("*")
        .single();

    if (error) throw new Error(error.message);

    await logUserAction({
        action: "landlord_edited",
        entityType: "landlord",
        entityId: data.id,
        beforeData: existing,
        afterData: data,
        companyId: context.activeCompany!.id,
        officeId: context.activeOffice!.id,
    });

    revalidatePath("/office/landlords");
    return data;
}

export async function archiveLandlord(input: ArchiveLandlordInput) {
    const context = await activeWriteContext();
    const existing = await getLandlordInCompany(input.landlordId);
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
        .from("landlords")
        .update({ status: "archived" })
        .eq("id", existing.id)
        .select("*")
        .single();

    if (error) throw new Error(error.message);

    await logUserAction({
        action: "landlord_archived",
        entityType: "landlord",
        entityId: data.id,
        beforeData: existing,
        afterData: { ...data, reason: input.reason ?? null },
        companyId: context.activeCompany!.id,
        officeId: context.activeOffice!.id,
    });

    revalidatePath("/office/landlords");
    return data;
}

export async function assignPropertyToLandlord(input: AssignPropertyInput) {
    const context = await activeWriteContext();
    const landlord = await getLandlordInCompany(input.landlordId);
    const property = await getPropertyForLandlordAssignment(input.propertyId);
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
        .from("properties")
        .update({ landlord_id: landlord.id })
        .eq("id", property.id)
        .select("*")
        .single();

    if (error) throw new Error(error.message);

    await supabase.from("property_landlords").insert({
        company_id: context.activeCompany!.id,
        is_primary: true,
        landlord_id: landlord.id,
        ownership_percentage: input.ownershipPercentage ?? 100,
        property_id: property.id,
    });

    await logUserAction({
        action: "landlord_property_assigned",
        entityType: "property",
        entityId: property.id,
        beforeData: property,
        afterData: data,
        companyId: context.activeCompany!.id,
        officeId: context.activeOffice!.id,
    });

    revalidatePath("/office/landlords");
    return data;
}

export async function updateLandlordCommission(input: UpdateLandlordCommissionInput) {
    const context = await activeAdminWriteContext();
    const landlord = await getLandlordInCompany(input.landlordId);
    const supabase = await createSupabaseServerClient();
    const db = supabase as unknown as LooseDb;
    const companyId = context.activeCompany!.id;
    const actorId = context.profile?.id ?? context.authUser?.id ?? null;
    const inputMode = input.inputMode ?? "percentage";
    const newCalculationMode = parseCommissionCalculationMode(input.commissionCalculationMode);
    const oldCalculationMode = parseCommissionCalculationMode(
        (landlord as typeof landlord & { commission_calculation_mode?: string | null }).commission_calculation_mode
        ?? parseCommissionMetadata((landlord as typeof landlord & { commission_notes?: string | null }).commission_notes).commissionCalculationMode,
    );
    const { data: rooms, error: roomsError } = await db
        .from("rooms")
        .select("id,landlord_id,monthly_rent,status")
        .eq("company_id", companyId)
        .eq("landlord_id", landlord.id)
        .not("status", "in", "(archived,inactive,deleted,removed)");
    if (roomsError) throw new Error(roomsError.message);

    const landlordRooms = (rooms ?? []) as LooseRecord[];
    const portfolioRentRoll = landlordRooms.reduce((total: number, room) => total + Number(room.monthly_rent ?? 0), 0);
    const occupiedPayableRent = landlordRooms
        .filter((room) => !isVacantCommissionRoom(room))
        .reduce((total: number, room) => total + Number(room.monthly_rent ?? 0), 0);
    const newCommissionBase = newCalculationMode === "occupied_room_based" ? occupiedPayableRent : portfolioRentRoll;
    const oldCommissionBase = oldCalculationMode === "occupied_room_based" ? occupiedPayableRent : portfolioRentRoll;
    const oldRate = (landlord as typeof landlord & { commission_rate?: number | string | null }).commission_rate ?? null;
    const oldRateNumber = oldRate === null ? null : Number(oldRate);
    const oldLandlordNetAmount = oldRateNumber === null || !Number.isFinite(oldRateNumber)
        ? null
        : Math.max(0, oldCommissionBase - Math.round(oldCommissionBase * oldRateNumber / 100));

    let rate: number | null;
    let newLandlordNetAmount: number | null;
    if (inputMode === "landlord_net_amount") {
        const landlordNetAmount = Number(input.landlordNetAmount ?? NaN);
        if (!Number.isFinite(landlordNetAmount) || landlordNetAmount < 0) {
            throw new Error("Landlord net amount must be a positive number.");
        }
        if (newCommissionBase <= 0) {
            throw new Error("Cannot calculate commission because this landlord has no commission base for the selected mode.");
        }
        if (landlordNetAmount > newCommissionBase) {
            throw new Error("Landlord net amount cannot be greater than the selected commission base.");
        }
        rate = Number((((newCommissionBase - landlordNetAmount) / newCommissionBase) * 100).toFixed(4));
        newLandlordNetAmount = landlordNetAmount;
    } else {
        rate = input.commissionRate === null ? null : Number(input.commissionRate);
        newLandlordNetAmount = rate === null || !Number.isFinite(rate)
            ? null
            : Math.max(0, newCommissionBase - Math.round(newCommissionBase * rate / 100));
    }

    if (rate !== null && (!Number.isFinite(rate) || rate < 0 || rate > 100)) {
        throw new Error("Commission rate must be between 0 and 100.");
    }

    const commissionNotes = buildCommissionNotes({
        existing: (landlord as typeof landlord & { commission_notes?: string | null }).commission_notes ?? null,
        calculationMode: newCalculationMode,
        inputMode,
        landlordNetPayableOverride: inputMode === "landlord_net_amount" ? newLandlordNetAmount : null,
        note: input.notes ?? null,
    });
    let update = await db
        .from("landlords")
        .update({
            commission_rate: rate,
            commission_input_mode: inputMode,
            commission_calculation_mode: newCalculationMode,
            landlord_net_payable_override: inputMode === "landlord_net_amount" ? newLandlordNetAmount : null,
            commission_notes: commissionNotes,
            commission_updated_by: actorId,
            commission_updated_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq("id", landlord.id);
    if (isMissingColumnError(update.error)) {
        update = await db
            .from("landlords")
            .update({
                commission_rate: rate,
                commission_input_mode: inputMode,
                landlord_net_payable_override: inputMode === "landlord_net_amount" ? newLandlordNetAmount : null,
                commission_notes: commissionNotes,
                commission_updated_by: actorId,
                commission_updated_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq("id", landlord.id);
    }
    if (update.error) throw new Error(update.error.message);

    const historyNotes = input.notes ?? (rate === null ? "Use company default commission." : "Landlord-specific commission override.");
    let historyInsert = await db.from("landlord_commission_changes").insert({
        company_id: companyId,
        landlord_id: landlord.id,
        old_commission_rate: oldRate,
        new_commission_rate: rate,
        old_landlord_net_amount: oldLandlordNetAmount,
        new_landlord_net_amount: newLandlordNetAmount,
        old_commission_calculation_mode: oldCalculationMode,
        new_commission_calculation_mode: newCalculationMode,
        portfolio_rent_roll: portfolioRentRoll,
        input_mode: inputMode,
        changed_by: actorId,
        notes: historyNotes,
    });
    if (isMissingColumnError(historyInsert.error)) {
        historyInsert = await db.from("landlord_commission_changes").insert({
            company_id: companyId,
            landlord_id: landlord.id,
            old_commission_rate: oldRate,
            new_commission_rate: rate,
            old_landlord_net_amount: oldLandlordNetAmount,
            new_landlord_net_amount: newLandlordNetAmount,
            portfolio_rent_roll: portfolioRentRoll,
            input_mode: inputMode,
            changed_by: actorId,
            notes: `${historyNotes} Commission mode changed from ${oldCalculationMode} to ${newCalculationMode}.`,
        });
    }
    if (historyInsert.error) throw new Error(historyInsert.error.message);

    await logUserAction({
        action: "landlord_commission_changed",
        entityType: "landlord",
        entityId: landlord.id,
        companyId,
        officeId: context.activeOffice?.id ?? null,
        beforeData: jsonSafe({ ...landlord, commission_rate: oldRate, landlord_net_amount: oldLandlordNetAmount, commission_calculation_mode: oldCalculationMode }),
        afterData: jsonSafe({
            ...landlord,
            commission_rate: rate,
            commission_input_mode: inputMode,
            commission_calculation_mode: newCalculationMode,
            landlord_net_payable_override: inputMode === "landlord_net_amount" ? newLandlordNetAmount : null,
            old_commission_calculation_mode: oldCalculationMode,
            commission_updated_by: actorId,
            landlord_net_amount: newLandlordNetAmount,
            input_mode: inputMode,
            portfolio_rent_roll: portfolioRentRoll,
        }),
    });

    const refreshedPayables = await refreshCurrentMonthPayablesForLandlord({
        db,
        companyId,
        landlordId: landlord.id,
        createdBy: actorId,
    });

    revalidatePath("/office/landlords");
    revalidatePath("/office/landlord-payments");
    revalidatePath("/office/admin");
    revalidatePath("/office/dashboard");
    revalidatePath("/office");
    revalidatePath("/office/ceo");
    revalidatePath("/office/reports");
    return { ok: true, refreshedPayables };
}

export async function assignRoomsToLandlord(input: AssignLandlordRoomsInput) {
    const context = await activeAdminWriteContext();
    const supabase = await createSupabaseServerClient();
    const db = supabase as unknown as LooseDb;
    const companyId = context.activeCompany!.id;
    const actorId = context.profile?.id ?? context.authUser?.id ?? null;
    const roomIds = Array.from(new Set(input.roomIds.filter(Boolean)));
    if (!roomIds.length) throw new Error("Select at least one room.");

    let newLandlord: Record<string, unknown> | null = null;
    if (input.landlordId) {
        const { data, error } = await db
            .from("landlords")
            .select("*")
            .eq("id", input.landlordId)
            .eq("company_id", companyId)
            .maybeSingle!();
        if (error) throw new Error(error.message);
        if (!data) throw new Error("Target landlord not found.");
        newLandlord = data;
    }

    const { data: rooms, error: roomsError } = await db
        .from("rooms")
        .select("*")
        .eq("company_id", companyId);
    if (roomsError) throw new Error(roomsError.message);
    const selectedRooms = ((rooms ?? []) as LooseRecord[]).filter((room) => roomIds.includes(String(room.id)));
    if (selectedRooms.length !== roomIds.length) throw new Error("One or more rooms were not found.");

    const changes = selectedRooms.map((room) => ({
        company_id: companyId,
        office_id: room.office_id as string | null,
        room_id: String(room.id),
        previous_landlord_id: room.landlord_id as string | null,
        new_landlord_id: input.landlordId,
        changed_by: actorId,
        reason: input.reason ?? (input.landlordId ? "Admin room landlord assignment." : "Admin room landlord unassignment."),
    }));

    for (const room of selectedRooms) {
        const update = await db
            .from("rooms")
            .update({
                landlord_id: input.landlordId,
                updated_at: new Date().toISOString(),
            })
            .eq("id", String(room.id));
        if (update.error) throw new Error(update.error.message);
    }

    const historyInsert = await db.from("landlord_room_assignment_changes").insert(changes);
    if (historyInsert.error) throw new Error(historyInsert.error.message);

    await logUserAction({
        action: "landlord_room_assignment_changed",
        entityType: "room",
        entityId: roomIds[0] ?? null,
        companyId,
        officeId: context.activeOffice?.id ?? null,
        beforeData: jsonSafe({ rooms: selectedRooms.map((room) => ({ id: room.id, room_number: room.room_number, landlord_id: room.landlord_id })) }),
        afterData: jsonSafe({
            rooms: selectedRooms.map((room) => ({ id: room.id, room_number: room.room_number, previous_landlord_id: room.landlord_id, new_landlord_id: input.landlordId })),
            newLandlord,
            reason: input.reason ?? null,
        }),
    });

    revalidatePath("/office/landlords");
    revalidatePath("/office/admin");
    revalidatePath("/office/properties");
    return { updated: selectedRooms.length };
}

export async function addRoomToLandlord(input: AddLandlordRoomInput) {
    const context = await activeAdminWriteContext();
    const landlord = await getLandlordInCompany(input.landlordId);
    const supabase = await createSupabaseServerClient();
    const companyId = context.activeCompany!.id;
    const actorId = context.profile?.id ?? context.authUser?.id ?? null;
    const now = new Date().toISOString();
    const roomNumber = input.roomNumber.trim();
    const monthlyRent = Number(input.monthlyRent);
    const startDate = normalizeDateInput(input.startDate, "Room start date is required.");

    if (!roomNumber) throw new Error("Room number is required.");
    if (!input.officeId) throw new Error("Office is required.");
    if (!Number.isFinite(monthlyRent) || monthlyRent < 0) throw new Error("Monthly rent must be a valid amount.");

    const { data: office, error: officeError } = await supabase
        .from("offices")
        .select("*")
        .eq("id", input.officeId)
        .eq("company_id", companyId)
        .maybeSingle();
    if (officeError) throw new Error(officeError.message);
    if (!office) throw new Error("Office not found.");

    const property = await resolveRoomProperty({
        companyId,
        input,
        landlordId: landlord.id,
        now,
        supabase,
    });

    const { data: existingRooms, error: existingError } = await supabase
        .from("rooms")
        .select("*")
        .eq("company_id", companyId)
        .eq("office_id", input.officeId)
        .eq("property_id", property.id)
        .ilike("room_number", roomNumber);
    if (existingError) throw new Error(existingError.message);

    const exactRoom = (existingRooms ?? []).find((room) => String(room.room_number ?? "").trim().toLowerCase() === roomNumber.toLowerCase());
    const payable = getAddRoomPayableState({ startDate, status: input.status });
    const roomPayload = {
        company_id: companyId,
        effective_start_date: startDate,
        explicitly_payable: false,
        floor: input.roomLocation?.trim() || null,
        landlord_id: landlord.id,
        monthly_rent: monthlyRent,
        office_id: input.officeId,
        outstanding_balance: input.status === "occupied" ? monthlyRent : 0,
        payable_notes: payable.reason,
        property_id: property.id,
        room_number: roomNumber,
        status: input.status,
        updated_at: now,
    };
    const roomDb = supabase as unknown as LooseDb;

    const { data: room, error: roomError } = exactRoom
        ? await roomDb
            .from("rooms")
            .update(roomPayload)
            .eq("id", exactRoom.id)
            .select("*")
            .single()
        : await roomDb
            .from("rooms")
            .insert({ ...roomPayload, created_at: now })
            .select("*")
            .single();
    if (roomError) throw new Error(roomError.message);

    let tenant: Record<string, unknown> | null = null;
    let lease: Record<string, unknown> | null = null;
    if (input.status === "occupied") {
        const tenantName = input.tenantName?.trim() || "Unnamed Tenant";
        const { data: existingTenant, error: tenantLookupError } = await supabase
            .from("tenants")
            .select("*")
            .eq("company_id", companyId)
            .eq("room_id", room.id)
            .eq("status", "active")
            .maybeSingle();
        if (tenantLookupError) throw new Error(tenantLookupError.message);

        const tenantPayload = {
            balance: monthlyRent,
            company_id: companyId,
            full_name: tenantName,
            monthly_rent: monthlyRent,
            office_id: input.officeId,
            phone: input.tenantPhone?.trim() || null,
            property_id: property.id,
            room_id: room.id,
            status: "active",
            tenant_reliability_score: 75,
            tenant_risk_level: "Low Risk",
            tenant_score_reason: "Tenant created during landlord room management.",
            tenant_score_updated_at: now,
            tenant_type: "residential",
            updated_at: now,
        };

        const tenantWrite = existingTenant
            ? await supabase.from("tenants").update(tenantPayload).eq("id", existingTenant.id).select("*").single()
            : await supabase.from("tenants").insert({ ...tenantPayload, created_at: now }).select("*").single();
        if (tenantWrite.error) throw new Error(tenantWrite.error.message);
        tenant = tenantWrite.data;

        const { data: existingLease, error: leaseLookupError } = await supabase
            .from("leases")
            .select("*")
            .eq("company_id", companyId)
            .eq("room_id", room.id)
            .eq("status", "active")
            .maybeSingle();
        if (leaseLookupError) throw new Error(leaseLookupError.message);

        const leasePayload = {
            company_id: companyId,
            monthly_rent: monthlyRent,
            office_id: input.officeId,
            property_id: property.id,
            room_id: room.id,
            start_date: startDate,
            status: "active",
            tenant_id: String(tenant.id),
            updated_at: now,
        };

        const leaseWrite = existingLease
            ? await supabase.from("leases").update(leasePayload).eq("id", existingLease.id).select("*").single()
            : await supabase.from("leases").insert(leasePayload).select("*").single();
        if (leaseWrite.error) throw new Error(leaseWrite.error.message);
        lease = leaseWrite.data;
    }

    await logUserAction({
        action: exactRoom ? "landlord_room_attached" : "landlord_room_added",
        entityType: "room",
        entityId: room.id,
        companyId,
        officeId: input.officeId,
        beforeData: jsonSafe(exactRoom),
        afterData: jsonSafe({
            room,
            tenant,
            lease,
            landlord,
            notes: input.notes ?? null,
            payable_this_month: payable.payableThisMonth,
            payable_reason: payable.reason,
            start_date: startDate,
            admin_user: actorId,
        }),
    });

    revalidatePath("/office/landlords");
    revalidatePath("/office/admin");
    revalidatePath("/office/properties");
    revalidatePath("/office/dashboard");
    return { room, tenant, lease, mode: exactRoom ? "attached" : "created" };
}

function normalizeDateInput(value: string | null | undefined, message: string) {
    if (!value) throw new Error(message);
    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) throw new Error("Enter a valid start date.");
    return value.slice(0, 10);
}

function getAddRoomPayableState({ startDate, status }: { startDate: string; status: "occupied" | "vacant" }) {
    if (status === "vacant") {
        return { payableThisMonth: false, reason: "No - Vacant room." };
    }
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const start = new Date(`${startDate}T00:00:00`);
    if (start > endOfCurrentMonth()) {
        return { payableThisMonth: false, reason: "No - Starts next month." };
    }
    if (start >= monthStart) {
        return { payableThisMonth: false, reason: "No - Payable from next settlement cycle unless proration is enabled." };
    }
    return { payableThisMonth: true, reason: "Yes - Occupied and effective before current settlement cycle." };
}

function getSettlementRoomPayableState({ room, hasLease }: { room: Record<string, unknown>; hasLease: boolean }) {
    const status = String(room.status ?? "active").toLowerCase();
    const startDate = typeof room.effective_start_date === "string" ? room.effective_start_date : null;
    const explicitlyPayable = Boolean(room.explicitly_payable);

    if (status === "archived") return { payableThisMonth: false, reason: "Archived." };
    if (status === "vacant" || status === "empty") return { payableThisMonth: false, reason: "Vacant room." };
    const statusIndicatesOccupied = status === "occupied" || status === "active";
    if (!startDate) {
        return {
            payableThisMonth: hasLease || statusIndicatesOccupied || explicitlyPayable,
            reason: hasLease || statusIndicatesOccupied || explicitlyPayable
                ? "Active occupied room."
                : "Not occupied.",
        };
    }

    const start = new Date(`${startDate}T00:00:00`);
    if (Number.isNaN(start.getTime())) return { payableThisMonth: false, reason: "Invalid start date." };

    return { payableThisMonth: hasLease || statusIndicatesOccupied || explicitlyPayable, reason: explicitlyPayable ? "Admin marked payable." : "Occupied and effective for settlement period." };
}

function endOfCurrentMonth() {
    const date = new Date();
    date.setMonth(date.getMonth() + 1, 0);
    date.setHours(23, 59, 59, 999);
    return date;
}

export async function deleteOrArchiveLandlordRoom(input: DeleteLandlordRoomInput) {
    const context = await activeAdminWriteContext();
    await getLandlordInCompany(input.landlordId);
    const supabase = await createSupabaseServerClient();
    const companyId = context.activeCompany!.id;
    const now = new Date().toISOString();
    const reason = input.reason?.trim();

    if (!reason) {
        throw new Error("A room removal reason is required.");
    }

    const { data: room, error: roomError } = await supabase
        .from("rooms")
        .select("*")
        .eq("id", input.roomId)
        .eq("company_id", companyId)
        .maybeSingle();
    if (roomError) throw new Error(roomError.message);
    if (!room) throw new Error("Room not found.");
    if (room.landlord_id !== input.landlordId) throw new Error("Room is not attached to the selected landlord.");

    const [tenants, leases, collections, promises, auditLogs] = await Promise.all([
        supabase.from("tenants").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("room_id", input.roomId),
        supabase.from("leases").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("room_id", input.roomId),
        supabase.from("collections").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("room_id", input.roomId),
        supabase.from("promises").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("room_id", input.roomId),
        supabase.from("audit_logs").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("entity_type", "room").eq("entity_id", input.roomId),
    ]);

    for (const result of [tenants, leases, collections, promises, auditLogs]) {
        if (result.error) throw new Error(result.error.message);
    }

    const historyCount = (tenants.count ?? 0) + (leases.count ?? 0) + (collections.count ?? 0) + (promises.count ?? 0) + (auditLogs.count ?? 0);
    if (historyCount === 0) {
        const { error } = await supabase.from("rooms").delete().eq("id", input.roomId).eq("company_id", companyId);
        if (error) throw new Error(error.message);

        await logUserAction({
            action: "landlord_room_deleted",
            entityType: "room",
            entityId: input.roomId,
            companyId,
            officeId: room.office_id,
            beforeData: jsonSafe(room),
            afterData: jsonSafe({ deleted: true, reason }),
        });

        revalidatePath("/office/landlords");
        revalidatePath("/office/admin");
        revalidatePath("/office/properties");
        revalidatePath("/office/dashboard");
        return { mode: "deleted" as const };
    }

    const { data: archivedRoom, error: archiveError } = await supabase
        .from("rooms")
        .update({
            landlord_id: null,
            monthly_rent: 0,
            outstanding_balance: 0,
            status: "archived",
            updated_at: now,
        })
        .eq("id", input.roomId)
        .eq("company_id", companyId)
        .select("*")
        .single();
    if (archiveError) throw new Error(archiveError.message);

    await supabase
        .from("leases")
        .update({ status: "terminated", end_date: new Date().toISOString().slice(0, 10), updated_at: now })
        .eq("company_id", companyId)
        .eq("room_id", input.roomId)
        .eq("status", "active");

    await logUserAction({
        action: "landlord_room_archived",
        entityType: "room",
        entityId: input.roomId,
        companyId,
        officeId: room.office_id,
        beforeData: jsonSafe({ room, historyCount }),
            afterData: jsonSafe({
                archivedRoom,
                reason,
                history: {
                    tenants: tenants.count ?? 0,
                    leases: leases.count ?? 0,
                    collections: collections.count ?? 0,
                    promises: promises.count ?? 0,
                    auditLogs: auditLogs.count ?? 0,
                },
            }),
    });

    revalidatePath("/office/landlords");
    revalidatePath("/office/admin");
    revalidatePath("/office/properties");
    revalidatePath("/office/dashboard");
    return { mode: "archived" as const };
}

async function resolveRoomProperty({
    companyId,
    input,
    landlordId,
    now,
    supabase,
}: {
    companyId: string;
    input: AddLandlordRoomInput;
    landlordId: string;
    now: string;
    supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
}) {
    if (input.propertyId) {
        const { data, error } = await supabase
            .from("properties")
            .select("*")
            .eq("id", input.propertyId)
            .eq("company_id", companyId)
            .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) throw new Error("Property/location not found.");
        return data;
    }

    const location = input.propertyLocation?.trim();
    if (!location) throw new Error("Property/location is required.");

    const { data: existing, error: existingError } = await supabase
        .from("properties")
        .select("*")
        .eq("company_id", companyId)
        .eq("office_id", input.officeId)
        .ilike("property_name", location)
        .limit(1);
    if (existingError) throw new Error(existingError.message);
    if (existing?.[0]) return existing[0];

    const { data, error } = await supabase
        .from("properties")
        .insert({
            company_id: companyId,
            created_at: now,
            landlord_id: landlordId,
            name: location,
            occupied_units: input.status === "occupied" ? 1 : 0,
            office_id: input.officeId,
            property_name: location,
            status: "active",
            total_units: 1,
            updated_at: now,
            vacant_units: input.status === "vacant" ? 1 : 0,
            village: location,
        })
        .select("*")
        .single();
    if (error) throw new Error(error.message);
    return data;
}

export async function generateLandlordSettlement(input: GenerateSettlementInput) {
    const context = await activeWriteContext();
    const landlord = await getLandlordInCompany(input.landlordId);
    const supabase = await createSupabaseServerClient();
    const db = supabase as unknown as LooseDb;
    const companyId = context.activeCompany!.id;
    const officeId = context.activeOffice!.id;
    const commissionRate = await resolveLandlordCommissionRate({
        db,
        companyId,
        landlord,
        requestedRate: input.managementFeeRate,
    });
    const commissionCalculationMode = parseCommissionCalculationMode(
        (landlord as typeof landlord & { commission_calculation_mode?: string | null }).commission_calculation_mode,
    );
    const settlementMonth = input.periodStart ? input.periodStart.slice(0, 7) : new Date().toISOString().slice(0, 7);

    const { data: properties } = await supabase
        .from("properties")
        .select("*")
        .eq("company_id", companyId)
        .eq("office_id", officeId)
        .eq("landlord_id", landlord.id);
    const propertyIds = (properties ?? []).map((property) => property.id);

    const [{ data: directRooms, error: directRoomsError }, propertyRoomsResult] = await Promise.all([
        supabase
            .from("rooms")
            .select("*")
            .eq("company_id", companyId)
            .eq("office_id", officeId)
            .eq("landlord_id", landlord.id),
        propertyIds.length
            ? supabase
                .from("rooms")
                .select("*")
                .eq("company_id", companyId)
                .eq("office_id", officeId)
                .in("property_id", propertyIds)
            : Promise.resolve({ data: [], error: null }),
    ]);
    if (directRoomsError) throw new Error(directRoomsError.message);
    if (propertyRoomsResult.error) throw new Error(propertyRoomsResult.error.message);

    const roomsById = new Map<string, Record<string, unknown>>();
    for (const room of [...(directRooms ?? []), ...(propertyRoomsResult.data ?? [])]) roomsById.set(room.id, room);
    const rooms = Array.from(roomsById.values());
    const roomIds = rooms.map((room) => String(room.id));

    const { data: activeLeases, error: leasesError } = roomIds.length
        ? await supabase
            .from("leases")
            .select("*")
            .eq("company_id", companyId)
            .eq("office_id", officeId)
            .eq("status", "active")
            .in("room_id", roomIds)
        : { data: [], error: null };
    if (leasesError) throw new Error(leasesError.message);

    const tenantIds = [...new Set((activeLeases ?? []).map((lease) => lease.tenant_id).filter(Boolean))];
    const { data: tenants, error: tenantsError } = tenantIds.length
        ? await supabase.from("tenants").select("*").eq("company_id", companyId).in("id", tenantIds)
        : { data: [], error: null };
    if (tenantsError) throw new Error(tenantsError.message);

    const leaseByRoomId = new Map((activeLeases ?? []).map((lease) => [lease.room_id, lease]));
    const tenantById = new Map((tenants ?? []).map((tenant) => [tenant.id, tenant]));
    const occupiedLines = rooms.flatMap((room) => {
        const lease = leaseByRoomId.get(String(room.id));
        const payable = getSettlementRoomPayableState({ room, hasLease: Boolean(lease) });
        if (!payable.payableThisMonth) return [];
        const tenant = lease ? tenantById.get(lease.tenant_id) : null;
        const monthlyRent = Number(lease?.monthly_rent ?? tenant?.monthly_rent ?? room.monthly_rent ?? 0);
        return [{
            amount: monthlyRent,
            company_id: companyId,
            description: `Occupied room payable: Room ${String(room.room_number ?? "Unnumbered")}${tenant?.full_name ? ` · ${tenant.full_name}` : ""}`,
            line_category: "occupied_room",
            is_payable: true,
            reason: "Occupied room - payable",
            month_applied: settlementMonth,
            property_id: room.property_id as string | null,
            room_id: room.id as string,
            source_id: room.id as string,
            source_type: "room_rent",
            tenant_id: tenant?.id ?? lease?.tenant_id ?? null,
            notes: payable.reason,
        }];
    });
    const vacantLines = rooms.flatMap((room) => {
        const payable = getSettlementRoomPayableState({ room, hasLease: leaseByRoomId.has(String(room.id)) });
        if (payable.payableThisMonth) return [];
        return [{
            amount: -Number(room.monthly_rent ?? 0),
            company_id: companyId,
            description: `Vacant room excluded: Room ${String(room.room_number ?? "Unnumbered")}`,
            line_category: "vacant_room",
            is_payable: false,
            reason: payable.reason,
            month_applied: settlementMonth,
            property_id: room.property_id as string | null,
            room_id: room.id as string,
            source_id: room.id as string,
            source_type: "vacant_room",
            tenant_id: null,
        }];
    });
    const vacantPortfolioGrossLines = rooms.flatMap((room) => {
        const payable = getSettlementRoomPayableState({ room, hasLease: leaseByRoomId.has(String(room.id)) });
        if (payable.payableThisMonth) return [];
        return [{
            amount: Number(room.monthly_rent ?? 0),
            company_id: companyId,
            description: `Landlord portfolio gross: vacant room ${String(room.room_number ?? "Unnumbered")}`,
            line_category: "portfolio_room_gross",
            is_payable: false,
            reason: payable.reason,
            month_applied: settlementMonth,
            property_id: room.property_id as string | null,
            room_id: room.id as string,
            source_id: room.id as string,
            source_type: "room_rent",
            tenant_id: null,
        }];
    });

    const expectedGrossRent = rooms.reduce((total, room) => total + Number(room.monthly_rent ?? 0), 0);
    const occupiedPayableRent = occupiedLines.reduce((total, line) => total + Number(line.amount ?? 0), 0);
    const emptyRoomDeductions = vacantLines.reduce((total, line) => total + Math.abs(Number(line.amount ?? 0)), 0);
    const commissionBaseAmount = commissionCalculationMode === "occupied_room_based" ? occupiedPayableRent : expectedGrossRent;
    const companyCommissionAmount = Math.round(commissionBaseAmount * (commissionRate / 100));
    const landlordGrossPayable = commissionCalculationMode === "occupied_room_based"
        ? Math.max(0, occupiedPayableRent - companyCommissionAmount)
        : Math.max(0, expectedGrossRent - companyCommissionAmount - emptyRoomDeductions);

    const { data: debtDeductions, error: debtDeductionsError } = await db
        .from("landlord_debt_deductions")
        .select("*")
        .eq("company_id", companyId)
        .eq("office_id", officeId)
        .eq("landlord_id", landlord.id);
    if (debtDeductionsError) throw new Error(debtDeductionsError.message);

    const pendingDeductions = ((debtDeductions ?? []) as Array<Record<string, unknown>>)
        .filter((deduction) => isRecoveryDeductionActiveForMonth(deduction, settlementMonth));
    const requestedRecoveryDeduction = pendingDeductions.reduce((total, deduction) => {
        const remaining = Number(deduction.amount ?? 0) - Number(deduction.applied_amount ?? 0);
        return total + Math.max(0, remaining);
    }, 0);
    const recoveryDeduction = Math.min(requestedRecoveryDeduction, landlordGrossPayable);
    const carriedForwardRecoveryBalance = Math.max(0, requestedRecoveryDeduction - recoveryDeduction);
    const activeAdvances = await getActiveLandlordAdvances({ db, companyId, officeId, landlordId: landlord.id });
    const requestedAdvanceDeduction = activeAdvances.reduce((total, advance) => total + scheduledAdvanceDeductionForMonth(advance, settlementMonth), 0);
    const payableAfterRecovery = Math.max(0, landlordGrossPayable - recoveryDeduction);
    const advanceDeduction = Math.min(requestedAdvanceDeduction, payableAfterRecovery);
    const carriedForwardAdvanceBalance = Math.max(0, requestedAdvanceDeduction - advanceDeduction);
    const deductions = companyCommissionAmount + emptyRoomDeductions + recoveryDeduction + advanceDeduction;
    const netPayable = Math.max(0, landlordGrossPayable - recoveryDeduction - advanceDeduction);
    const paymentStatus = netPayable <= 0 && (requestedRecoveryDeduction > 0 || requestedAdvanceDeduction > 0) ? "held" : "pending";

    const { data: period, error: periodError } = await supabase
        .from("landlord_settlement_periods")
        .insert({
            company_id: companyId,
            landlord_id: landlord.id,
            period_start: input.periodStart,
            period_end: input.periodEnd,
            status: "open",
        })
        .select("*")
        .single();
    if (periodError) throw new Error(periodError.message);

    const { data: settlement, error } = await db
        .from("landlord_settlements")
        .insert({
            company_id: companyId,
            office_id: officeId,
            deductions,
            gross_collections: expectedGrossRent,
            landlord_id: landlord.id,
            management_fees: companyCommissionAmount,
            net_payable: netPayable,
            settlement_period_id: period.id,
            status: "pending_approval",
            settlement_month: settlementMonth,
            occupied_rooms_count: occupiedLines.length,
            vacant_rooms_count: vacantLines.length,
            expected_gross_rent: expectedGrossRent,
            occupied_payable_rent: occupiedPayableRent,
            commission_base_amount: commissionBaseAmount,
            commission_calculation_mode: commissionCalculationMode,
            company_commission_rate: commissionRate,
            company_commission_amount: companyCommissionAmount,
            landlord_gross_payable: landlordGrossPayable,
            previous_unrecovered_debts: requestedRecoveryDeduction,
            empty_room_deductions: emptyRoomDeductions,
            vacated_tenant_debt_deductions: recoveryDeduction,
            carried_forward_recovery_balance: carriedForwardRecoveryBalance,
            landlord_advance_deductions: advanceDeduction,
            carried_forward_advance_balance: carriedForwardAdvanceBalance,
            prepared_by: context.profile?.id ?? context.authUser?.id ?? null,
            prepared_at: new Date().toISOString(),
            payment_status: paymentStatus,
            report_notes: commissionCalculationMode === "occupied_room_based"
                ? "Advance settlement draft generated using occupied-room-based commission. Vacant rooms are excluded before commission."
                : "Advance settlement draft generated using portfolio-based commission. Company commission is calculated from full portfolio gross before vacant-room deductions.",
        })
        .select("*")
        .single();
    if (error) throw new Error(error.message);

    await upsertLandlordMonthlyPayableFromSettlement({
        db,
        settlement,
        landlord,
        officeName: context.activeOffice?.office_name ?? context.activeOffice?.name ?? null,
        createdBy: context.profile?.id ?? context.authUser?.id ?? null,
    });

    const lines = [
        ...occupiedLines.map((line) => ({ ...line, settlement_id: String(settlement.id) })),
        ...vacantPortfolioGrossLines.map((line) => ({ ...line, settlement_id: String(settlement.id) })),
        ...vacantLines.map((line) => ({ ...line, settlement_id: String(settlement.id) })),
        {
            amount: -companyCommissionAmount,
            company_id: companyId,
            description: `Company percentage / commission (${commissionRate}%)`,
            line_category: "company_commission",
            is_payable: false,
            reason: "Company percentage/commission",
            month_applied: settlementMonth,
            property_id: null,
            room_id: null,
            settlement_id: String(settlement.id),
            source_id: String(settlement.id),
            source_type: "company_commission",
            tenant_id: null,
        },
        ...buildRecoverySettlementLines({
            deductions: pendingDeductions,
            recoveryDeduction,
            settlementId: String(settlement.id),
            companyId,
            settlementMonth,
        }),
        ...buildAdvanceSettlementLines({
            advances: activeAdvances,
            advanceDeduction,
            settlementId: String(settlement.id),
            companyId,
            settlementMonth,
        }),
    ];
    if (lines.length) {
        const { error: linesError } = await db.from("landlord_settlement_lines").insert(lines);
        if (linesError) throw new Error(linesError.message);
    }

    if (recoveryDeduction > 0) {
        await applyLandlordDebtDeductions({
            db,
            deductions: pendingDeductions,
            settlementId: String(settlement.id),
            recoveryDeduction,
        });
    }

    await logUserAction({
        action: "landlord_settlement_generated",
        entityType: "landlord_settlement",
        entityId: String(settlement.id),
        companyId,
        officeId,
        afterData: jsonSafe(settlement),
    });

    revalidatePath("/office/landlords");
    return settlement;
}

export async function runMonthlyLandlordPayableSnapshot(input: MonthlyLandlordPayableSnapshotInput = {}) {
    const context = await requirePermission("landlords.manage");
    if (!context.activeCompany?.id) {
        throw new Error("Active company is required.");
    }
    const supabase = await createSupabaseServerClient();
    const db = supabase as unknown as LooseDb;
    const companyId = context.activeCompany!.id;
    const settlementMonth = normalizeSettlementMonth(input.settlementMonth);
    const actorId = context.profile?.id ?? context.authUser?.id ?? null;
    const scopedOfficeIds = context.canAccessAllOffices || context.isCompanyAdmin
        ? null
        : context.activeOffice?.id
            ? [context.activeOffice.id]
            : [];

    if (scopedOfficeIds?.length === 0) {
        throw new Error("No accessible offices found for monthly snapshot.");
    }

    let officesQuery = db.from("offices").select("id,name,office_name").eq("company_id", companyId);
    let roomsQuery = db.from("rooms").select("id,company_id,office_id,landlord_id,monthly_rent,status,room_number").eq("company_id", companyId).not("landlord_id", "is", null);
    let advancesQuery = db.from("landlord_advances").select("*").eq("company_id", companyId);
    let debtsQuery = db.from("landlord_debt_deductions").select("*").eq("company_id", companyId);

    if (scopedOfficeIds) {
        officesQuery = officesQuery.in("id", scopedOfficeIds);
        roomsQuery = roomsQuery.in("office_id", scopedOfficeIds);
        advancesQuery = advancesQuery.in("office_id", scopedOfficeIds);
        debtsQuery = debtsQuery.in("office_id", scopedOfficeIds);
    }

    const [
        { data: officeRows, error: officesError },
        { data: landlordRows, error: landlordsError },
        { data: roomRows, error: roomsError },
        { data: settingRows, error: settingsError },
        { data: advanceRows, error: advancesError },
        { data: debtRows, error: debtsError },
    ] = await Promise.all([
        officesQuery,
        db.from("landlords").select("*").eq("company_id", companyId),
        roomsQuery,
        db.from("company_settings").select("*").eq("company_id", companyId).eq("key", "default_landlord_commission_rate"),
        advancesQuery,
        debtsQuery,
    ]);
    if (officesError) throw new Error(officesError.message);
    if (landlordsError) throw new Error(landlordsError.message);
    if (roomsError) throw new Error(roomsError.message);
    if (settingsError) throw new Error(settingsError.message);
    if (advancesError) throw new Error(advancesError.message);
    if (debtsError) throw new Error(debtsError.message);

    const officeNameById = new Map((officeRows ?? []).map((office: LooseRecord) => [
        String(office.id),
        String(office.office_name ?? office.name ?? "Office"),
    ]));
    const landlordById = new Map((landlordRows ?? []).map((landlord: LooseRecord) => [String(landlord.id), landlord]));
    const defaultCommissionRate = parseDefaultCommissionRate((settingRows ?? [])[0]?.value);
    const groupedRooms = new Map<string, LooseRecord[]>();
    for (const room of (roomRows ?? []) as LooseRecord[]) {
        const landlordId = String(room.landlord_id ?? "");
        const officeId = String(room.office_id ?? "");
        if (!landlordId || !officeId || isArchivedRoom(room)) continue;
        const key = `${officeId}:${landlordId}`;
        groupedRooms.set(key, [...(groupedRooms.get(key) ?? []), room]);
    }

    const results: Array<{ landlordId: string; officeId: string; status: "created" | "skipped" | "failed"; reason?: string }> = [];
    for (const [key, rooms] of groupedRooms) {
        const [officeId, landlordId] = key.split(":");
        const landlord = landlordById.get(landlordId);
        if (!landlord) {
            results.push({ landlordId, officeId, status: "failed", reason: "Landlord record not found." });
            continue;
        }

        try {
            const landlordRecord = landlord as LooseRecord;
            const fullRentRoll = rooms.reduce((total, room) => total + Number(room.monthly_rent ?? 0), 0);
            const occupiedPayableRent = rooms
                .filter((room) => !isVacantCommissionRoom(room))
                .reduce((total, room) => total + Number(room.monthly_rent ?? 0), 0);
            const vacantRoomDeductions = rooms
                .filter((room) => isVacantCommissionRoom(room))
                .reduce((total, room) => total + Number(room.monthly_rent ?? 0), 0);
            const commissionMode = parseCommissionCalculationMode(
                landlordRecord.commission_calculation_mode
                ?? parseCommissionMetadata(landlordRecord.commission_notes).commissionCalculationMode,
            );
            const commissionRate = landlordRecord.commission_rate !== null
                && landlordRecord.commission_rate !== undefined
                && Number.isFinite(Number(landlordRecord.commission_rate))
                ? Number(landlordRecord.commission_rate)
                : defaultCommissionRate;
            const commissionBase = commissionMode === "occupied_room_based" ? occupiedPayableRent : fullRentRoll;
            const commissionAmount = Math.round(commissionBase * (commissionRate / 100));
            const landlordPortfolioNet = commissionMode === "occupied_room_based"
                ? Math.max(0, occupiedPayableRent - commissionAmount)
                : Math.max(0, fullRentRoll - commissionAmount - vacantRoomDeductions);
            const activeDebtDeductions = ((debtRows ?? []) as LooseRecord[])
                .filter((deduction) => String(deduction.office_id) === officeId)
                .filter((deduction) => String(deduction.landlord_id) === landlordId)
                .filter((deduction) => isRecoveryDeductionActiveForMonth(deduction, settlementMonth));
            const requestedRecovery = activeDebtDeductions.reduce((total, deduction) => {
                const remaining = Number(deduction.amount ?? 0) - Number(deduction.applied_amount ?? 0);
                return total + Math.max(0, remaining);
            }, 0);
            const recoveryDeduction = Math.min(requestedRecovery, landlordPortfolioNet);
            const activeAdvances = ((advanceRows ?? []) as LooseRecord[])
                .filter((advance) => String(advance.office_id) === officeId)
                .filter((advance) => String(advance.landlord_id) === landlordId)
                .filter((advance) => String(advance.status ?? "pending") !== "fully_deducted");
            const requestedAdvance = activeAdvances.reduce((total, advance) => total + scheduledAdvanceDeductionForMonth(advance, settlementMonth), 0);
            const advanceDeduction = Math.min(requestedAdvance, Math.max(0, landlordPortfolioNet - recoveryDeduction));
            const netPayable = Math.max(0, landlordPortfolioNet - recoveryDeduction - advanceDeduction);
            const existing = await db
                .from("landlord_monthly_payables")
                .select("reasons_notes")
                .eq("company_id", companyId)
                .eq("office_id", officeId)
                .eq("landlord_id", landlordId)
                .eq("settlement_month", settlementMonth)
                .neq("status", "archived")
                .maybeSingle!();
            if (existing.error) throw new Error(existing.error.message);
            const clearedMonth = extractPaymentMarkerFromNotes(existing.data?.reasons_notes)
                || await getImportedPaymentMarker({
                companyId,
                db,
                landlordId,
                officeId,
                settlementMonth,
            });
            const amountPaid = clearedMonth === "JUNE" ? netPayable : 0;
            const openingArrears = await getLandlordOpeningArrears({ db, companyId, officeId, landlordId, beforeMonth: settlementMonth });
            const totalDue = netPayable;
            const unpaidBalance = Math.max(0, netPayable - Math.min(amountPaid, netPayable));
            const overpaidAmount = Math.max(0, amountPaid - netPayable);

            const row = {
                company_id: companyId,
                office_id: officeId,
                landlord_id: landlordId,
                settlement_id: null,
                settlement_month: settlementMonth,
                month_key: settlementMonth,
                landlord_name: String(landlordRecord.full_name ?? landlordRecord.name ?? "Landlord"),
                office_name: officeNameById.get(officeId) ?? "Office",
                full_rent_roll: fullRentRoll,
                commission_mode: commissionMode,
                commission_percentage: commissionRate,
                commission_amount: commissionAmount,
                vacant_room_deductions: vacantRoomDeductions,
                vacated_tenant_debt_deductions: recoveryDeduction,
                advance_deductions: advanceDeduction,
                other_deductions: 0,
                net_payable: netPayable,
                opening_arrears: openingArrears,
                monthly_net_payable: netPayable,
                total_due: totalDue,
                amount_paid: amountPaid,
                unpaid_balance: unpaidBalance,
                overpaid_amount: overpaidAmount,
                advance_created: overpaidAmount,
                closing_arrears: unpaidBalance,
                status: overpaidAmount > 0 ? "overpaid" : unpaidBalance > 0 ? "unpaid" : "paid",
                reasons_notes: clearedMonth
                    ? `cleared_month=${clearedMonth}; Live monthly snapshot from ${rooms.length} landlord room(s). Recovery pending ${requestedRecovery}. Advance pending ${requestedAdvance}.`
                    : `Live monthly snapshot from ${rooms.length} landlord room(s). Recovery pending ${requestedRecovery}. Advance pending ${requestedAdvance}.`,
                created_by: actorId,
                updated_at: new Date().toISOString(),
            };

            const upsert = await db
                .from("landlord_monthly_payables")
                .upsert(row, { onConflict: "company_id,office_id,landlord_id,settlement_month" });
            if (upsert.error) throw new Error(upsert.error.message);
            results.push({ landlordId, officeId, status: "created" });
        } catch (error) {
            results.push({ landlordId, officeId, status: "failed", reason: error instanceof Error ? error.message : "Monthly payable snapshot failed." });
        }
    }

    await logUserAction({
        action: "monthly_landlord_payable_snapshot_run",
        entityType: "landlord_monthly_payables",
        companyId,
        officeId: context.activeOffice?.id ?? null,
        afterData: jsonSafe({
            settlementMonth,
            landlordsProcessed: results.length,
            created: results.filter((result) => result.status === "created").length,
            skipped: results.filter((result) => result.status === "skipped").length,
            failed: results.filter((result) => result.status === "failed").length,
        }),
    });

    revalidatePath("/office/landlords");
    revalidatePath("/office/admin");
    revalidatePath("/office/spreadsheet");
    revalidatePath("/office/landlord-payments");
    return {
        settlementMonth,
        results,
        created: results.filter((result) => result.status === "created").length,
        skipped: results.filter((result) => result.status === "skipped").length,
        failed: results.filter((result) => result.status === "failed").length,
    };
}

async function resolveLandlordCommissionRate({
    companyId,
    db,
    landlord,
    requestedRate,
}: {
    companyId: string;
    db: LooseDb;
    landlord: Record<string, unknown>;
    requestedRate?: number;
}) {
    if (typeof requestedRate === "number" && Number.isFinite(requestedRate)) return requestedRate;

    const landlordRate = Number(landlord.commission_rate ?? NaN);
    if (Number.isFinite(landlordRate)) return landlordRate;

    const { data: settings, error } = await db
        .from("company_settings")
        .select("*")
        .eq("company_id", companyId)
        .eq("key", "default_landlord_commission_rate");
    if (error) throw new Error(error.message);

    const value = settings?.[0]?.value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
    if (value && typeof value === "object" && "rate" in value && Number.isFinite(Number((value as { rate?: unknown }).rate))) {
        return Number((value as { rate?: unknown }).rate);
    }
    return 10;
}

function parseCommissionCalculationMode(value: unknown): LandlordCommissionCalculationMode {
    return value === "occupied_room_based" ? "occupied_room_based" : "portfolio_based";
}

function parseCommissionMetadata(value: unknown) {
    if (typeof value !== "string" || !value.trim()) {
        return { commissionCalculationMode: null as LandlordCommissionCalculationMode | null };
    }
    try {
        const parsed = JSON.parse(value) as Record<string, unknown>;
        return {
            commissionCalculationMode: parsed.commission_calculation_mode === "occupied_room_based"
                ? "occupied_room_based" as const
                : parsed.commission_calculation_mode === "portfolio_based"
                    ? "portfolio_based" as const
                    : null,
        };
    } catch {
        return { commissionCalculationMode: null as LandlordCommissionCalculationMode | null };
    }
}

function buildCommissionNotes(input: {
    existing: string | null;
    calculationMode: LandlordCommissionCalculationMode;
    inputMode: "percentage" | "landlord_net_amount";
    landlordNetPayableOverride: number | null;
    note: string | null;
}) {
    let existingNote = input.existing ?? "";
    try {
        const parsed = existingNote ? JSON.parse(existingNote) as Record<string, unknown> : {};
        existingNote = typeof parsed.note === "string" ? parsed.note : "";
    } catch {
        // Preserve plain-text notes from older records.
    }
    return JSON.stringify({
        note: input.note ?? existingNote,
        commission_calculation_mode: input.calculationMode,
        commission_input_mode: input.inputMode,
        landlord_net_payable_override: input.landlordNetPayableOverride,
        updated_at: new Date().toISOString(),
    });
}

function isMissingColumnError(error: unknown) {
    if (!error || typeof error !== "object") return false;
    const record = error as { code?: string; message?: string };
    return record.code === "42703" || record.code === "PGRST204" || /column|schema cache/i.test(record.message ?? "");
}

function isVacantCommissionRoom(room: LooseRecord) {
    const status = String(room.status ?? "").toLowerCase();
    return status.includes("vacant") || status.includes("empty");
}

function isArchivedRoom(room: LooseRecord) {
    const status = String(room.status ?? "").toLowerCase();
    return ["archived", "inactive", "deleted", "removed"].some((value) => status.includes(value));
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

function extractPaymentMarkerFromNotes(value: unknown) {
    const marker = /cleared_month=(MAY|JUNE)/i.exec(String(value ?? ""))?.[1];
    return marker ? marker.toUpperCase() : "";
}

function normalizePaymentMarker(value: unknown) {
    const marker = String(value ?? "").trim().toUpperCase();
    return marker === "MAY" || marker === "JUNE" ? marker : "";
}

async function getImportedPaymentMarker({
    companyId,
    db,
    landlordId,
    officeId,
    settlementMonth,
}: {
    companyId: string;
    db: LooseDb;
    landlordId: string;
    officeId: string;
    settlementMonth: string;
}) {
    const result = await db
        .from("landlord_payment_source_records")
        .select("paid_unpaid_marker, imported_at, created_at")
        .eq("company_id", companyId)
        .eq("office_id", officeId)
        .eq("landlord_id", landlordId)
        .eq("settlement_month", settlementMonth)
        .eq("active", true)
        .order("imported_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(1);
    if (result.error) throw new Error(result.error.message);
    return normalizePaymentMarker((result.data ?? [])[0]?.paid_unpaid_marker);
}

export async function markLandlordSettlementPaid(input: {
    settlementId: string;
    paymentMethod?: string;
    reference?: string;
}) {
    const context = await activeWriteContext();
    const supabase = await createSupabaseServerClient();
    const db = supabase as unknown as LooseDb;
    const companyId = context.activeCompany!.id;
    const officeId = context.activeOffice!.id;

    const { data: settlement, error: settlementError } = await db
        .from("landlord_settlements")
        .select("*")
        .eq("id", input.settlementId)
        .eq("company_id", companyId)
        .maybeSingle!();
    if (settlementError) throw new Error(settlementError.message);
    if (!settlement) throw new Error("Settlement not found.");

    const amount = Math.max(0, Number(settlement.net_payable ?? 0));
    if (amount <= 0) {
        const heldUpdate = await db
            .from("landlord_settlements")
            .update({
                payment_status: "held",
                status: "held_for_recovery",
                updated_at: new Date().toISOString(),
            })
            .eq("id", input.settlementId);
        if (heldUpdate.error) throw new Error(heldUpdate.error.message);
    } else {
        const { data: payment, error: paymentError } = await supabase
            .from("landlord_payments")
            .insert({
                amount,
                company_id: companyId,
                created_by: context.profile?.id ?? context.authUser?.id ?? null,
                landlord_id: settlement.landlord_id as string | null,
                office_id: officeId,
                paid_at: new Date().toISOString(),
                payment_method: input.paymentMethod ?? "manual",
                payout_reference: input.reference ?? `LND-${Date.now()}`,
                settlement_id: input.settlementId,
                status: "paid",
            })
            .select("*")
            .single();
        if (paymentError) throw new Error(paymentError.message);

        const settlementUpdate = await db
            .from("landlord_settlements")
            .update({
                payment_status: "paid",
                status: "paid",
                updated_at: new Date().toISOString(),
            })
            .eq("id", input.settlementId);
        if (settlementUpdate.error) throw new Error(settlementUpdate.error.message);

        await applyLandlordMonthlyPayablePayment({
            db,
            companyId,
            officeId,
            landlordId: String(settlement.landlord_id ?? ""),
            settlementId: input.settlementId,
            amount,
            paymentMethod: input.paymentMethod ?? "manual",
            reference: input.reference ?? payment.payout_reference ?? null,
            notes: "Paid from settlement ledger.",
            paidBy: context.profile?.id ?? context.authUser?.id ?? null,
        });

        await logUserAction({
            action: "landlord_marked_paid",
            entityType: "landlord_payment",
            entityId: payment.id,
            companyId,
            officeId,
            afterData: jsonSafe({ payment, settlement }),
        });
    }

    const advanceDeduction = Math.max(0, Number(settlement.landlord_advance_deductions ?? 0));
    if (advanceDeduction > 0 && settlement.landlord_id) {
        const activeAdvances = await getActiveLandlordAdvances({
            db,
            companyId,
            officeId,
            landlordId: String(settlement.landlord_id),
        });
        await applyLandlordAdvanceDeductions({
            db,
            advances: activeAdvances,
            deductionAmount: advanceDeduction,
            companyId,
            officeId,
            landlordId: String(settlement.landlord_id),
            settlementId: input.settlementId,
            settlementMonth: String(settlement.settlement_month ?? new Date().toISOString().slice(0, 10)),
            createdBy: context.profile?.id ?? context.authUser?.id ?? null,
        });
        await logUserAction({
            action: "landlord_advance_deducted_from_settlement",
            entityType: "landlord_settlement",
            entityId: input.settlementId,
            companyId,
            officeId,
            afterData: jsonSafe({ settlement_id: input.settlementId, advance_deduction: advanceDeduction }),
        });
    }

    revalidatePath("/office/landlords");
    revalidatePath("/office/spreadsheet");
    revalidatePath("/office/admin");
    return { ok: true };
}

export async function markLandlordMonthlyPayablePaid(input: {
    monthlyPayableId: string;
    amount: number;
    paidAt?: string;
    paymentMethod?: string;
    paymentDetailId?: string;
    reference?: string;
    notes?: string;
}) {
    const context = await activeWriteContext();
    const supabase = await createSupabaseServerClient();
    const db = supabase as unknown as LooseDb;
    const companyId = context.activeCompany!.id;
    const officeId = context.activeOffice!.id;
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid landlord payment amount.");
    const paidAt = normalizePaymentDateTime(input.paidAt);

    const { data: payable, error: payableError } = await db
        .from("landlord_monthly_payables")
        .select("*")
        .eq("id", input.monthlyPayableId)
        .eq("company_id", companyId)
        .maybeSingle!();
    if (payableError) throw new Error(payableError.message);
    if (!payable) throw new Error("Monthly payable record not found.");
    if (String(payable.office_id) !== officeId && !context.canAccessAllOffices && !context.isCompanyAdmin) {
        throw new Error("You can only pay landlord records in your active office.");
    }
    const paymentMethod = input.paymentMethod ?? "manual";
    if (paymentMethod === "mobile_money" || paymentMethod === "bank") {
        const approvedDetail = await getApprovedLandlordPaymentDetail({
            companyId,
            db,
            detailId: input.paymentDetailId,
            landlordId: String(payable.landlord_id),
        });
        if (!approvedDetail) throw new Error("No approved payment details found. Submit payment details for Admin approval before non-cash payment.");
        if (String(approvedDetail.payment_method) !== paymentMethod) {
            throw new Error(`Selected approved landlord payment method is ${String(approvedDetail.payment_method).replaceAll("_", " ")}. Choose a saved ${paymentMethod.replaceAll("_", " ")} method or request new details.`);
        }
    }

    const reconciledPayable = await reconcileLandlordPayableWithLiveNet({
        companyId,
        db,
        row: payable as LooseRecord,
        settlementMonth: normalizeSettlementMonth(payable.settlement_month ?? payable.month_key ?? input.paidAt),
    }) as LooseRecord;

    const allocation = await allocateLandlordPaymentAcrossLedger({
        db,
        companyId,
        officeId: String(reconciledPayable.office_id ?? payable.office_id),
        landlordId: String(reconciledPayable.landlord_id ?? payable.landlord_id),
        startingMonthlyPayableId: input.monthlyPayableId,
        amount,
        paymentMethod,
        reference: input.reference ?? `LMP-${Date.now()}`,
        notes: input.notes ?? null,
        paidBy: context.profile?.id ?? context.authUser?.id ?? null,
        paidAt,
    });
    if (allocation.appliedAmount <= 0 && allocation.advanceCreated <= 0) throw new Error("No open landlord payable or overpayment target was found.");

    const { data: payment, error: paymentError } = await supabase
        .from("landlord_payments")
        .insert({
            amount,
            company_id: companyId,
            created_by: context.profile?.id ?? context.authUser?.id ?? null,
            landlord_id: (reconciledPayable.landlord_id ?? payable.landlord_id) as string | null,
            office_id: (reconciledPayable.office_id ?? payable.office_id) as string | null,
            paid_at: paidAt,
            payment_method: paymentMethod,
            payout_reference: input.reference ?? `LMP-${Date.now()}`,
            settlement_id: (reconciledPayable.settlement_id ?? payable.settlement_id) as string | null,
            status: allocation.advanceCreated > 0 ? "overpaid" : allocation.remainingBalance > 0 ? "partial" : "paid",
        })
        .select("*")
        .single();
    if (paymentError) throw new Error(paymentError.message);

    await logUserAction({
        action: "landlord_monthly_payable_payment_allocated",
        entityType: "landlord_monthly_payable",
        entityId: input.monthlyPayableId,
        companyId,
        officeId: String(reconciledPayable.office_id ?? payable.office_id),
        beforeData: jsonSafe(payable),
        afterData: jsonSafe({ payment, allocation }),
    });

    revalidatePath("/office/landlords");
    revalidatePath("/office/spreadsheet");
    revalidatePath("/office/admin");
    revalidatePath("/office/landlord-payments");
    revalidatePath("/office/dashboard");
    revalidatePath("/office");
    revalidatePath("/office/ceo");
    revalidatePath("/office/reports");
    return { ok: true, amount, appliedAmount: allocation.appliedAmount, advanceCreated: allocation.advanceCreated, remainingBalance: allocation.remainingBalance };
}

export async function submitLandlordPaymentDetails(input: LandlordPaymentDetailsInput) {
    const context = await activeWriteContext();
    const supabase = await createSupabaseServerClient();
    const db = supabase as unknown as LooseDb;
    const companyId = context.activeCompany!.id;
    const officeId = context.activeOffice!.id;
    const landlordId = input.landlordId?.trim();
    if (!landlordId) throw new Error("Select landlord.");
    const method = cleanPaymentMethod(input.paymentMethod);
    validatePaymentDetailPayload(method, input);

    const { data: landlord, error: landlordError } = await db
        .from("landlords")
        .select("id, full_name")
        .eq("company_id", companyId)
        .eq("id", landlordId)
        .maybeSingle();
    if (landlordError) throw new Error(landlordError.message);
    if (!landlord) throw new Error("Landlord not found.");

    const isDirectAdmin = context.isCompanyAdmin && !context.isOfficeMode;
    const now = new Date().toISOString();
    const wantsDefault = Boolean(input.isDefault);
    if (isDirectAdmin && wantsDefault) {
        await unsetDefaultPaymentDetails({ companyId, db, landlordId });
    }
    const { data, error } = await db
        .from("landlord_payment_details")
        .insert({
            account_name: normalizedAccountName(method, input),
            account_number: normalizedAccountNumber(method, input),
            bank_account_name: input.bankAccountName || null,
            bank_account_number: input.bankAccountNumber || null,
            bank_name: input.bankName || null,
            branch: input.branch || null,
            company_id: companyId,
            is_active: isDirectAdmin,
            is_default: isDirectAdmin ? wantsDefault : false,
            landlord_id: landlordId,
            label: input.label || defaultPaymentDetailLabel(method, input),
            mobile_money_account_name: input.mobileMoneyAccountName || null,
            mobile_money_number: input.mobileMoneyNumber || null,
            mobile_money_provider: input.mobileMoneyProvider || null,
            notes: input.notes || null,
            office_id: officeId,
            payment_method: method,
            provider: normalizedProvider(method, input),
            requested_by: context.profile?.id ?? context.authUser?.id ?? null,
            approved_by: isDirectAdmin ? context.profile?.id ?? context.authUser?.id ?? null : null,
            approved_at: isDirectAdmin ? now : null,
            admin_comment: isDirectAdmin ? input.adminComment || "Admin direct approval" : null,
            status: isDirectAdmin ? "approved" : "pending",
        })
        .select("*")
        .single();
    if (error) throw new Error(error.message);

    await createNotificationWithEmail(db, {
        action_url: "/office/notifications",
        channel: "in_app",
        company_id: companyId,
        delivery_status: "pending",
        entity_id: data.id,
        entity_type: "landlord_payment_detail",
        is_read: false,
        message: isDirectAdmin
            ? `Admin updated approved payment details for ${landlord.full_name ?? "Landlord"}.`
            : `Payment detail approval requested for ${landlord.full_name ?? "Landlord"}.`,
        office_id: officeId,
        recipient_type: isDirectAdmin ? "office" : "admin",
        severity: isDirectAdmin ? "success" : "warning",
        title: isDirectAdmin ? "Landlord payment details approved" : "Landlord payment details pending approval",
    });
    await logUserAction({
        action: isDirectAdmin ? "landlord_payment_details_admin_approved" : "landlord_payment_details_requested",
        entityType: "landlord_payment_detail",
        entityId: data.id,
        companyId,
        officeId,
        afterData: jsonSafe(data),
    });
    revalidateLandlordPaymentDetailsSurfaces();
    return data;
}

export async function decideLandlordPaymentDetails(input: { detailId: string; decision: "approved" | "rejected"; comment?: string }) {
    const context = await activeAdminWriteContext();
    const supabase = await createSupabaseServerClient();
    const db = supabase as unknown as LooseDb;
    const companyId = context.activeCompany!.id;
    const detailId = input.detailId?.trim();
    if (!detailId) throw new Error("Payment detail request is required.");
    const { data: detail, error: detailError } = await db
        .from("landlord_payment_details")
        .select("*")
        .eq("company_id", companyId)
        .eq("id", detailId)
        .maybeSingle();
    if (detailError) throw new Error(detailError.message);
    if (!detail) throw new Error("Payment detail request not found.");
    if (String(detail.status) !== "pending") throw new Error("This payment detail request has already been reviewed.");
    const now = new Date().toISOString();
    if (input.decision === "rejected") {
        const { data, error } = await db
            .from("landlord_payment_details")
            .update({
                admin_comment: input.comment || null,
                approved_by: context.profile?.id ?? context.authUser?.id ?? null,
                status: "rejected",
                updated_at: now,
            })
            .eq("id", detailId)
            .select("*")
            .single();
        if (error) throw new Error(error.message);
        await notifyPaymentDetailDecision(db, { companyId, detail: data, title: "Landlord payment details rejected", message: input.comment || "Admin rejected landlord payment details.", severity: "error" });
        await logUserAction({ action: "landlord_payment_details_rejected", entityType: "landlord_payment_detail", entityId: detailId, companyId, officeId: String(detail.office_id), beforeData: jsonSafe(detail), afterData: jsonSafe(data) });
        revalidateLandlordPaymentDetailsSurfaces();
        return data;
    }
    if (Boolean(detail.is_default)) {
        await unsetDefaultPaymentDetails({ companyId, db, landlordId: String(detail.landlord_id) });
    }
    const { data, error } = await db
        .from("landlord_payment_details")
        .update({
            admin_comment: input.comment || null,
            approved_at: now,
            approved_by: context.profile?.id ?? context.authUser?.id ?? null,
            is_active: true,
            is_default: Boolean(detail.is_default),
            status: "approved",
            updated_at: now,
        })
        .eq("id", detailId)
        .select("*")
        .single();
    if (error) throw new Error(error.message);
    await notifyPaymentDetailDecision(db, { companyId, detail: data, title: "Landlord payment details approved", message: "Admin approved landlord payment details.", severity: "success" });
    await logUserAction({ action: "landlord_payment_details_approved", entityType: "landlord_payment_detail", entityId: detailId, companyId, officeId: String(detail.office_id), beforeData: jsonSafe(detail), afterData: jsonSafe(data) });
    revalidateLandlordPaymentDetailsSurfaces();
    return data;
}

function normalizePaymentDateTime(value: string | null | undefined) {
    if (!value) return new Date().toISOString();
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T12:00:00.000Z`;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) throw new Error("Enter a valid landlord payment date.");
    return parsed.toISOString();
}

function validatePaymentDetailPayload(method: "cash" | "mobile_money" | "bank", input: LandlordPaymentDetailsInput) {
    if (method === "mobile_money") {
        if (!input.mobileMoneyNumber?.trim()) throw new Error("Mobile money number is required.");
        if (!input.mobileMoneyAccountName?.trim()) throw new Error("Mobile money account name is required.");
    }
    if (method === "bank") {
        if (!input.bankName?.trim()) throw new Error("Bank name is required.");
        if (!input.bankAccountNumber?.trim()) throw new Error("Bank account number is required.");
        if (!input.bankAccountName?.trim()) throw new Error("Bank account name is required.");
    }
}

export async function setDefaultLandlordPaymentDetail(input: { detailId: string }) {
    const context = await activeAdminWriteContext();
    const supabase = await createSupabaseServerClient();
    const db = supabase as unknown as LooseDb;
    const companyId = context.activeCompany!.id;
    const detailId = input.detailId?.trim();
    if (!detailId) throw new Error("Payment method is required.");
    const { data: detail, error: detailError } = await db
        .from("landlord_payment_details")
        .select("*")
        .eq("company_id", companyId)
        .eq("id", detailId)
        .maybeSingle();
    if (detailError) throw new Error(detailError.message);
    if (!detail || String(detail.status) !== "approved" || !detail.is_active) throw new Error("Only approved active payment methods can be default.");
    await unsetDefaultPaymentDetails({ companyId, db, landlordId: String(detail.landlord_id) });
    const { data, error } = await db.from("landlord_payment_details").update({ is_default: true, updated_at: new Date().toISOString() }).eq("id", detailId).select("*").single();
    if (error) throw new Error(error.message);
    await logUserAction({ action: "landlord_payment_details_default_set", entityType: "landlord_payment_detail", entityId: detailId, companyId, officeId: String(detail.office_id), beforeData: jsonSafe(detail), afterData: jsonSafe(data) });
    revalidateLandlordPaymentDetailsSurfaces();
    return data;
}

export async function archiveLandlordPaymentDetail(input: { detailId: string }) {
    const context = await activeAdminWriteContext();
    const supabase = await createSupabaseServerClient();
    const db = supabase as unknown as LooseDb;
    const companyId = context.activeCompany!.id;
    const detailId = input.detailId?.trim();
    if (!detailId) throw new Error("Payment method is required.");
    const { data: detail, error: detailError } = await db
        .from("landlord_payment_details")
        .select("*")
        .eq("company_id", companyId)
        .eq("id", detailId)
        .maybeSingle();
    if (detailError) throw new Error(detailError.message);
    if (!detail) throw new Error("Payment method not found.");
    const { error } = await db
        .from("landlord_payment_details")
        .update({ is_active: false, is_default: false, status: "archived", updated_at: new Date().toISOString() })
        .eq("id", detailId);
    if (error) throw new Error(error.message);
    await logUserAction({ action: "landlord_payment_details_archived", entityType: "landlord_payment_detail", entityId: detailId, companyId, officeId: String(detail.office_id), beforeData: jsonSafe(detail), afterData: jsonSafe({ status: "archived", is_active: false }) });
    revalidateLandlordPaymentDetailsSurfaces();
}

async function unsetDefaultPaymentDetails({ companyId, db, landlordId }: { companyId: string; db: LooseDb; landlordId: string }) {
    const { error } = await db
        .from("landlord_payment_details")
        .update({ is_default: false, updated_at: new Date().toISOString() })
        .eq("company_id", companyId)
        .eq("landlord_id", landlordId)
        .eq("is_default", true);
    if (error) throw new Error(error.message);
}

async function getApprovedLandlordPaymentDetail({ companyId, db, detailId, landlordId }: { companyId: string; db: LooseDb; detailId?: string; landlordId: string }) {
    let query = db
        .from("landlord_payment_details")
        .select("*")
        .eq("company_id", companyId)
        .eq("landlord_id", landlordId)
        .eq("status", "approved")
        .eq("is_active", true);
    if (detailId) query = query.eq("id", detailId);
    else query = query.eq("is_default", true);
    const { data, error } = await query.maybeSingle();
    if (error) {
        if (/does not exist|schema cache|Could not find/i.test(error.message ?? "")) return null;
        throw new Error(error.message);
    }
    return data as Record<string, unknown> | null;
}

function normalizedProvider(method: "cash" | "mobile_money" | "bank", input: LandlordPaymentDetailsInput) {
    if (input.provider?.trim()) return input.provider.trim();
    if (method === "mobile_money") return input.mobileMoneyProvider?.trim() || null;
    if (method === "bank") return input.bankName?.trim() || null;
    return "Cash";
}

function normalizedAccountName(method: "cash" | "mobile_money" | "bank", input: LandlordPaymentDetailsInput) {
    if (input.accountName?.trim()) return input.accountName.trim();
    if (method === "mobile_money") return input.mobileMoneyAccountName?.trim() || null;
    if (method === "bank") return input.bankAccountName?.trim() || null;
    return null;
}

function normalizedAccountNumber(method: "cash" | "mobile_money" | "bank", input: LandlordPaymentDetailsInput) {
    if (input.accountNumber?.trim()) return input.accountNumber.trim();
    if (method === "mobile_money") return input.mobileMoneyNumber?.trim() || null;
    if (method === "bank") return input.bankAccountNumber?.trim() || null;
    return null;
}

function defaultPaymentDetailLabel(method: "cash" | "mobile_money" | "bank", input: LandlordPaymentDetailsInput) {
    if (method === "mobile_money") return `${input.mobileMoneyProvider || "Mobile Money"} ${input.mobileMoneyAccountName || "Number"}`.trim();
    if (method === "bank") return `${input.bankName || "Bank"} Account`.trim();
    return "Cash";
}

async function notifyPaymentDetailDecision(db: LooseDb, input: { companyId: string; detail: Record<string, unknown>; title: string; message: string; severity: string }) {
    await createNotificationWithEmail(db, {
        action_url: "/office/landlords",
        channel: "in_app",
        company_id: input.companyId,
        delivery_status: "pending",
        entity_id: input.detail.id ? String(input.detail.id) : null,
        entity_type: "landlord_payment_detail",
        is_read: false,
        message: input.message,
        office_id: input.detail.office_id ? String(input.detail.office_id) : null,
        recipient_type: "office",
        severity: input.severity,
        title: input.title,
    });
}

type LooseDb = {
    from: (table: string) => any;
};

type LooseRecord = Record<string, unknown>;

type QueryBuilder = {
    eq: (column: string, value: string) => QueryBuilder;
    maybeSingle?: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
} & Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;

async function getActiveLandlordAdvances({
    db,
    companyId,
    officeId,
    landlordId,
}: {
    db: LooseDb;
    companyId: string;
    officeId: string;
    landlordId: string;
}) {
    const { data, error } = await db
        .from("landlord_advances")
        .select("*")
        .eq("company_id", companyId)
        .eq("office_id", officeId)
        .eq("landlord_id", landlordId);
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<Record<string, unknown>>)
        .filter((advance) => isActiveLandlordAdvance(advance));
}

async function getLandlordOpeningArrears({
    db,
    companyId,
    officeId,
    landlordId,
    beforeMonth,
}: {
    db: LooseDb;
    companyId: string;
    officeId: string;
    landlordId: string;
    beforeMonth: string;
}) {
    const { data, error } = await db
        .from("landlord_monthly_payables")
        .select("unpaid_balance,monthly_net_payable,net_payable,total_due,opening_arrears,amount_paid,settlement_month")
        .eq("company_id", companyId)
        .eq("office_id", officeId)
        .eq("landlord_id", landlordId)
        .neq("status", "archived")
        .lt("settlement_month", beforeMonth);
    if (error) throw new Error(error.message);
    return ((data ?? []) as LooseRecord[]).reduce((total, row) => total + monthOnlyPayableBalance(row), 0);
}

function monthOnlyPayableBalance(row: LooseRecord) {
    return landlordMonthlyUnpaid(row);
}

function buildAdvanceSettlementLines({
    advances,
    advanceDeduction,
    settlementId,
    companyId,
    settlementMonth,
}: {
    advances: Array<Record<string, unknown>>;
    advanceDeduction: number;
    settlementId: string;
    companyId: string;
    settlementMonth: string;
}) {
    const lines = [];
    let remaining = advanceDeduction;
    for (const advance of advances) {
        if (remaining <= 0) break;
        const available = landlordAdvanceRemaining(advance);
        const applied = Math.min(available, remaining);
        if (applied <= 0) continue;
        remaining -= applied;
        lines.push({
            amount: -applied,
            company_id: companyId,
            description: `Landlord advance deduction${advance.reason ? `: ${advance.reason}` : ""}`,
            line_category: "landlord_advance_deduction",
            is_payable: false,
            reason: "Landlord advance recovered from settlement",
            month_applied: settlementMonth,
            property_id: null,
            room_id: null,
            settlement_id: settlementId,
            source_id: String(advance.id),
            source_type: "landlord_advance",
            tenant_id: null,
        });
    }
    return lines;
}

function buildRecoverySettlementLines({
    deductions,
    recoveryDeduction,
    settlementId,
    companyId,
    settlementMonth,
}: {
    deductions: Array<Record<string, unknown>>;
    recoveryDeduction: number;
    settlementId: string;
    companyId: string;
    settlementMonth: string;
}) {
    const lines = [];
    let remaining = recoveryDeduction;
    for (const deduction of deductions) {
        if (remaining <= 0) break;
        const available = Math.max(0, Number(deduction.amount ?? 0) - Number(deduction.applied_amount ?? 0));
        const applied = Math.min(available, remaining);
        if (applied <= 0) continue;
        remaining -= applied;
        lines.push({
            amount: -applied,
            company_id: companyId,
            description: `Vacated tenant debt recovery: ${deduction.tenant_name ?? "tenant"} ${deduction.room_number ? `· Room ${deduction.room_number}` : ""} · outstanding ${Math.round(available).toLocaleString("en-UG")} · deducted ${Math.round(applied).toLocaleString("en-UG")}`,
            line_category: "vacated_tenant_debt",
            is_payable: false,
            reason: deduction.reason ?? "Tenant vacated with unpaid balance; deduct full frozen outstanding balance from landlord payable",
            month_applied: settlementMonth,
            property_id: deduction.property_id as string | null,
            room_id: deduction.room_id as string | null,
            settlement_id: settlementId,
            source_id: deduction.vacated_tenant_debt_id as string,
            source_type: "vacated_tenant_debt",
            tenant_id: deduction.tenant_id as string | null,
        });
    }
    return lines;
}

async function applyLandlordDebtDeductions({
    db,
    deductions,
    settlementId,
    recoveryDeduction,
}: {
    db: {
        from: (table: string) => {
            select: (columns: string) => {
                eq: (column: string, value: string) => {
                    maybeSingle?: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
                };
            };
            update: (values: Record<string, unknown>) => {
                eq: (column: string, value: string) => Promise<{ data: unknown; error: { message: string } | null }>;
            };
        };
    };
    deductions: Array<Record<string, unknown>>;
    settlementId: string;
    recoveryDeduction: number;
}) {
    let remaining = recoveryDeduction;
    for (const deduction of deductions) {
        if (remaining <= 0) break;
        const deductionAmount = Number(deduction.amount ?? 0);
        const alreadyApplied = Number(deduction.applied_amount ?? 0);
        const available = Math.max(0, deductionAmount - alreadyApplied);
        const applied = Math.min(available, remaining);
        if (applied <= 0) continue;
        remaining -= applied;

        const nextApplied = alreadyApplied + applied;
        const deductionStatus = nextApplied >= deductionAmount ? "applied" : "partially_applied";
        const deductionUpdate = await db
            .from("landlord_debt_deductions")
            .update({
                applied_amount: nextApplied,
                carried_forward_amount: Math.max(0, deductionAmount - nextApplied),
                status: deductionStatus,
                settlement_id: settlementId,
                applied_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq("id", String(deduction.id));
        if (deductionUpdate.error) throw new Error(deductionUpdate.error.message);

        const debtQuery = db
            .from("vacated_tenant_debts")
            .select("*")
            .eq("id", String(deduction.vacated_tenant_debt_id));
        const debtResult = await debtQuery.maybeSingle?.();
        if (debtResult?.error) throw new Error(debtResult.error.message);
        if (!debtResult?.data) continue;

        const recovered = Number(debtResult.data.recovered_amount ?? 0) + applied;
        const remainingDebt = Math.max(0, Number(debtResult.data.remaining_amount ?? 0) - applied);
        const debtUpdate = await db
            .from("vacated_tenant_debts")
            .update({
                recovered_amount: recovered,
                remaining_amount: remainingDebt,
                recovery_status: remainingDebt <= 0 ? "deducted_from_landlord" : "partially_recovered",
                updated_at: new Date().toISOString(),
            })
            .eq("id", String(debtResult.data.id));
        if (debtUpdate.error) throw new Error(debtUpdate.error.message);
    }
}

async function applyLandlordAdvanceDeductions({
    db,
    advances,
    deductionAmount,
    companyId,
    officeId,
    landlordId,
    settlementId,
    settlementMonth,
    createdBy,
}: {
    db: LooseDb;
    advances: Array<Record<string, unknown>>;
    deductionAmount: number;
    companyId: string;
    officeId: string;
    landlordId: string;
    settlementId: string | null;
    settlementMonth: string;
    createdBy: string | null;
}) {
    let remaining = deductionAmount;
    for (const advance of advances) {
        if (remaining <= 0) break;
        const advanceAmount = landlordAdvanceTotal(advance);
        const alreadyDeducted = numericAmount(advance.deducted_amount);
        const available = landlordAdvanceRemaining(advance);
        const applied = Math.min(available, remaining);
        if (applied <= 0) continue;
        remaining -= applied;

        const nextDeducted = alreadyDeducted + applied;
        const portions = splitAdvanceDeductionPortions(advance, applied);
        const currentPrincipalBalance = numericAmount(advance.remaining_principal_balance)
            || numericAmount(advance.principal_amount)
            || Math.max(0, advanceAmount - numericAmount(advance.interest_amount));
        const currentInterestBalance = numericAmount(advance.remaining_interest_balance) || numericAmount(advance.interest_amount);
        const nextPrincipalBalance = Math.max(0, currentPrincipalBalance - portions.principalPortion);
        const nextInterestBalance = Math.max(0, currentInterestBalance - portions.interestPortion);
        const nextTotalBalance = Math.max(0, available - applied);
        const update = await db
            .from("landlord_advances")
            .update({
                deducted_amount: nextDeducted,
                deducted_at: new Date().toISOString(),
                actual_cleared_date: nextTotalBalance <= 0 ? new Date().toISOString().slice(0, 10) : advance.actual_cleared_date ?? null,
                status: nextTotalBalance <= 0 ? "fully_deducted" : "partially_deducted",
                lifecycle_status: nextTotalBalance <= 0 ? "cleared" : advance.lifecycle_status ?? "active",
                remaining_principal_balance: nextPrincipalBalance,
                remaining_interest_balance: nextInterestBalance,
                remaining_balance: nextTotalBalance,
                remaining_total_balance: nextTotalBalance,
                updated_at: new Date().toISOString(),
            })
            .eq("id", String(advance.id));
        if (update.error) throw new Error(update.error.message);

        const deductionInsert = await db
            .from("landlord_advance_deductions")
            .insert({
                company_id: companyId,
                office_id: officeId,
                landlord_id: landlordId,
                advance_id: String(advance.id),
                settlement_id: settlementId,
                amount: applied,
                interest_portion: portions.interestPortion,
                principal_portion: portions.principalPortion,
                remaining_balance: nextTotalBalance,
                deduction_month: settlementMonth,
                status: nextTotalBalance <= 0 ? "deducted" : "partial",
                notes: "Deducted from landlord settlement net payable.",
                reference: settlementId ? `settlement-${settlementId}` : `monthly-${settlementMonth}`,
                created_by: createdBy,
            });
        if (deductionInsert.error) throw new Error(deductionInsert.error.message);

        const { data: scheduleRows, error: scheduleError } = await db
            .from("landlord_advance_repayment_schedule")
            .select("*")
            .eq("advance_id", String(advance.id))
            .eq("company_id", companyId);
        if (scheduleError) throw new Error(scheduleError.message);
        const sortedSchedule = ((scheduleRows ?? []) as LooseRecord[])
            .sort((a, b) => String(a.month_key ?? "").localeCompare(String(b.month_key ?? "")));
        const schedule = sortedSchedule.find((row) => String(row.month_key ?? "").slice(0, 7) === settlementMonth.slice(0, 7))
            ?? sortedSchedule.find((row) => String(row.status ?? "pending") !== "cleared");
        if (schedule?.id) {
            const nextActual = Number(schedule.actual_deduction ?? 0) + applied;
            const scheduled = Number(schedule.scheduled_deduction ?? 0);
            const scheduleUpdate = await db
                .from("landlord_advance_repayment_schedule")
                .update({
                    actual_deduction: nextActual,
                    status: nextTotalBalance <= 0 ? "cleared" : nextActual >= scheduled ? "deducted" : "partial",
                })
                .eq("id", String(schedule.id));
            if (scheduleUpdate.error) throw new Error(scheduleUpdate.error.message);
        }
        if (nextTotalBalance <= 0) {
            await createFinanceNotification(db, {
                companyId,
                officeId,
                entityId: String(advance.id),
                title: "Landlord advance completed",
                message: "A landlord advance was fully recovered during monthly settlement.",
                severity: "success",
            });
        }
    }
}

async function upsertLandlordMonthlyPayableFromSettlement({
    db,
    settlement,
    landlord,
    officeName,
    createdBy,
}: {
    db: LooseDb;
    settlement: Record<string, unknown>;
    landlord: Record<string, unknown>;
    officeName: string | null;
    createdBy: string | null;
}) {
    const month = normalizeSettlementMonth(settlement.settlement_month);
    const netPayable = Math.max(0, Number(settlement.net_payable ?? 0));
    const existing = await db
        .from("landlord_monthly_payables")
        .select("amount_paid,reasons_notes")
        .eq("company_id", String(settlement.company_id ?? ""))
        .eq("office_id", String(settlement.office_id ?? ""))
        .eq("landlord_id", String(settlement.landlord_id ?? ""))
        .eq("settlement_month", month)
        .maybeSingle!();
    if (existing.error) throw new Error(existing.error.message);
    const marker = extractPaymentMarkerFromNotes(existing.data?.reasons_notes)
        || await getImportedPaymentMarker({
            companyId: String(settlement.company_id ?? ""),
            db,
            landlordId: String(settlement.landlord_id ?? ""),
            officeId: String(settlement.office_id ?? ""),
            settlementMonth: month,
        });
    const amountPaid = marker === "JUNE" ? netPayable : marker === "MAY" ? 0 : Number(existing.data?.amount_paid ?? 0);
    const unpaidBalance = Math.max(0, netPayable - amountPaid);
    const row = {
        company_id: settlement.company_id,
        office_id: settlement.office_id,
        landlord_id: settlement.landlord_id,
        settlement_id: settlement.id,
        settlement_month: month,
        landlord_name: landlord.full_name ?? landlord.name ?? "Landlord",
        office_name: officeName,
        full_rent_roll: Number(settlement.expected_gross_rent ?? settlement.gross_collections ?? 0),
        commission_mode: settlement.commission_calculation_mode ?? "portfolio_based",
        commission_percentage: Number(settlement.company_commission_rate ?? 0),
        commission_amount: Number(settlement.company_commission_amount ?? settlement.management_fees ?? 0),
        vacant_room_deductions: Number(settlement.empty_room_deductions ?? 0),
        vacated_tenant_debt_deductions: Number(settlement.vacated_tenant_debt_deductions ?? 0),
        advance_deductions: Number(settlement.landlord_advance_deductions ?? 0),
        other_deductions: 0,
        net_payable: netPayable,
        amount_paid: amountPaid,
        unpaid_balance: unpaidBalance,
        status: unpaidBalance > 0 ? (amountPaid > 0 ? "partially_paid" : "unpaid") : "paid",
        reasons_notes: marker ? `cleared_month=${marker}; ${settlement.report_notes ?? ""}`.trim() : settlement.report_notes ?? null,
        created_by: createdBy,
        updated_at: new Date().toISOString(),
    };

    const { error } = await db
        .from("landlord_monthly_payables")
        .upsert(row, { onConflict: "company_id,office_id,landlord_id,settlement_month" });
    if (error) throw new Error(error.message);
}

async function refreshCurrentMonthPayablesForLandlord({
    db,
    companyId,
    landlordId,
    createdBy,
}: {
    db: LooseDb;
    companyId: string;
    landlordId: string;
    createdBy: string | null;
}) {
    const settlementMonth = normalizeSettlementMonth(new Date().toISOString().slice(0, 7));
    const [
        { data: landlord, error: landlordError },
        { data: rooms, error: roomsError },
        { data: offices, error: officesError },
        { data: settings, error: settingsError },
        { data: debts, error: debtsError },
        { data: advances, error: advancesError },
    ] = await Promise.all([
        db.from("landlords").select("*").eq("company_id", companyId).eq("id", landlordId).maybeSingle!(),
        db.from("rooms").select("id,company_id,office_id,landlord_id,monthly_rent,status,room_number,effective_start_date,explicitly_payable,payable_notes").eq("company_id", companyId).eq("landlord_id", landlordId),
        db.from("offices").select("id,name,office_name").eq("company_id", companyId),
        db.from("company_settings").select("*").eq("company_id", companyId).eq("key", "default_landlord_commission_rate"),
        db.from("landlord_debt_deductions").select("*").eq("company_id", companyId).eq("landlord_id", landlordId),
        db.from("landlord_advances").select("*").eq("company_id", companyId).eq("landlord_id", landlordId),
    ]);
    if (landlordError) throw new Error(landlordError.message);
    if (roomsError) throw new Error(roomsError.message);
    if (officesError) throw new Error(officesError.message);
    if (settingsError) throw new Error(settingsError.message);
    if (debtsError) throw new Error(debtsError.message);
    if (advancesError) throw new Error(advancesError.message);
    if (!landlord) return [];

    const officeNameById = new Map((offices ?? []).map((office: LooseRecord) => [
        String(office.id),
        String(office.office_name ?? office.name ?? "Office"),
    ]));
    const defaultCommissionRate = parseDefaultCommissionRate((settings ?? [])[0]?.value);
    const landlordRecord = landlord as LooseRecord;
    const groupedRooms = new Map<string, LooseRecord[]>();
    for (const room of (rooms ?? []) as LooseRecord[]) {
        if (isArchivedRoom(room)) continue;
        const officeId = String(room.office_id ?? "");
        if (!officeId) continue;
        groupedRooms.set(officeId, [...(groupedRooms.get(officeId) ?? []), room]);
    }

    const refreshed: Array<{ officeId: string; netPayable: number; unpaidBalance: number }> = [];
    for (const [officeId, officeRooms] of groupedRooms) {
        const existing = await db
            .from("landlord_monthly_payables")
            .select("amount_paid,last_paid_at,reasons_notes,status")
            .eq("company_id", companyId)
            .eq("office_id", officeId)
            .eq("landlord_id", landlordId)
            .eq("settlement_month", settlementMonth)
            .maybeSingle!();
        if (existing.error) throw new Error(existing.error.message);
        const roomDecisions = officeRooms.map((room) => ({
            decision: getMoveInPayableDecision({
                landlordPayment: {
                    amountPaid: existing.data?.amount_paid,
                    lastPaidAt: existing.data?.last_paid_at,
                    status: existing.data?.status,
                },
                room,
                settlementMonth,
                tenantActive: !isVacantCommissionRoom(room),
            }),
            room,
        }));
        const fullRentRoll = officeRooms.reduce((total, room) => total + Number(room.monthly_rent ?? 0), 0);
        const occupiedPayableRent = roomDecisions
            .filter(({ decision }) => decision.payableThisMonth)
            .reduce((total, { room }) => total + Number(room.monthly_rent ?? 0), 0);
        const vacantRoomDeductions = roomDecisions
            .filter(({ decision }) => !decision.payableThisMonth)
            .reduce((total, { room }) => total + Number(room.monthly_rent ?? 0), 0);
        const companyExtraProfit = roomDecisions.reduce((total, { decision }) => total + decision.companyExtraProfitAmount, 0);
        const cutoffNotes = roomDecisions
            .filter(({ decision }) => decision.cutoffDecision !== "standard" && decision.cutoffDecision !== "vacant" && decision.cutoffDecision !== "archived")
            .map(({ room, decision }) => `${String(room.room_number ?? room.id)}=${decision.reason}`)
            .join("; ");
        const commissionMode = parseCommissionCalculationMode(
            landlordRecord.commission_calculation_mode
            ?? parseCommissionMetadata(landlordRecord.commission_notes).commissionCalculationMode,
        );
        const commissionRate = landlordRecord.commission_rate !== null
            && landlordRecord.commission_rate !== undefined
            && Number.isFinite(Number(landlordRecord.commission_rate))
            ? Number(landlordRecord.commission_rate)
            : defaultCommissionRate;
        const commissionBase = commissionMode === "occupied_room_based" ? occupiedPayableRent : fullRentRoll;
        const commissionAmount = Math.round(commissionBase * (commissionRate / 100));
        const landlordPortfolioNet = commissionMode === "occupied_room_based"
            ? Math.max(0, occupiedPayableRent - commissionAmount)
            : Math.max(0, fullRentRoll - commissionAmount - vacantRoomDeductions);
        const activeDebts = ((debts ?? []) as LooseRecord[])
            .filter((debt) => String(debt.office_id) === officeId)
            .filter((debt) => isRecoveryDeductionActiveForMonth(debt, settlementMonth));
        const requestedRecovery = activeDebts.reduce((total, debt) => {
            const remaining = Number(debt.amount ?? 0) - Number(debt.applied_amount ?? 0);
            return total + Math.max(0, remaining);
        }, 0);
        const recoveryDeduction = Math.min(requestedRecovery, landlordPortfolioNet);
        const activeAdvances = ((advances ?? []) as LooseRecord[])
            .filter((advance) => String(advance.office_id) === officeId)
            .filter((advance) => String(advance.status ?? "pending") !== "fully_deducted");
        const requestedAdvance = activeAdvances.reduce((total, advance) => total + scheduledAdvanceDeductionForMonth(advance, settlementMonth), 0);
        const advanceDeduction = Math.min(requestedAdvance, Math.max(0, landlordPortfolioNet - recoveryDeduction));
        const netPayable = Math.max(0, landlordPortfolioNet - recoveryDeduction - advanceDeduction);
        const clearedMonth = extractPaymentMarkerFromNotes(existing.data?.reasons_notes)
            || await getImportedPaymentMarker({
                companyId,
                db,
                landlordId,
                officeId,
                settlementMonth,
            });
        const amountPaid = clearedMonth === "JUNE"
            ? netPayable
            : clearedMonth === "MAY"
                ? 0
                : Number(existing.data?.amount_paid ?? 0);
        const openingArrears = await getLandlordOpeningArrears({ db, companyId, officeId, landlordId, beforeMonth: settlementMonth });
        const totalDue = netPayable;
        const unpaidBalance = Math.max(0, netPayable - Math.min(amountPaid, netPayable));
        const overpaidAmount = Math.max(0, amountPaid - netPayable);
        const row = {
            company_id: companyId,
            office_id: officeId,
            landlord_id: landlordId,
            settlement_id: null,
            settlement_month: settlementMonth,
            month_key: settlementMonth,
            landlord_name: String(landlordRecord.full_name ?? landlordRecord.name ?? "Landlord"),
            office_name: officeNameById.get(officeId) ?? "Office",
            full_rent_roll: fullRentRoll,
            commission_mode: commissionMode,
            commission_percentage: commissionRate,
            commission_amount: commissionAmount,
            vacant_room_deductions: vacantRoomDeductions,
            vacated_tenant_debt_deductions: recoveryDeduction,
            advance_deductions: advanceDeduction,
            other_deductions: 0,
            net_payable: netPayable,
            opening_arrears: openingArrears,
            monthly_net_payable: netPayable,
            total_due: totalDue,
            amount_paid: amountPaid,
            unpaid_balance: unpaidBalance,
            overpaid_amount: overpaidAmount,
            advance_created: overpaidAmount,
            closing_arrears: unpaidBalance,
            status: overpaidAmount > 0 ? "overpaid" : unpaidBalance > 0 ? "unpaid" : "paid",
            reasons_notes: clearedMonth
                ? `cleared_month=${clearedMonth}; Live refresh after commission change. Recovery pending ${requestedRecovery}. Advance pending ${requestedAdvance}. move_in_cutoff=${cutoffNotes || "none"}; company_extra_profit=${companyExtraProfit}.`
                : `Live refresh after commission change. Recovery pending ${requestedRecovery}. Advance pending ${requestedAdvance}. move_in_cutoff=${cutoffNotes || "none"}; company_extra_profit=${companyExtraProfit}.`,
            created_by: createdBy,
            updated_at: new Date().toISOString(),
        };
        const upsert = await db
            .from("landlord_monthly_payables")
            .upsert(row, { onConflict: "company_id,office_id,landlord_id,settlement_month" });
        if (upsert.error) throw new Error(upsert.error.message);
        refreshed.push({ officeId, netPayable, unpaidBalance });
    }
    return refreshed;
}

async function applyLandlordMonthlyPayablePayment({
    db,
    companyId,
    officeId,
    landlordId,
    settlementId,
    monthlyPayableId,
    amount,
    paymentMethod,
    reference,
    notes,
    paidBy,
}: {
    db: LooseDb;
    companyId: string;
    officeId: string;
    landlordId: string;
    settlementId: string | null;
    monthlyPayableId?: string;
    amount: number;
    paymentMethod: string;
    reference: string | null;
    notes: string | null;
    paidBy: string | null;
}) {
    if (!landlordId || amount <= 0) return;

    let payableQuery = db
        .from("landlord_monthly_payables")
        .select("*")
        .eq("company_id", companyId)
        .eq("landlord_id", landlordId);
    if (monthlyPayableId) payableQuery = payableQuery.eq("id", monthlyPayableId);
    else if (settlementId) payableQuery = payableQuery.eq("settlement_id", settlementId);
    else return;

    const payableResult = await payableQuery.maybeSingle!();
    if (payableResult.error) throw new Error(payableResult.error.message);
    const payable = payableResult.data;
    if (!payable) return;

    const amountPaidBefore = Number(payable.amount_paid ?? 0);
    const netPayable = Number(payable.net_payable ?? 0);
    const nextPaid = Math.min(netPayable, amountPaidBefore + amount);
    const unpaidBalance = Math.max(0, netPayable - nextPaid);
    const status = unpaidBalance <= 0 ? "paid" : nextPaid > 0 ? "partially_paid" : "unpaid";
    const now = new Date().toISOString();

    const update = await db
        .from("landlord_monthly_payables")
        .update({
            amount_paid: nextPaid,
            unpaid_balance: unpaidBalance,
            status,
            last_paid_at: now,
            updated_at: now,
        })
        .eq("id", String(payable.id));
    if (update.error) throw new Error(update.error.message);

    const paymentInsert = await db
        .from("landlord_monthly_payable_payments")
        .insert({
            company_id: companyId,
            office_id: officeId,
            landlord_id: landlordId,
            monthly_payable_id: String(payable.id),
            settlement_id: settlementId,
            amount,
            payment_method: paymentMethod,
            reference,
            notes,
            paid_by: paidBy,
        });
    if (paymentInsert.error) throw new Error(paymentInsert.error.message);
}

async function allocateLandlordPaymentAcrossLedger({
    db,
    companyId,
    officeId,
    landlordId,
    startingMonthlyPayableId,
    amount,
    paymentMethod,
    reference,
    notes,
    paidBy,
    paidAt,
}: {
    db: LooseDb;
    companyId: string;
    officeId: string;
    landlordId: string;
    startingMonthlyPayableId: string;
    amount: number;
    paymentMethod: string;
    reference: string;
    notes: string | null;
    paidBy: string | null;
    paidAt?: string;
}) {
    const now = paidAt ?? new Date().toISOString();
    const openResult = await db
        .from("landlord_monthly_payables")
        .select("*")
        .eq("company_id", companyId)
        .eq("office_id", officeId)
        .eq("landlord_id", landlordId)
        .neq("status", "archived")
        .order("settlement_month", { ascending: true });
    if (openResult.error) throw new Error(openResult.error.message);

    const rows = ((openResult.data ?? []) as LooseRecord[])
        .filter((row) => monthOnlyPayableBalance(row) > 0 || String(row.id) === startingMonthlyPayableId)
        .sort((a, b) => String(a.settlement_month ?? a.month_key ?? "").localeCompare(String(b.settlement_month ?? b.month_key ?? "")));
    if (!rows.some((row) => String(row.id) === startingMonthlyPayableId)) {
        const selected = (openResult.data ?? []).find((row: LooseRecord) => String(row.id) === startingMonthlyPayableId);
        if (selected) rows.push(selected as LooseRecord);
    }

    let remaining = amount;
    let appliedAmount = 0;
    const allocations: Array<{ monthlyPayableId: string; month: string; applied: number; unpaidBalance: number; status: string }> = [];

    for (const row of rows) {
        if (remaining <= 0) break;
        const payableId = String(row.id);
        const openingArrears = Math.max(0, Number(row.opening_arrears ?? 0));
        const monthlyNetPayable = landlordMonthlyDue(row);
        const totalDue = Math.max(0, Number(row.total_due ?? 0)) || monthlyNetPayable;
        const amountPaidBefore = landlordMonthlyPaid(row);
        const currentUnpaid = monthOnlyPayableBalance(row);
        if (currentUnpaid <= 0 && payableId !== startingMonthlyPayableId) continue;

        const applied = Math.min(remaining, currentUnpaid);
        if (applied <= 0) continue;
        remaining -= applied;
        appliedAmount += applied;
        const nextPaid = amountPaidBefore + applied;
        const unpaidBalance = Math.max(0, monthlyNetPayable - Math.min(nextPaid, monthlyNetPayable));
        const status = unpaidBalance <= 0 ? "paid" : nextPaid > 0 ? "partial" : "unpaid";

        const update = await db
            .from("landlord_monthly_payables")
            .update({
                opening_arrears: openingArrears,
                monthly_net_payable: monthlyNetPayable,
                total_due: totalDue,
                amount_paid: nextPaid,
                unpaid_balance: unpaidBalance,
                overpaid_amount: 0,
                advance_created: 0,
                closing_arrears: unpaidBalance,
                status,
                paid_at: nextPaid > 0 ? now : row.paid_at ?? null,
                payment_reference: reference,
                accounting_notes: notes ?? "Payment allocated oldest arrears first.",
                last_paid_at: now,
                updated_at: now,
            })
            .eq("id", payableId);
        if (update.error) throw new Error(update.error.message);

        const paymentInsert = await db
            .from("landlord_monthly_payable_payments")
            .insert({
                company_id: companyId,
                office_id: officeId,
                landlord_id: landlordId,
                monthly_payable_id: payableId,
                settlement_id: row.settlement_id ? String(row.settlement_id) : null,
                amount: applied,
                payment_method: paymentMethod,
                reference,
                notes: notes ?? `Allocated to ${String(row.settlement_month ?? row.month_key ?? "monthly payable")}`,
                paid_by: paidBy,
            });
        if (paymentInsert.error) throw new Error(paymentInsert.error.message);
        allocations.push({ monthlyPayableId: payableId, month: String(row.settlement_month ?? row.month_key ?? ""), applied, unpaidBalance, status });
    }

    let advanceCreated = 0;
    if (remaining > 0) {
        advanceCreated = remaining;
        const advancePlan = {
            principalAmount: advanceCreated,
            interestAmount: 0,
            totalRepayable: advanceCreated,
            deductionStartDate: now.slice(0, 10),
            expectedEndDate: now.slice(0, 10),
        };
        const advanceInsert = await db
            .from("landlord_advances")
            .insert({
                company_id: companyId,
                office_id: officeId,
                landlord_id: landlordId,
                advance_amount: advancePlan.totalRepayable,
                principal_amount: advancePlan.principalAmount,
                repayment_type: "simple_advance",
                interest_calculation_mode: "none",
                interest_type: "none",
                interest_rate: 0,
                fixed_interest_amount: 0,
                interest_amount: advancePlan.interestAmount,
                total_repayable: advancePlan.totalRepayable,
                deducted_amount: 0,
                date_given: now.slice(0, 10),
                deduction_start_date: advancePlan.deductionStartDate,
                deduction_end_date: advancePlan.expectedEndDate,
                payment_plan: "one_time",
                principal_clearance_method: "deducted_monthly",
                monthly_deduction_amount: advancePlan.totalRepayable,
                expected_end_date: advancePlan.expectedEndDate,
                remaining_principal_balance: advancePlan.principalAmount,
                remaining_interest_balance: 0,
                remaining_balance: advancePlan.totalRepayable,
                remaining_total_balance: advancePlan.totalRepayable,
                reason: "Landlord overpayment converted to advance",
                note: `Overpayment from landlord payment reference ${reference}`,
                status: "approved",
                lifecycle_status: "active",
            })
            .select("*")
            .single();
        if (advanceInsert.error) throw new Error(advanceInsert.error.message);

        const scheduleInsert = await db
            .from("landlord_advance_repayment_schedule")
            .insert({
                company_id: companyId,
                office_id: officeId,
                landlord_id: landlordId,
                advance_id: String(advanceInsert.data.id),
                month_key: advancePlan.deductionStartDate,
                opening_balance: advancePlan.totalRepayable,
                opening_principal_balance: advancePlan.principalAmount,
                interest_charged: 0,
                scheduled_deduction: advancePlan.totalRepayable,
                actual_deduction: 0,
                interest_portion: 0,
                principal_portion: advancePlan.totalRepayable,
                closing_principal_balance: 0,
                closing_balance: 0,
                remaining_total_balance: 0,
                status: "pending",
            });
        if (scheduleInsert.error) throw new Error(scheduleInsert.error.message);

        const selectedRow = rows.find((row) => String(row.id) === startingMonthlyPayableId);
        if (selectedRow) {
            const updateOverpaid = await db
                .from("landlord_monthly_payables")
                .update({
                    overpaid_amount: advanceCreated,
                    advance_created: advanceCreated,
                    status: "overpaid",
                    unpaid_balance: 0,
                    closing_arrears: 0,
                    paid_at: now,
                    payment_reference: reference,
                    accounting_notes: `Overpayment of UGX ${Math.round(advanceCreated).toLocaleString()} converted to landlord advance.`,
                    updated_at: now,
                })
                .eq("id", startingMonthlyPayableId);
            if (updateOverpaid.error) throw new Error(updateOverpaid.error.message);
        }
    }

    const remainingResult = await db
        .from("landlord_monthly_payables")
        .select("unpaid_balance,monthly_net_payable,net_payable,total_due,opening_arrears,amount_paid")
        .eq("company_id", companyId)
        .eq("office_id", officeId)
        .eq("landlord_id", landlordId)
        .neq("status", "archived");
    if (remainingResult.error) throw new Error(remainingResult.error.message);
    const remainingBalance = ((remainingResult.data ?? []) as LooseRecord[]).reduce((total, row) => total + monthOnlyPayableBalance(row), 0);

    return {
        appliedAmount,
        advanceCreated,
        remainingBalance,
        allocations,
    };
}

function normalizeSettlementMonth(value: unknown) {
    const text = String(value ?? new Date().toISOString().slice(0, 7));
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text.slice(0, 10);
    if (/^\d{4}-\d{2}$/.test(text)) return `${text}-01`;
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) return `${new Date().toISOString().slice(0, 7)}-01`;
    return new Date(parsed.getFullYear(), parsed.getMonth(), 1).toISOString().slice(0, 10);
}

export async function generateLandlordStatement(input: GenerateStatementInput) {
    const context = await activeWriteContext();
    const supabase = await createSupabaseServerClient();

    const { data: settlement, error: settlementError } = await supabase
        .from("landlord_settlements")
        .select("*")
        .eq("id", input.settlementId)
        .eq("company_id", context.activeCompany!.id)
        .maybeSingle();
    if (settlementError) throw new Error(settlementError.message);
    if (!settlement) throw new Error("Settlement not found.");

    const { data, error } = await supabase
        .from("landlord_statements")
        .insert({
            company_id: context.activeCompany!.id,
            delivery_status: "generated",
            settlement_id: settlement.id,
            statement_number: `LST-${Date.now()}`,
        })
        .select("*")
        .single();
    if (error) throw new Error(error.message);

    await logUserAction({
        action: "landlord_statement_generated",
        entityType: "landlord_statement",
        entityId: data.id,
        companyId: context.activeCompany!.id,
        officeId: context.activeOffice!.id,
        afterData: data,
    });

    revalidatePath("/office/landlords");
    return data;
}
