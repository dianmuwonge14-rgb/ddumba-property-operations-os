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
    receiptAddress?: string | null;
    receiptEmail?: string | null;
    receiptFooter?: string | null;
    receiptLogoUrl?: string | null;
    receiptPhone?: string | null;
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
    paymentTransactionDate?: string | null;
    enteredAt?: string | null;
    isBackdated?: boolean;
    backdatingReason?: string | null;
    paymentMethod: string | null;
    previousOutstandingBalance: number;
    receiptNumber: string;
    landlordId?: string | null;
    officeId?: string | null;
    paymentId?: string | null;
    roomId?: string | null;
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
    preparedByRole?: string | null;
    receiptStatus?: string;
    statusLabel?: string;
    recordedByName: string | null;
    referenceNumber: string | null;
    remainingOutstandingBalance: number;
    roomNumber: string | null;
    tenantId?: string | null;
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
    if (type === "payment_method_change") return "Payment method";
    if (type === "remove_payment") return "Payment status";
    return "Payment";
}

async function correctionValueLabel(db: Db, companyId: string, value: unknown, type: unknown) {
    const row = (value ?? {}) as LooseRow;
    if (type === "date_change") return text(row.payment_date) ?? null;
    if (type === "amount_change") return `UGX ${Math.round(amount(row.amount)).toLocaleString()}`;
    if (type === "room_change") {
        let room = text(row.room_number);
        let tenant = text(row.tenant_name);
        if (!room && row.room_id) {
            const roomRow = await getOne(db, "rooms", row.room_id, companyId, "id,room_number");
            room = text(roomRow?.room_number) ?? text(row.room_id);
        }
        if (!tenant && row.tenant_id) {
            const tenantRow = await getOne(db, "tenants", row.tenant_id, companyId, "id,full_name");
            tenant = text(tenantRow?.full_name);
        }
        return [room, tenant].filter(Boolean).join(" · ") || null;
    }
    if (type === "payment_method_change") return text(row.payment_method_label) ?? text(row.payment_method)?.replaceAll("_", " ") ?? null;
    if (type === "remove_payment") return text(row.status) ?? (row.remove_payment ? "removed by Admin approval" : null);
    return JSON.stringify(row);
}

