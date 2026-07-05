"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock3, History, MessageCircle, Pencil, RotateCcw, Search, XCircle } from "lucide-react";
import { createPromiseFollowup, fulfilPromise, markBrokenPromise } from "@/app/actions/promises";
import type { Company, Office } from "@/lib/auth/types";
import type { PromiseCentreData, PromiseItem } from "@/lib/promises/types";
import PromiseCommandPanel from "./PromiseCommandPanel";
import { EnterpriseKpiCard, PageHero } from "@/components/office/shared/EnterpriseUI";

type Props = {
    activeCompany: Company | null;
    activeOffice: Office | null;
    canManage: boolean;
    data: PromiseCentreData;
};

function money(value: number) {
    return `UGX ${Math.round(value || 0).toLocaleString()}`;
}

function dateValue(promise: PromiseItem) {
    return promise.promised_date ?? promise.promise_date ?? "";
}

function displayStatus(promise: PromiseItem) {
    const status = String(promise.status ?? "open").toLowerCase();
    const today = new Date().toISOString().slice(0, 10);
    const due = dateValue(promise);
    if (status === "fulfilled") return "Paid";
    if (status === "broken") return "Broken";
    if (status === "rescheduled") return "Rescheduled";
    if (due === today) return "Due Today";
    if (due && due < today) return "Overdue";
    return "Active";
}

function statusClass(status: string) {
    if (status === "Paid") return "border-emerald-300/40 bg-emerald-300/10 text-emerald-100";
    if (status === "Broken" || status === "Overdue") return "border-red-300/40 bg-red-300/10 text-red-100";
    if (status === "Due Today") return "border-amber-300/40 bg-amber-300/10 text-amber-100";
    if (status === "Rescheduled") return "border-violet-300/40 bg-violet-300/10 text-violet-100";
    return "border-cyan-300/35 bg-cyan-300/10 text-cyan-100";
}

