"use server";

import { revalidatePath } from "next/cache";
import { logUserAction } from "@/lib/auth/audit";
import { canAccessOffice, requireAuth, requireCompanyAdminMode } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Db = { from: (table: string) => any };

function db() {
    return createSupabaseAdminClient() as unknown as Db;
}

function amount(value: unknown) {
    const numeric = Number(value ?? 0);
    return Number.isFinite(numeric) ? numeric : 0;
}

function text(value: unknown) {
    return String(value ?? "").trim();
}

const EMPLOYEE_OPTIONAL_COLUMNS = new Set([
    "age",
    "advance_deduction_rule",
    "daily_lunch_allowance",
    "default_office_id",
    "employee_assignment_type",
    "is_field_agent",
    "normal_salary_after_probation",
    "primary_office_id",
    "probation_end_date",
    "probation_salary",
    "probation_start_date",
    "probation_status",
    "salary_payment_day",
]);

function missingSchemaName(message: string) {
    const quoted = message.match(/'([^']+)' column|column \"([^\"]+)\"|relation \"([^\"]+)\"|table public\.([a-zA-Z0-9_]+)/i);
    return quoted?.[1] ?? quoted?.[2] ?? quoted?.[3] ?? quoted?.[4] ?? null;
}

function isSchemaLagError(error: { message?: string } | null | undefined) {
    return /schema cache|Could not find|does not exist|column .* does not exist|relation .* does not exist/i.test(error?.message ?? "");
}

function withoutColumn<T extends Record<string, unknown>>(payload: T, column: string) {
    const next = { ...payload };
    delete next[column];
    return next;
}

async function insertEmployeeWithSchemaFallback(payload: Record<string, unknown>) {
    let current = { ...payload };
    for (let attempt = 0; attempt < 12; attempt += 1) {
        const { data, error } = await db().from("employees").insert(current).select("*").single();
        if (!error) return data;
        const missing = missingSchemaName(error.message ?? "");
        if (isSchemaLagError(error) && missing && EMPLOYEE_OPTIONAL_COLUMNS.has(missing) && missing in current) {
            current = withoutColumn(current, missing);
            continue;
        }
        throw new Error(error.message);
    }
    throw new Error("Employee could not be created because the live employees schema is missing too many expected optional columns.");
}

async function updateEmployeeWithSchemaFallback(employeeId: string, companyId: string, payload: Record<string, unknown>) {
    let current = { ...payload };
    for (let attempt = 0; attempt < 12; attempt += 1) {
        const { data, error } = await db().from("employees").update(current).eq("id", employeeId).eq("company_id", companyId).select("*").single();
        if (!error) return data;
        const missing = missingSchemaName(error.message ?? "");
        if (isSchemaLagError(error) && missing && EMPLOYEE_OPTIONAL_COLUMNS.has(missing) && missing in current) {
            current = withoutColumn(current, missing);
            continue;
        }
        throw new Error(error.message);
    }
    throw new Error("Employee could not be updated because the live employees schema is missing too many expected optional columns.");
}

async function optionalRows(query: any) {
    const result = await query;
    if (result.error && isSchemaLagError(result.error)) return { data: [], error: null };
    return result;
}

function monthKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function revalidateEmployees() {
    revalidatePath("/office/admin/employees");
    revalidatePath("/office/employees");
    revalidatePath("/office/notifications");
    revalidatePath("/office/admin");
    revalidatePath("/office/ai");
    revalidatePath("/office/reports");
}

function employeeOfficeAssignment(formData: FormData) {
    const requestedOfficeId = text(formData.get("officeId"));
    const isAllRounder = requestedOfficeId === "all_rounder" || text(formData.get("employeeAssignmentType")) === "all_rounder";
    return {
        assignmentType: isAllRounder ? "all_rounder" : "fixed_office",
        officeId: isAllRounder ? null : requestedOfficeId || null,
        defaultOfficeId: isAllRounder ? null : requestedOfficeId || null,
    };
}

async function notify(db: Db, input: {
    companyId: string;
    officeId: string | null;
    title: string;
    message: string;
    recipientType: "admin" | "office";
    severity?: string;
    entityType?: string;
    entityId?: string | null;
}) {
    await db.from("notifications").insert({
        action_url: "/office/notifications",
        channel: "in_app",
        company_id: input.companyId,
        delivery_status: "pending",
        entity_id: input.entityId ?? null,
        entity_type: input.entityType ?? "employee",
        is_read: false,
        message: input.message,
        office_id: input.officeId,
        recipient_type: input.recipientType,
        severity: input.severity ?? "information",
        title: input.title,
    });
}

