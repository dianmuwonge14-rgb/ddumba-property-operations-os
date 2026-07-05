import { requirePermission } from "@/lib/auth/permissions";
import { getScopedSupabase } from "@/lib/auth/query";
import type {
    AiInsightRow,
    AttendanceEventRow,
    AuditLogRow,
    CashPosition,
    CeoCommandData,
    CeoOverview,
    CeoSeverity,
    CeoTrend,
    CollectionRow,
    CompanyLeague,
    DailyBriefing,
    EmployeeRow,
    ExecutiveAction,
    ExecutiveAlert,
    ExpenseRow,
    ForecastEngine,
    GrowthCentre,
    IntelligenceFeedItem,
    LandlordPaymentRow,
    LandlordRow,
    LandlordSettlementCentreRow,
    LandlordSettlementRow,
    OfficeRow,
    OfficeTargetSet,
    OfficeWarRoomRow,
    PerformanceTargetRow,
    PromiseRow,
    PromiseRecoveryCommand,
    PropertyRow,
    RiskHeatMapItem,
    RoomRow,
    SecurityEventRow,
    TenantRow,
    UserRow,
    AuditTimelineItem,
    AiPrediction,
} from "./types";

const TIME_ZONE = "Africa/Kampala";

export async function getCeoCommandData(): Promise<CeoCommandData> {
    const context = await requirePermission("reports.read");
    const { supabase } = await getScopedSupabase();
    const companyId = context.activeCompany?.id;
    if (!companyId) return emptyData();

    const today = todayDate();
    const start30 = dateOffset(-29);
    const previousStart30 = dateOffset(-59);
    const monthStartDate = monthStart();
    const tomorrow = dateOffset(1);
    const weekStartDate = dateOffset(-6);
    const accessibleOfficeIds = new Set(context.offices.map((office) => office.id));

    const [
        officesResult,
        collectionsResult,
        promisesResult,
        propertiesResult,
        roomsResult,
        tenantsResult,
        landlordsResult,
        expensesResult,
        attendanceResult,
        employeesResult,
        aiResult,
        automationResult,
        auditResult,
        securityResult,
        scorecardsResult,
        snapshotsResult,
        targetsResult,
        landlordPaymentsResult,
        landlordSettlementsResult,
        dailyReportsResult,
        usersResult,
    ] = await Promise.all([
        supabase.from("offices").select("*").eq("company_id", companyId).neq("status", "archived").order("office_name"),
        supabase.from("collections").select("*").eq("company_id", companyId).gte("paid_at", isoStart(previousStart30)).lte("paid_at", isoEnd(today)),
        supabase.from("promises").select("*").eq("company_id", companyId),
        supabase.from("properties").select("*").eq("company_id", companyId).neq("status", "archived"),
        supabase.from("rooms").select("*").eq("company_id", companyId),
        supabase.from("tenants").select("*").eq("company_id", companyId),
        supabase.from("landlords").select("*").eq("company_id", companyId).neq("status", "archived"),
        supabase.from("expenses").select("*").eq("company_id", companyId).gte("expense_date", previousStart30).lte("expense_date", today),
        supabase.from("attendance_events").select("*").eq("company_id", companyId).gte("event_time", isoStart(start30)).lte("event_time", isoEnd(today)),
        supabase.from("employees").select("*").eq("company_id", companyId).neq("status", "archived"),
        supabase.from("ai_insights").select("*").eq("company_id", companyId).order("created_at", { ascending: false, nullsFirst: false }).limit(40),
        supabase.from("automation_runs").select("*").eq("company_id", companyId).gte("started_at", isoStart(start30)).order("started_at", { ascending: false }).limit(40),
        supabase.from("audit_logs").select("*").eq("company_id", companyId).gte("created_at", isoStart(start30)).order("created_at", { ascending: false }).limit(80),
        supabase.from("security_events").select("*").eq("company_id", companyId).gte("created_at", isoStart(start30)).order("created_at", { ascending: false }).limit(60),
        supabase.from("company_scorecards").select("*").eq("company_id", companyId).order("score_date", { ascending: false }).limit(10),
        supabase.from("executive_kpi_snapshots").select("*").eq("company_id", companyId).order("snapshot_date", { ascending: false }).limit(10),
        supabase.from("performance_targets").select("*").eq("company_id", companyId).lte("period_start", today).gte("period_end", today).order("created_at", { ascending: false }),
        supabase.from("landlord_payments").select("*").eq("company_id", companyId).gte("paid_at", isoStart(previousStart30)).lte("paid_at", isoEnd(today)),
        supabase.from("landlord_settlements").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
        (supabase as unknown as { from: (table: string) => ReturnType<typeof supabase.from> }).from("office_daily_reports").select("*").eq("company_id", companyId).gte("report_date", monthStartDate).lte("report_date", today),
        supabase.from("users").select("*").eq("company_id", companyId),
    ]);

    for (const result of [
        officesResult,
        collectionsResult,
        promisesResult,
        propertiesResult,
        roomsResult,
        tenantsResult,
        landlordsResult,
        expensesResult,
        attendanceResult,
        employeesResult,
        aiResult,
        automationResult,
        auditResult,
        securityResult,
        scorecardsResult,
        snapshotsResult,
        targetsResult,
        landlordPaymentsResult,
        landlordSettlementsResult,
        dailyReportsResult,
        usersResult,
    ]) {
        if (result.error) throw new Error(result.error.message);
    }

    const companyOffices = officesResult.data ?? [];
    const offices = context.canAccessAllOffices ? companyOffices : companyOffices.filter((office) => accessibleOfficeIds.has(office.id));
    const officeIds = new Set(offices.map((office) => office.id));
    const collections = filterByOffice(collectionsResult.data ?? [], officeIds);
    const promises = filterByOffice(promisesResult.data ?? [], officeIds);
    const properties = filterByOffice(propertiesResult.data ?? [], officeIds);
    const rooms = filterByOffice(roomsResult.data ?? [], officeIds);
    const tenants = filterByOffice(tenantsResult.data ?? [], officeIds);
    const landlords = landlordsResult.data ?? [];
    const expenses = filterByOffice(expensesResult.data ?? [], officeIds);
    const attendance = filterByOffice(attendanceResult.data ?? [], officeIds);
    const employees = filterByOffice(employeesResult.data ?? [], officeIds);
    const ai = filterNullableOffice(aiResult.data ?? [], officeIds);
    const audits = filterNullableOffice(auditResult.data ?? [], officeIds);
    const security = filterNullableOffice(securityResult.data ?? [], officeIds);
    const automation = automationResult.data ?? [];
    const targets = filterNullableOffice(targetsResult.data ?? [], officeIds);
    const landlordPayments = filterNullableOffice(landlordPaymentsResult.data ?? [], officeIds);
    const landlordSettlements = landlordSettlementsResult.data ?? [];
    const dailyReports = filterByOffice((dailyReportsResult.data ?? []) as Array<{ office_id: string | null; report_date: string | null; status: string | null }>, officeIds);
    const users = usersResult.data ?? [];
    const targetSets = buildTargetSets(offices, targets, monthStartDate, today);

    const currentCollections = collections.filter((row) => dateOnly(row.paid_at) >= start30);
    const previousCollections = collections.filter((row) => {
        const date = dateOnly(row.paid_at);
        return date >= previousStart30 && date < start30;
    });
    const currentExpenses = expenses.filter((row) => (row.expense_date ?? "") >= start30);
    const previousExpenses = expenses.filter((row) => {
        const date = row.expense_date ?? "";
        return date >= previousStart30 && date < start30;
    });
    const officeWarRoom = buildOfficeWarRoom({ offices, collections: currentCollections, promises, properties, rooms, tenants, expenses: currentExpenses, attendance, employees, targets: targetSets, dailyReports, monthStartDate, today });
    const cash = buildCash({ collections, expenses, landlordPayments, today, weekStartDate, monthStartDate });
    const growth = buildGrowth({ offices, collections: currentCollections, previousCollections, rooms, tenants, expenses: currentExpenses, previousExpenses });
    const risks = buildRisks({ offices: officeWarRoom, properties, tenants, landlords, employees, rooms });
    const overview = buildOverview({ offices: officeWarRoom, cash, growth, risks, audits, security });
    const promiseRecovery = buildPromiseRecovery(promises, collections, today, tomorrow);
    const landlordSettlementCentre = buildLandlordSettlements({ landlords, properties, collections: currentCollections, expenses: currentExpenses, payments: landlordPayments, settlements: landlordSettlements, offices });
    const alerts = buildExecutiveAlerts({ offices: officeWarRoom, promises, landlordSettlements: landlordSettlementCentre, cash, rooms });
    const auditTimeline = buildAuditTimeline(audits, users, offices);
    const intelligence = buildIntelligence({ ai, automation, audits, security, risks, alerts });
    const forecast = buildForecast({ collections: currentCollections, expenses: currentExpenses, rooms, tenants, risks });
    const aiPredictions = buildAiPredictions({ offices: officeWarRoom, tenants, collections: currentCollections, cash, forecast });
    const actions = buildActions({ promises, attendance, employees, cash, risks, offices: officeWarRoom });
    const league = buildLeague(officeWarRoom);
    const briefing = buildBriefing({ cash, growth, risks, intelligence, actions, league });

    return {
        company: context.activeCompany,
        activeOffice: context.activeOffice,
        overview,
        cash,
        growth,
        offices: officeWarRoom,
        risks,
        intelligence,
        forecast,
        actions,
        league,
        briefing,
        targets: targetSets,
        promiseRecovery,
        landlordSettlements: landlordSettlementCentre,
        alerts,
        auditTimeline,
        aiPredictions,
        raw: {
            companyScorecards: scorecardsResult.data ?? [],
            executiveSnapshots: snapshotsResult.data ?? [],
        },
    };
}

