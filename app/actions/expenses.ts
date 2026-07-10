"use server";

import { revalidatePath } from "next/cache";
import { requireAuth, requireCompanyAdminMode, requirePermission } from "@/lib/auth/permissions";
import { logUserAction } from "@/lib/auth/audit";
import { createNotificationWithEmail } from "@/lib/notifications/email";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getExpenseInActiveOffice } from "@/lib/expenses/data";
import { markLandlordMonthlyPayablePaid } from "@/app/actions/landlords";
import { calculateLandlordAdvancePlan } from "@/lib/landlord-advances/calculator";
import type {
    CreateExpenseCategoryInput,
    CreateExpenseInput,
    CreateEmployeeExpenseInput,
    CreateLandlordPaidExpenseRequestInput,
    DecideExpenseChangeRequestInput,
    DecideEmployeeExpenseRequestInput,
    DecideLandlordPaidExpenseRequestInput,
    DeleteExpenseInput,
    EmployeeExpensePreview,
    EditExpenseInput,
    ExpenseDecisionInput,
    SubmitExpenseChangeRequestInput,
} from "@/lib/expenses/types";

async function activeWriteContext() {
    const context = await requirePermission("expenses.manage");
    if (!context.activeCompany?.id || !context.activeOffice?.id) {
        throw new Error("Active company and office are required.");
    }
    return context;
}

async function resolveExpenseEmployeeActorId(context: Awaited<ReturnType<typeof requireAuth>>) {
    const companyId = context.activeCompany?.id ?? context.profile?.company_id ?? null;
    if (!companyId) return null;

    const admin = createSupabaseAdminClient();
    const candidateIds = [
        context.profile?.id,
        context.authUser?.id,
    ].filter((value): value is string => Boolean(value));

    if (candidateIds.length) {
        const { data, error } = await admin
            .from("employees")
            .select("id")
            .eq("company_id", companyId)
            .in("id", candidateIds)
            .limit(1);
        if (error) throw new Error(error.message);
        if (data?.[0]?.id) return String(data[0].id);
    }

    const profile = context.profile as Record<string, unknown> | null;
    const email = String(profile?.email ?? context.authUser?.email ?? "").trim();
    if (email) {
        const { data, error } = await admin
            .from("employees")
            .select("id")
            .eq("company_id", companyId)
            .ilike("email", email)
            .limit(1);
        if (error) throw new Error(error.message);
        if (data?.[0]?.id) return String(data[0].id);
    }

    const employeeCode = String(profile?.employee_code ?? "").trim();
    if (employeeCode) {
        const { data, error } = await admin
            .from("employees")
            .select("id")
            .eq("company_id", companyId)
            .eq("employee_code", employeeCode)
            .limit(1);
        if (error) throw new Error(error.message);
        if (data?.[0]?.id) return String(data[0].id);
    }

    return null;
}

async function expenseCorrectionContext() {
    const context = await requireAuth();
    const isCollector = context.authMode === "collector" || context.roles.some((role) => role.role?.key === "field_collector");
    const canManageExpenses = context.isCompanyAdmin || context.permissions.includes("expenses.manage");
    if (!isCollector && !canManageExpenses) {
        throw new Error("You do not have permission to request expense corrections.");
    }
    return context;
}

function assertAmount(amount: number) {
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Expense amount must be greater than zero.");
    }
}

function expenseNumber() {
    return `EXP-${Date.now()}`;
}

