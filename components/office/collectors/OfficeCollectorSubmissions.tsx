"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, X } from "lucide-react";
import { decideCollectorMoneySubmission } from "@/app/actions/collectors";

type Submission = Record<string, unknown> & { collectorName?: string };

const money = (value: unknown) => `UGX ${Math.round(Number(value ?? 0)).toLocaleString()}`;

export default function OfficeCollectorSubmissions({ submissions }: { submissions: Submission[] }) {
    const [message, setMessage] = useState("");
    const [isPending, startTransition] = useTransition();
    if (!submissions.length) return null;

    function decide(submissionId: string, decision: "approved" | "rejected") {
        startTransition(async () => {
            try {
                await decideCollectorMoneySubmission({ decision, submissionId });
                setMessage(`Submission ${decision}.`);
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Submission review failed.");
            }
        });
    }

    return (
        <section className="mx-auto mt-5 max-w-7xl px-4">
            <div className="rounded-3xl border border-cyan-300/20 bg-slate-950/80 p-5 text-white shadow-2xl shadow-black/25">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <p className="text-xs font-black uppercase tracking-wide text-cyan-300">Field Collector Receipts</p>
                        <h2 className="mt-1 text-xl font-black">Pending Money Submissions</h2>
                    </div>
                    {isPending ? <Loader2 className="animate-spin text-cyan-300" size={18} /> : null}
                </div>
                {message ? <p className="mt-3 rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-cyan-100">{message}</p> : null}
                <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {submissions.map((submission) => (
                        <div key={String(submission.id)} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="font-black">{submission.collectorName ?? "Collector"}</p>
                                    <p className="text-sm font-bold text-slate-400">{submission.reference ? `Ref ${submission.reference}` : "No reference"} · {String(submission.status ?? "pending")}</p>
                                </div>
                                <p className="text-lg font-black text-emerald-200">{money(submission.amount)}</p>
                            </div>
                            {submission.status === "pending" ? (
                                <div className="mt-4 flex gap-2">
                                    <button type="button" disabled={isPending} onClick={() => decide(String(submission.id), "approved")} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-300 px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-50"><Check size={15} /> Approve receipt</button>
                                    <button type="button" disabled={isPending} onClick={() => decide(String(submission.id), "rejected")} className="inline-flex items-center gap-2 rounded-2xl bg-red-400 px-4 py-2 text-sm font-black text-white disabled:opacity-50"><X size={15} /> Reject</button>
                                </div>
                            ) : null}
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
