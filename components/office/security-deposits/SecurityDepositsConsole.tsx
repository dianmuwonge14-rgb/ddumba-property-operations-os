"use client";

import { useMemo, useState, useTransition } from "react";
import { Banknote, CalendarDays, CheckCircle2, FileText, Loader2, RefreshCw, Search, ShieldCheck, WalletCards } from "lucide-react";
import { restoreSecurityFunds, useSecurityFunds } from "@/app/actions/security-deposits";
import type { SecurityDepositPageData, SecurityDepositRegisterRow } from "@/lib/security-deposits/types";

function money(value: unknown) {
    return `UGX ${Math.round(Number(value ?? 0)).toLocaleString("en-UG")}`;
}

function prettyStatus(value: string | null | undefined) {
    return String(value ?? "held").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function rowAmount(row: SecurityDepositRegisterRow, key: keyof SecurityDepositRegisterRow) {
    return Number(row[key] ?? 0) || 0;
}

export default function SecurityDepositsConsole({ data }: { data: SecurityDepositPageData }) {
    const [query, setQuery] = useState("");
    const [selectedDepositId, setSelectedDepositId] = useState(data.deposits[0]?.id ?? "");
    const [usageAmount, setUsageAmount] = useState("");
    const [usageReason, setUsageReason] = useState("");
    const [expectedReplacementDate, setExpectedReplacementDate] = useState("");
    const [message, setMessage] = useState<string | null>(null);
    const [restoreAmount, setRestoreAmount] = useState("");
    const [restoreReference, setRestoreReference] = useState("");
    const [isPending, startTransition] = useTransition();

    const filteredDeposits = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (!needle) return data.deposits;
        return data.deposits.filter((deposit) => [
            deposit.receipt_number,
            deposit.tenant?.full_name,
            deposit.tenant?.phone,
            deposit.room?.room_number,
            deposit.landlord?.full_name,
            deposit.office?.office_name,
            deposit.office?.name,
            deposit.reference_number,
        ].some((value) => String(value ?? "").toLowerCase().includes(needle)));
    }, [data.deposits, query]);

    const selectedDeposit = data.deposits.find((deposit) => deposit.id === selectedDepositId) ?? data.deposits[0] ?? null;

    function submitUseFunds() {
        if (!selectedDeposit) {
            setMessage("Select a security deposit first.");
            return;
        }
        const amount = Number(usageAmount);
        if (!Number.isFinite(amount) || amount <= 0) {
            setMessage("Enter the security amount Admin is using.");
            return;
        }
        if (!usageReason.trim()) {
            setMessage("Reason is required when Admin uses tenant security money.");
            return;
        }
        startTransition(async () => {
            try {
                setMessage(null);
                await useSecurityFunds({
                    amount,
                    depositId: selectedDeposit.id,
                    expectedReplacementDate: expectedReplacementDate || null,
                    notes: null,
                    reason: usageReason,
                    usageDate: new Date().toISOString().slice(0, 10),
                });
                setMessage("Security fund usage recorded. Tenant liability remains unchanged.");
                setUsageAmount("");
                setUsageReason("");
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
        const amount = Number(restoreAmount);
        if (!Number.isFinite(amount) || amount <= 0) {
            setMessage("Enter the security amount restored.");
            return;
        }
        startTransition(async () => {
            try {
                setMessage(null);
                await restoreSecurityFunds({
                    amount,
                    depositId: selectedDeposit.id,
                    notes: "Security money restored from Admin/company usage.",
                    referenceNumber: restoreReference || null,
                    restoreDate: new Date().toISOString().slice(0, 10),
                });
                setMessage("Security funds restored. Cash available and shortfall were updated.");
                setRestoreAmount("");
                setRestoreReference("");
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Security funds could not be restored.");
            }
        });
    }

    return (
        <main className="min-h-screen bg-slate-100 px-3 py-4 text-slate-950 sm:px-5 lg:px-8">
            <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5">
                <section className="overflow-hidden rounded-[28px] border border-slate-800 bg-slate-950 text-white shadow-2xl">
                    <div className="grid gap-5 bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.22),transparent_34%),linear-gradient(135deg,#020617,#0f172a_48%,#064e3b)] p-5 lg:grid-cols-[1.35fr_0.65fr] lg:p-7">
                        <div>
                            <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-wide text-emerald-100">
                                <ShieldCheck size={14} />
                                Separate tenant liability ledger
                            </p>
                            <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">Security Deposits</h1>
                            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-200">
                                Track refundable tenant security money separately from rent collections, office revenue, landlord payments, profit and advance rent.
                            </p>
                        </div>
                        <div className="grid content-end gap-2 sm:grid-cols-2 lg:grid-cols-1">
                            <Badge label="Live Supabase data" />
                            <Badge label={data.isAdmin ? "Admin control enabled" : "Office scoped view"} />
                            <Badge label="Financial reconciliation protected" />
                        </div>
                    </div>
                </section>

                {data.warnings.length ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                        {data.warnings.join(" ")}
                    </div>
                ) : null}

                <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
                    <KpiCard title="Security Held" amount={data.summary.totalHeld} icon={ShieldCheck} tone="slate" />
                    <KpiCard title="Cash Available" amount={data.summary.totalAvailable} icon={WalletCards} tone="emerald" />
                    <KpiCard title="Used By Company" amount={data.summary.totalUsedByCompany} icon={Banknote} tone="amber" />
                    <KpiCard title="Security Shortfall" amount={data.summary.totalShortfall} icon={RefreshCw} tone="rose" />
                    <KpiCard title="Refunded" amount={data.summary.totalRefunded} icon={CheckCircle2} tone="blue" />
                    <KpiCard title="Pending Settlement" amount={data.summary.totalPendingSettlement} icon={CalendarDays} tone="violet" />
                </section>

                <section className="grid gap-4 xl:grid-cols-[1fr_380px]">
                    <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div>
                                <h2 className="text-lg font-black">Security Deposit Register</h2>
                                <p className="text-sm font-semibold text-slate-500">{filteredDeposits.length} live records shown. Use filters for tenant, room, receipt, office or landlord.</p>
                            </div>
                            <label className="relative block w-full md:w-80">
                                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input
                                    value={query}
                                    onChange={(event) => setQuery(event.target.value)}
                                    placeholder="Search deposits..."
                                    className="h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm font-bold outline-none focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                                />
                            </label>
                        </div>

                        <div className="mt-4 overflow-x-auto">
                            <table className="min-w-full border-separate border-spacing-y-2 text-left text-sm">
                                <thead className="text-xs font-black uppercase text-slate-500">
                                    <tr>
                                        <th className="px-3 py-2">Tenant / Room</th>
                                        <th className="px-3 py-2">Office</th>
                                        <th className="px-3 py-2 text-right">Liability</th>
                                        <th className="px-3 py-2 text-right">Available</th>
                                        <th className="px-3 py-2">Status</th>
                                        <th className="px-3 py-2">Receipt</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredDeposits.map((deposit) => (
                                        <tr key={deposit.id} className="rounded-2xl bg-slate-50 align-top shadow-sm">
                                            <td className="rounded-l-2xl px-3 py-3">
                                                <p className="font-black">{deposit.tenant?.full_name ?? "Unknown tenant"}</p>
                                                <p className="text-xs font-bold text-slate-500">Room {deposit.room?.room_number ?? "Unknown"} · {deposit.landlord?.full_name ?? "No landlord"}</p>
                                            </td>
                                            <td className="px-3 py-3 font-bold text-slate-700">{deposit.office?.office_name ?? deposit.office?.name ?? "No office"}</td>
                                            <td className="px-3 py-3 text-right font-black tabular-nums">{money(deposit.liability_balance)}</td>
                                            <td className="px-3 py-3 text-right font-black tabular-nums text-emerald-700">{money(deposit.cash_available)}</td>
                                            <td className="px-3 py-3">
                                                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">{prettyStatus(deposit.status)}</span>
                                            </td>
                                            <td className="rounded-r-2xl px-3 py-3">
                                                <p className="font-mono text-xs font-black">{deposit.receipt_number}</p>
                                                <p className="text-xs font-bold text-slate-500">{deposit.date_received}</p>
                                            </td>
                                        </tr>
                                    ))}
                                    {!filteredDeposits.length ? (
                                        <tr>
                                            <td colSpan={6} className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm font-bold text-slate-500">
                                                No security deposit records match this search.
                                            </td>
                                        </tr>
                                    ) : null}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <aside className="space-y-4">
                        <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                            <h2 className="text-lg font-black">Admin Use Security Funds</h2>
                            <p className="mt-1 text-sm font-semibold text-slate-500">
                                Using security money reduces cash availability only. The tenant liability remains payable until refund, retention or approved settlement.
                            </p>
                            <div className="mt-4 space-y-3">
                                <label className="block">
                                    <span className="text-xs font-black uppercase text-slate-500">Source deposit</span>
                                    <select
                                        value={selectedDepositId}
                                        onChange={(event) => setSelectedDepositId(event.target.value)}
                                        disabled={!data.isAdmin || isPending}
                                        className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-black outline-none focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100 disabled:opacity-60"
                                    >
                                        {data.deposits.map((deposit) => (
                                            <option key={deposit.id} value={deposit.id}>
                                                {deposit.room?.room_number ?? "Room"} · {deposit.tenant?.full_name ?? "Tenant"} · {money(deposit.cash_available)}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <Field label="Amount used" type="number" value={usageAmount} onChange={setUsageAmount} disabled={!data.isAdmin || isPending} />
                                <Field label="Expected replacement date" type="date" value={expectedReplacementDate} onChange={setExpectedReplacementDate} disabled={!data.isAdmin || isPending} />
                                <label className="block">
                                    <span className="text-xs font-black uppercase text-slate-500">Reason</span>
                                    <textarea
                                        value={usageReason}
                                        onChange={(event) => setUsageReason(event.target.value)}
                                        disabled={!data.isAdmin || isPending}
                                        className="mt-1 min-h-24 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold outline-none focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100 disabled:opacity-60"
                                        placeholder="Required"
                                    />
                                </label>
                                <button
                                    type="button"
                                    onClick={submitUseFunds}
                                    disabled={!data.isAdmin || isPending || !selectedDeposit}
                                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-lg disabled:opacity-50"
                                >
                                    {isPending ? <Loader2 className="animate-spin" size={16} /> : <ShieldCheck size={16} />}
                                    {isPending ? "Recording usage..." : "Use Security Funds"}
                                </button>
                                <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-3">
                                    <p className="text-xs font-black uppercase text-emerald-700">Restore Used Security</p>
                                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                        <Field label="Amount restored" type="number" value={restoreAmount} onChange={setRestoreAmount} disabled={!data.isAdmin || isPending} />
                                        <Field label="Reference" value={restoreReference} onChange={setRestoreReference} disabled={!data.isAdmin || isPending} />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={submitRestoreFunds}
                                        disabled={!data.isAdmin || isPending || !selectedDeposit}
                                        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-4 py-3 text-sm font-black text-white shadow-lg disabled:opacity-50"
                                    >
                                        {isPending ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                                        {isPending ? "Restoring..." : "Restore Security Funds"}
                                    </button>
                                </div>
                                {!data.isAdmin ? (
                                    <p className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                                        Office accounts can view and record deposits from Payments Entry. Admin approval is required for fund usage and settlement exceptions.
                                    </p>
                                ) : null}
                                {message ? <p className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-black text-slate-700">{message}</p> : null}
                            </div>
                        </div>

                        <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                            <h2 className="text-lg font-black">Reports</h2>
                            <div className="mt-3 grid gap-2">
                                {["Security Deposit Register", "Security Usage Report", "Security Refund Report", "Security Shortfall Report", "Tenant Security Statement"].map((label) => (
                                    <div key={label} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm font-black text-slate-700">
                                        <FileText size={16} className="text-emerald-700" />
                                        {label}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </aside>
                </section>
            </div>
        </main>
    );
}

function Badge({ label }: { label: string }) {
    return <span className="rounded-full border border-white/10 bg-white/10 px-3 py-2 text-xs font-black uppercase tracking-wide text-slate-100">{label}</span>;
}

function KpiCard({ amount, icon: Icon, title, tone }: { amount: number; icon: typeof ShieldCheck; title: string; tone: "slate" | "emerald" | "amber" | "rose" | "blue" | "violet" }) {
    const toneClass = {
        amber: "border-amber-200 bg-amber-50 text-amber-800",
        blue: "border-blue-200 bg-blue-50 text-blue-800",
        emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
        rose: "border-rose-200 bg-rose-50 text-rose-800",
        slate: "border-slate-200 bg-white text-slate-900",
        violet: "border-violet-200 bg-violet-50 text-violet-800",
    }[tone];
    return (
        <div className={`rounded-[22px] border p-4 shadow-sm ${toneClass}`}>
            <Icon size={20} />
            <p className="mt-3 text-xs font-black uppercase tracking-wide opacity-80">{title}</p>
            <p className="mt-1 text-xl font-black tabular-nums">{money(amount)}</p>
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
