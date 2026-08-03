"use client";

import { useMemo, useState } from "react";
import { Banknote, CalendarDays, Download, Filter, ReceiptText, Search, ShieldCheck, UsersRound } from "lucide-react";
import { recordSalaryPayment, updateEmployeeSalaryConfiguration } from "@/app/actions/salary";
import type { AdminPayrollCentreData, SalaryCardData, SalaryStatus } from "@/lib/salary-centre/types";

function money(value: number) {
    return `UGX ${Math.round(value || 0).toLocaleString()}`;
}

function statusClass(status: SalaryStatus) {
    if (status === "paid") return "border-emerald-300/30 bg-emerald-300/12 text-emerald-100";
    if (status === "partially_paid" || status === "due_today") return "border-amber-300/30 bg-amber-300/12 text-amber-100";
    if (status === "overdue" || status === "suspended") return "border-red-300/30 bg-red-300/12 text-red-100";
    if (status === "not_configured") return "border-slate-300/20 bg-slate-300/10 text-slate-200";
    return "border-cyan-300/30 bg-cyan-300/12 text-cyan-100";
}

export default function AdminPayrollCentre({ data }: { data: AdminPayrollCentreData }) {
    const [query, setQuery] = useState("");
    const [officeId, setOfficeId] = useState("");
    const [status, setStatus] = useState("");
    const [selectedId, setSelectedId] = useState(data.employees[0]?.employeeId ?? "");
    const filtered = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        return data.employees.filter((employee) => {
            if (officeId && employee.officeId !== officeId) return false;
            if (status && employee.status !== status) return false;
            if (!normalized) return true;
            return [employee.employeeName, employee.employeeCode, employee.officeName, employee.role].some((value) => value.toLowerCase().includes(normalized));
        });
    }, [data.employees, officeId, query, status]);
    const selected = data.employees.find((employee) => employee.employeeId === selectedId) ?? filtered[0] ?? data.employees[0] ?? null;

    return (
        <main className="min-h-screen px-4 pb-10 pt-5 text-white sm:px-6 lg:px-8">
            <section className="mx-auto max-w-[1800px] space-y-5">
                <div className="rounded-[28px] border border-white/10 bg-white/[0.06] p-5 shadow-2xl shadow-black/30 backdrop-blur-xl">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                        <div>
                            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black uppercase text-cyan-100"><ShieldCheck size={14} /> Admin only</div>
                            <h1 className="text-3xl font-black tracking-tight md:text-4xl">Payroll Centre</h1>
                            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Company salary configuration, payments, payslip status, and private employee payroll history for {data.companyName}.</p>
                        </div>
                        <button type="button" className="inline-flex h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 text-sm font-black text-white"><Download size={16} /> Export Payroll</button>
                    </div>
                </div>

                {data.warnings.length ? <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm font-bold text-amber-100">{data.warnings.join(" | ")}</div> : null}

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
                    <Kpi label="Total Monthly Payroll" value={money(data.totals.totalMonthlyPayroll)} tone="cyan" />
                    <Kpi label="Paid Salaries" value={money(data.totals.paidSalaries)} tone="emerald" />
                    <Kpi label="Outstanding Salaries" value={money(data.totals.outstandingSalaries)} tone="amber" />
                    <Kpi label="Due Today" value={data.totals.dueToday.toString()} tone="blue" />
                    <Kpi label="Overdue" value={data.totals.overdueSalaries.toString()} tone="red" />
                    <Kpi label="Partially Paid" value={data.totals.partiallyPaid.toString()} tone="purple" />
                    <Kpi label="Not Configured" value={data.totals.notConfigured.toString()} tone="slate" />
                </div>

                <div className="rounded-[24px] border border-white/10 bg-slate-950/50 p-4 shadow-xl shadow-black/20">
                    <div className="grid gap-3 lg:grid-cols-[1fr_220px_220px_auto] lg:items-end">
                        <label className="block">
                            <span className="mb-1 flex items-center gap-2 text-xs font-black uppercase text-slate-400"><Search size={13} /> Employee</span>
                            <input value={query} onChange={(event) => setQuery(event.target.value)} className="h-11 w-full rounded-2xl border border-white/10 bg-white/10 px-3 text-sm font-semibold outline-none focus:border-cyan-300/60" placeholder="Search employee, role, office..." />
                        </label>
                        <Select label="Office" icon={<Filter size={13} />} value={officeId} onChange={setOfficeId}>
                            <option value="">All offices</option>
                            {data.offices.map((office) => <option key={office.id} value={office.id}>{office.name}</option>)}
                        </Select>
                        <Select label="Status" icon={<CalendarDays size={13} />} value={status} onChange={setStatus}>
                            <option value="">All statuses</option>
                            {["upcoming", "due_today", "pending_payment", "partially_paid", "paid", "overdue", "suspended", "not_configured"].map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
                        </Select>
                        <button type="button" onClick={() => { setQuery(""); setOfficeId(""); setStatus(""); }} className="h-11 rounded-2xl border border-white/10 bg-white/10 px-4 text-sm font-black text-white">Clear</button>
                    </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_430px]">
                    <section className="grid min-w-0 gap-3 md:grid-cols-2 2xl:grid-cols-3">
                        {filtered.map((employee) => (
                            <button key={employee.employeeId} type="button" onClick={() => setSelectedId(employee.employeeId)} className={`min-w-0 rounded-[24px] border p-4 text-left shadow-xl shadow-black/20 transition hover:-translate-y-0.5 ${selected?.employeeId === employee.employeeId ? "border-cyan-300/40 bg-cyan-300/10" : "border-white/10 bg-slate-950/50 hover:bg-white/[0.065]"}`}>
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="break-words text-base font-black">{employee.employeeName}</p>
                                        <p className="mt-1 break-words text-xs font-bold text-slate-400">{employee.role} · {employee.officeName}</p>
                                    </div>
                                    <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-black uppercase ${statusClass(employee.status)}`}>{employee.statusLabel}</span>
                                </div>
                                <div className="mt-4 grid grid-cols-2 gap-2">
                                    <Mini label="Net Salary" value={money(employee.netSalary)} />
                                    <Mini label="Paid" value={money(employee.salaryAlreadyPaid)} />
                                    <Mini label="Remaining" value={money(employee.remainingSalaryBalance)} />
                                    <Mini label="Salary Date" value={employee.salaryPaymentDate ?? "Not set"} />
                                </div>
                            </button>
                        ))}
                    </section>
                    <aside className="min-w-0 space-y-4">
                        {selected ? <PayrollForms employee={selected} /> : <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.04] p-5 text-sm text-slate-400">Select an employee to configure salary or record payment.</div>}
                    </aside>
                </div>
            </section>
        </main>
    );
}

function PayrollForms({ employee }: { employee: SalaryCardData }) {
    return (
        <>
            <Panel title="Salary Configuration" icon={<UsersRound size={18} />}>
                <form action={updateEmployeeSalaryConfiguration} className="grid gap-3">
                    <input type="hidden" name="employeeId" value={employee.employeeId} />
                    <Input label="Monthly Salary" name="monthlySalary" type="number" defaultValue={employee.monthlySalary} required />
                    <Input label="Salary Payment Day" name="salaryPaymentDay" type="number" min={1} max={31} defaultValue={employee.salaryPaymentDay} required />
                    <SelectField label="Salary Type" name="salaryType" defaultValue="monthly"><option value="monthly">Fixed Salary</option><option value="contract">Contract</option><option value="allowance">Allowance based</option></SelectField>
                    <SelectField label="Employment Status" name="employmentStatus" defaultValue={employee.employmentStatus}><option value="active">Active</option><option value="suspended">Suspended</option><option value="inactive">Inactive</option><option value="terminated">Terminated</option></SelectField>
                    <Input label="Payment Method" name="paymentMethod" placeholder="Cash, bank, mobile money..." />
                    <button className="h-11 rounded-2xl bg-cyan-300 px-4 text-sm font-black text-slate-950">Save Salary Settings</button>
                </form>
            </Panel>
            <Panel title="Record Salary Payment" icon={<Banknote size={18} />}>
                <form action={recordSalaryPayment} className="grid gap-3">
                    <input type="hidden" name="employeeId" value={employee.employeeId} />
                    <input type="hidden" name="officeId" value={employee.officeId ?? ""} />
                    <Input label="Amount Paid" name="paidAmount" type="number" max={employee.remainingSalaryBalance || undefined} required />
                    <SelectField label="Payment Method" name="paymentMethod"><option value="cash">Cash</option><option value="bank">Bank</option><option value="mobile_money">Mobile Money</option></SelectField>
                    <Input label="Reference" name="reference" />
                    <Textarea label="Notes" name="notes" />
                    <button className="h-11 rounded-2xl bg-emerald-300 px-4 text-sm font-black text-slate-950">Record Payment</button>
                </form>
            </Panel>
            <Panel title="Payslip Snapshot" icon={<ReceiptText size={18} />}>
                <div className="space-y-2 text-sm">
                    <Line label="Period" value={employee.salaryPeriod} />
                    <Line label="Gross" value={money(employee.monthlySalary)} />
                    <Line label="Allowances" value={money(employee.allowances)} />
                    <Line label="Deductions" value={money(employee.deductions)} />
                    <Line label="Net" value={money(employee.netSalary)} strong />
                    <Line label="Remaining" value={money(employee.remainingSalaryBalance)} strong />
                </div>
            </Panel>
        </>
    );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: string }) {
    const toneMap: Record<string, string> = { emerald: "from-emerald-400/18", cyan: "from-cyan-400/18", amber: "from-amber-400/18", red: "from-red-400/18", blue: "from-blue-400/18", purple: "from-purple-400/18", slate: "from-slate-400/18" };
    return <div className={`min-w-0 rounded-[22px] border border-white/10 bg-gradient-to-br ${toneMap[tone] ?? toneMap.cyan} to-white/[0.045] p-4 shadow-xl shadow-black/20`}><p className="text-[10px] font-black uppercase text-slate-400">{label}</p><p className="mt-2 break-words text-xl font-black">{value}</p></div>;
}

function Mini({ label, value }: { label: string; value: string }) {
    return <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.045] p-3"><p className="text-[10px] font-black uppercase text-slate-400">{label}</p><p className="mt-1 break-words text-sm font-black">{value}</p></div>;
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
    return <section className="rounded-[24px] border border-white/10 bg-slate-950/55 p-4 shadow-xl shadow-black/20"><div className="mb-4 flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-2xl bg-cyan-300/12 text-cyan-100">{icon}</span><h2 className="font-black">{title}</h2></div>{children}</section>;
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }) {
    const { label, ...inputProps } = props;
    return <label className="block"><span className="mb-1 block text-xs font-black uppercase text-slate-400">{label}</span><input className="h-10 w-full rounded-2xl border border-white/10 bg-white/10 px-3 text-sm font-semibold outline-none focus:border-cyan-300/60" {...inputProps} /></label>;
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; name: string }) {
    const { label, ...inputProps } = props;
    return <label className="block"><span className="mb-1 block text-xs font-black uppercase text-slate-400">{label}</span><textarea rows={3} className="w-full rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm font-semibold outline-none focus:border-cyan-300/60" {...inputProps} /></label>;
}

function Select({ label, icon, value, onChange, children }: { label: string; icon: React.ReactNode; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
    return <label className="block"><span className="mb-1 flex items-center gap-2 text-xs font-black uppercase text-slate-400">{icon}{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-11 w-full rounded-2xl border border-white/10 bg-slate-900 px-3 text-sm font-semibold outline-none focus:border-cyan-300/60">{children}</select></label>;
}

function SelectField(props: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; name: string; children: React.ReactNode }) {
    const { label, children, ...selectProps } = props;
    return <label className="block"><span className="mb-1 block text-xs font-black uppercase text-slate-400">{label}</span><select className="h-10 w-full rounded-2xl border border-white/10 bg-slate-900 px-3 text-sm font-semibold outline-none focus:border-cyan-300/60" {...selectProps}>{children}</select></label>;
}

function Line({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
    return <div className="flex items-start justify-between gap-3"><span className="min-w-0 text-slate-400">{label}</span><span className={`min-w-0 break-words text-right ${strong ? "text-base font-black text-emerald-100" : "font-bold text-slate-100"}`}>{value}</span></div>;
}
