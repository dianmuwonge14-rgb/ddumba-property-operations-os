"use client";

import { useActionState } from "react";
import { Archive, Eye, GitMerge, RotateCcw, ShieldCheck, TriangleAlert } from "lucide-react";
import { archiveDuplicateRoomAction, restoreArchivedRoomAction, type IntegrityActionState } from "@/app/actions/data-integrity";
import type { DataIntegrityCentreData, IntegrityDuplicateRecord, IntegrityEntityRecord } from "@/lib/data-integrity/types";

const initialState: IntegrityActionState = { ok: false, message: "" };

export default function DataIntegrityCentre({ data }: { data: DataIntegrityCentreData }) {
    const [archiveState, archiveAction, archivePending] = useActionState(archiveDuplicateRoomAction, initialState);
    const [restoreState, restoreAction, restorePending] = useActionState(restoreArchivedRoomAction, initialState);

    return (
        <main className="mx-auto flex w-full max-w-[1800px] flex-col gap-5 px-4 pb-10 text-white">
            <section className="enterprise-dark-panel rounded-[2rem] p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200">Admin Governance</p>
                        <h1 className="mt-2 text-3xl font-black tracking-tight text-white">Data Integrity Centre</h1>
                        <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-300">
                            Review duplicate business records, archive accidental duplicates, restore safe archives, and keep production data auditable.
                        </p>
                    </div>
                    <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm font-black text-emerald-100">
                        Live Supabase · {new Date(data.generatedAt).toLocaleString("en-UG", { timeZone: "Africa/Kampala" })}
                    </div>
                </div>
            </section>

            <section className="grid gap-3 md:grid-cols-4">
                <Kpi title="Duplicate Groups" value={data.summary.duplicateGroups.toString()} tone="blue" />
                <Kpi title="Critical / High" value={data.summary.criticalGroups.toString()} tone={data.summary.criticalGroups ? "red" : "green"} />
                <Kpi title="Archived Duplicates" value={data.summary.archivedDuplicates.toString()} tone="amber" />
                <Kpi title="Orphan Warnings" value={data.summary.orphanWarnings.toString()} tone={data.summary.orphanWarnings ? "red" : "green"} />
            </section>

            {(archiveState.message || restoreState.message) && (
                <div className={`rounded-2xl border px-4 py-3 text-sm font-black ${archiveState.ok || restoreState.ok ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100" : "border-amber-400/30 bg-amber-400/10 text-amber-100"}`}>
                    {archiveState.message || restoreState.message}
                </div>
            )}

            <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] shadow-2xl shadow-black/20">
                <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                    <div>
                        <h2 className="text-lg font-black">Duplicate Records</h2>
                        <p className="text-xs font-semibold text-slate-400">Rooms, landlords, tenants, phones, and possible duplicate payments.</p>
                    </div>
                    <ShieldCheck className="text-cyan-200" size={22} />
                </div>
                {data.duplicates.length === 0 ? (
                    <div className="p-8 text-sm font-bold text-emerald-100">No active duplicate groups found.</div>
                ) : (
                    <div className="divide-y divide-white/10">
                        {data.duplicates.map((duplicate) => (
                            <DuplicateGroup
                                key={duplicate.id}
                                duplicate={duplicate}
                                archiveAction={archiveAction}
                                archivePending={archivePending}
                            />
                        ))}
                    </div>
                )}
            </section>

            <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] shadow-2xl shadow-black/20">
                <div className="border-b border-white/10 px-5 py-4">
                    <h2 className="text-lg font-black">Archived Duplicate Records</h2>
                    <p className="text-xs font-semibold text-slate-400">Preserved records that were removed from active operational calculations.</p>
                </div>
                {data.archivedRecords.length === 0 ? (
                    <div className="p-8 text-sm font-bold text-slate-300">No archived duplicate records yet.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-left text-sm">
                            <thead className="bg-slate-950/70 text-xs uppercase text-slate-400">
                                <tr>
                                    <th className="px-4 py-3">Record</th>
                                    <th className="px-4 py-3">Office</th>
                                    <th className="px-4 py-3">Linked Surviving Record</th>
                                    <th className="px-4 py-3">Archived At</th>
                                    <th className="px-4 py-3">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/10">
                                {data.archivedRecords.map((record) => (
                                    <tr key={record.id}>
                                        <td className="px-4 py-3 font-black text-white">{record.label}</td>
                                        <td className="px-4 py-3 text-slate-300">{record.officeName ?? "Company"}</td>
                                        <td className="px-4 py-3 font-mono text-xs text-cyan-100">{record.duplicateOfId ?? "Not linked"}</td>
                                        <td className="px-4 py-3 text-slate-300">{record.archivedAt ? new Date(record.archivedAt).toLocaleString("en-UG", { timeZone: "Africa/Kampala" }) : "Unknown"}</td>
                                        <td className="px-4 py-3">
                                            <form action={restoreAction} className="flex items-center gap-2">
                                                <input type="hidden" name="roomId" value={record.id} />
                                                <input type="hidden" name="reason" value="Admin restored archived duplicate after review." />
                                                <button disabled={restorePending} className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-black text-white transition hover:bg-white/15 disabled:opacity-50">
                                                    <RotateCcw size={14} />
                                                    Restore
                                                </button>
                                            </form>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </main>
    );
}

function DuplicateGroup({ duplicate, archiveAction, archivePending }: { duplicate: IntegrityDuplicateRecord; archiveAction: (formData: FormData) => void; archivePending: boolean }) {
    const survivor = duplicate.records.find((record) => record.isRecommendedSurvivor) ?? duplicate.records[0];
    const archiveCandidates = duplicate.records.filter((record) => record.id !== survivor?.id && !record.isArchived);

    return (
        <article className="p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-black uppercase ${severityClass(duplicate.severity)}`}>{duplicate.severity}</span>
                        <span className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[11px] font-black uppercase text-slate-200">{duplicate.type.replaceAll("_", " ")}</span>
                    </div>
                    <h3 className="mt-2 text-base font-black text-white">{duplicate.title}</h3>
                    <p className="mt-1 text-xs font-semibold text-slate-400">{duplicate.description}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-black text-white">
                        <Eye size={14} />
                        View
                    </button>
                    <button disabled title="Merge requires manual financial-history review before enabling." className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-slate-400">
                        <GitMerge size={14} />
                        Merge
                    </button>
                </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {duplicate.records.map((record) => (
                    <RecordCard key={record.id} record={record} survivorId={survivor?.id ?? ""} archiveAction={archiveAction} archivePending={archivePending} canArchive={duplicate.type === "room_number" && archiveCandidates.some((candidate) => candidate.id === record.id)} />
                ))}
            </div>
        </article>
    );
}

function RecordCard({ record, survivorId, canArchive, archiveAction, archivePending }: { record: IntegrityEntityRecord; survivorId: string; canArchive: boolean; archiveAction: (formData: FormData) => void; archivePending: boolean }) {
    return (
        <div className={`rounded-2xl border p-4 ${record.isRecommendedSurvivor ? "border-emerald-400/30 bg-emerald-400/10" : "border-white/10 bg-slate-950/45"}`}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="font-black text-white">{record.label}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-400">{record.officeName ?? "Company"} · {record.status ?? "No status"}</p>
                </div>
                {record.isRecommendedSurvivor && <span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-[11px] font-black uppercase text-emerald-100">Survivor</span>}
            </div>
            <div className="mt-3 space-y-1">
                {record.details.map((detail) => <p key={detail} className="text-xs font-semibold text-slate-300">{detail}</p>)}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
                <button className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-black text-white">
                    <Eye size={14} />
                    View
                </button>
                {canArchive ? (
                    <form action={archiveAction}>
                        <input type="hidden" name="duplicateId" value={record.id} />
                        <input type="hidden" name="survivorId" value={survivorId} />
                        <input type="hidden" name="reason" value="Archived duplicate room from Admin Data Integrity Centre." />
                        <button disabled={archivePending} className="inline-flex items-center gap-1 rounded-xl bg-amber-400 px-3 py-2 text-xs font-black text-slate-950 transition hover:bg-amber-300 disabled:opacity-50">
                            <Archive size={14} />
                            Archive Duplicate
                        </button>
                    </form>
                ) : (
                    <button disabled className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-slate-500">
                        <TriangleAlert size={14} />
                        Manual Review
                    </button>
                )}
            </div>
        </div>
    );
}

function Kpi({ title, value, tone }: { title: string; value: string; tone: "blue" | "green" | "amber" | "red" }) {
    const tones = {
        blue: "border-blue-400/25 bg-blue-400/10 text-blue-100",
        green: "border-emerald-400/25 bg-emerald-400/10 text-emerald-100",
        amber: "border-amber-400/25 bg-amber-400/10 text-amber-100",
        red: "border-red-400/25 bg-red-400/10 text-red-100",
    };
    return (
        <div className={`rounded-2xl border p-4 ${tones[tone]}`}>
            <p className="text-xs font-black uppercase tracking-wide opacity-80">{title}</p>
            <p className="mt-2 text-2xl font-black">{value}</p>
        </div>
    );
}

function severityClass(severity: IntegrityDuplicateRecord["severity"]) {
    if (severity === "critical" || severity === "high") return "bg-red-400/15 text-red-100";
    if (severity === "medium") return "bg-amber-400/15 text-amber-100";
    return "bg-blue-400/15 text-blue-100";
}
