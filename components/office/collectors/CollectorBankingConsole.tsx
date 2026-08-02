"use client";

import type React from "react";
import { useMemo, useState, useTransition } from "react";
import { Camera, CheckCircle2, FileImage, Landmark, Loader2, Upload, WalletCards, X } from "lucide-react";
import { submitCollectorBanking } from "@/app/actions/collector-banking";

type Office = { id: string; name: string };
type Row = Record<string, unknown>;

type Props = {
    data: {
        collector: { cashHeld: number; id: string; name: string };
        offices: Office[];
        submissions: Row[];
        totals: Record<string, number>;
    };
};

const money = (value: unknown) => `UGX ${Math.round(Number(value ?? 0)).toLocaleString()}`;
const today = () => new Date().toISOString().slice(0, 10);

export default function CollectorBankingConsole({ data }: Props) {
    const [amount, setAmount] = useState(String(Math.max(0, Math.round(data.totals.awaitingBanking ?? 0)) || ""));
    const [bankingDate, setBankingDate] = useState(today());
    const [bankName, setBankName] = useState("");
    const [destinationAccount, setDestinationAccount] = useState("");
    const [depositReference, setDepositReference] = useState("");
    const [notes, setNotes] = useState("");
    const [officeId, setOfficeId] = useState(data.offices[0]?.id ?? "");
    const [file, setFile] = useState<File | null>(null);
    const [message, setMessage] = useState("");
    const [isPending, startTransition] = useTransition();
    const previewUrl = useMemo(() => file && file.type.startsWith("image/") ? URL.createObjectURL(file) : null, [file]);
    const amountNumber = Number(amount || 0);
    const available = Number(data.totals.awaitingBanking ?? 0);
    const canSubmit = file && officeId && bankName.trim() && depositReference.trim() && amountNumber > 0 && amountNumber <= available && !isPending;

    function submit() {
        startTransition(async () => {
            try {
                if (!file) throw new Error("Upload the bank deposit slip before submitting.");
                const formData = new FormData();
                formData.set("amount", String(amountNumber));
                formData.set("bankingDate", bankingDate);
                formData.set("bankName", bankName);
                formData.set("destinationAccount", destinationAccount);
                formData.set("depositReference", depositReference);
                formData.set("notes", notes);
                formData.set("officeId", officeId);
                formData.set("idempotencyKey", crypto.randomUUID());
                formData.set("depositSlip", file);
                await submitCollectorBanking(formData);
                setMessage("Banking submitted for Admin verification. The amount is reserved and cannot be submitted again.");
                setFile(null);
                setDepositReference("");
                setNotes("");
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Collector banking submission failed.");
            }
        });
    }

    return (
        <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#0e7490_0,#020617_34%,#020617_100%)] px-4 py-5 text-white sm:px-6">
            <section className="mx-auto max-w-7xl">
                <div className="rounded-[2rem] border border-cyan-300/20 bg-slate-950/75 p-5 shadow-2xl shadow-black/30 backdrop-blur">
                    <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200">Collector Treasury</p>
                    <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                        <div className="min-w-0">
                            <h1 className="text-[clamp(1.8rem,4vw,3.2rem)] font-black tracking-tight">BANK COLLECTIONS</h1>
                            <p className="mt-2 max-w-3xl text-sm font-bold leading-6 text-slate-300">Bank collected cash directly and upload the deposit slip for Admin verification. Office handovers are closed for Collector accounts.</p>
                        </div>
                        <div className="rounded-3xl border border-emerald-300/20 bg-emerald-300/10 px-4 py-3">
                            <p className="text-xs font-black uppercase text-emerald-100">Banking Compliance</p>
                            <p className="mt-1 text-lg font-black text-white">{available > 0 ? "Banking Required" : "Healthy"}</p>
                        </div>
                    </div>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <Kpi icon={<WalletCards size={18} />} label="Cash Collected Today" value={money(data.totals.cashCollectedToday)} tone="green" />
                    <Kpi icon={<WalletCards size={18} />} label="Cash Currently Held" value={money(data.totals.cashCurrentlyHeld)} tone="amber" />
                    <Kpi icon={<Landmark size={18} />} label="Already Banked Today" value={money(data.totals.alreadyBankedToday)} tone="cyan" />
                    <Kpi icon={<Upload size={18} />} label="Awaiting Banking" value={money(data.totals.awaitingBanking)} tone="gold" />
                    <Kpi icon={<FileImage size={18} />} label="Pending Verification" value={money(data.totals.pendingVerification)} tone="purple" />
                    <Kpi icon={<CheckCircle2 size={18} />} label="Verified Banking" value={money(data.totals.verifiedBanking)} tone="green" />
                    <Kpi icon={<X size={18} />} label="Rejected Banking" value={money(data.totals.rejectedBanking)} tone="red" />
                    <Kpi icon={<Landmark size={18} />} label="Last Bank Deposit" value={money(data.totals.lastBankDeposit)} tone="cyan" />
                </div>

                <section className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
                    <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/80 p-5 shadow-xl shadow-black/20">
                        <div className="flex items-center gap-3">
                            <span className="rounded-2xl bg-cyan-300/15 p-3 text-cyan-100"><Landmark size={20} /></span>
                            <div>
                                <h2 className="text-xl font-black">Record Bank Deposit</h2>
                                <p className="text-sm font-bold text-slate-400">Deposit-slip photo is mandatory before submission.</p>
                            </div>
                        </div>
                        <div className="mt-5 grid gap-3 md:grid-cols-2">
                            <Readonly label="Collector" value={data.collector.name} />
                            <label className="text-xs font-black uppercase tracking-wide text-slate-400">Assigned office
                                <select value={officeId} onChange={(event) => setOfficeId(event.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-3 py-3 text-sm font-black text-white">
                                    {data.offices.map((office) => <option key={office.id} value={office.id}>{office.name}</option>)}
                                </select>
                            </label>
                            <Field label="Banking date" type="date" value={bankingDate} onChange={setBankingDate} />
                            <Field label="Amount banked" type="number" value={amount} onChange={setAmount} />
                            <Field label="Bank name" value={bankName} onChange={setBankName} placeholder="Centenary, Stanbic, Equity..." />
                            <Field label="Destination account" value={destinationAccount} onChange={setDestinationAccount} placeholder="Optional account label" />
                            <Field label="Slip/reference number" value={depositReference} onChange={setDepositReference} />
                            <Field label="Notes" value={notes} onChange={setNotes} />
                        </div>
                        <div className="mt-4 rounded-3xl border border-dashed border-cyan-300/35 bg-cyan-300/8 p-4">
                            <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-white/10 bg-slate-900/80 p-5 text-center hover:border-cyan-200/50">
                                <Camera className="text-cyan-200" size={28} />
                                <span className="mt-2 text-sm font-black text-white">Upload or capture deposit-slip photo</span>
                                <span className="mt-1 text-xs font-bold text-slate-400">JPG, JPEG, PNG, HEIC or PDF</span>
                                <input accept="image/jpeg,image/jpg,image/png,image/heic,image/heif,application/pdf" capture="environment" className="sr-only" type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
                            </label>
                            {file ? (
                                <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 sm:flex-row sm:items-center">
                                    {previewUrl ? <img alt="Deposit slip preview" src={previewUrl} className="h-24 w-24 rounded-xl object-cover" /> : <FileImage className="text-cyan-200" size={32} />}
                                    <div className="min-w-0 flex-1">
                                        <p className="break-words text-sm font-black text-white">{file.name}</p>
                                        <p className="text-xs font-bold text-slate-400">{Math.round(file.size / 1024).toLocaleString()} KB · {file.type || "file"}</p>
                                    </div>
                                    <button type="button" onClick={() => setFile(null)} className="rounded-xl border border-red-300/30 bg-red-400/15 px-3 py-2 text-xs font-black text-red-100">Remove photo</button>
                                </div>
                            ) : <p className="mt-3 text-sm font-black text-amber-100">Upload the bank deposit slip before submitting.</p>}
                        </div>
                        {amountNumber > available ? <p className="mt-3 rounded-2xl bg-red-500/15 px-4 py-3 text-sm font-black text-red-100">Amount banked cannot exceed available collector cash of {money(available)}.</p> : null}
                        {message ? <p className="mt-3 rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-cyan-100">{message}</p> : null}
                        <button type="button" disabled={!canSubmit} onClick={submit} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-300 px-5 py-3 text-sm font-black text-slate-950 shadow-lg shadow-emerald-950/20 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto">
                            {isPending ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
                            Submit for Admin Verification
                        </button>
                    </div>

                    <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/80 p-5 shadow-xl shadow-black/20">
                        <h2 className="text-xl font-black">Recent Banking Records</h2>
                        <p className="mt-1 text-sm font-bold text-slate-400">Pending requests reserve cash; rejected requests release it.</p>
                        <div className="mt-4 grid gap-3">
                            {data.submissions.length ? data.submissions.slice(0, 12).map((row) => <BankingRow key={String(row.id)} row={row} />) : <p className="rounded-2xl bg-white/5 p-4 text-sm font-bold text-slate-300">No collector banking records yet.</p>}
                        </div>
                    </div>
                </section>
            </section>
        </main>
    );
}

function Kpi({ icon, label, tone, value }: { icon: React.ReactNode; label: string; tone: "amber" | "cyan" | "gold" | "green" | "purple" | "red"; value: string }) {
    const tones = {
        amber: "border-amber-300/25 bg-amber-300/10 text-amber-100",
        cyan: "border-cyan-300/25 bg-cyan-300/10 text-cyan-100",
        gold: "border-yellow-300/25 bg-yellow-300/10 text-yellow-100",
        green: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
        purple: "border-purple-300/25 bg-purple-300/10 text-purple-100",
        red: "border-red-300/25 bg-red-300/10 text-red-100",
    };
    return <div className={`min-w-0 rounded-3xl border p-4 shadow-lg shadow-black/15 ${tones[tone]}`}><div className="flex items-center justify-between gap-2">{icon}<span className="text-[10px] font-black uppercase tracking-wide opacity-75">Live</span></div><p className="mt-3 text-xs font-black uppercase tracking-wide opacity-80">{label}</p><p className="mt-2 break-words text-[clamp(1.15rem,3vw,1.55rem)] font-black text-white">{value}</p></div>;
}

function Field({ label, onChange, placeholder, type = "text", value }: { label: string; onChange: (value: string) => void; placeholder?: string; type?: string; value: string }) {
    return <label className="text-xs font-black uppercase tracking-wide text-slate-400">{label}<input value={value} type={type} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full min-w-0 rounded-2xl border border-white/10 bg-slate-900 px-3 py-3 text-sm font-black text-white outline-none placeholder:text-slate-600 focus:border-cyan-300" /></label>;
}

function Readonly({ label, value }: { label: string; value: string }) {
    return <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3"><p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 break-words text-sm font-black text-white">{value}</p></div>;
}

function BankingRow({ row }: { row: Row }) {
    const status = String(row.status ?? "pending_verification");
    const tone = status === "verified" ? "text-emerald-100 bg-emerald-300/10 border-emerald-300/20" : status === "rejected" ? "text-red-100 bg-red-300/10 border-red-300/20" : "text-amber-100 bg-amber-300/10 border-amber-300/20";
    return (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <p className="text-base font-black text-white">{money(row.amount)}</p>
                    <p className="break-words text-xs font-bold text-slate-400">{String(row.bank_name ?? "Bank")} · Ref {String(row.deposit_reference ?? "N/A")}</p>
                </div>
                <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase ${tone}`}>{status.replace(/_/g, " ")}</span>
            </div>
            <p className="mt-2 text-xs font-bold text-slate-500">{String(row.banking_date ?? "")}</p>
        </div>
    );
}
