"use client";

import { memo, useEffect, useMemo, useState, useTransition } from "react";
import type React from "react";
import { useRouter } from "next/navigation";
import { addRoomToLandlord, deleteOrArchiveLandlordRoom, generateLandlordStatement, markLandlordMonthlyPayablePaid, markLandlordSettlementPaid } from "@/app/actions/landlords";
import type { CollectionTenantResult } from "@/lib/collections/types";
import type { LandlordItem, LandlordRoomAssignmentOption } from "@/lib/landlords/types";
import { landlordMonthlyDeductions, landlordMonthlyDue } from "@/lib/landlord-payables/payment-allocation";
import AICollectionInsight from "@/components/office/collections/AICollectionInsight";
import CollectionActionCentre from "@/components/office/collections/CollectionActionCentre";
import TenantSnapshot from "@/components/office/collections/TenantSnapshot";
import RoomActionPanel from "@/components/office/rooms/RoomActionPanel";

type Props = {
    canAdminManage: boolean;
    canManageCollections: boolean;
    canPostPayments: boolean;
    landlord: LandlordItem | null;
    onSaved: () => void | Promise<void>;
    officeOptions?: LandlordRoomAssignmentOption[];
    propertyOptions?: LandlordRoomAssignmentOption[];
    propertyFilter?: string;
    paymentFilter?: string;
};

function money(value: number) {
    return `UGX ${Math.round(value).toLocaleString()}`;
}

