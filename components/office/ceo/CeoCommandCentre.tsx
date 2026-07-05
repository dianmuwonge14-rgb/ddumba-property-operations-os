import { AlertTriangle, ArrowDownRight, ArrowUpRight, Banknote, BarChart3, BriefcaseBusiness, Building2, Crown, Gauge, Landmark, LineChart, Radar, ShieldAlert, Sparkles, Target, TrendingUp, UsersRound, Zap } from "lucide-react";
import { EmptyState, EnterpriseKpiCard, PageHero, StatusChip } from "@/components/office/shared/EnterpriseUI";
import type { CashPosition, CeoCommandData, CeoSeverity, CeoTrend, ExecutiveAction, ForecastPoint, GrowthCentre, IntelligenceFeedItem, OfficeWarRoomRow, RiskHeatMapItem } from "@/lib/ceo-centre/types";

type Props = {
    data: CeoCommandData;
};

function money(value: number) {
    return `UGX ${Math.round(value).toLocaleString()}`;
}

function formatDate(value: string) {
    return new Intl.DateTimeFormat("en-UG", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Africa/Kampala",
    }).format(new Date(value));
}

export default function CeoCommandCentre({ data }: Props) {
    return (
        <main className="enterprise-page">
            <div className="enterprise-shell">
                <PageHero
                    title="CEO Command Centre"
                    subtitle={`${data.company?.name ?? "Company"} · company-wide control room for cash, growth, risk, intelligence, forecasts, office performance, and executive action`}
                    badge="CEO Control Room"
                >
                    <div className="rounded-[2rem] bg-slate-950 p-6 text-white shadow-2xl">
                        <div className="flex items-center gap-4">
                            <span className="grid h-14 w-14 place-items-center rounded-3xl bg-amber-400 text-slate-950">
                                <Crown size={28} />
                            </span>
                            <div>
                                <p className="text-sm text-slate-300">Executive Readiness</p>
                                <p className="text-4xl font-black">{data.overview.executiveReadinessScore}%</p>
                            </div>
                        </div>
                        <div className="mt-5 h-3 rounded-full bg-white/10">
                            <div className="h-full rounded-full bg-amber-300" style={{ width: `${data.overview.executiveReadinessScore}%` }} />
                        </div>
                    </div>
                </PageHero>

                <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5">
                    <EnterpriseKpiCard title="Company Score" value={`${data.overview.companyScore}%`} tone={scoreTone(data.overview.companyScore)} trend={trendForScore(data.overview.companyScore)} trendLabel="composite" progress={data.overview.companyScore} />
                    <EnterpriseKpiCard title="Company Health" value={`${data.overview.companyHealth}%`} tone={scoreTone(data.overview.companyHealth)} trend={trendForScore(data.overview.companyHealth)} trendLabel="operating health" progress={data.overview.companyHealth} />
                    <EnterpriseKpiCard title="Risk Score" value={`${data.overview.riskScore}%`} tone={data.overview.riskScore >= 60 ? "red" : data.overview.riskScore >= 35 ? "orange" : "green"} trend={data.overview.riskScore >= 50 ? "down" : "up"} trendLabel="lower is better" progress={data.overview.riskScore} status={data.overview.riskScore >= 60 ? "Critical" : "Watch"} />
                    <EnterpriseKpiCard title="Growth Score" value={`${data.overview.growthScore}%`} tone={scoreTone(data.overview.growthScore)} trend="up" trendLabel="trajectory" progress={data.overview.growthScore} />
                    <EnterpriseKpiCard title="Executive Readiness" value={`${data.overview.executiveReadinessScore}%`} tone={scoreTone(data.overview.executiveReadinessScore)} trend={trendForScore(data.overview.executiveReadinessScore)} trendLabel="board-ready" progress={data.overview.executiveReadinessScore} />
                </section>

                <section className="mt-6 grid grid-cols-1 gap-6 2xl:grid-cols-12">
                    <div className="2xl:col-span-7">
                        <CashPositionCentre cash={data.cash} />
                    </div>
                    <div className="2xl:col-span-5">
                        <GrowthCentrePanel growth={data.growth} />
                    </div>
                </section>

                <section className="mt-6 grid grid-cols-1 gap-6 2xl:grid-cols-12">
                    <div className="2xl:col-span-8">
                        <OfficePerformanceWarRoom offices={data.offices} />
                    </div>
                    <div className="space-y-6 2xl:col-span-4">
                        <CompanyLeagueTable data={data} />
                        <ExecutiveActionCentre actions={data.actions} />
                    </div>
                </section>

                <section className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
                    <RiskHeatMap risks={data.risks} />
                    <ExecutiveIntelligenceFeed feed={data.intelligence} />
                </section>

                <section className="mt-6 grid grid-cols-1 gap-6 2xl:grid-cols-12">
                    <div className="2xl:col-span-7">
                        <CompanyForecastEngine data={data} />
                    </div>
                    <div className="2xl:col-span-5">
                        <CeoDailyBriefing data={data} />
                    </div>
                </section>
            </div>
        </main>
    );
}

