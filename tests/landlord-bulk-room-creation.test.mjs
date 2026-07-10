import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const actionSource = readFileSync(new URL("../app/actions/properties.ts", import.meta.url), "utf8");
const wizardSource = readFileSync(new URL("../components/office/properties/NewLandlordBulkRoomsWizard.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/upgrade_migrations/0205_landlord_bulk_room_atomic_creation.sql", import.meta.url), "utf8");

test("new landlord bulk room creation uses one atomic Supabase RPC", () => {
  assert.match(actionSource, /materializeLandlordWithRoomsBulk/);
  assert.match(actionSource, /ddumba_v1_create_landlord_with_rooms_bulk/);
  assert.doesNotMatch(actionSource, /created\.leaseIds\.length/);
  assert.doesNotMatch(actionSource, /created\.roomIds\.length\) await db\.from\("rooms"\)\.delete/);
});

test("atomic migration records landlord, property, room, tenant and audit rows", () => {
  assert.match(migration, /create or replace function public\.ddumba_v1_create_landlord_with_rooms_bulk/);
  assert.match(migration, /insert into public\.landlords/);
  assert.match(migration, /insert into public\.properties/);
  assert.match(migration, /insert into public\.rooms/);
  assert.match(migration, /insert into public\.tenants/);
  assert.match(migration, /insert into public\.leases/);
  assert.match(migration, /insert into public\.audit_logs/);
});

test("new landlord wizard prevents duplicate submissions with a clear saving state", () => {
  assert.match(wizardSource, /disabled=\{!canManage \|\| isPending\}/);
  assert.match(wizardSource, /Saving landlord and rooms/);
  assert.match(wizardSource, /Submitted for Admin approval|Save Live Now/);
});
