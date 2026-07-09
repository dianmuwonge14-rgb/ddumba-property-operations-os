"use client";

import type React from "react";
import { useState } from "react";
import Link from "next/link";
import { ExternalLink, KeyRound, LockKeyhole, ShieldCheck, UserPlus, UsersRound, X } from "lucide-react";
import OfficeAccountManagementCentre from "@/components/office/admin/OfficeAccountManagementCentre";
import type { AdminCentreData } from "@/lib/admin-centre/types";

type Props = {
    company: AdminCentreData["company"];
    raw: Pick<AdminCentreData["raw"], "offices" | "roles" | "users" | "userOfficeRoles" | "pinCredentials" | "securityEvents">;
    serviceRoleConfigured: boolean;
};

type ModalMode = "office" | "collector" | null;

export default function CeoAccountCreationCentre({ company, raw, serviceRoleConfigured }: Props) {
    const [modalMode, setModalMode] = useState<ModalMode>(null);
    const lockedCount = raw.pinCredentials.filter((pin) => pin.status === "locked").length;

    return (
        <section className="overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-950 text-white shadow-2xl shadow-slate-950/20">
            <div className="bg-gradient-to-br from-slate-950 via-blue-950 to-cyan-950 p-5 sm:p-6">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                    <div>
                        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-cyan-100">
                            <ShieldCheck size={14} />
                            Admin Account Control
                        </div>
                        <h2 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Account Creation Centre</h2>
                        <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-300">
                            Create office logins and field collector accounts from the CEO Command Centre using the same approved production account system.
                        </p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center sm:min-w-[360px]">
                        <Mini label="Accounts" value={raw.users.length.toLocaleString()} />
                        <Mini label="Offices" value={raw.offices.length.toLocaleString()} />
                        <Mini label="Locked" value={lockedCount.toLocaleString()} />
                    </div>
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-2">
                    <ActionCard
                        description="Create a login for a specific office, assign a role, and set a secure PIN/password."
                        icon={<UserPlus size={28} />}
                        onClick={() => setModalMode("office")}
                        title="Create Office Account"
                        tone="blue"
                    />
                    <ActionCard
                        description="Create an all-office field collector account with collector dashboard, payments, promises, and money submission."
                        icon={<UsersRound size={28} />}
                        onClick={() => setModalMode("collector")}
                        title="Create Field Collector Account"
                        tone="cyan"
                    />
                </div>
            </div>

            <div className="grid gap-3 border-t border-white/10 bg-slate-900/70 p-4 sm:grid-cols-2 xl:grid-cols-4">
                <QuickLink href="/office/admin#account-management" icon={<ExternalLink size={16} />} label="Office Accounts Management" />
                <QuickLink href="/office/admin#account-management" icon={<UsersRound size={16} />} label="Field Collectors Management" />
                <QuickLink href="/office/admin#account-management" icon={<LockKeyhole size={16} />} label="Locked Account Recovery" />
                <QuickLink href="/office/admin#account-management" icon={<KeyRound size={16} />} label="Reset PIN / Password" />
            </div>

            {modalMode && (
                <div className="fixed inset-0 z-[80] bg-slate-950/80 p-3 backdrop-blur-sm sm:p-5" role="dialog" aria-modal="true" aria-label={modalMode === "office" ? "Create Office Account" : "Create Field Collector Account"}>
                    <div className="mx-auto flex h-full max-w-7xl flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-white text-slate-950 shadow-2xl">
                        <div className="flex flex-col gap-3 border-b border-slate-200 bg-gradient-to-r from-slate-950 via-blue-950 to-slate-900 p-4 text-white sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">Existing production account workflow</p>
                                <h3 className="mt-1 text-xl font-black">
                                    {modalMode === "office" ? "Create Office Account" : "Create Field Collector Account"}
                                </h3>
                                <p className="mt-1 text-sm font-semibold text-slate-300">
                                    Use the visible creation card below. The full account directory, locked recovery, and PIN reset tools remain available in this same workflow.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setModalMode(null)}
                                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 text-sm font-black text-white hover:bg-white/15"
                            >
                                <X size={17} />
                                Close
                            </button>
                        </div>
                        <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-3 sm:p-5">
                            <OfficeAccountManagementCentre
                                company={company}
                                initialFocus={modalMode}
                                raw={raw}
                                serviceRoleConfigured={serviceRoleConfigured}
                            />
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}

function ActionCard({
    description,
    icon,
    onClick,
    title,
    tone,
}: {
    description: string;
    icon: React.ReactNode;
    onClick: () => void;
    title: string;
    tone: "blue" | "cyan";
}) {
    const accent = tone === "blue" ? "from-blue-500 to-indigo-500 shadow-blue-950/30" : "from-cyan-400 to-emerald-400 shadow-cyan-950/30";
    return (
        <button
            type="button"
            onClick={onClick}
            className="group rounded-[1.75rem] border border-white/10 bg-white/[0.08] p-5 text-left shadow-xl transition hover:-translate-y-0.5 hover:bg-white/[0.12] focus:outline-none focus:ring-2 focus:ring-cyan-300"
        >
            <span className={`grid h-16 w-16 place-items-center rounded-[1.35rem] bg-gradient-to-br ${accent} text-white shadow-lg`}>
                {icon}
            </span>
            <h3 className="mt-5 text-2xl font-black text-white">{title}</h3>
            <p className="mt-2 min-h-12 text-sm font-semibold leading-6 text-slate-300">{description}</p>
            <span className="mt-5 inline-flex items-center rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-950 shadow-lg transition group-hover:bg-cyan-100">
                Open Form
            </span>
        </button>
    );
}

function QuickLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
    return (
        <Link
            href={href}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.08] px-3 text-center text-sm font-black text-slate-100 transition hover:bg-white/[0.14]"
        >
            {icon}
            <span>{label}</span>
        </Link>
    );
}

function Mini({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-white/[0.08] px-3 py-2">
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p>
            <p className="mt-1 text-lg font-black text-white">{value}</p>
        </div>
    );
}
