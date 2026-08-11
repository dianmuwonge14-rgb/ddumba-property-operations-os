"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Eye, History, Mail, MessageCircle, Printer, ReceiptText, Search } from "lucide-react";
import { logReceiptPrintOrDownload, logReceiptShareLink } from "@/app/actions/receipts";
import { downloadTenantPaymentReceiptPdf, prepareReceiptPdfForSharing, printTenantPaymentReceipt, tenantReceiptWhatsappHref, TenantPaymentReceiptModal } from "@/components/office/receipts/TenantPaymentReceipt";
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
        receipt.preparedByName,
        receipt.recordedByName,
        receipt.changedByName,
        receipt.approvedByName,
        receipt.issuedAt,
        receipt.verificationCode,
        receipt.status,
        receipt.amendmentSummary,
        snapshot.landlordName,
        snapshot.paymentMethod,
        snapshot.referenceNumber,
        snapshot.collectorName,
        snapshot.coveragePeriod,
    ].filter(Boolean).join(" ").toLowerCase();
}

const STATUS_FILTERS = [
    { key: "all", label: "All" },
    { key: "issued", label: "Normal" },
    { key: "pending_correction", label: "Pending Change" },
    { key: "corrected", label: "Corrected" },
    { key: "cancelled", label: "Cancelled" },
    { key: "reversed", label: "Reversed" },
    { key: "superseded", label: "Superseded" },
    { key: "rejected_change", label: "Rejected Changes" },
] as const;

function normalizeStatus(status: string | null | undefined) {
    const value = String(status ?? "issued").toLowerCase();
    if (["paid", "approved", "issued", "normal"].includes(value)) return "issued";
    if (["corrected", "amended"].includes(value)) return "corrected";
    if (["cancelled", "canceled", "voided", "void"].includes(value)) return "cancelled";
    if (["replaced", "superseded"].includes(value)) return "superseded";
    if (["rejected", "rejected_change"].includes(value)) return "rejected_change";
    if (["pending", "pending_correction", "pending_change"].includes(value)) return "pending_correction";
    return value;
}

function receiptStatusConfig(status: string | null | undefined) {
    const normalized = normalizeStatus(status);
    if (normalized === "pending_correction") return { card: "border-amber-300 bg-amber-50/80", badge: "bg-amber-100 text-amber-800", accent: "bg-amber-500", label: "Pending correction" };
    if (normalized === "corrected") return { card: "border-orange-300 bg-orange-50/80", badge: "bg-orange-100 text-orange-800", accent: "bg-orange-500", label: "Corrected" };
    if (normalized === "partially_adjusted") return { card: "border-purple-300 bg-purple-50/80", badge: "bg-purple-100 text-purple-800", accent: "bg-purple-500", label: "Partially adjusted" };
    if (normalized === "cancelled") return { card: "border-red-300 bg-red-50/80", badge: "bg-red-100 text-red-800", accent: "bg-red-600", label: "Cancelled" };
    if (normalized === "reversed") return { card: "border-rose-400 bg-rose-50/80", badge: "bg-rose-200 text-rose-950", accent: "bg-rose-900", label: "Reversed" };
    if (normalized === "superseded") return { card: "border-slate-300 bg-slate-100/80", badge: "bg-slate-200 text-slate-700", accent: "bg-slate-500", label: "Superseded" };
    if (normalized === "rejected_change") return { card: "border-orange-300 bg-orange-50/80", badge: "bg-orange-100 text-orange-800", accent: "bg-orange-500", label: "Rejected change" };
    if (normalized === "refunded") return { card: "border-teal-300 bg-teal-50/80", badge: "bg-teal-100 text-teal-800", accent: "bg-teal-500", label: "Refunded" };
    return { card: "border-slate-200 bg-white", badge: "bg-emerald-100 text-emerald-700", accent: "bg-emerald-500", label: "Issued" };
}

