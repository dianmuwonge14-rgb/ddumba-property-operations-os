"use server";

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { requireCompanyAdminMode } from "@/lib/auth/permissions";
import { logUserAction } from "@/lib/auth/audit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";

type AuditJson = Database["public"]["Tables"]["audit_logs"]["Insert"]["after_data"];

type WorkbookCell = string | number | boolean | null;

export type CommissionImportPreviewRow = {
    rowNumber: number;
    raw: Record<string, WorkbookCell>;
    landlordName: string;
    phone: string | null;
    officeOrProperty: string | null;
    sourcePortfolioRentRoll: number | null;
    sourceCommissionAmount: number | null;
    sourceCommissionRate: number | null;
    sourceLandlordNetPayable: number | null;
    matchedLandlordId: string | null;
    matchedLandlordName: string | null;
    portfolioRentRoll: number;
    calculatedCommissionRate: number | null;
    calculatedCommissionAmount: number | null;
    calculatedLandlordNetPayable: number | null;
    matchStatus: "matched" | "ambiguous" | "unmatched" | "invalid";
    matchConfidence: number;
    matchReason: string;
    errorMessage?: string;
};

export type CommissionImportPreview = {
    fileName: string;
    sheetName: string;
    detectedColumns: string[];
    totalRows: number;
    matchedRows: number;
    unmatchedRows: number;
    ambiguousRows: number;
    invalidRows: number;
    totalExpectedCompanyMonthlyCommission: number;
    totalLandlordPayable: number;
    rows: CommissionImportPreviewRow[];
};

type LandlordRecord = {
    id: string;
    full_name: string | null;
    phone: string | null;
    landlord_code?: string | null;
    commission_rate?: number | string | null;
};

type RoomRecord = {
    id: string;
    landlord_id: string | null;
    monthly_rent: number | string | null;
    office_id: string | null;
    property_id: string | null;
};

type LooseDb = {
    from: (table: string) => {
        select: (columns: string) => QueryBuilder;
        insert: (values: Record<string, unknown> | Record<string, unknown>[]) => {
            select?: (columns: string) => { single: () => Promise<{ data: Record<string, unknown>; error: { message: string } | null }> };
        } & Promise<{ data: unknown; error: { message: string } | null }>;
        update: (values: Record<string, unknown>) => {
            eq: (column: string, value: string) => QueryBuilder;
        };
    };
};

type QueryBuilder = {
    eq: (column: string, value: string) => QueryBuilder;
    in: (column: string, values: string[]) => QueryBuilder;
    maybeSingle?: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
} & Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;

function jsonSafe(value: unknown): AuditJson {
    return JSON.parse(JSON.stringify(value ?? null)) as AuditJson;
}

export async function analyzeLandlordCommissionWorkbook(formData: FormData): Promise<CommissionImportPreview> {
    const context = await requireCompanyAdminMode();
    const companyId = context.activeCompany?.id;
    if (!companyId) throw new Error("Active company is required.");

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
        throw new Error("Upload the LANDLORD'S CUT Excel workbook first.");
    }

    const workbook = await readWorkbook(file);
    const worksheet = workbook.worksheets.find((sheet) => sheet.actualRowCount > 0);
    if (!worksheet) throw new Error("No usable worksheet was found in this workbook.");

    const parsed = parseWorksheet(worksheet);
    const supabase = await createSupabaseServerClient();
    const db = supabase as unknown as LooseDb;
    const [
        landlordsResult,
        roomsResult,
        officesResult,
        propertiesResult,
    ] = await Promise.all([
        db.from("landlords").select("*").eq("company_id", companyId),
        db.from("rooms").select("*").eq("company_id", companyId),
        db.from("offices").select("*").eq("company_id", companyId),
        db.from("properties").select("*").eq("company_id", companyId),
    ]);

    for (const result of [landlordsResult, roomsResult, officesResult, propertiesResult]) {
        if (result.error) throw new Error(result.error.message);
    }

    const landlords = (landlordsResult.data ?? []) as LandlordRecord[];
    const rooms = (roomsResult.data ?? []) as RoomRecord[];
    const portfolioByLandlord = new Map<string, number>();
    for (const room of rooms) {
        if (!room.landlord_id) continue;
        portfolioByLandlord.set(room.landlord_id, (portfolioByLandlord.get(room.landlord_id) ?? 0) + amount(room.monthly_rent));
    }

    const rows = parsed.rows.map((row) => buildPreviewRow({
        row,
        landlords,
        portfolioByLandlord,
    }));

    return {
        fileName: file.name,
        sheetName: worksheet.name,
        detectedColumns: parsed.headers,
        totalRows: rows.length,
        matchedRows: rows.filter((row) => row.matchStatus === "matched").length,
        unmatchedRows: rows.filter((row) => row.matchStatus === "unmatched").length,
        ambiguousRows: rows.filter((row) => row.matchStatus === "ambiguous").length,
        invalidRows: rows.filter((row) => row.matchStatus === "invalid").length,
        totalExpectedCompanyMonthlyCommission: rows.reduce((total, row) => total + (row.calculatedCommissionAmount ?? 0), 0),
        totalLandlordPayable: rows.reduce((total, row) => total + (row.calculatedLandlordNetPayable ?? 0), 0),
        rows,
    };
}

