"use client";

import { useMemo, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, ArrowDown, BadgeDollarSign, BanknoteArrowDown, Building2, CalendarDays, CheckCircle2, CircleDollarSign, CreditCard, FileText, Landmark, Loader2, Phone, Plus, Printer, ReceiptText, RefreshCw, Search, SendHorizontal, ShieldCheck, Sparkles, TrendingDown, WalletCards } from "lucide-react";
import {
    addLandlordAdvance,
    clearLandlordAdvancePrincipal,
    editLandlordAdvanceRepaymentPlan,
    markLandlordAdvanceDeducted,
    pauseLandlordAdvance,
    resumeLandlordAdvance,
    settleLandlordAdvanceEarly,
} from "@/app/actions/admin-finance";
import { createLandlordPaidExpenseRequest, submitLandlordPaymentFromTerminal } from "@/app/actions/expenses";
import { runMonthlyLandlordPayableSnapshot } from "@/app/actions/landlords";
import { EmptyState, PageHero, StatusChip } from "@/components/office/shared/EnterpriseUI";
import {
    calculateLandlordAdvancePlan,
    type AdvanceInterestMode,
    type AdvanceInterestType,
    type AdvancePaymentPlan,
    type AdvanceRepaymentType,
    type PrincipalClearanceMethod,
} from "@/lib/landlord-advances/calculator";
import {
    buildLandlordPaymentAllocationPlan,
    landlordMonthlyAppliedDeductions,
    landlordMonthlyDue,
    landlordMonthlyFinalNetPayable,
    landlordMonthlyGrossPayable,
    landlordMonthlyPendingDeductions,
    landlordMonthlyUnpaid,
    summarizeLandlordPayables,
} from "@/lib/landlord-payables/payment-allocation";
import type { LandlordAdvanceGroup, LandlordMonthlyPayable, LandlordPayableGroup, LandlordPayablesData, LandlordPaymentApprovalRequest, LandlordPaymentOption, LandlordUnpaidMonthGroup, PaidLandlordPayment } from "@/lib/landlord-payables/types";

type Props = {
    data: LandlordPayablesData;
};

function money(value: number | string | null | undefined) {
    return `UGX ${Math.round(Number(value ?? 0)).toLocaleString()}`;
}

