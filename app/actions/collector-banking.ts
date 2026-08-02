"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { logUserAction } from "@/lib/auth/audit";
import { canAccessOffice, requireAuth, requireCompanyAdminMode } from "@/lib/auth/permissions";
import { createNotificationWithEmail } from "@/lib/notifications/email";
import { requireCollectorContext } from "@/lib/collectors/data";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type DynamicDb = {
    from: (table: string) => any;
    storage: any;
};

const PENDING_STATUSES = ["pending_verification", "needs_clearer_image", "correction_requested"];
const ALLOWED_SLIP_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/heic", "image/heif", "application/pdf"]);

function amountValue(value: unknown) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
}

function assertPositiveAmount(value: number) {
    if (!Number.isFinite(value) || value <= 0) throw new Error("Amount banked must be greater than zero.");
}

function assertDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Banking date must be a valid date.");
}

function fileExtension(file: File) {
    const explicit = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (explicit) return explicit;
    if (file.type === "application/pdf") return "pdf";
    if (file.type.includes("png")) return "png";
    if (file.type.includes("heic")) return "heic";
    return "jpg";
}

async function collectorReservedAmount(input: { collectorId: string; companyId: string }) {
    const db = createSupabaseAdminClient() as unknown as DynamicDb;
    const { data, error } = await db
        .from("collector_banking_submissions")
        .select("amount, reserved_amount, status")
        .eq("company_id", input.companyId)
        .eq("collector_user_id", input.collectorId)
        .in("status", PENDING_STATUSES);
    if (error && !/collector_banking_submissions|schema cache/i.test(error.message)) throw new Error(error.message);
    return (data ?? []).reduce((total: number, row: Record<string, unknown>) => total + amountValue(row.reserved_amount ?? row.amount), 0);
}

async function recomputeCollectorBalance(input: { collectorId: string; companyId: string }) {
    const db = createSupabaseAdminClient() as unknown as DynamicDb;
    const { data, error } = await db
        .from("field_collector_cash_movements")
        .select("amount, movement_type, status")
        .eq("company_id", input.companyId)
        .eq("collector_user_id", input.collectorId);
    if (error) throw new Error(error.message);
    const balance = (data ?? []).reduce((total: number, row: Record<string, unknown>) => {
        if (row.status === "voided" || row.status === "rejected") return total;
        const amount = amountValue(row.amount);
        if (row.movement_type === "collection_in") return total + amount;
        if (row.movement_type === "submission_approved" || row.movement_type === "banking_verified") return total - amount;
        return total;
    }, 0);
    const { error: updateError } = await db
        .from("field_collector_profiles")
        .update({ cash_balance: balance, updated_at: new Date().toISOString() })
        .eq("company_id", input.companyId)
        .eq("user_id", input.collectorId);
    if (updateError) throw new Error(updateError.message);
    return balance;
}

async function ensureBankAccount(input: { bankName: string; companyId: string }) {
    const db = createSupabaseAdminClient() as unknown as DynamicDb;
    const { data, error } = await db
        .from("cash_accounts")
        .select("*")
        .eq("company_id", input.companyId)
        .eq("account_type", "bank")
        .eq("status", "active")
        .is("office_id", null)
        .limit(1)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (data?.id) return data;
    const { data: created, error: createError } = await db
        .from("cash_accounts")
        .insert({
            account_type: "bank",
            company_id: input.companyId,
            name: input.bankName || "Collector Bank Deposits",
            office_id: null,
            status: "active",
        })
        .select("*")
        .single();
    if (createError) throw new Error(createError.message);
    return created;
}

function revalidateCollectorBanking() {
    revalidatePath("/office/collector");
    revalidatePath("/office/collector/banking");
    revalidatePath("/office/admin/collector-banking");
    revalidatePath("/office/admin/cash-position");
    revalidatePath("/office/admin/cash-banking");
    revalidatePath("/office/notifications");
}

