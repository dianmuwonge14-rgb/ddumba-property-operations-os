"use client";

import { useMemo, useState } from "react";
import { ArrowDownAZ, Bot, Building2, Download, FileText, Home, Printer, Search, Sparkles, TrendingDown, UserPlus, WalletCards } from "lucide-react";
import RoomActionPanel from "@/components/office/rooms/RoomActionPanel";
import type { VacantRoomItem, VacantRoomsPageData } from "@/lib/vacant-rooms/types";

type Props = {
    data: VacantRoomsPageData;
};

type SortMode = "room_asc" | "rent_low" | "rent_high" | "days_high";
type ViewMode = "cards" | "table";

function money(value: number | string | null | undefined) {
    return `UGX ${Math.round(Number(value ?? 0)).toLocaleString()}`;
}

function normalize(value: string | null | undefined) {
    return String(value ?? "").trim().toLowerCase();
}

export default function VacantRoomsConsole({ data }: Props) {
    const [rooms, setRooms] = useState(data.rooms);
    const [query, setQuery] = useState("");
    const [minRent, setMinRent] = useState("");
    const [maxRent, setMaxRent] = useState("");
    const [officeId, setOfficeId] = useState("");
    const [landlordId, setLandlordId] = useState("");
    const [location, setLocation] = useState("");
    const [duration, setDuration] = useState("");
    const [sort, setSort] = useState<SortMode>("rent_low");
    const [view, setView] = useState<ViewMode>("cards");
    const [selectedRoom, setSelectedRoom] = useState<VacantRoomItem | null>(null);
    const [showPrintPreview, setShowPrintPreview] = useState(false);

    const filteredRooms = useMemo(() => {
        const term = normalize(query);
        const min = Number(minRent || 0);
        const max = Number(maxRent || 0);
        const minDays = Number(duration || 0);
        return rooms
            .filter((room) => {
                const searchable = [
                    room.roomNumber,
                    room.landlordName,
                    room.location,
                    room.propertyName,
                    String(room.monthlyRent),
                ].map(normalize).join(" ");
                if (term && !searchable.includes(term)) return false;
                if (min > 0 && room.monthlyRent < min) return false;
                if (max > 0 && room.monthlyRent > max) return false;
                if (officeId && room.officeId !== officeId) return false;
                if (landlordId && room.landlordId !== landlordId) return false;
                if (location && room.location !== location) return false;
                if (minDays > 0 && room.daysVacant < minDays) return false;
                return true;
            })
            .sort((a, b) => {
                if (sort === "rent_low") return a.monthlyRent - b.monthlyRent || a.roomNumber.localeCompare(b.roomNumber);
                if (sort === "rent_high") return b.monthlyRent - a.monthlyRent || a.roomNumber.localeCompare(b.roomNumber);
                if (sort === "days_high") return b.daysVacant - a.daysVacant || b.monthlyRent - a.monthlyRent;
                return a.roomNumber.localeCompare(b.roomNumber);
            });
    }, [duration, landlordId, location, maxRent, minRent, officeId, query, rooms, sort]);

    const visibleKpis = useMemo(() => buildKpis(filteredRooms), [filteredRooms]);

    function switchView(nextView: ViewMode) {
        setView((currentView) => currentView === nextView ? currentView : nextView);
    }

    function afterOccupied() {
        if (!selectedRoom) return;
        setRooms((current) => current.filter((room) => room.id !== selectedRoom.id));
        setSelectedRoom(null);
    }

    function exportCsv() {
        const header = ["Room", "Office", "Property", "Location", "Landlord", "Monthly Rent", "Vacant Since", "Days Vacant", "Last Tenant", "Company Profit Lost"];
        const csv = [header, ...filteredRooms.map((room) => [
            room.roomNumber,
            room.officeName,
            room.propertyName,
            room.location,
            room.landlordName,
            String(room.monthlyRent),
            room.vacantSince ?? "",
            String(room.daysVacant),
            room.lastTenantName ?? "",
            String(room.companyProfitLost),
        ])].map((row) => row.map((cell) => `"${String(cell).replaceAll("\"", "\"\"")}"`).join(",")).join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `vacant-rooms-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    }

    return (
        <main className="enterprise-page">
            <div className="enterprise-shell">
                <section className="mx-auto max-w-7xl overflow-hidden rounded-[30px] border border-white/10 bg-slate-950 p-5 text-white shadow-2xl shadow-black/30">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-black uppercase text-cyan-100">
                                <Home size={14} />
                                {data.isAdmin ? "Admin vacant rooms" : "Office vacant rooms"}
                            </div>
                            <h1 className="mt-3 text-3xl font-black sm:text-4xl">Vacant Rooms</h1>
                            <p className="mt-1 text-sm font-semibold text-slate-300">
                                {data.company?.name ?? "Company"} · {data.isAdmin ? "All offices" : data.activeOffice?.office_name ?? data.activeOffice?.name ?? "Active office"}
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button onClick={() => setShowPrintPreview(true)} className="inline-flex h-11 items-center gap-2 rounded-2xl bg-white px-4 text-sm font-black text-slate-950">
                                <Printer size={16} />
                                Print A4 Report
                            </button>
                            <button onClick={() => setShowPrintPreview(true)} className="inline-flex h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 text-sm font-black text-white">
                                <Download size={16} />
                                Export PDF
                            </button>
                            <button onClick={exportCsv} className="inline-flex h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 text-sm font-black text-white">
                                <Download size={16} />
                                Export CSV
                            </button>
                        </div>
                    </div>
                </section>

                <section className="mx-auto mt-5 grid max-w-7xl gap-3 md:grid-cols-3 xl:grid-cols-7">
                    <LossCard label="Total vacant rooms" value={visibleKpis.totalVacantRooms.toLocaleString()} hint="Available room count" tone="blue" icon={<Home size={18} />} />
                    <LossCard label="Landlord money not received" value={money(visibleKpis.totalMonthlyRentLost)} hint="Vacant room rent roll" tone="red" icon={<TrendingDown size={18} />} />
                    <LossCard label="Company collections lost" value={money(visibleKpis.totalCompanyCollectionsLost)} hint="Expected tenant collections" tone="red" icon={<WalletCards size={18} />} />
                    <LossCard label="Company profit lost" value={money(visibleKpis.totalCompanyProfitLost)} hint="Commission from vacancies" tone="amber" icon={<TrendingDown size={18} />} />
                    <LossCard label="Average days vacant" value={visibleKpis.averageDaysVacant.toLocaleString()} hint="Across selected rooms" tone="slate" icon={<FileText size={18} />} />
                    <LossCard label="Highest vacant rent loss" value={money(visibleKpis.highestVacantRentLoss)} hint="Largest monthly rent" tone="amber" icon={<WalletCards size={18} />} />
                    <LossCard label="Most vacant office" value={visibleKpis.officeWithMostVacantRooms} hint="Needs occupancy drive" tone="blue" icon={<Building2 size={18} />} />
                </section>

                <VacancyAssistantPanel assistant={data.assistant} />

                <section className="mx-auto mt-5 max-w-7xl rounded-[28px] border border-white/10 bg-slate-900 p-4 text-white shadow-xl shadow-black/20">
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.8fr)_repeat(6,minmax(130px,1fr))]">
                        <label className="block">
                            <span className="text-xs font-black uppercase tracking-wide text-slate-400">Search room, rent, location, landlord</span>
                            <div className="mt-1 flex h-12 items-center rounded-2xl border border-white/10 bg-slate-950 px-3">
                                <Search size={16} className="mr-2 text-slate-500" />
                                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="T149, 250000, Kiyindi..." className="w-full bg-transparent text-sm font-black text-white outline-none placeholder:text-slate-500" />
                            </div>
                        </label>
                        <FilterInput label="Min rent" value={minRent} onChange={setMinRent} />
                        <FilterInput label="Max rent" value={maxRent} onChange={setMaxRent} />
                        {data.canFilterOffices ? (
                            <FilterSelect label="Office" value={officeId} onChange={setOfficeId} options={[{ id: "", name: "All offices" }, ...data.offices]} />
                        ) : null}
                        <FilterSelect label="Location" value={location} onChange={setLocation} options={[{ id: "", name: "All locations" }, ...data.locations.map((item) => ({ id: item, name: item }))]} />
                        <FilterSelect label="Landlord" value={landlordId} onChange={setLandlordId} options={[{ id: "", name: "All landlords" }, ...data.landlords]} />
                        <FilterSelect label="Vacant duration" value={duration} onChange={setDuration} options={[
                            { id: "", name: "Any duration" },
                            { id: "7", name: "7+ days" },
                            { id: "30", name: "30+ days" },
                            { id: "60", name: "60+ days" },
                        ]} />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="inline-flex rounded-2xl border border-white/10 bg-slate-950 p-1" role="tablist" aria-label="Vacant rooms view">
                                <Toggle active={view === "cards"} onClick={() => switchView("cards")}>Cards</Toggle>
                                <Toggle active={view === "table"} onClick={() => switchView("table")}>Table</Toggle>
                            </div>
                            <span className="rounded-full border border-white/10 bg-white/8 px-3 py-2 text-xs font-black uppercase tracking-wide text-slate-300">
                                {view === "cards" ? "Cards view active" : "Table view active"}
                            </span>
                        </div>
                        <label className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-400">
                            <ArrowDownAZ size={15} />
                            Sort
                            <select value={sort} onChange={(event) => setSort(event.target.value as SortMode)} className="h-10 rounded-xl border border-white/10 bg-slate-950 px-3 text-sm font-black text-white outline-none">
                                <option value="rent_low">Lowest rent first</option>
                                <option value="rent_high">Highest rent first</option>
                                <option value="days_high">Longest vacant first</option>
                                <option value="room_asc">Room number</option>
                            </select>
                        </label>
                    </div>
                </section>

                <section className="mx-auto mt-5 max-w-7xl">
                    {view === "cards" ? (
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            {filteredRooms.map((room) => (
                                <VacantRoomCard key={`${room.id}:card:${room.vacantSince ?? "unknown"}`} canManage={data.canManageOccupancy} onSelect={() => setSelectedRoom(room)} room={room} />
                            ))}
                        </div>
                    ) : (
                        <VacantRoomsTable canManage={data.canManageOccupancy} onSelect={setSelectedRoom} rooms={filteredRooms} />
                    )}
                    {!filteredRooms.length ? (
                        <div className="rounded-[26px] border border-dashed border-white/20 bg-white/8 p-8 text-center text-white">
                            <p className="text-lg font-black">No vacant rooms match these filters.</p>
                            <p className="mt-1 text-sm font-semibold text-slate-400">Clear filters or check another office/location.</p>
                        </div>
                    ) : null}
                </section>

                {data.canManageOccupancy ? (
                    <section className="mx-auto mt-5 max-w-7xl">
                        <RoomActionPanel
                            isAdmin={data.isAdmin}
                            room={selectedRoom ? {
                                id: selectedRoom.id,
                                roomNumber: selectedRoom.roomNumber,
                                status: selectedRoom.status,
                                monthlyRent: selectedRoom.monthlyRent,
                                outstandingBalance: 0,
                                landlordName: selectedRoom.landlordName,
                                propertyName: selectedRoom.propertyName,
                                officeName: selectedRoom.officeName,
                                tenantName: null,
                                tenantPhone: null,
                            } : null}
                            onSaved={afterOccupied}
                        />
                    </section>
                ) : null}
            </div>

            {showPrintPreview ? (
                <PrintPreview
                    companyName={data.company?.name ?? "Company"}
                    generatedAt={data.generatedAt}
                    kpis={visibleKpis}
                    onClose={() => setShowPrintPreview(false)}
                    rooms={filteredRooms}
                    scope={data.isAdmin ? "All offices" : data.activeOffice?.office_name ?? data.activeOffice?.name ?? "Active office"}
                />
            ) : null}
        </main>
    );
}

function buildKpis(items: VacantRoomItem[]) {
    const officeCounts = new Map<string, number>();
    for (const item of items) officeCounts.set(item.officeName, (officeCounts.get(item.officeName) ?? 0) + 1);
    const totalMonthlyRentLost = items.reduce((total, item) => total + item.monthlyRent, 0);
    return {
        totalVacantRooms: items.length,
        totalMonthlyRentLost,
        totalCompanyCollectionsLost: totalMonthlyRentLost,
        totalCompanyProfitLost: items.reduce((total, item) => total + item.companyProfitLost, 0),
        averageDaysVacant: items.length ? Math.round(items.reduce((total, item) => total + item.daysVacant, 0) / items.length) : 0,
        highestVacantRentLoss: items.reduce((max, item) => Math.max(max, item.monthlyRent), 0),
        officeWithMostVacantRooms: [...officeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "No vacancies",
    };
}

function VacantRoomCard({ canManage, onSelect, room }: { canManage: boolean; onSelect: () => void; room: VacantRoomItem }) {
    return (
        <article className="rounded-[26px] border border-white/70 bg-white p-4 shadow-2xl shadow-slate-950/15">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-xs font-black uppercase text-blue-600">Room {room.roomNumber}</p>
                    <h2 className="mt-1 text-xl font-black text-slate-950">{money(room.monthlyRent)}</h2>
                    <p className="mt-1 text-sm font-bold text-slate-500">{room.location}</p>
                </div>
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black uppercase text-blue-700 ring-1 ring-blue-100">{room.status}</span>
            </div>
            <div className="mt-4 grid gap-2 text-sm font-bold text-slate-600">
                <Line label="Office" value={room.officeName} />
                <Line label="Landlord" value={room.landlordName} />
                <Line label="Property" value={room.propertyName} />
                <Line label="Vacant since" value={room.vacantSince ?? "Unknown"} />
                <Line label="Days vacant" value={`${room.daysVacant} day(s)`} />
                <Line label="Last tenant" value={room.lastTenantName ?? "Not recorded"} />
                <Line label="Company profit lost" value={money(room.companyProfitLost)} />
                <Line label="Projected yearly loss" value={money(room.yearlyProjectedLoss)} />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
                {room.suggestedActions.slice(0, 5).map((action) => (
                    <span key={`${room.id}:card-action:${action.toLowerCase().replaceAll(" ", "-")}:${room.vacantSince ?? "unknown"}`} className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black uppercase text-blue-700">{action}</span>
                ))}
            </div>
            <button disabled={!canManage} onClick={onSelect} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-blue-700 disabled:opacity-45">
                <UserPlus size={16} />
                Mark Occupied / Assign Tenant
            </button>
        </article>
    );
}

function VacantRoomsTable({ canManage, onSelect, rooms }: { canManage: boolean; onSelect: (room: VacantRoomItem) => void; rooms: VacantRoomItem[] }) {
    return (
        <div className="overflow-hidden rounded-[26px] border border-white/70 bg-white shadow-2xl shadow-slate-950/15">
            <div className="max-h-[620px] overflow-auto">
                <table className="w-full min-w-[1120px] text-left text-sm">
                    <thead className="sticky top-0 bg-slate-950 text-xs uppercase text-slate-200">
                        <tr>
                            <th className="px-4 py-3">Room</th>
                            <th className="px-4 py-3">Office</th>
                            <th className="px-4 py-3">Property / Location</th>
                            <th className="px-4 py-3">Landlord</th>
                            <th className="px-4 py-3 text-right">Monthly Rent</th>
                            <th className="px-4 py-3">Vacant Since</th>
                            <th className="px-4 py-3">Days</th>
                            <th className="px-4 py-3">Last Tenant</th>
                            <th className="px-4 py-3 text-right">Profit Lost</th>
                            <th className="px-4 py-3">AI Action</th>
                            <th className="px-4 py-3 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rooms.map((room) => (
                            <tr key={`${room.id}:table:${room.vacantSince ?? "unknown"}`} className="border-b border-slate-100">
                                <td className="px-4 py-3 font-black text-slate-950">{room.roomNumber}</td>
                                <td className="px-4 py-3 font-bold text-slate-600">{room.officeName}</td>
                                <td className="px-4 py-3 font-bold text-slate-600">{room.propertyName}<br /><span className="text-xs text-slate-400">{room.location}</span></td>
                                <td className="px-4 py-3 font-bold text-slate-600">{room.landlordName}</td>
                                <td className="px-4 py-3 text-right font-black text-slate-950">{money(room.monthlyRent)}</td>
                                <td className="px-4 py-3 font-bold text-slate-500">{room.vacantSince ?? "Unknown"}</td>
                                <td className="px-4 py-3 font-bold text-slate-500">{room.daysVacant}</td>
                                <td className="px-4 py-3 font-bold text-slate-500">{room.lastTenantName ?? "Not recorded"}</td>
                                <td className="px-4 py-3 text-right font-black text-amber-700">{money(room.companyProfitLost)}</td>
                                <td className="px-4 py-3">
                                    <div className="flex max-w-[220px] flex-wrap gap-1">
                                        {room.suggestedActions.slice(0, 4).map((action) => (
                                            <span key={`${room.id}:table-action:${action.toLowerCase().replaceAll(" ", "-")}:${room.vacantSince ?? "unknown"}`} className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-700">{action}</span>
                                        ))}
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <button disabled={!canManage} onClick={() => onSelect(room)} className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white disabled:opacity-45">
                                        Assign Tenant
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function FilterInput({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
    return (
        <label>
            <span className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</span>
            <input type="number" min="0" value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-12 w-full rounded-2xl border border-white/10 bg-slate-950 px-3 text-sm font-black text-white outline-none" />
        </label>
    );
}

function FilterSelect({ label, onChange, options, value }: { label: string; onChange: (value: string) => void; options: Array<{ id: string; name: string }>; value: string }) {
    return (
        <label>
            <span className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</span>
            <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 h-12 w-full rounded-2xl border border-white/10 bg-slate-950 px-3 text-sm font-black text-white outline-none">
                {options.map((option) => <option key={`vacancy-filter:${label}:${option.id || option.name}`} value={option.id}>{option.name}</option>)}
            </select>
        </label>
    );
}

function Toggle({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
    return (
        <button
            type="button"
            role="tab"
            aria-selected={active}
            onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onClick();
            }}
            className={`rounded-xl px-4 py-2 text-xs font-black transition focus:outline-none focus:ring-2 focus:ring-cyan-300 ${active ? "bg-white text-slate-950 shadow-lg shadow-cyan-500/20" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}
        >
            {children}
        </button>
    );
}

