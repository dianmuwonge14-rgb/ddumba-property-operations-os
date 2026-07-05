import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
import { requirePermission } from "@/lib/auth/permissions";
import { getScopedSupabase } from "@/lib/auth/query";
import { getSavedOneDriveConfig } from "@/lib/onedrive-master/sync";
import type { HistoricalMigrationDryRunReport, MigrationEntity, SheetDiscovery, FieldMapping } from "./types";

type ExistingKeys = {
    tenantCodes: Set<string>;
    roomNumbers: Set<string>;
    phoneNumbers: Set<string>;
    nationalIds: Set<string>;
    propertyRoomPairs: Set<string>;
};

const targetRequirements: Record<Exclude<MigrationEntity, "unknown">, string[]> = {
    offices: ["office"],
    properties: ["property"],
    rooms: ["room"],
    tenants: ["tenant"],
    landlords: ["landlord"],
    collections: ["amount", "date"],
    promises: ["promise", "date"],
    expenses: ["expense", "amount"],
    landlord_payments: ["landlord", "payment"],
    attendance: ["employee", "date"],
    daily_reports: ["report", "date"],
};

const fieldDictionary: Array<{ patterns: RegExp[]; entity: MigrationEntity; field: string; confidence: number }> = [
    item(["office", "branch", "location"], "offices", "office_name", 0.78),
    item(["property", "building", "estate"], "properties", "property_name", 0.82),
    item(["house", "room", "unit", "door"], "rooms", "room_number", 0.9),
    item(["tenant", "client", "name", "occupant"], "tenants", "full_name", 0.72),
    item(["phone", "telephone", "contact"], "tenants", "phone", 0.85),
    item(["national", "nin", "id"], "tenants", "national_id", 0.8),
    item(["tenant code", "code"], "tenants", "tenant_code", 0.7),
    item(["landlord", "owner"], "landlords", "full_name", 0.82),
    item(["rent"], "collections", "expected_amount", 0.62),
    item(["paid", "received", "amount paid", "actual pay"], "collections", "amount", 0.86),
    item(["balance", "debt", "outstanding"], "collections", "balance", 0.8),
    item(["date", "month", "year"], "collections", "paid_at", 0.65),
    item(["promise"], "promises", "amount", 0.78),
    item(["expense", "deduction", "amount taken"], "expenses", "amount", 0.84),
    item(["category", "expense incurred"], "expenses", "category", 0.76),
    item(["landlord payment", "net payment", "final pay"], "landlord_payments", "amount", 0.88),
    item(["employee", "staff", "collector"], "attendance", "employee_name", 0.68),
    item(["check in", "attendance", "present"], "attendance", "event_type", 0.78),
    item(["report", "notes", "remarks"], "daily_reports", "notes", 0.65),
];

