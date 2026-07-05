"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Eye, FileDown, Loader2, Printer, RefreshCw, Search, ShieldCheck, X } from "lucide-react";
import { PageHero, StatusChip } from "@/components/office/shared/EnterpriseUI";
import type { StatementCategory, StatementColumn, StatementFilters, StatementRow, StatementsCentreData } from "@/lib/admin-statements/types";

type Props = {
    data: StatementsCentreData;
};

const statementOptions: Record<StatementCategory, Array<{ value: string; label: string }>> = {
    landlords: [
        { value: "individual_landlord_paid", label: "Individual Paid Amount" },
        { value: "individual_landlord_unpaid", label: "Individual Unpaid Amount" },
        { value: "individual_landlord_advances", label: "Individual Advances" },
        { value: "all_landlord_paid", label: "All Paid Landlord Amounts" },
        { value: "all_landlord_unpaid", label: "All Unpaid Landlord Amounts" },
        { value: "all_landlord_advances", label: "All Landlord Advances" },
        { value: "active_landlord_advances", label: "Active Advances" },
        { value: "closed_landlord_advances", label: "Closed Advances" },
        { value: "landlord_advances_with_interest", label: "Advances With Interest" },
        { value: "landlord_advances_without_interest", label: "Advances Without Interest" },
        { value: "outstanding_advance_balance", label: "Outstanding Advance Balance" },
        { value: "expected_future_advance_deductions", label: "Expected Future Deductions" },
        { value: "landlord_advance_history", label: "Advance History" },
        { value: "landlord_advance_interest_earned", label: "Interest Earned" },
    ],
    tenants: [
        { value: "individual_tenant_payments_received", label: "Individual Payments Received" },
        { value: "individual_tenant_payments_not_received", label: "Individual Payments Outstanding" },
        { value: "all_tenant_payments_received", label: "All Tenant Payments Received" },
        { value: "all_unpaid_tenant_payments", label: "All Unpaid Tenant Payments" },
        { value: "all_tenants_paid_in_advance", label: "All Tenants Paid In Advance" },
        { value: "individual_tenant_advance_payments", label: "Individual Tenant Advance Payments" },
    ],
    offices: [
        { value: "office_money_made", label: "Money Made By Each Office" },
        { value: "all_offices_money_made", label: "Money Made By All Offices" },
        { value: "office_landlord_demand", label: "Money Still Demanded By Each Office" },
        { value: "all_offices_landlord_demand", label: "Money Still Demanded Company-wide" },
    ],
};

function money(value: string | number | null | undefined) {
    const numeric = Number(value ?? 0);
    return `UGX ${Math.round(Number.isFinite(numeric) ? numeric : 0).toLocaleString()}`;
}

function display(value: StatementRow[string]) {
    if (typeof value === "number") return money(value);
    return value ?? "";
}

function isMoneyKey(key: string) {
    return /amount|payable|paid|unpaid|advance|deduction|commission|collection|expense|balance|profit|loss|total|rent/i.test(key);
}

