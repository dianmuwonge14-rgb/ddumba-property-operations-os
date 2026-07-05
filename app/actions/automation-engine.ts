"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/permissions";
import { executeAutomationEngine, retryFailedNotificationDispatches } from "@/lib/automation-centre/engine";

export async function runAutomationEngineAction() {
    const context = await requirePermission("reports.manage");
    const result = await executeAutomationEngine(context, "manual");
    revalidatePath("/office/automation");
    return result;
}

export async function retryFailedNotificationsAction() {
    const context = await requirePermission("reports.manage");
    const result = await retryFailedNotificationDispatches(context);
    revalidatePath("/office/automation");
    return result;
}