function amount(value: unknown) {
    return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function payableMonthBalance(payable: LandlordItem["monthlyPayables"][number]) {
    const dynamicPayable = payable as unknown as Record<string, unknown>;
    const monthlyDue = landlordMonthlyDue(dynamicPayable)
        || Math.max(0, amount(dynamicPayable.total_due) - amount(dynamicPayable.opening_arrears));
    if (monthlyDue > 0 || amount(payable.amount_paid) > 0) {
        return Math.max(0, monthlyDue - Math.min(amount(payable.amount_paid), monthlyDue));
    }
    return Math.max(0, amount(payable.unpaid_balance));
}

function payableDeductions(payable: LandlordItem["monthlyPayables"][number]) {
    return landlordMonthlyDeductions(payable as unknown as Record<string, unknown>);
}

function monthLabel(value: string | null | undefined) {
    if (!value) return "Not set";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("en-UG", { month: "short", year: "numeric" }).format(date);
}

const ROOM_PAGE_SIZE = 40;
const LIST_PREVIEW_SIZE = 12;

function LandlordProfile({
    canAdminManage,
    canManageCollections,
    canPostPayments,
    landlord,
    onSaved,
    officeOptions = [],
    propertyOptions = [],
    propertyFilter = "all",
    paymentFilter = "all",
}: Props) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [tenantContext, setTenantContext] = useState<CollectionTenantResult | null>(null);
    const [tenantMessage, setTenantMessage] = useState<string | null>(null);
    const [openingTenantId, setOpeningTenantId] = useState<string | null>(null);
    const [portfolioOpen, setPortfolioOpen] = useState(false);
    const [roomPage, setRoomPage] = useState(1);
    const [showAllProperties, setShowAllProperties] = useState(false);
    const [showAllSettlements, setShowAllSettlements] = useState(false);
    const [showAllStatements, setShowAllStatements] = useState(false);
    const [showAllPaymentHistory, setShowAllPaymentHistory] = useState(false);
    const [settlementReportOpen, setSettlementReportOpen] = useState(false);
    const [settlementMessage, setSettlementMessage] = useState<string | null>(null);
    const [selectedRoomActionId, setSelectedRoomActionId] = useState<string | null>(null);
    const [roomCommandOpen, setRoomCommandOpen] = useState(false);
    const [roomMessage, setRoomMessage] = useState<string | null>(null);
    const [roomError, setRoomError] = useState<string | null>(null);
    const [roomRemovalTargetId, setRoomRemovalTargetId] = useState<string | null>(null);
    const [roomRemovalReason, setRoomRemovalReason] = useState("");
    const [monthlyPayableMessage, setMonthlyPayableMessage] = useState<string | null>(null);
    const [payablePaymentInputs, setPayablePaymentInputs] = useState<Record<string, string>>({});
    const [roomForm, setRoomForm] = useState({
        roomNumber: "",
        monthlyRent: "",
        startDate: new Date().toISOString().slice(0, 10),
        officeId: "",
        propertyId: "",
        propertyLocation: "",
        roomLocation: "",
        status: "occupied" as "occupied" | "vacant",
        tenantName: "",
        tenantPhone: "",
        notes: "",
    });

    useEffect(() => {
        setTenantContext(null);
        setTenantMessage(null);
        setOpeningTenantId(null);
        setPortfolioOpen(false);
        setRoomPage(1);
        setShowAllProperties(false);
        setShowAllSettlements(false);
        setShowAllStatements(false);
        setShowAllPaymentHistory(false);
        setSettlementReportOpen(false);
        setSettlementMessage(null);
        setSelectedRoomActionId(null);
        setRoomCommandOpen(false);
        setRoomMessage(null);
        setRoomError(null);
        setRoomRemovalTargetId(null);
        setRoomRemovalReason("");
        setMonthlyPayableMessage(null);
        setPayablePaymentInputs({});
        setRoomForm((current) => ({ ...current, roomNumber: "", monthlyRent: "", startDate: new Date().toISOString().slice(0, 10), tenantName: "", tenantPhone: "", notes: "" }));
    }, [landlord?.id]);

    useEffect(() => {
        setRoomPage(1);
    }, [landlord?.id, propertyFilter, paymentFilter]);

    const visibleRooms = useMemo(() => (landlord?.rooms ?? []).filter((item) => {
        const location = propertyLabel(item.property);
        const locationMatch = propertyFilter === "all" || location === propertyFilter;
        const statusMatch = paymentFilter === "all" || item.paymentStatus === paymentFilter;
        return locationMatch && statusMatch;
    }), [landlord?.rooms, paymentFilter, propertyFilter]);
    const visibleRoomTotal = visibleRooms.length;
    const pagedRooms = useMemo(() => visibleRooms.slice(0, roomPage * ROOM_PAGE_SIZE), [roomPage, visibleRooms]);
    const officeChoices = useMemo(() => {
        const map = new Map<string, string>();
        for (const office of landlord?.offices ?? []) map.set(office.id, officeLabel(office));
        for (const option of officeOptions) {
            if (option.officeId) map.set(option.officeId, option.officeName);
        }
        return [...map].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
    }, [landlord?.offices, officeOptions]);
    const propertyChoices = useMemo(() => {
        const map = new Map<string, string>();
        for (const property of landlord?.properties ?? []) map.set(property.id, propertyLabelNullable(property));
        for (const option of propertyOptions) {
            if (option.propertyId) map.set(option.propertyId, option.propertyName);
        }
        return [...map].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
    }, [landlord?.properties, propertyOptions]);
    const paymentHistory = useMemo(() => [...(landlord?.payments ?? []), ...(landlord?.payouts ?? [])], [landlord?.payments, landlord?.payouts]);

    function createStatement(settlementId: string) {
        startTransition(async () => {
            await generateLandlordStatement({ settlementId });
            router.refresh();
        });
    }

    function payLatestSettlement() {
        const settlement = latestSettlement;
        if (!settlement) {
            setSettlementMessage("Generate a settlement before marking landlord paid.");
            return;
        }
        startTransition(async () => {
            try {
                setSettlementMessage(null);
                await markLandlordSettlementPaid({ settlementId: settlement.id, paymentMethod: "manual" });
                setSettlementMessage("Landlord payment status updated.");
                await onSaved();
            } catch (error) {
                setSettlementMessage(error instanceof Error ? error.message : "Unable to mark landlord paid.");
            }
        });
    }

    function payMonthlyPayable(payableId: string, fallbackAmount: number) {
        const inputAmount = Number(payablePaymentInputs[payableId] || fallbackAmount);
        startTransition(async () => {
            try {
                setMonthlyPayableMessage(null);
                await markLandlordMonthlyPayablePaid({
                    monthlyPayableId: payableId,
                    amount: inputAmount,
                    paymentMethod: "manual",
                    reference: `LMP-${Date.now()}`,
                    notes: "Recorded from landlord unpaid payable ledger.",
                });
                setMonthlyPayableMessage("Landlord monthly payment recorded.");
                setPayablePaymentInputs((current) => ({ ...current, [payableId]: "" }));
                await onSaved();
                router.refresh();
            } catch (error) {
                setMonthlyPayableMessage(error instanceof Error ? error.message : "Unable to record landlord monthly payment.");
            }
        });
    }

    async function refreshTenantContext(current: CollectionTenantResult | null = tenantContext) {
        if (!current) return;
        const response = await fetch(`/api/collections/tenant?id=${encodeURIComponent(current.tenant.id)}`);
        const payload = await response.json();

        if (!response.ok) {
            throw new Error(payload.error ?? "Tenant refresh failed.");
        }

        setTenantContext(payload.result);
    }

    function openTenant(tenantId: string | null | undefined) {
        if (!tenantId) {
            setTenantMessage("This room does not have an active tenant to open.");
            return;
        }

        setOpeningTenantId(tenantId);
        setTenantMessage(null);
        startTransition(async () => {
            try {
                const response = await fetch(`/api/collections/tenant?id=${encodeURIComponent(tenantId)}`);
                const payload = await response.json();

                if (!response.ok) {
                    throw new Error(payload.error ?? "Unable to open tenant.");
                }

                setTenantContext(payload.result);
                setTenantMessage("Tenant action card opened.");
            } catch (error) {
                setTenantMessage(error instanceof Error ? error.message : "Unable to open tenant.");
            } finally {
                setOpeningTenantId(null);
            }
        });
    }

    async function handleTenantSaved() {
        await refreshTenantContext();
        await onSaved();
    }

    function updateRoomForm<K extends keyof typeof roomForm>(key: K, value: (typeof roomForm)[K]) {
        setRoomForm((current) => ({ ...current, [key]: value }));
        setRoomError(null);
    }

    function submitAddRoom() {
        if (!landlord) return;
        startTransition(async () => {
            try {
                setRoomMessage(null);
                setRoomError(null);
                await addRoomToLandlord({
                    landlordId: landlord.id,
                    roomNumber: roomForm.roomNumber,
                    monthlyRent: Number(roomForm.monthlyRent),
                    startDate: roomForm.startDate,
                    officeId: roomForm.officeId,
                    propertyId: roomForm.propertyId || null,
                    propertyLocation: roomForm.propertyLocation || null,
                    roomLocation: roomForm.roomLocation || null,
                    status: roomForm.status,
                    tenantName: roomForm.tenantName || null,
                    tenantPhone: roomForm.tenantPhone || null,
                    notes: roomForm.notes || null,
                });
                setRoomMessage("Room added to landlord portfolio. Rent roll and settlement estimates refreshed.");
                setRoomForm((current) => ({ ...current, roomNumber: "", monthlyRent: "", startDate: new Date().toISOString().slice(0, 10), tenantName: "", tenantPhone: "", notes: "" }));
                await onSaved();
            } catch (error) {
                setRoomError(error instanceof Error ? error.message : "Unable to add room.");
            }
        });
    }

    function openRoomRemoval(roomId: string) {
        setRoomRemovalTargetId(roomId);
        setRoomRemovalReason("");
        setRoomError(null);
    }

    function closeRoomRemoval() {
        setRoomRemovalTargetId(null);
        setRoomRemovalReason("");
    }

    function removeRoom() {
        if (!landlord) return;
        const target = visibleRooms.find((item) => item.room.id === roomRemovalTargetId);
        if (!target) return;
        const reason = roomRemovalReason.trim();
        if (!reason) {
            setRoomError("Enter a reason before removing this room.");
            return;
        }

        startTransition(async () => {
            try {
                setRoomMessage(null);
                setRoomError(null);
                const result = await deleteOrArchiveLandlordRoom({
                    landlordId: landlord.id,
                    roomId: target.room.id,
                    reason,
                });
                setRoomMessage(result.mode === "deleted" ? "Room deleted because it had no tenant/payment/history." : "Room archived safely because history exists.");
                closeRoomRemoval();
                await onSaved();
            } catch (error) {
                setRoomError(error instanceof Error ? error.message : "Unable to remove room.");
            }
        });
    }

    if (!landlord) {
        return (
            <div className="bg-white rounded-3xl shadow-lg p-8">
                <h2 className="text-2xl font-bold">Landlord Profile</h2>
                <p className="text-slate-500 mt-2">Select a landlord to view settlements and portfolio.</p>
            </div>
        );
    }

    const hasMoreRooms = pagedRooms.length < visibleRoomTotal;
    const visibleProperties = showAllProperties ? landlord.properties : landlord.properties.slice(0, LIST_PREVIEW_SIZE);
    const visibleSettlements = showAllSettlements ? landlord.settlements : landlord.settlements.slice(0, LIST_PREVIEW_SIZE);
    const visibleStatements = showAllStatements ? landlord.statements : landlord.statements.slice(0, LIST_PREVIEW_SIZE);
    const visiblePaymentHistory = showAllPaymentHistory ? paymentHistory : paymentHistory.slice(0, LIST_PREVIEW_SIZE);
    const estimate = landlord.settlementEstimate;
    const landlordPortfolioNet = Math.max(0, estimate.commissionBaseAmount - estimate.companyCommissionAmount);
    const latestSettlement = [...landlord.settlements].sort((a, b) =>
        new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
    )[0] ?? null;
    const unpaidMonths = landlord.unpaidMonthlyPayables;
    const visibleUnpaidMonths = unpaidMonths.slice(0, LIST_PREVIEW_SIZE);
    const selectedRoomAction = visibleRooms.find((item) => item.room.id === selectedRoomActionId) ?? null;
    const roomRemovalTarget = visibleRooms.find((item) => item.room.id === roomRemovalTargetId) ?? null;
    return (
        <div className="space-y-6">
            <div className="bg-white rounded-3xl shadow-lg overflow-hidden">
                <div className="bg-gradient-to-r from-slate-900 to-emerald-800 text-white p-8">
                    <div className="flex justify-between gap-6">
                        <div>
                            <h2 className="text-3xl font-black">{landlord.full_name}</h2>
                            <p className="text-emerald-100 mt-2">
                                {landlord.phone ?? "No phone"} · {landlord.email ?? "No email"}
                            </p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs text-emerald-100">Status</p>
                            <p className="text-2xl font-black capitalize">{landlord.status ?? "active"}</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-7 border-b">
                    <Metric label="Properties" value={String(landlord.properties.length)} />
                    <Metric label="Rooms" value={String(landlord.rooms.length)} />
                    <Metric label="Monthly Expected" value={money(landlord.totalExpectedMonthlyCollection)} tone="text-blue-600" />
                    <Metric label="Collected This Month" value={money(landlord.totalCollectedThisMonth)} tone="text-green-600" />
                    <Metric label="Outstanding" value={money(landlord.totalOutstandingBalance)} tone="text-red-600" />
                    <Metric label="Vacated Debt" value={money(landlord.remainingRecoveryBalance)} tone="text-amber-700" />
                    <Metric label="Unpaid Landlord" value={money(landlord.totalUnpaidMonthlyPayables)} tone="text-red-700" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 p-6">
                    <Detail label="Landlord Code" value={landlord.landlord_code ?? "Not assigned"} />
                    <Detail label="National ID" value={landlord.national_id ?? "Not recorded"} />
                    <Detail label="Office" value={landlord.offices.map(officeLabel).join(", ") || "Company-wide"} />
                    <Detail label="Locations" value={landlord.locations.join(", ") || "No locations assigned"} />
                    <Detail label="Expected Income" value={landlord.expected_income ? money(landlord.expected_income) : "Not set"} />
                    <Detail label="Landlord Payable" value={money(landlord.totalLandlordPayable)} />
                    <Detail label="Recovery Deduction" value={money(landlord.remainingRecoveryBalance)} />
                </div>
            </div>

            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg">
                <div className="flex flex-col gap-2 border-b border-slate-200 bg-gradient-to-r from-slate-950 via-slate-900 to-emerald-900 px-4 py-3 text-white md:flex-row md:items-center md:justify-between">
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-200">Settlement Engine</p>
                        <h2 className="text-lg font-black">Landlord Advance Settlement</h2>
                    </div>
                    <span className="w-fit rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-black text-emerald-100">
                        {estimate.settlementMonth}
                    </span>
                </div>

                <div className="space-y-3 p-4">
                    <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
                        <FinanceMiniCard label="Rooms" value={estimate.roomsOwned.toLocaleString()} tone="text-emerald-700" />
                        <FinanceMiniCard label="Commission Mode" value={modeLabel(estimate.commissionCalculationMode)} tone="text-blue-700" />
                        <FinanceMiniCard label="Portfolio Gross" value={money(estimate.expectedGrossRent)} />
                        <FinanceMiniCard label="Net Payable" value={money(estimate.netLandlordPayable)} tone="text-emerald-700" />
                    </div>

                    {estimate.carriedForwardRecoveryBalance > 0 ? (
                        <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-800">
                            Recovery warning: {money(estimate.carriedForwardRecoveryBalance)} will carry forward to the next settlement.
                        </div>
                    ) : null}

                    <div className="overflow-hidden rounded-2xl border border-slate-200">
                        <table className="w-full text-sm">
                            <tbody className="divide-y divide-slate-100">
                                <SettlementCalcRow label="Gross Rent Roll" value={money(estimate.expectedGrossRent)} />
                                <SettlementCalcRow label={`Commission ${estimate.companyCommissionRate}%`} value={`-${money(estimate.companyCommissionAmount)}`} tone="text-blue-700" />
                                <SettlementCalcRow
                                    label={estimate.commissionCalculationMode === "occupied_room_based" ? "Vacant Excluded Before Commission" : "Vacant Deduction"}
                                    value={estimate.emptyRoomDeductions ? `-${money(estimate.emptyRoomDeductions)}` : money(0)}
                                    tone="text-amber-700"
                                />
                                <SettlementCalcRow label="Recovery Deduction" value={estimate.vacatedTenantDebtDeductions ? `-${money(estimate.vacatedTenantDebtDeductions)}` : money(0)} tone="text-red-700" />
                                <SettlementCalcRow label="Net Payable" value={money(estimate.netLandlordPayable)} tone="text-emerald-700" strong />
                            </tbody>
                        </table>
                    </div>

                    {(estimate.vacantRoomLines.length > 0 || estimate.recoveryLines.length > 0) ? (
                        <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
                            {estimate.vacantRoomLines.length > 0 ? (
                                <details className="rounded-2xl border border-amber-200 bg-amber-50">
                                    <summary className="cursor-pointer px-3 py-2 text-xs font-black uppercase tracking-wide text-amber-800">
                                        Vacant Rooms Not Payable ({estimate.vacantRoomLines.length})
                                    </summary>
                                    <div className="max-h-36 space-y-1 overflow-auto border-t border-amber-200 p-2">
                                        {estimate.vacantRoomLines.slice(0, 12).map((line) => (
                                            <div key={line.roomId} className="rounded-xl bg-white/85 px-3 py-1.5 text-xs font-bold text-amber-950">
                                                Room {line.roomNumber} · {line.propertyName} · {line.reason}
                                            </div>
                                        ))}
                                    </div>
                                </details>
                            ) : null}

                            {estimate.recoveryLines.length > 0 ? (
                                <details className="rounded-2xl border border-red-200 bg-red-50">
                                    <summary className="cursor-pointer px-3 py-2 text-xs font-black uppercase tracking-wide text-red-800">
                                        Recovery Deductions ({estimate.recoveryLines.length})
                                    </summary>
                                    <div className="max-h-36 space-y-1 overflow-auto border-t border-red-200 p-2">
                                        {estimate.recoveryLines.map((line) => (
                                            <div key={line.deductionId} className="rounded-xl bg-white/85 px-3 py-1.5 text-xs font-bold text-red-950">
                                                {line.tenantName} · Room {line.roomNumber} · Rent {money(line.roomRent)} · Outstanding {money(line.amount)} · Deduct {money(line.appliedInEstimate)}
                                            </div>
                                        ))}
                                    </div>
                                </details>
                            ) : null}
                        </div>
                    ) : null}

                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => setSettlementReportOpen((value) => !value)}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 hover:border-blue-300 hover:text-blue-700"
                    >
                        {settlementReportOpen ? "Hide Report Preview" : "Preview Report"}
                    </button>
                    <button
                        type="button"
                        onClick={() => window.print()}
                        className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-black text-white hover:bg-slate-800"
                    >
                        Print Report
                    </button>
                    <button
                        type="button"
                        onClick={() => window.print()}
                        className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-black text-white hover:bg-blue-800"
                    >
                        Export PDF
                    </button>
                    <button
                        type="button"
                        disabled={isPending || !latestSettlement}
                        onClick={payLatestSettlement}
                        className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-black text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        Mark Landlord Paid
                    </button>
                </div>
                {settlementMessage ? (
                    <p className="rounded-2xl bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">{settlementMessage}</p>
                ) : null}
                </div>

                {settlementReportOpen ? (
                    <div id="landlord-report-print-area" className="mx-auto w-full max-w-5xl min-w-0 overflow-hidden rounded-3xl border-2 border-slate-300 bg-white p-4 text-slate-950 shadow-2xl sm:p-5 md:p-6 print:max-w-none print:overflow-visible print:rounded-none print:border-slate-900 print:p-8 print:shadow-none">
                        <div className="flex flex-col gap-4 border-b-2 border-slate-900 pb-5 md:flex-row md:items-start md:justify-between">
                            <div className="min-w-0">
                                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-600">Landlord payment report</p>
                                <h3 className="mt-2 break-words text-[clamp(1.35rem,7vw,1.875rem)] font-black leading-tight text-slate-950 md:text-3xl">{landlord.full_name}</h3>
                                <p className="mt-1 text-sm font-bold text-slate-700 [overflow-wrap:anywhere]">
                                    {landlord.phone ?? "No phone"} · {landlord.offices.map(officeLabel).join(", ") || "Company-wide"}
                                </p>
                            </div>
                            <div className="min-w-0 rounded-2xl border border-slate-300 bg-slate-50 p-3 text-sm font-bold text-slate-800 sm:p-4 md:text-right">
                                <p>Settlement period: <span className="text-slate-950">{estimate.settlementMonth}</span></p>
                                <p>Prepared: <span className="text-slate-950">{new Date().toLocaleString("en-UG")}</span></p>
                                <p>Payment status: <span className="capitalize text-slate-950">{estimate.paymentStatus.replaceAll("_", " ")}</span></p>
                            </div>
                        </div>

                        <div className="mt-5 min-w-0 rounded-2xl border-2 border-slate-200 bg-white p-4 sm:p-5">
                            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-600">Landlord-facing settlement summary</p>
                            <div className="mt-4 grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
                                <ReportLine label="Landlord Portfolio Net" value={money(landlordPortfolioNet)} strong />
                                <ReportLine label="Company commission rate" value={`${estimate.companyCommissionRate}%`} />
                                <ReportLine label="Commission mode" value={modeLabel(estimate.commissionCalculationMode)} />
                                <ReportLine label={estimate.commissionCalculationMode === "occupied_room_based" ? "Vacant rooms excluded before commission" : "Vacant Room Deductions"} value={`-${money(estimate.emptyRoomDeductions)}`} />
                                <ReportLine label="Previous carried-forward deductions" value={money(estimate.previousUnrecoveredTenantDebts)} />
                                <ReportLine label="Amount recovered this month" value={`-${money(estimate.vacatedTenantDebtDeductions)}`} />
                                <ReportLine label="Remaining recovery balance" value={money(estimate.carriedForwardRecoveryBalance)} />
                            </div>
                            <div className="mt-5 min-w-0 rounded-2xl border-2 border-slate-900 bg-slate-50 p-3 sm:p-4">
                                <ReportLine label="Net Landlord Payable" value={money(estimate.netLandlordPayable)} strong />
                            </div>
                        </div>

                        {estimate.advanceDeductionLines.length > 0 ? (
                            <div className="mt-5 min-w-0 rounded-2xl border-2 border-slate-200 bg-white p-4 sm:p-5">
                                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-600">Landlord Advance Deductions</p>
                                <div className="mt-4 space-y-3 md:hidden print:hidden">
                                    {estimate.advanceDeductionLines.map((line) => (
                                        <div key={line.advanceId} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                            <ReportLine label="Advance date" value={line.advanceDate ? monthLabel(line.advanceDate) : "Not dated"} />
                                            <ReportLine label="Original advance" value={money(line.originalAdvanceAmount)} />
                                            <ReportLine label="Deduction term" value={line.deductionTerm} />
                                            <ReportLine label="This month deduction" value={`-${money(line.thisMonthDeduction)}`} strong />
                                            <ReportLine label="Remaining balance" value={money(line.remainingAdvanceBalance)} />
                                        </div>
                                    ))}
                                    <div className="rounded-2xl border-2 border-slate-900 bg-slate-50 p-3">
                                        <ReportLine label="Total advance deduction this month" value={`-${money(estimate.landlordAdvanceDeductions)}`} strong />
                                    </div>
                                </div>
                                <div className="mt-4 hidden overflow-x-auto rounded-xl border border-slate-200 md:block print:block">
                                    <table className="min-w-full divide-y divide-slate-200 text-sm md:min-w-[760px] print:min-w-full">
                                        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
                                            <tr>
                                                <th className="px-3 py-2">Advance date</th>
                                                <th className="px-3 py-2 text-right">Original advance</th>
                                                <th className="px-3 py-2">Deduction term</th>
                                                <th className="px-3 py-2 text-right">This month deduction</th>
                                                <th className="px-3 py-2 text-right">Remaining balance</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {estimate.advanceDeductionLines.map((line) => (
                                                <tr key={line.advanceId}>
                                                    <td className="px-3 py-2 font-bold">{line.advanceDate ? monthLabel(line.advanceDate) : "Not dated"}</td>
                                                    <td className="px-3 py-2 text-right font-bold">{money(line.originalAdvanceAmount)}</td>
                                                    <td className="px-3 py-2 font-bold text-slate-700">{line.deductionTerm}</td>
                                                    <td className="px-3 py-2 text-right font-black text-red-700">-{money(line.thisMonthDeduction)}</td>
                                                    <td className="px-3 py-2 text-right font-black text-slate-950">{money(line.remainingAdvanceBalance)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="bg-slate-100 text-sm font-black">
                                            <tr>
                                                <td className="px-3 py-2" colSpan={3}>Total advance deduction this month</td>
                                                <td className="px-3 py-2 text-right text-red-700">-{money(estimate.landlordAdvanceDeductions)}</td>
                                                <td />
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>
                        ) : null}

                        {landlord.monthlyPayables.length > 0 ? (
                            <div className="mt-5 min-w-0 rounded-2xl border-2 border-slate-200 bg-white p-4 sm:p-5">
                                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-600">Multi-month payable history</p>
                                <div className="mt-4 space-y-3 md:hidden print:hidden">
                                    {landlord.monthlyPayables.slice(0, 12).map((payable) => {
                                        const deductions = payableDeductions(payable);
                                        return (
                                            <div key={payable.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                                <ReportLine label="Month" value={monthLabel(payable.settlement_month)} strong />
                                                <ReportLine label="Net payable" value={money(Number(payable.net_payable ?? 0))} />
                                                <ReportLine label="Deductions" value={money(deductions)} />
                                                <ReportLine label="Paid" value={money(Number(payable.amount_paid ?? 0))} />
                                                <ReportLine label="Balance still due" value={money(payableMonthBalance(payable))} strong />
                                            </div>
                                        );
                                    })}
                                    <div className="rounded-2xl border-2 border-slate-900 bg-white p-3">
                                        <ReportLine label="Total net payable" value={money(landlord.monthlyPayables.reduce((total, payable) => total + Number(payable.net_payable ?? 0), 0))} />
                                        <ReportLine label="Total paid" value={money(landlord.monthlyPayables.reduce((total, payable) => total + Number(payable.amount_paid ?? 0), 0))} />
                                        <ReportLine label="Final amount due" value={money(landlord.monthlyPayables.reduce((total, payable) => total + payableMonthBalance(payable), 0))} strong />
                                    </div>
                                </div>
                                <div className="mt-4 hidden overflow-x-auto rounded-xl border border-slate-200 md:block print:block">
                                    <table className="min-w-full divide-y divide-slate-200 text-sm md:min-w-[760px] print:min-w-full">
                                        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
                                            <tr>
                                                <th className="px-3 py-2">Month</th>
                                                <th className="px-3 py-2 text-right">Net payable</th>
                                                <th className="px-3 py-2 text-right">Deductions</th>
                                                <th className="px-3 py-2 text-right">Paid</th>
                                                <th className="px-3 py-2 text-right">Balance still due</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {landlord.monthlyPayables.slice(0, 12).map((payable) => {
                                                const deductions = payableDeductions(payable);
                                                return (
                                                    <tr key={payable.id}>
                                                        <td className="px-3 py-2 font-black">{monthLabel(payable.settlement_month)}</td>
                                                        <td className="px-3 py-2 text-right font-bold">{money(Number(payable.net_payable ?? 0))}</td>
                                                        <td className="px-3 py-2 text-right font-bold text-red-700">{money(deductions)}</td>
                                                        <td className="px-3 py-2 text-right font-bold text-emerald-700">{money(Number(payable.amount_paid ?? 0))}</td>
                                                        <td className="px-3 py-2 text-right font-black text-slate-950">{money(payableMonthBalance(payable))}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                        <tfoot className="bg-slate-100 text-sm font-black">
                                            <tr>
                                                <td className="px-3 py-2">Final amount due</td>
                                                <td className="px-3 py-2 text-right">{money(landlord.monthlyPayables.reduce((total, payable) => total + Number(payable.net_payable ?? 0), 0))}</td>
                                                <td />
                                                <td className="px-3 py-2 text-right">{money(landlord.monthlyPayables.reduce((total, payable) => total + Number(payable.amount_paid ?? 0), 0))}</td>
                                                <td className="px-3 py-2 text-right">{money(landlord.monthlyPayables.reduce((total, payable) => total + payableMonthBalance(payable), 0))}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>
                        ) : null}

                        <div className="mt-5 grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
                            <ReportRoomList title="Occupied Rooms" roomNumbers={estimate.occupiedRoomLines.map((line) => line.roomNumber)} tone="green" />
                            <ReportRoomList title="Vacant Rooms" roomNumbers={estimate.vacantRoomLines.map((line) => line.roomNumber)} tone="amber" />
                            <ReportBox
                                title="Move-in payable decisions"
                                lines={[...estimate.occupiedRoomLines, ...estimate.vacantRoomLines]
                                    .filter((line) => /Included: tenant entered before cutoff|Excluded: tenant entered after cutoff|Company extra profit: landlord already paid/i.test(line.reason))
                                    .map((line) => {
                                        const amountLabel = line.companyExtraProfitAmount > 0
                                            ? `Company extra profit ${money(line.companyExtraProfitAmount)}`
                                            : line.includedPayableAmount > 0
                                                ? `Included payable ${money(line.includedPayableAmount)}`
                                                : "Not included in landlord payable";
                                        return `Room ${line.roomNumber} · ${line.reason} · ${amountLabel}`;
                                    })}
                            />
                            <ReportBox
                                title="Vacated tenant recovery deductions"
                                lines={estimate.recoveryLines.map((line) =>
                                    `${line.tenantName} · Room ${line.roomNumber} · Room rent ${money(line.roomRent)} · Outstanding left ${money(line.amount)} · Deducted ${money(line.appliedInEstimate)} · ${line.reason}`,
                                )}
                            />
                            <div className="min-w-0 rounded-2xl border-2 border-slate-300 bg-white p-4 sm:p-5">
                                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-600">Approval</p>
                                <div className="mt-4 space-y-3 text-sm font-bold text-slate-800">
                                    <p className="[overflow-wrap:anywhere]">Prepared by: <span className="text-slate-500">________________________</span></p>
                                    <p className="[overflow-wrap:anywhere]">Approved by: <span className="text-slate-500">________________________</span></p>
                                    <p className="[overflow-wrap:anywhere]">Date/time: <span className="text-slate-950">{new Date().toLocaleString("en-UG")}</span></p>
                                </div>
                                <div className="mt-10 grid grid-cols-1 gap-8 text-xs font-black uppercase tracking-wide text-slate-600 md:grid-cols-2">
                                    <div className="border-t-2 border-slate-900 pt-3">Landlord signature</div>
                                    <div className="border-t-2 border-slate-900 pt-3">Company signature</div>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>

            <Section title="Room Portfolio">
                {canAdminManage ? (
                    <div className="mb-4 rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div>
                                <p className="text-sm font-black text-slate-950">Admin Room Management</p>
                                <p className="mt-1 text-xs font-bold text-slate-600">
                                    Add a room directly to this landlord or archive/delete rooms from the active rent roll.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setRoomCommandOpen((open) => !open)}
                                className="rounded-2xl bg-blue-700 px-4 py-2 text-xs font-black text-white shadow-sm hover:bg-blue-800"
                            >
                                {roomCommandOpen ? "Close Add Room" : "Add Room"}
                            </button>
                        </div>
                        {roomCommandOpen ? (
                            <div className="mt-4 rounded-2xl border border-white bg-white p-4 shadow-sm">
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                                    <Field label="Room Number">
                                        <input value={roomForm.roomNumber} onChange={(event) => updateRoomForm("roomNumber", event.target.value)} placeholder="e.g. A12" />
                                    </Field>
                                    <Field label="Monthly Rent">
                                        <input value={roomForm.monthlyRent} onChange={(event) => updateRoomForm("monthlyRent", event.target.value)} inputMode="numeric" placeholder="70000" />
                                    </Field>
                                    <Field label="Start Date / Effective Date">
                                        <input value={roomForm.startDate} onChange={(event) => updateRoomForm("startDate", event.target.value)} type="date" required />
                                    </Field>
                                    <Field label="Office">
                                        <select value={roomForm.officeId} onChange={(event) => updateRoomForm("officeId", event.target.value)}>
                                            <option value="">Select office</option>
                                            {officeChoices.map((office) => <option key={office.id} value={office.id}>{office.name}</option>)}
                                        </select>
                                    </Field>
                                    <Field label="Status">
                                        <select value={roomForm.status} onChange={(event) => updateRoomForm("status", event.target.value as "occupied" | "vacant")}>
                                            <option value="occupied">Occupied</option>
                                            <option value="vacant">Vacant</option>
                                        </select>
                                    </Field>
                                    <Field label="Existing Property / Location">
                                        <select value={roomForm.propertyId} onChange={(event) => updateRoomForm("propertyId", event.target.value)}>
                                            <option value="">Create/use typed location</option>
                                            {propertyChoices.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}
                                        </select>
                                    </Field>
                                    <Field label="Property / Location">
                                        <input value={roomForm.propertyLocation} onChange={(event) => updateRoomForm("propertyLocation", event.target.value)} placeholder="Location if not listed" />
                                    </Field>
                                    <Field label="Room Location">
                                        <input value={roomForm.roomLocation} onChange={(event) => updateRoomForm("roomLocation", event.target.value)} placeholder="Floor / block / notes" />
                                    </Field>
                                    <Field label="Tenant Name">
                                        <input value={roomForm.tenantName} onChange={(event) => updateRoomForm("tenantName", event.target.value)} placeholder="Optional" disabled={roomForm.status === "vacant"} />
                                    </Field>
                                    <Field label="Tenant Phone">
                                        <input value={roomForm.tenantPhone} onChange={(event) => updateRoomForm("tenantPhone", event.target.value)} placeholder="Optional" disabled={roomForm.status === "vacant"} />
                                    </Field>
                                    <Field label="Notes">
                                        <input value={roomForm.notes} onChange={(event) => updateRoomForm("notes", event.target.value)} placeholder="Optional audit note" />
                                    </Field>
                                </div>
                                <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                    <div>
                                        {roomError ? <p className="text-sm font-black text-red-700">{roomError}</p> : null}
                                        {roomMessage ? <p className="text-sm font-black text-emerald-700">{roomMessage}</p> : null}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={submitAddRoom}
                                        disabled={isPending}
                                        className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {isPending ? "Saving..." : "Save Room"}
                                    </button>
                                </div>
                            </div>
                        ) : null}
                    </div>
                ) : null}

                {!canAdminManage && roomMessage ? (
                    <p className="mb-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-800">{roomMessage}</p>
                ) : null}

                {landlord.rooms.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8">
                        <p className="font-bold text-slate-900">No rooms are linked to this landlord yet.</p>
                        <p className="text-sm text-slate-500 mt-1">Assign rooms or properties to this landlord and the portfolio will appear here.</p>
                    </div>
                ) : !portfolioOpen ? (
                    <div className="rounded-2xl border border-blue-100 bg-blue-50 p-6">
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                            <div>
                                <p className="font-black text-slate-950">{visibleRoomTotal.toLocaleString()} rooms match the active filters.</p>
                                <p className="mt-1 text-sm font-semibold text-slate-600">
                                    The full portfolio is lazy-rendered to keep the browser light. Open it only when you need room-level actions.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setPortfolioOpen(true)}
                                className="rounded-2xl bg-blue-700 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-blue-800"
                            >
                                Open Room Portfolio
                            </button>
                        </div>
                    </div>
                ) : visibleRooms.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8">
                        <p className="font-bold text-slate-900">No rooms match the active filters.</p>
                        <p className="text-sm text-slate-500 mt-1">Try another location or payment status.</p>
                    </div>
                ) : (
                    <div className="overflow-hidden rounded-2xl border border-slate-200">
                        <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 md:flex-row md:items-center md:justify-between">
                            <p className="text-sm font-black text-slate-700">
                                Showing {pagedRooms.length.toLocaleString()} of {visibleRoomTotal.toLocaleString()} rooms
                            </p>
                            <button
                                type="button"
                                onClick={() => setPortfolioOpen(false)}
                                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:border-blue-300 hover:text-blue-700"
                            >
                                Hide Portfolio
                            </button>
                        </div>
                        <div className="max-h-[620px] overflow-auto">
                            <table className="min-w-full divide-y divide-slate-200 text-sm">
                                <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                                    <tr>
                                        <th className="px-4 py-3">Room</th>
                                        <th className="px-4 py-3">Property / Location</th>
                                        <th className="px-4 py-3">Tenant</th>
                                        <th className="px-4 py-3">Tenant Phone</th>
                                        <th className="px-4 py-3">Start / Payable</th>
                                        <th className="px-4 py-3 text-right">Previous Balance</th>
                                        <th className="px-4 py-3 text-right">Current Month Rent</th>
                                        <th className="px-4 py-3 text-right">Total Outstanding</th>
                                        <th className="px-4 py-3 text-right">Collected This Month</th>
                                        <th className="px-4 py-3">Status</th>
                                        <th className="px-4 py-3 text-right">Action</th>
                                        {canAdminManage ? <th className="px-4 py-3 text-right">Admin</th> : null}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 bg-white">
                                    {pagedRooms.map((item) => (
                                        <tr
                                            key={item.room.id}
                                            onClick={() => setSelectedRoomActionId(item.room.id)}
                                            className={`cursor-pointer hover:bg-slate-50 ${selectedRoomActionId === item.room.id ? "bg-blue-50" : ""}`}
                                        >
                                            <td className="px-4 py-4">
                                                <p className="font-black text-slate-900">{item.room.room_number ?? "Unnumbered"}</p>
                                                <p className="text-xs text-slate-500">{item.room.status ?? "active"}</p>
                                            </td>
                                            <td className="px-4 py-4">
                                                <p className="font-semibold text-slate-900">{propertyLabel(item.property)}</p>
                                                <p className="text-xs text-slate-500">{item.property?.address ?? item.property?.city ?? "No address"}</p>
                                            </td>
                                            <td className="px-4 py-4">
                                                <p className="font-semibold text-slate-900">{item.tenant?.full_name ?? "Vacant"}</p>
                                                <p className="text-xs text-slate-500">{item.tenant?.phone ?? "No tenant assigned"}</p>
                                            </td>
                                            <td className="px-4 py-4 font-semibold text-slate-700">{item.tenant?.phone ?? "Not recorded"}</td>
                                            <td className="px-4 py-4">
                                                <p className="font-bold text-slate-900">{item.startDate ?? "Not set"}</p>
                                                <p className={`mt-1 text-xs font-black ${item.payableThisMonth ? "text-emerald-700" : "text-amber-700"}`}>
                                                    Payable this month: {item.payableThisMonth ? "Yes" : "No"}
                                                </p>
                                                <p className="mt-0.5 text-xs font-semibold text-slate-500">{item.payableReason.replace(/^No - /, "").replace(/^Yes - /, "")}</p>
                                            </td>
                                            <td className="px-4 py-4 text-right font-bold text-slate-700">{money(item.previousBalance)}</td>
                                            <td className="px-4 py-4 text-right font-bold">{money(item.currentMonthRent)}</td>
                                            <td className="px-4 py-4 text-right font-bold text-red-700">{money(item.totalOutstandingBalance)}</td>
                                            <td className="px-4 py-4 text-right font-bold text-emerald-700">{money(item.collectedThisMonth)}</td>
                                            <td className="px-4 py-4">
                                                <StatusBadge status={item.paymentStatus} />
                                            </td>
                                            <td className="px-4 py-4 text-right">
                                                <button
                                                    disabled={!item.tenant?.id || isPending || openingTenantId === item.tenant?.id}
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        openTenant(item.tenant?.id);
                                                    }}
                                                    className="rounded-full bg-blue-700 px-4 py-2 text-xs font-black text-white shadow-sm hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-40"
                                                >
                                                    {openingTenantId === item.tenant?.id ? "Opening..." : "Open Tenant"}
                                                </button>
                                            </td>
                                            {canAdminManage ? (
                                                <td className="px-4 py-4 text-right">
                                                    <button
                                                        type="button"
                                                        disabled={isPending}
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            openRoomRemoval(item.room.id);
                                                        }}
                                                        className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-xs font-black text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                                                    >
                                                        Delete Room
                                                    </button>
                                                </td>
                                            ) : null}
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="sticky bottom-0 bg-slate-900 text-white">
                                    <tr>
                                        <td className="px-4 py-4 font-black" colSpan={5}>Visible total</td>
                                        <td className="px-4 py-4 text-right font-black">{money(visibleRooms.reduce((total, item) => total + item.previousBalance, 0))}</td>
                                        <td className="px-4 py-4 text-right font-black">{money(visibleRooms.reduce((total, item) => total + item.currentMonthRent, 0))}</td>
                                        <td className="px-4 py-4 text-right font-black">{money(visibleRooms.reduce((total, item) => total + item.totalOutstandingBalance, 0))}</td>
                                        <td className="px-4 py-4 text-right font-black">{money(visibleRooms.reduce((total, item) => total + item.collectedThisMonth, 0))}</td>
                                        <td className="px-4 py-4" colSpan={canAdminManage ? 3 : 2} />
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                        {hasMoreRooms ? (
                            <div className="border-t border-slate-200 bg-white p-4 text-center">
                                <button
                                    type="button"
                                    onClick={() => setRoomPage((page) => page + 1)}
                                    className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-slate-800"
                                >
                                    Load {Math.min(ROOM_PAGE_SIZE, visibleRoomTotal - pagedRooms.length)} more rooms
                                </button>
                            </div>
                        ) : null}
                    </div>
                )}
                <div className="mt-4">
                    <RoomActionPanel
                        isAdmin={canAdminManage}
                        room={selectedRoomAction ? {
                            id: selectedRoomAction.room.id,
                            roomNumber: selectedRoomAction.room.room_number,
                            status: selectedRoomAction.room.status,
                            monthlyRent: selectedRoomAction.monthlyRent,
                            outstandingBalance: selectedRoomAction.totalOutstandingBalance,
                            landlordName: landlord.full_name,
                            propertyName: propertyLabel(selectedRoomAction.property),
                            officeName: selectedRoomAction.room.office_id ? landlord.offices.find((office) => office.id === selectedRoomAction.room.office_id)?.office_name ?? landlord.offices.find((office) => office.id === selectedRoomAction.room.office_id)?.name ?? null : null,
                            tenantName: selectedRoomAction.tenant?.full_name ?? null,
                            tenantPhone: selectedRoomAction.tenant?.phone ?? null,
                        } : null}
                        onSaved={async () => {
                            await onSaved();
                        }}
                    />
                </div>
                {canAdminManage && roomRemovalTarget ? (
                    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/70 px-4 py-6 backdrop-blur-sm">
                        <div className="w-full max-w-2xl rounded-3xl border border-red-200 bg-white p-6 shadow-2xl">
                            <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-start md:justify-between">
                                <div>
                                    <p className="text-xs font-black uppercase tracking-[0.18em] text-red-600">Confirm room removal</p>
                                    <h3 className="mt-2 text-2xl font-black text-slate-950">
                                        Room {roomRemovalTarget.room.room_number ?? "Unnumbered"}
                                    </h3>
                                    <p className="mt-1 text-sm font-bold text-slate-500">
                                        {landlord.full_name} · {propertyLabel(roomRemovalTarget.property)}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={closeRoomRemoval}
                                    className="rounded-full border border-slate-200 px-4 py-2 text-xs font-black text-slate-600 hover:border-slate-400"
                                >
                                    Cancel
                                </button>
                            </div>

                            <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
                                <ReportLine label="Landlord" value={landlord.full_name} />
                                <ReportLine label="Monthly Rent" value={money(roomRemovalTarget.monthlyRent)} />
                                <ReportLine label="Current Status" value={roomRemovalTarget.room.status ?? "active"} />
                                <ReportLine label="Tenant" value={roomRemovalTarget.tenant?.full_name ?? "No active tenant"} />
                            </div>

                            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4">
                                <p className="text-sm font-black text-red-900">
                                    This will affect landlord room count, rent roll, settlement, and reports.
                                </p>
                                <p className="mt-1 text-sm font-semibold text-red-800">
                                    If this room has tenant, payment, promise, lease, collection, or audit history, it will be archived instead of permanently deleted.
                                </p>
                            </div>

                            <label className="mt-5 block space-y-2">
                                <span className="text-xs font-black uppercase tracking-wide text-slate-500">Required reason</span>
                                <textarea
                                    value={roomRemovalReason}
                                    onChange={(event) => {
                                        setRoomRemovalReason(event.target.value);
                                        setRoomError(null);
                                    }}
                                    rows={4}
                                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-red-300 focus:ring-4 focus:ring-red-50"
                                    placeholder="Example: QA/test room attached to Alex Costa during verification; not present in Excel source of truth."
                                />
                            </label>

                            <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-end">
                                <button
                                    type="button"
                                    onClick={closeRoomRemoval}
                                    className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 hover:border-slate-400"
                                >
                                    Keep Room
                                </button>
                                <button
                                    type="button"
                                    disabled={isPending || !roomRemovalReason.trim()}
                                    onClick={removeRoom}
                                    className="rounded-2xl bg-red-700 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    {isPending ? "Processing..." : "Delete / Archive Room"}
                                </button>
                            </div>
                        </div>
                    </div>
                ) : null}
            </Section>

            <Section title="Tenant Drilldown">
                {tenantMessage ? (
                    <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">
                        {tenantMessage}
                    </div>
                ) : null}

                {!tenantContext ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8">
                        <p className="font-bold text-slate-900">Select a tenant from the landlord room portfolio.</p>
                        <p className="mt-1 text-sm text-slate-500">
                            The full tenant card opens here with payments, promises, balance ledger, risk scoring, and audit trail.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 2xl:grid-cols-12 gap-6">
                        <div className="2xl:col-span-8">
                            <TenantSnapshot
                                tenantContext={tenantContext}
                                canEdit={canManageCollections}
                                isAdmin={canAdminManage}
                                onTenantUpdated={handleTenantSaved}
                            />
                        </div>
                        <div className="2xl:col-span-4 space-y-6">
                            <CollectionActionCentre
                                tenantContext={tenantContext}
                                canManage={canManageCollections}
                                canPostPayments={canPostPayments}
                                onSaved={handleTenantSaved}
                            />
                            <AICollectionInsight tenantContext={tenantContext} />
                        </div>
                    </div>
                )}
            </Section>

            <Section title="Vacated Tenant Debt Recovery">
                {landlord.vacatedTenantDebts.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6">
                        <p className="font-bold text-slate-900">No vacated tenant debt is linked to this landlord.</p>
                        <p className="mt-1 text-sm text-slate-500">When a tenant leaves without clearing balance, the frozen debt will appear here and deduct from future landlord payable.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                            <RecoveryMetric label="Original Bad Debt" value={money(landlord.totalVacatedTenantDebt)} />
                            <RecoveryMetric label="Recovered From Landlord" value={money(landlord.totalRecoveredFromLandlord)} tone="text-emerald-700" />
                            <RecoveryMetric label="Remaining Recovery" value={money(landlord.remainingRecoveryBalance)} tone="text-red-700" />
                            <RecoveryMetric label="Net Payable After Recovery" value={money(landlord.totalLandlordPayable)} tone="text-blue-700" />
                        </div>
                        <div className="overflow-hidden rounded-2xl border border-slate-200">
                            <table className="min-w-full divide-y divide-slate-200 text-sm">
                                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                                    <tr>
                                        <th className="px-4 py-3">Tenant</th>
                                        <th className="px-4 py-3">Room / Property</th>
                                        <th className="px-4 py-3 text-right">Outstanding Left</th>
                                        <th className="px-4 py-3 text-right">Recovered</th>
                                        <th className="px-4 py-3 text-right">Remaining</th>
                                        <th className="px-4 py-3">Deduction Basis</th>
                                        <th className="px-4 py-3">Status</th>
                                        <th className="px-4 py-3">Notes</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 bg-white">
                                    {landlord.vacatedTenantDebts.map((debt) => (
                                        <tr key={debt.id} className="hover:bg-slate-50">
                                            <td className="px-4 py-3">
                                                <p className="font-black text-slate-900">{debt.tenant_name ?? "Vacated tenant"}</p>
                                                <p className="text-xs text-slate-500">{debt.tenant_phone ?? "No phone"}</p>
                                            </td>
                                            <td className="px-4 py-3">
                                                <p className="font-bold text-slate-900">{debt.room_number ?? "Room"}</p>
                                                <p className="text-xs text-slate-500">{debt.property_name ?? "Property"}</p>
                                            </td>
                                            <td className="px-4 py-3 text-right font-black text-slate-900">{money(Number(debt.original_amount ?? 0))}</td>
                                            <td className="px-4 py-3 text-right font-black text-emerald-700">{money(Number(debt.recovered_amount ?? 0))}</td>
                                            <td className="px-4 py-3 text-right font-black text-red-700">{money(Number(debt.remaining_amount ?? 0))}</td>
                                            <td className="px-4 py-3 text-xs font-bold text-slate-600">
                                                Full outstanding balance frozen at vacate, not capped at room rent.
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black capitalize text-amber-800 ring-1 ring-amber-200">
                                                    {debt.recovery_status.replaceAll("_", " ")}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-slate-600">{debt.notes ?? "Pending landlord recovery deduction."}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </Section>

            <div className="grid grid-cols-1 2xl:grid-cols-2 gap-6">
                <Section title="Assigned Properties">
                    {landlord.properties.length === 0 ? (
                        <p className="text-slate-500">No properties assigned.</p>
                    ) : (
                        <>
                            {visibleProperties.map((property) => (
                                <div key={property.id} className="border rounded-2xl p-4">
                                    <p className="font-bold">{property.property_name ?? property.name}</p>
                                    <p className="text-sm text-slate-500">{property.address ?? property.city ?? "No address"}</p>
                                </div>
                            ))}
                            <ListToggle
                                total={landlord.properties.length}
                                visible={visibleProperties.length}
                                expanded={showAllProperties}
                                onClick={() => setShowAllProperties((value) => !value)}
                            />
                        </>
                    )}
                </Section>

                <Section title="Unpaid Landlord Payables">
                    <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                        <RecoveryMetric label="Total Unpaid Landlord Money" value={money(landlord.totalUnpaidMonthlyPayables)} tone="text-red-700" />
                        <RecoveryMetric label="Months Unpaid" value={String(unpaidMonths.length)} />
                        <RecoveryMetric label="Oldest Unpaid Month" value={landlord.oldestUnpaidMonth ? monthLabel(landlord.oldestUnpaidMonth) : "None"} tone="text-amber-700" />
                    </div>
                    {monthlyPayableMessage ? (
                        <p className="mb-4 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">{monthlyPayableMessage}</p>
                    ) : null}
                    {unpaidMonths.length === 0 ? (
                        <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm font-bold text-slate-500">
                            No unpaid monthly landlord payable records are currently open.
                        </p>
                    ) : (
                        <div className="overflow-hidden rounded-2xl border border-slate-200">
                            <table className="min-w-full divide-y divide-slate-200 text-sm">
                                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                                    <tr>
                                        <th className="px-4 py-3">Month</th>
                                        <th className="px-4 py-3 text-right">Net Payable</th>
                                        <th className="px-4 py-3 text-right">Paid</th>
                                        <th className="px-4 py-3 text-right">Balance Due</th>
                                        <th className="px-4 py-3">Status</th>
                                        <th className="px-4 py-3">Record Payment</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 bg-white">
                                    {visibleUnpaidMonths.map((payable) => {
                                        const unpaidBalance = payableMonthBalance(payable);
                                        return (
                                            <tr key={payable.id}>
                                                <td className="px-4 py-3 font-black text-slate-900">{monthLabel(payable.settlement_month)}</td>
                                                <td className="px-4 py-3 text-right font-black">{money(Number(payable.net_payable ?? 0))}</td>
                                                <td className="px-4 py-3 text-right font-bold text-emerald-700">{money(Number(payable.amount_paid ?? 0))}</td>
                                                <td className="px-4 py-3 text-right font-black text-red-700">{money(unpaidBalance)}</td>
                                                <td className="px-4 py-3">
                                                    <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black capitalize text-amber-800 ring-1 ring-amber-200">
                                                        {payable.status.replaceAll("_", " ")}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex min-w-64 gap-2">
                                                        <input
                                                            inputMode="numeric"
                                                            value={payablePaymentInputs[payable.id] ?? ""}
                                                            onChange={(event) => setPayablePaymentInputs((current) => ({ ...current, [payable.id]: event.target.value }))}
                                                            placeholder={String(Math.round(unpaidBalance))}
                                                            className="h-10 w-32 rounded-xl border border-slate-200 px-3 text-sm font-bold"
                                                        />
                                                        <button
                                                            disabled={isPending}
                                                            onClick={() => payMonthlyPayable(payable.id, unpaidBalance)}
                                                            className="h-10 rounded-xl bg-emerald-700 px-3 text-xs font-black text-white hover:bg-emerald-800 disabled:opacity-50"
                                                        >
                                                            Record
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Section>

                <Section title="Settlement Ledger">
                    {landlord.settlements.length === 0 ? (
                        <p className="text-slate-500">No settlements generated.</p>
                    ) : (
                        <>
                            {visibleSettlements.map((settlement) => (
                                <div key={settlement.id} className="border rounded-2xl p-4">
                                    <div className="flex justify-between gap-4">
                                        <div>
                                            <p className="font-bold capitalize">{settlement.status}</p>
                                            <p className="text-sm text-slate-500">
                                                Gross {money(settlement.gross_collections)} · Fees {money(settlement.management_fees)}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-black">{money(settlement.net_payable)}</p>
                                            <button
                                                disabled={isPending}
                                                onClick={() => createStatement(settlement.id)}
                                                className="text-blue-600 text-sm font-semibold mt-1 disabled:opacity-50"
                                            >
                                                Generate Statement
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <ListToggle
                                total={landlord.settlements.length}
                                visible={visibleSettlements.length}
                                expanded={showAllSettlements}
                                onClick={() => setShowAllSettlements((value) => !value)}
                            />
                        </>
                    )}
                </Section>
            </div>

            <div className="grid grid-cols-1 2xl:grid-cols-2 gap-6">
                <Section title="Monthly Statements">
                    {landlord.statements.length === 0 ? (
                        <p className="text-slate-500">No statements generated.</p>
                    ) : (
                        <>
                            {visibleStatements.map((statement) => (
                                <div key={statement.id} className="border rounded-2xl p-4">
                                    <p className="font-bold">{statement.statement_number}</p>
                                    <p className="text-sm text-slate-500">{statement.delivery_status} · {new Date(statement.generated_at).toLocaleString("en-UG")}</p>
                                </div>
                            ))}
                            <ListToggle
                                total={landlord.statements.length}
                                visible={visibleStatements.length}
                                expanded={showAllStatements}
                                onClick={() => setShowAllStatements((value) => !value)}
                            />
                        </>
                    )}
                </Section>

                <Section title="Settlement History">
                    {paymentHistory.length === 0 ? (
                        <p className="text-slate-500">No landlord payment history recorded.</p>
                    ) : (
                        <>
                            {visiblePaymentHistory.map((item) => "payment_method" in item ? (
                                    <div key={item.id} className="border rounded-2xl p-4">
                                        <p className="font-bold">{money(Number(item.amount ?? 0))}</p>
                                        <p className="text-sm text-slate-500">{item.payment_method ?? "payment"} · {item.status ?? "pending"}</p>
                                    </div>
                                ) : (
                                    <div key={item.id} className="border rounded-2xl p-4">
                                        <p className="font-bold">{money(item.amount)}</p>
                                        <p className="text-sm text-slate-500">{item.payout_method} · {item.status}</p>
                                    </div>
                                ))}
                            <ListToggle
                                total={paymentHistory.length}
                                visible={visiblePaymentHistory.length}
                                expanded={showAllPaymentHistory}
                                onClick={() => setShowAllPaymentHistory((value) => !value)}
                            />
                        </>
                    )}
                </Section>
            </div>
        </div>
    );
}

export default memo(LandlordProfile);

function ListToggle({
    total,
    visible,
    expanded,
    onClick,
}: {
    total: number;
    visible: number;
    expanded: boolean;
    onClick: () => void;
}) {
    if (total <= visible && !expanded) return null;
    return (
        <button
            type="button"
            onClick={onClick}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-700 hover:border-blue-300 hover:text-blue-700"
        >
            {expanded ? "Show less" : `Show ${total - visible} more`}
        </button>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="bg-white rounded-3xl shadow-lg p-6">
            <h2 className="font-bold text-xl mb-4">{title}</h2>
            <div className="space-y-3">{children}</div>
        </div>
    );
}

function Metric({ label, value, tone = "text-slate-900" }: { label: string; value: string; tone?: string }) {
    return (
        <div className="p-4 border-l first:border-l-0">
            <p className="text-xs text-slate-500">{label}</p>
            <p className={`font-black text-lg ${tone}`}>{value}</p>
        </div>
    );
}

function RecoveryMetric({ label, value, tone = "text-slate-900" }: { label: string; value: string; tone?: string }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
            <p className={`mt-2 text-lg font-black ${tone}`}>{value}</p>
        </div>
    );
}

function FinanceMiniCard({ label, value, tone = "text-slate-950" }: { label: string; value: string; tone?: string }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 px-3 py-2 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</p>
            <p className={`mt-1 truncate text-sm font-black md:text-base ${tone}`}>{value}</p>
        </div>
    );
}

function SettlementCalcRow({
    label,
    value,
    tone = "text-slate-950",
    strong = false,
}: {
    label: string;
    value: string;
    tone?: string;
    strong?: boolean;
}) {
    return (
        <tr className={strong ? "bg-slate-950 text-white" : "bg-white"}>
            <td className={`px-3 py-2 text-xs font-black ${strong ? "text-white" : "text-slate-600"}`}>{label}</td>
            <td className={`px-3 py-2 text-right text-xs font-black ${strong ? "text-emerald-200" : tone}`}>{value}</td>
        </tr>
    );
}

function CalcLine({
    label,
    value,
    tone = "text-slate-900",
    strong = false,
}: {
    label: string;
    value: string;
    tone?: string;
    strong?: boolean;
}) {
    return (
        <div className={`flex items-center justify-between gap-3 ${strong ? "border-t border-slate-200 pt-2 text-base" : ""}`}>
            <span className="font-bold text-slate-500">{label}</span>
            <span className={`font-black ${tone}`}>{value}</span>
        </div>
    );
}

function ReportBox({ title, lines }: { title: string; lines: string[] }) {
    return (
        <div className="min-w-0 rounded-2xl border-2 border-slate-200 bg-white p-4 text-slate-950 sm:p-5">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-600">{title}</p>
            {lines.length === 0 ? (
                <p className="mt-3 text-sm font-bold text-slate-600">None.</p>
            ) : (
                <div className="mt-3 max-h-48 space-y-2 overflow-auto print:max-h-none print:overflow-visible">
                    {lines.slice(0, 30).map((line, index) => (
                        <p key={`${line}-${index}`} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold leading-relaxed text-slate-800 [overflow-wrap:anywhere]">
                            {line}
                        </p>
                    ))}
                    {lines.length > 30 ? (
                        <p className="text-xs font-bold text-slate-500">{lines.length - 30} more lines hidden in preview.</p>
                    ) : null}
                </div>
            )}
        </div>
    );
}

function ReportRoomList({
    title,
    roomNumbers,
    tone,
}: {
    title: string;
    roomNumbers: string[];
    tone: "green" | "amber";
}) {
    const uniqueRooms = Array.from(new Set(roomNumbers.filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
    const toneClass = tone === "green"
        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
        : "border-amber-200 bg-amber-50 text-amber-900";

    return (
        <div className="min-w-0 rounded-2xl border-2 border-slate-200 bg-white p-4 text-slate-950 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-600">{title}</p>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-700">{uniqueRooms.length} rooms</span>
            </div>
            {uniqueRooms.length === 0 ? (
                <p className="mt-3 text-sm font-bold text-slate-600">None.</p>
            ) : (
                <div className="mt-3 flex flex-wrap gap-1.5">
                    {uniqueRooms.map((roomNumber) => (
                        <span key={roomNumber} className={`rounded-full border px-2.5 py-1 text-xs font-black ${toneClass}`}>
                            {roomNumber}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}

function ReportLine({
    label,
    value,
    strong = false,
}: {
    label: string;
    value: string;
    strong?: boolean;
}) {
    return (
        <div className={`grid min-w-0 grid-cols-1 gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4 sm:px-4 ${strong ? "border-slate-900 bg-white" : ""}`}>
            <span className="min-w-0 text-sm font-black leading-snug text-slate-700 [overflow-wrap:anywhere]">{label}</span>
            <span className={`min-w-0 text-left font-black leading-tight text-slate-950 [overflow-wrap:anywhere] sm:text-right ${strong ? "text-[clamp(1rem,5vw,1.25rem)]" : "text-[clamp(0.82rem,3.6vw,0.875rem)]"}`}>{value}</span>
        </div>
    );
}

function Detail({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <p className="text-xs text-slate-500">{label}</p>
            <p className="font-semibold">{value}</p>
        </div>
    );
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
    return (
        <label className="space-y-1 text-xs font-black uppercase tracking-wide text-slate-500 [&_input]:h-10 [&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:border-slate-200 [&_input]:bg-white [&_input]:px-3 [&_input]:text-sm [&_input]:font-semibold [&_input]:normal-case [&_input]:tracking-normal [&_input]:text-slate-900 [&_input]:outline-none [&_input]:focus:border-blue-400 [&_select]:h-10 [&_select]:w-full [&_select]:rounded-xl [&_select]:border [&_select]:border-slate-200 [&_select]:bg-white [&_select]:px-3 [&_select]:text-sm [&_select]:font-semibold [&_select]:normal-case [&_select]:tracking-normal [&_select]:text-slate-900 [&_select]:outline-none [&_select]:focus:border-blue-400">
            <span>{label}</span>
            {children}
        </label>
    );
}

function propertyLabel(property: LandlordItem["rooms"][number]["property"]) {
    return property?.property_name ?? property?.name ?? property?.village ?? property?.city ?? property?.address ?? "Unassigned";
}

function propertyLabelNullable(property: LandlordItem["properties"][number] | null) {
    return property?.property_name ?? property?.name ?? property?.village ?? property?.city ?? property?.address ?? "Unassigned property";
}

function modeLabel(mode: LandlordItem["commissionCalculationMode"]) {
    return mode === "occupied_room_based" ? "Occupied-Room-Based" : "Portfolio-Based";
}

function officeLabel(office: LandlordItem["offices"][number]) {
    return office.office_name ?? office.name ?? "Office";
}

function StatusBadge({ status }: { status: LandlordItem["rooms"][number]["paymentStatus"] }) {
    const styles = {
        paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
        partial: "bg-amber-50 text-amber-700 border-amber-200",
        unpaid: "bg-red-50 text-red-700 border-red-200",
        vacant: "bg-slate-100 text-slate-700 border-slate-200",
    } satisfies Record<LandlordItem["rooms"][number]["paymentStatus"], string>;

    const labels = {
        paid: "Paid",
        partial: "Partially paid",
        unpaid: "Unpaid",
        vacant: "Vacant",
    } satisfies Record<LandlordItem["rooms"][number]["paymentStatus"], string>;

    return (
        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${styles[status]}`}>
            {labels[status]}
        </span>
    );
}
