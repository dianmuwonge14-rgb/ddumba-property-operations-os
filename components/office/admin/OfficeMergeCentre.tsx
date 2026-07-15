"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Archive, Building2, CheckCircle2, Eye, EyeOff, GitMerge, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { StatusChip } from "@/components/office/shared/EnterpriseUI";
import { COUNT_TABLES } from "@/lib/office-merge/constants";
import type { OfficeMergeData, OfficeMergeSourceOffice } from "@/lib/office-merge/types";

type Props = {
    data: OfficeMergeData;
};

type MergeResult = {
    accountsReassigned: number;
    batchId: string;
    destinationOfficeName: string;
    mergeReference: string;
    mergedAt: string;
    newOfficeCode?: string;
    pinConfigured?: boolean;
    sourceOfficeName: string;
    sourceStatus: string;
    transferredCounts: Record<string, number>;
};

type OfficeMergeApiResponse = {
    code?: string;
    destinationOfficeId?: string;
    destinationOfficeName?: string;
    durationMs?: number;
    message?: string;
    newOfficeCode?: string;
    pinConfigured?: boolean;
    results?: Array<Omit<MergeResult, "destinationOfficeName">>;
    stage?: string;
    success: boolean;
};

function money(value: number) {
    return `UGX ${Math.round(Number.isFinite(value) ? value : 0).toLocaleString()}`;
}

function isInactive(status: string) {
    return ["archived", "deleted", "merged", "inactive"].includes(status.toLowerCase());
}

