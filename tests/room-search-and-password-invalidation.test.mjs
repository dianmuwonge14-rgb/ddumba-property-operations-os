import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const collectionsData = readFileSync(new URL("../lib/collections/data.ts", import.meta.url), "utf8");
const paymentsEntry = readFileSync(new URL("../components/office/payments/FastPaymentsEntry.tsx", import.meta.url), "utf8");
const credentialMigration = readFileSync(new URL("../supabase/upgrade_migrations/0220_fast_room_search_and_canonical_credentials.sql", import.meta.url), "utf8");
const adminAccounts = readFileSync(new URL("../app/actions/admin-accounts.ts", import.meta.url), "utf8");
const collectors = readFileSync(new URL("../app/actions/collectors.ts", import.meta.url), "utf8");
const loginRoute = readFileSync(new URL("../app/api/auth/office-login/route.ts", import.meta.url), "utf8");

test("room-number search keeps exact and prefix matches authoritative and fast", () => {
  assert.match(paymentsEntry, /lookup\.length < 2/);
  assert.match(paymentsEntry, /setTimeout\(\(\) => \{/);
  assert.match(paymentsEntry, /}, 250\)/);
  assert.match(paymentsEntry, /AbortController/);
  assert.match(paymentsEntry, /requestSeqRef/);
  assert.match(paymentsEntry, /params\.set\("allOffices", "1"\)/);
  assert.match(collectionsData, /normalizeRoomSearchValue/);
  assert.match(collectionsData, /if \(roomNumber === lookup\) return 0/);
  assert.match(collectionsData, /if \(roomNumber\.startsWith\(lookup\)\) return 1/);
  assert.match(collectionsData, /if \(roomNumber\.includes\(lookup\)\) return 2/);
  assert.match(credentialMigration, /idx_rooms_company_office_normalized_room_prefix/);
  assert.match(credentialMigration, /idx_rooms_company_normalized_room_prefix/);
  assert.match(credentialMigration, /room_match_count/);
  assert.match(credentialMigration, /where c\.match_rank <= 2 or m\.total = 0/);
  assert.match(credentialMigration, /limit \(select result_limit from search_input\)/);
});

test("password reset keeps only one canonical active credential and never stores plaintext PINs", () => {
  assert.match(credentialMigration, /idx_pin_credentials_one_unlocked_active_per_user/);
  assert.match(credentialMigration, /status = 'revoked'/);
  assert.match(credentialMigration, /admin_visible_pin = null/);
  assert.match(credentialMigration, /pc\.pin_hash = crypt\(p_secret, pc\.pin_hash\)/);
  assert.match(credentialMigration, /lower\(coalesce\(pc\.status, 'active'\)\) = 'active'/);
  assert.match(credentialMigration, /coalesce\(pc\.is_locked, false\) = false/);
  assert.match(credentialMigration, /pc\.locked_at is null/);
  assert.doesNotMatch(adminAccounts, /admin_visible_pin:\s*pin/);
  assert.doesNotMatch(collectors, /admin_visible_pin:\s*pin/);
  assert.match(loginRoute, /ddumba_v1_verify_unified_login/);
  assert.match(loginRoute, /updateUserById\(identity\.user_id/);
});

test("legacy employee PIN fallback cannot override a canonical credential", () => {
  assert.match(credentialMigration, /pc\.id is not null[\s\S]+pc\.pin_hash = crypt\(p_secret, pc\.pin_hash\)/);
  assert.match(credentialMigration, /pc\.id is null[\s\S]+nullif\(e\.employee_pin, ''\) = p_secret/);
});
