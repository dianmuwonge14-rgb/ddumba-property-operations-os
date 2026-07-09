import { cache } from "react";
import { hasPermission, requireAuth, requirePermission } from "@/lib/auth/permissions";
import { getScopedSupabase } from "@/lib/auth/query";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { scheduledAdvanceDeductionForMonth } from "@/lib/landlord-advances/calculator";
import { getMoveInPayableDecision } from "@/lib/landlords/payable-cutoff";
import type {
    CollectionRow,
    ExpenseRow,
    LandlordPaymentDetail,
    LandlordItem,
    LandlordCommissionCalculationMode,
    LandlordRow,
    LandlordPaymentRow,
    LandlordPayoutRow,
    LandlordsPageData,
    LandlordSettlementEstimate,
    LandlordSettlementLineRow,
    LandlordSettlementRow,
    LandlordStatementRow,
    LandlordDebtDeductionRow,
    LandlordCurrentMonthPayable,
    LandlordMonthlyPayableRow,
    LandlordAdvanceDeductionLine,
    LeaseRow,
    LandlordRoomAssignmentOption,
    OfficeRow,
    PropertyRow,
    PropertyLandlordRow,
    RoomRow,
    TenantRow,
    VacatedTenantDebtRow,
} from "./types";

const LANDLORD_PAGE_SIZE = 60;

