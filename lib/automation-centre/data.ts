import { hasAnyPermission, requirePermission } from "@/lib/auth/permissions";
import { getScopedSupabase } from "@/lib/auth/query";
import { AUTOMATION_DEFINITIONS } from "./definitions";
import type {
    AttendanceEventRow,
    AutomationCard,
    AutomationCentreData,
    AutomationHistoryItem,
    AutomationPerformance,
    AutomationRunLog,
    AutomationRunRow,
    AutomationTaskRow,
    CollectionRow,
    ExpenseRow,
    NotificationFeedItem,
    NotificationRow,
    OfficeRow,
    PromiseRow,
    RetryQueueItem,
    ScheduledAutomation,
    Severity,
} from "./types";

const TIME_ZONE = "Africa/Kampala";

function todayDate() {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date());
}

function monthStart() {
    const date = new Date();
    const year = new Intl.DateTimeFormat("en", { timeZone: TIME_ZONE, year: "numeric" }).format(date);
    const month = new Intl.DateTimeFormat("en", { timeZone: TIME_ZONE, month: "2-digit" }).format(date);
    return `${year}-${month}-01`;
}

function dateOffset(days: number) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(date);
}

function isoStart(date: string) {
    return `${date}T00:00:00+03:00`;
}

function isoEnd(date: string) {
    return `${date}T23:59:59+03:00`;
}

