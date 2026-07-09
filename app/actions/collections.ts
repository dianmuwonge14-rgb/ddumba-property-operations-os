"use server";

import { revalidatePath } from "next/cache";
import { logUserAction } from "@/lib/auth/audit";
import { hasPermission, requireAuth, requireCompanyAdminMode, requirePermission } from "@/lib/auth/permissions";
import { createNotificationWithEmail } from "@/lib/notifications/email";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantCollectionContext } from "@/lib/collections/data";
import { recordCollectionLedgerAndCash } from "@/lib/collections/payment-ledger";
import { recalculateTenantScore } from "@/lib/tenants/scoring";
import type {
    CreateCollectionActionInput,
    CreatePromiseInput,
    FollowUpPromiseInput,
    RecordCollectionInput,
    UpsertTenantRentSponsorInput,
} from "@/lib/collections/types";

type DynamicDb = {
    from: (table: string) => any;
};

function assertPositiveAmount(amount: number, label: string) {
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error(`${label} must be greater than zero.`);
    }
}

function assertDate(value: string | undefined, label: string) {
    if (!value || Number.isNaN(Date.parse(value))) {
        throw new Error(`${label} is required.`);
    }
}

function collectionNumber() {
    return `COL-${Date.now()}`;
}

function revalidateOperationsPages() {
    revalidatePath("/office/collections");
    revalidatePath("/office/payments");
    revalidatePath("/office/admin/payments");
    revalidatePath("/office/defaulters");
    revalidatePath("/office/admin/defaulters");
    revalidatePath("/office/promises");
    revalidatePath("/office/notifications");
    revalidatePath("/office");
    revalidatePath("/office/dashboard");
    revalidatePath("/office/admin");
    revalidatePath("/office/admin/statements");
    revalidatePath("/office/ceo");
    revalidatePath("/office/excellence");
    revalidatePath("/office/ai");
    revalidatePath("/office/automation");
    revalidatePath("/office/audit");
}

function revalidatePaymentEntryPages() {
    revalidatePath("/office/collections");
    revalidatePath("/office/payments");
    revalidatePath("/office/admin/payments");
}

function revalidateFastPaymentPages() {
    revalidatePath("/office/payments");
    revalidatePath("/office/admin/payments");
}

function revalidatePaymentDateChangePages() {
    revalidatePaymentEntryPages();
    revalidatePath("/office/notifications");
    revalidatePath("/office/admin/statements");
    revalidatePath("/office/spreadsheet");
}

const BUSINESS_TIME_ZONE = "Africa/Kampala";
const BUSINESS_UTC_OFFSET_HOURS = 3;

function businessDateStartIso(value: string) {
    const dateOnly = value.slice(0, 10);
    assertDate(dateOnly, "Payment date");
    const [year, month, day] = dateOnly.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day, -BUSINESS_UTC_OFFSET_HOURS, 0, 0, 0)).toISOString();
}

function normalizePaymentDate(value: string | undefined) {
    const dateOnly = value?.slice(0, 10) ?? "";
    assertDate(dateOnly, "Payment date");
    return dateOnly;
}

async function getFastTenantPaymentContext(input: {
    supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
    companyId: string;
    tenantId: string;
}) {
    const { supabase, companyId, tenantId } = input;
    const { data: tenant, error: tenantError } = await supabase
        .from("tenants")
        .select("id, company_id, office_id, property_id, room_id, full_name, monthly_rent, balance, status")
        .eq("id", tenantId)
        .eq("company_id", companyId)
        .maybeSingle();
    if (tenantError) throw new Error(tenantError.message);
    if (!tenant) throw new Error("Tenant not found.");

    const [roomResult, leaseResult, sponsorResult] = await Promise.all([
        tenant.room_id
            ? supabase
                .from("rooms")
                .select("id, company_id, office_id, property_id, room_number, monthly_rent, outstanding_balance, status")
                .eq("id", tenant.room_id)
                .eq("company_id", companyId)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        supabase
            .from("leases")
            .select("id, company_id, office_id, property_id, room_id, tenant_id, monthly_rent, status")
            .eq("tenant_id", tenantId)
            .eq("company_id", companyId)
            .eq("status", "active")
            .maybeSingle(),
        (supabase as unknown as DynamicDb)
            .from("tenant_rent_sponsors")
            .select("id, tenant_id, employer_name, covered_amount, tenant_top_up_amount, total_monthly_rent, status")
            .eq("tenant_id", tenantId)
            .eq("company_id", companyId)
            .eq("status", "active")
            .maybeSingle(),
    ]);
    if (roomResult.error) throw new Error(roomResult.error.message);
    if (leaseResult.error) throw new Error(leaseResult.error.message);
    if (sponsorResult.error && !/does not exist|schema cache|Could not find/i.test(sponsorResult.error.message ?? "")) {
        throw new Error(sponsorResult.error.message);
    }

    const room = roomResult.data;
    const lease = leaseResult.data;
    const monthlyRent = Number(lease?.monthly_rent ?? tenant.monthly_rent ?? room?.monthly_rent ?? 0);
    const outstandingBalance = Math.max(0, Number(tenant.balance ?? room?.outstanding_balance ?? 0));
    const sponsor = sponsorResult.data ?? null;
    const employerExpected = Math.max(0, Number(sponsor?.covered_amount ?? 0));
    const tenantTopUpExpected = Math.max(0, Number(sponsor?.tenant_top_up_amount ?? (employerExpected ? monthlyRent - employerExpected : 0)));

    return {
        tenant,
        room,
        lease,
        propertyId: lease?.property_id ?? tenant.property_id ?? room?.property_id ?? null,
        monthlyRent,
        outstandingBalance,
        contribution: {
            employerBalance: employerExpected,
            employerExpected,
            tenantTopUpBalance: tenantTopUpExpected,
            tenantTopUpExpected,
        },
        sponsor,
    };
}

function dateOnly(value: string | null | undefined) {
    if (!value) return "";
    const parts = new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "2-digit",
        timeZone: BUSINESS_TIME_ZONE,
        year: "numeric",
    }).formatToParts(new Date(value));
    const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
    return `${part("year")}-${part("month")}-${part("day")}`;
}

function monthStartDate(value: string) {
    const dateOnlyValue = value.slice(0, 10);
    assertDate(dateOnlyValue, "Payment date");
    return `${dateOnlyValue.slice(0, 7)}-01`;
}

function addMonths(monthStart: string, months: number) {
    const [year, month] = monthStart.slice(0, 7).split("-").map(Number);
    return new Date(Date.UTC(year, month - 1 + months, 1)).toISOString().slice(0, 10);
}

function paymentBusinessDate(payment: Record<string, unknown>) {
    const rawPaymentDate = typeof payment.payment_date === "string" ? payment.payment_date : "";
    const explicitDate = rawPaymentDate.includes("T") ? dateOnly(rawPaymentDate) : rawPaymentDate.slice(0, 10);
    return explicitDate || dateOnly(String(payment.paid_at ?? ""));
}

function paymentRemovalReversalAmount(payment: Record<string, unknown>) {
    const amount = Number(payment.amount_paid ?? payment.amount ?? 0);
    const balanceBefore = Number(payment.balance_before_payment ?? payment.expected_amount ?? 0);
    const usedToClear = Number(payment.used_to_clear_outstanding ?? 0);
    if (usedToClear > 0) return usedToClear;
    if (balanceBefore > 0) return Math.min(balanceBefore, amount);
    return amount;
}

async function applyApprovedPaymentRemoval(input: {
    db: DynamicDb;
    companyId: string;
    payment: Record<string, unknown>;
    reason: string;
    sourceType: string;
    sourceId: string;
    reviewedOfficeId?: string | null;
}) {
    const adminDb = createSupabaseAdminClient() as unknown as DynamicDb;
    const { companyId, payment, reason } = input;
    const paymentId = String(payment.id ?? "");
    const originalAmount = Number(payment.amount_paid ?? payment.amount ?? 0);
    const reversalAmount = paymentRemovalReversalAmount(payment);
    const tenantId = payment.tenant_id ? String(payment.tenant_id) : null;
    const roomId = payment.room_id ? String(payment.room_id) : null;

    const { data: tenant, error: tenantError } = tenantId
        ? await adminDb.from("tenants").select("*").eq("company_id", companyId).eq("id", tenantId).maybeSingle()
        : { data: null, error: null };
    if (tenantError) throw new Error(tenantError.message);

    const currentBalance = Number(tenant?.balance ?? payment.balance ?? 0);
    const nextBalance = Math.max(0, currentBalance + reversalAmount);

    if (tenant?.id) {
        const tenantUpdate = await adminDb.from("tenants").update({ balance: nextBalance }).eq("company_id", companyId).eq("id", tenant.id);
        if (tenantUpdate.error) throw new Error(tenantUpdate.error.message);
    }

    if (roomId) {
        const roomUpdate = await adminDb.from("rooms").update({ outstanding_balance: nextBalance }).eq("company_id", companyId).eq("id", roomId);
        if (roomUpdate.error) throw new Error(roomUpdate.error.message);
    }

    const allocationDelete = await adminDb.from("tenant_rent_allocations").delete().eq("company_id", companyId).eq("payment_id", paymentId);
    if (allocationDelete.error && !/does not exist|schema cache|Could not find/i.test(allocationDelete.error.message ?? "")) {
        throw new Error(allocationDelete.error.message);
    }

    const update = await adminDb
        .from("collections")
        .update({
            allocated_to_next_month: 0,
            balance: nextBalance,
            balance_after_payment: nextBalance,
            notes: [payment.notes, `Removed by admin approval: ${reason}`].filter(Boolean).join(" | "),
            status: "removed_by_admin_approval",
        })
        .eq("id", paymentId)
        .eq("company_id", companyId)
        .select("*")
        .single();
    if (update.error) throw new Error(update.error.message);

    const ledgerInsert = await adminDb.from("tenant_ledger_entries").insert({
        amount: reversalAmount || originalAmount,
        balance_after: nextBalance,
        company_id: companyId,
        description: `Admin removed payment of UGX ${Math.round(originalAmount).toLocaleString()}. Reversed outstanding effect UGX ${Math.round(reversalAmount).toLocaleString()}. Reason: ${reason}`,
        entry_type: "debit",
        lease_id: payment.lease_id ?? null,
        office_id: payment.office_id ?? input.reviewedOfficeId ?? null,
        source_id: input.sourceId,
        source_type: input.sourceType,
        tenant_id: tenantId,
    });
    if (ledgerInsert.error) throw new Error(ledgerInsert.error.message);

    const { data: cashAccount } = await adminDb
        .from("cash_accounts")
        .select("id")
        .eq("company_id", companyId)
        .eq("office_id", payment.office_id ?? input.reviewedOfficeId ?? null)
        .eq("account_type", "office_cash")
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
    if (cashAccount?.id && originalAmount > 0) {
        const cashReversal = await adminDb.from("cash_transactions").insert({
            amount: originalAmount,
            cash_account_id: cashAccount.id,
            company_id: companyId,
            description: `Payment removal reversal for collection ${paymentId}. ${reason}`,
            office_id: payment.office_id ?? input.reviewedOfficeId ?? null,
            recorded_by: null,
            source_id: paymentId,
            source_type: "payment_removal_reversal",
            transaction_date: new Date().toISOString(),
            transaction_type: "outflow",
        });
        if (cashReversal.error) throw new Error(cashReversal.error.message);
    }

    return { payment: update.data, nextBalance, originalAmount, reversalAmount };
}