export async function applyLandlordCommissionWorkbookImport(formData: FormData) {
    const context = await requireCompanyAdminMode();
    const companyId = context.activeCompany?.id;
    if (!companyId) throw new Error("Active company is required.");

    const preview = await analyzeLandlordCommissionWorkbook(formData);
    const approved = formData.get("approved");
    if (approved !== "yes") {
        throw new Error("Run dry-run analysis and approve the matched rows before importing.");
    }

    const importableRows = preview.rows.filter((row) => row.matchStatus === "matched" && row.matchedLandlordId && row.calculatedCommissionRate !== null);
    if (!importableRows.length) throw new Error("No matched rows are safe to import.");

    const supabase = await createSupabaseServerClient();
    const db = supabase as unknown as LooseDb;
    const actorId = context.profile?.id ?? context.authUser?.id ?? null;
    const batchResult = await db.from("landlord_commission_import_batches").insert({
        company_id: companyId,
        file_name: preview.fileName,
        sheet_name: preview.sheetName,
        total_rows: preview.totalRows,
        matched_rows: preview.matchedRows,
        unmatched_rows: preview.unmatchedRows,
        ambiguous_rows: preview.ambiguousRows,
        imported_rows: importableRows.length,
        status: "imported",
        detected_columns: preview.detectedColumns,
        totals: {
            expected_company_monthly_commission: preview.totalExpectedCompanyMonthlyCommission,
            landlord_payable: preview.totalLandlordPayable,
        },
        created_by: actorId,
        approved_by: actorId,
        approved_at: new Date().toISOString(),
    }).select?.("*").single();

    if (!batchResult) throw new Error("Import batch insert did not return a result.");
    if (batchResult.error) throw new Error(batchResult.error.message);
    const batchId = String(batchResult.data.id);

    const allImportRows = preview.rows.map((row) => ({
        batch_id: batchId,
        company_id: companyId,
        row_number: row.rowNumber,
        sheet_name: preview.sheetName,
        raw_data: row.raw,
        detected_landlord_name: row.landlordName || null,
        detected_phone: row.phone,
        detected_office_or_property: row.officeOrProperty,
        detected_portfolio_rent_roll: row.sourcePortfolioRentRoll,
        detected_commission_amount: row.sourceCommissionAmount,
        detected_commission_rate: row.sourceCommissionRate,
        detected_landlord_net_payable: row.sourceLandlordNetPayable,
        matched_landlord_id: row.matchedLandlordId,
        match_status: row.matchStatus,
        match_confidence: row.matchConfidence,
        match_reason: row.matchReason,
        calculated_commission_rate: row.calculatedCommissionRate,
        calculated_commission_amount: row.calculatedCommissionAmount,
        calculated_landlord_net_payable: row.calculatedLandlordNetPayable,
        error_message: row.errorMessage ?? null,
        imported_at: row.matchStatus === "matched" ? new Date().toISOString() : null,
    }));
    const rowsInsert = await db.from("landlord_commission_import_rows").insert(allImportRows);
    if (rowsInsert.error) throw new Error(rowsInsert.error.message);

    const landlordsResult = await db
        .from("landlords")
        .select("*")
        .eq("company_id", companyId);
    if (landlordsResult.error) throw new Error(landlordsResult.error.message);
    const landlordById = new Map((landlordsResult.data ?? []).map((landlord) => [String(landlord.id), landlord]));

    for (const row of importableRows) {
        const landlord = landlordById.get(row.matchedLandlordId!);
        const oldRate = landlord?.commission_rate ?? null;
        const oldRateNumber = oldRate === null ? null : Number(oldRate);
        const oldNet = oldRateNumber === null || !Number.isFinite(oldRateNumber)
            ? null
            : Math.max(0, row.portfolioRentRoll - Math.round(row.portfolioRentRoll * oldRateNumber / 100));

        const update = await db.from("landlords").update({
            commission_rate: row.calculatedCommissionRate,
            commission_input_mode: row.sourceLandlordNetPayable !== null ? "landlord_net_amount" : "percentage",
            landlord_net_payable_override: row.sourceLandlordNetPayable,
            commission_import_batch_id: batchId,
            commission_notes: row.raw.notes ?? row.raw.Notes ?? null,
            commission_updated_by: actorId,
            commission_updated_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }).eq("id", row.matchedLandlordId!);
        if (update.error) throw new Error(update.error.message);

        const history = await db.from("landlord_commission_changes").insert({
            company_id: companyId,
            landlord_id: row.matchedLandlordId!,
            old_commission_rate: oldRate,
            new_commission_rate: row.calculatedCommissionRate,
            old_landlord_net_amount: oldNet,
            new_landlord_net_amount: row.calculatedLandlordNetPayable,
            portfolio_rent_roll: row.portfolioRentRoll,
            input_mode: row.sourceLandlordNetPayable !== null ? "landlord_net_amount" : "percentage",
            changed_by: actorId,
            notes: "Imported from company commission Excel workbook.",
        });
        if (history.error) throw new Error(history.error.message);

        await logUserAction({
            action: "landlord_commission_excel_imported",
            entityType: "landlord",
            entityId: row.matchedLandlordId!,
            companyId,
            officeId: context.activeOffice?.id ?? null,
            beforeData: jsonSafe({ landlord, commission_rate: oldRate, landlord_net_amount: oldNet }),
            afterData: jsonSafe({
                landlord_id: row.matchedLandlordId,
                landlord_name: row.matchedLandlordName,
                commission_rate: row.calculatedCommissionRate,
                commission_amount: row.calculatedCommissionAmount,
                landlord_net_amount: row.calculatedLandlordNetPayable,
                portfolio_rent_roll: row.portfolioRentRoll,
                import_batch_id: batchId,
            }),
        });
    }

    revalidatePath("/office/landlords");
    revalidatePath("/office/admin");
    revalidatePath("/office/dashboard");
    revalidatePath("/office/ai");

    return {
        batchId,
        importedRows: importableRows.length,
        skippedRows: preview.totalRows - importableRows.length,
    };
}

