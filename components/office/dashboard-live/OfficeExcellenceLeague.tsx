"use client";

import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { EnterpriseKpiCard, EmptyState, PageHero, SearchBox, StatusChip } from "@/components/office/shared/EnterpriseUI";
import type { DashboardLiveData, OfficeLeagueRow } from "@/lib/dashboard-live/types";

type Props = {
    data: DashboardLiveData;
};

function money(value: number) {
    return `UGX ${Math.round(value).toLocaleString()}`;
}

export default function OfficeExcellenceLeague({ data }: Props) {
    const [query, setQuery] = useState("");
    const [selectedOfficeId, setSelectedOfficeId] = useState(data.league[0]?.officeId ?? "");
    const selectedOffice = data.league.find((office) => office.officeId === selectedOfficeId) ?? data.league[0] ?? null;
    const offices = useMemo(
        () => data.league.filter((office) => office.officeName.toLowerCase().includes(query.toLowerCase())),
        [data.league, query],
    );

    return (
        <main className="enterprise-page">
            <div className="enterprise-shell">
                <PageHero
                    title="Office Excellence League"
                    subtitle={`${data.company?.name ?? "Company"} · balanced ranking across collections, promises, occupancy, attendance, and expense control`}
                    badge="Performance League"
                >
                    {selectedOffice && (
                        <div className="enterprise-card min-w-72 p-5">
                            <p className="text-sm font-bold text-slate-500">Current Leader</p>
                            <p className="mt-2 text-2xl font-black text-slate-950">{data.league[0]?.officeName}</p>
                            <p className="text-sm text-slate-500">Score {data.league[0]?.officeScore}</p>
                        </div>
                    )}
                </PageHero>

                <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5">
                    <EnterpriseKpiCard title="Average Office Score" value={`${data.kpis.officeScore}`} tone="blue" trend="up" trendLabel="balanced score" progress={data.kpis.officeScore} />
                    <EnterpriseKpiCard title="Collections" value={money(data.kpis.monthCollections)} tone="green" trend="up" trendLabel="month to date" progress={78} />
                    <EnterpriseKpiCard title="Promise Recovery" value={`${data.kpis.promiseRecovery}%`} tone="purple" trend="up" trendLabel="company average" progress={data.kpis.promiseRecovery} />
                    <EnterpriseKpiCard title="Occupancy" value={`${data.kpis.occupancyRate}%`} tone="blue" trend="up" trendLabel="portfolio" progress={data.kpis.occupancyRate} />
                    <EnterpriseKpiCard title="Expense Control" value={money(data.kpis.expenses)} tone="red" trend="down" trendLabel="month spend" progress={data.kpis.expenses ? 60 : 0} />
                </section>

                <section className="mt-6 grid grid-cols-1 gap-6 2xl:grid-cols-12">
                    <div className="enterprise-panel overflow-hidden 2xl:col-span-8">
                        <div className="border-b border-slate-200 p-6">
                            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                                <div>
                                    <h2 className="text-xl font-black">Live Office Ranking</h2>
                                    <p className="text-sm text-slate-500">Formula: collections vs target + promise recovery + occupancy + attendance + expense control.</p>
                                </div>
                                <div className="w-full xl:w-80">
                                    <SearchBox value={query} onChange={setQuery} placeholder="Search offices..." />
                                </div>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="enterprise-table">
                                <thead>
                                    <tr>
                                        <th className="text-left">Rank</th>
                                        <th className="text-left">Office</th>
                                        <th className="text-left">Score</th>
                                        <th className="text-left">Collections vs Target</th>
                                        <th className="text-left">Promise Recovery</th>
                                        <th className="text-left">Occupancy</th>
                                        <th className="text-left">Attendance</th>
                                        <th className="text-left">Expense Control</th>
                                        <th className="text-left">Trend</th>
                                        <th className="text-left">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {offices.length === 0 ? (
                                        <tr><td colSpan={10} className="p-6"><EmptyState title="No offices found" description="Adjust the search term to see office rankings." /></td></tr>
                                    ) : offices.map((office) => (
                                        <tr
                                            key={office.officeId}
                                            onClick={() => setSelectedOfficeId(office.officeId)}
                                            className={`cursor-pointer ${selectedOffice?.officeId === office.officeId ? "bg-blue-50" : ""}`}
                                        >
                                            <td><span className="grid h-10 w-10 place-items-center rounded-full bg-slate-950 font-black text-white">{office.rank}</span></td>
                                            <td>
                                                <p className="font-black">{office.officeName}</p>
                                                {office.storedRank && <p className="text-xs text-slate-500">Stored rank {office.storedRank}</p>}
                                            </td>
                                            <td><Score value={office.officeScore} /></td>
                                            <td>{office.collectionsVsTarget}%</td>
                                            <td>{office.promiseRecovery}%</td>
                                            <td>{office.occupancy}%</td>
                                            <td>{office.attendance}%</td>
                                            <td>{office.expenseControl}%</td>
                                            <td><Trend trend={office.trend} /></td>
                                            <td><StatusChip label={office.status} tone={statusTone(office.status)} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="space-y-6 2xl:col-span-4">
                        {selectedOffice ? <OfficeDrillDown office={selectedOffice} /> : <EmptyState title="Select an office" description="Choose an office to inspect its score composition." />}
                    </div>
                </section>
            </div>
        </main>
    );
}

function OfficeDrillDown({ office }: { office: OfficeLeagueRow }) {
    return (
        <section className="enterprise-panel p-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="text-sm font-bold text-slate-500">Office Drill-down</p>
                    <h2 className="mt-1 text-2xl font-black">{office.officeName}</h2>
                    <p className="text-sm text-slate-500">Rank #{office.rank}</p>
                </div>
                <StatusChip label={office.status} tone={statusTone(office.status)} />
            </div>
            <div className="mt-6 grid gap-4">
                <Metric label="Collections vs Target" value={`${office.collectionsVsTarget}%`} progress={office.collectionsVsTarget} />
                <Metric label="Promise Recovery" value={`${office.promiseRecovery}%`} progress={office.promiseRecovery} />
                <Metric label="Occupancy" value={`${office.occupancy}%`} progress={office.occupancy} />
                <Metric label="Attendance" value={`${office.attendance}%`} progress={office.attendance} />
                <Metric label="Expense Control" value={`${office.expenseControl}%`} progress={office.expenseControl} />
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
                <Mini label="Collections" value={money(office.collections)} />
                <Mini label="Target" value={money(office.collectionTarget)} />
                <Mini label="Expenses" value={money(office.expenses)} />
                <Mini label="Stored score" value={office.storedScore ? `${office.storedScore}` : "N/A"} />
            </div>
        </section>
    );
}

function Metric({ label, value, progress }: { label: string; value: string; progress: number }) {
    return (
        <div>
            <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-bold text-slate-600">{label}</span>
                <span className="font-black">{value}</span>
            </div>
            <div className="h-3 rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
            </div>
        </div>
    );
}

function Score({ value }: { value: number }) {
    return (
        <div className="flex min-w-40 items-center gap-3">
            <span className="font-black">{value}</span>
            <div className="h-2 flex-1 rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-blue-500" style={{ width: `${value}%` }} />
            </div>
        </div>
    );
}

function Trend({ trend }: { trend: OfficeLeagueRow["trend"] }) {
    const Icon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;
    const tone = trend === "up" ? "text-emerald-700" : trend === "down" ? "text-rose-700" : "text-slate-600";
    return (
        <span className={`inline-flex items-center gap-1 font-bold ${tone}`}>
            <Icon size={16} />
            {trend}
        </span>
    );
}

function Mini({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-1 font-black">{value}</p>
        </div>
    );
}

function statusTone(status: OfficeLeagueRow["status"]) {
    if (status === "excellent" || status === "strong") return "green";
    if (status === "watch") return "orange";
    return "red";
}