function currentSettlementMonth() {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

type LandlordSearchIndexRow = {
    landlord_id: string;
    company_id: string;
    office_id: string | null;
    landlord_name: string;
    normalized_name: string;
    phone: string | null;
    office_name: string | null;
    room_count: number | string | null;
    rent_roll: number | string | null;
    net_payable: number | string | null;
};

export async function getLandlordNamePrefixSearchData(input: {
    page?: number;
    search: string;
}): Promise<LandlordsPageData | null> {
    const normalizedSearch = normalizeLandlordSearch(input.search);

    const context = await requireAuth();
    const canOpenPortfolio =
        hasPermission(context, "landlords.read") ||
        hasPermission(context, "landlords.view") ||
        hasPermission(context, "collections.read");

    if (!canOpenPortfolio) return emptyData();

    const adminSupabase = createSupabaseAdminClient();
    const companyId = context.activeCompany?.id;
    const officeId = context.activeOffice?.id;
    const canAccessAllOffices = context.canAccessAllOffices || context.isCompanyAdmin;

    if (!companyId || (!officeId && !canAccessAllOffices)) return emptyData();

    const requestedPage = Math.max(1, Math.floor(Number(input.page ?? 1)));
    const from = (requestedPage - 1) * LANDLORD_PAGE_SIZE;
    const to = requestedPage * LANDLORD_PAGE_SIZE - 1;
    const prefix = `${escapeSupabaseLike(normalizedSearch)}%`;

    let indexQuery = (adminSupabase as unknown as { from: (table: string) => ReturnType<typeof adminSupabase.from> })
        .from("landlord_search_index")
        .select("*", { count: "planned" })
        .eq("company_id", companyId)
        .order("normalized_name")
        .range(from, to);
    if (normalizedSearch) indexQuery = indexQuery.ilike("normalized_name", prefix);
    if (!canAccessAllOffices && officeId) indexQuery = indexQuery.eq("office_id", officeId);

    const [indexResult, companySettingsResult] = await Promise.all([
        indexQuery,
        adminSupabase
            .from("company_settings")
            .select("*")
            .eq("company_id", companyId)
            .eq("key", "default_landlord_commission_rate"),
    ]);

    if (indexResult.error) {
        console.warn(`Fast landlord name search failed: ${indexResult.error.message}`);
        return null;
    }

    const indexRows = (indexResult.data ?? []) as LandlordSearchIndexRow[];
    const landlordIds = indexRows.map((row) => row.landlord_id);
    if (landlordIds.length === 0) {
        return {
            ...emptyData(),
            company: context.activeCompany,
            office: context.activeOffice,
            pagination: {
                page: 1,
                pageSize: LANDLORD_PAGE_SIZE,
                totalLandlords: 0,
                totalPages: 1,
                search: input.search,
                hasPreviousPage: false,
                hasNextPage: false,
            },
            companyDefaultCommissionRate: parseCommissionSetting(companySettingsResult.data?.[0]?.value, 10),
        };
    }

    const currentMonth = currentSettlementMonth();
    const [landlordRowsResult, monthlyPayablesResult] = await Promise.all([
        adminSupabase
            .from("landlords")
            .select("*")
            .eq("company_id", companyId)
            .in("id", landlordIds),
        (adminSupabase as unknown as { from: (table: string) => ReturnType<typeof adminSupabase.from> })
            .from("landlord_monthly_payables")
            .select("*")
            .eq("company_id", companyId)
            .eq("settlement_month", currentMonth)
            .neq("status", "archived")
            .in("landlord_id", landlordIds),
    ]);
    const { data: landlordRows, error: landlordError } = landlordRowsResult;
    if (landlordError) throw new Error(landlordError.message);
    if (monthlyPayablesResult.error) throw new Error(monthlyPayablesResult.error.message);

    const companyDefaultCommissionRate = parseCommissionSetting(companySettingsResult.data?.[0]?.value, 10);
    const landlordById = new Map((landlordRows ?? []).map((landlord) => [landlord.id, landlord]));
    const currentPayableByLandlord = new Map(((monthlyPayablesResult.data ?? []) as LandlordMonthlyPayableRow[]).map((row) => [row.landlord_id, row]));
    const approvedPaymentDetailsByLandlord = new Map<string, LandlordPaymentDetail[]>();
    const pendingPaymentDetailsByLandlord = new Map<string, LandlordPaymentDetail[]>();
    const totalLandlords = indexResult.count ?? indexRows.length;
    const totalPages = Math.max(1, Math.ceil(totalLandlords / LANDLORD_PAGE_SIZE));
    const items = indexRows.flatMap((indexRow): LandlordItem[] => {
        const landlord = landlordById.get(indexRow.landlord_id);
        if (!landlord) return [];
        const indexedRentRoll = Number(indexRow.rent_roll ?? 0);
        const roomCount = Number(indexRow.room_count ?? 0);
        const landlordCommissionRate = Number((landlord as typeof landlord & { commission_rate?: number | string | null }).commission_rate ?? NaN);
        const commissionRate = Number.isFinite(landlordCommissionRate) ? landlordCommissionRate : companyDefaultCommissionRate;
        const commissionMetadata = parseCommissionMetadata((landlord as typeof landlord & { commission_notes?: string | null }).commission_notes);
        const commissionCalculationMode = parseCommissionCalculationMode(
            (landlord as typeof landlord & { commission_calculation_mode?: string | null }).commission_calculation_mode
            ?? commissionMetadata.commissionCalculationMode,
        );
        const currentMonthRow = currentPayableByLandlord.get(landlord.id) ?? null;
        const rentRoll = indexedRentRoll;
        const commissionBaseAmount = rentRoll;
        const commissionAmount = Math.round(commissionBaseAmount * (commissionRate / 100));
        const netPayable = Math.max(0, rentRoll - commissionAmount);
        const currentMonthPayable = currentMonthRow
            ? mergeCurrentMonthPayableWithLiveEstimate(buildCurrentMonthPayableFromRow(currentMonthRow), {
                commissionAmount,
                commissionBaseAmount,
                commissionRate,
                fullRentRoll: rentRoll,
                netPayable,
                recoveryDeduction: 0,
            })
            : buildCurrentMonthPayableFallback({
                commissionBaseAmount,
                commissionMode: commissionCalculationMode,
                commissionRate,
                fullRentRoll: rentRoll,
                netPayable,
                recoveryDeduction: 0,
            });
        const settlementEstimate: LandlordSettlementEstimate = {
            settlementMonth: new Date().toISOString().slice(0, 7),
            roomsOwned: roomCount,
            occupiedRooms: roomCount,
            vacantRooms: 0,
            expectedGrossRent: rentRoll,
            occupiedPayableRent: rentRoll,
            commissionBaseAmount: currentMonthPayable.commissionBaseAmount,
            commissionCalculationMode: currentMonthPayable.commissionMode as LandlordCommissionCalculationMode,
            companyCommissionRate: currentMonthPayable.commissionPercentage,
            companyCommissionAmount: currentMonthPayable.commissionAmount,
            landlordGrossPayable: currentMonthPayable.netPayable,
            previousUnrecoveredTenantDebts: 0,
            emptyRoomDeductions: 0,
            vacatedTenantDebtDeductions: currentMonthPayable.recoveryDeduction,
            netLandlordPayable: currentMonthPayable.netPayable,
            carriedForwardRecoveryBalance: 0,
            paymentStatus: currentMonthPayable.status === "paid" ? "paid" : currentMonthPayable.status === "partial" ? "partially_paid" : "pending",
            occupiedRoomLines: [],
            vacantRoomLines: [],
            recoveryLines: [],
            advanceDeductionLines: [],
            landlordAdvanceDeductions: 0,
        };
        const office = indexRow.office_id
            ? ({
                id: indexRow.office_id,
                company_id: companyId,
                office_name: indexRow.office_name ?? "Office",
                name: indexRow.office_name ?? "Office",
                status: "active",
            } as OfficeRow)
            : null;

        return [{
            ...landlord,
            portfolioRoomCount: roomCount,
            searchableText: normalizeLandlordSearch(indexRow.landlord_name),
            commissionRate,
            commissionCalculationMode,
            commissionInputMode: parseCommissionInputMode(
                (landlord as typeof landlord & { commission_input_mode?: string | null }).commission_input_mode
                ?? commissionMetadata.commissionInputMode,
            ),
            landlordNetPayableOverride: null,
            commissionSource: Number.isFinite(landlordCommissionRate) ? "landlord_override" : "company_default",
            commissionUpdatedAt: (landlord as typeof landlord & { commission_updated_at?: string | null }).commission_updated_at ?? null,
            commissionUpdatedBy: (landlord as typeof landlord & { commission_updated_by?: string | null }).commission_updated_by ?? null,
            companyDefaultCommissionRate,
            offices: office ? [office] : [],
            properties: [],
            rooms: [],
            locations: [],
            settlements: [],
            settlementLines: [],
            statements: [],
            payments: [],
            payouts: [],
            collectionValue: 0,
            expenseValue: 0,
            netPayable: currentMonthPayable.netPayable,
            outstandingSettlementValue: currentMonthPayable.outstandingAmount,
            totalExpectedMonthlyCollection: rentRoll,
            totalCollectedThisMonth: currentMonthPayable.paidAmount,
            totalOutstandingBalance: 0,
            totalLandlordPayable: currentMonthPayable.outstandingAmount,
            vacatedTenantDebts: [],
            landlordDebtDeductions: [],
            totalVacatedTenantDebt: 0,
            totalRecoveredFromLandlord: 0,
            remainingRecoveryBalance: 0,
            monthlyPayables: currentMonthRow ? [currentMonthRow] : [],
            currentMonthPayable,
            unpaidMonthlyPayables: currentMonthRow && currentMonthPayable.outstandingAmount > 0 ? [currentMonthRow] : [],
            totalUnpaidMonthlyPayables: currentMonthPayable.outstandingAmount,
            oldestUnpaidMonth: currentMonthPayable.outstandingAmount > 0 ? currentMonthPayable.month : null,
            settlementEstimate,
            activePaymentDetail: defaultPaymentDetail(approvedPaymentDetailsByLandlord.get(landlord.id) ?? []),
            pendingPaymentDetail: (pendingPaymentDetailsByLandlord.get(landlord.id) ?? [])[0] ?? null,
            approvedPaymentDetails: approvedPaymentDetailsByLandlord.get(landlord.id) ?? [],
            pendingPaymentDetails: pendingPaymentDetailsByLandlord.get(landlord.id) ?? [],
        }];
    });

    return {
        company: context.activeCompany,
        office: context.activeOffice,
        kpis: {
            totalLandlords,
            activeLandlords: items.filter((landlord) => (landlord.status ?? "active") === "active").length,
            propertiesManaged: 0,
            outstandingSettlements: items.reduce((total, landlord) => total + landlord.outstandingSettlementValue, 0),
            settlementsDue: 0,
            collectionValue: 0,
            netPayable: items.reduce((total, landlord) => total + landlord.netPayable, 0),
        },
        landlords: items,
        pagination: {
            page: requestedPage,
            pageSize: LANDLORD_PAGE_SIZE,
            totalLandlords,
            totalPages,
            search: input.search,
            hasPreviousPage: requestedPage > 1,
            hasNextPage: requestedPage < totalPages,
        },
        selectedLandlordId: null,
        unassignedProperties: [],
        companyDefaultCommissionRate,
        roomAssignmentOptions: [],
    };
}

export const getLandlordsPageData = cache(async function getLandlordsPageData(input: {
    page?: number;
    search?: string;
    selectedLandlordId?: string | null;
} = {}): Promise<LandlordsPageData> {
    const context = await requireAuth();
    const canOpenPortfolio =
        hasPermission(context, "landlords.read") ||
        hasPermission(context, "landlords.view") ||
        hasPermission(context, "collections.read");

    if (!canOpenPortfolio) {
        return emptyData();
    }

    const { supabase } = await getScopedSupabase();
    const adminSupabase = createSupabaseAdminClient();
    const readSupabase = adminSupabase;
    const companyId = context.activeCompany?.id;
    const officeId = context.activeOffice?.id;
    const canAccessAllOffices = context.canAccessAllOffices || context.isCompanyAdmin;

    if (!companyId || (!officeId && !canAccessAllOffices)) {
        return emptyData();
    }
    const requestedPage = Math.max(1, Math.floor(Number(input.page ?? 1)));
    const search = (input.search ?? "").trim();
    const selectedLandlordId = input.selectedLandlordId ?? null;

    if (!selectedLandlordId) {
        const fastIndexData = await getLandlordNamePrefixSearchData({
            page: requestedPage,
            search,
        });
        if (fastIndexData) return fastIndexData;
    }

    const expensesQuery = readSupabase.from("expenses").select("*").eq("company_id", companyId);
    const officesQuery = readSupabase.from("offices").select("*").eq("company_id", companyId).ilike("status", "active");
    const companySettingsQuery = readSupabase
        .from("company_settings")
        .select("*")
        .eq("company_id", companyId)
        .eq("key", "default_landlord_commission_rate");

    if (!canAccessAllOffices && officeId) {
        expensesQuery.eq("office_id", officeId);
        officesQuery.eq("id", officeId);
    }

    const matchedLandlordIds = search
        ? await collectLandlordSearchIds({
            supabase: adminSupabase,
            companyId,
            officeId: canAccessAllOffices ? null : officeId,
            search,
        })
        : new Set<string>();
    const officeScopedLandlordIds = !canAccessAllOffices && officeId
        ? await collectOfficeLandlordIds({ supabase: adminSupabase, companyId, officeId })
        : new Set<string>();

    let landlordsQuery = adminSupabase
        .from("landlords")
        .select("*", { count: "planned" })
        .eq("company_id", companyId)
        .neq("status", "archived")
        .order("full_name");

    if (search) {
        const pattern = `%${escapeSupabaseLike(search)}%`;
        const searchFilters = [
            `full_name.ilike.${pattern}`,
        ];
        if (matchedLandlordIds.size > 0) {
            searchFilters.push(`id.in.(${[...matchedLandlordIds].join(",")})`);
        }
        landlordsQuery = landlordsQuery.or(searchFilters.join(","));
    }

    if (!canAccessAllOffices && officeId) {
        if (officeScopedLandlordIds.size === 0) {
            return {
                ...emptyData(),
                company: context.activeCompany,
                office: context.activeOffice,
                pagination: {
                    page: 1,
                    pageSize: LANDLORD_PAGE_SIZE,
                    totalLandlords: 0,
                    totalPages: 1,
                    search,
                    hasPreviousPage: false,
                    hasNextPage: false,
                },
                companyDefaultCommissionRate: 10,
            };
        }
        landlordsQuery = landlordsQuery.in("id", [...officeScopedLandlordIds]);
    }

    if (canAccessAllOffices) {
        landlordsQuery = landlordsQuery.range((requestedPage - 1) * LANDLORD_PAGE_SIZE, requestedPage * LANDLORD_PAGE_SIZE - 1);
    }

    const [
        landlordsResult,
        officesResult,
        expensesResult,
        settlementsResult,
        linesResult,
        statementsResult,
        paymentsResult,
        payoutsResult,
        debtsResult,
        deductionsResult,
        companySettingsResult,
    ] = await Promise.all([
        landlordsQuery,
        officesQuery,
        Promise.resolve({ data: [] as ExpenseRow[], error: null }),
        Promise.resolve({ data: [] as LandlordSettlementRow[], error: null }),
        Promise.resolve({ data: [] as LandlordSettlementLineRow[], error: null }),
        Promise.resolve({ data: [] as LandlordStatementRow[], error: null }),
        Promise.resolve({ data: [] as LandlordPaymentRow[], error: null }),
        Promise.resolve({ data: [] as LandlordPayoutRow[], error: null }),
        Promise.resolve({ data: [] as VacatedTenantDebtRow[], error: null }),
        Promise.resolve({ data: [] as LandlordDebtDeductionRow[], error: null }),
        companySettingsQuery,
    ]);

    for (const result of [
        landlordsResult,
        officesResult,
    ]) {
        if (result.error) throw new Error(result.error.message);
    }
    for (const [label, result] of [
        ["expenses", expensesResult],
        ["settlements", settlementsResult],
        ["settlement lines", linesResult],
        ["statements", statementsResult],
        ["payments", paymentsResult],
        ["payouts", payoutsResult],
        ["vacated debts", debtsResult],
        ["debt deductions", deductionsResult],
        ["company settings", companySettingsResult],
    ] as const) {
        if (result.error) console.warn(`Optional landlord ${label} query failed: ${result.error.message}`);
    }

    const rawLandlords = landlordsResult.data ?? [];
    const totalLandlords = landlordsResult.count ?? rawLandlords.length;
    const totalPages = Math.max(1, Math.ceil(totalLandlords / LANDLORD_PAGE_SIZE));
    const page = Math.min(requestedPage, totalPages);
    const seedLandlordIds = new Set(rawLandlords.map((landlord) => landlord.id));
    const propertyLandlordLinks = await fetchPropertyLandlordLinksForLandlords({
        supabase: readSupabase,
        companyId,
        landlordIds: [...seedLandlordIds],
    }).catch((error) => {
        console.warn("Optional landlord property links query failed:", error);
        return [] as PropertyLandlordRow[];
    });
    const linkedPropertyIds = propertyLandlordLinks.map((link) => link.property_id);
    const properties = await fetchPropertiesForLandlords({
        supabase: readSupabase,
        companyId,
        officeId: canAccessAllOffices ? null : officeId,
        landlordIds: [...seedLandlordIds],
        propertyIds: linkedPropertyIds,
    }).catch((error) => {
        console.warn("Optional landlord properties query failed:", error);
        return [] as PropertyRow[];
    });
    const seedPropertyIds = new Set<string>();
    for (const property of properties) {
        if (property.landlord_id && seedLandlordIds.has(property.landlord_id)) seedPropertyIds.add(property.id);
    }
    for (const link of propertyLandlordLinks) {
        if (seedLandlordIds.has(link.landlord_id)) seedPropertyIds.add(link.property_id);
    }
    const rooms = (await fetchAllRooms({
        supabase: readSupabase,
        companyId,
        officeId: canAccessAllOffices ? null : officeId,
        landlordIds: [...seedLandlordIds],
        propertyIds: [...seedPropertyIds],
    }).catch((error) => {
        console.warn("Optional landlord rooms query failed:", error);
        return [] as RoomRow[];
    })).filter(isActivePortfolioRoom);
    const collections = await fetchCurrentMonthCollections({
        supabase: readSupabase,
        companyId,
        officeId: canAccessAllOffices ? null : officeId,
        landlordIds: [...seedLandlordIds],
        propertyIds: selectedLandlordId ? [...seedPropertyIds] : [],
        roomIds: selectedLandlordId ? rooms.map((room) => room.id) : [],
    }).catch((error) => {
        console.warn("Optional landlord collections query failed:", error);
        return [] as CollectionRow[];
    });
    const [paymentsScoped, debtsScoped, deductionsScoped, monthlyPayablesScoped, paymentDetailsScoped, landlordAdvancesScoped] = await Promise.all([
        fetchLandlordPaymentsForLandlords({
            supabase: readSupabase,
            companyId,
            officeId: canAccessAllOffices ? null : officeId,
            landlordIds: [...seedLandlordIds],
        }).catch((error) => {
            console.warn("Optional landlord payments query failed:", error);
            return [] as LandlordPaymentRow[];
        }),
        fetchVacatedDebtsForLandlords({
            supabase: readSupabase,
            companyId,
            officeId: canAccessAllOffices ? null : officeId,
            landlordIds: [...seedLandlordIds],
        }).catch((error) => {
            console.warn("Optional landlord debts query failed:", error);
            return [] as VacatedTenantDebtRow[];
        }),
        fetchLandlordDeductionsForLandlords({
            supabase: readSupabase,
            companyId,
            officeId: canAccessAllOffices ? null : officeId,
            landlordIds: [...seedLandlordIds],
        }).catch((error) => {
            console.warn("Optional landlord deductions query failed:", error);
            return [] as LandlordDebtDeductionRow[];
        }),
        fetchLandlordMonthlyPayablesForLandlords({
            supabase: readSupabase,
            companyId,
            officeId: canAccessAllOffices ? null : officeId,
            landlordIds: [...seedLandlordIds],
        }).catch((error) => {
            console.warn("Optional landlord monthly payables query failed:", error);
            return [] as LandlordMonthlyPayableRow[];
        }),
        fetchLandlordPaymentDetailsForLandlords({
            supabase: readSupabase,
            companyId,
            officeId: canAccessAllOffices ? null : officeId,
            landlordIds: [...seedLandlordIds],
        }).catch((error) => {
            console.warn("Optional landlord payment details query failed:", error);
            return [] as LandlordPaymentDetail[];
        }),
        fetchLandlordAdvancesForLandlords({
            supabase: readSupabase,
            companyId,
            officeId: canAccessAllOffices ? null : officeId,
            landlordIds: [...seedLandlordIds],
        }).catch((error) => {
            console.warn("Optional landlord advances query failed:", error);
            return [] as Array<Record<string, unknown>>;
        }),
    ]);
    const selectedPropertyIds = new Set<string>();
    if (selectedLandlordId) {
        for (const property of properties) {
            if (property.landlord_id === selectedLandlordId) selectedPropertyIds.add(property.id);
        }
        for (const link of propertyLandlordLinks) {
            if (link.landlord_id === selectedLandlordId) selectedPropertyIds.add(link.property_id);
        }
    }
    const roomIds = selectedLandlordId
        ? rooms
            .filter((room) => room.landlord_id === selectedLandlordId || (room.property_id ? selectedPropertyIds.has(room.property_id) : false))
            .map((room) => room.id)
        : [];
    const { leases, tenants } = await fetchRoomTenancyContext({
        supabase: readSupabase,
        companyId,
        officeId: canAccessAllOffices ? null : officeId,
        roomIds,
    }).catch((error) => {
        console.warn("Optional landlord tenancy query failed:", error);
        return { leases: [] as LeaseRow[], tenants: [] as TenantRow[] };
    });
    const offices = officesResult.data ?? [];
    const vacatedTenantDebts = paymentsScoped.length || debtsScoped.length || deductionsScoped.length
        ? debtsScoped
        : (debtsResult.data ?? []) as VacatedTenantDebtRow[];
    const landlordDebtDeductions = paymentsScoped.length || debtsScoped.length || deductionsScoped.length
        ? deductionsScoped
        : (deductionsResult.data ?? []) as LandlordDebtDeductionRow[];
    const companyDefaultCommissionRate = parseCommissionSetting(companySettingsResult.data?.[0]?.value, 10);
    const propertyById = new Map(properties.map((property) => [property.id, property]));
    const officeById = new Map(offices.map((office) => [office.id, office]));
    const activeLeaseByRoomId = new Map<string, LeaseRow>();
    for (const lease of leases) {
        if (!activeLeaseByRoomId.has(lease.room_id)) activeLeaseByRoomId.set(lease.room_id, lease);
    }
    const tenantById = new Map(tenants.map((tenant) => [tenant.id, tenant]));
    const tenantByRoomId = new Map<string, TenantRow>();
    for (const tenant of tenants) {
        if (tenant.room_id && !tenantByRoomId.has(tenant.room_id)) tenantByRoomId.set(tenant.room_id, tenant);
    }

    const scopedLandlordIds = new Set<string>();
    for (const property of properties) {
        if (property.landlord_id) scopedLandlordIds.add(property.landlord_id);
    }
    for (const room of rooms) {
        if (room.landlord_id) scopedLandlordIds.add(room.landlord_id);
        const property = room.property_id ? propertyById.get(room.property_id) : null;
        if (property?.landlord_id) scopedLandlordIds.add(property.landlord_id);
    }
    for (const link of propertyLandlordLinks) {
        if (propertyById.has(link.property_id)) scopedLandlordIds.add(link.landlord_id);
    }
    for (const debt of vacatedTenantDebts) {
        if (debt.landlord_id) scopedLandlordIds.add(debt.landlord_id);
    }
    for (const deduction of landlordDebtDeductions) {
        if (deduction.landlord_id) scopedLandlordIds.add(deduction.landlord_id);
    }
    for (const payable of monthlyPayablesScoped) {
        if (payable.landlord_id) scopedLandlordIds.add(payable.landlord_id);
    }

    const landlords = (landlordsResult.data ?? []).filter((landlord) => canAccessAllOffices || scopedLandlordIds.has(landlord.id));
    const expenses = expensesResult.data ?? [];
    const settlementsAll = settlementsResult.data ?? [];
    const statementsAll = statementsResult.data ?? [];
    const settlementLinesAll = linesResult.data ?? [];
    const paymentsAll = paymentsScoped.length ? paymentsScoped : paymentsResult.data ?? [];
    const payoutsAll = payoutsResult.data ?? [];
    const propertyLinksByLandlord = groupBy(propertyLandlordLinks, (link) => link.landlord_id);
    const propertiesByDirectLandlord = groupBy(properties, (property) => property.landlord_id ?? "__none__");
    const roomsByDirectLandlord = groupBy(rooms, (room) => room.landlord_id ?? "__none__");
    const unassignedRoomsByProperty = groupBy(
        rooms.filter((room) => !room.landlord_id && room.property_id),
        (room) => room.property_id ?? "__none__",
    );
    const collectionsByLandlord = groupBy(collections, (collection) => collection.landlord_id ?? "__none__");
    const collectionsByProperty = groupBy(collections, (collection) => collection.property_id ?? "__none__");
    const collectionsByRoom = groupBy(collections, (collection) => collection.room_id ?? "__none__");
    const expensesByProperty = groupBy(expenses, (expense) => expense.property_id ?? "__none__");
    const settlementsByLandlord = groupBy(settlementsAll, (settlement) => settlement.landlord_id ?? "__none__");
    const paymentsByLandlord = groupBy(paymentsAll, (payment) => payment.landlord_id ?? "__none__");
    const payoutsByLandlord = groupBy(payoutsAll, (payout) => payout.landlord_id ?? "__none__");
    const debtsByLandlord = groupBy(vacatedTenantDebts, (debt) => debt.landlord_id ?? "__none__");
    const deductionsByLandlord = groupBy(landlordDebtDeductions, (deduction) => deduction.landlord_id ?? "__none__");
    const monthlyPayablesByLandlord = groupBy(monthlyPayablesScoped, (payable) => payable.landlord_id ?? "__none__");
    const advancesByLandlord = groupBy(landlordAdvancesScoped, (advance) => String(advance.landlord_id ?? "__none__"));
    const approvedPaymentDetailsByLandlord = groupPaymentDetails(paymentDetailsScoped.filter((detail) => detail.status === "approved" && detail.isActive));
    const pendingPaymentDetailsByLandlord = groupPaymentDetails(paymentDetailsScoped.filter((detail) => detail.status === "pending"));
    const statementsBySettlement = groupBy(statementsAll, (statement) => statement.settlement_id);
    const linesBySettlement = groupBy(settlementLinesAll, (line) => line.settlement_id);

    const items = landlords.map((landlord): LandlordItem => {
        const linkedPropertyIds = new Set((propertyLinksByLandlord.get(landlord.id) ?? [])
            .filter((link) => propertyById.has(link.property_id))
            .map((link) => link.property_id));
        const landlordPropertiesById = new Map<string, PropertyRow>();
        for (const property of propertiesByDirectLandlord.get(landlord.id) ?? []) landlordPropertiesById.set(property.id, property);
        for (const propertyId of linkedPropertyIds) {
            const property = propertyById.get(propertyId);
            if (property) landlordPropertiesById.set(property.id, property);
        }
        const landlordProperties = [...landlordPropertiesById.values()];
        const propertyIds = new Set(landlordProperties.map((property) => property.id));
        const landlordRoomsById = new Map<string, RoomRow>();
        for (const room of roomsByDirectLandlord.get(landlord.id) ?? []) landlordRoomsById.set(room.id, room);
        for (const propertyId of propertyIds) {
            for (const room of unassignedRoomsByProperty.get(propertyId) ?? []) landlordRoomsById.set(room.id, room);
        }
        const landlordRooms = [...landlordRoomsById.values()];
        const officeIds = new Set(
            landlordRooms
                .map((room) => room.office_id)
                .filter((id): id is string => Boolean(id)),
        );
        const landlordOffices = [...officeIds]
            .map((id) => officeById.get(id))
            .filter((office): office is OfficeRow => Boolean(office));
        const roomIds = new Set(landlordRooms.map((room) => room.id));
        const landlordCollectionsById = new Map<string, CollectionRow>();
        for (const collection of collectionsByLandlord.get(landlord.id) ?? []) landlordCollectionsById.set(collection.id, collection);
        for (const propertyId of propertyIds) {
            for (const collection of collectionsByProperty.get(propertyId) ?? []) landlordCollectionsById.set(collection.id, collection);
        }
        for (const roomId of roomIds) {
            for (const collection of collectionsByRoom.get(roomId) ?? []) landlordCollectionsById.set(collection.id, collection);
        }
        const landlordCollections = [...landlordCollectionsById.values()];
        const landlordExpenses = [...propertyIds].flatMap((propertyId) => expensesByProperty.get(propertyId) ?? []);
        const settlements = settlementsByLandlord.get(landlord.id) ?? [];
        const settlementIds = new Set(settlements.map((settlement) => settlement.id));
        const statements = [...settlementIds].flatMap((settlementId) => statementsBySettlement.get(settlementId) ?? []);
        const payments = paymentsByLandlord.get(landlord.id) ?? [];
        const payouts = payoutsByLandlord.get(landlord.id) ?? [];
        const landlordDebts = debtsByLandlord.get(landlord.id) ?? [];
        const landlordDeductions = deductionsByLandlord.get(landlord.id) ?? [];
        const monthlyPayables = [...(monthlyPayablesByLandlord.get(landlord.id) ?? [])].sort((a, b) =>
            String(b.settlement_month).localeCompare(String(a.settlement_month)),
        );
        const currentMonthRow = monthlyPayables.find((payable) => String(payable.settlement_month).slice(0, 7) === currentSettlementMonth().slice(0, 7)) ?? null;
        const landlordAdvanceRows = advancesByLandlord.get(landlord.id) ?? [];
        const unpaidMonthlyPayables = monthlyPayables.filter((payable) => Number(payable.unpaid_balance ?? 0) > 0);
        const collectionValue = sumCollections(landlordCollections);
        const expenseValue = sumExpenses(landlordExpenses);
        const summaryRoomPortfolio = landlordRooms.map((room) => {
            const monthlyRent = Number(room.monthly_rent ?? 0);
            const outstandingBalance = Number(room.outstanding_balance ?? 0);
            const currentMonthRent = monthlyRent;
            const previousBalance = Math.max(0, outstandingBalance - currentMonthRent);
            const totalOutstandingBalance = Math.max(0, outstandingBalance);
            const collectedThisMonth = sumCollections(
                landlordCollections.filter((collection) => collection.room_id === room.id && isThisMonth(collection.paid_at ?? collection.created_at)),
            );
            const payable = getRoomPayableState({ currentMonthPayable: currentMonthRow, room, settlementMonth: currentSettlementMonth(), tenant: null });

            return {
                room,
                property: room.property_id ? propertyById.get(room.property_id) ?? null : null,
                tenant: null,
                lease: null,
                monthlyRent,
                previousBalance,
                currentMonthRent,
                outstandingBalance,
                totalOutstandingBalance,
                collectedThisMonth,
                unpaidBalance: totalOutstandingBalance,
                startDate: payable.startDate,
                payableThisMonth: payable.payableThisMonth,
                payableReason: payable.reason,
                companyExtraProfitAmount: payable.companyExtraProfitAmount,
                includedPayableAmount: payable.includedPayableAmount,
                landlordAlreadyPaid: payable.landlordAlreadyPaid,
                paymentStatus: payable.payableThisMonth ? "unpaid" as const : "vacant" as const,
            };
        });
        const detailedRoomPortfolio = selectedLandlordId === landlord.id ? landlordRooms.map((room) => {
            const lease = activeLeaseByRoomId.get(room.id) ?? null;
            const tenant = lease ? tenantById.get(lease.tenant_id) ?? null : tenantByRoomId.get(room.id) ?? null;
            const monthlyRent = Number(lease?.monthly_rent ?? tenant?.monthly_rent ?? room.monthly_rent ?? 0);
            const outstandingBalance = Number(tenant?.balance ?? room.outstanding_balance ?? 0);
            const currentMonthRent = monthlyRent;
            const previousBalance = Math.max(0, outstandingBalance - currentMonthRent);
            const totalOutstandingBalance = Math.max(0, outstandingBalance);
            const collectedThisMonth = sumCollections(
                landlordCollections.filter((collection) => collection.room_id === room.id && isThisMonth(collection.paid_at ?? collection.created_at)),
            );
            const unpaidBalance = totalOutstandingBalance;
            const payable = getRoomPayableState({ currentMonthPayable: currentMonthRow, leaseStartDate: lease?.start_date ?? null, room, settlementMonth: currentSettlementMonth(), tenant });

            return {
                room,
                property: room.property_id ? propertyById.get(room.property_id) ?? null : null,
                tenant,
                lease,
                monthlyRent,
                previousBalance,
                currentMonthRent,
                outstandingBalance,
                totalOutstandingBalance,
                collectedThisMonth,
                unpaidBalance,
                startDate: payable.startDate,
                payableThisMonth: payable.payableThisMonth,
                payableReason: payable.reason,
                companyExtraProfitAmount: payable.companyExtraProfitAmount,
                includedPayableAmount: payable.includedPayableAmount,
                landlordAlreadyPaid: payable.landlordAlreadyPaid,
                paymentStatus: getPaymentStatus({ tenant, monthlyRent, outstandingBalance, collectedThisMonth }),
            };
        }) : [];
        const totalExpectedMonthlyCollection = summaryRoomPortfolio.reduce((total, item) => total + item.monthlyRent, 0);
        const totalCollectedThisMonth = summaryRoomPortfolio.reduce((total, item) => total + item.collectedThisMonth, 0);
        const totalOutstandingBalance = summaryRoomPortfolio.reduce((total, item) => total + item.unpaidBalance, 0);
        const settlementNet = settlements.reduce((total, settlement) => total + Number(settlement.net_payable ?? 0), 0);
        const paid = payments.reduce((total, payment) => total + Number(payment.amount ?? 0), 0) +
            payouts.reduce((total, payout) => total + Number(payout.amount ?? 0), 0);
        const totalVacatedTenantDebt = landlordDebts.reduce((total, debt) => total + Number(debt.original_amount ?? 0), 0);
        const totalRecoveredFromLandlord = landlordDebts.reduce((total, debt) => total + Number(debt.recovered_amount ?? 0), 0);
        const remainingRecoveryBalance = landlordDebts.reduce((total, debt) => total + Number(debt.remaining_amount ?? 0), 0);
        const landlordCommissionRate = Number((landlord as typeof landlord & { commission_rate?: number | string | null }).commission_rate ?? NaN);
        const commissionRate = Number.isFinite(landlordCommissionRate) ? landlordCommissionRate : companyDefaultCommissionRate;
        const commissionMetadata = parseCommissionMetadata(
            (landlord as typeof landlord & { commission_notes?: string | null }).commission_notes,
        );
        const commissionCalculationMode = parseCommissionCalculationMode(
            (landlord as typeof landlord & { commission_calculation_mode?: string | null }).commission_calculation_mode
            ?? commissionMetadata.commissionCalculationMode,
        );
        const commissionInputMode = parseCommissionInputMode(
            (landlord as typeof landlord & { commission_input_mode?: string | null }).commission_input_mode
            ?? commissionMetadata.commissionInputMode,
        );
        const landlordNetPayableOverrideRaw = Number(
            (landlord as typeof landlord & { landlord_net_payable_override?: number | string | null }).landlord_net_payable_override
            ?? commissionMetadata.landlordNetPayableOverride
            ?? NaN,
        );
        const settlementEstimate = buildSettlementEstimate({
            roomPortfolio: summaryRoomPortfolio,
            landlordDeductions,
            commissionRate,
            commissionCalculationMode,
        });
        const netPayableBeforeRecovery = settlementNet || settlementEstimate.landlordGrossPayable || Math.max(0, totalCollectedThisMonth - expenseValue);
        const netPayable = Math.max(0, netPayableBeforeRecovery - settlementEstimate.vacatedTenantDebtDeductions);
        const currentMonthPayable = currentMonthRow
            ? mergeCurrentMonthPayableWithLiveEstimate(buildCurrentMonthPayableFromRow(currentMonthRow), {
                commissionAmount: settlementEstimate.companyCommissionAmount,
                commissionBaseAmount: settlementEstimate.commissionBaseAmount,
                commissionRate,
                fullRentRoll: settlementEstimate.expectedGrossRent,
                netPayable: settlementEstimate.netLandlordPayable,
                recoveryDeduction: settlementEstimate.vacatedTenantDebtDeductions,
            })
            : buildCurrentMonthPayableFallback({
                commissionBaseAmount: settlementEstimate.commissionBaseAmount,
                commissionMode: settlementEstimate.commissionCalculationMode,
                commissionRate,
                fullRentRoll: settlementEstimate.expectedGrossRent,
                netPayable: settlementEstimate.netLandlordPayable || netPayable,
                recoveryDeduction: settlementEstimate.vacatedTenantDebtDeductions,
            });
        const advanceDeductionLines = buildAdvanceDeductionLines(landlordAdvanceRows, currentMonthPayable.month);
        const liveAdvanceDeduction = advanceDeductionLines.reduce((total, line) => total + line.thisMonthDeduction, 0);
        const snapshotAdvanceDeduction = currentMonthRow ? Number(currentMonthRow.advance_deductions ?? 0) : 0;
        const appliedAdvanceDeduction = snapshotAdvanceDeduction > 0 ? snapshotAdvanceDeduction : liveAdvanceDeduction;
        const netPayableAfterAdvance = Math.max(0, currentMonthPayable.netPayable - (snapshotAdvanceDeduction > 0 ? 0 : liveAdvanceDeduction));
        const liveSettlementEstimate: LandlordSettlementEstimate = {
            ...settlementEstimate,
            commissionBaseAmount: currentMonthPayable.commissionBaseAmount,
            commissionCalculationMode: currentMonthPayable.commissionMode as LandlordCommissionCalculationMode,
            companyCommissionRate: currentMonthPayable.commissionPercentage,
            companyCommissionAmount: currentMonthPayable.commissionAmount,
            expectedGrossRent: settlementEstimate.expectedGrossRent,
            landlordGrossPayable: currentMonthPayable.netPayable,
            vacatedTenantDebtDeductions: currentMonthPayable.recoveryDeduction,
            netLandlordPayable: netPayableAfterAdvance,
            advanceDeductionLines,
            landlordAdvanceDeductions: appliedAdvanceDeduction,
            paymentStatus: currentMonthPayable.status === "paid" ? "paid" : currentMonthPayable.status === "partial" ? "partially_paid" : "pending",
        };
        const locations = Array.from(new Set(landlordProperties.map(propertyLabel).filter(Boolean)));
        const searchableText = [
            landlord.full_name,
            landlord.landlord_code,
            landlord.phone,
            landlord.email,
            ...landlordOffices.flatMap((office) => [office.office_name, office.name, office.city, office.region]),
            ...locations,
            ...landlordProperties.flatMap((property) => [
                property.property_name,
                property.name,
                property.village,
                property.city,
                property.address,
                property.property_code,
            ]),
            ...landlordRooms.map((room) => room.room_number),
            ...detailedRoomPortfolio.flatMap((item) => [item.tenant?.full_name, item.tenant?.phone]),
            search,
        ].filter(Boolean).join(" ").toLowerCase();

        return {
            ...landlord,
            portfolioRoomCount: summaryRoomPortfolio.length,
            searchableText,
            commissionRate,
            commissionCalculationMode,
            commissionInputMode,
            landlordNetPayableOverride: Number.isFinite(landlordNetPayableOverrideRaw) ? landlordNetPayableOverrideRaw : null,
            commissionSource: Number.isFinite(landlordCommissionRate) ? "landlord_override" : "company_default",
            commissionUpdatedAt: (landlord as typeof landlord & { commission_updated_at?: string | null }).commission_updated_at ?? null,
            commissionUpdatedBy: (landlord as typeof landlord & { commission_updated_by?: string | null }).commission_updated_by ?? null,
            companyDefaultCommissionRate,
            offices: landlordOffices,
            properties: landlordProperties,
            rooms: detailedRoomPortfolio,
            locations,
            settlements,
            settlementLines: [...settlementIds].flatMap((settlementId) => linesBySettlement.get(settlementId) ?? []),
            statements,
            payments,
            payouts,
            collectionValue,
            expenseValue,
            netPayable: netPayableAfterAdvance,
            outstandingSettlementValue: Math.max(0, currentMonthPayable.outstandingAmount - (snapshotAdvanceDeduction > 0 ? 0 : liveAdvanceDeduction)),
            totalExpectedMonthlyCollection,
            totalCollectedThisMonth: currentMonthPayable.paidAmount,
            totalOutstandingBalance,
            totalLandlordPayable: Math.max(0, currentMonthPayable.outstandingAmount - (snapshotAdvanceDeduction > 0 ? 0 : liveAdvanceDeduction)),
            vacatedTenantDebts: landlordDebts,
            landlordDebtDeductions: landlordDeductions,
            totalVacatedTenantDebt,
            totalRecoveredFromLandlord,
            remainingRecoveryBalance,
            monthlyPayables,
            currentMonthPayable,
            unpaidMonthlyPayables,
            totalUnpaidMonthlyPayables: unpaidMonthlyPayables.reduce((total, payable) => total + Number(payable.unpaid_balance ?? 0), 0),
            oldestUnpaidMonth: unpaidMonthlyPayables.length
                ? unpaidMonthlyPayables.reduce((oldest, payable) => String(payable.settlement_month) < oldest ? String(payable.settlement_month) : oldest, String(unpaidMonthlyPayables[0].settlement_month))
                : null,
            settlementEstimate: liveSettlementEstimate,
            activePaymentDetail: defaultPaymentDetail(approvedPaymentDetailsByLandlord.get(landlord.id) ?? []),
            pendingPaymentDetail: (pendingPaymentDetailsByLandlord.get(landlord.id) ?? [])[0] ?? null,
            approvedPaymentDetails: approvedPaymentDetailsByLandlord.get(landlord.id) ?? [],
            pendingPaymentDetails: pendingPaymentDetailsByLandlord.get(landlord.id) ?? [],
        };
    });

    const kpis = {
        totalLandlords,
        activeLandlords: items.filter((landlord) => (landlord.status ?? "active") === "active").length,
        propertiesManaged: new Set(items.flatMap((landlord) => landlord.properties.map((property) => property.id))).size,
        outstandingSettlements: items.reduce((total, landlord) => total + landlord.outstandingSettlementValue, 0),
        settlementsDue: items.reduce(
            (total, landlord) => total + landlord.settlements.filter((settlement) => settlement.status !== "paid" && settlement.status !== "approved").length,
            0,
        ),
        collectionValue: items.reduce((total, landlord) => total + landlord.collectionValue, 0),
        netPayable: items.reduce((total, landlord) => total + landlord.netPayable, 0),
    };

    return {
        company: context.activeCompany,
        office: context.activeOffice,
        kpis,
        landlords: items,
        pagination: {
            page,
            pageSize: LANDLORD_PAGE_SIZE,
            totalLandlords,
            totalPages,
            search,
            hasPreviousPage: page > 1,
            hasNextPage: page < totalPages,
        },
        selectedLandlordId,
        unassignedProperties: [],
        companyDefaultCommissionRate,
        roomAssignmentOptions: buildRoomAssignmentOptions({
            rooms: selectedLandlordId ? rooms : [],
            properties,
            offices,
            landlords: landlordsResult.data ?? [],
        }),
    };
});

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

function escapeSupabaseLike(value: string) {
    return value.replaceAll(",", " ").replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function parseCommissionCalculationMode(value: unknown): LandlordCommissionCalculationMode {
    return value === "occupied_room_based" ? "occupied_room_based" : "portfolio_based";
}

function parseCommissionInputMode(value: unknown): "percentage" | "landlord_net_amount" {
    return value === "landlord_net_amount" ? "landlord_net_amount" : "percentage";
}

function buildCurrentMonthPayableFromRow(row: LandlordMonthlyPayableRow): LandlordCurrentMonthPayable {
    const paidAmount = Number(row.amount_paid ?? 0);
    const outstandingAmount = Number(row.unpaid_balance ?? 0);
    const notes = String(row.reasons_notes ?? "");
    const rowStatus = String(row.status ?? "").toLowerCase();
    const status = notes.includes("cleared_month=JUNE") || (outstandingAmount <= 0 && rowStatus === "paid")
        ? "paid"
        : paidAmount > 0 && outstandingAmount > 0
            ? "partial"
            : outstandingAmount > 0
                ? "unpaid"
                : "snapshot_needed";
    const monthName = monthBadgeName(String(row.settlement_month));
    const label = status === "paid"
        ? `${monthName} Paid`
        : status === "partial"
            ? "Partially Paid"
            : status === "unpaid"
                ? `${monthName} Unpaid`
                : "Snapshot Needed";
    const commissionMode = parseCommissionCalculationMode(row.commission_mode);
    const fullRentRoll = Number(row.full_rent_roll ?? 0);
    const commissionPercentage = Number(row.commission_percentage ?? 0);
    return {
        month: String(row.settlement_month),
        source: "snapshot",
        status,
        label,
        fullRentRoll,
        commissionMode,
        commissionPercentage,
        commissionAmount: Number(row.commission_amount ?? 0),
        commissionBaseAmount: commissionMode === "occupied_room_based"
            ? Math.max(0, Number(row.net_payable ?? 0) + Number(row.commission_amount ?? 0) + Number(row.vacated_tenant_debt_deductions ?? 0) + Number(row.advance_deductions ?? 0) + Number(row.other_deductions ?? 0))
            : fullRentRoll,
        paidAmount,
        outstandingAmount,
        recoveryDeduction: Number(row.vacated_tenant_debt_deductions ?? 0),
        netPayable: Number(row.net_payable ?? 0),
    };
}

function monthBadgeName(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Current Month";
    return new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(date);
}

function buildCurrentMonthPayableFallback({
    commissionBaseAmount,
    commissionMode,
    commissionRate,
    fullRentRoll,
    netPayable,
    recoveryDeduction,
}: {
    commissionBaseAmount: number;
    commissionMode: LandlordCommissionCalculationMode;
    commissionRate: number;
    fullRentRoll: number;
    netPayable: number;
    recoveryDeduction: number;
}): LandlordCurrentMonthPayable {
    return {
        month: currentSettlementMonth(),
        source: "live_fallback",
        status: "snapshot_needed",
        label: "Snapshot Needed",
        fullRentRoll,
        commissionMode,
        commissionPercentage: commissionRate,
        commissionAmount: Math.round(commissionBaseAmount * (commissionRate / 100)),
        commissionBaseAmount,
        paidAmount: 0,
        outstandingAmount: netPayable,
        recoveryDeduction,
        netPayable,
    };
}

function mergeCurrentMonthPayableWithLiveEstimate(
    payable: LandlordCurrentMonthPayable,
    live: {
        commissionAmount: number;
        commissionBaseAmount: number;
        commissionRate: number;
        fullRentRoll: number;
        netPayable: number;
        recoveryDeduction: number;
    },
): LandlordCurrentMonthPayable {
    const paidAmount = payable.status === "paid"
        ? live.netPayable
        : Math.min(payable.paidAmount, live.netPayable);
    const outstandingAmount = payable.status === "paid"
        ? 0
        : Math.max(0, live.netPayable - paidAmount);

    return {
        ...payable,
        fullRentRoll: live.fullRentRoll,
        commissionPercentage: live.commissionRate,
        commissionAmount: live.commissionAmount,
        commissionBaseAmount: live.commissionBaseAmount,
        paidAmount,
        outstandingAmount,
        recoveryDeduction: live.recoveryDeduction,
        netPayable: live.netPayable,
    };
}

function parseCommissionMetadata(value: unknown) {
    const fallback = {
        commissionCalculationMode: null as LandlordCommissionCalculationMode | null,
        commissionInputMode: null as "percentage" | "landlord_net_amount" | null,
        landlordNetPayableOverride: null as number | null,
    };
    if (typeof value !== "string" || !value.trim()) return fallback;
    try {
        const parsed = JSON.parse(value) as Record<string, unknown>;
        return {
            commissionCalculationMode: parsed.commission_calculation_mode === "occupied_room_based" ? "occupied_room_based" as const : parsed.commission_calculation_mode === "portfolio_based" ? "portfolio_based" as const : null,
            commissionInputMode: parsed.commission_input_mode === "landlord_net_amount" ? "landlord_net_amount" as const : parsed.commission_input_mode === "percentage" ? "percentage" as const : null,
            landlordNetPayableOverride: Number.isFinite(Number(parsed.landlord_net_payable_override)) ? Number(parsed.landlord_net_payable_override) : null,
        };
    } catch {
        return fallback;
    }
}

function buildRoomAssignmentOptions({
    landlords,
    offices,
    properties,
    rooms,
}: {
    landlords: LandlordRow[];
    offices: OfficeRow[];
    properties: PropertyRow[];
    rooms: RoomRow[];
}): LandlordRoomAssignmentOption[] {
    const propertyById = new Map(properties.map((property) => [property.id, property]));
    const officeById = new Map(offices.map((office) => [office.id, office]));
    const landlordById = new Map(landlords.map((landlord) => [landlord.id, landlord]));

    return rooms.filter(isActivePortfolioRoom).map((room) => {
        const property = room.property_id ? propertyById.get(room.property_id) ?? null : null;
        const office = room.office_id ? officeById.get(room.office_id) ?? null : null;
        const landlord = room.landlord_id ? landlordById.get(room.landlord_id) ?? null : null;
        return {
            roomId: room.id,
            roomNumber: room.room_number ?? "Unnumbered",
            officeId: room.office_id ?? null,
            officeName: office?.office_name ?? office?.name ?? "Office",
            propertyId: room.property_id ?? null,
            propertyName: propertyLabelNullable(property),
            currentLandlordId: room.landlord_id ?? null,
            currentLandlordName: landlord?.full_name ?? "Unassigned",
            monthlyRent: Number(room.monthly_rent ?? 0),
            status: room.status ?? "active",
        };
    });
}

function groupBy<T>(items: T[], getKey: (item: T) => string) {
    const map = new Map<string, T[]>();
    for (const item of items) {
        const key = getKey(item);
        const group = map.get(key);
        if (group) {
            group.push(item);
        } else {
            map.set(key, [item]);
        }
    }
    return map;
}

async function collectLandlordSearchIds({
    companyId,
    officeId,
    search,
    supabase,
}: {
    companyId: string;
    officeId: string | null | undefined;
    search: string;
    supabase: ReturnType<typeof createSupabaseAdminClient>;
}) {
    const ids = new Set<string>();
    const normalizedPrefix = normalizeLandlordSearch(search);
    if (!normalizedPrefix) return ids;
    const prefixPattern = `${escapeSupabaseLike(normalizedPrefix)}%`;
    const containsPattern = `%${escapeSupabaseLike(search.trim())}%`;
    const searchIndexQuery = (supabase as unknown as { from: (table: string) => ReturnType<typeof supabase.from> })
        .from("landlord_search_index")
        .select("landlord_id,office_id")
        .eq("company_id", companyId)
        .or(`normalized_name.ilike.${prefixPattern},phone.ilike.${containsPattern},office_name.ilike.${containsPattern},room_numbers_text.ilike.${containsPattern},tenant_names_text.ilike.${containsPattern},searchable_text.ilike.${containsPattern}`)
        .limit(50);
    if (officeId) searchIndexQuery.eq("office_id", officeId);
    const searchIndexResult = await searchIndexQuery;
    if (!searchIndexResult.error && searchIndexResult.data && searchIndexResult.data.length > 0) {
        for (const row of searchIndexResult.data as Array<{ landlord_id: string; office_id: string | null }>) {
            if (!officeId || row.office_id === officeId) ids.add(row.landlord_id);
        }
    }

    const landlordResult = await supabase
        .from("landlords")
        .select("id")
        .eq("company_id", companyId)
        .neq("status", "archived")
        .or(`full_name.ilike.${containsPattern},phone.ilike.${containsPattern},landlord_code.ilike.${containsPattern}`)
        .limit(100);
    if (!landlordResult.error) {
        for (const row of landlordResult.data ?? []) ids.add(row.id);
    }

    const roomResult = await supabase
        .from("rooms")
        .select("landlord_id,property_id,office_id")
        .eq("company_id", companyId)
        .ilike("room_number", containsPattern)
        .limit(150);
    if (!roomResult.error) {
        const propertyIds = new Set<string>();
        for (const row of roomResult.data ?? []) {
            if (officeId && row.office_id !== officeId) continue;
            if (row.landlord_id) ids.add(row.landlord_id);
            if (row.property_id) propertyIds.add(row.property_id);
        }
        if (propertyIds.size > 0) {
            let propertyQuery = supabase
                .from("properties")
                .select("landlord_id,office_id")
                .eq("company_id", companyId)
                .in("id", [...propertyIds])
                .not("landlord_id", "is", null);
            if (officeId) propertyQuery = propertyQuery.eq("office_id", officeId);
            const propertyResult = await propertyQuery;
            if (!propertyResult.error) {
                for (const row of propertyResult.data ?? []) {
                    if (row.landlord_id) ids.add(row.landlord_id);
                }
            }
        }
    }

    const officeResult = await supabase
        .from("offices")
        .select("id")
        .eq("company_id", companyId)
        .or(`office_name.ilike.${containsPattern},name.ilike.${containsPattern}`)
        .limit(50);
    if (!officeResult.error) {
        const matchedOfficeIds = (officeResult.data ?? [])
            .map((office) => office.id)
            .filter((id) => !officeId || id === officeId);
        for (const matchedOfficeId of matchedOfficeIds) {
            const officeLandlords = await collectOfficeLandlordIds({ supabase, companyId, officeId: matchedOfficeId });
            for (const id of officeLandlords) ids.add(id);
        }
    }

    return ids;
}

async function collectOfficeLandlordIds({
    companyId,
    officeId,
    supabase,
}: {
    companyId: string;
    officeId: string;
    supabase: ReturnType<typeof createSupabaseAdminClient>;
}) {
    const ids = new Set<string>();

    for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
            .from("rooms")
            .select("landlord_id")
            .eq("company_id", companyId)
            .eq("office_id", officeId)
            .not("landlord_id", "is", null)
            .range(from, from + 999);
        if (error) throw new Error(error.message);
        for (const row of data ?? []) {
            if (row.landlord_id) ids.add(row.landlord_id);
        }
        if (!data || data.length < 1000) break;
    }

    for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
            .from("properties")
            .select("landlord_id")
            .eq("company_id", companyId)
            .eq("office_id", officeId)
            .neq("status", "archived")
            .not("landlord_id", "is", null)
            .range(from, from + 999);
        if (error) throw new Error(error.message);
        for (const row of data ?? []) {
            if (row.landlord_id) ids.add(row.landlord_id);
        }
        if (!data || data.length < 1000) break;
    }

    return ids;
}

