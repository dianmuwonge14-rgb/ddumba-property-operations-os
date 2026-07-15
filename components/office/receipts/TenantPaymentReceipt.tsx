"use client";

import { useEffect, useMemo, useRef } from "react";
import type React from "react";
import { Download, Mail, Printer, X } from "lucide-react";
import type { PaymentReceiptSnapshot } from "@/lib/receipts/payment-receipts";

export type TenantReceiptViewModel = {
    id: string;
    receiptNumber: string;
    snapshot: PaymentReceiptSnapshot;
    verificationCode: string;
};

type ReceiptAction = () => void | Promise<void>;

type ModalProps = {
    actionExtras?: React.ReactNode;
    downloadDisabled?: boolean;
    message?: string | null;
    onClose: () => void;
    onDownloadPdf: ReceiptAction;
    onPrint: ReceiptAction;
    onSendEmail?: ReceiptAction;
    printDisabled?: boolean;
    receipt: TenantReceiptViewModel;
    sendDisabled?: boolean;
    subtitle?: string;
    title?: string;
};

function money(value: number | null | undefined) {
    return `UGX ${Math.round(Number(value ?? 0)).toLocaleString()}`;
}

function safeText(value: string | null | undefined) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

function formatDateTime(value: string | null | undefined) {
    if (!value) return "No timestamp";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString("en-UG", {
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        month: "short",
        timeZone: "Africa/Kampala",
        year: "numeric",
    });
}

function receiptVerificationUrl(receipt: TenantReceiptViewModel) {
    const path = `/office/receipts?verify=${encodeURIComponent(receipt.verificationCode)}&receipt=${encodeURIComponent(receipt.id)}`;
    if (typeof window === "undefined") return `https://ddumba-property-operations-os-evgw.vercel.app${path}`;
    return `${window.location.origin}${path}`;
}

export function printTenantPaymentReceipt(afterPrint?: () => void) {
    document.body.classList.add("print-tenant-payment-receipt");
    window.print();
    window.setTimeout(() => {
        document.body.classList.remove("print-tenant-payment-receipt");
        afterPrint?.();
    }, 500);
}

export function TenantPaymentReceiptModal({
    actionExtras,
    downloadDisabled,
    message,
    onClose,
    onDownloadPdf,
    onPrint,
    onSendEmail,
    printDisabled,
    receipt,
    sendDisabled,
    subtitle = "Generated from the final saved Supabase transaction.",
    title = "PAYMENT RECORDED SUCCESSFULLY",
}: ModalProps) {
    const closeButtonRef = useRef<HTMLButtonElement | null>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const oldOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        closeButtonRef.current?.focus();
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                onClose();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => {
            window.removeEventListener("keydown", onKeyDown);
            document.body.style.overflow = oldOverflow;
            previousFocusRef.current?.focus?.();
        };
    }, [onClose]);

    const closeFromBackdrop = (event: React.MouseEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget) onClose();
    };

    return (
        <div
            aria-modal="true"
            className="tenant-receipt-modal fixed inset-0 z-[140] overflow-y-auto bg-slate-950/82 p-3 backdrop-blur-md sm:p-5 print:static print:bg-white print:p-0"
            onMouseDown={closeFromBackdrop}
            role="dialog"
        >
            <div className="tenant-receipt-modal-panel mx-auto flex min-h-full w-full max-w-5xl items-start justify-center py-2 sm:py-4 print:block print:min-h-0 print:max-w-none print:p-0">
                <div className="w-full rounded-[28px] border border-white/10 bg-white p-3 text-slate-950 shadow-2xl sm:p-4 print:w-auto print:rounded-none print:border-0 print:bg-white print:p-0 print:shadow-none">
                    <div className="tenant-receipt-actions sticky top-2 z-10 mb-3 rounded-[22px] border border-slate-200 bg-white/95 p-3 shadow-lg shadow-slate-900/10 backdrop-blur print:hidden">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="min-w-0">
                                <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">{title}</p>
                                <p className="mt-1 text-sm font-bold text-slate-500">{subtitle}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
                                <button type="button" onClick={onPrint} disabled={printDisabled} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-3 py-2 text-xs font-black text-white disabled:opacity-50">
                                    <Printer size={15} /> Print Receipt
                                </button>
                                <button type="button" onClick={onDownloadPdf} disabled={downloadDisabled} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-blue-700 px-3 py-2 text-xs font-black text-white disabled:opacity-50">
                                    <Download size={15} /> Download PDF
                                </button>
                                {onSendEmail ? (
                                    <button type="button" onClick={onSendEmail} disabled={sendDisabled} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">
                                        <Mail size={15} /> Send E-Receipt
                                    </button>
                                ) : null}
                                <button ref={closeButtonRef} type="button" onClick={onClose} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-800">
                                    <X size={15} /> Close Receipt
                                </button>
                            </div>
                        </div>
                        {actionExtras ? <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{actionExtras}</div> : null}
                        {message ? <p className="mt-3 rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-700">{message}</p> : null}
                    </div>
                    <div className="tenant-receipt-preview-scroll max-h-[calc(100vh-150px)] overflow-y-auto overflow-x-hidden rounded-[24px] bg-slate-100/80 p-3 sm:p-5 print:max-h-none print:overflow-visible print:bg-white print:p-0">
                        <TenantPaymentReceiptSlip receipt={receipt} />
                    </div>
                </div>
            </div>
        </div>
    );
}