async function notifyPaymentDateChange(db: DynamicDb, input: {
    companyId: string;
    entityType?: string;
    officeId: string | null;
    recipientType: "admin" | "office";
    title: string;
    message: string;
    severity?: string;
    entityId?: string;
}) {
    await createNotificationWithEmail(db, {
        action_url: "/office/notifications",
        channel: "in_app",
        company_id: input.companyId,
        delivery_status: "pending",
        entity_id: input.entityId ?? null,
        entity_type: input.entityType ?? "payment_date_change_request",
        is_read: false,
        message: input.message,
        office_id: input.officeId,
        recipient_type: input.recipientType,
        severity: input.severity ?? "information",
        title: input.title,
    });
}

function isMissingSchemaError(error: { code?: string; message?: string } | null | undefined) {
    const message = String(error?.message ?? "");
    return error?.code === "42P01" || error?.code === "PGRST205" || /does not exist|schema cache|Could not find/i.test(message);
}

async function applyTenantBalanceAdjustment(input: {
    adjustmentId: string;
    companyId: string;
    db: DynamicDb;
    newBalance: number;
    officeId: string | null;
    oldBalance: number;
    reason: string;
    roomId: string | null;
    tenantId: string | null;
}) {
    const balance = Math.max(0, input.newBalance);
    if (input.tenantId) {
        const tenantUpdate = await input.db
            .from("tenants")
            .update({ balance })
            .eq("company_id", input.companyId)
            .eq("id", input.tenantId);
        if (tenantUpdate.error) throw new Error(tenantUpdate.error.message);
    }
    if (input.roomId) {
        const roomUpdate = await input.db
            .from("rooms")
            .update({ outstanding_balance: balance })
            .eq("company_id", input.companyId)
            .eq("id", input.roomId);
        if (roomUpdate.error) throw new Error(roomUpdate.error.message);
    }
    const ledgerInsert = await input.db.from("tenant_ledger_entries").insert({
        amount: Math.abs(balance - input.oldBalance),
        balance_after: balance,
        company_id: input.companyId,
        description: `Outstanding balance adjusted from UGX ${Math.round(input.oldBalance).toLocaleString()} to UGX ${Math.round(balance).toLocaleString()}. Reason: ${input.reason}`,
        entry_type: balance > input.oldBalance ? "debit" : "credit",
        office_id: input.officeId,
        source_id: input.adjustmentId,
        source_type: "tenant_balance_adjustment",
        tenant_id: input.tenantId,
    });
    if (ledgerInsert.error && !isMissingSchemaError(ledgerInsert.error)) throw new Error(ledgerInsert.error.message);
}

export async function requestTenantOutstandingBalanceAdjustment(input: {
    effectiveDate: string;
    newBalance: number;
    notes?: string | null;
    reason: string;
    roomId: string;
    tenantId: string;
}) {
    const context = await requirePermission("collections.payment.post");
    if (!context.activeCompany?.id || !context.activeOffice?.id) throw new Error("Active company and office are required.");
    const db = (context.isCompanyAdmin && !context.isOfficeMode ? createSupabaseAdminClient() : await createSupabaseServerClient()) as unknown as DynamicDb;
    const newBalance = Number(input.newBalance);
    if (!Number.isFinite(newBalance) || newBalance < 0) throw new Error("New outstanding balance must be zero or greater.");
    const reason = input.reason.trim();
    if (!reason) throw new Error("Reason for balance change is required.");
    assertDate(input.effectiveDate, "Effective date");

    const { data: room, error: roomError } = await db
        .from("rooms")
        .select("*")
        .eq("company_id", context.activeCompany.id)
        .eq("id", input.roomId)
        .maybeSingle();
    if (roomError) throw new Error(roomError.message);
    if (!room) throw new Error("Room not found.");
    if (!(context.isCompanyAdmin || context.canAccessAllOffices) && room.office_id !== context.activeOffice.id) {
        throw new Error("You can only adjust outstanding balances for your own office.");
    }

    const { data: tenant, error: tenantError } = await db
        .from("tenants")
        .select("*")
        .eq("company_id", context.activeCompany.id)
        .eq("id", input.tenantId)
        .maybeSingle();
    if (tenantError) throw new Error(tenantError.message);
    if (!tenant) throw new Error("Tenant not found.");

    const oldBalance = Math.max(0, Number(tenant.balance ?? room.outstanding_balance ?? 0));
    const status = context.isCompanyAdmin && !context.isOfficeMode ? "direct_admin_change" : "pending";
    const { data, error } = await db
        .from("tenant_balance_adjustments")
        .insert({
            adjustment_amount: newBalance - oldBalance,
            company_id: context.activeCompany.id,
            effective_date: input.effectiveDate,
            new_balance: newBalance,
            notes: input.notes || null,
            office_id: room.office_id ?? context.activeOffice.id,
            old_balance: oldBalance,
            reason,
            requested_by: context.profile?.id ?? null,
            room_id: room.id,
            status,
            tenant_id: tenant.id,
            ...(status === "direct_admin_change" ? {
                approved_at: new Date().toISOString(),
                approved_by: context.profile?.id ?? null,
            } : {}),
        })
        .select("*")
        .single();
    if (error) {
        if (isMissingSchemaError(error)) throw new Error("Tenant balance adjustment table is missing. Apply migration 0186_tenant_balance_adjustments.sql to live Supabase first.");
        throw new Error(error.message);
    }

    if (status === "direct_admin_change") {
        await applyTenantBalanceAdjustment({
            adjustmentId: data.id,
            companyId: context.activeCompany.id,
            db,
            newBalance,
            officeId: room.office_id ?? context.activeOffice.id,
            oldBalance,
            reason,
            roomId: room.id,
            tenantId: tenant.id,
        });
    } else {
        await notifyPaymentDateChange(db, {
            companyId: context.activeCompany.id,
            entityId: data.id,
            entityType: "tenant_balance_adjustment",
            message: `Outstanding balance change requested for room ${room.room_number ?? "Unknown"} from UGX ${Math.round(oldBalance).toLocaleString()} to UGX ${Math.round(newBalance).toLocaleString()}.`,
            officeId: room.office_id ?? context.activeOffice.id,
            recipientType: "admin",
            severity: "warning",
            title: "Pending outstanding balance adjustment",
        });
    }

    await logUserAction({
        action: status === "direct_admin_change" ? "tenant_balance_adjusted_by_admin" : "tenant_balance_adjustment_requested",
        entityType: "tenant_balance_adjustment",
        entityId: data.id,
        companyId: context.activeCompany.id,
        officeId: room.office_id ?? context.activeOffice.id,
        beforeData: { room, tenant, oldBalance },
        afterData: data,
    });
    revalidateOperationsPages();
    return data;
}

export async function decideTenantOutstandingBalanceAdjustment(input: {
    adjustmentId: string;
    comment?: string | null;
    decision: "approved" | "rejected";
}) {
    const context = await requireCompanyAdminMode();
    if (!context.activeCompany?.id) throw new Error("Active company is required.");
    if (input.decision === "rejected" && !String(input.comment ?? "").trim()) throw new Error("Rejection reason is required.");
    const db = createSupabaseAdminClient() as unknown as DynamicDb;

    const { data: request, error } = await db
        .from("tenant_balance_adjustments")
        .select("*")
        .eq("company_id", context.activeCompany.id)
        .eq("id", input.adjustmentId)
        .maybeSingle();
    if (error) {
        if (isMissingSchemaError(error)) throw new Error("Tenant balance adjustment table is missing. Apply migration 0186_tenant_balance_adjustments.sql to live Supabase first.");
        throw new Error(error.message);
    }
    if (!request) throw new Error("Outstanding balance adjustment request not found.");
    if (request.status !== "pending") throw new Error("This adjustment has already been reviewed.");

    if (input.decision === "approved") {
        await applyTenantBalanceAdjustment({
            adjustmentId: request.id,
            companyId: context.activeCompany.id,
            db,
            newBalance: Number(request.new_balance ?? 0),
            officeId: request.office_id ?? null,
            oldBalance: Number(request.old_balance ?? 0),
            reason: String(request.reason ?? ""),
            roomId: request.room_id ?? null,
            tenantId: request.tenant_id ?? null,
        });
    }

    const { data: updated, error: updateError } = await db
        .from("tenant_balance_adjustments")
        .update({
            admin_comment: input.comment ?? null,
            approved_at: new Date().toISOString(),
            approved_by: context.profile?.id ?? null,
            status: input.decision,
        })
        .eq("id", request.id)
        .select("*")
        .single();
    if (updateError) throw new Error(updateError.message);

    await notifyPaymentDateChange(db, {
        companyId: context.activeCompany.id,
        entityId: request.id,
        entityType: "tenant_balance_adjustment",
        message: input.decision === "approved"
            ? `Outstanding balance adjustment approved. New balance is UGX ${Math.round(Number(request.new_balance ?? 0)).toLocaleString()}.`
            : `Outstanding balance adjustment rejected. ${input.comment ?? ""}`.trim(),
        officeId: request.office_id ?? null,
        recipientType: "office",
        severity: input.decision === "approved" ? "success" : "warning",
        title: input.decision === "approved" ? "Outstanding balance adjustment approved" : "Outstanding balance adjustment rejected",
    });

    await logUserAction({
        action: input.decision === "approved" ? "tenant_balance_adjustment_approved" : "tenant_balance_adjustment_rejected",
        entityType: "tenant_balance_adjustment",
        entityId: request.id,
        companyId: context.activeCompany.id,
        officeId: request.office_id ?? null,
        beforeData: request,
        afterData: updated,
    });
    revalidateOperationsPages();
    return updated;
}

function collectionTypeForPaymentKind(kind: RecordCollectionInput["paymentKind"]) {
    switch (kind) {
        case "tenant_top_up":
            return "tenant_top_up";
        case "employer_sponsor":
            return "employer_sponsor";
        case "arrears":
            return "arrears";
        case "advance":
            return "advance";
        case "tenant_normal":
        default:
            return "rent";
    }
}

type PaymentCorrectionType = "date_change" | "amount_change" | "room_change" | "remove_payment";

