import { NextRequest, NextResponse } from "next/server";
import { getExpenseBalanceReportData } from "@/lib/expenses/data";
import type { ExpenseBalanceFilters } from "@/lib/expenses/types";

export const dynamic = "force-dynamic";

function readFilters(request: NextRequest): ExpenseBalanceFilters {
    const search = request.nextUrl.searchParams;
    return {
        mode: (search.get("mode") as ExpenseBalanceFilters["mode"]) ?? undefined,
        singleDate: search.get("singleDate") ?? undefined,
        startDate: search.get("startDate") ?? undefined,
        endDate: search.get("endDate") ?? undefined,
        singleMonth: search.get("singleMonth") ?? undefined,
        startMonth: search.get("startMonth") ?? undefined,
        endMonth: search.get("endMonth") ?? undefined,
        officeId: search.get("officeId") || null,
    };
}

export async function GET(request: NextRequest) {
    try {
        const report = await getExpenseBalanceReportData(readFilters(request));
        return NextResponse.json({ report }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Expense balance report could not load." },
            { status: 400 },
        );
    }
}
