"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Download, FileText, Loader2, Printer, Search, SlidersHorizontal } from "lucide-react";
import { applyBulkPaymentDateCorrection, previewBulkPaymentDateCorrection } from "@/app/actions/collections";
import type { CollectionReportData, CollectionReportFilters, CollectionsRecordsPageData } from "@/lib/collections/types";

type Props = {
    initialData: CollectionsRecordsPageData;
};

type CorrectionPreviewRow = {
    id: string;
    amount: number;
    createdAt: string | null;
    method: string;
    roomNumber: string;
    tenantName: string;
};

type CorrectionPreview = {
    count: number;
    totalAmount: number;
    currentPaymentDate: string;
    correctedPaymentDate: string;
    rows: CorrectionPreviewRow[];
};

const moneyFormatter = new Intl.NumberFormat("en-UG", {
    style: "currency",
    currency: "UGX",
    maximumFractionDigits: 0,
});

function formatMoney(value: number) {
    return moneyFormatter.format(value).replace("UGX", "UGX ");
}

function formatDateTime(value: string) {
    return new Date(value).toLocaleString("en-UG", {
        dateStyle: "medium",
        timeStyle: "short",
    });
}

function buildQuery(filters: CollectionReportFilters) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
        if (value) params.set(key, value);
    }
    return params.toString();
}

