"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upsertTenantRentSponsor } from "@/app/actions/collections";
import { requestRoomRentChange } from "@/app/actions/room-rent";
import { updateTenantContact, vacateTenant } from "@/app/actions/tenants";
import TenantBillingDateControl from "@/components/office/shared/TenantBillingDateControl";
import type { CollectionTenantResult } from "@/lib/collections/types";

type Props = {
    canEdit?: boolean;
    isAdmin?: boolean;
    onTenantUpdated?: () => Promise<void> | void;
    tenantContext: CollectionTenantResult | null;
};

function riskLevelFromReliability(score: number) {
    if (score >= 90) return "Elite";
    if (score >= 75) return "Low Risk";
    if (score >= 50) return "Medium Risk";
    if (score >= 25) return "High Risk";
    return "Critical";
}

function riskTone(riskLevel: string) {
    if (riskLevel === "Elite") return "text-emerald-600";
    if (riskLevel === "Low Risk") return "text-green-600";
    if (riskLevel === "Medium Risk") return "text-amber-600";
    if (riskLevel === "High Risk") return "text-orange-600";
    return "text-red-600";
}

function money(value: number | null | undefined) {
    return `UGX ${Math.round(Number(value ?? 0)).toLocaleString()}`;
}

function balanceLabel(value: number) {
    if (value < 0) return `Rent Advance ${money(Math.abs(value))}`;
    return money(value);
}

function formatDate(value: string | null | undefined) {
    if (!value) return "Not dated";
    return new Intl.DateTimeFormat("en-UG", {
        dateStyle: "medium",
        timeStyle: value.includes("T") ? "short" : undefined,
    }).format(new Date(value));
}

