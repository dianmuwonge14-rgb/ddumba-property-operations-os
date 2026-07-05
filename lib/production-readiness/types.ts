export type ReadinessCheck = {
    id: string;
    label: string;
    status: "pass" | "warning" | "fail" | "unknown";
    detail: string;
};

export type ProductionReadinessStatus = {
    score: number;
    version: string;
    environment: "Development" | "Production" | "Test";
    generatedAt: string;
    lastIntegrityAudit: string | null;
    lastFinancialReconciliation: string | null;
    lastDatabaseBackup: string | null;
    lastMonthlyRollover: string | null;
    liveSupabaseStatus: "pass" | "warning" | "fail";
    realtimeStatus: "pass" | "warning" | "fail";
    apiHealth: "pass" | "warning" | "fail";
    buildStatus: "pass" | "warning" | "fail";
    typeScriptStatus: "pass" | "warning" | "fail";
    checks: ReadinessCheck[];
};
