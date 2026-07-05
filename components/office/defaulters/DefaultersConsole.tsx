"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Bot, CalendarClock, Download, FileText, MessageCircle, Phone, Printer, Search, Send, Sparkles, WalletCards } from "lucide-react";
import type { DefaulterItem, DefaultersPageData } from "@/lib/defaulters/types";

type Props = {
    data: DefaultersPageData;
};

type PeriodFilter = "all" | "today" | "1_7" | "8_14" | "15_30" | "1_month" | "2_months" | "3_plus" | "custom_days" | "custom_months";
type SortMode = "risk_high" | "days_high" | "balance_high" | "room_asc";
const INITIAL_TABLE_LIMIT = 100;

function money(value: number | string | null | undefined) {
    return `UGX ${Math.round(Number(value ?? 0)).toLocaleString()}`;
}

function normalize(value: string | null | undefined) {
    return String(value ?? "").trim().toLowerCase();
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
    const [query, setQuery] = useState("");
    const [officeId, setOfficeId] = useState("");
    const [landlordId, setLandlordId] = useState("");
    const [minRent, setMinRent] = useState("");
    const [maxRent, setMaxRent] = useState("");
    const [period, setPeriod] = useState<PeriodFilter>("all");
    const [customDaysMin, setCustomDaysMin] = useState("");
    const [customDaysMax, setCustomDaysMax] = useState("");
    const [customMonthsMin, setCustomMonthsMin] = useState("");
    const [customMonthsMax, setCustomMonthsMax] = useState("");
    const [sort, setSort] = useState<SortMode>("risk_high");
    const [showPrintPreview, setShowPrintPreview] = useState(false);

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
                const searchable = [item.roomNumber, item.tenantName, item.tenantPhone, item.landlordName, item.location, String(item.monthlyRent)].map(normalize).join(" ");
                if (term && !searchable.includes(term)) return false;
                if (data.isAdmin && officeId && item.officeId !== officeId) return false;
                if (landlordId && item.landlordId !== landlordId) return false;
                if (min > 0 && item.monthlyRent < min) return false;
                if (max > 0 && item.monthlyRent > max) return false;
                if (period === "today" && item.daysDefaulted !== 1) return false;
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
                if (sort === "days_high") return b.daysDefaulted - a.daysDefaulted || b.outstandingBalance - a.outstandingBalance;
                if (sort === "balance_high") return b.outstandingBalance - a.outstandingBalance || b.daysDefaulted - a.daysDefaulted;
                if (sort === "room_asc") return a.roomNumber.localeCompare(b.roomNumber);
                return (b.daysDefaulted * b.outstandingBalance) - (a.daysDefaulted * a.outstandingBalance);
            });
    }, [customDaysMax, customDaysMin, customMonthsMax, customMonthsMin, data.defaulters, data.isAdmin, landlordId, maxRent, minRent, officeId, period, query, sort]);

    const visibleKpis = useMemo(() => buildKpis(filteredDefaulters), [filteredDefaulters]);
    const visibleDefaulters = useMemo(() => filteredDefaulters.slice(0, INITIAL_TABLE_LIMIT), [filteredDefaulters]);
    const paymentHref = data.isAdmin ? "/office/admin/payments" : "/office/payments";

    function exportCsv() {
        const header = ["Room", "Tenant", "Phone", "Office", "Landlord", "Property", "Location", "Monthly Rent", "Outstanding", "Due Date", "Days Defaulted", "Months Defaulted", "Last Payment Date", "Last Payment Amount"];
        const csv = [header, ...filteredDefaulters.map((item) => [
            item.roomNumber,
            item.tenantName,
            item.tenantPhone ?? "",
            item.officeName,
            item.landlordName,
            item.propertyName,
            item.location,
            String(item.monthlyRent),
            String(item.outstandingBalance),
            item.paymentDueDate,
            String(item.daysDefaulted),
            String(item.monthsDefaulted),
            item.lastPaymentDate ?? "",
            String(item.lastPaymentAmount),
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
                                {data.isAdmin ? "Admin defaulters" : "Office defaulters"}
                            </div>
                            <h1 className="mt-3 text-3xl font-black sm:text-4xl">Defaulters</h1>
                            <p className="mt-1 text-sm font-semibold text-slate-300">
                                {data.company?.name ?? "Company"} · {data.isAdmin ? "All offices" : data.activeOffice?.office_name ?? data.activeOffice?.name ?? "Active office"} · Live as of {data.currentDate}
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
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

                <section className="mx-auto mt-5 grid max-w-7xl gap-3 md:grid-cols-2 xl:grid-cols-7">
                    <RiskCard label="Total defaulters" value={visibleKpis.totalDefaulters.toLocaleString()} hint="Past due active tenants" tone="red" icon={<AlertTriangle size={18} />} />
                    <RiskCard label="Outstanding from defaulters" value={money(visibleKpis.totalOutstanding)} hint="Live tenant balances" tone="red" icon={<WalletCards size={18} />} />
                    <RiskCard label="Defaulted 1-7 days" value={visibleKpis.defaultedOneToSevenDays.toLocaleString()} hint="Early follow-up" tone="amber" icon={<CalendarClock size={18} />} />
                    <RiskCard label="Defaulted 8-30 days" value={visibleKpis.defaultedEightToThirtyDays.toLocaleString()} hint="Collection priority" tone="amber" icon={<CalendarClock size={18} />} />
                    <RiskCard label="Defaulted 1+ month" value={visibleKpis.defaultedOneMonthPlus.toLocaleString()} hint="High risk" tone="purple" icon={<AlertTriangle size={18} />} />
                    <RiskCard label="Highest-risk office" value={visibleKpis.highestRiskOffice} hint="By outstanding balance" tone="slate" icon={<FileText size={18} />} />
                    <RiskCard label="Highest outstanding tenant" value={visibleKpis.highestOutstandingTenant} hint="Largest balance" tone="slate" icon={<WalletCards size={18} />} />
                </section>

                <AssistantPanel assistant={data.assistant} />

                <section className="mx-auto mt-5 max-w-7xl rounded-[28px] border border-white/10 bg-slate-900 p-4 text-white shadow-xl shadow-black/20">
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.8fr)_repeat(6,minmax(130px,1fr))]">
                        <label className="block">
                            <span className="text-xs font-black uppercase tracking-wide text-slate-400">Search room, tenant, phone, landlord</span>
                            <div className="mt-1 flex h-12 items-center rounded-2xl border border-white/10 bg-slate-950 px-3">
                                <Search size={16} className="mr-2 text-slate-500" />
                                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="T149, Sarah, 0700..." className="w-full bg-transparent text-sm font-black text-white outline-none placeholder:text-slate-500" />
                            </div>
                        </label>
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
                        {data.isAdmin ? <FilterSelect label="Office" value={officeId} onChange={setOfficeId} options={[{ id: "", name: "All offices" }, ...data.offices]} /> : null}
                        <FilterSelect label="Landlord" value={landlordId} onChange={setLandlordId} options={[{ id: "", name: "All landlords" }, ...data.landlords]} />
                        <FilterInput label="Min rent" value={minRent} onChange={setMinRent} />
                        <FilterInput label="Max rent" value={maxRent} onChange={setMaxRent} />
                        <FilterSelect label="Sort" value={sort} onChange={(value) => setSort(value as SortMode)} options={[
                            { id: "risk_high", name: "Highest risk" },
                            { id: "days_high", name: "Longest defaulted" },
                            { id: "balance_high", name: "Highest balance" },
                            { id: "room_asc", name: "Room number" },
                        ]} />
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
                </section>

                <section className="mx-auto mt-5 max-w-7xl">
                    {filteredDefaulters.length > visibleDefaulters.length ? (
                        <div className="mb-3 rounded-2xl border border-amber-200/60 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
                            Showing first {visibleDefaulters.length.toLocaleString()} of {filteredDefaulters.length.toLocaleString()} matching defaulters. Use filters, print, or CSV export for the full report.
                        </div>
                    ) : null}
                    <DefaultersTable defaulters={visibleDefaulters} paymentHref={paymentHref} />
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
                    onClose={() => setShowPrintPreview(false)}
                    scope={data.isAdmin ? "All offices" : data.activeOffice?.office_name ?? data.activeOffice?.name ?? "Active office"}
                />
            ) : null}
        </main>
    );
}

