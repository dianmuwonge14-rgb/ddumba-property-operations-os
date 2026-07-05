import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { ACTIVE_COMPANY_COOKIE, ACTIVE_OFFICE_COOKIE, AUTH_MODE_COOKIE, getAuthContext } from "@/lib/auth/context";
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

export async function POST() {
    return logoutResponse();
}

export async function GET(request: Request) {
    return logoutResponse(new URL("/", request.url));
}

async function logoutResponse(redirectToLogin: URL | null = null) {
    const headerStore = await headers();
    const supabase = await createSupabaseServerClient();
    const context = await getAuthContext().catch(() => null);

    if (context?.profile?.company_id) {
        try {
            await supabase.from("security_events").insert({
                company_id: context.profile.company_id,
                office_id: context.activeOffice?.id ?? null,
                user_id: context.profile.id,
                event_type: "logout",
                severity: "info",
                user_agent: headerStore.get("user-agent"),
                metadata: {
                    active_company_id: context.activeCompany?.id ?? null,
                    active_office_id: context.activeOffice?.id ?? null,
                    auth_mode: context.authMode,
                },
            });
        } catch {
            // Logout should not fail if audit logging is temporarily unavailable.
        }
    }

    await supabase.auth.signOut().catch(() => null);

    const cookieStore = await cookies();
    cookieStore.delete(ACTIVE_COMPANY_COOKIE);
    cookieStore.delete(ACTIVE_OFFICE_COOKIE);
    cookieStore.delete(AUTH_MODE_COOKIE);
    clearSupabaseAuthCookies(cookieStore);

    if (redirectToLogin) {
        return NextResponse.redirect(redirectToLogin);
    }

    return NextResponse.json({ ok: true });
}
