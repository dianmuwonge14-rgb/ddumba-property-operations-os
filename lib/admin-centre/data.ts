import { requirePermission } from "@/lib/auth/permissions";
import { getScopedSupabase } from "@/lib/auth/query";
import { cache } from "react";
import { getProductionReadinessStatus } from "@/lib/production-readiness/data";
import type {
    AdminCentreData,
    AdminKpis,
    AdminSeverity,
    AttendanceEventRow,
    AttendancePolicyRow,
    CompanySettingRow,
    AttendanceSecurityItem,
    AuditLogRow,
    AutomationRuleRow,
    CollectionRow,
    DeviceAttendanceLockRow,
    DeviceManagementItem,
    EmployeeAdminItem,
    EmployeeRow,
    ExpenseRow,
    GeofenceRow,
    GovernanceScorecard,
    GpsValidationRow,
    LandlordAssignmentAudit,
    LandlordAssignmentIssue,
    LandlordAdvanceRow,
    LandlordRecoveryReminder,
    LandlordPaymentRow,
    LandlordRow,
    LeaseRow,
    OfficeGovernanceItem,
    OfficeRow,
    PermissionMatrixRole,
    PermissionRow,
    PlatformConfigurationItem,
    PropertyRow,
    PublicHolidayRow,
    RentRollOfficeItem,
    RentRollSummary,
    RiskHeatMapItem,
    RolePermissionRow,
    RoleRow,
    RoomRow,
    SecurityEventRow,
    TenantRow,
    SecuritySignal,
    UserDeviceRow,
    UserOfficeRoleRow,
    UserRow,
} from "./types";
import { ONEDRIVE_MASTER_SETTING_KEY, parseOneDriveConfig } from "@/lib/onedrive-master/sync";

const TIME_ZONE = "Africa/Kampala";

type OptionalQueryResult<T = Record<string, unknown>> = {
    data: T[];
    error: { message: string } | null;
};

function isSchemaCacheMissingTable(message: string) {
    const lower = message.toLowerCase();
    return lower.includes("could not find the table")
        || lower.includes("could not find table")
        || lower.includes("schema cache")
        || lower.includes("does not exist");
}

async function safeOptionalRows<T = Record<string, unknown>>(
    tableName: string,
    query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
    warnings: string[],
): Promise<OptionalQueryResult<T>> {
    try {
        const result = await query;
        if (result.error) {
            const message = result.error.message;
            warnings.push(`${tableName}: ${isSchemaCacheMissingTable(message) ? "module not initialized" : message}`);
            return { data: [], error: result.error };
        }
        return { data: result.data ?? [], error: null };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Could not load optional table.";
        warnings.push(`${tableName}: ${isSchemaCacheMissingTable(message) ? "module not initialized" : message}`);
        return { data: [], error: { message } };
    }
}