function normalizeLandlordSearch(value: string) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function isActivePortfolioRoom(room: RoomRow) {
    const extra = room as RoomRow & {
        deleted_at?: string | null;
        removed?: string | boolean | null;
        archived_at?: string | null;
    };
    const status = String(room.status ?? "active").toLowerCase();
    if (["archived", "inactive", "deleted", "removed"].includes(status)) return false;
    if (extra.deleted_at || extra.archived_at) return false;
    if (extra.removed === true || String(extra.removed ?? "").toLowerCase() === "true") return false;
    return true;
}

async function fetchAllRooms({
    supabase,
    companyId,
    officeId,
    landlordIds,
    propertyIds,
}: {
    supabase: Awaited<ReturnType<typeof getScopedSupabase>>["supabase"];
    companyId: string;
    officeId: string | null | undefined;
    landlordIds?: string[];
    propertyIds?: string[];
}) {
    const rows: RoomRow[] = [];
    const filters: string[] = [];
    if (landlordIds?.length) filters.push(`landlord_id.in.(${landlordIds.join(",")})`);
    if (propertyIds?.length) filters.push(`property_id.in.(${propertyIds.join(",")})`);
    if (!filters.length) return rows;

    for (let from = 0; ; from += 1000) {
        let query = supabase
            .from("rooms")
            .select("*")
            .eq("company_id", companyId)
            .or(filters.join(","))
            .order("room_number")
            .range(from, from + 999);
        if (officeId) query = query.eq("office_id", officeId);
        const { data, error } = await query;
        if (error) throw new Error(error.message);
        rows.push(...(data ?? []));
        if (!data || data.length < 1000) break;
    }
    return rows;
}

