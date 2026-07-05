"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { getSupabaseBrowserEnv } from "./env";

let browserClient: SupabaseClient<Database> | null = null;

function wait(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function fetchWithRetry(input: RequestInfo | URL, init?: RequestInit) {
    let lastError: unknown;

    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            return await fetch(input, init);
        } catch (error) {
            lastError = error;
            await wait(250 * 2 ** attempt);
        }
    }

    throw lastError;
}

export function createSupabaseBrowserClient() {
    if (browserClient) return browserClient;

    const { url, anonKey } = getSupabaseBrowserEnv();

    browserClient = createBrowserClient<Database>(url, anonKey, {
        isSingleton: true,
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: false,
        },
        global: {
            fetch: fetchWithRetry,
        },
    });

    return browserClient;
}
