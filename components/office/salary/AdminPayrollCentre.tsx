"use client";

import { useMemo, useState } from "react";
import {
    Activity,
    ArrowUpRight,
    Banknote,
    CalendarDays,
    CircleDollarSign,
    Download,
    FileText,
    Filter,
    History,
    Landmark,
    LineChart,
    Printer,
    ReceiptText,
    Search,
    ShieldCheck,
    Sparkles,
    UserRound,
    UsersRound,
    WalletCards,
} from "lucide-react";
import { recordSalaryPayment, updateEmployeeSalaryConfiguration } from "@/app/actions/salary";
import type { AdminPayrollCentreData, SalaryCardData, SalaryStatus } from "@/lib/salary-centre/types";

type FilterPeriod = "all" | "today" | "tomorrow" | "week" | "month";

function money(value: number) {
    return `UGX ${Math.round(value || 0).toLocaleString()}`;
}

function statusClass(status: SalaryStatus) {
    if (status === "paid") return "border-emerald-300/30 bg-emerald-300/12 text-emerald-100";
    if (status === "due_today") return "border-yellow-300/40 bg-yellow-300/12 text-yellow-100";
    if (status === "partially_paid") return "border-orange-300/40 bg-orange-300/12 text-orange-100";
    if (status === "overdue" || status === "suspended") return "border-red-300/40 bg-red-300/12 text-red-100";
    if (status === "not_configured") return "border-slate-300/20 bg-slate-300/10 text-slate-200";
    return "border-blue-300/30 bg-blue-300/12 text-blue-100";
}

function dateKey(value: string | null) {
    return value ? value.slice(0, 10) : "";
}

function dayGap(date: string | null) {
    if (!date) return null;
    const today = new Date();
    const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Kampala", year: "numeric", month: "2-digit", day: "2-digit" }).format(today);
    return Math.round((Date.parse(`${dateKey(date)}T00:00:00Z`) - Date.parse(`${todayKey}T00:00:00Z`)) / 86400000);
}