async function syncEmployeeAllowanceSettings(input: {
    actorId: string | null;
    companyId: string;
    employeeId: string;
    officeId: string | null;
    basicSalary: number;
    dailyLunchAllowance: number;
    salaryPaymentDay: number;
    advanceDeductionRule: string;
}) {
    const dbClient = db();
    await dbClient
        .from("employee_allowance_settings")
        .update({ active: false, updated_at: new Date().toISOString(), updated_by: input.actorId })
        .eq("company_id", input.companyId)
        .eq("employee_id", input.employeeId)
        .eq("active", true);
    const { error } = await dbClient.from("employee_allowance_settings").insert({
        active: true,
        advance_deduction_rule: input.advanceDeductionRule,
        basic_salary: input.basicSalary,
        company_id: input.companyId,
        created_by: input.actorId,
        daily_lunch_allowance: input.dailyLunchAllowance,
        employee_id: input.employeeId,
        office_id: input.officeId,
        salary_payment_day: input.salaryPaymentDay,
        updated_by: input.actorId,
    });
    if (error && !/does not exist|schema cache|Could not find the table/i.test(error.message ?? "")) {
        throw new Error(error.message);
    }
}

function assertOfficeEmployee(context: Awaited<ReturnType<typeof requireAuth>>, officeId: string | null) {
    if (!officeId || !canAccessOffice(context, officeId)) {
        throw new Error("You can only manage employees assigned to your active office.");
    }
}

export async function createEmployee(formData: FormData) {
    const context = await requireCompanyAdminMode();
    const companyId = context.activeCompany?.id;
    if (!companyId) throw new Error("Active company is required.");
    const fullName = text(formData.get("fullName"));
    if (!fullName) throw new Error("Employee name is required.");
    const assignment = employeeOfficeAssignment(formData);
    const officeId = assignment.officeId;
    const roleId = text(formData.get("roleId")) || null;
    const roleName = text(formData.get("roleName"));
    const payload = {
        company_id: companyId,
        office_id: officeId,
        default_office_id: assignment.defaultOfficeId,
        employee_assignment_type: assignment.assignmentType,
        role_id: roleId,
        role_name: roleName || null,
        full_name: fullName,
        age: amount(formData.get("age")) || null,
        employee_code: text(formData.get("employeeCode")) || `EMP-${Date.now()}`,
        phone: text(formData.get("phone")) || null,
        email: text(formData.get("email")) || null,
        hire_date: text(formData.get("startDate")) || null,
        basic_salary: amount(formData.get("basicSalary")),
        salary_receiving_day: amount(formData.get("salaryDay")) || 28,
        salary_payment_day: amount(formData.get("salaryDay")) || 28,
        daily_lunch_allowance: amount(formData.get("dailyLunchAllowance")),
        advance_deduction_rule: text(formData.get("advanceDeductionRule")) || "deduct_current_salary",
        probation_start_date: text(formData.get("probationStartDate")) || text(formData.get("startDate")) || null,
        probation_end_date: text(formData.get("probationEndDate")) || null,
        probation_salary: amount(formData.get("probationSalary")),
        normal_salary_after_probation: amount(formData.get("normalSalaryAfterProbation")) || amount(formData.get("basicSalary")),
        probation_status: text(formData.get("probationStatus")) || "in_probation",
        is_field_agent: text(formData.get("isFieldAgent")) === "on",
        primary_office_id: officeId,
        off_days: text(formData.get("offDays")).split(",").map((day) => day.trim()).filter(Boolean),
        status: text(formData.get("status")) || "active",
        notes: text(formData.get("notes")) || null,
        created_by: context.profile?.id ?? null,
        updated_at: new Date().toISOString(),
    };
    const data = await insertEmployeeWithSchemaFallback(payload);
    await syncEmployeeAllowanceSettings({
        actorId: context.profile?.id ?? null,
        basicSalary: amount(formData.get("basicSalary")),
        companyId,
        dailyLunchAllowance: amount(formData.get("dailyLunchAllowance")),
        employeeId: data.id,
        officeId,
        advanceDeductionRule: text(formData.get("advanceDeductionRule")) || "deduct_current_salary",
        salaryPaymentDay: amount(formData.get("salaryDay")) || 28,
    });
    await logUserAction({ action: "employee_created", entityType: "employee", entityId: data.id, companyId, officeId, afterData: data });
    revalidateEmployees();
}

