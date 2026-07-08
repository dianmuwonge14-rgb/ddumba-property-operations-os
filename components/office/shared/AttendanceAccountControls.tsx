"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, CheckCircle2, ChevronDown, Clock3, Loader2, LogOut } from "lucide-react";
import type { AttendanceGateStatus } from "@/lib/attendance/gate";

type Props = {
    attendance: AttendanceGateStatus;
    compact?: boolean;
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

function formatDate(value: string) {
    return new Intl.DateTimeFormat("en-GB", {
        timeZone: TIME_ZONE,
        day: "2-digit",
        month: "short",
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

export default function AttendanceAccountControls({ attendance, compact = false }: Props) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [period, setPeriod] = useState<"today" | "week" | "month">("today");
    const [history, setHistory] = useState<HistoryRow[]>([]);
    const [message, setMessage] = useState("");
    const [isPending, startTransition] = useTransition();
    const [loadingHistory, setLoadingHistory] = useState(false);

    useEffect(() => {
        if (!open) return;
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
    }, [open, period]);

    function checkOut() {
        if (!window.confirm("Check out of work for today? You will stay logged in until you press Logout.")) return;
        setMessage("");
        startTransition(async () => {
            try {
                const response = await fetch("/api/attendance/self", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ eventType: "check_out" }),
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error ?? "Check-out failed.");
                setMessage(result.message ?? "Checked out successfully.");
                router.refresh();
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Check-out failed.");
            }
        });
    }

    if (!attendance.required) {
        return (
            <a href="/api/auth/logout" className={compact ? "mobile-nowrap mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-slate-200 transition hover:bg-white/15" : "grid h-9 w-9 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/10 text-slate-200 ring-1 ring-white/5 hover:bg-white hover:text-slate-950"} title="Logout" aria-label="Logout">
                <LogOut size={16} />
                {compact ? "Logout" : null}
            </a>
        );
    }

    const canCheckOut = attendance.checkedIn && !attendance.checkedOut;
    const checkedOutLabel = attendance.checkedOut ? `Checked out at ${formatTime(attendance.lastCheckOut)}` : null;

    return (
        <div className={compact ? "mt-3 space-y-2" : "relative flex items-center gap-2"}>
            {canCheckOut ? (
                <button
                    type="button"
                    onClick={checkOut}
                    disabled={isPending}
                    className={compact ? "mobile-nowrap flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-black text-white transition hover:bg-emerald-400 disabled:opacity-60" : "mobile-nowrap inline-flex h-9 shrink-0 items-center gap-1.5 rounded-2xl border border-emerald-300/30 bg-emerald-400/12 px-2.5 text-[11px] font-black text-emerald-100 hover:bg-emerald-400/20 disabled:opacity-60 sm:gap-2 sm:px-3 sm:text-xs"}
                >
                    {isPending ? <Loader2 className="animate-spin" size={15} /> : <CheckCircle2 size={15} />}
                    Check Out
                </button>
            ) : checkedOutLabel ? (
                <span className={compact ? "mobile-nowrap flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-400/12 px-4 py-3 text-xs font-black text-sky-100" : "mobile-nowrap inline-flex h-9 max-w-[42vw] shrink-0 items-center gap-1.5 overflow-hidden rounded-2xl border border-sky-300/30 bg-sky-400/12 px-2.5 text-[11px] font-black text-sky-100 sm:max-w-none sm:gap-2 sm:px-3 sm:text-xs"}>
                    <Clock3 className="shrink-0" size={14} />
                    <span className="truncate">{checkedOutLabel}</span>
                </span>
            ) : null}

            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                className={compact ? "mobile-nowrap flex w-full items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-slate-200 transition hover:bg-white/15" : "grid h-9 w-9 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/10 text-slate-200 ring-1 ring-white/5 hover:bg-white hover:text-slate-950"}
                title="Office Attendance History"
                aria-label="Office Attendance History"
            >
                <CalendarDays size={16} />
                {compact ? "Attendance History" : null}
                {compact ? <ChevronDown size={14} /> : null}
            </button>

            <a href="/api/auth/logout" className={compact ? "mobile-nowrap flex w-full items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-slate-200 transition hover:bg-white/15" : "grid h-9 w-9 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/10 text-slate-200 ring-1 ring-white/5 hover:bg-white hover:text-slate-950"} title="Logout" aria-label="Logout">
                <LogOut size={16} />
                {compact ? "Logout" : null}
            </a>

            {message ? <p className={compact ? "rounded-2xl bg-white/10 px-3 py-2 text-xs font-bold text-slate-100" : "absolute right-0 top-12 w-72 rounded-2xl border border-white/10 bg-slate-950 p-3 text-xs font-bold text-slate-100 shadow-2xl"}>{message}</p> : null}

            {open ? (
                <div className={compact ? "rounded-3xl border border-white/10 bg-slate-950/80 p-3" : "absolute right-0 top-12 z-[90] w-[34rem] max-w-[calc(100vw-2rem)] rounded-3xl border border-white/10 bg-slate-950 p-4 text-white shadow-2xl shadow-black/50"}>
                    <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                            <p className="text-sm font-black text-white">Office Attendance History</p>
                            <p className="text-xs font-bold text-slate-400">Live from Supabase</p>
                        </div>
                        <div className="flex rounded-2xl bg-white/10 p-1">
                            {(["today", "week", "month"] as const).map((item) => (
                                <button key={item} type="button" onClick={() => setPeriod(item)} className={`mobile-nowrap rounded-xl px-2.5 py-1 text-[11px] font-black uppercase ${period === item ? "bg-white text-slate-950" : "text-slate-300"}`}>
                                    {item}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="max-h-72 overflow-auto rounded-2xl border border-white/10">
                        <table className="w-full min-w-[32rem] text-left text-xs">
                            <thead className="sticky top-0 bg-slate-900 text-slate-300">
                                <tr>
                                    {["Date", "In", "Out", "Status", "Duration", "Office", "By"].map((head) => (
                                        <th key={head} className="px-3 py-2 font-black">{head}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {loadingHistory ? (
                                    <tr><td colSpan={7} className="px-3 py-4 text-center font-bold text-slate-400">Loading history...</td></tr>
                                ) : history.length ? history.map((row) => (
                                    <tr key={row.id} className="border-t border-white/10 text-slate-200">
                                        <td className="px-3 py-2 font-bold">{formatDate(row.attendanceDate)}</td>
                                        <td className="px-3 py-2">{formatTime(row.checkInTime)}</td>
                                        <td className="px-3 py-2">{formatTime(row.checkOutTime)}</td>
                                        <td className="px-3 py-2 font-black">{statusLabel(row.status)}</td>
                                        <td className="px-3 py-2">{formatDuration(row.workDurationMinutes)}</td>
                                        <td className="px-3 py-2">{row.officeName}</td>
                                        <td className="px-3 py-2">{row.recordedBy}</td>
                                    </tr>
                                )) : (
                                    <tr><td colSpan={7} className="px-3 py-4 text-center font-bold text-slate-400">No attendance records found.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
