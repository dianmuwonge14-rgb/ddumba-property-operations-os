import type { CollectionTenantResult } from "@/lib/collections/types";

type Props = {
    tenantContext: CollectionTenantResult | null;
};

function riskLevelFromReliability(score: number) {
    if (score >= 90) return "Elite";
    if (score >= 75) return "Low Risk";
    if (score >= 50) return "Medium Risk";
    if (score >= 25) return "High Risk";
    return "Critical";
}

export default function AICollectionInsight({ tenantContext }: Props) {
    if (!tenantContext) {
        return (
            <div className="bg-gradient-to-br from-slate-900 to-blue-950 text-white rounded-3xl shadow-xl p-8">
                <h2 className="text-2xl font-black mb-3">Collection Intelligence</h2>
                <p className="text-slate-300">
                    Search for a tenant to calculate recovery guidance from live office data.
                </p>
            </div>
        );
    }

    const balance = tenantContext.outstandingBalance;
    const reliability = Math.round(tenantContext.tenant.tenant_reliability_score ?? tenantContext.tenant.reliability_score ?? 70);
    const probability = Math.max(15, Math.min(95, reliability - (balance > tenantContext.monthlyRent ? 10 : 0)));
    const expectedRecovery = Math.round(balance * (probability / 100));
    const risk = tenantContext.tenant.tenant_risk_level ?? riskLevelFromReliability(reliability);
    const reasoning =
        tenantContext.tenant.tenant_score_reason ??
        "Reliability recalculated from live collections, promises, and balance.";

    return (
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950 text-white rounded-3xl shadow-2xl overflow-hidden">
            <div className="p-8 border-b border-white/10">
                <h2 className="text-2xl font-black">Collection Intelligence</h2>
                <p className="text-slate-400 mt-1">Live recovery forecast</p>
            </div>

            <div className="p-8 space-y-6">
                <Panel label="Collection Probability" value={`${probability}%`} valueClass="text-green-400 text-5xl" />

                <div className="grid grid-cols-2 gap-4">
                    <Panel label="Risk Level" value={risk} valueClass="text-orange-400" compact />
                    <Panel label="Payment Behaviour" value={reliability >= 80 ? "Stable" : "Needs Action"} valueClass="text-green-400" compact />
                </div>

                <Panel label="Expected Recovery" value={`UGX ${expectedRecovery.toLocaleString()}`} valueClass="text-green-400 text-3xl" />

                <div className="bg-emerald-500/10 border border-emerald-400/20 rounded-2xl p-5">
                    <h3 className="font-bold mb-3">AI Reasoning</h3>
                    <p className="text-slate-300 leading-relaxed">{reasoning}</p>
                </div>

                <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-5">
                    <h3 className="font-bold mb-3">Recommended Action</h3>
                    <p className="text-slate-300 leading-relaxed">
                        {tenantContext.openPromise
                            ? "Follow up the open promise and confirm payment timing before escalation."
                            : balance > 0
                                ? "Record a call or WhatsApp follow-up and capture a promise to pay."
                                : "Tenant is currently clear. Monitor upcoming billing cycle."}
                    </p>
                </div>
            </div>
        </div>
    );
}

function Panel({
    label,
    value,
    valueClass,
    compact = false,
}: {
    label: string;
    value: string;
    valueClass: string;
    compact?: boolean;
}) {
    return (
        <div className={`bg-white/5 rounded-2xl ${compact ? "p-4" : "p-5"}`}>
            <p className="text-slate-400 text-sm">{label}</p>
            <h3 className={`font-black mt-2 ${valueClass}`}>{value}</h3>
        </div>
    );
}
