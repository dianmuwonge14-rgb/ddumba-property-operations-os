"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
    AlertTriangle,
    ArrowDownRight,
    ArrowUpRight,
    Banknote,
    Brain,
    Building2,
    CalendarDays,
    ChevronDown,
    Download,
    Eye,
    ExternalLink,
    FileSpreadsheet,
    FileText,
    Landmark,
    LineChart,
    Printer,
    RefreshCw,
    Search,
    ShieldAlert,
    TrendingDown,
    TrendingUp,
    UsersRound,
    WalletCards,
    X,
} from "lucide-react";
import type {
    CashPositionChartPoint,
    CashPositionCollectorRow,
    CashPositionDailyCard,
    CashPositionData,
    CashPositionOfficeRow,
    CashPositionReceiptBreakdownItem,
} from "@/lib/cash-position-centre/types";

type Props = {
    data: CashPositionData;
};

const moneyFormatter = new Intl.NumberFormat("en-UG", {
    currency: "UGX",
    maximumFractionDigits: 0,
    style: "currency",
});

const periodOptions = [
    ["", "All Dates"],
    ["today", "Today"],
    ["yesterday", "Yesterday"],
    ["last7", "Last 7 Days"],
    ["month", "This Month"],
    ["previousMonth", "Previous Month"],
    ["year", "This Year"],
    ["specificDay", "Specific Day of Month"],
    ["customDate", "Custom Date"],
    ["custom", "Custom Date Range"],
] as const;

const firstCashKpis = new Set([
    "Company Cash Position",
    "Cash Before Expenses",
    "Approved Expenses",
    "Pending Expenses",
    "Projected Cash After Pending Approval",
    "Offices With Negative or Low Cash",
]);

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
    const formatter = new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        hour: "2-digit",
        hour12: false,
        minute: "2-digit",
        month: "short",
        timeZone: "Africa/Kampala",
        year: "numeric",
    });
    const parts = Object.fromEntries(formatter.formatToParts(parsed).map((part) => [part.type, part.value]));
    return `${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute}`;
}

function dateLabel(value: string) {
    const parsed = new Date(`${value}T00:00:00+03:00`);
    if (Number.isNaN(parsed.getTime())) return value;
    const formatter = new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        timeZone: "Africa/Kampala",
    });
    const parts = Object.fromEntries(formatter.formatToParts(parsed).map((part) => [part.type, part.value]));
    return `${parts.day} ${parts.month}`;
}

function dateFullLabel(value: string) {
    if (!value) return "All Dates";
    const parsed = new Date(`${value}T00:00:00+03:00`);
    if (Number.isNaN(parsed.getTime())) return value;
    const formatter = new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        timeZone: "Africa/Kampala",
        year: "numeric",
    });
    const parts = Object.fromEntries(formatter.formatToParts(parsed).map((part) => [part.type, part.value]));
    return `${parts.day} ${parts.month} ${parts.year}`;
}

function dateFullTodayKey() {
    return new Intl.DateTimeFormat("en-CA", {
        day: "2-digit",
        month: "2-digit",
        timeZone: "Africa/Kampala",
        year: "numeric",
    }).format(new Date());
}

function kpiIcon(label: string) {
    if (label.includes("After Approved Expenses") || label.includes("After Expenses")) return <WalletCards size={20} />;
    if (label.includes("Before Expenses")) return <Banknote size={20} />;
    if (label.includes("Approved Expenses")) return <FileText size={20} />;
    if (label.includes("Pending Expenses")) return <CalendarDays size={20} />;
    if (label.includes("Negative or Low Cash")) return <AlertTriangle size={20} />;
    if (label.includes("Collected")) return <Banknote size={20} />;
    if (label.includes("Offices")) return <Building2 size={20} />;
    if (label.includes("Collectors")) return <UsersRound size={20} />;
    if (label.includes("Banked")) return <Landmark size={20} />;
    if (label.includes("Admin")) return <ShieldAlert size={20} />;
    if (label.includes("Security")) return <WalletCards size={20} />;
    if (label.includes("Unreconciled") || label.includes("Shortfall")) return <AlertTriangle size={20} />;
    return <LineChart size={20} />;
}

