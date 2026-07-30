import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseBrowserEnv } from "@/lib/supabase/env";

type HealthState = "healthy" | "unhealthy";

const CHECK_TIMEOUT_MS = 4000;

function component(name: string, status: HealthState, latencyMs: number, detail?: string) {
    return {
        name,
        status,
        latencyMs,
        detail: detail ? detail.slice(0, 160) : undefined,
    };
}

async function timed<T>(operation: PromiseLike<T>, timeoutMs = CHECK_TIMEOUT_MS) {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    try {
        return await Promise.race([
            operation,
            new Promise<T>((_, reject) => {
                timeout = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
            }),
        ]);
    } finally {
        if (timeout) clearTimeout(timeout);
    }
}

async function checkFetch(name: string, url: string, headers: HeadersInit) {
    const started = Date.now();
    try {
        const response = await timed(fetch(url, { cache: "no-store", headers }), CHECK_TIMEOUT_MS);
        const healthy = response.status < 500;
        return component(name, healthy ? "healthy" : "unhealthy", Date.now() - started, `HTTP ${response.status}`);
    } catch (error) {
        return component(name, "unhealthy", Date.now() - started, error instanceof Error ? error.message : "Request failed");
    }
}

async function checkDatabase() {
    const started = Date.now();
    try {
        const db = createSupabaseAdminClient();
        const { error } = await timed<{ error: { message: string } | null }>(
            db.from("companies").select("id", { count: "exact", head: true }).limit(1),
            CHECK_TIMEOUT_MS,
        );
        if (error) return component("Database", "unhealthy", Date.now() - started, error.message);
        return component("Database", "healthy", Date.now() - started, "Connection accepted");
    } catch (error) {
        return component("Database", "unhealthy", Date.now() - started, error instanceof Error ? error.message : "Database check failed");
    }
}

export async function GET() {
    const started = Date.now();
    let auth;
    let gateway;
    let database;
    let realtime;

    try {
        const { url, anonKey } = getSupabaseBrowserEnv();
        const headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };
        [auth, gateway, database, realtime] = await Promise.all([
            checkFetch("Supabase Auth", `${url}/auth/v1/health`, headers),
            checkFetch("API Gateway", `${url}/rest/v1/`, headers),
            checkDatabase(),
            checkFetch("Realtime", `${url}/realtime/v1/`, headers),
        ]);
    } catch (error) {
        auth = component("Supabase Auth", "unhealthy", 0, "Environment unavailable");
        gateway = component("API Gateway", "unhealthy", 0, "Environment unavailable");
        database = component("Database", "unhealthy", 0, error instanceof Error ? error.message : "Health check failed");
        realtime = component("Realtime", "unhealthy", 0, "Environment unavailable");
    }

    const checks = [
        component("App", "healthy", Date.now() - started, "Route served"),
        auth,
        database,
        gateway,
        realtime,
    ];
    const healthy = checks.every((check) => check.status === "healthy");

    return NextResponse.json(
        {
            ok: healthy,
            checkedAt: new Date().toISOString(),
            checks,
        },
        { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
    );
}
