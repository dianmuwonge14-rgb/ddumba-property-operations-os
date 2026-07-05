"use client";

import { ArrowDownRight, ArrowUpRight, Bot, BrainCircuit, Minus, Sparkles, Target } from "lucide-react";
import { EnterpriseKpiCard, EmptyState, PageHero, StatusChip } from "@/components/office/shared/EnterpriseUI";
import type { AiIntelligenceData, Severity, Trend } from "@/lib/ai-intelligence/types";

type Props = {
    data: AiIntelligenceData;
};

function money(value: number) {
    return `UGX ${Math.round(value).toLocaleString()}`;
}

export default function AiIntelligenceCentre({ data }: Props) {
    const topRisk = data.risks[0];
    const avgHealth = data.offices.length ? Math.round(data.offices.reduce((sum, office) => sum + office.healthScore, 0) / data.offices.length) : 0;
    const criticalRisks = data.risks.filter((risk) => risk.severity === "critical" || risk.severity === "high").length;

    return (
        <main className="enterprise-page">
            <div className="enterprise-shell">
                <PageHero
                    title="AI Intelligence Centre"
                    subtitle={`${data.company?.name ?? "Company"} · operational risk, forecasting, tenant signals, landlord intelligence, and executive recommendations`}
                    badge="Ddumba Intelligence"
                >
                    <div className="rounded-3xl bg-slate-950 p-5 text-white shadow-xl">
                        <div className="flex items-center gap-3">
                            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-500">
                                <BrainCircuit size={24} />
                            </span>
                            <div>
                                <p className="text-sm text-slate-300">AI Operating Mode</p>
                                <p className="text-xl font-black">Executive Copilot</p>
                            </div>
                        </div>
                    </div>
                </PageHero>

                <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5">
                    <EnterpriseKpiCard title="AI Risk Score" value={`${topRisk?.riskScore ?? 0}`} tone={criticalRisks ? "red" : "green"} trend={topRisk?.trend ?? "flat"} trendLabel={topRisk?.officeName ?? "No active risks"} progress={topRisk?.riskScore ?? 0} status={criticalRisks ? "Risk" : "Stable"} />
                    <EnterpriseKpiCard title="Office Health" value={`${avgHealth}%`} tone="blue" trend="up" trendLabel="average health" progress={avgHealth} />
                    <EnterpriseKpiCard title="Collection Forecast" value={money(data.collection.collectionForecast)} tone="green" trend="up" trendLabel="month-end model" progress={78} />
                    <EnterpriseKpiCard title="Likely Recovery" value={money(data.collection.likelyRecoveryAmount)} tone="purple" trend="up" trendLabel="promise pipeline" progress={65} />
                    <EnterpriseKpiCard title="Vacancy Opportunity" value={data.tenant.vacantRoomOpportunities.length.toString()} tone="orange" trend="flat" trendLabel="rooms to convert" progress={data.tenant.vacantRoomOpportunities.length ? 55 : 0} />
                </section>

                <section className="mt-6 grid grid-cols-1 gap-6 2xl:grid-cols-12">
                    <div className="2xl:col-span-8">
                        <ExecutiveRiskCentre data={data} />
                    </div>
                    <div className="space-y-6 2xl:col-span-4">
                        <AiCommandFeed data={data} />
                        <ExecutiveRecommendations data={data} />
                    </div>
                </section>

                <section className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
                    <CollectionIntelligence data={data} />
                    <TenantIntelligence data={data} />
                    <LandlordIntelligence data={data} />
                </section>

                <section className="mt-6 grid grid-cols-1 gap-6 2xl:grid-cols-12">
                    <div className="2xl:col-span-8">
                        <OfficeIntelligence data={data} />
                    </div>
                    <div className="2xl:col-span-4">
                        <StoredInsights data={data} />
                    </div>
                </section>
            </div>
        </main>
    );
}

