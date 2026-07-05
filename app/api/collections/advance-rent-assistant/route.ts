import { NextRequest, NextResponse } from "next/server";
import { getAdvanceRentAssistant } from "@/lib/collections/data";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const month = request.nextUrl.searchParams.get("month");

    try {
        const items = await getAdvanceRentAssistant(month);
        return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Advance rent assistant could not load.";
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
