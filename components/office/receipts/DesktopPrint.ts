import type { TenantReceiptViewModel } from "@/components/office/receipts/TenantPaymentReceipt";

export function isDesktopOperatingSystem() {
    if (typeof navigator === "undefined") return true;
    const userAgent = navigator.userAgent || "";
    const platform = navigator.platform || "";
    if (/Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(userAgent)) return false;
    return /Win|Mac|Linux|X11/i.test(platform) || /Windows NT|Macintosh|Linux/i.test(userAgent);
}

export function desktopReceiptPrintUrl(receipt: TenantReceiptViewModel) {
    return `/receipt-print/${encodeURIComponent(receipt.id)}?layout=a4&autoprint=1&job=${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
