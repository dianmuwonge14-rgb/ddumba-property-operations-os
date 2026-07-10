"use client";

import type React from "react";
import { useEffect, useState, useTransition } from "react";
import { AlertTriangle, Banknote, BrainCircuit, CheckCircle2, Clock3, FileCheck2, Landmark, Loader2, MessageSquareText, ReceiptText, Search, SendHorizonal, ShieldAlert, Sparkles, Split, WalletCards } from "lucide-react";
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
    const pendingCount = data.submissions.filter((row) => String(row.status ?? "pending") === "pending").length;
    const rejectedAmount = data.totals.rejectedSubmissions ?? 0;
    const submittedVsCollected = Number(data.totals.approvedSubmissions ?? 0) + Number(data.totals.pendingSubmissions ?? 0);
    return (
        <main className="collector-page-shell text-white">
            <section className="collector-page-hero">
                <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="min-w-0">
                        <p className="collector-page-eyebrow">Field Collector</p>
                        <h1>{titleForMode(mode)}</h1>
                        <p className="collector-page-subtitle">Live collector cash control, office split, daily reconciliation, and submission approvals.</p>
                    </div>
                    <div className="grid min-w-0 grid-cols-2 gap-2 text-xs font-black sm:grid-cols-4 lg:min-w-[440px]">
                        <MiniStatus label="Pending" value={pendingCount} tone="amber" />
                        <MiniStatus label="Rejected" value={money(rejectedAmount)} tone="red" />
                        <MiniStatus label="Offices" value={data.collectionsByOffice.length} tone="cyan" />
                        <MiniStatus label="Rows" value={data.collections.length} tone="slate" />
                    </div>
                </div>
            </section>

            <div className="collector-kpi-grid">
                <Kpi label="Collected Today" value={money(data.totals.totalCollectedToday)} tone="green" hint="Approved collector-entered tenant payments today." />
                <Kpi label="Submitted and Approved" value={money(data.totals.approvedSubmissions)} tone="blue" hint="Cash handovers accepted by receiving offices." />
                <Kpi label="Money in Hand" value={money(data.totals.remainingInHand)} tone="amber" hint="Collected cash still held by the collector." />
                <Kpi label="Pending Submissions" value={money(data.totals.pendingSubmissions)} tone="purple" hint="Submitted cash waiting for office approval." />
                <Kpi label="Daily Total Collected" value={money(data.totals.totalCollectedToday)} tone="green" hint="Live daily collection total." />
                <Kpi label="Submitted vs Collected" value={money(submittedVsCollected)} tone="blue" hint="Approved plus pending submissions." />
                <Kpi label="Remaining Balance" value={money(data.totals.remainingInHand)} tone="amber" hint="Same as money in hand after approved movements." />
                <Kpi label="Office Splits" value={String(data.collectionsByOffice.length)} tone="cyan" hint="Offices represented in today’s collections." />
            </div>

            {mode === "payments" && <CollectorPaymentEntry />}
            {mode === "promises" && <CollectorPromiseEntry />}
            {mode === "submissions" && <CollectorSubmissionEnterprise data={data} />}
            {mode === "instructions" && <CollectorMessages data={data} />}
            {mode === "daily" && <CollectorDailyEnterprise data={data} />}
            {mode === "dashboard" && (
                <div className="collector-section-grid">
                    <MoneyInHandBreakdown data={data} />
                    <CollectorDailyEnterprise data={data} compact />
                    <CollectorMessages data={data} compact />
                    <RecentActivityPanel data={data} />
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

function Kpi({ hint, label, tone, value }: { hint: string; label: string; tone: string; value: string }) {
    const styles: Record<string, string> = {
        amber: "border-amber-300/20 bg-amber-300/10 text-amber-100",
        blue: "border-blue-300/20 bg-blue-300/10 text-blue-100",
        cyan: "border-cyan-300/20 bg-cyan-300/10 text-cyan-100",
        green: "border-emerald-300/20 bg-emerald-300/10 text-emerald-100",
        purple: "border-purple-300/20 bg-purple-300/10 text-purple-100",
    };
    return (
        <div className={`collector-kpi-card rounded-3xl border p-4 ${styles[tone]}`}>
            <p className="text-xs font-black uppercase tracking-wide opacity-75">{label}</p>
            <p className="collector-kpi-value">{value}</p>
            <p className="mt-2 text-xs font-bold leading-5 opacity-80">{hint}</p>
            <span className="mt-3 inline-flex rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[10px] font-black uppercase text-white/90">Live Supabase</span>
        </div>
    );
}

function MiniStatus({ label, tone, value }: { label: string; tone: "amber" | "cyan" | "red" | "slate"; value: string | number }) {
    const styles = {
        amber: "border-amber-300/20 bg-amber-300/10 text-amber-100",
        cyan: "border-cyan-300/20 bg-cyan-300/10 text-cyan-100",
        red: "border-red-300/20 bg-red-300/10 text-red-100",
        slate: "border-slate-300/20 bg-white/10 text-slate-100",
    };
    return <div className={`rounded-2xl border px-3 py-2 text-center ${styles[tone]}`}><p className="text-[10px] uppercase tracking-wide opacity-80">{label}</p><p className="mt-1 whitespace-nowrap">{value}</p></div>;
}

function MoneyInHandBreakdown({ data }: { data: Props["data"] }) {
    const collected = Number(data.totals.totalCollectedToday ?? 0);
    const approved = Number(data.totals.approvedSubmissions ?? 0);
    const expenses = Number(data.totals.collectorExpenses ?? 0);
    const reversals = Number(data.totals.reversals ?? 0);
    const inHand = Number(data.totals.remainingInHand ?? 0);
    return (
        <section className="collector-panel">
            <StickyTitle icon={<WalletCards size={18} />} subtitle="Approved collected cash minus approved outflows and reversals." title="Money in Hand Breakdown" />
            <div className="grid gap-3 sm:grid-cols-2">
                <BreakdownLine label="Approved collected cash" value={collected} tone="green" />
                <BreakdownLine label="Approved money submissions" value={approved} tone="blue" />
                <BreakdownLine label="Approved collector expenses" value={expenses} tone="amber" />
                <BreakdownLine label="Approved reversals" value={reversals} tone="red" />
            </div>
            <div className="mt-4 rounded-3xl border border-cyan-300/25 bg-cyan-300/10 p-4">
                <p className="text-xs font-black uppercase tracking-wide text-cyan-100">Money in Hand</p>
                <p className="mt-2 text-[clamp(1.35rem,4vw,2rem)] font-black text-white">{money(inHand)}</p>
                <p className="mt-2 text-sm font-bold leading-6 text-cyan-100">This is the collector cash balance used by submissions and daily reconciliation.</p>
            </div>
        </section>
    );
}

function BreakdownLine({ label, tone, value }: { label: string; tone: "amber" | "blue" | "green" | "red"; value: number }) {
    const tones = {
        amber: "text-amber-100",
        blue: "text-blue-100",
        green: "text-emerald-100",
        red: "text-red-100",
    };
    return (
        <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.06] p-3">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</p>
            <p className={`mt-2 text-[clamp(1rem,3vw,1.2rem)] font-black ${tones[tone]}`}>{money(value)}</p>
        </div>
    );
}

function RecentActivityPanel({ data }: { data: Props["data"] }) {
    const recentCollections = data.collections.slice(0, 4);
    const recentSubmissions = data.submissions.slice(0, 4);
    return (
        <section className="collector-panel">
            <StickyTitle icon={<ReceiptText size={18} />} subtitle="Latest collector payments and cash handovers." title="Recent Activity" />
            <div className="grid gap-4 lg:grid-cols-2">
                <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-wide text-slate-400">Payments</p>
                    <div className="mt-3 grid gap-2">
                        {recentCollections.length ? recentCollections.map((row) => <CollectionCard key={String(row.id ?? `${row.tenant_id}-${row.created_at}`)} row={row} />) : <EmptyPanel text="No recent collector payments." />}
                    </div>
                </div>
                <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-wide text-slate-400">Submissions</p>
                    <div className="mt-3 grid gap-2">
                        {recentSubmissions.length ? recentSubmissions.map((row) => <SubmissionCard key={String(row.id ?? `${row.created_at}-${row.amount}`)} row={row} offices={data.offices} />) : <EmptyPanel text="No recent submissions." />}
                    </div>
                </div>
            </div>
        </section>
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

function CollectorSubmissionEnterprise({ data }: { data: Props["data"] }) {
    const pendingRows = data.submissions.filter((row) => String(row.status ?? "pending") === "pending");
    const approvedRows = data.submissions.filter((row) => String(row.status ?? "") === "approved");
    const rejectedRows = data.submissions.filter((row) => String(row.status ?? "") === "rejected");
    const recentRows = data.submissions.slice(0, 12);

    return (
        <div className="mt-5 grid gap-5">
            <section className="grid gap-4 lg:grid-cols-5">
                <EnterpriseCard icon={<WalletCards size={20} />} label="Money in hand" tone="amber" value={money(data.totals.remainingInHand)} />
                <EnterpriseCard icon={<Banknote size={20} />} label="Collected today" tone="green" value={money(data.totals.totalCollectedToday)} />
                <EnterpriseCard icon={<Clock3 size={20} />} label="Submitted pending" tone="purple" value={money(data.totals.pendingSubmissions)} />
                <EnterpriseCard icon={<FileCheck2 size={20} />} label="Submitted approved" tone="blue" value={money(data.totals.approvedSubmissions)} />
                <EnterpriseCard icon={<ShieldAlert size={20} />} label="Rejected submissions" tone="red" value={money(data.totals.rejectedSubmissions)} />
            </section>

            <section className="grid gap-5 xl:grid-cols-[1fr_1.05fr]">
                <div className="rounded-3xl border border-cyan-300/20 bg-slate-950/80 p-5 shadow-2xl shadow-black/20">
                    <StickyTitle icon={<SendHorizonal size={18} />} subtitle="Submit cash to the receiving office for approval." title="Submit Money to Office" />
                    <CollectorSubmissionEntry offices={data.offices} />
                    <AiCashAssistant data={data} />
                </div>

                <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-5 shadow-2xl shadow-black/20">
                    <StickyTitle icon={<Landmark size={18} />} subtitle="Live split by the offices connected to today’s collections." title="Office Breakdown" />
                    <Breakdown title="Collected by office" rows={data.collectionsByOffice} />
                    <Breakdown title="Submission approvals" rows={[
                        { label: `${pendingRows.length} pending request${pendingRows.length === 1 ? "" : "s"}`, value: Number(data.totals.pendingSubmissions ?? 0) },
                        { label: `${approvedRows.length} approved request${approvedRows.length === 1 ? "" : "s"}`, value: Number(data.totals.approvedSubmissions ?? 0) },
                        { label: `${rejectedRows.length} rejected request${rejectedRows.length === 1 ? "" : "s"}`, value: Number(data.totals.rejectedSubmissions ?? 0) },
                    ]} />
                </div>
            </section>

            <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-950/80 shadow-2xl shadow-black/20">
                <div className="sticky top-[calc(var(--app-header-offset,0px)+0.5rem)] z-10 border-b border-white/10 bg-gradient-to-r from-teal-900 via-slate-950 to-cyan-950 px-5 py-4 shadow-lg">
                    <h2 className="text-lg font-black">Recent Submission History</h2>
                    <p className="text-xs font-bold text-slate-300">Pending, approved, and rejected office receipts.</p>
                </div>
                <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
                    {recentRows.length ? recentRows.map((row) => <SubmissionCard key={String(row.id ?? `${row.created_at}-${row.amount}`)} row={row} offices={data.offices} />) : <EmptyPanel text="No money submissions have been recorded yet." />}
                </div>
            </section>

            <ApprovalTimeline rows={recentRows} />
        </div>
    );
}

function CollectorDailyEnterprise({ compact = false, data }: { compact?: boolean; data: Props["data"] }) {
    const remaining = Number(data.totals.remainingInHand ?? 0);
    const submitted = Number(data.totals.approvedSubmissions ?? 0) + Number(data.totals.pendingSubmissions ?? 0);
    const rows = data.collections.slice(0, compact ? 6 : 30);

    return (
        <div className="mt-5 grid gap-5">
            <section className="grid gap-4 lg:grid-cols-4">
                <EnterpriseCard icon={<ReceiptText size={20} />} label="Daily total collected" tone="green" value={money(data.totals.totalCollectedToday)} />
                <EnterpriseCard icon={<SendHorizonal size={20} />} label="Submitted vs collected" tone="blue" value={money(submitted)} />
                <EnterpriseCard icon={<WalletCards size={20} />} label="Remaining balance" tone="amber" value={money(remaining)} />
                <EnterpriseCard icon={<Split size={20} />} label="Office splits" tone="purple" value={String(data.collectionsByOffice.length)} />
            </section>

            <section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
                <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-5">
                    <StickyTitle icon={<BrainCircuit size={18} />} subtitle="Cash risk, split mismatch, and end-of-day suggestions." title="AI End-of-Day Summary" />
                    <AiCashAssistant data={data} />
                    <EndOfDayReconciliation data={data} />
                </div>
                <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-5">
                    <StickyTitle icon={<Landmark size={18} />} subtitle="Live breakdown of today’s collector-entered payments." title="Daily Collection Breakdown" />
                    <div className="grid gap-4 lg:grid-cols-3">
                        <Breakdown title="By office" rows={data.collectionsByOffice} />
                        <Breakdown title="By landlord" rows={data.collectionsByLandlord} />
                        <Breakdown title="By method" rows={data.collectionsByMethod} />
                    </div>
                </div>
            </section>

            <section className="overflow-hidden rounded-3xl border border-white/10 bg-slate-950/80">
                <div className="sticky top-[calc(var(--app-header-offset,0px)+0.5rem)] z-10 border-b border-white/10 bg-gradient-to-r from-cyan-900 via-slate-950 to-blue-950 px-5 py-4 shadow-lg">
                    <h2 className="text-lg font-black">Tenant / Room Collections</h2>
                    <p className="text-xs font-bold text-slate-300">Every row is live from collector-entered Supabase collections.</p>
                </div>
                <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
                    {rows.length ? rows.map((row) => <CollectionCard key={String(row.id ?? `${row.tenant_id}-${row.created_at}`)} row={row} />) : <EmptyPanel text="No collector payments have been recorded today." />}
                </div>
            </section>
        </div>
    );
}

function CollectorMessages({ compact, data }: { compact?: boolean; data: Props["data"] }) {
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");
    const [message, setMessage] = useState("");
    const [isPending, startTransition] = useTransition();
    const visibleMessages = compact ? data.messages.slice(0, 5) : data.messages;
    return (
        <section className="collector-panel">
            <StickyTitle icon={<MessageSquareText size={18} />} subtitle="Send replies and review instructions without leaving the collector console." title="Instructions & Messages" />
            <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                <div className="min-w-0 rounded-3xl border border-white/10 bg-white/[0.05] p-4">
                    <p className="text-sm font-black text-white">Compose Message</p>
                    <div className="mt-4 grid gap-3">
                        <Field label="Subject" value={subject} onChange={setSubject} />
                        <TextareaField label="Message" value={body} onChange={setBody} />
                        <div className="flex flex-wrap items-center gap-3">
                            <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-2 text-xs font-black text-cyan-100">Recipient: Admin</span>
                            <ActionButton disabled={isPending || !subject || !body} label="Send Message" icon={<MessageSquareText size={16} />} onClick={() => startTransition(async () => {
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
                    </div>
                    <Status message={message} loading={isPending} />
                </div>
                <div className="min-w-0 rounded-3xl border border-white/10 bg-white/[0.05] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-black text-white">Recent Message History</p>
                        <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[10px] font-black uppercase text-slate-200">{visibleMessages.length} visible</span>
                    </div>
                    <div className="mt-4 grid gap-3">
                        {visibleMessages.length ? visibleMessages.map((item) => <MessageCard key={String(item.id)} item={item} />) : <EmptyPanel text="No collector messages yet." />}
                    </div>
                </div>
            </div>
        </section>
    );
}

function MessageCard({ item }: { item: Record<string, unknown> }) {
    const status = String(item.status ?? "unread");
    return (
        <article className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.06] p-3">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                <p className="min-w-0 text-sm font-black text-white">{String(item.subject ?? "Instruction")}</p>
                <StatusPill status={status} />
            </div>
            <p className="mt-2 text-sm font-bold leading-6 text-slate-300">{String(item.body ?? "")}</p>
            <p className="mt-2 text-xs font-bold text-slate-500">{String(item.priority ?? "normal")} · {String(item.created_at ?? item.updated_at ?? "").slice(0, 16).replace("T", " ")}</p>
        </article>
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

function AiCashAssistant({ data }: { data: Props["data"] }) {
    const collected = Number(data.totals.totalCollectedToday ?? 0);
    const pending = Number(data.totals.pendingSubmissions ?? 0);
    const approved = Number(data.totals.approvedSubmissions ?? 0);
    const inHand = Number(data.totals.remainingInHand ?? 0);
    const submissions = pending + approved;
    const alerts = [
        inHand > 0 ? { icon: <WalletCards size={15} />, title: "AI Missing Submission Detector", detail: `${money(inHand)} is still in collector hand. Submit or explain before close of day.`, tone: "amber" } : null,
        collected > 0 && submissions < collected ? { icon: <AlertTriangle size={15} />, title: "AI Cash Reconciliation Assistant", detail: `Submitted ${money(submissions)} against ${money(collected)} collected today.`, tone: "red" } : null,
        data.collectionsByOffice.length > 1 && pending > 0 ? { icon: <Split size={15} />, title: "AI Office Split Checker", detail: "Multiple offices collected today. Confirm each submission goes to the correct receiving office.", tone: "cyan" } : null,
        pending > 0 ? { icon: <Clock3 size={15} />, title: "AI Risk Alerts", detail: `${money(pending)} pending office approval. Follow up before end of day.`, tone: "purple" } : null,
        collected > 0 ? { icon: <Sparkles size={15} />, title: "AI Suggested Action", detail: inHand > 0 ? "Submit remaining money to the correct office now." : "Daily collector cash is reconciled for now.", tone: "green" } : null,
    ].filter(Boolean) as Array<{ detail: string; icon: React.ReactNode; title: string; tone: string }>;

    return (
        <div className="mt-4 rounded-3xl border border-cyan-300/20 bg-cyan-300/10 p-4">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-cyan-100"><BrainCircuit size={15} /> AI Cash Assistant</p>
            <div className="mt-3 grid gap-2">
                {alerts.length ? alerts.map((alert) => <AiAlert key={alert.title} {...alert} />) : <p className="rounded-2xl bg-white/10 px-3 py-2 text-sm font-bold text-cyan-50">No collector cash risks detected.</p>}
            </div>
        </div>
    );
}

function AiAlert({ detail, icon, title, tone }: { detail: string; icon: React.ReactNode; title: string; tone: string }) {
    const tones: Record<string, string> = {
        amber: "border-amber-300/25 bg-amber-300/10 text-amber-50",
        cyan: "border-cyan-300/25 bg-cyan-300/10 text-cyan-50",
        green: "border-emerald-300/25 bg-emerald-300/10 text-emerald-50",
        purple: "border-purple-300/25 bg-purple-300/10 text-purple-50",
        red: "border-red-300/25 bg-red-300/10 text-red-50",
    };
    return <article className={`rounded-2xl border px-3 py-2 ${tones[tone] ?? tones.cyan}`}><p className="flex items-center gap-2 text-sm font-black">{icon}{title}</p><p className="mt-1 text-xs font-bold opacity-85">{detail}</p></article>;
}

function EnterpriseCard({ icon, label, tone, value }: { icon: React.ReactNode; label: string; tone: string; value: string }) {
    const tones: Record<string, string> = {
        amber: "from-amber-500/20 to-slate-950 text-amber-100",
        blue: "from-blue-500/20 to-slate-950 text-blue-100",
        green: "from-emerald-500/20 to-slate-950 text-emerald-100",
        purple: "from-purple-500/20 to-slate-950 text-purple-100",
        red: "from-red-500/20 to-slate-950 text-red-100",
    };
    return <div className={`rounded-3xl border border-white/10 bg-gradient-to-br p-4 shadow-xl shadow-black/20 ${tones[tone] ?? tones.blue}`}><div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide opacity-80">{icon}{label}</div><p className="mt-3 whitespace-nowrap text-2xl font-black">{value}</p></div>;
}

function StickyTitle({ icon, subtitle, title }: { icon: React.ReactNode; subtitle: string; title: string }) {
    return <div className="sticky top-[calc(var(--app-header-offset,0px)+0.5rem)] z-10 -mx-5 -mt-5 mb-4 border-b border-white/10 bg-gradient-to-r from-slate-950 via-teal-950 to-cyan-950 px-5 py-4 shadow-lg"><p className="flex items-center gap-2 text-lg font-black text-white">{icon}{title}</p><p className="mt-1 text-xs font-bold text-slate-300">{subtitle}</p></div>;
}

function officeNameFor(offices: Props["data"]["offices"], officeId: unknown) {
    const office = offices.find((item) => item.id === String(officeId ?? ""));
    return office?.office_name ?? office?.name ?? "Office";
}

function SubmissionCard({ offices, row }: { offices: Props["data"]["offices"]; row: Record<string, unknown> }) {
    const status = String(row.status ?? "pending");
    return <article className="rounded-3xl border border-white/10 bg-white/[0.06] p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-black text-white">{money(row.amount)}</p><p className="mt-1 text-xs font-bold text-slate-400">{officeNameFor(offices, row.office_id)} · {String(row.reference ?? "No reference")}</p></div><StatusPill status={status} /></div><p className="mt-3 text-xs font-bold text-slate-400">{String(row.notes ?? "No notes")}</p><p className="mt-2 text-[11px] font-black uppercase text-slate-500">{String(row.created_at ?? "").slice(0, 16).replace("T", " ")}</p></article>;
}

function CollectionCard({ row }: { row: Record<string, unknown> }) {
    return <article className="rounded-3xl border border-white/10 bg-white/[0.06] p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-black text-white">Room {String(row.roomNumber ?? "No room")}</p><p className="mt-1 text-sm font-bold text-slate-300">{String(row.tenantName ?? "Tenant")}</p></div><p className="whitespace-nowrap font-black text-emerald-100">{money(row.amount_paid ?? row.amount)}</p></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs font-bold text-slate-400"><span>{String(row.officeName ?? "Office")}</span><span>{String(row.landlordName ?? "Landlord")}</span><span>{String(row.payment_method ?? "cash").replace(/_/g, " ")}</span><span>{String(row.payment_date ?? "").slice(0, 10)}</span></div></article>;
}

function StatusPill({ status }: { status: string }) {
    const tone = status === "approved" ? "bg-emerald-300/15 text-emerald-100 border-emerald-300/25" : status === "rejected" ? "bg-red-300/15 text-red-100 border-red-300/25" : "bg-amber-300/15 text-amber-100 border-amber-300/25";
    return <span className={`whitespace-nowrap rounded-full border px-2 py-1 text-[10px] font-black uppercase ${tone}`}>{status}</span>;
}

function ApprovalTimeline({ rows }: { rows: Record<string, unknown>[] }) {
    return <section className="rounded-3xl border border-white/10 bg-slate-950/80 p-5"><StickyTitle icon={<Clock3 size={18} />} subtitle="Latest approval statuses from office receipt workflow." title="Approval Status Timeline" /><div className="space-y-3">{rows.length ? rows.slice(0, 8).map((row) => <div key={String(row.id ?? row.created_at)} className="flex items-start gap-3 rounded-2xl bg-white/[0.06] p-3"><span className="mt-1 h-3 w-3 rounded-full bg-cyan-300" /><div className="min-w-0 flex-1"><p className="font-black text-white">{money(row.amount)} · {String(row.status ?? "pending")}</p><p className="text-xs font-bold text-slate-400">{String(row.created_at ?? "").slice(0, 16).replace("T", " ")} · {String(row.notes ?? "No notes")}</p></div></div>) : <EmptyPanel text="No submission timeline yet." />}</div></section>;
}

function EndOfDayReconciliation({ data }: { data: Props["data"] }) {
    const collected = Number(data.totals.totalCollectedToday ?? 0);
    const approved = Number(data.totals.approvedSubmissions ?? 0);
    const pending = Number(data.totals.pendingSubmissions ?? 0);
    const remaining = Number(data.totals.remainingInHand ?? 0);
    const variance = collected - approved - pending - remaining;
    return <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.06] p-4"><p className="flex items-center gap-2 text-sm font-black text-white"><FileCheck2 size={16} /> End-of-day reconciliation</p><div className="mt-3 grid gap-2 text-sm font-bold text-slate-300 sm:grid-cols-2"><span>Collected: {money(collected)}</span><span>Approved: {money(approved)}</span><span>Pending: {money(pending)}</span><span>Remaining: {money(remaining)}</span></div><p className={`mt-3 rounded-2xl px-3 py-2 text-xs font-black ${Math.abs(variance) < 1 ? "bg-emerald-300/10 text-emerald-100" : "bg-amber-300/10 text-amber-100"}`}>Reconciliation variance: {money(variance)}</p></div>;
}

function EmptyPanel({ text }: { text: string }) {
    return <p className="rounded-3xl border border-white/10 bg-white/[0.06] p-5 text-sm font-bold text-slate-400">{text}</p>;
}

function Breakdown({ rows, title }: { rows: Array<{ label: string; value: number }>; title: string }) {
    return <div className="mt-4"><p className="text-xs font-black uppercase tracking-wide text-slate-400">{title}</p><div className="mt-2 space-y-2">{rows.length ? rows.map((row) => <div key={row.label} className="flex items-center justify-between gap-3 rounded-2xl bg-white/5 px-3 py-2 text-sm"><span className="font-bold text-slate-200">{row.label}</span><span className="font-black text-white">{money(row.value)}</span></div>) : <p className="rounded-2xl bg-white/5 px-3 py-2 text-sm font-bold text-slate-400">No records yet.</p>}</div></div>;
}

function Field({ label, onChange, type = "text", value }: { label: string; onChange: (value: string) => void; type?: string; value: string }) {
    return <label className="text-xs font-black uppercase tracking-wide text-slate-400">{label}<input value={value} type={type} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-3 py-3 text-sm font-black text-white outline-none focus:border-cyan-300" /></label>;
}

function TextareaField({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
    return (
        <label className="text-xs font-black uppercase tracking-wide text-slate-400">
            {label}
            <textarea
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="mt-2 min-h-32 w-full resize-y rounded-2xl border border-white/10 bg-slate-900 px-3 py-3 text-sm font-bold leading-6 text-white outline-none focus:border-cyan-300"
            />
        </label>
    );
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