async function readWorkbook(file: File) {
    const workbook = new ExcelJS.Workbook();
    const buffer = Buffer.from(await file.arrayBuffer());
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    return workbook;
}

function parseWorksheet(worksheet: ExcelJS.Worksheet) {
    const headerRowNumber = findHeaderRow(worksheet);
    const headerRow = worksheet.getRow(headerRowNumber);
    const headers = headerRow.values as ExcelJS.CellValue[];
    const normalizedHeaders = headers.map((value, index) => {
        if (index === 0) return "";
        const text = cellToString(value);
        return text || `Column ${index}`;
    });

    const rows: Array<{ rowNumber: number; values: Record<string, WorkbookCell> }> = [];
    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber <= headerRowNumber) return;
        const values: Record<string, WorkbookCell> = {};
        let hasValue = false;
        for (let column = 1; column <= worksheet.columnCount; column += 1) {
            const header = normalizedHeaders[column] ?? `Column ${column}`;
            const value = normalizeCell(row.getCell(column).value);
            values[header] = value;
            if (value !== null && value !== "") hasValue = true;
        }
        if (hasValue) rows.push({ rowNumber, values });
    });

    return {
        headers: normalizedHeaders.filter(Boolean),
        rows,
    };
}

function findHeaderRow(worksheet: ExcelJS.Worksheet) {
    let bestRow = 1;
    let bestScore = -1;
    worksheet.eachRow((row, rowNumber) => {
        const text = (row.values as ExcelJS.CellValue[]).map(cellToString).join(" ").toLowerCase();
        const score = [
            "landlord",
            "phone",
            "commission",
            "payment",
            "payable",
            "net",
        ].reduce((total, word) => total + (text.includes(word) ? 1 : 0), 0);
        if (score > bestScore) {
            bestScore = score;
            bestRow = rowNumber;
        }
    });
    return bestRow;
}

