import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/permissions";
import { getScopedSupabase } from "@/lib/auth/query";
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
            .select("id, full_name, phone, office_id, room_id, monthly_rent, balance, status, billing_day, created_at")
            .eq("company_id", companyId)
            .eq("status", "active")
            .gt("balance", 0)
            .order("balance", { ascending: false })
            .limit(80);

        if (!searchAllOffices) tenantQuery = tenantQuery.eq("office_id", officeId);
        const { data: tenants, error } = await tenantQuery;
        if (error) throw new Error(error.message);
        const tenantRows = tenants ?? [];
        const tenantIds = tenantRows.map((tenant: Record<string, unknown>) => String(tenant.id));
        const roomIds = tenantRows.map((tenant: Record<string, unknown>) => String(tenant.room_id ?? "")).filter(Boolean);
        const officeIds = [...new Set([officeId, ...tenantRows.map((tenant: Record<string, unknown>) => String(tenant.office_id ?? "")).filter(Boolean)])];

        const [leasesResult, roomsResult, officesResult] = await Promise.all([
            tenantIds.length
                ? (supabase as unknown as DynamicDb).from("leases").select("id, tenant_id, room_id, start_date, billing_day, monthly_rent, status").eq("company_id", companyId).eq("status", "active").in("tenant_id", tenantIds)
                : { data: [] },
            roomIds.length
                ? (supabase as unknown as DynamicDb).from("rooms").select("id, room_number, office_id, monthly_rent, status").eq("company_id", companyId).in("id", roomIds)
                : { data: [] },
            officeIds.length
                ? (supabase as unknown as DynamicDb).from("offices").select("id, office_name, name").eq("company_id", companyId).in("id", officeIds)
                : { data: [] },
        ]);
        if (leasesResult.error) throw new Error(leasesResult.error.message);
        if (roomsResult.error) throw new Error(roomsResult.error.message);
        if (officesResult.error) throw new Error(officesResult.error.message);

        const leaseByTenant = new Map<string, Record<string, unknown>>((leasesResult.data ?? []).map((lease: Record<string, unknown>) => [String(lease.tenant_id), lease]));
        const roomById = new Map<string, Record<string, unknown>>((roomsResult.data ?? []).map((room: Record<string, unknown>) => [String(room.id), room]));
        const officeById = new Map<string, Record<string, unknown>>((officesResult.data ?? []).map((office: Record<string, unknown>) => [String(office.id), office]));
        const today = businessDate();

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
                const balance = Math.max(0, Number(tenant.balance ?? 0));
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
