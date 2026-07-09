"use server";

import { revalidatePath } from "next/cache";
import { logUserAction } from "@/lib/auth/audit";
import { requireAuth, requireCompanyAdminMode } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Db = {
    from: (table: string) => any;
};

function normalizeEmail(value: FormDataEntryValue | string | null) {
    const email = String(value ?? "").trim().toLowerCase();
    if (!email.includes("@")) throw new Error("Enter a valid notification email address.");
    return email;
}

function accountTypeFor(context: Awaited<ReturnType<typeof requireAuth>>) {
    if (context.isCompanyAdmin && !context.isOfficeMode) return "admin";
    if (context.authMode === "collector") return "field_collector";
    return context.profile?.account_type ?? context.authMode ?? "office";
}

export async function updateMyNotificationEmail(formData: FormData) {
    const context = await requireAuth();
    if (!context.activeCompany?.id || !context.profile?.id) throw new Error("Login required.");
    const email = normalizeEmail(formData.get("notificationEmail"));
    const enabled = formData.get("emailEnabled") !== "off";
    const db = createSupabaseAdminClient() as unknown as Db;
    const { error } = await db.from("account_notification_settings").upsert({
        account_id: context.profile.id,
        account_type: accountTypeFor(context),
        company_id: context.activeCompany.id,
        email_enabled: enabled,
        email_verified: true,
        notification_email: email,
        updated_at: new Date().toISOString(),
        updated_by: context.profile.id,
        verification_status: "verified",
    }, { onConflict: "company_id,account_id" });
    if (error) throw new Error(error.message);

    await logUserAction({
        action: "notification_email_updated",
        entityType: "account_notification_settings",
        entityId: context.profile.id,
        companyId: context.activeCompany.id,
        officeId: context.activeOffice?.id ?? null,
        afterData: { account_id: context.profile.id, email_enabled: enabled, notification_email: email },
    });

    revalidatePath("/office/notifications");
    revalidatePath("/office/admin/system-health");
}

export async function updateAccountNotificationEmail(formData: FormData) {
    const context = await requireCompanyAdminMode();
    if (!context.activeCompany?.id || !context.profile?.id) throw new Error("Admin login required.");
    const accountId = String(formData.get("accountId") ?? "");
    if (!accountId) throw new Error("Account is required.");
    const email = normalizeEmail(formData.get("notificationEmail"));
    const enabled = formData.get("emailEnabled") !== "off";
    const db = createSupabaseAdminClient() as unknown as Db;
    const { data: account, error: accountError } = await db
        .from("users")
        .select("id,company_id,account_type")
        .eq("company_id", context.activeCompany.id)
        .eq("id", accountId)
        .maybeSingle();
    if (accountError) throw new Error(accountError.message);
    if (!account) throw new Error("Account not found.");

    const { error } = await db.from("account_notification_settings").upsert({
        account_id: account.id,
        account_type: account.account_type ?? "office",
        company_id: context.activeCompany.id,
        email_enabled: enabled,
        email_verified: true,
        notification_email: email,
        updated_at: new Date().toISOString(),
        updated_by: context.profile.id,
        verification_status: "verified",
    }, { onConflict: "company_id,account_id" });
    if (error) throw new Error(error.message);

    await logUserAction({
        action: "admin_notification_email_updated",
        entityType: "account_notification_settings",
        entityId: account.id,
        companyId: context.activeCompany.id,
        afterData: { account_id: account.id, email_enabled: enabled, notification_email: email },
    });

    revalidatePath("/office/admin/system-health");
}
