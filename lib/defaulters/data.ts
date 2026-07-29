import { requireAuth } from "@/lib/auth/permissions";
import { getScopedSupabase } from "@/lib/auth/query";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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
type CollectionActionRow = Database["public"]["Tables"]["collection_actions"]["Row"];
type CollectorAssignmentRow = Database["public"]["Tables"]["collector_assignments"]["Row"];
type UserRow = Database["public"]["Tables"]["users"]["Row"];

type VacatedTenantDebtRow = {
    id: string;
    company_id: string | null;
    office_id: string | null;
    property_id: string | null;
    landlord_id: string | null;
    tenant_id: string | null;
    room_id: string | null;
    tenant_name: string | null;
    room_number: string | null;
    tenant_phone: string | null;
    original_amount: number | string | null;
    recovered_amount: number | string | null;
    remaining_amount: number | string | null;
    final_outstanding_balance?: number | string | null;
    recovery_status: string | null;
    landlord_deduction_status?: string | null;
    vacate_date: string | null;
    created_at: string | null;
    updated_at?: string | null;
};

type LandlordDebtDeductionRow = {
    id: string;
    vacated_tenant_debt_id: string | null;
    tenant_id: string | null;
    landlord_id: string | null;
    status: string | null;
    amount: number | string | null;
    applied_amount: number | string | null;
    created_at: string | null;
};

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

function addMonths(date: Date, months: number) {
    const next = new Date(date);
    next.setMonth(next.getMonth() + months);
    return next;
}

