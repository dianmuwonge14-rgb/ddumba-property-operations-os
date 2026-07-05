"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, RotateCcw, ShieldCheck } from "lucide-react";
import { bulkReassignLandlordRooms, markLandlordAssignmentReviewed, reassignLandlordRoom } from "@/app/actions/landlord-assignment-audit";
import { EmptyState, StatusChip } from "@/components/office/shared/EnterpriseUI";
import type { LandlordAssignmentAudit, LandlordAssignmentIssue } from "@/lib/admin-centre/types";

type Props = {
    audit: LandlordAssignmentAudit;
};

function money(value: number) {
    return `UGX ${Math.round(value).toLocaleString()}`;
}

export default function LandlordAssignmentAuditCentre({ audit }: Props) {
    const router = useRouter();
    const [selectedIssueIds, setSelectedIssueIds] = useState<string[]>([]);
    const [landlordId, setLandlordId] = useState("");
    const [filter, setFilter] = useState("open");
    const [note, setNote] = useState("");
    const [message, setMessage] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    const visibleIssues = useMemo(() => audit.issues.filter((issue) => {
        if (filter === "reviewed") return issue.reviewed;
        if (filter === "critical") return issue.severity === "critical";
        if (filter === "missing") return issue.reasons.some((reason) => reason.toLowerCase().includes("missing landlord"));
        if (filter === "mismatch") return issue.reasons.some((reason) => reason.toLowerCase().includes("property landlord"));
        return !issue.reviewed;
    }), [audit.issues, filter]);
    const selectedRoomIds = visibleIssues.filter((issue) => selectedIssueIds.includes(issue.id)).map((issue) => issue.roomId);

    function toggle(issueId: string) {
        setSelectedIssueIds((current) => current.includes(issueId) ? current.filter((id) => id !== issueId) : [...current, issueId]);
    }

    function run(action: () => Promise<unknown>, success: string) {
        startTransition(async () => {
            try {
                setMessage(null);
                await action();
                setMessage(success);
                setSelectedIssueIds([]);
                router.refresh();
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Action failed.");
            }
        });
    }

    function bulkReassign() {
        if (!landlordId) {
            setMessage("Select the correct landlord before bulk reassignment.");
            return;
        }
        if (!selectedRoomIds.length) {
            setMessage("Select at least one suspicious room.");
            return;
        }
        run(() => bulkReassignLandlordRooms({ roomIds: selectedRoomIds, landlordId, note }), `${selectedRoomIds.length} room assignment(s) updated.`);
    }

    return (
        <section id="landlord-assignment-audit" className="enterprise-panel overflow-hidden">
            <div className="border-b border-slate-200 p-6">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="flex items-start gap-3">
                        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-50 text-amber-700">
                            <AlertTriangle size={22} />
                        </span>
                        <div>
                            <h2 className="text-xl font-black">Landlord Assignment Audit</h2>
                            <p className="text-sm text-slate-500">
                                Reviews room-landlord, property-landlord, tenant-room, and location consistency using live Supabase data.
                            </p>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                        <AuditMini label="Suspicious" value={audit.totals.suspicious.toString()} />
                        <AuditMini label="Critical" value={audit.totals.critical.toString()} tone="text-red-700" />
                        <AuditMini label="Missing" value={audit.totals.missingLandlord.toString()} tone="text-orange-700" />
                        <AuditMini label="Mismatch" value={audit.totals.propertyMismatch.toString()} tone="text-blue-700" />
                        <AuditMini label="Reviewed" value={audit.totals.reviewed.toString()} tone="text-emerald-700" />
                    </div>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-3 xl:grid-cols-12">
                    <select value={filter} onChange={(event) => setFilter(event.target.value)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold xl:col-span-2">
                        <option value="open">Open issues</option>
                        <option value="critical">Critical</option>
                        <option value="missing">Missing landlord</option>
                        <option value="mismatch">Property mismatch</option>
                        <option value="reviewed">Reviewed</option>
                    </select>
                    <select value={landlordId} onChange={(event) => setLandlordId(event.target.value)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold xl:col-span-3">
                        <option value="">Correct landlord...</option>
                        {audit.landlordOptions.map((landlord) => (
                            <option key={landlord.id} value={landlord.id}>{landlord.name}</option>
                        ))}
                    </select>
                    <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Review note / repair reason" className="rounded-2xl border border-slate-200 px-4 py-3 text-sm xl:col-span-5" />
                    <button disabled={isPending || !selectedRoomIds.length} onClick={bulkReassign} className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:opacity-40 xl:col-span-2">
                        Bulk Reassign
                    </button>
                </div>
                {message ? <p className="mt-3 text-sm font-semibold text-slate-600">{message}</p> : null}
            </div>

            {visibleIssues.length === 0 ? (
                <div className="p-6">
                    <EmptyState title="No assignment issues in this view" description="Change the filter or continue monitoring landlord-room consistency as data changes." />
                </div>
            ) : (
                <div className="max-h-[680px] overflow-auto">
                    <table className="enterprise-table">
                        <thead className="sticky top-0 z-10 bg-white">
                            <tr>
                                <th className="text-left">Select</th>
                                <th className="text-left">Room</th>
                                <th className="text-left">Current Landlord</th>
                                <th className="text-left">Property Landlord</th>
                                <th className="text-left">Tenant</th>
                                <th className="text-left">Rent / Balance</th>
                                <th className="text-left">Reasons</th>
                                <th className="text-left">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleIssues.map((issue) => (
                                <IssueRow
                                    key={issue.id}
                                    issue={issue}
                                    selected={selectedIssueIds.includes(issue.id)}
                                    landlordId={landlordId}
                                    note={note}
                                    isPending={isPending}
                                    onToggle={() => toggle(issue.id)}
                                    onRun={run}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}

function IssueRow({
    issue,
    selected,
    landlordId,
    note,
    isPending,
    onToggle,
    onRun,
}: {
    issue: LandlordAssignmentIssue;
    selected: boolean;
    landlordId: string;
    note: string;
    isPending: boolean;
    onToggle: () => void;
    onRun: (action: () => Promise<unknown>, success: string) => void;
}) {
    function reassign() {
        if (!landlordId) throw new Error("Select the correct landlord first.");
        return reassignLandlordRoom({ roomId: issue.roomId, landlordId, note });
    }

    return (
        <tr>
            <td>
                <input type="checkbox" checked={selected} onChange={onToggle} className="h-4 w-4 rounded border-slate-300" />
            </td>
            <td>
                <p className="font-black">{issue.roomNumber}</p>
                <p className="text-xs text-slate-500">{issue.officeName} · {issue.propertyName}</p>
            </td>
            <td>
                <p className="font-bold">{issue.currentLandlordName}</p>
                <StatusChip label={issue.severity} tone={severityTone(issue.severity)} />
            </td>
            <td>{issue.propertyLandlordName ?? "No property landlord"}</td>
            <td>{issue.tenantName ?? "Vacant"}</td>
            <td>
                <p className="font-black">{money(issue.monthlyRent)}</p>
                <p className="text-xs text-red-600">Outstanding {money(issue.outstandingBalance)}</p>
            </td>
            <td>
                <div className="flex max-w-lg flex-wrap gap-2">
                    {issue.reasons.map((reason) => (
                        <span key={reason} className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">{reason}</span>
                    ))}
                    {issue.reviewed ? <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">Reviewed</span> : null}
                </div>
                {issue.reviewedNote ? <p className="mt-2 text-xs text-slate-500">Note: {issue.reviewedNote}</p> : null}
            </td>
            <td>
                <div className="flex flex-wrap gap-2">
                    <button
                        disabled={isPending}
                        onClick={() => onRun(reassign, "Room reassigned.")}
                        className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-3 py-2 text-xs font-black text-white disabled:opacity-40"
                    >
                        <RotateCcw size={14} /> Reassign
                    </button>
                    <button
                        disabled={isPending}
                        onClick={() => onRun(() => markLandlordAssignmentReviewed({ roomId: issue.roomId, note }), "Issue marked reviewed.")}
                        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-40"
                    >
                        <CheckCircle2 size={14} /> Review
                    </button>
                </div>
            </td>
        </tr>
    );
}

function AuditMini({ label, value, tone = "text-slate-900" }: { label: string; value: string; tone?: string }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
            <p className={`mt-1 text-2xl font-black ${tone}`}>{value}</p>
        </div>
    );
}

function severityTone(severity: LandlordAssignmentIssue["severity"]) {
    if (severity === "critical") return "red";
    if (severity === "high") return "orange";
    if (severity === "medium") return "blue";
    if (severity === "low") return "slate";
    return "green";
}