export default function AdminPayrollCentre({ data }: { data: AdminPayrollCentreData }) {
    const [query, setQuery] = useState("");
    const [officeId, setOfficeId] = useState("");
    const [status, setStatus] = useState("");
    const [position, setPosition] = useState("");
    const [period, setPeriod] = useState<FilterPeriod>("all");
    const [selectedId, setSelectedId] = useState(data.employees[0]?.employeeId ?? "");

    const positions = useMemo(() => [...new Set(data.employees.map((employee) => employee.role).filter(Boolean))].sort(), [data.employees]);
    const filtered = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        return data.employees.filter((employee) => {
            if (officeId && employee.officeId !== officeId) return false;
            if (status && employee.status !== status) return false;
            if (position && employee.role !== position) return false;
            const gap = dayGap(employee.salaryPaymentDate);
            if (period === "today" && gap !== 0) return false;
            if (period === "tomorrow" && gap !== 1) return false;
            if (period === "week" && (gap === null || gap < 0 || gap > 7)) return false;
            if (period === "month" && employee.salaryPeriod !== data.monthKey) {
                // Current dataset is month-scoped, so keep this filter intentionally light.
            }
            if (!normalized) return true;
            return [employee.employeeName, employee.employeeCode, employee.officeName, employee.role, employee.statusLabel].some((value) => value.toLowerCase().includes(normalized));
        });
    }, [data.employees, data.monthKey, officeId, period, position, query, status]);

    const selected = data.employees.find((employee) => employee.employeeId === selectedId) ?? filtered[0] ?? data.employees[0] ?? null;
    const officeComparison = useMemo(() => buildOfficeComparison(filtered), [filtered]);
    const calendarDays = useMemo(() => buildPayrollCalendar(filtered), [filtered]);
    const insights = useMemo(() => buildPayrollInsights(data, filtered, officeComparison), [data, filtered, officeComparison]);
    const forecast = useMemo(() => buildForecast(data, officeComparison), [data, officeComparison]);
    const canManage = data.canManage !== false;

    return (
        <main className="min-h-screen px-4 pb-10 pt-5 text-white sm:px-6 lg:px-8">
            <section className="mx-auto max-w-[1900px] space-y-5">
                <Hero data={data} forecast={forecast} />

                {data.warnings.length ? <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm font-bold text-amber-100">{data.warnings.join(" | ")}</div> : null}
                {!canManage ? <ReadOnlyNotice /> : null}

                <ExecutiveCards data={data} />

                <div className="grid gap-4 2xl:grid-cols-[1.35fr_0.9fr]">
                    <AiPayrollDirector insights={insights} forecast={forecast} />
                    <PayrollCalendar days={calendarDays} />
                </div>

                <FilterBar
                    officeId={officeId}
                    offices={data.offices}
                    period={period}
                    position={position}
                    positions={positions}
                    query={query}
                    setOfficeId={setOfficeId}
                    setPeriod={setPeriod}
                    setPosition={setPosition}
                    setQuery={setQuery}
                    setStatus={setStatus}
                    status={status}
                />

                <OfficeComparison offices={officeComparison} />

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_440px]">
                    <section className="grid min-w-0 gap-3 md:grid-cols-2 2xl:grid-cols-3">
                        {filtered.map((employee) => (
                            <EmployeeSalaryCard key={employee.employeeId} employee={employee} selected={selected?.employeeId === employee.employeeId} onSelect={() => setSelectedId(employee.employeeId)} />
                        ))}
                        {filtered.length === 0 ? <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.04] p-8 text-center text-sm font-bold text-slate-400 md:col-span-2 2xl:col-span-3">No employees match the active payroll filters.</div> : null}
                    </section>
                    <aside className="min-w-0 space-y-4">
                        {selected ? <EmployeeDetails canManage={canManage} employee={selected} /> : <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.04] p-5 text-sm text-slate-400">Select an employee to open salary history, payslip, payment history, deductions, allowances, corrections, and audit trail.</div>}
                    </aside>
                </div>
            </section>
        </main>
    );
}

function Hero({ data, forecast }: { data: AdminPayrollCentreData; forecast: ReturnType<typeof buildForecast> }) {
    return (
        <div className="overflow-hidden rounded-[30px] border border-white/10 bg-[radial-gradient(circle_at_12%_0%,rgba(34,211,238,0.18),transparent_30%),radial-gradient(circle_at_82%_0%,rgba(16,185,129,0.14),transparent_32%),linear-gradient(135deg,rgba(2,6,23,0.94),rgba(15,23,42,0.84))] p-5 shadow-2xl shadow-black/35 backdrop-blur-xl">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div className="min-w-0">
                    <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black uppercase text-cyan-100"><ShieldCheck size={14} /> Admin only · Live payroll ledger</div>
                    <h1 className="text-3xl font-black tracking-tight md:text-5xl">Salary Centre</h1>
                    <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-300">Executive payroll command centre for salary setup, payment status, payslips, office payroll comparison, and AI salary risk intelligence across {data.companyName}.</p>
                </div>
                <div className="grid min-w-0 gap-2 sm:grid-cols-3">
                    <HeroMini label="Employees" value={data.employees.length.toLocaleString()} />
                    <HeroMini label="Budget Use" value={`${forecast.budgetUse}%`} />
                    <HeroMini label="Cash Needed 7 Days" value={money(forecast.cashNeeded7Days)} />
                </div>
            </div>
        </div>
    );
}