function amount(value: unknown) {
    return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function monthStart(value: string | null | undefined) {
    const source = value && /^\d{4}-\d{2}/.test(value) ? value.slice(0, 7) : new Date().toISOString().slice(0, 7);
    return `${source}-01`;
}

function itemKey(value: string | null | undefined) {
    return String(value ?? "other").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "other";
}

function itemName(value: string | null | undefined) {
    const clean = String(value ?? "Other").trim();
    return clean || "Other";
}

function isLunchItem(value: string | null | undefined) {
    return itemKey(value) === "lunch";
}

function isSalaryDeductibleExpenseItem(value: string | null | undefined) {
    return ["other", "others"].includes(itemKey(value));
}

function advanceTotal(row: Record<string, unknown>) {
    const total = amount(row.total_repayable);
    if (total > 0) return total;
    const advanceAmount = amount(row.advance_amount);
    if (advanceAmount > 0) return advanceAmount;
    return amount(row.principal_amount) + amount(row.interest_amount);
}

function advanceRemaining(row: Record<string, unknown>) {
    const remainingTotal = amount(row.remaining_total_balance);
    if (remainingTotal > 0) return remainingTotal;
    const remainingBalance = amount(row.remaining_balance);
    if (remainingBalance > 0) return remainingBalance;
    const principalInterest = amount(row.remaining_principal_balance) + amount(row.remaining_interest_balance);
    if (principalInterest > 0) return principalInterest;
    return Math.max(0, advanceTotal(row) - amount(row.deducted_amount));
}

function isApprovedActiveAdvance(row: Record<string, unknown>) {
    const status = String(row.status ?? "pending").toLowerCase();
    const lifecycle = String(row.lifecycle_status ?? "active").toLowerCase();
    const approved = ["approved", "active", "partially_deducted"].includes(status)
        || Boolean(row.approved_by || row.approved_at || row.approved_date);
    return approved
        && !["fully_deducted", "cleared", "cancelled", "rejected"].includes(status)
        && !["cleared", "cancelled", "rejected"].includes(lifecycle)
        && advanceRemaining(row) > 0;
}

function revalidateExpenseSurfaces() {
    revalidatePath("/office/expenses");
    revalidatePath("/office/collections");
    revalidatePath("/office/notifications");
    revalidatePath("/office/landlord-payments");
    revalidatePath("/office/landlords");
    revalidatePath("/office/dashboard");
    revalidatePath("/office/cash-banking");
    revalidatePath("/office/admin");
    revalidatePath("/office/admin/cash-banking");
    revalidatePath("/office/admin/statements");
    revalidatePath("/office/ai");
    revalidatePath("/office/automation");
    revalidatePath("/office/spreadsheet");
}

function isMissingSchemaError(error: { code?: string; message?: string } | null | undefined) {
    const message = String(error?.message ?? "").toLowerCase();
    return error?.code === "42P01"
        || error?.code === "42703"
        || error?.code === "PGRST204"
        || error?.code === "PGRST205"
        || message.includes("could not find the")
        || message.includes("schema cache")
        || message.includes("does not exist");
}

function isLandlordAdvanceStatusConstraint(error: { message?: string } | null | undefined) {
    const message = String(error?.message ?? "").toLowerCase();
    return message.includes("landlord_advances_status_check") || (message.includes("check constraint") && message.includes("landlord_advances"));
}

async function insertOptional(db: { from: (table: string) => any }, table: string, row: Record<string, unknown>) {
    const { error } = await db.from(table).insert(row);
    if (error && !isMissingSchemaError(error)) {
        throw new Error(`${table} insert failed: ${error.message}`);
    }
}

async function postOfficeCashOutflow(input: {
    amount: number;
    companyId: string;
    db: { from: (table: string) => any };
    description: string;
    officeId: string;
    recordedBy: string | null;
    sourceId: string;
    sourceType: string;
    transactionDate: string;
}) {
    const accountResult = await input.db
        .from("cash_accounts")
        .select("id")
        .eq("company_id", input.companyId)
        .eq("office_id", input.officeId)
        .eq("account_type", "office_cash")
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
    if (accountResult.error && !isMissingSchemaError(accountResult.error)) {
        throw new Error(`Office cash lookup failed: ${accountResult.error.message}`);
    }
    if (!accountResult.data?.id) return;

    const { error } = await input.db.from("cash_transactions").insert({
        amount: input.amount,
        cash_account_id: accountResult.data.id,
        company_id: input.companyId,
        description: input.description,
        office_id: input.officeId,
        recorded_by: input.recordedBy,
        source_id: input.sourceId,
        source_type: input.sourceType,
        transaction_date: input.transactionDate,
        transaction_type: "outflow",
    });
    if (error && !isMissingSchemaError(error)) {
        throw new Error(`Office cash ledger update failed: ${error.message}`);
    }
}

async function getLandlordPaymentPreview(input: {
    amount: number;
    companyId: string;
    db: { from: (table: string) => any };
    landlordId: string;
    officeId: string;
    paymentMonth: string;
}) {
    const paymentMonth = monthStart(input.paymentMonth);
    const [payableResult, advancesResult, pendingResult] = await Promise.all([
        input.db
            .from("landlord_monthly_payables")
            .select("*")
            .eq("company_id", input.companyId)
            .eq("office_id", input.officeId)
            .eq("landlord_id", input.landlordId)
            .eq("settlement_month", paymentMonth)
            .neq("status", "archived")
            .maybeSingle(),
        input.db
            .from("landlord_advances")
            .select("*")
            .eq("company_id", input.companyId)
            .eq("office_id", input.officeId)
            .eq("landlord_id", input.landlordId),
        input.db
            .from("landlord_payment_expense_requests")
            .select("*")
            .eq("company_id", input.companyId)
            .eq("office_id", input.officeId)
            .eq("landlord_id", input.landlordId)
            .eq("payment_month", paymentMonth)
            .eq("status", "pending"),
    ]);
    if (payableResult.error) throw new Error(payableResult.error.message);
    if (advancesResult.error) throw new Error(advancesResult.error.message);
    if (pendingResult.error && !/does not exist|schema cache|Could not find the table/i.test(pendingResult.error.message ?? "")) {
        throw new Error(pendingResult.error.message);
    }

    const payable = payableResult.data as Record<string, unknown> | null;
    const currentNetPayable = amount(payable?.net_payable ?? payable?.monthly_net_payable);
    const alreadyPaidAmount = amount(payable?.amount_paid);
    const outstandingAmount = Math.max(0, amount(payable?.unpaid_balance ?? payable?.closing_arrears ?? Math.max(0, currentNetPayable - alreadyPaidAmount)));
    const openingArrears = amount(payable?.opening_arrears);
    const activeAdvanceBalance = ((advancesResult.data ?? []) as Record<string, unknown>[])
        .filter(isApprovedActiveAdvance)
        .reduce((total, advance) => total + advanceRemaining(advance), 0);
    const pendingRequestAmount = ((pendingResult.data ?? []) as Record<string, unknown>[])
        .reduce((total, request) => total + amount(request.requested_amount), 0);
    const normalPaymentAmount = Math.min(input.amount, outstandingAmount);
    const advanceAmount = Math.max(0, input.amount - normalPaymentAmount);
    const duplicatePaymentRisk = ((pendingResult.data ?? []) as Record<string, unknown>[])
        .some((request) => Math.round(amount(request.requested_amount)) === Math.round(input.amount));
    const flagReason = advanceAmount > 0 && normalPaymentAmount > 0
        ? "partial_overpayment"
        : advanceAmount > 0
            ? "overpayment_creates_advance"
            : duplicatePaymentRisk
                ? "duplicate_pending_request"
                : "normal_payment";

    return {
        activeAdvanceBalance,
        advanceAmount,
        alreadyPaidAmount,
        currentNetPayable,
        duplicatePaymentRisk,
        flagReason,
        monthlyPayableId: payable?.id ? String(payable.id) : null,
        normalPaymentAmount,
        openingArrears,
        outstandingAmount,
        paymentMonth,
        pendingRequestAmount,
    };
}

export async function createExpense(input: CreateExpenseInput) {
    const context = await activeWriteContext();
    const supabase = await createSupabaseServerClient();
    const adminDb = createSupabaseAdminClient() as unknown as { from: (table: string) => any };
    const amount = Number(input.amount);
    assertAmount(amount);

    const expenseDate = input.expenseDate || new Date().toISOString().slice(0, 10);
    const actorId = context.profile?.id ?? context.authUser?.id ?? null;
    const expenseActorId = await resolveExpenseEmployeeActorId(context);
    const expensePayload = {
        amount,
        approved_at: new Date().toISOString(),
        approved_by: expenseActorId,
        category: input.category || null,
        category_id: input.categoryId || null,
        company_id: context.activeCompany!.id,
        description: input.description || null,
        expense_date: expenseDate,
        expense_number: expenseNumber(),
        item: input.item || null,
        office_id: context.activeOffice!.id,
        payment_method: input.paymentMethod || null,
        property_id: input.propertyId || null,
        receipt_url: input.receiptUrl || null,
        status: "approved",
        submitted_by: actorId,
        vendor: input.vendor || null,
    };

    let insertResult = await (supabase as unknown as { from: (table: string) => any })
        .from("expenses")
        .insert(expensePayload)
        .select("*")
        .single();

    if (insertResult.error && !isMissingSchemaError(insertResult.error)) {
        throw new Error(`Expense could not be saved: ${insertResult.error.message}`);
    }
    if (insertResult.error) {
        const fallbackPayload = { ...expensePayload };
        delete (fallbackPayload as Partial<typeof fallbackPayload>).payment_method;
        delete (fallbackPayload as Partial<typeof fallbackPayload>).status;
        delete (fallbackPayload as Partial<typeof fallbackPayload>).approved_at;
        delete (fallbackPayload as Partial<typeof fallbackPayload>).approved_by;
        insertResult = await adminDb
            .from("expenses")
            .insert(fallbackPayload)
            .select("*")
            .single();
    }

    if (insertResult.error || !insertResult.data) {
        throw new Error(`Expense could not be saved: ${insertResult.error?.message ?? "No saved expense returned."}`);
    }
    const data = insertResult.data;

    try {
        await postOfficeCashOutflow({
            amount,
            companyId: context.activeCompany!.id,
            db: adminDb,
            description: `Office expense recorded: ${input.item || input.category || "Expense"}`,
            officeId: context.activeOffice!.id,
            recordedBy: context.profile?.id ?? null,
            sourceId: data.id,
            sourceType: "expense",
            transactionDate: expenseDate,
        });
    } catch (error) {
        console.error("Expense saved but office cash ledger posting failed:", error);
        await logUserAction({
            action: "expense_cash_ledger_warning",
            entityType: "expense",
            entityId: data.id,
            companyId: context.activeCompany!.id,
            officeId: context.activeOffice!.id,
            afterData: {
                expenseId: data.id,
                warning: error instanceof Error ? error.message : "Office cash ledger posting failed.",
            },
        });
    }

    await logUserAction({
        action: "expense_created",
        entityType: "expense",
        entityId: data.id,
        companyId: context.activeCompany!.id,
        officeId: context.activeOffice!.id,
        afterData: data,
    });

    revalidateExpenseSurfaces();
    return data;
}

export async function previewLandlordPaymentExpense(input: {
    amount: number;
    landlordId: string;
    paymentMonth: string;
}) {
    const context = await activeWriteContext();
    const supabase = await createSupabaseServerClient();
    const db = supabase as unknown as { from: (table: string) => any };
    const companyId = context.activeCompany!.id;
    const officeId = context.activeOffice!.id;
    const value = Number(input.amount);
    if (!input.landlordId || !Number.isFinite(value) || value <= 0) {
        return {
            activeAdvanceBalance: 0,
            advanceAmount: 0,
            alreadyPaidAmount: 0,
            currentNetPayable: 0,
            duplicatePaymentRisk: false,
            flagReason: "enter_landlord_and_amount",
            monthlyPayableId: null,
            normalPaymentAmount: 0,
            openingArrears: 0,
            outstandingAmount: 0,
            paymentMonth: monthStart(input.paymentMonth),
            pendingRequestAmount: 0,
        };
    }

    const roomAccess = await db
        .from("rooms")
        .select("id")
        .eq("company_id", companyId)
        .eq("office_id", officeId)
        .eq("landlord_id", input.landlordId)
        .not("status", "in", "(archived,inactive,deleted,removed)")
        .limit(1);
    if (roomAccess.error) throw new Error(roomAccess.error.message);
    if (!(roomAccess.data ?? []).length) throw new Error("This landlord is not attached to the active office.");

    return getLandlordPaymentPreview({
        amount: value,
        companyId,
        db,
        landlordId: input.landlordId,
        officeId,
        paymentMonth: input.paymentMonth,
    });
}

export async function createLandlordPaidExpenseRequest(input: CreateLandlordPaidExpenseRequestInput) {
    const context = await activeWriteContext();
    const supabase = await createSupabaseServerClient();
    const db = supabase as unknown as { from: (table: string) => any };
    const companyId = context.activeCompany!.id;
    const officeId = context.activeOffice!.id;
    const actorId = context.profile?.id ?? context.authUser?.id ?? null;
    const isDirectAdmin = context.isCompanyAdmin && !context.isOfficeMode;
    const amount = Number(input.amount);
    assertAmount(amount);
    if (!input.landlordId) throw new Error("Select landlord.");
    const paymentDate = input.expenseDate || new Date().toISOString().slice(0, 10);
    const paymentMonth = monthStart(input.paymentMonth || paymentDate);
    const paymentMethod = input.paymentMethod || "cash";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) throw new Error("Select a valid payment date.");
    if (!/^\d{4}-\d{2}-01$/.test(paymentMonth)) throw new Error("Select a valid payment month.");

    const { data: landlord, error: landlordError } = await db
        .from("landlords")
        .select("id, full_name")
        .eq("company_id", companyId)
        .eq("id", input.landlordId)
        .maybeSingle();
    if (landlordError) throw new Error(landlordError.message);
    if (!landlord) throw new Error("Landlord not found.");

    const roomAccess = await db
        .from("rooms")
        .select("id")
        .eq("company_id", companyId)
        .eq("office_id", officeId)
        .eq("landlord_id", input.landlordId)
        .not("status", "in", "(archived,inactive,deleted,removed)")
        .limit(1);
    if (roomAccess.error) throw new Error(roomAccess.error.message);
    if (!(roomAccess.data ?? []).length) throw new Error("This landlord is not attached to the active office.");

    const preview = await getLandlordPaymentPreview({
        amount,
        companyId,
        db,
        landlordId: input.landlordId,
        officeId,
        paymentMonth,
    });
    if (preview.advanceAmount > 0 && !input.advanceAgreement) {
        throw new Error("This landlord payment includes an advance portion. Continue as Advance and complete the advance agreement before submitting.");
    }
    if (preview.advanceAmount > 0 && input.advanceAgreement) {
        const agreement = input.advanceAgreement;
        const deductionStartDate = String(agreement.deductionStartDate ?? "");
        const paymentPlan = String(agreement.paymentPlan ?? "");
        const monthlyDeductionAmount = Number(agreement.monthlyDeductionAmount ?? 0);
        if (!deductionStartDate || !/^\d{4}-\d{2}-\d{2}$/.test(deductionStartDate)) {
            throw new Error("Enter a valid deduction start date for the advance agreement.");
        }
        if (!paymentPlan) throw new Error("Choose an advance repayment plan.");
        if (paymentPlan !== "one_time" && monthlyDeductionAmount <= 0) {
            throw new Error("Enter a monthly deduction amount for this advance agreement.");
        }
    }

    const { data: request, error: requestError } = await db
        .from("landlord_payment_expense_requests")
        .insert({
            company_id: companyId,
            office_id: officeId,
            landlord_id: input.landlordId,
            expense_id: null,
            monthly_payable_id: preview.monthlyPayableId,
            requested_amount: amount,
            normal_payment_amount: preview.normalPaymentAmount,
            advance_amount: preview.advanceAmount,
            current_net_payable: preview.currentNetPayable,
            already_paid_amount: preview.alreadyPaidAmount,
            outstanding_amount: preview.outstandingAmount,
            opening_arrears: preview.openingArrears,
            active_advance_balance: preview.activeAdvanceBalance,
            pending_request_amount: preview.pendingRequestAmount,
            flag_reason: preview.flagReason,
            advance_agreement: input.advanceAgreement ?? {},
            payment_month: preview.paymentMonth,
            payment_date: paymentDate,
            payment_method: paymentMethod,
            notes: input.notes || null,
            status: "pending",
            submitted_by: actorId,
        })
        .select("*")
        .single();
    if (requestError) {
        console.error("Landlord payment approval request insert failed:", requestError.message);
        throw new Error(`Approval request could not be created: ${requestError.message}`);
    }

    if (isDirectAdmin) {
        await logUserAction({
            action: "landlord_payment_expense_admin_direct_created",
            entityType: "landlord_payment_expense_request",
            entityId: request.id,
            companyId,
            officeId,
            afterData: request,
        });
        return decideLandlordPaidExpenseRequest({
            requestId: request.id,
            decision: "approved",
            comment: "Admin entered and approved directly.",
        });
    }

    await createNotificationWithEmail(db, {
        action_url: "/office/notifications",
        channel: "in_app",
        company_id: companyId,
        delivery_status: "pending",
        entity_id: request.id,
        entity_type: "landlord_payment_expense_request",
        is_read: false,
        message: preview.advanceAmount > 0
            ? `Landlord payment approval requested for ${landlord.full_name ?? "Landlord"}: UGX ${Math.round(preview.normalPaymentAmount).toLocaleString()} payment + UGX ${Math.round(preview.advanceAmount).toLocaleString()} advance.`
            : `Landlord payment approval requested for ${landlord.full_name ?? "Landlord"}: UGX ${Math.round(amount).toLocaleString()} on ${paymentDate}.`,
        office_id: officeId,
        recipient_type: "admin",
        severity: "warning",
        title: "Landlord payment pending approval",
    });

    await logUserAction({
        action: "landlord_payment_expense_requested",
        entityType: "landlord_payment_expense_request",
        entityId: request.id,
        companyId,
        officeId,
        afterData: request,
    });

    revalidateExpenseSurfaces();
    return request;
}

