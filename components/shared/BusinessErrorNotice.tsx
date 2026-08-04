"use client";

import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";
import type { StructuredBusinessError } from "@/lib/errors/business-errors";

export function BusinessErrorNotice({
    actionLabel = "Retry",
    context = "System",
    detail,
    error,
    reset,
    returnHref = "/office",
}: {
    actionLabel?: string;
    context?: string;
    detail?: string;
    error: StructuredBusinessError;
    reset?: () => void;
    returnHref?: string;
}) {
    return (
        <main className="min-h-screen bg-slate-100 p-4 text-slate-950 sm:p-6">
            <section className="mx-auto max-w-3xl rounded-[28px] border border-red-100 bg-white p-6 shadow-2xl shadow-slate-950/10">
                <div className="flex items-start gap-4">
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-red-100 text-red-700">
                        <AlertTriangle size={22} />
                    </span>
                    <div className="min-w-0">
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-red-600">{context}</p>
                        <h1 className="mt-2 text-2xl font-black">This action could not be completed.</h1>
                        <p className="mt-2 text-sm font-bold leading-6 text-slate-700">{error.message}</p>
                        {detail ? <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">{detail}</p> : null}
                        <p className="mt-4 break-words rounded-2xl bg-slate-100 px-4 py-3 text-xs font-black uppercase tracking-wide text-slate-600">
                            Code: {error.code}{error.reference ? ` · ${error.reference}` : ""}
                        </p>
                    </div>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                    {reset ? (
                        <button type="button" onClick={reset} className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2 text-sm font-black text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300">
                            <RefreshCw size={16} /> {actionLabel}
                        </button>
                    ) : null}
                    <Link href={returnHref} className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 hover:border-slate-950">
                        Return
                    </Link>
                </div>
            </section>
        </main>
    );
}
