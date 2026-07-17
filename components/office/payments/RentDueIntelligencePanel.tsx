"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { BrainCircuit, CalendarClock, Loader2, WalletCards } from "lucide-react";

type DueItem = {
    balance: number;
    billingDate: string;
    billingDay: number;
    daysOverdue: number;
    dueBucket: string;
    id: string;
    office: string;
    phone: string;
    room: string;
    tenant: string;
};

function money(value: number) {
    return `UGX ${Math.round(Number(value ?? 0)).toLocaleString()}`;
}

function formatDate(value: string) {
    return new Intl.DateTimeFormat("en-UG", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
}

function bucketClass(bucket: string) {
    if (bucket.includes("today")) return "bg-blue-50 text-blue-800 ring-blue-100";
    if (bucket.includes("1-7")) return "bg-amber-50 text-amber-800 ring-amber-100";
    if (bucket.includes("8-30")) return "bg-orange-50 text-orange-800 ring-orange-100";
    return "bg-rose-50 text-rose-800 ring-rose-100";
}

export default function RentDueIntelligencePanel() {
    const [items, setItems] = useState<DueItem[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [generatedAt, setGeneratedAt] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                setError(null);
                const response = await fetch("/api/billing/due-intelligence", { cache: "no-store" });
                const payload = await response.json();
                if (!response.ok) throw new Error(payload.error ?? "Rent due intelligence could not load.");
                if (!cancelled) {
                    setItems(payload.items ?? []);
                    setGeneratedAt(payload.generatedAt ?? new Date().toISOString());
                }
            } catch (err) {
                if (!cancelled) setError(err instanceof Error ? err.message : "Rent due intelligence could not load.");
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        void load();
        const interval = window.setInterval(load, 180_000);
        return () => {
            cancelled = true;
            window.clearInterval(interval);
        };
    }, []);

    return (
        <section className="mx-auto mt-5 max-w-6xl rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-3">
                    <div className="rounded-2xl bg-slate-950 p-2 text-white">
                        <BrainCircuit size={20} />
                    </div>
                    <div>
                        <h2 className="text-base font-black text-slate-950">Rent Due Intelligence</h2>
                        <p className="text-sm font-semibold text-slate-500">
                            Live sample of tenants whose billing date has arrived and still owe money.
                        </p>
                    </div>
                </div>
                <div className="text-xs font-bold text-slate-500">
                    {loading ? "Refreshing..." : generatedAt ? `Synced ${new Date(generatedAt).toLocaleTimeString("en-UG", { hour: "2-digit", minute: "2-digit" })}` : "Live Supabase"}
                </div>
            </div>

            {error ? <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{error}</p> : null}
            {loading ? (
                <div className="mt-4 flex items-center gap-2 rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-600">
                    <Loader2 className="animate-spin" size={16} />
                    Loading due tenants...
                </div>
            ) : items.length === 0 ? (
                <div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
                    No overdue tenant sample is currently due from the live indexed query.
                </div>
            ) : (
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {items.map((item) => (
                        <a
                            key={item.id}
                            href={`/office/payments?tenant=${item.id}`}
                            className="min-w-0 rounded-2xl border border-slate-100 bg-slate-50 p-3 transition hover:border-blue-200 hover:bg-blue-50"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-black text-slate-950">Room {item.room}</p>
                                    <p className="truncate text-xs font-bold text-slate-600">{item.tenant}</p>
                                    <p className="truncate text-[11px] font-semibold text-slate-500">{item.office}</p>
                                </div>
                                <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black ring-1 ${bucketClass(item.dueBucket)}`}>
                                    {item.dueBucket}
                                </span>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                <Mini icon={<WalletCards size={13} />} label="Balance" value={money(item.balance)} />
                                <Mini icon={<CalendarClock size={13} />} label="Billing" value={formatDate(item.billingDate)} />
                            </div>
                        </a>
                    ))}
                </div>
            )}
        </section>
    );
}

function Mini({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
    return (
        <div className="min-w-0 rounded-xl bg-white p-2">
            <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-slate-400">{icon}{label}</p>
            <p className="mt-1 break-words text-xs font-black text-slate-900">{value}</p>
        </div>
    );
}
