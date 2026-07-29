"use client";

import Link from "next/link";

export default function CollectorDefaultersError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
    return (
        <main className="enterprise-page">
            <section className="mx-auto max-w-3xl rounded-[28px] border border-rose-200 bg-white p-6 text-slate-950 shadow-xl">
                <p className="text-xs font-black uppercase tracking-wide text-rose-600">Collector defaulters</p>
                <h1 className="mt-2 text-2xl font-black">Defaulters data could not be loaded.</h1>
                <p className="mt-2 text-sm font-semibold text-slate-600">The selected office or landlord filter may not be authorised for this collector account.</p>
                <div className="mt-5 flex flex-wrap gap-2">
                    <button type="button" onClick={reset} className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-black text-white">Retry</button>
                    <Link href="/office/collector/defaulters" className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-800">Reset Filters</Link>
                    <Link href="/office/collector" className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-800">Return to Dashboard</Link>
                </div>
            </section>
        </main>
    );
}
