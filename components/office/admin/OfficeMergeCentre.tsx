"use client";

import { useMemo, useState } from "react";
import {
    AlertTriangle,
    Archive,
    Banknote,
    Building2,
    CheckCircle2,
    Clock3,
    Database,
    Eye,
    EyeOff,
    FileCheck2,
    GitMerge,
    KeyRound,
    Loader2,
    LockKeyhole,
    Search,
    ShieldCheck,
    SlidersHorizontal,
    UsersRound,
    XCircle,
} from "lucide-react";
import { StatusChip } from "@/components/office/shared/EnterpriseUI";
import { COUNT_TABLES } from "@/lib/office-merge/constants";
import type { OfficeMergeData, OfficeMergeHistoryRow, OfficeMergeSourceOffice } from "@/lib/office-merge/types";

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

type MessageState = { tone: "success" | "error" | "info"; text: string };
type StepState = "completed" | "active" | "pending";
type AccountHandling = "move_all" | "deactivate_all" | "select";

const STEP_ITEMS = [
    { id: 1, label: "Select Offices", icon: Building2 },
    { id: 2, label: "Configure New Office", icon: KeyRound },
    { id: 3, label: "Transfer Accounts", icon: UsersRound },
    { id: 4, label: "Review Live Preview", icon: Database },
    { id: 5, label: "Confirm and Merge", icon: ShieldCheck },
    { id: 6, label: "Track Completion", icon: FileCheck2 },
] as const;

const PROGRESS_STAGES = [
    "Validating request",
    "Locking source offices",
    "Creating new office",
    "Configuring secure PIN",
    "Moving accounts",
    "Moving landlords and properties",
    "Moving rooms and tenants",
    "Moving financial records",
    "Preserving receipts and history",
    "Reconciling totals",
    "Writing audit records",
    "Archiving source offices",
    "Final verification",
];

const RECORD_GROUPS = [
    { title: "Operations", keys: ["properties", "rooms", "tenants", "collections", "promises"] },
    { title: "Finance", keys: ["payments", "receipts", "expenses", "cashMovements", "bankDeposits", "landlordPayables", "landlordPayments", "landlordAdvances", "recoveryDeductions"] },
    { title: "People", keys: ["employees", "officeUsers", "officeAccounts", "collectorAccounts", "attendance"] },
    { title: "Governance", keys: ["notifications", "approvalRequests", "dailyReports", "instructions", "auditLogs"] },
] as const;

function money(value: number) {
    return `UGX ${Math.round(Number.isFinite(value) ? value : 0).toLocaleString()}`;
}

function isInactive(status: string) {
    return ["archived", "deleted", "merged", "inactive"].includes(status.toLowerCase());
}

