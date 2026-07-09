"use client";

import { useMemo, useState, useTransition } from "react";
import {
    AlertTriangle,
    Banknote,
    BriefcaseBusiness,
    CalendarDays,
    ContactRound,
    FileBadge,
    FileText,
    Landmark,
    Medal,
    Plus,
    ReceiptText,
    ShieldAlert,
    UploadCloud,
    UserMinus,
    UsersRound,
} from "lucide-react";
import {
    addEmployeeDocument,
    addEmployeePayrollItem,
    addEmployeeReference,
    assignEmployeeOffice,
    createEmployee,
    decideEmployeeAdvanceRequest,
    decideEmployeeOffDayRequest,
    generateEmployeeContract,
    markEmployeeSalaryPaid,
    terminateEmployee,
    updateEmployee,
    updateEmployeeProbation,
} from "@/app/actions/employees";
import type { EmployeeManagementData, EmployeeProfile } from "@/lib/employee-management/types";

type TabKey = "overview" | "employees" | "payroll" | "advances" | "expenses" | "fines" | "off-days" | "performance" | "contracts" | "documents" | "terminations" | "audit";

const tabs: Array<{ key: TabKey; label: string }> = [
    { key: "overview", label: "Overview" },
    { key: "employees", label: "Employees" },
    { key: "payroll", label: "Payroll" },
    { key: "advances", label: "Advances" },
    { key: "expenses", label: "Expenses" },
    { key: "fines", label: "Fines" },
    { key: "off-days", label: "Off Days" },
    { key: "performance", label: "Performance League" },
    { key: "contracts", label: "Contracts" },
    { key: "documents", label: "Documents" },
    { key: "terminations", label: "Terminations" },
    { key: "audit", label: "Audit History" },
];

function money(value: number) {
    return `UGX ${Math.round(value || 0).toLocaleString()}`;
}

function statusClass(status: string) {
    const normalized = status.toLowerCase();
    if (normalized.includes("paid") && !normalized.includes("unpaid")) return "border-emerald-400/30 bg-emerald-400/12 text-emerald-100";
    if (normalized.includes("partial")) return "border-amber-400/30 bg-amber-400/12 text-amber-100";
    if (normalized.includes("terminated") || normalized.includes("suspended") || normalized.includes("fine")) return "border-red-400/30 bg-red-400/12 text-red-100";
    return "border-sky-400/30 bg-sky-400/12 text-sky-100";
}

const ALL_ROUNDER_OFFICE_VALUE = "all_rounder";

function officeOptions(offices: EmployeeManagementData["offices"]) {
    return [
        { value: ALL_ROUNDER_OFFICE_VALUE, label: "All Rounder / All Offices" },
        ...offices.map((office) => ({ value: office.id, label: office.name })),
    ];
}