function escapeCsv(value: unknown) {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function buildParams(filters: StatementFilters) {
    const params = new URLSearchParams();
    params.set("category", filters.category);
    params.set("statementType", filters.statementType);
    for (const key of ["startDate", "endDate", "startMonth", "endMonth", "singleMonth", "officeId"] as const) {
        if (filters[key]) params.set(key, filters[key]);
    }
    return params;
}

function formatCell(column: StatementColumn, row: StatementRow) {
    const value = row[column.key];
    return isMoneyKey(column.key) ? money(value) : display(value);
}

export default function StatementsCentre({ data }: Props) {
    const [filters, setFilters] = useState<StatementFilters>(data.filters);
    const [statement, setStatement] = useState<StatementsCentreData | null>(null);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [previewOpen, setPreviewOpen] = useState(false);
    const requestKeyRef = useRef("");

    const activeData = statement ?? data;
    const visibleRows = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return activeData.rows;
        return activeData.rows.filter((row) => Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(query)));
    }, [activeData.rows, search]);

    const selectedOffice = useMemo(() => {
        if (!filters.officeId) return "All offices";
        return data.offices.find((office) => office.id === filters.officeId)?.name ?? "Selected office";
    }, [data.offices, filters.officeId]);

    useEffect(() => {
        const params = buildParams(filters);
        const requestKey = params.toString();
        if (!filters.category || !filters.statementType || requestKeyRef.current === requestKey) return;
        requestKeyRef.current = requestKey;
        const controller = new AbortController();
        const timer = window.setTimeout(async () => {
            setLoading(true);
            setError("");
            try {
                const response = await fetch(`/api/admin/statements?${requestKey}`, {
                    cache: "no-store",
                    signal: controller.signal,
                    headers: { Accept: "application/json" },
                });
                const payload = await response.json();
                if (!response.ok) throw new Error(payload.error ?? "Statement could not be loaded.");
                setStatement(payload.data);
                window.history.replaceState(null, "", `/office/admin/statements?${requestKey}`);
            } catch (fetchError) {
                if ((fetchError as Error).name !== "AbortError") {
                    setError(fetchError instanceof Error ? fetchError.message : "Statement could not be loaded.");
                }
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }, 150);

        return () => {
            controller.abort();
            window.clearTimeout(timer);
        };
    }, [filters]);

    function updateFilter(key: keyof StatementFilters, value: string) {
        setSearch("");
        setFilters((current) => {
            if (key === "category") {
                const nextCategory = value as StatementCategory;
                return {
                    ...current,
                    category: nextCategory,
                    statementType: statementOptions[nextCategory][0]?.value ?? "",
                };
            }
            if (current[key] === value) return current;
            return { ...current, [key]: value };
        });
    }

    function refreshStatement() {
        requestKeyRef.current = "";
        setFilters((current) => ({ ...current }));
    }

    function exportCsv() {
        const header = activeData.columns.map((column) => column.label).join(",");
        const lines = visibleRows.map((row) => activeData.columns.map((column) => escapeCsv(formatCell(column, row))).join(","));
        const totals = activeData.columns.map((column, index) => {
            if (index === 0) return "Totals";
            return typeof activeData.totals[column.key] === "number" ? money(activeData.totals[column.key]) : "";
        });
        const csv = [header, ...lines, totals.map(escapeCsv).join(",")].join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${activeData.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    }

    return (
        <main className="enterprise-page">
            <div className="enterprise-shell print:hidden">
                <PageHero
                    title="Statements Centre"
                    subtitle="Admin-only live financial statements for landlords, tenants, and offices from Supabase."
                    badge="Admin -> Statements"
                >
                    <div className="enterprise-card min-w-80 p-5">
                        <p className="text-sm font-bold text-slate-500">Live Statement Total</p>
                        <p className="mt-1 text-3xl font-black text-slate-950">{money(activeData.summary.primaryValue)}</p>
                        <p className="mt-1 text-xs font-black uppercase tracking-wide text-blue-600">
                            {activeData.summary.rowCount.toLocaleString()} live rows - {activeData.summary.periodLabel}
                        </p>
                    </div>
                </PageHero>

                <section className="rounded-[2rem] border border-white/10 bg-slate-950 p-4 text-white shadow-2xl shadow-slate-950/30">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                            <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-200">Statement Filters</p>
                            <h2 className="mt-1 text-2xl font-black">Live Supabase Statement Builder</h2>
                        </div>
                        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-black text-emerald-200">
                            <ShieldCheck size={14} />
                            No-store live fetch
                        </span>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <Select label="Category" value={filters.category} onChange={(value) => updateFilter("category", value)}>
                            <option value="landlords">Landlords</option>
                            <option value="tenants">Tenants</option>
                            <option value="offices">Offices</option>
                        </Select>
                        <Select label="Statement type" value={filters.statementType} onChange={(value) => updateFilter("statementType", value)}>
                            {statementOptions[filters.category].map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </Select>
                        <Select label="Office" value={filters.officeId} onChange={(value) => updateFilter("officeId", value)}>
                            <option value="">All offices</option>
                            {data.offices.map((office) => <option key={office.id} value={office.id}>{office.name}</option>)}
                        </Select>
                        <Input label="Single month" type="month" value={filters.singleMonth} onChange={(value) => updateFilter("singleMonth", value)} />
                        <Input label="Start date" type="date" value={filters.startDate} onChange={(value) => updateFilter("startDate", value)} />
                        <Input label="End date" type="date" value={filters.endDate} onChange={(value) => updateFilter("endDate", value)} />
                        <Input label="Start month" type="month" value={filters.startMonth} onChange={(value) => updateFilter("startMonth", value)} />
                        <Input label="End month" type="month" value={filters.endMonth} onChange={(value) => updateFilter("endMonth", value)} />
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                        <button type="button" onClick={refreshStatement} className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-black text-slate-950 shadow-lg shadow-cyan-500/10">
                            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                            Refresh Live
                        </button>
                        <button type="button" onClick={() => setPreviewOpen(true)} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-black text-white hover:bg-white/15">
                            <Eye size={16} /> Print Preview
                        </button>
                        <button type="button" onClick={() => setPreviewOpen(true)} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-black text-white hover:bg-white/15">
                            <FileDown size={16} /> Export PDF
                        </button>
                        <button type="button" onClick={exportCsv} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-black text-white hover:bg-white/15">
                            <Download size={16} /> Export CSV
                        </button>
                    </div>
                </section>

                {error ? (
                    <section className="mt-6 rounded-[2rem] border border-red-200 bg-red-50 p-5 text-sm font-bold text-red-700">
                        Live data could not load: {error}
                    </section>
                ) : null}

                <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">
                    <StatementKpi label={activeData.summary.primaryLabel} value={money(activeData.summary.primaryValue)} tone="text-emerald-700" loading={loading} />
                    <StatementKpi label={activeData.summary.secondaryLabel} value={activeData.summary.secondaryValue.toLocaleString()} tone="text-blue-700" loading={loading} />
                    <StatementKpi label="Visible Rows" value={visibleRows.length.toLocaleString()} tone="text-slate-900" loading={loading} />
                    <StatementKpi label="Last Synced" value={new Date(activeData.generatedAt).toLocaleString("en-UG")} tone="text-purple-700" loading={loading} />
                </section>

                <section className="mt-6 overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl">
                    <div className="border-b border-slate-200 p-5">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">{activeData.summary.periodLabel} - {selectedOffice}</p>
                                <h2 className="mt-1 text-2xl font-black text-slate-950">{activeData.title}</h2>
                                <p className="mt-1 text-sm font-semibold text-slate-500">{activeData.description}</p>
                            </div>
                            <label className="relative block min-w-72">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search inside results..." className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm font-bold outline-none focus:border-blue-400" />
                            </label>
                        </div>
                    </div>
                    <StatementTable columns={activeData.columns} rows={visibleRows} totals={activeData.totals} loading={loading} />
                </section>
            </div>

            {previewOpen ? (
                <PrintPreview
                    data={activeData}
                    rows={visibleRows}
                    officeLabel={selectedOffice}
                    onClose={() => setPreviewOpen(false)}
                    onCsv={exportCsv}
                />
            ) : null}
        </main>
    );
}

function StatementTable({ columns, rows, totals, loading }: { columns: StatementColumn[]; rows: StatementRow[]; totals: StatementRow; loading?: boolean }) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-950 text-xs font-black uppercase tracking-wide text-white">
                    <tr>
                        {columns.length === 0 ? <th className="px-4 py-3">Statement</th> : columns.map((column) => <th key={column.key} className={`px-4 py-3 ${alignClass(column)}`}>{column.label}</th>)}
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {loading ? (
                        Array.from({ length: 5 }).map((_, index) => (
                            <tr key={index} className={index % 2 ? "bg-slate-50/70" : "bg-white"}>
                                <td colSpan={Math.max(1, columns.length)} className="px-4 py-4">
                                    <div className="h-4 w-full animate-pulse rounded-full bg-slate-100" />
                                </td>
                            </tr>
                        ))
                    ) : rows.length === 0 ? (
                        <tr><td colSpan={Math.max(1, columns.length)} className="px-4 py-8 text-center text-sm font-bold text-slate-500">No live records matched this statement.</td></tr>
                    ) : rows.map((row, index) => (
                        <tr key={index} className={index % 2 ? "bg-slate-50/70" : "bg-white"}>
                            {columns.map((column) => (
                                <td key={column.key} className={`px-4 py-3 align-top ${column.align === "right" ? "text-right font-black tabular-nums text-slate-950" : "font-semibold text-slate-700"}`}>
                                    {column.key === "status" ? <StatusChip label={String(row[column.key] ?? "unknown")} tone={statusTone(row[column.key])} /> : formatCell(column, row)}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
                {columns.length > 0 ? (
                    <tfoot className="sticky bottom-0 bg-slate-100 text-sm font-black text-slate-950">
                        <tr>
                            {columns.map((column, index) => (
                                <td key={column.key} className={`px-4 py-3 ${column.align === "right" ? "text-right tabular-nums" : ""}`}>
                                    {index === 0 ? "Totals" : typeof totals[column.key] === "number" ? money(totals[column.key]) : ""}
                                </td>
                            ))}
                        </tr>
                    </tfoot>
                ) : null}
            </table>
        </div>
    );
}

function PrintPreview({
    data,
    rows,
    officeLabel,
    onClose,
    onCsv,
}: {
    data: StatementsCentreData;
    rows: StatementRow[];
    officeLabel: string;
    onClose: () => void;
    onCsv: () => void;
}) {
    const generatedAt = new Date(data.generatedAt).toLocaleString("en-UG");
    const printedAt = new Date().toLocaleString("en-UG");

    return (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-950/80 p-4 backdrop-blur print:static print:bg-white print:p-0">
            <div className="mx-auto mb-4 flex max-w-6xl items-center justify-between gap-3 print:hidden">
                <div className="text-white">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-200">Review before printing</p>
                    <h3 className="text-2xl font-black">Print Preview</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-950"><Printer size={16} /> Print / Save PDF</button>
                    <button type="button" onClick={onCsv} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-black text-white"><Download size={16} /> Export CSV</button>
                    <button type="button" onClick={onClose} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-black text-white"><X size={16} /> Close</button>
                </div>
            </div>

            <article className="statement-print-preview mx-auto min-h-[1120px] max-w-6xl bg-white p-8 text-slate-950 shadow-2xl print:min-h-0 print:max-w-none print:p-0 print:shadow-none">
                <header className="flex items-start justify-between gap-6 border-b-2 border-slate-900 pb-6">
                    <div className="flex items-center gap-4">
                        <img src="/ddumba-logo.png" alt="Ddumba OS" className="h-16 w-16 rounded-2xl border border-slate-200 object-contain p-2" />
                        <div>
                            <p className="text-xs font-black uppercase tracking-[0.25em] text-slate-500">{data.company?.name ?? "Ddumba OS"}</p>
                            <h1 className="mt-1 text-3xl font-black tracking-tight">{data.title}</h1>
                            <p className="mt-1 text-sm font-semibold text-slate-500">{data.description}</p>
                        </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-right text-xs font-bold text-slate-600">
                        <p>Generated: {generatedAt}</p>
                        <p>Print timestamp: {printedAt}</p>
                        <p>Generated by: Admin user</p>
                    </div>
                </header>

                <section className="mt-6 grid grid-cols-2 gap-3 text-sm md:grid-cols-4 print:grid-cols-4">
                    <PreviewMeta label="Date Range" value={`${data.filters.startDate || "Any"} to ${data.filters.endDate || "Any"}`} />
                    <PreviewMeta label="Month Selection" value={data.summary.periodLabel} />
                    <PreviewMeta label="Office" value={officeLabel} />
                    <PreviewMeta label="Rows" value={rows.length.toLocaleString()} />
                </section>

                <section className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3 print:grid-cols-3">
                    <PreviewTotal label={data.summary.primaryLabel} value={money(data.summary.primaryValue)} />
                    <PreviewTotal label={data.summary.secondaryLabel} value={data.summary.secondaryValue.toLocaleString()} />
                    <PreviewTotal label="Statement Period" value={data.summary.periodLabel} />
                </section>

                <section className="mt-6 overflow-hidden rounded-2xl border border-slate-300">
                    <table className="w-full border-collapse text-left text-xs">
                        <thead className="bg-slate-950 text-white">
                            <tr>
                                {data.columns.map((column) => <th key={column.key} className={`px-3 py-3 ${alignClass(column)}`}>{column.label}</th>)}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                            {rows.length === 0 ? (
                                <tr><td colSpan={Math.max(1, data.columns.length)} className="px-3 py-8 text-center font-bold text-slate-500">No live records matched this statement.</td></tr>
                            ) : rows.map((row, index) => (
                                <tr key={index} className={index % 2 ? "bg-slate-50" : "bg-white"}>
                                    {data.columns.map((column) => <td key={column.key} className={`px-3 py-2 align-top ${column.align === "right" ? "text-right font-black tabular-nums" : "font-semibold"}`}>{formatCell(column, row)}</td>)}
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="bg-slate-100 font-black">
                            <tr>
                                {data.columns.map((column, index) => (
                                    <td key={column.key} className={`px-3 py-3 ${column.align === "right" ? "text-right tabular-nums" : ""}`}>
                                        {index === 0 ? "Totals" : typeof data.totals[column.key] === "number" ? money(data.totals[column.key]) : ""}
                                    </td>
                                ))}
                            </tr>
                        </tfoot>
                    </table>
                </section>

                <footer className="mt-10 grid grid-cols-1 gap-8 text-sm font-bold text-slate-700 md:grid-cols-3 print:grid-cols-3">
                    <Signature label="Prepared By" />
                    <Signature label="Approved By" />
                    <div className="border-t border-slate-300 pt-3 text-right">
                        <p>Page 1 of 1</p>
                        <p className="text-xs text-slate-500">Printed from live Supabase data</p>
                    </div>
                </footer>
            </article>
        </div>
    );
}

function Select({ children, label, onChange, value }: { children: React.ReactNode; label: string; onChange: (value: string) => void; value: string }) {
    return (
        <label className="space-y-1">
            <span className="text-xs font-black uppercase tracking-wide text-slate-300">{label}</span>
            <select value={value} onChange={(event) => onChange(event.target.value)} className="statement-select h-11 w-full rounded-2xl border border-white/10 bg-slate-900 px-3 text-sm font-bold text-white outline-none [color-scheme:dark]">
                {children}
            </select>
        </label>
    );
}

function Input({ label, onChange, type, value }: { label: string; onChange: (value: string) => void; type: string; value: string }) {
    return (
        <label className="space-y-1">
            <span className="text-xs font-black uppercase tracking-wide text-slate-300">{label}</span>
            <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="statement-input h-11 w-full rounded-2xl border border-white/10 bg-slate-900 px-3 text-sm font-bold text-white outline-none [color-scheme:dark]" />
        </label>
    );
}

function StatementKpi({ label, loading, tone, value }: { label: string; loading?: boolean; tone: string; value: string }) {
    return (
        <div className="enterprise-card p-4">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
            {loading ? <div className="mt-3 h-8 w-32 animate-pulse rounded-full bg-slate-100" /> : <p className={`mt-2 break-words text-2xl font-black ${tone}`}>{value}</p>}
        </div>
    );
}

function PreviewMeta({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 font-black text-slate-950">{value}</p>
        </div>
    );
}

function PreviewTotal({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 break-words text-2xl font-black text-slate-950">{value}</p>
        </div>
    );
}

function Signature({ label }: { label: string }) {
    return (
        <div className="border-t border-slate-300 pt-3">
            <p>{label}</p>
            <p className="mt-6 text-xs text-slate-500">Name / Signature / Date</p>
        </div>
    );
}

function alignClass(column: StatementColumn) {
    if (column.align === "right") return "text-right";
    if (column.align === "center") return "text-center";
    return "text-left";
}

function statusTone(value: unknown) {
    const status = String(value ?? "").toLowerCase();
    if (status.includes("unpaid") || status.includes("pending")) return "orange";
    if (status.includes("reject") || status.includes("overdue")) return "red";
    if (status.includes("paid") || status.includes("approved") || status.includes("cleared")) return "green";
    return "slate";
}
