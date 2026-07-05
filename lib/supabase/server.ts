import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database.types";
import { getSupabaseBrowserEnv } from "./env";

export async function createSupabaseServerClient() {
    const { url, anonKey } = getSupabaseBrowserEnv();
    const cookieStore = await cookies();

    return createServerClient<Database>(url, anonKey, {
        cookies: {
            getAll() {
                return cookieStore.getAll();
            },
            setAll(cookiesToSet) {
                try {
                    cookiesToSet.forEach(({ name, value, options }) => {
                        cookieStore.set(name, value, options);
                    });
                } catch {
                    // Server Components can read auth cookies but cannot always write refreshed cookies.
                }
            },
        },
    });
}
