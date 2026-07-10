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

export type PaymentReceiptSnapshot = {
    advanceBalance: number;
    amountApplied: number;
    amountPaid: number;
    companyContact: string | null;
    companyName: string;
    coveragePeriod: string | null;
    landlordName: string | null;
    monthlyRent: number;
    notes: string | null;
    officeName: string | null;
    paymentDateTime: string | null;
    paymentMethod: string | null;
    previousOutstandingBalance: number;
    receiptNumber: string;
    recordedByName: string | null;
    referenceNumber: string | null;
    remainingOutstandingBalance: number;
    roomNumber: string | null;
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

async function buildTenantReceiptSnapshot(db: Db, payment: LooseRow, receiptNumber: string, verificationCode: string): Promise<PaymentReceiptSnapshot> {
    const companyId = String(payment.company_id);
    const [company, office, tenant, room, recordedBy] = await Promise.all([
        getOne(db, "companies", payment.company_id, companyId, "*"),
        getOne(db, "offices", payment.office_id, companyId, "*"),
        getOne(db, "tenants", payment.tenant_id, companyId, "*"),
        getOne(db, "rooms", payment.room_id, companyId, "*"),
        payment.recorded_by ? db.from("users").select("id,full_name,email,phone,account_type").eq("id", payment.recorded_by).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);
    if (recordedBy.error && !isMissingSchemaError(recordedBy.error)) throw new Error(recordedBy.error.message);

    const landlordId = room?.landlord_id ?? null;
    const landlord = landlordId ? await getOne(db, "landlords", landlordId, companyId, "*") : null;
    const allocationRows = await db
        .from("tenant_rent_allocations")
        .select("allocation_month,allocation_type,amount_allocated")
        .eq("company_id", companyId)
        .eq("payment_id", payment.id);
    if (allocationRows.error && !isMissingSchemaError(allocationRows.error)) throw new Error(allocationRows.error.message);
    const allocations = (allocationRows.data ?? []) as LooseRow[];
    const firstMonth = allocations.map((row) => text(row.allocation_month)).filter(Boolean).sort()[0] ?? null;
    const lastMonth = allocations.map((row) => text(row.allocation_month)).filter(Boolean).sort().at(-1) ?? null;
    const coveragePeriod = firstMonth && lastMonth
        ? firstMonth === lastMonth ? monthLabel(firstMonth) : `${monthLabel(firstMonth)} - ${monthLabel(lastMonth)}`
        : null;
    const advanceBalance = allocations
        .filter((row) => String(row.allocation_type ?? "") === "advance_month")
        .reduce((total, row) => total + amount(row.amount_allocated), 0);

    return {
        advanceBalance,
        amountApplied: amount(payment.used_to_clear_outstanding) || amount(payment.amount_paid ?? payment.amount),
        amountPaid: amount(payment.amount_paid ?? payment.amount),
        companyContact: text(company?.phone) ?? text(company?.email) ?? null,
        companyName: text(company?.name) ?? "DDUMBA OS",
        coveragePeriod,
        landlordName: text(landlord?.full_name),
        monthlyRent: amount(room?.monthly_rent ?? tenant?.monthly_rent),
        notes: text(payment.notes),
        officeName: text(office?.office_name) ?? text(office?.name),
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
        amountApplied: amount(payment.amount),
        amountPaid: amount(payment.amount),
        companyContact: text(company?.phone) ?? text(company?.email) ?? null,
        companyName: text(company?.name) ?? "DDUMBA OS",
        coveragePeriod: null,
        landlordName: text(landlord?.full_name),
        monthlyRent: 0,
        notes: text(payment.notes),
        officeName: text(office?.office_name) ?? text(office?.name),
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
                    <p style="margin:0;font-weight:800;letter-spacing:.12em;text-transform:uppercase">DDUMBA OS Receipt</p>
                    <h1 style="margin:6px 0 0;font-size:24px">${row.receiptNumber}</h1>
                </div>
                <div style="padding:22px">
                    <p><strong>Tenant:</strong> ${row.tenantName ?? "Tenant"} · <strong>Room:</strong> ${row.roomNumber ?? "N/A"}</p>
                    <p><strong>Amount Paid:</strong> ${money(row.amountPaid)}</p>
                    <p><strong>Remaining Balance:</strong> ${money(row.remainingOutstandingBalance)} · <strong>Advance:</strong> ${money(row.advanceBalance)}</p>
                    <p><strong>Office:</strong> ${row.officeName ?? "Office"} · <strong>Landlord:</strong> ${row.landlordName ?? "N/A"}</p>
                    <p><strong>Verification code:</strong> ${row.verificationCode}</p>
                    <p style="font-size:12px;color:#64748b">This e-receipt was generated from the saved DDUMBA OS payment transaction.</p>
                </div>
            </div>
        </div>
    `;
}
