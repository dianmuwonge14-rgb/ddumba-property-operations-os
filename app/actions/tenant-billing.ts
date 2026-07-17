"use server";

import { revalidatePath } from "next/cache";
import { logUserAction } from "@/lib/auth/audit";
import { hasPermission, requirePermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { billingDayLabel, clampBillingDay } from "@/lib/tenants/billing-cycle";

type SetBillingDateInput = {
    billingDay: number;
    leaseId?: string | null;
    roomId?: string | null;
    tenantId: string;
};

type DynamicDb = {
    from: (table: string) => any;
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

function revalidateBillingSurfaces() {
    for (const path of [
        "/office",
        "/office/payments",
        "/office/admin/payments",
        "/office/collector/payments",
        "/office/collections",
        "/office/defaulters",
        "/office/admin/defaulters",
        "/office/properties",
        "/office/landlords",
        "/office/dashboard",
        "/office/admin",
    ]) {
        revalidatePath(path);
    }
}

export async function setTenantBillingDate(input: SetBillingDateInput) {
    const context = await requirePermission("collections.manage");
    if (!context.activeCompany?.id) throw new Error("Active company is required.");
    if (!hasPermission(context, "collections.manage")) {
        throw new Error("You do not have permission to change tenant billing dates.");
    }

    const billingDay = clampBillingDay(input.billingDay);
    if (billingDay < 1 || billingDay > 31) {
        throw new Error("Billing day must be between 1 and 31.");
    }

    const supabase = context.isCompanyAdmin ? createSupabaseAdminClient() : await createSupabaseServerClient();
    const db = supabase as unknown as DynamicDb;
    const { data: tenant, error: tenantError } = await db
        .from("tenants")
        .select("id, company_id, office_id, room_id, full_name, billing_day")
        .eq("id", input.tenantId)
        .eq("company_id", context.activeCompany.id)
        .maybeSingle();

    if (tenantError) throw new Error(tenantError.message);
    if (!tenant) throw new Error("Tenant could not be found.");
    const tenantOfficeId = tenant.office_id ?? context.activeOffice?.id ?? null;
    if (!context.isCompanyAdmin && tenantOfficeId && tenantOfficeId !== context.activeOffice?.id) {
        throw new Error("This tenant belongs to another office.");
    }

    const now = new Date().toISOString();
    const writes: Array<Promise<{ error?: { message?: string } | null }>> = [
        db
            .from("tenants")
            .update({ billing_day: billingDay, updated_at: now })
            .eq("id", input.tenantId)
            .eq("company_id", context.activeCompany.id),
    ];

    if (input.leaseId) {
        writes.push(db
            .from("leases")
            .update({ billing_day: billingDay, updated_at: now })
            .eq("id", input.leaseId)
            .eq("company_id", context.activeCompany.id));
    } else {
        writes.push(db
            .from("leases")
            .update({ billing_day: billingDay, updated_at: now })
            .eq("tenant_id", input.tenantId)
            .eq("company_id", context.activeCompany.id)
            .eq("status", "active"));
    }

    const results = await Promise.all(writes);
    const error = results.find((result) => result.error)?.error;
    if (error) {
        if (/billing_day|column .*billing_day|schema cache|Could not find/i.test(error.message ?? "")) {
            throw new Error("Billing date storage is not ready. Apply migration 0209_tenant_monthly_billing_engine.sql.");
        }
        throw new Error(error.message ?? "Billing date update failed.");
    }

    await logUserAction({
        action: "tenant_billing_day_updated",
        entityType: "tenant",
        entityId: input.tenantId,
        companyId: context.activeCompany.id,
        officeId: tenantOfficeId,
        afterData: {
            billingDay,
            label: billingDayLabel(billingDay),
            leaseId: input.leaseId ?? null,
            roomId: input.roomId ?? tenant.room_id ?? null,
            tenantName: tenant.full_name ?? "Tenant",
        },
    });

    revalidateBillingSurfaces();
    return {
        billingDay,
        message: `Billing date updated successfully. Future rent charges will follow the ${billingDayLabel(billingDay)}.`,
    };
}

export async function runTenantBillingRepair(input: { businessDate?: string; officeId?: string | null } = {}) {
    const context = await requirePermission("collections.manage");
    if (!context.isCompanyAdmin) throw new Error("Only Admin can run company-wide billing repair.");
    if (!context.activeCompany?.id) throw new Error("Active company is required.");
    const businessDate = input.businessDate && /^\d{4}-\d{2}-\d{2}$/.test(input.businessDate)
        ? input.businessDate
        : new Intl.DateTimeFormat("en-CA", {
            day: "2-digit",
            month: "2-digit",
            timeZone: "Africa/Kampala",
            year: "numeric",
        }).format(new Date());

    const db = createSupabaseAdminClient() as unknown as DynamicDb;
    const { data, error } = await db.rpc("run_monthly_rent_rollover", {
        p_business_date: businessDate,
        p_company_id: context.activeCompany.id,
        p_office_id: input.officeId ?? null,
        p_run_type: "manual_billing_repair",
        p_triggered_by: context.profile?.id ?? null,
    });

    if (error) throw new Error(error.message ?? "Tenant billing repair failed.");

    await logUserAction({
        action: "tenant_billing_repair_run",
        entityType: "monthly_rollover_runs",
        companyId: context.activeCompany.id,
        officeId: input.officeId ?? null,
        afterData: JSON.parse(JSON.stringify(data ?? null)),
    });
    revalidateBillingSurfaces();
    return data;
}
