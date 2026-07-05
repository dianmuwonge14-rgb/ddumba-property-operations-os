"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Banknote, Brain, Building2, Download, Eye, GitBranch, Landmark, Printer, RefreshCw, Send, Trash2, WalletCards } from "lucide-react";
import { bankOfficeMoney, cancelAdminOfficeTransfer, giveMoneyToOffice, reassignAdminOfficeTransfer } from "@/app/actions/cash-banking";
import type { CashBankingData, CashLedgerRow } from "@/lib/cash-banking/types";

type Props = {
    data: CashBankingData;
};

const money = new Intl.NumberFormat("en-UG", {
    style: "currency",
    currency: "UGX",
    maximumFractionDigits: 0,
});

function formatMoney(value: number) {
    return money.format(Math.round(value || 0)).replace("UGX", "UGX ");
}

function today() {
    return new Date().toISOString().slice(0, 10);
}

function cardTone(index: number) {
    return [
        "from-emerald-500/22 to-cyan-500/8 text-emerald-100 ring-emerald-300/20",
        "from-blue-500/24 to-indigo-500/8 text-blue-100 ring-blue-300/20",
        "from-purple-500/22 to-fuchsia-500/8 text-purple-100 ring-purple-300/20",
        "from-amber-500/22 to-red-500/8 text-amber-100 ring-amber-300/20",
    ][index % 4];
}