export default function OfficeMergeCentre({ data }: Props) {
    const [sourceOfficeIds, setSourceOfficeIds] = useState<string[]>([]);
    const [newOfficeName, setNewOfficeName] = useState("");
    const [newOfficeCode, setNewOfficeCode] = useState("");
    const [newOfficeLocation, setNewOfficeLocation] = useState("");
    const [newOfficePin, setNewOfficePin] = useState("");
    const [confirmNewOfficePin, setConfirmNewOfficePin] = useState("");
    const [showPin, setShowPin] = useState(false);
    const [reasonNote, setReasonNote] = useState("");
    const [confirmation, setConfirmation] = useState("");
    const [accountHandling, setAccountHandling] = useState<"move_all" | "deactivate_all" | "select">("move_all");
    const [showConfirm, setShowConfirm] = useState(false);
    const [message, setMessage] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
    const [mergeResult, setMergeResult] = useState<MergeResult | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [progressText, setProgressText] = useState<string | null>(null);

    const sourceOffices = useMemo(() => sourceOfficeIds.map((id) => data.offices.find((office) => office.id === id)).filter((office): office is OfficeMergeSourceOffice => Boolean(office)), [data.offices, sourceOfficeIds]);
    const affectedCounts = useMemo(() => {
        const totals: Record<string, number> = {};
        for (const item of COUNT_TABLES) totals[item.key] = 0;
        for (const office of sourceOffices) {
            for (const item of COUNT_TABLES) totals[item.key] = (totals[item.key] ?? 0) + Number(office.counts[item.key] ?? 0);
        }
        return totals;
    }, [sourceOffices]);
    const rentRoll = sourceOffices.reduce((total, office) => total + office.rentRoll, 0);
    const cleanedOfficeName = newOfficeName.trim().replace(/\s+/g, " ");
    const effectiveOfficeCode = (newOfficeCode.trim() || cleanedOfficeName).toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const duplicateOfficeName = Boolean(cleanedOfficeName && data.offices.some((office) => !isInactive(office.status) && office.name.trim().toLowerCase() === cleanedOfficeName.toLowerCase()));
    const pinIsWeak = /^(\d)\1{5}$/.test(newOfficePin) || ["012345", "123456", "234567", "345678", "456789", "987654", "876543", "765432", "654321"].includes(newOfficePin);

    const validationMessage = useMemo(() => {
        if (sourceOfficeIds.length === 0) return "Select at least one source office.";
        if (!cleanedOfficeName) return "New merged office name is required.";
        if (duplicateOfficeName) return "Office name already exists.";
        if (!effectiveOfficeCode) return "Office code is required.";
        if (!/^\d{6}$/.test(newOfficePin)) return "PIN must contain exactly six digits.";
        if (pinIsWeak) return "Choose a stronger six-digit PIN for the merged office.";
        if (newOfficePin !== confirmNewOfficePin) return "PIN confirmation does not match.";
        if (sourceOffices.length !== sourceOfficeIds.length) return "One selected source office could not be found.";
        if (sourceOffices.some((office) => isInactive(office.status))) return "One source office is already inactive, archived, or merged.";
        return "";
    }, [cleanedOfficeName, confirmNewOfficePin, duplicateOfficeName, effectiveOfficeCode, newOfficePin, pinIsWeak, sourceOfficeIds, sourceOffices]);

    const confirmIsValid = confirmation.trim().toUpperCase() === "MERGE OFFICES";
    const canOpenConfirmation = !validationMessage && !isSubmitting;
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

    async function submitMerge() {
        if (validationMessage) {
            setMessage({ tone: "error", text: validationMessage });
            return;
        }
        setMessage(null);
        setIsSubmitting(true);
        setProgressText("Starting merge request...");
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 65000);
        try {
            const response = await fetch("/api/admin/office-merge", {
                body: JSON.stringify({
                    accountHandling,
                    confirmation,
                    confirmNewOfficePin,
                    newOfficeCode: effectiveOfficeCode,
                    newOfficeLocation,
                    newOfficeName: cleanedOfficeName,
                    newOfficePin,
                    reasonNote,
                    sourceOfficeIds,
                }),
                credentials: "same-origin",
                headers: { "content-type": "application/json" },
                method: "POST",
                signal: controller.signal,
            });
            const payload = await response.json().catch(() => null) as OfficeMergeApiResponse | null;
            if (!response.ok || !payload?.success) {
                const messageText = payload?.message
                    ? `${payload.message}${payload.stage ? ` Stage: ${payload.stage}.` : ""}${payload.code ? ` Reference: ${payload.code}.` : ""}`
                    : response.status === 401
                        ? "Your Admin session expired. Please sign in again."
                        : "The server could not start the merge request. No records were changed.";
                setMessage({ tone: "error", text: messageText });
                return;
            }
            const result = payload.results?.[0];
            if (!result) {
                setMessage({ tone: "error", text: "The merge completed but did not return a merge batch reference." });
                return;
            }
            setMergeResult({
                ...result,
                destinationOfficeName: payload.destinationOfficeName ?? cleanedOfficeName,
                newOfficeCode: payload.newOfficeCode,
                pinConfigured: payload.pinConfigured,
            });
            setShowConfirm(false);
            setMessage({ tone: "success", text: `Office merge completed successfully in ${Math.max(1, Math.round(Number(payload.durationMs ?? 0) / 1000))}s.` });
        } catch (error) {
            const text = error instanceof DOMException && error.name === "AbortError"
                ? "The merge request timed out before the browser received a response. Check Recent Merge Batches before retrying."
                : error instanceof TypeError
                    ? "Network connection failed while starting the merge. Check your connection, then retry or inspect Recent Merge Batches."
                    : error instanceof Error
                        ? error.message
                        : "Office merge failed. No records were changed.";
            setMessage({ tone: "error", text });
        } finally {
            window.clearTimeout(timeout);
            setIsSubmitting(false);
            setProgressText(null);
        }
    }

    function reset() {
        setSourceOfficeIds([]);
        setNewOfficeName("");
        setNewOfficeCode("");
        setNewOfficeLocation("");
        setNewOfficePin("");
        setConfirmNewOfficePin("");
        setReasonNote("");
        setConfirmation("");
        setAccountHandling("move_all");
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
                                <h1 className="text-2xl font-black">Merge Offices Into a New Office</h1>
                                <p className="text-sm font-semibold text-slate-300">Create a new merged office login, then move selected source-office data into it.</p>
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
                        <OfficeMultiSelectCard
                            label="Source offices"
                            eyebrow="Step 1"
                            description="Select every office that will be archived after its data moves into the new merged office."
                            offices={data.offices}
                            values={sourceOfficeIds}
                            onToggle={(value) => {
                                setSourceOfficeIds((current) => current.includes(value) ? current.filter((id) => id !== value) : [...current, value]);
                                setMessage(null);
                                setMergeResult(null);
                            }}
                        />
                        <section className="enterprise-card p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-600">Step 2</p>
                                    <h2 className="text-lg font-black text-slate-950">New Merged Office</h2>
                                    <p className="mt-1 text-xs font-bold text-slate-500">This new office receives all selected source-office data and gets a fresh login PIN.</p>
                                </div>
                                <Building2 className="text-emerald-600" size={22} />
                            </div>
                            <div className="mt-3 grid gap-3">
                                <label className="space-y-1">
                                    <span className="text-xs font-black uppercase tracking-wide text-slate-500">New merged office name</span>
                                    <input value={newOfficeName} onChange={(event) => setNewOfficeName(event.target.value)} placeholder="Entebbe Main Office" className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-950 outline-none focus:border-emerald-400" />
                                </label>
                                <div className="grid gap-3 md:grid-cols-2">
                                    <label className="space-y-1">
                                        <span className="text-xs font-black uppercase tracking-wide text-slate-500">Optional office code</span>
                                        <input value={newOfficeCode} onChange={(event) => setNewOfficeCode(event.target.value.toUpperCase())} placeholder={effectiveOfficeCode || "ENTEBBE-MAIN-OFFICE"} className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-950 outline-none focus:border-emerald-400" />
                                    </label>
                                    <label className="space-y-1">
                                        <span className="text-xs font-black uppercase tracking-wide text-slate-500">Optional location</span>
                                        <input value={newOfficeLocation} onChange={(event) => setNewOfficeLocation(event.target.value)} placeholder="Entebbe" className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-950 outline-none focus:border-emerald-400" />
                                    </label>
                                </div>
                                <div className="grid gap-3 md:grid-cols-2">
                                    <label className="space-y-1">
                                        <span className="text-xs font-black uppercase tracking-wide text-slate-500">New office login PIN</span>
                                        <input value={newOfficePin} onChange={(event) => setNewOfficePin(event.target.value.replace(/\D/g, "").slice(0, 6))} type={showPin ? "text" : "password"} inputMode="numeric" maxLength={6} className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-950 outline-none focus:border-emerald-400" />
                                    </label>
                                    <label className="space-y-1">
                                        <span className="text-xs font-black uppercase tracking-wide text-slate-500">Confirm login PIN</span>
                                        <input value={confirmNewOfficePin} onChange={(event) => setConfirmNewOfficePin(event.target.value.replace(/\D/g, "").slice(0, 6))} type={showPin ? "text" : "password"} inputMode="numeric" maxLength={6} className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-950 outline-none focus:border-emerald-400" />
                                    </label>
                                </div>
                                <button type="button" onClick={() => setShowPin(!showPin)} className="inline-flex w-fit items-center gap-2 rounded-2xl bg-slate-100 px-4 py-2 text-xs font-black text-slate-700">
                                    {showPin ? <EyeOff size={15} /> : <Eye size={15} />} {showPin ? "Hide PIN" : "Show PIN"}
                                </button>
                                <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-xs font-black text-emerald-800">Login PIN status: {newOfficePin && confirmNewOfficePin && !validationMessage.includes("PIN") ? "New PIN configured" : "PIN required before merge"}</p>
                            </div>
                        </section>
                    </div>

                    <div className="space-y-4 xl:col-span-7">
                        <section className="enterprise-card p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs font-black uppercase tracking-[0.2em] text-purple-600">Step 3</p>
                                    <h2 className="text-lg font-black text-slate-950">Account Reassignment & Confirmation</h2>
                                </div>
                                <Building2 className="text-purple-600" size={22} />
                            </div>
                            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                                <label className="space-y-1">
                                    <span className="text-xs font-black uppercase tracking-wide text-slate-500">Source office accounts</span>
                                    <select value={accountHandling} onChange={(event) => setAccountHandling(event.target.value as "move_all" | "deactivate_all" | "select")} className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-950 outline-none focus:border-blue-400">
                                        <option value="move_all">Move all active accounts to new office</option>
                                        <option value="select">Select accounts individually after preview</option>
                                        <option value="deactivate_all">Deactivate selected/source accounts</option>
                                    </select>
                                </label>
                                <label className="space-y-1">
                                    <span className="text-xs font-black uppercase tracking-wide text-slate-500">Confirmation phrase</span>
                                    <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Type MERGE OFFICES" className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-950 outline-none focus:border-blue-400" />
                                </label>
                                <label className="space-y-1 md:col-span-2">
                                    <span className="text-xs font-black uppercase tracking-wide text-slate-500">Reason / note</span>
                                    <textarea value={reasonNote} onChange={(event) => setReasonNote(event.target.value)} placeholder="Why this office is being merged..." className="min-h-16 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold text-slate-950 outline-none focus:border-blue-400" />
                                </label>
                            </div>
                            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                                <button type="button" onClick={reset} disabled={isSubmitting} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 disabled:opacity-50">
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
                                        <h2 className="text-lg font-black text-slate-950">{sourceOffices.length ? `${sourceOffices.length} source office${sourceOffices.length === 1 ? "" : "s"} into ${cleanedOfficeName || "new office"}` : "Select source offices"}</h2>
                                        <p className="mt-1 text-sm font-semibold text-slate-500">Counts are loaded from Supabase. The new office PIN is never displayed in the preview.</p>
                                    </div>
                                    <StatusChip label={!validationMessage ? "Ready for review" : "Setup required"} tone={!validationMessage ? "green" : "orange"} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 p-4 xl:grid-cols-5">
                                <Kpi label="Source offices" value={sourceOffices.length.toLocaleString()} />
                                <Kpi label="Landlords" value={(affectedCounts.landlords ?? 0).toLocaleString()} />
                                <Kpi label="Rooms" value={(affectedCounts.rooms ?? 0).toLocaleString()} />
                                <Kpi label="Tenants" value={(affectedCounts.tenants ?? 0).toLocaleString()} />
                                <Kpi label="Rent roll" value={money(rentRoll)} />
                            </div>
                            <div className="px-4 pb-4">
                                <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
                                    <CompactMetric label="New office" value={cleanedOfficeName || "Not entered"} />
                                    <CompactMetric label="Office code" value={effectiveOfficeCode || "Auto"} />
                                    <CompactMetric label="Location" value={newOfficeLocation || "Not entered"} />
                                    <CompactMetric label="Login PIN" value={newOfficePin && confirmNewOfficePin && !validationMessage.includes("PIN") ? "New PIN configured" : "Not ready"} />
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

            {showConfirm && sourceOffices.length > 0 ? (
                <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/70 p-4 backdrop-blur-sm" onClick={(event) => event.target === event.currentTarget && !isSubmitting ? setShowConfirm(false) : null}>
                    <section className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] border border-white/20 bg-white p-5 shadow-2xl">
                        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.2em] text-red-600">Final confirmation</p>
                                <h2 className="text-2xl font-black text-slate-950">Merge selected offices into “{cleanedOfficeName}”?</h2>
                                <p className="mt-1 text-sm font-bold text-slate-500">This creates the new office and login PIN, then moves live Supabase data into that office.</p>
                            </div>
                            <button type="button" onClick={() => setShowConfirm(false)} disabled={isSubmitting} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 disabled:opacity-50">
                                <XCircle size={16} /> Cancel
                            </button>
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
                            <ConfirmCard title="Source offices" value={sourceOffices.map((office) => office.name).join(", ")} tone="orange" />
                            <ConfirmCard title="New office" value={cleanedOfficeName} tone="green" />
                            <ConfirmCard title="Login PIN" value="New PIN configured" tone="blue" />
                        </div>
                        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                            <CompactMetric label="New office code" value={effectiveOfficeCode} />
                            <CompactMetric label="Location" value={newOfficeLocation || "Not entered"} />
                            <CompactMetric label="Account reassignment" value={accountHandling === "deactivate_all" ? "Deactivate source accounts" : accountHandling === "select" ? "Selective reassignment" : "Move all active accounts"} />
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
                            {COUNT_TABLES.map((item) => <CompactMetric key={item.key} label={item.label} value={(affectedCounts[item.key] ?? 0).toLocaleString()} />)}
                        </div>
                        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                            <div className="flex gap-3">
                                <AlertTriangle className="mt-1 shrink-0 text-amber-600" size={20} />
                                <div className="text-sm font-bold leading-6 text-amber-900">
                                    <p>Confirm only after reviewing account assignments, pending approvals, and possible duplicate room/property relationships.</p>
                                    <p className="mt-1">Type <span className="font-black">MERGE OFFICES</span> to unlock the final button. The PIN will not be shown after completion.</p>
                                </div>
                            </div>
                        </div>
                        {message?.tone === "error" ? <Message tone={message.tone} text={message.text} /> : null}
                        {progressText ? (
                            <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-black text-blue-900">
                                <div className="flex items-center gap-2">
                                    <Loader2 className="animate-spin" size={16} />
                                    {progressText}
                                </div>
                            </div>
                        ) : null}
                        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                            <button type="button" onClick={() => setShowConfirm(false)} disabled={isSubmitting} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 disabled:opacity-50">
                                Cancel
                            </button>
                            <button type="button" onClick={submitMerge} disabled={!canExecute || isSubmitting} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-emerald-200 disabled:cursor-not-allowed disabled:bg-slate-300">
                                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                                {isSubmitting ? "Starting merge..." : "Confirm Office Merge"}
                            </button>
                        </div>
                    </section>
                </div>
            ) : null}
        </main>
    );
}

