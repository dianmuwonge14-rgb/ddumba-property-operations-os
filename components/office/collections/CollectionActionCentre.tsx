"use client";

import { useState, useTransition } from "react";
import { Bell, ChevronDown, ClipboardCheck, Home, MessageSquare, Phone, Send } from "lucide-react";
import {
    createCollectionAction,
    createPromise,
    followUpPromise,
    recordCollection,
} from "@/app/actions/collections";
import type { CollectionActionType, CollectionTenantResult } from "@/lib/collections/types";

type Props = {
    tenantContext: CollectionTenantResult | null;
    canManage: boolean;
    canPostPayments: boolean;
    onSaved: () => void | Promise<void>;
};

const actionButtons: Array<{ label: string; type: CollectionActionType; icon: typeof Phone; color: string }> = [
    { label: "Call", type: "call", icon: Phone, color: "bg-blue-600" },
    { label: "WhatsApp", type: "whatsapp", icon: MessageSquare, color: "bg-green-600" },
    { label: "SMS", type: "sms", icon: Send, color: "bg-purple-600" },
    { label: "Visit", type: "visit", icon: Home, color: "bg-orange-500" },
    { label: "Notice", type: "notice", icon: Bell, color: "bg-red-600" },
    { label: "Follow Promise", type: "promise_follow_up", icon: ClipboardCheck, color: "bg-slate-900" },
];

