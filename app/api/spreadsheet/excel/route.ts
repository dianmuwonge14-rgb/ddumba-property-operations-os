import { logUserAction } from "@/lib/auth/audit";
import { getSpreadsheetData } from "@/lib/spreadsheet-reporting/data";
import { createSpreadsheetWorkbook, workbookFileName, type ExcelWorkbookOptions } from "@/lib/spreadsheet-reporting/excel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const range = normalizeRange(url.searchParams.get("range"));
        const requestedScope = normalizeScope(url.searchParams.get("scope"));
        const officeId = url.searchParams.get("officeId");

        const data = await getSpreadsheetData();
        const scope: ExcelWorkbookOptions["scope"] = requestedScope === "company" ? "company" : "office";
        if (scope === "company" && !data.canAccessAllOffices) {
            return Response.json({ error: "Company workbook requires company-wide access." }, { status: 403 });
        }

        const allowedOfficeId = data.canAccessAllOffices
            ? officeId
            : data.activeOffice?.id ?? null;
        if (scope === "office" && !allowedOfficeId) {
            return Response.json({ error: "Office workbook requires an active office." }, { status: 400 });
        }
        if (scope === "office" && officeId && !data.canAccessAllOffices && officeId !== data.activeOffice?.id) {
            return Response.json({ error: "You can only download your active office workbook." }, { status: 403 });
        }

        const options: ExcelWorkbookOptions = {
            range,
            scope,
            officeId: scope === "office" ? allowedOfficeId : null,
        };
        const buffer = await createSpreadsheetWorkbook(data, options);
        const fileName = workbookFileName(data, options);

        await logUserAction({
            action: "spreadsheet_xlsx_downloaded",
            entityType: "spreadsheet_workbook",
            companyId: data.company?.id,
            officeId: options.officeId ?? null,
            afterData: {
                range,
                scope,
                office_id: options.officeId,
                file_name: fileName,
                format: "xlsx",
            },
        });

        return new Response(buffer, {
            headers: {
                "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "Content-Disposition": `attachment; filename="${fileName}"`,
                "Cache-Control": "no-store",
            },
        });
    } catch (error) {
        return Response.json({
            error: error instanceof Error ? error.message : "Could not generate Excel workbook.",
        }, { status: 500 });
    }
}

function normalizeRange(value: string | null): ExcelWorkbookOptions["range"] {
    if (value === "today" || value === "month" || value === "all") return value;
    return "today";
}

function normalizeScope(value: string | null): ExcelWorkbookOptions["scope"] {
    return value === "company" ? "company" : "office";
}