async function loadEmployeeExpensePreview(input: {
    amount: number;
    companyId: string;
    db: { from: (table: string) => any };
    employeeId: string;
    expenseDate: string;
    expenseItem: string;
    officeId: string;
}) {
    const monthKeyValue = monthStart(input.expenseDate);
    const key = itemKey(input.expenseItem);
    const expenseDate = input.expenseDate || new Date().toISOString().slice(0, 10);
    const [employeeResult, allowanceResult, spentResult, pendingResult, lunchLedgerResult, attendanceResult] = await Promise.all([
        input.db
            .from("employees")
            .select("*")
            .eq("company_id", input.companyId)
            .eq("id", input.employeeId)
            .maybeSingle(),
        input.db
            .from("employee_expense_allowances")
            .select("*")
            .eq("company_id", input.companyId)
            .eq("expense_item_key", key)
            .eq("period_month", monthKeyValue)
            .eq("active", true),
        input.db
            .from("employee_expenses")
            .select("amount")
            .eq("company_id", input.companyId)
            .eq("employee_id", input.employeeId)
            .eq("category", key)
            .eq("month_key", monthKeyValue)
            .eq("active", true),
        input.db
            .from("employee_expense_requests")
            .select("extra_amount")
            .eq("company_id", input.companyId)
            .eq("employee_id", input.employeeId)
            .eq("requested_item_key", key)
            .eq("month_key", monthKeyValue)
            .eq("status", "pending")
            .eq("active", true),
        input.db
            .from("employee_lunch_ledger")
            .select("entry_type,ledger_date,earned_amount,taken_amount")
            .eq("company_id", input.companyId)
            .eq("employee_id", input.employeeId)
            .eq("month_key", monthKeyValue)
            .eq("active", true),
        input.db
            .from("office_daily_attendance")
            .select("id,status,check_in_time")
            .eq("company_id", input.companyId)
            .eq("office_id", input.officeId)
            .eq("attendance_date", expenseDate)
            .not("check_in_time", "is", null)
            .limit(1),
    ]);
    if (employeeResult.error) throw new Error(employeeResult.error.message);
    if (allowanceResult.error && !/does not exist|schema cache/i.test(allowanceResult.error.message ?? "")) throw new Error(allowanceResult.error.message);
    if (spentResult.error) throw new Error(spentResult.error.message);
    if (pendingResult.error && !/does not exist|schema cache/i.test(pendingResult.error.message ?? "")) throw new Error(pendingResult.error.message);
    if (lunchLedgerResult.error && !/does not exist|schema cache/i.test(lunchLedgerResult.error.message ?? "")) throw new Error(lunchLedgerResult.error.message);
    if (attendanceResult.error && !/does not exist|schema cache/i.test(attendanceResult.error.message ?? "")) throw new Error(attendanceResult.error.message);
    const employee = employeeResult.data as Record<string, unknown> | null;
    if (!employee) throw new Error("Employee not found.");
    const role = itemKey(String(employee.role ?? employee.job_title ?? ""));
    const allowances = (allowanceResult.data ?? []) as Array<Record<string, unknown>>;
    const allowance = allowances.find((row) => String(row.employee_id ?? "") === input.employeeId && (!row.office_id || String(row.office_id) === input.officeId))
        ?? allowances.find((row) => String(row.role_key ?? "") === role && (!row.office_id || String(row.office_id) === input.officeId))
        ?? allowances.find((row) => !row.employee_id && !row.role_key && (!row.office_id || String(row.office_id) === input.officeId))
        ?? null;
    const lunchItem = isLunchItem(input.expenseItem);
    const dailyLunchAllowance = lunchItem ? amount(employee.daily_lunch_allowance ?? allowance?.allowance_amount) : 0;
    const lunchLedgerRows = (lunchLedgerResult.data ?? []) as Array<Record<string, unknown>>;
    const attendanceRows = (attendanceResult.data ?? []) as Array<Record<string, unknown>>;
    const attendanceStatus = String(attendanceRows[0]?.status ?? "not_checked_in");
    const presentForExpenseDate = attendanceRows.length > 0 && !["absent", "not_checked_in"].includes(attendanceStatus.toLowerCase());
    const earnedTodayExists = lunchLedgerRows.some((row) => String(row.entry_type) === "earned" && String(row.ledger_date).slice(0, 10) === expenseDate);
    const lunchEarnedStored = lunchLedgerRows.reduce((total, row) => total + amount(row.earned_amount), 0);
    const lunchTakenStored = lunchLedgerRows.reduce((total, row) => total + amount(row.taken_amount), 0);
    const pendingAmount = ((pendingResult.data ?? []) as Array<Record<string, unknown>>).reduce((total, row) => total + amount(row.extra_amount), 0);
    const lunchEarnedThisMonth = lunchEarnedStored + (lunchItem && presentForExpenseDate && !earnedTodayExists ? dailyLunchAllowance : 0);
    const lunchTakenThisMonth = lunchTakenStored;
    const lunchBalanceBefore = Math.max(0, lunchEarnedThisMonth - lunchTakenThisMonth - pendingAmount);
    const allowanceAmount = lunchItem ? lunchBalanceBefore : amount(allowance?.allowance_amount);
    const alreadySpentAmount = ((spentResult.data ?? []) as Array<Record<string, unknown>>).reduce((total, row) => total + amount(row.amount), 0);
    const remainingAllowance = lunchItem ? lunchBalanceBefore : Math.max(0, allowanceAmount - alreadySpentAmount - pendingAmount);
    const salaryDeductible = isSalaryDeductibleExpenseItem(input.expenseItem);
    const allowedPortion = salaryDeductible ? input.amount : Math.min(input.amount, remainingAllowance);
    const extraAmount = salaryDeductible ? 0 : Math.max(0, input.amount - allowedPortion);
    const treatment = salaryDeductible ? "employee_personal_expense" : "company_expense";

    return {
        allowanceId: allowance?.id ? String(allowance.id) : null,
        allowanceAmount,
        alreadySpentAmount,
        pendingAmount,
        remainingAllowance,
        allowedPortion,
        extraAmount,
        dailyLunchAllowance,
        lunchEarnedThisMonth,
        lunchTakenThisMonth,
        lunchBalanceBefore,
        lunchBalanceAfter: Math.max(0, lunchBalanceBefore - allowedPortion),
        presentForExpenseDate,
        attendanceStatus,
        salaryImpactAmount: salaryDeductible ? Math.max(0, input.amount) : 0,
        treatment,
        approvalRequired: salaryDeductible ? false : extraAmount > 0,
        employeeName: String(employee.full_name ?? "Employee"),
        itemName: itemName(input.expenseItem),
        monthKey: monthKeyValue,
    } satisfies EmployeeExpensePreview;
}