export async function updateEmployee(formData: FormData) {
    const context = await requireCompanyAdminMode();
    const companyId = context.activeCompany?.id;
    if (!companyId) throw new Error("Active company is required.");
    const employeeId = text(formData.get("employeeId"));
    if (!employeeId) throw new Error("Employee is required.");
    const payload = {
        office_id: employeeOfficeAssignment(formData).officeId,
        default_office_id: employeeOfficeAssignment(formData).defaultOfficeId,
        employee_assignment_type: employeeOfficeAssignment(formData).assignmentType,
        role_id: text(formData.get("roleId")) || null,
        role_name: text(formData.get("roleName")) || null,
        full_name: text(formData.get("fullName")),
        age: amount(formData.get("age")) || null,
        employee_code: text(formData.get("employeeCode")) || null,
        phone: text(formData.get("phone")) || null,
        email: text(formData.get("email")) || null,
        hire_date: text(formData.get("startDate")) || null,
        basic_salary: amount(formData.get("basicSalary")),
        salary_receiving_day: amount(formData.get("salaryDay")) || 28,
        salary_payment_day: amount(formData.get("salaryDay")) || 28,
        daily_lunch_allowance: amount(formData.get("dailyLunchAllowance")),
        advance_deduction_rule: text(formData.get("advanceDeductionRule")) || "deduct_current_salary",
        probation_start_date: text(formData.get("probationStartDate")) || null,
        probation_end_date: text(formData.get("probationEndDate")) || null,
        probation_salary: amount(formData.get("probationSalary")),
        normal_salary_after_probation: amount(formData.get("normalSalaryAfterProbation")) || amount(formData.get("basicSalary")),
        probation_status: text(formData.get("probationStatus")) || "not_started",
        is_field_agent: text(formData.get("isFieldAgent")) === "on",
        primary_office_id: employeeOfficeAssignment(formData).officeId,
        off_days: text(formData.get("offDays")).split(",").map((day) => day.trim()).filter(Boolean),
        status: text(formData.get("status")) || "active",
        notes: text(formData.get("notes")) || null,
        updated_at: new Date().toISOString(),
    };
    const { data: before } = await db().from("employees").select("*").eq("id", employeeId).eq("company_id", companyId).maybeSingle();
    const data = await updateEmployeeWithSchemaFallback(employeeId, companyId, payload);
    await syncEmployeeAllowanceSettings({
        actorId: context.profile?.id ?? null,
        basicSalary: amount(formData.get("basicSalary")),
        companyId,
        dailyLunchAllowance: amount(formData.get("dailyLunchAllowance")),
        employeeId,
        officeId: data.office_id ?? null,
        advanceDeductionRule: text(formData.get("advanceDeductionRule")) || "deduct_current_salary",
        salaryPaymentDay: amount(formData.get("salaryDay")) || 28,
    });
    await logUserAction({ action: "employee_updated", entityType: "employee", entityId: employeeId, companyId, officeId: data.office_id, beforeData: before, afterData: data });
    revalidateEmployees();
}

export async function addEmployeeReference(formData: FormData) {
    const context = await requireCompanyAdminMode();
    const companyId = context.activeCompany?.id;
    if (!companyId) throw new Error("Active company is required.");
    const employeeId = text(formData.get("employeeId"));
    const fullName = text(formData.get("referenceName"));
    if (!employeeId || !fullName) throw new Error("Employee and reference name are required.");
    const officeId = text(formData.get("officeId")) || null;
    const payload = {
        company_id: companyId,
        office_id: officeId,
        employee_id: employeeId,
        full_name: fullName,
        relationship: text(formData.get("relationship")) || null,
        phone: text(formData.get("referencePhone")) || null,
        created_by: context.profile?.id ?? null,
    };
    const { data, error } = await db().from("employee_references").insert(payload).select("*").single();
    if (error) throw new Error(error.message);
    await logUserAction({ action: "employee_reference_added", entityType: "employee", entityId: employeeId, companyId, officeId, afterData: data });
    revalidateEmployees();
}

export async function addEmployeePayrollItem(formData: FormData) {
    const context = await requireCompanyAdminMode();
    const companyId = context.activeCompany?.id;
    if (!companyId) throw new Error("Active company is required.");
    const employeeId = text(formData.get("employeeId"));
    const itemType = text(formData.get("itemType"));
    const value = amount(formData.get("amount"));
    if (!employeeId || value <= 0) throw new Error("Employee and positive amount are required.");
    const officeId = text(formData.get("officeId")) || null;
    const table = {
        expense: "employee_expenses",
        advance: "employee_advances",
        bonus: "employee_bonuses",
        fine: "employee_fines",
    }[itemType] ?? "";
    if (!table) throw new Error("Unsupported payroll item.");
    const base = {
        company_id: companyId,
        office_id: officeId,
        employee_id: employeeId,
        month_key: monthKey(),
        amount: value,
        created_by: context.profile?.id ?? null,
    };
    const payload = itemType === "advance"
        ? { ...base, remaining_balance: value, reason: text(formData.get("reason")) || null, advance_date: new Date().toISOString().slice(0, 10) }
        : itemType === "fine"
            ? { ...base, reason: text(formData.get("reason")) || "custom reason", fine_type: text(formData.get("fineType")) || "custom", fine_date: new Date().toISOString().slice(0, 10) }
            : itemType === "bonus"
                ? { ...base, reason: text(formData.get("reason")) || null, bonus_date: new Date().toISOString().slice(0, 10) }
                : { ...base, note: text(formData.get("reason")) || null, expense_date: new Date().toISOString().slice(0, 10) };
    const { data, error } = await db().from(table).insert(payload).select("*").single();
    if (error) throw new Error(error.message);
    await logUserAction({ action: `employee_${itemType}_added`, entityType: table, entityId: data.id, companyId, officeId, afterData: data });
    revalidateEmployees();
}

