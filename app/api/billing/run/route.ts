import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type DynamicDb = {
    from: (table: string) => any;
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

function businessDate() {
    return new Intl.DateTimeFormat("en-CA", {
        day: "2-digit",
        month: "2-digit",
        timeZone: "Africa/Kampala",
        year: "numeric",
    }).format(new Date());
}

function isAuthorized(request: NextRequest) {
    const secret = process.env.BILLING_CRON_SECRET || process.env.CRON_SECRET;
    const auth = request.headers.get("authorization") ?? "";
    const vercelCron = request.headers.get("x-vercel-cron");
    if (secret && auth === `Bearer ${secret}`) return true;
    if (process.env.VERCEL === "1" && vercelCron) return true;
    return process.env.NODE_ENV !== "production";
}

export async function GET(request: NextRequest) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: "Unauthorized billing scheduler request." }, { status: 401 });
    }

    const db = createSupabaseAdminClient() as unknown as DynamicDb;
    const date = request.nextUrl.searchParams.get("date")?.slice(0, 10) || businessDate();
    const { data: companies, error } = await db.from("companies").select("id, name").order("created_at", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const results = [];
    for (const company of companies ?? []) {
        const companyId = String(company.id ?? "");
        if (!companyId) continue;
        const result = await db.rpc("run_monthly_rent_rollover", {
            p_business_date: date,
            p_company_id: companyId,
            p_office_id: null,
            p_run_type: "scheduled_hourly",
            p_triggered_by: null,
        });
        results.push({
            companyId,
            companyName: company.name ?? null,
            error: result.error?.message ?? null,
            result: result.data ?? null,
        });
    }

    const failed = results.filter((row) => row.error);
    return NextResponse.json({
        businessDate: date,
        failed: failed.length,
        ok: failed.length === 0,
        results,
    }, { status: failed.length ? 207 : 200 });
}
