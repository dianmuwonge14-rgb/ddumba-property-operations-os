"use server";

import { revalidatePath } from "next/cache";
import { logUserAction } from "@/lib/auth/audit";
import { requireCompanyAdminMode } from "@/lib/auth/permissions";
import { createNotificationWithEmail } from "@/lib/notifications/email";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { salaryDueDateForMonth, salaryMonthKey } from "@/lib/salary-centre/data";

type Db = { from: (table: string) => any };

function db() {
    return createSupabaseAdminClient() as unknown as Db;
}

function text(value: unknown) {
    return String(value ?? "").trim();
}

function amount(value: unknown) {
    const numeric = Number(value ?? 0);
    return Number.isFinite(numeric) ? numeric : 0;
}

const NON_PAYROLL_ACCOUNT_TYPES = new Set(["office", "office_workspace", "service", "system", "shared"]);
const INACTIVE_EMPLOYMENT_STATUSES = new Set(["archived", "deleted", "inactive", "terminated"]);
const OPERATIONAL_ACCOUNT_PAYROLL_MESSAGE = "Operational account — not eligible for payroll.";

function lower(value: unknown) {
    return text(value).toLowerCase();
}

function looksLikeOfficeWorkspaceEmployee(employee: Record<string, unknown>, linkedUser?: Record<string, unknown> | null) {
    const accountType = lower(linkedUser?.account_type);
    const employeeName = lower(employee.full_name);
    const employeeCode = lower(employee.employee_code);
    const roleName = lower(employee.role_name);
    const jobTitle = lower(employee.job_title);
    if (NON_PAYROLL_ACCOUNT_TYPES.has(accountType)) return true;
    return employeeName.includes("office account")
        || employeeName.endsWith(" office login")
        || employeeName.endsWith(" office qa")
        || employeeName === "nakiwogo office"
        || employeeCode.startsWith("off-")
        || roleName.includes("office account")
        || jobTitle === "office user";
}

function assertPayrollEligibleEmployee(employee: Record<string, unknown>, linkedUser?: Record<string, unknown> | null) {
    if (!employee?.id) throw new Error("Employee not found.");
    if (INACTIVE_EMPLOYMENT_STATUSES.has(lower(employee.status))) throw new Error(OPERATIONAL_ACCOUNT_PAYROLL_MESSAGE);
    if (looksLikeOfficeWorkspaceEmployee(employee, linkedUser)) throw new Error(OPERATIONAL_ACCOUNT_PAYROLL_MESSAGE);
}

function paymentDay(value: unknown) {
    return Math.min(31, Math.max(1, Math.round(amount(value) || 1)));
}

function salaryRevalidate() {
    revalidatePath("/office/salary");
    revalidatePath("/office/admin/payroll");
    revalidatePath("/office/admin/employees");
    revalidatePath("/office/employees");
    revalidatePath("/office/notifications");
}

async function notifyEmployee(dbClient: Db, input: { companyId: string; officeId: string | null; employeeId: string; title: string; message: string; severity?: string }) {
    await createNotificationWithEmail(dbClient, {
        action_url: "/office/salary",
        channel: "in_app",
        company_id: input.companyId,
        delivery_status: "pending",
        employee_id: input.employeeId,
        entity_id: input.employeeId,
        entity_type: "salary",
        is_read: false,
        message: input.message,
        office_id: input.officeId,
        recipient_type: "employee",
        severity: input.severity ?? "information",
        title: input.title,
    } as any);
}

