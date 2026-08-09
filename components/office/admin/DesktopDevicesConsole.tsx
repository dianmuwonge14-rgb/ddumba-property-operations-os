"use client";

import { Laptop, RefreshCw, ShieldOff } from "lucide-react";
import { useEffect, useState } from "react";

type DeviceRow = {
    app_version: string | null;
    created_at: string | null;
    device_id: string;
    device_name: string | null;
    id: string;
    last_online_at: string | null;
    last_sync_at: string | null;
    pending_count: number | null;
    platform: string | null;
    status: string | null;
};

function formatDate(value: string | null) {
    if (!value) return "Not yet";
    return new Intl.DateTimeFormat("en-UG", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Africa/Kampala",
    }).format(new Date(value));
}

export default function DesktopDevicesConsole() {
    const [devices, setDevices] = useState<DeviceRow[]>([]);
    const [message, setMessage] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    async function loadDevices() {
        setLoading(true);
        try {
            const response = await fetch("/api/desktop/devices", { cache: "no-store", credentials: "include" });
            const payload = await response.json();
            if (!response.ok || !payload.success) throw new Error(payload.message ?? "Desktop devices could not be loaded.");
            setDevices(payload.devices ?? []);
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Desktop devices could not be loaded.");
        } finally {
            setLoading(false);
        }
    }

    async function revokeDevice(deviceId: string) {
        setMessage("Revoking offline access...");
        try {
            const response = await fetch("/api/desktop/devices", {
                body: JSON.stringify({ deviceId, reason: "Revoked from Admin Desktop Devices" }),
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                method: "PATCH",
            });
            const payload = await response.json();
            if (!response.ok || !payload.success) throw new Error(payload.message ?? "Desktop device could not be revoked.");
            setMessage("Desktop offline access revoked.");
            await loadDevices();
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "Desktop device could not be revoked.");
        }
    }

    useEffect(() => {
        void loadDevices();
    }, []);

    return (
        <main className="mx-auto w-full max-w-[1600px] px-4 py-6 text-white sm:px-6 lg:px-8">
            <section className="rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 shadow-2xl shadow-black/30 backdrop-blur-2xl sm:p-7">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div>
                        <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-200">Admin</p>
                        <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Desktop Devices</h1>
                        <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-300">
                            Registered offline desktop devices, sync status, pending counts and revocation controls.
                        </p>
                    </div>
                    <button
                        className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-black transition hover:bg-white/15"
                        onClick={loadDevices}
                        type="button"
                    >
                        <RefreshCw size={16} /> Refresh
                    </button>
                </div>
                {message ? <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/55 px-4 py-3 text-sm font-bold text-slate-200">{message}</div> : null}
            </section>

            <section className="mt-6 grid gap-3">
                {loading ? (
                    <div className="rounded-3xl border border-white/10 bg-slate-950/55 p-6 text-sm font-bold text-slate-300">Loading desktop devices...</div>
                ) : devices.length === 0 ? (
                    <div className="rounded-3xl border border-white/10 bg-slate-950/55 p-6 text-sm font-bold text-slate-300">No desktop devices have registered yet.</div>
                ) : devices.map((device) => (
                    <article key={device.id} className="rounded-3xl border border-white/10 bg-slate-950/55 p-4 shadow-xl shadow-black/20">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex min-w-0 items-center gap-3">
                                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-cyan-400/15 text-cyan-100 ring-1 ring-cyan-200/20">
                                    <Laptop size={22} />
                                </div>
                                <div className="min-w-0">
                                    <h2 className="truncate text-lg font-black">{device.device_name ?? "Desktop device"}</h2>
                                    <p className="truncate font-mono text-xs text-slate-400">{device.device_id}</p>
                                    <p className="mt-1 text-xs font-bold text-slate-300">{device.platform ?? "desktop"} · v{device.app_version ?? "unknown"}</p>
                                </div>
                            </div>
                            <div className="grid gap-2 text-sm sm:grid-cols-4 lg:min-w-[620px]">
                                <div>
                                    <p className="text-xs font-black uppercase text-slate-500">Status</p>
                                    <p className="font-black">{String(device.status ?? "unknown").toUpperCase()}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-black uppercase text-slate-500">Last online</p>
                                    <p className="font-bold text-slate-200">{formatDate(device.last_online_at)}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-black uppercase text-slate-500">Last sync</p>
                                    <p className="font-bold text-slate-200">{formatDate(device.last_sync_at)}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-black uppercase text-slate-500">Pending</p>
                                    <p className="font-black">{Number(device.pending_count ?? 0).toLocaleString()}</p>
                                </div>
                            </div>
                            <button
                                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-300/30 bg-red-400/15 px-4 py-2 text-sm font-black text-red-100 transition hover:bg-red-400/25 disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={device.status === "revoked"}
                                onClick={() => revokeDevice(device.device_id)}
                                type="button"
                            >
                                <ShieldOff size={16} /> Revoke Offline Access
                            </button>
                        </div>
                    </article>
                ))}
            </section>
        </main>
    );
}
