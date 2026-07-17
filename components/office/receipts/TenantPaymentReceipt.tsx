"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { Download, Mail, Printer, X } from "lucide-react";
import type { PaymentReceiptSnapshot } from "@/lib/receipts/payment-receipts";

export type TenantReceiptViewModel = {
    id: string;
    receiptNumber: string;
    snapshot: PaymentReceiptSnapshot;
    verificationCode: string;
};

type ReceiptAction = () => void | Promise<void>;
type ReceiptPrinterSettings = {
    autoOpenPrint: boolean;
    autoPrintAfterPayment: boolean;
    copies: number;
    cutPaper: boolean;
    duplicateCopy: boolean;
    method: "browser" | "qz";
    preferredPrinterName: string;
    printableWidthMm: 48 | 72;
    printQrCode: boolean;
    widthMm: 58 | 80;
};

const RECEIPT_EXPORT_ROOT_ID = "tenant-receipt-print-root";
const RECEIPT_SCREEN_ID = "tenant-payment-receipt";
const RECEIPT_PDF_EXPORT_CLASS = "receipt-pdf-export-sandbox";
const QZ_TRAY_SCRIPT_URLS = [
    "https://cdn.jsdelivr.net/npm/qz-tray@2.2.4/qz-tray.js",
    "https://unpkg.com/qz-tray@2.2.4/qz-tray.js",
];
const MM_TO_PT = 72 / 25.4;

declare global {
    interface Window {
        qz?: any;
        __ddumbaQzTrayLoader?: Promise<any>;
    }
}

type ModalProps = {
    actionExtras?: React.ReactNode;
    downloadDisabled?: boolean;
    message?: string | null;
    onClose: () => void;
    onDownloadPdf: ReceiptAction;
    onPrint: ReceiptAction;
    onSendEmail?: ReceiptAction;
    printDisabled?: boolean;
    receipt: TenantReceiptViewModel;
    sendDisabled?: boolean;
    subtitle?: string;
    title?: string;
};

function money(value: number | null | undefined) {
    return `UGX ${Math.round(Number(value ?? 0)).toLocaleString()}`;
}

function safeText(value: string | null | undefined) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

function formatDateTime(value: string | null | undefined) {
    if (!value) return "No timestamp";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString("en-UG", {
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        month: "short",
        timeZone: "Africa/Kampala",
        year: "numeric",
    });
}

function receiptVerificationUrl(receipt: TenantReceiptViewModel) {
    const path = `/office/receipts?verify=${encodeURIComponent(receipt.verificationCode)}&receipt=${encodeURIComponent(receipt.id)}`;
    if (typeof window === "undefined") return `https://ddumba-property-operations-os-evgw.vercel.app${path}`;
    return `${window.location.origin}${path}`;
}

function defaultPrinterSettings(): ReceiptPrinterSettings {
    return {
        autoOpenPrint: false,
        autoPrintAfterPayment: false,
        copies: 1,
        cutPaper: true,
        duplicateCopy: false,
        method: "browser",
        preferredPrinterName: "POS-80",
        printableWidthMm: 72,
        printQrCode: true,
        widthMm: 80,
    };
}

function printerSettingsKey(receipt: TenantReceiptViewModel) {
    const snapshot = receipt.snapshot;
    const office = (snapshot.officeName ?? "company").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const company = (snapshot.companyName ?? "ddumba").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `ddumba.receiptPrinterSettings.${company}.${office || "office"}`;
}

function readPrinterSettings(receipt: TenantReceiptViewModel): ReceiptPrinterSettings {
    if (typeof window === "undefined") return defaultPrinterSettings();
    const raw = window.localStorage.getItem(printerSettingsKey(receipt));
    if (!raw) return defaultPrinterSettings();
    try {
        const parsed = JSON.parse(raw) as Partial<ReceiptPrinterSettings>;
        return {
            ...defaultPrinterSettings(),
            ...parsed,
            copies: Math.max(1, Math.min(3, Number(parsed.copies ?? 1) || 1)),
            printableWidthMm: parsed.printableWidthMm === 48 ? 48 : 72,
            widthMm: parsed.widthMm === 58 ? 58 : 80,
        };
    } catch {
        return defaultPrinterSettings();
    }
}

function savePrinterSettings(receipt: TenantReceiptViewModel, settings: ReceiptPrinterSettings) {
    window.localStorage.setItem(printerSettingsKey(receipt), JSON.stringify(settings));
    window.localStorage.setItem("ddumba.receiptPaperWidthMm", String(settings.widthMm));
}

export async function printTenantPaymentReceipt(afterPrint?: () => void) {
    const exportRoot = document.getElementById(RECEIPT_EXPORT_ROOT_ID);
    if (!exportRoot) {
        window.alert("Receipt could not be printed because the receipt export area is not ready.");
        return;
    }
    const paperWidthMm = receiptPaperWidthMm();
    await printReceiptMarkup(exportRoot.outerHTML, paperWidthMm, printableReceiptWidthMm(paperWidthMm), afterPrint);
}