export async function updateEmployeeSalaryConfiguration(formData: FormData) {
    const context = await requireCompanyAdminMode();
    const companyId = context.activeCompany?.id;
    if (!companyId) throw new Error("Active company is required.");
    const employeeId = text(formData.get("employeeId"));
    if (!employeeId) throw new Error("Employee is required.");
    const monthlySalary = amount(formData.get("monthlySalary"));
    const salaryDay = paymentDay(formData.get("salaryPaymentDay"));
    const dbClient = db();
    const { data: employee, error: employeeError } = await dbClient.from("employees").select("*").eq("company_id", companyId).eq("id", employeeId).maybeSingle();
    if (employeeError) throw new Error(employeeError.message);
    if (!employee) throw new Error("Employee not found.");
    const { data: linkedUser, error: linkedUserError } = employee.user_id
        ? await dbClient.from("users").select("id,account_type,full_name,status").eq("company_id", companyId).eq("id", employee.user_id).maybeSingle()
        : { data: null, error: null };
    if (linkedUserError) throw new Error(linkedUserError.message);
    assertPayrollEligibleEmployee(employee, linkedUser);
    const before = { basic_salary: employee.basic_salary, salary_payment_day: employee.salary_payment_day ?? employee.salary_receiving_day };
    const { data: updated, error: updateError } = await dbClient.from("employees").update({
        basic_salary: monthlySalary,
        salary_payment_day: salaryDay,
        salary_receiving_day: salaryDay,
        employment_type: text(formData.get("salaryType")) || employee.employment_type || "full_time",
        status: text(formData.get("employmentStatus")) || employee.status || "active",
        updated_at: new Date().toISOString(),
    }).eq("company_id", companyId).eq("id", employeeId).select("*").single();
    if (updateError) throw new Error(updateError.message);
    const { error: profileError } = await dbClient.from("payroll_profiles").upsert({
        active: true,
        base_salary: monthlySalary,
        company_id: companyId,
        employee_id: employeeId,
        office_id: updated.office_id ?? null,
        payment_method: text(formData.get("paymentMethod")) || null,
        salary_payment_day: salaryDay,
        salary_type: text(formData.get("salaryType")) || "monthly",
        updated_at: new Date().toISOString(),
    }, { onConflict: "employee_id" });
    if (profileError) throw new Error(profileError.message);
    await logUserAction({ action: "employee_salary_configured", entityType: "employee", entityId: employeeId, companyId, officeId: updated.office_id, beforeData: before, afterData: { monthlySalary, salaryDay } });
    salaryRevalidate();
}

