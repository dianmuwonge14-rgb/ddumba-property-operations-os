"use client";

import { useMemo, useState } from "react";
import { Download, Eye, History, Mail, Printer, ReceiptText, Search } from "lucide-react";
import { logReceiptPrintOrDownload } from "@/app/actions/receipts";
import type { ReceiptHistoryItem } from "@/lib/receipts/data";

type Props = {
    error: string | null;
    receipts: ReceiptHistoryItem[];
};

function money(value: number) {
    return `UGX ${Math.round(value).toLocaleString()}`;
}

function searchable(receipt: ReceiptHistoryItem) {
    const snapshot = receipt.snapshot;
    return [
        receipt.receiptNumber,
        receipt.roomNumber,
        receipt.tenantName,
        receipt.tenantPhone,
        receipt.officeName,
        receipt.recordedByName,
        receipt.issuedAt,
        receipt.verificationCode,
        snapshot.landlordName,
        snapshot.paymentMethod,
        snapshot.referenceNumber,
        snapshot.collectorName,
        snapshot.coveragePeriod,
    ].filter(Boolean).join(" ").toLowerCase();
}

export default function ReceiptHistoryConsole({ error, receipts }: Props) {
    const [query, setQuery] = useState("");
    const [selected, setSelected] = useState<ReceiptHistoryItem | null>(null);
    const visible = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        if (!normalized) return receipts;
        return receipts.filter((receipt) => searchable(receipt).includes(normalized));
    }, [query, receipts]);
    const printReceipt = (receipt: ReceiptHistoryItem, channel: "download_pdf" | "print") => {
        void logReceiptPrintOrDownload({ channel, receiptId: receipt.id });
        setSelected(receipt);
        document.body.classList.add("print-tenant-payment-receipt");
        window.setTimeout(() => {
            window.print();
            window.setTimeout(() => document.body.classList.remove("print-tenant-payment-receipt"), 500);
        }, 50);
    };

    return (
        <main className="enterprise-page">
            <div className="enterprise-shell">
                <section className="rounded-[28px] border border-white/10 bg-slate-950 p-5 text-white shadow-2xl">
                    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                        <div>
                            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-black uppercase text-cyan-100">
                                <ReceiptText size={14} /> Live Supabase receipts
                            </div>
                            <h1 className="mt-3 text-3xl font-black">Receipt History</h1>
                            <p className="mt-1 text-sm font-bold text-slate-300">Search, resend, reprint, and verify payment receipts.</p>
                        </div>
                        <label className="relative block md:w-96">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                            <input value={query} onChange={(event) => setQuery(event.target.value)} className="h-12 w-full rounded-2xl border border-white/10 bg-white/10 pl-11 pr-4 text-sm font-bold text-white outline-none placeholder:text-slate-400" placeholder="Receipt, room, tenant, phone, date, office..." />
                        </label>
                    </div>
                </section>

                {error ? <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-black text-amber-900">{error}</p> : null}

                <section className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {visible.length ? visible.map((receipt) => (
                        <article key={receipt.id} className="min-w-0 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="truncate text-lg font-black text-slate-950">{receipt.receiptNumber}</p>
                                    <p className="text-xs font-bold text-slate-500">{receipt.issuedAt ? new Date(receipt.issuedAt).toLocaleString() : "No timestamp"}</p>
                                </div>
                                <span className="whitespace-nowrap rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black capitalize text-emerald-700">{receipt.status}</span>
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                                <Info label="Room" value={receipt.roomNumber ?? "N/A"} />
                                <Info label="Tenant" value={receipt.tenantName ?? "Unnamed"} />
                                <Info label="Phone" value={receipt.tenantPhone ?? "No phone"} />
                                <Info label="Office" value={receipt.officeName ?? "Office"} />
                                <Info label="Amount" value={money(receipt.amountPaid)} />
                                <Info label="Balance" value={money(receipt.remainingOutstandingBalance)} />
                            </div>
                            <p className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-xs font-black text-slate-600">Verification: {receipt.verificationCode}</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                <button type="button" onClick={() => setSelected(receipt)} className="inline-flex items-center gap-1 rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-800 ring-1 ring-slate-200"><Eye size={13} /> View</button>
                                <button type="button" onClick={() => printReceipt(receipt, "print")} className="inline-flex items-center gap-1 rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white"><Printer size={13} /> Reprint</button>
                                <button type="button" onClick={() => printReceipt(receipt, "download_pdf")} className="inline-flex items-center gap-1 rounded-xl bg-blue-700 px-3 py-2 text-xs font-black text-white"><Download size={13} /> PDF</button>
                                <a href={`mailto:?subject=${encodeURIComponent(`DDUMBA OS Receipt ${receipt.receiptNumber}`)}&body=${encodeURIComponent(`Receipt ${receipt.receiptNumber} for ${receipt.tenantName ?? "tenant"}: ${money(receipt.amountPaid)}. Verification ${receipt.verificationCode}.`)}`} className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white"><Mail size={13} /> Resend</a>
                                <a href={`/office/payments?receipt=${receipt.id}&payment=${receipt.paymentId}`} className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700"><ReceiptText size={13} /> Payment</a>
                                <a href={`/office/payments?history=${receipt.paymentId}`} className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700"><History size={13} /> Corrections</a>
                            </div>
                        </article>
                    )) : (
                        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center md:col-span-2 xl:col-span-3">
                            <p className="font-black text-slate-800">No receipts found.</p>
                            <p className="mt-1 text-sm font-bold text-slate-500">Successful payment receipts will appear here after migration 0204 is applied.</p>
                        </div>
                    )}
                </section>
            </div>
            {selected ? (
                <div className="fixed inset-0 z-[120] overflow-y-auto bg-slate-950/80 p-4 backdrop-blur print:static print:bg-white print:p-0">
                    <div className="mx-auto max-w-3xl rounded-[28px] bg-white p-4 text-slate-950 shadow-2xl print:max-w-none print:rounded-none print:p-0 print:shadow-none">
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-700">Receipt preview</p>
                                <h2 className="text-2xl font-black">{selected.receiptNumber}</h2>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={() => printReceipt(selected, "print")} className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-black text-white">Print</button>
                                <button type="button" onClick={() => printReceipt(selected, "download_pdf")} className="rounded-2xl bg-blue-700 px-4 py-2 text-sm font-black text-white">Download PDF</button>
                                <button type="button" onClick={() => setSelected(null)} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-700">Close</button>
                            </div>
                        </div>
                        <ReceiptPreview receipt={selected} />
                    </div>
                </div>
            ) : null}
        </main>
    );
}

