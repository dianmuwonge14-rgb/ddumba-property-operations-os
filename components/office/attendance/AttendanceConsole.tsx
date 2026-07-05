"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveEmployee, submitOfficeDailyReport } from "@/app/actions/attendance";
import type { Office } from "@/lib/auth/types";
import type { AttendancePageData, EmployeeAttendanceProfile, OfficeDailyReportInput } from "@/lib/attendance/types";
import AttendanceCommandPanel from "./AttendanceCommandPanel";
import AttendanceLedger from "./AttendanceLedger";
import { EnterpriseKpiCard, PageHero, StatusChip } from "@/components/office/shared/EnterpriseUI";

type Props = {
    canManage: boolean;
    data: AttendancePageData;
    offices: Office[];
};

export default function AttendanceConsole({ canManage, data, offices }: Props) {
    const router = useRouter();
    const [selectedEmployee, setSelectedEmployee] = useState<EmployeeAttendanceProfile | null>(data.employees[0] ?? null);
    const deviceCount = useMemo(() => data.devices.filter((device) => device.status === "approved").length, [data.devices]);

    return (
        <main className="enterprise-page">
            <div className="enterprise-shell">
                <PageHero
                    title="Attendance"
                    subtitle={`${data.office?.office_name ?? data.office?.name ?? "No active office selected"}${data.company ? ` · ${data.company.name}` : ""}`}
                    badge="Workforce Control"
                >
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <MiniStat title="Clock In" value="9:30 AM" />
                        <MiniStat title="Late After" value="10:00 AM" tone="text-orange-600" />
                        <MiniStat title="Absent After" value="11:00 AM" tone="text-red-600" />
                        <MiniStat title="Approved Devices" value={deviceCount.toString()} tone="text-blue-600" />
                    </div>
                </PageHero>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">
                    <EnterpriseKpiCard title="Present Today" value={data.kpis.presentToday.toString()} tone="green" trend="up" trendLabel="checked in" progress={data.kpis.officeAttendanceRate} />
                    <EnterpriseKpiCard title="Not Checked In" value={data.kpis.notCheckedInToday.toString()} tone="slate" trend="flat" trendLabel="pending" progress={data.kpis.notCheckedInToday ? 50 : 0} />
                    <EnterpriseKpiCard title="Late Today" value={data.kpis.lateToday.toString()} tone="orange" trend="down" trendLabel="after 10:00" progress={data.kpis.lateToday ? 60 : 0} />
                    <EnterpriseKpiCard title="Absent Today" value={data.kpis.absentToday.toString()} tone="red" trend="down" trendLabel="after 11:00" progress={data.kpis.absentToday ? 70 : 0} status="Watch" />
                    <EnterpriseKpiCard title="Checked Out" value={data.kpis.checkedOutToday.toString()} tone="purple" trend="flat" trendLabel="end of day" progress={data.employees.length ? Math.round((data.kpis.checkedOutToday / data.employees.length) * 100) : 0} />
                    <EnterpriseKpiCard title="Hours Worked" value={`${data.kpis.totalHoursWorked}h`} tone="cyan" trend="up" trendLabel="today" progress={Math.min(100, Math.round((data.kpis.totalHoursWorked / Math.max(data.employees.length * 8, 1)) * 100))} />
                    <EnterpriseKpiCard title="Office Rate" value={`${data.kpis.officeAttendanceRate}%`} tone="blue" trend="up" trendLabel="today" progress={data.kpis.officeAttendanceRate} />
                    <EnterpriseKpiCard title="Office Score" value={`${data.kpis.officeAttendanceScore}%`} tone="green" trend="up" trendLabel="attendance control" progress={data.kpis.officeAttendanceScore} />
                    <EnterpriseKpiCard title="Overtime" value={`${data.kpis.overtimeHours}h`} tone="slate" trend="flat" trendLabel="month" progress={data.kpis.overtimeHours ? 45 : 0} />
                </div>

                <DailyOfficeReportPanel
                    data={data}
                    onSaved={() => router.refresh()}
                />

                <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                    <div className="xl:col-span-3">
                        <AttendanceCommandPanel
                            canManage={canManage}
                            offices={offices}
                            employees={data.employees}
                            selectedEmployee={selectedEmployee}
                            onSelectEmployee={setSelectedEmployee}
                            onSaved={() => router.refresh()}
                        />
                    </div>

                    <div className="xl:col-span-9">
                        <AttendanceLedger
                            employees={data.employees}
                            ledger={data.ledger}
                            events={data.events}
                            selectedEmployee={selectedEmployee}
                            onSelectEmployee={setSelectedEmployee}
                            schedules={data.schedules}
                            holidays={data.holidays}
                        />
                    </div>
                </div>

                <div className="mt-6 grid grid-cols-1 xl:grid-cols-12 gap-6">
                    <div className="xl:col-span-5">
                        <PayrollReportPanel rows={data.payroll} />
                    </div>
                    <div className="xl:col-span-7">
                        <EmployeeManagementPanel
                            canManage={canManage}
                            offices={offices}
                            activeOfficeId={data.office?.id ?? ""}
                            employees={data.employees}
                            selectedEmployee={selectedEmployee}
                            onSelectEmployee={setSelectedEmployee}
                            onSaved={() => router.refresh()}
                        />
                    </div>
                </div>
            </div>
        </main>
    );
}

