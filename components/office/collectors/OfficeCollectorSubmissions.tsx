"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, X } from "lucide-react";
import { decideCollectorMoneySubmission } from "@/app/actions/collectors";

type Submission = Record<string, unknown> & { collectorName?: string };

const money = (value: unknown) => `UGX ${Math.round(Number(value ?? 0)).toLocaleString()}`;

export default function OfficeCollectorSubmissions({ submissions }: { submissions: Submission[] }) {
    const [message, setMessage] = useState("");
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [bulkModal, setBulkModal] = useState<null | { decision: "approved" | "rejected"; ids: string[] }>(null);
    const [isPending, startTransition] = useTransition();
    if (!submissions.length) return null;
    const pendingSubmissions = submissions.filter((submission) => String(submission.status ?? "pending") === "pending");

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

    function openBulk(decision: "approved" | "rejected", ids: string[]) {
        const uniqueIds = Array.from(new Set(ids)).filter(Boolean);
        if (!uniqueIds.length) {
            setMessage("Select at least one pending collector submission first.");
            return;
        }
        setBulkModal({ decision, ids: uniqueIds });
    }

    function runBulk() {
        if (!bulkModal) return;
        startTransition(async () => {
            try {
                for (const submissionId of bulkModal.ids) {
                    await decideCollectorMoneySubmission({ decision: bulkModal.decision, submissionId });
                }
                setSelectedIds([]);
                setBulkModal(null);
                setMessage(`${bulkModal.ids.length} collector submission(s) ${bulkModal.decision}.`);
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Bulk submission review failed.");
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
                {pendingSubmissions.length > 0 ? (
                    <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3">
                        <label className="inline-flex items-center gap-2 text-xs font-black text-cyan-100">
                            <input checked={pendingSubmissions.every((submission) => selectedIds.includes(String(submission.id)))} disabled={isPending} type="checkbox" onChange={(event) => setSelectedIds(event.target.checked ? pendingSubmissions.map((submission) => String(submission.id)) : [])} className="h-4 w-4 rounded border-cyan-200 text-cyan-700" />
                            Select All Pending ({pendingSubmissions.length})
                        </label>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <button type="button" disabled={isPending || selectedIds.length === 0} onClick={() => openBulk("approved", selectedIds)} className="rounded-2xl bg-emerald-300 px-4 py-2 text-xs font-black text-slate-950 disabled:opacity-50">Approve Selected</button>
                            <button type="button" disabled={isPending || selectedIds.length === 0} onClick={() => openBulk("rejected", selectedIds)} className="rounded-2xl bg-red-400 px-4 py-2 text-xs font-black text-white disabled:opacity-50">Reject Selected</button>
                            <button type="button" disabled={isPending} onClick={() => openBulk("approved", pendingSubmissions.map((submission) => String(submission.id)))} className="rounded-2xl border border-emerald-200 bg-white/10 px-4 py-2 text-xs font-black text-emerald-100 disabled:opacity-50">Approve All Pending</button>
                            <button type="button" disabled={isPending} onClick={() => openBulk("rejected", pendingSubmissions.map((submission) => String(submission.id)))} className="rounded-2xl border border-red-200 bg-white/10 px-4 py-2 text-xs font-black text-red-100 disabled:opacity-50">Reject All Pending</button>
                        </div>
                    </div>
                ) : null}
                <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {submissions.map((submission) => (
                        <div key={String(submission.id)} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            {submission.status === "pending" ? (
                                <label className="mb-3 inline-flex items-center gap-2 text-xs font-black text-cyan-100">
                                    <input checked={selectedIds.includes(String(submission.id))} disabled={isPending} type="checkbox" onChange={() => setSelectedIds((current) => current.includes(String(submission.id)) ? current.filter((id) => id !== String(submission.id)) : [...current, String(submission.id)])} className="h-4 w-4 rounded border-cyan-200 text-cyan-700" />
                                    Select submission
                                </label>
                            ) : null}
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
                {bulkModal ? (
                    <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/70 p-4 text-slate-950">
                        <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
                            <h2 className="text-xl font-black">Confirm Bulk {bulkModal.decision === "approved" ? "Approval" : "Rejection"}</h2>
                            <p className="mt-2 text-sm font-semibold text-slate-600">You are about to {bulkModal.decision === "approved" ? "approve" : "reject"} {bulkModal.ids.length} pending requests. Continue?</p>
                            <div className="mt-5 flex flex-wrap justify-end gap-2">
                                <button type="button" disabled={isPending} onClick={() => setBulkModal(null)} className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-700 disabled:opacity-40">Cancel</button>
                                <button type="button" disabled={isPending} onClick={runBulk} className={`rounded-xl px-4 py-2 text-sm font-black text-white disabled:opacity-40 ${bulkModal.decision === "approved" ? "bg-emerald-700" : "bg-red-700"}`}>
                                    {isPending ? "Processing..." : bulkModal.decision === "approved" ? "Approve Requests" : "Reject Requests"}
                                </button>
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>
        </section>
    );
}
