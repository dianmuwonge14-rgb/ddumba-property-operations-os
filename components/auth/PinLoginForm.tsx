"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, LockKeyhole, ShieldCheck } from "lucide-react";

export default function PinLoginForm() {
    const router = useRouter();
    const [pin, setPin] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [isPending, startTransition] = useTransition();

    function login() {
        setError("");
        setSuccess("");

        const secret = pin.trim();

        if (secret.length < 4) {
            setError("Enter a valid PIN/password.");
            return;
        }

        startTransition(async () => {
            const response = await fetch("/api/auth/office-login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pin: secret }),
            });

            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                setError(payload.error ?? "Login failed.");
                return;
            }

            setSuccess(payload.message ?? `Logged into ${payload.office?.name ?? "Office"}`);
            router.push(payload.redirectTo ?? "/office");
            router.refresh();
        });
    }

    return (
        <div className="space-y-5">
            <div className="rounded-3xl border border-slate-200 bg-white/95 p-5 shadow-lg shadow-slate-200/60">
                <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
                            <KeyRound size={20} />
                        </span>
                        <div>
                            <p className="text-sm font-black text-slate-900">Secure Login</p>
                            <p className="text-xs font-bold text-slate-400">Enter your PIN or password</p>
                        </div>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                        <ShieldCheck size={13} />
                        Server verified
                    </span>
                </div>

                <input
                    type="password"
                    autoFocus
                    maxLength={64}
                    placeholder="PIN / Password"
                    value={pin}
                    onChange={(event) => setPin(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") login();
                    }}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center text-2xl font-black text-slate-950 outline-none focus:border-emerald-500 focus:bg-white"
                />
            </div>

            {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</p>}
            {success && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{success}</p>}

            <button
                type="button"
                onClick={login}
                disabled={isPending}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-slate-950 to-blue-700 py-4 text-lg font-black text-white shadow-xl shadow-blue-200/70 transition hover:from-blue-800 hover:to-slate-950 disabled:opacity-60"
            >
                {isPending ? <Loader2 size={20} className="animate-spin" /> : <LockKeyhole size={20} />}
                {isPending ? "Signing in..." : "Login"}
            </button>
        </div>
    );
}