function ExecutiveCards({ data }: { data: AdminPayrollCentreData }) {
    const cards = [
        { label: "Total Monthly Payroll", value: money(data.totals.totalMonthlyPayroll), hint: "Net salary exposure", tone: "cyan", icon: <CircleDollarSign size={18} /> },
        { label: "Salaries Paid This Month", value: money(data.totals.paidSalaries), hint: `${data.totals.employeesPaid} employees paid`, tone: "emerald", icon: <Banknote size={18} /> },
        { label: "Outstanding Salaries", value: money(data.totals.outstandingSalaries), hint: `${data.totals.employeesAwaitingSalary} awaiting`, tone: "amber", icon: <WalletCards size={18} /> },
        { label: "Salaries Due Today", value: data.totals.dueToday.toString(), hint: "Immediate payroll action", tone: "blue", icon: <CalendarDays size={18} /> },
        { label: "Salaries Due This Week", value: data.totals.dueThisWeek.toString(), hint: "Next 7 days", tone: "purple", icon: <Activity size={18} /> },
        { label: "Overdue Salaries", value: data.totals.overdueSalaries.toString(), hint: "Requires attention", tone: "red", icon: <LineChart size={18} /> },
        { label: "Employees Paid", value: data.totals.employeesPaid.toString(), hint: "Fully settled", tone: "emerald", icon: <UsersRound size={18} /> },
        { label: "Employees Awaiting Salary", value: data.totals.employeesAwaitingSalary.toString(), hint: "Pending/partial/due", tone: "amber", icon: <UserRound size={18} /> },
        { label: "Average Salary", value: money(data.totals.averageSalary), hint: "Current month average", tone: "cyan", icon: <CircleDollarSign size={18} /> },
        { label: "Total Allowances", value: money(data.totals.totalAllowances), hint: "Approved payroll additions", tone: "blue", icon: <ArrowUpRight size={18} /> },
        { label: "Total Deductions", value: money(data.totals.totalDeductions), hint: "Fines, advances, expenses", tone: "red", icon: <ReceiptText size={18} /> },
        { label: "Payroll Cost by Office", value: data.offices.length.toString(), hint: "Ranked below", tone: "purple", icon: <Landmark size={18} /> },
    ];
    return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">{cards.map((card) => <Kpi key={card.label} {...card} />)}</div>;
}