function buildPreviewRow(input: {
    row: { rowNumber: number; values: Record<string, WorkbookCell> };
    landlords: LandlordRecord[];
    portfolioByLandlord: Map<string, number>;
}): CommissionImportPreviewRow {
    const landlordName = stringField(input.row.values, ["landlord name", "landlord", "name"]);
    const phone = stringField(input.row.values, ["phone number", "phone", "contact"]);
    const officeOrProperty = stringField(input.row.values, ["office", "location", "property"]);
    const sourcePortfolioRentRoll = numberField(input.row.values, ["portfolio rent roll", "rent roll", "portfolio", "gross"]);
    const sourceCommissionAmount = numberField(input.row.values, ["commission amount", "commission ugx", "company commission amount"]);
    const sourceCommissionRate = percentField(input.row.values, ["commission percentage", "commission %", "percentage", "rate"]);
    const sourceLandlordNetPayable = numberField(input.row.values, ["landlord net payable", "net payable", "payment after commission deductions", "paymeny after commission deductions", "payment", "payable"]);

    if (!landlordName) {
        return basePreview(input.row, {
            landlordName: "",
            phone,
            officeOrProperty,
            sourcePortfolioRentRoll,
            sourceCommissionAmount,
            sourceCommissionRate,
            sourceLandlordNetPayable,
            matchStatus: "invalid",
            matchConfidence: 0,
            matchReason: "No landlord name detected.",
            errorMessage: "Missing landlord name.",
        });
    }

    const match = matchLandlord({
        landlordName,
        phone,
        officeOrProperty,
        landlords: input.landlords,
    });
    const portfolioRentRoll = match.landlord ? input.portfolioByLandlord.get(match.landlord.id) ?? sourcePortfolioRentRoll ?? 0 : sourcePortfolioRentRoll ?? 0;
    const calculated = calculateCommission({
        portfolioRentRoll,
        sourceCommissionAmount,
        sourceCommissionRate,
        sourceLandlordNetPayable,
    });
    const status = match.status === "matched" && calculated.commissionRate !== null ? "matched" : match.status;

    return {
        ...basePreview(input.row, {
            landlordName,
            phone,
            officeOrProperty,
            sourcePortfolioRentRoll,
            sourceCommissionAmount,
            sourceCommissionRate,
            sourceLandlordNetPayable,
            matchStatus: status,
            matchConfidence: match.confidence,
            matchReason: calculated.error ? `${match.reason}. ${calculated.error}` : match.reason,
            errorMessage: calculated.error ?? undefined,
        }),
        matchedLandlordId: match.landlord?.id ?? null,
        matchedLandlordName: match.landlord?.full_name ?? null,
        portfolioRentRoll,
        calculatedCommissionRate: calculated.commissionRate,
        calculatedCommissionAmount: calculated.commissionAmount,
        calculatedLandlordNetPayable: calculated.landlordNetPayable,
    };
}

function basePreview(
    row: { rowNumber: number; values: Record<string, WorkbookCell> },
    patch: Partial<CommissionImportPreviewRow>,
): CommissionImportPreviewRow {
    return {
        rowNumber: row.rowNumber,
        raw: row.values,
        landlordName: "",
        phone: null,
        officeOrProperty: null,
        sourcePortfolioRentRoll: null,
        sourceCommissionAmount: null,
        sourceCommissionRate: null,
        sourceLandlordNetPayable: null,
        matchedLandlordId: null,
        matchedLandlordName: null,
        portfolioRentRoll: 0,
        calculatedCommissionRate: null,
        calculatedCommissionAmount: null,
        calculatedLandlordNetPayable: null,
        matchStatus: "unmatched",
        matchConfidence: 0,
        matchReason: "No match attempted.",
        ...patch,
    };
}

function matchLandlord(input: {
    landlordName: string;
    phone: string | null;
    officeOrProperty: string | null;
    landlords: LandlordRecord[];
}) {
    const normalizedName = normalize(input.landlordName);
    const normalizedPhone = normalizePhone(input.phone);
    const candidates = input.landlords.map((landlord) => {
        const name = normalize(landlord.full_name ?? "");
        const phone = normalizePhone(landlord.phone);
        let score = 0;
        const reasons = [];
        if (name === normalizedName) {
            score += 90;
            reasons.push("exact normalized name");
        } else if (name.includes(normalizedName) || normalizedName.includes(name)) {
            score += 70;
            reasons.push("partial normalized name");
        }
        if (normalizedPhone && phone && normalizedPhone === phone) {
            score += 20;
            reasons.push("phone match");
        }
        return { landlord, score, reason: reasons.join(", ") || "low confidence" };
    }).filter((candidate) => candidate.score > 0).sort((a, b) => b.score - a.score);

    if (!candidates.length) {
        return { landlord: null, status: "unmatched" as const, confidence: 0, reason: "No existing landlord matched by name or phone." };
    }
    const top = candidates[0];
    const second = candidates[1];
    if (second && top.score - second.score < 15) {
        return { landlord: top.landlord, status: "ambiguous" as const, confidence: top.score, reason: `Ambiguous match: ${top.reason}; close candidate ${second.landlord.full_name}.` };
    }
    return { landlord: top.landlord, status: "matched" as const, confidence: Math.min(100, top.score), reason: top.reason };
}

