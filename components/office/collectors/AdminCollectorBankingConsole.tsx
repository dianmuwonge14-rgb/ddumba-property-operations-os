"use client";

import type React from "react";
import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Download, Eye, FileImage, Landmark, Loader2, Search, ShieldCheck, X } from "lucide-react";
import { decideCollectorBankingSubmission } from "@/app/actions/collector-banking";

type Row = Record<string, unknown> & {
    collectorName?: string;
    officeName?: string;
    slipSignedUrl?: string | null;
};

type Props = {
    data: {
        canManage?: boolean;
        submissions: Row[];
        totals: Record<string, number>;
    };
};

const money = (value: unknown) => `UGX ${Math.round(Number(value ?? 0)).toLocaleString()}`;

export default function AdminCollectorBankingConsole({ data }: Props) {
    const [query, setQuery] = useState("");
    const [status, setStatus] = useState("all");
    const [selected, setSelected] = useState<Row | null>(null);
    const [message, setMessage] = useState("");
    const filtered = useMemo(() => data.submissions.filter((row) => {
        const haystack = [row.collectorName, row.officeName, row.bank_name, row.deposit_reference, row.amount, row.status, row.banking_date].join(" ").toLowerCase();
        return (status === "all" || String(row.status) === status) && haystack.includes(query.toLowerCase());
    }), [data.submissions, query, status]);

    return (
        <main className="min-h-screen bg-[radial-gradient(circle_at_top_right,#064e3b_0,#020617_34%,#020617_100%)] px-4 py-5 text-white sm:px-6">
            <section className="mx-auto max-w-7xl">
                <div className="rounded-[2rem] border border-emerald-300/20 bg-slate-950/75 p-5 shadow-2xl shadow-black/30 backdrop-blur">
                    <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-200">Admin Treasury Control</p>
                    <h1 className="mt-2 text-[clamp(1.8rem,4vw,3.2rem)] font-black tracking-tight">COLLECTOR BANKING VERIFICATION</h1>
                    <p className="mt-2 max-w-4xl text-sm font-bold leading-6 text-slate-300">Verify collector bank deposits from private slip uploads. Approved records reduce collector cash and increase Money at Bank without passing through office cash.</p>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <Kpi icon={<AlertTriangle size={18} />} label="Pending Verification" value={`${data.totals.pendingCount ?? 0} · ${money(data.totals.pendingAmount)}`} tone="amber" />
                    <Kpi icon={<ShieldCheck size={18} />} label="Verified Banking" value={`${data.totals.verifiedCount ?? 0} · ${money(data.totals.verifiedAmount)}`} tone="green" />
                    <Kpi icon={<X size={18} />} label="Rejected Banking" value={`${data.totals.rejectedCount ?? 0} · ${money(data.totals.rejectedAmount)}`} tone="red" />
                    <Kpi icon={<FileImage size={18} />} label="Bank Deposit Slips" value={`${data.submissions.length.toLocaleString()} records`} tone="cyan" />
                </div>

                <div className="mt-5 rounded-[1.75rem] border border-white/10 bg-slate-950/80 p-4 shadow-xl shadow-black/20">
                    <div className="grid gap-3 md:grid-cols-[1fr_220px]">
                        <label className="min-w-0 text-xs font-black uppercase tracking-wide text-slate-400">Search slips
                            <span className="mt-2 flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900 px-3 py-2">
                                <Search size={16} className="text-cyan-200" />
                                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Collector, amount, date, bank, reference..." className="min-w-0 flex-1 bg-transparent text-sm font-black text-white outline-none placeholder:text-slate-500" />
                            </span>
                        </label>
                        <label className="text-xs font-black uppercase tracking-wide text-slate-400">Status
                            <select value={status} onChange={(event) => setStatus(event.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-3 py-3 text-sm font-black text-white">
                                <option value="all">All statuses</option>
                                <option value="pending_verification">Pending verification</option>
                                <option value="verified">Verified</option>
                                <option value="rejected">Rejected</option>
                                <option value="needs_clearer_image">Needs clearer image</option>
                                <option value="correction_requested">Correction requested</option>
                            </select>
                        </label>
                    </div>
                </div>

                {message ? <p className="mt-4 rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-cyan-100">{message}</p> : null}

                <section className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                    {filtered.length ? filtered.map((row) => <SlipCard canManage={data.canManage !== false} key={String(row.id)} row={row} onSelect={setSelected} onMessage={setMessage} />) : <p className="rounded-3xl border border-white/10 bg-white/5 p-6 text-sm font-bold text-slate-300">No collector banking records match this filter.</p>}
                </section>
            </section>
            {selected ? <SlipModal row={selected} onClose={() => setSelected(null)} /> : null}
        </main>
    );
}

function Kpi({ icon, label, tone, value }: { icon: React.ReactNode; label: string; tone: "amber" | "cyan" | "green" | "red"; value: string }) {
    const tones = {
        amber: "border-amber-300/25 bg-amber-300/10 text-amber-100",
        cyan: "border-cyan-300/25 bg-cyan-300/10 text-cyan-100",
        green: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
        red: "border-red-300/25 bg-red-300/10 text-red-100",
    };
    return <div className={`min-w-0 rounded-3xl border p-4 ${tones[tone]}`}><div className="flex items-center justify-between gap-2">{icon}<span className="text-[10px] font-black uppercase opacity-75">Live</span></div><p className="mt-3 text-xs font-black uppercase tracking-wide opacity-80">{label}</p><p className="mt-2 break-words text-[clamp(1.05rem,3vw,1.45rem)] font-black text-white">{value}</p></div>;
}

function SlipCard({ canManage, onMessage, onSelect, row }: { canManage: boolean; onMessage: (value: string) => void; onSelect: (row: Row) => void; row: Row }) {
    const [reason, setReason] = useState("");
    const [isPending, startTransition] = useTransition();
    const status = String(row.status ?? "pending_verification");
    const canReview = canManage && ["pending_verification", "needs_clearer_image", "correction_requested"].includes(status);
    function decide(decision: "verified" | "rejected" | "needs_clearer_image" | "correction_requested") {
        startTransition(async () => {
            try {
                await decideCollectorBankingSubmission({ decision, reason, submissionId: String(row.id) });
                onMessage(`Collector banking submission ${decision.replace(/_/g, " ")}.`);
            } catch (error) {
                onMessage(error instanceof Error ? error.message : "Banking review failed.");
            }
        });
    }
    return (
        <article className="min-w-0 rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-4 shadow-xl shadow-black/20">
            <div className="flex gap-3">
                <button type="button" onClick={() => onSelect(row)} className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                    {row.slipSignedUrl && String(row.slip_mime_type ?? "").startsWith("image/") ? <img src={row.slipSignedUrl} alt="Deposit slip" className="h-full w-full object-cover" /> : <FileImage className="text-cyan-200" size={28} />}
                </button>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                            <p className="break-words text-base font-black text-white">{row.collectorName ?? "Collector"}</p>
                            <p className="break-words text-xs font-bold text-slate-400">{row.officeName ?? "Office"} · {String(row.banking_date ?? "")}</p>
                        </div>
                        <StatusPill status={status} />
                    </div>
                    <p className="mt-3 text-xl font-black text-emerald-100">{money(row.amount)}</p>
                    <p className="break-words text-xs font-bold text-slate-400">{String(row.bank_name ?? "Bank")} · Ref {String(row.deposit_reference ?? "N/A")}</p>
                </div>
            </div>
            <div className="mt-3 grid gap-2 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs font-bold text-slate-300 sm:grid-cols-2">
                <p>Collector cash before: <span className="text-white">{money(row.cash_before_submission)}</span></p>
                <p>After verification: <span className="text-white">{money(Number(row.cash_before_submission ?? 0) - Number(row.amount ?? 0))}</span></p>
                <p>File: <span className="text-white">{String(row.slip_original_name ?? "Slip")}</span></p>
                <p>Size: <span className="text-white">{Math.round(Number(row.slip_file_size ?? 0) / 1024).toLocaleString()} KB</span></p>
            </div>
            {!canManage ? (
                <p className="mt-3 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs font-black text-cyan-100">Read-Only Manager: you can inspect this banking request but cannot verify, reject, or request changes.</p>
            ) : canReview ? (
                <div className="mt-3 grid gap-2">
                    <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason required for reject/correction requests" className="rounded-2xl border border-white/10 bg-slate-900 px-3 py-3 text-sm font-black text-white outline-none placeholder:text-slate-500" />
                    <div className="grid gap-2 sm:grid-cols-2">
                        <button type="button" disabled={isPending} onClick={() => decide("verified")} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-300 px-4 py-2 text-sm font-black text-slate-950 disabled:opacity-50">{isPending ? <Loader2 className="animate-spin" size={15} /> : <CheckCircle2 size={15} />} Verify</button>
                        <button type="button" disabled={isPending} onClick={() => decide("rejected")} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-400 px-4 py-2 text-sm font-black text-white disabled:opacity-50"><X size={15} /> Reject</button>
                        <button type="button" disabled={isPending} onClick={() => decide("needs_clearer_image")} className="rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-sm font-black text-amber-100 disabled:opacity-50">Request clearer image</button>
                        <button type="button" disabled={isPending} onClick={() => decide("correction_requested")} className="rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-sm font-black text-cyan-100 disabled:opacity-50">Request correction</button>
                    </div>
                </div>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => onSelect(row)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-white"><Eye size={14} /> View full slip</button>
                {row.slipSignedUrl ? <a href={row.slipSignedUrl} download className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-white"><Download size={14} /> Download slip</a> : null}
            </div>
        </article>
    );
}

function StatusPill({ status }: { status: string }) {
    const tone = status === "verified" ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100" : status === "rejected" ? "border-red-300/25 bg-red-300/10 text-red-100" : "border-amber-300/25 bg-amber-300/10 text-amber-100";
    return <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase ${tone}`}>{status.replace(/_/g, " ")}</span>;
}

function SlipModal({ onClose, row }: { onClose: () => void; row: Row }) {
    return (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/80 p-4">
            <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-[1.75rem] border border-white/10 bg-slate-950 p-5 shadow-2xl">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h2 className="text-xl font-black text-white">Bank Deposit Slip</h2>
                        <p className="text-sm font-bold text-slate-400">{row.collectorName} · {money(row.amount)} · {String(row.deposit_reference ?? "")}</p>
                    </div>
                    <button type="button" onClick={onClose} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-black text-white">Close</button>
                </div>
                <div className="mt-4 rounded-2xl border border-white/10 bg-white p-3">
                    {row.slipSignedUrl && String(row.slip_mime_type ?? "").startsWith("image/") ? <img src={row.slipSignedUrl} alt="Full deposit slip" className="mx-auto max-h-[70vh] max-w-full object-contain" /> : row.slipSignedUrl ? <iframe title="Deposit slip PDF" src={row.slipSignedUrl} className="h-[70vh] w-full rounded-xl" /> : <p className="p-8 text-center text-sm font-black text-slate-800">Slip preview is unavailable.</p>}
                </div>
            </div>
        </div>
    );
}
