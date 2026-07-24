"use server";

import { revalidatePath } from "next/cache";
import { canAccessOffice, hasPermission, requireAuth, requireCompanyAdminMode } from "@/lib/auth/permissions";
import { logUserAction } from "@/lib/auth/audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type DynamicDb = {
    from: (table: string) => any;
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

export type RecordSecurityDepositInput = {
    tenantId: string;
    roomId?: string | null;
    amount: number;
    paymentDate: string;
    paymentMethod: string;
    referenceNumber?: string | null;
    notes?: string | null;
};

export type UseSecurityFundsInput = {
    depositId: string;
    amount: number;
    usageDate: string;
    reason: string;
    expectedReplacementDate?: string | null;
    notes?: string | null;
};

export type RestoreSecurityFundsInput = {
    depositId: string;
    amount: number;
    restoreDate: string;
    referenceNumber?: string | null;
    notes?: string | null;
};

export type SettleSecurityDepositInput = {
    depositId: string;
    vacateDate: string;
    decision: "refund_full" | "refund_part" | "retain_full" | "apply_to_debt" | "apply_to_damage" | "pending" | "refund_later";
    refundAmount?: number;
    retainedAmount?: number;
    appliedToDebt?: number;
    damageDeduction?: number;
    otherDeduction?: number;
    reason: string;
};

function revalidateSecurityPaths() {
    for (const path of [
        "/office/security-deposits",
        "/office/payments",
        "/office/admin/payments",
        "/office/collector/payments",
        "/office/vacant-rooms",
        "/office/properties",
        "/office/landlords",
        "/office",
        "/office/dashboard",
        "/office/admin",
        "/office/reports",
        "/office/audit",
    ]) {
        revalidatePath(path);
    }
}

function assertDate(value: string, label: string) {
    const candidate = value?.slice(0, 10);
    if (!candidate || Number.isNaN(Date.parse(`${candidate}T00:00:00`))) throw new Error(`${label} is required.`);
    return candidate;
}

function assertAmount(value: number, label: string) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error(`${label} must be greater than zero.`);
    return amount;
}

export async function recordSecurityDeposit(input: RecordSecurityDepositInput) {
    const context = await requireAuth();
    const canRecord =
        context.isCompanyAdmin ||
        hasPermission(context, "collections.payment.post") ||
        hasPermission(context, "collections.manage") ||
        hasPermission(context, "properties.manage");
    if (!canRecord) throw new Error("You do not have permission to record security deposits.");
    if (!context.activeCompany?.id) throw new Error("Active company is required.");

    const companyId = context.activeCompany.id;
    const tenantId = input.tenantId.trim();
    const amount = assertAmount(input.amount, "Security deposit amount");
    const paymentDate = assertDate(input.paymentDate, "Security deposit date");
    if (!tenantId) throw new Error("Tenant is required.");

    const supabase = await createSupabaseServerClient();
    const { data: tenant, error: tenantError } = await supabase
        .from("tenants")
        .select("id, company_id, office_id, room_id")
        .eq("id", tenantId)
        .eq("company_id", companyId)
        .maybeSingle();
    if (tenantError) throw new Error(tenantError.message);
    if (!tenant) throw new Error("Tenant not found.");

    const officeId = tenant.office_id ?? context.activeOffice?.id ?? null;
    if (!canAccessOffice(context, officeId)) throw new Error("You can only record security deposits for your assigned office.");

    const db = createSupabaseAdminClient() as unknown as DynamicDb;
    const { data, error } = await db.rpc("record_tenant_security_deposit", {
        p_amount: amount,
        p_company_id: companyId,
        p_notes: input.notes?.trim() || null,
        p_office_id: officeId,
        p_payment_date: paymentDate,
        p_payment_method: input.paymentMethod?.trim() || "cash",
        p_recorded_by: context.profile?.id ?? context.authUser?.id ?? null,
        p_reference_number: input.referenceNumber?.trim() || null,
        p_room_id: input.roomId ?? tenant.room_id,
        p_tenant_id: tenant.id,
    });
    if (error) throw new Error(error.message ?? "Security deposit could not be recorded.");

    await logUserAction({
        action: "security_deposit_recorded_from_app",
        entityType: "tenant_security_deposit",
        entityId: String((data as Record<string, unknown>)?.id ?? ""),
        companyId,
        officeId,
        afterData: data as never,
    }).catch(() => null);

    revalidateSecurityPaths();
    return data;
}

