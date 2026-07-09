"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reviewLandlordBulkRoomRequest } from "@/app/actions/properties";
import type { PropertiesPageData, PropertyItem, RoomWithOccupancy } from "@/lib/properties/types";
import PropertyCommandPanel from "./PropertyCommandPanel";
import PropertyDetails from "./PropertyDetails";
import { PageHero, SearchBox } from "@/components/office/shared/EnterpriseUI";

type Props = {
    data: PropertiesPageData;
    canManage: boolean;
    isAdmin: boolean;
};

function money(value: number) {
    return `UGX ${Math.round(value).toLocaleString()}`;
}

export default function PropertiesConsole({ data, canManage, isAdmin }: Props) {
    const router = useRouter();
    const [selectedProperty, setSelectedProperty] = useState<PropertyItem | null>(data.initialProperty ?? data.properties[0] ?? null);
    const [selectedRoom, setSelectedRoom] = useState<RoomWithOccupancy | null>(null);
    const [search, setSearch] = useState("");
    const [reviewMessage, setReviewMessage] = useState<string | null>(null);
    const [propertyDetailError, setPropertyDetailError] = useState("");
    const [loadingPropertyId, setLoadingPropertyId] = useState<string | null>(null);
    const [isReviewPending, startReviewTransition] = useTransition();
    const propertyRequestSeqRef = useRef(0);
    const visibleProperties = data.properties.filter((property) =>
        `${property.property_name ?? ""} ${property.name ?? ""} ${property.property_code ?? ""}`.toLowerCase().includes(search.toLowerCase()),
    );

    function refresh() {
        setSelectedRoom(null);
        router.refresh();
    }

    const loadPropertyDetails = useCallback(async (property: PropertyItem) => {
        setSelectedRoom(null);
        setPropertyDetailError("");
        setSelectedProperty(property);

        if (property.rooms.length > 0) return;

        const requestSeq = propertyRequestSeqRef.current + 1;
        propertyRequestSeqRef.current = requestSeq;
        setLoadingPropertyId(property.id);

        try {
            const response = await fetch(`/api/properties/${property.id}`, {
                cache: "no-store",
                headers: { "Cache-Control": "no-cache" },
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error ?? "Property details could not load.");
            if (propertyRequestSeqRef.current !== requestSeq) return;
            setSelectedProperty(payload.property as PropertyItem);
        } catch (error) {
            if (propertyRequestSeqRef.current !== requestSeq) return;
            setPropertyDetailError(error instanceof Error ? error.message : "Property details could not load.");
        } finally {
            if (propertyRequestSeqRef.current === requestSeq) setLoadingPropertyId(null);
        }
    }, []);

    useEffect(() => {
        const initial = data.initialProperty ?? data.properties[0] ?? null;
        if (!initial) return;
        if (selectedProperty?.id !== initial.id || selectedProperty.rooms.length > 0 || loadingPropertyId === initial.id) return;
        void loadPropertyDetails(initial);
    }, [data.initialProperty, data.properties, loadPropertyDetails, loadingPropertyId, selectedProperty]);

    function reviewRequest(requestId: string, decision: "approved" | "rejected") {
        startReviewTransition(async () => {
            try {
                setReviewMessage(null);
                const result = await reviewLandlordBulkRoomRequest({ requestId, decision });
                setReviewMessage(result.message);
                refresh();
            } catch (error) {
                setReviewMessage(error instanceof Error ? error.message : "Request could not be reviewed.");
            }
        });
    }

    return (
        <main className="enterprise-page">
            <div className="enterprise-shell">
                <PageHero
                    title="Properties"
                    subtitle={`${data.office?.office_name ?? data.office?.name ?? "No active office selected"}${data.company ? ` · ${data.company.name}` : ""}`}
                    badge="Portfolio Control"
                >
                    <div className="enterprise-card px-6 py-4">
                        <p className="text-sm text-slate-500">Occupancy Rate</p>
                        <p className="text-green-600 font-bold text-3xl">{data.kpis.occupancyRate}%</p>
                    </div>
                </PageHero>

                <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-slate-800 bg-slate-950 p-2 shadow-xl shadow-slate-950/10 md:grid-cols-4 xl:grid-cols-7">
                    <KpiPill label="Properties" value={data.kpis.totalProperties.toLocaleString()} />
                    <KpiPill label="Total Rooms" value={data.kpis.totalRooms.toLocaleString()} tone="blue" />
                    <KpiPill label="Occupied" value={data.kpis.occupiedRooms.toLocaleString()} tone="green" />
                    <KpiPill label="Vacant" value={data.kpis.vacantRooms.toLocaleString()} tone="amber" />
                    <KpiPill label="Occupancy" value={`${data.kpis.occupancyRate}%`} tone="purple" />
                    <KpiPill label="Rent Roll" value={money(data.kpis.rentRoll)} />
                    <KpiPill label="Expiring" value={data.kpis.roomsExpiringSoon.toLocaleString()} tone="red" />
                </div>

                <div className="mb-4">
                    <PropertyCommandPanel
                        canManage={canManage}
                        isAdmin={isAdmin}
                        landlords={data.landlords}
                        offices={data.offices}
                        properties={data.properties}
                        selectedProperty={selectedProperty}
                        selectedRoom={selectedRoom}
                        onSaved={refresh}
                    />
                </div>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
                    <div className="space-y-4 xl:col-span-3">
                        {data.pendingBulkRequests.length > 0 ? (
                            <div className="enterprise-panel p-4">
                                <p className="text-xs font-black uppercase tracking-wide text-amber-600">Pending Admin Approval</p>
                                <h2 className="mb-2 text-base font-black text-slate-950">New Landlord + Rooms</h2>
                                {reviewMessage ? <p className="mb-3 rounded-2xl bg-white px-3 py-2 text-xs font-bold text-slate-700">{reviewMessage}</p> : null}
                                <div className="space-y-2">
                                    {data.pendingBulkRequests.slice(0, 5).map((request) => (
                                        <div key={request.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                                            <div className="flex items-start justify-between gap-2">
                                                <div>
                                                    <p className="text-sm font-black leading-tight text-slate-950">{request.landlordName}</p>
                                                    <p className="text-xs font-bold text-slate-600">{request.officeName} · {request.roomCount} rooms</p>
                                                </div>
                                                <span className="rounded-full bg-amber-200 px-2 py-1 text-[10px] font-black uppercase text-amber-900">{request.status}</span>
                                            </div>
                                            <p className="mt-2 text-xs font-bold text-slate-600">
                                                {request.occupiedRooms} occupied · {request.vacantRooms} vacant · {money(request.rentRoll)}
                                            </p>
                                            {isAdmin && request.status === "pending" ? (
                                                <div className="mt-3 grid grid-cols-2 gap-2">
                                                    <button
                                                        type="button"
                                                        disabled={isReviewPending}
                                                        onClick={() => reviewRequest(request.id, "approved")}
                                                        className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50"
                                                    >
                                                        Approve
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={isReviewPending}
                                                        onClick={() => reviewRequest(request.id, "rejected")}
                                                        className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-black text-white disabled:opacity-50"
                                                    >
                                                        Reject
                                                    </button>
                                                </div>
                                            ) : null}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : null}

                        <div className="enterprise-panel p-4">
                            <h2 className="mb-3 text-base font-black text-slate-950">Property Portfolio</h2>
                            <div className="mb-3">
                                <SearchBox value={search} onChange={setSearch} placeholder="Search properties..." />
                            </div>
                            <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
                                {visibleProperties.length === 0 ? (
                                    <p className="text-slate-500">No active properties in this office.</p>
                                ) : visibleProperties.map((property) => (
                                    <button
                                        key={property.id}
                                        onClick={() => {
                                            void loadPropertyDetails(property);
                                        }}
                                        className={`w-full rounded-xl border p-3 text-left transition hover:border-blue-500 hover:bg-blue-50 ${selectedProperty?.id === property.id ? "border-blue-500 bg-blue-50 shadow-sm" : ""}`}
                                    >
                                        <p className="truncate text-sm font-black">{property.property_name ?? property.name ?? "Unnamed property"}</p>
                                        <p className="text-xs font-semibold text-slate-500">
                                            {property.totalRoomsComputed} rooms · {property.occupiedRoomsComputed} occupied
                                        </p>
                                        <p className="mt-1 text-xs font-black text-slate-700">
                                            {money(property.rentRollComputed)}
                                        </p>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="xl:col-span-9">
                        {propertyDetailError ? (
                            <div className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
                                {propertyDetailError}
                            </div>
                        ) : null}
                        {loadingPropertyId ? (
                            <div className="mb-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-500">
                                Loading property rooms...
                            </div>
                        ) : null}
                        <PropertyDetails
                            isAdmin={isAdmin}
                            onSaved={refresh}
                            property={selectedProperty}
                            selectedRoom={selectedRoom}
                            onSelectRoom={setSelectedRoom}
                        />
                    </div>
                </div>
            </div>
        </main>
    );
}

function KpiPill({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "blue" | "green" | "amber" | "purple" | "red" }) {
    const tones = {
        slate: "text-white",
        blue: "text-sky-200",
        green: "text-emerald-200",
        amber: "text-amber-200",
        purple: "text-violet-200",
        red: "text-rose-200",
    };
    return (
        <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</p>
            <p className={`mt-0.5 truncate text-sm font-black ${tones[tone]}`}>{value}</p>
        </div>
    );
}