function ExecutiveRiskCentre({ data }: Props) {
    return (
        <section className="enterprise-panel overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-slate-200 p-6 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h2 className="text-xl font-black">Executive Risk Centre</h2>
                    <p className="text-sm text-slate-500">Ranked by target gaps, balances, absenteeism, expenses, occupancy, and promise failure risk.</p>
                </div>
                <StatusChip label={`${data.risks.length} signals`} tone={data.risks.length ? "orange" : "green"} />
            </div>
            <div className="overflow-x-auto">
                <table className="enterprise-table">
                    <thead>
                        <tr>
                            <th className="text-left">Risk</th>
                            <th className="text-left">Office</th>
                            <th className="text-left">Score</th>
                            <th className="text-left">Severity</th>
                            <th className="text-left">Trend</th>
                            <th className="text-left">Recommended Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.risks.length === 0 ? (
                            <tr><td colSpan={6} className="p-6"><EmptyState title="No major risks detected" description="The AI risk engine did not find high-priority operational issues in the current data window." /></td></tr>
                        ) : data.risks.map((risk) => (
                            <tr key={risk.id}>
                                <td><p className="font-black">{risk.title}</p></td>
                                <td>{risk.officeName}</td>
                                <td><Score value={risk.riskScore} tone={risk.riskScore >= 60 ? "red" : "orange"} /></td>
                                <td><StatusChip label={risk.severity} tone={severityTone(risk.severity)} /></td>
                                <td><TrendBadge trend={risk.trend} /></td>
                                <td className="max-w-md text-slate-600">{risk.recommendedAction}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

function CollectionIntelligence({ data }: Props) {
    return (
        <section className="enterprise-panel p-6">
            <SectionTitle title="Collection Intelligence" subtitle="Forecasting and target-miss detection" />
            <div className="mt-5 grid gap-3">
                <Mini label="End-of-month projection" value={money(data.collection.endOfMonthProjection)} />
                <Mini label="Likely recovery amount" value={money(data.collection.likelyRecoveryAmount)} />
                <Mini label="Offices likely to miss target" value={data.collection.officesLikelyToMissTargets.length.toString()} />
            </div>
            <List title="Target miss watchlist" items={data.collection.officesLikelyToMissTargets.map((office) => `${office.officeName}: ${office.targetAchievement}% of target`)} />
            <List title="Best collectors" items={data.collection.bestCollectors.map((collector) => `${collector.collectorName}: ${money(collector.collectionValue)}`)} />
        </section>
    );
}

function TenantIntelligence({ data }: Props) {
    return (
        <section className="enterprise-panel p-6">
            <SectionTitle title="Tenant Intelligence" subtitle="Default, balance, value, and vacancy signals" />
            <List title="Likely defaults" items={data.tenant.likelyDefaults.map((tenant) => `${tenant.tenantName}: risk ${tenant.riskScore}, balance ${money(tenant.balance)}`)} />
            <List title="Long outstanding balances" items={data.tenant.longOutstandingBalances.map((tenant) => `${tenant.tenantName}: ${money(tenant.balance)} · ${tenant.daysOutstanding} days`)} />
            <List title="High-value tenants" items={data.tenant.highValueTenants.map((tenant) => `${tenant.tenantName}: ${money(tenant.monthlyRent)} rent`)} />
            <List title="Vacant room opportunities" items={data.tenant.vacantRoomOpportunities.map((room) => `${room.officeName} · ${room.roomNumber}: ${money(room.monthlyRent)}`)} />
        </section>
    );
}

function LandlordIntelligence({ data }: Props) {
    return (
        <section className="enterprise-panel p-6">
            <SectionTitle title="Landlord Intelligence" subtitle="Settlement, revenue, and relationship attention" />
            <List title="Settlement due alerts" items={data.landlord.settlementDueAlerts.map((landlord) => `${landlord.landlordName}: ${money(landlord.balance)}`)} />
            <List title="Highest revenue landlords" items={data.landlord.highestRevenueLandlords.map((landlord) => `${landlord.landlordName}: ${money(landlord.revenue)} · ${landlord.properties} properties`)} />
            <List title="Declining performance" items={data.landlord.decliningPerformance.map((landlord) => `${landlord.landlordName}: ${landlord.signal}`)} />
            <List title="Requires attention" items={data.landlord.requiringAttention.map((landlord) => `${landlord.landlordName}: ${landlord.reason}`)} />
        </section>
    );
}

function OfficeIntelligence({ data }: Props) {
    return (
        <section className="enterprise-panel overflow-hidden">
            <div className="border-b border-slate-200 p-6">
                <SectionTitle title="Office Intelligence" subtitle="Health, performance, risk, growth, and trend scoring" />
            </div>
            <div className="overflow-x-auto">
                <table className="enterprise-table">
                    <thead>
                        <tr>
                            <th className="text-left">Office</th>
                            <th className="text-left">Health</th>
                            <th className="text-left">Performance</th>
                            <th className="text-left">Risk</th>
                            <th className="text-left">Growth</th>
                            <th className="text-left">Trend</th>
                            <th className="text-left">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.offices.length === 0 ? (
                            <tr><td colSpan={7} className="p-6 text-slate-500">No office intelligence available.</td></tr>
                        ) : data.offices.map((office) => (
                            <tr key={office.officeId}>
                                <td><p className="font-black">{office.officeName}</p></td>
                                <td><Score value={office.healthScore} tone="blue" /></td>
                                <td>{office.performanceScore}%</td>
                                <td>{office.riskScore}%</td>
                                <td>{office.growthScore}%</td>
                                <td>{office.trendScore}%</td>
                                <td><StatusChip label={office.status} tone={office.status === "excellent" || office.status === "strong" ? "green" : office.status === "watch" ? "orange" : "red"} /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

function AiCommandFeed({ data }: Props) {
    return (
        <section className="rounded-3xl bg-slate-950 p-6 text-white shadow-xl">
            <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-500"><Bot size={22} /></span>
                <div>
                    <h2 className="text-xl font-black">AI Command Feed</h2>
                    <p className="text-sm text-slate-300">Live operational intelligence stream</p>
                </div>
            </div>
            <div className="mt-5 space-y-3">
                {data.commandFeed.length === 0 ? (
                    <div className="rounded-2xl bg-white/10 p-4 text-slate-300">No command feed items available.</div>
                ) : data.commandFeed.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-white/10 bg-white/10 p-4">
                        <div className="flex items-start gap-3">
                            <Sparkles className="mt-0.5 text-blue-300" size={18} />
                            <div>
                                <p className="font-bold">{item.message}</p>
                                <p className="mt-1 text-xs text-slate-300">{item.severity} · trend {item.trend}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}

function ExecutiveRecommendations({ data }: Props) {
    return (
        <section className="enterprise-panel p-6">
            <SectionTitle title="Executive Recommendations" subtitle="AI-generated action cards" />
            <div className="mt-4 space-y-3">
                {data.recommendations.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-slate-200 p-4 hover:bg-slate-50">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="font-black">{item.title}</p>
                                <p className="mt-1 text-sm text-slate-500">{item.description}</p>
                            </div>
                            <StatusChip label={item.priority} tone={severityTone(item.priority)} />
                        </div>
                        <p className="mt-3 text-sm font-bold text-slate-700">{item.action}</p>
                    </div>
                ))}
            </div>
        </section>
    );
}

function StoredInsights({ data }: Props) {
    return (
        <section className="enterprise-panel p-6">
            <SectionTitle title="Stored AI Signals" subtitle="Persisted insights and data-quality findings" />
            <div className="mt-4 space-y-3">
                {data.storedInsights.length === 0 && data.dataQualityFindings.length === 0 ? (
                    <EmptyState title="No stored AI signals" description="Live intelligence is active; persisted AI insight records will appear here when generated." />
                ) : (
                    <>
                        {data.storedInsights.slice(0, 5).map((insight) => (
                            <div key={insight.id} className="rounded-2xl border border-slate-200 p-4">
                                <p className="font-black">{insight.title ?? insight.summary ?? "AI insight"}</p>
                                <p className="mt-1 text-sm text-slate-500">{insight.description ?? insight.insight_type ?? "No description"}</p>
                            </div>
                        ))}
                        {data.dataQualityFindings.slice(0, 5).map((finding) => (
                            <div key={finding.id} className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                                <p className="font-black">Data quality: {finding.entity_type}</p>
                                <p className="mt-1 text-sm text-amber-800">{finding.severity} · {finding.status}</p>
                            </div>
                        ))}
                    </>
                )}
            </div>
        </section>
    );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
    return (
        <div>
            <h2 className="text-xl font-black">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
    );
}

function List({ title, items }: { title: string; items: string[] }) {
    return (
        <div className="mt-5">
            <p className="text-sm font-black text-slate-700">{title}</p>
            <div className="mt-2 space-y-2">
                {items.length === 0 ? (
                    <p className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-500">No signals detected.</p>
                ) : items.slice(0, 5).map((item) => (
                    <p key={item} className="rounded-2xl bg-slate-50 p-3 text-sm font-semibold text-slate-700">{item}</p>
                ))}
            </div>
        </div>
    );
}

function Mini({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-1 font-black">{value}</p>
        </div>
    );
}

function Score({ value, tone = "blue" }: { value: number; tone?: "blue" | "orange" | "red" }) {
    const color = tone === "red" ? "bg-rose-500" : tone === "orange" ? "bg-amber-500" : "bg-blue-500";
    return (
        <div className="flex min-w-36 items-center gap-3">
            <span className="font-black">{value}</span>
            <div className="h-2 flex-1 rounded-full bg-slate-100">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
            </div>
        </div>
    );
}

function TrendBadge({ trend }: { trend: Trend }) {
    const Icon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;
    const tone = trend === "up" ? "text-emerald-700" : trend === "down" ? "text-rose-700" : "text-slate-600";
    return <span className={`inline-flex items-center gap-1 font-bold ${tone}`}><Icon size={16} />{trend}</span>;
}

function severityTone(severity: Severity) {
    if (severity === "critical" || severity === "high") return "red";
    if (severity === "medium") return "orange";
    return "green";
}
