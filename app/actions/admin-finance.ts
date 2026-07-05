"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyAdminMode } from "@/lib/auth/permissions";
import { logUserAction } from "@/lib/auth/audit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
    calculateLandlordAdvancePlan,
    splitAdvanceDeductionPortions,
    type AdvanceInterestMode,
    type AdvanceInterestType,
    type AdvancePaymentPlan,
    type AdvanceRepaymentType,
    type PrincipalClearanceMethod,
} from "@/lib/landlord-advances/calculator";

type DynamicSupabase = Awaited<ReturnType<typeof createSupabaseServerClient>> & {
    from: (table: string) => ReturnType<Awaited<ReturnType<typeof createSupabaseServerClient>>["from"]>;
};

function assertPositiveAmount(value: number, label: string) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be greater than zero.`);
}

function assertNonNegativeAmount(value: number, label: string) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be zero or greater.`);
}

function amount(value: unknown) {
    return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function advanceTotal(row: Record<string, unknown>) {
    const explicitTotal = amount(row.total_repayable);
    if (explicitTotal > 0) return explicitTotal;
    const advanceAmount = amount(row.advance_amount);
    if (advanceAmount > 0) return advanceAmount;
    return amount(row.principal_amount) + amount(row.interest_amount);
}

function advanceRemaining(row: Record<string, unknown>) {
    const remainingTotal = amount(row.remaining_total_balance);
    if (remainingTotal > 0) return remainingTotal;
    const remainingBalance = amount(row.remaining_balance);
    if (remainingBalance > 0) return remainingBalance;
    const principalInterest = amount(row.remaining_principal_balance) + amount(row.remaining_interest_balance);
    if (principalInterest > 0) return principalInterest;
    return Math.max(0, advanceTotal(row) - amount(row.deducted_amount));
}

async function adminContext() {
    const context = await requireCompanyAdminMode();
    if (!context.activeCompany?.id) throw new Error("Active company is required.");
    return context;
}

async function notifyAdmin(db: DynamicSupabase, input: {
    companyId: string;
    officeId: string | null;
    title: string;
    message: string;
    severity?: string;
    entityId?: string | null;
}) {
    const { error } = await (db as any).from("notifications").insert({
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
    if (error) throw new Error(error.message);
}

async function writeAdvanceRevision(db: DynamicSupabase, input: {
    companyId: string;
    officeId: string | null;
    landlordId: string;
    advanceId: string;
    revisionNumber: number;
    action: string;
    beforeData?: unknown;
    afterData?: unknown;
    reason?: string | null;
    createdBy?: string | null;
}) {
    const { error } = await db.from("landlord_advance_revisions").insert({
        company_id: input.companyId,
        office_id: input.officeId,
        landlord_id: input.landlordId,
        advance_id: input.advanceId,
        revision_number: input.revisionNumber,
        action: input.action,
        before_data: input.beforeData ?? null,
        after_data: input.afterData ?? null,
        reason: input.reason ?? null,
        created_by: input.createdBy ?? null,
    });
    if (error) throw new Error(error.message);
}

function revalidateFinancePages() {
    revalidatePath("/office/admin");
    revalidatePath("/office/admin/statements");
    revalidatePath("/office/dashboard");
    revalidatePath("/office/landlords");
    revalidatePath("/office/landlord-payments");
}

export async function addLandlordAdvance(input: {
    landlordId: string;
    officeId: string;
    amount?: number;
    principalAmount?: number;
    repaymentType?: AdvanceRepaymentType;
    interestMode?: AdvanceInterestMode;
    interestType?: AdvanceInterestType;
    interestValue?: number | null;
    interestRate?: number | null;
    fixedInterestAmount?: number | null;
    dateGiven: string;
    deductionStartDate?: string | null;
    deductionEndDate?: string | null;
    paymentPlan?: AdvancePaymentPlan;
    monthlyDeductionAmount?: number | null;
    principalClearanceMethod?: PrincipalClearanceMethod;
    reason?: string | null;
    note?: string | null;
}) {
    const context = await adminContext();
    const supabase = await createSupabaseServerClient();
    const principalAmount = Number(input.principalAmount ?? input.amount ?? 0);
    assertPositiveAmount(principalAmount, "Advance principal amount");
    if (!input.landlordId || !input.officeId) throw new Error("Select landlord and office.");
    const plan = calculateLandlordAdvancePlan({
        principalAmount,
        repaymentType: input.repaymentType,
        interestMode: input.interestMode,
        interestType: input.interestType,
        interestValue: input.interestValue,
        interestRate: input.interestRate,
        fixedInterestAmount: input.fixedInterestAmount,
        paymentPlan: input.paymentPlan,
        monthlyDeductionAmount: input.monthlyDeductionAmount,
        deductionStartDate: input.deductionStartDate || input.dateGiven,
        deductionEndDate: input.deductionEndDate,
        principalClearanceMethod: input.principalClearanceMethod,
    });
    assertPositiveAmount(plan.totalRepayable, "Total repayable");

    const { data, error } = await (supabase as DynamicSupabase)
        .from("landlord_advances")
        .insert({
            company_id: context.activeCompany!.id,
            office_id: input.officeId,
            landlord_id: input.landlordId,
            advance_amount: plan.totalRepayable,
            principal_amount: plan.principalAmount,
            repayment_type: plan.repaymentType,
            interest_calculation_mode: plan.interestMode,
            interest_type: plan.interestType,
            interest_rate: plan.interestRate,
            fixed_interest_amount: plan.fixedInterestAmount,
            interest_amount: plan.interestAmount,
            total_repayable: plan.totalRepayable,
            deducted_amount: 0,
            date_given: input.dateGiven || new Date().toISOString().slice(0, 10),
            deduction_start_date: plan.deductionStartDate,
            deduction_end_date: input.deductionEndDate || plan.expectedEndDate,
            payment_plan: plan.paymentPlan,
            principal_clearance_method: plan.principalClearanceMethod,
            monthly_deduction_amount: plan.monthlyDeductionAmount,
            expected_end_date: plan.expectedEndDate,
            remaining_principal_balance: plan.principalAmount,
            remaining_interest_balance: plan.interestAmount,
            remaining_balance: plan.totalRepayable,
            remaining_total_balance: plan.totalRepayable,
            reason: input.reason || null,
            note: input.note || null,
            status: "approved",
            lifecycle_status: "active",
            created_by: context.profile?.id ?? null,
            updated_by: context.profile?.id ?? null,
            approved_by: context.profile?.id ?? null,
        })
        .select("*")
        .single();

    if (error) throw new Error(error.message);

    const scheduleRows = plan.schedule.map((row) => ({
        company_id: context.activeCompany!.id,
        office_id: input.officeId,
        landlord_id: input.landlordId,
        advance_id: data.id,
        month_key: row.month,
        opening_balance: row.openingBalance,
        opening_principal_balance: row.openingPrincipalBalance,
        interest_charged: row.interestCharged,
        scheduled_deduction: row.scheduledDeduction,
        actual_deduction: 0,
        interest_portion: row.interestPortion,
        principal_portion: row.principalPortion,
        closing_principal_balance: row.closingPrincipalBalance,
        closing_balance: row.closingBalance,
        remaining_total_balance: row.remainingTotalBalance,
        status: "pending",
    }));
    if (scheduleRows.length > 0) {
        const scheduleInsert = await (supabase as DynamicSupabase)
            .from("landlord_advance_repayment_schedule")
            .insert(scheduleRows);
        if (scheduleInsert.error) throw new Error(scheduleInsert.error.message);
    }
    const interestRows = plan.schedule
        .filter((row) => row.interestCharged > 0)
        .map((row) => ({
            company_id: context.activeCompany!.id,
            office_id: input.officeId,
            landlord_id: input.landlordId,
            advance_id: data.id,
            month_key: row.month,
            opening_principal_balance: row.openingPrincipalBalance,
            interest_mode: plan.interestMode,
            interest_rate: plan.interestRate,
            interest_charged: row.interestCharged,
            interest_recovered: 0,
            status: "projected",
        }));
    if (interestRows.length > 0) {
        const interestInsert = await (supabase as DynamicSupabase).from("landlord_advance_interest_events").insert(interestRows);
        if (interestInsert.error) throw new Error(interestInsert.error.message);
    }

    await logUserAction({
        action: "landlord_advance_created",
        entityType: "landlord_advance",
        entityId: data.id,
        companyId: context.activeCompany!.id,
        officeId: input.officeId,
        afterData: { ...data, repayment_schedule: scheduleRows },
    });

    revalidatePath("/office/admin");
    revalidatePath("/office/landlords");
    revalidatePath("/office/landlord-payments");
    return data;
}

export async function editLandlordAdvanceNote(input: {
    advanceId: string;
    reason?: string | null;
    note?: string | null;
}) {
    const context = await adminContext();
    const supabase = await createSupabaseServerClient();
    const table = (supabase as DynamicSupabase).from("landlord_advances");
    const { data: existing, error: existingError } = await table
        .select("*")
        .eq("id", input.advanceId)
        .eq("company_id", context.activeCompany!.id)
        .single();
    if (existingError) throw new Error(existingError.message);

    const { data, error } = await (supabase as DynamicSupabase)
        .from("landlord_advances")
        .update({
            reason: input.reason || existing.reason || null,
            note: input.note || existing.note || null,
            updated_by: context.profile?.id ?? null,
        })
        .eq("id", input.advanceId)
        .eq("company_id", context.activeCompany!.id)
        .select("*")
        .single();
    if (error) throw new Error(error.message);

    await logUserAction({
        action: "landlord_advance_note_edited",
        entityType: "landlord_advance",
        entityId: data.id,
        companyId: context.activeCompany!.id,
        officeId: data.office_id ?? null,
        beforeData: existing,
        afterData: data,
    });

    revalidatePath("/office/admin");
    revalidatePath("/office/landlord-payments");
    return data;
}

export async function markLandlordAdvanceDeducted(input: {
    advanceId: string;
    amount?: number | null;
}) {
    const context = await adminContext();
    const supabase = await createSupabaseServerClient();
    const { data: existing, error: existingError } = await (supabase as DynamicSupabase)
        .from("landlord_advances")
        .select("*")
        .eq("id", input.advanceId)
        .eq("company_id", context.activeCompany!.id)
        .single();
    if (existingError) throw new Error(existingError.message);

    const totalRepayable = advanceTotal(existing as Record<string, unknown>);
    const alreadyDeducted = amount(existing.deducted_amount);
    const remaining = advanceRemaining(existing as Record<string, unknown>);
    const deduction = input.amount == null ? remaining : Number(input.amount);
    assertPositiveAmount(deduction, "Deduction amount");
    const nextDeducted = Math.min(totalRepayable, alreadyDeducted + deduction);
    const now = new Date().toISOString();
    const appliedAmount = Math.min(deduction, remaining);
    const portions = splitAdvanceDeductionPortions(existing, appliedAmount);
    const currentPrincipalBalance = amount(existing.remaining_principal_balance)
        || amount(existing.principal_amount)
        || Math.max(0, totalRepayable - amount(existing.interest_amount));
    const currentInterestBalance = amount(existing.remaining_interest_balance) || amount(existing.interest_amount);
    const nextPrincipalBalance = Math.max(0, currentPrincipalBalance - portions.principalPortion);
    const nextInterestBalance = Math.max(0, currentInterestBalance - portions.interestPortion);
    const nextTotalBalance = Math.max(0, remaining - appliedAmount);

    const { data, error } = await (supabase as DynamicSupabase)
        .from("landlord_advances")
        .update({
            deducted_amount: nextDeducted,
            status: nextTotalBalance <= 0 ? "fully_deducted" : "partially_deducted",
            lifecycle_status: nextTotalBalance <= 0 ? "cleared" : existing.lifecycle_status ?? "active",
            deducted_at: now,
            actual_cleared_date: nextTotalBalance <= 0 ? now.slice(0, 10) : existing.actual_cleared_date ?? null,
            remaining_principal_balance: nextPrincipalBalance,
            remaining_interest_balance: nextInterestBalance,
            remaining_balance: nextTotalBalance,
            remaining_total_balance: nextTotalBalance,
            updated_by: context.profile?.id ?? null,
        })
        .eq("id", input.advanceId)
        .eq("company_id", context.activeCompany!.id)
        .select("*")
        .single();
    if (error) throw new Error(error.message);

    const deductionMonth = now.slice(0, 10);
    const deductionInsert = await (supabase as DynamicSupabase)
        .from("landlord_advance_deductions")
        .insert({
            company_id: context.activeCompany!.id,
            office_id: data.office_id ?? null,
            landlord_id: data.landlord_id,
            advance_id: data.id,
            amount: appliedAmount,
            interest_portion: portions.interestPortion,
            principal_portion: portions.principalPortion,
            remaining_balance: nextTotalBalance,
            deduction_month: deductionMonth,
            status: nextTotalBalance <= 0 ? "deducted" : "partial",
            notes: "Manual landlord advance deduction recorded from Landlord Payments.",
            reference: `manual-${Date.now()}`,
            created_by: context.profile?.id ?? null,
        });
    if (deductionInsert.error) throw new Error(deductionInsert.error.message);

    const { data: scheduleRows, error: scheduleError } = await (supabase as DynamicSupabase)
        .from("landlord_advance_repayment_schedule")
        .select("*")
        .eq("advance_id", data.id)
        .eq("company_id", context.activeCompany!.id)
        .order("month_key", { ascending: true });
    if (scheduleError) throw new Error(scheduleError.message);
    const schedule = ((scheduleRows ?? []) as Array<Record<string, unknown>>)
        .find((row) => String(row.status ?? "pending") !== "cleared" && Number(row.actual_deduction ?? 0) < Number(row.scheduled_deduction ?? 0))
        ?? ((scheduleRows ?? []) as Array<Record<string, unknown>>)[0];
    if (schedule?.id) {
        const actualDeduction = Number(schedule.actual_deduction ?? 0) + appliedAmount;
        const scheduledDeduction = Number(schedule.scheduled_deduction ?? 0);
        const scheduleUpdate = await (supabase as DynamicSupabase)
            .from("landlord_advance_repayment_schedule")
            .update({
                actual_deduction: actualDeduction,
                status: nextTotalBalance <= 0 ? "cleared" : actualDeduction >= scheduledDeduction ? "deducted" : "partial",
            })
            .eq("id", String(schedule.id));
        if (scheduleUpdate.error) throw new Error(scheduleUpdate.error.message);
    }

    await logUserAction({
        action: "landlord_advance_deducted",
        entityType: "landlord_advance",
        entityId: data.id,
        companyId: context.activeCompany!.id,
        officeId: data.office_id ?? null,
        beforeData: existing,
        afterData: data,
    });
    if (nextTotalBalance <= 0) {
        await notifyAdmin(supabase as DynamicSupabase, {
            companyId: context.activeCompany!.id,
            officeId: data.office_id ?? null,
            entityId: data.id,
            title: "Landlord advance cleared",
            message: "A landlord advance has been fully recovered and moved to closed advances.",
            severity: "success",
        });
    }

    revalidateFinancePages();
    return data;
}

export async function settleLandlordAdvanceEarly(input: {
    advanceId: string;
    policy?: "collect_remaining_balance" | "waive_unearned_interest";
    reason?: string | null;
}) {
    const context = await adminContext();
    const supabase = await createSupabaseServerClient();
    const db = supabase as DynamicSupabase;
    const { data: existing, error: existingError } = await db
        .from("landlord_advances")
        .select("*")
        .eq("id", input.advanceId)
        .eq("company_id", context.activeCompany!.id)
        .single();
    if (existingError) throw new Error(existingError.message);

    const now = new Date().toISOString();
    const alreadyDeducted = amount(existing.deducted_amount);
    const remaining = advanceRemaining(existing as Record<string, unknown>);
    assertPositiveAmount(remaining, "Remaining advance balance");
    const policy = input.policy ?? "collect_remaining_balance";
    const totalInterest = Number(existing.interest_amount ?? 0);
    const interestAlreadyPaid = Math.min(totalInterest, alreadyDeducted);
    const unearnedInterest = policy === "waive_unearned_interest" ? Math.max(0, totalInterest - interestAlreadyPaid) : 0;
    const settlementAmount = Math.max(0, remaining - unearnedInterest);
    const nextTotal = alreadyDeducted + settlementAmount;
    const portions = splitAdvanceDeductionPortions(existing, settlementAmount);

    const { data, error } = await db
        .from("landlord_advances")
        .update({
            advance_amount: nextTotal,
            total_repayable: nextTotal,
            deducted_amount: nextTotal,
            status: "fully_deducted",
            lifecycle_status: "cleared",
            deducted_at: now,
            actual_cleared_date: now.slice(0, 10),
            early_settlement_policy: policy,
            early_settlement_discount: unearnedInterest,
            remaining_balance: 0,
            remaining_principal_balance: 0,
            remaining_interest_balance: 0,
            remaining_total_balance: 0,
            updated_by: context.profile?.id ?? null,
        })
        .eq("id", existing.id)
        .eq("company_id", context.activeCompany!.id)
        .select("*")
        .single();
    if (error) throw new Error(error.message);

    const deductionInsert = await db.from("landlord_advance_deductions").insert({
        company_id: context.activeCompany!.id,
        office_id: data.office_id ?? null,
        landlord_id: data.landlord_id,
        advance_id: data.id,
        amount: settlementAmount,
        interest_portion: portions.interestPortion,
        principal_portion: portions.principalPortion,
        remaining_balance: 0,
        deduction_month: now.slice(0, 10),
        status: "deducted",
        notes: input.reason || "Early settlement cleared landlord advance.",
        reference: `early-settlement-${Date.now()}`,
        created_by: context.profile?.id ?? null,
    });
    if (deductionInsert.error) throw new Error(deductionInsert.error.message);

    const scheduleUpdate = await db
        .from("landlord_advance_repayment_schedule")
        .update({
            status: "cleared",
            skipped_reason: unearnedInterest > 0 ? "Early settlement with unearned interest waived" : "Early settlement",
        })
        .eq("advance_id", data.id)
        .eq("company_id", context.activeCompany!.id);
    if (scheduleUpdate.error) throw new Error(scheduleUpdate.error.message);

    await writeAdvanceRevision(db, {
        companyId: context.activeCompany!.id,
        officeId: data.office_id ?? null,
        landlordId: data.landlord_id,
        advanceId: data.id,
        revisionNumber: Number(existing.revision_number ?? 1),
        action: "early_settlement",
        beforeData: existing,
        afterData: data,
        reason: input.reason,
        createdBy: context.profile?.id ?? null,
    });
    await notifyAdmin(db, {
        companyId: context.activeCompany!.id,
        officeId: data.office_id ?? null,
        entityId: data.id,
        title: "Landlord advance completed",
        message: "A landlord advance was cleared early and future deductions were stopped.",
        severity: "success",
    });
    await logUserAction({
        action: "landlord_advance_early_settled",
        entityType: "landlord_advance",
        entityId: data.id,
        companyId: context.activeCompany!.id,
        officeId: data.office_id ?? null,
        beforeData: existing,
        afterData: data,
    });
    revalidateFinancePages();
    return data;
}

export async function pauseLandlordAdvance(input: { advanceId: string; reason?: string | null }) {
    const context = await adminContext();
    const supabase = await createSupabaseServerClient();
    const db = supabase as DynamicSupabase;
    const { data: existing, error: existingError } = await db.from("landlord_advances").select("*").eq("id", input.advanceId).eq("company_id", context.activeCompany!.id).single();
    if (existingError) throw new Error(existingError.message);
    const now = new Date().toISOString();
    const { data, error } = await db.from("landlord_advances").update({
        lifecycle_status: "paused",
        paused_at: now,
        paused_by: context.profile?.id ?? null,
        pause_reason: input.reason ?? null,
        updated_by: context.profile?.id ?? null,
    }).eq("id", existing.id).eq("company_id", context.activeCompany!.id).select("*").single();
    if (error) throw new Error(error.message);
    await writeAdvanceRevision(db, {
        companyId: context.activeCompany!.id,
        officeId: data.office_id ?? null,
        landlordId: data.landlord_id,
        advanceId: data.id,
        revisionNumber: Number(data.revision_number ?? 1),
        action: "paused",
        beforeData: existing,
        afterData: data,
        reason: input.reason,
        createdBy: context.profile?.id ?? null,
    });
    await notifyAdmin(db, {
        companyId: context.activeCompany!.id,
        officeId: data.office_id ?? null,
        entityId: data.id,
        title: "Advance repayment paused",
        message: input.reason || "Landlord advance deductions are paused and will be skipped in settlements.",
        severity: "warning",
    });
    revalidateFinancePages();
    return data;
}

export async function resumeLandlordAdvance(input: { advanceId: string; note?: string | null }) {
    const context = await adminContext();
    const supabase = await createSupabaseServerClient();
    const db = supabase as DynamicSupabase;
    const { data: existing, error: existingError } = await db.from("landlord_advances").select("*").eq("id", input.advanceId).eq("company_id", context.activeCompany!.id).single();
    if (existingError) throw new Error(existingError.message);
    const now = new Date().toISOString();
    const { data, error } = await db.from("landlord_advances").update({
        lifecycle_status: "active",
        resumed_at: now,
        resumed_by: context.profile?.id ?? null,
        resume_note: input.note ?? null,
        updated_by: context.profile?.id ?? null,
    }).eq("id", existing.id).eq("company_id", context.activeCompany!.id).select("*").single();
    if (error) throw new Error(error.message);
    await writeAdvanceRevision(db, {
        companyId: context.activeCompany!.id,
        officeId: data.office_id ?? null,
        landlordId: data.landlord_id,
        advanceId: data.id,
        revisionNumber: Number(data.revision_number ?? 1),
        action: "resumed",
        beforeData: existing,
        afterData: data,
        reason: input.note,
        createdBy: context.profile?.id ?? null,
    });
    await notifyAdmin(db, {
        companyId: context.activeCompany!.id,
        officeId: data.office_id ?? null,
        entityId: data.id,
        title: "Advance repayment resumed",
        message: "Landlord advance deductions are active again.",
        severity: "information",
    });
    revalidateFinancePages();
    return data;
}

export async function editLandlordAdvanceRepaymentPlan(input: {
    advanceId: string;
    interestType?: AdvanceInterestType;
    interestValue?: number | null;
    monthlyDeductionAmount?: number | null;
    repaymentMonths?: number | null;
    deductionStartDate?: string | null;
    reason?: string | null;
}) {
    const context = await adminContext();
    const supabase = await createSupabaseServerClient();
    const db = supabase as DynamicSupabase;
    const { data: existing, error: existingError } = await db.from("landlord_advances").select("*").eq("id", input.advanceId).eq("company_id", context.activeCompany!.id).single();
    if (existingError) throw new Error(existingError.message);
    const principalAmount = Number(existing.principal_amount ?? existing.advance_amount ?? 0);
    const plan = calculateLandlordAdvancePlan({
        principalAmount,
        interestType: input.interestType ?? existing.interest_type ?? "none",
        interestValue: input.interestValue ?? (String(existing.interest_type) === "percentage" ? Number(existing.interest_rate ?? 0) : Number(existing.interest_amount ?? 0)),
        paymentPlan: "monthly",
        monthlyDeductionAmount: Number(input.monthlyDeductionAmount ?? 0) > 0 ? Number(input.monthlyDeductionAmount) : null,
        deductionStartDate: input.deductionStartDate ?? new Date().toISOString().slice(0, 10),
    });
    const deductedAmount = Number(existing.deducted_amount ?? 0);
    const nextTotalRepayable = Math.max(plan.totalRepayable, deductedAmount);
    const remaining = Math.max(0, nextTotalRepayable - deductedAmount);
    const repaymentMonths = Math.max(0, Math.round(Number(input.repaymentMonths ?? 0)));
    const monthlyDeduction = repaymentMonths > 0 && remaining > 0
        ? Math.ceil(remaining / repaymentMonths)
        : plan.monthlyDeductionAmount;
    assertPositiveAmount(monthlyDeduction, "Monthly deduction");
    const revisedPlan = calculateLandlordAdvancePlan({
        principalAmount,
        interestType: plan.interestType,
        interestValue: plan.interestType === "percentage" ? plan.interestRate : plan.interestAmount,
        paymentPlan: "monthly",
        monthlyDeductionAmount: monthlyDeduction,
        deductionStartDate: plan.deductionStartDate,
    });
    const nextRevision = Number(existing.revision_number ?? 1) + 1;
    const { data, error } = await db.from("landlord_advances").update({
        advance_amount: nextTotalRepayable,
        repayment_type: revisedPlan.repaymentType,
        interest_calculation_mode: revisedPlan.interestMode,
        interest_type: revisedPlan.interestType,
        interest_rate: revisedPlan.interestRate,
        fixed_interest_amount: revisedPlan.fixedInterestAmount,
        interest_amount: revisedPlan.interestAmount,
        total_repayable: nextTotalRepayable,
        deduction_start_date: revisedPlan.deductionStartDate,
        deduction_end_date: revisedPlan.expectedEndDate,
        payment_plan: "monthly",
        principal_clearance_method: revisedPlan.principalClearanceMethod,
        monthly_deduction_amount: monthlyDeduction,
        expected_end_date: revisedPlan.expectedEndDate,
        remaining_principal_balance: Math.max(0, Number(existing.remaining_principal_balance ?? revisedPlan.principalAmount)),
        remaining_interest_balance: Math.max(0, revisedPlan.interestAmount - Math.min(Number(existing.deducted_amount ?? 0), revisedPlan.interestAmount)),
        remaining_total_balance: remaining,
        revision_number: nextRevision,
        last_revised_at: new Date().toISOString(),
        last_revised_by: context.profile?.id ?? null,
        updated_by: context.profile?.id ?? null,
    }).eq("id", existing.id).eq("company_id", context.activeCompany!.id).select("*").single();
    if (error) throw new Error(error.message);

    const supersede = await db.from("landlord_advance_repayment_schedule").update({
        superseded_at: new Date().toISOString(),
        superseded_by: context.profile?.id ?? null,
        status: "cleared",
        skipped_reason: "Superseded by revised repayment plan",
    }).eq("advance_id", data.id).eq("company_id", context.activeCompany!.id).eq("status", "pending");
    if (supersede.error) throw new Error(supersede.error.message);

    let balance = remaining;
    const rows = revisedPlan.schedule
        .filter((row) => balance > 0)
        .map((row) => {
            const scheduledDeduction = Math.min(balance, monthlyDeduction);
            const scheduleRow = {
                company_id: context.activeCompany!.id,
                office_id: data.office_id ?? null,
                landlord_id: data.landlord_id,
                advance_id: data.id,
                revision_number: nextRevision,
                month_key: row.month,
                opening_balance: balance,
                opening_principal_balance: row.openingPrincipalBalance,
                interest_charged: row.interestCharged,
                scheduled_deduction: scheduledDeduction,
                actual_deduction: 0,
                interest_portion: row.interestPortion,
                principal_portion: Math.max(0, scheduledDeduction - row.interestPortion),
                closing_principal_balance: row.closingPrincipalBalance,
                closing_balance: Math.max(0, balance - scheduledDeduction),
                remaining_total_balance: Math.max(0, balance - scheduledDeduction),
                status: "pending",
            };
            balance = Math.max(0, balance - scheduledDeduction);
            return scheduleRow;
        });
    if (rows.length > 0) {
        const insert = await db.from("landlord_advance_repayment_schedule").insert(rows);
        if (insert.error) throw new Error(insert.error.message);
    }
    await writeAdvanceRevision(db, {
        companyId: context.activeCompany!.id,
        officeId: data.office_id ?? null,
        landlordId: data.landlord_id,
        advanceId: data.id,
        revisionNumber: nextRevision,
        action: "repayment_plan_revised",
        beforeData: existing,
        afterData: { ...data, schedule_rows: rows },
        reason: input.reason,
        createdBy: context.profile?.id ?? null,
    });
    await notifyAdmin(db, {
        companyId: context.activeCompany!.id,
        officeId: data.office_id ?? null,
        entityId: data.id,
        title: "Advance repayment plan updated",
        message: input.reason || "A landlord advance repayment plan was revised and a new schedule was generated.",
        severity: "information",
    });
    revalidateFinancePages();
    return data;
}

export async function clearLandlordAdvancePrincipal(input: {
    advanceId: string;
    amount?: number | null;
    clearanceMethod?: PrincipalClearanceMethod;
    reference?: string | null;
    notes?: string | null;
}) {
    const context = await adminContext();
    const supabase = await createSupabaseServerClient();
    const db = supabase as DynamicSupabase;
    const { data: existing, error: existingError } = await db.from("landlord_advances").select("*").eq("id", input.advanceId).eq("company_id", context.activeCompany!.id).single();
    if (existingError) throw new Error(existingError.message);
    const principalBalance = Math.max(0, Number(existing.remaining_principal_balance ?? existing.principal_amount ?? 0));
    const clearAmount = input.amount == null ? principalBalance : Number(input.amount);
    assertPositiveAmount(clearAmount, "Principal clearance amount");
    const applied = Math.min(clearAmount, principalBalance);
    const nextPrincipal = Math.max(0, principalBalance - applied);
    const nextInterest = Math.max(0, Number(existing.remaining_interest_balance ?? 0));
    const nextTotal = nextPrincipal + nextInterest;
    const now = new Date().toISOString();
    const nextDeducted = Number(existing.deducted_amount ?? 0) + applied;
    const { data, error } = await db.from("landlord_advances").update({
        deducted_amount: nextDeducted,
        remaining_principal_balance: nextPrincipal,
        remaining_interest_balance: nextInterest,
        remaining_balance: nextTotal,
        remaining_total_balance: nextTotal,
        status: nextTotal <= 0 ? "fully_deducted" : "partially_deducted",
        lifecycle_status: nextTotal <= 0 ? "cleared" : existing.lifecycle_status ?? "active",
        principal_cleared_at: nextPrincipal <= 0 ? now : existing.principal_cleared_at ?? null,
        principal_cleared_by: nextPrincipal <= 0 ? context.profile?.id ?? null : existing.principal_cleared_by ?? null,
        actual_cleared_date: nextTotal <= 0 ? now.slice(0, 10) : existing.actual_cleared_date ?? null,
        updated_by: context.profile?.id ?? null,
    }).eq("id", existing.id).eq("company_id", context.activeCompany!.id).select("*").single();
    if (error) throw new Error(error.message);

    const clearanceInsert = await db.from("landlord_advance_principal_clearances").insert({
        company_id: context.activeCompany!.id,
        office_id: data.office_id ?? null,
        landlord_id: data.landlord_id,
        advance_id: data.id,
        amount: applied,
        clearance_method: input.clearanceMethod ?? "cleared_manually",
        clearance_date: now.slice(0, 10),
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        created_by: context.profile?.id ?? null,
    });
    if (clearanceInsert.error) throw new Error(clearanceInsert.error.message);

    await writeAdvanceRevision(db, {
        companyId: context.activeCompany!.id,
        officeId: data.office_id ?? null,
        landlordId: data.landlord_id,
        advanceId: data.id,
        revisionNumber: Number(data.revision_number ?? 1),
        action: "principal_cleared",
        beforeData: existing,
        afterData: data,
        reason: input.notes,
        createdBy: context.profile?.id ?? null,
    });
    if (nextTotal <= 0) {
        await notifyAdmin(db, {
            companyId: context.activeCompany!.id,
            officeId: data.office_id ?? null,
            entityId: data.id,
            title: "Landlord advance principal cleared",
            message: "Principal has been cleared and the advance is now closed.",
            severity: "success",
        });
    }
    revalidateFinancePages();
    return data;
}

export async function addAdminOfficeExpense(input: {
    officeId: string;
    amount: number;
    category?: string | null;
    item?: string | null;
    description?: string | null;
    expenseDate?: string | null;
    vendor?: string | null;
}) {
    const context = await adminContext();
    const supabase = await createSupabaseServerClient();
    const amount = Number(input.amount);
    assertPositiveAmount(amount, "Expense amount");
    if (!input.officeId) throw new Error("Select office.");

    const { data, error } = await supabase
        .from("expenses")
        .insert({
            amount,
            category: input.category || null,
            company_id: context.activeCompany!.id,
            description: input.description || null,
            expense_date: input.expenseDate || new Date().toISOString().slice(0, 10),
            expense_number: `ADM-EXP-${Date.now()}`,
            item: input.item || null,
            office_id: input.officeId,
            submitted_by: context.profile?.id ?? null,
            vendor: input.vendor || null,
        })
        .select("*")
        .single();

    if (error) throw new Error(error.message);

    await logUserAction({
        action: "admin_office_expense_created",
        entityType: "expense",
        entityId: data.id,
        companyId: context.activeCompany!.id,
        officeId: input.officeId,
        afterData: data,
    });

    revalidatePath("/office/admin");
    revalidatePath("/office/expenses");
    return data;
}
