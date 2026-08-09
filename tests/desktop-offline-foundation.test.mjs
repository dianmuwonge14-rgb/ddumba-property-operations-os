import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/upgrade_migrations/0262_offline_desktop_sync_foundation.sql", import.meta.url), "utf8");
const syncRoute = readFileSync(new URL("../app/api/desktop/sync/route.ts", import.meta.url), "utf8");
const devicesRoute = readFileSync(new URL("../app/api/desktop/devices/route.ts", import.meta.url), "utf8");
const bootstrapRoute = readFileSync(new URL("../app/api/desktop/bootstrap/route.ts", import.meta.url), "utf8");
const desktopLoginRoute = readFileSync(new URL("../app/api/desktop/login/route.ts", import.meta.url), "utf8");
const desktopSession = readFileSync(new URL("../lib/offline/desktop-session.ts", import.meta.url), "utf8");
const desktopRuntime = readFileSync(new URL("../lib/offline/desktop-runtime.ts", import.meta.url), "utf8");
const desktopShellScript = readFileSync(new URL("../scripts/prepare-desktop-dist.mjs", import.meta.url), "utf8");
const statusChip = readFileSync(new URL("../components/office/shared/DesktopSyncStatus.tsx", import.meta.url), "utf8");
const syncCentre = readFileSync(new URL("../components/office/sync/SyncCentre.tsx", import.meta.url), "utf8");
const paymentEntry = readFileSync(new URL("../components/office/payments/FastPaymentsEntry.tsx", import.meta.url), "utf8");
const desktopDevices = readFileSync(new URL("../components/office/admin/DesktopDevicesConsole.tsx", import.meta.url), "utf8");
const nativeStore = readFileSync(new URL("../src-tauri/src/offline_store.rs", import.meta.url), "utf8");
const desktopServer = readFileSync(new URL("../src-tauri/src/desktop_server.rs", import.meta.url), "utf8");
const tauriConfig = readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8");

test("desktop migration stores devices, mutations, conflicts and offline idempotency", () => {
  assert.match(migration, /create table if not exists public\.desktop_devices/);
  assert.match(migration, /create table if not exists public\.desktop_sync_mutations/);
  assert.match(migration, /create table if not exists public\.desktop_sync_conflicts/);
  assert.match(migration, /constraint desktop_sync_mutations_company_tx_unique unique\(company_id, transaction_uuid\)/);
  assert.match(migration, /add column if not exists offline_transaction_uuid uuid/);
  assert.match(migration, /idx_collections_company_offline_transaction_uuid/);
});

test("desktop sync endpoint requires auth and queues envelopes without financial shadow posting", () => {
  assert.match(syncRoute, /requireDesktopContext/);
  assert.match(syncRoute, /bearerTokenFromRequest\(request\) \? requireDesktopContext\(request\) : requireAuth\(\)/);
  assert.match(syncRoute, /normalizeOfflineTransactionUuid/);
  assert.match(syncRoute, /OFFLINE_MUTATION_TYPES/);
  assert.match(syncRoute, /desktop_sync_mutations/);
  assert.match(syncRoute, /recordCollection/);
  assert.match(syncRoute, /alreadyProcessed/);
  assert.doesNotMatch(syncRoute, /\.from\("collections"\)\.insert/);
});

test("desktop device endpoint registers authenticated devices only", () => {
  assert.match(devicesRoute, /await requireAuth\(\)/);
  assert.match(devicesRoute, /desktop_devices/);
  assert.match(devicesRoute, /onConflict: "company_id,device_id"/);
  assert.match(devicesRoute, /Only Admin may revoke desktop devices/);
});

test("desktop bootstrap downloads authorised working cache", () => {
  assert.match(bootstrapRoute, /requireDesktopContext/);
  assert.match(bootstrapRoute, /bearerTokenFromRequest\(request\) \? requireDesktopContext\(request\) : requireAuth\(\)/);
  assert.match(bootstrapRoute, /rooms/);
  assert.match(bootstrapRoute, /tenants/);
  assert.match(bootstrapRoute, /landlords/);
  assert.match(bootstrapRoute, /security_deposit_register/);
  assert.match(bootstrapRoute, /expense_categories/);
});

