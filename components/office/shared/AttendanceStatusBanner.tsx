import { Clock3, MapPin, ShieldCheck } from "lucide-react";
import type { AttendanceGateStatus } from "@/lib/attendance/gate";

const TIME_ZONE = "Africa/Kampala";

type Props = {
    attendance: AttendanceGateStatus;
};

function formatDate(value: string | null) {
    if (!value) return "Today";
    return new Intl.DateTimeFormat("en-GB", {
        timeZone: TIME_ZONE,
        day: "2-digit",
        month: "short",
        year: "numeric",
    }).format(new Date(`${value}T12:00:00+03:00`));
}

function formatTime(value: string | null) {
    if (!value) return null;
    return new Intl.DateTimeFormat("en-UG", {
        timeZone: TIME_ZONE,
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    }).format(new Date(value));
}

function statusLabel(status: AttendanceGateStatus["status"]) {
    if (status === "on_time") return "On Time";
    if (status === "late") return "Late";
    if (status === "absent") return "Absent";
    if (status === "checked_out") return "Checked Out";
    return "Not Checked In";
}

function formatDuration(minutes: number) {
    if (!minutes) return "";
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours ? `${hours}h ${mins}m` : `${mins}m`;
}

function statusTone(status: AttendanceGateStatus["status"]) {
    if (status === "on_time") return "border-emerald-400/30 bg-emerald-400/12 text-emerald-100";
    if (status === "late") return "border-amber-400/30 bg-amber-400/12 text-amber-100";
    if (status === "absent") return "border-red-400/30 bg-red-400/12 text-red-100";
    if (status === "checked_out") return "border-sky-400/30 bg-sky-400/12 text-sky-100";
    return "border-slate-400/30 bg-slate-400/12 text-slate-100";
}

export default function AttendanceStatusBanner({ attendance }: Props) {
    if (!attendance.required) return null;

    const checkInTime = formatTime(attendance.firstCheckIn);
    const checkOutTime = formatTime(attendance.lastCheckOut);
    const duration = formatDuration(attendance.workDurationMinutes);
    const title = attendance.checkedIn
        ? attendance.checkedOut
            ? `Checked in at ${checkInTime ?? "recorded time"} — Checked out at ${checkOutTime ?? "recorded time"} — ${statusLabel(attendance.status)}${duration ? ` — ${duration}` : ""}`
            : `Checked in at ${checkInTime ?? "recorded time"} — ${statusLabel(attendance.status)} — Not checked out yet`
        : attendance.status === "absent"
            ? "Not checked in today — Absent"
            : "Not checked in today — Attendance required";

    return (
        <section className="mx-auto mb-5 max-w-[1800px] rounded-3xl border border-white/10 bg-white/[0.07] p-4 text-white shadow-2xl shadow-black/20 backdrop-blur-2xl">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10 text-cyan-100 ring-1 ring-white/10">
                        <ShieldCheck size={20} />
                    </span>
                    <div>
                        <p className="text-sm font-black">{title}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs font-bold text-slate-300">
                            <span className="inline-flex items-center gap-1">
                                <MapPin size={13} />
                                {attendance.officeName ?? "Active office"}
                            </span>
                            <span className="inline-flex items-center gap-1">
                                <Clock3 size={13} />
                                {formatDate(attendance.attendanceDate)} · {attendance.timezone}
                            </span>
                        </div>
                    </div>
                </div>
                <span className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-black ${statusTone(attendance.status)}`}>
                    {statusLabel(attendance.status)}
                </span>
            </div>
        </section>
    );
}
