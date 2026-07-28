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
const receiptA4 = readFileSync(new URL("../components/office/receipts/ReceiptA4.tsx", import.meta.url), "utf8");
const receiptThermal58 = readFileSync(new URL("../components/office/receipts/ReceiptThermal58.tsx", import.meta.url), "utf8");
const desktopPrint = readFileSync(new URL("../components/office/receipts/DesktopPrint.ts", import.meta.url), "utf8");
const tabletPrint = readFileSync(new URL("../components/office/receipts/TabletPrint.ts", import.meta.url), "utf8");
const receiptPrintPage = readFileSync(new URL("../app/receipt-print/page.tsx", import.meta.url), "utf8");
const receiptPrintByIdPage = readFileSync(new URL("../app/receipt-print/[receiptId]/page.tsx", import.meta.url), "utf8");
const receiptPrintPdfRoute = readFileSync(new URL("../app/receipt-print/[receiptId]/pdf/route.ts", import.meta.url), "utf8");
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
  assert.match(sharedReceipt, /Print with Saved Printer/);
  assert.match(sharedReceipt, /Choose Printer/);
  assert.match(sharedReceipt, /directPrintLabel/);
  assert.match(sharedReceipt, /Download PDF/);
  assert.match(sharedReceipt, /Send E-Receipt/);
  assert.match(sharedReceipt, /Share via WhatsApp/);
  assert.match(paymentEntry, /prepareReceiptPdfForSharing/);
  assert.match(paymentEntry, /tenantReceiptWhatsappHref/);
  assert.match(paymentEntry, /Send SMS link/);
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
  assert.match(receiptHistory, /prepareReceiptPdfForSharing/);
  assert.match(receiptHistory, /tenantReceiptWhatsappHref/);
  assert.match(receiptHistory, /DeliveryBadge/);
  assert.match(receiptHistory, /pendingReceiptAction/);
  assert.match(receiptHistory, /queueReceiptAction/);
  assert.match(receiptHistory, /waitForReceiptPreviewMount/);
  assert.match(receiptHistory, /receipt=\$\{receipt\.id\}&payment=\$\{receipt\.paymentId\}/);
  assert.match(receiptHistory, /Corrections/);
  assert.match(receiptHistory, /snapshot\.landlordName/);
  assert.doesNotMatch(receiptHistory, /window\.print\(\)/);
  assert.doesNotMatch(receiptHistory, /setTimeout\(\(\) =>/);
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
  assert.match(sharedReceipt, /clone\.style\.width = `\$\{printableWidthMm\}mm`/);
  assert.match(sharedReceipt, /receiptHeightMm \* MM_TO_PT/);
  assert.doesNotMatch(sharedReceipt, /document\.body\.cloneNode/);
  assert.doesNotMatch(sharedReceipt, /html2canvas\(document\.body/);
});

