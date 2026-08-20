import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/permissions";
import { searchFastPaymentTenants } from "@/lib/collections/data";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SearchResult = {
    id: string;
    type: "room" | "tenant" | "landlord" | "employee" | "payment" | "receipt" | "expense" | "promise" | "vacant_room" | "security_deposit" | "landlord_payment";
    title: string;
    subtitle: string;
    details: string[];
    href: string;
    amount?: number;
};

type LooseSupabase = {
    from: (table: string) => any;
};

function clean(value: unknown) {
    return String(value ?? "").trim();
}

function normalize(value: unknown) {
    return String(value ?? "").trim().toLowerCase();
}

function money(value: unknown) {
    const amount = Number(value ?? 0);
    return `UGX ${Math.round(Number.isFinite(amount) ? amount : 0).toLocaleString()}`;
}

function likeValue(value: string) {
    return `%${value.replaceAll("%", "").replaceAll("_", "").slice(0, 80)}%`;
}

function activeOfficeName(row: Record<string, unknown>) {
    return clean(row.office_name as string | null) || clean(row.name as string | null) || "Office";
}

function canReadAllOffices(context: Awaited<ReturnType<typeof requireAuth>>) {
    return (context.isCompanyAdmin || context.isCompanyReadOnlyManager || context.canAccessAllOffices) && !context.isOfficeMode;
}

function requestedOfficeScope(request: NextRequest, context: Awaited<ReturnType<typeof requireAuth>>) {
    const canSeeAll = canReadAllOffices(context);
    const requested = request.nextUrl.searchParams.get("officeId")?.trim() || null;
    const allowed = new Set(context.offices.map((office) => office.id));
    if (canSeeAll && requested && allowed.has(requested)) return requested;
    if (canSeeAll) return null;
    return context.activeOffice?.id ?? null;
}

function scopeRowsByOffice<T extends Record<string, unknown>>(rows: T[], officeId: string | null) {
    if (!officeId) return rows;
    return rows.filter((row) => row.office_id === officeId || row.officeId === officeId);
}

function resultLimit<T>(rows: T[], limit = 8) {
    return rows.slice(0, limit);
}

