import type {
    AttendanceTimelineItem,
    DailyAttendanceRow,
    EmployeeAttendanceProfile,
    PublicHolidayRow,
    WorkScheduleRow,
} from "@/lib/attendance/types";
import { StatusChip } from "@/components/office/shared/EnterpriseUI";

type Props = {
    employees: EmployeeAttendanceProfile[];
    ledger: DailyAttendanceRow[];
    events: AttendanceTimelineItem[];
    selectedEmployee: EmployeeAttendanceProfile | null;
    onSelectEmployee: (employee: EmployeeAttendanceProfile) => void;
    schedules: WorkScheduleRow[];
    holidays: PublicHolidayRow[];
};

export default function AttendanceLedger({
    employees,
    ledger,
    events,
    selectedEmployee,
    onSelectEmployee,
    schedules,
    holidays,
}: Props) {
    return (
        <div className="space-y-6">
            <section className="enterprise-panel p-6">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="font-bold text-xl">Office Attendance Board</h2>
                        <p className="text-sm text-slate-500">Company &gt; office &gt; employee &gt; attendance relationships</p>
                    </div>
                    <span className="bg-slate-100 rounded-full px-3 py-1 text-sm font-bold">
                        {employees.length} employees
                    </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
                    {employees.length === 0 ? (
                        <p className="text-slate-500">No active employees found for this office.</p>
                    ) : employees.map((employee) => (
                        <button
                            key={employee.id}
                            type="button"
                            onClick={() => onSelectEmployee(employee)}
                            className={`text-left border rounded-2xl p-4 hover:bg-blue-50 ${selectedEmployee?.id === employee.id ? "bg-blue-50 border-blue-200" : ""}`}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="font-black text-slate-900">{employee.full_name ?? employee.employee_code ?? "Employee"}</p>
                                    <p className="text-xs text-slate-500">{employee.job_title ?? employee.department ?? "Operations"}</p>
                                </div>
                                <StatusChip label={employee.todayStatus.replace(/_/g, " ")} tone={statusTone(employee.todayStatus)} />
                            </div>
                            <div className="grid grid-cols-3 gap-2 mt-4 text-xs">
                                <Mini label="In" value={formatTime(employee.firstCheckIn)} />
                                <Mini label="Out" value={formatTime(employee.lastCheckOut)} />
                                <Mini label="Rate" value={`${employee.attendanceRate}%`} />
                            </div>
                        </button>
                    ))}
                </div>
            </section>

            <section className="enterprise-panel p-6">
                <h2 className="font-bold text-xl mb-4">Daily Attendance Ledger</h2>
                <div className="overflow-x-auto">
                    <table className="enterprise-table">
                        <thead>
                            <tr>
                                <th className="text-left p-4">Employee</th>
                                <th className="text-left p-4">Expected</th>
                                <th className="text-left p-4">Check In</th>
                                <th className="text-left p-4">Break</th>
                                <th className="text-left p-4">Check Out</th>
                                <th className="text-left p-4">Worked</th>
                                <th className="text-left p-4">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {ledger.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="p-6 text-slate-500">No attendance ledger rows for this office.</td>
                                </tr>
                            ) : ledger.map((row) => (
                                <tr key={row.employee.id} className="border-t hover:bg-blue-50">
                                    <td className="p-4">
                                        <p className="font-bold">{row.employee.full_name ?? row.employee.employee_code ?? "Employee"}</p>
                                        <p className="text-xs text-slate-500">{row.employee.employee_code ?? row.employee.email ?? "No code"}</p>
                                    </td>
                                    <td className="p-4">{row.expectedClockIn}</td>
                                    <td className="p-4">{formatTime(row.employee.firstCheckIn)}</td>
                                    <td className="p-4">{row.employee.breakMinutes} min</td>
                                    <td className="p-4">{formatTime(row.employee.lastCheckOut)}</td>
                                    <td className="p-4">{minutesToHours(row.employee.workedMinutes)}</td>
                                    <td className="p-4">
                                        <StatusChip label={row.employee.todayStatus.replace(/_/g, " ")} tone={statusTone(row.employee.todayStatus)} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            <div className="grid grid-cols-1 2xl:grid-cols-3 gap-6">
                <section className="enterprise-panel p-6 2xl:col-span-2">
                    <h2 className="font-bold text-xl mb-4">Attendance Timeline</h2>
                    <div className="space-y-3">
                        {events.length === 0 ? (
                            <p className="text-slate-500">No attendance events recorded yet.</p>
                        ) : events.slice(0, 12).map((event) => (
                            <div key={event.id} className="rounded-2xl border border-slate-200 p-4 hover:bg-slate-50">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <p className="font-bold capitalize">{event.event_type.replace(/_/g, " ")}</p>
                                        <p className="text-sm text-slate-500">
                                            {event.employeeName ?? "Employee"} · {formatDateTime(event.event_time)}
                                        </p>
                                    </div>
                                    <StatusChip label={event.status} tone={event.status === "valid" ? "green" : "orange"} />
                                </div>
                                <p className="text-xs text-slate-500 mt-2">
                                    Device: {event.deviceName ?? "Not supplied"} · GPS: {event.gpsPassed === null ? "Not supplied" : event.gpsPassed ? "Passed" : "Failed"}
                                </p>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="enterprise-panel p-6">
                    <h2 className="font-bold text-xl mb-4">Schedules & Holidays</h2>
                    <div className="space-y-4">
                        <div>
                            <p className="text-sm font-bold text-slate-700">Work Schedules</p>
                            {schedules.length === 0 ? (
                                <p className="text-sm text-slate-500 mt-2">No active work schedules configured.</p>
                            ) : schedules.slice(0, 4).map((schedule) => (
                                <div key={schedule.id} className="mt-2 border rounded-2xl p-3">
                                    <p className="font-bold">{schedule.name}</p>
                                    <p className="text-xs text-slate-500">Active schedule</p>
                                </div>
                            ))}
                        </div>
                        <div>
                            <p className="text-sm font-bold text-slate-700">Public Holidays</p>
                            {holidays.length === 0 ? (
                                <p className="text-sm text-slate-500 mt-2">No holidays in the current month.</p>
                            ) : holidays.slice(0, 5).map((holiday) => (
                                <div key={holiday.id} className="mt-2 border rounded-2xl p-3">
                                    <p className="font-bold">{holiday.name}</p>
                                    <p className="text-xs text-slate-500">{holiday.holiday_date}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}

function Mini({ label, value }: { label: string; value: string }) {
    return (
        <div className="bg-slate-50 rounded-xl p-2">
            <p className="text-slate-500">{label}</p>
            <p className="font-bold">{value}</p>
        </div>
    );
}

function statusTone(status: EmployeeAttendanceProfile["todayStatus"]) {
    if (status === "present") return "green";
    if (status === "late") return "orange";
    if (status === "absent") return "red";
    if (status === "on_break") return "blue";
    return "slate";
}

function formatTime(value: string | null) {
    if (!value) return "-";
    return new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Africa/Kampala",
    }).format(new Date(value));
}

function formatDateTime(value: string) {
    return new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Africa/Kampala",
    }).format(new Date(value));
}

function minutesToHours(minutes: number) {
    if (!minutes) return "0h";
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}