async function fetchPropertyLandlordLinksForLandlords({
    supabase,
    companyId,
    landlordIds,
}: {
    supabase: Awaited<ReturnType<typeof getScopedSupabase>>["supabase"];
    companyId: string;
    landlordIds: string[];
}) {
    const rows: PropertyLandlordRow[] = [];
    for (const landlordIdChunk of chunkValues(Array.from(new Set(landlordIds)).filter(Boolean), 75)) {
        if (landlordIdChunk.length === 0) continue;
        const { data, error } = await supabase
            .from("property_landlords")
            .select("*")
            .eq("company_id", companyId)
            .in("landlord_id", landlordIdChunk);
        if (error) throw new Error(error.message);
        rows.push(...(data ?? []));
    }
    return rows;
}

async function fetchPropertiesForLandlords({
    supabase,
    companyId,
    officeId,
    landlordIds,
    propertyIds,
}: {
    supabase: Awaited<ReturnType<typeof getScopedSupabase>>["supabase"];
    companyId: string;
    officeId: string | null | undefined;
    landlordIds: string[];
    propertyIds: string[];
}) {
    const rowsById = new Map<string, PropertyRow>();
    const run = async (column: "landlord_id" | "id", values: string[]) => {
        for (const valueChunk of chunkValues(Array.from(new Set(values)).filter(Boolean), 75)) {
            if (valueChunk.length === 0) continue;
            let query = supabase
                .from("properties")
                .select("*")
                .eq("company_id", companyId)
                .neq("status", "archived")
                .in(column, valueChunk);
            if (officeId) query = query.eq("office_id", officeId);
            const { data, error } = await query;
            if (error) throw new Error(error.message);
            for (const row of data ?? []) rowsById.set(row.id, row);
        }
    };

    await run("landlord_id", landlordIds);
    await run("id", propertyIds);
    return [...rowsById.values()];
}

