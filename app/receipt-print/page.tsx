import { notFound, redirect } from "next/navigation";
import { TenantPaymentReceiptSlip, type TenantReceiptViewModel } from "@/components/office/receipts/TenantPaymentReceipt";
import { hasPermission, requireAuth } from "@/lib/auth/permissions";
import type { PaymentReceiptSnapshot } from "@/lib/receipts/payment-receipts";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type PageProps = {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type ReceiptRow = {
    company_id: string;
    id: string;
    office_id: string | null;
    receipt_number: string;
    receipt_snapshot: PaymentReceiptSnapshot;
    verification_code: string;
};

export function firstParam(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
}

export function paperWidth(value: string | string[] | undefined): 58 | 80 {
    return firstParam(value) === "80" ? 80 : 58;
}

export async function loadPrintableReceipt(receiptId: string) {
    const context = await requireAuth();
    if (!context.activeCompany?.id) redirect("/office/receipts");

    const canReadReceipts =
        context.isCompanyAdmin ||
        context.authMode === "collector" ||
        hasPermission(context, "collections.read") ||
        hasPermission(context, "collections.view") ||
        hasPermission(context, "landlords.read");
    if (!canReadReceipts) redirect("/office/receipts");

    const db = createSupabaseAdminClient() as unknown as { from: (table: string) => any };
    const { data, error } = await db
        .from("payment_receipts")
        .select("id,company_id,office_id,receipt_number,receipt_snapshot,verification_code")
        .eq("company_id", context.activeCompany.id)
        .eq("id", receiptId)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) notFound();

    const row = data as ReceiptRow;
    if (!context.isCompanyAdmin && context.authMode !== "collector" && context.activeOffice?.id && row.office_id !== context.activeOffice.id) {
        redirect("/office/receipts");
    }

    return {
        id: row.id,
        receiptNumber: row.receipt_number,
        snapshot: row.receipt_snapshot,
        verificationCode: row.verification_code || row.receipt_snapshot?.verificationCode,
    } satisfies TenantReceiptViewModel;
}