export default function CollectionActionCentre({ tenantContext, canManage, canPostPayments, onSaved }: Props) {
    const [notes, setNotes] = useState("");
    const [outcome, setOutcome] = useState("");
    const [amount, setAmount] = useState("");
    const [paymentMethod, setPaymentMethod] = useState("cash");
    const [paymentSource, setPaymentSource] = useState<"tenant" | "employer">("tenant");
    const [payerName, setPayerName] = useState("");
    const [referenceNumber, setReferenceNumber] = useState("");
    const [chequeReference, setChequeReference] = useState("");
    const [promiseAmount, setPromiseAmount] = useState("");
    const [promiseDate, setPromiseDate] = useState("");
    const [message, setMessage] = useState<string | null>(null);
    const [showMoreOptions, setShowMoreOptions] = useState(false);
    const [isPending, startTransition] = useTransition();

    function requireTenant() {
        if (!tenantContext) {
            setMessage("Select a tenant first.");
            return null;
        }
        return tenantContext;
    }

    function run(action: () => Promise<unknown>, success: string) {
        startTransition(async () => {
            try {
                setMessage(null);
                await action();
                setNotes("");
                setOutcome("");
                setAmount("");
                setPayerName("");
                setReferenceNumber("");
                setChequeReference("");
                setPromiseAmount("");
                setPromiseDate("");
                setMessage(success);
                await onSaved();
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Action failed.");
            }
        });
    }

    function saveAction(actionType: CollectionActionType) {
        const selected = requireTenant();
        if (!selected) return;

        run(
            () => createCollectionAction({
                tenantId: selected.tenant.id,
                actionType,
                outcome: outcome || undefined,
                notes: notes || undefined,
            }),
            "Collection action saved.",
        );
    }

    function saveCollection() {
        const selected = requireTenant();
        if (!selected) return;

        run(
            () => recordCollection({
                tenantId: selected.tenant.id,
                amount: Number(amount),
                paymentMethod,
                paymentSource,
                payerName: payerName || undefined,
                referenceNumber: referenceNumber || undefined,
                chequeReference: chequeReference || undefined,
                notes: notes || undefined,
            }),
            "Collection recorded.",
        );
    }

    function savePromise() {
        const selected = requireTenant();
        if (!selected) return;

        if (!promiseDate) {
            setMessage("Promise date is required.");
            return;
        }

        if (!Number.isFinite(Number(promiseAmount)) || Number(promiseAmount) <= 0) {
            setMessage("Promise amount must be greater than zero.");
            return;
        }

        run(
            () => createPromise({
                tenantId: selected.tenant.id,
                promisedAmount: Number(promiseAmount),
                promisedDate: promiseDate,
                notes: notes || undefined,
            }),
            "Promise created.",
        );
    }

    function savePromiseFollowUp(markFulfilled: boolean) {
        const selected = requireTenant();
        if (!selected?.openPromise) {
            setMessage("This tenant has no open promise.");
            return;
        }

        run(
            () => followUpPromise({
                promiseId: selected.openPromise!.id,
                outcome: outcome || (markFulfilled ? "Promise paid" : "Followed up"),
                notes: notes || undefined,
                markFulfilled,
            }),
            markFulfilled ? "Promise paid and collection recorded." : "Promise follow-up saved.",
        );
    }

    return (
        <div className="enterprise-panel overflow-visible p-3">
            <div className="sticky top-32 z-30 -mx-3 -mt-3 border-b border-slate-200 bg-white/95 px-3 py-2 backdrop-blur-xl">
                <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-base font-black text-slate-950">Collection Actions</h2>
                            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-black text-blue-700">
                                {isPending ? "Saving" : "Ready"}
                            </span>
                        </div>
                        <p className="mt-1 truncate text-xs font-bold text-slate-600">
                            {tenantContext
                                ? `Room ${tenantContext.room?.room_number ?? "Unknown"} | Balance UGX ${Number(tenantContext.tenant.balance ?? 0).toLocaleString()} | Collect UGX ${tenantContext.contribution.collectFromTenant.toLocaleString()} | Promise: ${tenantContext.openPromise ? "Yes" : "No"}`
                                : "Select a tenant to begin collection work."}
                        </p>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6 xl:w-auto xl:min-w-[520px]">
                        {actionButtons.map((action) => {
                            const Icon = action.icon;
                            return (
                                <button
                                    key={action.type}
                                    type="button"
                                    disabled={!canManage || isPending}
                                    onClick={() => saveAction(action.type)}
                                    className={`${action.color} flex h-9 items-center justify-center gap-1.5 rounded-lg px-2 text-[11px] font-black text-white shadow-sm transition hover:-translate-y-0.5 disabled:opacity-40`}
                                >
                                    <Icon size={13} />
                                    <span className="truncate">{action.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {tenantContext?.contribution.hasSponsor ? (
                <div className="mt-3 grid grid-cols-1 gap-2 rounded-xl border border-blue-100 bg-blue-50 p-2.5 text-xs font-bold text-slate-700 md:grid-cols-3">
                    <div>
                        <p className="text-slate-500">Employer expected</p>
                        <p className="text-sm font-black text-slate-950">UGX {tenantContext.contribution.employerExpected.toLocaleString()}</p>
                        <p className="text-emerald-700">Received UGX {tenantContext.contribution.employerReceivedThisMonth.toLocaleString()}</p>
                    </div>
                    <div>
                        <p className="text-slate-500">Tenant top-up due</p>
                        <p className="text-sm font-black text-slate-950">UGX {tenantContext.contribution.tenantTopUpExpected.toLocaleString()}</p>
                        <p className="text-amber-700">Balance UGX {tenantContext.contribution.tenantTopUpBalance.toLocaleString()}</p>
                    </div>
                    <div>
                        <p className="text-slate-500">Collector instruction</p>
                        <p className="text-sm font-black text-blue-800">Collect from tenant: UGX {tenantContext.contribution.collectFromTenant.toLocaleString()}</p>
                        <p className="text-slate-500">Employer balance UGX {tenantContext.contribution.employerBalance.toLocaleString()}</p>
                    </div>
                </div>
            ) : null}

            <div className="mt-3 grid grid-cols-1 gap-2 xl:grid-cols-2">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <CompactField label="Amount Paid">
                        <input
                            value={amount}
                            onChange={(event) => setAmount(event.target.value)}
                            type="number"
                            min="0"
                            placeholder="UGX"
                            className="compact-action-input"
                        />
                    </CompactField>
                    <CompactField label="Payment Type">
                        <select
                            value={paymentSource}
                            onChange={(event) => setPaymentSource(event.target.value === "employer" ? "employer" : "tenant")}
                            className="compact-action-input"
                        >
                            <option value="tenant">Tenant top-up</option>
                            <option value="employer">Employer payment</option>
                        </select>
                    </CompactField>
                    <CompactField label="Tenant Payer Name">
                        <input
                            value={payerName}
                            onChange={(event) => setPayerName(event.target.value)}
                            placeholder={paymentSource === "employer" ? "Employer / payer name" : "Tenant payer name"}
                            className="compact-action-input"
                        />
                    </CompactField>
                    <CompactField label="Reference">
                        <input
                            value={referenceNumber}
                            onChange={(event) => setReferenceNumber(event.target.value)}
                            placeholder="Receipt / ref"
                            className="compact-action-input"
                        />
                    </CompactField>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <CompactField label="Bank/Cheque Ref">
                        <input
                            value={chequeReference}
                            onChange={(event) => setChequeReference(event.target.value)}
                            placeholder="Cheque / bank ref"
                            className="compact-action-input"
                        />
                    </CompactField>
                    <CompactField label="Outcome">
                        <input
                            value={outcome}
                            onChange={(event) => setOutcome(event.target.value)}
                            placeholder="Reached / pending / paid"
                            className="compact-action-input"
                        />
                    </CompactField>
                    <CompactField label="Promise Amount">
                        <input
                            value={promiseAmount}
                            onChange={(event) => setPromiseAmount(event.target.value)}
                            type="number"
                            min="0"
                            placeholder="UGX"
                            className="compact-action-input"
                        />
                    </CompactField>
                    <CompactField label="Promise Date">
                        <input
                            value={promiseDate}
                            onChange={(event) => setPromiseDate(event.target.value)}
                            type="date"
                            required
                            className="compact-action-input"
                        />
                    </CompactField>
                </div>
            </div>

            <button
                type="button"
                onClick={() => setShowMoreOptions((current) => !current)}
                className="mt-2 inline-flex h-8 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:border-blue-300 hover:text-blue-700"
            >
                More Options
                <ChevronDown size={14} className={`transition ${showMoreOptions ? "rotate-180" : ""}`} />
            </button>

            {showMoreOptions ? (
                <div className="mt-2 grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 sm:grid-cols-2 xl:grid-cols-[1fr_2fr]">
                    <CompactField label="Payment Method">
                        <select
                            value={paymentMethod}
                            onChange={(event) => setPaymentMethod(event.target.value)}
                            className="compact-action-input bg-white"
                        >
                            <option value="cash">Cash</option>
                            <option value="mobile_money">Mobile Money</option>
                            <option value="bank">Bank</option>
                            <option value="bank_cheque">Bank cheque</option>
                            <option value="bank_transfer">Bank transfer</option>
                        </select>
                    </CompactField>
                    <CompactField label="Notes">
                        <textarea
                            value={notes}
                            onChange={(event) => setNotes(event.target.value)}
                            placeholder="Notes, extra references, advanced collection details"
                            className="compact-action-input min-h-9 resize-none bg-white py-2"
                        />
                    </CompactField>
                </div>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-2">
                <CompactButton disabled={!canPostPayments || isPending} onClick={saveCollection} tone="green">Record Payment</CompactButton>
                <CompactButton disabled={!canManage || isPending} onClick={savePromise}>Save Promise</CompactButton>
                <CompactButton disabled={!canManage || isPending || !tenantContext?.openPromise} onClick={() => savePromiseFollowUp(false)} tone="light">Follow Up</CompactButton>
                <CompactButton disabled={!canManage || isPending || !tenantContext?.openPromise} onClick={() => savePromiseFollowUp(true)} tone="lightGreen">Mark Paid</CompactButton>
            </div>

            {message && <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600">{message}</p>}
        </div>
    );
}

function CompactField({ children, label }: { children: React.ReactNode; label: string }) {
    return (
        <label className="block">
            <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-500">{label}</span>
            {children}
        </label>
    );
}

function CompactButton({
    children,
    disabled,
    onClick,
    tone = "dark",
}: {
    children: React.ReactNode;
    disabled: boolean;
    onClick: () => void;
    tone?: "dark" | "green" | "light" | "lightGreen";
}) {
    const toneClass = {
        dark: "bg-slate-950 text-white hover:bg-blue-700",
        green: "bg-emerald-600 text-white hover:bg-emerald-700",
        light: "border border-slate-300 bg-white text-slate-700 hover:border-blue-300 hover:text-blue-700",
        lightGreen: "border border-green-300 bg-white text-green-700 hover:bg-green-50",
    }[tone];

    return (
        <button type="button" disabled={disabled} onClick={onClick} className={`${toneClass} h-9 rounded-lg px-3 text-xs font-black disabled:opacity-40`}>
            {children}
        </button>
    );
}