async function fetchLandlordPaymentsForLandlords({
    supabase,
    companyId,
    officeId,
    landlordIds,
}: {
    supabase: Awaited<ReturnType<typeof getScopedSupabase>>["supabase"];
    companyId: string;
    officeId: string | null | undefined;
    landlordIds: string[];
}) {
    const rows: LandlordPaymentRow[] = [];
    for (const landlordIdChunk of chunkValues(Array.from(new Set(landlordIds)).filter(Boolean), 75)) {
        if (landlordIdChunk.length === 0) continue;
        let query = supabase
            .from("landlord_payments")
            .select("*")
            .eq("company_id", companyId)
            .in("landlord_id", landlordIdChunk);
        if (officeId) query = query.eq("office_id", officeId);
        const { data, error } = await query;
        if (error) throw new Error(error.message);
        rows.push(...(data ?? []));
    }
    return rows;
}

async function fetchLandlordPaymentDetailsForLandlords({
    supabase,
    companyId,
    officeId,
    landlordIds,
}: {
    supabase: Awaited<ReturnType<typeof getScopedSupabase>>["supabase"];
    companyId: string;
    officeId: string | null | undefined;
    landlordIds: string[];
}) {
    const rows: LandlordPaymentDetail[] = [];
    for (const landlordIdChunk of chunkValues(Array.from(new Set(landlordIds)).filter(Boolean), 75)) {
        if (landlordIdChunk.length === 0) continue;
        let query = (supabase as unknown as { from: (table: string) => any })
            .from("landlord_payment_details")
            .select("*")
            .eq("company_id", companyId)
            .in("landlord_id", landlordIdChunk)
            .in("status", ["pending", "approved"])
            .order("created_at", { ascending: false });
        if (officeId) query = query.eq("office_id", officeId);
        const { data, error } = await query;
        if (error) {
            if (/does not exist|schema cache|Could not find/i.test(error.message ?? "")) return rows;
            throw new Error(error.message);
        }
        rows.push(...(data ?? []).map(mapPaymentDetailRow));
    }
    return rows;
}

