"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Archive, Binary, ClipboardCheck, Download, FileSpreadsheet, Filter, History, Search, ShieldCheck, UserRoundSearch } from "lucide-react";
import { EmptyState, EnterpriseKpiCard, PageHero, SearchBox, StatusChip } from "@/components/office/shared/EnterpriseUI";
import type { AuditCentreData, AuditDiff, AuditModule, AuditSeverity, AuditTimelineItem } from "@/lib/audit-centre/types";

type Props = {
    data: AuditCentreData;
};

type FilterState = {
    query: string;
    user: string;
    office: string;
    module: string;
    severity: string;
    dateRange: "all" | "today" | "week" | "month";
};

const defaultFilters: FilterState = {
    query: "",
    user: "all",
    office: "all",
    module: "all",
    severity: "all",
    dateRange: "all",
};

function formatDate(value: string | null) {
    if (!value) return "No date";
    return new Intl.DateTimeFormat("en-UG", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Africa/Kampala",
    }).format(new Date(value));
}

export default function AuditReplayCentre({ data }: Props) {
    const [filters, setFilters] = useState(defaultFilters);
    const [selectedId, setSelectedId] = useState(data.timeline[0]?.id ?? "");
    const filteredTimeline = useMemo(() => applyFilters(data.timeline, filters), [data.timeline, filters]);
    const selected = filteredTimeline.find((item) => item.id === selectedId) ?? filteredTimeline[0] ?? data.timeline[0] ?? null;

    return (
        <main className="enterprise-page">
            <div className="enterprise-shell">
                <PageHero
                    title="Enterprise Audit & Replay Centre"
                    subtitle={`${data.company?.name ?? "Company"} · trace every action, replay before/after state, investigate risk, and prepare compliance exports`}
                    badge="Audit Command"
                >
                    <div className="rounded-3xl bg-slate-950 p-5 text-white shadow-xl">
                        <div className="flex items-center gap-3">
                            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-cyan-500">
                                <ShieldCheck size={24} />
                            </span>
                            <div>
                                <p className="text-sm text-slate-300">Compliance Score</p>
                                <p className="text-3xl font-black">{data.compliance.complianceScore}%</p>
                            </div>
                        </div>
                        <div className="mt-4 h-3 rounded-full bg-white/10">
                            <div className="h-full rounded-full bg-cyan-400" style={{ width: `${data.compliance.complianceScore}%` }} />
                        </div>
                    </div>
                </PageHero>

                <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-6">
                    <EnterpriseKpiCard title="Total Events" value={data.kpis.totalEvents.toString()} tone="blue" trend="up" trendLabel="audit ledger" progress={100} />
                    <EnterpriseKpiCard title="Critical Events" value={data.kpis.criticalEvents.toString()} tone={data.kpis.criticalEvents ? "red" : "green"} trend={data.kpis.criticalEvents ? "down" : "up"} trendLabel="investigate" progress={data.kpis.criticalEvents ? 75 : 0} status={data.kpis.criticalEvents ? "Risk" : "Clean"} />
                    <EnterpriseKpiCard title="User Actions" value={data.kpis.userActions.toString()} tone="slate" trend="flat" trendLabel="actor-linked" progress={percent(data.kpis.userActions, data.kpis.totalEvents)} />
                    <EnterpriseKpiCard title="Office Actions" value={data.kpis.officeActions.toString()} tone="cyan" trend="flat" trendLabel="office-scoped" progress={percent(data.kpis.officeActions, data.kpis.totalEvents)} />
                    <EnterpriseKpiCard title="Automation Actions" value={data.kpis.automationActions.toString()} tone="purple" trend="up" trendLabel="engine-backed" progress={percent(data.kpis.automationActions, data.kpis.totalEvents)} />
                    <EnterpriseKpiCard title="Approval Actions" value={data.kpis.approvalActions.toString()} tone="orange" trend="flat" trendLabel="workflow trail" progress={percent(data.kpis.approvalActions, data.kpis.totalEvents)} />
                </section>

                <section className="mt-6 grid grid-cols-1 gap-6 2xl:grid-cols-12">
                    <div className="2xl:col-span-8">
                        <SearchCentre data={data} filters={filters} setFilters={setFilters} />
                        <AuditTimeline items={filteredTimeline} selectedId={selected?.id ?? ""} onSelect={setSelectedId} />
                    </div>
                    <div className="space-y-6 2xl:col-span-4">
                        <ReplayEngine item={selected} />
                        <ComplianceDashboard data={data} />
                    </div>
                </section>

                <section className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
                    <ExecutiveInvestigationCentre data={data} />
                    <EntityHistory data={data} onSelect={setSelectedId} />
                </section>

                <section className="mt-6">
                    <ExportCentre data={data} />
                </section>
            </div>
        </main>
    );
}

