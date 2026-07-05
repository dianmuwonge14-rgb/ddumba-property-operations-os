"use server";

import { revalidatePath } from "next/cache";
import { requireAuth, requireCompanyAdminMode, hasPermission, canAccessOffice } from "@/lib/auth/permissions";
import { logUserAction } from "@/lib/auth/audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AuthContext } from "@/lib/auth/types";

type CashAccountType = "office_cash" | "bank" | "hq_cash";

type BankMoneyInput = {
    amount: number;
    bankingDate: string;
    bankName: string;
    channel: string;
    accountReference?: string | null;
    referenceNumber?: string | null;
    notes?: string | null;
};

type DepositResult = {
    ok: true;
    transferId: string;
    balances: {
        moneyAtOffice: number;
        moneyAtBank: number;
    };
    debug: {
        submittedAmount: number;
        officeId: string;
        moneyAtOfficeBefore: number;
        moneyAtOfficeAfter: number;
        bankBalanceBefore: number;
        bankBalanceAfter: number;
        supabaseTransactionId: string;
    };
};

type GiveMoneyInput = {
    officeId: string;
    amount: number;
    source: "bank" | "admin_cash";
    movementDate: string;
    reason: string;
    referenceNumber?: string | null;
    notes?: string | null;
};

type ReassignTransferInput = {
    transferId: string;
    correctOfficeId: string;
    reason: string;
};

type CancelTransferInput = {
    transferId: string;
    reason: string;
};

function amountValue(value: unknown) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
}

function assertAmount(amount: number) {
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Amount must be greater than zero.");
    }
}

function assertDate(value: string, label: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new Error(`${label} must be a valid date.`);
    }
}

function actorId(context: AuthContext) {
    return context.profile?.id ?? context.authUser?.id ?? null;
}

async function ensureCashAccount(input: {
    accountType: CashAccountType;
    companyId: string;
    name: string;
    officeId?: string | null;
}) {
    const db = createSupabaseAdminClient();
    const query = db
        .from("cash_accounts")
        .select("*")
        .eq("company_id", input.companyId)
        .eq("account_type", input.accountType)
        .eq("status", "active")
        .limit(1);
    const scopedQuery = input.officeId ? query.eq("office_id", input.officeId) : query.is("office_id", null);
    const { data, error } = await scopedQuery.maybeSingle();
    if (error) throw new Error(`Cash account lookup failed: ${error.message}`);
    if (data?.id) return data as Record<string, any>;

    const { data: created, error: createError } = await db
        .from("cash_accounts")
        .insert({
            account_type: input.accountType,
            company_id: input.companyId,
            name: input.name,
            office_id: input.officeId ?? null,
            status: "active",
        })
        .select("*")
        .single();
    if (createError) throw new Error(`Cash account could not be created: ${createError.message}`);
    return created as Record<string, any>;
}

async function accountBalance(accountId: string) {
    const db = createSupabaseAdminClient();
    const { data, error } = await db
        .from("cash_transactions")
        .select("amount, transaction_type")
        .eq("cash_account_id", accountId)
        .limit(10000);
    if (error) throw new Error(`Cash balance lookup failed: ${error.message}`);
    return (data ?? []).reduce((total, row) => {
        const signed = row.transaction_type === "outflow" ? -amountValue(row.amount) : amountValue(row.amount);
        return total + signed;
    }, 0);
}

