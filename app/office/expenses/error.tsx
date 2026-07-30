"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";

export default function ExpensesError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    const referenceId = useMemo(() => error.digest ?? "expenses-load", [error.digest]);

    useEffect(() => {
        console.error("Expenses data could not be loaded", { referenceId });
    }, [referenceId]);

    return (
        <main className="min-h-screen bg-slate-100 p-6">
            <section className="mx-auto max-w-3xl rounded-[28px] border border-white/70 bg-white p-6 shadow-2xl shadow-slate-950/15">
                <p className="text-xs font-black uppercase tracking-wide text-red-600">Expenses</p>
                <h1 className="mt-2 text-2xl font-black text-slate-950">Expense data could not be loaded.</h1>
                <p className="mt-2 text-sm font-semibold text-slate-600">
                    The request failed before the Expenses page finished loading. Retry, or return to the dashboard while the diagnostic reference is checked.
                </p>
                <p className="mt-4 rounded-2xl bg-slate-100 px-4 py-3 text-xs font-black text-slate-600">Reference: {referenceId}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                    <button type="button" onClick={reset} className="rounded-2xl bg-blue-700 px-4 py-2 text-sm font-black text-white">Retry</button>
                    <Link href="/office/dashboard" className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700">Return to Dashboard</Link>
                </div>
            </section>
        </main>
    );
}
