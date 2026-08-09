"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigationMemory } from "@/components/navigation/NavigationMemoryProvider";

type Props = {
    initialExpiresAt: number | null;
};

type SessionState = "active" | "warning" | "expired";

const ACTIVITY_TOUCH_THROTTLE_MS = 5 * 60 * 1000;
const SESSION_DURATION_MS = 60 * 60 * 1000;
const SESSION_WARNING_MS = 5 * 60 * 1000;

function clearSensitiveBrowserAuthData() {
    if (typeof window === "undefined") return;
    const matcher = /(supabase|auth-token|auth_token|permission|ddumba_session|sb-)/i;
    for (const storage of [window.localStorage, window.sessionStorage]) {
        try {
            for (let index = storage.length - 1; index >= 0; index -= 1) {
                const key = storage.key(index);
                if (key && matcher.test(key) && !key.startsWith("ddumba:draft:")) {
                    storage.removeItem(key);
                }
            }
        } catch {
            // Storage may be unavailable in private browsing.
        }
    }
}

async function touchSession(reason: "activity" | "continue_session") {
    const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
        cache: "no-store",
    });
    if (!response.ok) throw new Error("Session expired.");
    return response.json() as Promise<{ expiresAt: number | null }>;
}

export default function SessionTimeoutController({ initialExpiresAt }: Props) {
    const pathname = usePathname();
    const { hasUnsavedDraft } = useNavigationMemory();
    const [expiresAt, setExpiresAt] = useState<number | null>(initialExpiresAt);
    const [state, setState] = useState<SessionState>("active");
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const lastActivityTouchRef = useRef(0);

    const expiresInMs = useMemo(() => expiresAt ? Math.max(0, expiresAt - Date.now()) : SESSION_DURATION_MS, [expiresAt]);

    const expireNow = useCallback(async () => {
        setState("expired");
        setMessage(hasUnsavedDraft
            ? "You have unsaved work. Drafts are preserved where supported. Log in again to continue."
            : "Your session expired for security purposes. Please log in again.");
        try {
            await fetch("/api/auth/session", { method: "DELETE", cache: "no-store" });
        } finally {
            clearSensitiveBrowserAuthData();
            if (!hasUnsavedDraft) window.location.assign("/");
        }
    }, [hasUnsavedDraft]);

    const continueSession = useCallback(async () => {
        setIsRefreshing(true);
        setMessage(null);
        try {
            const result = await touchSession("continue_session");
            setExpiresAt(result.expiresAt);
            setState("active");
            lastActivityTouchRef.current = Date.now();
        } catch {
            await expireNow();
        } finally {
            setIsRefreshing(false);
        }
    }, [expireNow]);

    const logOutNow = useCallback(async () => {
        clearSensitiveBrowserAuthData();
        window.location.assign("/api/auth/logout?reason=manual");
    }, []);

    const touchForActivity = useCallback(async () => {
        if (state !== "active") return;
        const now = Date.now();
        if (now - lastActivityTouchRef.current < ACTIVITY_TOUCH_THROTTLE_MS) return;
        lastActivityTouchRef.current = now;
        try {
            const result = await touchSession("activity");
            setExpiresAt(result.expiresAt);
            setState("active");
        } catch {
            await expireNow();
        }
    }, [expireNow, state]);

    useEffect(() => {
        void touchForActivity();
    }, [pathname, touchForActivity]);

    useEffect(() => {
        const events: Array<keyof WindowEventMap> = ["click", "keydown", "pointerdown", "submit", "focus"];
        const onActivity = () => {
            void touchForActivity();
        };
        events.forEach((event) => window.addEventListener(event, onActivity, { passive: true }));
        return () => events.forEach((event) => window.removeEventListener(event, onActivity));
    }, [touchForActivity]);

    useEffect(() => {
        if (!expiresAt || state === "expired") return;
        const warningDelay = Math.max(0, expiresAt - Date.now() - SESSION_WARNING_MS);
        const expiryDelay = Math.max(0, expiresAt - Date.now());
        const warningTimer = window.setTimeout(() => setState("warning"), warningDelay);
        const expiryTimer = window.setTimeout(() => {
            void expireNow();
        }, expiryDelay);
        return () => {
            window.clearTimeout(warningTimer);
            window.clearTimeout(expiryTimer);
        };
    }, [expireNow, expiresAt, state]);

    if (state === "active") return null;

    const minutes = Math.max(0, Math.ceil(expiresInMs / 60000));

    return (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
            <section className="w-full max-w-lg rounded-[28px] border border-white/20 bg-slate-950 p-6 text-white shadow-2xl shadow-black/40">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-300">Session Security</p>
                <h2 className="mt-3 text-2xl font-black">
                    {state === "expired" ? "Session expired" : "Your session will expire soon"}
                </h2>
                <p className="mt-3 text-sm font-semibold leading-6 text-slate-200">
                    {state === "expired"
                        ? message ?? "Your session expired for security purposes. Please log in again."
                        : `Your session will expire in ${minutes || 5} minute${minutes === 1 ? "" : "s"} for security purposes.`}
                </p>
                {hasUnsavedDraft ? (
                    <p className="mt-3 rounded-2xl border border-amber-300/40 bg-amber-300/10 px-4 py-3 text-sm font-bold text-amber-100">
                        You have unsaved work. Draft preservation is active for supported forms in this tab.
                    </p>
                ) : null}
                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                    {state === "warning" ? (
                        <button
                            type="button"
                            disabled={isRefreshing}
                            onClick={continueSession}
                            className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-black text-emerald-950 shadow-lg shadow-emerald-950/20 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isRefreshing ? "Verifying..." : "Continue Session"}
                        </button>
                    ) : null}
                    <button
                        type="button"
                        onClick={state === "expired" ? () => window.location.assign("/") : logOutNow}
                        className="rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-black text-white transition hover:bg-white hover:text-slate-950"
                    >
                        {state === "expired" ? "Log In Again" : "Log Out Now"}
                    </button>
                </div>
            </section>
        </div>
    );
}
