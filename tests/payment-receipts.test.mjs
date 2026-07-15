import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(new URL("../supabase/upgrade_migrations/0204_payment_receipts.sql", import.meta.url), "utf8");
const receiptService = readFileSync(new URL("../lib/receipts/payment-receipts.ts", import.meta.url), "utf8");
const collectionsAction = readFileSync(new URL("../app/actions/collections.ts", import.meta.url), "utf8");
const expensesAction = readFileSync(new URL("../app/actions/expenses.ts", import.meta.url), "utf8");
const landlordsAction = readFileSync(new URL("../app/actions/landlords.ts", import.meta.url), "utf8");
const paymentEntry = readFileSync(new URL("../components/office/payments/FastPaymentsEntry.tsx", import.meta.url), "utf8");
const receiptHistory = readFileSync(new URL("../components/office/receipts/ReceiptHistoryConsole.tsx", import.meta.url), "utf8");
const receiptStyles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("payment receipt schema prevents duplicate receipts per transaction", () => {
  assert.match(migration, /create table if not exists public\.payment_receipts/);
  assert.match(migration, /unique\(company_id, payment_type, payment_id\)/);
  assert.match(migration, /payment_receipt_delivery_logs/);
  assert.match(migration, /channel text not null check \(channel in \('email','whatsapp','sms','print','download_pdf'\)\)/);
});

test("receipt service only generates receipts from active saved payments", () => {
  assert.match(receiptService, /activePaymentStatus/);
  assert.match(receiptService, /Receipts are only generated for successful active payments/);
  assert.match(receiptService, /from\("collections"\)\.select\("\*"\)\.eq\("id", paymentId\)/);
  assert.match(receiptService, /upsert/);
});

test("tenant payment save returns receipt metadata without blocking successful payment", () => {
  assert.match(collectionsAction, /createTenantPaymentReceipt\(data\.id/);
  assert.match(collectionsAction, /receiptError/);
  assert.match(collectionsAction, /Payment receipt generation failed/);
});

test("landlord payment save creates receipt metadata where applicable", () => {
  assert.match(receiptService, /createLandlordPaymentReceipt/);
  assert.match(landlordsAction, /createLandlordPaymentReceipt\(payment\.id/);
  assert.match(landlordsAction, /Landlord payment receipt generation failed/);
  assert.match(expensesAction, /createLandlordPaymentReceipt\(String\(paymentInsert\.data\.id\)/);
  assert.match(expensesAction, /Landlord payment saved but receipt generation failed/);
});

test("payment entry shows receipt confirmation actions after successful payment", () => {
  assert.match(paymentEntry, /ReceiptConfirmationModal/);
  assert.match(paymentEntry, /PAYMENT RECORDED SUCCESSFULLY/);
  assert.match(paymentEntry, /tenant-payment-receipt/);
  assert.match(paymentEntry, /tenant-receipt-slip/);
  assert.match(paymentEntry, /Print Receipt/);
  assert.match(paymentEntry, /Download PDF/);
  assert.match(paymentEntry, /Send by Email/);
  assert.match(paymentEntry, /Send by WhatsApp\/SMS/);
});

test("tenant receipts include supermarket-style coverage and print scope", () => {
  assert.match(receiptService, /coverage_start/);
  assert.match(receiptService, /coveragePeriods/);
  assert.match(receiptService, /amountAppliedToOutstanding/);
  assert.match(receiptService, /amountAppliedToCurrentRent/);
  assert.match(receiptService, /advanceAmount/);
  assert.match(receiptStyles, /print-tenant-payment-receipt/);
  assert.match(receiptStyles, /size: 80mm auto/);
});

test("receipt history can preview and reprint only the saved receipt slip", () => {
  assert.match(receiptHistory, /ReceiptPreview/);
  assert.match(receiptHistory, /tenant-payment-receipt/);
  assert.match(receiptHistory, /receipt=\$\{receipt\.id\}&payment=\$\{receipt\.paymentId\}/);
  assert.match(receiptHistory, /Corrections/);
  assert.match(receiptHistory, /snapshot\.landlordName/);
});