export async function getAutomationCentreData(): Promise<AutomationCentreData> {
    const context = await requirePermission("reports.read");
    const { supabase } = await getScopedSupabase();
    const companyId = context.activeCompany?.id;
    if (!companyId) return emptyData();

    const today = todayDate();
    const startOfMonth = monthStart();
    const startWindow = dateOffset(-30);
    const accessibleOfficeIds = new Set(context.offices.map((office) => office.id));

    const [
        rulesResult,
        runsResult,
        tasksResult,
        notificationsResult,
        failuresResult,
        remindersResult,
        messagesResult,
        recipientsResult,
        attemptsResult,
        scheduledJobsResult,
        auditResult,
        officesResult,
        collectionsResult,
        promisesResult,
        expensesResult,
        attendanceResult,
        employeesResult,
        officeScoresResult,
    ] = await Promise.all([
        supabase.from("automation_rules").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
        supabase.from("automation_runs").select("*").eq("company_id", companyId).gte("started_at", isoStart(startWindow)).order("started_at", { ascending: false }),
        supabase.from("automation_tasks").select("*").eq("company_id", companyId).gte("created_at", isoStart(startWindow)).order("created_at", { ascending: false }),
        supabase.from("notifications").select("*").eq("company_id", companyId).order("created_at", { ascending: false, nullsFirst: false }).limit(100),
        supabase.from("notification_failures").select("*").eq("company_id", companyId).order("created_at", { ascending: false }).limit(50),
        supabase.from("reminders").select("*").eq("company_id", companyId).gte("scheduled_for", isoStart(startWindow)).order("scheduled_for", { ascending: false }),
        supabase.from("messages").select("*").eq("company_id", companyId).order("created_at", { ascending: false }).limit(80),
        supabase.from("message_recipients").select("*").eq("company_id", companyId).order("created_at", { ascending: false }).limit(100),
        supabase.from("message_delivery_attempts").select("*").eq("company_id", companyId).order("attempted_at", { ascending: false }).limit(100),
        supabase.from("scheduled_jobs").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
        supabase.from("audit_logs").select("*").eq("company_id", companyId).gte("created_at", isoStart(startWindow)).order("created_at", { ascending: false }).limit(80),
        supabase.from("offices").select("*").eq("company_id", companyId).neq("status", "archived").order("office_name"),
        supabase.from("collections").select("*").eq("company_id", companyId).gte("paid_at", isoStart(startOfMonth)).lte("paid_at", isoEnd(today)),
        supabase.from("promises").select("*").eq("company_id", companyId),
        supabase.from("expenses").select("*").eq("company_id", companyId).gte("expense_date", startOfMonth).lte("expense_date", today),
        supabase.from("attendance_events").select("*").eq("company_id", companyId).gte("event_time", isoStart(startWindow)).lte("event_time", isoEnd(today)),
        supabase.from("employees").select("*").eq("company_id", companyId).neq("status", "archived"),
        supabase.from("office_scores").select("*").eq("company_id", companyId).order("score_date", { ascending: false, nullsFirst: false }),
    ]);

    for (const result of [
        rulesResult,
        runsResult,
        tasksResult,
        notificationsResult,
        failuresResult,
        remindersResult,
        messagesResult,
        recipientsResult,
        attemptsResult,
        scheduledJobsResult,
        auditResult,
        officesResult,
        collectionsResult,
        promisesResult,
        expensesResult,
        attendanceResult,
        employeesResult,
        officeScoresResult,
    ]) {
        if (result.error) throw new Error(result.error.message);
    }

    const offices = (officesResult.data ?? []).filter((office) => context.canAccessAllOffices || accessibleOfficeIds.has(office.id));
    const officeIds = new Set(offices.map((office) => office.id));
    const collections = filterByOffice(collectionsResult.data ?? [], officeIds);
    const promises = filterByOffice(promisesResult.data ?? [], officeIds);
    const expenses = filterByOffice(expensesResult.data ?? [], officeIds);
    const attendance = filterByOffice(attendanceResult.data ?? [], officeIds);
    const employees = filterByOffice(employeesResult.data ?? [], officeIds);
    const rules = rulesResult.data ?? [];
    const runs = runsResult.data ?? [];
    const tasks = tasksResult.data ?? [];
    const attempts = attemptsResult.data ?? [];
    const failures = failuresResult.data ?? [];
    const notifications = filterNullableOffice(notificationsResult.data ?? [], officeIds);
    const generated = buildGeneratedFeeds({ offices, collections, promises, expenses, attendance, employees });
    const allNotifications = [...generated.promiseRecovery, ...generated.collectionTarget, ...generated.attendance, ...generated.expenseControl, ...mapPersistedNotifications(notifications)];

    return {
        company: context.activeCompany,
        activeOffice: context.activeOffice,
        canExecute: hasAnyPermission(context, ["reports.manage", "settings.manage", "notifications.manage"]),
        kpis: {
            activeAutomations: rules.filter((rule) => rule.active).length + 4,
            failedAutomations: runs.filter((run) => isFailureStatus(run.status)).length + failures.filter((failure) => !failure.resolved_at).length,
            pendingAutomations: tasks.filter((task) => isPendingStatus(task.status)).length + generated.pendingCount,
            successRate: automationSuccessRate(runs, tasks),
            lastExecutionTime: runs[0]?.started_at ?? tasks[0]?.created_at ?? null,
        },
        commandCards: buildCommandCards({ rules, runs, tasks, generated }),
        schedules: buildSchedules(scheduledJobsResult.data ?? [], runs),
        runLogs: buildRunLogs(runs, rules),
        retryQueue: buildRetryQueue({ failures, attempts, recipients: recipientsResult.data ?? [] }),
        performance: buildPerformance({ runs, tasks, attempts, failures }),
        promiseRecovery: generated.promiseRecovery,
        collectionTarget: generated.collectionTarget,
        attendance: generated.attendance,
        expenseControl: generated.expenseControl,
        notifications: groupNotifications(allNotifications),
        routing: {
            admin: allNotifications.filter((item) => item.route === "admin"),
            office: allNotifications.filter((item) => item.route === "office"),
            employee: allNotifications.filter((item) => item.route === "employee"),
        },
        history: buildHistory({ runs, tasks, audits: auditResult.data ?? [] }),
        persisted: {
            rules,
            runs,
            tasks,
            notifications,
            failures,
            reminders: remindersResult.data ?? [],
            messages: messagesResult.data ?? [],
            recipients: recipientsResult.data ?? [],
            attempts,
        },
    };
}

function filterByOffice<T extends { office_id: string | null }>(rows: T[], officeIds: Set<string>) {
    return rows.filter((row) => row.office_id && officeIds.has(row.office_id));
}

