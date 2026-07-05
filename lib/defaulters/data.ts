import { requireAuth } from "@/lib/auth/permissions";
import { getScopedSupabase } from "@/lib/auth/query";
import type { Database } from "@/types/database.types";
import type { DefaulterAssistant, DefaulterItem, DefaultersKpis, DefaultersPageData } from "./types";

type DynamicDb = {
    from: (table: string) => any;
};

type TenantRow = Database["public"]["Tables"]["tenants"]["Row"];
type RoomRow = Database["public"]["Tables"]["rooms"]["Row"];
type LeaseRow = Database["public"]["Tables"]["leases"]["Row"];
type OfficeRow = Database["public"]["Tables"]["offices"]["Row"];
type PropertyRow = Database["public"]["Tables"]["properties"]["Row"];
type LandlordRow = Database["public"]["Tables"]["landlords"]["Row"];
type CollectionRow = Database["public"]["Tables"]["collections"]["Row"];
type PromiseRow = Database["public"]["Tables"]["promises"]["Row"];

function amount(value: unknown) {
    const number = Number(value ?? 0);
    return Number.isFinite(number) ? number : 0;
}

function dateOnly(date = new Date()) {
    return date.toISOString().slice(0, 10);
}

function firstOfCurrentMonth(now = new Date()) {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function dayFromDate(value: string | null | undefined) {
    if (!value) return 1;
    const parsed = new Date(`${value.slice(0, 10)}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return 1;
    return parsed.getDate();
}

function daysInMonth(year: number, monthIndex: number) {
    return new Date(year, monthIndex + 1, 0).getDate();
}

function dueDateForDay(day: number, now = new Date()) {
    const safeDay = Math.max(1, Math.min(day, daysInMonth(now.getFullYear(), now.getMonth())));
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
}

function daysBetween(start: string, end = new Date()) {
    const startDate = new Date(`${start}T00:00:00`);
    const endDate = new Date(`${dateOnly(end)}T00:00:00`);
    if (Number.isNaN(startDate.getTime())) return 0;
    return Math.max(0, Math.floor((endDate.getTime() - startDate.getTime()) / 86_400_000));
}

function isActiveTenant(value: string | null | undefined) {
    const status = String(value ?? "").toLowerCase();
    return !status || status === "active" || status === "occupied" || status === "current";
}

function isActiveRoom(value: string | null | undefined) {
    const status = String(value ?? "").toLowerCase();
    if (!status) return true;
    return !status.includes("vacant") && !status.includes("archiv") && !status.includes("delete") && !status.includes("inactive");
}

function isClosedPromise(value: string | null | undefined) {
    const status = String(value ?? "").toLowerCase();
    return ["fulfilled", "paid", "closed", "cancelled", "canceled"].includes(status);
}

function officeName(office: OfficeRow | null | undefined) {
    return office?.office_name ?? office?.name ?? "Needs review";
}

function propertyName(property: PropertyRow | null | undefined) {
    return property?.property_name ?? property?.name ?? property?.village ?? property?.address ?? "No property";
}

function propertyLocation(property: PropertyRow | null | undefined) {
    return [property?.village, property?.address, property?.city, property?.region].filter(Boolean).join(", ") || propertyName(property);
}

function latestCollection(a: CollectionRow | undefined, b: CollectionRow) {
    if (!a) return b;
    const left = `${a.payment_date ?? ""}T${a.created_at ?? ""}`;
    const right = `${b.payment_date ?? ""}T${b.created_at ?? ""}`;
    return right > left ? b : a;
}

async function safeRows(query: Promise<{ data: unknown[] | null; error: { message: string } | null }>) {
    const result = await query;
    if (result.error && /does not exist|schema cache|Could not find/i.test(result.error.message ?? "")) return [];
    if (result.error) throw new Error(result.error.message);
    return result.data ?? [];
}

export async function getDefaultersPageData(options: { admin?: boolean } = {}): Promise<DefaultersPageData> {
    const context = await requireAuth();
    const { supabase } = await getScopedSupabase();
    const db = supabase as unknown as DynamicDb;
    const companyId = context.activeCompany?.id;
    const activeOfficeId = context.activeOffice?.id;
    const isAdmin = Boolean(options.admin && context.isCompanyAdmin && !context.isOfficeMode);
    const now = new Date();

    if (!companyId || (!isAdmin && !activeOfficeId)) {
        return emptyData(isAdmin, dateOnly(now));
    }

    let tenantQuery = supabase
        .from("tenants")
        .select("*")
        .eq("company_id", companyId)
        .order("full_name", { ascending: true, nullsFirst: false })
        .limit(10000);
    let roomQuery = supabase
        .from("rooms")
        .select("*")
        .eq("company_id", companyId)
        .limit(10000);
    let leaseQuery = supabase
        .from("leases")
        .select("*")
        .eq("company_id", companyId)
        .eq("status", "active")
        .limit(10000);
    let collectionQuery = supabase
        .from("collections")
        .select("*")
        .eq("company_id", companyId)
        .order("payment_date", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(10000);
    let promiseQuery = supabase
        .from("promises")
        .select("*")
        .eq("company_id", companyId)
        .limit(10000);

    if (!isAdmin && activeOfficeId) {
        tenantQuery = tenantQuery.eq("office_id", activeOfficeId);
        roomQuery = roomQuery.eq("office_id", activeOfficeId);
        leaseQuery = leaseQuery.eq("office_id", activeOfficeId);
        collectionQuery = collectionQuery.eq("office_id", activeOfficeId);
        promiseQuery = promiseQuery.eq("office_id", activeOfficeId);
    }

    let allocationQuery = db
        .from("tenant_rent_allocations")
        .select("tenant_id, allocation_month, allocation_type, amount_allocated")
        .eq("company_id", companyId)
        .eq("allocation_month", firstOfCurrentMonth(now));
    if (!isAdmin && activeOfficeId) allocationQuery = allocationQuery.eq("office_id", activeOfficeId);

    const [tenantsResult, roomsResult, leasesResult, officesResult, propertiesResult, landlordsResult, collectionsResult, promisesResult, allocationRows] = await Promise.all([
        tenantQuery,
        roomQuery,
        leaseQuery,
        supabase.from("offices").select("id, office_name, name").eq("company_id", companyId),
        supabase.from("properties").select("*").eq("company_id", companyId),
        supabase.from("landlords").select("*").eq("company_id", companyId),
        collectionQuery,
        promiseQuery,
        safeRows(allocationQuery),
    ]);

    for (const result of [tenantsResult, roomsResult, leasesResult, officesResult, propertiesResult, landlordsResult, collectionsResult, promisesResult]) {
        if (result.error) throw new Error(result.error.message);
    }

    const tenants = (tenantsResult.data ?? []) as TenantRow[];
    const rooms = (roomsResult.data ?? []) as RoomRow[];
    const leases = (leasesResult.data ?? []) as LeaseRow[];
    const offices = (officesResult.data ?? []) as OfficeRow[];
    const properties = (propertiesResult.data ?? []) as PropertyRow[];
    const landlords = (landlordsResult.data ?? []) as LandlordRow[];
    const collections = (collectionsResult.data ?? []) as CollectionRow[];
    const promises = (promisesResult.data ?? []) as PromiseRow[];
    const advanceAllocationByTenant = new Map<string, number>();
    const currentAllocationByTenant = new Map<string, number>();
    for (const allocation of allocationRows as Array<Record<string, unknown>>) {
        const tenantId = String(allocation.tenant_id ?? "");
        if (!tenantId) continue;
        if (String(allocation.allocation_type) === "advance_month") {
            advanceAllocationByTenant.set(tenantId, (advanceAllocationByTenant.get(tenantId) ?? 0) + amount(allocation.amount_allocated));
        }
        if (String(allocation.allocation_type) === "current_month") {
            currentAllocationByTenant.set(tenantId, (currentAllocationByTenant.get(tenantId) ?? 0) + amount(allocation.amount_allocated));
        }
    }

    const roomById = new Map(rooms.map((room) => [room.id, room]));
    const officeById = new Map(offices.map((office) => [office.id, office]));
    const propertyById = new Map(properties.map((property) => [property.id, property]));
    const landlordById = new Map(landlords.map((landlord) => [landlord.id, landlord]));
    const activeLeaseByTenant = new Map<string, LeaseRow>();
    const activeLeaseByRoom = new Map<string, LeaseRow>();

    for (const lease of leases) {
        if (!activeLeaseByTenant.has(lease.tenant_id)) activeLeaseByTenant.set(lease.tenant_id, lease);
        if (!activeLeaseByRoom.has(lease.room_id)) activeLeaseByRoom.set(lease.room_id, lease);
    }

    const latestPaymentByTenant = new Map<string, CollectionRow>();
    const currentMonthPaidByTenant = new Map<string, number>();
    const currentMonthStart = firstOfCurrentMonth(now);
    for (const collection of collections) {
        if (!collection.tenant_id) continue;
        latestPaymentByTenant.set(collection.tenant_id, latestCollection(latestPaymentByTenant.get(collection.tenant_id), collection));
        if ((collection.payment_date ?? "") >= currentMonthStart && (collection.payment_date ?? "") <= dateOnly(now)) {
            currentMonthPaidByTenant.set(collection.tenant_id, (currentMonthPaidByTenant.get(collection.tenant_id) ?? 0) + amount(collection.amount_paid ?? collection.amount));
        }
    }

    const openPromiseCountByTenant = new Map<string, number>();
    const failedPromiseCountByTenant = new Map<string, number>();
    for (const promise of promises) {
        if (!promise.tenant_id) continue;
        const status = String(promise.status ?? "").toLowerCase();
        if (!status || status === "pending" || status === "open" || status === "active") {
            openPromiseCountByTenant.set(promise.tenant_id, (openPromiseCountByTenant.get(promise.tenant_id) ?? 0) + 1);
        }
        const promisedDate = promise.promised_date ?? promise.promise_date;
        if (promisedDate && promisedDate < dateOnly(now) && !isClosedPromise(status)) {
            failedPromiseCountByTenant.set(promise.tenant_id, (failedPromiseCountByTenant.get(promise.tenant_id) ?? 0) + 1);
        }
    }

    const defaulters: DefaulterItem[] = [];
    for (const tenant of tenants) {
        if (!isActiveTenant(tenant.status)) continue;
        const lease = activeLeaseByTenant.get(tenant.id);
        const room = (lease?.room_id ? roomById.get(lease.room_id) : null) ?? (tenant.room_id ? roomById.get(tenant.room_id) : null);
        if (!room || !isActiveRoom(room.status)) continue;

        const monthlyRent = amount(lease?.monthly_rent ?? tenant.monthly_rent ?? room.monthly_rent);
        const prepaidForCurrentMonth = advanceAllocationByTenant.get(tenant.id) ?? 0;
        const outstandingBalance = Math.max(0, amount(tenant.balance ?? room.outstanding_balance) - prepaidForCurrentMonth);
        const currentMonthPaid = currentAllocationByTenant.get(tenant.id) ?? Math.min(currentMonthPaidByTenant.get(tenant.id) ?? 0, monthlyRent);
        if (outstandingBalance <= 0) continue;

        const billingDay = amount(lease?.billing_day);
        const dueSource: DefaulterItem["dueSource"] = billingDay > 0 ? "billing_day" : lease?.start_date ? "move_in_date" : "default_first";
        const paymentDueDay = billingDay > 0 ? billingDay : lease?.start_date ? dayFromDate(lease.start_date) : 1;
        const paymentDueDate = dueDateForDay(paymentDueDay, now);
        if (dateOnly(now) <= paymentDueDate) continue;

        const isCurrentMonthUnpaidOrPartial = currentMonthPaid < monthlyRent || outstandingBalance > 0;
        if (!isCurrentMonthUnpaidOrPartial) continue;

        const office = (room.office_id ? officeById.get(room.office_id) : null) ?? (tenant.office_id ? officeById.get(tenant.office_id) : null) ?? null;
        const property = (room.property_id ? propertyById.get(room.property_id) : null) ?? (tenant.property_id ? propertyById.get(tenant.property_id) : null) ?? null;
        const landlord = room.landlord_id ? landlordById.get(room.landlord_id) ?? null : null;
        const lastPayment = latestPaymentByTenant.get(tenant.id);
        const daysDefaulted = daysBetween(paymentDueDate, now);
        const failedPromiseCount = failedPromiseCountByTenant.get(tenant.id) ?? 0;
        const suggestedActions = suggestActions({
            daysDefaulted,
            failedPromiseCount,
            outstandingBalance,
            monthlyRent,
            currentMonthPaid,
        });

        defaulters.push({
            id: `${tenant.id}-${room.id}`,
            tenantId: tenant.id,
            roomId: room.id,
            roomNumber: room.room_number ?? "Unnumbered",
            tenantName: tenant.full_name ?? "Unknown tenant",
            tenantPhone: tenant.phone ?? tenant.alternative_phone,
            officeId: room.office_id ?? tenant.office_id,
            officeName: officeName(office),
            landlordId: room.landlord_id,
            landlordName: landlord?.full_name ?? "No landlord",
            propertyName: propertyName(property),
            location: propertyLocation(property),
            monthlyRent,
            outstandingBalance,
            paymentDueDay,
            paymentDueDate,
            dueSource,
            daysDefaulted,
            monthsDefaulted: Math.floor(daysDefaulted / 30),
            lastPaymentDate: lastPayment?.payment_date ?? lastPayment?.paid_at?.slice(0, 10) ?? null,
            lastPaymentAmount: amount(lastPayment?.amount_paid ?? lastPayment?.amount),
            openPromiseCount: openPromiseCountByTenant.get(tenant.id) ?? 0,
            failedPromiseCount,
            currentMonthPaid,
            isPartialPayer: currentMonthPaid > 0 && outstandingBalance > 0,
            suggestedActions,
        });
    }

    defaulters.sort((a, b) => b.daysDefaulted - a.daysDefaulted || b.outstandingBalance - a.outstandingBalance);
    const assistant = buildAssistant(defaulters);

    void syncDefaulterNotifications({
        companyId,
        currentDate: dateOnly(now),
        db,
        defaulters,
    }).catch((error) => {
        console.warn("Defaulter notifications could not sync:", error instanceof Error ? error.message : error);
    });

    return {
        company: context.activeCompany,
        activeOffice: context.activeOffice,
        isAdmin,
        offices: offices.map((office) => ({ id: office.id, name: officeName(office) })).sort((a, b) => a.name.localeCompare(b.name)),
        landlords: landlords.map((landlord) => ({ id: landlord.id, name: landlord.full_name ?? "No landlord" })).sort((a, b) => a.name.localeCompare(b.name)),
        defaulters,
        assistant,
        kpis: buildKpis(defaulters),
        generatedAt: new Date().toISOString(),
        currentDate: dateOnly(now),
    };
}

function buildKpis(items: DefaulterItem[]): DefaultersKpis {
    const officeRisk = new Map<string, { count: number; outstanding: number }>();
    for (const item of items) {
        const current = officeRisk.get(item.officeName) ?? { count: 0, outstanding: 0 };
        current.count += 1;
        current.outstanding += item.outstandingBalance;
        officeRisk.set(item.officeName, current);
    }
    const highestRiskOffice = [...officeRisk.entries()].sort((a, b) => b[1].outstanding - a[1].outstanding || b[1].count - a[1].count)[0]?.[0] ?? "No defaulters";
    const highestOutstandingTenant = [...items].sort((a, b) => b.outstandingBalance - a.outstandingBalance)[0]?.tenantName ?? "No defaulters";
    return {
        totalDefaulters: items.length,
        totalOutstanding: items.reduce((total, item) => total + item.outstandingBalance, 0),
        defaultedOneToSevenDays: items.filter((item) => item.daysDefaulted >= 1 && item.daysDefaulted <= 7).length,
        defaultedEightToThirtyDays: items.filter((item) => item.daysDefaulted >= 8 && item.daysDefaulted <= 30).length,
        defaultedOneMonthPlus: items.filter((item) => item.daysDefaulted >= 30).length,
        highestRiskOffice,
        highestOutstandingTenant,
    };
}

function suggestActions(input: { daysDefaulted: number; failedPromiseCount: number; outstandingBalance: number; monthlyRent: number; currentMonthPaid: number }) {
    const actions = new Set<string>();
    actions.add("Call");
    if (input.daysDefaulted >= 3) actions.add("WhatsApp");
    if (input.daysDefaulted >= 7) actions.add("SMS");
    if (input.failedPromiseCount > 0 || input.daysDefaulted >= 14) actions.add("Visit");
    if (input.daysDefaulted >= 30 || input.outstandingBalance >= Math.max(500_000, input.monthlyRent * 2)) actions.add("Issue notice");
    if (input.currentMonthPaid === 0 && input.daysDefaulted <= 14) actions.add("Save promise");
    if (input.failedPromiseCount > 0 || input.daysDefaulted >= 30) actions.add("Escalate to Admin");
    return [...actions];
}

function buildAssistant(items: DefaulterItem[]): DefaulterAssistant {
    const byDays = [...items].sort((a, b) => b.daysDefaulted - a.daysDefaulted);
    const byOutstanding = [...items].sort((a, b) => b.outstandingBalance - a.outstandingBalance);
    const justBecameDefaulters = items.filter((item) => item.daysDefaulted === 1).slice(0, 8);
    const failedPromiseTenants = items.filter((item) => item.failedPromiseCount > 0).sort((a, b) => b.failedPromiseCount - a.failedPromiseCount || b.outstandingBalance - a.outstandingBalance).slice(0, 8);
    const partialPayers = items.filter((item) => item.isPartialPayer).sort((a, b) => b.outstandingBalance - a.outstandingBalance).slice(0, 8);
    const urgentFollowUps = items
        .filter((item) => item.daysDefaulted >= 14 || item.failedPromiseCount > 0 || item.outstandingBalance >= Math.max(500_000, item.monthlyRent * 2))
        .sort((a, b) => b.daysDefaulted * b.outstandingBalance - a.daysDefaulted * a.outstandingBalance)
        .slice(0, 8);
    const callToday = [...new Map([...justBecameDefaulters, ...urgentFollowUps, ...byOutstanding.slice(0, 4)].map((item) => [item.id, item])).values()].slice(0, 10);
    const kpis = buildKpis(items);
    const insights: DefaulterAssistant["insights"] = [];

    if (justBecameDefaulters.length) {
        insights.push({
            id: "new-defaulters",
            title: "New defaulters today",
            message: `${justBecameDefaulters.length} tenant${justBecameDefaulters.length === 1 ? " has" : "s have"} just crossed the monthly due date.`,
            severity: "warning",
        });
    }
    if (byDays[0]) {
        insights.push({
            id: "longest-default",
            title: "Longest default period",
            message: `${byDays[0].tenantName} in room ${byDays[0].roomNumber} has defaulted for ${byDays[0].daysDefaulted} days.`,
            severity: byDays[0].daysDefaulted >= 30 ? "critical" : "warning",
        });
    }
    if (byOutstanding[0]) {
        insights.push({
            id: "highest-balance",
            title: "Highest outstanding balance",
            message: `${byOutstanding[0].tenantName} owes UGX ${Math.round(byOutstanding[0].outstandingBalance).toLocaleString()}.`,
            severity: byOutstanding[0].outstandingBalance >= 1_000_000 ? "critical" : "warning",
        });
    }
    if (failedPromiseTenants.length) {
        insights.push({
            id: "failed-promises",
            title: "Failed promises need escalation",
            message: `${failedPromiseTenants.length} defaulter${failedPromiseTenants.length === 1 ? " has" : "s have"} overdue or broken promises.`,
            severity: "critical",
        });
    }
    if (partialPayers.length) {
        insights.push({
            id: "partial-payers",
            title: "Partial payments recorded",
            message: `${partialPayers.length} tenant${partialPayers.length === 1 ? " has" : "s have"} paid something this month but still remain overdue.`,
            severity: "info",
        });
    }
    if (kpis.highestRiskOffice !== "No defaulters") {
        insights.push({
            id: "highest-risk-office",
            title: "Highest-risk office",
            message: `${kpis.highestRiskOffice} currently carries the highest defaulter exposure.`,
            severity: "warning",
        });
    }

    return {
        justBecameDefaulters,
        longestDefaulted: byDays[0] ?? null,
        highestOutstanding: byOutstanding[0] ?? null,
        urgentFollowUps,
        failedPromiseTenants,
        partialPayers,
        callToday,
        highestRiskOffice: kpis.highestRiskOffice,
        insights,
    };
}

async function syncDefaulterNotifications(input: { companyId: string; currentDate: string; db: DynamicDb; defaulters: DefaulterItem[] }) {
    if (!input.defaulters.length) return;
    const { data: existing, error } = await input.db
        .from("notifications")
        .select("message")
        .eq("company_id", input.companyId)
        .ilike("message", "%[defaulter:%")
        .limit(10000);
    if (error) throw new Error(error.message);

    const existingKeys = new Set((existing ?? []).map((row: { message?: string | null }) => {
        const match = String(row.message ?? "").match(/\[defaulter:[^\]]+\]/);
        return match?.[0] ?? "";
    }).filter(Boolean));
    const inserts: Array<Record<string, unknown>> = [];

    function queue(item: DefaulterItem, key: string, title: string, message: string, recipientType: "admin" | "office") {
        const fullKey = `[defaulter:${recipientType}:${item.officeId ?? "company"}:${key}]`;
        if (existingKeys.has(fullKey)) return;
        existingKeys.add(fullKey);
        inserts.push({
            channel: "in_app",
            company_id: input.companyId,
            created_at: new Date().toISOString(),
            delivery_status: "pending",
            is_read: false,
            message: `${message} ${fullKey}`,
            office_id: item.officeId,
            recipient_type: recipientType,
            title,
        });
    }

    for (const item of input.defaulters) {
        const base = `${item.tenantId}:${item.paymentDueDate}`;
        if (item.daysDefaulted === 1) {
            queue(item, `${base}:became`, "Tenant became defaulter", `${item.tenantName} in room ${item.roomNumber} has passed the due date ${item.paymentDueDate}.`, "office");
            queue(item, `${base}:became`, "Tenant became defaulter", `${item.tenantName} in ${item.officeName} has passed the due date ${item.paymentDueDate}.`, "admin");
        }
        for (const milestone of [7, 14, 30]) {
            if (item.daysDefaulted >= milestone) {
                queue(item, `${base}:${milestone}d`, `Tenant defaulted ${milestone} days`, `${item.tenantName} in room ${item.roomNumber} has defaulted for ${item.daysDefaulted} days and owes UGX ${Math.round(item.outstandingBalance).toLocaleString()}.`, "office");
                queue(item, `${base}:${milestone}d`, `Tenant defaulted ${milestone} days`, `${item.tenantName} in ${item.officeName} has defaulted for ${item.daysDefaulted} days.`, "admin");
            }
        }
        if (item.failedPromiseCount > 0) {
            queue(item, `${base}:promise-failed`, "Promise failed", `${item.tenantName} has ${item.failedPromiseCount} overdue promise${item.failedPromiseCount === 1 ? "" : "s"}.`, "office");
            queue(item, `${base}:promise-failed`, "Promise failed", `${item.tenantName} in ${item.officeName} has overdue promise follow-up risk.`, "admin");
        }
        if (item.outstandingBalance >= Math.max(500_000, item.monthlyRent * 2)) {
            queue(item, `${base}:high-value`, "High-value tenant unpaid", `${item.tenantName} owes UGX ${Math.round(item.outstandingBalance).toLocaleString()}.`, "office");
            queue(item, `${base}:high-value`, "High-value tenant unpaid", `${item.tenantName} in ${item.officeName} owes UGX ${Math.round(item.outstandingBalance).toLocaleString()}.`, "admin");
        }
    }

    const officeGroups = new Map<string, { officeName: string; officeId: string | null; count: number; outstanding: number }>();
    for (const item of input.defaulters) {
        const key = item.officeId ?? item.officeName;
        const current = officeGroups.get(key) ?? { officeName: item.officeName, officeId: item.officeId, count: 0, outstanding: 0 };
        current.count += 1;
        current.outstanding += item.outstandingBalance;
        officeGroups.set(key, current);
    }

    for (const office of officeGroups.values()) {
        if (office.count < 5 && office.outstanding < 2_000_000) continue;
        const fullKey = `[defaulter:office-risk:${office.officeId ?? office.officeName}:${input.currentDate}]`;
        if (existingKeys.has(fullKey)) continue;
        existingKeys.add(fullKey);
        inserts.push({
            channel: "in_app",
            company_id: input.companyId,
            created_at: new Date().toISOString(),
            delivery_status: "pending",
            is_read: false,
            message: `${office.officeName} has ${office.count} defaulters owing UGX ${Math.round(office.outstanding).toLocaleString()}. ${fullKey}`,
            office_id: office.officeId,
            recipient_type: "admin",
            title: "Office default risk rising",
        });
    }

    if (!inserts.length) return;
    const { error: insertError } = await input.db.from("notifications").insert(inserts.slice(0, 100));
    if (insertError) throw new Error(insertError.message);
}

function emptyData(isAdmin: boolean, currentDate: string): DefaultersPageData {
    return {
        company: null,
        activeOffice: null,
        isAdmin,
        offices: [],
        landlords: [],
        defaulters: [],
        assistant: buildAssistant([]),
        kpis: buildKpis([]),
        generatedAt: new Date().toISOString(),
        currentDate,
    };
}
