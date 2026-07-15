import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const centreSource = readFileSync(new URL("../components/office/admin/OfficeMergeCentre.tsx", import.meta.url), "utf8");
const actionSource = readFileSync(new URL("../app/actions/office-merge.ts", import.meta.url), "utf8");
const routeSource = readFileSync(new URL("../app/api/admin/office-merge/route.ts", import.meta.url), "utf8");
const migrationSource = readFileSync(new URL("../supabase/upgrade_migrations/0208_office_merge_transaction_rpc.sql", import.meta.url), "utf8");

test("office merge UI creates a new merged office with source office multi-select", () => {
  assert.match(centreSource, /sourceOfficeIds/);
  assert.match(centreSource, /OFFICE CONSOLIDATION CENTRE/);
  assert.match(centreSource, /OfficeSelectionCard/);
  assert.match(centreSource, /New office name/);
  assert.match(centreSource, /newOfficeName/);
  assert.match(centreSource, /newOfficePin/);
  assert.match(centreSource, /confirmNewOfficePin/);
  assert.match(centreSource, /Secure PIN configured/);
  assert.match(centreSource, /MERGE OFFICES/);
  assert.doesNotMatch(centreSource, /Destination office/);
});

test("merge button opens a confirmation modal before sending the server request", () => {
  assert.match(centreSource, /openConfirmation/);
  assert.match(centreSource, /setShowConfirm\(true\)/);
  assert.match(centreSource, /Final confirmation/);
  assert.match(centreSource, /ConfirmationModal/);
  assert.match(centreSource, /Merge Offices/);
  assert.match(centreSource, /Starting secure merge/);
  assert.match(centreSource, /canExecute=\{canExecute\}/);
  assert.match(centreSource, /disabled=\{!props\.canExecute \|\| props\.isSubmitting\}/);
});

test("office merge UI exposes the premium six-step workflow panels", () => {
  assert.match(centreSource, /MergeStepIndicator/);
  assert.match(centreSource, /Select Offices/);
  assert.match(centreSource, /Configure New Office/);
  assert.match(centreSource, /Transfer Accounts/);
  assert.match(centreSource, /Review Live Preview/);
  assert.match(centreSource, /Confirm and Merge/);
  assert.match(centreSource, /Track Completion/);
  assert.match(centreSource, /NewMergedOfficeForm/);
  assert.match(centreSource, /AccountTransferPanel/);
  assert.match(centreSource, /LiveMergePreview/);
  assert.match(centreSource, /FinancialIntegrityPanel/);
  assert.match(centreSource, /ConflictReviewPanel/);
  assert.match(centreSource, /FinalMergeConfirmation/);
  assert.match(centreSource, /MergeProgressTimeline/);
  assert.match(centreSource, /MergeCompletionSummary/);
  assert.match(centreSource, /MergeHistoryPanel/);
});

test("office merge client sends one compact JSON request with ids only", () => {
  assert.match(centreSource, /fetch\("\/api\/admin\/office-merge"/);
  assert.match(centreSource, /action: "process"/);
  assert.match(centreSource, /jobId: payload\.jobId/);
  assert.match(centreSource, /sourceOfficeIds,/);
  assert.match(centreSource, /newOfficeName: cleanedOfficeName/);
  assert.match(centreSource, /newOfficePin,/);
  assert.match(centreSource, /confirmNewOfficePin,/);
  assert.match(centreSource, /accountHandling,/);
  assert.match(centreSource, /credentials: "same-origin"/);
  assert.match(centreSource, /Merge service unavailable or network connection failed/);
  assert.doesNotMatch(centreSource, /executeOfficeMerge\(/);
  const requestBody = centreSource.slice(centreSource.indexOf("body: JSON.stringify({"), centreSource.indexOf("credentials: \"same-origin\""));
  assert.doesNotMatch(requestBody, /affectedCounts/);
  assert.match(centreSource, /Office merge completed successfully/);
});

test("office merge validation requires usable new office credentials", () => {
  assert.match(centreSource, /New office name missing/);
  assert.match(centreSource, /Duplicate office name/);
  assert.match(centreSource, /PIN format invalid/);
  assert.match(centreSource, /Weak PIN/);
  assert.match(centreSource, /PIN confirmation mismatch/);
  assert.match(routeSource, /assertOfficePin/);
  assert.match(routeSource, /isWeakPin/);
  assert.match(routeSource, /OFFICE_MERGE_DUPLICATE_OFFICE_NAME/);
  assert.match(routeSource, /OFFICE_MERGE_PIN_INVALID/);
});

test("office merge API returns structured JSON errors instead of redirects or NetworkError", () => {
  assert.match(routeSource, /export async function POST/);
  assert.match(routeSource, /getAuthContext/);
  assert.match(routeSource, /OFFICE_MERGE_AUTH_EXPIRED/);
  assert.match(routeSource, /OFFICE_MERGE_PERMISSION_DENIED/);
  assert.match(routeSource, /NextResponse\.json/);
  assert.match(routeSource, /success: false/);
  assert.match(routeSource, /sourceOfficeIds/);
  assert.match(routeSource, /newOfficeName/);
  assert.match(routeSource, /newOfficePin/);
  assert.match(routeSource, /confirmNewOfficePin/);
  assert.match(routeSource, /ddumba_v1_set_pin_credential/);
  assert.match(routeSource, /admin\.auth\.admin\.createUser/);
  assert.match(routeSource, /cleanupCreatedOffice/);
  assert.match(routeSource, /pinConfigured: true/);
  assert.doesNotMatch(routeSource, /pin_hash.*json/i);
  assert.match(routeSource, /loadServerCounts/);
  assert.match(routeSource, /processMergeJob/);
  assert.match(routeSource, /OFFICE_MERGE_JOB_STARTED/);
  assert.match(routeSource, /OFFICE_MERGE_RUNNING/);
  assert.doesNotMatch(routeSource, /redirect\(/);
});

test("office merge API uses durable chunked jobs instead of one long browser request", () => {
  assert.match(routeSource, /MERGE_ROW_BATCH_SIZE/);
  assert.match(routeSource, /office_merge_batches/);
  assert.match(routeSource, /createMergeJob/);
  assert.match(routeSource, /updateRowsForTable/);
  assert.match(routeSource, /currentSourceIndex/);
  assert.match(routeSource, /currentTableIndex/);
  assert.match(routeSource, /OFFICE_MERGE_JOB_RESUMED/);
  assert.match(routeSource, /affected_counts: \{ job: state/);
  assert.doesNotMatch(routeSource, /p_confirmation: "MERGE"/);
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