function buildKpis(items: DefaulterItem[]) {
    const officeRisk = new Map<string, { count: number; outstanding: number }>();
    for (const item of items) {
        const current = officeRisk.get(item.officeName) ?? { count: 0, outstanding: 0 };
        current.count += 1;
        current.outstanding += item.outstandingBalance;
        officeRisk.set(item.officeName, current);
    }
    return {
        totalDefaulters: items.length,
        totalOutstanding: items.reduce((total, item) => total + item.outstandingBalance, 0),
        defaultedOneToSevenDays: items.filter((item) => item.daysDefaulted >= 1 && item.daysDefaulted <= 7).length,
        defaultedEightToThirtyDays: items.filter((item) => item.daysDefaulted >= 8 && item.daysDefaulted <= 30).length,
        defaultedOneMonthPlus: items.filter((item) => item.daysDefaulted >= 30).length,
        highestRiskOffice: [...officeRisk.entries()].sort((a, b) => b[1].outstanding - a[1].outstanding || b[1].count - a[1].count)[0]?.[0] ?? "No defaulters",
        highestOutstandingTenant: [...items].sort((a, b) => b.outstandingBalance - a.outstandingBalance)[0]?.tenantName ?? "No defaulters",
    };
}

function DefaultersTable({ defaulters, paymentHref }: { defaulters: DefaulterItem[]; paymentHref: string }) {
    return (
        <div className="overflow-hidden rounded-[26px] border border-white/70 bg-white shadow-2xl shadow-slate-950/15">
            <div className="max-h-[680px] overflow-auto">
                <table className="w-full min-w-[1320px] text-left text-sm">
                    <thead className="sticky top-0 bg-slate-950 text-xs uppercase text-slate-200">
                        <tr>
                            <th className="px-4 py-3">Room / Tenant</th>
                            <th className="px-4 py-3">Office</th>
                            <th className="px-4 py-3">Landlord</th>
                            <th className="px-4 py-3">Location</th>
                            <th className="px-4 py-3 text-right">Monthly Rent</th>
                            <th className="px-4 py-3 text-right">Outstanding</th>
                            <th className="px-4 py-3">Due Date</th>
                            <th className="px-4 py-3">Defaulted</th>
                            <th className="px-4 py-3">Last Payment</th>
                            <th className="px-4 py-3">AI Action</th>
                            <th className="px-4 py-3">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {defaulters.map((item) => (
                            <tr key={`${item.id}:ledger:${item.paymentDueDate}`} className="border-b border-slate-100">
                                <td className="px-4 py-3">
                                    <p className="font-black text-slate-950">Room {item.roomNumber}</p>
                                    <p className="text-sm font-bold text-slate-600">{item.tenantName}</p>
                                    <p className="text-xs font-bold text-slate-400">{item.tenantPhone ?? "No phone"}</p>
                                </td>
                                <td className="px-4 py-3 font-bold text-slate-600">{item.officeName}</td>
                                <td className="px-4 py-3 font-bold text-slate-600">{item.landlordName}</td>
                                <td className="px-4 py-3 font-bold text-slate-600">{item.propertyName}<br /><span className="text-xs text-slate-400">{item.location}</span></td>
                                <td className="px-4 py-3 text-right font-black text-slate-950">{money(item.monthlyRent)}</td>
                                <td className="px-4 py-3 text-right font-black text-rose-700">{money(item.outstandingBalance)}</td>
                                <td className="px-4 py-3 font-bold text-slate-600">
                                    {item.paymentDueDate}
                                    <br />
                                    <span className="text-xs text-slate-400">{item.dueSource === "default_first" ? "Default due date: 1st monthly" : `Due day ${item.paymentDueDay}`}</span>
                                </td>
                                <td className="px-4 py-3">
                                    <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-black uppercase text-rose-700 ring-1 ring-rose-100">{item.daysDefaulted} days</span>
                                    <p className="mt-1 text-xs font-bold text-slate-400">{item.monthsDefaulted} month(s)</p>
                                </td>
                                <td className="px-4 py-3 font-bold text-slate-600">
                                    {item.lastPaymentDate ?? "No payment"}
                                    <br />
                                    <span className="text-xs text-slate-400">{money(item.lastPaymentAmount)}</span>
                                    {item.isPartialPayer ? <span className="mt-1 inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black uppercase text-blue-700">Partial paid {money(item.currentMonthPaid)}</span> : null}
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex max-w-[220px] flex-wrap gap-1">
                                        {item.suggestedActions.map((action) => (
                                            <span key={`${item.id}:action:${action.toLowerCase().replaceAll(" ", "-")}:${item.paymentDueDate}`} className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-700">{action}</span>
                                        ))}
                                    </div>
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex flex-wrap gap-1.5">
                                        <a href={phoneHref(item.tenantPhone)} className="rounded-xl bg-slate-100 px-2.5 py-2 text-xs font-black text-slate-700"><Phone size={13} className="inline" /> Call</a>
                                        <a href={whatsappHref(item.tenantPhone, item.tenantName, item.roomNumber)} target="_blank" rel="noreferrer" className="rounded-xl bg-emerald-50 px-2.5 py-2 text-xs font-black text-emerald-700"><MessageCircle size={13} className="inline" /> WhatsApp</a>
                                        <a href={smsHref(item.tenantPhone)} className="rounded-xl bg-blue-50 px-2.5 py-2 text-xs font-black text-blue-700"><Send size={13} className="inline" /> SMS</a>
                                        <Link href={paymentHref} className="rounded-xl bg-slate-950 px-2.5 py-2 text-xs font-black text-white">Record Payment</Link>
                                        <Link href="/office/promises" className="rounded-xl bg-amber-50 px-2.5 py-2 text-xs font-black text-amber-700">Promise{item.openPromiseCount ? ` (${item.openPromiseCount})` : ""}</Link>
                                    </div>
                                </td>
                            </tr>
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

function RiskCard({ hint, icon, label, tone, value }: { hint: string; icon: React.ReactNode; label: string; tone: "red" | "amber" | "purple" | "slate"; value: string }) {
    const toneClass = {
        red: "border-rose-200 bg-rose-50 text-rose-800",
        amber: "border-amber-200 bg-amber-50 text-amber-800",
        purple: "border-purple-200 bg-purple-50 text-purple-800",
        slate: "border-slate-200 bg-white text-slate-800",
    }[tone];
    return (
        <div className={`rounded-[24px] border p-4 shadow-xl shadow-slate-950/10 ${toneClass}`}>
            <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-black uppercase tracking-wide opacity-75">{label}</p>
                {icon}
            </div>
            <p className="mt-3 break-words text-xl font-black leading-tight">{value}</p>
            <p className="mt-1 text-xs font-bold opacity-70">{hint}</p>
        </div>
    );
}

function PrintPreview({ companyName, defaulters, generatedAt, kpis, onClose, scope }: { companyName: string; defaulters: DefaulterItem[]; generatedAt: string; kpis: ReturnType<typeof buildKpis>; onClose: () => void; scope: string }) {
    return (
        <div className="fixed inset-0 z-[150] overflow-auto bg-slate-950/80 p-4 backdrop-blur-sm">
            <div className="mx-auto max-w-6xl rounded-3xl bg-white p-5 shadow-2xl">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
                    <div>
                        <p className="text-xs font-black uppercase text-rose-700">Print preview</p>
                        <h2 className="text-xl font-black text-slate-950">Defaulters Report</h2>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => window.print()} className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-black text-white">Print / Save PDF</button>
                        <button onClick={onClose} className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-700">Close</button>
                    </div>
                </div>
                <div className="min-h-[1050px] bg-white p-6 text-slate-950">
                    <header className="border-b-2 border-slate-950 pb-4">
                        <p className="text-sm font-black uppercase tracking-wide text-slate-500">{companyName}</p>
                        <h1 className="mt-1 text-3xl font-black">Defaulters Report</h1>
                        <div className="mt-3 grid gap-2 text-sm font-semibold sm:grid-cols-2">
                            <p>Scope: {scope}</p>
                            <p>Generated: {new Date(generatedAt).toLocaleString()}</p>
                        </div>
                    </header>
                    <section className="mt-5 grid gap-3 sm:grid-cols-4">
                        <ReportBox label="Defaulters" value={kpis.totalDefaulters.toLocaleString()} />
                        <ReportBox label="Outstanding" value={money(kpis.totalOutstanding)} />
                        <ReportBox label="1-7 Days" value={kpis.defaultedOneToSevenDays.toLocaleString()} />
                        <ReportBox label="1+ Month" value={kpis.defaultedOneMonthPlus.toLocaleString()} />
                    </section>
                    <table className="mt-6 w-full border-collapse text-xs">
                        <thead>
                            <tr className="bg-slate-950 text-left text-white">
                                <th className="border border-slate-300 px-2 py-2">Room</th>
                                <th className="border border-slate-300 px-2 py-2">Tenant</th>
                                <th className="border border-slate-300 px-2 py-2">Phone</th>
                                <th className="border border-slate-300 px-2 py-2">Office</th>
                                <th className="border border-slate-300 px-2 py-2">Landlord</th>
                                <th className="border border-slate-300 px-2 py-2 text-right">Rent</th>
                                <th className="border border-slate-300 px-2 py-2 text-right">Outstanding</th>
                                <th className="border border-slate-300 px-2 py-2">Due Date</th>
                                <th className="border border-slate-300 px-2 py-2">Days</th>
                            </tr>
                        </thead>
                        <tbody>
                            {defaulters.map((item) => (
                                <tr key={`${item.id}:print:${item.paymentDueDate}`}>
                                    <td className="border border-slate-300 px-2 py-2 font-bold">{item.roomNumber}</td>
                                    <td className="border border-slate-300 px-2 py-2">{item.tenantName}</td>
                                    <td className="border border-slate-300 px-2 py-2">{item.tenantPhone ?? ""}</td>
                                    <td className="border border-slate-300 px-2 py-2">{item.officeName}</td>
                                    <td className="border border-slate-300 px-2 py-2">{item.landlordName}</td>
                                    <td className="border border-slate-300 px-2 py-2 text-right font-bold">{money(item.monthlyRent)}</td>
                                    <td className="border border-slate-300 px-2 py-2 text-right font-bold">{money(item.outstandingBalance)}</td>
                                    <td className="border border-slate-300 px-2 py-2">{item.paymentDueDate}</td>
                                    <td className="border border-slate-300 px-2 py-2">{item.daysDefaulted}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <footer className="mt-10 grid gap-8 text-sm font-semibold sm:grid-cols-2">
                        <p>Prepared by: __________________________</p>
                        <p>Approved by: __________________________</p>
                    </footer>
                </div>
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