export async function markEmployeeSalaryPaid(formData: FormData) {
    const context = await requireCompanyAdminMode();
    const companyId = context.activeCompany?.id;
    if (!companyId) throw new Error("Active company is required.");
    const employeeId = text(formData.get("employeeId"));
    const officeId = text(formData.get("officeId")) || null;
    const paidAmount = amount(formData.get("paidAmount"));
    if (!employeeId || paidAmount <= 0) throw new Error("Employee and paid amount are required.");
    const currentMonth = monthKey();
    const { data: employee, error: employeeError } = await db().from("employees").select("*").eq("id", employeeId).eq("company_id", companyId).maybeSingle();
    if (employeeError) throw new Error(employeeError.message);
    if (!employee) throw new Error("Employee not found.");
    const [expenses, advances, bonuses, fines, lunchLedger] = await Promise.all([
        optionalRows(db().from("employee_expenses").select("amount").eq("company_id", companyId).eq("employee_id", employeeId).eq("month_key", currentMonth).eq("active", true).eq("approved_for_payroll", true)),
        optionalRows(db().from("employee_advances").select("remaining_balance,amount").eq("company_id", companyId).eq("employee_id", employeeId).eq("month_key", currentMonth).eq("active", true)),
        optionalRows(db().from("employee_bonuses").select("amount").eq("company_id", companyId).eq("employee_id", employeeId).eq("month_key", currentMonth).eq("active", true)),
        optionalRows(db().from("employee_fines").select("amount").eq("company_id", companyId).eq("employee_id", employeeId).eq("month_key", currentMonth).eq("active", true)),
        optionalRows(db().from("employee_lunch_ledger").select("entry_type,earned_amount,taken_amount").eq("company_id", companyId).eq("employee_id", employeeId).eq("month_key", currentMonth).eq("active", true)),
    ]);
    for (const result of [expenses, advances, bonuses, fines, lunchLedger]) if (result.error) throw new Error(result.error.message);
    const sum = (rows: any[], key = "amount") => rows.reduce((total, row) => total + amount(row[key]), 0);
    const basic = amount(employee.basic_salary);
    const bonusTotal = sum(bonuses.data ?? []);
    const expenseTotal = sum(expenses.data ?? []);
    const advanceTotal = (advances.data ?? []).reduce((total: number, row: any) => total + amount(row.remaining_balance ?? row.amount), 0);
    const fineTotal = sum(fines.data ?? []);
    const lunchEarned = (lunchLedger.data ?? []).reduce((total: number, row: any) => total + amount(row.earned_amount), 0);
    const lunchTaken = (lunchLedger.data ?? []).reduce((total: number, row: any) => total + amount(row.taken_amount), 0);
    const unusedLunchBalance = Math.max(0, lunchEarned - lunchTaken);
    const finalSalary = Math.max(0, basic + bonusTotal + unusedLunchBalance - expenseTotal - advanceTotal - fineTotal);
    const payrollPayload = {
        company_id: companyId,
        office_id: officeId,
        employee_id: employeeId,
        month_key: currentMonth,
        basic_salary: basic,
        bonuses: bonusTotal,
        personal_expenses: expenseTotal,
        advances: advanceTotal,
        fines: fineTotal,
        lunch_allowance_earned: lunchEarned,
        lunch_money_taken: lunchTaken,
        unused_lunch_balance: unusedLunchBalance,
        final_salary_payable: finalSalary,
        amount_paid: paidAmount,
        status: paidAmount >= finalSalary ? "paid" : "partial",
        created_by: context.profile?.id ?? null,
        updated_at: new Date().toISOString(),
    };
    const { data: payroll, error: payrollError } = await db()
        .from("employee_payroll_months")
        .upsert(payrollPayload, { onConflict: "company_id,employee_id,month_key" })
        .select("*")
        .single();
    if (payrollError) throw new Error(payrollError.message);
    const { data: payment, error: paymentError } = await db().from("employee_salary_payments").insert({
        company_id: companyId,
        office_id: officeId,
        employee_id: employeeId,
        payroll_month_id: payroll.id,
        month_key: currentMonth,
        paid_amount: paidAmount,
        payment_method: text(formData.get("paymentMethod")) || null,
        reference: text(formData.get("reference")) || null,
        paid_by: context.profile?.id ?? null,
        notes: text(formData.get("notes")) || null,
    }).select("*").single();
    if (paymentError) throw new Error(paymentError.message);
    await Promise.all([
        db().from("employee_expenses").update({ active: false, status: "closed" }).eq("company_id", companyId).eq("employee_id", employeeId).eq("month_key", currentMonth),
        db().from("employee_advances").update({ active: false, status: "fully_deducted", amount_deducted: advanceTotal, remaining_balance: 0 }).eq("company_id", companyId).eq("employee_id", employeeId).eq("month_key", currentMonth),
        db().from("employee_bonuses").update({ active: false, status: "paid" }).eq("company_id", companyId).eq("employee_id", employeeId).eq("month_key", currentMonth),
        db().from("employee_fines").update({ active: false, status: "deducted" }).eq("company_id", companyId).eq("employee_id", employeeId).eq("month_key", currentMonth),
    ]);
    await logUserAction({ action: "employee_salary_paid", entityType: "employee_salary_payment", entityId: payment.id, companyId, officeId, afterData: { payroll, payment } });
    revalidateEmployees();
}