function buildCash(input: { collections: CollectionRow[]; expenses: ExpenseRow[]; landlordPayments: LandlordPaymentRow[]; today: string; weekStartDate: string; monthStartDate: string }): CashPosition {
    const todayCollections = sumCollections(input.collections.filter((row) => sameDate(row.paid_at, input.today)));
    const todayExpenses = sumExpenses(input.expenses.filter((row) => sameDate(row.expense_date, input.today) || sameDate(row.created_at, input.today)));
    const todayLandlordPayments = sumLandlordPayments(input.landlordPayments.filter((row) => sameDate(row.paid_at, input.today) || sameDate(row.created_at, input.today)));
    const weekCollections = sumCollections(input.collections.filter((row) => dateOnly(row.paid_at) >= input.weekStartDate));
    const weekExpenses = sumExpenses(input.expenses.filter((row) => (row.expense_date ?? dateOnly(row.created_at)) >= input.weekStartDate));
    const weekLandlordPayments = sumLandlordPayments(input.landlordPayments.filter((row) => dateOnly(row.paid_at ?? row.created_at) >= input.weekStartDate));
    const monthlyCollections = sumCollections(input.collections.filter((row) => dateOnly(row.paid_at) >= input.monthStartDate));
    const expenses = sumExpenses(input.expenses.filter((row) => (row.expense_date ?? "") >= input.monthStartDate));
    const landlordPayments = sumLandlordPayments(input.landlordPayments.filter((row) => dateOnly(row.paid_at ?? row.created_at) >= input.monthStartDate));
    const netCashPosition = monthlyCollections - expenses - landlordPayments;
    const availableCash = Math.max(0, netCashPosition);
    const dayOfMonth = Number(input.today.slice(8, 10));
    const daysInMonth = new Date(Number(input.today.slice(0, 4)), Number(input.today.slice(5, 7)), 0).getDate();
    const collectionForecast = dayOfMonth ? (monthlyCollections / dayOfMonth) * daysInMonth : monthlyCollections;
    const expenseForecast = dayOfMonth ? ((expenses + landlordPayments) / dayOfMonth) * daysInMonth : expenses + landlordPayments;
    return {
        todayCollections,
        todayExpenses,
        todayLandlordPayments,
        monthlyCollections,
        expenses,
        landlordPayments,
        netCashPosition,
        availableCash,
        forecastCashPosition: Math.round(collectionForecast - expenseForecast),
        windows: {
            today: todayCollections - todayExpenses - todayLandlordPayments,
            week: weekCollections - weekExpenses - weekLandlordPayments,
            month: netCashPosition,
        },
    };
}

