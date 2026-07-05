"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/permissions";
import { defaultOneDriveConfig, saveOneDriveConfig } from "@/lib/onedrive-master/sync";
import type { OneDriveMasterConfig } from "@/lib/onedrive-master/types";

export async function connectOneDriveMasterFile(formData: FormData) {
    const context = await requirePermission("settings.manage");
    const defaults = defaultOneDriveConfig(context.offices);
    const provider = String(formData.get("provider") ?? "local_file") === "microsoft_graph" ? "microsoft_graph" : "local_file";
    const officeSheetMap: Record<string, string> = {};
    for (const office of context.offices) {
        officeSheetMap[office.id] = String(formData.get(`officeSheet:${office.id}`) ?? defaults.officeSheetMap[office.id] ?? "");
    }

    const config: OneDriveMasterConfig = {
        provider,
        driveId: String(formData.get("driveId") ?? "").trim() || undefined,
        itemId: String(formData.get("itemId") ?? "").trim() || undefined,
        webUrl: String(formData.get("webUrl") ?? "").trim() || undefined,
        localFilePath: String(formData.get("localFilePath") ?? "").trim() || undefined,
        companySheetName: String(formData.get("companySheetName") ?? "").trim() || defaults.companySheetName,
        officeSheetMap,
        lastSyncStatus: "never",
    };

    await saveOneDriveConfig(config);
    revalidatePath("/office/admin");
}

export async function syncOneDriveMasterFile() {
    await requirePermission("settings.manage");
    const result = {
        ok: false,
        message: "OneDrive/local workbook sync is disabled. Supabase is the live source of truth; use approved import tools only.",
        status: "error",
        syncedAt: new Date().toISOString(),
        error: "OneDrive/local workbook sync is disabled. Supabase is the live source of truth; use approved import tools only.",
        rowsWritten: 0,
        sheetsUpdated: [],
    };
    revalidatePath("/office/admin");
    revalidatePath("/office/spreadsheet");
    return result;
}