function escapeCsv(value: string | number) {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function reportPeriod(report: CollectionReportData) {
    const filters = report.filters;
    if (filters.singleDate) return filters.singleDate;
    if (filters.singleMonth) return filters.singleMonth;
    if (filters.startDate || filters.endDate) return `${filters.startDate ?? "Start"} to ${filters.endDate ?? filters.startDate ?? "End"}`;
    if (filters.startMonth || filters.endMonth) return `${filters.startMonth ?? "Start"} to ${filters.endMonth ?? filters.startMonth ?? "End"}`;
    return "Selected period";
}

function StatCard({ label, value, hint, tone = "slate" }: { label: string; value: string; hint: string; tone?: "green" | "blue" | "amber" | "slate" }) {
    const tones = {
        green: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100",
        blue: "border-sky-400/30 bg-sky-500/10 text-sky-100",
        amber: "border-amber-400/30 bg-amber-500/10 text-amber-100",
        slate: "border-white/10 bg-white/[0.06] text-white",
    };

    return (
        <div className={`rounded-lg border p-4 shadow-sm ${tones[tone]}`}>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/55">{label}</p>
            <p className="mt-2 break-words text-2xl font-semibold leading-tight">{value}</p>
            <p className="mt-1 text-xs text-white/55">{hint}</p>
        </div>
    );
}

export default function CollectionsRecordsCentre({ initialData }: Props) {
    const [filters, setFilters] = useState<CollectionReportFilters>(initialData.report.filters);
    const [report, setReport] = useState<CollectionReportData>(initialData.report);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPrintPreview, setShowPrintPreview] = useState(false);
    const [refreshToken, setRefreshToken] = useState(0);
    const [isCorrectionPending, startCorrectionTransition] = useTransition();
    const [correctionCurrentDate, setCorrectionCurrentDate] = useState("");
    const [correctionTargetDate, setCorrectionTargetDate] = useState("");
    const [correctionReason, setCorrectionReason] = useState("");
    const [correctionPreview, setCorrectionPreview] = useState<CorrectionPreview | null>(null);
    const [selectedCorrectionIds, setSelectedCorrectionIds] = useState<string[]>([]);
    const [correctionMessage, setCorrectionMessage] = useState<string | null>(null);

    const query = useMemo(() => buildQuery(filters), [filters]);
    const selectedCorrectionRows = useMemo(() => {
        if (!correctionPreview) return [];
        const selected = new Set(selectedCorrectionIds);
        return correctionPreview.rows.filter((row) => selected.has(row.id));
    }, [correctionPreview, selectedCorrectionIds]);
    const selectedCorrectionTotal = useMemo(() => selectedCorrectionRows.reduce((total, row) => total + row.amount, 0), [selectedCorrectionRows]);

    useEffect(() => {
        const controller = new AbortController();
        const timer = window.setTimeout(async () => {
            setLoading(true);
            setError(null);
            try {
                const response = await fetch(`/api/collections/report?${query}`, {
                    cache: "no-store",
                    signal: controller.signal,
                });
                const payload = await response.json();
                if (!response.ok) {
                    throw new Error(payload.error ?? "Collections report could not load.");
                }
                setReport(payload.report);
            } catch (requestError) {
                if ((requestError as Error).name !== "AbortError") {
                    setError(requestError instanceof Error ? requestError.message : "Collections report could not load.");
                }
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }, 250);

        return () => {
            controller.abort();
            window.clearTimeout(timer);
        };
    }, [query, refreshToken]);

    function updateFilter(key: keyof CollectionReportFilters, value: string) {
        setFilters((current) => ({ ...current, [key]: value || undefined }));
    }

    function toggleCorrectionRow(id: string) {
        setSelectedCorrectionIds((current) => current.includes(id) ? current.filter((rowId) => rowId !== id) : [...current, id]);
    }

    function exportCsv() {
        const headers = ["Date", "Time", "Room", "Tenant", "Landlord", "Office", "Amount Paid", "Remaining Balance", "Payment Method", "Recorded By"];
        const lines = [
            headers.map(escapeCsv).join(","),
            ...report.rows.map((row) => [
                row.date,
                row.time,
                row.roomNumber,
                row.tenantName,
                row.landlordName,
                row.officeName,
                row.amountPaid,
                row.remainingBalance,
                row.paymentMethod,
                row.recordedBy,
            ].map(escapeCsv).join(",")),
        ];
        const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `collections-report-${reportPeriod(report).replace(/[^a-z0-9-]+/gi, "-").toLowerCase()}.csv`;
        anchor.click();
        URL.revokeObjectURL(url);
    }

    const methodOptions = ["", "cash", "bank", "mobile money", "cheque"];

    return (
        <main className="min-h-screen bg-[#07111f] px-4 py-5 text-white sm:px-6 lg:px-8">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
                <section className="rounded-xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/20">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-200/70">Collections Records</p>
                            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Live Collections Reports</h1>
                            <p className="mt-2 max-w-3xl text-sm text-white/60">
                                View, filter, total, print, and export recorded tenant payments. Payment entry now lives on the dedicated Payments Entry page.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => setShowPrintPreview(true)}
                                className="inline-flex h-10 items-center gap-2 rounded-md border border-white/15 bg-white/10 px-3 text-sm font-semibold text-white hover:bg-white/15"
                            >
                                <Printer className="h-4 w-4" />
                                Print A4 Report
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowPrintPreview(true)}
                                className="inline-flex h-10 items-center gap-2 rounded-md border border-white/15 bg-white/10 px-3 text-sm font-semibold text-white hover:bg-white/15"
                            >
                                <FileText className="h-4 w-4" />
                                Export PDF
                            </button>
                            <button
                                type="button"
                                onClick={exportCsv}
                                className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-400 px-3 text-sm font-semibold text-emerald-950 hover:bg-emerald-300"
                            >
                                <Download className="h-4 w-4" />
                                Export CSV
                            </button>
                        </div>
                    </div>
                </section>

                <section className="rounded-xl border border-white/10 bg-white/[0.05] p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white/80">
                        <SlidersHorizontal className="h-4 w-4 text-sky-200" />
                        Live filters
                        {loading ? <Loader2 className="h-4 w-4 animate-spin text-sky-200" /> : null}
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-white/55">
                            Single date
                            <input
                                type="date"
                                value={filters.singleDate ?? ""}
                                onChange={(event) => updateFilter("singleDate", event.target.value)}
                                className="mt-1 h-10 w-full rounded-md border border-white/10 bg-slate-950 px-3 text-sm text-white outline-none focus:border-sky-300"
                            />
                        </label>
                        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-white/55">
                            Start date
                            <input
                                type="date"
                                value={filters.startDate ?? ""}
                                onChange={(event) => updateFilter("startDate", event.target.value)}
                                className="mt-1 h-10 w-full rounded-md border border-white/10 bg-slate-950 px-3 text-sm text-white outline-none focus:border-sky-300"
                            />
                        </label>
                        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-white/55">
                            End date
                            <input
                                type="date"
                                value={filters.endDate ?? ""}
                                onChange={(event) => updateFilter("endDate", event.target.value)}
                                className="mt-1 h-10 w-full rounded-md border border-white/10 bg-slate-950 px-3 text-sm text-white outline-none focus:border-sky-300"
                            />
                        </label>
                        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-white/55">
                            Payment method
                            <select
                                value={filters.paymentMethod ?? ""}
                                onChange={(event) => updateFilter("paymentMethod", event.target.value)}
                                className="mt-1 h-10 w-full rounded-md border border-white/10 bg-slate-950 px-3 text-sm text-white outline-none focus:border-sky-300"
                            >
                                {methodOptions.map((method) => (
                                    <option key={method || "all"} value={method} className="bg-slate-950 text-white">
                                        {method ? method.replace(/\b\w/g, (letter) => letter.toUpperCase()) : "All methods"}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-white/55">
                            Single month
                            <input
                                type="month"
                                value={filters.singleMonth ?? ""}
                                onChange={(event) => updateFilter("singleMonth", event.target.value)}
                                className="mt-1 h-10 w-full rounded-md border border-white/10 bg-slate-950 px-3 text-sm text-white outline-none focus:border-sky-300"
                            />
                        </label>
                        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-white/55">
                            Start month
                            <input
                                type="month"
                                value={filters.startMonth ?? ""}
                                onChange={(event) => updateFilter("startMonth", event.target.value)}
                                className="mt-1 h-10 w-full rounded-md border border-white/10 bg-slate-950 px-3 text-sm text-white outline-none focus:border-sky-300"
                            />
                        </label>
                        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-white/55">
                            End month
                            <input
                                type="month"
                                value={filters.endMonth ?? ""}
                                onChange={(event) => updateFilter("endMonth", event.target.value)}
                                className="mt-1 h-10 w-full rounded-md border border-white/10 bg-slate-950 px-3 text-sm text-white outline-none focus:border-sky-300"
                            />
                        </label>
                        {initialData.isAdmin ? (
                            <label className="text-xs font-semibold uppercase tracking-[0.16em] text-white/55">
                                Office
                                <select
                                    value={filters.officeId ?? ""}
                                    onChange={(event) => updateFilter("officeId", event.target.value)}
                                    className="mt-1 h-10 w-full rounded-md border border-white/10 bg-slate-950 px-3 text-sm text-white outline-none focus:border-sky-300"
                                >
                                    <option value="" className="bg-slate-950 text-white">All offices</option>
                                    {initialData.offices.map((office) => (
                                        <option key={office.id} value={office.id} className="bg-slate-950 text-white">
                                            {office.name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        ) : null}
                        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-white/55">
                            Room number
                            <div className="mt-1 flex h-10 items-center rounded-md border border-white/10 bg-slate-950 px-3 focus-within:border-sky-300">
                                <Search className="mr-2 h-4 w-4 text-white/35" />
                                <input
                                    value={filters.room ?? ""}
                                    onChange={(event) => updateFilter("room", event.target.value)}
                                    placeholder="T149"
                                    className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30"
                                />
                            </div>
                        </label>
                        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-white/55">
                            Tenant name
                            <div className="mt-1 flex h-10 items-center rounded-md border border-white/10 bg-slate-950 px-3 focus-within:border-sky-300">
                                <Search className="mr-2 h-4 w-4 text-white/35" />
                                <input
                                    value={filters.tenant ?? ""}
                                    onChange={(event) => updateFilter("tenant", event.target.value)}
                                    placeholder="Tenant name"
                                    className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30"
                                />
                            </div>
                        </label>
                    </div>
                    {error ? <p className="mt-3 rounded-md border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{error}</p> : null}
                </section>

                {initialData.isAdmin ? (
                    <section className="rounded-xl border border-amber-300/20 bg-amber-400/[0.07] p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-100/70">Admin correction tool</p>
                                <h2 className="mt-1 text-base font-semibold text-white">Bulk Move Wrong-Date Payments</h2>
                                <p className="mt-1 max-w-3xl text-xs text-white/55">
                                    Use only for payments that were saved under the wrong business date. This changes `payment_date` only; balances and payment amounts are not touched.
                                </p>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[150px_150px_180px_180px]">
                                <input
                                    type="date"
                                    value={correctionCurrentDate}
                                    onChange={(event) => setCorrectionCurrentDate(event.target.value)}
                                    className="h-10 rounded-md border border-white/10 bg-slate-950 px-3 text-sm text-white outline-none focus:border-amber-200"
                                    aria-label="Current wrong payment date"
                                />
                                <input
                                    type="date"
                                    value={correctionTargetDate}
                                    onChange={(event) => setCorrectionTargetDate(event.target.value)}
                                    className="h-10 rounded-md border border-white/10 bg-slate-950 px-3 text-sm text-white outline-none focus:border-amber-200"
                                    aria-label="Correct payment date"
                                />
                                <button
                                    type="button"
                                    disabled={isCorrectionPending || !correctionCurrentDate || !correctionTargetDate}
                                    onClick={() => startCorrectionTransition(async () => {
                                        try {
                                            setCorrectionMessage(null);
                                            const preview = await previewBulkPaymentDateCorrection({
                                                correctedPaymentDate: correctionTargetDate,
                                                currentPaymentDate: correctionCurrentDate,
                                                officeId: filters.officeId ?? null,
                                            });
                                            setCorrectionPreview(preview);
                                            setSelectedCorrectionIds(preview.rows.map((row: CorrectionPreviewRow) => row.id));
                                            setCorrectionMessage(`Preview ready: ${preview.count} payment(s), ${formatMoney(preview.totalAmount)}. Untick any rows that should stay on ${preview.currentPaymentDate}.`);
                                        } catch (previewError) {
                                            setCorrectionPreview(null);
                                            setSelectedCorrectionIds([]);
                                            setCorrectionMessage(previewError instanceof Error ? previewError.message : "Preview failed.");
                                        }
                                    })}
                                    className="inline-flex h-10 items-center justify-center rounded-md border border-amber-200/30 bg-amber-300/15 px-3 text-sm font-semibold text-amber-50 disabled:opacity-45"
                                >
                                    {isCorrectionPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                    Preview
                                </button>
                                <button
                                    type="button"
                                    disabled={isCorrectionPending || !correctionPreview || !selectedCorrectionIds.length || !correctionReason.trim()}
                                    onClick={() => startCorrectionTransition(async () => {
                                        try {
                                            setCorrectionMessage(null);
                                            const result = await applyBulkPaymentDateCorrection({
                                                correctedPaymentDate: correctionTargetDate,
                                                currentPaymentDate: correctionCurrentDate,
                                                officeId: filters.officeId ?? null,
                                                paymentIds: selectedCorrectionIds,
                                                reason: correctionReason,
                                            });
                                            setCorrectionPreview(null);
                                            setSelectedCorrectionIds([]);
                                            setCorrectionReason("");
                                            setCorrectionMessage(`Moved ${result.count} payment(s) to ${result.correctedPaymentDate}.`);
                                            setRefreshToken((value) => value + 1);
                                        } catch (applyError) {
                                            setCorrectionMessage(applyError instanceof Error ? applyError.message : "Correction failed.");
                                        }
                                    })}
                                    className="inline-flex h-10 items-center justify-center rounded-md bg-amber-300 px-3 text-sm font-semibold text-slate-950 disabled:opacity-45"
                                >
                                    Apply Correction
                                </button>
                            </div>
                        </div>
                        <div className="mt-3 grid gap-2 lg:grid-cols-[1fr_260px]">
                            <input
                                value={correctionReason}
                                onChange={(event) => setCorrectionReason(event.target.value)}
                                placeholder="Required reason, e.g. Selected date 18/06/2026 was saved under today by old bug"
                                className="h-10 rounded-md border border-white/10 bg-slate-950 px-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-amber-200"
                            />
                            {correctionPreview ? (
                                <div className="rounded-md border border-amber-200/25 bg-amber-200/10 px-3 py-2 text-xs font-semibold text-amber-50">
                                    {selectedCorrectionIds.length} of {correctionPreview.count} selected · {formatMoney(selectedCorrectionTotal)} from {correctionPreview.currentPaymentDate} to {correctionPreview.correctedPaymentDate}
                                </div>
                            ) : null}
                        </div>
                        {correctionPreview?.rows.length ? (
                            <div className="mt-3 overflow-hidden rounded-lg border border-amber-200/20">
                                <div className="flex flex-col gap-2 border-b border-amber-200/15 bg-slate-950/70 px-3 py-2 text-xs text-amber-50 sm:flex-row sm:items-center sm:justify-between">
                                    <span>Select only the payments that should move to the corrected date.</span>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setSelectedCorrectionIds(correctionPreview.rows.map((row) => row.id))}
                                            className="rounded-md border border-amber-200/25 px-2 py-1 font-semibold"
                                        >
                                            Select all
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedCorrectionIds([])}
                                            className="rounded-md border border-amber-200/25 px-2 py-1 font-semibold"
                                        >
                                            Clear
                                        </button>
                                    </div>
                                </div>
                                <div className="max-h-72 overflow-auto bg-slate-950/50">
                                    <table className="min-w-full text-left text-xs">
                                        <thead className="sticky top-0 bg-slate-950 text-amber-100/70">
                                            <tr>
                                                <th className="px-3 py-2">Move</th>
                                                <th className="px-3 py-2">Created time</th>
                                                <th className="px-3 py-2">Room</th>
                                                <th className="px-3 py-2">Tenant</th>
                                                <th className="px-3 py-2 text-right">Amount</th>
                                                <th className="px-3 py-2">Method</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-amber-200/10 text-white/80">
                                            {correctionPreview.rows.map((row) => (
                                                <tr key={row.id} className={selectedCorrectionIds.includes(row.id) ? "bg-amber-300/10" : ""}>
                                                    <td className="px-3 py-2">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedCorrectionIds.includes(row.id)}
                                                            onChange={() => toggleCorrectionRow(row.id)}
                                                            className="h-4 w-4 accent-amber-300"
                                                        />
                                                    </td>
                                                    <td className="whitespace-nowrap px-3 py-2">{row.createdAt ? formatDateTime(row.createdAt) : "--"}</td>
                                                    <td className="whitespace-nowrap px-3 py-2 font-semibold text-white">{row.roomNumber}</td>
                                                    <td className="whitespace-nowrap px-3 py-2">{row.tenantName}</td>
                                                    <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-amber-50">{formatMoney(row.amount)}</td>
                                                    <td className="whitespace-nowrap px-3 py-2">{row.method}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : null}
                        {correctionMessage ? <p className="mt-2 text-sm text-amber-50">{correctionMessage}</p> : null}
                    </section>
                ) : null}

                <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <StatCard label="Total Collected" value={formatMoney(report.totals.totalAmount)} hint={report.activeOfficeName ?? "Selected scope"} tone="green" />
                    <StatCard label="Payments" value={String(report.totals.paymentCount)} hint={`${report.totals.tenantCount} tenant(s) paid`} tone="blue" />
                    <StatCard label="Cash / Bank" value={`${formatMoney(report.totals.cashTotal)} / ${formatMoney(report.totals.bankTotal)}`} hint="Physical and bank collections" tone="slate" />
                    <StatCard label="Outstanding" value={formatMoney(report.totals.outstandingBalanceRemaining)} hint="Remaining balance from visible rows" tone="amber" />
                </section>

                <section className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]">
                    <div className="flex flex-col gap-1 border-b border-white/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h2 className="text-base font-semibold text-white">Collection Ledger</h2>
                            <p className="text-xs text-white/50">Oldest first, newest last, matching the physical payment book.</p>
                        </div>
                        <p className="text-xs text-white/50">Generated {formatDateTime(report.generatedAt)}</p>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-white/10 text-sm">
                            <thead className="bg-slate-950/70 text-left text-xs uppercase tracking-[0.14em] text-white/45">
                                <tr>
                                    <th className="px-4 py-3">Date</th>
                                    <th className="px-4 py-3">Time</th>
                                    <th className="px-4 py-3">Room</th>
                                    <th className="px-4 py-3">Tenant</th>
                                    <th className="px-4 py-3">Landlord</th>
                                    <th className="px-4 py-3">Office</th>
                                    <th className="px-4 py-3 text-right">Amount Paid</th>
                                    <th className="px-4 py-3 text-right">Remaining Balance</th>
                                    <th className="px-4 py-3">Method</th>
                                    <th className="px-4 py-3">Recorded By</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {report.rows.map((row) => (
                                    <tr key={row.id} className="hover:bg-white/[0.04]">
                                        <td className="whitespace-nowrap px-4 py-3 text-white/75">{row.date}</td>
                                        <td className="whitespace-nowrap px-4 py-3 text-white/65">{row.time}</td>
                                        <td className="whitespace-nowrap px-4 py-3 font-semibold text-white">{row.roomNumber}</td>
                                        <td className="whitespace-nowrap px-4 py-3 text-white/80">{row.tenantName}</td>
                                        <td className="whitespace-nowrap px-4 py-3 text-white/65">{row.landlordName}</td>
                                        <td className="whitespace-nowrap px-4 py-3 text-white/65">{row.officeName}</td>
                                        <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-emerald-200">{formatMoney(row.amountPaid)}</td>
                                        <td className="whitespace-nowrap px-4 py-3 text-right text-amber-100">{formatMoney(row.remainingBalance)}</td>
                                        <td className="whitespace-nowrap px-4 py-3 text-white/65">{row.paymentMethod}</td>
                                        <td className="whitespace-nowrap px-4 py-3 text-white/65">{row.recordedBy}</td>
                                    </tr>
                                ))}
                                {!report.rows.length ? (
                                    <tr>
                                        <td colSpan={10} className="px-4 py-10 text-center text-sm text-white/50">
                                            No collections found for the selected filters.
                                        </td>
                                    </tr>
                                ) : null}
                            </tbody>
                            <tfoot className="border-t border-white/15 bg-slate-950/80 font-semibold text-white">
                                <tr>
                                    <td colSpan={6} className="px-4 py-3">Totals</td>
                                    <td className="px-4 py-3 text-right text-emerald-200">{formatMoney(report.totals.totalAmount)}</td>
                                    <td className="px-4 py-3 text-right text-amber-100">{formatMoney(report.totals.outstandingBalanceRemaining)}</td>
                                    <td colSpan={2} className="px-4 py-3 text-right text-white/60">{report.totals.paymentCount} payment(s)</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </section>
            </div>

            {showPrintPreview ? (
                <PrintPreview report={report} onClose={() => setShowPrintPreview(false)} />
            ) : null}
        </main>
    );
}

function PrintPreview({ report, onClose }: { report: CollectionReportData; onClose: () => void }) {
    return (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-4 print:static print:bg-white print:p-0">
            <div className="mx-auto max-w-6xl">
                <div className="mb-3 flex justify-end gap-2 print:hidden">
                    <button type="button" onClick={onClose} className="h-10 rounded-md border border-white/15 bg-white/10 px-4 text-sm font-semibold text-white">
                        Close
                    </button>
                    <button type="button" onClick={() => window.print()} className="h-10 rounded-md bg-emerald-400 px-4 text-sm font-semibold text-emerald-950">
                        Print / Save PDF
                    </button>
                </div>
                <article className="min-h-[297mm] bg-white p-8 text-slate-950 shadow-2xl print:min-h-0 print:shadow-none">
                    <header className="border-b border-slate-300 pb-5">
                        <div className="flex items-start justify-between gap-6">
                            <div>
                                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-slate-950 text-lg font-bold text-white">D</div>
                                <h1 className="text-2xl font-bold">{report.companyName}</h1>
                                <p className="mt-1 text-sm text-slate-500">Collections A4 Statement</p>
                            </div>
                            <div className="text-right text-sm text-slate-600">
                                <p><span className="font-semibold text-slate-900">Period:</span> {reportPeriod(report)}</p>
                                <p><span className="font-semibold text-slate-900">Office:</span> {report.activeOfficeName ?? "All offices"}</p>
                                <p><span className="font-semibold text-slate-900">Generated:</span> {formatDateTime(report.generatedAt)}</p>
                                <p><span className="font-semibold text-slate-900">Generated by:</span> {report.generatedBy}</p>
                            </div>
                        </div>
                    </header>

                    <section className="my-5 grid grid-cols-4 gap-3">
                        <div className="rounded-md border border-slate-200 p-3">
                            <p className="text-xs uppercase tracking-wide text-slate-500">Total Collected</p>
                            <p className="mt-1 text-lg font-bold">{formatMoney(report.totals.totalAmount)}</p>
                        </div>
                        <div className="rounded-md border border-slate-200 p-3">
                            <p className="text-xs uppercase tracking-wide text-slate-500">Payments</p>
                            <p className="mt-1 text-lg font-bold">{report.totals.paymentCount}</p>
                        </div>
                        <div className="rounded-md border border-slate-200 p-3">
                            <p className="text-xs uppercase tracking-wide text-slate-500">Tenants Paid</p>
                            <p className="mt-1 text-lg font-bold">{report.totals.tenantCount}</p>
                        </div>
                        <div className="rounded-md border border-slate-200 p-3">
                            <p className="text-xs uppercase tracking-wide text-slate-500">Outstanding</p>
                            <p className="mt-1 text-lg font-bold">{formatMoney(report.totals.outstandingBalanceRemaining)}</p>
                        </div>
                    </section>

                    <table className="w-full border-collapse text-xs">
                        <thead>
                            <tr className="bg-slate-100 text-left uppercase tracking-wide text-slate-600">
                                <th className="border border-slate-200 px-2 py-2">Date</th>
                                <th className="border border-slate-200 px-2 py-2">Time</th>
                                <th className="border border-slate-200 px-2 py-2">Room</th>
                                <th className="border border-slate-200 px-2 py-2">Tenant</th>
                                <th className="border border-slate-200 px-2 py-2">Office</th>
                                <th className="border border-slate-200 px-2 py-2 text-right">Paid</th>
                                <th className="border border-slate-200 px-2 py-2 text-right">Balance</th>
                                <th className="border border-slate-200 px-2 py-2">Method</th>
                            </tr>
                        </thead>
                        <tbody>
                            {report.rows.map((row) => (
                                <tr key={row.id}>
                                    <td className="border border-slate-200 px-2 py-2">{row.date}</td>
                                    <td className="border border-slate-200 px-2 py-2">{row.time}</td>
                                    <td className="border border-slate-200 px-2 py-2 font-semibold">{row.roomNumber}</td>
                                    <td className="border border-slate-200 px-2 py-2">{row.tenantName}</td>
                                    <td className="border border-slate-200 px-2 py-2">{row.officeName}</td>
                                    <td className="border border-slate-200 px-2 py-2 text-right font-semibold">{formatMoney(row.amountPaid)}</td>
                                    <td className="border border-slate-200 px-2 py-2 text-right">{formatMoney(row.remainingBalance)}</td>
                                    <td className="border border-slate-200 px-2 py-2">{row.paymentMethod}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="bg-slate-100 font-bold">
                                <td colSpan={5} className="border border-slate-200 px-2 py-2">Totals</td>
                                <td className="border border-slate-200 px-2 py-2 text-right">{formatMoney(report.totals.totalAmount)}</td>
                                <td className="border border-slate-200 px-2 py-2 text-right">{formatMoney(report.totals.outstandingBalanceRemaining)}</td>
                                <td className="border border-slate-200 px-2 py-2">{report.totals.paymentCount} rows</td>
                            </tr>
                        </tfoot>
                    </table>

                    <footer className="mt-10 grid grid-cols-2 gap-10 text-sm">
                        <div>
                            <p className="font-semibold">Prepared By</p>
                            <div className="mt-8 border-t border-slate-300 pt-2 text-slate-500">Name / Signature</div>
                        </div>
                        <div>
                            <p className="font-semibold">Approved By</p>
                            <div className="mt-8 border-t border-slate-300 pt-2 text-slate-500">Name / Signature</div>
                        </div>
                    </footer>
                    <p className="mt-8 text-center text-xs text-slate-400">Page 1 • Printed {formatDateTime(new Date().toISOString())}</p>
                </article>
            </div>
        </div>
    );
}
