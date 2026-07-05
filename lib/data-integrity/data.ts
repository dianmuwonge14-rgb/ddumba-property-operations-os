import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AuthContext } from "@/lib/auth/types";
import type { ArchivedIntegrityRecord, DataIntegrityCentreData, IntegrityDuplicateRecord, IntegrityEntityRecord } from "./types";

type LooseRow = Record<string, unknown>;

const INACTIVE_STATUSES = new Set(["archived", "deleted", "inactive", "voided", "removed", "rejected", "cancelled", "canceled", "terminated"]);

export async function getDataIntegrityCentreData(context: AuthContext): Promise<DataIntegrityCentreData> {
    const companyId = context.activeCompany?.id;
    if (!companyId) return emptyData();

    const supabase = createSupabaseAdminClient() as unknown as SupabaseClient;
    const [officesResult, roomsResult, landlordsResult, tenantsResult, collectionsResult] = await Promise.all([
        supabase.from("offices").select("id, office_name, name").eq("company_id", companyId).limit(1000),
        supabase.from("rooms").select("id, company_id, office_id, property_id, landlord_id, room_number, status, monthly_rent, outstanding_balance, workbook_comment, workbook_raw_data, created_at, updated_at").eq("company_id", companyId).limit(5000),
        supabase.from("landlords").select("id, company_id, office_id, full_name, name, phone, phone_number, status, created_at").eq("company_id", companyId).limit(5000),
        supabase.from("tenants").select("id, company_id, office_id, room_id, full_name, name, phone, phone_number, status, outstanding_balance, created_at").eq("company_id", companyId).limit(5000),
        supabase.from("collections").select("id, company_id, office_id, room_id, tenant_id, payment_date, amount, amount_paid, status, created_at").eq("company_id", companyId).limit(10000),
    ]);

    for (const result of [officesResult, roomsResult, landlordsResult, tenantsResult, collectionsResult]) {
        if (result.error) throw new Error(result.error.message);
    }

    const offices = (officesResult.data ?? []) as LooseRow[];
    const officeById = new Map(offices.map((office) => [stringValue(office.id), stringValue(office.office_name) || stringValue(office.name) || "Office"]));
    const rooms = (roomsResult.data ?? []) as unknown as LooseRow[];
    const landlords = (landlordsResult.data ?? []) as unknown as LooseRow[];
    const tenants = (tenantsResult.data ?? []) as unknown as LooseRow[];
    const collections = (collectionsResult.data ?? []) as unknown as LooseRow[];

    const duplicates: IntegrityDuplicateRecord[] = [
        ...duplicateRooms(rooms, officeById),
        ...duplicateLandlords(landlords, officeById),
        ...duplicateTenants(tenants, officeById),
        ...duplicateTenantPhones(tenants, officeById),
        ...duplicatePayments(collections, officeById),
    ];
    const archivedRecords = archivedDuplicateRooms(rooms, officeById);
    const criticalGroups = duplicates.filter((duplicate) => duplicate.severity === "critical" || duplicate.severity === "high").length;

    return {
        generatedAt: new Date().toISOString(),
        summary: {
            duplicateGroups: duplicates.length,
            criticalGroups,
            archivedDuplicates: archivedRecords.length,
            orphanWarnings: 0,
        },
        duplicates,
        archivedRecords,
    };
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
        collections.filter((collection) => !inactive(collection.status)),
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
        summary: { duplicateGroups: 0, criticalGroups: 0, archivedDuplicates: 0, orphanWarnings: 0 },
        duplicates: [],
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

function objectValue(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
