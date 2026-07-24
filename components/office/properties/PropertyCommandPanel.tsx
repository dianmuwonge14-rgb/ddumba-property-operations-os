"use client";

import { useState, useTransition } from "react";
import {
    archiveProperty,
    createLandlordWithRoomsBulk,
    createProperty,
    createRoom,
    editProperty,
    editRoom,
    updateRoomStatus,
} from "@/app/actions/properties";
import type { LandlordRow, PropertyItem, RoomWithOccupancy } from "@/lib/properties/types";
import NewLandlordBulkRoomsWizard from "./NewLandlordBulkRoomsWizard";

type Props = {
    canManage: boolean;
    isAdmin: boolean;
    landlords: LandlordRow[];
    offices: Array<{ id: string; name: string }>;
    properties: PropertyItem[];
    selectedProperty: PropertyItem | null;
    selectedRoom: RoomWithOccupancy | null;
    onSaved: () => void;
};

export default function PropertyCommandPanel({ canManage, isAdmin, landlords, offices, properties, selectedProperty, selectedRoom, onSaved }: Props) {
    const [propertyName, setPropertyName] = useState("");
    const [propertyType, setPropertyType] = useState("commercial");
    const [landlordId, setLandlordId] = useState("");
    const [address, setAddress] = useState("");
    const [city, setCity] = useState("");
    const [region, setRegion] = useState("");
    const [totalUnits, setTotalUnits] = useState("");
    const [expectedCollection, setExpectedCollection] = useState("");
    const [roomNumber, setRoomNumber] = useState("");
    const [monthlyRent, setMonthlyRent] = useState("");
    const [roomStatus, setRoomStatus] = useState("vacant");
    const [floor, setFloor] = useState("");
    const [statusReason, setStatusReason] = useState("");
    const [message, setMessage] = useState<string | null>(null);
    const [landlordSearch, setLandlordSearch] = useState("");
    const [showNewLandlordWizard, setShowNewLandlordWizard] = useState(false);
    const [isPending, startTransition] = useTransition();
    const filteredLandlords = landlordSearch.trim()
        ? landlords.filter((landlord) => `${landlord.full_name ?? ""} ${landlord.phone ?? ""}`.toLowerCase().includes(landlordSearch.toLowerCase()))
        : landlords;
    const selectedOccupancyRate = selectedProperty?.totalRoomsComputed
        ? Math.round((selectedProperty.occupiedRoomsComputed / selectedProperty.totalRoomsComputed) * 100)
        : 0;

    function run(action: () => Promise<unknown>, success: string) {
        startTransition(async () => {
            try {
                setMessage(null);
                await action();
                setMessage(success);
                onSaved();
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Action failed.");
            }
        });
    }

    function propertyPayload() {
        return {
            propertyName: propertyName || selectedProperty?.property_name || selectedProperty?.name || "",
            propertyType,
            landlordId: landlordId || selectedProperty?.landlord_id || undefined,
            address: address || selectedProperty?.address || undefined,
            city: city || selectedProperty?.city || undefined,
            region: region || selectedProperty?.region || undefined,
            totalUnits: totalUnits ? Number(totalUnits) : selectedProperty?.total_units ?? undefined,
            expectedCollection: expectedCollection ? Number(expectedCollection) : selectedProperty?.expected_collection ?? undefined,
        };
    }

    function saveNewProperty() {
        run(() => createProperty(propertyPayload()), "Property created.");
    }

    function savePropertyEdit() {
        if (!selectedProperty) {
            setMessage("Select a property first.");
            return;
        }
        run(
            () => editProperty({
                ...propertyPayload(),
                propertyId: selectedProperty.id,
            }),
            "Property updated.",
        );
    }

    function saveArchiveProperty() {
        if (!selectedProperty) {
            setMessage("Select a property first.");
            return;
        }
        run(() => archiveProperty({ propertyId: selectedProperty.id, reason: statusReason || undefined }), "Property archived.");
    }

    function roomPayload() {
        if (!selectedProperty) throw new Error("Select a property first.");
        return {
            propertyId: selectedProperty.id,
            roomNumber: roomNumber || selectedRoom?.room_number || "",
            monthlyRent: Number(monthlyRent || selectedRoom?.monthly_rent || 0),
            status: roomStatus || selectedRoom?.status || "vacant",
            floor: floor || selectedRoom?.floor || undefined,
        };
    }

    function saveNewRoom() {
        run(() => createRoom(roomPayload()), "Room created.");
    }

    function saveRoomEdit() {
        if (!selectedRoom) {
            setMessage("Select a room first.");
            return;
        }
        run(
            () => editRoom({
                ...roomPayload(),
                roomId: selectedRoom.id,
                outstandingBalance: selectedRoom.outstanding_balance ?? undefined,
            }),
            "Room updated.",
        );
    }

    function saveRoomStatus() {
        if (!selectedRoom) {
            setMessage("Select a room first.");
            return;
        }
        run(
            () => updateRoomStatus({
                roomId: selectedRoom.id,
                status: roomStatus,
                reason: statusReason || undefined,
            }),
            "Room status updated.",
        );
    }

    return (
        <div className="overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-950 text-white shadow-xl shadow-slate-950/20">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                <div>
                    <h2 className="text-base font-black tracking-tight">Property Command</h2>
                    <p className="text-xs font-semibold text-slate-400">
                        {selectedProperty ? selectedProperty.property_name ?? selectedProperty.name : "Create and manage portfolio"}
                    </p>
                </div>
                <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-cyan-100">
                    {isPending ? "Saving" : "Ready"}
                </span>
            </div>

            <div className="grid gap-3 px-4 py-4">
                <div className="grid gap-3 lg:grid-cols-[1.15fr_0.75fr_1.35fr]">
                    <input value={propertyName} onChange={(e) => setPropertyName(e.target.value)} placeholder={selectedProperty?.property_name ?? "Property name"} className="field-dark h-10" />
                    <select value={propertyType} onChange={(e) => setPropertyType(e.target.value)} className="field-dark h-10">
                        <option value="commercial">Commercial</option>
                        <option value="mixed_use">Mixed Use</option>
                        <option value="residential">Residential</option>
                    </select>
                    <div className="grid gap-2 sm:grid-cols-[0.9fr_1.1fr]">
                        <input value={landlordSearch} onChange={(e) => setLandlordSearch(e.target.value)} placeholder="Search landlord..." className="field-dark h-10" />
                        <select
                            value={landlordId}
                            onChange={(e) => {
                                if (e.target.value === "__new_landlord__") {
                                    setLandlordId("");
                                    setShowNewLandlordWizard(true);
                                    return;
                                }
                                setLandlordId(e.target.value);
                            }}
                            className="field-dark h-10"
                        >
                            <option value="">No landlord selected</option>
                            <option value="__new_landlord__">+ New Landlord</option>
                            {filteredLandlords.map((landlord) => (
                                <option key={landlord.id} value={landlord.id}>{landlord.full_name}</option>
                            ))}
                        </select>
                    </div>
                </div>
                <div className="grid gap-3 lg:grid-cols-3">
                    <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder={selectedProperty?.address ?? "Address"} className="field-dark h-10" />
                    <input value={city} onChange={(e) => setCity(e.target.value)} placeholder={selectedProperty?.city ?? "City"} className="field-dark h-10" />
                    <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder={selectedProperty?.region ?? "Region"} className="field-dark h-10" />
                </div>
                <div className="grid gap-3 lg:grid-cols-[0.8fr_0.8fr_0.8fr_0.8fr_1.2fr]">
                    <input value={totalUnits} onChange={(e) => setTotalUnits(e.target.value)} type="number" placeholder={selectedProperty?.total_units?.toString() ?? "Total rooms"} className="field-dark h-10" />
                    <Readout label="Occupied" value={selectedProperty?.occupiedRoomsComputed ?? 0} />
                    <Readout label="Vacant" value={selectedProperty?.vacantRoomsComputed ?? 0} />
                    <Readout label="Occupancy" value={`${selectedOccupancyRate}%`} />
                    <input value={expectedCollection} onChange={(e) => setExpectedCollection(e.target.value)} type="number" placeholder={selectedProperty?.expected_collection?.toString() ?? "Expected collection"} className="field-dark h-10" />
                </div>
            </div>

            <div className="grid grid-cols-3 gap-2 border-t border-white/10 px-4 py-3">
                <Button disabled={!canManage || isPending} onClick={saveNewProperty}>Create</Button>
                <Button disabled={!canManage || isPending || !selectedProperty} onClick={savePropertyEdit}>Edit</Button>
                <Button disabled={!canManage || isPending || !selectedProperty} onClick={saveArchiveProperty} tone="red">Archive</Button>
            </div>

            <div className="border-t border-white/10 px-4 py-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h3 className="text-sm font-black">Room Management</h3>
                        <p className="text-[11px] font-semibold text-slate-400">
                            {selectedRoom ? `Selected room ${selectedRoom.room_number}` : "Select a room to edit, or add a new room to the selected property."}
                        </p>
                    </div>
                    <input value={statusReason} onChange={(e) => setStatusReason(e.target.value)} placeholder="Reason / note" className="field-dark h-9 min-w-[220px] flex-1 md:max-w-sm" />
                </div>
                <div className="grid gap-2 lg:grid-cols-[1fr_1fr_0.8fr_0.9fr_0.85fr_0.85fr_0.85fr]">
                    <input value={roomNumber} onChange={(e) => setRoomNumber(e.target.value)} placeholder={selectedRoom?.room_number ?? "Room number"} className="field-dark h-10" />
                    <input value={monthlyRent} onChange={(e) => setMonthlyRent(e.target.value)} type="number" placeholder={selectedRoom?.monthly_rent?.toString() ?? "Monthly rent"} className="field-dark h-10" />
                    <input value={floor} onChange={(e) => setFloor(e.target.value)} placeholder={selectedRoom?.floor ?? "Floor"} className="field-dark h-10" />
                    <select value={roomStatus} onChange={(e) => setRoomStatus(e.target.value)} className="field-dark h-10">
                        <option value="vacant">Vacant</option>
                        <option value="occupied">Occupied</option>
                        <option value="maintenance">Maintenance</option>
                        <option value="reserved">Reserved</option>
                    </select>
                    <Button disabled={!canManage || isPending || !selectedProperty} onClick={saveNewRoom}>Add Room</Button>
                    <Button disabled={!canManage || isPending || !selectedRoom} onClick={saveRoomEdit}>Edit Room</Button>
                    <Button disabled={!canManage || isPending || !selectedRoom} onClick={saveRoomStatus}>Change Status</Button>
                </div>
            </div>

            {message && <p className="border-t border-white/10 px-4 py-3 text-sm font-semibold text-cyan-100">{message}</p>}
            {showNewLandlordWizard ? (
                <NewLandlordBulkRoomsWizard
                    canManage={canManage}
                    createAction={createLandlordWithRoomsBulk}
                    isAdmin={isAdmin}
                    offices={offices}
                    onClose={() => setShowNewLandlordWizard(false)}
                    onSaved={() => {
                        setShowNewLandlordWizard(false);
                        onSaved();
                    }}
                    properties={properties}
                    selectedProperty={selectedProperty}
                />
            ) : null}
        </div>
    );
}

function Readout({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex h-10 items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3">
            <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</span>
            <span className="text-sm font-black text-white">{value}</span>
        </div>
    );
}

function Button({
    disabled,
    onClick,
    children,
    tone = "dark",
}: {
    disabled: boolean;
    onClick: () => void;
    children: React.ReactNode;
    tone?: "dark" | "red";
}) {
    const toneClass = tone === "red" ? "bg-red-500/90 text-white hover:bg-red-500" : "bg-cyan-300 text-slate-950 hover:bg-cyan-200";
    return (
        <button disabled={disabled} onClick={onClick} className={`${toneClass} h-10 rounded-xl px-3 text-xs font-black uppercase tracking-wide disabled:cursor-not-allowed disabled:opacity-40`}>
            {children}
        </button>
    );
}