function filterNullableOffice<T extends { office_id: string | null }>(rows: T[], officeIds: Set<string>) {
    return rows.filter((row) => !row.office_id || officeIds.has(row.office_id));
}

function buildGeneratedFeeds(input: {
    offices: OfficeRow[];
    collections: CollectionRow[];
    promises: PromiseRow[];
    expenses: ExpenseRow[];
    attendance: AttendanceEventRow[];
    employees: Array<{ id: string; office_id: string | null; full_name: string | null; status: string | null }>;
}) {
    const today = todayDate();
    const promiseRecovery = buildPromiseAutomation(input.promises, input.offices);
    const collectionTarget = buildCollectionAutomation(input.offices, input.collections);
    const attendance = buildAttendanceAutomation(input.offices, input.attendance, input.employees);
    const expenseControl = buildExpenseAutomation(input.offices, input.expenses);

    return {
        promiseRecovery,
        collectionTarget,
        attendance,
        expenseControl,
        pendingCount: [...promiseRecovery, ...collectionTarget, ...attendance, ...expenseControl].filter((item) => item.severity !== "success" && item.createdAt.slice(0, 10) === today).length,
    };
}

function buildPromiseAutomation(promises: PromiseRow[], offices: OfficeRow[]): NotificationFeedItem[] {
    const today = todayDate();
    const officeById = officeMap(offices);
    const dueToday = promises.filter((promise) => (promise.promised_date ?? promise.promise_date) === today && !isFulfilledPromise(promise));
    const overdue = promises.filter((promise) => {
        const date = promise.promised_date ?? promise.promise_date;
        return date && date < today && !isFulfilledPromise(promise);
    });
    const highRisk = promises.filter((promise) => amount(promise.promised_amount ?? promise.amount) >= 1000000 && !isFulfilledPromise(promise));

    return [
        ...dueToday.slice(0, 8).map((promise) => feed({
            id: `promise-due-${promise.id}`,
            title: "Promise due today",
            message: `${officeName(officeById, promise.office_id)} has a promise due today worth UGX ${amount(promise.promised_amount ?? promise.amount).toLocaleString()}.`,
            severity: "warning",
            route: "office",
        })),
        ...overdue.slice(0, 8).map((promise) => feed({
            id: `promise-overdue-${promise.id}`,
            title: "Overdue promise escalation",
            message: `${officeName(officeById, promise.office_id)} has an overdue promise requiring escalation.`,
            severity: "critical",
            route: "admin",
        })),
        ...highRisk.slice(0, 5).map((promise) => feed({
            id: `promise-risk-${promise.id}`,
            title: "High-risk promise",
            message: `High-value promise requires executive monitoring.`,
            severity: "warning",
            route: "admin",
        })),
    ];
}

function buildCollectionAutomation(offices: OfficeRow[], collections: CollectionRow[]): NotificationFeedItem[] {
    return offices.flatMap((office) => {
        const officeCollections = collections.filter((collection) => collection.office_id === office.id);
        const collected = sumCollections(officeCollections);
        const target = amount(office.collection_target) || collected;
        const rate = percent(collected, target || collected);
        const notifications: NotificationFeedItem[] = [];
        if (rate < 70) {
            notifications.push(feed({
                id: `collection-under-${office.id}`,
                title: "Collection underperformance",
                message: `${office.office_name} is at ${rate}% of target and needs recovery action.`,
                severity: "critical",
                route: "admin",
            }));
        } else if (rate < 90) {
            notifications.push(feed({
                id: `collection-watch-${office.id}`,
                title: "Target watch",
                message: `${office.office_name} is trending below target at ${rate}%.`,
                severity: "warning",
                route: "office",
            }));
        } else {
            notifications.push(feed({
                id: `collection-success-${office.id}`,
                title: "Collection target healthy",
                message: `${office.office_name} is holding ${rate}% target achievement.`,
                severity: "success",
                route: "office",
            }));
        }
        return notifications;
    });
}

