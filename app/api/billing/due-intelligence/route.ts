import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/permissions";
import { getScopedSupabase } from "@/lib/auth/query";
import { isFinanciallyEffectiveCollection, uniqueFinanciallyEffectiveCollections } from "@/lib/collections/validity";
import { calculateTenantMonthlyLedgerPosition } from "@/lib/financial/monthly-ledger";
import { billingPeriodForDate, clampBillingDay } from "@/lib/tenants/billing-cycle";

type DynamicDb = {
    from: (table: string) => any;
};

function businessDate() {
    return new Intl.DateTimeFormat("en-CA", {
        day: "2-digit",
        month: "2-digit",
        timeZone: "Africa/Kampala",
        year: "numeric",
    }).format(new Date());
}

function daysBetween(left: string, right: string) {
    const leftTime = new Date(`${left}T00:00:00Z`).getTime();
    const rightTime = new Date(`${right}T00:00:00Z`).getTime();
    return Math.max(0, Math.round((rightTime - leftTime) / 86_400_000));
}

function bucket(days: number) {
    if (days <= 0) return "Due today";
    if (days <= 7) return "1-7 days overdue";
    if (days <= 30) return "8-30 days overdue";
    return "Over 30 days overdue";
}

async function fetchInChunks(
    buildQuery: (ids: string[]) => PromiseLike<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }>,
    ids: string[],
) {
    const rows: Array<Record<string, unknown>> = [];
    for (let index = 0; index < ids.length; index += 150) {
        const chunk = ids.slice(index, index + 150);
        const result = await buildQuery(chunk);
        if (result.error) return { data: rows, error: result.error };
        rows.push(...(result.data ?? []));
    }
    return { data: rows, error: null };
}

