import { NextRequest, NextResponse } from "next/server";
import { searchFastPaymentTenants } from "@/lib/collections/data";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const query = request.nextUrl.searchParams.get("q") ?? "";
    const paymentDate = request.nextUrl.searchParams.get("paymentDate");
    const allOfficesParam = request.nextUrl.searchParams.get("allOffices");
    const allOffices = allOfficesParam == null ? undefined : allOfficesParam === "1";
    const officeId = request.nextUrl.searchParams.get("officeId")?.trim() || undefined;

    try {
        const results = await searchFastPaymentTenants(query, paymentDate, { allOffices, officeId });
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