export async function previewEmployeeExpense(input: CreateEmployeeExpenseInput): Promise<EmployeeExpensePreview> {
    const context = await activeWriteContext();
    const supabase = await createSupabaseServerClient();
    const db = supabase as unknown as { from: (table: string) => any };
    const companyId = context.activeCompany!.id;
    const officeId = context.activeOffice!.id;
    const value = Number(input.amount);
    if (!input.employeeId || !input.expenseItem || !Number.isFinite(value) || value <= 0) {
        return {
            allowanceId: null,
            allowanceAmount: 0,
            alreadySpentAmount: 0,
            pendingAmount: 0,
            remainingAllowance: 0,
            allowedPortion: 0,
            extraAmount: 0,
            dailyLunchAllowance: 0,
            lunchEarnedThisMonth: 0,
            lunchTakenThisMonth: 0,
            lunchBalanceBefore: 0,
            lunchBalanceAfter: 0,
            presentForExpenseDate: false,
            attendanceStatus: "not_checked_in",
            salaryImpactAmount: 0,
            treatment: "company_expense",
            approvalRequired: false,
            employeeName: "",
            itemName: itemName(input.expenseItem),
            monthKey: monthStart(input.expenseDate),
        };
    }
    return loadEmployeeExpensePreview({
        amount: value,
        companyId,
        db,
        employeeId: input.employeeId,
        expenseDate: input.expenseDate || new Date().toISOString().slice(0, 10),
        expenseItem: input.expenseItem,
        officeId,
    });
}

export async function createEmployeeExpenseFromExpenses(input: CreateEmployeeExpenseInput) {
    const context = await activeWriteContext();
    const supabase = await createSupabaseServerClient();
    const db = supabase as unknown as { from: (table: string) => any };
    const companyId = context.activeCompany!.id;
    const officeId = context.activeOffice!.id;
    const actorId = context.profile?.id ?? context.authUser?.id ?? null;
    const isDirectAdmin = context.isCompanyAdmin && !context.isOfficeMode;
    const expenseActorId = await resolveExpenseEmployeeActorId(context);
    const value = Number(input.amount);
    assertAmount(value);
    if (!input.employeeId) throw new Error("Select employee.");
    if (!input.expenseItem) throw new Error("Select expense item.");
    const expenseDate = input.expenseDate || new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) throw new Error("Select a valid expense date.");
    const preview = await loadEmployeeExpensePreview({
        amount: value,
        companyId,
        db,
        employeeId: input.employeeId,
        expenseDate,
        expenseItem: input.expenseItem,
        officeId,
    });

    let expenseId: string | null = null;
    let employeeExpenseId: string | null = null;
    const lunchItem = isLunchItem(input.expenseItem);
    const salaryDeductible = isSalaryDeductibleExpenseItem(input.expenseItem);
    if (lunchItem && preview.presentForExpenseDate && preview.dailyLunchAllowance > 0) {
        const { error: earnedError } = await db
            .from("employee_lunch_ledger")
            .upsert({
                active: true,
                balance_after: Math.max(0, preview.lunchEarnedThisMonth - preview.lunchTakenThisMonth),
                company_id: companyId,
                created_by: actorId,
                earned_amount: preview.dailyLunchAllowance,
                employee_id: input.employeeId,
                entry_type: "earned",
                ledger_date: expenseDate,
                month_key: preview.monthKey,
                note: "Daily lunch allowance earned from office attendance",
                office_id: officeId,
                source: "office_attendance",
                taken_amount: 0,
            }, { onConflict: "company_id,employee_id,ledger_date,entry_type", ignoreDuplicates: true });
        if (earnedError && !/duplicate key/i.test(earnedError.message ?? "")) throw new Error(earnedError.message);
    }
    if (preview.allowedPortion > 0) {
        const { data: expense, error: expenseError } = await db
            .from("expenses")
            .insert({
                amount: preview.allowedPortion,
                approved_at: new Date().toISOString(),
                approved_by: expenseActorId,
                category: "Employee Expense",
                company_id: companyId,
                description: `[employee_expense_allowed] ${input.note ?? ""}`.trim(),
                expense_date: expenseDate,
                expense_number: expenseNumber(),
                item: `${preview.itemName} - ${preview.employeeName}`,
                office_id: officeId,
                submitted_by: actorId,
            })
            .select("id")
            .single();
        if (expenseError) throw new Error(expenseError.message);
        expenseId = expense.id;

        const { data: employeeExpense, error: employeeExpenseError } = await db
            .from("employee_expenses")
            .insert({
                active: true,
                amount: preview.allowedPortion,
                approved_for_payroll: salaryDeductible,
                category: itemKey(input.expenseItem),
                company_id: companyId,
                created_by: actorId,
                expense_date: expenseDate,
                expense_source: "office",
                month_key: preview.monthKey,
                note: input.note || `Allowed ${preview.itemName} expense`,
                office_id: officeId,
                recorded_by_office: true,
                salary_deductible: salaryDeductible,
                status: "approved",
                employee_id: input.employeeId,
            })
            .select("id")
            .single();
        if (employeeExpenseError) throw new Error(employeeExpenseError.message);
        employeeExpenseId = employeeExpense.id;
        if (lunchItem) {
            const { error: lunchTakenError } = await db
                .from("employee_lunch_ledger")
                .insert({
                    active: true,
                    balance_after: preview.lunchBalanceAfter,
                    company_id: companyId,
                    created_by: actorId,
                    earned_amount: 0,
                    employee_expense_id: employeeExpense.id,
                    employee_id: input.employeeId,
                    entry_type: "taken",
                    expense_id: expenseId,
                    ledger_date: expenseDate,
                    month_key: preview.monthKey,
                    note: input.note || "Lunch money taken",
                    office_id: officeId,
                    source: "expense_entry",
                    taken_amount: preview.allowedPortion,
                });
            if (lunchTakenError) throw new Error(lunchTakenError.message);
        }
    }

    let request: Record<string, unknown> | null = null;
    if (preview.extraAmount > 0) {
        const { data, error } = await db
            .from("employee_expense_requests")
            .insert({
                active: true,
                allowance_id: preview.allowanceId,
                allowed_amount: preview.allowedPortion,
                already_spent_amount: preview.alreadySpentAmount,
                company_id: companyId,
                employee_expense_id: employeeExpenseId,
                employee_id: input.employeeId,
                expense_date: expenseDate,
                expense_id: expenseId,
                extra_amount: preview.extraAmount,
                month_key: preview.monthKey,
                note: input.note || null,
                office_id: officeId,
                pending_amount: preview.pendingAmount,
                remaining_allowance_before: preview.remainingAllowance,
                requested_amount: value,
                requested_by: actorId,
                requested_item_key: itemKey(input.expenseItem),
                requested_item_name: preview.itemName,
                status: "pending",
            })
            .select("*")
            .single();
        if (error) throw new Error(`Employee extra approval request could not be created: ${error.message}`);
        request = data;
        if (isDirectAdmin) {
            const approvedRequest = await decideEmployeeExpenseRequest({
                requestId: String(data.id),
                decision: "approved",
                comment: "Admin entered and approved directly.",
            });
            await logUserAction({
                action: "employee_expense_admin_direct_extra_approved",
                entityType: "employee_expense_request",
                entityId: String(data.id),
                companyId,
                officeId,
                afterData: { preview, request: approvedRequest, expenseId, employeeExpenseId } as any,
            });
            revalidateExpenseSurfaces();
            return { expenseId, employeeExpenseId, request: approvedRequest, preview };
        }
        await createNotificationWithEmail(db, {
            action_url: "/office/notifications",
            channel: "in_app",
            company_id: companyId,
            delivery_status: "pending",
            entity_id: data.id,
            entity_type: "employee_expense_request",
            is_read: false,
            message: `${preview.employeeName} exceeded ${preview.itemName} allowance by UGX ${Math.round(preview.extraAmount).toLocaleString()}.`,
            office_id: officeId,
            recipient_type: "admin",
            severity: "warning",
            title: "Employee expense above allowance",
        });
    }

    await logUserAction({
        action: preview.extraAmount > 0 ? "employee_expense_allowed_and_extra_requested" : "employee_expense_allowed_recorded",
        entityType: request ? "employee_expense_request" : "employee_expense",
        entityId: request ? String(request.id) : employeeExpenseId,
        companyId,
        officeId,
        afterData: { preview, request, expenseId, employeeExpenseId } as any,
    });
    revalidateExpenseSurfaces();
    return { expenseId, employeeExpenseId, request, preview };
}

