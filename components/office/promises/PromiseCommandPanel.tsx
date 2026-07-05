"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Search, Send } from "lucide-react";
import { createPromise, editPromise, reschedulePromise } from "@/app/actions/promises";
import type { PromiseItem, PromiseTenantOption } from "@/lib/promises/types";

type Props = {
    selectedPromise: PromiseItem | null;
    canManage: boolean;
    onSaved: () => void;
    onClearSelection: () => void;
};

function money(value: number) {
    return `UGX ${Math.round(value || 0).toLocaleString()}`;
}

function promiseDate(value: string | null | undefined) {
    return value ?? "";
}

export default function PromiseCommandPanel({ selectedPromise, canManage, onSaved, onClearSelection }: Props) {
    const [tenantQuery, setTenantQuery] = useState("");
    const [tenantResults, setTenantResults] = useState<PromiseTenantOption[]>([]);
    const [selectedTenant, setSelectedTenant] = useState<PromiseTenantOption | null>(null);
    const [amount, setAmount] = useState("");
    const [date, setDate] = useState("");
    const [outcome, setOutcome] = useState("");
    const [notes, setNotes] = useState("");
    const [message, setMessage] = useState<string | null>(null);
    const [messageTone, setMessageTone] = useState<"success" | "error" | "info">("info");
    const [isPending, setIsPending] = useState(false);
    const abortRef = useRef<AbortController | null>(null);
    const searchSeqRef = useRef(0);
    const prefillAppliedRef = useRef(false);

    useEffect(() => {
        if (prefillAppliedRef.current || typeof window === "undefined") return;
        prefillAppliedRef.current = true;
        const requestedRoom = new URLSearchParams(window.location.search).get("room")?.trim();
        if (requestedRoom) setTenantQuery(requestedRoom);
    }, []);

    useEffect(() => {
        if (!selectedPromise) return;
        setAmount(String(Number(selectedPromise.promised_amount ?? selectedPromise.amount ?? 0) || ""));
        setDate(promiseDate(selectedPromise.promised_date ?? selectedPromise.promise_date));
        setNotes(selectedPromise.notes ?? "");
        setOutcome("");
        setSelectedTenant(null);
        setTenantResults([]);
        setTenantQuery(selectedPromise.roomNumber ?? selectedPromise.tenantName ?? "");
    }, [selectedPromise]);

    useEffect(() => {
        const q = tenantQuery.trim();
        if (selectedPromise) return;
        if (q.length < 2) {
            abortRef.current?.abort();
            setTenantResults([]);
            setSelectedTenant(null);
            return;
        }
        const timer = setTimeout(() => searchTenants(q), 130);
        return () => clearTimeout(timer);
    }, [selectedPromise, tenantQuery]);

    useEffect(() => () => abortRef.current?.abort(), []);

    function resetForm() {
        setAmount("");
        setDate("");
        setOutcome("");
        setNotes("");
        setTenantQuery("");
        setTenantResults([]);
        setSelectedTenant(null);
        onClearSelection();
    }

    function chooseTenant(tenant: PromiseTenantOption) {
        setSelectedTenant(tenant);
        setTenantQuery(tenant.roomNumber ?? tenant.fullName);
        setTenantResults([]);
        setMessage(null);
    }

    function searchTenants(query: string) {
        const q = query.trim();
        if (q.length < 2) return;
        const requestSeq = searchSeqRef.current + 1;
        searchSeqRef.current = requestSeq;
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        void (async () => {
            setIsPending(true);
            setMessage(null);
            try {
                const response = await fetch(`/api/promises/search?q=${encodeURIComponent(q)}`, {
                    cache: "no-store",
                    signal: controller.signal,
                });
                const payload = await response.json();
                if (controller.signal.aborted || searchSeqRef.current !== requestSeq) return;
                if (!response.ok) {
                    setTenantResults([]);
                    setMessageTone("error");
                    setMessage(payload.error ?? "Tenant search failed.");
                    return;
                }
                const nextResults = (payload.results ?? []) as PromiseTenantOption[];
                setTenantResults(nextResults);
                const exact = nextResults.find((tenant) => tenant.roomNumber?.toLowerCase() === q.toLowerCase());
                setSelectedTenant(nextResults.length === 1 ? nextResults[0] : exact ?? null);
                if (!nextResults.length) {
                    setMessageTone("info");
                    setMessage("No tenant or room found.");
                }
            } catch (error) {
                if (controller.signal.aborted) return;
                setTenantResults([]);
                setMessageTone("error");
                setMessage(error instanceof Error ? error.message : "Tenant search failed.");
            } finally {
                if (searchSeqRef.current === requestSeq && !controller.signal.aborted) setIsPending(false);
            }
        })();
    }

    async function savePromise() {
        if (!canManage) return;
        const promisedAmount = Number(amount);
        if (!selectedPromise && !selectedTenant) {
            setMessageTone("error");
            setMessage("Select a room or tenant first.");
            return;
        }
        if (!Number.isFinite(promisedAmount) || promisedAmount <= 0) {
            setMessageTone("error");
            setMessage("Promise amount must be greater than zero.");
            return;
        }
        if (!date) {
            setMessageTone("error");
            setMessage("Promise date is required.");
            return;
        }
        setIsPending(true);
        setMessage(null);
        try {
            const combinedNotes = [outcome ? `Outcome: ${outcome}` : "", notes].filter(Boolean).join("\n");
            if (selectedPromise) {
                const currentDate = promiseDate(selectedPromise.promised_date ?? selectedPromise.promise_date);
                if (date !== currentDate) {
                    await reschedulePromise({ promiseId: selectedPromise.id, promisedDate: date, notes: combinedNotes || undefined });
                }
                await editPromise({ promiseId: selectedPromise.id, promisedAmount, promisedDate: date, notes: combinedNotes || undefined });
            } else {
                await createPromise({
                    tenantId: selectedTenant!.id,
                    promisedAmount,
                    promisedDate: date,
                    notes: combinedNotes || undefined,
                });
            }
            setMessageTone("success");
            setMessage(selectedPromise ? "Promise updated." : "Promise saved.");
            resetForm();
            onSaved();
        } catch (error) {
            setMessageTone("error");
            setMessage(error instanceof Error ? error.message : "Promise could not be saved.");
        } finally {
            setIsPending(false);
        }
    }

    return (
        <section className="rounded-[22px] border border-slate-800 bg-slate-950 p-4 shadow-2xl shadow-slate-950/25">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <p className="text-xs font-black uppercase tracking-wide text-cyan-300">Promise Entry</p>
                    <h2 className="text-xl font-black text-white">{selectedPromise ? "Edit selected promise" : "Fast tenant promise"}</h2>
                </div>
                <span className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs font-black ${isPending ? "bg-amber-300 text-slate-950" : "bg-emerald-300 text-slate-950"}`}>
                    <CheckCircle2 size={14} />
                    {isPending ? "Saving" : "Ready"}
                </span>
            </div>

            <div className="mt-4 grid gap-3 xl:grid-cols-[1.2fr_0.75fr_0.75fr_0.9fr]">
                <div className="relative">
                    <label className="text-xs font-black uppercase text-slate-400">Room number / tenant</label>
                    <div className="mt-1 flex gap-2">
                        <input
                            value={tenantQuery}
                            onChange={(event) => {
                                setTenantQuery(event.target.value);
                                setSelectedTenant(null);
                                onClearSelection();
                            }}
                            placeholder="Type K35, K35A, tenant name..."
                            className="h-11 min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm font-bold text-white outline-none placeholder:text-slate-500 focus:border-cyan-300"
                        />
                        <button type="button" onClick={() => searchTenants(tenantQuery)} className="grid h-11 w-11 place-items-center rounded-xl bg-cyan-300 text-slate-950">
                            <Search size={17} />
                        </button>
                    </div>
                    {tenantResults.length > 0 && (
                        <div className="absolute z-20 mt-2 max-h-64 w-full overflow-auto rounded-2xl border border-slate-700 bg-slate-950 p-2 shadow-2xl">
                            {tenantResults.map((tenant) => (
                                <button key={tenant.id} type="button" onClick={() => chooseTenant(tenant)} className="w-full rounded-xl px-3 py-2 text-left hover:bg-slate-800">
                                    <div className="flex items-center justify-between gap-3">
                                        <p className="text-sm font-black text-white">{tenant.roomNumber ? `Room ${tenant.roomNumber}` : tenant.fullName}</p>
                                        <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-black uppercase text-slate-300">{tenant.roomStatus ?? "active"}</span>
                                    </div>
                                    <p className="mt-1 text-xs font-semibold text-slate-400">{tenant.fullName} · {money(tenant.balance)}</p>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <Field label="Promise amount" value={amount} onChange={setAmount} type="number" placeholder="UGX" />
                <Field label="Promise date" value={date} onChange={setDate} type="date" />
                <Field label="Contact outcome" value={outcome} onChange={setOutcome} placeholder="Called, WhatsApp, visited..." />
            </div>

            {(selectedTenant || selectedPromise) && (
                <div className="mt-3 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-3">
                    <div className="grid gap-2 text-sm md:grid-cols-2 xl:grid-cols-6">
                        <Info label="Room" value={selectedTenant?.roomNumber ?? selectedPromise?.roomNumber ?? "No room"} />
                        <Info label="Tenant" value={selectedTenant?.fullName ?? selectedPromise?.tenantName ?? "Tenant"} />
                        <Info label="Phone" value={selectedTenant?.phone ?? selectedPromise?.tenantPhone ?? "No phone"} />
                        <Info label="Landlord" value={selectedTenant?.landlordName ?? "Landlord"} />
                        <Info label="Outstanding" value={money(selectedTenant?.balance ?? 0)} />
                        <Info label="Existing promises" value={selectedPromise ? selectedPromise.status ?? "selected" : "Check ledger"} />
                    </div>
                </div>
            )}

            <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_auto]">
                <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} placeholder="Promise notes" className="w-full resize-none rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-white outline-none placeholder:text-slate-500 focus:border-cyan-300" />
                <button disabled={!canManage || isPending} onClick={savePromise} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-emerald-300 px-5 text-sm font-black text-slate-950 shadow-lg shadow-emerald-950/20 disabled:opacity-50">
                    <Send size={17} />
                    Save Promise
                </button>
            </div>

            {message && (
                <p className={`mt-3 rounded-xl border px-3 py-2 text-xs font-bold ${messageTone === "success" ? "border-emerald-300/40 bg-emerald-300/10 text-emerald-100" : messageTone === "error" ? "border-red-300/40 bg-red-300/10 text-red-100" : "border-cyan-300/40 bg-cyan-300/10 text-cyan-100"}`}>
                    {message}
                </p>
            )}
        </section>
    );
}

function Field({ label, value, onChange, type = "text", placeholder = "" }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string }) {
    return (
        <label className="block">
            <span className="text-xs font-black uppercase text-slate-400">{label}</span>
            <input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-1 h-11 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm font-bold text-white outline-none placeholder:text-slate-500 focus:border-cyan-300" />
        </label>
    );
}

function Info({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <p className="text-[10px] font-black uppercase text-cyan-200/70">{label}</p>
            <p className="mt-0.5 truncate font-black text-white">{value}</p>
        </div>
    );
}
