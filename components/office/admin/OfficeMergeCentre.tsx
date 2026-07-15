"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, Archive, Building2, CheckCircle2, GitMerge, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { executeOfficeMerge } from "@/app/actions/office-merge";
import { StatusChip } from "@/components/office/shared/EnterpriseUI";
import { COUNT_TABLES } from "@/lib/office-merge/constants";
import type { OfficeMergeData, OfficeMergeSourceOffice } from "@/lib/office-merge/types";

type Props = {
    data: OfficeMergeData;
};

type MergeResult = Awaited<ReturnType<typeof executeOfficeMerge>>;

function money(value: number) {
    return `UGX ${Math.round(Number.isFinite(value) ? value : 0).toLocaleString()}`;
}

function isInactive(status: string) {
    return ["archived", "deleted", "merged", "inactive"].includes(status.toLowerCase());
}

export default function OfficeMergeCentre({ data }: Props) {
    const [sourceOfficeId, setSourceOfficeId] = useState("");
    const [destinationOfficeId, setDestinationOfficeId] = useState("");
    const [reasonNote, setReasonNote] = useState("");
    const [confirmation, setConfirmation] = useState("");
    const [userHandling, setUserHandling] = useState<"reassign" | "disable">("reassign");
    const [showConfirm, setShowConfirm] = useState(false);
    const [message, setMessage] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
    const [mergeResult, setMergeResult] = useState<MergeResult | null>(null);
    const [isPending, startTransition] = useTransition();

    const sourceOffice = useMemo(() => data.offices.find((office) => office.id === sourceOfficeId) ?? null, [data.offices, sourceOfficeId]);
    const destinationOffice = useMemo(() => data.offices.find((office) => office.id === destinationOfficeId) ?? null, [data.offices, destinationOfficeId]);
    const affectedCounts = sourceOffice?.counts ?? {};
    const rentRoll = sourceOffice?.rentRoll ?? 0;

    const validationMessage = useMemo(() => {
        if (!sourceOfficeId) return "Select a source office.";
        if (!destinationOfficeId) return "Select a destination office.";
        if (sourceOfficeId === destinationOfficeId) return "Source and destination cannot be the same.";
        if (!sourceOffice) return "Source office could not be found.";
        if (!destinationOffice) return "Destination office could not be found.";
        if (isInactive(sourceOffice.status)) return "Source office is already inactive, archived, or merged.";
        if (isInactive(destinationOffice.status)) return "Destination office is inactive or merged.";
        return "";
    }, [destinationOffice, destinationOfficeId, sourceOffice, sourceOfficeId]);

    const confirmIsValid = Boolean(sourceOffice && [sourceOffice.name.toUpperCase(), "MERGE"].includes(confirmation.trim().toUpperCase()));
    const canOpenConfirmation = !validationMessage && !isPending;
    const canExecute = canOpenConfirmation && confirmIsValid;

    function openConfirmation() {
        setMessage(null);
        setMergeResult(null);
        if (validationMessage) {
            setMessage({ tone: "error", text: validationMessage });
            return;
        }
        setShowConfirm(true);
    }

    function submitMerge() {
        if (!sourceOffice || !destinationOffice) {
            setMessage({ tone: "error", text: "Select a source and destination office before merging." });
            return;
        }
        setMessage(null);
        startTransition(async () => {
            try {
                const result = await executeOfficeMerge({
                    sourceOfficeId,
                    destinationOfficeId,
                    reasonNote,
                    confirmation,
                    userHandling,
                    affectedCounts: {
                        ...affectedCounts,
                        rentRoll,
                        sourceOffices: 1,
                    },
                });
                setMergeResult(result);
                setShowConfirm(false);
                setMessage({ tone: "success", text: "Office merge completed successfully." });
            } catch (error) {
                setMessage({ tone: "error", text: error instanceof Error ? error.message : "Office merge failed. No records were changed." });
            }
        });
    }

    function reset() {
        setSourceOfficeId("");
        setDestinationOfficeId("");
        setReasonNote("");
        setConfirmation("");
        setUserHandling("reassign");
        setShowConfirm(false);
        setMergeResult(null);
        setMessage({ tone: "info", text: "Merge selection cleared. No data was changed." });
    }

    return (
        <main className="enterprise-page">
            <div className="enterprise-shell space-y-4">
                <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/88 p-4 text-white shadow-2xl shadow-black/30 backdrop-blur-xl">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-center gap-3">
                            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 shadow-lg shadow-cyan-500/20">
                                <GitMerge size={22} />
                            </div>
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-200">Administration &rarr; Office Merge</p>
                                <h1 className="text-2xl font-black">Merge One Office Into Another</h1>
                                <p className="text-sm font-semibold text-slate-300">Choose the source office to move and the destination office that remains active.</p>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <StatusChip label="Admin only" tone="blue" />
                            <StatusChip label="Transactional RPC" tone="green" />
                            <StatusChip label="History preserved" tone="orange" />
                        </div>
                    </div>
                </section>

                <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
                    <div className="space-y-4 xl:col-span-5">
                        <OfficeSelectCard
                            label="Source office"
                            eyebrow="Step 1"
                            description="This office will be moved, deactivated, and preserved in merge history."
                            offices={data.offices}
                            value={sourceOfficeId}
                            onChange={(value) => {
                                setSourceOfficeId(value);
                                setMessage(null);
                                setMergeResult(null);
                            }}
                            disabledId={destinationOfficeId}
                            tone="blue"
                        />
                        <OfficeSelectCard
                            label="Destination office"
                            eyebrow="Step 2"
                            description="This office remains active and receives the source office's data."
                            offices={data.offices}
                            value={destinationOfficeId}
                            onChange={(value) => {
                                setDestinationOfficeId(value);
                                setMessage(null);
                                setMergeResult(null);
                            }}
                            disabledId={sourceOfficeId}
                            tone="emerald"
                        />
                    </div>

                    <div className="space-y-4 xl:col-span-7">
                        <section className="enterprise-card p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs font-black uppercase tracking-[0.2em] text-purple-600">Step 3</p>
                                    <h2 className="text-lg font-black text-slate-950">Merge Controls</h2>
                                </div>
                                <Building2 className="text-purple-600" size={22} />
                            </div>
                            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                                <label className="space-y-1">
                                    <span className="text-xs font-black uppercase tracking-wide text-slate-500">Source office users</span>
                                    <select value={userHandling} onChange={(event) => setUserHandling(event.target.value as "reassign" | "disable")} className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-950 outline-none focus:border-blue-400">
                                        <option value="reassign">Move active accounts to destination</option>
                                        <option value="disable">Preserve source account assignments as history</option>
                                    </select>
                                </label>
                                <label className="space-y-1">
                                    <span className="text-xs font-black uppercase tracking-wide text-slate-500">Confirmation phrase</span>
                                    <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={sourceOffice ? `Type ${sourceOffice.name} or MERGE` : "Select source office first"} className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-950 outline-none focus:border-blue-400" />
                                </label>
                                <label className="space-y-1 md:col-span-2">
                                    <span className="text-xs font-black uppercase tracking-wide text-slate-500">Reason / note</span>
                                    <textarea value={reasonNote} onChange={(event) => setReasonNote(event.target.value)} placeholder="Why this office is being merged..." className="min-h-16 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold text-slate-950 outline-none focus:border-blue-400" />
                                </label>
                            </div>
                            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                                <button type="button" onClick={reset} disabled={isPending} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 disabled:opacity-50">
                                    <XCircle size={16} /> Clear Selection
                                </button>
                                <button type="button" onClick={openConfirmation} disabled={!canOpenConfirmation} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-lg shadow-slate-300 disabled:cursor-not-allowed disabled:bg-slate-300">
                                    <GitMerge size={16} /> Merge Office
                                </button>
                            </div>
                            {validationMessage ? <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-black text-amber-800">{validationMessage}</p> : null}
                            {message ? <Message tone={message.tone} text={message.text} /> : null}
                        </section>

                        <section className="enterprise-card overflow-hidden">
                            <div className="border-b border-slate-200 p-4">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                    <div>
                                        <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-600">Live impact preview</p>
                                        <h2 className="text-lg font-black text-slate-950">{sourceOffice ? `${sourceOffice.name} records to move` : "Select a source office"}</h2>
                                        <p className="mt-1 text-sm font-semibold text-slate-500">Counts are loaded from Supabase and shown before the transaction runs.</p>
                                    </div>
                                    <StatusChip label={sourceOffice && destinationOffice ? "Ready for review" : "Selection required"} tone={sourceOffice && destinationOffice ? "green" : "orange"} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 p-4 xl:grid-cols-5">
                                <Kpi label="Source offices" value={sourceOffice ? "1" : "0"} />
                                <Kpi label="Landlords" value={(affectedCounts.landlords ?? 0).toLocaleString()} />
                                <Kpi label="Rooms" value={(affectedCounts.rooms ?? 0).toLocaleString()} />
                                <Kpi label="Tenants" value={(affectedCounts.tenants ?? 0).toLocaleString()} />
                                <Kpi label="Rent roll" value={money(rentRoll)} />
                            </div>
                            <div className="px-4 pb-4">
                                <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
                                    <CompactMetric label="Destination" value={destinationOffice?.name ?? "Not selected"} />
                                    <CompactMetric label="Payments" value={(affectedCounts.payments ?? 0).toLocaleString()} />
                                    <CompactMetric label="Collections" value={(affectedCounts.collections ?? 0).toLocaleString()} />
                                    <CompactMetric label="Expenses" value={(affectedCounts.expenses ?? 0).toLocaleString()} />
                                    <CompactMetric label="Receipts" value={(affectedCounts.receipts ?? 0).toLocaleString()} />
                                    <CompactMetric label="Cash movements" value={(affectedCounts.cashMovements ?? 0).toLocaleString()} />
                                    <CompactMetric label="Office accounts" value={(affectedCounts.officeUsers ?? 0).toLocaleString()} />
                                    <CompactMetric label="Audit logs" value={(affectedCounts.auditLogs ?? 0).toLocaleString()} />
                                </div>
                            </div>
                            <details className="border-t border-slate-200 px-4 py-3">
                                <summary className="cursor-pointer text-sm font-black text-slate-700">View all affected record groups</summary>
                                <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
                                    {COUNT_TABLES.map((item) => (
                                        <CompactMetric key={item.key} label={item.label} value={(affectedCounts[item.key] ?? 0).toLocaleString()} />
                                    ))}
                                </div>
                            </details>
                        </section>
                    </div>
                </section>

                {mergeResult ? <SuccessPanel result={mergeResult} /> : null}

                <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <div className="enterprise-card p-4">
                        <div className="flex items-center gap-2">
                            <ShieldCheck className="text-emerald-600" size={20} />
                            <h2 className="text-xl font-black text-slate-950">History Protection</h2>
                        </div>
                        <ul className="mt-3 grid grid-cols-1 gap-2 text-sm font-bold text-slate-600 md:grid-cols-2">
                            <li>Financial and operating rows are reassigned by one server-side transaction.</li>
                            <li>The source office is marked merged, not deleted.</li>
                            <li>Merge batch and audit rows track admin, timestamp, source, destination, and affected counts.</li>
                            <li>Company totals should remain unchanged because records are moved, not duplicated.</li>
                        </ul>
                    </div>
                    <div className="enterprise-card p-4">
                        <div className="flex items-center gap-2">
                            <Archive className="text-blue-600" size={20} />
                            <h2 className="text-xl font-black text-slate-950">Recent Merge Batches</h2>
                        </div>
                        <div className="mt-3 space-y-2">
                            {data.history.length === 0 ? (
                                <p className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-500">No office merge batches recorded yet.</p>
                            ) : data.history.map((batch) => (
                                <div key={batch.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="font-black text-slate-950">{batch.newOfficeName}</p>
                                        <StatusChip label={batch.status} tone={batch.status === "completed" ? "green" : batch.status === "failed" ? "red" : "orange"} />
                                    </div>
                                    <p className="mt-1 text-xs font-bold text-slate-500">{batch.sourceOfficeNames.join(", ") || "Source offices not recorded"}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {data.warnings.length > 0 ? (
                    <section className="mt-5 rounded-[2rem] border border-orange-200 bg-orange-50 p-5">
                        <h2 className="font-black text-orange-900">Live Data Warnings</h2>
                        <div className="mt-2 space-y-1 text-xs font-bold text-orange-800">
                            {data.warnings.slice(0, 12).map((warning) => <p key={warning}>{warning}</p>)}
                            {data.warnings.length > 12 ? <p>+ {data.warnings.length - 12} more schema/count warnings.</p> : null}
                        </div>
                    </section>
                ) : null}
            </div>

            {showConfirm && sourceOffice && destinationOffice ? (
                <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/70 p-4 backdrop-blur-sm" onClick={(event) => event.target === event.currentTarget && !isPending ? setShowConfirm(false) : null}>
                    <section className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] border border-white/20 bg-white p-5 shadow-2xl">
                        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.2em] text-red-600">Final confirmation</p>
                                <h2 className="text-2xl font-black text-slate-950">Merge {sourceOffice.name} into {destinationOffice.name}?</h2>
                                <p className="mt-1 text-sm font-bold text-slate-500">This will send one server request and run the merge inside a database transaction.</p>
                            </div>
                            <button type="button" onClick={() => setShowConfirm(false)} disabled={isPending} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 disabled:opacity-50">
                                <XCircle size={16} /> Cancel
                            </button>
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
                            <ConfirmCard title="Source office" value={sourceOffice.name} tone="orange" />
                            <ConfirmCard title="Destination office" value={destinationOffice.name} tone="green" />
                            <ConfirmCard title="Source status after merge" value="merged / hidden from active selectors" tone="blue" />
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
                            {COUNT_TABLES.map((item) => <CompactMetric key={item.key} label={item.label} value={(affectedCounts[item.key] ?? 0).toLocaleString()} />)}
                        </div>
                        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                            <div className="flex gap-3">
                                <AlertTriangle className="mt-1 shrink-0 text-amber-600" size={20} />
                                <div className="text-sm font-bold leading-6 text-amber-900">
                                    <p>Confirm only after reviewing account assignments, pending approvals, and possible duplicate room/property relationships.</p>
                                    <p className="mt-1">Type <span className="font-black">{sourceOffice.name}</span> or <span className="font-black">MERGE</span> to unlock the final button.</p>
                                </div>
                            </div>
                        </div>
                        {message?.tone === "error" ? <Message tone={message.tone} text={message.text} /> : null}
                        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                            <button type="button" onClick={() => setShowConfirm(false)} disabled={isPending} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 disabled:opacity-50">
                                Cancel
                            </button>
                            <button type="button" onClick={submitMerge} disabled={!canExecute || isPending} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-emerald-200 disabled:cursor-not-allowed disabled:bg-slate-300">
                                {isPending ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                                {isPending ? "Merging offices..." : "Confirm Office Merge"}
                            </button>
                        </div>
                    </section>
                </div>
            ) : null}
        </main>
    );
}

function OfficeSelectCard({ label, eyebrow, description, offices, value, onChange, disabledId, tone }: {
    label: string;
    eyebrow: string;
    description: string;
    offices: OfficeMergeSourceOffice[];
    value: string;
    onChange: (value: string) => void;
    disabledId?: string;
    tone: "blue" | "emerald";
}) {
    return (
        <div className="enterprise-card p-4">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <p className={`text-xs font-black uppercase tracking-[0.2em] ${tone === "blue" ? "text-blue-600" : "text-emerald-600"}`}>{eyebrow}</p>
                    <h2 className="text-lg font-black text-slate-950">{label}</h2>
                    <p className="mt-1 text-xs font-bold text-slate-500">{description}</p>
                </div>
                <GitMerge className={tone === "blue" ? "text-blue-600" : "text-emerald-600"} size={22} />
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2">
                {offices.map((office) => {
                    const selected = value === office.id;
                    const disabled = disabledId === office.id || isInactive(office.status);
                    return (
                        <button
                            key={office.id}
                            type="button"
                            onClick={() => !disabled && onChange(office.id)}
                            disabled={disabled}
                            className={`w-full rounded-2xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${selected ? "border-blue-300 bg-blue-50 shadow-lg shadow-blue-500/10" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                        >
                            <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="break-words text-sm font-black text-slate-950">{office.name}</p>
                                    <p className="text-xs font-bold text-slate-500">{money(office.rentRoll)} rent roll</p>
                                </div>
                                <StatusChip label={selected ? "selected" : office.status} tone={selected ? "blue" : office.status === "active" ? "green" : "slate"} />
                            </div>
                            <div className="mt-2 grid grid-cols-3 gap-1.5 text-xs font-black text-slate-600">
                                <Mini label="Landlords" value={office.counts.landlords ?? 0} />
                                <Mini label="Rooms" value={office.counts.rooms ?? 0} />
                                <Mini label="Tenants" value={office.counts.tenants ?? 0} />
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function SuccessPanel({ result }: { result: MergeResult }) {
    return (
        <section className="rounded-[2rem] border border-emerald-200 bg-emerald-50 p-5 shadow-xl shadow-emerald-500/10">
            <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-1 shrink-0 text-emerald-700" size={24} />
                <div className="min-w-0">
                    <h2 className="text-xl font-black text-slate-950">Office merge completed successfully.</h2>
                    <p className="mt-1 text-sm font-bold text-emerald-900">Reference {result.mergeReference} · {result.sourceOfficeName} merged into {result.destinationOfficeName}</p>
                    <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-4">
                        <CompactMetric label="Source status" value={result.sourceStatus} />
                        <CompactMetric label="Accounts reassigned" value={result.accountsReassigned.toLocaleString()} />
                        <CompactMetric label="Merge date" value={new Date(result.mergedAt).toLocaleString()} />
                        <CompactMetric label="Batch ID" value={result.batchId} />
                    </div>
                </div>
            </div>
        </section>
    );
}

function Message({ tone, text }: { tone: "success" | "error" | "info"; text: string }) {
    const cls = tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : tone === "error" ? "border-red-200 bg-red-50 text-red-900" : "border-blue-200 bg-blue-50 text-blue-900";
    return <p className={`mt-3 rounded-2xl border px-4 py-3 text-sm font-black ${cls}`}>{text}</p>;
}

function ConfirmCard({ title, value, tone }: { title: string; value: string; tone: "orange" | "green" | "blue" }) {
    const cls = tone === "orange" ? "border-orange-200 bg-orange-50 text-orange-900" : tone === "green" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-blue-200 bg-blue-50 text-blue-900";
    return (
        <div className={`rounded-2xl border p-4 ${cls}`}>
            <p className="text-[10px] font-black uppercase tracking-wide opacity-70">{title}</p>
            <p className="mt-1 break-words text-base font-black">{value}</p>
        </div>
    );
}

function Kpi({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-3">
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 break-words text-xl font-black text-slate-950">{value}</p>
        </div>
    );
}

function CompactMetric({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-0.5 break-words text-sm font-black text-slate-950">{value}</p>
        </div>
    );
}

function Mini({ label, value }: { label: string; value: number }) {
    return (
        <div className="rounded-xl bg-white px-2 py-2 text-center">
            <p className="text-[10px] uppercase text-slate-400">{label}</p>
            <p className="text-sm text-slate-950">{value.toLocaleString()}</p>
        </div>
    );
}