export function receiptOnlyPrintCss(widthMm: 58 | 80) {
    const contentWidthMm = widthMm === 58 ? 50 : 72;
    const rootPadding = widthMm === 58 ? 2 : 3;
    const baseFont = widthMm === 58 ? 10 : 10.5;
    const titleFont = widthMm === 58 ? 14 : 15;
    const qrSize = widthMm === 58 ? 26 : 28;
    return `
@page {
  size: ${widthMm}mm auto;
  margin: 0;
}
* {
  box-sizing: border-box !important;
}
html,
body {
  width: 100% !important;
  height: auto !important;
  min-height: 0 !important;
  margin: 0 !important;
  padding: 0 0 26mm !important;
  overflow: visible !important;
  background: #fff !important;
  color: #000 !important;
}
body {
  font-family: Arial, Helvetica, sans-serif !important;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
#tenant-receipt-print-root {
  display: block !important;
  position: static !important;
  width: ${contentWidthMm}mm !important;
  max-width: ${contentWidthMm}mm !important;
  height: auto !important;
  min-height: 0 !important;
  margin: 0 auto !important;
  padding: ${rootPadding}mm !important;
  overflow: visible !important;
  transform: none !important;
  box-shadow: none !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: #fff !important;
  color: #000 !important;
  break-inside: avoid !important;
  page-break-inside: avoid !important;
}
#tenant-receipt-print-root,
#tenant-receipt-print-root * {
  max-width: 100% !important;
  min-width: 0 !important;
  background: transparent !important;
  color: #000 !important;
  box-shadow: none !important;
  text-shadow: none !important;
  border-color: #000 !important;
  opacity: 1 !important;
  filter: none !important;
  overflow-wrap: anywhere !important;
  word-break: break-word !important;
}
#tenant-payment-receipt {
  width: 100% !important;
  max-width: 100% !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  border-radius: 0 !important;
  font-family: Arial, Helvetica, sans-serif !important;
  font-size: ${baseFont}px !important;
  font-weight: 600 !important;
  line-height: 1.35 !important;
  font-variant-numeric: tabular-nums !important;
}
.receipt-section {
  margin-top: 1.6mm !important;
}
.receipt-section:first-child {
  margin-top: 0 !important;
}
.receipt-section-title,
.receipt-label {
  color: #000 !important;
  font-size: ${widthMm === 58 ? 8 : 8.8}px !important;
  font-weight: 800 !important;
  letter-spacing: 0 !important;
  text-transform: uppercase !important;
}
.receipt-row {
  display: grid !important;
  grid-template-columns: minmax(0, 42%) minmax(0, 58%) !important;
  gap: 1mm !important;
  align-items: start !important;
  padding: 0.35mm 0 !important;
  font-size: ${baseFont}px !important;
}
.receipt-row-stacked {
  display: block !important;
  padding: 0.7mm 0 !important;
}
.receipt-value {
  color: #000 !important;
  font-weight: 800 !important;
  line-height: 1.25 !important;
  text-align: right !important;
  white-space: normal !important;
}
.receipt-row-stacked .receipt-value {
  display: block !important;
  margin-top: 0.3mm !important;
  text-align: left !important;
}
.receipt-value-strong,
.receipt-money-row-highlight .receipt-value {
  font-weight: 900 !important;
}
.receipt-money-row-highlight,
.receipt-amount-section {
  border-top: 1px dashed #000 !important;
  border-bottom: 1px dashed #000 !important;
}
.receipt-money-row-highlight {
  margin: 0.8mm 0 !important;
  padding-block: 0.8mm !important;
}
.receipt-amount-section {
  padding-block: 1.2mm !important;
}
.receipt-coverage-card {
  border: 1px solid #000 !important;
  border-radius: 0 !important;
  padding: 1mm !important;
  margin-top: 1mm !important;
  background: #fff !important;
  break-inside: avoid !important;
  page-break-inside: avoid !important;
}
.receipt-title,
h3 {
  font-size: ${titleFont}px !important;
  font-weight: 900 !important;
  line-height: 1.1 !important;
}
.receipt-muted {
  color: #000 !important;
}
.receipt-qr {
  display: block !important;
  width: ${qrSize}mm !important;
  height: ${qrSize}mm !important;
  max-width: ${qrSize}mm !important;
  max-height: ${qrSize}mm !important;
  margin: 1mm auto 0 !important;
  padding: 1.5mm !important;
  object-fit: contain !important;
  border: 1px solid #000 !important;
  background: #fff !important;
  break-inside: avoid !important;
  page-break-inside: avoid !important;
}
img,
svg,
canvas {
  max-width: 100% !important;
  height: auto !important;
  break-inside: avoid !important;
  page-break-inside: avoid !important;
}
.receipt-preview-controls,
.receipt-close-button,
.receipt-modal-backdrop,
.receipt-modal-header,
.receipt-action-bar,
.no-print {
  display: none !important;
}
.receipt-actions {
  position: sticky !important;
  bottom: 0 !important;
  left: 0 !important;
  z-index: 10 !important;
  display: grid !important;
  grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  gap: 8px !important;
  width: min(100%, 560px) !important;
  margin: 10px auto 0 !important;
  padding: 10px !important;
  border-top: 1px solid #000 !important;
  background: #fff !important;
  color: #000 !important;
}
.receipt-actions button,
.receipt-actions a {
  min-height: 44px !important;
  border: 1px solid #000 !important;
  border-radius: 0 !important;
  background: #fff !important;
  color: #000 !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 8px !important;
  font-family: Arial, Helvetica, sans-serif !important;
  font-size: 13px !important;
  font-weight: 800 !important;
  text-align: center !important;
  text-decoration: none !important;
}
.receipt-actions button:first-child {
  background: #000 !important;
  color: #fff !important;
}
.receipt-print-instruction {
  grid-column: 1 / -1 !important;
  margin: 0 !important;
  color: #000 !important;
  font-size: 11px !important;
  font-weight: 700 !important;
  line-height: 1.35 !important;
  text-align: center !important;
}
@media print {
  @page {
    size: ${widthMm}mm auto;
    margin: 0;
  }
  html,
  body {
    width: ${widthMm}mm !important;
    height: auto !important;
    min-height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: visible !important;
    background: #fff !important;
    color: #000 !important;
  }
  body * {
    visibility: hidden !important;
  }
  #tenant-receipt-print-root,
  #tenant-receipt-print-root * {
    visibility: visible !important;
  }
  #tenant-receipt-print-root {
    position: absolute !important;
    inset: 0 auto auto 0 !important;
    width: ${contentWidthMm}mm !important;
    max-width: ${contentWidthMm}mm !important;
    margin: 0 auto !important;
    background: #fff !important;
    color: #000 !important;
  }
  .receipt-actions {
    display: none !important;
  }
}
`;
}

