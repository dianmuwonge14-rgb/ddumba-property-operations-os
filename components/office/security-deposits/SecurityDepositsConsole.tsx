"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
    AlertTriangle,
    ArrowUpRight,
    Banknote,
    CalendarClock,
    CalendarDays,
    CheckCircle2,
    Clock3,
    FileText,
    Gauge,
    Landmark,
    Loader2,
    RefreshCw,
    Search,
    ShieldAlert,
    ShieldCheck,
    Sparkles,
    Vault,
    WalletCards,
    X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { restoreSecurityFunds, useSecurityFunds } from "@/app/actions/security-deposits";
import type { SecurityDepositPageData, SecurityDepositRegisterRow } from "@/lib/security-deposits/types";

function money(value: unknown) {
    return `UGX ${Math.round(Number(value ?? 0)).toLocaleString("en-UG")}`;
}

function amount(value: unknown) {
    const numeric = Number(value ?? 0);
    return Number.isFinite(numeric) ? numeric : 0;
}

function prettyStatus(value: string | null | undefined) {
    return String(value ?? "held").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dateLabel(value: string | null | undefined) {
    if (!value) return "Not set";
    const date = new Date(`${value.slice(0, 10)}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("en-UG", { day: "2-digit", month: "short", year: "numeric" });
}

function depositLabel(deposit: SecurityDepositRegisterRow | null) {
    if (!deposit) return "No deposit selected";
    return `${deposit.tenant?.full_name ?? "Unknown tenant"} · Room ${deposit.room?.room_number ?? "Unknown"} · ${money(deposit.cash_available)} available`;
}

export default function SecurityDepositsConsole({ data }: { data: SecurityDepositPageData }) {
    const router = useRouter();
    const [query, setQuery] = useState("");
    const [sourceQuery, setSourceQuery] = useState("");
    const [selectedDepositId, setSelectedDepositId] = useState(data.deposits[0]?.id ?? "");
    const [usageAmount, setUsageAmount] = useState("");
    const [usageReason, setUsageReason] = useState("");
    const [usageReference, setUsageReference] = useState("");
    const [usageNotes, setUsageNotes] = useState("");
    const [expectedReplacementDate, setExpectedReplacementDate] = useState("");
    const [message, setMessage] = useState<string | null>(null);
    const [restoreAmount, setRestoreAmount] = useState("");
    const [restoreReference, setRestoreReference] = useState("");
    const [confirmUsage, setConfirmUsage] = useState(false);
    const [viewDeposit, setViewDeposit] = useState<SecurityDepositRegisterRow | null>(null);
    const [insightOffset, setInsightOffset] = useState(0);
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        const timer = window.setInterval(() => setInsightOffset((current) => current + 1), 180000);
        return () => window.clearInterval(timer);
    }, []);

    const filteredDeposits = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (!needle) return data.deposits;
        return data.deposits.filter((deposit) => matchesDeposit(deposit, needle));
    }, [data.deposits, query]);

    const sourceDeposits = useMemo(() => {
        const needle = sourceQuery.trim().toLowerCase();
        const rows = needle ? data.deposits.filter((deposit) => matchesDeposit(deposit, needle)) : data.deposits;
        return rows
            .filter((deposit) => amount(deposit.cash_available) > 0)
            .sort((a, b) => amount(b.company_shortfall) - amount(a.company_shortfall) || amount(b.cash_available) - amount(a.cash_available))
            .slice(0, 10);
    }, [data.deposits, sourceQuery]);

    const selectedDeposit = data.deposits.find((deposit) => deposit.id === selectedDepositId) ?? sourceDeposits[0] ?? data.deposits[0] ?? null;
    const selectedCashAvailable = amount(selectedDeposit?.cash_available);
    const selectedLiability = amount(selectedDeposit?.liability_balance);
    const selectedAlreadyUsed = amount(selectedDeposit?.amount_used_by_company) - amount(selectedDeposit?.amount_restored_by_company);
    const usageValue = Number(usageAmount);
    const safeUsageAmount = Number.isFinite(usageValue) ? Math.max(0, usageValue) : 0;
    const projectedAvailable = Math.max(0, selectedCashAvailable - safeUsageAmount);
    const projectedShortfall = Math.max(0, selectedLiability - projectedAvailable);
    const canUseSecurityFunds =
        data.isAdmin &&
        Boolean(selectedDeposit) &&
        safeUsageAmount > 0 &&
        safeUsageAmount <= selectedCashAvailable &&
        Boolean(usageReason.trim()) &&
        !isPending;

    const insights = useMemo(() => buildInsights(data.deposits, data.summary), [data.deposits, data.summary]);
    const visibleInsights = useMemo(() => rotateInsights(insights, insightOffset, 4), [insights, insightOffset]);
    const urgentInsight = insights[0] ?? {
        action: "View register",
        amount: data.summary.totalHeld,
        office: "All offices",
        reason: "Security liability register is balanced with current data.",
        title: "Security fund position is stable",
        tone: "emerald" as const,
    };

    function requestUseFunds() {
        if (!selectedDeposit) {
            setMessage("Select a security deposit first.");
            return;
        }
        if (!Number.isFinite(safeUsageAmount) || safeUsageAmount <= 0) {
            setMessage("Enter the security amount Admin is using.");
            return;
        }
        if (safeUsageAmount > selectedCashAvailable) {
            setMessage("The amount used cannot be greater than available security cash for this deposit.");
            return;
        }
        if (!usageReason.trim()) {
            setMessage("Reason is required when Admin uses tenant security money.");
            return;
        }
        setMessage(null);
        setConfirmUsage(true);
    }

    function confirmUseFunds() {
        if (!selectedDeposit || !canUseSecurityFunds) return;
        startTransition(async () => {
            try {
                setMessage(null);
                await useSecurityFunds({
                    amount: safeUsageAmount,
                    depositId: selectedDeposit.id,
                    expectedReplacementDate: expectedReplacementDate || null,
                    notes: [usageReference ? `Reference: ${usageReference}` : null, usageNotes.trim() || null].filter(Boolean).join("\n") || null,
                    reason: usageReason.trim(),
                    usageDate: new Date().toISOString().slice(0, 10),
                });
                setMessage("Security fund usage recorded. Tenant liability remains unchanged.");
                setUsageAmount("");
                setUsageReason("");
                setUsageReference("");
                setUsageNotes("");
                setExpectedReplacementDate("");
                setConfirmUsage(false);
                router.refresh();
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Security funds could not be used.");
            }
        });
    }

    function submitRestoreFunds() {
        if (!selectedDeposit) {
            setMessage("Select a security deposit first.");
            return;
        }
        const amountToRestore = Number(restoreAmount);
        if (!Number.isFinite(amountToRestore) || amountToRestore <= 0) {
            setMessage("Enter the security amount restored.");
            return;
        }
        startTransition(async () => {
            try {
                setMessage(null);
                await restoreSecurityFunds({
                    amount: amountToRestore,
                    depositId: selectedDeposit.id,
                    notes: "Security money restored from Admin/company usage.",
                    referenceNumber: restoreReference || null,
                    restoreDate: new Date().toISOString().slice(0, 10),
                });
                setMessage("Security funds restored. Cash available and shortfall were updated.");
                setRestoreAmount("");
                setRestoreReference("");
                router.refresh();
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Security funds could not be restored.");
            }
        });
    }

    function openReceiptWindow(deposit: SecurityDepositRegisterRow) {
        const receiptHtml = buildSecurityReceiptHtml(deposit);
        const printWindow = window.open("", "security-deposit-receipt", "width=420,height=780");
        if (!printWindow) {
            setMessage("Receipt popup was blocked. Allow popups for Ddumba OS and try again.");
            return;
        }
        printWindow.document.open();
        printWindow.document.write(receiptHtml);
        printWindow.document.close();
        printWindow.focus();
        printWindow.print();
    }

    function downloadSecurityReceipt(deposit: SecurityDepositRegisterRow) {
        const receiptHtml = buildSecurityReceiptHtml(deposit);
        const blob = new Blob([receiptHtml], { type: "text/html;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${deposit.receipt_number || "security-receipt"}.html`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        setMessage("Security receipt downloaded from the saved deposit record.");
    }

    return (
        <main className="min-h-screen bg-[#eef3f8] px-3 py-4 text-slate-950 sm:px-5 lg:px-8">
            <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
                <section className="overflow-hidden rounded-[28px] border border-slate-800 bg-slate-950 text-white shadow-2xl">
                    <div className="grid gap-5 bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.24),transparent_34%),linear-gradient(135deg,#020617,#0f172a_48%,#064e3b)] p-5 lg:grid-cols-[1.2fr_0.8fr] lg:p-7">
                        <div>
                            <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-wide text-emerald-100">
                                <Vault size={14} />
                                Security Fund Overview
                            </p>
                            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Security Deposits</h1>
                            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-200">
                                Monitor refundable tenant security money as a protected liability, separate from rent, revenue, landlord settlement and tenant advance rent.
                            </p>
                            <SecurityLiabilityBadge summary={data.summary} />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <HeroMetric label="Records" value={data.summary.totalRecords.toLocaleString("en-UG")} helper="Live register rows" icon={FileText} />
                            <HeroMetric label="Mode" value={data.isAdmin ? "Admin" : "Office"} helper="Permission scoped" icon={ShieldCheck} />
                            <HeroMetric label="Refresh" value="Live" helper="Supabase-backed data" icon={RefreshCw} />
                            <HeroMetric label="Risk" value={data.summary.totalShortfall > 0 ? "Review" : "Balanced"} helper="Shortfall monitor" icon={Gauge} danger={data.summary.totalShortfall > 0} />
                        </div>
                    </div>
                </section>

                {data.warnings.length ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                        {data.warnings.join(" ")}
                    </div>
                ) : null}

                <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                    <ExecutiveCard title="Total Security Liability" amount={data.summary.totalHeld} icon={ShieldCheck} tone="slate" helper="Amount legally owed to tenants." action="Open register" />
                    <ExecutiveCard title="Cash Available" amount={data.summary.totalAvailable} icon={WalletCards} tone="emerald" helper="Security cash still physically available." action="Review cash" />
                    <ExecutiveCard title="Used By Company" amount={data.summary.totalUsedByCompany} icon={Banknote} tone="amber" helper="Temporarily used, still owed to tenants." action="Restore funds" />
                    <ExecutiveCard title="Security Shortfall" amount={data.summary.totalShortfall} icon={ShieldAlert} tone={data.summary.totalShortfall > 0 ? "rose" : "emerald"} helper="Liability not currently covered by cash." action="Reconcile" />
                    <ExecutiveCard title="Pending Refunds" amount={data.summary.totalPendingRefunds} icon={CalendarClock} tone="blue" helper="Refund liabilities waiting for payout." action="Start refund" />
                    <ExecutiveCard title="Pending Settlements" amount={data.summary.totalPendingSettlement} icon={Landmark} tone="violet" helper="Security decisions still awaiting closure." action="View reports" />
                </section>

                <section className="grid gap-4 xl:grid-cols-[1fr_420px]">
                    <div className="space-y-4">
                        <AiSecurityIntelligence summary={data.summary} urgentInsight={urgentInsight} insights={visibleInsights} />
                        <DepositRegister deposits={filteredDeposits} query={query} setQuery={setQuery} selectedDepositId={selectedDepositId} setSelectedDepositId={setSelectedDepositId} />
                    </div>

                    <aside className="space-y-4">
                        <AdminUseSecurityFunds
                            canUseSecurityFunds={canUseSecurityFunds}
                            data={data}
                            expectedReplacementDate={expectedReplacementDate}
                            isPending={isPending}
                            message={message}
                            projectedAvailable={projectedAvailable}
                            projectedShortfall={projectedShortfall}
                            requestUseFunds={requestUseFunds}
                            restoreAmount={restoreAmount}
                            restoreReference={restoreReference}
                            selectedAlreadyUsed={selectedAlreadyUsed}
                            selectedDeposit={selectedDeposit}
                            selectedDepositId={selectedDepositId}
                            selectedLiability={selectedLiability}
                            setExpectedReplacementDate={setExpectedReplacementDate}
                            setRestoreAmount={setRestoreAmount}
                            setRestoreReference={setRestoreReference}
                            setSelectedDepositId={setSelectedDepositId}
                            setSourceQuery={setSourceQuery}
                            setUsageAmount={setUsageAmount}
                            setUsageNotes={setUsageNotes}
                            setUsageReason={setUsageReason}
                            setUsageReference={setUsageReference}
                            sourceDeposits={sourceDeposits}
                            sourceQuery={sourceQuery}
                            submitRestoreFunds={submitRestoreFunds}
                            usageAmount={usageAmount}
                            usageNotes={usageNotes}
                            usageReason={usageReason}
                            usageReference={usageReference}
                        />
                        <RefundsAndReports deposits={data.deposits} />
                        <SelectedDepositActions
                            deposit={selectedDeposit}
                            onDownload={downloadSecurityReceipt}
                            onPrint={openReceiptWindow}
                            onView={setViewDeposit}
                            setMessage={setMessage}
                        />
                    </aside>
                </section>

                <SecurityActivityTimeline deposits={data.deposits} />
            </div>

            {confirmUsage && selectedDeposit ? (
                <ConfirmationDialog
                    isPending={isPending}
                    onCancel={() => setConfirmUsage(false)}
                    onConfirm={confirmUseFunds}
                    projectedAvailable={projectedAvailable}
                    projectedShortfall={projectedShortfall}
                    selectedDeposit={selectedDeposit}
                    usageAmount={safeUsageAmount}
                    usageReason={usageReason}
                    expectedReplacementDate={expectedReplacementDate}
                />
            ) : null}
            {viewDeposit ? <DepositDetailsDialog deposit={viewDeposit} onClose={() => setViewDeposit(null)} onDownload={downloadSecurityReceipt} onPrint={openReceiptWindow} /> : null}
        </main>
    );
}

