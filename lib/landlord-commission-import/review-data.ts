import { requireCompanyAdminMode } from "@/lib/auth/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CommissionReviewRow = {
    id: string;
    rowNumber: number;
    landlordName: string;
    workbookValue: number | null;
    supabaseValue: number | null;
    reason: string;
    status: string;
    suggestedLandlordName: string | null;
    suggestedLandlordId: string | null;
    confidence: number;
};

export type CommissionReviewData = {
    batchId: string | null;
    fileName: string | null;
    createdAt: string | null;
    totals: {
        totalRows: number;
        importedRows: number;
        reviewRows: number;
        unmatchedRows: number;
        ambiguousRows: number;
        invalidRows: number;
    };
    rows: CommissionReviewRow[];
};

type LooseDb = {
    from: (table: string) => {
        select: (columns: string) => QueryBuilder;
    };
};

type QueryBuilder = {
    eq: (column: string, value: string) => QueryBuilder;
    neq: (column: string, value: string) => QueryBuilder;
    order: (column: string, options?: { ascending?: boolean }) => QueryBuilder;
    limit: (count: number) => QueryBuilder;
    single: () => Promise<{ data: Record<string, unknown>; error: { message: string } | null }>;
} & Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;

export async function getCommissionImportReviewData(): Promise<CommissionReviewData> {
    const context = await requireCompanyAdminMode();
    if (!context.activeCompany?.id) return emptyData();
    const supabase = await createSupabaseServerClient();
    const db = supabase as unknown as LooseDb;

    const batchResult = await db
        .from("landlord_commission_import_batches")
        .select("*")
        .eq("company_id", context.activeCompany.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

    if (batchResult.error) return emptyData();
    const batch = batchResult.data;
    const rowsResult = await db
        .from("landlord_commission_import_rows")
        .select("*")
        .eq("batch_id", String(batch.id))
        .neq("match_status", "matched")
        .order("row_number", { ascending: true });
    if (rowsResult.error) throw new Error(rowsResult.error.message);

    const suggestedIds = Array.from(new Set((rowsResult.data ?? []).map((row) => row.matched_landlord_id).filter((id): id is string => typeof id === "string")));
    const landlordById = new Map<string, Record<string, unknown>>();
    if (suggestedIds.length) {
        const landlordsResult = await (supabase as unknown as {
            from: (table: string) => {
                select: (columns: string) => { in: (column: string, values: string[]) => Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }> };
            };
        }).from("landlords").select("id, full_name, commission_rate, landlord_net_payable_override").in("id", suggestedIds);
        if (landlordsResult.error) throw new Error(landlordsResult.error.message);
        for (const landlord of landlordsResult.data ?? []) landlordById.set(String(landlord.id), landlord);
    }

    const rows = (rowsResult.data ?? []).map((row): CommissionReviewRow => {
        const suggestedLandlord = typeof row.matched_landlord_id === "string" ? landlordById.get(row.matched_landlord_id) ?? null : null;
        return {
            id: String(row.id),
            rowNumber: Number(row.row_number ?? 0),
            landlordName: String(row.detected_landlord_name ?? "Unknown landlord"),
            workbookValue: numeric(row.detected_landlord_net_payable),
            supabaseValue: numeric(row.detected_portfolio_rent_roll),
            reason: String(row.error_message ?? row.match_reason ?? "Needs review before import."),
            status: String(row.match_status ?? "review"),
            suggestedLandlordId: suggestedLandlord ? String(suggestedLandlord.id) : null,
            suggestedLandlordName: suggestedLandlord ? String(suggestedLandlord.full_name ?? "Suggested landlord") : null,
            confidence: Number(row.match_confidence ?? 0),
        };
    });

    return {
        batchId: String(batch.id),
        fileName: String(batch.file_name ?? "Commission workbook"),
        createdAt: String(batch.created_at ?? ""),
        totals: {
            totalRows: Number(batch.total_rows ?? 0),
            importedRows: Number(batch.imported_rows ?? 0),
            reviewRows: rows.length,
            unmatchedRows: rows.filter((row) => row.status === "unmatched").length,
            ambiguousRows: rows.filter((row) => row.status === "ambiguous").length,
            invalidRows: rows.filter((row) => row.status === "invalid").length,
        },
        rows,
    };
}

function numeric(value: unknown) {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : null;
}

function emptyData(): CommissionReviewData {
    return {
        batchId: null,
        fileName: null,
        createdAt: null,
        totals: {
            totalRows: 0,
            importedRows: 0,
            reviewRows: 0,
            unmatchedRows: 0,
            ambiguousRows: 0,
            invalidRows: 0,
        },
        rows: [],
    };
}
