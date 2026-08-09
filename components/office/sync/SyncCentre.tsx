"use client";

import { AlertTriangle, CheckCircle2, Clock3, Database, RefreshCw, ShieldCheck, WifiOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { readOfflineQueue, readOfflineSummary } from "@/lib/offline/local-queue";
import { bootstrapDesktopWorkspace, syncPendingOfflineMutations } from "@/lib/offline/desktop-runtime";
import type { OfflineMutationEnvelope, OfflineSyncSummary } from "@/lib/offline/types";

const statusTone: Record<string, string> = {
    conflict: "border-red-300/30 bg-red-400/10 text-red-100",
    failed: "border-amber-300/30 bg-amber-400/10 text-amber-100",
    saved_offline: "border-slate-300/20 bg-slate-500/10 text-slate-100",
    synced: "border-emerald-300/30 bg-emerald-400/10 text-emerald-100",
    syncing: "border-cyan-300/30 bg-cyan-400/10 text-cyan-100",
    waiting_to_sync: "border-blue-300/30 bg-blue-400/10 text-blue-100",
};

function formatDate(value: string | null | undefined) {
    if (!value) return "Not yet";
    return new Intl.DateTimeFormat("en-UG", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Africa/Kampala",
    }).format(new Date(value));
}

export default function SyncCentre() {
    const [queue, setQueue] = useState<OfflineMutationEnvelope[]>([]);
    const [summary, setSummary] = useState<OfflineSyncSummary>(() => readOfflineSummary());
    const [busy, setBusy] = useState<"bootstrap" | "sync" | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    useEffect(() => {
        const refresh = () => {
            setQueue(readOfflineQueue());
            setSummary(readOfflineSummary());
        };
        refresh();
        window.addEventListener("online", refresh);
        window.addEventListener("offline", refresh);
        window.addEventListener("ddumba-offline-queue-changed", refresh);
        return () => {
            window.removeEventListener("online", refresh);
            window.removeEventListener("offline", refresh);
            window.removeEventListener("ddumba-offline-queue-changed", refresh);
        };
    }, []);

    const cards = useMemo(() => [
        { label: "Pending", value: summary.pendingCount, icon: Clock3, tone: "from-blue-500/20 to-cyan-400/10" },
        { label: "Synced", value: summary.syncedCount, icon: CheckCircle2, tone: "from-emerald-500/20 to-teal-400/10" },
        { label: "Failed", value: summary.failedCount, icon: AlertTriangle, tone: "from-amber-500/20 to-orange-400/10" },
        { label: "Conflicts", value: summary.conflictCount, icon: ShieldCheck, tone: "from-red-500/20 to-rose-400/10" },
    ], [summary]);

    async function runBootstrap() {
        setBusy("bootstrap");
        setMessage("Preparing offline workspace...");
        try {
            const result = await bootstrapDesktopWorkspace();
            const progress = (result.progress ?? []).map((item: { label: string; count: number }) => `${item.label}: ${item.count.toLocaleString()}`).join(" · ");
            setMessage(`Offline workspace prepared. ${progress}`);
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Offline workspace could not be prepared.");
        } finally {
            setBusy(null);
        }
    }

    async function retrySync() {
        setBusy("sync");
        setMessage("Syncing pending offline work...");
        try {
            await syncPendingOfflineMutations();
            setMessage("Sync attempt finished. Review any failed or conflict entries below.");
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Offline sync failed.");
        } finally {
            setBusy(null);
        }
    }

    return (
        <main className="mx-auto w-full max-w-[1600px] px-4 py-6 text-white sm:px-6 lg:px-8">
            <section className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 shadow-2xl shadow-black/30 backdrop-blur-2xl sm:p-7">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-200">Desktop Sync Centre</p>
                        <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Offline Work Queue</h1>
                        <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-300">
                            Tracks desktop entries saved while offline, their sync status, conflicts, and the last server contact.
                        </p>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm font-black">
                        {summary.connectionState === "offline" ? <WifiOff size={18} /> : <RefreshCw size={18} />}
                        {summary.connectionState.replaceAll("_", " ").toUpperCase()}
                    </div>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                    <button
                        className="rounded-2xl border border-cyan-200/30 bg-cyan-400/15 px-4 py-2 text-sm font-black text-cyan-50 transition hover:bg-cyan-400/25 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={busy !== null}
                        onClick={runBootstrap}
                        type="button"
                    >
                        {busy === "bootstrap" ? "Preparing..." : "Prepare Offline Workspace"}
                    </button>
                    <button
                        className="rounded-2xl border border-emerald-200/30 bg-emerald-400/15 px-4 py-2 text-sm font-black text-emerald-50 transition hover:bg-emerald-400/25 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={busy !== null || summary.pendingCount === 0}
                        onClick={retrySync}
                        type="button"
                    >
                        {busy === "sync" ? "Syncing..." : "Retry Sync"}
                    </button>
                </div>
                {message ? (
                    <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/55 px-4 py-3 text-sm font-bold text-slate-200">
                        {message}
                    </div>
                ) : null}

                <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {cards.map((card) => {
                        const Icon = card.icon;
                        return (
                            <div key={card.label} className={`rounded-3xl border border-white/10 bg-gradient-to-br ${card.tone} p-4 shadow-xl shadow-black/20`}>
                                <div className="flex items-center justify-between">
                                    <p className="text-xs font-black uppercase text-slate-300">{card.label}</p>
                                    <Icon size={18} className="text-cyan-100" />
                                </div>
                                <p className="mt-3 text-3xl font-black">{card.value}</p>
                            </div>
                        );
                    })}
                </div>

                <div className="mt-6 grid gap-3 md:grid-cols-2">
                    <div className="rounded-3xl border border-white/10 bg-slate-950/50 p-4">
                        <p className="text-xs font-black uppercase text-slate-400">Last successful sync</p>
                        <p className="mt-1 text-lg font-black">{formatDate(summary.lastSuccessfulSync)}</p>
                    </div>
                    <div className="rounded-3xl border border-white/10 bg-slate-950/50 p-4">
                        <p className="text-xs font-black uppercase text-slate-400">Last server contact</p>
                        <p className="mt-1 text-lg font-black">{formatDate(summary.lastServerContact)}</p>
                    </div>
                </div>
            </section>

            <section className="mt-6 rounded-[2rem] border border-white/10 bg-slate-950/55 p-4 shadow-2xl shadow-black/30 sm:p-5">
                <div className="flex items-center gap-2">
                    <Database size={20} className="text-cyan-200" />
                    <h2 className="text-xl font-black">Local Queue</h2>
                </div>
                <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
                    {queue.length === 0 ? (
                        <div className="p-6 text-sm font-semibold text-slate-300">No offline entries are waiting on this device.</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-white/10 text-left text-sm">
                                <thead className="bg-white/[0.04] text-xs uppercase text-slate-400">
                                    <tr>
                                        <th className="px-4 py-3">Type</th>
                                        <th className="px-4 py-3">Business Date</th>
                                        <th className="px-4 py-3">Status</th>
                                        <th className="px-4 py-3">Retries</th>
                                        <th className="px-4 py-3">Reference</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/10">
                                    {queue.map((item) => (
                                        <tr key={item.transactionUuid}>
                                            <td className="px-4 py-3 font-bold">{item.transactionType.replaceAll("_", " ")}</td>
                                            <td className="px-4 py-3 text-slate-300">{item.businessDate}</td>
                                            <td className="px-4 py-3">
                                                <span className={`rounded-full border px-2.5 py-1 text-xs font-black uppercase ${statusTone[item.syncStatus] ?? statusTone.failed}`}>
                                                    {item.syncStatus.replaceAll("_", " ")}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-slate-300">{item.retryCount}</td>
                                            <td className="px-4 py-3 font-mono text-xs text-slate-400">{item.transactionUuid}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </section>
        </main>
    );
}