function buildGrowth(input: {
    offices: OfficeRow[];
    collections: CollectionRow[];
    previousCollections: CollectionRow[];
    rooms: RoomRow[];
    tenants: TenantRow[];
    expenses: ExpenseRow[];
    previousExpenses: ExpenseRow[];
}): GrowthCentre {
    const occupied = input.rooms.filter(isOccupiedRoom).length;
    const activeTenants = input.tenants.filter(isActiveTenant).length;
    const newTenants = input.tenants.filter((tenant) => tenant.created_at && dateOnly(tenant.created_at) >= dateOffset(-29)).length;
    const previousRevenue = sumCollections(input.previousCollections);
    const currentRevenue = sumCollections(input.collections);
    return {
        occupancyGrowth: percentage(occupied, input.rooms.length),
        tenantGrowth: percentage(newTenants, Math.max(1, activeTenants - newTenants)),
        collectionGrowth: growthRate(currentRevenue, previousRevenue),
        officeGrowth: percentage(input.offices.filter((office) => (office.status ?? "").toLowerCase() === "active").length, input.offices.length),
        revenueGrowth: growthRate(currentRevenue - sumExpenses(input.expenses), previousRevenue - sumExpenses(input.previousExpenses)),
    };
}

function buildOfficeWarRoom(input: {
    offices: OfficeRow[];
    collections: CollectionRow[];
    promises: PromiseRow[];
    properties: PropertyRow[];
    rooms: RoomRow[];
    tenants: TenantRow[];
    expenses: ExpenseRow[];
    attendance: AttendanceEventRow[];
    employees: EmployeeRow[];
    targets: OfficeTargetSet[];
    dailyReports: Array<{ office_id: string | null; report_date: string | null; status: string | null }>;
    monthStartDate: string;
    today: string;
}): OfficeWarRoomRow[] {
    return input.offices.map((office) => {
        const collections = input.collections.filter((row) => row.office_id === office.id);
        const promises = input.promises.filter((row) => row.office_id === office.id);
        const rooms = input.rooms.filter((row) => row.office_id === office.id);
        const expenses = input.expenses.filter((row) => row.office_id === office.id);
        const attendance = input.attendance.filter((row) => row.office_id === office.id);
        const employees = input.employees.filter((row) => row.office_id === office.id);
        const targetSet = input.targets.find((target) => target.officeId === office.id);
        const reports = input.dailyReports.filter((row) => row.office_id === office.id && (row.status ?? "submitted") !== "draft");
        const collectionValue = sumCollections(collections);
        const expenseValue = sumExpenses(expenses);
        const target = targetSet?.collectionTarget || amount(office.collection_target) || collections.reduce((total, row) => total + amount(row.expected_amount ?? row.amount), 0) || collectionValue;
        const expenseBudget = targetSet?.expenseBudget || amount(office.expense_budget) || Math.max(target * 0.25, expenseValue);
        const collectionPerformance = percentage(collectionValue, target);
        const occupancy = percentage(rooms.filter(isOccupiedRoom).length, rooms.length);
        const promiseRecovery = percentage(promises.filter(isFulfilledPromise).length, promises.length);
        const attendanceRate = attendanceHealth(attendance, employees);
        const expenseControl = expenseBudget ? Math.max(0, Math.min(100, Math.round(((expenseBudget - expenseValue) / expenseBudget) * 100))) : 85;
        const elapsedDays = Math.max(1, Number(input.today.slice(8, 10)));
        const reportCompliance = percentage(reports.length, elapsedDays);
        const score = Math.round((collectionPerformance * 0.28) + (occupancy * 0.17) + (promiseRecovery * 0.17) + (attendanceRate * 0.16) + (expenseControl * 0.12) + (reportCompliance * 0.10));
        return {
            officeId: office.id,
            officeName: office.office_name ?? office.name ?? "Office",
            rank: 0,
            score,
            collectionPerformance,
            collectionTarget: target,
            occupancy,
            occupancyTarget: targetSet?.occupancyTarget ?? 90,
            promiseRecovery,
            promiseRecoveryTarget: targetSet?.promiseRecoveryTarget ?? 85,
            attendance: attendanceRate,
            expenseControl,
            expenseBudget,
            reportCompliance,
            landlordSettlementTarget: targetSet?.landlordSettlementTarget ?? 0,
            collections: collectionValue,
            expenses: expenseValue,
            netPosition: collectionValue - expenseValue,
            trend: resolveTrend(collections),
            status: officeStatus(score),
        };
    }).sort((a, b) => b.score - a.score).map((office, index) => ({ ...office, rank: index + 1 }));
}

