import { requirePermission } from "@/lib/auth/permissions";
import { getScopedSupabase } from "@/lib/auth/query";
import type {
    AiIntelligenceData,
    AttendanceEventRow,
    CollectionIntelligence,
    CollectionRow,
    DataQualityFindingRow,
    EmployeeRow,
    ExecutiveRecommendation,
    ExecutiveRisk,
    ExpenseRow,
    LandlordIntelligence,
    LandlordRow,
    OfficeIntelligence,
    OfficeRow,
    PromiseRow,
    PropertyRow,
    RoomRow,
    Severity,
    TenantIntelligence,
    TenantRow,
    Trend,
} from "./types";

const TIME_ZONE = "Africa/Kampala";

function todayDate() {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date());
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

function isoEnd(date: string) {
    return `${date}T23:59:59+03:00`;
}

export async function getAiIntelligenceData(): Promise<AiIntelligenceData> {
    const context = await requirePermission("ai.read");
    const { supabase } = await getScopedSupabase();
    const companyId = context.activeCompany?.id;
    if (!companyId) return emptyData();

    const today = todayDate();
    const startOfMonth = monthStart();
    const trendStart = dateOffset(-29);
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
        insightsResult,
        qualityResult,
        companySettingsResult,
    ] = await Promise.all([
        supabase.from("offices").select("*").eq("company_id", companyId).neq("status", "archived").order("office_name"),
        supabase.from("collections").select("*").eq("company_id", companyId).gte("paid_at", isoStart(trendStart)).lte("paid_at", isoEnd(today)),
        supabase.from("promises").select("*").eq("company_id", companyId),
        supabase.from("properties").select("*").eq("company_id", companyId).neq("status", "archived"),
        supabase.from("rooms").select("*").eq("company_id", companyId),
        supabase.from("tenants").select("*").eq("company_id", companyId),
        supabase.from("landlords").select("*").eq("company_id", companyId).neq("status", "archived"),
        supabase.from("expenses").select("*").eq("company_id", companyId).gte("expense_date", startOfMonth).lte("expense_date", today),
        supabase.from("attendance_events").select("*").eq("company_id", companyId).gte("event_time", isoStart(trendStart)).lte("event_time", isoEnd(today)),
        supabase.from("employees").select("*").eq("company_id", companyId).neq("status", "archived"),
        supabase.from("ai_insights").select("*").eq("company_id", companyId).order("created_at", { ascending: false, nullsFirst: false }).limit(20),
        supabase.from("data_quality_findings").select("*").eq("company_id", companyId).is("resolved_at", null).order("created_at", { ascending: false }).limit(20),
        supabase.from("company_settings").select("*").eq("company_id", companyId).eq("key", "default_landlord_commission_rate"),
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
        insightsResult,
        qualityResult,
        companySettingsResult,
    ]) {
        if (result.error) throw new Error(result.error.message);
    }

    const offices = filterOffices(officesResult.data ?? [], accessibleOfficeIds, context.canAccessAllOffices);
    const officeIds = new Set(offices.map((office) => office.id));
    const collections = filterByOffice(collectionsResult.data ?? [], officeIds);
    const promises = filterByOffice(promisesResult.data ?? [], officeIds);
    const properties = filterByOffice(propertiesResult.data ?? [], officeIds);
    const rooms = filterByOffice(roomsResult.data ?? [], officeIds);
    const tenants = filterByOffice(tenantsResult.data ?? [], officeIds);
    const expenses = filterByOffice(expensesResult.data ?? [], officeIds);
    const attendance = filterByOffice(attendanceResult.data ?? [], officeIds);
    const employees = filterByOffice(employeesResult.data ?? [], officeIds);
    const officeIntelligence = buildOfficeIntelligence({ offices, collections, promises, rooms, expenses, attendance, employees });
    const risks = buildExecutiveRisks({ offices, collections, promises, rooms, tenants, expenses, attendance, employees, officeIntelligence });
    const collection = buildCollectionIntelligence({ offices, collections, promises, employees });
    const tenant = buildTenantIntelligence({ offices, collections, tenants, rooms });
    const landlord = buildLandlordIntelligence({ landlords: landlordsResult.data ?? [], properties, collections });
    const finance = buildFinanceIntelligence({
        rooms,
        collections,
        expenses,
        landlords: landlordsResult.data ?? [],
        defaultCommissionRate: parseCommissionSetting(companySettingsResult.data?.[0]?.value, 10),
    });
    const recommendations = buildRecommendations(risks, collection, tenant, landlord, officeIntelligence, finance);

    return {
        company: context.activeCompany,
        activeOffice: context.activeOffice,
        risks,
        collection,
        tenant,
        landlord,
        offices: officeIntelligence,
        commandFeed: buildCommandFeed({ risks, collection, tenant, officeIntelligence, finance }),
        recommendations,
        storedInsights: insightsResult.data ?? [],
        dataQualityFindings: qualityResult.data ?? [],
    };
}

