import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { logUserAction } from "@/lib/auth/audit";
import { getAuthContext } from "@/lib/auth/context";
import { COUNT_TABLES } from "@/lib/office-merge/constants";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

type LooseRow = Record<string, any>;

type OfficeMergeRequest = {
    confirmation?: string;
    destinationOfficeId?: string;
    reasonNote?: string;
    sourceOfficeId?: string;
    sourceOfficeIds?: string[];
    userHandling?: "reassign" | "disable";
};

function normalize(value: unknown) {
    return String(value ?? "").trim();
}

function jsonError(message: string, status = 400, code = "OFFICE_MERGE_FAILED", extra: Record<string, unknown> = {}) {
    return NextResponse.json({
        code,
        message,
        success: false,
        ...extra,
    }, { status });
}

function isInactive(status: string) {
    return ["archived", "deleted", "merged", "inactive"].includes(status.toLowerCase());
}

async function countOfficeRows(db: { from: (table: string) => any }, table: string, companyId: string, officeId: string) {
    const query = db.from(table).select("id", { count: "exact", head: true }).eq("office_id", officeId);
    const result = await (table === "offices" ? query.eq("id", officeId).eq("company_id", companyId) : query.eq("company_id", companyId));
    if (result.error) return 0;
    return Number(result.count ?? 0);
}

async function loadServerCounts(db: { from: (table: string) => any }, companyId: string, officeId: string) {
    const counts: Record<string, number> = {};
    for (const item of COUNT_TABLES) counts[item.key] = 0;

    const [roomsResult, tenantsResult, propertiesResult] = await Promise.all([
        db.from("rooms").select("id,landlord_id,monthly_rent,status").eq("company_id", companyId).eq("office_id", officeId),
        db.from("tenants").select("id,status").eq("company_id", companyId).eq("office_id", officeId),
        db.from("properties").select("id,status").eq("company_id", companyId).eq("office_id", officeId),
    ]);

    const rooms = ((roomsResult.data ?? []) as LooseRow[]).filter((row) => !["archived", "deleted", "inactive"].includes(String(row.status ?? "").toLowerCase()));
    const landlordIds = new Set(rooms.map((row) => row.landlord_id ? String(row.landlord_id) : "").filter(Boolean));
    counts.landlords = landlordIds.size;
    counts.rooms = rooms.length;
    counts.tenants = ((tenantsResult.data ?? []) as LooseRow[]).filter((row) => !["archived", "deleted", "inactive", "vacated"].includes(String(row.status ?? "").toLowerCase())).length;
    counts.properties = ((propertiesResult.data ?? []) as LooseRow[]).filter((row) => !["archived", "deleted", "inactive"].includes(String(row.status ?? "").toLowerCase())).length;
    counts.rentRoll = rooms.reduce((total, row) => total + Number(row.monthly_rent ?? 0), 0);

    const countJobs = COUNT_TABLES
        .filter((item) => !["landlords", "properties", "rooms", "tenants"].includes(item.key))
        .map(async (item) => [item.key, await countOfficeRows(db, item.table, companyId, officeId)] as const);
    for (const [key, count] of await Promise.all(countJobs)) counts[key] = count;
    return counts;
}

