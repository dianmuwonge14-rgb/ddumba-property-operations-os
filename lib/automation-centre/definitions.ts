import type { AutomationFrequency } from "./types";

export type AutomationDefinition = {
    key: string;
    name: string;
    frequency: AutomationFrequency;
    scheduleExpression: string;
    triggerType: string;
    description: string;
};

export const AUTOMATION_DEFINITIONS: AutomationDefinition[] = [
    {
        key: "promise_recovery_hourly",
        name: "Promise Recovery Automation",
        frequency: "hourly",
        scheduleExpression: "0 * * * *",
        triggerType: "scheduled_hourly",
        description: "Detects due, overdue, and high-risk promises and routes escalations.",
    },
    {
        key: "collections_daily",
        name: "Collections Automation",
        frequency: "daily",
        scheduleExpression: "15 18 * * *",
        triggerType: "scheduled_daily",
        description: "Checks office collection targets and recovery performance.",
    },
    {
        key: "attendance_daily",
        name: "Attendance Automation",
        frequency: "daily",
        scheduleExpression: "30 11 * * 1-6",
        triggerType: "scheduled_daily",
        description: "Escalates late arrivals, absence, and attendance decline.",
    },
    {
        key: "expense_control_weekly",
        name: "Expense Automation",
        frequency: "weekly",
        scheduleExpression: "0 9 * * 1",
        triggerType: "scheduled_weekly",
        description: "Detects unusual expenses, budget overruns, and spending spikes.",
    },
    {
        key: "executive_notifications_monthly",
        name: "Executive Notifications",
        frequency: "monthly",
        scheduleExpression: "0 8 1 * *",
        triggerType: "scheduled_monthly",
        description: "Creates executive-ready automation summaries and performance notifications.",
    },
];
