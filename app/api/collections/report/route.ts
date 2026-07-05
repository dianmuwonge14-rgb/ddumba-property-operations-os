import { NextRequest, NextResponse } from "next/server";
import { getCollectionReportData } from "@/lib/collections/data";
import type { CollectionReportFilters } from "@/lib/collections/types";

export const dynamic = "force-dynamic";

function readFilters(request: NextRequest): CollectionReportFilters {
    const search = request.nextUrl.searchParams;
    return {
        singleDate: search.get("singleDate") ?? undefined,
        startDate: search.get("startDate") ?? undefined,
        endDate: search.get("endDate") ?? undefined,
        singleMonth: search.get("singleMonth") ?? undefined,
        startMonth: search.get("startMonth") ?? undefined,
        endMonth: search.get("endMonth") ?? undefined,
        officeId: search.get("officeId") ?? undefined,
        room: search.get("room") ?? undefined,
        tenant: search.get("tenant") ?? undefined,
        paymentMethod: search.get("paymentMethod") ?? undefined,
    };
}

export async function GET(request: NextRequest) {
    try {
        const report = await getCollectionReportData(readFilters(request));
        return NextResponse.json({ report });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Collections report could not load." },
            { status: 400 },
        );
    }
}
