import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isFinanciallyEffectiveCollection } from "@/lib/collections/validity";
import { clampBillingDay, dateForBillingDay, previousDay, addMonthsToBillingDate } from "@/lib/tenants/billing-cycle";
import { calculateTenantMonthlyLedgerPosition } from "@/lib/financial/monthly-ledger";
import type { AuthContext } from "@/lib/auth/types";
import type { ArchivedIntegrityRecord, DataIntegrityCentreData, IntegrityDuplicateRecord, IntegrityEntityRecord, MonthlyLedgerIssue } from "./types";

type LooseRow = Record<string, unknown>;

const INACTIVE_STATUSES = new Set(["archived", "deleted", "inactive", "voided", "removed", "rejected", "cancelled", "canceled", "terminated"]);

export async function getDataIntegrityCentreData(context: AuthContext): Promise<DataIntegrityCentreData> {
    const companyId = context.activeCompany?.id;
    if (!companyId) return emptyData();

    const supabase = createSupabaseAdminClient() as unknown as SupabaseClient;
    const [officesResult, roomsResult, landlordsResult, tenantsResult, collections, rentMonths, allocations, leases, manualAdjustments] = await Promise.all([
        supabase.from("offices").select("id, office_name, name").eq("company_id", companyId).limit(1000),
        supabase.from("rooms").select("id, company_id, office_id, property_id, landlord_id, room_number, status, monthly_rent, outstanding_balance, workbook_comment, workbook_raw_data, created_at, updated_at").eq("company_id", companyId).limit(5000),
        supabase.from("landlords").select("id, company_id, full_name, phone, status, created_at").eq("company_id", companyId).limit(5000),
        supabase.from("tenants").select("id, company_id, office_id, room_id, full_name, phone, status, outstanding_balance:balance, monthly_rent, created_at, billing_day").eq("company_id", companyId).limit(5000),
        fetchAllRows((from, to) => supabase.from("collections").select("id, company_id, office_id, room_id, tenant_id, payment_date, paid_at, amount, amount_paid, status, created_at, financial_effective, reversed_at, voided_at, deleted_at, superseded_at, superseded_by_payment_id, corrected_by_payment_id, correction_of_payment_id").eq("company_id", companyId).range(from, to)),
        fetchAllRows((from, to) => supabase.from("tenant_rent_months").select("id, company_id, room_id, tenant_id, rent_month, due_date, coverage_start, coverage_end, rent_amount, amount_paid, outstanding_amount, status").eq("company_id", companyId).range(from, to)),
        fetchAllRows((from, to) => supabase.from("tenant_rent_allocations").select("id, company_id, room_id, tenant_id, payment_id, allocation_month, allocation_type, amount_allocated, consumed_by_balance_reconciliation, allocation_source, is_historical_credit, coverage_start, coverage_end").eq("company_id", companyId).range(from, to)),
        fetchAllRows((from, to) => supabase.from("leases").select("id, company_id, room_id, tenant_id, billing_day, start_date, monthly_rent, status").eq("company_id", companyId).eq("status", "active").range(from, to)),
        fetchAllRows((from, to) => supabase.from("tenant_balance_adjustments").select("id, company_id, room_id, tenant_id, effective_date, adjustment_amount, status, financial_effective, reversed_at, reason").eq("company_id", companyId).range(from, to)),
    ]);

    for (const result of [officesResult, roomsResult, landlordsResult, tenantsResult]) {
        if (result.error) throw new Error(result.error.message);
    }

    const offices = (officesResult.data ?? []) as LooseRow[];
    const officeById = new Map(offices.map((office) => [stringValue(office.id), stringValue(office.office_name) || stringValue(office.name) || "Office"]));
    const rooms = (roomsResult.data ?? []) as unknown as LooseRow[];
    const landlords = (landlordsResult.data ?? []) as unknown as LooseRow[];
    const tenants = (tenantsResult.data ?? []) as unknown as LooseRow[];

    const duplicates: IntegrityDuplicateRecord[] = [
        ...duplicateRooms(rooms, officeById),
        ...duplicateLandlords(landlords, officeById),
        ...duplicateTenants(tenants, officeById),
        ...duplicateTenantPhones(tenants, officeById),
        ...duplicatePayments(collections, officeById),
    ];
    const archivedRecords = archivedDuplicateRooms(rooms, officeById);
    const formulaIssues = monthlyLedgerFormulaIssues({
        allocations,
        collections,
        leases,
        manualAdjustments,
        officeById,
        rentMonths,
        rooms,
        tenants,
    });
    const criticalGroups = duplicates.filter((duplicate) => duplicate.severity === "critical" || duplicate.severity === "high").length;

    return {
        generatedAt: new Date().toISOString(),
        summary: {
            duplicateGroups: duplicates.length,
            criticalGroups,
            archivedDuplicates: archivedRecords.length,
            formulaIssues: formulaIssues.length,
            orphanWarnings: 0,
        },
        duplicates,
        formulaIssues,
        archivedRecords,
    };
}

