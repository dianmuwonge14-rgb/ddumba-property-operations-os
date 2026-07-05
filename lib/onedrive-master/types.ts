export type OneDriveMasterConfig = {
    provider: "microsoft_graph" | "local_file";
    driveId?: string;
    itemId?: string;
    webUrl?: string;
    localFilePath?: string;
    companySheetName: string;
    officeSheetMap: Record<string, string>;
    connectedAt?: string;
    lastSyncAt?: string;
    lastSyncStatus?: "never" | "success" | "error";
    lastSyncError?: string | null;
};

export type OneDriveSyncResult = {
    ok: boolean;
    status: "success" | "error";
    message: string;
    syncedSheets: string[];
    lastSyncAt: string;
};
