import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const centreSource = readFileSync(new URL("../components/office/admin/OfficeMergeCentre.tsx", import.meta.url), "utf8");
const actionSource = readFileSync(new URL("../app/actions/office-merge.ts", import.meta.url), "utf8");
const routeSource = readFileSync(new URL("../app/api/admin/office-merge/route.ts", import.meta.url), "utf8");
const migrationSource = readFileSync(new URL("../supabase/upgrade_migrations/0208_office_merge_transaction_rpc.sql", import.meta.url), "utf8");

test("office merge UI uses explicit source and destination offices", () => {
  assert.match(centreSource, /sourceOfficeId/);
  assert.match(centreSource, /destinationOfficeId/);
  assert.match(centreSource, /Source office/);
  assert.match(centreSource, /Destination office/);
  assert.match(centreSource, /Source and destination cannot be the same/);
  assert.doesNotMatch(centreSource, /New merged office name/);
});

test("merge button opens a confirmation modal before sending the server request", () => {
  assert.match(centreSource, /openConfirmation/);
  assert.match(centreSource, /setShowConfirm\(true\)/);
  assert.match(centreSource, /Final confirmation/);
  assert.match(centreSource, /Confirm Office Merge/);
  assert.match(centreSource, /Starting merge/);
  assert.match(centreSource, /disabled=\{!canExecute \|\| isSubmitting\}/);
});

test("office merge client sends one compact JSON request with ids only", () => {
  assert.match(centreSource, /fetch\("\/api\/admin\/office-merge"/);
  assert.match(centreSource, /sourceOfficeId,/);
  assert.match(centreSource, /destinationOfficeId,/);
  assert.match(centreSource, /userHandling,/);
  assert.match(centreSource, /credentials: "same-origin"/);
  assert.match(centreSource, /Network connection failed while starting the merge/);
  assert.doesNotMatch(centreSource, /executeOfficeMerge\(/);
  assert.doesNotMatch(centreSource, /affectedCounts:/);
  assert.match(centreSource, /Office merge completed successfully/);
});

test("office merge API returns structured JSON errors instead of redirects or NetworkError", () => {
  assert.match(routeSource, /export async function POST/);
  assert.match(routeSource, /getAuthContext/);
  assert.match(routeSource, /OFFICE_MERGE_AUTH_EXPIRED/);
  assert.match(routeSource, /OFFICE_MERGE_PERMISSION_DENIED/);
  assert.match(routeSource, /NextResponse\.json/);
  assert.match(routeSource, /success: false/);
  assert.match(routeSource, /sourceOfficeIds/);
  assert.match(routeSource, /loadServerCounts/);
  assert.match(routeSource, /db\.rpc\("ddumba_merge_offices"/);
  assert.doesNotMatch(routeSource, /redirect\(/);
});

test("server action validates office selection and delegates to transactional RPC", () => {
  assert.match(actionSource, /Select a source office/);
  assert.match(actionSource, /Select a destination office/);
  assert.match(actionSource, /Source and destination cannot be the same/);
  assert.match(actionSource, /Destination office is inactive or merged/);
  assert.match(actionSource, /db\.rpc\("ddumba_merge_offices"/);
  assert.match(actionSource, /Database setup is incomplete/);
  assert.match(actionSource, /office_merge_completed/);
});

test("office merge RPC locks offices and preserves history", () => {
  assert.match(migrationSource, /create or replace function public\.ddumba_merge_offices/);
  assert.match(migrationSource, /for update/);
  assert.match(migrationSource, /office_merge_batches/);
  assert.match(migrationSource, /office_merge_audit/);
  assert.match(migrationSource, /source_office_archived_after_merge/);
  assert.match(migrationSource, /merged_into_office_id/);
  assert.match(migrationSource, /merge_batch_id/);
});

test("office merge RPC checks conflicts and moves office scoped rows dynamically", () => {
  assert.match(migrationSource, /unresolved room-number conflicts/);
  assert.match(migrationSource, /information_schema\.columns/);
  assert.match(migrationSource, /column_name = 'office_id'/);
  assert.match(migrationSource, /update public\.%I set %s where %s/);
  assert.match(migrationSource, /transferred_counts/);
  assert.match(migrationSource, /accounts_reassigned/);
});