function buildRisks(input: {
    offices: OfficeWarRoomRow[];
    properties: PropertyRow[];
    tenants: TenantRow[];
    landlords: LandlordRow[];
    employees: EmployeeRow[];
    rooms: RoomRow[];
}): RiskHeatMapItem[] {
    const propertyRoomCount = new Map<string, RoomRow[]>();
    for (const room of input.rooms) {
        if (!room.property_id) continue;
        propertyRoomCount.set(room.property_id, [...(propertyRoomCount.get(room.property_id) ?? []), room]);
    }
    return [
        ...input.offices.filter((office) => office.score < 70).map((office) => risk(`office-${office.officeId}`, office.officeName, "office", 100 - office.score, "Composite office score below CEO threshold.")),
        ...input.properties.map((property) => {
            const rooms = propertyRoomCount.get(property.id) ?? [];
            const occupancy = percentage(rooms.filter(isOccupiedRoom).length, rooms.length || amount(property.total_units));
            return risk(`property-${property.id}`, property.property_name ?? property.name ?? "Property", "property", 100 - occupancy, "Low property occupancy or weak room utilisation.");
        }).filter((item) => item.riskScore >= 35),
        ...input.tenants.map((tenant) => {
            const reliabilityRisk = tenant.tenant_reliability_score == null ? 0 : Math.max(0, 100 - amount(tenant.tenant_reliability_score));
            const balanceRisk = amount(tenant.balance) > 0 ? Math.min(100, amount(tenant.balance) / Math.max(1, amount(tenant.monthly_rent)) * 25) : 0;
            return risk(`tenant-${tenant.id}`, tenant.full_name ?? "Tenant", "tenant", Math.max(amount(tenant.risk_score), reliabilityRisk, balanceRisk), tenant.tenant_score_reason ?? "Tenant balance, reliability, or default risk requires attention.");
        }).filter((item) => item.riskScore >= 30),
        ...input.landlords.map((landlord) => risk(`landlord-${landlord.id}`, landlord.full_name, "landlord", Math.max(0, 100 - amount(landlord.trust_index || 75)) + (amount(landlord.balance_remaining) > 0 ? 15 : 0), "Settlement, trust, or landlord performance signal requires review.")).filter((item) => item.riskScore >= 30),
        ...input.employees.filter((employee) => ["suspended", "inactive", "terminated"].includes((employee.status ?? "").toLowerCase())).map((employee) => risk(`employee-${employee.id}`, employee.full_name ?? "Employee", "employee", 65, "Employee status or attendance control risk.")),
    ].sort((a, b) => b.riskScore - a.riskScore).slice(0, 24);
}

function buildOverview(input: {
    offices: OfficeWarRoomRow[];
    cash: CashPosition;
    growth: GrowthCentre;
    risks: RiskHeatMapItem[];
    audits: AuditLogRow[];
    security: SecurityEventRow[];
}): CeoOverview {
    const officeScore = average(input.offices.map((office) => office.score));
    const cashScore = input.cash.netCashPosition >= 0 ? 90 : 45;
    const growthScore = average([input.growth.collectionGrowth + 50, input.growth.revenueGrowth + 50, input.growth.occupancyGrowth, input.growth.officeGrowth]);
    const riskScore = Math.min(100, average(input.risks.map((item) => item.riskScore)) + input.security.filter((event) => ["critical", "high"].includes(event.severity)).length * 6);
    const readiness = average([officeScore, cashScore, growthScore, 100 - riskScore, input.audits.length ? 90 : 55]);
    return {
        companyScore: average([officeScore, cashScore, growthScore, 100 - riskScore]),
        companyHealth: average([officeScore, cashScore, input.growth.occupancyGrowth]),
        riskScore,
        growthScore,
        executiveReadinessScore: readiness,
    };
}

function buildIntelligence(input: {
    ai: AiInsightRow[];
    automation: Array<{ id: string; status: string; error_message: string | null; started_at: string }>;
    audits: AuditLogRow[];
    security: SecurityEventRow[];
    risks: RiskHeatMapItem[];
    alerts: ExecutiveAlert[];
}): IntelligenceFeedItem[] {
    return [
        ...input.alerts.slice(0, 5).map((item) => feed(`alert-${item.id}`, "critical", item.title, item.description, item.severity)),
        ...input.risks.slice(0, 5).map((item) => feed(`risk-${item.id}`, "critical", `${item.category} risk: ${item.label}`, item.signal, item.severity)),
        ...input.ai.slice(0, 6).map((item) => feed(`ai-${item.id}`, "ai", item.title ?? "AI finding", item.summary ?? item.description ?? "AI intelligence signal generated.", severityFromText(item.severity ?? item.priority), item.created_at ?? new Date().toISOString())),
        ...input.automation.filter((run) => run.status !== "success").slice(0, 5).map((run) => feed(`automation-${run.id}`, "automation", "Automation alert", run.error_message ?? `Automation run ended with ${run.status}.`, run.status === "failed" ? "high" : "medium", run.started_at)),
        ...input.audits.slice(0, 5).map((audit) => feed(`audit-${audit.id}`, "audit", `Audit: ${audit.action}`, `${audit.entity_type} ${audit.entity_id ?? ""}`.trim(), includesAny(`${audit.action} ${audit.entity_type}`, ["delete", "role", "permission"]) ? "high" : "low", audit.created_at)),
        ...input.security.slice(0, 5).map((event) => feed(`security-${event.id}`, "security", `Security: ${event.event_type}`, event.user_agent ?? "Security event recorded.", severityFromText(event.severity), event.created_at)),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 20);
}

