"use client";

import { useTransition } from "react";
import { AlertTriangle, BellRing, Bot, CheckCircle2, Clock3, Gauge, Play, RadioTower, RefreshCcw, Route, ShieldAlert, TimerReset, Zap } from "lucide-react";
import { retryFailedNotificationsAction, runAutomationEngineAction } from "@/app/actions/automation-engine";
import { EnterpriseKpiCard, EmptyState, PageHero, StatusChip } from "@/components/office/shared/EnterpriseUI";
import type { AutomationCard, AutomationCentreData, AutomationRunLog, NotificationFeedItem, RetryQueueItem, ScheduledAutomation, Severity } from "@/lib/automation-centre/types";

type Props = {
    data: AutomationCentreData;
};

function formatDate(value: string | null) {
    if (!value) return "No execution yet";
    return new Intl.DateTimeFormat("en-UG", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Africa/Kampala",
    }).format(new Date(value));
}

export default function AutomationCentre({ data }: Props) {
    const [isRunning, startRunTransition] = useTransition();
    const [isRetrying, startRetryTransition] = useTransition();

    const runEngine = () => {
        startRunTransition(async () => {
            await runAutomationEngineAction();
        });
    };

    const retryFailures = () => {
        startRetryTransition(async () => {
            await retryFailedNotificationsAction();
        });
    };

    return (
        <main className="enterprise-page">
            <div className="enterprise-shell">
                <PageHero
                    title="Automation & Notification Centre"
                    subtitle={`${data.company?.name ?? "Company"} · execution engine, scheduled jobs, escalation routing, retry handling, and audit-backed automation tracking`}
                    badge="Execution Engine"
                >
                    <div className="rounded-3xl bg-slate-950 p-5 text-white shadow-xl">
                        <div className="flex items-center gap-3">
                            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-500">
                                <Bot size={24} />
                            </span>
                            <div>
                                <p className="text-sm text-slate-300">Automation Engine</p>
                                <p className="text-xl font-black">Live Monitoring</p>
                            </div>
                        </div>
                        <div className="mt-5 grid gap-2 sm:grid-cols-2">
                            <button
                                type="button"
                                onClick={runEngine}
                                disabled={!data.canExecute || isRunning}
                                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <Play size={16} />
                                {isRunning ? "Running..." : "Run Engine"}
                            </button>
                            <button
                                type="button"
                                onClick={retryFailures}
                                disabled={!data.canExecute || isRetrying || data.retryQueue.length === 0}
                                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-white ring-1 ring-white/20 transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <RefreshCcw size={16} />
                                {isRetrying ? "Retrying..." : "Retry Failed"}
                            </button>
                        </div>
                        {!data.canExecute ? <p className="mt-3 text-xs text-slate-400">Execution requires reports management permission.</p> : null}
                    </div>
                </PageHero>

                <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5">
                    <EnterpriseKpiCard title="Active Automations" value={data.kpis.activeAutomations.toString()} tone="green" trend="up" trendLabel="rules + live monitors" progress={100} />
                    <EnterpriseKpiCard title="Failed Automations" value={data.kpis.failedAutomations.toString()} tone={data.kpis.failedAutomations ? "red" : "green"} trend={data.kpis.failedAutomations ? "down" : "up"} trendLabel="requires review" progress={data.kpis.failedAutomations ? 65 : 0} status={data.kpis.failedAutomations ? "Risk" : "Clean"} />
                    <EnterpriseKpiCard title="Pending Automations" value={data.kpis.pendingAutomations.toString()} tone="orange" trend="flat" trendLabel="queued/generated" progress={data.kpis.pendingAutomations ? 60 : 0} />
                    <EnterpriseKpiCard title="Success Rate" value={`${data.kpis.successRate}%`} tone="blue" trend="up" trendLabel="last 30 days" progress={data.kpis.successRate} />
                    <EnterpriseKpiCard title="Last Execution" value={formatDate(data.kpis.lastExecutionTime)} tone="slate" trend="flat" trendLabel="scheduler" progress={data.kpis.lastExecutionTime ? 100 : 0} />
                </section>

                <section className="mt-6 grid grid-cols-1 gap-6 2xl:grid-cols-12">
                    <div className="2xl:col-span-8">
                        <AutomationCommandCentre cards={data.commandCards} />
                    </div>
                    <div className="space-y-6 2xl:col-span-4">
                        <ExecutiveNotificationCentre data={data} />
                        <NotificationRouting data={data} />
                    </div>
                </section>

                <section className="mt-6 grid grid-cols-1 gap-6 2xl:grid-cols-12">
                    <div className="2xl:col-span-7">
                        <ScheduledJobs schedules={data.schedules} />
                    </div>
                    <div className="2xl:col-span-5">
                        <AutomationPerformance data={data} />
                    </div>
                </section>

                <section className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
                    <RetryEngine items={data.retryQueue} onRetry={retryFailures} disabled={!data.canExecute || isRetrying || data.retryQueue.length === 0} isRetrying={isRetrying} />
                    <EscalationBoard data={data} />
                </section>

                <section className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
                    <AutomationPanel title="Promise Recovery Automation" icon={<BellRing size={20} />} items={data.promiseRecovery} />
                    <AutomationPanel title="Collection Target Automation" icon={<RadioTower size={20} />} items={data.collectionTarget} />
                    <AutomationPanel title="Attendance Automation" icon={<Clock3 size={20} />} items={data.attendance} />
                    <AutomationPanel title="Expense Control Automation" icon={<ShieldAlert size={20} />} items={data.expenseControl} />
                </section>

                <section className="mt-6">
                    <RunLogs logs={data.runLogs} />
                </section>

                <section className="mt-6">
                    <AutomationHistory data={data} />
                </section>
            </div>
        </main>
    );
}