function MiniStat({ title, value, tone = "text-slate-900" }: { title: string; value: string; tone?: string }) {
    return (
        <div className="enterprise-card min-w-36 px-5 py-4">
            <p className="text-xs text-slate-500">{title}</p>
            <p className={`text-lg font-black ${tone}`}>{value}</p>
        </div>
    );
}

function DailyOfficeReportPanel({ data, onSaved }: { data: AttendancePageData; onSaved: () => void }) {
    const [form, setForm] = useState<OfficeDailyReportInput>({
        ...data.dailyReportDefaults,
        challengesFaced: "",
        generalOfficeNotes: "",
    });
    const [message, setMessage] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    const hasCheckedIn = data.employees.some((employee) => employee.firstCheckIn && !employee.lastCheckOut);
    const checkedOut = data.employees.some((employee) => employee.lastCheckOut);

    useEffect(() => {
        setForm((current) => ({
            ...current,
            ...data.dailyReportDefaults,
        }));
    }, [data.dailyReportDefaults]);

    function numberField(key: keyof Pick<OfficeDailyReportInput, "totalCollections" | "totalExpenses" | "landlordPayments" | "vacantRooms" | "newTenants" | "brokenPromises">, value: string) {
        setForm((current) => ({ ...current, [key]: Number(value) || 0 }));
    }

    function submit() {
        startTransition(async () => {
            try {
                setMessage(null);
                const result = await submitOfficeDailyReport(form);
                setMessage(result.message);
                onSaved();
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Daily report failed to submit.");
            }
        });
    }

    function checkOut() {
        if (!data.dailyReport.submitted) {
            setMessage("Please submit today’s office report before checking out.");
            return;
        }
        startTransition(async () => {
            try {
                setMessage(null);
                const response = await fetch("/api/attendance/self", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ eventType: "check_out" }),
                });
                const result = await response.json().catch(() => null) as { ok?: boolean; message?: string; error?: string } | null;
                if (!response.ok || result?.ok === false) throw new Error(result?.error ?? "Check-out failed.");
                setMessage(result?.message ?? "Checked out successfully.");
                onSaved();
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Check-out failed.");
            }
        });
    }

    return (
        <section className="enterprise-panel mb-6 p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-xl font-black">Daily Office Report Gate</h2>
                        <StatusChip label={data.dailyReport.submitted ? "Report submitted" : "Report required"} tone={data.dailyReport.submitted ? "green" : "orange"} />
                        <StatusChip label={checkedOut ? "Checked Out" : hasCheckedIn ? "Working" : "Checked In required"} tone={checkedOut ? "slate" : hasCheckedIn ? "blue" : "orange"} />
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                        Checkout is blocked until today&apos;s office report is submitted. Defaults are calculated from live office records.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={submit} disabled={isPending} className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50">
                        Submit Daily Report
                    </button>
                    <button type="button" onClick={checkOut} disabled={isPending || !hasCheckedIn || checkedOut} className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:opacity-40">
                        Check Out
                    </button>
                </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
                <ReportInput label="Total collections" value={form.totalCollections} onChange={(value) => numberField("totalCollections", value)} />
                <ReportInput label="Total expenses" value={form.totalExpenses} onChange={(value) => numberField("totalExpenses", value)} />
                <ReportInput label="Landlord payments" value={form.landlordPayments} onChange={(value) => numberField("landlordPayments", value)} />
                <ReportInput label="Vacant rooms" value={form.vacantRooms} onChange={(value) => numberField("vacantRooms", value)} />
                <ReportInput label="New tenants" value={form.newTenants} onChange={(value) => numberField("newTenants", value)} />
                <ReportInput label="Broken promises" value={form.brokenPromises} onChange={(value) => numberField("brokenPromises", value)} />
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
                <TextArea label="Challenges faced" value={form.challengesFaced} onChange={(value) => setForm((current) => ({ ...current, challengesFaced: value }))} />
                <TextArea label="General office notes" value={form.generalOfficeNotes} onChange={(value) => setForm((current) => ({ ...current, generalOfficeNotes: value }))} />
            </div>
            {message && <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">{message}</p>}
        </section>
    );
}