function buildForecast(input: { collections: CollectionRow[]; expenses: ExpenseRow[]; rooms: RoomRow[]; tenants: TenantRow[]; risks: RiskHeatMapItem[] }): ForecastEngine {
    const days = Array.from({ length: 6 }, (_, index) => index + 1);
    const dailyCollection = sumCollections(input.collections) / Math.max(1, 30);
    const dailyExpense = sumExpenses(input.expenses) / Math.max(1, 30);
    const occupancy = percentage(input.rooms.filter(isOccupiedRoom).length, input.rooms.length);
    const monthlyRent = input.tenants.filter(isActiveTenant).reduce((total, tenant) => total + amount(tenant.monthly_rent), 0);
    const riskBase = average(input.risks.map((risk) => risk.riskScore));
    return {
        collections: days.map((week) => ({ label: `W${week}`, value: Math.round(dailyCollection * week * 7) })),
        occupancy: days.map((week) => ({ label: `W${week}`, value: Math.min(100, Math.round(occupancy + week * 1.2)) })),
        cashFlow: days.map((week) => ({ label: `W${week}`, value: Math.round((dailyCollection - dailyExpense) * week * 7) })),
        revenue: days.map((week) => ({ label: `W${week}`, value: Math.round(monthlyRent * (1 + week * 0.015)) })),
        riskTrend: days.map((week) => ({ label: `W${week}`, value: Math.max(0, Math.round(riskBase - week * 2)) })),
    };
}

function buildActions(input: { promises: PromiseRow[]; attendance: AttendanceEventRow[]; employees: EmployeeRow[]; cash: CashPosition; risks: RiskHeatMapItem[]; offices: OfficeWarRoomRow[] }): ExecutiveAction[] {
    const today = todayDate();
    const overduePromises = input.promises.filter((promise) => {
        const date = promise.promised_date ?? promise.promise_date;
        return date && date < today && !isFulfilledPromise(promise);
    }).length;
    const checkedIn = new Set(input.attendance.filter((event) => sameDate(event.event_time, today) && event.event_type === "check_in").map((event) => event.employee_id));
    const absent = Math.max(0, input.employees.filter((employee) => !["inactive", "terminated", "archived"].includes((employee.status ?? "").toLowerCase())).length - checkedIn.size);
    return [
        overduePromises ? action("overdue-promises", "Overdue promises", `${overduePromises} promises require executive recovery oversight.`, "high", "Collections leadership", "Today") : null,
        absent ? action("attendance-issues", "Attendance issues", `${absent} employees have no check-in record today.`, absent >= 5 ? "critical" : "medium", "Office managers", "Today") : null,
        input.cash.forecastCashPosition < 0 ? action("cash-shortage", "Cash shortage forecast", `Forecast cash position is ${money(input.cash.forecastCashPosition)}.`, "critical", "Finance leadership", "Immediate") : null,
        ...input.risks.slice(0, 4).map((riskItem) => action(`risk-${riskItem.id}`, `${riskItem.category} escalation`, `${riskItem.label}: ${riskItem.signal}`, riskItem.severity, "Executive office", "48 hours")),
        ...input.offices.filter((office) => office.status === "risk").slice(0, 3).map((office) => action(`office-${office.officeId}`, "Office rescue plan", `${office.officeName} is below CEO operating threshold at ${office.score}%.`, "high", "Regional operations", "This week")),
    ].filter((item): item is ExecutiveAction => Boolean(item)).slice(0, 12);
}

function buildLeague(offices: OfficeWarRoomRow[]): CompanyLeague {
    const sorted = offices.slice().sort((a, b) => b.score - a.score);
    return {
        bestOffice: sorted[0] ?? null,
        worstOffice: sorted[sorted.length - 1] ?? null,
        fastestImprovingOffice: offices.find((office) => office.trend === "up") ?? sorted[0] ?? null,
        mostEfficientOffice: offices.slice().sort((a, b) => b.expenseControl - a.expenseControl)[0] ?? null,
        mostProfitableOffice: offices.slice().sort((a, b) => b.netPosition - a.netPosition)[0] ?? null,
    };
}

function buildBriefing(input: { cash: CashPosition; growth: GrowthCentre; risks: RiskHeatMapItem[]; intelligence: IntelligenceFeedItem[]; actions: ExecutiveAction[]; league: CompanyLeague }): DailyBriefing {
    return {
        happenedToday: [
            `${money(input.cash.todayCollections)} collected today.`,
            `${money(input.cash.monthlyCollections)} collected this month against ${money(input.cash.expenses)} expenses.`,
            `${input.intelligence.length} executive intelligence signals are available.`,
        ],
        needsAttention: input.actions.slice(0, 4).map((actionItem) => actionItem.title),
        biggestRisks: input.risks.slice(0, 4).map((riskItem) => `${riskItem.label}: ${riskItem.riskScore}% risk`),
        biggestOpportunities: [
            input.league.bestOffice ? `${input.league.bestOffice.officeName} is the strongest office at ${input.league.bestOffice.score}%.` : "No office leader available yet.",
            `Collection growth is ${input.growth.collectionGrowth}%.`,
            `Occupancy is at ${input.growth.occupancyGrowth}%.`,
        ],
        recommendedActions: [
            "Protect cash position by prioritising overdue promises and high-balance tenants.",
            "Deploy office rescue plans for any office below 70% composite score.",
            "Review high-risk landlord and property signals before month-end settlement.",
            "Use automation and audit alerts as the CEO exception queue.",
        ],
    };
}