export async function addEmployeeDocument(formData: FormData) {
    const context = await requireCompanyAdminMode();
    const companyId = context.activeCompany?.id;
    if (!companyId) throw new Error("Active company is required.");
    const employeeId = text(formData.get("employeeId"));
    const fileName = text(formData.get("fileName"));
    if (!employeeId || !fileName) throw new Error("Employee and document name are required.");
    const payload = {
        company_id: companyId,
        office_id: text(formData.get("officeId")) || null,
        employee_id: employeeId,
        document_type: text(formData.get("documentType")) || "other",
        file_name: fileName,
        file_url: text(formData.get("fileUrl")) || null,
        notes: text(formData.get("notes")) || null,
        uploaded_by: context.profile?.id ?? null,
    };
    const { data, error } = await db().from("employee_documents").insert(payload).select("*").single();
    if (error) throw new Error(error.message);
    await logUserAction({ action: "employee_document_added", entityType: "employee_document", entityId: data.id, companyId, officeId: payload.office_id, afterData: data });
    revalidateEmployees();
}

export async function generateEmployeeContract(formData: FormData) {
    const context = await requireCompanyAdminMode();
    const companyId = context.activeCompany?.id;
    if (!companyId) throw new Error("Active company is required.");
    const employeeId = text(formData.get("employeeId"));
    if (!employeeId) throw new Error("Employee is required.");
    const { data: employee, error } = await db().from("employees").select("*").eq("company_id", companyId).eq("id", employeeId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!employee) throw new Error("Employee not found.");
    const contractText = [
        `${context.activeCompany?.name ?? "Ddumba OS"} Employment Contract`,
        "",
        `Employee: ${employee.full_name}`,
        `Role: ${employee.role_name ?? employee.job_title ?? "Assigned role"}`,
        `Office: ${employee.office_id ?? "Assigned office"}`,
        `Basic salary: UGX ${Math.round(amount(employee.basic_salary)).toLocaleString()}`,
        `Start date: ${employee.hire_date ?? "To be confirmed"}`,
        `Off days: ${Array.isArray(employee.off_days) ? employee.off_days.join(", ") : "As assigned"}`,
        "",
        "Duties: The employee will perform assigned operational, attendance, reporting, collection, and administrative responsibilities.",
        "Confidentiality: Company, tenant, landlord, payroll, and office data must remain confidential.",
        "Attendance: The employee must follow office attendance rules and submit required reports.",
        "Termination: Employment may be terminated according to company policy and applicable law.",
        "",
        "Employee Signature: ____________________",
        "Company Representative: ________________",
    ].join("\n");
    const { data, error: insertError } = await db().from("employee_contracts").insert({
        company_id: companyId,
        office_id: employee.office_id,
        employee_id: employeeId,
        role_id: employee.role_id,
        contract_text: contractText,
        generated_by: context.profile?.id ?? null,
    }).select("*").single();
    if (insertError) throw new Error(insertError.message);
    await logUserAction({ action: "employee_contract_generated", entityType: "employee_contract", entityId: data.id, companyId, officeId: employee.office_id, afterData: data });
    revalidateEmployees();
}

export async function terminateEmployee(formData: FormData) {
    const context = await requireCompanyAdminMode();
    const companyId = context.activeCompany?.id;
    if (!companyId) throw new Error("Active company is required.");
    const employeeId = text(formData.get("employeeId"));
    const reason = text(formData.get("terminationReason"));
    if (!employeeId || !reason) throw new Error("Employee and termination reason are required.");
    const officeId = text(formData.get("officeId")) || null;
    const terminationDate = text(formData.get("terminationDate")) || new Date().toISOString().slice(0, 10);
    const { data: record, error } = await db().from("employee_termination_records").insert({
        company_id: companyId,
        office_id: officeId,
        employee_id: employeeId,
        termination_date: terminationDate,
        reason,
        created_by: context.profile?.id ?? null,
    }).select("*").single();
    if (error) throw new Error(error.message);
    await db().from("employees").update({ status: "terminated", termination_date: terminationDate, updated_at: new Date().toISOString() }).eq("company_id", companyId).eq("id", employeeId);
    await logUserAction({ action: "employee_terminated", entityType: "employee_termination_record", entityId: record.id, companyId, officeId, afterData: record });
    revalidateEmployees();
}