function CashPositionCentre({ cash }: { cash: CashPosition }) {
    return (
        <section className="rounded-[2rem] bg-slate-950 p-6 text-white shadow-2xl">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-3">
                    <span className="grid h-12 w-12 place-items-center rounded-3xl bg-emerald-400 text-slate-950"><Banknote size={24} /></span>
                    <div>
                        <h2 className="text-2xl font-black">Company Cash Position Centre</h2>
                        <p className="text-sm text-slate-300">Collections, expenses, net cash, available cash, and forecast cash position.</p>
                    </div>
                </div>
                <StatusChip label={cash.netCashPosition >= 0 ? "cash positive" : "cash pressure"} tone={cash.netCashPosition >= 0 ? "green" : "red"} />
            </div>
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <DarkMetric label="Today's Collections" value={money(cash.todayCollections)} />
                <DarkMetric label="Monthly Collections" value={money(cash.monthlyCollections)} />
                <DarkMetric label="Expenses" value={money(cash.expenses)} />
                <DarkMetric label="Net Position" value={money(cash.netCashPosition)} />
                <DarkMetric label="Available Cash" value={money(cash.availableCash)} />
                <DarkMetric label="Forecast Cash" value={money(cash.forecastCashPosition)} />
            </div>
        </section>
    );
}