function buildTargetSets(offices: OfficeRow[], targets: PerformanceTargetRow[], monthStartDate: string, today: string): OfficeTargetSet[] {
    return offices.map((office) => {
        const officeTargets = targets
            .filter((target) => target.office_id === office.id && target.period_start <= today && target.period_end >= monthStartDate)
            .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        const value = (metricKey: string, fallback: number) => {
            const row = officeTargets.find((target) => target.metric_key === metricKey);
            return amount(row?.target_value ?? fallback);
        };
        return {
            officeId: office.id,
            officeName: office.office_name ?? office.name ?? "Office",
            periodStart: officeTargets[0]?.period_start ?? monthStartDate,
            periodEnd: officeTargets[0]?.period_end ?? today,
            collectionTarget: value("monthly_collection_target", amount(office.collection_target)),
            expenseBudget: value("monthly_expense_budget", amount(office.expense_budget)),
            landlordSettlementTarget: value("monthly_landlord_settlement_target", 0),
            promiseRecoveryTarget: value("promise_recovery_target", 85),
            occupancyTarget: value("occupancy_target", 90),
        };
    });
}

function buildPromiseRecovery(promises: PromiseRow[], collections: CollectionRow[], today: string, tomorrow: string): PromiseRecoveryCommand {
    const open = promises.filter((promise) => !isFulfilledPromise(promise) && !["broken", "cancelled", "canceled"].includes((promise.status ?? "").toLowerCase()));
    const fulfilled = promises.filter(isFulfilledPromise);
    const promisedTotal = promises.reduce((total, promise) => total + amount(promise.promised_amount ?? promise.amount), 0);
    const recoveryAmount = sumCollections(collections.filter((collection) => ["promise_payment", "promise"].includes((collection.type ?? "").toLowerCase())));
    return {
        openPromises: open.length,
        dueToday: open.filter((promise) => (promise.promised_date ?? promise.promise_date) === today).length,
        dueTomorrow: open.filter((promise) => (promise.promised_date ?? promise.promise_date) === tomorrow).length,
        overduePromises: open.filter((promise) => {
            const dueDate = promise.promised_date ?? promise.promise_date;
            return Boolean(dueDate && dueDate < today);
        }).length,
        fulfilledPromises: fulfilled.length,
        successRate: percentage(fulfilled.length, promises.length),
        recoveryAmount,
        recoveryPercent: percentage(recoveryAmount, promisedTotal),
    };
}

function buildLandlordSettlements(input: {
    landlords: LandlordRow[];
    properties: PropertyRow[];
    collections: CollectionRow[];
    expenses: ExpenseRow[];
    payments: LandlordPaymentRow[];
    settlements: LandlordSettlementRow[];
    offices: OfficeRow[];
}): LandlordSettlementCentreRow[] {
    const officeById = new Map(input.offices.map((office) => [office.id, office]));
    return input.landlords.map((landlord) => {
        const landlordProperties = input.properties.filter((property) => property.landlord_id === landlord.id);
        const propertyIds = new Set(landlordProperties.map((property) => property.id));
        const collections = input.collections.filter((collection) => collection.landlord_id === landlord.id || (collection.property_id && propertyIds.has(collection.property_id)));
        const expenses = input.expenses.filter((expense) => expense.property_id && propertyIds.has(expense.property_id));
        const payments = input.payments.filter((payment) => payment.landlord_id === landlord.id);
        const settlements = input.settlements.filter((settlement) => settlement.landlord_id === landlord.id);
        const settlementNet = settlements.reduce((total, settlement) => total + amount(settlement.net_payable), 0);
        const collectionValue = sumCollections(collections);
        const expenseValue = sumExpenses(expenses);
        const paid = sumLandlordPayments(payments);
        const netAmountDue = settlementNet || Math.max(0, collectionValue - expenseValue);
        const officeId = landlordProperties[0]?.office_id ?? payments[0]?.office_id ?? null;
        const office = officeId ? officeById.get(officeId) : null;
        const lastPayment = payments.slice().sort((a, b) => dateOnly(b.paid_at ?? b.created_at).localeCompare(dateOnly(a.paid_at ?? a.created_at)))[0];
        return {
            landlordId: landlord.id,
            landlordName: landlord.full_name,
            officeId,
            officeName: office?.office_name ?? office?.name ?? "Company",
            propertyNames: landlordProperties.map((property) => property.property_name ?? property.name ?? "Property"),
            collections: collectionValue,
            expenses: expenseValue,
            netAmountDue,
            lastSettlementDate: lastPayment?.paid_at ?? settlements[0]?.approved_at ?? settlements[0]?.created_at ?? null,
            amountPaid: paid,
            balanceDue: Math.max(0, netAmountDue - paid),
        };
    }).filter((row) => row.collections || row.expenses || row.balanceDue || row.amountPaid);
}

