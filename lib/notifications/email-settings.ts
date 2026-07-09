import { cache } from "react";
import { requireAuth, requireCompanyAdminMode } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getNotificationEmailProviderStatus } from "./email";

type Db = {
    from: (table: string) => any;
};

export type MyNotificationEmailSettings = {
    accountEmail: string | null;
    emailEnabled: boolean;
    emailVerified: boolean;
    notificationEmail: string | null;
    providerConfigured: boolean;
    providerName: string;
    providerRequired: string;
    updatedAt: string | null;
    verificationStatus: string;
};

export type AdminNotificationEmailSettingsData = {
    failedEmailCount: number;
    lastEmailSentAt: string | null;
    providerConfigured: boolean;
    providerName: string;
    providerRequired: string;
    recentLogs: Array<{
        account_id: string | null;
        account_type: string | null;
        created_at: string;
        email_status: string;
        error_message: string | null;
        notification_email: string | null;
        provider: string | null;
    }>;
    settings: Array<{
        account_id: string;
        account_type: string | null;
        email: string | null;
        email_enabled: boolean | null;
        full_name: string | null;
        notification_email: string | null;
        updated_at: string | null;
        verification_status: string | null;
    }>;
};

async function optionalRows(query: Promise<{ data: unknown[] | null; error: { message: string } | null }>) {
    const result = await query;
    if (result.error && /does not exist|schema cache|Could not find/i.test(result.error.message ?? "")) return [];
    if (result.error) throw new Error(result.error.message);
    return result.data ?? [];
}

function providerSummary() {
    const status = getNotificationEmailProviderStatus();
    return {
        providerConfigured: status.configured,
        providerName: status.provider,
        providerRequired: status.required,
    };
}

export const getMyNotificationEmailSettings = cache(async function getMyNotificationEmailSettings(): Promise<MyNotificationEmailSettings | null> {
    const context = await requireAuth();
    if (!context.activeCompany?.id || !context.profile?.id) return null;
    const db = createSupabaseAdminClient() as unknown as Db;
    const { data } = await db
        .from("account_notification_settings")
        .select("*")
        .eq("company_id", context.activeCompany.id)
        .eq("account_id", context.profile.id)
        .maybeSingle();
    return {
        accountEmail: context.profile.email ?? null,
        emailEnabled: data?.email_enabled !== false,
        emailVerified: Boolean(data?.email_verified),
        notificationEmail: data?.notification_email ?? context.profile.email ?? null,
        updatedAt: data?.updated_at ?? null,
        verificationStatus: data?.verification_status ?? (context.profile.email ? "verified" : "unverified"),
        ...providerSummary(),
    };
});

export const getAdminNotificationEmailSettingsData = cache(async function getAdminNotificationEmailSettingsData(): Promise<AdminNotificationEmailSettingsData> {
    const context = await requireCompanyAdminMode();
    if (!context.activeCompany?.id) {
        return { failedEmailCount: 0, lastEmailSentAt: null, recentLogs: [], settings: [], ...providerSummary() };
    }
    const db = createSupabaseAdminClient() as unknown as Db;
    const [usersResult, settingsRows, logRows, failedRows, sentRows] = await Promise.all([
        db.from("users").select("id,full_name,email,account_type,status").eq("company_id", context.activeCompany.id).order("full_name").limit(200),
        optionalRows(db.from("account_notification_settings").select("*").eq("company_id", context.activeCompany.id).limit(500)),
        optionalRows(db.from("notification_email_logs").select("account_id,account_type,notification_email,email_status,provider,error_message,created_at").eq("company_id", context.activeCompany.id).order("created_at", { ascending: false }).limit(12)),
        optionalRows(db.from("notification_email_logs").select("id").eq("company_id", context.activeCompany.id).eq("email_status", "failed").limit(1000)),
        optionalRows(db.from("notification_email_logs").select("sent_at,created_at").eq("company_id", context.activeCompany.id).eq("email_status", "sent").order("sent_at", { ascending: false, nullsFirst: false }).limit(1)),
    ]);
    const settingsByAccount = new Map((settingsRows as Array<Record<string, unknown>>).map((row) => [String(row.account_id), row]));
    const lastSent = (sentRows[0] ?? null) as Record<string, unknown> | null;
    return {
        failedEmailCount: failedRows.length,
        lastEmailSentAt: lastSent ? String(lastSent.sent_at ?? lastSent.created_at ?? "") || null : null,
        recentLogs: logRows as AdminNotificationEmailSettingsData["recentLogs"],
        settings: (usersResult.data ?? []).map((user: Record<string, unknown>) => {
            const setting = (settingsByAccount.get(String(user.id)) ?? {}) as Record<string, unknown>;
            return {
                account_id: String(user.id),
                account_type: String(setting?.account_type ?? user.account_type ?? "office"),
                email: user.email ? String(user.email) : null,
                email_enabled: setting?.email_enabled !== false,
                full_name: user.full_name ? String(user.full_name) : null,
                notification_email: setting?.notification_email ? String(setting.notification_email) : (user.email ? String(user.email) : null),
                updated_at: setting?.updated_at ? String(setting.updated_at) : null,
                verification_status: setting?.verification_status ? String(setting.verification_status) : (user.email ? "verified" : "unverified"),
            };
        }),
        ...providerSummary(),
    };
});
