import ExcelJS from "exceljs";
import { readFile, writeFile } from "node:fs/promises";
import { requirePermission } from "@/lib/auth/permissions";
import { getScopedSupabase } from "@/lib/auth/query";
import { logUserAction } from "@/lib/auth/audit";
import { getSpreadsheetData } from "@/lib/spreadsheet-reporting/data";
import type { SpreadsheetRow } from "@/lib/spreadsheet-reporting/types";
import type { Database } from "@/types/database.types";
import type { OneDriveMasterConfig, OneDriveSyncResult } from "./types";

type Json = Database["public"]["Tables"]["company_settings"]["Insert"]["value"];

export const ONEDRIVE_MASTER_SETTING_KEY = "onedrive_master_workbook";

const DEFAULT_COMPANY_SHEET = "DDUMBA COMPANY SYNC";

const syncColumns: Array<{ header: string; key: keyof SpreadsheetRow; width: number }> = [
    { header: "Date", key: "date", width: 14 },
    { header: "Office", key: "officeName", width: 24 },
    { header: "Property", key: "property", width: 24 },
    { header: "Room", key: "room", width: 12 },
    { header: "Tenant", key: "tenantName", width: 24 },
    { header: "Phone", key: "phone", width: 16 },
    { header: "Amount Paid", key: "amountPaid", width: 16 },
    { header: "Balance Before", key: "balanceBefore", width: 18 },
    { header: "Balance After", key: "balanceAfter", width: 18 },
    { header: "Promise Amount", key: "promiseAmount", width: 18 },
    { header: "Promise Date", key: "promiseDate", width: 16 },
    { header: "Promise Status", key: "promiseStatus", width: 18 },
    { header: "Expense", key: "expenses", width: 16 },
    { header: "Expense Category", key: "expenseCategory", width: 22 },
    { header: "Landlord Payment", key: "paidLandlords", width: 20 },
    { header: "Landlord Name", key: "landlordName", width: 24 },
    { header: "Collected By", key: "collectedBy", width: 22 },
    { header: "Reference", key: "collectionReference", width: 22 },
    { header: "Transaction Type", key: "transactionType", width: 18 },
    { header: "Payment Method", key: "paymentMethod", width: 18 },
    { header: "Notes", key: "notes", width: 36 },
    { header: "Created At", key: "createdAt", width: 22 },
    { header: "Updated At", key: "updatedAt", width: 22 },
    { header: "Created By", key: "createdBy", width: 22 },
    { header: "Audit Status", key: "auditStatus", width: 16 },
];

export function defaultOneDriveConfig(offices: Array<{ id: string; office_name?: string; name?: string | null }>): OneDriveMasterConfig {
    return {
        provider: "local_file",
        localFilePath: "/Volumes/Untitled/HERITAGE 20.xlsx",
        companySheetName: DEFAULT_COMPANY_SHEET,
        officeSheetMap: Object.fromEntries(offices.map((office) => [office.id, `DDUMBA ${office.office_name ?? office.name ?? "Office"}`])),
        lastSyncStatus: "never",
    };
}

export function parseOneDriveConfig(value: unknown, offices: Array<{ id: string; office_name?: string; name?: string | null }>): OneDriveMasterConfig {
    const defaults = defaultOneDriveConfig(offices);
    if (!value || typeof value !== "object") return defaults;
    const raw = value as Partial<OneDriveMasterConfig>;
    return {
        ...defaults,
        ...raw,
        provider: raw.provider === "microsoft_graph" ? "microsoft_graph" : "local_file",
        companySheetName: raw.companySheetName || defaults.companySheetName,
        officeSheetMap: { ...defaults.officeSheetMap, ...(raw.officeSheetMap ?? {}) },
    };
}

export async function getSavedOneDriveConfig() {
    const context = await requirePermission("settings.view");
    const { supabase } = await getScopedSupabase();
    const companyId = context.activeCompany?.id;
    if (!companyId) return null;
    const { data } = await supabase
        .from("company_settings")
        .select("value")
        .eq("company_id", companyId)
        .eq("key", ONEDRIVE_MASTER_SETTING_KEY)
        .maybeSingle();
    return parseOneDriveConfig(data?.value, context.offices);
}