function ScheduledJobs({ schedules }: { schedules: ScheduledAutomation[] }) {
    return (
        <section className="enterprise-panel p-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h2 className="text-xl font-black">Scheduled Jobs</h2>
                    <p className="text-sm text-slate-500">Hourly, daily, weekly, and monthly automation schedules.</p>
                </div>
                <StatusChip label={`${schedules.filter((job) => job.active).length} active`} tone="green" />
            </div>
            <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
                {schedules.map((schedule) => (
                    <article key={schedule.key} className="rounded-3xl border border-slate-200 p-5">
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3">
                                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-indigo-50 text-indigo-700">
                                    <TimerReset size={20} />
                                </span>
                                <div>
                                    <p className="font-black">{schedule.label}</p>
                                    <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">{schedule.frequency} · {schedule.scheduleExpression}</p>
                                </div>
                            </div>
                            <StatusChip label={schedule.active ? "active" : "pending"} tone={schedule.active ? "green" : "orange"} />
                        </div>
                        <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                            <Mini label="Last Run" value={formatDate(schedule.lastRunTime)} />
                            <Mini label="Next Run" value={formatDate(schedule.nextRunTime)} />
                        </div>
                    </article>
                ))}
            </div>
        </section>
    );
}

function AutomationPerformance({ data }: Props) {
    const metrics = data.performance;
    return (
        <section className="rounded-3xl bg-slate-950 p-6 text-white shadow-xl">
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-500"><Gauge size={21} /></span>
                    <div>
                        <h2 className="text-xl font-black">Performance Dashboard</h2>
                        <p className="text-sm text-slate-300">Execution health, volume, latency, and failure patterns.</p>
                    </div>
                </div>
                <StatusChip label={`${metrics.successRate}% success`} tone={metrics.successRate >= 90 ? "green" : metrics.successRate >= 70 ? "orange" : "red"} />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
                <DarkMini label="Failure Rate" value={`${metrics.failureRate}%`} />
                <DarkMini label="Avg Runtime" value={`${metrics.averageExecutionMs}ms`} />
                <DarkMini label="Run Volume" value={metrics.automationVolume.toString()} />
                <DarkMini label="Dispatches" value={metrics.notificationVolume.toString()} />
            </div>
            <div className="mt-5 rounded-2xl bg-white/10 p-4">
                <p className="text-sm font-black">Top Failures</p>
                <div className="mt-3 grid gap-2">
                    {metrics.topFailures.length === 0 ? (
                        <p className="text-sm text-slate-300">No failure patterns detected in the current window.</p>
                    ) : metrics.topFailures.map((failure) => (
                        <div key={failure.label} className="flex items-center justify-between gap-3 text-sm">
                            <span className="truncate text-slate-300">{failure.label}</span>
                            <span className="rounded-full bg-white px-2 py-1 text-xs font-black text-slate-950">{failure.count}</span>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

function RetryEngine({ items, onRetry, disabled, isRetrying }: { items: RetryQueueItem[]; onRetry: () => void; disabled: boolean; isRetrying: boolean }) {
    return (
        <section className="enterprise-panel p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-xl font-black">Retry Engine</h2>
                    <p className="text-sm text-slate-500">Failed notification dispatches, retry count, and final outcome.</p>
                </div>
                <button
                    type="button"
                    onClick={onRetry}
                    disabled={disabled}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <RefreshCcw size={16} />
                    {isRetrying ? "Retrying..." : "Retry Queue"}
                </button>
            </div>
            <div className="mt-5 grid gap-3">
                {items.length === 0 ? (
                    <EmptyState title="No failed dispatches" description="The notification retry queue is clean." />
                ) : items.slice(0, 8).map((item) => (
                    <div key={item.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="font-black">{item.destination}</p>
                                <p className="mt-1 text-sm text-slate-500">{item.failureReason}</p>
                            </div>
                            <StatusChip label={item.finalOutcome} tone={statusTone(item.finalOutcome)} />
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                            <Mini label="Route" value={item.route} />
                            <Mini label="Retries" value={item.retryCount.toString()} />
                            <Mini label="Last Retry" value={formatDate(item.lastRetryAt)} />
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}

function EscalationBoard({ data }: Props) {
    const levelOne = data.routing.office.length + data.routing.employee.length;
    const levelTwo = data.notifications.warning.filter((item) => item.route === "admin").length;
    const levelThree = data.notifications.critical.filter((item) => item.route === "admin").length;
    return (
        <section className="enterprise-panel p-6">
            <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-rose-50 text-rose-700"><AlertTriangle size={20} /></span>
                <div>
                    <h2 className="text-xl font-black">Escalation Board</h2>
                    <p className="text-sm text-slate-500">Level 1 office, Level 2 regional, Level 3 company admin.</p>
                </div>
            </div>
            <div className="mt-5 grid gap-3">
                <EscalationLane level="Level 1" label="Office / Employee" value={levelOne} tone="blue" />
                <EscalationLane level="Level 2" label="Regional Operations" value={levelTwo} tone="orange" />
                <EscalationLane level="Level 3" label="Company Admin" value={levelThree} tone="red" />
            </div>
        </section>
    );
}

function EscalationLane({ level, label, value, tone }: { level: string; label: string; value: number; tone: "blue" | "orange" | "red" }) {
    return (
        <div className="flex items-center justify-between rounded-2xl border border-slate-200 p-4">
            <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">{level}</p>
                <p className="mt-1 font-black">{label}</p>
            </div>
            <StatusChip label={`${value} signals`} tone={tone} />
        </div>
    );
}

function RunLogs({ logs }: { logs: AutomationRunLog[] }) {
    return (
        <section className="enterprise-panel overflow-hidden">
            <div className="border-b border-slate-200 p-6">
                <h2 className="text-xl font-black">Automation Run Logs</h2>
                <p className="text-sm text-slate-500">Run ID, automation name, trigger source, duration, result, and failure reason.</p>
            </div>
            <div className="overflow-x-auto">
                <table className="enterprise-table">
                    <thead>
                        <tr>
                            <th className="text-left">Run ID</th>
                            <th className="text-left">Automation</th>
                            <th className="text-left">Trigger</th>
                            <th className="text-left">Started</th>
                            <th className="text-left">Completed</th>
                            <th className="text-left">Duration</th>
                            <th className="text-left">Result</th>
                            <th className="text-left">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {logs.length === 0 ? (
                            <tr><td colSpan={8} className="p-6"><EmptyState title="No run logs yet" description="Executed automation runs will appear here." /></td></tr>
                        ) : logs.map((log) => (
                            <tr key={log.id}>
                                <td><span className="font-mono text-xs font-bold">{log.id.slice(0, 8)}</span></td>
                                <td><p className="font-black">{log.automationName}</p></td>
                                <td>{log.triggerSource}</td>
                                <td>{formatDate(log.startedAt)}</td>
                                <td>{formatDate(log.completedAt)}</td>
                                <td>{log.durationMs === null ? "Running" : `${log.durationMs}ms`}</td>
                                <td>{log.failureReason ?? log.result}</td>
                                <td><StatusChip label={log.status} tone={statusTone(log.status)} /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

function AutomationCommandCentre({ cards }: { cards: AutomationCard[] }) {
    return (
        <section className="enterprise-panel p-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h2 className="text-xl font-black">Automation Command Centre</h2>
                    <p className="text-sm text-slate-500">Live automation health, generated alerts, and execution readiness.</p>
                </div>
                <StatusChip label={`${cards.length} monitors`} tone="blue" />
            </div>
            <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
                {cards.map((card) => (
                    <article key={card.id} className="rounded-3xl border border-slate-200 p-5 transition hover:bg-slate-50">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-lg font-black">{card.title}</p>
                                <p className="mt-1 text-sm text-slate-500">{card.description}</p>
                            </div>
                            <StatusChip label={card.status} tone={severityTone(card.severity)} />
                        </div>
                        <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
                            <Mini label="Monitored" value={card.monitoredCount.toString()} />
                            <Mini label="Generated" value={card.generatedCount.toString()} />
                            <Mini label="Success" value={`${card.successRate}%`} />
                        </div>
                        <div className="mt-5 h-3 rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-blue-500" style={{ width: `${card.successRate}%` }} />
                        </div>
                    </article>
                ))}
            </div>
        </section>
    );
}

function ExecutiveNotificationCentre({ data }: Props) {
    const groups: Array<{ key: Severity; label: string }> = [
        { key: "critical", label: "Critical" },
        { key: "warning", label: "Warning" },
        { key: "information", label: "Information" },
        { key: "success", label: "Success" },
    ];

    return (
        <section className="enterprise-panel p-6">
            <h2 className="text-xl font-black">Executive Notification Centre</h2>
            <p className="mt-1 text-sm text-slate-500">Severity feeds for executive action and office routing.</p>
            <div className="mt-5 grid gap-3">
                {groups.map((group) => (
                    <div key={group.key} className="flex items-center justify-between rounded-2xl border border-slate-200 p-4">
                        <div className="flex items-center gap-3">
                            <span className={`grid h-10 w-10 place-items-center rounded-2xl ${severityBg(group.key)}`}>
                                <Zap size={18} />
                            </span>
                            <div>
                                <p className="font-black">{group.label}</p>
                                <p className="text-xs text-slate-500">Notification feed</p>
                            </div>
                        </div>
                        <span className="text-2xl font-black">{data.notifications[group.key].length}</span>
                    </div>
                ))}
            </div>
        </section>
    );
}

function NotificationRouting({ data }: Props) {
    return (
        <section className="rounded-3xl bg-slate-950 p-6 text-white shadow-xl">
            <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-500"><Route size={21} /></span>
                <div>
                    <h2 className="text-xl font-black">Notification Routing</h2>
                    <p className="text-sm text-slate-300">Admin, office, and employee routing lanes</p>
                </div>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-3">
                <DarkMini label="Admin" value={data.routing.admin.length.toString()} />
                <DarkMini label="Office" value={data.routing.office.length.toString()} />
                <DarkMini label="Employee" value={data.routing.employee.length.toString()} />
            </div>
        </section>
    );
}

function AutomationPanel({ title, icon, items }: { title: string; icon: React.ReactNode; items: NotificationFeedItem[] }) {
    return (
        <section className="enterprise-panel p-6">
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-700">{icon}</span>
                    <div>
                        <h2 className="text-xl font-black">{title}</h2>
                        <p className="text-sm text-slate-500">Generated alerts, tasks, and escalations</p>
                    </div>
                </div>
                <StatusChip label={`${items.length} alerts`} tone={items.some((item) => item.severity === "critical") ? "red" : items.length ? "orange" : "green"} />
            </div>
            <div className="mt-5 grid gap-3">
                {items.length === 0 ? (
                    <EmptyState title="No alerts" description="This automation is monitoring normally and has not generated action items in the current window." />
                ) : items.slice(0, 8).map((item) => <FeedCard key={item.id} item={item} />)}
            </div>
        </section>
    );
}

function AutomationHistory({ data }: Props) {
    return (
        <section className="enterprise-panel overflow-hidden">
            <div className="border-b border-slate-200 p-6">
                <h2 className="text-xl font-black">Automation History</h2>
                <p className="text-sm text-slate-500">What happened, who triggered it, date, result, and status.</p>
            </div>
            <div className="overflow-x-auto">
                <table className="enterprise-table">
                    <thead>
                        <tr>
                            <th className="text-left">What Happened</th>
                            <th className="text-left">Triggered By</th>
                            <th className="text-left">Date</th>
                            <th className="text-left">Result</th>
                            <th className="text-left">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.history.length === 0 ? (
                            <tr><td colSpan={5} className="p-6"><EmptyState title="No automation history yet" description="Automation runs, tasks, and audit records will appear here once the engine executes workflows." /></td></tr>
                        ) : data.history.map((item) => (
                            <tr key={item.id}>
                                <td><p className="font-black">{item.whatHappened}</p></td>
                                <td>{item.triggeredBy}</td>
                                <td>{formatDate(item.date)}</td>
                                <td>{item.result}</td>
                                <td><StatusChip label={item.status} tone={statusTone(item.status)} /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

function FeedCard({ item }: { item: NotificationFeedItem }) {
    return (
        <div className="rounded-2xl border border-slate-200 p-4 hover:bg-slate-50">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <p className="font-black">{item.title}</p>
                    <p className="mt-1 text-sm text-slate-500">{item.message}</p>
                </div>
                <StatusChip label={item.severity} tone={severityTone(item.severity)} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-500">
                <span className="rounded-full bg-slate-100 px-3 py-1">Route: {item.route}</span>
                <span className="rounded-full bg-slate-100 px-3 py-1">Status: {item.deliveryStatus}</span>
            </div>
        </div>
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

function DarkMini({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl bg-white/10 p-3">
            <p className="text-xs text-slate-300">{label}</p>
            <p className="mt-1 text-2xl font-black">{value}</p>
        </div>
    );
}

function severityTone(severity: Severity) {
    if (severity === "critical") return "red";
    if (severity === "warning") return "orange";
    if (severity === "success") return "green";
    return "blue";
}

function severityBg(severity: Severity) {
    if (severity === "critical") return "bg-rose-50 text-rose-700";
    if (severity === "warning") return "bg-amber-50 text-amber-700";
    if (severity === "success") return "bg-emerald-50 text-emerald-700";
    return "bg-blue-50 text-blue-700";
}

function statusTone(status: string) {
    const value = status.toLowerCase();
    if (["success", "completed", "done", "delivered", "logged"].includes(value)) return "green";
    if (["failed", "error", "failure"].includes(value)) return "red";
    if (["pending", "queued", "running", "scheduled"].includes(value)) return "orange";
    return "blue";
}
