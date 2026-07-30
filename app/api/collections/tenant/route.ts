import { NextRequest, NextResponse } from "next/server";
import { getTenantCollectionContext } from "@/lib/collections/data";

export async function GET(request: NextRequest) {
    const tenantId = request.nextUrl.searchParams.get("id") ?? "";
    const paymentDate = request.nextUrl.searchParams.get("paymentDate");

    if (!tenantId) {
        return NextResponse.json({ error: "Tenant id is required." }, { status: 400 });
    }

    try {
        const startedAt = performance.now();
        const result = await getTenantCollectionContext(tenantId, paymentDate);
        const totalMs = performance.now() - startedAt;
        return NextResponse.json(
            { result },
            {
                headers: {
                    "Cache-Control": "no-store",
                    "Server-Timing": `tenant-detail;dur=${totalMs.toFixed(1)}`,
                    "X-Ddumba-Tenant-Detail-Duration-Ms": totalMs.toFixed(1),
                },
            },
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to open tenant.";
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