function calculateCommission(input: {
    portfolioRentRoll: number;
    sourceCommissionAmount: number | null;
    sourceCommissionRate: number | null;
    sourceLandlordNetPayable: number | null;
}) {
    const portfolioRentRoll = input.portfolioRentRoll;
    if (portfolioRentRoll <= 0) {
        return { commissionRate: null, commissionAmount: null, landlordNetPayable: input.sourceLandlordNetPayable, error: "Portfolio rent roll is zero or unavailable." };
    }
    if (input.sourceCommissionRate !== null) {
        const commissionAmount = Math.round(portfolioRentRoll * input.sourceCommissionRate / 100);
        return {
            commissionRate: roundRate(input.sourceCommissionRate),
            commissionAmount,
            landlordNetPayable: Math.max(0, portfolioRentRoll - commissionAmount),
            error: null,
        };
    }
    if (input.sourceCommissionAmount !== null) {
        return {
            commissionRate: roundRate((input.sourceCommissionAmount / portfolioRentRoll) * 100),
            commissionAmount: input.sourceCommissionAmount,
            landlordNetPayable: Math.max(0, portfolioRentRoll - input.sourceCommissionAmount),
            error: null,
        };
    }
    if (input.sourceLandlordNetPayable !== null) {
        if (input.sourceLandlordNetPayable > portfolioRentRoll) {
            return { commissionRate: null, commissionAmount: null, landlordNetPayable: input.sourceLandlordNetPayable, error: "Landlord net payable is greater than portfolio rent roll." };
        }
        const commissionAmount = Math.max(0, portfolioRentRoll - input.sourceLandlordNetPayable);
        return {
            commissionRate: roundRate((commissionAmount / portfolioRentRoll) * 100),
            commissionAmount,
            landlordNetPayable: input.sourceLandlordNetPayable,
            error: null,
        };
    }
    return { commissionRate: null, commissionAmount: null, landlordNetPayable: null, error: "No commission amount, commission percentage, or landlord net payable was detected." };
}

function stringField(values: Record<string, WorkbookCell>, aliases: string[]) {
    const match = findValue(values, aliases);
    const text = match === null ? "" : String(match).trim();
    return text || null;
}

function numberField(values: Record<string, WorkbookCell>, aliases: string[]) {
    const value = findValue(values, aliases);
    return parseNumber(value);
}

function percentField(values: Record<string, WorkbookCell>, aliases: string[]) {
    const parsed = numberField(values, aliases);
    if (parsed === null) return null;
    return parsed <= 1 ? roundRate(parsed * 100) : roundRate(parsed);
}

function findValue(values: Record<string, WorkbookCell>, aliases: string[]) {
    const entries = Object.entries(values);
    for (const alias of aliases) {
        const normalizedAlias = normalize(alias);
        const found = entries.find(([key]) => normalize(key) === normalizedAlias);
        if (found) return found[1];
    }
    for (const alias of aliases) {
        const normalizedAlias = normalize(alias);
        const found = entries.find(([key]) => normalize(key).includes(normalizedAlias));
        if (found) return found[1];
    }
    return null;
}

function normalize(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function normalizePhone(value: string | null | undefined) {
    return value ? value.replace(/\D/g, "") : "";
}

function parseNumber(value: WorkbookCell | undefined | null) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value !== "string") return null;
    const cleaned = value.replace(/ugx/gi, "").replace(/,/g, "").replace(/%/g, "").trim();
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
}

function amount(value: unknown) {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

function roundRate(value: number) {
    return Number(value.toFixed(4));
}

function normalizeCell(value: ExcelJS.CellValue): WorkbookCell {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
    if (typeof value === "object" && "text" in value) return String(value.text ?? "");
    if (typeof value === "object" && "result" in value) return normalizeCell(value.result as ExcelJS.CellValue);
    if (typeof value === "object" && "richText" in value && Array.isArray(value.richText)) {
        return value.richText.map((part) => part.text).join("");
    }
    return String(value);
}

function cellToString(value: ExcelJS.CellValue) {
    const normalized = normalizeCell(value);
    if (normalized === null) return "";
    return String(normalized).trim();
}
