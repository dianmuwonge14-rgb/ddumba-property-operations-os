"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, Building2, CheckCircle2, Plus, Trash2, UserRound, X } from "lucide-react";
import type { CreateLandlordWithRoomsBulkInput, PropertyItem } from "@/lib/properties/types";

type RoomDraft = {
    id: string;
    roomNumber: string;
    monthlyRent: string;
    propertyId: string;
    propertyName: string;
    status: "occupied" | "vacant";
    startDate: string;
    notes: string;
    tenantName: string;
    tenantPhone: string;
    tenantNationalId: string;
    moveInDate: string;
    outstandingMode: "none" | "has_outstanding";
    outstandingBalance: string;
    outstandingDate: string;
    outstandingNotes: string;
};

type Props = {
    canManage: boolean;
    createAction: (input: CreateLandlordWithRoomsBulkInput) => Promise<{ status: string; message: string }>;
    isAdmin: boolean;
    offices: Array<{ id: string; name: string }>;
    onClose: () => void;
    onSaved: () => void;
    properties: PropertyItem[];
    selectedProperty: PropertyItem | null;
};

function today() {
    return new Date().toISOString().slice(0, 10);
}

function money(value: number) {
    return `UGX ${Math.round(value || 0).toLocaleString()}`;
}

function newRoom(selectedProperty: PropertyItem | null): RoomDraft {
    const date = today();
    return {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        roomNumber: "",
        monthlyRent: "",
        propertyId: selectedProperty?.id ?? "",
        propertyName: selectedProperty?.property_name ?? selectedProperty?.name ?? "",
        status: "vacant",
        startDate: date,
        notes: "",
        tenantName: "",
        tenantPhone: "",
        tenantNationalId: "",
        moveInDate: date,
        outstandingMode: "none",
        outstandingBalance: "",
        outstandingDate: date,
        outstandingNotes: "",
    };
}

