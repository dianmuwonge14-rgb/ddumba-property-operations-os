"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, CheckCircle2, Clock3, Loader2, ShieldCheck } from "lucide-react";
import type { AttendanceGateStatus } from "@/lib/attendance/gate";
import AttendanceAccountControls from "@/components/office/shared/AttendanceAccountControls";

type Props = {
    attendance: AttendanceGateStatus;
};

type HistoryRow = {
    id: string;
    attendanceDate: string;
    officeName: string;
    recordedBy: string;
    checkInTime: string | null;
    checkOutTime: string | null;
    status: AttendanceGateStatus["status"];
    checkoutStatus: AttendanceGateStatus["checkoutStatus"];
    workDurationMinutes: number;
};

const TIME_ZONE = "Africa/Kampala";

function formatTime(value: string | null) {
    if (!value) return "-";
    return new Intl.DateTimeFormat("en-UG", {
        timeZone: TIME_ZONE,
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    }).format(new Date(value));
}

function formatDate(value: string | null) {
    if (!value) return "Today";
    return new Intl.DateTimeFormat("en-GB", {
        timeZone: TIME_ZONE,
        day: "2-digit",
        month: "short",
        year: "numeric",
    }).format(new Date(`${value}T12:00:00+03:00`));
}

function formatDuration(minutes: number) {
    if (!minutes) return "-";
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours ? `${hours}h ${mins}m` : `${mins}m`;
}

function statusLabel(status: AttendanceGateStatus["status"]) {
    if (status === "on_time") return "On Time";
    if (status === "late") return "Late";
    if (status === "absent") return "Absent";
    if (status === "checked_out") return "Checked Out";
    return "Not Checked In";
}

function statusTone(status: AttendanceGateStatus["status"]) {
    if (status === "on_time") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-100";
    if (status === "late") return "border-amber-400/30 bg-amber-400/10 text-amber-100";
    if (status === "absent") return "border-red-400/30 bg-red-400/10 text-red-100";
    if (status === "checked_out") return "border-sky-400/30 bg-sky-400/10 text-sky-100";
    return "border-slate-400/30 bg-slate-400/10 text-slate-100";
}