function matchesDeposit(deposit: SecurityDepositRegisterRow, needle: string) {
    return [
        deposit.receipt_number,
        deposit.tenant?.full_name,
        deposit.tenant?.phone,
        deposit.room?.room_number,
        deposit.landlord?.full_name,
        deposit.office?.office_name,
        deposit.office?.name,
        deposit.reference_number,
        deposit.status,
    ].some((value) => String(value ?? "").toLowerCase().includes(needle));
}

function buildInsights(deposits: SecurityDepositRegisterRow[], summary: SecurityDepositPageData["summary"]) {
    const today = new Date();
    const shortfallRows = deposits.filter((deposit) => amount(deposit.company_shortfall) > 0);
    const usedRows = deposits.filter((deposit) => amount(deposit.amount_used_by_company) - amount(deposit.amount_restored_by_company) > 0);
    const pendingRows = deposits.filter((deposit) => String(deposit.status).includes("pending"));
    const missingReferenceRows = deposits.filter((deposit) => !deposit.reference_number && !deposit.receipt_number);
    const unlinkedRows = deposits.filter((deposit) => !deposit.room_id || !deposit.tenant_id);

    const insights = [
        summary.totalShortfall > 0
            ? {
                  action: "Reconcile now",
                  amount: summary.totalShortfall,
                  office: "All offices",
                  reason: "Security liability exceeds cash available. Restore used funds or complete pending settlements.",
                  title: "Security shortfall requires attention",
                  tone: "rose" as const,
              }
            : null,
        usedRows.length
            ? {
                  action: "Record replacement",
                  amount: usedRows.reduce((total, deposit) => total + Math.max(0, amount(deposit.amount_used_by_company) - amount(deposit.amount_restored_by_company)), 0),
                  office: "Company security pool",
                  reason: `${usedRows.length} deposits have company usage outstanding.`,
                  title: "Company-used security needs replacement tracking",
                  tone: "amber" as const,
              }
            : null,
        pendingRows.length
            ? {
                  action: "Start refund",
                  amount: pendingRows.reduce((total, deposit) => total + amount(deposit.liability_balance), 0),
                  office: "Settlement queue",
                  reason: `${pendingRows.length} security deposits are pending refund or settlement decision.`,
                  title: "Pending security settlements",
                  tone: "blue" as const,
              }
            : null,
        unlinkedRows.length
            ? {
                  action: "Review deposit",
                  amount: unlinkedRows.reduce((total, deposit) => total + amount(deposit.liability_balance), 0),
                  office: "Data quality",
                  reason: `${unlinkedRows.length} deposits are missing a tenant or room link.`,
                  title: "Deposits need relationship review",
                  tone: "violet" as const,
              }
            : null,
        missingReferenceRows.length
            ? {
                  action: "Add reference",
                  amount: missingReferenceRows.reduce((total, deposit) => total + amount(deposit.liability_balance), 0),
                  office: "Audit readiness",
                  reason: `${missingReferenceRows.length} deposits have no receipt or external reference.`,
                  title: "Security records missing references",
                  tone: "slate" as const,
              }
            : null,
        {
            action: "View register",
            amount: summary.totalAvailable,
            office: "Live Supabase",
            reason: `Register refreshed ${today.toLocaleTimeString("en-UG", { hour: "2-digit", minute: "2-digit" })}. ${deposits.length} records are loaded in this view.`,
            title: "Security cash visibility is active",
            tone: "emerald" as const,
        },
    ].filter(Boolean);

    return insights as Array<{ action: string; amount: number; office: string; reason: string; title: string; tone: "rose" | "amber" | "blue" | "violet" | "slate" | "emerald" }>;
}