function AiPayrollDirector({ insights, forecast }: { insights: string[]; forecast: ReturnType<typeof buildForecast> }) {
    return (
        <section className="rounded-[28px] border border-cyan-300/15 bg-slate-950/55 p-5 shadow-xl shadow-cyan-950/20">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 text-cyan-100"><Sparkles size={19} /><h2 className="text-xl font-black">AI Payroll Director</h2></div>
                    <p className="mt-1 text-sm font-bold text-slate-400">Live salary reminders, payroll risk, and executive recommendations.</p>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase ${forecast.risk === "high" ? "border-red-300/30 bg-red-300/10 text-red-100" : forecast.risk === "watch" ? "border-amber-300/30 bg-amber-300/10 text-amber-100" : "border-emerald-300/30 bg-emerald-300/10 text-emerald-100"}`}>{forecast.risk} risk</span>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {insights.map((insight, index) => (
                    <div key={`${insight}-${index}`} className="rounded-2xl border border-white/10 bg-white/[0.045] p-4 transition hover:border-cyan-300/30 hover:bg-white/[0.07]">
                        <p className="text-sm font-black text-white">{insight}</p>
                        <button type="button" className="mt-3 rounded-xl border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-black text-cyan-100">Review payroll</button>
                    </div>
                ))}
            </div>
        </section>
    );
}

function PayrollCalendar({ days }: { days: Array<{ date: string; total: number; paid: number; unpaid: number; partial: number; employees: string[] }> }) {
    return (
        <section className="rounded-[28px] border border-white/10 bg-slate-950/55 p-5 shadow-xl shadow-black/20">
            <div className="flex items-center gap-2"><CalendarDays size={19} className="text-cyan-100" /><h2 className="text-xl font-black">Payroll Calendar</h2></div>
            <div className="mt-4 space-y-3">
                {days.slice(0, 8).map((day) => (
                    <button key={day.date} type="button" className="w-full rounded-2xl border border-white/10 bg-white/[0.045] p-4 text-left transition hover:border-cyan-300/30 hover:bg-white/[0.07]">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="font-black">{new Date(`${day.date}T00:00:00Z`).toLocaleDateString("en-UG", { day: "numeric", month: "short", year: "numeric" })}</p>
                                <p className="mt-1 line-clamp-1 text-xs font-bold text-slate-400">{day.employees.join(", ")}</p>
                            </div>
                            <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-[10px] font-black text-cyan-100">{day.employees.length} due</span>
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-2">
                            <Mini label="Due" value={money(day.total)} />
                            <Mini label="Paid" value={money(day.paid)} />
                            <Mini label="Unpaid" value={money(day.unpaid)} />
                        </div>
                    </button>
                ))}
                {days.length === 0 ? <p className="rounded-2xl border border-dashed border-white/10 bg-white/[0.035] p-4 text-sm font-bold text-slate-400">No salary due dates in the active filter.</p> : null}
            </div>
        </section>
    );
}

function FilterBar(props: {
    officeId: string;
    offices: AdminPayrollCentreData["offices"];
    period: FilterPeriod;
    position: string;
    positions: string[];
    query: string;
    setOfficeId: (value: string) => void;
    setPeriod: (value: FilterPeriod) => void;
    setPosition: (value: string) => void;
    setQuery: (value: string) => void;
    setStatus: (value: string) => void;
    status: string;
}) {
    return (
        <section className="rounded-[24px] border border-white/10 bg-slate-950/50 p-4 shadow-xl shadow-black/20">
            <div className="grid gap-3 lg:grid-cols-[1fr_repeat(4,190px)_auto] lg:items-end">
                <label className="block">
                    <span className="mb-1 flex items-center gap-2 text-xs font-black uppercase text-slate-400"><Search size={13} /> Employee</span>
                    <input value={props.query} onChange={(event) => props.setQuery(event.target.value)} className="h-11 w-full rounded-2xl border border-white/10 bg-white/10 px-3 text-sm font-semibold outline-none focus:border-cyan-300/60" placeholder="Search employee, ID, office, status..." />
                </label>
                <Select label="Period" value={props.period} onChange={(value) => props.setPeriod(value as FilterPeriod)}>
                    <option value="all">This Month</option>
                    <option value="today">Today</option>
                    <option value="tomorrow">Tomorrow</option>
                    <option value="week">This Week</option>
                    <option value="month">Custom Range</option>
                </Select>
                <Select label="Office" value={props.officeId} onChange={props.setOfficeId}>
                    <option value="">All offices</option>
                    {props.offices.map((office) => <option key={office.id} value={office.id}>{office.name}</option>)}
                </Select>
                <Select label="Position" value={props.position} onChange={props.setPosition}>
                    <option value="">All positions</option>
                    {props.positions.map((position) => <option key={position} value={position}>{position}</option>)}
                </Select>
                <Select label="Status" value={props.status} onChange={props.setStatus}>
                    <option value="">All statuses</option>
                    {["upcoming", "due_today", "pending_payment", "partially_paid", "paid", "overdue", "suspended", "not_configured"].map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
                </Select>
                <button type="button" onClick={() => { props.setQuery(""); props.setOfficeId(""); props.setStatus(""); props.setPosition(""); props.setPeriod("all"); }} className="h-11 rounded-2xl border border-white/10 bg-white/10 px-4 text-sm font-black text-white">Clear</button>
            </div>
        </section>
    );
}

function OfficeComparison({ offices }: { offices: ReturnType<typeof buildOfficeComparison> }) {
    return (
        <section className="rounded-[28px] border border-white/10 bg-slate-950/45 p-5 shadow-xl shadow-black/20">
            <div className="mb-4 flex items-center gap-2"><Landmark size={19} className="text-cyan-100" /><h2 className="text-xl font-black">Office Payroll Comparison</h2></div>
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
                {offices.map((office, index) => (
                    <div key={office.officeName} className="rounded-[24px] border border-white/10 bg-white/[0.045] p-4 transition hover:-translate-y-0.5 hover:border-cyan-300/30">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="break-words text-base font-black">{office.officeName}</p>
                                <p className="mt-1 text-xs font-bold text-slate-400">Rank #{index + 1} · {office.employees} employees</p>
                            </div>
                            <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-black text-cyan-100">{office.paidPercent}% paid</span>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-2">
                            <Mini label="Payroll" value={money(office.payroll)} />
                            <Mini label="Paid" value={money(office.paid)} />
                            <Mini label="Outstanding" value={money(office.outstanding)} />
                            <Mini label="Overdue" value={office.overdue.toString()} />
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}

function EmployeeSalaryCard({ employee, selected, onSelect }: { employee: SalaryCardData; selected: boolean; onSelect: () => void }) {
    const progress = employee.netSalary > 0 ? Math.min(100, Math.round((employee.salaryAlreadyPaid / employee.netSalary) * 100)) : 0;
    return (
        <button type="button" onClick={onSelect} className={`min-w-0 rounded-[24px] border p-4 text-left shadow-xl shadow-black/20 transition hover:-translate-y-0.5 ${selected ? "border-cyan-300/45 bg-cyan-300/10" : "border-white/10 bg-slate-950/50 hover:bg-white/[0.065]"}`}>
            <div className="flex items-start gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/10 bg-white/10">
                    {employee.employeePhotoUrl ? <img src={employee.employeePhotoUrl} alt="" className="h-full w-full object-cover" /> : <UserRound size={22} className="text-cyan-100" />}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                            <p className="break-words text-base font-black">{employee.employeeName}</p>
                            <p className="mt-1 break-words text-xs font-bold text-slate-400">{employee.employeeCode} · {employee.officeName}</p>
                        </div>
                        <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-black uppercase ${statusClass(employee.status)}`}>{employee.statusLabel}</span>
                    </div>
                    <p className="mt-2 text-xs font-bold text-cyan-100">{employee.role}</p>
                </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
                <Mini label="Monthly Salary" value={money(employee.monthlySalary)} />
                <Mini label="Due Date" value={employee.salaryPaymentDate ?? "Not set"} />
                <Mini label="Days Remaining" value={employee.countdownLabel} />
                <Mini label="Earned" value={money(employee.salaryEarnedSoFar)} />
                <Mini label="Amount Paid" value={money(employee.salaryAlreadyPaid)} />
                <Mini label="Remaining" value={money(employee.remainingSalaryBalance)} />
                <Mini label="Last Payment" value={employee.lastSalaryPaymentDate ? money(employee.lastSalaryAmount) : "None"} />
                <Mini label="Payment Method" value={employee.payments[0]?.method ?? "Not recorded"} />
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-emerald-300 to-lime-300" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] font-black md:grid-cols-4">
                {["Pay Salary", "Payslip", "Print", "History"].map((action) => <span key={action} className="rounded-xl border border-white/10 bg-white/10 px-2 py-1.5 text-center text-slate-100">{action}</span>)}
            </div>
        </button>
    );
}

