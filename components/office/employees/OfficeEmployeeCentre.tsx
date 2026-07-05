"use client";

import { useMemo, useState } from "react";
import { Banknote, CalendarDays, ReceiptText, UsersRound } from "lucide-react";
import { recordOfficeEmployeeExpense, requestEmployeeAdvance, requestEmployeeOffDays } from "@/app/actions/employees";
import type { EmployeeManagementData, EmployeeProfile } from "@/lib/employee-management/types";

function money(value: number) {
    return `UGX ${Math.round(value || 0).toLocaleString()}`;
}

export default function OfficeEmployeeCentre({ data }: { data: EmployeeManagementData }) {
    const [selectedEmployeeId, setSelectedEmployeeId] = useState(data.employees[0]?.id ?? "");
    const selectedEmployee = useMemo(() => data.employees.find((employee) => employee.id === selectedEmployeeId) ?? data.employees[0] ?? null, [data.employees, selectedEmployeeId]);

    return (
        <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),transparent_28%),linear-gradient(135deg,#020617,#0f172a_52%,#111827)] px-4 pb-10 pt-5 text-white sm:px-6 lg:px-8">
            <section className="mx-auto max-w-[1500px] space-y-5">
                <div className="rounded-[28px] border border-white/10 bg-white/[0.055] p-5 shadow-2xl shadow-black/25 backdrop-blur-xl">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                        <div>
                            <p className="text-xs font-black uppercase tracking-wide text-cyan-100">Office Employee Centre</p>
                            <h1 className="mt-2 text-3xl font-black tracking-tight">Employee Expenses, Advances & Off Days</h1>
                            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Office accounts can record employee personal expenses and submit advance/off-day requests for admin approval.</p>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            <Mini label="Employees" value={data.totals.totalEmployees.toString()} />
                            <Mini label="Expenses" value={money(data.totals.totalExpenses)} />
                            <Mini label="Pending Requests" value={(data.advanceRequests.filter((item) => item.status === "pending").length + data.offDayRequests.filter((item) => item.status === "pending").length).toString()} />
                        </div>
                    </div>
                </div>

                {data.warnings.length > 0 ? (
                    <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">{data.warnings.slice(0, 3).join(" | ")}</div>
                ) : null}

                <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
                    <aside className="rounded-[24px] border border-white/10 bg-slate-950/50 p-4 shadow-xl shadow-black/20">
                        <div className="mb-3 flex items-center gap-2">
                            <UsersRound size={18} className="text-cyan-100" />
                            <h2 className="font-black">Employees in this office</h2>
                        </div>
                        <div className="space-y-2">
                            {data.employees.map((employee) => (
                                <button
                                    key={employee.id}
                                    type="button"
                                    onClick={() => setSelectedEmployeeId(employee.id)}
                                    className={`w-full rounded-2xl border p-3 text-left transition ${selectedEmployee?.id === employee.id ? "border-cyan-300/50 bg-cyan-300/10" : "border-white/10 bg-white/[0.045] hover:bg-white/[0.08]"}`}
                                >
                                    <p className="text-sm font-black">{employee.fullName}</p>
                                    <p className="mt-1 text-xs text-slate-400">{employee.roleName} | {employee.isFieldAgent ? "Field agent" : employee.employeeCode}</p>
                                    <p className="mt-2 text-xs font-black text-emerald-100">Final salary: {money(employee.finance.finalSalary)}</p>
                                </button>
                            ))}
                            {data.employees.length === 0 ? <Empty label="No employees assigned to this office." /> : null}
                        </div>
                    </aside>

                    <section className="space-y-4">
                        <EmployeeSummary employee={selectedEmployee} />
                        <div className="grid gap-4 2xl:grid-cols-3">
                            <OfficeExpenseForm employee={selectedEmployee} />
                            <AdvanceRequestForm employee={selectedEmployee} />
                            <OffDayRequestForm employee={selectedEmployee} />
                        </div>
                        <div className="grid gap-4 xl:grid-cols-2">
                            <RequestList title="Advance Requests" items={data.advanceRequests} />
                            <RequestList title="Off-Day Requests" items={data.offDayRequests} />
                        </div>
                    </section>
                </div>
            </section>
        </main>
    );
}

function EmployeeSummary({ employee }: { employee: EmployeeProfile | null }) {
    if (!employee) return <Panel title="Selected Employee" icon={<UsersRound size={18} />}><Empty label="Select an employee." /></Panel>;
    return (
        <Panel title="Selected Employee" icon={<UsersRound size={18} />}>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <Metric label="Name" value={employee.fullName} />
                <Metric label="Role" value={employee.roleName} />
                <Metric label="Off Days Available" value={`${employee.offDayBalance.availableDays}`} />
                <Metric label="Current Expenses" value={money(employee.finance.expenses)} />
                <Metric label="Final Salary" value={money(employee.finance.finalSalary)} />
            </div>
        </Panel>
    );
}

