"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Search, XCircle } from "lucide-react";
import { adminDirectRoomRentChange, adminSearchRooms, decideRoomRentChange } from "@/app/actions/room-rent";
import type { RoomRentChangeRequestRow } from "@/lib/admin-centre/types";

type Props = {
    pendingRequests: EnrichedRoomRentChangeRequest[];
};

export type EnrichedRoomRentChangeRequest = RoomRentChangeRequestRow & {
    roomNumber: string;
    officeName: string;
    landlordName: string;
    tenantName: string;
};

type RoomSearchResult = {
    id: string;
    roomNumber: string | null;
    status: string | null;
    officeName: string | null;
    propertyName: string | null;
    landlordName: string | null;
    landlordPhone: string | null;
    tenantName: string | null;
    currentRent: number;
    outstandingBalance: number;
    lastRentChange: null | {
        oldRent: number;
        newRent: number;
        status: string;
        effectiveDate: string;
        createdAt: string;
    };
};

function money(value: number | string | null | undefined) {
    return `UGX ${Math.round(Number(value ?? 0)).toLocaleString()}`;
}

function formatDate(value: string | null | undefined) {
    if (!value) return "Not dated";
    return new Intl.DateTimeFormat("en-UG", { dateStyle: "medium", timeZone: "Africa/Kampala" }).format(new Date(value));
}