async function printReceiptMarkup(receiptHtml: string, paperWidthMm: 58 | 80, printableWidthMm: 48 | 72, afterPrint?: () => void) {
    const printFrame = document.createElement("iframe");
    printFrame.title = "Tenant receipt print frame";
    printFrame.setAttribute("aria-hidden", "true");
    printFrame.style.position = "fixed";
    printFrame.style.right = "0";
    printFrame.style.bottom = "0";
    printFrame.style.width = "0";
    printFrame.style.height = "0";
    printFrame.style.border = "0";
    printFrame.style.opacity = "0";
    printFrame.style.pointerEvents = "none";
    document.body.appendChild(printFrame);
    const printWindow = printFrame.contentWindow;
    if (!printWindow) {
        printFrame.remove();
        window.alert("Receipt could not be prepared. Reopen the receipt and try again.");
        return;
    }

    try {
        printWindow.document.open();
        printWindow.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Tenant Receipt</title>
    <style id="receipt-print-style">${receiptPrintWindowStyle(paperWidthMm, undefined, printableWidthMm)}</style>
  </head>
  <body>
    ${receiptHtml}
  </body>
</html>`);
        printWindow.document.close();
        await waitForPrintWindowAssets(printWindow);
        await waitForPrintWindowLayout(printWindow);
        const receiptRoot = printWindow.document.getElementById(RECEIPT_EXPORT_ROOT_ID) as HTMLElement | null;
        const pageHeightMm = receiptRoot ? measuredReceiptPageHeightMm(receiptRoot, paperWidthMm) : 260;
        const styleElement = printWindow.document.getElementById("receipt-print-style");
        if (styleElement) styleElement.textContent = receiptPrintWindowStyle(paperWidthMm, pageHeightMm, printableWidthMm);
        await waitForPrintWindowLayout(printWindow);

        let cleanedUp = false;
        const cleanup = () => {
            if (cleanedUp) return;
            cleanedUp = true;
            afterPrint?.();
            window.setTimeout(() => printFrame.remove(), 50);
        };
        printWindow.onafterprint = cleanup;
        printWindow.focus();
        printWindow.print();
        window.setTimeout(() => cleanup(), 60000);
    } catch (error) {
        printFrame.remove();
        window.alert(error instanceof Error ? error.message : "Receipt could not be printed. Please try again.");
    }
}

export async function printTenantReceiptTest(receipt: TenantReceiptViewModel, settings?: ReceiptPrinterSettings) {
    const paperWidthMm = settings?.widthMm ?? receiptPaperWidthMm();
    const printableWidthMm = settings?.printableWidthMm ?? printableReceiptWidthMm(paperWidthMm);
    const now = new Date().toLocaleString("en-UG", {
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        month: "short",
        timeZone: "Africa/Kampala",
        year: "numeric",
    });
    const testHtml = `<article id="${RECEIPT_EXPORT_ROOT_ID}" class="tenant-receipt-export-root">
  <div id="${RECEIPT_SCREEN_ID}" class="tenant-receipt-slip mx-auto bg-white text-slate-950">
    <header class="receipt-section text-center">
      <div class="mx-auto flex h-9 w-9 items-center justify-center rounded-full border border-slate-900 bg-slate-950 text-[13px] font-black text-white">DD</div>
      <h3 class="mt-1.5 text-[15px] font-black leading-tight">DDUMBA OS</h3>
      <p class="mt-2 border-y border-dashed border-slate-900 py-1 text-[10px] font-black uppercase tracking-[0.08em]">POS 80 TEST</p>
    </header>
    <section class="receipt-section">
      <div class="receipt-row"><span class="receipt-label">Office</span><span class="receipt-value">${escapeReceiptHtml(receipt.snapshot.officeName ?? "Current office")}</span></div>
      <div class="receipt-row"><span class="receipt-label">Date/Time</span><span class="receipt-value">${escapeReceiptHtml(now)}</span></div>
      <div class="receipt-row"><span class="receipt-label">Width</span><span class="receipt-value">${paperWidthMm}mm paper / ${printableWidthMm}mm content</span></div>
    </section>
    <section class="receipt-section receipt-amount-section text-center">
      <p class="text-[12px] font-black">PRINT TEST SUCCESSFUL</p>
      <p class="receipt-muted mt-1 text-[9px] font-bold">If this prints as one receipt, browser printing is ready for POS 80.</p>
    </section>
  </div>
</article>`;
    await printReceiptMarkup(testHtml, paperWidthMm, printableWidthMm);
}

export async function downloadTenantPaymentReceiptPdf(fileName = "tenant-payment-receipt.pdf") {
    const source = document.getElementById(RECEIPT_EXPORT_ROOT_ID);
    if (!source) throw new Error("Receipt PDF could not be created because the receipt export area is not ready.");
    const paperWidthMm = receiptPaperWidthMm();

    const sandbox = document.createElement("div");
    sandbox.className = RECEIPT_PDF_EXPORT_CLASS;
    sandbox.setAttribute("aria-hidden", "true");
    const clone = source.cloneNode(true) as HTMLElement;
    clone.id = `${RECEIPT_EXPORT_ROOT_ID}-pdf-source`;
    sandbox.appendChild(clone);
    document.body.appendChild(sandbox);

    try {
        await waitForReceiptAssets(clone);
        const widthPx = Math.ceil(clone.scrollWidth || clone.getBoundingClientRect().width);
        const heightPx = Math.ceil(clone.scrollHeight || clone.getBoundingClientRect().height);
        const canvas = await renderReceiptElementToCanvas(clone, widthPx, heightPx);
        const jpegData = canvas.toDataURL("image/jpeg", 0.94).split(",")[1] ?? "";
        const receiptHeightMm = Math.max(1, (heightPx / Math.max(widthPx, 1)) * paperWidthMm);
        const pdf = createSingleImagePdf({
            imageBase64: jpegData,
            imageHeightPx: canvas.height,
            imageWidthPx: canvas.width,
            pageHeightPt: receiptHeightMm * MM_TO_PT,
            pageWidthPt: paperWidthMm * MM_TO_PT,
        });
        downloadBlob(pdf, sanitizePdfFileName(fileName));
    } finally {
        sandbox.remove();
    }
}

function receiptPaperWidthMm(): 58 | 80 {
    if (typeof window === "undefined") return 80;
    const configured = window.localStorage.getItem("ddumba.receiptPaperWidthMm")
        ?? window.localStorage.getItem("tenantReceiptPaperWidthMm")
        ?? "";
    return configured.trim() === "58" ? 58 : 80;
}

function printableReceiptWidthMm(paperWidthMm: 58 | 80): 48 | 72 {
    return paperWidthMm === 58 ? 48 : 72;
}

function escapeReceiptHtml(value: string) {
    return value.replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    })[char] ?? char);
}

async function waitForPrintWindowAssets(printWindow: Window) {
    await printWindow.document.fonts?.ready?.catch(() => undefined);
    const images = Array.from(printWindow.document.images);
    await Promise.all(images.map((image) => new Promise<void>((resolve) => {
        if (image.complete) {
            resolve();
            return;
        }
        image.onload = () => resolve();
        image.onerror = () => resolve();
    })));
}

function waitForPrintWindowLayout(printWindow: Window) {
    return new Promise<void>((resolve) => {
        printWindow.requestAnimationFrame(() => {
            printWindow.requestAnimationFrame(() => resolve());
        });
    });
}

function measuredReceiptPageHeightMm(receiptRoot: HTMLElement, paperWidthMm: 58 | 80) {
    const rect = receiptRoot.getBoundingClientRect();
    const widthPx = Math.max(1, rect.width || receiptRoot.scrollWidth);
    const heightPx = Math.max(1, receiptRoot.scrollHeight, rect.height);
    return Math.ceil((heightPx / widthPx) * paperWidthMm) + 4;
}

async function waitForReceiptAssets(root: HTMLElement) {
    await document.fonts?.ready?.catch(() => undefined);
    const images = Array.from(root.querySelectorAll("img"));
    await Promise.all(images.map(async (image) => {
        if (image.complete && image.naturalWidth > 0) return;
        await new Promise<void>((resolve) => {
            image.addEventListener("load", () => resolve(), { once: true });
            image.addEventListener("error", () => resolve(), { once: true });
        });
    }));
}

async function renderReceiptElementToCanvas(element: HTMLElement, widthPx: number, heightPx: number) {
    await inlineReceiptImages(element);
    const scale = Math.max(2, Math.min(3, window.devicePixelRatio || 2));
    const styleText = receiptExportStyleText();
    const html = `<style>${styleText}</style>${element.outerHTML}`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}" viewBox="0 0 ${widthPx} ${heightPx}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml">${html}</div></foreignObject></svg>`;
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    try {
        const image = await loadImage(url);
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(widthPx * scale);
        canvas.height = Math.ceil(heightPx * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Receipt PDF renderer could not start.");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(scale, scale);
        ctx.drawImage(image, 0, 0, widthPx, heightPx);
        return canvas;
    } finally {
        URL.revokeObjectURL(url);
    }
}

async function inlineReceiptImages(root: HTMLElement) {
    const images = Array.from(root.querySelectorAll("img"));
    await Promise.all(images.map(async (image) => {
        const src = image.getAttribute("src");
        if (!src || src.startsWith("data:")) return;
        try {
            const response = await fetch(src, { mode: "cors" });
            if (!response.ok) return;
            const blob = await response.blob();
            const dataUrl = await blobToDataUrl(blob);
            image.setAttribute("src", dataUrl);
        } catch {
            // Keep the visible image source if the QR provider cannot be inlined.
        }
    }));
    await waitForReceiptAssets(root);
}

function loadImage(src: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Receipt PDF image could not be rendered."));
        image.src = src;
    });
}

