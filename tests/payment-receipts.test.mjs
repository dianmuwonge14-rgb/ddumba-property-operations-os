import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(new URL("../supabase/upgrade_migrations/0204_payment_receipts.sql", import.meta.url), "utf8");
const receiptService = readFileSync(new URL("../lib/receipts/payment-receipts.ts", import.meta.url), "utf8");
const collectionsAction = readFileSync(new URL("../app/actions/collections.ts", import.meta.url), "utf8");
const paymentEntry = readFileSync(new URL("../components/office/payments/FastPaymentsEntry.tsx", import.meta.url), "utf8");

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

test("payment entry shows receipt confirmation actions after successful payment", () => {
  assert.match(paymentEntry, /ReceiptConfirmationModal/);
  assert.match(paymentEntry, /Print Receipt/);
  assert.match(paymentEntry, /Download PDF Receipt/);
  assert.match(paymentEntry, /Send by Email/);
  assert.match(paymentEntry, /Send by WhatsApp\/SMS/);
});