export function TenantPaymentReceiptSlip({ receipt }: { receipt: TenantReceiptViewModel }) {
    const snapshot = receipt.snapshot;
    const companyContact = [safeText(snapshot.companyContact)].filter(Boolean).join(" · ");
    const coveragePeriods = useMemo(() => {
        if (snapshot.coveragePeriods?.length) return snapshot.coveragePeriods.filter((period) => period.label && Number(period.amount) > 0);
        if (snapshot.coveragePeriod) return [{ amount: snapshot.amountApplied, label: snapshot.coveragePeriod, type: "coverage" }];
        return [];
    }, [snapshot.amountApplied, snapshot.coveragePeriod, snapshot.coveragePeriods]);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=128x128&margin=10&data=${encodeURIComponent(receiptVerificationUrl(receipt))}`;

    return (
        <article id="tenant-payment-receipt" className="tenant-receipt-slip mx-auto bg-white text-slate-950">
            <header className="receipt-section text-center">
                <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full border border-slate-900 bg-slate-950 text-[13px] font-black text-white print:bg-white print:text-black">DD</div>
                <h3 className="mt-1.5 text-[15px] font-black leading-tight">{safeText(snapshot.companyName) ?? "DDUMBA OS"}</h3>
                {companyContact ? <p className="receipt-muted mt-0.5 text-[9px] font-bold">{companyContact}</p> : null}
                <p className="mt-2 border-y border-dashed border-slate-900 py-1 text-[10px] font-black uppercase tracking-[0.08em]">Tenant Payment Receipt</p>
            </header>

            <section className="receipt-section">
                <ReceiptRow label="Receipt No" value={receipt.receiptNumber} strong />
                <ReceiptRow label="Verification" value={receipt.verificationCode} />
                <ReceiptRow label="Date/Time" value={formatDateTime(snapshot.paymentDateTime)} />
                <ReceiptRow label="Office" value={snapshot.officeName ?? "Office"} stackWhenLong />
                <ReceiptRow label="Room" value={snapshot.roomNumber ?? "No room"} />
                <ReceiptRow label="Tenant" value={snapshot.tenantName ?? "Unnamed tenant"} stackWhenLong />
                <ReceiptRow label="Phone" value={snapshot.tenantPhone ?? "No phone"} />
                <ReceiptRow label="Landlord" value={snapshot.landlordName ?? "No landlord"} stackWhenLong />
            </section>

            <section className="receipt-section receipt-amount-section">
                <ReceiptMoneyRow label="Monthly rent" value={snapshot.monthlyRent} />
                <ReceiptMoneyRow label="Previous outstanding" value={snapshot.previousOutstandingBalance} />
                <ReceiptMoneyRow label="Applied to outstanding" value={snapshot.amountAppliedToOutstanding ?? 0} />
                <ReceiptMoneyRow label="Applied to current rent" value={snapshot.amountAppliedToCurrentRent ?? Math.max(0, snapshot.amountApplied - (snapshot.amountAppliedToOutstanding ?? 0))} />
                <ReceiptMoneyRow label="Advance rent" value={snapshot.advanceAmount ?? snapshot.advanceBalance} />
                <ReceiptMoneyRow label="Amount paid" value={snapshot.amountPaid} highlight />
                <ReceiptMoneyRow label="Remaining balance" value={snapshot.remainingOutstandingBalance} highlight />
                <ReceiptMoneyRow label="Advance balance" value={snapshot.advanceBalance} />
            </section>

            {coveragePeriods.length ? (
                <section className="receipt-section">
                    <p className="receipt-section-title">Coverage</p>
                    <div className="space-y-1.5">
                        {coveragePeriods.map((period, index) => (
                            <div key={`${period.label}-${period.type}-${index}`} className="receipt-coverage-card">
                                <p className="text-[9px] font-black uppercase text-slate-500">Period {index + 1}</p>
                                <p className="mt-0.5 text-[10px] font-black leading-tight">{period.label}</p>
                                <p className="mt-0.5 text-[10px] font-black tabular-nums">Amount: {money(period.amount)}</p>
                                {period.type ? <p className="mt-0.5 text-[8px] font-bold uppercase text-slate-500">{period.type}</p> : null}
                            </div>
                        ))}
                    </div>
                </section>
            ) : null}

            <section className="receipt-section">
                <ReceiptRow label="Method" value={snapshot.paymentMethod?.replaceAll("_", " ") ?? "Payment"} />
                <ReceiptRow label="Reference" value={snapshot.referenceNumber ?? "No reference"} stacked />
                <ReceiptRow label="Recorded by" value={snapshot.recordedByName ?? "DDUMBA OS"} stacked />
                {snapshot.collectorName ? <ReceiptRow label="Collector" value={snapshot.collectorName} stacked /> : null}
                <ReceiptRow label="Approved by" value={snapshot.approvedByName ?? snapshot.recordedByName ?? "DDUMBA OS"} stacked />
                <ReceiptRow label="Status" value={snapshot.status} />
                <ReceiptRow label="Notes" value={snapshot.notes ?? "No notes"} stacked />
            </section>

            <footer className="receipt-section text-center">
                <img alt={`Receipt QR ${receipt.verificationCode}`} className="receipt-qr mx-auto" src={qrUrl} />
                <p className="mt-2 text-[9px] font-black uppercase tracking-wide">Thank you for your payment</p>
                <p className="receipt-muted mt-1 text-[8px] font-bold leading-tight">Generated from the saved DDUMBA OS Supabase transaction. Keep this slip for tenant, office, collector, and audit verification.</p>
            </footer>
        </article>
    );
}

function ReceiptRow({ label, stackWhenLong = false, stacked = false, strong = false, value }: { label: string; stackWhenLong?: boolean; stacked?: boolean; strong?: boolean; value: string }) {
    const shouldStack = stacked || (stackWhenLong && value.length > 22);
    return (
        <div className={shouldStack ? "receipt-row receipt-row-stacked" : "receipt-row"}>
            <span className="receipt-label">{label}</span>
            <span className={strong ? "receipt-value receipt-value-strong" : "receipt-value"}>{value}</span>
        </div>
    );
}

function ReceiptMoneyRow({ highlight = false, label, value }: { highlight?: boolean; label: string; value: number }) {
    return (
        <div className={highlight ? "receipt-row receipt-money-row receipt-money-row-highlight" : "receipt-row receipt-money-row"}>
            <span className="receipt-label">{label}</span>
            <span className="receipt-value receipt-money-value">{money(value)}</span>
        </div>
    );
}
