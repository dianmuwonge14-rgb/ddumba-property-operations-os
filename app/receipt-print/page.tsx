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
  width: ${widthMm}mm !important;
  height: auto !important;
  min-height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: visible !important;
  background: #fff !important;
  color: #000 !important;
}
body {
  font-family: Arial, Helvetica, sans-serif !important;
  -webkit-print-color-adjust: exact !important;
  print-color-adjust: exact !important;
}
body > :not(#tenant-receipt-print-root) {
  display: none !important;
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
.no-print,
button {
  display: none !important;
}
`;
}

export function autoPrintScript(enabled: boolean) {
    if (!enabled) return "";
    return `
(async function () {
  async function waitForAssets() {
    if (document.fonts && document.fonts.ready) {
      try { await document.fonts.ready; } catch (_) {}
    }
    const images = Array.from(document.images || []);
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
  await waitForAssets();
  window.focus();
  window.print();
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
            {autoPrint ? <script dangerouslySetInnerHTML={{ __html: autoPrintScript(true) }} /> : null}
        </>
    );
}
