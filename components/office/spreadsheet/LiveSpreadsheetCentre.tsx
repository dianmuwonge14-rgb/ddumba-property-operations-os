"use client";

import type React from "react";
import { useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Download, Eye, EyeOff, FileSpreadsheet, Filter, Loader2, Printer, RefreshCcw, Sheet, TableProperties, Wifi } from "lucide-react";
import { logSpreadsheetAccess, logSpreadsheetExport } from "@/app/actions/spreadsheet-reporting";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { SpreadsheetData, SpreadsheetRow } from "@/lib/spreadsheet-reporting/types";
import { EmptyState, EnterpriseKpiCard, PageHero, StatusChip } from "@/components/office/shared/EnterpriseUI";

type Props = {
    data: SpreadsheetData;
};

const columns: Array<{ key: keyof SpreadsheetRow; label: string }> = [
    { key: "date", label: "Date" },
    { key: "officeName", label: "Office" },
    { key: "property", label: "Property" },
    { key: "room", label: "Room" },
    { key: "tenantName", label: "Tenant name" },
    { key: "amountPaid", label: "Amount paid" },
    { key: "balanceBefore", label: "Balance before" },
    { key: "balanceAfter", label: "Balance after" },
    { key: "promiseAmount", label: "Promise amount" },
    { key: "promiseStatus", label: "Promise status" },
    { key: "expenses", label: "Expense" },
    { key: "paidLandlords", label: "Landlord payment" },
    { key: "collectedBy", label: "Collected by" },
    { key: "collectionReference", label: "Reference" },
    { key: "transactionType", label: "Transaction type" },
    { key: "paymentMethod", label: "Payment method" },
    { key: "notes", label: "Notes" },
    { key: "createdAt", label: "Created at" },
    { key: "updatedAt", label: "Updated at" },
    { key: "phone", label: "Phone" },
    { key: "promiseDate", label: "Promise date" },
    { key: "expenseCategory", label: "Expense category" },
    { key: "landlordName", label: "Landlord name" },
    { key: "settlementAmount", label: "Settlement amount" },
    { key: "dateTime", label: "Date/time" },
    { key: "createdBy", label: "Created by" },
    { key: "auditStatus", label: "Audit status" },
];

type WorkbookTab = {
    id: string;
    label: string;
    rows: SpreadsheetRow[];
    description: string;
};

const WORKBOOK_ROW_PAGE_SIZE = 50;

function money(value: number) {
    return value ? `UGX ${Math.round(value).toLocaleString()}` : "";
}

function dateOnly(value: string) {
    if (!value) return "";
    return value.slice(0, 10);
}

function todayDate() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kampala" }).format(new Date());
}

function cell(row: SpreadsheetRow, key: keyof SpreadsheetRow) {
    const value = row[key];
    if (typeof value === "number") return money(value);
    if ((key === "dateTime" || key === "createdAt" || key === "updatedAt") && typeof value === "string") {
        return new Intl.DateTimeFormat("en-UG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Kampala" }).format(new Date(value));
    }
    return String(value ?? "");
}

