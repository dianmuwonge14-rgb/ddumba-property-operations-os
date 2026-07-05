"use client";

import type React from "react";
import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, KeyRound, Loader2, ShieldCheck, UserPlus, UsersRound } from "lucide-react";
import {
    createOffice,
    createOfficeAccount,
    deactivateOffice,
    deactivateOfficeAccount,
    reactivateOfficeAccount,
    resetOfficeAccountPin,
    updateOffice,
    updateOfficeAccount,
} from "@/app/actions/admin-accounts";
import { EmptyState, StatusChip } from "@/components/office/shared/EnterpriseUI";
import type { AdminCentreData } from "@/lib/admin-centre/types";

type Props = {
    company: AdminCentreData["company"];
    raw: Pick<AdminCentreData["raw"], "offices" | "roles" | "users" | "userOfficeRoles" | "pinCredentials" | "securityEvents">;
    serviceRoleConfigured: boolean;
};

function formatDate(value: string | null | undefined) {
    if (!value) return "No activity";
    return new Intl.DateTimeFormat("en-UG", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Africa/Kampala",
    }).format(new Date(value));
}

export default function OfficeAccountManagementCentre({ company, raw, serviceRoleConfigured }: Props) {
    const officeOptions = raw.offices;
    const roleOptions = raw.roles.filter((role) => !role.company_id || role.company_id === company?.id);
    const [selectedUserId, setSelectedUserId] = useState(raw.users[0]?.id ?? "");
    const [selectedOfficeId, setSelectedOfficeId] = useState(raw.offices[0]?.id ?? "");
    const [message, setMessage] = useState<string | null>(null);
    const [tone, setTone] = useState<"success" | "error" | "info">("info");
    const [isPending, startTransition] = useTransition();

    const selectedUser = useMemo(
        () => raw.users.find((user) => user.id === selectedUserId) ?? null,
        [raw.users, selectedUserId],
    );
    const selectedAssignment = raw.userOfficeRoles.find((assignment) => assignment.user_id === selectedUserId) ?? null;
    const selectedPin = raw.pinCredentials.find((pin) => pin.user_id === selectedUserId) ?? null;
    const lastSecurityEvent = raw.securityEvents.find((event) => event.user_id === selectedUserId) ?? null;
    const defaultOfficeId = selectedUser?.default_office_id ?? officeOptions[0]?.id ?? "";
    const defaultRoleId = selectedAssignment?.role_id ?? roleOptions[0]?.id ?? "";
    const selectedOffice = useMemo(
        () => raw.offices.find((office) => office.id === selectedOfficeId) ?? null,
        [raw.offices, selectedOfficeId],
    );

    function run(action: () => Promise<void>, success: string) {
        startTransition(async () => {
            setMessage(null);
            try {
                await action();
                setTone("success");
                setMessage(success);
            } catch (error) {
                setTone("error");
                setMessage(error instanceof Error ? error.message : "Action failed.");
            }
        });
    }

    function createAccount(formData: FormData) {
        run(
            () => createOfficeAccount({
                fullName: String(formData.get("fullName") ?? ""),
                email: String(formData.get("email") ?? ""),
                pin: String(formData.get("pin") ?? ""),
                officeId: String(formData.get("officeId") ?? ""),
                roleId: String(formData.get("roleId") ?? ""),
            }),
            "Office account created.",
        );
    }

    function updateAccount(formData: FormData) {
        if (!selectedUser) return;
        run(
            () => updateOfficeAccount({
                userId: selectedUser.id,
                fullName: String(formData.get("editFullName") ?? selectedUser.full_name),
                officeId: String(formData.get("editOfficeId") ?? defaultOfficeId),
                roleId: String(formData.get("editRoleId") ?? defaultRoleId),
                status: String(formData.get("status") ?? selectedUser.status),
            }),
            "Office account updated.",
        );
    }

    function resetPin(formData: FormData) {
        if (!selectedUser) return;
        run(
            () => resetOfficeAccountPin({
                userId: selectedUser.id,
                pin: String(formData.get("newPin") ?? ""),
            }),
            "PIN reset securely.",
        );
    }

    function addOffice(formData: FormData) {
        run(
            () => createOffice({
                officeName: String(formData.get("officeName") ?? ""),
                officeCode: String(formData.get("officeCode") ?? ""),
                managerName: String(formData.get("managerName") ?? ""),
                city: String(formData.get("city") ?? ""),
                region: String(formData.get("region") ?? ""),
                collectionTarget: String(formData.get("collectionTarget") ?? ""),
                expenseBudget: String(formData.get("expenseBudget") ?? ""),
                status: "active",
            }),
            "Office created safely.",
        );
    }

    function editOffice(formData: FormData) {
        if (!selectedOffice) return;
        run(
            () => updateOffice({
                officeId: selectedOffice.id,
                officeName: String(formData.get("editOfficeName") ?? selectedOffice.office_name),
                officeCode: String(formData.get("editOfficeCode") ?? selectedOffice.office_code ?? ""),
                managerName: String(formData.get("editManagerName") ?? selectedOffice.manager_name ?? ""),
                city: String(formData.get("editCity") ?? selectedOffice.city ?? ""),
                region: String(formData.get("editRegion") ?? selectedOffice.region ?? ""),
                collectionTarget: String(formData.get("editCollectionTarget") ?? selectedOffice.collection_target ?? ""),
                expenseBudget: String(formData.get("editExpenseBudget") ?? selectedOffice.expense_budget ?? ""),
                status: String(formData.get("editOfficeStatus") ?? selectedOffice.status ?? "active"),
            }),
            "Office updated.",
        );
    }

    return (
        <section className="enterprise-panel overflow-hidden">
            <div className="border-b border-slate-200 bg-slate-950 p-6 text-white">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-center gap-3">
                        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-500">
                            <UsersRound size={23} />
                        </span>
                        <div>
                            <h2 className="text-xl font-black">Office Account Management Centre</h2>
                            <p className="text-sm text-slate-300">Create office accounts, assign roles, reset PINs, deactivate access, and review login activity.</p>
                        </div>
                    </div>
                    <StatusChip label={`${raw.users.length} accounts`} tone="blue" />
                </div>
            </div>

            {!serviceRoleConfigured && (
                <div className="border-b border-amber-200 bg-amber-50 px-6 py-4 text-amber-900">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="mt-0.5 shrink-0" size={20} />
                        <div>
                            <p className="font-black">Service-role key required for account creation and PIN resets</p>
                            <p className="mt-1 text-sm font-bold">
                                Missing env variable: <span className="font-black">SUPABASE_SERVICE_ROLE_KEY</span>. Viewing accounts, office assignment, and role assignment remain available, but Supabase Auth password/PIN operations require this secret.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 gap-0 xl:grid-cols-12">
                <div id="office-management" className="border-b border-slate-200 p-6 xl:col-span-12">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <PanelTitle icon={<ShieldCheck size={18} />} title="Office Management" />
                        <StatusChip label={`${officeOptions.length} offices`} tone="cyan" />
                    </div>
                    <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-12">
                        <form action={addOffice} className="rounded-3xl border border-slate-200 p-5 xl:col-span-5">
                            <p className="font-black">Add Office</p>
                            <p className="mt-1 text-sm font-bold text-slate-500">Creates an active office record without touching existing operational data.</p>
                            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                                <Input name="officeName" placeholder="Office name" />
                                <Input name="officeCode" placeholder="Office code" />
                                <Input name="managerName" placeholder="Manager name" />
                                <Input name="city" placeholder="City" />
                                <Input name="region" placeholder="Region" />
                                <Input name="collectionTarget" placeholder="Collection target" />
                                <Input name="expenseBudget" placeholder="Expense budget" />
                            </div>
                            <SubmitButton disabled={isPending} label="Add Office" />
                        </form>

                        <div className="rounded-3xl border border-slate-200 p-5 xl:col-span-7">
                            <p className="font-black">Edit / Deactivate Office</p>
                            <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-[0.85fr_1.15fr]">
                                <div className="max-h-[380px] space-y-3 overflow-y-auto pr-1">
                                    {officeOptions.map((office) => (
                                        <button
                                            key={office.id}
                                            type="button"
                                            onClick={() => setSelectedOfficeId(office.id)}
                                            className={`w-full rounded-2xl border p-4 text-left transition ${selectedOfficeId === office.id ? "border-cyan-200 bg-cyan-50" : "border-slate-200 hover:bg-slate-50"}`}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <p className="font-black">{office.office_name}</p>
                                                    <p className="text-xs font-bold text-slate-500">{office.office_code ?? office.code ?? "No code"} · {office.city ?? office.region ?? "No location"}</p>
                                                </div>
                                                <StatusChip label={office.status ?? "unknown"} tone={office.status === "active" ? "green" : "orange"} />
                                            </div>
                                        </button>
                                    ))}
                                </div>
                                {selectedOffice ? (
                                    <form action={editOffice} className="space-y-3">
                                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                            <Input name="editOfficeName" placeholder="Office name" defaultValue={selectedOffice.office_name} />
                                            <Input name="editOfficeCode" placeholder="Office code" defaultValue={selectedOffice.office_code ?? selectedOffice.code ?? ""} />
                                            <Input name="editManagerName" placeholder="Manager name" defaultValue={selectedOffice.manager_name ?? ""} />
                                            <Input name="editCity" placeholder="City" defaultValue={selectedOffice.city ?? ""} />
                                            <Input name="editRegion" placeholder="Region" defaultValue={selectedOffice.region ?? ""} />
                                            <Select name="editOfficeStatus" defaultValue={selectedOffice.status ?? "active"} options={[{ label: "Active", value: "active" }, { label: "Inactive", value: "inactive" }, { label: "Suspended", value: "suspended" }]} />
                                            <Input name="editCollectionTarget" placeholder="Collection target" defaultValue={String(selectedOffice.collection_target ?? "")} />
                                            <Input name="editExpenseBudget" placeholder="Expense budget" defaultValue={String(selectedOffice.expense_budget ?? "")} />
                                        </div>
                                        <div className="flex flex-col gap-2 sm:flex-row">
                                            <SubmitButton disabled={isPending} label="Save Office" compact />
                                            <button
                                                type="button"
                                                onClick={() => run(() => deactivateOffice(selectedOffice.id), "Office deactivated safely.")}
                                                disabled={isPending}
                                                className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-black text-red-700 disabled:opacity-60"
                                            >
                                                Deactivate Office
                                            </button>
                                        </div>
                                    </form>
                                ) : (
                                    <EmptyState title="Select an office" description="Choose an office to edit governance details." />
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="border-b border-slate-200 p-6 xl:col-span-4 xl:border-b-0 xl:border-r">
                    <PanelTitle icon={<UserPlus size={18} />} title="Create Office Account" />
                    <form action={createAccount} className="mt-5 space-y-3">
                        <Input name="fullName" placeholder="Full name" />
                        <Input name="email" placeholder="Email / login ID" type="email" />
                        <Select name="officeId" options={officeOptions.map((office) => ({ label: office.office_name, value: office.id }))} />
                        <Select name="roleId" options={roleOptions.map((role) => ({ label: role.name, value: role.id }))} />
                        <Input name="pin" placeholder="PIN" type="password" maxLength={12} />
                        <SubmitButton disabled={isPending || !serviceRoleConfigured} label={serviceRoleConfigured ? "Create Account" : "Service Key Required"} />
                    </form>
                </div>

                <div className="p-6 xl:col-span-8">
                    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[0.9fr_1.1fr]">
                        <div>
                            <PanelTitle icon={<ShieldCheck size={18} />} title="Account Directory" />
                            <div className="mt-4 max-h-[520px] space-y-3 overflow-y-auto pr-1">
                                {raw.users.length === 0 ? (
                                    <EmptyState title="No accounts" description="Office accounts will appear after creation." />
                                ) : raw.users.map((user) => {
                                    const active = user.id === selectedUserId;
                                    const office = officeOptions.find((item) => item.id === user.default_office_id);
                                    const pin = raw.pinCredentials.find((item) => item.user_id === user.id);
                                    return (
                                        <button
                                            key={user.id}
                                            type="button"
                                            onClick={() => setSelectedUserId(user.id)}
                                            className={`w-full rounded-3xl border p-4 text-left transition ${active ? "border-blue-200 bg-blue-50" : "border-slate-200 hover:bg-slate-50"}`}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <p className="font-black text-slate-950">{user.full_name}</p>
                                                    <p className="text-sm text-slate-500">{office?.office_name ?? "Company account"} · {user.email ?? "No email"}</p>
                                                </div>
                                                <StatusChip label={user.status} tone={user.status === "active" ? "green" : "orange"} />
                                            </div>
                                            <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-500">
                                                <span>PIN: {pin?.status ?? "missing"}</span>
                                                <span>Last: {formatDate(pin?.last_used_at)}</span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div>
                            <PanelTitle icon={<KeyRound size={18} />} title="Selected Account Controls" />
                            {selectedUser ? (
                                <div className="mt-4 space-y-4">
                                    <div className="rounded-3xl border border-slate-200 p-5">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <p className="text-xl font-black">{selectedUser.full_name}</p>
                                                <p className="text-sm text-slate-500">{selectedUser.email}</p>
                                            </div>
                                            <StatusChip label={selectedPin?.status ?? "no pin"} tone={selectedPin?.status === "active" ? "green" : "orange"} />
                                        </div>
                                        <div className="mt-4 grid grid-cols-2 gap-3">
                                            <Mini label="Last login/PIN use" value={formatDate(selectedPin?.last_used_at)} />
                                            <Mini label="Last activity" value={formatDate(lastSecurityEvent?.created_at)} />
                                            <Mini label="Failed attempts" value={String(selectedPin?.failed_attempts ?? 0)} />
                                            <Mini label="Device" value={lastSecurityEvent?.user_agent ? "Recorded" : "No device"} />
                                        </div>
                                    </div>

                                    <form action={updateAccount} className="rounded-3xl border border-slate-200 p-5">
                                        <p className="mb-3 font-black">Update Assignment</p>
                                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                            <Input name="editFullName" placeholder="Full name" defaultValue={selectedUser.full_name} />
                                            <Select name="status" defaultValue={selectedUser.status} options={[{ label: "Active", value: "active" }, { label: "Inactive", value: "inactive" }, { label: "Suspended", value: "suspended" }]} />
                                            <Select name="editOfficeId" defaultValue={defaultOfficeId} options={officeOptions.map((office) => ({ label: office.office_name, value: office.id }))} />
                                            <Select name="editRoleId" defaultValue={defaultRoleId} options={roleOptions.map((role) => ({ label: role.name, value: role.id }))} />
                                        </div>
                                        <SubmitButton disabled={isPending} label="Update Account" />
                                    </form>

                                    <form action={resetPin} className="rounded-3xl border border-slate-200 p-5">
                                        <p className="mb-3 font-black">Reset PIN</p>
                                        <div className="flex flex-col gap-3 sm:flex-row">
                                            <Input name="newPin" placeholder="New PIN" type="password" maxLength={12} />
                                            <SubmitButton disabled={isPending || !serviceRoleConfigured} label={serviceRoleConfigured ? "Reset PIN" : "Service Key Required"} compact />
                                        </div>
                                    </form>

                                    <button
                                        type="button"
                                        onClick={() => run(() => updateOfficeAccount({
                                            userId: selectedUser.id,
                                            fullName: selectedUser.full_name ?? "Office account",
                                            officeId: defaultOfficeId,
                                            roleId: defaultRoleId,
                                            status: "suspended",
                                        }), "Account disabled.")}
                                        disabled={isPending}
                                        className="w-full rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-black text-amber-800 disabled:opacity-60"
                                    >
                                        Disable Account
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => run(() => reactivateOfficeAccount(selectedUser.id), "Account reactivated.")}
                                        disabled={isPending}
                                        className="w-full rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-800 disabled:opacity-60"
                                    >
                                        Reactivate Account
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => run(() => deactivateOfficeAccount(selectedUser.id), "Account deactivated and PIN revoked.")}
                                        disabled={isPending}
                                        className="w-full rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-black text-red-700 disabled:opacity-60"
                                    >
                                        Safe Delete / Deactivate Account
                                    </button>
                                </div>
                            ) : (
                                <EmptyState title="Select an account" description="Choose an office account to view controls." />
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {message && (
                <div className={`border-t px-6 py-4 text-sm font-black ${tone === "success" ? "border-green-200 bg-green-50 text-green-700" : tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-blue-200 bg-blue-50 text-blue-700"}`}>
                    {isPending && <Loader2 size={15} className="mr-2 inline animate-spin" />}
                    {message}
                </div>
            )}
        </section>
    );
}

function PanelTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
    return (
        <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-2xl bg-slate-100 text-slate-700">{icon}</span>
            <h3 className="font-black">{title}</h3>
        </div>
    );
}

function Input({ name, placeholder, type = "text", maxLength, defaultValue }: { name: string; placeholder: string; type?: string; maxLength?: number; defaultValue?: string }) {
    return <input name={name} type={type} maxLength={maxLength} defaultValue={defaultValue} placeholder={placeholder} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:border-blue-500 focus:bg-white" />;
}

function Select({ name, options, defaultValue }: { name: string; options: Array<{ label: string; value: string }>; defaultValue?: string }) {
    return (
        <select name={name} defaultValue={defaultValue ?? options[0]?.value ?? ""} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:border-blue-500 focus:bg-white">
            {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
    );
}

function SubmitButton({ disabled, label, compact = false }: { disabled: boolean; label: string; compact?: boolean }) {
    return (
        <button disabled={disabled} className={`${compact ? "sm:w-44" : "mt-3 w-full"} rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-lg shadow-slate-200 transition hover:bg-blue-700 disabled:opacity-60`}>
            {disabled ? "Working..." : label}
        </button>
    );
}

function Mini({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-xs font-bold text-slate-400">{label}</p>
            <p className="mt-1 truncate text-sm font-black text-slate-900">{value}</p>
        </div>
    );
}
