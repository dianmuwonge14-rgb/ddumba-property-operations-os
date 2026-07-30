import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/permissions";
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

export async function GET(request: NextRequest) {
    try {
        const context = await requirePermission("expenses.read");
        const supabase = await createSupabaseServerClient();
        const companyId = context.activeCompany?.id;
        const activeOfficeId = context.activeOffice?.id ?? null;
        if (!companyId) throw new Error("Active company is required.");
        const type = request.nextUrl.searchParams.get("type");
        const q = normalizeSearch(request.nextUrl.searchParams.get("q") ?? "");
        if (!q) return NextResponse.json({ results: [] }, { headers: { "Cache-Control": "no-store" } });
        const like = `%${q}%`;
        const canSeeAll = context.isCompanyAdmin && !context.isOfficeMode;

        if (type === "employee") {
            let query = supabase
                .from("employees")
                .select("id, full_name, office_id, role, job_title, phone, email, status, employee_assignment_type, offices:office_id(id, office_name, name)")
                .eq("company_id", companyId)
                .or(`full_name.ilike.${like},phone.ilike.${like},email.ilike.${like},role.ilike.${like},job_title.ilike.${like}`)
                .order("full_name", { ascending: true, nullsFirst: false })
                .limit(12);
            if (!canSeeAll && activeOfficeId) query = query.eq("office_id", activeOfficeId);
            const { data, error } = await query;
            if (error) throw new Error(error.message);
            const results = ((data ?? []) as Array<Record<string, unknown>>)
                .filter(isRealEmployee)
                .map((row) => {
                    const office = row.offices as Record<string, unknown> | null;
                    return {
                        id: String(row.id),
                        name: String(row.full_name ?? "Employee"),
                        officeId: typeof row.office_id === "string" ? row.office_id : null,
                        officeName: String(office?.office_name ?? office?.name ?? "Office"),
                        role: String(row.role ?? row.job_title ?? ""),
                        phone: typeof row.phone === "string" ? row.phone : null,
                    };
                });
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
            if (roomQuery && !canSeeAll && activeOfficeId) roomQuery = roomQuery.eq("office_id", activeOfficeId);
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
