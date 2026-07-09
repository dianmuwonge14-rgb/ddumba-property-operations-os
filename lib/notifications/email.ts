import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Db = {
    from: (table: string) => any;
};

type NotificationInsert = {
    action_url?: string | null;
    channel?: string | null;
    company_id: string;
    delivery_status?: string | null;
    entity_id?: string | null;
    entity_type?: string | null;
    is_read?: boolean | null;
    message: string;
    office_id?: string | null;
    recipient_type: string;
    recipient_id?: string | null;
    recipient_user_id?: string | null;
    severity?: string | null;
    title: string;
};

type NotificationRow = NotificationInsert & {
    id: string;
    created_at?: string | null;
};

type Recipient = {
    accountId: string;
    accountType: string;
    email: string;
};

function appUrl() {
    return process.env.NEXT_PUBLIC_APP_URL
        || process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        || process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`
        || "https://ddumba-property-operations-os-evgw.vercel.app";
}

function emailProvider() {
    return String(process.env.EMAIL_PROVIDER ?? "").trim().toLowerCase();
}

export function getNotificationEmailProviderStatus() {
    const provider = emailProvider();
    if (provider === "resend") {
        return {
            configured: Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM_ADDRESS),
            provider: "resend",
            required: "RESEND_API_KEY and EMAIL_FROM_ADDRESS",
        };
    }
    if (provider === "sendgrid") {
        return {
            configured: Boolean(process.env.SENDGRID_API_KEY && process.env.EMAIL_FROM_ADDRESS),
            provider: "sendgrid",
            required: "SENDGRID_API_KEY and EMAIL_FROM_ADDRESS",
        };
    }
    return {
        configured: false,
        provider: provider || "not_configured",
        required: "EMAIL_PROVIDER=resend with RESEND_API_KEY, or EMAIL_PROVIDER=sendgrid with SENDGRID_API_KEY, plus EMAIL_FROM_ADDRESS",
    };
}

function absoluteActionUrl(actionUrl: string | null | undefined) {
    if (!actionUrl) return `${appUrl()}/office/notifications`;
    if (/^https?:\/\//i.test(actionUrl)) return actionUrl;
    return `${appUrl()}${actionUrl.startsWith("/") ? actionUrl : `/${actionUrl}`}`;
}

function escapeHtml(value: string) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;")
        .replaceAll("'", "&#039;");
}

function emailHtml(notification: NotificationRow, contextText: string) {
    const action = absoluteActionUrl(notification.action_url);
    const date = new Intl.DateTimeFormat("en-UG", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Africa/Kampala",
    }).format(new Date(notification.created_at ?? Date.now()));
    return `
        <div style="font-family:Inter,Arial,sans-serif;background:#0f172a;padding:24px;color:#e5e7eb">
            <div style="max-width:640px;margin:auto;background:#111827;border:1px solid #334155;border-radius:18px;overflow:hidden">
                <div style="padding:20px 24px;background:linear-gradient(135deg,#0f172a,#1d4ed8)">
                    <p style="margin:0;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#bfdbfe">DDUMBA OS Notification</p>
                    <h1 style="margin:8px 0 0;font-size:24px;line-height:1.2;color:white">${escapeHtml(notification.title)}</h1>
                </div>
                <div style="padding:24px">
                    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#f8fafc">${escapeHtml(notification.message)}</p>
                    <table style="width:100%;border-collapse:collapse;margin:18px 0;color:#cbd5e1;font-size:13px">
                        <tr><td style="padding:8px;border-bottom:1px solid #1f2937;font-weight:700">Context</td><td style="padding:8px;border-bottom:1px solid #1f2937">${escapeHtml(contextText)}</td></tr>
                        <tr><td style="padding:8px;border-bottom:1px solid #1f2937;font-weight:700">Date / time</td><td style="padding:8px;border-bottom:1px solid #1f2937">${escapeHtml(date)}</td></tr>
                        <tr><td style="padding:8px;border-bottom:1px solid #1f2937;font-weight:700">Severity</td><td style="padding:8px;border-bottom:1px solid #1f2937">${escapeHtml(String(notification.severity ?? "information"))}</td></tr>
                    </table>
                    <a href="${escapeHtml(action)}" style="display:inline-block;background:#2563eb;color:white;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:800">Open in DDUMBA OS</a>
                    <p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#94a3b8">This email mirrors an in-app notification. If email delivery fails, DDUMBA OS still keeps the original in-app notification.</p>
                </div>
            </div>
        </div>
    `;
}

async function safeUpdateNotification(db: Db, id: string, values: Record<string, unknown>) {
    const { error } = await db.from("notifications").update(values).eq("id", id);
    if (error && !/schema cache|column .* does not exist|Could not find/i.test(error.message ?? "")) throw new Error(error.message);
}

async function insertEmailLog(db: Db, input: {
    accountId: string | null;
    accountType: string | null;
    companyId: string;
    email: string | null;
    error?: string | null;
    notificationId: string;
    provider: string;
    providerMessageId?: string | null;
    status: "pending" | "sent" | "failed" | "skipped";
}) {
    const { error } = await db.from("notification_email_logs").insert({
        account_id: input.accountId,
        account_type: input.accountType,
        company_id: input.companyId,
        email_status: input.status,
        error_message: input.error ?? null,
        notification_email: input.email,
        notification_id: input.notificationId,
        provider: input.provider,
        provider_message_id: input.providerMessageId ?? null,
        sent_at: input.status === "sent" ? new Date().toISOString() : null,
    });
    if (error && !/schema cache|Could not find the table|does not exist/i.test(error.message ?? "")) throw new Error(error.message);
}

async function getOfficeContext(db: Db, officeId: string | null | undefined) {
    if (!officeId) return "Company-wide";
    const { data } = await db.from("offices").select("office_name,name").eq("id", officeId).maybeSingle();
    return String(data?.office_name ?? data?.name ?? "Office");
}

async function resolveRecipients(db: Db, notification: NotificationRow): Promise<Recipient[]> {
    if (notification.recipient_user_id || notification.recipient_id) {
        const userId = String(notification.recipient_user_id ?? notification.recipient_id);
        const { data: user } = await db.from("users").select("id,company_id,email,account_type").eq("id", userId).maybeSingle();
        return user ? settingsForUsers(db, [user]) : [];
    }

    if (notification.recipient_type === "office" && notification.office_id) {
        const { data: users } = await db
            .from("users")
            .select("id,company_id,email,account_type")
            .eq("company_id", notification.company_id)
            .eq("default_office_id", notification.office_id)
            .eq("status", "active")
            .limit(20);
        return settingsForUsers(db, users ?? []);
    }

    if (notification.recipient_type === "collector") {
        const { data: users } = await db
            .from("users")
            .select("id,company_id,email,account_type")
            .eq("company_id", notification.company_id)
            .eq("account_type", "field_collector")
            .eq("status", "active")
            .limit(50);
        return settingsForUsers(db, users ?? []);
    }

    if (notification.recipient_type === "employee") {
        const { data: users } = await db
            .from("users")
            .select("id,company_id,email,account_type")
            .eq("company_id", notification.company_id)
            .eq("account_type", "employee")
            .eq("status", "active")
            .limit(50);
        return settingsForUsers(db, users ?? []);
    }

    if (notification.recipient_type === "admin") {
        const { data: roles } = await db
            .from("roles")
            .select("id")
            .eq("company_id", notification.company_id)
            .in("key", ["company_admin", "super_admin", "hq_executive"]);
        const roleIds = (roles ?? []).map((role: Record<string, unknown>) => String(role.id));
        if (!roleIds.length) return [];
        const { data: assignments } = await db
            .from("user_office_roles")
            .select("user_id")
            .eq("company_id", notification.company_id)
            .in("role_id", roleIds);
        const userIds = [...new Set((assignments ?? []).map((row: Record<string, unknown>) => String(row.user_id)).filter(Boolean))];
        if (!userIds.length) return [];
        const { data: users } = await db
            .from("users")
            .select("id,company_id,email,account_type")
            .in("id", userIds)
            .eq("status", "active")
            .limit(50);
        return settingsForUsers(db, users ?? []);
    }

    return [];
}

async function settingsForUsers(db: Db, users: Array<Record<string, unknown>>): Promise<Recipient[]> {
    const ids = users.map((user) => String(user.id)).filter(Boolean);
    if (!ids.length) return [];
    const { data: settings, error } = await db
        .from("account_notification_settings")
        .select("account_id,account_type,notification_email,email_enabled")
        .in("account_id", ids);
    const settingsByAccount = new Map((settings ?? []).map((row: Record<string, unknown>) => [String(row.account_id), row]));
    return users.flatMap((user) => {
        const accountId = String(user.id);
        const setting = settingsByAccount.get(accountId) as Record<string, unknown> | undefined;
        const email = String(setting?.notification_email ?? user.email ?? "").trim();
        const enabled = setting ? setting.email_enabled !== false : true;
        if (!email || !email.includes("@") || !enabled) return [];
        return [{
            accountId,
            accountType: String(setting?.account_type ?? user.account_type ?? "office"),
            email,
        }];
    });
}

async function sendEmail(input: { html: string; subject: string; to: string }) {
    const status = getNotificationEmailProviderStatus();
    if (!status.configured) {
        return { error: `Email provider not configured. Required: ${status.required}`, id: null, provider: status.provider };
    }
    if (status.provider === "resend") {
        const response = await fetch("https://api.resend.com/emails", {
            body: JSON.stringify({
                from: process.env.EMAIL_FROM_ADDRESS,
                html: input.html,
                subject: input.subject,
                to: [input.to],
            }),
            headers: {
                Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
                "Content-Type": "application/json",
            },
            method: "POST",
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) return { error: String(body?.message ?? response.statusText), id: null, provider: "resend" };
        return { error: null, id: String(body?.id ?? ""), provider: "resend" };
    }
    if (status.provider === "sendgrid") {
        const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
            body: JSON.stringify({
                content: [{ type: "text/html", value: input.html }],
                from: { email: process.env.EMAIL_FROM_ADDRESS },
                personalizations: [{ to: [{ email: input.to }] }],
                subject: input.subject,
            }),
            headers: {
                Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
                "Content-Type": "application/json",
            },
            method: "POST",
        });
        if (!response.ok) {
            const body = await response.text().catch(() => response.statusText);
            return { error: body, id: null, provider: "sendgrid" };
        }
        return { error: null, id: response.headers.get("x-message-id") ?? "", provider: "sendgrid" };
    }
    return { error: `Unsupported EMAIL_PROVIDER: ${status.provider}`, id: null, provider: status.provider };
}

export async function dispatchNotificationEmail(notification: NotificationRow, dbArg?: Db) {
    const db = dbArg ?? createSupabaseAdminClient() as unknown as Db;
    const providerStatus = getNotificationEmailProviderStatus();
    const recipients = await resolveRecipients(db, notification);
    if (!recipients.length) {
        await insertEmailLog(db, {
            accountId: null,
            accountType: notification.recipient_type,
            companyId: notification.company_id,
            email: null,
            error: "No notification email recipient found.",
            notificationId: notification.id,
            provider: providerStatus.provider,
            status: "skipped",
        });
        await safeUpdateNotification(db, notification.id, {
            email_attempted_at: new Date().toISOString(),
            email_delivery_status: "skipped",
            email_error_message: "No notification email recipient found.",
        });
        return;
    }

    await safeUpdateNotification(db, notification.id, {
        email_attempted_at: new Date().toISOString(),
        email_delivery_status: "pending",
    });

    const contextText = await getOfficeContext(db, notification.office_id);
    let sent = 0;
    let lastError: string | null = null;
    for (const recipient of recipients) {
        const result = await sendEmail({
            html: emailHtml(notification, contextText),
            subject: `DDUMBA OS: ${notification.title}`,
            to: recipient.email,
        });
        if (result.error) lastError = result.error;
        else sent += 1;
        await insertEmailLog(db, {
            accountId: recipient.accountId,
            accountType: recipient.accountType,
            companyId: notification.company_id,
            email: recipient.email,
            error: result.error,
            notificationId: notification.id,
            provider: result.provider,
            providerMessageId: result.id,
            status: result.error ? "failed" : "sent",
        });
    }

    await safeUpdateNotification(db, notification.id, {
        email_delivery_status: sent > 0 ? "sent" : "failed",
        email_error_message: sent > 0 ? null : lastError,
        email_sent_at: sent > 0 ? new Date().toISOString() : null,
    });
}

export async function createNotificationWithEmail(db: Db, row: NotificationInsert) {
    const insert = await db.from("notifications").insert(row).select("*").single();
    if (insert.error) throw new Error(insert.error.message);
    dispatchNotificationEmail(insert.data as NotificationRow, db).catch((error) => {
        console.error("Notification email dispatch failed:", error);
    });
    return insert.data as NotificationRow;
}