function normalizeCorrectionType(value: string): PaymentCorrectionType {
    if (value === "date_change" || value === "amount_change" || value === "room_change" || value === "remove_payment") return value;
    throw new Error("Unsupported payment correction type.");
}

async function getActiveTenantForRoom(db: DynamicDb, companyId: string, roomNumberOrId: string, officeId?: string | null) {
    const term = roomNumberOrId.trim();
    if (!term) throw new Error("Requested room number is required.");
    let roomQuery = db
        .from("rooms")
        .select("*")
        .eq("company_id", companyId)
        .limit(10);
    if (/^[0-9a-f-]{36}$/i.test(term)) {
        roomQuery = roomQuery.eq("id", term);
    } else {
        roomQuery = roomQuery.ilike("room_number", term);
    }
    if (officeId) roomQuery = roomQuery.eq("office_id", officeId);
    const { data: rooms, error: roomError } = await roomQuery;
    if (roomError) throw new Error(roomError.message);
    if (!rooms?.length) throw new Error("Requested room was not found.");
    if (rooms.length > 1 && !officeId) throw new Error("This room number exists in multiple offices. Use the office-specific payment page or narrow the office first.");
    const room = rooms[0];

    const { data: lease, error: leaseError } = await db
        .from("leases")
        .select("*")
        .eq("company_id", companyId)
        .eq("room_id", room.id)
        .eq("status", "active")
        .maybeSingle();
    if (leaseError) throw new Error(leaseError.message);

    const tenantId = lease?.tenant_id ?? room.tenant_id ?? null;
    if (!tenantId) throw new Error("Requested room has no active tenant.");
    const { data: tenant, error: tenantError } = await db
        .from("tenants")
        .select("*")
        .eq("company_id", companyId)
        .eq("id", tenantId)
        .maybeSingle();
    if (tenantError) throw new Error(tenantError.message);
    if (!tenant) throw new Error("Requested room tenant was not found.");
    return { lease, room, tenant };
}

function correctionTypeLabel(type: PaymentCorrectionType) {
    if (type === "date_change") return "date change";
    if (type === "amount_change") return "amount change";
    if (type === "remove_payment") return "payment removal";
    return "room change";
}

function paymentLabelForKind(kind: RecordCollectionInput["paymentKind"], source: "tenant" | "employer") {
    switch (kind) {
        case "tenant_top_up":
            return "Tenant top-up";
        case "employer_sponsor":
            return "Employer / sponsor payment";
        case "arrears":
            return "Arrears payment";
        case "advance":
            return "Advance payment";
        case "tenant_normal":
        default:
            return source === "employer" ? "Employer contribution" : "Tenant normal payment";
    }
}

function buildTenantRentAllocations(input: {
    amount: number;
    balanceBefore: number;
    monthlyRent: number;
    paymentDate: string;
}) {
    const allocations: Array<{ allocationMonth: string; allocationType: "arrears" | "current_month" | "advance_month"; amount: number }> = [];
    let remaining = Math.max(0, input.amount);
    const currentMonth = monthStartDate(input.paymentDate);
    const currentMonthDue = Math.max(0, input.monthlyRent);
    const totalDueBeforePayment = Math.max(0, input.balanceBefore);
    const currentOutstandingDue = Math.min(currentMonthDue || totalDueBeforePayment, totalDueBeforePayment);
    const arrearsDue = Math.max(0, totalDueBeforePayment - currentOutstandingDue);
    if (arrearsDue > 0 && remaining > 0) {
        const arrearsMonthCount = currentMonthDue > 0 ? Math.max(1, Math.ceil(arrearsDue / currentMonthDue)) : 1;
        let arrearsRemaining = arrearsDue;
        for (let index = arrearsMonthCount; index >= 1 && remaining > 0; index -= 1) {
            const monthDue = currentMonthDue > 0 ? Math.min(currentMonthDue, arrearsRemaining) : arrearsRemaining;
            const arrearsPaid = Math.min(remaining, monthDue);
            if (arrearsPaid > 0) {
                allocations.push({ allocationMonth: addMonths(currentMonth, -index), allocationType: "arrears", amount: arrearsPaid });
                remaining -= arrearsPaid;
            }
            arrearsRemaining -= monthDue;
        }
    }
    const currentPaid = Math.min(remaining, currentOutstandingDue);
    if (currentPaid > 0) {
        allocations.push({ allocationMonth: currentMonth, allocationType: "current_month", amount: currentPaid });
        remaining -= currentPaid;
    }
    let advanceMonthIndex = 1;
    while (remaining > 0.004) {
        const allocationAmount = currentMonthDue > 0 ? Math.min(remaining, currentMonthDue) : remaining;
        allocations.push({ allocationMonth: addMonths(currentMonth, advanceMonthIndex), allocationType: "advance_month", amount: allocationAmount });
        remaining -= allocationAmount;
        advanceMonthIndex += 1;
        if (advanceMonthIndex > 120) break;
    }
    return allocations;
}

export async function recordCollection(input: RecordCollectionInput) {
    const context = await requireAuth();
    const isCollector = context.authMode === "collector" || context.roles.some((role) => role.role?.key === "field_collector");
    if (!isCollector && !hasPermission(context, "collections.payment.post")) {
        throw new Error("You do not have permission to post tenant payments.");
    }
    const supabase = isCollector ? createSupabaseAdminClient() : await createSupabaseServerClient();
    const amount = Number(input.amount);
    assertPositiveAmount(amount, "Collection amount");

    if (!context.activeCompany?.id || !context.activeOffice?.id) {
        throw new Error("Active company and office are required.");
    }
    const tenantContext = await getFastTenantPaymentContext({
        companyId: context.activeCompany.id,
        supabase,
        tenantId: input.tenantId,
    });

    const resolvedOfficeId =
        tenantContext.lease?.office_id ??
        tenantContext.room?.office_id ??
        tenantContext.tenant.office_id ??
        context.activeOffice.id;
    const balanceBefore = Math.max(0, tenantContext.outstandingBalance);
    const totalDueBeforePayment = balanceBefore;
    const balance = Math.max(0, totalDueBeforePayment - amount);
    const usedToClearOutstanding = Math.min(balanceBefore, amount);
    const paymentSource = input.paymentSource === "employer" || input.paymentKind === "employer_sponsor" ? "employer" : "tenant";
    const paymentKind = input.paymentKind ?? (paymentSource === "employer" ? "employer_sponsor" : "tenant_normal");
    const paymentDate = normalizePaymentDate(input.paymentDate);
    const paidAt = new Date().toISOString();
    const employerBalanceAfter = paymentSource === "employer"
        ? Math.max(0, tenantContext.contribution.employerBalance - amount)
        : tenantContext.contribution.employerBalance;
    const tenantTopUpBalanceAfter = paymentSource === "tenant"
        ? Math.max(0, tenantContext.contribution.tenantTopUpBalance - amount)
        : tenantContext.contribution.tenantTopUpBalance;
    const paymentLabel = paymentLabelForKind(paymentKind, paymentSource);
    const noteParts = [
        input.notes?.trim(),
        input.collectorName?.trim() ? `Collector: ${input.collectorName.trim()}` : null,
    ].filter(Boolean);
    const savedNotes = noteParts.length ? noteParts.join(" | ") : null;
    const { data, error } = await (supabase as unknown as DynamicDb)
        .from("collections")
        .insert({
            amount,
            amount_paid: amount,
            balance,
            balance_after_payment: balance,
            balance_before_payment: balanceBefore,
            cheque_reference: input.chequeReference || null,
            collection_number: collectionNumber(),
            company_id: context.activeCompany.id,
            employer_balance_after: employerBalanceAfter,
            employer_expected_amount: tenantContext.contribution.employerExpected || null,
            expected_amount: totalDueBeforePayment,
            allocated_to_next_month: 0,
            lease_id: tenantContext.lease?.id ?? null,
            notes: savedNotes,
            office_id: resolvedOfficeId,
            paid_at: paidAt,
            payment_date: paymentDate,
            payment_method: input.paymentMethod,
            payment_source: paymentSource,
            payer_name: input.payerName || (paymentSource === "employer" ? tenantContext.sponsor?.employer_name : tenantContext.tenant.full_name) || null,
            property_id: tenantContext.propertyId,
            recorded_by: context.profile?.id ?? null,
            reference_number: input.referenceNumber || null,
            room_id: tenantContext.room?.id ?? tenantContext.tenant.room_id,
            status: "paid",
            tenant_id: tenantContext.tenant.id,
            tenant_top_up_balance_after: tenantTopUpBalanceAfter,
            tenant_top_up_expected: tenantContext.contribution.tenantTopUpExpected || null,
            type: collectionTypeForPaymentKind(paymentKind),
            used_to_clear_outstanding: usedToClearOutstanding,
        })
        .select("*")
        .single();

    if (error) {
        throw new Error(error.message);
    }

    const rentAllocations = buildTenantRentAllocations({
        amount,
        balanceBefore,
        monthlyRent: tenantContext.monthlyRent,
        paymentDate,
    });
    const currentMonth = monthStartDate(paymentDate);
    const historicalCurrentMonthCredit = Math.max(0, Math.min(tenantContext.monthlyRent, tenantContext.monthlyRent - balanceBefore));
    let existingCurrentMonthPaid = 0;
    if (historicalCurrentMonthCredit > 0) {
        const existingAllocations = await (supabase as unknown as DynamicDb)
            .from("tenant_rent_allocations")
            .select("amount_allocated")
            .eq("company_id", context.activeCompany.id)
            .eq("tenant_id", tenantContext.tenant.id)
            .eq("allocation_month", currentMonth)
            .eq("allocation_type", "current_month");
        if (existingAllocations.error && !/does not exist|schema cache|Could not find/i.test(existingAllocations.error.message ?? "")) {
            throw new Error(existingAllocations.error.message);
        }
        existingCurrentMonthPaid = (existingAllocations.data ?? []).reduce((total: number, row: Record<string, unknown>) => total + Number(row.amount_allocated ?? 0), 0);
    }
    const missingHistoricalCredit = Math.max(0, historicalCurrentMonthCredit - existingCurrentMonthPaid);
    const allocationRows = [
        ...(missingHistoricalCredit > 0.004
            ? [{
                allocationMonth: currentMonth,
                allocationType: "current_month" as const,
                amount: missingHistoricalCredit,
                allocationSource: "historical_credit",
                isHistoricalCredit: true,
            }]
            : []),
        ...rentAllocations.map((allocation) => ({
            ...allocation,
            allocationSource: "payment",
            isHistoricalCredit: false,
        })),
    ];
    const advanceAmount = rentAllocations
        .filter((allocation) => allocation.allocationType === "advance_month")
        .reduce((total, allocation) => total + allocation.amount, 0);
    const allocatedToNextMonth = rentAllocations
        .filter((allocation) => allocation.allocationType === "advance_month" && allocation.allocationMonth.slice(0, 7) === addMonths(monthStartDate(paymentDate), 1).slice(0, 7))
        .reduce((total, allocation) => total + allocation.amount, 0);

    const criticalWrites: Array<PromiseLike<{ error?: { message?: string } | null } | void>> = [
        supabase
            .from("tenants")
            .update({ balance })
            .eq("id", tenantContext.tenant.id)
            .eq("company_id", context.activeCompany.id),
    ];

    if (tenantContext.room?.id) {
        criticalWrites.push(
            supabase
                .from("rooms")
                .update({ outstanding_balance: balance })
                .eq("id", tenantContext.room.id)
                .eq("company_id", context.activeCompany.id),
        );
    }

    if (allocationRows.length) {
        criticalWrites.push((supabase as unknown as DynamicDb).from("tenant_rent_allocations").insert(allocationRows.map((allocation) => ({
            allocation_month: allocation.allocationMonth,
            allocation_type: allocation.allocationType,
            amount_allocated: allocation.amount,
            allocation_source: allocation.allocationSource,
            company_id: context.activeCompany!.id,
            is_historical_credit: allocation.isHistoricalCredit,
            office_id: resolvedOfficeId,
            payment_id: data.id,
            room_id: tenantContext.room?.id ?? tenantContext.tenant.room_id ?? null,
            tenant_id: tenantContext.tenant.id,
        }))));
    }

    if (allocatedToNextMonth > 0) {
        criticalWrites.push((supabase as unknown as DynamicDb)
            .from("collections")
            .update({ allocated_to_next_month: allocatedToNextMonth })
            .eq("id", data.id)
            .eq("company_id", context.activeCompany.id));
    }

    const criticalResults = await Promise.all(criticalWrites);
    const criticalError = criticalResults.find((result) => result && "error" in result && result.error)?.error;
    if (criticalError && !/does not exist|schema cache|Could not find/i.test(criticalError.message ?? "")) {
        throw new Error(criticalError.message ?? "Payment balance update failed.");
    }

    const backgroundWrites: Array<PromiseLike<unknown>> = [
        recordCollectionLedgerAndCash({
            amount,
            balanceAfter: balance,
            balanceBefore,
            collectionId: data.id,
            companyId: context.activeCompany.id,
            description: savedNotes || `${paymentLabel} recorded via ${input.paymentMethod}`,
            leaseId: tenantContext.lease?.id ?? null,
            officeId: resolvedOfficeId,
            paidAt,
            recordedBy: context.profile?.id ?? null,
            supabase,
            tenantId: tenantContext.tenant.id,
        }),
        supabase.from("collection_actions").insert({
            action_type: "payment_recorded",
            company_id: context.activeCompany.id,
            lease_id: tenantContext.lease?.id ?? null,
            notes: savedNotes || `${paymentLabel} recorded via ${input.paymentMethod}`,
            office_id: resolvedOfficeId,
            outcome: "payment_recorded",
            performed_by: context.profile?.id ?? null,
            tenant_id: tenantContext.tenant.id,
        }),
        recalculateTenantScore({
            supabase,
            companyId: context.activeCompany.id,
            tenantId: tenantContext.tenant.id,
            event: "collection_recorded",
        }),
        logUserAction({
            action: "collection_recorded",
            entityType: "collection",
            entityId: data.id,
            companyId: context.activeCompany.id,
            officeId: resolvedOfficeId,
            afterData: data,
        }),
    ];

    if (advanceAmount > 0) {
        backgroundWrites.push((supabase as unknown as DynamicDb).from("notifications").insert({
            action_url: "/office/payments",
            channel: "in_app",
            company_id: context.activeCompany.id,
            delivery_status: "pending",
            entity_id: data.id,
            entity_type: "tenant_rent_allocation",
            is_read: false,
            message: `${tenantContext.tenant.full_name ?? "Tenant"} paid UGX ${Math.round(advanceAmount).toLocaleString()} above the current due amount. It has been allocated to next rent month(s).`,
            office_id: resolvedOfficeId,
            recipient_type: "office",
            severity: "success",
            title: advanceAmount >= tenantContext.monthlyRent ? "Tenant prepaid multiple months" : "Tenant overpaid rent",
        }));
    }

    void Promise.allSettled(backgroundWrites).then((results) => {
        const rejected = results.find((result) => result.status === "rejected");
        if (rejected) console.warn("Payment background update failed:", rejected.reason);
    });

    revalidateFastPaymentPages();
    return {
        ...data,
        allocationSummary: {
            advanceAmount,
            allocations: rentAllocations,
            arrearsPaid: rentAllocations.filter((allocation) => allocation.allocationType === "arrears").reduce((total, allocation) => total + allocation.amount, 0),
            currentMonthPaid: rentAllocations.filter((allocation) => allocation.allocationType === "current_month").reduce((total, allocation) => total + allocation.amount, 0),
            remainingBalance: balance,
        },
    };
}