function numeric(value: unknown) {
    return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function normalizeSearch(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function compactSearch(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function monthlyUnpaid(row: LandlordMonthlyPayable) {
    return landlordMonthlyUnpaid(row as unknown as Record<string, unknown>);
}

function monthlyDue(row: LandlordMonthlyPayable) {
    return landlordMonthlyDue(row as unknown as Record<string, unknown>);
}

function monthlyGrossPayable(row: LandlordMonthlyPayable) {
    return landlordMonthlyGrossPayable(row as unknown as Record<string, unknown>);
}

function monthlyFinalNetPayable(row: LandlordMonthlyPayable) {
    return landlordMonthlyFinalNetPayable(row as unknown as Record<string, unknown>);
}

function monthlyAppliedDeductions(row: LandlordMonthlyPayable) {
    return landlordMonthlyAppliedDeductions(row as unknown as Record<string, unknown>);
}

function monthlyPendingDeductions(row: LandlordMonthlyPayable) {
    return landlordMonthlyPendingDeductions(row as unknown as Record<string, unknown>);
}

function advanceTotal(advance: Record<string, unknown>) {
    const total = numeric(advance.total_repayable);
    if (total > 0) return total;
    const advanceAmount = numeric(advance.advance_amount);
    if (advanceAmount > 0) return advanceAmount;
    return numeric(advance.principal_amount) + numeric(advance.interest_amount);
}

function advanceRemaining(advance: Record<string, unknown>) {
    const remainingTotal = numeric(advance.remaining_total_balance);
    if (remainingTotal > 0) return remainingTotal;
    const remainingBalance = numeric(advance.remaining_balance);
    if (remainingBalance > 0) return remainingBalance;
    const principalInterest = numeric(advance.remaining_principal_balance) + numeric(advance.remaining_interest_balance);
    if (principalInterest > 0) return principalInterest;
    return Math.max(0, advanceTotal(advance) - numeric(advance.deducted_amount));
}

function monthLabel(value: string | null | undefined) {
    if (!value) return "None";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("en-UG", { month: "long", year: "numeric" }).format(date);
}

function dateLabel(value: string | null | undefined) {
    if (!value) return "Not set";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("en-UG", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function printLandlordReceipt() {
    document.body.classList.add("print-landlord-payment-receipt");
    window.print();
    window.setTimeout(() => document.body.classList.remove("print-landlord-payment-receipt"), 500);
}

export default function LandlordPaymentsConsole({ data }: Props) {
    const groups = useMemo(() => data.groups ?? [], [data.groups]);
    const advanceGroups = useMemo(() => data.advanceGroups ?? [], [data.advanceGroups]);
    const landlords = data.landlords ?? [];
    const offices = data.offices ?? [];
    const summary = {
        totalUnpaidLandlordMoney: data.summary?.totalUnpaidLandlordMoney ?? 0,
        totalUnpaidAcrossMonths: data.summary?.totalUnpaidAcrossMonths ?? data.summary?.totalOutstandingToLandlords ?? 0,
        unpaidLandlords: data.summary?.unpaidLandlords ?? 0,
        partialLandlords: data.summary?.partialLandlords ?? 0,
        needsReviewLandlords: data.summary?.needsReviewLandlords ?? 0,
        totalOutstandingToLandlords: data.summary?.totalOutstandingToLandlords ?? 0,
        oldestUnpaidMonth: data.summary?.oldestUnpaidMonth ?? null,
        totalLandlordAdvances: data.summary?.totalLandlordAdvances ?? 0,
        activeLandlordAdvances: data.summary?.activeLandlordAdvances ?? 0,
        recoveryDeductions: data.summary?.recoveryDeductions ?? 0,
        paidLandlords: data.summary?.paidLandlords ?? 0,
        totalMoneyPaidToLandlords: data.summary?.totalMoneyPaidToLandlords ?? 0,
    };
    const netPosition = summary.totalOutstandingToLandlords + summary.activeLandlordAdvances - summary.totalMoneyPaidToLandlords;
    const currentMonth = monthLabel(groups[0]?.rows[0]?.settlement_month ?? new Date().toISOString().slice(0, 10));
    const currentMonthKey = data.debug?.currentMonthKey ?? new Date().toISOString().slice(0, 10);
    const importedPaidRows = groups.flatMap((group) => group.rows
        .filter((row) => String(row.settlement_month).slice(0, 7) === currentMonthKey.slice(0, 7))
        .filter((row) => String(row.reasons_notes ?? "").includes("cleared_month=JUNE"))
        .filter((row) => String(row.status ?? "").toLowerCase() === "paid")
        .map((row) => ({
            id: row.id,
            landlordId: row.landlord_id,
            landlordName: row.landlord_name ?? group.landlordName,
            officeId: row.office_id,
            officeName: row.office_name ?? group.officeName,
            settlementMonth: row.settlement_month,
            netPayable: Number(row.net_payable ?? 0) || 0,
            amountPaid: Number(row.net_payable ?? 0) || 0,
            paymentMethod: "imported clearance",
            paymentDate: row.updated_at ?? row.created_at ?? null,
            reference: "Supabase payment source",
            paidBy: "Imported ledger",
        } satisfies PaidLandlordPayment)));
    const paidPayments = importedPaidRows.length > 0 ? importedPaidRows : data.paidPayments ?? [];
    const safeData = { ...data, groups, advanceGroups, landlords, offices, summary };
    const unpaidReportGroups = groups.filter((group) => group.totalOutstanding > 0);
    const unpaidMonthGroups = data.unpaidMonthGroups ?? [];
    const [selectedLandlordId, setSelectedLandlordId] = useState(unpaidReportGroups[0]?.landlordId ?? groups[0]?.landlordId ?? "");
    const [landlordSearch, setLandlordSearch] = useState("");
    const [selectedAdvanceLandlordId, setSelectedAdvanceLandlordId] = useState(advanceGroups[0]?.landlordId ?? "");
    const [activePanel, setActivePanel] = useState<"unpaid" | "ledger" | "advances" | "paid" | "recovery">("unpaid");
    const [message, setMessage] = useState("");
    const [isPending, startTransition] = useTransition();
    const selected = useMemo(
        () => groups.find((group) => group.landlordId === selectedLandlordId) ?? groups[0] ?? null,
        [groups, selectedLandlordId],
    );
    const landlordSearchResults = useMemo(() => {
        const normalized = normalizeSearch(landlordSearch);
        const compact = compactSearch(landlordSearch);
        const optionById = new Map(landlords.map((landlord) => [landlord.id, landlord]));
        const candidates = groups.map((group) => {
            const option = optionById.get(group.landlordId);
            const searchText = [
                group.landlordName,
                group.officeName,
                option?.phone,
                option?.officeName,
                option?.roomNumbersText,
                option?.locationText,
                option?.searchText,
                ...group.rows.map((row) => row.landlord_name),
            ].filter(Boolean).join(" ");
            return { group, option, searchText };
        });
        if (!normalized && !compact) return candidates.slice(0, 12);
        const exact = candidates.filter(({ group, option }) => normalizeSearch(group.landlordName) === normalized || compactSearch(option?.phone ?? "") === compact || compactSearch(option?.roomNumbersText ?? "") === compact);
        const starts = candidates.filter((candidate) => !exact.includes(candidate) && normalizeSearch(candidate.searchText).split(" ").some((part) => part.startsWith(normalized)));
        const contains = candidates.filter((candidate) => !exact.includes(candidate) && !starts.includes(candidate) && (normalizeSearch(candidate.searchText).includes(normalized) || compactSearch(candidate.searchText).includes(compact)));
        return [...exact, ...starts, ...contains].slice(0, 20);
    }, [groups, landlordSearch, landlords]);
    const selectedAdvance = useMemo(
        () => advanceGroups.find((group) => group.landlordId === selectedAdvanceLandlordId) ?? advanceGroups[0] ?? null,
        [advanceGroups, selectedAdvanceLandlordId],
    );

    function runSnapshot() {
        setMessage("");
        startTransition(async () => {
            try {
                const result = await runMonthlyLandlordPayableSnapshot();
                setMessage(`Monthly snapshot complete: ${result.created} created, ${result.skipped} skipped, ${result.failed} failed.`);
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Unable to run monthly snapshot.");
            }
        });
    }

    function focusPayables(panel: "unpaid" | "ledger") {
        setActivePanel(panel);
        document.getElementById(panel === "ledger" ? "monthly-ledger" : "unpaid-landlords-report")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function focusAdvances() {
        setActivePanel("advances");
        document.getElementById("landlord-advances")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function focusPaid() {
        setActivePanel("paid");
        document.getElementById("paid-landlords")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function focusRecovery() {
        setActivePanel("recovery");
        document.getElementById("recovery-deductions")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function selectLedger(landlordId: string) {
        setSelectedLandlordId(landlordId);
        setActivePanel("ledger");
        document.getElementById("monthly-ledger")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    return (
        <main className="enterprise-page">
            <div className="enterprise-shell">
                <PageHero
                    title="Landlord Payments"
                    subtitle={`${data.company?.name ?? "Company"} · unpaid landlord payables, monthly ledger, and printable statements`}
                    badge="Landlords Portfolio → Landlord Payments"
                >
                    <div className="enterprise-card px-5 py-4">
                        <p className="text-sm font-bold text-slate-500">Oldest Unpaid Month</p>
                        <p className="mt-1 text-xl font-black text-slate-950">{monthLabel(summary.oldestUnpaidMonth)}</p>
                    </div>
                </PageHero>

                {message ? (
                    <div className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">{message}</div>
                ) : null}

                <section className="rounded-[2rem] border border-white/10 bg-slate-950 p-4 shadow-2xl shadow-slate-950/30">
                    <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                        <div>
                            <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-300">Finance Control</p>
                            <h2 className="mt-1 text-2xl font-black text-white">Landlord Payment Position</h2>
                        </div>
                        <span className="w-fit rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-black uppercase tracking-wide text-emerald-200">Live</span>
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                        <PaymentKpiCard label="Total Landlord Liability" value={money(summary.totalOutstandingToLandlords)} detail="Unpaid landlord net payable" tone="red" icon={<WalletCards size={18} />} status="Live" progress={summary.totalOutstandingToLandlords ? 100 : 0} onClick={() => focusPayables("unpaid")} />
                        <PaymentKpiCard label="Unpaid Landlords" value={summary.unpaidLandlords.toLocaleString()} detail="Landlords still demanding payment" tone="amber" icon={<Landmark size={18} />} status="Needs Review" progress={Math.min(100, Math.round((summary.unpaidLandlords / Math.max(summary.unpaidLandlords + summary.paidLandlords, 1)) * 100))} onClick={() => focusPayables("unpaid")} />
                        <PaymentKpiCard label="Paid Landlords" value={summary.paidLandlords.toLocaleString()} detail="Cleared landlord-month records" tone="green" icon={<ShieldCheck size={18} />} status="Cleared" progress={Math.min(100, Math.round((summary.paidLandlords / Math.max(summary.unpaidLandlords + summary.paidLandlords, 1)) * 100))} onClick={focusPaid} />
                        <PaymentKpiCard label="Total Paid To Landlords" value={money(summary.totalMoneyPaidToLandlords)} detail="Money already paid out" tone="emerald" icon={<ReceiptText size={18} />} status="Updated" progress={Math.min(100, Math.round((summary.totalMoneyPaidToLandlords / Math.max(summary.totalMoneyPaidToLandlords + summary.totalOutstandingToLandlords, 1)) * 100))} onClick={focusPaid} />
                        <PaymentKpiCard label="Landlord Advances" value={money(summary.activeLandlordAdvances)} detail="Active advance balances" tone="blue" icon={<BanknoteArrowDown size={18} />} status={summary.activeLandlordAdvances ? "Needs Review" : "Updated"} progress={summary.activeLandlordAdvances ? 100 : 0} onClick={focusAdvances} />
                        <PaymentKpiCard label="Recovery Deductions" value={money(summary.recoveryDeductions)} detail="Recovered from landlord due to tenant debt" tone="purple" icon={<TrendingDown size={18} />} status={summary.recoveryDeductions ? "Live" : "Updated"} progress={summary.recoveryDeductions ? 100 : 0} onClick={focusRecovery} />
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-3 rounded-3xl border border-white/10 bg-white/5 p-4 md:grid-cols-5">
                        <SummaryStripItem label="Current Month" value={currentMonth} />
                        <SummaryStripItem label="Outstanding" value={money(summary.totalOutstandingToLandlords)} tone="text-red-200" />
                        <SummaryStripItem label="Paid" value={money(summary.totalMoneyPaidToLandlords)} tone="text-emerald-200" />
                        <SummaryStripItem label="Advances" value={money(summary.activeLandlordAdvances)} tone="text-blue-200" />
                        <SummaryStripItem label="Net Position" value={money(netPosition)} tone={netPosition >= 0 ? "text-amber-200" : "text-emerald-200"} />
                    </div>
                    {data.canManage ? <LivePayableDebugPanel data={data} /> : null}
                </section>

                {groups.length === 0 ? (
                    <section className="mt-6 rounded-3xl border border-amber-200 bg-amber-50 p-5">
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                            <div>
                                <p className="text-xs font-black uppercase tracking-wide text-amber-700">No monthly payable records</p>
                                <h2 className="mt-1 text-xl font-black text-slate-950">Run Monthly Snapshot</h2>
                                <p className="mt-1 text-sm font-semibold text-slate-600">Create live landlord monthly payable records from current settlement calculations.</p>
                            </div>
                            <button disabled={isPending || !data.canManage} onClick={runSnapshot} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">
                                {isPending ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                                Run Monthly Snapshot
                            </button>
                        </div>
                        {!data.canManage ? <p className="mt-3 text-xs font-bold text-amber-700">Admin or landlord manager permission is required to run snapshots.</p> : null}
                    </section>
                ) : null}

                <section className="mt-6">
                    <LandlordPaymentEntryPanel
                        canManage={data.canManage}
                        currentMonthKey={currentMonthKey}
                        landlordOptions={landlords}
                        search={landlordSearch}
                        searchResults={landlordSearchResults}
                        selected={selected}
                        selectedAdvanceGroup={advanceGroups.find((group) => group.landlordId === selected?.landlordId) ?? null}
                        selectedOption={landlords.find((landlord) => landlord.id === selected?.landlordId) ?? null}
                        setMessage={setMessage}
                        onSearchChange={setLandlordSearch}
                        onSelect={(landlordId) => {
                            setSelectedLandlordId(landlordId);
                            setActivePanel("ledger");
                        }}
                    />
                </section>

                <section className="mt-6">
                    <LandlordPaymentApprovalStatusPanel requests={data.approvalRequests ?? []} />
                </section>

                <section className="mt-6 grid grid-cols-1 gap-6 2xl:grid-cols-12">
                    <div id="unpaid-landlords-report" className={`2xl:col-span-5 ${activePanel === "advances" ? "opacity-75" : ""}`}>
                        <UnpaidLandlordsReport groups={unpaidReportGroups} monthGroups={unpaidMonthGroups} selectedId={selected?.landlordId ?? ""} onSelect={setSelectedLandlordId} onViewLedger={selectLedger} />
                    </div>
                    <div id="monthly-ledger" className="2xl:col-span-7">
                        <MonthlyLedger group={selected} />
                    </div>
                </section>

                <section id="paid-landlords" className="mt-6">
                    <PaidLandlordsSection payments={paidPayments} />
                </section>

                <section id="recovery-deductions" className="mt-6">
                    <RecoveryDeductionsSection groups={groups} />
                </section>

                <section id="landlord-advances" className="mt-6 grid grid-cols-1 gap-6 2xl:grid-cols-12">
                    <div className="2xl:col-span-5">
                        <LandlordAdvancesReport
                            groups={advanceGroups}
                            selectedId={selectedAdvance?.landlordId ?? ""}
                            onSelect={(id) => {
                                setSelectedAdvanceLandlordId(id);
                                setActivePanel("advances");
                            }}
                            canManage={data.canManage}
                        />
                    </div>
                    <div className="2xl:col-span-7">
                        <LandlordAdvanceDetails group={selectedAdvance} canManage={data.canManage} setMessage={setMessage} />
                    </div>
                    {data.canManage ? (
                        <div className="2xl:col-span-12">
                            <AddAdvancePanel data={safeData} setMessage={setMessage} />
                        </div>
                    ) : null}
                </section>
            </div>
        </main>
    );
}

function LandlordPaymentApprovalStatusPanel({ requests }: { requests: LandlordPaymentApprovalRequest[] }) {
    const pending = requests.filter((request) => request.status === "pending").length;
    const approved = requests.filter((request) => request.status === "approved").length;
    const rejected = requests.filter((request) => request.status === "rejected").length;

    return (
        <section className="enterprise-panel overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-slate-200 p-5 md:flex-row md:items-start md:justify-between">
                <div>
                    <p className="text-xs font-black uppercase tracking-wide text-blue-700">Approval Status</p>
                    <h2 className="mt-1 text-xl font-black text-slate-950">Expense-Routed Landlord Payment Requests</h2>
                    <p className="mt-1 text-sm font-semibold text-slate-500">Pending requests are visible for control only. They do not affect landlord ledgers, advances, dashboards, reports, or statements until Admin approves them.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <StatusChip label={`Pending ${pending}`} tone="orange" />
                    <StatusChip label={`Approved ${approved}`} tone="green" />
                    <StatusChip label={`Rejected ${rejected}`} tone="red" />
                </div>
            </div>
            {requests.length === 0 ? (
                <div className="p-5">
                    <EmptyState title="No landlord payment requests" description="Requests submitted from Expenses will appear here with Pending, Approved, or Rejected status." />
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="enterprise-table">
                        <thead>
                            <tr>
                                <th className="text-left">Landlord</th>
                                <th className="text-left">Office</th>
                                <th className="text-left">Month</th>
                                <th className="text-left">Requested</th>
                                <th className="text-left">Payment</th>
                                <th className="text-left">Advance</th>
                                <th className="text-left">Status</th>
                                <th className="text-left">Submitted</th>
                                <th className="text-left">Reviewed</th>
                            </tr>
                        </thead>
                        <tbody>
                            {requests.map((request) => (
                                <tr key={`landlord-payment-status:${request.id}`}>
                                    <td className="font-black text-slate-950">{request.landlordName}</td>
                                    <td>{request.officeName}</td>
                                    <td>{monthLabel(request.paymentMonth ?? request.paymentDate)}</td>
                                    <td className="font-black text-blue-700">{money(request.requestedAmount)}</td>
                                    <td className="font-black text-emerald-700">{money(request.normalPaymentAmount)}</td>
                                    <td className="font-black text-amber-700">{money(request.advanceAmount)}</td>
                                    <td><ApprovalStatusChip status={request.status} /></td>
                                    <td>{dateLabel(request.submittedAt)}</td>
                                    <td>{request.reviewedAt ? dateLabel(request.reviewedAt) : "Not reviewed"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}

function ApprovalStatusChip({ status }: { status: string }) {
    const value = status.toLowerCase();
    if (value === "approved") return <StatusChip label="Approved" tone="green" />;
    if (value === "rejected") return <StatusChip label="Rejected" tone="red" />;
    return <StatusChip label="Pending" tone="orange" />;
}

function LandlordPaymentEntryPanel({
    canManage,
    currentMonthKey,
    landlordOptions,
    search,
    searchResults,
    selected,
    selectedAdvanceGroup,
    selectedOption,
    setMessage,
    onSearchChange,
    onSelect,
}: {
    canManage: boolean;
    currentMonthKey: string;
    landlordOptions: LandlordPaymentOption[];
    search: string;
    searchResults: Array<{ group: LandlordPayableGroup; option?: LandlordPaymentOption; searchText: string }>;
    selected: LandlordPayableGroup | null;
    selectedAdvanceGroup: LandlordAdvanceGroup | null;
    selectedOption: LandlordPaymentOption | null;
    setMessage: (message: string) => void;
    onSearchChange: (value: string) => void;
    onSelect: (landlordId: string) => void;
}) {
    const today = new Date().toISOString().slice(0, 10);
    const [amount, setAmount] = useState("");
    const [paymentDate, setPaymentDate] = useState(today);
    const [paymentMonth, setPaymentMonth] = useState(currentMonthKey.slice(0, 10));
    const [paymentMethod, setPaymentMethod] = useState("cash");
    const [reference, setReference] = useState("");
    const [notes, setNotes] = useState("");
    const [localMessage, setLocalMessage] = useState("");
    const [lastSubmission, setLastSubmission] = useState<{
        advanceAmount: number;
        amountPaid: number;
        approvedAt?: string | null;
        id?: string | null;
        normalPaymentAmount: number;
        notes?: string;
        paymentDate: string;
        paymentMethod: string;
        paymentMonth: string;
        reference?: string;
        receiptNumber: string;
        remainingAfterPayment: number;
        status: string;
    } | null>(null);
    const [isPending, startTransition] = useTransition();
    const selectedRows = selected?.rows ?? [];
    const summary = useMemo(
        () => summarizeLandlordPayables({
            activeAdvanceBalance: selectedAdvanceGroup?.remainingBalance ?? 0,
            currentMonth: paymentMonth,
            payables: selectedRows as unknown as Record<string, unknown>[],
        }),
        [paymentMonth, selectedAdvanceGroup?.remainingBalance, selectedRows],
    );
    const allocation = useMemo(
        () => buildLandlordPaymentAllocationPlan({
            amount: numeric(amount),
            currentMonth: paymentMonth,
            payables: selectedRows as unknown as Record<string, unknown>[],
        }),
        [amount, paymentMonth, selectedRows],
    );
    const monthlyRows = useMemo(
        () => selectedRows
            .map((row) => ({
                row,
                balance: monthlyUnpaid(row),
                appliedDeductions: monthlyAppliedDeductions(row) - monthlyPendingDeductions(row),
                due: monthlyDue(row),
                finalNetPayable: monthlyFinalNetPayable(row),
                grossPayable: monthlyGrossPayable(row),
                pendingDeductions: monthlyPendingDeductions(row),
            }))
            .sort((a, b) => String(a.row.settlement_month).localeCompare(String(b.row.settlement_month))),
        [selectedRows],
    );
    const unpaidRows = monthlyRows.filter((item) => item.balance > 0);
    const paidRows = monthlyRows.filter((item) => item.balance <= 0 && numeric(item.row.amount_paid) > 0);
    const latestRow = selectedRows[0] ?? null;
    const selectedOfficeId = selectedRows.find((row) => row.office_id)?.office_id ?? null;
    const roomNumbers = (selectedOption?.roomNumbersText ?? "").split(/[,\s]+/).map((value) => value.trim()).filter(Boolean);
    const oldMonthAllocation = allocation.lines
        .filter((line) => line.month.slice(0, 7) < paymentMonth.slice(0, 7))
        .reduce((total, line) => total + line.applied, 0);
    const currentMonthAllocation = allocation.lines
        .filter((line) => line.month.slice(0, 7) === paymentMonth.slice(0, 7))
        .reduce((total, line) => total + line.applied, 0);
    const amountEntered = numeric(amount);
    const remainingAfterPayment = Math.max(0, summary.totalOutstandingPayable - amountEntered);
    const previousMonthsOutstanding = Math.max(0, summary.totalOutstandingPayable - summary.currentMonthUnpaid);
    const currentRows = selectedRows.filter((row) => String(row.settlement_month).slice(0, 7) === paymentMonth.slice(0, 7));
    const currentPendingDeductions = summary.currentMonthPendingDeductions;
    const currentRecoveryDeductions = currentPendingDeductions > 0
        ? 0
        : currentRows.reduce((total, row) => total + numeric(row.vacated_tenant_debt_deductions), 0);
    const currentVacantRoomDeductions = currentPendingDeductions > 0
        ? 0
        : currentRows.reduce((total, row) => total + numeric(row.vacant_room_deductions), 0);
    const currentAdvanceRecovery = currentPendingDeductions > 0
        ? 0
        : currentRows.reduce((total, row) => total + numeric(row.advance_deductions), 0);
    const currentOtherDeductions = currentPendingDeductions > 0
        ? 0
        : currentRows.reduce((total, row) => total + numeric(row.other_deductions), 0);
    const currentPaymentStatus = summary.totalOutstandingPayable <= 0 ? "Cleared" : numeric(latestRow?.amount_paid) > 0 ? "Partially Paid" : "Unpaid";
    const confidence = amountEntered <= 0 ? "Awaiting amount" : allocation.advanceAmount > 0 ? "Overpayment reviewed" : remainingAfterPayment > 0 ? "Partial payment" : "High confidence";
    const riskLabel = amountEntered <= 0 ? "Low input readiness" : allocation.advanceAmount > 0 ? "Advance agreement required" : remainingAfterPayment > 0 ? "Outstanding remains" : "Balanced payment";
    const isSuccessMessage = Boolean(localMessage) && /recorded|sent/i.test(localMessage) && !/unable|error|select|enter/i.test(localMessage);
    const submitLabel = canManage ? "Submit Landlord Payment" : "Send for Admin Approval";

    function submitPayment() {
        if (!selected) {
            setLocalMessage("Select a landlord first.");
            return;
        }
        if (amountEntered <= 0) {
            setLocalMessage("Enter a valid payment amount.");
            return;
        }
        setLocalMessage("");
        setLastSubmission(null);
        startTransition(async () => {
            try {
                const result = await submitLandlordPaymentFromTerminal({
                    advanceAgreement: allocation.advanceAmount > 0 ? {
                        deductionStartDate: paymentDate,
                        fixedInterestAmount: 0,
                        interestRate: 0,
                        interestValue: 0,
                        monthlyDeductionAmount: allocation.advanceAmount,
                        paymentPlan: "one_time",
                        reason: notes || "Landlord payment overpayment converted to advance from Landlord Payments.",
                    } : undefined,
                    amount: amountEntered,
                    expenseDate: paymentDate,
                    landlordId: selected.landlordId,
                    officeId: selectedOfficeId,
                    paymentMethod,
                    paymentMonth,
                    notes: [
                        notes,
                        reference ? `Reference: ${reference}` : "",
                        "Recorded from Landlord Payments page.",
                    ].filter(Boolean).join("\n") || undefined,
                });
                if (!result.ok) {
                    setLocalMessage(result.error);
                    setMessage(result.error);
                    return;
                }
                const success = canManage
                    ? `Landlord payment recorded and approved. Normal payment: ${money(allocation.normalPaymentAmount)}; advance: ${money(allocation.advanceAmount)}.`
                    : "Landlord payment request sent to Admin. It will not affect ledgers until approval.";
                const submittedId = typeof result.data?.id === "string" ? result.data.id : null;
                const approvedAt = typeof result.data?.approved_at === "string" ? result.data.approved_at : null;
                const status = typeof result.data?.status === "string" ? result.data.status : canManage ? "approved" : "pending";
                setLastSubmission({
                    advanceAmount: allocation.advanceAmount,
                    amountPaid: amountEntered,
                    approvedAt,
                    id: submittedId,
                    normalPaymentAmount: allocation.normalPaymentAmount,
                    notes,
                    paymentDate,
                    paymentMethod,
                    paymentMonth,
                    reference,
                    receiptNumber: submittedId ? `LP-${submittedId.slice(0, 8).toUpperCase()}` : `LP-${Date.now()}`,
                    remainingAfterPayment,
                    status,
                });
                setLocalMessage(success);
                setMessage(success);
                setAmount("");
                setReference("");
                setNotes("");
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : "Unable to record landlord payment.";
                setLocalMessage(errorMessage);
                setMessage(errorMessage);
            }
        });
    }

    return (
        <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-50 shadow-2xl shadow-slate-200/70">
            <div className="relative overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.28),transparent_34%),linear-gradient(135deg,#061826,#0f2f2a_44%,#0f172a)] p-5 text-white md:p-6">
                <div className="absolute inset-0 bg-white/[0.03] backdrop-blur-sm" />
                <div className="relative z-10 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                    <div className="min-w-0">
                        <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-200">🏦 Landlord Payment Centre</p>
                        <h2 className="mt-2 break-words text-[clamp(1.55rem,3vw,2.7rem)] font-black leading-tight">{selected?.landlordName ?? "Select landlord"}</h2>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs font-black">
                            <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-3 py-1"><Building2 size={13} /> {selected?.officeName ?? "Office"}</span>
                            <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-3 py-1"><Phone size={13} /> {selectedOption?.phone ?? "No phone"}</span>
                            <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-3 py-1"><CalendarDays size={13} /> {monthLabel(paymentMonth)}</span>
                            <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-3 py-1"><ReceiptText size={13} /> {currentPaymentStatus}</span>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 xl:min-w-[520px]">
                        <PremiumHeaderStat label="Last Payment" value={dateLabel(selected?.lastPaidAt)} />
                        <PremiumHeaderStat label="Live Source" value="Live Supabase" tone="text-emerald-100" />
                        <PremiumHeaderStat label="Mode" value={canManage ? "Admin Direct" : "Office Approval"} tone={canManage ? "text-emerald-100" : "text-blue-100"} />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-5 p-4 md:p-5 2xl:grid-cols-[minmax(330px,0.95fr)_minmax(0,1.25fr)]">
                <div className="space-y-4">
                    <div className="rounded-[1.75rem] border border-slate-200 bg-white/95 p-4 shadow-xl shadow-slate-200/60">
                        <PremiumField label="Landlord Search" icon={<Search size={18} />} helper="Search by landlord, phone, room, office, or property">
                            <input
                                value={search}
                                onChange={(event) => onSearchChange(event.target.value)}
                                placeholder="Mawejje, Z127, phone, office..."
                                className="w-full border-0 bg-transparent text-sm font-black text-slate-950 outline-none placeholder:text-slate-400"
                            />
                        </PremiumField>
                        <div className="mt-4 max-h-[390px] space-y-2 overflow-auto pr-1">
                            {searchResults.length === 0 ? (
                                <EmptyState title="No landlord found" description={landlordOptions.length ? "Try landlord name, phone, office, property, or room number." : "No landlord payable records are available yet."} />
                            ) : searchResults.map(({ group, option }) => {
                                const isSelected = selected?.landlordId === group.landlordId;
                                return (
                                    <button
                                        key={group.landlordId}
                                        type="button"
                                        onClick={() => onSelect(group.landlordId)}
                                        className={`w-full rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 ${isSelected ? "border-emerald-300 bg-gradient-to-br from-emerald-50 to-white shadow-lg shadow-emerald-100" : "border-slate-200 bg-white hover:border-emerald-200 hover:bg-slate-50"}`}
                                    >
                                        <div className="flex min-w-0 items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-black text-slate-950">{group.landlordName}</p>
                                                <p className="mt-1 truncate text-xs font-bold text-slate-500">{option?.phone ?? "No phone"} · {group.officeName}</p>
                                            </div>
                                            <span className="shrink-0 rounded-full bg-slate-950 px-2.5 py-1 text-[10px] font-black text-white">{money(group.totalOutstanding)}</span>
                                        </div>
                                        <p className="mt-2 line-clamp-2 text-xs font-semibold text-slate-500">
                                            Rooms: {option?.roomNumbersText || "Not indexed"} {option?.locationText ? `· ${option.locationText}` : ""}
                                        </p>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-xl shadow-slate-200/60">
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Payment Form</p>
                        <div className="mt-4 grid grid-cols-1 gap-3">
                            <PremiumField label="Amount Paid" icon={<CircleDollarSign size={18} />} helper={amountEntered > 0 ? money(amountEntered) : "Enter UGX amount"}>
                                <input className="w-full border-0 bg-transparent text-base font-black text-slate-950 outline-none placeholder:text-slate-400" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" />
                            </PremiumField>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <PremiumField label="Payment Month" icon={<CalendarDays size={18} />}>
                                    <input className="w-full border-0 bg-transparent text-sm font-black text-slate-950 outline-none" type="date" value={paymentMonth} onChange={(event) => setPaymentMonth(event.target.value)} />
                                </PremiumField>
                                <PremiumField label="Payment Date" icon={<CalendarDays size={18} />}>
                                    <input className="w-full border-0 bg-transparent text-sm font-black text-slate-950 outline-none" type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
                                </PremiumField>
                            </div>
                            <PremiumField label="Payment Method" icon={<CreditCard size={18} />}>
                                <select className="w-full border-0 bg-transparent text-sm font-black text-slate-950 outline-none" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
                                    <option value="cash">Cash</option>
                                    <option value="mobile_money">Mobile Money</option>
                                    <option value="bank">Bank</option>
                                    <option value="cheque">Cheque</option>
                                    <option value="manual">Manual</option>
                                </select>
                            </PremiumField>
                            <PremiumField label="Reference" icon={<BadgeDollarSign size={18} />}>
                                <input className="w-full border-0 bg-transparent text-sm font-black text-slate-950 outline-none placeholder:text-slate-400" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Bank slip, MOMO ID, cheque no." />
                            </PremiumField>
                            <PremiumField label="Notes" icon={<FileText size={18} />}>
                                <textarea className="min-h-24 w-full resize-none border-0 bg-transparent text-sm font-bold text-slate-950 outline-none placeholder:text-slate-400" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional payment notes" />
                            </PremiumField>
                        </div>
                    </div>
                </div>

                <div className="min-w-0 space-y-5">
                    {!selected ? (
                        <EmptyState title="Select a landlord" description="The live payable position and payment terminal will appear here." />
                    ) : (
                        <>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                                <FinancialSummaryCard icon={<WalletCards size={18} />} label="Total Genuine Outstanding" value={money(summary.totalOutstandingPayable)} tone="red" />
                                <FinancialSummaryCard icon={<CalendarDays size={18} />} label="Current Month Gross Payable" value={money(summary.currentMonthGrossPayable)} tone="blue" />
                                <FinancialSummaryCard icon={<TrendingDown size={18} />} label="Previous Months Outstanding" value={money(previousMonthsOutstanding)} tone="amber" />
                                <FinancialSummaryCard icon={<BanknoteArrowDown size={18} />} label="Advance Balance" value={money(selectedAdvanceGroup?.remainingBalance ?? 0)} tone="purple" />
                                <FinancialSummaryCard icon={<ShieldCheck size={18} />} label="Recovery Deductions Applied" value={money(currentRecoveryDeductions)} tone="emerald" />
                                <FinancialSummaryCard icon={<Building2 size={18} />} label="Vacant Room Deductions Applied" value={money(currentVacantRoomDeductions)} tone="slate" />
                                <FinancialSummaryCard icon={<ReceiptText size={18} />} label="Pending Deductions Before 15th" value={money(currentPendingDeductions)} tone="amber" />
                                <FinancialSummaryCard icon={<CircleDollarSign size={18} />} label="Current Month Final Net Payable" value={money(summary.currentMonthFinalNetPayable)} tone="green" />
                                <FinancialSummaryCard icon={<CircleDollarSign size={18} />} label="Remaining After Payment" value={money(remainingAfterPayment)} tone={remainingAfterPayment > 0 ? "red" : "green"} />
                            </div>
                            {(currentAdvanceRecovery > 0 || currentOtherDeductions > 0) ? (
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                    <FinancialSummaryCard icon={<BanknoteArrowDown size={18} />} label="Advance Recovery Applied" value={money(currentAdvanceRecovery)} tone="purple" />
                                    <FinancialSummaryCard icon={<ShieldCheck size={18} />} label="Other Approved Deductions" value={money(currentOtherDeductions)} tone="slate" />
                                </div>
                            ) : null}

                            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(310px,0.82fr)]">
                                <AiPaymentAssistant
                                    advanceAmount={allocation.advanceAmount}
                                    confidence={confidence}
                                    currentMonthAllocation={currentMonthAllocation}
                                    normalAmount={allocation.normalPaymentAmount}
                                    oldMonthAllocation={oldMonthAllocation}
                                    remainingAfterPayment={remainingAfterPayment}
                                    riskLabel={riskLabel}
                                />
                                <PaymentAllocationTimeline
                                    amountEntered={amountEntered}
                                    advanceAmount={allocation.advanceAmount}
                                    currentMonthAllocation={currentMonthAllocation}
                                    oldMonthAllocation={oldMonthAllocation}
                                    remainingAfterPayment={remainingAfterPayment}
                                />
                            </div>

                            <div className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-xl shadow-slate-200/60">
                                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                    <div>
                                        <p className="text-xs font-black uppercase tracking-wide text-slate-500">Payment Breakdown</p>
                                        <h4 className="text-lg font-black text-slate-950">Month-by-month allocation preview</h4>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <StatusChip label={`Unpaid ${unpaidRows.length}`} tone="red" />
                                        <StatusChip label={`Paid ${paidRows.length}`} tone="green" />
                                    </div>
                                </div>
                                <div className="mt-4 overflow-x-auto">
                                    <table className="enterprise-table min-w-[840px]">
                                        <thead>
                                            <tr>
                                                <th className="text-left">Month</th>
                                                <th className="text-left">Gross Payable</th>
                                                <th className="text-left">Applied Deductions</th>
                                                <th className="text-left">Final Net Payable</th>
                                                <th className="text-left">Already Paid</th>
                                                <th className="text-left">Remaining</th>
                                                <th className="text-left">Payment Applied</th>
                                                <th className="text-left">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {monthlyRows.map(({ row, appliedDeductions, balance, due, finalNetPayable, grossPayable, pendingDeductions }) => {
                                                const applied = allocation.lines.find((line) => line.payableId === row.id)?.applied ?? 0;
                                                return (
                                                    <tr key={row.id}>
                                                        <td className="font-black">{monthLabel(row.settlement_month)}</td>
                                                        <td className="font-black text-slate-900">{money(grossPayable)}</td>
                                                        <td className="font-bold text-emerald-700">{money(appliedDeductions)}{pendingDeductions > 0 ? <span className="ml-2 text-[10px] font-black text-amber-700">Scheduled {money(pendingDeductions)}</span> : null}</td>
                                                        <td className="font-black text-slate-900">{money(finalNetPayable)}{due !== finalNetPayable ? <span className="ml-2 text-[10px] font-black text-blue-700">Payable now {money(due)}</span> : null}</td>
                                                        <td className="font-bold text-emerald-700">{money(row.amount_paid)}</td>
                                                        <td className="font-black text-red-700">{money(balance)}</td>
                                                        <td className="font-black text-blue-700">{money(applied)}</td>
                                                        <td><StatusChip label={balance > 0 ? numeric(row.amount_paid) > 0 ? "Partially Paid" : "Unpaid" : "Paid"} tone={balance > 0 ? numeric(row.amount_paid) > 0 ? "orange" : "red" : "green"} /></td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {localMessage ? (
                                <div className={`rounded-[1.75rem] border p-5 shadow-xl ${isSuccessMessage ? "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white shadow-emerald-100" : "border-blue-200 bg-blue-50 shadow-blue-100"}`}>
                                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                        <div className="flex gap-3">
                                            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${isSuccessMessage ? "bg-emerald-600 text-white shadow-lg shadow-emerald-200" : "bg-blue-600 text-white shadow-lg shadow-blue-200"}`}>
                                                {isSuccessMessage ? <CheckCircle2 size={24} /> : <Sparkles size={24} />}
                                            </span>
                                            <div>
                                                <p className="text-xs font-black uppercase tracking-wide text-slate-500">{isSuccessMessage ? "Success" : "Status"}</p>
                                                <h4 className="mt-1 text-lg font-black text-slate-950">{localMessage}</h4>
                                                {isSuccessMessage && canManage ? <p className="mt-2 text-sm font-bold text-slate-600">Receipt ready · Payment allocated · Ledger updated · Supabase synced</p> : null}
                                                {isSuccessMessage && !canManage ? <p className="mt-2 text-sm font-bold text-slate-600">Official payment receipt will be generated after Admin approval and financial application.</p> : null}
                                            </div>
                                        </div>
                                        {isSuccessMessage && canManage && lastSubmission ? (
                                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:flex md:flex-wrap">
                                                <button type="button" onClick={printLandlordReceipt} className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white">Print Receipt</button>
                                                <button type="button" onClick={printLandlordReceipt} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">Download PDF</button>
                                                <button type="button" onClick={() => setLocalMessage("E-receipt delivery is handled by the configured notification/email provider after approval.")} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">Send E-Receipt</button>
                                                <a href={`/office/landlords?landlord=${selected.landlordId}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-xs font-black text-slate-700">View Report</a>
                                            </div>
                                        ) : null}
                                    </div>
                                    {isSuccessMessage && canManage && lastSubmission ? (
                                        <LandlordPaymentReceiptPreview
                                            advanceAmount={lastSubmission.advanceAmount}
                                            amountPaid={lastSubmission.amountPaid}
                                            approvedAt={lastSubmission.approvedAt}
                                            currentMonthFinalNetPayable={summary.currentMonthFinalNetPayable}
                                            currentMonthGrossPayable={summary.currentMonthGrossPayable}
                                            landlordName={selected.landlordName}
                                            notes={lastSubmission.notes}
                                            officeName={selected.officeName}
                                            paymentDate={lastSubmission.paymentDate}
                                            paymentMethod={lastSubmission.paymentMethod}
                                            paymentMonth={lastSubmission.paymentMonth}
                                            previousMonthsOutstanding={previousMonthsOutstanding}
                                            receiptNumber={lastSubmission.receiptNumber}
                                            recoveryDeductions={currentRecoveryDeductions}
                                            reference={lastSubmission.reference}
                                            remainingAfterPayment={lastSubmission.remainingAfterPayment}
                                            requestedAmount={lastSubmission.amountPaid}
                                            vacantRoomDeductions={currentVacantRoomDeductions}
                                        />
                                    ) : null}
                                </div>
                            ) : null}
                        </>
                    )}
                </div>
            </div>

            {selected ? (
                <div className="sticky bottom-0 z-30 border-t border-slate-200 bg-white/90 px-4 py-3 shadow-[0_-12px_30px_rgba(15,23,42,0.12)] backdrop-blur-xl md:px-5">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="grid grid-cols-3 gap-2 text-xs font-black sm:min-w-[520px]">
                            <StickySummaryValue label="Total to pay" value={money(amountEntered)} />
                            <StickySummaryValue label="Advance" value={money(allocation.advanceAmount)} tone="text-purple-700" />
                            <StickySummaryValue label="Remaining" value={money(remainingAfterPayment)} tone={remainingAfterPayment > 0 ? "text-red-700" : "text-emerald-700"} />
                        </div>
                        <button disabled={isPending || amountEntered <= 0} onClick={submitPayment} className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-black text-white shadow-xl disabled:cursor-not-allowed disabled:opacity-50 lg:w-auto ${canManage ? "bg-gradient-to-r from-emerald-600 to-green-700 shadow-emerald-200" : "bg-gradient-to-r from-blue-600 to-cyan-700 shadow-blue-200"}`}>
                            {isPending ? <Loader2 className="animate-spin" size={16} /> : <SendHorizontal size={16} />}
                            {isPending ? "Submitting..." : submitLabel}
                        </button>
                    </div>
                </div>
            ) : null}
        </section>
    );
}

function PremiumHeaderStat({ label, value, tone = "text-white" }: { label: string; value: string; tone?: string }) {
    return (
        <div className="min-w-0 rounded-2xl border border-white/15 bg-white/10 px-3 py-2 shadow-lg shadow-slate-950/10 backdrop-blur">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-300">{label}</p>
            <p className={`mt-1 truncate text-sm font-black ${tone}`}>{value}</p>
        </div>
    );
}

function PremiumField({
    children,
    helper,
    icon,
    label,
}: {
    children: ReactNode;
    helper?: string;
    icon: ReactNode;
    label: string;
}) {
    return (
        <label className="block rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 px-4 py-3 shadow-sm transition focus-within:border-emerald-300 focus-within:shadow-lg focus-within:shadow-emerald-100">
            <span className="mb-2 flex items-center justify-between gap-3">
                <span className="inline-flex min-w-0 items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white">{icon}</span>
                    <span className="truncate">{label}</span>
                </span>
                {helper ? <span className="hidden shrink-0 text-[11px] font-black text-emerald-700 sm:inline">{helper}</span> : null}
            </span>
            {children}
            {helper ? <span className="mt-1 block text-[11px] font-bold text-slate-400 sm:hidden">{helper}</span> : null}
        </label>
    );
}

function FinancialSummaryCard({
    icon,
    label,
    tone,
    value,
}: {
    icon: ReactNode;
    label: string;
    tone: "red" | "blue" | "amber" | "purple" | "emerald" | "slate" | "green";
    value: string;
}) {
    const palette = {
        amber: "from-amber-50 to-white text-amber-700 border-amber-200",
        blue: "from-blue-50 to-white text-blue-700 border-blue-200",
        emerald: "from-emerald-50 to-white text-emerald-700 border-emerald-200",
        green: "from-green-50 to-white text-green-700 border-green-200",
        purple: "from-purple-50 to-white text-purple-700 border-purple-200",
        red: "from-red-50 to-white text-red-700 border-red-200",
        slate: "from-slate-50 to-white text-slate-700 border-slate-200",
    }[tone];
    return (
        <div className={`group min-w-0 rounded-3xl border bg-gradient-to-br p-4 shadow-lg shadow-slate-200/70 transition hover:-translate-y-0.5 hover:shadow-xl ${palette}`}>
            <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 text-[11px] font-black uppercase tracking-wide text-slate-500">{label}</p>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white text-current shadow-sm transition group-hover:scale-105">{icon}</span>
            </div>
            <p className="mt-3 break-words text-[clamp(1.05rem,2vw,1.65rem)] font-black leading-tight text-slate-950">{value}</p>
            <p className="mt-2 inline-flex rounded-full bg-white/80 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700">Live</p>
        </div>
    );
}

function AiPaymentAssistant({
    advanceAmount,
    confidence,
    currentMonthAllocation,
    normalAmount,
    oldMonthAllocation,
    remainingAfterPayment,
    riskLabel,
}: {
    advanceAmount: number;
    confidence: string;
    currentMonthAllocation: number;
    normalAmount: number;
    oldMonthAllocation: number;
    remainingAfterPayment: number;
    riskLabel: string;
}) {
    return (
        <div className="overflow-hidden rounded-[1.75rem] border border-cyan-200 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_35%),linear-gradient(135deg,#ecfeff,#f0fdf4)] p-4 shadow-xl shadow-cyan-100">
            <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-600 to-emerald-600 text-white shadow-lg shadow-cyan-200">
                    <Sparkles size={22} />
                </span>
                <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-800">AI Finance Assistant</p>
                    <h4 className="mt-1 text-xl font-black text-slate-950">AI Recommendation</h4>
                    <p className="mt-1 text-xs font-bold text-slate-600">Advance is created only after every genuine unpaid balance becomes zero.</p>
                </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <AiLine label="Normal payment" value={money(normalAmount)} />
                <AiLine label="Advance portion" value={money(advanceAmount)} />
                <AiLine label="Old months covered" value={money(oldMonthAllocation)} />
                <AiLine label="Current month covered" value={money(currentMonthAllocation)} />
                <AiLine label="Remaining balance" value={money(remainingAfterPayment)} />
                <AiLine label="Risk indicator" value={riskLabel} warning={advanceAmount > 0 || remainingAfterPayment > 0} />
                <AiLine label="Payment confidence" value={confidence} />
                <AiLine label="Live reconciliation" value="Supabase synced" />
            </div>
        </div>
    );
}

function AiLine({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
    return (
        <div className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-white/80 bg-white/75 px-3 py-2 shadow-sm">
            <span className="inline-flex min-w-0 items-center gap-2 text-xs font-black text-slate-600">
                {warning ? <AlertTriangle className="shrink-0 text-amber-600" size={14} /> : <CheckCircle2 className="shrink-0 text-emerald-600" size={14} />}
                <span className="truncate">{label}</span>
            </span>
            <span className="shrink-0 text-right text-xs font-black text-slate-950">{value}</span>
        </div>
    );
}

function PaymentAllocationTimeline({
    advanceAmount,
    amountEntered,
    currentMonthAllocation,
    oldMonthAllocation,
    remainingAfterPayment,
}: {
    advanceAmount: number;
    amountEntered: number;
    currentMonthAllocation: number;
    oldMonthAllocation: number;
    remainingAfterPayment: number;
}) {
    const steps = [
        { label: "UGX entered", value: money(amountEntered), tone: "bg-slate-950 text-white" },
        { label: "Old unpaid months", value: money(oldMonthAllocation), tone: "bg-amber-600 text-white" },
        { label: "Current month", value: money(currentMonthAllocation), tone: "bg-blue-600 text-white" },
        { label: "Advance", value: money(advanceAmount), tone: "bg-purple-600 text-white" },
        { label: "Final balance", value: money(remainingAfterPayment), tone: remainingAfterPayment > 0 ? "bg-red-600 text-white" : "bg-emerald-600 text-white" },
    ];
    return (
        <div className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-xl shadow-slate-200/70">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Live Payment Allocation Timeline</p>
            <div className="mt-4 space-y-2">
                {steps.map((step, index) => (
                    <div key={step.label}>
                        <div className={`flex items-center justify-between gap-3 rounded-2xl px-3 py-3 shadow-sm ${step.tone}`}>
                            <span className="text-xs font-black uppercase tracking-wide">{step.label}</span>
                            <span className="text-sm font-black">{step.value}</span>
                        </div>
                        {index < steps.length - 1 ? (
                            <div className="flex justify-center py-1 text-slate-400">
                                <ArrowDown size={16} />
                            </div>
                        ) : null}
                    </div>
                ))}
            </div>
        </div>
    );
}

function StickySummaryValue({ label, value, tone = "text-slate-950" }: { label: string; value: string; tone?: string }) {
    return (
        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <p className="truncate text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p>
            <p className={`mt-1 truncate text-sm font-black ${tone}`}>{value}</p>
        </div>
    );
}

function LandlordPaymentReceiptPreview({
    advanceAmount,
    amountPaid,
    approvedAt,
    currentMonthFinalNetPayable,
    currentMonthGrossPayable,
    landlordName,
    notes,
    officeName,
    paymentDate,
    paymentMethod,
    paymentMonth,
    previousMonthsOutstanding,
    receiptNumber,
    recoveryDeductions,
    reference,
    remainingAfterPayment,
    vacantRoomDeductions,
}: {
    advanceAmount: number;
    amountPaid: number;
    approvedAt?: string | null;
    currentMonthFinalNetPayable: number;
    currentMonthGrossPayable: number;
    landlordName: string;
    notes?: string;
    officeName: string;
    paymentDate: string;
    paymentMethod: string;
    paymentMonth: string;
    previousMonthsOutstanding: number;
    receiptNumber: string;
    recoveryDeductions: number;
    reference?: string;
    remainingAfterPayment: number;
    requestedAmount: number;
    vacantRoomDeductions: number;
}) {
    const verificationCode = `${receiptNumber}-${Math.round(amountPaid)}`.replace(/[^A-Z0-9-]/gi, "").toUpperCase();
    return (
        <div id="landlord-payment-receipt-print-area" className="mt-5 overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white text-slate-950 shadow-xl shadow-slate-200/70">
            <div className="bg-[linear-gradient(135deg,#020617,#14532d_58%,#0f172a)] p-5 text-white">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-200">DDUMBA OS</p>
                        <h3 className="mt-1 text-2xl font-black">Landlord Payment Receipt</h3>
                        <p className="mt-1 text-sm font-bold text-slate-200">{officeName}</p>
                    </div>
                    <div className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-left sm:text-right">
                        <p className="text-[10px] font-black uppercase tracking-wide text-slate-300">Receipt number</p>
                        <p className="mt-1 text-lg font-black">{receiptNumber}</p>
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-2">
                <ReceiptLine label="Landlord" value={landlordName} />
                <ReceiptLine label="Office" value={officeName} />
                <ReceiptLine label="Payment Date" value={dateLabel(paymentDate)} />
                <ReceiptLine label="Payment Month" value={monthLabel(paymentMonth)} />
                <ReceiptLine label="Payment Method" value={paymentMethod.replaceAll("_", " ")} />
                <ReceiptLine label="Reference" value={reference || "Not provided"} />
                <ReceiptLine label="Current Month Gross Payable" value={money(currentMonthGrossPayable)} />
                <ReceiptLine label="Vacant Room Deductions" value={money(vacantRoomDeductions)} />
                <ReceiptLine label="Vacated Tenant / Recovery Deductions" value={money(recoveryDeductions)} />
                <ReceiptLine label="Current Month Final Net Payable" value={money(currentMonthFinalNetPayable)} />
                <ReceiptLine label="Previous Unpaid Balance" value={money(previousMonthsOutstanding)} />
                <ReceiptLine label="Amount Paid" value={money(amountPaid)} strong />
                <ReceiptLine label="Advance Portion" value={money(advanceAmount)} />
                <ReceiptLine label="Remaining Outstanding" value={money(remainingAfterPayment)} strong={remainingAfterPayment > 0} />
                <ReceiptLine label="Approved At" value={approvedAt ? dateLabel(approvedAt) : dateLabel(paymentDate)} />
                <ReceiptLine label="Verification Code" value={verificationCode} />
            </div>
            {notes ? (
                <div className="mx-5 mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-black uppercase tracking-wide text-slate-500">Notes</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm font-bold text-slate-700">{notes}</p>
                </div>
            ) : null}
            <div className="border-t border-slate-200 px-5 py-4 text-xs font-bold text-slate-500">
                This receipt is generated from the saved Supabase landlord payment transaction. Keep it for audit and settlement verification.
            </div>
        </div>
    );
}

function ReceiptLine({ label, strong = false, value }: { label: string; strong?: boolean; value: string }) {
    return (
        <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</p>
            <p className={`mt-1 text-sm [overflow-wrap:anywhere] ${strong ? "font-black text-slate-950" : "font-bold text-slate-700"}`}>{value}</p>
        </div>
    );
}

function LivePayableDebugPanel({ data }: { data: LandlordPayablesData }) {
    const debug = data.debug;
    if (!debug) return null;

    return (
        <div className="mt-4 rounded-3xl border border-white/10 bg-white/[0.06] p-4 text-white">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-200">Admin Live Supabase Debug</p>
                    <h3 className="mt-1 text-lg font-black">Current-month payable status source</h3>
                    <p className="mt-1 text-xs font-semibold text-slate-300">Counts are read from live current-month landlord payable rows. Unknown marker rows are excluded from paid/unpaid and listed for review.</p>
                </div>
                <span className="w-fit rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-black text-slate-100">{debug.currentMonthKey}</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-6">
                <DebugStat label="Total rows" value={debug.totalPayableRows} />
                <DebugStat label="Paid rows" value={debug.paidRows} tone="text-emerald-200" />
                <DebugStat label="Unpaid rows" value={debug.unpaidRows} tone="text-amber-200" />
                <DebugStat label="Partial rows" value={debug.partialRows} tone="text-blue-200" />
                <DebugStat label="Unknown rows" value={debug.unknownRows} tone="text-red-200" />
                <DebugStat label="Excluded rows" value={debug.excludedRows.length} tone="text-purple-200" />
            </div>
            {debug.excludedRows.length ? (
                <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
                    <table className="w-full text-left text-xs">
                        <thead className="bg-white/10 text-[0.65rem] font-black uppercase tracking-wide text-slate-300">
                            <tr>
                                <th className="px-3 py-2">Landlord</th>
                                <th className="px-3 py-2">Status</th>
                                <th className="px-3 py-2">Marker</th>
                                <th className="px-3 py-2">Reason Excluded</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/10">
                            {debug.excludedRows.map((row) => (
                                <tr key={row.id} className="text-slate-100">
                                    <td className="px-3 py-2 font-bold">{row.landlordName}</td>
                                    <td className="px-3 py-2">{row.status}</td>
                                    <td className="px-3 py-2">{row.marker}</td>
                                    <td className="px-3 py-2 text-slate-300">{row.reason}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : null}
        </div>
    );
}

function DebugStat({ label, value, tone = "text-white" }: { label: string; value: number; tone?: string }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-3">
            <p className="text-[0.65rem] font-black uppercase tracking-wide text-slate-400">{label}</p>
            <p className={`mt-1 text-xl font-black ${tone}`}>{value.toLocaleString()}</p>
        </div>
    );
}

function UnpaidLandlordsReport({
    groups,
    monthGroups,
    selectedId,
    onSelect,
    onViewLedger,
}: {
    groups: LandlordPayableGroup[];
    monthGroups: LandlordUnpaidMonthGroup[];
    selectedId: string;
    onSelect: (id: string) => void;
    onViewLedger: (id: string) => void;
}) {
    const totals = monthGroups.reduce((acc, group) => ({
        payable: acc.payable + group.totalPayable,
        paid: acc.paid + group.totalPaid,
        deductions: acc.deductions + group.totalDeductions,
        outstanding: acc.outstanding + group.totalUnpaid,
    }), { payable: 0, paid: 0, deductions: 0, outstanding: 0 });

    return (
        <section className="enterprise-panel overflow-hidden">
            <div className="border-b border-slate-200 p-5">
                <p className="text-xs font-black uppercase tracking-wide text-blue-600">Unpaid Landlords</p>
                <h2 className="mt-1 text-xl font-black text-slate-950">Unpaid Landlord Report</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">Open landlord payable rows grouped by settlement month. Paid, archived, reversed, and voided records are excluded.</p>
            </div>
            {monthGroups.length === 0 ? (
                <div className="p-6">
                    <EmptyState title="No unpaid landlord payable records" description="All live landlord payable rows are currently paid or closed." />
                </div>
            ) : (
                <div className="max-h-[760px] overflow-auto">
                    {monthGroups.map((monthGroup) => (
                        <div key={monthGroup.monthKey} className="border-b border-slate-200 last:border-b-0">
                            <div className="sticky top-0 z-10 flex flex-col gap-2 border-b border-slate-700 bg-gradient-to-r from-emerald-950 via-slate-950 to-slate-900 px-4 py-3 text-white shadow-lg md:flex-row md:items-center md:justify-between">
                                <div>
                                    <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-200">{monthLabel(`${monthGroup.monthKey}-01`)}</p>
                                    <h3 className="text-base font-black">Unpaid landlord payables</h3>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-xs font-black md:grid-cols-4">
                                    <span>Payable {money(monthGroup.totalPayable)}</span>
                                    <span>Paid {money(monthGroup.totalPaid)}</span>
                                    <span>Deductions {money(monthGroup.totalDeductions)}</span>
                                    <span className="text-red-200">Unpaid {money(monthGroup.totalUnpaid)}</span>
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="enterprise-table min-w-[920px]">
                                    <thead>
                                        <tr>
                                            <th className="text-left">Landlord</th>
                                            <th className="text-left">Office</th>
                                            <th className="text-left">Payable</th>
                                            <th className="text-left">Paid</th>
                                            <th className="text-left">Unpaid Balance</th>
                                            <th className="text-left">Deductions</th>
                                            <th className="text-left">Status</th>
                                            <th className="text-left">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {monthGroup.rows.map((row) => (
                                            <tr key={row.id} onClick={() => onSelect(row.landlordId)} className={`cursor-pointer ${row.landlordId === selectedId ? "bg-blue-50" : ""}`}>
                                                <td>
                                                    <button onClick={() => onSelect(row.landlordId)} className="text-left font-black text-slate-950 hover:text-blue-700">
                                                        {row.landlordName}
                                                    </button>
                                                    <p className="text-xs font-bold text-slate-500">{monthLabel(row.settlementMonth)}</p>
                                                </td>
                                                <td>{row.officeName}</td>
                                                <td className="whitespace-nowrap font-black text-slate-900">{money(row.payableAmount)}</td>
                                                <td className="whitespace-nowrap font-bold text-emerald-700">{money(row.amountPaid)}</td>
                                                <td className="whitespace-nowrap font-black text-red-700">{money(row.unpaidBalance)}</td>
                                                <td className="whitespace-nowrap font-bold text-amber-700">{money(row.deductions)}</td>
                                                <td><StatusChip label={row.status.replaceAll("_", " ")} tone={row.amountPaid > 0 ? "orange" : "red"} /></td>
                                                <td>
                                                    <div className="flex flex-nowrap gap-2">
                                                        <button type="button" onClick={(event) => { event.stopPropagation(); onViewLedger(row.landlordId); }} className="whitespace-nowrap rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white">View Ledger</button>
                                                        <button type="button" onClick={(event) => { event.stopPropagation(); onViewLedger(row.landlordId); setTimeout(() => window.print(), 250); }} className="whitespace-nowrap rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700">Print</button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ))}
                    <div className="sticky bottom-0 z-20 grid grid-cols-2 gap-2 border-t border-slate-700 bg-gradient-to-r from-slate-950 via-emerald-950 to-slate-900 px-4 py-3 text-sm font-black text-white shadow-[0_-8px_20px_rgba(15,23,42,0.18)] md:grid-cols-4">
                        <span>Total payable: {money(totals.payable)}</span>
                        <span>Total paid: {money(totals.paid)}</span>
                        <span>Total deductions: {money(totals.deductions)}</span>
                        <span className="text-red-200">Total unpaid across all months: {money(totals.outstanding)}</span>
                    </div>
                </div>
            )}
        </section>
    );
}

function PaymentKpiCard({
    label,
    value,
    detail,
    tone,
    icon,
    status,
    progress,
    onClick,
}: {
    label: string;
    value: string;
    detail: string;
    tone: "red" | "amber" | "blue" | "emerald" | "green" | "purple";
    icon: ReactNode;
    status: "Live" | "Updated" | "Needs Review" | "Cleared";
    progress: number;
    onClick: () => void;
}) {
    const palette = {
        red: {
            card: "from-red-500/20 via-red-950/30 to-slate-950",
            icon: "border-red-300/30 bg-red-400/15 text-red-200",
            bar: "bg-red-400",
            badge: "border-red-300/30 bg-red-400/10 text-red-100",
        },
        amber: {
            card: "from-amber-500/20 via-amber-950/20 to-slate-950",
            icon: "border-amber-300/30 bg-amber-400/15 text-amber-100",
            bar: "bg-amber-300",
            badge: "border-amber-300/30 bg-amber-400/10 text-amber-100",
        },
        blue: {
            card: "from-blue-500/20 via-blue-950/25 to-slate-950",
            icon: "border-blue-300/30 bg-blue-400/15 text-blue-100",
            bar: "bg-blue-300",
            badge: "border-blue-300/30 bg-blue-400/10 text-blue-100",
        },
        emerald: {
            card: "from-emerald-500/20 via-emerald-950/20 to-slate-950",
            icon: "border-emerald-300/30 bg-emerald-400/15 text-emerald-100",
            bar: "bg-emerald-300",
            badge: "border-emerald-300/30 bg-emerald-400/10 text-emerald-100",
        },
        green: {
            card: "from-green-500/20 via-green-950/20 to-slate-950",
            icon: "border-green-300/30 bg-green-400/15 text-green-100",
            bar: "bg-green-300",
            badge: "border-green-300/30 bg-green-400/10 text-green-100",
        },
        purple: {
            card: "from-purple-500/20 via-purple-950/20 to-slate-950",
            icon: "border-purple-300/30 bg-purple-400/15 text-purple-100",
            bar: "bg-purple-300",
            badge: "border-purple-300/30 bg-purple-400/10 text-purple-100",
        },
    }[tone];
    const width = Math.max(0, Math.min(100, progress));

    return (
        <button type="button" onClick={onClick} className={`min-w-0 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br ${palette.card} p-5 text-left shadow-xl shadow-slate-950/20 transition hover:-translate-y-0.5 hover:border-white/20 hover:shadow-2xl`}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-wide text-slate-300">{label}</p>
                    <p className="mt-2 break-words text-[clamp(1.35rem,2.4vw,2.15rem)] font-black leading-tight text-white">{value}</p>
                </div>
                <span className={`shrink-0 rounded-2xl border p-3 ${palette.icon}`}>{icon}</span>
            </div>
            <p className="mt-3 min-h-10 text-sm font-bold leading-snug text-slate-300">{detail}</p>
            <div className="mt-4 flex items-center justify-between gap-3">
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-wide ${palette.badge}`}>{status}</span>
                <span className="text-[11px] font-black uppercase tracking-wide text-slate-400">Open</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className={`h-full rounded-full ${palette.bar}`} style={{ width: `${width}%` }} />
            </div>
        </button>
    );
}

function SummaryStripItem({ label, value, tone = "text-white" }: { label: string; value: string; tone?: string }) {
    return (
        <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">{label}</p>
            <p className={`mt-1 break-words text-sm font-black md:text-base ${tone}`}>{value}</p>
        </div>
    );
}

function ApprovedPaymentDetails({
    detail,
    method,
}: {
    detail: LandlordPayableGroup["activePaymentDetail"] | null;
    method: string;
}) {
    if (!detail) {
        return (
            <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-black text-red-700">
                No approved payment details found. Submit payment details for Admin approval before non-cash payment.
            </div>
        );
    }
    if (method !== detail.paymentMethod) {
        return (
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-black text-amber-800">
                Approved method is {detail.paymentMethod.replaceAll("_", " ")}. Change payment method or request updated details.
            </div>
        );
    }
    return (
        <div className="mt-3 rounded-2xl border border-emerald-200 bg-white px-4 py-3">
            <p className="text-xs font-black uppercase tracking-wide text-emerald-700">Approved payment details</p>
            {detail.paymentMethod === "mobile_money" ? (
                <p className="mt-1 text-sm font-black text-slate-900">
                    {detail.provider ?? detail.mobileMoneyProvider ?? "Mobile Money"} · {detail.accountNumber ?? detail.mobileMoneyNumber ?? "No number"} · {detail.accountName ?? detail.mobileMoneyAccountName ?? "No account name"}
                </p>
            ) : (
                <p className="mt-1 text-sm font-black text-slate-900">
                    {detail.provider ?? detail.bankName ?? "Bank"} · {detail.accountNumber ?? detail.bankAccountNumber ?? "No account number"} · {detail.accountName ?? detail.bankAccountName ?? "No account name"}{detail.branch ? ` · ${detail.branch}` : ""}
                </p>
            )}
        </div>
    );
}

function MonthlyLedger({ group }: { group: LandlordPayableGroup | null }) {
    const [paymentTarget, setPaymentTarget] = useState<LandlordMonthlyPayable | null>(null);
    const [paymentAmount, setPaymentAmount] = useState("");
    const [paymentMethod, setPaymentMethod] = useState("cash");
    const [paymentDetailId, setPaymentDetailId] = useState("");
    const [paymentReference, setPaymentReference] = useState("");
    const [paymentMessage, setPaymentMessage] = useState("");
    const [isPending, startTransition] = useTransition();
    const payableSummary = useMemo(
        () => summarizeLandlordPayables({ payables: (group?.rows ?? []) as unknown as Record<string, unknown>[] }),
        [group?.rows],
    );

    function openPayment(row: LandlordMonthlyPayable) {
        setPaymentTarget(row);
        setPaymentAmount(String(Math.round(payableSummary.totalOutstandingPayable || monthlyUnpaid(row))));
        setPaymentMethod(group?.activePaymentDetail?.paymentMethod ?? "cash");
        setPaymentDetailId(group?.activePaymentDetail?.id ?? "");
        setPaymentReference("");
        setPaymentMessage("");
    }

    const selectedPaymentDetail = (group?.approvedPaymentDetails ?? []).find((detail) => detail.id === paymentDetailId) ?? null;
    const paymentPreview = useMemo(() => buildLandlordPaymentAllocationPlan({
        amount: numeric(paymentAmount),
        currentMonth: paymentTarget?.settlement_month,
        payables: (group?.rows ?? []) as unknown as Record<string, unknown>[],
    }), [group?.rows, paymentAmount, paymentTarget?.settlement_month]);

    function recordPayment() {
        if (!paymentTarget || !group) return;
        setPaymentMessage("");
        startTransition(async () => {
            try {
                const result = await createLandlordPaidExpenseRequest({
                    advanceAgreement: paymentPreview.advanceAmount > 0 ? {
                        deductionStartDate: new Date().toISOString().slice(0, 10),
                        fixedInterestAmount: 0,
                        interestRate: 0,
                        interestValue: 0,
                        monthlyDeductionAmount: paymentPreview.advanceAmount,
                        paymentPlan: "one_time",
                        reason: "Monthly ledger overpayment converted to landlord advance.",
                    } : undefined,
                    amount: Number(paymentAmount),
                    expenseDate: new Date().toISOString().slice(0, 10),
                    landlordId: group.landlordId,
                    paymentMethod,
                    paymentMonth: paymentTarget.settlement_month,
                    notes: [
                        paymentReference ? `Reference: ${paymentReference}` : "",
                        paymentDetailId ? `Payment detail ID: ${paymentDetailId}` : "",
                        "Recorded from Landlord Payments monthly ledger.",
                    ].filter(Boolean).join("\n") || undefined,
                });
                setPaymentMessage(result?.status === "pending"
                    ? "Landlord payment request sent to Admin. It will not affect ledgers until approval."
                    : "Landlord payment recorded and approved. Live totals are updating.");
                setPaymentTarget(null);
                setTimeout(() => window.location.reload(), 700);
            } catch (error) {
                setPaymentMessage(error instanceof Error ? error.message : "Unable to record landlord payment.");
            }
        });
    }

    if (!group) {
        return (
            <section className="enterprise-panel p-6">
                <EmptyState title="Select a landlord" description="Choose a landlord from the unpaid report to view monthly ledger and print statement." />
            </section>
        );
    }

    return (
        <section className="enterprise-panel overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-slate-200 p-5 md:flex-row md:items-start md:justify-between">
                <div>
                    <p className="text-xs font-black uppercase tracking-wide text-emerald-600">Monthly Ledger</p>
                    <h2 className="mt-1 text-xl font-black text-slate-950">{group.landlordName}</h2>
                    <p className="mt-1 text-sm font-semibold text-slate-500">{group.officeName} · {group.monthsUnpaid} unpaid month(s)</p>
                </div>
                <button onClick={() => window.print()} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white hover:bg-blue-700">
                    <Printer size={16} />
                    Print Landlord Statement
                </button>
            </div>

            <div className="overflow-x-auto">
                <table className="enterprise-table">
                    <thead>
                        <tr>
                            <th className="text-left">Month</th>
                            <th className="text-left">Opening Arrears</th>
                            <th className="text-left">Monthly Payable</th>
                            <th className="text-left">Total Due</th>
                            <th className="text-left">Deductions</th>
                            <th className="text-left">Reasons</th>
                            <th className="text-left">Amount Paid</th>
                            <th className="text-left">Arrears / Advance</th>
                            <th className="text-left">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {group.rows.map((row) => {
                            const balance = monthlyUnpaid(row);
                            const deductions =
                                Number(row.vacant_room_deductions ?? 0) +
                                Number(row.vacated_tenant_debt_deductions ?? 0) +
                                Number(row.advance_deductions ?? 0) +
                                Number(row.other_deductions ?? 0);
                            return (
                                <tr key={row.id}>
                                    <td className="font-black">{monthLabel(row.settlement_month)}</td>
                                    <td>{money(row.opening_arrears ?? 0)}</td>
                                    <td>{money(row.monthly_net_payable ?? row.net_payable)}</td>
                                    <td className="font-black">{money(row.monthly_net_payable ?? row.net_payable)}</td>
                                    <td className="font-bold text-red-700">{money(deductions)}</td>
                                    <td>
                                        <p className="text-xs font-bold text-slate-600">
                                            Commission {Number(row.commission_percentage ?? 0)}%; Empty room {money(row.vacant_room_deductions)}; Tenant vacated with balance {money(row.vacated_tenant_debt_deductions)}; Landlord advance {money(row.advance_deductions)}
                                        </p>
                                        {row.reasons_notes ? <p className="mt-1 text-xs text-slate-500">{row.reasons_notes}</p> : null}
                                    </td>
                                    <td className="font-bold text-emerald-700">{money(row.amount_paid)}</td>
                                    <td>
                                        <p className="font-black text-red-700">{money(balance)}</p>
                                        {Number(row.overpaid_amount ?? 0) > 0 ? <p className="text-xs font-black text-blue-700">Advance: {money(row.overpaid_amount)}</p> : null}
                                    </td>
                                    <td>
                                        <button onClick={() => openPayment(row)} className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-black text-white">
                                            Record Payment
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                    <tfoot className="bg-slate-100 font-black">
                        <tr>
                            <td>Total</td>
                            <td>{money(group.rows.reduce((total, row) => total + Number(row.opening_arrears ?? 0), 0))}</td>
                            <td>{money(group.totalPayable)}</td>
                            <td>{money(group.totalPayable)}</td>
                            <td />
                            <td />
                            <td>{money(group.totalPaid)}</td>
                            <td>{money(group.totalOutstanding)}</td>
                            <td />
                        </tr>
                    </tfoot>
                </table>
            </div>

            {paymentMessage ? <div className="mx-5 mt-5 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">{paymentMessage}</div> : null}
            {paymentTarget ? (
                <div className="m-5 rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div>
                            <p className="text-xs font-black uppercase tracking-wide text-emerald-700">Record Payment</p>
                            <h3 className="text-lg font-black text-slate-950">{group.landlordName} · {monthLabel(paymentTarget.settlement_month)}</h3>
                            <p className="text-sm font-bold text-slate-600">
                                Total payable: {money(payableSummary.totalOutstandingPayable)} · Already paid this month: {money(payableSummary.alreadyPaidAmount)} · Current month balance: {money(monthlyUnpaid(paymentTarget))}
                            </p>
                            <p className="text-xs font-bold text-slate-500">Payment clears oldest unpaid month first. Advance is created only after the full {money(payableSummary.totalOutstandingPayable)} genuine payable is cleared.</p>
                        </div>
                        <button onClick={() => setPaymentTarget(null)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">Cancel</button>
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
                        <StatementMetric label="Remaining Payable" value={money(payableSummary.totalOutstandingPayable)} />
                        <StatementMetric label="Normal Payment Portion" value={money(paymentPreview.normalPaymentAmount)} />
                        <StatementMetric label="Advance Portion" value={money(paymentPreview.advanceAmount)} />
                        <StatementMetric label="After Payment" value={money(Math.max(0, payableSummary.totalOutstandingPayable - numeric(paymentAmount)))} />
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
                        <input className="field" inputMode="numeric" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} placeholder="Amount paid" />
                        <select className="field" value={paymentMethod} onChange={(event) => {
                            const nextMethod = event.target.value;
                            setPaymentMethod(nextMethod);
                            const nextDetail = (group.approvedPaymentDetails ?? []).find((detail) => detail.paymentMethod === nextMethod && detail.isDefault)
                                ?? (group.approvedPaymentDetails ?? []).find((detail) => detail.paymentMethod === nextMethod)
                                ?? null;
                            setPaymentDetailId(nextDetail?.id ?? "");
                        }}>
                            <option value="cash">Cash</option>
                            <option value="mobile_money">Mobile Money</option>
                            <option value="bank">Bank</option>
                            <option value="cheque">Cheque</option>
                            <option value="manual">Manual</option>
                        </select>
                        {paymentMethod === "mobile_money" || paymentMethod === "bank" ? (
                            <select className="field" value={paymentDetailId} onChange={(event) => {
                                const detail = (group.approvedPaymentDetails ?? []).find((item) => item.id === event.target.value);
                                setPaymentDetailId(event.target.value);
                                if (detail) setPaymentMethod(detail.paymentMethod);
                            }}>
                                <option value="">Select saved method</option>
                                {(group.approvedPaymentDetails ?? [])
                                    .filter((detail) => detail.paymentMethod === paymentMethod)
                                    .map((detail) => (
                                        <option key={detail.id} value={detail.id}>
                                            {detail.label || detail.provider || detail.paymentMethod.replaceAll("_", " ")}{detail.isDefault ? " (Default)" : ""}
                                        </option>
                                    ))}
                            </select>
                        ) : null}
                        <input className="field" value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="Reference" />
                        <button disabled={isPending || !paymentAmount} onClick={recordPayment} className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">
                            {isPending ? "Recording..." : "Save Payment"}
                        </button>
                    </div>
                    {paymentMethod === "mobile_money" || paymentMethod === "bank" ? (
                        <ApprovedPaymentDetails detail={selectedPaymentDetail} method={paymentMethod} />
                    ) : null}
                </div>
            ) : null}

            <div className="m-5 rounded-3xl border-2 border-slate-900 bg-white p-6 text-slate-950 print:m-0 print:rounded-none print:border-slate-900 print:shadow-none">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-600">Printable landlord statement</p>
                <h3 className="mt-2 text-3xl font-black">{group.landlordName}</h3>
                <p className="text-sm font-bold text-slate-600">{group.officeName}</p>
                <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <StatementMetric label="Total Payable" value={money(group.totalPayable)} />
                    <StatementMetric label="Total Paid" value={money(group.totalPaid)} />
                    <StatementMetric label="Total Outstanding" value={money(group.totalOutstanding)} />
                </div>
                <div className="mt-5 space-y-3">
                    {group.rows.map((row) => (
                        <div key={row.id} className="rounded-2xl border border-slate-200 p-4">
                            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                <p className="font-black">{monthLabel(row.settlement_month)}</p>
                                <StatusChip label={row.status.replaceAll("_", " ")} tone={monthlyUnpaid(row) > 0 ? "orange" : "green"} />
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
                                <StatementLine label="Net Payable" value={money(row.net_payable)} />
                                <StatementLine label="Opening Arrears" value={money(row.opening_arrears ?? 0)} />
                                <StatementLine label="Current Month Payable" value={money(row.monthly_net_payable ?? row.net_payable)} />
                                <StatementLine label="Deductions" value={money(Number(row.vacant_room_deductions) + Number(row.vacated_tenant_debt_deductions) + Number(row.advance_deductions) + Number(row.other_deductions))} />
                                <StatementLine label="Reason" value={row.reasons_notes ?? "Monthly landlord payable"} />
                                <StatementLine label="Amount Paid" value={money(row.amount_paid)} />
                                <StatementLine label="Final Balance" value={money(monthlyUnpaid(row))} />
                                <StatementLine label="Advance Created" value={money(row.advance_created ?? row.overpaid_amount ?? 0)} />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

function PaidLandlordsSection({ payments }: { payments: PaidLandlordPayment[] }) {
    const totalPaid = payments.reduce((total, payment) => total + payment.amountPaid, 0);
    const statusMonth = monthLabel(payments[0]?.settlementMonth ?? new Date().toISOString().slice(0, 10));

    return (
        <section className="enterprise-panel overflow-hidden">
            <div className="border-b border-slate-200 p-5">
                <p className="text-xs font-black uppercase tracking-wide text-emerald-600">Paid Landlords</p>
                <h2 className="mt-1 text-xl font-black text-slate-950">Paid Landlords</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">Recorded landlord payment history from live payment records.</p>
            </div>
            {payments.length === 0 ? (
                <div className="p-6">
                    <EmptyState title="No landlord payments recorded yet" description="Once landlord payments are recorded, they will appear here with method, date, reference, and paid-by details." />
                </div>
            ) : (
                <div className="max-h-[520px] overflow-auto">
                    <table className="enterprise-table">
                        <thead>
                            <tr>
                                <th className="text-left">Landlord</th>
                                <th className="text-left">Office</th>
                                <th className="text-left">Month Paid</th>
                                <th className="text-left">{statusMonth} Status</th>
                                <th className="text-left">Net Payable</th>
                                <th className="text-left">Amount Paid</th>
                                <th className="text-left">Payment Method</th>
                                <th className="text-left">Payment Date</th>
                                <th className="text-left">Reference</th>
                                <th className="text-left">Paid By</th>
                            </tr>
                        </thead>
                        <tbody>
                            {payments.map((payment) => (
                                <tr key={payment.id}>
                                    <td className="font-black text-slate-950">{payment.landlordName}</td>
                                    <td>{payment.officeName}</td>
                                    <td>{monthLabel(payment.settlementMonth)}</td>
                                    <td><StatusChip label={`${monthLabel(payment.settlementMonth)} Paid`} tone="green" /></td>
                                    <td className="whitespace-normal break-words">{money(payment.netPayable)}</td>
                                    <td className="whitespace-normal break-words font-black text-emerald-700">{money(payment.amountPaid)}</td>
                                    <td>{payment.paymentMethod.replaceAll("_", " ")}</td>
                                    <td>{payment.paymentDate ? new Date(payment.paymentDate).toLocaleString("en-UG") : "Not recorded"}</td>
                                    <td>{payment.reference ?? "No reference"}</td>
                                    <td className="max-w-44 break-all text-xs font-bold text-slate-500">{payment.paidBy ?? "System"}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="sticky bottom-0 border-t border-slate-300 bg-slate-100 font-black">
                            <tr>
                                <td>Total</td>
                                <td />
                                <td />
                                <td />
                                <td />
                                <td className="whitespace-normal break-words text-emerald-700">{money(totalPaid)}</td>
                                <td />
                                <td />
                                <td />
                                <td />
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}
        </section>
    );
}

function RecoveryDeductionsSection({ groups }: { groups: LandlordPayableGroup[] }) {
    const rows = groups.flatMap((group) => group.rows
        .filter((row) => Number(row.vacated_tenant_debt_deductions ?? 0) > 0 && (Number(row.unpaid_balance ?? 0) > 0 || String(row.status ?? "").toLowerCase() === "unpaid"))
        .map((row) => ({ group, row })));
    const totalRecovery = rows.reduce((total, item) => total + Number(item.row.vacated_tenant_debt_deductions ?? 0), 0);

    return (
        <section className="enterprise-panel overflow-hidden">
            <div className="border-b border-slate-200 p-5">
                <p className="text-xs font-black uppercase tracking-wide text-purple-600">Recovery Deductions</p>
                <h2 className="mt-1 text-xl font-black text-slate-950">Recovery Ledger</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">Tenant-debt recovery deducted from landlord payable records.</p>
            </div>
            {rows.length === 0 ? (
                <div className="p-6">
                    <EmptyState title="No recovery deductions this month" description="Vacated tenant debt deductions will appear here when they affect landlord payables." />
                </div>
            ) : (
                <div className="max-h-[460px] overflow-auto">
                    <table className="enterprise-table">
                        <thead>
                            <tr>
                                <th className="text-left">Landlord</th>
                                <th className="text-left">Office</th>
                                <th className="text-left">Month</th>
                                <th className="text-left">Recovery Deduction</th>
                                <th className="text-left">Reason</th>
                                <th className="text-left">Net Payable</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(({ group, row }) => (
                                <tr key={row.id}>
                                    <td className="font-black text-slate-950">{group.landlordName}</td>
                                    <td>{group.officeName}</td>
                                    <td>{monthLabel(row.settlement_month)}</td>
                                    <td className="whitespace-normal break-words font-black text-purple-700">{money(row.vacated_tenant_debt_deductions)}</td>
                                    <td className="max-w-xl text-xs font-bold text-slate-600">{row.reasons_notes ?? "Tenant vacated with unpaid balance"}</td>
                                    <td className="whitespace-normal break-words">{money(row.net_payable)}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="sticky bottom-0 border-t border-slate-300 bg-slate-100 font-black">
                            <tr>
                                <td>Total Recovery</td>
                                <td />
                                <td />
                                <td className="whitespace-normal break-words text-purple-700">{money(totalRecovery)}</td>
                                <td />
                                <td />
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}
        </section>
    );
}

function LandlordAdvancesReport({
    groups,
    selectedId,
    onSelect,
    canManage,
}: {
    groups: LandlordAdvanceGroup[];
    selectedId: string;
    onSelect: (id: string) => void;
    canManage: boolean;
}) {
    return (
        <section className="enterprise-panel overflow-hidden">
            <div className="border-b border-slate-200 p-5">
                <p className="text-xs font-black uppercase tracking-wide text-indigo-600">Landlord Advances</p>
                <h2 className="mt-1 text-xl font-black text-slate-950">Landlords With Advances</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">Click a landlord to view all advances, deductions, and remaining balance.</p>
            </div>
            {groups.length === 0 ? (
                <div className="p-6">
                    <EmptyState title="No landlord advances recorded yet" description={canManage ? "Use Add Landlord Advance below to record an advance." : "No office landlord advances are currently active."} />
                </div>
            ) : (
                <div className="max-h-[560px] overflow-auto">
                    <table className="enterprise-table">
                        <thead>
                            <tr>
                                <th className="text-left">Landlord</th>
                                <th className="text-left">Office</th>
                                <th className="text-left">Advanced</th>
                                <th className="text-left">Remaining</th>
                                <th className="text-left">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {groups.map((group) => (
                                <tr key={group.landlordId} onClick={() => onSelect(group.landlordId)} className={`cursor-pointer ${group.landlordId === selectedId ? "bg-indigo-50" : ""}`}>
                                    <td className="font-black text-slate-950">{group.landlordName}</td>
                                    <td>{group.officeName}</td>
                                    <td>{money(group.totalAdvanced)}</td>
                                    <td className="font-black text-amber-700">{money(group.remainingBalance)}</td>
                                    <td><StatusChip label={group.status.replaceAll("_", " ")} tone={group.remainingBalance > 0 ? "orange" : "green"} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}

function LandlordAdvanceDetails({
    group,
    canManage,
    setMessage,
}: {
    group: LandlordAdvanceGroup | null;
    canManage: boolean;
    setMessage: (message: string) => void;
}) {
    const [isPending, startTransition] = useTransition();
    const [editingAdvanceId, setEditingAdvanceId] = useState("");
    const [editForm, setEditForm] = useState({
        monthlyDeductionAmount: "",
        interestType: "none" as AdvanceInterestType,
        interestValue: "",
        repaymentMonths: "",
        reason: "",
    });

    function deductAdvance(advanceId: string) {
        setMessage("");
        startTransition(async () => {
            try {
                await markLandlordAdvanceDeducted({ advanceId });
                setMessage("Advance deduction recorded. Remaining balance will refresh.");
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Unable to deduct advance.");
            }
        });
    }

    function pauseAdvance(advanceId: string) {
        setMessage("");
        startTransition(async () => {
            try {
                await pauseLandlordAdvance({ advanceId, reason: "Paused from Landlord Payments control panel." });
                setMessage("Advance repayment paused.");
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Unable to pause advance.");
            }
        });
    }

    function resumeAdvance(advanceId: string) {
        setMessage("");
        startTransition(async () => {
            try {
                await resumeLandlordAdvance({ advanceId, note: "Resumed from Landlord Payments control panel." });
                setMessage("Advance repayment resumed.");
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Unable to resume advance.");
            }
        });
    }

    function clearEarly(advanceId: string) {
        setMessage("");
        startTransition(async () => {
            try {
                await settleLandlordAdvanceEarly({ advanceId, policy: "collect_remaining_balance", reason: "Early settlement from Landlord Payments control panel." });
                setMessage("Advance cleared early and future deductions stopped.");
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Unable to clear advance early.");
            }
        });
    }

    function clearPrincipal(advanceId: string) {
        setMessage("");
        startTransition(async () => {
            try {
                await clearLandlordAdvancePrincipal({
                    advanceId,
                    clearanceMethod: "cleared_manually",
                    notes: "Principal cleared from Landlord Payments control panel.",
                });
                setMessage("Principal cleared and advance status refreshed.");
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Unable to clear principal.");
            }
        });
    }

    function startEdit(advance: LandlordAdvanceGroup["advances"][number]) {
        setEditingAdvanceId(advance.id);
        setEditForm({
            monthlyDeductionAmount: String(advance.monthly_deduction_amount ?? ""),
            interestType: (String(advance.interest_type ?? "none") as AdvanceInterestType),
            interestValue: String(advance.interest_type === "percentage" ? advance.interest_rate ?? "" : advance.interest_amount ?? ""),
            repaymentMonths: "",
            reason: "",
        });
    }

    function savePlanRevision(advanceId: string) {
        setMessage("");
        startTransition(async () => {
            try {
                await editLandlordAdvanceRepaymentPlan({
                    advanceId,
                    interestType: editForm.interestType,
                    interestValue: Number(editForm.interestValue || 0),
                    monthlyDeductionAmount: Number(editForm.monthlyDeductionAmount || 0),
                    repaymentMonths: editForm.repaymentMonths ? Number(editForm.repaymentMonths) : null,
                    reason: editForm.reason || "Repayment plan revised from Landlord Payments.",
                });
                setEditingAdvanceId("");
                setMessage("Repayment plan revised and schedule regenerated.");
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Unable to revise repayment plan.");
            }
        });
    }

    if (!group) {
        return (
            <section className="enterprise-panel p-6">
                <EmptyState title="No advance selected" description="Select a landlord advance record to view deductions and next recovery month." />
            </section>
        );
    }

    return (
        <section className="enterprise-panel overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-slate-200 p-5 md:flex-row md:items-start md:justify-between">
                <div>
                    <p className="text-xs font-black uppercase tracking-wide text-indigo-600">Advance Details</p>
                    <h2 className="mt-1 text-xl font-black text-slate-950">{group.landlordName}</h2>
                    <p className="mt-1 text-sm font-semibold text-slate-500">{group.officeName} · next deduction {monthLabel(group.nextDeductionMonth)}</p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                    <MiniMetric icon={<WalletCards size={15} />} label="Advanced" value={money(group.totalAdvanced)} />
                    <MiniMetric icon={<BanknoteArrowDown size={15} />} label="Deducted" value={money(group.totalDeducted)} />
                    <MiniMetric icon={<Landmark size={15} />} label="Remaining" value={money(group.remainingBalance)} />
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="enterprise-table">
                    <thead>
                        <tr>
                            <th className="text-left">Date Given</th>
                            <th className="text-left">Reason / Note</th>
                            <th className="text-left">Principal</th>
                            <th className="text-left">Interest</th>
                            <th className="text-left">Total Repayable</th>
                            <th className="text-left">Plan</th>
                            <th className="text-left">Deducted</th>
                            <th className="text-left">Remaining</th>
                            <th className="text-left">Status</th>
                            <th className="text-left">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {group.advances.map((advance) => {
                            const advanceRecord = advance as unknown as Record<string, unknown>;
                            const totalRepayable = advanceTotal(advanceRecord);
                            const repaid = numeric(advance.deducted_amount);
                            const remaining = advanceRemaining(advanceRecord);
                            const progress = totalRepayable > 0 ? Math.min(100, Math.round((repaid / totalRepayable) * 100)) : 0;
                            const isPaused = String(advance.lifecycle_status ?? "") === "paused";
                            const isCleared = remaining <= 0 || ["fully_deducted", "cleared"].includes(String(advance.status ?? advance.lifecycle_status ?? ""));
                            return (
                            <tr key={advance.id}>
                                <td className="font-bold">
                                    <p>{advance.date_given}</p>
                                    <p className="text-[10px] font-black uppercase text-slate-400">Rev {advance.revision_number ?? 1}</p>
                                </td>
                                <td>
                                    <p className="font-bold text-slate-800">{advance.reason ?? "Landlord advance"}</p>
                                    {advance.note ? <p className="text-xs text-slate-500">{advance.note}</p> : null}
                                    <div className="mt-2 h-2 w-40 overflow-hidden rounded-full bg-slate-200">
                                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${progress}%` }} />
                                    </div>
                                    <p className="mt-1 text-[10px] font-black uppercase text-slate-400">{progress}% complete · actual end {dateLabel(advance.actual_cleared_date)}</p>
                                </td>
                                <td>
                                    <p>{money(advance.principal_amount ?? advance.advance_amount)}</p>
                                    <p className="text-[10px] font-black uppercase text-slate-400">Open {money(advance.remaining_principal_balance ?? 0)}</p>
                                </td>
                                <td>
                                    <p>{money(advance.interest_amount ?? 0)}</p>
                                    <p className="text-[10px] font-black uppercase text-slate-400">{String(advance.interest_calculation_mode ?? advance.interest_type ?? "none").replaceAll("_", " ")}</p>
                                    <p className="text-[10px] font-black uppercase text-slate-400">Open {money(advance.remaining_interest_balance ?? 0)}</p>
                                </td>
                                <td className="font-black">{money(totalRepayable)}</td>
                                <td>
                                    <p className="font-bold capitalize">{String(advance.payment_plan ?? "one_time").replaceAll("_", " ")}</p>
                                    <p className="text-[10px] font-black uppercase text-slate-400">{money(advance.monthly_deduction_amount ?? remaining)} / month</p>
                                    <p className="text-[10px] font-black uppercase text-slate-400">Ends {dateLabel(advance.expected_end_date)}</p>
                                </td>
                                <td>{money(advance.deducted_amount)}</td>
                                <td className="font-black text-amber-700">{money(remaining)}</td>
                                <td><StatusChip label={isPaused ? "paused" : String(advance.lifecycle_status ?? advance.status).replaceAll("_", " ")} tone={isCleared ? "green" : isPaused ? "orange" : "blue"} /></td>
                                <td>
                                    <div className="flex min-w-[220px] flex-wrap gap-2">
                                        <button disabled={!canManage || isPending || isPaused || isCleared} onClick={() => deductAdvance(advance.id)} className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40">
                                            {isPending ? "Saving..." : "Deduct Now"}
                                        </button>
                                        {isPaused ? (
                                            <button disabled={!canManage || isPending || isCleared} onClick={() => resumeAdvance(advance.id)} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-40">Resume</button>
                                        ) : (
                                            <button disabled={!canManage || isPending || isCleared} onClick={() => pauseAdvance(advance.id)} className="rounded-xl bg-amber-500 px-3 py-2 text-xs font-black text-white disabled:opacity-40">Pause</button>
                                        )}
                                        <button disabled={!canManage || isPending || isCleared} onClick={() => clearEarly(advance.id)} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white disabled:opacity-40">Clear Early</button>
                                        <button disabled={!canManage || isPending || isCleared || Number(advance.remaining_principal_balance ?? 0) <= 0} onClick={() => clearPrincipal(advance.id)} className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-black text-white disabled:opacity-40">Clear Principal</button>
                                        <button disabled={!canManage || isPending || isCleared} onClick={() => startEdit(advance)} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-40">Edit Plan</button>
                                    </div>
                                    {editingAdvanceId === advance.id ? (
                                        <div className="mt-3 grid min-w-[360px] grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                            <select className="field" value={editForm.interestType} onChange={(event) => setEditForm((current) => ({ ...current, interestType: event.target.value as AdvanceInterestType }))}>
                                                <option value="none">No interest</option>
                                                <option value="fixed">Fixed interest</option>
                                                <option value="percentage">Percentage interest</option>
                                            </select>
                                            <input className="field" placeholder={editForm.interestType === "percentage" ? "Interest %" : "Interest amount"} value={editForm.interestValue} onChange={(event) => setEditForm((current) => ({ ...current, interestValue: event.target.value }))} />
                                            <input className="field" placeholder="Monthly deduction" value={editForm.monthlyDeductionAmount} onChange={(event) => setEditForm((current) => ({ ...current, monthlyDeductionAmount: event.target.value }))} />
                                            <input className="field" placeholder="Months optional" value={editForm.repaymentMonths} onChange={(event) => setEditForm((current) => ({ ...current, repaymentMonths: event.target.value }))} />
                                            <input className="field col-span-2" placeholder="Reason / audit note" value={editForm.reason} onChange={(event) => setEditForm((current) => ({ ...current, reason: event.target.value }))} />
                                            <button onClick={() => savePlanRevision(advance.id)} disabled={isPending} className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white disabled:opacity-40">Save Revision</button>
                                            <button onClick={() => setEditingAdvanceId("")} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-black text-slate-700">Cancel</button>
                                        </div>
                                    ) : null}
                                </td>
                            </tr>
                        );})}
                    </tbody>
                </table>
            </div>
            <div className="border-t border-slate-200 p-5 text-sm font-bold text-slate-600">
                Linked landlord payment report: generate or print the monthly ledger above after settlement generation to see advance deductions on the landlord statement.
            </div>
        </section>
    );
}

function AddAdvancePanel({ data, setMessage }: { data: LandlordPayablesData; setMessage: (message: string) => void }) {
    const firstLandlord = data.landlords[0];
    const firstOffice = data.offices[0];
    const [form, setForm] = useState({
        landlordId: firstLandlord?.id ?? "",
        officeId: firstLandlord?.officeId ?? firstOffice?.id ?? "",
        principalAmount: "",
        repaymentType: "simple_advance" as AdvanceRepaymentType,
        interestMode: "none" as AdvanceInterestMode,
        interestType: "none" as AdvanceInterestType,
        interestValue: "",
        fixedInterestAmount: "",
        dateGiven: new Date().toISOString().slice(0, 10),
        deductionStartDate: new Date().toISOString().slice(0, 10),
        deductionEndDate: "",
        paymentPlan: "one_time" as AdvancePaymentPlan,
        principalClearanceMethod: "deducted_monthly" as PrincipalClearanceMethod,
        monthlyDeductionAmount: "",
        reason: "",
        note: "",
    });
    const [isPending, startTransition] = useTransition();
    const preview = useMemo(() => calculateLandlordAdvancePlan({
        principalAmount: Number(form.principalAmount),
        repaymentType: form.repaymentType,
        interestMode: form.interestMode,
        interestType: form.interestType,
        interestValue: Number(form.interestValue || 0),
        interestRate: Number(form.interestValue || 0),
        fixedInterestAmount: Number(form.fixedInterestAmount || 0),
        paymentPlan: form.paymentPlan,
        monthlyDeductionAmount: Number(form.monthlyDeductionAmount || 0),
        deductionStartDate: form.deductionStartDate || form.dateGiven,
        deductionEndDate: form.deductionEndDate || null,
        principalClearanceMethod: form.principalClearanceMethod,
    }), [form.deductionEndDate, form.deductionStartDate, form.dateGiven, form.fixedInterestAmount, form.interestMode, form.interestType, form.interestValue, form.monthlyDeductionAmount, form.paymentPlan, form.principalAmount, form.principalClearanceMethod, form.repaymentType]);

    function save() {
        setMessage("");
        startTransition(async () => {
            try {
                await addLandlordAdvance({
                    landlordId: form.landlordId,
                    officeId: form.officeId,
                    principalAmount: Number(form.principalAmount),
                    repaymentType: form.repaymentType,
                    interestMode: form.interestMode,
                    interestType: form.interestType,
                    interestValue: Number(form.interestValue || 0),
                    interestRate: Number(form.interestValue || 0),
                    fixedInterestAmount: Number(form.fixedInterestAmount || 0),
                    dateGiven: form.dateGiven,
                    deductionStartDate: form.deductionStartDate,
                    deductionEndDate: form.deductionEndDate || null,
                    paymentPlan: form.paymentPlan,
                    principalClearanceMethod: form.principalClearanceMethod,
                    monthlyDeductionAmount: Number(form.monthlyDeductionAmount || 0),
                    reason: form.reason || null,
                    note: form.note || null,
                });
                setMessage("Landlord advance recorded with repayment schedule.");
                setForm((current) => ({ ...current, principalAmount: "", interestValue: "", fixedInterestAmount: "", monthlyDeductionAmount: "", deductionEndDate: "", reason: "", note: "" }));
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Unable to add landlord advance.");
            }
        });
    }

    return (
        <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-xl">
            <div className="border-b border-slate-200 bg-slate-950 p-5 text-white">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/20 text-blue-200 ring-1 ring-blue-300/30">
                            <Plus size={20} />
                        </div>
                        <div>
                            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-200">Landlord Advance / Loan Agreement</p>
                            <h2 className="text-xl font-black">Create a recovery plan</h2>
                            <p className="mt-1 text-sm font-semibold text-slate-300">A simple guided form that shows what will be recovered, when it starts, and how it affects landlord payable.</p>
                        </div>
                    </div>
                    <StatusChip label="Live calculator" tone="blue" />
                </div>
            </div>

            <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_440px]">
                <div className="space-y-4 p-5">
                    <StepPanel step="1" title="Select Landlord" subtitle="Choose who received the money and the office responsible.">
                        <div className="grid gap-3 md:grid-cols-3">
                            <FieldBlock label="Landlord">
                                <select value={form.landlordId} onChange={(event) => {
                                    const landlord = data.landlords.find((item) => item.id === event.target.value);
                                    setForm((current) => ({ ...current, landlordId: event.target.value, officeId: landlord?.officeId ?? current.officeId }));
                                }} className="field">
                                    {data.landlords.map((landlord) => <option key={landlord.id} value={landlord.id}>{landlord.name} - {landlord.officeName}</option>)}
                                </select>
                            </FieldBlock>
                            <FieldBlock label="Office">
                                <select value={form.officeId} onChange={(event) => setForm((current) => ({ ...current, officeId: event.target.value }))} className="field">
                                    {data.offices.map((office) => <option key={office.id} value={office.id}>{office.name}</option>)}
                                </select>
                            </FieldBlock>
                            <FieldBlock label="Amount Given">
                                <input className="field" inputMode="numeric" placeholder="UGX amount" value={form.principalAmount} onChange={(event) => setForm((current) => ({ ...current, principalAmount: event.target.value }))} />
                            </FieldBlock>
                        </div>
                    </StepPanel>

                    <StepPanel step="2" title="Choose Repayment Type" subtitle="Pick the agreement style in plain business terms.">
                        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
                            <ModeButton active={form.repaymentType === "simple_advance"} title="Simple" detail="Deduct the amount given." onClick={() => setForm((current) => ({ ...current, repaymentType: "simple_advance", interestMode: "none", paymentPlan: "one_time", principalClearanceMethod: "deducted_monthly" }))} />
                            <ModeButton active={form.repaymentType === "principal_fixed_interest"} title="Fixed Interest" detail="Interest is known upfront." onClick={() => setForm((current) => ({ ...current, repaymentType: "principal_fixed_interest", interestMode: "fixed_principal", paymentPlan: "monthly", principalClearanceMethod: "deducted_monthly" }))} />
                            <ModeButton active={form.repaymentType === "declining_balance_interest"} title="Reducing Balance" detail="Interest falls as balance falls." onClick={() => setForm((current) => ({ ...current, repaymentType: "declining_balance_interest", interestMode: "declining_balance", paymentPlan: "monthly", principalClearanceMethod: "deducted_monthly" }))} />
                            <ModeButton active={form.repaymentType === "interest_only"} title="Interest Only" detail="Deduct interest; principal stays open." onClick={() => setForm((current) => ({ ...current, repaymentType: "interest_only", interestMode: "interest_only", paymentPlan: "monthly", principalClearanceMethod: "cleared_manually" }))} />
                            <ModeButton active={form.repaymentType === "custom"} title="Custom" detail="Use custom agreement terms." onClick={() => setForm((current) => ({ ...current, repaymentType: "custom", paymentPlan: "custom" }))} />
                        </div>
                    </StepPanel>

                    <StepPanel step="3" title="Interest And Recovery Terms" subtitle="Use an end date or monthly amount. The system calculates the other side.">
                        <div className="grid gap-3 md:grid-cols-4">
                            <FieldBlock label="Interest Mode">
                                <select className="field" value={form.interestMode} onChange={(event) => setForm((current) => ({ ...current, interestMode: event.target.value as AdvanceInterestMode }))}>
                                    <option value="none">No interest</option>
                                    <option value="fixed_principal">Fixed principal interest</option>
                                    <option value="declining_balance">Declining balance interest</option>
                                    <option value="interest_only">Interest-only</option>
                                </select>
                            </FieldBlock>
                            <FieldBlock label="Interest Entry">
                                <select className="field" value={form.interestType} onChange={(event) => setForm((current) => ({ ...current, interestType: event.target.value as AdvanceInterestType, interestValue: event.target.value === "none" ? "" : current.interestValue }))}>
                                    <option value="none">No interest</option>
                                    <option value="fixed">Fixed amount</option>
                                    <option value="percentage">Percentage</option>
                                </select>
                            </FieldBlock>
                            <FieldBlock label={form.interestType === "percentage" ? "Interest Rate" : "Interest Charged"}>
                                <input className="field" inputMode="numeric" placeholder={form.interestType === "percentage" ? "Example: 10" : "UGX amount"} value={form.interestValue} disabled={form.interestType === "none"} onChange={(event) => setForm((current) => ({ ...current, interestValue: event.target.value }))} />
                            </FieldBlock>
                            <FieldBlock label="Principal Rule">
                                <select className="field" value={form.principalClearanceMethod} onChange={(event) => setForm((current) => ({ ...current, principalClearanceMethod: event.target.value as PrincipalClearanceMethod }))}>
                                    <option value="deducted_monthly">Deduct monthly</option>
                                    <option value="paid_separately">Paid separately</option>
                                    <option value="cleared_manually">Clear manually</option>
                                </select>
                            </FieldBlock>
                        </div>
                    </StepPanel>

                    <StepPanel step="4" title="Choose Dates Or Monthly Deduction" subtitle="Enter an end date to calculate the monthly deduction, or enter monthly deduction to calculate the finish month.">
                        <div className="grid gap-3 md:grid-cols-5">
                            <FieldBlock label="Agreement Date">
                                <input className="field" type="date" value={form.dateGiven} onChange={(event) => setForm((current) => ({ ...current, dateGiven: event.target.value }))} />
                            </FieldBlock>
                            <FieldBlock label="Starts From">
                                <input className="field" type="date" value={form.deductionStartDate} onChange={(event) => setForm((current) => ({ ...current, deductionStartDate: event.target.value }))} />
                            </FieldBlock>
                            <FieldBlock label="Expected To Finish">
                                <input className="field" type="date" value={form.deductionEndDate} onChange={(event) => setForm((current) => ({ ...current, deductionEndDate: event.target.value }))} />
                            </FieldBlock>
                            <FieldBlock label="Recovery Style">
                                <select className="field" value={form.paymentPlan} onChange={(event) => setForm((current) => ({ ...current, paymentPlan: event.target.value as AdvancePaymentPlan }))}>
                                    <option value="one_time">One-time</option>
                                    <option value="monthly">Monthly</option>
                                    <option value="custom">Custom</option>
                                </select>
                            </FieldBlock>
                            <FieldBlock label="Deduct Every Month">
                                <input className="field" inputMode="numeric" placeholder="UGX amount" value={form.monthlyDeductionAmount} onChange={(event) => setForm((current) => ({ ...current, monthlyDeductionAmount: event.target.value }))} disabled={form.paymentPlan === "one_time"} />
                            </FieldBlock>
                        </div>
                    </StepPanel>

                    <StepPanel step="5" title="Agreement Notes" subtitle="Keep the reason simple enough for future review.">
                        <div className="grid gap-3 md:grid-cols-3">
                            <FieldBlock label="Reason">
                                <input className="field" placeholder="Why was this money given?" value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} />
                            </FieldBlock>
                            <div className="md:col-span-2">
                                <FieldBlock label="Notes / Agreement Terms">
                                    <textarea className="field min-h-20" placeholder="Any special repayment terms, receipt reference, or approval notes" value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} />
                                </FieldBlock>
                            </div>
                        </div>
                    </StepPanel>
                </div>

                <aside className="border-t border-slate-200 bg-slate-50 p-5 xl:border-l xl:border-t-0">
                    <div className="sticky top-24 space-y-4">
                        <div className="rounded-3xl border border-blue-100 bg-white p-4 shadow-sm">
                            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-blue-700">AI Calculation Review</p>
                            <h3 className="mt-1 text-lg font-black text-slate-950">What will happen?</h3>
                            <div className="mt-4 grid grid-cols-2 gap-2">
                                <PreviewMetric label="Amount Given" value={money(preview.principalAmount)} />
                                <PreviewMetric label="Interest Charged" value={money(preview.interestAmount)} />
                                <PreviewMetric label="Total To Recover" value={money(preview.totalRepayable)} />
                                <PreviewMetric label="Deduct Monthly" value={money(preview.monthlyDeductionAmount)} />
                                <PreviewMetric label="Starts From" value={dateLabel(preview.deductionStartDate)} />
                                <PreviewMetric label="Expected Finish" value={dateLabel(preview.expectedEndDate)} />
                                <PreviewMetric label="Principal Balance" value={money(preview.remainingPrincipalBalance)} />
                                <PreviewMetric label="Interest Balance" value={money(preview.remainingInterestBalance)} />
                            </div>
                            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3">
                                <p className="text-[11px] font-black uppercase text-amber-700">Net Payable Impact</p>
                                <p className="mt-1 text-sm font-bold text-slate-800">Each scheduled month reduces landlord payable by <span className="font-black">{money(preview.monthlyDeductionAmount)}</span>, unless the payable is smaller.</p>
                            </div>
                        </div>

                        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Repayment Timeline</p>
                                    <h3 className="text-lg font-black text-slate-950">{preview.numberOfMonths || 0} month plan</h3>
                                </div>
                                <StatusChip label={preview.schedule.length ? "Ready" : "Enter amount"} tone={preview.schedule.length ? "green" : "orange"} />
                            </div>
                            <div className="mt-4 max-h-[420px] overflow-auto rounded-2xl border border-slate-200">
                                <table className="w-full min-w-[720px] text-xs">
                                    <thead className="sticky top-0 bg-slate-950 text-white">
                                        <tr>
                                            <th className="px-3 py-2 text-left">Month</th>
                                            <th className="px-3 py-2 text-left">Opening Balance</th>
                                            <th className="px-3 py-2 text-left">Interest</th>
                                            <th className="px-3 py-2 text-left">Deduction</th>
                                            <th className="px-3 py-2 text-left">Principal Paid</th>
                                            <th className="px-3 py-2 text-left">Interest Paid</th>
                                            <th className="px-3 py-2 text-left">Balance Remaining</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {preview.schedule.map((row) => (
                                            <tr key={row.month} className="border-t border-slate-100">
                                                <td className="px-3 py-2 font-black">{monthLabel(row.month)}</td>
                                                <td className="px-3 py-2">{money(row.openingPrincipalBalance)}</td>
                                                <td className="px-3 py-2">{money(row.interestCharged)}</td>
                                                <td className="px-3 py-2 font-black text-blue-700">{money(row.scheduledDeduction)}</td>
                                                <td className="px-3 py-2">{money(row.principalPortion)}</td>
                                                <td className="px-3 py-2">{money(row.interestPortion)}</td>
                                                <td className="px-3 py-2 font-black">{money(row.remainingTotalBalance)}</td>
                                            </tr>
                                        ))}
                                        {preview.schedule.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} className="px-3 py-8 text-center text-sm font-bold text-slate-500">Enter the amount given to generate the recovery timeline.</td>
                                            </tr>
                                        ) : null}
                                    </tbody>
                                </table>
                            </div>
                            <button disabled={isPending || !form.landlordId || !form.officeId || !form.principalAmount} onClick={save} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                                {isPending ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                                Save Advance Agreement
                            </button>
                        </div>
                    </div>
                </aside>
            </div>
        </section>
    );
}

function PreviewMetric({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl border border-blue-100 bg-white px-3 py-2">
            <p className="text-[10px] font-black uppercase text-slate-500">{label}</p>
            <p className="mt-1 text-sm font-black text-slate-950">{value}</p>
        </div>
    );
}

function StepPanel({ step, title, subtitle, children }: { step: string; title: string; subtitle: string; children: ReactNode }) {
    return (
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-xs font-black text-white">{step}</div>
                <div>
                    <h3 className="text-sm font-black text-slate-950">{title}</h3>
                    <p className="mt-0.5 text-xs font-semibold text-slate-500">{subtitle}</p>
                </div>
            </div>
            {children}
        </div>
    );
}

function FieldBlock({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="block">
            <span className="mb-1 block text-[11px] font-black uppercase tracking-wide text-slate-500">{label}</span>
            {children}
        </label>
    );
}

function ModeButton({ active, title, detail, onClick }: { active: boolean; title: string; detail: string; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`min-h-[92px] rounded-2xl border p-3 text-left transition ${active ? "border-blue-500 bg-blue-50 shadow-sm ring-2 ring-blue-100" : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white"}`}
        >
            <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-black text-slate-950">{title}</p>
                <span className={`h-2.5 w-2.5 rounded-full ${active ? "bg-blue-600" : "bg-slate-300"}`} />
            </div>
            <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">{detail}</p>
        </button>
    );
}

function MiniMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="flex items-center justify-center gap-1 text-slate-500">{icon}<span className="text-[10px] font-black uppercase">{label}</span></div>
            <p className="mt-1 text-xs font-black text-slate-950">{value}</p>
        </div>
    );
}

function StatementMetric({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-slate-300 bg-slate-50 p-4">
            <p className="text-xs font-black uppercase text-slate-500">{label}</p>
            <p className="mt-1 text-xl font-black text-slate-950">{value}</p>
        </div>
    );
}

function StatementLine({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <p className="text-xs font-black uppercase text-slate-500">{label}</p>
            <p className="mt-1 font-bold text-slate-950">{value}</p>
        </div>
    );
}
