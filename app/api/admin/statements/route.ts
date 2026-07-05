import { NextResponse } from "next/server";
import { getStatementsCentreData } from "@/lib/admin-statements/data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStoreHeaders = {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
};

export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const params = Object.fromEntries(url.searchParams.entries());
        const data = await getStatementsCentreData(params);
        return NextResponse.json({ data }, { headers: noStoreHeaders });
    } catch (error) {
        console.error("Admin statements API failed", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Statement could not be loaded." },
            { status: 500, headers: noStoreHeaders },
        );
    }
}
