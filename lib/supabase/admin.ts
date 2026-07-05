import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { getSupabaseServiceEnv } from "./env";

export function createSupabaseAdminClient() {
    const { url, serviceRoleKey } = getSupabaseServiceEnv();

    return createClient<Database>(url, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}