export const getAdminCentreData = cache(async function getAdminCentreData(): Promise<AdminCentreData> {
    const context = await requirePermission("settings.view");
    const { supabase } = await getScopedSupabase();
    const companyId = context.activeCompany?.id;
    if (!companyId) return emptyData();

    const startWindow = dateOffset(-30);
    const accessibleOfficeIds = new Set(context.offices.map((office) => office.id));
    const optionalWarnings: string[] = [];
    const dynamicSupabase = supabase as unknown as { from: (table: string) => ReturnType<typeof supabase.from> };
    const [
        companiesResult,
        officesResult,
        employeesResult,
        usersResult,
        rolesResult,
        permissionsResult,
        userOfficeRolesResult,
        securityEventsResult,
        devicesResult,
        policiesResult,
        geofencesResult,
        gpsResult,
        holidaysResult,
        schedulesResult,
        settingsResult,
        companySettingsResult,
        notificationPrefsResult,
        automationRulesResult,
        auditLogsResult,
        pinResult,
        deviceLocksResult,
        attendanceResult,
        aiInsightsResult,
        roomsData,
        propertiesResult,
        landlordsResult,
        collectionsResult,
        expensesResult,
        landlordPaymentsResult,
        landlordMonthlyPayablePaymentsResult,
        landlordAdvancesResult,
        landlordPayablesResult,
        employeePayrollMonthsResult,
        employeeSalaryPaymentsResult,
        employeeFinesResult,
        tenantsResult,
        leasesResult,
        vacatedDebtsResult,
        rentChangeRequestsResult,
    ] = await Promise.all([
        supabase.from("companies").select("*").eq("id", companyId),
        supabase.from("offices").select("*").eq("company_id", companyId).order("office_name"),
        supabase.from("employees").select("*").eq("company_id", companyId).order("full_name"),
        supabase.from("users").select("*").eq("company_id", companyId).order("full_name"),
        supabase.from("roles").select("*").or(`company_id.eq.${companyId},company_id.is.null`).order("name"),
        supabase.from("permissions").select("*").order("category").order("name"),
        supabase.from("user_office_roles").select("*").eq("company_id", companyId),
        supabase.from("security_events").select("*").eq("company_id", companyId).gte("created_at", isoStart(startWindow)).order("created_at", { ascending: false }).limit(150),
        supabase.from("user_devices").select("*").eq("company_id", companyId).order("last_seen_at", { ascending: false, nullsFirst: false }),
        supabase.from("attendance_policies").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
        supabase.from("geofences").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
        supabase.from("gps_validations").select("*").eq("company_id", companyId).gte("created_at", isoStart(startWindow)).order("created_at", { ascending: false }).limit(200),
        supabase.from("public_holidays").select("*").or(`company_id.eq.${companyId},company_id.is.null`).order("holiday_date", { ascending: true }),
        supabase.from("work_schedules").select("*").eq("company_id", companyId).order("name"),
        supabase.from("system_settings").select("*").order("key"),
        supabase.from("company_settings").select("*").eq("company_id", companyId).order("key"),
        supabase.from("notification_preferences").select("*").eq("company_id", companyId),
        supabase.from("automation_rules").select("*").eq("company_id", companyId).order("name"),
        supabase.from("audit_logs").select("*").eq("company_id", companyId).gte("created_at", isoStart(startWindow)).order("created_at", { ascending: false }).limit(200),
        supabase.from("pin_credentials").select("*").eq("company_id", companyId),
        supabase.from("device_attendance_locks").select("*").eq("company_id", companyId),
        supabase.from("attendance_events").select("*").eq("company_id", companyId).gte("event_time", isoStart(startWindow)).order("event_time", { ascending: false }).limit(300),
        supabase.from("ai_insights").select("*").eq("company_id", companyId).order("created_at", { ascending: false, nullsFirst: false }).limit(80),
        fetchAllAdminRooms({ supabase, companyId }),
        supabase.from("properties").select("*").eq("company_id", companyId),
        supabase.from("landlords").select("*").eq("company_id", companyId).neq("status", "archived").order("full_name"),
        supabase.from("collections").select("*").eq("company_id", companyId).gte("paid_at", monthStartIso()),
        supabase.from("expenses").select("*").eq("company_id", companyId).gte("expense_date", monthStartDate()),
        supabase.from("landlord_payments").select("*").eq("company_id", companyId).gte("paid_at", monthStartIso()),
        dynamicSupabase
            .from("landlord_monthly_payable_payments")
            .select("*")
            .eq("company_id", companyId)
            .gte("paid_at", monthStartIso()),
        dynamicSupabase
            .from("landlord_advances")
            .select("*")
            .eq("company_id", companyId),
        dynamicSupabase
            .from("landlord_monthly_payables")
            .select("*")
            .eq("company_id", companyId)
            .neq("status", "archived"),
        safeOptionalRows("employee_payroll_months", dynamicSupabase
            .from("employee_payroll_months")
            .select("*")
            .eq("company_id", companyId)
            .eq("month_key", monthStartDate())
            .eq("active", true), optionalWarnings),
        safeOptionalRows("employee_salary_payments", dynamicSupabase
            .from("employee_salary_payments")
            .select("*")
            .eq("company_id", companyId)
            .eq("month_key", monthStartDate()), optionalWarnings),
        safeOptionalRows("employee_fines", dynamicSupabase
            .from("employee_fines")
            .select("*")
            .eq("company_id", companyId)
            .eq("month_key", monthStartDate())
            .eq("active", true), optionalWarnings),
        supabase.from("tenants").select("*").eq("company_id", companyId),
        supabase.from("leases").select("*").eq("company_id", companyId).eq("status", "active"),
        dynamicSupabase
            .from("vacated_tenant_debts")
            .select("*")
            .eq("company_id", companyId),
        dynamicSupabase
            .from("room_rent_change_requests")
            .select("*")
            .eq("company_id", companyId)
            .order("created_at", { ascending: false })
            .limit(100),
    ]);

    for (const result of [
        companiesResult,
        officesResult,
        employeesResult,
        usersResult,
        rolesResult,
        permissionsResult,
        userOfficeRolesResult,
        securityEventsResult,
        devicesResult,
        policiesResult,
        geofencesResult,
        gpsResult,
        holidaysResult,
        schedulesResult,
        settingsResult,
        companySettingsResult,
        notificationPrefsResult,
        automationRulesResult,
        auditLogsResult,
        pinResult,
        deviceLocksResult,
        attendanceResult,
        aiInsightsResult,
        propertiesResult,
        landlordsResult,
        tenantsResult,
        leasesResult,
        rentChangeRequestsResult,
    ]) {
        if (result.error) throw new Error(result.error.message);
    }

    const offices = (officesResult.data ?? []).filter((office) => context.canAccessAllOffices || accessibleOfficeIds.has(office.id));
    const officeIds = new Set(offices.map((office) => office.id));
    const employees = filterByNullableOffice(employeesResult.data ?? [], officeIds, context.canAccessAllOffices);
    const users = usersResult.data ?? [];
    const roles = rolesResult.data ?? [];
    const permissions = permissionsResult.data ?? [];
    const roleIds = roles.map((role) => role.id);
    const rolePermissions = roleIds.length ? await fetchRolePermissions(roleIds) : [];
    const assignments = filterAssignments(userOfficeRolesResult.data ?? [], officeIds, context.canAccessAllOffices);
    const securityEvents = filterByNullableOffice(securityEventsResult.data ?? [], officeIds, context.canAccessAllOffices);
    const devices = devicesResult.data ?? [];
    const policies = filterByNullableOffice(policiesResult.data ?? [], officeIds, context.canAccessAllOffices);
    const geofences = filterByNullableOffice(geofencesResult.data ?? [], officeIds, context.canAccessAllOffices);
    const gpsValidations = filterByNullableOffice(gpsResult.data ?? [], officeIds, context.canAccessAllOffices);
    const publicHolidays = holidaysResult.data ?? [];
    const workSchedules = schedulesResult.data ?? [];
    const auditLogs = filterByNullableOffice(auditLogsResult.data ?? [], officeIds, context.canAccessAllOffices);
    const attendanceEvents = filterByOffice(attendanceResult.data ?? [], officeIds, context.canAccessAllOffices);
    const deviceLocks = deviceLocksResult.data ?? [];
    const pinCredentials = pinResult.data ?? [];
    const automationRules = automationRulesResult.data ?? [];
    const settings = settingsResult.data ?? [];
    const companySettings = companySettingsResult.data ?? [];
    const notificationPreferences = notificationPrefsResult.data ?? [];
    const aiInsights = filterByNullableOffice(aiInsightsResult.data ?? [], officeIds, context.canAccessAllOffices);
    const rooms = filterByNullableOffice(roomsData, officeIds, context.canAccessAllOffices);
    const properties = filterByNullableOffice(propertiesResult.data ?? [], officeIds, context.canAccessAllOffices);
    const landlords = landlordsResult.data ?? [];
    const collections = filterByNullableOffice(collectionsResult.error ? [] : collectionsResult.data ?? [], officeIds, context.canAccessAllOffices);
    const expenses = filterByNullableOffice(expensesResult.error ? [] : expensesResult.data ?? [], officeIds, context.canAccessAllOffices);
    const landlordPayments = filterByNullableOffice(landlordPaymentsResult.error ? [] : landlordPaymentsResult.data ?? [], officeIds, context.canAccessAllOffices);
    const landlordMonthlyPayablePayments = filterByNullableOffice(
        (landlordMonthlyPayablePaymentsResult.error ? [] : landlordMonthlyPayablePaymentsResult.data ?? []) as Array<Record<string, unknown> & { office_id: string | null }>,
        officeIds,
        context.canAccessAllOffices,
    );
    const landlordAdvances = filterByNullableOffice(
        (landlordAdvancesResult.error ? [] : landlordAdvancesResult.data ?? []) as LandlordAdvanceRow[],
        officeIds,
        context.canAccessAllOffices,
    );
    const landlordPayables = filterByNullableOffice(
        (landlordPayablesResult.error ? [] : landlordPayablesResult.data ?? []) as Array<Record<string, unknown> & { office_id: string | null }>,
        officeIds,
        context.canAccessAllOffices,
    );
    const employeePayrollModuleWarnings = optionalWarnings.filter((warning) => warning.startsWith("employee_"));
    const employeePayrollMonths = filterByNullableOffice(
        (employeePayrollMonthsResult.error ? [] : employeePayrollMonthsResult.data ?? []) as Array<Record<string, unknown> & { office_id: string | null }>,
        officeIds,
        context.canAccessAllOffices,
    );
    const employeeSalaryPayments = filterByNullableOffice(
        (employeeSalaryPaymentsResult.error ? [] : employeeSalaryPaymentsResult.data ?? []) as Array<Record<string, unknown> & { office_id: string | null }>,
        officeIds,
        context.canAccessAllOffices,
    );
    const employeeFines = filterByNullableOffice(
        (employeeFinesResult.error ? [] : employeeFinesResult.data ?? []) as Array<Record<string, unknown> & { office_id: string | null }>,
        officeIds,
        context.canAccessAllOffices,
    );
    const tenants = filterByNullableOffice(tenantsResult.data ?? [], officeIds, context.canAccessAllOffices);
    const leases = filterByOffice(leasesResult.data ?? [], officeIds, context.canAccessAllOffices);
    const vacatedDebts = filterByNullableOffice(
        (vacatedDebtsResult.error ? [] : vacatedDebtsResult.data ?? []) as Array<Record<string, unknown> & { office_id: string | null }>,
        officeIds,
        context.canAccessAllOffices,
    );

    const officeGovernance = buildOfficeGovernance({ offices, employees, policies, geofences, publicHolidays, workSchedules });
    const employeeAdmin = buildEmployeeAdmin({ employees, offices, devices, attendanceEvents });
    const permissionMatrix = buildPermissionMatrix({ roles, permissions, rolePermissions, assignments });
    const securitySignals = buildSecuritySignals({ securityEvents, devices, pinCredentials, auditLogs });
    const deviceManagement = buildDevices({ devices, users, securityEvents, deviceLocks });
    const attendanceSecurity = buildAttendanceSecurity({ policies, offices, geofences, gpsValidations });
    const platformConfiguration = buildPlatformConfiguration({ settings, notificationPreferences, automationRules, auditLogs, aiInsights, companies: companiesResult.data ?? [] });
    const governance = buildGovernance({
        offices: officeGovernance,
        securitySignals,
        devices: deviceManagement,
        auditLogs,
        users,
        employees,
        permissions,
        roles,
    });

    const productionReadiness = await getProductionReadinessStatus();

    return {
        company: context.activeCompany,
        activeOffice: context.activeOffice,
        kpis: buildKpis({ contextCompanies: context.companies.length, offices, employees, users, roles, permissions, governance }),
        offices: officeGovernance,
        employees: employeeAdmin,
        roles: permissionMatrix,
        permissions,
        securitySignals,
        devices: deviceManagement,
        attendanceSecurity,
        platformConfiguration,
        governance,
        riskHeatMap: buildRiskHeatMap({ offices: officeGovernance, employees: employeeAdmin, devices: deviceManagement, signals: securitySignals }),
        rentRoll: buildRentRoll({ offices, rooms, collections, tenants, leases }),
        landlordAssignmentAudit: buildLandlordAssignmentAudit({ offices, rooms, properties, landlords, tenants, leases, auditLogs }),
        landlordRecoveryReminders: buildLandlordRecoveryReminders({ offices, rooms, landlords, leases, vacatedDebts }),
        monthlyFinance: buildMonthlyFinance({
            offices,
            rooms,
            landlords,
            collections,
            expenses,
            landlordPayments,
            landlordMonthlyPayablePayments,
            landlordAdvances,
            landlordPayables,
            employeePayrollMonths,
            employeeSalaryPayments,
            employeeFines,
            tenants,
            vacatedDebts,
            companySettings,
            payrollModuleStatus: employeePayrollModuleWarnings.length
                ? `Payroll module not initialized (${employeePayrollModuleWarnings.map((warning) => warning.split(":")[0]).join(", ")}).`
                : null,
            liveDataError: [
                collectionsResult.error?.message,
                expensesResult.error?.message,
                landlordPaymentsResult.error?.message,
                landlordMonthlyPayablePaymentsResult.error?.message,
                landlordAdvancesResult.error?.message,
                landlordPayablesResult.error?.message,
                vacatedDebtsResult.error?.message,
            ].filter(Boolean).join("; ") || null,
        }),
        oneDriveMaster: buildOneDriveMaster(companySettings, offices),
        productionReadiness,
        raw: {
            companies: companiesResult.data ?? [],
            offices,
            employees,
            users,
            roles,
            permissions,
            securityEvents,
            devices,
            policies,
            geofences,
            gpsValidations,
            publicHolidays,
            workSchedules,
            systemSettings: settings,
            companySettings,
            notificationPreferences,
            automationRules,
            auditLogs,
            pinCredentials,
            userOfficeRoles: assignments,
            deviceLocks,
            attendanceEvents,
            aiInsights,
            rooms,
            properties,
            landlords,
            collections,
            tenants,
            leases,
            rentChangeRequests: rentChangeRequestsResult.data ?? [],
        },
    };

    async function fetchRolePermissions(ids: string[]) {
        const { data, error } = await supabase.from("role_permissions").select("*").in("role_id", ids);
        if (error) throw new Error(error.message);
        return data ?? [];
    }
});

