import { cache } from "react";
import { hasPermission, requireAuth } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { addMonthsToBillingDate, clampBillingDay, dateForBillingDay, previousDay } from "@/lib/tenants/billing-cycle";
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

type LooseRow = Record<string, unknown>;

function missingSchema(error: { message?: string; code?: string } | null | undefined) {
    const message = String(error?.message ?? "");
    return error?.code === "42P01" || error?.code === "PGRST205" || /does not exist|schema cache|Could not find/i.test(message);
}

function text(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

function paymentDateKey(row: LooseRow) {
    return text(row.payment_date)?.slice(0, 10)
        ?? text(row.paid_at)?.slice(0, 10)
        ?? text(row.created_at)?.slice(0, 10)
        ?? null;
}

function leaseCoversPaymentDate(lease: LooseRow, paymentDate: string | null) {
    if (!paymentDate) return true;
    const start = text(lease.start_date)?.slice(0, 10) ?? "";
    const end = text(lease.end_date)?.slice(0, 10) ?? "";
    return (!start || start <= paymentDate) && (!end || end >= paymentDate);
}

function receiptCoverageDateLabel(value: string | null) {
    if (!value) return null;
    const parsed = new Date(`${value.slice(0, 10)}T00:00:00+03:00`);
    if (Number.isNaN(parsed.getTime())) return value;
    return new Intl.DateTimeFormat("en-UG", { day: "2-digit", month: "short", timeZone: "Africa/Kampala", year: "numeric" }).format(parsed);
}

function coverageForReceiptAllocation(month: string, billingDay: number) {
    const dateOnly = String(month ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return null;
    const [year, monthNumber] = dateOnly.slice(0, 7).split("-").map(Number);
    const coverageStart = dateForBillingDay(year, monthNumber - 1, billingDay);
    const coverageEnd = previousDay(addMonthsToBillingDate(coverageStart, 1, billingDay));
    const startLabel = receiptCoverageDateLabel(coverageStart);
    const endLabel = receiptCoverageDateLabel(coverageEnd);
    return startLabel && endLabel ? `${startLabel} - ${endLabel}` : null;
}

async function fetchReceiptCoverageProjection(db: { from: (table: string) => any }, companyId: string, rows: ReceiptRow[]) {
    const tenantReceiptRows = rows.filter((row) => row.payment_type === "tenant_collection" && row.payment_id);
    const empty = new Map<string, Pick<PaymentReceiptSnapshot, "coveragePeriod" | "coveragePeriods">>();
    if (!tenantReceiptRows.length) return empty;

    const paymentIds = tenantReceiptRows.map((row) => row.payment_id);
    const { data: paymentRows, error: paymentError } = await db
        .from("collections")
        .select("id,tenant_id")
        .eq("company_id", companyId)
        .in("id", paymentIds);
    if (paymentError) return empty;

    const payments = (paymentRows ?? []) as LooseRow[];
    const tenantIds = Array.from(new Set(payments.map((payment) => text(payment.tenant_id)).filter(Boolean) as string[]));
    if (!tenantIds.length) return empty;

    const [tenantsResult, leasesResult, allocationsResult] = await Promise.all([
        db.from("tenants").select("id,billing_day").eq("company_id", companyId).in("id", tenantIds),
        db.from("leases").select("id,tenant_id,billing_day,status,created_at").eq("company_id", companyId).in("tenant_id", tenantIds).order("created_at", { ascending: false }),
        db.from("tenant_rent_allocations").select("payment_id,allocation_month,allocation_type,amount_allocated").eq("company_id", companyId).in("payment_id", paymentIds),
    ]);
    if (tenantsResult.error || leasesResult.error || allocationsResult.error) return empty;

    const tenantById = new Map(((tenantsResult.data ?? []) as LooseRow[]).map((tenant) => [String(tenant.id), tenant]));
    const leaseByTenant = new Map<string, LooseRow>();
    for (const lease of ((leasesResult.data ?? []) as LooseRow[])) {
        if (String(lease.status ?? "").toLowerCase() !== "active") continue;
        const tenantId = String(lease.tenant_id ?? "");
        if (tenantId && !leaseByTenant.has(tenantId)) leaseByTenant.set(tenantId, lease);
    }
    const paymentTenant = new Map(payments.map((payment) => [String(payment.id), String(payment.tenant_id ?? "")]));
    const allocationsByPayment = new Map<string, LooseRow[]>();
    for (const allocation of ((allocationsResult.data ?? []) as LooseRow[])) {
        const paymentId = String(allocation.payment_id ?? "");
        if (!paymentId) continue;
        allocationsByPayment.set(paymentId, [...(allocationsByPayment.get(paymentId) ?? []), allocation]);
    }

    const projectionByPayment = new Map<string, Pick<PaymentReceiptSnapshot, "coveragePeriod" | "coveragePeriods">>();
    for (const [paymentId, allocations] of allocationsByPayment.entries()) {
        const tenantId = paymentTenant.get(paymentId);
        const tenant = tenantId ? tenantById.get(tenantId) : null;
        const lease = tenantId ? leaseByTenant.get(tenantId) : null;
        const billingDay = clampBillingDay(Number(lease?.billing_day ?? tenant?.billing_day ?? 1));
        const coveragePeriods = allocations
            .filter((allocation) => Number(allocation.amount_allocated ?? 0) > 0)
            .sort((left, right) => String(left.allocation_month ?? "").localeCompare(String(right.allocation_month ?? "")))
            .map((allocation) => ({
                amount: Number(allocation.amount_allocated ?? 0),
                label: coverageForReceiptAllocation(String(allocation.allocation_month ?? ""), billingDay) ?? "Rent coverage",
                type: String(allocation.allocation_type ?? "current_month").replaceAll("_", " "),
            }));
        const firstCoverage = coveragePeriods[0]?.label ?? null;
        const lastCoverage = coveragePeriods.at(-1)?.label ?? null;
        projectionByPayment.set(paymentId, {
            coveragePeriod: firstCoverage && lastCoverage ? firstCoverage === lastCoverage ? firstCoverage : `${firstCoverage}; ${lastCoverage}` : null,
            coveragePeriods,
        });
    }
    return projectionByPayment;
}

async function fetchFallbackReceiptRooms(db: { from: (table: string) => any }, companyId: string, rows: ReceiptRow[]) {
    const candidates = rows.filter((row) => row.payment_type === "tenant_collection" && !text(row.receipt_snapshot?.roomNumber));
    const fallbackByReceipt = new Map<string, { officeId: string | null; roomId: string | null; roomNumber: string | null }>();
    if (!candidates.length) return fallbackByReceipt;

    const paymentIds = candidates.map((row) => row.payment_id);
    const { data: paymentRows, error: paymentError } = await db
        .from("collections")
        .select("id,company_id,office_id,property_id,tenant_id,room_id,lease_id,payment_date,paid_at,created_at")
        .eq("company_id", companyId)
        .in("id", paymentIds);
    if (paymentError) return fallbackByReceipt;

    const payments = (paymentRows ?? []) as LooseRow[];
    const tenantIds = Array.from(new Set(payments.map((payment) => text(payment.tenant_id)).filter(Boolean) as string[]));

    const tenantById = new Map<string, LooseRow>();
    if (tenantIds.length) {
        const { data: tenantRows, error: tenantError } = await db
            .from("tenants")
            .select("id,room_id,office_id")
            .eq("company_id", companyId)
            .in("id", tenantIds);
        if (!tenantError) {
            for (const tenant of ((tenantRows ?? []) as LooseRow[])) tenantById.set(String(tenant.id), tenant);
        }
    }

    const leasesByTenant = new Map<string, LooseRow[]>();
    if (tenantIds.length) {
        const { data: leaseRows, error: leaseError } = await db
            .from("leases")
            .select("id,tenant_id,room_id,office_id,property_id,start_date,end_date,status,created_at")
            .eq("company_id", companyId)
            .in("tenant_id", tenantIds)
            .order("start_date", { ascending: false });
        if (!leaseError || missingSchema(leaseError)) {
            for (const lease of ((leaseRows ?? []) as LooseRow[]).filter((row) => row.room_id)) {
                const tenantId = String(lease.tenant_id);
                leasesByTenant.set(tenantId, [...(leasesByTenant.get(tenantId) ?? []), lease]);
            }
        }
    }

    const exitsByTenant = new Map<string, LooseRow[]>();
    if (tenantIds.length) {
        const { data: exitRows, error: exitError } = await db
            .from("tenant_exit_records")
            .select("id,tenant_id,room_id,lease_id,created_at")
            .eq("company_id", companyId)
            .in("tenant_id", tenantIds)
            .order("created_at", { ascending: false });
        if (!exitError || missingSchema(exitError)) {
            for (const exit of ((exitRows ?? []) as LooseRow[]).filter((row) => row.room_id)) {
                const tenantId = String(exit.tenant_id);
                exitsByTenant.set(tenantId, [...(exitsByTenant.get(tenantId) ?? []), exit]);
            }
        }
    }

    const debtsByTenant = new Map<string, LooseRow[]>();
    if (tenantIds.length) {
        const { data: debtRows, error: debtError } = await db
            .from("vacated_tenant_debts")
            .select("id,tenant_id,room_id,lease_id,created_at")
            .eq("company_id", companyId)
            .in("tenant_id", tenantIds)
            .order("created_at", { ascending: false });
        if (!debtError || missingSchema(debtError)) {
            for (const debt of ((debtRows ?? []) as LooseRow[]).filter((row) => row.room_id)) {
                const tenantId = String(debt.tenant_id);
                debtsByTenant.set(tenantId, [...(debtsByTenant.get(tenantId) ?? []), debt]);
            }
        }
    }

    const resolvedRoomIds = new Set<string>();
    const fallbackRoomIdByPayment = new Map<string, string>();
    for (const payment of payments) {
        const tenantId = text(payment.tenant_id);
        const tenant = tenantId ? tenantById.get(tenantId) : null;
        const paymentDate = paymentDateKey(payment);
        const leases = tenantId ? leasesByTenant.get(tenantId) ?? [] : [];
        const matchingLease = leases.find((lease) => leaseCoversPaymentDate(lease, paymentDate))
            ?? leases.find((lease) => String(lease.status ?? "").toLowerCase() === "active")
            ?? leases[0]
            ?? null;
        const exits = tenantId ? exitsByTenant.get(tenantId) ?? [] : [];
        const matchingExit = exits.find((exit) => {
            const created = text(exit.created_at)?.slice(0, 10);
            return !paymentDate || !created || paymentDate <= created;
        }) ?? exits[0] ?? null;
        const debts = tenantId ? debtsByTenant.get(tenantId) ?? [] : [];
        const matchingDebt = debts.find((debt) => {
            const created = text(debt.created_at)?.slice(0, 10);
            return !paymentDate || !created || paymentDate <= created;
        }) ?? debts[0] ?? null;
        const roomId = text(payment.room_id)
            ?? text(matchingLease?.room_id)
            ?? text(tenant?.room_id)
            ?? text(matchingExit?.room_id)
            ?? text(matchingDebt?.room_id);
        if (roomId) {
            fallbackRoomIdByPayment.set(String(payment.id), roomId);
            resolvedRoomIds.add(roomId);
        }
    }

    const roomById = new Map<string, LooseRow>();
    if (resolvedRoomIds.size) {
        const { data: roomRows, error: roomError } = await db
            .from("rooms")
            .select("id,office_id,room_number")
            .eq("company_id", companyId)
            .in("id", Array.from(resolvedRoomIds));
        if (!roomError) {
            for (const room of ((roomRows ?? []) as LooseRow[])) roomById.set(String(room.id), room);
        }
    }

    for (const row of candidates) {
        const roomId = fallbackRoomIdByPayment.get(row.payment_id) ?? null;
        const room = roomId ? roomById.get(roomId) : null;
        const roomNumber = text(room?.room_number);
        if (roomNumber) {
            fallbackByReceipt.set(row.id, {
                officeId: text(room?.office_id),
                roomId,
                roomNumber,
            });
        }
    }

    return fallbackByReceipt;
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
    const [fallbackRooms, coverageProjection] = await Promise.all([
        fetchFallbackReceiptRooms(db, context.activeCompany.id, rows),
        fetchReceiptCoverageProjection(db, context.activeCompany.id, rows),
    ]);

    return {
        error: null,
        receipts: rows.map((row) => {
            const amendments = amendmentsByReceipt.get(row.id) ?? row.receipt_snapshot?.amendmentHistory ?? [];
            const latestAmendment = amendments.at(-1) ?? null;
            const fallbackRoom = fallbackRooms.get(row.id) ?? null;
            const snapshot = fallbackRoom
                ? { ...row.receipt_snapshot, roomId: row.receipt_snapshot?.roomId ?? fallbackRoom.roomId, roomNumber: row.receipt_snapshot?.roomNumber ?? fallbackRoom.roomNumber }
                : row.receipt_snapshot;
            const projectedCoverage = coverageProjection.get(row.payment_id);
            const displaySnapshot = projectedCoverage
                ? { ...snapshot, coveragePeriod: projectedCoverage.coveragePeriod, coveragePeriods: projectedCoverage.coveragePeriods }
                : snapshot;
            return ({
            amountPaid: Number(displaySnapshot?.amountPaid ?? 0),
            amendmentSummary: displaySnapshot?.amendmentSummary ?? (
                latestAmendment
                    ? `${latestAmendment.fieldLabel} ${latestAmendment.status === "rejected" ? "change rejected" : "changed"}`
                    : null
            ),
            amendments,
            approvedByName: displaySnapshot?.changeApprovedByName ?? latestAmendment?.approvedByName ?? null,
            changedByName: displaySnapshot?.changedByName ?? latestAmendment?.changedByName ?? null,
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
            officeName: displaySnapshot?.officeName ?? null,
            paymentId: row.payment_id,
            paymentType: row.payment_type,
            preparedByName: displaySnapshot?.preparedByName ?? displaySnapshot?.recordedByName ?? null,
            receiptNumber: row.receipt_number,
            recordedByName: displaySnapshot?.recordedByName ?? null,
            remainingOutstandingBalance: Number(displaySnapshot?.remainingOutstandingBalance ?? 0),
            roomNumber: displaySnapshot?.roomNumber ?? null,
            snapshot: displaySnapshot,
            status: row.status,
            tenantName: displaySnapshot?.tenantName ?? null,
            tenantPhone: displaySnapshot?.tenantPhone ?? null,
            verificationCode: row.verification_code,
            });
        }),
    };
});
