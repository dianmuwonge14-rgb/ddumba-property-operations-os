import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const profile = readFileSync("components/office/landlords/LandlordProfile.tsx", "utf8");
const actions = readFileSync("app/actions/landlords.ts", "utf8");
const migration = readFileSync("supabase/upgrade_migrations/0230_landlord_permanent_delete_workflow.sql", "utf8");

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
  assert.match(actions, /revalidatePath\("\/office\/landlords"\)/);
});

test("database workflow validates blockers and writes an immutable audit record", () => {
  assert.match(migration, /create or replace function public\.ddumba_v1_landlord_delete_preview/);
  assert.match(migration, /create or replace function public\.ddumba_v1_permanently_delete_landlord_portfolio/);
  assert.match(migration, /for update/);
  assert.match(migration, /active_tenants/);
  assert.match(migration, /pending_landlord_payments/);
  assert.match(migration, /unresolved_security_deposits/);
  assert.match(migration, /financial_history/);
  assert.match(migration, /room_history/);
  assert.match(migration, /landlord_permanently_deleted/);
  assert.match(migration, /deleted_room_numbers/);
});