function monthlyLedgerFormulaIssues({
    allocations,
    collections,
    leases,
    manualAdjustments,
    officeById,
    rentMonths,
    rooms,
    tenants,
}: {
    allocations: LooseRow[];
    collections: LooseRow[];
    leases: LooseRow[];
    manualAdjustments: LooseRow[];
    officeById: Map<string, string>;
    rentMonths: LooseRow[];
    rooms: LooseRow[];
    tenants: LooseRow[];
}): MonthlyLedgerIssue[] {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const selectedMonth = `${currentMonth}-01`;
    const roomById = new Map(rooms.map((room) => [stringValue(room.id), room]));
    const activeTenants = tenants.filter((tenant) => !inactive(tenant.status) && stringValue(tenant.room_id));
    const collectionsByTenant = groupBy(collections.filter(isFinanciallyEffectiveCollection), (row) => stringValue(row.tenant_id));
    const rentMonthsByTenant = groupBy(rentMonths, (row) => stringValue(row.tenant_id));
    const allocationsByTenant = groupBy(allocations, (row) => stringValue(row.tenant_id));
    const manualAdjustmentsByTenant = groupBy(manualAdjustments, (row) => stringValue(row.tenant_id));
    const leaseByTenant = new Map(leases.map((lease) => [stringValue(lease.tenant_id), lease]));
    const issues: MonthlyLedgerIssue[] = [];

    for (const tenant of activeTenants) {
        const tenantId = stringValue(tenant.id);
        const room = roomById.get(stringValue(tenant.room_id));
        const lease = leaseByTenant.get(tenantId);
        const monthlyRent = numberValue(lease?.monthly_rent) || numberValue(tenant.monthly_rent) || numberValue(room?.monthly_rent);
        const position = calculateTenantMonthlyLedgerPosition({
            advanceAllocations: allocationsByTenant.get(tenantId) ?? [],
            collections: collectionsByTenant.get(tenantId) ?? [],
            manualAdjustments: manualAdjustmentsByTenant.get(tenantId) ?? [],
            monthlyRent,
            rentMonths: rentMonthsByTenant.get(tenantId) ?? [],
            selectedMonth,
        });
        const storedOutstanding = Math.max(numberValue(tenant.outstanding_balance), numberValue(room?.outstanding_balance));
        const label = `Room ${stringValue(room?.room_number) || "Unknown"} · ${displayName(tenant)}`;
        const officeName = officeById.get(stringValue(room?.office_id) || stringValue(tenant.office_id)) ?? null;

        if (Math.abs(storedOutstanding - position.outstanding) > 1) {
            issues.push({
                id: `tenant-formula-${tenantId}`,
                type: "TENANT_FORMULA_MISMATCH",
                title: label,
                severity: "high",
                officeName,
                details: [
                    `Opening arrears: UGX ${position.arrears.toLocaleString("en-UG")}`,
                    `Current month rent: UGX ${position.currentMonthRent.toLocaleString("en-UG")}`,
                    `Manual adjustment: UGX ${position.manualBalanceAdjustment.toLocaleString("en-UG")}`,
                    `Payments this month: UGX ${position.paymentsThisMonth.toLocaleString("en-UG")}`,
                    `Formula outstanding: UGX ${position.outstanding.toLocaleString("en-UG")}`,
                    `Stored/display snapshot: UGX ${storedOutstanding.toLocaleString("en-UG")}`,
                ],
            });
        }
        if (position.outstanding > 1 && position.advance > 1) {
            issues.push({
                id: `tenant-conflict-${tenantId}`,
                type: "OUTSTANDING_AND_ADVANCE_CONFLICT",
                title: label,
                severity: "critical",
                officeName,
                details: [
                    `Formula outstanding: UGX ${position.outstanding.toLocaleString("en-UG")}`,
                    `Formula advance: UGX ${position.advance.toLocaleString("en-UG")}`,
                    "Normal rent advance must not coexist with collectible rent debt.",
                ],
            });
        }
        const currentRows = (rentMonthsByTenant.get(tenantId) ?? []).filter((row) => stringValue(row.rent_month).slice(0, 7) === currentMonth);
        for (const row of currentRows) {
            const billingDay = clampBillingDay(numberValue(lease?.billing_day ?? tenant.billing_day) || 1);
            const expectedStart = dateForBillingDay(Number(currentMonth.slice(0, 4)), Number(currentMonth.slice(5, 7)) - 1, billingDay);
            const expectedEnd = previousDay(addMonthsToBillingDate(expectedStart, 1, billingDay));
            const actualStart = stringValue(row.coverage_start).slice(0, 10);
            const actualEnd = stringValue(row.coverage_end).slice(0, 10);
            if ((actualStart && actualStart !== expectedStart) || (actualEnd && actualEnd !== expectedEnd)) {
                issues.push({
                    id: `tenant-billing-period-${tenantId}-${stringValue(row.rent_month)}`,
                    type: "BILLING_PERIOD_MISMATCH",
                    title: label,
                    severity: "medium",
                    officeName,
                    details: [
                        `Billing day: ${billingDay}`,
                        `Expected coverage: ${expectedStart} to ${expectedEnd}`,
                        `Displayed coverage: ${actualStart || "missing"} to ${actualEnd || "missing"}`,
                    ],
                });
            }
        }
        const paymentSum = (collectionsByTenant.get(tenantId) ?? [])
            .filter((collection) => collectionDateKey(collection) === currentMonth)
            .reduce((total, collection) => total + numberValue(collection.amount_paid ?? collection.amount), 0);
        if (Math.abs(paymentSum - position.paymentsThisMonth) > 1) {
            issues.push({
                id: `tenant-payments-total-${tenantId}`,
                type: "PAYMENTS_TOTAL_MISMATCH",
                title: label,
                severity: "high",
                officeName,
                details: [
                    `Formula payments this month: UGX ${position.paymentsThisMonth.toLocaleString("en-UG")}`,
                    `Independent payment sum: UGX ${paymentSum.toLocaleString("en-UG")}`,
                ],
            });
        }
        const priorRemaining = (rentMonthsByTenant.get(tenantId) ?? [])
            .filter((row) => stringValue(row.rent_month).slice(0, 7) < currentMonth)
            .reduce((total, row) => total + numberValue(row.outstanding_amount), 0);
        if (priorRemaining > 0 && position.arrears < priorRemaining - 1) {
            issues.push({
                id: `tenant-arrears-rollover-${tenantId}`,
                type: "ARREARS_ROLLOVER_MISMATCH",
                title: label,
                severity: "high",
                officeName,
                details: [
                    `Prior rent-period remaining: UGX ${priorRemaining.toLocaleString("en-UG")}`,
                    `Formula opening arrears: UGX ${position.arrears.toLocaleString("en-UG")}`,
                ],
            });
        }
    }

    return issues;
}

