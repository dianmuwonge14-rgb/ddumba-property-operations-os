import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Db = {
    from: (table: string) => any;
};

export type PaymentReceiptSummary = {
    companyId: string;
    id: string;
    receiptNumber: string;
    officeId: string | null;
    paymentId: string;
    paymentType: "landlord_payment" | "tenant_collection";
    status: string;
    verificationCode: string;
    issuedAt: string | null;
    tenantEmail: string | null;
    tenantPhone: string | null;
    snapshot: PaymentReceiptSnapshot;
};

export type PaymentReceiptAmendmentSnapshot = {
    amendmentType: string;
    approvalDate: string | null;
    approvedByName: string | null;
    auditReference: string | null;
    changeDate: string | null;
    changedByName: string | null;
    fieldLabel: string;
    newValue: string | null;
    previousValue: string | null;
    reason: string | null;
    requestedAt: string | null;
    requestedByName: string | null;
    status: string;
};

export type PaymentReceiptSnapshot = {
    advanceBalance: number;
    advanceAmount: number;
    amountApplied: number;
    amountAppliedToCurrentRent: number;
    amountAppliedToOutstanding: number;
    amountPaid: number;
    companyContact: string | null;
    companyName: string;
    coveragePeriod: string | null;
    coveragePeriods: Array<{
        amount: number;
        label: string;
        type: string;
    }>;
    landlordName: string | null;
    monthlyRent: number;
    notes: string | null;
    officeName: string | null;
    propertyName?: string | null;
    approvedAt: string | null;
    approvedByName: string | null;
    collectorName: string | null;
    paymentDateTime: string | null;
    paymentMethod: string | null;
    previousOutstandingBalance: number;
    receiptNumber: string;
    amendmentHistory?: PaymentReceiptAmendmentSnapshot[];
    amendmentSummary?: string | null;
    approvalDate?: string | null;
    auditReference?: string | null;
    cancellationReason?: string | null;
    changeApprovedByName?: string | null;
    changeDate?: string | null;
    changeReason?: string | null;
    changeRequestedByName?: string | null;
    changeType?: string | null;
    changedByName?: string | null;
    preparedByName?: string | null;
    receiptStatus?: string;
    statusLabel?: string;
    recordedByName: string | null;
    referenceNumber: string | null;
    remainingOutstandingBalance: number;
    roomNumber: string | null;
    securityDepositAmount?: number;
    securityDepositReceiptNumber?: string | null;
    status: string;
    tenantEmail: string | null;
    tenantName: string | null;
    tenantPhone: string | null;
    verificationCode: string;
};

type LooseRow = Record<string, unknown>;

function amount(value: unknown) {
    const number = Number(value ?? 0);
    return Number.isFinite(number) ? number : 0;
}