function monthKey(date: Date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
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

function liveOutstanding(tenant: TenantRow, room: RoomRow | null | undefined) {
    const tenantBalance = amount(tenant.balance);
    if (tenantBalance > 0 || tenant.balance === 0) return Math.max(0, tenantBalance);
    return Math.max(0, amount(room?.outstanding_balance));
}

function estimateUnpaidPeriods(outstandingBalance: number, monthlyRent: number) {
    if (outstandingBalance <= 0) return 0;
    if (monthlyRent <= 0) return 1;
    return Math.max(1, Math.ceil(outstandingBalance / monthlyRent));
}

function oldestUnpaidPeriod(input: { paymentDueDate: string; unpaidPeriods: number }) {
    const due = new Date(`${input.paymentDueDate}T00:00:00`);
    if (Number.isNaN(due.getTime())) return input.paymentDueDate.slice(0, 7);
    return monthKey(addMonths(due, 1 - Math.max(1, input.unpaidPeriods)));
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

function isClearedPromise(value: string | null | undefined) {
    const status = String(value ?? "").toLowerCase();
    return ["fulfilled", "paid", "closed"].includes(status);
}

function promiseStatus(openCount: number, failedCount: number, dueTodayCount: number) {
    if (failedCount > 0) return "Broken/overdue";
    if (dueTodayCount > 0) return "Due today";
    if (openCount > 0) return "Open";
    return "No promise";
}

function riskLevel(input: { daysDefaulted: number; failedPromiseCount: number; outstandingBalance: number; monthlyRent: number; source?: DefaulterItem["source"] }): DefaulterItem["riskLevel"] {
    if (input.source === "vacated_debt") return "high";
    if (input.failedPromiseCount > 0 || input.daysDefaulted >= 30 || input.outstandingBalance >= Math.max(500_000, input.monthlyRent * 2)) return "high";
    if (input.daysDefaulted >= 8 || input.outstandingBalance >= Math.max(250_000, input.monthlyRent)) return "medium";
    return "low";
}

function latestAction(a: CollectionActionRow | undefined, b: CollectionActionRow) {
    if (!a) return b;
    return String(b.created_at ?? "") > String(a.created_at ?? "") ? b : a;
}

function isCollectorContext(context: Awaited<ReturnType<typeof requireAuth>>) {
    return context.authMode === "collector" || context.roles.some((role) => role.role?.key === "field_collector");
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

type QueryResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

async function pagedRows<T>(buildQuery: (from: number, to: number) => QueryResult<T>, pageSize = 1000) {
    const rows: T[] = [];
    for (let from = 0; ; from += pageSize) {
        const result = await buildQuery(from, from + pageSize - 1);
        if (result.error) throw new Error(result.error.message);
        const page = result.data ?? [];
        rows.push(...page);
        if (page.length < pageSize) break;
    }
    return rows;
}

async function safePagedRows<T>(buildQuery: (from: number, to: number) => QueryResult<T>, pageSize = 1000) {
    const rows: T[] = [];
    for (let from = 0; ; from += pageSize) {
        const result = await buildQuery(from, from + pageSize - 1);
        if (result.error && /does not exist|schema cache|Could not find/i.test(result.error.message ?? "")) return [];
        if (result.error) throw new Error(result.error.message);
        const page = result.data ?? [];
        rows.push(...page);
        if (page.length < pageSize) break;
    }
    return rows;
}

export async function getDefaultersPageData(options: { admin?: boolean } = {}): Promise<DefaultersPageData> {
    const context = await requireAuth();
    const { supabase } = await getScopedSupabase();
    const companyId = context.activeCompany?.id;
    const activeOfficeId = context.activeOffice?.id;
    const isAdmin = Boolean(options.admin && context.isCompanyAdmin && !context.isOfficeMode);
    const isCollector = isCollectorContext(context);
    const collectorOfficeIds = isCollector ? context.offices.map((office) => office.id).filter(Boolean) : [];
    const now = new Date();
    const readSupabase = isAdmin ? createSupabaseAdminClient() : supabase;
    const db = readSupabase as unknown as DynamicDb;

    if (!companyId || (!isAdmin && !isCollector && !activeOfficeId) || (isCollector && !collectorOfficeIds.length)) {
        return emptyData(isAdmin, isCollector, dateOnly(now));
    }

    function scopeOffice(query: any) {
        if (!isAdmin && isCollector) return query.in("office_id", collectorOfficeIds);
        if (!isAdmin && activeOfficeId) return query.eq("office_id", activeOfficeId);
        return query;
    }

    let allocationQuery = db
        .from("tenant_rent_allocations")
        .select("tenant_id, allocation_month, allocation_type, amount_allocated")
        .eq("company_id", companyId)
        .eq("allocation_month", firstOfCurrentMonth(now));
    if (!isAdmin && isCollector) {
        allocationQuery = allocationQuery.in("office_id", collectorOfficeIds);
    } else if (!isAdmin && activeOfficeId) {
        allocationQuery = allocationQuery.eq("office_id", activeOfficeId);
    }

    const [tenants, rooms, leases, offices, properties, landlords, collections, promises, actions, assignments, users, debtRows, deductionRows, allocationRows] = await Promise.all([
        pagedRows<TenantRow>((from, to) => scopeOffice(readSupabase.from("tenants").select("*").eq("company_id", companyId).order("full_name", { ascending: true, nullsFirst: false })).range(from, to)),
        pagedRows<RoomRow>((from, to) => scopeOffice(readSupabase.from("rooms").select("*").eq("company_id", companyId)).range(from, to)),
        pagedRows<LeaseRow>((from, to) => scopeOffice(readSupabase.from("leases").select("*").eq("company_id", companyId).eq("status", "active")).range(from, to)),
        pagedRows<OfficeRow>((from, to) => readSupabase.from("offices").select("*").eq("company_id", companyId).range(from, to)),
        pagedRows<PropertyRow>((from, to) => readSupabase.from("properties").select("*").eq("company_id", companyId).range(from, to)),
        pagedRows<LandlordRow>((from, to) => readSupabase.from("landlords").select("*").eq("company_id", companyId).range(from, to)),
        pagedRows<CollectionRow>((from, to) => scopeOffice(readSupabase.from("collections").select("*").eq("company_id", companyId).order("payment_date", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false, nullsFirst: false })).range(from, to)),
        pagedRows<PromiseRow>((from, to) => scopeOffice(readSupabase.from("promises").select("*").eq("company_id", companyId)).range(from, to)),
        pagedRows<CollectionActionRow>((from, to) => scopeOffice(readSupabase.from("collection_actions").select("*").eq("company_id", companyId).order("created_at", { ascending: false, nullsFirst: false })).range(from, to)),
        pagedRows<CollectorAssignmentRow>((from, to) => scopeOffice(readSupabase.from("collector_assignments").select("*").eq("company_id", companyId).eq("active", true)).range(from, to)),
        pagedRows<Pick<UserRow, "id" | "full_name" | "account_type" | "default_office_id">>((from, to) => readSupabase.from("users").select("id, full_name, account_type, default_office_id").eq("company_id", companyId).range(from, to)),
        safePagedRows<VacatedTenantDebtRow>((from, to) => scopeOffice(db.from("vacated_tenant_debts").select("*").eq("company_id", companyId).gt("remaining_amount", 0)).range(from, to)),
        safePagedRows<LandlordDebtDeductionRow>((from, to) => scopeOffice(db.from("landlord_debt_deductions").select("*").eq("company_id", companyId)).range(from, to)),
        safeRows(allocationQuery),
    ]);
    const vacatedDebts = debtRows;
    const deductions = deductionRows;
    const currentAllocationByTenant = new Map<string, number>();
    for (const allocation of allocationRows as Array<Record<string, unknown>>) {
        const tenantId = String(allocation.tenant_id ?? "");
        if (!tenantId) continue;
        if (String(allocation.allocation_type) === "current_month") {
            currentAllocationByTenant.set(tenantId, (currentAllocationByTenant.get(tenantId) ?? 0) + amount(allocation.amount_allocated));
        }
    }

    const roomById = new Map(rooms.map((room) => [room.id, room]));
    const officeById = new Map(offices.map((office) => [office.id, office]));
    const propertyById = new Map(properties.map((property) => [property.id, property]));
    const landlordById = new Map(landlords.map((landlord) => [landlord.id, landlord]));
    const userById = new Map(users.map((user) => [user.id, user]));
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
    const promisesDueTodayByTenant = new Map<string, number>();
    const collectorByTenant = new Map<string, string>();
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
        if (promisedDate === dateOnly(now) && !isClearedPromise(status)) {
            promisesDueTodayByTenant.set(promise.tenant_id, (promisesDueTodayByTenant.get(promise.tenant_id) ?? 0) + 1);
        }
        if (promise.assigned_staff && !collectorByTenant.has(promise.tenant_id)) {
            collectorByTenant.set(promise.tenant_id, userById.get(promise.assigned_staff)?.full_name ?? promise.entered_by_name ?? "Assigned collector");
        }
    }

    for (const assignment of assignments) {
        if (!assignment.tenant_id) continue;
        if (!collectorByTenant.has(assignment.tenant_id)) {
            collectorByTenant.set(assignment.tenant_id, userById.get(assignment.collector_user_id)?.full_name ?? "Assigned collector");
        }
    }

    for (const collection of collections) {
        if (!collection.tenant_id || collectorByTenant.has(collection.tenant_id)) continue;
        if (collection.collector_id) collectorByTenant.set(collection.tenant_id, userById.get(collection.collector_id)?.full_name ?? collection.entered_by_name ?? "Collector recorded payment");
    }

    const lastActionByTenant = new Map<string, CollectionActionRow>();
    for (const action of actions) {
        if (!action.tenant_id) continue;
        lastActionByTenant.set(action.tenant_id, latestAction(lastActionByTenant.get(action.tenant_id), action));
    }

    const deductionStatusByDebt = new Map<string, string>();
    const deductionStatusByTenant = new Map<string, string>();
    for (const deduction of deductions) {
        const remaining = Math.max(0, amount(deduction.amount) - amount(deduction.applied_amount));
        const status = `${String(deduction.status ?? "pending").replaceAll("_", " ")}${remaining > 0 ? ` (${Math.round(remaining).toLocaleString()} remaining)` : ""}`;
        if (deduction.vacated_tenant_debt_id) deductionStatusByDebt.set(deduction.vacated_tenant_debt_id, status);
        if (deduction.tenant_id && !deductionStatusByTenant.has(deduction.tenant_id)) deductionStatusByTenant.set(deduction.tenant_id, status);
    }

    const defaulters: DefaulterItem[] = [];
    for (const tenant of tenants) {
        if (!isActiveTenant(tenant.status)) continue;
        const lease = activeLeaseByTenant.get(tenant.id);
        const room = (lease?.room_id ? roomById.get(lease.room_id) : null) ?? (tenant.room_id ? roomById.get(tenant.room_id) : null);
        if (!room || !isActiveRoom(room.status)) continue;

        const monthlyRent = amount(lease?.monthly_rent ?? tenant.monthly_rent ?? room.monthly_rent);
        const outstandingBalance = liveOutstanding(tenant, room);
        const currentMonthPaid = currentAllocationByTenant.get(tenant.id) ?? Math.min(currentMonthPaidByTenant.get(tenant.id) ?? 0, monthlyRent);
        if (outstandingBalance <= 0) continue;

        const billingDay = amount(lease?.billing_day ?? tenant.billing_day);
        const dueSource: DefaulterItem["dueSource"] = billingDay > 0 ? "billing_day" : lease?.start_date ? "move_in_date" : "default_first";
        const paymentDueDay = billingDay > 0 ? billingDay : lease?.start_date ? dayFromDate(lease.start_date) : 1;
        const paymentDueDate = dueDateForDay(paymentDueDay, now);

        const office = (room.office_id ? officeById.get(room.office_id) : null) ?? (tenant.office_id ? officeById.get(tenant.office_id) : null) ?? null;
        const property = (room.property_id ? propertyById.get(room.property_id) : null) ?? (tenant.property_id ? propertyById.get(tenant.property_id) : null) ?? null;
        const landlord = room.landlord_id ? landlordById.get(room.landlord_id) ?? null : null;
        const lastPayment = latestPaymentByTenant.get(tenant.id);
        const daysDefaulted = daysBetween(paymentDueDate, now);
        const failedPromiseCount = failedPromiseCountByTenant.get(tenant.id) ?? 0;
        const openPromiseCount = openPromiseCountByTenant.get(tenant.id) ?? 0;
        const dueTodayCount = promisesDueTodayByTenant.get(tenant.id) ?? 0;
        const unpaidPeriods = estimateUnpaidPeriods(outstandingBalance, monthlyRent);
        const lastAction = lastActionByTenant.get(tenant.id);
        const suggestedActions = suggestActions({
            daysDefaulted,
            failedPromiseCount,
            outstandingBalance,
            monthlyRent,
            currentMonthPaid,
        });
        const nextRecommendedAction = suggestedActions[0] ?? "Review account";

        defaulters.push({
            id: `${tenant.id}-${room.id}`,
            source: "active_tenant",
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
            oldestUnpaidPeriod: oldestUnpaidPeriod({ paymentDueDate, unpaidPeriods }),
            unpaidPeriods,
            paymentDueDay,
            paymentDueDate,
            dueSource,
            daysDefaulted,
            monthsDefaulted: Math.floor(daysDefaulted / 30),
            lastPaymentDate: lastPayment?.payment_date ?? lastPayment?.paid_at?.slice(0, 10) ?? null,
            lastPaymentAmount: amount(lastPayment?.amount_paid ?? lastPayment?.amount),
            promiseStatus: promiseStatus(openPromiseCount, failedPromiseCount, dueTodayCount),
            openPromiseCount,
            failedPromiseCount,
            currentMonthPaid,
            isPartialPayer: currentMonthPaid > 0 && outstandingBalance > 0,
            collectorAssigned: collectorByTenant.get(tenant.id) ?? "Unassigned",
            riskLevel: riskLevel({ daysDefaulted, failedPromiseCount, outstandingBalance, monthlyRent }),
            lastFollowUp: lastAction?.created_at?.slice(0, 10) ?? null,
            nextRecommendedAction,
            clearedDate: null,
            recoveryStatus: null,
            landlordDeductionStatus: null,
            suggestedActions,
        });
    }

    for (const debt of vacatedDebts) {
        const rawRemaining = debt.remaining_amount == null ? amount(debt.final_outstanding_balance ?? debt.original_amount) - amount(debt.recovered_amount) : amount(debt.remaining_amount);
        const outstandingBalance = Math.max(0, rawRemaining);
        if (outstandingBalance <= 0) continue;
        const room = debt.room_id ? roomById.get(debt.room_id) : null;
        const tenant = debt.tenant_id ? tenants.find((row) => row.id === debt.tenant_id) ?? null : null;
        const office = (debt.office_id ? officeById.get(debt.office_id) : null) ?? (room?.office_id ? officeById.get(room.office_id) : null) ?? null;
        const property = (debt.property_id ? propertyById.get(debt.property_id) : null) ?? (room?.property_id ? propertyById.get(room.property_id) : null) ?? null;
        const landlordId = debt.landlord_id ?? room?.landlord_id ?? null;
        const landlord = landlordId ? landlordById.get(landlordId) ?? null : null;
        const monthlyRent = amount(room?.monthly_rent ?? tenant?.monthly_rent);
        const paymentDueDate = debt.vacate_date ?? debt.created_at?.slice(0, 10) ?? firstOfCurrentMonth(now);
        const daysDefaulted = daysBetween(paymentDueDate, now);
        const unpaidPeriods = estimateUnpaidPeriods(outstandingBalance, monthlyRent);
        const lastPayment = debt.tenant_id ? latestPaymentByTenant.get(debt.tenant_id) : undefined;
        const failedPromiseCount = debt.tenant_id ? failedPromiseCountByTenant.get(debt.tenant_id) ?? 0 : 0;
        const openPromiseCount = debt.tenant_id ? openPromiseCountByTenant.get(debt.tenant_id) ?? 0 : 0;
        const dueTodayCount = debt.tenant_id ? promisesDueTodayByTenant.get(debt.tenant_id) ?? 0 : 0;
        const lastAction = debt.tenant_id ? lastActionByTenant.get(debt.tenant_id) : undefined;
        const suggestedActions = ["Recover vacated debt", "Review landlord deduction", "Escalate to Admin"];

        defaulters.push({
            id: `vacated-${debt.id}`,
            source: "vacated_debt",
            tenantId: debt.tenant_id ?? debt.id,
            roomId: debt.room_id,
            roomNumber: debt.room_number ?? room?.room_number ?? "Former room",
            tenantName: debt.tenant_name ?? tenant?.full_name ?? "Vacated tenant",
            tenantPhone: debt.tenant_phone ?? tenant?.phone ?? tenant?.alternative_phone ?? null,
            officeId: debt.office_id ?? room?.office_id ?? tenant?.office_id ?? null,
            officeName: officeName(office),
            landlordId,
            landlordName: landlord?.full_name ?? "No landlord",
            propertyName: propertyName(property),
            location: propertyLocation(property),
            monthlyRent,
            outstandingBalance,
            oldestUnpaidPeriod: oldestUnpaidPeriod({ paymentDueDate, unpaidPeriods }),
            unpaidPeriods,
            paymentDueDay: dayFromDate(paymentDueDate),
            paymentDueDate,
            dueSource: "move_in_date",
            daysDefaulted,
            monthsDefaulted: Math.floor(daysDefaulted / 30),
            lastPaymentDate: lastPayment?.payment_date ?? lastPayment?.paid_at?.slice(0, 10) ?? null,
            lastPaymentAmount: amount(lastPayment?.amount_paid ?? lastPayment?.amount),
            promiseStatus: promiseStatus(openPromiseCount, failedPromiseCount, dueTodayCount),
            openPromiseCount,
            failedPromiseCount,
            currentMonthPaid: 0,
            isPartialPayer: false,
            collectorAssigned: debt.tenant_id ? collectorByTenant.get(debt.tenant_id) ?? "Unassigned" : "Unassigned",
            riskLevel: "high",
            lastFollowUp: lastAction?.created_at?.slice(0, 10) ?? null,
            nextRecommendedAction: suggestedActions[0],
            clearedDate: null,
            recoveryStatus: debt.recovery_status ?? "pending",
            landlordDeductionStatus: debt.landlord_deduction_status ?? deductionStatusByDebt.get(debt.id) ?? (debt.tenant_id ? deductionStatusByTenant.get(debt.tenant_id) : null) ?? "Pending review",
            suggestedActions,
        });
    }

    for (const tenant of tenants) {
        const room = tenant.room_id ? roomById.get(tenant.room_id) : null;
        if (!isActiveTenant(tenant.status) || liveOutstanding(tenant, room) > 0) continue;
        const lastPayment = latestPaymentByTenant.get(tenant.id);
        const clearedDate = lastPayment?.payment_date ?? tenant.updated_at?.slice(0, 10) ?? null;
        if (clearedDate !== dateOnly(now)) continue;
        const lease = activeLeaseByTenant.get(tenant.id);
        const actualRoom = (lease?.room_id ? roomById.get(lease.room_id) : null) ?? room ?? null;
        const office = (actualRoom?.office_id ? officeById.get(actualRoom.office_id) : null) ?? (tenant.office_id ? officeById.get(tenant.office_id) : null) ?? null;
        const property = (actualRoom?.property_id ? propertyById.get(actualRoom.property_id) : null) ?? (tenant.property_id ? propertyById.get(tenant.property_id) : null) ?? null;
        const landlord = actualRoom?.landlord_id ? landlordById.get(actualRoom.landlord_id) ?? null : null;
        const monthlyRent = amount(lease?.monthly_rent ?? tenant.monthly_rent ?? actualRoom?.monthly_rent);
        const paymentDueDate = dueDateForDay(amount(lease?.billing_day ?? tenant.billing_day) || 1, now);

        defaulters.push({
            id: `cleared-${tenant.id}`,
            source: "recently_cleared",
            tenantId: tenant.id,
            roomId: actualRoom?.id ?? null,
            roomNumber: actualRoom?.room_number ?? "Unnumbered",
            tenantName: tenant.full_name ?? "Unknown tenant",
            tenantPhone: tenant.phone ?? tenant.alternative_phone,
            officeId: actualRoom?.office_id ?? tenant.office_id,
            officeName: officeName(office),
            landlordId: actualRoom?.landlord_id ?? null,
            landlordName: landlord?.full_name ?? "No landlord",
            propertyName: propertyName(property),
            location: propertyLocation(property),
            monthlyRent,
            outstandingBalance: 0,
            oldestUnpaidPeriod: paymentDueDate.slice(0, 7),
            unpaidPeriods: 0,
            paymentDueDay: dayFromDate(paymentDueDate),
            paymentDueDate,
            dueSource: "default_first",
            daysDefaulted: 0,
            monthsDefaulted: 0,
            lastPaymentDate: lastPayment?.payment_date ?? lastPayment?.paid_at?.slice(0, 10) ?? null,
            lastPaymentAmount: amount(lastPayment?.amount_paid ?? lastPayment?.amount),
            promiseStatus: "Cleared",
            openPromiseCount: 0,
            failedPromiseCount: 0,
            currentMonthPaid: currentAllocationByTenant.get(tenant.id) ?? 0,
            isPartialPayer: false,
            collectorAssigned: collectorByTenant.get(tenant.id) ?? "Unassigned",
            riskLevel: "low",
            lastFollowUp: lastActionByTenant.get(tenant.id)?.created_at?.slice(0, 10) ?? null,
            nextRecommendedAction: "Keep in history",
            clearedDate,
            recoveryStatus: null,
            landlordDeductionStatus: null,
            suggestedActions: ["Keep in history"],
        });
    }

    defaulters.sort((a, b) => b.daysDefaulted - a.daysDefaulted || b.outstandingBalance - a.outstandingBalance);
    const qualifyingCount = tenants.filter((tenant) => {
        if (!isActiveTenant(tenant.status)) return false;
        const lease = activeLeaseByTenant.get(tenant.id);
        const room = (lease?.room_id ? roomById.get(lease.room_id) : null) ?? (tenant.room_id ? roomById.get(tenant.room_id) : null);
        return Boolean(room && isActiveRoom(room.status) && liveOutstanding(tenant, room) > 0);
    }).length + vacatedDebts.filter((debt) => {
        const rawRemaining = debt.remaining_amount == null ? amount(debt.final_outstanding_balance ?? debt.original_amount) - amount(debt.recovered_amount) : amount(debt.remaining_amount);
        return Math.max(0, rawRemaining) > 0;
    }).length;
    const displayedCount = defaulters.filter((item) => item.source !== "recently_cleared" && item.outstandingBalance > 0).length;
    const integrityAlerts = qualifyingCount === displayedCount ? [] : [`Data integrity alert: ${qualifyingCount.toLocaleString()} live positive-balance accounts qualify, but ${displayedCount.toLocaleString()} are displayed. Refresh or run defaulter reconciliation before collections.`];
    const activeDefaulters = defaulters.filter((item) => item.source !== "recently_cleared" && item.outstandingBalance > 0);
    const assistant = buildAssistant(activeDefaulters);

    void syncDefaulterNotifications({
        companyId,
        currentDate: dateOnly(now),
        db,
        defaulters: activeDefaulters,
    }).catch((error) => {
        console.warn("Defaulter notifications could not sync:", error instanceof Error ? error.message : error);
    });

    return {
        company: context.activeCompany,
        activeOffice: context.activeOffice,
        isAdmin,
        isCollector,
        offices: offices.map((office) => ({ id: office.id, name: officeName(office) })).sort((a, b) => a.name.localeCompare(b.name)),
        landlords: landlords.map((landlord) => ({ id: landlord.id, name: landlord.full_name ?? "No landlord" })).sort((a, b) => a.name.localeCompare(b.name)),
        properties: properties.map((property) => ({ id: property.id, name: propertyName(property) })).sort((a, b) => a.name.localeCompare(b.name)),
        collectors: [...new Map([...collectorByTenant.values()].map((name) => [name, { id: name, name }])).values()].sort((a, b) => a.name.localeCompare(b.name)),
        defaulters,
        integrityAlerts,
        assistant,
        kpis: buildKpis(defaulters),
        generatedAt: new Date().toISOString(),
        currentDate: dateOnly(now),
    };
}

function buildKpis(items: DefaulterItem[]): DefaultersKpis {
    const activeItems = items.filter((item) => item.source !== "recently_cleared" && item.outstandingBalance > 0);
    const officeRisk = new Map<string, { count: number; outstanding: number }>();
    for (const item of activeItems) {
        const current = officeRisk.get(item.officeName) ?? { count: 0, outstanding: 0 };
        current.count += 1;
        current.outstanding += item.outstandingBalance;
        officeRisk.set(item.officeName, current);
    }
    const highestRiskOffice = [...officeRisk.entries()].sort((a, b) => b[1].outstanding - a[1].outstanding || b[1].count - a[1].count)[0]?.[0] ?? "No defaulters";
    const highestOutstandingTenant = [...activeItems].sort((a, b) => b.outstandingBalance - a.outstandingBalance)[0]?.tenantName ?? "No defaulters";
    const oldestOutstandingAccount = [...activeItems].sort((a, b) => b.daysDefaulted - a.daysDefaulted || b.outstandingBalance - a.outstandingBalance)[0];
    return {
        totalDefaulters: activeItems.length,
        totalOutstanding: activeItems.reduce((total, item) => total + item.outstandingBalance, 0),
        defaultersAddedToday: activeItems.filter((item) => item.daysDefaulted <= 1).length,
        clearedToday: items.filter((item) => item.source === "recently_cleared" && item.clearedDate === dateOnly()).length,
        highRiskDefaulters: activeItems.filter((item) => item.riskLevel === "high").length,
        promisesDueToday: activeItems.filter((item) => item.promiseStatus === "Due today").length,
        vacatedWithDebt: activeItems.filter((item) => item.source === "vacated_debt").length,
        oldestOutstandingAccount: oldestOutstandingAccount ? `${oldestOutstandingAccount.tenantName} (${oldestOutstandingAccount.daysDefaulted} days)` : "No defaulters",
        defaultedOneToSevenDays: activeItems.filter((item) => item.daysDefaulted >= 1 && item.daysDefaulted <= 7).length,
        defaultedEightToThirtyDays: activeItems.filter((item) => item.daysDefaulted >= 8 && item.daysDefaulted <= 30).length,
        defaultedOneMonthPlus: activeItems.filter((item) => item.daysDefaulted >= 30).length,
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

function emptyData(isAdmin: boolean, isCollector: boolean, currentDate: string): DefaultersPageData {
    return {
        company: null,
        activeOffice: null,
        isAdmin,
        isCollector,
        offices: [],
        landlords: [],
        properties: [],
        collectors: [],
        defaulters: [],
        integrityAlerts: [],
        assistant: buildAssistant([]),
        kpis: buildKpis([]),
        generatedAt: new Date().toISOString(),
        currentDate,
    };
}
