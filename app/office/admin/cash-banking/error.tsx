"use client";

export default function AdminCashBankingError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    const reference = error.digest ?? "cash-banking-admin";
    return (
        <main className="min-h-screen bg-slate-950 px-4 py-10 text-white">
            <section className="mx-auto max-w-3xl rounded-[28px] border border-red-300/20 bg-red-500/10 p-6 shadow-2xl shadow-black/25">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-red-200">Admin Cash Banking</p>
                <h1 className="mt-3 text-3xl font-black">Cash Banking data could not be loaded.</h1>
                <p className="mt-2 text-sm font-semibold text-red-100">
                    The banking page hit a server data issue. The error has been logged with reference {reference}.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                    <button type="button" onClick={reset} className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-950">
                        Retry
                    </button>
                    <a href="/office/admin" className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-black text-white">
                        Return to Dashboard
                    </a>
                </div>
            </section>
        </main>
    );
}