function filterOffices(offices: OfficeRow[], officeIds: Set<string>, canAccessAll: boolean) {
    return canAccessAll ? offices : offices.filter((office) => officeIds.has(office.id));
}

function filterByOffice<T extends { office_id: string | null }>(rows: T[], officeIds: Set<string>) {
    return rows.filter((row) => row.office_id && officeIds.has(row.office_id));
}

function buildExecutiveRisks(input: {
    offices: OfficeRow[];
    collections: CollectionRow[];
    promises: PromiseRow[];
    rooms: RoomRow[];
    tenants: TenantRow[];
    expenses: ExpenseRow[];
    attendance: AttendanceEventRow[];
    employees: EmployeeRow[];
    officeIntelligence: OfficeIntelligence[];
}): ExecutiveRisk[] {
    const risks: ExecutiveRisk[] = [];
    for (const office of input.offices) {
        const officeCollections = input.collections.filter((item) => item.office_id === office.id);
        const officePromises = input.promises.filter((item) => item.office_id === office.id);
        const officeRooms = input.rooms.filter((item) => item.office_id === office.id);
        const officeTenants = input.tenants.filter((item) => item.office_id === office.id);
        const officeExpenses = input.expenses.filter((item) => item.office_id === office.id);
        const officeAttendance = input.attendance.filter((item) => item.office_id === office.id && sameDate(item.event_time, todayDate()));
        const officeEmployees = input.employees.filter((item) => item.office_id === office.id);
        const collections = sumCollections(officeCollections);
        const target = Number(office.collection_target ?? officeCollections.reduce((total, item) => total + amount(item.expected_amount ?? item.amount), 0));
        const targetRate = percent(collections, target || collections);
        const outstanding = officeTenants.reduce((total, tenant) => total + amount(tenant.balance), 0) + officeRooms.reduce((total, room) => total + amount(room.outstanding_balance), 0);
        const absenteeism = 100 - attendanceRate(officeAttendance, officeEmployees);
        const expenseValue = sumExpenses(officeExpenses);
        const expenseBudget = Number(office.expense_budget ?? 0);
        const occupancy = percent(officeRooms.filter(isOccupiedRoom).length, officeRooms.length);
        const promiseFailure = 100 - percent(officePromises.filter(isFulfilledPromise).length, officePromises.length);
        const officeIntel = input.officeIntelligence.find((item) => item.officeId === office.id);
        const combinedRisk = Math.round((100 - targetRate) * 0.22 + normalizedMoneyRisk(outstanding) * 0.18 + absenteeism * 0.16 + expenseRisk(expenseValue, expenseBudget) * 0.14 + (100 - occupancy) * 0.14 + promiseFailure * 0.16);

        if (combinedRisk >= 25) {
            risks.push({
                id: `risk-${office.id}`,
                title: `${office.office_name ?? office.name ?? "Office"} operational risk`,
                officeName: office.office_name ?? office.name ?? "Office",
                riskScore: combinedRisk,
                severity: severityFor(combinedRisk),
                trend: officeIntel?.trendScore && officeIntel.trendScore >= 60 ? "up" : combinedRisk > 60 ? "down" : "flat",
                recommendedAction: recommendedRiskAction({ targetRate, outstanding, absenteeism, expenseValue, occupancy, promiseFailure }),
            });
        }
    }
    return risks.sort((a, b) => b.riskScore - a.riskScore);
}

