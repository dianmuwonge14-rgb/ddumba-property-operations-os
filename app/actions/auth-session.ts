"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ACTIVE_COMPANY_COOKIE, ACTIVE_OFFICE_COOKIE, AUTH_MODE_COOKIE, getAuthContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function logout() {
    const headerStore = await headers();
    const supabase = await createSupabaseServerClient();
    const context = await getAuthContext().catch(() => null);

    if (context?.profile?.company_id) {
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
            },
        });

        await supabase.from("audit_logs").insert({
            action: "logout",
            actor_id: context.profile.id,
            company_id: context.profile.company_id,
            office_id: context.activeOffice?.id ?? null,
            entity_type: "auth_session",
            entity_id: context.profile.id,
            after_data: {
                active_company_id: context.activeCompany?.id ?? null,
                active_office_id: context.activeOffice?.id ?? null,
            },
            user_agent: headerStore.get("user-agent"),
        });
    }

    await supabase.auth.signOut().catch(() => null);

    const cookieStore = await cookies();
    cookieStore.delete(ACTIVE_COMPANY_COOKIE);
    cookieStore.delete(ACTIVE_OFFICE_COOKIE);
    cookieStore.delete(AUTH_MODE_COOKIE);

    redirect("/");
}
