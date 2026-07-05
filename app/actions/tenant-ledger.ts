"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/permissions";
import { logUserAction } from "@/lib/auth/audit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type RolloverInput = {
    businessDate?: string;
    officeId?: string | null;
};

function kampalaBusinessDate() {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Africa/Kampala",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(new Date());
}

function normalizeDate(value: string | null | undefined) {
    return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function monthStart(value: string) {
    return `${value.slice(0, 7)}-01`;
}

function revalidateRolloverSurfaces() {
    for (const path of [
        "/office",
        "/office/admin",
        "/office/collections",
        "/office/payments",
        "/office/admin/payments",
        "/office/defaulters",
        "/office/admin/defaulters",
        "/office/dashboard",
        "/office/spreadsheet",
        "/office/landlords",
        "/office/landlord-payments",
        "/office/admin/statements",
    ]) {
        revalidatePath(path);
    }
}

export async function runMonthlyRentRollover(input: RolloverInput = {}) {
    const context = await requirePermission("collections.manage");
    if (!context.isCompanyAdmin || context.isOfficeMode) {
        throw new Error("Only Admin can run monthly rent rollover.");
    }
    if (!context.activeCompany?.id) throw new Error("Active company is required.");

    const businessDate = normalizeDate(input.businessDate) ?? kampalaBusinessDate();
    const rentMonth = monthStart(businessDate);
    const db = createSupabaseAdminClient() as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
    };

    const { data, error } = await db.rpc("run_monthly_rent_rollover", {
        p_business_date: businessDate,
        p_company_id: context.activeCompany.id,
        p_office_id: input.officeId ?? null,
        p_run_type: "manual_admin",
        p_triggered_by: context.profile?.id ?? null,
    });

    if (error) {
        if (/schema cache|function .* does not exist|Could not find/i.test(error.message ?? "")) {
            throw new Error("Monthly rollover engine is not initialized. Apply migration 0187_monthly_rent_rollover_engine.sql to live Supabase first.");
        }
        throw new Error(error.message ?? "Monthly rent rollover failed.");
    }

    await logUserAction({
        action: "monthly_rent_rollover_run",
        entityType: "monthly_rollover_runs",
        companyId: context.activeCompany.id,
        officeId: input.officeId ?? null,
        afterData: {
            businessDate,
            rentMonth,
            result: JSON.parse(JSON.stringify(data ?? null)),
        },
    });

    revalidateRolloverSurfaces();
    return data;
}
