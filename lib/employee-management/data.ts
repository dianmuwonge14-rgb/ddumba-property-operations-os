import { requireCompanyAdminMode } from "@/lib/auth/permissions";
import { getScopedSupabase } from "@/lib/auth/query";
import type { EmployeeManagementData, EmployeePerformanceRow, EmployeeProfile, EmployeeRequestItem } from "./types";

type LooseRow = Record<string, any>;
type Db = { from: (table: string) => any };

function amount(value: unknown) {
    return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function text(value: unknown, fallback = "") {
    const resolved = String(value ?? "").trim();
    return resolved || fallback;
}

function monthKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

async function safeRows(db: Db, table: string, build: (query: any) => any, warnings: string[]) {
    try {
        const result = await build(db.from(table));
        if (result.error) {
            warnings.push(`${table}: ${result.error.message}`);
            return [] as LooseRow[];
        }
        return (result.data ?? []) as LooseRow[];
    } catch (error) {
        warnings.push(`${table}: ${error instanceof Error ? error.message : "Could not load table."}`);
        return [] as LooseRow[];
    }
}

function groupSum(rows: LooseRow[], key: string, valueKey = "amount") {
    const grouped = new Map<string, number>();
    for (const row of rows) {
        const id = String(row[key] ?? "");
        if (!id) continue;
        grouped.set(id, (grouped.get(id) ?? 0) + amount(row[valueKey]));
    }
    return grouped;
}

export async function getEmployeeManagementData(): Promise<EmployeeManagementData> {
    const context = await requireCompanyAdminMode();
    const { supabase } = await getScopedSupabase();
    const companyId = context.activeCompany?.id;
    const warnings: string[] = [];
    if (!companyId) {
        return emptyData("Company", monthKey(), ["No active company found."]);
    }

    const db = supabase as unknown as Db;
    const currentMonth = monthKey();
    const [officeRows, roleRows, employeeRows] = await Promise.all([
        safeRows(db, "offices", (query) => query.select("id,name,office_name,status").eq("company_id", companyId).order("office_name"), warnings),
        safeRows(db, "roles", (query) => query.select("id,name,key").eq("company_id", companyId).order("name"), warnings),
        safeRows(db, "employees", (query) => query.select("*").eq("company_id", companyId).order("full_name").limit(1000), warnings),
    ]);

    const offices = officeRows.map((office) => ({ id: String(office.id), name: text(office.office_name ?? office.name, "Office") }));
    const roles = roleRows.map((role) => ({ id: String(role.id), name: text(role.name ?? role.key, "Role") }));
    const officeById = new Map(offices.map((office) => [office.id, office.name]));
    const roleById = new Map(roles.map((role) => [role.id, role.name]));

    const [
        referenceRows,
        expenseRows,
        advanceRows,
        bonusRows,
        fineRows,
        paymentRows,
        documentRows,
        performanceRows,
        advanceRequestRows,
        offDayRequestRows,
        offDayBalanceRows,
        fieldAssignmentRows,
        lunchLedgerRows,
    ] = await Promise.all([
        safeRows(db, "employee_references", (query) => query.select("*").eq("company_id", companyId).eq("active", true), warnings),
        safeRows(db, "employee_expenses", (query) => query.select("*").eq("company_id", companyId).eq("month_key", currentMonth).eq("active", true).eq("approved_for_payroll", true), warnings),
        safeRows(db, "employee_advances", (query) => query.select("*").eq("company_id", companyId).eq("month_key", currentMonth).eq("active", true), warnings),
        safeRows(db, "employee_bonuses", (query) => query.select("*").eq("company_id", companyId).eq("month_key", currentMonth).eq("active", true), warnings),
        safeRows(db, "employee_fines", (query) => query.select("*").eq("company_id", companyId).eq("month_key", currentMonth).eq("active", true), warnings),
        safeRows(db, "employee_salary_payments", (query) => query.select("*").eq("company_id", companyId).eq("month_key", currentMonth), warnings),
        safeRows(db, "employee_documents", (query) => query.select("*").eq("company_id", companyId).eq("active", true), warnings),
        safeRows(db, "employee_performance_scores", (query) => query.select("*").eq("company_id", companyId).eq("month_key", currentMonth).eq("active", true).order("score", { ascending: false }), warnings),
        safeRows(db, "employee_advance_requests", (query) => query.select("*").eq("company_id", companyId).eq("active", true).order("created_at", { ascending: false }).limit(100), warnings),
        safeRows(db, "employee_off_day_requests", (query) => query.select("*").eq("company_id", companyId).eq("active", true).order("created_at", { ascending: false }).limit(100), warnings),
        safeRows(db, "employee_off_day_balances", (query) => query.select("*").eq("company_id", companyId).eq("month_key", currentMonth).eq("active", true), warnings),
        safeRows(db, "employee_field_agent_assignments", (query) => query.select("*").eq("company_id", companyId).eq("active", true), warnings),
        safeRows(db, "employee_lunch_ledger", (query) => query.select("*").eq("company_id", companyId).eq("month_key", currentMonth).eq("active", true), warnings),
    ]);

    const refsByEmployee = new Map<string, Array<{ name: string; relationship: string; phone: string }>>();
    for (const row of referenceRows) {
        const id = String(row.employee_id ?? "");
        if (!id) continue;
        const refs = refsByEmployee.get(id) ?? [];
        refs.push({ name: text(row.full_name), relationship: text(row.relationship), phone: text(row.phone) });
        refsByEmployee.set(id, refs);
    }

    const docsByEmployee = new Map<string, Array<{ id: string; type: string; name: string; url: string }>>();
    for (const row of documentRows) {
        const id = String(row.employee_id ?? "");
        if (!id) continue;
        const docs = docsByEmployee.get(id) ?? [];
        docs.push({ id: String(row.id), type: text(row.document_type, "document"), name: text(row.file_name, "Document"), url: text(row.file_url ?? row.file_path) });
        docsByEmployee.set(id, docs);
    }

    const expensesByEmployee = groupSum(expenseRows, "employee_id");
    const advancesByEmployee = new Map<string, number>();
    for (const row of advanceRows) {
        const id = String(row.employee_id ?? "");
        advancesByEmployee.set(id, (advancesByEmployee.get(id) ?? 0) + amount(row.remaining_balance ?? row.amount));
    }
    const bonusesByEmployee = groupSum(bonusRows, "employee_id");
    const finesByEmployee = groupSum(fineRows, "employee_id");
    const paidByEmployee = groupSum(paymentRows, "employee_id", "paid_amount");
    const lunchEarnedByEmployee = groupSum(lunchLedgerRows.filter((row) => String(row.entry_type) === "earned"), "employee_id", "earned_amount");
    const lunchTakenByEmployee = groupSum(lunchLedgerRows.filter((row) => String(row.entry_type) === "taken"), "employee_id", "taken_amount");
    const offDayBalanceByEmployee = new Map(offDayBalanceRows.map((row) => [String(row.employee_id), row]));
    const fieldOfficesByEmployee = new Map<string, string[]>();
    for (const row of fieldAssignmentRows) {
        const id = String(row.employee_id ?? "");
        const officeId = String(row.office_id ?? "");
        if (!id || !officeId) continue;
        const officeNames = fieldOfficesByEmployee.get(id) ?? [];
        officeNames.push(officeById.get(officeId) ?? "Office");
        fieldOfficesByEmployee.set(id, officeNames);
    }

    const employees: EmployeeProfile[] = employeeRows.map((employee) => {
        const id = String(employee.id);
        const basicSalary = amount(employee.basic_salary);
        const bonuses = bonusesByEmployee.get(id) ?? 0;
        const expenses = expensesByEmployee.get(id) ?? 0;
        const advances = advancesByEmployee.get(id) ?? 0;
        const fines = finesByEmployee.get(id) ?? 0;
        const lunchEarned = lunchEarnedByEmployee.get(id) ?? 0;
        const lunchTaken = lunchTakenByEmployee.get(id) ?? 0;
        const unusedLunchBalance = Math.max(0, lunchEarned - lunchTaken);
        const finalSalary = Math.max(0, basicSalary + bonuses + unusedLunchBalance - expenses - advances - fines);
        const paidThisMonth = paidByEmployee.get(id) ?? 0;
        const officeId = employee.office_id ? String(employee.office_id) : null;
        const assignmentType = employee.employee_assignment_type === "all_rounder" ? "all_rounder" : "fixed_office";
        const defaultOfficeId = employee.default_office_id ? String(employee.default_office_id) : officeId;
        const roleId = employee.role_id ? String(employee.role_id) : null;
        const offDayBalance = offDayBalanceByEmployee.get(id);
        return {
            id,
            fullName: text(employee.full_name, "Unnamed Employee"),
            age: employee.age === null || employee.age === undefined ? null : Number(employee.age),
            employeeCode: text(employee.employee_code, id.slice(0, 8)),
            phone: text(employee.phone),
            email: text(employee.email),
            officeId,
            officeName: assignmentType === "all_rounder" ? "All Rounder / All Offices" : officeId ? officeById.get(officeId) ?? "Office" : "Unassigned",
            assignmentType,
            defaultOfficeId,
            roleId,
            roleName: text(employee.role_name, roleId ? roleById.get(roleId) ?? "Role" : text(employee.job_title, "Unassigned")),
            startDate: text(employee.hire_date ?? employee.start_date),
            basicSalary,
            salaryDay: Number(employee.salary_receiving_day ?? 28),
            dailyLunchAllowance: amount(employee.daily_lunch_allowance),
            advanceDeductionRule: text(employee.advance_deduction_rule, "deduct_current_salary"),
            probationStartDate: text(employee.probation_start_date),
            probationEndDate: text(employee.probation_end_date),
            probationSalary: amount(employee.probation_salary),
            normalSalaryAfterProbation: amount(employee.normal_salary_after_probation),
            probationStatus: text(employee.probation_status, "not_started"),
            isFieldAgent: Boolean(employee.is_field_agent),
            fieldOfficeNames: fieldOfficesByEmployee.get(id) ?? [],
            offDayBalance: {
                monthlyEntitlement: Number(offDayBalance?.monthly_entitlement ?? 4),
                carriedForward: Number(offDayBalance?.carried_forward ?? 0),
                usedDays: Number(offDayBalance?.used_days ?? 0),
                availableDays: Number(offDayBalance?.available_days ?? 4),
            },
            offDays: Array.isArray(employee.off_days) ? employee.off_days.map(String) : [],
            status: text(employee.status, "active"),
            notes: text(employee.notes),
            references: refsByEmployee.get(id) ?? [],
            documents: docsByEmployee.get(id) ?? [],
            finance: {
                employeeId: id,
                basicSalary,
                bonuses,
                expenses,
                advances,
                fines,
                lunchEarned,
                lunchTaken,
                unusedLunchBalance,
                finalSalary,
                paidThisMonth,
                status: paidThisMonth >= finalSalary && finalSalary > 0 ? "paid" : paidThisMonth > 0 ? "partial" : "unpaid",
            },
        };
    });

    const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
    const requestFromRow = (row: LooseRow): EmployeeRequestItem => {
        const employee = employeeById.get(String(row.employee_id));
        const officeId = row.office_id ? String(row.office_id) : null;
        return {
            id: String(row.id),
            employeeId: String(row.employee_id),
            employeeName: employee?.fullName ?? "Employee",
            officeId,
            officeName: officeId ? officeById.get(officeId) ?? "Office" : "Company",
            amount: row.amount === undefined ? undefined : amount(row.amount),
            startDate: text(row.start_date),
            endDate: text(row.end_date),
            requestedDays: row.requested_days === undefined ? undefined : Number(row.requested_days),
            reason: text(row.reason, "No reason provided"),
            status: text(row.status, "pending"),
            createdAt: text(row.created_at),
            isLongLeave: Boolean(row.is_long_leave),
        };
    };
    const advanceRequests = advanceRequestRows.map(requestFromRow);
    const offDayRequests = offDayRequestRows.map(requestFromRow);
    const performance: EmployeePerformanceRow[] = performanceRows.map((row) => {
        const employee = employeeById.get(String(row.employee_id));
        return {
            employeeId: String(row.employee_id),
            employeeName: employee?.fullName ?? "Employee",
            officeName: employee?.officeName ?? "Office",
            roleName: employee?.roleName ?? "Role",
            score: amount(row.score),
            strengths: text(row.strengths, "Awaiting score notes"),
            issues: text(row.issues, "No critical issue recorded"),
            aiRecommendation: text(row.ai_recommendation, "Keep monitoring attendance, reports, and collection activity."),
        };
    });

    const totals = employees.reduce((acc, employee) => {
        acc.totalEmployees += 1;
        if (employee.status === "terminated") acc.terminatedEmployees += 1;
        if (employee.status === "active") acc.activeEmployees += 1;
        acc.totalBasicSalaries += employee.finance.basicSalary;
        acc.totalBonuses += employee.finance.bonuses;
        acc.totalExpenses += employee.finance.expenses;
        acc.totalAdvances += employee.finance.advances;
        acc.totalFines += employee.finance.fines;
        acc.totalLunchEarned += employee.finance.lunchEarned;
        acc.totalLunchTaken += employee.finance.lunchTaken;
        acc.totalUnusedLunchBalance += employee.finance.unusedLunchBalance;
        acc.totalFinalSalaryPayable += employee.finance.finalSalary;
        acc.salariesPaidThisMonth += employee.finance.paidThisMonth;
        acc.outstandingSalaries += Math.max(0, employee.finance.finalSalary - employee.finance.paidThisMonth);
        const today = new Date().getDate();
        if (employee.status === "active" && employee.salaryDay >= today && employee.salaryDay <= today + 1) acc.salariesDueSoon += 1;
        return acc;
    }, {
        totalEmployees: 0,
        activeEmployees: 0,
        terminatedEmployees: 0,
        totalBasicSalaries: 0,
        totalBonuses: 0,
        totalExpenses: 0,
        totalAdvances: 0,
        totalFines: 0,
        totalLunchEarned: 0,
        totalLunchTaken: 0,
        totalUnusedLunchBalance: 0,
        totalFinalSalaryPayable: 0,
        salariesDueSoon: 0,
        salariesPaidThisMonth: 0,
        outstandingSalaries: 0,
        companySavingsFromFines: 0,
    });
    totals.companySavingsFromFines = totals.totalFines;

    return {
        companyName: context.activeCompany?.name ?? "Ddumba OS",
        monthKey: currentMonth,
        offices,
        roles,
        employees,
        advanceRequests,
        offDayRequests,
        performance,
        totals,
        warnings,
    };
}

function emptyData(companyName: string, currentMonth: string, warnings: string[]): EmployeeManagementData {
    return {
        companyName,
        monthKey: currentMonth,
        offices: [],
        roles: [],
        employees: [],
        advanceRequests: [],
        offDayRequests: [],
        performance: [],
        totals: {
            totalEmployees: 0,
            activeEmployees: 0,
            terminatedEmployees: 0,
            totalBasicSalaries: 0,
            totalBonuses: 0,
            totalExpenses: 0,
            totalAdvances: 0,
            totalFines: 0,
            totalLunchEarned: 0,
            totalLunchTaken: 0,
            totalUnusedLunchBalance: 0,
            totalFinalSalaryPayable: 0,
            salariesDueSoon: 0,
            salariesPaidThisMonth: 0,
            outstandingSalaries: 0,
            companySavingsFromFines: 0,
        },
        warnings,
    };
}