export default function TenantSnapshot({ tenantContext, canEdit = true, isAdmin = false, onTenantUpdated }: Props) {
    const router = useRouter();
    const [isEditing, setIsEditing] = useState(false);
    const [isEditingSponsor, setIsEditingSponsor] = useState(false);
    const [isRequestingRentChange, setIsRequestingRentChange] = useState(false);
    const [isVacating, setIsVacating] = useState(false);
    const [fullName, setFullName] = useState("");
    const [phone, setPhone] = useState("");
    const [employerName, setEmployerName] = useState("");
    const [employerContact, setEmployerContact] = useState("");
    const [employerPhone, setEmployerPhone] = useState("");
    const [employerMethod, setEmployerMethod] = useState("bank_cheque");
    const [employerCoveredAmount, setEmployerCoveredAmount] = useState("");
    const [employerChequeRef, setEmployerChequeRef] = useState("");
    const [employerNotes, setEmployerNotes] = useState("");
    const [proposedRent, setProposedRent] = useState("");
    const [rentChangeReason, setRentChangeReason] = useState("");
    const [rentChangeEffectiveDate, setRentChangeEffectiveDate] = useState(todayDate());
    const [vacateDate, setVacateDate] = useState(todayDate());
    const [vacateReason, setVacateReason] = useState("");
    const [message, setMessage] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    if (!tenantContext) {
        return (
            <div className="bg-white rounded-3xl shadow-lg p-6">
                <h2 className="text-xl font-bold mb-3">Tenant Intelligence Profile</h2>
                <p className="text-slate-400">
                    Search a tenant, phone number, tenant code, or room in the active office.
                </p>
            </div>
        );
    }

    const {
        tenant,
        room,
        property,
        office,
        landlord,
        lease,
        monthlyRent,
        outstandingBalance,
        openPromise,
        collections,
        promises,
        ledgerEntries,
        actionHistory,
    } = tenantContext;
    const initials = tenant.full_name
        ?.split(" ")
        .map((name) => name[0])
        .join("")
        .substring(0, 2);
    const reliability = Math.round(tenant.tenant_reliability_score ?? tenant.reliability_score ?? 0);
    const riskLevel = tenant.tenant_risk_level ?? riskLevelFromReliability(reliability);
    const sponsor = tenantContext.sponsor;
    const contribution = tenantContext.contribution;

    function openEdit() {
        setFullName(tenant.full_name ?? "Unnamed Tenant");
        setPhone(tenant.phone ?? "");
        setMessage(null);
        setIsEditing(true);
    }

    function saveTenant() {
        startTransition(async () => {
            try {
                setMessage(null);
                await updateTenantContact({ tenantId: tenant.id, fullName, phone });
                setMessage("Tenant updated.");
                setIsEditing(false);
                await onTenantUpdated?.();
                router.refresh();
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Tenant update failed.");
            }
        });
    }

    function openSponsorEdit() {
        setEmployerName(sponsor?.employer_name ?? "");
        setEmployerContact(sponsor?.contact_person ?? "");
        setEmployerPhone(sponsor?.employer_phone ?? "");
        setEmployerMethod(sponsor?.payment_method ?? "bank_cheque");
        setEmployerCoveredAmount(String(Number(sponsor?.covered_amount ?? 0) || ""));
        setEmployerChequeRef(sponsor?.cheque_reference ?? "");
        setEmployerNotes(sponsor?.notes ?? "");
        setMessage(null);
        setIsEditingSponsor(true);
    }

    function saveSponsor() {
        startTransition(async () => {
            try {
                setMessage(null);
                await upsertTenantRentSponsor({
                    tenantId: tenant.id,
                    employerName,
                    contactPerson: employerContact || undefined,
                    employerPhone: employerPhone || undefined,
                    paymentMethod: employerMethod as "bank_cheque" | "bank_transfer" | "cash" | "mobile_money" | "other",
                    employerCoveredAmount: Number(employerCoveredAmount),
                    chequeReference: employerChequeRef || undefined,
                    notes: employerNotes || undefined,
                });
                setMessage("Employer rent contribution saved.");
                setIsEditingSponsor(false);
                await onTenantUpdated?.();
                router.refresh();
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Employer contribution update failed.");
            }
        });
    }

    function openRentChangeRequest() {
        setProposedRent(String(monthlyRent || room?.monthly_rent || ""));
        setRentChangeReason("");
        setRentChangeEffectiveDate(todayDate());
        setMessage(null);
        setIsRequestingRentChange(true);
    }

    function submitRentChangeRequest() {
        startTransition(async () => {
            try {
                setMessage(null);
                if (!room?.id) throw new Error("This tenant is not linked to a room.");
                const result = await requestRoomRentChange({
                    roomId: room.id,
                    proposedRent: Number(proposedRent),
                    reason: rentChangeReason,
                    effectiveDate: rentChangeEffectiveDate,
                }) as { status?: string } | null;
                setMessage(result?.status === "approved"
                    ? "Admin changed room rent directly. Tenant, landlord, and dashboard calculations were refreshed."
                    : "Rent change request sent to admin.");
                setIsRequestingRentChange(false);
                try {
                    await onTenantUpdated?.();
                } catch {
                    router.refresh();
                }
                router.refresh();
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Rent change request failed.");
            }
        });
    }

    function submitVacate(clearBalance: boolean) {
        startTransition(async () => {
            try {
                setMessage(null);
                if (!vacateDate) throw new Error("Vacate date is required.");
                await vacateTenant({
                    tenantId: tenant.id,
                    vacateDate,
                    clearBalance,
                    reason: vacateReason,
                });
                setMessage(clearBalance
                    ? "Tenant vacated and balance cleared. Room is now available."
                    : "Tenant vacated. Outstanding balance moved to bad debt recovery and the room is now available.");
                setIsVacating(false);
                await onTenantUpdated?.();
                router.refresh();
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Tenant vacating failed.");
            }
        });
    }

    return (
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden">
            <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-slate-900 p-6 text-white">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="h-16 w-16 rounded-full bg-white/20 flex items-center justify-center font-black text-xl">
                            {initials || "TN"}
                        </div>

                        <div>
                            <h2 className="text-2xl font-bold">{tenant.full_name ?? "Unnamed tenant"}</h2>
                            <p className="text-blue-100">Tenant Code: {tenant.tenant_code ?? "Not assigned"}</p>
                        </div>
                    </div>

                    <div className="text-right">
                        <p className="text-xs opacity-70">Lease Status</p>
                        <h3 className="text-2xl font-black text-green-300">{lease?.status ?? tenant.status ?? "active"}</h3>
                        {canEdit ? (
                            <button
                                onClick={openEdit}
                                className="mt-2 rounded-full bg-white/15 px-4 py-2 text-xs font-black text-white hover:bg-white/25"
                            >
                                Edit Tenant
                            </button>
                        ) : null}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-4 border-b">
                <Metric label="Monthly Rent" value={`UGX ${monthlyRent.toLocaleString()}`} />
                <Metric label={outstandingBalance < 0 ? "Rent Advance" : "Balance"} value={balanceLabel(outstandingBalance)} tone={outstandingBalance < 0 ? "text-emerald-600" : "text-red-600"} />
                <Metric label="Reliability" value={String(reliability || "N/A")} tone="text-green-600" />
                <Metric label="Risk Level" value={riskLevel} tone={riskTone(riskLevel)} />
            </div>

            <div className="grid grid-cols-1 border-b bg-slate-50 md:grid-cols-3">
                <Metric label="Employer Expected" value={money(contribution.employerExpected)} tone={contribution.hasSponsor ? "text-blue-700" : "text-slate-400"} />
                <Metric label="Tenant Top-Up To Collect" value={money(contribution.collectFromTenant)} tone="text-amber-700" />
                <Metric label="Employer Balance" value={money(contribution.employerBalance)} tone={contribution.employerBalance > 0 ? "text-red-600" : "text-emerald-600"} />
            </div>

            <div className="p-6 space-y-6">
                {isEditing ? (
                    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto_auto] md:items-end">
                            <label className="text-sm font-bold text-slate-700">
                                Tenant Name
                                <input value={fullName} onChange={(event) => setFullName(event.target.value)} className="mt-2 w-full rounded-xl border border-blue-200 bg-white px-3 py-2" />
                            </label>
                            <label className="text-sm font-bold text-slate-700">
                                Phone Number
                                <input value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-2 w-full rounded-xl border border-blue-200 bg-white px-3 py-2" />
                            </label>
                            <button disabled={isPending} onClick={saveTenant} className="rounded-xl bg-blue-700 px-4 py-3 text-sm font-black text-white disabled:opacity-40">
                                Save
                            </button>
                            <button disabled={isPending} onClick={() => setIsEditing(false)} className="rounded-xl bg-white px-4 py-3 text-sm font-black text-slate-700 ring-1 ring-slate-200 disabled:opacity-40">
                                Cancel
                            </button>
                        </div>
                        {message ? <p className="mt-3 text-sm font-semibold text-slate-700">{message}</p> : null}
                    </div>
                ) : message ? (
                    <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</p>
                ) : null}

                <TenantBillingDateControl
                    billingDay={tenantContext.billingAnniversaryDay}
                    canEdit={canEdit}
                    currentPeriod={tenantContext.currentRentPeriod}
                    lastChargeDate={tenantContext.lastRentChargeDate}
                    leaseId={lease?.id ?? null}
                    monthlyRent={monthlyRent}
                    nextChargeDate={tenantContext.nextRentChargeDate}
                    onSaved={async () => {
                        await onTenantUpdated?.();
                        router.refresh();
                    }}
                    outstandingBalance={outstandingBalance}
                    roomId={room?.id ?? null}
                    tenantId={tenant.id}
                />

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                            <h3 className="text-sm font-black uppercase tracking-wide text-slate-700">
                                {isAdmin ? "Direct Admin Rent Change" : "Room Rent Approval Workflow"}
                            </h3>
                            <p className="mt-1 text-sm font-semibold text-slate-600">
                                {isAdmin
                                    ? "Admin rent changes apply immediately and refresh tenant, landlord, and dashboard calculations."
                                    : "Request a rent change for this tenant's room. Rent stays unchanged until admin approves."}
                            </p>
                            <div className="mt-3 grid grid-cols-1 gap-2 text-sm md:grid-cols-4">
                                <Detail label="Tenant" value={tenant.full_name ?? "Unnamed tenant"} />
                                <Detail label="Room" value={room?.room_number ?? "Unassigned"} />
                                <Detail label="Landlord" value={landlord?.full_name ?? "Unassigned"} />
                                <Detail label="Current Rent" value={money(monthlyRent)} />
                            </div>
                        </div>
                        {canEdit ? (
                            <button
                                disabled={!room?.id}
                                onClick={openRentChangeRequest}
                                className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                {isAdmin ? "Update Rent Now" : "Request Rent Change"}
                            </button>
                        ) : null}
                    </div>

                    {isRequestingRentChange ? (
                        <div className="mt-4 grid grid-cols-1 gap-3 rounded-2xl border border-blue-200 bg-white p-4 md:grid-cols-[1fr_1fr_2fr]">
                            <label className="text-sm font-bold text-slate-700">
                                Proposed New Rent
                                <input
                                    inputMode="numeric"
                                    value={proposedRent}
                                    onChange={(event) => setProposedRent(event.target.value)}
                                    className="mt-2 h-11 w-full rounded-xl border border-blue-200 bg-white px-3"
                                />
                            </label>
                            <label className="text-sm font-bold text-slate-700">
                                Effective Date
                                <input
                                    type="date"
                                    value={rentChangeEffectiveDate}
                                    onChange={(event) => setRentChangeEffectiveDate(event.target.value)}
                                    className="mt-2 h-11 w-full rounded-xl border border-blue-200 bg-white px-3"
                                />
                            </label>
                            <label className="text-sm font-bold text-slate-700">
                                Reason for Change
                                <input
                                    value={rentChangeReason}
                                    onChange={(event) => setRentChangeReason(event.target.value)}
                                    placeholder="Landlord preference, negotiated rate, correction..."
                                    className="mt-2 h-11 w-full rounded-xl border border-blue-200 bg-white px-3"
                                />
                            </label>
                            <div className="flex flex-wrap gap-2 md:col-span-3">
                                <button disabled={isPending} onClick={submitRentChangeRequest} className="rounded-xl bg-blue-700 px-4 py-3 text-sm font-black text-white disabled:opacity-40">
                                    {isAdmin ? "Update Rent Now" : "Send for Admin Approval"}
                                </button>
                                <button disabled={isPending} onClick={() => setIsRequestingRentChange(false)} className="rounded-xl bg-white px-4 py-3 text-sm font-black text-slate-700 ring-1 ring-slate-200 disabled:opacity-40">
                                    Cancel
                                </button>
                            </div>
                        </div>
                    ) : null}
                </div>

                <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                            <h3 className="text-sm font-black uppercase tracking-wide text-blue-900">Employer / Sponsor Rent Contribution</h3>
                            {sponsor ? (
                                <div className="mt-2 grid grid-cols-1 gap-2 text-sm text-slate-700 md:grid-cols-2">
                                    <Detail label="Employer / Sponsor" value={sponsor.employer_name} />
                                    <Detail label="Contact" value={sponsor.contact_person ?? "Not recorded"} />
                                    <Detail label="Phone" value={sponsor.employer_phone ?? "Not recorded"} />
                                    <Detail label="Payment Method" value={sponsor.payment_method.replaceAll("_", " ")} />
                                    <Detail label="Cheque / Reference" value={sponsor.cheque_reference ?? "Not recorded"} />
                                    <Detail label="Notes" value={sponsor.notes ?? "No notes"} />
                                </div>
                            ) : (
                                <p className="mt-2 text-sm font-semibold text-slate-600">No employer contribution is configured for this tenant.</p>
                            )}
                        </div>
                        {canEdit ? (
                            <button onClick={openSponsorEdit} className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-black text-white hover:bg-blue-800">
                                {sponsor ? "Edit Sponsor" : "Add Sponsor"}
                            </button>
                        ) : null}
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                        <ContributionMetric label="Total Monthly Rent" value={monthlyRent} />
                        <ContributionMetric label="Employer Covered" value={contribution.employerExpected} />
                        <ContributionMetric label="Tenant Top-Up" value={contribution.tenantTopUpExpected} highlight />
                        <ContributionMetric label="Employer Received" value={contribution.employerReceivedThisMonth} />
                        <ContributionMetric label="Tenant Paid" value={contribution.tenantTopUpPaidThisMonth} />
                        <ContributionMetric label="Collect From Tenant" value={contribution.collectFromTenant} danger={contribution.collectFromTenant > 0} />
                    </div>

                    {isEditingSponsor ? (
                        <div className="mt-4 grid grid-cols-1 gap-3 rounded-2xl border border-blue-200 bg-white p-4 md:grid-cols-2">
                            <FormField label="Employer / Sponsor name" value={employerName} onChange={setEmployerName} />
                            <FormField label="Contact person" value={employerContact} onChange={setEmployerContact} />
                            <FormField label="Employer phone" value={employerPhone} onChange={setEmployerPhone} />
                            <label className="text-sm font-bold text-slate-700">
                                Employer payment method
                                <select value={employerMethod} onChange={(event) => setEmployerMethod(event.target.value)} className="mt-2 w-full rounded-xl border border-blue-200 bg-white px-3 py-2">
                                    <option value="bank_cheque">Bank cheque</option>
                                    <option value="bank_transfer">Bank transfer</option>
                                    <option value="cash">Cash</option>
                                    <option value="mobile_money">Mobile Money</option>
                                    <option value="other">Other</option>
                                </select>
                            </label>
                            <FormField label="Employer covered amount" value={employerCoveredAmount} onChange={setEmployerCoveredAmount} type="number" />
                            <FormField label="Cheque / reference number" value={employerChequeRef} onChange={setEmployerChequeRef} />
                            <label className="text-sm font-bold text-slate-700 md:col-span-2">
                                Notes
                                <textarea value={employerNotes} onChange={(event) => setEmployerNotes(event.target.value)} className="mt-2 min-h-20 w-full rounded-xl border border-blue-200 bg-white px-3 py-2" />
                            </label>
                            <div className="flex gap-2 md:col-span-2">
                                <button disabled={isPending} onClick={saveSponsor} className="rounded-xl bg-blue-700 px-4 py-3 text-sm font-black text-white disabled:opacity-40">
                                    Save Sponsor
                                </button>
                                <button disabled={isPending} onClick={() => setIsEditingSponsor(false)} className="rounded-xl bg-white px-4 py-3 text-sm font-black text-slate-700 ring-1 ring-slate-200 disabled:opacity-40">
                                    Cancel
                                </button>
                            </div>
                        </div>
                    ) : null}
                </div>

                {canEdit ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div>
                                <h3 className="text-sm font-black uppercase tracking-wide text-amber-900">Tenant Exit Workflow</h3>
                                <p className="mt-1 text-sm text-amber-800">
                                    Vacate this tenant without carrying their old balance to the next occupant of {room?.room_number ?? "this room"}.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsVacating((current) => !current)}
                                className="rounded-xl bg-amber-700 px-4 py-2 text-sm font-black text-white hover:bg-amber-800"
                            >
                                {isVacating ? "Close Vacate" : "Vacate Tenant"}
                            </button>
                        </div>

                        {isVacating ? (
                            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[180px_1fr_auto_auto] md:items-end">
                                <label className="text-sm font-bold text-slate-700">
                                    Vacate Date
                                    <input
                                        type="date"
                                        value={vacateDate}
                                        onChange={(event) => setVacateDate(event.target.value)}
                                        className="mt-2 w-full rounded-xl border border-amber-200 bg-white px-3 py-2"
                                    />
                                </label>
                                <label className="text-sm font-bold text-slate-700">
                                    Reason / Notes
                                    <input
                                        value={vacateReason}
                                        onChange={(event) => setVacateReason(event.target.value)}
                                        placeholder="Reason for vacating"
                                        className="mt-2 w-full rounded-xl border border-amber-200 bg-white px-3 py-2"
                                    />
                                </label>
                                <button
                                    disabled={isPending}
                                    onClick={() => submitVacate(true)}
                                    className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black text-white disabled:opacity-40"
                                >
                                    Vacate with balance cleared
                                </button>
                                <button
                                    disabled={isPending}
                                    onClick={() => submitVacate(false)}
                                    className="rounded-xl bg-red-700 px-4 py-3 text-sm font-black text-white disabled:opacity-40"
                                >
                                    Vacate without clearing
                                </button>
                            </div>
                        ) : null}
                    </div>
                ) : null}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                        <Detail label="Phone Number" value={tenant.phone ?? "Not recorded"} />
                        <Detail label="National ID" value={tenant.national_id ?? "Not recorded"} />
                        <Detail label="Office" value={office?.office_name ?? office?.name ?? "Unknown office"} />
                    </div>

                    <div className="space-y-3">
                        <Detail label="Property" value={property?.property_name ?? property?.name ?? "Unassigned"} />
                        <Detail label="Room" value={room?.room_number ?? "Unassigned"} />
                        <Detail label="Landlord" value={landlord?.full_name ?? "Unassigned"} />
                        <Detail label="Landlord Phone" value={landlord?.phone ?? "Not recorded"} />
                        <Detail
                            label="Open Promise"
                            value={openPromise ? `${money(openPromise.promised_amount ?? openPromise.amount)} due ${openPromise.promised_date ?? openPromise.promise_date}` : "None"}
                        />
                    </div>
                </div>

                <HistoryPanel
                    title="Payment History"
                    empty="No payments have been recorded for this tenant."
                    rows={collections.slice(0, 8).map((collection) => ({
                        id: collection.id,
                        label: `${((collection as typeof collection & { payment_source?: string | null }).payment_source ?? "tenant").replaceAll("_", " ")} · ${collection.payment_method ?? collection.type ?? "Collection"}`,
                        meta: formatDate(collection.paid_at ?? collection.created_at),
                        amount: money(collection.amount_paid ?? collection.amount),
                        detail: `Balance after: ${money(collection.balance)}${collection.reference_number ? ` · Ref ${collection.reference_number}` : ""}`,
                    }))}
                />

                <HistoryPanel
                    title="Promise History"
                    empty="No promises have been recorded for this tenant."
                    rows={promises.slice(0, 8).map((promise) => ({
                        id: promise.id,
                        label: promise.status ?? "open",
                        meta: `Due ${promise.promised_date ?? promise.promise_date ?? "not dated"}`,
                        amount: money(promise.promised_amount ?? promise.amount),
                        detail: promise.notes ?? "No notes recorded.",
                    }))}
                />

                <HistoryPanel
                    title="Balance Ledger"
                    empty="No ledger entries have been recorded for this tenant."
                    rows={ledgerEntries.slice(0, 8).map((entry) => ({
                        id: entry.id,
                        label: entry.entry_type === "credit" ? "Payment credit" : "Balance debit",
                        meta: formatDate(entry.created_at),
                        amount: money(entry.amount),
                        detail: `${entry.description ?? entry.source_type} · Balance after: ${money(entry.balance_after)}`,
                    }))}
                />

                <HistoryPanel
                    title="Audit Trail"
                    empty="No collection actions have been recorded for this tenant."
                    rows={actionHistory.slice(0, 8).map((action) => ({
                        id: action.id,
                        label: action.action_type.replaceAll("_", " "),
                        meta: formatDate(action.created_at),
                        amount: action.outcome ?? "Action",
                        detail: action.notes ?? "No notes recorded.",
                    }))}
                />
            </div>
        </div>
    );
}

