import type { TenantReceiptViewModel } from "@/components/office/receipts/TenantPaymentReceipt";

export function isAndroidTabletOrMobile() {
    if (typeof navigator === "undefined") return false;
    return /Android|Mobile|Tablet/i.test(navigator.userAgent || "");
}

export function tabletReceiptPrintUrl(receipt: TenantReceiptViewModel, widthMm: 58 | 80 = 58, profile = "rpp02n58") {
    return `/receipt-print/${encodeURIComponent(receipt.id)}?layout=thermal&width=${widthMm}&profile=${encodeURIComponent(profile)}&job=${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
