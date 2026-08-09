"use server";

import { revalidatePath } from "next/cache";
import { logUserAction } from "@/lib/auth/audit";
import { requireAuth, requirePermission } from "@/lib/auth/permissions";
import { paymentMethodBucket } from "@/lib/collections/payment-methods";
import { createNotificationWithEmail } from "@/lib/notifications/email";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { recordCollection } from "./collections";
import { createPromise } from "./promises";

type DynamicDb = {
    from: (table: string) => any;
    rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

function assertPin(pin: string) {
    if (!/^\d{6}$/.test(pin)) throw new Error("PIN must contain exactly six digits.");
}

function assertAmount(value: number, label: string) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be greater than zero.`);
}

function isPendingLockoutSchemaError(error: { message?: string } | null) {
    return Boolean(error?.message?.match(/admin_visible_pin|failed_login_attempts|is_locked|locked_at|reset_at|reset_by_admin|schema cache/i));
}

function today() {
    return new Date().toISOString().slice(0, 10);
}

function normalizePhone(value: string) {
    const digits = value.replace(/\D/g, "");
    if (digits.startsWith("256")) return digits.slice(3);
    if (digits.startsWith("0")) return digits.slice(1);
    return digits;
}

function normalizeName(value: string) {
    return value.trim().replace(/\s+/g, " ").toLowerCase();
}

async function setPinCredential(userId: string, pin: string, adminUserId: string | null) {
    const supabase = (await createSupabaseServerClient()) as unknown as DynamicDb;
    const { error } = await supabase.rpc("ddumba_v1_set_pin_credential", {
        p_pin: pin,
        p_status: "active",
        p_user_id: userId,
    }) as { data: unknown; error: { message: string } | null };
    if (error) throw new Error(error.message);

    const { error: metadataError } = await (createSupabaseAdminClient() as unknown as DynamicDb)
        .from("pin_credentials")
        .update({
            admin_visible_pin: null,
            failed_attempts: 0,
            failed_login_attempts: 0,
            is_locked: false,
            locked_at: null,
            reset_at: new Date().toISOString(),
            reset_by_admin: adminUserId,
            updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
    if (metadataError && !isPendingLockoutSchemaError(metadataError)) throw new Error(metadataError.message);
}

export async function createFieldCollectorAccount(formData: FormData) {
    const context = await requirePermission("settings.manage");
    if (!context.activeCompany?.id) throw new Error("Active company is required.");

    const fullName = String(formData.get("collectorName") ?? "").trim();
    const phone = String(formData.get("collectorPhone") ?? "").trim();
    const email = String(formData.get("collectorEmail") ?? "").trim().toLowerCase();
    const pin = String(formData.get("collectorPin") ?? "").trim();
    if (!fullName) throw new Error("Collector name is required.");
    if (!email.includes("@")) throw new Error("Collector email is required.");
    assertPin(pin);

    const admin = createSupabaseAdminClient();
    const normalizedCollectorName = normalizeName(fullName);
    const normalizedCollectorPhone = normalizePhone(phone);
    if (!normalizedCollectorPhone) throw new Error("Collector phone is required.");

    const { data: candidateEmployees, error: employeeError } = await admin
        .from("employees")
        .select("id, full_name, phone, status, user_id")
        .eq("company_id", context.activeCompany.id)
        .not("phone", "is", null)
        .limit(2000);
    if (employeeError) throw new Error(employeeError.message);
    const matchingEmployees = (candidateEmployees ?? []).filter((employee) => {
        const isActive = !["archived", "deleted", "inactive", "terminated"].includes(String(employee.status ?? "active").toLowerCase());
        return isActive
            && normalizePhone(String(employee.phone ?? "")) === normalizedCollectorPhone
            && normalizeName(String(employee.full_name ?? "")) === normalizedCollectorName;
    });
    if (matchingEmployees.length !== 1) {
        throw new Error(matchingEmployees.length > 1
            ? "Multiple employees match this collector. Open the existing employee and link the correct one."
            : "Create or link a real employee before creating a Field Collector account.");
    }
    const linkedEmployee = matchingEmployees[0];
    if (linkedEmployee.user_id) {
        throw new Error("This employee is already linked to a login account.");
    }

    const { data: role, error: roleError } = await admin
        .from("roles")
        .select("id")
        .eq("company_id", context.activeCompany.id)
        .eq("key", "field_collector")
        .maybeSingle();
    if (roleError) throw new Error(roleError.message);
    if (!role?.id) throw new Error("Field Collector role is missing. Apply migration 0190_field_collector_accounts.sql first.");

    const { data: authUser, error: authError } = await admin.auth.admin.createUser({
        email,
        password: pin,
        email_confirm: true,
        user_metadata: { account_type: "field_collector", full_name: fullName },
    });
    if (authError || !authUser.user) throw new Error(authError?.message ?? "Could not create collector Auth user.");

    const userPayload = {
        account_type: "field_collector",
        company_id: context.activeCompany.id,
        default_office_id: null,
        email,
        employee_id: linkedEmployee.id,
        full_name: fullName,
        id: authUser.user.id,
        phone: phone || null,
        status: "active",
        updated_at: new Date().toISOString(),
    };
    const { error: userError } = await (admin as unknown as DynamicDb).from("users").upsert(userPayload);
    if (userError) throw new Error(userError.message);

    const { error: assignmentError } = await (admin as unknown as DynamicDb).from("user_office_roles").insert({
        company_id: context.activeCompany.id,
        employee_id: linkedEmployee.id,
        office_id: null,
        role_id: role.id,
        scope: "company",
        status: "active",
        user_id: authUser.user.id,
    });
    if (assignmentError && !/duplicate key/i.test(assignmentError.message)) throw new Error(assignmentError.message);

    await setPinCredential(authUser.user.id, pin, context.profile?.id ?? null);

    const { error: profileError } = await (admin as unknown as DynamicDb).from("field_collector_profiles").upsert({
        cash_balance: 0,
        company_id: context.activeCompany.id,
        created_by: context.profile?.id ?? null,
        employee_id: linkedEmployee.id,
        email,
        full_name: fullName,
        phone: phone || null,
        status: "active",
        updated_at: new Date().toISOString(),
        user_id: authUser.user.id,
    });
    if (profileError) throw new Error(profileError.message);

    const { error: linkEmployeeError } = await admin
        .from("employees")
        .update({ user_id: authUser.user.id, updated_at: new Date().toISOString() })
        .eq("company_id", context.activeCompany.id)
        .eq("id", linkedEmployee.id)
        .is("user_id", null);
    if (linkEmployeeError) throw new Error(linkEmployeeError.message);

    await logUserAction({
        action: "field_collector_created",
        entityType: "user",
        entityId: authUser.user.id,
        companyId: context.activeCompany.id,
        afterData: { email, employee_id: linkedEmployee.id, full_name: fullName, account_type: "field_collector" },
    });
    revalidatePath("/office/admin");
}

function requireCollector(context: Awaited<ReturnType<typeof requireAuth>>) {
    const isCollector = context.authMode === "collector" || context.roles.some((role) => role.role?.key === "field_collector");
    if (!isCollector || !context.activeCompany?.id || !context.profile?.id) {
        throw new Error("Field Collector account required.");
    }
}

async function adjustCollectorBalance(input: {
    amount: number;
    collectionId?: string | null;
    companyId: string;
    collectorId: string;
    landlordId?: string | null;
    movementType: string;
    notes?: string | null;
    officeId?: string | null;
    paymentMethod?: string | null;
    roomId?: string | null;
    status?: string;
    submissionId?: string | null;
    tenantId?: string | null;
}) {
    const db = createSupabaseAdminClient() as unknown as DynamicDb;
    await db.from("field_collector_cash_movements").insert({
        amount: input.amount,
        collection_id: input.collectionId ?? null,
        company_id: input.companyId,
        collector_user_id: input.collectorId,
        landlord_id: input.landlordId ?? null,
        movement_type: input.movementType,
        notes: input.notes ?? null,
        office_id: input.officeId ?? null,
        payment_method: input.paymentMethod ?? null,
        room_id: input.roomId ?? null,
        status: input.status ?? "posted",
        submission_id: input.submissionId ?? null,
        tenant_id: input.tenantId ?? null,
    });

    const { data: movements } = await db
        .from("field_collector_cash_movements")
        .select("amount, movement_type, status")
        .eq("company_id", input.companyId)
        .eq("collector_user_id", input.collectorId);
    const balance = (movements ?? []).reduce((total: number, row: Record<string, unknown>) => {
        const amount = Number(row.amount ?? 0);
        if (row.status === "voided" || row.status === "rejected") return total;
        if (row.movement_type === "collection_in") return total + amount;
        if (row.movement_type === "submission_approved") return total - amount;
        return total;
    }, 0);
    await db.from("field_collector_profiles").update({ cash_balance: balance, updated_at: new Date().toISOString() }).eq("company_id", input.companyId).eq("user_id", input.collectorId);
    return balance;
}

async function neutralizeOfficeCashForCollector(input: { amount: number; collectionId: string; companyId: string; officeId: string; recordedBy: string }) {
    const db = createSupabaseAdminClient() as unknown as DynamicDb;
    const { data: account } = await db
        .from("cash_accounts")
        .select("id")
        .eq("company_id", input.companyId)
        .eq("office_id", input.officeId)
        .eq("account_type", "office_cash")
        .eq("status", "active")
        .maybeSingle();
    if (!account?.id) return;
    await db.from("cash_transactions").insert({
        amount: input.amount,
        cash_account_id: account.id,
        company_id: input.companyId,
        description: "Collector payment held by field collector until office receipt approval.",
        office_id: input.officeId,
        recorded_by: input.recordedBy,
        source_id: input.collectionId,
        source_type: "collector_cash_holding",
        transaction_date: new Date().toISOString(),
        transaction_type: "outflow",
    });
}

export async function recordCollectorPayment(input: { amount: number; notes?: string; paymentDate: string; paymentMethod: string; referenceNumber?: string; tenantId: string }) {
    const context = await requireAuth();
    requireCollector(context);
    const methodBucket = paymentMethodBucket(input.paymentMethod);
    const collection = await recordCollection({
        amount: input.amount,
        collectorName: context.profile?.full_name ?? "Field Collector",
        notes: input.notes,
        paymentDate: input.paymentDate,
        paymentMethod: input.paymentMethod,
        referenceNumber: input.referenceNumber,
        tenantId: input.tenantId,
    });
    const db = createSupabaseAdminClient() as unknown as DynamicDb;
    await db.from("collections").update({
        account_type: "field_collector",
        entered_by_account_id: context.profile!.id,
        entered_by_name: context.profile!.full_name,
    }).eq("id", collection.id);

    if (methodBucket === "cash") {
        await neutralizeOfficeCashForCollector({
            amount: Number(collection.amount_paid ?? collection.amount ?? input.amount),
            collectionId: collection.id,
            companyId: context.activeCompany!.id,
            officeId: String(collection.office_id ?? context.activeOffice?.id),
            recordedBy: context.profile!.id,
        });

        await adjustCollectorBalance({
            amount: Number(collection.amount_paid ?? collection.amount ?? input.amount),
            collectionId: collection.id,
            companyId: context.activeCompany!.id,
            collectorId: context.profile!.id,
            movementType: "collection_in",
            notes: input.notes ?? null,
            officeId: collection.office_id ?? context.activeOffice?.id ?? null,
            paymentMethod: input.paymentMethod,
            roomId: collection.room_id ?? null,
            tenantId: collection.tenant_id ?? input.tenantId,
        });
    }
    revalidatePath("/office/collector");
    revalidatePath("/office/collector/payments");
    return collection;
}

export async function recordCollectorPromise(input: { notes?: string; promisedAmount: number; promisedDate: string; tenantId: string }) {
    const context = await requireAuth();
    requireCollector(context);
    const promise = await createPromise(input);
    const db = createSupabaseAdminClient() as unknown as DynamicDb;
    await db.from("promises").update({
        account_type: "field_collector",
        entered_by_account_id: context.profile!.id,
        entered_by_name: context.profile!.full_name,
    }).eq("id", promise.id);
    revalidatePath("/office/collector/promises");
    return promise;
}

export async function submitCollectorMoney(input: { amount: number; officeId: string; notes?: string; reference?: string }) {
    const context = await requireAuth();
    requireCollector(context);
    void input;
    throw new Error("Collector cash must be banked directly from Bank Collections. Submit Cash to Office is closed.");
}

export async function decideCollectorMoneySubmission(input: { comment?: string; decision: "approved" | "rejected"; submissionId: string }) {
    const context = await requirePermission("collections.manage");
    if (!context.activeCompany?.id || !context.profile?.id) throw new Error("Active session required.");
    void input;
    throw new Error("Collector-to-office handover review is closed. Verify Collector banking from Bank Deposit Slips.");
}

export async function sendCollectorMessage(input: { body: string; officeId?: string; priority?: string; recipientUserId?: string; recipientType?: string; subject: string }) {
    const context = await requireAuth();
    if (!context.activeCompany?.id || !context.profile?.id) throw new Error("Login required.");
    const db = createSupabaseAdminClient() as unknown as DynamicDb;
    const { data, error } = await db.from("field_collector_messages").insert({
        body: input.body,
        company_id: context.activeCompany.id,
        office_id: input.officeId || context.activeOffice?.id || null,
        priority: input.priority || "normal",
        recipient_type: input.recipientType || "collector",
        recipient_user_id: input.recipientUserId || null,
        sender_id: context.profile.id,
        status: "unread",
        subject: input.subject,
    }).select("*").single();
    if (error) throw new Error(error.message);
    revalidatePath("/office/collector/instructions");
    return data;
}