function duplicateRooms(rooms: LooseRow[], officeById: Map<string, string>): IntegrityDuplicateRecord[] {
    return duplicateBy(
        rooms.filter((room) => !inactive(room.status)),
        (room) => [room.company_id, room.office_id, room.property_id || "none", normalize(room.room_number)].join("|"),
        (key, records) => ({
            id: `room-${key}`,
            type: "room_number",
            title: `Duplicate room ${stringValue(records[0]?.room_number)}`,
            description: "More than one active room has the same room number in the same office/property.",
            key,
            severity: "critical",
            records: records.map((room) => roomEntity(room, officeById)),
        }),
    );
}

function duplicateLandlords(landlords: LooseRow[], officeById: Map<string, string>): IntegrityDuplicateRecord[] {
    return duplicateBy(
        landlords.filter((landlord) => !inactive(landlord.status)),
        (landlord) => [landlord.company_id, landlord.office_id || "company", normalize(displayName(landlord)), normalize(phone(landlord))].join("|"),
        (key, records) => ({
            id: `landlord-${key}`,
            type: "landlord_identity",
            title: `Duplicate landlord ${displayName(records[0])}`,
            description: "Landlord name and phone match another active landlord record.",
            key,
            severity: "medium",
            records: records.map((landlord) => entity(landlord, officeById, displayName(landlord), [
                `Phone: ${phone(landlord) || "Not recorded"}`,
                `Created: ${dateOnly(landlord.created_at) || "Unknown"}`,
            ])),
        }),
    ).filter((duplicate) => !duplicate.key.endsWith("||"));
}

