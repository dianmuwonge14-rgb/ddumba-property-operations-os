"use client";

import { useState, useTransition } from "react";
import { CalendarClock, CheckCircle2, Loader2 } from "lucide-react";
import { setTenantBillingDate } from "@/app/actions/tenant-billing";

type Props = {
    billingDay?: number | null;
    canEdit?: boolean;
    currentPeriod?: { start: string; end: string } | null;
    lastChargeDate?: string | null;
    leaseId?: string | null;
    monthlyRent?: number | null;
    nextChargeDate?: string | null;
    outstandingBalance?: number | null;
    roomId?: string | null;
    tenantId: string;
};

function money(value: number | null | undefined) {
    return `UGX ${Math.round(Number(value ?? 0)).toLocaleString()}`;
}

function labelForDay(value: number | null | undefined) {
    const day = Math.max(1, Math.min(31, Number(value ?? 1) || 1));
    if ([11, 12, 13].includes(day % 100)) return `${day}th`;
    if (day % 10 === 1) return `${day}st`;
    if (day % 10 === 2) return `${day}nd`;
    if (day % 10 === 3) return `${day}rd`;
    return `${day}th`;
}

function formatDate(value: string | null | undefined) {
    if (!value) return "Not charged yet";
    return new Intl.DateTimeFormat("en-UG", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
}

export default function TenantBillingDateControl({
    billingDay,
    canEdit = true,
    currentPeriod,
    lastChargeDate,
    leaseId,
    monthlyRent,
    nextChargeDate,
    outstandingBalance,
    roomId,
    tenantId,
}: Props) {
    const [editing, setEditing] = useState(false);
    const [selectedDay, setSelectedDay] = useState(String(Math.max(1, Math.min(31, Number(billingDay ?? 1) || 1))));
    const [message, setMessage] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    const day = Math.max(1, Math.min(31, Number(billingDay ?? selectedDay ?? 1) || 1));

    function save() {
        startTransition(async () => {
            try {
                setMessage(null);
                const result = await setTenantBillingDate({
                    billingDay: Number(selectedDay),
                    leaseId,
                    roomId,
                    tenantId,
                });
                setMessage(result.message);
                setEditing(false);
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Billing date could not be updated.");
            }
        });
    }

    return (
        <div className="rounded-2xl border border-cyan-100 bg-cyan-50/70 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <CalendarClock size={18} className="text-cyan-700" />
                        <h3 className="text-sm font-black uppercase tracking-wide text-cyan-950">Tenant Billing Date</h3>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-cyan-900">
                        Billing date: {labelForDay(day)} of every month. Tenants without a saved billing date default to the 1st.
                    </p>
                </div>
                {canEdit ? (
                    <button
                        type="button"
                        onClick={() => {
                            setSelectedDay(String(day));
                            setEditing((value) => !value);
                            setMessage(null);
                        }}
                        className="inline-flex h-10 items-center justify-center rounded-xl bg-cyan-700 px-4 text-sm font-black text-white shadow-sm hover:bg-cyan-800"
                    >
                        Set Billing Date
                    </button>
                ) : null}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
                <BillingMetric label="Next billing date" value={formatDate(nextChargeDate)} />
                <BillingMetric label="Last rent charge" value={formatDate(lastChargeDate)} />
                <BillingMetric label="Monthly rent" value={money(monthlyRent)} />
                <BillingMetric label="Current outstanding" value={money(outstandingBalance)} />
                <BillingMetric
                    label="Current period"
                    value={currentPeriod ? `${formatDate(currentPeriod.start)} - ${formatDate(currentPeriod.end)}` : "Not available"}
                />
            </div>

            {editing ? (
                <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-cyan-200 bg-white p-3 sm:flex-row sm:items-end">
                    <label className="text-sm font-bold text-slate-700">
                        Billing day
                        <select
                            disabled={isPending}
                            value={selectedDay}
                            onChange={(event) => setSelectedDay(event.target.value)}
                            className="mt-2 h-11 w-full rounded-xl border border-cyan-200 bg-white px-3 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100 sm:w-44"
                        >
                            {Array.from({ length: 31 }, (_, index) => index + 1).map((value) => (
                                <option key={value} value={value}>{labelForDay(value)}</option>
                            ))}
                        </select>
                    </label>
                    <button
                        type="button"
                        disabled={isPending}
                        onClick={save}
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-black text-white disabled:opacity-40"
                    >
                        {isPending ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                        Save Billing Date
                    </button>
                    <button
                        type="button"
                        disabled={isPending}
                        onClick={() => setEditing(false)}
                        className="h-11 rounded-xl bg-slate-100 px-4 text-sm font-black text-slate-700 disabled:opacity-40"
                    >
                        Cancel
                    </button>
                </div>
            ) : null}
            {message ? <p className="mt-3 rounded-xl bg-white px-3 py-2 text-sm font-bold text-cyan-900">{message}</p> : null}
        </div>
    );
}

function BillingMetric({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-w-0 rounded-xl border border-white bg-white/80 p-3 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 break-words text-sm font-black text-slate-950">{value}</p>
        </div>
    );
}