export const getAdminCentreOverviewData = cache(async function getAdminCentreOverviewData(): Promise<AdminCentreData> {
    const context = await requirePermission("settings.view");
    const { supabase } = await getScopedSupabase();
    const companyId = context.activeCompany?.id;
    if (!companyId) return emptyData();

    const startWindow = dateOffset(-30);
    const [
        companiesResult,
        officesResult,
        employeesResult,
        usersResult,
        rolesResult,
        permissionsResult,
        securityEventsResult,
        devicesResult,
        pinResult,
        auditLogsResult,
        policiesResult,
        geofencesResult,
        gpsResult,
        holidaysResult,
        schedulesResult,
        attendanceResult,
    ] = await Promise.all([
        supabase.from("companies").select("*").eq("id", companyId),
        supabase.from("offices").select("*").eq("company_id", companyId).order("office_name"),
        supabase.from("employees").select("*").eq("company_id", companyId).order("full_name"),
        supabase.from("users").select("*").eq("company_id", companyId).order("full_name"),
        supabase.from("roles").select("*").or(`company_id.eq.${companyId},company_id.is.null`).order("name"),
        supabase.from("permissions").select("*").order("category").order("name"),
        supabase.from("security_events").select("*").eq("company_id", companyId).gte("created_at", isoStart(startWindow)).order("created_at", { ascending: false }).limit(80),
        supabase.from("user_devices").select("*").eq("company_id", companyId).order("last_seen_at", { ascending: false, nullsFirst: false }).limit(120),
        supabase.from("pin_credentials").select("*").eq("company_id", companyId),
        supabase.from("audit_logs").select("*").eq("company_id", companyId).gte("created_at", isoStart(startWindow)).order("created_at", { ascending: false }).limit(80),
        supabase.from("attendance_policies").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
        supabase.from("geofences").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
        supabase.from("gps_validations").select("*").eq("company_id", companyId).gte("created_at", isoStart(startWindow)).order("created_at", { ascending: false }).limit(80),
        supabase.from("public_holidays").select("*").or(`company_id.eq.${companyId},company_id.is.null`).order("holiday_date", { ascending: true }).limit(40),
        supabase.from("work_schedules").select("*").eq("company_id", companyId).order("name").limit(40),
        supabase.from("attendance_events").select("*").eq("company_id", companyId).gte("event_time", isoStart(startWindow)).order("event_time", { ascending: false }).limit(120),
    ]);

    for (const result of [
        companiesResult,
        officesResult,
        employeesResult,
        usersResult,
        rolesResult,
        permissionsResult,
        securityEventsResult,
        devicesResult,
        pinResult,
        auditLogsResult,
        policiesResult,
        geofencesResult,
        gpsResult,
        holidaysResult,
        schedulesResult,
        attendanceResult,
    ]) {
        if (result.error) throw new Error(result.error.message);
    }

    const offices = officesResult.data ?? [];
    const employees = employeesResult.data ?? [];
    const users = usersResult.data ?? [];
    const roles = rolesResult.data ?? [];
    const permissions = permissionsResult.data ?? [];
    const securityEvents = securityEventsResult.data ?? [];
    const devices = devicesResult.data ?? [];
    const pinCredentials = pinResult.data ?? [];
    const auditLogs = auditLogsResult.data ?? [];
    const policies = policiesResult.data ?? [];
    const geofences = geofencesResult.data ?? [];
    const gpsValidations = gpsResult.data ?? [];
    const publicHolidays = holidaysResult.data ?? [];
    const workSchedules = schedulesResult.data ?? [];
    const attendanceEvents = attendanceResult.data ?? [];

    const officeGovernance = buildOfficeGovernance({ offices, employees, policies, geofences, publicHolidays, workSchedules });
    const employeeAdmin = buildEmployeeAdmin({ employees, offices, devices, attendanceEvents });
    const securitySignals = buildSecuritySignals({ securityEvents, devices, pinCredentials, auditLogs });
    const deviceManagement = buildDevices({ devices, users, securityEvents, deviceLocks: [] });
    const attendanceSecurity = buildAttendanceSecurity({ policies, offices, geofences, gpsValidations });
    const governance = buildGovernance({
        offices: officeGovernance,
        securitySignals,
        devices: deviceManagement,
        auditLogs,
        users,
        employees,
        permissions,
        roles,
    });

    const base = emptyData();
    const productionReadiness = await getProductionReadinessStatus();
    return {
        ...base,
        company: context.activeCompany,
        activeOffice: context.activeOffice,
        kpis: buildKpis({ contextCompanies: context.companies.length, offices, employees, users, roles, permissions, governance }),
        offices: officeGovernance,
        employees: employeeAdmin.slice(0, 24),
        permissions,
        securitySignals,
        devices: deviceManagement.slice(0, 24),
        attendanceSecurity,
        governance,
        riskHeatMap: buildRiskHeatMap({
            offices: officeGovernance,
            employees: employeeAdmin,
            devices: deviceManagement,
            signals: securitySignals,
        }).slice(0, 12),
        productionReadiness,
        raw: {
            ...base.raw,
            companies: companiesResult.data ?? [],
            offices,
            employees,
            users,
            roles,
            permissions,
            securityEvents,
            devices,
            policies,
            geofences,
            gpsValidations,
            publicHolidays,
            workSchedules,
            auditLogs,
            pinCredentials,
            attendanceEvents,
        },
    };
});

function buildLandlordRecoveryReminders(input: {
    offices: OfficeRow[];
    rooms: RoomRow[];
    landlords: LandlordRow[];
    leases: LeaseRow[];
    vacatedDebts: Array<Record<string, unknown>>;
}): AdminCentreData["landlordRecoveryReminders"] {
    const officeById = new Map(input.offices.map((office) => [office.id, office.office_name ?? office.name ?? "Office"]));
    const landlordById = new Map(input.landlords.map((landlord) => [landlord.id, landlord.full_name]));
    const activeRoomIds = new Set(input.leases.map((lease) => lease.room_id));
    const vacantRoomsByLandlord = new Map<string, number>();
    for (const room of input.rooms) {
        const landlordId = room.landlord_id;
        if (!landlordId || activeRoomIds.has(room.id)) continue;
        vacantRoomsByLandlord.set(landlordId, (vacantRoomsByLandlord.get(landlordId) ?? 0) + 1);
    }

    const grouped = new Map<string, LandlordRecoveryReminder>();
    for (const debt of input.vacatedDebts) {
        const landlordId = typeof debt.landlord_id === "string" ? debt.landlord_id : null;
        const officeId = typeof debt.office_id === "string" ? debt.office_id : null;
        const key = landlordId ?? `office-${officeId ?? "unknown"}`;
        const existing = grouped.get(key) ?? {
            landlordId,
            landlordName: typeof debt.landlord_name === "string" ? debt.landlord_name : landlordId ? landlordById.get(landlordId) ?? "Landlord" : "Unassigned landlord",
            officeName: officeId ? officeById.get(officeId) ?? "Office" : "Company",
            vacantRooms: landlordId ? vacantRoomsByLandlord.get(landlordId) ?? 0 : 0,
            pendingRecovery: 0,
            recovered: 0,
            moneyAtRisk: 0,
        };
        existing.pendingRecovery += Math.max(0, Number(debt.remaining_amount ?? 0));
        existing.recovered += Math.max(0, Number(debt.recovered_amount ?? 0));
        existing.moneyAtRisk += Math.max(0, Number(debt.remaining_amount ?? 0));
        grouped.set(key, existing);
    }

    for (const [landlordId, vacantRooms] of vacantRoomsByLandlord.entries()) {
        if (grouped.has(landlordId)) {
            grouped.get(landlordId)!.vacantRooms = vacantRooms;
            continue;
        }
        grouped.set(landlordId, {
            landlordId,
            landlordName: landlordById.get(landlordId) ?? "Landlord",
            officeName: "Office",
            vacantRooms,
            pendingRecovery: 0,
            recovered: 0,
            moneyAtRisk: 0,
        });
    }

    const items = Array.from(grouped.values())
        .filter((item) => item.vacantRooms > 0 || item.pendingRecovery > 0)
        .sort((a, b) => b.moneyAtRisk + b.vacantRooms - (a.moneyAtRisk + a.vacantRooms));

    return {
        landlordsWithVacantRooms: items.filter((item) => item.vacantRooms > 0).length,
        landlordsWithUnrecoveredDebts: items.filter((item) => item.pendingRecovery > 0).length,
        totalMoneyAtRisk: items.reduce((total, item) => total + item.moneyAtRisk, 0),
        totalRecoveryPending: items.reduce((total, item) => total + item.pendingRecovery, 0),
        totalRecovered: items.reduce((total, item) => total + item.recovered, 0),
        items: items.slice(0, 12),
    };
}

function buildRentRoll(input: {
    offices: OfficeRow[];
    rooms: RoomRow[];
    collections: CollectionRow[];
    tenants: TenantRow[];
    leases: LeaseRow[];
}): RentRollSummary {
    const activeRoomIds = new Set([
        ...input.leases.map((lease) => lease.room_id),
        ...input.tenants.map((tenant) => tenant.room_id).filter((id): id is string => Boolean(id)),
    ]);
    const offices = input.offices.map((office): RentRollOfficeItem => {
        const rooms = input.rooms.filter((room) => room.office_id === office.id);
        const roomIds = new Set(rooms.map((room) => room.id));
        const collectedThisMonth = input.collections
            .filter((collection) => collection.office_id === office.id && (!collection.room_id || roomIds.has(collection.room_id)))
            .reduce((total, collection) => total + amount(collection.amount_paid ?? collection.amount), 0);
        const expectedMonthlyRent = rooms.reduce((total, room) => total + amount(room.monthly_rent), 0);
        const outstandingBalance = rooms.reduce((total, room) => total + amount(room.outstanding_balance), 0);
        const occupiedRooms = rooms.filter((room) => activeRoomIds.has(room.id) || ["occupied", "active"].includes((room.status ?? "").toLowerCase())).length;
        return {
            officeId: office.id,
            officeName: office.office_name ?? office.name ?? "Office",
            rooms: rooms.length,
            occupiedRooms,
            vacantRooms: Math.max(0, rooms.length - occupiedRooms),
            expectedMonthlyRent,
            outstandingBalance,
            collectedThisMonth,
            collectionPercentage: percent(collectedThisMonth, expectedMonthlyRent),
        };
    }).sort((a, b) => b.expectedMonthlyRent - a.expectedMonthlyRent);

    const companyTotal = offices.reduce<RentRollOfficeItem>((total, office) => ({
        officeId: "company",
        officeName: "Company Total",
        rooms: total.rooms + office.rooms,
        occupiedRooms: total.occupiedRooms + office.occupiedRooms,
        vacantRooms: total.vacantRooms + office.vacantRooms,
        expectedMonthlyRent: total.expectedMonthlyRent + office.expectedMonthlyRent,
        outstandingBalance: total.outstandingBalance + office.outstandingBalance,
        collectedThisMonth: total.collectedThisMonth + office.collectedThisMonth,
        collectionPercentage: 0,
    }), {
        officeId: "company",
        officeName: "Company Total",
        rooms: 0,
        occupiedRooms: 0,
        vacantRooms: 0,
        expectedMonthlyRent: 0,
        outstandingBalance: 0,
        collectedThisMonth: 0,
        collectionPercentage: 0,
    });
    companyTotal.collectionPercentage = percent(companyTotal.collectedThisMonth, companyTotal.expectedMonthlyRent);

    return { companyTotal, offices };
}