function EmployeeDetails({ canManage, employee }: { canManage: boolean; employee: SalaryCardData }) {
    return (
        <>
            <Panel title="Quick Actions" icon={<Banknote size={18} />}>
                {canManage ? (
                    <form action={recordSalaryPayment} className="grid gap-3">
                        <input type="hidden" name="employeeId" value={employee.employeeId} />
                        <input type="hidden" name="officeId" value={employee.officeId ?? ""} />
                        <Input label="Amount Paid" name="paidAmount" type="number" max={employee.remainingSalaryBalance || undefined} required />
                        <SelectField label="Payment Method" name="paymentMethod"><option value="cash">Cash</option><option value="bank">Bank</option><option value="mobile_money">Mobile Money</option></SelectField>
                        <Input label="Reference" name="reference" />
                        <Textarea label="Notes" name="notes" />
                        <button className="h-11 rounded-2xl bg-emerald-300 px-4 text-sm font-black text-slate-950">Pay Salary / Record Partial Payment</button>
                    </form>
                ) : <ReadOnlyNotice compact />}
                <div className="mt-3 grid grid-cols-2 gap-2">
                    <Action icon={<FileText size={15} />} label="View Payslip" />
                    <Action icon={<Printer size={15} />} label="Print" />
                    <Action icon={<Download size={15} />} label="Export PDF" />
                    <Action icon={<History size={15} />} label="Salary History" />
                </div>
            </Panel>
            <Panel title="Edit Salary Setup" icon={<UsersRound size={18} />}>
                {canManage ? (
                    <form action={updateEmployeeSalaryConfiguration} className="grid gap-3">
                        <input type="hidden" name="employeeId" value={employee.employeeId} />
                        <Input label="Monthly Salary" name="monthlySalary" type="number" defaultValue={employee.monthlySalary} required />
                        <Input label="Salary Payment Day" name="salaryPaymentDay" type="number" min={1} max={31} defaultValue={employee.salaryPaymentDay} required />
                        <SelectField label="Salary Type" name="salaryType" defaultValue="monthly"><option value="monthly">Fixed Salary</option><option value="contract">Contract</option><option value="allowance">Allowance based</option></SelectField>
                        <SelectField label="Employment Status" name="employmentStatus" defaultValue={employee.employmentStatus}><option value="active">Active</option><option value="suspended">Suspended</option><option value="inactive">Inactive</option><option value="terminated">Terminated</option></SelectField>
                        <Input label="Payment Method" name="paymentMethod" placeholder="Cash, bank, mobile money..." />
                        <button className="h-11 rounded-2xl bg-cyan-300 px-4 text-sm font-black text-slate-950">Save Salary / Date</button>
                    </form>
                ) : <ReadOnlyNotice compact />}
            </Panel>
            <Panel title="Employee Details" icon={<ReceiptText size={18} />}>
                <div className="space-y-2 text-sm">
                    <Line label="Employee" value={employee.employeeName} />
                    <Line label="Office" value={employee.officeName} />
                    <Line label="Gross" value={money(employee.monthlySalary)} />
                    <Line label="Allowances" value={money(employee.allowances)} />
                    <Line label="Deductions" value={money(employee.deductions)} />
                    <Line label="Net" value={money(employee.netSalary)} strong />
                    <Line label="Prepared By" value={employee.payments[0]?.recordedBy || "Admin"} />
                    <Line label="Approved By" value={employee.payments[0]?.approvedBy || "Admin"} />
                </div>
                <div className="mt-4 space-y-2">
                    {employee.payments.slice(0, 5).map((payment) => (
                        <div key={payment.id} className="rounded-2xl border border-white/10 bg-white/[0.045] p-3">
                            <p className="font-black">{money(payment.amount)}</p>
                            <p className="mt-1 text-xs font-bold text-slate-400">{payment.method} · {payment.paidAt ? new Date(payment.paidAt).toLocaleString("en-UG") : "No date"} · {payment.reference || "No reference"}</p>
                        </div>
                    ))}
                    {employee.payments.length === 0 ? <p className="rounded-2xl border border-dashed border-white/10 bg-white/[0.035] p-3 text-sm font-bold text-slate-400">No salary payments recorded yet.</p> : null}
                </div>
            </Panel>
        </>
    );
}