export default function OfficeSelfAttendanceCentre({ attendance }: Props) {
    const router = useRouter();
    const [period, setPeriod] = useState<"today" | "week" | "month">("today");
    const [history, setHistory] = useState<HistoryRow[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(true);
    const [message, setMessage] = useState("");
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        let cancelled = false;
        setLoadingHistory(true);
        fetch(`/api/attendance/history?period=${period}`)
            .then((response) => response.json())
            .then((payload) => {
                if (!cancelled) setHistory(Array.isArray(payload.rows) ? payload.rows : []);
            })
            .catch(() => {
                if (!cancelled) setHistory([]);
            })
            .finally(() => {
                if (!cancelled) setLoadingHistory(false);
            });
        return () => {
            cancelled = true;
        };
    }, [period]);

    function checkIn() {
        setMessage("");
        startTransition(async () => {
            try {
                const response = await fetch("/api/attendance/self", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ eventType: "check_in" }),
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error ?? "Check-in failed.");
                setMessage(result.message ?? "Checked in successfully.");
                router.refresh();
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Check-in failed.");
            }
        });
    }

    return (
        <main className="enterprise-page">
            <div className="enterprise-shell">
                <section className="enterprise-dark-panel overflow-hidden rounded-[2rem] p-6 text-white shadow-2xl shadow-black/30">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">Office Attendance</p>
                            <h1 className="mt-2 text-3xl font-black">My Workday Status</h1>
                            <p className="mt-2 max-w-2xl text-sm font-semibold text-slate-300">
                                Office accounts can check in, check out, and view their own office attendance history here. Employee management and payroll tools are admin-only.
                            </p>
                        </div>
                        <AttendanceAccountControls attendance={attendance} compact />
                    </div>
                </section>

                <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                    <StatusCard icon={<ShieldCheck size={18} />} label="Today" value={formatDate(attendance.attendanceDate)} />
                    <StatusCard icon={<Clock3 size={18} />} label="Check-in time" value={formatTime(attendance.firstCheckIn)} />
                    <StatusCard icon={<Clock3 size={18} />} label="Check-out time" value={formatTime(attendance.lastCheckOut)} />
                    <StatusCard icon={<CheckCircle2 size={18} />} label="Work duration" value={formatDuration(attendance.workDurationMinutes)} />
                    <div className={`rounded-3xl border p-5 ${statusTone(attendance.status)}`}>
                        <p className="text-xs font-black uppercase opacity-80">Status</p>
                        <p className="mt-2 text-2xl font-black">{statusLabel(attendance.status)}</p>
                        <p className="mt-1 text-xs font-bold opacity-80">{attendance.officeName ?? "Active office"}</p>
                    </div>
                </section>

                {!attendance.checkedIn ? (
                    <section className="mt-6 rounded-3xl border border-amber-300/30 bg-amber-400/10 p-5 text-amber-50">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div>
                                <p className="text-sm font-black">Not checked in today</p>
                                <p className="mt-1 text-xs font-bold text-amber-100/80">Record today&apos;s attendance before using office workflows.</p>
                            </div>
                            <button
                                type="button"
                                onClick={checkIn}
                                disabled={isPending}
                                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-black text-white shadow-lg shadow-emerald-950/20 disabled:opacity-60"
                            >
                                {isPending ? <Loader2 className="animate-spin" size={17} /> : <ShieldCheck size={17} />}
                                Check In Now
                            </button>
                        </div>
                        {message ? <p className="mt-3 rounded-2xl bg-white/10 px-4 py-3 text-sm font-bold">{message}</p> : null}
                    </section>
                ) : message ? (
                    <p className="mt-6 rounded-2xl bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-100">{message}</p>
                ) : null}

                <section className="mt-6 overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.06] text-white shadow-2xl shadow-black/20 backdrop-blur-2xl">
                    <div className="flex flex-col gap-3 border-b border-white/10 p-5 md:flex-row md:items-center md:justify-between">
                        <div>
                            <div className="flex items-center gap-2">
                                <CalendarDays size={18} />
                                <h2 className="text-lg font-black">Office Attendance History</h2>
                            </div>
                            <p className="mt-1 text-xs font-bold text-slate-400">Only your office account records are shown.</p>
                        </div>
                        <div className="flex w-fit rounded-2xl bg-white/10 p-1">
                            {(["today", "week", "month"] as const).map((item) => (
                                <button key={item} type="button" onClick={() => setPeriod(item)} className={`rounded-xl px-3 py-2 text-xs font-black uppercase ${period === item ? "bg-white text-slate-950" : "text-slate-300"}`}>
                                    {item === "week" ? "This Week" : item === "month" ? "This Month" : "Today"}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="overflow-auto">
                        <table className="w-full min-w-[820px] text-left text-sm">
                            <thead className="bg-slate-950/70 text-xs uppercase text-slate-400">
                                <tr>
                                    {["Date", "Check-in", "Check-out", "Status", "Duration", "Office", "Recorded by"].map((head) => (
                                        <th key={head} className="px-4 py-3 font-black">{head}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {loadingHistory ? (
                                    <tr><td colSpan={7} className="px-4 py-8 text-center text-sm font-bold text-slate-400">Loading attendance history...</td></tr>
                                ) : history.length ? history.map((row) => (
                                    <tr key={row.id} className="border-t border-white/10 text-slate-200">
                                        <td className="px-4 py-3 font-bold">{formatDate(row.attendanceDate)}</td>
                                        <td className="px-4 py-3">{formatTime(row.checkInTime)}</td>
                                        <td className="px-4 py-3">{formatTime(row.checkOutTime)}</td>
                                        <td className="px-4 py-3 font-black">{statusLabel(row.status)}</td>
                                        <td className="px-4 py-3">{formatDuration(row.workDurationMinutes)}</td>
                                        <td className="px-4 py-3">{row.officeName}</td>
                                        <td className="px-4 py-3">{row.recordedBy}</td>
                                    </tr>
                                )) : (
                                    <tr><td colSpan={7} className="px-4 py-8 text-center text-sm font-bold text-slate-400">No attendance records found for this filter.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>
        </main>
    );
}

function StatusCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
    return (
        <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5 text-white shadow-xl shadow-black/10 backdrop-blur">
            <div className="flex items-center gap-2 text-cyan-100">
                {icon}
                <p className="text-xs font-black uppercase text-slate-400">{label}</p>
            </div>
            <p className="mt-2 text-2xl font-black">{value}</p>
        </div>
    );
}