function receiptAmendmentHistory(previousHistory: PaymentReceiptAmendmentSnapshot[], amendment: PaymentReceiptAmendmentSnapshot, requestId: unknown) {
    const approvedReference = amendment.auditReference;
    const pendingReference = `payment_correction:${String(requestId)}:pending`;
    return [
        ...previousHistory.filter((entry) => entry.auditReference !== approvedReference && entry.auditReference !== pendingReference),
        amendment,
    ];
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

function receiptBrandingForOffice(office: LooseRow | null | undefined, fallback: { contact: string | null; name: string | null }) {
    const configuredName = text(office?.receipt_business_name) ?? text(office?.receipt_name) ?? text(office?.brand_name);
    const phone = text(office?.receipt_phone) ?? text(office?.phone);
    const email = text(office?.receipt_email) ?? text(office?.email);
    const address = text(office?.receipt_address) ?? text(office?.address);
    const contact = [address, phone, email].filter(Boolean).join(" · ") || fallback.contact;

    return {
        address,
        contact,
        email,
        footer: text(office?.receipt_footer),
        logoUrl: text(office?.receipt_logo_url) ?? text(office?.logo_url),
        name: configuredName ?? fallback.name ?? "DDUMBA OS",
        phone,
    };
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

function paymentDateKey(payment: LooseRow) {
    return text(payment.payment_date)?.slice(0, 10)
        ?? text(payment.paid_at)?.slice(0, 10)
        ?? text(payment.created_at)?.slice(0, 10)
        ?? null;
}

function leaseCoversPaymentDate(lease: LooseRow, paymentDate: string | null) {
    if (!paymentDate) return true;
    const start = text(lease.start_date)?.slice(0, 10) ?? "";
    const end = text(lease.end_date)?.slice(0, 10) ?? "";
    return (!start || start <= paymentDate) && (!end || end >= paymentDate);
}

async function resolvePaymentLease(db: Db, payment: LooseRow, tenant: LooseRow | null, companyId: string) {
    const explicitLease = await getOne(db, "leases", payment.lease_id, companyId, "id,company_id,office_id,property_id,room_id,tenant_id,start_date,end_date,status,monthly_rent");
    if (explicitLease?.room_id) return explicitLease;
    const tenantId = payment.tenant_id ?? tenant?.id;
    if (!tenantId) return null;

    const { data, error } = await db
        .from("leases")
        .select("id,company_id,office_id,property_id,room_id,tenant_id,start_date,end_date,status,monthly_rent")
        .eq("company_id", companyId)
        .eq("tenant_id", tenantId)
        .order("start_date", { ascending: false })
        .limit(12);
    if (error && !isMissingSchemaError(error)) throw new Error(error.message);

    const leases = ((data ?? []) as LooseRow[]).filter((lease) => lease.room_id);
    const paymentDate = paymentDateKey(payment);
    return leases.find((lease) => leaseCoversPaymentDate(lease, paymentDate))
        ?? leases.find((lease) => String(lease.status ?? "").toLowerCase() === "active")
        ?? leases[0]
        ?? null;
}

async function resolveHistoricalPaymentRoom(db: Db, payment: LooseRow, tenant: LooseRow | null, companyId: string) {
    const tenantId = payment.tenant_id ?? tenant?.id;
    if (!tenantId) return null;

    const paymentDate = paymentDateKey(payment);
    const exitRows = await db
        .from("tenant_exit_records")
        .select("id,room_id,lease_id,created_at")
        .eq("company_id", companyId)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(8);
    if (exitRows.error && !isMissingSchemaError(exitRows.error)) throw new Error(exitRows.error.message);

    const exits = ((exitRows.data ?? []) as LooseRow[]).filter((row) => row.room_id);
    const matchingExit = exits.find((row) => {
        const created = text(row.created_at)?.slice(0, 10);
        return !paymentDate || !created || paymentDate <= created;
    }) ?? exits[0] ?? null;
    const roomFromExit = await getOne(db, "rooms", matchingExit?.room_id, companyId, "*");
    if (roomFromExit) return roomFromExit;

    const debtRows = await db
        .from("vacated_tenant_debts")
        .select("id,room_id,lease_id,created_at")
        .eq("company_id", companyId)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(8);
    if (debtRows.error && !isMissingSchemaError(debtRows.error)) throw new Error(debtRows.error.message);

    const debts = ((debtRows.data ?? []) as LooseRow[]).filter((row) => row.room_id);
    const matchingDebt = debts.find((row) => {
        const created = text(row.created_at)?.slice(0, 10);
        return !paymentDate || !created || paymentDate <= created;
    }) ?? debts[0] ?? null;
    return getOne(db, "rooms", matchingDebt?.room_id, companyId, "*");
}

async function resolvePaymentRoom(db: Db, payment: LooseRow, tenant: LooseRow | null, companyId: string) {
    const roomFromPayment = await getOne(db, "rooms", payment.room_id, companyId, "*");
    if (roomFromPayment) return { lease: null as LooseRow | null, room: roomFromPayment };

    const lease = await resolvePaymentLease(db, payment, tenant, companyId);
    const roomFromLease = await getOne(db, "rooms", lease?.room_id, companyId, "*");
    if (roomFromLease) return { lease, room: roomFromLease };

    const historicalRoom = await resolveHistoricalPaymentRoom(db, payment, tenant, companyId);
    if (historicalRoom) return { lease, room: historicalRoom };

    const roomFromTenant = await getOne(db, "rooms", tenant?.room_id, companyId, "*");
    return { lease, room: roomFromTenant };
}

function accountTypeAllowsReceiptIssuer(accountType: unknown) {
    const value = String(accountType ?? "").toLowerCase();
    return !/(office|workspace|shared|system|service)/i.test(value);
}

function roleLabel(value: unknown) {
    const textValue = text(value);
    if (!textValue) return null;
    return textValue
        .replaceAll("_", " ")
        .replaceAll("-", " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

async function resolveReceiptIssuer(db: Db, companyId: string, payment: LooseRow, recordedBy: LooseRow | null | undefined) {
    const employeeId =
        text(payment.prepared_by_employee_id) ??
        text(payment.collected_by_employee_id) ??
        text(payment.recorded_by_employee_id) ??
        text(recordedBy?.employee_id);

    if (employeeId) {
        const employee = await getOne(db, "employees", employeeId, companyId, "*");
        if (employee?.id) {
            return {
                name: text(employee.full_name) ?? text(employee.phone),
                role: roleLabel(employee.role_name ?? employee.role ?? employee.job_title ?? employee.position),
            };
        }
    }

    if (recordedBy?.id && accountTypeAllowsReceiptIssuer(recordedBy.account_type)) {
        return {
            name: text(recordedBy.full_name) ?? text(recordedBy.email) ?? text(recordedBy.phone),
            role: roleLabel(recordedBy.account_type),
        };
    }

    return { name: null, role: null };
}

async function buildTenantReceiptSnapshot(db: Db, payment: LooseRow, receiptNumber: string, verificationCode: string): Promise<PaymentReceiptSnapshot> {
    const companyId = String(payment.company_id);
    const [company, tenant, recordedBy] = await Promise.all([
        getOne(db, "companies", payment.company_id, companyId, "*"),
        getOne(db, "tenants", payment.tenant_id, companyId, "*"),
        payment.recorded_by ? db.from("users").select("id,employee_id,full_name,email,phone,account_type").eq("id", payment.recorded_by).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);
    if (recordedBy.error && !isMissingSchemaError(recordedBy.error)) throw new Error(recordedBy.error.message);

    const { lease, room } = await resolvePaymentRoom(db, payment, tenant, companyId);
    const receiptOfficeId = room?.office_id ?? lease?.office_id ?? tenant?.office_id ?? payment.office_id;
    const office = await getOne(db, "offices", receiptOfficeId, companyId, "*");
    const landlordId = room?.landlord_id ?? null;
    const propertyId = room?.property_id ?? lease?.property_id ?? tenant?.property_id ?? null;
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
        .reduce((total, row) => total + Math.max(0, amount(row.amount_allocated) - amount(row.consumed_by_balance_reconciliation)), 0);
    const amountAppliedToOutstanding = amount(payment.used_to_clear_outstanding) || allocations
        .filter((row) => /arrears|outstanding|debt/i.test(String(row.allocation_type ?? "")))
        .reduce((total, row) => total + amount(row.amount_allocated), 0);
    const amountAppliedToCurrentRent = allocations
        .filter((row) => /current|rent/i.test(String(row.allocation_type ?? "")))
        .reduce((total, row) => total + amount(row.amount_allocated), 0) || Math.max(0, amount(payment.amount_paid ?? payment.amount) - amountAppliedToOutstanding - advanceBalance);
    const collectorName = /collector/i.test(String(recordedBy.data?.account_type ?? "")) ? text(recordedBy.data?.full_name) : null;
    const issuer = await resolveReceiptIssuer(db, companyId, payment, recordedBy.data);
    const paymentNotes = text(payment.notes);
    const backdatingMatch = paymentNotes?.match(/BACKDATED ADMIN ENTRY\s*\|\s*Entered on:\s*([^|]+)\|\s*Reason:\s*(.+)$/i);
    const enteredAt = text(payment.paid_at) ?? text(payment.created_at);
    const paymentTransactionDate = text(payment.payment_date) ?? enteredAt;
    const branding = receiptBrandingForOffice(office, {
        contact: text(company?.phone) ?? text(company?.email) ?? null,
        name: text(company?.name),
    });

    return {
        advanceBalance,
        advanceAmount: advanceBalance,
        amountApplied: amount(payment.used_to_clear_outstanding) || amount(payment.amount_paid ?? payment.amount),
        amountAppliedToCurrentRent,
        amountAppliedToOutstanding,
        amountPaid: amount(payment.amount_paid ?? payment.amount),
        companyContact: branding.contact,
        companyName: branding.name,
        receiptAddress: branding.address,
        receiptEmail: branding.email,
        receiptFooter: branding.footer,
        receiptLogoUrl: branding.logoUrl,
        receiptPhone: branding.phone,
        coveragePeriod,
        coveragePeriods,
        landlordName: text(landlord?.full_name),
        monthlyRent: amount(room?.monthly_rent ?? tenant?.monthly_rent),
        notes: paymentNotes,
        officeName: text(office?.office_name) ?? text(office?.name),
        propertyName: text(property?.property_name) ?? text(property?.name) ?? text(property?.location),
        approvedAt: text(payment.approved_at) ?? text(payment.paid_at) ?? text(payment.payment_date),
        approvedByName: text(payment.approved_by_name) ?? null,
        collectorName,
        paymentDateTime: enteredAt ?? paymentTransactionDate,
        paymentTransactionDate,
        enteredAt,
        isBackdated: Boolean(backdatingMatch) || Boolean(paymentTransactionDate && enteredAt && paymentTransactionDate.slice(0, 10) < enteredAt.slice(0, 10)),
        backdatingReason: backdatingMatch?.[2]?.trim() ?? null,
        paymentMethod: text(payment.payment_method),
        preparedByName: issuer.name,
        preparedByRole: issuer.role,
        previousOutstandingBalance: amount(payment.balance_before_payment ?? payment.expected_amount),
        receiptNumber,
        landlordId: text(landlord?.id ?? landlordId),
        officeId: text(receiptOfficeId),
        paymentId: text(payment.id),
        recordedByName: issuer.name ?? text(payment.entered_by_name) ?? (accountTypeAllowsReceiptIssuer(recordedBy.data?.account_type) ? text(recordedBy.data?.full_name) : null),
        referenceNumber: text(payment.reference_number ?? payment.cheque_reference ?? payment.collection_number),
        remainingOutstandingBalance: amount(payment.balance_after_payment ?? payment.balance),
        roomId: text(room?.id),
        roomNumber: text(room?.room_number),
        status: text(payment.status) ?? "paid",
        tenantEmail: text(tenant?.email),
        tenantId: text(tenant?.id ?? payment.tenant_id),
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
                office_id: snapshot.officeId ?? payment.office_id ?? null,
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
        newValue: await correctionValueLabel(db, companyId, request.requested_value, request.correction_type),
        previousValue: await correctionValueLabel(db, companyId, request.original_value, request.correction_type),
        reason: text(request.admin_comment) ?? text(request.reason),
        requestedAt: text(request.created_at),
        requestedByName,
        status: input.decision,
    };
    const previousHistory = Array.isArray(previousSnapshot.amendmentHistory) ? previousSnapshot.amendmentHistory : [];
    const amendmentHistory = receiptAmendmentHistory(previousHistory, amendment, request.id);
    const amendmentSummary = input.decision === "rejected"
        ? `${fieldLabel} change rejected`
        : receiptStatus === "cancelled"
            ? `Payment cancelled: ${amendment.reason ?? "Admin approved cancellation"}`
            : `${fieldLabel} changed from ${amendment.previousValue ?? "previous value"} to ${amendment.newValue ?? "new value"}`;
    const updatedSnapshot: PaymentReceiptSnapshot = {
        ...currentSnapshot,
        amendmentHistory,
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
        preparedByRole: previousSnapshot.preparedByRole ?? currentSnapshot.preparedByRole ?? null,
        receiptStatus,
        status: receiptStatus,
        statusLabel: receiptStatusLabel(receiptStatus),
    };

    let receiptRow = existing;
    if (existing?.id) {
        const { data: updatedReceipt, error: updateError } = await db
            .from("payment_receipts")
            .update({
                office_id: updatedSnapshot.officeId ?? payment.office_id ?? request.office_id ?? existing.office_id ?? null,
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
                office_id: updatedSnapshot.officeId ?? payment.office_id ?? request.office_id ?? null,
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
        newValue: await correctionValueLabel(db, companyId, request.requested_value, request.correction_type),
        previousValue: await correctionValueLabel(db, companyId, request.original_value, request.correction_type),
        reason: text(request.reason),
        requestedAt: text(request.created_at),
        requestedByName,
        status: "pending",
    };
    const previousHistory = Array.isArray(previousSnapshot.amendmentHistory) ? previousSnapshot.amendmentHistory : [];
    const amendmentHistory = receiptAmendmentHistory(previousHistory, amendment, request.id);
    const updatedSnapshot: PaymentReceiptSnapshot = {
        ...previousSnapshot,
        amendmentHistory,
        amendmentSummary: `${fieldLabel} change pending Admin approval`,
        auditReference: amendment.auditReference,
        changeDate: amendment.changeDate,
        changeReason: amendment.reason,
        changeRequestedByName: requestedByName,
        changeType: fieldLabel,
        changedByName: requestedByName,
        preparedByName: previousSnapshot.preparedByName ?? previousSnapshot.recordedByName,
        preparedByRole: previousSnapshot.preparedByRole ?? null,
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
