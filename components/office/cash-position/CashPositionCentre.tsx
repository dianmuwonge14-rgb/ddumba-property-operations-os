"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
    AlertTriangle,
    Banknote,
    Brain,
    Building2,
    CalendarDays,
    ChevronDown,
    Download,
    FileSpreadsheet,
    Landmark,
    LineChart,
    Printer,
    RefreshCw,
    ShieldAlert,
    TrendingDown,
    TrendingUp,
    UsersRound,
    WalletCards,
} from "lucide-react";
import type { CashPositionChartPoint, CashPositionData, CashPositionOfficeRow } from "@/lib/cash-position-centre/types";

type Props = {
    data: CashPositionData;
};

const moneyFormatter = new Intl.NumberFormat("en-UG", {
    currency: "UGX",
    maximumFractionDigits: 0,
    style: "currency",
});

function money(value: number) {
    return moneyFormatter.format(Math.round(value || 0)).replace("UGX", "UGX ");
}

function percent(value: number) {
    return `${Math.round(value || 0)}%`;
}

function dateTime(value: string | null | undefined) {
    if (!value) return "No activity";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleString("en-UG", { dateStyle: "medium", timeStyle: "short" });
}

function toneClasses(tone: string) {
    const tones: Record<string, string> = {
        amber: "border-amber-300/20 bg-amber-300/10 text-amber-50",
        blue: "border-blue-300/20 bg-blue-300/10 text-blue-50",
        cyan: "border-cyan-300/20 bg-cyan-300/10 text-cyan-50",
        green: "border-emerald-300/20 bg-emerald-300/10 text-emerald-50",
        red: "border-red-300/20 bg-red-400/10 text-red-50",
        violet: "border-violet-300/20 bg-violet-300/10 text-violet-50",
    };
    return tones[tone] ?? tones.blue;
}

function statusBadge(status: CashPositionOfficeRow["status"]) {
    if (status === "critical") return "border-red-300/30 bg-red-400/15 text-red-100";
    if (status === "attention") return "border-amber-300/30 bg-amber-400/15 text-amber-100";
    return "border-emerald-300/30 bg-emerald-400/15 text-emerald-100";
}