export async function decideEmployeeExpenseRequest(input: DecideEmployeeExpenseRequestInput) {
    const context = await requireCompanyAdminMode();
    const supabase = await createSupabaseServerClient();
    const db = supabase as unknown as { from: (table: string) => any };
    const companyId = context.activeCompany?.id;
    const actorId = context.profile?.id ?? context.authUser?.id ?? null;
    const expenseActorId = await resolveExpenseEmployeeActorId(context);
    if (!companyId) throw new Error("Active company is required.");
    if (!input.requestId) throw new Error("Request id is required.");
    const { data: request, error: requestError } = await db
        .from("employee_expense_requests")
        .select("*")
        .eq("id", input.requestId)
        .eq("company_id", companyId)
        .maybeSingle();
    if (requestError) throw new Error(requestError.message);
    if (!request) throw new Error("Employee expense request not found.");
    if (request.status !== "pending") throw new Error("This employee expense request has already been reviewed.");
    const reviewedAt = new Date().toISOString();
    if (input.decision === "rejected") {
        const { data, error } = await db
            .from("employee_expense_requests")
            .update({
                admin_comment: input.comment || null,
                rejected_at: reviewedAt,
                reviewed_at: reviewedAt,
                reviewed_by: actorId,
                status: "rejected",
                updated_at: reviewedAt,
            })
            .eq("id", request.id)
            .select("*")
            .single();
        if (error) throw new Error(error.message);
        await createEmployeeExpenseDecisionNotification(db, {
            companyId,
            officeId: request.office_id,
            requestId: request.id,
            title: "Employee expense rejected",
            message: `Admin rejected extra employee expense of UGX ${Math.round(amount(request.extra_amount)).toLocaleString()}${input.comment ? `: ${input.comment}` : "."}`,
            severity: "error",
        });
        await logUserAction({ action: "employee_expense_request_rejected", entityType: "employee_expense_request", entityId: request.id, companyId, officeId: request.office_id, beforeData: request, afterData: data });
        revalidateExpenseSurfaces();
        return data;
    }

    const { data: employee, error: employeeError } = await db
        .from("employees")
        .select("id, full_name")
        .eq("id", request.employee_id)
        .eq("company_id", companyId)
        .maybeSingle();
    if (employeeError) throw new Error(employeeError.message);
    const extraAmount = amount(request.extra_amount);
    const { data: expense, error: expenseError } = await db
        .from("expenses")
        .insert({
            amount: extraAmount,
            approved_at: reviewedAt,
            approved_by: expenseActorId,
            category: "Employee Extra Expense",
            company_id: companyId,
            description: `[employee_expense_extra_approved] ${request.note ?? ""} ${input.comment ? `Admin: ${input.comment}` : ""}`.trim(),
            expense_date: request.expense_date,
            expense_number: expenseNumber(),
            item: `${request.requested_item_name ?? "Employee expense"} extra - ${employee?.full_name ?? "Employee"}`,
            office_id: request.office_id,
            submitted_by: request.requested_by ?? actorId,
        })
        .select("id")
        .single();
    if (expenseError) throw new Error(expenseError.message);
    let approvedEmployeeExpenseId: string | null = null;
    const salaryDeductible = isSalaryDeductibleExpenseItem(String(request.requested_item_key ?? ""));
    const { data: employeeExpense, error: employeeExpenseError } = await db
        .from("employee_expenses")
        .insert({
            active: true,
            amount: extraAmount,
            approved_for_payroll: salaryDeductible,
            category: String(request.requested_item_key ?? "other"),
            company_id: companyId,
            created_by: request.requested_by ?? actorId,
            expense_date: request.expense_date,
            expense_source: "office_extra_approved",
            month_key: request.month_key,
            note: request.note || "Above-allowance employee expense approved by Admin",
            office_id: request.office_id,
            recorded_by_office: true,
            reviewed_at: reviewedAt,
            reviewed_by: actorId,
            salary_deductible: salaryDeductible,
            status: "approved",
            employee_id: request.employee_id,
        })
        .select("id")
        .single();
    if (employeeExpenseError) throw new Error(employeeExpenseError.message);
    approvedEmployeeExpenseId = employeeExpense.id;

    const { data, error } = await db
        .from("employee_expense_requests")
        .update({
            admin_comment: input.comment || null,
            approved_at: reviewedAt,
            approved_advance_id: null,
            approved_employee_expense_id: approvedEmployeeExpenseId,
            approved_expense_id: expense.id,
            converted_to_advance: false,
            reviewed_at: reviewedAt,
            reviewed_by: actorId,
            status: "approved",
            updated_at: reviewedAt,
        })
        .eq("id", request.id)
        .select("*")
        .single();
    if (error) throw new Error(error.message);
    await createEmployeeExpenseDecisionNotification(db, {
        companyId,
        officeId: request.office_id,
        requestId: request.id,
        title: "Employee expense approved",
        message: `Admin approved extra employee expense of UGX ${Math.round(extraAmount).toLocaleString()}.`,
        severity: "success",
    });
    await logUserAction({ action: "employee_expense_request_approved", entityType: "employee_expense_request", entityId: request.id, companyId, officeId: request.office_id, beforeData: request, afterData: data });
    revalidateExpenseSurfaces();
    return data;
}