function ReadOnlyNotice({ compact = false }: { compact?: boolean }) {
    return (
        <div className={`rounded-2xl border border-cyan-300/25 bg-cyan-300/10 ${compact ? "p-3" : "p-4"} text-sm font-bold text-cyan-50`}>
            <p className="font-black">Read-Only Manager</p>
            <p className="mt-1 text-cyan-100/80">You have company-wide viewing access but cannot change, approve, pay, or configure payroll records.</p>
        </div>
    );
}

function buildOfficeComparison(employees: SalaryCardData[]) {
    const grouped = new Map<string, { officeName: string; employees: number; payroll: number; paid: number; outstanding: number; overdue: number }>();
    for (const employee of employees) {
        const key = employee.officeId ?? employee.officeName;
        const current = grouped.get(key) ?? { officeName: employee.officeName, employees: 0, payroll: 0, paid: 0, outstanding: 0, overdue: 0 };
        current.employees += 1;
        current.payroll += employee.netSalary;
        current.paid += employee.salaryAlreadyPaid;
        current.outstanding += employee.remainingSalaryBalance;
        if (employee.status === "overdue") current.overdue += 1;
        grouped.set(key, current);
    }
    return [...grouped.values()].map((office) => ({ ...office, paidPercent: office.payroll > 0 ? Math.round((office.paid / office.payroll) * 100) : 0 })).sort((a, b) => b.payroll - a.payroll);
}