function SearchCentre({ data, filters, setFilters }: Props & { filters: FilterState; setFilters: (filters: FilterState) => void }) {
    return (
        <section className="enterprise-panel p-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h2 className="text-xl font-black">Search Centre</h2>
                    <p className="text-sm text-slate-500">Search by user, office, module, record, date range, and severity.</p>
                </div>
                <StatusChip label="Live filters" tone="blue" />
            </div>
            <div className="mt-5">
                <SearchBox value={filters.query} onChange={(query) => setFilters({ ...filters, query })} placeholder="Search action, record, actor, office, module, or field..." />
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-5">
                <Select label="User" value={filters.user} onChange={(user) => setFilters({ ...filters, user })} options={[{ label: "All users", value: "all" }, ...data.searchOptions.users]} />
                <Select label="Office" value={filters.office} onChange={(office) => setFilters({ ...filters, office })} options={[{ label: "All offices", value: "all" }, ...data.searchOptions.offices]} />
                <Select label="Module" value={filters.module} onChange={(module) => setFilters({ ...filters, module })} options={[{ label: "All modules", value: "all" }, ...data.searchOptions.modules]} />
                <Select label="Severity" value={filters.severity} onChange={(severity) => setFilters({ ...filters, severity })} options={[{ label: "All severities", value: "all" }, ...data.searchOptions.severities]} />
                <Select
                    label="Date"
                    value={filters.dateRange}
                    onChange={(dateRange) => setFilters({ ...filters, dateRange: dateRange as FilterState["dateRange"] })}
                    options={[
                        { label: "All dates", value: "all" },
                        { label: "Today", value: "today" },
                        { label: "Last 7 days", value: "week" },
                        { label: "Last 30 days", value: "month" },
                    ]}
                />
            </div>
        </section>
    );
}

function AuditTimeline({ items, selectedId, onSelect }: { items: AuditTimelineItem[]; selectedId: string; onSelect: (id: string) => void }) {
    return (
        <section className="enterprise-panel mt-6 overflow-hidden">
            <div className="border-b border-slate-200 p-6">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <h2 className="text-xl font-black">Audit Timeline</h2>
                        <p className="text-sm text-slate-500">Who acted, what changed, module, office, and timestamp.</p>
                    </div>
                    <StatusChip label={`${items.length} events`} tone="slate" />
                </div>
            </div>
            <div className="max-h-[720px] overflow-y-auto">
                {items.length === 0 ? (
                    <div className="p-6"><EmptyState title="No audit events found" description="Adjust search filters to inspect a wider audit window." /></div>
                ) : items.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        onClick={() => onSelect(item.id)}
                        className={`grid w-full grid-cols-1 gap-4 border-b border-slate-100 p-5 text-left transition hover:bg-slate-50 lg:grid-cols-[1fr_auto] ${selectedId === item.id ? "bg-blue-50/60" : "bg-white"}`}
                    >
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <StatusChip label={item.severity} tone={severityTone(item.severity)} />
                                <StatusChip label={item.module} tone={moduleTone(item.module)} />
                                <span className="text-xs font-bold text-slate-400">{formatDate(item.createdAt)}</span>
                            </div>
                            <p className="mt-3 text-base font-black text-slate-950">{item.action}</p>
                            <p className="mt-1 text-sm text-slate-500">{item.actorName} changed {item.entityType}{item.entityId ? ` · ${item.entityId.slice(0, 8)}` : ""} in {item.officeName}</p>
                            <p className="mt-2 text-sm font-semibold text-slate-600">{item.differenceSummary}</p>
                        </div>
                        <div className="flex items-center gap-2 text-xs font-black text-slate-500">
                            <History size={15} />
                            Replay
                        </div>
                    </button>
                ))}
            </div>
        </section>
    );
}

