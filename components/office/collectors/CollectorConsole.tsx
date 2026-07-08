"use client";

import type React from "react";
import { useEffect, useState, useTransition } from "react";
import { Banknote, CheckCircle2, Loader2, MessageSquareText, Search, SendHorizonal } from "lucide-react";
import { recordCollectorPayment, recordCollectorPromise, sendCollectorMessage, submitCollectorMoney } from "@/app/actions/collectors";

type SearchResult = {
    balance: number;
    landlordName: string;
    officeId: string;
    officeName: string;
    phone: string;
    roomId: string | null;
    roomNumber: string;
    tenantId: string;
    tenantName: string;
};

type Props = {
    data: {
        collections: Record<string, unknown>[];
        collectionsByLandlord: Array<{ label: string; value: number }>;
        collectionsByMethod: Array<{ label: string; value: number }>;
        collectionsByOffice: Array<{ label: string; value: number }>;
        messages: Record<string, unknown>[];
        offices: Array<{ id: string; office_name?: string | null; name?: string | null }>;
        profile: Record<string, unknown> | null;
        submissions: Record<string, unknown>[];
        totals: Record<string, number>;
    };
    mode: "dashboard" | "payments" | "promises" | "submissions" | "instructions" | "daily";
};

const money = (value: unknown) => `UGX ${Math.round(Number(value ?? 0)).toLocaleString()}`;

export default function CollectorConsole({ data, mode }: Props) {
    return (
        <main className="mx-auto max-w-7xl px-4 py-6 text-white">
            <section className="rounded-3xl border border-white/10 bg-slate-950/80 p-5 shadow-2xl shadow-black/30">
                <p className="text-xs font-black uppercase tracking-wide text-cyan-300">Field Collector</p>
                <h1 className="mt-2 text-3xl font-black">{titleForMode(mode)}</h1>
                <p className="mt-2 text-sm font-bold text-slate-400">All-rounder collector workspace. Every record is live and attached to the correct office, tenant, landlord, and room.</p>
            </section>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Kpi label="Collected today" value={money(data.totals.totalCollectedToday)} tone="green" />
                <Kpi label="Submitted approved" value={money(data.totals.totalSubmitted)} tone="blue" />
                <Kpi label="Money in hand" value={money(data.totals.remainingInHand)} tone="amber" />
                <Kpi label="Pending submissions" value={money(data.totals.pendingSubmissions)} tone="purple" />
            </div>

            {mode === "payments" && <CollectorPaymentEntry />}
            {mode === "promises" && <CollectorPromiseEntry />}
            {mode === "submissions" && <CollectorSubmissionEntry offices={data.offices} />}
            {mode === "instructions" && <CollectorMessages data={data} />}
            {mode === "daily" && <DailyBreakdown data={data} />}
            {mode === "dashboard" && (
                <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
                    <DailyBreakdown data={data} />
                    <CollectorMessages data={data} compact />
                </div>
            )}
        </main>
    );
}

function titleForMode(mode: Props["mode"]) {
    if (mode === "payments") return "Collector Payments Entry";
    if (mode === "promises") return "Collector Promise Entry";
    if (mode === "submissions") return "Collector Money Submission";
    if (mode === "instructions") return "Collector Instructions & Messages";
    if (mode === "daily") return "Collector Daily Collections";
    return "Collector Dashboard";
}

function Kpi({ label, tone, value }: { label: string; tone: string; value: string }) {
    const styles: Record<string, string> = {
        amber: "border-amber-300/20 bg-amber-300/10 text-amber-100",
        blue: "border-blue-300/20 bg-blue-300/10 text-blue-100",
        green: "border-emerald-300/20 bg-emerald-300/10 text-emerald-100",
        purple: "border-purple-300/20 bg-purple-300/10 text-purple-100",
    };
    return (
        <div className={`rounded-3xl border p-4 ${styles[tone]}`}>
            <p className="text-xs font-black uppercase tracking-wide opacity-75">{label}</p>
            <p className="mt-2 text-2xl font-black">{value}</p>
        </div>
    );
}

