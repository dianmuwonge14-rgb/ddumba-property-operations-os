import type { Company, Office } from "@/lib/auth/types";
import type { Database } from "@/types/database.types";
import type { ProductionReadinessStatus } from "@/lib/production-readiness/types";

export type CompanyRow = Database["public"]["Tables"]["companies"]["Row"];
export type OfficeRow = Database["public"]["Tables"]["offices"]["Row"];
export type EmployeeRow = Database["public"]["Tables"]["employees"]["Row"];
export type UserRow = Database["public"]["Tables"]["users"]["Row"];
export type RoleRow = Database["public"]["Tables"]["roles"]["Row"];
export type PermissionRow = Database["public"]["Tables"]["permissions"]["Row"];
export type RolePermissionRow = Database["public"]["Tables"]["role_permissions"]["Row"];
export type UserOfficeRoleRow = Database["public"]["Tables"]["user_office_roles"]["Row"];
export type SecurityEventRow = Database["public"]["Tables"]["security_events"]["Row"];
export type UserDeviceRow = Database["public"]["Tables"]["user_devices"]["Row"];
export type AttendancePolicyRow = Database["public"]["Tables"]["attendance_policies"]["Row"];
export type GeofenceRow = Database["public"]["Tables"]["geofences"]["Row"];
export type GpsValidationRow = Database["public"]["Tables"]["gps_validations"]["Row"];
export type PublicHolidayRow = Database["public"]["Tables"]["public_holidays"]["Row"];
export type WorkScheduleRow = Database["public"]["Tables"]["work_schedules"]["Row"];
export type SystemSettingRow = Database["public"]["Tables"]["system_settings"]["Row"];
export type CompanySettingRow = Database["public"]["Tables"]["company_settings"]["Row"];
export type NotificationPreferenceRow = Database["public"]["Tables"]["notification_preferences"]["Row"];
export type AutomationRuleRow = Database["public"]["Tables"]["automation_rules"]["Row"];
export type AuditLogRow = Database["public"]["Tables"]["audit_logs"]["Row"];
export type PinCredentialRow = Database["public"]["Tables"]["pin_credentials"]["Row"];
export type DeviceAttendanceLockRow = Database["public"]["Tables"]["device_attendance_locks"]["Row"];
export type AttendanceEventRow = Database["public"]["Tables"]["attendance_events"]["Row"];
export type AiInsightRow = Database["public"]["Tables"]["ai_insights"]["Row"];
export type RoomRow = Database["public"]["Tables"]["rooms"]["Row"];
export type PropertyRow = Database["public"]["Tables"]["properties"]["Row"];
export type LandlordRow = Database["public"]["Tables"]["landlords"]["Row"];
export type CollectionRow = Database["public"]["Tables"]["collections"]["Row"];
export type ExpenseRow = Database["public"]["Tables"]["expenses"]["Row"];
export type LandlordPaymentRow = Database["public"]["Tables"]["landlord_payments"]["Row"];
export type TenantRow = Database["public"]["Tables"]["tenants"]["Row"];
export type LeaseRow = Database["public"]["Tables"]["leases"]["Row"];

export type RoomRentChangeRequestRow = {
    id: string;
    company_id: string;
    office_id: string | null;
    property_id: string | null;
    room_id: string;
    landlord_id: string | null;
    tenant_id: string | null;
    old_rent: number | string;
    new_rent: number | string;
    reason: string;
    effective_date: string;
    status: "pending" | "approved" | "rejected" | "direct_admin_change" | string;
    admin_comment: string | null;
    requested_by: string | null;
    decided_by: string | null;
    decided_at: string | null;
    created_at: string;
    updated_at: string;
};

export type LandlordAdvanceRow = {
    id: string;
    company_id: string;
    office_id: string | null;
    landlord_id: string;
    advance_amount: number | string;
    deducted_amount: number | string;
    remaining_balance: number | string;
    date_given: string;
    reason: string | null;
    note: string | null;
    status: "pending" | "partially_deducted" | "fully_deducted" | string;
    deducted_at: string | null;
    created_by: string | null;
    updated_by: string | null;
    created_at: string;
    updated_at: string;
};

export type AdminSeverity = "critical" | "high" | "medium" | "low" | "healthy";
export type AdminTone = "green" | "red" | "blue" | "orange" | "purple" | "slate" | "cyan";

export type AdminKpis = {
    companies: number;
    offices: number;
    employees: number;
    activeUsers: number;
    roles: number;
    permissions: number;
    securityScore: number;
    complianceScore: number;
};