export async function useSecurityFunds(input: UseSecurityFundsInput) {
    const context = await requireCompanyAdminMode();
    const companyId = context.activeCompany?.id;
    if (!companyId) throw new Error("Active company is required.");
    const amount = assertAmount(input.amount, "Security funds used");
    const usageDate = assertDate(input.usageDate, "Usage date");
    if (!input.depositId.trim()) throw new Error("Security deposit is required.");
    if (!input.reason.trim()) throw new Error("Reason is required.");

    const db = createSupabaseAdminClient() as unknown as DynamicDb;
    const { data: deposit, error: depositError } = await db
        .from("tenant_security_deposits")
        .select("id, office_id, company_id")
        .eq("company_id", companyId)
        .eq("id", input.depositId.trim())
        .maybeSingle();
    if (depositError) throw new Error(depositError.message);
    if (!deposit) throw new Error("Security deposit not found.");

    const { data, error } = await db.rpc("use_security_funds", {
        p_amount: amount,
        p_authorized_by: context.profile?.id ?? context.authUser?.id ?? null,
        p_company_id: companyId,
        p_deposit_id: deposit.id,
        p_expected_replacement_date: input.expectedReplacementDate?.slice(0, 10) || null,
        p_notes: input.notes?.trim() || null,
        p_office_id: deposit.office_id,
        p_reason: input.reason.trim(),
        p_usage_date: usageDate,
    });
    if (error) throw new Error(error.message ?? "Security funds could not be used.");

    revalidateSecurityPaths();
    return data;
}

export async function restoreSecurityFunds(input: RestoreSecurityFundsInput) {
    const context = await requireCompanyAdminMode();
    const companyId = context.activeCompany?.id;
    if (!companyId) throw new Error("Active company is required.");
    const amount = assertAmount(input.amount, "Security funds restored");
    const restoreDate = assertDate(input.restoreDate, "Restore date");
    if (!input.depositId.trim()) throw new Error("Security deposit is required.");

    const db = createSupabaseAdminClient() as unknown as DynamicDb;
    const { data: deposit, error: depositError } = await db
        .from("tenant_security_deposits")
        .select("id, office_id, company_id")
        .eq("company_id", companyId)
        .eq("id", input.depositId.trim())
        .maybeSingle();
    if (depositError) throw new Error(depositError.message);
    if (!deposit) throw new Error("Security deposit not found.");

    const { data, error } = await db.rpc("restore_security_funds", {
        p_amount: amount,
        p_company_id: companyId,
        p_deposit_id: deposit.id,
        p_notes: input.notes?.trim() || null,
        p_office_id: deposit.office_id,
        p_reference_number: input.referenceNumber?.trim() || null,
        p_restore_date: restoreDate,
        p_restored_by: context.profile?.id ?? context.authUser?.id ?? null,
    });
    if (error) throw new Error(error.message ?? "Security funds could not be restored.");

    revalidateSecurityPaths();
    return data;
}

export async function getActiveTenantSecurityDeposit(tenantId: string, companyId: string) {
    const db = createSupabaseAdminClient() as unknown as DynamicDb;
    const { data, error } = await db
        .from("security_deposit_register")
        .select("*")
        .eq("company_id", companyId)
        .eq("tenant_id", tenantId)
        .in("status", ["held", "partially_used_by_company", "fully_used_by_company", "refund_pending", "partially_refunded"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) throw new Error(error.message);
    return data as Record<string, unknown> | null;
}

export async function settleSecurityDeposit(input: SettleSecurityDepositInput) {
    const context = await requireAuth();
    const canSettle =
        context.isCompanyAdmin ||
        hasPermission(context, "collections.manage") ||
        hasPermission(context, "properties.manage");
    if (!canSettle) throw new Error("You do not have permission to settle security deposits.");
    const companyId = context.activeCompany?.id;
    if (!companyId) throw new Error("Active company is required.");
    if (!input.depositId.trim()) throw new Error("Security deposit is required.");
    if (!input.reason.trim()) throw new Error("Security settlement reason is required.");
    const vacateDate = assertDate(input.vacateDate, "Vacate date");

    const db = createSupabaseAdminClient() as unknown as DynamicDb;
    const { data: deposit, error: depositError } = await db
        .from("tenant_security_deposits")
        .select("id, office_id, company_id")
        .eq("company_id", companyId)
        .eq("id", input.depositId.trim())
        .maybeSingle();
    if (depositError) throw new Error(depositError.message);
    if (!deposit) throw new Error("Security deposit not found.");
    if (!canAccessOffice(context, deposit.office_id)) throw new Error("You can only settle security for your assigned office.");

    const { data, error } = await db.rpc("settle_security_deposit", {
        p_actor_id: context.profile?.id ?? context.authUser?.id ?? null,
        p_applied_to_debt: Math.max(0, Number(input.appliedToDebt ?? 0)),
        p_company_id: companyId,
        p_damage_deduction: Math.max(0, Number(input.damageDeduction ?? 0)),
        p_decision: input.decision,
        p_deposit_id: deposit.id,
        p_other_deduction: Math.max(0, Number(input.otherDeduction ?? 0)),
        p_reason: input.reason.trim(),
        p_refund_amount: Math.max(0, Number(input.refundAmount ?? 0)),
        p_retained_amount: Math.max(0, Number(input.retainedAmount ?? 0)),
        p_vacate_date: vacateDate,
    });
    if (error) throw new Error(error.message ?? "Security deposit could not be settled.");

    revalidateSecurityPaths();
    return data;
}