export async function checkCollectionDuplicate(input: { tenantId: string; paymentDate: string }) {
    const context = await requirePermission("collections.payment.post");
    const tenantContext = await getTenantCollectionContext(input.tenantId);
    const supabase = await createSupabaseServerClient();

    if (!context.activeCompany?.id) {
        throw new Error("Active company is required.");
    }

    const dateOnly = input.paymentDate.slice(0, 10);
    assertDate(dateOnly, "Payment date");
    const roomId = tenantContext.room?.id ?? tenantContext.tenant.room_id;

    let query = supabase
        .from("collections")
        .select("id, amount_paid, paid_at, payment_date, payment_method", { count: "exact" })
        .eq("company_id", context.activeCompany.id)
        .eq("payment_date", dateOnly)
        .limit(3);

    if (roomId) {
        query = query.eq("room_id", roomId);
    } else {
        query = query.eq("tenant_id", tenantContext.tenant.id);
    }

    const { data, count, error } = await query;
    if (error) throw new Error(error.message);

    return {
        duplicate: Number(count ?? 0) > 0,
        count: Number(count ?? 0),
        rows: data ?? [],
    };
}

export async function requestPaymentDateChange(input: {
    paymentId: string;
    requestedPaymentDate: string;
    reason: string;
}) {
    const context = await requirePermission("collections.payment.post");
    const supabase = await createSupabaseServerClient();
    const db = supabase as unknown as DynamicDb;

    if (!context.activeCompany?.id || !context.activeOffice?.id) {
        throw new Error("Active company and office are required.");
    }
    if (!input.paymentId) throw new Error("Payment record is required.");
    const requestedDate = input.requestedPaymentDate.slice(0, 10);
    assertDate(requestedDate, "Requested correct date");
    const reason = input.reason.trim();
    if (!reason) throw new Error("Reason for date correction is required.");

    const { data: payment, error: paymentError } = await db
        .from("collections")
        .select("*")
        .eq("id", input.paymentId)
        .eq("company_id", context.activeCompany.id)
        .maybeSingle();
    if (paymentError) throw new Error(paymentError.message);
    if (!payment) throw new Error("Payment record not found.");

    const paymentOfficeId = String(payment.office_id ?? "");
    if (!(context.isCompanyAdmin || context.canAccessAllOffices) && paymentOfficeId !== context.activeOffice.id) {
        throw new Error("You can only request date changes for payments in your active office.");
    }

    const { data: existing, error: existingError } = await db
        .from("payment_date_change_requests")
        .select("id, status")
        .eq("company_id", context.activeCompany.id)
        .eq("payment_id", input.paymentId)
        .eq("status", "pending")
        .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (existing) throw new Error("This payment already has a pending date change request.");

    const originalPaymentDate = paymentBusinessDate(payment);
    if (!originalPaymentDate) throw new Error("Original payment date is missing.");

    const { data, error } = await db
        .from("payment_date_change_requests")
        .insert({
            company_id: context.activeCompany.id,
            office_id: payment.office_id ?? context.activeOffice.id,
            original_payment_date: originalPaymentDate,
            payment_id: input.paymentId,
            reason,
            requested_by: context.profile?.id ?? null,
            requested_payment_date: requestedDate,
            room_id: payment.room_id ?? null,
            status: "pending",
            tenant_id: payment.tenant_id ?? null,
        })
        .select("*")
        .single();
    if (error) throw new Error(error.message);

    await notifyPaymentDateChange(db, {
        companyId: context.activeCompany.id,
        entityId: data.id,
        message: `Payment date change requested from ${originalPaymentDate} to ${requestedDate}. Reason: ${reason}`,
        officeId: payment.office_id ?? context.activeOffice.id,
        recipientType: "admin",
        severity: "warning",
        title: "Pending payment date change approval",
    });

    await logUserAction({
        action: "payment_date_change_requested",
        entityType: "payment_date_change_request",
        entityId: data.id,
        companyId: context.activeCompany.id,
        officeId: payment.office_id ?? context.activeOffice.id,
        beforeData: payment,
        afterData: data,
    });

    revalidatePaymentDateChangePages();
    return data;
}

export async function decidePaymentDateChange(input: {
    requestId: string;
    decision: "approved" | "rejected";
    comment?: string | null;
}) {
    const context = await requireCompanyAdminMode();
    const supabase = await createSupabaseServerClient();
    const db = supabase as unknown as DynamicDb;
    if (!context.activeCompany?.id) throw new Error("Active company is required.");
    if (!input.requestId) throw new Error("Request id is required.");
    if (input.decision === "rejected" && !String(input.comment ?? "").trim()) {
        throw new Error("Rejection reason is required.");
    }

    const { data: request, error } = await db
        .from("payment_date_change_requests")
        .select("*")
        .eq("id", input.requestId)
        .eq("company_id", context.activeCompany.id)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!request) throw new Error("Payment date change request not found.");
    if (request.status !== "pending") throw new Error("This date change request has already been decided.");

    const { data: payment, error: paymentError } = await db
        .from("collections")
        .select("*")
        .eq("id", request.payment_id)
        .eq("company_id", context.activeCompany.id)
        .maybeSingle();
    if (paymentError) throw new Error(paymentError.message);
    if (!payment) throw new Error("Payment record not found.");

    let updatedPayment = payment;
    if (input.decision === "approved") {
        const { data: collectionUpdate, error: collectionError } = await db
            .from("collections")
            .update({ payment_date: String(request.requested_payment_date).slice(0, 10) })
            .eq("id", request.payment_id)
            .eq("company_id", context.activeCompany.id)
            .select("*")
            .single();
        if (collectionError) throw new Error(collectionError.message);
        updatedPayment = collectionUpdate;

        const cashUpdate = await db
            .from("cash_transactions")
            .update({ transaction_date: businessDateStartIso(String(request.requested_payment_date)) })
            .eq("company_id", context.activeCompany.id)
            .eq("source_type", "collection")
            .eq("source_id", request.payment_id);
        if (cashUpdate.error) throw new Error(cashUpdate.error.message);
    }

    const { data: updatedRequest, error: updateError } = await db
        .from("payment_date_change_requests")
        .update({
            admin_comment: input.comment ?? null,
            reviewed_at: new Date().toISOString(),
            reviewed_by: context.profile?.id ?? null,
            status: input.decision,
        })
        .eq("id", input.requestId)
        .select("*")
        .single();
    if (updateError) throw new Error(updateError.message);

    await notifyPaymentDateChange(db, {
        companyId: context.activeCompany.id,
        entityId: updatedRequest.id,
        message: input.decision === "approved"
            ? `Payment date correction approved. New payment date: ${paymentBusinessDate(updatedPayment)}.`
            : `Payment date correction rejected. ${input.comment ?? ""}`.trim(),
        officeId: request.office_id ?? payment.office_id ?? null,
        recipientType: "office",
        severity: input.decision === "approved" ? "success" : "warning",
        title: input.decision === "approved" ? "Payment date change approved" : "Payment date change rejected",
    });

    await logUserAction({
        action: input.decision === "approved" ? "payment_date_change_approved" : "payment_date_change_rejected",
        entityType: "payment_date_change_request",
        entityId: updatedRequest.id,
        companyId: context.activeCompany.id,
        officeId: request.office_id ?? payment.office_id ?? null,
        beforeData: { request, payment },
        afterData: { request: updatedRequest, payment: updatedPayment },
    });

    revalidatePaymentDateChangePages();
    return updatedRequest;
}