export async function recordSalaryPayment(formData: FormData) {
    const context = await requireCompanyAdminMode();
    const companyId = context.activeCompany?.id;
    if (!companyId) throw new Error("Active company is required.");
    const employeeId = text(formData.get("employeeId"));
    const paidAmount = amount(formData.get("paidAmount"));
    if (!employeeId || paidAmount <= 0) throw new Error("Employee and positive payment amount are required.");
    const dbClient = db();
    const monthKey = text(formData.get("monthKey")) || salaryMonthKey();
    const { data: employee, error: employeeError } = await dbClient.from("employees").select("*").eq("company_id", companyId).eq("id", employeeId).maybeSingle();
    if (employeeError) throw new Error(employeeError.message);
    if (!employee) throw new Error("Employee not found.");
    const { data: linkedUser, error: linkedUserError } = employee.user_id
        ? await dbClient.from("users").select("id,account_type,full_name,status").eq("company_id", companyId).eq("id", employee.user_id).maybeSingle()
        : { data: null, error: null };
    if (linkedUserError) throw new Error(linkedUserError.message);
    assertPayrollEligibleEmployee(employee, linkedUser);
    const officeId = employee.office_id ?? (text(formData.get("officeId")) || null);
    const [bonusRows, expenseRows, advanceRows, fineRows, existingPayments] = await Promise.all([
        dbClient.from("employee_bonuses").select("amount").eq("company_id", companyId).eq("employee_id", employeeId).eq("month_key", monthKey).eq("active", true),
        dbClient.from("employee_expenses").select("amount").eq("company_id", companyId).eq("employee_id", employeeId).eq("month_key", monthKey).eq("active", true).eq("approved_for_payroll", true),
        dbClient.from("employee_advances").select("amount,remaining_balance").eq("company_id", companyId).eq("employee_id", employeeId).eq("month_key", monthKey).eq("active", true),
        dbClient.from("employee_fines").select("amount").eq("company_id", companyId).eq("employee_id", employeeId).eq("month_key", monthKey).eq("active", true),
        dbClient.from("employee_salary_payments").select("paid_amount").eq("company_id", companyId).eq("employee_id", employeeId).eq("month_key", monthKey),
    ]);
    for (const result of [bonusRows, expenseRows, advanceRows, fineRows, existingPayments]) if (result.error) throw new Error(result.error.message);
    const bonuses = (bonusRows.data ?? []).reduce((total: number, row: any) => total + amount(row.amount), 0);
    const expenses = (expenseRows.data ?? []).reduce((total: number, row: any) => total + amount(row.amount), 0);
    const advances = (advanceRows.data ?? []).reduce((total: number, row: any) => total + amount(row.remaining_balance ?? row.amount), 0);
    const fines = (fineRows.data ?? []).reduce((total: number, row: any) => total + amount(row.amount), 0);
    const gross = amount(employee.basic_salary);
    const deductions = expenses + advances + fines;
    const netSalary = Math.max(0, gross + bonuses - deductions);
    const alreadyPaid = (existingPayments.data ?? []).reduce((total: number, row: any) => total + amount(row.paid_amount), 0);
    const nextPaid = alreadyPaid + paidAmount;
    const remaining = Math.max(0, netSalary - nextPaid);
    const status = netSalary <= 0 ? "not_configured" : remaining <= 0 ? "paid" : nextPaid > 0 ? "partially_paid" : "pending_payment";
    const dueDate = salaryDueDateForMonth(monthKey, paymentDay(employee.salary_payment_day ?? employee.salary_receiving_day ?? 1));
    const { data: payroll, error: payrollError } = await dbClient.from("employee_payroll_months").upsert({
        active: true,
        allowances: bonuses,
        amount_paid: nextPaid,
        advances,
        approved_by: context.profile?.id ?? null,
        basic_salary: gross,
        bonuses,
        company_id: companyId,
        deductions,
        due_date: dueDate,
        employee_id: employeeId,
        final_salary_payable: netSalary,
        fines,
        gross_salary: gross,
        month_key: monthKey,
        net_salary: netSalary,
        office_id: officeId,
        payment_status: status,
        personal_expenses: expenses,
        remaining_balance: remaining,
        salary_month: monthKey,
        status,
        updated_at: new Date().toISOString(),
    }, { onConflict: "company_id,employee_id,month_key" }).select("*").single();
    if (payrollError) throw new Error(payrollError.message);
    const { data: payment, error: paymentError } = await dbClient.from("employee_salary_payments").insert({
        approved_by: context.profile?.id ?? null,
        company_id: companyId,
        employee_id: employeeId,
        month_key: monthKey,
        notes: text(formData.get("notes")) || null,
        office_id: officeId,
        paid_amount: paidAmount,
        paid_by: context.profile?.id ?? null,
        payment_method: text(formData.get("paymentMethod")) || null,
        payroll_month_id: payroll.id,
        reference: text(formData.get("reference")) || null,
        remaining_balance_after: remaining,
        salary_month: monthKey,
    } as any).select("*").single();
    if (paymentError) throw new Error(paymentError.message);
    await notifyEmployee(dbClient, {
        companyId,
        employeeId,
        officeId,
        severity: remaining <= 0 ? "success" : "information",
        title: remaining <= 0 ? "Salary fully paid" : "Salary payment recorded",
        message: remaining <= 0 ? `Your ${monthKey.slice(0, 7)} salary has been fully paid.` : `A salary payment has been recorded. Remaining balance: UGX ${Math.round(remaining).toLocaleString()}.`,
    });
    await logUserAction({ action: "salary_payment_recorded", entityType: "employee_salary_payment", entityId: payment.id, companyId, officeId, afterData: { payroll, payment } });
    salaryRevalidate();
}
