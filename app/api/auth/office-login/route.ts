import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { ACTIVE_COMPANY_COOKIE, ACTIVE_OFFICE_COOKIE, AUTH_MODE_COOKIE } from "@/lib/auth/context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type LoginIdentity = {
    user_id: string | null;
    email: string | null;
    company_id: string | null;
    office_id: string | null;
    full_name: string | null;
    office_name?: string | null;
    is_company_admin: boolean;
    auth_mode: "admin" | "office" | "collector" | null;
    redirect_to: string | null;
    login_status?: "success" | "invalid" | "invalid_limit" | "locked";
    attempts_remaining?: number | null;
    locked?: boolean | null;
};

type VerifyPinRpc = (
    fn: "ddumba_v1_verify_unified_login",
    args: { p_secret: string; p_user_agent: string | null },
) => Promise<{ data: LoginIdentity[] | null; error: { message: string } | null }>;

const officeCookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
};

function clearSupabaseAuthCookies(cookieStore: Awaited<ReturnType<typeof cookies>>) {
    for (const cookie of cookieStore.getAll()) {
        if (
            cookie.name.startsWith("sb-") ||
            cookie.name.includes("supabase") ||
            cookie.name.includes("auth-token")
        ) {
            cookieStore.delete(cookie.name);
        }
    }
}

async function recordIdentifiedAuthFailure(identity: LoginIdentity, userAgent: string | null) {
    if (!identity.user_id || !identity.company_id) return 2;

    const admin = createSupabaseAdminClient();
    const { data: pin } = await admin
        .from("pin_credentials")
        .select("id, failed_attempts, status")
        .eq("user_id", identity.user_id)
        .maybeSingle();

    const nextAttempts = Math.min(3, (pin?.failed_attempts ?? 0) + 1);
    const shouldLock = nextAttempts >= 3;
    const now = new Date().toISOString();

    if (pin?.id) {
        await admin
            .from("pin_credentials")
            .update({
                failed_attempts: nextAttempts,
                status: shouldLock ? "locked" : (pin.status ?? "active"),
                locked_at: shouldLock ? now : null,
                updated_at: now,
            })
            .eq("id", pin.id);
    }

    await admin.from("security_events").insert({
        company_id: identity.company_id,
        office_id: identity.office_id,
        user_id: identity.user_id,
        event_type: shouldLock ? "login_account_locked" : "login_failed",
        severity: shouldLock ? "critical" : "warning",
        user_agent: userAgent,
        metadata: {
            reason: "supabase_auth_rejected_verified_credential",
            failed_attempts: nextAttempts,
        },
    });

    await admin.from("audit_logs").insert({
        company_id: identity.company_id,
        office_id: identity.office_id,
        actor_id: identity.user_id,
        action: shouldLock ? "account_locked" : "login_failed",
        entity_type: "pin_credential",
        entity_id: pin?.id ?? null,
        after_data: {
            failed_attempts: nextAttempts,
            locked: shouldLock,
        },
        user_agent: userAgent,
    });

    return Math.max(0, 3 - nextAttempts);
}

export async function POST(request: Request) {
    const body = await request.json().catch(() => null);
    const secret = typeof body?.pin === "string" ? body.pin.trim() : "";

    if (secret.length < 4 || secret.length > 64) {
        return NextResponse.json({ error: "Enter a valid PIN/password." }, { status: 400 });
    }

    const cookieStore = await cookies();
    clearSupabaseAuthCookies(cookieStore);

    const supabase = await createSupabaseServerClient();
    const headerStore = await headers();
    const rpc = supabase.rpc.bind(supabase) as unknown as VerifyPinRpc;
    const { data, error } = await rpc("ddumba_v1_verify_unified_login", {
        p_secret: secret,
        p_user_agent: headerStore.get("user-agent"),
    });

    if (error) {
        const duplicate = error.message.includes("Duplicate office PIN detected");
        return NextResponse.json({ error: error.message }, { status: duplicate ? 409 : 500 });
    }

    const identity = data?.[0];
    const loginStatus = identity?.login_status ?? (identity?.email ? "success" : "invalid");
    const attemptsRemaining = Math.max(0, identity?.attempts_remaining ?? 2);

    if (loginStatus === "locked" || identity?.locked) {
        return NextResponse.json(
            {
                error: "Account locked after 3 failed attempts. Please contact admin for password reset.",
                attemptsRemaining: 0,
                locked: true,
            },
            { status: 423 },
        );
    }

    if (!identity?.email || loginStatus === "invalid" || loginStatus === "invalid_limit") {
        const message = attemptsRemaining > 0
            ? `Wrong password. You have ${attemptsRemaining} attempt${attemptsRemaining === 1 ? "" : "s"} remaining.`
            : "Account locked after 3 failed attempts. Please contact admin for password reset.";
        return NextResponse.json(
            {
                error: message,
                attemptsRemaining,
                locked: attemptsRemaining === 0,
            },
            { status: attemptsRemaining === 0 ? 423 : 401 },
        );
    }

    if (!identity.user_id || !identity.company_id || !identity.auth_mode) {
        return NextResponse.json({ error: "Login profile is incomplete. Contact Admin." }, { status: 500 });
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
        email: identity.email,
        password: secret,
    });

    if (signInError) {
        const remaining = await recordIdentifiedAuthFailure(identity, headerStore.get("user-agent"));
        const message = remaining > 0
            ? `Wrong password. You have ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
            : "Account locked after 3 failed attempts. Please contact admin for password reset.";
        return NextResponse.json(
            {
                error: message,
                attemptsRemaining: remaining,
                locked: remaining === 0,
            },
            { status: remaining === 0 ? 423 : 401 },
        );
    }

    cookieStore.set(ACTIVE_COMPANY_COOKIE, identity.company_id, officeCookieOptions);
    cookieStore.set(AUTH_MODE_COOKIE, identity.auth_mode, officeCookieOptions);
    if (identity.auth_mode === "office" && identity.office_id) {
        cookieStore.set(ACTIVE_OFFICE_COOKIE, identity.office_id, officeCookieOptions);
    } else {
        cookieStore.delete(ACTIVE_OFFICE_COOKIE);
    }

    const isAdmin = identity.auth_mode === "admin";
    const isCollector = identity.auth_mode === "collector";

    return NextResponse.json({
        ok: true,
        message: isAdmin ? "Logged into Admin Account" : isCollector ? `Logged into ${identity.full_name ?? "Field Collector"}` : `Logged into ${identity.office_name ?? "Office"}`,
        user: {
            id: identity.user_id,
            name: isAdmin ? "Admin Account" : (identity.full_name ?? (isCollector ? "Field Collector" : "Office Account")),
            isCompanyAdmin: isAdmin || identity.is_company_admin,
        },
        office: {
            id: identity.office_id,
            name: identity.office_name ?? "Office",
        },
        redirectTo: identity.redirect_to ?? (isAdmin ? "/office/admin" : isCollector ? "/office/collector" : "/office"),
    });
}