export async function dryRunHistoricalWorkbookMigration(): Promise<HistoricalMigrationDryRunReport> {
    const context = await requirePermission("settings.view");
    const config = await getSavedOneDriveConfig();
    const workbookPath = config?.localFilePath ?? null;
    if (process.env.ENABLE_HISTORICAL_WORKBOOK_IMPORT !== "true") {
        return {
            generatedAt: new Date().toISOString(),
            workbookPath,
            sheets: [],
            mappings: [],
            totals: {
                rowsDiscovered: 0,
                rowsImportable: 0,
                estimatedOffices: context.offices.length,
                estimatedProperties: 0,
                estimatedRooms: 0,
                estimatedTenants: 0,
                estimatedLandlords: 0,
                estimatedCollections: 0,
                estimatedPromises: 0,
                estimatedExpenses: 0,
                estimatedLandlordPayments: 0,
                estimatedAttendance: 0,
                estimatedDailyReports: 0,
                duplicatesMergedEstimate: 0,
                errors: 1,
            },
            duplicates: {
                tenantCodes: 0,
                roomNumbers: 0,
                phoneNumbers: 0,
                nationalIds: 0,
                propertyRoomPairs: 0,
            },
            errors: [{
                sheet: "Workbook import disabled",
                message: "Historical workbook reading is disabled. Supabase is the live source of truth after approved import.",
            }],
            warnings: ["Excel files are import tools only and are not used as live runtime data sources."],
        };
    }
    if (!workbookPath) throw new Error("No approved historical workbook path is configured.");
    const buffer = await readFile(workbookPath);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer);
    const existing = await loadExistingKeys();

    const sheets: SheetDiscovery[] = [];
    const mappings: FieldMapping[] = [];
    const errors: HistoricalMigrationDryRunReport["errors"] = [];
    const warnings: string[] = [];
    const totals = {
        rowsDiscovered: 0,
        rowsImportable: 0,
        estimatedOffices: context.offices.length,
        estimatedProperties: 0,
        estimatedRooms: 0,
        estimatedTenants: 0,
        estimatedLandlords: 0,
        estimatedCollections: 0,
        estimatedPromises: 0,
        estimatedExpenses: 0,
        estimatedLandlordPayments: 0,
        estimatedAttendance: 0,
        estimatedDailyReports: 0,
        duplicatesMergedEstimate: 0,
        errors: 0,
    };
    const duplicateCandidates = {
        tenantCodes: 0,
        roomNumbers: 0,
        phoneNumbers: 0,
        nationalIds: 0,
        propertyRoomPairs: 0,
    };

    workbook.eachSheet((worksheet) => {
        const discovery = discoverSheet(worksheet);
        sheets.push(discovery);
        totals.rowsDiscovered += Math.max(0, worksheet.actualRowCount - (discovery.headerRow ?? 0));
        totals.rowsImportable += discovery.importableRows;
        mappings.push(...mapHeaders(discovery.name, discovery.headers));

        const estimates = estimateEntities(worksheet, discovery, existing);
        totals.estimatedProperties += estimates.properties;
        totals.estimatedRooms += estimates.rooms;
        totals.estimatedTenants += estimates.tenants;
        totals.estimatedLandlords += estimates.landlords;
        totals.estimatedCollections += estimates.collections;
        totals.estimatedPromises += estimates.promises;
        totals.estimatedExpenses += estimates.expenses;
        totals.estimatedLandlordPayments += estimates.landlordPayments;
        totals.estimatedAttendance += estimates.attendance;
        totals.estimatedDailyReports += estimates.dailyReports;
        duplicateCandidates.tenantCodes += estimates.duplicates.tenantCodes;
        duplicateCandidates.roomNumbers += estimates.duplicates.roomNumbers;
        duplicateCandidates.phoneNumbers += estimates.duplicates.phoneNumbers;
        duplicateCandidates.nationalIds += estimates.duplicates.nationalIds;
        duplicateCandidates.propertyRoomPairs += estimates.duplicates.propertyRoomPairs;
        errors.push(...estimates.errors.map((message) => ({ sheet: discovery.name, message })));
    });

    totals.duplicatesMergedEstimate = Object.values(duplicateCandidates).reduce((sum, count) => sum + count, 0);
    totals.errors = errors.length;
    if (!mappings.length) warnings.push("No confident field mappings were discovered. Review workbook headers manually before import.");
    if (!sheets.some((sheet) => sheet.inferredEntities.includes("collections"))) warnings.push("No strong collections sheet was detected.");

    return {
        generatedAt: new Date().toISOString(),
        workbookPath,
        sheets,
        mappings: mappings.sort((a, b) => b.confidence - a.confidence),
        totals,
        duplicates: duplicateCandidates,
        errors,
        warnings,
    };
}

async function loadExistingKeys(): Promise<ExistingKeys> {
    const { supabase } = await getScopedSupabase();
    const [tenants, rooms] = await Promise.all([
        supabase.from("tenants").select("tenant_code, phone, national_id, property_id, room_id"),
        supabase.from("rooms").select("id, property_id, room_number"),
    ]);
    const roomById = new Map((rooms.data ?? []).map((room) => [room.id, room]));
    return {
        tenantCodes: new Set((tenants.data ?? []).map((row) => normalize(row.tenant_code)).filter(Boolean)),
        phoneNumbers: new Set((tenants.data ?? []).map((row) => normalizePhone(row.phone)).filter(Boolean)),
        nationalIds: new Set((tenants.data ?? []).map((row) => normalize(row.national_id)).filter(Boolean)),
        roomNumbers: new Set((rooms.data ?? []).map((row) => normalize(row.room_number)).filter(Boolean)),
        propertyRoomPairs: new Set((tenants.data ?? []).map((tenant) => {
            const room = tenant.room_id ? roomById.get(tenant.room_id) : null;
            return normalizePair(tenant.property_id ?? room?.property_id, room?.room_number);
        }).filter(Boolean)),
    };
}