function rotateInsights<T>(items: T[], offset: number, count: number) {
    if (items.length <= count) return items;
    return Array.from({ length: count }, (_, index) => items[(offset + index) % items.length]);
}

function SecurityLiabilityBadge({ summary }: { summary: SecurityDepositPageData["summary"] }) {
    const shortfallActive = summary.totalShortfall > 0;
    const items = [
        { label: "Held", value: summary.totalHeld, tone: "text-white" },
        { label: "Available", value: summary.totalAvailable, tone: "text-emerald-100" },
        { label: "Used by Company", value: summary.totalUsedByCompany, tone: "text-amber-100" },
        { label: "Pending Refunds", value: summary.totalPendingRefunds, tone: "text-cyan-100" },
        { label: "Shortfall", value: summary.totalShortfall, tone: shortfallActive ? "text-rose-200" : "text-emerald-100" },
    ];
    return (
        <div className={`mt-5 rounded-3xl border p-3 shadow-2xl backdrop-blur ${shortfallActive ? "border-rose-300/40 bg-rose-950/35" : "border-white/10 bg-white/10"}`}>
            <div className="flex flex-wrap items-center gap-2">
                {items.map((item) => (
                    <div key={item.label} className="min-w-[145px] flex-1 rounded-2xl border border-white/10 bg-slate-950/35 px-3 py-2">
                        <p className="text-[10px] font-black uppercase tracking-wide text-slate-300">{item.label}</p>
                        <p className={`mt-1 text-sm font-black tabular-nums ${item.tone}`}>{money(item.value)}</p>
                    </div>
                ))}
            </div>
            <p className={`mt-2 text-xs font-bold ${shortfallActive ? "text-rose-100" : "text-emerald-100"}`}>
                {shortfallActive
                    ? "Security shortfall is active. Company has temporarily used tenant-held money and must restore it."
                    : "Security pool is balanced against recorded tenant liability."}
            </p>
        </div>
    );
}

function HeroMetric({ danger, helper, icon: Icon, label, value }: { danger?: boolean; helper: string; icon: LucideIcon; label: string; value: string }) {
    return (
        <div className={`rounded-3xl border px-4 py-3 ${danger ? "border-rose-300/30 bg-rose-500/10" : "border-white/10 bg-white/10"}`}>
            <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-black uppercase tracking-wide text-slate-300">{label}</p>
                <Icon size={16} className={danger ? "text-rose-200" : "text-emerald-200"} />
            </div>
            <p className="mt-2 text-xl font-black">{value}</p>
            <p className="text-xs font-bold text-slate-300">{helper}</p>
        </div>
    );
}

