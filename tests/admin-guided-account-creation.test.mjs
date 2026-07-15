import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const actionSource = readFileSync(new URL("../app/actions/admin-accounts.ts", import.meta.url), "utf8");
const collectorActionSource = readFileSync(new URL("../app/actions/collectors.ts", import.meta.url), "utf8");
const centreSource = readFileSync(new URL("../components/office/admin/OfficeAccountManagementCentre.tsx", import.meta.url), "utf8");
const reactivateActionSource = actionSource.slice(
  actionSource.indexOf("export async function reactivateOfficeAccount"),
  actionSource.indexOf("export async function createOffice("),
);

test("admin office creation is guided and requires login credentials before completion", () => {
  assert.match(centreSource, /Create New/);
  assert.match(centreSource, /What do you want to create\?/);
  assert.match(centreSource, /Office details/);
  assert.match(centreSource, /Office login/);
  assert.match(centreSource, /Review and create/);
  assert.match(centreSource, /PIN must contain exactly six digits|Exactly six digits/);
  assert.match(centreSource, /validStep2/);
  assert.match(centreSource, /createOfficeWithLogin/);
});

test("office creation action creates office and login together with rollback cleanup", () => {
  assert.match(actionSource, /export async function createOfficeWithLogin/);
  assert.match(actionSource, /defaultOfficeRoleId/);
  assert.match(actionSource, /company_id\.is\.null/);
  assert.match(actionSource, /admin\.auth\.admin\.createUser/);
  assert.match(actionSource, /setPinCredential/);
  assert.match(actionSource, /assignRole/);
  assert.match(actionSource, /office_created_with_login/);
  assert.match(actionSource, /ignoreCleanupError/);
  assert.match(actionSource, /deleteUser/);
  assert.match(actionSource, /createOfficeWithLogin failed/);
  assert.match(actionSource, /Office was not created because login setup failed/);
});

test("admin guided creation rejects duplicate office and login identifiers", () => {
  assert.match(actionSource, /Office name already exists/);
  assert.match(actionSource, /Office code already exists/);
  assert.match(actionSource, /Login name already exists/);
  assert.match(actionSource, /ilike\("full_name", loginName\)/);
});

test("incomplete office setups are surfaced instead of duplicating offices", () => {
  assert.match(centreSource, /Incomplete Setups/);
  assert.match(centreSource, /Nakiwogo was found in Incomplete Setup/);
  assert.match(centreSource, /Complete Setup/);
  assert.match(centreSource, /instead of creating a duplicate office/i);
  assert.match(actionSource, /Incomplete office setup already exists/);
});

test("six digit PIN rule applies to office and collector creation", () => {
  assert.match(actionSource, /function assertOfficePin/);
  assert.match(actionSource, /\/\^\\d\{6\}\$\//);
  assert.match(actionSource, /PIN confirmation does not match/);
  assert.match(centreSource, /confirmPin: String\(formData\.get\("confirmPin"\)/);
  assert.match(collectorActionSource, /PIN must contain exactly six digits/);
});

test("account deactivation requires a reason and blocks live access without deleting the account", () => {
  assert.match(actionSource, /export async function deactivateOfficeAccount/);
  assert.match(actionSource, /Deactivation reason is required/);
  assert.match(actionSource, /You cannot deactivate your own account/);
  assert.match(actionSource, /final active Super Admin cannot be deactivated/);
  assert.match(actionSource, /System\/service accounts cannot be deactivated/);
  assert.match(actionSource, /status: "inactive"/);
  assert.match(actionSource, /pin_status: "revoked"/);
  assert.match(actionSource, /account_status: "inactive"/);
  assert.match(actionSource, /account_deactivated/);
  assert.match(actionSource, /employees"\)\s*\.update\(\{ status: "inactive"/);
});

test("account reactivation restores existing account without recreating roles or offices", () => {
  assert.match(actionSource, /export async function reactivateOfficeAccount/);
  assert.match(actionSource, /Account is already active/);
  assert.match(actionSource, /status: "active"/);
  assert.match(actionSource, /pin_status: "active"/);
  assert.match(actionSource, /account_status: "active"/);
  assert.match(actionSource, /account_reactivated/);
  assert.doesNotMatch(reactivateActionSource, /admin\.auth\.admin\.createUser/);
});

test("admin account management shows a confirmation panel and refreshes after status changes", () => {
  assert.match(centreSource, /Deactivate account\?/);
  assert.match(centreSource, /Required deactivation reason/);
  assert.match(centreSource, /Access will stop immediately/);
  assert.match(centreSource, /Reactivate account\?/);
  assert.match(centreSource, /router\.refresh\(\)/);
  assert.match(centreSource, /Deactivate Account/);
});
