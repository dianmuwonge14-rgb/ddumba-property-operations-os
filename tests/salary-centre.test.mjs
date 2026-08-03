import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dataSource = readFileSync("lib/salary-centre/data.ts", "utf8");
const actionSource = readFileSync("app/actions/salary.ts", "utf8");
const personalPage = readFileSync("app/office/salary/page.tsx", "utf8");
const adminPage = readFileSync("app/office/admin/payroll/page.tsx", "utf8");
const sidebar = readFileSync("components/office/shared/OfficeSidebar.tsx", "utf8");
const migration = readFileSync("supabase/upgrade_migrations/0244_salary_centre.sql", "utf8");

test("personal salary centre is scoped to the authenticated employee only", () => {
  assert.match(dataSource, /eq\("user_id", userId\)/);
  assert.match(dataSource, /This account is not linked to an active employee profile/);
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
  assert.match(sidebar, /Payroll Centre/);
});

test("migration adds sensitive salary ledgers and own-employee RLS", () => {
  assert.match(migration, /employee_payroll_months/);
  assert.match(migration, /employee_salary_payments/);
  assert.match(migration, /payroll_profiles/);
  assert.match(migration, /e\.user_id = auth\.uid\(\)/);
  assert.match(migration, /ddumba_v1_is_company_admin/);
});