export async function decideLandlordPaidExpenseRequest(input: DecideLandlordPaidExpenseRequestInput) {
    const context = await requireCompanyAdminMode();
    const db = createSupabaseAdminClient() as unknown as { from: (table: string) => any };
    const companyId = context.activeCompany?.id;
    const actorId = context.profile?.id ?? context.authUser?.id ?? null;
    const expenseActorId = await resolveExpenseEmployeeActorId(context);
    if (!companyId) throw new Error("Active company is required.");
    if (!input.requestId) throw new Error("Request id is required.");

    const { data: request, error: requestError } = await db
        .from("landlord_payment_expense_requests")
        .select("*")
        .eq("id", input.requestId)
        .eq("company_id", companyId)
        .maybeSingle();
    if (requestError) throw new Error(requestError.message);
    if (!request) throw new Error("Landlord payment request not found.");
    if (request.status !== "pending") throw new Error("This landlord payment request has already been reviewed.");

    const reviewedAt = new Date().toISOString();
    if (input.decision === "rejected") {
        const { data, error } = await db
            .from("landlord_payment_expense_requests")
            .update({
                status: "rejected",
                reviewed_by: actorId,
                reviewed_at: reviewedAt,
                rejected_at: reviewedAt,
                admin_comment: input.comment || null,
                updated_at: reviewedAt,
            })
            .eq("id", request.id)
            .eq("status", "pending")
            .select("*")
            .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) throw new Error("This landlord payment request has already been reviewed.");
        await markLandlordPaymentApprovalNotificationsReviewed(db, {
            companyId,
            requestId: request.id,
            reviewedAt,
        });
        await createOfficeDecisionNotification(db, {
            companyId,
            officeId: request.office_id,
            requestId: request.id,
            title: "Landlord payment rejected",
            message: `Admin rejected landlord payment of UGX ${Math.round(Number(request.requested_amount ?? 0)).toLocaleString()}${input.comment ? `: ${input.comment}` : "."}`,
            severity: "error",
        });
        await logUserAction({
            action: "landlord_payment_expense_rejected",
            entityType: "landlord_payment_expense_request",
            entityId: request.id,
            companyId,
            officeId: request.office_id,
            beforeData: request,
            afterData: data,
        });
        revalidateExpenseSurfaces();
        return data;
    }

    const claim = await db
        .from("landlord_payment_expense_requests")
        .update({
            status: "approving",
            reviewed_by: actorId,
            reviewed_at: reviewedAt,
            admin_comment: input.comment || null,
            updated_at: reviewedAt,
        })
        .eq("id", request.id)
        .eq("company_id", companyId)
        .eq("status", "pending")
        .select("*")
        .maybeSingle();
    if (claim.error) throw new Error(claim.error.message);
    if (!claim.data) throw new Error("This landlord payment request has already been reviewed.");

    const reference = `EXP-LP-${request.id.slice(0, 8)}`;
    const normalPaymentAmount = Math.max(0, Number(request.normal_payment_amount ?? request.requested_amount ?? 0));
    const advanceAmount = Math.max(0, Number(request.advance_amount ?? 0));
    const requestedAmount = Math.max(0, Number(request.requested_amount ?? normalPaymentAmount + advanceAmount));
    let approvedPaymentId: string | null = null;
    let approvedAdvanceId: string | null = null;
    let approvedExpenseId: string | null = request.expense_id ?? null;
    let payableId = request.monthly_payable_id ?? null;

    const { data: approvedExpense, error: approvedExpenseError } = await db
        .from("expenses")
        .insert({
            amount: requestedAmount,
            approved_at: reviewedAt,
            approved_by: expenseActorId,
            category: "Landlord Paid",
            company_id: companyId,
            description: `[landlord_payment_approved] ${request.notes ?? ""} ${input.comment ? `Admin: ${input.comment}` : ""}`.trim(),
            expense_date: request.payment_date ?? reviewedAt.slice(0, 10),
            expense_number: expenseNumber(),
            item: `Landlord Paid - approval ${request.id.slice(0, 8)}`,
            office_id: request.office_id,
            submitted_by: request.submitted_by ?? actorId,
            vendor: null,
        })
        .select("id")
        .single();
    if (approvedExpenseError) throw new Error(approvedExpenseError.message);
    approvedExpenseId = approvedExpense.id;
    await insertOptional(db, "office_cash_movements", {
        amount: requestedAmount,
        company_id: companyId,
        movement_date: request.payment_date ?? reviewedAt.slice(0, 10),
        movement_type: advanceAmount > 0 && normalPaymentAmount <= 0 ? "landlord_advance_paid" : advanceAmount > 0 ? "landlord_payment_advance_split_paid" : "landlord_payment_paid",
        notes: `Approved landlord payment request ${request.id}. ${request.notes ?? ""}`.trim(),
        office_id: request.office_id,
        recorded_by: actorId,
        reference,
        source_id: request.id,
        source_type: "landlord_payment_expense_request",
    });
    await postOfficeCashOutflow({
        amount: requestedAmount,
        companyId,
        db,
        description: `Approved landlord payment request ${request.id}. ${request.notes ?? ""}`.trim(),
        officeId: request.office_id,
        recordedBy: actorId,
        sourceId: request.id,
        sourceType: "landlord_payment_expense_request",
        transactionDate: request.payment_date ?? reviewedAt.slice(0, 10),
    });

    if (normalPaymentAmount > 0) {
        const payable = payableId
            ? { id: payableId }
            : await findPayableForLandlordPayment({
                companyId,
                db,
                landlordId: request.landlord_id,
                officeId: request.office_id,
                paymentMonth: String(request.payment_month ?? request.payment_date ?? ""),
            });
        if (!payable) throw new Error("No live monthly payable record was found for the normal payment portion. Run monthly snapshot or refresh landlord payables first.");
        payableId = payable.id;
        await markLandlordMonthlyPayablePaid({
            monthlyPayableId: payable.id,
            amount: normalPaymentAmount,
            paidAt: request.payment_date,
            paymentMethod: request.payment_method ?? "cash",
            reference,
            notes: `Approved from Expenses landlord payment request. ${request.notes ?? ""}`.trim(),
        });

        const { data: payment } = await db
            .from("landlord_payments")
            .select("id")
            .eq("company_id", companyId)
            .eq("landlord_id", request.landlord_id)
            .eq("payout_reference", reference)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
        approvedPaymentId = payment?.id ?? null;
    }

    if (advanceAmount > 0) {
        approvedAdvanceId = await createApprovedLandlordAdvanceFromExpenseRequest({
            actorId,
            amount: advanceAmount,
            companyId,
            db,
            request,
            reviewedAt,
        });
    }

    const { data, error } = await db
        .from("landlord_payment_expense_requests")
        .update({
            status: "approved",
            monthly_payable_id: payableId,
            reviewed_by: actorId,
            reviewed_at: reviewedAt,
            approved_at: reviewedAt,
            admin_comment: input.comment || null,
            expense_id: approvedExpenseId,
            approved_landlord_payment_id: approvedPaymentId,
            approved_advance_id: approvedAdvanceId,
            updated_at: reviewedAt,
        })
        .eq("id", request.id)
        .select("*")
        .single();
    if (error) throw new Error(error.message);
    await markLandlordPaymentApprovalNotificationsReviewed(db, {
        companyId,
        requestId: request.id,
        reviewedAt,
    });

    await createOfficeDecisionNotification(db, {
        companyId,
        officeId: request.office_id,
        requestId: request.id,
        title: "Landlord payment approved",
        message: advanceAmount > 0
            ? `Admin approved landlord payment of UGX ${Math.round(normalPaymentAmount).toLocaleString()} and advance of UGX ${Math.round(advanceAmount).toLocaleString()}.`
            : `Admin approved landlord payment of UGX ${Math.round(normalPaymentAmount).toLocaleString()} on ${request.payment_date}.`,
        severity: "success",
    });

    await logUserAction({
        action: "landlord_payment_expense_approved",
        entityType: "landlord_payment_expense_request",
        entityId: request.id,
        companyId,
        officeId: request.office_id,
        beforeData: request,
        afterData: data,
    });

    revalidateExpenseSurfaces();
    return data;
}

async function createApprovedLandlordAdvanceFromExpenseRequest(input: {
    actorId: string | null;
    amount: number;
    companyId: string;
    db: { from: (table: string) => any };
    request: Record<string, any>;
    reviewedAt: string;
}) {
    const agreement = input.request.advance_agreement && typeof input.request.advance_agreement === "object"
        ? input.request.advance_agreement as Record<string, unknown>
        : {};
    const plan = calculateLandlordAdvancePlan({
        principalAmount: input.amount,
        repaymentType: String(agreement.repaymentType ?? "simple_advance"),
        interestMode: String(agreement.interestMode ?? "none"),
        interestType: String(agreement.interestType ?? "none"),
        interestValue: amount(agreement.interestValue),
        interestRate: amount(agreement.interestRate ?? agreement.interestValue),
        fixedInterestAmount: amount(agreement.fixedInterestAmount),
        paymentPlan: String(agreement.paymentPlan ?? "one_time"),
        monthlyDeductionAmount: amount(agreement.monthlyDeductionAmount),
        deductionStartDate: String(agreement.deductionStartDate ?? input.request.payment_date ?? input.reviewedAt.slice(0, 10)),
        deductionEndDate: agreement.deductionEndDate ? String(agreement.deductionEndDate) : null,
        principalClearanceMethod: String(agreement.principalClearanceMethod ?? "deducted_monthly"),
    });

    const advanceRow = {
        advance_amount: plan.totalRepayable,
        approved_by: input.actorId,
        company_id: input.companyId,
        created_by: input.actorId,
        date_given: input.request.payment_date ?? input.reviewedAt.slice(0, 10),
        deducted_amount: 0,
        deduction_end_date: agreement.deductionEndDate ? String(agreement.deductionEndDate) : plan.expectedEndDate,
        deduction_start_date: plan.deductionStartDate,
        expected_end_date: plan.expectedEndDate,
        fixed_interest_amount: plan.fixedInterestAmount,
        interest_amount: plan.interestAmount,
        interest_calculation_mode: plan.interestMode,
        interest_rate: plan.interestRate,
        interest_type: plan.interestType,
        landlord_id: input.request.landlord_id,
        lifecycle_status: "active",
        monthly_deduction_amount: plan.monthlyDeductionAmount,
        note: `Created after Admin approved expense-routed landlord payment request ${input.request.id}. ${input.request.notes ?? ""}`.trim(),
        office_id: input.request.office_id,
        payment_plan: plan.paymentPlan,
        principal_amount: plan.principalAmount,
        principal_clearance_method: plan.principalClearanceMethod,
        reason: String(agreement.reason ?? "Overpayment converted to landlord advance"),
        remaining_interest_balance: plan.interestAmount,
        remaining_principal_balance: plan.principalAmount,
        remaining_total_balance: plan.totalRepayable,
        repayment_type: plan.repaymentType,
        status: "approved",
        total_repayable: plan.totalRepayable,
        updated_by: input.actorId,
    };
    let advanceInsert = await input.db
        .from("landlord_advances")
        .insert(advanceRow)
        .select("*")
        .single();
    if (advanceInsert.error && isLandlordAdvanceStatusConstraint(advanceInsert.error)) {
        advanceInsert = await input.db
            .from("landlord_advances")
            .insert({
                ...advanceRow,
                status: "partially_deducted",
            })
            .select("*")
            .single();
    }
    if (advanceInsert.error) throw new Error(`Approved landlord advance could not be saved: ${advanceInsert.error.message}`);
    const advance = advanceInsert.data;

    const scheduleRows = plan.schedule.map((row) => ({
        actual_deduction: 0,
        advance_id: advance.id,
        closing_balance: row.closingBalance,
        closing_principal_balance: row.closingPrincipalBalance,
        company_id: input.companyId,
        interest_charged: row.interestCharged,
        interest_portion: row.interestPortion,
        landlord_id: input.request.landlord_id,
        month_key: row.month,
        office_id: input.request.office_id,
        opening_balance: row.openingBalance,
        opening_principal_balance: row.openingPrincipalBalance,
        principal_portion: row.principalPortion,
        remaining_total_balance: row.remainingTotalBalance,
        scheduled_deduction: row.scheduledDeduction,
        status: "pending",
    }));
    if (scheduleRows.length > 0) {
        const scheduleInsert = await input.db.from("landlord_advance_repayment_schedule").insert(scheduleRows);
        if (scheduleInsert.error && !isMissingSchemaError(scheduleInsert.error)) throw new Error(scheduleInsert.error.message);
    }
    await createNotificationWithEmail(input.db, {
        action_url: "/office/landlord-payments",
        channel: "in_app",
        company_id: input.companyId,
        delivery_status: "pending",
        entity_id: advance.id,
        entity_type: "landlord_advance",
        is_read: false,
        message: `Landlord advance of UGX ${Math.round(input.amount).toLocaleString()} was approved from an expense-routed payment request.`,
        office_id: input.request.office_id,
        recipient_type: "admin",
        severity: "warning",
        title: "Landlord advance approved",
    });
    return String(advance.id);
}