function normalize(value: string) {
    return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function countLabel(key: string) {
    return COUNT_TABLES.find((item) => item.key === key)?.label ?? key;
}

function sumCounts(offices: OfficeMergeSourceOffice[]) {
    const totals: Record<string, number> = {};
    for (const item of COUNT_TABLES) totals[item.key] = 0;
    for (const office of offices) {
        for (const item of COUNT_TABLES) totals[item.key] = (totals[item.key] ?? 0) + Number(office.counts[item.key] ?? 0);
    }
    return totals;
}

export default function OfficeMergeCentre({ data }: Props) {
    const [sourceOfficeIds, setSourceOfficeIds] = useState<string[]>([]);
    const [newOfficeName, setNewOfficeName] = useState("");
    const [newOfficeCode, setNewOfficeCode] = useState("");
    const [newOfficeLocation, setNewOfficeLocation] = useState("");
    const [newOfficePhone, setNewOfficePhone] = useState("");
    const [newOfficeEmail, setNewOfficeEmail] = useState("");
    const [newOfficePin, setNewOfficePin] = useState("");
    const [confirmNewOfficePin, setConfirmNewOfficePin] = useState("");
    const [showPin, setShowPin] = useState(false);
    const [reasonNote, setReasonNote] = useState("");
    const [confirmation, setConfirmation] = useState("");
    const [accountHandling, setAccountHandling] = useState<AccountHandling>("move_all");
    const [showConfirm, setShowConfirm] = useState(false);
    const [message, setMessage] = useState<MessageState | null>(null);
    const [mergeResult, setMergeResult] = useState<MergeResult | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [progressText, setProgressText] = useState<string | null>(null);
    const [officeSearch, setOfficeSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [locationFilter, setLocationFilter] = useState("all");

    const sourceOffices = useMemo(
        () => sourceOfficeIds.map((id) => data.offices.find((office) => office.id === id)).filter((office): office is OfficeMergeSourceOffice => Boolean(office)),
        [data.offices, sourceOfficeIds],
    );
    const affectedCounts = useMemo(() => sumCounts(sourceOffices), [sourceOffices]);
    const rentRoll = sourceOffices.reduce((total, office) => total + office.rentRoll, 0);
    const cleanedOfficeName = newOfficeName.trim().replace(/\s+/g, " ");
    const effectiveOfficeCode = (newOfficeCode.trim() || cleanedOfficeName).toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const duplicateOfficeName = Boolean(cleanedOfficeName && data.offices.some((office) => !isInactive(office.status) && normalize(office.name) === normalize(cleanedOfficeName)));
    const duplicateOfficeCode = Boolean(effectiveOfficeCode && data.offices.some((office) => !isInactive(office.status) && normalize(office.code) === normalize(effectiveOfficeCode)));
    const pinIsWeak = /^(\d)\1{5}$/.test(newOfficePin) || ["012345", "123456", "234567", "345678", "456789", "987654", "876543", "765432", "654321"].includes(newOfficePin);
    const confirmationIsValid = confirmation.trim().toUpperCase() === "MERGE OFFICES";
    const locationOptions = useMemo(() => Array.from(new Set(data.offices.map((office) => office.location).filter(Boolean))).sort(), [data.offices]);
    const filteredOffices = useMemo(() => {
        const needle = normalize(officeSearch);
        return data.offices.filter((office) => {
            const haystack = normalize(`${office.name} ${office.code} ${office.location} ${office.status}`);
            const matchesSearch = !needle || haystack.includes(needle);
            const matchesStatus = statusFilter === "all" || normalize(office.status) === statusFilter;
            const matchesLocation = locationFilter === "all" || office.location === locationFilter;
            return matchesSearch && matchesStatus && matchesLocation;
        });
    }, [data.offices, locationFilter, officeSearch, statusFilter]);

    const conflicts = useMemo(() => {
        const items: Array<{ issue: string; record: string; resolution: string; blocking: boolean }> = [];
        if (sourceOfficeIds.length === 0) items.push({ issue: "No source office selected", record: "Office selection", resolution: "Select one or more active offices.", blocking: true });
        if (!cleanedOfficeName) items.push({ issue: "New office name missing", record: "New merged office setup", resolution: "Enter the destination office name.", blocking: true });
        if (duplicateOfficeName) items.push({ issue: "Duplicate office name", record: cleanedOfficeName, resolution: "Use a unique merged-office name.", blocking: true });
        if (!effectiveOfficeCode) items.push({ issue: "Office code missing", record: "Office code", resolution: "Enter or accept an auto-generated code.", blocking: true });
        if (duplicateOfficeCode) items.push({ issue: "Duplicate office code", record: effectiveOfficeCode, resolution: "Use a unique office code.", blocking: true });
        if (!/^\d{6}$/.test(newOfficePin)) items.push({ issue: "PIN format invalid", record: "Secure PIN", resolution: "Use exactly six digits.", blocking: true });
        if (pinIsWeak) items.push({ issue: "Weak PIN", record: "Secure PIN", resolution: "Avoid repeated or sequential digits.", blocking: true });
        if (newOfficePin !== confirmNewOfficePin) items.push({ issue: "PIN confirmation mismatch", record: "Secure PIN", resolution: "Re-enter the same PIN.", blocking: true });
        if (sourceOffices.length !== sourceOfficeIds.length) items.push({ issue: "Selected office not found", record: "Source office", resolution: "Clear selection and choose again.", blocking: true });
        for (const office of sourceOffices) {
            if (isInactive(office.status)) items.push({ issue: "Inactive office selected", record: office.name, resolution: "Remove inactive, archived, or merged offices.", blocking: true });
        }
        if ((affectedCounts.approvalRequests ?? 0) > 0) {
            items.push({ issue: "Pending approvals will move", record: `${affectedCounts.approvalRequests} approval requests`, resolution: "Review after merge in the new office queue.", blocking: false });
        }
        return items;
    }, [affectedCounts.approvalRequests, cleanedOfficeName, confirmNewOfficePin, duplicateOfficeCode, duplicateOfficeName, effectiveOfficeCode, newOfficePin, pinIsWeak, sourceOfficeIds.length, sourceOffices]);

    const validationMessage = conflicts.find((item) => item.blocking)?.resolution ?? "";
    const blockingConflicts = conflicts.filter((item) => item.blocking);
    const reconciliationStatus = blockingConflicts.length === 0 && sourceOffices.length > 0 ? "Balanced" : "Requires Review";
    const canOpenConfirmation = blockingConflicts.length === 0 && !isSubmitting;
    const canExecute = canOpenConfirmation && confirmationIsValid;
    const estimatedRecords = Object.values(affectedCounts).reduce((total, value) => total + Number(value ?? 0), 0);
    const activeStep = mergeResult ? 6 : showConfirm ? 5 : blockingConflicts.length === 0 && sourceOffices.length > 0 ? 4 : sourceOfficeIds.length ? 2 : 1;

    function toggleOffice(id: string) {
        setSourceOfficeIds((current) => current.includes(id) ? current.filter((officeId) => officeId !== id) : [...current, id]);
        setMessage(null);
        setMergeResult(null);
    }

    function selectAllVisible() {
        setSourceOfficeIds(Array.from(new Set([...sourceOfficeIds, ...filteredOffices.filter((office) => !isInactive(office.status)).map((office) => office.id)])));
        setMessage(null);
    }

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
        setProgressText("Starting secure merge...");
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
                    reasonNote: [reasonNote, newOfficePhone ? `Phone: ${newOfficePhone}` : "", newOfficeEmail ? `Email: ${newOfficeEmail}` : ""].filter(Boolean).join("\n"),
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
                        ? "Admin session expired. Sign in again before starting the merge."
                        : "Merge service unavailable. No records were changed.";
                setMessage({ tone: "error", text: messageText });
                return;
            }
            const result = payload.results?.[0];
            if (!result) {
                setMessage({ tone: "error", text: "Merge completed but no merge batch reference was returned. Check Recent Merge Batches before retrying." });
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
                ? "Merge request timed out. Check Recent Merge Batches before retrying; the operation may still be completing safely."
                : error instanceof TypeError
                    ? "Merge service unavailable or network connection failed. No browser-side financial data was changed."
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
        setNewOfficePhone("");
        setNewOfficeEmail("");
        setNewOfficePin("");
        setConfirmNewOfficePin("");
        setReasonNote("");
        setConfirmation("");
        setAccountHandling("move_all");
        setShowConfirm(false);
        setMergeResult(null);
        setMessage({ tone: "info", text: "Preview cleared. No live data was changed." });
    }

    return (
        <main className="enterprise-page">
            <div className="enterprise-shell max-w-[1600px] space-y-4 px-3 sm:px-5 lg:px-6">
                <OfficeConsolidationHero companyName={data.companyName} />
                <MergeStepIndicator activeStep={activeStep} mergeResult={Boolean(mergeResult)} />

                {message ? <Message tone={message.tone} text={message.text} /> : null}

                <section className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1.35fr)]">
                    <div className="space-y-4">
                        <OfficeSelectionCard
                            filteredOffices={filteredOffices}
                            locationFilter={locationFilter}
                            locationOptions={locationOptions}
                            officeSearch={officeSearch}
                            onClear={() => setSourceOfficeIds([])}
                            onLocationFilter={setLocationFilter}
                            onSearch={setOfficeSearch}
                            onSelectAll={selectAllVisible}
                            onStatusFilter={setStatusFilter}
                            onToggle={toggleOffice}
                            selectedIds={sourceOfficeIds}
                            statusFilter={statusFilter}
                        />
                        <NewMergedOfficeForm
                            confirmNewOfficePin={confirmNewOfficePin}
                            duplicateOfficeCode={duplicateOfficeCode}
                            duplicateOfficeName={duplicateOfficeName}
                            effectiveOfficeCode={effectiveOfficeCode}
                            newOfficeCode={newOfficeCode}
                            newOfficeEmail={newOfficeEmail}
                            newOfficeLocation={newOfficeLocation}
                            newOfficeName={newOfficeName}
                            newOfficePhone={newOfficePhone}
                            newOfficePin={newOfficePin}
                            onConfirmPin={setConfirmNewOfficePin}
                            onEmail={setNewOfficeEmail}
                            onLocation={setNewOfficeLocation}
                            onName={setNewOfficeName}
                            onOfficeCode={setNewOfficeCode}
                            onPhone={setNewOfficePhone}
                            onPin={setNewOfficePin}
                            onToggleShowPin={() => setShowPin((value) => !value)}
                            pinIsWeak={pinIsWeak}
                            showPin={showPin}
                        />
                        <AccountTransferPanel accountHandling={accountHandling} affectedCounts={affectedCounts} onAccountHandling={setAccountHandling} sourceOffices={sourceOffices} />
                    </div>

                    <div className="space-y-4">
                        <LiveMergePreview
                            affectedCounts={affectedCounts}
                            cleanedOfficeName={cleanedOfficeName}
                            effectiveOfficeCode={effectiveOfficeCode}
                            estimatedRecords={estimatedRecords}
                            newOfficeLocation={newOfficeLocation}
                            pinReady={Boolean(newOfficePin && confirmNewOfficePin && !pinIsWeak && newOfficePin === confirmNewOfficePin)}
                            rentRoll={rentRoll}
                            sourceOffices={sourceOffices}
                        />
                        <FinancialIntegrityPanel affectedCounts={affectedCounts} rentRoll={rentRoll} sourceOffices={sourceOffices} status={reconciliationStatus} />
                        <ConflictReviewPanel conflicts={conflicts} />
                        <FinalMergeConfirmation
                            accountHandling={accountHandling}
                            canOpenConfirmation={canOpenConfirmation}
                            cleanedOfficeName={cleanedOfficeName}
                            confirmation={confirmation}
                            confirmationIsValid={confirmationIsValid}
                            effectiveOfficeCode={effectiveOfficeCode}
                            estimatedRecords={estimatedRecords}
                            isSubmitting={isSubmitting}
                            newOfficeLocation={newOfficeLocation}
                            onConfirmation={setConfirmation}
                            onOpenConfirmation={openConfirmation}
                            onReset={reset}
                            reasonNote={reasonNote}
                            rentRoll={rentRoll}
                            setReasonNote={setReasonNote}
                            sourceOffices={sourceOffices}
                            validationMessage={validationMessage}
                        />
                    </div>
                </section>

                <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                    <MergeProgressTimeline active={isSubmitting} mergeResult={mergeResult} progressText={progressText} />
                    <MergeHistoryPanel history={data.history} />
                </section>

                {mergeResult ? <MergeCompletionSummary result={mergeResult} /> : null}

                {data.warnings.length > 0 ? <LiveDataWarnings warnings={data.warnings} /> : null}
            </div>

            {showConfirm && sourceOffices.length > 0 ? (
                <ConfirmationModal
                    accountHandling={accountHandling}
                    affectedCounts={affectedCounts}
                    canExecute={canExecute}
                    cleanedOfficeName={cleanedOfficeName}
                    effectiveOfficeCode={effectiveOfficeCode}
                    isSubmitting={isSubmitting}
                    message={message?.tone === "error" ? message.text : null}
                    newOfficeLocation={newOfficeLocation}
                    onCancel={() => setShowConfirm(false)}
                    onSubmit={submitMerge}
                    progressText={progressText}
                    sourceOffices={sourceOffices}
                />
            ) : null}
        </main>
    );
}