function buildAttendanceAutomation(
    offices: OfficeRow[],
    attendance: AttendanceEventRow[],
    employees: Array<{ id: string; office_id: string | null; full_name: string | null; status: string | null }>,
): NotificationFeedItem[] {
    const today = todayDate();
    return offices.flatMap((office) => {
        const officeEmployees = employees.filter((employee) => employee.office_id === office.id && !["inactive", "terminated", "archived"].includes((employee.status ?? "").toLowerCase()));
        const todayEvents = attendance.filter((event) => event.office_id === office.id && event.event_time.slice(0, 10) === today);
        const checkedIn = new Set(todayEvents.filter((event) => event.event_type === "check_in").map((event) => event.employee_id));
        const late = todayEvents.filter((event) => event.event_type === "check_in" && event.status === "late").length;
        const absent = Math.max(0, officeEmployees.length - checkedIn.size);
        const feedItems: NotificationFeedItem[] = [];
        if (late) {
            feedItems.push(feed({
                id: `attendance-late-${office.id}`,
                title: "Late arrivals detected",
                message: `${office.office_name} has ${late} late arrivals today.`,
                severity: "warning",
                route: "office",
            }));
        }
        if (absent) {
            feedItems.push(feed({
                id: `attendance-absent-${office.id}`,
                title: "Absent employees detected",
                message: `${office.office_name} has ${absent} employees without check-in records.`,
                severity: absent >= 3 ? "critical" : "warning",
                route: "admin",
            }));
        }
        return feedItems;
    });
}

function buildExpenseAutomation(offices: OfficeRow[], expenses: ExpenseRow[]): NotificationFeedItem[] {
    return offices.flatMap((office) => {
        const officeExpenses = expenses.filter((expense) => expense.office_id === office.id);
        const spend = sumExpenses(officeExpenses);
        const budget = amount(office.expense_budget);
        const largest = officeExpenses.slice().sort((a, b) => amount(b.amount) - amount(a.amount))[0];
        const items: NotificationFeedItem[] = [];
        if (budget && spend > budget) {
            items.push(feed({
                id: `expense-budget-${office.id}`,
                title: "Expense budget overrun",
                message: `${office.office_name} has exceeded budget by UGX ${Math.round(spend - budget).toLocaleString()}.`,
                severity: "critical",
                route: "admin",
            }));
        }
        if (largest && amount(largest.amount) >= 1000000) {
            items.push(feed({
                id: `expense-spike-${largest.id}`,
                title: "Unusual expense spike",
                message: `${office.office_name} recorded a high expense of UGX ${amount(largest.amount).toLocaleString()}.`,
                severity: "warning",
                route: "office",
            }));
        }
        return items;
    });
}

function buildCommandCards(input: {
    rules: Array<{ active: boolean }>;
    runs: AutomationRunRow[];
    tasks: AutomationTaskRow[];
    generated: {
        promiseRecovery: NotificationFeedItem[];
        collectionTarget: NotificationFeedItem[];
        attendance: NotificationFeedItem[];
        expenseControl: NotificationFeedItem[];
    };
}): AutomationCard[] {
    return [
        card("promise", "Promise Recovery Automation", "Monitors due, overdue, and high-risk promises.", input.generated.promiseRecovery.length, input.generated.promiseRecovery),
        card("collection", "Collection Target Automation", "Monitors office target achievement, daily collections, and recovery rates.", input.generated.collectionTarget.length, input.generated.collectionTarget),
        card("attendance", "Attendance Automation", "Monitors late arrivals, absence, missed reports, and decline signals.", input.generated.attendance.length, input.generated.attendance),
        card("expense", "Expense Control Automation", "Monitors unusual expenses, budget overruns, and spending spikes.", input.generated.expenseControl.length, input.generated.expenseControl),
    ];
}