export default function EmployeeManagementCentre({ data }: { data: EmployeeManagementData }) {
    const [activeTab, setActiveTab] = useState<TabKey>("overview");
    const [query, setQuery] = useState("");
    const [assignmentFilter, setAssignmentFilter] = useState<"all" | "fixed_office" | "all_rounder">("all");
    const [selectedEmployeeId, setSelectedEmployeeId] = useState(data.employees[0]?.id ?? "");

    const filteredEmployees = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        return data.employees.filter((employee) => {
            if (assignmentFilter !== "all" && employee.assignmentType !== assignmentFilter) return false;
            if (!normalized) return true;
            return [
            employee.fullName,
            employee.employeeCode,
            employee.phone,
            employee.officeName,
            employee.roleName,
            employee.status,
            employee.assignmentType === "all_rounder" ? "all rounder all offices" : "fixed office",
        ].some((item) => item.toLowerCase().includes(normalized));
        });
    }, [assignmentFilter, data.employees, query]);

    const selectedEmployee = data.employees.find((employee) => employee.id === selectedEmployeeId) ?? filteredEmployees[0] ?? data.employees[0] ?? null;

    return (
        <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.2),transparent_28%),radial-gradient(circle_at_80%_0%,rgba(16,185,129,0.18),transparent_26%),linear-gradient(135deg,#020617_0%,#0f172a_45%,#111827_100%)] px-4 pb-10 pt-5 text-slate-100 sm:px-6 lg:px-8">
            <section className="mx-auto max-w-[1800px] space-y-5">
                <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.055] p-5 shadow-2xl shadow-black/30 backdrop-blur-xl">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                        <div>
                            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black uppercase tracking-wide text-cyan-100">
                                <UsersRound size={14} />
                                Admin Only
                            </div>
                            <h1 className="text-3xl font-black tracking-tight text-white md:text-4xl">Employee Management Centre</h1>
                            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                                Live HR, payroll, performance, contracts, documents, fines, advances, and employee records for {data.companyName}.
                            </p>
                        </div>
                        <div className="grid min-w-full grid-cols-2 gap-2 sm:min-w-[560px] sm:grid-cols-4">
                            <MiniMetric label="Month" value={data.monthKey.slice(0, 7)} />
                            <MiniMetric label="Employees" value={data.totals.totalEmployees.toLocaleString()} />
                            <MiniMetric label="Active" value={data.totals.activeEmployees.toLocaleString()} />
                            <MiniMetric label="Due Soon" value={data.totals.salariesDueSoon.toLocaleString()} />
                        </div>
                    </div>
                </div>

                {data.warnings.length > 0 && (
                    <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">
                        <div className="flex items-center gap-2 font-black"><AlertTriangle size={16} /> Live data warnings</div>
                        <p className="mt-2 text-amber-50/80">{data.warnings.slice(0, 3).join(" | ")}</p>
                    </div>
                )}

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <Kpi icon={<UsersRound size={19} />} label="Total Employees" value={data.totals.totalEmployees.toLocaleString()} hint="Company employee directory" tone="blue" />
                    <Kpi icon={<Landmark size={19} />} label="Final Salary Payable" value={money(data.totals.totalFinalSalaryPayable)} hint="Basic + bonuses - expenses - advances - fines" tone="emerald" />
                    <Kpi icon={<Banknote size={19} />} label="Outstanding Salaries" value={money(data.totals.outstandingSalaries)} hint="Current month payroll liability" tone="red" />
                    <Kpi icon={<ShieldAlert size={19} />} label="Company Savings From Fines" value={money(data.totals.companySavingsFromFines)} hint="Fine deductions this month" tone="purple" />
                </div>

                <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
                    <aside className="space-y-4">
                        <div className="rounded-[24px] border border-white/10 bg-slate-950/50 p-4 shadow-xl shadow-black/20">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="text-xs font-black uppercase text-slate-400">Employee Search</p>
                                    <h2 className="text-lg font-black text-white">Directory</h2>
                                </div>
                                <span className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-xs font-bold text-slate-200">{filteredEmployees.length}</span>
                            </div>
                            <input
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                className="mt-3 h-11 w-full rounded-2xl border border-white/10 bg-white/10 px-3 text-sm font-semibold text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/60"
                                placeholder="Search employee, office, role..."
                            />
                            <div className="mt-2 grid grid-cols-3 gap-2">
                                {[
                                    { key: "all" as const, label: "All" },
                                    { key: "fixed_office" as const, label: "Fixed" },
                                    { key: "all_rounder" as const, label: "All Rounders" },
                                ].map((item) => (
                                    <button
                                        key={item.key}
                                        type="button"
                                        onClick={() => setAssignmentFilter(item.key)}
                                        className={`h-9 rounded-xl text-[11px] font-black uppercase ${assignmentFilter === item.key ? "bg-cyan-300 text-slate-950" : "border border-white/10 bg-white/8 text-slate-300"}`}
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                            <div className="mt-3 max-h-[560px] space-y-2 overflow-auto pr-1">
                                {filteredEmployees.map((employee) => (
                                    <button
                                        key={employee.id}
                                        type="button"
                                        onClick={() => setSelectedEmployeeId(employee.id)}
                                        className={`w-full rounded-2xl border p-3 text-left transition hover:-translate-y-0.5 ${selectedEmployee?.id === employee.id ? "border-cyan-300/50 bg-cyan-300/10" : "border-white/10 bg-white/[0.045] hover:bg-white/[0.08]"}`}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <p className="text-sm font-black text-white">{employee.fullName}</p>
                                                <p className="mt-1 text-xs text-slate-400">{employee.officeName} | {employee.roleName}</p>
                                            </div>
                                            <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-black uppercase ${statusClass(employee.status)}`}>{employee.status}</span>
                                        </div>
                                        <div className="mt-2 flex items-center justify-between text-xs text-slate-300">
                                            <span>{employee.employeeCode}</span>
                                            {employee.assignmentType === "all_rounder" && <span className="rounded-full border border-violet-300/30 bg-violet-300/10 px-2 py-0.5 font-black text-violet-100">All Rounder</span>}
                                            <span className="font-black text-emerald-100">{money(employee.finance.finalSalary)}</span>
                                        </div>
                                    </button>
                                ))}
                                {filteredEmployees.length === 0 && <Empty label="No employees match this search." />}
                            </div>
                        </div>
                    </aside>

                    <section className="min-w-0 space-y-4">
                        <div className="rounded-[24px] border border-white/10 bg-slate-950/45 p-3 shadow-xl shadow-black/20">
                            <div className="flex gap-2 overflow-x-auto pb-1">
                                {tabs.map((tab) => (
                                    <button
                                        key={tab.key}
                                        type="button"
                                        onClick={() => setActiveTab(tab.key)}
                                        className={`shrink-0 rounded-2xl px-3 py-2 text-xs font-black transition ${activeTab === tab.key ? "bg-cyan-300 text-slate-950 shadow-lg shadow-cyan-500/20" : "bg-white/8 text-slate-300 hover:bg-white/12 hover:text-white"}`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {activeTab === "overview" && <Overview data={data} selectedEmployee={selectedEmployee} />}
                        {activeTab === "employees" && <EmployeeForms data={data} selectedEmployee={selectedEmployee} />}
                        {activeTab === "payroll" && <PayrollPanel selectedEmployee={selectedEmployee} />}
                        {activeTab === "advances" && <AdvanceRequestsPanel data={data} selectedEmployee={selectedEmployee} />}
                        {activeTab === "expenses" && <ExpenseReviewPanel data={data} selectedEmployee={selectedEmployee} />}
                        {activeTab === "fines" && <PayrollItemPanel selectedEmployee={selectedEmployee} itemType="fine" title="Employee Fines" description="Late arrival, absence, misconduct, unauthorized leave, or custom fines." />}
                        {activeTab === "off-days" && <OffDaysPanel data={data} selectedEmployee={selectedEmployee} />}
                        {activeTab === "performance" && <PerformanceLeague data={data} />}
                        {activeTab === "contracts" && <ContractsPanel selectedEmployee={selectedEmployee} />}
                        {activeTab === "documents" && <DocumentsPanel selectedEmployee={selectedEmployee} />}
                        {activeTab === "terminations" && <TerminationPanel selectedEmployee={selectedEmployee} />}
                        {activeTab === "audit" && <AuditPanel />}
                    </section>
                </div>
            </section>
        </main>
    );
}

function Overview({ data, selectedEmployee }: { data: EmployeeManagementData; selectedEmployee: EmployeeProfile | null }) {
    return (
        <div className="grid gap-4 2xl:grid-cols-[1fr_420px]">
            <GlassPanel title="Company Payroll Overview" icon={<Banknote size={18} />}>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <MetricLine label="Basic Salaries" value={money(data.totals.totalBasicSalaries)} />
                    <MetricLine label="Bonuses" value={money(data.totals.totalBonuses)} />
                    <MetricLine label="Expenses" value={money(data.totals.totalExpenses)} />
                    <MetricLine label="Advances" value={money(data.totals.totalAdvances)} />
                    <MetricLine label="Fines" value={money(data.totals.totalFines)} />
                    <MetricLine label="Lunch Earned" value={money(data.totals.totalLunchEarned)} />
                    <MetricLine label="Lunch Taken" value={money(data.totals.totalLunchTaken)} />
                    <MetricLine label="Unused Lunch Balance" value={money(data.totals.totalUnusedLunchBalance)} />
                    <MetricLine label="Paid This Month" value={money(data.totals.salariesPaidThisMonth)} />
                </div>
            </GlassPanel>
            <EmployeeSnapshot employee={selectedEmployee} />
        </div>
    );
}

function EmployeeForms({ data, selectedEmployee }: { data: EmployeeManagementData; selectedEmployee: EmployeeProfile | null }) {
    return (
        <div className="grid gap-4 2xl:grid-cols-2">
            <GlassPanel title="Add Employee" icon={<Plus size={18} />}>
                <form action={createEmployee} className="grid gap-3 md:grid-cols-2">
                    <TextInput name="fullName" label="Employee name" required />
                    <TextInput name="employeeCode" label="Employee ID" />
                    <TextInput name="age" label="Age" type="number" />
                    <TextInput name="phone" label="Phone" />
                    <TextInput name="email" label="Email" />
                    <SelectInput name="officeId" label="Office" options={officeOptions(data.offices)} />
                    <SelectInput name="roleId" label="Role" options={data.roles.map((role) => ({ value: role.id, label: role.name }))} />
                    <TextInput name="roleName" label="Role name fallback" />
                    <TextInput name="startDate" label="Employment start date" type="date" />
                    <TextInput name="basicSalary" label="Basic salary" type="number" />
                    <TextInput name="dailyLunchAllowance" label="Daily lunch allowance" type="number" placeholder="7000" />
                    <SelectInput name="advanceDeductionRule" label="Advance deduction rule" options={[
                        { value: "deduct_current_salary", label: "Deduct current salary" },
                        { value: "deduct_next_salary", label: "Deduct next salary" },
                        { value: "manual_review", label: "Manual review" },
                    ]} />
                    <TextInput name="probationStartDate" label="Probation start" type="date" />
                    <TextInput name="probationEndDate" label="Probation end" type="date" />
                    <TextInput name="probationSalary" label="Probation salary" type="number" />
                    <TextInput name="normalSalaryAfterProbation" label="Normal salary after probation" type="number" />
                    <TextInput name="salaryDay" label="Salary receiving day" type="number" defaultValue="28" />
                    <TextInput name="offDays" label="Off days" placeholder="Sunday, Monday" />
                    <label className="flex h-10 items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-3 text-sm font-black text-white">
                        <input type="checkbox" name="isFieldAgent" className="h-4 w-4 accent-cyan-300" />
                        Field agent
                    </label>
                    <SelectInput name="probationStatus" label="Probation status" options={[{ value: "in_probation", label: "In probation" }, { value: "confirmed", label: "Confirmed" }, { value: "extended", label: "Extended" }, { value: "not_started", label: "Not started" }]} />
                    <SelectInput name="status" label="Status" options={[{ value: "active", label: "Active" }, { value: "suspended", label: "Suspended" }, { value: "terminated", label: "Terminated" }]} />
                    <Textarea name="notes" label="Notes" className="md:col-span-2" />
                    <SubmitButton label="Add Employee" className="md:col-span-2" />
                </form>
            </GlassPanel>

            <GlassPanel title="Edit Selected Employee" icon={<ContactRound size={18} />}>
                {selectedEmployee ? (
                    <form action={updateEmployee} className="grid gap-3 md:grid-cols-2">
                        <input type="hidden" name="employeeId" value={selectedEmployee.id} />
                        <TextInput name="fullName" label="Employee name" defaultValue={selectedEmployee.fullName} required />
                        <TextInput name="employeeCode" label="Employee ID" defaultValue={selectedEmployee.employeeCode} />
                        <TextInput name="age" label="Age" type="number" defaultValue={selectedEmployee.age ?? ""} />
                        <TextInput name="phone" label="Phone" defaultValue={selectedEmployee.phone} />
                        <TextInput name="email" label="Email" defaultValue={selectedEmployee.email} />
                        <SelectInput name="officeId" label="Office" defaultValue={selectedEmployee.assignmentType === "all_rounder" ? ALL_ROUNDER_OFFICE_VALUE : selectedEmployee.officeId ?? ""} options={officeOptions(data.offices)} />
                        <SelectInput name="roleId" label="Role" defaultValue={selectedEmployee.roleId ?? ""} options={data.roles.map((role) => ({ value: role.id, label: role.name }))} />
                        <TextInput name="roleName" label="Role name" defaultValue={selectedEmployee.roleName} />
                        <TextInput name="startDate" label="Employment start date" type="date" defaultValue={selectedEmployee.startDate} />
                        <TextInput name="basicSalary" label="Basic salary" type="number" defaultValue={selectedEmployee.basicSalary} />
                        <TextInput name="dailyLunchAllowance" label="Daily lunch allowance" type="number" defaultValue={selectedEmployee.dailyLunchAllowance} />
                        <SelectInput name="advanceDeductionRule" label="Advance deduction rule" defaultValue={selectedEmployee.advanceDeductionRule} options={[
                            { value: "deduct_current_salary", label: "Deduct current salary" },
                            { value: "deduct_next_salary", label: "Deduct next salary" },
                            { value: "manual_review", label: "Manual review" },
                        ]} />
                        <TextInput name="probationStartDate" label="Probation start" type="date" defaultValue={selectedEmployee.probationStartDate} />
                        <TextInput name="probationEndDate" label="Probation end" type="date" defaultValue={selectedEmployee.probationEndDate} />
                        <TextInput name="probationSalary" label="Probation salary" type="number" defaultValue={selectedEmployee.probationSalary} />
                        <TextInput name="normalSalaryAfterProbation" label="Normal salary after probation" type="number" defaultValue={selectedEmployee.normalSalaryAfterProbation} />
                        <TextInput name="salaryDay" label="Salary receiving day" type="number" defaultValue={selectedEmployee.salaryDay} />
                        <TextInput name="offDays" label="Off days" defaultValue={selectedEmployee.offDays.join(", ")} />
                        <label className="flex h-10 items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-3 text-sm font-black text-white">
                            <input type="checkbox" name="isFieldAgent" defaultChecked={selectedEmployee.isFieldAgent} className="h-4 w-4 accent-cyan-300" />
                            Field agent
                        </label>
                        <SelectInput name="probationStatus" label="Probation status" defaultValue={selectedEmployee.probationStatus} options={[{ value: "in_probation", label: "In probation" }, { value: "confirmed", label: "Confirmed" }, { value: "extended", label: "Extended" }, { value: "not_started", label: "Not started" }]} />
                        <SelectInput name="status" label="Status" defaultValue={selectedEmployee.status} options={[{ value: "active", label: "Active" }, { value: "suspended", label: "Suspended" }, { value: "terminated", label: "Terminated" }]} />
                        <Textarea name="notes" label="Notes" defaultValue={selectedEmployee.notes} className="md:col-span-2" />
                        <SubmitButton label="Save Employee" className="md:col-span-2" />
                    </form>
                ) : <Empty label="Select an employee to edit." />}
            </GlassPanel>

            <GlassPanel title="Emergency / Reference Persons" icon={<ContactRound size={18} />}>
                {selectedEmployee ? (
                    <div className="space-y-3">
                        <div className="grid gap-2 md:grid-cols-3">
                            {selectedEmployee.references.length > 0 ? selectedEmployee.references.map((ref, index) => (
                                <div key={`${ref.name}-${index}`} className="rounded-2xl border border-white/10 bg-white/[0.045] p-3">
                                    <p className="text-sm font-black text-white">{ref.name}</p>
                                    <p className="text-xs text-slate-400">{ref.relationship || "Reference"}</p>
                                    <p className="mt-2 text-xs font-bold text-cyan-100">{ref.phone || "No phone"}</p>
                                </div>
                            )) : <Empty label="No references recorded yet." />}
                        </div>
                        <form action={addEmployeeReference} className="grid gap-3 md:grid-cols-3">
                            <input type="hidden" name="employeeId" value={selectedEmployee.id} />
                            <input type="hidden" name="officeId" value={selectedEmployee.officeId ?? ""} />
                            <TextInput name="referenceName" label="Reference name" required />
                            <TextInput name="relationship" label="Relationship" />
                            <TextInput name="referencePhone" label="Phone" />
                            <SubmitButton label="Add Reference" className="md:col-span-3" />
                        </form>
                    </div>
                ) : <Empty label="Select an employee first." />}
            </GlassPanel>

            <GlassPanel title="Probation & Office Assignment" icon={<BriefcaseBusiness size={18} />}>
                {selectedEmployee ? (
                    <div className="grid gap-4 xl:grid-cols-2">
                        <form action={updateEmployeeProbation} className="grid gap-3 md:grid-cols-2">
                            <input type="hidden" name="employeeId" value={selectedEmployee.id} />
                            <TextInput name="probationStartDate" label="Probation start" type="date" defaultValue={selectedEmployee.probationStartDate} />
                            <TextInput name="probationEndDate" label="Probation end" type="date" defaultValue={selectedEmployee.probationEndDate} />
                            <TextInput name="probationSalary" label="Probation salary" type="number" defaultValue={selectedEmployee.probationSalary} />
                            <TextInput name="normalSalaryAfterProbation" label="Normal salary" type="number" defaultValue={selectedEmployee.normalSalaryAfterProbation || selectedEmployee.basicSalary} />
                            <SelectInput name="probationStatus" label="Admin decision" defaultValue={selectedEmployee.probationStatus} options={[
                                { value: "in_probation", label: "In probation" },
                                { value: "confirmed", label: "Confirm employee" },
                                { value: "extended", label: "Extend probation" },
                                { value: "terminated", label: "Terminate from probation" },
                            ]} />
                            <SubmitButton label="Save Probation Decision" className="md:col-span-2" />
                        </form>
                        <form action={assignEmployeeOffice} className="grid gap-3 md:grid-cols-2">
                            <input type="hidden" name="employeeId" value={selectedEmployee.id} />
                            <SelectInput name="officeId" label="Assign office" defaultValue={selectedEmployee.assignmentType === "all_rounder" ? ALL_ROUNDER_OFFICE_VALUE : selectedEmployee.officeId ?? ""} options={officeOptions(data.offices)} />
                            <SelectInput name="assignmentType" label="Assignment type" options={[{ value: "active", label: "Active office" }, { value: "temporary", label: "Temporary" }, { value: "support", label: "Support office" }]} />
                            <TextInput name="effectiveFrom" label="Effective from" type="date" />
                            <TextInput name="effectiveTo" label="Effective to" type="date" />
                            <label className="flex h-10 items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-3 text-sm font-black text-white">
                                <input type="checkbox" name="isFieldAgent" defaultChecked={selectedEmployee.isFieldAgent} className="h-4 w-4 accent-cyan-300" />
                                Multi-office field agent
                            </label>
                            <Textarea name="reason" label="Reason" className="md:col-span-2" />
                            <SubmitButton label="Save Assignment" className="md:col-span-2" />
                        </form>
                    </div>
                ) : <Empty label="Select an employee first." />}
            </GlassPanel>
        </div>
    );
}

function PayrollPanel({ selectedEmployee }: { selectedEmployee: EmployeeProfile | null }) {
    return (
        <div className="grid gap-4 2xl:grid-cols-[1fr_420px]">
            <GlassPanel title="Salary Payment" icon={<Banknote size={18} />}>
                {selectedEmployee ? (
                    <form action={markEmployeeSalaryPaid} className="grid gap-3 md:grid-cols-2">
                        <input type="hidden" name="employeeId" value={selectedEmployee.id} />
                        <input type="hidden" name="officeId" value={selectedEmployee.officeId ?? ""} />
                        <MetricLine label="Basic Salary" value={money(selectedEmployee.finance.basicSalary)} />
                        <MetricLine label="Lunch Earned" value={money(selectedEmployee.finance.lunchEarned)} />
                        <MetricLine label="Lunch Taken" value={`-${money(selectedEmployee.finance.lunchTaken)}`} />
                        <MetricLine label="Unused Lunch Added" value={money(selectedEmployee.finance.unusedLunchBalance)} />
                        <MetricLine label="Final Salary Payable" value={money(selectedEmployee.finance.finalSalary)} />
                        <TextInput name="paidAmount" label="Paid amount" type="number" defaultValue={selectedEmployee.finance.finalSalary} required />
                        <TextInput name="paymentMethod" label="Payment method" placeholder="Cash, bank, mobile money" />
                        <TextInput name="reference" label="Reference" />
                        <Textarea name="notes" label="Notes" />
                        <SubmitButton label="Mark Salary Paid & Reset Month" className="md:col-span-2" />
                    </form>
                ) : <Empty label="Select an employee first." />}
            </GlassPanel>
            <EmployeeSnapshot employee={selectedEmployee} />
        </div>
    );
}

function PayrollItemPanel({ selectedEmployee, itemType, title, description }: { selectedEmployee: EmployeeProfile | null; itemType: "advance" | "expense" | "fine"; title: string; description: string }) {
    return (
        <GlassPanel title={title} icon={itemType === "fine" ? <ShieldAlert size={18} /> : <ReceiptText size={18} />}>
            <p className="mb-4 text-sm text-slate-300">{description}</p>
            {selectedEmployee ? (
                <form action={addEmployeePayrollItem} className="grid gap-3 md:grid-cols-2">
                    <input type="hidden" name="employeeId" value={selectedEmployee.id} />
                    <input type="hidden" name="officeId" value={selectedEmployee.assignmentType === "all_rounder" ? ALL_ROUNDER_OFFICE_VALUE : selectedEmployee.officeId ?? ""} />
                    <input type="hidden" name="employeeAssignmentType" value={selectedEmployee.assignmentType} />
                    <input type="hidden" name="itemType" value={itemType} />
                    <TextInput name="amount" label="Amount" type="number" required />
                    {itemType === "fine" && (
                        <SelectInput name="fineType" label="Fine type" options={[
                            { value: "late_arrival", label: "Late arrival" },
                            { value: "absence", label: "Absence" },
                            { value: "unauthorized_off_day", label: "Unauthorized off day" },
                            { value: "misconduct", label: "Misconduct" },
                            { value: "custom", label: "Custom" },
                        ]} />
                    )}
                    <Textarea name="reason" label="Reason / note" className="md:col-span-2" required={itemType === "fine"} />
                    <SubmitButton label={`Add ${itemType}`} className="md:col-span-2" />
                </form>
            ) : <Empty label="Select an employee first." />}
        </GlassPanel>
    );
}

function AdvanceRequestsPanel({ data, selectedEmployee }: { data: EmployeeManagementData; selectedEmployee: EmployeeProfile | null }) {
    const requests = selectedEmployee ? data.advanceRequests.filter((request) => request.employeeId === selectedEmployee.id) : data.advanceRequests;
    const pendingRequests = requests.filter((request) => request.status === "pending");
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [bulkModal, setBulkModal] = useState<null | { decision: "approved" | "rejected"; ids: string[] }>(null);
    const [bulkComment, setBulkComment] = useState("");
    const [message, setMessage] = useState("");
    const [isPending, startTransition] = useTransition();
    function runBulk() {
        if (!bulkModal) return;
        if (bulkModal.decision === "rejected" && !bulkComment.trim()) {
            setMessage("Rejection reason is required.");
            return;
        }
        startTransition(async () => {
            try {
                for (const id of bulkModal.ids) {
                    const formData = new FormData();
                    formData.set("requestId", id);
                    formData.set("decision", bulkModal.decision);
                    formData.set("adminComment", bulkComment.trim());
                    await decideEmployeeAdvanceRequest(formData);
                }
                setMessage(`${bulkModal.ids.length} employee advance request(s) ${bulkModal.decision}.`);
                setSelectedIds([]);
                setBulkModal(null);
                setBulkComment("");
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Bulk advance review failed.");
            }
        });
    }
    return (
        <div className="grid gap-4 2xl:grid-cols-[1fr_420px]">
            <GlassPanel title="Advance Approval Queue" icon={<Banknote size={18} />}>
                <p className="mb-4 text-sm text-slate-300">Office accounts request advances. Admin approval is required before an advance becomes a payroll deduction.</p>
                {message ? <p className="mb-3 rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-cyan-100">{message}</p> : null}
                <EmployeeBulkControls
                    disabled={isPending}
                    pendingIds={pendingRequests.map((request) => request.id)}
                    selectedIds={selectedIds}
                    onBulk={(decision, ids) => setBulkModal({ decision, ids })}
                    onChangeSelected={setSelectedIds}
                />
                <div className="space-y-3">
                    {requests.length ? requests.map((request) => (
                        <RequestCard key={request.id} request={request} selected={selectedIds.includes(request.id)} type="advance" onToggleSelected={() => setSelectedIds((current) => current.includes(request.id) ? current.filter((id) => id !== request.id) : [...current, request.id])} />
                    )) : <Empty label="No employee advance requests found." />}
                </div>
                <EmployeeBulkModal comment={bulkComment} isPending={isPending} modal={bulkModal} onChangeComment={setBulkComment} onClose={() => setBulkModal(null)} onConfirm={runBulk} />
            </GlassPanel>
            <EmployeeSnapshot employee={selectedEmployee} />
        </div>
    );
}

function ExpenseReviewPanel({ data, selectedEmployee }: { data: EmployeeManagementData; selectedEmployee: EmployeeProfile | null }) {
    const employees = selectedEmployee ? [selectedEmployee] : data.employees;
    return (
        <GlassPanel title="Employee Expense Review" icon={<ReceiptText size={18} />}>
            <p className="mb-4 text-sm text-slate-300">Employee personal expenses are recorded by office accounts. Admin reviews and tracks them here; approved expenses affect payroll live.</p>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {employees.map((employee) => (
                    <div key={employee.id} className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-sm font-black text-white">{employee.fullName}</p>
                                <p className="mt-1 text-xs text-slate-400">{employee.officeName}</p>
                            </div>
                            <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-1 text-[10px] font-black uppercase text-amber-100">Office recorded</span>
                        </div>
                        <div className="mt-3 grid gap-2">
                            <MetricLine label="Approved Expenses" value={money(employee.finance.expenses)} />
                            <MetricLine label="Final Salary Impact" value={`-${money(employee.finance.expenses)}`} />
                        </div>
                    </div>
                ))}
                {employees.length === 0 && <Empty label="No employee expenses found." />}
            </div>
        </GlassPanel>
    );
}

function OffDaysPanel({ data, selectedEmployee }: { data: EmployeeManagementData; selectedEmployee: EmployeeProfile | null }) {
    const requests = selectedEmployee ? data.offDayRequests.filter((request) => request.employeeId === selectedEmployee.id) : data.offDayRequests;
    const pendingRequests = requests.filter((request) => request.status === "pending");
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [bulkModal, setBulkModal] = useState<null | { decision: "approved" | "rejected"; ids: string[] }>(null);
    const [bulkComment, setBulkComment] = useState("");
    const [message, setMessage] = useState("");
    const [isPending, startTransition] = useTransition();
    function runBulk() {
        if (!bulkModal) return;
        if (bulkModal.decision === "rejected" && !bulkComment.trim()) {
            setMessage("Rejection reason is required.");
            return;
        }
        startTransition(async () => {
            try {
                for (const id of bulkModal.ids) {
                    const formData = new FormData();
                    formData.set("requestId", id);
                    formData.set("decision", bulkModal.decision);
                    formData.set("adminComment", bulkComment.trim());
                    await decideEmployeeOffDayRequest(formData);
                }
                setMessage(`${bulkModal.ids.length} off-day request(s) ${bulkModal.decision}.`);
                setSelectedIds([]);
                setBulkModal(null);
                setBulkComment("");
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Bulk off-day review failed.");
            }
        });
    }
    return (
        <GlassPanel title="Off Days & Attendance Control" icon={<CalendarDays size={18} />}>
            <div className="mb-4 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4 text-sm text-cyan-50">
                Each employee receives 4 off days per month. Unused days carry forward, but one approved leave period cannot exceed 7 days. Long carried requests must be submitted at least 2 weeks earlier.
            </div>
            {selectedEmployee ? (
                <form action={updateEmployee} className="grid gap-3 md:grid-cols-2">
                    <input type="hidden" name="employeeId" value={selectedEmployee.id} />
                    <input type="hidden" name="fullName" value={selectedEmployee.fullName} />
                    <input type="hidden" name="employeeCode" value={selectedEmployee.employeeCode} />
                    <input type="hidden" name="age" value={selectedEmployee.age ?? ""} />
                    <input type="hidden" name="phone" value={selectedEmployee.phone} />
                    <input type="hidden" name="email" value={selectedEmployee.email} />
                    <input type="hidden" name="officeId" value={selectedEmployee.assignmentType === "all_rounder" ? ALL_ROUNDER_OFFICE_VALUE : selectedEmployee.officeId ?? ""} />
                    <input type="hidden" name="employeeAssignmentType" value={selectedEmployee.assignmentType} />
                    <input type="hidden" name="roleId" value={selectedEmployee.roleId ?? ""} />
                    <input type="hidden" name="roleName" value={selectedEmployee.roleName} />
                    <input type="hidden" name="startDate" value={selectedEmployee.startDate} />
                    <input type="hidden" name="basicSalary" value={selectedEmployee.basicSalary} />
                    <input type="hidden" name="dailyLunchAllowance" value={selectedEmployee.dailyLunchAllowance} />
                    <input type="hidden" name="advanceDeductionRule" value={selectedEmployee.advanceDeductionRule} />
                    <input type="hidden" name="probationStartDate" value={selectedEmployee.probationStartDate} />
                    <input type="hidden" name="probationEndDate" value={selectedEmployee.probationEndDate} />
                    <input type="hidden" name="probationSalary" value={selectedEmployee.probationSalary} />
                    <input type="hidden" name="normalSalaryAfterProbation" value={selectedEmployee.normalSalaryAfterProbation} />
                    <input type="hidden" name="probationStatus" value={selectedEmployee.probationStatus} />
                    {selectedEmployee.isFieldAgent ? <input type="hidden" name="isFieldAgent" value="on" /> : null}
                    <input type="hidden" name="salaryDay" value={selectedEmployee.salaryDay} />
                    <input type="hidden" name="status" value={selectedEmployee.status} />
                    <Textarea name="notes" label="Attendance notes" defaultValue={selectedEmployee.notes} />
                    <TextInput name="offDays" label="Assigned off days" defaultValue={selectedEmployee.offDays.join(", ")} placeholder="Sunday, Monday" />
                    <SubmitButton label="Save Off Days" className="md:col-span-2" />
                </form>
            ) : <Empty label="Select an employee first." />}
            <div className="mt-4 space-y-3">
                <p className="text-xs font-black uppercase text-slate-400">Off-day approval requests</p>
                {message ? <p className="rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-cyan-100">{message}</p> : null}
                <EmployeeBulkControls
                    disabled={isPending}
                    pendingIds={pendingRequests.map((request) => request.id)}
                    selectedIds={selectedIds}
                    onBulk={(decision, ids) => setBulkModal({ decision, ids })}
                    onChangeSelected={setSelectedIds}
                />
                {requests.length ? requests.map((request) => <RequestCard key={request.id} request={request} selected={selectedIds.includes(request.id)} type="off_day" onToggleSelected={() => setSelectedIds((current) => current.includes(request.id) ? current.filter((id) => id !== request.id) : [...current, request.id])} />) : <Empty label="No off-day requests found." />}
            </div>
            <EmployeeBulkModal comment={bulkComment} isPending={isPending} modal={bulkModal} onChangeComment={setBulkComment} onClose={() => setBulkModal(null)} onConfirm={runBulk} />
            <div className="mt-4 grid gap-2 md:grid-cols-3">
                {data.employees.slice(0, 9).map((employee) => (
                    <div key={employee.id} className="rounded-2xl border border-white/10 bg-white/[0.045] p-3">
                        <p className="text-sm font-black text-white">{employee.fullName}</p>
                        <p className="mt-1 text-xs text-slate-400">{employee.offDays.length ? employee.offDays.join(", ") : "No off days assigned"}</p>
                    </div>
                ))}
            </div>
        </GlassPanel>
    );
}

function PerformanceLeague({ data }: { data: EmployeeManagementData }) {
    const rows = data.performance.length ? data.performance : data.employees.map((employee, index) => ({
        employeeId: employee.id,
        employeeName: employee.fullName,
        officeName: employee.officeName,
        roleName: employee.roleName,
        score: Math.max(0, 75 - index),
        strengths: "Awaiting live performance score.",
        issues: employee.finance.fines > 0 ? "Fine recorded this month." : "No issue recorded.",
        aiRecommendation: "Connect attendance, collections, promises, and report activity to score this employee.",
    }));
    return (
        <GlassPanel title="Employee Performance League" icon={<Medal size={18} />}>
            <div className="overflow-hidden rounded-2xl border border-white/10">
                <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="bg-white/10 text-xs uppercase text-slate-300">
                        <tr>
                            <th className="px-4 py-3">Rank</th>
                            <th className="px-4 py-3">Employee</th>
                            <th className="px-4 py-3">Office</th>
                            <th className="px-4 py-3">Role</th>
                            <th className="px-4 py-3">Score</th>
                            <th className="px-4 py-3">AI Recommendation</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                        {rows.map((row, index) => (
                            <tr key={row.employeeId} className="bg-white/[0.025]">
                                <td className="px-4 py-3 font-black text-cyan-100">#{index + 1}</td>
                                <td className="px-4 py-3 font-bold text-white">{row.employeeName}</td>
                                <td className="px-4 py-3 text-slate-300">{row.officeName}</td>
                                <td className="px-4 py-3 text-slate-300">{row.roleName}</td>
                                <td className="px-4 py-3"><span className="rounded-full bg-emerald-400/15 px-2 py-1 font-black text-emerald-100">{Math.round(row.score)}%</span></td>
                                <td className="px-4 py-3 text-slate-300">{row.aiRecommendation}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </GlassPanel>
    );
}

function ContractsPanel({ selectedEmployee }: { selectedEmployee: EmployeeProfile | null }) {
    return (
        <GlassPanel title="AI Contract Generator" icon={<FileBadge size={18} />}>
            {selectedEmployee ? (
                <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
                    <form action={generateEmployeeContract} className="space-y-3">
                        <input type="hidden" name="employeeId" value={selectedEmployee.id} />
                        <MetricLine label="Employee" value={selectedEmployee.fullName} />
                        <MetricLine label="Role" value={selectedEmployee.roleName} />
                        <MetricLine label="Salary" value={money(selectedEmployee.basicSalary)} />
                        <SubmitButton label="Generate Contract Draft" />
                    </form>
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                        <p className="text-xs font-black uppercase text-slate-400">Print-ready contract content</p>
                        <pre className="mt-3 whitespace-pre-wrap rounded-2xl bg-white p-5 text-sm leading-6 text-slate-950">{`${selectedEmployee.fullName} Employment Contract\n\nRole: ${selectedEmployee.roleName}\nOffice: ${selectedEmployee.officeName}\nBasic salary: ${money(selectedEmployee.basicSalary)}\nStart date: ${selectedEmployee.startDate || "To be confirmed"}\nOff days: ${selectedEmployee.offDays.join(", ") || "As assigned"}\n\nDuties, confidentiality, attendance expectations, termination rules, and signature fields are generated into the saved contract record.`}</pre>
                    </div>
                </div>
            ) : <Empty label="Select an employee first." />}
        </GlassPanel>
    );
}

function DocumentsPanel({ selectedEmployee }: { selectedEmployee: EmployeeProfile | null }) {
    return (
        <GlassPanel title="CVs, Contracts & Documents" icon={<UploadCloud size={18} />}>
            {selectedEmployee ? (
                <div className="space-y-4">
                    <div className="grid gap-2 md:grid-cols-3">
                        {selectedEmployee.documents.length ? selectedEmployee.documents.map((document) => (
                            <a key={document.id} href={document.url || "#"} className="rounded-2xl border border-white/10 bg-white/[0.045] p-3 transition hover:bg-white/[0.08]">
                                <p className="text-sm font-black text-white">{document.name}</p>
                                <p className="mt-1 text-xs uppercase text-cyan-100">{document.type}</p>
                            </a>
                        )) : <Empty label="No documents linked yet." />}
                    </div>
                    <form action={addEmployeeDocument} className="grid gap-3 md:grid-cols-2">
                        <input type="hidden" name="employeeId" value={selectedEmployee.id} />
                        <input type="hidden" name="officeId" value={selectedEmployee.officeId ?? ""} />
                        <SelectInput name="documentType" label="Document type" options={[
                            { value: "cv", label: "CV" },
                            { value: "national_id", label: "National ID Copy" },
                            { value: "signed_contract", label: "Signed Contract" },
                            { value: "warning_letter", label: "Warning Letter" },
                            { value: "certificate", label: "Certificate" },
                            { value: "other", label: "Other" },
                        ]} />
                        <TextInput name="fileName" label="Document name" required />
                        <TextInput name="fileUrl" label="Supabase Storage / file URL" />
                        <Textarea name="notes" label="Notes" />
                        <SubmitButton label="Link Document" className="md:col-span-2" />
                    </form>
                </div>
            ) : <Empty label="Select an employee first." />}
        </GlassPanel>
    );
}

function TerminationPanel({ selectedEmployee }: { selectedEmployee: EmployeeProfile | null }) {
    return (
        <GlassPanel title="Termination Control" icon={<UserMinus size={18} />}>
            {selectedEmployee ? (
                <form action={terminateEmployee} className="grid gap-3 md:grid-cols-2">
                    <input type="hidden" name="employeeId" value={selectedEmployee.id} />
                    <input type="hidden" name="officeId" value={selectedEmployee.officeId ?? ""} />
                    <MetricLine label="Employee" value={selectedEmployee.fullName} />
                    <MetricLine label="Current Status" value={selectedEmployee.status} />
                    <TextInput name="terminationDate" label="Termination date" type="date" />
                    <Textarea name="terminationReason" label="Termination reason" className="md:col-span-2" required />
                    <SubmitButton label="Terminate Employee" className="md:col-span-2 bg-red-500 text-white hover:bg-red-400" />
                </form>
            ) : <Empty label="Select an employee first." />}
        </GlassPanel>
    );
}

function AuditPanel() {
    return (
        <GlassPanel title="Audit History" icon={<FileText size={18} />}>
            <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4 text-sm text-slate-300">
                Employee actions write to the live Audit Centre: employee creation, profile edits, references, payroll items, salary payments, document links, contract generation, and terminations.
            </div>
        </GlassPanel>
    );
}

function EmployeeSnapshot({ employee }: { employee: EmployeeProfile | null }) {
    if (!employee) return <GlassPanel title="Selected Employee" icon={<UsersRound size={18} />}><Empty label="No employee selected." /></GlassPanel>;
    return (
        <GlassPanel title="Selected Employee" icon={<BriefcaseBusiness size={18} />}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h3 className="text-xl font-black text-white">{employee.fullName}</h3>
                    <p className="mt-1 text-sm text-slate-400">{employee.employeeCode} | {employee.officeName} | {employee.roleName}</p>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-black uppercase ${statusClass(employee.status)}`}>{employee.status}</span>
            </div>
            <div className="mt-4 grid gap-2">
                <MetricLine label="Basic Salary" value={money(employee.finance.basicSalary)} />
                <MetricLine label="Daily Lunch Allowance" value={money(employee.dailyLunchAllowance)} />
                <MetricLine label="Lunch Earned" value={money(employee.finance.lunchEarned)} />
                <MetricLine label="Lunch Taken" value={`-${money(employee.finance.lunchTaken)}`} />
                <MetricLine label="Unused Lunch Balance" value={money(employee.finance.unusedLunchBalance)} />
                <MetricLine label="Bonuses" value={money(employee.finance.bonuses)} />
                <MetricLine label="Expenses" value={`-${money(employee.finance.expenses)}`} />
                <MetricLine label="Advances" value={`-${money(employee.finance.advances)}`} />
                <MetricLine label="Fines" value={`-${money(employee.finance.fines)}`} />
                <MetricLine label="Final Salary Payable" value={money(employee.finance.finalSalary)} important />
                <MetricLine label="Salary Due Day" value={`Day ${employee.salaryDay}`} />
                <MetricLine label="Payment Status" value={employee.finance.status} />
                <MetricLine label="Office Assignment" value={employee.assignmentType === "all_rounder" ? "All Rounder / All Offices" : employee.officeName} />
                <MetricLine label="Probation" value={`${employee.probationStatus} | ${employee.probationStartDate || "n/a"} to ${employee.probationEndDate || "n/a"}`} />
                <MetricLine label="Off-Day Balance" value={`${employee.offDayBalance.availableDays} available (${employee.offDayBalance.carriedForward} carried)`} />
                <MetricLine label="Field Agent Offices" value={employee.isFieldAgent ? employee.fieldOfficeNames.join(", ") || "No active office assignment" : "Not a field agent"} />
            </div>
        </GlassPanel>
    );
}

function RequestCard({ onToggleSelected, request, selected = false, type }: { onToggleSelected?: () => void; request: EmployeeManagementData["advanceRequests"][number]; selected?: boolean; type: "advance" | "off_day" }) {
    const action = type === "advance" ? decideEmployeeAdvanceRequest : decideEmployeeOffDayRequest;
    return (
        <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
            {request.status === "pending" && onToggleSelected ? (
                <label className="mb-3 inline-flex items-center gap-2 text-xs font-black text-cyan-100">
                    <input checked={selected} type="checkbox" onChange={onToggleSelected} className="h-4 w-4 rounded border-cyan-200 text-cyan-700" />
                    Select request
                </label>
            ) : null}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="font-black text-white">{request.employeeName}</p>
                        <span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase ${statusClass(request.status)}`}>{request.status}</span>
                        {request.isLongLeave ? <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-1 text-[10px] font-black uppercase text-amber-100">Long leave</span> : null}
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{request.officeName} | {request.createdAt ? new Date(request.createdAt).toLocaleString("en-UG") : "No date"}</p>
                    <p className="mt-2 text-sm text-slate-300">{request.reason}</p>
                    <div className="mt-3 grid gap-2 md:grid-cols-3">
                        {type === "advance" ? <MetricLine label="Advance Amount" value={money(request.amount ?? 0)} /> : null}
                        {type === "off_day" ? <MetricLine label="Dates" value={`${request.startDate || "?"} to ${request.endDate || "?"}`} /> : null}
                        {type === "off_day" ? <MetricLine label="Requested Days" value={`${request.requestedDays ?? 0} days`} /> : null}
                    </div>
                </div>
                {request.status === "pending" ? (
                    <div className="grid min-w-[260px] gap-2">
                        <form action={action} className="grid gap-2">
                            <input type="hidden" name="requestId" value={request.id} />
                            <input type="hidden" name="decision" value="approved" />
                            <TextInput name="adminComment" label="Approval note" />
                            <SubmitButton label="Approve" />
                        </form>
                        <form action={action} className="grid gap-2">
                            <input type="hidden" name="requestId" value={request.id} />
                            <input type="hidden" name="decision" value="rejected" />
                            <TextInput name="adminComment" label="Reject reason" />
                            <SubmitButton label="Reject" className="bg-red-500 text-white hover:bg-red-400" />
                        </form>
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function EmployeeBulkControls({
    disabled,
    pendingIds,
    selectedIds,
    onBulk,
    onChangeSelected,
}: {
    disabled: boolean;
    pendingIds: string[];
    selectedIds: string[];
    onBulk: (decision: "approved" | "rejected", ids: string[]) => void;
    onChangeSelected: (ids: string[]) => void;
}) {
    if (!pendingIds.length) return null;
    const selectedPendingIds = selectedIds.filter((id) => pendingIds.includes(id));
    const allSelected = pendingIds.every((id) => selectedIds.includes(id));
    return (
        <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.055] p-3">
            <label className="inline-flex items-center gap-2 text-xs font-black text-cyan-100">
                <input checked={allSelected} disabled={disabled} type="checkbox" onChange={(event) => onChangeSelected(event.target.checked ? pendingIds : [])} className="h-4 w-4 rounded border-cyan-200 text-cyan-700" />
                Select All Pending ({pendingIds.length})
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
                <button disabled={disabled || selectedPendingIds.length === 0} onClick={() => onBulk("approved", selectedPendingIds)} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-40">Approve Selected</button>
                <button disabled={disabled || selectedPendingIds.length === 0} onClick={() => onBulk("rejected", selectedPendingIds)} className="rounded-xl bg-red-600 px-3 py-2 text-xs font-black text-white disabled:opacity-40">Reject Selected</button>
                <button disabled={disabled} onClick={() => onBulk("approved", pendingIds)} className="rounded-xl border border-emerald-200/40 bg-white/10 px-3 py-2 text-xs font-black text-emerald-100 disabled:opacity-40">Approve All Pending</button>
                <button disabled={disabled} onClick={() => onBulk("rejected", pendingIds)} className="rounded-xl border border-red-200/40 bg-white/10 px-3 py-2 text-xs font-black text-red-100 disabled:opacity-40">Reject All Pending</button>
            </div>
        </div>
    );
}

function EmployeeBulkModal({
    comment,
    isPending,
    modal,
    onChangeComment,
    onClose,
    onConfirm,
}: {
    comment: string;
    isPending: boolean;
    modal: null | { decision: "approved" | "rejected"; ids: string[] };
    onChangeComment: (value: string) => void;
    onClose: () => void;
    onConfirm: () => void;
}) {
    if (!modal) return null;
    return (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/70 p-4 text-slate-950">
            <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
                <h2 className="text-xl font-black">Confirm Bulk {modal.decision === "approved" ? "Approval" : "Rejection"}</h2>
                <p className="mt-2 text-sm font-semibold text-slate-600">You are about to {modal.decision === "approved" ? "approve" : "reject"} {modal.ids.length} pending requests. Continue?</p>
                <label className="mt-4 block text-sm font-bold text-slate-700">
                    {modal.decision === "rejected" ? "Rejection reason" : "Admin note optional"}
                    <textarea value={comment} onChange={(event) => onChangeComment(event.target.value)} className="mt-2 min-h-28 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold" />
                </label>
                <div className="mt-5 flex flex-wrap justify-end gap-2">
                    <button disabled={isPending} onClick={onClose} className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-700 disabled:opacity-40">Cancel</button>
                    <button disabled={isPending} onClick={onConfirm} className={`rounded-xl px-4 py-2 text-sm font-black text-white disabled:opacity-40 ${modal.decision === "approved" ? "bg-emerald-700" : "bg-red-700"}`}>
                        {isPending ? "Processing..." : modal.decision === "approved" ? "Approve Requests" : "Reject Requests"}
                    </button>
                </div>
            </div>
        </div>
    );
}

function GlassPanel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <section className="rounded-[24px] border border-white/10 bg-slate-950/48 p-4 shadow-xl shadow-black/20 backdrop-blur-xl">
            <div className="mb-4 flex items-center gap-2">
                <div className="grid h-9 w-9 place-items-center rounded-2xl bg-cyan-300/12 text-cyan-100 ring-1 ring-cyan-300/20">{icon}</div>
                <h2 className="text-lg font-black text-white">{title}</h2>
            </div>
            {children}
        </section>
    );
}

function Kpi({ icon, label, value, hint, tone }: { icon: React.ReactNode; label: string; value: string; hint: string; tone: "blue" | "emerald" | "red" | "purple" }) {
    const tones = {
        blue: "from-blue-500/25 to-cyan-400/10 text-cyan-100",
        emerald: "from-emerald-500/25 to-teal-400/10 text-emerald-100",
        red: "from-red-500/25 to-orange-400/10 text-red-100",
        purple: "from-purple-500/25 to-fuchsia-400/10 text-purple-100",
    };
    return (
        <button type="button" className={`rounded-[24px] border border-white/10 bg-gradient-to-br ${tones[tone]} p-4 text-left shadow-xl shadow-black/20 transition hover:-translate-y-0.5`}>
            <div className="flex items-center justify-between gap-2">
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10">{icon}</span>
                <span className="rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[10px] font-black uppercase text-white/80">Live</span>
            </div>
            <p className="mt-4 text-xs font-black uppercase text-white/55">{label}</p>
            <p className="mt-1 break-words text-2xl font-black tracking-tight text-white">{value}</p>
            <p className="mt-2 text-xs text-white/65">{hint}</p>
        </button>
    );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3">
            <p className="text-[10px] font-black uppercase text-slate-400">{label}</p>
            <p className="mt-1 text-sm font-black text-white">{value}</p>
        </div>
    );
}

function MetricLine({ label, value, important = false }: { label: string; value: string; important?: boolean }) {
    return (
        <div className={`rounded-2xl border p-3 ${important ? "border-emerald-300/30 bg-emerald-300/10" : "border-white/10 bg-white/[0.045]"}`}>
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p>
            <p className={`mt-1 break-words text-sm font-black ${important ? "text-emerald-100" : "text-white"}`}>{value}</p>
        </div>
    );
}

function TextInput({ name, label, className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement> & { name: string; label: string }) {
    return (
        <label className={`block ${className}`}>
            <span className="mb-1 block text-xs font-black uppercase text-slate-400">{label}</span>
            <input name={name} className="h-10 w-full rounded-2xl border border-white/10 bg-white/10 px-3 text-sm font-semibold text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/60" {...props} />
        </label>
    );
}

function Textarea({ name, label, className = "", ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { name: string; label: string }) {
    return (
        <label className={`block ${className}`}>
            <span className="mb-1 block text-xs font-black uppercase text-slate-400">{label}</span>
            <textarea name={name} rows={3} className="w-full rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm font-semibold text-white outline-none placeholder:text-slate-500 focus:border-cyan-300/60" {...props} />
        </label>
    );
}

function SelectInput({ name, label, options, className = "", defaultValue = "" }: { name: string; label: string; options: Array<{ value: string; label: string }>; className?: string; defaultValue?: string }) {
    return (
        <label className={`block ${className}`}>
            <span className="mb-1 block text-xs font-black uppercase text-slate-400">{label}</span>
            <select name={name} defaultValue={defaultValue} className="h-10 w-full rounded-2xl border border-white/10 bg-slate-900 px-3 text-sm font-semibold text-white outline-none focus:border-cyan-300/60">
                <option value="">Select...</option>
                {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
        </label>
    );
}

function SubmitButton({ label, className = "" }: { label: string; className?: string }) {
    return (
        <button type="submit" className={`inline-flex h-11 items-center justify-center rounded-2xl bg-cyan-300 px-4 text-sm font-black text-slate-950 shadow-lg shadow-cyan-500/15 transition hover:bg-cyan-200 ${className}`}>
            {label}
        </button>
    );
}

function Empty({ label }: { label: string }) {
    return <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.035] p-4 text-sm text-slate-400">{label}</div>;
}