function GrowthCentrePanel({ growth }: { growth: GrowthCentre }) {
    const items = [
        { label: "Occupancy Growth", value: growth.occupancyGrowth, icon: Building2 },
        { label: "Tenant Growth", value: growth.tenantGrowth, icon: UsersRound },
        { label: "Collection Growth", value: growth.collectionGrowth, icon: TrendingUp },
        { label: "Office Growth", value: growth.officeGrowth, icon: Landmark },
        { label: "Revenue Growth", value: growth.revenueGrowth, icon: BarChart3 },
    ];
    return (
        <section className="enterprise-panel p-6">
            <PanelTitle icon={<TrendingUp size={21} />} title="Company Growth Centre" description="Occupancy, tenant, collection, office, and revenue growth." />
            <div className="mt-6 grid gap-4">
                {items.map((item) => {
                    const Icon = item.icon;
                    return (
                        <div key={item.label} className="rounded-3xl border border-slate-200 p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <span className="grid h-10 w-10 place-items-center rounded-2xl bg-blue-50 text-blue-700"><Icon size={18} /></span>
                                    <p className="font-black">{item.label}</p>
                                </div>
                                <TrendValue value={item.value} />
                            </div>
                            <div className="mt-3 h-2 rounded-full bg-slate-100">
                                <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.max(0, Math.min(100, item.value))}%` }} />
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

function OfficePerformanceWarRoom({ offices }: { offices: OfficeWarRoomRow[] }) {
    return (
        <section className="enterprise-panel overflow-hidden">
            <div className="border-b border-slate-200 p-6">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <PanelTitle icon={<Target size={21} />} title="Office Performance War Room" description="Ranked by collections, occupancy, promise recovery, attendance, and expense control." />
                    <StatusChip label={`${offices.length} offices`} tone="blue" />
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="enterprise-table">
                    <thead>
                        <tr>
                            <th className="text-left">Rank</th>
                            <th className="text-left">Office</th>
                            <th className="text-left">Score</th>
                            <th className="text-left">Collections</th>
                            <th className="text-left">Occupancy</th>
                            <th className="text-left">Promises</th>
                            <th className="text-left">Attendance</th>
                            <th className="text-left">Expense Control</th>
                            <th className="text-left">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {offices.length === 0 ? (
                            <tr><td colSpan={9} className="p-6"><EmptyState title="No offices available" description="CEO office ranking appears once office data is available." /></td></tr>
                        ) : offices.map((office) => (
                            <tr key={office.officeId}>
                                <td><span className="grid h-9 w-9 place-items-center rounded-2xl bg-slate-950 text-sm font-black text-white">#{office.rank}</span></td>
                                <td><p className="font-black">{office.officeName}</p><p className="text-xs text-slate-500">{money(office.netPosition)} net</p></td>
                                <td><ScoreBar value={office.score} /></td>
                                <td>{office.collectionPerformance}%</td>
                                <td>{office.occupancy}%</td>
                                <td>{office.promiseRecovery}%</td>
                                <td>{office.attendance}%</td>
                                <td>{office.expenseControl}%</td>
                                <td><StatusChip label={office.status} tone={statusTone(office.status)} /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

function RiskHeatMap({ risks }: { risks: RiskHeatMapItem[] }) {
    return (
        <section className="enterprise-panel p-6">
            <PanelTitle icon={<Radar size={21} />} title="Risk Heat Map" description="High-risk offices, properties, tenants, landlords, and employees." />
            <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
                {risks.length === 0 ? (
                    <div className="md:col-span-2"><EmptyState title="No major risks detected" description="The company-wide risk map is clean in the current window." /></div>
                ) : risks.slice(0, 14).map((risk) => (
                    <article key={risk.id} className="rounded-3xl border border-slate-200 p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="font-black">{risk.label}</p>
                                <p className="mt-1 text-sm text-slate-500">{risk.category} · {risk.signal}</p>
                            </div>
                            <StatusChip label={risk.severity} tone={severityTone(risk.severity)} />
                        </div>
                        <div className="mt-4 h-3 rounded-full bg-slate-100">
                            <div className={`h-full rounded-full ${riskBar(risk.riskScore)}`} style={{ width: `${risk.riskScore}%` }} />
                        </div>
                    </article>
                ))}
            </div>
        </section>
    );
}

function ExecutiveIntelligenceFeed({ feed }: { feed: IntelligenceFeedItem[] }) {
    return (
        <section className="rounded-[2rem] bg-slate-950 p-6 text-white shadow-2xl">
            <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-3xl bg-violet-400 text-slate-950"><Sparkles size={24} /></span>
                <div>
                    <h2 className="text-2xl font-black">Executive Intelligence Feed</h2>
                    <p className="text-sm text-slate-300">Critical alerts, AI findings, automation, audit, and security alerts.</p>
                </div>
            </div>
            <div className="mt-6 grid gap-3">
                {feed.length === 0 ? (
                    <div className="rounded-3xl bg-white/10 p-6 text-sm text-slate-300">No executive intelligence signals in the current window.</div>
                ) : feed.slice(0, 12).map((item) => (
                    <article key={item.id} className="rounded-3xl bg-white/10 p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="font-black">{item.title}</p>
                                <p className="mt-1 text-sm text-slate-300">{item.message}</p>
                            </div>
                            <span className={`rounded-full px-3 py-1 text-xs font-black ${darkSeverity(item.severity)}`}>{item.source}</span>
                        </div>
                        <p className="mt-3 text-xs font-bold uppercase text-slate-400">{formatDate(item.createdAt)}</p>
                    </article>
                ))}
            </div>
        </section>
    );
}

function CompanyForecastEngine({ data }: Props) {
    return (
        <section className="enterprise-panel p-6">
            <PanelTitle icon={<LineChart size={21} />} title="Company Forecast Engine" description="Forecast collections, occupancy, cash flow, revenue, and risk trends." />
            <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
                <ForecastCard title="Collections" points={data.forecast.collections} moneyValues />
                <ForecastCard title="Occupancy" points={data.forecast.occupancy} />
                <ForecastCard title="Cash Flow" points={data.forecast.cashFlow} moneyValues />
                <ForecastCard title="Revenue" points={data.forecast.revenue} moneyValues />
                <ForecastCard title="Risk Trend" points={data.forecast.riskTrend} inverse />
            </div>
        </section>
    );
}

function ForecastCard({ title, points, moneyValues = false, inverse = false }: { title: string; points: ForecastPoint[]; moneyValues?: boolean; inverse?: boolean }) {
    const max = Math.max(...points.map((point) => Math.abs(point.value)), 1);
    return (
        <article className="rounded-3xl border border-slate-200 p-5">
            <div className="flex items-center justify-between">
                <p className="font-black">{title}</p>
                <StatusChip label="6 weeks" tone="cyan" />
            </div>
            <div className="mt-5 flex h-36 items-end gap-2">
                {points.map((point) => {
                    const height = Math.max(8, Math.round((Math.abs(point.value) / max) * 100));
                    return (
                        <div key={point.label} className="flex flex-1 flex-col items-center gap-2">
                            <div className={`w-full rounded-t-xl ${inverse ? "bg-rose-500" : point.value < 0 ? "bg-amber-500" : "bg-blue-500"}`} style={{ height: `${height}%` }} />
                            <span className="text-xs font-bold text-slate-400">{point.label}</span>
                        </div>
                    );
                })}
            </div>
            <p className="mt-3 text-sm font-black text-slate-700">{moneyValues ? money(points[points.length - 1]?.value ?? 0) : `${points[points.length - 1]?.value ?? 0}%`} projected</p>
        </article>
    );
}

function ExecutiveActionCentre({ actions }: { actions: ExecutiveAction[] }) {
    return (
        <section className="enterprise-panel p-6">
            <PanelTitle icon={<Zap size={21} />} title="Executive Action Centre" description="Immediate actions, escalations, overdue promises, attendance issues, and cash shortages." />
            <div className="mt-5 grid gap-3">
                {actions.length === 0 ? (
                    <EmptyState title="No immediate CEO actions" description="The action queue is clear for the current operating window." />
                ) : actions.slice(0, 8).map((action) => (
                    <article key={action.id} className="rounded-3xl border border-slate-200 p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="font-black">{action.title}</p>
                                <p className="mt-1 text-sm text-slate-500">{action.description}</p>
                            </div>
                            <StatusChip label={action.severity} tone={severityTone(action.severity)} />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-500">
                            <span className="rounded-full bg-slate-100 px-3 py-1">Owner: {action.owner}</span>
                            <span className="rounded-full bg-slate-100 px-3 py-1">Due: {action.due}</span>
                        </div>
                    </article>
                ))}
            </div>
        </section>
    );
}

function CompanyLeagueTable({ data }: Props) {
    const rows = [
        ["Best office", data.league.bestOffice],
        ["Worst office", data.league.worstOffice],
        ["Fastest improving", data.league.fastestImprovingOffice],
        ["Most efficient", data.league.mostEfficientOffice],
        ["Most profitable", data.league.mostProfitableOffice],
    ] as const;
    return (
        <section className="enterprise-panel p-6">
            <PanelTitle icon={<BriefcaseBusiness size={21} />} title="Company League Table" description="Best, worst, fastest improving, most efficient, and most profitable offices." />
            <div className="mt-5 grid gap-3">
                {rows.map(([label, office]) => (
                    <div key={label} className="flex items-center justify-between gap-4 rounded-3xl border border-slate-200 p-4">
                        <div>
                            <p className="text-xs font-black uppercase text-slate-400">{label}</p>
                            <p className="mt-1 font-black">{office?.officeName ?? "Not available"}</p>
                        </div>
                        {office ? <StatusChip label={`${office.score}%`} tone={scoreTone(office.score)} /> : <StatusChip label="pending" tone="slate" />}
                    </div>
                ))}
            </div>
        </section>
    );
}

function CeoDailyBriefing({ data }: Props) {
    const sections = [
        ["What happened today", data.briefing.happenedToday],
        ["What needs attention", data.briefing.needsAttention],
        ["Biggest risks", data.briefing.biggestRisks],
        ["Biggest opportunities", data.briefing.biggestOpportunities],
        ["Recommended actions", data.briefing.recommendedActions],
    ] as const;
    return (
        <section className="rounded-[2rem] bg-slate-950 p-6 text-white shadow-2xl">
            <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-3xl bg-amber-300 text-slate-950"><Crown size={24} /></span>
                <div>
                    <h2 className="text-2xl font-black">CEO Daily Briefing</h2>
                    <p className="text-sm text-slate-300">What happened, what needs attention, risks, opportunities, and actions.</p>
                </div>
            </div>
            <div className="mt-6 grid gap-4">
                {sections.map(([title, items]) => (
                    <div key={title} className="rounded-3xl bg-white/10 p-4">
                        <p className="font-black">{title}</p>
                        <ul className="mt-3 space-y-2 text-sm text-slate-300">
                            {items.length === 0 ? <li>No briefing items generated.</li> : items.map((item) => <li key={item}>• {item}</li>)}
                        </ul>
                    </div>
                ))}
            </div>
        </section>
    );
}

function PanelTitle({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
    return (
        <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-700">{icon}</span>
            <div>
                <h2 className="text-xl font-black">{title}</h2>
                <p className="text-sm text-slate-500">{description}</p>
            </div>
        </div>
    );
}

function ScoreBar({ value }: { value: number }) {
    return (
        <div className="min-w-36">
            <div className="flex items-center justify-between text-xs font-black text-slate-500">
                <span>{value}%</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-blue-500" style={{ width: `${value}%` }} />
            </div>
        </div>
    );
}

function TrendValue({ value }: { value: number }) {
    const positive = value >= 0;
    const Icon = positive ? ArrowUpRight : ArrowDownRight;
    return (
        <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-black ${positive ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
            <Icon size={16} />
            {value}%
        </span>
    );
}

function DarkMetric({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-3xl bg-white/10 p-4">
            <p className="text-xs font-bold uppercase text-slate-400">{label}</p>
            <p className="mt-2 text-xl font-black">{value}</p>
        </div>
    );
}

function scoreTone(score: number) {
    if (score >= 85) return "green";
    if (score >= 65) return "blue";
    if (score >= 45) return "orange";
    return "red";
}

function trendForScore(score: number) {
    return score >= 70 ? "up" : score >= 50 ? "flat" : "down";
}

function statusTone(status: OfficeWarRoomRow["status"]) {
    if (status === "elite") return "green";
    if (status === "strong") return "blue";
    if (status === "watch") return "orange";
    return "red";
}

function severityTone(severity: CeoSeverity) {
    if (severity === "critical") return "red";
    if (severity === "high") return "orange";
    if (severity === "medium") return "blue";
    if (severity === "low") return "slate";
    return "green";
}

function darkSeverity(severity: CeoSeverity) {
    if (severity === "critical") return "bg-rose-100 text-rose-700";
    if (severity === "high") return "bg-amber-100 text-amber-800";
    if (severity === "medium") return "bg-blue-100 text-blue-700";
    if (severity === "low") return "bg-slate-100 text-slate-700";
    return "bg-emerald-100 text-emerald-700";
}

function riskBar(score: number) {
    if (score >= 75) return "bg-rose-500";
    if (score >= 50) return "bg-amber-500";
    if (score >= 25) return "bg-blue-500";
    return "bg-emerald-500";
}
