import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type OfficeLoginOption = {
    company_id: string;
    company_name: string;
    office_id: string;
    office_name: string;
    region: string | null;
    city: string | null;
};

type OfficeOptionsRpc = (
    fn: "ddumba_v1_public_office_login_options",
) => Promise<{ data: OfficeLoginOption[] | null; error: { message: string } | null }>;

export async function GET() {
    const supabase = await createSupabaseServerClient();
    const rpc = supabase.rpc.bind(supabase) as unknown as OfficeOptionsRpc;
    const { data, error } = await rpc("ddumba_v1_public_office_login_options");

    const headers = {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
    };

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500, headers });
    }

    return NextResponse.json({ offices: data ?? [] }, { headers });
}