async function officeCashBalance(input: { companyId: string; officeId: string }) {
    const db = createSupabaseAdminClient();
    const officeAccount = await ensureCashAccount({
        accountType: "office_cash",
        companyId: input.companyId,
        name: "Office Cash",
        officeId: input.officeId,
    });
    const [collectionsResult, expensesResult, cashResult] = await Promise.all([
        db
            .from("collections")
            .select("amount, amount_paid, status")
            .eq("company_id", input.companyId)
            .eq("office_id", input.officeId)
            .limit(10000),
        db
            .from("expenses")
            .select("amount")
            .eq("company_id", input.companyId)
            .eq("office_id", input.officeId)
            .limit(10000),
        db
            .from("cash_transactions")
            .select("amount, transaction_type, source_type")
            .eq("cash_account_id", officeAccount.id)
            .limit(10000),
    ]);
    for (const result of [collectionsResult, expensesResult, cashResult]) {
        if (result.error) throw new Error(`Office cash balance could not load: ${result.error.message}`);
    }
    const activeCollections = (collectionsResult.data ?? []).filter((row) => {
        const status = String(row.status ?? "active").toLowerCase();
        return !["voided", "removed", "removed_by_admin_approval", "rejected", "pending", "cancelled", "canceled"].includes(status);
    });
    const collected = activeCollections.reduce((total, row) => total + amountValue(row.amount_paid ?? row.amount), 0);
    const expenses = (expensesResult.data ?? []).reduce((total, row) => total + amountValue(row.amount), 0);
    const banked = (cashResult.data ?? [])
        .filter((row) => row.transaction_type === "outflow" && row.source_type === "bank_deposit")
        .reduce((total, row) => total + amountValue(row.amount), 0);
    const adminFloat = (cashResult.data ?? [])
        .filter((row) => row.transaction_type === "inflow" && row.source_type === "admin_float")
        .reduce((total, row) => total + amountValue(row.amount), 0);
    return collected + adminFloat - expenses - banked;
}

async function notify(input: {
    actionUrl: string;
    companyId: string;
    entityId: string;
    entityType: string;
    message: string;
    officeId: string | null;
    recipientType: "admin" | "office";
    severity: "info" | "success" | "warning" | "critical";
    title: string;
}) {
    const db = createSupabaseAdminClient() as unknown as { from: (table: string) => any };
    await db.from("notifications").insert({
        action_url: input.actionUrl,
        channel: "in_app",
        company_id: input.companyId,
        delivery_status: "pending",
        entity_id: input.entityId,
        entity_type: input.entityType,
        is_read: false,
        message: input.message,
        office_id: input.officeId,
        recipient_type: input.recipientType,
        severity: input.severity,
        title: input.title,
    });
}

function isMissingRelationError(error: { code?: string; message?: string } | null | undefined) {
    const message = String(error?.message ?? "").toLowerCase();
    return error?.code === "42P01" || error?.code === "PGRST205" || message.includes("could not find the table") || message.includes("does not exist");
}

async function insertOptional(table: string, row: Record<string, unknown>) {
    const db = createSupabaseAdminClient() as unknown as { from: (table: string) => any };
    const { error } = await db.from(table).insert(row);
    if (error && !isMissingRelationError(error)) {
        throw new Error(`${table} insert failed: ${error.message}`);
    }
}

async function upsertOptional(table: string, row: Record<string, unknown>, onConflict: string) {
    const db = createSupabaseAdminClient() as unknown as { from: (table: string) => any };
    const { error } = await db.from(table).upsert(row, { onConflict });
    if (error && !isMissingRelationError(error)) {
        throw new Error(`${table} upsert failed: ${error.message}`);
    }
}

function revalidateCashPages() {
    revalidatePath("/office/cash-banking");
    revalidatePath("/office/admin/cash-banking");
    revalidatePath("/office/expenses");
    revalidatePath("/office/collections");
    revalidatePath("/office/admin");
    revalidatePath("/office/dashboard");
    revalidatePath("/office/admin/statements");
    revalidatePath("/office/notifications");
}