function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error ?? new Error("Receipt image could not be prepared."));
        reader.readAsDataURL(blob);
    });
}

function receiptExportStyleText() {
    const styleText = Array.from(document.styleSheets)
        .map((sheet) => {
            try {
                return Array.from(sheet.cssRules).map((rule) => rule.cssText).join("\n");
            } catch {
                return "";
            }
        })
        .join("\n");
    return `${styleText}\nbody{margin:0;background:white}.tenant-receipt-slip{margin:0!important;box-shadow:none!important}`;
}

function receiptPrintWindowStyle(paperWidthMm: 58 | 80, pageHeightMm?: number, printableWidthMm = printableReceiptWidthMm(paperWidthMm)) {
    const pageSize = pageHeightMm ? `${paperWidthMm}mm ${pageHeightMm}mm` : `${paperWidthMm}mm auto`;
    return `
@page {
  size: ${pageSize};
  margin: 0;
}
* {
  box-sizing: border-box;
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
  word-break: break-word;
}
html,
body {
  margin: 0;
  padding: 0;
  width: ${paperWidthMm}mm;
  height: auto;
  min-height: 0;
  overflow: visible;
  background: #ffffff;
  color: #000000;
}
body {
  font-family: Arial, Helvetica, sans-serif;
}
#${RECEIPT_EXPORT_ROOT_ID} {
  display: block;
  width: ${printableWidthMm}mm;
  max-width: ${printableWidthMm}mm;
  height: auto;
  min-height: 0;
  margin: 0 auto;
  padding: 0;
  overflow: visible;
  background: #ffffff;
  color: #000000;
  break-inside: avoid;
  page-break-inside: avoid;
  transform: none;
}
#${RECEIPT_SCREEN_ID} {
  width: ${printableWidthMm}mm;
  max-width: ${printableWidthMm}mm;
  margin: 0;
  padding: ${paperWidthMm === 58 ? "2mm" : "2mm"};
  border: 0;
  border-radius: 0;
  box-shadow: none;
  overflow: visible;
  background: #ffffff;
  color: #000000;
  font-family: Arial, Helvetica, sans-serif;
  font-variant-numeric: tabular-nums;
  line-height: 1.22;
}
.tenant-receipt-slip,
.tenant-receipt-slip * {
  box-sizing: border-box;
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.receipt-section {
  margin-top: 2mm;
}
.receipt-section:first-child {
  margin-top: 0;
}
.receipt-section-title,
.receipt-label {
  color: #475569;
  font-size: 8.5px;
  font-weight: 900;
  letter-spacing: 0.035em;
  text-transform: uppercase;
}
.receipt-row {
  display: grid;
  grid-template-columns: minmax(0, 42%) minmax(0, 58%);
  align-items: start;
  gap: 1.4mm;
  padding: 0.45mm 0;
  font-size: 10px;
}
.receipt-row-stacked {
  display: block;
  padding: 0.8mm 0;
}
.receipt-value {
  color: #020617;
  font-weight: 800;
  line-height: 1.18;
  text-align: right;
  white-space: normal;
}
.receipt-row-stacked .receipt-value {
  display: block;
  margin-top: 0.35mm;
  text-align: left;
}
.receipt-value-strong,
.receipt-money-row-highlight .receipt-value {
  font-weight: 950;
}
.receipt-money-row {
  font-size: 10px;
}
.receipt-money-value {
  font-size: 10px;
  letter-spacing: 0;
}
.receipt-money-row-highlight {
  margin: 0.7mm 0;
  border-block: 1px dashed #0f172a;
  padding-block: 1mm;
}
.receipt-amount-section {
  border-block: 1px dashed #0f172a;
  padding-block: 1.6mm;
}
.receipt-coverage-card {
  border: 1px solid #cbd5e1;
  border-radius: 2mm;
  background: #ffffff;
  padding: 1.4mm;
  break-inside: avoid;
  page-break-inside: avoid;
}
.receipt-qr {
  display: block;
  width: 22mm;
  height: 22mm;
  object-fit: contain;
  padding: 1.5mm;
  border: 1px solid #0f172a;
  background: #ffffff;
}
.receipt-muted {
  color: #64748b;
}
img,
svg,
canvas {
  max-width: 100%;
  height: auto;
  break-inside: avoid;
  page-break-inside: avoid;
}
.receipt-preview-controls,
.receipt-close-button,
.receipt-modal-backdrop,
.receipt-modal-header,
.receipt-action-bar,
.no-print {
  display: none !important;
}
`;
}

function createSingleImagePdf({ imageBase64, imageHeightPx, imageWidthPx, pageHeightPt, pageWidthPt }: {
    imageBase64: string;
    imageHeightPx: number;
    imageWidthPx: number;
    pageHeightPt: number;
    pageWidthPt: number;
}) {
    const imageBytes = base64ToBytes(imageBase64);
    const imageBuffer = imageBytes.buffer.slice(imageBytes.byteOffset, imageBytes.byteOffset + imageBytes.byteLength);
    const chunks: Array<string | ArrayBuffer> = [];
    const offsets: number[] = [];
    let length = 0;
    const push = (chunk: string | ArrayBuffer) => {
        chunks.push(chunk);
        length += typeof chunk === "string" ? chunk.length : chunk.byteLength;
    };
    const object = (body: string | ArrayBuffer, prefix: string, suffix = "\nendobj\n") => {
        offsets.push(length);
        push(prefix);
        push(body);
        push(suffix);
    };

    push("%PDF-1.4\n");
    object("<< /Type /Catalog /Pages 2 0 R >>\n", "1 0 obj\n");
    object("<< /Type /Pages /Kids [3 0 R] /Count 1 >>\n", "2 0 obj\n");
    object(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fixed(pageWidthPt)} ${fixed(pageHeightPt)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\n`, "3 0 obj\n");
    object(imageBuffer, `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imageWidthPx} /Height ${imageHeightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.byteLength} >>\nstream\n`, "\nendstream\nendobj\n");
    const content = `q\n${fixed(pageWidthPt)} 0 0 ${fixed(pageHeightPt)} 0 0 cm\n/Im0 Do\nQ\n`;
    object(content, `5 0 obj\n<< /Length ${content.length} >>\nstream\n`, "endstream\nendobj\n");
    const xrefOffset = length;
    push(`xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`);
    for (const offset of offsets) push(`${String(offset).padStart(10, "0")} 00000 n \n`);
    push(`trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
    return new Blob(chunks, { type: "application/pdf" });
}

function base64ToBytes(base64: string) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
}

function fixed(value: number) {
    return Number(value).toFixed(2);
}

function downloadBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

function sanitizePdfFileName(fileName: string) {
    const clean = fileName.replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    return clean.toLowerCase().endsWith(".pdf") ? clean : `${clean || "tenant-payment-receipt"}.pdf`;
}