export default function ReceiptHistoryConsole({ error, receipts }: Props) {
    const [query, setQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]["key"]>("all");
    const [pendingReceiptAction, setPendingReceiptAction] = useState<null | { channel: "download_pdf" | "print"; receiptId: string }>(null);
    const [selected, setSelected] = useState<ReceiptHistoryItem | null>(null);
    const visible = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        return receipts.filter((receipt) => {
            const matchesStatus = statusFilter === "all" || normalizeStatus(receipt.status) === statusFilter;
            const matchesSearch = !normalized || searchable(receipt).includes(normalized);
            return matchesStatus && matchesSearch;
        });
    }, [query, receipts, statusFilter]);
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

    const shareReceiptByWhatsapp = async (receipt: ReceiptHistoryItem) => {
        const href = tenantReceiptWhatsappHref(receipt, receipt.tenantPhone);
        if (!href) {
            window.alert("This receipt does not have a tenant phone number for WhatsApp sharing.");
            return;
        }
        await prepareReceiptPdfForSharing(`${receipt.receiptNumber}.pdf`);
        await logReceiptShareLink({ channel: "whatsapp", phone: receipt.tenantPhone ?? "", receiptId: receipt.id }).catch(() => null);
        window.open(href, "_blank", "noopener,noreferrer");
        window.alert("Receipt PDF prepared. WhatsApp is open with the tenant message; attach the downloaded PDF if WhatsApp does not attach files automatically.");
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
                    <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                        {STATUS_FILTERS.map((filter) => (
                            <button
                                key={filter.key}
                                type="button"
                                onClick={() => setStatusFilter(filter.key)}
                                className={statusFilter === filter.key
                                    ? "whitespace-nowrap rounded-full bg-cyan-300 px-3 py-1.5 text-xs font-black text-slate-950"
                                    : "whitespace-nowrap rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-black text-slate-200 hover:bg-white/15"}
                            >
                                {filter.label}
                            </button>
                        ))}
                    </div>
                </section>

                {error ? <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-black text-amber-900">{error}</p> : null}

                <section className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {visible.length ? visible.map((receipt) => {
                        const status = receiptStatusConfig(receipt.status);
                        return (
                        <article key={receipt.id} className={`relative min-w-0 overflow-hidden rounded-3xl border p-4 shadow-sm ${status.card}`}>
                            <span aria-hidden className={`absolute left-0 top-0 h-full w-1.5 ${status.accent}`} />
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="truncate text-lg font-black text-slate-950">{receipt.receiptNumber}</p>
                                    <p className="text-xs font-bold text-slate-500">{receipt.issuedAt ? new Date(receipt.issuedAt).toLocaleString() : "No timestamp"}</p>
                                </div>
                                <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-black capitalize ${status.badge}`}>{status.label}</span>
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                                <Info label="Room" value={receipt.roomNumber ?? "N/A"} />
                                <Info label="Tenant" value={receipt.tenantName ?? "Unnamed"} />
                                <Info label="Phone" value={receipt.tenantPhone ?? "No phone"} />
                                <Info label="Office" value={receipt.officeName ?? "Office"} />
                                <Info label="Amount" value={money(receipt.amountPaid)} />
                                <Info label="Balance" value={money(receipt.remainingOutstandingBalance)} />
                                <Info label="Prepared By" value={receipt.preparedByName ?? receipt.recordedByName ?? "DDUMBA OS"} />
                                <Info label="Last Updated" value={receipt.lastUpdatedAt ? new Date(receipt.lastUpdatedAt).toLocaleString() : "Not changed"} />
                            </div>
                            {receipt.amendmentSummary ? (
                                <div className="mt-3 rounded-2xl border border-white/60 bg-white/75 px-3 py-2 text-xs font-black text-slate-700">
                                    <p>{receipt.amendmentSummary}</p>
                                    <p className="mt-1 text-[11px] text-slate-500">
                                        {receipt.changedByName ? `Changed by: ${receipt.changedByName}` : null}
                                        {receipt.changedByName && receipt.approvedByName ? " · " : null}
                                        {receipt.approvedByName ? `Approved by: ${receipt.approvedByName}` : null}
                                    </p>
                                </div>
                            ) : null}
                            <p className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-xs font-black text-slate-600">Verification: {receipt.verificationCode}</p>
                            <div className="mt-3 grid grid-cols-3 gap-2 text-[10px] font-black uppercase text-slate-500">
                                <DeliveryBadge label="Print" status={receipt.deliveryStatus.print} />
                                <DeliveryBadge label="WhatsApp" status={receipt.deliveryStatus.whatsapp} />
                                <DeliveryBadge label="Email" status={receipt.deliveryStatus.email} />
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                                <button type="button" onClick={() => setSelected(receipt)} className="inline-flex items-center gap-1 rounded-xl bg-white px-3 py-2 text-xs font-black text-slate-800 ring-1 ring-slate-200"><Eye size={13} /> View</button>
                                <button type="button" onClick={() => queueReceiptAction(receipt, "print")} className="inline-flex items-center gap-1 rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white"><Printer size={13} /> Reprint</button>
                                <button type="button" onClick={() => queueReceiptAction(receipt, "download_pdf")} className="inline-flex items-center gap-1 rounded-xl bg-blue-700 px-3 py-2 text-xs font-black text-white"><Download size={13} /> PDF</button>
                                <button type="button" onClick={() => void shareReceiptByWhatsapp(receipt)} className="inline-flex items-center gap-1 rounded-xl bg-green-600 px-3 py-2 text-xs font-black text-white"><MessageCircle size={13} /> WhatsApp</button>
                                <a href={`mailto:?subject=${encodeURIComponent(`DDUMBA OS Receipt ${receipt.receiptNumber}`)}&body=${encodeURIComponent(`Receipt ${receipt.receiptNumber} for ${receipt.tenantName ?? "tenant"}: ${money(receipt.amountPaid)}. Verification ${receipt.verificationCode}.`)}`} className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white"><Mail size={13} /> Resend</a>
                                <a href={`/office/payments?receipt=${receipt.id}&payment=${receipt.paymentId}`} className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700"><ReceiptText size={13} /> Payment</a>
                                <a href={`/office/payments?history=${receipt.paymentId}`} className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700"><History size={13} /> View Corrections</a>
                            </div>
                        </article>
                    );}) : (
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
                    onShareWhatsApp={() => shareReceiptByWhatsapp(selected)}
                    receipt={selected}
                    shareDisabled={!selected.tenantPhone}
                    subtitle="Reopened from live Supabase Receipt History."
                    title="Receipt Preview"
                />
            ) : null}
        </main>
    );
}

function DeliveryBadge({ label, status }: { label: string; status: string | null }) {
    const active = Boolean(status);
    return (
        <span className={active ? "rounded-xl bg-emerald-50 px-2 py-1 text-emerald-700" : "rounded-xl bg-slate-100 px-2 py-1 text-slate-500"}>
            {label}: {status ?? "not sent"}
        </span>
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
