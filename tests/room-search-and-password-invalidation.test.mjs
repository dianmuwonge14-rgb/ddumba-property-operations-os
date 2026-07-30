import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const collectionsData = readFileSync(new URL("../lib/collections/data.ts", import.meta.url), "utf8");
const paymentsEntry = readFileSync(new URL("../components/office/payments/FastPaymentsEntry.tsx", import.meta.url), "utf8");
const credentialMigration = readFileSync(new URL("../supabase/upgrade_migrations/0220_fast_room_search_and_canonical_credentials.sql", import.meta.url), "utf8");
const hotPathMigration = readFileSync(new URL("../supabase/upgrade_migrations/0221_workflow_speed_hot_paths.sql", import.meta.url), "utf8");
const adminAccounts = readFileSync(new URL("../app/actions/admin-accounts.ts", import.meta.url), "utf8");
const collectors = readFileSync(new URL("../app/actions/collectors.ts", import.meta.url), "utf8");
const loginRoute = readFileSync(new URL("../app/api/auth/office-login/route.ts", import.meta.url), "utf8");
const loginForm = readFileSync(new URL("../components/auth/PinLoginForm.tsx", import.meta.url), "utf8");
const systemHealthRoute = readFileSync(new URL("../app/api/system/health/route.ts", import.meta.url), "utf8");

test("room-number search keeps exact and prefix matches authoritative and fast", () => {
  assert.match(paymentsEntry, /lookup\.length < 1/);
  assert.match(paymentsEntry, /setTimeout\(\(\) => \{/);
  assert.match(paymentsEntry, /}, 150\)/);
  assert.match(paymentsEntry, /AbortController/);
  assert.match(paymentsEntry, /requestSeqRef/);
  assert.match(paymentsEntry, /params\.set\("allOffices", "1"\)/);
  assert.match(paymentsEntry, /exactLookup\.length >= 1[\s\S]+reloadRoomDetails\(exactLookup\)/);
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

test("payments entry uses a lightweight indexed room search before hydrating full payment details", () => {
  assert.match(collectionsData, /rpc\("search_payment_rooms_lightweight"/);
  assert.match(collectionsData, /compactPaymentSearchRowToTenantResult\(row, paymentMonth\)/);
  assert.match(collectionsData, /searchPreviewOnly: true/);
  assert.match(collectionsData, /\.\.\.base,[\s\S]+landlord,[\s\S]+office: office\.id \? office : null/);
  assert.match(hotPathMigration, /idx_rooms_company_office_status_room_upper_prefix/);
  assert.match(hotPathMigration, /idx_rooms_company_status_room_upper_prefix/);
  assert.match(hotPathMigration, /idx_leases_active_tenant_company/);
  assert.match(hotPathMigration, /idx_collections_hot_tenant_date/);
  assert.match(hotPathMigration, /idx_tenant_exit_records_hot_room_date/);
  assert.match(hotPathMigration, /room_candidates as/);
  assert.match(hotPathMigration, /person_candidates as/);
  assert.match(hotPathMigration, /and \(select total from room_match_count\) = 0/);
  assert.match(hotPathMigration, /limit \(select result_limit from search_input\)/);
  assert.doesNotMatch(hotPathMigration, /latest_collections/);
  assert.doesNotMatch(hotPathMigration, /payment_receipts pr/);
});

test("login and payments entry avoid duplicate startup work", () => {
  assert.match(loginRoute, /redirectTo: isAdmin \? "\/office"/);
  assert.doesNotMatch(loginForm, /router\.refresh\(\)/);
  assert.match(loginForm, /LOGIN_TIMEOUT_MS/);
  assert.match(loginForm, /safeLoginError/);
  assert.match(loginForm, /AbortController/);
  assert.match(loginForm, /isSubmitting/);
  assert.match(paymentsEntry, /runAfterInitialPaint/);
  assert.match(paymentsEntry, /requestIdleCallback/);
  assert.match(paymentsEntry, /void loadRecentPayments/);
  assert.match(paymentsEntry, /void loadAdvanceRentAssistant/);
});

test("login outage handling never exposes raw Cloudflare HTML", () => {
  assert.match(loginRoute, /LOGIN_UNAVAILABLE_MESSAGE/);
  assert.match(loginRoute, /withLoginTimeout/);
  assert.match(loginRoute, /credential_rpc/);
  assert.match(loginRoute, /supabase_auth_sign_in/);
  assert.match(loginRoute, /office-login-failure/);
  assert.match(loginRoute, /isHtmlOrGatewayError/);
  assert.match(loginRoute, /errorReference/);
  assert.match(loginRoute, /status: 503/);
  assert.match(loginForm, /cloudflare\|error 522\|connection timed out/i);
  assert.match(systemHealthRoute, /Supabase Auth/);
  assert.match(systemHealthRoute, /API Gateway/);
  assert.match(systemHealthRoute, /Database/);
  assert.match(systemHealthRoute, /Realtime/);
});

test("payments entry shows lightweight room selection before live financial hydration", () => {
  assert.match(paymentsEntry, /setSelectedTenant\(result\)/);
  assert.match(paymentsEntry, /setLoadingTenantDetails\(true\)/);
  assert.match(paymentsEntry, /searchPreviewOnly/);
  assert.match(paymentsEntry, /Live tenant balance is still loading/);
  assert.match(paymentsEntry, /loadingDetails=\{loadingTenantDetails \|\| isSearchPreviewTenant\(selectedTenant\)\}/);
  assert.match(paymentsEntry, /isSearchPreviewTenant\(result\) \? "" : ` · Balance/);
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
