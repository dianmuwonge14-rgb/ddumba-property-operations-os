import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { ACTIVE_COMPANY_COOKIE, ACTIVE_OFFICE_COOKIE, AUTH_MODE_COOKIE } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type LoginIdentity = {
    user_id: string;
    email: string;
    company_id: string;
    office_id: string | null;
    full_name: string;
    office_name?: string | null;
    is_company_admin: boolean;
    auth_mode: "admin" | "office";
    redirect_to: string;
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
    if (!identity?.email) {
        return NextResponse.json({ error: "Invalid PIN/password." }, { status: 401 });
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
        email: identity.email,
        password: secret,
    });

    if (signInError) {
        return NextResponse.json({ error: "Credential verified, but Supabase Auth rejected the account password. Reset this account password/PIN from Administration." }, { status: 401 });
    }

    cookieStore.set(ACTIVE_COMPANY_COOKIE, identity.company_id, officeCookieOptions);
    cookieStore.set(AUTH_MODE_COOKIE, identity.auth_mode, officeCookieOptions);
    if (identity.auth_mode === "office" && identity.office_id) {
        cookieStore.set(ACTIVE_OFFICE_COOKIE, identity.office_id, officeCookieOptions);
    } else {
        cookieStore.delete(ACTIVE_OFFICE_COOKIE);
    }

    const isAdmin = identity.auth_mode === "admin";

    return NextResponse.json({
        ok: true,
        message: isAdmin ? "Logged into Admin Account" : `Logged into ${identity.office_name ?? "Office"}`,
        user: {
            id: identity.user_id,
            name: isAdmin ? "Admin Account" : identity.full_name,
            isCompanyAdmin: isAdmin || identity.is_company_admin,
        },
        office: {
            id: identity.office_id,
            name: identity.office_name ?? "Office",
        },
        redirectTo: identity.redirect_to ?? (isAdmin ? "/office/admin" : "/office"),
    });
}
