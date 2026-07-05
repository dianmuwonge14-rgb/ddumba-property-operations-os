import { requirePermission } from "@/lib/auth/permissions";
import { getScopedSupabase } from "@/lib/auth/query";
import type {
    AuditCentreData,
    AuditDiff,
    AuditKpis,
    AuditLogRow,
    AuditModule,
    AuditSeverity,
    AuditTimelineItem,
    ComplianceMetrics,
    EntityHistoryGroup,
    ExportReport,
    InvestigationSignal,
    OfficeRow,
    UserRow,
} from "./types";

const SUPPORTED_HISTORY: Array<{ module: AuditModule; label: string; entities: string[] }> = [
    { module: "tenant", label: "Tenant History", entities: ["tenant", "tenants", "lease", "leases"] },
    { module: "property", label: "Property History", entities: ["property", "properties", "room", "rooms"] },
    { module: "collection", label: "Collection History", entities: ["collection", "collections", "collection_action"] },
    { module: "promise", label: "Promise History", entities: ["promise", "promises", "promise_followup"] },
    { module: "expense", label: "Expense History", entities: ["expense", "expenses"] },
    { module: "attendance", label: "Attendance History", entities: ["attendance", "attendance_event", "employee"] },
    { module: "automation", label: "Automation History", entities: ["automation_run", "automation_task", "automation_rule"] },
];

export async function getAuditCentreData(): Promise<AuditCentreData> {
    const context = await requirePermission("settings.view");
    const { supabase } = await getScopedSupabase();
    const companyId = context.activeCompany?.id;
    if (!companyId) return emptyData();

    const accessibleOfficeIds = new Set(context.offices.map((office) => office.id));
    const [auditResult, usersResult, officesResult] = await Promise.all([
        supabase.from("audit_logs").select("*").eq("company_id", companyId).order("created_at", { ascending: false }).limit(500),
        supabase.from("users").select("*").eq("company_id", companyId).order("full_name"),
        supabase.from("offices").select("*").eq("company_id", companyId).order("office_name"),
    ]);

    for (const result of [auditResult, usersResult, officesResult]) {
        if (result.error) throw new Error(result.error.message);
    }

    const offices = (officesResult.data ?? []).filter((office) => context.canAccessAllOffices || accessibleOfficeIds.has(office.id));
    const officeIds = new Set(offices.map((office) => office.id));
    const auditRows = (auditResult.data ?? []).filter((row) => !row.office_id || context.canAccessAllOffices || officeIds.has(row.office_id));
    const users = usersResult.data ?? [];
    const timeline = buildTimeline(auditRows, users, offices);

    return {
        company: context.activeCompany,
        activeOffice: context.activeOffice,
        kpis: buildKpis(timeline),
        timeline,
        entityHistory: buildEntityHistory(timeline),
        investigationSignals: buildInvestigationSignals(timeline),
        compliance: buildCompliance(timeline),
        exports: buildExports(timeline),
        searchOptions: {
            users: users.map((user) => ({ label: user.full_name, value: user.id })),
            offices: offices.map((office) => ({ label: office.office_name ?? office.name ?? "Office", value: office.id })),
            modules: moduleOptions(timeline),
            severities: ["critical", "high", "medium", "low"].map((severity) => ({ label: severity, value: severity })),
        },
    };
}

function buildTimeline(rows: AuditLogRow[], users: UserRow[], offices: OfficeRow[]): AuditTimelineItem[] {
    const userById = new Map(users.map((user) => [user.id, user]));
    const officeById = new Map(offices.map((office) => [office.id, office]));

    return rows.map((row) => {
        const beforeState = toRecord(row.before_data);
        const afterState = toRecord(row.after_data);
        const diffs = diffStates(beforeState, afterState);
        const auditModule = moduleFrom(row);
        const severity = severityFor(row, diffs);
        const actor = row.actor_id ? userById.get(row.actor_id) : null;
        const office = row.office_id ? officeById.get(row.office_id) : null;

        return {
            id: row.id,
            actorId: row.actor_id,
            actorName: actor?.full_name ?? "System",
            action: row.action,
            entityType: row.entity_type,
            entityId: row.entity_id,
            module: auditModule,
            officeId: row.office_id,
            officeName: office?.office_name ?? office?.name ?? "Company-wide",
            createdAt: row.created_at,
            severity,
            beforeState,
            afterState,
            diffs,
            differenceSummary: summaryFor(row, diffs),
            userAgent: row.user_agent,
            ipAddress: typeof row.ip_address === "string" ? row.ip_address : "not captured",
        };
    });
}

