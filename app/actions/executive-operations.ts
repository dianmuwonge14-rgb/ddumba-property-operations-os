"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyAdminMode } from "@/lib/auth/permissions";
import { logUserAction } from "@/lib/auth/audit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type OfficeTargetInput = {
    officeId: string;
    periodStart: string;
    periodEnd: string;
    collectionTarget: number;
    expenseBudget: number;
    landlordSettlementTarget: number;
    promiseRecoveryTarget: number;
    occupancyTarget: number;
};

const targetKeys = {
    collectionTarget: "monthly_collection_target",
    expenseBudget: "monthly_expense_budget",
    landlordSettlementTarget: "monthly_landlord_settlement_target",
    promiseRecoveryTarget: "promise_recovery_target",
    occupancyTarget: "occupancy_target",
} as const;

export async function saveOfficeTargets(input: OfficeTargetInput) {
    const context = await requireCompanyAdminMode();
    if (!context.activeCompany?.id) throw new Error("Active company is required.");
    if (!input.officeId) throw new Error("Office is required.");
    if (!input.periodStart || !input.periodEnd) throw new Error("Target period is required.");

    const supabase = await createSupabaseServerClient();
    const rows = [
        { metric_key: targetKeys.collectionTarget, target_value: Math.max(0, Number(input.collectionTarget) || 0) },
        { metric_key: targetKeys.expenseBudget, target_value: Math.max(0, Number(input.expenseBudget) || 0) },
        { metric_key: targetKeys.landlordSettlementTarget, target_value: Math.max(0, Number(input.landlordSettlementTarget) || 0) },
        { metric_key: targetKeys.promiseRecoveryTarget, target_value: Math.max(0, Number(input.promiseRecoveryTarget) || 0) },
        { metric_key: targetKeys.occupancyTarget, target_value: Math.max(0, Number(input.occupancyTarget) || 0) },
    ].map((row) => ({
        company_id: context.activeCompany!.id,
        office_id: input.officeId,
        period_start: input.periodStart,
        period_end: input.periodEnd,
        ...row,
    }));

    const { data, error } = await supabase
        .from("performance_targets")
        .insert(rows)
        .select("*");

    if (error) throw new Error(error.message);

    await logUserAction({
        action: "office_targets_saved",
        entityType: "performance_targets",
        entityId: input.officeId,
        companyId: context.activeCompany.id,
        officeId: input.officeId,
        afterData: data ?? rows,
    });

    revalidatePath("/office/ceo");
    revalidatePath("/office/excellence");
    revalidatePath("/office/reports");
    return { message: "Office targets saved.", rows: data ?? [] };
}

export async function recordLandlordSettlementPayment(input: {
    landlordId: string;
    officeId: string;
    amount: number;
    paymentMethod: string;
    reference: string;
}) {
    const context = await requireCompanyAdminMode();
    if (!context.activeCompany?.id) throw new Error("Active company is required.");
    if (!input.landlordId || !input.officeId) throw new Error("Landlord and office are required.");
    const amount = Math.max(0, Number(input.amount) || 0);
    if (!amount) throw new Error("Settlement amount is required.");

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
        .from("landlord_payments")
        .insert({
            amount,
            company_id: context.activeCompany.id,
            created_by: context.profile?.id ?? null,
            landlord_id: input.landlordId,
            office_id: input.officeId,
            paid_at: new Date().toISOString(),
            payment_method: input.paymentMethod || "cash",
            payout_reference: input.reference || `SET-${Date.now()}`,
            status: "paid",
        })
        .select("*")
        .single();

    if (error) throw new Error(error.message);

    await logUserAction({
        action: "landlord_settlement_payment_recorded",
        entityType: "landlord_payment",
        entityId: data.id,
        companyId: context.activeCompany.id,
        officeId: input.officeId,
        afterData: data,
    });

    revalidatePath("/office/ceo");
    revalidatePath("/office/landlords");
    revalidatePath("/office/spreadsheet");
    return { message: "Landlord settlement payment recorded.", payment: data };
}