function mapPaymentDetailRow(row: Record<string, unknown>): LandlordPaymentDetail {
    const method = String(row.payment_method ?? "cash");
    const status = String(row.status ?? "pending");
    return {
        id: String(row.id),
        landlordId: String(row.landlord_id ?? ""),
        officeId: typeof row.office_id === "string" ? row.office_id : null,
        paymentMethod: method === "mobile_money" || method === "bank" ? method : "cash",
        label: typeof row.label === "string" ? row.label : null,
        provider: typeof row.provider === "string" ? row.provider : null,
        accountName: typeof row.account_name === "string" ? row.account_name : null,
        accountNumber: typeof row.account_number === "string" ? row.account_number : null,
        mobileMoneyProvider: typeof row.mobile_money_provider === "string" ? row.mobile_money_provider : null,
        mobileMoneyNumber: typeof row.mobile_money_number === "string" ? row.mobile_money_number : null,
        mobileMoneyAccountName: typeof row.mobile_money_account_name === "string" ? row.mobile_money_account_name : null,
        bankName: typeof row.bank_name === "string" ? row.bank_name : null,
        bankAccountNumber: typeof row.bank_account_number === "string" ? row.bank_account_number : null,
        bankAccountName: typeof row.bank_account_name === "string" ? row.bank_account_name : null,
        branch: typeof row.branch === "string" ? row.branch : null,
        notes: typeof row.notes === "string" ? row.notes : null,
        status: status === "approved" || status === "rejected" || status === "archived" ? status : "pending",
        isActive: Boolean(row.is_active),
        isDefault: Boolean(row.is_default),
        adminComment: typeof row.admin_comment === "string" ? row.admin_comment : null,
        createdAt: typeof row.created_at === "string" ? row.created_at : null,
        approvedAt: typeof row.approved_at === "string" ? row.approved_at : null,
    };
}