function buildKpis(timeline: AuditTimelineItem[]): AuditKpis {
    return {
        totalEvents: timeline.length,
        criticalEvents: timeline.filter((item) => item.severity === "critical").length,
        userActions: timeline.filter((item) => item.actorId).length,
        officeActions: timeline.filter((item) => item.officeId).length,
        automationActions: timeline.filter((item) => item.module === "automation").length,
        approvalActions: timeline.filter((item) => item.module === "approval").length,
    };
}

function buildEntityHistory(timeline: AuditTimelineItem[]): EntityHistoryGroup[] {
    return SUPPORTED_HISTORY.map((group) => ({
        module: group.module,
        label: group.label,
        events: timeline.filter((item) => group.entities.includes(item.entityType.toLowerCase()) || item.module === group.module).slice(0, 15),
    }));
}

function buildInvestigationSignals(timeline: AuditTimelineItem[]): InvestigationSignal[] {
    const deleted = timeline.filter((item) => riskyAction(item.action, ["delete", "deleted", "archive", "archived"]));
    const failedApprovals = timeline.filter((item) => item.module === "approval" && riskyAction(item.action, ["reject", "failed", "denied"]));
    const suspicious = timeline.filter((item) => item.severity === "critical" || item.diffs.some((diff) => diff.severity === "critical"));
    const repeatedEdits = repeatedEditSignals(timeline);
    const massChanges = massChangeSignals(timeline);

    return [
        signal("suspicious-activity", "Suspicious activity", "Critical audit events and sensitive data changes requiring investigation.", "critical", suspicious.length, "security", "Review actor, device, IP address, and before/after states."),
        signal("mass-changes", "Mass changes", "Users or systems with unusually high change volume in the audit window.", massChanges > 0 ? "high" : "low", massChanges, "other", "Validate operational reason and compare against approvals."),
        signal("failed-approvals", "Failed approvals", "Rejected, denied, or failed approval workflow events.", failedApprovals.length ? "high" : "low", failedApprovals.length, "approval", "Review approval chain and pending remediation."),
        signal("repeated-edits", "Repeated edits", "Same records changed repeatedly in the current audit window.", repeatedEdits > 0 ? "medium" : "low", repeatedEdits, "other", "Inspect replay diff history for repeated value changes."),
        signal("deleted-records", "Deleted or archived records", "Deletion and archive events that may require recovery or verification.", deleted.length ? "critical" : "low", deleted.length, "security", "Confirm authorisation and retain export-ready evidence."),
    ];
}

function buildCompliance(timeline: AuditTimelineItem[]): ComplianceMetrics {
    const modules = moduleOptions(timeline).map((option) => option.value as AuditModule);
    const missingActor = timeline.filter((item) => !item.actorId && item.actorName !== "System").length;
    const missingReplay = timeline.filter((item) => !item.beforeState && !item.afterState).length;
    const missingOffice = timeline.filter((item) => item.module !== "settings" && item.module !== "automation" && !item.officeId).length;
    const missingEvents = missingActor + missingReplay + missingOffice;
    const auditCompleteness = score(timeline.length - missingReplay, timeline.length);
    const dataIntegrityScore = score(timeline.length - missingEvents, timeline.length || 1);
    const complianceScore = Math.round((auditCompleteness * 0.45) + (dataIntegrityScore * 0.4) + (Math.min(100, modules.length * 10) * 0.15));

    return {
        auditCompleteness,
        missingEvents,
        dataIntegrityScore,
        complianceScore,
        coverageByModule: modules.map((module) => {
            const events = timeline.filter((item) => item.module === module).length;
            return { module, events, score: Math.min(100, events * 10) };
        }),
    };
}

function buildExports(timeline: AuditTimelineItem[]): ExportReport[] {
    const generatedAt = new Date().toISOString();
    return [
        {
            id: "executive-audit-summary",
            title: "Executive Audit Summary",
            format: "executive-summary",
            recordCount: timeline.length,
            generatedAt,
            description: "Board-ready audit summary with critical events, investigations, and compliance scoring.",
        },
        {
            id: "audit-evidence-pdf",
            title: "PDF-ready Audit Evidence Pack",
            format: "pdf-ready",
            recordCount: timeline.filter((item) => item.severity === "critical" || item.severity === "high").length,
            generatedAt,
            description: "Printable investigation pack with replay states and risk indicators.",
        },
        {
            id: "audit-ledger-excel",
            title: "Excel-ready Audit Ledger",
            format: "excel-ready",
            recordCount: timeline.length,
            generatedAt,
            description: "Structured rows suitable for spreadsheet export, filtering, and external audit review.",
        },
    ];
}

function diffStates(before: Record<string, unknown> | null, after: Record<string, unknown> | null): AuditDiff[] {
    const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
    return [...keys].flatMap((field) => {
        const beforeValue = before?.[field];
        const afterValue = after?.[field];
        if (stableValue(beforeValue) === stableValue(afterValue)) return [];
        return [{
            field,
            before: displayValue(beforeValue),
            after: displayValue(afterValue),
            severity: sensitiveField(field) ? "critical" : financialField(field) ? "high" : "medium",
        }];
    });
}

