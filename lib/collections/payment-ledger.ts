import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type DdumbaClient = SupabaseClient<Database>;

type PaymentLedgerInput = {
    supabase: DdumbaClient;
    companyId: string;
    officeId: string;
    tenantId: string;
    leaseId?: string | null;
    collectionId: string;
    amount: number;
    balanceBefore: number;
    balanceAfter: number;
    recordedBy?: string | null;
    description: string;
    paidAt?: string | null;
};

export async function recordCollectionLedgerAndCash(input: PaymentLedgerInput) {
    const admin = createSupabaseAdminClient();

    const { error: ledgerError } = await admin.from("tenant_ledger_entries").insert({
        amount: input.amount,
        balance_after: input.balanceAfter,
        company_id: input.companyId,
        description: `${input.description} Balance before UGX ${Math.round(input.balanceBefore).toLocaleString()}; balance after UGX ${Math.round(input.balanceAfter).toLocaleString()}.`,
        entry_type: "credit",
        lease_id: input.leaseId ?? null,
        office_id: input.officeId,
        source_id: input.collectionId,
        source_type: "collection",
        tenant_id: input.tenantId,
    });

    if (ledgerError) {
        throw new Error(`Tenant ledger update failed: ${ledgerError.message}`);
    }

    const { data: cashAccount, error: cashAccountError } = await admin
        .from("cash_accounts")
        .select("id")
        .eq("company_id", input.companyId)
        .eq("office_id", input.officeId)
        .eq("account_type", "office_cash")
        .eq("status", "active")
        .limit(1)
        .maybeSingle();

    if (cashAccountError) {
        throw new Error(`Office cash lookup failed: ${cashAccountError.message}`);
    }

    if (!cashAccount?.id) {
        return;
    }

    const { error: cashError } = await admin.from("cash_transactions").insert({
        amount: input.amount,
        cash_account_id: cashAccount.id,
        company_id: input.companyId,
        description: input.description,
        office_id: input.officeId,
        recorded_by: input.recordedBy ?? null,
        source_id: input.collectionId,
        source_type: "collection",
        transaction_date: input.paidAt ?? new Date().toISOString(),
        transaction_type: "inflow",
    });

    if (cashError) {
        throw new Error(`Office cash update failed: ${cashError.message}`);
    }
}
