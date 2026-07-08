"use server";

import { revalidatePath } from "next/cache";
import { logUserAction } from "@/lib/auth/audit";
import { requirePermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type OfficeAccountInput = {
    fullName: string;
    email: string;
    pin: string;
    officeId: string;
    roleId: string;
};

type UpdateOfficeAccountInput = {
    userId: string;
    fullName: string;
    officeId: string;
    roleId: string;
    status: string;
};

type ResetPinInput = {
    userId: string;
    pin: string;
};

type OfficeInput = {
    officeName: string;
    officeCode?: string;
    managerName?: string;
    city?: string;
    region?: string;
    collectionTarget?: string;
    expenseBudget?: string;
    status?: string;
};

type UpdateOfficeInput = OfficeInput & {
    officeId: string;
};

type SetPinRpc = (
    fn: "ddumba_v1_set_pin_credential",
    args: { p_user_id: string; p_pin: string; p_status?: string },
) => Promise<{ data: null; error: { message: string } | null }>;

function assertPin(pin: string) {
    if (!/^\d{4,12}$/.test(pin)) {
        throw new Error("PIN must be 4 to 12 digits.");
    }
}

function isPendingLockoutSchemaError(error: { message?: string } | null) {
    return Boolean(error?.message?.match(/admin_visible_pin|locked_at|reset_at|reset_by_admin|schema cache/i));
}

async function setPinCredential(userId: string, pin: string, status = "active", resetByAdmin?: string | null) {
    const supabase = await createSupabaseServerClient();
    const rpc = supabase.rpc.bind(supabase) as unknown as SetPinRpc;
    const { error } = await rpc("ddumba_v1_set_pin_credential", {
        p_user_id: userId,
        p_pin: pin,
        p_status: status,
    });

    if (error) throw new Error(error.message);

    const admin = createSupabaseAdminClient();
    const now = new Date().toISOString();
    const { error: metadataError } = await admin
        .from("pin_credentials")
        .update({
            admin_visible_pin: pin,
            failed_attempts: 0,
            locked_at: status === "locked" ? now : null,
            reset_at: now,
            reset_by_admin: resetByAdmin ?? null,
            status,
            updated_at: now,
        })
        .eq("user_id", userId);
    if (metadataError && !isPendingLockoutSchemaError(metadataError)) throw new Error(metadataError.message);
}

async function roleScope(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, roleId: string) {
    const { data } = await supabase.from("roles").select("key").eq("id", roleId).maybeSingle();
    return ["company_admin", "super_admin", "hq_executive"].includes(data?.key ?? "") ? "company" : "office";
}

async function assignRole(input: {
    companyId: string;
    officeId: string;
    roleId: string;
    scope: string;
    userId: string;
}) {
    const admin = createSupabaseAdminClient();
    const { data: existing } = await admin
        .from("user_office_roles")
        .select("id")
        .eq("company_id", input.companyId)
        .eq("user_id", input.userId)
        .limit(1)
        .maybeSingle();

    if (existing?.id) {
        const { error } = await admin
            .from("user_office_roles")
            .update({
                office_id: input.scope === "company" ? null : input.officeId,
                role_id: input.roleId,
                scope: input.scope,
            })
            .eq("id", existing.id);
        if (error) throw new Error(error.message);
        return;
    }

    const { error } = await admin.from("user_office_roles").insert({
        company_id: input.companyId,
        office_id: input.scope === "company" ? null : input.officeId,
        role_id: input.roleId,
        scope: input.scope,
        user_id: input.userId,
    });
    if (error) throw new Error(error.message);
}

export async function createOfficeAccount(input: OfficeAccountInput) {
    const context = await requirePermission("settings.manage");
    if (!context.activeCompany?.id) throw new Error("Active company is required.");
    assertPin(input.pin);

    const email = input.email.trim().toLowerCase();
    if (!email.includes("@")) throw new Error("A valid email is required.");
    if (!input.officeId || !input.roleId) throw new Error("Office and role are required.");

    const admin = createSupabaseAdminClient();
    const supabase = await createSupabaseServerClient();
    const { data: authUser, error: authError } = await admin.auth.admin.createUser({
        email,
        password: input.pin,
        email_confirm: true,
        user_metadata: {
            full_name: input.fullName,
            default_office_id: input.officeId,
            account_type: "office",
        },
    });

    if (authError || !authUser.user) {
        throw new Error(authError?.message ?? "Could not create Supabase Auth user.");
    }

    const { error: userError } = await admin.from("users").upsert({
        id: authUser.user.id,
        company_id: context.activeCompany.id,
        default_office_id: input.officeId,
        email,
        full_name: input.fullName,
        status: "active",
        updated_at: new Date().toISOString(),
    });

    if (userError) throw new Error(userError.message);

    await setPinCredential(authUser.user.id, input.pin, "active", context.profile?.id ?? null);
    const scope = await roleScope(supabase, input.roleId);

    await assignRole({
        companyId: context.activeCompany.id,
        officeId: input.officeId,
        roleId: input.roleId,
        scope,
        userId: authUser.user.id,
    });

    await admin.from("security_events").insert({
        company_id: context.activeCompany.id,
        office_id: input.officeId,
        user_id: authUser.user.id,
        event_type: "office_account_created",
        severity: "info",
        metadata: { role_id: input.roleId, created_by: context.profile?.id ?? null },
    });

    await logUserAction({
        action: "office_account_created",
        entityType: "user",
        entityId: authUser.user.id,
        companyId: context.activeCompany.id,
        officeId: input.officeId,
        afterData: { email, full_name: input.fullName, role_id: input.roleId },
    });

    revalidatePath("/office/admin");
}

export async function updateOfficeAccount(input: UpdateOfficeAccountInput) {
    const context = await requirePermission("settings.manage");
    if (!context.activeCompany?.id) throw new Error("Active company is required.");
    if (!input.userId || !input.officeId || !input.roleId) throw new Error("User, office, and role are required.");

    const supabase = await createSupabaseServerClient();
    const admin = createSupabaseAdminClient();
    const { data: existing } = await admin.from("users").select("*").eq("id", input.userId).maybeSingle();
    const { error: updateError } = await admin
        .from("users")
        .update({
            default_office_id: input.officeId,
            full_name: input.fullName,
            status: input.status,
            updated_at: new Date().toISOString(),
        })
        .eq("id", input.userId)
        .eq("company_id", context.activeCompany.id);

    if (updateError) throw new Error(updateError.message);

    const scope = await roleScope(supabase, input.roleId);
    await assignRole({
        companyId: context.activeCompany.id,
        officeId: input.officeId,
        roleId: input.roleId,
        scope,
        userId: input.userId,
    });

    await logUserAction({
        action: "office_account_updated",
        entityType: "user",
        entityId: input.userId,
        companyId: context.activeCompany.id,
        officeId: input.officeId,
        beforeData: existing,
        afterData: input,
    });

    revalidatePath("/office/admin");
}

export async function resetOfficeAccountPin(input: ResetPinInput) {
    const context = await requirePermission("settings.manage");
    assertPin(input.pin);

    const admin = createSupabaseAdminClient();
    const { error: authError } = await admin.auth.admin.updateUserById(input.userId, {
        password: input.pin,
    });
    if (authError) throw new Error(authError.message);

    await setPinCredential(input.userId, input.pin, "active", context.profile?.id ?? null);

    const { data: target } = await admin.from("users").select("company_id, default_office_id").eq("id", input.userId).maybeSingle();
    if (target?.company_id) {
        await admin.from("security_events").insert({
            company_id: target.company_id,
            office_id: target.default_office_id,
            user_id: input.userId,
            event_type: "account_pin_reset_unlocked",
            severity: "info",
            metadata: {
                reset_by_admin: context.profile?.id ?? null,
                failed_attempts: 0,
                status: "active",
            },
        });
    }

    await logUserAction({
        action: "office_account_pin_reset_unlocked",
        entityType: "user",
        entityId: input.userId,
        companyId: context.activeCompany?.id,
        afterData: { pin_reset: true, failed_attempts: 0, status: "active" },
    });

    revalidatePath("/office/admin");
}

export async function deactivateOfficeAccount(userId: string) {
    const context = await requirePermission("settings.manage");
    if (!context.activeCompany?.id) throw new Error("Active company is required.");

    const admin = createSupabaseAdminClient();
    const { data: existing } = await admin.from("users").select("*").eq("id", userId).maybeSingle();
    const { error } = await admin
        .from("users")
        .update({ status: "inactive", updated_at: new Date().toISOString() })
        .eq("id", userId)
        .eq("company_id", context.activeCompany.id);

    if (error) throw new Error(error.message);

    await admin.from("pin_credentials").update({ status: "revoked", updated_at: new Date().toISOString() }).eq("user_id", userId);

    await logUserAction({
        action: "office_account_deactivated",
        entityType: "user",
        entityId: userId,
        companyId: context.activeCompany.id,
        beforeData: existing,
        afterData: { status: "inactive", pin_status: "revoked" },
    });

    revalidatePath("/office/admin");
}

export async function reactivateOfficeAccount(userId: string) {
    const context = await requirePermission("settings.manage");
    if (!context.activeCompany?.id) throw new Error("Active company is required.");

    const admin = createSupabaseAdminClient();
    const { data: existing } = await admin.from("users").select("*").eq("id", userId).maybeSingle();
    const { error } = await admin
        .from("users")
        .update({ status: "active", updated_at: new Date().toISOString() })
        .eq("id", userId)
        .eq("company_id", context.activeCompany.id);

    if (error) throw new Error(error.message);

    const now = new Date().toISOString();
    const { error: basePinError } = await admin
        .from("pin_credentials")
        .update({
            failed_attempts: 0,
            status: "active",
            updated_at: now,
        })
        .eq("user_id", userId);
    if (basePinError) throw new Error(basePinError.message);

    const { error: metadataError } = await admin
        .from("pin_credentials")
        .update({
            locked_at: null,
            reset_by_admin: context.profile?.id ?? null,
            reset_at: now,
            updated_at: now,
        })
        .eq("user_id", userId);
    if (metadataError && !isPendingLockoutSchemaError(metadataError)) throw new Error(metadataError.message);

    await logUserAction({
        action: "office_account_reactivated",
        entityType: "user",
        entityId: userId,
        companyId: context.activeCompany.id,
        beforeData: existing,
        afterData: { status: "active", pin_status: "active" },
    });

    revalidatePath("/office/admin");
}

export async function createOffice(input: OfficeInput) {
    const context = await requirePermission("settings.manage");
    if (!context.activeCompany?.id) throw new Error("Active company is required.");
    const officeName = input.officeName.trim();
    if (!officeName) throw new Error("Office name is required.");

    const admin = createSupabaseAdminClient();
    const payload = {
        company_id: context.activeCompany.id,
        office_name: officeName,
        name: officeName,
        office_code: input.officeCode?.trim() || null,
        code: input.officeCode?.trim() || null,
        manager_name: input.managerName?.trim() || null,
        city: input.city?.trim() || null,
        region: input.region?.trim() || null,
        collection_target: numeric(input.collectionTarget),
        expense_budget: numeric(input.expenseBudget),
        status: input.status || "active",
        updated_at: new Date().toISOString(),
    };
    const { data, error } = await admin.from("offices").insert(payload).select("id").single();
    if (error) throw new Error(error.message);

    await logUserAction({
        action: "office_created",
        entityType: "office",
        entityId: data.id,
        companyId: context.activeCompany.id,
        officeId: data.id,
        afterData: payload,
    });

    revalidatePath("/office/admin");
    revalidatePath("/office/spreadsheet");
}

export async function updateOffice(input: UpdateOfficeInput) {
    const context = await requirePermission("settings.manage");
    if (!context.activeCompany?.id) throw new Error("Active company is required.");
    if (!input.officeId) throw new Error("Office is required.");
    const officeName = input.officeName.trim();
    if (!officeName) throw new Error("Office name is required.");

    const admin = createSupabaseAdminClient();
    const { data: existing } = await admin
        .from("offices")
        .select("*")
        .eq("id", input.officeId)
        .eq("company_id", context.activeCompany.id)
        .maybeSingle();

    const payload = {
        office_name: officeName,
        name: officeName,
        office_code: input.officeCode?.trim() || null,
        code: input.officeCode?.trim() || null,
        manager_name: input.managerName?.trim() || null,
        city: input.city?.trim() || null,
        region: input.region?.trim() || null,
        collection_target: numeric(input.collectionTarget),
        expense_budget: numeric(input.expenseBudget),
        status: input.status || "active",
        updated_at: new Date().toISOString(),
    };
    const { error } = await admin
        .from("offices")
        .update(payload)
        .eq("id", input.officeId)
        .eq("company_id", context.activeCompany.id);
    if (error) throw new Error(error.message);

    await logUserAction({
        action: payload.status === "active" ? "office_updated" : "office_status_changed",
        entityType: "office",
        entityId: input.officeId,
        companyId: context.activeCompany.id,
        officeId: input.officeId,
        beforeData: existing,
        afterData: payload,
    });

    revalidatePath("/office/admin");
    revalidatePath("/office/spreadsheet");
}

export async function deactivateOffice(officeId: string) {
    const context = await requirePermission("settings.manage");
    if (!context.activeCompany?.id) throw new Error("Active company is required.");
    if (!officeId) throw new Error("Office is required.");

    const admin = createSupabaseAdminClient();
    const { data: existing } = await admin.from("offices").select("*").eq("id", officeId).eq("company_id", context.activeCompany.id).maybeSingle();
    const { error } = await admin
        .from("offices")
        .update({ status: "inactive", updated_at: new Date().toISOString() })
        .eq("id", officeId)
        .eq("company_id", context.activeCompany.id);
    if (error) throw new Error(error.message);

    await logUserAction({
        action: "office_deactivated",
        entityType: "office",
        entityId: officeId,
        companyId: context.activeCompany.id,
        officeId,
        beforeData: existing,
        afterData: { status: "inactive" },
    });

    revalidatePath("/office/admin");
    revalidatePath("/office/spreadsheet");
}

function numeric(value: string | undefined) {
    if (!value) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}