function ExecutiveCard({
    action,
    amount: value,
    helper,
    icon: Icon,
    title,
    tone,
}: {
    action: string;
    amount: number;
    helper: string;
    icon: LucideIcon;
    title: string;
    tone: "slate" | "emerald" | "amber" | "rose" | "blue" | "violet";
}) {
    const toneClass = {
        amber: "border-amber-200 bg-amber-50 text-amber-900",
        blue: "border-blue-200 bg-blue-50 text-blue-900",
        emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
        rose: "border-rose-200 bg-rose-50 text-rose-900",
        slate: "border-slate-200 bg-white text-slate-900",
        violet: "border-violet-200 bg-violet-50 text-violet-900",
    }[tone];
    return (
        <button type="button" className={`group min-h-[148px] rounded-[22px] border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${toneClass}`}>
            <div className="flex items-start justify-between gap-3">
                <Icon size={20} />
                <ArrowUpRight size={16} className="opacity-50 transition group-hover:opacity-100" />
            </div>
            <p className="mt-3 text-[11px] font-black uppercase tracking-wide opacity-80">{title}</p>
            <p className="mt-1 text-xl font-black tabular-nums">{money(value)}</p>
            <p className="mt-2 text-xs font-bold leading-5 opacity-75">{helper}</p>
            <p className="mt-3 text-xs font-black uppercase tracking-wide opacity-80">{action}</p>
        </button>
    );
}

function AiSecurityIntelligence({
    insights,
    summary,
    urgentInsight,
}: {
    insights: ReturnType<typeof buildInsights>;
    summary: SecurityDepositPageData["summary"];
    urgentInsight: ReturnType<typeof buildInsights>[number];
}) {
    const riskLevel = summary.totalShortfall > 0 ? "High attention" : summary.totalUsedByCompany > 0 ? "Managed watch" : "Stable";
    return (
        <section className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
            <div className="rounded-[24px] border border-emerald-200 bg-gradient-to-br from-emerald-950 via-slate-950 to-cyan-950 p-4 text-white shadow-xl">
                <div className="flex items-center gap-2">
                    <Sparkles size={18} className="text-emerald-200" />
                    <h2 className="text-lg font-black">AI Security Intelligence</h2>
                </div>
                <p className="mt-3 text-2xl font-black leading-tight">
                    {summary.totalUsedByCompany > 0
                        ? `${money(summary.totalUsedByCompany)} of tenant security is currently used by the company.`
                        : "Tenant security funds are currently held without company usage pressure."}
                </p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <MiniStat label="Risk level" value={riskLevel} />
                    <MiniStat label="Most urgent issue" value={urgentInsight.title} />
                    <MiniStat label="Next action" value={urgentInsight.action} />
                    <MiniStat label="Last refreshed" value={new Date().toLocaleTimeString("en-UG", { hour: "2-digit", minute: "2-digit" })} />
                </div>
                <p className="mt-4 rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-bold text-emerald-50">
                    Confidence: Live register scan from current Supabase summary and loaded security records.
                </p>
            </div>
            <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-black">Rotating Intelligence Feed</h2>
                        <p className="text-sm font-semibold text-slate-500">Limited server-backed sample. Updates only this panel, not the full page.</p>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">Live</span>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {insights.map((insight) => (
                        <InsightCard key={`${insight.title}-${insight.office}`} insight={insight} />
                    ))}
                </div>
            </div>
        </section>
    );
}

function MiniStat({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2">
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-300">{label}</p>
            <p className="mt-1 line-clamp-2 text-sm font-black text-white">{value}</p>
        </div>
    );
}

function InsightCard({ insight }: { insight: ReturnType<typeof buildInsights>[number] }) {
    const toneClass = {
        amber: "border-amber-200 bg-amber-50 text-amber-900",
        blue: "border-blue-200 bg-blue-50 text-blue-900",
        emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
        rose: "border-rose-200 bg-rose-50 text-rose-900",
        slate: "border-slate-200 bg-slate-50 text-slate-900",
        violet: "border-violet-200 bg-violet-50 text-violet-900",
    }[insight.tone];
    return (
        <div className={`rounded-2xl border p-3 ${toneClass}`}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-sm font-black">{insight.title}</p>
                    <p className="mt-1 text-xs font-bold leading-5 opacity-80">{insight.reason}</p>
                </div>
                <p className="shrink-0 text-right text-sm font-black tabular-nums">{money(insight.amount)}</p>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-xs font-black uppercase tracking-wide opacity-70">{insight.office}</p>
                <button type="button" className="rounded-full bg-white/70 px-3 py-1 text-xs font-black shadow-sm">
                    {insight.action}
                </button>
            </div>
        </div>
    );
}

