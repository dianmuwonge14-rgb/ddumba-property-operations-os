"use client";

import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Bot, CalendarClock, Download, FileText, MessageCircle, Phone, Printer, RefreshCw, Search, Send, Sparkles, WalletCards, Wifi } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { DefaulterItem, DefaultersPageData } from "@/lib/defaulters/types";

type Props = {
    data: DefaultersPageData;
};

type PeriodFilter = "all" | "today" | "1_7" | "8_14" | "15_30" | "1_month" | "2_months" | "3_plus" | "custom_days" | "custom_months";
type ListFilter = "active" | "vacated" | "high_risk" | "promises_due";
type LandlordSort = "az" | "za";

type LandlordGroup = {
    landlordId: string;
    landlordName: string;
    officeName: string;
    items: DefaulterItem[];
    totalOutstanding: number;
    totalMonthlyRent: number;
    totalArrears: number;
    totalPayments: number;
    highestOutstandingRoom: DefaulterItem | null;
    oldestDebt: DefaulterItem | null;
};

function money(value: number | string | null | undefined) {
    return `UGX ${Math.round(Number(value ?? 0)).toLocaleString()}`;
}

function normalize(value: string | null | undefined) {
    return String(value ?? "").trim().toLowerCase();
}

function landlordSortValue(value: string | null | undefined) {
    return normalize(value || "Unknown landlord");
}

function compareLandlordNames(a: string | null | undefined, b: string | null | undefined, direction: LandlordSort) {
    const comparison = landlordSortValue(a).localeCompare(landlordSortValue(b), undefined, { numeric: true, sensitivity: "base" });
    return direction === "za" ? -comparison : comparison;
}

function compareRoomNumbers(a: string | null | undefined, b: string | null | undefined) {
    return String(a ?? "").trim().localeCompare(String(b ?? "").trim(), undefined, { numeric: true, sensitivity: "base" });
}

function compareByLandlordThenRoom(a: DefaulterItem, b: DefaulterItem, direction: LandlordSort) {
    const landlordComparison = compareLandlordNames(a.landlordName, b.landlordName, direction);
    if (landlordComparison !== 0) return landlordComparison;
    return compareRoomNumbers(a.roomNumber, b.roomNumber) || normalize(a.tenantName).localeCompare(normalize(b.tenantName));
}

function groupDefaultersByLandlord(items: DefaulterItem[], direction: LandlordSort): LandlordGroup[] {
    const groups = new Map<string, LandlordGroup>();
    for (const item of items) {
        const key = item.landlordId || `unknown:${landlordSortValue(item.landlordName)}:${normalize(item.officeName)}`;
        const group = groups.get(key) ?? {
            landlordId: key,
            landlordName: item.landlordName || "Unknown landlord",
            officeName: item.officeName || "Unknown office",
            items: [],
            totalOutstanding: 0,
            totalMonthlyRent: 0,
            totalArrears: 0,
            totalPayments: 0,
            highestOutstandingRoom: null,
            oldestDebt: null,
        };
        group.items.push(item);
        group.totalOutstanding += item.outstandingBalance;
        group.totalMonthlyRent += item.monthlyRent;
        group.totalArrears += item.arrears;
        group.totalPayments += item.currentMonthPaid;
        if (!group.highestOutstandingRoom || item.outstandingBalance > group.highestOutstandingRoom.outstandingBalance) group.highestOutstandingRoom = item;
        if (!group.oldestDebt || item.daysDefaulted > group.oldestDebt.daysDefaulted) group.oldestDebt = item;
        groups.set(key, group);
    }
    return [...groups.values()]
        .map((group) => ({ ...group, items: [...group.items].sort((a, b) => compareRoomNumbers(a.roomNumber, b.roomNumber) || normalize(a.tenantName).localeCompare(normalize(b.tenantName))) }))
        .sort((a, b) => compareLandlordNames(a.landlordName, b.landlordName, direction) || normalize(a.officeName).localeCompare(normalize(b.officeName)));
}

function phoneHref(value: string | null) {
    if (!value) return "#";
    return `tel:${value}`;
}

function smsHref(value: string | null) {
    if (!value) return "#";
    return `sms:${value}`;
}

function whatsappHref(value: string | null, tenant: string, room: string) {
    if (!value) return "#";
    const digits = value.replace(/\D/g, "");
    const normalized = digits.startsWith("0") ? `256${digits.slice(1)}` : digits;
    const text = encodeURIComponent(`Hello ${tenant}, your room ${room} rent balance is pending. Please clear your balance or contact the office.`);
    return `https://wa.me/${normalized}?text=${text}`;
}