export default function LiveSpreadsheetCentre({ data }: Props) {
    const router = useRouter();
    const [workbookOpen, setWorkbookOpen] = useState(false);
    const [activeTabId, setActiveTabId] = useState("");
    const [date, setDate] = useState("");
    const [office, setOffice] = useState("");
    const [collector, setCollector] = useState("");
    const [property, setProperty] = useState("");
    const [tenant, setTenant] = useState("");
    const [paymentType, setPaymentType] = useState("");
    const [liveStatus, setLiveStatus] = useState("Live");
    const [lastRefresh, setLastRefresh] = useState(data.loadedAt);
    const [rowPage, setRowPage] = useState(1);
    const [isPending, startTransition] = useTransition();
    const isLoading = isPending || liveStatus === "Updating";
    const hasError = Boolean(data.error);
    const deferredTenant = useDeferredValue(tenant);

    useEffect(() => {
        if (!data.error) {
            setLastRefresh(data.loadedAt);
            if (liveStatus === "Updating" || liveStatus === "Connecting") setLiveStatus("Live");
        }
    }, [data.error, data.loadedAt, liveStatus]);

    useEffect(() => {
        let mounted = true;
        let retryAttempt = 0;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;
        const supabase = createSupabaseBrowserClient();
        let channel: ReturnType<typeof supabase.channel> | null = null;

        const connect = () => {
            channel = supabase
                .channel("ddumba-live-spreadsheet")
                .on("postgres_changes", { event: "*", schema: "public", table: "collections" }, () => refreshFromRealtime())
                .on("postgres_changes", { event: "*", schema: "public", table: "promises" }, () => refreshFromRealtime())
                .on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, () => refreshFromRealtime())
                .on("postgres_changes", { event: "*", schema: "public", table: "landlord_payments" }, () => refreshFromRealtime())
                .on("postgres_changes", { event: "*", schema: "public", table: "attendance_events" }, () => refreshFromRealtime())
                .on("postgres_changes", { event: "*", schema: "public", table: "office_daily_reports" }, () => refreshFromRealtime())
                .on("postgres_changes", { event: "*", schema: "public", table: "vacated_tenant_debts" }, () => refreshFromRealtime())
                .on("postgres_changes", { event: "*", schema: "public", table: "landlord_debt_deductions" }, () => refreshFromRealtime())
                .subscribe((status) => {
                    if (!mounted) return;
                    if (status === "SUBSCRIBED") {
                        retryAttempt = 0;
                        setLiveStatus("Live");
                        return;
                    }
                    setLiveStatus("Connecting");
                    if (status !== "CHANNEL_ERROR" && status !== "TIMED_OUT" && status !== "CLOSED") return;

                    if (channel) void supabase.removeChannel(channel);
                    const retryDelay = Math.min(12000, 1000 * 2 ** retryAttempt);
                    retryAttempt += 1;
                    retryTimer = setTimeout(connect, retryDelay);
                });
        };

        connect();

        function refreshFromRealtime() {
            if (!mounted) return;
            setLiveStatus("Updating");
            startTransition(() => router.refresh());
            window.setTimeout(() => setLastRefresh(new Date().toISOString()), 1200);
        }

        return () => {
            mounted = false;
            if (retryTimer) clearTimeout(retryTimer);
            if (channel) void supabase.removeChannel(channel);
        };
    }, [router]);

    const filters = { date, office, collector, property, tenant: deferredTenant, paymentType };
    const visibleRows = useMemo(() => {
        return data.rows.filter((row) => {
            if (date && row.date !== date && dateOnly(row.dateTime) !== date) return false;
            if (office && row.officeId !== office) return false;
            if (collector && row.createdBy !== collector && row.collectedBy !== collector) return false;
            if (property && row.property !== property) return false;
            if (deferredTenant && !row.tenantName.toLowerCase().includes(deferredTenant.toLowerCase())) return false;
            if (paymentType && row.paymentMethod !== paymentType && row.source !== paymentType) return false;
            return true;
        });
    }, [data.rows, date, office, collector, property, deferredTenant, paymentType]);

    const workbookTabs = useMemo<WorkbookTab[]>(() => {
        if (!workbookOpen) return [];
        const collectionRows = visibleRows.filter((row) => row.source === "collection");
        const expenseRows = visibleRows.filter((row) => row.source === "expense");
        const promiseRows = visibleRows.filter((row) => row.source === "promise");
        const landlordRows = visibleRows.filter((row) => row.source === "landlord_payment");
        const attendanceRows = visibleRows.filter((row) => row.source === "attendance");
        const reportRows = visibleRows.filter((row) => row.source === "daily_report");
        const vacatedDebtRows = visibleRows.filter((row) => row.source === "vacated_debt");
        const deductionRows = visibleRows.filter((row) => row.source === "landlord_deduction");
        const summaryRows = buildSummaryRows(visibleRows, data.canAccessAllOffices ? "company" : "office");
        const officeSummaryRows = buildOfficeSummaryRows(visibleRows);

        return data.canAccessAllOffices ? [
            { id: "company-summary", label: "Company summary", rows: summaryRows, description: "Formula-backed company totals across all visible offices." },
            { id: "office-summaries", label: "Office summaries", rows: officeSummaryRows, description: "Per-office rollup formulas for collections, expenses, landlord payments, promises, and net cash." },
            { id: "collections", label: "Collections", rows: collectionRows, description: "Live collection entries from Supabase." },
            { id: "expenses", label: "Expenses", rows: expenseRows, description: "Live expense entries from Supabase." },
            { id: "promises", label: "Promises", rows: promiseRows, description: "Live promise records and statuses." },
            { id: "landlords", label: "Landlord payments", rows: landlordRows, description: "Settlement and landlord payment activity." },
            { id: "vacated-tenants", label: "Vacated Tenants", rows: vacatedDebtRows, description: "Tenants who exited with frozen bad debt balances." },
            { id: "bad-debt-recovery", label: "Bad Debt Recovery", rows: vacatedDebtRows, description: "Recovery status for vacated tenant balances." },
            { id: "landlord-deductions", label: "Landlord Deductions", rows: deductionRows, description: "Deductions applied or pending against landlord payable." },
            { id: "move-out-history", label: "Tenant Move-Out History", rows: vacatedDebtRows, description: "Auditable tenant move-out and recovery history." },
            { id: "attendance", label: "Attendance", rows: attendanceRows, description: "Attendance check-in, break, and check-out events." },
            { id: "daily-reports", label: "Daily office reports", rows: reportRows, description: "Submitted office reports and end-of-day notes." },
        ] : [
            { id: "office-summary", label: "End-of-day summary", rows: summaryRows, description: "Formula-backed daily office cash, promises, attendance, and reports." },
            { id: "collections", label: "Collections", rows: collectionRows, description: "Office-scoped collections." },
            { id: "expenses", label: "Expenses", rows: expenseRows, description: "Office-scoped expenses." },
            { id: "promises", label: "Promises", rows: promiseRows, description: "Office-scoped promises." },
            { id: "landlords", label: "Landlord payments", rows: landlordRows, description: "Office-scoped landlord payments." },
            { id: "vacated-tenants", label: "Vacated Tenants", rows: vacatedDebtRows, description: "Office-scoped vacated tenant debt register." },
            { id: "bad-debt-recovery", label: "Bad Debt Recovery", rows: vacatedDebtRows, description: "Office-scoped bad debt recovery statuses." },
            { id: "landlord-deductions", label: "Landlord Deductions", rows: deductionRows, description: "Office-scoped landlord recovery deductions." },
            { id: "move-out-history", label: "Tenant Move-Out History", rows: vacatedDebtRows, description: "Office-scoped tenant move-out history." },
            { id: "attendance", label: "Attendance", rows: attendanceRows, description: "Office attendance activity." },
            { id: "daily-reports", label: "Daily report", rows: reportRows, description: "Office daily report records." },
        ];
    }, [data.canAccessAllOffices, visibleRows, workbookOpen]);

    const activeTab = workbookTabs.find((tab) => tab.id === activeTabId) ?? workbookTabs[0];
    const workbookRows = activeTab?.rows ?? [];
    const visibleWorkbookRows = workbookRows.slice(0, rowPage * WORKBOOK_ROW_PAGE_SIZE);
    const hasMoreWorkbookRows = visibleWorkbookRows.length < workbookRows.length;

    const summary = useMemo(() => visibleRows.reduce(
        (totals, row) => {
            totals.collections += row.amountPaid;
            totals.promises += row.promiseAmount;
            totals.expenses += row.expenses;
            totals.landlordPayments += row.paidLandlords;
            if (row.source === "attendance") totals.attendance += 1;
            if (row.source === "daily_report") totals.dailyReports += 1;
            if (row.source === "vacated_debt") totals.vacatedDebts += row.balanceAfter;
            if (row.source === "landlord_deduction") totals.landlordDeductions += row.settlementAmount;
            return totals;
        },
        { collections: 0, promises: 0, expenses: 0, landlordPayments: 0, attendance: 0, dailyReports: 0, vacatedDebts: 0, landlordDeductions: 0 },
    ), [visibleRows]);

    useEffect(() => {
        setRowPage(1);
    }, [activeTabId, collector, date, deferredTenant, office, paymentType, property, workbookOpen]);

    function refresh() {
        setLiveStatus("Updating");
        startTransition(() => router.refresh());
    }

    async function openWorkbook() {
        setWorkbookOpen(true);
        setRowPage(1);
        setActiveTabId((current) => current || defaultWorkbookTabId(data.canAccessAllOffices));
        await logSpreadsheetAccess({
            action: "spreadsheet_opened",
            scope: data.canAccessAllOffices ? "company" : "office",
            rowCount: visibleRows.length,
            workbookTabs: workbookTabs.map((tab) => tab.label),
            filters,
        });
    }

    async function closeWorkbook() {
        setWorkbookOpen(false);
        setRowPage(1);
        await logSpreadsheetAccess({
            action: "spreadsheet_closed",
            scope: data.canAccessAllOffices ? "company" : "office",
            rowCount: visibleRows.length,
            workbookTabs: workbookTabs.map((tab) => tab.label),
            filters,
        });
    }

    async function exportRows(format: "csv") {
        const scope = data.canAccessAllOffices ? "company" : "office";
        await logSpreadsheetExport({ scope, rowCount: visibleRows.length, filters });
        const baseName = `${scope}-spreadsheet-${date || "all"}`;
        const rowsForExport = workbookOpen && workbookRows.length ? workbookRows : visibleRows;
        const content = toCsv(rowsForExport);
        const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${baseName}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    }

    function downloadExcel(range: "today" | "month" | "all", scopeOverride?: "company" | "office", officeId?: string | null) {
        const scope = scopeOverride ?? (data.canAccessAllOffices ? "company" : "office");
        const params = new URLSearchParams({ range, scope });
        if (scope === "office" && officeId) params.set("officeId", officeId);
        window.location.href = `/api/spreadsheet/excel?${params.toString()}`;
    }

    async function exportPdf() {
        const scope = data.canAccessAllOffices ? "company" : "office";
        await logSpreadsheetAccess({
            action: "spreadsheet_exported_pdf",
            scope,
            rowCount: visibleRows.length,
            workbookTabs: workbookTabs.map((tab) => tab.label),
            filters,
        });
        window.print();
    }

    return (
        <main className="enterprise-page">
            <div className="enterprise-shell">
                <PageHero
                    title={data.canAccessAllOffices ? "Company Spreadsheet Reporting" : "Office Daily Spreadsheet"}
                    subtitle={`${data.company?.name ?? "Company"} · ${data.canAccessAllOffices ? "all offices consolidated" : data.activeOffice?.office_name ?? "office-scoped"} live operational spreadsheet`}
                    badge="Live Spreadsheet"
                >
                    <div className="rounded-3xl bg-slate-950 p-5 text-white shadow-xl">
                        <div className="flex items-center gap-3">
                            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-500">
                                <Wifi size={23} />
                            </span>
                            <div>
                                <p className="text-sm text-slate-300">Realtime Status</p>
                                <p className="text-3xl font-black">{liveStatus}</p>
                                <p className="mt-1 text-xs font-bold text-slate-400">Last refresh {formatDateTime(lastRefresh)}</p>
                            </div>
                        </div>
                        <button onClick={refresh} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-white">
                            {isPending ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
                            Manual Refresh
                        </button>
                    </div>
                </PageHero>

                <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-6">
                    <EnterpriseKpiCard title="Collections" value={money(summary.collections) || "UGX 0"} tone="green" trend="up" trendLabel="visible rows" progress={80} />
                    <EnterpriseKpiCard title="Promises" value={money(summary.promises) || "UGX 0"} tone="blue" trend="flat" trendLabel="created/fulfilled" progress={60} />
                    <EnterpriseKpiCard title="Expenses" value={money(summary.expenses) || "UGX 0"} tone="orange" trend="down" trendLabel="daily spend" progress={45} />
                    <EnterpriseKpiCard title="Landlord Payments" value={money(summary.landlordPayments) || "UGX 0"} tone="purple" trend="flat" trendLabel="settlements" progress={50} />
                    <EnterpriseKpiCard title="Attendance Events" value={`${summary.attendance}`} tone="cyan" trend="flat" trendLabel="workforce rows" progress={50} />
                    <EnterpriseKpiCard title="Daily Reports" value={`${summary.dailyReports}`} tone="slate" trend="up" trendLabel="office summaries" progress={50} />
                </section>

                <section className="enterprise-panel mt-6 overflow-hidden">
                    <div className="border-b border-slate-200 p-5">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                            <div className="flex items-center gap-3">
                                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-700">
                                    <Sheet size={21} />
                                </span>
                                <div>
                                    <h2 className="text-xl font-black">{data.canAccessAllOffices ? "Admin Consolidated Workbook" : "Office Spreadsheet Workbook"}</h2>
                                    <p className="text-sm text-slate-500">The workbook stays hidden until opened. Every tab is generated from live Supabase records and current filters.</p>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <StatusChip label={`${visibleRows.length} visible`} tone="blue" />
                                <StatusChip label={`${data.rows.length} loaded`} tone="slate" />
                                <StatusChip label={`${data.sourceCounts.collections} collections`} tone="green" />
                                <StatusChip label={`${data.sourceCounts.promises} promises`} tone="purple" />
                                <StatusChip label={`${data.sourceCounts.expenses} expenses`} tone="orange" />
                                <StatusChip label={`${data.sourceCounts.landlordPayments} landlord payments`} tone="blue" />
                                <StatusChip label={`${data.sourceCounts.attendance} attendance`} tone="cyan" />
                                <StatusChip label={`${data.sourceCounts.dailyReports} daily reports`} tone="slate" />
                                <StatusChip label={`${data.sourceCounts.vacatedDebts} vacated debts`} tone="orange" />
                                <StatusChip label={`${data.sourceCounts.landlordDeductions} deductions`} tone="purple" />
                                {!workbookOpen ? (
                                    <button onClick={openWorkbook} disabled={hasError} className="inline-flex items-center gap-2 rounded-2xl bg-blue-700 px-4 py-2 text-sm font-black text-white disabled:opacity-50">
                                        <Eye size={16} />
                                        Open Spreadsheet
                                    </button>
                                ) : (
                                    <button onClick={closeWorkbook} className="inline-flex items-center gap-2 rounded-2xl bg-slate-200 px-4 py-2 text-sm font-black text-slate-800">
                                        <EyeOff size={16} />
                                        Hide Spreadsheet
                                    </button>
                                )}
                                <button onClick={() => exportRows("csv")} disabled={isLoading || hasError} className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2 text-sm font-black text-white disabled:opacity-50">
                                    <Download size={16} />
                                    CSV
                                </button>
                                <button onClick={() => downloadExcel("today", data.canAccessAllOffices ? "company" : "office", office)} disabled={isLoading || hasError} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-black text-white disabled:opacity-50">
                                    <FileSpreadsheet size={16} />
                                    Download Today Excel
                                </button>
                                <button onClick={() => downloadExcel("month", data.canAccessAllOffices ? "company" : "office", office)} disabled={isLoading || hasError} className="inline-flex items-center gap-2 rounded-2xl bg-cyan-700 px-4 py-2 text-sm font-black text-white disabled:opacity-50">
                                    <FileSpreadsheet size={16} />
                                    Download Monthly Excel
                                </button>
                                {data.canAccessAllOffices && (
                                <button onClick={() => downloadExcel("all", "company")} disabled={isLoading || hasError} className="inline-flex items-center gap-2 rounded-2xl bg-blue-700 px-4 py-2 text-sm font-black text-white disabled:opacity-50">
                                    <FileSpreadsheet size={16} />
                                    Download Company Excel
                                </button>
                                )}
                                <button onClick={exportPdf} disabled={isLoading || hasError || !workbookOpen} className="inline-flex items-center gap-2 rounded-2xl bg-rose-600 px-4 py-2 text-sm font-black text-white disabled:opacity-50">
                                    <Printer size={16} />
                                    PDF
                                </button>
                            </div>
                        </div>

                        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
                            <FilterBox icon={<Filter size={15} />}>
                                <input
                                    type="date"
                                    value={date}
                                    onChange={(event) => setDate(event.currentTarget.value)}
                                    onInput={(event) => setDate(event.currentTarget.value)}
                                    aria-label="Date filter"
                                />
                                <button type="button" onClick={() => setDate("")} className="rounded-xl bg-white px-2 py-1 text-xs font-black text-slate-500">All</button>
                                <button type="button" onClick={() => setDate(todayDate())} className="rounded-xl bg-blue-600 px-2 py-1 text-xs font-black text-white">Today</button>
                            </FilterBox>
                            <FilterBox><select value={office} onChange={(event) => setOffice(event.target.value)} disabled={!data.canAccessAllOffices}><option value="">All visible offices</option>{data.offices.map((item) => <option key={item.id} value={item.id}>{item.office_name}</option>)}</select></FilterBox>
                            <FilterBox><select value={collector} onChange={(event) => setCollector(event.target.value)}><option value="">All employees / staff</option>{data.collectors.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></FilterBox>
                            <FilterBox><select value={property} onChange={(event) => setProperty(event.target.value)}><option value="">All properties</option>{data.properties.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</select></FilterBox>
                            <FilterBox><input value={tenant} onChange={(event) => setTenant(event.target.value)} placeholder="Tenant" /></FilterBox>
                            <FilterBox><select value={paymentType} onChange={(event) => setPaymentType(event.target.value)}><option value="">All types</option><option value="cash">Cash</option><option value="mobile_money">Mobile Money</option><option value="bank">Bank</option><option value="promise">Promise payment</option><option value="expense">Expenses</option><option value="landlord_payment">Landlord payments</option><option value="attendance">Attendance</option><option value="daily_report">Daily reports</option><option value="vacated_debt">Vacated debts</option><option value="landlord_deduction">Landlord deductions</option></select></FilterBox>
                        </div>
                    </div>

                    {!workbookOpen ? (
                        <div className="p-8">
                            <div className="rounded-3xl border border-dashed border-blue-200 bg-blue-50 p-8 text-center">
                                <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-white text-blue-700 shadow-sm">
                                    <TableProperties size={28} />
                                </div>
                                <h3 className="mt-4 text-2xl font-black text-slate-950">Spreadsheet hidden</h3>
                                <p className="mx-auto mt-2 max-w-2xl text-sm font-bold text-slate-500">
                                    Open the workbook when you need to inspect live rows. Closing it removes the spreadsheet from view while preserving filters, realtime refresh, and export readiness.
                                </p>
                                <button onClick={openWorkbook} disabled={hasError} className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-blue-700 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-100 disabled:opacity-50">
                                    <Eye size={18} />
                                    Open Spreadsheet
                                </button>
                            </div>
                        </div>
                    ) : (
                    <>
                    <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
                        {data.canAccessAllOffices && (
                            <div className="mb-4 rounded-2xl border border-blue-100 bg-white p-4">
                                <p className="text-sm font-black text-slate-900">Admin office workbooks</p>
                                <p className="mt-1 text-xs font-bold text-slate-500">Download an individual real `.xlsx` office workbook, or use Company Excel for the consolidated workbook.</p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {data.offices.map((item) => (
                                        <button
                                            key={item.id}
                                            type="button"
                                            onClick={() => downloadExcel("month", "office", item.id)}
                                            className="rounded-2xl bg-slate-950 px-3 py-2 text-xs font-black text-white"
                                        >
                                            {item.office_name} Excel
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div className="flex flex-wrap gap-2">
                            {workbookTabs.map((tab) => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setActiveTabId(tab.id)}
                                    className={`rounded-2xl px-4 py-2 text-sm font-black transition ${activeTab?.id === tab.id ? "bg-slate-950 text-white shadow" : "bg-white text-slate-600 hover:bg-slate-100"}`}
                                >
                                    {tab.label} <span className="ml-1 text-xs opacity-70">({tab.rows.length})</span>
                                </button>
                            ))}
                        </div>
                        <p className="mt-3 text-sm font-bold text-slate-500">
                            {activeTab?.description}
                            {workbookRows.length > visibleWorkbookRows.length ? ` Showing ${visibleWorkbookRows.length.toLocaleString()} of ${workbookRows.length.toLocaleString()} rows for browser performance; exports include the active tab rows.` : ""}
                        </p>
                    </div>
                    <div className="max-h-[720px] overflow-auto">
                        <table className="enterprise-table min-w-[2400px]">
                            <thead className="sticky top-0 z-10 bg-white">
                                <tr>
                                    <th className="text-left">Type</th>
                                    {columns.map((column) => <th key={column.key} className="text-left">{column.label}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {hasError ? (
                                    <tr><td colSpan={columns.length + 1} className="p-8"><ErrorState message={data.error ?? "Spreadsheet data failed to load."} /></td></tr>
                                ) : isLoading && data.rows.length === 0 ? (
                                    <tr><td colSpan={columns.length + 1} className="p-8"><LoadingState /></td></tr>
                                ) : workbookRows.length === 0 ? (
                                    <tr><td colSpan={columns.length + 1} className="p-8"><EmptyState title={data.rows.length ? "No rows match filters for this tab" : "No spreadsheet rows"} description={data.rows.length ? "Clear filters or switch workbook tabs to view loaded records." : "Live rows will appear after collections, promises, expenses, landlord payments, attendance, daily reports, tenant move-outs, or landlord deductions are recorded."} /></td></tr>
                                ) : visibleWorkbookRows.map((row) => (
                                    <tr key={row.id}>
                                        <td><StatusChip label={row.source.replaceAll("_", " ")} tone={sourceTone(row.source)} /></td>
                                        {columns.map((column) => (
                                            <td key={column.key} className={numericColumn(column.key) ? "font-black tabular-nums" : ""}>
                                                {column.key === "auditStatus" ? <StatusChip label={cell(row, column.key)} tone={row.auditStatus === "Audited" ? "green" : "orange"} /> : cell(row, column.key)}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {hasMoreWorkbookRows ? (
                        <div className="border-t border-slate-200 bg-white p-4 text-center">
                            <button
                                type="button"
                                onClick={() => setRowPage((page) => page + 1)}
                                className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-slate-800"
                            >
                                Load {Math.min(WORKBOOK_ROW_PAGE_SIZE, workbookRows.length - visibleWorkbookRows.length)} more rows
                            </button>
                        </div>
                    ) : null}
                    </>
                    )}
                </section>
            </div>
        </main>
    );
}

function defaultWorkbookTabId(canAccessAllOffices: boolean) {
    return canAccessAllOffices ? "company-summary" : "office-summary";
}

function toCsv(rows: SpreadsheetRow[]) {
    return [
        columns.map((column) => quote(column.label)).join(","),
        ...rows.map((row) => columns.map((column) => quote(cell(row, column.key))).join(",")),
    ].join("\n");
}

function buildSummaryRows(rows: SpreadsheetRow[], scope: "company" | "office"): SpreadsheetRow[] {
    const today = todayDate();
    const todayRows = rows.filter((row) => row.date === today || dateOnly(row.dateTime) === today);
    const monthRows = rows.filter((row) => row.date.startsWith(today.slice(0, 7)) || dateOnly(row.dateTime).startsWith(today.slice(0, 7)));
    const baseName = scope === "company" ? "Company summary" : "Office end-of-day summary";
    return [
        summaryRow(`${scope}-today`, baseName, "Daily totals", todayRows, "=Total collected today - total spent today - landlord payments today"),
        summaryRow(`${scope}-month`, baseName, "Monthly totals", monthRows, "=Monthly collections - monthly expenses - monthly landlord payments"),
        summaryRow(`${scope}-all`, baseName, "Loaded workbook totals", rows, "=All visible collections - expenses - landlord payments"),
    ];
}

function buildOfficeSummaryRows(rows: SpreadsheetRow[]) {
    const officeNames = [...new Set(rows.map((row) => row.officeName).filter(Boolean))].sort();
    return officeNames.map((officeName) => summaryRow(`office-${officeName}`, officeName, "Per-office totals", rows.filter((row) => row.officeName === officeName), "=Office collections - expenses - landlord payments"));
}

function summaryRow(id: string, officeName: string, label: string, rows: SpreadsheetRow[], formula: string): SpreadsheetRow {
    const collections = rows.reduce((total, row) => total + row.amountPaid, 0);
    const expenses = rows.reduce((total, row) => total + row.expenses, 0);
    const landlordPayments = rows.reduce((total, row) => total + row.paidLandlords, 0);
    const promises = rows.reduce((total, row) => total + row.promiseAmount, 0);
    const netCash = collections - expenses - landlordPayments;
    const now = new Date().toISOString();

    return {
        id,
        source: "daily_report",
        date: todayDate(),
        officeId: null,
        officeName,
        tenantName: label,
        phone: "",
        property: "Workbook formula",
        room: "",
        amountPaid: collections,
        balanceBefore: collections,
        balanceAfter: netCash,
        promiseAmount: promises,
        promiseDate: null,
        promiseStatus: `${rows.filter((row) => row.source === "promise").length} promise rows`,
        collectedBy: "",
        paymentMethod: "",
        collectionReference: formula,
        transactionType: "formula",
        expenses,
        expenseCategory: "",
        paidLandlords: landlordPayments,
        landlordName: "",
        settlementAmount: landlordPayments,
        notes: `Net cash = ${collections} - ${expenses} - ${landlordPayments}`,
        dateTime: now,
        createdAt: now,
        updatedAt: now,
        createdBy: "System formula",
        auditStatus: "Audited",
    };
}

function quote(value: string) {
    return `"${value.replaceAll('"', '""')}"`;
}

function formatDateTime(value: string) {
    return new Intl.DateTimeFormat("en-UG", { dateStyle: "medium", timeStyle: "medium", timeZone: "Africa/Kampala" }).format(new Date(value));
}

function sourceTone(source: SpreadsheetRow["source"]) {
    if (source === "collection") return "green";
    if (source === "promise") return "blue";
    if (source === "expense") return "orange";
    if (source === "attendance") return "cyan";
    if (source === "daily_report") return "slate";
    if (source === "vacated_debt") return "orange";
    if (source === "landlord_deduction") return "purple";
    return "purple";
}

function numericColumn(key: keyof SpreadsheetRow) {
    return ["amountPaid", "balanceBefore", "balanceAfter", "promiseAmount", "expenses", "paidLandlords", "settlementAmount"].includes(key);
}

function LoadingState() {
    return (
        <div className="flex items-center justify-center gap-3 rounded-3xl border border-blue-100 bg-blue-50 p-8 text-blue-700">
            <Loader2 className="animate-spin" size={22} />
            <div>
                <h3 className="font-black">Loading spreadsheet data</h3>
                <p className="text-sm font-bold text-blue-500">Fetching live operational records from Supabase.</p>
            </div>
        </div>
    );
}

function ErrorState({ message }: { message: string }) {
    return (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-8 text-red-800">
            <div className="flex items-start gap-3">
                <AlertTriangle size={24} />
                <div>
                    <h3 className="font-black">Spreadsheet data failed to load</h3>
                    <p className="mt-1 text-sm font-bold">{message}</p>
                    <p className="mt-3 text-sm text-red-700">Check Supabase connectivity, RLS policies, and the active office/company session.</p>
                </div>
            </div>
        </div>
    );
}

function FilterBox({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
    return (
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-600 [&_input]:min-w-0 [&_input]:flex-1 [&_input]:bg-transparent [&_input]:outline-none [&_select]:min-w-0 [&_select]:flex-1 [&_select]:bg-transparent [&_select]:outline-none">
            {icon}
            {children}
        </div>
    );
}