function duplicateTenants(tenants: LooseRow[], officeById: Map<string, string>): IntegrityDuplicateRecord[] {
    return duplicateBy(
        tenants.filter((tenant) => !inactive(tenant.status)),
        (tenant) => [tenant.company_id, tenant.office_id || "company", normalize(displayName(tenant)), normalize(phone(tenant))].join("|"),
        (key, records) => ({
            id: `tenant-${key}`,
            type: "tenant_identity",
            title: `Duplicate tenant ${displayName(records[0])}`,
            description: "Tenant name and phone match another active tenant record.",
            key,
            severity: "medium",
            records: records.map((tenant) => entity(tenant, officeById, displayName(tenant), [
                `Phone: ${phone(tenant) || "Not recorded"}`,
                `Outstanding: UGX ${numberValue(tenant.outstanding_balance).toLocaleString("en-UG")}`,
            ])),
        }),
    ).filter((duplicate) => !duplicate.key.endsWith("||"));
}

function duplicateTenantPhones(tenants: LooseRow[], officeById: Map<string, string>): IntegrityDuplicateRecord[] {
    return duplicateBy(
        tenants.filter((tenant) => !inactive(tenant.status) && normalize(phone(tenant))),
        (tenant) => [tenant.company_id, normalize(phone(tenant))].join("|"),
        (key, records) => ({
            id: `tenant-phone-${key}`,
            type: "tenant_phone",
            title: `Duplicate phone ${phone(records[0])}`,
            description: "The same phone number is attached to multiple active tenants.",
            key,
            severity: "low",
            records: records.map((tenant) => entity(tenant, officeById, displayName(tenant), [
                `Phone: ${phone(tenant) || "Not recorded"}`,
                `Room id: ${stringValue(tenant.room_id) || "None"}`,
            ])),
        }),
    );
}

function duplicatePayments(collections: LooseRow[], officeById: Map<string, string>): IntegrityDuplicateRecord[] {
    return duplicateBy(
        collections.filter((collection) => isFinanciallyEffectiveCollection(collection) && stringValue(collection.room_id) && stringValue(collection.tenant_id)),
        (collection) => [collection.company_id, collection.office_id, collection.room_id, collection.tenant_id, dateOnly(collection.payment_date), numberValue(collection.amount_paid ?? collection.amount)].join("|"),
        (key, records) => ({
            id: `payment-${key}`,
            type: "payment_record",
            title: `Possible duplicate payment UGX ${numberValue(records[0]?.amount_paid ?? records[0]?.amount).toLocaleString("en-UG")}`,
            description: "Multiple active payment rows share room, tenant, date, and amount.",
            key,
            severity: "high",
            records: records.map((collection) => entity(collection, officeById, `Payment ${stringValue(collection.id).slice(0, 8)}`, [
                `Payment date: ${dateOnly(collection.payment_date) || "Unknown"}`,
                `Amount: UGX ${numberValue(collection.amount_paid ?? collection.amount).toLocaleString("en-UG")}`,
            ])),
        }),
    ).filter((duplicate) => !duplicate.key.includes("undefined") && !duplicate.key.includes("null"));
}