export async function recordOfficeEmployeeExpense(formData: FormData) {
    const context = await requireAuth();
    const companyId = context.activeCompany?.id;
    const officeId = context.activeOffice?.id || text(formData.get("officeId")) || null;
    if (!companyId) throw new Error("Active company is required.");
    assertOfficeEmployee(context, officeId);
    const employeeId = text(formData.get("employeeId"));
    const value = amount(formData.get("amount"));
    if (!employeeId || value <= 0) throw new Error("Employee and positive amount are required.");
    const dbClient = db();
    const { data: employee, error: employeeError } = await dbClient
        .from("employees")
        .select("id,full_name,office_id,is_field_agent")
        .eq("company_id", companyId)
        .eq("id", employeeId)
        .maybeSingle();
    if (employeeError) throw new Error(employeeError.message);
    if (!employee) throw new Error("Employee not found.");
    if (employee.office_id !== officeId && !employee.is_field_agent) throw new Error("Employee is not assigned to this office.");

    const payload = {
        company_id: companyId,
        office_id: officeId,
        employee_id: employeeId,
        month_key: monthKey(new Date(text(formData.get("expenseDate")) || Date.now())),
        amount: value,
        category: "employee_personal",
        note: text(formData.get("reason")) || null,
        expense_date: text(formData.get("expenseDate")) || new Date().toISOString().slice(0, 10),
        status: "approved",
        active: true,
        recorded_by_office: true,
        approved_for_payroll: true,
        expense_source: "office",
        created_by: context.profile?.id ?? null,
    };
    const { data, error } = await dbClient.from("employee_expenses").insert(payload).select("*").single();
    if (error) throw new Error(error.message);
    await notify(dbClient, {
        companyId,
        officeId,
        recipientType: "admin",
        entityType: "employee_expense",
        entityId: data.id,
        title: "Employee expense recorded",
        message: `${employee.full_name ?? "Employee"} expense of UGX ${Math.round(value).toLocaleString()} was recorded by office.`,
        severity: "information",
    });
    await logUserAction({ action: "employee_expense_recorded_by_office", entityType: "employee_expense", entityId: data.id, companyId, officeId, afterData: data });
    revalidateEmployees();
}

export async function requestEmployeeAdvance(formData: FormData) {
    const context = await requireAuth();
    const companyId = context.activeCompany?.id;
    const officeId = context.activeOffice?.id || text(formData.get("officeId")) || null;
    if (!companyId) throw new Error("Active company is required.");
    assertOfficeEmployee(context, officeId);
    const employeeId = text(formData.get("employeeId"));
    const value = amount(formData.get("amount"));
    const reason = text(formData.get("reason"));
    if (!employeeId || value <= 0 || !reason) throw new Error("Employee, amount, and reason are required.");
    const dbClient = db();
    const { data, error } = await dbClient.from("employee_advance_requests").insert({
        company_id: companyId,
        office_id: officeId,
        employee_id: employeeId,
        amount: value,
        reason,
        request_date: new Date().toISOString().slice(0, 10),
        status: "pending",
        requested_by: context.profile?.id ?? null,
    }).select("*").single();
    if (error) throw new Error(error.message);
    await notify(dbClient, {
        companyId,
        officeId,
        recipientType: "admin",
        entityType: "employee_advance_request",
        entityId: data.id,
        title: "Employee advance request",
        message: `Advance request of UGX ${Math.round(value).toLocaleString()} submitted for admin approval.`,
        severity: "warning",
    });
    await logUserAction({ action: "employee_advance_requested", entityType: "employee_advance_request", entityId: data.id, companyId, officeId, afterData: data });
    revalidateEmployees();
}

export async function requestEmployeeOffDays(formData: FormData) {
    const context = await requireAuth();
    const companyId = context.activeCompany?.id;
    const officeId = context.activeOffice?.id || text(formData.get("officeId")) || null;
    if (!companyId) throw new Error("Active company is required.");
    assertOfficeEmployee(context, officeId);
    const employeeId = text(formData.get("employeeId"));
    const startDate = text(formData.get("startDate"));
    const endDate = text(formData.get("endDate"));
    if (!employeeId || !startDate || !endDate) throw new Error("Employee, start date, and end date are required.");
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
    if (!Number.isFinite(days) || days <= 0) throw new Error("Off-day range is invalid.");
    if (days > 7) throw new Error("One approved leave period cannot exceed 7 days.");
    const leadDays = Math.floor((start.getTime() - Date.now()) / 86400000);
    const isLongLeave = days >= 4;
    if (isLongLeave && leadDays < 14) throw new Error("Long carried off-day requests must be submitted at least 2 weeks earlier.");
    const dbClient = db();
    const { data, error } = await dbClient.from("employee_off_day_requests").insert({
        company_id: companyId,
        office_id: officeId,
        employee_id: employeeId,
        start_date: startDate,
        end_date: endDate,
        requested_days: days,
        reason: text(formData.get("reason")) || null,
        is_long_leave: isLongLeave,
        status: "pending",
        requested_by: context.profile?.id ?? null,
    }).select("*").single();
    if (error) throw new Error(error.message);
    await notify(dbClient, {
        companyId,
        officeId,
        recipientType: "admin",
        entityType: "employee_off_day_request",
        entityId: data.id,
        title: "Employee off-day request",
        message: `${days} day off request submitted for admin approval.`,
        severity: isLongLeave ? "warning" : "information",
    });
    await logUserAction({ action: "employee_off_day_requested", entityType: "employee_off_day_request", entityId: data.id, companyId, officeId, afterData: data });
    revalidateEmployees();
}

