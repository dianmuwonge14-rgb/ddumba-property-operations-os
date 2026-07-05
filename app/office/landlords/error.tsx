"use client";

import { useEffect } from "react";

export default function LandlordsError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error("Landlords page failed to load", error);
    }, [error]);

    return (
        <main className="enterprise-page">
            <div className="enterprise-shell">
                <section className="enterprise-panel border-red-200 bg-white p-6">
                    <p className="text-xs font-black uppercase tracking-wide text-red-600">Landlords page recovery</p>
                    <h1 className="mt-2 text-2xl font-black text-slate-950">Landlords could not load safely.</h1>
                    <p className="mt-2 max-w-2xl text-sm font-semibold text-slate-600">
                        The page stopped before rendering all data. This usually means a failed data request or interrupted development chunk.
                        Retry the page after the server finishes refreshing.
                    </p>
                    <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-800">
                        {error.message || "Unknown loading error"}
                    </div>
                    <button
                        type="button"
                        onClick={reset}
                        className="mt-5 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-blue-700"
                    >
                        Retry Landlords
                    </button>
                </section>
            </div>
        </main>
    );
}
