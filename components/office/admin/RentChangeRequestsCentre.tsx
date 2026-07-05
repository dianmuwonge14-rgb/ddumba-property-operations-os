"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, Clock3, History, XCircle } from "lucide-react";
import { decideRoomRentChange } from "@/app/actions/room-rent";
import { PageHero, StatusChip } from "@/components/office/shared/EnterpriseUI";
import type { AdminCentreData, RoomRentChangeRequestRow } from "@/lib/admin-centre/types";

type Props = {
    data: AdminCentreData;
};

type Filter = "pending" | "approved" | "rejected";

function money(value: number | string | null | undefined) {
    return `UGX ${Math.round(Number(value ?? 0)).toLocaleString()}`;
}

function formatDate(value: string | null | undefined) {
    if (!value) return "Not dated";
    return new Intl.DateTimeFormat("en-UG", {
        dateStyle: "medium",
        timeZone: "Africa/Kampala",
    }).format(new Date(value));
}

export default function RentChangeRequestsCentre({ data }: Props) {
    const [filter, setFilter] = useState<Filter>("pending");
    const [historyRoomId, setHistoryRoomId] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    const lookups = useMemo(() => ({
        rooms: new Map(data.raw.rooms.map((room) => [room.id, room])),
        offices: new Map(data.raw.offices.map((office) => [office.id, office.office_name ?? office.name ?? "Office"])),
        landlords: new Map(data.raw.landlords.map((landlord) => [landlord.id, landlord.full_name ?? "Landlord"])),
        tenants: new Map(data.raw.tenants.map((tenant) => [tenant.id, tenant.full_name ?? "Tenant"])),
        users: new Map(data.raw.users.map((user) => [user.id, user.full_name ?? user.email ?? "User"])),
    }), [data.raw.landlords, data.raw.offices, data.raw.rooms, data.raw.tenants, data.raw.users]);

    const allRequests = data.raw.rentChangeRequests;
    const pendingCount = allRequests.filter((request) => request.status === "pending").length;
    const approvedCount = allRequests.filter((request) => request.status === "approved" || request.status === "direct_admin_change").length;
    const rejectedCount = allRequests.filter((request) => request.status === "rejected").length;
    const visibleRequests = allRequests.filter((request) => {
        if (filter === "approved") return request.status === "approved" || request.status === "direct_admin_change";
        return request.status === filter;
    });
    const roomHistory = historyRoomId
        ? allRequests.filter((request) => request.room_id === historyRoomId)
        : [];

    function decide(request: RoomRentChangeRequestRow, decision: "approved" | "rejected") {
        const comment = window.prompt(decision === "approved" ? "Approval note / reason?" : "Reason for rejection?") ?? "";
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

    return (
        <main className="enterprise-page">
            <div className="enterprise-shell">
                <PageHero
                    title={`Rent Change Requests (${pendingCount})`}
                    subtitle="Admin approval queue for tenant-card and room-card rent change requests."
                    badge="Admin → Rent Change Requests"
                >
                    <div className="enterprise-card min-w-72 p-5">
                        <p className="text-sm font-bold text-slate-500">Pending Requests</p>
                        <p className="mt-1 text-4xl font-black text-slate-950">{pendingCount}</p>
                    </div>
                </PageHero>

                <section className="enterprise-panel overflow-hidden">
                    <div className="border-b border-slate-200 p-5">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                                <h2 className="text-xl font-black text-slate-950">Admin Approval Queue</h2>
                                <p className="text-sm font-semibold text-slate-500">Approve or reject requests. Approval is the only path that changes room, tenant, and lease rent.</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <FilterButton active={filter === "pending"} label={`Pending (${pendingCount})`} onClick={() => setFilter("pending")} />
                                <FilterButton active={filter === "approved"} label={`Approved (${approvedCount})`} onClick={() => setFilter("approved")} />
                                <FilterButton active={filter === "rejected"} label={`Rejected (${rejectedCount})`} onClick={() => setFilter("rejected")} />
                            </div>
                        </div>
                        {message ? <p className="mt-4 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-black text-blue-800">{message}</p> : null}
                    </div>

                    <div className="overflow-x-auto">
                        <table className="enterprise-table">
                            <thead>
                                <tr>
                                    <th className="text-left">Tenant</th>
                                    <th className="text-left">Room</th>
                                    <th className="text-left">Landlord</th>
                                    <th className="text-left">Office</th>
                                    <th className="text-left">Current Rent</th>
                                    <th className="text-left">Proposed Rent</th>
                                    <th className="text-left">Requested By</th>
                                    <th className="text-left">Request Date</th>
                                    <th className="text-left">Effective Date</th>
                                    <th className="text-left">Status</th>
                                    <th className="text-left">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleRequests.length === 0 ? (
                                    <tr>
                                        <td colSpan={11} className="p-6 text-sm font-bold text-slate-500">No {filter} rent change requests.</td>
                                    </tr>
                                ) : visibleRequests.map((request) => {
                                    const room = lookups.rooms.get(request.room_id);
                                    const tenant = request.tenant_id ? lookups.tenants.get(request.tenant_id) : null;
                                    const landlord = request.landlord_id ? lookups.landlords.get(request.landlord_id) : null;
                                    const office = request.office_id ? lookups.offices.get(request.office_id) : null;
                                    const requester = request.requested_by ? lookups.users.get(request.requested_by) : null;
                                    return (
                                        <tr key={request.id}>
                                            <td><p className="font-black">{tenant ?? "Vacant / no tenant"}</p><p className="text-xs text-slate-500">{request.reason}</p></td>
                                            <td>{room?.room_number ?? "Unnumbered"}</td>
                                            <td>{landlord ?? "No landlord"}</td>
                                            <td>{office ?? "Needs review"}</td>
                                            <td>{money(request.old_rent)}</td>
                                            <td><span className="font-black text-blue-700">{money(request.new_rent)}</span></td>
                                            <td>{requester ?? "Unknown user"}</td>
                                            <td>{formatDate(request.created_at)}</td>
                                            <td>{formatDate(request.effective_date)}</td>
                                            <td><Status request={request} /></td>
                                            <td>
                                                <div className="flex flex-wrap gap-2">
                                                    {request.status === "pending" ? (
                                                        <>
                                                            <button disabled={isPending} onClick={() => decide(request, "approved")} className="inline-flex items-center gap-1 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-black text-white disabled:opacity-40">
                                                                <CheckCircle2 size={14} /> Approve
                                                            </button>
                                                            <button disabled={isPending} onClick={() => decide(request, "rejected")} className="inline-flex items-center gap-1 rounded-xl bg-red-700 px-3 py-2 text-xs font-black text-white disabled:opacity-40">
                                                                <XCircle size={14} /> Reject
                                                            </button>
                                                        </>
                                                    ) : null}
                                                    <button onClick={() => setHistoryRoomId(request.room_id)} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">
                                                        <History size={14} /> View History
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </section>

                {historyRoomId ? (
                    <section className="enterprise-panel mt-6 p-5">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h2 className="text-xl font-black text-slate-950">Room Rent History</h2>
                                <p className="text-sm font-semibold text-slate-500">All request, approval, rejection, and direct admin changes for this room.</p>
                            </div>
                            <button onClick={() => setHistoryRoomId(null)} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700">Close History</button>
                        </div>
                        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
                            {roomHistory.map((request) => (
                                <div key={request.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <Status request={request} />
                                        <span className="text-xs font-bold text-slate-500"><Clock3 size={13} className="inline" /> {formatDate(request.created_at)}</span>
                                    </div>
                                    <p className="mt-3 text-sm font-black text-slate-950">{money(request.old_rent)} → {money(request.new_rent)}</p>
                                    <p className="mt-1 text-sm font-semibold text-slate-600">{request.reason}</p>
                                    {request.admin_comment ? <p className="mt-2 text-xs font-bold text-slate-500">Admin note: {request.admin_comment}</p> : null}
                                </div>
                            ))}
                        </div>
                    </section>
                ) : null}
            </div>
        </main>
    );
}

function FilterButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
    return (
        <button onClick={onClick} className={`rounded-2xl px-4 py-2 text-sm font-black transition ${active ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
            {label}
        </button>
    );
}

function Status({ request }: { request: RoomRentChangeRequestRow }) {
    if (request.status === "approved" || request.status === "direct_admin_change") return <StatusChip label={request.status === "direct_admin_change" ? "admin changed" : "approved"} tone="green" />;
    if (request.status === "rejected") return <StatusChip label="rejected" tone="red" />;
    return <StatusChip label="pending" tone="orange" />;
}