export async function requestPaymentCorrection(input: {
    paymentId: string;
    correctionType: PaymentCorrectionType;
    requestedPaymentDate?: string;
    requestedAmount?: number;
    requestedRoomNumber?: string;
    reason: string;
}) {
    const context = await requirePermission("collections.payment.post");
    const supabase = await createSupabaseServerClient();
    const db = supabase as unknown as DynamicDb;
    if (!context.activeCompany?.id || !context.activeOffice?.id) throw new Error("Active company and office are required.");
    const correctionType = normalizeCorrectionType(input.correctionType);
    const reason = input.reason.trim();
    if (!reason) throw new Error("Reason for payment correction is required.");

    const { data: payment, error: paymentError } = await db
        .from("collections")
        .select("*")
        .eq("company_id", context.activeCompany.id)
        .eq("id", input.paymentId)
        .maybeSingle();
    if (paymentError) throw new Error(paymentError.message);
    if (!payment) throw new Error("Payment record not found.");
    if (!(context.isCompanyAdmin || context.canAccessAllOffices) && payment.office_id !== context.activeOffice.id) {
        throw new Error("You can only request corrections for payments in your active office.");
    }

    const { data: existing, error: existingError } = await db
        .from("payment_correction_requests")
        .select("id")
        .eq("company_id", context.activeCompany.id)
        .eq("payment_id", input.paymentId)
        .eq("correction_type", correctionType)
        .eq("status", "pending")
        .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (existing) throw new Error(`This payment already has a pending ${correctionTypeLabel(correctionType)} request.`);

    let requestedDate: string | null = null;
    let requestedAmount: number | null = null;
    let requestedRoom: Record<string, unknown> | null = null;
    let requestedTenant: Record<string, unknown> | null = null;
    if (correctionType === "date_change") {
        requestedDate = input.requestedPaymentDate?.slice(0, 10) ?? "";
        assertDate(requestedDate, "Requested correct date");
    }
    if (correctionType === "amount_change") {
        requestedAmount = Number(input.requestedAmount);
        assertPositiveAmount(requestedAmount, "Requested amount");
    }
    if (correctionType === "room_change") {
        const contextForRoom = await getActiveTenantForRoom(
            db,
            context.activeCompany.id,
            input.requestedRoomNumber ?? "",
            context.isCompanyAdmin || context.canAccessAllOffices ? null : context.activeOffice.id,
        );
        requestedRoom = contextForRoom.room;
        requestedTenant = contextForRoom.tenant;
    }

    const originalValue = {
        amount: Number(payment.amount_paid ?? payment.amount ?? 0),
        balance: Number(payment.balance ?? 0),
        payment_date: paymentBusinessDate(payment),
        room_id: payment.room_id ?? null,
        tenant_id: payment.tenant_id ?? null,
        status: payment.status ?? null,
    };
    const requestedValue = {
        amount: requestedAmount,
        payment_date: requestedDate,
        room_id: requestedRoom?.id ?? null,
        room_number: requestedRoom?.room_number ?? input.requestedRoomNumber ?? null,
        tenant_id: requestedTenant?.id ?? null,
        tenant_name: requestedTenant?.full_name ?? null,
        remove_payment: correctionType === "remove_payment",
        status: correctionType === "remove_payment" ? "removed_by_admin_approval" : null,
    };

    const { data, error } = await db
        .from("payment_correction_requests")
        .insert({
            company_id: context.activeCompany.id,
            correction_type: correctionType,
            office_id: payment.office_id ?? context.activeOffice.id,
            original_amount: Number(payment.amount_paid ?? payment.amount ?? 0),
            original_payment_date: paymentBusinessDate(payment) || null,
            original_room_id: payment.room_id ?? null,
            original_tenant_id: payment.tenant_id ?? null,
            original_value: originalValue,
            payment_id: input.paymentId,
            reason,
            requested_amount: requestedAmount,
            requested_by: context.profile?.id ?? null,
            requested_payment_date: requestedDate,
            requested_room_id: requestedRoom?.id ?? null,
            requested_tenant_id: requestedTenant?.id ?? null,
            requested_value: requestedValue,
            room_id: payment.room_id ?? null,
            status: "pending",
            tenant_id: payment.tenant_id ?? null,
        })
        .select("*")
        .single();
    if (error) throw new Error(error.message);

    await notifyPaymentDateChange(db, {
        companyId: context.activeCompany.id,
        entityId: data.id,
        message: `Payment ${correctionTypeLabel(correctionType)} requested. Reason: ${reason}`,
        officeId: payment.office_id ?? context.activeOffice.id,
        recipientType: "admin",
        severity: "warning",
        title: "Pending payment correction approval",
    });

    await logUserAction({
        action: "payment_correction_requested",
        entityType: "payment_correction_request",
        entityId: data.id,
        companyId: context.activeCompany.id,
        officeId: payment.office_id ?? context.activeOffice.id,
        beforeData: payment,
        afterData: data,
    });

    revalidatePaymentDateChangePages();
    return data;
}

