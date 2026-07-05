import { logUserAction } from "@/lib/auth/audit";
import type { AuthContext } from "@/lib/auth/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";
import { getAutomationCentreData } from "./data";
import { AUTOMATION_DEFINITIONS } from "./definitions";
import type { NotificationFeedItem } from "./types";

type Json = Database["public"]["Tables"]["automation_tasks"]["Insert"]["payload"];
type SupabaseServer = Awaited<ReturnType<typeof createSupabaseServerClient>>;

type EngineResult = {
    runId: string;
    status: "success" | "failed";
    generatedTasks: number;
    notificationsQueued: number;
    retryAttempts: number;
    failureReason: string | null;
};

export async function executeAutomationEngine(context: AuthContext, triggerSource = "manual"): Promise<EngineResult> {
    const companyId = context.activeCompany?.id;
    if (!companyId) throw new Error("Active company is required to execute automations.");

    const supabase = await createSupabaseServerClient();
    await ensureAutomationInfrastructure(supabase, companyId);

    const startedAt = new Date();
    const { data: run, error: runError } = await supabase
        .from("automation_runs")
        .insert({
            company_id: companyId,
            started_at: startedAt.toISOString(),
            status: "running",
        })
        .select("*")
        .single();

    if (runError) throw new Error(runError.message);

    try {
        const centre = await getAutomationCentreData();
        const generatedItems = [
            ...centre.promiseRecovery.map((item) => ({ ...item, automationKey: "promise_recovery" })),
            ...centre.collectionTarget.map((item) => ({ ...item, automationKey: "collections" })),
            ...centre.attendance.map((item) => ({ ...item, automationKey: "attendance" })),
            ...centre.expenseControl.map((item) => ({ ...item, automationKey: "expense_control" })),
        ];
        const actionableItems = generatedItems.filter((item) => item.severity !== "success");
        const executiveSummary = buildExecutiveSummary(centre.notifications.critical.length, centre.notifications.warning.length);
        const executionItems = executiveSummary ? [...actionableItems, executiveSummary] : actionableItems;

        let generatedTasks = 0;
        let notificationsQueued = 0;

        for (const item of executionItems) {
            const escalationLevel = escalationLevelFor(item);
            const payload = {
                automation_key: item.automationKey,
                title: item.title,
                message: item.message,
                severity: item.severity,
                route: item.route,
                escalation_level: escalationLevel,
                trigger_source: triggerSource,
            };

            const { data: task, error: taskError } = await supabase
                .from("automation_tasks")
                .insert({
                    automation_run_id: run.id,
                    company_id: companyId,
                    payload: payload as Json,
                    status: "queued",
                    task_type: `${item.automationKey}_${item.route}_escalation`,
                })
                .select("*")
                .single();

            if (taskError) throw new Error(taskError.message);
            generatedTasks += 1;

            const dispatchCount = await dispatchNotification({
                supabase,
                companyId,
                officeId: context.activeOffice?.id ?? null,
                actorId: context.profile?.id ?? null,
                item,
                escalationLevel,
                taskId: task.id,
            });
            notificationsQueued += dispatchCount;

            await logUserAction({
                action: "automation_task_generated",
                entityType: "automation_task",
                entityId: task.id,
                companyId,
                officeId: context.activeOffice?.id ?? null,
                afterData: payload as Json,
            });
        }

        const completedAt = new Date();
        const { error: completeError } = await supabase
            .from("automation_runs")
            .update({
                completed_at: completedAt.toISOString(),
                status: "success",
            })
            .eq("id", run.id)
            .eq("company_id", companyId);

        if (completeError) throw new Error(completeError.message);

        await logUserAction({
            action: "automation_engine_executed",
            entityType: "automation_run",
            entityId: run.id,
            companyId,
            officeId: context.activeOffice?.id ?? null,
            afterData: {
                trigger_source: triggerSource,
                generated_tasks: generatedTasks,
                notifications_queued: notificationsQueued,
                duration_ms: completedAt.getTime() - startedAt.getTime(),
            } as Json,
        });

        return {
            runId: run.id,
            status: "success",
            generatedTasks,
            notificationsQueued,
            retryAttempts: 0,
            failureReason: null,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Automation execution failed.";
        await supabase
            .from("automation_runs")
            .update({
                completed_at: new Date().toISOString(),
                error_message: message,
                status: "failed",
            })
            .eq("id", run.id)
            .eq("company_id", companyId);

        await logUserAction({
            action: "automation_engine_failed",
            entityType: "automation_run",
            entityId: run.id,
            companyId,
            officeId: context.activeOffice?.id ?? null,
            afterData: { trigger_source: triggerSource, failure_reason: message } as Json,
        });

        return {
            runId: run.id,
            status: "failed",
            generatedTasks: 0,
            notificationsQueued: 0,
            retryAttempts: 0,
            failureReason: message,
        };
    }
}

export async function retryFailedNotificationDispatches(context: AuthContext): Promise<EngineResult> {
    const companyId = context.activeCompany?.id;
    if (!companyId) throw new Error("Active company is required to retry notifications.");

    const supabase = await createSupabaseServerClient();
    const startedAt = new Date();
    const { data: run, error: runError } = await supabase
        .from("automation_runs")
        .insert({
            company_id: companyId,
            started_at: startedAt.toISOString(),
            status: "running",
        })
        .select("*")
        .single();

    if (runError) throw new Error(runError.message);

    try {
        const { data: failures, error: failureError } = await supabase
            .from("notification_failures")
            .select("*")
            .eq("company_id", companyId)
            .is("resolved_at", null)
            .order("created_at", { ascending: true })
            .limit(25);

        if (failureError) throw new Error(failureError.message);

        let retryAttempts = 0;
        for (const failure of failures ?? []) {
            if (!failure.message_recipient_id) continue;

            const { count } = await supabase
                .from("message_delivery_attempts")
                .select("id", { count: "exact", head: true })
                .eq("company_id", companyId)
                .eq("message_recipient_id", failure.message_recipient_id);

            const attemptNumber = (count ?? 0) + 1;
            const retryStatus = attemptNumber >= 4 ? "failed_final" : "retry_queued";

            const { error: attemptError } = await supabase.from("message_delivery_attempts").insert({
                attempt_number: attemptNumber,
                company_id: companyId,
                error_code: attemptNumber >= 4 ? "MAX_RETRIES" : null,
                error_message: attemptNumber >= 4 ? "Maximum retry attempts reached." : null,
                message_recipient_id: failure.message_recipient_id,
                provider: "automation_retry",
                status: retryStatus,
            });

            if (attemptError) throw new Error(attemptError.message);
            retryAttempts += 1;

            await supabase
                .from("notification_failures")
                .update({
                    resolved_at: attemptNumber >= 4 ? new Date().toISOString() : null,
                    status: attemptNumber >= 4 ? "failed_final" : "retry_queued",
                })
                .eq("id", failure.id)
                .eq("company_id", companyId);
        }

        const completedAt = new Date();
        await supabase
            .from("automation_runs")
            .update({
                completed_at: completedAt.toISOString(),
                status: "success",
            })
            .eq("id", run.id)
            .eq("company_id", companyId);

        await logUserAction({
            action: "automation_notifications_retried",
            entityType: "automation_run",
            entityId: run.id,
            companyId,
            officeId: context.activeOffice?.id ?? null,
            afterData: {
                retry_attempts: retryAttempts,
                duration_ms: completedAt.getTime() - startedAt.getTime(),
            } as Json,
        });

        return {
            runId: run.id,
            status: "success",
            generatedTasks: 0,
            notificationsQueued: 0,
            retryAttempts,
            failureReason: null,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Notification retry failed.";
        await supabase
            .from("automation_runs")
            .update({
                completed_at: new Date().toISOString(),
                error_message: message,
                status: "failed",
            })
            .eq("id", run.id)
            .eq("company_id", companyId);

        return {
            runId: run.id,
            status: "failed",
            generatedTasks: 0,
            notificationsQueued: 0,
            retryAttempts: 0,
            failureReason: message,
        };
    }
}

async function ensureAutomationInfrastructure(supabase: SupabaseServer, companyId: string) {
    for (const definition of AUTOMATION_DEFINITIONS) {
        const { data: existingRule, error: ruleLookupError } = await supabase
            .from("automation_rules")
            .select("id")
            .eq("company_id", companyId)
            .eq("name", definition.name)
            .maybeSingle();

        if (ruleLookupError) throw new Error(ruleLookupError.message);

        if (!existingRule) {
            const { error } = await supabase.from("automation_rules").insert({
                actions: {
                    channels: ["in_app", "email_ready", "whatsapp_ready"],
                    escalation: ["office", "regional", "company_admin"],
                } as Json,
                active: true,
                company_id: companyId,
                conditions: { description: definition.description, frequency: definition.frequency } as Json,
                name: definition.name,
                trigger_type: definition.triggerType,
            });
            if (error) throw new Error(error.message);
        }

        const { data: existingJob, error: jobLookupError } = await supabase
            .from("scheduled_jobs")
            .select("id")
            .eq("company_id", companyId)
            .eq("key", definition.key)
            .maybeSingle();

        if (jobLookupError) throw new Error(jobLookupError.message);

        if (!existingJob) {
            const { error } = await supabase.from("scheduled_jobs").insert({
                active: true,
                company_id: companyId,
                key: definition.key,
                payload: {
                    automation_name: definition.name,
                    frequency: definition.frequency,
                    trigger_type: definition.triggerType,
                } as Json,
                schedule_expression: definition.scheduleExpression,
            });
            if (error) throw new Error(error.message);
        }
    }
}

async function dispatchNotification(input: {
    supabase: SupabaseServer;
    companyId: string;
    officeId: string | null;
    actorId: string | null;
    item: NotificationFeedItem & { automationKey: string };
    escalationLevel: number;
    taskId: string;
}) {
    const recipientType = recipientTypeFor(input.item.route, input.escalationLevel);
    const destination = destinationFor(input.item.route, input.escalationLevel);
    const channels = ["in_app", "email_ready", "whatsapp_ready"];

    const { error: notificationError } = await input.supabase.from("notifications").insert({
        channel: "in_app",
        company_id: input.companyId,
        delivery_status: "sent",
        is_read: false,
        message: input.item.message,
        office_id: input.item.route === "office" ? input.officeId : null,
        recipient_id: null,
        recipient_type: recipientType,
        title: input.item.title,
    });

    if (notificationError) throw new Error(notificationError.message);

    for (const channel of channels) {
        const { data: message, error: messageError } = await input.supabase
            .from("messages")
            .insert({
                body: input.item.message,
                company_id: input.companyId,
                created_by: input.actorId,
                office_id: input.item.route === "office" ? input.officeId : null,
                status: channel === "in_app" ? "sent" : "queued",
                subject: input.item.title,
            })
            .select("*")
            .single();

        if (messageError) throw new Error(messageError.message);

        const { data: recipient, error: recipientError } = await input.supabase
            .from("message_recipients")
            .insert({
                company_id: input.companyId,
                destination: `${channel}:${destination}`,
                message_id: message.id,
                recipient_id: null,
                recipient_type: recipientType,
                status: channel === "in_app" ? "sent" : "queued",
            })
            .select("*")
            .single();

        if (recipientError) throw new Error(recipientError.message);

        const { error: attemptError } = await input.supabase.from("message_delivery_attempts").insert({
            attempt_number: 1,
            company_id: input.companyId,
            error_code: null,
            error_message: null,
            message_recipient_id: recipient.id,
            provider: channel,
            provider_message_id: `automation-${input.taskId}-${channel}`,
            status: channel === "in_app" ? "delivered" : "queued",
        });

        if (attemptError) throw new Error(attemptError.message);
    }

    return channels.length;
}

function buildExecutiveSummary(criticalCount: number, warningCount: number) {
    if (!criticalCount && !warningCount) return null;
    return {
        id: "executive-summary",
        title: "Executive automation summary",
        message: `${criticalCount} critical and ${warningCount} warning automation signals require management review.`,
        severity: criticalCount ? "critical" : "warning",
        route: "admin",
        createdAt: new Date().toISOString(),
        deliveryStatus: "generated",
        automationKey: "executive_notifications",
    } as NotificationFeedItem & { automationKey: string };
}

function escalationLevelFor(item: NotificationFeedItem) {
    if (item.severity === "critical" && item.route === "admin") return 3;
    if (item.severity === "critical") return 2;
    return 1;
}

function recipientTypeFor(route: NotificationFeedItem["route"], escalationLevel: number) {
    if (escalationLevel >= 3) return "company_admin";
    if (escalationLevel === 2) return "regional";
    if (route === "employee") return "employee";
    if (route === "admin") return "company_admin";
    return "office";
}

function destinationFor(route: NotificationFeedItem["route"], escalationLevel: number) {
    if (escalationLevel >= 3) return "company-admin-command-centre";
    if (escalationLevel === 2) return "regional-operations-queue";
    if (route === "employee") return "employee-attendance-queue";
    return "office-operations-queue";
}
