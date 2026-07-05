import Link from "next/link";
import { BadgeCheck, BarChart3, ClipboardCheck, Database, Download, FileSpreadsheet, LockKeyhole, MonitorCheck, Rocket, Route, ShieldCheck, Smartphone, Sparkles, Zap } from "lucide-react";
import { EmptyState, EnterpriseKpiCard, PageHero, StatusChip } from "@/components/office/shared/EnterpriseUI";
import type { ExportReadinessItem, LaunchReadinessData, LaunchStatus, LaunchTone, ProductionHealth, QualityScores, RouteGovernanceRow, ShowcaseScreen } from "@/lib/launch-readiness/types";

type Props = {
    data: LaunchReadinessData;
};

export default function LaunchReadinessCentre({ data }: Props) {
    return (
        <main className="enterprise-page">
            <div className="enterprise-shell">
                <PageHero
                    title="Enterprise Launch Hardening"
                    subtitle={`${data.company?.name ?? "Company"} · production health, route governance, export readiness, deployment checklist, quality review, and full platform showcase`}
                    badge="Launch Control"
                >
                    <div className="rounded-3xl bg-slate-950 p-6 text-white shadow-2xl">
                        <div className="flex items-center gap-4">
                            <span className="grid h-14 w-14 place-items-center rounded-3xl bg-emerald-400 text-slate-950">
                                <Rocket size={28} />
                            </span>
                            <div>
                                <p className="text-sm text-slate-300">Deployment Readiness</p>
                                <p className="text-4xl font-black">{data.quality.deploymentReadiness}%</p>
                            </div>
                        </div>
                    </div>
                </PageHero>

                <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-6">
                    <EnterpriseKpiCard title="UI Quality" value={`${data.quality.uiQuality}%`} tone="green" trend="up" trendLabel="enterprise standard" progress={data.quality.uiQuality} />
                    <EnterpriseKpiCard title="Security Readiness" value={`${data.quality.securityReadiness}%`} tone={scoreTone(data.quality.securityReadiness)} trend="flat" trendLabel="governance" progress={data.quality.securityReadiness} />
                    <EnterpriseKpiCard title="Automation Readiness" value={`${data.quality.automationReadiness}%`} tone={scoreTone(data.quality.automationReadiness)} trend="flat" trendLabel="engine" progress={data.quality.automationReadiness} />
                    <EnterpriseKpiCard title="Audit Readiness" value={`${data.quality.auditReadiness}%`} tone={scoreTone(data.quality.auditReadiness)} trend="up" trendLabel="traceability" progress={data.quality.auditReadiness} />
                    <EnterpriseKpiCard title="CEO Readiness" value={`${data.quality.ceoReadiness}%`} tone="green" trend="up" trendLabel="executive" progress={data.quality.ceoReadiness} />
                    <EnterpriseKpiCard title="Deployment" value={`${data.quality.deploymentReadiness}%`} tone={scoreTone(data.quality.deploymentReadiness)} trend="up" trendLabel="launch" progress={data.quality.deploymentReadiness} />
                </section>

                <section className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
                    <ProductionHealthDashboard health={data.health} />
                    <DeploymentReadinessChecklist data={data} />
                </section>

                <section className="mt-6">
                    <RouteAccessGovernance rows={data.routeGovernance} />
                </section>

                <section className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
                    <ExportCentre exports={data.exports} />
                    <EnterpriseQualityReview quality={data.quality} />
                </section>

                <section className="mt-6">
                    <VisualShowcase screens={data.completedModules} />
                </section>
            </div>
        </main>
    );
}

