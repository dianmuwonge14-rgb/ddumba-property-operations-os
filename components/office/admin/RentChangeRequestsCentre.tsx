"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
    const router = useRouter();
    const [filter, setFilter] = useState<Filter>("pending");
    const [historyRoomId, setHistoryRoomId] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [bulkModal, setBulkModal] = useState<null | { decision: "approved" | "rejected"; ids: string[] }>(null);
    const [bulkComment, setBulkComment] = useState("");
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
                router.refresh();
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Unable to decide rent request.");
            }
        });
    }

    function openBulk(decision: "approved" | "rejected", ids: string[]) {
        const uniqueIds = Array.from(new Set(ids)).filter(Boolean);
        if (!uniqueIds.length) {
            setMessage("Select at least one pending rent request first.");
            return;
        }
        setBulkComment("");
        setBulkModal({ decision, ids: uniqueIds });
    }

    function runBulk() {
        if (!bulkModal) return;
        if (bulkModal.decision === "rejected" && !bulkComment.trim()) {
            setMessage("Rejection reason is required.");
            return;
        }
        startTransition(async () => {
            try {
                setMessage(null);
                for (const id of bulkModal.ids) {
                    await decideRoomRentChange({ requestId: id, decision: bulkModal.decision, comment: bulkComment.trim() });
                }
                setMessage(`${bulkModal.ids.length} rent change request(s) ${bulkModal.decision === "approved" ? "approved" : "rejected"}.`);
                setSelectedIds([]);
                setBulkModal(null);
                setBulkComment("");
                router.refresh();
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Unable to complete bulk rent decision.");
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

                    <BulkRentControls
                        disabled={isPending}
                        pendingIds={allRequests.filter((request) => request.status === "pending").map((request) => request.id)}
                        selectedIds={selectedIds}
                        onBulk={openBulk}
                        onChangeSelected={setSelectedIds}
                    />
                    <div className="overflow-x-auto">
                        <table className="enterprise-table">
                            <thead>
                                <tr>
                                    <th className="text-left">Select</th>
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
                                        <td colSpan={12} className="p-6 text-sm font-bold text-slate-500">No {filter} rent change requests.</td>
                                    </tr>
                                ) : visibleRequests.map((request) => {
                                    const room = lookups.rooms.get(request.room_id);
                                    const tenant = request.tenant_id ? lookups.tenants.get(request.tenant_id) : null;
                                    const landlord = request.landlord_id ? lookups.landlords.get(request.landlord_id) : null;
                                    const office = request.office_id ? lookups.offices.get(request.office_id) : null;
                                    const requester = request.requested_by ? lookups.users.get(request.requested_by) : null;
                                    return (
                                        <tr key={request.id}>
                                            <td>
                                                {request.status === "pending" ? (
                                                    <input checked={selectedIds.includes(request.id)} type="checkbox" onChange={() => setSelectedIds((current) => current.includes(request.id) ? current.filter((id) => id !== request.id) : [...current, request.id])} className="h-4 w-4 rounded border-slate-300 text-blue-700" />
                                                ) : null}
                                            </td>
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
                {bulkModal ? (
                    <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/60 p-4">
                        <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
                            <h2 className="text-xl font-black text-slate-950">Confirm Bulk {bulkModal.decision === "approved" ? "Approval" : "Rejection"}</h2>
                            <p className="mt-2 text-sm font-semibold text-slate-600">You are about to {bulkModal.decision === "approved" ? "approve" : "reject"} {bulkModal.ids.length} pending requests. Continue?</p>
                            <label className="mt-4 block text-sm font-bold text-slate-700">
                                {bulkModal.decision === "rejected" ? "Rejection reason" : "Admin note optional"}
                                <textarea value={bulkComment} onChange={(event) => setBulkComment(event.target.value)} className="mt-2 min-h-28 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold" />
                            </label>
                            <div className="mt-5 flex flex-wrap justify-end gap-2">
                                <button disabled={isPending} onClick={() => setBulkModal(null)} className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-700 disabled:opacity-40">Cancel</button>
                                <button disabled={isPending} onClick={runBulk} className={`rounded-xl px-4 py-2 text-sm font-black text-white disabled:opacity-40 ${bulkModal.decision === "approved" ? "bg-emerald-700" : "bg-red-700"}`}>
                                    {isPending ? "Processing..." : bulkModal.decision === "approved" ? "Approve Requests" : "Reject Requests"}
                                </button>
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>
        </main>
    );
}

function BulkRentControls({
    disabled,
    pendingIds,
    selectedIds,
    onBulk,
    onChangeSelected,
}: {
    disabled: boolean;
    pendingIds: string[];
    selectedIds: string[];
    onBulk: (decision: "approved" | "rejected", ids: string[]) => void;
    onChangeSelected: (ids: string[]) => void;
}) {
    const selectedPendingIds = selectedIds.filter((id) => pendingIds.includes(id));
    const allSelected = pendingIds.length > 0 && pendingIds.every((id) => selectedIds.includes(id));
    return (
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
            <label className="inline-flex items-center gap-3 text-sm font-black text-slate-700">
                <input checked={allSelected} disabled={disabled || pendingIds.length === 0} type="checkbox" onChange={(event) => onChangeSelected(event.target.checked ? pendingIds : [])} className="h-4 w-4 rounded border-slate-300 text-blue-700" />
                Select All Pending <span className="text-slate-400">({pendingIds.length})</span>
            </label>
            <div className="flex flex-wrap gap-2">
                <button disabled={disabled || selectedPendingIds.length === 0} onClick={() => onBulk("approved", selectedPendingIds)} className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-black text-white disabled:opacity-40">Approve Selected</button>
                <button disabled={disabled || selectedPendingIds.length === 0} onClick={() => onBulk("rejected", selectedPendingIds)} className="rounded-xl bg-red-700 px-3 py-2 text-xs font-black text-white disabled:opacity-40">Reject Selected</button>
                <button disabled={disabled || pendingIds.length === 0} onClick={() => onBulk("approved", pendingIds)} className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-black text-emerald-800 disabled:opacity-40">Approve All Pending</button>
                <button disabled={disabled || pendingIds.length === 0} onClick={() => onBulk("rejected", pendingIds)} className="rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-black text-red-800 disabled:opacity-40">Reject All Pending</button>
            </div>
        </div>
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