function ReplayEngine({ item }: { item: AuditTimelineItem | null }) {
    if (!item) {
        return (
            <section className="enterprise-panel p-6">
                <EmptyState title="No replay selected" description="Select an audit event to view before state, after state, and differences." />
            </section>
        );
    }

    return (
        <section className="enterprise-panel p-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-xl font-black">Replay Engine</h2>
                    <p className="text-sm text-slate-500">Business-friendly before/after comparison with technical details hidden by default.</p>
                </div>
                <StatusChip label={item.severity} tone={severityTone(item.severity)} />
            </div>

            <div className="mt-5 overflow-hidden rounded-3xl border border-slate-200 bg-white">
                <div className="bg-slate-950 p-5 text-white">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">Selected Audit Event</p>
                    <h3 className="mt-2 text-lg font-black">{humanizeAction(item.action)}</h3>
                    <p className="mt-1 text-sm text-slate-300">{item.differenceSummary}</p>
                </div>
                <div className="grid grid-cols-1 gap-px bg-slate-200 md:grid-cols-2">
                    <ReplayMeta label="Office" value={item.officeName} />
                    <ReplayMeta label="User" value={item.actorName} />
                    <ReplayMeta label="Timestamp" value={formatDate(item.createdAt)} />
                    <ReplayMeta label="Entity Affected" value={`${humanizeAction(item.entityType)}${item.entityId ? ` · ${item.entityId.slice(0, 8)}` : ""}`} />
                    <ReplayMeta label="Module" value={item.module} />
                    <ReplayMeta label="Source IP" value={item.ipAddress} />
                </div>
            </div>

            <div className="mt-5">
                <ComparisonTable item={item} />
            </div>

            <div className="mt-5">
                <DiffPanel diffs={item.diffs} />
            </div>

            <details className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <summary className="cursor-pointer text-sm font-black text-slate-800">
                    View Technical Details
                </summary>
                <div className="mt-4 grid gap-4">
                    <TechnicalStatePanel title="Raw Before JSON" state={item.beforeState} />
                    <TechnicalStatePanel title="Raw After JSON" state={item.afterState} />
                </div>
            </details>
        </section>
    );
}

function ReplayMeta({ label, value }: { label: string; value: string }) {
    return (
        <div className="bg-white p-4">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</p>
            <p className="mt-1 break-words text-sm font-black text-slate-950">{value || "Not captured"}</p>
        </div>
    );
}

