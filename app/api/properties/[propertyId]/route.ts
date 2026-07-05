import { NextResponse } from "next/server";
import { getPropertyDetailInActiveOffice } from "@/lib/properties/data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const noStoreHeaders = {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
};

export async function GET(_request: Request, context: { params: Promise<{ propertyId: string }> }) {
    try {
        const { propertyId } = await context.params;
        const property = await getPropertyDetailInActiveOffice(propertyId);
        return NextResponse.json({ property }, { headers: noStoreHeaders });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Property details could not load." },
            { status: 400, headers: noStoreHeaders },
        );
    }
}
