export type TenantPaymentMethodBucket = "cash" | "bank" | "mobile_money" | "other";

export function paymentMethodBucket(value: unknown): TenantPaymentMethodBucket {
    const normalized = String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
    if (!normalized) return "cash";
    if (normalized.includes("mobile") || normalized.includes("momo") || normalized.includes("airtel") || normalized.includes("mtn")) return "mobile_money";
    if (normalized.includes("bank") || normalized.includes("transfer") || normalized.includes("deposit")) return "bank";
    if (normalized.includes("cash")) return "cash";
    return "other";
}

export function isPhysicalCashPaymentMethod(value: unknown) {
    return paymentMethodBucket(value) === "cash";
}

export function displayPaymentMethod(value: unknown) {
    const bucket = paymentMethodBucket(value);
    if (bucket === "mobile_money") return "Mobile Money";
    if (bucket === "bank") return "Bank";
    if (bucket === "cash") return "Cash";
    return String(value ?? "Payment").trim() || "Payment";
}