export type OfficeGovernanceItem = {
    id: string;
    name: string;
    status: string;
    manager: string;
    collectionTarget: number;
    expenseBudget: number;
    schedules: number;
    holidays: number;
    geofences: number;
    governanceScore: number;
};

export type EmployeeAdminItem = {
    id: string;
    name: string;
    officeName: string;
    status: string;
    role: string;
    attendanceHealth: number;
    performanceScore: number;
    deviceCount: number;
};

export type PermissionMatrixRole = {
    roleId: string;
    roleName: string;
    scope: string;
    permissionKeys: string[];
    assignmentCount: number;
};

export type SecuritySignal = {
    id: string;
    title: string;
    description: string;
    severity: AdminSeverity;
    count: number;
    status: string;
};

export type DeviceManagementItem = {
    id: string;
    userName: string;
    deviceName: string;
    platform: string;
    status: string;
    trust: string;
    lastActivity: string | null;
    riskScore: number;
    historyCount: number;
};

export type AttendanceSecurityItem = {
    id: string;
    name: string;
    officeName: string;
    requireGps: boolean;
    requireApprovedDevice: boolean;
    checkInTime: string;
    graceMinutes: number;
    geofences: number;
    gpsPassRate: number;
};

export type PlatformConfigurationItem = {
    id: string;
    area: "company" | "branding" | "notifications" | "automation" | "audit" | "ai";
    title: string;
    configured: number;
    total: number;
    status: string;
};

export type GovernanceScorecard = {
    complianceScore: number;
    securityScore: number;
    auditScore: number;
    dataIntegrityScore: number;
    officeGovernanceScore: number;
};

export type RiskHeatMapItem = {
    id: string;
    label: string;
    category: string;
    riskScore: number;
    severity: AdminSeverity;
};

export type RentRollOfficeItem = {
    officeId: string;
    officeName: string;
    rooms: number;
    occupiedRooms: number;
    vacantRooms: number;
    expectedMonthlyRent: number;
    outstandingBalance: number;
    collectedThisMonth: number;
    collectionPercentage: number;
};

export type RentRollSummary = {
    companyTotal: RentRollOfficeItem;
    offices: RentRollOfficeItem[];
};

export type LandlordAssignmentIssue = {
    id: string;
    roomId: string;
    roomNumber: string;
    officeId: string | null;
    officeName: string;
    propertyId: string | null;
    propertyName: string;
    currentLandlordId: string | null;
    currentLandlordName: string;
    propertyLandlordId: string | null;
    propertyLandlordName: string | null;
    tenantName: string | null;
    monthlyRent: number;
    outstandingBalance: number;
    severity: AdminSeverity;
    reasons: string[];
    reviewed: boolean;
    reviewedAt: string | null;
    reviewedNote: string | null;
};

export type LandlordAssignmentAudit = {
    generatedAt: string;
    issues: LandlordAssignmentIssue[];
    landlordOptions: Array<{ id: string; name: string }>;
    totals: {
        reviewed: number;
        suspicious: number;
        critical: number;
        missingLandlord: number;
        propertyMismatch: number;
    };
};

export type LandlordRecoveryReminder = {
    landlordId: string | null;
    landlordName: string;
    officeName: string;
    vacantRooms: number;
    pendingRecovery: number;
    recovered: number;
    moneyAtRisk: number;
};

export type MonthlyFinanceOfficeItem = {
    officeId: string;
    officeName: string;
    expectedRentRoll: number;
    expectedCompanyCommission: number;
    expectedLandlordPayable: number;
    collectedThisMonth: number;
    landlordPaymentsMade: number;
    pendingLandlordPayments: number;
    landlordAdvancesGiven: number;
    landlordAdvancesRecovered: number;
    recoveryDeductionsRecovered: number;
    outstandingTenantBalances: number;
    expenses: number;
    payrollPaid: number;
    payrollLiability: number;
    employeeFines: number;
    profitLossToday: number;
    profitLossThisMonth: number;
    collectionProgress: number;
};