export default function AdminRoomRentCentre({ pendingRequests }: Props) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<RoomSearchResult[]>([]);
    const [activeRoom, setActiveRoom] = useState<RoomSearchResult | null>(null);
    const [newRent, setNewRent] = useState("");
    const [reason, setReason] = useState("");
    const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
    const [message, setMessage] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    function searchRooms() {
        startTransition(async () => {
            try {
                setMessage(null);
                setResults(await adminSearchRooms(query) as RoomSearchResult[]);
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Room search failed.");
            }
        });
    }

    function decide(request: RoomRentChangeRequestRow, decision: "approved" | "rejected") {
        const comment = decision === "rejected" ? window.prompt("Reason for rejection?") ?? "" : window.prompt("Approval note / reason?") ?? "";
        startTransition(async () => {
            try {
                setMessage(null);
                await decideRoomRentChange({ requestId: request.id, decision, comment });
                setMessage(decision === "approved" ? "Rent change approved and applied." : "Rent change rejected. Old rent was kept.");
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Unable to decide rent request.");
            }
        });
    }

    function directChange() {
        if (!activeRoom) return;
        startTransition(async () => {
            try {
                setMessage(null);
                await adminDirectRoomRentChange({
                    roomId: activeRoom.id,
                    newRent: Number(newRent),
                    reason,
                    effectiveDate,
                });
                setMessage("Admin changed room rent directly. Tenant, landlord, payment entry, and dashboard calculations will refresh.");
                setActiveRoom(null);
                setNewRent("");
                setReason("");
                searchRooms();
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Direct rent change failed.");
            }
        });
    }

    return (
        <section id="room-rent-approvals" className="enterprise-panel overflow-hidden">
            <div className="border-b border-slate-200 p-6">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <p className="text-xs font-black uppercase tracking-wide text-blue-600">Room Rent Governance</p>
                        <h2 className="mt-1 text-xl font-black text-slate-950">Rent Update Approvals & Room Search</h2>
                        <p className="text-sm font-semibold text-slate-500">Office users request rent changes for approval. Admin direct rent edits apply immediately and refresh landlord totals.</p>
                    </div>
                    <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700 ring-1 ring-amber-200">
                        {pendingRequests.length} pending approvals
                    </span>
                </div>
                {message ? <p className="mt-4 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-black text-blue-800">{message}</p> : null}
            </div>

            <div className="grid grid-cols-1 gap-5 p-5 xl:grid-cols-2">
                <div className="rounded-3xl border border-slate-200 bg-white p-4">
                    <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">Pending rent change requests</h3>
                    <div className="mt-3 space-y-3">
                        {pendingRequests.length === 0 ? (
                            <p className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-500">No pending room rent changes.</p>
                        ) : pendingRequests.map((request) => {
                            return (
                                <div key={request.id} className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                        <div>
                                            <p className="text-lg font-black text-slate-950">Room {request.roomNumber}</p>
                                            <p className="text-xs font-bold text-slate-500">{request.officeName} · {request.landlordName} · {request.tenantName}</p>
                                            <p className="mt-2 text-sm font-semibold text-slate-700">{request.reason}</p>
                                        </div>
                                        <div className="text-sm font-black text-slate-900">
                                            {money(request.old_rent)} → <span className="text-blue-700">{money(request.new_rent)}</span>
                                            <p className="text-xs text-slate-500">Effective {formatDate(request.effective_date)}</p>
                                        </div>
                                    </div>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <button disabled={isPending} onClick={() => decide(request, "approved")} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-black text-white disabled:opacity-40">
                                            <CheckCircle2 size={14} /> Approve
                                        </button>
                                        <button disabled={isPending} onClick={() => decide(request, "rejected")} className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-3 py-2 text-xs font-black text-white disabled:opacity-40">
                                            <XCircle size={14} /> Reject
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-4">
                    <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">Admin room search</h3>
                    <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                        <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search by room, tenant, landlord, office, property"
                            className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold"
                        />
                        <button disabled={isPending} onClick={searchRooms} className="inline-flex h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-black text-white disabled:opacity-40">
                            <Search size={16} /> Search
                        </button>
                    </div>
                    <div className="mt-4 space-y-3">
                        {results.length === 0 ? (
                            <p className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-500">Search results will show occupied, vacant, archived, and inactive rooms.</p>
                        ) : results.map((room) => (
                            <div key={room.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                    <div>
                                        <p className="text-lg font-black text-slate-950">Room {room.roomNumber ?? "Unnumbered"}</p>
                                        <p className="text-xs font-bold text-slate-500">{room.officeName ?? "Needs review"} · {room.propertyName ?? "No property"} · {room.landlordName ?? "No landlord"}</p>
                                        <p className="text-xs font-bold text-slate-500">Tenant: {room.tenantName ?? "Vacant"} · Landlord phone: {room.landlordPhone ?? "Not recorded"}</p>
                                    </div>
                                    <span className="rounded-full bg-white px-3 py-1 text-xs font-black uppercase text-slate-700 ring-1 ring-slate-200">{room.status ?? "unknown"}</span>
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-bold md:grid-cols-4">
                                    <Mini label="Current Rent" value={money(room.currentRent)} />
                                    <Mini label="Outstanding" value={money(room.outstandingBalance)} />
                                    <Mini label="Last Change" value={room.lastRentChange ? `${money(room.lastRentChange.oldRent)} → ${money(room.lastRentChange.newRent)}` : "No history"} />
                                    <button onClick={() => { setActiveRoom(room); setNewRent(String(room.currentRent)); }} className="rounded-xl bg-blue-700 px-3 py-2 text-xs font-black text-white">
                                        Update Rent Now
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {activeRoom ? (
                <div className="border-t border-slate-200 bg-slate-50 p-5">
                    <div className="rounded-3xl border border-blue-200 bg-white p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h3 className="text-lg font-black text-slate-950">Direct Admin Rent Change · Room {activeRoom.roomNumber ?? "Unnumbered"}</h3>
                                <p className="text-sm font-semibold text-slate-500">This bypasses approval but still requires a reason, creates rent history, and writes audit logs.</p>
                            </div>
                            <button onClick={() => setActiveRoom(null)} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700">Close</button>
                        </div>
                        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_2fr_auto] md:items-end">
                            <label className="text-sm font-bold text-slate-700">New rent<input value={newRent} onChange={(event) => setNewRent(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3" /></label>
                            <label className="text-sm font-bold text-slate-700">Effective date<input type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3" /></label>
                            <label className="text-sm font-bold text-slate-700">Reason<input value={reason} onChange={(event) => setReason(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3" /></label>
                            <button disabled={isPending} onClick={directChange} className="h-11 rounded-xl bg-slate-950 px-4 text-sm font-black text-white disabled:opacity-40">Save Change</button>
                        </div>
                    </div>
                </div>
            ) : null}
        </section>
    );
}

function Mini({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200">
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</p>
            <p className="truncate text-xs font-black text-slate-950">{value}</p>
        </div>
    );
}