function LossCard({ hint, icon, label, tone, value }: { hint: string; icon: React.ReactNode; label: string; tone: "blue" | "red" | "amber" | "slate"; value: string }) {
    const toneClass = {
        blue: "border-blue-200 bg-blue-50 text-blue-800",
        red: "border-rose-200 bg-rose-50 text-rose-800",
        amber: "border-amber-200 bg-amber-50 text-amber-800",
        slate: "border-slate-200 bg-white text-slate-800",
    }[tone];
    return (
        <div className={`rounded-[24px] border p-4 shadow-xl shadow-slate-950/10 ${toneClass}`}>
            <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-black uppercase tracking-wide opacity-75">{label}</p>
                {icon}
            </div>
            <p className="mt-3 break-words text-xl font-black leading-tight">{value}</p>
            <p className="mt-1 text-xs font-bold opacity-70">{hint}</p>
        </div>
    );
}

function Line({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2">
            <span className="text-xs font-black uppercase text-slate-400">{label}</span>
            <span className="text-right text-sm font-black text-slate-800">{value}</span>
        </div>
    );
}

function VacancyAssistantPanel({ assistant }: { assistant: VacantRoomsPageData["assistant"] }) {
    const focusList = assistant.marketFirst.slice(0, 5);
    return (
        <section className="mx-auto mt-5 max-w-7xl overflow-hidden rounded-[28px] border border-cyan-300/20 bg-slate-950 p-5 text-white shadow-2xl shadow-black/25">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="max-w-2xl">
                    <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs font-black uppercase text-cyan-100">
                        <Bot size={14} />
                        AI Vacancy Assistant
                    </div>
                    <h2 className="mt-3 text-2xl font-black">Live vacancy intelligence</h2>
                    <p className="mt-1 text-sm font-semibold text-slate-300">
                        Built from live rooms, offices, landlords, tenants, room history, collections, and commission rules.
                    </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-3 xl:min-w-[520px]">
                    <AssistantMini label="Market first" value={assistant.marketFirst.length.toLocaleString()} />
                    <AssistantMini label="Vacant too long" value={assistant.stayedVacantTooLong.length.toLocaleString()} />
                    <AssistantMini label="Recently vacant" value={assistant.recentlyVacated.length.toLocaleString()} />
                </div>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="grid gap-3 md:grid-cols-2">
                    {assistant.insights.length ? assistant.insights.map((insight) => (
                        <div key={`vacancy-insight:${insight.id}:${insight.severity}`} className={`rounded-2xl border p-4 ${insight.severity === "critical" ? "border-rose-300/25 bg-rose-400/10" : insight.severity === "warning" ? "border-amber-300/25 bg-amber-400/10" : "border-cyan-300/25 bg-cyan-400/10"}`}>
                            <div className="flex items-center gap-2">
                                <Sparkles size={15} className={insight.severity === "critical" ? "text-rose-200" : insight.severity === "warning" ? "text-amber-200" : "text-cyan-200"} />
                                <p className="text-sm font-black">{insight.title}</p>
                            </div>
                            <p className="mt-2 text-sm font-semibold text-slate-300">{insight.message}</p>
                        </div>
                    )) : (
                        <div className="rounded-2xl border border-emerald-300/25 bg-emerald-400/10 p-4">
                            <p className="text-sm font-black text-emerald-100">No vacancy alerts</p>
                            <p className="mt-2 text-sm font-semibold text-slate-300">No vacancy risk is currently visible for this scope.</p>
                        </div>
                    )}
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/8 p-4">
                    <p className="text-xs font-black uppercase tracking-wide text-cyan-100">Rooms to market first</p>
                    <div className="mt-3 space-y-2">
                        {focusList.length ? focusList.map((room) => (
                            <div key={`${room.id}:market-first:${room.vacantSince ?? "unknown"}`} className="rounded-2xl bg-slate-900 px-3 py-2">
                                <div className="flex items-center justify-between gap-3">
                                    <p className="font-black">Room {room.roomNumber}</p>
                                    <span className="rounded-full bg-amber-400/15 px-2 py-1 text-[10px] font-black uppercase text-amber-100">{room.daysVacant} days</span>
                                </div>
                                <p className="mt-1 text-xs font-bold text-slate-400">{room.officeName} · {money(room.monthlyRent)} · yearly loss {money(room.yearlyProjectedLoss)}</p>
                            </div>
                        )) : (
                            <p className="rounded-2xl bg-slate-900 p-3 text-sm font-bold text-slate-400">No rooms need AI marketing priority right now.</p>
                        )}
                    </div>
                </div>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-3">
                <AssistantList title="Low-rent tenant fit" rooms={assistant.lowRentTenantRooms} />
                <AssistantList title="High-value tenant fit" rooms={assistant.highValueTenantRooms} />
                <AssistantList title="Company profit loss leaders" rooms={assistant.companyProfitLossLeaders} />
            </div>
        </section>
    );
}