function buildPayrollCalendar(employees: SalaryCardData[]) {
    const grouped = new Map<string, { date: string; total: number; paid: number; unpaid: number; partial: number; employees: string[] }>();
    for (const employee of employees) {
        if (!employee.salaryPaymentDate) continue;
        const key = employee.salaryPaymentDate;
        const current = grouped.get(key) ?? { date: key, total: 0, paid: 0, unpaid: 0, partial: 0, employees: [] };
        current.total += employee.netSalary;
        current.paid += employee.salaryAlreadyPaid;
        current.unpaid += employee.remainingSalaryBalance;
        if (employee.status === "partially_paid") current.partial += 1;
        current.employees.push(employee.employeeName);
        grouped.set(key, current);
    }
    return [...grouped.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function buildPayrollInsights(data: AdminPayrollCentreData, filtered: SalaryCardData[], offices: ReturnType<typeof buildOfficeComparison>) {
    const insights: string[] = [];
    if (data.totals.dueToday > 0) insights.push(`${data.totals.dueToday} employee${data.totals.dueToday === 1 ? " is" : "s are"} due for salary today.`);
    if (data.totals.dueThisWeek > 0) insights.push(`${data.totals.dueThisWeek} salaries become due in the next seven days.`);
    if (data.totals.outstandingSalaries > 0) insights.push(`${money(data.totals.outstandingSalaries)} remains unpaid this month.`);
    if (data.totals.overdueSalaries > 0) insights.push(`${data.totals.overdueSalaries} salaries are overdue and need Admin follow-up.`);
    const topOffice = offices[0];
    if (topOffice) insights.push(`${topOffice.officeName} has the highest payroll at ${money(topOffice.payroll)}.`);
    const missing = filtered.find((employee) => employee.status === "not_configured");
    if (missing) insights.push(`${missing.employeeName} is missing salary setup.`);
    const fullyPaid = filtered.find((employee) => employee.status === "paid");
    if (fullyPaid) insights.push(`${fullyPaid.employeeName} has been fully paid for this salary period.`);
    if (insights.length === 0) insights.push("All visible payroll records are calm. Continue monitoring upcoming salary dates.");
    return insights.slice(0, 8);
}

function buildForecast(data: AdminPayrollCentreData, offices: ReturnType<typeof buildOfficeComparison>) {
    const cashNeeded7Days = data.employees.filter((employee) => {
        const gap = dayGap(employee.salaryPaymentDate);
        return gap !== null && gap >= 0 && gap <= 7;
    }).reduce((total, employee) => total + employee.remainingSalaryBalance, 0);
    const budgetUse = data.totals.totalMonthlyPayroll > 0 ? Math.round((data.totals.paidSalaries / data.totals.totalMonthlyPayroll) * 100) : 0;
    const projectedNextMonth = Math.round(data.totals.totalMonthlyPayroll * 1.03);
    const highestOffice = offices[0]?.officeName ?? "No office";
    const risk = data.totals.overdueSalaries > 0 || data.totals.notConfigured > 0 ? "high" : data.totals.dueThisWeek > 0 ? "watch" : "healthy";
    return { budgetUse, cashNeeded7Days, projectedNextMonth, highestOffice, risk };
}

function Kpi({ label, value, hint, tone, icon }: { label: string; value: string; hint: string; tone: string; icon: React.ReactNode }) {
    const toneMap: Record<string, string> = { emerald: "from-emerald-400/18 text-emerald-100", cyan: "from-cyan-400/18 text-cyan-100", amber: "from-amber-400/18 text-amber-100", red: "from-red-400/18 text-red-100", blue: "from-blue-400/18 text-blue-100", purple: "from-purple-400/18 text-purple-100", slate: "from-slate-400/18 text-slate-100" };
    return <button type="button" className={`group min-w-0 rounded-[22px] border border-white/10 bg-gradient-to-br ${toneMap[tone] ?? toneMap.cyan} to-white/[0.045] p-4 text-left shadow-xl shadow-black/20 transition hover:-translate-y-0.5 hover:border-cyan-300/30 hover:shadow-cyan-950/30`}><div className="flex items-start justify-between gap-3"><p className="text-[10px] font-black uppercase text-slate-400">{label}</p><span className="transition group-hover:scale-110">{icon}</span></div><p className="mt-2 break-words text-xl font-black text-white">{value}</p><p className="mt-1 text-xs font-bold text-slate-400">{hint}</p></button>;
}

function HeroMini({ label, value }: { label: string; value: string }) {
    return <div className="min-w-0 rounded-2xl border border-white/10 bg-white/10 p-3"><p className="text-[10px] font-black uppercase text-slate-400">{label}</p><p className="mt-1 break-words text-sm font-black text-white">{value}</p></div>;
}

function Mini({ label, value }: { label: string; value: string }) {
    return <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.045] p-3"><p className="text-[10px] font-black uppercase text-slate-400">{label}</p><p className="mt-1 break-words text-sm font-black text-white">{value}</p></div>;
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
    return <section className="rounded-[24px] border border-white/10 bg-slate-950/55 p-4 shadow-xl shadow-black/20"><div className="mb-4 flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-2xl bg-cyan-300/12 text-cyan-100">{icon}</span><h2 className="font-black">{title}</h2></div>{children}</section>;
}

function Action({ icon, label }: { icon: React.ReactNode; label: string }) {
    return <button type="button" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-black text-white transition hover:border-cyan-300/30 hover:bg-white/15">{icon}{label}</button>;
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }) {
    const { label, ...inputProps } = props;
    return <label className="block"><span className="mb-1 block text-xs font-black uppercase text-slate-400">{label}</span><input className="h-10 w-full rounded-2xl border border-white/10 bg-white/10 px-3 text-sm font-semibold outline-none focus:border-cyan-300/60" {...inputProps} /></label>;
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; name: string }) {
    const { label, ...inputProps } = props;
    return <label className="block"><span className="mb-1 block text-xs font-black uppercase text-slate-400">{label}</span><textarea rows={3} className="w-full rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm font-semibold outline-none focus:border-cyan-300/60" {...inputProps} /></label>;
}

function Select(props: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
    return <label className="block"><span className="mb-1 flex items-center gap-2 text-xs font-black uppercase text-slate-400"><Filter size={13} />{props.label}</span><select value={props.value} onChange={(event) => props.onChange(event.target.value)} className="h-11 w-full rounded-2xl border border-white/10 bg-slate-900 px-3 text-sm font-semibold outline-none focus:border-cyan-300/60">{props.children}</select></label>;
}

function SelectField(props: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; name: string; children: React.ReactNode }) {
    const { label, children, ...selectProps } = props;
    return <label className="block"><span className="mb-1 block text-xs font-black uppercase text-slate-400">{label}</span><select className="h-10 w-full rounded-2xl border border-white/10 bg-slate-900 px-3 text-sm font-semibold outline-none focus:border-cyan-300/60" {...selectProps}>{children}</select></label>;
}

function Line({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
    return <div className="flex items-start justify-between gap-3"><span className="min-w-0 text-slate-400">{label}</span><span className={`min-w-0 break-words text-right ${strong ? "text-base font-black text-emerald-100" : "font-bold text-slate-100"}`}>{value}</span></div>;
}