function useTenantSearch() {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SearchResult[]>([]);
    const [selected, setSelected] = useState<SearchResult | null>(null);
    useEffect(() => {
        if (query.trim().length < 2) {
            setResults([]);
            return;
        }
        const controller = new AbortController();
        const timer = setTimeout(async () => {
            const response = await fetch(`/api/collector/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal });
            const payload = await response.json().catch(() => ({ results: [] }));
            setResults(payload.results ?? []);
        }, 140);
        return () => {
            controller.abort();
            clearTimeout(timer);
        };
    }, [query]);
    return { query, results, selected, setQuery, setResults, setSelected };
}

function SearchBox({ search }: { search: ReturnType<typeof useTenantSearch> }) {
    return (
        <div className="relative">
            <label className="text-xs font-black uppercase tracking-wide text-slate-400">Search room, tenant, phone, landlord</label>
            <div className="mt-2 flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900 px-3 py-2">
                <Search size={16} className="text-cyan-300" />
                <input value={search.query} onChange={(event) => search.setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm font-bold text-white outline-none placeholder:text-slate-500" placeholder="K35, Nakato, 07..., landlord..." />
            </div>
            {search.results.length > 0 && (
                <div className="absolute z-30 mt-2 max-h-72 w-full overflow-y-auto rounded-2xl border border-white/10 bg-slate-950 shadow-2xl">
                    {search.results.map((item) => (
                        <button key={`${item.tenantId}-${item.roomId}`} type="button" onClick={() => { search.setSelected(item); search.setResults([]); search.setQuery(item.roomNumber); }} className="w-full border-b border-white/10 px-4 py-3 text-left hover:bg-white/10">
                            <p className="font-black text-white">Room {item.roomNumber} · {item.tenantName}</p>
                            <p className="text-xs font-bold text-slate-400">{item.phone || "No phone"} · {item.landlordName} · {item.officeName} · Balance {money(item.balance)}</p>
                        </button>
                    ))}
                </div>
            )}
            {search.selected && (
                <div className="mt-3 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-3">
                    <p className="font-black text-cyan-50">{search.selected.tenantName}</p>
                    <p className="text-sm font-bold text-cyan-100">Room {search.selected.roomNumber} · {search.selected.phone || "No phone"} · {search.selected.officeName}</p>
                    <p className="text-xs font-bold text-cyan-200">{search.selected.landlordName} · Outstanding {money(search.selected.balance)}</p>
                </div>
            )}
        </div>
    );
}

function CollectorPaymentEntry() {
    const search = useTenantSearch();
    const [amount, setAmount] = useState("");
    const [method, setMethod] = useState("cash");
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
    const [notes, setNotes] = useState("");
    const [message, setMessage] = useState("");
    const [isPending, startTransition] = useTransition();
    return (
        <section className="mt-5 rounded-3xl border border-white/10 bg-slate-950/70 p-5">
            <SearchBox search={search} />
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
                <Field label="Amount paid" value={amount} onChange={setAmount} type="number" />
                <Field label="Payment date" value={date} onChange={setDate} type="date" />
                <Select label="Method" value={method} onChange={setMethod} options={["cash", "mobile_money", "bank", "cheque"]} />
                <Field label="Notes" value={notes} onChange={setNotes} />
            </div>
            <ActionButton disabled={!search.selected || isPending} label="Record Collector Payment" icon={<Banknote size={16} />} onClick={() => startTransition(async () => {
                try {
                    if (!search.selected) return;
                    await recordCollectorPayment({ amount: Number(amount), notes, paymentDate: date, paymentMethod: method, tenantId: search.selected.tenantId });
                    setMessage("Payment recorded live. Office collections updated and collector money in hand increased.");
                    setAmount("");
                    setNotes("");
                } catch (error) {
                    setMessage(error instanceof Error ? error.message : "Payment failed.");
                }
            })} />
            <Status message={message} loading={isPending} />
        </section>
    );
}

function CollectorPromiseEntry() {
    const search = useTenantSearch();
    const [amount, setAmount] = useState("");
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
    const [notes, setNotes] = useState("");
    const [message, setMessage] = useState("");
    const [isPending, startTransition] = useTransition();
    return (
        <section className="mt-5 rounded-3xl border border-white/10 bg-slate-950/70 p-5">
            <SearchBox search={search} />
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                <Field label="Promise amount" value={amount} onChange={setAmount} type="number" />
                <Field label="Promise date" value={date} onChange={setDate} type="date" />
                <Field label="Notes" value={notes} onChange={setNotes} />
            </div>
            <ActionButton disabled={!search.selected || isPending} label="Save Collector Promise" icon={<CheckCircle2 size={16} />} onClick={() => startTransition(async () => {
                try {
                    if (!search.selected) return;
                    await recordCollectorPromise({ notes, promisedAmount: Number(amount), promisedDate: date, tenantId: search.selected.tenantId });
                    setMessage("Promise saved live to the tenant office.");
                    setAmount("");
                    setNotes("");
                } catch (error) {
                    setMessage(error instanceof Error ? error.message : "Promise failed.");
                }
            })} />
            <Status message={message} loading={isPending} />
        </section>
    );
}

function CollectorSubmissionEntry({ offices }: { offices: Props["data"]["offices"] }) {
    const [amount, setAmount] = useState("");
    const [officeId, setOfficeId] = useState(offices[0]?.id ?? "");
    const [notes, setNotes] = useState("");
    const [message, setMessage] = useState("");
    const [isPending, startTransition] = useTransition();
    return (
        <section className="mt-5 rounded-3xl border border-white/10 bg-slate-950/70 p-5">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <Field label="Amount submitted" value={amount} onChange={setAmount} type="number" />
                <label className="text-xs font-black uppercase tracking-wide text-slate-400">Receiving office<select value={officeId} onChange={(event) => setOfficeId(event.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-3 py-3 text-sm font-black text-white">{offices.map((office) => <option key={office.id} value={office.id}>{office.office_name ?? office.name}</option>)}</select></label>
                <Field label="Notes" value={notes} onChange={setNotes} />
                <ActionButton disabled={isPending || !officeId} label="Submit Money to Office" icon={<SendHorizonal size={16} />} onClick={() => startTransition(async () => {
                    try {
                        await submitCollectorMoney({ amount: Number(amount), officeId, notes });
                        setAmount("");
                        setNotes("");
                        setMessage("Submission sent for office approval.");
                    } catch (error) {
                        setMessage(error instanceof Error ? error.message : "Submission failed.");
                    }
                })} />
            </div>
            <Status message={message} loading={isPending} />
        </section>
    );
}

function CollectorMessages({ compact, data }: { compact?: boolean; data: Props["data"] }) {
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");
    const [message, setMessage] = useState("");
    const [isPending, startTransition] = useTransition();
    const visibleMessages = compact ? data.messages.slice(0, 5) : data.messages;
    return (
        <section className="mt-5 rounded-3xl border border-white/10 bg-slate-950/70 p-5">
            <h2 className="text-xl font-black">Instructions & Messages</h2>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_2fr_auto]">
                <Field label="Subject" value={subject} onChange={setSubject} />
                <Field label="Message" value={body} onChange={setBody} />
                <ActionButton disabled={isPending || !subject || !body} label="Send Reply" icon={<MessageSquareText size={16} />} onClick={() => startTransition(async () => {
                    try {
                        await sendCollectorMessage({ body, recipientType: "admin", subject });
                        setSubject("");
                        setBody("");
                        setMessage("Message sent.");
                    } catch (error) {
                        setMessage(error instanceof Error ? error.message : "Message failed.");
                    }
                })} />
            </div>
            <Status message={message} loading={isPending} />
            <div className="mt-4 space-y-2">
                {visibleMessages.map((item) => <div key={String(item.id)} className="rounded-2xl border border-white/10 bg-white/5 p-3"><p className="font-black">{String(item.subject ?? "Instruction")}</p><p className="text-sm text-slate-300">{String(item.body ?? "")}</p><p className="mt-1 text-xs font-bold text-slate-500">{String(item.priority ?? "normal")} · {String(item.status ?? "unread")}</p></div>)}
            </div>
        </section>
    );
}

function DailyBreakdown({ data }: { data: Props["data"] }) {
    return (
        <section className="mt-5 rounded-3xl border border-white/10 bg-slate-950/70 p-5">
            <h2 className="text-xl font-black">Daily Collector Report</h2>
            <Breakdown title="By office" rows={data.collectionsByOffice} />
            <Breakdown title="By landlord" rows={data.collectionsByLandlord} />
            <Breakdown title="By payment method" rows={data.collectionsByMethod} />
            <Breakdown title="Submissions" rows={data.submissions.slice(0, 8).map((row) => ({ label: `${row.status ?? "pending"} · ${row.reference ?? "No ref"}`, value: Number(row.amount ?? 0) }))} />
        </section>
    );
}

function Breakdown({ rows, title }: { rows: Array<{ label: string; value: number }>; title: string }) {
    return <div className="mt-4"><p className="text-xs font-black uppercase tracking-wide text-slate-400">{title}</p><div className="mt-2 space-y-2">{rows.length ? rows.map((row) => <div key={row.label} className="flex items-center justify-between gap-3 rounded-2xl bg-white/5 px-3 py-2 text-sm"><span className="font-bold text-slate-200">{row.label}</span><span className="font-black text-white">{money(row.value)}</span></div>) : <p className="rounded-2xl bg-white/5 px-3 py-2 text-sm font-bold text-slate-400">No records yet.</p>}</div></div>;
}

function Field({ label, onChange, type = "text", value }: { label: string; onChange: (value: string) => void; type?: string; value: string }) {
    return <label className="text-xs font-black uppercase tracking-wide text-slate-400">{label}<input value={value} type={type} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-3 py-3 text-sm font-black text-white outline-none focus:border-cyan-300" /></label>;
}

function Select({ label, onChange, options, value }: { label: string; onChange: (value: string) => void; options: string[]; value: string }) {
    return <label className="text-xs font-black uppercase tracking-wide text-slate-400">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-3 py-3 text-sm font-black text-white">{options.map((option) => <option key={option} value={option}>{option.replace(/_/g, " ")}</option>)}</select></label>;
}

function ActionButton({ disabled, icon, label, onClick }: { disabled: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
    return <button type="button" disabled={disabled} onClick={onClick} className="mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-cyan-300 px-5 text-sm font-black text-slate-950 shadow-lg shadow-cyan-950/20 disabled:opacity-50">{icon}{label}</button>;
}

function Status({ loading, message }: { loading: boolean; message: string }) {
    if (!loading && !message) return null;
    return <p className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-black text-cyan-100">{loading ? <Loader2 className="mr-2 inline animate-spin" size={14} /> : null}{message || "Working..."}</p>;
}
