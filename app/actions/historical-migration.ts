"use server";

import { dryRunHistoricalWorkbookMigration } from "@/lib/historical-migration/analyzer";

export async function runHistoricalMigrationDryRun() {
    return dryRunHistoricalWorkbookMigration();
}