async function loadQzTrayBridge(): Promise<any> {
    if (typeof window === "undefined") throw new Error("Direct thermal printing is available only in the browser.");
    if (window.qz) return window.qz;
    if (window.__ddumbaQzTrayLoader) return window.__ddumbaQzTrayLoader;

    window.__ddumbaQzTrayLoader = new Promise((resolve, reject) => {
        let urlIndex = 0;
        const tryNext = () => {
            const script = document.createElement("script");
            script.async = true;
            script.src = QZ_TRAY_SCRIPT_URLS[urlIndex] ?? "";
            script.onload = () => {
                if (window.qz) {
                    resolve(window.qz);
                    return;
                }
                reject(new Error("QZ Tray loaded but did not expose the browser bridge."));
            };
            script.onerror = () => {
                script.remove();
                urlIndex += 1;
                if (urlIndex < QZ_TRAY_SCRIPT_URLS.length) {
                    tryNext();
                    return;
                }
                reject(new Error("QZ Tray browser bridge could not be loaded. Use Browser Print or check your internet connection."));
            };
            document.head.appendChild(script);
        };
        tryNext();
    }).catch((error) => {
        window.__ddumbaQzTrayLoader = undefined;
        throw error;
    });

    return window.__ddumbaQzTrayLoader;
}

async function getQzTray() {
    const qz = await loadQzTrayBridge();
    qz.api?.setPromiseType?.((resolver: (resolve: (value: unknown) => void, reject: (reason?: unknown) => void) => void) => new Promise(resolver));
    return qz;
}

async function ensureQzConnected(qz: any) {
    if (qz.websocket?.isActive?.()) return;
    await qz.websocket.connect({
        host: ["localhost", "127.0.0.1"],
        port: { secure: [8181, 8182], insecure: [8182, 8181] },
        retries: 1,
    });
}

async function qzTrayPrinters(): Promise<string[]> {
    const qz = await getQzTray();
    if (!qz) throw new Error("Direct thermal printing is not connected. Use Browser Print or open Printer Settings.");
    await ensureQzConnected(qz);
    const printers = await qz.printers.find();
    return Array.isArray(printers) ? printers.map(String) : [String(printers)].filter(Boolean);
}

async function printDirectlyWithQz(receipt: TenantReceiptViewModel, settings: ReceiptPrinterSettings) {
    const qz = await getQzTray();
    if (!qz) throw new Error("Direct thermal printing is not connected. Use Browser Print or open Printer Settings.");
    if (!settings.preferredPrinterName.trim()) throw new Error("Select a preferred thermal printer before direct printing.");
    await ensureQzConnected(qz);
    const config = qz.configs.create(settings.preferredPrinterName, {
        copies: Math.max(1, settings.copies),
        encoding: "CP437",
        jobName: `DDUMBA receipt ${receipt.receiptNumber}`,
    });
    await qz.print(config, [{ data: buildEscPosReceipt(receipt, settings), format: "command", type: "raw" }]);
}

async function printEscPosTestWithQz(receipt: TenantReceiptViewModel, settings: ReceiptPrinterSettings) {
    const qz = await getQzTray();
    if (!qz) throw new Error("Direct thermal printing is not connected. Install and start QZ Tray on the computer connected to POS-80.");
    if (!settings.preferredPrinterName.trim()) throw new Error("Select POS-80 or the installed Xprinter queue before direct test printing.");
    await ensureQzConnected(qz);
    const config = qz.configs.create(settings.preferredPrinterName, {
        copies: Math.max(1, settings.copies),
        encoding: "CP437",
        jobName: "DDUMBA POS-80 ESC/POS test",
    });
    await qz.print(config, [{ data: buildEscPosTestReceipt(receipt, settings), format: "command", type: "raw" }]);
}

function buildEscPosReceipt(receipt: TenantReceiptViewModel, settings: ReceiptPrinterSettings) {
    const snapshot = receipt.snapshot;
    const coverage = snapshot.coveragePeriods?.length ? snapshot.coveragePeriods : snapshot.coveragePeriod ? [{ amount: snapshot.amountApplied, label: snapshot.coveragePeriod, type: "coverage" }] : [];
    const lines = [
        escPosInit(),
        escPosAlign("center"),
        escPosBold(true),
        escPosLine(safeEscPos(snapshot.companyName) ?? "DDUMBA OS"),
        escPosLine("TENANT PAYMENT RECEIPT"),
        escPosBold(false),
        escPosLine("-".repeat(32)),
        escPosAlign("left"),
        escPosPair("Receipt", receipt.receiptNumber),
        escPosPair("Date", formatDateTime(snapshot.paymentDateTime)),
        escPosPair("Office", snapshot.officeName ?? "Office"),
        escPosPair("Room", snapshot.roomNumber ?? "No room"),
        escPosPair("Tenant", snapshot.tenantName ?? "Unnamed tenant"),
        escPosPair("Phone", snapshot.tenantPhone ?? "No phone"),
        escPosPair("Landlord", snapshot.landlordName ?? "No landlord"),
        escPosLine("-".repeat(32)),
        escPosPair("Monthly rent", money(snapshot.monthlyRent)),
        escPosPair("Previous", money(snapshot.previousOutstandingBalance)),
        escPosPair("To outstanding", money(snapshot.amountAppliedToOutstanding ?? 0)),
        escPosPair("To current", money(snapshot.amountAppliedToCurrentRent ?? Math.max(0, snapshot.amountApplied - (snapshot.amountAppliedToOutstanding ?? 0)))),
        escPosPair("Advance rent", money(snapshot.advanceAmount ?? snapshot.advanceBalance)),
        escPosBold(true),
        escPosPair("Amount paid", money(snapshot.amountPaid)),
        escPosPair("Remaining", money(snapshot.remainingOutstandingBalance)),
        escPosBold(false),
        escPosPair("Advance bal", money(snapshot.advanceBalance)),
        escPosLine("-".repeat(32)),
    ];
    if (coverage.length) {
        lines.push(escPosLine("COVERAGE"));
        coverage.forEach((period, index) => {
            lines.push(escPosLine(`${index + 1}. ${safeEscPos(period.label) ?? "Period"}`));
            lines.push(escPosPair("Amount", money(period.amount)));
        });
        lines.push(escPosLine("-".repeat(32)));
    }
    lines.push(
        escPosPair("Method", snapshot.paymentMethod?.replaceAll("_", " ") ?? "Payment"),
        escPosPair("Reference", snapshot.referenceNumber ?? "No reference"),
        escPosPair("Recorded by", snapshot.recordedByName ?? "DDUMBA OS"),
        escPosPair("Verification", receipt.verificationCode),
    );
    if (settings.printQrCode) {
        lines.push(escPosAlign("center"), escPosQr(receiptVerificationUrl(receipt)), escPosAlign("left"));
    }
    lines.push(
        escPosAlign("center"),
        escPosLine("Thank you for your payment"),
        escPosLine("DDUMBA OS"),
        escPosFeed(3),
        settings.cutPaper ? escPosCut() : "",
    );
    return lines.join("");
}

