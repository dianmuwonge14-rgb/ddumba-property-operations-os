import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

type DdumbaClient = SupabaseClient<Database>;

export type TenantScoringEvent =
    | "collection_recorded"
    | "promise_created"
    | "promise_fulfilled"
    | "promise_broken"
    | "balance_changed"
    | "rent_overdue";

type RecalculateTenantScoreInput = {
    supabase: DdumbaClient;
    companyId: string;
    tenantId: string;
    event: TenantScoringEvent;
};

type TenantScoreResult = {
    reliabilityScore: number;
    riskScore: number;
    riskLevel: string;
    reason: string;
};

function amount(value: number | null | undefined) {
    return Number(value ?? 0) || 0;
}

function clampScore(value: number) {
    return Math.max(0, Math.min(100, Math.round(value)));
}

export function tenantRiskLevel(score: number) {
    if (score >= 90) return "Elite";
    if (score >= 75) return "Low Risk";
    if (score >= 50) return "Medium Risk";
    if (score >= 25) return "High Risk";
    return "Critical";
}

function paidMonths(collections: Array<{ paid_at: string | null }>) {
    return new Set(
        collections
            .map((collection) => collection.paid_at?.slice(0, 7))
            .filter((month): month is string => Boolean(month)),
    );
}

function hasThreeConsecutivePaidMonths(collections: Array<{ paid_at: string | null }>) {
    const months = paidMonths(collections);
    const cursor = new Date();

    for (let offset = 0; offset < 12; offset += 1) {
        const first = new Date(cursor.getFullYear(), cursor.getMonth() - offset, 1);
        const second = new Date(first.getFullYear(), first.getMonth() - 1, 1);
        const third = new Date(first.getFullYear(), first.getMonth() - 2, 1);
        const keys = [first, second, third].map((date) => date.toISOString().slice(0, 7));

        if (keys.every((key) => months.has(key))) {
            return true;
        }
    }

    return false;
}

function buildReason(input: {
    event: TenantScoringEvent;
    score: number;
    riskLevel: string;
    hasStreak: boolean;
    brokenPromises: number;
    balance: number;
    monthlyRent: number;
}) {
    const reasons: string[] = [];

    if (input.event === "promise_fulfilled") {
        reasons.push("Risk reduced because tenant fulfilled promise.");
        reasons.push("Reliability increased after successful payment.");
    }

    if (input.event === "collection_recorded") {
        reasons.push("Reliability increased after successful payment.");
    }

    if (input.event === "promise_created") {
        reasons.push("Promise captured and tenant risk monitoring updated.");
    }

    if (input.event === "promise_broken") {
        reasons.push("Risk increased because tenant broke a promise.");
    }

    if (input.hasStreak) {
        reasons.push("Tenant now has 3 consecutive successful payments.");
    }

    if (input.monthlyRent > 0 && input.balance > input.monthlyRent) {
        reasons.push("Outstanding balance remains above one month of rent.");
    }

    if (input.brokenPromises > 0 && input.event !== "promise_broken") {
        reasons.push(`${input.brokenPromises} broken promise${input.brokenPromises === 1 ? "" : "s"} remain in tenant history.`);
    }

    if (reasons.length === 0) {
        reasons.push("Reliability recalculated from live collections, promises, and balance.");
    }

    reasons.push(`Current risk level is ${input.riskLevel} with a reliability score of ${input.score}.`);
    return reasons.join(" ");
}

export async function recalculateTenantScore({
    supabase,
    companyId,
    tenantId,
    event,
}: RecalculateTenantScoreInput): Promise<TenantScoreResult> {
    const [{ data: tenant, error: tenantError }, { data: collections, error: collectionsError }, { data: promises, error: promisesError }] =
        await Promise.all([
            supabase
                .from("tenants")
                .select("id, company_id, balance, monthly_rent, reliability_score, tenant_reliability_score")
                .eq("id", tenantId)
                .eq("company_id", companyId)
                .single(),
            supabase
                .from("collections")
                .select("id, amount_paid, paid_at, due_date, status")
                .eq("tenant_id", tenantId)
                .eq("company_id", companyId)
                .order("paid_at", { ascending: false, nullsFirst: false })
                .limit(36),
            supabase
                .from("promises")
                .select("id, status, fulfilled_at, promised_date, promise_date")
                .eq("tenant_id", tenantId)
                .eq("company_id", companyId)
                .order("created_at", { ascending: false, nullsFirst: false })
                .limit(50),
        ]);

    if (tenantError) throw new Error(tenantError.message);
    if (collectionsError) throw new Error(collectionsError.message);
    if (promisesError) throw new Error(promisesError.message);
    if (!tenant) throw new Error("Tenant not found for scoring.");

    const balance = amount(tenant.balance);
    const monthlyRent = amount(tenant.monthly_rent);
    const paidCollections = (collections ?? []).filter((collection) => amount(collection.amount_paid) > 0);
    const fulfilledPromises = (promises ?? []).filter((promise) => (promise.status ?? "").toLowerCase() === "fulfilled");
    const brokenPromises = (promises ?? []).filter((promise) => (promise.status ?? "").toLowerCase() === "broken");
    const hasStreak = hasThreeConsecutivePaidMonths(paidCollections);

    let score = 70;
    score += Math.min(20, fulfilledPromises.length * 10);
    score += Math.min(15, paidCollections.length * 5);
    if (hasStreak) score += 3;
    score -= Math.min(30, brokenPromises.length * 10);

    if (monthlyRent > 0 && balance > 0) {
        const rentMonthsOutstanding = balance / monthlyRent;
        if (rentMonthsOutstanding > 3) score -= 40;
        else if (rentMonthsOutstanding > 2) score -= 25;
        else if (rentMonthsOutstanding > 1) score -= 15;
    }

    const reliabilityScore = clampScore(score);
    const riskScore = clampScore(100 - reliabilityScore);
    const riskLevel = tenantRiskLevel(reliabilityScore);
    const reason = buildReason({
        event,
        score: reliabilityScore,
        riskLevel,
        hasStreak,
        brokenPromises: brokenPromises.length,
        balance,
        monthlyRent,
    });

    const { error: updateError } = await supabase
        .from("tenants")
        .update({
            reliability_score: reliabilityScore,
            risk_score: riskScore,
            tenant_reliability_score: reliabilityScore,
            tenant_risk_level: riskLevel,
            tenant_score_reason: reason,
            tenant_score_updated_at: new Date().toISOString(),
        })
        .eq("id", tenantId)
        .eq("company_id", companyId)
        .select("id")
        .single();

    if (updateError) throw new Error(updateError.message);

    return {
        reliabilityScore,
        riskScore,
        riskLevel,
        reason,
    };
}
