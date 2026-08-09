import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/upgrade_migrations/0261_unified_login_active_role_status.sql", import.meta.url), "utf8");

test("unified login ignores revoked role assignments before choosing admin or collector workspace", () => {
  assert.match(migration, /create or replace function public\.ddumba_v1_verify_unified_login/);
  assert.match(migration, /join public\.user_office_roles uor[\s\S]*coalesce\(lower\(uor\.status\), 'active'\) = 'active'[\s\S]*r\.key in \('company_admin', 'super_admin', 'hq_executive'\)/);
  assert.match(migration, /left join public\.user_office_roles uor[\s\S]*coalesce\(lower\(uor\.status\), 'active'\) = 'active'[\s\S]*r\.key in \('field_collector', 'collector'\)/);
  assert.match(migration, /coalesce\(r\.key, 'office_manager'\) not in \('company_admin', 'super_admin', 'hq_executive', 'field_collector', 'collector'\)/);
});
