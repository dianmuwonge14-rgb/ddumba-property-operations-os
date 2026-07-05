"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowRightLeft, Bell, Bot, CheckCircle2, Home, Loader2, Search, ShieldAlert, XCircle } from "lucide-react";
import { decideTenantRelocationRequest, submitTenantRelocation } from "@/app/actions/tenant-relocation";
import type {
    TenantRelocationInsight,
    TenantRelocationPageData,
    TenantRelocationRequest,
    TenantRelocationRoom,
    TenantRelocationTenant,
} from "@/lib/tenant-relocation/types";

type Props = {
    data: TenantRelocationPageData;
};

function money(value: number | string | null | undefined) {
    return `UGX ${Math.round(Number(value ?? 0)).toLocaleString()}`;
}

function normalize(value: string | null | undefined) {
    return String(value ?? "").trim().toLowerCase();
}

function today() {
    return new Date().toISOString().slice(0, 10);
}

export default function TenantRelocationCentre({ data }: Props) {
    const [tenantQuery, setTenantQuery] = useState("");
    const [roomQuery, setRoomQuery] = useState("");
    const [selectedTenantId, setSelectedTenantId] = useState(data.tenants[0]?.tenantId ?? "");
    const [selectedRoomId, setSelectedRoomId] = useState(data.vacantRooms[0]?.roomId ?? "");
    const [relocationDate, setRelocationDate] = useState(today());
    const [reason, setReason] = useState("");
    const [message, setMessage] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
    const [adminComments, setAdminComments] = useState<Record<string, string>>({});
    const [isPending, startTransition] = useTransition();

    const tenants = useMemo(() => {
        const term = normalize(tenantQuery);
        return data.tenants.filter((tenant) => {
            if (!term) return true;
            return [tenant.tenantName, tenant.phone, tenant.currentRoomNumber, tenant.currentLandlordName, tenant.currentOfficeName]
                .map(normalize)
                .join(" ")
                .includes(term);
        });
    }, [data.tenants, tenantQuery]);

    const vacantRooms = useMemo(() => {
        const term = normalize(roomQuery);
        return data.vacantRooms.filter((room) => {
            if (!term) return true;
            return [room.roomNumber, room.landlordName, room.officeName, room.propertyName, room.location, String(room.monthlyRent)]
                .map(normalize)
                .join(" ")
                .includes(term);
        });
    }, [data.vacantRooms, roomQuery]);

    const selectedTenant = data.tenants.find((tenant) => tenant.tenantId === selectedTenantId) ?? null;
    const selectedRoom = data.vacantRooms.find((room) => room.roomId === selectedRoomId) ?? null;
    const impact = selectedTenant && selectedRoom ? buildImpact(selectedTenant, selectedRoom) : null;
    const insights = selectedTenant && selectedRoom ? buildInsights(selectedTenant, selectedRoom) : [];

    function submit() {
        setMessage(null);
        startTransition(async () => {
            try {
                const result = await submitTenantRelocation({
                    tenantId: selectedTenantId,
                    newRoomId: selectedRoomId,
                    relocationDate,
                    reason,
                });
                setMessage({
                    tone: "success",
                    text: result.applied
                        ? "Tenant relocated successfully. Room statuses and landlord portfolios are refreshing."
                        : "Relocation request sent to Admin for approval.",
                });
                setReason("");
            } catch (error) {
                setMessage({ tone: "error", text: error instanceof Error ? error.message : "Relocation could not be submitted." });
            }
        });
    }

    function decide(request: TenantRelocationRequest, decision: "approved" | "rejected") {
        setMessage(null);
        startTransition(async () => {
            try {
                await decideTenantRelocationRequest({
                    requestId: request.id,
                    decision,
                    adminComment: adminComments[request.id] ?? "",
                });
                setMessage({ tone: "success", text: decision === "approved" ? "Relocation approved and applied." : "Relocation rejected." });
            } catch (error) {
                setMessage({ tone: "error", text: error instanceof Error ? error.message : "Request could not be updated." });
            }
        });
    }

    return (
        <main className="enterprise-page">
            <div className="enterprise-shell">
                <section className="mx-auto max-w-7xl overflow-hidden rounded-[30px] border border-white/10 bg-slate-950 p-5 text-white shadow-2xl shadow-black/30">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black uppercase text-cyan-100">
                                <ArrowRightLeft size={14} />
                                {data.isAdmin ? "Admin relocation control" : "Office relocation requests"}
                            </div>
                            <h1 className="mt-3 text-3xl font-black sm:text-4xl">Tenant Relocation</h1>
                            <p className="mt-1 text-sm font-semibold text-slate-300">
                                Move tenants between rooms while preserving balances, statements, promises, and audit history.
                            </p>
                        </div>
                        <div className="grid gap-2 text-sm font-bold text-slate-300 sm:grid-cols-3">
                            <MiniStat label="Active tenants" value={data.tenants.length.toLocaleString()} />
                            <MiniStat label="Vacant rooms" value={data.vacantRooms.length.toLocaleString()} />
                            <MiniStat label="Pending requests" value={data.requests.filter((request) => request.status === "pending").length.toLocaleString()} />
                        </div>
                    </div>
                </section>

                <section className="mx-auto mt-5 grid max-w-7xl gap-4 xl:grid-cols-[1.15fr_1fr]">
                    <div className="rounded-[28px] border border-white/10 bg-slate-950 p-4 text-white shadow-xl shadow-black/20">
                        <div className="grid gap-4 lg:grid-cols-2">
                            <SelectorPanel
                                label="1. Select tenant"
                                placeholder="Search tenant, room, phone..."
                                query={tenantQuery}
                                setQuery={setTenantQuery}
                            >
                                <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                                    {tenants.map((tenant) => (
                                        <button
                                            key={tenant.tenantId}
                                            onClick={() => setSelectedTenantId(tenant.tenantId)}
                                            className={`w-full rounded-2xl border p-3 text-left transition ${selectedTenantId === tenant.tenantId ? "border-cyan-300/60 bg-cyan-300/12" : "border-white/10 bg-white/6 hover:bg-white/10"}`}
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <p className="text-sm font-black text-white">{tenant.tenantName}</p>
                                                <span className="rounded-full bg-slate-950 px-2 py-1 text-[11px] font-black text-cyan-100">{tenant.currentRoomNumber}</span>
                                            </div>
                                            <p className="mt-1 text-xs font-bold text-slate-400">{tenant.currentOfficeName} · {tenant.currentLandlordName}</p>
                                            <p className="mt-1 text-xs font-black text-amber-100">Balance {money(tenant.balance)}</p>
                                        </button>
                                    ))}
                                    {!tenants.length ? <EmptyLine text="No occupied tenants match this search." /> : null}
                                </div>
                            </SelectorPanel>

                            <SelectorPanel
                                label="2. Select new vacant room"
                                placeholder="Search vacant room, rent, place..."
                                query={roomQuery}
                                setQuery={setRoomQuery}
                            >
                                <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                                    {vacantRooms.map((room) => (
                                        <button
                                            key={room.roomId}
                                            onClick={() => setSelectedRoomId(room.roomId)}
                                            className={`w-full rounded-2xl border p-3 text-left transition ${selectedRoomId === room.roomId ? "border-emerald-300/60 bg-emerald-300/12" : "border-white/10 bg-white/6 hover:bg-white/10"}`}
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <p className="text-sm font-black text-white">{room.roomNumber}</p>
                                                <span className="rounded-full bg-slate-950 px-2 py-1 text-[11px] font-black text-emerald-100">{money(room.monthlyRent)}</span>
                                            </div>
                                            <p className="mt-1 text-xs font-bold text-slate-400">{room.officeName} · {room.landlordName}</p>
                                            <p className="mt-1 text-xs font-bold text-slate-500">{room.location}</p>
                                        </button>
                                    ))}
                                    {!vacantRooms.length ? <EmptyLine text="No vacant rooms match this search." /> : null}
                                </div>
                            </SelectorPanel>
                        </div>

                        <div className="mt-4 grid gap-3 lg:grid-cols-3">
                            <label className="block">
                                <span className="text-xs font-black uppercase text-slate-400">Relocation date</span>
                                <input type="date" value={relocationDate} onChange={(event) => setRelocationDate(event.target.value)} className="mt-1 h-11 w-full rounded-2xl border border-white/10 bg-slate-900 px-3 text-sm font-black text-white outline-none" />
                            </label>
                            <label className="block lg:col-span-2">
                                <span className="text-xs font-black uppercase text-slate-400">Reason / note</span>
                                <input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is the tenant moving?" className="mt-1 h-11 w-full rounded-2xl border border-white/10 bg-slate-900 px-3 text-sm font-bold text-white outline-none placeholder:text-slate-500" />
                            </label>
                        </div>

                        {message ? (
                            <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-bold ${message.tone === "error" ? "border-red-400/30 bg-red-400/10 text-red-100" : "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"}`}>
                                {message.text}
                            </div>
                        ) : null}

                        <button
                            disabled={!selectedTenant || !selectedRoom || isPending || !data.canSubmit}
                            onClick={submit}
                            className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 text-sm font-black text-slate-950 shadow-lg shadow-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isPending ? <Loader2 className="animate-spin" size={17} /> : <ArrowRightLeft size={17} />}
                            {data.isAdmin ? "Relocate Tenant Now" : "Submit Relocation Request"}
                        </button>
                    </div>

                    <div className="space-y-4">
                        <ImpactPreview tenant={selectedTenant} room={selectedRoom} impact={impact} />
                        <AiAssistant insights={insights} />
                    </div>
                </section>

                <section className="mx-auto mt-5 max-w-7xl rounded-[28px] border border-white/10 bg-slate-950 p-4 text-white shadow-xl shadow-black/20">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <h2 className="text-xl font-black">Relocation Requests</h2>
                            <p className="text-sm font-semibold text-slate-400">Pending requests wait for Admin approval. Approved requests preserve tenant history and update room status live.</p>
                        </div>
                        <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-xs font-black uppercase text-slate-300">Live Supabase</span>
                    </div>
                    <div className="overflow-x-auto rounded-2xl border border-white/10">
                        <table className="w-full min-w-[980px] text-left text-sm">
                            <thead className="bg-white/8 text-xs uppercase text-slate-400">
                                <tr>
                                    <th className="px-3 py-3">Tenant</th>
                                    <th className="px-3 py-3">Move</th>
                                    <th className="px-3 py-3">Rent impact</th>
                                    <th className="px-3 py-3">Office</th>
                                    <th className="px-3 py-3">Date</th>
                                    <th className="px-3 py-3">Status</th>
                                    {data.canApprove ? <th className="px-3 py-3">Admin action</th> : null}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/10">
                                {data.requests.map((request) => (
                                    <tr key={request.id} className="align-top">
                                        <td className="px-3 py-3">
                                            <p className="font-black text-white">{request.tenantName}</p>
                                            <p className="text-xs font-bold text-slate-500">{request.requestedByName ? `By ${request.requestedByName}` : "Requester not shown"}</p>
                                        </td>
                                        <td className="px-3 py-3">
                                            <p className="font-bold text-slate-200">{request.oldRoomNumber} → {request.newRoomNumber}</p>
                                            <p className="text-xs text-slate-500">{request.oldLandlordName} → {request.newLandlordName}</p>
                                        </td>
                                        <td className="px-3 py-3">
                                            <p className="font-black text-white">{money(request.oldRent)} → {money(request.newRent)}</p>
                                            <p className={request.rentDifference >= 0 ? "text-xs font-black text-emerald-300" : "text-xs font-black text-red-300"}>{request.rentDifference >= 0 ? "+" : ""}{money(request.rentDifference)}</p>
                                        </td>
                                        <td className="px-3 py-3 font-bold text-slate-300">{request.officeName}</td>
                                        <td className="px-3 py-3 font-bold text-slate-300">{request.relocationDate}</td>
                                        <td className="px-3 py-3"><StatusBadge status={request.status} /></td>
                                        {data.canApprove ? (
                                            <td className="px-3 py-3">
                                                {request.status === "pending" ? (
                                                    <div className="flex min-w-[270px] flex-col gap-2">
                                                        <input value={adminComments[request.id] ?? ""} onChange={(event) => setAdminComments((current) => ({ ...current, [request.id]: event.target.value }))} placeholder="Admin comment..." className="h-9 rounded-xl border border-white/10 bg-slate-900 px-3 text-xs font-bold text-white outline-none placeholder:text-slate-500" />
                                                        <div className="flex gap-2">
                                                            <button disabled={isPending} onClick={() => decide(request, "approved")} className="inline-flex h-9 items-center gap-1 rounded-xl bg-emerald-400 px-3 text-xs font-black text-slate-950 disabled:opacity-50">
                                                                <CheckCircle2 size={14} />
                                                                Approve
                                                            </button>
                                                            <button disabled={isPending} onClick={() => decide(request, "rejected")} className="inline-flex h-9 items-center gap-1 rounded-xl bg-red-400 px-3 text-xs font-black text-white disabled:opacity-50">
                                                                <XCircle size={14} />
                                                                Reject
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <p className="max-w-xs text-xs font-bold text-slate-400">{request.adminComment ?? "No admin comment"}</p>
                                                )}
                                            </td>
                                        ) : null}
                                    </tr>
                                ))}
                                {!data.requests.length ? (
                                    <tr>
                                        <td colSpan={data.canApprove ? 7 : 6} className="px-3 py-8 text-center font-bold text-slate-400">No relocation requests yet.</td>
                                    </tr>
                                ) : null}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>
        </main>
    );
}

function SelectorPanel({
    children,
    label,
    placeholder,
    query,
    setQuery,
}: {
    children: React.ReactNode;
    label: string;
    placeholder: string;
    query: string;
    setQuery: (value: string) => void;
}) {
    return (
        <div>
            <label className="block">
                <span className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</span>
                <div className="mt-1 flex h-11 items-center rounded-2xl border border-white/10 bg-slate-900 px-3">
                    <Search size={15} className="mr-2 text-slate-500" />
                    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} className="w-full bg-transparent text-sm font-bold text-white outline-none placeholder:text-slate-500" />
                </div>
            </label>
            <div className="mt-3">{children}</div>
        </div>
    );
}

function ImpactPreview({ impact, room, tenant }: { impact: ReturnType<typeof buildImpact> | null; room: TenantRelocationRoom | null; tenant: TenantRelocationTenant | null }) {
    if (!tenant || !room || !impact) {
        return (
            <div className="rounded-[28px] border border-white/10 bg-slate-950 p-5 text-white">
                <h2 className="text-xl font-black">Financial Impact Preview</h2>
                <p className="mt-2 text-sm font-semibold text-slate-400">Select a tenant and vacant room to see landlord and company impact.</p>
            </div>
        );
    }
    return (
        <div className="rounded-[28px] border border-white/10 bg-slate-950 p-5 text-white shadow-xl shadow-black/20">
            <h2 className="text-xl font-black">Financial Impact Preview</h2>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <PreviewCard label="Old room rent" value={money(tenant.currentRent)} hint={`${tenant.currentRoomNumber} · ${tenant.currentLandlordName}`} />
                <PreviewCard label="New room rent" value={money(room.monthlyRent)} hint={`${room.roomNumber} · ${room.landlordName}`} />
                <PreviewCard label="Tenant rent change" value={`${impact.rentDifference >= 0 ? "+" : ""}${money(impact.rentDifference)}`} hint={impact.rentDifference > 0 ? "Tenant pays more" : impact.rentDifference < 0 ? "Tenant pays less" : "No rent change"} />
                <PreviewCard label="Balance preserved" value={money(tenant.balance)} hint="Tenant statement and history stay linked" />
                <PreviewCard label="Old landlord impact" value={`-${money(tenant.currentRent)}`} hint="Old room becomes vacant" />
                <PreviewCard label="New landlord impact" value={`+${money(room.monthlyRent)}`} hint="Vacant room becomes occupied" />
            </div>
        </div>
    );
}

function AiAssistant({ insights }: { insights: TenantRelocationInsight[] }) {
    return (
        <div className="rounded-[28px] border border-cyan-300/15 bg-slate-950 p-5 text-white shadow-xl shadow-cyan-950/20">
            <div className="flex items-center gap-2">
                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-cyan-400 text-slate-950"><Bot size={20} /></div>
                <div>
                    <h2 className="text-xl font-black">AI Relocation Assistant</h2>
                    <p className="text-xs font-bold text-slate-400">Live risk, landlord, vacancy, and profit signals.</p>
                </div>
            </div>
            <div className="mt-4 space-y-2">
                {insights.map((insight) => (
                    <div key={insight.id} className={`rounded-2xl border p-3 ${insight.severity === "critical" ? "border-red-400/25 bg-red-400/10" : insight.severity === "warning" ? "border-amber-400/25 bg-amber-400/10" : "border-white/10 bg-white/6"}`}>
                        <p className="text-sm font-black">{insight.title}</p>
                        <p className="mt-1 text-xs font-bold text-slate-300">{insight.message}</p>
                    </div>
                ))}
                {!insights.length ? <EmptyLine text="Select tenant and room to generate relocation insights." /> : null}
            </div>
        </div>
    );
}

function buildImpact(tenant: TenantRelocationTenant, room: TenantRelocationRoom) {
    return {
        rentDifference: room.monthlyRent - tenant.currentRent,
    };
}

function buildInsights(tenant: TenantRelocationTenant, room: TenantRelocationRoom): TenantRelocationInsight[] {
    const rentDifference = room.monthlyRent - tenant.currentRent;
    const sameLandlord = tenant.currentLandlordId && room.landlordId && tenant.currentLandlordId === room.landlordId;
    const insights: TenantRelocationInsight[] = [
        {
            id: `${tenant.tenantId}:${room.roomId}:vacancy-impact`,
            title: "Vacancy impact",
            message: `Room ${tenant.currentRoomNumber} will become vacant and room ${room.roomNumber} will leave the vacant list.`,
            severity: "info",
        },
        {
            id: `${tenant.tenantId}:${room.roomId}:landlord-impact`,
            title: sameLandlord ? "Same landlord move" : "Landlord income changes",
            message: sameLandlord
                ? `${tenant.currentLandlordName} keeps the tenant, with rent changing by ${money(rentDifference)}.`
                : `${tenant.currentLandlordName} loses ${money(tenant.currentRent)} while ${room.landlordName} gains ${money(room.monthlyRent)}.`,
            severity: sameLandlord ? "info" : "warning",
        },
        {
            id: `${tenant.tenantId}:${room.roomId}:tenant-rent`,
            title: rentDifference > 0 ? "Tenant rent increases" : rentDifference < 0 ? "Tenant rent decreases" : "Tenant rent unchanged",
            message: rentDifference === 0 ? "The tenant monthly expected amount remains unchanged." : `New expected monthly rent changes by ${money(rentDifference)}.`,
            severity: rentDifference > 0 ? "warning" : "info",
        },
    ];
    if (tenant.balance > 0) {
        insights.push({
            id: `${tenant.tenantId}:${room.roomId}:outstanding-balance`,
            title: "Tenant has outstanding balance",
            message: `${tenant.tenantName} will move with ${money(tenant.balance)} still on their statement.`,
            severity: tenant.balance >= tenant.currentRent ? "critical" : "warning",
        });
    }
    return insights;
}

function MiniStat({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-white/8 px-4 py-3">
            <p className="text-xs font-black uppercase text-slate-400">{label}</p>
            <p className="mt-1 text-xl font-black text-white">{value}</p>
        </div>
    );
}

function PreviewCard({ hint, label, value }: { hint: string; label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-white/7 p-3">
            <p className="text-xs font-black uppercase text-slate-500">{label}</p>
            <p className="mt-1 text-lg font-black text-white">{value}</p>
            <p className="mt-1 text-xs font-bold text-slate-400">{hint}</p>
        </div>
    );
}

function StatusBadge({ status }: { status: TenantRelocationRequest["status"] }) {
    const classes = status === "approved"
        ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
        : status === "rejected"
            ? "border-red-400/30 bg-red-400/10 text-red-100"
            : "border-amber-400/30 bg-amber-400/10 text-amber-100";
    const Icon = status === "approved" ? CheckCircle2 : status === "rejected" ? XCircle : ShieldAlert;
    return (
        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-black uppercase ${classes}`}>
            <Icon size={13} />
            {status}
        </span>
    );
}

function EmptyLine({ text }: { text: string }) {
    return (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-6 text-center text-sm font-bold text-slate-400">
            {text}
        </div>
    );
}