export async function decidePaymentCorrection(input: {
    requestId: string;
    decision: "approved" | "rejected";
    comment?: string | null;
}) {
    const context = await requireCompanyAdminMode();
    const supabase = await createSupabaseServerClient();
    const db = supabase as unknown as DynamicDb;
    if (!context.activeCompany?.id) throw new Error("Active company is required.");
    if (input.decision === "rejected" && !String(input.comment ?? "").trim()) throw new Error("Rejection reason is required.");

    const { data: request, error } = await db
        .from("payment_correction_requests")
        .select("*")
        .eq("company_id", context.activeCompany.id)
        .eq("id", input.requestId)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!request) throw new Error("Payment correction request not found.");
    if (request.status !== "pending") throw new Error("This payment correction request has already been decided.");

    const { data: payment, error: paymentError } = await db
        .from("collections")
        .select("*")
        .eq("company_id", context.activeCompany.id)
        .eq("id", request.payment_id)
        .maybeSingle();
    if (paymentError) throw new Error(paymentError.message);
    if (!payment) throw new Error("Payment record not found.");

    let updatedPayment = payment;
    if (input.decision === "approved") {
        const type = normalizeCorrectionType(String(request.correction_type));
        const paymentAmount = Number(payment.amount_paid ?? payment.amount ?? 0);
        if (type === "date_change") {
            const correctedPaymentDate = String(request.requested_payment_date).slice(0, 10);
            assertDate(correctedPaymentDate, "Requested payment date");
            const update = await db
                .from("collections")
                .update({ payment_date: correctedPaymentDate })
                .eq("id", request.payment_id)
                .eq("company_id", context.activeCompany.id)
                .select("*")
                .single();
            if (update.error) throw new Error(update.error.message);
            updatedPayment = update.data;
            const cashUpdate = await db
                .from("cash_transactions")
                .update({ transaction_date: businessDateStartIso(correctedPaymentDate) })
                .eq("company_id", context.activeCompany.id)
                .eq("source_type", "collection")
                .eq("source_id", request.payment_id);
            if (cashUpdate.error) throw new Error(cashUpdate.error.message);
        }
        if (type === "amount_change") {
            const newAmount = Number(request.requested_amount ?? 0);
            assertPositiveAmount(newAmount, "Approved amount");
            const delta = newAmount - paymentAmount;
            const { data: tenant } = payment.tenant_id
                ? await db.from("tenants").select("*").eq("company_id", context.activeCompany.id).eq("id", payment.tenant_id).maybeSingle()
                : { data: null };
            const nextBalance = Math.max(0, Number(tenant?.balance ?? payment.balance ?? 0) - delta);
            if (tenant?.id) {
                const tenantUpdate = await db.from("tenants").update({ balance: nextBalance }).eq("company_id", context.activeCompany.id).eq("id", tenant.id);
                if (tenantUpdate.error) throw new Error(tenantUpdate.error.message);
            }
            if (payment.room_id) {
                const roomUpdate = await db.from("rooms").update({ outstanding_balance: nextBalance }).eq("company_id", context.activeCompany.id).eq("id", payment.room_id);
                if (roomUpdate.error) throw new Error(roomUpdate.error.message);
            }
            const update = await db
                .from("collections")
                .update({ amount: newAmount, amount_paid: newAmount, balance: nextBalance })
                .eq("id", request.payment_id)
                .eq("company_id", context.activeCompany.id)
                .select("*")
                .single();
            if (update.error) throw new Error(update.error.message);
            updatedPayment = update.data;
            const cashUpdate = await db
                .from("cash_transactions")
                .update({ amount: newAmount })
                .eq("company_id", context.activeCompany.id)
                .eq("source_type", "collection")
                .eq("source_id", request.payment_id);
            if (cashUpdate.error) throw new Error(cashUpdate.error.message);
            await db.from("tenant_ledger_entries").insert({
                amount: Math.abs(delta),
                balance_after: nextBalance,
                company_id: context.activeCompany.id,
                description: `Admin approved payment amount correction from UGX ${Math.round(paymentAmount).toLocaleString()} to UGX ${Math.round(newAmount).toLocaleString()}.`,
                entry_type: delta >= 0 ? "credit" : "debit",
                lease_id: payment.lease_id ?? null,
                office_id: payment.office_id ?? request.office_id ?? null,
                source_id: request.id,
                source_type: "payment_correction_amount",
                tenant_id: payment.tenant_id ?? null,
            });
        }
        if (type === "room_change") {
            const targetRoomId = String(request.requested_room_id ?? "");
            if (!targetRoomId) throw new Error("Requested room is missing.");
            const roomContext = await getActiveTenantForRoom(db, context.activeCompany.id, targetRoomId, null);
            const oldTenantId = payment.tenant_id ?? request.original_tenant_id ?? null;
            const oldTenantResult = oldTenantId
                ? await db.from("tenants").select("*").eq("company_id", context.activeCompany.id).eq("id", oldTenantId).maybeSingle()
                : { data: null, error: null };
            if (oldTenantResult.error) throw new Error(oldTenantResult.error.message);
            const oldTenant = oldTenantResult.data;
            if (oldTenant?.id) {
                const oldBalance = Math.max(0, Number(oldTenant.balance ?? 0) + paymentAmount);
                const oldUpdate = await db.from("tenants").update({ balance: oldBalance }).eq("company_id", context.activeCompany.id).eq("id", oldTenant.id);
                if (oldUpdate.error) throw new Error(oldUpdate.error.message);
                if (payment.room_id) await db.from("rooms").update({ outstanding_balance: oldBalance }).eq("company_id", context.activeCompany.id).eq("id", payment.room_id);
            }
            const newTenant = roomContext.tenant;
            const newBalance = Math.max(0, Number(newTenant.balance ?? 0) - paymentAmount);
            const newTenantUpdate = await db.from("tenants").update({ balance: newBalance }).eq("company_id", context.activeCompany.id).eq("id", newTenant.id);
            if (newTenantUpdate.error) throw new Error(newTenantUpdate.error.message);
            const newRoomUpdate = await db.from("rooms").update({ outstanding_balance: newBalance }).eq("company_id", context.activeCompany.id).eq("id", roomContext.room.id);
            if (newRoomUpdate.error) throw new Error(newRoomUpdate.error.message);
            const update = await db
                .from("collections")
                .update({
                    lease_id: roomContext.lease?.id ?? null,
                    office_id: roomContext.room.office_id ?? payment.office_id,
                    property_id: roomContext.room.property_id ?? payment.property_id ?? null,
                    room_id: roomContext.room.id,
                    tenant_id: newTenant.id,
                    balance: newBalance,
                })
                .eq("id", request.payment_id)
                .eq("company_id", context.activeCompany.id)
                .select("*")
                .single();
            if (update.error) throw new Error(update.error.message);
            updatedPayment = update.data;
        }
        if (type === "remove_payment") {
            if (String(payment.status ?? "").toLowerCase() === "removed_by_admin_approval" || String(payment.status ?? "").toLowerCase() === "voided") {
                throw new Error("This payment has already been removed.");
            }
            const removal = await applyApprovedPaymentRemoval({
                companyId: context.activeCompany.id,
                db,
                payment,
                reason: String(input.comment ?? request.reason ?? ""),
                reviewedOfficeId: request.office_id ?? null,
                sourceId: request.id,
                sourceType: "payment_removal",
            });
            updatedPayment = removal.payment;
        }
    }

    const { data: updatedRequest, error: updateError } = await db
        .from("payment_correction_requests")
        .update({
            admin_comment: input.comment ?? null,
            reviewed_at: new Date().toISOString(),
            reviewed_by: context.profile?.id ?? null,
            status: input.decision,
        })
        .eq("id", input.requestId)
        .select("*")
        .single();
    if (updateError) throw new Error(updateError.message);

    await notifyPaymentDateChange(db, {
        companyId: context.activeCompany.id,
        entityId: updatedRequest.id,
        message: input.decision === "approved"
            ? `Payment ${correctionTypeLabel(normalizeCorrectionType(String(request.correction_type)))} approved.`
            : `Payment correction rejected. ${input.comment ?? ""}`.trim(),
        officeId: updatedPayment.office_id ?? request.office_id ?? null,
        recipientType: "office",
        severity: input.decision === "approved" ? "success" : "warning",
        title: input.decision === "approved" ? "Payment correction approved" : "Payment correction rejected",
    });

    await logUserAction({
        action: input.decision === "approved" ? "payment_correction_approved" : "payment_correction_rejected",
        entityType: "payment_correction_request",
        entityId: updatedRequest.id,
        companyId: context.activeCompany.id,
        officeId: updatedPayment.office_id ?? request.office_id ?? null,
        beforeData: { request, payment },
        afterData: { request: updatedRequest, payment: updatedPayment },
    });

    revalidatePaymentDateChangePages();
    return updatedRequest;
}

export async function adminCorrectPayment(input: {
    paymentId: string;
    correctionType: PaymentCorrectionType;
    correctedPaymentDate?: string;
    correctedAmount?: number;
    correctedRoomNumber?: string;
    reason: string;
}) {
    const context = await requireCompanyAdminMode();
    const supabase = await createSupabaseServerClient();
    const db = supabase as unknown as DynamicDb;
    if (!context.activeCompany?.id) throw new Error("Active company is required.");
    if (!input.paymentId) throw new Error("Payment record is required.");
    const correctionType = normalizeCorrectionType(input.correctionType);
    const reason = input.reason.trim();
    if (!reason) throw new Error("Correction reason is required.");

    const { data: payment, error: paymentError } = await db
        .from("collections")
        .select("*")
        .eq("company_id", context.activeCompany.id)
        .eq("id", input.paymentId)
        .maybeSingle();
    if (paymentError) throw new Error(paymentError.message);
    if (!payment) throw new Error("Payment record not found.");

    const originalAmount = Number(payment.amount_paid ?? payment.amount ?? 0);
    const originalPaymentDate = paymentBusinessDate(payment);
    let requestedDate: string | null = null;
    let requestedAmount: number | null = null;
    let requestedRoom: Record<string, unknown> | null = null;
    let requestedTenant: Record<string, unknown> | null = null;
    let updatedPayment = payment;

    if (correctionType === "date_change") {
        requestedDate = normalizePaymentDate(input.correctedPaymentDate);
        const update = await db
            .from("collections")
            .update({ payment_date: requestedDate })
            .eq("id", input.paymentId)
            .eq("company_id", context.activeCompany.id)
            .select("*")
            .single();
        if (update.error) throw new Error(update.error.message);
        updatedPayment = update.data;

        const cashUpdate = await db
            .from("cash_transactions")
            .update({ transaction_date: businessDateStartIso(requestedDate) })
            .eq("company_id", context.activeCompany.id)
            .eq("source_type", "collection")
            .eq("source_id", input.paymentId);
        if (cashUpdate.error) throw new Error(cashUpdate.error.message);
    }

    if (correctionType === "amount_change") {
        requestedAmount = Number(input.correctedAmount);
        assertPositiveAmount(requestedAmount, "Corrected amount");
        const delta = requestedAmount - originalAmount;
        const { data: tenant, error: tenantError } = payment.tenant_id
            ? await db.from("tenants").select("*").eq("company_id", context.activeCompany.id).eq("id", payment.tenant_id).maybeSingle()
            : { data: null, error: null };
        if (tenantError) throw new Error(tenantError.message);
        const nextBalance = Math.max(0, Number(tenant?.balance ?? payment.balance ?? 0) - delta);
        if (tenant?.id) {
            const tenantUpdate = await db.from("tenants").update({ balance: nextBalance }).eq("company_id", context.activeCompany.id).eq("id", tenant.id);
            if (tenantUpdate.error) throw new Error(tenantUpdate.error.message);
        }
        if (payment.room_id) {
            const roomUpdate = await db.from("rooms").update({ outstanding_balance: nextBalance }).eq("company_id", context.activeCompany.id).eq("id", payment.room_id);
            if (roomUpdate.error) throw new Error(roomUpdate.error.message);
        }
        const update = await db
            .from("collections")
            .update({ amount: requestedAmount, amount_paid: requestedAmount, balance: nextBalance })
            .eq("id", input.paymentId)
            .eq("company_id", context.activeCompany.id)
            .select("*")
            .single();
        if (update.error) throw new Error(update.error.message);
        updatedPayment = update.data;

        const cashUpdate = await db
            .from("cash_transactions")
            .update({ amount: requestedAmount })
            .eq("company_id", context.activeCompany.id)
            .eq("source_type", "collection")
            .eq("source_id", input.paymentId);
        if (cashUpdate.error) throw new Error(cashUpdate.error.message);

        const ledgerInsert = await db.from("tenant_ledger_entries").insert({
            amount: Math.abs(delta),
            balance_after: nextBalance,
            company_id: context.activeCompany.id,
            description: `Admin corrected payment amount from UGX ${Math.round(originalAmount).toLocaleString()} to UGX ${Math.round(requestedAmount).toLocaleString()}. Reason: ${reason}`,
            entry_type: delta >= 0 ? "credit" : "debit",
            lease_id: payment.lease_id ?? null,
            office_id: payment.office_id ?? null,
            source_id: input.paymentId,
            source_type: "admin_payment_correction_amount",
            tenant_id: payment.tenant_id ?? null,
        });
        if (ledgerInsert.error) throw new Error(ledgerInsert.error.message);
    }

    if (correctionType === "room_change") {
        const roomContext = await getActiveTenantForRoom(db, context.activeCompany.id, input.correctedRoomNumber ?? "", null);
        requestedRoom = roomContext.room;
        requestedTenant = roomContext.tenant;
        const oldTenantId = payment.tenant_id ?? null;
        const oldTenantResult = oldTenantId
            ? await db.from("tenants").select("*").eq("company_id", context.activeCompany.id).eq("id", oldTenantId).maybeSingle()
            : { data: null, error: null };
        if (oldTenantResult.error) throw new Error(oldTenantResult.error.message);
        const oldTenant = oldTenantResult.data;
        if (oldTenant?.id) {
            const oldBalance = Math.max(0, Number(oldTenant.balance ?? 0) + originalAmount);
            const oldUpdate = await db.from("tenants").update({ balance: oldBalance }).eq("company_id", context.activeCompany.id).eq("id", oldTenant.id);
            if (oldUpdate.error) throw new Error(oldUpdate.error.message);
            if (payment.room_id) {
                const oldRoomUpdate = await db.from("rooms").update({ outstanding_balance: oldBalance }).eq("company_id", context.activeCompany.id).eq("id", payment.room_id);
                if (oldRoomUpdate.error) throw new Error(oldRoomUpdate.error.message);
            }
        }

        const newTenant = roomContext.tenant;
        const newBalance = Math.max(0, Number(newTenant.balance ?? 0) - originalAmount);
        const newTenantUpdate = await db.from("tenants").update({ balance: newBalance }).eq("company_id", context.activeCompany.id).eq("id", newTenant.id);
        if (newTenantUpdate.error) throw new Error(newTenantUpdate.error.message);
        const newRoomUpdate = await db.from("rooms").update({ outstanding_balance: newBalance }).eq("company_id", context.activeCompany.id).eq("id", roomContext.room.id);
        if (newRoomUpdate.error) throw new Error(newRoomUpdate.error.message);

        const update = await db
            .from("collections")
            .update({
                balance: newBalance,
                lease_id: roomContext.lease?.id ?? null,
                office_id: roomContext.room.office_id ?? payment.office_id,
                property_id: roomContext.room.property_id ?? payment.property_id ?? null,
                room_id: roomContext.room.id,
                tenant_id: newTenant.id,
            })
            .eq("id", input.paymentId)
            .eq("company_id", context.activeCompany.id)
            .select("*")
            .single();
        if (update.error) throw new Error(update.error.message);
        updatedPayment = update.data;
    }

    if (correctionType === "remove_payment") {
        if (String(payment.status ?? "").toLowerCase() === "removed_by_admin_approval" || String(payment.status ?? "").toLowerCase() === "voided") {
            throw new Error("This payment has already been removed.");
        }
        const removal = await applyApprovedPaymentRemoval({
            companyId: context.activeCompany.id,
            db,
            payment,
            reason,
            reviewedOfficeId: payment.office_id ?? null,
            sourceId: input.paymentId,
            sourceType: "admin_payment_removal",
        });
        updatedPayment = removal.payment;
    }

    const requestedValue = {
        amount: requestedAmount,
        payment_date: requestedDate,
        room_id: requestedRoom?.id ?? null,
        room_number: requestedRoom?.room_number ?? input.correctedRoomNumber ?? null,
        tenant_id: requestedTenant?.id ?? null,
        tenant_name: requestedTenant?.full_name ?? null,
        remove_payment: correctionType === "remove_payment",
        status: correctionType === "remove_payment" ? "removed_by_admin_approval" : null,
    };
    const originalValue = {
        amount: originalAmount,
        balance: Number(payment.balance ?? 0),
        payment_date: originalPaymentDate,
        room_id: payment.room_id ?? null,
        status: payment.status ?? null,
        tenant_id: payment.tenant_id ?? null,
    };

    const { data: correction, error: correctionError } = await db
        .from("payment_correction_requests")
        .insert({
            admin_comment: reason,
            company_id: context.activeCompany.id,
            correction_type: correctionType,
            office_id: updatedPayment.office_id ?? payment.office_id ?? null,
            original_amount: originalAmount,
            original_payment_date: originalPaymentDate || null,
            original_room_id: payment.room_id ?? null,
            original_tenant_id: payment.tenant_id ?? null,
            original_value: originalValue,
            payment_id: input.paymentId,
            reason,
            requested_amount: requestedAmount,
            requested_by: context.profile?.id ?? null,
            requested_payment_date: requestedDate,
            requested_room_id: requestedRoom?.id ?? null,
            requested_tenant_id: requestedTenant?.id ?? null,
            requested_value: requestedValue,
            reviewed_at: new Date().toISOString(),
            reviewed_by: context.profile?.id ?? null,
            room_id: updatedPayment.room_id ?? payment.room_id ?? null,
            status: "approved",
            tenant_id: updatedPayment.tenant_id ?? payment.tenant_id ?? null,
        })
        .select("*")
        .single();
    if (correctionError) throw new Error(correctionError.message);

    await logUserAction({
        action: "admin_payment_corrected",
        entityType: "collection",
        entityId: input.paymentId,
        companyId: context.activeCompany.id,
        officeId: updatedPayment.office_id ?? payment.office_id ?? null,
        beforeData: { payment, correction: originalValue },
        afterData: { payment: updatedPayment, correction },
    });

    revalidatePaymentDateChangePages();
    return { correction, payment: updatedPayment };
}

