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
    confirmPin?: string;
    officeId: string;
    roleId: string;
    accountType?: "office" | "admin";
    status?: string;
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

type OfficeWithLoginInput = OfficeInput & {
    loginName: string;
    pin: string;
    confirmPin: string;
    loginEmail?: string;
    requirePasswordChange?: boolean;
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

function assertOfficePin(pin: string) {
    if (!/^\d{6}$/.test(pin)) {
        throw new Error("PIN must contain exactly six digits.");
    }
}

function normalizeCode(value: string) {
    return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function suggestedLoginEmail(loginName: string, companyId: string) {
    const safe = loginName.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, ".").replace(/^\.+|\.+$/g, "") || `office-${Date.now()}`;
    return `${safe}+${companyId.slice(0, 8)}@ddumba.local`;
}

function isPendingLockoutSchemaError(error: { message?: string } | null) {
    return Boolean(error?.message?.match(/admin_visible_pin|failed_login_attempts|is_locked|locked_at|reset_at|reset_by_admin|schema cache/i));
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
            failed_login_attempts: 0,
            is_locked: status === "locked",
            locked_at: status === "locked" ? now : null,
            reset_at: now,
            reset_by_admin: resetByAdmin ?? null,
            status,
            updated_at: now,
        })
        .eq("user_id", userId);
    if (metadataError && !isPendingLockoutSchemaError(metadataError)) throw new Error(metadataError.message);
}

async function ignoreCleanupError(operation: PromiseLike<unknown>) {
    try {
        await operation;
    } catch {
        // Best-effort rollback cleanup. The original creation error is rethrown below.
    }
}

async function roleScope(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, roleId: string) {
    const { data } = await supabase.from("roles").select("key").eq("id", roleId).maybeSingle();
    return ["company_admin", "super_admin", "hq_executive"].includes(data?.key ?? "") ? "company" : "office";
}

