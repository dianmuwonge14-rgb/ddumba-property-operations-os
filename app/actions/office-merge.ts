"use server";

import { revalidatePath } from "next/cache";
import { logUserAction } from "@/lib/auth/audit";
import { requireCompanyAdminMode } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type LooseRow = Record<string, any>;

type ExecuteOfficeMergeInput = {
    sourceOfficeIds: string[];
    newOfficeName: string;
    reasonNote?: string;
    confirmation: string;
    userHandling: "reassign" | "disable";
    affectedCounts: Record<string, number>;
};

const CONFIRMATION_PHRASE = "MERGE OFFICES";

const MERGE_TABLES = [
    "landlords",
    "properties",
    "rooms",
    "tenants",
    "leases",
    "collections",
    "promises",
    "expenses",
    "attendance_events",
    "office_daily_reports",
    "landlord_monthly_payables",
    "landlord_monthly_payable_payments",
    "landlord_advances",
    "landlord_debt_deductions",
    "tenant_ledger_entries",
    "notifications",
    "audit_logs",
    "employees",
    "user_office_roles",
    "landlord_summary",
    "office_finance_summary",
    "landlord_search_index",
] as const;

function cleanIds(ids: string[]) {
    return Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
}

export async function executeOfficeMerge(input: ExecuteOfficeMergeInput) {
    const context = await requireCompanyAdminMode();
    if (!context.activeCompany?.id) throw new Error("Active company is required.");
    if (input.confirmation.trim().toUpperCase() !== CONFIRMATION_PHRASE) {
        throw new Error(`Type ${CONFIRMATION_PHRASE} to confirm this future merge action.`);
    }

    const sourceOfficeIds = cleanIds(input.sourceOfficeIds);
    const newOfficeName = input.newOfficeName.trim();
    if (sourceOfficeIds.length < 2) throw new Error("Select at least two source offices.");
    if (!newOfficeName) throw new Error("New merged office name is required.");

    const admin = createSupabaseAdminClient();
    const db = admin as unknown as { from: (table: string) => any };
    const companyId = context.activeCompany.id;
    const { data: sourceOffices, error: officesError } = await db
        .from("offices")
        .select("id,name,office_name,status")
        .eq("company_id", companyId)
        .in("id", sourceOfficeIds);
    if (officesError) throw new Error(officesError.message);
    if ((sourceOffices ?? []).length !== sourceOfficeIds.length) throw new Error("One or more selected offices could not be found.");

    const sourceOfficeRows = (sourceOffices ?? []) as LooseRow[];
    const sourceOfficeNames = sourceOfficeRows.map((office) => String(office.office_name ?? office.name ?? "Office"));
    const { data: batch, error: batchError } = await db
        .from("office_merge_batches")
        .insert({
            company_id: companyId,
            new_office_name: newOfficeName,
            source_office_ids: sourceOfficeIds,
            source_office_names: sourceOfficeNames,
            status: "confirmed",
            admin_user_id: context.profile?.id ?? null,
            affected_counts: input.affectedCounts,
            reason_note: input.reasonNote?.trim() || null,
            warning_acknowledged: true,
            confirmed_at: new Date().toISOString(),
        })
        .select("id")
        .single();
    if (batchError) throw new Error(batchError.message);

    const { data: newOffice, error: newOfficeError } = await db
        .from("offices")
        .insert({
            company_id: companyId,
            office_name: newOfficeName,
            name: newOfficeName,
            status: "active",
            original_office_id: sourceOfficeIds[0],
            original_office_name: sourceOfficeNames.join(", "),
            merge_batch_id: batch.id,
            merged_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .select("id")
        .single();
    if (newOfficeError) throw new Error(newOfficeError.message);

    const mergedAt = new Date().toISOString();
    for (const sourceOffice of sourceOfficeRows) {
        const sourceOfficeId = String(sourceOffice.id);
        const sourceOfficeName = String(sourceOffice.office_name ?? sourceOffice.name ?? "Office");
        for (const table of MERGE_TABLES) {
            if (table === "user_office_roles" && input.userHandling === "disable") continue;
            const { error } = await db
                .from(table)
                .update({
                    office_id: newOffice.id,
                    original_office_id: sourceOfficeId,
                    original_office_name: sourceOfficeName,
                    merged_into_office_id: newOffice.id,
                    merged_at: mergedAt,
                    merge_batch_id: batch.id,
                })
                .eq("company_id", companyId)
                .eq("office_id", sourceOfficeId);
            if (error) {
                await db.from("office_merge_batches").update({ status: "failed", error_message: `${table}: ${error.message}` }).eq("id", batch.id);
                throw new Error(`${table}: ${error.message}`);
            }
            await db.from("office_merge_audit").insert({
                company_id: companyId,
                merge_batch_id: batch.id,
                source_office_id: sourceOfficeId,
                source_office_name: sourceOfficeName,
                merged_into_office_id: newOffice.id,
                entity_table: table,
                action: "office_scope_moved",
                before_data: { office_id: sourceOfficeId, office_name: sourceOfficeName },
                after_data: { office_id: newOffice.id, office_name: newOfficeName },
                admin_user_id: context.profile?.id ?? null,
            });
        }
    }

    if (input.userHandling === "disable") {
        for (const sourceOffice of sourceOfficeRows) {
            await db
                .from("user_office_roles")
                .update({
                    original_office_id: sourceOffice.id,
                    original_office_name: String(sourceOffice.office_name ?? sourceOffice.name ?? "Office"),
                    merged_into_office_id: newOffice.id,
                    merged_at: mergedAt,
                    merge_batch_id: batch.id,
                })
                .eq("company_id", companyId)
                .eq("office_id", sourceOffice.id);
        }
    }

    await db
        .from("offices")
        .update({
            status: "archived",
            merged_into_office_id: newOffice.id,
            merged_at: mergedAt,
            merge_batch_id: batch.id,
            updated_at: mergedAt,
        })
        .eq("company_id", companyId)
        .in("id", sourceOfficeIds);

    await db
        .from("office_merge_batches")
        .update({ status: "completed", new_office_id: newOffice.id, completed_at: mergedAt })
        .eq("id", batch.id);

    await logUserAction({
        action: "office_merge_completed",
        entityType: "office_merge_batch",
        entityId: batch.id,
        companyId,
        officeId: newOffice.id,
        beforeData: { sourceOfficeIds, sourceOfficeNames },
        afterData: { newOfficeId: newOffice.id, newOfficeName, affectedCounts: input.affectedCounts },
    });

    revalidatePath("/office/admin/office-merge");
    revalidatePath("/office/admin");
    revalidatePath("/office");
    return { batchId: batch.id, newOfficeId: newOffice.id };
}