export default function DefaultersConsole({ data }: Props) {
    const router = useRouter();
    const [query, setQuery] = useState("");
    const [officeId, setOfficeId] = useState(data.filters.officeId ?? "");
    const [selectedLandlordIds, setSelectedLandlordIds] = useState<string[]>(() => data.filters.landlordId ? [data.filters.landlordId] : []);
    const [propertyName, setPropertyName] = useState("");
    const [collector, setCollector] = useState("");
    const [listFilter, setListFilter] = useState<ListFilter>("active");
    const [minRent, setMinRent] = useState("");
    const [maxRent, setMaxRent] = useState("");
    const [period, setPeriod] = useState<PeriodFilter>("all");
    const [customDaysMin, setCustomDaysMin] = useState("");
    const [customDaysMax, setCustomDaysMax] = useState("");
    const [customMonthsMin, setCustomMonthsMin] = useState("");
    const [customMonthsMax, setCustomMonthsMax] = useState("");
    const [landlordSort, setLandlordSort] = useState<LandlordSort>("az");
    const [showPrintPreview, setShowPrintPreview] = useState(false);
    const [selectedLedgerItem, setSelectedLedgerItem] = useState<DefaulterItem | null>(null);
    const [liveStatus, setLiveStatus] = useState("Live");
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        setOfficeId(data.filters.officeId ?? "");
        setSelectedLandlordIds(data.filters.landlordId ? [data.filters.landlordId] : []);
    }, [data.filters.landlordId, data.filters.officeId]);

    useEffect(() => {
        let mounted = true;
        let refreshTimer: number | null = null;
        const supabase = createSupabaseBrowserClient();
        const refreshFromRealtime = () => {
            if (!mounted || refreshTimer) return;
            setLiveStatus("Updating");
            refreshTimer = window.setTimeout(() => {
                refreshTimer = null;
                startTransition(() => router.refresh());
                window.setTimeout(() => mounted && setLiveStatus("Live"), 1200);
            }, 250);
        };
        const channel = supabase
            .channel("ddumba-defaulters-live-balances")
            .on("postgres_changes", { event: "*", schema: "public", table: "tenants" }, refreshFromRealtime)
            .on("postgres_changes", { event: "*", schema: "public", table: "rooms" }, refreshFromRealtime)
            .on("postgres_changes", { event: "*", schema: "public", table: "leases" }, refreshFromRealtime)
            .on("postgres_changes", { event: "*", schema: "public", table: "collections" }, refreshFromRealtime)
            .on("postgres_changes", { event: "*", schema: "public", table: "tenant_balance_adjustments" }, refreshFromRealtime)
            .on("postgres_changes", { event: "*", schema: "public", table: "promises" }, refreshFromRealtime)
            .on("postgres_changes", { event: "*", schema: "public", table: "collection_actions" }, refreshFromRealtime)
            .on("postgres_changes", { event: "*", schema: "public", table: "vacated_tenant_debts" }, refreshFromRealtime)
            .on("postgres_changes", { event: "*", schema: "public", table: "landlord_debt_deductions" }, refreshFromRealtime)
            .subscribe((status) => {
                if (!mounted) return;
                setLiveStatus(status === "SUBSCRIBED" ? "Live" : "Connecting");
            });

        return () => {
            mounted = false;
            if (refreshTimer) window.clearTimeout(refreshTimer);
            void supabase.removeChannel(channel);
        };
    }, [router]);

    const landlordOptions = useMemo(() => {
        if (!officeId) return data.landlords;
        return data.landlords.filter((landlord) => landlord.officeIds.includes(officeId));
    }, [data.landlords, officeId]);

    useEffect(() => {
        setSelectedLandlordIds((current) => current.filter((landlordId) => landlordOptions.some((landlord) => landlord.id === landlordId)));
    }, [landlordOptions]);

    function pushCollectorFilters(nextOfficeId: string, nextLandlordIds: string[]) {
        if (!data.isCollector) return;
        const params = new URLSearchParams(window.location.search);
        if (nextOfficeId) params.set("officeId", nextOfficeId);
        else params.delete("officeId");
        if (nextLandlordIds.length === 1) params.set("landlordId", nextLandlordIds[0]);
        else params.delete("landlordId");
        const qs = params.toString();
        startTransition(() => router.push(`/office/collector/defaulters${qs ? `?${qs}` : ""}`));
    }

    function changeOffice(nextOfficeId: string) {
        const nextLandlordIds = selectedLandlordIds.filter((landlordId) => !nextOfficeId || data.landlords.find((landlord) => landlord.id === landlordId)?.officeIds.includes(nextOfficeId));
        setOfficeId(nextOfficeId);
        setSelectedLandlordIds(nextLandlordIds);
        pushCollectorFilters(nextOfficeId, nextLandlordIds);
    }

    function changeLandlords(nextLandlordIds: string[]) {
        setSelectedLandlordIds(nextLandlordIds);
        pushCollectorFilters(officeId, nextLandlordIds);
    }

    function resetFilters() {
        setQuery("");
        setOfficeId("");
        setSelectedLandlordIds([]);
        setPropertyName("");
        setCollector("");
        setListFilter("active");
        setMinRent("");
        setMaxRent("");
        setPeriod("all");
        setCustomDaysMin("");
        setCustomDaysMax("");
        setCustomMonthsMin("");
        setCustomMonthsMax("");
        setLandlordSort("az");
        if (data.isCollector) startTransition(() => router.push("/office/collector/defaulters"));
    }

    const filteredDefaulters = useMemo(() => {
        const term = normalize(query);
        const min = Number(minRent || 0);
        const max = Number(maxRent || 0);
        const dayMin = Number(customDaysMin || 0);
        const dayMax = Number(customDaysMax || 0);
        const monthMin = Number(customMonthsMin || 0);
        const monthMax = Number(customMonthsMax || 0);
        return data.defaulters
            .filter((item) => {
                if (listFilter === "active" && (item.source !== "active_tenant" || item.outstandingBalance <= 0)) return false;
                if (listFilter === "vacated" && item.source !== "vacated_debt") return false;
                if (listFilter === "high_risk" && item.riskLevel !== "high") return false;
                if (listFilter === "promises_due" && item.promiseStatus !== "Due today") return false;
                const searchable = [item.roomNumber, item.tenantName, item.tenantPhone, item.landlordName, item.officeName, item.propertyName, item.location, String(item.monthlyRent)].map(normalize).join(" ");
                if (term && !searchable.includes(term)) return false;
                if ((data.isAdmin || data.isCollector) && officeId && item.officeId !== officeId) return false;
                if (selectedLandlordIds.length && !selectedLandlordIds.includes(item.landlordId ?? "")) return false;
                if (propertyName && item.propertyName !== propertyName) return false;
                if (collector && item.collectorAssigned !== collector) return false;
                if (min > 0 && item.monthlyRent < min) return false;
                if (max > 0 && item.monthlyRent > max) return false;
                if (period === "today" && item.daysDefaulted > 1) return false;
                if (period === "1_7" && (item.daysDefaulted < 1 || item.daysDefaulted > 7)) return false;
                if (period === "8_14" && (item.daysDefaulted < 8 || item.daysDefaulted > 14)) return false;
                if (period === "15_30" && (item.daysDefaulted < 15 || item.daysDefaulted > 30)) return false;
                if (period === "1_month" && (item.daysDefaulted < 30 || item.daysDefaulted >= 60)) return false;
                if (period === "2_months" && (item.daysDefaulted < 60 || item.daysDefaulted >= 90)) return false;
                if (period === "3_plus" && item.daysDefaulted < 90) return false;
                if (period === "custom_days") {
                    if (dayMin > 0 && item.daysDefaulted < dayMin) return false;
                    if (dayMax > 0 && item.daysDefaulted > dayMax) return false;
                }
                if (period === "custom_months") {
                    if (monthMin > 0 && item.monthsDefaulted < monthMin) return false;
                    if (monthMax > 0 && item.monthsDefaulted > monthMax) return false;
                }
                return true;
            })
            .sort((a, b) => {
                return compareByLandlordThenRoom(a, b, landlordSort);
            });
    }, [collector, customDaysMax, customDaysMin, customMonthsMax, customMonthsMin, data.defaulters, data.isAdmin, data.isCollector, landlordSort, listFilter, maxRent, minRent, officeId, period, propertyName, query, selectedLandlordIds]);

    const visibleKpis = useMemo(() => buildKpis(filteredDefaulters), [filteredDefaulters]);
    const paymentHref = data.isAdmin ? "/office/admin/payments" : data.isCollector ? "/office/collector/payments" : "/office/payments";
    const promiseHref = data.isCollector ? "/office/collector/promises" : "/office/promises";
    const selectedOfficeName = officeId ? data.offices.find((office) => office.id === officeId)?.name ?? "Selected office" : data.isAdmin ? "All Offices" : data.isCollector ? "All Assigned Offices" : data.activeOffice?.office_name ?? data.activeOffice?.name ?? "Active office";
    const selectedLandlordNames = selectedLandlordIds
        .map((landlordId) => data.landlords.find((landlord) => landlord.id === landlordId)?.name)
        .filter(Boolean) as string[];
    const selectedLandlordName = selectedLandlordNames.length ? selectedLandlordNames.join(", ") : "All Landlords";
    const selectedPeriodName = period === "all" ? "All defaulters" : period.replaceAll("_", " ");

    function exportCsv() {
        const header = ["Type", "Room", "Tenant", "Phone", "Office", "Landlord", "Property", "Location", "Monthly Rent", "Outstanding", "Oldest Unpaid Period", "Unpaid Periods", "Due Date", "Days Overdue", "Last Payment Date", "Last Payment Amount", "Promise Status", "Collector", "Risk", "Last Follow-up", "Next Action", "Recovery Status", "Landlord Deduction"];
        const csv = [header, ...filteredDefaulters.map((item) => [
            item.source.replaceAll("_", " "),
            item.roomNumber,
            item.tenantName,
            item.tenantPhone ?? "",
            item.officeName,
            item.landlordName,
            item.propertyName,
            item.location,
            String(item.monthlyRent),
            String(item.outstandingBalance),
            item.oldestUnpaidPeriod,
            String(item.unpaidPeriods),
            item.paymentDueDate,
            String(item.daysDefaulted),
            item.lastPaymentDate ?? "",
            String(item.lastPaymentAmount),
            item.promiseStatus,
            item.collectorAssigned,
            item.riskLevel,
            item.lastFollowUp ?? "",
            item.nextRecommendedAction,
            item.recoveryStatus ?? "",
            item.landlordDeductionStatus ?? "",
        ])].map((row) => row.map((cell) => `"${String(cell).replaceAll("\"", "\"\"")}"`).join(",")).join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `defaulters-${data.currentDate}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    }

    return (
        <main className="enterprise-page">
            <div className="enterprise-shell">
                <section className="mx-auto max-w-7xl overflow-hidden rounded-[30px] border border-white/10 bg-slate-950 p-5 text-white shadow-2xl shadow-black/30">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                            <div className="inline-flex items-center gap-2 rounded-full border border-rose-300/20 bg-rose-400/10 px-3 py-1 text-xs font-black uppercase text-rose-100">
                                <AlertTriangle size={14} />
                                {data.isAdmin ? "Admin defaulters" : data.isCollector ? "Collector defaulters" : "Office defaulters"}
                            </div>
                            <h1 className="mt-3 text-3xl font-black sm:text-4xl">Defaulters</h1>
                            <p className="mt-1 text-sm font-semibold text-slate-300">
                                {data.company?.name ?? "Company"} · {data.isAdmin ? "All offices" : data.isCollector ? "Authorized offices" : data.activeOffice?.office_name ?? data.activeOffice?.name ?? "Active office"} · Live as of {data.currentDate}
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <span className="inline-flex h-11 items-center gap-2 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 px-4 text-sm font-black text-emerald-100">
                                {isPending ? <RefreshCw size={16} className="animate-spin" /> : <Wifi size={16} />}
                                {liveStatus}
                            </span>
                            <button onClick={() => startTransition(() => router.refresh())} className="inline-flex h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 text-sm font-black text-white">
                                <RefreshCw size={16} />
                                Refresh
                            </button>
                            <button onClick={() => setShowPrintPreview(true)} className="inline-flex h-11 items-center gap-2 rounded-2xl bg-white px-4 text-sm font-black text-slate-950">
                                <Printer size={16} />
                                Print A4 Report
                            </button>
                            <button onClick={() => setShowPrintPreview(true)} className="inline-flex h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 text-sm font-black text-white">
                                <Download size={16} />
                                Export PDF
                            </button>
                            <button onClick={exportCsv} className="inline-flex h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 text-sm font-black text-white">
                                <Download size={16} />
                                Export CSV
                            </button>
                        </div>
                    </div>
                </section>

                {data.integrityAlerts.length ? (
                    <section className="mx-auto mt-5 max-w-7xl rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">
                        {data.integrityAlerts.map((alert) => <p key={alert}>{alert}</p>)}
                    </section>
                ) : null}

                <section className="mx-auto mt-5 grid max-w-7xl gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <RiskCard label="Total Defaulters" value={data.kpis.totalDefaulters.toLocaleString()} hint="Live positive balances" tone="red" icon={<AlertTriangle size={18} />} onClick={() => setListFilter("active")} />
                    <RiskCard label="Total Outstanding" value={money(data.kpis.totalOutstanding)} hint="Sum of live balances" tone="red" icon={<WalletCards size={18} />} onClick={() => setListFilter("active")} />
                    <RiskCard label="Added Today" value={data.kpis.defaultersAddedToday.toLocaleString()} hint="New or due today" tone="amber" icon={<CalendarClock size={18} />} onClick={() => { setListFilter("active"); setPeriod("today"); }} />
                    <RiskCard label="High Risk" value={data.kpis.highRiskDefaulters.toLocaleString()} hint="Visit or notice" tone="purple" icon={<AlertTriangle size={18} />} onClick={() => setListFilter("high_risk")} />
                    <RiskCard label="Promises Due Today" value={data.kpis.promisesDueToday.toLocaleString()} hint="Collector follow-up" tone="amber" icon={<CalendarClock size={18} />} onClick={() => setListFilter("promises_due")} />
                    <RiskCard label="Vacated With Debt" value={data.kpis.vacatedWithDebt.toLocaleString()} hint="Recovery register" tone="red" icon={<FileText size={18} />} onClick={() => setListFilter("vacated")} />
                    <RiskCard label="Oldest Account" value={data.kpis.oldestOutstandingAccount} hint="Longest overdue" tone="slate" icon={<WalletCards size={18} />} onClick={() => setPeriod("3_plus")} />
                </section>

                <AssistantPanel assistant={data.assistant} />

                <section className="mx-auto mt-5 max-w-7xl rounded-[28px] border border-white/10 bg-slate-900 p-4 text-white shadow-xl shadow-black/20">
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.8fr)_repeat(8,minmax(130px,1fr))]">
                        <label className="block">
                            <span className="text-xs font-black uppercase tracking-wide text-slate-400">Search room, tenant, phone, landlord, office, property</span>
                            <div className="mt-1 flex h-12 items-center rounded-2xl border border-white/10 bg-slate-950 px-3">
                                <Search size={16} className="mr-2 text-slate-500" />
                                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="T149, Sarah, 0700..." className="w-full bg-transparent text-sm font-black text-white outline-none placeholder:text-slate-500" />
                            </div>
                        </label>
                        <FilterSelect label="List" value={listFilter} onChange={(value) => setListFilter(value as ListFilter)} options={[
                            { id: "active", name: "Active defaulters" },
                            { id: "vacated", name: "Vacated with debt" },
                            { id: "high_risk", name: "High risk" },
                            { id: "promises_due", name: "Promises due today" },
                        ]} />
                        <FilterSelect label="Defaulting period" value={period} onChange={(value) => setPeriod(value as PeriodFilter)} options={[
                            { id: "all", name: "All defaulters" },
                            { id: "today", name: "Defaulted today" },
                            { id: "1_7", name: "1-7 days" },
                            { id: "8_14", name: "8-14 days" },
                            { id: "15_30", name: "15-30 days" },
                            { id: "1_month", name: "1 month" },
                            { id: "2_months", name: "2 months" },
                            { id: "3_plus", name: "3+ months" },
                            { id: "custom_days", name: "Custom days" },
                            { id: "custom_months", name: "Custom months" },
                        ]} />
                        {data.isAdmin || data.isCollector ? <FilterSelect label="Office" value={officeId} onChange={data.isCollector ? changeOffice : setOfficeId} options={[{ id: "", name: data.isCollector ? "All Assigned Offices" : "All offices" }, ...data.offices]} /> : null}
                        <SearchableLandlordMultiSelect label="Landlords" selectedIds={selectedLandlordIds} onChange={changeLandlords} options={landlordOptions} />
                        <FilterSelect label="Landlord Sort" value={landlordSort} onChange={(value) => setLandlordSort(value as LandlordSort)} options={[
                            { id: "az", name: "A → Z" },
                            { id: "za", name: "Z → A" },
                        ]} />
                        <FilterSelect label="Property" value={propertyName} onChange={setPropertyName} options={[{ id: "", name: "All properties" }, ...data.properties.map((property) => ({ id: property.name, name: property.name }))]} />
                        <FilterSelect label="Collector" value={collector} onChange={setCollector} options={[{ id: "", name: "All collectors" }, ...data.collectors]} />
                        <FilterInput label="Min rent" value={minRent} onChange={setMinRent} />
                        <FilterInput label="Max rent" value={maxRent} onChange={setMaxRent} />
                    </div>
                    {period === "custom_days" ? (
                        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:max-w-md">
                            <FilterInput label="Min days defaulted" value={customDaysMin} onChange={setCustomDaysMin} />
                            <FilterInput label="Max days defaulted" value={customDaysMax} onChange={setCustomDaysMax} />
                        </div>
                    ) : null}
                    {period === "custom_months" ? (
                        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:max-w-md">
                            <FilterInput label="Min months defaulted" value={customMonthsMin} onChange={setCustomMonthsMin} />
                            <FilterInput label="Max months defaulted" value={customMonthsMax} onChange={setCustomMonthsMax} />
                        </div>
                    ) : null}
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs font-black text-slate-200">
                            <span className="rounded-full bg-white/10 px-3 py-1">Showing: {filteredDefaulters.length.toLocaleString()} Defaulters</span>
                            {data.isCollector ? <span className="rounded-full bg-white/10 px-3 py-1">Office: {data.offices.find((office) => office.id === officeId)?.name ?? "All Assigned Offices"}</span> : null}
                            {selectedLandlordIds.length ? <span className="rounded-full bg-white/10 px-3 py-1">Landlords: {selectedLandlordIds.length.toLocaleString()} selected</span> : <span className="rounded-full bg-white/10 px-3 py-1">Landlord: All Landlords</span>}
                        </div>
                        <button type="button" onClick={resetFilters} className="inline-flex h-10 items-center justify-center rounded-2xl border border-white/10 bg-white/10 px-4 text-xs font-black text-white hover:bg-white hover:text-slate-950">
                            Reset Filters
                        </button>
                    </div>
                </section>

                <section className="mx-auto mt-5 max-w-7xl">
                    <DefaultersTable
                        defaulters={filteredDefaulters}
                        landlordSort={landlordSort}
                        onFilterLandlord={(nextLandlordId) => changeLandlords([nextLandlordId])}
                        paymentHref={paymentHref}
                        promiseHref={promiseHref}
                        onViewLedger={setSelectedLedgerItem}
                    />
                    {!filteredDefaulters.length ? (
                        <div className="rounded-[26px] border border-dashed border-white/20 bg-white/8 p-8 text-center text-white">
                            <p className="text-lg font-black">No defaulters match these filters.</p>
                            <p className="mt-1 text-sm font-semibold text-slate-400">Try another period, office, landlord, or search term.</p>
                        </div>
                    ) : null}
                </section>
            </div>

            {showPrintPreview ? (
                <PrintPreview
                    companyName={data.company?.name ?? "Company"}
                    defaulters={filteredDefaulters}
                    generatedAt={data.generatedAt}
                    kpis={visibleKpis}
                    landlordSort={landlordSort}
                    onClose={() => setShowPrintPreview(false)}
                    onExportCsv={exportCsv}
                    selectedFilters={{
                        collector: collector ? data.collectors.find((item) => item.id === collector)?.name ?? collector : "All collectors",
                        landlord: selectedLandlordName,
                        list: listFilter.replaceAll("_", " "),
                        office: selectedOfficeName,
                        period: selectedPeriodName,
                        property: propertyName || "All properties",
                        search: query || "None",
                    }}
                    showOfficeSummary={data.isAdmin && !officeId}
                    scope={selectedOfficeName}
                />
            ) : null}
            {selectedLedgerItem ? <LedgerBreakdownModal item={selectedLedgerItem} onClose={() => setSelectedLedgerItem(null)} /> : null}
        </main>
    );
}

function buildKpis(items: DefaulterItem[]) {
    const activeItems = items.filter((item) => item.source === "active_tenant" && item.outstandingBalance > 0);
    const officeRisk = new Map<string, { count: number; outstanding: number }>();
    for (const item of activeItems) {
        const current = officeRisk.get(item.officeName) ?? { count: 0, outstanding: 0 };
        current.count += 1;
        current.outstanding += item.outstandingBalance;
        officeRisk.set(item.officeName, current);
    }
    const oldestOutstandingAccount = [...activeItems].sort((a, b) => b.daysDefaulted - a.daysDefaulted || b.outstandingBalance - a.outstandingBalance)[0];
    return {
        totalDefaulters: activeItems.length,
        totalOutstanding: activeItems.reduce((total, item) => total + item.outstandingBalance, 0),
        defaultersAddedToday: activeItems.filter((item) => item.daysDefaulted <= 1).length,
        clearedToday: 0,
        highRiskDefaulters: activeItems.filter((item) => item.riskLevel === "high").length,
        promisesDueToday: activeItems.filter((item) => item.promiseStatus === "Due today").length,
        vacatedWithDebt: items.filter((item) => item.source === "vacated_debt" && item.outstandingBalance > 0).length,
        oldestOutstandingAccount: oldestOutstandingAccount ? `${oldestOutstandingAccount.tenantName} (${oldestOutstandingAccount.daysDefaulted} days)` : "No defaulters",
        defaultedOneToSevenDays: activeItems.filter((item) => item.daysDefaulted >= 1 && item.daysDefaulted <= 7).length,
        defaultedEightToThirtyDays: activeItems.filter((item) => item.daysDefaulted >= 8 && item.daysDefaulted <= 30).length,
        defaultedOneMonthPlus: activeItems.filter((item) => item.daysDefaulted >= 30).length,
        highestRiskOffice: [...officeRisk.entries()].sort((a, b) => b[1].outstanding - a[1].outstanding || b[1].count - a[1].count)[0]?.[0] ?? "No defaulters",
        highestOutstandingTenant: [...activeItems].sort((a, b) => b.outstandingBalance - a.outstandingBalance)[0]?.tenantName ?? "No defaulters",
    };
}

function DefaultersTable({ defaulters, landlordSort, onFilterLandlord, onViewLedger, paymentHref, promiseHref }: { defaulters: DefaulterItem[]; landlordSort: LandlordSort; onFilterLandlord: (landlordId: string) => void; onViewLedger: (item: DefaulterItem) => void; paymentHref: string; promiseHref: string }) {
    const landlordGroups = useMemo(() => groupDefaultersByLandlord(defaulters, landlordSort), [defaulters, landlordSort]);
    return (
        <div className="overflow-hidden rounded-[26px] border border-white/70 bg-white shadow-2xl shadow-slate-950/15">
            <div className="max-h-[680px] overflow-auto">
                <table className="w-full min-w-[1780px] text-left text-sm">
                    <thead className="sticky top-0 bg-slate-950 text-xs uppercase text-slate-200">
                        <tr>
                            <th className="px-4 py-3">Room / Tenant</th>
                            <th className="px-4 py-3">Office</th>
                            <th className="px-4 py-3">Landlord</th>
                            <th className="px-4 py-3">Location</th>
                            <th className="px-4 py-3 text-right">Monthly Rent</th>
                            <th className="px-4 py-3 text-right">Outstanding</th>
                            <th className="px-4 py-3">Oldest Period</th>
                            <th className="px-4 py-3">Unpaid</th>
                            <th className="px-4 py-3">Last Payment</th>
                            <th className="px-4 py-3">Promise</th>
                            <th className="px-4 py-3">Collector</th>
                            <th className="px-4 py-3">Risk</th>
                            <th className="px-4 py-3">Follow-up</th>
                            <th className="px-4 py-3">Next Action</th>
                            <th className="px-4 py-3">Recovery</th>
                            <th className="px-4 py-3">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {landlordGroups.map((group) => (
                            <Fragment key={`landlord-group:${group.landlordId}`}>
                                <tr className="sticky top-[41px] z-10 border-y border-slate-200 bg-slate-100/95">
                                    <td colSpan={16} className="px-4 py-3">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div>
                                                {group.landlordId.startsWith("unknown:") ? (
                                                    <p className="text-sm font-black uppercase tracking-wide text-slate-900">LANDLORD: {group.landlordName}</p>
                                                ) : (
                                                    <button type="button" onClick={() => onFilterLandlord(group.landlordId)} className="text-left text-sm font-black uppercase tracking-wide text-slate-900 underline decoration-slate-300 underline-offset-4 hover:text-rose-700">
                                                        LANDLORD: {group.landlordName}
                                                    </button>
                                                )}
                                                <p className="mt-1 text-xs font-bold text-slate-500">{group.officeName} · {group.items.length.toLocaleString()} defaulting room(s)</p>
                                            </div>
                                            <div className="flex flex-wrap gap-2 text-xs font-black">
                                                <span className="rounded-full bg-white px-3 py-1 text-slate-700 ring-1 ring-slate-200">Total {money(group.totalOutstanding)}</span>
                                                <span className="rounded-full bg-white px-3 py-1 text-slate-700 ring-1 ring-slate-200">Highest {group.highestOutstandingRoom?.roomNumber ?? "N/A"} · {money(group.highestOutstandingRoom?.outstandingBalance ?? 0)}</span>
                                                <span className="rounded-full bg-white px-3 py-1 text-slate-700 ring-1 ring-slate-200">Oldest {group.oldestDebt?.daysDefaulted ?? 0} days</span>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                                {group.items.map((item) => (
                                    <tr key={`${item.id}:ledger:${item.paymentDueDate}`} className="border-b border-slate-100">
                                        <td className="px-4 py-3">
                                            <p className="font-black text-slate-950">Room {item.roomNumber}</p>
                                            <p className="text-sm font-bold text-slate-600">{item.tenantName}</p>
                                            <p className="text-xs font-bold text-slate-400">{item.tenantPhone ?? "No phone"}</p>
                                        </td>
                                        <td className="px-4 py-3 font-bold text-slate-600">{item.officeName}</td>
                                        <td className="px-4 py-3 font-bold text-slate-600">
                                            {item.landlordId ? (
                                                <button type="button" onClick={() => onFilterLandlord(item.landlordId ?? "")} className="text-left font-black text-slate-700 underline decoration-slate-200 underline-offset-4 hover:text-rose-700">
                                                    {item.landlordName}
                                                </button>
                                            ) : item.landlordName}
                                        </td>
                                        <td className="px-4 py-3 font-bold text-slate-600">{item.propertyName}<br /><span className="text-xs text-slate-400">{item.location}</span></td>
                                        <td className="px-4 py-3 text-right font-black text-slate-950">{money(item.monthlyRent)}</td>
                                        <td className="px-4 py-3 text-right">
                                            <button type="button" onClick={() => onViewLedger(item)} className="text-right font-black text-rose-700 underline decoration-rose-200 underline-offset-4 hover:text-rose-900">
                                                {money(item.outstandingBalance)}
                                            </button>
                                            <p className="mt-1 text-[10px] font-black uppercase text-slate-400">View formula</p>
                                        </td>
                                        <td className="px-4 py-3 font-bold text-slate-600">
                                            {item.oldestUnpaidPeriod}
                                            <br />
                                            <span className="text-xs text-slate-400">{item.paymentDueDate} due</span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-black uppercase text-rose-700 ring-1 ring-rose-100">{item.daysDefaulted} days</span>
                                            <p className="mt-1 text-xs font-bold text-slate-400">{item.unpaidPeriods} period(s)</p>
                                        </td>
                                        <td className="px-4 py-3 font-bold text-slate-600">
                                            {item.lastPaymentDate ?? "No payment"}
                                            <br />
                                            <span className="text-xs text-slate-400">{money(item.lastPaymentAmount)}</span>
                                            {item.isPartialPayer ? <span className="mt-1 inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black uppercase text-blue-700">Partial paid {money(item.currentMonthPaid)}</span> : null}
                                        </td>
                                        <td className="px-4 py-3 font-bold text-slate-600">
                                            {item.promiseStatus}
                                            {item.openPromiseCount ? <p className="text-xs text-slate-400">{item.openPromiseCount} open</p> : null}
                                        </td>
                                        <td className="px-4 py-3 font-bold text-slate-600">{item.collectorAssigned}</td>
                                        <td className="px-4 py-3">
                                            <span className={`rounded-full px-3 py-1 text-xs font-black uppercase ${item.riskLevel === "high" ? "bg-rose-50 text-rose-700 ring-1 ring-rose-100" : item.riskLevel === "medium" ? "bg-amber-50 text-amber-700 ring-1 ring-amber-100" : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"}`}>{item.riskLevel}</span>
                                        </td>
                                        <td className="px-4 py-3 font-bold text-slate-600">{item.lastFollowUp ?? "No follow-up"}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex max-w-[220px] flex-wrap gap-1">
                                                {[item.nextRecommendedAction, ...item.suggestedActions.filter((action) => action !== item.nextRecommendedAction)].slice(0, 4).map((action) => (
                                                    <span key={`${item.id}:action:${action.toLowerCase().replaceAll(" ", "-")}:${item.paymentDueDate}`} className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-700">{action}</span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 font-bold text-slate-600">
                                            {item.source === "vacated_debt" ? (
                                                <>
                                                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-700">Vacated</span>
                                                    <p className="mt-1 text-xs text-slate-500">{item.recoveryStatus ?? "Pending"} · {item.landlordDeductionStatus ?? "No deduction"}</p>
                                                </>
                                            ) : item.clearedDate ? `Cleared ${item.clearedDate}` : "Active room"}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex flex-wrap gap-1.5">
                                                <a href={phoneHref(item.tenantPhone)} className="rounded-xl bg-slate-100 px-2.5 py-2 text-xs font-black text-slate-700"><Phone size={13} className="inline" /> Call</a>
                                                <a href={whatsappHref(item.tenantPhone, item.tenantName, item.roomNumber)} target="_blank" rel="noreferrer" className="rounded-xl bg-emerald-50 px-2.5 py-2 text-xs font-black text-emerald-700"><MessageCircle size={13} className="inline" /> WhatsApp</a>
                                                <a href={smsHref(item.tenantPhone)} className="rounded-xl bg-blue-50 px-2.5 py-2 text-xs font-black text-blue-700"><Send size={13} className="inline" /> SMS</a>
                                                <Link href={paymentHref} className="rounded-xl bg-slate-950 px-2.5 py-2 text-xs font-black text-white">Record Payment</Link>
                                                <Link href={promiseHref} className="rounded-xl bg-amber-50 px-2.5 py-2 text-xs font-black text-amber-700">Promise{item.openPromiseCount ? ` (${item.openPromiseCount})` : ""}</Link>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </Fragment>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function AssistantPanel({ assistant }: { assistant: DefaultersPageData["assistant"] }) {
    const focusList = assistant.callToday.slice(0, 5);
    return (
        <section className="mx-auto mt-5 max-w-7xl overflow-hidden rounded-[28px] border border-cyan-300/20 bg-slate-950 p-5 text-white shadow-2xl shadow-black/25">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="max-w-2xl">
                    <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs font-black uppercase text-cyan-100">
                        <Bot size={14} />
                        AI Defaulter Assistant
                    </div>
                    <h2 className="mt-3 text-2xl font-black">Live follow-up intelligence</h2>
                    <p className="mt-1 text-sm font-semibold text-slate-300">
                        Built from live rooms, tenants, balances, payments, promises, offices, and landlords.
                    </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-3 xl:min-w-[520px]">
                    <AssistantMini label="Call today" value={assistant.callToday.length.toLocaleString()} />
                    <AssistantMini label="Failed promises" value={assistant.failedPromiseTenants.length.toLocaleString()} />
                    <AssistantMini label="Partial payers" value={assistant.partialPayers.length.toLocaleString()} />
                </div>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="grid gap-3 md:grid-cols-2">
                    {assistant.insights.length ? assistant.insights.map((insight) => (
                        <div key={`assistant-insight:${insight.id}:${insight.severity}`} className={`rounded-2xl border p-4 ${insight.severity === "critical" ? "border-rose-300/25 bg-rose-400/10" : insight.severity === "warning" ? "border-amber-300/25 bg-amber-400/10" : "border-cyan-300/25 bg-cyan-400/10"}`}>
                            <div className="flex items-center gap-2">
                                <Sparkles size={15} className={insight.severity === "critical" ? "text-rose-200" : insight.severity === "warning" ? "text-amber-200" : "text-cyan-200"} />
                                <p className="text-sm font-black">{insight.title}</p>
                            </div>
                            <p className="mt-2 text-sm font-semibold text-slate-300">{insight.message}</p>
                        </div>
                    )) : (
                        <div className="rounded-2xl border border-emerald-300/25 bg-emerald-400/10 p-4">
                            <p className="text-sm font-black text-emerald-100">No defaulter alerts</p>
                            <p className="mt-2 text-sm font-semibold text-slate-300">No live defaulter risk is currently visible for this scope.</p>
                        </div>
                    )}
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
                    <p className="text-xs font-black uppercase tracking-wide text-cyan-100">Who should be called today</p>
                    <div className="mt-3 space-y-2">
                        {focusList.length ? focusList.map((item) => (
                            <div key={`${item.id}:call-today:${item.paymentDueDate}`} className="rounded-2xl bg-slate-900 px-3 py-2">
                                <div className="flex items-center justify-between gap-3">
                                    <p className="font-black">{item.tenantName}</p>
                                    <span className="rounded-full bg-rose-400/15 px-2 py-1 text-[10px] font-black uppercase text-rose-100">{item.daysDefaulted} days</span>
                                </div>
                                <p className="mt-1 text-xs font-bold text-slate-400">Room {item.roomNumber} · {money(item.outstandingBalance)} · {item.suggestedActions.slice(0, 3).join(", ")}</p>
                            </div>
                        )) : (
                            <p className="rounded-2xl bg-slate-900 p-3 text-sm font-bold text-slate-400">No calls recommended for this filter.</p>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
}

function AssistantMini({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-white/8 p-3">
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p>
            <p className="mt-1 text-xl font-black text-white">{value}</p>
        </div>
    );
}

function FilterInput({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
    return (
        <label>
            <span className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</span>
            <input type="number" min="0" value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-12 w-full rounded-2xl border border-white/10 bg-slate-950 px-3 text-sm font-black text-white outline-none" />
        </label>
    );
}

function FilterSelect({ label, onChange, options, value }: { label: string; onChange: (value: string) => void; options: Array<{ id: string; name: string }>; value: string }) {
    return (
        <label>
            <span className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</span>
            <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-12 w-full rounded-2xl border border-white/10 bg-slate-950 px-3 text-sm font-black text-white outline-none">
                {options.map((option) => <option key={`filter-option:${label}:${option.id || option.name}`} value={option.id}>{option.name}</option>)}
            </select>
        </label>
    );
}

function SearchableLandlordMultiSelect({ label, onChange, options, selectedIds }: { label: string; onChange: (value: string[]) => void; options: Array<{ id: string; name: string }>; selectedIds: string[] }) {
    const [search, setSearch] = useState("");
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const visibleOptions = useMemo(() => {
        const term = normalize(search);
        if (!term) return options;
        return options.filter((option) => normalize(option.name).includes(term));
    }, [options, search]);
    const selectedNames = selectedIds
        .map((id) => options.find((option) => option.id === id)?.name)
        .filter(Boolean) as string[];
    const summary = selectedNames.length === 0
        ? "All Landlords"
        : selectedNames.length === 1
            ? selectedNames[0]
            : `${selectedNames[0]} +${selectedNames.length - 1}`;

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", handleClickOutside);
        window.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, []);

    function toggle(id: string) {
        if (selectedIds.includes(id)) onChange(selectedIds.filter((current) => current !== id));
        else onChange([...selectedIds, id]);
    }

    return (
        <div ref={rootRef} className="relative">
            <span className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</span>
            <button
                type="button"
                onClick={() => setOpen((current) => !current)}
                className="mt-1 flex h-12 w-full items-center justify-between gap-2 rounded-2xl border border-white/10 bg-slate-950 px-3 text-left text-sm font-black text-white outline-none hover:border-cyan-300/30"
            >
                <span className="min-w-0 truncate">{selectedIds.length ? `Landlords: ${selectedIds.length} selected` : summary}</span>
                <span className="shrink-0 rounded-full bg-white/10 px-2 py-1 text-[10px] uppercase text-slate-300">{selectedIds.length ? "Multi" : "All"}</span>
            </button>
            {open ? (
                <div className="absolute left-0 top-[76px] z-[70] w-[min(92vw,360px)] overflow-hidden rounded-2xl border border-white/10 bg-slate-950 shadow-2xl shadow-black/40">
                    <div className="border-b border-white/10 p-3">
                        <input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Search landlords"
                            className="h-10 w-full rounded-xl border border-white/10 bg-slate-900 px-3 text-xs font-bold text-white outline-none placeholder:text-slate-500"
                        />
                        <div className="mt-2 flex gap-2">
                            <button type="button" onClick={() => onChange([])} className="rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-950">All Landlords</button>
                            <button type="button" onClick={() => onChange(options.map((option) => option.id))} className="rounded-xl bg-white/10 px-3 py-2 text-xs font-black text-white">Select All</button>
                            <button type="button" onClick={() => onChange([])} className="rounded-xl bg-white/10 px-3 py-2 text-xs font-black text-white">Clear All</button>
                        </div>
                    </div>
                    <div className="max-h-72 overflow-auto p-2">
                        {visibleOptions.length ? visibleOptions.map((option) => {
                            const checked = selectedIds.includes(option.id);
                            return (
                                <label key={`landlord-multi:${option.id}`} className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm font-bold text-white hover:bg-white/10">
                                    <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggle(option.id)}
                                        className="h-4 w-4 rounded border-white/20 bg-slate-900 accent-cyan-300"
                                    />
                                    <span className="min-w-0 flex-1 truncate">{option.name}</span>
                                    {checked ? <span className="rounded-full bg-cyan-300/15 px-2 py-0.5 text-[10px] font-black uppercase text-cyan-100">Selected</span> : null}
                                </label>
                            );
                        }) : (
                            <p className="px-3 py-3 text-xs font-bold text-slate-400">No landlords found.</p>
                        )}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

function RiskCard({ hint, icon, label, onClick, tone, value }: { hint: string; icon: React.ReactNode; label: string; onClick?: () => void; tone: "red" | "amber" | "purple" | "slate"; value: string }) {
    const toneClass = {
        red: "border-rose-200 bg-rose-50 text-rose-800",
        amber: "border-amber-200 bg-amber-50 text-amber-800",
        purple: "border-purple-200 bg-purple-50 text-purple-800",
        slate: "border-slate-200 bg-white text-slate-800",
    }[tone];
    return (
        <button type="button" onClick={onClick} className={`min-h-[132px] rounded-[24px] border p-4 text-left shadow-xl shadow-slate-950/10 transition hover:-translate-y-0.5 hover:shadow-2xl ${toneClass}`}>
            <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-black uppercase tracking-wide opacity-75">{label}</p>
                {icon}
            </div>
            <p className="mt-3 break-words text-xl font-black leading-tight">{value}</p>
            <p className="mt-1 text-xs font-bold opacity-70">{hint}</p>
        </button>
    );
}

function LedgerBreakdownModal({ item, onClose }: { item: DefaulterItem; onClose: () => void }) {
    return (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" onClick={onClose}>
            <div className="w-full max-w-2xl rounded-[28px] bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
                <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-4">
                    <div>
                        <p className="text-xs font-black uppercase tracking-wide text-rose-700">Canonical Tenant Ledger</p>
                        <h2 className="mt-1 text-2xl font-black text-slate-950">Room {item.roomNumber} · {item.tenantName}</h2>
                        <p className="mt-1 text-sm font-bold text-slate-500">{item.officeName} · {item.paymentDueDate}</p>
                    </div>
                    <button type="button" onClick={onClose} className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-700">Close</button>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <LedgerMetric label="Arrears" value={item.arrears} tone="amber" />
                    <LedgerMetric label="Current Month Rent" value={item.monthlyRent} tone="blue" />
                    <LedgerMetric label="Manual Adjustments" value={item.manualBalanceAdjustment} tone={item.manualBalanceAdjustment < 0 ? "green" : item.manualBalanceAdjustment > 0 ? "rose" : "slate"} signed />
                    <LedgerMetric label="Payments This Month" value={item.currentMonthPaid} tone="green" />
                    <LedgerMetric label="Raw Balance" value={item.rawBalance} tone={item.rawBalance > 0 ? "rose" : item.rawBalance < 0 ? "green" : "slate"} signed />
                    <LedgerMetric label="Advance" value={item.advanceBalance} tone="purple" />
                </div>
                <div className="mt-4 rounded-2xl bg-slate-950 p-4 text-white">
                    <p className="text-xs font-black uppercase tracking-wide text-slate-400">Formula</p>
                    <p className="mt-2 text-sm font-bold leading-7">
                        Raw = {money(item.arrears)} + {money(item.monthlyRent)} {item.manualBalanceAdjustment < 0 ? "-" : "+"} {money(Math.abs(item.manualBalanceAdjustment))} - {money(item.currentMonthPaid)}
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl bg-white/10 p-3">
                            <p className="text-xs font-black uppercase text-rose-200">Outstanding</p>
                            <p className="mt-1 text-2xl font-black">{money(item.outstandingBalance)}</p>
                        </div>
                        <div className="rounded-2xl bg-white/10 p-3">
                            <p className="text-xs font-black uppercase text-purple-200">Advance</p>
                            <p className="mt-1 text-2xl font-black">{money(item.advanceBalance)}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function LedgerMetric({ label, signed = false, tone, value }: { label: string; signed?: boolean; tone: "amber" | "blue" | "green" | "purple" | "rose" | "slate"; value: number }) {
    const classes = {
        amber: "bg-amber-50 text-amber-800 ring-amber-200",
        blue: "bg-blue-50 text-blue-800 ring-blue-200",
        green: "bg-emerald-50 text-emerald-800 ring-emerald-200",
        purple: "bg-purple-50 text-purple-800 ring-purple-200",
        rose: "bg-rose-50 text-rose-800 ring-rose-200",
        slate: "bg-slate-100 text-slate-800 ring-slate-200",
    }[tone];
    const prefix = signed && value > 0 ? "+" : "";
    return (
        <div className={`rounded-2xl p-4 ring-1 ${classes}`}>
            <p className="text-xs font-black uppercase tracking-wide">{label}</p>
            <p className="mt-2 text-xl font-black">{prefix}{money(value)}</p>
        </div>
    );
}

function PrintPreview({
    companyName,
    defaulters,
    generatedAt,
    kpis,
    landlordSort,
    onClose,
    onExportCsv,
    scope,
    selectedFilters,
    showOfficeSummary,
}: {
    companyName: string;
    defaulters: DefaulterItem[];
    generatedAt: string;
    kpis: ReturnType<typeof buildKpis>;
    landlordSort: LandlordSort;
    onClose: () => void;
    onExportCsv: () => void;
    scope: string;
    selectedFilters: {
        collector: string;
        landlord: string;
        list: string;
        office: string;
        period: string;
        property: string;
        search: string;
    };
    showOfficeSummary: boolean;
}) {
    const reportScrollRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        reportScrollRef.current?.scrollTo({ top: 0 });
        window.addEventListener("keydown", handleKeyDown);
        return () => {
            document.body.style.overflow = originalOverflow;
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [onClose]);

    const landlordGroups = useMemo(() => groupDefaultersByLandlord(defaulters, landlordSort), [defaulters, landlordSort]);
    const officeSummary = useMemo(() => {
        const offices = new Map<string, { landlordIds: Set<string>; officeName: string; rooms: number; outstanding: number }>();
        for (const item of defaulters) {
            const key = item.officeId || item.officeName;
            const current = offices.get(key) ?? { landlordIds: new Set<string>(), officeName: item.officeName, rooms: 0, outstanding: 0 };
            current.landlordIds.add(item.landlordId || item.landlordName);
            current.rooms += 1;
            current.outstanding += item.outstandingBalance;
            offices.set(key, current);
        }
        return [...offices.values()].sort((a, b) => normalize(a.officeName).localeCompare(normalize(b.officeName)));
    }, [defaulters]);

    const totalOutstanding = landlordGroups.reduce((total, group) => total + group.totalOutstanding, 0);
    const printReport = () => {
        requestAnimationFrame(() => window.print());
    };

    return (
        <div className="modal-backdrop fixed inset-0 z-[150] flex items-start justify-center overflow-hidden bg-slate-950/80 p-2 pt-3 backdrop-blur-sm sm:p-4" onClick={onClose}>
            <div className="flex h-[94vh] w-full max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl sm:max-w-7xl" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="defaulters-report-title">
                <div className="report-toolbar non-print-ui sticky top-0 z-[100] flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-3 py-3 shadow-sm backdrop-blur print:hidden sm:px-5">
                    <div>
                        <p className="text-xs font-black uppercase text-rose-700">Print preview</p>
                        <h2 id="defaulters-report-title" className="text-xl font-black text-slate-950">Defaulters Report</h2>
                    </div>
                    <div className="flex shrink-0 gap-1.5 sm:gap-2">
                        <button onClick={printReport} className="rounded-2xl bg-slate-950 px-5 py-2 text-sm font-black uppercase text-white shadow-lg shadow-slate-950/20">Print</button>
                        <button onClick={printReport} className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-black uppercase text-slate-700">PDF</button>
                        <button onClick={onExportCsv} className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-700">CSV</button>
                        <button onClick={onClose} className="rounded-2xl bg-rose-50 px-3 py-2 text-sm font-black uppercase text-rose-700 sm:px-4">Close ✕</button>
                    </div>
                </div>
                <div ref={reportScrollRef} className="report-scroll-area min-h-0 flex-1 overflow-y-auto bg-slate-200 p-3 sm:p-6">
                    <div className="report-document defaulters-report-print mx-auto bg-white p-[10mm] text-slate-950 shadow-2xl ring-1 ring-slate-300 print:shadow-none print:ring-0" style={{ width: "min(210mm, calc(100vw - 2rem))", minHeight: "297mm" }}>
                        <header className="border-b-2 border-slate-950 pb-4">
                            <p className="text-sm font-black uppercase tracking-wide text-slate-500">{companyName}</p>
                            <h1 className="mt-1 text-3xl font-black uppercase">Defaulters Report</h1>
                            <div className="mt-3 grid gap-2 text-sm font-semibold sm:grid-cols-2 lg:grid-cols-3">
                                <p>Report Date: {new Date(generatedAt).toLocaleDateString()}</p>
                                <p>Selected Office: {scope}</p>
                                <p>Selected Period: {selectedFilters.period}</p>
                                <p>Generated: {new Date(generatedAt).toLocaleString()}</p>
                                <p>Generated By: Ddumba OS</p>
                                <p>Landlord Sort: {landlordSort === "az" ? "A → Z" : "Z → A"}</p>
                            </div>
                            <p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                                Applied Filters: Office: {selectedFilters.office} · Landlord: {selectedFilters.landlord} · Collector: {selectedFilters.collector} · Property: {selectedFilters.property} · List: {selectedFilters.list} · Search: {selectedFilters.search}
                            </p>
                        </header>
                        <section className="mt-5 grid gap-3 sm:grid-cols-3">
                            <ReportBox label="Total Landlords" value={landlordGroups.length.toLocaleString()} />
                            <ReportBox label="Total Defaulting Rooms" value={defaulters.length.toLocaleString()} />
                            <ReportBox label="Total Outstanding" value={money(totalOutstanding)} />
                        </section>
                        <div className="mt-6 space-y-6">
                            {landlordGroups.map((group) => (
                                <section key={`print-landlord:${group.landlordId}`} className="landlord-report-section rounded-2xl border border-slate-300">
                                    <div className="bg-slate-950 px-4 py-3 text-white">
                                        <p className="text-xs font-black uppercase tracking-wide">Landlord</p>
                                        <h2 className="text-xl font-black uppercase">{group.landlordName}</h2>
                                    </div>
                                    <div className="grid gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold sm:grid-cols-3">
                                        <p><span className="text-slate-500">Office:</span><br />{group.officeName}</p>
                                        <p><span className="text-slate-500">Defaulting Rooms:</span><br />{group.items.length.toLocaleString()}</p>
                                        <p><span className="text-slate-500">Total Outstanding:</span><br />{money(group.totalOutstanding)}</p>
                                    </div>
                                    <table className="w-full border-collapse text-xs">
                                        <thead>
                                            <tr className="bg-slate-100 text-left text-slate-700">
                                                <th className="w-[12%] border border-slate-300 px-3 py-2">Room</th>
                                                <th className="w-[28%] border border-slate-300 px-3 py-2">Tenant</th>
                                                <th className="w-[16%] border border-slate-300 px-3 py-2">Phone</th>
                                                <th className="w-[15%] border border-slate-300 px-3 py-2 text-right">Monthly Rent</th>
                                                <th className="w-[15%] border border-slate-300 px-3 py-2">Last Payment</th>
                                                <th className="w-[14%] border border-slate-300 px-3 py-2 text-right">Outstanding</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {group.items.map((item) => (
                                                <tr key={`${item.id}:print:${item.paymentDueDate}`}>
                                                    <td className="border border-slate-300 px-3 py-2 font-bold">{item.roomNumber}</td>
                                                    <td className="border border-slate-300 px-3 py-2">{item.tenantName}</td>
                                                    <td className="border border-slate-300 px-3 py-2">{item.tenantPhone ?? ""}</td>
                                                    <td className="border border-slate-300 px-3 py-2 text-right font-bold">{money(item.monthlyRent)}</td>
                                                    <td className="border border-slate-300 px-3 py-2">
                                                        {item.lastPaymentDate ? (
                                                            <>
                                                                <span className="font-bold">{money(item.lastPaymentAmount)}</span>
                                                                <br />
                                                                <span className="text-slate-500">{item.lastPaymentDate}</span>
                                                            </>
                                                        ) : "No payment"}
                                                    </td>
                                                    <td className="border border-slate-300 px-3 py-2 text-right font-black">{money(item.outstandingBalance)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr className="bg-slate-50 font-black">
                                                <td className="border border-slate-300 px-3 py-2" colSpan={5}>TOTAL OUTSTANDING</td>
                                                <td className="border border-slate-300 px-3 py-2 text-right">{money(group.totalOutstanding)}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </section>
                            ))}
                        </div>
                        <section className="mt-8 rounded-2xl border-2 border-slate-950 p-4">
                            <h2 className="text-lg font-black uppercase">Report Summary</h2>
                            <div className="mt-3 grid gap-3 text-sm font-bold sm:grid-cols-2 lg:grid-cols-3">
                                <p>Total Landlords<br /><span className="text-xl font-black">{landlordGroups.length.toLocaleString()}</span></p>
                                <p>Total Defaulting Rooms<br /><span className="text-xl font-black">{defaulters.length.toLocaleString()}</span></p>
                                <p>Total Outstanding<br /><span className="text-xl font-black">{money(totalOutstanding)}</span></p>
                            </div>
                            {showOfficeSummary ? (
                                <div className="mt-5">
                                    <h3 className="text-sm font-black uppercase text-slate-600">Office Summary</h3>
                                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                        {officeSummary.map((office) => (
                                            <div key={`office-summary:${office.officeName}`} className="rounded-xl border border-slate-200 p-3 text-sm font-bold">
                                                <p className="font-black uppercase">{office.officeName}</p>
                                                <p>Landlords with defaults: {office.landlordIds.size.toLocaleString()}</p>
                                                <p>Rooms: {office.rooms.toLocaleString()}</p>
                                                <p>Outstanding: {money(office.outstanding)}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                        </section>
                        <footer className="mt-10 grid gap-8 text-sm font-semibold sm:grid-cols-2">
                            <p>Prepared by: __________________________</p>
                            <p>Approved by: __________________________</p>
                        </footer>
                        <div className="report-actions non-print-ui mt-8 flex flex-wrap justify-end gap-3 print:hidden">
                            <button onClick={printReport} className="inline-flex items-center gap-2 rounded-2xl bg-rose-700 px-5 py-3 text-sm font-black uppercase text-white shadow-lg shadow-rose-900/20">
                                <Printer size={16} />
                                Print A4
                            </button>
                            <button onClick={onClose} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black uppercase text-white">Close Report</button>
                        </div>
                    </div>
                </div>
                <style jsx global>{`
                    @media print {
                        @page {
                            size: A4;
                            margin: 10mm;
                        }
                        html,
                        body {
                            background: #ffffff !important;
                            margin: 0 !important;
                        }
                        body * {
                            visibility: hidden;
                        }
                        .report-document,
                        .report-document * {
                            visibility: visible;
                        }
                        .app-navigation,
                        .report-toolbar,
                        .report-toolbar *,
                        .report-actions,
                        .report-actions *,
                        .non-print-ui,
                        .non-print-ui * {
                            display: none !important;
                            visibility: hidden !important;
                        }
                        .report-scroll-area {
                            display: block !important;
                            overflow: visible !important;
                            height: auto !important;
                            max-height: none !important;
                            background: #ffffff !important;
                            padding: 0 !important;
                        }
                        .modal-backdrop {
                            position: static !important;
                            display: block !important;
                            background: #ffffff !important;
                            padding: 0 !important;
                            overflow: visible !important;
                            height: auto !important;
                            max-height: none !important;
                        }
                        .report-document {
                            box-shadow: none !important;
                            background: #ffffff !important;
                            position: absolute;
                            left: 0;
                            top: 0;
                            width: 190mm !important;
                            min-height: auto !important;
                            height: auto !important;
                            max-height: none !important;
                            padding: 0 !important;
                            margin: 0 !important;
                        }
                        .landlord-report-section > div:first-child,
                        .landlord-report-section > div:nth-child(2) {
                            break-inside: avoid;
                            page-break-inside: avoid;
                        }
                        .landlord-report-section {
                            break-inside: auto;
                            page-break-inside: auto;
                        }
                        .landlord-report-section thead {
                            display: table-header-group;
                        }
                    }
                `}</style>
            </div>
        </div>
    );
}

function ReportBox({ label, value }: { label: string; value: string }) {
    return (
        <div className="border border-slate-300 p-3">
            <p className="text-xs font-black uppercase text-slate-500">{label}</p>
            <p className="mt-1 text-lg font-black">{value}</p>
        </div>
    );
}