function moduleFrom(row: Pick<AuditLogRow, "entity_type" | "action">): AuditModule {
    const text = `${row.entity_type} ${row.action}`.toLowerCase();
    if (text.includes("tenant") || text.includes("lease")) return "tenant";
    if (text.includes("property") || text.includes("room")) return "property";
    if (text.includes("collection") || text.includes("payment")) return "collection";
    if (text.includes("promise")) return "promise";
    if (text.includes("expense")) return "expense";
    if (text.includes("attendance") || text.includes("employee")) return "attendance";
    if (text.includes("automation")) return "automation";
    if (text.includes("approval") || text.includes("withdrawal")) return "approval";
    if (text.includes("security") || text.includes("role") || text.includes("permission")) return "security";
    if (text.includes("setting") || text.includes("company") || text.includes("office")) return "settings";
    return "other";
}

function severityFor(row: AuditLogRow, diffs: AuditDiff[]): AuditSeverity {
    const text = `${row.entity_type} ${row.action}`.toLowerCase();
    if (riskyAction(text, ["delete", "deleted", "role", "permission", "security", "withdrawal", "failed", "rejected"])) return "critical";
    if (diffs.some((diff) => diff.severity === "critical")) return "critical";
    if (diffs.some((diff) => diff.severity === "high") || riskyAction(text, ["approve", "archive", "automation", "expense", "payment"])) return "high";
    if (diffs.length > 0) return "medium";
    return "low";
}

function summaryFor(row: AuditLogRow, diffs: AuditDiff[]) {
    if (diffs.length === 0) return `${row.action} recorded with no replayable field delta.`;
    const fields = diffs.slice(0, 3).map((diff) => diff.field).join(", ");
    return `${diffs.length} field${diffs.length === 1 ? "" : "s"} changed: ${fields}${diffs.length > 3 ? "..." : ""}.`;
}

function moduleOptions(timeline: AuditTimelineItem[]) {
    const modules = [...new Set(timeline.map((item) => item.module))].sort();
    return modules.map((module) => ({ label: module, value: module }));
}

function repeatedEditSignals(timeline: AuditTimelineItem[]) {
    const counts = new Map<string, number>();
    for (const item of timeline) {
        if (!item.entityId || item.diffs.length === 0) continue;
        const key = `${item.entityType}:${item.entityId}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.values()].filter((count) => count >= 3).length;
}

function massChangeSignals(timeline: AuditTimelineItem[]) {
    const counts = new Map<string, number>();
    for (const item of timeline) {
        const day = item.createdAt.slice(0, 10);
        const key = `${item.actorId ?? "system"}:${day}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.values()].filter((count) => count >= 20).length;
}

function signal(
    id: string,
    title: string,
    description: string,
    severity: AuditSeverity,
    count: number,
    module: AuditModule,
    recommendedAction: string,
): InvestigationSignal {
    return { id, title, description, severity, count, module, recommendedAction };
}

function riskyAction(value: string, patterns: string[]) {
    const lower = value.toLowerCase();
    return patterns.some((pattern) => lower.includes(pattern));
}

function sensitiveField(field: string) {
    const value = field.toLowerCase();
    return ["password", "pin", "role", "permission", "bank", "account", "national_id", "device"].some((item) => value.includes(item));
}

function financialField(field: string) {
    const value = field.toLowerCase();
    return ["amount", "balance", "rent", "paid", "expense", "target", "cash"].some((item) => value.includes(item));
}

function toRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
}

function stableValue(value: unknown) {
    if (value === undefined) return "undefined";
    return JSON.stringify(value);
}

function displayValue(value: unknown) {
    if (value === null || value === undefined) return "empty";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
}

function score(numerator: number, denominator: number) {
    if (!denominator) return 100;
    return Math.max(0, Math.min(100, Math.round((numerator / denominator) * 100)));
}

function emptyData(): AuditCentreData {
    return {
        company: null,
        activeOffice: null,
        kpis: {
            totalEvents: 0,
            criticalEvents: 0,
            userActions: 0,
            officeActions: 0,
            automationActions: 0,
            approvalActions: 0,
        },
        timeline: [],
        entityHistory: [],
        investigationSignals: [],
        compliance: {
            auditCompleteness: 0,
            missingEvents: 0,
            dataIntegrityScore: 0,
            complianceScore: 0,
            coverageByModule: [],
        },
        exports: [],
        searchOptions: {
            users: [],
            offices: [],
            modules: [],
            severities: [],
        },
    };
}