function OfficeConsolidationHero({ companyName }: { companyName: string }) {
    return (
        <section className="rounded-[1.75rem] border border-white/10 bg-[linear-gradient(135deg,#07111f_0%,#102542_48%,#0f766e_100%)] p-4 text-white shadow-2xl shadow-slate-950/25 sm:p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/12 ring-1 ring-white/20 backdrop-blur">
                        <GitMerge size={24} />
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-100">Administration · {companyName}</p>
                        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">OFFICE CONSOLIDATION CENTRE</h1>
                        <p className="mt-1 max-w-4xl text-sm font-semibold leading-6 text-slate-200">
                            Merge selected offices into one secure operational office while preserving users, financial records and historical data.
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <StatusChip label="Admin only" tone="blue" />
                    <StatusChip label="Live Supabase data" tone="green" />
                    <StatusChip label="Fully audited" tone="orange" />
                    <StatusChip label="Financial reconciliation protected" tone="green" />
                </div>
            </div>
        </section>
    );
}

function MergeStepIndicator({ activeStep, mergeResult }: { activeStep: number; mergeResult: boolean }) {
    return (
        <section className="MergeStepIndicator enterprise-card overflow-hidden p-3">
            <div className="flex gap-2 overflow-x-auto pb-1 lg:grid lg:grid-cols-6 lg:overflow-visible">
                {STEP_ITEMS.map((step) => {
                    const Icon = step.icon;
                    const state: StepState = mergeResult || step.id < activeStep ? "completed" : step.id === activeStep ? "active" : "pending";
                    return (
                        <div key={step.id} className={`min-w-[168px] rounded-2xl border p-3 ${state === "completed" ? "border-emerald-200 bg-emerald-50" : state === "active" ? "border-cyan-200 bg-cyan-50" : "border-slate-200 bg-slate-50"}`}>
                            <div className="flex items-center gap-2">
                                <span className={`grid h-8 w-8 place-items-center rounded-xl text-xs font-black ${state === "completed" ? "bg-emerald-600 text-white" : state === "active" ? "bg-cyan-700 text-white" : "bg-white text-slate-500"}`}>
                                    {state === "completed" ? <CheckCircle2 size={15} /> : step.id}
                                </span>
                                <Icon className={state === "pending" ? "text-slate-400" : "text-slate-800"} size={17} />
                            </div>
                            <p className="mt-2 text-xs font-black uppercase tracking-wide text-slate-500">Step {step.id}</p>
                            <p className="text-sm font-black text-slate-950">{step.label}</p>
                            <p className="text-xs font-bold capitalize text-slate-500">{state}</p>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

function OfficeSelectionCard({ filteredOffices, locationFilter, locationOptions, officeSearch, onClear, onLocationFilter, onSearch, onSelectAll, onStatusFilter, onToggle, selectedIds, statusFilter }: {
    filteredOffices: OfficeMergeSourceOffice[];
    locationFilter: string;
    locationOptions: string[];
    officeSearch: string;
    onClear: () => void;
    onLocationFilter: (value: string) => void;
    onSearch: (value: string) => void;
    onSelectAll: () => void;
    onStatusFilter: (value: string) => void;
    onToggle: (id: string) => void;
    selectedIds: string[];
    statusFilter: string;
}) {
    return (
        <section className="OfficeSelectionCard enterprise-card p-4">
            <PanelHeader icon={<Building2 size={21} />} eyebrow="Step 1" title="Select Source Offices" description="Choose active offices that should become one secure merged office." />
            <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px]">
                <label className="relative min-w-0">
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input value={officeSearch} onChange={(event) => onSearch(event.target.value)} placeholder="Search by office, code, location or status" className="h-11 w-full rounded-2xl border border-slate-200 bg-white pl-9 pr-3 text-sm font-bold text-slate-950 outline-none focus:border-cyan-400" />
                </label>
                <select value={statusFilter} onChange={(event) => onStatusFilter(event.target.value)} className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-cyan-400">
                    <option value="all">All statuses</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="merged">Merged</option>
                </select>
                <select value={locationFilter} onChange={(event) => onLocationFilter(event.target.value)} className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-cyan-400 sm:col-span-2">
                    <option value="all">All locations</option>
                    {locationOptions.map((location) => <option key={location} value={location}>{location}</option>)}
                </select>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-slate-50 p-3">
                <p className="text-sm font-black text-slate-950">SELECTED FOR MERGE: {selectedIds.length} OFFICE{selectedIds.length === 1 ? "" : "S"}</p>
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={onSelectAll} className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white">Select all visible</button>
                    <button type="button" onClick={onClear} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">Clear selection</button>
                </div>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {filteredOffices.map((office) => <OfficeSelectableTile key={office.id} office={office} selected={selectedIds.includes(office.id)} onToggle={onToggle} />)}
                {filteredOffices.length === 0 ? <p className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-500 sm:col-span-2">No offices match this search.</p> : null}
            </div>
        </section>
    );
}

function OfficeSelectableTile({ office, onToggle, selected }: { office: OfficeMergeSourceOffice; onToggle: (id: string) => void; selected: boolean }) {
    const disabled = isInactive(office.status);
    return (
        <button
            type="button"
            onClick={() => !disabled && onToggle(office.id)}
            disabled={disabled}
            className={`min-w-0 rounded-2xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-55 ${selected ? "border-cyan-300 bg-cyan-50 shadow-lg shadow-cyan-500/10" : "border-slate-200 bg-white hover:bg-slate-50"}`}
            title={disabled ? "This office cannot be selected because it is inactive, archived, or already merged." : "Select source office"}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="break-words text-sm font-black text-slate-950">{office.name}</p>
                    <p className="text-xs font-bold text-slate-500">{office.code} · {office.location}</p>
                </div>
                <StatusChip label={selected ? "selected" : office.status} tone={selected ? "blue" : office.status === "active" ? "green" : "slate"} />
            </div>
            {disabled ? <p className="mt-2 rounded-xl bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-500">Unavailable: already inactive, archived, or merged.</p> : null}
            <div className="mt-3 grid grid-cols-3 gap-1.5">
                <Mini label="Landlords" value={office.counts.landlords ?? 0} />
                <Mini label="Rooms" value={office.counts.rooms ?? 0} />
                <Mini label="Tenants" value={office.counts.tenants ?? 0} />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
                <Mini label="Employees" value={office.counts.employees ?? 0} />
                <div className="rounded-xl bg-slate-50 px-2 py-2 text-center">
                    <p className="text-[10px] font-black uppercase text-slate-400">Rent roll</p>
                    <p className="break-words text-xs font-black text-slate-950">{money(office.rentRoll)}</p>
                </div>
            </div>
            <p className="mt-2 text-[11px] font-bold text-slate-500">Office cash and landlord liabilities remain ledger-protected during merge.</p>
        </button>
    );
}

function NewMergedOfficeForm(props: {
    confirmNewOfficePin: string;
    duplicateOfficeCode: boolean;
    duplicateOfficeName: boolean;
    effectiveOfficeCode: string;
    newOfficeCode: string;
    newOfficeEmail: string;
    newOfficeLocation: string;
    newOfficeName: string;
    newOfficePhone: string;
    newOfficePin: string;
    onConfirmPin: (value: string) => void;
    onEmail: (value: string) => void;
    onLocation: (value: string) => void;
    onName: (value: string) => void;
    onOfficeCode: (value: string) => void;
    onPhone: (value: string) => void;
    onPin: (value: string) => void;
    onToggleShowPin: () => void;
    pinIsWeak: boolean;
    showPin: boolean;
}) {
    const pinReady = /^\d{6}$/.test(props.newOfficePin) && props.newOfficePin === props.confirmNewOfficePin && !props.pinIsWeak;
    return (
        <section className="NewMergedOfficeForm enterprise-card p-4">
            <PanelHeader icon={<KeyRound size={21} />} eyebrow="Step 2" title="NEW MERGED OFFICE SETUP" description="Configure the destination office and its secure login before merge execution." />
            <div className="mt-4 grid gap-3">
                <FloatingInput error={props.duplicateOfficeName ? "Office name already exists." : ""} label="New office name" onChange={props.onName} placeholder="Nakiwogo Consolidated Office" value={props.newOfficeName} />
                <div className="grid gap-3 md:grid-cols-2">
                    <FloatingInput error={props.duplicateOfficeCode ? "Office code already exists." : ""} label="Office code" onChange={(value) => props.onOfficeCode(value.toUpperCase())} placeholder={props.effectiveOfficeCode || "Auto-generated"} value={props.newOfficeCode} />
                    <FloatingInput label="Location" onChange={props.onLocation} placeholder="Nakiwogo" value={props.newOfficeLocation} />
                    <FloatingInput label="Contact phone" onChange={props.onPhone} placeholder="+256..." value={props.newOfficePhone} />
                    <FloatingInput label="Contact email" onChange={props.onEmail} placeholder="office@example.com" type="email" value={props.newOfficeEmail} />
                </div>
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                    <FloatingInput error={!props.newOfficePin ? "" : !/^\d{6}$/.test(props.newOfficePin) ? "PIN must contain exactly six digits." : props.pinIsWeak ? "Choose a stronger PIN." : ""} inputMode="numeric" label="New office login PIN" maxLength={6} onChange={(value) => props.onPin(value.replace(/\D/g, "").slice(0, 6))} type={props.showPin ? "text" : "password"} value={props.newOfficePin} />
                    <FloatingInput error={!props.confirmNewOfficePin || props.confirmNewOfficePin === props.newOfficePin ? "" : "PIN confirmation does not match."} inputMode="numeric" label="Confirm login PIN" maxLength={6} onChange={(value) => props.onConfirmPin(value.replace(/\D/g, "").slice(0, 6))} type={props.showPin ? "text" : "password"} value={props.confirmNewOfficePin} />
                    <button type="button" onClick={props.onToggleShowPin} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700">
                        {props.showPin ? <EyeOff size={16} /> : <Eye size={16} />} {props.showPin ? "Hide" : "Show"}
                    </button>
                </div>
                <div className={`rounded-2xl border p-3 ${pinReady ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
                    <div className="flex gap-2">
                        <LockKeyhole className={pinReady ? "text-emerald-700" : "text-amber-700"} size={18} />
                        <p className={`text-xs font-black leading-5 ${pinReady ? "text-emerald-900" : "text-amber-900"}`}>
                            {pinReady ? "Secure PIN configured" : "The new PIN will become the login PIN for the merged office. Old source-office PINs will stop working after a successful merge."}
                        </p>
                    </div>
                </div>
            </div>
        </section>
    );
}

function AccountTransferPanel({ accountHandling, affectedCounts, onAccountHandling, sourceOffices }: { accountHandling: AccountHandling; affectedCounts: Record<string, number>; onAccountHandling: (value: AccountHandling) => void; sourceOffices: OfficeMergeSourceOffice[] }) {
    const moving = accountHandling === "deactivate_all" ? 0 : Number(affectedCounts.officeUsers ?? 0) + Number(affectedCounts.officeAccounts ?? 0) + Number(affectedCounts.collectorAccounts ?? 0);
    const inactive = accountHandling === "deactivate_all" ? moving : 0;
    return (
        <section className="AccountTransferPanel enterprise-card p-4">
            <PanelHeader icon={<UsersRound size={21} />} eyebrow="Step 3" title="STAFF AND ACCOUNT TRANSFER" description="Keep staff handling simple while the server preserves role history and audit trails." />
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <button type="button" onClick={() => onAccountHandling("move_all")} className={`rounded-2xl border p-3 text-left ${accountHandling === "move_all" ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"}`}>
                    <p className="text-sm font-black text-slate-950">Move all active accounts</p>
                    <p className="text-xs font-bold text-slate-500">Recommended for continuity.</p>
                </button>
                <button type="button" onClick={() => onAccountHandling("select")} className={`rounded-2xl border p-3 text-left ${accountHandling === "select" ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"}`}>
                    <p className="text-sm font-black text-slate-950">Select individually</p>
                    <p className="text-xs font-bold text-slate-500">Review after preview.</p>
                </button>
                <button type="button" onClick={() => onAccountHandling("deactivate_all")} className={`rounded-2xl border p-3 text-left ${accountHandling === "deactivate_all" ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"}`}>
                    <p className="text-sm font-black text-slate-950">Deactivate source accounts</p>
                    <p className="text-xs font-bold text-slate-500">Use only when replacing logins.</p>
                </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <CompactMetric label="Accounts moving" value={moving.toLocaleString()} />
                <CompactMetric label="Remaining inactive" value={inactive.toLocaleString()} />
                <CompactMetric label="Duplicate assignments" value="Checked at merge" />
                <CompactMetric label="Conflicts" value="See review panel" />
            </div>
            <div className="mt-3 space-y-2">
                {sourceOffices.length === 0 ? <p className="rounded-2xl bg-slate-50 p-3 text-sm font-bold text-slate-500">Select offices to review transfer groups.</p> : sourceOffices.map((office) => (
                    <div key={office.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-black text-slate-950">{office.name}</p>
                            <StatusChip label={accountHandling === "deactivate_all" ? "Deactivate source accounts" : "Move to new office"} tone={accountHandling === "deactivate_all" ? "red" : "green"} />
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                            <Mini label="Office users" value={office.counts.officeUsers ?? 0} />
                            <Mini label="Office accounts" value={office.counts.officeAccounts ?? 0} />
                            <Mini label="Collectors" value={office.counts.collectorAccounts ?? 0} />
                            <Mini label="Employees" value={office.counts.employees ?? 0} />
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}

function LiveMergePreview({ affectedCounts, cleanedOfficeName, effectiveOfficeCode, estimatedRecords, newOfficeLocation, pinReady, rentRoll, sourceOffices }: {
    affectedCounts: Record<string, number>;
    cleanedOfficeName: string;
    effectiveOfficeCode: string;
    estimatedRecords: number;
    newOfficeLocation: string;
    pinReady: boolean;
    rentRoll: number;
    sourceOffices: OfficeMergeSourceOffice[];
}) {
    return (
        <section className="LiveMergePreview enterprise-card overflow-hidden">
            <div className="border-b border-slate-200 p-4">
                <PanelHeader icon={<Database size={21} />} eyebrow="Step 4" title="LIVE MERGE PREVIEW" description="Canonical Supabase counts for records that will move. The browser never submits these counts back to the merge service." />
            </div>
            <div className="grid grid-cols-2 gap-2 p-4 lg:grid-cols-4">
                <Kpi label="Source offices" value={sourceOffices.length.toLocaleString()} tone="slate" />
                <Kpi label="Landlords" value={(affectedCounts.landlords ?? 0).toLocaleString()} tone="emerald" />
                <Kpi label="Rooms" value={(affectedCounts.rooms ?? 0).toLocaleString()} tone="cyan" />
                <Kpi label="Monthly rent roll" value={money(rentRoll)} tone="blue" />
                <Kpi label="Tenants" value={(affectedCounts.tenants ?? 0).toLocaleString()} tone="indigo" />
                <Kpi label="Employees" value={(affectedCounts.employees ?? 0).toLocaleString()} tone="purple" />
                <Kpi label="Receipts" value={(affectedCounts.receipts ?? 0).toLocaleString()} tone="orange" />
                <Kpi label="Estimated records" value={estimatedRecords.toLocaleString()} tone="slate" />
            </div>
            <div className="grid grid-cols-2 gap-2 px-4 pb-4 md:grid-cols-4">
                <CompactMetric label="New office" value={cleanedOfficeName || "Not entered"} />
                <CompactMetric label="Office code" value={effectiveOfficeCode || "Auto"} />
                <CompactMetric label="Location" value={newOfficeLocation || "Optional"} />
                <CompactMetric label="Secure PIN" value={pinReady ? "Secure PIN configured" : "Setup required"} />
            </div>
            <details className="border-t border-slate-200 px-4 py-3" open>
                <summary className="cursor-pointer text-sm font-black text-slate-800">RECORDS THAT WILL MOVE</summary>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    {RECORD_GROUPS.map((group) => (
                        <div key={group.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                            <p className="text-xs font-black uppercase tracking-wide text-slate-500">{group.title}</p>
                            <div className="mt-2 grid grid-cols-2 gap-2">
                                {group.keys.map((key) => <CompactMetric key={key} label={countLabel(key)} value={(affectedCounts[key] ?? 0).toLocaleString()} />)}
                            </div>
                        </div>
                    ))}
                </div>
            </details>
        </section>
    );
}

function FinancialIntegrityPanel({ affectedCounts, rentRoll, sourceOffices, status }: { affectedCounts: Record<string, number>; rentRoll: number; sourceOffices: OfficeMergeSourceOffice[]; status: string }) {
    return (
        <section className="FinancialIntegrityPanel enterprise-card p-4">
            <PanelHeader icon={<Banknote size={21} />} eyebrow="Reconciliation" title="FINANCIAL INTEGRITY CHECK" description="No financial transaction will be deleted or duplicated. Company totals must remain unchanged." />
            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                <IntegrityColumn title="Before Merge" rentRoll={rentRoll} affectedCounts={affectedCounts} officeCount={sourceOffices.length} />
                <IntegrityColumn title="Expected After Merge" rentRoll={rentRoll} affectedCounts={affectedCounts} officeCount={sourceOffices.length ? 1 : 0} />
            </div>
            <div className={`mt-3 rounded-2xl border p-3 ${status === "Balanced" ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className={`text-sm font-black ${status === "Balanced" ? "text-emerald-900" : "text-amber-900"}`}>Status: {status}</p>
                    <StatusChip label={status === "Balanced" ? "Balanced" : "Requires Review"} tone={status === "Balanced" ? "green" : "orange"} />
                </div>
            </div>
        </section>
    );
}

function IntegrityColumn({ affectedCounts, officeCount, rentRoll, title }: { affectedCounts: Record<string, number>; officeCount: number; rentRoll: number; title: string }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-3">
            <p className="text-sm font-black text-slate-950">{title}</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
                <CompactMetric label="Office count" value={officeCount.toLocaleString()} />
                <CompactMetric label="Rent roll" value={money(rentRoll)} />
                <CompactMetric label="Collections" value={(affectedCounts.collections ?? 0).toLocaleString()} />
                <CompactMetric label="Expenses" value={(affectedCounts.expenses ?? 0).toLocaleString()} />
                <CompactMetric label="Landlord payables" value={(affectedCounts.landlordPayables ?? 0).toLocaleString()} />
                <CompactMetric label="Receipts" value={(affectedCounts.receipts ?? 0).toLocaleString()} />
            </div>
        </div>
    );
}

function ConflictReviewPanel({ conflicts }: { conflicts: Array<{ issue: string; record: string; resolution: string; blocking: boolean }> }) {
    return (
        <section className="ConflictReviewPanel enterprise-card p-4">
            <PanelHeader icon={<SlidersHorizontal size={21} />} eyebrow="Safety" title="Conflict Review" description="Blocking conflicts prevent final submission; advisory items remain visible for Admin review." />
            <div className="mt-3 space-y-2">
                {conflicts.length === 0 ? (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                        <p className="font-black text-emerald-900">No blocking conflicts detected.</p>
                        <p className="text-xs font-bold text-emerald-800">Duplicate assignments, active merge jobs and office constraints are checked again server-side before any data moves.</p>
                    </div>
                ) : conflicts.map((conflict) => (
                    <div key={`${conflict.issue}-${conflict.record}`} className={`rounded-2xl border p-3 ${conflict.blocking ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className={`text-sm font-black ${conflict.blocking ? "text-red-950" : "text-amber-950"}`}>{conflict.issue}</p>
                            <StatusChip label={conflict.blocking ? "Blocking Conflict" : "Requires Review"} tone={conflict.blocking ? "red" : "orange"} />
                        </div>
                        <p className="mt-1 text-xs font-bold text-slate-700">{conflict.record}</p>
                        <p className="mt-1 text-xs font-bold text-slate-500">{conflict.resolution}</p>
                    </div>
                ))}
            </div>
        </section>
    );
}

function FinalMergeConfirmation(props: {
    accountHandling: AccountHandling;
    canOpenConfirmation: boolean;
    cleanedOfficeName: string;
    confirmation: string;
    confirmationIsValid: boolean;
    effectiveOfficeCode: string;
    estimatedRecords: number;
    isSubmitting: boolean;
    newOfficeLocation: string;
    onConfirmation: (value: string) => void;
    onOpenConfirmation: () => void;
    onReset: () => void;
    reasonNote: string;
    rentRoll: number;
    setReasonNote: (value: string) => void;
    sourceOffices: OfficeMergeSourceOffice[];
    validationMessage: string;
}) {
    return (
        <section className="FinalMergeConfirmation enterprise-card p-4">
            <PanelHeader icon={<ShieldCheck size={21} />} eyebrow="Step 5" title="FINAL MERGE CONFIRMATION" description="Review the destination, source offices and protected financial summary before opening the final modal." />
            <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3">
                <CompactMetric label="Source offices" value={props.sourceOffices.map((office) => office.name).join(", ") || "None selected"} />
                <CompactMetric label="New office" value={props.cleanedOfficeName || "Not entered"} />
                <CompactMetric label="Office code" value={props.effectiveOfficeCode || "Auto"} />
                <CompactMetric label="Location" value={props.newOfficeLocation || "Optional"} />
                <CompactMetric label="Secure PIN" value="Secure PIN configured after validation" />
                <CompactMetric label="Estimated affected records" value={props.estimatedRecords.toLocaleString()} />
                <CompactMetric label="Rent roll" value={money(props.rentRoll)} />
                <CompactMetric label="Accounts" value={props.accountHandling === "deactivate_all" ? "Deactivate selected/source accounts" : props.accountHandling === "select" ? "Selective transfer" : "Move all active accounts"} />
                <CompactMetric label="Financial status" value={props.validationMessage ? "Requires review" : "Balanced"} />
            </div>
            <label className="mt-3 block space-y-1">
                <span className="text-xs font-black uppercase tracking-wide text-slate-500">Merge reason or note</span>
                <textarea value={props.reasonNote} onChange={(event) => props.setReasonNote(event.target.value)} placeholder="Reason for this consolidation..." className="min-h-20 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-950 outline-none focus:border-cyan-400" />
            </label>
            <label className="mt-3 block space-y-1">
                <span className="text-xs font-black uppercase tracking-wide text-slate-500">Type MERGE OFFICES</span>
                <input value={props.confirmation} onChange={(event) => props.onConfirmation(event.target.value)} placeholder="MERGE OFFICES" className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-950 outline-none focus:border-cyan-400" />
            </label>
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-900">
                The selected source offices will become archived after a successful and fully reconciled merge. Their historical records will remain available for audit.
            </div>
            {props.validationMessage ? <p className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm font-black text-red-900">{props.validationMessage}</p> : null}
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={props.onReset} disabled={props.isSubmitting} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 disabled:opacity-50">
                    <XCircle size={16} /> Cancel Preview
                </button>
                <button type="button" onClick={props.onOpenConfirmation} disabled={!props.canOpenConfirmation || !props.confirmationIsValid || props.isSubmitting} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-lg shadow-slate-300 disabled:cursor-not-allowed disabled:bg-slate-300">
                    <GitMerge size={16} /> Merge Offices
                </button>
            </div>
        </section>
    );
}

function MergeProgressTimeline({ active, mergeResult, progressText }: { active: boolean; mergeResult: MergeResult | null; progressText: string | null }) {
    return (
        <section className="MergeProgressTimeline enterprise-card p-4">
            <PanelHeader icon={<Clock3 size={21} />} eyebrow="Step 6" title={mergeResult ? "OFFICE MERGE COMPLETED SUCCESSFULLY" : active ? "OFFICE MERGE IN PROGRESS" : "Track Completion"} description="The timeline reflects the protected server-side merge stages and recent completion result." />
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {PROGRESS_STAGES.map((stage, index) => {
                    const completed = Boolean(mergeResult) || (active && index === 0);
                    const current = active && index === 0;
                    return (
                        <div key={stage} className={`rounded-2xl border p-3 ${completed ? "border-emerald-200 bg-emerald-50" : current ? "border-cyan-200 bg-cyan-50" : "border-slate-200 bg-slate-50"}`}>
                            <div className="flex items-center gap-2">
                                {current ? <Loader2 className="animate-spin text-cyan-700" size={15} /> : completed ? <CheckCircle2 className="text-emerald-700" size={15} /> : <span className="h-3 w-3 rounded-full bg-slate-300" />}
                                <p className="text-xs font-black text-slate-800">{stage}</p>
                            </div>
                        </div>
                    );
                })}
            </div>
            {progressText ? <p className="mt-3 rounded-2xl bg-cyan-50 p-3 text-sm font-black text-cyan-900">{progressText}</p> : null}
            {mergeResult ? <p className="mt-3 rounded-2xl bg-emerald-50 p-3 text-sm font-black text-emerald-900">Reference {mergeResult.mergeReference} · batch {mergeResult.batchId}</p> : null}
        </section>
    );
}

function MergeCompletionSummary({ result }: { result: MergeResult }) {
    return (
        <section className="MergeCompletionSummary rounded-[2rem] border border-emerald-200 bg-emerald-50 p-5 shadow-xl shadow-emerald-500/10">
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
                        <CompactMetric label="Accounts moved" value={result.accountsReassigned.toLocaleString()} />
                        <CompactMetric label="Completion time" value={new Date(result.mergedAt).toLocaleString()} />
                        <CompactMetric label="Merge reference" value={result.mergeReference} />
                        <CompactMetric label="Financial totals" value="Reconciled" />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                        <a href="/office" className="rounded-2xl bg-emerald-700 px-4 py-2 text-sm font-black text-white">Open New Office</a>
                        <a href="/office/admin/office-merge" className="rounded-2xl bg-white px-4 py-2 text-sm font-black text-emerald-800">View Merge Audit</a>
                        <a href="/office/admin" className="rounded-2xl bg-white px-4 py-2 text-sm font-black text-emerald-800">Return to Administration</a>
                    </div>
                    <p className="mt-3 rounded-2xl bg-white/80 px-4 py-3 text-xs font-bold text-emerald-900">Copy login instructions from the success screen only if the Admin retained the PIN securely. The raw PIN is not displayed after completion.</p>
                </div>
            </div>
        </section>
    );
}

function MergeHistoryPanel({ history }: { history: OfficeMergeHistoryRow[] }) {
    return (
        <section className="MergeHistoryPanel enterprise-card p-4">
            <PanelHeader icon={<Archive size={21} />} eyebrow="Audit" title="Recent Merge Batches" description="Durable merge references, status and financial reconciliation history." />
            <div className="mt-4 space-y-2">
                {history.length === 0 ? (
                    <p className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-500">No office merge batches recorded yet.</p>
                ) : history.map((batch) => (
                    <div key={batch.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-black text-slate-950">{batch.newOfficeName}</p>
                            <StatusChip label={batch.status} tone={batch.status === "completed" ? "green" : batch.status === "failed" ? "red" : "orange"} />
                        </div>
                        <p className="mt-1 text-xs font-bold text-slate-500">{batch.sourceOfficeNames.join(", ") || "Source offices not recorded"}</p>
                        <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
                            <CompactMetric label="Date" value={batch.createdAt ? new Date(batch.createdAt).toLocaleDateString() : "Not set"} />
                            <CompactMetric label="Progress" value={batch.status === "completed" ? "100%" : "Review"} />
                            <CompactMetric label="Records affected" value={Object.values(batch.affectedCounts ?? {}).reduce((sum, value) => sum + Number(value ?? 0), 0).toLocaleString()} />
                            <CompactMetric label="Reconciliation" value={batch.status === "completed" ? "Balanced" : "Review"} />
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}

function ConfirmationModal(props: {
    accountHandling: AccountHandling;
    affectedCounts: Record<string, number>;
    canExecute: boolean;
    cleanedOfficeName: string;
    effectiveOfficeCode: string;
    isSubmitting: boolean;
    message: string | null;
    newOfficeLocation: string;
    onCancel: () => void;
    onSubmit: () => void;
    progressText: string | null;
    sourceOffices: OfficeMergeSourceOffice[];
}) {
    return (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/70 p-4 backdrop-blur-sm" onClick={(event) => event.target === event.currentTarget && !props.isSubmitting ? props.onCancel() : null}>
            <section className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-[2rem] border border-white/20 bg-white p-5 shadow-2xl">
                <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <p className="text-xs font-black uppercase tracking-[0.2em] text-red-600">Final confirmation</p>
                        <h2 className="text-2xl font-black text-slate-950">Merge selected offices into “{props.cleanedOfficeName}”?</h2>
                        <p className="mt-1 text-sm font-bold text-slate-500">The server will reload live Supabase records and execute the canonical merge path.</p>
                    </div>
                    <button type="button" onClick={props.onCancel} disabled={props.isSubmitting} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 disabled:opacity-50">
                        <XCircle size={16} /> Back
                    </button>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
                    <ConfirmCard title="Source offices" value={props.sourceOffices.map((office) => office.name).join(", ")} tone="orange" />
                    <ConfirmCard title="New merged office" value={props.cleanedOfficeName} tone="green" />
                    <ConfirmCard title="Secure PIN" value="Secure PIN configured" tone="blue" />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                    <CompactMetric label="Office code" value={props.effectiveOfficeCode} />
                    <CompactMetric label="Location" value={props.newOfficeLocation || "Optional"} />
                    <CompactMetric label="Account handling" value={props.accountHandling === "deactivate_all" ? "Deactivate" : props.accountHandling === "select" ? "Selective" : "Move active"} />
                    <CompactMetric label="Rent roll" value={money(props.sourceOffices.reduce((total, office) => total + office.rentRoll, 0))} />
                    {COUNT_TABLES.slice(0, 8).map((item) => <CompactMetric key={item.key} label={item.label} value={(props.affectedCounts[item.key] ?? 0).toLocaleString()} />)}
                </div>
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <div className="flex gap-3">
                        <AlertTriangle className="mt-1 shrink-0 text-amber-600" size={20} />
                        <div className="text-sm font-bold leading-6 text-amber-900">
                            <p>The selected source offices will become archived after a successful and fully reconciled merge. Their historical records will remain available for audit.</p>
                            <p className="mt-1">The browser sends stable IDs, confirmation data and the setup fields only; financial rows are reloaded server-side.</p>
                        </div>
                    </div>
                </div>
                {props.message ? <Message tone="error" text={props.message} /> : null}
                {props.progressText ? (
                    <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-black text-blue-900">
                        <div className="flex items-center gap-2"><Loader2 className="animate-spin" size={16} />{props.progressText}</div>
                    </div>
                ) : null}
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <button type="button" onClick={props.onCancel} disabled={props.isSubmitting} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 disabled:opacity-50">
                        Cancel safely
                    </button>
                    <button type="button" onClick={props.onSubmit} disabled={!props.canExecute || props.isSubmitting} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-emerald-200 disabled:cursor-not-allowed disabled:bg-slate-300">
                        {props.isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                        {props.isSubmitting ? "Starting secure merge..." : "Merge Offices"}
                    </button>
                </div>
            </section>
        </div>
    );
}

function PanelHeader({ description, eyebrow, icon, title }: { description: string; eyebrow: string; icon: React.ReactNode; title: string }) {
    return (
        <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-700">{eyebrow}</p>
                <h2 className="mt-1 text-lg font-black text-slate-950">{title}</h2>
                <p className="mt-1 text-xs font-bold leading-5 text-slate-500">{description}</p>
            </div>
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-slate-950 text-white">{icon}</div>
        </div>
    );
}

function FloatingInput({ error, inputMode, label, maxLength, onChange, placeholder, type = "text", value }: { error?: string; inputMode?: "numeric"; label: string; maxLength?: number; onChange: (value: string) => void; placeholder?: string; type?: string; value: string }) {
    return (
        <label className="block min-w-0 space-y-1">
            <span className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</span>
            <input inputMode={inputMode} maxLength={maxLength} type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={`h-12 w-full rounded-2xl border bg-white px-3 text-sm font-bold text-slate-950 outline-none transition focus:ring-4 ${error ? "border-red-300 focus:border-red-400 focus:ring-red-100" : "border-slate-200 focus:border-cyan-400 focus:ring-cyan-100"}`} />
            {error ? <span className="text-xs font-bold text-red-700">{error}</span> : null}
        </label>
    );
}

function Message({ tone, text }: { tone: "success" | "error" | "info"; text: string }) {
    const cls = tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : tone === "error" ? "border-red-200 bg-red-50 text-red-900" : "border-blue-200 bg-blue-50 text-blue-900";
    return <p className={`rounded-2xl border px-4 py-3 text-sm font-black ${cls}`}>{text}</p>;
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

function Kpi({ label, tone, value }: { label: string; tone: "slate" | "emerald" | "cyan" | "blue" | "indigo" | "purple" | "orange"; value: string }) {
    const tones = {
        slate: "border-slate-200 bg-slate-50 text-slate-950",
        emerald: "border-emerald-200 bg-emerald-50 text-emerald-950",
        cyan: "border-cyan-200 bg-cyan-50 text-cyan-950",
        blue: "border-blue-200 bg-blue-50 text-blue-950",
        indigo: "border-indigo-200 bg-indigo-50 text-indigo-950",
        purple: "border-purple-200 bg-purple-50 text-purple-950",
        orange: "border-orange-200 bg-orange-50 text-orange-950",
    } as const;
    return (
        <div className={`min-w-0 rounded-2xl border p-3 ${tones[tone]}`}>
            <p className="text-[10px] font-black uppercase tracking-wide opacity-60">{label}</p>
            <p className="mt-1 break-words text-xl font-black tabular-nums">{value}</p>
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
        <div className="rounded-xl bg-slate-50 px-2 py-2 text-center">
            <p className="text-[10px] font-black uppercase text-slate-400">{label}</p>
            <p className="text-sm font-black text-slate-950">{value.toLocaleString()}</p>
        </div>
    );
}

function LiveDataWarnings({ warnings }: { warnings: string[] }) {
    return (
        <section className="rounded-[2rem] border border-orange-200 bg-orange-50 p-5">
            <h2 className="font-black text-orange-900">Live Data Warnings</h2>
            <div className="mt-2 space-y-1 text-xs font-bold text-orange-800">
                {warnings.slice(0, 12).map((warning) => <p key={warning}>{warning}</p>)}
                {warnings.length > 12 ? <p>+ {warnings.length - 12} more schema/count warnings.</p> : null}
            </div>
        </section>
    );
}
