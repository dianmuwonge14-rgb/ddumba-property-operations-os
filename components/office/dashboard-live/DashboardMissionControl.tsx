"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarClock, CheckCircle2, CircleDollarSign, RefreshCw, Target } from "lucide-react";
import { runMonthlyRentRollover } from "@/app/actions/tenant-ledger";
import { EnterpriseKpiCard, EmptyState, PageHero, StatusChip } from "@/components/office/shared/EnterpriseUI";
import type { DashboardLiveData, OfficeLeagueRow } from "@/lib/dashboard-live/types";

type Props = {
    data: DashboardLiveData;
};

function money(value: number) {
    return `UGX ${Math.round(value).toLocaleString()}`;
}

function formatSyncedAt(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const day = date.getDate();
    const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][date.getMonth()];
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${day} ${month} ${year} ${hours}:${minutes}`;
}

export default function DashboardMissionControl({ data }: Props) {
    const bestOffice = data.league[0] ?? null;
    const lastSynced = formatSyncedAt(data.lastSyncedAt);

    return (
        <main className="enterprise-page">
            <div className="enterprise-shell">
                <PageHero
                    title="Mission Control"
                    subtitle={`${data.company?.name ?? "Company"} · live cash, collections, portfolio, workforce, and office score intelligence`}
                    badge="Live Executive Command"
                >
                    <div className="enterprise-card min-w-72 p-5">
                        <p className="text-sm font-bold text-slate-500">Best Office</p>
                        <div className="mt-2 flex items-center justify-between gap-4">
                            <div>
                                <p className="text-xl font-black text-slate-950">{bestOffice?.officeName ?? "No office"}</p>
                                <p className="text-xs text-slate-500">Ranked by balanced score</p>
                            </div>
                            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-950 text-xl font-black text-white">
                                {bestOffice?.rank ?? "-"}
                            </span>
                        </div>
                    </div>
                </PageHero>

                <section className="mb-5 flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                        <StatusChip label="Live Supabase" tone="green" />
                        <span className="text-sm font-bold text-slate-600">Period: {data.period.label}</span>
                        <span className="text-xs text-slate-400">Last synced {lastSynced}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <a className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-100" href="/office?period=today">Today</a>
                        <a className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-100" href="/office">This Month</a>
                        <a className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-100" href={`/office?startDate=${data.period.startDate}&endDate=${data.period.endDate}`}>Custom Range</a>
                    </div>
                </section>

                {data.warnings.length > 0 ? (
                    <section className="mb-5 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                        <p className="font-black">Live data warnings</p>
                        <p className="mt-1">{data.warnings.slice(0, 3).join(" · ")}</p>
                    </section>
                ) : null}

                <RentCalendarPanel data={data} />

                <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5">
                    <EnterpriseKpiCard title="Office Rent Roll" value={money(data.finance.expectedRentRoll)} tone="blue" trend="flat" trendLabel="live rooms" progress={data.finance.collectionProgress} />
                    <EnterpriseKpiCard title="Office Commission / Expected Profit" value={money(data.finance.expectedCompanyCommissionProfit)} tone="green" trend="flat" trendLabel="commission rules" progress={80} />
                    <EnterpriseKpiCard title="Amount Collected" value={money(data.finance.collectedSoFarThisMonth)} tone="green" trend="up" trendLabel="approved payments" progress={data.finance.collectionProgress} />
                    <EnterpriseKpiCard title="Landlords Paid" value={data.finance.landlordsPaid.toLocaleString()} tone="blue" trend="flat" trendLabel={money(data.finance.landlordPaymentsMade)} progress={data.finance.landlordsPaid ? 75 : 0} />
                    <EnterpriseKpiCard title="Landlords Not Paid" value={data.finance.landlordsNotPaid.toLocaleString()} tone={data.finance.landlordsNotPaid ? "red" : "green"} trend={data.finance.landlordsNotPaid ? "down" : "up"} trendLabel={money(data.finance.totalAmountNotPaidToLandlords)} progress={data.finance.landlordsNotPaid ? 40 : 100} />
                    <EnterpriseKpiCard title="Landlord Advances Given" value={money(data.finance.landlordAdvancesGiven)} tone="purple" trend="flat" trendLabel={`${money(data.finance.landlordAdvanceActiveBalance)} active`} progress={data.finance.landlordAdvancesGiven ? Math.max(5, Math.min(100, Math.round((data.finance.landlordAdvanceRecovered / data.finance.landlordAdvancesGiven) * 100))) : 0} />
                    <EnterpriseKpiCard title="Total Expenses Spent" value={money(data.finance.approvedExpenses)} tone="red" trend="down" trendLabel={`${money(data.finance.pendingExpenses)} pending`} progress={data.finance.approvedExpenses ? 62 : 0} />
                    <EnterpriseKpiCard title="Amount at Office" value={money(data.finance.amountAtOffice)} tone={data.finance.amountAtOffice >= 0 ? "green" : "red"} trend={data.finance.amountAtOffice >= 0 ? "up" : "down"} trendLabel="cash in office" progress={data.finance.amountAtOffice >= 0 ? 85 : 25} />
                    <EnterpriseKpiCard title="Amount Banked" value={money(data.finance.amountBanked)} tone="blue" trend="up" trendLabel="bank deposits" progress={data.finance.amountBanked ? 78 : 0} />
                    <EnterpriseKpiCard title="Profit / Loss This Month" value={money(data.finance.profitLossThisMonth)} tone={data.finance.profitLossThisMonth >= 0 ? "green" : "red"} trend={data.finance.profitLossThisMonth >= 0 ? "up" : "down"} trendLabel="live P/L" progress={data.finance.profitLossThisMonth >= 0 ? 82 : 36} />
                </section>

                <section className="mt-6 grid grid-cols-1 gap-6 2xl:grid-cols-12">
                    <div className="2xl:col-span-8">
                        <OfficeLeaguePreview offices={data.league} />
                    </div>
                    <div className="space-y-6 2xl:col-span-4">
                        <CashPositionPanel data={data} />
                        <RiskAlerts data={data} />
                    </div>
                </section>

                <section className="mt-6">
                    <OfficeFinanceCards data={data} />
                </section>

                <section className="mt-6">
                    <LandlordAdvancesPanel data={data} />
                </section>

                {data.isAdmin ? (
                    <section className="mt-6">
                        <DashboardReconciliationPanel data={data} />
                    </section>
                ) : null}

                <section className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
                    <PerformancePanel title="Collections Performance" value={`${data.kpis.monthCollections ? Math.min(100, data.kpis.officeScore) : 0}%`} tone="green" detail={money(data.kpis.monthCollections)} />
                    <PerformancePanel title="Occupancy Performance" value={`${data.kpis.occupancyRate}%`} tone="blue" detail="Portfolio utilization" />
                    <PerformancePanel title="Attendance Performance" value={`${data.kpis.attendanceRate}%`} tone="cyan" detail="Today workforce coverage" />
                </section>

                <section className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
                    <ActionRequiredPanel data={data} />
                    <PromiseRecoveryPanel data={data} />
                </section>

                <footer className="mt-6 rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-center text-xs font-black text-slate-500 shadow-sm">
                    Dashboard schema hotfix: e67206e
                </footer>
            </div>
        </main>
    );
}

function RentCalendarPanel({ data }: { data: DashboardLiveData }) {
    const [isPending, startTransition] = useTransition();
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const calendar = data.rentCalendar;
    const lastRun = calendar.lastRunAt
        ? new Date(calendar.lastRunAt).toLocaleString("en-UG", { dateStyle: "medium", timeStyle: "short" })
        : "Not run yet";

    function runNow() {
        setError(null);
        setMessage(null);
        startTransition(async () => {
            try {
                const result = await runMonthlyRentRollover({ businessDate: calendar.currentBusinessDate });
                const payload = result as { tenants_charged?: number; tenantsCharged?: number; total_rent_charged?: number };
                const charged = Number(payload.tenants_charged ?? payload.tenantsCharged ?? 0);
                setMessage(`Monthly rollover completed. ${charged.toLocaleString()} tenant month records processed.`);
            } catch (caught) {
                setError(caught instanceof Error ? caught.message : "Monthly rollover could not run.");
            }
        });
    }

    return (
        <section className="mb-5 overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-sm">
            <div className="flex flex-col gap-4 p-5 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex items-start gap-3">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
                        <CalendarClock size={22} />
                    </div>
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-lg font-black text-slate-950">Live Rent Calendar</h2>
                            <StatusChip label={calendar.lastRunStatus ?? "waiting"} tone={calendar.failedRecordCount ? "orange" : calendar.tenantsChargedThisMonth ? "green" : "blue"} />
                        </div>
                        <p className="mt-1 text-sm font-semibold text-slate-500">Africa/Kampala business date controls monthly rent charges and landlord payable refresh.</p>
                    </div>
                </div>
                {calendar.canRunRollover ? (
                    <button
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-lg shadow-slate-950/20 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={isPending}
                        onClick={runNow}
                        type="button"
                    >
                        <RefreshCw className={isPending ? "animate-spin" : ""} size={17} />
                        {isPending ? "Running..." : "Run Monthly Rollover Now"}
                    </button>
                ) : null}
            </div>
            <div className="grid grid-cols-1 gap-3 border-t border-slate-100 p-5 md:grid-cols-3 xl:grid-cols-6">
                <FinanceMini label="Business Date" value={calendar.currentBusinessDate} />
                <FinanceMini label="Rent Month" value={calendar.currentRentMonth.slice(0, 7)} tone="text-blue-700" />
                <FinanceMini label="Next Rollover" value={calendar.nextRolloverDate} tone="text-cyan-700" />
                <FinanceMini label="Last Run" value={lastRun} tone="text-slate-700" />
                <FinanceMini label="Tenants Charged" value={calendar.tenantsChargedThisMonth.toLocaleString()} tone="text-emerald-700" />
                <FinanceMini label="Failed Records" value={calendar.failedRecordCount.toLocaleString()} tone={calendar.failedRecordCount ? "text-red-700" : "text-emerald-700"} />
            </div>
            {message ? <p className="border-t border-emerald-100 bg-emerald-50 px-5 py-3 text-sm font-bold text-emerald-800">{message}</p> : null}
            {error ? <p className="border-t border-rose-100 bg-rose-50 px-5 py-3 text-sm font-bold text-rose-800">{error}</p> : null}
        </section>
    );
}

function OfficeFinanceCards({ data }: { data: DashboardLiveData }) {
    const finance = data.finance;
    return (
        <section className="enterprise-panel overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-slate-200 p-6 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h2 className="text-xl font-black">Office Monthly Finance</h2>
                    <p className="text-sm text-slate-500">Expected rent roll, landlord payable, company commission/profit, collections, payments, outstanding balances, and P/L.</p>
                </div>
                <StatusChip label={`${finance.collectionProgress}% progress`} tone={finance.collectionProgress >= 75 ? "green" : finance.collectionProgress >= 45 ? "orange" : "red"} />
            </div>
            <div className="grid grid-cols-1 gap-3 p-5 md:grid-cols-2 xl:grid-cols-4">
                <FinanceMini label="Office Rent Roll" value={money(finance.expectedRentRoll)} />
                <FinanceMini label="Office Commission" value={money(finance.expectedCompanyCommissionProfit)} tone="text-blue-700" />
                <FinanceMini label="Office Expected Profit" value={money(finance.expectedCompanyCommissionProfit)} tone="text-blue-700" />
                <FinanceMini label="Amount Collected" value={money(finance.collectedSoFarThisMonth)} tone="text-emerald-700" />
                <FinanceMini label="Landlords Paid" value={finance.landlordsPaid.toLocaleString()} tone="text-emerald-700" />
                <FinanceMini label="Amount Paid To Landlords" value={money(finance.landlordPaymentsMade)} />
                <FinanceMini label="Landlords Not Paid" value={finance.landlordsNotPaid.toLocaleString()} tone={finance.landlordsNotPaid ? "text-red-700" : "text-emerald-700"} />
                <FinanceMini label="Total Not Paid To Landlords" value={money(finance.totalAmountNotPaidToLandlords)} tone={finance.totalAmountNotPaidToLandlords ? "text-red-700" : "text-emerald-700"} />
                <FinanceMini label="Landlord Advances Given" value={money(finance.landlordAdvancesGiven)} tone="text-violet-700" />
                <FinanceMini label="Total Expenses Spent" value={money(finance.approvedExpenses)} tone="text-red-700" />
                <FinanceMini label="Amount At Office" value={money(finance.amountAtOffice)} tone={finance.amountAtOffice >= 0 ? "text-emerald-700" : "text-red-700"} />
                <FinanceMini label="Amount Banked" value={money(finance.amountBanked)} tone="text-blue-700" />
                <FinanceMini label="Amount Given By Admin" value={money(finance.amountGivenToOfficeByAdmin)} tone="text-cyan-700" />
                <FinanceMini label="Amount Sent Office To Bank" value={money(finance.amountSentFromOfficeToBank)} tone="text-blue-700" />
                <FinanceMini label="Office Outstanding" value={money(finance.outstandingTenantBalances)} tone="text-red-700" />
                <FinanceMini label="Office Landlord Payable" value={money(finance.expectedLandlordPayable)} />
                <FinanceMini label="Office Landlord Payables" value={money(finance.officeLandlordPayables)} tone="text-blue-700" />
                <FinanceMini label="Unpaid Landlords" value={finance.unpaidLandlords.toLocaleString()} tone={finance.unpaidLandlords ? "text-red-700" : "text-emerald-700"} />
                <FinanceMini label="Total Money Held For Landlords" value={money(finance.totalMoneyHeldForLandlords)} tone={finance.totalMoneyHeldForLandlords > 0 ? "text-red-700" : "text-emerald-700"} />
                <FinanceMini label="Occupied Rooms" value={finance.occupiedRooms.toLocaleString()} tone="text-emerald-700" />
                <FinanceMini label="Vacant Rooms" value={finance.vacantRooms.toLocaleString()} tone={finance.vacantRooms ? "text-red-700" : "text-emerald-700"} />
                <FinanceMini label="Vacant Deductions" value={money(finance.vacantDeductions)} tone={finance.vacantDeductions ? "text-amber-700" : "text-slate-950"} />
                <FinanceMini label="Employer Expected" value={money(finance.employerContributionsExpected)} tone="text-blue-700" />
                <FinanceMini label="Employer Received" value={money(finance.employerContributionsReceived)} tone="text-emerald-700" />
                <FinanceMini label="Top-Ups Expected" value={money(finance.tenantTopUpsExpected)} tone="text-amber-700" />
                <FinanceMini label="Top-Ups Collected" value={money(finance.tenantTopUpsCollected)} tone="text-emerald-700" />
                <FinanceMini label="Top-Ups To Collect" value={money(finance.tenantTopUpsStillToCollect)} tone={finance.tenantTopUpsStillToCollect > 0 ? "text-red-700" : "text-emerald-700"} />
                <FinanceMini label="Profit/loss this month" value={money(finance.profitLossThisMonth)} tone={finance.profitLossThisMonth >= 0 ? "text-emerald-700" : "text-red-700"} />
            </div>
        </section>
    );
}

function DashboardReconciliationPanel({ data }: { data: DashboardLiveData }) {
    const reconciliation = data.finance.reconciliation;
    return (
        <section className="enterprise-panel overflow-hidden border-amber-200 bg-amber-50/40">
            <div className="flex flex-col gap-3 border-b border-amber-200 p-6 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h2 className="text-xl font-black">Dashboard Reconciliation</h2>
                    <p className="text-sm text-amber-800">Admin-only check comparing live room/landlord calculations against payable ledger rows.</p>
                </div>
                <StatusChip label={reconciliation.payableDifference === 0 ? "Zero difference" : "Difference detected"} tone={reconciliation.payableDifference === 0 ? "green" : "orange"} />
            </div>
            <div className="grid grid-cols-1 gap-3 p-5 md:grid-cols-3 xl:grid-cols-4">
                <FinanceMini label="Dashboard rent roll" value={money(reconciliation.dashboardRentRoll)} />
                <FinanceMini label="Live room rent roll" value={money(reconciliation.liveRoomRentRoll)} />
                <FinanceMini label="Rent roll difference" value={money(reconciliation.rentRollDifference)} tone={reconciliation.rentRollDifference === 0 ? "text-emerald-700" : "text-red-700"} />
                <FinanceMini label="Dashboard commission" value={money(reconciliation.dashboardCommission)} tone="text-blue-700" />
                <FinanceMini label="Live commission" value={money(reconciliation.liveLandlordCommission)} tone="text-blue-700" />
                <FinanceMini label="Commission difference" value={money(reconciliation.commissionDifference)} tone={reconciliation.commissionDifference === 0 ? "text-emerald-700" : "text-red-700"} />
                <FinanceMini label="Dashboard payable" value={money(reconciliation.dashboardLandlordPayable)} />
                <FinanceMini label="Live net payable" value={money(reconciliation.liveLandlordNetPayable)} />
                <FinanceMini label="Ledger payable" value={money(reconciliation.ledgerLandlordPayable)} tone="text-amber-700" />
                <FinanceMini label="Payable difference" value={money(reconciliation.payableDifference)} tone={reconciliation.payableDifference === 0 ? "text-emerald-700" : "text-red-700"} />
                <FinanceMini label="Missing ledger landlords" value={reconciliation.missingLandlordCount.toLocaleString()} tone={reconciliation.missingLandlordCount ? "text-red-700" : "text-emerald-700"} />
                <FinanceMini label="Missing rooms" value={reconciliation.missingRoomCount.toLocaleString()} tone={reconciliation.missingRoomCount ? "text-red-700" : "text-emerald-700"} />
            </div>
        </section>
    );
}

function LandlordAdvancesPanel({ data }: { data: DashboardLiveData }) {
    const finance = data.finance;
    return (
        <section className="enterprise-panel overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-slate-200 p-6 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h2 className="text-xl font-black">Landlord Advances</h2>
                    <p className="text-sm text-slate-500">Approved active advance balances, recovered amounts, pending approvals, and landlord-level exposure.</p>
                </div>
                <StatusChip label={`${finance.landlordAdvanceRows.length} landlords`} tone="purple" />
            </div>
            <div className="grid grid-cols-1 gap-3 p-5 md:grid-cols-4">
                <FinanceMini label="Total Given" value={money(finance.landlordAdvancesGiven)} tone="text-violet-700" />
                <FinanceMini label="Active Balance" value={money(finance.landlordAdvanceActiveBalance)} tone={finance.landlordAdvanceActiveBalance ? "text-red-700" : "text-emerald-700"} />
                <FinanceMini label="Recovered" value={money(finance.landlordAdvanceRecovered)} tone="text-emerald-700" />
                <FinanceMini label="Pending Approval" value={money(finance.landlordAdvancePendingApprovals)} tone={finance.landlordAdvancePendingApprovals ? "text-amber-700" : "text-slate-950"} />
            </div>
            <div className="overflow-x-auto border-t border-slate-200">
                <table className="enterprise-table">
                    <thead>
                        <tr>
                            <th className="text-left">Landlord</th>
                            <th className="text-left">Date Given</th>
                            <th className="text-left">Amount</th>
                            <th className="text-left">Recovered</th>
                            <th className="text-left">Active Balance</th>
                            <th className="text-left">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {finance.landlordAdvanceRows.length === 0 ? (
                            <tr><td colSpan={6} className="p-6 text-slate-500">No approved active landlord advances for this period.</td></tr>
                        ) : finance.landlordAdvanceRows.map((advance) => (
                            <tr key={advance.id}>
                                <td>
                                    <p className="font-black">{advance.landlordName}</p>
                                    <p className="text-xs text-slate-500">{advance.officeName}</p>
                                </td>
                                <td>{advance.dateGiven ?? "-"}</td>
                                <td>{money(advance.amountGiven)}</td>
                                <td>{money(advance.recoveredAmount)}</td>
                                <td className={advance.activeBalance ? "font-black text-red-700" : "font-black text-emerald-700"}>{money(advance.activeBalance)}</td>
                                <td><StatusChip label={advance.status} tone={advance.activeBalance ? "orange" : "green"} /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

function OfficeLeaguePreview({ offices }: { offices: OfficeLeagueRow[] }) {
    return (
        <section className="enterprise-panel overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-slate-200 p-6 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h2 className="text-xl font-black">Office Excellence League</h2>
                    <p className="text-sm text-slate-500">Ranking uses collections, promises, occupancy, attendance, and expense control.</p>
                </div>
                <StatusChip label="Balanced scoring" tone="blue" />
            </div>
            <div className="overflow-x-auto">
                <table className="enterprise-table">
                    <thead>
                        <tr>
                            <th className="text-left">Rank</th>
                            <th className="text-left">Office</th>
                            <th className="text-left">Score</th>
                            <th className="text-left">Collections</th>
                            <th className="text-left">Occupancy</th>
                            <th className="text-left">Attendance</th>
                            <th className="text-left">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {offices.length === 0 ? (
                            <tr><td colSpan={7} className="p-6 text-slate-500">No office ranking data available.</td></tr>
                        ) : offices.slice(0, 8).map((office) => (
                            <tr key={office.officeId}>
                                <td><span className="grid h-9 w-9 place-items-center rounded-full bg-slate-950 font-black text-white">{office.rank}</span></td>
                                <td>
                                    <p className="font-black">{office.officeName}</p>
                                    <p className="text-xs text-slate-500">Trend {office.trend}</p>
                                </td>
                                <td><Score value={office.officeScore} /></td>
                                <td>{office.collectionsVsTarget}%</td>
                                <td>{office.occupancy}%</td>
                                <td>{office.attendance}%</td>
                                <td><StatusChip label={office.status} tone={office.status === "excellent" || office.status === "strong" ? "green" : office.status === "watch" ? "orange" : "red"} /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

function FinanceMini({ label, value, tone = "text-slate-950" }: { label: string; value: string; tone?: string }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
            <p className={`mt-2 text-lg font-black ${tone}`}>{value}</p>
        </div>
    );
}

function CashPositionPanel({ data }: { data: DashboardLiveData }) {
    return (
        <section className="rounded-3xl bg-slate-950 p-6 text-white shadow-xl">
            <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-500"><CircleDollarSign size={22} /></span>
                <div>
                    <h2 className="text-xl font-black">Cash Position</h2>
                    <p className="text-sm text-slate-300">Company-level liquidity signal</p>
                </div>
            </div>
            <p className="mt-6 text-4xl font-black">{money(data.kpis.companyCashPosition)}</p>
            <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
                <Mini label="Collections" value={money(data.kpis.monthCollections)} />
                <Mini label="Expenses" value={money(data.kpis.expenses)} />
                <Mini label="Net" value={money(data.kpis.netPosition)} />
            </div>
        </section>
    );
}

function RiskAlerts({ data }: { data: DashboardLiveData }) {
    return (
        <section className="enterprise-panel p-6">
            <h2 className="text-xl font-black">Risk Alerts</h2>
            <div className="mt-4 space-y-3">
                {data.riskAlerts.length === 0 ? (
                    <EmptyState title="No critical risks" description="All monitored office risk indicators are currently within acceptable range." />
                ) : data.riskAlerts.slice(0, 4).map((alert) => (
                    <div key={alert.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex gap-3">
                            <AlertTriangle className={alert.severity === "critical" ? "text-rose-600" : "text-amber-600"} size={20} />
                            <div>
                                <p className="font-black">{alert.title}</p>
                                <p className="mt-1 text-sm text-slate-500">{alert.description}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}

function ActionRequiredPanel({ data }: { data: DashboardLiveData }) {
    return (
        <section className="enterprise-panel p-6">
            <h2 className="text-xl font-black">Action Required</h2>
            <div className="mt-4 grid gap-3">
                {data.actions.map((action) => (
                    <div key={action.id} className="flex items-center justify-between rounded-2xl border border-slate-200 p-4">
                        <div>
                            <p className="font-black">{action.title}</p>
                            <p className="text-sm text-slate-500">{action.description}</p>
                        </div>
                        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-100 font-black">{action.count}</span>
                    </div>
                ))}
            </div>
        </section>
    );
}

function PromiseRecoveryPanel({ data }: { data: DashboardLiveData }) {
    return (
        <section className="enterprise-panel p-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-black">Promise Recovery Performance</h2>
                    <p className="text-sm text-slate-500">Commitment conversion across active offices</p>
                </div>
                <Target className="text-violet-600" />
            </div>
            <div className="mt-6 h-4 rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-violet-500" style={{ width: `${data.kpis.promiseRecovery}%` }} />
            </div>
            <p className="mt-4 text-4xl font-black text-violet-700">{data.kpis.promiseRecovery}%</p>
        </section>
    );
}

function PerformancePanel({ title, value, detail, tone }: { title: string; value: string; detail: string; tone: "green" | "blue" | "cyan" }) {
    const color = tone === "green" ? "bg-emerald-500 text-emerald-700" : tone === "blue" ? "bg-blue-500 text-blue-700" : "bg-cyan-500 text-cyan-700";
    const [bar, text] = color.split(" ");
    return (
        <section className="enterprise-panel p-6">
            <p className="text-sm font-bold text-slate-500">{title}</p>
            <p className={`mt-3 text-4xl font-black ${text}`}>{value}</p>
            <p className="mt-2 text-sm text-slate-500">{detail}</p>
            <div className="mt-5 h-3 rounded-full bg-slate-100">
                <div className={`h-full rounded-full ${bar}`} style={{ width: value }} />
            </div>
        </section>
    );
}

function Score({ value }: { value: number }) {
    return (
        <div className="flex min-w-36 items-center gap-3">
            <span className="font-black">{value}</span>
            <div className="h-2 flex-1 rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-blue-500" style={{ width: `${value}%` }} />
            </div>
        </div>
    );
}

function Mini({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl bg-white/10 p-3">
            <p className="text-xs text-slate-300">{label}</p>
            <p className="mt-1 font-black">{value}</p>
        </div>
    );
}