export async function GET() {
    try {
        const context = await requirePermission("collections.read");
        const { supabase } = await getScopedSupabase();
        const companyId = context.activeCompany?.id;
        const officeId = context.activeOffice?.id;
        if (!companyId || !officeId) return NextResponse.json({ items: [] }, { headers: { "Cache-Control": "no-store" } });

        const searchAllOffices = context.canAccessAllOffices || context.isCompanyAdmin;
        let tenantQuery = (supabase as unknown as DynamicDb)
            .from("tenants")
            .select("id, full_name, phone, office_id, room_id, monthly_rent, status, billing_day, created_at")
            .eq("company_id", companyId)
            .eq("status", "active")
            .order("full_name", { ascending: true, nullsFirst: false })
            .limit(1500);

        if (!searchAllOffices) tenantQuery = tenantQuery.eq("office_id", officeId);
        const { data: tenants, error } = await tenantQuery;
        if (error) throw new Error(error.message);
        const tenantRows = tenants ?? [];
        const tenantIds = tenantRows.map((tenant: Record<string, unknown>) => String(tenant.id));
        const roomIds = tenantRows.map((tenant: Record<string, unknown>) => String(tenant.room_id ?? "")).filter(Boolean);
        const officeIds = [...new Set([officeId, ...tenantRows.map((tenant: Record<string, unknown>) => String(tenant.office_id ?? "")).filter(Boolean)])];

        const [leasesResult, roomsResult, officesResult, collectionsResult, rentMonthsResult, legacyArrearsResult, allocationsResult] = await Promise.all([
            tenantIds.length
                ? fetchInChunks((ids) => (supabase as unknown as DynamicDb).from("leases").select("id, tenant_id, room_id, start_date, billing_day, monthly_rent, status").eq("company_id", companyId).eq("status", "active").in("tenant_id", ids), tenantIds)
                : { data: [], error: null },
            roomIds.length
                ? fetchInChunks((ids) => (supabase as unknown as DynamicDb).from("rooms").select("id, room_number, office_id, monthly_rent, status").eq("company_id", companyId).in("id", ids), roomIds)
                : { data: [], error: null },
            officeIds.length
                ? (supabase as unknown as DynamicDb).from("offices").select("id, office_name, name").eq("company_id", companyId).in("id", officeIds)
                : { data: [], error: null },
            tenantIds.length
                ? fetchInChunks((ids) => (supabase as unknown as DynamicDb).from("collections").select("*").eq("company_id", companyId).in("tenant_id", ids), tenantIds)
                : { data: [], error: null },
            tenantIds.length
                ? fetchInChunks((ids) => (supabase as unknown as DynamicDb).from("tenant_rent_months").select("tenant_id, rent_month, due_date, coverage_start, coverage_end, rent_amount, amount_paid, outstanding_amount, status, created_at, source").eq("company_id", companyId).in("tenant_id", ids), tenantIds)
                : { data: [], error: null },
            tenantIds.length
                ? fetchInChunks((ids) => (supabase as unknown as DynamicDb).from("tenant_pre_system_arrears_periods").select("tenant_id, allocation_month, legacy_arrears_amount, payments_applied, remaining_amount, status").eq("company_id", companyId).in("tenant_id", ids), tenantIds)
                : { data: [], error: null },
            tenantIds.length
                ? fetchInChunks((ids) => (supabase as unknown as DynamicDb).from("tenant_rent_allocations").select("tenant_id, payment_id, allocation_month, allocation_type, amount_allocated, consumed_by_balance_reconciliation, allocation_source, is_historical_credit, coverage_start, coverage_end, coverage_index").eq("company_id", companyId).in("tenant_id", ids), tenantIds)
                : { data: [], error: null },
        ]);
        if (leasesResult.error) throw new Error(leasesResult.error.message);
        if (roomsResult.error) throw new Error(roomsResult.error.message);
        if (officesResult.error) throw new Error(officesResult.error.message);
        if (collectionsResult.error) throw new Error(collectionsResult.error.message);
        if (rentMonthsResult.error && !/does not exist|schema cache|Could not find/i.test(rentMonthsResult.error.message ?? "")) throw new Error(rentMonthsResult.error.message);
        if (legacyArrearsResult.error && !/does not exist|schema cache|Could not find/i.test(legacyArrearsResult.error.message ?? "")) throw new Error(legacyArrearsResult.error.message);
        if (allocationsResult.error && !/does not exist|schema cache|Could not find/i.test(allocationsResult.error.message ?? "")) throw new Error(allocationsResult.error.message);

        const leaseByTenant = new Map<string, Record<string, unknown>>((leasesResult.data ?? []).map((lease: Record<string, unknown>) => [String(lease.tenant_id), lease]));
        const roomById = new Map<string, Record<string, unknown>>((roomsResult.data ?? []).map((room: Record<string, unknown>) => [String(room.id), room]));
        const officeById = new Map<string, Record<string, unknown>>((officesResult.data ?? []).map((office: Record<string, unknown>) => [String(office.id), office]));
        const collectionsByTenant = new Map<string, Array<Record<string, unknown>>>();
        for (const collection of uniqueFinanciallyEffectiveCollections((collectionsResult.data ?? []) as Array<Record<string, unknown>>).filter(isFinanciallyEffectiveCollection)) {
            const tenantId = String(collection.tenant_id ?? "");
            if (!tenantId) continue;
            collectionsByTenant.set(tenantId, [...(collectionsByTenant.get(tenantId) ?? []), collection]);
        }
        const rentMonthsByTenant = new Map<string, Array<Record<string, unknown>>>();
        for (const rentMonth of (rentMonthsResult.data ?? []) as Array<Record<string, unknown>>) {
            const tenantId = String(rentMonth.tenant_id ?? "");
            if (!tenantId) continue;
            rentMonthsByTenant.set(tenantId, [...(rentMonthsByTenant.get(tenantId) ?? []), rentMonth]);
        }
        const legacyArrearsByTenant = new Map<string, Array<Record<string, unknown>>>();
        for (const legacyRow of (legacyArrearsResult.data ?? []) as Array<Record<string, unknown>>) {
            const tenantId = String(legacyRow.tenant_id ?? "");
            if (!tenantId) continue;
            legacyArrearsByTenant.set(tenantId, [...(legacyArrearsByTenant.get(tenantId) ?? []), legacyRow]);
        }
        const allocationsByTenant = new Map<string, Array<Record<string, unknown>>>();
        for (const allocation of (allocationsResult.data ?? []) as Array<Record<string, unknown>>) {
            const tenantId = String(allocation.tenant_id ?? "");
            if (!tenantId) continue;
            allocationsByTenant.set(tenantId, [...(allocationsByTenant.get(tenantId) ?? []), allocation]);
        }
        const today = businessDate();
        const selectedMonth = `${today.slice(0, 7)}-01`;

        const items = tenantRows
            .map((tenant: Record<string, unknown>) => {
                const lease = leaseByTenant.get(String(tenant.id));
                const room = roomById.get(String(tenant.room_id ?? ""));
                const office = officeById.get(String(tenant.office_id ?? room?.office_id ?? ""));
                const rawBillingDay = lease?.billing_day ?? tenant.billing_day ?? 1;
                const billingDay = clampBillingDay(typeof rawBillingDay === "number" || typeof rawBillingDay === "string" ? rawBillingDay : 1);
                const period = billingPeriodForDate({
                    billingDay,
                    businessDate: today,
                    leaseStartDate: String(lease?.start_date ?? tenant.created_at ?? "").slice(0, 10),
                });
                const daysOverdue = daysBetween(period.coverageStart, today);
                const balance = calculateTenantMonthlyLedgerPosition({
                    advanceAllocations: allocationsByTenant.get(String(tenant.id)) ?? [],
                    collections: collectionsByTenant.get(String(tenant.id)) ?? [],
                    legacyArrears: legacyArrearsByTenant.get(String(tenant.id)) ?? [],
                    monthlyRent: Number(lease?.monthly_rent ?? tenant.monthly_rent ?? room?.monthly_rent ?? 0),
                    rentMonths: rentMonthsByTenant.get(String(tenant.id)) ?? [],
                    selectedMonth,
                }).outstanding;
                if (period.coverageStart > today || balance <= 0) return null;
                return {
                    balance,
                    billingDate: period.coverageStart,
                    billingDay,
                    daysOverdue,
                    dueBucket: bucket(daysOverdue),
                    id: String(tenant.id),
                    office: String(office?.office_name ?? office?.name ?? "Office"),
                    phone: String(tenant.phone ?? ""),
                    room: String(room?.room_number ?? "No room"),
                    tenant: String(tenant.full_name ?? "Unnamed tenant"),
                };
            })
            .filter(Boolean)
            .sort((left: any, right: any) => right.balance - left.balance || right.daysOverdue - left.daysOverdue)
            .slice(0, 10);

        return NextResponse.json({ generatedAt: new Date().toISOString(), items }, { headers: { "Cache-Control": "private, max-age=60" } });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Rent due intelligence could not load.";
        return NextResponse.json({ error: message, items: [] }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
}