export async function POST(request: Request) {
    const startedAt = Date.now();
    try {
        const context = await getAuthContext();
        const companyId = context.activeCompany?.id;
        if (!context.isAuthenticated || !context.profile) {
            return jsonError("Your Admin session expired. Please sign in again.", 401, "OFFICE_MERGE_AUTH_EXPIRED");
        }
        if (!context.isCompanyAdmin || context.isOfficeMode) {
            return jsonError("Permission denied. Only active Admin accounts can merge offices.", 403, "OFFICE_MERGE_PERMISSION_DENIED");
        }
        if (!companyId) {
            return jsonError("Active company is required.", 400, "OFFICE_MERGE_NO_COMPANY");
        }

        const body = (await request.json().catch(() => null)) as OfficeMergeRequest | null;
        if (!body) return jsonError("Office merge request was not valid JSON.", 400, "OFFICE_MERGE_INVALID_JSON");

        const sourceOfficeIds = [...new Set([
            ...((Array.isArray(body.sourceOfficeIds) ? body.sourceOfficeIds : []) ?? []),
            body.sourceOfficeId,
        ].map(normalize).filter(Boolean))];
        const destinationOfficeId = normalize(body.destinationOfficeId);
        const confirmation = normalize(body.confirmation);
        const userHandling = body.userHandling === "disable" ? "disable" : "reassign";
        if (sourceOfficeIds.length === 0) return jsonError("Select at least one source office.", 400, "OFFICE_MERGE_NO_SOURCE");
        if (!destinationOfficeId) return jsonError("Select a destination office.", 400, "OFFICE_MERGE_NO_DESTINATION");
        if (sourceOfficeIds.includes(destinationOfficeId)) return jsonError("Source and destination cannot be the same.", 400, "OFFICE_MERGE_SAME_OFFICE");

        const admin = createSupabaseAdminClient();
        const db = admin as unknown as { from: (table: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any };
        const officeIds = [...sourceOfficeIds, destinationOfficeId];
        const { data: officeRows, error: officesError } = await db
            .from("offices")
            .select("id,name,office_name,status")
            .eq("company_id", companyId)
            .in("id", officeIds);
        if (officesError) return jsonError(officesError.message, 500, "OFFICE_MERGE_OFFICE_LOOKUP_FAILED");

        const offices = ((officeRows ?? []) as LooseRow[]).map((office) => ({
            id: String(office.id),
            name: normalize(office.office_name ?? office.name) || "Office",
            status: normalize(office.status || "active").toLowerCase(),
        }));
        const destinationOffice = offices.find((office) => office.id === destinationOfficeId);
        if (!destinationOffice) return jsonError("Destination office could not be found.", 404, "OFFICE_MERGE_DESTINATION_NOT_FOUND");
        if (isInactive(destinationOffice.status)) return jsonError("Destination office is inactive or merged.", 400, "OFFICE_MERGE_DESTINATION_INACTIVE");

        const sourceOffices = sourceOfficeIds.map((id) => offices.find((office) => office.id === id));
        const missingIndex = sourceOffices.findIndex((office) => !office);
        if (missingIndex >= 0) return jsonError("Source office could not be found.", 404, "OFFICE_MERGE_SOURCE_NOT_FOUND");
        if (sourceOffices.some((office) => office && isInactive(office.status))) {
            return jsonError("One source office is already inactive, archived, or merged.", 400, "OFFICE_MERGE_SOURCE_INACTIVE");
        }

        const validConfirmation = confirmation.toUpperCase() === "MERGE" || sourceOffices.some((office) => office?.name.toUpperCase() === confirmation.toUpperCase());
        if (!validConfirmation) {
            return jsonError("Type a source office name or MERGE to confirm this office merge.", 400, "OFFICE_MERGE_CONFIRMATION_REQUIRED");
        }

        const activeOfficesResult = await db
            .from("offices")
            .select("id", { count: "exact", head: true })
            .eq("company_id", companyId)
            .not("status", "in", "(archived,deleted,merged,inactive)");
        if (activeOfficesResult.error) return jsonError(activeOfficesResult.error.message, 500, "OFFICE_MERGE_ACTIVE_OFFICE_CHECK_FAILED");
        if (Number(activeOfficesResult.count ?? 0) <= sourceOfficeIds.length) {
            return jsonError("The final active company office cannot be merged.", 400, "OFFICE_MERGE_FINAL_OFFICE_BLOCKED");
        }

        const results = [];
        for (const sourceOfficeId of sourceOfficeIds) {
            const sourceOffice = sourceOffices.find((office) => office?.id === sourceOfficeId);
            const affectedCounts = await loadServerCounts(db, companyId, sourceOfficeId);
            const rpcResult = await db.rpc("ddumba_merge_offices", {
                p_admin_user_id: context.profile.id,
                p_company_id: companyId,
                p_confirmation: confirmation,
                p_destination_office_id: destinationOfficeId,
                p_expected_counts: affectedCounts,
                p_reason_note: normalize(body.reasonNote) || null,
                p_source_office_id: sourceOfficeId,
                p_user_handling: userHandling,
            });

            if (rpcResult.error) {
                const message = String(rpcResult.error.message ?? "Office merge could not be completed.");
                return jsonError(message, 500, "OFFICE_MERGE_RPC_FAILED", {
                    stage: "executing_rpc",
                    sourceOfficeId,
                    sourceOfficeName: sourceOffice?.name,
                });
            }

            const result = (rpcResult.data ?? {}) as LooseRow;
            const batchId = normalize(result.batch_id);
            results.push({
                accountsReassigned: Number(result.accounts_reassigned ?? affectedCounts.officeUsers ?? 0),
                batchId,
                mergeReference: normalize(result.merge_reference) || "MERGE",
                mergedAt: normalize(result.merged_at) || new Date().toISOString(),
                sourceOfficeName: normalize(result.source_office_name) || sourceOffice?.name || "Office",
                sourceStatus: normalize(result.source_status) || "merged",
                transferredCounts: (result.transferred_counts ?? affectedCounts) as Record<string, number>,
            });

            await logUserAction({
                action: "office_merge_completed",
                afterData: {
                    affectedCounts,
                    destinationOfficeId,
                    destinationOfficeName: destinationOffice.name,
                    mergeReference: normalize(result.merge_reference) || "MERGE",
                },
                beforeData: { sourceOfficeId, sourceOfficeName: sourceOffice?.name },
                companyId,
                entityId: batchId,
                entityType: "office_merge_batch",
                officeId: destinationOfficeId,
            });
        }

        revalidatePath("/office", "layout");
        revalidatePath("/office/admin/office-merge");
        revalidatePath("/office/admin");
        revalidatePath("/office/ceo");
        revalidatePath("/office/cash-banking");
        revalidatePath("/office/landlords");
        revalidatePath("/office/properties");
        revalidatePath("/office/payments");
        revalidatePath("/office/receipts");

        return NextResponse.json({
            code: "OFFICE_MERGE_COMPLETED",
            destinationOfficeName: destinationOffice.name,
            durationMs: Date.now() - startedAt,
            results,
            success: true,
        });
    } catch (error) {
        console.error("[office-merge] production merge request failed", error);
        return jsonError(error instanceof Error ? error.message : "Office merge could not be completed.", 500, "OFFICE_MERGE_UNHANDLED");
    }
}
