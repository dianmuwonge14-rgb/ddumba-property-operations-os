import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const loginRoute = readFileSync(new URL("../app/api/auth/office-login/route.ts", import.meta.url), "utf8");
const authContext = readFileSync(new URL("../lib/auth/context.ts", import.meta.url), "utf8");
const permissions = readFileSync(new URL("../lib/auth/permissions.ts", import.meta.url), "utf8");
const layout = readFileSync(new URL("../components/office/shared/OfficeLayout.tsx", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../components/office/shared/OfficeSidebar.tsx", import.meta.url), "utf8");
const paymentsAdminPage = readFileSync(new URL("../app/office/admin/payments/page.tsx", import.meta.url), "utf8");
const paymentEntry = readFileSync(new URL("../components/office/payments/FastPaymentsEntry.tsx", import.meta.url), "utf8");
const collectionActions = readFileSync(new URL("../app/actions/collections.ts", import.meta.url), "utf8");
const expensesPage = readFileSync(new URL("../app/office/expenses/page.tsx", import.meta.url), "utf8");
const expensesConsole = readFileSync(new URL("../components/office/expenses/ExpensesConsole.tsx", import.meta.url), "utf8");
const expenseActions = readFileSync(new URL("../app/actions/expenses.ts", import.meta.url), "utf8");
const expenseData = readFileSync(new URL("../lib/expenses/data.ts", import.meta.url), "utf8");
const payrollData = readFileSync(new URL("../lib/salary-centre/data.ts", import.meta.url), "utf8");
const payrollCentre = readFileSync(new URL("../components/office/salary/AdminPayrollCentre.tsx", import.meta.url), "utf8");
const employeeData = readFileSync(new URL("../lib/employee-management/data.ts", import.meta.url), "utf8");
const employeeCentre = readFileSync(new URL("../components/office/admin/EmployeeManagementCentre.tsx", import.meta.url), "utf8");
const collectorsData = readFileSync(new URL("../lib/collectors/data.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/upgrade_migrations/0253_jimmy_company_manager_read_only.sql", import.meta.url), "utf8");

test("read-only manager enters the admin viewing shell without becoming a company admin", () => {
  assert.match(loginRoute, /ddumba_v1_verify_read_only_manager_login/);
  assert.match(loginRoute, /read_only_manager_credential_rpc/);
  assert.ok(
    loginRoute.indexOf("read_only_manager_credential_rpc") < loginRoute.indexOf("personal_office_credential_rpc"),
    "read-only manager credentials must be checked before personal office credentials",
  );
  assert.match(loginRoute, /managerIdentityOverride/);
  assert.match(loginRoute, /auth_mode: "admin"/);
  assert.match(loginRoute, /const isReadOnlyManager = isAdmin && !identity\.is_company_admin/);
  assert.match(loginRoute, /isCompanyAdmin: identity\.is_company_admin/);
  assert.match(loginRoute, /redirectTo: identity\.redirect_to \?\? \(isAdmin \? "\/office\/admin\/cash-position"/);
  assert.match(authContext, /isRoleAssignmentActive/);
  assert.match(authContext, /const activeAssignments = \(assignments \?\? \[\]\)\.filter\(isRoleAssignmentActive\)/);
  assert.match(authContext, /const effectiveAuthMode = rawIsCompanyAdmin \|\| rawIsCompanyReadOnlyManager \? "admin" : requestedAuthMode/);
  assert.match(authContext, /rawIsCompanyReadOnlyManager/);
  assert.match(authContext, /roleKeys\.includes\("company_manager_read_only"\)/);
  assert.match(authContext, /isCompanyReadOnlyManager = !isOfficeMode && !isCollectorMode/);
  assert.match(permissions, /requireCompanyReadMode/);
  assert.match(collectorsData, /context\.isCompanyReadOnlyManager \|\| context\.isCompanyAdmin/);
  assert.match(collectorsData, /redirect\(context\.isCompanyReadOnlyManager \? "\/office\/admin\/cash-position" : "\/office"\)/);
});

test("manager shell exposes company-wide operational pages while keeping admin gates separate", () => {
  assert.match(layout, /isCompanyReadOnlyManager/);
  assert.match(sidebar, /managerSections/);
  assert.match(sidebar, /Payment Entry/);
  assert.match(sidebar, /Approval Status/);
  assert.match(sidebar, /Manager/);
  assert.match(permissions, /isCompanyOperationalManager/);
  assert.match(permissions, /canPostTenantPayments/);
  assert.match(permissions, /canSubmitOperationalExpenses/);
  assert.match(paymentsAdminPage, /entryMode=\{isManager \? "manager" : "admin"\}/);
  assert.match(paymentsAdminPage, /isAdmin=\{context\.isCompanyAdmin && !context\.isOfficeMode\}/);
  assert.match(paymentsAdminPage, /canPostPayments=\{canPostTenantPayments\(context\)\}/);
  assert.match(paymentEntry, /entryMode\?: "office" \| "admin" \| "collector" \| "manager"/);
  assert.match(paymentEntry, /canSearchAcrossOffices = isAdmin \|\| entryMode === "manager"/);
  assert.match(paymentEntry, /adminBackdatedPayment = isAdmin &&/);
  assert.match(collectionActions, /canPostTenantPayments\(context\)/);
});

test("manager expenses are cross-office submissions pending Admin approval", () => {
  assert.match(expensesPage, /requireOperationalExpenseEntryAccess/);
  assert.match(expensesPage, /canManage=\{canSubmitOperationalExpenses\(context\)\}/);
  assert.match(expensesPage, /isAdmin=\{context\.isCompanyAdmin && !context\.isOfficeMode\}/);
  assert.match(expensesPage, /isManager=\{context\.isCompanyReadOnlyManager && !context\.isOfficeMode\}/);
  assert.match(expenseData, /context\.isCompanyReadOnlyManager/);
  assert.match(expensesConsole, /Manager Expense Entry Office/);
  assert.match(expensesConsole, /Manager-entered expenses are saved to this office and remain Pending Admin Approval\./);
  assert.match(expensesConsole, /isManager \? \[/);
  assert.match(expensesConsole, /Awaiting Admin decision/);
  assert.match(expenseActions, /resolveOperationalExpenseOfficeId/);
  assert.match(expenseActions, /isCompanyOperationalManager\(context\)/);
  assert.match(expenseActions, /status: isDirectAdmin \? "approved" : "pending"/);
  assert.match(expenseActions, /approved_by: isDirectAdmin/);
  assert.match(expenseActions, /export async function approveExpense[\s\S]+requireCompanyAdminMode\(\)/);
  assert.match(expenseActions, /export async function rejectExpense[\s\S]+requireCompanyAdminMode\(\)/);
  assert.match(expenseActions, /function expenseManageContext/);
  assert.match(expenseActions, /isCompanyOperationalManager\(context\) \|\| !hasPermission\(context, "expenses\.manage"\)/);
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
