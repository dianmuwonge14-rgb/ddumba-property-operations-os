import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dataSource = readFileSync("lib/salary-centre/data.ts", "utf8");
const actionSource = readFileSync("app/actions/salary.ts", "utf8");
const personalPage = readFileSync("app/office/salary/page.tsx", "utf8");
const adminPage = readFileSync("app/office/admin/payroll/page.tsx", "utf8");
const sidebar = readFileSync("components/office/shared/OfficeSidebar.tsx", "utf8");
const migration = readFileSync("supabase/upgrade_migrations/0244_salary_centre.sql", "utf8");
const payrollGuardMigration = readFileSync("supabase/upgrade_migrations/0246_salary_centre_genuine_employee_guard.sql", "utf8");
const salaryLinkMigration = readFileSync("supabase/upgrade_migrations/0247_personal_salary_employee_linkage.sql", "utf8");

test("personal salary centre is scoped to the authenticated employee only", () => {
  const personalComponent = readFileSync("components/office/salary/SalaryCentre.tsx", "utf8");
  assert.match(dataSource, /eq\("user_id", userId\)/);
  assert.match(dataSource, /resolvePersonalSalaryEmployee/);
  assert.match(dataSource, /profile\?\.employee_id/);
  assert.match(dataSource, /user_office_roles/);
  assert.match(dataSource, /This account is not linked to an active employee profile/);
  assert.match(dataSource, /Salary has not yet been configured/);
  assert.match(personalComponent, /Salary has not yet been configured/);
  assert.doesNotMatch(personalComponent, /No salary activity attached/);
  assert.match(personalPage, /getPersonalSalaryCentreData/);
});

test("admin payroll centre requires company admin mode", () => {
  assert.match(adminPage, /requireCompanyAdminMode/);
  assert.match(dataSource, /getAdminPayrollCentreData/);
});

test("salary date uses Kampala timezone and handles short months", () => {
  assert.match(dataSource, /Africa\/Kampala/);
  assert.match(dataSource, /Math\.min\(Math\.max\(Math\.round\(day \|\| 1\), 1\), daysInMonth/);
  assert.match(dataSource, /salaryDueDateForMonth/);
});

test("salary payment records cumulative amount and remaining balance", () => {
  assert.match(actionSource, /alreadyPaid \+ paidAmount/);
  assert.match(actionSource, /remaining_balance: remaining/);
  assert.match(actionSource, /employee_salary_payments/);
  assert.match(actionSource, /notifyEmployee/);
});

test("salary configuration stores canonical payment day and payroll profile", () => {
  assert.match(actionSource, /salary_payment_day: salaryDay/);
  assert.match(actionSource, /salary_receiving_day: salaryDay/);
  assert.match(actionSource, /payroll_profiles/);
});

test("navigation exposes personal salary and admin payroll pages", () => {
  assert.match(sidebar, /\/office\/salary/);
  assert.match(sidebar, /My Salary/);
  assert.match(sidebar, /\/office\/admin\/payroll/);
  assert.match(sidebar, /Salary Centre/);
});

test("migration adds sensitive salary ledgers and own-employee RLS", () => {
  assert.match(migration, /employee_payroll_months/);
  assert.match(migration, /employee_salary_payments/);
  assert.match(migration, /payroll_profiles/);
  assert.match(migration, /e\.user_id = auth\.uid\(\)/);
  assert.match(migration, /ddumba_v1_is_company_admin/);
});

test("admin salary centre includes executive dashboard, AI, calendar and office comparison", () => {
  const adminComponent = readFileSync("components/office/salary/AdminPayrollCentre.tsx", "utf8");
  assert.match(adminComponent, /Salary Centre/);
  assert.match(adminComponent, /AI Payroll Director/);
  assert.match(adminComponent, /Payroll Calendar/);
  assert.match(adminComponent, /Office Payroll Comparison/);
  assert.match(adminComponent, /Total Monthly Payroll/);
  assert.match(adminComponent, /Salaries Due This Week/);
  assert.match(adminComponent, /Cash Needed 7 Days/);
  assert.match(adminComponent, /Pay Salary \/ Record Partial Payment/);
});

test("admin salary totals include due week, paid employees, averages, allowances and deductions", () => {
  assert.match(dataSource, /dueThisWeek/);
  assert.match(dataSource, /employeesPaid/);
  assert.match(dataSource, /employeesAwaitingSalary/);
  assert.match(dataSource, /averageSalary/);
  assert.match(dataSource, /totalAllowances/);
  assert.match(dataSource, /totalDeductions/);
});

test("salary centre excludes shared office and operational workspace accounts", () => {
  assert.match(dataSource, /NON_PAYROLL_ACCOUNT_TYPES/);
  assert.match(dataSource, /isPayrollEligibleEmployee/);
  assert.match(dataSource, /uniquePayrollEmployees/);
  assert.match(dataSource, /loadLinkedUsers/);
  assert.match(dataSource, /account_type/);
  assert.match(dataSource, /office account/);
  assert.match(dataSource, /employee\.role/);
  assert.match(dataSource, /roleName === "office_user"/);
  assert.match(dataSource, /office user/);
  assert.match(dataSource, /Operational account — not eligible for payroll/);
});

test("salary writes are blocked for operational accounts in app and database", () => {
  assert.match(actionSource, /OPERATIONAL_ACCOUNT_PAYROLL_MESSAGE/);
  assert.match(actionSource, /assertPayrollEligibleEmployee/);
  assert.match(actionSource, /looksLikeOfficeWorkspaceEmployee/);
  assert.match(actionSource, /users"\)\.select\("id,account_type,full_name,status"\)/);
  assert.match(payrollGuardMigration, /ddumba_is_genuine_payroll_employee/);
  assert.match(payrollGuardMigration, /ddumba_guard_salary_employee/);
  assert.match(payrollGuardMigration, /trg_payroll_profiles_genuine_employee/);
  assert.match(payrollGuardMigration, /trg_employee_payroll_months_genuine_employee/);
  assert.match(payrollGuardMigration, /trg_employee_salary_payments_genuine_employee/);
  assert.match(payrollGuardMigration, /Operational account — not eligible for payroll/);
});

test("personal salary linkage migration adds user employee links and current salary periods", () => {
  assert.match(salaryLinkMigration, /add column if not exists employee_id uuid references public\.employees/);
  assert.match(salaryLinkMigration, /idx_users_employee_profile_link/);
  assert.match(salaryLinkMigration, /user_office_roles uor/);
  assert.match(salaryLinkMigration, /employee_payroll_months/);
  assert.match(salaryLinkMigration, /date_trunc\('month', now\(\) at time zone 'Africa\/Kampala'\)::date/);
  assert.match(salaryLinkMigration, /not exists \(\s*select 1\s*from public\.employee_payroll_months/s);
});

test("configured employees get a current salary period without inventing missing salaries", () => {
  const salaryPeriodRepair = readFileSync("supabase/upgrade_migrations/0251_current_salary_period_repair.sql", "utf8");
  assert.match(salaryPeriodRepair, /from public\.payroll_profiles pp/);
  assert.match(salaryPeriodRepair, /coalesce\(pp\.base_salary, 0\) > 0/);
  assert.match(salaryPeriodRepair, /public\.ddumba_is_genuine_payroll_employee\(e\.id\)/);
  assert.match(salaryPeriodRepair, /not exists \(\s*select 1\s*from public\.employee_payroll_months/s);
  assert.match(salaryPeriodRepair, /Africa\/Kampala/);
});