function ComparisonTable({ item }: { item: AuditTimelineItem }) {
    const rows = comparisonRows(item);

    return (
        <div className="overflow-hidden rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
                <div>
                    <p className="font-black text-slate-950">Before vs After</p>
                    <p className="text-xs font-semibold text-slate-500">Changed fields are highlighted for review.</p>
                </div>
                <StatusChip label={`${rows.filter((row) => row.changed).length} changed`} tone={rows.some((row) => row.changed) ? "orange" : "green"} />
            </div>
            {rows.length === 0 ? (
                <div className="p-5 text-sm font-semibold text-slate-500">No replayable business fields were captured for this event.</div>
            ) : (
                <div className="max-h-[520px] overflow-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                        <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                            <tr>
                                <th className="px-4 py-3">Field</th>
                                <th className="px-4 py-3">Before</th>
                                <th className="px-4 py-3">After</th>
                                <th className="px-4 py-3">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                            {rows.map((row) => (
                                <tr key={row.field} className={row.changed ? "bg-amber-50/70" : ""}>
                                    <td className="px-4 py-3 font-black text-slate-950">{businessLabel(row.field)}</td>
                                    <td className={`px-4 py-3 ${row.changed ? "font-bold text-red-700" : "text-slate-600"}`}>{row.before}</td>
                                    <td className={`px-4 py-3 ${row.changed ? "font-bold text-emerald-700" : "text-slate-600"}`}>{row.after}</td>
                                    <td className="px-4 py-3">
                                        <StatusChip label={row.changed ? "changed" : "unchanged"} tone={row.changed ? "orange" : "slate"} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function TechnicalStatePanel({ title, state }: { title: string; state: Record<string, unknown> | null }) {
    return (
        <div className="rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between">
                <p className="font-black">{title}</p>
                <StatusChip label={state ? "captured" : "missing"} tone={state ? "slate" : "orange"} />
            </div>
            <pre className="mt-3 max-h-56 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs leading-relaxed text-slate-100">{state ? JSON.stringify(state, null, 2) : "No replay state captured for this event."}</pre>
        </div>
    );
}

function DiffPanel({ diffs }: { diffs: AuditDiff[] }) {
    return (
        <div className="rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center gap-2">
                <Binary size={18} className="text-blue-700" />
                <p className="font-black">Difference Summary</p>
            </div>
            <div className="mt-3 grid gap-3">
                {diffs.length === 0 ? (
                    <p className="text-sm text-slate-500">No field-level differences were captured.</p>
                ) : diffs.slice(0, 12).map((diff) => (
                    <div key={diff.field} className="rounded-2xl bg-slate-50 p-3">
                        <div className="flex items-center justify-between gap-3">
                            <p className="font-black">{diff.field}</p>
                            <StatusChip label={diff.severity} tone={severityTone(diff.severity)} />
                        </div>
                        <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                            <DiffValue label="Old" value={diff.before} />
                            <DiffValue label="New" value={diff.after} />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

type ComparisonRow = {
    field: string;
    before: string;
    after: string;
    changed: boolean;
};

function comparisonRows(item: AuditTimelineItem): ComparisonRow[] {
    const before = flattenBusinessState(item.beforeState);
    const after = flattenBusinessState(item.afterState);
    const fields = new Set([...Object.keys(before), ...Object.keys(after), ...item.diffs.map((diff) => diff.field)]);

    return [...fields]
        .filter((field) => !technicalField(field))
        .map((field) => {
            const beforeValue = before[field] ?? diffValue(item.diffs, field, "before") ?? "empty";
            const afterValue = after[field] ?? diffValue(item.diffs, field, "after") ?? "empty";
            return {
                field,
                before: beforeValue,
                after: afterValue,
                changed: beforeValue !== afterValue,
            };
        })
        .sort((a, b) => Number(b.changed) - Number(a.changed) || businessLabel(a.field).localeCompare(businessLabel(b.field)))
        .slice(0, 40);
}

function diffValue(diffs: AuditDiff[], field: string, side: "before" | "after") {
    const diff = diffs.find((item) => item.field === field);
    return diff?.[side];
}

function flattenBusinessState(state: Record<string, unknown> | null) {
    const output: Record<string, string> = {};
    if (!state) return output;
    flattenInto(output, state, "");
    return output;
}

function flattenInto(output: Record<string, string>, value: unknown, prefix: string) {
    if (value === null || value === undefined) {
        if (prefix) output[prefix] = "empty";
        return;
    }
    if (Array.isArray(value)) {
        if (prefix) output[prefix] = `${value.length} item${value.length === 1 ? "" : "s"}`;
        return;
    }
    if (typeof value === "object") {
        for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
            const path = prefix ? `${prefix}.${key}` : key;
            if (technicalField(path)) continue;
            if (child && typeof child === "object" && !Array.isArray(child)) {
                flattenInto(output, child, path);
            } else {
                output[path] = businessValue(child);
            }
        }
        return;
    }
    if (prefix) output[prefix] = businessValue(value);
}

function businessValue(value: unknown) {
    if (value === null || value === undefined || value === "") return "empty";
    if (typeof value === "number") {
        if (Math.abs(value) >= 1000) return `UGX ${Math.round(value).toLocaleString()}`;
        return value.toLocaleString();
    }
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "string") {
        if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return formatDate(value);
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Intl.DateTimeFormat("en-UG", { dateStyle: "medium", timeZone: "Africa/Kampala" }).format(new Date(`${value}T00:00:00`));
        if (/^-?\d+(\.\d+)?$/.test(value) && Math.abs(Number(value)) >= 1000) return `UGX ${Math.round(Number(value)).toLocaleString()}`;
        return value.replaceAll("_", " ");
    }
    return String(value);
}

function businessLabel(field: string) {
    const parts = field
        .replace(/^beforeData\.|^afterData\./, "")
        .split(".")
        .slice(-2)
        .join(" ")
        .replaceAll("_", " ");
    return parts.replace(/\b\w/g, (char) => char.toUpperCase());
}

function humanizeAction(value: string) {
    return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function technicalField(field: string) {
    const lower = field.toLowerCase();
    return [
        "access_token",
        "refresh_token",
        "password",
        "pin_hash",
        "secret",
        "jwt",
    ].some((item) => lower.includes(item));
}

function ExecutiveInvestigationCentre({ data }: Props) {
    return (
        <section className="enterprise-panel p-6">
            <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-rose-50 text-rose-700"><UserRoundSearch size={20} /></span>
                <div>
                    <h2 className="text-xl font-black">Executive Investigation Centre</h2>
                    <p className="text-sm text-slate-500">Suspicious activity, mass changes, failed approvals, repeated edits, and deleted records.</p>
                </div>
            </div>
            <div className="mt-5 grid gap-3">
                {data.investigationSignals.map((signal) => (
                    <article key={signal.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="font-black">{signal.title}</p>
                                <p className="mt-1 text-sm text-slate-500">{signal.description}</p>
                            </div>
                            <StatusChip label={`${signal.count}`} tone={severityTone(signal.severity)} />
                        </div>
                        <p className="mt-3 text-sm font-semibold text-slate-700">{signal.recommendedAction}</p>
                    </article>
                ))}
            </div>
        </section>
    );
}

function EntityHistory({ data, onSelect }: Props & { onSelect: (id: string) => void }) {
    return (
        <section className="enterprise-panel p-6">
            <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-700"><Archive size={20} /></span>
                <div>
                    <h2 className="text-xl font-black">Entity History</h2>
                    <p className="text-sm text-slate-500">Tenant, property, collection, promise, expense, attendance, and automation history.</p>
                </div>
            </div>
            <div className="mt-5 grid gap-3">
                {data.entityHistory.map((group) => (
                    <div key={group.module} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex items-center justify-between gap-3">
                            <p className="font-black">{group.label}</p>
                            <StatusChip label={`${group.events.length} events`} tone={moduleTone(group.module)} />
                        </div>
                        <div className="mt-3 grid gap-2">
                            {group.events.length === 0 ? (
                                <p className="text-sm text-slate-500">No events captured for this history stream.</p>
                            ) : group.events.slice(0, 3).map((event) => (
                                <button key={event.id} type="button" onClick={() => onSelect(event.id)} className="rounded-xl bg-slate-50 p-3 text-left text-sm transition hover:bg-blue-50">
                                    <span className="font-black">{event.action}</span>
                                    <span className="ml-2 text-slate-500">{formatDate(event.createdAt)}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}

function ComplianceDashboard({ data }: Props) {
    return (
        <section className="rounded-3xl bg-slate-950 p-6 text-white shadow-xl">
            <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-500"><ClipboardCheck size={21} /></span>
                <div>
                    <h2 className="text-xl font-black">Compliance Dashboard</h2>
                    <p className="text-sm text-slate-300">Completeness, missing events, integrity, and coverage.</p>
                </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
                <DarkMini label="Completeness" value={`${data.compliance.auditCompleteness}%`} />
                <DarkMini label="Integrity" value={`${data.compliance.dataIntegrityScore}%`} />
                <DarkMini label="Missing" value={data.compliance.missingEvents.toString()} />
                <DarkMini label="Compliance" value={`${data.compliance.complianceScore}%`} />
            </div>
            <div className="mt-5 grid gap-3">
                {data.compliance.coverageByModule.slice(0, 7).map((item) => (
                    <div key={item.module}>
                        <div className="mb-1 flex items-center justify-between text-xs font-bold text-slate-300">
                            <span>{item.module}</span>
                            <span>{item.events} events</span>
                        </div>
                        <div className="h-2 rounded-full bg-white/10">
                            <div className="h-full rounded-full bg-emerald-400" style={{ width: `${item.score}%` }} />
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}

function ExportCentre({ data }: Props) {
    return (
        <section className="enterprise-panel p-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h2 className="text-xl font-black">Export Centre</h2>
                    <p className="text-sm text-slate-500">PDF-ready reports, Excel-ready ledgers, and executive audit summaries.</p>
                </div>
                <StatusChip label="export-ready" tone="green" />
            </div>
            <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
                {data.exports.map((report) => (
                    <article key={report.id} className="rounded-3xl border border-slate-200 p-5">
                        <div className="flex items-start justify-between gap-4">
                            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-cyan-50 text-cyan-700">
                                {report.format === "excel-ready" ? <FileSpreadsheet size={20} /> : <Download size={20} />}
                            </span>
                            <StatusChip label={report.format} tone="cyan" />
                        </div>
                        <p className="mt-4 text-lg font-black">{report.title}</p>
                        <p className="mt-2 text-sm text-slate-500">{report.description}</p>
                        <div className="mt-5 grid grid-cols-2 gap-3">
                            <Mini label="Records" value={report.recordCount.toString()} />
                            <Mini label="Generated" value={formatDate(report.generatedAt)} />
                        </div>
                    </article>
                ))}
            </div>
        </section>
    );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ label: string; value: string }> }) {
    return (
        <label className="block">
            <span className="mb-1 flex items-center gap-1 text-xs font-black uppercase text-slate-400"><Filter size={12} />{label}</span>
            <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-700 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100">
                {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
        </label>
    );
}

function DiffValue({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl bg-white p-3">
            <p className="text-xs font-black uppercase text-slate-400">{label}</p>
            <p className="mt-1 break-words font-mono text-xs text-slate-700">{value}</p>
        </div>
    );
}

function Mini({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-1 font-black">{value}</p>
        </div>
    );
}

function DarkMini({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl bg-white/10 p-3">
            <p className="text-xs text-slate-300">{label}</p>
            <p className="mt-1 text-2xl font-black">{value}</p>
        </div>
    );
}

function applyFilters(items: AuditTimelineItem[], filters: FilterState) {
    const query = filters.query.trim().toLowerCase();
    const now = Date.now();
    const cutoff = filters.dateRange === "today"
        ? startOfToday()
        : filters.dateRange === "week"
            ? now - 7 * 24 * 60 * 60 * 1000
            : filters.dateRange === "month"
                ? now - 30 * 24 * 60 * 60 * 1000
                : 0;

    return items.filter((item) => {
        const matchesQuery = !query || [
            item.action,
            item.actorName,
            item.officeName,
            item.entityType,
            item.entityId ?? "",
            item.module,
            item.differenceSummary,
            ...item.diffs.map((diff) => `${diff.field} ${diff.before} ${diff.after}`),
        ].join(" ").toLowerCase().includes(query);
        const matchesUser = filters.user === "all" || item.actorId === filters.user;
        const matchesOffice = filters.office === "all" || item.officeId === filters.office;
        const matchesModule = filters.module === "all" || item.module === filters.module;
        const matchesSeverity = filters.severity === "all" || item.severity === filters.severity;
        const matchesDate = !cutoff || new Date(item.createdAt).getTime() >= cutoff;
        return matchesQuery && matchesUser && matchesOffice && matchesModule && matchesSeverity && matchesDate;
    });
}

function startOfToday() {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date.getTime();
}

function percent(numerator: number, denominator: number) {
    if (!denominator) return 0;
    return Math.max(0, Math.min(100, Math.round((numerator / denominator) * 100)));
}

function severityTone(severity: AuditSeverity) {
    if (severity === "critical") return "red";
    if (severity === "high") return "orange";
    if (severity === "medium") return "blue";
    return "green";
}

function moduleTone(module: AuditModule) {
    if (module === "automation") return "purple";
    if (module === "approval" || module === "expense") return "orange";
    if (module === "security") return "red";
    if (module === "attendance") return "cyan";
    if (module === "collection" || module === "promise") return "blue";
    return "slate";
}
