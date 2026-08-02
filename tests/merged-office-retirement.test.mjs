import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(new URL("../supabase/upgrade_migrations/0241_retire_merged_source_offices.sql", import.meta.url), "utf8");
const loginRoute = readFileSync(new URL("../app/api/auth/office-login/route.ts", import.meta.url), "utf8");
const officeMergeData = readFileSync(new URL("../lib/office-merge/data.ts", import.meta.url), "utf8");
const cashBankingData = readFileSync(new URL("../lib/cash-banking/data.ts", import.meta.url), "utf8");
const cashPositionData = readFileSync(new URL("../lib/cash-position-centre/data.ts", import.meta.url), "utf8");
const vacantRoomsData = readFileSync(new URL("../lib/vacant-rooms/data.ts", import.meta.url), "utf8");
const relocationData = readFileSync(new URL("../lib/tenant-relocation/data.ts", import.meta.url), "utf8");
const expensesData = readFileSync(new URL("../lib/expenses/data.ts", import.meta.url), "utf8");

test("merged source offices are retired with destination metadata and revoked credentials", () => {
  assert.match(migration, /ddumba_v1_retire_merged_offices/);
  assert.match(migration, /set status = 'merged'/);
  assert.match(migration, /merged_into_office_id = p_destination_office_id/);
  assert.match(migration, /status = 'revoked'/);
  assert.match(migration, /is_locked = true/);
  assert.match(migration, /revoked_reason = 'office_merged_into:'/);
  assert.match(migration, /office_retired_after_merge/);
  assert.match(migration, /office_merged_retired/);
});

test("login rejects merged office credentials with the required user-facing message", () => {
  assert.match(migration, /login_status := 'merged_office'/);
  assert.match(migration, /left join public\.offices dest on dest\.id = o\.merged_into_office_id/);
  assert.match(migration, /coalesce\(dest\.office_name, dest\.name, 'new office account'\)/);
  assert.match(migration, /lower\(coalesce\(o\.status, 'active'\)\) = 'merged'/);
  assert.match(migration, /o\.merged_into_office_id is not null/);
  assert.match(loginRoute, /"merged_office"/);
  assert.match(loginRoute, /This office was merged into/);
  assert.match(loginRoute, /Please use the new office account/);
  assert.match(loginRoute, /mergedOffice: true/);
  assert.match(loginRoute, /status: 403/);
});

test("active login and office selectors exclude merged source offices", () => {
  assert.match(migration, /ddumba_v1_public_office_login_options/);
  assert.match(migration, /where coalesce\(lower\(o\.status\), 'active'\) = 'active'/);
  assert.match(migration, /and o\.merged_into_office_id is null/);
  assert.match(migration, /coalesce\(lower\(u\.status\), 'active'\) = 'active'/);
  assert.match(migration, /coalesce\(lower\(pc\.status\), 'active'\) = 'active'/);
  assert.match(migration, /coalesce\(pc\.is_locked, false\) = false/);
  assert.match(migration, /coalesce\(lower\(o\.status\), 'active'\) = 'active'[\s\S]+o\.merged_into_office_id is null/);
});

test("database write guard blocks new active records under retired offices", () => {
  assert.match(migration, /ddumba_v1_reject_retired_office_write/);
  assert.match(migration, /before insert or update of office_id/);
  assert.match(migration, /This office was merged into %\. Please use the new office account\./);
  assert.match(migration, /'rooms'/);
  assert.match(migration, /'collections'/);
  assert.match(migration, /'expenses'/);
  assert.match(migration, /'security_deposit_register'/);
  assert.match(migration, /'collector_banking_submissions'/);
});

test("operational office lists use active non-merged offices", () => {
  for (const source of [officeMergeData, cashBankingData, cashPositionData, vacantRoomsData, relocationData, expensesData]) {
    assert.match(source, /ilike\("status", "active"\)/);
    assert.match(source, /is\("merged_into_office_id", null\)/);
  }
});
