import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type DynamicDb = {
    from: (table: string) => any;
};

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const paymentId = request.nextUrl.searchParams.get("paymentId") ?? "";

    try {
        const context = await requirePermission("collections.read");
        if (!context.activeCompany?.id) throw new Error("Active company is required.");
        if (!paymentId) throw new Error("Payment id is required.");

        const supabase = await createSupabaseServerClient();
        const db = supabase as unknown as DynamicDb;
        const { data: payment, error: paymentError } = await db
            .from("collections")
            .select("id, office_id")
            .eq("company_id", context.activeCompany.id)
            .eq("id", paymentId)
            .maybeSingle();
        if (paymentError) throw new Error(paymentError.message);
        if (!payment) throw new Error("Payment record not found.");
        if (!(context.isCompanyAdmin || context.canAccessAllOffices) && payment.office_id !== context.activeOffice?.id) {
            throw new Error("You can only view correction history for your office payments.");
        }

        const { data, error } = await db
            .from("payment_correction_requests")
            .select("id, correction_type, status, original_value, requested_value, original_payment_date, requested_payment_date, original_amount, requested_amount, reason, admin_comment, created_at, reviewed_at, requested_by, reviewed_by")
            .eq("company_id", context.activeCompany.id)
            .eq("payment_id", paymentId)
            .order("created_at", { ascending: false });
        if (error) throw new Error(error.message);

        return NextResponse.json({ history: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Payment correction history could not load.";
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
