import { getScopedSupabase } from "@/lib/auth/query";
import { requireAuth, requirePermission } from "@/lib/auth/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
    CollectionActionRow,
    CollectionRow,
    PromiseCentreData,
    PromiseFollowupRow,
    PromiseItem,
    PromiseKpis,
    PromiseTenantOption,
    RoomRow,
    TenantRow,
    UserRow,
} from "./types";

function dateOnly(date: Date) {
    return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
}

function emptyKpis(): PromiseKpis {
    return {
        dueToday: 0,
        dueTomorrow: 0,
        overdue: 0,
        fulfilled: 0,
        broken: 0,
        recoveryRate: 0,
    };
}

export async function getPromiseCentreData(): Promise<PromiseCentreData> {
    const context = await requirePermission("collections.read");
    const { supabase } = await getScopedSupabase();
    const companyId = context.activeCompany?.id;
    const officeId = context.activeOffice?.id;
    const searchAllOffices = context.canAccessAllOffices || context.isCompanyAdmin;

    if (!companyId || !officeId) {
        return emptyData();
    }

    const today = dateOnly(new Date());
    const tomorrow = dateOnly(addDays(new Date(), 1));

    let promisesQuery = supabase
        .from("promises")
        .select("*")
        .eq("company_id", companyId)
        .order("promised_date", { ascending: true, nullsFirst: false });

    if (!searchAllOffices) {
        promisesQuery = promisesQuery.eq("office_id", officeId);
    }

    const { data: promises, error } = await promisesQuery;

    if (error) {
        throw new Error(error.message);
    }

    const items = await hydratePromiseItems(promises ?? [], companyId, searchAllOffices ? null : officeId);
    const fulfilled = items.filter((promise) => promise.status === "fulfilled");
    const broken = items.filter((promise) => promise.status === "broken");
    const dueToday = items.filter((promise) => promise.promised_date === today && !isClosed(promise.status));
    const dueTomorrow = items.filter((promise) => promise.promised_date === tomorrow && !isClosed(promise.status));
    const overdue = items.filter(
        (promise) => Boolean(promise.promised_date && promise.promised_date < today && !isClosed(promise.status)),
    );
    const closed = fulfilled.length + broken.length;
    const recoveryRate = closed ? Math.round((fulfilled.length / closed) * 100) : 0;

    const recentFollowups = items
        .flatMap((promise) =>
            promise.followups.map((followup) => ({
                ...followup,
                tenantName: promise.tenantName,
            })),
        )
        .sort((left, right) => right.created_at.localeCompare(left.created_at))
        .slice(0, 10);

    return {
        kpis: {
            dueToday: dueToday.length,
            dueTomorrow: dueTomorrow.length,
            overdue: overdue.length,
            fulfilled: fulfilled.length,
            broken: broken.length,
            recoveryRate,
        },
        ledger: items
            .slice()
            .sort((left, right) => {
                const leftDate = left.promised_date ?? left.promise_date ?? "";
                const rightDate = right.promised_date ?? right.promise_date ?? "";
                return leftDate.localeCompare(rightDate) || String(left.created_at ?? "").localeCompare(String(right.created_at ?? ""));
            }),
        dueToday,
        dueTomorrow,
        overdue,
        fulfilled: fulfilled.slice(0, 10),
        broken: broken.slice(0, 10),
        recentFollowups,
    };
}