export async function decideEmployeeAdvanceRequest(formData: FormData) {
    const context = await requireCompanyAdminMode();
    const companyId = context.activeCompany?.id;
    if (!companyId) throw new Error("Active company is required.");
    const requestId = text(formData.get("requestId"));
    const decision = text(formData.get("decision"));
    const comment = text(formData.get("adminComment"));
    if (!requestId || !["approved", "rejected"].includes(decision)) throw new Error("Valid request decision is required.");
    const dbClient = db();
    const { data: request, error: requestError } = await dbClient.from("employee_advance_requests").select("*").eq("company_id", companyId).eq("id", requestId).maybeSingle();
    if (requestError) throw new Error(requestError.message);
    if (!request) throw new Error("Advance request not found.");

    let approvedAdvanceId: string | null = null;
    if (decision === "approved") {
        const { data: advance, error: advanceError } = await dbClient.from("employee_advances").insert({
            company_id: companyId,
            office_id: request.office_id,
            employee_id: request.employee_id,
            month_key: monthKey(),
            amount: amount(request.amount),
            amount_deducted: 0,
            remaining_balance: amount(request.amount),
            reason: request.reason,
            advance_date: new Date().toISOString().slice(0, 10),
            status: "pending",
            active: true,
            created_by: context.profile?.id ?? null,
        }).select("*").single();
        if (advanceError) throw new Error(advanceError.message);
        approvedAdvanceId = advance.id;
    }

    const { data, error } = await dbClient.from("employee_advance_requests").update({
        status: decision,
        decided_by: context.profile?.id ?? null,
        decided_at: new Date().toISOString(),
        admin_comment: comment || null,
        approved_advance_id: approvedAdvanceId,
        updated_at: new Date().toISOString(),
    }).eq("company_id", companyId).eq("id", requestId).select("*").single();
    if (error) throw new Error(error.message);
    await notify(dbClient, {
        companyId,
        officeId: request.office_id,
        recipientType: "office",
        entityType: "employee_advance_request",
        entityId: requestId,
        title: `Employee advance ${decision}`,
        message: decision === "approved" ? "Employee advance was approved and added to payroll deduction." : `Employee advance was rejected${comment ? `: ${comment}` : "."}`,
        severity: decision === "approved" ? "success" : "warning",
    });
    await logUserAction({ action: `employee_advance_${decision}`, entityType: "employee_advance_request", entityId: requestId, companyId, officeId: request.office_id, beforeData: request, afterData: data });
    revalidateEmployees();
}

export async function decideEmployeeOffDayRequest(formData: FormData) {
    const context = await requireCompanyAdminMode();
    const companyId = context.activeCompany?.id;
    if (!companyId) throw new Error("Active company is required.");
    const requestId = text(formData.get("requestId"));
    const decision = text(formData.get("decision"));
    const comment = text(formData.get("adminComment"));
    if (!requestId || !["approved", "rejected"].includes(decision)) throw new Error("Valid request decision is required.");
    const dbClient = db();
    const { data: request, error: requestError } = await dbClient.from("employee_off_day_requests").select("*").eq("company_id", companyId).eq("id", requestId).maybeSingle();
    if (requestError) throw new Error(requestError.message);
    if (!request) throw new Error("Off-day request not found.");
    const { data, error } = await dbClient.from("employee_off_day_requests").update({
        status: decision,
        decided_by: context.profile?.id ?? null,
        decided_at: new Date().toISOString(),
        admin_comment: comment || null,
        updated_at: new Date().toISOString(),
    }).eq("company_id", companyId).eq("id", requestId).select("*").single();
    if (error) throw new Error(error.message);
    await notify(dbClient, {
        companyId,
        officeId: request.office_id,
        recipientType: "office",
        entityType: "employee_off_day_request",
        entityId: requestId,
        title: `Employee off-day ${decision}`,
        message: decision === "approved" ? "Employee off-day request was approved." : `Employee off-day request was rejected${comment ? `: ${comment}` : "."}`,
        severity: decision === "approved" ? "success" : "warning",
    });
    await logUserAction({ action: `employee_off_day_${decision}`, entityType: "employee_off_day_request", entityId: requestId, companyId, officeId: request.office_id, beforeData: request, afterData: data });
    revalidateEmployees();
}

