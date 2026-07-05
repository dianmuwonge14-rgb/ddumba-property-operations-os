import { NextRequest, NextResponse } from "next/server";
import { lookupPaymentRoom } from "@/lib/collections/data";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const room = request.nextUrl.searchParams.get("room") ?? "";
    const paymentDate = request.nextUrl.searchParams.get("paymentDate");

    try {
        const results = await lookupPaymentRoom(room, paymentDate);
        return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to lookup room.";
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
