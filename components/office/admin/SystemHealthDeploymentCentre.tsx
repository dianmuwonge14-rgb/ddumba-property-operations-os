import { Activity, BadgeCheck, CheckCircle2, Cloud, Code2, Database, Radio, ServerCog, ShieldCheck, TimerReset } from "lucide-react";
import { AdminNotificationEmailSettingsPanel } from "@/components/office/notifications/NotificationEmailSettingsCard";
import type { AdminNotificationEmailSettingsData } from "@/lib/notifications/email-settings";
import type { ProductionReadinessStatus, ReadinessCheck } from "@/lib/production-readiness/types";

export default function SystemHealthDeploymentCentre({
    notificationEmailSettings,
    status,
}: {
    notificationEmailSettings?: AdminNotificationEmailSettingsData;
    status: ProductionReadinessStatus;
}) {
    return (
        <main className="mx-auto flex w-full max-w-[1800px] flex-col gap-5 px-4 pb-10 text-white">
            <section className="enterprise-dark-panel rounded-[2rem] p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <p className="text-xs font-black uppercase tracking-[0.22em] text-cyan-200">Version 1.0 Deployment</p>
                        <h1 className="mt-2 text-3xl font-black tracking-tight text-white">System Health & Deployment</h1>
                        <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-300">
                            Production readiness, live Supabase health, audit freshness, build state, and deployment handover status.
                        </p>
                    </div>
                    <div className="rounded-3xl border border-emerald-400/30 bg-emerald-400/10 px-5 py-4">
                        <p className="text-xs font-black uppercase tracking-wide text-emerald-200">Production Readiness Score</p>
                        <p className="mt-1 text-4xl font-black text-white">{status.score}/100</p>
                    </div>
                </div>
            </section>

            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <HealthCard icon={<BadgeCheck size={20} />} label="Current Version" value={`Version ${status.version}`} status="pass" />
                <HealthCard icon={<Cloud size={20} />} label="Environment" value={status.environment} status={status.environment === "Production" ? "pass" : "warning"} />
                <HealthCard icon={<Database size={20} />} label="Live Supabase" value={status.liveSupabaseStatus === "pass" ? "Connected" : "Needs review"} status={status.liveSupabaseStatus} />
                <HealthCard icon={<Radio size={20} />} label="Realtime Status" value={status.realtimeStatus === "pass" ? "Configured" : "Needs review"} status={status.realtimeStatus} />
                <HealthCard icon={<Activity size={20} />} label="API Health" value={status.apiHealth === "pass" ? "Healthy" : "Needs review"} status={status.apiHealth} />
                <HealthCard icon={<ServerCog size={20} />} label="Build Status" value={status.buildStatus === "pass" ? "Passing" : "Needs review"} status={status.buildStatus} />
                <HealthCard icon={<Code2 size={20} />} label="TypeScript" value={status.typeScriptStatus === "pass" ? "Passing" : "Needs review"} status={status.typeScriptStatus} />
                <HealthCard icon={<ShieldCheck size={20} />} label="Security Review" value={checkStatus(status, "security")} status={status.checks.find((item) => item.id === "security")?.status ?? "unknown"} />
            </section>

            <section className="grid gap-5 xl:grid-cols-3">
                <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5 xl:col-span-2">
                    <div className="flex items-center gap-3">
                        <CheckCircle2 className="text-emerald-200" size={22} />
                        <div>
                            <h2 className="text-lg font-black">Deployment Checklist</h2>
                            <p className="text-xs font-semibold text-slate-400">Automatically refreshed from readiness artifacts and live Supabase checks.</p>
                        </div>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {status.checks.map((item) => (
                            <div key={item.id} className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <p className="text-sm font-black text-white">{item.label}</p>
                                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-black uppercase ${statusClass(item.status)}`}>{item.status}</span>
                                </div>
                                <p className="mt-2 text-xs font-semibold leading-5 text-slate-400">{item.detail}</p>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5">
                    <div className="flex items-center gap-3">
                        <TimerReset className="text-cyan-200" size={22} />
                        <div>
                            <h2 className="text-lg font-black">Latest Signals</h2>
                            <p className="text-xs font-semibold text-slate-400">Freshness and recovery readiness.</p>
                        </div>
                    </div>
                    <div className="mt-4 space-y-3">
                        <Signal label="Last Integrity Audit" value={formatDate(status.lastIntegrityAudit)} />
                        <Signal label="Last Financial Reconciliation" value={formatDate(status.lastFinancialReconciliation)} />
                        <Signal label="Last Database Backup" value={status.lastDatabaseBackup ? formatDate(status.lastDatabaseBackup) : "Prepared - run pre-deployment backup"} />
                        <Signal label="Last Monthly Rollover" value={formatDate(status.lastMonthlyRollover)} />
                        <Signal label="Last Status Refresh" value={formatDate(status.generatedAt)} />
                    </div>
                </div>
            </section>

            {notificationEmailSettings ? <AdminNotificationEmailSettingsPanel data={notificationEmailSettings} /> : null}
        </main>
    );
}

function HealthCard({ icon, label, value, status }: { icon: React.ReactNode; label: string; value: string; status: ReadinessCheck["status"] }) {
    return (
        <div className={`rounded-2xl border p-4 ${cardClass(status)}`}>
            <div className="flex items-center justify-between gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10">{icon}</span>
                <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${statusClass(status)}`}>{status}</span>
            </div>
            <p className="mt-4 text-xs font-black uppercase tracking-wide opacity-75">{label}</p>
            <p className="mt-1 text-lg font-black">{value}</p>
        </div>
    );
}

function Signal({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 text-sm font-black text-white">{value}</p>
        </div>
    );
}

function checkStatus(status: ProductionReadinessStatus, id: string) {
    const item = status.checks.find((check) => check.id === id);
    return item?.status === "pass" ? "Complete" : "Needs review";
}

function formatDate(value: string | null) {
    if (!value) return "Not recorded";
    return new Intl.DateTimeFormat("en-UG", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Africa/Kampala",
    }).format(new Date(value));
}

function cardClass(status: ReadinessCheck["status"]) {
    if (status === "pass") return "border-emerald-400/25 bg-emerald-400/10 text-emerald-50";
    if (status === "fail") return "border-red-400/25 bg-red-400/10 text-red-50";
    if (status === "warning") return "border-amber-400/25 bg-amber-400/10 text-amber-50";
    return "border-slate-400/25 bg-slate-400/10 text-slate-50";
}

function statusClass(status: ReadinessCheck["status"]) {
    if (status === "pass") return "bg-emerald-400/20 text-emerald-100";
    if (status === "fail") return "bg-red-400/20 text-red-100";
    if (status === "warning") return "bg-amber-400/20 text-amber-100";
    return "bg-slate-400/20 text-slate-100";
}
