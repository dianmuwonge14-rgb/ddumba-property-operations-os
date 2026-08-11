import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const service = readFileSync(new URL("../lib/receipts/payment-receipts.ts", import.meta.url), "utf8");
const collections = readFileSync(new URL("../app/actions/collections.ts", import.meta.url), "utf8");
const historyData = readFileSync(new URL("../lib/receipts/data.ts", import.meta.url), "utf8");
const historyConsole = readFileSync(new URL("../components/office/receipts/ReceiptHistoryConsole.tsx", import.meta.url), "utf8");
const thermalReceipt = readFileSync(new URL("../components/office/receipts/TenantPaymentReceipt.tsx", import.meta.url), "utf8");
const a4Receipt = readFileSync(new URL("../components/office/receipts/ReceiptA4.tsx", import.meta.url), "utf8");
const pdfRoute = readFileSync(new URL("../app/receipt-print/[receiptId]/pdf/route.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/upgrade_migrations/0243_receipt_amendment_history.sql", import.meta.url), "utf8");

test("receipt amendment ledger migration preserves before and after snapshots", () => {
  assert.match(migration, /create table if not exists public\.payment_receipt_amendments/);
  assert.match(migration, /previous_snapshot jsonb not null/);
  assert.match(migration, /new_snapshot jsonb not null/);
  assert.match(migration, /audit_reference text/);
  assert.match(migration, /idx_payment_receipt_amendments_audit_reference/);
});

test("payment correction approval syncs receipt status and amendment history", () => {
  assert.match(service, /export async function syncTenantPaymentReceiptForCorrection/);
  assert.match(service, /export async function markTenantPaymentReceiptPendingCorrection/);
  assert.match(service, /correctionReceiptStatus/);
  assert.match(service, /receiptAmendmentHistory/);
  assert.match(service, /getOne\(db, "rooms", row\.room_id/);
  assert.match(service, /status: receiptStatus/);
  assert.match(service, /office_id: updatedSnapshot\.officeId \?\? payment\.office_id \?\? request\.office_id \?\? existing\.office_id/);
  assert.match(collections, /syncTenantPaymentReceiptForCorrection/);
  assert.match(collections, /markTenantPaymentReceiptPendingCorrection/);
  assert.match(collections, /decision: input\.decision/);
  assert.match(collections, /decision: "approved"/);
});

test("receipt amendment history labels payment method changes explicitly", () => {
  assert.match(service, /payment_method_change/);
  assert.match(service, /return "Payment method"/);
  assert.match(service, /payment_method_label/);
  assert.match(collections, /Payment method changed from/);
});

test("receipt history loads amendments and exposes premium status filters", () => {
  assert.match(historyData, /payment_receipt_amendments/);
  assert.match(historyData, /amendmentSummary/);
  assert.match(historyData, /preparedByName/);
  assert.match(historyConsole, /STATUS_FILTERS/);
  assert.match(historyConsole, /Pending Change/);
  assert.match(historyConsole, /Corrected/);
  assert.match(historyConsole, /Cancelled/);
  assert.match(historyConsole, /receiptStatusConfig/);
  assert.match(historyConsole, /View Corrections/);
  assert.match(historyConsole, /border-orange-300 bg-orange-50/);
});

test("printed and downloaded receipts display status and amendment history", () => {
  assert.match(thermalReceipt, /Amendment History/);
  assert.match(thermalReceipt, /Cancelled Receipt/);
  assert.match(thermalReceipt, /Prepared By/);
  assert.match(thermalReceipt, /snapshot\.preparedByRole/);
  assert.match(a4Receipt, /AMENDED RECEIPT/);
  assert.match(a4Receipt, /CANCELLED RECEIPT/);
  assert.match(a4Receipt, /Prepared By/);
  assert.match(pdfRoute, /AMENDMENT HISTORY/);
  assert.match(pdfRoute, /CANCELLED RECEIPT/);
  assert.match(pdfRoute, /Prepared By/);
});
