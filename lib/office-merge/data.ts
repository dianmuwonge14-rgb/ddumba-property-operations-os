import { requireCompanyAdminMode } from "@/lib/auth/permissions";
import { getScopedSupabase } from "@/lib/auth/query";
import { COUNT_TABLES } from "./constants";
import type { OfficeMergeData, OfficeMergeHistoryRow, OfficeMergeSourceOffice } from "./types";

type LooseRow = Record<string, any>;

function label(value: unknown, fallback = "Office") {
    const resolved = String(value ?? "").trim();
    return resolved || fallback;
}

export async function getOfficeMergeData(): Promise<OfficeMergeData> {
    const context = await requireCompanyAdminMode();
    const { supabase } = await getScopedSupabase();
    const companyId = context.activeCompany?.id;
    if (!companyId) {
        return { companyName: "Company", offices: [], history: [], warnings: ["No active company found."] };
    }

    const db = supabase as unknown as { from: (table: string) => any };
    const [officesResult, roomsResult, tenantsResult, landlordsResult, propertiesResult] = await Promise.all([
        db.from("offices").select("id,name,office_name,status").eq("company_id", companyId).neq("status", "archived").order("office_name", { ascending: true }),
        db.from("rooms").select("id,office_id,landlord_id,monthly_rent,status").eq("company_id", companyId),
        db.from("tenants").select("id,office_id,status").eq("company_id", companyId),
        db.from("landlords").select("id,status").eq("company_id", companyId),
        db.from("properties").select("id,office_id,status").eq("company_id", companyId),
    ]);

    for (const result of [officesResult, roomsResult, tenantsResult, landlordsResult, propertiesResult]) {
        if (result.error) throw new Error(result.error.message);
    }

    const warnings: string[] = [];
    const offices: OfficeMergeSourceOffice[] = [];
    const allRooms = (roomsResult.data ?? []) as LooseRow[];
    const allTenants = (tenantsResult.data ?? []) as LooseRow[];
    const allProperties = (propertiesResult.data ?? []) as LooseRow[];

    for (const office of (officesResult.data ?? []) as LooseRow[]) {
        const counts: Record<string, number> = {};
        const officeId = String(office.id);
        const officeRooms = allRooms.filter((row) => String(row.office_id ?? "") === officeId && !["archived", "deleted", "inactive"].includes(String(row.status ?? "").toLowerCase()));
        const landlordIds = new Set<string>();
        for (const row of officeRooms) {
            if (row.landlord_id) landlordIds.add(String(row.landlord_id));
        }
        for (const item of COUNT_TABLES) counts[item.key] = 0;
        counts.landlords = landlordIds.size;
        counts.properties = allProperties.filter((row) => String(row.office_id ?? "") === officeId && !["archived", "deleted", "inactive"].includes(String(row.status ?? "").toLowerCase())).length;
        counts.rooms = officeRooms.length;
        counts.tenants = allTenants.filter((row) => String(row.office_id ?? "") === officeId && !["archived", "deleted", "inactive", "vacated"].includes(String(row.status ?? "").toLowerCase())).length;
        offices.push({
            id: officeId,
            name: label(office.office_name ?? office.name),
            status: label(office.status, "active"),
            rentRoll: officeRooms.reduce((total, row) => total + Number(row.monthly_rent ?? 0), 0),
            counts,
        });
    }

    const historyResult = await db
        .from("office_merge_batches")
        .select("id,new_office_name,source_office_names,status,created_at,completed_at,affected_counts")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(10);

    let history: OfficeMergeHistoryRow[] = [];
    if (historyResult.error) {
        warnings.push(`office_merge_batches: ${historyResult.error.message}`);
    } else {
        history = ((historyResult.data ?? []) as LooseRow[]).map((row) => ({
            id: String(row.id),
            newOfficeName: label(row.new_office_name, "Merged office"),
            sourceOfficeNames: Array.isArray(row.source_office_names) ? row.source_office_names.map(String) : [],
            status: label(row.status, "preview"),
            createdAt: String(row.created_at ?? ""),
            completedAt: row.completed_at ? String(row.completed_at) : null,
            affectedCounts: (row.affected_counts ?? {}) as Record<string, number>,
        }));
    }

    return {
        companyName: context.activeCompany?.name ?? "Ddumba OS",
        offices,
        history,
        warnings,
    };
}
