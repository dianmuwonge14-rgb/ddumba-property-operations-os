import { NextRequest, NextResponse } from "next/server";
import { searchFastPaymentTenants } from "@/lib/collections/data";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const query = request.nextUrl.searchParams.get("q") ?? "";
    const paymentDate = request.nextUrl.searchParams.get("paymentDate");
    const allOffices = request.nextUrl.searchParams.get("allOffices") === "1";

    try {
        const results = await searchFastPaymentTenants(query, paymentDate, { allOffices });
        return NextResponse.json(
            { results },
            {
                headers: {
                    "Cache-Control": "private, max-age=10, stale-while-revalidate=20",
                },
            },
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to search tenants.";
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