function ProductionHealthDashboard({ health }: { health: ProductionHealth }) {
    const items = [
        { label: "Database Health", value: health.databaseHealth, icon: Database },
        { label: "Route Health", value: health.routeHealth, icon: Route },
        { label: "Automation Health", value: health.automationHealth, icon: Zap },
        { label: "Security Health", value: health.securityHealth, icon: LockKeyhole },
        { label: "Audit Health", value: health.auditHealth, icon: ClipboardCheck },
    ];
    return (
        <section className="enterprise-panel p-6">
            <PanelTitle icon={<MonitorCheck size={21} />} title="Production Health Dashboard" description="Database, route, automation, security, and audit health." />
            <div className="mt-6 grid gap-4">
                {items.map((item) => {
                    const Icon = item.icon;
                    return (
                        <div key={item.label} className="rounded-3xl border border-slate-200 p-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-700"><Icon size={20} /></span>
                                    <p className="font-black">{item.label}</p>
                                </div>
                                <StatusChip label={`${item.value}%`} tone={scoreTone(item.value)} />
                            </div>
                            <div className="mt-4 h-3 rounded-full bg-slate-100">
                                <div className="h-full rounded-full bg-blue-500" style={{ width: `${item.value}%` }} />
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

function DeploymentReadinessChecklist({ data }: Props) {
    return (
        <section className="enterprise-panel p-6">
            <PanelTitle icon={<BadgeCheck size={21} />} title="Deployment Readiness Checklist" description="Completed modules, missing items, blockers, and launch steps." />
            <div className="mt-5 grid gap-3">
                {data.checklist.map((item) => (
                    <article key={item.id} className="rounded-3xl border border-slate-200 p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="font-black">{item.title}</p>
                                <p className="mt-1 text-sm text-slate-500">{item.description}</p>
                            </div>
                            <StatusChip label={item.status} tone={statusTone(item.status)} />
                        </div>
                        <p className="mt-3 text-xs font-black uppercase text-slate-400">Owner: {item.owner}</p>
                    </article>
                ))}
            </div>
            <div className="mt-5 rounded-3xl bg-slate-950 p-5 text-white">
                <p className="font-black">Recommended Launch Steps</p>
                <ul className="mt-3 space-y-2 text-sm text-slate-300">
                    {data.recommendedSteps.map((step) => <li key={step}>• {step}</li>)}
                </ul>
            </div>
        </section>
    );
}

function RouteAccessGovernance({ rows }: { rows: RouteGovernanceRow[] }) {
    return (
        <section className="enterprise-panel overflow-hidden">
            <div className="border-b border-slate-200 p-6">
                <PanelTitle icon={<ShieldCheck size={21} />} title="Route Access Governance" description="Office users, office managers, regional managers, company admins, CEO access, and route permissions." />
            </div>
            <div className="overflow-x-auto">
                <table className="enterprise-table">
                    <thead>
                        <tr>
                            <th className="text-left">Module</th>
                            <th className="text-left">Route</th>
                            <th className="text-left">Office User</th>
                            <th className="text-left">Office Manager</th>
                            <th className="text-left">Regional</th>
                            <th className="text-left">Company Admin</th>
                            <th className="text-left">CEO</th>
                            <th className="text-left">Permission</th>
                            <th className="text-left">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr key={row.route}>
                                <td><p className="font-black">{row.module}</p></td>
                                <td><span className="font-mono text-xs font-bold">{row.route}</span></td>
                                <td>{row.officeUser}</td>
                                <td>{row.officeManager}</td>
                                <td>{row.regionalManager}</td>
                                <td>{row.companyAdmin}</td>
                                <td>{row.ceo}</td>
                                <td>{row.permission}</td>
                                <td><StatusChip label={row.status} tone={statusTone(row.status)} /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

function ExportCentre({ exports }: { exports: ExportReadinessItem[] }) {
    return (
        <section className="enterprise-panel p-6">
            <PanelTitle icon={<Download size={21} />} title="Export Centre" description="PDF, Excel, and executive report export readiness." />
            <div className="mt-5 grid gap-4">
                {exports.map((item) => (
                    <article key={item.id} className="rounded-3xl border border-slate-200 p-5">
                        <div className="flex items-start justify-between gap-4">
                            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-cyan-50 text-cyan-700">
                                {item.format === "Excel" ? <FileSpreadsheet size={20} /> : <Download size={20} />}
                            </span>
                            <StatusChip label={item.status} tone={statusTone(item.status)} />
                        </div>
                        <p className="mt-4 font-black">{item.title}</p>
                        <p className="mt-2 text-sm text-slate-500">{item.description}</p>
                    </article>
                ))}
            </div>
        </section>
    );
}

function EnterpriseQualityReview({ quality }: { quality: QualityScores }) {
    const rows = [
        ["UI Quality", quality.uiQuality],
        ["Security Readiness", quality.securityReadiness],
        ["Automation Readiness", quality.automationReadiness],
        ["Audit Readiness", quality.auditReadiness],
        ["CEO Readiness", quality.ceoReadiness],
        ["Deployment Readiness", quality.deploymentReadiness],
    ] as const;
    return (
        <section className="rounded-3xl bg-slate-950 p-6 text-white shadow-2xl">
            <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-400 text-slate-950"><Sparkles size={21} /></span>
                <div>
                    <h2 className="text-xl font-black">Enterprise Quality Review</h2>
                    <p className="text-sm text-slate-300">Final launch scoring across product, security, automation, audit, CEO, and deployment.</p>
                </div>
            </div>
            <div className="mt-5 grid gap-3">
                {rows.map(([label, value]) => (
                    <div key={label} className="rounded-2xl bg-white/10 p-4">
                        <div className="flex items-center justify-between">
                            <p className="font-black">{label}</p>
                            <span className="text-xl font-black">{value}%</span>
                        </div>
                        <div className="mt-3 h-2 rounded-full bg-white/10">
                            <div className="h-full rounded-full bg-emerald-400" style={{ width: `${value}%` }} />
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}

function VisualShowcase({ screens }: { screens: ShowcaseScreen[] }) {
    return (
        <section className="enterprise-panel p-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <PanelTitle icon={<Smartphone size={21} />} title="Complete Visual Showcase" description="Screen-by-screen walkthrough catalogue for the full Ddumba enterprise platform." />
                <StatusChip label={`${screens.length} screens`} tone="purple" />
            </div>
            <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2 2xl:grid-cols-3">
                {screens.length === 0 ? (
                    <EmptyState title="No showcase screens" description="Completed module catalogue will appear after launch metadata loads." />
                ) : screens.map((screen) => (
                    <article key={screen.route} className="rounded-3xl border border-slate-200 p-5 transition hover:-translate-y-0.5 hover:shadow-xl">
                        <div className="aspect-[16/9] overflow-hidden rounded-3xl border border-slate-200 bg-slate-950 p-4 text-white">
                            <div className="flex items-center justify-between">
                                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black">Screenshot Preview</span>
                                <span className="text-xs font-black text-emerald-300">{screen.enterpriseScore}%</span>
                            </div>
                            <div className="mt-8 space-y-3">
                                <div className="h-4 w-2/3 rounded-full bg-white/20" />
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="h-16 rounded-2xl bg-blue-500/50" />
                                    <div className="h-16 rounded-2xl bg-emerald-500/50" />
                                    <div className="h-16 rounded-2xl bg-amber-400/50" />
                                </div>
                                <div className="h-20 rounded-2xl bg-white/10" />
                            </div>
                        </div>
                        <div className="mt-5 flex items-start justify-between gap-4">
                            <div>
                                <p className="text-lg font-black">{screen.title}</p>
                                <p className="mt-1 text-sm text-slate-500">{screen.description}</p>
                            </div>
                            <StatusChip label={`${screen.enterpriseScore}%`} tone={scoreTone(screen.enterpriseScore)} />
                        </div>
                        <div className="mt-4">
                            <p className="text-xs font-black uppercase text-slate-400">Key Features</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                                {screen.keyFeatures.map((feature) => <span key={feature} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">{feature}</span>)}
                            </div>
                        </div>
                        <div className="mt-4">
                            <p className="text-xs font-black uppercase text-slate-400">Data Shown</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                                {screen.dataShown.map((item) => <span key={item} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{item}</span>)}
                            </div>
                        </div>
                        <Link href={screen.route} className="mt-5 inline-flex rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-blue-700">
                            Open screen
                        </Link>
                    </article>
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

function scoreTone(score: number): LaunchTone {
    if (score >= 85) return "green";
    if (score >= 65) return "blue";
    if (score >= 45) return "orange";
    return "red";
}

function statusTone(status: LaunchStatus): LaunchTone {
    if (status === "ready") return "green";
    if (status === "watch") return "orange";
    return "red";
}
