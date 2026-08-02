import { requireCompanyAdminMode } from "@/lib/auth/permissions";
import { requireCollectorContext } from "@/lib/collectors/data";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type DynamicDb = {
    from: (table: string) => any;
    storage: any;
};

type Row = Record<string, unknown>;

const PENDING_STATUSES = ["pending_verification", "needs_clearer_image", "correction_requested"];

function amount(value: unknown) {
    return Number(value ?? 0) || 0;
}

function today() {
    return new Date().toISOString().slice(0, 10);
}

function officeName(row: Row | undefined) {
    return String(row?.office_name ?? row?.name ?? "Office");
}

async function signedSlipUrl(path: unknown) {
    if (!path) return null;
    const db = createSupabaseAdminClient() as unknown as DynamicDb;
    const { data, error } = await db.storage.from("collector-bank-slips").createSignedUrl(String(path), 60 * 60);
    if (error) return null;
    return data?.signedUrl ?? null;
}

export async function getCollectorBankingPageData() {
    const context = await requireCollectorContext();
    const db = createSupabaseAdminClient() as unknown as DynamicDb;
    const companyId = context.activeCompany!.id;
    const collectorId = context.profile!.id;
    const todayDate = today();
    const [profileResult, officesResult, collectionsResult, submissionsResult] = await Promise.all([
        db.from("field_collector_profiles").select("*").eq("company_id", companyId).eq("user_id", collectorId).maybeSingle(),
        db.from("offices").select("id, office_name, name").eq("company_id", companyId).order("office_name"),
        db.from("collections").select("id, amount, amount_paid, office_id, payment_date, created_at").eq("company_id", companyId).eq("entered_by_account_id", collectorId).gte("payment_date", todayDate).lte("payment_date", todayDate).limit(500),
        db.from("collector_banking_submissions").select("*").eq("company_id", companyId).eq("collector_user_id", collectorId).order("created_at", { ascending: false }).limit(80),
    ]);
    if (profileResult.error && !/schema cache/i.test(profileResult.error.message)) throw new Error(profileResult.error.message);
    if (officesResult.error) throw new Error(officesResult.error.message);
    if (collectionsResult.error) throw new Error(collectionsResult.error.message);
    if (submissionsResult.error && !/collector_banking_submissions|schema cache/i.test(submissionsResult.error.message)) throw new Error(submissionsResult.error.message);

    const submissions = (submissionsResult.data ?? []) as Row[];
    const pendingAmount = submissions
        .filter((row) => PENDING_STATUSES.includes(String(row.status)))
        .reduce((total, row) => total + amount(row.reserved_amount ?? row.amount), 0);
    const verifiedToday = submissions
        .filter((row) => row.status === "verified" && String(row.banking_date) === todayDate)
        .reduce((total, row) => total + amount(row.amount), 0);
    const cashHeld = amount(profileResult.data?.cash_balance);

    return {
        collector: {
            id: collectorId,
            name: String(profileResult.data?.full_name ?? context.profile!.full_name ?? "Collector"),
            cashHeld,
        },
        collectionsToday: (collectionsResult.data ?? []) as Row[],
        offices: ((officesResult.data ?? []) as Row[]).map((office) => ({ id: String(office.id), name: officeName(office) })),
        submissions,
        totals: {
            alreadyBankedToday: verifiedToday,
            awaitingBanking: Math.max(0, cashHeld - pendingAmount),
            cashCollectedToday: ((collectionsResult.data ?? []) as Row[]).reduce((total, row) => total + amount(row.amount_paid ?? row.amount), 0),
            cashCurrentlyHeld: cashHeld,
            lastBankDeposit: amount(submissions.find((row) => row.status === "verified")?.amount),
            pendingVerification: pendingAmount,
            rejectedBanking: submissions.filter((row) => row.status === "rejected").reduce((total, row) => total + amount(row.amount), 0),
            verifiedBanking: submissions.filter((row) => row.status === "verified").reduce((total, row) => total + amount(row.amount), 0),
        },
    };
}

export async function getAdminCollectorBankingData() {
    const context = await requireCompanyAdminMode();
    const db = createSupabaseAdminClient() as unknown as DynamicDb;
    const companyId = context.activeCompany!.id;
    const [submissionsResult, collectorsResult, officesResult, profilesResult] = await Promise.all([
        db.from("collector_banking_submissions").select("*").eq("company_id", companyId).order("created_at", { ascending: false }).limit(150),
        db.from("users").select("id, full_name, phone, email").eq("company_id", companyId).limit(1000),
        db.from("offices").select("id, office_name, name").eq("company_id", companyId).limit(1000),
        db.from("field_collector_profiles").select("user_id, cash_balance, full_name").eq("company_id", companyId).limit(1000),
    ]);
    if (submissionsResult.error && !/collector_banking_submissions|schema cache/i.test(submissionsResult.error.message)) throw new Error(submissionsResult.error.message);
    if (collectorsResult.error) throw new Error(collectorsResult.error.message);
    if (officesResult.error) throw new Error(officesResult.error.message);
    if (profilesResult.error) throw new Error(profilesResult.error.message);

    const collectorsById = new Map(((collectorsResult.data ?? []) as Row[]).map((row) => [String(row.id), row]));
    const officesById = new Map(((officesResult.data ?? []) as Row[]).map((row) => [String(row.id), row]));
    const profilesByUser = new Map(((profilesResult.data ?? []) as Row[]).map((row) => [String(row.user_id), row]));
    const submissions: Row[] = await Promise.all(((submissionsResult.data ?? []) as Row[]).map(async (row) => ({
        ...row,
        collectorCashHeld: amount(profilesByUser.get(String(row.collector_user_id))?.cash_balance),
        collectorName: String(collectorsById.get(String(row.collector_user_id))?.full_name ?? profilesByUser.get(String(row.collector_user_id))?.full_name ?? "Collector"),
        officeName: officeName(officesById.get(String(row.office_id))),
        slipSignedUrl: await signedSlipUrl(row.slip_file_path),
    })));
    const pendingAmount = submissions.filter((row) => PENDING_STATUSES.includes(String(row.status))).reduce((total, row) => total + amount(row.amount), 0);
    const verifiedAmount = submissions.filter((row) => row.status === "verified").reduce((total, row) => total + amount(row.amount), 0);
    return {
        submissions,
        totals: {
            pendingAmount,
            pendingCount: submissions.filter((row) => PENDING_STATUSES.includes(String(row.status))).length,
            rejectedAmount: submissions.filter((row) => row.status === "rejected").reduce((total, row) => total + amount(row.amount), 0),
            rejectedCount: submissions.filter((row) => row.status === "rejected").length,
            verifiedAmount,
            verifiedCount: submissions.filter((row) => row.status === "verified").length,
        },
    };
}