test("desktop login creates a durable desktop bearer session for local-first startup", () => {
  assert.match(desktopLoginRoute, /verifyDesktopLogin/);
  assert.match(desktopLoginRoute, /createDesktopSession/);
  assert.match(desktopSession, /desktop_auth_sessions/);
  assert.match(desktopSession, /token_hash/);
  assert.match(desktopSession, /expires_at/);
  assert.match(desktopSession, /desktopContextForUser/);
});

test("desktop bundle starts the real local Next app instead of a separate offline interface", () => {
  assert.doesNotMatch(desktopShellScript, /Open Ddumba OS/);
  assert.doesNotMatch(desktopShellScript, /Production Login/);
  assert.doesNotMatch(desktopShellScript, /window\.location\.href\s*=\s*WEB_URL/);
  assert.doesNotMatch(desktopShellScript, /Offline Payment Entry/);
  assert.doesNotMatch(desktopShellScript, /Offline Search/);
  assert.match(desktopShellScript, /\.next\/standalone/);
  assert.match(desktopShellScript, /next-app/);
  assert.match(desktopShellScript, /desktop_next_server_status/);
  assert.match(desktopServer, /server\.js/);
  assert.match(desktopServer, /127\.0\.0\.1/);
  assert.match(desktopServer, /NODE_ENV/);
  assert.match(desktopServer, /production/);
});

test("office shell exposes sync status and sync centre queue visibility", () => {
  assert.match(statusChip, /ONLINE - SYNCED/);
  assert.match(statusChip, /OFFLINE/);
  assert.match(statusChip, /href="\/office\/sync-centre"/);
  assert.match(syncCentre, /Offline Work Queue/);
  assert.match(syncCentre, /readOfflineQueue/);
  assert.match(syncCentre, /Prepare Offline Workspace/);
  assert.match(syncCentre, /Retry Sync/);
});

test("desktop runtime bridges Tauri SQLite and sync APIs", () => {
  assert.match(desktopRuntime, /desktop_init_offline_database/);
  assert.match(desktopRuntime, /desktop_save_cache_records/);
  assert.match(desktopRuntime, /desktop_search_cache/);
  assert.match(desktopRuntime, /desktop_save_offline_payment/);
  assert.match(desktopRuntime, /\/api\/desktop\/sync/);
});

test("payment entry queues offline payments with provisional receipts", () => {
  assert.match(paymentEntry, /queueOfflineTenantPayment/);
  assert.match(paymentEntry, /OFFLINE - PENDING SYNC/);
  assert.match(paymentEntry, /provisionalReceiptNumber/);
});

test("native desktop store creates SQLite cache, indexes, mutations and receipts", () => {
  assert.match(nativeStore, /create table if not exists cache_records/);
  assert.match(nativeStore, /idx_cache_records_search/);
  assert.match(nativeStore, /create table if not exists offline_mutations/);
  assert.match(nativeStore, /create table if not exists offline_receipts/);
  assert.match(nativeStore, /desktop SQLite database could not be opened/i);
});

test("admin device management exposes revocation", () => {
  assert.match(desktopDevices, /Desktop Devices/);
  assert.match(desktopDevices, /Revoke Offline Access/);
  assert.match(desktopDevices, /\/api\/desktop\/devices/);
});

test("tauri scaffold targets Windows and macOS installers", () => {
  const parsed = JSON.parse(tauriConfig);
  assert.equal(parsed.productName, "Ddumba Property Operations OS");
  assert.deepEqual(parsed.bundle.targets, ["msi", "nsis", "dmg"]);
  assert.deepEqual(parsed.bundle.icon, ["icons/icon.icns", "icons/icon.ico"]);
  assert.deepEqual(parsed.bundle.resources, ["resources/"]);
  assert.equal(parsed.build.devUrl, "http://localhost:3000");
});
