"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BellRing, X } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

type ToastRow = {
    id: string;
    title: string | null;
    message: string | null;
    action_url?: string | null;
    recipient_type: string | null;
    office_id: string | null;
};

type Props = {
    companyId: string | null;
    officeId: string | null;
    isAdmin: boolean;
};

export default function GlobalNotificationToasts({ companyId, officeId, isAdmin }: Props) {
    const [toast, setToast] = useState<ToastRow | null>(null);
    const [connectionIssue, setConnectionIssue] = useState(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const channelRef = useRef<RealtimeChannel | null>(null);
    const mountedRef = useRef(false);
    const connectingRef = useRef(false);
    const retryAttemptRef = useRef(0);
    const connectionGenerationRef = useRef(0);

    useEffect(() => {
        if (!companyId) return;
        mountedRef.current = true;
        retryAttemptRef.current = 0;
        connectionGenerationRef.current += 1;
        const generation = connectionGenerationRef.current;
        const supabase = createSupabaseBrowserClient();
        const baseChannelName = `ddumba-notifications-${companyId}-${officeId ?? "admin"}`;
        const channelSessionId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const maxRetries = 5;

        const clearRetry = () => {
            if (retryRef.current) {
                clearTimeout(retryRef.current);
                retryRef.current = null;
            }
        };

        const removeActiveChannel = async () => {
            const activeChannel = channelRef.current;
            channelRef.current = null;
            if (activeChannel) await supabase.removeChannel(activeChannel);
        };

        const removeStaleNotificationChannels = async () => {
            const clientWithChannels = supabase as typeof supabase & {
                getChannels?: () => Array<RealtimeChannel & { topic?: string }>;
            };
            const channels = clientWithChannels.getChannels?.() ?? [];
            await Promise.all(
                channels
                    .filter((channel) => String(channel.topic ?? "").includes(baseChannelName))
                    .map((channel) => supabase.removeChannel(channel)),
            );
        };

        const scheduleReconnect = () => {
            if (!mountedRef.current || generation !== connectionGenerationRef.current) return;
            if (retryAttemptRef.current >= maxRetries) {
                setConnectionIssue(true);
                return;
            }
            clearRetry();
            setConnectionIssue(true);
            const retryDelay = Math.min(12000, 1000 * 2 ** retryAttemptRef.current);
            retryAttemptRef.current += 1;
            retryRef.current = setTimeout(() => {
                retryRef.current = null;
                void connect();
            }, retryDelay);
        };

        const connect = async () => {
            if (!mountedRef.current || generation !== connectionGenerationRef.current || connectingRef.current) return;
            connectingRef.current = true;
            clearRetry();
            await removeActiveChannel();
            await removeStaleNotificationChannels();
            if (!mountedRef.current || generation !== connectionGenerationRef.current) {
                connectingRef.current = false;
                return;
            }
            const channelName = `${baseChannelName}-${channelSessionId}-${generation}-${retryAttemptRef.current}`;
            const channel = supabase
                .channel(channelName)
                .on(
                    "postgres_changes",
                    {
                        event: "INSERT",
                        schema: "public",
                        table: "notifications",
                        filter: `company_id=eq.${companyId}`,
                    },
                    (payload) => {
                        if (!mountedRef.current || generation !== connectionGenerationRef.current) return;
                        const row = payload.new as ToastRow;
                        const matchesAdmin = isAdmin && row.recipient_type === "admin";
                        const matchesOffice = !isAdmin && row.recipient_type === "office" && row.office_id === officeId;
                        if (!matchesAdmin && !matchesOffice) return;
                        setToast(row);
                        if (timerRef.current) clearTimeout(timerRef.current);
                        timerRef.current = setTimeout(() => setToast(null), 9000);
                    },
                );
            channelRef.current = channel;
            channel.subscribe((status) => {
                    if (!mountedRef.current || generation !== connectionGenerationRef.current || channelRef.current !== channel) return;
                    if (status === "SUBSCRIBED") {
                        connectingRef.current = false;
                        retryAttemptRef.current = 0;
                        setConnectionIssue(false);
                        return;
                    }
                    if (status !== "CHANNEL_ERROR" && status !== "TIMED_OUT" && status !== "CLOSED") return;
                    connectingRef.current = false;
                    void removeActiveChannel();
                    scheduleReconnect();
                });
        };

        void connect();

        return () => {
            mountedRef.current = false;
            connectingRef.current = false;
            connectionGenerationRef.current += 1;
            if (timerRef.current) clearTimeout(timerRef.current);
            clearRetry();
            void removeActiveChannel();
        };
    }, [companyId, isAdmin, officeId]);

    if (!toast && !connectionIssue) return null;

    return (
        <div className="fixed bottom-5 right-5 z-[200] w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-white/20 bg-slate-950 text-white shadow-2xl shadow-black/40">
            {toast ? (
                <div className="flex items-start gap-3 p-4">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-500 text-white">
                        <BellRing size={20} />
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-black">{toast.title ?? "Notification"}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-300">{toast.message ?? "New update received."}</p>
                        <Link href={toast.action_url || "/office/notifications"} className="mt-3 inline-flex rounded-2xl bg-white px-3 py-2 text-xs font-black text-slate-950">
                            View Details
                        </Link>
                    </div>
                    <button type="button" onClick={() => setToast(null)} className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-white/10 text-slate-200 hover:bg-white hover:text-slate-950" aria-label="Dismiss notification">
                        <X size={16} />
                    </button>
                </div>
            ) : (
                <div className="flex items-start gap-3 p-4">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-500 text-slate-950">
                        <BellRing size={20} />
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-black">Live updates reconnecting</p>
                        <p className="mt-1 text-sm font-semibold text-slate-300">Supabase realtime is retrying safely. Data pages remain usable.</p>
                    </div>
                    <button type="button" onClick={() => setConnectionIssue(false)} className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-white/10 text-slate-200 hover:bg-white hover:text-slate-950" aria-label="Dismiss realtime notice">
                        <X size={16} />
                    </button>
                </div>
            )}
        </div>
    );
}