test("receipt print opens desktop A4 separately from tablet thermal documents", () => {
  assert.match(sharedReceipt, /printSavedReceiptDocument/);
  assert.match(sharedReceipt, /desktopReceiptPrintUrl\(receipt\)/);
  assert.match(sharedReceipt, /tabletReceiptPrintUrl\(receipt/);
  assert.match(sharedReceipt, /useDesktopA4/);
  assert.match(desktopPrint, /isDesktopOperatingSystem/);
  assert.match(desktopPrint, /Windows NT\|Macintosh\|Linux/);
  assert.match(desktopPrint, /layout=a4&autoprint=1/);
  assert.match(tabletPrint, /isAndroidTabletOrMobile/);
  assert.match(tabletPrint, /layout=thermal&width=\$\{widthMm\}/);
  assert.match(receiptA4, /tenant-receipt-a4-print-root/);
  assert.doesNotMatch(receiptA4, /TenantPaymentReceiptSlip/);
  assert.match(receiptThermal58, /TenantPaymentReceiptSlip/);
  assert.match(receiptHistory, /printTenantPaymentReceipt\(closeAfterPrint \? \(\) => setSelected\(null\) : undefined, receipt\)/);
  assert.match(paymentEntry, /printTenantPaymentReceipt\(onClose, receipt\)/);
  assert.match(receiptPrintPage, /export const dynamic = "force-dynamic"/);
  assert.match(receiptPrintPage, /receiptPrintLayout/);
  assert.match(receiptPrintPage, /receiptA4PrintCss/);
  assert.match(receiptPrintPage, /ReceiptA4 receipt=\{receipt\}/);
  assert.match(receiptPrintPage, /ReceiptThermal58 receipt=\{receipt\}/);
  assert.match(receiptPrintByIdPage, /loadPrintableReceipt\(receiptId\)/);
  assert.match(receiptPrintByIdPage, /ReceiptA4 receipt=\{receipt\}/);
  assert.match(receiptPrintByIdPage, /ReceiptThermal58 receipt=\{receipt\}/);
  assert.match(receiptPrintByIdPage, /ReceiptPrintActions layout=\{layout\} receiptId=\{receipt\.id\} widthMm=\{widthMm\}/);
  assert.match(receiptPrintByIdPage, /receiptPageControlsScript\(widthMm, receipt\.id, layout\)/);
  assert.match(receiptPrintPage, /Print Receipt/);
  assert.match(receiptPrintPage, /Choose Printer/);
  assert.match(receiptPrintPage, /Download PDF/);
  assert.match(receiptPrintPage, /Share via WhatsApp/);
  assert.match(receiptPrintPage, /receiptWhatsappHref/);
  assert.match(receiptPrintPage, /Close/);
  assert.match(receiptPrintPage, /printCurrentReceipt/);
  assert.match(receiptPrintPage, /Receipt is not ready yet/);
  assert.match(receiptPrintPage, /#tenant-receipt-print-root,\s*\n\s*#tenant-receipt-print-root \*/);
  assert.match(receiptPrintPage, /visibility: hidden !important/);
  assert.match(receiptPrintPage, /receipt-actions/);
  assert.match(receiptPrintPage, /Select the connected Bluetooth printer/);
  assert.match(receiptPrintPage, /Select your installed Windows\/macOS printer/);
  assert.match(receiptPrintPdfRoute, /Content-Type": "application\/pdf"/);
  assert.match(receiptPrintPdfRoute, /MediaBox \[0 0 \$\{widthPt\.toFixed\(2\)\} \$\{heightPt\.toFixed\(2\)\}\]/);
  assert.match(receiptPrintPdfRoute, /loadPrintableReceipt\(receiptId\)/);
  assert.match(receiptPrintPage, /from\("payment_receipts"\)/);
  assert.match(receiptPrintPage, /receiptOnlyPrintCss\(widthMm\)/);
  assert.match(receiptPrintPage, /layout === "a4" \? receiptA4PrintCss\(\) : receiptOnlyPrintCss\(widthMm\)/);
  assert.match(receiptPrintPage, /@page \{\s*\n\s*size: \$\{widthMm\}mm auto;/);
  assert.match(receiptPrintPage, /@page \{\s*\n\s*size: A4;/);
  assert.match(receiptPrintPage, /body \* \{\s*\n\s*visibility: hidden !important;/);
  assert.match(receiptPrintPage, /font-weight: 700/);
  assert.match(receiptPrintPage, /color: #000 !important/);
  assert.match(receiptPrintPage, /widthMm === 58 \? 50 : 72/);
  assert.match(receiptPrintPage, /widthMm === 58 \? 26 : 28/);
  assert.match(receiptPrintPage, /document\.fonts\.ready/);
  assert.match(receiptPrintPage, /requestAnimationFrame/);
  assert.doesNotMatch(receiptPrintPage, /OfficeLayout/);
});

test("receipt print typography is bold and high contrast on A4 and thermal receipts", () => {
  assert.match(receiptStyles, /#tenant-receipt-print-root,\s*\n\s*body\.print-tenant-payment-receipt #tenant-receipt-print-root \*/);
  assert.match(receiptStyles, /font-weight: 700 !important/);
  assert.match(receiptStyles, /print-color-adjust: exact !important/);
  assert.match(receiptStyles, /\.receipt-company/);
  assert.match(receiptStyles, /font-size: 20px/);
  assert.match(receiptStyles, /font-size: 17px/);
  assert.match(receiptStyles, /font-size: 11\.8px/);
  assert.match(receiptStyles, /font-size: 10\.5px/);
  assert.match(sharedReceipt, /\.tenant-receipt-slip,\s*\n\.tenant-receipt-slip \*/);
  assert.match(sharedReceipt, /font-weight: 700/);
  assert.match(sharedReceipt, /color: #000000/);
  assert.match(sharedReceipt, /receipt-company/);
  assert.match(sharedReceipt, /receipt-heading/);
  assert.match(sharedReceipt, /receipt-amount/);
  assert.match(sharedReceipt, /coverage-row/);
  assert.match(receiptPrintPage, /#tenant-receipt-print-root,\s*\n#tenant-receipt-print-root \*/);
  assert.match(receiptPrintPage, /font-weight: 700 !important/);
  assert.match(receiptPrintPage, /font-size: \$\{widthMm === 58 \? 16 : 20\}px !important/);
  assert.match(receiptPrintPage, /font-size: \$\{widthMm === 58 \? 14 : 17\}px !important/);
  assert.match(receiptPrintPage, /\.receipt-a4-sheet,\s*\n\.receipt-a4-sheet \*/);
  assert.match(receiptPrintPage, /#tenant-receipt-a4-print-root,\s*\n\s*#tenant-receipt-a4-print-root \*/);
  assert.match(receiptPrintPage, /font-weight: 800 !important/);
  assert.match(receiptPrintPage, /color: #000000 !important/);
});

test("receipt actions log print, PDF, WhatsApp and enforce receipt permissions", () => {
  const receiptActions = readFileSync(new URL("../app/actions/receipts.ts", import.meta.url), "utf8");
  assert.match(receiptActions, /assertReceiptPermission/);
  assert.match(receiptActions, /You do not have permission to use this receipt/);
  assert.match(receiptActions, /logReceiptPrintOrDownload/);
  assert.match(receiptActions, /logReceiptShareLink/);
  assert.match(receiptActions, /channel: input\.channel/);
  assert.match(receiptHistory, /deliveryStatus\.print/);
  assert.match(receiptHistory, /deliveryStatus\.whatsapp/);
  assert.match(receiptHistory, /deliveryStatus\.email/);
});

test("tenant receipts include property and security deposit allocation when saved", () => {
  assert.match(receiptService, /propertyName/);
  assert.match(sharedReceipt, /Security deposit/);
  assert.match(sharedReceipt, /Security receipt/);
  assert.match(receiptPrintPdfRoute, /Security dep/);
  assert.match(receiptPrintPdfRoute, /Security receipt/);
  assert.match(receiptPrintPdfRoute, /Property/);
});

test("tenant receipts present room monthly rent instead of a misleading rent allocation total", () => {
  assert.match(sharedReceipt, /ReceiptMoneyRow label="Monthly rent" value=\{snapshot\.monthlyRent\}/);
  assert.match(receiptA4, /<Money label="Monthly Rent" value=\{snapshot\.monthlyRent\} \/>/);
  assert.match(receiptPrintPdfRoute, /pairLines\("Monthly rent", money\(snapshot\.monthlyRent\)\)/);
  assert.doesNotMatch(receiptA4, /Rent Allocation/);
  assert.doesNotMatch(receiptA4, /amountAppliedToOutstanding \+ snapshot\.amountAppliedToCurrentRent/);
});

test("tenant receipt branding is resolved from the room office and stored in the snapshot", () => {
  assert.match(receiptService, /receiptBrandForOffice/);
  assert.match(receiptService, /const KAPEEKA_OFFICE_ID = "2987830f-906b-4f31-921f-734e6171dd10"/);
  assert.match(receiptService, /const ENTEBBE_OPERATIONS_OFFICE_ID = "365ca586-4501-45b3-8d21-f7244ef36603"/);
  assert.match(receiptService, /officeId === KAPEEKA_OFFICE_ID \|\| officeName === "kapeeka office"/);
  assert.match(receiptService, /officeId === ENTEBBE_OPERATIONS_OFFICE_ID \|\| officeName === "entebbe operations office"/);
  assert.match(receiptService, /return KAPEEKA_RECEIPT_BRAND/);
  assert.match(receiptService, /return ENTEBBE_RECEIPT_BRAND/);
  assert.match(receiptService, /const receiptOfficeId = room\?\.office_id \?\? tenant\?\.office_id \?\? payment\.office_id/);
  assert.match(receiptService, /companyName: receiptBrandForOffice\(office, text\(company\?\.name\)\)/);
  assert.match(sharedReceipt, /Thank you for choosing \$\{safeText\(snapshot\.companyName\) \?\? "Ddumba Property Management"\}/);
});

test("receipt print retains a fallback clean receipt-only popup for mounted receipts", () => {
  assert.match(sharedReceipt, /window\.open\("", printWindowName/);
  assert.match(sharedReceipt, /extractReceiptRootHtml/);
  assert.match(sharedReceipt, /Receipt print container not found/);
  assert.match(sharedReceipt, /printWindow\.document\.write/);
  assert.match(sharedReceipt, /<body>\s*\$\{receiptDocumentHtml\}\s*<\/body>/);
  assert.match(sharedReceipt, /receiptPrintWindowStyle\(paperWidthMm, undefined, printableWidthMm\)/);
  assert.match(sharedReceipt, /waitForPrintWindowAssets\(printWindow\)/);
  assert.match(sharedReceipt, /waitForPrintWindowLayout\(printWindow\)/);
  assert.match(sharedReceipt, /measuredReceiptPageHeightMm\(receiptRoot, paperWidthMm\)/);
  assert.match(sharedReceipt, /styleElement\.textContent = receiptPrintWindowStyle\(paperWidthMm, pageHeightMm, printableWidthMm\)/);
  assert.match(sharedReceipt, /printReceiptMarkup/);
  assert.match(sharedReceipt, /printTenantReceiptTest/);
  assert.match(sharedReceipt, /printWindow\.print\(\)/);
  assert.match(sharedReceipt, /printWindow\.onafterprint = cleanup/);
  assert.match(sharedReceipt, /printWindow\.close\(\)/);
  assert.doesNotMatch(sharedReceipt, /document\.createElement\("iframe"\)/);
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
  assert.match(sharedReceipt, /ddumba\.receiptPrinterActiveSettings/);
  assert.doesNotMatch(sharedReceipt, /localStorage\.getItem\("ddumba\.receiptPaperWidthMm"\)/);
});

test("receipt modal explains browser Save as PDF behavior and saves printer settings per office", () => {
  assert.match(sharedReceipt, /printerDestinationInstruction/);
  assert.match(sharedReceipt, /Select POS-80 under Destination/);
  assert.match(sharedReceipt, /Select RONGTA 58mm Series Printer under Destination/);
  assert.match(sharedReceipt, /Print request opened with receipt HTML/);
  assert.match(sharedReceipt, /Did POS-80 print the receipt\?/);
  assert.match(sharedReceipt, /Did RONGTA 58mm Series Printer print the receipt\?/);
  assert.match(sharedReceipt, /ddumba\.receiptPrinterSettings/);
  assert.match(sharedReceipt, /ddumba\.receiptPrinterDeviceId/);
  assert.match(sharedReceipt, /profileMode/);
  assert.match(sharedReceipt, /Auto detect/);
  assert.match(sharedReceipt, /80mm POS printer/);
  assert.match(sharedReceipt, /58mm mobile printer/);
  assert.match(sharedReceipt, /Printing profile: \{printerSettings\.widthMm === 58 \? "58mm Mobile" : "80mm POS"\}/);
  assert.match(sharedReceipt, /Printer Settings/);
  assert.match(sharedReceipt, /Printer profile/);
  assert.match(sharedReceipt, /POS-80 \/ Xprinter 80mm/);
  assert.match(sharedReceipt, /RONGTA 58mm \/ MP-58N/);
  assert.match(sharedReceipt, /Custom printer/);
  assert.match(sharedReceipt, /Save Printer Settings/);
  assert.match(sharedReceipt, /Preferred printer label/);
  assert.match(sharedReceipt, /RONGTA 58mm Series Printer/);
  assert.match(sharedReceipt, /printableWidthMm/);
  assert.match(sharedReceipt, /72mm for POS 80/);
  assert.match(sharedReceipt, /48mm for RONGTA 58mm/);
  assert.match(sharedReceipt, /Receipt width/);
  assert.match(sharedReceipt, /Print Test Preview/);
  assert.match(sharedReceipt, /Test POS-80 Receipt/);
  assert.match(sharedReceipt, /Test 58mm Mobile Receipt/);
  assert.match(sharedReceipt, /Feed after printing/);
  assert.match(sharedReceipt, /Print density/);
  assert.match(sharedReceipt, /Font size/);
  assert.match(sharedReceipt, /Printing Help/);
  assert.match(sharedReceipt, /Printer Diagnostics/);
  assert.match(sharedReceipt, /Xprinter XP-N260H/);
  assert.match(sharedReceipt, /MP-58N mobile thermal printer/);
  assert.match(sharedReceipt, /Clear Application Print State/);
  assert.match(sharedReceipt, /Switch to QZ Direct Printing/);
  assert.match(sharedReceipt, /Print Again/);
  assert.match(sharedReceipt, /Direct Bluetooth Print/);
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
  assert.match(sharedReceipt, /Xprinter XP-N260H/);
  assert.match(sharedReceipt, /MP-58N/);
  assert.match(sharedReceipt, /58MM PRINTER TEST/);
  assert.match(sharedReceipt, /POS-80 TEST/);
  assert.match(sharedReceipt, /PRINT TEST SUCCESSFUL/);
  assert.match(sharedReceipt, /escPosLineWidth/);
  assert.match(sharedReceipt, /settings\.widthMm === 58 \? 24 : 32/);
  assert.match(sharedReceipt, /settings\.cutPaper \? escPosCut\(\) : ""/);
  assert.match(sharedReceipt, /format: "command"/);
  assert.match(sharedReceipt, /type: "raw"/);
  assert.match(sharedReceipt, /Direct thermal printing is not connected/);
  assert.match(sharedReceipt, /Detect Printers/);
  assert.match(sharedReceipt, /RONGTA 58mm\/MP-58N-compatible queue detected/);
  assert.match(sharedReceipt, /Reset Settings/);
  assert.match(sharedReceipt, /host: \["localhost", "127\.0\.0\.1"\]/);
  assert.match(sharedReceipt, /qz\.websocket\.connect/);
});

test("receipt printer profiles support POS-80, RONGTA 58mm, and RPP02N without sharing dimensions", () => {
  assert.match(sharedReceipt, /type ReceiptPrinterProfile = "pos80" \| "rongta58" \| "rpp02n58" \| "custom"/);
  assert.match(sharedReceipt, /type ReceiptPrinterProfileMode = "auto" \| "pos80" \| "mobile58" \| "custom"/);
  assert.match(sharedReceipt, /PRINTER_PROFILES/);
  assert.match(sharedReceipt, /preferredPrinterName: "POS-80"/);
  assert.match(sharedReceipt, /preferredPrinterName: "RONGTA 58mm Series Printer"/);
  assert.match(sharedReceipt, /preferredPrinterName: "RPP02N"/);
  assert.match(sharedReceipt, /printableWidthMm: 72/);
  assert.match(sharedReceipt, /printableWidthMm: 48/);
  assert.match(sharedReceipt, /widthMm: 80/);
  assert.match(sharedReceipt, /widthMm: 58/);
  assert.match(sharedReceipt, /cutPaper: true/);
  assert.match(sharedReceipt, /cutPaper: false/);
  assert.match(sharedReceipt, /fontSize: "compact"/);
  assert.match(sharedReceipt, /printDensity: "dark"/);
  assert.match(sharedReceipt, /settingsForProfile/);
  assert.match(sharedReceipt, /settingsForProfileMode/);
  assert.match(sharedReceipt, /profile === "rongta58"/);
  assert.match(sharedReceipt, /profile === "rpp02n58"/);
  assert.match(sharedReceipt, /defaultPrinterProfileForDevice\(\) === "pos80" \? 80 : 58/);
  assert.match(sharedReceipt, /printerSettingsKey\(receipt\)/);
  assert.match(receiptStyles, /receipt-paper-58mm/);
  assert.match(receiptStyles, /width: 48mm !important/);
  assert.match(receiptStyles, /\.receipt-pdf-export-sandbox\[style\*="58mm"\]/);
});

test("tablet receipt reprint supports RPP02N without printing receipt history", () => {
  assert.match(sharedReceipt, /defaultPrinterProfileForDevice/);
  assert.match(sharedReceipt, /RPP02N Bluetooth 58mm/);
  assert.match(sharedReceipt, /Select RPP02N under printer selection/);
  assert.match(sharedReceipt, /RPP02N is paired but not available through Android Print Service/);
  assert.match(sharedReceipt, /printDirectlyWithBluetooth/);
  assert.match(sharedReceipt, /Android System Print/);
  assert.match(sharedReceipt, /native Bluetooth ESC\/POS bridge/);
  assert.match(sharedReceipt, /Use RPP02N Direct Bluetooth/);
  assert.match(sharedReceipt, /physicalPrinterShortName/);
  assert.match(sharedReceipt, /printWindowName/);
  assert.match(sharedReceipt, /receiptDocumentHtml/);
  assert.match(receiptHistory, /queueReceiptAction\(receipt, "print"\)/);
  assert.match(receiptHistory, /queueReceiptAction\(receipt, "download_pdf"\)/);
  assert.doesNotMatch(receiptHistory, /document\.body\.outerHTML/);
});

test("receipt direct Bluetooth path sends real bytes or reports the failing diagnostic step", () => {
  assert.match(sharedReceipt, /type ReceiptPrintDiagnosticStep/);
  assert.match(sharedReceipt, /type ReceiptPrintDiagnosticResult/);
  assert.match(sharedReceipt, /assertPrintPayload/);
  assert.match(sharedReceipt, /escPosBytes/);
  assert.match(sharedReceipt, /payloadBytes\.byteLength/);
  assert.match(sharedReceipt, /findWritableBluetoothPrinterCharacteristic/);
  assert.match(sharedReceipt, /writeBluetoothPrinterBytes/);
  assert.match(sharedReceipt, /writeValueWithoutResponse/);
  assert.match(sharedReceipt, /writeValue/);
  assert.match(sharedReceipt, /Bytes sent to printer/);
  assert.match(sharedReceipt, /diagnosticPrintError/);
  assert.match(sharedReceipt, /formatDiagnosticSteps/);
  assert.match(sharedReceipt, /HELLO WORLD Bluetooth Test/);
  assert.match(sharedReceipt, /HELLO WORLD ESC\/POS payload/);
  assert.match(sharedReceipt, /method: profile === "rpp02n58" \? "bluetooth" : "browser"/);
  assert.match(sharedReceipt, /method: profile === "rpp02n58" \? "bluetooth" : current\.method/);
  assert.doesNotMatch(sharedReceipt, /void buildEscPosReceipt\(receipt, settings\);\n\s*throw new Error\("RPP02N Bluetooth connection opened/);
});