function todayDate() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kampala" }).format(new Date());
}

function Metric({ label, value, tone = "text-slate-900" }: { label: string; value: string; tone?: string }) {
    return (
        <div className="p-4 border-l first:border-l-0">
            <p className="text-xs text-slate-500">{label}</p>
            <p className={`font-black text-lg ${tone}`}>{value}</p>
        </div>
    );
}

function Detail({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <p className="text-xs text-slate-500">{label}</p>
            <p className="font-semibold">{value}</p>
        </div>
    );
}

function ContributionMetric({ label, value, highlight = false, danger = false }: { label: string; value: number; highlight?: boolean; danger?: boolean }) {
    return (
        <div className={`rounded-2xl border px-4 py-3 ${highlight ? "border-amber-200 bg-amber-50" : danger ? "border-red-200 bg-red-50" : "border-blue-100 bg-white"}`}>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
            <p className={`mt-1 text-lg font-black ${danger ? "text-red-700" : highlight ? "text-amber-700" : "text-slate-950"}`}>{money(value)}</p>
        </div>
    );
}

function FormField({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
    return (
        <label className="text-sm font-bold text-slate-700">
            {label}
            <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-blue-200 bg-white px-3 py-2" />
        </label>
    );
}

function HistoryPanel({
    title,
    empty,
    rows,
}: {
    title: string;
    empty: string;
    rows: Array<{ id: string; label: string; meta: string; amount: string; detail: string }>;
}) {
    return (
        <div className="rounded-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between bg-slate-50 px-4 py-3">
                <h3 className="font-black text-slate-900">{title}</h3>
                <span className="text-xs font-bold text-slate-500">{rows.length} rows</span>
            </div>

            {rows.length === 0 ? (
                <div className="p-4 text-sm text-slate-500">{empty}</div>
            ) : (
                <div className="divide-y divide-slate-100">
                    {rows.map((row) => (
                        <div key={row.id} className="grid grid-cols-1 md:grid-cols-[1.1fr_1fr_1fr] gap-2 px-4 py-3">
                            <div>
                                <p className="font-bold capitalize text-slate-900">{row.label}</p>
                                <p className="text-xs text-slate-500">{row.meta}</p>
                            </div>
                            <p className="font-black text-slate-900">{row.amount}</p>
                            <p className="text-sm text-slate-600">{row.detail}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
