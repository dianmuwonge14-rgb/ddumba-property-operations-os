import LiveSpreadsheetCentre from "@/components/office/spreadsheet/LiveSpreadsheetCentre";
import { getSpreadsheetData } from "@/lib/spreadsheet-reporting/data";

export default async function SpreadsheetPage() {
    const data = await getSpreadsheetData({ maxRowsPerSource: 10, includeAuditStatus: false }).catch((error) => ({
        company: null,
        activeOffice: null,
        canAccessAllOffices: false,
        loadedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Spreadsheet data failed to load.",
        rows: [],
        sourceCounts: { collections: 0, promises: 0, expenses: 0, landlordPayments: 0, attendance: 0, dailyReports: 0, vacatedDebts: 0, landlordDeductions: 0 },
        offices: [],
        collectors: [],
        properties: [],
        summary: { collections: 0, promises: 0, expenses: 0, landlordPayments: 0, attendance: 0, dailyReports: 0, vacatedDebts: 0, landlordDeductions: 0, balanceAfter: 0 },
    }));

    return <LiveSpreadsheetCentre data={data} />;
}
