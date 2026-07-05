import { NextRequest, NextResponse } from "next/server";
import { getFastPaymentRecentPayments } from "@/lib/collections/data";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const date = request.nextUrl.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
    const method = request.nextUrl.searchParams.get("method");
    const page = Number(request.nextUrl.searchParams.get("page") ?? 1);
    const pageSize = Number(request.nextUrl.searchParams.get("pageSize") ?? 25);
    const search = request.nextUrl.searchParams.get("search");

    try {
        const data = await getFastPaymentRecentPayments(date, { method, page, pageSize, search });
        return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to load recent payments.";
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
