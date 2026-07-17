"use client";

import { useEffect, useState, useTransition } from "react";
import type React from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, CreditCard, Eye } from "lucide-react";
import { markRoomOccupied } from "@/app/actions/room-occupancy";
import { requestRoomRentChange } from "@/app/actions/room-rent";

type RoomActionPanelRoom = {
    id: string;
    roomNumber: string | null;
    status: string | null;
    monthlyRent: number;
    outstandingBalance: number;
    landlordName?: string | null;
    propertyName?: string | null;
    officeName?: string | null;
    tenantName?: string | null;
    tenantPhone?: string | null;
};

type Props = {
    isAdmin?: boolean;
    onSaved: () => void | Promise<void>;
    room: RoomActionPanelRoom | null;
};

function money(value: number) {
    return `UGX ${Math.round(value).toLocaleString()}`;
}

export default function RoomActionPanel({ isAdmin = false, onSaved, room }: Props) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showRentRequest, setShowRentRequest] = useState(false);
    const [showRoomDetails, setShowRoomDetails] = useState(false);
    const [form, setForm] = useState({
        tenantName: "",
        tenantPhone: "",
        nationalId: "",
        moveInDate: new Date().toISOString().slice(0, 10),
        monthlyRent: "",
        moneyCollected: "0",
        balanceDemanded: "",
        paymentMethod: "cash",
        referenceNumber: "",
        notes: "",
    });
    const [rentRequest, setRentRequest] = useState({
        proposedRent: "",
        reason: "",
        effectiveDate: new Date().toISOString().slice(0, 10),
    });

    useEffect(() => {
        setMessage(null);
        setError(null);
        setForm((current) => ({
            ...current,
            tenantName: "",
            tenantPhone: "",
            nationalId: "",
            moveInDate: new Date().toISOString().slice(0, 10),
            monthlyRent: room?.monthlyRent ? String(room.monthlyRent) : "",
            moneyCollected: "0",
            balanceDemanded: room?.monthlyRent ? String(room.monthlyRent) : "",
            referenceNumber: "",
            notes: "",
        }));
        setRentRequest({
            proposedRent: room?.monthlyRent ? String(room.monthlyRent) : "",
            reason: "",
            effectiveDate: new Date().toISOString().slice(0, 10),
        });
        setShowRentRequest(false);
        setShowRoomDetails(false);
    }, [room?.id, room?.monthlyRent]);

    if (!room) {
        return null;
    }

    const isVacant = String(room.status ?? "").toLowerCase() === "vacant" || !room.tenantName;
    const rentGovernanceDescription = isAdmin
        ? "Admin rent changes apply immediately and refresh tenant, landlord, and dashboard calculations."
        : "Office users can request rent changes. Rent does not change until admin approval.";
    const balanceDemanded = Number(form.balanceDemanded || 0);
    const moneyCollected = Number(form.moneyCollected || 0);
    const projectedBalance = Math.max(0, balanceDemanded - moneyCollected);

    function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
        setForm((current) => ({ ...current, [key]: value }));
        setError(null);
        setMessage(null);
    }

    function openRoomRoute(path: string) {
        const selectedRoomNumber = room?.roomNumber?.trim();
        if (!selectedRoomNumber) return;
        router.push(`${path}?room=${encodeURIComponent(selectedRoomNumber)}`);
    }

    function submit() {
        const selectedRoom = room;
        if (!selectedRoom) return;
        startTransition(async () => {
            try {
                setError(null);
                setMessage(null);
                const result = await markRoomOccupied({
                    roomId: selectedRoom.id,
                    tenantName: form.tenantName,
                    tenantPhone: form.tenantPhone,
                    nationalId: form.nationalId || null,
                    moveInDate: form.moveInDate,
                    monthlyRent: Number(form.monthlyRent),
                    moneyCollected: Number(form.moneyCollected),
                    balanceDemanded: Number(form.balanceDemanded),
                    paymentMethod: form.paymentMethod,
                    referenceNumber: form.referenceNumber || null,
                    notes: form.notes || null,
                });
                if (!result.ok) {
                    setError(`${result.error} Reference: ${result.requestId}.`);
                    return;
                }
                setMessage("Tenant saved successfully and room marked occupied.");
                await onSaved();
            } catch (caught) {
                setError(caught instanceof Error ? caught.message : "Unable to mark room occupied.");
            }
        });
    }

    function submitRentRequest() {
        const selectedRoom = room;
        if (!selectedRoom) return;
        startTransition(async () => {
            try {
                setError(null);
                setMessage(null);
                const result = await requestRoomRentChange({
                    roomId: selectedRoom.id,
                    proposedRent: Number(rentRequest.proposedRent),
                    reason: rentRequest.reason,
                    effectiveDate: rentRequest.effectiveDate,
                }) as { status?: string } | null;
                setMessage(result?.status === "approved"
                    ? "Admin rent change applied immediately. Landlord portfolio and payment totals were refreshed."
                    : "Rent change request sent to admin.");
                setShowRentRequest(false);
                try {
                    await onSaved();
                } catch {
                    router.refresh();
                }
            } catch (caught) {
                setError(caught instanceof Error ? caught.message : "Rent change request failed.");
            }
        });
    }

    return (
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <p className="text-xs font-black uppercase tracking-wide text-blue-600">Room Action Panel</p>
                    <h3 className="mt-1 text-2xl font-black text-slate-950">Room {room.roomNumber ?? "Unnumbered"}</h3>
                    <p className="mt-1 text-sm font-semibold text-slate-500">
                        {room.propertyName ?? "No property"} · {room.officeName ?? "No office"} · {room.landlordName ?? "No landlord"}
                    </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-black uppercase ${isVacant ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200" : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"}`}>
                    {isVacant ? "vacant" : "occupied"}
                </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Mini label="Monthly Rent" value={money(room.monthlyRent)} />
                <Mini label="Outstanding" value={money(room.outstandingBalance)} tone="text-red-700" />
                <Mini label="Tenant" value={room.tenantName ?? "Vacant"} />
                <Mini label="Phone" value={room.tenantPhone ?? "Not recorded"} />
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-950 p-3">
                <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Quick Actions</p>
                <div className="mt-2 flex flex-wrap gap-2">
                    <button
                        type="button"
                        disabled={!room.roomNumber || isVacant}
                        onClick={() => openRoomRoute("/office/payments")}
                        className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-500 px-3 text-xs font-black text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                    >
                        <CreditCard size={15} />
                        Record Payment
                    </button>
                    <button
                        type="button"
                        disabled={!room.roomNumber || isVacant}
                        onClick={() => openRoomRoute("/office/promises")}
                        className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-500 px-3 text-xs font-black text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                    >
                        <ClipboardList size={15} />
                        Create Promise
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowRoomDetails((current) => !current)}
                        className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3 text-xs font-black text-white transition hover:bg-white/15"
                    >
                        <Eye size={15} />
                        View Tenant / Room Details
                    </button>
                </div>
                {isVacant ? (
                    <p className="mt-2 text-xs font-bold text-slate-400">Payment and promise actions unlock when the room has an active tenant.</p>
                ) : null}
            </div>

            {showRoomDetails ? (
                <div className="mt-3 grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-sm font-bold text-slate-700 md:grid-cols-2">
                    <p><span className="text-slate-400">Room:</span> {room.roomNumber ?? "Unnumbered"}</p>
                    <p><span className="text-slate-400">Status:</span> {isVacant ? "Vacant" : "Occupied"}</p>
                    <p><span className="text-slate-400">Tenant:</span> {room.tenantName ?? "Vacant"}</p>
                    <p><span className="text-slate-400">Phone:</span> {room.tenantPhone ?? "Not recorded"}</p>
                    <p><span className="text-slate-400">Landlord:</span> {room.landlordName ?? "No landlord"}</p>
                    <p><span className="text-slate-400">Property:</span> {room.propertyName ?? "No property"}</p>
                </div>
            ) : null}

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <p className="text-sm font-black text-slate-950">Room Rent Governance</p>
                        <p className="text-xs font-bold text-slate-500">{rentGovernanceDescription}</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowRentRequest((current) => !current)}
                        className="rounded-xl bg-blue-700 px-4 py-2 text-xs font-black text-white hover:bg-blue-800"
                    >
                        {showRentRequest ? "Close Rent Request" : "Update Room Rent"}
                    </button>
                </div>
                {showRentRequest ? (
                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_2fr_auto] md:items-end">
                        <Field label="Current Rent"><input value={money(room.monthlyRent)} readOnly /></Field>
                        <Field label="Proposed New Rent"><input inputMode="numeric" value={rentRequest.proposedRent} onChange={(event) => setRentRequest((current) => ({ ...current, proposedRent: event.target.value }))} /></Field>
                        <Field label="Reason"><input value={rentRequest.reason} onChange={(event) => setRentRequest((current) => ({ ...current, reason: event.target.value }))} /></Field>
                        <Field label="Effective Date"><input type="date" value={rentRequest.effectiveDate} onChange={(event) => setRentRequest((current) => ({ ...current, effectiveDate: event.target.value }))} /></Field>
                        <div className="md:col-span-4">
                            {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-black text-red-700">{error}</p> : null}
                            {message ? <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700">{message}</p> : null}
                        </div>
                        <div className="md:col-span-4 flex justify-end">
                            <button
                                type="button"
                                disabled={isPending}
                                onClick={submitRentRequest}
                                className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
                            >
                                {isPending ? (isAdmin ? "Updating..." : "Sending...") : isAdmin ? "Update Rent Now" : "Send for Admin Approval"}
                            </button>
                        </div>
                    </div>
                ) : null}
                {!showRentRequest && (error || message) ? (
                    <div className="mt-3">
                        {error ? <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-black text-red-700">{error}</p> : null}
                        {message ? <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700">{message}</p> : null}
                    </div>
                ) : null}
            </div>

            {!isVacant ? (
                <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
                    This room is already occupied. Open the tenant card for payment, promise, and balance actions.
                </div>
            ) : (
                <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
                    <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                            <p className="font-black text-slate-950">Mark Room Occupied</p>
                            <p className="text-xs font-bold text-slate-500">Previous vacated tenant debt remains separate and is not carried to the new tenant.</p>
                        </div>
                        <div className="rounded-2xl bg-white px-4 py-2 text-sm font-black text-slate-900 shadow-sm">
                            Projected balance: {money(projectedBalance)}
                        </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <Field label="Tenant Name"><input value={form.tenantName} onChange={(event) => update("tenantName", event.target.value)} /></Field>
                        <Field label="Tenant Phone"><input value={form.tenantPhone} onChange={(event) => update("tenantPhone", event.target.value)} /></Field>
                        <Field label="National ID"><input value={form.nationalId} onChange={(event) => update("nationalId", event.target.value)} /></Field>
                        <Field label="Move-in Date"><input type="date" value={form.moveInDate} onChange={(event) => update("moveInDate", event.target.value)} /></Field>
                        <Field label="Monthly Rent"><input inputMode="numeric" value={form.monthlyRent} onChange={(event) => update("monthlyRent", event.target.value)} /></Field>
                        <Field label="Money Collected"><input inputMode="numeric" value={form.moneyCollected} onChange={(event) => update("moneyCollected", event.target.value)} /></Field>
                        <Field label="Balance Demanded"><input inputMode="numeric" value={form.balanceDemanded} onChange={(event) => update("balanceDemanded", event.target.value)} /></Field>
                        <Field label="Payment Method">
                            <select value={form.paymentMethod} onChange={(event) => update("paymentMethod", event.target.value)}>
                                <option value="cash">Cash</option>
                                <option value="mobile_money">Mobile Money</option>
                                <option value="bank">Bank</option>
                            </select>
                        </Field>
                        <Field label="Reference"><input value={form.referenceNumber} onChange={(event) => update("referenceNumber", event.target.value)} /></Field>
                        <Field label="Notes"><input value={form.notes} onChange={(event) => update("notes", event.target.value)} /></Field>
                    </div>
                    <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div />
                        <button
                            type="button"
                            onClick={submit}
                            disabled={isPending}
                            className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isPending ? "Saving..." : "Mark Room Occupied"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function Mini({ label, tone = "text-slate-950", value }: { label: string; tone?: string; value: string }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</p>
            <p className={`mt-1 truncate text-sm font-black ${tone}`}>{value}</p>
        </div>
    );
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
    return (
        <label className="space-y-1 text-xs font-black uppercase tracking-wide text-slate-500 [&_input]:h-10 [&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:border-slate-200 [&_input]:bg-white [&_input]:px-3 [&_input]:text-sm [&_input]:font-semibold [&_input]:normal-case [&_input]:tracking-normal [&_input]:text-slate-900 [&_input]:outline-none [&_input]:focus:border-blue-400 [&_select]:h-10 [&_select]:w-full [&_select]:rounded-xl [&_select]:border [&_select]:border-slate-200 [&_select]:bg-white [&_select]:px-3 [&_select]:text-sm [&_select]:font-semibold [&_select]:normal-case [&_select]:tracking-normal [&_select]:text-slate-900 [&_select]:outline-none [&_select]:focus:border-blue-400">
            <span>{label}</span>
            {children}
        </label>
    );
}