function groupPaymentDetails(details: LandlordPaymentDetail[]) {
    const grouped = new Map<string, LandlordPaymentDetail[]>();
    for (const detail of details) {
        grouped.set(detail.landlordId, [...(grouped.get(detail.landlordId) ?? []), detail]);
    }
    for (const [landlordId, rows] of grouped.entries()) {
        grouped.set(landlordId, rows.sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""))));
    }
    return grouped;
}

function defaultPaymentDetail(details: LandlordPaymentDetail[]) {
    return details.find((detail) => detail.isDefault) ?? details[0] ?? null;
}

function advanceRemainingBalance(row: Record<string, unknown>) {
    const remainingTotal = Number(row.remaining_total_balance ?? 0);
    if (remainingTotal > 0) return remainingTotal;
    const remainingBalance = Number(row.remaining_balance ?? 0);
    if (remainingBalance > 0) return remainingBalance;
    const total = Number(row.total_repayable ?? row.advance_amount ?? row.principal_amount ?? 0);
    return Math.max(0, total - Number(row.deducted_amount ?? 0));
}

function advanceOriginalAmount(row: Record<string, unknown>) {
    return Number(row.total_repayable ?? row.advance_amount ?? row.principal_amount ?? 0) || 0;
}

function advanceDeductionTerm(row: Record<string, unknown>) {
    const plan = String(row.payment_plan ?? "one_time").replaceAll("_", " ");
    const monthly = Number(row.monthly_deduction_amount ?? 0);
    if (String(row.payment_plan ?? "") === "one_time") return "One-time deduction";
    if (monthly > 0) return `${plan} · ${new Intl.NumberFormat("en-UG").format(Math.round(monthly))} per month`;
    return plan || "Scheduled deduction";
}

function isDeductibleLandlordAdvance(row: Record<string, unknown>) {
    const status = String(row.status ?? "").toLowerCase();
    const lifecycleStatus = String(row.lifecycle_status ?? "").toLowerCase();
    if (["pending", "rejected", "archived", "cancelled", "canceled"].includes(status)) return false;
    if (["cleared", "closed", "archived", "cancelled", "canceled"].includes(lifecycleStatus)) return false;
    return advanceRemainingBalance(row) > 0;
}

function buildAdvanceDeductionLines(advances: Array<Record<string, unknown>>, settlementMonth: string): LandlordAdvanceDeductionLine[] {
    return advances
        .filter(isDeductibleLandlordAdvance)
        .map((advance) => {
            const deduction = scheduledAdvanceDeductionForMonth(advance, settlementMonth);
            return {
                advanceDate: typeof advance.date_given === "string" ? advance.date_given : null,
                advanceId: String(advance.id ?? ""),
                deductionTerm: advanceDeductionTerm(advance),
                originalAdvanceAmount: advanceOriginalAmount(advance),
                remainingAdvanceBalance: Math.max(0, advanceRemainingBalance(advance) - deduction),
                thisMonthDeduction: deduction,
            };
        })
        .filter((line) => line.thisMonthDeduction > 0 || line.remainingAdvanceBalance > 0)
        .sort((a, b) => String(a.advanceDate ?? "").localeCompare(String(b.advanceDate ?? "")));
}

async function fetchLandlordAdvancesForLandlords({
    supabase,
    companyId,
    officeId,
    landlordIds,
}: {
    supabase: Awaited<ReturnType<typeof getScopedSupabase>>["supabase"];
    companyId: string;
    officeId: string | null | undefined;
    landlordIds: string[];
}) {
    const rows: Array<Record<string, unknown>> = [];
    for (const landlordIdChunk of chunkValues(Array.from(new Set(landlordIds)).filter(Boolean), 75)) {
        if (landlordIdChunk.length === 0) continue;
        let query = (supabase as unknown as { from: (table: string) => any })
            .from("landlord_advances")
            .select("*")
            .eq("company_id", companyId)
            .in("landlord_id", landlordIdChunk);
        if (officeId) query = query.eq("office_id", officeId);
        const { data, error } = await query;
        if (error) {
            if (/does not exist|schema cache|Could not find/i.test(error.message ?? "")) return rows;
            throw new Error(error.message);
        }
        rows.push(...((data ?? []) as Array<Record<string, unknown>>));
    }
    return rows;
}

async function fetchVacatedDebtsForLandlords({
    supabase,
    companyId,
    officeId,
    landlordIds,
}: {
    supabase: Awaited<ReturnType<typeof getScopedSupabase>>["supabase"];
    companyId: string;
    officeId: string | null | undefined;
    landlordIds: string[];
}) {
    const rows: VacatedTenantDebtRow[] = [];
    const table = (supabase as unknown as { from: (table: string) => ReturnType<typeof supabase.from> }).from("vacated_tenant_debts");
    for (const landlordIdChunk of chunkValues(Array.from(new Set(landlordIds)).filter(Boolean), 75)) {
        if (landlordIdChunk.length === 0) continue;
        let query = table
            .select("*")
            .eq("company_id", companyId)
            .in("landlord_id", landlordIdChunk);
        if (officeId) query = query.eq("office_id", officeId);
        const { data, error } = await query;
        if (error) throw new Error(error.message);
        rows.push(...((data ?? []) as VacatedTenantDebtRow[]));
    }
    return rows;
}

async function fetchLandlordDeductionsForLandlords({
    supabase,
    companyId,
    officeId,
    landlordIds,
}: {
    supabase: Awaited<ReturnType<typeof getScopedSupabase>>["supabase"];
    companyId: string;
    officeId: string | null | undefined;
    landlordIds: string[];
}) {
    const rows: LandlordDebtDeductionRow[] = [];
    const table = (supabase as unknown as { from: (table: string) => ReturnType<typeof supabase.from> }).from("landlord_debt_deductions");
    for (const landlordIdChunk of chunkValues(Array.from(new Set(landlordIds)).filter(Boolean), 75)) {
        if (landlordIdChunk.length === 0) continue;
        let query = table
            .select("*")
            .eq("company_id", companyId)
            .in("landlord_id", landlordIdChunk);
        if (officeId) query = query.eq("office_id", officeId);
        const { data, error } = await query;
        if (error) throw new Error(error.message);
        rows.push(...((data ?? []) as LandlordDebtDeductionRow[]));
    }
    return rows;
}

async function fetchLandlordMonthlyPayablesForLandlords({
    supabase,
    companyId,
    officeId,
    landlordIds,
}: {
    supabase: Awaited<ReturnType<typeof getScopedSupabase>>["supabase"];
    companyId: string;
    officeId: string | null | undefined;
    landlordIds: string[];
}) {
    const rows: LandlordMonthlyPayableRow[] = [];
    const table = (supabase as unknown as { from: (table: string) => ReturnType<typeof supabase.from> }).from("landlord_monthly_payables");
    for (const landlordIdChunk of chunkValues(Array.from(new Set(landlordIds)).filter(Boolean), 75)) {
        if (landlordIdChunk.length === 0) continue;
        let query = table
            .select("*")
            .eq("company_id", companyId)
            .in("landlord_id", landlordIdChunk)
            .neq("status", "archived")
            .order("settlement_month", { ascending: false });
        if (officeId) query = query.eq("office_id", officeId);
        const { data, error } = await query;
        if (error) throw new Error(error.message);
        rows.push(...((data ?? []) as LandlordMonthlyPayableRow[]));
    }
    return rows;
}

async function fetchCurrentMonthCollections({
    supabase,
    companyId,
    officeId,
    landlordIds,
    propertyIds,
    roomIds,
}: {
    supabase: Awaited<ReturnType<typeof getScopedSupabase>>["supabase"];
    companyId: string;
    officeId: string | null | undefined;
    landlordIds: string[];
    propertyIds: string[];
    roomIds: string[];
}) {
    const rowsById = new Map<string, CollectionRow>();
    const run = async (column: "landlord_id" | "property_id" | "room_id", values: string[]) => {
        for (const valueChunk of chunkValues(Array.from(new Set(values)).filter(Boolean), 75)) {
            if (valueChunk.length === 0) continue;
            let query = supabase
                .from("collections")
                .select("*")
                .eq("company_id", companyId)
                .gte("paid_at", monthStartIso())
                .in(column, valueChunk)
                .limit(1000);
            if (officeId) query = query.eq("office_id", officeId);
            const { data, error } = await query;
            if (error) throw new Error(error.message);
            for (const row of data ?? []) rowsById.set(row.id, row);
        }
    };

    await run("landlord_id", landlordIds);
    await run("property_id", propertyIds);
    await run("room_id", roomIds);
    return [...rowsById.values()];
}

async function fetchRoomTenancyContext({
    supabase,
    companyId,
    officeId,
    roomIds,
}: {
    supabase: Awaited<ReturnType<typeof getScopedSupabase>>["supabase"];
    companyId: string;
    officeId: string | null | undefined;
    roomIds: string[];
}) {
    if (roomIds.length === 0) {
        return { leases: [] as LeaseRow[], tenants: [] as TenantRow[] };
    }

    const leases: LeaseRow[] = [];
    for (const roomIdChunk of chunkValues(roomIds, 75)) {
        let leasesQuery = supabase
            .from("leases")
            .select("*")
            .eq("company_id", companyId)
            .eq("status", "active")
            .in("room_id", roomIdChunk);
        if (officeId) leasesQuery = leasesQuery.eq("office_id", officeId);
        const leasesResult = await leasesQuery;
        if (leasesResult.error) throw new Error(leasesResult.error.message);
        leases.push(...(leasesResult.data ?? []));
    }

    const tenantById = new Map<string, TenantRow>();
    for (const roomIdChunk of chunkValues(roomIds, 75)) {
        let tenantsByRoomQuery = supabase
            .from("tenants")
            .select("*")
            .eq("company_id", companyId)
            .neq("status", "archived")
            .in("room_id", roomIdChunk);
        if (officeId) tenantsByRoomQuery = tenantsByRoomQuery.eq("office_id", officeId);
        const tenantsByRoomResult = await tenantsByRoomQuery;
        if (tenantsByRoomResult.error) throw new Error(tenantsByRoomResult.error.message);
        for (const tenant of tenantsByRoomResult.data ?? []) tenantById.set(tenant.id, tenant);
    }

    const missingLeaseTenantIds = Array.from(new Set(leases.map((lease) => lease.tenant_id)))
        .filter((tenantId) => tenantId && !tenantById.has(tenantId));
    for (const tenantIdChunk of chunkValues(missingLeaseTenantIds, 75)) {
        let tenantsByLeaseQuery = supabase
            .from("tenants")
            .select("*")
            .eq("company_id", companyId)
            .neq("status", "archived")
            .in("id", tenantIdChunk);
        if (officeId) tenantsByLeaseQuery = tenantsByLeaseQuery.eq("office_id", officeId);
        const tenantsByLeaseResult = await tenantsByLeaseQuery;
        if (tenantsByLeaseResult.error) throw new Error(tenantsByLeaseResult.error.message);
        for (const tenant of tenantsByLeaseResult.data ?? []) tenantById.set(tenant.id, tenant);
    }

    return { leases, tenants: [...tenantById.values()] };
}

