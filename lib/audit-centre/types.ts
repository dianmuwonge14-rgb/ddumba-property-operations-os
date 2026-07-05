import type { Company, Office } from "@/lib/auth/types";
import type { Database } from "@/types/database.types";

export type AuditLogRow = Database["public"]["Tables"]["audit_logs"]["Row"];
export type UserRow = Database["public"]["Tables"]["users"]["Row"];
export type OfficeRow = Database["public"]["Tables"]["offices"]["Row"];

export type AuditSeverity = "critical" | "high" | "medium" | "low";
export type AuditModule =
    | "tenant"
    | "property"
    | "collection"
    | "promise"
    | "expense"
    | "attendance"
    | "automation"
    | "approval"
    | "settings"
    | "security"
    | "other";

export type AuditKpis = {
    totalEvents: number;
    criticalEvents: number;
    userActions: number;
    officeActions: number;
    automationActions: number;
    approvalActions: number;
};

export type AuditDiff = {
    field: string;
    before: string;
    after: string;
    severity: AuditSeverity;
};

export type AuditTimelineItem = {
    id: string;
    actorId: string | null;
    actorName: string;
    action: string;
    entityType: string;
    entityId: string | null;
    module: AuditModule;
    officeId: string | null;
    officeName: string;
    createdAt: string;
    severity: AuditSeverity;
    beforeState: Record<string, unknown> | null;
    afterState: Record<string, unknown> | null;
    diffs: AuditDiff[];
    differenceSummary: string;
    userAgent: string | null;
    ipAddress: string;
};

export type EntityHistoryGroup = {
    module: AuditModule;
    label: string;
    events: AuditTimelineItem[];
};

export type InvestigationSignal = {
    id: string;
    title: string;
    description: string;
    severity: AuditSeverity;
    count: number;
    module: AuditModule;
    recommendedAction: string;
};

export type ComplianceMetrics = {
    auditCompleteness: number;
    missingEvents: number;
    dataIntegrityScore: number;
    complianceScore: number;
    coverageByModule: Array<{ module: AuditModule; events: number; score: number }>;
};

export type ExportReport = {
    id: string;
    title: string;
    format: "pdf-ready" | "excel-ready" | "executive-summary";
    recordCount: number;
    generatedAt: string;
    description: string;
};

export type SearchOption = {
    label: string;
    value: string;
};

export type AuditCentreData = {
    company: Company | null;
    activeOffice: Office | null;
    kpis: AuditKpis;
    timeline: AuditTimelineItem[];
    entityHistory: EntityHistoryGroup[];
    investigationSignals: InvestigationSignal[];
    compliance: ComplianceMetrics;
    exports: ExportReport[];
    searchOptions: {
        users: SearchOption[];
        offices: SearchOption[];
        modules: SearchOption[];
        severities: SearchOption[];
    };
};