export async function saveOneDriveConfig(input: OneDriveMasterConfig) {
    const context = await requirePermission("settings.manage");
    const { supabase } = await getScopedSupabase();
    const companyId = context.activeCompany?.id;
    if (!companyId) throw new Error("Active company is required.");

    const config: OneDriveMasterConfig = {
        ...parseOneDriveConfig(input, context.offices),
        connectedAt: new Date().toISOString(),
        lastSyncStatus: input.lastSyncStatus ?? "never",
        lastSyncError: null,
    };

    const { error } = await supabase.from("company_settings").upsert({
        company_id: companyId,
        key: ONEDRIVE_MASTER_SETTING_KEY,
        value: config as unknown as Json,
        is_sensitive: false,
        updated_at: new Date().toISOString(),
    }, { onConflict: "company_id,key" });
    if (error) throw new Error(error.message);

    await logUserAction({
        action: "onedrive_master_file_connected",
        entityType: "company_settings",
        companyId,
        afterData: scrubConfig(config) as unknown as Json,
    });
    return config;
}

export async function syncOneDriveMasterWorkbook(): Promise<OneDriveSyncResult> {
    const context = await requirePermission("settings.manage");
    const companyId = context.activeCompany?.id;
    if (!companyId) throw new Error("Active company is required.");
    const config = await getSavedOneDriveConfig();
    if (!config) throw new Error("Connect the OneDrive master workbook before syncing.");

    const timestamp = new Date().toISOString();
    try {
        const workbookBuffer = await readMasterWorkbook(config);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(workbookBuffer);

        const spreadsheet = await getSpreadsheetData();
        const syncedSheets = writeSupabaseRowsToWorkbook(workbook, spreadsheet.rows, config);
        const output = await workbook.xlsx.writeBuffer() as unknown as ArrayBuffer;
        await writeMasterWorkbook(config, output);

        await persistSyncStatus(config, "success", timestamp, null);
        await logUserAction({
            action: "onedrive_master_file_synced",
            entityType: "onedrive_master_workbook",
            companyId,
            afterData: { provider: config.provider, synced_sheets: syncedSheets, last_sync_at: timestamp } as unknown as Json,
        });
        return { ok: true, status: "success", message: "Master workbook synced successfully.", syncedSheets, lastSyncAt: timestamp };
    } catch (error) {
        const message = error instanceof Error ? error.message : "OneDrive master sync failed.";
        await persistSyncStatus(config, "error", timestamp, message);
        await logUserAction({
            action: "onedrive_master_file_sync_failed",
            entityType: "onedrive_master_workbook",
            companyId,
            afterData: { provider: config.provider, error: message, last_sync_at: timestamp } as unknown as Json,
        });
        return { ok: false, status: "error", message, syncedSheets: [], lastSyncAt: timestamp };
    }
}

function writeSupabaseRowsToWorkbook(workbook: ExcelJS.Workbook, rows: SpreadsheetRow[], config: OneDriveMasterConfig) {
    const sheets: string[] = [];
    writeRows(workbook, config.companySheetName, rows);
    sheets.push(config.companySheetName);
    for (const [officeId, sheetName] of Object.entries(config.officeSheetMap)) {
        const officeRows = rows.filter((row) => row.officeId === officeId);
        writeRows(workbook, sheetName, officeRows);
        sheets.push(sheetName);
    }
    return sheets;
}

function writeRows(workbook: ExcelJS.Workbook, sheetName: string, rows: SpreadsheetRow[]) {
    let sheet = workbook.getWorksheet(sheetName);
    if (!sheet) sheet = workbook.addWorksheet(sheetName);
    sheet.spliceRows(1, sheet.rowCount);
    sheet.columns = syncColumns;
    rows.forEach((row) => sheet.addRow(toSyncRow(row)));
    const summaryStart = Math.max(sheet.rowCount + 2, 3);
    sheet.getCell(`A${summaryStart}`).value = "Total Collected";
    sheet.getCell(`B${summaryStart}`).value = { formula: `SUM(G2:G${Math.max(sheet.rowCount, 2)})` };
    sheet.getCell(`A${summaryStart + 1}`).value = "Total Expenses";
    sheet.getCell(`B${summaryStart + 1}`).value = { formula: `SUM(M2:M${Math.max(sheet.rowCount, 2)})` };
    sheet.getCell(`A${summaryStart + 2}`).value = "Total Landlord Payments";
    sheet.getCell(`B${summaryStart + 2}`).value = { formula: `SUM(O2:O${Math.max(sheet.rowCount, 2)})` };
    sheet.getCell(`A${summaryStart + 3}`).value = "Net Cash";
    sheet.getCell(`B${summaryStart + 3}`).value = { formula: `B${summaryStart}-B${summaryStart + 1}-B${summaryStart + 2}` };
    sheet.getCell(`A${summaryStart + 4}`).value = "Outstanding Balance";
    sheet.getCell(`B${summaryStart + 4}`).value = { formula: `SUM(I2:I${Math.max(sheet.rowCount, 2)})` };
    sheet.getCell(`A${summaryStart + 5}`).value = "Promise Totals";
    sheet.getCell(`B${summaryStart + 5}`).value = { formula: `SUM(J2:J${Math.max(sheet.rowCount, 2)})` };
    styleSheet(sheet);
}

