import { NextRequest, NextResponse } from "next/server";
import { searchCollectionTenants } from "@/lib/collections/data";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const query = request.nextUrl.searchParams.get("q") ?? "";

    try {
        const results = await searchCollectionTenants(query);
        return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to search tenants.";
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
