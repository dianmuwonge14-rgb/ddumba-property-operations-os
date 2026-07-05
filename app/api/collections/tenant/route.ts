import { NextRequest, NextResponse } from "next/server";
import { getTenantCollectionContext } from "@/lib/collections/data";

export async function GET(request: NextRequest) {
    const tenantId = request.nextUrl.searchParams.get("id") ?? "";

    if (!tenantId) {
        return NextResponse.json({ error: "Tenant id is required." }, { status: 400 });
    }

    try {
        const result = await getTenantCollectionContext(tenantId);
        return NextResponse.json({ result });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to open tenant.";
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