function PayrollReportPanel({ rows }: { rows: AttendancePageData["payroll"] }) {
    return (
        <section className="enterprise-panel overflow-hidden">
            <div className="border-b border-slate-200 p-5">
                <h2 className="text-xl font-black">Payroll-Ready Attendance Report</h2>
                <p className="mt-1 text-sm text-slate-500">Present days, late days, absent days, hours, overtime, and attendance scores.</p>
            </div>
            <div className="max-h-[430px] overflow-auto">
                <table className="enterprise-table min-w-[780px]">
                    <thead className="sticky top-0 bg-white">
                        <tr>
                            <th className="text-left">Employee</th>
                            <th className="text-left">Office</th>
                            <th>Present</th>
                            <th>Late</th>
                            <th>Absent</th>
                            <th>Hours</th>
                            <th>Overtime</th>
                            <th>Score</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr key={row.employeeId}>
                                <td className="font-black">{row.employeeName}</td>
                                <td>{row.officeName}</td>
                                <td>{row.daysPresent}</td>
                                <td>{row.daysLate}</td>
                                <td>{row.daysAbsent}</td>
                                <td>{row.totalHoursWorked}h</td>
                                <td>{row.overtimeHours}h</td>
                                <td><StatusChip label={`${row.attendanceScore}%`} tone={row.attendanceScore >= 80 ? "green" : row.attendanceScore >= 60 ? "orange" : "red"} /></td>
                            </tr>
                        ))}
                        {!rows.length && (
                            <tr><td colSpan={8} className="p-8 text-center text-sm font-bold text-slate-500">Payroll rows will appear when employees and attendance events exist.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

function EmployeeManagementPanel({
    canManage,
    offices,
    activeOfficeId,
    employees,
    selectedEmployee,
    onSelectEmployee,
    onSaved,
}: {
    canManage: boolean;
    offices: Office[];
    activeOfficeId: string;
    employees: EmployeeAttendanceProfile[];
    selectedEmployee: EmployeeAttendanceProfile | null;
    onSelectEmployee: (employee: EmployeeAttendanceProfile) => void;
    onSaved: () => void;
}) {
    const [form, setForm] = useState({
        employeeId: "",
        officeId: activeOfficeId,
        fullName: "",
        email: "",
        phone: "",
        jobTitle: "",
        pin: "",
        status: "active",
    });
    const [message, setMessage] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        if (!selectedEmployee) return;
        setForm({
            employeeId: selectedEmployee.id,
            officeId: selectedEmployee.employee_assignment_type === "all_rounder" ? "all_rounder" : selectedEmployee.office_id ?? activeOfficeId,
            fullName: selectedEmployee.full_name ?? "",
            email: selectedEmployee.email ?? "",
            phone: selectedEmployee.phone ?? "",
            jobTitle: selectedEmployee.job_title ?? selectedEmployee.role ?? "",
            pin: "",
            status: selectedEmployee.status ?? "active",
        });
    }, [activeOfficeId, selectedEmployee]);

    function update(key: keyof typeof form, value: string) {
        setForm((current) => ({ ...current, [key]: value }));
    }

    function submit(nextStatus?: string) {
        startTransition(async () => {
            try {
                setMessage(null);
                const result = await saveEmployee({ ...form, status: nextStatus ?? form.status });
                setMessage(result.message);
                onSaved();
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Employee update failed.");
            }
        });
    }

    function createNew() {
        setForm({
            employeeId: "",
            officeId: activeOfficeId,
            fullName: "",
            email: "",
            phone: "",
            jobTitle: "",
            pin: "",
            status: "active",
        });
        setMessage(null);
    }

    return (
        <section className="enterprise-panel p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                    <h2 className="text-xl font-black">Employee Management</h2>
                    <p className="mt-1 text-sm text-slate-500">Add, edit, suspend, transfer, reset PINs, and inspect attendance history.</p>
                </div>
                <button type="button" onClick={createNew} disabled={!canManage} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-black disabled:opacity-40">New Employee</button>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-5">
                <div className="xl:col-span-2 max-h-[360px] overflow-auto rounded-3xl border border-slate-200">
                    {employees.map((employee) => (
                        <button
                            key={employee.id}
                            type="button"
                            onClick={() => onSelectEmployee(employee)}
                            className={`flex w-full items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-left last:border-b-0 ${selectedEmployee?.id === employee.id ? "bg-blue-50" : "bg-white"}`}
                        >
                            <span>
                                <span className="block font-black">{employee.full_name ?? "Employee"}</span>
                                <span className="text-xs font-bold text-slate-500">{employee.job_title ?? employee.role ?? "Staff"} · {employee.todayStatus.replace(/_/g, " ")}</span>
                            </span>
                            <StatusChip label={employee.status ?? "active"} tone={employee.status === "active" ? "green" : "orange"} />
                        </button>
                    ))}
                </div>

                <div className="xl:col-span-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <FormField label="Full name" value={form.fullName} onChange={(value) => update("fullName", value)} disabled={!canManage} />
                    <FormField label="Email" value={form.email} onChange={(value) => update("email", value)} disabled={!canManage} />
                    <FormField label="Phone" value={form.phone} onChange={(value) => update("phone", value)} disabled={!canManage} />
                    <FormField label="Role / job title" value={form.jobTitle} onChange={(value) => update("jobTitle", value)} disabled={!canManage} />
                    <FormField label="Reset PIN" value={form.pin} onChange={(value) => update("pin", value)} disabled={!canManage} type="password" />
                    <label className="block text-sm font-bold text-slate-600">
                        Office assignment
                        <select value={form.officeId} onChange={(event) => update("officeId", event.target.value)} disabled={!canManage} className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-slate-900 disabled:opacity-50">
                            <option value="all_rounder">All Rounder / All Offices</option>
                            {offices.map((office) => <option key={office.id} value={office.id}>{office.office_name ?? office.name}</option>)}
                        </select>
                    </label>
                    <label className="block text-sm font-bold text-slate-600">
                        Status
                        <select value={form.status} onChange={(event) => update("status", event.target.value)} disabled={!canManage} className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-slate-900 disabled:opacity-50">
                            <option value="active">Active</option>
                            <option value="suspended">Suspended</option>
                            <option value="inactive">Inactive</option>
                            <option value="terminated">Terminated</option>
                        </select>
                    </label>
                    <div className="flex flex-wrap items-end gap-2">
                        <button type="button" onClick={() => submit()} disabled={!canManage || isPending} className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white disabled:opacity-40">Save Employee</button>
                        <button type="button" onClick={() => submit("suspended")} disabled={!canManage || isPending || !form.employeeId} className="rounded-2xl bg-orange-600 px-4 py-3 text-sm font-black text-white disabled:opacity-40">Suspend</button>
                    </div>
                </div>
            </div>
            {message && <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">{message}</p>}
        </section>
    );
}

function ReportInput({ label, value, onChange }: { label: string; value: number; onChange: (value: string) => void }) {
    return (
        <label className="block text-sm font-bold text-slate-600">
            {label}
            <input type="number" value={value} onChange={(event) => onChange(event.currentTarget.value)} className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-slate-900" />
        </label>
    );
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
    return (
        <label className="block text-sm font-bold text-slate-600">
            {label}
            <textarea value={value} onChange={(event) => onChange(event.currentTarget.value)} rows={3} className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-slate-900" />
        </label>
    );
}

function FormField({ label, value, onChange, disabled, type = "text" }: { label: string; value: string; onChange: (value: string) => void; disabled: boolean; type?: string }) {
    return (
        <label className="block text-sm font-bold text-slate-600">
            {label}
            <input type={type} value={value} onChange={(event) => onChange(event.currentTarget.value)} disabled={disabled} className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-slate-900 disabled:opacity-50" />
        </label>
    );
}