export async function previewBulkPaymentDateCorrection(input: {
    currentPaymentDate: string;
    correctedPaymentDate: string;
    officeId?: string | null;
}) {
    const context = await requireCompanyAdminMode();
    const supabase = await createSupabaseServerClient();
    const db = supabase as unknown as DynamicDb;
    if (!context.activeCompany?.id) throw new Error("Active company is required.");
    const currentPaymentDate = normalizePaymentDate(input.currentPaymentDate);
    const correctedPaymentDate = normalizePaymentDate(input.correctedPaymentDate);
    if (currentPaymentDate === correctedPaymentDate) throw new Error("Current and corrected dates must be different.");

    let query = db
        .from("collections")
        .select("id, amount_paid, amount, room_id, tenant_id, office_id, payment_method, created_at", { count: "exact" })
        .eq("company_id", context.activeCompany.id)
        .eq("payment_date", currentPaymentDate)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(1000);

    if (input.officeId) {
        query = query.eq("office_id", input.officeId);
    }

    const { data, count, error } = await query;
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const totalAmount = rows.reduce((total, row) => total + Number(row.amount_paid ?? row.amount ?? 0), 0);
    const roomIds = [...new Set(rows.map((row) => String(row.room_id ?? "")).filter(Boolean))];
    const tenantIds = [...new Set(rows.map((row) => String(row.tenant_id ?? "")).filter(Boolean))];
    const [{ data: rooms }, { data: tenants }] = await Promise.all([
        roomIds.length
            ? db.from("rooms").select("id, room_number").eq("company_id", context.activeCompany.id).in("id", roomIds)
            : { data: [] },
        tenantIds.length
            ? db.from("tenants").select("id, full_name").eq("company_id", context.activeCompany.id).in("id", tenantIds)
            : { data: [] },
    ]);
    const roomById = new Map(((rooms ?? []) as Array<Record<string, unknown>>).map((room) => [String(room.id), String(room.room_number ?? "Unknown room")]));
    const tenantById = new Map(((tenants ?? []) as Array<Record<string, unknown>>).map((tenant) => [String(tenant.id), String(tenant.full_name ?? "Unnamed tenant")]));

    return {
        count: Number(count ?? rows.length),
        currentPaymentDate,
        correctedPaymentDate,
        totalAmount,
        rows: rows.map((row) => ({
            id: String(row.id),
            amount: Number(row.amount_paid ?? row.amount ?? 0),
            createdAt: row.created_at ? String(row.created_at) : null,
            method: row.payment_method ? String(row.payment_method) : "payment",
            roomNumber: row.room_id ? roomById.get(String(row.room_id)) ?? "Unknown room" : "Unknown room",
            tenantName: row.tenant_id ? tenantById.get(String(row.tenant_id)) ?? "Unnamed tenant" : "Unnamed tenant",
        })),
    };
}

export async function applyBulkPaymentDateCorrection(input: {
    currentPaymentDate: string;
    correctedPaymentDate: string;
    officeId?: string | null;
    paymentIds?: string[];
    reason: string;
}) {
    const context = await requireCompanyAdminMode();
    const supabase = await createSupabaseServerClient();
    const db = supabase as unknown as DynamicDb;
    if (!context.activeCompany?.id) throw new Error("Active company is required.");
    const currentPaymentDate = normalizePaymentDate(input.currentPaymentDate);
    const correctedPaymentDate = normalizePaymentDate(input.correctedPaymentDate);
    if (currentPaymentDate === correctedPaymentDate) throw new Error("Current and corrected dates must be different.");
    const reason = input.reason.trim();
    if (!reason) throw new Error("A correction reason is required.");

    let selectQuery = db
        .from("collections")
        .select("id, amount_paid, amount, office_id")
        .eq("company_id", context.activeCompany.id)
        .eq("payment_date", currentPaymentDate)
        .limit(1000);

    const selectedPaymentIds = [...new Set((input.paymentIds ?? []).map((id) => id.trim()).filter(Boolean))];
    if (selectedPaymentIds.length) {
        selectQuery = selectQuery.in("id", selectedPaymentIds);
    }

    if (input.officeId) {
        selectQuery = selectQuery.eq("office_id", input.officeId);
    }

    const { data: rows, error: selectError } = await selectQuery;
    if (selectError) throw new Error(selectError.message);
    const paymentIds = ((rows ?? []) as Array<Record<string, unknown>>).map((row) => String(row.id)).filter(Boolean);
    if (!paymentIds.length) {
        return { count: 0, totalAmount: 0, currentPaymentDate, correctedPaymentDate };
    }

    const update = await db
        .from("collections")
        .update({ payment_date: correctedPaymentDate })
        .eq("company_id", context.activeCompany.id)
        .in("id", paymentIds);
    if (update.error) throw new Error(update.error.message);

    const cashUpdate = await db
        .from("cash_transactions")
        .update({ transaction_date: businessDateStartIso(correctedPaymentDate) })
        .eq("company_id", context.activeCompany.id)
        .eq("source_type", "collection")
        .in("source_id", paymentIds);
    if (cashUpdate.error) throw new Error(cashUpdate.error.message);

    const totalAmount = ((rows ?? []) as Array<Record<string, unknown>>).reduce((total, row) => total + Number(row.amount_paid ?? row.amount ?? 0), 0);

    await logUserAction({
        action: "bulk_payment_date_corrected",
        entityType: "collections",
        companyId: context.activeCompany.id,
        officeId: input.officeId ?? null,
        beforeData: { payment_date: currentPaymentDate, count: paymentIds.length },
        afterData: { payment_date: correctedPaymentDate, count: paymentIds.length, totalAmount, reason },
    });

    revalidatePaymentDateChangePages();
    return {
        count: paymentIds.length,
        currentPaymentDate,
        correctedPaymentDate,
        totalAmount,
    };
}

export async function upsertTenantRentSponsor(input: UpsertTenantRentSponsorInput) {
    const context = await requirePermission("collections.manage");
    const tenantContext = await getTenantCollectionContext(input.tenantId);
    const supabase = await createSupabaseServerClient();

    if (!context.activeCompany?.id || !context.activeOffice?.id) {
        throw new Error("Active company and office are required.");
    }

    const employerCoveredAmount = Number(input.employerCoveredAmount);
    if (!Number.isFinite(employerCoveredAmount) || employerCoveredAmount < 0) {
        throw new Error("Employer covered amount must be zero or greater.");
    }

    const employerName = input.employerName.trim();
    if (!employerName) {
        throw new Error("Employer / sponsor name is required.");
    }

    const resolvedOfficeId =
        tenantContext.lease?.office_id ??
        tenantContext.room?.office_id ??
        tenantContext.tenant.office_id ??
        context.activeOffice.id;
    const totalMonthlyRent = tenantContext.monthlyRent;
    const tenantTopUpAmount = Math.max(0, totalMonthlyRent - employerCoveredAmount);
    const table = (supabase as unknown as DynamicDb).from("tenant_rent_sponsors");

    const { data: existing, error: existingError } = await table
        .select("*")
        .eq("company_id", context.activeCompany.id)
        .eq("tenant_id", tenantContext.tenant.id)
        .eq("status", "active")
        .maybeSingle();
    if (existingError) throw new Error(existingError.message);

    const payload = {
        company_id: context.activeCompany.id,
        office_id: resolvedOfficeId,
        tenant_id: tenantContext.tenant.id,
        lease_id: tenantContext.lease?.id ?? null,
        employer_name: employerName,
        contact_person: input.contactPerson || null,
        employer_phone: input.employerPhone || null,
        payment_method: input.paymentMethod,
        covered_amount: employerCoveredAmount,
        tenant_top_up_amount: tenantTopUpAmount,
        total_monthly_rent: totalMonthlyRent,
        cheque_reference: input.chequeReference || null,
        notes: input.notes || null,
        status: "active",
        updated_by: context.profile?.id ?? null,
    };

    const query = existing
        ? table.update(payload).eq("id", existing.id)
        : table.insert({ ...payload, created_by: context.profile?.id ?? null });
    const { data, error } = await query.select("*").single();
    if (error) throw new Error(error.message);

    await logUserAction({
        action: existing ? "tenant_rent_sponsor_updated" : "tenant_rent_sponsor_created",
        entityType: "tenant_rent_sponsor",
        entityId: data.id,
        companyId: context.activeCompany.id,
        officeId: resolvedOfficeId,
        beforeData: existing,
        afterData: data,
    });

    revalidateOperationsPages();
    return data;
}

