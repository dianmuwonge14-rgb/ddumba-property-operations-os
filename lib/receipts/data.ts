import { cache } from "react";
import { hasPermission, requireAuth } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { PaymentReceiptAmendmentSnapshot, PaymentReceiptSnapshot } from "@/lib/receipts/payment-receipts";

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

type DeliveryLogRow = {
    channel: string;
    delivery_status: string | null;
    receipt_id: string;
    sent_at: string | null;
    created_at: string | null;
};

type AmendmentRow = {
    amendment_type: string;
    approved_at: string | null;
    audit_reference: string | null;
    changed_at: string | null;
    created_at: string | null;
    id: string;
    new_snapshot: PaymentReceiptSnapshot | null;
    previous_snapshot: PaymentReceiptSnapshot | null;
    reason: string | null;
    receipt_id: string;
    status: string;
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
    amendmentSummary: string | null;
    amendments: PaymentReceiptAmendmentSnapshot[];
    approvedByName: string | null;
    changedByName: string | null;
    lastUpdatedAt: string | null;
    preparedByName: string | null;
    receiptNumber: string;
    recordedByName: string | null;
    remainingOutstandingBalance: number;
    roomNumber: string | null;
    snapshot: PaymentReceiptSnapshot;
    status: string;
    tenantName: string | null;
    tenantPhone: string | null;
    verificationCode: string;
    deliveryStatus: {
        email: string | null;
        emailAt: string | null;
        pdf: string | null;
        pdfAt: string | null;
        print: string | null;
        printAt: string | null;
        whatsapp: string | null;
        whatsappAt: string | null;
    };
};

export type ReceiptHistoryFilters = {
    collectorId?: string | null;
    endDate?: string | null;
    officeId?: string | null;
    startDate?: string | null;
};