export async function searchPromiseTenants(query: string): Promise<PromiseTenantOption[]> {
    const term = query.trim();

    if (term.length < 2) {
        return [];
    }

    const context = await requirePermission("collections.read");
    const { supabase } = await getScopedSupabase();
    const companyId = context.activeCompany?.id;
    const officeId = context.activeOffice?.id;

    if (!companyId || !officeId) {
        return [];
    }

    const searchAllOffices = context.canAccessAllOffices || context.isCompanyAdmin;
    const fastResults = searchAllOffices ? await searchPromiseTenantRpc(term) : null;
    if (fastResults && fastResults.length > 1) {
        return fastResults;
    }

    const roomIds = await findMatchingRoomIds(term, companyId, searchAllOffices ? null : officeId);
    const tenantById = new Map<string, TenantRow>();

    const directTenantQuery = supabase
        .from("tenants")
        .select("*")
        .eq("company_id", companyId)
        .eq("status", "active")
        .or(`full_name.ilike.%${term}%,phone.ilike.%${term}%,tenant_code.ilike.%${term}%`)
        .order("full_name")
        .limit(searchAllOffices ? 10 : 50);

    const { data: tenants, error } = await directTenantQuery;

    if (error) {
        throw new Error(error.message);
    }

    for (const tenant of tenants ?? []) {
        tenantById.set(tenant.id, tenant);
    }

    if (roomIds.length) {
        const [{ data: roomTenants, error: roomTenantError }, { data: roomLeases, error: leaseError }] = await Promise.all([
            supabase
                .from("tenants")
                .select("*")
                .eq("company_id", companyId)
                .eq("status", "active")
                .in("room_id", roomIds)
                .limit(25),
            supabase
                .from("leases")
                .select("*")
                .eq("company_id", companyId)
                .in("room_id", roomIds)
                .eq("status", "active")
                .limit(25),
        ]);

        if (roomTenantError) throw new Error(roomTenantError.message);
        if (leaseError) throw new Error(leaseError.message);

        for (const tenant of roomTenants ?? []) {
            if (searchAllOffices || tenant.office_id === officeId || !tenant.office_id) {
                tenantById.set(tenant.id, tenant);
            }
        }

        const leaseTenantIds = [...new Set((roomLeases ?? []).map((lease) => lease.tenant_id).filter((id): id is string => Boolean(id)))];
        if (leaseTenantIds.length) {
            const { data: leaseTenants, error: leaseTenantError } = await supabase
                .from("tenants")
                .select("*")
                .eq("company_id", companyId)
                .eq("status", "active")
                .in("id", leaseTenantIds);

            if (leaseTenantError) throw new Error(leaseTenantError.message);

            for (const tenant of leaseTenants ?? []) {
                tenantById.set(tenant.id, tenant);
            }
        }
    }

    const candidateTenants = [...tenantById.values()];
    const candidateTenantIds = candidateTenants.map((tenant) => tenant.id);
    const { data: leases } = candidateTenantIds.length
        ? await supabase
            .from("leases")
            .select("tenant_id, office_id, room_id")
            .eq("company_id", companyId)
            .eq("status", "active")
            .in("tenant_id", candidateTenantIds)
        : { data: [] as Array<{ tenant_id: string | null; office_id: string | null; room_id: string | null }> };
    const leaseByTenant = new Map((leases ?? []).map((lease) => [lease.tenant_id, lease]));

    const resultTenants = candidateTenants
        .filter((tenant) => {
            if (searchAllOffices) return true;
            const lease = leaseByTenant.get(tenant.id);
            const resolvedOfficeId = lease?.office_id ?? tenant.office_id ?? null;
            return resolvedOfficeId === officeId;
        })
        .slice(0, 10);
    const resultRoomIds = [...new Set(resultTenants.map((tenant) => tenant.room_id).filter((id): id is string => Boolean(id)))];
    const { data: rooms } = resultRoomIds.length
        ? await supabase.from("rooms").select("*").eq("company_id", companyId).in("id", resultRoomIds)
        : { data: [] as RoomRow[] };
    const roomById = new Map((rooms ?? []).map((room) => [room.id, room]));
    const landlordIds = [...new Set((rooms ?? []).map((room) => (room as { landlord_id?: string | null }).landlord_id).filter((id): id is string => Boolean(id)))];
    const officeIds = [...new Set((rooms ?? []).map((room) => room.office_id).filter((id): id is string => Boolean(id)))];
    const [{ data: landlordRows }, { data: officeRows }] = await Promise.all([
        landlordIds.length ? supabase.from("landlords").select("id,full_name").eq("company_id", companyId).in("id", landlordIds) : { data: [] },
        officeIds.length ? supabase.from("offices").select("id,office_name,name").eq("company_id", companyId).in("id", officeIds) : { data: [] },
    ]);
    const landlordById = new Map((landlordRows ?? []).map((landlord) => [String(landlord.id), String(landlord.full_name ?? "Landlord")]));
    const officeById = new Map((officeRows ?? []).map((office) => [String(office.id), String(office.office_name ?? office.name ?? "Office")]));

    const mappedResults = resultTenants
        .filter((tenant) => {
            if (searchAllOffices) return true;
            const lease = leaseByTenant.get(tenant.id);
            const room = tenant.room_id ? roomById.get(tenant.room_id) ?? null : null;
            return (lease?.office_id ?? room?.office_id ?? tenant.office_id ?? null) === officeId;
        })
        .map((tenant) => ({
            id: tenant.id,
            fullName: tenant.full_name ?? "Unnamed tenant",
            phone: tenant.phone,
            roomId: tenant.room_id,
            roomNumber: tenant.room_id ? roomById.get(tenant.room_id)?.room_number ?? null : null,
            landlordName: tenant.room_id ? landlordById.get(String((roomById.get(tenant.room_id) as { landlord_id?: string | null } | undefined)?.landlord_id ?? "")) ?? null : null,
            officeName: tenant.room_id ? officeById.get(String(roomById.get(tenant.room_id)?.office_id ?? "")) ?? null : null,
            roomStatus: tenant.room_id ? roomById.get(tenant.room_id)?.status ?? null : null,
            balance: Number(tenant.balance ?? 0),
        }));

    return mappedResults.length ? mappedResults : fastResults ?? [];
}