function DepositRegister({
    deposits,
    query,
    selectedDepositId,
    setQuery,
    setSelectedDepositId,
}: {
    deposits: SecurityDepositRegisterRow[];
    query: string;
    selectedDepositId: string;
    setQuery: (value: string) => void;
    setSelectedDepositId: (value: string) => void;
}) {
    return (
        <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h2 className="text-lg font-black">Deposit Register</h2>
                    <p className="text-sm font-semibold text-slate-500">{deposits.length} live records shown. Search tenant, room, phone, office, receipt or reference.</p>
                </div>
                <label className="relative block w-full md:w-96">
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search deposits..."
                        className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm font-bold outline-none focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                    />
                </label>
            </div>

            <div className="mt-4 grid gap-2 lg:hidden">
                {deposits.slice(0, 80).map((deposit) => (
                    <button
                        type="button"
                        key={deposit.id}
                        onClick={() => setSelectedDepositId(deposit.id)}
                        className={`rounded-2xl border p-3 text-left ${selectedDepositId === deposit.id ? "border-emerald-400 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}
                    >
                        <p className="font-black">{deposit.tenant?.full_name ?? "Unknown tenant"}</p>
                        <p className="text-xs font-bold text-slate-500">Room {deposit.room?.room_number ?? "Unknown"} · {deposit.office?.office_name ?? deposit.office?.name ?? "No office"}</p>
                        <div className="mt-2 flex items-center justify-between gap-3 text-sm font-black">
                            <span>{money(deposit.liability_balance)}</span>
                            <span className="text-emerald-700">{money(deposit.cash_available)}</span>
                        </div>
                    </button>
                ))}
            </div>

            <div className="mt-4 hidden overflow-x-auto lg:block">
                <table className="min-w-full border-separate border-spacing-y-2 text-left text-sm">
                    <thead className="text-xs font-black uppercase text-slate-500">
                        <tr>
                            <th className="px-3 py-2">Tenant / Room</th>
                            <th className="px-3 py-2">Office</th>
                            <th className="px-3 py-2 text-right">Liability</th>
                            <th className="px-3 py-2 text-right">Available</th>
                            <th className="px-3 py-2 text-right">Used</th>
                            <th className="px-3 py-2">Status</th>
                            <th className="px-3 py-2">Receipt</th>
                        </tr>
                    </thead>
                    <tbody>
                        {deposits.slice(0, 120).map((deposit) => (
                            <tr
                                key={deposit.id}
                                onClick={() => setSelectedDepositId(deposit.id)}
                                className={`cursor-pointer rounded-2xl align-top shadow-sm transition hover:bg-emerald-50 ${selectedDepositId === deposit.id ? "bg-emerald-50 ring-2 ring-emerald-300" : "bg-slate-50"}`}
                            >
                                <td className="rounded-l-2xl px-3 py-3">
                                    <p className="font-black">{deposit.tenant?.full_name ?? "Unknown tenant"}</p>
                                    <p className="text-xs font-bold text-slate-500">Room {deposit.room?.room_number ?? "Unknown"} · {deposit.landlord?.full_name ?? "No landlord"}</p>
                                </td>
                                <td className="px-3 py-3 font-bold text-slate-700">{deposit.office?.office_name ?? deposit.office?.name ?? "No office"}</td>
                                <td className="px-3 py-3 text-right font-black tabular-nums">{money(deposit.liability_balance)}</td>
                                <td className="px-3 py-3 text-right font-black tabular-nums text-emerald-700">{money(deposit.cash_available)}</td>
                                <td className="px-3 py-3 text-right font-black tabular-nums text-amber-700">{money(Math.max(0, amount(deposit.amount_used_by_company) - amount(deposit.amount_restored_by_company)))}</td>
                                <td className="px-3 py-3">
                                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">{prettyStatus(deposit.status)}</span>
                                </td>
                                <td className="rounded-r-2xl px-3 py-3">
                                    <p className="font-mono text-xs font-black">{deposit.receipt_number}</p>
                                    <p className="text-xs font-bold text-slate-500">{dateLabel(deposit.date_received)}</p>
                                </td>
                            </tr>
                        ))}
                        {!deposits.length ? (
                            <tr>
                                <td colSpan={7} className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm font-bold text-slate-500">
                                    No security deposit records match this search.
                                </td>
                            </tr>
                        ) : null}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

function AdminUseSecurityFunds({
    canUseSecurityFunds,
    data,
    expectedReplacementDate,
    isPending,
    message,
    projectedAvailable,
    projectedShortfall,
    requestUseFunds,
    restoreAmount,
    restoreReference,
    selectedAlreadyUsed,
    selectedDeposit,
    selectedDepositId,
    selectedLiability,
    setExpectedReplacementDate,
    setRestoreAmount,
    setRestoreReference,
    setSelectedDepositId,
    setSourceQuery,
    setUsageAmount,
    setUsageNotes,
    setUsageReason,
    setUsageReference,
    sourceDeposits,
    sourceQuery,
    submitRestoreFunds,
    usageAmount,
    usageNotes,
    usageReason,
    usageReference,
}: {
    canUseSecurityFunds: boolean;
    data: SecurityDepositPageData;
    expectedReplacementDate: string;
    isPending: boolean;
    message: string | null;
    projectedAvailable: number;
    projectedShortfall: number;
    requestUseFunds: () => void;
    restoreAmount: string;
    restoreReference: string;
    selectedAlreadyUsed: number;
    selectedDeposit: SecurityDepositRegisterRow | null;
    selectedDepositId: string;
    selectedLiability: number;
    setExpectedReplacementDate: (value: string) => void;
    setRestoreAmount: (value: string) => void;
    setRestoreReference: (value: string) => void;
    setSelectedDepositId: (value: string) => void;
    setSourceQuery: (value: string) => void;
    setUsageAmount: (value: string) => void;
    setUsageNotes: (value: string) => void;
    setUsageReason: (value: string) => void;
    setUsageReference: (value: string) => void;
    sourceDeposits: SecurityDepositRegisterRow[];
    sourceQuery: string;
    submitRestoreFunds: () => void;
    usageAmount: string;
    usageNotes: string;
    usageReason: string;
    usageReference: string;
}) {
    return (
        <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-white">
                        <ShieldAlert size={13} />
                        Admin Use Security Funds
                    </p>
                    <h2 className="mt-3 text-lg font-black">Controlled Security Cash Usage</h2>
                    <p className="mt-1 text-sm font-semibold text-slate-500">
                        Cash can be used temporarily, but tenant liability remains intact until refund, retention or approved settlement.
                    </p>
                </div>
            </div>

            <div className="mt-4 grid gap-4 2xl:grid-cols-[1.2fr_0.8fr]">
                <div className="space-y-3">
                    <label className="block">
                        <span className="text-xs font-black uppercase text-slate-500">Source Deposit Search</span>
                        <div className="relative mt-1">
                            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                                value={sourceQuery}
                                onChange={(event) => setSourceQuery(event.target.value)}
                                disabled={!data.isAdmin || isPending}
                                placeholder="Tenant, room, phone, office, receipt..."
                                className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm font-bold outline-none focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100 disabled:opacity-60"
                            />
                        </div>
                    </label>

                    <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
                        {sourceDeposits.map((deposit) => (
                            <button
                                type="button"
                                key={deposit.id}
                                onClick={() => setSelectedDepositId(deposit.id)}
                                disabled={!data.isAdmin || isPending}
                                className={`w-full rounded-2xl border p-3 text-left transition ${selectedDepositId === deposit.id ? "border-emerald-400 bg-emerald-50 shadow-sm" : "border-slate-200 bg-slate-50 hover:border-emerald-200"}`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-black">{deposit.tenant?.full_name ?? "Unknown tenant"}</p>
                                        <p className="text-xs font-bold text-slate-500">Room {deposit.room?.room_number ?? "Unknown"} · {deposit.office?.office_name ?? deposit.office?.name ?? "No office"}</p>
                                    </div>
                                    <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black uppercase text-slate-600">{prettyStatus(deposit.status)}</span>
                                </div>
                                <div className="mt-2 grid grid-cols-3 gap-2 text-xs font-black">
                                    <span>Original<br />{money(deposit.amount)}</span>
                                    <span className="text-emerald-700">Available<br />{money(deposit.cash_available)}</span>
                                    <span className="text-amber-700">Used<br />{money(Math.max(0, amount(deposit.amount_used_by_company) - amount(deposit.amount_restored_by_company)))}</span>
                                </div>
                            </button>
                        ))}
                        {!sourceDeposits.length ? <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-bold text-slate-500">No available security cash matches this search.</p> : null}
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                        <Field label="Amount Used" type="number" value={usageAmount} onChange={setUsageAmount} disabled={!data.isAdmin || isPending} />
                        <Field label="Expected Replacement Date" type="date" value={expectedReplacementDate} onChange={setExpectedReplacementDate} disabled={!data.isAdmin || isPending} />
                        <Field label="Reference" value={usageReference} onChange={setUsageReference} disabled={!data.isAdmin || isPending} />
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                        <TextareaField label="Reason" value={usageReason} onChange={setUsageReason} disabled={!data.isAdmin || isPending} placeholder="Required" />
                        <TextareaField label="Notes" value={usageNotes} onChange={setUsageNotes} disabled={!data.isAdmin || isPending} placeholder="Optional operational context" />
                    </div>
                    <button
                        type="button"
                        onClick={requestUseFunds}
                        disabled={!canUseSecurityFunds}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-lg transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {isPending ? <Loader2 className="animate-spin" size={16} /> : <ShieldCheck size={16} />}
                        {isPending ? "Preparing usage..." : "Preview and Confirm Usage"}
                    </button>
                </div>

                <LiveReconciliationPanel
                    projectedAvailable={projectedAvailable}
                    projectedShortfall={projectedShortfall}
                    selectedAlreadyUsed={selectedAlreadyUsed}
                    selectedDeposit={selectedDeposit}
                    selectedLiability={selectedLiability}
                    usageAmount={usageAmount}
                    expectedReplacementDate={expectedReplacementDate}
                />
            </div>

            <div className="mt-4 rounded-3xl border border-emerald-100 bg-emerald-50 p-3">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <p className="text-xs font-black uppercase text-emerald-700">Restore Used Security</p>
                        <p className="text-xs font-bold text-emerald-900">Record company replacement into the selected deposit’s security cash pool.</p>
                    </div>
                    <RefreshCw size={18} className="text-emerald-700" />
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Field label="Amount Restored" type="number" value={restoreAmount} onChange={setRestoreAmount} disabled={!data.isAdmin || isPending} />
                    <Field label="Reference" value={restoreReference} onChange={setRestoreReference} disabled={!data.isAdmin || isPending} />
                </div>
                <button
                    type="button"
                    onClick={submitRestoreFunds}
                    disabled={!data.isAdmin || isPending || !selectedDeposit}
                    className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-4 py-3 text-sm font-black text-white shadow-lg transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {isPending ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                    {isPending ? "Restoring..." : "Restore Security Funds"}
                </button>
            </div>

            {!data.isAdmin ? (
                <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                    Office accounts can view and record deposits from Payments Entry. Admin approval is required for fund usage and settlement exceptions.
                </p>
            ) : null}
            {message ? <p className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-black text-slate-700">{message}</p> : null}
        </section>
    );
}

function LiveReconciliationPanel({
    expectedReplacementDate,
    projectedAvailable,
    projectedShortfall,
    selectedAlreadyUsed,
    selectedDeposit,
    selectedLiability,
    usageAmount,
}: {
    expectedReplacementDate: string;
    projectedAvailable: number;
    projectedShortfall: number;
    selectedAlreadyUsed: number;
    selectedDeposit: SecurityDepositRegisterRow | null;
    selectedLiability: number;
    usageAmount: string;
}) {
    const usingAmount = amount(usageAmount);
    return (
        <div className="rounded-[22px] border border-slate-200 bg-slate-950 p-4 text-white shadow-xl">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <p className="text-xs font-black uppercase tracking-wide text-emerald-200">Live Reconciliation</p>
                    <h3 className="mt-1 text-lg font-black">{selectedDeposit?.tenant?.full_name ?? "No tenant selected"}</h3>
                </div>
                <WalletCards size={20} className="text-emerald-200" />
            </div>
            <div className="mt-4 grid gap-2">
                <ReconRow label="Room" value={selectedDeposit?.room?.room_number ? `Room ${selectedDeposit.room.room_number}` : "Not linked"} />
                <ReconRow label="Office" value={selectedDeposit?.office?.office_name ?? selectedDeposit?.office?.name ?? "No office"} />
                <ReconRow label="Original deposit" value={money(selectedDeposit?.amount)} />
                <ReconRow label="Already used" value={money(Math.max(0, selectedAlreadyUsed))} tone="amber" />
                <ReconRow label="Available cash" value={money(selectedDeposit?.cash_available)} tone="emerald" />
                <ReconRow label="Amount being used" value={money(usingAmount)} tone={usingAmount > 0 ? "amber" : "slate"} />
                <ReconRow label="Liability owed to tenant" value={money(selectedLiability)} />
                <ReconRow label="Projected cash after usage" value={money(projectedAvailable)} tone="emerald" />
                <ReconRow label="Projected shortfall" value={money(projectedShortfall)} tone={projectedShortfall > 0 ? "rose" : "emerald"} />
                <ReconRow label="Replacement date" value={dateLabel(expectedReplacementDate)} />
            </div>
            <p className="mt-4 rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-bold text-slate-200">
                This preview does not reduce tenant liability. It only shows the cash movement impact before Admin confirms.
            </p>
        </div>
    );
}

function ReconRow({ label, tone = "slate", value }: { label: string; tone?: "slate" | "emerald" | "amber" | "rose"; value: string }) {
    const color = {
        amber: "text-amber-200",
        emerald: "text-emerald-200",
        rose: "text-rose-200",
        slate: "text-white",
    }[tone];
    return (
        <div className="grid grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm">
            <span className="min-w-0 text-xs font-black uppercase tracking-wide text-slate-300">{label}</span>
            <span className={`min-w-0 text-right font-black tabular-nums ${color}`}>{value}</span>
        </div>
    );
}

function RefundsAndReports({ deposits }: { deposits: SecurityDepositRegisterRow[] }) {
    const pendingRefunds = deposits.filter((deposit) => String(deposit.status).includes("pending"));
    const refunded = deposits.filter((deposit) => amount(deposit.amount_refunded) > 0);
    const retained = deposits.filter((deposit) => amount(deposit.amount_retained) + amount(deposit.amount_applied_to_charges) > 0);
    return (
        <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-black">Refunds and Settlements</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
                <StatusTile icon={CalendarDays} label="Pending Refunds" value={pendingRefunds.length.toString()} helper={money(pendingRefunds.reduce((total, row) => total + amount(row.liability_balance), 0))} tone="blue" />
                <StatusTile icon={CheckCircle2} label="Refunded" value={refunded.length.toString()} helper={money(refunded.reduce((total, row) => total + amount(row.amount_refunded), 0))} tone="emerald" />
                <StatusTile icon={Landmark} label="Retained / Applied" value={retained.length.toString()} helper={money(retained.reduce((total, row) => total + amount(row.amount_retained) + amount(row.amount_applied_to_charges), 0))} tone="violet" />
            </div>
            <div className="mt-4 grid gap-2">
                {["Security Deposit Register", "Security Usage Report", "Security Refund Report", "Security Shortfall Report", "Tenant Security Statement"].map((label) => (
                    <button key={label} type="button" className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 text-left text-sm font-black text-slate-700 transition hover:border-emerald-200 hover:bg-emerald-50">
                        <span className="inline-flex items-center gap-3">
                            <FileText size={16} className="text-emerald-700" />
                            {label}
                        </span>
                        <ArrowUpRight size={14} />
                    </button>
                ))}
            </div>
        </section>
    );
}

function SelectedDepositActions({
    deposit,
    onDownload,
    onPrint,
    onView,
    setMessage,
}: {
    deposit: SecurityDepositRegisterRow | null;
    onDownload: (deposit: SecurityDepositRegisterRow) => void;
    onPrint: (deposit: SecurityDepositRegisterRow) => void;
    onView: (deposit: SecurityDepositRegisterRow) => void;
    setMessage: (message: string) => void;
}) {
    const disabled = !deposit;
    const tenantHref = deposit?.tenant_id ? `/office/payments?tenant=${encodeURIComponent(deposit.tenant_id)}` : "/office/payments";
    const roomHref = deposit?.room?.room_number ? `/office/properties?room=${encodeURIComponent(deposit.room.room_number)}` : "/office/properties";
    return (
        <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h2 className="text-lg font-black">Deposit Actions</h2>
                    <p className="mt-1 text-sm font-semibold text-slate-500">Actions use the selected saved deposit only.</p>
                </div>
                <ShieldCheck size={18} className="text-emerald-700" />
            </div>
            <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 p-3">
                <p className="text-sm font-black">{deposit?.tenant?.full_name ?? "No deposit selected"}</p>
                <p className="text-xs font-bold text-slate-500">
                    Room {deposit?.room?.room_number ?? "-"} · {deposit?.receipt_number ?? "No receipt"} · {deposit ? money(deposit.liability_balance) : money(0)}
                </p>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <ActionButton disabled={disabled} label="View Deposit" onClick={() => deposit && onView(deposit)} />
                <ActionButton disabled={disabled} label="Print Receipt" onClick={() => deposit && onPrint(deposit)} />
                <ActionButton disabled={disabled} label="Download Receipt" onClick={() => deposit && onDownload(deposit)} />
                <ActionButton disabled={disabled} label="View Audit History" onClick={() => deposit && onView(deposit)} />
                <a className={`rounded-2xl border border-slate-200 px-3 py-2 text-center text-xs font-black ${disabled ? "pointer-events-none opacity-50" : "hover:bg-slate-50"}`} href={tenantHref}>
                    Open Tenant
                </a>
                <a className={`rounded-2xl border border-slate-200 px-3 py-2 text-center text-xs font-black ${disabled ? "pointer-events-none opacity-50" : "hover:bg-slate-50"}`} href={roomHref}>
                    Open Room
                </a>
                <ActionButton
                    disabled={disabled}
                    label="Start Refund"
                    onClick={() => setMessage("Start refund from the tenant vacate/security settlement workflow so approvals and refund vouchers remain audited.")}
                />
                <ActionButton
                    disabled={disabled}
                    label="Mark Settlement Pending"
                    onClick={() => setMessage("Settlement pending is available in the vacate workflow. No change was applied to this held deposit.")}
                />
            </div>
        </section>
    );
}

function ActionButton({ disabled, label, onClick }: { disabled?: boolean; label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            className="rounded-2xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 transition hover:border-emerald-200 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
            {label}
        </button>
    );
}

function DepositDetailsDialog({
    deposit,
    onClose,
    onDownload,
    onPrint,
}: {
    deposit: SecurityDepositRegisterRow;
    onClose: () => void;
    onDownload: (deposit: SecurityDepositRegisterRow) => void;
    onPrint: (deposit: SecurityDepositRegisterRow) => void;
}) {
    const rows = [
        ["Tenant", deposit.tenant?.full_name ?? "Unknown tenant"],
        ["Phone", deposit.tenant?.phone ?? "Not recorded"],
        ["Room", deposit.room?.room_number ?? "Unknown room"],
        ["Office", deposit.office?.office_name ?? deposit.office?.name ?? "No office"],
        ["Landlord", deposit.landlord?.full_name ?? "No landlord"],
        ["Receipt", deposit.receipt_number],
        ["Amount", money(deposit.amount)],
        ["Liability", money(deposit.liability_balance)],
        ["Cash available", money(deposit.cash_available)],
        ["Used by company", money(Math.max(0, amount(deposit.amount_used_by_company) - amount(deposit.amount_restored_by_company)))],
        ["Shortfall", money(deposit.company_shortfall)],
        ["Status", prettyStatus(deposit.status)],
        ["Date received", dateLabel(deposit.date_received)],
        ["Payment method", prettyStatus(deposit.payment_method)],
        ["Reference", deposit.reference_number ?? "Optional"],
        ["Notes", deposit.notes ?? "No notes"],
        ["Audit", `Created ${dateLabel(deposit.created_at)} · Updated ${dateLabel(deposit.updated_at)}`],
    ];
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm">
            <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[28px] border border-slate-200 bg-white p-5 shadow-2xl">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black uppercase text-emerald-700">
                            <Vault size={14} />
                            Security Deposit Record
                        </p>
                        <h2 className="mt-3 text-2xl font-black">{deposit.tenant?.full_name ?? "Security deposit"}</h2>
                        <p className="text-sm font-semibold text-slate-500">Saved receipt {deposit.receipt_number}</p>
                    </div>
                    <button type="button" onClick={onClose} className="rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50">
                        <X size={18} />
                    </button>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {rows.map(([label, value]) => (
                        <PreviewItem key={label} label={label} value={value} wide={label === "Notes" || label === "Audit"} danger={label === "Shortfall" && amount(deposit.company_shortfall) > 0} />
                    ))}
                </div>
                <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <button type="button" onClick={onClose} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700">
                        Close
                    </button>
                    <button type="button" onClick={() => onDownload(deposit)} className="rounded-2xl border border-emerald-200 px-4 py-3 text-sm font-black text-emerald-800">
                        Download Receipt
                    </button>
                    <button type="button" onClick={() => onPrint(deposit)} className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white">
                        Print Receipt
                    </button>
                </div>
            </div>
        </div>
    );
}

function buildSecurityReceiptHtml(deposit: SecurityDepositRegisterRow) {
    const rows = [
        ["Receipt", deposit.receipt_number],
        ["Date", dateLabel(deposit.date_received)],
        ["Tenant", deposit.tenant?.full_name ?? "Unknown tenant"],
        ["Phone", deposit.tenant?.phone ?? "Not recorded"],
        ["Room", deposit.room?.room_number ?? "Unknown"],
        ["Office", deposit.office?.office_name ?? deposit.office?.name ?? "No office"],
        ["Landlord", deposit.landlord?.full_name ?? "No landlord"],
        ["Amount", money(deposit.amount)],
        ["Liability Held", money(deposit.liability_balance)],
        ["Cash Available", money(deposit.cash_available)],
        ["Status", prettyStatus(deposit.status)],
        ["Method", prettyStatus(deposit.payment_method)],
        ["Reference", deposit.reference_number ?? "Optional"],
        ["Notes", deposit.notes ?? "No notes"],
    ];
    const body = rows
        .map(([label, value]) => `<div class="row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
        .join("");
    return `<!doctype html>
<html><head><meta charset="utf-8" /><title>Security Deposit Receipt</title>
<style>
@page{size:80mm auto;margin:0}*{box-sizing:border-box}body{margin:0;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif}.receipt{width:80mm;padding:4mm}.title{text-align:center;font-weight:800;font-size:14px}.subtitle{text-align:center;font-weight:700;font-size:11px;margin-top:2mm}.divider{border-top:1px dashed #000;margin:3mm 0}.row{display:grid;grid-template-columns:minmax(0,42%) minmax(0,58%);gap:2mm;margin:1.5mm 0;font-size:10px;line-height:1.3}.row span{font-weight:700}.row strong{text-align:right;overflow-wrap:anywhere}.footer{text-align:center;font-size:9px;font-weight:700;margin-top:3mm}@media print{body{width:80mm}.receipt{box-shadow:none}}
</style></head><body><main class="receipt"><div class="title">DDUMBA OS</div><div class="subtitle">SECURITY DEPOSIT RECEIPT</div><div class="divider"></div>${body}<div class="divider"></div><div class="footer">Security deposit is tenant liability, not rent or company income.</div></main></body></html>`;
}

function escapeHtml(value: string) {
    return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char] ?? char);
}

function StatusTile({ helper, icon: Icon, label, tone, value }: { helper: string; icon: LucideIcon; label: string; tone: "blue" | "emerald" | "violet"; value: string }) {
    const toneClass = {
        blue: "border-blue-200 bg-blue-50 text-blue-900",
        emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
        violet: "border-violet-200 bg-violet-50 text-violet-900",
    }[tone];
    return (
        <div className={`rounded-2xl border p-3 ${toneClass}`}>
            <div className="flex items-center justify-between">
                <p className="text-xs font-black uppercase tracking-wide opacity-75">{label}</p>
                <Icon size={16} />
            </div>
            <p className="mt-2 text-xl font-black">{value}</p>
            <p className="text-xs font-bold opacity-75">{helper}</p>
        </div>
    );
}

function SecurityActivityTimeline({ deposits }: { deposits: SecurityDepositRegisterRow[] }) {
    const rows = deposits.slice(0, 8);
    return (
        <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h2 className="text-lg font-black">Security Activity Timeline</h2>
                    <p className="text-sm font-semibold text-slate-500">Recent security-deposit activity from the live register.</p>
                </div>
                <Clock3 size={18} className="text-slate-500" />
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {rows.map((deposit) => (
                    <div key={deposit.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <div className="flex items-center justify-between gap-3">
                            <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black uppercase text-slate-600">{prettyStatus(deposit.status)}</span>
                            <span className="text-xs font-black text-slate-500">{dateLabel(deposit.updated_at ?? deposit.created_at)}</span>
                        </div>
                        <p className="mt-3 text-sm font-black">{deposit.tenant?.full_name ?? "Unknown tenant"}</p>
                        <p className="text-xs font-bold text-slate-500">Room {deposit.room?.room_number ?? "Unknown"} · {deposit.office?.office_name ?? deposit.office?.name ?? "No office"}</p>
                        <p className="mt-2 text-lg font-black tabular-nums">{money(deposit.liability_balance)}</p>
                    </div>
                ))}
                {!rows.length ? <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-bold text-slate-500">No security activity is available yet.</p> : null}
            </div>
        </section>
    );
}

function ConfirmationDialog({
    expectedReplacementDate,
    isPending,
    onCancel,
    onConfirm,
    projectedAvailable,
    projectedShortfall,
    selectedDeposit,
    usageAmount,
    usageReason,
}: {
    expectedReplacementDate: string;
    isPending: boolean;
    onCancel: () => void;
    onConfirm: () => void;
    projectedAvailable: number;
    projectedShortfall: number;
    selectedDeposit: SecurityDepositRegisterRow;
    usageAmount: number;
    usageReason: string;
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm">
            <div className="w-full max-w-2xl rounded-[28px] border border-slate-200 bg-white p-5 shadow-2xl">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-xs font-black uppercase text-rose-700">
                            <AlertTriangle size={14} />
                            Confirmation Required
                        </p>
                        <h2 className="mt-3 text-2xl font-black">Use tenant security funds?</h2>
                        <p className="mt-1 text-sm font-semibold text-slate-500">This records company usage of security cash. The tenant liability remains fully owed.</p>
                    </div>
                    <button type="button" onClick={onCancel} disabled={isPending} className="rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 disabled:opacity-50">
                        <X size={18} />
                    </button>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <PreviewItem label="Source deposit" value={depositLabel(selectedDeposit)} />
                    <PreviewItem label="Amount used" value={money(usageAmount)} danger />
                    <PreviewItem label="Remaining security cash" value={money(projectedAvailable)} />
                    <PreviewItem label="Tenant liability" value={money(selectedDeposit.liability_balance)} />
                    <PreviewItem label="Resulting shortfall" value={money(projectedShortfall)} danger={projectedShortfall > 0} />
                    <PreviewItem label="Replacement date" value={dateLabel(expectedReplacementDate)} />
                    <PreviewItem label="Reason" value={usageReason} wide />
                </div>
                <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <button type="button" onClick={onCancel} disabled={isPending} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 disabled:opacity-50">
                        Cancel
                    </button>
                    <button type="button" onClick={onConfirm} disabled={isPending} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-lg disabled:opacity-50">
                        {isPending ? <Loader2 className="animate-spin" size={16} /> : <ShieldCheck size={16} />}
                        {isPending ? "Recording usage..." : "Confirm Security Usage"}
                    </button>
                </div>
            </div>
        </div>
    );
}

function PreviewItem({ danger, label, value, wide }: { danger?: boolean; label: string; value: string; wide?: boolean }) {
    return (
        <div className={`rounded-2xl border p-3 ${danger ? "border-rose-200 bg-rose-50 text-rose-900" : "border-slate-200 bg-slate-50 text-slate-900"} ${wide ? "sm:col-span-2" : ""}`}>
            <p className="text-[10px] font-black uppercase tracking-wide opacity-70">{label}</p>
            <p className="mt-1 break-words text-sm font-black">{value}</p>
        </div>
    );
}

function Field({ disabled, label, onChange, type = "text", value }: { disabled?: boolean; label: string; onChange: (value: string) => void; type?: string; value: string }) {
    return (
        <label className="block">
            <span className="text-xs font-black uppercase text-slate-500">{label}</span>
            <input
                type={type}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                disabled={disabled}
                className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-black outline-none focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100 disabled:opacity-60"
            />
        </label>
    );
}

function TextareaField({
    disabled,
    label,
    onChange,
    placeholder,
    value,
}: {
    disabled?: boolean;
    label: string;
    onChange: (value: string) => void;
    placeholder?: string;
    value: string;
}) {
    return (
        <label className="block">
            <span className="text-xs font-black uppercase text-slate-500">{label}</span>
            <textarea
                value={value}
                onChange={(event) => onChange(event.target.value)}
                disabled={disabled}
                className="mt-1 min-h-24 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold outline-none focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100 disabled:opacity-60"
                placeholder={placeholder}
            />
        </label>
    );
}