export async function updateEmployeeProbation(formData: FormData) {
    const context = await requireCompanyAdminMode();
    const companyId = context.activeCompany?.id;
    if (!companyId) throw new Error("Active company is required.");
    const employeeId = text(formData.get("employeeId"));
    const probationStatus = text(formData.get("probationStatus"));
    if (!employeeId || !probationStatus) throw new Error("Employee and probation decision are required.");
    const dbClient = db();
    const payload = {
        probation_start_date: text(formData.get("probationStartDate")) || null,
        probation_end_date: text(formData.get("probationEndDate")) || null,
        probation_salary: amount(formData.get("probationSalary")),
        normal_salary_after_probation: amount(formData.get("normalSalaryAfterProbation")),
        probation_status: probationStatus,
        basic_salary: probationStatus === "confirmed" ? amount(formData.get("normalSalaryAfterProbation")) : amount(formData.get("probationSalary")),
        updated_at: new Date().toISOString(),
    };
    const { data: before } = await dbClient.from("employees").select("*").eq("company_id", companyId).eq("id", employeeId).maybeSingle();
    const data = await updateEmployeeWithSchemaFallback(employeeId, companyId, payload);
    await notify(dbClient, {
        companyId,
        officeId: data.office_id,
        recipientType: "admin",
        entityType: "employee",
        entityId: employeeId,
        title: "Employee probation updated",
        message: `${data.full_name ?? "Employee"} probation status changed to ${probationStatus}.`,
        severity: "information",
    });
    await logUserAction({ action: "employee_probation_updated", entityType: "employee", entityId: employeeId, companyId, officeId: data.office_id, beforeData: before, afterData: data });
    revalidateEmployees();
}

export async function assignEmployeeOffice(formData: FormData) {
    const context = await requireCompanyAdminMode();
    const companyId = context.activeCompany?.id;
    if (!companyId) throw new Error("Active company is required.");
    const employeeId = text(formData.get("employeeId"));
    const officeId = text(formData.get("officeId"));
    const assignmentType = text(formData.get("assignmentType")) || "active";
    if (!employeeId || !officeId) throw new Error("Employee and office are required.");
    const dbClient = db();
    const { data: before } = await dbClient.from("employees").select("*").eq("company_id", companyId).eq("id", employeeId).maybeSingle();
    if (officeId === "all_rounder") {
        const { data, error } = await dbClient.from("employees").update({
            office_id: null,
            default_office_id: null,
            primary_office_id: null,
            employee_assignment_type: "all_rounder",
            is_field_agent: true,
            updated_at: new Date().toISOString(),
        }).eq("company_id", companyId).eq("id", employeeId).select("*").single();
        if (error) throw new Error(error.message);
        await dbClient.from("employee_office_assignments").insert({
            company_id: companyId,
            employee_id: employeeId,
            from_office_id: before?.office_id ?? null,
            to_office_id: null,
            assignment_type: "all_rounder",
            reason: text(formData.get("reason")) || "Assigned as All Rounder / All Offices",
            created_by: context.profile?.id ?? null,
        });
        await logUserAction({ action: "employee_all_rounder_assigned", entityType: "employee", entityId: employeeId, companyId, officeId: null, beforeData: before, afterData: data });
        revalidateEmployees();
        return;
    }
    const isFieldAgent = text(formData.get("isFieldAgent")) === "on" || Boolean(before?.is_field_agent);
    if (isFieldAgent) {
        const { data: assignment, error } = await dbClient.from("employee_field_agent_assignments").insert({
            company_id: companyId,
            employee_id: employeeId,
            office_id: officeId,
            assignment_type: assignmentType,
            effective_from: text(formData.get("effectiveFrom")) || new Date().toISOString().slice(0, 10),
            effective_to: text(formData.get("effectiveTo")) || null,
            reason: text(formData.get("reason")) || null,
            active: true,
            created_by: context.profile?.id ?? null,
        }).select("*").single();
        if (error) throw new Error(error.message);
        await dbClient.from("employees").update({ is_field_agent: true, updated_at: new Date().toISOString() }).eq("company_id", companyId).eq("id", employeeId);
        await logUserAction({ action: "employee_field_agent_office_assigned", entityType: "employee_field_agent_assignment", entityId: assignment.id, companyId, officeId, afterData: assignment });
    } else {
        const { data, error } = await dbClient.from("employees").update({
            office_id: officeId,
            default_office_id: officeId,
            employee_assignment_type: "fixed_office",
            primary_office_id: officeId,
            updated_at: new Date().toISOString(),
        }).eq("company_id", companyId).eq("id", employeeId).select("*").single();
        if (error) throw new Error(error.message);
        await dbClient.from("employee_office_assignments").insert({
            company_id: companyId,
            employee_id: employeeId,
            from_office_id: before?.office_id ?? null,
            to_office_id: officeId,
            reason: text(formData.get("reason")) || null,
            created_by: context.profile?.id ?? null,
        });
        await notify(dbClient, {
            companyId,
            officeId,
            recipientType: "office",
            entityType: "employee",
            entityId: employeeId,
            title: "Employee reassigned",
            message: `${data.full_name ?? "Employee"} has been assigned to your office.`,
            severity: "information",
        });
        await logUserAction({ action: "employee_office_reassigned", entityType: "employee", entityId: employeeId, companyId, officeId, beforeData: before, afterData: data });
    }
    revalidateEmployees();
}
