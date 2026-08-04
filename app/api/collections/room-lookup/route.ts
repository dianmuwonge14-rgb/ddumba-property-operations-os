import { NextRequest, NextResponse } from "next/server";
import { lookupPaymentRoom } from "@/lib/collections/data";
import { businessErrorResponse } from "@/lib/errors/business-response";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const room = request.nextUrl.searchParams.get("room") ?? "";
    const paymentDate = request.nextUrl.searchParams.get("paymentDate");

    try {
        const results = await lookupPaymentRoom(room, paymentDate);
        return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        return businessErrorResponse(error, "Unable to lookup room.");
    }
}