async function readMasterWorkbook(config: OneDriveMasterConfig): Promise<ArrayBuffer> {
    if (config.provider === "local_file") {
        if (!config.localFilePath) throw new Error("Local master workbook path is required.");
        const file = await readFile(config.localFilePath);
        return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
    }
    const token = await getGraphToken();
    if (!config.driveId || !config.itemId) throw new Error("Microsoft Graph drive ID and item ID are required.");
    const response = await fetch(`https://graph.microsoft.com/v1.0/drives/${config.driveId}/items/${config.itemId}/content`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Microsoft Graph download failed: ${response.status} ${await response.text()}`);
    return response.arrayBuffer();
}

async function writeMasterWorkbook(config: OneDriveMasterConfig, buffer: ArrayBuffer) {
    if (config.provider === "local_file") {
        if (!config.localFilePath) throw new Error("Local master workbook path is required.");
        await writeFile(config.localFilePath, Buffer.from(buffer));
        return;
    }
    const token = await getGraphToken();
    if (!config.driveId || !config.itemId) throw new Error("Microsoft Graph drive ID and item ID are required.");
    const response = await fetch(`https://graph.microsoft.com/v1.0/drives/${config.driveId}/items/${config.itemId}/content`, {
        method: "PUT",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
        body: buffer,
    });
    if (!response.ok) throw new Error(`Microsoft Graph upload failed: ${response.status} ${await response.text()}`);
}

async function getGraphToken() {
    const tenantId = process.env.MICROSOFT_TENANT_ID;
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
    if (!tenantId || !clientId || !clientSecret) {
        throw new Error("Missing Microsoft Graph env vars: MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET.");
    }
    const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
    });
    const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
    });
    if (!response.ok) throw new Error(`Microsoft Graph auth failed: ${response.status} ${await response.text()}`);
    const payload = await response.json() as { access_token?: string };
    if (!payload.access_token) throw new Error("Microsoft Graph token response did not include an access token.");
    return payload.access_token;
}

async function persistSyncStatus(config: OneDriveMasterConfig, status: "success" | "error", at: string, error: string | null) {
    const context = await requirePermission("settings.manage");
    const { supabase } = await getScopedSupabase();
    if (!context.activeCompany?.id) return;
    await supabase.from("company_settings").upsert({
        company_id: context.activeCompany.id,
        key: ONEDRIVE_MASTER_SETTING_KEY,
        value: { ...config, lastSyncStatus: status, lastSyncAt: at, lastSyncError: error } as unknown as Json,
        is_sensitive: false,
        updated_at: new Date().toISOString(),
    }, { onConflict: "company_id,key" });
}

function toSyncRow(row: SpreadsheetRow) {
    const output: Partial<Record<keyof SpreadsheetRow, string | number | null>> = {};
    for (const column of syncColumns) {
        const value = row[column.key];
        output[column.key] = value === undefined ? null : value;
    }
    return output;
}

function styleSheet(sheet: ExcelJS.Worksheet) {
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: syncColumns.length } };
    sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        row.eachCell((cell) => {
            if (typeof cell.value === "number") cell.numFmt = '#,##0';
        });
    });
}

function scrubConfig(config: OneDriveMasterConfig) {
    return {
        provider: config.provider,
        driveId: config.driveId ? "[configured]" : null,
        itemId: config.itemId ? "[configured]" : null,
        webUrl: config.webUrl ?? null,
        localFilePath: config.localFilePath ?? null,
        companySheetName: config.companySheetName,
        officeSheetMap: config.officeSheetMap,
        lastSyncStatus: config.lastSyncStatus,
    };
}