function buildEscPosTestReceipt(receipt: TenantReceiptViewModel, settings: ReceiptPrinterSettings) {
    return [
        escPosInit(),
        escPosAlign("center"),
        escPosBold(true),
        escPosLine("DDUMBA OS"),
        escPosBold(false),
        escPosLine("XPRINTER XP-N260H"),
        escPosLine("POS-80 TEST"),
        escPosLine("-".repeat(32)),
        escPosLine("PRINT TEST SUCCESSFUL"),
        escPosLine(safeEscPos(receipt.snapshot.officeName) ?? "Current office"),
        escPosLine(`${settings.widthMm}mm paper / ${settings.printableWidthMm}mm content`),
        escPosFeed(3),
        settings.cutPaper ? escPosCut() : "",
    ].join("");
}

function safeEscPos(value: string | null | undefined) {
    if (!value) return null;
    return value.replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim() || null;
}

function escPosInit() { return "\x1b@"; }
function escPosBold(enabled: boolean) { return `\x1bE${enabled ? "\x01" : "\x00"}`; }
function escPosAlign(mode: "left" | "center" | "right") { return `\x1ba${mode === "center" ? "\x01" : mode === "right" ? "\x02" : "\x00"}`; }
function escPosFeed(lines: number) { return `\x1bd${String.fromCharCode(Math.max(0, Math.min(9, lines)))}`; }
function escPosCut() { return "\x1dVA0"; }
function escPosLine(value: string) { return `${wrapEscPos(safeEscPos(value) ?? "").join("\n")}\n`; }
function escPosPair(label: string, value: string) {
    const left = safeEscPos(label) ?? "";
    const right = safeEscPos(value) ?? "";
    const width = 32;
    if (left.length + right.length + 1 <= width) return `${left}${" ".repeat(width - left.length - right.length)}${right}\n`;
    return `${left}\n${wrapEscPos(right).map((line) => `  ${line}`).join("\n")}\n`;
}
function wrapEscPos(value: string, width = 32) {
    const text = safeEscPos(value) ?? "";
    const words = text.split(" ");
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
        if (!word) continue;
        if (!current) {
            current = word.slice(0, width);
        } else if (current.length + word.length + 1 <= width) {
            current = `${current} ${word}`;
        } else {
            lines.push(current);
            current = word.slice(0, width);
        }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [""];
}
function escPosQr(data: string) {
    const clean = safeEscPos(data) ?? "";
    const storeLength = clean.length + 3;
    const pL = String.fromCharCode(storeLength % 256);
    const pH = String.fromCharCode(Math.floor(storeLength / 256));
    return [
        "\x1d(k\x04\x001A2\x00",
        "\x1d(k\x03\x001C\x04",
        "\x1d(k\x03\x001E0",
        `\x1d(k${pL}${pH}1P0${clean}`,
        "\x1d(k\x03\x001Q0",
    ].join("");
}