function card(id: string, title: string, description: string, monitoredCount: number, items: NotificationFeedItem[]): AutomationCard {
    const critical = items.filter((item) => item.severity === "critical").length;
    const warnings = items.filter((item) => item.severity === "warning").length;
    return {
        id,
        title,
        description,
        status: critical ? "failed" : warnings ? "pending" : "active",
        severity: critical ? "critical" : warnings ? "warning" : "success",
        monitoredCount,
        generatedCount: items.length,
        successRate: items.length ? Math.round((items.filter((item) => item.severity === "success").length / items.length) * 100) : 100,
    };
}

function mapPersistedNotifications(notifications: NotificationRow[]): NotificationFeedItem[] {
    return notifications.map((notification) => feed({
        id: notification.id,
        title: notification.title ?? "Notification",
        message: notification.message ?? "No message",
        severity: severityFromStatus(notification.delivery_status),
        route: routeFromRecipient(notification.recipient_type),
        createdAt: notification.created_at ?? new Date().toISOString(),
        deliveryStatus: notification.delivery_status ?? "unknown",
    }));
}

function groupNotifications(items: NotificationFeedItem[]): Record<Severity, NotificationFeedItem[]> {
    return {
        critical: items.filter((item) => item.severity === "critical"),
        warning: items.filter((item) => item.severity === "warning"),
        information: items.filter((item) => item.severity === "information"),
        success: items.filter((item) => item.severity === "success"),
    };
}

