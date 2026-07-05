import type { PropertyItem, RoomWithOccupancy } from "@/lib/properties/types";
import { EmptyState, StatusChip } from "@/components/office/shared/EnterpriseUI";
import RoomActionPanel from "@/components/office/rooms/RoomActionPanel";

type Props = {
    onSaved: () => void | Promise<void>;
    property: PropertyItem | null;
    selectedRoom: RoomWithOccupancy | null;
    onSelectRoom: (room: RoomWithOccupancy) => void;
};

function money(value: number) {
    return `UGX ${Math.round(value).toLocaleString()}`;
}

export default function PropertyDetails({ onSaved, property, selectedRoom, onSelectRoom }: Props) {
    if (!property) {
        return (
            <EmptyState title="Select a property" description="Choose a property from the portfolio to inspect rooms, occupancy, rent roll, and lease movement." />
        );
    }

    return (
        <div className="space-y-4">
            <div className="enterprise-panel overflow-hidden">
                <div className="bg-slate-950 px-5 py-4 text-white">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <h2 className="text-xl font-black tracking-tight">{property.property_name ?? property.name}</h2>
                            <p className="mt-1 text-xs font-semibold text-blue-100">
                                {property.address ?? property.city ?? "No address"} · {property.property_type ?? "commercial"}
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] font-black uppercase tracking-wide text-blue-100">Status</p>
                            <div className="mt-1"><StatusChip label={property.status ?? "active"} tone="green" /></div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 border-b sm:grid-cols-5">
                    <Metric label="Rooms" value={String(property.totalRoomsComputed)} />
                    <Metric label="Occupied" value={String(property.occupiedRoomsComputed)} tone="text-green-600" />
                    <Metric label="Vacant" value={String(property.vacantRoomsComputed)} tone="text-blue-600" />
                    <Metric label="Rent Roll" value={money(property.rentRollComputed)} />
                    <Metric label="Expiring Soon" value={String(property.expiringSoonCount)} tone="text-orange-600" />
                </div>

                <div className="grid gap-3 px-5 py-3 text-sm md:grid-cols-4">
                    <Detail label="Landlord" value={property.landlord?.full_name ?? "Unassigned"} />
                    <Detail label="Location" value={[property.village, property.city, property.region].filter(Boolean).join(", ") || "Not recorded"} />
                    <Detail label="Property Code" value={property.property_code ?? property.code ?? "Not assigned"} />
                    <Detail label="Expected Collection" value={property.expected_collection ? money(property.expected_collection) : "Not set"} />
                </div>
            </div>

            <div className="enterprise-panel overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                    <div>
                        <h2 className="text-base font-black text-slate-950">Room Inventory</h2>
                        <p className="text-xs font-semibold text-slate-500">{property.rooms.length} live rooms · click a row to manage</p>
                    </div>
                    <span className="rounded-full bg-slate-950 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-white">
                        Book View
                    </span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] border-collapse text-sm">
                        <thead>
                            <tr className="sticky top-0 bg-slate-50 text-[11px] font-black uppercase tracking-wide text-slate-500">
                                <th className="px-3 py-2 text-left">Room</th>
                                <th className="px-3 py-2 text-right">Rent</th>
                                <th className="px-3 py-2 text-left">Status</th>
                                <th className="px-3 py-2 text-left">Tenant</th>
                                <th className="px-3 py-2 text-right">Outstanding</th>
                                <th className="px-3 py-2 text-left">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {property.rooms.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-5 text-slate-500">No rooms created for this property.</td>
                                </tr>
                            ) : property.rooms.map((room) => (
                                <tr
                                    key={room.id}
                                    onClick={() => onSelectRoom(room)}
                                    className={`cursor-pointer border-t border-slate-100 transition hover:bg-blue-50/70 ${selectedRoom?.id === room.id ? "bg-blue-50" : ""}`}
                                >
                                    <td className="px-3 py-2 font-black text-slate-950">{room.room_number ?? "Unnamed"}</td>
                                    <td className="px-3 py-2 text-right font-bold text-slate-700">{money(Number(room.activeLease?.monthly_rent ?? room.monthly_rent ?? 0))}</td>
                                    <td className="px-3 py-2">
                                        <StatusChip
                                            label={room.status ?? (room.activeLease ? "occupied" : "vacant")}
                                            tone={(room.status ?? "").toLowerCase().includes("occupied") || room.activeLease ? "green" : "blue"}
                                        />
                                    </td>
                                    <td className="max-w-[220px] truncate px-3 py-2 font-semibold text-slate-700">{room.tenant?.full_name ?? "Vacant"}</td>
                                    <td className="px-3 py-2 text-right font-bold text-slate-700">{money(Number(room.tenant?.balance ?? room.outstanding_balance ?? 0))}</td>
                                    <td className="px-3 py-2">
                                        <button type="button" className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-black uppercase text-slate-700 hover:border-blue-400 hover:text-blue-700">
                                            Select
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <RoomActionPanel
                room={selectedRoom ? {
                    id: selectedRoom.id,
                    roomNumber: selectedRoom.room_number,
                    status: selectedRoom.status ?? (selectedRoom.activeLease ? "occupied" : "vacant"),
                    monthlyRent: Number(selectedRoom.activeLease?.monthly_rent ?? selectedRoom.monthly_rent ?? 0),
                    outstandingBalance: Number(selectedRoom.tenant?.balance ?? selectedRoom.outstanding_balance ?? 0),
                    landlordName: property.landlord?.full_name ?? null,
                    propertyName: property.property_name ?? property.name ?? property.village ?? null,
                    officeName: null,
                    tenantName: selectedRoom.tenant?.full_name ?? null,
                    tenantPhone: selectedRoom.tenant?.phone ?? null,
                } : null}
                onSaved={onSaved}
            />
        </div>
    );
}

function Metric({ label, value, tone = "text-slate-900" }: { label: string; value: string; tone?: string }) {
    return (
        <div className="border-l px-4 py-3 first:border-l-0">
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p>
            <p className={`text-base font-black ${tone}`}>{value}</p>
        </div>
    );
}

function Detail({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p>
            <p className="truncate font-bold text-slate-800">{value}</p>
        </div>
    );
}
