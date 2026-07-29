import { NextRequest, NextResponse } from "next/server";
import { searchFastPaymentTenants } from "@/lib/collections/data";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const startedAt = performance.now();
    const query = request.nextUrl.searchParams.get("q") ?? "";
    const paymentDate = request.nextUrl.searchParams.get("paymentDate");
    const allOfficesParam = request.nextUrl.searchParams.get("allOffices");
    const allOffices = allOfficesParam == null ? undefined : allOfficesParam === "1";
    const officeId = request.nextUrl.searchParams.get("officeId")?.trim() || undefined;

    try {
        const searchStartedAt = performance.now();
        const results = await searchFastPaymentTenants(query, paymentDate, { allOffices, officeId });
        const searchMs = performance.now() - searchStartedAt;
        const totalMs = performance.now() - startedAt;
        return NextResponse.json(
            { results },
            {
                headers: {
                    "Cache-Control": "private, max-age=10, stale-while-revalidate=20",
                    "Server-Timing": `search;dur=${searchMs.toFixed(1)}, total;dur=${totalMs.toFixed(1)}`,
                    "X-Ddumba-Search-Duration-Ms": totalMs.toFixed(1),
                },
            },
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to search tenants.";
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
