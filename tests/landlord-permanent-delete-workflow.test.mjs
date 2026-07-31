import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const profile = readFileSync("components/office/landlords/LandlordProfile.tsx", "utf8");
const actions = readFileSync("app/actions/landlords.ts", "utf8");
const migration = readFileSync("supabase/upgrade_migrations/0230_landlord_permanent_delete_workflow.sql", "utf8");
const deleteRepairMigration = readFileSync("supabase/upgrade_migrations/0232_permanent_landlord_delete_deborah_repair.sql", "utf8");

test("landlord permanent delete is an Admin-only premium danger flow", () => {
  assert.match(profile, /Permanently Delete Landlord & Portfolio/);
  assert.match(profile, /landlordDeleteConfirmation !== "DELETE"/);
  assert.match(profile, /Deletion reason/);
  assert.match(profile, /canAdminManage && landlordDeleteOpen/);
  assert.match(profile, /permanentlyDeleteLandlordPortfolio/);
});

test("permanent delete server action requires company Admin mode and calls the atomic RPC", () => {
  assert.match(actions, /export async function permanentlyDeleteLandlordPortfolio/);
  assert.match(actions, /activeAdminWriteContext\(\)/);
  assert.match(actions, /ddumba_v1_permanently_delete_landlord_portfolio/);
  assert.match(actions, /p_confirmation: input\.confirmation/);
  assert.match(actions, /formatPermanentDeleteFailure/);
  assert.match(actions, /result\.ok === false/);
  assert.match(actions, /revalidatePath\("\/office\/landlords"\)/);
});

test("database workflow validates blockers and writes an immutable audit record", () => {
  const sql = `${migration}\n${deleteRepairMigration}`;
  assert.match(sql, /create or replace function public\.ddumba_v1_landlord_delete_preview/);
  assert.match(sql, /create or replace function public\.ddumba_v1_permanently_delete_landlord_portfolio/);
  assert.match(sql, /for update/);
  assert.match(sql, /NOT_AUTHORIZED/);
  assert.match(sql, /ALREADY_DELETED/);
  assert.match(sql, /DELETE_FAILED/);
  assert.match(sql, /active_tenants/);
  assert.match(sql, /pending_landlord_payments/);
  assert.match(sql, /unresolved_security_deposits/);
  assert.match(sql, /payment_history_preserved/);
  assert.match(sql, /lease_history_snapshotted/);
  assert.match(sql, /vacated_debt_preserved/);
  assert.match(sql, /tenant_ledger_entries/);
  assert.match(sql, /disable trigger user/);
  assert.match(sql, /enable trigger user/);
  assert.match(sql, /landlord_permanently_deleted/);
  assert.match(sql, /deleted_room_numbers/);
});