export function ReceiptPrintActions({ receiptId, widthMm }: { receiptId: string; widthMm: 58 | 80 }) {
    const pdfHref = `/receipt-print/${encodeURIComponent(receiptId)}/pdf?width=${widthMm}`;
    return (
        <nav aria-label="Receipt print actions" className="receipt-actions">
            <button id="receipt-print-button" type="button">Print Receipt</button>
            <button id="receipt-choose-printer-button" type="button">Choose Printer</button>
            <a href={pdfHref} id="receipt-pdf-link" target="_blank" rel="noreferrer">Download PDF</a>
            <button id="receipt-close-page-button" type="button">Close</button>
            <p id="receipt-print-status" className="receipt-print-instruction">
                Select the connected Bluetooth printer, confirm one receipt is shown, then press Print.
            </p>
            <p className="receipt-print-instruction">
                Printer choice: Android System Print · Print PDF · Direct Bluetooth Print.
            </p>
        </nav>
    );
}

export function autoPrintScript(enabled: boolean) {
    if (!enabled) return "";
    return `
(async function () {
  async function waitForReceipt() {
    var receipt = document.getElementById("tenant-receipt-print-root");
    if (!receipt || !receipt.innerText.trim()) {
      throw new Error("Receipt is not ready yet.");
    }
    if (document.fonts && document.fonts.ready) {
      try { await document.fonts.ready; } catch (_) {}
    }
    const images = Array.from(receipt.querySelectorAll("img"));
    await Promise.all(images.map(function (image) {
      return new Promise(function (resolve) {
        if (image.complete) { resolve(); return; }
        image.onload = function () { resolve(); };
        image.onerror = function () { resolve(); };
      });
    }));
    await new Promise(function (resolve) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { resolve(); });
      });
    });
  }
  await waitForReceipt();
  window.focus();
  window.print();
})();`;
}

export function receiptPageControlsScript(widthMm: 58 | 80, receiptId: string) {
    const pdfHref = `/receipt-print/${encodeURIComponent(receiptId)}/pdf?width=${widthMm}`;
    return `
(function () {
  var status = document.getElementById("receipt-print-status");
  function setStatus(message) {
    if (status) status.textContent = message;
  }
  async function waitForReceipt() {
    var receipt = document.getElementById("tenant-receipt-print-root");
    if (!receipt || !receipt.innerText.trim()) {
      throw new Error("Receipt is not ready yet.");
    }
    if (document.fonts && document.fonts.ready) {
      try { await document.fonts.ready; } catch (_) {}
    }
    var images = Array.from(receipt.querySelectorAll("img"));
    await Promise.all(images.map(function (img) {
      return new Promise(function (resolve) {
        if (img.complete) { resolve(); return; }
        img.onload = function () { resolve(); };
        img.onerror = function () { resolve(); };
      });
    }));
    await new Promise(function (resolve) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { resolve(); });
      });
    });
  }
  async function printCurrentReceipt() {
    try {
      setStatus("Preparing receipt. Select the connected Bluetooth printer, confirm one receipt is shown, then press Print.");
      await waitForReceipt();
      window.focus();
      window.print();
      setStatus("Print dialog opened. If Android shows a blank page, use Download PDF and print the PDF.");
    } catch (error) {
      setStatus(error && error.message ? error.message : "Receipt is not ready yet.");
      alert(error && error.message ? error.message : "Receipt is not ready yet.");
    }
  }
  function openPdf() {
    window.open(${JSON.stringify(pdfHref)}, "_blank", "noopener,noreferrer");
  }
  document.getElementById("receipt-print-button")?.addEventListener("click", printCurrentReceipt);
  document.getElementById("receipt-choose-printer-button")?.addEventListener("click", printCurrentReceipt);
  document.getElementById("receipt-pdf-link")?.addEventListener("click", function () {
    setStatus("Opening a receipt-only PDF. Print that PDF if Android System Print shows a blank page.");
  });
  document.getElementById("receipt-close-page-button")?.addEventListener("click", function () {
    if (history.length > 1) history.back();
    else window.close();
  });
  window.__ddumbaPrintCurrentReceipt = printCurrentReceipt;
  window.__ddumbaOpenReceiptPdf = openPdf;
})();`;
}

export default async function ReceiptPrintPage({ searchParams }: PageProps) {
    const params = await searchParams;
    const receiptId = firstParam(params.receipt);
    if (!receiptId) notFound();

    const receipt = await loadPrintableReceipt(receiptId);
    const widthMm = paperWidth(params.paper ?? params.width);
    const autoPrint = firstParam(params.autoprint) === "1";

    return (
        <>
            <style dangerouslySetInnerHTML={{ __html: receiptOnlyPrintCss(widthMm) }} />
            <TenantPaymentReceiptSlip receipt={receipt} />
            <ReceiptPrintActions receiptId={receipt.id} widthMm={widthMm} />
            <script dangerouslySetInnerHTML={{ __html: receiptPageControlsScript(widthMm, receipt.id) }} />
            {autoPrint ? <script dangerouslySetInnerHTML={{ __html: autoPrintScript(true) }} /> : null}
        </>
    );
}
