import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { paymentMethodBucket } from "@/lib/collections/payment-methods";
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
    paymentMethod?: string | null;
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

    const methodBucket = paymentMethodBucket(input.paymentMethod);
    const accountType = methodBucket === "bank" ? "bank" : methodBucket === "mobile_money" ? "mobile_money" : "office_cash";
    const accountName = accountType === "bank" ? "Company Bank" : accountType === "mobile_money" ? "Company Mobile Money" : "Office Cash";
    const isOfficeScopedAccount = accountType === "office_cash";
    let accountQuery = admin
        .from("cash_accounts")
        .select("id")
        .eq("company_id", input.companyId)
        .eq("account_type", accountType)
        .eq("status", "active")
        .limit(1);
    accountQuery = isOfficeScopedAccount ? accountQuery.eq("office_id", input.officeId) : accountQuery.is("office_id", null);
    const { data: cashAccount, error: cashAccountError } = await accountQuery.maybeSingle();

    if (cashAccountError) {
        throw new Error(`Payment cash account lookup failed: ${cashAccountError.message}`);
    }

    let cashAccountId = cashAccount?.id ?? null;
    if (!cashAccountId) {
        const { data: createdAccount, error: createAccountError } = await admin
            .from("cash_accounts")
            .insert({
                account_type: accountType,
                company_id: input.companyId,
                currency: "UGX",
                name: accountName,
                office_id: isOfficeScopedAccount ? input.officeId : null,
                status: "active",
            })
            .select("id")
            .single();
        if (createAccountError) {
            throw new Error(`Payment cash account creation failed: ${createAccountError.message}`);
        }
        cashAccountId = createdAccount.id;
    }

    const { error: cashError } = await admin.from("cash_transactions").insert({
        amount: input.amount,
        cash_account_id: cashAccountId,
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
        throw new Error(`Payment cash ledger update failed: ${cashError.message}`);
    }
}