function archivedDuplicateRooms(rooms: LooseRow[], officeById: Map<string, string>): ArchivedIntegrityRecord[] {
    return rooms
        .filter((room) => normalize(room.status) === "archived" && normalize(room.workbook_comment).includes("duplicate room"))
        .map((room) => {
            const raw = objectValue(room.workbook_raw_data);
            const repair = objectValue(raw.integrity_repair);
            return {
                id: stringValue(room.id),
                entityType: "room",
                label: `Room ${stringValue(room.room_number) || "Unknown"}`,
                officeName: officeById.get(stringValue(room.office_id)) ?? null,
                archivedAt: stringValue(repair.archived_at) || stringValue(room.updated_at) || null,
                duplicateOfId: stringValue(repair.duplicate_of_room_id) || null,
                comment: stringValue(room.workbook_comment) || null,
            };
        });
}

async function fetchAllRows<T extends LooseRow>(
    queryFactory: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
    pageSize = 1000,
) {
    const rows: T[] = [];
    for (let from = 0; ; from += pageSize) {
        const to = from + pageSize - 1;
        const result = await queryFactory(from, to);
        if (result.error) throw new Error(result.error.message);
        const page = result.data ?? [];
        rows.push(...page);
        if (page.length < pageSize) break;
    }
    return rows;
}

function duplicateBy(rows: LooseRow[], keyFn: (row: LooseRow) => string, build: (key: string, records: LooseRow[]) => IntegrityDuplicateRecord) {
    const groups = new Map<string, LooseRow[]>();
    for (const row of rows) {
        const key = keyFn(row);
        if (!key || key.includes("undefined")) continue;
        groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return [...groups.entries()].filter(([, records]) => records.length > 1).map(([key, records]) => build(key, records));
}

function roomEntity(room: LooseRow, officeById: Map<string, string>): IntegrityEntityRecord {
    return entity(room, officeById, `Room ${stringValue(room.room_number)}`, [
        `Status: ${stringValue(room.status) || "Unknown"}`,
        `Landlord id: ${stringValue(room.landlord_id) || "None"}`,
        `Rent: UGX ${numberValue(room.monthly_rent).toLocaleString("en-UG")}`,
        `Outstanding: UGX ${numberValue(room.outstanding_balance).toLocaleString("en-UG")}`,
    ], normalize(room.status) === "occupied");
}

function entity(row: LooseRow, officeById: Map<string, string>, label: string, details: string[], isRecommendedSurvivor = false): IntegrityEntityRecord {
    const status = stringValue(row.status) || null;
    return {
        id: stringValue(row.id),
        label,
        status,
        officeName: officeById.get(stringValue(row.office_id)) ?? null,
        details,
        isArchived: inactive(status),
        isRecommendedSurvivor,
    };
}

function emptyData(): DataIntegrityCentreData {
    return {
        generatedAt: new Date().toISOString(),
        summary: { duplicateGroups: 0, criticalGroups: 0, archivedDuplicates: 0, formulaIssues: 0, orphanWarnings: 0 },
        duplicates: [],
        formulaIssues: [],
        archivedRecords: [],
    };
}

function displayName(row: LooseRow | undefined) {
    if (!row) return "Unknown";
    return stringValue(row.full_name) || stringValue(row.name) || "Unnamed";
}

function phone(row: LooseRow | undefined) {
    if (!row) return "";
    return stringValue(row.phone) || stringValue(row.phone_number);
}

function inactive(status: unknown) {
    return INACTIVE_STATUSES.has(normalize(status));
}

function normalize(value: unknown) {
    return String(value ?? "").trim().toLowerCase();
}

function stringValue(value: unknown) {
    return typeof value === "string" ? value : value == null ? "" : String(value);
}

function numberValue(value: unknown) {
    const number = Number(value ?? 0);
    return Number.isFinite(number) ? number : 0;
}

function dateOnly(value: unknown) {
    return stringValue(value).slice(0, 10);
}

function collectionDateKey(collection: LooseRow) {
    return (dateOnly(collection.payment_date) || dateOnly(collection.paid_at) || dateOnly(collection.created_at)).slice(0, 7);
}

function objectValue(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function groupBy<T>(rows: T[], keyFn: (row: T) => string) {
    const groups = new Map<string, T[]>();
    for (const row of rows) {
        const key = keyFn(row);
        if (!key) continue;
        groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return groups;
}