function buildMonthlyFinance(input: {
    offices: OfficeRow[];
    rooms: RoomRow[];
    landlords: LandlordRow[];
    collections: CollectionRow[];
    expenses: ExpenseRow[];
    landlordPayments: LandlordPaymentRow[];
    landlordMonthlyPayablePayments: Array<Record<string, unknown>>;
    landlordAdvances: LandlordAdvanceRow[];
    landlordPayables: Array<Record<string, unknown>>;
    employeePayrollMonths: Array<Record<string, unknown>>;
    employeeSalaryPayments: Array<Record<string, unknown>>;
    employeeFines: Array<Record<string, unknown>>;
    tenants: TenantRow[];
    vacatedDebts: Array<Record<string, unknown>>;
    companySettings: CompanySettingRow[];
    payrollModuleStatus: string | null;
    liveDataError: string | null;
}): AdminCentreData["monthlyFinance"] {
    const defaultCommissionRate = parseCommissionSetting(
        input.companySettings.find((setting) => setting.key === "default_landlord_commission_rate")?.value,
        10,
    );
    const landlordById = new Map(input.landlords.map((landlord) => [landlord.id, landlord]));
    const officeById = new Map(input.offices.map((office) => [office.id, office.office_name ?? office.name ?? "Office"]));
    const activeAdvances = input.landlordAdvances.filter((advance) => isActiveLandlordAdvance(advance as unknown as Record<string, unknown>));
    const monthAdvances = input.landlordAdvances.filter((advance) => isThisMonthDateValue(advance.date_given ?? advance.created_at));
    const currentMonthPayables = input.landlordPayables.filter((payable) => isThisMonthDateValue(String(payable.settlement_month ?? "")));
    const landlordMonthlyPaymentRows = input.landlordMonthlyPayablePayments.filter((payment) => isThisMonthDateValue(String(payment.paid_at ?? payment.created_at ?? "")));
    const isApprovedExpense = (expense: ExpenseRow) => {
        const status = String((expense as ExpenseRow & { status?: string | null; approval_status?: string | null }).status ?? (expense as ExpenseRow & { approval_status?: string | null }).approval_status ?? "").toLowerCase();
        return Boolean(expense.approved_at) || status === "approved" || status === "paid";
    };
    const approvedExpenses = input.expenses.filter(isApprovedExpense);
    const advanceItems = input.landlordAdvances
        .map((advance) => {
            const landlord = landlordById.get(advance.landlord_id);
            const officeName = advance.office_id ? officeById.get(advance.office_id) ?? "Office" : "Company";
            return {
                id: advance.id,
                landlordId: advance.landlord_id,
                landlordName: landlord?.full_name ?? "Landlord",
                officeId: advance.office_id,
                officeName,
                advanceAmount: landlordAdvanceTotal(advance as unknown as Record<string, unknown>),
                dateGiven: advance.date_given ?? advance.created_at,
                reason: advance.reason ?? "Landlord advance",
                note: advance.note ?? "",
                amountDeductedSoFar: amount(advance.deducted_amount),
                remainingAdvanceBalance: landlordAdvanceRemaining(advance as unknown as Record<string, unknown>),
                status: advance.status ?? "pending",
            };
        })
        .sort((a, b) => b.remainingAdvanceBalance - a.remainingAdvanceBalance || new Date(b.dateGiven).getTime() - new Date(a.dateGiven).getTime());
    const expenseItems = input.expenses
        .map((expense) => ({
            id: expense.id,
            officeId: expense.office_id,
            officeName: expense.office_id ? officeById.get(expense.office_id) ?? "Office" : "Company",
            expenseType: expense.category ?? expense.item ?? "General expense",
            amount: amount(expense.amount),
            date: expense.expense_date ?? expense.created_at ?? "",
            paidBy: expense.vendor ?? expense.submitted_by ?? expense.entered_by ?? "Not recorded",
            note: expense.description ?? expense.item ?? "",
            receiptUrl: expense.receipt_url ?? null,
            approvalStatus: expense.approved_at ? "approved" : "pending",
        }))
        .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
    const recoveredDebtsThisMonth = input.vacatedDebts
        .filter((debt) => isThisMonthDateValue(typeof debt.updated_at === "string" ? debt.updated_at : typeof debt.created_at === "string" ? debt.created_at : null))
        .reduce((total, debt) => total + amount(debt.recovered_amount), 0);
    const offices = input.offices.map((office) => {
        const rooms = input.rooms.filter((room) => room.office_id === office.id);
        const collections = input.collections.filter((collection) => collection.office_id === office.id);
        const expenses = approvedExpenses.filter((expense) => expense.office_id === office.id);
        const landlordPayments = input.landlordPayments.filter((payment) => payment.office_id === office.id);
        const landlordMonthlyPayments = landlordMonthlyPaymentRows.filter((payment) => payment.office_id === office.id);
        const officePayables = currentMonthPayables.filter((payable) => payable.office_id === office.id);
        const officePayrollMonths = input.employeePayrollMonths.filter((payroll) => payroll.office_id === office.id);
        const officeSalaryPayments = input.employeeSalaryPayments.filter((payment) => payment.office_id === office.id);
        const officeEmployeeFines = input.employeeFines.filter((fine) => fine.office_id === office.id);
        const officeMonthAdvances = monthAdvances.filter((advance) => advance.office_id === office.id);
        const officeAdvances = input.landlordAdvances.filter((advance) => advance.office_id === office.id);
        const officeVacatedDebts = input.vacatedDebts.filter((debt) => debt.office_id === office.id);
        const tenants = input.tenants.filter((tenant) => tenant.office_id === office.id || (tenant.room_id && rooms.some((room) => room.id === tenant.room_id)));
        const expectedRentRoll = rooms.reduce((total, room) => total + amount(room.monthly_rent), 0);
        const landlordFinance = calculateLandlordFinanceForRooms({ rooms, landlordById, defaultCommissionRate });
        const expectedCompanyCommission = officePayables.length
            ? officePayables.reduce((total, payable) => total + amount(payable.commission_amount), 0)
            : landlordFinance.companyCommission;
        const expectedLandlordPayable = officePayables.length
            ? officePayables.reduce((total, payable) => total + amount(payable.net_payable), 0)
            : landlordFinance.landlordPayable;
        const collectedThisMonth = collections.reduce((total, collection) => total + amount(collection.amount_paid ?? collection.amount), 0);
        const expenseTotal = expenses.reduce((total, expense) => total + amount(expense.amount), 0);
        const landlordPaymentsMade = landlordPayments.reduce((total, payment) => total + amount(payment.amount), 0) +
            landlordMonthlyPayments.reduce((total, payment) => total + amount(payment.amount), 0);
        const landlordAdvancesGiven = officeMonthAdvances.reduce((total, advance) => total + landlordAdvancePrincipal(advance as unknown as Record<string, unknown>), 0);
        const landlordAdvancesRecovered = officeAdvances
            .filter((advance) => isThisMonthDateValue(advance.deducted_at ?? advance.updated_at))
            .reduce((total, advance) => total + amount(advance.deducted_amount), 0);
        const recoveryDeductionsRecovered = officePayables.reduce((total, payable) => total + amount(payable.vacated_tenant_debt_deductions), 0) ||
            officeVacatedDebts.reduce((total, debt) => total + amount(debt.recovered_amount), 0);
        const pendingLandlordPayments = officePayables.length
            ? officePayables.reduce((total, payable) => total + amount(payable.unpaid_balance), 0)
            : Math.max(0, expectedLandlordPayable - landlordPaymentsMade);
        const outstandingTenantBalances = tenants.reduce((total, tenant) => total + amount(tenant.balance), 0) +
            rooms.reduce((total, room) => total + amount(room.outstanding_balance), 0);
        const todayCollections = collections
            .filter((collection) => isToday(collection.paid_at ?? collection.created_at))
            .reduce((total, collection) => total + amount(collection.amount_paid ?? collection.amount), 0);
        const todayExpenses = expenses
            .filter((expense) => isToday(expense.expense_date ?? expense.created_at))
            .reduce((total, expense) => total + amount(expense.amount), 0);
        const todayLandlordPayments = landlordPayments
            .filter((payment) => isToday(payment.paid_at ?? payment.created_at))
            .reduce((total, payment) => total + amount(payment.amount), 0);
        const todayAdvances = officeMonthAdvances
            .filter((advance) => isToday(advance.date_given ?? advance.created_at))
            .reduce((total, advance) => total + landlordAdvancePrincipal(advance as unknown as Record<string, unknown>), 0);
        const todayAdvanceRecovery = officeAdvances
            .filter((advance) => isToday(advance.deducted_at ?? advance.updated_at))
            .reduce((total, advance) => total + amount(advance.deducted_amount), 0);
        const payrollPaid = officeSalaryPayments.reduce((total, payment) => total + amount(payment.paid_amount ?? payment.amount), 0);
        const payrollLiability = officePayrollMonths.reduce((total, payroll) => total + Math.max(0, amount(payroll.final_salary_payable) - amount(payroll.amount_paid)), 0);
        const employeeFineSavings = officeEmployeeFines.reduce((total, fine) => total + amount(fine.amount), 0);
        const todayPayrollPaid = officeSalaryPayments
            .filter((payment) => isToday(String(payment.paid_at ?? payment.created_at ?? "")))
            .reduce((total, payment) => total + amount(payment.paid_amount ?? payment.amount), 0);

        return {
            officeId: office.id,
            officeName: office.office_name ?? office.name ?? "Office",
            expectedRentRoll,
            expectedCompanyCommission,
            expectedLandlordPayable,
            collectedThisMonth,
            landlordPaymentsMade,
            pendingLandlordPayments,
            landlordAdvancesGiven,
            landlordAdvancesRecovered,
            recoveryDeductionsRecovered,
            outstandingTenantBalances,
            expenses: expenseTotal,
            payrollPaid,
            payrollLiability,
            employeeFines: employeeFineSavings,
            profitLossToday: todayCollections - todayExpenses - todayLandlordPayments - todayAdvances - todayPayrollPaid + todayAdvanceRecovery,
            profitLossThisMonth: collectedThisMonth + expectedCompanyCommission + recoveryDeductionsRecovered + landlordAdvancesRecovered + employeeFineSavings - expenseTotal - landlordPaymentsMade - payrollPaid - payrollLiability,
            collectionProgress: percent(collectedThisMonth, expectedRentRoll),
        };
    });
    const recoveryDeductionsPending = currentMonthPayables.reduce((total, payable) => total + amount(payable.vacated_tenant_debt_deductions), 0) ||
        input.vacatedDebts.reduce((total, debt) => total + amount(debt.remaining_amount), 0);
    const totalLandlordAdvances = monthAdvances.reduce((total, advance) => total + landlordAdvanceTotal(advance as unknown as Record<string, unknown>), 0);
    const activeLandlordAdvances = activeAdvances.reduce((total, advance) => total + landlordAdvanceRemaining(advance as unknown as Record<string, unknown>), 0);
    const totalLandlordMoneyHeld = currentMonthPayables.reduce((total, payable) => total + amount(payable.unpaid_balance), 0);
    const totalOutstandingToLandlords = input.landlordPayables.reduce((total, payable) => total + amount(payable.unpaid_balance), 0);
    const unpaidLandlords = new Set(currentMonthPayables.filter((payable) => amount(payable.unpaid_balance) > 0).map((payable) => String(payable.landlord_id ?? ""))).size;
    const paidLandlords = new Set(currentMonthPayables.filter((payable) => amount(payable.unpaid_balance) <= 0 && (amount(payable.amount_paid) > 0 || String(payable.status ?? "").toLowerCase() === "paid")).map((payable) => `${String(payable.landlord_id ?? "")}:${String(payable.settlement_month ?? "")}`)).size;
    const paidLandlordPaymentsMade = currentMonthPayables.reduce((total, payable) => total + amount(payable.amount_paid), 0);
    const advanceDeductionsRecovered = input.landlordAdvances
        .filter((advance) => isThisMonthDateValue(advance.deducted_at ?? advance.updated_at))
        .reduce((total, advance) => total + amount(advance.deducted_amount), 0);
    const totals = offices.reduce((total, office) => ({
        expectedRentRoll: total.expectedRentRoll + office.expectedRentRoll,
        expectedCompanyCommission: total.expectedCompanyCommission + office.expectedCompanyCommission,
        expectedLandlordPayable: total.expectedLandlordPayable + office.expectedLandlordPayable,
        collectedThisMonth: total.collectedThisMonth + office.collectedThisMonth,
        landlordPaymentsMade: total.landlordPaymentsMade + office.landlordPaymentsMade,
        pendingLandlordPayments: total.pendingLandlordPayments + office.pendingLandlordPayments,
        landlordAdvancesGiven: total.landlordAdvancesGiven + office.landlordAdvancesGiven,
        landlordAdvancesRecovered: total.landlordAdvancesRecovered + office.landlordAdvancesRecovered,
        recoveryDeductionsRecovered: total.recoveryDeductionsRecovered + office.recoveryDeductionsRecovered,
        expenses: total.expenses + office.expenses,
        payrollPaid: total.payrollPaid + office.payrollPaid,
        payrollLiability: total.payrollLiability + office.payrollLiability,
        employeeFines: total.employeeFines + office.employeeFines,
        profitLossToday: total.profitLossToday + office.profitLossToday,
        profitLossThisMonth: total.profitLossThisMonth + office.profitLossThisMonth,
    }), {
        expectedRentRoll: 0,
        expectedCompanyCommission: 0,
        expectedLandlordPayable: 0,
        collectedThisMonth: 0,
        landlordPaymentsMade: 0,
        pendingLandlordPayments: 0,
        landlordAdvancesGiven: 0,
        landlordAdvancesRecovered: 0,
        recoveryDeductionsRecovered: 0,
        expenses: 0,
        payrollPaid: 0,
        payrollLiability: 0,
        employeeFines: 0,
        profitLossToday: 0,
        profitLossThisMonth: 0,
    });

    return {
        liveDataStatus: input.liveDataError ? "error" : "live",
        liveDataError: input.liveDataError,
        payrollModuleStatus: input.payrollModuleStatus,
        lastSyncedAt: new Date().toISOString(),
        expectedRentRoll: totals.expectedRentRoll,
        expectedMonthlyCompanyCommissionIncome: currentMonthPayables.length ? currentMonthPayables.reduce((total, payable) => total + amount(payable.commission_amount), 0) : totals.expectedCompanyCommission,
        expectedLandlordPayableThisMonth: currentMonthPayables.length ? currentMonthPayables.reduce((total, payable) => total + amount(payable.net_payable), 0) : totals.expectedLandlordPayable,
        totalCollectedFromTenantsThisMonth: totals.collectedThisMonth,
        actualCompanyCommissionCollectedSoFar: Math.round(totals.collectedThisMonth * percent(totals.expectedCompanyCommission, totals.expectedRentRoll) / 100),
        landlordPaymentsMadeSoFar: Math.max(totals.landlordPaymentsMade, paidLandlordPaymentsMade),
        pendingLandlordPayments: totals.pendingLandlordPayments,
        totalLandlordMoneyHeld,
        unpaidLandlords,
        paidLandlords,
        totalOutstandingToLandlords,
        totalLandlordAdvances,
        activeLandlordAdvances,
        advanceDeductionsRecovered,
        recoveryDeductionsPending,
        recoveryDeductionsRecovered: recoveryDeductionsPending || recoveredDebtsThisMonth,
        outstandingCollections: Math.max(0, totals.expectedRentRoll - totals.collectedThisMonth),
        employeeSalaryPayments: totals.payrollPaid,
        employeePayrollLiability: totals.payrollLiability,
        employeeFineSavings: totals.employeeFines,
        expectedMonthlyProfit: totals.collectedThisMonth + (currentMonthPayables.length ? currentMonthPayables.reduce((total, payable) => total + amount(payable.commission_amount), 0) : totals.expectedCompanyCommission) + recoveryDeductionsPending + advanceDeductionsRecovered + totals.employeeFines - totals.expenses - Math.max(totals.landlordPaymentsMade, paidLandlordPaymentsMade) - totals.payrollPaid - totals.payrollLiability,
        netPosition: totals.collectedThisMonth - totals.expenses - Math.max(totals.landlordPaymentsMade, paidLandlordPaymentsMade) - totalLandlordAdvances - totals.payrollPaid - totals.payrollLiability + advanceDeductionsRecovered + recoveryDeductionsPending + totals.employeeFines,
        profitLossToday: totals.profitLossToday,
        profitLossThisMonth: totals.collectedThisMonth + (currentMonthPayables.length ? currentMonthPayables.reduce((total, payable) => total + amount(payable.commission_amount), 0) : totals.expectedCompanyCommission) + recoveryDeductionsPending + advanceDeductionsRecovered + totals.employeeFines - totals.expenses - Math.max(totals.landlordPaymentsMade, paidLandlordPaymentsMade) - totals.payrollPaid - totals.payrollLiability,
        collectionProgress: percent(totals.collectedThisMonth, totals.expectedRentRoll),
        offices: offices.sort((a, b) => b.expectedCompanyCommission - a.expectedCompanyCommission),
        advances: advanceItems,
        expenses: expenseItems,
        expensesByOffice: input.offices.map((office) => ({
            officeId: office.id,
            officeName: office.office_name ?? office.name ?? "Office",
            total: input.expenses
                .filter((expense) => expense.office_id === office.id)
                .reduce((total, expense) => total + amount(expense.amount), 0),
        })).filter((row) => row.total > 0).sort((a, b) => b.total - a.total),
        expensesByCategory: groupExpenseTotals(expenseItems, (expense) => expense.expenseType),
        dailyExpenses: groupExpenseTotals(expenseItems, (expense) => expense.date.slice(0, 10)).map((row) => ({
            date: row.category,
            total: row.total,
        })),
    };
}

