"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Building2, Phone, Save, UserRound } from "lucide-react";

type TenantContactUpdate = {
    id: string;
    full_name: string | null;
    phone: string | null;
};

type TenantContactCardProps = {
    tenantId: string | null | undefined;
    tenantName: string | null | undefined;
    tenantPhone: string | null | undefined;
    roomNumber: string | null | undefined;
    landlordName: string | null | undefined;
    officeName: string | null | undefined;
    onSaved?: (tenant: TenantContactUpdate) => void;
    variant?: "light" | "dark";
};

function displayValue(value: string | null | undefined, fallback: string) {
    const trimmed = String(value ?? "").trim();
    return trimmed || fallback;
}

export default function TenantContactCard({
    tenantId,
    tenantName,
    tenantPhone,
    roomNumber,
    landlordName,
    officeName,
    onSaved,
    variant = "light",
}: TenantContactCardProps) {
    const [editing, setEditing] = useState(false);
    const [name, setName] = useState(tenantName ?? "");
    const [phone, setPhone] = useState(tenantPhone ?? "");
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setName(tenantName ?? "");
        setPhone(tenantPhone ?? "");
        setEditing(false);
        setMessage(null);
        setError(null);
    }, [tenantId, tenantName, tenantPhone]);

    const isDark = variant === "dark";
    const hasName = Boolean(String(tenantName ?? "").trim());
    const hasPhone = Boolean(String(tenantPhone ?? "").trim());

    async function saveContact() {
        if (!tenantId) {
            setError("Select a tenant before editing contact details.");
            return;
        }

        setSaving(true);
        setError(null);
        setMessage(null);
        try {
            const response = await fetch("/api/tenants/contact", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fullName: name, phone, tenantId }),
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error ?? "Tenant contact could not be saved.");
            onSaved?.(payload.tenant as TenantContactUpdate);
            setEditing(false);
            setMessage("Tenant contact updated live.");
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : "Tenant contact could not be saved.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <section className={`rounded-3xl border p-4 ${isDark ? "border-cyan-300/20 bg-slate-900/90" : "border-slate-200 bg-white"}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                    <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${isDark ? "bg-cyan-300 text-slate-950" : "bg-slate-950 text-white"}`}>
                        <UserRound size={20} />
                    </span>
                    <div>
                        <p className={`text-xs font-black uppercase ${isDark ? "text-cyan-200" : "text-slate-500"}`}>Tenant Contact</p>
                        <h3 className={`text-lg font-black ${isDark ? "text-white" : "text-slate-950"}`}>{displayValue(tenantName, "Add tenant name")}</h3>
                        <p className={`mt-1 inline-flex items-center gap-2 text-sm font-bold ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                            <Phone size={14} />
                            {displayValue(tenantPhone, "Add phone number")}
                        </p>
                    </div>
                </div>
                {!editing ? (
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setEditing(true)} className={`rounded-full px-3 py-1.5 text-xs font-black ${isDark ? "bg-white/10 text-white hover:bg-white/15" : "bg-slate-100 text-slate-800 hover:bg-slate-200"}`}>
                            {hasName ? "Edit tenant name" : "Add tenant name"}
                        </button>
                        <button type="button" onClick={() => setEditing(true)} className={`rounded-full px-3 py-1.5 text-xs font-black ${isDark ? "bg-white/10 text-white hover:bg-white/15" : "bg-slate-100 text-slate-800 hover:bg-slate-200"}`}>
                            {hasPhone ? "Edit phone number" : "Add phone number"}
                        </button>
                    </div>
                ) : null}
            </div>

            <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
                <Detail label="Room" value={displayValue(roomNumber, "No room")} variant={variant} />
                <Detail label="Landlord" value={displayValue(landlordName, "No landlord")} variant={variant} />
                <Detail label="Office" value={displayValue(officeName, "No office")} variant={variant} icon={<Building2 size={14} />} />
            </div>

            {editing ? (
                <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_0.8fr_auto]">
                    <label>
                        <span className={`text-[10px] font-black uppercase ${isDark ? "text-slate-400" : "text-slate-500"}`}>Tenant name</span>
                        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Tenant name" className={`mt-1 h-11 w-full rounded-xl border px-3 text-sm font-bold outline-none ${isDark ? "border-slate-700 bg-slate-950 text-white placeholder:text-slate-500 focus:border-cyan-300" : "border-slate-200 bg-slate-50 text-slate-950 placeholder:text-slate-400 focus:border-blue-400"}`} />
                    </label>
                    <label>
                        <span className={`text-[10px] font-black uppercase ${isDark ? "text-slate-400" : "text-slate-500"}`}>Phone number</span>
                        <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Phone number" className={`mt-1 h-11 w-full rounded-xl border px-3 text-sm font-bold outline-none ${isDark ? "border-slate-700 bg-slate-950 text-white placeholder:text-slate-500 focus:border-cyan-300" : "border-slate-200 bg-slate-50 text-slate-950 placeholder:text-slate-400 focus:border-blue-400"}`} />
                    </label>
                    <div className="flex gap-2 self-end">
                        <button type="button" onClick={() => setEditing(false)} className={`h-11 rounded-xl px-4 text-sm font-black ${isDark ? "bg-white/10 text-white" : "bg-slate-100 text-slate-700"}`}>
                            Cancel
                        </button>
                        <button type="button" disabled={saving} onClick={saveContact} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-300 px-4 text-sm font-black text-slate-950 disabled:opacity-50">
                            <Save size={16} />
                            {saving ? "Saving" : "Save changes"}
                        </button>
                    </div>
                </div>
            ) : null}

            {message ? <p className={`mt-3 text-xs font-black ${isDark ? "text-emerald-200" : "text-emerald-700"}`}>{message}</p> : null}
            {error ? <p className={`mt-3 text-xs font-black ${isDark ? "text-rose-200" : "text-rose-700"}`}>{error}</p> : null}
        </section>
    );
}

function Detail({ icon, label, value, variant }: { icon?: ReactNode; label: string; value: string; variant: "light" | "dark" }) {
    const isDark = variant === "dark";
    return (
        <div className={`rounded-2xl px-3 py-2 ${isDark ? "bg-white/5" : "bg-slate-50"}`}>
            <p className={`text-[10px] font-black uppercase ${isDark ? "text-slate-400" : "text-slate-500"}`}>{label}</p>
            <p className={`mt-0.5 flex min-w-0 items-center gap-1 truncate font-black ${isDark ? "text-white" : "text-slate-950"}`}>
                {icon}
                <span className="truncate">{value}</span>
            </p>
        </div>
    );
}
