"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertTriangle, Loader2, LogOut, MapPin, ShieldCheck } from "lucide-react";
import { logout } from "@/app/actions/auth-session";
import type { AttendanceGateStatus } from "@/lib/attendance/gate";

type Props = {
    attendance: AttendanceGateStatus;
};

export default function AttendanceAccessGate({ attendance }: Props) {
    const pathname = usePathname();
    const router = useRouter();
    const [message, setMessage] = useState(attendance.message);
    const [isPending, startTransition] = useTransition();
    const blocksPage = attendance.required && !attendance.checkedIn && pathname !== "/office/attendance";

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
                setMessage(result.message);
                router.refresh();
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Check-in failed.");
            }
        });
    }

    if (!blocksPage) return null;

    return (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/75 p-4 backdrop-blur">
            <section className="w-full max-w-xl rounded-[2rem] border border-white/20 bg-white p-6 shadow-2xl">
                <div className="flex items-start gap-4">
                    <span className="grid h-14 w-14 shrink-0 place-items-center rounded-3xl bg-orange-50 text-orange-700">
                        <AlertTriangle size={26} />
                    </span>
                    <div>
                        <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-600">Attendance Gate</p>
                        <h2 className="mt-2 text-2xl font-black text-slate-950">Please check in at work before continuing.</h2>
                        <p className="mt-2 text-sm font-semibold text-slate-500">
                            Office accounts must record today&apos;s check-in before using Ddumba operations modules.
                        </p>
                    </div>
                </div>

                <div className="mt-5 grid gap-3 rounded-3xl bg-slate-50 p-4 text-sm font-bold text-slate-600">
                    <div className="flex items-center justify-between gap-3">
                        <span>Office</span>
                        <span className="text-right text-slate-950">{attendance.officeName ?? "Active office"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <span>User</span>
                        <span className="text-right text-slate-950">{attendance.employeeName ?? "Office user"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <span>Status</span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-3 py-1 text-xs font-black text-orange-700">
                            <MapPin size={13} />
                            Not checked in
                        </span>
                    </div>
                </div>

                {message && <p className="mt-4 rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700">{message}</p>}

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    <button
                        type="button"
                        onClick={checkIn}
                        disabled={isPending}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-emerald-200 disabled:opacity-60"
                    >
                        {isPending ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
                        Check In Now
                    </button>
                    <form action={logout}>
                        <button className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 px-5 py-4 text-sm font-black text-slate-600">
                            <LogOut size={18} />
                            Logout
                        </button>
                    </form>
                </div>
            </section>
        </div>
    );
}
