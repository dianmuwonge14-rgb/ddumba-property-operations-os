import ExcelJS from "exceljs";
import type { SpreadsheetData, SpreadsheetRow } from "./types";

export type ExcelWorkbookOptions = {
    range: "today" | "month" | "all";
    scope: "company" | "office";
    officeId?: string | null;
};

const TIME_ZONE = "Africa/Kampala";

const workbookColumns: Array<{ header: string; key: keyof SpreadsheetRow; width: number }> = [
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
    { header: "Settlement Amount", key: "settlementAmount", width: 20 },
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

const sheetSourceMap: Array<{ name: string; source: SpreadsheetRow["source"] }> = [
    { name: "Collections", source: "collection" },
    { name: "Promises", source: "promise" },
    { name: "Expenses", source: "expense" },
    { name: "Landlord Payments", source: "landlord_payment" },
    { name: "Vacated Tenants", source: "vacated_debt" },
    { name: "Bad Debt Recovery", source: "vacated_debt" },
    { name: "Landlord Deductions", source: "landlord_deduction" },
    { name: "Tenant Move-Out History", source: "vacated_debt" },
    { name: "Attendance", source: "attendance" },
    { name: "Daily Reports", source: "daily_report" },
];

export function filterWorkbookRows(data: SpreadsheetData, options: ExcelWorkbookOptions) {
    const today = todayDate();
    const month = today.slice(0, 7);
    return data.rows.filter((row) => {
        const rowDay = row.date || dateOnly(row.dateTime);
        if (options.officeId && row.officeId !== options.officeId) return false;
        if (options.range === "today" && rowDay !== today) return false;
        if (options.range === "month" && !rowDay.startsWith(month)) return false;
        return true;
    });
}

export async function createSpreadsheetWorkbook(data: SpreadsheetData, options: ExcelWorkbookOptions) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Ddumba Property Operations OS";
    workbook.lastModifiedBy = "Ddumba Property Operations OS";
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.subject = "Live Supabase operational workbook";
    workbook.title = options.scope === "company" ? "Ddumba Company Consolidated Workbook" : "Ddumba Office Workbook";
    workbook.company = data.company?.name ?? "Ddumba Property Operations";

    const rows = filterWorkbookRows(data, options);
    for (const sheet of sheetSourceMap) {
        addDataSheet(workbook, sheet.name, rows.filter((row) => row.source === sheet.source));
    }
    addOfficeSummarySheet(workbook, rows);
    addCompanySummarySheet(workbook, rows, options.scope);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
}

export function workbookFileName(data: SpreadsheetData, options: ExcelWorkbookOptions) {
    const scope = options.scope === "company"
        ? "company"
        : slug(data.offices.find((office) => office.id === options.officeId)?.office_name ?? data.activeOffice?.office_name ?? "office");
    return `ddumba-${scope}-${options.range}-workbook.xlsx`;
}

function addDataSheet(workbook: ExcelJS.Workbook, name: string, rows: SpreadsheetRow[]) {
    const sheet = workbook.addWorksheet(name, {
        views: [{ state: "frozen", ySplit: 1 }],
        properties: { defaultRowHeight: 20 },
    });
    sheet.columns = workbookColumns;
    for (const row of rows) {
        sheet.addRow(toSheetRow(row));
    }
    styleSheet(sheet);
}