export type MonthlyFinanceSummary = {
    liveDataStatus: "live" | "error";
    liveDataError: string | null;
    payrollModuleStatus: string | null;
    lastSyncedAt: string;
    expectedRentRoll: number;
    expectedMonthlyCompanyCommissionIncome: number;
    expectedLandlordPayableThisMonth: number;
    totalCollectedFromTenantsThisMonth: number;
    actualCompanyCommissionCollectedSoFar: number;
    landlordPaymentsMadeSoFar: number;
    pendingLandlordPayments: number;
    totalLandlordMoneyHeld: number;
    unpaidLandlords: number;
    paidLandlords: number;
    totalOutstandingToLandlords: number;
    totalLandlordAdvances: number;
    activeLandlordAdvances: number;
    advanceDeductionsRecovered: number;
    recoveryDeductionsPending: number;
    recoveryDeductionsRecovered: number;
    outstandingCollections: number;
    employeeSalaryPayments: number;
    employeePayrollLiability: number;
    employeeFineSavings: number;
    expectedMonthlyProfit: number;
    netPosition: number;
    profitLossToday: number;
    profitLossThisMonth: number;
    collectionProgress: number;
    offices: MonthlyFinanceOfficeItem[];
    advances: MonthlyFinanceAdvanceItem[];
    expenses: MonthlyFinanceExpenseItem[];
    expensesByOffice: Array<{ officeId: string; officeName: string; total: number }>;
    expensesByCategory: Array<{ category: string; total: number }>;
    dailyExpenses: Array<{ date: string; total: number }>;
};

export type MonthlyFinanceAdvanceItem = {
    id: string;
    landlordId: string;
    landlordName: string;
    officeId: string | null;
    officeName: string;
    advanceAmount: number;
    dateGiven: string;
    reason: string;
    note: string;
    amountDeductedSoFar: number;
    remainingAdvanceBalance: number;
    status: string;
};

export type MonthlyFinanceExpenseItem = {
    id: string;
    officeId: string | null;
    officeName: string;
    expenseType: string;
    amount: number;
    date: string;
    paidBy: string;
    note: string;
    receiptUrl: string | null;
    approvalStatus: string;
};

export type AdminCentreData = {
    company: Company | null;
    activeOffice: Office | null;
    kpis: AdminKpis;
    offices: OfficeGovernanceItem[];
    employees: EmployeeAdminItem[];
    roles: PermissionMatrixRole[];
    permissions: PermissionRow[];
    securitySignals: SecuritySignal[];
    devices: DeviceManagementItem[];
    attendanceSecurity: AttendanceSecurityItem[];
    platformConfiguration: PlatformConfigurationItem[];
    governance: GovernanceScorecard;
    riskHeatMap: RiskHeatMapItem[];
    rentRoll: RentRollSummary;
    landlordAssignmentAudit: LandlordAssignmentAudit;
    landlordRecoveryReminders: {
        landlordsWithVacantRooms: number;
        landlordsWithUnrecoveredDebts: number;
        totalMoneyAtRisk: number;
        totalRecoveryPending: number;
        totalRecovered: number;
        items: LandlordRecoveryReminder[];
    };
    monthlyFinance: MonthlyFinanceSummary;
    oneDriveMaster: {
        provider: string;
        webUrl: string | null;
        localFilePath: string | null;
        companySheetName: string;
        officeSheetMap: Record<string, string>;
        lastSyncAt: string | null;
        lastSyncStatus: string;
        lastSyncError: string | null;
    } | null;
    productionReadiness: ProductionReadinessStatus | null;
    raw: {
        companies: CompanyRow[];
        offices: OfficeRow[];
        employees: EmployeeRow[];
        users: UserRow[];
        roles: RoleRow[];
        permissions: PermissionRow[];
        securityEvents: SecurityEventRow[];
        devices: UserDeviceRow[];
        policies: AttendancePolicyRow[];
        geofences: GeofenceRow[];
        gpsValidations: GpsValidationRow[];
        publicHolidays: PublicHolidayRow[];
        workSchedules: WorkScheduleRow[];
        systemSettings: SystemSettingRow[];
        companySettings: CompanySettingRow[];
        notificationPreferences: NotificationPreferenceRow[];
        automationRules: AutomationRuleRow[];
        auditLogs: AuditLogRow[];
        pinCredentials: PinCredentialRow[];
        userOfficeRoles: UserOfficeRoleRow[];
        deviceLocks: DeviceAttendanceLockRow[];
        attendanceEvents: AttendanceEventRow[];
            aiInsights: AiInsightRow[];
            rooms: RoomRow[];
            properties: PropertyRow[];
            landlords: LandlordRow[];
            collections: CollectionRow[];
            tenants: TenantRow[];
            leases: LeaseRow[];
            rentChangeRequests: RoomRentChangeRequestRow[];
        };
};