function Info({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-w-0 rounded-2xl bg-slate-50 p-3">
            <p className="text-[10px] font-black uppercase text-slate-500">{label}</p>
            <p className="mt-1 break-words text-sm font-black text-slate-950">{value}</p>
        </div>
    );
}

function ReceiptPreview({ receipt }: { receipt: ReceiptHistoryItem }) {
    const row = receipt.snapshot;
    const coveragePeriods = row.coveragePeriods?.length
        ? row.coveragePeriods
        : row.coveragePeriod ? [{ amount: row.amountApplied, label: row.coveragePeriod, type: "coverage" }] : [];
    return (
        <article id="tenant-payment-receipt" className="tenant-receipt-slip mx-auto bg-white text-slate-950">
            <header className="text-center">
                <p className="text-[11px] font-black uppercase tracking-[0.28em]">DDUMBA OS</p>
                <h3 className="mt-1 text-lg font-black leading-tight">{row.companyName}</h3>
                <p className="text-[10px] font-bold">{row.companyContact ?? "Company contact not set"}</p>
                <p className="mt-2 border-y border-dashed border-slate-900 py-1 text-[11px] font-black uppercase">Tenant Payment Receipt</p>
            </header>
            <section className="mt-3 space-y-1.5 text-[11px]">
                <SlipLine label="Receipt No" value={receipt.receiptNumber} strong />
                <SlipLine label="Verification" value={receipt.verificationCode} />
                <SlipLine label="Date/Time" value={row.paymentDateTime ? new Date(row.paymentDateTime).toLocaleString("en-UG", { timeZone: "Africa/Kampala" }) : "No timestamp"} />
                <SlipLine label="Office" value={row.officeName ?? "Office"} />
                <SlipLine label="Room" value={row.roomNumber ?? "No room"} />
                <SlipLine label="Tenant" value={row.tenantName ?? "Unnamed tenant"} />
                <SlipLine label="Phone" value={row.tenantPhone ?? "No phone"} />
                <SlipLine label="Landlord" value={row.landlordName ?? "No landlord"} />
            </section>
            <section className="mt-3 border-y border-dashed border-slate-900 py-2 text-[11px]">
                <SlipMoney label="Monthly rent" value={row.monthlyRent} />
                <SlipMoney label="Previous outstanding" value={row.previousOutstandingBalance} />
                <SlipMoney label="Applied to outstanding" value={row.amountAppliedToOutstanding ?? 0} />
                <SlipMoney label="Applied to current rent" value={row.amountAppliedToCurrentRent ?? Math.max(0, row.amountApplied - (row.amountAppliedToOutstanding ?? 0))} />
                <SlipMoney label="Advance rent" value={row.advanceAmount ?? row.advanceBalance} />
                <SlipMoney label="Amount paid" value={row.amountPaid} strong />
                <SlipMoney label="Remaining balance" value={row.remainingOutstandingBalance} strong />
                <SlipMoney label="Advance balance" value={row.advanceBalance} />
            </section>
            <section className="mt-3 text-[11px]">
                <p className="font-black uppercase">Coverage</p>
                {coveragePeriods.length ? coveragePeriods.map((period, index) => (
                    <div key={`${period.label}-${index}`} className="mt-1 flex justify-between gap-2 border-b border-dotted border-slate-300 pb-1">
                        <span className="min-w-0 flex-1">{period.label} · {period.type}</span>
                        <span className="font-black">{money(period.amount)}</span>
                    </div>
                )) : <p className="mt-1 font-bold">Coverage period not recorded.</p>}
            </section>
            <section className="mt-3 space-y-1.5 border-y border-dashed border-slate-900 py-2 text-[11px]">
                <SlipLine label="Method" value={row.paymentMethod?.replaceAll("_", " ") ?? "Payment"} />
                <SlipLine label="Reference" value={row.referenceNumber ?? "No reference"} />
                <SlipLine label="Recorded by" value={row.recordedByName ?? "DDUMBA OS"} />
                {row.collectorName ? <SlipLine label="Collector" value={row.collectorName} /> : null}
                <SlipLine label="Approved by" value={row.approvedByName ?? row.recordedByName ?? "DDUMBA OS"} />
                <SlipLine label="Status" value={row.status} />
                <SlipLine label="Notes" value={row.notes ?? "No notes"} />
            </section>
            <footer className="mt-3 text-center">
                <div className="mx-auto grid h-20 w-20 grid-cols-5 gap-0.5 border border-slate-900 bg-white p-1">
                    {Array.from({ length: 25 }).map((_, index) => (
                        <span key={index} className={(index + receipt.verificationCode.length) % 3 === 0 || index % 7 === 0 ? "bg-slate-950" : "bg-slate-100"} />
                    ))}
                </div>
                <p className="mt-2 text-[10px] font-black uppercase tracking-wide">Thank you for your payment</p>
                <p className="mt-1 text-[9px] font-bold leading-tight">Generated from the saved DDUMBA OS Supabase transaction.</p>
            </footer>
        </article>
    );
}

function SlipLine({ label, strong = false, value }: { label: string; strong?: boolean; value: string }) {
    return (
        <div className="flex items-start justify-between gap-2">
            <span className="font-bold uppercase text-slate-600">{label}</span>
            <span className={`max-w-[58%] text-right leading-tight ${strong ? "font-black" : "font-bold"}`}>{value}</span>
        </div>
    );
}

function SlipMoney({ label, strong = false, value }: { label: string; strong?: boolean; value: number }) {
    return (
        <div className={`flex items-center justify-between gap-2 ${strong ? "text-[12px]" : ""}`}>
            <span className="font-bold uppercase text-slate-600">{label}</span>
            <span className="font-black">{money(value)}</span>
        </div>
    );
}
