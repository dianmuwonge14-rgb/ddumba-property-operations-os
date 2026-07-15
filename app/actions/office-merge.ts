"use server";

import { revalidatePath } from "next/cache";
import { logUserAction } from "@/lib/auth/audit";
import { requireCompanyAdminMode } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type ExecuteOfficeMergeInput = {
    sourceOfficeId: string;
    destinationOfficeId: string;
    reasonNote?: string;
    confirmation: string;
    userHandling: "reassign" | "disable";
    affectedCounts: Record<string, number>;
};

type OfficeMergeResult = {
    batchId: string;
    mergeReference: string;
    sourceOfficeName: string;
    destinationOfficeName: string;
    transferredCounts: Record<string, number>;
    accountsReassigned: number;
    sourceStatus: string;
    mergedAt: string;
};

type LooseRow = Record<string, any>;

function normalize(value: unknown) {
    return String(value ?? "").trim();
}

export async function executeOfficeMerge(input: ExecuteOfficeMergeInput): Promise<OfficeMergeResult> {
    const context = await requireCompanyAdminMode();
    const companyId = context.activeCompany?.id;
    if (!companyId) throw new Error("Active company is required.");

    const sourceOfficeId = normalize(input.sourceOfficeId);
    const destinationOfficeId = normalize(input.destinationOfficeId);
    const confirmation = normalize(input.confirmation);
    if (!sourceOfficeId) throw new Error("Select a source office.");
    if (!destinationOfficeId) throw new Error("Select a destination office.");
    if (sourceOfficeId === destinationOfficeId) throw new Error("Source and destination cannot be the same.");

    const admin = createSupabaseAdminClient();
    const db = admin as unknown as { from: (table: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any };

    const { data: officeRows, error: officesError } = await db
        .from("offices")
        .select("id,name,office_name,status")
        .eq("company_id", companyId)
        .in("id", [sourceOfficeId, destinationOfficeId]);
    if (officesError) throw new Error(officesError.message);

    const offices = ((officeRows ?? []) as LooseRow[]).map((office) => ({
        id: String(office.id),
        name: normalize(office.office_name ?? office.name) || "Office",
        status: normalize(office.status || "active").toLowerCase(),
    }));
    const sourceOffice = offices.find((office) => office.id === sourceOfficeId);
    const destinationOffice = offices.find((office) => office.id === destinationOfficeId);
    if (!sourceOffice) throw new Error("Source office could not be found.");
    if (!destinationOffice) throw new Error("Destination office could not be found.");
    if (["archived", "deleted", "merged"].includes(sourceOffice.status)) throw new Error("Source office is not active enough to merge.");
    if (["archived", "deleted", "merged"].includes(destinationOffice.status)) throw new Error("Destination office is inactive or merged. Reactivate it before merging.");
    if (![sourceOffice.name.toUpperCase(), "MERGE"].includes(confirmation.toUpperCase())) {
        throw new Error(`Type ${sourceOffice.name} or MERGE to confirm this office merge.`);
    }

    const activeOfficesResult = await db
        .from("offices")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .not("status", "in", "(archived,deleted,merged,inactive)");
    if (activeOfficesResult.error) throw new Error(activeOfficesResult.error.message);
    if (Number(activeOfficesResult.count ?? 0) < 2) throw new Error("The final active company office cannot be merged.");

    const rpcResult = await db.rpc("ddumba_merge_offices", {
        p_company_id: companyId,
        p_source_office_id: sourceOfficeId,
        p_destination_office_id: destinationOfficeId,
        p_admin_user_id: context.profile?.id ?? null,
        p_reason_note: normalize(input.reasonNote) || null,
        p_confirmation: confirmation,
        p_user_handling: input.userHandling,
        p_expected_counts: input.affectedCounts ?? {},
    });

    if (rpcResult.error) {
        const message = String(rpcResult.error.message ?? "Office merge failed. No records were changed.");
        if (message.toLowerCase().includes("ddumba_merge_offices")) {
            throw new Error("Database setup is incomplete. Apply the office merge transaction migration before merging offices.");
        }
        throw new Error(message);
    }

    const result = (rpcResult.data ?? {}) as LooseRow;
    const mergeResult: OfficeMergeResult = {
        batchId: normalize(result.batch_id),
        mergeReference: normalize(result.merge_reference) || "MERGE",
        sourceOfficeName: normalize(result.source_office_name) || sourceOffice.name,
        destinationOfficeName: normalize(result.destination_office_name) || destinationOffice.name,
        transferredCounts: (result.transferred_counts ?? input.affectedCounts ?? {}) as Record<string, number>,
        accountsReassigned: Number(result.accounts_reassigned ?? input.affectedCounts?.officeUsers ?? 0),
        sourceStatus: normalize(result.source_status) || "merged",
        mergedAt: normalize(result.merged_at) || new Date().toISOString(),
    };

    await logUserAction({
        action: "office_merge_completed",
        entityType: "office_merge_batch",
        entityId: mergeResult.batchId,
        companyId,
        officeId: destinationOfficeId,
        beforeData: { sourceOfficeId, sourceOfficeName: sourceOffice.name },
        afterData: {
            destinationOfficeId,
            destinationOfficeName: destinationOffice.name,
            affectedCounts: input.affectedCounts,
            mergeReference: mergeResult.mergeReference,
        },
    });

    revalidatePath("/office", "layout");
    revalidatePath("/office/admin/office-merge");
    revalidatePath("/office/admin");
    revalidatePath("/office/ceo");
    revalidatePath("/office/cash-banking");
    revalidatePath("/office/landlords");
    revalidatePath("/office/properties");
    revalidatePath("/office/payments");
    revalidatePath("/office/receipts");
    return mergeResult;
}