function discoverSheet(worksheet: ExcelJS.Worksheet): SheetDiscovery {
    const header = findHeaderRow(worksheet);
    const headers = header ? rowValues(worksheet.getRow(header)).map(String) : [];
    const inferredEntities = inferEntities(worksheet.name, headers);
    const missingColumns = [...new Set(inferredEntities.flatMap((entity) => entity === "unknown" ? [] : missingFor(entity, headers)))];
    return {
        name: worksheet.name,
        rowCount: worksheet.actualRowCount,
        columnCount: worksheet.actualColumnCount,
        headerRow: header,
        headers,
        inferredEntities,
        importableRows: header ? Math.max(0, worksheet.actualRowCount - header) : 0,
        missingColumns,
        unmappedFields: headers.filter((headerValue) => !mapHeader(headerValue)),
    };
}

function findHeaderRow(worksheet: ExcelJS.Worksheet) {
    let best: { row: number; score: number } | null = null;
    const max = Math.min(12, worksheet.rowCount);
    for (let index = 1; index <= max; index += 1) {
        const values = rowValues(worksheet.getRow(index));
        const score = values.reduce((sum, value) => sum + headerScore(String(value)), 0);
        if (!best || score > best.score) best = { row: index, score };
    }
    return best && best.score >= 2 ? best.row : null;
}

function mapHeaders(sheet: string, headers: string[]): FieldMapping[] {
    return headers.flatMap((header) => {
        const mapped = mapHeader(header);
        return mapped ? [{ sheet, sourceColumn: header, ...mapped }] : [];
    });
}

function inferEntities(sheetName: string, headers: string[]): MigrationEntity[] {
    const text = `${sheetName} ${headers.join(" ")}`.toLowerCase();
    const entities: MigrationEntity[] = [];
    if (includesAny(text, ["cash flow", "payments received", "paid", "balance", "actual pay"])) entities.push("collections");
    if (includesAny(text, ["tenant", "client", "house no", "room", "defaulter"])) entities.push("tenants", "rooms");
    if (includesAny(text, ["landlord", "owner"])) entities.push("landlords");
    if (includesAny(text, ["expense", "deduction", "amount taken"])) entities.push("expenses");
    if (includesAny(text, ["landlord payment", "net payment", "final pay"])) entities.push("landlord_payments");
    if (includesAny(text, ["promise"])) entities.push("promises");
    if (includesAny(text, ["attendance", "employee", "staff"])) entities.push("attendance");
    if (includesAny(text, ["report", "notes", "remarks"])) entities.push("daily_reports");
    return [...new Set<MigrationEntity>(entities.length ? entities : ["unknown"])];
}

