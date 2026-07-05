"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Plus, RefreshCcw, ShieldCheck } from "lucide-react";
import { assignReplacementTenantToRoom } from "@/app/actions/tenants";
import type { BadDebtRecoveryData, VacatedDebtRegisterRow } from "@/lib/bad-debt/types";
import { EnterpriseKpiCard, EmptyState, PageHero, StatusChip } from "@/components/office/shared/EnterpriseUI";

type Props = {
    data: BadDebtRecoveryData;
};

function money(value: number | string | null | undefined) {
    return `UGX ${Math.round(Number(value ?? 0)).toLocaleString()}`;
}

function todayDate() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kampala" }).format(new Date());
}

export default function BadDebtRecoveryCentre({ data }: Props) {
    const router = useRouter();
    const [selectedDebtId, setSelectedDebtId] = useState(data.debts[0]?.id ?? "");
    const [name, setName] = useState("Unnamed Tenant");
    const [phone, setPhone] = useState("");
    const [startDate, setStartDate] = useState(todayDate());
    const [message, setMessage] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    const selectedDebt = data.debts.find((debt) => debt.id === selectedDebtId) ?? data.debts[0] ?? null;

    function assignTenant(debt: VacatedDebtRegisterRow) {
        if (!debt.room_id) {
            setMessage("This debt is not linked to a room.");
            return;
        }
        startTransition(async () => {
            try {
                setMessage(null);
                await assignReplacementTenantToRoom({
                    roomId: debt.room_id!,
                    fullName: name,
                    phone,
                    startDate,
                });
                setMessage(`Replacement tenant assigned to room ${debt.room_number ?? ""} with clean UGX 0 opening balance.`);
                router.refresh();
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Replacement tenant assignment failed.");
            }
        });
    }

    return (
        <main className="enterprise-page">
            <div className="enterprise-shell">
                <PageHero
                    title="Bad Debt Recovery"
                    subtitle={`${data.company?.name ?? "Company"} · ${data.canAccessAllOffices ? "company-wide vacated tenant recovery" : data.activeOffice?.office_name ?? "office register"}`}
                    badge="Vacated Tenants Register"
                >
                    <div className="rounded-3xl bg-white/10 p-5 text-white ring-1 ring-white/10">
                        <p className="text-xs font-black uppercase text-cyan-100">Business Rule</p>
                        <p className="mt-2 max-w-md text-sm font-bold text-slate-200">
                            Vacated tenant debt stays with the old tenant and deducts from landlord payable. New room tenants start clean.
                        </p>
                    </div>
                </PageHero>

                <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5">
                    <EnterpriseKpiCard title="Vacated Debt" value={money(data.kpis.totalVacatedDebt)} tone="orange" trend="flat" trendLabel="frozen balances" progress={70} />
                    <EnterpriseKpiCard title="Recovered" value={money(data.kpis.totalRecovered)} tone="green" trend="up" trendLabel="deducted" progress={45} />
                    <EnterpriseKpiCard title="Unrecovered" value={money(data.kpis.remainingRecovery)} tone="red" trend="down" trendLabel="pending recovery" progress={55} />
                    <EnterpriseKpiCard title="Pending Debtors" value={String(data.kpis.pendingDebtors)} tone="slate" trend="flat" trendLabel="tenant exits" progress={50} />
                    <EnterpriseKpiCard title="Clean Rooms Ready" value={String(data.kpis.roomsReadyForCleanTenant)} tone="blue" trend="up" trendLabel="zero room debt" progress={80} />
                </section>

                {message ? (
                    <div className="mt-6 rounded-3xl border border-blue-200 bg-blue-50 p-4 text-sm font-black text-blue-800">
                        {message}
                    </div>
                ) : null}

                <section className="mt-6 grid grid-cols-1 gap-6 2xl:grid-cols-[1.2fr_0.8fr]">
                    <div className="enterprise-panel overflow-hidden">
                        <div className="border-b border-slate-200 p-5">
                            <h2 className="text-xl font-black text-slate-950">Vacated Tenants Register</h2>
                            <p className="mt-1 text-sm font-semibold text-slate-500">Office-scoped debt register with room clean-balance verification.</p>
                        </div>
                        {data.debts.length === 0 ? (
                            <div className="p-8">
                                <EmptyState title="No vacated tenant debts yet" description="Vacating a tenant without clearing balance will create a recovery item here." />
                            </div>
                        ) : (
                            <div className="max-h-[720px] overflow-auto">
                                <table className="enterprise-table min-w-[1200px]">
                                    <thead className="sticky top-0 z-10 bg-white">
                                        <tr>
                                            <th className="text-left">Tenant</th>
                                            <th className="text-left">Room</th>
                                            <th className="text-left">Landlord</th>
                                            <th className="text-left">Office</th>
                                            <th className="text-right">Final Debt</th>
                                            <th className="text-right">Recovered</th>
                                            <th className="text-right">Remaining</th>
                                            <th className="text-left">Room Debt</th>
                                            <th className="text-left">Recovery</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.debts.map((debt) => (
                                            <tr
                                                key={debt.id}
                                                onClick={() => setSelectedDebtId(debt.id)}
                                                className={`cursor-pointer ${selectedDebt?.id === debt.id ? "bg-blue-50" : ""}`}
                                            >
                                                <td>
                                                    <p className="font-black text-slate-950">{debt.tenant_name ?? "Vacated tenant"}</p>
                                                    <p className="text-xs font-bold text-slate-500">{debt.tenant_phone ?? "No phone"}</p>
                                                </td>
                                                <td>
                                                    <p className="font-black">{debt.room_number ?? "Room"}</p>
                                                    <p className="text-xs font-bold text-slate-500">{debt.property_name ?? "Property"}</p>
                                                </td>
                                                <td>{debt.landlord_name ?? "No landlord"}</td>
                                                <td>{debt.office_name ?? "Office"}</td>
                                                <td className="text-right font-black">{money(debt.original_amount)}</td>
                                                <td className="text-right font-black text-emerald-700">{money(debt.recovered_amount)}</td>
                                                <td className="text-right font-black text-red-700">{money(debt.remaining_amount)}</td>
                                                <td>
                                                    {Number(debt.room_outstanding_balance) === 0 ? (
                                                        <StatusChip label={debt.has_active_replacement_lease ? "New tenant clean" : "Room clean"} tone="green" />
                                                    ) : (
                                                        <StatusChip label={`${money(debt.room_outstanding_balance)} on room`} tone="red" />
                                                    )}
                                                </td>
                                                <td><StatusChip label={debt.recovery_status.replaceAll("_", " ")} tone={Number(debt.remaining_amount) > 0 ? "orange" : "green"} /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    <div className="space-y-6">
                        <div className="enterprise-panel p-5">
                            <h2 className="text-xl font-black text-slate-950">Replacement Tenant</h2>
                            <p className="mt-1 text-sm font-semibold text-slate-500">
                                Assign a new tenant to the selected vacated room. The new tenant starts with UGX 0 opening balance.
                            </p>
                            {!selectedDebt ? (
                                <div className="mt-5 rounded-2xl border border-dashed border-slate-300 p-5 text-sm font-bold text-slate-500">
                                    Select a vacated tenant debt row first.
                                </div>
                            ) : selectedDebt.has_active_replacement_lease ? (
                                <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm font-bold text-emerald-800">
                                    <CheckCircle2 className="mb-2" size={22} />
                                    Room {selectedDebt.room_number ?? ""} already has a replacement active lease. Room outstanding remains {money(selectedDebt.room_outstanding_balance)}.
                                </div>
                            ) : (
                                <div className="mt-5 space-y-3">
                                    <div className="rounded-2xl bg-slate-50 p-4">
                                        <p className="text-sm font-black text-slate-900">Selected room: {selectedDebt.room_number ?? "Room"}</p>
                                        <p className="text-xs font-bold text-slate-500">
                                            Previous tenant debt: {money(selectedDebt.remaining_amount)} · Room balance now: {money(selectedDebt.room_outstanding_balance)}
                                        </p>
                                    </div>
                                    <label className="block text-sm font-black text-slate-700">
                                        New Tenant Name
                                        <input value={name} onChange={(event) => setName(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3" />
                                    </label>
                                    <label className="block text-sm font-black text-slate-700">
                                        Phone
                                        <input value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3" />
                                    </label>
                                    <label className="block text-sm font-black text-slate-700">
                                        Start Date
                                        <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3" />
                                    </label>
                                    <button
                                        disabled={isPending || Number(selectedDebt.room_outstanding_balance) !== 0}
                                        onClick={() => assignTenant(selectedDebt)}
                                        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-700 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
                                    >
                                        {isPending ? <RefreshCcw className="animate-spin" size={16} /> : <Plus size={16} />}
                                        Assign New Tenant with Clean Balance
                                    </button>
                                    {Number(selectedDebt.room_outstanding_balance) !== 0 ? (
                                        <p className="flex items-start gap-2 rounded-2xl bg-red-50 p-3 text-xs font-bold text-red-700">
                                            <AlertTriangle size={16} />
                                            Room still has a room-level balance. It must be zero before assigning a clean replacement tenant.
                                        </p>
                                    ) : null}
                                </div>
                            )}
                        </div>

                        <div className="enterprise-panel p-5">
                            <h2 className="text-xl font-black text-slate-950">Landlord Deductions</h2>
                            <p className="mt-1 text-sm font-semibold text-slate-500">Recovery items that reduce landlord payable.</p>
                            <div className="mt-4 space-y-3">
                                {data.deductions.length === 0 ? (
                                    <p className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-500">No landlord deductions yet.</p>
                                ) : data.deductions.slice(0, 10).map((deduction) => (
                                    <div key={deduction.id} className="rounded-2xl border border-slate-200 p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="font-black text-slate-950">{deduction.landlord_name ?? "Landlord"}</p>
                                                <p className="text-xs font-bold text-slate-500">{deduction.tenant_name ?? "Tenant"} · Room {deduction.room_number ?? "N/A"}</p>
                                            </div>
                                            <StatusChip label={deduction.status.replaceAll("_", " ")} tone={Number(deduction.applied_amount) > 0 ? "green" : "orange"} />
                                        </div>
                                        <div className="mt-3 grid grid-cols-2 gap-2 text-sm font-bold">
                                            <span>Deduction: {money(deduction.amount)}</span>
                                            <span>Applied: {money(deduction.applied_amount)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="enterprise-panel p-5">
                            <div className="flex items-start gap-3">
                                <ShieldCheck className="mt-1 text-emerald-600" size={22} />
                                <div>
                                    <h2 className="text-lg font-black text-slate-950">Isolation Check</h2>
                                    <p className="mt-1 text-sm font-semibold text-slate-500">
                                        {data.canAccessAllOffices ? "Admin can see all office debt registers." : "Office mode only sees this active office's vacated tenants and landlord deductions."}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </main>
    );
}