function OfficeMultiSelectCard({ label, eyebrow, description, offices, values, onToggle }: {
    label: string;
    eyebrow: string;
    description: string;
    offices: OfficeMergeSourceOffice[];
    values: string[];
    onToggle: (value: string) => void;
}) {
    return (
        <div className="enterprise-card p-4">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">{eyebrow}</p>
                    <h2 className="text-lg font-black text-slate-950">{label}</h2>
                    <p className="mt-1 text-xs font-bold text-slate-500">{description}</p>
                </div>
                <GitMerge className="text-blue-600" size={22} />
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2">
                {offices.map((office) => {
                    const selected = values.includes(office.id);
                    const disabled = isInactive(office.status);
                    return (
                        <button
                            key={office.id}
                            type="button"
                            onClick={() => !disabled && onToggle(office.id)}
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
                    <h2 className="text-xl font-black text-slate-950">OFFICE MERGE COMPLETED SUCCESSFULLY</h2>
                    <p className="mt-1 text-sm font-bold text-emerald-900">Reference {result.mergeReference} · {result.sourceOfficeName} merged into {result.destinationOfficeName}</p>
                    <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-4">
                        <CompactMetric label="New office" value={result.destinationOfficeName} />
                        <CompactMetric label="Office code" value={result.newOfficeCode ?? "Generated"} />
                        <CompactMetric label="PIN configured" value={result.pinConfigured ? "Yes" : "Yes"} />
                        <CompactMetric label="Source status" value={result.sourceStatus} />
                        <CompactMetric label="Accounts reassigned" value={result.accountsReassigned.toLocaleString()} />
                        <CompactMetric label="Merge date" value={new Date(result.mergedAt).toLocaleString()} />
                        <CompactMetric label="Batch ID" value={result.batchId} />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                        <a href="/office" className="rounded-2xl bg-emerald-700 px-4 py-2 text-sm font-black text-white">Open New Office</a>
                        <a href="/office/admin/office-merge" className="rounded-2xl bg-white px-4 py-2 text-sm font-black text-emerald-800">View Merge Audit</a>
                        <a href="/office/admin" className="rounded-2xl bg-white px-4 py-2 text-sm font-black text-emerald-800">Return to Administration</a>
                    </div>
                    <p className="mt-3 rounded-2xl bg-white/80 px-4 py-3 text-xs font-bold text-emerald-900">Office login instructions: choose {result.destinationOfficeName} in the office login selector and use the PIN configured during this merge. The PIN is not displayed again here.</p>
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
