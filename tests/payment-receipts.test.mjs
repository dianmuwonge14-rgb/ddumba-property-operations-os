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
const sharedReceipt = readFileSync(new URL("../components/office/receipts/TenantPaymentReceipt.tsx", import.meta.url), "utf8");
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
  assert.match(paymentEntry, /TenantPaymentReceiptModal/);
  assert.match(sharedReceipt, /PAYMENT RECORDED SUCCESSFULLY/);
  assert.match(sharedReceipt, /tenant-receipt-print-root/);
  assert.match(sharedReceipt, /tenant-payment-receipt/);
  assert.match(sharedReceipt, /tenant-receipt-slip/);
  assert.match(sharedReceipt, /Print with Browser/);
  assert.match(sharedReceipt, /Print Directly/);
  assert.match(sharedReceipt, /Download PDF/);
  assert.match(sharedReceipt, /Send E-Receipt/);
  assert.match(paymentEntry, /Send by WhatsApp\/SMS/);
});

test("tenant receipts include supermarket-style coverage and print scope", () => {
  assert.match(receiptService, /coverage_start/);
  assert.match(receiptService, /coveragePeriods/);
  assert.match(receiptService, /amountAppliedToOutstanding/);
  assert.match(receiptService, /amountAppliedToCurrentRent/);
  assert.match(receiptService, /advanceAmount/);
  assert.match(receiptStyles, /print-tenant-payment-receipt/);
  assert.match(receiptStyles, /#tenant-receipt-print-root/);
  assert.match(receiptStyles, /size: 80mm auto/);
  assert.match(receiptStyles, /width: 72mm !important/);
  assert.match(receiptStyles, /receipt-paper-58mm/);
  assert.doesNotMatch(sharedReceipt, /Company contact not set/);
});

test("receipt history can preview and reprint only the saved receipt slip", () => {
  assert.match(receiptHistory, /TenantPaymentReceiptModal/);
  assert.match(receiptHistory, /downloadTenantPaymentReceiptPdf/);
  assert.match(receiptHistory, /receipt=\$\{receipt\.id\}&payment=\$\{receipt\.paymentId\}/);
  assert.match(receiptHistory, /Corrections/);
  assert.match(receiptHistory, /snapshot\.landlordName/);
});

test("receipt modal supports safe close interactions and focus restoration", () => {
  assert.match(sharedReceipt, /aria-modal="true"/);
  assert.match(sharedReceipt, /event\.target === event\.currentTarget/);
  assert.match(sharedReceipt, /event\.key === "Escape"/);
  assert.match(sharedReceipt, /previousFocusRef\.current\?\.focus/);
  assert.match(sharedReceipt, /Close Receipt/);
  assert.match(sharedReceipt, /document\.body\.style\.overflow = "hidden"/);
});

test("receipt layout protects long values, coverage rows, and print scope", () => {
  assert.match(sharedReceipt, /receipt-row-stacked/);
  assert.match(sharedReceipt, /receipt-coverage-card/);
  assert.match(sharedReceipt, /ReceiptMoneyRow/);
  assert.match(sharedReceipt, /api\.qrserver\.com\/v1\/create-qr-code/);
  assert.match(receiptStyles, /grid-template-columns: minmax\(0, 42%\) minmax\(0, 58%\)/);
  assert.match(receiptStyles, /overflow-wrap: anywhere/);
  assert.match(receiptStyles, /visibility: hidden !important/);
  assert.match(receiptStyles, /#tenant-receipt-print-root/);
  assert.match(receiptStyles, /receipt-preview-controls/);
  assert.match(receiptStyles, /receipt-action-bar/);
});

test("receipt PDF export targets only the dedicated receipt root", () => {
  assert.match(sharedReceipt, /downloadTenantPaymentReceiptPdf/);
  assert.match(sharedReceipt, /document\.getElementById\(RECEIPT_EXPORT_ROOT_ID\)/);
  assert.match(sharedReceipt, /RECEIPT_PDF_EXPORT_CLASS/);
  assert.match(sharedReceipt, /receipt-pdf-export-sandbox/);
  assert.match(sharedReceipt, /createSingleImagePdf/);
  assert.match(sharedReceipt, /pageWidthPt: paperWidthMm \* MM_TO_PT/);
  assert.match(sharedReceipt, /receiptHeightMm \* MM_TO_PT/);
  assert.doesNotMatch(sharedReceipt, /document\.body\.cloneNode/);
  assert.doesNotMatch(sharedReceipt, /html2canvas\(document\.body/);
});

test("receipt print renders a clean receipt-only thermal iframe", () => {
  assert.match(sharedReceipt, /document\.createElement\("iframe"\)/);
  assert.match(sharedReceipt, /Tenant receipt print frame/);
  assert.match(sharedReceipt, /printFrame\.contentWindow/);
  assert.match(sharedReceipt, /printWindow\.document\.write/);
  assert.match(sharedReceipt, /receiptPrintWindowStyle\(paperWidthMm, undefined, printableWidthMm\)/);
  assert.match(sharedReceipt, /waitForPrintWindowAssets\(printWindow\)/);
  assert.match(sharedReceipt, /waitForPrintWindowLayout\(printWindow\)/);
  assert.match(sharedReceipt, /measuredReceiptPageHeightMm\(receiptRoot, paperWidthMm\)/);
  assert.match(sharedReceipt, /styleElement\.textContent = receiptPrintWindowStyle\(paperWidthMm, pageHeightMm, printableWidthMm\)/);
  assert.match(sharedReceipt, /printReceiptMarkup/);
  assert.match(sharedReceipt, /printTenantReceiptTest/);
  assert.match(sharedReceipt, /printWindow\.print\(\)/);
  assert.match(sharedReceipt, /printWindow\.onafterprint = cleanup/);
  assert.match(sharedReceipt, /printFrame\.remove\(\)/);
  assert.doesNotMatch(sharedReceipt, /window\.open\(/);
  assert.doesNotMatch(sharedReceipt, /window\.print\(\)/);
});

test("receipt print and PDF exports omit page chrome and modal controls", () => {
  assert.match(receiptStyles, /body\.print-tenant-payment-receipt \*/);
  assert.match(receiptStyles, /#tenant-receipt-print-root,\s*\n\s*body\.print-tenant-payment-receipt #tenant-receipt-print-root \*/);
  assert.match(receiptStyles, /\.receipt-pdf-export-sandbox/);
  assert.match(sharedReceipt, /\.receipt-preview-controls/);
  assert.match(sharedReceipt, /\.receipt-close-button/);
  assert.match(sharedReceipt, /\.receipt-action-bar/);
  assert.match(sharedReceipt, /const pageSize = pageHeightMm \? `\$\{paperWidthMm\}mm \$\{pageHeightMm\}mm` : `\$\{paperWidthMm\}mm auto`/);
  assert.match(sharedReceipt, /width: \$\{printableWidthMm\}mm/);
  assert.match(sharedReceipt, /localStorage\.getItem\("ddumba\.receiptPaperWidthMm"\)/);
});

test("receipt modal explains browser Save as PDF behavior and saves printer settings per office", () => {
  assert.match(sharedReceipt, /Select <strong>POS-80<\/strong> under Destination/);
  assert.match(sharedReceipt, /Do <strong>not<\/strong> select <strong>RONGTA S58mm<\/strong>/);
  assert.match(sharedReceipt, /Print request opened\. Select POS-80 under Destination/);
  assert.match(sharedReceipt, /Did POS-80 print the receipt\?/);
  assert.match(sharedReceipt, /ddumba\.receiptPrinterSettings/);
  assert.match(sharedReceipt, /Printer Settings/);
  assert.match(sharedReceipt, /Save Printer Settings/);
  assert.match(sharedReceipt, /Preferred printer label/);
  assert.match(sharedReceipt, /printableWidthMm/);
  assert.match(sharedReceipt, /72mm for POS 80/);
  assert.match(sharedReceipt, /Receipt width/);
  assert.match(sharedReceipt, /Test Receipt Preview/);
  assert.match(sharedReceipt, /Open Browser Print Test/);
  assert.match(sharedReceipt, /Printing Help/);
  assert.match(sharedReceipt, /Printer Diagnostics/);
  assert.match(sharedReceipt, /Xprinter XP-N260H/);
  assert.match(sharedReceipt, /Clear Application Print State/);
  assert.match(sharedReceipt, /Switch to Direct Printing/);
  assert.match(sharedReceipt, /Print Again/);
  assert.match(sharedReceipt, /Use Direct Print/);
  assert.match(sharedReceipt, /Auto-open print after payment/);
  assert.match(sharedReceipt, /Auto-print after payment/);
  assert.doesNotMatch(sharedReceipt, /Receipt printed successfully/);
});

test("receipt direct thermal print uses QZ Tray when available and falls back clearly", () => {
  assert.match(sharedReceipt, /QZ_TRAY_SCRIPT_URLS/);
  assert.match(sharedReceipt, /cdn\.jsdelivr\.net\/npm\/qz-tray/);
  assert.match(sharedReceipt, /unpkg\.com\/qz-tray/);
  assert.match(sharedReceipt, /loadQzTrayBridge/);
  assert.match(sharedReceipt, /ensureQzConnected/);
  assert.match(sharedReceipt, /qzTrayPrinters/);
  assert.match(sharedReceipt, /printDirectlyWithQz/);
  assert.match(sharedReceipt, /buildEscPosReceipt/);
  assert.match(sharedReceipt, /buildEscPosTestReceipt/);
  assert.match(sharedReceipt, /Direct ESC\/POS Test/);
  assert.match(sharedReceipt, /DDUMBA OS/);
  assert.match(sharedReceipt, /XPRINTER XP-N260H/);
  assert.match(sharedReceipt, /POS-80 TEST/);
  assert.match(sharedReceipt, /PRINT TEST SUCCESSFUL/);
  assert.match(sharedReceipt, /format: "command"/);
  assert.match(sharedReceipt, /type: "raw"/);
  assert.match(sharedReceipt, /Direct thermal printing is not connected/);
  assert.match(sharedReceipt, /Detect Printers/);
  assert.match(sharedReceipt, /Open Browser Print Test/);
  assert.match(sharedReceipt, /Reset Settings/);
  assert.match(sharedReceipt, /host: \["localhost", "127\.0\.0\.1"\]/);
  assert.match(sharedReceipt, /qz\.websocket\.connect/);
});
