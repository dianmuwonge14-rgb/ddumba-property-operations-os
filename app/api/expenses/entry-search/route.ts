import { NextRequest, NextResponse } from "next/server";
import { isCompanyOperationalManager, requirePermission } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function normalizeSearch(value: string) {
    return value.trim().replaceAll("%", "").replaceAll("_", "").slice(0, 80);
}

function isRealEmployee(row: Record<string, unknown>) {
    const haystack = [
        row.account_type,
        row.assignment_type,
        row.employee_assignment_type,
        row.role,
        row.job_title,
        row.full_name,
        row.email,
    ].map((value) => String(value ?? "").toLowerCase()).join(" ");
    if (/\b(admin|system|shared login|office account|office manager login)\b/.test(haystack)) return false;
    return !["terminated", "archived", "deleted", "inactive"].includes(String(row.status ?? "").toLowerCase());
}

function normalizedRole(value: unknown) {
    return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isFieldCollector(row: Record<string, unknown>) {
    return [row.employee_assignment_type, row.assignment_type, row.role, row.job_title, row.position].some((value) => {
        const normalized = normalizedRole(value);
        return normalized === "fieldcollector" || normalized === "collector" || normalized === "allrounder";
    });
}

function isManager(row: Record<string, unknown>) {
    return [row.role, row.job_title, row.position, row.account_type].some((value) => normalizedRole(value).includes("manager"));
}

export async function GET(request: NextRequest) {
    try {
        const context = await requirePermission("expenses.read");
        const supabase = await createSupabaseServerClient();
        const companyId = context.activeCompany?.id;
        const contextActiveOfficeId = context.activeOffice?.id ?? null;
        if (!companyId) throw new Error("Active company is required.");
        const type = request.nextUrl.searchParams.get("type");
        const q = normalizeSearch(request.nextUrl.searchParams.get("q") ?? "");
        if (!q) return NextResponse.json({ results: [] }, { headers: { "Cache-Control": "no-store" } });
        const like = `%${q}%`;
        const canSeeAll = (context.isCompanyAdmin && !context.isOfficeMode) || isCompanyOperationalManager(context);
        const requestedOfficeId = request.nextUrl.searchParams.get("officeId")?.trim() || null;
        const activeOfficeId = canSeeAll && requestedOfficeId && context.offices.some((office) => office.id === requestedOfficeId)
            ? requestedOfficeId
            : contextActiveOfficeId;

        if (type === "employee") {
            const admin = createSupabaseAdminClient() as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
            const { data, error } = await admin.rpc("ddumba_v1_expense_employee_search", {
                p_company_id: companyId,
                p_office_id: activeOfficeId,
                p_query: q,
                // Keep the original company-wide permission explicit while the selected active office scopes entry submission.
                // p_include_all_offices: canSeeAll
                p_include_all_offices: canSeeAll && !activeOfficeId,
            });
            if (error) throw new Error(error.message);
            const results = ((data ?? []) as Array<Record<string, unknown>>)
                .map((row) => {
                    return {
                        id: String(row.employee_id),
                        name: String(row.employee_name ?? "Employee"),
                        officeId: typeof row.home_office_id === "string" ? row.home_office_id : null,
                        officeName: String(row.home_office_name ?? "Office"),
                        role: String(row.employee_position ?? "Employee"),
                        phone: typeof row.phone === "string" ? row.phone : null,
                        employeeCode: typeof row.employee_code === "string" ? row.employee_code : null,
                    };
                })
                .filter(isRealEmployee);
            return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
        }

        if (type === "salary_employee") {
            const admin = createSupabaseAdminClient() as unknown as { from: (table: string) => any };
            const { data, error } = await admin
                .from("employees")
                .select("id, full_name, office_id, role, job_title, phone, email, status, employee_assignment_type, employee_code, basic_salary, users:employee_id(id, account_type, full_name, status), offices:office_id(id, office_name, name)")
                .eq("company_id", companyId)
                .or(`full_name.ilike.${like},phone.ilike.${like},employee_code.ilike.${like},role.ilike.${like},job_title.ilike.${like}`)
                .order("full_name", { ascending: true, nullsFirst: false })
                .limit(80);
            if (error) throw new Error(error.message);
            const results = ((data ?? []) as Array<Record<string, unknown>>)
                .filter(isRealEmployee)
                .filter((row) => {
                    if (canSeeAll) return true;
                    const employeeOfficeId = typeof row.office_id === "string" ? row.office_id : null;
                    return Boolean(activeOfficeId && employeeOfficeId === activeOfficeId) || isFieldCollector(row) || isManager(row);
                })
                .map((row) => {
                    const office = row.offices as Record<string, unknown> | null;
                    return {
                        id: String(row.id),
                        name: String(row.full_name ?? "Employee"),
                        officeId: typeof row.office_id === "string" ? row.office_id : null,
                        officeName: String(office?.office_name ?? office?.name ?? "Company Payroll"),
                        role: String(row.role ?? row.job_title ?? "Employee"),
                        phone: typeof row.phone === "string" ? row.phone : null,
                        employeeCode: typeof row.employee_code === "string" ? row.employee_code : null,
                        monthlySalary: Number(row.basic_salary ?? 0),
                    };
                })
                .slice(0, 20);
            return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
        }

        if (type === "landlord") {
            const query = supabase
                .from("landlords")
                .select("id, full_name, phone, status")
                .eq("company_id", companyId)
                .ilike("full_name", like)
                .neq("status", "archived")
                .order("full_name", { ascending: true, nullsFirst: false })
                .limit(12);
            const { data, error } = await query;
            if (error) throw new Error(error.message);
            const landlordIds = (data ?? []).map((row) => row.id).filter(Boolean);
            let roomQuery = landlordIds.length
                ? supabase.from("rooms").select("landlord_id, office_id, offices:office_id(id, office_name, name)").eq("company_id", companyId).in("landlord_id", landlordIds).not("status", "in", "(archived,inactive,deleted,removed)")
                : null;
            if (roomQuery && activeOfficeId) roomQuery = roomQuery.eq("office_id", activeOfficeId);
            const roomResult = roomQuery ? await roomQuery : { data: [], error: null };
            if (roomResult.error) throw new Error(roomResult.error.message);
            const firstRoomByLandlord = new Map<string, Record<string, unknown>>();
            for (const room of (roomResult.data ?? []) as Array<Record<string, unknown>>) {
                const landlordId = String(room.landlord_id ?? "");
                if (landlordId && !firstRoomByLandlord.has(landlordId)) firstRoomByLandlord.set(landlordId, room);
            }
            const results = ((data ?? []) as Array<Record<string, unknown>>)
                .filter((row) => canSeeAll || firstRoomByLandlord.has(String(row.id)))
                .map((row) => {
                    const room = firstRoomByLandlord.get(String(row.id));
                    const office = room?.offices as Record<string, unknown> | null;
                    return {
                        id: String(row.id),
                        name: String(row.full_name ?? "Landlord"),
                        officeId: typeof room?.office_id === "string" ? room.office_id : null,
                        officeName: String(office?.office_name ?? office?.name ?? "Office"),
                        location: String(row.location ?? row.address ?? ""),
                    };
                });
            return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
        }

        return NextResponse.json({ error: "Unsupported search type." }, { status: 400 });
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Entry search failed." }, { status: 400 });
    }
}