export default function NewLandlordBulkRoomsWizard({ canManage, createAction, isAdmin, offices, onClose, onSaved, properties, selectedProperty }: Props) {
    const [step, setStep] = useState<1 | 2>(1);
    const [officeId, setOfficeId] = useState("");
    const [landlordName, setLandlordName] = useState("");
    const [phone, setPhone] = useState("");
    const [email, setEmail] = useState("");
    const [nationalId, setNationalId] = useState("");
    const [paymentMethods, setPaymentMethods] = useState("");
    const [commissionType, setCommissionType] = useState<"percentage" | "fixed_amount">("percentage");
    const [commissionValue, setCommissionValue] = useState("");
    const [notes, setNotes] = useState("");
    const [rooms, setRooms] = useState<RoomDraft[]>([newRoom(selectedProperty)]);
    const [message, setMessage] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    const summary = useMemo(() => {
        const totalRooms = rooms.length;
        const occupiedRooms = rooms.filter((room) => room.status === "occupied").length;
        const vacantRooms = totalRooms - occupiedRooms;
        const rentRoll = rooms.reduce((total, room) => total + Number(room.monthlyRent || 0), 0);
        const openingOutstanding = rooms.reduce((total, room) => total + (room.outstandingMode === "has_outstanding" ? Number(room.outstandingBalance || 0) : 0), 0);
        const expectedCommission = commissionType === "percentage" ? rentRoll * (Number(commissionValue || 0) / 100) : Number(commissionValue || 0);
        return { totalRooms, occupiedRooms, vacantRooms, rentRoll, openingOutstanding, expectedCommission };
    }, [commissionType, commissionValue, rooms]);

    function updateRoom(id: string, patch: Partial<RoomDraft>) {
        setRooms((current) => current.map((room) => room.id === id ? { ...room, ...patch } : room));
    }

    function validate() {
        if (isAdmin && !officeId) return "Admin must choose an office.";
        if (!landlordName.trim()) return "Landlord name is required.";
        if (Number(commissionValue || 0) < 0) return "Commission value cannot be negative.";
        if (!rooms.length) return "Add at least one room.";
        const seen = new Set<string>();
        for (const room of rooms) {
            const number = room.roomNumber.trim().toUpperCase();
            if (!number) return "Every room needs a room number.";
            const propertyKey = room.propertyId || room.propertyName.trim().toLowerCase();
            const duplicateKey = `${propertyKey}:${number}`;
            if (seen.has(duplicateKey)) return `Duplicate room ${number} in the same property/location.`;
            seen.add(duplicateKey);
            if (Number(room.monthlyRent || 0) <= 0) return `Room ${number} needs a valid monthly rent.`;
            if (!room.propertyId && !room.propertyName.trim()) return `Room ${number} needs a property/location.`;
            if (room.status === "occupied") {
                if (!room.tenantName.trim()) return `Room ${number} is occupied, so tenant name is required.`;
                if (!room.tenantPhone.trim()) return `Room ${number} is occupied, so tenant phone is required.`;
                if (!room.moveInDate) return `Room ${number} needs tenant move-in date.`;
                if (room.outstandingMode === "has_outstanding" && Number(room.outstandingBalance || 0) <= 0) return `Room ${number} needs a valid opening outstanding balance.`;
            }
        }
        return null;
    }

    function submit() {
        const validation = validate();
        if (validation) {
            setMessage(validation);
            return;
        }
        startTransition(async () => {
            try {
                setMessage(null);
                const result = await createAction({
                    officeId: isAdmin ? officeId : undefined,
                    landlordName,
                    phone,
                    email,
                    nationalId,
                    paymentMethods,
                    commissionType,
                    commissionValue: Number(commissionValue || 0),
                    notes,
                    rooms: rooms.map((room) => ({
                        roomNumber: room.roomNumber,
                        monthlyRent: Number(room.monthlyRent || 0),
                        propertyId: room.propertyId || undefined,
                        propertyName: room.propertyName,
                        status: room.status,
                        startDate: room.startDate,
                        notes: room.notes,
                        tenantName: room.tenantName,
                        tenantPhone: room.tenantPhone,
                        tenantNationalId: room.tenantNationalId,
                        moveInDate: room.moveInDate,
                        outstandingMode: room.outstandingMode,
                        outstandingBalance: Number(room.outstandingBalance || 0),
                        outstandingDate: room.outstandingDate,
                        outstandingNotes: room.outstandingNotes,
                    })),
                });
                setMessage(result.message);
                onSaved();
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "New landlord request could not be saved.");
            }
        });
    }

    return (
        <div className="fixed inset-0 z-[160] overflow-auto bg-slate-950/80 p-4 backdrop-blur-sm">
            <section className="mx-auto max-w-6xl overflow-hidden rounded-[28px] border border-white/15 bg-slate-950 text-white shadow-2xl">
                <header className="flex flex-col gap-4 border-b border-white/10 bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 p-5 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs font-black uppercase text-cyan-100">
                            <Building2 size={14} />
                            New Landlord + Bulk Rooms
                        </div>
                        <h2 className="mt-3 text-2xl font-black">Create landlord and room inventory together</h2>
                        <p className="mt-1 text-sm font-semibold text-slate-300">{isAdmin ? "Admin saves live immediately." : "Office submissions stay pending until Admin approval."}</p>
                    </div>
                    <button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10 text-slate-200 hover:bg-white/15">
                        <X size={18} />
                    </button>
                </header>

                <div className="grid gap-4 p-5 lg:grid-cols-[1fr_320px]">
                    <div className="space-y-4">
                        <div className="flex gap-2">
                            <button type="button" onClick={() => setStep(1)} className={`rounded-2xl px-4 py-2 text-xs font-black uppercase ${step === 1 ? "bg-cyan-300 text-slate-950" : "bg-white/10 text-slate-300"}`}>1. Landlord</button>
                            <button type="button" onClick={() => setStep(2)} className={`rounded-2xl px-4 py-2 text-xs font-black uppercase ${step === 2 ? "bg-cyan-300 text-slate-950" : "bg-white/10 text-slate-300"}`}>2. Rooms</button>
                        </div>

                        {step === 1 ? (
                            <div className="rounded-[24px] border border-white/10 bg-white/[0.055] p-4">
                                <div className="mb-4 flex items-center gap-2">
                                    <UserRound size={18} className="text-cyan-100" />
                                    <h3 className="text-lg font-black">Landlord details</h3>
                                </div>
                                <div className="grid gap-3 md:grid-cols-2">
                                    {isAdmin ? (
                                        <Field label="Office">
                                            <select value={officeId} onChange={(event) => setOfficeId(event.target.value)} className="field-dark">
                                                <option value="">Choose office</option>
                                                {offices.map((office) => <option key={office.id} value={office.id}>{office.name}</option>)}
                                            </select>
                                        </Field>
                                    ) : null}
                                    <Field label="Landlord name"><input value={landlordName} onChange={(event) => setLandlordName(event.target.value)} className="field-dark" /></Field>
                                    <Field label="Phone number"><input value={phone} onChange={(event) => setPhone(event.target.value)} className="field-dark" /></Field>
                                    <Field label="Email optional"><input value={email} onChange={(event) => setEmail(event.target.value)} className="field-dark" /></Field>
                                    <Field label="National ID optional"><input value={nationalId} onChange={(event) => setNationalId(event.target.value)} className="field-dark" /></Field>
                                    <Field label="Commission type">
                                        <select value={commissionType} onChange={(event) => setCommissionType(event.target.value as "percentage" | "fixed_amount")} className="field-dark">
                                            <option value="percentage">Percentage</option>
                                            <option value="fixed_amount">Fixed amount</option>
                                        </select>
                                    </Field>
                                    <Field label="Commission rate/value"><input value={commissionValue} onChange={(event) => setCommissionValue(event.target.value)} type="number" className="field-dark" /></Field>
                                    <Field label="Payment methods optional"><input value={paymentMethods} onChange={(event) => setPaymentMethods(event.target.value)} placeholder="MTN, Airtel, bank..." className="field-dark" /></Field>
                                    <Field label="Notes"><input value={notes} onChange={(event) => setNotes(event.target.value)} className="field-dark" /></Field>
                                </div>
                                <div className="mt-4 flex justify-end">
                                    <button type="button" onClick={() => setStep(2)} className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-black text-slate-950">Continue to Rooms</button>
                                </div>
                            </div>
                        ) : (
                            <div className="rounded-[24px] border border-white/10 bg-white/[0.055] p-4">
                                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <h3 className="text-lg font-black">Rooms under landlord</h3>
                                        <p className="text-sm text-slate-400">Add all rooms before saving. Occupied rooms require tenant details.</p>
                                    </div>
                                    <button type="button" onClick={() => setRooms((current) => [...current, newRoom(selectedProperty)])} className="inline-flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-2 text-xs font-black uppercase text-cyan-100">
                                        <Plus size={15} />
                                        Add another room
                                    </button>
                                </div>
                                <div className="space-y-3">
                                    {rooms.map((room, index) => (
                                        <div key={room.id} className="rounded-2xl border border-white/10 bg-slate-950/70 p-3">
                                            <div className="mb-3 flex items-center justify-between">
                                                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black">Room {index + 1}</span>
                                                <button type="button" onClick={() => setRooms((current) => current.filter((item) => item.id !== room.id))} disabled={rooms.length === 1} className="inline-flex items-center gap-1 rounded-xl bg-red-500/15 px-2 py-1 text-xs font-black text-red-100 disabled:opacity-40">
                                                    <Trash2 size={13} />
                                                    Remove
                                                </button>
                                            </div>
                                            <div className="grid gap-3 md:grid-cols-4">
                                                <Field label="Room number"><input value={room.roomNumber} onChange={(event) => updateRoom(room.id, { roomNumber: event.target.value })} className="field-dark" /></Field>
                                                <Field label="Monthly rent"><input value={room.monthlyRent} onChange={(event) => updateRoom(room.id, { monthlyRent: event.target.value })} type="number" className="field-dark" /></Field>
                                                <Field label="Property/location">
                                                    <select value={room.propertyId} onChange={(event) => updateRoom(room.id, { propertyId: event.target.value, propertyName: properties.find((property) => property.id === event.target.value)?.property_name ?? room.propertyName })} className="field-dark">
                                                        <option value="">New / typed location</option>
                                                        {properties.map((property) => <option key={property.id} value={property.id}>{property.property_name ?? property.name}</option>)}
                                                    </select>
                                                </Field>
                                                <Field label="Typed location"><input value={room.propertyName} onChange={(event) => updateRoom(room.id, { propertyName: event.target.value, propertyId: "" })} className="field-dark" /></Field>
                                                <Field label="Room status">
                                                    <select value={room.status} onChange={(event) => updateRoom(room.id, { status: event.target.value as "occupied" | "vacant" })} className="field-dark">
                                                        <option value="vacant">Vacant</option>
                                                        <option value="occupied">Occupied</option>
                                                    </select>
                                                </Field>
                                                <Field label="Start / creation date"><input value={room.startDate} onChange={(event) => updateRoom(room.id, { startDate: event.target.value })} type="date" className="field-dark" /></Field>
                                                <Field label="Room notes"><input value={room.notes} onChange={(event) => updateRoom(room.id, { notes: event.target.value })} className="field-dark" /></Field>
                                            </div>
                                            {room.status === "occupied" ? (
                                                <div className="mt-3 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-3">
                                                    <p className="mb-2 text-xs font-black uppercase text-emerald-100">Tenant opening details</p>
                                                    <div className="grid gap-3 md:grid-cols-4">
                                                        <Field label="Tenant name"><input value={room.tenantName} onChange={(event) => updateRoom(room.id, { tenantName: event.target.value })} className="field-dark" /></Field>
                                                        <Field label="Phone number"><input value={room.tenantPhone} onChange={(event) => updateRoom(room.id, { tenantPhone: event.target.value })} className="field-dark" /></Field>
                                                        <Field label="National ID"><input value={room.tenantNationalId} onChange={(event) => updateRoom(room.id, { tenantNationalId: event.target.value })} className="field-dark" /></Field>
                                                        <Field label="Move-in date"><input value={room.moveInDate} onChange={(event) => updateRoom(room.id, { moveInDate: event.target.value })} type="date" className="field-dark" /></Field>
                                                        <Field label="Outstanding balance">
                                                            <select value={room.outstandingMode} onChange={(event) => updateRoom(room.id, { outstandingMode: event.target.value as "none" | "has_outstanding" })} className="field-dark">
                                                                <option value="none">No outstanding balance</option>
                                                                <option value="has_outstanding">Has outstanding balance</option>
                                                            </select>
                                                        </Field>
                                                        {room.outstandingMode === "has_outstanding" ? (
                                                            <>
                                                                <Field label="Outstanding amount"><input value={room.outstandingBalance} onChange={(event) => updateRoom(room.id, { outstandingBalance: event.target.value })} type="number" className="field-dark" /></Field>
                                                                <Field label="Balance date"><input value={room.outstandingDate} onChange={(event) => updateRoom(room.id, { outstandingDate: event.target.value })} type="date" className="field-dark" /></Field>
                                                                <Field label="Balance notes"><input value={room.outstandingNotes} onChange={(event) => updateRoom(room.id, { outstandingNotes: event.target.value })} className="field-dark" /></Field>
                                                            </>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            ) : null}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <aside className="space-y-3">
                        <div className="rounded-[24px] border border-white/10 bg-white/[0.06] p-4">
                            <p className="text-xs font-black uppercase text-cyan-100">Summary Preview</p>
                            <div className="mt-3 space-y-2">
                                <Summary label="Total rooms" value={summary.totalRooms.toLocaleString()} />
                                <Summary label="Occupied rooms" value={summary.occupiedRooms.toLocaleString()} />
                                <Summary label="Vacant rooms" value={summary.vacantRooms.toLocaleString()} />
                                <Summary label="Rent roll" value={money(summary.rentRoll)} />
                                <Summary label="Opening outstanding" value={money(summary.openingOutstanding)} />
                                <Summary label="Expected commission" value={money(summary.expectedCommission)} />
                                <Summary label="Approval status" value={isAdmin ? "Saved live" : "Pending Admin Approval"} />
                            </div>
                        </div>
                        <div className="rounded-[24px] border border-amber-300/20 bg-amber-300/10 p-4 text-sm font-bold text-amber-50">
                            <div className="flex gap-2">
                                <AlertTriangle size={18} />
                                <p>{isAdmin ? "Admin saves this directly into live landlords, rooms, tenants and vacant inventory." : "Office submissions do not affect live counts until Admin approves."}</p>
                            </div>
                        </div>
                        {message ? <div className="rounded-2xl border border-white/10 bg-white/10 p-3 text-sm font-bold text-slate-100">{message}</div> : null}
                        <button disabled={!canManage || isPending} type="button" onClick={submit} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-5 text-sm font-black text-white shadow-lg shadow-emerald-950/20 disabled:opacity-40">
                            <CheckCircle2 size={18} />
                            {isPending ? "Saving landlord and rooms..." : isAdmin ? "Save Live Now" : "Submit for Admin Approval"}
                        </button>
                    </aside>
                </div>
            </section>
        </div>
    );
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
    return (
        <label className="block">
            <span className="text-[11px] font-black uppercase tracking-wide text-slate-400">{label}</span>
            <div className="mt-1">{children}</div>
        </label>
    );
}

function Summary({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/8 px-3 py-2">
            <span className="text-xs font-bold text-slate-300">{label}</span>
            <span className="text-sm font-black text-white">{value}</span>
        </div>
    );
}