export async function GET(request: NextRequest) {
    const context = await requireAuth();
    const companyId = context.activeCompany?.id ?? null;
    const q = clean(request.nextUrl.searchParams.get("q")).slice(0, 80);
    const officeId = requestedOfficeScope(request, context);
    const allOffices = canReadAllOffices(context) && !officeId;
    if (!companyId || q.length < 2) {
        return NextResponse.json({ results: {}, offices: context.offices }, { headers: { "Cache-Control": "no-store" } });
    }

    const supabase = (await createSupabaseServerClient()) as unknown as LooseSupabase;
    const like = likeValue(q);
    const compactNeedle = normalize(q).replace(/[^a-z0-9]+/g, "");

    const officeResult = await supabase.from("offices").select("id, name, office_name").eq("company_id", companyId);
    const officeById = new Map(((officeResult.data ?? []) as Array<Record<string, unknown>>).map((office) => [String(office.id), activeOfficeName(office)]));

    const safe = async <T>(task: Promise<T>, fallback: T): Promise<T> => {
        try {
            return await task;
        } catch {
            return fallback;
        }
    };

    const tenantTask = safe(
        searchFastPaymentTenants(q, null, { allOffices, officeId: officeId ?? undefined }),
        [],
    );

    const landlordTask = safe((async () => {
        let query = supabase
            .from("landlord_search_index")
            .select("landlord_id, office_id, landlord_name, phone, office_name, location_text, room_numbers_text, room_count, rent_roll, searchable_text")
            .eq("company_id", companyId)
            .or([
                `landlord_name.ilike.${like}`,
                `phone.ilike.${like}`,
                `office_name.ilike.${like}`,
                `location_text.ilike.${like}`,
                `room_numbers_text.ilike.${like}`,
                `searchable_text.ilike.${like}`,
            ].join(","))
            .order("landlord_name", { ascending: true, nullsFirst: false })
            .limit(10);
        if (officeId) query = query.eq("office_id", officeId);
        const { data, error } = await query;
        if (error) throw error;
        return (data ?? []) as Array<Record<string, unknown>>;
    })(), []);

    const employeeTask = safe((async () => {
        let query = supabase
            .from("employees")
            .select("id, full_name, phone, role, job_title, employee_code, office_id, status")
            .eq("company_id", companyId)
            .or([`full_name.ilike.${like}`, `phone.ilike.${like}`, `role.ilike.${like}`, `job_title.ilike.${like}`, `employee_code.ilike.${like}`].join(","))
            .neq("status", "archived")
            .order("full_name", { ascending: true, nullsFirst: false })
            .limit(10);
        if (officeId) query = query.eq("office_id", officeId);
        const { data, error } = await query;
        if (error) throw error;
        return (data ?? []) as Array<Record<string, unknown>>;
    })(), []);

    const collectionsTask = safe((async () => {
        let query = supabase
            .from("collections")
            .select("id, collection_number, reference_number, amount, amount_paid, payment_method, payment_date, paid_at, office_id, tenant_id, room_id, entered_by_name, status")
            .eq("company_id", companyId)
            .or([`collection_number.ilike.${like}`, `reference_number.ilike.${like}`, `entered_by_name.ilike.${like}`, `payment_method.ilike.${like}`].join(","))
            .order("payment_date", { ascending: false, nullsFirst: false })
            .limit(10);
        if (officeId) query = query.eq("office_id", officeId);
        const { data, error } = await query;
        if (error) throw error;
        return (data ?? []) as Array<Record<string, unknown>>;
    })(), []);

    const receiptsTask = safe((async () => {
        let query = supabase
            .from("receipts")
            .select("id, receipt_number, payment_id, issued_to, issued_at, office_id, status")
            .eq("company_id", companyId)
            .or([`receipt_number.ilike.${like}`, `issued_to.ilike.${like}`].join(","))
            .order("issued_at", { ascending: false })
            .limit(10);
        if (officeId) query = query.eq("office_id", officeId);
        const { data, error } = await query;
        if (error) throw error;
        return (data ?? []) as Array<Record<string, unknown>>;
    })(), []);

    const expensesTask = safe((async () => {
        let query = supabase
            .from("expenses")
            .select("id, expense_number, item, category, vendor, description, amount, expense_date, office_id")
            .eq("company_id", companyId)
            .or([`expense_number.ilike.${like}`, `item.ilike.${like}`, `category.ilike.${like}`, `vendor.ilike.${like}`, `description.ilike.${like}`].join(","))
            .order("expense_date", { ascending: false, nullsFirst: false })
            .limit(10);
        if (officeId) query = query.eq("office_id", officeId);
        const { data, error } = await query;
        if (error) throw error;
        return (data ?? []) as Array<Record<string, unknown>>;
    })(), []);

    const promisesTask = safe((async () => {
        let query = supabase
            .from("promises")
            .select("id, promised_amount, amount, promised_date, promise_date, status, entered_by_name, office_id, tenant_id, room_id, notes")
            .eq("company_id", companyId)
            .or([`entered_by_name.ilike.${like}`, `notes.ilike.${like}`, `status.ilike.${like}`].join(","))
            .order("promised_date", { ascending: true, nullsFirst: false })
            .limit(10);
        if (officeId) query = query.eq("office_id", officeId);
        const { data, error } = await query;
        if (error) throw error;
        return (data ?? []) as Array<Record<string, unknown>>;
    })(), []);

    const vacantRoomsTask = safe((async () => {
        let query = supabase
            .from("rooms")
            .select("id, room_number, monthly_rent, status, office_id, property_id, landlord_id")
            .eq("company_id", companyId)
            .ilike("room_number", like)
            .in("status", ["vacant", "Vacant", "available", "Available"])
            .order("room_number", { ascending: true })
            .limit(10);
        if (officeId) query = query.eq("office_id", officeId);
        const { data, error } = await query;
        if (error) throw error;
        return (data ?? []) as Array<Record<string, unknown>>;
    })(), []);

    const landlordPaymentsTask = safe((async () => {
        let query = supabase
            .from("landlord_payments")
            .select("id, amount, paid_at, payment_method, payout_reference, status, office_id, landlord_id")
            .eq("company_id", companyId)
            .or([`payout_reference.ilike.${like}`, `payment_method.ilike.${like}`, `status.ilike.${like}`].join(","))
            .order("paid_at", { ascending: false, nullsFirst: false })
            .limit(10);
        if (officeId) query = query.eq("office_id", officeId);
        const { data, error } = await query;
        if (error) throw error;
        return (data ?? []) as Array<Record<string, unknown>>;
    })(), []);

    const [tenants, landlords, employees, collections, receipts, expenses, promises, vacantRooms, landlordPayments] = await Promise.all([
        tenantTask,
        landlordTask,
        employeeTask,
        collectionsTask,
        receiptsTask,
        expensesTask,
        promisesTask,
        vacantRoomsTask,
        landlordPaymentsTask,
    ]);

    const tenantResults: SearchResult[] = [];
    const roomResults: SearchResult[] = [];
    for (const item of tenants) {
        const roomNumber = clean(item.room?.room_number);
        const tenantName = clean(item.tenant.full_name) || "Tenant";
        const officeName = clean(item.office?.office_name) || clean(item.office?.name) || officeById.get(clean(item.office?.id)) || "Office";
        const landlordName = clean(item.landlord?.full_name);
        const outstanding = Number(item.monthlyFinancialPosition?.outstanding ?? item.outstandingBalance ?? 0);
        const href = `/office/admin/payments?room=${encodeURIComponent(roomNumber)}&tenant=${encodeURIComponent(item.tenant.id)}`;
        roomResults.push({
            id: `room:${item.room?.id ?? item.tenant.id}`,
            type: "room",
            title: roomNumber ? `Room ${roomNumber}` : tenantName,
            subtitle: `Tenant: ${tenantName}`,
            details: [landlordName ? `Landlord: ${landlordName}` : "", `Office: ${officeName}`, `Outstanding: ${money(outstanding)}`].filter(Boolean),
            href,
            amount: outstanding,
        });
        if ([tenantName, item.tenant.phone, roomNumber].some((value) => normalize(value).includes(normalize(q)))) {
            tenantResults.push({
                id: `tenant:${item.tenant.id}`,
                type: "tenant",
                title: tenantName,
                subtitle: roomNumber ? `Room ${roomNumber}` : officeName,
                details: [clean(item.tenant.phone), `Office: ${officeName}`, `Outstanding: ${money(outstanding)}`].filter(Boolean),
                href,
                amount: outstanding,
            });
        }
    }

    const results = {
        rooms: resultLimit(roomResults),
        tenants: resultLimit(tenantResults),
        landlords: resultLimit(landlords.map((row): SearchResult => ({
            id: `landlord:${row.landlord_id}`,
            type: "landlord",
            title: clean(row.landlord_name) || "Landlord",
            subtitle: `Office: ${clean(row.office_name) || officeById.get(clean(row.office_id)) || "Office"}`,
            details: [clean(row.phone), `${Number(row.room_count ?? 0).toLocaleString()} room(s)`, clean(row.room_numbers_text)].filter(Boolean),
            href: `/office/landlords?landlord=${encodeURIComponent(clean(row.landlord_id))}&section=portfolio`,
        }))),
        employees: resultLimit(scopeRowsByOffice(employees, officeId).map((row): SearchResult => {
            const role = clean(row.role as string | null) || clean(row.job_title as string | null) || "Employee";
            return {
                id: `employee:${row.id}`,
                type: "employee",
                title: clean(row.full_name as string | null) || "Employee",
                subtitle: role,
                details: [officeById.get(clean(row.office_id)) || "Office", clean(row.phone as string | null), clean(row.employee_code as string | null)].filter(Boolean),
                href: `/office/admin/employees?employee=${encodeURIComponent(clean(row.id))}`,
            };
        })),
        payments: resultLimit(collections.map((row): SearchResult => {
            const paidDate = clean(row.payment_date as string | null) || clean(row.paid_at as string | null);
            const amount = Number(row.amount_paid ?? row.amount ?? 0);
            return {
                id: `payment:${row.id}`,
                type: "payment",
                title: money(amount),
                subtitle: [clean(row.collection_number as string | null), clean(row.reference_number as string | null)].filter(Boolean).join(" · ") || "Tenant payment",
                details: [paidDate, clean(row.payment_method as string | null), `Office: ${officeById.get(clean(row.office_id)) || "Office"}`].filter(Boolean),
                href: `/office/receipts?payment=${encodeURIComponent(clean(row.id))}`,
                amount,
            };
        })),
        receipts: resultLimit(receipts.map((row): SearchResult => ({
            id: `receipt:${row.id}`,
            type: "receipt",
            title: clean(row.receipt_number as string | null) || "Receipt",
            subtitle: clean(row.issued_to as string | null) || "Payment receipt",
            details: [clean(row.issued_at as string | null).slice(0, 10), `Office: ${officeById.get(clean(row.office_id)) || "Office"}`, clean(row.status as string | null)].filter(Boolean),
            href: `/office/receipts?receipt=${encodeURIComponent(clean(row.id))}&payment=${encodeURIComponent(clean(row.payment_id))}`,
        }))),
        expenses: resultLimit(expenses.map((row): SearchResult => {
            const amount = Number(row.amount ?? 0);
            return {
                id: `expense:${row.id}`,
                type: "expense",
                title: clean(row.item as string | null) || clean(row.category as string | null) || "Expense",
                subtitle: money(amount),
                details: [clean(row.vendor as string | null), clean(row.expense_date as string | null), `Office: ${officeById.get(clean(row.office_id)) || "Office"}`].filter(Boolean),
                href: `/office/expenses?expense=${encodeURIComponent(clean(row.id))}`,
                amount,
            };
        })),
        promises: resultLimit(promises.map((row): SearchResult => {
            const amount = Number(row.promised_amount ?? row.amount ?? 0);
            return {
                id: `promise:${row.id}`,
                type: "promise",
                title: money(amount),
                subtitle: clean(row.status as string | null) || "Promise",
                details: [clean(row.promised_date as string | null) || clean(row.promise_date as string | null), `Office: ${officeById.get(clean(row.office_id)) || "Office"}`].filter(Boolean),
                href: `/office/promises?promise=${encodeURIComponent(clean(row.id))}`,
                amount,
            };
        })),
        vacantRooms: resultLimit(vacantRooms.map((row): SearchResult => ({
            id: `vacant:${row.id}`,
            type: "vacant_room",
            title: `Room ${clean(row.room_number as string | null)}`,
            subtitle: "Vacant room",
            details: [money(row.monthly_rent), `Office: ${officeById.get(clean(row.office_id)) || "Office"}`],
            href: `/office/admin/vacant-rooms?room=${encodeURIComponent(clean(row.room_number as string | null))}`,
        }))),
        landlordPayments: resultLimit(landlordPayments.map((row): SearchResult => {
            const amount = Number(row.amount ?? 0);
            return {
                id: `landlord-payment:${row.id}`,
                type: "landlord_payment",
                title: money(amount),
                subtitle: clean(row.payout_reference as string | null) || "Landlord payment",
                details: [clean(row.paid_at as string | null).slice(0, 10), clean(row.payment_method as string | null), `Office: ${officeById.get(clean(row.office_id)) || "Office"}`].filter(Boolean),
                href: `/office/expenses?mode=landlord-paid&payment=${encodeURIComponent(clean(row.id))}`,
                amount,
            };
        })),
        securityDeposits: [] as SearchResult[],
    };

    const searched = Object.values(results).flat().filter((item) => {
        const haystack = [item.title, item.subtitle, ...item.details].map(normalize).join(" ");
        return haystack.includes(normalize(q)) || haystack.replace(/[^a-z0-9]+/g, "").includes(compactNeedle);
    });
    const grouped = searched.reduce<Record<string, SearchResult[]>>((acc, item) => {
        const key = item.type === "vacant_room" ? "vacantRooms" : item.type === "landlord_payment" ? "landlordPayments" : `${item.type}s`;
        acc[key] = [...(acc[key] ?? []), item];
        return acc;
    }, {});

    return NextResponse.json(
        {
            results: {
                rooms: grouped.rooms ?? [],
                tenants: grouped.tenants ?? [],
                landlords: grouped.landlords ?? [],
                employees: grouped.employees ?? [],
                payments: grouped.payments ?? [],
                receipts: grouped.receipts ?? [],
                expenses: grouped.expenses ?? [],
                promises: grouped.promises ?? [],
                vacantRooms: grouped.vacantRooms ?? [],
                securityDeposits: grouped.securityDeposits ?? [],
                landlordPayments: grouped.landlordPayments ?? [],
            },
            offices: context.offices.map((office) => ({ id: office.id, name: office.office_name ?? office.name ?? "Office" })),
            scope: { allOffices, officeId },
        },
        { headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=20" } },
    );
}
