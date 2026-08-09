"use client";

import { Cloud, CloudOff, RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { readOfflineSummary } from "@/lib/offline/local-queue";
import type { OfflineSyncSummary } from "@/lib/offline/types";

function statusCopy(summary: OfflineSyncSummary) {
    if (summary.conflictCount > 0) return { label: "CONFLICT", detail: `${summary.conflictCount} needs review`, tone: "border-red-300/30 bg-red-400/15 text-red-100", icon: TriangleAlert };
    if (summary.failedCount > 0) return { label: "SYNC FAILED", detail: `${summary.failedCount} failed`, tone: "border-amber-300/30 bg-amber-400/15 text-amber-100", icon: TriangleAlert };
    if (summary.connectionState === "offline") return { label: "OFFLINE", detail: `${summary.pendingCount} waiting`, tone: "border-slate-300/20 bg-slate-500/15 text-slate-100", icon: CloudOff };
    if (summary.connectionState === "syncing") return { label: "SYNCING", detail: `${summary.pendingCount} pending`, tone: "border-cyan-300/30 bg-cyan-400/15 text-cyan-100", icon: RefreshCw };
    if (summary.pendingCount > 0) return { label: "ONLINE", detail: `${summary.pendingCount} pending`, tone: "border-blue-300/30 bg-blue-400/15 text-blue-100", icon: Cloud };
    return { label: "ONLINE - SYNCED", detail: "0 pending", tone: "border-emerald-300/30 bg-emerald-400/15 text-emerald-100", icon: Cloud };
}

export default function DesktopSyncStatus() {
    const [summary, setSummary] = useState<OfflineSyncSummary>(() => readOfflineSummary());

    useEffect(() => {
        const refresh = () => setSummary(readOfflineSummary());
        window.addEventListener("online", refresh);
        window.addEventListener("offline", refresh);
        window.addEventListener("ddumba-offline-queue-changed", refresh);
        const timer = window.setInterval(refresh, 30_000);
        return () => {
            window.removeEventListener("online", refresh);
            window.removeEventListener("offline", refresh);
            window.removeEventListener("ddumba-offline-queue-changed", refresh);
            window.clearInterval(timer);
        };
    }, []);

    const copy = useMemo(() => statusCopy(summary), [summary]);
    const Icon = copy.icon;

    return (
        <a
            href="/office/sync-centre"
            className={`mobile-nowrap inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-black uppercase shadow-sm transition hover:scale-[1.02] sm:px-3 sm:text-[11px] ${copy.tone}`}
            title="Open Desktop Sync Centre"
        >
            <Icon className={summary.connectionState === "syncing" ? "shrink-0 animate-spin" : "shrink-0"} size={13} />
            <span>{copy.label}</span>
            <span className="hidden text-[10px] normal-case text-current/75 sm:inline">{copy.detail}</span>
        </a>
    );
}
