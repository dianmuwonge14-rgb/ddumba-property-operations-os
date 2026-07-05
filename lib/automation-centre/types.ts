import type { Database } from "@/types/database.types";
import type { Company, Office } from "@/lib/auth/types";

export type AutomationRuleRow = Database["public"]["Tables"]["automation_rules"]["Row"];
export type AutomationRunRow = Database["public"]["Tables"]["automation_runs"]["Row"];
export type AutomationTaskRow = Database["public"]["Tables"]["automation_tasks"]["Row"];
export type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];
export type NotificationFailureRow = Database["public"]["Tables"]["notification_failures"]["Row"];
export type ReminderRow = Database["public"]["Tables"]["reminders"]["Row"];
export type MessageRow = Database["public"]["Tables"]["messages"]["Row"];
export type MessageRecipientRow = Database["public"]["Tables"]["message_recipients"]["Row"];
export type MessageDeliveryAttemptRow = Database["public"]["Tables"]["message_delivery_attempts"]["Row"];
export type AuditLogRow = Database["public"]["Tables"]["audit_logs"]["Row"];
export type OfficeRow = Database["public"]["Tables"]["offices"]["Row"];
export type CollectionRow = Database["public"]["Tables"]["collections"]["Row"];
export type PromiseRow = Database["public"]["Tables"]["promises"]["Row"];
export type ExpenseRow = Database["public"]["Tables"]["expenses"]["Row"];
export type AttendanceEventRow = Database["public"]["Tables"]["attendance_events"]["Row"];
export type EmployeeRow = Database["public"]["Tables"]["employees"]["Row"];
export type OfficeScoreRow = Database["public"]["Tables"]["office_scores"]["Row"];

export type Severity = "critical" | "warning" | "information" | "success";
export type AutomationStatus = "active" | "failed" | "pending" | "success" | "paused";
export type AutomationFrequency = "hourly" | "daily" | "weekly" | "monthly";

export type AutomationKpis = {
    activeAutomations: number;
    failedAutomations: number;
    pendingAutomations: number;
    successRate: number;
    lastExecutionTime: string | null;
};

export type AutomationCard = {
    id: string;
    title: string;
    description: string;
    status: AutomationStatus;
    severity: Severity;
    monitoredCount: number;
    generatedCount: number;
    successRate: number;
};

export type NotificationFeedItem = {
    id: string;
    title: string;
    message: string;
    severity: Severity;
    route: "admin" | "office" | "employee";
    createdAt: string;
    deliveryStatus: string;
};

export type AutomationHistoryItem = {
    id: string;
    whatHappened: string;
    triggeredBy: string;
    date: string;
    result: string;
    status: string;
};

export type ScheduledAutomation = {
    id: string;
    key: string;
    label: string;
    frequency: AutomationFrequency;
    scheduleExpression: string;
    active: boolean;
    lastRunTime: string | null;
    nextRunTime: string;
};

export type AutomationRunLog = {
    id: string;
    automationName: string;
    triggerSource: string;
    startedAt: string;
    completedAt: string | null;
    durationMs: number | null;
    result: string;
    failureReason: string | null;
    status: string;
};

export type RetryQueueItem = {
    id: string;
    recipientId: string | null;
    route: "admin" | "office" | "employee";
    destination: string;
    status: string;
    retryCount: number;
    lastRetryAt: string | null;
    finalOutcome: string;
    failureReason: string;
};

export type AutomationPerformance = {
    successRate: number;
    failureRate: number;
    averageExecutionMs: number;
    automationVolume: number;
    notificationVolume: number;
    topFailures: Array<{ label: string; count: number }>;
};

export type AutomationCentreData = {
    company: Company | null;
    activeOffice: Office | null;
    canExecute: boolean;
    kpis: AutomationKpis;
    commandCards: AutomationCard[];
    schedules: ScheduledAutomation[];
    runLogs: AutomationRunLog[];
    retryQueue: RetryQueueItem[];
    performance: AutomationPerformance;
    promiseRecovery: NotificationFeedItem[];
    collectionTarget: NotificationFeedItem[];
    attendance: NotificationFeedItem[];
    expenseControl: NotificationFeedItem[];
    notifications: Record<Severity, NotificationFeedItem[]>;
    routing: {
        admin: NotificationFeedItem[];
        office: NotificationFeedItem[];
        employee: NotificationFeedItem[];
    };
    history: AutomationHistoryItem[];
    persisted: {
        rules: AutomationRuleRow[];
        runs: AutomationRunRow[];
        tasks: AutomationTaskRow[];
        notifications: NotificationRow[];
        failures: NotificationFailureRow[];
        reminders: ReminderRow[];
        messages: MessageRow[];
        recipients: MessageRecipientRow[];
        attempts: MessageDeliveryAttemptRow[];
    };
};
