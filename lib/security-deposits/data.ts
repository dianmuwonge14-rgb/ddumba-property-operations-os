import "server-only";

import { requireAuth, canAccessOffice } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { SecurityDepositPageData, SecurityDepositRegisterRow, SecurityDepositSummary } from "./types";

type DynamicDb = {
    from: (table: string) => any;
};

function amount(value: unknown) {
    const numeric = Number(value ?? 0);
    return Number.isFinite(numeric) ? numeric : 0;
}

function emptySummary(): SecurityDepositSummary {
    return {
        totalAvailable: 0,
        totalHeld: 0,
        totalPendingSettlement: 0,
        totalRecords: 0,
        totalRefunded: 0,
        totalRetained: 0,
        totalShortfall: 0,
        totalUsedByCompany: 0,
    };
}

export async function getSecurityDepositsPageData(): Promise<SecurityDepositPageData> {
    const context = await requireAuth();
    const companyId = context.activeCompany?.id;
    if (!companyId) {
        return { activeOfficeId: null, deposits: [], isAdmin: false, summary: emptySummary(), warnings: ["Active company is required."] };
    }
    const canView =
        context.isCompanyAdmin ||
        context.permissions.includes("collections.manage") ||
        context.permissions.includes("collections.payment.post") ||
        context.permissions.includes("reports.read");
    if (!canView) {
        return { activeOfficeId: context.activeOffice?.id ?? null, deposits: [], isAdmin: false, summary: emptySummary(), warnings: ["You do not have permission to view security deposits."] };
    }

    const supabase = createSupabaseAdminClient() as unknown as DynamicDb;
    const shouldScopeOffice = !(context.canAccessAllOffices || context.isCompanyAdmin);
    const officeIds = context.offices.map((office) => office.id);
    let query = supabase
        .from("security_deposit_register")
        .select(`
            *,
            tenant:tenants(full_name, phone),
            room:rooms(room_number),
            landlord:landlords(full_name),
            office:offices(office_name, name)
        `)
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(250);

    if (shouldScopeOffice) {
        if (!officeIds.length) {
            return { activeOfficeId: context.activeOffice?.id ?? null, deposits: [], isAdmin: false, summary: emptySummary(), warnings: ["No office is assigned to this account."] };
        }
        query = query.in("office_id", officeIds);
    }

    const { data, error } = await query;
    const warnings = error ? [`Security deposits: ${error.message}`] : [];
    const rows = ((data ?? []) as SecurityDepositRegisterRow[]).filter((row) => {
        if (!shouldScopeOffice) return true;
        return canAccessOffice(context, row.office_id);
    });

    const summary = rows.reduce<SecurityDepositSummary>((next, row) => {
        next.totalRecords += 1;
        next.totalHeld += amount(row.liability_balance);
        next.totalAvailable += amount(row.cash_available);
        next.totalUsedByCompany += Math.max(0, amount(row.amount_used_by_company) - amount(row.amount_restored_by_company));
        next.totalRefunded += amount(row.amount_refunded);
        next.totalRetained += amount(row.amount_retained) + amount(row.amount_applied_to_charges);
        next.totalShortfall += amount(row.company_shortfall);
        if (String(row.status).includes("pending")) next.totalPendingSettlement += amount(row.liability_balance);
        return next;
    }, emptySummary());

    return {
        activeOfficeId: context.activeOffice?.id ?? null,
        deposits: rows,
        isAdmin: context.isCompanyAdmin || context.canAccessAllOffices,
        summary,
        warnings,
    };
}
