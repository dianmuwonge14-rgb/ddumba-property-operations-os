import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const employeeActions = readFileSync(new URL("../app/actions/employees.ts", import.meta.url), "utf8");
const adminAccountActions = readFileSync(new URL("../app/actions/admin-accounts.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/upgrade_migrations/0245_employee_duplicate_prevention.sql", import.meta.url), "utf8");

test("employee creation and editing block likely duplicates before saving", () => {
  assert.match(employeeActions, /const DUPLICATE_EMPLOYEE_MESSAGE = "An employee with these details already exists\."/);
  assert.match(employeeActions, /async function assertNoDuplicateEmployee/);
  assert.match(employeeActions, /normalizeEmployeeName/);
  assert.match(employeeActions, /normalizeEmployeePhone/);
  assert.match(employeeActions, /normalizeEmployeeCode/);
  assert.match(employeeActions, /normalizeEmployeeEmail/);
  assert.match(employeeActions, /await assertNoDuplicateEmployee\(\{ companyId, employeeCode, email, fullName, phone \}\)/);
  assert.match(employeeActions, /excludeEmployeeId: employeeId/);
});

test("receptionist employee creation maps duplicate database failures to the same safe message", () => {
  assert.match(adminAccountActions, /const DUPLICATE_EMPLOYEE_MESSAGE = "An employee with these details already exists\."/);
  assert.match(adminAccountActions, /employee with these details already exists\|duplicate key/i);
  assert.match(adminAccountActions, /throw new Error\(DUPLICATE_EMPLOYEE_MESSAGE\)/);
});

test("database migration prevents future active employee duplicates", () => {
  assert.match(migration, /create or replace function public\.ddumba_prevent_duplicate_active_employee/);
  assert.match(migration, /create trigger trg_ddumba_prevent_duplicate_active_employee/);
  assert.match(migration, /before insert or update of company_id, full_name, employee_code, phone, email, status/);
  assert.match(migration, /An employee with these details already exists\./);
  assert.match(migration, /ddumba_normalize_employee_name/);
  assert.match(migration, /ddumba_normalize_employee_phone/);
  assert.match(migration, /idx_employees_unique_active_company_code/);
  assert.match(migration, /idx_employees_unique_active_company_email/);
  assert.match(migration, /idx_employees_unique_active_company_name/);
  assert.match(migration, /idx_employees_unique_active_company_phone/);
});