function buildCollectionIntelligence(input: {
    offices: OfficeRow[];
    collections: CollectionRow[];
    promises: PromiseRow[];
    employees: EmployeeRow[];
}): CollectionIntelligence {
    const today = new Date();
    const dayOfMonth = Math.max(1, Number(new Intl.DateTimeFormat("en", { timeZone: TIME_ZONE, day: "numeric" }).format(today)));
    const endOfMonthDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const monthCollections = sumCollections(input.collections);
    const dailyRunRate = monthCollections / dayOfMonth;
    const endOfMonthProjection = Math.round(dailyRunRate * endOfMonthDay);
    const likelyRecoveryAmount = Math.round(input.promises.filter((promise) => !isBrokenPromise(promise)).reduce((total, promise) => total + amount(promise.promised_amount ?? promise.amount), 0) * 0.68);
    const collectorMap = new Map<string, { value: number; count: number }>();

    for (const collection of input.collections) {
        const key = collection.collector_id ?? collection.recorded_by ?? "unknown";
        const existing = collectorMap.get(key) ?? { value: 0, count: 0 };
        existing.value += amount(collection.amount_paid ?? collection.amount);
        existing.count += 1;
        collectorMap.set(key, existing);
    }
    const employeeById = new Map(input.employees.map((employee) => [employee.id, employee]));

    return {
        collectionForecast: endOfMonthProjection,
        endOfMonthProjection,
        likelyRecoveryAmount,
        officesLikelyToMissTargets: input.offices
            .map((office) => {
                const collected = sumCollections(input.collections.filter((collection) => collection.office_id === office.id));
                const target = Number(office.collection_target ?? collected);
                const targetAchievement = percent(collected, target || collected);
                return {
                    officeId: office.id,
                    officeName: office.office_name ?? office.name ?? "Office",
                    projectedTargetGap: Math.max(0, target - collected),
                    targetAchievement,
                };
            })
            .filter((office) => office.targetAchievement < 85)
            .sort((a, b) => b.projectedTargetGap - a.projectedTargetGap)
            .slice(0, 6),
        bestCollectors: [...collectorMap.entries()]
            .map(([collectorId, stats]) => ({
                collectorId,
                collectorName: employeeById.get(collectorId)?.full_name ?? "Unassigned collector",
                collectionValue: stats.value,
                collectionCount: stats.count,
            }))
            .sort((a, b) => b.collectionValue - a.collectionValue)
            .slice(0, 5),
    };
}

