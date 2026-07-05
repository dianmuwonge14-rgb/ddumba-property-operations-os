"use server";

import { logUserAction } from "@/lib/auth/audit";
import { requirePermission } from "@/lib/auth/permissions";

export async function logSpreadsheetExport(input: { scope: "company" | "office"; rowCount: number; filters: Record<string, string> }) {
    const context = await requirePermission("reports.view");

    await logUserAction({
        action: "spreadsheet_exported",
        entityType: "spreadsheet_report",
        entityId: `${input.scope}-${Date.now()}`,
        companyId: context.activeCompany?.id,
        officeId: input.scope === "office" ? context.activeOffice?.id ?? null : null,
        afterData: {
            scope: input.scope,
            row_count: input.rowCount,
            filters: input.filters,
        },
    });
}

export async function logSpreadsheetAccess(input: {
    action: "spreadsheet_opened" | "spreadsheet_closed" | "spreadsheet_exported_pdf";
    scope: "company" | "office";
    rowCount: number;
    workbookTabs?: string[];
    filters?: Record<string, string>;
}) {
    const context = await requirePermission("reports.view");

    await logUserAction({
        action: input.action,
        entityType: "spreadsheet_workbook",
        entityId: `${input.scope}-${Date.now()}`,
        companyId: context.activeCompany?.id,
        officeId: input.scope === "office" ? context.activeOffice?.id ?? null : null,
        afterData: {
            scope: input.scope,
            row_count: input.rowCount,
            workbook_tabs: input.workbookTabs ?? [],
            filters: input.filters ?? {},
        },
    });
}