export default function PromiseCentre({ activeCompany, activeOffice, canManage, data }: Props) {
    const router = useRouter();
    const [selectedPromise, setSelectedPromise] = useState<PromiseItem | null>(null);
    const [query, setQuery] = useState("");
    const [officeFilter, setOfficeFilter] = useState("");
    const [isPending, startTransition] = useTransition();

    const officeOptions = useMemo(() => {
        const options = new Map<string, string>();
        for (const promise of data.ledger) {
            if (promise.office_id) options.set(promise.office_id, promise.officeName ?? "Office");
        }
        return [...options.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
    }, [data.ledger]);

    const filteredLedger = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        return data.ledger.filter((promise) => {
            if (officeFilter && promise.office_id !== officeFilter) return false;
            if (!normalized) return true;
            return [
                promise.roomNumber,
                promise.tenantName,
                promise.tenantPhone,
                promise.officeName,
                displayStatus(promise),
            ].some((item) => String(item ?? "").toLowerCase().includes(normalized));
        });
    }, [data.ledger, officeFilter, query]);

    function run(action: () => Promise<unknown>) {
        startTransition(async () => {
            await action();
            setSelectedPromise(null);
            router.refresh();
        });
    }

    return (
        <main className="enterprise-page">
            <div className="enterprise-shell">
                <PageHero
                    title="Promise Centre"
                    subtitle={`${activeOffice?.office_name ?? activeOffice?.name ?? "All offices"}${activeCompany ? ` · ${activeCompany.name}` : ""}`}
                    badge="Fast Promise Desk"
                >
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <Mini label="Due Today" value={data.kpis.dueToday} tone="text-amber-600" />
                        <Mini label="Overdue" value={data.kpis.overdue} tone="text-red-600" />
                        <Mini label="Broken" value={data.kpis.broken} tone="text-orange-600" />
                        <Mini label="Recovery" value={`${data.kpis.recoveryRate}%`} tone="text-emerald-600" />
                    </div>
                </PageHero>

                <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
                    <EnterpriseKpiCard title="Due Today" value={data.kpis.dueToday.toString()} tone="blue" trend="flat" trendLabel="call today" progress={data.kpis.dueToday ? 65 : 0} />
                    <EnterpriseKpiCard title="Due Tomorrow" value={data.kpis.dueTomorrow.toString()} tone="slate" trend="flat" trendLabel="pipeline" progress={35} />
                    <EnterpriseKpiCard title="Overdue" value={data.kpis.overdue.toString()} tone="red" trend="down" trendLabel="follow up" progress={data.kpis.overdue ? 80 : 0} status={data.kpis.overdue ? "Risk" : undefined} />
                    <EnterpriseKpiCard title="Paid" value={data.kpis.fulfilled.toString()} tone="green" trend="up" trendLabel="fulfilled" progress={70} />
                    <EnterpriseKpiCard title="Broken" value={data.kpis.broken.toString()} tone="orange" trend="down" trendLabel="escalate" progress={data.kpis.broken ? 60 : 0} />
                    <EnterpriseKpiCard title="Ledger Rows" value={data.ledger.length.toString()} tone="purple" trend="flat" trendLabel="live Supabase" progress={Math.min(100, data.ledger.length)} />
                </div>

                <div className="grid gap-5">
                    <PromiseCommandPanel
                        canManage={canManage}
                        selectedPromise={selectedPromise}
                        onClearSelection={() => setSelectedPromise(null)}
                        onSaved={() => router.refresh()}
                    />

                    <AiPromiseAssistant data={data} />

                    <section className="overflow-hidden rounded-[22px] border border-slate-800 bg-slate-950 shadow-2xl shadow-slate-950/20">
                        <div className="flex flex-col gap-3 border-b border-slate-800 p-4 xl:flex-row xl:items-center xl:justify-between">
                            <div>
                                <p className="text-xs font-black uppercase tracking-wide text-cyan-300">Promise Ledger</p>
                                <h2 className="text-xl font-black text-white">Recorded promises</h2>
                            </div>
                            <div className="grid gap-2 md:grid-cols-[260px_220px]">
                                <label className="relative">
                                    <Search className="absolute left-3 top-3.5 text-slate-500" size={16} />
                                    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search room, tenant, phone..." className="h-11 w-full rounded-xl border border-slate-700 bg-slate-900 pl-9 pr-3 text-sm font-bold text-white outline-none placeholder:text-slate-500 focus:border-cyan-300" />
                                </label>
                                <select value={officeFilter} onChange={(event) => setOfficeFilter(event.target.value)} className="h-11 rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm font-bold text-white outline-none focus:border-cyan-300">
                                    <option value="">All offices</option>
                                    {officeOptions.map((office) => <option key={office.id} value={office.id}>{office.name}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="overflow-auto">
                            <table className="w-full min-w-[1120px] text-left text-sm">
                                <thead className="sticky top-0 bg-slate-900 text-[11px] uppercase tracking-wide text-slate-400">
                                    <tr>
                                        <th className="px-3 py-3">Promise Date</th>
                                        <th className="px-3 py-3">Room</th>
                                        <th className="px-3 py-3">Tenant</th>
                                        <th className="px-3 py-3">Phone</th>
                                        <th className="px-3 py-3 text-right">Promise Amount</th>
                                        <th className="px-3 py-3 text-right">Outstanding</th>
                                        <th className="px-3 py-3">Status</th>
                                        <th className="px-3 py-3">Outcome</th>
                                        <th className="px-3 py-3">Recorded By</th>
                                        <th className="px-3 py-3">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800">
                                    {filteredLedger.map((promise) => {
                                        const status = displayStatus(promise);
                                        const latestFollowup = promise.followups.slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0] ?? null;
                                        return (
                                            <tr key={promise.id} className="bg-slate-950 text-slate-200 hover:bg-slate-900/80">
                                                <td className="px-3 py-2 font-bold text-white">{dateValue(promise) || "No date"}</td>
                                                <td className="px-3 py-2 font-black text-cyan-100">{promise.roomNumber ?? "No room"}</td>
                                                <td className="px-3 py-2">{promise.tenantName ?? "Tenant"}</td>
                                                <td className="px-3 py-2 text-slate-400">{promise.tenantPhone ?? "No phone"}</td>
                                                <td className="px-3 py-2 text-right font-black text-white">{money(Number(promise.promised_amount ?? promise.amount ?? 0))}</td>
                                                <td className="px-3 py-2 text-right text-amber-100">{money(Number(promise.tenantBalance ?? 0))}</td>
                                                <td className="px-3 py-2"><span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase ${statusClass(status)}`}>{status}</span></td>
                                                <td className="px-3 py-2 text-slate-400">{latestFollowup?.outcome ?? promise.notes ?? "No outcome"}</td>
                                                <td className="px-3 py-2 text-slate-400">{promise.createdByName ?? "Office"}</td>
                                                <td className="px-3 py-2">
                                                    <div className="flex items-center gap-1">
                                                        <IconButton title="Mark Paid" disabled={!canManage || isPending || status === "Paid" || status === "Broken"} onClick={() => run(() => fulfilPromise({ promiseId: promise.id }))} icon={<Check size={14} />} tone="green" />
                                                        <IconButton title="Follow Up" disabled={!canManage || isPending} onClick={() => run(() => createPromiseFollowup({ promiseId: promise.id, actionType: "follow_up", outcome: "Followed up" }))} icon={<MessageCircle size={14} />} />
                                                        <IconButton title="Reschedule" disabled={!canManage || isPending} onClick={() => setSelectedPromise(promise)} icon={<RotateCcw size={14} />} />
                                                        <IconButton title="Edit" disabled={!canManage || isPending} onClick={() => setSelectedPromise(promise)} icon={<Pencil size={14} />} />
                                                        <IconButton title="Broken" disabled={!canManage || isPending || status === "Paid" || status === "Broken"} onClick={() => run(() => markBrokenPromise({ promiseId: promise.id }))} icon={<XCircle size={14} />} tone="red" />
                                                        <IconButton title="History" disabled={false} onClick={() => setSelectedPromise(promise)} icon={<History size={14} />} tone="slate" />
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {filteredLedger.length === 0 && (
                                        <tr>
                                            <td colSpan={10} className="px-4 py-8 text-center text-sm font-bold text-slate-500">No promises match this view.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </div>
            </div>
        </main>
    );
}

function Mini({ label, value, tone }: { label: string; value: string | number; tone: string }) {
    return (
        <div className="enterprise-card px-4 py-3">
            <p className="text-xs font-bold text-slate-500">{label}</p>
            <p className={`text-2xl font-black ${tone}`}>{value}</p>
        </div>
    );
}

function AiPromiseAssistant({ data }: { data: PromiseCentreData }) {
    const highRisk = data.overdue.slice(0, 2);
    return (
        <section className="rounded-[22px] border border-cyan-300/20 bg-slate-950 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <p className="text-xs font-black uppercase tracking-wide text-cyan-300">AI Promise Assistant</p>
                    <h2 className="text-lg font-black text-white">Today’s follow-up focus</h2>
                </div>
                <div className="grid gap-2 text-xs font-bold text-slate-300 md:grid-cols-4">
                    <Insight icon={<Clock3 size={14} />} label="Due today" value={data.kpis.dueToday} />
                    <Insight icon={<XCircle size={14} />} label="Overdue" value={data.kpis.overdue} />
                    <Insight icon={<MessageCircle size={14} />} label="Broken" value={data.kpis.broken} />
                    <Insight icon={<Check size={14} />} label="Recovery" value={`${data.kpis.recoveryRate}%`} />
                </div>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
                <AssistantCard title="Call today" value={data.dueToday[0]?.tenantName ?? "No urgent due promise"} detail={data.dueToday[0]?.roomNumber ? `Room ${data.dueToday[0].roomNumber}` : "Keep monitoring"} />
                <AssistantCard title="Highest risk" value={highRisk[0]?.tenantName ?? "No overdue promise"} detail={highRisk[0]?.roomNumber ? `Room ${highRisk[0].roomNumber}` : "No escalation needed"} />
                <AssistantCard title="Recommended action" value={data.kpis.overdue ? "Follow up overdue promises first" : "Confirm promises due today"} detail="Use call, WhatsApp, visit, or notice based on tenant response." />
            </div>
        </section>
    );
}

function Insight({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
    return (
        <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2">
            <span className="text-cyan-200">{icon}</span>
            <span>{label}: <b className="text-white">{value}</b></span>
        </div>
    );
}

function AssistantCard({ title, value, detail }: { title: string; value: string; detail: string }) {
    return (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-3">
            <p className="text-[11px] font-black uppercase text-slate-500">{title}</p>
            <p className="mt-1 font-black text-white">{value}</p>
            <p className="mt-1 text-xs text-slate-400">{detail}</p>
        </div>
    );
}

function IconButton({ title, disabled, onClick, icon, tone = "blue" }: { title: string; disabled: boolean; onClick: () => void; icon: React.ReactNode; tone?: "blue" | "green" | "red" | "slate" }) {
    const tones = {
        blue: "bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/20",
        green: "bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/20",
        red: "bg-red-300/10 text-red-100 hover:bg-red-300/20",
        slate: "bg-slate-800 text-slate-200 hover:bg-slate-700",
    };
    return (
        <button title={title} aria-label={title} disabled={disabled} onClick={onClick} className={`grid h-8 w-8 place-items-center rounded-lg transition disabled:opacity-35 ${tones[tone]}`}>
            {icon}
        </button>
    );
}