function buildLandlordAssignmentAudit(input: {
    offices: OfficeRow[];
    rooms: RoomRow[];
    properties: PropertyRow[];
    landlords: LandlordRow[];
    tenants: TenantRow[];
    leases: LeaseRow[];
    auditLogs: AuditLogRow[];
}): LandlordAssignmentAudit {
    const officeById = new Map(input.offices.map((office) => [office.id, office.office_name ?? office.name ?? "Office"]));
    const propertyById = new Map(input.properties.map((property) => [property.id, property]));
    const landlordById = new Map(input.landlords.map((landlord) => [landlord.id, landlord]));
    const leaseByRoomId = new Map(input.leases.map((lease) => [lease.room_id, lease]));
    const tenantById = new Map(input.tenants.map((tenant) => [tenant.id, tenant]));
    const tenantByRoomId = new Map(input.tenants.filter((tenant) => tenant.room_id).map((tenant) => [tenant.room_id!, tenant]));
    const roomLocationKeys = new Map<string, Set<string>>();
    const roomCountsByLandlord = new Map<string, number>();
    const locationCountsByLandlord = new Map<string, Set<string>>();
    const reviewedByRoom = new Map<string, { reviewedAt: string; note: string | null }>();

    for (const audit of input.auditLogs) {
        if (!["landlord_assignment_issue_reviewed", "landlord_room_reassigned"].includes(audit.action)) continue;
        const roomId = audit.entity_id;
        if (!roomId) continue;
        const after = typeof audit.after_data === "object" && audit.after_data ? audit.after_data as Record<string, unknown> : {};
        reviewedByRoom.set(roomId, {
            reviewedAt: audit.created_at,
            note: typeof after.note === "string" ? after.note : null,
        });
    }

    for (const room of input.rooms) {
        const locationSet = roomLocationKeys.get(roomKey(room)) ?? new Set<string>();
        if (room.property_id) locationSet.add(room.property_id);
        roomLocationKeys.set(roomKey(room), locationSet);
        if (room.landlord_id) {
            roomCountsByLandlord.set(room.landlord_id, (roomCountsByLandlord.get(room.landlord_id) ?? 0) + 1);
            const property = room.property_id ? propertyById.get(room.property_id) : null;
            const locationSetByLandlord = locationCountsByLandlord.get(room.landlord_id) ?? new Set<string>();
            locationSetByLandlord.add(propertyLabel(property));
            locationCountsByLandlord.set(room.landlord_id, locationSetByLandlord);
        }
    }

    const roomCounts = Array.from(roomCountsByLandlord.values());
    const averageRoomCount = roomCounts.length ? roomCounts.reduce((total, count) => total + count, 0) / roomCounts.length : 0;
    const highRoomThreshold = Math.max(75, Math.round(averageRoomCount * 3));

    const issues = input.rooms.flatMap((room): LandlordAssignmentIssue[] => {
        const property = room.property_id ? propertyById.get(room.property_id) ?? null : null;
        const lease = leaseByRoomId.get(room.id) ?? null;
        const tenant = lease ? tenantById.get(lease.tenant_id) ?? null : tenantByRoomId.get(room.id) ?? null;
        const currentLandlord = room.landlord_id ? landlordById.get(room.landlord_id) ?? null : null;
        const propertyLandlord = property?.landlord_id ? landlordById.get(property.landlord_id) ?? null : null;
        const reasons: string[] = [];

        if (!room.landlord_id) reasons.push("Room has missing landlord.");
        if (property?.landlord_id && room.landlord_id && property.landlord_id !== room.landlord_id) {
            reasons.push("Room landlord differs from property landlord.");
        }
        if ((roomLocationKeys.get(roomKey(room))?.size ?? 0) > 1) {
            reasons.push("Same room number appears in multiple locations in this office.");
        }
        if (room.landlord_id && (roomCountsByLandlord.get(room.landlord_id) ?? 0) >= highRoomThreshold) {
            reasons.push(`Landlord has unusually high room count (${roomCountsByLandlord.get(room.landlord_id)} rooms).`);
        }
        if (room.landlord_id && (locationCountsByLandlord.get(room.landlord_id)?.size ?? 0) >= 4) {
            reasons.push("Landlord has rooms across many unrelated locations.");
        }
        if (tenant?.property_id && room.property_id && tenant.property_id !== room.property_id) {
            reasons.push("Tenant property does not match room property.");
        }
        if (tenant?.room_id && tenant.room_id !== room.id) {
            reasons.push("Tenant room link does not match current room.");
        }

        if (!reasons.length) return [];
        const reviewed = reviewedByRoom.get(room.id);
        return [{
            id: `room-${room.id}`,
            roomId: room.id,
            roomNumber: room.room_number ?? "Unnumbered",
            officeId: room.office_id,
            officeName: room.office_id ? officeById.get(room.office_id) ?? "Unknown office" : "No office",
            propertyId: property?.id ?? null,
            propertyName: propertyLabel(property),
            currentLandlordId: room.landlord_id,
            currentLandlordName: currentLandlord?.full_name ?? "Missing landlord",
            propertyLandlordId: property?.landlord_id ?? null,
            propertyLandlordName: propertyLandlord?.full_name ?? null,
            tenantName: tenant?.full_name ?? null,
            monthlyRent: amount(room.monthly_rent),
            outstandingBalance: amount(room.outstanding_balance),
            severity: assignmentSeverity(reasons),
            reasons,
            reviewed: Boolean(reviewed),
            reviewedAt: reviewed?.reviewedAt ?? null,
            reviewedNote: reviewed?.note ?? null,
        }];
    }).sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity) || b.monthlyRent - a.monthlyRent);

    return {
        generatedAt: new Date().toISOString(),
        issues,
        landlordOptions: input.landlords.map((landlord) => ({ id: landlord.id, name: landlord.full_name ?? "Unnamed landlord" })),
        totals: {
            reviewed: issues.filter((issue) => issue.reviewed).length,
            suspicious: issues.length,
            critical: issues.filter((issue) => issue.severity === "critical").length,
            missingLandlord: issues.filter((issue) => issue.reasons.some((reason) => reason.includes("missing landlord"))).length,
            propertyMismatch: issues.filter((issue) => issue.reasons.some((reason) => reason.includes("property landlord"))).length,
        },
    };
}

