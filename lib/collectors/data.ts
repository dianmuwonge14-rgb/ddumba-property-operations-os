import { requireAuth } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type DynamicDb = {
    from: (table: string) => any;
};
type Row = Record<string, unknown>;

export function isCollectorContext(context: Awaited<ReturnType<typeof requireAuth>>) {
    return context.authMode === "collector" || context.roles.some((role) => role.role?.key === "field_collector");
}

export async function requireCollectorContext() {
    const context = await requireAuth();
    if (!isCollectorContext(context) || !context.activeCompany?.id || !context.profile?.id) {
        throw new Error("Field Collector account required.");
    }
    return context;
}

function amount(value: unknown) {
    return Number(value ?? 0) || 0;
}

function today() {
    return new Date().toISOString().slice(0, 10);
}

export async function getCollectorDashboardData() {
    const context = await requireCollectorContext();
    const db = createSupabaseAdminClient() as unknown as DynamicDb;
    const todayDate = today();
    const [profileResult, collectionsResult, submissionsResult, messagesResult, officesResult] = await Promise.all([
        db.from("field_collector_profiles").select("*").eq("company_id", context.activeCompany!.id).eq("user_id", context.profile!.id).maybeSingle(),
        db.from("collections").select("*").eq("company_id", context.activeCompany!.id).eq("entered_by_account_id", context.profile!.id).gte("payment_date", todayDate).lte("payment_date", todayDate).order("created_at", { ascending: false }),
        db.from("field_collector_money_submissions").select("*").eq("company_id", context.activeCompany!.id).eq("collector_user_id", context.profile!.id).order("created_at", { ascending: false }).limit(50),
        db.from("field_collector_messages").select("*").eq("company_id", context.activeCompany!.id).or(`recipient_user_id.eq.${context.profile!.id},recipient_type.eq.all_collectors`).order("created_at", { ascending: false }).limit(30),
        db.from("offices").select("id, office_name, name").eq("company_id", context.activeCompany!.id).order("office_name"),
    ]);

    const officeIds = [...new Set((collectionsResult.data ?? []).map((row: Record<string, unknown>) => String(row.office_id ?? "")).filter(Boolean))];
    const landlordIds = [...new Set((collectionsResult.data ?? []).map((row: Record<string, unknown>) => String(row.landlord_id ?? "")).filter(Boolean))];
    const [officeResult, landlordResult] = await Promise.all([
        officeIds.length ? db.from("offices").select("id, office_name, name").in("id", officeIds) : Promise.resolve({ data: [] }),
        landlordIds.length ? db.from("landlords").select("id, full_name").in("id", landlordIds) : Promise.resolve({ data: [] }),
    ]);
    const officeById = new Map(((officeResult.data ?? []) as Row[]).map((row) => [String(row.id), String(row.office_name ?? row.name ?? "Office")]));
    const landlordById = new Map(((landlordResult.data ?? []) as Row[]).map((row) => [String(row.id), String(row.full_name ?? "Landlord")]));

    const collections = (collectionsResult.data ?? []) as Row[];
    const submissions = (submissionsResult.data ?? []) as Row[];
    return {
        collections,
        collectionsByLandlord: groupAmounts(collections, (row) => landlordById.get(String(row.landlord_id ?? "")) ?? "No landlord"),
        collectionsByMethod: groupAmounts(collections, (row) => String(row.payment_method ?? "cash")),
        collectionsByOffice: groupAmounts(collections, (row) => officeById.get(String(row.office_id ?? "")) ?? "Office"),
        messages: (messagesResult.data ?? []) as Row[],
        offices: (officesResult.data ?? []) as Array<{ id: string; office_name?: string | null; name?: string | null }>,
        profile: (profileResult.data ?? null) as Row | null,
        submissions,
        totals: {
            approvedSubmissions: submissions.filter((row: Record<string, unknown>) => row.status === "approved").reduce((total: number, row: Record<string, unknown>) => total + amount(row.amount), 0),
            pendingSubmissions: submissions.filter((row: Record<string, unknown>) => row.status === "pending").reduce((total: number, row: Record<string, unknown>) => total + amount(row.amount), 0),
            rejectedSubmissions: submissions.filter((row: Record<string, unknown>) => row.status === "rejected").reduce((total: number, row: Record<string, unknown>) => total + amount(row.amount), 0),
            remainingInHand: amount(profileResult.data?.cash_balance),
            totalCollectedToday: collections.reduce((total: number, row: Record<string, unknown>) => total + amount(row.amount_paid ?? row.amount), 0),
            totalSubmitted: submissions.filter((row: Record<string, unknown>) => row.status === "approved").reduce((total: number, row: Record<string, unknown>) => total + amount(row.amount), 0),
        },
    };
}

export async function getOfficeCollectorSubmissionData() {
    const context = await requireAuth();
    if (!context.activeCompany?.id || !context.activeOffice?.id) return [];
    const db = createSupabaseAdminClient() as unknown as DynamicDb;
    const { data } = await db
        .from("field_collector_money_submissions")
        .select("*")
        .eq("company_id", context.activeCompany.id)
        .eq("office_id", context.activeOffice.id)
        .order("created_at", { ascending: false })
        .limit(40);
    const collectorIds = [...new Set((data ?? []).map((row: Record<string, unknown>) => String(row.collector_user_id ?? "")).filter(Boolean))];
    const { data: users } = collectorIds.length
        ? await db.from("users").select("id, full_name, phone, email").in("id", collectorIds)
        : { data: [] };
    const userById = new Map(((users ?? []) as Row[]).map((row) => [String(row.id), row]));
    return ((data ?? []) as Row[]).map((row) => ({
        ...row,
        collectorName: String(userById.get(String(row.collector_user_id))?.full_name ?? "Collector"),
    }));
}

function groupAmounts(rows: Record<string, unknown>[], labelFor: (row: Record<string, unknown>) => string) {
    const map = new Map<string, number>();
    for (const row of rows) {
        const label = labelFor(row);
        map.set(label, (map.get(label) ?? 0) + amount(row.amount_paid ?? row.amount));
    }
    return [...map.entries()].map(([label, value]) => ({ label, value }));
}