function buildTenantIntelligence(input: {
    offices: OfficeRow[];
    collections: CollectionRow[];
    tenants: TenantRow[];
    rooms: RoomRow[];
}): TenantIntelligence {
    const officeById = new Map(input.offices.map((office) => [office.id, office.office_name ?? office.name ?? "Office"]));
    const lateCollectionsByTenant = new Map<string, number>();
    for (const collection of input.collections) {
        if (collection.tenant_id && collection.due_date && collection.paid_at && collection.paid_at.slice(0, 10) > collection.due_date) {
            lateCollectionsByTenant.set(collection.tenant_id, (lateCollectionsByTenant.get(collection.tenant_id) ?? 0) + 1);
        }
    }

    return {
        likelyDefaults: input.tenants
            .map((tenant) => ({
                tenantId: tenant.id,
                tenantName: tenant.full_name ?? "Tenant",
                balance: amount(tenant.balance),
                riskScore: Math.max(
                    Number(tenant.risk_score ?? 0),
                    tenant.tenant_reliability_score == null ? 0 : Math.max(0, 100 - Number(tenant.tenant_reliability_score)),
                    Math.min(100, Math.round(percent(amount(tenant.balance), Math.max(1, amount(tenant.monthly_rent) * 3)))),
                ),
                officeName: tenant.office_id ? officeById.get(tenant.office_id) ?? "Office" : "Office",
            }))
            .filter((tenant) => tenant.balance > 0 || tenant.riskScore >= 50)
            .sort((a, b) => b.riskScore - a.riskScore)
            .slice(0, 8),
        repeatedLatePayers: input.tenants
            .map((tenant) => ({ tenantId: tenant.id, tenantName: tenant.full_name ?? "Tenant", lateCount: lateCollectionsByTenant.get(tenant.id) ?? 0, balance: amount(tenant.balance) }))
            .filter((tenant) => tenant.lateCount >= 2)
            .sort((a, b) => b.lateCount - a.lateCount)
            .slice(0, 6),
        longOutstandingBalances: input.tenants
            .filter((tenant) => amount(tenant.balance) > 0)
            .map((tenant) => ({ tenantId: tenant.id, tenantName: tenant.full_name ?? "Tenant", balance: amount(tenant.balance), daysOutstanding: tenant.updated_at ? Math.max(1, daysSince(tenant.updated_at)) : 30 }))
            .sort((a, b) => b.balance - a.balance)
            .slice(0, 6),
        highValueTenants: input.tenants
            .filter((tenant) => amount(tenant.monthly_rent) > 0)
            .map((tenant) => ({ tenantId: tenant.id, tenantName: tenant.full_name ?? "Tenant", monthlyRent: amount(tenant.monthly_rent), balance: amount(tenant.balance) }))
            .sort((a, b) => b.monthlyRent - a.monthlyRent)
            .slice(0, 6),
        vacantRoomOpportunities: input.rooms
            .filter((room) => !isOccupiedRoom(room))
            .map((room) => ({ roomId: room.id, roomNumber: room.room_number ?? "Room", officeName: room.office_id ? officeById.get(room.office_id) ?? "Office" : "Office", monthlyRent: amount(room.monthly_rent) }))
            .sort((a, b) => b.monthlyRent - a.monthlyRent)
            .slice(0, 8),
    };
}

