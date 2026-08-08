import { NextRequest, NextResponse } from "next/server";
import { canAccessOffice, requirePermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const EXPENSE_PROOF_BUCKET = "expense-proofs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ expenseId: string }> }) {
    try {
        const context = await requirePermission("expenses.read");
        const { expenseId } = await params;
        const companyId = context.activeCompany?.id;
        if (!companyId) throw new Error("Active company is required.");

        const db = createSupabaseAdminClient() as unknown as { from: (table: string) => any; storage: any };
        const { data, error } = await db
            .from("expenses")
            .select("id, company_id, office_id, supporting_document, supporting_document_original_name")
            .eq("id", expenseId)
            .eq("company_id", companyId)
            .maybeSingle();

        if (error) throw new Error(error.message);
        if (!data?.id) return NextResponse.json({ error: "Expense proof was not found." }, { status: 404 });
        if (!canAccessOffice(context, data.office_id)) return NextResponse.json({ error: "You do not have permission to view this expense proof." }, { status: 403 });
        const path = String(data.supporting_document ?? "");
        if (!path) return NextResponse.json({ error: "No supporting proof attached." }, { status: 404 });

        const download = request.nextUrl.searchParams.get("download") === "1";
        const signed = await db.storage
            .from(EXPENSE_PROOF_BUCKET)
            .createSignedUrl(path, 60, download ? { download: data.supporting_document_original_name ?? "expense-proof" } : undefined);
        if (signed.error || !signed.data?.signedUrl) {
            throw new Error(`Expense proof could not be opened: ${signed.error?.message ?? "No signed URL returned."}`);
        }
        return NextResponse.redirect(signed.data.signedUrl);
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Expense proof could not be opened." },
            { status: 500 },
        );
    }
}