type TenantSearchRpcRow = {
    tenant: TenantRow;
    room: RoomRow | null;
    outstanding_balance: number | null;
};

type TenantSearchRpc = (
    fn: "ddumba_v1_search_tenants",
    args: { search_term: string; result_limit: number },
) => Promise<{ data: TenantSearchRpcRow[] | null; error: { message: string } | null }>;

async function searchPromiseTenantRpc(term: string): Promise<PromiseTenantOption[] | null> {
    const supabase = await createSupabaseServerClient();
    const rpc = supabase.rpc.bind(supabase) as unknown as TenantSearchRpc;
    const { data, error } = await rpc("ddumba_v1_search_tenants", {
        search_term: term,
        result_limit: 10,
    });

    if (error) {
        if (/function .*ddumba_v1_search_tenants/i.test(error.message)) {
            return null;
        }
        throw new Error(error.message);
    }

    return (data ?? []).map((row) => ({
        id: row.tenant.id,
        fullName: row.tenant.full_name ?? "Unnamed tenant",
        phone: row.tenant.phone,
        roomId: row.tenant.room_id ?? row.room?.id ?? null,
        roomNumber: row.room?.room_number ?? null,
        landlordName: null,
        officeName: null,
        roomStatus: row.room?.status ?? null,
        balance: Number(row.outstanding_balance ?? row.tenant.balance ?? row.room?.outstanding_balance ?? 0),
    }));
}

export async function getPromiseInActiveOffice(promiseId: string) {
    const context = await requireAuth();
    const { supabase } = await getScopedSupabase();
    const isCollector = context.authMode === "collector" || context.roles.some((role) => role.role?.key === "field_collector");

    if (!isCollector && !(context.isCompanyAdmin || context.permissions.includes("collections.read") || context.permissions.includes("collections.manage"))) {
        throw new Error("You do not have permission to read promises.");
    }
    if (!context.activeCompany?.id || (!isCollector && !context.activeOffice?.id)) {
        throw new Error("Active company and office are required.");
    }

    const query = supabase
        .from("promises")
        .select("*")
        .eq("id", promiseId)
        .eq("company_id", context.activeCompany.id);

    if (!(context.canAccessAllOffices || context.isCompanyAdmin || isCollector)) {
        query.eq("office_id", context.activeOffice!.id);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
        throw new Error(error.message);
    }

    if (!data) {
        throw new Error("Promise not found in the accessible office scope.");
    }

    return data;
}

