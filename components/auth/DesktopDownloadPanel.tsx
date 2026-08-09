"use client";

import { Download, Laptop, MonitorDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const RELEASE_VERSION = "0.1.2";
const WINDOWS_URL = "https://github.com/dianmuwonge14-rgb/ddumba-property-operations-os/releases/download/v0.1.2/Ddumba-OS-Windows-x64.exe";
const MAC_URL = "https://github.com/dianmuwonge14-rgb/ddumba-property-operations-os/releases/download/v0.1.2/Ddumba-OS-Mac-arm64.dmg";
const WINDOWS_MSI_URL = "https://github.com/dianmuwonge14-rgb/ddumba-property-operations-os/releases/download/v0.1.2/Ddumba-OS-Windows-x64.msi";

type DetectedOs = "windows" | "mac" | "other";

function detectOs(): DetectedOs {
    const platform = `${navigator.platform} ${navigator.userAgent}`.toLowerCase();
    if (platform.includes("win")) return "windows";
    if (platform.includes("mac")) return "mac";
    return "other";
}

export default function DesktopDownloadPanel() {
    const [detectedOs, setDetectedOs] = useState<DetectedOs>("other");

    useEffect(() => {
        setDetectedOs(detectOs());
    }, []);

    const primary = useMemo(() => {
        if (detectedOs === "mac") {
            return {
                href: MAC_URL,
                label: "Download for Mac",
                meta: "macOS Apple Silicon DMG",
                os: "mac" as const,
            };
        }
        return {
            href: WINDOWS_URL,
            label: "Download for Windows",
            meta: "Windows x64 EXE installer",
            os: "windows" as const,
        };
    }, [detectedOs]);

    return (
        <section className="mt-6 rounded-3xl border border-cyan-100 bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 p-4 text-white shadow-xl shadow-blue-200/50">
            <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-cyan-400/15 text-cyan-200">
                    <MonitorDown size={21} />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-200">Download Desktop App</p>
                    <h3 className="mt-1 text-lg font-black">Ddumba OS Desktop</h3>
                    <p className="mt-1 text-xs font-bold text-slate-300">Version {RELEASE_VERSION}. Offline workspace, Sync Centre and secure device registration.</p>
                </div>
            </div>

            <a
                className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-950 shadow-lg shadow-cyan-950/20 transition hover:bg-cyan-50"
                href={primary.href}
            >
                <span>
                    {primary.label}
                    <span className="mt-0.5 block text-xs font-bold text-slate-500">{primary.meta}</span>
                </span>
                <Download size={18} />
            </a>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <DownloadLink active={primary.os === "windows"} href={WINDOWS_URL} label="Windows" meta="EXE installer" />
                <DownloadLink active={primary.os === "mac"} href={MAC_URL} label="macOS" meta="DMG installer" />
            </div>

            <details className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-bold text-slate-300">
                <summary className="cursor-pointer text-slate-100">Other Downloads</summary>
                <div className="mt-3 grid gap-2">
                    <a className="inline-flex items-center justify-between rounded-xl bg-white/10 px-3 py-2 text-slate-100 hover:bg-white/15" href={WINDOWS_MSI_URL}>
                        Windows MSI installer <Download size={14} />
                    </a>
                    <a className="inline-flex items-center justify-between rounded-xl bg-white/10 px-3 py-2 text-slate-100 hover:bg-white/15" href="https://github.com/dianmuwonge14-rgb/ddumba-property-operations-os/releases/tag/v0.1.2">
                        View release notes <Laptop size={14} />
                    </a>
                </div>
            </details>
        </section>
    );
}

function DownloadLink({ active, href, label, meta }: { active: boolean; href: string; label: string; meta: string }) {
    return (
        <a
            className={`rounded-2xl border px-3 py-3 text-sm font-black transition ${active
                ? "border-cyan-300 bg-cyan-300/15 text-cyan-50"
                : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"}`}
            href={href}
        >
            {label}
            <span className="mt-0.5 block text-xs font-bold text-slate-400">{meta}</span>
        </a>
    );
}