async function findPayableForLandlordPayment(input: { db: { from: (table: string) => any }; companyId: string; officeId: string; landlordId: string; paymentMonth?: string }) {
    const { data, error } = await input.db
        .from("landlord_monthly_payables")
        .select("*")
        .eq("company_id", input.companyId)
        .eq("office_id", input.officeId)
        .eq("landlord_id", input.landlordId)
        .neq("status", "archived")
        .order("settlement_month", { ascending: true });
    if (error) throw new Error(error.message);
    const requestedMonth = input.paymentMonth ? monthStart(input.paymentMonth) : null;
    if (requestedMonth) {
        const exact = ((data ?? []) as Array<Record<string, unknown>>).find((row) => String(row.settlement_month ?? "").slice(0, 10) === requestedMonth);
        if (exact) return exact;
    }
    return ((data ?? []) as Array<Record<string, unknown>>).find((row) => {
        const unpaid = Math.max(0, Number(row.unpaid_balance ?? row.closing_arrears ?? row.net_payable ?? 0));
        return unpaid > 0;
    }) ?? (data ?? [])[0] ?? null;
}

async function markLandlordPaymentApprovalNotificationsReviewed(db: { from: (table: string) => any }, input: {
    companyId: string;
    requestId: string;
    reviewedAt: string;
}) {
    const updateWithTimestamp = {
        delivery_status: "completed",
        is_read: true,
        updated_at: input.reviewedAt,
    };
    const byEntity = await db
        .from("notifications")
        .update(updateWithTimestamp)
        .eq("company_id", input.companyId)
        .eq("entity_type", "landlord_payment_expense_request")
        .eq("entity_id", input.requestId);
    if (byEntity.error && isMissingSchemaError(byEntity.error)) {
        const fallback = await db
            .from("notifications")
            .update({
                delivery_status: "completed",
                is_read: true,
            })
            .eq("company_id", input.companyId)
            .eq("entity_type", "landlord_payment_expense_request")
            .eq("entity_id", input.requestId);
        if (fallback.error && !isMissingSchemaError(fallback.error)) {
            throw new Error(`Approval notification could not be completed: ${fallback.error.message}`);
        }
    } else if (byEntity.error) {
        throw new Error(`Approval notification could not be completed: ${byEntity.error.message}`);
    }
}

async function createOfficeDecisionNotification(db: { from: (table: string) => any }, input: {
    companyId: string;
    officeId: string;
    requestId: string;
    title: string;
    message: string;
    severity: string;
}) {
    await createNotificationWithEmail(db, {
        action_url: `/office/expenses?request=${input.requestId}`,
        channel: "in_app",
        company_id: input.companyId,
        delivery_status: "pending",
        entity_id: input.requestId,
        entity_type: "landlord_payment_expense_request",
        is_read: false,
        message: input.message,
        office_id: input.officeId,
        recipient_type: "office",
        severity: input.severity,
        title: input.title,
    });
}

async function createEmployeeExpenseDecisionNotification(db: { from: (table: string) => any }, input: {
    companyId: string;
    officeId: string;
    requestId: string;
    title: string;
    message: string;
    severity: string;
}) {
    await createNotificationWithEmail(db, {
        action_url: `/office/expenses?employeeExpenseRequest=${input.requestId}`,
        channel: "in_app",
        company_id: input.companyId,
        delivery_status: "pending",
        entity_id: input.requestId,
        entity_type: "employee_expense_request",
        is_read: false,
        message: input.message,
        office_id: input.officeId,
        recipient_type: "office",
        severity: input.severity,
        title: input.title,
    });
}

function requestedExpensePatch(input: Record<string, unknown>) {
    const patch: Record<string, unknown> = {};
    if ("amount" in input && input.amount !== null && input.amount !== undefined) {
        const nextAmount = Number(input.amount);
        assertAmount(nextAmount);
        patch.amount = nextAmount;
    }
    if ("category" in input) patch.category = input.category ? String(input.category) : null;
    if ("categoryId" in input) patch.category_id = input.categoryId ? String(input.categoryId) : null;
    if ("description" in input) patch.description = input.description ? String(input.description) : null;
    if ("employeeId" in input) patch.employee_id = input.employeeId ? String(input.employeeId) : null;
    if ("expenseDate" in input) {
        const value = input.expenseDate ? String(input.expenseDate) : "";
        if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Select a valid expense date.");
        patch.expense_date = value || null;
    }
    if ("item" in input) patch.item = input.item ? String(input.item) : null;
    if ("officeId" in input) patch.office_id = input.officeId ? String(input.officeId) : null;
    if ("paymentMethod" in input) patch.payment_method = input.paymentMethod ? String(input.paymentMethod) : null;
    if ("receiptUrl" in input) patch.receipt_url = input.receiptUrl ? String(input.receiptUrl) : null;
    if ("status" in input) patch.status = input.status ? String(input.status) : "approved";
    if ("vendor" in input) patch.vendor = input.vendor ? String(input.vendor) : null;
    return patch;
}

function expenseSnapshot(expense: Record<string, unknown>) {
    return {
        amount: amount(expense.amount),
        category: expense.category ?? null,
        categoryId: expense.category_id ?? null,
        description: expense.description ?? null,
        employeeId: expense.employee_id ?? null,
        expenseDate: expense.expense_date ?? null,
        item: expense.item ?? null,
        officeId: expense.office_id ?? null,
        paymentMethod: expense.payment_method ?? null,
        receiptUrl: expense.receipt_url ?? null,
        status: expense.status ?? "approved",
        vendor: expense.vendor ?? null,
    };
}

async function loadExpenseForCompany(db: { from: (table: string) => any }, input: { companyId: string; expenseId: string }) {
    const { data, error } = await db
        .from("expenses")
        .select("*")
        .eq("id", input.expenseId)
        .eq("company_id", input.companyId)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Expense not found.");
    return data as Record<string, unknown>;
}

async function applyExpensePatch(db: { from: (table: string) => any }, expenseId: string, patch: Record<string, unknown>) {
    const update = { ...patch, updated_at: new Date().toISOString() };
    const { data, error } = await db
        .from("expenses")
        .update(update)
        .eq("id", expenseId)
        .select("*")
        .single();
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
}

export async function submitExpenseChangeRequest(input: SubmitExpenseChangeRequestInput) {
    const context = await expenseCorrectionContext();
    const isCollector = context.authMode === "collector" || context.roles.some((role) => role.role?.key === "field_collector");
    const supabase = isCollector ? createSupabaseAdminClient() : await createSupabaseServerClient();
    const db = supabase as unknown as { from: (table: string) => any };
    const companyId = context.activeCompany?.id;
    const actorId = context.profile?.id ?? context.authUser?.id ?? null;
    if (!companyId) throw new Error("Active company is required.");
    if (!input.expenseId) throw new Error("Expense id is required.");
    if (!input.reason?.trim()) throw new Error("Reason for expense correction is required.");
    const expense = await loadExpenseForCompany(db, { companyId, expenseId: input.expenseId });
    if (!isCollector && !context.isCompanyAdmin && context.activeOffice?.id && String(expense.office_id ?? "") !== context.activeOffice.id) {
        throw new Error("You can only request corrections for expenses in your active office.");
    }
    const requestOfficeId = typeof expense.office_id === "string" && expense.office_id ? expense.office_id : context.activeOffice?.id ?? null;
    const requestedPatch = requestedExpensePatch(input.requested as Record<string, unknown>);
    if (!Object.keys(requestedPatch).length) throw new Error("Enter at least one expense field to change.");

    const { data: request, error } = await db
        .from("expense_change_requests")
        .insert({
            change_type: input.changeType || "general_edit",
            company_id: companyId,
            expense_id: input.expenseId,
            office_id: requestOfficeId,
            original_value: expenseSnapshot(expense),
            reason: input.reason.trim(),
            requested_by: actorId,
            requested_by_account_type: context.profile?.account_type ?? null,
            requested_value: input.requested,
            status: "pending",
        })
        .select("*")
        .single();
    if (error) throw new Error(`Expense change request could not be created: ${error.message}`);

    await createNotificationWithEmail(db, {
        action_url: "/office/expenses",
        channel: "in_app",
        company_id: companyId,
        delivery_status: "pending",
        entity_id: request.id,
        entity_type: "expense_change_request",
        is_read: false,
        message: `Expense correction requested for ${String(expense.item ?? expense.expense_number ?? "expense")} (${input.reason.trim()}).`,
        office_id: requestOfficeId ?? undefined,
        recipient_type: "admin",
        severity: "warning",
        title: "Expense correction pending approval",
    });

    await logUserAction({
        action: "expense_change_request_created",
        entityType: "expense_change_request",
        entityId: request.id,
        companyId,
        officeId: requestOfficeId ?? undefined,
        beforeData: expense as any,
        afterData: request as any,
    });
    revalidateExpenseSurfaces();
    return request;
}

