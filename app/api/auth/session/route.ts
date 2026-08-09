import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { ACTIVE_COMPANY_COOKIE, ACTIVE_OFFICE_COOKIE, AUTH_MODE_COOKIE, clearSessionCookies, SESSION_CONTROLLED_COOKIE, SESSION_DEVICE_COOKIE, SESSION_EXPIRES_COOKIE, setSessionCookies } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

async function clearAuthenticatedSession(reason: string) {
    const cookieStore = await cookies();
    const supabase = await createSupabaseServerClient();
    const headerStore = await headers();
    const { data: userResult } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
    const user = userResult.user;

    if (user?.id) {
        const { data: profile } = await supabase
            .from("users")
            .select("id,company_id,default_office_id")
            .eq("id", user.id)
            .maybeSingle();

        if (profile?.company_id) {
            try {
                await supabase.from("security_events").insert({
                    company_id: profile.company_id,
                    office_id: profile.default_office_id ?? null,
                    user_id: profile.id,
                    event_type: reason === "timeout" ? "automatic_timeout_logout" : "logout",
                    severity: "info",
                    user_agent: headerStore.get("user-agent"),
                    metadata: {
                        device_id: cookieStore.get(SESSION_DEVICE_COOKIE)?.value ?? null,
                        reason,
                    },
                });
            } catch {
                // Timeout cleanup should not fail if audit logging is temporarily unavailable.
            }
        }
    }

    await supabase.auth.signOut().catch(() => null);
    cookieStore.delete(ACTIVE_COMPANY_COOKIE);
    cookieStore.delete(ACTIVE_OFFICE_COOKIE);
    cookieStore.delete(AUTH_MODE_COOKIE);
    clearSessionCookies(cookieStore);
    clearSupabaseAuthCookies(cookieStore);
}

export async function GET() {
    const cookieStore = await cookies();
    const expiresAt = Number(cookieStore.get(SESSION_EXPIRES_COOKIE)?.value ?? 0);
    const hasControlledSession = cookieStore.get(SESSION_CONTROLLED_COOKIE)?.value === "1";
    const expired = Boolean((hasControlledSession && !expiresAt) || (expiresAt && expiresAt <= Date.now()));
    if (expired) {
        await clearAuthenticatedSession("timeout");
        return NextResponse.json({ authenticated: false, expired: true }, { status: 401 });
    }
    return NextResponse.json({
        authenticated: true,
        expiresAt: expiresAt || null,
        durationMinutes: 60,
    });
}

export async function POST(request: Request) {
    const body = await request.json().catch(() => ({}));
    const reason = typeof body?.reason === "string" ? body.reason : "activity";
    const cookieStore = await cookies();
    const expiresAt = Number(cookieStore.get(SESSION_EXPIRES_COOKIE)?.value ?? 0);
    const hasControlledSession = cookieStore.get(SESSION_CONTROLLED_COOKIE)?.value === "1";
    const supabase = await createSupabaseServerClient();
    const { data: userResult } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));

    if (!userResult.user || (hasControlledSession && !expiresAt) || (expiresAt && expiresAt <= Date.now())) {
        await clearAuthenticatedSession("timeout");
        return NextResponse.json({ authenticated: false, expired: true }, { status: 401 });
    }

    const session = setSessionCookies(cookieStore);

    if (reason === "continue_session") {
        const headerStore = await headers();
        const { data: profile } = await supabase
            .from("users")
            .select("id,company_id,default_office_id")
            .eq("id", userResult.user.id)
            .maybeSingle();

        if (profile?.company_id) {
            try {
                await supabase.from("security_events").insert({
                    company_id: profile.company_id,
                    office_id: profile.default_office_id ?? null,
                    user_id: profile.id,
                    event_type: "session_refresh",
                    severity: "info",
                    user_agent: headerStore.get("user-agent"),
                    metadata: {
                        device_id: session.deviceId,
                        session_expires_at: new Date(session.expiresAt).toISOString(),
                        reason,
                    },
                });
            } catch {
                // Session refresh should not fail if audit logging is temporarily unavailable.
            }
        }
    }

    return NextResponse.json({
        authenticated: true,
        expiresAt: session.expiresAt,
        durationMinutes: 60,
    });
}

export async function DELETE() {
    await clearAuthenticatedSession("timeout");
    return NextResponse.json({ authenticated: false, expired: true });
}
