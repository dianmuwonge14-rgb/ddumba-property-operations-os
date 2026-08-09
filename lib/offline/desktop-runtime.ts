"use client";

import { createOfflineTransactionUuid } from "./idempotency";
import { readOfflineQueue, writeOfflineQueue } from "./local-queue";
import type { OfflineMutationEnvelope } from "./types";

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

function tauriInvoke(): TauriInvoke | null {
    if (typeof window === "undefined") return null;
    const candidate = (window as unknown as { __TAURI__?: { core?: { invoke?: TauriInvoke } }; __TAURI_INTERNALS__?: { invoke?: TauriInvoke } });
    return candidate.__TAURI__?.core?.invoke ?? candidate.__TAURI_INTERNALS__?.invoke ?? null;
}

export function isDesktopRuntime() {
    return Boolean(tauriInvoke());
}

export async function initializeDesktopOfflineDatabase() {
    const invoke = tauriInvoke();
    if (!invoke) return null;
    return invoke("desktop_init_offline_database");
}

export async function saveDesktopCacheRecords(records: Array<Record<string, unknown>>) {
    const invoke = tauriInvoke();
    if (!invoke) return 0;
    return invoke<number>("desktop_save_cache_records", { records });
}

export async function searchDesktopCache(input: {
    cacheTypes?: string[];
    limit?: number;
    officeId?: string | null;
    query: string;
}) {
    const invoke = tauriInvoke();
    if (!invoke) return [];
    return invoke<Array<Record<string, unknown>>>("desktop_search_cache", {
        cacheTypes: input.cacheTypes ?? ["room", "tenant", "landlord", "defaulter"],
        limit: input.limit ?? 25,
        officeId: input.officeId ?? null,
        query: input.query,
    });
}

export async function bootstrapDesktopWorkspace() {
    const response = await fetch("/api/desktop/bootstrap", {
        cache: "no-store",
        credentials: "include",
    });
    const payload = await response.json();
    if (!response.ok || !payload?.success) {
        throw new Error(payload?.message ?? "Desktop offline workspace could not be prepared.");
    }
    await initializeDesktopOfflineDatabase();
    await saveDesktopCacheRecords(payload.records ?? []);
    return payload;
}

export async function queueOfflineTenantPayment(input: {
    amount: number;
    companyId: string;
    employeeId: string | null;
    officeId: string;
    paymentDate: string;
    paymentMethod: string;
    referenceNumber?: string;
    tenantId: string;
    roomId?: string | null;
    userId: string;
    payload: Record<string, unknown>;
}) {
    const transactionUuid = createOfflineTransactionUuid();
    const localCreatedAt = new Date().toISOString();
    const envelope: OfflineMutationEnvelope = {
        businessDate: input.paymentDate,
        companyId: input.companyId,
        deviceId: localStorage.getItem("ddumba.desktop.device_id") || crypto.randomUUID(),
        employeeId: input.employeeId,
        localCreatedAt,
        officeId: input.officeId,
        payload: {
            ...input.payload,
            amount: input.amount,
            paymentDate: input.paymentDate,
            paymentMethod: input.paymentMethod,
            referenceNumber: input.referenceNumber,
            tenantId: input.tenantId,
        },
        retryCount: 0,
        syncStatus: "waiting_to_sync",
        transactionType: "tenant_payment",
        transactionUuid,
        userId: input.userId,
    };
    localStorage.setItem("ddumba.desktop.device_id", envelope.deviceId);

    const invoke = tauriInvoke();
    if (invoke) {
        const provisional = await invoke<string>("desktop_save_offline_payment", {
            payment: {
                amount: input.amount,
                base_revision: null,
                business_date: input.paymentDate,
                company_id: input.companyId,
                device_id: envelope.deviceId,
                employee_id: input.employeeId,
                local_created_at: localCreatedAt,
                office_id: input.officeId,
                payload: envelope.payload,
                payment_method: input.paymentMethod,
                reference: input.referenceNumber ?? null,
                room_id: input.roomId ?? null,
                tenant_id: input.tenantId,
                transaction_uuid: transactionUuid,
                user_id: input.userId,
            },
        });
        writeOfflineQueue([...readOfflineQueue(), envelope]);
        return { envelope, provisionalReceiptNumber: provisional };
    }

    writeOfflineQueue([...readOfflineQueue(), envelope]);
    return { envelope, provisionalReceiptNumber: `OFFLINE-${transactionUuid.slice(0, 8).toUpperCase()}` };
}

export async function syncPendingOfflineMutations() {
    const queue = readOfflineQueue();
    const pending = queue.filter((item) => item.syncStatus === "waiting_to_sync" || item.syncStatus === "failed");
    if (!pending.length) return { accepted: [], rejected: [] };
    const deviceId = pending[0]?.deviceId ?? localStorage.getItem("ddumba.desktop.device_id") ?? crypto.randomUUID();
    const response = await fetch("/api/desktop/sync", {
        body: JSON.stringify({ deviceId, mutations: pending }),
        cache: "no-store",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        method: "POST",
    });
    const payload = await response.json();
    const acceptedByUuid = new Map<string, string>((payload.accepted ?? []).map((item: { transactionUuid: string; status: string }) => [item.transactionUuid, item.status]));
    const rejectedByUuid = new Map<string, string>((payload.rejected ?? []).map((item: { transactionUuid: string; reason: string }) => [item.transactionUuid, item.reason]));
    writeOfflineQueue(queue.map((item) => {
        const accepted = acceptedByUuid.get(item.transactionUuid);
        if (accepted?.includes("synced")) return { ...item, serverAcknowledgementId: item.serverAcknowledgementId ?? null, syncStatus: "synced", syncedAt: new Date().toISOString() };
        if (accepted === "conflict") return { ...item, syncStatus: "conflict" };
        if (rejectedByUuid.has(item.transactionUuid)) return { ...item, retryCount: item.retryCount + 1, syncStatus: "failed" };
        return item;
    }));
    return payload;
}