function text(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isMissingSchemaError(error: { message?: string; code?: string } | null | undefined) {
    const message = String(error?.message ?? "");
    return error?.code === "42P01" || error?.code === "PGRST205" || /does not exist|schema cache|Could not find/i.test(message);
}

function activePaymentStatus(status: unknown) {
    const value = String(status ?? "").toLowerCase();
    return !["pending", "rejected", "removed_by_admin_approval", "reversed", "deleted", "void", "voided", "cancelled"].includes(value);
}

function receiptStatusLabel(status: string) {
    const value = status.replaceAll("_", " ").trim();
    if (!value) return "Issued";
    return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

function correctionReceiptStatus(request: LooseRow, decision: "approved" | "rejected") {
    if (decision === "rejected") return "rejected_change";
    const type = String(request.correction_type ?? "");
    if (type === "remove_payment") return "cancelled";
    return "corrected";
}

function correctionFieldLabel(type: unknown) {
    if (type === "date_change") return "Payment date";
    if (type === "amount_change") return "Amount paid";
    if (type === "room_change") return "Room";
    if (type === "remove_payment") return "Payment status";
    return "Payment";
}

function correctionValueLabel(value: unknown, type: unknown) {
    const row = (value ?? {}) as LooseRow;
    if (type === "date_change") return text(row.payment_date) ?? null;
    if (type === "amount_change") return `UGX ${Math.round(amount(row.amount)).toLocaleString()}`;
    if (type === "room_change") {
        const room = text(row.room_number) ?? text(row.room_id);
        const tenant = text(row.tenant_name);
        return [room, tenant].filter(Boolean).join(" · ") || null;
    }
    if (type === "remove_payment") return text(row.status) ?? (row.remove_payment ? "removed by Admin approval" : null);
    return JSON.stringify(row);
}

function receiptNumberFor(payment: LooseRow) {
    const date = String(payment.payment_date ?? payment.paid_at ?? new Date().toISOString()).slice(0, 10).replaceAll("-", "");
    return `DDM-${date}-${String(payment.id).slice(0, 8).toUpperCase()}`;
}

function landlordReceiptNumberFor(payment: LooseRow) {
    const date = String(payment.paid_at ?? new Date().toISOString()).slice(0, 10).replaceAll("-", "");
    return `LDR-${date}-${String(payment.id).slice(0, 8).toUpperCase()}`;
}

function verificationCodeFor(payment: LooseRow) {
    return `VR-${String(payment.company_id ?? "").slice(0, 4).toUpperCase()}-${String(payment.id).slice(-6).toUpperCase()}`;
}

function monthLabel(value: string | null) {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return new Intl.DateTimeFormat("en-UG", { month: "short", timeZone: "Africa/Kampala", year: "numeric" }).format(parsed);
}

function dateLabel(value: string | null) {
    if (!value) return null;
    const parsed = new Date(`${value.slice(0, 10)}T00:00:00+03:00`);
    if (Number.isNaN(parsed.getTime())) return value;
    return new Intl.DateTimeFormat("en-UG", { day: "2-digit", month: "short", timeZone: "Africa/Kampala", year: "numeric" }).format(parsed);
}

function allocationLabel(row: LooseRow) {
    const start = text(row.coverage_start ?? row.period_start ?? row.rent_period_start);
    const end = text(row.coverage_end ?? row.period_end ?? row.rent_period_end);
    if (start && end) return `${dateLabel(start)} - ${dateLabel(end)}`;
    return monthLabel(text(row.allocation_month ?? row.rent_month ?? row.payment_month)) ?? "Rent coverage";
}

function allocationType(row: LooseRow) {
    return String(row.allocation_type ?? "current_month").replaceAll("_", " ");
}

const KAPEEKA_OFFICE_ID = "2987830f-906b-4f31-921f-734e6171dd10";
const ENTEBBE_OPERATIONS_OFFICE_ID = "365ca586-4501-45b3-8d21-f7244ef36603";
const KAPEEKA_RECEIPT_BRAND = "HERITAGE ESTATES AND PROPERTY SOLUTIONS";
const ENTEBBE_RECEIPT_BRAND = "DDUMBA PROPERTY MANAGEMENT";

function receiptBrandForOffice(office: LooseRow | null | undefined, fallback: string | null) {
    const officeId = text(office?.id);
    const officeName = `${text(office?.office_name) ?? text(office?.name) ?? ""}`.toLowerCase().replace(/\s+/g, " ").trim();
    if (officeId === KAPEEKA_OFFICE_ID || officeName === "kapeeka office") return KAPEEKA_RECEIPT_BRAND;
    if (officeId === ENTEBBE_OPERATIONS_OFFICE_ID || officeName === "entebbe operations office") return ENTEBBE_RECEIPT_BRAND;
    return fallback ?? "DDUMBA OS";
}

function receiptSummary(row: LooseRow): PaymentReceiptSummary {
    const snapshot = row.receipt_snapshot as PaymentReceiptSnapshot;
    return {
        companyId: String(row.company_id),
        id: String(row.id),
        issuedAt: text(row.issued_at),
        officeId: text(row.office_id),
        paymentId: String(row.payment_id),
        paymentType: String(row.payment_type ?? "tenant_collection") as "landlord_payment" | "tenant_collection",
        receiptNumber: String(row.receipt_number),
        snapshot,
        status: String(row.status ?? "issued"),
        tenantEmail: snapshot.tenantEmail ?? null,
        tenantPhone: snapshot.tenantPhone ?? null,
        verificationCode: String(row.verification_code ?? snapshot.verificationCode),
    };
}

async function getOne(db: Db, table: string, id: unknown, companyId: string, select = "*") {
    if (!id) return null;
    if (table === "companies") {
        const { data, error } = await db.from(table).select(select).eq("id", id).maybeSingle();
        if (error && !isMissingSchemaError(error)) throw new Error(error.message);
        return (data ?? null) as LooseRow | null;
    }
    const { data, error } = await db.from(table).select(select).eq("company_id", companyId).eq("id", id).maybeSingle();
    if (error && !isMissingSchemaError(error)) throw new Error(error.message);
    return (data ?? null) as LooseRow | null;
}

async function getUserName(db: Db, id: unknown) {
    if (!id) return null;
    const { data, error } = await db.from("users").select("id,full_name,email,phone").eq("id", id).maybeSingle();
    if (error && !isMissingSchemaError(error)) throw new Error(error.message);
    return text(data?.full_name) ?? text(data?.email) ?? text(data?.phone);
}

async function buildTenantReceiptSnapshot(db: Db, payment: LooseRow, receiptNumber: string, verificationCode: string): Promise<PaymentReceiptSnapshot> {
    const companyId = String(payment.company_id);
    const [company, tenant, room, recordedBy] = await Promise.all([
        getOne(db, "companies", payment.company_id, companyId, "*"),
        getOne(db, "tenants", payment.tenant_id, companyId, "*"),
        getOne(db, "rooms", payment.room_id, companyId, "*"),
        payment.recorded_by ? db.from("users").select("id,full_name,email,phone,account_type").eq("id", payment.recorded_by).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);
    if (recordedBy.error && !isMissingSchemaError(recordedBy.error)) throw new Error(recordedBy.error.message);

    const receiptOfficeId = room?.office_id ?? tenant?.office_id ?? payment.office_id;
    const office = await getOne(db, "offices", receiptOfficeId, companyId, "*");
    const landlordId = room?.landlord_id ?? null;
    const propertyId = room?.property_id ?? tenant?.property_id ?? null;
    const [landlord, property] = await Promise.all([
        landlordId ? getOne(db, "landlords", landlordId, companyId, "*") : Promise.resolve(null),
        propertyId ? getOne(db, "properties", propertyId, companyId, "*") : Promise.resolve(null),
    ]);
    const allocationRows = await db
        .from("tenant_rent_allocations")
        .select("*")
        .eq("company_id", companyId)
        .eq("payment_id", payment.id);
    if (allocationRows.error && !isMissingSchemaError(allocationRows.error)) throw new Error(allocationRows.error.message);
    const allocations = (allocationRows.data ?? []) as LooseRow[];
    const coveragePeriods = allocations.map((row) => ({
        amount: amount(row.amount_allocated),
        label: allocationLabel(row),
        type: allocationType(row),
    })).filter((row) => row.amount > 0);
    const firstCoverage = coveragePeriods[0]?.label ?? null;
    const lastCoverage = coveragePeriods.at(-1)?.label ?? null;
    const coveragePeriod = firstCoverage && lastCoverage
        ? firstCoverage === lastCoverage ? firstCoverage : `${firstCoverage}; ${lastCoverage}`
        : null;
    const advanceBalance = allocations
        .filter((row) => String(row.allocation_type ?? "") === "advance_month")
        .reduce((total, row) => total + amount(row.amount_allocated), 0);
    const amountAppliedToOutstanding = amount(payment.used_to_clear_outstanding) || allocations
        .filter((row) => /arrears|outstanding|debt/i.test(String(row.allocation_type ?? "")))
        .reduce((total, row) => total + amount(row.amount_allocated), 0);
    const amountAppliedToCurrentRent = allocations
        .filter((row) => /current|rent/i.test(String(row.allocation_type ?? "")))
        .reduce((total, row) => total + amount(row.amount_allocated), 0) || Math.max(0, amount(payment.amount_paid ?? payment.amount) - amountAppliedToOutstanding - advanceBalance);
    const collectorName = /collector/i.test(String(recordedBy.data?.account_type ?? "")) ? text(recordedBy.data?.full_name) : null;

    return {
        advanceBalance,
        advanceAmount: advanceBalance,
        amountApplied: amount(payment.used_to_clear_outstanding) || amount(payment.amount_paid ?? payment.amount),
        amountAppliedToCurrentRent,
        amountAppliedToOutstanding,
        amountPaid: amount(payment.amount_paid ?? payment.amount),
        companyContact: text(company?.phone) ?? text(company?.email) ?? null,
        companyName: receiptBrandForOffice(office, text(company?.name)),
        coveragePeriod,
        coveragePeriods,
        landlordName: text(landlord?.full_name),
        monthlyRent: amount(room?.monthly_rent ?? tenant?.monthly_rent),
        notes: text(payment.notes),
        officeName: text(office?.office_name) ?? text(office?.name),
        propertyName: text(property?.property_name) ?? text(property?.name) ?? text(property?.location),
        approvedAt: text(payment.approved_at) ?? text(payment.paid_at) ?? text(payment.payment_date),
        approvedByName: text(payment.approved_by_name) ?? null,
        collectorName,
        paymentDateTime: text(payment.paid_at) ?? text(payment.payment_date),
        paymentMethod: text(payment.payment_method),
        previousOutstandingBalance: amount(payment.balance_before_payment ?? payment.expected_amount),
        receiptNumber,
        recordedByName: text(payment.entered_by_name) ?? text(recordedBy.data?.full_name),
        referenceNumber: text(payment.reference_number ?? payment.cheque_reference ?? payment.collection_number),
        remainingOutstandingBalance: amount(payment.balance_after_payment ?? payment.balance),
        roomNumber: text(room?.room_number),
        status: text(payment.status) ?? "paid",
        tenantEmail: text(tenant?.email),
        tenantName: text(tenant?.full_name),
        tenantPhone: text(tenant?.phone),
        verificationCode,
    };
}

export async function createTenantPaymentReceipt(paymentId: string, options: { correctedFromReceiptId?: string | null; forceRefresh?: boolean; issuedBy?: string | null } = {}) {
    const db = createSupabaseAdminClient() as unknown as Db;
    const { data: payment, error } = await db.from("collections").select("*").eq("id", paymentId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!payment) throw new Error("Payment record not found for receipt.");
    if (!activePaymentStatus(payment.status)) throw new Error("Receipts are only generated for successful active payments.");

    const companyId = String(payment.company_id);
    const receiptNumber = receiptNumberFor(payment);
    const verificationCode = verificationCodeFor(payment);
    const snapshot = await buildTenantReceiptSnapshot(db, payment, receiptNumber, verificationCode);

    const { data: existing, error: existingError } = await db
        .from("payment_receipts")
        .select("*")
        .eq("company_id", companyId)
        .eq("payment_type", "tenant_collection")
        .eq("payment_id", paymentId)
        .maybeSingle();
    if (existingError) {
        if (isMissingSchemaError(existingError)) throw new Error("Payment receipt tables are missing. Apply migration 0204_payment_receipts.sql.");
        throw new Error(existingError.message);
    }
    if (existing?.id && !options.correctedFromReceiptId && !options.forceRefresh) return receiptSummary(existing);

    if (existing?.id && options.correctedFromReceiptId) {
        const replaced = await db.from("payment_receipts").update({ status: "replaced", updated_at: new Date().toISOString() }).eq("id", existing.id);
        if (replaced.error && !isMissingSchemaError(replaced.error)) throw new Error(replaced.error.message);
    }

    const { data: receipt, error: insertError } = await db
        .from("payment_receipts")
        .upsert({
            company_id: companyId,
            corrected_from_receipt_id: options.correctedFromReceiptId ?? null,
            file_url: null,
            issued_by: options.issuedBy ?? payment.recorded_by ?? null,
            office_id: payment.office_id ?? null,
            payment_id: paymentId,
            payment_type: "tenant_collection",
            receipt_number: receiptNumber,
            receipt_snapshot: snapshot,
            status: options.correctedFromReceiptId || options.forceRefresh ? "corrected" : "issued",
            updated_at: new Date().toISOString(),
            verification_code: verificationCode,
        }, { onConflict: "company_id,payment_type,payment_id" })
        .select("*")
        .single();
    if (insertError) {
        if (isMissingSchemaError(insertError)) throw new Error("Payment receipt tables are missing. Apply migration 0204_payment_receipts.sql.");
        throw new Error(insertError.message);
    }
    return receiptSummary(receipt);
}

export async function syncTenantPaymentReceiptForCorrection(input: {
    decision: "approved" | "rejected";
    paymentId: string;
    requestId: string;
}) {
    const db = createSupabaseAdminClient() as unknown as Db;
    const { data: request, error: requestError } = await db
        .from("payment_correction_requests")
        .select("*")
        .eq("id", input.requestId)
        .maybeSingle();
    if (requestError) throw new Error(requestError.message);
    if (!request) throw new Error("Payment correction request not found for receipt sync.");

    const { data: payment, error: paymentError } = await db.from("collections").select("*").eq("id", input.paymentId).maybeSingle();
    if (paymentError) throw new Error(paymentError.message);
    if (!payment) throw new Error("Payment record not found for receipt sync.");

    const companyId = String(payment.company_id ?? request.company_id);
    const { data: existing, error: existingError } = await db
        .from("payment_receipts")
        .select("*")
        .eq("company_id", companyId)
        .eq("payment_type", "tenant_collection")
        .eq("payment_id", input.paymentId)
        .maybeSingle();
    if (existingError) {
        if (isMissingSchemaError(existingError)) return null;
        throw new Error(existingError.message);
    }

    const receiptNumber = String(existing?.receipt_number ?? receiptNumberFor(payment));
    const verificationCode = String(existing?.verification_code ?? verificationCodeFor(payment));
    const currentSnapshot = await buildTenantReceiptSnapshot(db, payment, receiptNumber, verificationCode);
    const previousSnapshot = (existing?.receipt_snapshot as PaymentReceiptSnapshot | null | undefined) ?? currentSnapshot;
    const receiptStatus = correctionReceiptStatus(request, input.decision);
    const requestedByName = await getUserName(db, request.requested_by);
    const changedByName = requestedByName;
    const approvedByName = await getUserName(db, request.reviewed_by);
    const fieldLabel = correctionFieldLabel(request.correction_type);
    const amendment: PaymentReceiptAmendmentSnapshot = {
        amendmentType: String(request.correction_type ?? "payment_change"),
        approvalDate: text(request.reviewed_at),
        approvedByName,
        auditReference: `payment_correction:${request.id}:${input.decision}`,
        changeDate: text(request.reviewed_at) ?? text(request.updated_at) ?? text(request.created_at),
        changedByName,
        fieldLabel,
        newValue: correctionValueLabel(request.requested_value, request.correction_type),
        previousValue: correctionValueLabel(request.original_value, request.correction_type),
        reason: text(request.admin_comment) ?? text(request.reason),
        requestedAt: text(request.created_at),
        requestedByName,
        status: input.decision,
    };
    const previousHistory = Array.isArray(previousSnapshot.amendmentHistory) ? previousSnapshot.amendmentHistory : [];
    const amendmentSummary = input.decision === "rejected"
        ? `${fieldLabel} change rejected`
        : receiptStatus === "cancelled"
            ? `Payment cancelled: ${amendment.reason ?? "Admin approved cancellation"}`
            : `${fieldLabel} changed from ${amendment.previousValue ?? "previous value"} to ${amendment.newValue ?? "new value"}`;
    const updatedSnapshot: PaymentReceiptSnapshot = {
        ...currentSnapshot,
        amendmentHistory: [...previousHistory, amendment],
        amendmentSummary,
        approvalDate: amendment.approvalDate,
        auditReference: amendment.auditReference,
        cancellationReason: receiptStatus === "cancelled" ? amendment.reason : previousSnapshot.cancellationReason ?? null,
        changeApprovedByName: approvedByName,
        changeDate: amendment.changeDate,
        changeReason: amendment.reason,
        changeRequestedByName: requestedByName,
        changeType: fieldLabel,
        changedByName,
        preparedByName: previousSnapshot.preparedByName ?? previousSnapshot.recordedByName ?? currentSnapshot.recordedByName,
        receiptStatus,
        status: receiptStatus,
        statusLabel: receiptStatusLabel(receiptStatus),
    };

    let receiptRow = existing;
    if (existing?.id) {
        const { data: updatedReceipt, error: updateError } = await db
            .from("payment_receipts")
            .update({
                receipt_snapshot: updatedSnapshot,
                status: receiptStatus,
                updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id)
            .select("*")
            .single();
        if (updateError) throw new Error(updateError.message);
        receiptRow = updatedReceipt;
    } else if (receiptStatus !== "cancelled") {
        const { data: insertedReceipt, error: insertError } = await db
            .from("payment_receipts")
            .upsert({
                company_id: companyId,
                file_url: null,
                issued_by: payment.recorded_by ?? request.requested_by ?? null,
                office_id: payment.office_id ?? request.office_id ?? null,
                payment_id: input.paymentId,
                payment_type: "tenant_collection",
                receipt_number: receiptNumber,
                receipt_snapshot: updatedSnapshot,
                status: receiptStatus,
                updated_at: new Date().toISOString(),
                verification_code: verificationCode,
            }, { onConflict: "company_id,payment_type,payment_id" })
            .select("*")
            .single();
        if (insertError && !isMissingSchemaError(insertError)) throw new Error(insertError.message);
        receiptRow = insertedReceipt;
    }

    if (receiptRow?.id) {
        const auditReference = amendment.auditReference;
        const { data: existingAmendment, error: amendmentLookupError } = await db
            .from("payment_receipt_amendments")
            .select("id")
            .eq("audit_reference", auditReference)
            .maybeSingle();
        if (amendmentLookupError && !isMissingSchemaError(amendmentLookupError)) throw new Error(amendmentLookupError.message);
        if (!existingAmendment?.id && !isMissingSchemaError(amendmentLookupError)) {
            const { error: amendmentError } = await db.from("payment_receipt_amendments").insert({
                amendment_type: amendment.amendmentType,
                approved_at: amendment.approvalDate,
                approved_by: request.reviewed_by ?? null,
                audit_reference: auditReference,
                changed_at: amendment.changeDate,
                changed_by: request.requested_by ?? null,
                company_id: companyId,
                new_snapshot: updatedSnapshot,
                office_id: payment.office_id ?? request.office_id ?? null,
                payment_id: input.paymentId,
                previous_snapshot: previousSnapshot,
                reason: amendment.reason,
                receipt_id: receiptRow.id,
                requested_at: amendment.requestedAt,
                requested_by: request.requested_by ?? null,
                status: input.decision,
            });
            if (amendmentError && !isMissingSchemaError(amendmentError)) throw new Error(amendmentError.message);
        }
        return receiptSummary(receiptRow);
    }
    return null;
}

export async function markTenantPaymentReceiptPendingCorrection(input: {
    paymentId: string;
    requestId: string;
}) {
    const db = createSupabaseAdminClient() as unknown as Db;
    const { data: request, error: requestError } = await db
        .from("payment_correction_requests")
        .select("*")
        .eq("id", input.requestId)
        .maybeSingle();
    if (requestError) throw new Error(requestError.message);
    if (!request) throw new Error("Payment correction request not found for pending receipt status.");

    const { data: payment, error: paymentError } = await db.from("collections").select("*").eq("id", input.paymentId).maybeSingle();
    if (paymentError) throw new Error(paymentError.message);
    if (!payment) throw new Error("Payment record not found for pending receipt status.");

    const companyId = String(payment.company_id ?? request.company_id);
    const { data: existing, error: existingError } = await db
        .from("payment_receipts")
        .select("*")
        .eq("company_id", companyId)
        .eq("payment_type", "tenant_collection")
        .eq("payment_id", input.paymentId)
        .maybeSingle();
    if (existingError || !existing?.id) {
        if (existingError && !isMissingSchemaError(existingError)) throw new Error(existingError.message);
        return null;
    }

    const previousSnapshot = existing.receipt_snapshot as PaymentReceiptSnapshot;
    const requestedByName = await getUserName(db, request.requested_by);
    const fieldLabel = correctionFieldLabel(request.correction_type);
    const amendment: PaymentReceiptAmendmentSnapshot = {
        amendmentType: String(request.correction_type ?? "payment_change"),
        approvalDate: null,
        approvedByName: null,
        auditReference: `payment_correction:${request.id}:pending`,
        changeDate: text(request.created_at),
        changedByName: requestedByName,
        fieldLabel,
        newValue: correctionValueLabel(request.requested_value, request.correction_type),
        previousValue: correctionValueLabel(request.original_value, request.correction_type),
        reason: text(request.reason),
        requestedAt: text(request.created_at),
        requestedByName,
        status: "pending",
    };
    const previousHistory = Array.isArray(previousSnapshot.amendmentHistory) ? previousSnapshot.amendmentHistory : [];
    const updatedSnapshot: PaymentReceiptSnapshot = {
        ...previousSnapshot,
        amendmentHistory: [...previousHistory, amendment],
        amendmentSummary: `${fieldLabel} change pending Admin approval`,
        auditReference: amendment.auditReference,
        changeDate: amendment.changeDate,
        changeReason: amendment.reason,
        changeRequestedByName: requestedByName,
        changeType: fieldLabel,
        changedByName: requestedByName,
        preparedByName: previousSnapshot.preparedByName ?? previousSnapshot.recordedByName,
        receiptStatus: "pending_correction",
        status: "pending_correction",
        statusLabel: receiptStatusLabel("pending_correction"),
    };
    const { data: updatedReceipt, error: updateError } = await db
        .from("payment_receipts")
        .update({ receipt_snapshot: updatedSnapshot, status: "pending_correction", updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .select("*")
        .single();
    if (updateError) throw new Error(updateError.message);

    const { data: existingAmendment, error: amendmentLookupError } = await db
        .from("payment_receipt_amendments")
        .select("id")
        .eq("audit_reference", amendment.auditReference)
        .maybeSingle();
    if (amendmentLookupError && !isMissingSchemaError(amendmentLookupError)) throw new Error(amendmentLookupError.message);
    if (!existingAmendment?.id && !isMissingSchemaError(amendmentLookupError)) {
        const { error: amendmentError } = await db.from("payment_receipt_amendments").insert({
            amendment_type: amendment.amendmentType,
            audit_reference: amendment.auditReference,
            changed_at: amendment.changeDate,
            changed_by: request.requested_by ?? null,
            company_id: companyId,
            new_snapshot: updatedSnapshot,
            office_id: payment.office_id ?? request.office_id ?? null,
            payment_id: input.paymentId,
            previous_snapshot: previousSnapshot,
            reason: amendment.reason,
            receipt_id: existing.id,
            requested_at: amendment.requestedAt,
            requested_by: request.requested_by ?? null,
            status: "pending",
        });
        if (amendmentError && !isMissingSchemaError(amendmentError)) throw new Error(amendmentError.message);
    }

    return receiptSummary(updatedReceipt);
}

export async function createLandlordPaymentReceipt(paymentId: string, options: { issuedBy?: string | null } = {}) {
    const db = createSupabaseAdminClient() as unknown as Db;
    const { data: payment, error } = await db.from("landlord_payments").select("*").eq("id", paymentId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!payment) throw new Error("Landlord payment record not found for receipt.");
    if (!activePaymentStatus(payment.status)) throw new Error("Receipts are only generated for successful active landlord payments.");
    const companyId = String(payment.company_id);
    const receiptNumber = landlordReceiptNumberFor(payment);
    const verificationCode = verificationCodeFor(payment);
    const [company, office, landlord, recordedBy] = await Promise.all([
        getOne(db, "companies", payment.company_id, companyId, "*"),
        getOne(db, "offices", payment.office_id, companyId, "*"),
        getOne(db, "landlords", payment.landlord_id, companyId, "*"),
        payment.created_by ? db.from("users").select("id,full_name,email,phone,account_type").eq("id", payment.created_by).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);
    if (recordedBy.error && !isMissingSchemaError(recordedBy.error)) throw new Error(recordedBy.error.message);
    const snapshot: PaymentReceiptSnapshot = {
        advanceBalance: String(payment.status ?? "").toLowerCase() === "overpaid" ? amount(payment.amount) : 0,
        advanceAmount: String(payment.status ?? "").toLowerCase() === "overpaid" ? amount(payment.amount) : 0,
        amountApplied: amount(payment.amount),
        amountAppliedToCurrentRent: 0,
        amountAppliedToOutstanding: amount(payment.amount),
        amountPaid: amount(payment.amount),
        companyContact: text(company?.phone) ?? text(company?.email) ?? null,
        companyName: text(company?.name) ?? "DDUMBA OS",
        coveragePeriod: null,
        coveragePeriods: [],
        landlordName: text(landlord?.full_name),
        monthlyRent: 0,
        notes: text(payment.notes),
        officeName: text(office?.office_name) ?? text(office?.name),
        approvedAt: text(payment.approved_at) ?? text(payment.paid_at),
        approvedByName: text(recordedBy.data?.full_name),
        collectorName: null,
        paymentDateTime: text(payment.paid_at),
        paymentMethod: text(payment.payment_method),
        previousOutstandingBalance: 0,
        receiptNumber,
        recordedByName: text(recordedBy.data?.full_name),
        referenceNumber: text(payment.payout_reference),
        remainingOutstandingBalance: 0,
        roomNumber: null,
        status: text(payment.status) ?? "paid",
        tenantEmail: text(landlord?.email),
        tenantName: text(landlord?.full_name),
        tenantPhone: text(landlord?.phone),
        verificationCode,
    };
    const { data: receipt, error: insertError } = await db
        .from("payment_receipts")
        .upsert({
            company_id: companyId,
            file_url: null,
            issued_by: options.issuedBy ?? payment.created_by ?? null,
            office_id: payment.office_id ?? null,
            payment_id: paymentId,
            payment_type: "landlord_payment",
            receipt_number: receiptNumber,
            receipt_snapshot: snapshot,
            status: "issued",
            updated_at: new Date().toISOString(),
            verification_code: verificationCode,
        }, { onConflict: "company_id,payment_type,payment_id" })
        .select("*")
        .single();
    if (insertError) {
        if (isMissingSchemaError(insertError)) throw new Error("Payment receipt tables are missing. Apply migration 0204_payment_receipts.sql.");
        throw new Error(insertError.message);
    }
    return receiptSummary(receipt);
}

export async function getPaymentReceipt(receiptId: string) {
    const db = createSupabaseAdminClient() as unknown as Db;
    const { data, error } = await db.from("payment_receipts").select("*").eq("id", receiptId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Receipt not found.");
    return receiptSummary(data);
}

export async function logReceiptDelivery(input: {
    channel: "download_pdf" | "email" | "print" | "sms" | "whatsapp";
    error?: string | null;
    receipt: PaymentReceiptSummary;
    recipientEmail?: string | null;
    recipientPhone?: string | null;
    sentBy?: string | null;
    status: "delivered" | "failed" | "pending" | "sent" | "skipped";
}) {
    const db = createSupabaseAdminClient() as unknown as Db;
    const { error } = await db.from("payment_receipt_delivery_logs").insert({
        channel: input.channel,
        company_id: input.receipt.companyId,
        delivery_status: input.status,
        error_message: input.error ?? null,
        payment_id: input.receipt.paymentId,
        payment_type: input.receipt.paymentType,
        provider: input.channel === "email" ? String(process.env.EMAIL_PROVIDER ?? "not_configured") : input.channel,
        receipt_id: input.receipt.id,
        recipient_email: input.recipientEmail ?? null,
        recipient_phone: input.recipientPhone ?? null,
        sent_at: ["delivered", "sent"].includes(input.status) ? new Date().toISOString() : null,
        sent_by: input.sentBy ?? null,
    });
    if (error && !isMissingSchemaError(error)) throw new Error(error.message);
}

export function receiptEmailHtml(receipt: PaymentReceiptSummary) {
    const row = receipt.snapshot;
    const money = (value: number) => `UGX ${Math.round(value).toLocaleString()}`;
    return `
        <div style="font-family:Inter,Arial,sans-serif;background:#0f172a;padding:24px;color:#e5e7eb">
            <div style="max-width:680px;margin:auto;background:#fff;color:#0f172a;border-radius:18px;overflow:hidden">
                <div style="background:linear-gradient(135deg,#0f172a,#1d4ed8);color:#fff;padding:20px">
                    <p style="margin:0;font-weight:800;letter-spacing:.12em;text-transform:uppercase">${row.companyName} Receipt</p>
                    <h1 style="margin:6px 0 0;font-size:24px">${row.receiptNumber}</h1>
                </div>
                <div style="padding:22px">
                    <p><strong>Tenant:</strong> ${row.tenantName ?? "Tenant"} · <strong>Room:</strong> ${row.roomNumber ?? "N/A"}</p>
                    <p><strong>Amount Paid:</strong> ${money(row.amountPaid)}</p>
                    <p><strong>Remaining Balance:</strong> ${money(row.remainingOutstandingBalance)} · <strong>Advance:</strong> ${money(row.advanceBalance)}</p>
                    <p><strong>Office:</strong> ${row.officeName ?? "Office"} · <strong>Landlord:</strong> ${row.landlordName ?? "N/A"}</p>
                    <p><strong>Verification code:</strong> ${row.verificationCode}</p>
                    <p style="font-size:12px;color:#64748b">This e-receipt was generated from the saved ${row.companyName} payment transaction.</p>
                </div>
            </div>
        </div>
    `;
}
