"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Company, Office } from "@/lib/auth/types";
import type { CollectionTenantResult, CollectionsPageData } from "@/lib/collections/types";
import CollectionSearch from "./CollectionSearch";
import TenantSnapshot from "./TenantSnapshot";
import AICollectionInsight from "./AICollectionInsight";
import CollectionActionCentre from "./CollectionActionCentre";
import CollectionTimeline from "./CollectionTimeline";
import { EnterpriseKpiCard, PageHero } from "@/components/office/shared/EnterpriseUI";

type Props = {
    activeCompany: Company | null;
    activeOffice: Office | null;
    canManage: boolean;
    canPostPayments: boolean;
    initialData: CollectionsPageData;
};

function money(value: number) {
    return `UGX ${Math.round(value).toLocaleString()}`;
}

export default function CollectionsCommandCentre({
    activeCompany,
    activeOffice,
    canManage,
    canPostPayments,
    initialData,
}: Props) {
    const router = useRouter();
    const [selectedTenant, setSelectedTenant] = useState<CollectionTenantResult | null>(null);

    async function refreshSelectedTenant(tenant: CollectionTenantResult | null) {
        if (!tenant) return;

        const lookup = tenant.room?.room_number ?? tenant.tenant.full_name ?? "";
        if (!lookup.trim()) return;

        const response = await fetch(`/api/collections/search?q=${encodeURIComponent(lookup)}`);
        const payload = await response.json();

        if (!response.ok) {
            throw new Error(payload.error ?? "Tenant refresh failed.");
        }

        const refreshed = (payload.results ?? []).find(
            (result: CollectionTenantResult) => result.tenant.id === tenant.tenant.id,
        );

        if (refreshed) {
            setSelectedTenant(refreshed);
        }
    }

    function refresh() {
        router.refresh();
    }

    return (
        <main className="enterprise-page">
            <div className="enterprise-shell">
                <PageHero
                    title="Collections Command Centre"
                    subtitle={`${activeOffice?.office_name ?? activeOffice?.name ?? "No active office selected"}${activeCompany ? ` · ${activeCompany.name}` : ""}`}
                    badge="Collections War Room"
                >
                    <div className="enterprise-card px-6 py-4">
                        <p className="text-sm text-slate-500">RLS Scope</p>
                        <p className="text-green-600 font-bold text-lg">
                            {activeOffice ? "Office Live" : "Select Office"}
                        </p>
                    </div>
                </PageHero>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-5 mb-8">
                    <EnterpriseKpiCard title="Today's Collections" value={money(initialData.kpis.todayCollections)} tone="green" trend="up" trendLabel="vs prior period" progress={Math.min(100, initialData.kpis.promiseRecoveryRate)} />
                    <EnterpriseKpiCard title="Month Collections" value={money(initialData.kpis.monthCollections)} tone="blue" trend="up" trendLabel="MTD performance" progress={72} />
                    <EnterpriseKpiCard title="Outstanding Balance" value={money(initialData.kpis.outstandingBalance)} tone="red" trend="down" trendLabel="needs recovery" progress={64} status="Risk" />
                    <EnterpriseKpiCard title="Promises Due Today" value={initialData.kpis.promisesDueToday.toLocaleString()} tone="orange" trend="flat" trendLabel="active commitments" progress={initialData.kpis.promisesDueToday ? 55 : 0} />
                    <EnterpriseKpiCard title="Promise Recovery Rate" value={`${initialData.kpis.promiseRecoveryRate}%`} tone="purple" trend="up" trendLabel="recovery quality" progress={initialData.kpis.promiseRecoveryRate} />
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                    <div className="xl:col-span-3 space-y-6">
                        <CollectionSearch onTenantFound={setSelectedTenant} />
                        <CollectionActionCentre
                            canManage={canManage}
                            canPostPayments={canPostPayments}
                            tenantContext={selectedTenant}
                            onSaved={async () => {
                                await refreshSelectedTenant(selectedTenant);
                                refresh();
                            }}
                        />
                    </div>

                    <div className="xl:col-span-6 space-y-6">
                        <TenantSnapshot
                            tenantContext={selectedTenant}
                            canEdit={canManage}
                            onTenantUpdated={async () => {
                                await refreshSelectedTenant(selectedTenant);
                                refresh();
                            }}
                        />
                        <CollectionTimeline items={initialData.recentActions} />
                    </div>

                    <div className="xl:col-span-3 space-y-6">
                        <AICollectionInsight tenantContext={selectedTenant} />

                        <div className="rounded-3xl bg-slate-950 p-6 text-white shadow-xl">
                            <h2 className="font-bold text-xl mb-5">Promises Due Today</h2>

                            <div className="space-y-3">
                                {initialData.duePromises.length === 0 ? (
                                    <div className="rounded-2xl border border-white/10 bg-white/10 p-4 text-slate-300">
                                        No promises due today.
                                    </div>
                                ) : initialData.duePromises.map((promise) => (
                                    <div key={promise.id} className="rounded-2xl border border-white/10 bg-white/10 p-4">
                                        <div className="font-semibold">
                                            {promise.tenantName ?? "Tenant"}
                                        </div>
                                        <div className="text-sm text-slate-300">
                                            UGX {Number(promise.promised_amount ?? promise.amount ?? 0).toLocaleString()}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