export async function getTenantForPromise(tenantId: string) {
    const context = await requireAuth();
    const { supabase } = await getScopedSupabase();
    const isCollector = context.authMode === "collector" || context.roles.some((role) => role.role?.key === "field_collector");

    if (!isCollector && !(context.isCompanyAdmin || context.permissions.includes("collections.read") || context.permissions.includes("collections.manage"))) {
        throw new Error("You do not have permission to read tenant promises.");
    }
    if (!context.activeCompany?.id || (!isCollector && !context.activeOffice?.id)) {
        throw new Error("Active company and office are required.");
    }

    const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .eq("id", tenantId)
        .eq("company_id", context.activeCompany.id)
        .maybeSingle();

    if (error) {
        throw new Error(error.message);
    }

    if (!data) {
        throw new Error("Tenant not found in the active office.");
    }

    const searchAllOffices = context.canAccessAllOffices || context.isCompanyAdmin || isCollector;
    if (!searchAllOffices && data.office_id !== context.activeOffice?.id) {
        const [{ data: room }, { data: lease }] = await Promise.all([
            data.room_id
            ? await supabase
                .from("rooms")
                .select("office_id")
                .eq("id", data.room_id)
                .eq("company_id", context.activeCompany.id)
                .maybeSingle()
            : { data: null },
            supabase
                .from("leases")
                .select("office_id")
                .eq("tenant_id", data.id)
                .eq("company_id", context.activeCompany.id)
                .eq("status", "active")
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle(),
        ]);

        if ((lease?.office_id ?? room?.office_id ?? null) !== context.activeOffice?.id) {
            throw new Error("Tenant not found in the active office.");
        }
    }

    return data;
}

