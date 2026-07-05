import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext } from "./context";
import type { Database } from "@/types/database.types";

type Json = Database["public"]["Tables"]["audit_logs"]["Insert"]["after_data"];

type AuditInput = {
    action: string;
    entityType: string;
    entityId?: string | null;
    beforeData?: Json;
    afterData?: Json;
    companyId?: string;
    officeId?: string | null;
};

export async function logUserAction(input: AuditInput) {
    const context = await getAuthContext();
    const companyId = input.companyId ?? context.activeCompany?.id ?? context.profile?.company_id;

    if (!companyId) {
        return { error: "Audit log skipped: missing company context" };
    }

    const headerStore = await headers();
    const supabase = await createSupabaseServerClient();

    const { error } = await supabase.from("audit_logs").insert({
        action: input.action,
        actor_id: context.profile?.id ?? null,
        before_data: input.beforeData ?? null,
        after_data: input.afterData ?? null,
        company_id: companyId,
        entity_id: input.entityId ?? null,
        entity_type: input.entityType,
        office_id: input.officeId ?? context.activeOffice?.id ?? null,
        user_agent: headerStore.get("user-agent"),
    });

    if (error) {
        return { error: error.message };
    }

    return { error: null };
}
