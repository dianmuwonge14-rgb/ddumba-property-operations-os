"use client";

import { useEffect, useState, useTransition } from "react";
import {
    archiveLandlord,
    assignPropertyToLandlord,
    createLandlord,
    editLandlord,
    generateLandlordSettlement,
    assignRoomsToLandlord,
    updateLandlordCommission,
    archiveLandlordPaymentDetail,
    setDefaultLandlordPaymentDetail,
    submitLandlordPaymentDetails,
} from "@/app/actions/landlords";
import type { LandlordCommissionCalculationMode, LandlordItem, LandlordRoomAssignmentOption, PropertyRow } from "@/lib/landlords/types";

type Props = {
    canAdminManage: boolean;
    canManage: boolean;
    selectedLandlord: LandlordItem | null;
    landlordOptions: Array<{ id: string; name: string }>;
    roomAssignmentOptions: LandlordRoomAssignmentOption[];
    unassignedProperties: PropertyRow[];
    onSaved: () => void;
};

function money(value: number) {
    return `UGX ${Math.round(value).toLocaleString()}`;
}

export default function LandlordCommandPanel({
    canAdminManage,
    canManage,
    landlordOptions = [],
    onSaved,
    roomAssignmentOptions = [],
    selectedLandlord,
    unassignedProperties,
}: Props) {
    const [isOpen, setIsOpen] = useState(false);
    const [settlementOpen, setSettlementOpen] = useState(false);
    const [adminToolsOpen, setAdminToolsOpen] = useState(false);
    const [fullName, setFullName] = useState("");
    const [phone, setPhone] = useState("");
    const [email, setEmail] = useState("");
    const [nationalId, setNationalId] = useState("");
    const [landlordCode, setLandlordCode] = useState("");
    const [expectedIncome, setExpectedIncome] = useState("");
    const [propertyId, setPropertyId] = useState("");
    const [periodStart, setPeriodStart] = useState("");
    const [periodEnd, setPeriodEnd] = useState("");
    const [commissionInputMode, setCommissionInputMode] = useState<"percentage" | "landlord_net_amount">("percentage");
    const [commissionCalculationMode, setCommissionCalculationMode] = useState<LandlordCommissionCalculationMode>("portfolio_based");
    const [commissionRate, setCommissionRate] = useState("");
    const [landlordNetAmount, setLandlordNetAmount] = useState("");
    const [roomSearch, setRoomSearch] = useState("");
    const [targetLandlordId, setTargetLandlordId] = useState("");
    const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>([]);
    const [reason, setReason] = useState("");
    const [paymentMethod, setPaymentMethod] = useState<"cash" | "mobile_money" | "bank">("cash");
    const [paymentLabel, setPaymentLabel] = useState("");
    const [paymentIsDefault, setPaymentIsDefault] = useState(false);
    const [mobileMoneyProvider, setMobileMoneyProvider] = useState("MTN");
    const [mobileMoneyNumber, setMobileMoneyNumber] = useState("");
    const [mobileMoneyAccountName, setMobileMoneyAccountName] = useState("");
    const [bankName, setBankName] = useState("");
    const [bankAccountNumber, setBankAccountNumber] = useState("");
    const [bankAccountName, setBankAccountName] = useState("");
    const [branch, setBranch] = useState("");
    const [paymentNotes, setPaymentNotes] = useState("");
    const [message, setMessage] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        setCommissionCalculationMode(selectedLandlord?.commissionCalculationMode ?? "portfolio_based");
        setCommissionInputMode(selectedLandlord?.commissionInputMode ?? "percentage");
        setCommissionRate(selectedLandlord?.commissionSource === "landlord_override" ? String(selectedLandlord.commissionRate) : "");
        setLandlordNetAmount(selectedLandlord?.landlordNetPayableOverride !== null && selectedLandlord?.landlordNetPayableOverride !== undefined
            ? String(selectedLandlord.landlordNetPayableOverride)
            : "");
    }, [
        selectedLandlord?.id,
        selectedLandlord?.commissionCalculationMode,
        selectedLandlord?.commissionInputMode,
        selectedLandlord?.commissionRate,
        selectedLandlord?.commissionSource,
        selectedLandlord?.landlordNetPayableOverride,
    ]);

    useEffect(() => {
        setPaymentMethod("cash");
        setPaymentLabel("");
        setPaymentIsDefault(false);
        setMobileMoneyProvider("MTN");
        setMobileMoneyNumber("");
        setMobileMoneyAccountName("");
        setBankName("");
        setBankAccountNumber("");
        setBankAccountName("");
        setBranch("");
        setPaymentNotes("");
    }, [selectedLandlord?.id]);

    function run(action: () => Promise<unknown>, success: string) {
        startTransition(async () => {
            try {
                setMessage(null);
                await action();
                setMessage(success);
                onSaved();
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Action failed.");
            }
        });
    }

    function payload() {
        return {
            fullName: fullName || selectedLandlord?.full_name || "",
            phone: phone || selectedLandlord?.phone || undefined,
            email: email || selectedLandlord?.email || undefined,
            nationalId: nationalId || selectedLandlord?.national_id || undefined,
            landlordCode: landlordCode || selectedLandlord?.landlord_code || undefined,
            expectedIncome: expectedIncome ? Number(expectedIncome) : selectedLandlord?.expected_income ?? undefined,
        };
    }

    function saveNew() {
        run(() => createLandlord(payload()), "Landlord created.");
    }

    function saveEdit() {
        if (!selectedLandlord) {
            setMessage("Select a landlord first.");
            return;
        }
        run(() => editLandlord({ ...payload(), landlordId: selectedLandlord.id }), "Landlord updated.");
    }

    function saveArchive() {
        if (!selectedLandlord) {
            setMessage("Select a landlord first.");
            return;
        }
        run(() => archiveLandlord({ landlordId: selectedLandlord.id, reason: reason || undefined }), "Landlord archived.");
    }

    function saveAssignment() {
        if (!selectedLandlord || !propertyId) {
            setMessage("Select a landlord and property first.");
            return;
        }
        run(() => assignPropertyToLandlord({ landlordId: selectedLandlord.id, propertyId }), "Property assigned.");
    }

    function saveSettlement() {
        if (!selectedLandlord) {
            setMessage("Select a landlord first.");
            return;
        }
        run(
            () => generateLandlordSettlement({
                landlordId: selectedLandlord.id,
                periodStart,
                periodEnd,
            }),
            "Settlement generated.",
        );
    }

    function saveCommission() {
        if (!selectedLandlord) {
            setMessage("Select a landlord first.");
            return;
        }
        const rate = commissionRate.trim() === "" ? null : Number(commissionRate);
        const netAmount = landlordNetAmount.trim() === "" ? null : Number(landlordNetAmount);
        if (commissionInputMode === "percentage" && rate !== null && (!Number.isFinite(rate) || rate < 0 || rate > 100)) {
            setMessage("Commission must be between 0 and 100, or blank to use company default.");
            return;
        }
        if (commissionInputMode === "landlord_net_amount" && (netAmount === null || !Number.isFinite(netAmount) || netAmount < 0)) {
            setMessage("Enter a valid landlord net amount.");
            return;
        }
        run(
            () => updateLandlordCommission({
                landlordId: selectedLandlord.id,
                commissionRate: commissionInputMode === "percentage" ? rate : null,
                commissionCalculationMode,
                inputMode: commissionInputMode,
                landlordNetAmount: commissionInputMode === "landlord_net_amount" ? netAmount : null,
                notes: reason || undefined,
            }),
            "Commission settings saved.",
        );
    }

    function savePaymentDetails() {
        if (!selectedLandlord) {
            setMessage("Select a landlord first.");
            return;
        }
        run(
            () => submitLandlordPaymentDetails({
                landlordId: selectedLandlord.id,
                paymentMethod,
                label: paymentLabel,
                isDefault: paymentIsDefault,
                mobileMoneyProvider,
                mobileMoneyNumber,
                mobileMoneyAccountName,
                bankName,
                bankAccountNumber,
                bankAccountName,
                branch,
                notes: paymentNotes,
            }),
            canAdminManage ? "Payment details saved and approved." : "Payment detail request sent for Admin approval.",
        );
    }

    function setPaymentDetailDefault(detailId: string) {
        run(() => setDefaultLandlordPaymentDetail({ detailId }), "Default payment method updated.");
    }

    function archivePaymentDetail(detailId: string) {
        run(() => archiveLandlordPaymentDetail({ detailId }), "Payment method archived.");
    }

    function toggleRoom(roomId: string) {
        setSelectedRoomIds((current) =>
            current.includes(roomId) ? current.filter((id) => id !== roomId) : [...current, roomId],
        );
    }

    function saveRoomAssignment(nextLandlordId: string | null) {
        if (!selectedRoomIds.length) {
            setMessage("Select at least one room.");
            return;
        }
        const action = nextLandlordId ? "assign these rooms to the selected landlord" : "unassign these rooms from their landlord";
        if (!window.confirm(`Confirm: ${action}? This changes landlord portfolio totals, settlement calculations, and audit history.`)) return;
        run(
            () => assignRoomsToLandlord({
                roomIds: selectedRoomIds,
                landlordId: nextLandlordId,
                reason: reason || undefined,
            }),
            "Room landlord assignment updated.",
        );
        setSelectedRoomIds([]);
    }

    const roomSearchTerm = roomSearch.trim().toLowerCase();
    const visibleRooms = roomAssignmentOptions
        .filter((room) => [
            room.roomNumber,
            room.propertyName,
            room.officeName,
            room.currentLandlordName,
            room.status,
        ].join(" ").toLowerCase().includes(roomSearchTerm))
        .slice(0, 80);
    const portfolioRentRoll = selectedLandlord?.settlementEstimate.expectedGrossRent ?? 0;
    const occupiedPayableRent = selectedLandlord?.settlementEstimate.occupiedPayableRent ?? portfolioRentRoll;
    const commissionBaseAmount = commissionCalculationMode === "occupied_room_based" ? occupiedPayableRent : portfolioRentRoll;
    const previewCommissionRate = commissionInputMode === "landlord_net_amount"
        ? calculateRateFromNet(commissionBaseAmount, Number(landlordNetAmount || 0))
        : commissionRate.trim() === "" ? selectedLandlord?.companyDefaultCommissionRate ?? 10 : Number(commissionRate);
    const previewLandlordNetAmount = commissionInputMode === "landlord_net_amount"
        ? Number(landlordNetAmount || 0)
        : Math.max(0, commissionBaseAmount - Math.round(commissionBaseAmount * (Number.isFinite(previewCommissionRate) ? previewCommissionRate : 0) / 100));

    return (
        <div className="rounded-3xl border border-slate-200 bg-white shadow-lg">
            <div className="flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-black text-slate-950">Landlord Command</h2>
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
                            {isPending ? "Saving" : "Ready"}
                        </span>
                    </div>
                    <p className="mt-0.5 text-xs font-semibold text-slate-500">
                        {selectedLandlord?.full_name ?? "Create and manage landlord finance"}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setIsOpen((value) => !value)}
                    className="h-10 rounded-xl bg-slate-950 px-4 text-xs font-black text-white transition hover:bg-slate-800"
                >
                    {isOpen ? "Hide Landlord Tools" : "Manage Landlord"}
                </button>
            </div>

            {isOpen ? (
                <div className="border-t border-slate-200 p-3">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                        <CompactInput value={fullName} onChange={setFullName} placeholder={selectedLandlord?.full_name ?? "Full name"} />
                        <CompactInput value={phone} onChange={setPhone} placeholder={selectedLandlord?.phone ?? "Phone"} />
                        <CompactInput value={email} onChange={setEmail} placeholder={selectedLandlord?.email ?? "Email"} />
                        <CompactInput value={nationalId} onChange={setNationalId} placeholder={selectedLandlord?.national_id ?? "National ID"} />
                        <CompactInput value={landlordCode} onChange={setLandlordCode} placeholder={selectedLandlord?.landlord_code ?? "Landlord code"} />
                        <CompactInput value={expectedIncome} onChange={setExpectedIncome} type="number" placeholder={selectedLandlord?.expected_income?.toString() ?? "Expected income"} />
                        <CompactInput value={reason} onChange={setReason} placeholder="Archive / action reason" className="xl:col-span-3" />
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                        <Button disabled={!canManage || isPending} onClick={saveNew}>Create</Button>
                        <Button disabled={!canManage || isPending || !selectedLandlord} onClick={saveEdit}>Edit</Button>
                        <Button disabled={!canManage || isPending || !selectedLandlord} onClick={saveArchive} tone="red">Archive</Button>
                    </div>

                    <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-3">
                        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                            <div>
                                <p className="text-sm font-black text-slate-950">Landlord Payment Details</p>
                                <p className="text-xs font-semibold text-slate-600">
                                    Saved methods are reusable account details only. They do not record landlord payments.
                                </p>
                            </div>
                            <span className={`rounded-full px-3 py-1 text-xs font-black uppercase ${(selectedLandlord?.approvedPaymentDetails?.length ?? 0) > 0 ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                                {(selectedLandlord?.approvedPaymentDetails?.length ?? 0) > 0 ? `${selectedLandlord?.approvedPaymentDetails.length} Approved` : "Needs Details"}
                            </span>
                        </div>
                        <div className="mt-3 grid gap-2">
                            {(selectedLandlord?.approvedPaymentDetails ?? []).length === 0 ? (
                                <p className="rounded-xl border border-dashed border-blue-200 bg-white px-3 py-2 text-xs font-bold text-slate-500">No approved saved methods yet.</p>
                            ) : (selectedLandlord?.approvedPaymentDetails ?? []).map((detail) => (
                                <div key={detail.id} className="flex flex-col gap-2 rounded-xl border border-blue-100 bg-white px-3 py-2 md:flex-row md:items-center md:justify-between">
                                    <div>
                                        <p className="text-sm font-black text-slate-950">{detail.label || describePaymentDetail(detail)}</p>
                                        <p className="text-xs font-semibold text-slate-600">{describePaymentDetail(detail)}</p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        {detail.isDefault ? <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-black uppercase text-emerald-700">Default</span> : null}
                                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black uppercase text-slate-600">{detail.paymentMethod.replaceAll("_", " ")}</span>
                                        {canAdminManage && !detail.isDefault ? (
                                            <button type="button" disabled={isPending} onClick={() => setPaymentDetailDefault(detail.id)} className="text-xs font-black text-blue-700">Set default</button>
                                        ) : null}
                                        {canAdminManage ? (
                                            <button type="button" disabled={isPending} onClick={() => archivePaymentDetail(detail.id)} className="text-xs font-black text-red-700">Archive</button>
                                        ) : null}
                                    </div>
                                </div>
                            ))}
                            {(selectedLandlord?.pendingPaymentDetails ?? []).map((detail) => (
                                <div key={detail.id} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                                    <p className="text-xs font-black uppercase text-amber-700">Pending Approval</p>
                                    <p className="text-sm font-black text-slate-950">{detail.label || describePaymentDetail(detail)}</p>
                                    <p className="text-xs font-semibold text-slate-600">{describePaymentDetail(detail)}</p>
                                </div>
                            ))}
                        </div>
                        <div className="mt-3 grid gap-2 md:grid-cols-3">
                            <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as "cash" | "mobile_money" | "bank")} className="h-10 rounded-xl border border-blue-100 bg-white px-3 text-sm font-black text-slate-900">
                                <option value="cash">Cash</option>
                                <option value="mobile_money">Mobile Money</option>
                                <option value="bank">Bank</option>
                            </select>
                            <CompactInput value={paymentLabel} onChange={setPaymentLabel} placeholder="Label, e.g. Main MTN / Stanbic Account" className="md:col-span-2" />
                            {paymentMethod === "mobile_money" ? (
                                <>
                                    <select value={mobileMoneyProvider} onChange={(event) => setMobileMoneyProvider(event.target.value)} className="h-10 rounded-xl border border-blue-100 bg-white px-3 text-sm font-black text-slate-900">
                                        <option value="MTN">MTN</option>
                                        <option value="Airtel">Airtel</option>
                                        <option value="Other">Other</option>
                                    </select>
                                    <CompactInput value={mobileMoneyNumber} onChange={setMobileMoneyNumber} placeholder="Mobile money number" />
                                    <CompactInput value={mobileMoneyAccountName} onChange={setMobileMoneyAccountName} placeholder="Account name" />
                                </>
                            ) : null}
                            {paymentMethod === "bank" ? (
                                <>
                                    <CompactInput value={bankName} onChange={setBankName} placeholder="Bank name" />
                                    <CompactInput value={bankAccountNumber} onChange={setBankAccountNumber} placeholder="Account number" />
                                    <CompactInput value={bankAccountName} onChange={setBankAccountName} placeholder="Account name" />
                                    <CompactInput value={branch} onChange={setBranch} placeholder="Branch / notes" />
                                </>
                            ) : null}
                            <CompactInput value={paymentNotes} onChange={setPaymentNotes} placeholder="Payment notes / reason" className="md:col-span-2" />
                            <label className="flex h-10 items-center gap-2 rounded-xl border border-blue-100 bg-white px-3 text-xs font-black text-slate-700">
                                <input type="checkbox" checked={paymentIsDefault} onChange={(event) => setPaymentIsDefault(event.target.checked)} />
                                Make default after approval
                            </label>
                            <Button disabled={!selectedLandlord || isPending || (!canManage && !canAdminManage)} onClick={savePaymentDetails}>
                                {canAdminManage ? "Save Approved Method" : "Submit Method for Approval"}
                            </Button>
                        </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto] md:items-center">
                            <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold">
                                <option value="">Select unassigned property</option>
                                {unassignedProperties.map((property) => (
                                    <option key={property.id} value={property.id}>{property.property_name ?? property.name}</option>
                                ))}
                            </select>
                            <Button disabled={!canManage || isPending || !selectedLandlord || !propertyId} onClick={saveAssignment}>Assign Property</Button>
                        </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-slate-200 bg-white">
                        <button
                            type="button"
                            onClick={() => setSettlementOpen((value) => !value)}
                            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                        >
                            <span>
                                <span className="block text-sm font-black text-slate-950">Settlement Tools</span>
                                <span className="text-xs font-semibold text-slate-500">Generate statements only when needed.</span>
                            </span>
                            <span className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white">
                                {settlementOpen ? "Hide Settlement" : "Generate Settlement"}
                            </span>
                        </button>
                        {settlementOpen ? (
                            <div className="grid grid-cols-1 gap-2 border-t border-slate-200 p-3 md:grid-cols-[1fr_1fr_auto] md:items-center">
                                <CompactInput value={periodStart} onChange={setPeriodStart} type="date" />
                                <CompactInput value={periodEnd} onChange={setPeriodEnd} type="date" />
                                <Button disabled={!canManage || isPending || !selectedLandlord} onClick={saveSettlement}>Generate</Button>
                                <p className="md:col-span-3 rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800">
                                    Commission used: {selectedLandlord?.commissionRate ?? 10}% ({selectedLandlord?.commissionSource === "landlord_override" ? "landlord override" : "company default"})
                                </p>
                            </div>
                        ) : null}
                    </div>

                    {canAdminManage ? (
                        <div className="mt-4 rounded-2xl border border-slate-300 bg-slate-50">
                            <button
                                type="button"
                                onClick={() => setAdminToolsOpen((value) => !value)}
                                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                            >
                                <span>
                                    <span className="block text-sm font-black text-slate-950">Admin Commission & Room Ownership</span>
                                    <span className="text-xs font-semibold text-slate-500">Company-admin only. Changes are audited.</span>
                                </span>
                                <span className="rounded-full bg-amber-600 px-4 py-2 text-xs font-black text-white">
                                    {adminToolsOpen ? "Hide Admin Tools" : "Open Admin Tools"}
                                </span>
                            </button>

                            {adminToolsOpen ? (
                                <div className="space-y-4 border-t border-slate-200 p-3">
                                    <div className="rounded-2xl border border-slate-200 bg-white p-3">
                                        <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
                                            <div>
                                                <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Commission calculation mode</p>
                                                <select
                                                    value={commissionCalculationMode}
                                                    onChange={(event) => setCommissionCalculationMode(event.target.value as LandlordCommissionCalculationMode)}
                                                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold"
                                                >
                                                    <option value="portfolio_based">Portfolio-Based</option>
                                                    <option value="occupied_room_based">Occupied-Room-Based</option>
                                                </select>
                                            </div>
                                            <div>
                                                <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Input mode</p>
                                                <select value={commissionInputMode} onChange={(event) => setCommissionInputMode(event.target.value as "percentage" | "landlord_net_amount")} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold">
                                                    <option value="percentage">Commission %</option>
                                                    <option value="landlord_net_amount">Landlord Net Amount</option>
                                                </select>
                                            </div>
                                            <div>
                                                <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">
                                                    {commissionInputMode === "percentage" ? "Commission percentage" : "Landlord net amount"}
                                                </p>
                                                {commissionInputMode === "percentage" ? (
                                                    <CompactInput
                                                        value={commissionRate}
                                                        onChange={setCommissionRate}
                                                        type="number"
                                                        placeholder={`Current: ${selectedLandlord?.commissionRate ?? 10}% · blank = company default`}
                                                    />
                                                ) : (
                                                    <CompactInput
                                                        value={landlordNetAmount}
                                                        onChange={setLandlordNetAmount}
                                                        type="number"
                                                        placeholder="Example: 850000"
                                                    />
                                                )}
                                            </div>
                                            <Button disabled={!canAdminManage || isPending || !selectedLandlord} onClick={saveCommission}>Save Commission</Button>
                                        </div>
                                        <div className="mt-3 grid grid-cols-1 gap-2 rounded-2xl bg-slate-50 p-3 text-xs font-bold text-slate-700 md:grid-cols-4">
                                            <PreviewStat label="Portfolio Rent Roll" value={money(portfolioRentRoll)} />
                                            <PreviewStat label="Commission Base" value={money(commissionBaseAmount)} />
                                            <PreviewStat label="Landlord Net Amount" value={money(previewLandlordNetAmount)} />
                                            <PreviewStat label="Commission" value={`${Number.isFinite(previewCommissionRate) ? previewCommissionRate.toFixed(2).replace(/\\.00$/, "") : "0"}%`} />
                                        </div>
                                        <p className="mt-2 text-xs font-bold text-slate-500">
                                            Company default: {selectedLandlord?.companyDefaultCommissionRate ?? 10}%. Current source: {selectedLandlord?.commissionSource === "landlord_override" ? "Landlord override" : "Company default"}. Current mode: {modeLabel(selectedLandlord?.commissionCalculationMode ?? "portfolio_based")}. The landlord-facing report shows percentage and mode only.
                                        </p>
                                    </div>

                                    <div className="rounded-2xl border border-slate-200 bg-white p-3">
                                        <div className="grid grid-cols-1 gap-2 lg:grid-cols-[1fr_1fr_auto_auto] lg:items-end">
                                            <div>
                                                <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Search rooms</p>
                                                <CompactInput value={roomSearch} onChange={setRoomSearch} placeholder="Room, property, office, current landlord..." />
                                            </div>
                                            <div>
                                                <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Target landlord</p>
                                                <select value={targetLandlordId} onChange={(event) => setTargetLandlordId(event.target.value)} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold">
                                                    <option value="">Select landlord</option>
                                                    {landlordOptions
                                                        .sort((a, b) => a.name.localeCompare(b.name))
                                                        .map((landlord) => (
                                                            <option key={landlord.id} value={landlord.id}>{landlord.name}</option>
                                                        ))}
                                                </select>
                                            </div>
                                            <Button disabled={!canAdminManage || isPending || !selectedRoomIds.length || !targetLandlordId} onClick={() => saveRoomAssignment(targetLandlordId)}>Assign</Button>
                                            <Button disabled={!canAdminManage || isPending || !selectedRoomIds.length} onClick={() => saveRoomAssignment(null)} tone="red">Unassign</Button>
                                        </div>

                                        <div className="mt-3 max-h-80 overflow-auto rounded-2xl border border-slate-200">
                                            <table className="min-w-full divide-y divide-slate-200 text-sm">
                                                <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                                                    <tr>
                                                        <th className="px-3 py-2">Select</th>
                                                        <th className="px-3 py-2">Room</th>
                                                        <th className="px-3 py-2">Property / Office</th>
                                                        <th className="px-3 py-2">Current Landlord</th>
                                                        <th className="px-3 py-2 text-right">Rent</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 bg-white">
                                                    {visibleRooms.map((room) => (
                                                        <tr key={room.roomId} className="hover:bg-slate-50">
                                                            <td className="px-3 py-2">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedRoomIds.includes(room.roomId)}
                                                                    onChange={() => toggleRoom(room.roomId)}
                                                                />
                                                            </td>
                                                            <td className="px-3 py-2 font-black text-slate-900">{room.roomNumber}</td>
                                                            <td className="px-3 py-2">
                                                                <p className="font-bold text-slate-800">{room.propertyName}</p>
                                                                <p className="text-xs font-semibold text-slate-500">{room.officeName} · {room.status}</p>
                                                            </td>
                                                            <td className="px-3 py-2 font-bold text-slate-700">{room.currentLandlordName}</td>
                                                            <td className="px-3 py-2 text-right font-black">{money(room.monthlyRent)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        <p className="mt-2 text-xs font-bold text-slate-500">
                                            Showing {visibleRooms.length} rooms. Selected {selectedRoomIds.length}. Assignment updates room ownership, settlement calculations, landlord portfolios, rent roll, and audit logs.
                                        </p>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    ) : null}

                    {message && <p className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">{message}</p>}
                </div>
            ) : null}
        </div>
    );
}

function calculateRateFromNet(portfolioRentRoll: number, landlordNetAmount: number) {
    if (!portfolioRentRoll || !Number.isFinite(landlordNetAmount)) return 0;
    return Math.max(0, Math.min(100, ((portfolioRentRoll - landlordNetAmount) / portfolioRentRoll) * 100));
}

function modeLabel(mode: LandlordCommissionCalculationMode) {
    return mode === "occupied_room_based" ? "Occupied-Room-Based" : "Portfolio-Based";
}

function describePaymentDetail(detail: LandlordItem["activePaymentDetail"] | LandlordItem["pendingPaymentDetail"]) {
    if (!detail) return "No details";
    if (detail.paymentMethod === "cash") return "Cash";
    if (detail.paymentMethod === "mobile_money") {
        return `${detail.provider ?? detail.mobileMoneyProvider ?? "Mobile Money"} · ${detail.accountNumber ?? detail.mobileMoneyNumber ?? "No number"} · ${detail.accountName ?? detail.mobileMoneyAccountName ?? "No account name"}`;
    }
    return `${detail.provider ?? detail.bankName ?? "Bank"} · ${detail.accountNumber ?? detail.bankAccountNumber ?? "No account number"} · ${detail.accountName ?? detail.bankAccountName ?? "No account name"}`;
}

function PreviewStat({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 text-sm font-black text-slate-950">{value}</p>
        </div>
    );
}

function CompactInput({
    className = "",
    onChange,
    placeholder,
    type = "text",
    value,
}: {
    className?: string;
    onChange: (value: string) => void;
    placeholder?: string;
    type?: string;
    value: string;
}) {
    return (
        <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            type={type}
            placeholder={placeholder}
            className={`h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 ${className}`}
        />
    );
}

function Button({
    disabled,
    onClick,
    children,
    tone = "dark",
}: {
    disabled: boolean;
    onClick: () => void;
    children: React.ReactNode;
    tone?: "dark" | "red";
}) {
    const toneClass = tone === "red" ? "bg-red-600 hover:bg-red-700" : "bg-slate-900 hover:bg-slate-800";
    return (
        <button disabled={disabled} onClick={onClick} className={`${toneClass} h-10 w-full rounded-xl px-3 text-sm font-black text-white disabled:opacity-40`}>
            {children}
        </button>
    );
}
