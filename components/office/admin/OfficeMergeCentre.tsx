"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, Archive, Building2, CheckCircle2, GitMerge, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { executeOfficeMerge } from "@/app/actions/office-merge";
import { StatusChip } from "@/components/office/shared/EnterpriseUI";
import { COUNT_TABLES } from "@/lib/office-merge/constants";
import type { OfficeMergeData } from "@/lib/office-merge/types";

type Props = {
    data: OfficeMergeData;
};

const CONFIRMATION = "MERGE OFFICES";

function money(value: number) {
    return `UGX ${Math.round(Number.isFinite(value) ? value : 0).toLocaleString()}`;
}

export default function OfficeMergeCentre({ data }: Props) {
    const [selectedOfficeIds, setSelectedOfficeIds] = useState<string[]>([]);
    const [newOfficeName, setNewOfficeName] = useState("");
    const [reasonNote, setReasonNote] = useState("");
    const [confirmation, setConfirmation] = useState("");
    const [userHandling, setUserHandling] = useState<"reassign" | "disable">("reassign");
    const [message, setMessage] = useState("");
    const [isPending, startTransition] = useTransition();

    const selectedOffices = useMemo(
        () => data.offices.filter((office) => selectedOfficeIds.includes(office.id)),
        [data.offices, selectedOfficeIds],
    );

    const affectedCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const table of COUNT_TABLES) counts[table.key] = 0;
        for (const office of selectedOffices) {
            for (const [key, value] of Object.entries(office.counts)) {
                counts[key] = (counts[key] ?? 0) + Number(value ?? 0);
            }
        }
        return counts;
    }, [selectedOffices]);

    const rentRoll = selectedOffices.reduce((sum, office) => sum + office.rentRoll, 0);
    const canPreview = selectedOffices.length >= 2 && newOfficeName.trim().length > 0;
    const canExecute = canPreview && confirmation.trim().toUpperCase() === CONFIRMATION;

    function toggleOffice(officeId: string) {
        setSelectedOfficeIds((current) => current.includes(officeId) ? current.filter((id) => id !== officeId) : [...current, officeId]);
        setMessage("");
    }

    function reset() {
        setSelectedOfficeIds([]);
        setNewOfficeName("");
        setReasonNote("");
        setConfirmation("");
        setUserHandling("reassign");
        setMessage("Merge preview cancelled. No data was changed.");
    }

    function submitMerge() {
        setMessage("");
        startTransition(async () => {
            try {
                await executeOfficeMerge({
                    sourceOfficeIds: selectedOfficeIds,
                    newOfficeName,
                    reasonNote,
                    confirmation,
                    userHandling,
                    affectedCounts: {
                        ...affectedCounts,
                        rentRoll,
                        sourceOffices: selectedOffices.length,
                    },
                });
                setMessage("Office merge completed. Dashboards and office scopes have been refreshed.");
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Office merge could not be completed.");
            }
        });
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
                                <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-200">Administration &rarr; Office Management</p>
                                <h1 className="text-2xl font-black">Merge Offices</h1>
                                <p className="text-sm font-semibold text-slate-300">Dry-run preview first. Original office history is preserved.</p>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <StatusChip label="Admin only" tone="blue" />
                            <StatusChip label="No merge until confirmed" tone="orange" />
                        </div>
                    </div>
                </section>

                <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
                    <div className="xl:col-span-5">
                        <div className="enterprise-card p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">Step 1</p>
                                    <h2 className="text-lg font-black text-slate-950">Source Offices</h2>
                                </div>
                                <GitMerge className="text-blue-600" size={22} />
                            </div>
                            <div className="mt-3 grid grid-cols-1 gap-2 2xl:grid-cols-2">
                                {data.offices.map((office) => {
                                    const selected = selectedOfficeIds.includes(office.id);
                                    return (
                                        <button
                                            key={office.id}
                                            type="button"
                                            onClick={() => toggleOffice(office.id)}
                                            className={`w-full rounded-2xl border p-3 text-left transition ${selected ? "border-blue-300 bg-blue-50 shadow-lg shadow-blue-500/10" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <p className="text-sm font-black text-slate-950">{office.name}</p>
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
                    </div>

                    <div className="space-y-4 xl:col-span-7">
                        <section className="enterprise-card p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-600">Step 2</p>
                                    <h2 className="text-lg font-black text-slate-950">Merged Office Setup</h2>
                                </div>
                                <Building2 className="text-emerald-600" size={22} />
                            </div>
                            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                                <label className="space-y-1">
                                    <span className="text-xs font-black uppercase tracking-wide text-slate-500">New merged office name</span>
                                    <input value={newOfficeName} onChange={(event) => setNewOfficeName(event.target.value)} placeholder="Entebbe Office" className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-950 outline-none focus:border-blue-400" />
                                </label>
                                <label className="space-y-1">
                                    <span className="text-xs font-black uppercase tracking-wide text-slate-500">Old office users</span>
                                    <select value={userHandling} onChange={(event) => setUserHandling(event.target.value as "reassign" | "disable")} className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-950 outline-none focus:border-blue-400">
                                        <option value="reassign">Reassign users to new office</option>
                                        <option value="disable">Preserve roles as history only</option>
                                    </select>
                                </label>
                                <label className="space-y-1 md:col-span-2">
                                    <span className="text-xs font-black uppercase tracking-wide text-slate-500">Reason / note</span>
                                    <textarea value={reasonNote} onChange={(event) => setReasonNote(event.target.value)} placeholder="Why these offices are being merged..." className="min-h-16 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold text-slate-950 outline-none focus:border-blue-400" />
                                </label>
                            </div>
                        </section>

                        <section className="enterprise-card overflow-hidden">
                            <div className="border-b border-slate-200 p-4">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                    <div>
                                        <p className="text-xs font-black uppercase tracking-[0.2em] text-purple-600">Step 3</p>
                                        <h2 className="text-lg font-black text-slate-950">Live Merge Preview</h2>
                                        <p className="mt-1 text-sm font-semibold text-slate-500">Live counts from selected source offices. No data changes in preview mode.</p>
                                    </div>
                                    <StatusChip label={canPreview ? "Preview ready" : "Select 2+ offices"} tone={canPreview ? "green" : "orange"} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 p-4 xl:grid-cols-5">
                                <Kpi label="Source offices" value={selectedOffices.length.toLocaleString()} />
                                <Kpi label="Landlords" value={(affectedCounts.landlords ?? 0).toLocaleString()} />
                                <Kpi label="Rooms" value={(affectedCounts.rooms ?? 0).toLocaleString()} />
                                <Kpi label="Tenants" value={(affectedCounts.tenants ?? 0).toLocaleString()} />
                                <Kpi label="Rent roll" value={money(rentRoll)} />
                            </div>
                            <div className="px-4 pb-4">
                                <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
                                    <CompactMetric label="New office" value={newOfficeName.trim() || "Not set"} />
                                    <CompactMetric label="Collections" value={(affectedCounts.collections ?? 0).toLocaleString()} />
                                    <CompactMetric label="Expenses" value={(affectedCounts.expenses ?? 0).toLocaleString()} />
                                    <CompactMetric label="Employees" value={(affectedCounts.employees ?? 0).toLocaleString()} />
                                    <CompactMetric label="Payables" value={(affectedCounts.landlordPayables ?? 0).toLocaleString()} />
                                    <CompactMetric label="Payments" value={(affectedCounts.landlordPayments ?? 0).toLocaleString()} />
                                    <CompactMetric label="Daily reports" value={(affectedCounts.dailyReports ?? 0).toLocaleString()} />
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

                        <section className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-4 shadow-xl shadow-amber-500/10">
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="mt-1 shrink-0 text-amber-600" size={20} />
                                <div>
                                    <h2 className="text-lg font-black text-slate-950">Confirmation Warning</h2>
                                    <p className="mt-1 text-sm font-bold leading-6 text-amber-900">
                                        This will move all selected office data into the new office. Original office history will be preserved, but the selected offices will become archived/inactive. Continue?
                                    </p>
                                    <p className="mt-1 text-xs font-semibold text-slate-600">
                                        For dry-run testing, use Cancel Preview. No data changes are made unless the exact phrase is typed and Merge Offices is clicked.
                                    </p>
                                </div>
                            </div>
                            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_auto]">
                                <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={`Type ${CONFIRMATION} to enable final merge`} className="h-12 rounded-2xl border border-amber-200 bg-white px-4 text-sm font-black text-slate-950 outline-none focus:border-amber-400" />
                                <button type="button" onClick={reset} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700">
                                    <XCircle size={16} /> Cancel Preview
                                </button>
                                <button type="button" disabled={!canExecute || isPending} onClick={submitMerge} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300">
                                    {isPending ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                                    Merge Offices
                                </button>
                            </div>
                            {message ? <p className="mt-3 rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-700">{message}</p> : null}
                        </section>
                    </div>
                </section>

                <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <div className="enterprise-card p-4">
                        <div className="flex items-center gap-2">
                            <ShieldCheck className="text-emerald-600" size={20} />
                            <h2 className="text-xl font-black text-slate-950">History Protection</h2>
                        </div>
                        <ul className="mt-3 grid grid-cols-1 gap-2 text-sm font-bold text-slate-600 md:grid-cols-2">
                            <li>Every moved row keeps original office ID and name.</li>
                            <li>Old offices are archived, not deleted.</li>
                            <li>Merge batch and audit rows track admin, timestamp, source offices, target office, and affected counts.</li>
                            <li>Office users cannot access this page or execute the workflow.</li>
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
                        <h2 className="font-black text-orange-900">Preview Warnings</h2>
                        <div className="mt-2 space-y-1 text-xs font-bold text-orange-800">
                            {data.warnings.map((warning) => <p key={warning}>{warning}</p>)}
                        </div>
                    </section>
                ) : null}
            </div>
        </main>
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
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
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