function roomKey(room: RoomRow) {
    return `${room.office_id ?? "no-office"}:${normalizeKey(room.room_number ?? "")}`;
}

function propertyLabel(property: PropertyRow | null | undefined) {
    return property?.property_name ?? property?.name ?? property?.village ?? property?.city ?? property?.address ?? "Unassigned property";
}

function assignmentSeverity(reasons: string[]): AdminSeverity {
    if (reasons.some((reason) => reason.includes("missing landlord") || reason.includes("property landlord"))) return "critical";
    if (reasons.some((reason) => reason.includes("multiple locations") || reason.includes("Tenant"))) return "high";
    if (reasons.some((reason) => reason.includes("unusually high") || reason.includes("unrelated locations"))) return "medium";
    return "low";
}

function severityWeight(severity: AdminSeverity) {
    if (severity === "critical") return 5;
    if (severity === "high") return 4;
    if (severity === "medium") return 3;
    if (severity === "low") return 2;
    return 1;
}

function normalizeKey(value: string) {
    return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function buildKpis(input: {
    contextCompanies: number;
    offices: OfficeRow[];
    employees: EmployeeRow[];
    users: UserRow[];
    roles: RoleRow[];
    permissions: PermissionRow[];
    governance: GovernanceScorecard;
}): AdminKpis {
    return {
        companies: input.contextCompanies,
        offices: input.offices.length,
        employees: input.employees.length,
        activeUsers: input.users.filter((user) => user.status === "active").length,
        roles: input.roles.length,
        permissions: input.permissions.length,
        securityScore: input.governance.securityScore,
        complianceScore: input.governance.complianceScore,
    };
}

async function fetchAllAdminRooms({
    supabase,
    companyId,
}: {
    supabase: Awaited<ReturnType<typeof getScopedSupabase>>["supabase"];
    companyId: string;
}) {
    const rows: RoomRow[] = [];
    for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
            .from("rooms")
            .select("*")
            .eq("company_id", companyId)
            .order("room_number")
            .range(from, from + 999);
        if (error) throw new Error(error.message);
        rows.push(...(data ?? []));
        if (!data || data.length < 1000) break;
    }
    return rows;
}

function buildOfficeGovernance(input: {
    offices: OfficeRow[];
    employees: EmployeeRow[];
    policies: AttendancePolicyRow[];
    geofences: GeofenceRow[];
    publicHolidays: PublicHolidayRow[];
    workSchedules: Array<{ id: string }>;
}): OfficeGovernanceItem[] {
    return input.offices.map((office) => {
        const officeEmployees = input.employees.filter((employee) => employee.office_id === office.id);
        const policies = input.policies.filter((policy) => !policy.office_id || policy.office_id === office.id);
        const geofences = input.geofences.filter((geofence) => geofence.office_id === office.id && geofence.active);
        const score = average([
            office.status === "active" ? 100 : 45,
            office.manager_name ? 100 : 55,
            amount(office.collection_target) > 0 ? 100 : 60,
            amount(office.expense_budget) > 0 ? 100 : 70,
            policies.length ? 100 : 55,
            geofences.length ? 100 : 70,
        ]);
        return {
            id: office.id,
            name: office.office_name ?? office.name ?? "Office",
            status: office.status ?? "unknown",
            manager: office.manager_name ?? "Unassigned",
            collectionTarget: amount(office.collection_target),
            expenseBudget: amount(office.expense_budget),
            schedules: input.workSchedules.length,
            holidays: input.publicHolidays.length,
            geofences: geofences.length,
            governanceScore: score,
        };
    });
}

function buildEmployeeAdmin(input: {
    employees: EmployeeRow[];
    offices: OfficeRow[];
    devices: UserDeviceRow[];
    attendanceEvents: AttendanceEventRow[];
}): EmployeeAdminItem[] {
    const officeById = new Map(input.offices.map((office) => [office.id, office.office_name ?? office.name ?? "Office"]));
    return input.employees.map((employee) => {
        const events = input.attendanceEvents.filter((event) => event.employee_id === employee.id);
        const healthyEvents = events.filter((event) => ["on_time", "present", "checked_in", "normal"].includes((event.status ?? "").toLowerCase())).length;
        const attendanceHealth = events.length ? percent(healthyEvents, events.length) : 75;
        const deviceCount = input.devices.filter((device) => device.user_id === employee.user_id).length;
        const statusPenalty = ["suspended", "terminated", "inactive", "archived"].includes((employee.status ?? "").toLowerCase()) ? 35 : 100;
        return {
            id: employee.id,
            name: employee.full_name ?? "Unnamed employee",
            officeName: employee.office_id ? officeById.get(employee.office_id) ?? "Office" : "Unassigned",
            status: employee.status ?? "unknown",
            role: employee.role ?? employee.job_title ?? "Staff",
            attendanceHealth,
            performanceScore: average([attendanceHealth, statusPenalty, deviceCount ? 100 : 75]),
            deviceCount,
        };
    });
}

function buildPermissionMatrix(input: {
    roles: RoleRow[];
    permissions: PermissionRow[];
    rolePermissions: RolePermissionRow[];
    assignments: UserOfficeRoleRow[];
}): PermissionMatrixRole[] {
    const permissionById = new Map(input.permissions.map((permission) => [permission.id, permission]));
    return input.roles.map((role) => {
        const permissionKeys = input.rolePermissions
            .filter((link) => link.role_id === role.id)
            .map((link) => permissionById.get(link.permission_id)?.key)
            .filter((key): key is string => Boolean(key));
        return {
            roleId: role.id,
            roleName: role.name,
            scope: role.company_id ? "company" : "system",
            permissionKeys,
            assignmentCount: input.assignments.filter((assignment) => assignment.role_id === role.id).length,
        };
    });
}

