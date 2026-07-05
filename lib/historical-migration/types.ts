export type MigrationEntity =
    | "offices"
    | "properties"
    | "rooms"
    | "tenants"
    | "landlords"
    | "collections"
    | "promises"
    | "expenses"
    | "landlord_payments"
    | "attendance"
    | "daily_reports"
    | "unknown";

export type SheetDiscovery = {
    name: string;
    rowCount: number;
    columnCount: number;
    headerRow: number | null;
    headers: string[];
    inferredEntities: MigrationEntity[];
    importableRows: number;
    missingColumns: string[];
    unmappedFields: string[];
};

export type FieldMapping = {
    sheet: string;
    sourceColumn: string;
    targetEntity: MigrationEntity;
    targetField: string;
    confidence: number;
};

export type MigrationDuplicateSummary = {
    tenantCodes: number;
    roomNumbers: number;
    phoneNumbers: number;
    nationalIds: number;
    propertyRoomPairs: number;
};

export type HistoricalMigrationDryRunReport = {
    generatedAt: string;
    workbookPath: string | null;
    sheets: SheetDiscovery[];
    mappings: FieldMapping[];
    totals: {
        rowsDiscovered: number;
        rowsImportable: number;
        estimatedOffices: number;
        estimatedProperties: number;
        estimatedRooms: number;
        estimatedTenants: number;
        estimatedLandlords: number;
        estimatedCollections: number;
        estimatedPromises: number;
        estimatedExpenses: number;
        estimatedLandlordPayments: number;
        estimatedAttendance: number;
        estimatedDailyReports: number;
        duplicatesMergedEstimate: number;
        errors: number;
    };
    duplicates: MigrationDuplicateSummary;
    errors: Array<{ sheet: string; row?: number; message: string }>;
    warnings: string[];
};
