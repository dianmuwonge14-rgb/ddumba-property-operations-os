import type { Company, Office } from "@/lib/auth/types";
import type { Database } from "@/types/database.types";

export type AutomationRunRow = Database["public"]["Tables"]["automation_runs"]["Row"];
export type AuditLogRow = Database["public"]["Tables"]["audit_logs"]["Row"];
export type SecurityEventRow = Database["public"]["Tables"]["security_events"]["Row"];
export type CollectionRow = Database["public"]["Tables"]["collections"]["Row"];
export type PromiseRow = Database["public"]["Tables"]["promises"]["Row"];
export type PropertyRow = Database["public"]["Tables"]["properties"]["Row"];
export type RoomRow = Database["public"]["Tables"]["rooms"]["Row"];
export type TenantRow = Database["public"]["Tables"]["tenants"]["Row"];
export type ExpenseRow = Database["public"]["Tables"]["expenses"]["Row"];
export type AttendanceEventRow = Database["public"]["Tables"]["attendance_events"]["Row"];
export type AiInsightRow = Database["public"]["Tables"]["ai_insights"]["Row"];
export type UserRow = Database["public"]["Tables"]["users"]["Row"];
export type RoleRow = Database["public"]["Tables"]["roles"]["Row"];
export type PermissionRow = Database["public"]["Tables"]["permissions"]["Row"];

export type LaunchStatus = "ready" | "watch" | "blocked";
export type LaunchTone = "green" | "orange" | "red" | "blue" | "purple" | "slate" | "cyan";

export type RouteGovernanceRow = {
    route: string;
    module: string;
    officeUser: string;
    officeManager: string;
    regionalManager: string;
    companyAdmin: string;
    ceo: string;
    permission: string;
    status: LaunchStatus;
};

export type ProductionHealth = {
    databaseHealth: number;
    routeHealth: number;
    automationHealth: number;
    securityHealth: number;
    auditHealth: number;
};

export type LaunchChecklistItem = {
    id: string;
    title: string;
    description: string;
    status: LaunchStatus;
    owner: string;
};

export type QualityScores = {
    uiQuality: number;
    securityReadiness: number;
    automationReadiness: number;
    auditReadiness: number;
    ceoReadiness: number;
    deploymentReadiness: number;
};

export type ExportReadinessItem = {
    id: string;
    title: string;
    format: "PDF" | "Excel" | "Executive";
    status: LaunchStatus;
    description: string;
};

export type ShowcaseScreen = {
    route: string;
    title: string;
    description: string;
    keyFeatures: string[];
    dataShown: string[];
    enterpriseScore: number;
};

export type LaunchReadinessData = {
    company: Company | null;
    activeOffice: Office | null;
    completedModules: ShowcaseScreen[];
    routeGovernance: RouteGovernanceRow[];
    health: ProductionHealth;
    checklist: LaunchChecklistItem[];
    quality: QualityScores;
    exports: ExportReadinessItem[];
    blockers: LaunchChecklistItem[];
    recommendedSteps: string[];
    rawCounts: {
        users: number;
        roles: number;
        permissions: number;
        collections: number;
        promises: number;
        properties: number;
        rooms: number;
        tenants: number;
        expenses: number;
        attendanceEvents: number;
        aiInsights: number;
        automationRuns: number;
        auditLogs: number;
        securityEvents: number;
    };
};