function buildSecuritySignals(input: {
    securityEvents: SecurityEventRow[];
    devices: UserDeviceRow[];
    pinCredentials: Array<{ failed_attempts: number; status: string }>;
    auditLogs: AuditLogRow[];
}): SecuritySignal[] {
    const failedLogins = input.securityEvents.filter((event) => includesAny(event.event_type, ["failed", "login_failed", "auth_failed"])).length;
    const pinFailures = input.pinCredentials.reduce((total, pin) => total + (pin.failed_attempts ?? 0), 0);
    const untrustedDevices = input.devices.filter((device) => !["approved", "trusted", "active"].includes(device.status.toLowerCase())).length;
    const suspicious = input.securityEvents.filter((event) => ["critical", "high"].includes(event.severity.toLowerCase()) || includesAny(event.event_type, ["suspicious", "blocked", "anomaly"])).length;
    const sensitiveAudit = input.auditLogs.filter((audit) => includesAny(`${audit.action} ${audit.entity_type}`, ["role", "permission", "security", "delete", "archive"])).length;

    return [
        signal("login-activity", "Login activity", "Authentication and access events recorded in the security ledger.", "healthy", input.securityEvents.length, "Monitored"),
        signal("failed-logins", "Failed logins", "Failed authentication signals requiring review.", failedLogins ? "high" : "healthy", failedLogins, failedLogins ? "Investigate" : "Clean"),
        signal("pin-activity", "PIN activity", "PIN credential health and failed attempts.", pinFailures >= 5 ? "critical" : pinFailures ? "medium" : "healthy", pinFailures, pinFailures ? "Review PIN policy" : "Healthy"),
        signal("device-activity", "Device activity", "Untrusted, suspended, or pending devices.", untrustedDevices ? "high" : "healthy", untrustedDevices, untrustedDevices ? "Approve or block" : "Trusted"),
        signal("suspicious-access", "Suspicious access", "High-severity security events and anomaly indicators.", suspicious ? "critical" : "healthy", suspicious, suspicious ? "Escalate" : "No anomalies"),
        signal("security-alerts", "Sensitive changes", "Roles, permissions, deletion, archive, and security administration audit events.", sensitiveAudit ? "medium" : "healthy", sensitiveAudit, sensitiveAudit ? "Review audit" : "Stable"),
    ];
}

function buildDevices(input: {
    devices: UserDeviceRow[];
    users: UserRow[];
    securityEvents: SecurityEventRow[];
    deviceLocks: DeviceAttendanceLockRow[];
}): DeviceManagementItem[] {
    const userById = new Map(input.users.map((user) => [user.id, user.full_name]));
    return input.devices.map((device) => {
        const historyCount = input.securityEvents.filter((event) => event.user_id === device.user_id).length;
        const locked = input.deviceLocks.some((lock) => lock.device_id === device.id && lock.active);
        const trusted = ["approved", "trusted", "active"].includes(device.status.toLowerCase()) && Boolean(device.approved_at);
        const stale = device.last_seen_at ? daysSince(device.last_seen_at) > 30 : true;
        const riskScore = Math.min(100, (trusted ? 10 : 45) + (stale ? 25 : 0) + (locked ? 0 : 15) + Math.min(20, historyCount * 2));
        return {
            id: device.id,
            userName: userById.get(device.user_id) ?? "Unknown user",
            deviceName: device.device_name ?? "Unnamed device",
            platform: device.platform ?? "Unknown",
            status: device.status,
            trust: trusted ? "trusted" : "review",
            lastActivity: device.last_seen_at,
            riskScore,
            historyCount,
        };
    });
}

function buildAttendanceSecurity(input: {
    policies: AttendancePolicyRow[];
    offices: OfficeRow[];
    geofences: GeofenceRow[];
    gpsValidations: GpsValidationRow[];
}): AttendanceSecurityItem[] {
    const officeById = new Map(input.offices.map((office) => [office.id, office.office_name ?? office.name ?? "Office"]));
    return input.policies.map((policy) => {
        const officeGeofences = input.geofences.filter((geofence) => !policy.office_id || geofence.office_id === policy.office_id);
        const gps = input.gpsValidations.filter((validation) => !policy.office_id || validation.office_id === policy.office_id);
        return {
            id: policy.id,
            name: policy.name,
            officeName: policy.office_id ? officeById.get(policy.office_id) ?? "Office" : "Company-wide",
            requireGps: policy.require_gps,
            requireApprovedDevice: policy.require_approved_device,
            checkInTime: policy.check_in_time,
            graceMinutes: policy.grace_minutes,
            geofences: officeGeofences.filter((geofence) => geofence.active).length,
            gpsPassRate: gps.length ? percent(gps.filter((validation) => validation.passed).length, gps.length) : 100,
        };
    });
}

function buildPlatformConfiguration(input: {
    settings: Array<{ key: string; is_sensitive: boolean }>;
    notificationPreferences: unknown[];
    automationRules: AutomationRuleRow[];
    auditLogs: AuditLogRow[];
    aiInsights: unknown[];
    companies: Array<{ name: string; email: string | null; phone: string | null; tax_id: string | null }>;
}): PlatformConfigurationItem[] {
    const company = input.companies[0];
    return [
        config("company", "Company Settings", [company?.name, company?.email, company?.phone, company?.tax_id].filter(Boolean).length, 4),
        config("branding", "Branding", input.settings.filter((setting) => setting.key.toLowerCase().includes("brand")).length, 3),
        config("notifications", "Notifications", input.notificationPreferences.length, 4),
        config("automation", "Automation Settings", input.automationRules.filter((rule) => rule.active).length, Math.max(1, input.automationRules.length)),
        config("audit", "Audit Settings", input.auditLogs.length ? 1 : 0, 1),
        config("ai", "AI Settings", input.aiInsights.length ? 1 : 0, 1),
    ];
}

function buildOneDriveMaster(settings: CompanySettingRow[], offices: OfficeRow[]): AdminCentreData["oneDriveMaster"] {
    const row = settings.find((setting) => setting.key === ONEDRIVE_MASTER_SETTING_KEY);
    const config = parseOneDriveConfig(row?.value, offices);
    if (!row) {
        return {
            provider: config.provider,
            webUrl: config.webUrl ?? null,
            localFilePath: config.localFilePath ?? null,
            companySheetName: config.companySheetName,
            officeSheetMap: config.officeSheetMap,
            lastSyncAt: null,
            lastSyncStatus: "never",
            lastSyncError: null,
        };
    }
    return {
        provider: config.provider,
        webUrl: config.webUrl ?? null,
        localFilePath: config.localFilePath ?? null,
        companySheetName: config.companySheetName,
        officeSheetMap: config.officeSheetMap,
        lastSyncAt: config.lastSyncAt ?? null,
        lastSyncStatus: config.lastSyncStatus ?? "never",
        lastSyncError: config.lastSyncError ?? null,
    };
}

function buildGovernance(input: {
    offices: OfficeGovernanceItem[];
    securitySignals: SecuritySignal[];
    devices: DeviceManagementItem[];
    auditLogs: AuditLogRow[];
    users: UserRow[];
    employees: EmployeeRow[];
    permissions: PermissionRow[];
    roles: RoleRow[];
}): GovernanceScorecard {
    const officeGovernanceScore = input.offices.length ? average(input.offices.map((office) => office.governanceScore)) : 0;
    const securityPenalty = input.securitySignals.filter((signal) => ["critical", "high"].includes(signal.severity)).reduce((total, signal) => total + Math.min(20, signal.count * 5), 0);
    const securityScore = Math.max(0, Math.round(100 - securityPenalty - average(input.devices.map((device) => device.riskScore)) * 0.2));
    const auditScore = input.auditLogs.length ? Math.min(100, input.auditLogs.length) : 30;
    const dataIntegrityScore = average([
        percent(input.users.filter((user) => user.email).length, input.users.length || 1),
        percent(input.employees.filter((employee) => employee.office_id).length, input.employees.length || 1),
        input.permissions.length && input.roles.length ? 100 : 50,
    ]);
    const complianceScore = average([officeGovernanceScore, securityScore, auditScore, dataIntegrityScore]);
    return { complianceScore, securityScore, auditScore, dataIntegrityScore, officeGovernanceScore };
}

function buildRiskHeatMap(input: {
    offices: OfficeGovernanceItem[];
    employees: EmployeeAdminItem[];
    devices: DeviceManagementItem[];
    signals: SecuritySignal[];
}): RiskHeatMapItem[] {
    return [
        ...input.offices.map((office) => ({
            id: `office-${office.id}`,
            label: office.name,
            category: "Office governance",
            riskScore: 100 - office.governanceScore,
            severity: severityFromRisk(100 - office.governanceScore),
        })),
        ...input.employees.filter((employee) => employee.performanceScore < 75).slice(0, 8).map((employee) => ({
            id: `employee-${employee.id}`,
            label: employee.name,
            category: "Employee control",
            riskScore: 100 - employee.performanceScore,
            severity: severityFromRisk(100 - employee.performanceScore),
        })),
        ...input.devices.filter((device) => device.riskScore >= 35).slice(0, 8).map((device) => ({
            id: `device-${device.id}`,
            label: device.deviceName,
            category: "Device risk",
            riskScore: device.riskScore,
            severity: severityFromRisk(device.riskScore),
        })),
        ...input.signals.filter((signal) => signal.count > 0).map((signal) => ({
            id: `signal-${signal.id}`,
            label: signal.title,
            category: "Security monitoring",
            riskScore: Math.min(100, signal.count * 12),
            severity: signal.severity,
        })),
    ].sort((a, b) => b.riskScore - a.riskScore).slice(0, 18);
}

function filterByOffice<T extends { office_id: string }>(rows: T[], officeIds: Set<string>, allOffices: boolean) {
    if (allOffices) return rows;
    return rows.filter((row) => officeIds.has(row.office_id));
}

function filterByNullableOffice<T extends { office_id: string | null }>(rows: T[], officeIds: Set<string>, allOffices: boolean) {
    if (allOffices) return rows;
    return rows.filter((row) => !row.office_id || officeIds.has(row.office_id));
}

function filterAssignments(rows: UserOfficeRoleRow[], officeIds: Set<string>, allOffices: boolean) {
    if (allOffices) return rows;
    return rows.filter((row) => !row.office_id || officeIds.has(row.office_id));
}

function signal(id: string, title: string, description: string, severity: SecuritySignal["severity"], count: number, status: string): SecuritySignal {
    return { id, title, description, severity, count, status };
}

function config(area: PlatformConfigurationItem["area"], title: string, configured: number, total: number): PlatformConfigurationItem {
    const boundedTotal = Math.max(1, total);
    const ratio = percent(configured, boundedTotal);
    return {
        id: area,
        area,
        title,
        configured,
        total: boundedTotal,
        status: ratio >= 90 ? "complete" : ratio >= 50 ? "partial" : "needs setup",
    };
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

function monthStartIso() {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
    return start.toISOString();
}

function monthStartDate() {
    const now = new Date();
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date(now.getFullYear(), now.getMonth(), 1));
}