export const getReceiptHistoryData = cache(async function getReceiptHistoryData(filters: ReceiptHistoryFilters = {}) {
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
    } else if (filters.officeId) {
        query = query.eq("office_id", filters.officeId);
    }

    if (filters.collectorId) {
        query = query.eq("issued_by", filters.collectorId);
    }

    if (filters.startDate) {
        query = query.gte("issued_at", `${filters.startDate}T00:00:00+03:00`);
    }
    if (filters.endDate) {
        query = query.lte("issued_at", `${filters.endDate}T23:59:59+03:00`);
    }

    const { data, error } = await query;
    if (error) {
        return {
            error: missingSchema(error) ? "Receipt tables are not applied yet. Apply migration 0204_payment_receipts.sql." : error.message,
            receipts: [] as ReceiptHistoryItem[],
        };
    }

    const rows = (data ?? []) as ReceiptRow[];
    const receiptIds = rows.map((row) => row.id);
    const deliveryByReceipt = new Map<string, ReceiptHistoryItem["deliveryStatus"]>();
    if (receiptIds.length) {
        const { data: deliveryRows, error: deliveryError } = await db
            .from("payment_receipt_delivery_logs")
            .select("receipt_id,channel,delivery_status,sent_at,created_at")
            .in("receipt_id", receiptIds)
            .order("created_at", { ascending: false })
            .limit(receiptIds.length * 8);
        if (!deliveryError || missingSchema(deliveryError)) {
            for (const row of ((deliveryRows ?? []) as DeliveryLogRow[])) {
                const current = deliveryByReceipt.get(row.receipt_id) ?? {
                    email: null,
                    emailAt: null,
                    pdf: null,
                    pdfAt: null,
                    print: null,
                    printAt: null,
                    whatsapp: null,
                    whatsappAt: null,
                };
                const timestamp = row.sent_at ?? row.created_at ?? null;
                if (row.channel === "print" && !current.print) {
                    current.print = row.delivery_status ?? "sent";
                    current.printAt = timestamp;
                }
                if (row.channel === "download_pdf" && !current.pdf) {
                    current.pdf = row.delivery_status ?? "sent";
                    current.pdfAt = timestamp;
                }
                if (row.channel === "whatsapp" && !current.whatsapp) {
                    current.whatsapp = row.delivery_status ?? "sent";
                    current.whatsappAt = timestamp;
                }
                if (row.channel === "email" && !current.email) {
                    current.email = row.delivery_status ?? "sent";
                    current.emailAt = timestamp;
                }
                deliveryByReceipt.set(row.receipt_id, current);
            }
        }
    }
    const amendmentsByReceipt = new Map<string, PaymentReceiptAmendmentSnapshot[]>();
    if (receiptIds.length) {
        const { data: amendmentRows, error: amendmentError } = await db
            .from("payment_receipt_amendments")
            .select("id,receipt_id,amendment_type,previous_snapshot,new_snapshot,reason,status,audit_reference,requested_at,changed_at,approved_at,created_at")
            .in("receipt_id", receiptIds)
            .order("created_at", { ascending: true })
            .limit(receiptIds.length * 12);
        if (!amendmentError || missingSchema(amendmentError)) {
            for (const row of ((amendmentRows ?? []) as AmendmentRow[])) {
                const fromSnapshot = row.new_snapshot?.amendmentHistory?.at(-1);
                const amendment: PaymentReceiptAmendmentSnapshot = fromSnapshot ?? {
                    amendmentType: row.amendment_type,
                    approvalDate: row.approved_at,
                    approvedByName: row.new_snapshot?.changeApprovedByName ?? null,
                    auditReference: row.audit_reference,
                    changeDate: row.changed_at ?? row.created_at,
                    changedByName: row.new_snapshot?.changedByName ?? null,
                    fieldLabel: row.new_snapshot?.changeType ?? row.amendment_type.replaceAll("_", " "),
                    newValue: null,
                    previousValue: null,
                    reason: row.reason,
                    requestedAt: row.created_at,
                    requestedByName: row.new_snapshot?.changeRequestedByName ?? null,
                    status: row.status,
                };
                amendmentsByReceipt.set(row.receipt_id, [...(amendmentsByReceipt.get(row.receipt_id) ?? []), amendment]);
            }
        }
    }

    return {
        error: null,
        receipts: rows.map((row) => {
            const amendments = amendmentsByReceipt.get(row.id) ?? row.receipt_snapshot?.amendmentHistory ?? [];
            const latestAmendment = amendments.at(-1) ?? null;
            return ({
            amountPaid: Number(row.receipt_snapshot?.amountPaid ?? 0),
            amendmentSummary: row.receipt_snapshot?.amendmentSummary ?? (
                latestAmendment
                    ? `${latestAmendment.fieldLabel} ${latestAmendment.status === "rejected" ? "change rejected" : "changed"}`
                    : null
            ),
            amendments,
            approvedByName: row.receipt_snapshot?.changeApprovedByName ?? latestAmendment?.approvedByName ?? null,
            changedByName: row.receipt_snapshot?.changedByName ?? latestAmendment?.changedByName ?? null,
            deliveryStatus: deliveryByReceipt.get(row.id) ?? {
                email: null,
                emailAt: null,
                pdf: null,
                pdfAt: null,
                print: null,
                printAt: null,
                whatsapp: null,
                whatsappAt: null,
            },
            id: row.id,
            issuedAt: row.issued_at,
            lastUpdatedAt: latestAmendment?.approvalDate ?? latestAmendment?.changeDate ?? row.issued_at,
            officeName: row.receipt_snapshot?.officeName ?? null,
            paymentId: row.payment_id,
            paymentType: row.payment_type,
            preparedByName: row.receipt_snapshot?.preparedByName ?? row.receipt_snapshot?.recordedByName ?? null,
            receiptNumber: row.receipt_number,
            recordedByName: row.receipt_snapshot?.recordedByName ?? null,
            remainingOutstandingBalance: Number(row.receipt_snapshot?.remainingOutstandingBalance ?? 0),
            roomNumber: row.receipt_snapshot?.roomNumber ?? null,
            snapshot: row.receipt_snapshot,
            status: row.status,
            tenantName: row.receipt_snapshot?.tenantName ?? null,
            tenantPhone: row.receipt_snapshot?.tenantPhone ?? null,
            verificationCode: row.verification_code,
            });
        }),
    };
});