function addOfficeSummarySheet(workbook: ExcelJS.Workbook, rows: SpreadsheetRow[]) {
    const sheet = workbook.addWorksheet("Office Summary", {
        views: [{ state: "frozen", ySplit: 1 }],
    });
    sheet.columns = [
        { header: "Office", key: "office", width: 28 },
        { header: "Total Collected", key: "collected", width: 18 },
        { header: "Total Expenses", key: "expenses", width: 18 },
        { header: "Total Landlord Payments", key: "landlords", width: 24 },
        { header: "Net Cash", key: "net", width: 18 },
        { header: "Outstanding Balance", key: "balance", width: 22 },
        { header: "Promise Totals", key: "promises", width: 18 },
    ];
    const offices = [...new Set(rows.map((row) => row.officeName).filter(Boolean))].sort();
    offices.forEach((office, index) => {
        const rowNumber = index + 2;
        sheet.addRow({
            office,
            collected: { formula: `SUMIF(Collections!B:B,A${rowNumber},Collections!G:G)` },
            expenses: { formula: `SUMIF(Expenses!B:B,A${rowNumber},Expenses!M:M)` },
            landlords: { formula: `SUMIF('Landlord Payments'!B:B,A${rowNumber},'Landlord Payments'!O:O)` },
            net: { formula: `B${rowNumber}-C${rowNumber}-D${rowNumber}` },
            balance: { formula: `SUMIF(Collections!B:B,A${rowNumber},Collections!I:I)` },
            promises: { formula: `SUMIF(Promises!B:B,A${rowNumber},Promises!J:J)` },
        });
    });
    styleSheet(sheet);
}

function addCompanySummarySheet(workbook: ExcelJS.Workbook, rows: SpreadsheetRow[], scope: "company" | "office") {
    const sheet = workbook.addWorksheet("Company Summary");
    sheet.columns = [
        { header: "Metric", key: "metric", width: 30 },
        { header: "Formula / Value", key: "value", width: 24 },
        { header: "Explanation", key: "explanation", width: 54 },
    ];
    const collectionEnd = Math.max(rows.filter((row) => row.source === "collection").length + 1, 2);
    const promiseEnd = Math.max(rows.filter((row) => row.source === "promise").length + 1, 2);
    const expenseEnd = Math.max(rows.filter((row) => row.source === "expense").length + 1, 2);
    const landlordEnd = Math.max(rows.filter((row) => row.source === "landlord_payment").length + 1, 2);
    sheet.addRows([
        { metric: scope === "company" ? "Company Workbook" : "Office Workbook", value: workbook.title, explanation: "Generated from live Supabase data at download time." },
        { metric: "Total Collected", value: { formula: `SUM(Collections!G2:G${collectionEnd})` }, explanation: "Sum of Amount Paid in Collections sheet." },
        { metric: "Total Expenses", value: { formula: `SUM(Expenses!M2:M${expenseEnd})` }, explanation: "Sum of Expense column in Expenses sheet." },
        { metric: "Total Landlord Payments", value: { formula: `SUM('Landlord Payments'!O2:O${landlordEnd})` }, explanation: "Sum of Landlord Payment column." },
        { metric: "Net Cash", value: { formula: "B2-B3-B4" }, explanation: "Collections minus expenses minus landlord payments." },
        { metric: "Outstanding Balance", value: { formula: `SUM(Collections!I2:I${collectionEnd})` }, explanation: "Sum of Balance After in Collections sheet." },
        { metric: "Promise Totals", value: { formula: `SUM(Promises!J2:J${promiseEnd})` }, explanation: "Sum of Promise Amount in Promises sheet." },
        { metric: "Rows Included", value: rows.length, explanation: "Total live rows included across workbook sheets." },
    ]);
    styleSheet(sheet);
}

function toSheetRow(row: SpreadsheetRow) {
    const output: Partial<Record<keyof SpreadsheetRow, string | number | null>> = {};
    for (const column of workbookColumns) {
        const value = row[column.key];
        output[column.key] = value === undefined ? null : value;
    }
    return output;
}

function styleSheet(sheet: ExcelJS.Worksheet) {
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
    sheet.getRow(1).alignment = { vertical: "middle" };
    sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: sheet.columnCount },
    };
    sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        row.alignment = { vertical: "top", wrapText: true };
        row.eachCell((cell) => {
            cell.border = {
                bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
            };
            if (typeof cell.value === "number") {
                cell.numFmt = '#,##0';
            }
        });
    });
}

function todayDate() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date());
}

function dateOnly(value: string) {
    return value ? value.slice(0, 10) : "";
}

function slug(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "office";
}
