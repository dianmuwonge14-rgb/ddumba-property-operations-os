"use client";

import { useState, useTransition } from "react";
import { recordAttendanceEvent } from "@/app/actions/attendance";
import type { Office } from "@/lib/auth/types";
import type { AttendanceEventType, EmployeeAttendanceProfile } from "@/lib/attendance/types";

type Props = {
    canManage: boolean;
    offices: Office[];
    employees: EmployeeAttendanceProfile[];
    selectedEmployee: EmployeeAttendanceProfile | null;
    onSelectEmployee: (employee: EmployeeAttendanceProfile) => void;
    onSaved: () => void;
};

type PositionState = {
    latitude?: number;
    longitude?: number;
    status: string;
};

export default function AttendanceCommandPanel({
    canManage,
    offices,
    employees,
    selectedEmployee,
    onSelectEmployee,
    onSaved,
}: Props) {
    const [workOfficeId, setWorkOfficeId] = useState(selectedEmployee?.office_id ?? "");
    const [pin, setPin] = useState("");
    const [position, setPosition] = useState<PositionState>({ status: "GPS not captured" });
    const [message, setMessage] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    const isAllRounder = selectedEmployee?.employee_assignment_type === "all_rounder";
    const employeeId = selectedEmployee?.id ?? "";
    const selectedWorkOfficeId = workOfficeId || selectedEmployee?.office_id || offices[0]?.id || "";

    function chooseEmployee(value: string) {
        const next = employees.find((employee) => employee.id === value);
        if (next) {
            onSelectEmployee(next);
            setWorkOfficeId(next.office_id ?? offices[0]?.id ?? "");
        }
    }

    function captureGps() {
        if (!navigator.geolocation) {
            setPosition({ status: "GPS unavailable in this browser" });
            return;
        }

        setPosition({ status: "Capturing GPS..." });
        navigator.geolocation.getCurrentPosition(
            (location) => {
                setPosition({
                    latitude: location.coords.latitude,
                    longitude: location.coords.longitude,
                    status: "GPS captured",
                });
            },
            (error) => setPosition({ status: error.message || "GPS capture failed" }),
            { enableHighAccuracy: true, timeout: 10000 },
        );
    }

    function deviceFingerprint() {
        const key = "ddumba_attendance_device_fingerprint";
        const existing = window.localStorage.getItem(key);
        if (existing) return existing;
        const created = `${navigator.userAgent}-${crypto.randomUUID()}`;
        window.localStorage.setItem(key, created);
        return created;
    }

    function run(eventType: AttendanceEventType) {
        if (!employeeId) {
            setMessage("Select an employee first.");
            return;
        }
        if (isAllRounder && !selectedWorkOfficeId) {
            setMessage("Select the office this all-rounder is working from today.");
            return;
        }

        startTransition(async () => {
            try {
                setMessage(null);
                const result = await recordAttendanceEvent({
                    employeeId,
                    officeId: isAllRounder ? selectedWorkOfficeId : undefined,
                    eventType,
                    pin: pin || undefined,
                    latitude: position.latitude,
                    longitude: position.longitude,
                    deviceFingerprint: deviceFingerprint(),
                    deviceName: navigator.userAgent,
                    platform: navigator.platform || undefined,
                });
                setMessage(result.message);
                setPin("");
                onSaved();
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Attendance action failed.");
            }
        });
    }

    return (
        <div className="rounded-3xl bg-white p-4 shadow-lg">
            <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                    <h2 className="text-lg font-black text-slate-950">Attendance Control</h2>
                    <p className="text-xs font-semibold text-slate-500">
                        {selectedEmployee?.full_name ?? "Select employee"}
                    </p>
                </div>
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
                    {isPending ? "Saving" : "Ready"}
                </span>
            </div>

            <div className="grid grid-cols-1 gap-2 xl:grid-cols-[1fr_0.75fr_auto]">
                <select value={employeeId} onChange={(event) => chooseEmployee(event.target.value)} className="h-11 rounded-xl border px-3 text-sm font-semibold">
                    <option value="">Select employee</option>
                    {employees.map((employee) => (
                        <option key={employee.id} value={employee.id}>
                            {employee.full_name ?? employee.employee_code ?? "Employee"} ({employee.todayStatus.replace(/_/g, " ")})
                        </option>
                    ))}
                </select>
                <input
                    value={pin}
                    onChange={(event) => setPin(event.target.value)}
                    placeholder="Employee PIN, where required"
                    type="password"
                    className="h-11 rounded-xl border px-3 text-sm font-semibold"
                />
                <button
                    type="button"
                    onClick={captureGps}
                    className="h-11 rounded-xl border border-blue-200 bg-blue-50 px-3 text-sm font-black text-blue-700"
                >
                    Capture GPS
                </button>
            </div>
            {isAllRounder && (
                <label className="mt-2 block text-xs font-black uppercase text-slate-500">
                    Office worked from today
                    <select value={selectedWorkOfficeId} onChange={(event) => setWorkOfficeId(event.target.value)} className="mt-1 h-11 w-full rounded-xl border px-3 text-sm font-semibold text-slate-900">
                        <option value="">Select work office</option>
                        {offices.map((office) => (
                            <option key={office.id} value={office.id}>{office.office_name ?? office.name}</option>
                        ))}
                    </select>
                </label>
            )}
            <p className="mt-2 text-xs font-semibold text-slate-500">
                {position.status}
                {position.latitude && position.longitude ? ` · ${position.latitude.toFixed(5)}, ${position.longitude.toFixed(5)}` : ""}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
                <Button disabled={isPending || (!canManage && !selectedEmployee)} onClick={() => run("check_in")} tone="green">
                    Check In
                </Button>
                <Button disabled={isPending || !selectedEmployee} onClick={() => run("start_break")} tone="blue">
                    Start Break
                </Button>
                <Button disabled={isPending || !selectedEmployee} onClick={() => run("end_break")} tone="blue">
                    End Break
                </Button>
                <Button disabled={isPending || !selectedEmployee} onClick={() => run("check_out")} tone="dark">
                    Check Out
                </Button>
            </div>

            <section className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <h3 className="text-sm font-black">Employee Profile</h3>
                {selectedEmployee ? (
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-xs md:grid-cols-4">
                        <ProfileLine label="Code" value={selectedEmployee.employee_code ?? "Not set"} />
                        <ProfileLine label="Role" value={selectedEmployee.job_title ?? selectedEmployee.role ?? "Not set"} />
                        <ProfileLine label="Assignment" value={isAllRounder ? "All Rounder" : "Fixed office"} />
                        <ProfileLine label="Status" value={selectedEmployee.todayStatus.replace(/_/g, " ")} />
                        <ProfileLine label="Monthly rate" value={`${selectedEmployee.attendanceRate}%`} />
                    </div>
                ) : (
                    <p className="mt-3 text-sm text-slate-500">No employee selected.</p>
                )}
            </section>

            {message && <p className="mt-4 text-sm text-slate-600">{message}</p>}
        </div>
    );
}

function ProfileLine({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between gap-3">
            <span className="text-slate-500">{label}</span>
            <span className="font-bold text-right capitalize">{value}</span>
        </div>
    );
}

function Button({
    disabled,
    onClick,
    children,
    tone,
}: {
    disabled: boolean;
    onClick: () => void;
    children: React.ReactNode;
    tone: "dark" | "green" | "blue";
}) {
    const toneClass = {
        dark: "bg-slate-900 hover:bg-slate-800",
        green: "bg-green-600 hover:bg-green-700",
        blue: "bg-blue-600 hover:bg-blue-700",
    }[tone];

    return (
        <button disabled={disabled} onClick={onClick} className={`${toneClass} h-10 rounded-xl px-3 text-xs font-black text-white disabled:opacity-40`}>
            {children}
        </button>
    );
}