async function defaultOfficeRoleId(companyId: string) {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
        .from("roles")
        .select("id, company_id")
        .eq("key", "office_manager")
        .or(`company_id.eq.${companyId},company_id.is.null`)
        .order("company_id", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
    if (error) throw new Error(error.message);
    return data?.id ?? null;
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
    if (typeof input.confirmPin === "string" && input.pin.trim() !== input.confirmPin.trim()) {
        throw new Error("PIN confirmation does not match.");
    }
    assertOfficePin(input.pin);

    const loginName = input.fullName.trim();
    const email = input.email.trim().toLowerCase() || suggestedLoginEmail(loginName, context.activeCompany.id);
    const accountType = input.accountType ?? "office";
    const status = input.status || "active";
    if (!loginName) throw new Error("Account name is required.");
    if (!input.officeId || !input.roleId) throw new Error("Office and role are required.");

    const admin = createSupabaseAdminClient();
    const supabase = await createSupabaseServerClient();
    const [{ data: existingEmail }, { data: existingLoginName }] = await Promise.all([
        admin.from("users").select("id").eq("company_id", context.activeCompany.id).eq("email", email).limit(1).maybeSingle(),
        admin.from("users").select("id").eq("company_id", context.activeCompany.id).ilike("full_name", loginName).limit(1).maybeSingle(),
    ]);
    if (existingEmail?.id || existingLoginName?.id) throw new Error("Login name already exists.");

    const { data: authUser, error: authError } = await admin.auth.admin.createUser({
        email,
        password: input.pin,
        email_confirm: true,
        user_metadata: {
            full_name: loginName,
            default_office_id: input.officeId,
            account_type: accountType,
            login_name: loginName,
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
        full_name: loginName,
        account_type: accountType,
        status,
        updated_at: new Date().toISOString(),
    });

    if (userError) throw new Error(userError.message);

    await setPinCredential(authUser.user.id, input.pin, status === "locked" ? "locked" : "active", context.profile?.id ?? null);
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
        metadata: { account_type: accountType, role_id: input.roleId, created_by: context.profile?.id ?? null },
    });

    await logUserAction({
        action: "office_account_created",
        entityType: "user",
        entityId: authUser.user.id,
        companyId: context.activeCompany.id,
        officeId: input.officeId,
        afterData: { email, full_name: loginName, role_id: input.roleId },
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
            failed_login_attempts: 0,
            is_locked: false,
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

export async function createOfficeWithLogin(input: OfficeWithLoginInput) {
    const context = await requirePermission("settings.manage");
    if (!context.activeCompany?.id) throw new Error("Active company is required.");
    const companyId = context.activeCompany.id;
    const officeName = input.officeName.trim();
    const loginName = input.loginName.trim();
    const pin = input.pin.trim();
    const confirmPin = input.confirmPin.trim();
    const officeCode = normalizeCode(input.officeCode || officeName);
    if (!officeName) throw new Error("Office name is required.");
    if (!officeCode) throw new Error("Office code is required.");
    if (!loginName) throw new Error("Office login name is required.");
    if (pin !== confirmPin) throw new Error("PIN confirmation does not match.");
    assertOfficePin(pin);

    const admin = createSupabaseAdminClient();
    const supabase = await createSupabaseServerClient();
    const loginEmail = (input.loginEmail?.trim().toLowerCase() || suggestedLoginEmail(loginName, companyId));
    const now = new Date().toISOString();
    let createdOfficeId: string | null = null;
    let createdUserId: string | null = null;

    const [{ data: existingOfficeByName }, { data: existingOfficeByCode }, { data: existingUserByEmail }, { data: existingUserByLogin }] = await Promise.all([
        admin.from("offices").select("id, office_name, name").eq("company_id", companyId).ilike("office_name", officeName).limit(1).maybeSingle(),
        admin.from("offices").select("id, office_name, name").eq("company_id", companyId).or(`office_code.eq.${officeCode},code.eq.${officeCode}`).limit(1).maybeSingle(),
        admin.from("users").select("id").eq("company_id", companyId).eq("email", loginEmail).limit(1).maybeSingle(),
        admin.from("users").select("id").eq("company_id", companyId).ilike("full_name", loginName).limit(1).maybeSingle(),
    ]);
    const existingOffice = existingOfficeByName ?? existingOfficeByCode ?? null;
    if (existingOffice?.id) {
        const [{ data: officeUsers }, { data: officeRoles }] = await Promise.all([
            admin.from("users").select("id").eq("company_id", companyId).eq("default_office_id", existingOffice.id),
            admin.from("user_office_roles").select("id").eq("company_id", companyId).eq("office_id", existingOffice.id),
        ]);
        const userIds = (officeUsers ?? []).map((user) => user.id);
        const { data: pins } = userIds.length
            ? await admin.from("pin_credentials").select("id, status").in("user_id", userIds)
            : { data: [] as Array<{ id: string; status: string | null }> };
        const incomplete = !officeUsers?.length || !officeRoles?.length || !(pins ?? []).some((pin) => pin.status !== "revoked");
        if (incomplete) {
            throw new Error("Incomplete office setup already exists. Open Incomplete Setups and complete the login instead.");
        }
    }
    if (existingOfficeByName?.id) throw new Error("Office name already exists.");
    if (existingOfficeByCode?.id) throw new Error("Office code already exists.");
    if (existingUserByEmail?.id || existingUserByLogin?.id) throw new Error("Login name already exists.");

    try {
        const officePayload = {
            company_id: companyId,
            office_name: officeName,
            name: officeName,
            office_code: officeCode,
            code: officeCode,
            manager_name: input.managerName?.trim() || null,
            city: input.city?.trim() || null,
            region: input.region?.trim() || null,
            collection_target: numeric(input.collectionTarget),
            expense_budget: numeric(input.expenseBudget),
            status: input.status || "active",
            created_at: now,
            updated_at: now,
        };
        const { data: office, error: officeError } = await admin.from("offices").insert(officePayload).select("id").single();
        if (officeError || !office?.id) throw new Error(officeError?.message ?? "Office was not created because office setup failed.");
        createdOfficeId = office.id;

        const fallbackRoleId = await defaultOfficeRoleId(companyId) ?? "";
        if (!fallbackRoleId) throw new Error("Office Manager role is missing. Apply default roles migration first.");

        const { data: authUser, error: authError } = await admin.auth.admin.createUser({
            email: loginEmail,
            password: pin,
            email_confirm: true,
            user_metadata: {
                account_type: "office",
                default_office_id: createdOfficeId,
                full_name: loginName,
                login_name: loginName,
                require_password_change: Boolean(input.requirePasswordChange),
            },
        });
        if (authError || !authUser.user) throw new Error(authError?.message ?? "Office was not created because login setup failed.");
        createdUserId = authUser.user.id;

        const userPayload = {
            account_type: "office",
            company_id: companyId,
            default_office_id: createdOfficeId,
            email: loginEmail,
            full_name: loginName,
            status: "active",
            updated_at: now,
        };
        const { error: userError } = await admin.from("users").upsert({ id: createdUserId, ...userPayload });
        if (userError) throw new Error(userError.message);

        await setPinCredential(createdUserId, pin, "active", context.profile?.id ?? null);
        await assignRole({
            companyId,
            officeId: createdOfficeId,
            roleId: fallbackRoleId,
            scope: await roleScope(supabase, fallbackRoleId),
            userId: createdUserId,
        });

        await Promise.allSettled([
            admin.from("security_events").insert({
                company_id: companyId,
                office_id: createdOfficeId,
                user_id: createdUserId,
                event_type: "office_created_with_login",
                severity: "info",
                metadata: {
                    created_by: context.profile?.id ?? null,
                    login_name: loginName,
                    office_code: officeCode,
                    require_password_change: Boolean(input.requirePasswordChange),
                },
            }),
            logUserAction({
                action: "office_created_with_login",
                entityType: "office",
                entityId: createdOfficeId,
                companyId,
                officeId: createdOfficeId,
                afterData: { ...officePayload, login_name: loginName, login_email: loginEmail, user_id: createdUserId },
            }),
        ]);

        revalidatePath("/office/admin");
        revalidatePath("/office/ceo");
        revalidatePath("/office/spreadsheet");
        return {
            officeId: createdOfficeId,
            officeName,
            officeCode,
            loginName,
            loginEmail,
            status: officePayload.status,
            createdAt: now,
            createdBy: context.profile?.full_name ?? context.profile?.email ?? "Admin",
        };
    } catch (error) {
        console.error("createOfficeWithLogin failed", {
            message: error instanceof Error ? error.message : String(error),
            officeName,
            officeCode,
            loginName,
            createdOfficeId,
            createdUserId,
        });
        if (createdUserId) {
            await admin.auth.admin.deleteUser(createdUserId).catch(() => undefined);
            await ignoreCleanupError(admin.from("users").delete().eq("id", createdUserId));
            await ignoreCleanupError(admin.from("pin_credentials").delete().eq("user_id", createdUserId));
            await ignoreCleanupError(admin.from("user_office_roles").delete().eq("user_id", createdUserId));
        }
        if (createdOfficeId) {
            await ignoreCleanupError(admin.from("offices").delete().eq("id", createdOfficeId).eq("company_id", companyId));
        }
        throw error instanceof Error ? error : new Error("Office was not created because login setup failed.");
    }
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