function toneClasses(tone: string) {
    const tones: Record<string, string> = {
        amber: "border-amber-300/25 from-amber-400/18 via-slate-900/80 to-slate-950 text-amber-50 shadow-amber-950/20",
        blue: "border-blue-300/25 from-blue-400/18 via-slate-900/80 to-slate-950 text-blue-50 shadow-blue-950/20",
        cyan: "border-cyan-300/25 from-cyan-400/18 via-slate-900/80 to-slate-950 text-cyan-50 shadow-cyan-950/20",
        green: "border-emerald-300/25 from-emerald-400/18 via-slate-900/80 to-slate-950 text-emerald-50 shadow-emerald-950/20",
        red: "border-red-300/30 from-red-400/20 via-slate-900/80 to-slate-950 text-red-50 shadow-red-950/20",
        violet: "border-violet-300/25 from-violet-400/18 via-slate-900/80 to-slate-950 text-violet-50 shadow-violet-950/20",
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
    const [, startTransition] = useTransition();
    const [filters, setFilters] = useState({
        bankingStatus: data.filters.bankingStatus ?? "",
        collectorId: data.filters.collectorId ?? "",
        endDate: data.filters.endDate ?? "",
        expenseStatus: data.filters.expenseStatus ?? "",
        officeId: data.filters.officeId ?? "",
        paymentMethod: data.filters.paymentMethod ?? "",
        period: data.filters.period ?? "",
        startDate: data.filters.startDate ?? "",
    });
    const [expandedOffice, setExpandedOffice] = useState<string | null>(data.officeRows[0]?.officeId ?? null);
    const [receiptPanel, setReceiptPanel] = useState<null | { title: string; records: CashPositionReceiptBreakdownItem[] }>(null);
    const [spotlight, setSpotlight] = useState<string | null>(null);
    const [collectorPanel, setCollectorPanel] = useState<null | { collectorId: string; mode: "cash" | "activity" | "reconcile" }>(
        data.filters.collectorId ? { collectorId: data.filters.collectorId, mode: "cash" } : null,
    );

    useEffect(() => {
        setFilters({
            bankingStatus: data.filters.bankingStatus ?? "",
            collectorId: data.filters.collectorId ?? "",
            endDate: data.filters.endDate ?? "",
            expenseStatus: data.filters.expenseStatus ?? "",
            officeId: data.filters.officeId ?? "",
            paymentMethod: data.filters.paymentMethod ?? "",
            period: data.filters.period ?? "",
            startDate: data.filters.startDate ?? "",
        });
    }, [data.filters.bankingStatus, data.filters.collectorId, data.filters.endDate, data.filters.expenseStatus, data.filters.officeId, data.filters.paymentMethod, data.filters.period, data.filters.startDate]);

    const csv = useMemo(() => {
        const rows = [
            [
                "Office",
                "Selected Period Collected",
                "Selected Period Approved Expenses",
                "Selected Period Banked",
                "Selected Period Handed To Admin",
                "Company Cash Position",
                "Raw Selected Period Cash At Office",
                "Cash Reconciliation Difference",
                "Cash Reconciliation Cause",
                "Cash Collected Today",
                "Cash Currently Held In Office",
                "Cash Currently Held By Collectors",
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
                row.dailyCollected,
                row.dailyApprovedExpenses,
                row.dailyBanked,
                row.dailyHandedToAdmin,
                row.dailyCashRemainingAtOffice,
                row.rawCashAtOffice,
                row.cashReconciliationDifference,
                row.cashReconciliationCause,
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

    function cashPositionUrl(nextFilters = filters, extra: Record<string, string | null | undefined> = {}, path = "/office/admin/cash-position") {
        const params = new URLSearchParams();
        if (nextFilters.period) params.set("period", nextFilters.period);
        if (nextFilters.startDate) params.set("startDate", nextFilters.startDate);
        if (nextFilters.endDate) params.set("endDate", nextFilters.endDate);
        if (nextFilters.officeId) params.set("officeId", nextFilters.officeId);
        if (nextFilters.collectorId) params.set("collectorId", nextFilters.collectorId);
        if (nextFilters.paymentMethod) params.set("paymentMethod", nextFilters.paymentMethod);
        if (nextFilters.bankingStatus) params.set("bankingStatus", nextFilters.bankingStatus);
        if (nextFilters.expenseStatus) params.set("expenseStatus", nextFilters.expenseStatus);
        for (const [key, value] of Object.entries(extra)) {
            if (value) params.set(key, value);
        }
        return `${path}?${params.toString()}`;
    }

    function updateFilter(key: keyof typeof filters, value: string) {
        const next = { ...filters, [key]: value };
        if (key === "startDate" || key === "endDate") {
            next.period = value ? "custom" : "";
        }
        if ((key === "period" && (value === "customDate" || value === "specificDay")) || next.period === "customDate" || next.period === "specificDay") {
            next.endDate = next.startDate;
        }
        if (key === "period" && !value) {
            next.startDate = "";
            next.endDate = "";
        }
        setFilters(next);
        startTransition(() => router.push(cashPositionUrl(next)));
    }

    function clearFilter(key: keyof typeof filters) {
        const next = { ...filters, [key]: "" };
        if (key === "period") {
            next.startDate = "";
            next.endDate = "";
        }
        if (key === "startDate" || key === "endDate") next.period = "";
        setFilters(next);
        startTransition(() => router.push(cashPositionUrl(next)));
    }

    function applyFilters() {
        startTransition(() => router.push(cashPositionUrl()));
    }

    function clearFilters() {
        const next = {
            ...filters,
            bankingStatus: "",
            collectorId: "",
            endDate: "",
            expenseStatus: "",
            officeId: "",
            paymentMethod: "",
            period: "",
            startDate: "",
        };
        setFilters(next);
        startTransition(() => router.push("/office/admin/cash-position"));
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

    function actionUrl(path: string, extra: Record<string, string | null | undefined> = {}) {
        return cashPositionUrl(filters, {
            activeOfficeFilter: filters.officeId,
            dateFrom: filters.startDate,
            dateTo: filters.endDate,
            ...extra,
        }, path);
    }

    function viewOfficePosition(officeId: string) {
        setExpandedOffice(officeId);
        router.push(actionUrl("/office/admin/cash-position", { officeId }));
    }

    function viewOfficeReceipts(officeId: string) {
        router.push(actionUrl("/office/receipts", { officeId }));
    }

    function openReceiptBreakdown(title: string, records: CashPositionReceiptBreakdownItem[]) {
        setReceiptPanel({ title, records });
    }

    function openCollectorPanel(collectorId: string, mode: "cash" | "activity" | "reconcile") {
        setCollectorPanel({ collectorId, mode });
        router.push(actionUrl("/office/admin/cash-position", { collectorId }));
    }

    function viewCollectorReceipts(collectorId: string) {
        router.push(actionUrl("/office/receipts", { collectorId }));
    }

    function handleKpiClick(label: string) {
        if (label.includes("Expense")) {
            router.push(actionUrl("/office/expenses", filters.officeId ? { officeId: filters.officeId } : {}));
            return;
        }
        setSpotlight((current) => current === label ? null : label);
    }

    const syncedAt = dateTime(data.generatedAt);
    const expanded = data.officeRows.find((office) => office.officeId === expandedOffice) ?? data.officeRows[0] ?? null;
    const selectedCollector = collectorPanel
        ? data.collectors.find((collector) => collector.collectorId === collectorPanel.collectorId) ?? null
        : null;
    type ActiveFilterChip = { key: keyof typeof filters; label: string };
    const activeFilters = [
        filters.period ? { key: "period" as const, label: `Period: ${periodOptions.find(([value]) => value === filters.period)?.[1] ?? filters.period}` } : null,
        filters.startDate ? { key: "startDate" as const, label: `Start Date: ${filters.startDate}` } : null,
        filters.endDate ? { key: "endDate" as const, label: `End Date: ${filters.endDate}` } : null,
        filters.officeId ? { key: "officeId" as const, label: `Office: ${data.offices.find((office) => office.id === filters.officeId)?.name ?? filters.officeId}` } : null,
        filters.collectorId ? { key: "collectorId" as const, label: `Collector: ${data.collectors.find((collector) => collector.collectorId === filters.collectorId)?.collectorName ?? filters.collectorId}` } : null,
        filters.paymentMethod ? { key: "paymentMethod" as const, label: `Payment Method: ${filters.paymentMethod}` } : null,
        filters.bankingStatus ? { key: "bankingStatus" as const, label: `Banking Status: ${filters.bankingStatus}` } : null,
        filters.expenseStatus ? { key: "expenseStatus" as const, label: `Expense Status: ${filters.expenseStatus}` } : null,
    ].filter((filter): filter is ActiveFilterChip => Boolean(filter));
    const netKpis = data.kpis.filter((kpi) => firstCashKpis.has(kpi.label));
    const grossKpis = data.kpis.filter((kpi) => !firstCashKpis.has(kpi.label));
    const selectedIsToday = data.selectedPeriodMode === "single-day" && data.filters.startDate === dateFullTodayKey();
    const dailyMovementTitle = data.selectedPeriodMode === "all-dates"
        ? "Company Cash Position for All Dates"
        : data.selectedPeriodMode === "range"
            ? "Company Cash Position for Selected Period"
            : selectedIsToday
                ? "Company Cash Position Today"
                : `Company Cash Position for ${dateFullLabel(data.filters.startDate ?? "")}`;
    const dailyMovementNoun = data.selectedPeriodMode === "all-dates" ? "All Dates" : data.selectedPeriodMode === "range" ? "Selected period" : selectedIsToday ? "Today" : dateFullLabel(data.filters.startDate ?? "");
    const headerTone = data.totals.companyCashPosition < 1_000_000 || data.totals.cashDifferenceAlerts > 0 ? "amber" : "green";
    const headerStatus = headerTone === "amber" ? "Attention required" : "Healthy";

    return (
        <main className="min-h-screen overflow-x-hidden bg-[#030712] px-3 py-5 text-white sm:px-5 lg:px-8">
            <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_9%_0%,rgba(16,185,129,0.22),transparent_26%),radial-gradient(circle_at_75%_2%,rgba(14,165,233,0.22),transparent_28%),radial-gradient(circle_at_95%_18%,rgba(245,158,11,0.12),transparent_22%),linear-gradient(135deg,#020617_0%,#07111f_48%,#111827_100%)]" />
            <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:72px_72px] opacity-20" />
            <div className="relative mx-auto max-w-[1800px] space-y-5">
                <header className="overflow-hidden rounded-[30px] border border-white/10 bg-white/[0.065] p-5 shadow-2xl shadow-black/35 backdrop-blur-2xl">
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/70 to-transparent" />
                    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,520px)] xl:items-start">
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <Pill tone="green">Admin only</Pill>
                                <Pill tone="cyan">Live Supabase</Pill>
                                <Pill tone="gold">CFO command centre</Pill>
                            </div>
                            <h1 className="mt-4 max-w-5xl text-3xl font-black tracking-tight sm:text-5xl">Cash Position Centre</h1>
                            <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-slate-300 sm:text-base">
                                Executive treasury control across office cash, collector cash, banking, admin handover and security-liability exposure for {data.companyName}.
                            </p>
                            <p className="mt-3 text-xs font-black uppercase tracking-[0.2em] text-slate-400">Last synced {syncedAt}</p>
                        </div>
                        <div className={`min-w-0 rounded-[28px] border bg-gradient-to-br p-4 shadow-2xl ${toneClasses(headerTone)}`}>
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="break-words text-[11px] font-black uppercase tracking-[0.22em] text-slate-300">Company Cash Position</p>
                                    <p className="mt-2 break-words text-sm font-black uppercase tracking-wide text-cyan-100">{dailyMovementTitle}</p>
                                    <p className="mt-2 break-words text-[clamp(1.8rem,3vw,3.4rem)] font-black leading-none text-white">{money(data.totals.companyCashPosition)}</p>
                                </div>
                                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/10"><WalletCards size={22} /></span>
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-2">
                                <Mini label={`Collected ${dailyMovementNoun}`} value={money(data.totals.dailyCollected)} />
                                <Mini label={`Approved expenses ${dailyMovementNoun}`} value={money(data.totals.dailyApprovedExpenses)} />
                                <Mini label={`Banked ${dailyMovementNoun}`} value={money(data.totals.dailyBanked)} />
                                <Mini label={`Handed to Admin ${dailyMovementNoun}`} value={money(data.totals.dailyHandedToAdmin)} />
                                <Mini label="Company Cash Position" value={money(data.totals.companyCashPosition)} />
                                <Mini label="Cash Reconciliation Difference" value={money(data.totals.cashReconciliationDifference)} risky={data.totals.cashReconciliationDifference > 0} />
                                <Mini label="Current Physical Office Cash" value={money(data.totals.currentPhysicalOfficeCash)} risky={data.totals.currentPhysicalOfficeCash < 0} />
                                <Mini label="Last updated" value={syncedAt} />
                                <Mini label="Current status" value={headerStatus} risky={data.totals.cashDifferenceAlerts > 0} />
                            </div>
                        </div>
                    </div>

                    <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
                        <Mini label={`Collected ${dailyMovementNoun}`} value={money(data.totals.dailyCollected)} />
                        <Mini label={`Approved Expenses ${dailyMovementNoun}`} value={money(data.totals.dailyApprovedExpenses)} />
                        <Mini label={`Banked ${dailyMovementNoun}`} value={money(data.totals.dailyBanked)} />
                        <Mini label={`Handed to Admin ${dailyMovementNoun}`} value={money(data.totals.dailyHandedToAdmin)} />
                        <Mini label={`Company Cash Position ${dailyMovementNoun}`} value={money(data.totals.companyCashPosition)} />
                        <Mini label="Current Physical Office Cash" value={money(data.totals.currentPhysicalOfficeCash)} risky={data.totals.currentPhysicalOfficeCash < 0} />
                        <Mini label="Cash Reconciliation Difference" value={money(data.totals.cashReconciliationDifference)} risky={data.totals.cashReconciliationDifference > 0} />
                    </div>

                    <div className="mt-5 rounded-[28px] border border-white/10 bg-slate-950/58 p-4 shadow-2xl shadow-black/20">
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-cyan-300/15 text-cyan-100"><Search size={18} /></span>
                                <div>
                                    <h2 className="text-lg font-black">Treasury Filter Bar</h2>
                                    <p className="text-xs font-semibold text-slate-400">Filters update the net cash, expense, office, collector, chart and AI views without a full page refresh.</p>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {activeFilters.length ? activeFilters.map((filter) => (
                                    <button key={filter.label} type="button" onClick={() => clearFilter(filter.key)} className="inline-flex items-center gap-1 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black uppercase tracking-wide text-cyan-100 hover:bg-cyan-300 hover:text-slate-950">
                                        {filter.label} <X size={13} />
                                    </button>
                                )) : <Pill tone="cyan">Showing all authorised cash-position records</Pill>}
                                {activeFilters.length ? <button onClick={clearFilters} className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-black text-white hover:bg-white/15"><X size={13} /> Clear All Filters</button> : null}
                            </div>
                        </div>
                        <p className="mb-3 text-xs font-bold text-slate-300">Showing results for: {activeFilters.length ? `${activeFilters.length} active filter${activeFilters.length === 1 ? "" : "s"}` : "All Dates and all authorised cash-position records"}</p>
                        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-8">
                            <Select label="Period" value={filters.period} onChange={(value) => updateFilter("period", value)} onClear={() => clearFilter("period")} options={periodOptions as unknown as Array<[string, string]>} />
                            <Input label="Start date" type="date" value={filters.startDate} onChange={(value) => updateFilter("startDate", value)} onClear={() => clearFilter("startDate")} />
                            <Input label="End date" type="date" value={filters.endDate} onChange={(value) => updateFilter("endDate", value)} onClear={() => clearFilter("endDate")} />
                            <Select label="Office" value={filters.officeId} onChange={(value) => updateFilter("officeId", value)} onClear={() => clearFilter("officeId")} options={[["", "All offices"], ...data.offices.map((office) => [office.id, office.name] as [string, string])]} />
                            <Select label="Collector" value={filters.collectorId} onChange={(value) => updateFilter("collectorId", value)} onClear={() => clearFilter("collectorId")} options={[["", "All collectors"], ...data.collectors.map((collector) => [collector.collectorId, collector.collectorName] as [string, string])]} />
                            <Select label="Payment Method" value={filters.paymentMethod} onChange={(value) => updateFilter("paymentMethod", value)} onClear={() => clearFilter("paymentMethod")} options={[["", "All methods"], ["cash", "Cash"], ["mobile_money", "Mobile Money"], ["bank", "Bank"], ["other", "Other"]]} />
                            <Select label="Banking Status" value={filters.bankingStatus} onChange={(value) => updateFilter("bankingStatus", value)} onClear={() => clearFilter("bankingStatus")} options={[["", "All status"], ["healthy", "Healthy"], ["attention", "Needs attention"], ["critical", "Critical"], ["waiting", "Unbanked"], ["banked", "Banked"]]} />
                            <Select label="Expense Status" value={filters.expenseStatus} onChange={(value) => updateFilter("expenseStatus", value)} onClear={() => clearFilter("expenseStatus")} options={[["", "All expenses"], ["approved", "Approved"], ["pending", "Pending"], ["pending_admin_approval", "Pending Admin Approval"], ["submitted", "Submitted"], ["rejected", "Rejected"], ["cancelled", "Cancelled"], ["reversed", "Reversed"]]} />
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                        <PrimaryButton onClick={applyFilters} icon={<RefreshCw size={16} />}>Apply Filters</PrimaryButton>
                        <ActionButton onClick={() => router.refresh()} icon={<RefreshCw size={16} />}>Refresh Live Data</ActionButton>
                        <ActionButton onClick={clearFilters} icon={<X size={16} />}>Clear All Filters</ActionButton>
                        <ActionButton onClick={() => window.print()} icon={<Printer size={16} />}>Print</ActionButton>
                        <ActionButton onClick={() => window.print()} icon={<FileText size={16} />}>PDF</ActionButton>
                        <PrimaryButton onClick={() => downloadCsv()} icon={<Download size={16} />}>Export CSV</PrimaryButton>
                        <PrimaryButton onClick={() => downloadCsv("cash-position-centre.xls", csv, "application/vnd.ms-excel")} icon={<FileSpreadsheet size={16} />}>Export Excel</PrimaryButton>
                        <a href="/office/admin/cash-banking" className="inline-flex items-center gap-2 rounded-2xl border border-emerald-300/25 bg-emerald-300/12 px-4 py-3 text-sm font-black text-emerald-100 transition hover:-translate-y-0.5 hover:bg-emerald-300 hover:text-slate-950 motion-reduce:transform-none">
                            <Landmark size={16} /> Open Banking Module
                        </a>
                        </div>
                    </div>
                </header>

                <section className="grid gap-4">
                    <OfficeComparisonCards
                        offices={data.officeRows}
                        expandedOffice={expandedOffice}
                        onSelect={setExpandedOffice}
                        onViewOffice={viewOfficePosition}
                        onViewReceipts={viewOfficeReceipts}
                        onViewReceiptsBreakdown={(office) => openReceiptBreakdown(`${office.officeName} receipts`, office.receiptBreakdown)}
                    />
                </section>

                <section className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3">
                    {netKpis.map((kpi, index) => (
                        <KpiButton key={`${kpi.label}-${index}`} kpi={kpi} spotlight={spotlight} syncedAt={syncedAt} onClick={() => handleKpiClick(kpi.label)} />
                    ))}
                </section>

                <section className="rounded-[30px] border border-white/10 bg-white/[0.055] p-4 shadow-2xl shadow-black/25">
                    <PanelHeading icon={<LineChart size={18} />} title="Gross Cash Movement and Control" subtitle="Gross cash cards remain available after the net cash position." />
                    <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3">
                        {grossKpis.map((kpi, index) => (
                            <KpiButton key={`${kpi.label}-${index}`} kpi={kpi} spotlight={spotlight} syncedAt={syncedAt} onClick={() => handleKpiClick(kpi.label)} />
                        ))}
                    </div>
                </section>

                <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
                    <AICashDirector data={data} onAction={() => router.push(actionUrl("/office/admin/cash-banking"))} />
                    <PremiumChart title="Security Liability vs Available Cash" icon={<ShieldAlert size={18} />} points={data.charts.securityLiability} mode="tiles" />
                </section>

                <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
                    <DailyCashCards
                        cards={data.dailyCards}
                        onSelectDate={(date) => router.push(actionUrl("/office/admin/cash-position", { endDate: date, period: "specificDay", startDate: date }))}
                        onViewReceipts={(card) => openReceiptBreakdown(`Receipts for ${dateLabel(card.date)}`, card.receiptBreakdown)}
                    />
                    <PremiumChart title="Office Company Cash Position" icon={<Building2 size={18} />} points={data.charts.officeComparison} />
                </section>

                {receiptPanel ? <ReceiptBreakdownPanel panel={receiptPanel} onClose={() => setReceiptPanel(null)} /> : null}

                <section className="grid gap-4 xl:grid-cols-3">
                    <PremiumChart title="Banked vs Cash Held" icon={<Landmark size={18} />} points={[
                        { label: "Banked", value: data.totals.totalBanked },
                        { label: "Current Physical Office Cash", value: Math.max(0, data.totals.currentPhysicalOfficeCash) },
                        { label: "Collector cash", value: data.totals.cashHeldByCollectors },
                        { label: "To bank", value: data.totals.cashWaitingToBeBanked },
                    ]} />
                    <PremiumChart title="Collector Comparison" icon={<UsersRound size={18} />} points={data.charts.collectorComparison} />
                    <PremiumChart title="Monthly Collection Trend" icon={<TrendingUp size={18} />} points={data.charts.monthlyCollections} />
                </section>

                <section className="rounded-[30px] border border-white/10 bg-white/[0.06] p-4 shadow-2xl shadow-black/25">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h2 className="text-xl font-black">Live Cash Position Table</h2>
                            <p className="text-xs font-semibold text-slate-400">Every operational office ranked by today’s collections and live cash exposure.</p>
                        </div>
                        <Pill tone="cyan">{data.officeRows.length.toLocaleString()} offices</Pill>
                    </div>
                    <div className="overflow-auto rounded-3xl border border-white/10">
                        <table className="min-w-[1500px] border-collapse text-left text-sm">
                            <thead className="sticky top-0 bg-slate-950 text-[11px] uppercase text-slate-400">
                                <tr>
                                    {["Office", "Selected Collected", "Held In Office", "Held By Collectors", "Selected Banked", "Selected Admin", "To Bank", "To Admin", "Receipts", "Collectors", "Banking %", "Today", "Week", "Month", "Trend", "Status"].map((head) => (
                                        <th key={head} className="border-b border-white/10 px-3 py-3 font-black">{head}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {data.officeRows.map((office) => (
                                    <tr key={office.officeId} className="border-b border-white/6 bg-slate-950/50 transition hover:bg-cyan-300/[0.07]">
                                        <td className="px-3 py-3">
                                            <button onClick={() => setExpandedOffice((current) => current === office.officeId ? null : office.officeId)} className="inline-flex items-center gap-2 font-black text-white">
                                                <ChevronDown size={14} className={expandedOffice === office.officeId ? "rotate-180 transition" : "transition"} />
                                                {office.officeName}
                                            </button>
                                        </td>
                                        <MoneyCell value={office.dailyCollected} positive />
                                        <MoneyCell value={office.cashHeldInOffice} />
                                        <MoneyCell value={office.cashHeldByCollectors} />
                                        <MoneyCell value={office.dailyBanked} positive />
                                        <MoneyCell value={office.dailyHandedToAdmin} />
                                        <MoneyCell value={office.outstandingToBank} warning={office.outstandingToBank > 1_000_000} />
                                        <MoneyCell value={office.outstandingToAdmin} />
                                        <td className="px-3 py-3">
                                            <button type="button" onClick={() => openReceiptBreakdown(`${office.officeName} receipts`, office.receiptBreakdown)} className="font-black text-cyan-100 underline decoration-cyan-200/30 underline-offset-4 hover:text-white">
                                                {office.numberOfReceipts.toLocaleString()}
                                            </button>
                                        </td>
                                        <td className="px-3 py-3 font-black text-slate-200">{office.collectorCount.toLocaleString()}</td>
                                        <td className="px-3 py-3 font-black text-cyan-100">{percent(office.bankingPercentage)}</td>
                                        <MoneyCell value={office.todayPerformance} positive />
                                        <MoneyCell value={office.weeklyPerformance} positive />
                                        <MoneyCell value={office.monthlyPerformance} positive />
                                        <td className="px-3 py-3"><TrendLabel trend={office.trend} /></td>
                                        <td className="px-3 py-3"><span className={`rounded-full border px-2 py-1 text-xs font-black uppercase ${statusBadge(office.status)}`}>{office.status}</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                {expanded ? <OfficeExpansionPanel office={expanded} onViewReceiptsBreakdown={(office) => openReceiptBreakdown(`${office.officeName} receipts`, office.receiptBreakdown)} /> : null}

                <CollectorCards
                    collectors={data.collectors}
                    onReconcile={(collectorId) => openCollectorPanel(collectorId, "reconcile")}
                    onViewActivity={(collectorId) => openCollectorPanel(collectorId, "activity")}
                    onViewCash={(collectorId) => openCollectorPanel(collectorId, "cash")}
                    onViewReceipts={viewCollectorReceipts}
                />

                {selectedCollector ? (
                    <CollectorActionPanel
                        collector={selectedCollector}
                        mode={collectorPanel?.mode ?? "cash"}
                        onClose={() => setCollectorPanel(null)}
                        onOpenAudit={() => router.push(actionUrl("/office/audit", { collectorId: selectedCollector.collectorId }))}
                        onOpenBanking={() => router.push(actionUrl("/office/admin/cash-banking", { collectorId: selectedCollector.collectorId }))}
                        onOpenReceipts={() => viewCollectorReceipts(selectedCollector.collectorId)}
                    />
                ) : null}
            </div>
        </main>
    );
}

function KpiButton({ kpi, onClick, spotlight, syncedAt }: { kpi: CashPositionData["kpis"][number]; onClick: () => void; spotlight: string | null; syncedAt: string }) {
    const displayValue = kpi.label.includes("Alerts") || kpi.label.includes("Offices With")
        ? Math.round(kpi.value).toLocaleString()
        : money(kpi.value);
    const status = kpi.tone === "red" ? "Critical" : kpi.tone === "amber" ? "Attention" : "Healthy";
    return (
        <button
            type="button"
            title={kpi.hint}
            onClick={onClick}
            className={`group relative min-h-[160px] min-w-0 max-w-full overflow-hidden rounded-[26px] border bg-gradient-to-br p-4 text-left shadow-2xl backdrop-blur transition duration-300 hover:-translate-y-1 hover:shadow-cyan-950/40 focus:outline-none focus:ring-4 focus:ring-cyan-300/15 motion-reduce:transform-none ${toneClasses(kpi.tone)} ${spotlight === kpi.label ? "ring-2 ring-cyan-200/60" : ""}`}
        >
            <div className="absolute right-2 top-2 h-20 w-20 rounded-full bg-white/10 blur-2xl transition group-hover:bg-white/16" />
            <div className="relative flex items-start justify-between gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/10 text-white shadow-lg transition duration-300 group-hover:scale-105 motion-reduce:transform-none">{kpiIcon(kpi.label)}</span>
                <TrendChip current={kpi.value} previous={kpi.previousValue} tone={kpi.tone} />
            </div>
            <p className="relative mt-4 min-w-0 max-w-full break-words text-[11px] font-black uppercase tracking-wide text-slate-300">{kpi.label}</p>
            <p className="relative mt-2 min-w-0 max-w-full break-words text-[clamp(1.05rem,1.45vw,1.55rem)] font-black tracking-tight text-white">{displayValue}</p>
            <div className="relative mt-2 flex flex-wrap gap-2">
                <span className="rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[10px] font-black uppercase text-white">{status}</span>
                <span className="rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[10px] font-black uppercase text-cyan-100">Live</span>
            </div>
            <p className="relative mt-2 min-w-0 max-w-full break-words text-xs font-bold leading-5 text-slate-300">{kpi.hint}</p>
            <p className="relative mt-3 text-[10px] font-black uppercase tracking-wide text-cyan-100">Updated {syncedAt}</p>
        </button>
    );
}

function AICashDirector({ data, onAction }: { data: CashPositionData; onAction: () => void }) {
    const lead = data.insights[0];
    return (
        <section className="relative overflow-hidden rounded-[30px] border border-cyan-300/20 bg-gradient-to-br from-cyan-300/14 via-slate-900/78 to-slate-950 p-5 shadow-2xl shadow-cyan-950/25">
            <div className="absolute right-3 top-3 h-28 w-28 rounded-full bg-cyan-300/16 blur-3xl" />
            <div className="relative flex items-start gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-cyan-300 text-slate-950 shadow-lg shadow-cyan-400/20"><Brain size={22} /></span>
                <div>
                    <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-100">Executive AI panel</p>
                    <h2 className="mt-1 text-2xl font-black">AI Cash Director</h2>
                    <p className="mt-1 text-sm font-semibold leading-6 text-cyan-50">Live treasury intelligence from office balances, collector cash, banking movement and security exposure.</p>
                </div>
            </div>
            {lead ? (
                <article className="relative mt-5 rounded-3xl border border-white/10 bg-white/[0.07] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-lg font-black text-white">{lead.title}</p>
                        <RiskPill severity={lead.severity} />
                    </div>
                    <p className="mt-2 text-sm font-semibold leading-6 text-slate-200">{lead.message}</p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <Mini label="UGX affected" value={money(lead.amount)} />
                        <Mini label="Recommended action" value={lead.action} wide />
                    </div>
                </article>
            ) : null}
            <div className="relative mt-4 grid gap-3 lg:grid-cols-2">
                {data.insights.slice(1).map((insight) => (
                    <article key={insight.id} className={`rounded-2xl border p-3 transition hover:-translate-y-0.5 motion-reduce:transform-none ${insight.severity === "critical" ? "border-red-300/20 bg-red-400/10" : insight.severity === "warning" ? "border-amber-300/20 bg-amber-400/10" : insight.severity === "success" ? "border-emerald-300/20 bg-emerald-400/10" : "border-white/10 bg-slate-950/50"}`}>
                        <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-black text-white">{insight.title}</p>
                            <span className="text-xs font-black text-cyan-100">{money(insight.amount)}</span>
                        </div>
                        <p className="mt-1 text-xs font-semibold leading-5 text-slate-300">{insight.message}</p>
                        <button type="button" onClick={onAction} className="mt-3 rounded-full bg-white/10 px-3 py-1 text-xs font-black text-white hover:bg-white hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-200">{insight.action}</button>
                    </article>
                ))}
            </div>
            <p className="relative mt-4 text-[10px] font-black uppercase tracking-wide text-slate-400">Last refreshed {dateTime(data.generatedAt)}</p>
        </section>
    );
}

function DailyCashCards({
    cards,
    onSelectDate,
    onViewReceipts,
}: {
    cards: CashPositionDailyCard[];
    onSelectDate: (date: string) => void;
    onViewReceipts: (card: CashPositionDailyCard) => void;
}) {
    return (
        <section className="rounded-[30px] border border-white/10 bg-white/[0.055] p-4 shadow-2xl shadow-black/25">
            <PanelHeading icon={<CalendarDays size={18} />} title="Daily Cash Movement" subtitle="Compact day cards replace plain bars and open a date-level cash story." />
            <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-3">
                {cards.map((card) => (
                    <article key={card.date} role="button" tabIndex={0} onClick={() => onSelectDate(card.date)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelectDate(card.date); }} className="group min-w-0 max-w-full overflow-hidden rounded-[24px] border border-white/10 bg-slate-950/72 p-4 text-left shadow-xl shadow-black/15 transition duration-300 hover:-translate-y-1 hover:border-cyan-200/35 hover:bg-slate-900 focus:outline-none focus:ring-4 focus:ring-cyan-300/15 motion-reduce:transform-none">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-xs font-black uppercase tracking-wide text-slate-400">{dateLabel(card.date)}</p>
                                <p className="mt-1 text-xl font-black text-white">{money(card.totalCollected)}</p>
                            </div>
                            <TrendLabel trend={card.trend} value={card.changeFromPreviousDay} />
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-2">
                            <Mini label="Collected" value={money(card.totalCollected)} />
                            <Mini label="Approved expenses" value={money(card.approvedExpenses)} />
                            <Mini label="Banked" value={money(card.amountBanked)} />
                            <Mini label="Admin" value={money(card.amountHandedToAdmin)} />
                            <Mini label="Still held" value={money(card.cashStillHeld)} risky={card.cashReconciliationDifference > 0 || card.cashStillHeld > 1_000_000} />
                            <Mini label="Cash Reconciliation Difference" value={money(card.cashReconciliationDifference)} risky={card.cashReconciliationDifference > 0} />
                            <Mini label="Receipts" value={card.receiptCount.toLocaleString()} onClick={() => onViewReceipts(card)} />
                            <Mini label="Strongest office" value={card.strongestOffice} wide />
                            <Mini label="Strongest collector" value={card.strongestCollector} wide />
                        </div>
                        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800">
                            <div className="h-full rounded-full bg-gradient-to-r from-emerald-300 via-cyan-300 to-blue-400 transition-all group-hover:brightness-125" style={{ width: `${Math.min(100, Math.max(6, card.totalCollected ? ((card.amountBanked + card.amountHandedToAdmin) / card.totalCollected) * 100 : 6))}%` }} />
                        </div>
                    </article>
                ))}
            </div>
        </section>
    );
}

function OfficeComparisonCards({
    expandedOffice,
    offices,
    onSelect,
    onViewOffice,
    onViewReceipts,
    onViewReceiptsBreakdown,
}: {
    expandedOffice: string | null;
    offices: CashPositionOfficeRow[];
    onSelect: (officeId: string) => void;
    onViewOffice: (officeId: string) => void;
    onViewReceipts: (officeId: string) => void;
    onViewReceiptsBreakdown: (office: CashPositionOfficeRow) => void;
}) {
    return (
        <section className="rounded-[30px] border border-white/10 bg-white/[0.055] p-4 shadow-2xl shadow-black/25">
            <PanelHeading icon={<Building2 size={18} />} title="Office Performance Comparison" subtitle="Finance cards ranked by Company Cash Position: selected-period collections minus approved expenses." />
            <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-3">
                {offices.map((office, index) => (
                    <article key={office.officeId} className={`group min-w-0 max-w-full overflow-hidden rounded-[24px] border p-4 text-left shadow-xl shadow-black/15 transition duration-300 hover:-translate-y-1 hover:shadow-cyan-950/25 motion-reduce:transform-none ${expandedOffice === office.officeId ? "border-cyan-200/60 bg-cyan-300/10" : "border-white/10 bg-slate-950/72 hover:border-cyan-200/35"}`}>
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="break-words text-base font-black text-white">#{index + 1} {office.officeName}</p>
                                <p className="mt-1 break-words text-xs font-bold text-slate-400">Last cash activity: {dateTime(office.lastPaymentAt)}</p>
                            </div>
                            <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-black uppercase ${statusBadge(office.status)}`}>{office.status}</span>
                        </div>
                        <div className={`mt-4 rounded-[24px] border p-4 ${office.cashReconciliationDifference > 0 ? "border-red-300/25 bg-red-400/12" : office.dailyCashRemainingAtOffice < 1_000_000 ? "border-amber-300/25 bg-amber-400/12" : "border-emerald-300/25 bg-emerald-400/12"}`}>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">Company Cash Position</p>
                            <p className="mt-2 break-words text-[clamp(1.3rem,2vw,2.1rem)] font-black leading-tight text-white">{money(office.dailyCashRemainingAtOffice)}</p>
                            <p className="mt-1 text-xs font-bold text-slate-300">Collections minus approved expenses dated inside the selected period. Banking remains separate.</p>
                        </div>
                        <div className={`mt-3 rounded-[24px] border p-4 ${office.cashHeldInOffice < 0 ? "border-red-300/25 bg-red-400/12" : "border-white/10 bg-slate-950/55"}`}>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">Current Physical Office Cash</p>
                            <p className="mt-2 break-words text-[clamp(1.3rem,2vw,2.1rem)] font-black leading-tight text-white">{money(office.cashHeldInOffice)}</p>
                            <p className="mt-1 text-xs font-bold text-slate-300">Separate live ledger balance across all dates. It is not mixed into the selected-period card.</p>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-2">
                            <Mini label="Collections for selected period" value={money(office.dailyCollected)} />
                            <Mini label="Approved expenses for selected period" value={money(office.dailyApprovedExpenses)} />
                            <Mini label="Banked for selected period" value={money(office.dailyBanked)} />
                            <Mini label="Handed to Admin for selected period" value={money(office.dailyHandedToAdmin)} />
                            <Mini label="Company Cash Position" value={money(office.dailyCashRemainingAtOffice)} />
                            <Mini label="Cash Reconciliation Difference" value={money(office.cashReconciliationDifference)} risky={office.cashReconciliationDifference > 0} />
                            <Mini label="Likely cause" value={office.cashReconciliationCause} wide />
                            <Mini label="Expense count" value={office.expenseCount.toLocaleString()} />
                            <Mini label="Cash collected today" value={money(office.cashCollectedToday)} />
                            <Mini label="Cash before expenses" value={money(office.cashBeforeExpenses)} />
                            <Mini label="Approved expenses" value={money(office.approvedExpensesPeriod)} />
                            <Mini label="Pending expenses" value={money(office.pendingExpensesPeriod)} risky={office.pendingExpensesPeriod > office.cashHeldInOffice && office.pendingExpensesPeriod > 0} />
                            <Mini label="Current Physical Office Cash" value={money(office.cashHeldInOffice)} risky={office.cashHeldInOffice < 0} />
                            <Mini label="Projected cash after pending expenses" value={money(office.projectedCashAfterPendingExpenses)} risky={office.projectedCashAfterPendingExpenses < 0} />
                            <Mini label="Cash banked" value={money(office.alreadyBanked)} />
                            <Mini label="Cash handed to Admin" value={money(office.givenToAdmin)} />
                            <Mini label="Outstanding cash" value={money(office.outstandingToBank)} risky={office.outstandingToBank > 1_000_000} />
                            <Mini label="Expense-to-collection %" value={percent(office.cashBeforeExpenses > 0 ? (office.approvedExpensesPeriod / office.cashBeforeExpenses) * 100 : 0)} />
                            <Mini label="Receipts" value={office.numberOfReceipts.toLocaleString()} onClick={() => onViewReceiptsBreakdown(office)} />
                            <Mini label="Banking %" value={percent(office.bankingPercentage)} />
                            <Mini label="Top collector" value={office.collectorCount ? `${office.collectorCount} active` : "No collector"} />
                            <Mini label="Trend" value={office.trend} />
                        </div>
                        <div className="mt-4 grid gap-2 sm:grid-cols-2">
                            <button type="button" onClick={() => onSelect(office.officeId)} className="inline-flex min-w-0 items-center justify-center gap-2 rounded-full bg-white/10 px-3 py-2 text-xs font-black text-white transition hover:bg-white hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-200">
                                <ChevronDown size={13} /> Expand
                            </button>
                            <button type="button" onClick={() => onViewOffice(office.officeId)} className="inline-flex min-w-0 items-center justify-center gap-2 rounded-full bg-cyan-300 px-3 py-2 text-xs font-black text-slate-950 transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-cyan-200">
                                <Eye size={13} /> View Office Position
                            </button>
                            <button type="button" onClick={() => onViewReceipts(office.officeId)} className="inline-flex min-w-0 items-center justify-center gap-2 rounded-full bg-white/10 px-3 py-2 text-xs font-black text-white transition hover:bg-white hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-200 sm:col-span-2">
                                <FileText size={13} /> View Receipts
                            </button>
                        </div>
                    </article>
                ))}
            </div>
        </section>
    );
}

function CollectorCards({
    collectors,
    onReconcile,
    onViewActivity,
    onViewCash,
    onViewReceipts,
}: {
    collectors: CashPositionCollectorRow[];
    onReconcile: (collectorId: string) => void;
    onViewActivity: (collectorId: string) => void;
    onViewCash: (collectorId: string) => void;
    onViewReceipts: (collectorId: string) => void;
}) {
    return (
        <section className="rounded-[30px] border border-white/10 bg-white/[0.055] p-4 shadow-2xl shadow-black/25">
            <div className="mb-4 flex items-center justify-between gap-3">
                <PanelHeading icon={<UsersRound size={18} />} title="Collector Performance" subtitle="Rankings from payment records, collector cash balances and last activity." />
                <Pill tone="cyan">{collectors.length.toLocaleString()} collectors</Pill>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-3">
                {collectors.map((collector, index) => (
                    <article key={collector.collectorId} className="group min-w-0 max-w-full overflow-hidden rounded-[26px] border border-white/10 bg-slate-950/72 p-4 shadow-xl shadow-black/15 transition duration-300 hover:-translate-y-1 hover:border-cyan-200/35 motion-reduce:transform-none">
                        <div className="flex items-start gap-3">
                            <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-cyan-300 to-emerald-300 text-lg font-black text-slate-950">
                                {collector.photoUrl ? <img src={collector.photoUrl} alt="" className="h-full w-full object-cover" /> : collector.collectorName.slice(0, 1)}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="break-words text-sm font-black text-white">#{index + 1} {collector.collectorName}</p>
                                <p className="break-words text-xs font-semibold text-slate-400">{collector.officeName} · {collector.currentStatus}</p>
                            </div>
                            <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-black ${collector.riskScore >= 70 ? "bg-red-400/15 text-red-100" : collector.riskScore >= 40 ? "bg-amber-400/15 text-amber-100" : "bg-emerald-400/15 text-emerald-100"}`}>Risk {collector.riskScore}%</span>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                            <Mini label="Today" value={money(collector.todayCollections)} />
                            <Mini label="This Week" value={money(collector.thisWeek)} />
                            <Mini label="This Month" value={money(collector.thisMonth)} />
                            <Mini label="Cash Held" value={money(collector.cashInHand)} risky={collector.cashInHand > 500_000} />
                            <Mini label="Submitted" value={money(collector.cashSubmitted)} />
                            <Mini label="Last Receipt" value={money(collector.largestReceipt)} />
                            <Mini label="Receipt Count" value={collector.todayCollections ? "Live" : "None today"} />
                            <Mini label="Reliability" value={percent(collector.reliability)} />
                            <Mini label="Delay Risk" value={collector.riskScore >= 70 ? "High" : collector.riskScore >= 40 ? "Medium" : "Low"} />
                            <Mini label="Trend" value={collector.collectionSpeed} />
                            <Mini label="Last Activity" value={dateTime(collector.lastActivity)} wide />
                        </div>
                        <div className="mt-4 grid gap-2 sm:grid-cols-2">
                            <button type="button" onClick={() => onViewReceipts(collector.collectorId)} className="rounded-full bg-white/10 px-3 py-2 text-xs font-black text-white hover:bg-white hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-200">View Receipts</button>
                            <button type="button" onClick={() => onViewCash(collector.collectorId)} className="rounded-full bg-cyan-300 px-3 py-2 text-xs font-black text-slate-950 hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-cyan-200">View Cash Position</button>
                            <button type="button" onClick={() => onViewActivity(collector.collectorId)} className="rounded-full bg-white/10 px-3 py-2 text-xs font-black text-white hover:bg-white hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-200">View Activity</button>
                            <button type="button" onClick={() => onReconcile(collector.collectorId)} className="rounded-full bg-emerald-300 px-3 py-2 text-xs font-black text-slate-950 hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-emerald-200">Reconcile Collector</button>
                        </div>
                    </article>
                ))}
                {!collectors.length ? <p className="rounded-2xl border border-dashed border-white/20 p-5 text-sm font-bold text-slate-400">No collector records are available for this company yet.</p> : null}
            </div>
        </section>
    );
}

function CollectorActionPanel({
    collector,
    mode,
    onClose,
    onOpenAudit,
    onOpenBanking,
    onOpenReceipts,
}: {
    collector: CashPositionCollectorRow;
    mode: "cash" | "activity" | "reconcile";
    onClose: () => void;
    onOpenAudit: () => void;
    onOpenBanking: () => void;
    onOpenReceipts: () => void;
}) {
    const difference = Math.max(0, collector.cashInHand - collector.cashSubmitted - collector.banked);
    const title = mode === "reconcile"
        ? "Collector Reconciliation"
        : mode === "activity"
            ? "Collector Activity Timeline"
            : "Collector Cash Position";
    return (
        <section className="rounded-[30px] border border-cyan-300/20 bg-cyan-300/10 p-4 shadow-2xl shadow-cyan-950/20">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-100">{title}</p>
                    <h2 className="mt-2 break-words text-2xl font-black">{collector.collectorName}</h2>
                    <p className="mt-1 break-words text-sm font-semibold text-cyan-50">{collector.officeName} · {collector.currentStatus}</p>
                </div>
                <button type="button" onClick={onClose} className="rounded-full border border-white/10 bg-white/10 px-3 py-2 text-xs font-black text-white hover:bg-white hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-200">
                    Close
                </button>
            </div>
            <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
                <Mini label="Today’s collections" value={money(collector.todayCollections)} />
                <Mini label="Weekly collections" value={money(collector.thisWeek)} />
                <Mini label="Monthly collections" value={money(collector.thisMonth)} />
                <Mini label="Cash currently held" value={money(collector.cashInHand)} risky={collector.cashInHand > 500_000} />
                <Mini label="Submitted amount" value={money(collector.cashSubmitted)} />
                <Mini label="Banked amount" value={money(collector.banked)} />
                <Mini label="Outstanding amount" value={money(collector.outstanding)} risky={collector.outstanding > 500_000} />
                <Mini label="Receipt total" value={money(collector.todayCollections)} />
                <Mini label="Average receipt" value={money(collector.averageReceipt)} />
                <Mini label="Largest receipt" value={money(collector.largestReceipt)} />
                <Mini label="Last receipt/activity" value={dateTime(collector.lastActivity)} />
                <Mini label="Reliability" value={percent(collector.reliability)} />
                <Mini label="Delay risk" value={collector.riskScore >= 70 ? "High" : collector.riskScore >= 40 ? "Medium" : "Low"} />
                <Mini label="Performance trend" value={collector.collectionSpeed} />
                <Mini label="Difference" value={money(difference)} risky={difference > 0} />
                <Mini label="Reconciliation status" value={difference > 0 ? "Needs review" : "Balanced"} />
            </div>
            {mode === "activity" ? (
                <div className="mt-4 rounded-3xl border border-white/10 bg-slate-950/60 p-4">
                    <p className="text-sm font-black text-white">Recent live activity summary</p>
                    <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
                        <Mini label="Payments recorded" value={money(collector.todayCollections)} />
                        <Mini label="Receipts created" value={collector.todayCollections > 0 ? "Live receipts available" : "No receipts today"} />
                        <Mini label="Cash submitted" value={money(collector.cashSubmitted)} />
                        <Mini label="Corrections/Reversals" value="Open audit for details" />
                    </div>
                </div>
            ) : null}
            {mode === "reconcile" ? (
                <div className="mt-4 rounded-3xl border border-emerald-300/20 bg-emerald-300/10 p-4">
                    <p className="text-sm font-black text-white">Reconciliation actions</p>
                    <p className="mt-1 text-xs font-semibold leading-5 text-emerald-50">
                        Cash write actions remain in the canonical Cash Banking workflow so reconciliation, shortages, overages and audit history use the existing live ledger.
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        <button type="button" onClick={onOpenBanking} className="rounded-2xl bg-emerald-300 px-4 py-3 text-xs font-black text-slate-950 hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-emerald-200">Confirm Reconciliation</button>
                        <button type="button" onClick={onOpenBanking} className="rounded-2xl bg-white/10 px-4 py-3 text-xs font-black text-white hover:bg-white hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-200">Record Shortage</button>
                        <button type="button" onClick={onOpenBanking} className="rounded-2xl bg-white/10 px-4 py-3 text-xs font-black text-white hover:bg-white hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-200">Record Overage</button>
                        <button type="button" onClick={onOpenAudit} className="rounded-2xl bg-white/10 px-4 py-3 text-xs font-black text-white hover:bg-white hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-200">View Audit History</button>
                    </div>
                </div>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={onOpenReceipts} className="rounded-2xl bg-white/10 px-4 py-3 text-xs font-black text-white hover:bg-white hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-200">View Receipts</button>
                <button type="button" onClick={onOpenBanking} className="rounded-2xl bg-cyan-300 px-4 py-3 text-xs font-black text-slate-950 hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-cyan-200">Open Cash Banking</button>
                <button type="button" onClick={onOpenAudit} className="rounded-2xl bg-white/10 px-4 py-3 text-xs font-black text-white hover:bg-white hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-200">Open Activity Audit</button>
            </div>
        </section>
    );
}

function PremiumChart({ icon, mode = "bars", points, title }: { icon: ReactNode; mode?: "bars" | "tiles"; points: CashPositionChartPoint[]; title: string }) {
    const max = Math.max(1, ...points.map((point) => point.value));
    return (
        <section className="rounded-[30px] border border-white/10 bg-white/[0.055] p-4 shadow-2xl shadow-black/25">
            <PanelHeading icon={icon} title={title} subtitle="Hover-ready executive chart with compact legends and UGX formatting." />
            <div className={mode === "tiles" ? "mt-4 grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3" : "mt-4 grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3"}>
                {points.map((point, index) => (
                    <article key={`${point.label}-${index}`} title={`${point.label}: ${money(point.value)}`} className="group min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/72 p-3 transition hover:-translate-y-0.5 hover:border-cyan-200/35 motion-reduce:transform-none">
                        <div className="flex items-center justify-between gap-2">
                            <p className="min-w-0 break-words text-xs font-black text-slate-300">{point.label}</p>
                            <p className="min-w-0 break-words text-right text-xs font-black text-white">{money(point.value)}</p>
                        </div>
                        <div className="mt-3 flex h-16 items-end gap-1">
                            <div className="w-full overflow-hidden rounded-xl bg-slate-800">
                                <div className="rounded-xl bg-gradient-to-t from-emerald-300 via-cyan-300 to-blue-400 transition-all group-hover:brightness-125" style={{ height: `${Math.max(8, Math.round((point.value / max) * 64))}px` }} />
                            </div>
                        </div>
                    </article>
                ))}
                {!points.length ? <p className="text-xs font-bold text-slate-400">No live data for this chart yet.</p> : null}
            </div>
        </section>
    );
}

function ReceiptBreakdownPanel({
    onClose,
    panel,
}: {
    onClose: () => void;
    panel: { title: string; records: CashPositionReceiptBreakdownItem[] };
}) {
    const total = panel.records.reduce((sum, record) => sum + record.amount, 0);
    const count = panel.records.filter((record) => record.contributesToReceiptCount).length;
    return (
        <section className="rounded-[30px] border border-cyan-300/20 bg-cyan-300/10 p-4 shadow-2xl shadow-cyan-950/20">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-100">Receipt Breakdown</p>
                    <h2 className="mt-2 break-words text-2xl font-black">{panel.title}</h2>
                    <p className="mt-1 text-sm font-semibold text-cyan-50">{count.toLocaleString()} canonical receipts · {money(total)}</p>
                </div>
                <button type="button" onClick={onClose} className="rounded-full border border-white/10 bg-white/10 px-3 py-2 text-xs font-black text-white hover:bg-white hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-cyan-200">
                    Close
                </button>
            </div>
            <div className="mt-4 overflow-auto rounded-3xl border border-white/10">
                <table className="min-w-[1180px] border-collapse text-left text-sm">
                    <thead className="bg-slate-950 text-[11px] uppercase text-slate-400">
                        <tr>
                            {["Receipt", "Room", "Tenant", "Amount", "Collector", "Method", "Office", "Time", "Status", "Actions"].map((head) => (
                                <th key={head} className="border-b border-white/10 px-3 py-3 font-black">{head}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {panel.records.map((record) => (
                            <tr key={record.paymentId} className="border-b border-white/6 bg-slate-950/50">
                                <td className="px-3 py-3 font-black text-white">
                                    {record.receiptNumber ?? "Missing receipt"}
                                    {record.warning ? <p className="mt-1 text-[11px] font-bold text-amber-100">{record.warning}</p> : null}
                                </td>
                                <td className="px-3 py-3 font-bold text-slate-200">{record.roomNumber ?? "Unassigned"}</td>
                                <td className="px-3 py-3 font-bold text-slate-200">{record.tenantName}</td>
                                <td className="px-3 py-3 font-black text-emerald-100">{money(record.amount)}</td>
                                <td className="px-3 py-3 font-bold text-slate-200">{record.collectorName}</td>
                                <td className="px-3 py-3 font-bold text-slate-200">{record.paymentMethod}</td>
                                <td className="px-3 py-3 font-bold text-slate-200">{record.officeName}</td>
                                <td className="px-3 py-3 font-bold text-slate-200">{dateTime(record.issuedAt ?? record.createdAt ?? record.paymentDate)}</td>
                                <td className="px-3 py-3">
                                    <span className={`rounded-full border px-2 py-1 text-xs font-black uppercase ${record.warning ? "border-amber-300/25 bg-amber-300/12 text-amber-100" : "border-emerald-300/25 bg-emerald-300/12 text-emerald-100"}`}>
                                        {record.status}
                                    </span>
                                </td>
                                <td className="px-3 py-3">
                                    <div className="flex flex-wrap gap-2">
                                        {record.viewReceiptHref ? <a href={record.viewReceiptHref} className="inline-flex items-center gap-1 rounded-full bg-cyan-300 px-3 py-2 text-xs font-black text-slate-950 hover:brightness-110"><ExternalLink size={12} /> View Receipt</a> : null}
                                        <a href={record.openPaymentHref} className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-2 text-xs font-black text-white hover:bg-white hover:text-slate-950"><FileText size={12} /> Open Payment</a>
                                        <a href={record.auditHref} className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-2 text-xs font-black text-white hover:bg-white hover:text-slate-950"><AlertTriangle size={12} /> View Audit History</a>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {!panel.records.length ? <p className="mt-4 rounded-2xl border border-dashed border-white/20 p-5 text-sm font-bold text-slate-400">No valid receipt-contributing payments match this selection.</p> : null}
        </section>
    );
}

function OfficeExpansionPanel({ office, onViewReceiptsBreakdown }: { office: CashPositionOfficeRow; onViewReceiptsBreakdown: (office: CashPositionOfficeRow) => void }) {
    return (
        <section className="rounded-[30px] border border-emerald-300/20 bg-emerald-300/10 p-4 shadow-2xl shadow-emerald-950/20">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-100">Office Expansion Panel</p>
                    <h2 className="mt-2 text-2xl font-black">{office.officeName}</h2>
                    <p className="mt-1 text-sm font-semibold text-emerald-50">{office.statusReason}</p>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase ${statusBadge(office.status)}`}>{office.status}</span>
            </div>
            <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3">
                <Mini label="Collections for selected period" value={money(office.dailyCollected)} />
                <Mini label="Approved expenses for selected period" value={money(office.dailyApprovedExpenses)} />
                <Mini label="Banked for selected period" value={money(office.dailyBanked)} />
                <Mini label="Handed to Admin for selected period" value={money(office.dailyHandedToAdmin)} />
                <Mini label="Company Cash Position" value={money(office.dailyCashRemainingAtOffice)} />
                <Mini label="Cash Reconciliation Difference" value={money(office.cashReconciliationDifference)} risky={office.cashReconciliationDifference > 0} />
                <Mini label="Expense count" value={office.expenseCount.toLocaleString()} />
                <Mini label="Collectors" value={office.collectorCount.toLocaleString()} />
                <Mini label="Collector cash" value={money(office.cashHeldByCollectors)} />
                <Mini label="Cash submitted" value={money(Math.max(0, office.todayPerformance - office.cashHeldByCollectors))} />
                <Mini label="Cash waiting" value={money(office.outstandingToBank)} risky={office.outstandingToBank > 1_000_000} />
                <Mini label="Receipts" value={office.numberOfReceipts.toLocaleString()} onClick={() => onViewReceiptsBreakdown(office)} />
                <Mini label="Bank history" value={money(office.alreadyBanked)} />
                <Mini label="Admin handovers" value={money(office.givenToAdmin)} />
                <Mini label="Current Physical Office Cash" value={money(office.cashHeldInOffice)} risky={office.cashHeldInOffice < 0} />
                <Mini label="Collection efficiency" value={percent(office.bankingPercentage)} />
                <Mini label="Selected-period cash waiting" value={money(office.outstandingToBank)} risky={office.outstandingToBank > 1_000_000} />
                <Mini label="Security deposits" value={money(office.securityDeposits)} />
                <Mini label="Average payment" value={money(office.numberOfReceipts ? office.monthlyPerformance / office.numberOfReceipts : 0)} />
                <Mini label="Largest payment" value={money(office.largestPayment)} />
                <Mini label="Last payment" value={dateTime(office.lastPaymentAt)} wide />
                <Mini label="Likely reconciliation cause" value={office.cashReconciliationCause} wide />
                <Mini label="Reconciliation status" value={office.statusReason} wide />
            </div>
        </section>
    );
}

function TrendChip({ current, previous = 0, tone }: { current: number; previous?: number; tone: string }) {
    const delta = current - previous;
    const pct = previous ? (delta / Math.abs(previous)) * 100 : current > 0 ? 100 : 0;
    const good = delta >= 0;
    const riskTone = tone === "red" || tone === "amber";
    return (
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-black ${good && !riskTone ? "border-emerald-300/25 bg-emerald-300/12 text-emerald-100" : "border-amber-300/25 bg-amber-300/12 text-amber-100"}`}>
            {good ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {Math.abs(Math.round(pct)).toLocaleString()}%
        </span>
    );
}

function TrendLabel({ trend, value }: { trend: "up" | "down" | "flat"; value?: number }) {
    return (
        <span className={`inline-flex min-w-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-black ${trend === "up" ? "bg-emerald-300/10 text-emerald-100" : trend === "down" ? "bg-red-300/10 text-red-100" : "bg-white/10 text-slate-200"}`}>
            {trend === "up" ? <TrendingUp size={12} /> : trend === "down" ? <TrendingDown size={12} /> : <LineChart size={12} />}
            {typeof value === "number" ? money(value) : trend}
        </span>
    );
}

function RiskPill({ severity }: { severity: string }) {
    const classes = severity === "critical" ? "border-red-300/25 bg-red-400/15 text-red-100" : severity === "warning" ? "border-amber-300/25 bg-amber-400/15 text-amber-100" : severity === "success" ? "border-emerald-300/25 bg-emerald-400/15 text-emerald-100" : "border-cyan-300/25 bg-cyan-400/15 text-cyan-100";
    return <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase ${classes}`}>{severity}</span>;
}

function MoneyCell({ positive = false, value, warning = false }: { positive?: boolean; value: number; warning?: boolean }) {
    const color = warning ? "text-amber-100" : value < 0 ? "text-red-100" : positive ? "text-emerald-100" : "text-white";
    return <td className={`px-3 py-3 font-black ${color}`}>{money(value)}</td>;
}

function Mini({ label, onClick, risky = false, value, wide = false }: { label: string; onClick?: () => void; risky?: boolean; value: string; wide?: boolean }) {
    const className = `min-w-0 max-w-full overflow-hidden rounded-2xl border border-white/10 bg-slate-950/60 p-3 ${wide ? "sm:col-span-2" : ""} ${onClick ? "text-left transition hover:border-cyan-200/35 hover:bg-cyan-300/10 focus:outline-none focus:ring-2 focus:ring-cyan-200" : ""}`;
    const content = (
        <>
            <p className="min-w-0 break-words text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p>
            <p className={`mt-1 min-w-0 max-w-full break-words text-[clamp(0.78rem,1vw,0.95rem)] font-black leading-5 ${risky ? "text-red-100" : "text-white"}`}>{value}</p>
        </>
    );
    if (onClick) return <button type="button" onClick={(event) => { event.stopPropagation(); onClick(); }} className={className}>{content}</button>;
    return <div className={className}>{content}</div>;
}

function PanelHeading({ icon, subtitle, title }: { icon: ReactNode; subtitle: string; title: string }) {
    return (
        <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10 text-cyan-100">{icon}</span>
            <div className="min-w-0">
                <h2 className="text-lg font-black text-white">{title}</h2>
                <p className="text-xs font-semibold leading-5 text-slate-400">{subtitle}</p>
            </div>
        </div>
    );
}

function Pill({ children, tone }: { children: ReactNode; tone: "green" | "cyan" | "gold" }) {
    const classes = tone === "green" ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100" : tone === "gold" ? "border-amber-300/25 bg-amber-300/10 text-amber-100" : "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
    return <span className={`min-w-0 max-w-full break-words rounded-full border px-3 py-1 text-xs font-black uppercase tracking-wide ${classes}`}>{children}</span>;
}

function ActionButton({ children, icon, onClick }: { children: ReactNode; icon: ReactNode; onClick: () => void }) {
    return (
        <button type="button" onClick={onClick} className="inline-flex min-w-0 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-white/15 hover:shadow-lg hover:shadow-cyan-950/20 focus:outline-none focus:ring-2 focus:ring-cyan-200 motion-reduce:transform-none">
            {icon} {children}
        </button>
    );
}

function PrimaryButton({ children, icon, onClick }: { children: ReactNode; icon: ReactNode; onClick: () => void }) {
    return (
        <button type="button" onClick={onClick} className="inline-flex min-w-0 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-300 to-cyan-300 px-4 py-3 text-sm font-black text-slate-950 shadow-lg shadow-cyan-950/20 transition hover:-translate-y-0.5 hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-cyan-200 motion-reduce:transform-none">
            {icon} {children}
        </button>
    );
}

function Input({ label, onChange, onClear, type = "text", value }: { label: string; onChange: (value: string) => void; onClear?: () => void; type?: string; value: string }) {
    return (
        <label className="text-xs font-black uppercase text-slate-400">
            <span className="flex items-center justify-between gap-2">
                {label}
                {onClear && value ? <button type="button" onClick={(event) => { event.preventDefault(); onClear(); }} className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[10px] font-black text-white hover:bg-white hover:text-slate-950">Clear ×</button> : null}
            </span>
            <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-[46px] w-full rounded-2xl border border-white/10 bg-slate-950 px-3 text-sm font-bold text-white outline-none ring-cyan-300/0 transition focus:border-cyan-300/50 focus:ring-4 focus:ring-cyan-300/10" />
        </label>
    );
}

function Select({ label, onChange, onClear, options, value }: { label: string; onChange: (value: string) => void; onClear?: () => void; options: Array<[string, string]>; value: string }) {
    return (
        <label className="text-xs font-black uppercase text-slate-400">
            <span className="flex items-center justify-between gap-2">
                {label}
                {onClear && value ? <button type="button" onClick={(event) => { event.preventDefault(); onClear(); }} className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[10px] font-black text-white hover:bg-white hover:text-slate-950">Clear ×</button> : null}
            </span>
            <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-[46px] w-full rounded-2xl border border-white/10 bg-slate-950 px-3 text-sm font-bold text-white outline-none ring-cyan-300/0 transition focus:border-cyan-300/50 focus:ring-4 focus:ring-cyan-300/10">
                {options.map(([optionValue, optionLabel]) => <option key={`${label}-${optionValue}`} value={optionValue}>{optionLabel}</option>)}
            </select>
        </label>
    );
}