export async function depositOfficeCashToBank(input: BankMoneyInput): Promise<DepositResult> {
    const context = await requireAuth();
    const allowed = hasPermission(context, "cash.manage")
        || hasPermission(context, "collections.manage")
        || hasPermission(context, "expenses.manage");
    if (!allowed) throw new Error("You do not have permission to bank office money.");
    const companyId = context.activeCompany?.id;
    const officeId = context.activeOffice?.id;
    if (!companyId || !officeId) throw new Error("Active company and office are required.");
    if (!canAccessOffice(context, officeId)) throw new Error("You cannot bank money for this office.");

    const amount = amountValue(input.amount);
    assertAmount(amount);
    assertDate(input.bankingDate, "Banking date");
    if (!input.bankName?.trim()) throw new Error("Bank/mobile money account is required.");

    const db = createSupabaseAdminClient() as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }> };
    const { data, error } = await db.rpc("deposit_office_cash_to_bank", {
        p_amount: amount,
        p_bank_account_name: input.bankName.trim(),
        p_deposit_date: input.bankingDate,
        p_deposit_method: input.channel || "Bank",
        p_deposit_reference: input.referenceNumber || null,
        p_notes: input.notes || null,
        p_office_id: officeId,
        p_recorded_by: actorId(context),
    });
    if (error) {
        throw new Error(`Deposit to Bank failed: ${error.message}${error.code ? ` (${error.code})` : ""}`);
    }
    if (!data?.ok) {
        throw new Error("Deposit to Bank failed: Supabase RPC returned no success payload.");
    }

    revalidateCashPages();
    const transferId = String(data.transfer_id);
    const officeBalanceAfter = amountValue(data.money_at_office_after);
    const bankBalanceAfter = amountValue(data.bank_balance_after);
    return {
        ok: true,
        transferId,
        balances: {
            moneyAtOffice: officeBalanceAfter,
            moneyAtBank: bankBalanceAfter,
        },
        debug: {
            submittedAmount: amountValue(data.submitted_amount),
            officeId: String(data.office_id ?? officeId),
            moneyAtOfficeBefore: amountValue(data.money_at_office_before),
            moneyAtOfficeAfter: officeBalanceAfter,
            bankBalanceBefore: amountValue(data.bank_balance_before),
            bankBalanceAfter,
            supabaseTransactionId: transferId,
        },
    };
}

export async function bankOfficeMoney(input: BankMoneyInput) {
    return depositOfficeCashToBank(input);
}

export async function giveMoneyToOffice(input: GiveMoneyInput) {
    const context = await requireCompanyAdminMode();
    if (!hasPermission(context, "cash.manage")) throw new Error("Cash management permission is required.");
    const companyId = context.activeCompany?.id;
    if (!companyId) throw new Error("Active company is required.");
    if (!input.officeId) throw new Error("Office is required.");
    if (!canAccessOffice(context, input.officeId)) throw new Error("You cannot access this office.");

    const amount = amountValue(input.amount);
    assertAmount(amount);
    assertDate(input.movementDate, "Movement date");
    if (!input.reason?.trim()) throw new Error("Reason is required.");

    const sourceType: CashAccountType = input.source === "bank" ? "bank" : "hq_cash";
    const db = createSupabaseAdminClient();
    const sourceAccount = await ensureCashAccount({
        accountType: sourceType,
        companyId,
        officeId: null,
        name: input.source === "bank" ? "Company Bank" : "Admin Cash",
    });
    const officeAccount = await ensureCashAccount({
        accountType: "office_cash",
        companyId,
        officeId: input.officeId,
        name: "Office Cash",
    });
    const sourceBalance = await accountBalance(String(sourceAccount.id));
    if (amount > sourceBalance) {
        throw new Error(`Admin cannot assign more than available ${input.source === "bank" ? "bank" : "admin cash"} balance. Available: UGX ${Math.round(sourceBalance).toLocaleString()}.`);
    }

    const { data: transfer, error: transferError } = await db
        .from("cash_transfers")
        .insert({
            amount,
            company_id: companyId,
            completed_at: new Date().toISOString(),
            from_cash_account_id: sourceAccount.id,
            requested_by: actorId(context),
            status: "completed",
            to_cash_account_id: officeAccount.id,
        })
        .select("*")
        .single();
    if (transferError) throw new Error(`Office float transfer could not be created: ${transferError.message}`);

    const description = [
        `Admin float from ${input.source === "bank" ? "company bank" : "admin cash"}`,
        `reason: ${input.reason}`,
        input.referenceNumber ? `ref ${input.referenceNumber}` : null,
        input.notes ? `notes: ${input.notes}` : null,
    ].filter(Boolean).join(" · ");

    const { error: transactionError } = await db.from("cash_transactions").insert([
        {
            amount,
            cash_account_id: sourceAccount.id,
            company_id: companyId,
            description,
            office_id: input.officeId,
            recorded_by: actorId(context),
            source_id: transfer.id,
            source_type: "admin_float",
            transaction_date: input.movementDate,
            transaction_type: "outflow",
        },
        {
            amount,
            cash_account_id: officeAccount.id,
            company_id: companyId,
            description,
            office_id: input.officeId,
            recorded_by: actorId(context),
            source_id: transfer.id,
            source_type: "admin_float",
            transaction_date: input.movementDate,
            transaction_type: "inflow",
        },
    ]);
    if (transactionError) throw new Error(`Office float ledger could not be posted: ${transactionError.message}`);

    await insertOptional("admin_cash_movements", {
        amount,
        company_id: companyId,
        movement_date: input.movementDate,
        movement_type: "money_sent_to_office",
        notes: input.notes ?? null,
        office_id: input.officeId,
        recorded_by: actorId(context),
        reference: input.referenceNumber ?? null,
        source: input.source,
        transfer_id: transfer.id,
    });
    await insertOptional("office_cash_movements", {
        amount,
        company_id: companyId,
        movement_date: input.movementDate,
        movement_type: "money_in",
        notes: input.notes ?? null,
        office_id: input.officeId,
        recorded_by: actorId(context),
        reference: input.referenceNumber ?? null,
        source_id: transfer.id,
        source_type: "admin_float",
    });
    await upsertOptional("office_cash_balances", {
        balance_date: input.movementDate,
        company_id: companyId,
        money_at_office: await officeCashBalance({ companyId, officeId: input.officeId }),
        money_received_from_admin: amount,
        office_id: input.officeId,
        updated_at: new Date().toISOString(),
    }, "company_id,office_id,balance_date");

    await notify({
        actionUrl: "/office/cash-banking",
        companyId,
        entityId: transfer.id,
        entityType: "cash_transfer",
        message: `Admin gave UGX ${Math.round(amount).toLocaleString()} to your office float.`,
        officeId: input.officeId,
        recipientType: "office",
        severity: "success",
        title: "Office float received",
    });
    await logUserAction({
        action: "admin_money_given_to_office",
        entityType: "cash_transfer",
        entityId: transfer.id,
        companyId,
        officeId: input.officeId,
        afterData: { ...input, amount },
    });
    revalidateCashPages();
    return { ok: true, transferId: transfer.id };
}