function OfficeExpenseForm({ employee }: { employee: EmployeeProfile | null }) {
    return (
        <Panel title="Record Personal Expense" icon={<ReceiptText size={18} />}>
            {employee ? (
                <form action={recordOfficeEmployeeExpense} className="space-y-3">
                    <input type="hidden" name="employeeId" value={employee.id} />
                    <input type="hidden" name="officeId" value={employee.officeId ?? ""} />
                    <Input name="amount" label="Amount" type="number" required />
                    <Input name="expenseDate" label="Date" type="date" />
                    <Textarea name="reason" label="Reason" required />
                    <Submit label="Submit Expense" />
                </form>
            ) : <Empty label="Select an employee first." />}
        </Panel>
    );
}

function AdvanceRequestForm({ employee }: { employee: EmployeeProfile | null }) {
    return (
        <Panel title="Request Advance" icon={<Banknote size={18} />}>
            {employee ? (
                <form action={requestEmployeeAdvance} className="space-y-3">
                    <input type="hidden" name="employeeId" value={employee.id} />
                    <input type="hidden" name="officeId" value={employee.officeId ?? ""} />
                    <Input name="amount" label="Advance amount" type="number" required />
                    <Textarea name="reason" label="Reason" required />
                    <Submit label="Send To Admin" />
                </form>
            ) : <Empty label="Select an employee first." />}
        </Panel>
    );
}

function OffDayRequestForm({ employee }: { employee: EmployeeProfile | null }) {
    return (
        <Panel title="Request Off Days" icon={<CalendarDays size={18} />}>
            {employee ? (
                <form action={requestEmployeeOffDays} className="space-y-3">
                    <input type="hidden" name="employeeId" value={employee.id} />
                    <input type="hidden" name="officeId" value={employee.officeId ?? ""} />
                    <Input name="startDate" label="Start date" type="date" required />
                    <Input name="endDate" label="End date" type="date" required />
                    <Textarea name="reason" label="Reason" />
                    <p className="text-xs text-slate-400">Maximum 7 days at once. Long carried leave must be requested at least 2 weeks earlier.</p>
                    <Submit label="Send Request" />
                </form>
            ) : <Empty label="Select an employee first." />}
        </Panel>
    );
}

function RequestList({ title, items }: { title: string; items: EmployeeManagementData["advanceRequests"] }) {
    return (
        <Panel title={title} icon={<CalendarDays size={18} />}>
            <div className="space-y-2">
                {items.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-white/10 bg-white/[0.045] p-3">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-sm font-black">{item.employeeName}</p>
                                <p className="mt-1 text-xs text-slate-400">{item.reason}</p>
                            </div>
                            <span className="rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[10px] font-black uppercase">{item.status}</span>
                        </div>
                        <p className="mt-2 text-xs text-slate-400">{item.amount ? money(item.amount) : `${item.requestedDays ?? 0} days`} | {item.createdAt ? new Date(item.createdAt).toLocaleString("en-UG") : "No date"}</p>
                    </div>
                ))}
                {items.length === 0 ? <Empty label="No requests yet." /> : null}
            </div>
        </Panel>
    );
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <section className="rounded-[24px] border border-white/10 bg-slate-950/50 p-4 shadow-xl shadow-black/20">
            <div className="mb-4 flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-2xl bg-cyan-300/12 text-cyan-100">{icon}</span>
                <h2 className="font-black">{title}</h2>
            </div>
            {children}
        </section>
    );
}

function Mini({ label, value }: { label: string; value: string }) {
    return <div className="rounded-2xl border border-white/10 bg-white/10 p-3"><p className="text-[10px] font-black uppercase text-slate-400">{label}</p><p className="mt-1 text-sm font-black">{value}</p></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
    return <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-3"><p className="text-[10px] font-black uppercase text-slate-400">{label}</p><p className="mt-1 break-words text-sm font-black">{value}</p></div>;
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement> & { name: string; label: string }) {
    const { label, ...inputProps } = props;
    return <label className="block"><span className="mb-1 block text-xs font-black uppercase text-slate-400">{label}</span><input className="h-10 w-full rounded-2xl border border-white/10 bg-white/10 px-3 text-sm font-semibold outline-none focus:border-cyan-300/60" {...inputProps} /></label>;
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { name: string; label: string }) {
    const { label, ...inputProps } = props;
    return <label className="block"><span className="mb-1 block text-xs font-black uppercase text-slate-400">{label}</span><textarea rows={3} className="w-full rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm font-semibold outline-none focus:border-cyan-300/60" {...inputProps} /></label>;
}

function Submit({ label }: { label: string }) {
    return <button type="submit" className="h-10 w-full rounded-2xl bg-cyan-300 px-4 text-sm font-black text-slate-950 shadow-lg shadow-cyan-500/15 transition hover:bg-cyan-200">{label}</button>;
}

function Empty({ label }: { label: string }) {
    return <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.035] p-4 text-sm text-slate-400">{label}</div>;
}