function isToday(value: string | null | undefined) {
    if (!value) return false;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return false;
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(date) === new Intl.DateTimeFormat("en-CA", {
        timeZone: TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date());
}

function isThisMonthDateValue(value: string | null | undefined) {
    if (!value) return false;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return false;
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: TIME_ZONE,
        year: "numeric",
        month: "2-digit",
    }).format(date) === new Intl.DateTimeFormat("en-CA", {
        timeZone: TIME_ZONE,
        year: "numeric",
        month: "2-digit",
    }).format(new Date());
}

function groupExpenseTotals<T>(items: T[], getKey: (item: T) => string) {
    const totals = new Map<string, number>();
    for (const item of items) {
        const key = getKey(item) || "Uncategorized";
        const itemAmount = "amount" in (item as Record<string, unknown>) ? amount((item as Record<string, unknown>).amount) : 0;
        totals.set(key, (totals.get(key) ?? 0) + itemAmount);
    }
    return [...totals.entries()]
        .map(([category, total]) => ({ category, total }))
        .sort((a, b) => b.total - a.total);
}

function parseCommissionSetting(value: unknown, fallback: number) {
    if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
    if (typeof value === "string") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }
    if (value && typeof value === "object" && "rate" in value) {
        const parsed = Number((value as { rate?: unknown }).rate);
        return Number.isFinite(parsed) ? parsed : fallback;
    }
    return fallback;
}

function commissionRate(landlord: LandlordRow | null, fallback: number) {
    const rate = Number((landlord as (LandlordRow & { commission_rate?: number | string | null }) | null)?.commission_rate ?? NaN);
    return Number.isFinite(rate) ? rate : fallback;
}

function calculateLandlordFinanceForRooms(input: {
    rooms: RoomRow[];
    landlordById: Map<string, LandlordRow>;
    defaultCommissionRate: number;
}) {
    const roomsByLandlord = new Map<string, RoomRow[]>();
    for (const room of input.rooms) {
        const key = room.landlord_id ?? `unassigned:${room.id}`;
        const group = roomsByLandlord.get(key) ?? [];
        group.push(room);
        roomsByLandlord.set(key, group);
    }

    let companyCommission = 0;
    let landlordPayable = 0;
    for (const [landlordId, rooms] of roomsByLandlord.entries()) {
        const landlord = landlordId.startsWith("unassigned:") ? null : input.landlordById.get(landlordId) ?? null;
        const gross = rooms.reduce((total, room) => total + amount(room.monthly_rent), 0);
        const vacantDeduction = rooms.filter(isVacantCommissionRoom).reduce((total, room) => total + amount(room.monthly_rent), 0);
        const occupiedPayableRent = Math.max(0, gross - vacantDeduction);
        const rate = commissionRate(landlord, input.defaultCommissionRate);
        const mode = commissionCalculationMode(landlord);
        const commissionBase = mode === "occupied_room_based" ? occupiedPayableRent : gross;
        const commission = Math.round(commissionBase * rate / 100);

        companyCommission += commission;
        landlordPayable += mode === "occupied_room_based"
            ? Math.max(0, occupiedPayableRent - commission)
            : Math.max(0, gross - commission - vacantDeduction);
    }

    return { companyCommission, landlordPayable };
}

function commissionCalculationMode(landlord: LandlordRow | null) {
    const mode = (landlord as (LandlordRow & { commission_calculation_mode?: string | null }) | null)?.commission_calculation_mode;
    return mode === "occupied_room_based" ? "occupied_room_based" : "portfolio_based";
}

function isVacantCommissionRoom(room: RoomRow) {
    const status = (room.status ?? "").toLowerCase();
    return status.includes("vacant") || status.includes("empty");
}

function includesAny(value: string, needles: string[]) {
    const lower = value.toLowerCase();
    return needles.some((needle) => lower.includes(needle));
}

function amount(value: unknown) {
    return Number(value ?? 0);
}

function landlordAdvanceTotal(row: Record<string, unknown>) {
    const explicitTotal = amount(row.total_repayable);
    if (explicitTotal > 0) return explicitTotal;
    const advanceAmount = amount(row.advance_amount);
    if (advanceAmount > 0) return advanceAmount;
    return amount(row.principal_amount) + amount(row.interest_amount);
}

function landlordAdvancePrincipal(row: Record<string, unknown>) {
    const principal = amount(row.principal_amount);
    if (principal > 0) return principal;
    const advanceAmount = amount(row.advance_amount);
    if (advanceAmount > 0) return advanceAmount;
    return Math.max(0, landlordAdvanceTotal(row) - amount(row.interest_amount));
}

function landlordAdvanceRemaining(row: Record<string, unknown>) {
    const remainingTotal = amount(row.remaining_total_balance);
    if (remainingTotal > 0) return remainingTotal;
    const remainingBalance = amount(row.remaining_balance);
    if (remainingBalance > 0) return remainingBalance;
    const principalInterest = amount(row.remaining_principal_balance) + amount(row.remaining_interest_balance);
    if (principalInterest > 0) return principalInterest;
    return Math.max(0, landlordAdvanceTotal(row) - amount(row.deducted_amount));
}

function isActiveLandlordAdvance(row: Record<string, unknown>) {
    const status = String(row.status ?? "pending").toLowerCase();
    const lifecycle = String(row.lifecycle_status ?? "active").toLowerCase();
    const approved = ["approved", "active", "partially_deducted"].includes(status)
        || Boolean(row.approved_by || row.approved_at || row.approved_date);
    return !["fully_deducted", "cleared", "cancelled", "rejected"].includes(status)
        && !["cleared", "cancelled", "rejected"].includes(lifecycle)
        && approved
        && landlordAdvanceRemaining(row) > 0;
}

function percent(numerator: number, denominator: number) {
    if (!denominator) return 0;
    return Math.max(0, Math.min(100, Math.round((numerator / denominator) * 100)));
}

function average(values: number[]) {
    const usable = values.filter((value) => Number.isFinite(value));
    if (!usable.length) return 0;
    return Math.round(usable.reduce((total, value) => total + value, 0) / usable.length);
}

function daysSince(value: string) {
    return Math.floor((Date.now() - new Date(value).getTime()) / (24 * 60 * 60 * 1000));
}

function severityFromRisk(score: number): RiskHeatMapItem["severity"] {
    if (score >= 75) return "critical";
    if (score >= 50) return "high";
    if (score >= 25) return "medium";
    if (score > 0) return "low";
    return "healthy";
}

function emptyData(): AdminCentreData {
    return {
        company: null,
        activeOffice: null,
        kpis: { companies: 0, offices: 0, employees: 0, activeUsers: 0, roles: 0, permissions: 0, securityScore: 0, complianceScore: 0 },
        offices: [],
        employees: [],
        roles: [],
        permissions: [],
        securitySignals: [],
        devices: [],
        attendanceSecurity: [],
        platformConfiguration: [],
        governance: { complianceScore: 0, securityScore: 0, auditScore: 0, dataIntegrityScore: 0, officeGovernanceScore: 0 },
        riskHeatMap: [],
        rentRoll: {
            companyTotal: {
                officeId: "company",
                officeName: "Company Total",
                rooms: 0,
                occupiedRooms: 0,
                vacantRooms: 0,
                expectedMonthlyRent: 0,
                outstandingBalance: 0,
                collectedThisMonth: 0,
                collectionPercentage: 0,
            },
            offices: [],
        },
        landlordAssignmentAudit: {
            generatedAt: new Date().toISOString(),
            issues: [],
            landlordOptions: [],
            totals: {
                reviewed: 0,
                suspicious: 0,
                critical: 0,
                missingLandlord: 0,
                propertyMismatch: 0,
            },
        },
        landlordRecoveryReminders: {
            landlordsWithVacantRooms: 0,
            landlordsWithUnrecoveredDebts: 0,
            totalMoneyAtRisk: 0,
            totalRecoveryPending: 0,
            totalRecovered: 0,
            items: [],
        },
        monthlyFinance: {
            liveDataStatus: "live",
            liveDataError: null,
            payrollModuleStatus: null,
            lastSyncedAt: new Date().toISOString(),
            expectedRentRoll: 0,
            expectedMonthlyCompanyCommissionIncome: 0,
            expectedLandlordPayableThisMonth: 0,
            totalCollectedFromTenantsThisMonth: 0,
            actualCompanyCommissionCollectedSoFar: 0,
            landlordPaymentsMadeSoFar: 0,
            pendingLandlordPayments: 0,
            totalLandlordMoneyHeld: 0,
            unpaidLandlords: 0,
            paidLandlords: 0,
            totalOutstandingToLandlords: 0,
            totalLandlordAdvances: 0,
            activeLandlordAdvances: 0,
            advanceDeductionsRecovered: 0,
            recoveryDeductionsPending: 0,
            recoveryDeductionsRecovered: 0,
            outstandingCollections: 0,
            employeeSalaryPayments: 0,
            employeePayrollLiability: 0,
            employeeFineSavings: 0,
            expectedMonthlyProfit: 0,
            netPosition: 0,
            profitLossToday: 0,
            profitLossThisMonth: 0,
            collectionProgress: 0,
            offices: [],
            advances: [],
            expenses: [],
            expensesByOffice: [],
            expensesByCategory: [],
            dailyExpenses: [],
        },
        oneDriveMaster: null,
        productionReadiness: null,
        raw: {
            companies: [],
            offices: [],
            employees: [],
            users: [],
            roles: [],
            permissions: [],
            securityEvents: [],
            devices: [],
            policies: [],
            geofences: [],
            gpsValidations: [],
            publicHolidays: [],
            workSchedules: [],
            systemSettings: [],
            companySettings: [],
            notificationPreferences: [],
            automationRules: [],
            auditLogs: [],
            pinCredentials: [],
            userOfficeRoles: [],
            deviceLocks: [],
            attendanceEvents: [],
            aiInsights: [],
            rooms: [],
            properties: [],
            landlords: [],
            collections: [],
            tenants: [],
            leases: [],
            rentChangeRequests: [],
        },
    };
}