function chunkValues<T>(values: T[], size: number) {
    const chunks: T[][] = [];
    for (let index = 0; index < values.length; index += size) {
        chunks.push(values.slice(index, index + size));
    }
    return chunks;
}

function getPaymentStatus({
    tenant,
    monthlyRent,
    outstandingBalance,
    collectedThisMonth,
}: {
    tenant: TenantRow | null;
    monthlyRent: number;
    outstandingBalance: number;
    collectedThisMonth: number;
}) {
    if (!tenant) return "vacant" as const;
    if (monthlyRent > 0 && collectedThisMonth >= monthlyRent && outstandingBalance <= 0) return "paid" as const;
    if (collectedThisMonth > 0) return "partial" as const;
    return "unpaid" as const;
}

function getRoomPayableState({
    currentMonthPayable,
    leaseStartDate,
    room,
    settlementMonth,
    tenant,
}: {
    currentMonthPayable: LandlordMonthlyPayableRow | null;
    leaseStartDate?: string | null;
    room: RoomRow;
    settlementMonth: string;
    tenant: TenantRow | null;
}) {
    const extra = room as RoomRow & {
        effective_start_date?: string | null;
        explicitly_payable?: boolean | null;
    };
    return getMoveInPayableDecision({
        landlordPayment: currentMonthPayable ? {
            amountPaid: currentMonthPayable.amount_paid,
            lastPaidAt: currentMonthPayable.last_paid_at,
            status: currentMonthPayable.status,
        } : null,
        leaseStartDate,
        room: extra,
        settlementMonth,
        tenantActive: Boolean(tenant),
    });
}

function isCurrentMonthDate(date: Date) {
    const now = new Date();
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function endOfCurrentMonth() {
    const date = new Date();
    date.setMonth(date.getMonth() + 1, 0);
    date.setHours(23, 59, 59, 999);
    return date;
}

function buildSettlementEstimate({
    commissionRate,
    commissionCalculationMode,
    landlordDeductions,
    roomPortfolio,
}: {
    commissionRate: number;
    commissionCalculationMode: LandlordCommissionCalculationMode;
    landlordDeductions: LandlordDebtDeductionRow[];
    roomPortfolio: LandlordItem["rooms"];
}): LandlordSettlementEstimate {
    const settlementMonth = new Date().toISOString().slice(0, 7);
    const occupiedRoomLines = roomPortfolio
        .filter((item) => item.payableThisMonth)
        .map((item) => ({
            roomId: item.room.id,
            roomNumber: item.room.room_number ?? "Unnumbered",
            propertyName: propertyLabelNullable(item.property),
            tenantName: item.tenant?.full_name ?? "Active tenant",
            tenantPhone: item.tenant?.phone ?? null,
            monthlyRent: item.monthlyRent,
            payableAmount: item.includedPayableAmount,
            status: "occupied" as const,
            companyExtraProfitAmount: item.companyExtraProfitAmount,
            includedPayableAmount: item.includedPayableAmount,
            landlordAlreadyPaid: item.landlordAlreadyPaid,
            reason: item.payableReason,
        }));
    const vacantRoomLines = roomPortfolio
        .filter((item) => !item.payableThisMonth)
        .map((item) => ({
            roomId: item.room.id,
            roomNumber: item.room.room_number ?? "Unnumbered",
            propertyName: propertyLabelNullable(item.property),
            tenantName: item.tenant?.full_name ?? "Vacant",
            tenantPhone: null,
            monthlyRent: item.monthlyRent,
            payableAmount: 0,
            status: "vacant" as const,
            companyExtraProfitAmount: item.companyExtraProfitAmount,
            includedPayableAmount: item.includedPayableAmount,
            landlordAlreadyPaid: item.landlordAlreadyPaid,
            reason: item.payableReason,
        }));
    const expectedGrossRent = roomPortfolio.reduce((total, item) => total + item.monthlyRent, 0);
    const roomRentById = new Map(roomPortfolio.map((item) => [item.room.id, item.monthlyRent]));
    const occupiedPayableRent = occupiedRoomLines.reduce((total, line) => total + line.payableAmount, 0);
    const emptyRoomDeductions = vacantRoomLines.reduce((total, line) => total + line.monthlyRent, 0);
    const commissionBaseAmount = commissionCalculationMode === "occupied_room_based" ? occupiedPayableRent : expectedGrossRent;
    const companyCommissionAmount = Math.round(commissionBaseAmount * (commissionRate / 100));
    const landlordGrossPayable = commissionCalculationMode === "occupied_room_based"
        ? Math.max(0, occupiedPayableRent - companyCommissionAmount)
        : Math.max(0, expectedGrossRent - companyCommissionAmount - emptyRoomDeductions);
    const pendingDeductions = landlordDeductions.filter((deduction) => ["pending", "partially_applied"].includes(String(deduction.status ?? "pending")));
    const previousUnrecoveredTenantDebts = pendingDeductions.reduce((total, deduction) => {
        const remaining = Number(deduction.amount ?? 0) - Number(deduction.applied_amount ?? 0);
        return total + Math.max(0, remaining);
    }, 0);

    let payableAvailableForRecovery = landlordGrossPayable;
    const recoveryLines = pendingDeductions.map((deduction) => {
        const amount = Number(deduction.amount ?? 0);
        const alreadyRecovered = Number(deduction.applied_amount ?? 0);
        const available = Math.max(0, amount - alreadyRecovered);
        const appliedInEstimate = Math.min(available, payableAvailableForRecovery);
        payableAvailableForRecovery -= appliedInEstimate;
        return {
            deductionId: deduction.id,
            tenantName: deduction.tenant_name ?? "Vacated tenant",
            roomNumber: deduction.room_number ?? "Room",
            propertyName: deduction.property_name ?? "Property",
            roomRent: deduction.room_id ? roomRentById.get(deduction.room_id) ?? 0 : 0,
            amount,
            alreadyRecovered,
            appliedInEstimate,
            remainingAfterEstimate: Math.max(0, available - appliedInEstimate),
            reason: deduction.reason ?? "Tenant vacated with unpaid balance after landlord advance payment",
            status: deduction.status ?? "pending",
        };
    });
    const vacatedTenantDebtDeductions = recoveryLines.reduce((total, line) => total + line.appliedInEstimate, 0);
    const carriedForwardRecoveryBalance = Math.max(0, previousUnrecoveredTenantDebts - vacatedTenantDebtDeductions);
    const netLandlordPayable = Math.max(0, landlordGrossPayable - vacatedTenantDebtDeductions);
    const paymentStatus = netLandlordPayable <= 0 && previousUnrecoveredTenantDebts > 0 ? "held" : "pending";

    return {
        settlementMonth,
        roomsOwned: roomPortfolio.length,
        occupiedRooms: occupiedRoomLines.length,
        vacantRooms: vacantRoomLines.length,
        expectedGrossRent,
        occupiedPayableRent,
        commissionBaseAmount,
        commissionCalculationMode,
        companyCommissionRate: commissionRate,
        companyCommissionAmount,
        landlordGrossPayable,
        previousUnrecoveredTenantDebts,
        emptyRoomDeductions,
        vacatedTenantDebtDeductions,
        netLandlordPayable,
        carriedForwardRecoveryBalance,
        paymentStatus,
        occupiedRoomLines,
        vacantRoomLines,
        recoveryLines,
        advanceDeductionLines: [],
        landlordAdvanceDeductions: 0,
    };
}

function isThisMonth(value: string | null | undefined) {
    if (!value) return false;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return false;
    const now = new Date();
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function monthStartIso() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

function propertyLabel(property: PropertyRow) {
    return property.property_name ?? property.name ?? property.village ?? property.city ?? property.address ?? "";
}

function propertyLabelNullable(property: PropertyRow | null) {
    if (!property) return "Unassigned property";
    return property.property_name ?? property.name ?? property.village ?? property.city ?? property.address ?? "Unassigned property";
}

export async function getLandlordInCompany(landlordId: string) {
    const context = await requirePermission("landlords.read");
    const { supabase } = await getScopedSupabase();
    const companyId = context.activeCompany?.id;
    if (!companyId) throw new Error("Active company is required.");

    const { data, error } = await supabase
        .from("landlords")
        .select("*")
        .eq("id", landlordId)
        .eq("company_id", companyId)
        .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw new Error("Landlord not found.");
    return data;
}

export async function getPropertyForLandlordAssignment(propertyId: string) {
    const context = await requirePermission("landlords.read");
    const { supabase } = await getScopedSupabase();
    if (!context.activeCompany?.id || !context.activeOffice?.id) throw new Error("Active company and office are required.");

    const { data, error } = await supabase
        .from("properties")
        .select("*")
        .eq("id", propertyId)
        .eq("company_id", context.activeCompany.id)
        .eq("office_id", context.activeOffice.id)
        .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw new Error("Property not found in active office.");
    return data;
}

function sumCollections(collections: CollectionRow[]) {
    return collections.reduce((total, collection) => total + Number(collection.amount_paid ?? collection.amount ?? 0), 0);
}

function sumExpenses(expenses: ExpenseRow[]) {
    return expenses.reduce((total, expense) => total + Number(expense.amount ?? 0), 0);
}

function emptyData(): LandlordsPageData {
    return {
        company: null,
        office: null,
        kpis: {
            totalLandlords: 0,
            activeLandlords: 0,
            propertiesManaged: 0,
            outstandingSettlements: 0,
            settlementsDue: 0,
            collectionValue: 0,
            netPayable: 0,
        },
        landlords: [],
        pagination: {
            page: 1,
            pageSize: LANDLORD_PAGE_SIZE,
            totalLandlords: 0,
            totalPages: 1,
            search: "",
            hasPreviousPage: false,
            hasNextPage: false,
        },
        selectedLandlordId: null,
        unassignedProperties: [],
        companyDefaultCommissionRate: 10,
        roomAssignmentOptions: [],
    };
}
