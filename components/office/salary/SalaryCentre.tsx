import { BadgeCheck, Banknote, CalendarDays, FileText, History, WalletCards } from "lucide-react";
import type { PersonalSalaryCentreData, SalaryCardData, SalaryStatus } from "@/lib/salary-centre/types";

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

export default function SalaryCentre({ data }: { data: PersonalSalaryCentreData }) {
    return (
        <main className="min-h-screen px-4 pb-10 pt-5 text-white sm:px-6 lg:px-8">
            <section className="mx-auto max-w-[1500px] space-y-5">
                <div className="rounded-[28px] border border-white/10 bg-white/[0.06] p-5 shadow-2xl shadow-black/30 backdrop-blur-xl">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                        <div>
                            <p className="text-xs font-black uppercase tracking-wide text-cyan-100">Personal Salary Centre</p>
                            <h1 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">My Salary</h1>
                            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">Private payroll status, countdown, payment history, and payslip access for your personal employee account.</p>
                        </div>
                        {data.employee ? <span className={`rounded-full border px-3 py-2 text-xs font-black uppercase ${statusClass(data.employee.status)}`}>{data.employee.statusLabel}</span> : null}
                    </div>
                </div>
                {data.warnings.length ? <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm font-bold text-amber-100">{data.warnings.join(" | ")}</div> : null}
                {data.employee ? <SalaryCard employee={data.employee} /> : <Empty title="No employee salary profile" detail="This account is not linked to a real active employee record, so salary information is not shown." />}
                {data.employee ? <HistoryPanel history={data.history} /> : null}
            </section>
        </main>
    );
}

export function SalaryCard({ employee }: { employee: SalaryCardData }) {
    const progress = employee.netSalary > 0 ? Math.min(100, Math.round((employee.salaryAlreadyPaid / employee.netSalary) * 100)) : 0;
    return (
        <section className="grid gap-4 xl:grid-cols-[1fr_380px]">
            <div className="rounded-[28px] border border-white/10 bg-slate-950/55 p-5 shadow-xl shadow-black/25">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                        <p className="text-xs font-black uppercase text-slate-400">Employee</p>
                        <h2 className="mt-1 text-2xl font-black">{employee.employeeName}</h2>
                        <p className="mt-1 text-sm font-bold text-slate-300">{employee.role} · {employee.officeName}</p>
                    </div>
                    <span className={`w-fit rounded-full border px-3 py-1.5 text-xs font-black uppercase ${statusClass(employee.status)}`}>{employee.statusLabel}</span>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <Metric icon={<Banknote size={17} />} label="Monthly Salary" value={money(employee.monthlySalary)} />
                    <Metric icon={<CalendarDays size={17} />} label="Salary Date" value={employee.salaryPaymentDate ?? "Not set"} />
                    <Metric icon={<WalletCards size={17} />} label="Already Paid" value={money(employee.salaryAlreadyPaid)} />
                    <Metric icon={<BadgeCheck size={17} />} label="Remaining Salary" value={money(employee.remainingSalaryBalance)} />
                </div>
                <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.045] p-4">
                    <div className="flex items-center justify-between gap-3 text-sm font-black">
                        <span>{employee.countdownLabel}</span>
                        <span>{progress}% paid</span>
                    </div>
                    <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-emerald-300 to-lime-300" style={{ width: `${progress}%` }} />
                    </div>
                    <p className="mt-3 text-sm font-bold text-slate-300">
                        {employee.status === "not_configured"
                            ? "Salary has not yet been configured."
                            : employee.status === "paid"
                                ? `Salary received for ${employee.salaryPeriod}.`
                                : `Next salary date: ${employee.nextSalaryDate ?? "Not set"}`}
                    </p>
                </div>
            </div>
            <div className="rounded-[28px] border border-white/10 bg-white/[0.055] p-5 shadow-xl shadow-black/25 backdrop-blur-xl">
                <div className="flex items-center gap-2">
                    <FileText size={18} className="text-cyan-100" />
                    <h3 className="font-black">Latest Payslip</h3>
                </div>
                <div className="mt-4 space-y-3">
                    <Line label="Salary Period" value={employee.salaryPeriod} />
                    <Line label="Gross Salary" value={money(employee.monthlySalary)} />
                    <Line label="Allowances" value={money(employee.allowances)} />
                    <Line label="Deductions" value={money(employee.deductions)} />
                    <Line label="Net Salary" value={money(employee.netSalary)} strong />
                    <Line label="Last Payment" value={employee.lastSalaryPaymentDate ? `${money(employee.lastSalaryAmount)} · ${new Date(employee.lastSalaryPaymentDate).toLocaleDateString("en-UG")}` : "No payment yet"} />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                    <button className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-black text-white">Preview</button>
                    <button className="rounded-2xl bg-cyan-300 px-3 py-2 text-xs font-black text-slate-950">Download PDF</button>
                </div>
            </div>
        </section>
    );
}

function HistoryPanel({ history }: { history: SalaryCardData[] }) {
    return (
        <section className="rounded-[28px] border border-white/10 bg-slate-950/55 p-5 shadow-xl shadow-black/25">
            <div className="mb-4 flex items-center gap-2"><History size={18} className="text-cyan-100" /><h2 className="font-black">Salary History</h2></div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {history.map((item) => (
                    <div key={item.salaryPeriod} className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
                        <div className="flex items-center justify-between gap-2">
                            <p className="font-black">{item.salaryPeriod}</p>
                            <span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase ${statusClass(item.status)}`}>{item.statusLabel}</span>
                        </div>
                        <div className="mt-3 space-y-2 text-sm">
                            <Line label="Salary Due" value={money(item.netSalary)} />
                            <Line label="Amount Paid" value={money(item.salaryAlreadyPaid)} />
                            <Line label="Remaining" value={money(item.remainingSalaryBalance)} />
                            <Line label="Payment Date" value={item.lastSalaryPaymentDate ? new Date(item.lastSalaryPaymentDate).toLocaleDateString("en-UG") : "Not paid"} />
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4"><div className="text-cyan-100">{icon}</div><p className="mt-3 text-[10px] font-black uppercase text-slate-400">{label}</p><p className="mt-1 break-words text-lg font-black">{value}</p></div>;
}

function Line({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
    return <div className="flex items-start justify-between gap-3"><span className="min-w-0 text-slate-400">{label}</span><span className={`min-w-0 break-words text-right ${strong ? "text-base font-black text-emerald-100" : "font-bold text-slate-100"}`}>{value}</span></div>;
}

function Empty({ title, detail }: { title: string; detail: string }) {
    return <div className="rounded-[28px] border border-dashed border-white/10 bg-white/[0.04] p-8 text-center"><h2 className="text-xl font-black">{title}</h2><p className="mt-2 text-sm text-slate-400">{detail}</p></div>;
}
