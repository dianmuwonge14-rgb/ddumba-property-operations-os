"use client";

import type { OfflineMutationEnvelope, OfflineSyncSummary } from "./types";

const QUEUE_KEY = "ddumba.desktop.offline.queue.v1";
const SUMMARY_KEY = "ddumba.desktop.offline.summary.v1";

function safeParse<T>(value: string | null, fallback: T): T {
    if (!value) return fallback;
    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
}

export function readOfflineQueue(): OfflineMutationEnvelope[] {
    if (typeof window === "undefined") return [];
    return safeParse<OfflineMutationEnvelope[]>(window.localStorage.getItem(QUEUE_KEY), []);
}

export function writeOfflineQueue(queue: OfflineMutationEnvelope[]) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    window.dispatchEvent(new Event("ddumba-offline-queue-changed"));
}

export function readOfflineSummary(): OfflineSyncSummary {
    if (typeof window === "undefined") {
        return {
            connectionState: "online_synced",
            conflictCount: 0,
            failedCount: 0,
            lastServerContact: null,
            lastSuccessfulSync: null,
            pendingCount: 0,
            syncedCount: 0,
        };
    }
    const queue = readOfflineQueue();
    const saved = safeParse<Partial<OfflineSyncSummary>>(window.localStorage.getItem(SUMMARY_KEY), {});
    const pendingCount = queue.filter((item) => item.syncStatus === "saved_offline" || item.syncStatus === "waiting_to_sync" || item.syncStatus === "syncing").length;
    const failedCount = queue.filter((item) => item.syncStatus === "failed").length;
    const conflictCount = queue.filter((item) => item.syncStatus === "conflict").length;
    const syncedCount = queue.filter((item) => item.syncStatus === "synced").length;
    return {
        connectionState: navigator.onLine ? pendingCount ? "online_pending" : "online_synced" : "offline",
        conflictCount,
        failedCount,
        lastServerContact: saved.lastServerContact ?? null,
        lastSuccessfulSync: saved.lastSuccessfulSync ?? null,
        pendingCount,
        syncedCount,
    };
}

export function writeOfflineSummary(summary: OfflineSyncSummary) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SUMMARY_KEY, JSON.stringify(summary));
    window.dispatchEvent(new Event("ddumba-offline-queue-changed"));
}
