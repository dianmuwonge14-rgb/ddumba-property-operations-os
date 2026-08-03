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
  assert.match(service, /amendmentHistory: \[\.\.\.previousHistory, amendment\]/);
  assert.match(service, /status: receiptStatus/);
  assert.match(collections, /syncTenantPaymentReceiptForCorrection/);
  assert.match(collections, /markTenantPaymentReceiptPendingCorrection/);
  assert.match(collections, /decision: input\.decision/);
  assert.match(collections, /decision: "approved"/);
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
});

test("printed and downloaded receipts display status and amendment history", () => {
  assert.match(thermalReceipt, /Amendment History/);
  assert.match(thermalReceipt, /Cancelled Receipt/);
  assert.match(thermalReceipt, /Prepared by/);
  assert.match(a4Receipt, /AMENDED RECEIPT/);
  assert.match(a4Receipt, /CANCELLED RECEIPT/);
  assert.match(a4Receipt, /Prepared By/);
  assert.match(pdfRoute, /AMENDMENT HISTORY/);
  assert.match(pdfRoute, /CANCELLED RECEIPT/);
  assert.match(pdfRoute, /Prepared by/);
});
