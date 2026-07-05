import { NextResponse } from "next/server";
import { getLandlordNamePrefixSearchData, getLandlordsPageData } from "@/lib/landlords/data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page") ?? 1);
    const search = url.searchParams.get("q") ?? "";
    const landlord = url.searchParams.get("landlord");

    try {
        if (search.trim() && !landlord) {
            const fastData = await getLandlordNamePrefixSearchData({
                page: Number.isFinite(page) && page > 0 ? page : 1,
                search,
            });
            if (fastData && fastData.landlords.length > 0) return NextResponse.json({ data: fastData }, { headers: noStoreHeaders });
        }
        const data = await getLandlordsPageData({
            page: Number.isFinite(page) && page > 0 ? page : 1,
            search,
            selectedLandlordId: landlord && isUuid(landlord) ? landlord : null,
        });
        return NextResponse.json({ data }, { headers: noStoreHeaders });
    } catch (error) {
        console.error("Landlord API failed", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Landlords could not be loaded." },
            { status: 500, headers: noStoreHeaders },
        );
    }
}

const noStoreHeaders = {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
};

function isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