function estimateEntities(worksheet: ExcelJS.Worksheet, discovery: SheetDiscovery, existing: ExistingKeys) {
    const headerIndex = discovery.headerRow ?? 0;
    const headerMap = headerIndex ? buildHeaderMap(discovery.headers) : new Map<string, number>();
    const result = {
        properties: 0,
        rooms: 0,
        tenants: 0,
        landlords: 0,
        collections: 0,
        promises: 0,
        expenses: 0,
        landlordPayments: 0,
        attendance: 0,
        dailyReports: 0,
        duplicates: { tenantCodes: 0, roomNumbers: 0, phoneNumbers: 0, nationalIds: 0, propertyRoomPairs: 0 },
        errors: [] as string[],
    };
    if (!headerIndex) return result;

    const seen = {
        properties: new Set<string>(),
        rooms: new Set<string>(),
        tenants: new Set<string>(),
        landlords: new Set<string>(),
    };
    for (let rowNumber = headerIndex + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
        const row = worksheet.getRow(rowNumber);
        const values = rowValues(row);
        if (!values.some(Boolean)) continue;
        const room = pick(row, headerMap, ["room_number", "house_no", "house", "room", "unit"]);
        const tenant = pick(row, headerMap, ["tenant", "client", "name", "occupant"]);
        const phone = pick(row, headerMap, ["phone", "telephone", "contact"]);
        const nationalId = pick(row, headerMap, ["national_id", "nin", "id"]);
        const tenantCode = pick(row, headerMap, ["tenant_code", "code"]);
        const property = pick(row, headerMap, ["property", "location", "building"]);
        const landlord = pick(row, headerMap, ["landlord", "owner"]);
        const paid = pick(row, headerMap, ["paid", "received", "amount_paid", "actual_pay"]);
        const expense = pick(row, headerMap, ["expense", "amount_taken", "deduction"]);
        const promise = pick(row, headerMap, ["promise"]);

        addUnique(seen.properties, property);
        addUnique(seen.rooms, room);
        addUnique(seen.tenants, tenant || phone || tenantCode);
        addUnique(seen.landlords, landlord);
        if (paid && discovery.inferredEntities.includes("collections")) result.collections += 1;
        if (promise) result.promises += 1;
        if (expense && discovery.inferredEntities.includes("expenses")) result.expenses += 1;
        if (paid && discovery.inferredEntities.includes("landlord_payments")) result.landlordPayments += 1;
        if (discovery.inferredEntities.includes("attendance")) result.attendance += 1;
        if (discovery.inferredEntities.includes("daily_reports")) result.dailyReports += 1;

        if (tenantCode && existing.tenantCodes.has(normalize(tenantCode))) result.duplicates.tenantCodes += 1;
        if (room && existing.roomNumbers.has(normalize(room))) result.duplicates.roomNumbers += 1;
        if (phone && existing.phoneNumbers.has(normalizePhone(phone))) result.duplicates.phoneNumbers += 1;
        if (nationalId && existing.nationalIds.has(normalize(nationalId))) result.duplicates.nationalIds += 1;
        if (property && room && existing.propertyRoomPairs.has(normalizePair(property, room))) result.duplicates.propertyRoomPairs += 1;
    }
    result.properties = seen.properties.size;
    result.rooms = seen.rooms.size;
    result.tenants = seen.tenants.size;
    result.landlords = seen.landlords.size;
    return result;
}

function mapHeader(header: string) {
    const lower = normalize(header);
    if (!lower) return null;
    const match = fieldDictionary.find((entry) => entry.patterns.some((pattern) => pattern.test(lower)));
    return match ? { targetEntity: match.entity, targetField: match.field, confidence: match.confidence } : null;
}

function item(words: string[], entity: MigrationEntity, field: string, confidence: number) {
    return { patterns: words.map((word) => new RegExp(`(^|[^a-z0-9])${escapeRegex(word)}([^a-z0-9]|$)`, "i")), entity, field, confidence };
}

function missingFor(entity: Exclude<MigrationEntity, "unknown">, headers: string[]) {
    const text = headers.join(" ").toLowerCase();
    return targetRequirements[entity].filter((required) => !text.includes(required));
}

function buildHeaderMap(headers: string[]) {
    return new Map(headers.map((header, index) => [normalizeKey(header), index + 1]));
}

function pick(row: ExcelJS.Row, headerMap: Map<string, number>, keys: string[]) {
    for (const key of keys) {
        const column = headerMap.get(normalizeKey(key));
        const value = column ? cellText(row.getCell(column).value) : "";
        if (value) return value;
    }
    return "";
}

function rowValues(row: ExcelJS.Row) {
    const values: string[] = [];
    row.eachCell({ includeEmpty: false }, (cell) => values.push(cellText(cell.value)));
    return values;
}

function cellText(value: ExcelJS.CellValue) {
    if (value == null) return "";
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "object") {
        if ("text" in value && value.text) return String(value.text);
        if ("result" in value && value.result != null) return String(value.result);
        if ("richText" in value && Array.isArray(value.richText)) return value.richText.map((part) => part.text).join("");
        if ("formula" in value && value.formula) return String(value.formula);
    }
    return String(value).trim();
}

function headerScore(value: string) {
    const lower = value.toLowerCase();
    return fieldDictionary.filter((entry) => entry.patterns.some((pattern) => pattern.test(lower))).length;
}

function normalize(value: unknown) {
    return String(value ?? "").trim().toLowerCase();
}

function normalizeKey(value: unknown) {
    return normalize(value).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function normalizePhone(value: unknown) {
    return String(value ?? "").replace(/\D/g, "");
}

function normalizePair(property: unknown, room: unknown) {
    const left = normalize(property);
    const right = normalize(room);
    return left && right ? `${left}::${right}` : "";
}

function addUnique(set: Set<string>, value: string) {
    const normalized = normalize(value);
    if (normalized) set.add(normalized);
}

function includesAny(value: string, needles: string[]) {
    return needles.some((needle) => value.includes(needle));
}

function escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