export default function CashPositionCentre({ data }: Props) {
    const router = useRouter();
    const [filters, setFilters] = useState({
        endDate: data.filters.endDate,
        officeId: data.filters.officeId ?? "",
        paymentMethod: data.filters.paymentMethod ?? "",
        period: data.filters.period ?? "today",
        startDate: data.filters.startDate,
    });
    const [expandedOffice, setExpandedOffice] = useState<string | null>(data.officeRows[0]?.officeId ?? null);

    const csv = useMemo(() => {
        const rows = [
            [
                "Office",
                "Cash Collected Today",
                "Cash Held In Office",
                "Cash Held By Collectors",
                "Already Banked",
                "Given To Admin",
                "Outstanding To Bank",
                "Outstanding To Admin",
                "Receipts",
                "Collectors",
                "Banking %",
                "Today",
                "Week",
                "Month",
                "Trend",
                "Status",
            ],
            ...data.officeRows.map((row) => [
                row.officeName,
                row.cashCollectedToday,
                row.cashHeldInOffice,
                row.cashHeldByCollectors,
                row.alreadyBanked,
                row.givenToAdmin,
                row.outstandingToBank,
                row.outstandingToAdmin,
                row.numberOfReceipts,
                row.collectorCount,
                row.bankingPercentage,
                row.todayPerformance,
                row.weeklyPerformance,
                row.monthlyPerformance,
                row.trend,
                row.status,
            ]),
        ];
        return rows.map((row) => row.map((cell) => `"${String(cell).replaceAll("\"", "\"\"")}"`).join(",")).join("\n");
    }, [data.officeRows]);

    function applyFilters() {
        const params = new URLSearchParams();
        params.set("period", filters.period);
        if (filters.period === "custom" || filters.period === "specificDay") {
            params.set("startDate", filters.startDate);
            params.set("endDate", filters.endDate);
        }
        if (filters.officeId) params.set("officeId", filters.officeId);
        if (filters.paymentMethod) params.set("paymentMethod", filters.paymentMethod);
        router.push(`/office/admin/cash-position?${params.toString()}`);
    }

    function downloadCsv(filename = "cash-position-centre.csv", content = csv, type = "text/csv;charset=utf-8") {
        const blob = new Blob([content], { type });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
    }

    const syncedAt = dateTime(data.generatedAt);
    const expanded = data.officeRows.find((office) => office.officeId === expandedOffice) ?? data.officeRows[0] ?? null;

    return (
        <main className="min-h-screen bg-slate-950 px-3 py-5 text-white sm:px-5 lg:px-8">
            <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_8%_0%,rgba(20,184,166,0.22),transparent_28%),radial-gradient(circle_at_92%_5%,rgba(59,130,246,0.24),transparent_28%),linear-gradient(180deg,rgba(15,23,42,0),rgba(2,6,23,0.88))]" />
            <div className="relative mx-auto max-w-[1800px] space-y-5">
                <header className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.06] p-5 shadow-2xl shadow-black/30 backdrop-blur-2xl">
                    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-xs font-black uppercase tracking-wide text-emerald-100">Admin only</span>
                                <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs font-black uppercase tracking-wide text-cyan-100">Live Supabase</span>
                                <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-wide text-slate-200">CFO dashboard</span>
                            </div>
                            <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">Cash Position Centre</h1>
                            <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-slate-300 sm:text-base">
                                Real-time treasury control across collection, office cash, collector cash, banking, admin handover and security-liability exposure for {data.companyName}.
                            </p>
                            <p className="mt-3 text-xs font-black uppercase tracking-[0.2em] text-slate-400">Last synced {syncedAt}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button onClick={() => router.refresh()} className="inline-flex items-center gap-2 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 py-3 text-sm font-black text-cyan-100 hover:bg-cyan-300 hover:text-slate-950">
                                <RefreshCw size={16} /> Refresh
                            </button>
                            <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-black text-white hover:bg-white/15">
                                <Printer size={16} /> Print
                            </button>
                            <button onClick={() => downloadCsv()} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-300 px-4 py-3 text-sm font-black text-slate-950 hover:bg-emerald-200">
                                <Download size={16} /> CSV
                            </button>
                            <button onClick={() => downloadCsv("cash-position-centre.xls", csv, "application/vnd.ms-excel")} className="inline-flex items-center gap-2 rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-black text-slate-950 hover:bg-cyan-200">
                                <FileSpreadsheet size={16} /> Excel
                            </button>
                        </div>
                    </div>
                </header>

                <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    {data.kpis.map((kpi) => (
                        <article key={kpi.label} className={`rounded-[24px] border p-4 shadow-xl shadow-black/20 backdrop-blur ${toneClasses(kpi.tone)}`}>
                            <p className="text-[11px] font-black uppercase tracking-wide text-slate-300">{kpi.label}</p>
                            <p className="mt-3 break-words text-2xl font-black tracking-tight text-white">{kpi.label.includes("Alerts") ? Math.round(kpi.value).toLocaleString() : money(kpi.value)}</p>
                            <p className="mt-2 text-xs font-semibold leading-5 text-slate-300">{kpi.hint}</p>
                        </article>
                    ))}
                </section>

                <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                    <div className="rounded-[28px] border border-white/10 bg-white/[0.055] p-4 shadow-2xl shadow-black/25 backdrop-blur-2xl">
                        <div className="mb-3 flex items-center gap-3">
                            <CalendarDays size={18} className="text-cyan-200" />
                            <div>
                                <h2 className="text-lg font-black">Treasury Filters</h2>
                                <p className="text-xs font-semibold text-slate-400">Filter by period, office and payment method without loading unrelated ledgers into the browser.</p>
                            </div>
                        </div>
                        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                            <Select label="Period" value={filters.period} onChange={(value) => setFilters((current) => ({ ...current, period: value }))} options={[
                                ["today", "Today"],
                                ["yesterday", "Yesterday"],
                                ["last7", "Last 7 Days"],
                                ["month", "This Month"],
                                ["previousMonth", "Previous Month"],
                                ["year", "Year"],
                                ["financialYear", "Financial Year"],
                                ["custom", "Custom Date Range"],
                                ["specificDay", "Specific Day"],
                            ]} />
                            <Input label="Start date" type="date" value={filters.startDate} onChange={(value) => setFilters((current) => ({ ...current, startDate: value }))} />
                            <Input label="End date" type="date" value={filters.endDate} onChange={(value) => setFilters((current) => ({ ...current, endDate: value }))} />
                            <Select label="Office" value={filters.officeId} onChange={(value) => setFilters((current) => ({ ...current, officeId: value }))} options={[["", "All offices"], ...data.offices.map((office) => [office.id, office.name] as [string, string])]} />
                            <Select label="Payment Method" value={filters.paymentMethod} onChange={(value) => setFilters((current) => ({ ...current, paymentMethod: value }))} options={[["", "All methods"], ["cash", "Cash"], ["mobile_money", "Mobile Money"], ["bank", "Bank"], ["other", "Other"]]} />
                            <button onClick={applyFilters} className="mt-5 inline-flex h-[46px] items-center justify-center gap-2 rounded-2xl bg-white px-4 text-sm font-black text-slate-950 hover:bg-cyan-100">
                                <RefreshCw size={16} /> Apply
                            </button>
                        </div>
                    </div>
                    <AICashDirector data={data} />
                </section>

                <section className="grid gap-4 xl:grid-cols-3">
                    <ChartPanel title="Daily Cash Movement" icon={<LineChart size={18} />} points={data.charts.dailyCashMovement} />
                    <ChartPanel title="Office Comparison" icon={<Building2 size={18} />} points={data.charts.officeComparison} />
                    <ChartPanel title="Collector Comparison" icon={<UsersRound size={18} />} points={data.charts.collectorComparison} />
                    <ChartPanel title="Monthly Collections" icon={<TrendingUp size={18} />} points={data.charts.monthlyCollections} />
                    <ChartPanel title="Banking Timeline" icon={<Landmark size={18} />} points={data.charts.bankingTimeline} />
                    <ChartPanel title="Office Ranking Heat Map" icon={<ShieldAlert size={18} />} points={data.charts.officeRanking} heat />
                </section>

                <section className="rounded-[28px] border border-white/10 bg-white/[0.055] p-4 shadow-2xl shadow-black/25">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h2 className="text-xl font-black">Live Cash Position Table</h2>
                            <p className="text-xs font-semibold text-slate-400">Every office, ranked by today’s collections and live cash exposure.</p>
                        </div>
                        <a href="/office/admin/cash-banking" className="rounded-2xl bg-emerald-300 px-4 py-2 text-sm font-black text-slate-950 hover:bg-emerald-200">Open Banking Module</a>
                    </div>
                    <div className="overflow-auto rounded-2xl border border-white/10">
                        <table className="min-w-[1500px] border-collapse text-left text-sm">
                            <thead className="sticky top-0 bg-slate-950 text-[11px] uppercase text-slate-400">
                                <tr>
                                    {["Office", "Collected Today", "Held In Office", "Held By Collectors", "Banked", "Admin", "To Bank", "To Admin", "Receipts", "Collectors", "Banking %", "Today", "Week", "Month", "Trend", "Status"].map((head) => (
                                        <th key={head} className="border-b border-white/10 px-3 py-3 font-black">{head}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {data.officeRows.map((office) => (
                                    <tr key={office.officeId} className="border-b border-white/6 bg-slate-950/50 hover:bg-white/[0.06]">
                                        <td className="px-3 py-3">
                                            <button onClick={() => setExpandedOffice((current) => current === office.officeId ? null : office.officeId)} className="inline-flex items-center gap-2 font-black text-white">
                                                <ChevronDown size={14} className={expandedOffice === office.officeId ? "rotate-180 transition" : "transition"} />
                                                {office.officeName}
                                            </button>
                                        </td>
                                        <MoneyCell value={office.cashCollectedToday} positive />
                                        <MoneyCell value={office.cashHeldInOffice} />
                                        <MoneyCell value={office.cashHeldByCollectors} />
                                        <MoneyCell value={office.alreadyBanked} positive />
                                        <MoneyCell value={office.givenToAdmin} />
                                        <MoneyCell value={office.outstandingToBank} warning={office.outstandingToBank > 1_000_000} />
                                        <MoneyCell value={office.outstandingToAdmin} />
                                        <td className="px-3 py-3 font-black text-slate-200">{office.numberOfReceipts.toLocaleString()}</td>
                                        <td className="px-3 py-3 font-black text-slate-200">{office.collectorCount.toLocaleString()}</td>
                                        <td className="px-3 py-3 font-black text-cyan-100">{percent(office.bankingPercentage)}</td>
                                        <MoneyCell value={office.todayPerformance} positive />
                                        <MoneyCell value={office.weeklyPerformance} positive />
                                        <MoneyCell value={office.monthlyPerformance} positive />
                                        <td className="px-3 py-3">
                                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-black ${office.trend === "up" ? "bg-emerald-300/10 text-emerald-100" : office.trend === "down" ? "bg-red-300/10 text-red-100" : "bg-white/10 text-slate-200"}`}>
                                                {office.trend === "up" ? <TrendingUp size={12} /> : office.trend === "down" ? <TrendingDown size={12} /> : <LineChart size={12} />}
                                                {office.trend}
                                            </span>
                                        </td>
                                        <td className="px-3 py-3">
                                            <span className={`rounded-full border px-2 py-1 text-xs font-black uppercase ${statusBadge(office.status)}`}>{office.status}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                {expanded ? <OfficeExpansionPanel office={expanded} /> : null}

                <section className="rounded-[28px] border border-white/10 bg-white/[0.055] p-4 shadow-2xl shadow-black/25">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                            <h2 className="text-xl font-black">Collector Performance</h2>
                            <p className="text-xs font-semibold text-slate-400">Live collector rankings from payment records and collector cash balances.</p>
                        </div>
                        <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black text-cyan-100">{data.collectors.length.toLocaleString()} collectors</span>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                        {data.collectors.map((collector) => (
                            <article key={collector.collectorId} className="rounded-[24px] border border-white/10 bg-slate-950/72 p-4">
                                <div className="flex items-start gap-3">
                                    <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-cyan-300 to-emerald-300 text-lg font-black text-slate-950">
                                        {collector.photoUrl ? <img src={collector.photoUrl} alt="" className="h-full w-full object-cover" /> : collector.collectorName.slice(0, 1)}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-black text-white">{collector.collectorName}</p>
                                        <p className="text-xs font-semibold text-slate-400">{collector.officeName} · {collector.currentStatus}</p>
                                    </div>
                                    <span className={`rounded-full px-2 py-1 text-xs font-black ${collector.riskScore >= 70 ? "bg-red-400/15 text-red-100" : collector.riskScore >= 40 ? "bg-amber-400/15 text-amber-100" : "bg-emerald-400/15 text-emerald-100"}`}>Risk {collector.riskScore}%</span>
                                </div>
                                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                                    <Mini label="Today" value={money(collector.todayCollections)} />
                                    <Mini label="This Week" value={money(collector.thisWeek)} />
                                    <Mini label="This Month" value={money(collector.thisMonth)} />
                                    <Mini label="Cash In Hand" value={money(collector.cashInHand)} risky={collector.cashInHand > 500_000} />
                                    <Mini label="Submitted" value={money(collector.cashSubmitted)} />
                                    <Mini label="Outstanding" value={money(collector.outstanding)} risky={collector.outstanding > 500_000} />
                                    <Mini label="Average Receipt" value={money(collector.averageReceipt)} />
                                    <Mini label="Largest Receipt" value={money(collector.largestReceipt)} />
                                    <Mini label="Last Activity" value={dateTime(collector.lastActivity)} wide />
                                    <Mini label="Reliability" value={percent(collector.reliability)} />
                                    <Mini label="Speed" value={collector.collectionSpeed} />
                                    <Mini label="Customer Rating" value={collector.customerRating} />
                                </div>
                            </article>
                        ))}
                        {!data.collectors.length ? <p className="rounded-2xl border border-dashed border-white/20 p-5 text-sm font-bold text-slate-400">No collector records are available for this company yet.</p> : null}
                    </div>
                </section>
            </div>
        </main>
    );
}

function AICashDirector({ data }: { data: CashPositionData }) {
    return (
        <section className="rounded-[28px] border border-cyan-300/20 bg-cyan-300/10 p-4 shadow-2xl shadow-cyan-950/20">
            <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-cyan-300 text-slate-950"><Brain size={20} /></span>
                <div>
                    <h2 className="text-lg font-black">AI Cash Director</h2>
                    <p className="text-xs font-semibold leading-5 text-cyan-100">Executive recommendations from office balances, collector cash, banking movement and security exposure.</p>
                </div>
            </div>
            <div className="mt-4 grid gap-3">
                {data.insights.map((insight) => (
                    <article key={insight.id} className={`rounded-2xl border p-3 ${insight.severity === "critical" ? "border-red-300/20 bg-red-400/10" : insight.severity === "warning" ? "border-amber-300/20 bg-amber-400/10" : insight.severity === "success" ? "border-emerald-300/20 bg-emerald-400/10" : "border-white/10 bg-slate-950/50"}`}>
                        <p className="text-sm font-black text-white">{insight.title}</p>
                        <p className="mt-1 text-xs font-semibold leading-5 text-slate-200">{insight.message}</p>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-black text-cyan-100">{money(insight.amount)}</span>
                            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black text-white">{insight.action}</span>
                        </div>
                    </article>
                ))}
            </div>
        </section>
    );
}

function ChartPanel({ heat = false, icon, points, title }: { heat?: boolean; icon: ReactNode; points: CashPositionChartPoint[]; title: string }) {
    const max = Math.max(1, ...points.map((point) => point.value));
    return (
        <section className="rounded-[26px] border border-white/10 bg-white/[0.055] p-4 shadow-xl shadow-black/20">
            <div className="mb-4 flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-2xl bg-white/10 text-cyan-100">{icon}</span>
                <h3 className="text-sm font-black text-white">{title}</h3>
            </div>
            <div className={heat ? "grid grid-cols-2 gap-2" : "space-y-3"}>
                {points.map((point) => heat ? (
                    <div key={point.label} className="rounded-2xl border border-white/10 bg-slate-950/70 p-3">
                        <p className="truncate text-xs font-black text-white">{point.label}</p>
                        <p className="mt-2 text-sm font-black text-emerald-100">{money(point.value)}</p>
                    </div>
                ) : (
                    <div key={point.label}>
                        <div className="mb-1 flex items-center justify-between gap-2 text-xs font-bold">
                            <span className="truncate text-slate-300">{point.label}</span>
                            <span className="text-white">{money(point.value)}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                            <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-emerald-300" style={{ width: `${Math.max(3, Math.round((point.value / max) * 100))}%` }} />
                        </div>
                    </div>
                ))}
                {!points.length ? <p className="text-xs font-bold text-slate-400">No live data for this chart yet.</p> : null}
            </div>
        </section>
    );
}

function OfficeExpansionPanel({ office }: { office: CashPositionOfficeRow }) {
    return (
        <section className="rounded-[28px] border border-emerald-300/20 bg-emerald-300/10 p-4 shadow-2xl shadow-emerald-950/20">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-100">Office Expansion Panel</p>
                    <h2 className="mt-2 text-2xl font-black">{office.officeName}</h2>
                    <p className="mt-1 text-sm font-semibold text-emerald-50">{office.statusReason}</p>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase ${statusBadge(office.status)}`}>{office.status}</span>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
                <Mini label="Collectors in office" value={office.collectorCount.toLocaleString()} />
                <Mini label="Collector cash" value={money(office.cashHeldByCollectors)} />
                <Mini label="Cash submitted" value={money(Math.max(0, office.todayPerformance - office.cashHeldByCollectors))} />
                <Mini label="Cash waiting" value={money(office.outstandingToBank)} risky={office.outstandingToBank > 1_000_000} />
                <Mini label="Receipts" value={office.numberOfReceipts.toLocaleString()} />
                <Mini label="Bank history" value={money(office.alreadyBanked)} />
                <Mini label="Admin transfers" value={money(office.givenToAdmin)} />
                <Mini label="Collection efficiency" value={percent(office.bankingPercentage)} />
                <Mini label="Outstanding cash" value={money(office.cashHeldInOffice)} risky={office.cashHeldInOffice < 0} />
                <Mini label="Security deposits" value={money(office.securityDeposits)} />
                <Mini label="Average payment" value={money(office.numberOfReceipts ? office.monthlyPerformance / office.numberOfReceipts : 0)} />
                <Mini label="Largest payment" value={money(office.largestPayment)} />
                <Mini label="Last payment" value={dateTime(office.lastPaymentAt)} wide />
            </div>
        </section>
    );
}

function MoneyCell({ positive = false, value, warning = false }: { positive?: boolean; value: number; warning?: boolean }) {
    const color = warning ? "text-amber-100" : value < 0 ? "text-red-100" : positive ? "text-emerald-100" : "text-white";
    return <td className={`px-3 py-3 font-black ${color}`}>{money(value)}</td>;
}

function Mini({ label, risky = false, value, wide = false }: { label: string; risky?: boolean; value: string; wide?: boolean }) {
    return (
        <div className={`rounded-2xl border border-white/10 bg-slate-950/60 p-3 ${wide ? "sm:col-span-2" : ""}`}>
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p>
            <p className={`mt-1 break-words text-sm font-black ${risky ? "text-red-100" : "text-white"}`}>{value}</p>
        </div>
    );
}

function Input({ label, onChange, type = "text", value }: { label: string; onChange: (value: string) => void; type?: string; value: string }) {
    return (
        <label className="text-xs font-black uppercase text-slate-400">
            {label}
            <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-[46px] w-full rounded-2xl border border-white/10 bg-slate-950 px-3 text-sm font-bold text-white outline-none ring-cyan-300/0 transition focus:border-cyan-300/50 focus:ring-4 focus:ring-cyan-300/10" />
        </label>
    );
}

function Select({ label, onChange, options, value }: { label: string; onChange: (value: string) => void; options: Array<[string, string]>; value: string }) {
    return (
        <label className="text-xs font-black uppercase text-slate-400">
            {label}
            <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-[46px] w-full rounded-2xl border border-white/10 bg-slate-950 px-3 text-sm font-bold text-white outline-none ring-cyan-300/0 transition focus:border-cyan-300/50 focus:ring-4 focus:ring-cyan-300/10">
                {options.map(([optionValue, optionLabel]) => <option key={`${label}-${optionValue}`} value={optionValue}>{optionLabel}</option>)}
            </select>
        </label>
    );
}