export async function createPromise(input: CreatePromiseInput) {
    const context = await requirePermission("collections.manage");
    const tenantContext = await getTenantCollectionContext(input.tenantId);
    const supabase = await createSupabaseServerClient();
    const amount = Number(input.promisedAmount);
    assertPositiveAmount(amount, "Promise amount");
    assertDate(input.promisedDate, "Promise date");

    if (!context.activeCompany?.id || !context.activeOffice?.id) {
        throw new Error("Active company and office are required.");
    }

    const resolvedOfficeId =
        tenantContext.lease?.office_id ??
        tenantContext.room?.office_id ??
        tenantContext.tenant.office_id ??
        context.activeOffice.id;
    const { data, error } = await supabase
        .from("promises")
        .insert({
            amount,
            company_id: context.activeCompany.id,
            created_by: context.profile?.id ?? null,
            lease_id: tenantContext.lease?.id ?? null,
            notes: input.notes || null,
            office_id: resolvedOfficeId,
            promise_date: input.promisedDate,
            promised_amount: amount,
            promised_date: input.promisedDate,
            room_id: tenantContext.room?.id ?? tenantContext.tenant.room_id,
            status: "open",
            tenant_id: tenantContext.tenant.id,
        })
        .select("*")
        .single();

    if (error) {
        throw new Error(error.message);
    }

    await supabase.from("collection_actions").insert({
        action_type: "promise_created",
        company_id: context.activeCompany.id,
        lease_id: tenantContext.lease?.id ?? null,
        next_follow_up_at: input.promisedDate,
        notes: input.notes || `Promise created for ${amount}`,
        office_id: resolvedOfficeId,
        outcome: "promise_created",
        performed_by: context.profile?.id ?? null,
        tenant_id: tenantContext.tenant.id,
    });

    await recalculateTenantScore({
        supabase,
        companyId: context.activeCompany.id,
        tenantId: tenantContext.tenant.id,
        event: "promise_created",
    });

    await logUserAction({
        action: "promise_created",
        entityType: "promise",
        entityId: data.id,
        companyId: context.activeCompany.id,
        officeId: resolvedOfficeId,
        afterData: data,
    });

    revalidateOperationsPages();
    return data;
}

export async function createCollectionAction(input: CreateCollectionActionInput) {
    const context = await requirePermission("collections.manage");
    const tenantContext = await getTenantCollectionContext(input.tenantId);
    const supabase = await createSupabaseServerClient();

    if (!context.activeCompany?.id || !context.activeOffice?.id) {
        throw new Error("Active company and office are required.");
    }

    const { data, error } = await supabase
        .from("collection_actions")
        .insert({
            action_type: input.actionType,
            company_id: context.activeCompany.id,
            lease_id: tenantContext.lease?.id ?? null,
            next_follow_up_at: input.nextFollowUpAt || null,
            notes: input.notes || null,
            office_id: context.activeOffice.id,
            outcome: input.outcome || null,
            performed_by: context.profile?.id ?? null,
            tenant_id: tenantContext.tenant.id,
        })
        .select("*")
        .single();

    if (error) {
        throw new Error(error.message);
    }

    await logUserAction({
        action: "collection_action_created",
        entityType: "collection_action",
        entityId: data.id,
        companyId: context.activeCompany.id,
        officeId: context.activeOffice.id,
        afterData: data,
    });

    revalidateOperationsPages();
    return data;
}

export async function followUpPromise(input: FollowUpPromiseInput) {
    const context = await requirePermission("collections.manage");
    const supabase = await createSupabaseServerClient();

    if (!context.activeCompany?.id || !context.activeOffice?.id) {
        throw new Error("Active company and office are required.");
    }

    const promiseQuery = supabase
        .from("promises")
        .select("*")
        .eq("id", input.promiseId)
        .eq("company_id", context.activeCompany.id);

    if (!(context.canAccessAllOffices || context.isCompanyAdmin)) {
        promiseQuery.eq("office_id", context.activeOffice.id);
    }

    const { data: promise, error: promiseError } = await promiseQuery.maybeSingle();

    if (promiseError) {
        throw new Error(promiseError.message);
    }

    if (!promise) {
        throw new Error("Promise not found in the active office.");
    }

    if (!promise.tenant_id) {
        throw new Error("Promise is not linked to a tenant.");
    }

    if (input.markFulfilled) {
        const tenantContext = await getTenantCollectionContext(promise.tenant_id);
        const resolvedOfficeId =
            promise.office_id ??
            tenantContext.lease?.office_id ??
            tenantContext.room?.office_id ??
            tenantContext.tenant.office_id ??
            context.activeOffice.id;
        const amount = Number(promise.promised_amount ?? promise.amount ?? 0);
        assertPositiveAmount(amount, "Promise payment amount");
        const balanceBefore = Math.max(0, tenantContext.outstandingBalance);
        const totalDueBeforePayment = balanceBefore;
        const balance = Math.max(0, totalDueBeforePayment - amount);
        const paidAt = new Date().toISOString();

        const { data: collection, error: collectionError } = await supabase
            .from("collections")
            .insert({
                amount,
                amount_paid: amount,
                balance,
                collection_number: collectionNumber(),
                company_id: context.activeCompany.id,
                expected_amount: totalDueBeforePayment,
                lease_id: promise.lease_id ?? tenantContext.lease?.id ?? null,
                notes: input.notes || `Promise payment recorded for ${amount}`,
                office_id: resolvedOfficeId,
                paid_at: paidAt,
                payment_date: dateOnly(paidAt),
                payment_method: "promise",
                property_id: tenantContext.property?.id ?? tenantContext.tenant.property_id,
                recorded_by: context.profile?.id ?? null,
                reference_number: `PROM-${promise.id.slice(0, 8)}-${Date.now()}`,
                room_id: tenantContext.room?.id ?? tenantContext.tenant.room_id,
                status: "paid",
                tenant_id: tenantContext.tenant.id,
                type: "rent",
            })
            .select("*")
            .single();

        if (collectionError) {
            throw new Error(collectionError.message);
        }

        await recordCollectionLedgerAndCash({
            amount,
            balanceAfter: balance,
            balanceBefore,
            collectionId: collection.id,
            companyId: context.activeCompany.id,
            description: input.notes || `Promise payment recorded for ${amount}`,
            leaseId: promise.lease_id ?? tenantContext.lease?.id ?? null,
            officeId: resolvedOfficeId,
            recordedBy: context.profile?.id ?? null,
            supabase,
            tenantId: tenantContext.tenant.id,
        });

        const { error: tenantUpdateError } = await supabase
            .from("tenants")
            .update({ balance })
            .eq("id", tenantContext.tenant.id)
            .eq("company_id", context.activeCompany.id);

        if (tenantUpdateError) {
            throw new Error(tenantUpdateError.message);
        }

        if (tenantContext.room?.id) {
            const { error: roomUpdateError } = await supabase
                .from("rooms")
                .update({ outstanding_balance: balance })
                .eq("id", tenantContext.room.id)
                .eq("company_id", context.activeCompany.id);

            if (roomUpdateError) {
                throw new Error(roomUpdateError.message);
            }
        }

        const { data, error } = await supabase
            .from("promises")
            .update({
                fulfilled_at: paidAt,
                notes: input.notes || promise.notes,
                status: "fulfilled",
            })
            .eq("id", promise.id)
            .select("*")
            .single();

        if (error) {
            throw new Error(error.message);
        }

        const { error: actionError } = await supabase.from("collection_actions").insert({
            action_type: "payment_recorded",
            company_id: context.activeCompany.id,
            lease_id: promise.lease_id,
            notes: input.notes || `Promise payment recorded for ${amount}`,
            office_id: resolvedOfficeId,
            outcome: "promise_paid",
            performed_by: context.profile?.id ?? null,
            tenant_id: promise.tenant_id,
        });

        if (actionError) {
            throw new Error(actionError.message);
        }

        await recalculateTenantScore({
            supabase,
            companyId: context.activeCompany.id,
            tenantId: tenantContext.tenant.id,
            event: "promise_fulfilled",
        });

        await logUserAction({
            action: "collection_recorded",
            entityType: "collection",
            entityId: collection.id,
            companyId: context.activeCompany.id,
            officeId: resolvedOfficeId,
            afterData: collection,
        });

        await logUserAction({
            action: "promise_paid",
            entityType: "promise",
            entityId: data.id,
            beforeData: promise,
            afterData: data,
            companyId: context.activeCompany.id,
            officeId: resolvedOfficeId,
        });

        revalidateOperationsPages();
        return data;
    }

    const { data, error } = await supabase
        .from("promises")
        .update({
            notes: input.notes || promise.notes,
            status: "followed_up",
        })
        .eq("id", promise.id)
        .select("*")
        .single();

    if (error) {
        throw new Error(error.message);
    }

    await supabase.from("collection_actions").insert({
        action_type: "promise_follow_up",
        company_id: context.activeCompany.id,
        lease_id: promise.lease_id,
        next_follow_up_at: input.nextFollowUpAt || null,
        notes: input.notes || input.outcome,
        office_id: context.activeOffice.id,
        outcome: input.outcome,
        performed_by: context.profile?.id ?? null,
        tenant_id: promise.tenant_id,
    });

    await logUserAction({
        action: "promise_followed_up",
        entityType: "promise",
        entityId: data.id,
        beforeData: promise,
        afterData: data,
        companyId: context.activeCompany.id,
        officeId: context.activeOffice.id,
    });

    revalidateOperationsPages();
    return data;
}
