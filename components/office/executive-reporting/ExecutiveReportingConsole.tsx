"use client";

import { useMemo, useState } from "react";
import type { ExecutiveReportingData, OfficeScorecard, TrendPoint } from "@/lib/executive-reporting/types";
import { EnterpriseKpiCard, PageHero, SearchBox, StatusChip } from "@/components/office/shared/EnterpriseUI";

type Props = {
    data: ExecutiveReportingData;
};

function money(value: number) {
    return `UGX ${Math.round(value).toLocaleString()}`;
}

export default function ExecutiveReportingConsole({ data }: Props) {
    const [selectedOfficeId, setSelectedOfficeId] = useState<string>("company");
    const selectedOffice = useMemo(
        () => data.officeScorecards.find((office) => office.officeId === selectedOfficeId) ?? null,
        [data.officeScorecards, selectedOfficeId],
    );
    const [officeSearch, setOfficeSearch] = useState("");
    const viewKpis = selectedOffice ? scorecardToKpis(selectedOffice, data.kpis.totalLandlords) : data.kpis;
    const visibleScorecards = data.officeScorecards.filter((office) => office.officeName.toLowerCase().includes(officeSearch.toLowerCase()));

    return (
        <main className="enterprise-page">
            <div className="enterprise-shell">
                <PageHero
                    title="Executive Reporting"
                    subtitle={`${data.company?.name ?? "No company selected"} · consolidated company performance`}
                    badge="Board Pack"
                >
                    <div className="enterprise-card p-4">
                        <label className="block text-xs font-bold text-slate-500 mb-2">Drill-down</label>
                        <select
                            value={selectedOfficeId}
                            onChange={(event) => setSelectedOfficeId(event.target.value)}
                            className="min-w-72 border rounded-2xl p-3 font-bold"
                        >
                            <option value="company">Company consolidation</option>
                            {data.officeScorecards.map((office) => (
                                <option key={office.officeId} value={office.officeId}>{office.officeName}</option>
                            ))}
                        </select>
                    </div>
                </PageHero>

                <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-5 mb-8">
                    <EnterpriseKpiCard title="Company Collections" value={money(viewKpis.companyCollections)} tone="green" trend="up" trendLabel="vs previous period" progress={viewKpis.collectionRecoveryRate} />
                    <EnterpriseKpiCard title="Company Expenses" value={money(viewKpis.companyExpenses)} tone="red" trend="down" trendLabel="spend control" progress={65} />
                    <EnterpriseKpiCard title="Net Cash Position" value={money(viewKpis.netCashPosition)} tone={viewKpis.netCashPosition >= 0 ? "green" : "red"} trend={viewKpis.netCashPosition >= 0 ? "up" : "down"} trendLabel="cash health" progress={viewKpis.netCashPosition >= 0 ? 86 : 38} />
                    <EnterpriseKpiCard title="Occupancy Rate" value={`${viewKpis.occupancyRate}%`} tone="blue" trend="up" trendLabel="portfolio" progress={viewKpis.occupancyRate} />
                    <EnterpriseKpiCard title="Active Tenants" value={viewKpis.activeTenants.toString()} tone="slate" trend="flat" trendLabel="active leases" progress={80} />
                    <EnterpriseKpiCard title="Outstanding Promises" value={viewKpis.outstandingPromises.toString()} tone="orange" trend="down" trendLabel="open commitments" progress={viewKpis.outstandingPromises ? 62 : 0} />
                    <EnterpriseKpiCard title="Collection Recovery" value={`${viewKpis.collectionRecoveryRate}%`} tone="purple" trend="up" trendLabel="recovery" progress={viewKpis.collectionRecoveryRate} />
                    <EnterpriseKpiCard title="Attendance Rate" value={`${viewKpis.attendanceRate}%`} tone="cyan" trend="up" trendLabel="workforce" progress={viewKpis.attendanceRate} />
                    <EnterpriseKpiCard title="Total Properties" value={viewKpis.totalProperties.toString()} tone="slate" trend="flat" trendLabel="assets" progress={100} />
                    <EnterpriseKpiCard title="Total Landlords" value={viewKpis.totalLandlords.toString()} tone="slate" trend="flat" trendLabel="partners" progress={100} />
                </section>

                <div className="grid grid-cols-1 2xl:grid-cols-12 gap-6 mb-6">
                    <section className="enterprise-panel p-6 2xl:col-span-8">
                        <div className="flex items-center justify-between mb-5">
                            <div>
                                <h2 className="font-bold text-xl">Company Consolidation Centre</h2>
                                <p className="text-sm text-slate-500">Multi-office rollup, company-wide totals, and office comparison</p>
                            </div>
                            <span className="bg-slate-100 rounded-full px-3 py-1 text-sm font-bold">{data.offices.length} offices</span>
                        </div>
                        <div className="mb-4">
                            <SearchBox value={officeSearch} onChange={setOfficeSearch} placeholder="Search offices..." />
                        </div>
                        <OfficeComparison scorecards={visibleScorecards} selectedOfficeId={selectedOfficeId} onSelect={setSelectedOfficeId} />
                    </section>

                    <section className="enterprise-panel p-6 2xl:col-span-4">
                        <h2 className="font-bold text-xl mb-4">Office Performance League</h2>
                        <div className="space-y-3">
                            {data.leagueTable.length === 0 ? (
                                <p className="text-slate-500">No offices available for ranking.</p>
                            ) : data.leagueTable.map((office) => (
                                <button
                                    key={office.officeId}
                                    type="button"
                                    onClick={() => setSelectedOfficeId(office.officeId)}
                                    className={`w-full text-left border rounded-2xl p-4 hover:bg-blue-50 ${selectedOfficeId === office.officeId ? "bg-blue-50 border-blue-200" : ""}`}
                                >
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-3">
                                            <span className="h-9 w-9 rounded-full bg-slate-900 text-white grid place-items-center font-black">{office.rank}</span>
                                            <div>
                                                <p className="font-bold">{office.officeName}</p>
                                                <p className="text-xs text-slate-500">Trend: {trendLabel(office.trend)}</p>
                                            </div>
                                        </div>
                                        <p className="text-2xl font-black">{office.overallScore}</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </section>
                </div>

                <div className="grid grid-cols-1 2xl:grid-cols-3 gap-6 mb-6">
                    <SummaryCard summary={data.summaries.daily} />
                    <SummaryCard summary={data.summaries.weekly} />
                    <SummaryCard summary={data.summaries.monthly} />
                </div>

                <section className="enterprise-panel mb-6 p-6">
                    <div className="flex items-center justify-between mb-5">
                        <div>
                            <h2 className="font-bold text-xl">Trend Analytics</h2>
                            <p className="text-sm text-slate-500">Collections, expenses, occupancy, attendance, and promise recovery over 30 days</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
                        <TrendCard title="Collections Trend" points={data.trends.collections} tone="bg-green-500" format={money} />
                        <TrendCard title="Expenses Trend" points={data.trends.expenses} tone="bg-red-500" format={money} />
                        <TrendCard title="Occupancy Trend" points={data.trends.occupancy} tone="bg-blue-500" suffix="%" />
                        <TrendCard title="Attendance Trend" points={data.trends.attendance} tone="bg-cyan-600" suffix="%" />
                        <TrendCard title="Promise Recovery" points={data.trends.promiseRecovery} tone="bg-purple-500" suffix="%" />
                    </div>
                </section>

                <section className="enterprise-panel p-6">
                    <h2 className="font-bold text-xl mb-4">Office Scorecards</h2>
                    <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-5">
                        {data.officeScorecards.length === 0 ? (
                            <p className="text-slate-500">No office scorecards available.</p>
                        ) : data.officeScorecards.map((office) => (
                            <OfficeScorecardView key={office.officeId} office={office} />
                        ))}
                    </div>
                </section>
            </div>
        </main>
    );
}

function OfficeComparison({
    scorecards,
    selectedOfficeId,
    onSelect,
}: {
    scorecards: OfficeScorecard[];
    selectedOfficeId: string;
    onSelect: (officeId: string) => void;
}) {
    return (
        <div className="overflow-x-auto">
            <table className="enterprise-table">
                <thead>
                    <tr>
                        <th className="text-left p-4">Office</th>
                        <th className="text-left p-4">Collections</th>
                        <th className="text-left p-4">Expenses</th>
                        <th className="text-left p-4">Occupancy</th>
                        <th className="text-left p-4">Attendance</th>
                        <th className="text-left p-4">Promise Recovery</th>
                        <th className="text-left p-4">Score</th>
                    </tr>
                </thead>
                <tbody>
                    {scorecards.length === 0 ? (
                        <tr>
                            <td colSpan={7} className="p-6 text-slate-500">No office data available.</td>
                        </tr>
                    ) : scorecards.map((office) => (
                        <tr
                            key={office.officeId}
                            onClick={() => onSelect(office.officeId)}
                            className={`border-t cursor-pointer hover:bg-blue-50 ${selectedOfficeId === office.officeId ? "bg-blue-50" : ""}`}
                        >
                            <td className="p-4 font-bold">{office.officeName}</td>
                            <td className="p-4">{money(office.collections)}</td>
                            <td className="p-4">{money(office.expenses)}</td>
                            <td className="p-4">{office.occupancyRate}%</td>
                            <td className="p-4">{office.attendanceRate}%</td>
                            <td className="p-4">{office.promiseRecoveryRate}%</td>
                            <td className="p-4 font-black">
                                <div className="flex items-center gap-2">
                                    {office.overallScore}
                                    <StatusChip label={scoreStatus(office.overallScore)} tone={office.overallScore >= 80 ? "green" : office.overallScore >= 60 ? "orange" : "red"} />
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function SummaryCard({ summary }: { summary: ExecutiveReportingData["summaries"]["daily"] }) {
    return (
        <section className="enterprise-panel p-6">
            <p className="text-sm text-slate-500">{summary.period}</p>
            <h2 className="font-bold text-xl mt-1">{summary.title}</h2>
            <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
                <Mini label="Collections" value={money(summary.collections)} />
                <Mini label="Expenses" value={money(summary.expenses)} />
                <Mini label="Occupancy" value={`${summary.occupancyRate}%`} />
                <Mini label="Attendance" value={`${summary.attendanceRate}%`} />
            </div>
            <p className="text-sm text-slate-600 mt-4 leading-6">{summary.narrative}</p>
        </section>
    );
}

function TrendCard({
    title,
    points,
    tone,
    suffix = "",
    format,
}: {
    title: string;
    points: TrendPoint[];
    tone: string;
    suffix?: string;
    format?: (value: number) => string;
}) {
    const max = Math.max(1, ...points.map((point) => point.value));
    const latest = points[points.length - 1]?.value ?? 0;

    return (
        <div className="rounded-3xl border border-slate-200 p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                    <h3 className="font-bold">{title}</h3>
                    <p className="text-xs text-slate-500">Latest {format ? format(latest) : `${latest}${suffix}`}</p>
                </div>
            </div>
            <div className="h-32 flex items-end gap-1">
                {points.map((point) => (
                    <div key={point.date} className="flex-1 flex items-end">
                        <div
                            title={`${point.label}: ${format ? format(point.value) : `${point.value}${suffix}`}`}
                            className={`${tone} rounded-t w-full min-h-1`}
                            style={{ height: `${Math.max(4, (point.value / max) * 100)}%` }}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}

function OfficeScorecardView({ office }: { office: OfficeScorecard }) {
    return (
        <article className="rounded-3xl border border-slate-200 p-5 transition hover:bg-slate-50">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h3 className="font-black text-lg">{office.officeName}</h3>
                    <p className="text-xs text-slate-500">Trend: {trendLabel(office.trend)}</p>
                </div>
                <p className="text-3xl font-black">{office.overallScore}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-5 text-sm">
                <Mini label="Collections" value={money(office.collections)} />
                <Mini label="Expenses" value={money(office.expenses)} />
                <Mini label="Occupancy" value={`${office.occupancyRate}%`} />
                <Mini label="Attendance" value={`${office.attendanceRate}%`} />
                <Mini label="Promise Recovery" value={`${office.promiseRecoveryRate}%`} />
                <Mini label="Net Cash" value={money(office.netCashPosition)} />
            </div>
        </article>
    );
}

function scoreStatus(score: number) {
    if (score >= 80) return "excellent";
    if (score >= 60) return "watch";
    return "risk";
}

function Mini({ label, value }: { label: string; value: string }) {
    return (
        <div className="bg-slate-50 rounded-2xl p-3 min-h-16">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="font-bold mt-1">{value}</p>
        </div>
    );
}

function trendLabel(trend: OfficeScorecard["trend"]) {
    if (trend === "up") return "Improving";
    if (trend === "down") return "Declining";
    return "Stable";
}

function scorecardToKpis(office: OfficeScorecard, totalLandlords: number) {
    return {
        companyCollections: office.collections,
        companyExpenses: office.expenses,
        netCashPosition: office.netCashPosition,
        occupancyRate: office.occupancyRate,
        activeTenants: office.activeTenants,
        outstandingPromises: office.outstandingPromises,
        collectionRecoveryRate: office.collectionRecoveryRate,
        attendanceRate: office.attendanceRate,
        totalProperties: office.totalProperties,
        totalLandlords,
    };
}