function buildLandlordIntelligence(input: {
    landlords: LandlordRow[];
    properties: PropertyRow[];
    collections: CollectionRow[];
}): LandlordIntelligence {
    const propertiesByLandlord = new Map<string, number>();
    for (const property of input.properties) {
        if (property.landlord_id) propertiesByLandlord.set(property.landlord_id, (propertiesByLandlord.get(property.landlord_id) ?? 0) + 1);
    }
    const revenueByLandlord = new Map<string, number>();
    for (const collection of input.collections) {
        if (collection.landlord_id) revenueByLandlord.set(collection.landlord_id, (revenueByLandlord.get(collection.landlord_id) ?? 0) + amount(collection.amount_paid ?? collection.amount));
    }

    return {
        settlementDueAlerts: input.landlords
            .filter((landlord) => amount(landlord.balance_remaining) > 0)
            .map((landlord) => ({ landlordId: landlord.id, landlordName: landlord.full_name, balance: amount(landlord.balance_remaining), severity: severityFor(normalizedMoneyRisk(amount(landlord.balance_remaining))) }))
            .sort((a, b) => b.balance - a.balance)
            .slice(0, 6),
        highestRevenueLandlords: input.landlords
            .map((landlord) => ({ landlordId: landlord.id, landlordName: landlord.full_name, revenue: revenueByLandlord.get(landlord.id) ?? amount(landlord.expected_income), properties: propertiesByLandlord.get(landlord.id) ?? 0 }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 6),
        decliningPerformance: input.landlords
            .filter((landlord) => amount(landlord.expected_income) > 0 && (revenueByLandlord.get(landlord.id) ?? 0) < amount(landlord.expected_income) * 0.6)
            .map((landlord) => ({ landlordId: landlord.id, landlordName: landlord.full_name, currentRevenue: revenueByLandlord.get(landlord.id) ?? 0, signal: "Revenue is materially below expected income." }))
            .slice(0, 6),
        requiringAttention: input.landlords
            .filter((landlord) => amount(landlord.balance_remaining) > 0 || Number(landlord.trust_index ?? 100) < 60)
            .map((landlord) => ({ landlordId: landlord.id, landlordName: landlord.full_name, reason: amount(landlord.balance_remaining) > 0 ? "Settlement balance remains open." : "Trust index is below target.", riskScore: Math.max(normalizedMoneyRisk(amount(landlord.balance_remaining)), 100 - Number(landlord.trust_index ?? 100)) }))
            .sort((a, b) => b.riskScore - a.riskScore)
            .slice(0, 6),
    };
}

function buildOfficeIntelligence(input: {
    offices: OfficeRow[];
    collections: CollectionRow[];
    promises: PromiseRow[];
    rooms: RoomRow[];
    expenses: ExpenseRow[];
    attendance: AttendanceEventRow[];
    employees: EmployeeRow[];
}): OfficeIntelligence[] {
    return input.offices.map((office) => {
        const collections = input.collections.filter((item) => item.office_id === office.id);
        const rooms = input.rooms.filter((item) => item.office_id === office.id);
        const promises = input.promises.filter((item) => item.office_id === office.id);
        const expenses = input.expenses.filter((item) => item.office_id === office.id);
        const employees = input.employees.filter((item) => item.office_id === office.id);
        const attendance = input.attendance.filter((item) => item.office_id === office.id && sameDate(item.event_time, todayDate()));
        const collectionScore = percent(sumCollections(collections), Number(office.collection_target ?? sumCollections(collections)));
        const occupancyScore = percent(rooms.filter(isOccupiedRoom).length, rooms.length);
        const promiseScore = percent(promises.filter(isFulfilledPromise).length, promises.length);
        const attendanceScore = attendanceRate(attendance, employees);
        const expenseBudget = Number(office.expense_budget ?? 0);
        const expenseScore = expenseBudget ? Math.max(0, Math.min(100, Math.round(((expenseBudget - sumExpenses(expenses)) / expenseBudget) * 100))) : 80;
        const performanceScore = Math.round(collectionScore * 0.35 + promiseScore * 0.2 + occupancyScore * 0.2 + attendanceScore * 0.15 + expenseScore * 0.1);
        const riskScore = 100 - performanceScore;
        const growthScore = Math.round((occupancyScore + collectionScore) / 2);
        const trendScore = trendScoreFor(collections);
        const healthScore = Math.round(performanceScore * 0.55 + growthScore * 0.25 + trendScore * 0.2);

        return {
            officeId: office.id,
            officeName: office.office_name ?? office.name ?? "Office",
            healthScore,
            performanceScore,
            riskScore,
            growthScore,
            trendScore,
            status: officeStatus(healthScore),
        };
    }).sort((a, b) => b.healthScore - a.healthScore);
}

function buildCommandFeed(input: {
    risks: ExecutiveRisk[];
    collection: CollectionIntelligence;
    tenant: TenantIntelligence;
    officeIntelligence: OfficeIntelligence[];
    finance: FinanceIntelligence;
}) {
    const now = new Date().toISOString();
    const feed = input.risks.slice(0, 4).map((risk) => ({
        id: `feed-${risk.id}`,
        message: `${risk.officeName} has a ${risk.riskScore}% risk score. ${risk.recommendedAction}`,
        severity: risk.severity,
        trend: risk.trend,
        createdAt: now,
    }));
    const miss = input.collection.officesLikelyToMissTargets[0];
    if (miss) {
        feed.push({
            id: "feed-target-miss",
            message: `${miss.officeName} is projected to miss target by ${100 - miss.targetAchievement}%.`,
            severity: "high",
            trend: "down",
            createdAt: now,
        });
    }
    const best = input.officeIntelligence[0];
    if (best) {
        feed.push({
            id: "feed-best-office",
            message: `${best.officeName} is leading office health with a ${best.healthScore} score.`,
            severity: "low",
            trend: "up",
            createdAt: now,
        });
    }
    if (input.tenant.vacantRoomOpportunities.length) {
        feed.push({
            id: "feed-vacancy",
            message: `${input.tenant.vacantRoomOpportunities.length} vacant room opportunities are ready for occupancy action.`,
            severity: "medium",
            trend: "flat",
            createdAt: now,
        });
    }
    feed.push({
        id: "feed-monthly-finance",
        message: `Monthly collection progress is ${input.finance.collectionProgress}%. Expected company commission is UGX ${Math.round(input.finance.expectedCompanyCommission).toLocaleString()}, with projected profit/loss at UGX ${Math.round(input.finance.projectedProfitLoss).toLocaleString()}.`,
        severity: input.finance.collectionProgress >= 75 ? "low" : input.finance.collectionProgress >= 45 ? "medium" : "high",
        trend: input.finance.collectionProgress >= 75 ? "up" : "down",
        createdAt: now,
    });
    return feed;
}

function buildRecommendations(
    risks: ExecutiveRisk[],
    collection: CollectionIntelligence,
    tenant: TenantIntelligence,
    landlord: LandlordIntelligence,
    offices: OfficeIntelligence[],
    finance: FinanceIntelligence,
): ExecutiveRecommendation[] {
    return [
        {
            id: "increase-follow-up",
            title: "Increase follow-up effort",
            description: `${collection.officesLikelyToMissTargets.length} offices are below target trajectory.`,
            priority: collection.officesLikelyToMissTargets.length ? "high" : "low",
            action: "Assign collectors to the weakest office target gaps before close of day.",
        },
        {
            id: "overdue-balances",
            title: "Focus on overdue balances",
            description: `${tenant.longOutstandingBalances.length} tenants show long outstanding balances.`,
            priority: tenant.longOutstandingBalances.length ? "high" : "low",
            action: "Prioritize high-balance tenants for structured recovery plans.",
        },
        {
            id: "office-expenses",
            title: "Review office expenses",
            description: `${risks.filter((risk) => risk.recommendedAction.toLowerCase().includes("expense")).length} offices show expense pressure.`,
            priority: "medium",
            action: "Review office-level expense categories and approval discipline.",
        },
        {
            id: "attendance-performance",
            title: "Review attendance performance",
            description: `${offices.filter((office) => office.riskScore > 40).length} offices have elevated operational risk.`,
            priority: offices.some((office) => office.riskScore > 50) ? "high" : "medium",
            action: "Coach offices where attendance and collections are moving together negatively.",
        },
        {
            id: "occupancy-growth",
            title: "Improve occupancy",
            description: `${tenant.vacantRoomOpportunities.length} vacant high-value room opportunities detected.`,
            priority: tenant.vacantRoomOpportunities.length ? "medium" : "low",
            action: "Launch occupancy drive against the highest-rent vacant rooms.",
        },
        {
            id: "landlord-attention",
            title: "Resolve landlord attention list",
            description: `${landlord.requiringAttention.length} landlords require settlement or relationship attention.`,
            priority: landlord.requiringAttention.length ? "medium" : "low",
            action: "Prepare settlement review and landlord communication plan.",
        },
        {
            id: "monthly-profit-discipline",
            title: "Protect monthly company profit",
            description: `Expected company commission is UGX ${Math.round(finance.expectedCompanyCommission).toLocaleString()} and collections are ${finance.collectionProgress}% of rent roll.`,
            priority: finance.collectionProgress < 50 ? "high" : finance.projectedProfitLoss < 0 ? "medium" : "low",
            action: "Prioritize offices with low progress before approving landlord payments and discretionary expenses.",
        },
    ];
}

type FinanceIntelligence = {
    expectedRentRoll: number;
    expectedCompanyCommission: number;
    collectedThisMonth: number;
    expensesThisMonth: number;
    collectionProgress: number;
    projectedProfitLoss: number;
};

function buildFinanceIntelligence(input: {
    rooms: RoomRow[];
    collections: CollectionRow[];
    expenses: ExpenseRow[];
    landlords: LandlordRow[];
    defaultCommissionRate: number;
}): FinanceIntelligence {
    const landlordById = new Map(input.landlords.map((landlord) => [landlord.id, landlord]));
    const expectedRentRoll = input.rooms.reduce((total, room) => total + amount(room.monthly_rent), 0);
    const expectedCompanyCommission = calculateExpectedCompanyCommission({
        rooms: input.rooms,
        landlordById,
        defaultCommissionRate: input.defaultCommissionRate,
    });
    const collectedThisMonth = sumCollections(input.collections);
    const expensesThisMonth = sumExpenses(input.expenses);
    return {
        expectedRentRoll,
        expectedCompanyCommission,
        collectedThisMonth,
        expensesThisMonth,
        collectionProgress: percent(collectedThisMonth, expectedRentRoll),
        projectedProfitLoss: collectedThisMonth - expensesThisMonth,
    };
}

function recommendedRiskAction(input: { targetRate: number; outstanding: number; absenteeism: number; expenseValue: number; occupancy: number; promiseFailure: number }) {
    const candidates = [
        { score: 100 - input.targetRate, action: "Increase collection follow-up and review office target plan." },
        { score: normalizedMoneyRisk(input.outstanding), action: "Focus recovery on high outstanding balances." },
        { score: input.absenteeism, action: "Review attendance performance and field coverage." },
        { score: normalizedMoneyRisk(input.expenseValue), action: "Review office expenses and approval discipline." },
        { score: 100 - input.occupancy, action: "Improve occupancy through vacant room conversion." },
        { score: input.promiseFailure, action: "Escalate broken and overdue promise follow-ups." },
    ];
    return candidates.sort((a, b) => b.score - a.score)[0]?.action ?? "Monitor office performance.";
}

function sumCollections(collections: CollectionRow[]) {
    return collections.reduce((total, collection) => total + amount(collection.amount_paid ?? collection.amount), 0);
}

function sumExpenses(expenses: ExpenseRow[]) {
    return expenses.reduce((total, expense) => total + amount(expense.amount), 0);
}

function amount(value: unknown) {
    return Number(value ?? 0);
}

function percent(numerator: number, denominator: number) {
    if (!denominator) return 0;
    return Math.max(0, Math.min(100, Math.round((numerator / denominator) * 100)));
}

function normalizedMoneyRisk(value: number) {
    if (value <= 0) return 0;
    return Math.max(10, Math.min(100, Math.round(value / 100000)));
}

function expenseRisk(expenseValue: number, budget: number) {
    if (!budget) return expenseValue ? 55 : 0;
    return Math.max(0, Math.min(100, Math.round((expenseValue / budget) * 100)));
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

function calculateExpectedCompanyCommission(input: {
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

    let expectedCompanyCommission = 0;
    for (const [landlordId, rooms] of roomsByLandlord.entries()) {
        const landlord = landlordId.startsWith("unassigned:") ? null : input.landlordById.get(landlordId) ?? null;
        const gross = rooms.reduce((total, room) => total + amount(room.monthly_rent), 0);
        const vacantDeduction = rooms.filter(isVacantCommissionRoom).reduce((total, room) => total + amount(room.monthly_rent), 0);
        const occupiedPayableRent = Math.max(0, gross - vacantDeduction);
        const rate = commissionRate(landlord, input.defaultCommissionRate);
        const mode = commissionCalculationMode(landlord);
        const commissionBase = mode === "occupied_room_based" ? occupiedPayableRent : gross;
        expectedCompanyCommission += Math.round(commissionBase * rate / 100);
    }

    return expectedCompanyCommission;
}

function commissionCalculationMode(landlord: LandlordRow | null) {
    const mode = (landlord as (LandlordRow & { commission_calculation_mode?: string | null }) | null)?.commission_calculation_mode;
    return mode === "occupied_room_based" ? "occupied_room_based" : "portfolio_based";
}

function isVacantCommissionRoom(room: RoomRow) {
    const status = (room.status ?? "").toLowerCase();
    return status.includes("vacant") || status.includes("empty");
}

function severityFor(score: number): Severity {
    if (score >= 75) return "critical";
    if (score >= 55) return "high";
    if (score >= 35) return "medium";
    return "low";
}

function officeStatus(score: number): OfficeIntelligence["status"] {
    if (score >= 85) return "excellent";
    if (score >= 72) return "strong";
    if (score >= 60) return "watch";
    return "risk";
}

function isFulfilledPromise(promise: PromiseRow) {
    const status = (promise.status ?? "").toLowerCase();
    return Boolean(promise.fulfilled_at) || status === "fulfilled" || status === "paid";
}

function isBrokenPromise(promise: PromiseRow) {
    const status = (promise.status ?? "").toLowerCase();
    return status === "broken" || status === "cancelled" || status === "canceled";
}

function isOccupiedRoom(room: RoomRow) {
    return (room.status ?? "").toLowerCase().includes("occupied");
}

function attendanceRate(events: AttendanceEventRow[], employees: EmployeeRow[]) {
    const activeEmployees = employees.filter((employee) => !["terminated", "inactive", "archived"].includes((employee.status ?? "").toLowerCase()));
    const checkedIn = new Set(events.filter((event) => event.event_type === "check_in").map((event) => event.employee_id));
    return percent(checkedIn.size, activeEmployees.length);
}

function trendScoreFor(collections: CollectionRow[]) {
    const currentStart = dateOffset(-6);
    const previousStart = dateOffset(-13);
    const current = sumCollections(collections.filter((collection) => collection.paid_at && collection.paid_at.slice(0, 10) >= currentStart));
    const previous = sumCollections(collections.filter((collection) => {
        const date = collection.paid_at?.slice(0, 10) ?? "";
        return date >= previousStart && date < currentStart;
    }));
    if (!previous && current) return 85;
    if (!previous) return 50;
    return percent(current, previous);
}

function sameDate(value: string | null, date: string) {
    return value ? value.slice(0, 10) === date : false;
}

function daysSince(value: string) {
    return Math.round((Date.now() - new Date(value).getTime()) / 86400000);
}

function emptyData(): AiIntelligenceData {
    return {
        company: null,
        activeOffice: null,
        risks: [],
        collection: {
            collectionForecast: 0,
            endOfMonthProjection: 0,
            likelyRecoveryAmount: 0,
            officesLikelyToMissTargets: [],
            bestCollectors: [],
        },
        tenant: {
            likelyDefaults: [],
            repeatedLatePayers: [],
            longOutstandingBalances: [],
            highValueTenants: [],
            vacantRoomOpportunities: [],
        },
        landlord: {
            settlementDueAlerts: [],
            highestRevenueLandlords: [],
            decliningPerformance: [],
            requiringAttention: [],
        },
        offices: [],
        commandFeed: [],
        recommendations: [],
        storedInsights: [],
        dataQualityFindings: [],
    };
}
