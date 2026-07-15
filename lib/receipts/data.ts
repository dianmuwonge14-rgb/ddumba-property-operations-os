import { cache } from "react";
import { hasPermission, requireAuth } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { PaymentReceiptSnapshot } from "@/lib/receipts/payment-receipts";

type ReceiptRow = {
    id: string;
    company_id: string;
    office_id: string | null;
    payment_id: string;
    payment_type: string;
    receipt_number: string;
    receipt_snapshot: PaymentReceiptSnapshot;
    status: string;
    verification_code: string;
    issued_at: string | null;
    issued_by: string | null;
};

function missingSchema(error: { message?: string; code?: string } | null | undefined) {
    const message = String(error?.message ?? "");
    return error?.code === "42P01" || error?.code === "PGRST205" || /does not exist|schema cache|Could not find/i.test(message);
}

export type ReceiptHistoryItem = {
    amountPaid: number;
    id: string;
    issuedAt: string | null;
    officeName: string | null;
    paymentId: string;
    paymentType: string;
    receiptNumber: string;
    recordedByName: string | null;
    remainingOutstandingBalance: number;
    roomNumber: string | null;
    snapshot: PaymentReceiptSnapshot;
    status: string;
    tenantName: string | null;
    tenantPhone: string | null;
    verificationCode: string;
};

export const getReceiptHistoryData = cache(async function getReceiptHistoryData() {
    const context = await requireAuth();
    if (!context.activeCompany?.id) {
        return { error: "Active company is required.", receipts: [] as ReceiptHistoryItem[] };
    }
    const canReadReceipts =
        context.isCompanyAdmin ||
        context.authMode === "collector" ||
        hasPermission(context, "collections.read") ||
        hasPermission(context, "collections.view") ||
        hasPermission(context, "landlords.read");
    if (!canReadReceipts) return { error: "You do not have permission to view receipts.", receipts: [] as ReceiptHistoryItem[] };

    const db = createSupabaseAdminClient() as unknown as { from: (table: string) => any };
    let query = db
        .from("payment_receipts")
        .select("*")
        .eq("company_id", context.activeCompany.id)
        .order("issued_at", { ascending: false })
        .limit(300);

    if (!context.isCompanyAdmin && context.authMode !== "collector" && context.activeOffice?.id) {
        query = query.eq("office_id", context.activeOffice.id);
    }
    if (context.authMode === "collector" && context.profile?.id) {
        query = query.eq("issued_by", context.profile.id);
    }

    const { data, error } = await query;
    if (error) {
        return {
            error: missingSchema(error) ? "Receipt tables are not applied yet. Apply migration 0204_payment_receipts.sql." : error.message,
            receipts: [] as ReceiptHistoryItem[],
        };
    }

    return {
        error: null,
        receipts: ((data ?? []) as ReceiptRow[]).map((row) => ({
            amountPaid: Number(row.receipt_snapshot?.amountPaid ?? 0),
            id: row.id,
            issuedAt: row.issued_at,
            officeName: row.receipt_snapshot?.officeName ?? null,
            paymentId: row.payment_id,
            paymentType: row.payment_type,
            receiptNumber: row.receipt_number,
            recordedByName: row.receipt_snapshot?.recordedByName ?? null,
            remainingOutstandingBalance: Number(row.receipt_snapshot?.remainingOutstandingBalance ?? 0),
            roomNumber: row.receipt_snapshot?.roomNumber ?? null,
            snapshot: row.receipt_snapshot,
            status: row.status,
            tenantName: row.receipt_snapshot?.tenantName ?? null,
            tenantPhone: row.receipt_snapshot?.tenantPhone ?? null,
            verificationCode: row.verification_code,
        })),
    };
});
