import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const loginRoute = readFileSync(new URL("../app/api/auth/office-login/route.ts", import.meta.url), "utf8");
const loginForm = readFileSync(new URL("../components/auth/PinLoginForm.tsx", import.meta.url), "utf8");
const adminActions = readFileSync(new URL("../app/actions/admin-accounts.ts", import.meta.url), "utf8");
const adminCentre = readFileSync(new URL("../components/office/admin/OfficeAccountManagementCentre.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/upgrade_migrations/0242_receptionist_login_model.sql", import.meta.url), "utf8");

test("login rejects direct shared office accounts with the required message", () => {
  assert.match(loginRoute, /DIRECT_OFFICE_LOGIN_MESSAGE/);
  assert.match(loginRoute, /Direct office login is no longer available\. Please sign in using your assigned receptionist account\./);
  assert.match(loginRoute, /isSharedOfficeAccount/);
  assert.match(loginRoute, /directOfficeLoginDisabled: true/);
  assert.match(loginRoute, /ddumba_v1_check_direct_office_login/);
  assert.match(migration, /ddumba_v1_check_direct_office_login/);
  assert.match(migration, /lower\(coalesce\(u\.account_type, ''\)\) = 'office'/);
});

test("login page asks for a personal receptionist identifier and personal PIN", () => {
  assert.match(loginForm, /Receptionist Login/);
  assert.match(loginForm, /Username \/ phone \/ employee code/);
  assert.match(loginForm, /Personal PIN \/ Password/);
  assert.match(loginForm, /identifier: loginIdentifier/);
});

test("personal receptionist login resolves identifier plus PIN before shared PIN fallback", () => {
  assert.match(loginRoute, /ddumba_v1_verify_personal_office_login/);
  assert.match(loginRoute, /p_identifier: identifier/);
  assert.match(loginRoute, /personal_office_credential_rpc/);
  assert.match(migration, /create or replace function public\.ddumba_v1_verify_personal_office_login/);
  assert.match(migration, /coalesce\(lower\(u\.account_type\), ''\) <> 'office'/);
  assert.match(migration, /lower\(coalesce\(e\.employee_code, ''\)\) = lower\(trim\(p_identifier\)\)/);
  assert.match(migration, /auth_mode := 'office'/);
});

test("admin creates receptionist accounts instead of new shared office accounts", () => {
  assert.match(adminCentre, /Receptionist Account/);
  assert.match(adminCentre, /Create Receptionist Account/);
  assert.match(adminCentre, /ReceptionistAccountForm/);
  assert.match(adminCentre, /employeeId/);
  assert.match(adminCentre, /effectiveStartDate/);
  assert.match(adminActions, /accountType\?: "office" \| "admin" \| "receptionist"/);
  assert.match(adminActions, /Direct office accounts are no longer available\. Create a Receptionist account instead\./);
  assert.match(adminActions, /receptionist_account_created/);
  assert.match(adminActions, /linkReceptionistEmployee/);
  assert.match(adminActions, /resolveReceptionistEmployee/);
  assert.match(adminActions, /const confirmPin = input\.confirmPin\?\.trim\(\) \|\| pin/);
  assert.match(adminActions, /defaultReceptionistRoleId\(context\.activeCompany\.id\)/);
  assert.match(adminActions, /normalizePhone/);
  assert.match(adminActions, /Employee .* is already linked to an active login account/);
});

test("linking an existing receptionist preserves employee identity fields", () => {
  assert.match(adminActions, /employee_code: employee\.employee_code \|\| input\.loginIdentifier/);
  assert.match(adminActions, /phone: employee\.phone \|\| input\.phone/);
});

test("receptionist role is office-scoped and inherits current office permissions", () => {
  assert.match(migration, /'receptionist'/);
  assert.match(migration, /Personal office receptionist login/);
  assert.match(migration, /join public\.roles office_role[\s\S]+office_role\.key = 'office_manager'/);
  assert.match(migration, /insert into public\.role_permissions/);
  assert.match(migration, /employee_id uuid references public\.employees/);
  assert.match(migration, /effective_from date/);
  assert.match(migration, /idx_user_office_roles_receptionist_scope/);
});

test("public office selector requires non-office personal credentials", () => {
  assert.match(migration, /ddumba_v1_public_office_login_options/);
  assert.match(migration, /coalesce\(lower\(u\.account_type\), ''\) <> 'office'/);
  assert.match(migration, /coalesce\(lower\(uor\.status\), 'active'\) = 'active'/);
});
