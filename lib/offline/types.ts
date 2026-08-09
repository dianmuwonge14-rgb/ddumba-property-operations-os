export type OfflineConnectionState = "online_synced" | "offline" | "syncing" | "online_pending" | "conflict" | "failed";

export type OfflineMutationStatus =
    | "saved_offline"
    | "waiting_to_sync"
    | "syncing"
    | "synced"
    | "conflict"
    | "failed";

export type OfflineMutationType =
    | "tenant_payment"
    | "security_deposit"
    | "expense_request"
    | "promise"
    | "collection_note";

export type OfflineMutationEnvelope = {
    transactionUuid: string;
    transactionType: OfflineMutationType;
    userId: string;
    employeeId: string | null;
    officeId: string | null;
    companyId: string;
    deviceId: string;
    businessDate: string;
    localCreatedAt: string;
    payload: Record<string, unknown>;
    baseRevision?: string | null;
    syncStatus: OfflineMutationStatus;
    retryCount: number;
    serverAcknowledgementId?: string | null;
    syncedAt?: string | null;
};

export type OfflineDeviceRegistration = {
    deviceId: string;
    deviceName: string;
    appVersion: string;
    platform: string;
    userAgent?: string | null;
};

export type OfflineSyncSummary = {
    connectionState: OfflineConnectionState;
    pendingCount: number;
    syncedCount: number;
    failedCount: number;
    conflictCount: number;
    lastSuccessfulSync: string | null;
    lastServerContact: string | null;
};

export type OfflineSyncPushResult = {
    accepted: Array<{ transactionUuid: string; status: OfflineMutationStatus }>;
    conflicts: Array<{ transactionUuid: string; reason: string }>;
    rejected: Array<{ transactionUuid: string; reason: string }>;
    summary: OfflineSyncSummary;
};

export const OFFLINE_MUTATION_STATUSES: OfflineMutationStatus[] = [
    "saved_offline",
    "waiting_to_sync",
    "syncing",
    "synced",
    "conflict",
    "failed",
];

export const OFFLINE_MUTATION_TYPES: OfflineMutationType[] = [
    "tenant_payment",
    "security_deposit",
    "expense_request",
    "promise",
    "collection_note",
];