export async function reassignAdminOfficeTransfer(input: ReassignTransferInput) {
    const context = await requireCompanyAdminMode();
    if (!hasPermission(context, "cash.manage")) throw new Error("Cash management permission is required.");
    const companyId = context.activeCompany?.id;
    if (!companyId) throw new Error("Active company is required.");
    if (!input.transferId) throw new Error("Transfer is required.");
    if (!input.correctOfficeId) throw new Error("Correct office is required.");
    if (!input.reason.trim()) throw new Error("Correction reason is required.");
    if (!canAccessOffice(context, input.correctOfficeId)) throw new Error("You cannot access this office.");

    const db = createSupabaseAdminClient() as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }> };
    const { data, error } = await db.rpc("reassign_admin_office_transfer", {
        p_actor_id: actorId(context),
        p_company_id: companyId,
        p_correct_office_id: input.correctOfficeId,
        p_reason: input.reason,
        p_transfer_id: input.transferId,
    });
    if (error) throw new Error(`Transfer reassignment failed: ${error.message}`);

    revalidateCashPages();
    return data ?? { ok: true, transfer_id: input.transferId };
}

export async function cancelAdminOfficeTransfer(input: CancelTransferInput) {
    const context = await requireCompanyAdminMode();
    if (!hasPermission(context, "cash.manage")) throw new Error("Cash management permission is required.");
    const companyId = context.activeCompany?.id;
    if (!companyId) throw new Error("Active company is required.");
    if (!input.transferId) throw new Error("Transfer is required.");
    if (!input.reason.trim()) throw new Error("Cancellation reason is required.");

    const db = createSupabaseAdminClient() as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }> };
    const { data, error } = await db.rpc("cancel_admin_office_transfer", {
        p_actor_id: actorId(context),
        p_company_id: companyId,
        p_reason: input.reason,
        p_transfer_id: input.transferId,
    });
    if (error) throw new Error(`Transfer cancellation failed: ${error.message}`);

    revalidateCashPages();
    return data ?? { ok: true, transfer_id: input.transferId };
}
