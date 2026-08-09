import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/permissions";
import { bearerTokenFromRequest, requireDesktopContext } from "@/lib/offline/desktop-session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type DynamicDb = {
    from: (table: string) => any;
};

type CacheRecord = {
    cache_type: string;
    id: string;
    office_id: string | null;
    search_text: string;
    payload: Record<string, unknown>;
    revision: string | null;
    synced_at: string;
};

function rowText(row: Record<string, unknown>, fields: string[]) {
    return fields.map((field) => String(row[field] ?? "")).join(" ").replace(/\s+/g, " ").trim().toLowerCase();
}

function officeIdsForContext(context: Awaited<ReturnType<typeof requireAuth>>) {
    if (context.canAccessAllOffices) return null;
    return context.offices.map((office) => office.id);
}

function scopeOffice(query: any, officeIds: string[] | null) {
    if (!officeIds) return query;
    if (!officeIds.length) return query.eq("office_id", "__none__");
    return query.in("office_id", officeIds);
}

function toCacheRecords(cacheType: string, rows: Record<string, unknown>[], fields: string[], syncedAt: string): CacheRecord[] {
    return rows
        .filter((row) => row.id)
        .map((row) => ({
            cache_type: cacheType,
            id: String(row.id),
            office_id: row.office_id ? String(row.office_id) : null,
            payload: row,
            revision: String(row.updated_at ?? row.created_at ?? ""),
            search_text: rowText(row, fields),
            synced_at: syncedAt,
        }));
}

async function safeRows(query: any) {
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as Record<string, unknown>[];
}

function cors(response: NextResponse) {
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "content-type, authorization");
    return response;
}

export function OPTIONS() {
    return cors(new NextResponse(null, { status: 204 }));
}

async function authContext(request: Request) {
    return bearerTokenFromRequest(request) ? requireDesktopContext(request) : requireAuth();
}

export async function GET(request: Request) {
    const context = await authContext(request);
    if (!context.activeCompany?.id || !context.profile?.id) {
        return cors(NextResponse.json({ success: false, code: "AUTH_CONTEXT_MISSING", message: "Active company and user are required." }, { status: 400 }));
    }

    const db = createSupabaseAdminClient() as unknown as DynamicDb;
    const companyId = context.activeCompany.id;
    const officeIds = officeIdsForContext(context);
    const syncedAt = new Date().toISOString();

    try {
        const [
            offices,
            employees,
            landlords,
            rooms,
            tenants,
            leases,
            collections,
            promises,
            defaulters,
            expenseCategories,
            securityDeposits,
        ] = await Promise.all([
            safeRows(db.from("offices").select("id, company_id, office_name, name, status, updated_at, created_at").eq("company_id", companyId).ilike("status", "active").limit(500)),
            safeRows(db.from("employees").select("id, company_id, office_id, full_name, phone, employee_code, position, status, updated_at, created_at").eq("company_id", companyId).in("status", ["active", "Active"]).limit(1000)),
            safeRows(scopeOffice(db.from("landlords").select("id, company_id, office_id, full_name, name, phone, status, updated_at, created_at").eq("company_id", companyId).limit(5000), officeIds)),
            safeRows(scopeOffice(db.from("rooms").select("id, company_id, office_id, property_id, landlord_id, room_number, normalized_room_number, monthly_rent, outstanding_balance, status, updated_at, created_at").eq("company_id", companyId).limit(15000), officeIds)),
            safeRows(scopeOffice(db.from("tenants").select("id, company_id, office_id, property_id, room_id, full_name, phone, alternative_phone, monthly_rent, balance, status, updated_at, created_at").eq("company_id", companyId).limit(15000), officeIds)),
            safeRows(scopeOffice(db.from("leases").select("id, company_id, office_id, property_id, room_id, tenant_id, monthly_rent, start_date, billing_day, status, updated_at, created_at").eq("company_id", companyId).eq("status", "active").limit(15000), officeIds)),
            safeRows(scopeOffice(db.from("collections").select("id, company_id, office_id, tenant_id, room_id, amount, amount_paid, payment_method, payment_date, paid_at, status, collected_by_employee_id, recorded_by_employee_id, updated_at, created_at").eq("company_id", companyId).order("payment_date", { ascending: false }).limit(3000), officeIds)),
            safeRows(scopeOffice(db.from("promises").select("id, company_id, office_id, tenant_id, room_id, promise_date, promised_amount, status, notes, updated_at, created_at").eq("company_id", companyId).limit(5000), officeIds)),
            safeRows(scopeOffice(db.from("tenants").select("id, company_id, office_id, room_id, full_name, phone, balance, status, updated_at, created_at").eq("company_id", companyId).gt("balance", 0).limit(10000), officeIds)),
            safeRows(db.from("expense_categories").select("id, company_id, name, category_type, status, updated_at, created_at").eq("company_id", companyId).limit(1000)),
            safeRows(scopeOffice(db.from("security_deposit_register").select("id, company_id, office_id, tenant_id, room_id, amount, liability_balance, cash_available, status, updated_at, created_at").eq("company_id", companyId).limit(5000), officeIds)),
        ]);

        const cacheRecords = [
            ...toCacheRecords("office", offices, ["office_name", "name", "status"], syncedAt),
            ...toCacheRecords("employee", employees, ["full_name", "phone", "employee_code", "position"], syncedAt),
            ...toCacheRecords("landlord", landlords, ["full_name", "name", "phone"], syncedAt),
            ...toCacheRecords("room", rooms, ["room_number", "normalized_room_number", "status"], syncedAt),
            ...toCacheRecords("tenant", tenants, ["full_name", "phone", "alternative_phone", "status"], syncedAt),
            ...toCacheRecords("lease", leases, ["tenant_id", "room_id", "status"], syncedAt),
            ...toCacheRecords("collection", collections, ["payment_method", "status", "payment_date"], syncedAt),
            ...toCacheRecords("promise", promises, ["status", "notes"], syncedAt),
            ...toCacheRecords("defaulter", defaulters, ["full_name", "phone", "room_number", "status"], syncedAt),
            ...toCacheRecords("expense_configuration", expenseCategories, ["name", "category_type"], syncedAt),
            ...toCacheRecords("security_deposit", securityDeposits, ["status", "tenant_id", "room_id"], syncedAt),
        ];

        return cors(NextResponse.json({
            success: true,
            bootstrap: {
                company: context.activeCompany,
                employeeId: (context.profile as unknown as { employee_id?: string | null }).employee_id ?? null,
                offices: context.offices,
                permissions: context.permissions,
                profile: {
                    id: context.profile.id,
                    fullName: context.profile.full_name,
                    accountType: (context.profile as unknown as { account_type?: string | null }).account_type ?? null,
                },
                roleKeys: context.roles.map((role) => role.role?.key).filter(Boolean),
                syncedAt,
            },
            records: cacheRecords,
            progress: [
                { label: "Rooms", count: rooms.length },
                { label: "Tenants", count: tenants.length },
                { label: "Balances", count: tenants.length + rooms.length },
                { label: "Defaulters", count: defaulters.length },
                { label: "Configuration", count: expenseCategories.length },
            ],
        }));
    } catch (error) {
        const message = error instanceof Error ? error.message : "Desktop offline workspace could not be prepared.";
        return cors(NextResponse.json({ success: false, code: "DESKTOP_BOOTSTRAP_FAILED", message }, { status: 500 }));
    }
}