function AssistantMini({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-white/8 p-3">
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p>
            <p className="mt-1 text-xl font-black text-white">{value}</p>
        </div>
    );
}

function AssistantList({ rooms, title }: { rooms: VacantRoomItem[]; title: string }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-white/8 p-4 text-white">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">{title}</p>
            <div className="mt-3 space-y-2">
                {rooms.slice(0, 4).map((room) => (
                    <div key={`${room.id}:assistant-list:${title}:${room.vacantSince ?? "unknown"}`} className="flex items-center justify-between gap-3 rounded-xl bg-slate-900 px-3 py-2">
                        <span className="text-sm font-black">Room {room.roomNumber}</span>
                        <span className="text-xs font-black text-cyan-100">{money(room.monthlyRent)}</span>
                    </div>
                ))}
                {!rooms.length ? <p className="text-sm font-bold text-slate-400">No rooms in this group.</p> : null}
            </div>
        </div>
    );
}

function PrintPreview({ companyName, generatedAt, kpis, onClose, rooms, scope }: { companyName: string; generatedAt: string; kpis: ReturnType<typeof buildKpis>; onClose: () => void; rooms: VacantRoomItem[]; scope: string }) {
    return (
        <div className="fixed inset-0 z-[150] overflow-auto bg-slate-950/80 p-4 backdrop-blur-sm">
            <div className="mx-auto max-w-6xl rounded-3xl bg-white p-5 shadow-2xl">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
                    <div>
                        <p className="text-xs font-black uppercase text-blue-700">Print preview</p>
                        <h2 className="text-xl font-black text-slate-950">Vacant Rooms Report</h2>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => window.print()} className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-black text-white">Print / Save PDF</button>
                        <button onClick={onClose} className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-700">Close</button>
                    </div>
                </div>
                <div className="min-h-[1050px] bg-white p-6 text-slate-950">
                    <header className="border-b-2 border-slate-950 pb-4">
                        <p className="text-sm font-black uppercase tracking-wide text-slate-500">{companyName}</p>
                        <h1 className="mt-1 text-3xl font-black">Vacant Rooms Report</h1>
                        <div className="mt-3 grid gap-2 text-sm font-semibold sm:grid-cols-2">
                            <p>Scope: {scope}</p>
                            <p>Generated: {new Date(generatedAt).toLocaleString()}</p>
                        </div>
                    </header>
                    <section className="mt-5 grid gap-3 sm:grid-cols-4">
                        <ReportBox label="Vacant Rooms" value={kpis.totalVacantRooms.toLocaleString()} />
                        <ReportBox label="Rent Lost" value={money(kpis.totalMonthlyRentLost)} />
                        <ReportBox label="Collections Lost" value={money(kpis.totalCompanyCollectionsLost)} />
                        <ReportBox label="Profit Lost" value={money(kpis.totalCompanyProfitLost)} />
                    </section>
                    <table className="mt-6 w-full border-collapse text-xs">
                        <thead>
                            <tr className="bg-slate-950 text-left text-white">
                                <th className="border border-slate-300 px-2 py-2">Room</th>
                                <th className="border border-slate-300 px-2 py-2">Office</th>
                                <th className="border border-slate-300 px-2 py-2">Landlord</th>
                                <th className="border border-slate-300 px-2 py-2">Location</th>
                                <th className="border border-slate-300 px-2 py-2 text-right">Rent</th>
                                <th className="border border-slate-300 px-2 py-2">Vacant Since</th>
                                <th className="border border-slate-300 px-2 py-2 text-right">Profit Lost</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rooms.map((room) => (
                                <tr key={`${room.id}:print:${room.vacantSince ?? "unknown"}`}>
                                    <td className="border border-slate-300 px-2 py-2 font-bold">{room.roomNumber}</td>
                                    <td className="border border-slate-300 px-2 py-2">{room.officeName}</td>
                                    <td className="border border-slate-300 px-2 py-2">{room.landlordName}</td>
                                    <td className="border border-slate-300 px-2 py-2">{room.location}</td>
                                    <td className="border border-slate-300 px-2 py-2 text-right font-bold">{money(room.monthlyRent)}</td>
                                    <td className="border border-slate-300 px-2 py-2">{room.vacantSince ?? "Unknown"}</td>
                                    <td className="border border-slate-300 px-2 py-2 text-right font-bold">{money(room.companyProfitLost)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <footer className="mt-10 grid gap-8 text-sm font-semibold sm:grid-cols-2">
                        <p>Prepared by: __________________________</p>
                        <p>Approved by: __________________________</p>
                    </footer>
                </div>
            </div>
        </div>
    );
}

function ReportBox({ label, value }: { label: string; value: string }) {
    return (
        <div className="border border-slate-300 p-3">
            <p className="text-xs font-black uppercase text-slate-500">{label}</p>
            <p className="mt-1 text-lg font-black">{value}</p>
        </div>
    );
}