export async function submitCollectorBanking(formData: FormData) {
    const context = await requireCollectorContext();
    const companyId = context.activeCompany!.id;
    const collectorId = context.profile!.id;
    const amount = amountValue(formData.get("amount"));
    const bankingDate = String(formData.get("bankingDate") ?? "").trim();
    const bankName = String(formData.get("bankName") ?? "").trim();
    const destinationAccount = String(formData.get("destinationAccount") ?? "").trim();
    const depositReference = String(formData.get("depositReference") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim();
    const officeId = String(formData.get("officeId") ?? context.activeOffice?.id ?? "").trim();
    const idempotencyKey = String(formData.get("idempotencyKey") ?? randomUUID()).trim();
    const slip = formData.get("depositSlip");

    assertPositiveAmount(amount);
    assertDate(bankingDate);
    if (!officeId) throw new Error("Assigned office is required.");
    if (!canAccessOffice(context, officeId)) throw new Error("You cannot submit banking for this office.");
    if (!bankName) throw new Error("Bank name is required.");
    if (!depositReference) throw new Error("Deposit slip/reference number is required.");
    if (!(slip instanceof File) || slip.size <= 0) throw new Error("Upload the bank deposit slip before submitting.");
    if (!ALLOWED_SLIP_TYPES.has(slip.type)) throw new Error("Deposit slip must be JPG, JPEG, PNG, HEIC or PDF.");

    const db = createSupabaseAdminClient() as unknown as DynamicDb;
    const { data: office, error: officeError } = await db.from("offices").select("id, office_name, name").eq("company_id", companyId).eq("id", officeId).maybeSingle();
    if (officeError) throw new Error(officeError.message);
    if (!office?.id) throw new Error("Assigned office was not found.");

    const { data: profile, error: profileError } = await db
        .from("field_collector_profiles")
        .select("cash_balance, full_name")
        .eq("company_id", companyId)
        .eq("user_id", collectorId)
        .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    const cashHeld = amountValue(profile?.cash_balance);
    const reserved = await collectorReservedAmount({ collectorId, companyId });
    const available = Math.max(0, cashHeld - reserved);
    if (amount > available) throw new Error("Amount banked is greater than available Collector cash.");

    const duplicateKey = [
        companyId,
        collectorId,
        bankingDate,
        Math.round(amount * 100),
        depositReference.toLowerCase().replace(/\s+/g, ""),
    ].join(":");
    const { data: duplicate } = await db
        .from("collector_banking_submissions")
        .select("id, status")
        .eq("company_id", companyId)
        .eq("duplicate_key", duplicateKey)
        .neq("status", "rejected")
        .maybeSingle();
    if (duplicate?.id) throw new Error("This banking submission may already exist. Open Bank Collections to review it.");

    const recordId = randomUUID();
    const buffer = Buffer.from(await slip.arrayBuffer());
    const checksum = createHash("sha256").update(buffer).digest("hex");
    const ext = fileExtension(slip);
    const [year, month] = bankingDate.split("-");
    const filePath = `${companyId}/${officeId}/${collectorId}/${year}/${month}/${recordId}.${ext}`;

    const upload = await db.storage.from("collector-bank-slips").upload(filePath, buffer, {
        contentType: slip.type || "application/octet-stream",
        upsert: false,
    });
    if (upload.error) throw new Error(`Deposit slip upload failed: ${upload.error.message}`);

    const { data, error } = await db
        .from("collector_banking_submissions")
        .insert({
            amount,
            banking_date: bankingDate,
            bank_name: bankName,
            cash_before_submission: cashHeld,
            collector_user_id: collectorId,
            company_id: companyId,
            deposit_reference: depositReference,
            destination_account: destinationAccount || null,
            duplicate_key: duplicateKey,
            id: recordId,
            idempotency_key: idempotencyKey || null,
            notes: notes || null,
            office_id: officeId,
            reserved_amount: amount,
            slip_checksum: checksum,
            slip_file_path: filePath,
            slip_file_size: slip.size,
            slip_mime_type: slip.type,
            slip_original_name: slip.name,
            slip_uploaded_by: collectorId,
            status: "pending_verification",
            submitted_by: collectorId,
        })
        .select("*")
        .single();
    if (error) throw new Error(error.message);

    await createNotificationWithEmail(db, {
        action_url: `/office/admin/collector-banking?submissionId=${recordId}`,
        channel: "in_app",
        company_id: companyId,
        delivery_status: "pending",
        entity_id: recordId,
        entity_type: "collector_banking_submission",
        is_read: false,
        message: `Collector ${profile?.full_name ?? context.profile!.full_name} submitted UGX ${Math.round(amount).toLocaleString()} for bank verification.`,
        office_id: officeId,
        recipient_type: "admin",
        severity: "warning",
        title: "Collector banking verification pending",
    });
    await logUserAction({
        action: "collector_banking_submitted",
        entityType: "collector_banking_submission",
        entityId: recordId,
        companyId,
        officeId,
        afterData: { amount, bankingDate, bankName, officeId, status: "pending_verification" },
    });
    revalidateCollectorBanking();
    return { ok: true, submission: data };
}

export async function decideCollectorBankingSubmission(input: {
    adminComment?: string;
    decision: "verified" | "rejected" | "needs_clearer_image" | "correction_requested";
    reason?: string;
    submissionId: string;
}) {
    const context = await requireCompanyAdminMode();
    if (!context.activeCompany?.id || !context.profile?.id) throw new Error("Admin session required.");
    const db = createSupabaseAdminClient() as unknown as DynamicDb;
    const { data: request, error } = await db
        .from("collector_banking_submissions")
        .select("*")
        .eq("company_id", context.activeCompany.id)
        .eq("id", input.submissionId)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!request?.id) throw new Error("Collector banking submission not found.");
    if (request.status === "verified") throw new Error("This banking submission has already been verified.");
    if (request.status === "rejected" || request.status === "cancelled") throw new Error("This banking submission is closed.");

    const now = new Date().toISOString();
    const amount = amountValue(request.amount);
    if (input.decision !== "verified" && !String(input.reason ?? "").trim()) {
        throw new Error("A reason is required.");
    }

    if (input.decision === "verified") {
        const bankAccount = await ensureBankAccount({ bankName: String(request.bank_name ?? "Collector Bank Deposits"), companyId: context.activeCompany.id });
        const { error: updateError } = await db
            .from("collector_banking_submissions")
            .update({
                admin_comment: input.adminComment || null,
                status: "verified",
                updated_at: now,
                verified_at: now,
                verified_by: context.profile.id,
            })
            .eq("id", request.id)
            .neq("status", "verified");
        if (updateError) throw new Error(updateError.message);

        const movementInsert = await db.from("field_collector_cash_movements").insert({
            amount,
            collector_banking_submission_id: request.id,
            collector_user_id: request.collector_user_id,
            company_id: context.activeCompany.id,
            created_by: context.profile.id,
            movement_type: "banking_verified",
            notes: `Banked to ${request.bank_name}. Ref ${request.deposit_reference}.`,
            office_id: request.office_id ?? null,
            payment_method: "bank",
            status: "approved",
        });
        if (movementInsert.error) throw new Error(movementInsert.error.message);
        const cashTransaction = await db.from("cash_transactions").insert({
            amount,
            cash_account_id: bankAccount.id,
            company_id: context.activeCompany.id,
            description: `Collector bank deposit verified. ${request.bank_name} ${request.deposit_reference}`.trim(),
            office_id: null,
            recorded_by: context.profile.id,
            source_id: request.id,
            source_type: "collector_bank_deposit",
            transaction_date: now,
            transaction_type: "inflow",
        });
        if (cashTransaction.error && !/duplicate key/i.test(cashTransaction.error.message)) throw new Error(cashTransaction.error.message);
        await recomputeCollectorBalance({ collectorId: String(request.collector_user_id), companyId: context.activeCompany.id });
    } else {
        const status = input.decision;
        const { error: updateError } = await db
            .from("collector_banking_submissions")
            .update({
                admin_comment: input.adminComment || null,
                rejected_at: status === "rejected" ? now : null,
                rejected_by: status === "rejected" ? context.profile.id : null,
                rejection_reason: input.reason || null,
                status,
                updated_at: now,
            })
            .eq("id", request.id);
        if (updateError) throw new Error(updateError.message);
    }

    await createNotificationWithEmail(db, {
        action_url: "/office/collector/banking",
        channel: "in_app",
        company_id: context.activeCompany.id,
        delivery_status: "pending",
        entity_id: request.id,
        entity_type: "collector_banking_submission",
        is_read: false,
        message: `Your collector banking submission of UGX ${Math.round(amount).toLocaleString()} was ${input.decision.replace(/_/g, " ")}.`,
        office_id: request.office_id ?? null,
        recipient_type: "collector",
        recipient_user_id: request.collector_user_id,
        severity: input.decision === "verified" ? "success" : "warning",
        title: input.decision === "verified" ? "Banking verified" : "Banking needs attention",
    });
    await logUserAction({
        action: `collector_banking_${input.decision}`,
        entityType: "collector_banking_submission",
        entityId: request.id,
        companyId: context.activeCompany.id,
        officeId: request.office_id ?? null,
        beforeData: { status: request.status, amount },
        afterData: { status: input.decision, amount, reason: input.reason ?? null },
    });
    revalidateCollectorBanking();
    return { ok: true };
}