function buildExecutiveAlerts(input: { offices: OfficeWarRoomRow[]; promises: PromiseRow[]; landlordSettlements: LandlordSettlementCentreRow[]; cash: CashPosition; rooms: RoomRow[] }): ExecutiveAlert[] {
    const today = todayDate();
    const overduePromises = input.promises.filter((promise) => {
        const dueDate = promise.promised_date ?? promise.promise_date;
        return dueDate && dueDate < today && !isFulfilledPromise(promise);
    }).length;
    const vacantRooms = input.rooms.filter((room) => !isOccupiedRoom(room)).length;
    return [
        ...input.offices.filter((office) => office.collectionPerformance < 70).map((office) => executiveAlert(`target-${office.officeId}`, "high", `${office.officeName} below target`, `Collection achievement is ${office.collectionPerformance}% against ${money(office.collectionTarget)} target.`, office.officeName)),
        ...input.offices.filter((office) => office.attendance < 80).map((office) => executiveAlert(`attendance-${office.officeId}`, "medium", `${office.officeName} attendance below 80%`, `Attendance is ${office.attendance}% today.`, office.officeName)),
        ...input.offices.filter((office) => office.expenseControl < 50).map((office) => executiveAlert(`expense-${office.officeId}`, "medium", `${office.officeName} high expense warning`, `Expense discipline is ${office.expenseControl}% against ${money(office.expenseBudget)} budget.`, office.officeName)),
        ...(overduePromises ? [executiveAlert("overdue-promises", "high", "Promise overdue", `${overduePromises} open promises are overdue.`)] : []),
        ...input.landlordSettlements.filter((row) => row.balanceDue > 0).slice(0, 5).map((row) => executiveAlert(`landlord-${row.landlordId}`, "medium", "Landlord overdue payment", `${row.landlordName} has ${money(row.balanceDue)} balance due.`, row.officeName)),
        ...(vacantRooms ? [executiveAlert("vacancy-warning", "low", "Vacancy increase warning", `${vacantRooms} rooms are currently vacant or not occupied.`)] : []),
        ...(input.cash.windows.month < 0 ? [executiveAlert("cash-pressure", "critical", "Company cash pressure", `Monthly cash position is ${money(input.cash.windows.month)}.`)] : []),
    ].slice(0, 24);
}

function buildAuditTimeline(audits: AuditLogRow[], users: UserRow[], offices: OfficeRow[]): AuditTimelineItem[] {
    const userById = new Map(users.map((user) => [user.id, user]));
    const officeById = new Map(offices.map((office) => [office.id, office]));
    return audits.slice(0, 40).map((audit) => {
        const date = new Date(audit.created_at);
        const office = audit.office_id ? officeById.get(audit.office_id) : null;
        return {
            id: audit.id,
            user: audit.actor_id ? userById.get(audit.actor_id)?.full_name ?? "User" : "System",
            office: office?.office_name ?? office?.name ?? "Company",
            action: audit.action,
            entityType: audit.entity_type,
            date: new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(date),
            time: new Intl.DateTimeFormat("en-UG", { timeStyle: "short", timeZone: TIME_ZONE }).format(date),
        };
    });
}

function buildAiPredictions(input: { offices: OfficeWarRoomRow[]; tenants: TenantRow[]; collections: CollectionRow[]; cash: CashPosition; forecast: ForecastEngine }): AiPrediction[] {
    const weakestOffice = input.offices.slice().sort((a, b) => a.collectionPerformance - b.collectionPerformance)[0];
    const highRiskTenants = input.tenants.filter((tenant) => amount(tenant.balance) > 0 || amount(tenant.tenant_reliability_score) < 60).length;
    const expectedCollections = input.forecast.collections.at(-1)?.value ?? sumCollections(input.collections);
    return [
        {
            id: "high-risk-tenants",
            title: "High-risk tenants",
            value: highRiskTenants.toString(),
            severity: highRiskTenants ? "medium" : "healthy",
            explanation: "Tenants are flagged when balances remain open or reliability scores drop below the operating threshold.",
        },
        {
            id: "underperforming-office",
            title: "Office underperformance",
            value: weakestOffice ? `${weakestOffice.officeName} ${weakestOffice.collectionPerformance}%` : "No office risk",
            severity: weakestOffice && weakestOffice.collectionPerformance < 70 ? "high" : "healthy",
            explanation: "Office risk compares month-to-date collections against the active monthly collection target.",
        },
        {
            id: "expected-collections",
            title: "Expected month-end collections",
            value: money(expectedCollections),
            severity: "low",
            explanation: "Projection uses the current collection run rate and the remaining month window.",
        },
        {
            id: "predicted-cash",
            title: "Predicted cash position",
            value: money(input.cash.forecastCashPosition),
            severity: input.cash.forecastCashPosition < 0 ? "critical" : "healthy",
            explanation: "Predicted cash subtracts expense and landlord settlement run rate from projected collections.",
        },
    ];
}

function filterByOffice<T extends { office_id: string | null }>(rows: T[], officeIds: Set<string>) {
    return rows.filter((row) => row.office_id && officeIds.has(row.office_id));
}

function filterNullableOffice<T extends { office_id: string | null }>(rows: T[], officeIds: Set<string>) {
    return rows.filter((row) => !row.office_id || officeIds.has(row.office_id));
}

function todayDate() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
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
    return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function isoStart(date: string) {
    return `${date}T00:00:00+03:00`;
}

function isoEnd(date: string) {
    return `${date}T23:59:59+03:00`;
}

function dateOnly(value: string | null | undefined) {
    return value ? value.slice(0, 10) : "";
}

function sameDate(value: string | null | undefined, date: string) {
    return dateOnly(value) === date;
}

function sumCollections(collections: CollectionRow[]) {
    return collections.reduce((total, collection) => total + amount(collection.amount_paid ?? collection.amount), 0);
}

function sumExpenses(expenses: ExpenseRow[]) {
    return expenses.reduce((total, expense) => total + amount(expense.amount), 0);
}

function sumLandlordPayments(payments: LandlordPaymentRow[]) {
    return payments.reduce((total, payment) => total + amount(payment.amount), 0);
}