export default function CashBankingConsole({ data }: Props) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [depositDebug, setDepositDebug] = useState<{
        submittedAmount: number;
        officeId: string;
        moneyAtOfficeBefore: number;
        moneyAtOfficeAfter: number;
        bankBalanceBefore: number;
        bankBalanceAfter: number;
        supabaseTransactionId: string;
    } | null>(null);
    const [filters, setFilters] = useState({
        startDate: data.filters.startDate,
        endDate: data.filters.endDate,
        officeId: data.filters.officeId ?? "",
    });
    const [bankForm, setBankForm] = useState({
        amount: "",
        bankingDate: today(),
        bankName: "",
        channel: "Bank",
        accountReference: "",
        referenceNumber: "",
        notes: "",
    });
    const [floatForm, setFloatForm] = useState({
        officeId: data.offices[0]?.id ?? "",
        amount: "",
        source: "bank" as "bank" | "admin_cash",
        movementDate: today(),
        reason: "",
        referenceNumber: "",
        notes: "",
    });
    const [correction, setCorrection] = useState<{
        mode: "reassign" | "cancel" | "history";
        row: CashLedgerRow;
        officeId: string;
        reason: string;
    } | null>(null);

    const csv = useMemo(() => {
        const rows = [
            ["Date", "Time", "Office", "Type", "Amount In", "Amount Out", "Running Balance", "Recorded By", "Reference", "Notes"],
            ...data.ledger.map((row) => [
                row.date,
                row.time,
                row.officeName,
                row.label,
                row.amountIn,
                row.amountOut,
                row.runningBalance,
                row.recordedBy,
                row.reference ?? "",
                row.notes ?? "",
            ]),
        ];
        return rows.map((row) => row.map((cell) => `"${String(cell).replaceAll("\"", "\"\"")}"`).join(",")).join("\n");
    }, [data.ledger]);

    function applyFilters() {
        const params = new URLSearchParams();
        if (filters.startDate) params.set("startDate", filters.startDate);
        if (filters.endDate) params.set("endDate", filters.endDate);
        if (data.isAdmin && filters.officeId) params.set("officeId", filters.officeId);
        router.push(`${data.isAdmin ? "/office/admin/cash-banking" : "/office/cash-banking"}?${params.toString()}`);
    }

    function exportCsv() {
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `cash-banking-${data.filters.startDate}-${data.filters.endDate}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    }

    function submitBanking() {
        setError(null);
        setMessage(null);
        setDepositDebug(null);
        startTransition(async () => {
            try {
                const result = await bankOfficeMoney({
                    amount: Number(bankForm.amount),
                    bankingDate: bankForm.bankingDate,
                    bankName: bankForm.bankName,
                    channel: bankForm.channel,
                    accountReference: bankForm.accountReference || null,
                    referenceNumber: bankForm.referenceNumber || null,
                    notes: bankForm.notes || null,
                });
                setMessage(`Deposit recorded successfully. Money at Office is now ${formatMoney(result.balances.moneyAtOffice)} and Money at Bank is ${formatMoney(result.balances.moneyAtBank)}.`);
                setDepositDebug(result.debug);
                setBankForm((current) => ({ ...current, amount: "", referenceNumber: "", notes: "" }));
                router.refresh();
            } catch (err) {
                setError(err instanceof Error ? err.message : "Banking failed.");
            }
        });
    }

    function submitFloat() {
        setError(null);
        setMessage(null);
        startTransition(async () => {
            try {
                await giveMoneyToOffice({
                    officeId: floatForm.officeId,
                    amount: Number(floatForm.amount),
                    source: floatForm.source,
                    movementDate: floatForm.movementDate,
                    reason: floatForm.notes || "Office float transfer",
                    referenceNumber: floatForm.referenceNumber || null,
                    notes: floatForm.notes || null,
                });
                setMessage("Office float sent and office notified.");
                setFloatForm((current) => ({ ...current, amount: "", reason: "", referenceNumber: "", notes: "" }));
                router.refresh();
            } catch (err) {
                setError(err instanceof Error ? err.message : "Office float transfer failed.");
            }
        });
    }

    function submitCorrection() {
        if (!correction?.row.transferId) return;
        setError(null);
        setMessage(null);
        startTransition(async () => {
            try {
                if (correction.mode === "reassign") {
                    await reassignAdminOfficeTransfer({
                        transferId: correction.row.transferId!,
                        correctOfficeId: correction.officeId,
                        reason: correction.reason,
                    });
                    setMessage("Transfer reassigned successfully. Office cash balances and histories were updated.");
                }
                if (correction.mode === "cancel") {
                    await cancelAdminOfficeTransfer({
                        transferId: correction.row.transferId!,
                        reason: correction.reason,
                    });
                    setMessage("Transfer cancelled successfully. Money was returned to the admin source account.");
                }
                setCorrection(null);
                router.refresh();
            } catch (err) {
                setError(err instanceof Error ? err.message : "Transfer correction failed.");
            }
        });
    }

    const topCards = [
        { label: "Money At Office", value: data.totals.moneyAtOffices, icon: WalletCards, hint: "Live office cash after banking and expenses" },
        { label: "Money At Bank", value: data.totals.moneyAtBank, icon: Landmark, hint: "Banked cash less bank-funded office float" },
        { label: "Collected Period", value: data.totals.collectedPeriod, icon: Banknote, hint: "Active tenant collections in selected period" },
        { label: "Company Cash Position", value: data.totals.companyCashPosition, icon: Building2, hint: "Bank + admin cash + office cash" },
    ];

    return (
        <div className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:px-6 lg:px-8">
            <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.22),transparent_28%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.16),transparent_24%)]" />
            <div className="relative mx-auto max-w-[1800px] space-y-6">
                <header className="flex flex-col justify-between gap-4 rounded-[28px] border border-white/10 bg-white/[0.06] p-5 shadow-2xl shadow-black/30 backdrop-blur-2xl lg:flex-row lg:items-end">
                    <div>
                        <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200">{data.isAdmin ? "Admin Finance Control" : "Office Cash Control"}</p>
                        <h1 className="mt-2 text-3xl font-black tracking-tight text-white">Cash Banking & Office Float</h1>
                        <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-300">
                            Live cash position from tenant collections, banking movements, office expenses, and admin float.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-black text-white hover:bg-white/15">
                            <Printer size={16} /> Print A4
                        </button>
                        <button onClick={exportCsv} className="inline-flex items-center gap-2 rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-black text-slate-950 hover:bg-cyan-300">
                            <Download size={16} /> Export CSV
                        </button>
                    </div>
                </header>

                <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {topCards.map((card, index) => {
                        const Icon = card.icon;
                        return (
                            <div key={card.label} className={`rounded-[24px] border border-white/10 bg-gradient-to-br ${cardTone(index)} p-5 shadow-xl shadow-black/20 ring-1`}>
                                <div className="flex items-center justify-between gap-3">
                                    <p className="text-xs font-black uppercase tracking-wide text-slate-300">{card.label}</p>
                                    <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10">
                                        <Icon size={19} />
                                    </span>
                                </div>
                                <p className="mt-4 break-words text-2xl font-black tracking-tight text-white">{formatMoney(card.value)}</p>
                                <p className="mt-2 text-xs font-semibold text-slate-300">{card.hint}</p>
                            </div>
                        );
                    })}
                </section>

                {data.canManage && (
                    <section className="rounded-[28px] border border-white/10 bg-white/[0.06] p-4 shadow-2xl shadow-black/25 backdrop-blur-2xl">
                        {!data.isAdmin ? (
                            <div>
                                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <h2 className="text-xl font-black text-white">Bank Office Cash</h2>
                                        <p className="text-xs font-semibold text-slate-400">Enter the cash deposited and move it from Money at Office to Money at Bank.</p>
                                    </div>
                                    <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-black text-emerald-100">Live banking entry</span>
                                </div>
                                <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_1.2fr_1fr_1.2fr_auto]">
                                    <Input label="Amount to Bank" value={bankForm.amount} onChange={(value) => setBankForm((current) => ({ ...current, amount: value }))} type="number" />
                                    <Input label="Deposit Date" value={bankForm.bankingDate} onChange={(value) => setBankForm((current) => ({ ...current, bankingDate: value }))} type="date" />
                                    <Select label="Deposit Method" value={bankForm.channel} onChange={(value) => setBankForm((current) => ({ ...current, channel: value }))} options={["Bank", "Mobile Money", "Other"]} />
                                    <Input label="Bank / Account Name" value={bankForm.bankName} onChange={(value) => setBankForm((current) => ({ ...current, bankName: value }))} />
                                    <Input label="Deposit Reference" value={bankForm.referenceNumber} onChange={(value) => setBankForm((current) => ({ ...current, referenceNumber: value }))} />
                                    <Input label="Notes" value={bankForm.notes} onChange={(value) => setBankForm((current) => ({ ...current, notes: value }))} />
                                    <button disabled={isPending} onClick={submitBanking} className="mt-5 inline-flex h-[46px] items-center justify-center gap-2 rounded-2xl bg-emerald-300 px-5 text-sm font-black text-slate-950 shadow-lg shadow-emerald-900/20 transition hover:bg-emerald-200 disabled:opacity-60">
                                        <Landmark size={16} /> {isPending ? "Depositing..." : "Deposit to Bank"}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div>
                                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <h2 className="text-xl font-black text-white">Transfer Money to Office</h2>
                                        <p className="text-xs font-semibold text-slate-400">Choose an office and send money from bank/admin cash into its office float.</p>
                                    </div>
                                    <span className="rounded-full border border-blue-300/20 bg-blue-300/10 px-3 py-1 text-xs font-black text-blue-100">Admin transfer entry</span>
                                </div>
                                <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr_1fr_1fr_1fr_1.2fr_auto]">
                                    <Select label="Choose Office" value={floatForm.officeId} onChange={(value) => setFloatForm((current) => ({ ...current, officeId: value }))} options={data.offices.map((office) => office.name)} optionValues={data.offices.map((office) => office.id)} />
                                    <Input label="Amount to Send" value={floatForm.amount} onChange={(value) => setFloatForm((current) => ({ ...current, amount: value }))} type="number" />
                                    <Input label="Transfer Date" value={floatForm.movementDate} onChange={(value) => setFloatForm((current) => ({ ...current, movementDate: value }))} type="date" />
                                    <Select label="Source" value={floatForm.source} onChange={(value) => setFloatForm((current) => ({ ...current, source: value as "bank" | "admin_cash" }))} options={["Bank Account", "Admin Cash"]} optionValues={["bank", "admin_cash"]} />
                                    <Input label="Reference" value={floatForm.referenceNumber} onChange={(value) => setFloatForm((current) => ({ ...current, referenceNumber: value }))} />
                                    <Input label="Notes" value={floatForm.notes} onChange={(value) => setFloatForm((current) => ({ ...current, notes: value }))} />
                                    <button disabled={isPending || !floatForm.officeId} onClick={submitFloat} className="mt-5 inline-flex h-[46px] items-center justify-center gap-2 rounded-2xl bg-blue-300 px-5 text-sm font-black text-slate-950 shadow-lg shadow-blue-900/20 transition hover:bg-blue-200 disabled:opacity-60">
                                        <Send size={16} /> {isPending ? "Sending..." : "Send Money to Office"}
                                    </button>
                                </div>
                            </div>
                        )}
                    </section>
                )}

                <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
                    <div className="rounded-[28px] border border-white/10 bg-white/[0.055] p-4 shadow-2xl shadow-black/25 backdrop-blur-2xl">
                        <div className="grid gap-3 md:grid-cols-4">
                            <label className="text-xs font-black uppercase text-slate-400">
                                Start date
                                <input type="date" value={filters.startDate} onChange={(event) => setFilters((current) => ({ ...current, startDate: event.target.value }))} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 px-3 py-3 text-sm font-bold text-white outline-none" />
                            </label>
                            <label className="text-xs font-black uppercase text-slate-400">
                                End date
                                <input type="date" value={filters.endDate} onChange={(event) => setFilters((current) => ({ ...current, endDate: event.target.value }))} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 px-3 py-3 text-sm font-bold text-white outline-none" />
                            </label>
                            {data.isAdmin && (
                                <label className="text-xs font-black uppercase text-slate-400">
                                    Office
                                    <select value={filters.officeId} onChange={(event) => setFilters((current) => ({ ...current, officeId: event.target.value }))} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 px-3 py-3 text-sm font-bold text-white outline-none">
                                        <option value="">All offices</option>
                                        {data.offices.map((office) => <option key={office.id} value={office.id}>{office.name}</option>)}
                                    </select>
                                </label>
                            )}
                            <button onClick={applyFilters} className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-950 hover:bg-cyan-100">
                                <RefreshCw size={16} /> Apply
                            </button>
                        </div>
                    </div>

                    <div className="rounded-[28px] border border-cyan-300/15 bg-cyan-300/10 p-4">
                        <div className="flex items-center gap-3">
                            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-cyan-300 text-slate-950">
                                <Brain size={18} />
                            </span>
                            <div>
                                <p className="text-sm font-black text-white">AI Cash Assistant</p>
                                <p className="text-xs font-semibold text-cyan-100">Live control notes from the selected period</p>
                            </div>
                        </div>
                        <div className="mt-3 space-y-2">
                            {data.insights.map((insight) => (
                                <div key={insight.id} className="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
                                    <p className="text-sm font-black text-white">{insight.title}</p>
                                    <p className="mt-1 text-xs font-semibold text-slate-300">{insight.message}</p>
                                    <p className="mt-2 text-xs font-black text-cyan-200">{insight.action}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                {(message || error) && (
                    <div className={`rounded-2xl border px-4 py-3 text-sm font-black ${error ? "border-red-300/30 bg-red-500/10 text-red-100" : "border-emerald-300/30 bg-emerald-500/10 text-emerald-100"}`}>
                        {error ?? message}
                    </div>
                )}

                {(depositDebug || error) && !data.isAdmin && (
                    <section className="rounded-[24px] border border-white/10 bg-slate-950/80 p-4 shadow-xl shadow-black/20">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h2 className="text-sm font-black uppercase tracking-wide text-cyan-100">Deposit Debug Result</h2>
                                <p className="mt-1 text-xs font-semibold text-slate-400">Temporary trace for the Deposit to Bank action.</p>
                            </div>
                            <span className={`rounded-full px-3 py-1 text-xs font-black ${error ? "bg-red-400/12 text-red-100" : "bg-emerald-400/12 text-emerald-100"}`}>{error ? "Failed" : "Saved"}</span>
                        </div>
                        {depositDebug ? (
                            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                                <DebugMetric label="Submitted Amount" value={formatMoney(depositDebug.submittedAmount)} />
                                <DebugMetric label="Office ID" value={depositDebug.officeId} />
                                <DebugMetric label="Office Before" value={formatMoney(depositDebug.moneyAtOfficeBefore)} />
                                <DebugMetric label="Office After" value={formatMoney(depositDebug.moneyAtOfficeAfter)} />
                                <DebugMetric label="Bank Before" value={formatMoney(depositDebug.bankBalanceBefore)} />
                                <DebugMetric label="Bank After" value={formatMoney(depositDebug.bankBalanceAfter)} />
                                <DebugMetric label="Supabase Transaction ID" value={depositDebug.supabaseTransactionId} wide />
                            </div>
                        ) : (
                            <p className="mt-4 rounded-2xl bg-red-500/10 px-3 py-2 text-xs font-bold text-red-100">{error}</p>
                        )}
                    </section>
                )}

                <section>
                    <div className="rounded-[28px] border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/20">
                        <div className="mb-4 flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-black text-white">Office Cash Cards</h2>
                                <p className="text-xs font-semibold text-slate-400">Collections, banking, expenses, and money left at each office.</p>
                            </div>
                            <span className="rounded-full bg-emerald-400/12 px-3 py-1 text-xs font-black text-emerald-100">Live</span>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                            {data.officeSummaries.map((office) => (
                                <div key={office.officeId} className="rounded-3xl border border-white/10 bg-slate-950/72 p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="text-sm font-black text-white">{office.officeName}</p>
                                            <p className="mt-1 text-xs font-semibold text-slate-400">{office.bankingCount} banking movements in period</p>
                                        </div>
                                        <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-black text-cyan-100">Office</span>
                                    </div>
                                    <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                                        <Metric label="Collected period" value={office.collectedPeriod} />
                                        <Metric label="Money banked" value={office.moneyBanked} />
                                        <Metric label="Expenses period" value={office.expensesPeriod} />
                                        <Metric label="Money at office" value={office.moneyAtOffice} strong />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="rounded-[28px] border border-white/10 bg-white/[0.055] p-4 shadow-2xl shadow-black/25">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h2 className="text-lg font-black text-white">Cash Movement Ledger</h2>
                            <p className="text-xs font-semibold text-slate-400">Oldest first, with running office cash movement for the selected period.</p>
                        </div>
                        <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-black text-slate-200">
                            <AlertTriangle size={13} /> Pending/voided payments are excluded from collection cash.
                        </span>
                    </div>
                    <div className="max-h-[620px] overflow-auto rounded-2xl border border-white/10">
                        <table className="min-w-full border-collapse text-left text-sm">
                            <thead className="sticky top-0 bg-slate-950 text-xs uppercase text-slate-400">
                                <tr>
                                    {["Date", "Time", "Office", "Type", "In", "Out", "Running", "Recorded By", "Notes", ...(data.isAdmin ? ["Actions"] : [])].map((head) => (
                                        <th key={head} className="border-b border-white/10 px-3 py-3 font-black">{head}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {data.ledger.map((row) => (
                                    <tr key={row.id} className="border-b border-white/6 bg-slate-950/44 hover:bg-white/[0.06]">
                                        <td className="px-3 py-2 font-bold text-slate-200">{row.date}</td>
                                        <td className="px-3 py-2 text-slate-400">{row.time}</td>
                                        <td className="px-3 py-2 font-bold text-white">{row.officeName}</td>
                                        <td className="px-3 py-2"><span className="rounded-full bg-white/10 px-2 py-1 text-xs font-black text-cyan-100">{row.label}</span></td>
                                        <td className="px-3 py-2 font-black text-emerald-200">{row.amountIn ? formatMoney(row.amountIn) : "-"}</td>
                                        <td className="px-3 py-2 font-black text-red-200">{row.amountOut ? formatMoney(row.amountOut) : "-"}</td>
                                        <td className="px-3 py-2 font-black text-white">{formatMoney(row.runningBalance)}</td>
                                        <td className="px-3 py-2 text-slate-300">{row.recordedBy}</td>
                                        <td className="max-w-[280px] truncate px-3 py-2 text-slate-400" title={row.notes ?? ""}>{row.notes ?? row.reference ?? "-"}</td>
                                        {data.isAdmin && (
                                            <td className="px-3 py-2">
                                                {row.transactionType === "admin_float" && row.transferId ? (
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => setCorrection({ mode: "reassign", row, officeId: row.officeId ?? "", reason: "" })}
                                                            disabled={!row.canReassign}
                                                            className="grid h-8 w-8 place-items-center rounded-xl bg-white/10 text-cyan-100 hover:bg-cyan-300 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-35"
                                                            title="Reassign to another office"
                                                        >
                                                            <GitBranch size={14} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setCorrection({ mode: "cancel", row, officeId: row.officeId ?? "", reason: "" })}
                                                            disabled={!row.canCancel}
                                                            className="grid h-8 w-8 place-items-center rounded-xl bg-white/10 text-red-100 hover:bg-red-300 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-35"
                                                            title="Cancel transfer"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setCorrection({ mode: "history", row, officeId: row.officeId ?? "", reason: "" })}
                                                            className="grid h-8 w-8 place-items-center rounded-xl bg-white/10 text-slate-100 hover:bg-white hover:text-slate-950"
                                                            title="View history"
                                                        >
                                                            <Eye size={14} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs font-bold text-slate-600">-</span>
                                                )}
                                            </td>
                                        )}
                                    </tr>
                                ))}
                                {data.ledger.length === 0 && (
                                    <tr>
                                        <td colSpan={data.isAdmin ? 10 : 9} className="px-3 py-10 text-center text-sm font-bold text-slate-400">No cash movements found for this period.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>
            {correction && (
                <div className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/80 p-4 backdrop-blur">
                    <section className="w-full max-w-xl rounded-[28px] border border-white/10 bg-slate-950 p-5 text-white shadow-2xl shadow-black/60">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200">Admin Transfer Correction</p>
                                <h2 className="mt-2 text-2xl font-black">
                                    {correction.mode === "reassign" ? "Reassign Transfer" : correction.mode === "cancel" ? "Cancel Transfer" : "Transfer History"}
                                </h2>
                            </div>
                            <button onClick={() => setCorrection(null)} className="rounded-xl bg-white/10 px-3 py-2 text-xs font-black text-slate-200 hover:bg-white/15">Close</button>
                        </div>

                        <div className="mt-5 grid gap-3 rounded-3xl border border-white/10 bg-white/[0.05] p-4 text-sm">
                            <Info label="Current office" value={correction.row.officeName} />
                            <Info label="Amount" value={formatMoney(correction.row.amountIn || correction.row.amountOut)} />
                            <Info label="Transfer date" value={correction.row.date} />
                            <Info label="Reference" value={correction.row.transferId ?? correction.row.reference ?? "-"} />
                            <Info label="Status" value={correction.row.transferStatus ?? "completed"} />
                            <Info label="Notes" value={correction.row.notes ?? "-"} />
                        </div>

                        {correction.mode === "reassign" && (
                            <div className="mt-4 space-y-3">
                                <Select
                                    label="Choose Correct Office"
                                    value={correction.officeId}
                                    onChange={(value) => setCorrection((current) => current ? { ...current, officeId: value } : current)}
                                    options={data.offices.map((office) => office.name)}
                                    optionValues={data.offices.map((office) => office.id)}
                                />
                                <Input label="Correction Reason" value={correction.reason} onChange={(value) => setCorrection((current) => current ? { ...current, reason: value } : current)} />
                            </div>
                        )}

                        {correction.mode === "cancel" && (
                            <div className="mt-4">
                                <Input label="Cancellation Reason" value={correction.reason} onChange={(value) => setCorrection((current) => current ? { ...current, reason: value } : current)} />
                            </div>
                        )}

                        {correction.mode !== "history" && (
                            <div className="mt-5 flex justify-end gap-2">
                                <button onClick={() => setCorrection(null)} className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-black text-slate-200 hover:bg-white/10">Cancel</button>
                                <button disabled={isPending || !correction.reason.trim() || (correction.mode === "reassign" && !correction.officeId)} onClick={submitCorrection} className="rounded-2xl bg-cyan-300 px-4 py-3 text-sm font-black text-slate-950 hover:bg-cyan-200 disabled:opacity-50">
                                    {isPending ? "Saving..." : correction.mode === "reassign" ? "Confirm Reassign" : "Confirm Cancel"}
                                </button>
                            </div>
                        )}
                    </section>
                </div>
            )}
        </div>
    );
}

function Metric({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
    return (
        <div className="rounded-2xl bg-white/[0.06] px-3 py-2">
            <p className="text-[11px] font-black uppercase text-slate-500">{label}</p>
            <p className={`mt-1 break-words font-black ${strong ? "text-base text-emerald-100" : "text-sm text-white"}`}>{formatMoney(value)}</p>
        </div>
    );
}

function DebugMetric({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
    return (
        <div className={`rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2 ${wide ? "lg:col-span-2" : ""}`}>
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 break-words text-xs font-black text-white">{value}</p>
        </div>
    );
}

function Info({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-start justify-between gap-4">
            <span className="text-xs font-black uppercase text-slate-500">{label}</span>
            <span className="max-w-[65%] text-right font-bold text-slate-100">{value}</span>
        </div>
    );
}

function Input({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
    return (
        <label className="block text-xs font-black uppercase text-slate-400">
            {label}
            <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 px-3 py-3 text-sm font-bold text-white outline-none placeholder:text-slate-600" />
        </label>
    );
}

function Select({ label, value, onChange, options, optionValues }: { label: string; value: string; onChange: (value: string) => void; options: string[]; optionValues?: string[] }) {
    return (
        <label className="block text-xs font-black uppercase text-slate-400">
            {label}
            <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 px-3 py-3 text-sm font-bold text-white outline-none">
                {options.map((option, index) => <option key={`${option}-${optionValues?.[index] ?? index}`} value={optionValues?.[index] ?? option}>{option}</option>)}
            </select>
        </label>
    );
}
