import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const actionSource = readFileSync(new URL("../app/actions/landlords.ts", import.meta.url), "utf8");
const profileSource = readFileSync(new URL("../components/office/landlords/LandlordProfile.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/upgrade_migrations/0213_canonical_landlord_room_creation.sql", import.meta.url), "utf8");

test("existing landlord Add Room uses the canonical room creation RPC", () => {
  assert.match(actionSource, /ddumba_v1_create_landlord_room/);
  assert.match(actionSource, /p_room_payload: roomPayload/);
  assert.doesNotMatch(actionSource, /from\("rooms"\)\s*\.\s*insert\(\{ \.\.\.roomPayload/);
  assert.doesNotMatch(actionSource, /from\("rooms"\)\s*\.\s*update\(roomPayload\)/);
});

test("canonical room creation rejects duplicates and stores opening outstanding separately", () => {
  assert.match(migration, /create or replace function public\.ddumba_v1_create_landlord_room/);
  assert.match(migration, /raise exception 'Room % already exists in the selected property\/location\.'/);
  assert.match(migration, /openingOutstanding/);
  assert.match(migration, /outstanding_balance,\s*\n\s*payable_notes/);
  assert.match(migration, /v_opening_balance/);
});

test("new landlord and existing landlord paths share canonical room materialization", () => {
  assert.match(migration, /create or replace function public\.ddumba_v1_create_landlord_rooms_bulk/);
  assert.match(migration, /public\.ddumba_v1_create_landlord_room\(/);
  assert.match(migration, /create or replace function public\.ddumba_v1_create_landlord_with_rooms_bulk/);
});

test("Add Room form exposes opening outstanding to prevent rent-balance confusion", () => {
  assert.match(profileSource, /openingOutstanding/);
  assert.match(profileSource, /Opening Outstanding/);
  assert.match(profileSource, /openingOutstanding: Number\(roomForm\.openingOutstanding \|\| 0\)/);
});
