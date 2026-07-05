import { NextRequest, NextResponse } from "next/server";
import { searchPromiseTenants } from "@/lib/promises/data";

export async function GET(request: NextRequest) {
    const query = request.nextUrl.searchParams.get("q") ?? "";

    try {
        const results = await searchPromiseTenants(query);
        return NextResponse.json({ results });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to search tenants.";
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
