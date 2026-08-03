import { requireAuth, requireCompanyAdminMode } from "@/lib/auth/permissions";
import { getScopedSupabase } from "@/lib/auth/query";
import type { AdminPayrollCentreData, PersonalSalaryCentreData, SalaryCardData, SalaryPaymentRecord, SalaryStatus } from "./types";

type LooseRow = Record<string, any>;
type Db = { from: (table: string) => any };

const TZ = "Africa/Kampala";
const NON_PAYROLL_ACCOUNT_TYPES = new Set(["office", "office_workspace", "service", "system", "shared"]);
const INACTIVE_EMPLOYMENT_STATUSES = new Set(["archived", "deleted", "inactive", "terminated"]);

function amount(value: unknown) {
    return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function text(value: unknown, fallback = "") {
    const resolved = String(value ?? "").trim();
    return resolved || fallback;
}

function lower(value: unknown) {
    return text(value).toLowerCase();
}

function isOfficeWorkspaceEmployee(employee: LooseRow, linkedUser?: LooseRow | null) {
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

function isPayrollEligibleEmployee(employee: LooseRow, linkedUser?: LooseRow | null) {
    if (!employee?.id) return false;
    if (INACTIVE_EMPLOYMENT_STATUSES.has(lower(employee.status))) return false;
    if (isOfficeWorkspaceEmployee(employee, linkedUser)) return false;
    return true;
}

async function loadLinkedUsers(db: Db, companyId: string, employeeRows: LooseRow[], warnings: string[]) {
    const userIds = [...new Set(employeeRows.map((row) => text(row.user_id)).filter(Boolean))];
    const rows = userIds.length
        ? await safeRows(db, "users", (query) => query.select("id,account_type,full_name,status").eq("company_id", companyId).in("id", userIds), warnings)
        : [];
    return new Map(rows.map((row) => [String(row.id), row]));
}

function uniquePayrollEmployees(employeeRows: LooseRow[], userById: Map<string, LooseRow>) {
    const byId = new Map<string, LooseRow>();
    for (const employee of employeeRows) {
        const employeeId = text(employee.id);
        if (!employeeId || byId.has(employeeId)) continue;
        const linkedUser = employee.user_id ? userById.get(String(employee.user_id)) ?? null : null;
        if (!isPayrollEligibleEmployee(employee, linkedUser)) continue;
        byId.set(employeeId, employee);
    }
    return [...byId.values()];
}

function kampalaParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: TZ,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(date);
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
    return { year: get("year"), month: get("month"), day: get("day") };
}

export function salaryMonthKey(date = new Date()) {
    const { year, month } = kampalaParts(date);
    return `${year}-${String(month).padStart(2, "0")}-01`;
}

function daysInMonth(year: number, month: number) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function salaryDueDateForMonth(monthKey: string, day: number) {
    const [yearText, monthText] = monthKey.split("-");
    const year = Number(yearText);
    const month = Number(monthText);
    const safeDay = Math.min(Math.max(Math.round(day || 1), 1), daysInMonth(year, month));
    return `${year}-${String(month).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
}

function nextMonthKey(monthKey: string) {
    const [yearText, monthText] = monthKey.split("-");
    const date = new Date(Date.UTC(Number(yearText), Number(monthText), 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function monthLabel(monthKey: string) {
    return new Intl.DateTimeFormat("en-UG", { month: "long", year: "numeric", timeZone: TZ }).format(new Date(`${monthKey}T00:00:00Z`));
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

function sum(rows: LooseRow[], key: string) {
    return rows.reduce((total, row) => total + amount(row[key]), 0);
}

function statusFor(input: { configured: boolean; employmentStatus: string; dueDate: string | null; paid: number; net: number; today: string }): { status: SalaryStatus; label: string; countdown: string } {
    if (!input.configured) return { status: "not_configured", label: "Not Configured", countdown: "Salary not configured" };
    if (["inactive", "suspended", "terminated", "archived"].includes(input.employmentStatus.toLowerCase())) return { status: "suspended", label: "Suspended", countdown: "Salary suspended" };
    if (input.net <= 0) return { status: "not_configured", label: "Not Configured", countdown: "Salary not configured" };
    if (input.paid >= input.net) return { status: "paid", label: "Paid", countdown: "Salary received" };
    if (!input.dueDate) return { status: "pending_payment", label: "Pending Payment", countdown: "Salary date pending" };
    const todayTime = Date.parse(`${input.today}T00:00:00Z`);
    const dueTime = Date.parse(`${input.dueDate}T00:00:00Z`);
    const days = Math.round((dueTime - todayTime) / 86400000);
    if (input.paid > 0) return { status: "partially_paid", label: "Partially Paid", countdown: days >= 0 ? `${days} days remaining` : `Salary overdue by ${Math.abs(days)} days` };
    if (days === 0) return { status: "due_today", label: "Due Today", countdown: "Salary due today" };
    if (days < 0) return { status: "overdue", label: "Overdue", countdown: `Salary overdue by ${Math.abs(days)} days` };
    return { status: "upcoming", label: "Upcoming", countdown: `${days} day${days === 1 ? "" : "s"} remaining` };
}

function buildSalaryCard(input: {
    employee: LooseRow;
    officeName: string;
    monthKey: string;
    paymentRows: LooseRow[];
    payrollMonth?: LooseRow | null;
    profile?: LooseRow | null;
    today: string;
}): SalaryCardData {
    const employee = input.employee;
    const salaryDay = Number(input.profile?.salary_payment_day ?? employee.salary_payment_day ?? employee.salary_receiving_day ?? 1);
    const monthlySalary = amount(input.profile?.base_salary ?? employee.basic_salary);
    const allowances = amount(input.payrollMonth?.allowances ?? input.payrollMonth?.bonuses);
    const deductions = amount(input.payrollMonth?.deductions ?? (amount(input.payrollMonth?.personal_expenses) + amount(input.payrollMonth?.advances) + amount(input.payrollMonth?.fines)));
    const netSalary = amount(input.payrollMonth?.net_salary ?? input.payrollMonth?.final_salary_payable) || Math.max(0, monthlySalary + allowances - deductions);
    const paid = sum(input.paymentRows, "paid_amount") || amount(input.payrollMonth?.amount_paid);
    const dueDate = salaryDueDateForMonth(input.monthKey, salaryDay);
    const employmentStatus = text(employee.status, "active");
    const configured = monthlySalary > 0;
    const status = statusFor({ configured, employmentStatus, dueDate, paid, net: netSalary, today: input.today });
    const sortedPayments = [...input.paymentRows].sort((a, b) => String(b.paid_at ?? b.created_at).localeCompare(String(a.paid_at ?? a.created_at)));
    const last = sortedPayments[0] ?? null;
    const paymentRecords: SalaryPaymentRecord[] = sortedPayments.map((row) => ({
        id: String(row.id),
        amount: amount(row.paid_amount),
        paidAt: text(row.paid_at ?? row.created_at),
        method: text(row.payment_method, "Not recorded"),
        reference: text(row.reference),
        recordedBy: text(row.recorded_by_name ?? row.paid_by_name),
        approvedBy: text(row.approved_by_name),
        notes: text(row.notes),
    }));
    return {
        employeeId: String(employee.id),
        employeeName: text(employee.full_name, "Employee"),
        employeeCode: text(employee.employee_code, String(employee.id).slice(0, 8)),
        employeePhotoUrl: text(employee.photo_url ?? employee.avatar_url ?? employee.profile_photo_url),
        role: text(employee.role_name ?? employee.job_title, "Employee"),
        officeId: employee.office_id ? String(employee.office_id) : null,
        officeName: input.officeName,
        employmentStatus,
        salaryType: text(input.profile?.salary_type, "Fixed Salary"),
        monthlySalary,
        allowances,
        deductions,
        netSalary,
        salaryPeriod: monthLabel(input.monthKey),
        salaryPaymentDay: salaryDay,
        salaryPaymentDate: configured ? dueDate : null,
        countdownLabel: status.countdown,
        salaryEarnedSoFar: Math.min(netSalary, Math.round((netSalary / Math.max(kampalaParts().day, 1)) * kampalaParts().day)),
        salaryAlreadyPaid: paid,
        remainingSalaryBalance: Math.max(0, netSalary - paid),
        status: status.status,
        statusLabel: status.label,
        lastSalaryPaymentDate: last ? text(last.paid_at ?? last.created_at) : null,
        lastSalaryAmount: last ? amount(last.paid_amount) : 0,
        nextSalaryDate: paid >= netSalary && configured ? salaryDueDateForMonth(nextMonthKey(input.monthKey), salaryDay) : dueDate,
        payments: paymentRecords,
    };
}

async function loadOfficeNames(db: Db, companyId: string, warnings: string[]) {
    const rows = await safeRows(db, "offices", (query) => query.select("id,office_name,name").eq("company_id", companyId), warnings);
    return new Map(rows.map((office) => [String(office.id), text(office.office_name ?? office.name, "Office")]));
}

async function loadProfiles(db: Db, companyId: string, employeeIds: string[], warnings: string[]) {
    const rows = employeeIds.length
        ? await safeRows(db, "payroll_profiles", (query) => query.select("*").eq("company_id", companyId).in("employee_id", employeeIds).eq("active", true), warnings)
        : [];
    return new Map(rows.map((row) => [String(row.employee_id), row]));
}

export async function getPersonalSalaryCentreData(): Promise<PersonalSalaryCentreData> {
    const context = await requireAuth();
    const { supabase } = await getScopedSupabase();
    const db = supabase as unknown as Db;
    const warnings: string[] = [];
    const companyId = context.activeCompany?.id;
    const userId = context.profile?.id;
    if (!companyId || !userId) return { companyName: "Ddumba OS", employee: null, history: [], warnings: ["Signed-in account is required."] };
    const employeeRows = await safeRows(db, "employees", (query) => query.select("*").eq("company_id", companyId).eq("user_id", userId).neq("status", "archived").limit(1), warnings);
    const employee = employeeRows[0];
    if (!employee) return { companyName: context.activeCompany?.name ?? "Ddumba OS", employee: null, history: [], warnings: ["This account is not linked to an active employee profile."] };
    const linkedUser = { account_type: context.profile?.account_type, full_name: context.profile?.full_name, status: context.profile?.status };
    if (!isPayrollEligibleEmployee(employee, linkedUser)) {
        return { companyName: context.activeCompany?.name ?? "Ddumba OS", employee: null, history: [], warnings: ["Operational account — not eligible for payroll."] };
    }
    const employeeId = String(employee.id);
    const currentMonth = salaryMonthKey();
    const officeNames = await loadOfficeNames(db, companyId, warnings);
    const profiles = await loadProfiles(db, companyId, [employeeId], warnings);
    const [payrollRows, paymentRows] = await Promise.all([
        safeRows(db, "employee_payroll_months", (query) => query.select("*").eq("company_id", companyId).eq("employee_id", employeeId).order("month_key", { ascending: false }).limit(12), warnings),
        safeRows(db, "employee_salary_payments", (query) => query.select("*").eq("company_id", companyId).eq("employee_id", employeeId).order("paid_at", { ascending: false }).limit(50), warnings),
    ]);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const byMonth = new Map<string, LooseRow[]>();
    for (const row of paymentRows) {
        const key = text(row.month_key, currentMonth);
        byMonth.set(key, [...(byMonth.get(key) ?? []), row]);
    }
    const months = [...new Set([currentMonth, ...payrollRows.map((row) => text(row.month_key)).filter(Boolean)])];
    const cards = months.map((month) => buildSalaryCard({
        employee,
        monthKey: month,
        officeName: employee.office_id ? officeNames.get(String(employee.office_id)) ?? "Office" : "Unassigned",
        paymentRows: byMonth.get(month) ?? [],
        payrollMonth: payrollRows.find((row) => text(row.month_key) === month) ?? null,
        profile: profiles.get(employeeId) ?? null,
        today,
    }));
    return { companyName: context.activeCompany?.name ?? "Ddumba OS", employee: cards[0] ?? null, history: cards, warnings };
}

export async function getAdminPayrollCentreData(): Promise<AdminPayrollCentreData> {
    const context = await requireCompanyAdminMode();
    const { supabase } = await getScopedSupabase();
    const db = supabase as unknown as Db;
    const warnings: string[] = [];
    const companyId = context.activeCompany?.id;
    const monthKey = salaryMonthKey();
    if (!companyId) return { companyName: "Company", monthKey, offices: [], employees: [], totals: emptyTotals(), warnings: ["Active company is required."] };
    const [employeeRows, officeNames] = await Promise.all([
        safeRows(db, "employees", (query) => query.select("*").eq("company_id", companyId).neq("status", "archived").order("full_name").limit(1000), warnings),
        loadOfficeNames(db, companyId, warnings),
    ]);
    const userById = await loadLinkedUsers(db, companyId, employeeRows, warnings);
    const payrollEmployees = uniquePayrollEmployees(employeeRows, userById);
    const employeeIds = payrollEmployees.map((row) => String(row.id));
    const [profiles, payrollRows, paymentRows] = await Promise.all([
        loadProfiles(db, companyId, employeeIds, warnings),
        employeeIds.length ? safeRows(db, "employee_payroll_months", (query) => query.select("*").eq("company_id", companyId).eq("month_key", monthKey).in("employee_id", employeeIds), warnings) : [],
        employeeIds.length ? safeRows(db, "employee_salary_payments", (query) => query.select("*").eq("company_id", companyId).eq("month_key", monthKey).in("employee_id", employeeIds).order("paid_at", { ascending: false }), warnings) : [],
    ]);
    const payrollByEmployee = new Map(payrollRows.map((row) => [String(row.employee_id), row]));
    const paymentsByEmployee = new Map<string, LooseRow[]>();
    for (const row of paymentRows) {
        const id = String(row.employee_id);
        paymentsByEmployee.set(id, [...(paymentsByEmployee.get(id) ?? []), row]);
    }
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const employees = payrollEmployees
        .filter((employee) => String(employee.user_id ?? "").trim() || amount(employee.basic_salary) > 0)
        .map((employee) => buildSalaryCard({
            employee,
            monthKey,
            officeName: employee.office_id ? officeNames.get(String(employee.office_id)) ?? "Office" : "Unassigned",
            paymentRows: paymentsByEmployee.get(String(employee.id)) ?? [],
            payrollMonth: payrollByEmployee.get(String(employee.id)) ?? null,
            profile: profiles.get(String(employee.id)) ?? null,
            today,
        }));
    const totals = employees.reduce((acc, employee) => {
        acc.totalMonthlyPayroll += employee.netSalary;
        acc.paidSalaries += employee.salaryAlreadyPaid;
        acc.outstandingSalaries += employee.remainingSalaryBalance;
        if (employee.status === "due_today") acc.dueToday += 1;
        if (employee.salaryPaymentDate) {
            const todayTime = Date.parse(`${today}T00:00:00Z`);
            const dueTime = Date.parse(`${employee.salaryPaymentDate}T00:00:00Z`);
            const dayGap = Math.round((dueTime - todayTime) / 86400000);
            if (dayGap >= 0 && dayGap <= 7 && employee.remainingSalaryBalance > 0) acc.dueThisWeek += 1;
        }
        if (employee.status === "overdue") acc.overdueSalaries += 1;
        if (employee.status === "paid") acc.employeesPaid += 1;
        if (employee.status !== "paid" && employee.status !== "suspended" && employee.status !== "not_configured") acc.employeesAwaitingSalary += 1;
        acc.totalAllowances += employee.allowances;
        acc.totalDeductions += employee.deductions;
        if (employee.status === "partially_paid") acc.partiallyPaid += 1;
        if (employee.status === "not_configured") acc.notConfigured += 1;
        return acc;
    }, emptyTotals());
    totals.averageSalary = employees.length ? Math.round(totals.totalMonthlyPayroll / employees.length) : 0;
    return {
        companyName: context.activeCompany?.name ?? "Ddumba OS",
        monthKey,
        offices: [...officeNames.entries()].map(([id, name]) => ({ id, name })),
        employees,
        totals,
        warnings,
    };
}

function emptyTotals() {
    return {
        totalMonthlyPayroll: 0,
        paidSalaries: 0,
        outstandingSalaries: 0,
        dueToday: 0,
        dueThisWeek: 0,
        overdueSalaries: 0,
        employeesPaid: 0,
        employeesAwaitingSalary: 0,
        averageSalary: 0,
        totalAllowances: 0,
        totalDeductions: 0,
        partiallyPaid: 0,
        notConfigured: 0,
    };
}
