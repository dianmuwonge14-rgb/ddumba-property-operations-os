import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const loginRoute = readFileSync(new URL("../app/api/auth/office-login/route.ts", import.meta.url), "utf8");
const authContext = readFileSync(new URL("../lib/auth/context.ts", import.meta.url), "utf8");
const permissions = readFileSync(new URL("../lib/auth/permissions.ts", import.meta.url), "utf8");
const layout = readFileSync(new URL("../components/office/shared/OfficeLayout.tsx", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../components/office/shared/OfficeSidebar.tsx", import.meta.url), "utf8");
const paymentsAdminPage = readFileSync(new URL("../app/office/admin/payments/page.tsx", import.meta.url), "utf8");
const payrollData = readFileSync(new URL("../lib/salary-centre/data.ts", import.meta.url), "utf8");
const payrollCentre = readFileSync(new URL("../components/office/salary/AdminPayrollCentre.tsx", import.meta.url), "utf8");
const employeeData = readFileSync(new URL("../lib/employee-management/data.ts", import.meta.url), "utf8");
const employeeCentre = readFileSync(new URL("../components/office/admin/EmployeeManagementCentre.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/upgrade_migrations/0253_jimmy_company_manager_read_only.sql", import.meta.url), "utf8");

test("read-only manager enters the admin viewing shell without becoming a company admin", () => {
  assert.match(loginRoute, /ddumba_v1_verify_read_only_manager_login/);
  assert.match(loginRoute, /read_only_manager_credential_rpc/);
  assert.match(loginRoute, /const isReadOnlyManager = isAdmin && !identity\.is_company_admin/);
  assert.match(loginRoute, /isCompanyAdmin: identity\.is_company_admin/);
  assert.match(loginRoute, /redirectTo: identity\.redirect_to \?\? \(isAdmin \? "\/office\/admin\/cash-position"/);
  assert.match(authContext, /rawIsCompanyReadOnlyManager/);
  assert.match(authContext, /roleKeys\.includes\("company_manager_read_only"\)/);
  assert.match(authContext, /isCompanyReadOnlyManager = !isOfficeMode && !isCollectorMode/);
  assert.match(permissions, /requireCompanyReadMode/);
});

test("admin layout displays the manager badge but keeps write gates separate", () => {
  assert.match(layout, /isCompanyReadOnlyManager/);
  assert.match(sidebar, /Read-Only Manager/);
  assert.match(paymentsAdminPage, /canPostPayments=\{!readOnly\}/);
  assert.match(paymentsAdminPage, /isAdmin=\{!readOnly\}/);
});

test("payroll and employee centres suppress mutation forms for read-only managers", () => {
  assert.match(payrollData, /canManage: context\.isCompanyAdmin && !context\.isCompanyReadOnlyManager/);
  assert.match(payrollCentre, /<EmployeeDetails canManage=\{canManage\} employee=\{selected\}/);
  assert.match(payrollCentre, /Read-Only Manager/);
  assert.match(payrollCentre, /cannot change, approve, pay, or configure payroll records/);
  assert.match(employeeData, /canManage: context\.isCompanyAdmin && !context\.isCompanyReadOnlyManager/);
  assert.match(employeeCentre, /const canManage = data\.canManage !== false/);
  assert.match(employeeCentre, /ReadOnlyEmployeePanel/);
  assert.match(employeeCentre, /cannot create, edit, approve, reject, pay, terminate, or configure employee records/);
});

test("Jimmy migration links the existing account and grants read-only permissions only", () => {
  assert.match(migration, /Jimmy Makino user account was not found/);
  assert.match(migration, /Multiple active Jimmy Makino employee records exist/);
  assert.match(migration, /'company_manager_read_only'/);
  assert.match(migration, /update public\.users[\s\S]+employee_id = v_employee_id[\s\S]+account_type = 'company_manager_read_only'/);
  assert.match(migration, /update public\.employees[\s\S]+user_id = v_user_id[\s\S]+role_name = 'Company Manager - Read Only'/);
  assert.match(migration, /p\.key !~ '\(\\\.read\|\\\.view\)\$'/);
  assert.match(migration, /p\.key = any\(array\[[\s\S]+'settings\.manage'[\s\S]+'reports\.manage'/);
  assert.match(migration, /update auth\.refresh_tokens[\s\S]+revoked = true/);
  assert.match(migration, /delete from auth\.sessions/);
  assert.match(migration, /auth_mode := 'admin'/);
  assert.match(migration, /is_company_admin := false/);
});