function amount(value: number | null | undefined) {
    return Number(value ?? 0);
}

function percentage(numerator: number, denominator: number) {
    if (!denominator) return 0;
    return Math.max(0, Math.min(100, Math.round((numerator / denominator) * 100)));
}

function growthRate(current: number, previous: number) {
    if (!previous) return current > 0 ? 100 : 0;
    return Math.max(-100, Math.min(200, Math.round(((current - previous) / Math.abs(previous)) * 100)));
}

function average(values: number[]) {
    const usable = values.filter((value) => Number.isFinite(value));
    if (!usable.length) return 0;
    return Math.round(usable.reduce((total, value) => total + value, 0) / usable.length);
}

function isOccupiedRoom(room: RoomRow) {
    return (room.status ?? "").toLowerCase().includes("occupied");
}

function isActiveTenant(tenant: TenantRow) {
    return ["active", "current", "occupied"].includes((tenant.status ?? "").toLowerCase());
}

function isFulfilledPromise(promise: PromiseRow) {
    const status = (promise.status ?? "").toLowerCase();
    return Boolean(promise.fulfilled_at) || ["fulfilled", "paid"].includes(status);
}

function attendanceHealth(events: AttendanceEventRow[], employees: EmployeeRow[]) {
    const activeEmployees = employees.filter((employee) => !["terminated", "inactive", "archived"].includes((employee.status ?? "").toLowerCase()));
    const checkedIn = new Set(events.filter((event) => event.event_type === "check_in").map((event) => event.employee_id));
    return percentage(checkedIn.size, activeEmployees.length);
}

function resolveTrend(collections: CollectionRow[]): CeoTrend {
    const currentStart = dateOffset(-6);
    const previousStart = dateOffset(-13);
    const current = sumCollections(collections.filter((collection) => dateOnly(collection.paid_at) >= currentStart));
    const previous = sumCollections(collections.filter((collection) => {
        const date = dateOnly(collection.paid_at);
        return date >= previousStart && date < currentStart;
    }));
    if (current > previous * 1.05) return "up";
    if (current < previous * 0.95) return "down";
    return "flat";
}

function risk(id: string, label: string, category: RiskHeatMapItem["category"], riskScore: number, signal: string): RiskHeatMapItem {
    const bounded = Math.max(0, Math.min(100, Math.round(riskScore)));
    return { id, label, category, riskScore: bounded, severity: severityFromRisk(bounded), signal };
}

function officeStatus(score: number): OfficeWarRoomRow["status"] {
    if (score >= 85) return "elite";
    if (score >= 70) return "strong";
    if (score >= 50) return "watch";
    return "risk";
}

function severityFromRisk(score: number): CeoSeverity {
    if (score >= 75) return "critical";
    if (score >= 50) return "high";
    if (score >= 25) return "medium";
    if (score > 0) return "low";
    return "healthy";
}

function severityFromText(value: string | null | undefined): CeoSeverity {
    const text = (value ?? "").toLowerCase();
    if (text.includes("critical")) return "critical";
    if (text.includes("high") || text.includes("failed")) return "high";
    if (text.includes("medium") || text.includes("warning")) return "medium";
    if (text.includes("low")) return "low";
    return "healthy";
}

function feed(id: string, source: IntelligenceFeedItem["source"], title: string, message: string, severity: CeoSeverity, createdAt = new Date().toISOString()): IntelligenceFeedItem {
    return { id, source, title, message, severity, createdAt };
}

function action(id: string, title: string, description: string, severity: CeoSeverity, owner: string, due: string): ExecutiveAction {
    return { id, title, description, severity, owner, due };
}

function executiveAlert(id: string, severity: CeoSeverity, title: string, description: string, officeName?: string): ExecutiveAlert {
    return { id, severity, title, description, officeName };
}

function includesAny(value: string, needles: string[]) {
    const lower = value.toLowerCase();
    return needles.some((needle) => lower.includes(needle));
}

function money(value: number) {
    return `UGX ${Math.round(value).toLocaleString()}`;
}

function emptyData(): CeoCommandData {
    return {
        company: null,
        activeOffice: null,
        overview: { companyScore: 0, companyHealth: 0, riskScore: 0, growthScore: 0, executiveReadinessScore: 0 },
        cash: { todayCollections: 0, todayExpenses: 0, todayLandlordPayments: 0, monthlyCollections: 0, expenses: 0, landlordPayments: 0, netCashPosition: 0, availableCash: 0, forecastCashPosition: 0, windows: { today: 0, week: 0, month: 0 } },
        growth: { occupancyGrowth: 0, tenantGrowth: 0, collectionGrowth: 0, officeGrowth: 0, revenueGrowth: 0 },
        offices: [],
        risks: [],
        intelligence: [],
        forecast: { collections: [], occupancy: [], cashFlow: [], revenue: [], riskTrend: [] },
        actions: [],
        league: { bestOffice: null, worstOffice: null, fastestImprovingOffice: null, mostEfficientOffice: null, mostProfitableOffice: null },
        briefing: { happenedToday: [], needsAttention: [], biggestRisks: [], biggestOpportunities: [], recommendedActions: [] },
        targets: [],
        promiseRecovery: { openPromises: 0, dueToday: 0, dueTomorrow: 0, overduePromises: 0, fulfilledPromises: 0, successRate: 0, recoveryAmount: 0, recoveryPercent: 0 },
        landlordSettlements: [],
        alerts: [],
        auditTimeline: [],
        aiPredictions: [],
        raw: { companyScorecards: [], executiveSnapshots: [] },
    };
}
