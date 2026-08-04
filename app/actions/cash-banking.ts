"use server";

import { revalidatePath } from "next/cache";
import { requireAuth, requireCompanyAdminMode, hasPermission, canAccessOffice } from "@/lib/auth/permissions";
import { logUserAction } from "@/lib/auth/audit";
import { assertFinancialEntryDate } from "@/lib/business-date";
import { createNotificationWithEmail } from "@/lib/notifications/email";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AuthContext } from "@/lib/auth/types";

type CashAccountType = "office_cash" | "bank" | "hq_cash";

type BankMoneyInput = {
    amount: number;
    bankingDate: string;
    backdatingReason?: string | null;
    bankName: string;
    channel: string;
    officeId?: string | null;
    accountReference?: string | null;
    referenceNumber?: string | null;
    notes?: string | null;
};

type DepositResult = {
    ok: true;
    pending?: boolean;
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

type TreasuryRequestType = "banking" | "cash_handover_admin";

type TreasuryCashRequestInput = {
    amount: number;
    backdatingReason?: string | null;
    bankAccountName?: string | null;
    businessDate: string;
    handedOverBy?: string | null;
    method?: string | null;
    notes?: string | null;
    officeId?: string | null;
    reason: string;
    receivedByAdminId?: string | null;
    receivedByAdminName?: string | null;
    reference?: string | null;
    requestType: TreasuryRequestType;
};

type TreasuryDecisionInput = {
    adminComment?: string | null;
    decision: "approved" | "rejected";
    requestId: string;
};

type GiveMoneyInput = {
    officeId: string;
    amount: number;
    source: "bank" | "admin_cash";
    movementDate: string;
    backdatingReason?: string | null;
    reason: string;
    referenceNumber?: string | null;
    notes?: string | null;
};

type AdminCashMovementInput = {
    movementType: "cash_received" | "cash_out" | "bank_deposit";
    amount: number;
    movementDate: string;
    backdatingReason?: string | null;
    source?: string | null;
    category?: string | null;
    recipient?: string | null;
    bankName?: string | null;
    method?: string | null;
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

function assertTreasuryEntryDate(context: AuthContext, value: string, backdatingReason?: string | null) {
    return assertFinancialEntryDate(value, context, {
        backdatingReason,
        currentDateMessage: "Expenses can only be recorded for the current date.",
        entryLabel: "Treasury entry",
    });
}

function actorId(context: AuthContext) {
    return context.profile?.id ?? context.authUser?.id ?? null;
}

function isAdminContext(context: AuthContext) {
    return context.isCompanyAdmin && !context.isOfficeMode;
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
    const [cashResult] = await Promise.all([
        db
            .from("cash_transactions")
            .select("amount, transaction_type, source_type")
            .eq("cash_account_id", officeAccount.id)
            .limit(10000),
    ]);
    for (const result of [cashResult]) {
        if (result.error) throw new Error(`Office cash balance could not load: ${result.error.message}`);
    }
    return (cashResult.data ?? []).reduce((total, row) => {
        const signed = row.transaction_type === "outflow" ? -amountValue(row.amount) : amountValue(row.amount);
        return total + signed;
    }, 0);
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
    await createNotificationWithEmail(db, {
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

function revalidateCashPages() {
    revalidatePath("/office/cash-banking");
    revalidatePath("/office/admin/cash-banking");
    revalidatePath("/office/admin/cash-position");
    revalidatePath("/office/admin/defaulters");
    revalidatePath("/office/expenses");
    revalidatePath("/office/collections");
    revalidatePath("/office/admin");
    revalidatePath("/office/dashboard");
    revalidatePath("/office/admin/statements");
    revalidatePath("/office/notifications");
}

async function createTreasuryCashRequest(context: AuthContext, input: TreasuryCashRequestInput) {
    const companyId = context.activeCompany?.id;
    const isAdmin = isAdminContext(context);
    const officeId = isAdmin && input.officeId ? input.officeId : context.activeOffice?.id;
    if (!companyId || !officeId) throw new Error("Active company and office are required.");
    if (!canAccessOffice(context, officeId)) throw new Error("You cannot create treasury requests for this office.");

    const amount = amountValue(input.amount);
    assertAmount(amount);
    assertDate(input.businessDate, input.requestType === "banking" ? "Banking date" : "Handover date");
    const treasuryDate = assertTreasuryEntryDate(context, input.businessDate, input.backdatingReason);
    const businessDate = treasuryDate.date;
    if (!input.reason?.trim()) throw new Error("Reason is required.");

    const db = createSupabaseAdminClient();
    const idempotencyKey = [
        input.requestType,
        companyId,
        officeId,
        businessDate,
        amount,
        input.reference?.trim() || input.reason.trim().toLowerCase(),
    ].join(":");

    const { data: request, error } = await (db as unknown as { from: (table: string) => any })
        .from("treasury_cash_requests")
        .insert({
            amount,
            bank_account_name: input.bankAccountName?.trim() || null,
            business_date: businessDate,
            company_id: companyId,
            handed_over_by: input.handedOverBy?.trim() || context.profile?.full_name || null,
            idempotency_key: idempotencyKey,
            method: input.method?.trim() || (input.requestType === "banking" ? "Bank deposit" : "Cash"),
            notes: [
                input.notes?.trim() || null,
                treasuryDate.isBackdated ? `BACKDATED ADMIN ENTRY | Entered on: ${treasuryDate.enteredOnDate} | Reason: ${treasuryDate.backdatingReason}` : null,
            ].filter(Boolean).join(" | ") || null,
            office_id: officeId,
            reason: input.reason.trim(),
            received_by_admin: input.receivedByAdminId || null,
            received_by_admin_name: input.receivedByAdminName?.trim() || null,
            reference: input.reference?.trim() || null,
            request_type: input.requestType,
            status: "pending",
            submitted_by: actorId(context),
        })
        .select("*")
        .single();
    if (error) throw new Error(`Treasury request could not be created: ${error.message}`);

    const title = input.requestType === "banking" ? "Banking request pending approval" : "Cash handover to Admin pending approval";
    const message = `${context.profile?.full_name ?? "Office"} requested ${input.requestType === "banking" ? "banking" : "cash handover to Admin"} of UGX ${Math.round(amount).toLocaleString()} for ${businessDate}.`;
    await notify({
        actionUrl: "/office/notifications",
        companyId,
        entityId: String(request.id),
        entityType: "treasury_cash_request",
        message,
        officeId,
        recipientType: "admin",
        severity: "warning",
        title,
    });

    await logUserAction({
        action: "treasury_cash_request_submitted",
        entityType: "treasury_cash_request",
        entityId: String(request.id),
        companyId,
        officeId,
        afterData: {
            ...input,
            amount,
            backdated: treasuryDate.isBackdated,
            backdatingReason: treasuryDate.backdatingReason,
            enteredOnDate: treasuryDate.enteredOnDate,
            status: "pending",
            transactionDate: businessDate,
        },
    });
    revalidateCashPages();
    return request as Record<string, unknown>;
}

export async function submitTreasuryCashRequest(input: TreasuryCashRequestInput) {
    const context = await requireAuth();
    const allowed = hasPermission(context, "cash.manage")
        || hasPermission(context, "collections.manage")
        || hasPermission(context, "expenses.manage");
    if (!allowed) throw new Error("You do not have permission to submit treasury cash requests.");
    if (isAdminContext(context)) {
        const request = await createTreasuryCashRequest(context, input);
        return decideTreasuryCashRequest({
            requestId: String(request.id),
            decision: "approved",
            adminComment: input.notes || "Admin direct treasury entry.",
        });
    }
    return {
        ok: true,
        pending: true,
        request: await createTreasuryCashRequest(context, input),
    };
}

export async function decideTreasuryCashRequest(input: TreasuryDecisionInput) {
    const context = await requireCompanyAdminMode();
    if (!hasPermission(context, "cash.manage") && !hasPermission(context, "expenses.manage")) {
        throw new Error("Admin cash or expense management permission is required.");
    }
    if (!input.requestId) throw new Error("Treasury request is required.");
    const companyId = context.activeCompany?.id;
    if (!companyId) throw new Error("Active company is required.");
    const admin = createSupabaseAdminClient() as unknown as { from: (table: string) => any; rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }> };

    if (input.decision === "rejected") {
        const { data, error } = await admin
            .from("treasury_cash_requests")
            .update({
                admin_comment: input.adminComment ?? null,
                rejected_at: new Date().toISOString(),
                rejected_by: actorId(context),
                status: "rejected",
                updated_at: new Date().toISOString(),
            })
            .eq("id", input.requestId)
            .eq("company_id", companyId)
            .eq("status", "pending")
            .select("*")
            .single();
        if (error) throw new Error(`Treasury request rejection failed: ${error.message}`);
        await logUserAction({
            action: "treasury_cash_request_rejected",
            entityType: "treasury_cash_request",
            entityId: input.requestId,
            companyId,
            officeId: String(data.office_id ?? ""),
            afterData: { status: "rejected", adminComment: input.adminComment ?? null },
        });
        revalidateCashPages();
        return { ok: true, request: data, status: "rejected" };
    }

    const { data, error } = await admin.rpc("approve_treasury_cash_request", {
        p_admin_comment: input.adminComment ?? null,
        p_admin_id: actorId(context),
        p_request_id: input.requestId,
    });
    if (error) throw new Error(`Treasury request approval failed: ${error.message}${error.code ? ` (${error.code})` : ""}`);
    revalidateCashPages();
    return data ?? { ok: true };
}

export async function depositOfficeCashToBank(input: BankMoneyInput): Promise<DepositResult> {
    const context = await requireAuth();
    const allowed = hasPermission(context, "cash.manage")
        || hasPermission(context, "collections.manage")
        || hasPermission(context, "expenses.manage");
    if (!allowed) throw new Error("You do not have permission to bank office money.");
    const companyId = context.activeCompany?.id;
    const officeId = context.isCompanyAdmin && !context.isOfficeMode && input.officeId
        ? input.officeId
        : context.activeOffice?.id;
    if (!companyId || !officeId) throw new Error("Active company and office are required.");
    if (!canAccessOffice(context, officeId)) throw new Error("You cannot bank money for this office.");

    const amount = amountValue(input.amount);
    assertAmount(amount);
    assertDate(input.bankingDate, "Banking date");
    const bankingEntryDate = assertTreasuryEntryDate(context, input.bankingDate, input.backdatingReason);
    const bankingDate = bankingEntryDate.date;
    if (!input.bankName?.trim()) throw new Error("Bank/mobile money account is required.");

    if (!isAdminContext(context)) {
        const request = await createTreasuryCashRequest(context, {
            amount,
            bankAccountName: input.bankName.trim(),
            businessDate: bankingDate,
            backdatingReason: input.backdatingReason,
            method: input.channel || "Bank",
            notes: input.notes,
            officeId,
            reason: input.notes || "Office banking request",
            reference: input.referenceNumber,
            requestType: "banking",
        });
        const officeBalance = await officeCashBalance({ companyId, officeId });
        const bankAccount = await ensureCashAccount({
            accountType: "bank",
            companyId,
            officeId: null,
            name: "Company Bank",
        });
        const bankBalance = await accountBalance(String(bankAccount.id));
        return {
            ok: true,
            pending: true,
            transferId: String(request.id),
            balances: {
                moneyAtOffice: Math.max(0, officeBalance),
                moneyAtBank: bankBalance,
            },
            debug: {
                submittedAmount: amount,
                officeId,
                moneyAtOfficeBefore: officeBalance,
                moneyAtOfficeAfter: officeBalance,
                bankBalanceBefore: bankBalance,
                bankBalanceAfter: bankBalance,
                supabaseTransactionId: String(request.id),
            },
        };
    }

    const db = createSupabaseAdminClient() as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }> };
    const { data, error } = await db.rpc("deposit_office_cash_to_bank", {
        p_amount: amount,
        p_bank_account_name: input.bankName.trim(),
        p_deposit_date: bankingDate,
        p_deposit_method: input.channel || "Bank",
        p_deposit_reference: input.referenceNumber || null,
        p_notes: [
            input.notes || null,
            bankingEntryDate.isBackdated ? `BACKDATED ADMIN ENTRY | Entered on: ${bankingEntryDate.enteredOnDate} | Reason: ${bankingEntryDate.backdatingReason}` : null,
        ].filter(Boolean).join(" | ") || null,
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
    const displayedOfficeBalanceAfter = Math.max(0, officeBalanceAfter);
    return {
        ok: true,
        transferId,
        balances: {
            moneyAtOffice: displayedOfficeBalanceAfter,
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
    const movementEntryDate = assertTreasuryEntryDate(context, input.movementDate, input.backdatingReason);
    const movementDate = movementEntryDate.date;
    if (!input.reason?.trim()) throw new Error("Reason is required.");

    const db = createSupabaseAdminClient();
    const idempotencyKey = [
        "admin-cash-transfer",
        companyId,
        input.officeId,
        movementDate,
        amount,
        input.source,
        input.referenceNumber?.trim() || input.reason.trim().toLowerCase(),
    ].join(":");
    const { data, error } = await (db as unknown as { rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }> }).rpc("ddumba_v1_admin_cash_transfer_to_office", {
        p_admin_id: actorId(context),
        p_amount: amount,
        p_company_id: companyId,
        p_idempotency_key: idempotencyKey,
        p_movement_date: movementDate,
        p_notes: [
            input.notes ?? null,
            movementEntryDate.isBackdated ? `BACKDATED ADMIN ENTRY | Entered on: ${movementEntryDate.enteredOnDate} | Reason: ${movementEntryDate.backdatingReason}` : null,
        ].filter(Boolean).join(" | ") || null,
        p_office_id: input.officeId,
        p_reason: input.reason.trim(),
        p_reference: input.referenceNumber?.trim() || null,
        p_source: input.source,
    });
    if (error) throw new Error(`Admin Cash Transfer to Office failed: ${error.message}`);
    if (!data?.ok) throw new Error("Admin Cash Transfer to Office failed: Supabase RPC returned no success payload.");

    revalidateCashPages();
    return { ok: true, transferId: String(data.transfer_id ?? ""), duplicate: Boolean(data.duplicate), reference: String(data.reference ?? "") };
}

export async function recordAdminCashMovement(input: AdminCashMovementInput) {
    const context = await requireCompanyAdminMode();
    if (!hasPermission(context, "cash.manage")) throw new Error("Cash management permission is required.");
    const companyId = context.activeCompany?.id;
    if (!companyId) throw new Error("Active company is required.");

    const amount = amountValue(input.amount);
    assertAmount(amount);
    assertDate(input.movementDate, "Movement date");
    const movementEntryDate = assertTreasuryEntryDate(context, input.movementDate, input.backdatingReason);
    const movementDate = movementEntryDate.date;

    const db = createSupabaseAdminClient();
    const actor = actorId(context);
    const adminCashAccount = await ensureCashAccount({
        accountType: "hq_cash",
        companyId,
        officeId: null,
        name: "Admin Cash",
    });
    const bankAccount = await ensureCashAccount({
        accountType: "bank",
        companyId,
        officeId: null,
        name: "Company Bank",
    });

    if (input.referenceNumber?.trim()) {
        const dynamicDb = db as unknown as { from: (table: string) => any };
        const { data: duplicate, error: duplicateError } = await dynamicDb
            .from("admin_cash_movements")
            .select("id")
            .eq("company_id", companyId)
            .eq("reference", input.referenceNumber.trim())
            .eq("amount", amount)
            .limit(1)
            .maybeSingle();
        if (duplicateError) throw new Error(`Reference check failed: ${duplicateError.message}`);
        if (duplicate?.id) throw new Error("This Admin cash reference has already been recorded.");
    }

    const adminCashBefore = await accountBalance(String(adminCashAccount.id));
    const bankBefore = await accountBalance(String(bankAccount.id));
    const movementType = input.movementType;
    const cashOut = movementType === "cash_out" || movementType === "bank_deposit";
    if (cashOut && amount > adminCashBefore) {
        throw new Error(`Admin cash is insufficient. Available: UGX ${Math.round(adminCashBefore).toLocaleString()}.`);
    }

    let transferId: string | null = null;
    if (movementType === "bank_deposit") {
        const { data: transfer, error: transferError } = await db
            .from("cash_transfers")
            .insert({
                amount,
                company_id: companyId,
                completed_at: new Date().toISOString(),
                from_cash_account_id: adminCashAccount.id,
                requested_by: actor,
                status: "completed",
                to_cash_account_id: bankAccount.id,
            })
            .select("id")
            .single();
        if (transferError) throw new Error(`Admin bank transfer could not be created: ${transferError.message}`);
        transferId = String(transfer.id);
    }

    const dynamicDb = db as unknown as { from: (table: string) => any };
    const { data: movement, error: movementError } = await dynamicDb
        .from("admin_cash_movements")
        .insert({
            amount,
            company_id: companyId,
            movement_date: movementDate,
            movement_type: movementType === "cash_received" ? "admin_cash_received" : movementType === "cash_out" ? "admin_cash_out" : "admin_bank_deposit",
            notes: [
                input.notes ?? null,
                movementEntryDate.isBackdated ? `BACKDATED ADMIN ENTRY | Entered on: ${movementEntryDate.enteredOnDate} | Reason: ${movementEntryDate.backdatingReason}` : null,
            ].filter(Boolean).join(" | ") || null,
            office_id: null,
            recorded_by: actor,
            reference: input.referenceNumber?.trim() || null,
            source: input.source?.trim() || input.method?.trim() || "admin_cash",
            transfer_id: transferId,
        })
        .select("id")
        .single();
    if (movementError) throw new Error(`Admin cash movement could not be saved: ${movementError.message}`);

    const sourceId = String(movement.id);
    const description = [
        movementType === "cash_received" ? "Admin cash received" : movementType === "cash_out" ? "Admin cash out" : "Admin deposited cash to bank",
        input.source ? `source: ${input.source}` : null,
        input.category ? `category: ${input.category}` : null,
        input.recipient ? `recipient: ${input.recipient}` : null,
        input.bankName ? `bank: ${input.bankName}` : null,
        input.method ? `method: ${input.method}` : null,
        input.referenceNumber ? `ref ${input.referenceNumber}` : null,
        input.notes ? `notes: ${input.notes}` : null,
    ].filter(Boolean).join(" · ");

    const rows = movementType === "cash_received"
        ? [{
            amount,
            cash_account_id: adminCashAccount.id,
            company_id: companyId,
            description,
            office_id: null,
            recorded_by: actor,
            source_id: sourceId,
            source_type: "admin_cash_received",
            transaction_date: movementDate,
            transaction_type: "inflow",
        }]
        : movementType === "cash_out"
            ? [{
                amount,
                cash_account_id: adminCashAccount.id,
                company_id: companyId,
                description,
                office_id: null,
                recorded_by: actor,
                source_id: sourceId,
                source_type: "admin_cash_out",
                transaction_date: movementDate,
                transaction_type: "outflow",
            }]
            : [
                {
                    amount,
                    cash_account_id: adminCashAccount.id,
                    company_id: companyId,
                    description,
                    office_id: null,
                    recorded_by: actor,
                    source_id: sourceId,
                    source_type: "admin_bank_deposit",
                    transaction_date: movementDate,
                    transaction_type: "outflow",
                },
                {
                    amount,
                    cash_account_id: bankAccount.id,
                    company_id: companyId,
                    description,
                    office_id: null,
                    recorded_by: actor,
                    source_id: sourceId,
                    source_type: "admin_bank_deposit",
                    transaction_date: movementDate,
                    transaction_type: "inflow",
                },
            ];

    const { error: transactionError } = await db.from("cash_transactions").insert(rows);
    if (transactionError) throw new Error(`Admin cash ledger could not be posted: ${transactionError.message}`);

    await notify({
        actionUrl: "/office/admin/cash-banking",
        companyId,
        entityId: sourceId,
        entityType: "admin_cash_movement",
        message: `Admin recorded UGX ${Math.round(amount).toLocaleString()} for ${movementType.replaceAll("_", " ")}.`,
        officeId: null,
        recipientType: "admin",
        severity: "success",
        title: "Admin cash movement recorded",
    });
    await logUserAction({
        action: movementType === "cash_received" ? "admin_cash_received" : movementType === "cash_out" ? "admin_cash_out" : "admin_bank_deposit",
        entityType: "admin_cash_movement",
        entityId: sourceId,
        companyId,
        afterData: {
            ...input,
            amount,
            admin_cash_before: adminCashBefore,
            admin_cash_after: movementType === "cash_received" ? adminCashBefore + amount : adminCashBefore - amount,
            bank_before: bankBefore,
            bank_after: movementType === "bank_deposit" ? bankBefore + amount : bankBefore,
            backdated: movementEntryDate.isBackdated,
            backdatingReason: movementEntryDate.backdatingReason,
            enteredOnDate: movementEntryDate.enteredOnDate,
            transactionDate: movementDate,
        },
    });
    revalidateCashPages();
    return {
        ok: true,
        movementId: sourceId,
        balances: {
            adminCash: movementType === "cash_received" ? adminCashBefore + amount : adminCashBefore - amount,
            moneyAtBank: movementType === "bank_deposit" ? bankBefore + amount : bankBefore,
        },
    };
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