async function findMatchingRoomIds(term: string, companyId: string, officeId: string | null) {
    const { supabase } = await getScopedSupabase();
    let query = supabase
        .from("rooms")
        .select("id")
        .eq("company_id", companyId)
        .ilike("room_number", `${escapePromiseLike(term)}%`)
        .order("room_number")
        .limit(25);

    if (officeId) {
        query = query.eq("office_id", officeId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data ?? []).map((room) => room.id);
}

function escapePromiseLike(value: string) {
    return value.replace(/[%_]/g, (match) => `\\${match}`);
}

export async function getPromiseTenantWriteContext(tenantId: string) {
    const context = await requireAuth();
    const { supabase } = await getScopedSupabase();
    const isCollector = context.authMode === "collector" || context.roles.some((role) => role.role?.key === "field_collector");
    const tenant = await getTenantForPromise(tenantId);

    if (!isCollector && !(context.isCompanyAdmin || context.permissions.includes("collections.read") || context.permissions.includes("collections.manage"))) {
        throw new Error("You do not have permission to write tenant promises.");
    }
    if (!context.activeCompany?.id || (!isCollector && !context.activeOffice?.id)) {
        throw new Error("Active company and office are required.");
    }

    const [{ data: room }, { data: lease }] = await Promise.all([
        tenant.room_id
            ? supabase
                .from("rooms")
                .select("*")
                .eq("id", tenant.room_id)
                .eq("company_id", context.activeCompany.id)
                .maybeSingle()
            : { data: null as RoomRow | null },
        supabase
            .from("leases")
            .select("*")
            .eq("tenant_id", tenant.id)
            .eq("company_id", context.activeCompany.id)
            .eq("status", "active")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
    ]);

    const resolvedOfficeId = tenant.office_id ?? room?.office_id ?? lease?.office_id ?? context.activeOffice?.id ?? null;
    if (!resolvedOfficeId) throw new Error("Tenant is missing office assignment.");
    const searchAllOffices = context.canAccessAllOffices || context.isCompanyAdmin || isCollector;

    if (!searchAllOffices && resolvedOfficeId !== context.activeOffice?.id) {
        throw new Error("Tenant belongs to another office.");
    }

    return {
        tenant,
        room,
        lease,
        officeId: resolvedOfficeId,
    };
}

async function hydratePromiseItems(promises: PromiseItemBase[], companyId: string, officeId: string | null) {
    const { supabase } = await getScopedSupabase();
    const promiseIds = promises.map((promise) => promise.id);
    const tenantIds = [...new Set(promises.map((promise) => promise.tenant_id).filter((id): id is string => Boolean(id)))];
    const userIds = [...new Set(promises.map((promise) => promise.created_by).filter((id): id is string => Boolean(id)))];
    const roomIds = [...new Set(promises.map((promise) => promise.room_id).filter((id): id is string => Boolean(id)))];
    const officeIds = [...new Set(promises.map((promise) => promise.office_id).filter((id): id is string => Boolean(id)))];

    const [tenants, users, rooms, offices, collections, followups, actions] = await Promise.all([
        tenantIds.length
            ? supabase.from("tenants").select("*").eq("company_id", companyId).in("id", tenantIds)
            : { data: [] as TenantRow[] },
        userIds.length
            ? supabase.from("users").select("*").eq("company_id", companyId).in("id", userIds)
            : { data: [] as UserRow[] },
        roomIds.length
            ? supabase.from("rooms").select("*").eq("company_id", companyId).in("id", roomIds)
            : { data: [] as RoomRow[] },
        officeIds.length
            ? supabase.from("offices").select("id,office_name,name").eq("company_id", companyId).in("id", officeIds)
            : { data: [] as Array<{ id: string; office_name: string | null; name: string | null }> },
        tenantIds.length
            ? supabase
                .from("collections")
                .select("*")
                .eq("company_id", companyId)
                .in("tenant_id", tenantIds)
                .order("paid_at", { ascending: false, nullsFirst: false })
            : { data: [] as CollectionRow[] },
        promiseIds.length
            ? supabase.from("promise_followups").select("*").eq("company_id", companyId).in("promise_id", promiseIds)
            : { data: [] as PromiseFollowupRow[] },
        tenantIds.length
            ? supabase
                .from("collection_actions")
                .select("*")
                .eq("company_id", companyId)
                .in("tenant_id", tenantIds)
            : { data: [] as CollectionActionRow[] },
    ]);

    const tenantById = new Map((tenants.data ?? []).map((tenant) => [tenant.id, tenant]));
    const userById = new Map((users.data ?? []).map((user) => [user.id, user]));
    const roomById = new Map((rooms.data ?? []).map((room) => [room.id, room]));
    const officeById = new Map((offices.data ?? []).map((office) => [office.id, office.office_name ?? office.name ?? "Office"]));

    return promises.map((promise): PromiseItem => {
        const tenant = promise.tenant_id ? tenantById.get(promise.tenant_id) ?? null : null;
        const room = promise.room_id ? roomById.get(promise.room_id) ?? null : null;
        const lastCollection =
            (collections.data ?? []).find((collection) => collection.tenant_id === promise.tenant_id) ?? null;
        const promiseFollowups = (followups.data ?? []).filter((followup) => followup.promise_id === promise.id);
        const actionCount = (actions.data ?? []).filter((action) => action.tenant_id === promise.tenant_id).length;

        return {
            ...promise,
            tenantName: tenant?.full_name ?? null,
            tenantPhone: tenant?.phone ?? null,
            tenantBalance: Number(tenant?.balance ?? 0),
            roomNumber: room?.room_number ?? null,
            officeName: promise.office_id ? officeById.get(promise.office_id) ?? null : null,
            createdByName: promise.created_by ? userById.get(promise.created_by)?.full_name ?? null : null,
            lastCollectionAmount: lastCollection ? Number(lastCollection.amount_paid ?? lastCollection.amount ?? 0) : null,
            lastCollectionAt: lastCollection?.paid_at ?? null,
            followups: promiseFollowups,
            actionCount,
        };
    });
}

function isClosed(status: string | null) {
    return status === "fulfilled" || status === "broken";
}

function emptyData(): PromiseCentreData {
    return {
        kpis: emptyKpis(),
        ledger: [],
        dueToday: [],
        dueTomorrow: [],
        overdue: [],
        fulfilled: [],
        broken: [],
        recentFollowups: [],
    };
}

type PromiseItemBase = Omit<PromiseItem, "tenantName" | "tenantPhone" | "tenantBalance" | "roomNumber" | "officeName" | "createdByName" | "lastCollectionAmount" | "lastCollectionAt" | "followups" | "actionCount">;
