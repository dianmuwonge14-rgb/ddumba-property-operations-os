"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function CashPositionError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    const referenceId = useMemo(() => error.digest ?? `cash-${Date.now().toString(36)}`, [error.digest]);

    useEffect(() => {
        console.error("Cash Position data could not be loaded", { referenceId });
    }, [referenceId]);

    return (
        <main className="min-h-screen bg-[#030712] px-4 py-8 text-white">
            <section className="mx-auto max-w-3xl rounded-[30px] border border-red-300/20 bg-red-400/10 p-6 shadow-2xl shadow-black/30">
                <div className="flex items-start gap-4">
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-red-300 text-slate-950">
                        <AlertTriangle size={22} />
                    </span>
                    <div className="min-w-0">
                        <p className="text-xs font-black uppercase tracking-[0.22em] text-red-100">Cash Position Centre</p>
                        <h1 className="mt-2 text-2xl font-black">Cash Position data could not be loaded.</h1>
                        <p className="mt-2 text-sm font-semibold leading-6 text-red-50">
                            The page hit a protected data-loading error. Retry the live request, or return to Dashboard while Admin reviews the error reference.
                        </p>
                        <p className="mt-3 break-words rounded-2xl border border-white/10 bg-slate-950/55 px-3 py-2 text-xs font-black uppercase tracking-wide text-slate-300">
                            Error reference ID: {referenceId}
                        </p>
                    </div>
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                    <button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-2xl bg-red-200 px-4 py-3 text-sm font-black text-slate-950 hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-red-100">
                        <RefreshCw size={16} /> Retry
                    </button>
                    <Link href="/office" className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-black text-white hover:bg-white hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-white">
                        Return to Dashboard
                    </Link>
                </div>
            </section>
        </main>
    );
}
