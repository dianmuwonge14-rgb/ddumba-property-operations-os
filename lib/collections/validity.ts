export const INVALID_COLLECTION_STATUSES = new Set([
    "archived",
    "cancelled",
    "canceled",
    "corrected",
    "deleted",
    "duplicate",
    "pending",
    "rejected",
    "removed",
    "removed_by_admin_approval",
    "reversed",
    "superseded",
    "void",
    "voided",
]);

export type CollectionValidityRow = Record<string, unknown> & {
    id?: string | null;
    amount?: number | string | null;
    amount_paid?: number | string | null;
    correction_of_payment_id?: string | null;
    corrected_by_payment_id?: string | null;
    deleted_at?: string | null;
    financial_effective?: boolean | null;
    reversed_at?: string | null;
    superseded_at?: string | null;
    superseded_by_payment_id?: string | null;
    status?: string | null;
    voided_at?: string | null;
};

export function isFinanciallyEffectiveCollection(row: CollectionValidityRow | null | undefined) {
    if (!row) return false;
    const status = String(row.status ?? "posted").toLowerCase();
    if (INVALID_COLLECTION_STATUSES.has(status)) return false;
    if (status.includes("duplicate") || status.includes("reversed")) return false;
    if (row.financial_effective === false) return false;
    if (row.reversed_at || row.voided_at || row.deleted_at || row.superseded_at) return false;
    if (row.superseded_by_payment_id || row.corrected_by_payment_id) return false;
    return true;
}

export function collectionAmount(row: CollectionValidityRow | null | undefined) {
    const numeric = Number(row?.amount_paid ?? row?.amount ?? 0);
    return Number.isFinite(numeric) ? numeric : 0;
}

export function uniqueFinanciallyEffectiveCollections<T extends CollectionValidityRow>(rows: T[]) {
    const validRows = rows.filter(isFinanciallyEffectiveCollection);
    const replacementOriginalIds = new Set(
        validRows
            .map((row) => String(row.correction_of_payment_id ?? ""))
            .filter(Boolean),
    );
    const byId = new Map<string, T>();
    for (const row of validRows) {
        const id = String(row.id ?? "");
        if (!id || replacementOriginalIds.has(id)) continue;
        byId.set(id, row);
    }
    return [...byId.values()];
}

export function sumFinanciallyEffectiveCollections(rows: CollectionValidityRow[]) {
    return uniqueFinanciallyEffectiveCollections(rows).reduce((total, row) => total + collectionAmount(row), 0);
}
