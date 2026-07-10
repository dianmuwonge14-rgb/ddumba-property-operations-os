import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const landlordData = readFileSync(new URL("../lib/landlords/data.ts", import.meta.url), "utf8");
const collectionsData = readFileSync(new URL("../lib/collections/data.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/upgrade_migrations/0203_landlord_search_room_relationships.sql", import.meta.url), "utf8");

test("landlord portfolio search uses the compact full landlord-room index", () => {
  assert.match(landlordData, /room_numbers_text\.ilike/);
  assert.match(landlordData, /phone\.ilike/);
  assert.match(landlordData, /office_name\.ilike/);
  assert.match(landlordData, /location_text\.ilike/);
  assert.match(landlordData, /searchable_text\.ilike/);
  assert.match(landlordData, /rankLandlordSearchIndexRows/);
});

test("local landlord filtering includes room numbers and indexed search text", () => {
  const consoleCode = readFileSync(new URL("../components/office/landlords/LandlordsConsole.tsx", import.meta.url), "utf8");
  assert.match(consoleCode, /landlord\.searchableText/);
  assert.match(consoleCode, /landlord\.rooms\.map\(\(room\) => room\.room\.room_number\)/);
  assert.match(consoleCode, /compactLandlordSearch/);
});

test("payment room lookup resolves property-owned landlords when room landlord is missing", () => {
  assert.match(collectionsData, /hydrateFastPaymentRpcResults/);
  assert.match(collectionsData, /result\.room\?\.landlord_id \?\? property\?\.landlord_id/);
  assert.match(collectionsData, /room\?\.landlord_id \?\? property\?\.landlord_id/);
});

test("search index migration includes property landlord relationships", () => {
  assert.match(migration, /property_landlords/);
  assert.match(migration, /portfolio_rooms/);
  assert.match(migration, /idx_landlord_search_index_room_numbers_trgm/);
  assert.match(migration, /ddumba_v1_refresh_landlord_search_index/);
  assert.match(migration, /perform public\.ddumba_v1_refresh_landlord_search_index/);
});