export async function adminEditExpenseDirect(input: SubmitExpenseChangeRequestInput) {
    const context = await requireCompanyAdminMode();
    const supabase = await createSupabaseServerClient();
    const db = supabase as unknown as { from: (table: string) => any };
    const companyId = context.activeCompany?.id;
    const actorId = context.profile?.id ?? context.authUser?.id ?? null;
    const expenseActorId = await resolveExpenseEmployeeActorId(context);
    if (!companyId) throw new Error("Active company is required.");
    if (!input.expenseId) throw new Error("Expense id is required.");
    if (!input.reason?.trim()) throw new Error("Reason for expense edit is required.");
    const expense = await loadExpenseForCompany(db, { companyId, expenseId: input.expenseId });
    const patch = requestedExpensePatch(input.requested as Record<string, unknown>);
    if (!Object.keys(patch).length) throw new Error("Enter at least one expense field to change.");
    const updated = await applyExpensePatch(db, input.expenseId, {
        ...patch,
        approved_at: new Date().toISOString(),
        approved_by: expenseActorId,
        status: "approved",
    });
    await logUserAction({
        action: "expense_admin_direct_edit",
        entityType: "expense",
        entityId: input.expenseId,
        companyId,
        officeId: String(updated.office_id ?? expense.office_id ?? ""),
        beforeData: expense as any,
        afterData: { ...updated, reason: input.reason.trim() } as any,
    });
    revalidateExpenseSurfaces();
    return updated;
}

export async function decideExpenseChangeRequest(input: DecideExpenseChangeRequestInput) {
    const context = await requireCompanyAdminMode();
    const supabase = await createSupabaseServerClient();
    const db = supabase as unknown as { from: (table: string) => any };
    const companyId = context.activeCompany?.id;
    const actorId = context.profile?.id ?? context.authUser?.id ?? null;
    if (!companyId) throw new Error("Active company is required.");
    const { data: request, error: requestError } = await db
        .from("expense_change_requests")
        .select("*")
        .eq("company_id", companyId)
        .eq("id", input.requestId)
        .maybeSingle();
    if (requestError) throw new Error(requestError.message);
    if (!request) throw new Error("Expense change request not found.");
    if (request.status !== "pending") throw new Error("This expense change request has already been reviewed.");
    const reviewedAt = new Date().toISOString();
    const beforeExpense = await loadExpenseForCompany(db, { companyId, expenseId: request.expense_id });
    if (input.decision === "rejected") {
        const { data, error } = await db
            .from("expense_change_requests")
            .update({
                admin_comment: input.comment || null,
                reviewed_at: reviewedAt,
                reviewed_by: actorId,
                status: "rejected",
            })
            .eq("id", request.id)
            .select("*")
            .single();
        if (error) throw new Error(error.message);
        await createNotificationWithEmail(db, {
            action_url: "/office/expenses",
            channel: "in_app",
            company_id: companyId,
            delivery_status: "pending",
            entity_id: request.id,
            entity_type: "expense_change_request",
            is_read: false,
            message: `Admin rejected an expense correction${input.comment ? `: ${input.comment}` : "."}`,
            office_id: request.office_id,
            recipient_type: "office",
            severity: "error",
            title: "Expense correction rejected",
        });
        await logUserAction({ action: "expense_change_request_rejected", entityType: "expense_change_request", entityId: request.id, companyId, officeId: request.office_id, beforeData: request as any, afterData: data as any });
        revalidateExpenseSurfaces();
        return data;
    }

    const patch = requestedExpensePatch((request.requested_value ?? {}) as Record<string, unknown>);
    const updatedExpense = await applyExpensePatch(db, request.expense_id, patch);
    const { data: reviewedRequest, error: reviewError } = await db
        .from("expense_change_requests")
        .update({
            admin_comment: input.comment || null,
            reviewed_at: reviewedAt,
            reviewed_by: actorId,
            status: "approved",
        })
        .eq("id", request.id)
        .select("*")
        .single();
    if (reviewError) throw new Error(reviewError.message);
    await createNotificationWithEmail(db, {
        action_url: "/office/expenses",
        channel: "in_app",
        company_id: companyId,
        delivery_status: "pending",
        entity_id: request.id,
        entity_type: "expense_change_request",
        is_read: false,
        message: `Admin approved an expense correction for ${String(beforeExpense.item ?? beforeExpense.expense_number ?? "expense")}.`,
        office_id: updatedExpense.office_id ?? request.office_id,
        recipient_type: "office",
        severity: "success",
        title: "Expense correction approved",
    });
    await logUserAction({ action: "expense_change_request_approved", entityType: "expense_change_request", entityId: request.id, companyId, officeId: updatedExpense.office_id ?? request.office_id, beforeData: { request, expense: beforeExpense } as any, afterData: { request: reviewedRequest, expense: updatedExpense } as any });
    revalidateExpenseSurfaces();
    return reviewedRequest;
}

export async function adminSafeDeleteExpense(input: DeleteExpenseInput) {
    const context = await requireCompanyAdminMode();
    const supabase = await createSupabaseServerClient();
    const db = supabase as unknown as { from: (table: string) => any };
    const companyId = context.activeCompany?.id;
    const actorId = context.profile?.id ?? context.authUser?.id ?? null;
    if (!companyId) throw new Error("Active company is required.");
    const expense = await loadExpenseForCompany(db, { companyId, expenseId: input.expenseId });
    const now = new Date().toISOString();
    const deleted = await applyExpensePatch(db, input.expenseId, {
        amount: 0,
        deleted_at: now,
        deleted_by: actorId,
        delete_reason: input.reason || "Admin safe delete",
        status: "deleted",
    });
    await logUserAction({
        action: "expense_admin_safe_deleted",
        entityType: "expense",
        entityId: input.expenseId,
        companyId,
        officeId: String(expense.office_id ?? ""),
        beforeData: expense as any,
        afterData: deleted as any,
    });
    revalidateExpenseSurfaces();
    return deleted;
}

export async function editExpense(input: EditExpenseInput) {
    const context = await activeWriteContext();
    const existing = await getExpenseInActiveOffice(input.expenseId);
    const supabase = await createSupabaseServerClient();
    const amount = Number(input.amount);
    assertAmount(amount);

    const { data, error } = await supabase
        .from("expenses")
        .update({
            amount,
            category: input.category || existing.category,
            category_id: input.categoryId || existing.category_id,
            description: input.description || existing.description,
            expense_date: input.expenseDate || existing.expense_date,
            item: input.item || existing.item,
            property_id: input.propertyId || existing.property_id,
            receipt_url: input.receiptUrl || existing.receipt_url,
            vendor: input.vendor || existing.vendor,
        })
        .eq("id", existing.id)
        .select("*")
        .single();

    if (error) throw new Error(error.message);

    await logUserAction({
        action: "expense_edited",
        entityType: "expense",
        entityId: data.id,
        beforeData: existing,
        afterData: data,
        companyId: context.activeCompany!.id,
        officeId: context.activeOffice!.id,
    });

    revalidateExpenseSurfaces();
    return data;
}

export async function approveExpense(input: ExpenseDecisionInput) {
    const context = await activeWriteContext();
    const existing = await getExpenseInActiveOffice(input.expenseId);
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
        .from("expenses")
        .update({
            approved_at: new Date().toISOString(),
            description: input.notes ? `${existing.description ?? ""}\n[approved] ${input.notes}`.trim() : existing.description,
        })
        .eq("id", existing.id)
        .select("*")
        .single();

    if (error) throw new Error(error.message);

    await logUserAction({
        action: "expense_approved",
        entityType: "expense",
        entityId: data.id,
        beforeData: existing,
        afterData: data,
        companyId: context.activeCompany!.id,
        officeId: context.activeOffice!.id,
    });

    revalidateExpenseSurfaces();
    return data;
}

export async function rejectExpense(input: ExpenseDecisionInput) {
    const context = await activeWriteContext();
    const existing = await getExpenseInActiveOffice(input.expenseId);
    const supabase = await createSupabaseServerClient();
    const rejectionNote = `[rejected] ${input.notes || "Rejected"}`;

    const { data, error } = await supabase
        .from("expenses")
        .update({
            approved_at: null,
            description: `${existing.description ?? ""}\n${rejectionNote}`.trim(),
        })
        .eq("id", existing.id)
        .select("*")
        .single();

    if (error) throw new Error(error.message);

    await logUserAction({
        action: "expense_rejected",
        entityType: "expense",
        entityId: data.id,
        beforeData: existing,
        afterData: data,
        companyId: context.activeCompany!.id,
        officeId: context.activeOffice!.id,
    });

    revalidateExpenseSurfaces();
    return data;
}

export async function createExpenseCategory(input: CreateExpenseCategoryInput) {
    const context = await activeWriteContext();
    const supabase = await createSupabaseServerClient();
    const key = input.key.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const name = input.name.trim();
    if (!key || !name) throw new Error("Category key and name are required.");

    const { data, error } = await supabase
        .from("expense_categories")
        .insert({
            company_id: context.activeCompany!.id,
            key,
            name,
            active: true,
        })
        .select("*")
        .single();

    if (error) throw new Error(error.message);

    await logUserAction({
        action: "expense_category_created",
        entityType: "expense_category",
        entityId: data.id,
        companyId: context.activeCompany!.id,
        officeId: context.activeOffice!.id,
        afterData: data,
    });

    revalidateExpenseSurfaces();
    return data;
}