export function TenantPaymentReceiptModal({
    actionExtras,
    downloadDisabled,
    message,
    onClose,
    onDownloadPdf,
    onPrint,
    onSendEmail,
    printDisabled,
    receipt,
    sendDisabled,
    subtitle = "Generated from the final saved Supabase transaction.",
    title = "PAYMENT RECORDED SUCCESSFULLY",
}: ModalProps) {
    const closeButtonRef = useRef<HTMLButtonElement | null>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);
    const [availablePrinters, setAvailablePrinters] = useState<string[]>([]);
    const [isPreparingPrint, setIsPreparingPrint] = useState(false);
    const [latestPrintRequestAt, setLatestPrintRequestAt] = useState<string | null>(null);
    const [localConfirmationStatus, setLocalConfirmationStatus] = useState("Awaiting office confirmation");
    const [printAttemptNumber, setPrintAttemptNumber] = useState(0);
    const [printerMessage, setPrinterMessage] = useState<string | null>(null);
    const [printerSettings, setPrinterSettings] = useState<ReceiptPrinterSettings>(() => defaultPrinterSettings());
    const [showPrinterSettings, setShowPrinterSettings] = useState(false);

    useEffect(() => {
        previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const oldOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        closeButtonRef.current?.focus();
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                onClose();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => {
            window.removeEventListener("keydown", onKeyDown);
            document.body.style.overflow = oldOverflow;
            previousFocusRef.current?.focus?.();
        };
    }, [onClose]);

    useEffect(() => {
        setPrinterSettings(readPrinterSettings(receipt));
        setPrinterMessage(null);
        setAvailablePrinters([]);
        setLatestPrintRequestAt(null);
        setLocalConfirmationStatus("Awaiting office confirmation");
        setPrintAttemptNumber(0);
    }, [receipt.id]);

    function updatePrinterSettings(patch: Partial<ReceiptPrinterSettings>) {
        setPrinterSettings((current) => {
            const next = { ...current, ...patch };
            savePrinterSettings(receipt, next);
            return next;
        });
    }

    const handleBrowserPrint = async () => {
        setPrinterMessage("Preparing receipt...");
        setIsPreparingPrint(true);
        setPrintAttemptNumber((attempt) => attempt + 1);
        setLatestPrintRequestAt(new Date().toLocaleString("en-UG", { timeZone: "Africa/Kampala" }));
        setLocalConfirmationStatus("Browser print dialog opening");
        try {
            savePrinterSettings(receipt, printerSettings);
            await Promise.resolve(onPrint());
            setLocalConfirmationStatus("Print request opened; confirm Windows queue and paper output");
            setPrinterMessage("Print request opened. Select POS-80 under Destination, do not select RONGTA S58mm, confirm one sheet, then press Print. Did POS-80 print the receipt?");
        } catch (error) {
            setLocalConfirmationStatus("Browser print request failed before Windows queue");
            setPrinterMessage(error instanceof Error ? error.message : "Receipt could not be prepared. No physical print result was confirmed.");
        } finally {
            setIsPreparingPrint(false);
        }
    };

    const detectPrinters = async () => {
        setPrinterMessage("Detecting thermal printers...");
        try {
            const printers = await qzTrayPrinters();
            setAvailablePrinters(printers);
            const hasPos80 = printers.some((printer) => /pos[-_\s]?80|xprinter|xp[-_\s]?n260h/i.test(printer));
            setPrinterMessage(printers.length ? (hasPos80 ? "QZ Tray connected. POS-80/Xprinter-compatible queue detected; select it and save settings." : "QZ Tray connected, but POS-80 was not detected. Check Windows printer installation and USB port.") : "QZ Tray connected, but no printers were reported.");
        } catch (error) {
            setAvailablePrinters([]);
            setPrinterMessage(error instanceof Error ? error.message : "Direct thermal printing is not connected. Use Browser Print or open Printer Settings.");
        }
    };

    const handleDirectPrint = async () => {
        setIsPreparingPrint(true);
        setPrintAttemptNumber((attempt) => attempt + 1);
        setLatestPrintRequestAt(new Date().toLocaleString("en-UG", { timeZone: "Africa/Kampala" }));
        setLocalConfirmationStatus("Sending ESC/POS command through QZ Tray");
        setPrinterMessage("Sending receipt to POS-80 through QZ Tray...");
        try {
            await printDirectlyWithQz(receipt, printerSettings);
            setLocalConfirmationStatus("QZ accepted print command; confirm physical paper output");
            setPrinterMessage("Print command accepted by QZ Tray. Confirm the POS-80 queue and physical receipt; the browser cannot prove paper output.");
        } catch (error) {
            setLocalConfirmationStatus("Direct print failed before printer acceptance");
            setPrinterMessage(error instanceof Error ? error.message : "Direct thermal printing failed. Use Browser Print or check Printer Settings.");
        } finally {
            setIsPreparingPrint(false);
        }
    };

    const testBrowserPrint = async () => {
        setPrinterMessage("Preparing POS 80 browser print test...");
        setIsPreparingPrint(true);
        setPrintAttemptNumber((attempt) => attempt + 1);
        setLatestPrintRequestAt(new Date().toLocaleString("en-UG", { timeZone: "Africa/Kampala" }));
        setLocalConfirmationStatus("Browser test print dialog opening");
        try {
            savePrinterSettings(receipt, printerSettings);
            await printTenantReceiptTest(receipt, printerSettings);
            setLocalConfirmationStatus("Browser test print request opened");
            setPrinterMessage("POS-80 test print dialog opened. Select POS-80, not RONGTA S58mm, confirm one sheet, then press Print.");
        } catch (error) {
            setLocalConfirmationStatus("Browser test print failed before Windows queue");
            setPrinterMessage(error instanceof Error ? error.message : "Test receipt could not be prepared. Reopen the receipt and try again.");
        } finally {
            setIsPreparingPrint(false);
        }
    };

    const testDirectPrint = async () => {
        setPrinterMessage("Sending ESC/POS test receipt to POS-80 through QZ Tray...");
        setIsPreparingPrint(true);
        setPrintAttemptNumber((attempt) => attempt + 1);
        setLatestPrintRequestAt(new Date().toLocaleString("en-UG", { timeZone: "Africa/Kampala" }));
        setLocalConfirmationStatus("Sending ESC/POS test command");
        try {
            await printEscPosTestWithQz(receipt, printerSettings);
            setLocalConfirmationStatus("QZ accepted ESC/POS test command; confirm physical output");
            setPrinterMessage("ESC/POS test command accepted by QZ Tray. Confirm POS-80 printed the Xprinter test receipt.");
        } catch (error) {
            setLocalConfirmationStatus("Direct ESC/POS test failed before printer acceptance");
            setPrinterMessage(error instanceof Error ? error.message : "Direct ESC/POS test failed. Use Printer Help to check QZ Tray, POS-80, and the USB driver.");
        } finally {
            setIsPreparingPrint(false);
        }
    };

    const openPrinterHelp = () => {
        setPrinterMessage("Windows help for the Xprinter XP-N260H: open Settings > Bluetooth & devices > Printers & scanners; confirm POS-80 is Ready; cancel stuck queue jobs; do not use the RONGTA S58mm queue; confirm an Xprinter/80mm driver, USB port, 80mm paper, Windows test page, then return to Ddumba OS and use Test Print.");
    };

    const clearApplicationPrintState = () => {
        setAvailablePrinters([]);
        setLatestPrintRequestAt(null);
        setLocalConfirmationStatus("Application print state cleared; Windows queue was not changed");
        setPrinterMessage("Application print state cleared. This does not clear Windows spooler jobs; use Windows Printer Help for stuck POS-80 or RONGTA jobs.");
    };

    const testReceiptPreview = () => {
        setPrinterMessage(`Test receipt preview is ready. This preview will print on ${printerSettings.widthMm}mm paper with ${printerSettings.printableWidthMm}mm printable content. Use Open Browser Print Test to verify the browser dialog.`);
    };

    const closeFromBackdrop = (event: React.MouseEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget) onClose();
    };

    return (
        <div
            aria-modal="true"
            className="tenant-receipt-modal receipt-modal-backdrop fixed inset-0 z-[140] overflow-y-auto bg-slate-950/82 p-3 backdrop-blur-md sm:p-5 print:static print:bg-white print:p-0"
            onMouseDown={closeFromBackdrop}
            role="dialog"
        >
            <div className="tenant-receipt-modal-panel mx-auto flex min-h-full w-full max-w-5xl items-start justify-center py-2 sm:py-4 print:block print:min-h-0 print:max-w-none print:p-0">
                <div className="w-full rounded-[28px] border border-white/10 bg-white p-3 text-slate-950 shadow-2xl sm:p-4 print:w-auto print:rounded-none print:border-0 print:bg-white print:p-0 print:shadow-none">
                    <div className="tenant-receipt-actions receipt-action-bar receipt-preview-controls receipt-modal-header sticky top-2 z-10 mb-3 rounded-[22px] border border-slate-200 bg-white/95 p-3 shadow-lg shadow-slate-900/10 backdrop-blur print:hidden">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="min-w-0">
                                <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">{title}</p>
                                <p className="mt-1 text-sm font-bold text-slate-500">{subtitle}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
                                <button type="button" onClick={handleBrowserPrint} disabled={printDisabled || isPreparingPrint} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-3 py-2 text-xs font-black text-white disabled:opacity-50">
                                    <Printer size={15} /> {isPreparingPrint ? "Preparing receipt..." : "Print with Browser"}
                                </button>
                                <button type="button" onClick={handleDirectPrint} disabled={printDisabled || isPreparingPrint} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-violet-700 px-3 py-2 text-xs font-black text-white disabled:opacity-50">
                                    <Printer size={15} /> Print Directly
                                </button>
                                <button type="button" onClick={onDownloadPdf} disabled={downloadDisabled} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-blue-700 px-3 py-2 text-xs font-black text-white disabled:opacity-50">
                                    <Download size={15} /> Download PDF
                                </button>
                                {onSendEmail ? (
                                    <button type="button" onClick={onSendEmail} disabled={sendDisabled} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">
                                        <Mail size={15} /> Send E-Receipt
                                    </button>
                                ) : null}
                                <button ref={closeButtonRef} type="button" onClick={onClose} className="receipt-close-button inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-800">
                                    <X size={15} /> Close Receipt
                                </button>
                            </div>
                        </div>
                        <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-bold leading-relaxed text-blue-950">
                            Select <strong>POS-80</strong> under Destination. Do <strong>not</strong> select <strong>RONGTA S58mm</strong>. Confirm the preview shows <strong>one sheet</strong>, then press <strong>Print</strong>.
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            <button type="button" onClick={() => setShowPrinterSettings((value) => !value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-800">
                                Printer Settings
                            </button>
                            <span className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600">Width: {printerSettings.widthMm}mm</span>
                            <span className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600">Printable: {printerSettings.printableWidthMm}mm</span>
                            {printerSettings.preferredPrinterName ? <span className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">Preferred: {printerSettings.preferredPrinterName}</span> : null}
                        </div>
                        {showPrinterSettings ? (
                            <div className="mt-3 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold text-slate-700 md:grid-cols-2 lg:grid-cols-3">
                                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-amber-950 md:col-span-2 lg:col-span-3">
                                    <p className="text-[11px] font-black uppercase tracking-[0.12em]">Printer Diagnostics</p>
                                    <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                                        <span>Configured label: <strong>{printerSettings.preferredPrinterName || "POS-80"}</strong></span>
                                        <span>Expected model: <strong>Xprinter XP-N260H</strong></span>
                                        <span>Paper: <strong>{printerSettings.widthMm}mm</strong></span>
                                        <span>Method: <strong>{printerSettings.method === "qz" ? "QZ Tray Direct Print" : "Browser Print"}</strong></span>
                                        <span>Latest request: <strong>{latestPrintRequestAt ?? "None this session"}</strong></span>
                                        <span>Receipt ID: <strong>{receipt.id}</strong></span>
                                        <span>Attempts: <strong>{printAttemptNumber}</strong></span>
                                        <span>Status: <strong>{localConfirmationStatus}</strong></span>
                                    </div>
                                </div>
                                <label className="grid gap-1">
                                    <span>Printer method</span>
                                    <select value={printerSettings.method} onChange={(event) => updatePrinterSettings({ method: event.target.value === "qz" ? "qz" : "browser" })} className="h-10 rounded-xl border border-slate-200 bg-white px-3 font-bold">
                                        <option value="browser">Browser print</option>
                                        <option value="qz">QZ Tray direct print</option>
                                    </select>
                                </label>
                                <label className="grid gap-1">
                                    <span>Preferred printer label</span>
                                    <input value={printerSettings.preferredPrinterName} onChange={(event) => updatePrinterSettings({ preferredPrinterName: event.target.value })} className="h-10 rounded-xl border border-slate-200 bg-white px-3 font-bold" placeholder="POS-80" />
                                </label>
                                <label className="grid gap-1">
                                    <span>Receipt width</span>
                                    <select value={printerSettings.widthMm} onChange={(event) => updatePrinterSettings({ widthMm: event.target.value === "58" ? 58 : 80 })} className="h-10 rounded-xl border border-slate-200 bg-white px-3 font-bold">
                                        <option value={80}>80mm</option>
                                        <option value={58}>58mm</option>
                                    </select>
                                </label>
                                <label className="grid gap-1">
                                    <span>Printable width</span>
                                    <select value={printerSettings.printableWidthMm} onChange={(event) => updatePrinterSettings({ printableWidthMm: event.target.value === "48" ? 48 : 72 })} className="h-10 rounded-xl border border-slate-200 bg-white px-3 font-bold">
                                        <option value={72}>72mm for POS 80</option>
                                        <option value={48}>48mm for 58mm printer</option>
                                    </select>
                                </label>
                                <label className="grid gap-1">
                                    <span>Copies</span>
                                    <input value={printerSettings.copies} onChange={(event) => updatePrinterSettings({ copies: Math.max(1, Math.min(3, Number(event.target.value) || 1)) })} type="number" min={1} max={3} className="h-10 rounded-xl border border-slate-200 bg-white px-3 font-bold" />
                                </label>
                                <label className="flex items-center gap-2 rounded-xl bg-white px-3 py-2"><input checked={printerSettings.autoOpenPrint} onChange={(event) => updatePrinterSettings({ autoOpenPrint: event.target.checked })} type="checkbox" /> Auto-open print after payment</label>
                                <label className="flex items-center gap-2 rounded-xl bg-white px-3 py-2"><input checked={printerSettings.autoPrintAfterPayment} onChange={(event) => updatePrinterSettings({ autoPrintAfterPayment: event.target.checked })} type="checkbox" /> Auto-print after payment</label>
                                <label className="flex items-center gap-2 rounded-xl bg-white px-3 py-2"><input checked={printerSettings.cutPaper} onChange={(event) => updatePrinterSettings({ cutPaper: event.target.checked })} type="checkbox" /> Cut paper after print</label>
                                <label className="flex items-center gap-2 rounded-xl bg-white px-3 py-2"><input checked={printerSettings.printQrCode} onChange={(event) => updatePrinterSettings({ printQrCode: event.target.checked })} type="checkbox" /> Print QR code</label>
                                <label className="flex items-center gap-2 rounded-xl bg-white px-3 py-2"><input checked={printerSettings.duplicateCopy} onChange={(event) => updatePrinterSettings({ duplicateCopy: event.target.checked })} type="checkbox" /> Print duplicate copy</label>
                                <div className="flex flex-wrap gap-2 md:col-span-2 lg:col-span-3">
                                    <button type="button" onClick={detectPrinters} className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white">Detect Printers</button>
                                    {availablePrinters.map((printer) => (
                                        <button key={printer} type="button" onClick={() => updatePrinterSettings({ preferredPrinterName: printer })} className="rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-800 ring-1 ring-slate-200">{printer}</button>
                                    ))}
                                    <button type="button" onClick={testReceiptPreview} className="rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-800 ring-1 ring-slate-200">Test Receipt Preview</button>
                                    <button type="button" onClick={() => { savePrinterSettings(receipt, printerSettings); setPrinterMessage("Printer settings saved for this office and browser."); }} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white">Save Printer Settings</button>
                                    <button type="button" onClick={testBrowserPrint} className="rounded-xl bg-violet-700 px-3 py-2 text-xs font-black text-white">Open Browser Print Test</button>
                                    <button type="button" onClick={testDirectPrint} className="rounded-xl bg-violet-900 px-3 py-2 text-xs font-black text-white">Direct ESC/POS Test</button>
                                    <button type="button" onClick={() => { updatePrinterSettings({ method: "qz" }); setPrinterMessage("Switched to QZ Tray Direct Print. Use Detect Printers, select POS-80, then run Direct ESC/POS Test."); }} className="rounded-xl bg-indigo-700 px-3 py-2 text-xs font-black text-white">Switch to Direct Printing</button>
                                    <button type="button" onClick={openPrinterHelp} className="rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-800 ring-1 ring-slate-200">Printing Help</button>
                                    <button type="button" onClick={clearApplicationPrintState} className="rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-800 ring-1 ring-slate-200">Clear Application Print State</button>
                                    <button type="button" onClick={() => { const defaults = defaultPrinterSettings(); updatePrinterSettings(defaults); setAvailablePrinters([]); setPrinterMessage("Printer settings reset for this office and browser."); }} className="rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-800 ring-1 ring-slate-200">Reset Settings</button>
                                </div>
                            </div>
                        ) : null}
                        {printerMessage?.includes("Did POS-80 print the receipt?") ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                                <button type="button" onClick={() => { setLocalConfirmationStatus("Office confirmed physical receipt output"); setPrinterMessage("Office confirmed POS-80 printed the receipt. Keep the printed receipt with tenant, office, collector, and audit records."); }} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white">Yes</button>
                                <button type="button" onClick={handleBrowserPrint} className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white">Print Again</button>
                                <button type="button" onClick={handleDirectPrint} className="rounded-xl bg-violet-700 px-3 py-2 text-xs font-black text-white">Use Direct Print</button>
                                <button type="button" onClick={openPrinterHelp} className="rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-800 ring-1 ring-slate-200">Open Printer Help</button>
                            </div>
                        ) : null}
                        {actionExtras ? <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{actionExtras}</div> : null}
                        {printerMessage ? <p className="mt-3 rounded-2xl bg-cyan-50 px-4 py-3 text-sm font-black text-cyan-900">{printerMessage}</p> : null}
                        {message ? <p className="mt-3 rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-700">{message}</p> : null}
                    </div>
                    <div className="tenant-receipt-preview-scroll max-h-[calc(100vh-150px)] overflow-y-auto overflow-x-hidden rounded-[24px] bg-slate-100/80 p-3 sm:p-5 print:max-h-none print:overflow-visible print:bg-white print:p-0">
                        <TenantPaymentReceiptSlip receipt={receipt} />
                    </div>
                </div>
            </div>
        </div>
    );
}

export function TenantPaymentReceiptSlip({ receipt }: { receipt: TenantReceiptViewModel }) {
    const snapshot = receipt.snapshot;
    const companyContact = [safeText(snapshot.companyContact)].filter(Boolean).join(" · ");
    const coveragePeriods = useMemo(() => {
        if (snapshot.coveragePeriods?.length) return snapshot.coveragePeriods.filter((period) => period.label && Number(period.amount) > 0);
        if (snapshot.coveragePeriod) return [{ amount: snapshot.amountApplied, label: snapshot.coveragePeriod, type: "coverage" }];
        return [];
    }, [snapshot.amountApplied, snapshot.coveragePeriod, snapshot.coveragePeriods]);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=128x128&margin=10&data=${encodeURIComponent(receiptVerificationUrl(receipt))}`;

    return (
        <article id={RECEIPT_EXPORT_ROOT_ID} className="tenant-receipt-export-root">
        <div id={RECEIPT_SCREEN_ID} className="tenant-receipt-slip mx-auto bg-white text-slate-950">
            <header className="receipt-section text-center">
                <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full border border-slate-900 bg-slate-950 text-[13px] font-black text-white print:bg-white print:text-black">DD</div>
                <h3 className="mt-1.5 text-[15px] font-black leading-tight">{safeText(snapshot.companyName) ?? "DDUMBA OS"}</h3>
                {companyContact ? <p className="receipt-muted mt-0.5 text-[9px] font-bold">{companyContact}</p> : null}
                <p className="mt-2 border-y border-dashed border-slate-900 py-1 text-[10px] font-black uppercase tracking-[0.08em]">Tenant Payment Receipt</p>
            </header>

            <section className="receipt-section">
                <ReceiptRow label="Receipt No" value={receipt.receiptNumber} strong />
                <ReceiptRow label="Verification" value={receipt.verificationCode} />
                <ReceiptRow label="Date/Time" value={formatDateTime(snapshot.paymentDateTime)} />
                <ReceiptRow label="Office" value={snapshot.officeName ?? "Office"} stackWhenLong />
                <ReceiptRow label="Room" value={snapshot.roomNumber ?? "No room"} />
                <ReceiptRow label="Tenant" value={snapshot.tenantName ?? "Unnamed tenant"} stackWhenLong />
                <ReceiptRow label="Phone" value={snapshot.tenantPhone ?? "No phone"} />
                <ReceiptRow label="Landlord" value={snapshot.landlordName ?? "No landlord"} stackWhenLong />
            </section>

            <section className="receipt-section receipt-amount-section">
                <ReceiptMoneyRow label="Monthly rent" value={snapshot.monthlyRent} />
                <ReceiptMoneyRow label="Previous outstanding" value={snapshot.previousOutstandingBalance} />
                <ReceiptMoneyRow label="Applied to outstanding" value={snapshot.amountAppliedToOutstanding ?? 0} />
                <ReceiptMoneyRow label="Applied to current rent" value={snapshot.amountAppliedToCurrentRent ?? Math.max(0, snapshot.amountApplied - (snapshot.amountAppliedToOutstanding ?? 0))} />
                <ReceiptMoneyRow label="Advance rent" value={snapshot.advanceAmount ?? snapshot.advanceBalance} />
                <ReceiptMoneyRow label="Amount paid" value={snapshot.amountPaid} highlight />
                <ReceiptMoneyRow label="Remaining balance" value={snapshot.remainingOutstandingBalance} highlight />
                <ReceiptMoneyRow label="Advance balance" value={snapshot.advanceBalance} />
            </section>

            {coveragePeriods.length ? (
                <section className="receipt-section">
                    <p className="receipt-section-title">Coverage</p>
                    <div className="space-y-1.5">
                        {coveragePeriods.map((period, index) => (
                            <div key={`${period.label}-${period.type}-${index}`} className="receipt-coverage-card">
                                <p className="text-[9px] font-black uppercase text-slate-500">Period {index + 1}</p>
                                <p className="mt-0.5 text-[10px] font-black leading-tight">{period.label}</p>
                                <p className="mt-0.5 text-[10px] font-black tabular-nums">Amount: {money(period.amount)}</p>
                                {period.type ? <p className="mt-0.5 text-[8px] font-bold uppercase text-slate-500">{period.type}</p> : null}
                            </div>
                        ))}
                    </div>
                </section>
            ) : null}

            <section className="receipt-section">
                <ReceiptRow label="Method" value={snapshot.paymentMethod?.replaceAll("_", " ") ?? "Payment"} />
                <ReceiptRow label="Reference" value={snapshot.referenceNumber ?? "No reference"} stacked />
                <ReceiptRow label="Recorded by" value={snapshot.recordedByName ?? "DDUMBA OS"} stacked />
                {snapshot.collectorName ? <ReceiptRow label="Collector" value={snapshot.collectorName} stacked /> : null}
                <ReceiptRow label="Approved by" value={snapshot.approvedByName ?? snapshot.recordedByName ?? "DDUMBA OS"} stacked />
                <ReceiptRow label="Status" value={snapshot.status} />
                <ReceiptRow label="Notes" value={snapshot.notes ?? "No notes"} stacked />
            </section>

            <footer className="receipt-section text-center">
                <img alt={`Receipt QR ${receipt.verificationCode}`} className="receipt-qr mx-auto" crossOrigin="anonymous" src={qrUrl} />
                <p className="mt-2 text-[9px] font-black uppercase tracking-wide">Thank you for your payment</p>
                <p className="receipt-muted mt-1 text-[8px] font-bold leading-tight">Generated from the saved DDUMBA OS Supabase transaction. Keep this slip for tenant, office, collector, and audit verification.</p>
            </footer>
        </div>
        </article>
    );
}

function ReceiptRow({ label, stackWhenLong = false, stacked = false, strong = false, value }: { label: string; stackWhenLong?: boolean; stacked?: boolean; strong?: boolean; value: string }) {
    const shouldStack = stacked || (stackWhenLong && value.length > 22);
    return (
        <div className={shouldStack ? "receipt-row receipt-row-stacked" : "receipt-row"}>
            <span className="receipt-label">{label}</span>
            <span className={strong ? "receipt-value receipt-value-strong" : "receipt-value"}>{value}</span>
        </div>
    );
}

function ReceiptMoneyRow({ highlight = false, label, value }: { highlight?: boolean; label: string; value: number }) {
    return (
        <div className={highlight ? "receipt-row receipt-money-row receipt-money-row-highlight" : "receipt-row receipt-money-row"}>
            <span className="receipt-label">{label}</span>
            <span className="receipt-value receipt-money-value">{money(value)}</span>
        </div>
    );
}
