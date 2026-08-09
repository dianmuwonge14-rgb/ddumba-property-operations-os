const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidOfflineTransactionUuid(value: unknown): value is string {
    return typeof value === "string" && UUID_PATTERN.test(value.trim());
}

export function normalizeOfflineTransactionUuid(value: unknown) {
    if (!isValidOfflineTransactionUuid(value)) return null;
    return value.trim().toLowerCase();
}

export function createOfflineTransactionUuid() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    throw new Error("Secure UUID generation is unavailable on this device.");
}

export function offlineIdempotencyKey(companyId: string, transactionUuid: string) {
    const normalized = normalizeOfflineTransactionUuid(transactionUuid);
    if (!normalized) throw new Error("Offline transaction UUID is invalid.");
    return `offline:${companyId}:${normalized}`;
}