function buildHistory(input: {
    runs: AutomationRunRow[];
    tasks: AutomationTaskRow[];
    audits: Array<{ id: string; action: string; entity_type: string; created_at: string; actor_id: string | null }>;
}): AutomationHistoryItem[] {
    return [
        ...input.runs.map((run) => ({
            id: `run-${run.id}`,
            whatHappened: "Automation rule executed",
            triggeredBy: run.automation_rule_id ?? "System scheduler",
            date: run.started_at,
            result: run.error_message ?? run.status,
            status: run.status,
        })),
        ...input.tasks.map((task) => ({
            id: `task-${task.id}`,
            whatHappened: `${task.task_type} task generated`,
            triggeredBy: task.automation_run_id ?? "Automation engine",
            date: task.created_at,
            result: task.completed_at ? "Completed" : task.status,
            status: task.status,
        })),
        ...input.audits.slice(0, 25).map((audit) => ({
            id: `audit-${audit.id}`,
            whatHappened: `${audit.action} on ${audit.entity_type}`,
            triggeredBy: audit.actor_id ?? "System",
            date: audit.created_at,
            result: "Audit recorded",
            status: "logged",
        })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 60);
}

function buildSchedules(
    jobs: Array<{ id: string; key: string; schedule_expression: string; active: boolean; created_at: string }>,
    runs: AutomationRunRow[],
): ScheduledAutomation[] {
    const lastRunTime = runs[0]?.started_at ?? null;
    const persistedByKey = new Map(jobs.map((job) => [job.key, job]));
    return AUTOMATION_DEFINITIONS.map((definition) => {
        const job = persistedByKey.get(definition.key);
        return {
            id: job?.id ?? definition.key,
            key: definition.key,
            label: definition.name,
            frequency: definition.frequency,
            scheduleExpression: job?.schedule_expression ?? definition.scheduleExpression,
            active: job?.active ?? false,
            lastRunTime,
            nextRunTime: nextRunTime(definition.frequency),
        };
    });
}

function buildRunLogs(runs: AutomationRunRow[], rules: Array<{ id: string; name: string; trigger_type: string }>): AutomationRunLog[] {
    const rulesById = new Map(rules.map((rule) => [rule.id, rule]));
    return runs.slice(0, 50).map((run) => {
        const rule = run.automation_rule_id ? rulesById.get(run.automation_rule_id) : null;
        const durationMs = run.completed_at ? new Date(run.completed_at).getTime() - new Date(run.started_at).getTime() : null;
        return {
            id: run.id,
            automationName: rule?.name ?? "Automation Engine",
            triggerSource: rule?.trigger_type ?? "manual/scheduler",
            startedAt: run.started_at,
            completedAt: run.completed_at,
            durationMs: durationMs && durationMs >= 0 ? durationMs : null,
            result: run.error_message ?? run.status,
            failureReason: run.error_message,
            status: run.status,
        };
    });
}

function buildRetryQueue(input: {
    failures: Array<{ id: string; message_recipient_id: string | null; failure_reason: string; status: string; resolved_at: string | null }>;
    attempts: Array<{ message_recipient_id: string; attempted_at: string; status: string }>;
    recipients: Array<{ id: string; recipient_type: string; recipient_id: string | null; destination: string; status: string }>;
}): RetryQueueItem[] {
    const attemptsByRecipient = new Map<string, Array<{ attempted_at: string; status: string }>>();
    for (const attempt of input.attempts) {
        const existing = attemptsByRecipient.get(attempt.message_recipient_id) ?? [];
        existing.push(attempt);
        attemptsByRecipient.set(attempt.message_recipient_id, existing);
    }
    const recipientById = new Map(input.recipients.map((recipient) => [recipient.id, recipient]));

    return input.failures.slice(0, 30).map((failure) => {
        const recipient = failure.message_recipient_id ? recipientById.get(failure.message_recipient_id) : null;
        const attempts = failure.message_recipient_id ? attemptsByRecipient.get(failure.message_recipient_id) ?? [] : [];
        const sortedAttempts = attempts.slice().sort((a, b) => new Date(b.attempted_at).getTime() - new Date(a.attempted_at).getTime());
        return {
            id: failure.id,
            recipientId: recipient?.recipient_id ?? null,
            route: routeFromRecipient(recipient?.recipient_type ?? null),
            destination: recipient?.destination ?? "unassigned",
            status: failure.status,
            retryCount: attempts.length,
            lastRetryAt: sortedAttempts[0]?.attempted_at ?? null,
            finalOutcome: failure.resolved_at ? "resolved" : sortedAttempts[0]?.status ?? "pending_retry",
            failureReason: failure.failure_reason,
        };
    });
}

function buildPerformance(input: {
    runs: AutomationRunRow[];
    tasks: AutomationTaskRow[];
    attempts: Array<{ status: string; provider: string | null; error_message: string | null }>;
    failures: Array<{ failure_reason: string; status: string }>;
}): AutomationPerformance {
    const completedRuns = input.runs.filter((run) => run.completed_at);
    const failedRuns = input.runs.filter((run) => isFailureStatus(run.status));
    const successfulRuns = input.runs.filter((run) => ["success", "completed", "succeeded"].includes(run.status.toLowerCase()));
    const durations = completedRuns
        .map((run) => new Date(run.completed_at ?? run.started_at).getTime() - new Date(run.started_at).getTime())
        .filter((duration) => duration >= 0);
    const volume = input.runs.length + input.tasks.length;
    const topFailures = topFailureReasons([
        ...input.runs.map((run) => run.error_message).filter(Boolean),
        ...input.attempts.map((attempt) => attempt.error_message).filter(Boolean),
        ...input.failures.map((failure) => failure.failure_reason).filter(Boolean),
    ] as string[]);

    return {
        successRate: input.runs.length ? Math.round((successfulRuns.length / input.runs.length) * 100) : 100,
        failureRate: input.runs.length ? Math.round((failedRuns.length / input.runs.length) * 100) : 0,
        averageExecutionMs: durations.length ? Math.round(durations.reduce((total, duration) => total + duration, 0) / durations.length) : 0,
        automationVolume: volume,
        notificationVolume: input.attempts.length,
        topFailures,
    };
}

function topFailureReasons(reasons: string[]) {
    const counts = new Map<string, number>();
    for (const reason of reasons) {
        const label = reason.slice(0, 80);
        counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([label, count]) => ({ label, count }));
}

function feed(input: {
    id: string;
    title: string;
    message: string;
    severity: Severity;
    route: "admin" | "office" | "employee";
    createdAt?: string;
    deliveryStatus?: string;
}): NotificationFeedItem {
    return {
        id: input.id,
        title: input.title,
        message: input.message,
        severity: input.severity,
        route: input.route,
        createdAt: input.createdAt ?? new Date().toISOString(),
        deliveryStatus: input.deliveryStatus ?? "generated",
    };
}

function automationSuccessRate(runs: AutomationRunRow[], tasks: AutomationTaskRow[]) {
    const total = runs.length + tasks.length;
    if (!total) return 100;
    const success = runs.filter((run) => ["success", "completed", "succeeded"].includes(run.status)).length + tasks.filter((task) => ["success", "completed", "done"].includes(task.status)).length;
    return Math.round((success / total) * 100);
}

function isFailureStatus(status: string) {
    return ["failed", "error", "failure"].includes(status.toLowerCase());
}

function isPendingStatus(status: string) {
    return ["pending", "queued", "running", "scheduled"].includes(status.toLowerCase());
}

function isFulfilledPromise(promise: PromiseRow) {
    const status = (promise.status ?? "").toLowerCase();
    return Boolean(promise.fulfilled_at) || status === "fulfilled" || status === "paid";
}

function officeMap(offices: OfficeRow[]) {
    return new Map(offices.map((office) => [office.id, office.office_name ?? office.name ?? "Office"]));
}

function officeName(map: Map<string, string>, officeId: string | null) {
    return officeId ? map.get(officeId) ?? "Office" : "Office";
}

function severityFromStatus(status: string | null): Severity {
    const value = (status ?? "").toLowerCase();
    if (["failed", "bounced", "error"].includes(value)) return "critical";
    if (["pending", "queued"].includes(value)) return "warning";
    if (["sent", "delivered", "success"].includes(value)) return "success";
    return "information";
}

function routeFromRecipient(recipientType: string | null): "admin" | "office" | "employee" {
    const value = (recipientType ?? "").toLowerCase();
    if (value.includes("admin") || value.includes("executive")) return "admin";
    if (value.includes("employee") || value.includes("staff")) return "employee";
    return "office";
}

function sumCollections(collections: CollectionRow[]) {
    return collections.reduce((total, collection) => total + amount(collection.amount_paid ?? collection.amount), 0);
}

function sumExpenses(expenses: ExpenseRow[]) {
    return expenses.reduce((total, expense) => total + amount(expense.amount), 0);
}

function amount(value: number | null | undefined) {
    return Number(value ?? 0);
}

function percent(numerator: number, denominator: number) {
    if (!denominator) return 0;
    return Math.max(0, Math.min(100, Math.round((numerator / denominator) * 100)));
}

function nextRunTime(frequency: "hourly" | "daily" | "weekly" | "monthly") {
    const date = new Date();
    if (frequency === "hourly") {
        date.setHours(date.getHours() + 1, 0, 0, 0);
    } else if (frequency === "daily") {
        date.setDate(date.getDate() + 1);
        date.setHours(8, 0, 0, 0);
    } else if (frequency === "weekly") {
        date.setDate(date.getDate() + ((8 - date.getDay()) % 7 || 7));
        date.setHours(9, 0, 0, 0);
    } else {
        date.setMonth(date.getMonth() + 1, 1);
        date.setHours(8, 0, 0, 0);
    }
    return date.toISOString();
}

function emptyData(): AutomationCentreData {
    return {
        company: null,
        activeOffice: null,
        canExecute: false,
        kpis: {
            activeAutomations: 0,
            failedAutomations: 0,
            pendingAutomations: 0,
            successRate: 0,
            lastExecutionTime: null,
        },
        commandCards: [],
        schedules: [],
        runLogs: [],
        retryQueue: [],
        performance: {
            successRate: 0,
            failureRate: 0,
            averageExecutionMs: 0,
            automationVolume: 0,
            notificationVolume: 0,
            topFailures: [],
        },
        promiseRecovery: [],
        collectionTarget: [],
        attendance: [],
        expenseControl: [],
        notifications: { critical: [], warning: [], information: [], success: [] },
        routing: { admin: [], office: [], employee: [] },
        history: [],
        persisted: {
            rules: [],
            runs: [],
            tasks: [],
            notifications: [],
            failures: [],
            reminders: [],
            messages: [],
            recipients: [],
            attempts: [],
        },
    };
}
