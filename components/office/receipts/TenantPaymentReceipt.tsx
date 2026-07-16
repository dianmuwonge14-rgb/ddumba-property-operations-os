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
    printQrCode: boolean;
    widthMm: 58 | 80;
};

const RECEIPT_EXPORT_ROOT_ID = "tenant-receipt-print-root";
const RECEIPT_SCREEN_ID = "tenant-payment-receipt";
const RECEIPT_PDF_EXPORT_CLASS = "receipt-pdf-export-sandbox";
const MM_TO_PT = 72 / 25.4;

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
        cutPaper: false,
        duplicateCopy: false,
        method: "browser",
        preferredPrinterName: "",
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
    const printWindow = window.open("", "tenant-receipt-print", "width=420,height=800");
    if (!printWindow) {
        window.alert("Printing was blocked by the browser. Allow pop-ups for Ddumba OS and try again.");
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
    <style id="receipt-print-style">${receiptPrintWindowStyle(paperWidthMm)}</style>
  </head>
  <body>
    ${exportRoot.outerHTML}
  </body>
</html>`);
        printWindow.document.close();
        await waitForPrintWindowAssets(printWindow);
        await waitForPrintWindowLayout(printWindow);
        const receiptRoot = printWindow.document.getElementById(RECEIPT_EXPORT_ROOT_ID) as HTMLElement | null;
        const pageHeightMm = receiptRoot ? measuredReceiptPageHeightMm(receiptRoot, paperWidthMm) : 260;
        const styleElement = printWindow.document.getElementById("receipt-print-style");
        if (styleElement) styleElement.textContent = receiptPrintWindowStyle(paperWidthMm, pageHeightMm);
        await waitForPrintWindowLayout(printWindow);

        let cleanedUp = false;
        const cleanup = () => {
            if (cleanedUp) return;
            cleanedUp = true;
            afterPrint?.();
            window.setTimeout(() => printWindow.close(), 50);
        };
        printWindow.onafterprint = cleanup;
        printWindow.focus();
        printWindow.print();
        window.setTimeout(() => {
            if (printWindow.closed) cleanup();
        }, 1000);
    } catch (error) {
        printWindow.close();
        window.alert(error instanceof Error ? error.message : "Receipt could not be printed. Please try again.");
    }
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

function receiptPrintWindowStyle(paperWidthMm: 58 | 80, pageHeightMm?: number) {
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
  width: ${paperWidthMm}mm;
  max-width: ${paperWidthMm}mm;
  height: auto;
  min-height: 0;
  margin: 0;
  padding: 0;
  overflow: visible;
  background: #ffffff;
  color: #000000;
  break-inside: avoid;
  page-break-inside: avoid;
  transform: none;
}
#${RECEIPT_SCREEN_ID} {
  width: ${paperWidthMm}mm;
  max-width: ${paperWidthMm}mm;
  margin: 0;
  padding: ${paperWidthMm === 58 ? "2.5mm" : "4mm"};
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

async function qzTrayPrinters(): Promise<string[]> {
    const qz = (window as unknown as { qz?: any }).qz;
    if (!qz) throw new Error("Direct thermal printing is not connected. Use Browser Print or open Printer Settings.");
    if (!qz.websocket?.isActive?.()) await qz.websocket.connect();
    const printers = await qz.printers.find();
    return Array.isArray(printers) ? printers.map(String) : [String(printers)].filter(Boolean);
}

async function printDirectlyWithQz(receipt: TenantReceiptViewModel, settings: ReceiptPrinterSettings) {
    const qz = (window as unknown as { qz?: any }).qz;
    if (!qz) throw new Error("Direct thermal printing is not connected. Use Browser Print or open Printer Settings.");
    if (!settings.preferredPrinterName.trim()) throw new Error("Select a preferred thermal printer before direct printing.");
    const source = document.getElementById(RECEIPT_EXPORT_ROOT_ID);
    if (!source) throw new Error("Receipt could not be prepared. Reopen the receipt and try again.");
    if (!qz.websocket?.isActive?.()) await qz.websocket.connect();
    const config = qz.configs.create(settings.preferredPrinterName, {
        copies: Math.max(1, settings.copies),
        rasterize: false,
        size: { width: settings.widthMm },
    });
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>${receiptPrintWindowStyle(settings.widthMm)}</style></head><body>${source.outerHTML}</body></html>`;
    await qz.print(config, [{
        data: html,
        format: "html",
        type: "pixel",
    }]);
    if (settings.cutPaper) {
        await qz.print(config, [{ data: "\x1DVA0", type: "raw", format: "command" }]).catch(() => undefined);
    }
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
    }, [receipt.id]);

    function updatePrinterSettings(patch: Partial<ReceiptPrinterSettings>) {
        setPrinterSettings((current) => {
            const next = { ...current, ...patch };
            savePrinterSettings(receipt, next);
            return next;
        });
    }

    const handleBrowserPrint = async () => {
        setPrinterMessage("Choose your thermal printer under Destination, then press Print. If Destination is Save as PDF, the browser button will say Save; select your printer to print the receipt.");
        setIsPreparingPrint(true);
        try {
            savePrinterSettings(receipt, printerSettings);
            await Promise.resolve(onPrint());
        } finally {
            setIsPreparingPrint(false);
        }
    };

    const detectPrinters = async () => {
        setPrinterMessage("Detecting thermal printers...");
        try {
            const printers = await qzTrayPrinters();
            setAvailablePrinters(printers);
            setPrinterMessage(printers.length ? "Printers detected. Select your thermal printer and save settings." : "No printers were reported by QZ Tray.");
        } catch (error) {
            setAvailablePrinters([]);
            setPrinterMessage(error instanceof Error ? error.message : "Direct thermal printing is not connected. Use Browser Print or open Printer Settings.");
        }
    };

    const handleDirectPrint = async () => {
        setIsPreparingPrint(true);
        setPrinterMessage("Preparing direct thermal print...");
        try {
            await printDirectlyWithQz(receipt, printerSettings);
            setPrinterMessage("Receipt sent directly to the selected thermal printer.");
        } catch (error) {
            setPrinterMessage(error instanceof Error ? error.message : "Direct thermal printing failed. Use Browser Print or check Printer Settings.");
        } finally {
            setIsPreparingPrint(false);
        }
    };

    const testPrint = async () => {
        setPrinterMessage("Sending test receipt to the selected printer...");
        try {
            await printDirectlyWithQz(receipt, printerSettings);
            setPrinterMessage("Test print sent successfully.");
        } catch (error) {
            setPrinterMessage(error instanceof Error ? error.message : "Test print failed. Use Browser Print or check QZ Tray.");
        }
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
                            Browser print uses your browser Destination. If Destination is <strong>Save as PDF</strong>, the browser button says <strong>Save</strong>. Choose the installed thermal printer under Destination to make it say <strong>Print</strong>.
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            <button type="button" onClick={() => setShowPrinterSettings((value) => !value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-800">
                                Printer Settings
                            </button>
                            <span className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600">Width: {printerSettings.widthMm}mm</span>
                            {printerSettings.preferredPrinterName ? <span className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">Preferred: {printerSettings.preferredPrinterName}</span> : null}
                        </div>
                        {showPrinterSettings ? (
                            <div className="mt-3 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold text-slate-700 md:grid-cols-2 lg:grid-cols-3">
                                <label className="grid gap-1">
                                    <span>Printer method</span>
                                    <select value={printerSettings.method} onChange={(event) => updatePrinterSettings({ method: event.target.value === "qz" ? "qz" : "browser" })} className="h-10 rounded-xl border border-slate-200 bg-white px-3 font-bold">
                                        <option value="browser">Browser print</option>
                                        <option value="qz">QZ Tray direct print</option>
                                    </select>
                                </label>
                                <label className="grid gap-1">
                                    <span>Preferred printer name</span>
                                    <input value={printerSettings.preferredPrinterName} onChange={(event) => updatePrinterSettings({ preferredPrinterName: event.target.value })} className="h-10 rounded-xl border border-slate-200 bg-white px-3 font-bold" placeholder="Thermal printer name" />
                                </label>
                                <label className="grid gap-1">
                                    <span>Receipt width</span>
                                    <select value={printerSettings.widthMm} onChange={(event) => updatePrinterSettings({ widthMm: event.target.value === "58" ? 58 : 80 })} className="h-10 rounded-xl border border-slate-200 bg-white px-3 font-bold">
                                        <option value={80}>80mm</option>
                                        <option value={58}>58mm</option>
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
                                    <button type="button" onClick={() => { savePrinterSettings(receipt, printerSettings); setPrinterMessage("Printer settings saved for this office and browser."); }} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white">Save Printer Settings</button>
                                    <button type="button" onClick={testPrint} className="rounded-xl bg-violet-700 px-3 py-2 text-xs font-black text-white">Test Print</button>
                                    <button type="button" onClick={() => { const defaults = defaultPrinterSettings(); updatePrinterSettings(defaults); setAvailablePrinters([]); setPrinterMessage("Printer settings reset for this office and browser."); }} className="rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-800 ring-1 ring-slate-200">Reset Settings</button>
                                </div>
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
