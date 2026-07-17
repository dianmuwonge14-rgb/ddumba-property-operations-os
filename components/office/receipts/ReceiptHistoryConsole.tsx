"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Eye, History, Mail, Printer, ReceiptText, Search } from "lucide-react";
import { logReceiptPrintOrDownload } from "@/app/actions/receipts";
import { downloadTenantPaymentReceiptPdf, printTenantPaymentReceipt, TenantPaymentReceiptModal } from "@/components/office/receipts/TenantPaymentReceipt";
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
    const [pendingReceiptAction, setPendingReceiptAction] = useState<null | { channel: "download_pdf" | "print"; receiptId: string }>(null);
    const [selected, setSelected] = useState<ReceiptHistoryItem | null>(null);
    const visible = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        if (!normalized) return receipts;
        return receipts.filter((receipt) => searchable(receipt).includes(normalized));
    }, [query, receipts]);
    useEffect(() => {
        if (!selected || !pendingReceiptAction || pendingReceiptAction.receiptId !== selected.id) return;
        let cancelled = false;
        const run = async () => {
            await waitForReceiptPreviewMount();
            if (cancelled) return;
            await printReceipt(selected, pendingReceiptAction.channel, true);
            if (!cancelled) setPendingReceiptAction(null);
        };
        void run();
        return () => {
            cancelled = true;
        };
    }, [pendingReceiptAction, selected]);

    const queueReceiptAction = (receipt: ReceiptHistoryItem, channel: "download_pdf" | "print") => {
        setSelected(receipt);
        setPendingReceiptAction({ channel, receiptId: receipt.id });
    };

    const printReceipt = async (receipt: ReceiptHistoryItem, channel: "download_pdf" | "print", closeAfterPrint = false) => {
        void logReceiptPrintOrDownload({ channel, receiptId: receipt.id });
        if (channel === "print") {
            await printTenantPaymentReceipt(closeAfterPrint ? () => setSelected(null) : undefined, receipt);
            return;
        }
        await downloadTenantPaymentReceiptPdf(`${receipt.receiptNumber}.pdf`);
        if (closeAfterPrint) setSelected(null);
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
                                <button type="button" onClick={() => queueReceiptAction(receipt, "print")} className="inline-flex items-center gap-1 rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white"><Printer size={13} /> Reprint</button>
                                <button type="button" onClick={() => queueReceiptAction(receipt, "download_pdf")} className="inline-flex items-center gap-1 rounded-xl bg-blue-700 px-3 py-2 text-xs font-black text-white"><Download size={13} /> PDF</button>
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
                <TenantPaymentReceiptModal
                    actionExtras={(
                        <>
                            <a href={`mailto:?subject=${encodeURIComponent(`DDUMBA OS Receipt ${selected.receiptNumber}`)}&body=${encodeURIComponent(`Receipt ${selected.receiptNumber} for ${selected.tenantName ?? "tenant"}: ${money(selected.amountPaid)}. Verification ${selected.verificationCode}.`)}`} className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-emerald-600 px-4 py-3 text-xs font-black text-white">Resend by Email</a>
                            <a href={`/office/payments?receipt=${selected.id}&payment=${selected.paymentId}`} className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-slate-100 px-4 py-3 text-xs font-black text-slate-700">View Payment</a>
                            <a href={`/office/payments?history=${selected.paymentId}`} className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-slate-100 px-4 py-3 text-xs font-black text-slate-700">View Correction History</a>
                        </>
                    )}
                    onClose={() => setSelected(null)}
                    onDownloadPdf={() => printReceipt(selected, "download_pdf")}
                    onPrint={() => printReceipt(selected, "print")}
                    receipt={selected}
                    subtitle="Reopened from live Supabase Receipt History."
                    title="Receipt Preview"
                />
            ) : null}
        </main>
    );
}

function waitForReceiptPreviewMount() {
    return new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => resolve());
        });
    });
}

function Info({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-w-0 rounded-2xl bg-slate-50 p-3">
            <p className="text-[10px] font-black uppercase text-slate-500">{label}</p>
            <p className="mt-1 break-words text-sm font-black text-slate-950">{value}</p>
        </div>
    );
}
