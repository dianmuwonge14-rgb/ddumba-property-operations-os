"use client";

import type React from "react";
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
    AlertTriangle,
    BadgeCheck,
    Building2,
    CheckCircle2,
    Copy,
    Eye,
    EyeOff,
    KeyRound,
    Loader2,
    Printer,
    RefreshCcw,
    ShieldCheck,
    UserCog,
    UserPlus,
    UsersRound,
    Wand2,
} from "lucide-react";
import {
    createOfficeAccount,
    createOfficeWithLogin,
    deactivateOffice,
    deactivateOfficeAccount,
    reactivateOfficeAccount,
    resetOfficeAccountPin,
    updateOffice,
    updateOfficeAccount,
} from "@/app/actions/admin-accounts";
import { saveEmployee } from "@/app/actions/attendance";
import { createFieldCollectorAccount } from "@/app/actions/collectors";
import { EmptyState, StatusChip } from "@/components/office/shared/EnterpriseUI";
import type { AdminCentreData } from "@/lib/admin-centre/types";

type Props = {
    company: AdminCentreData["company"];
    initialFocus?: "office" | "collector";
    raw: Pick<AdminCentreData["raw"], "offices" | "roles" | "users" | "userOfficeRoles" | "pinCredentials" | "securityEvents">;
    serviceRoleConfigured: boolean;
};

type CreateMode = "office" | "office-account" | "collector" | "employee" | "admin" | "all-rounder" | null;
type TabKey = "create" | "offices" | "accounts" | "employees" | "roles" | "incomplete" | "activity";
type MessageTone = "success" | "error" | "info";

type OfficeSuccess = {
    officeId: string;
    officeName: string;
    officeCode: string;
    loginName: string;
    loginEmail: string;
    status: string;
    createdAt: string;
    createdBy: string;
};

type OfficeWizardState = {
    officeName: string;
    officeCode: string;
    location: string;
    phone: string;
    status: string;
    loginName: string;
    pin: string;
    confirmPin: string;
    loginEmail: string;
    requirePasswordChange: boolean;
    managerName: string;
    openingTime: string;
    closingTime: string;
    geofence: string;
};

const emptyOfficeWizard: OfficeWizardState = {
    officeName: "",
    officeCode: "",
    location: "",
    phone: "",
    status: "active",
    loginName: "",
    pin: "",
    confirmPin: "",
    loginEmail: "",
    requirePasswordChange: false,
    managerName: "",
    openingTime: "",
    closingTime: "",
    geofence: "",
};

const createOptions: Array<{ key: Exclude<CreateMode, null>; title: string; description: string; icon: React.ReactNode; tone: string }> = [
    { key: "office", title: "Office", description: "Create the office and its working login together.", icon: <Building2 size={22} />, tone: "from-blue-600 to-cyan-500" },
    { key: "office-account", title: "Office Account", description: "Add a login to an existing office.", icon: <KeyRound size={22} />, tone: "from-indigo-600 to-blue-500" },
    { key: "collector", title: "Field Collector Account", description: "Create an all-office collector workspace login.", icon: <UsersRound size={22} />, tone: "from-cyan-600 to-emerald-500" },
    { key: "employee", title: "Employee", description: "Create a fixed-office employee record.", icon: <UserPlus size={22} />, tone: "from-violet-600 to-indigo-500" },
    { key: "admin", title: "Admin Account", description: "Create a company-level administrator login.", icon: <ShieldCheck size={22} />, tone: "from-slate-800 to-zinc-600" },
    { key: "all-rounder", title: "All-Rounder Employee", description: "Create an employee who can work across offices.", icon: <UserCog size={22} />, tone: "from-purple-600 to-fuchsia-500" },
];

function formatDate(value: string | null | undefined) {
    if (!value) return "No activity";
    return new Intl.DateTimeFormat("en-UG", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Africa/Kampala",
    }).format(new Date(value));
}

function generateCode(name: string) {
    const words = name.trim().split(/\s+/).filter(Boolean);
    const base = words.length > 1 ? words.map((word) => word[0]).join("") : name.slice(0, 4);
    return base.toUpperCase().replace(/[^A-Z0-9]/g, "") || "OFF";
}

function generatePin() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

function roleByKey(raw: Props["raw"], keys: string[]) {
    return raw.roles.find((role) => keys.includes(String(role.key ?? ""))) ?? raw.roles[0] ?? null;
}

export default function OfficeAccountManagementCentre({ company, initialFocus, raw, serviceRoleConfigured }: Props) {
    const [activeTab, setActiveTab] = useState<TabKey>("create");
    const [createMode, setCreateMode] = useState<CreateMode>(initialFocus === "collector" ? "collector" : initialFocus === "office" ? "office-account" : null);
    const [officeStep, setOfficeStep] = useState(1);
    const [officeWizard, setOfficeWizard] = useState<OfficeWizardState>(emptyOfficeWizard);
    const [showPin, setShowPin] = useState(false);
    const [selectedUserId, setSelectedUserId] = useState(raw.users[0]?.id ?? "");
    const [selectedOfficeId, setSelectedOfficeId] = useState(raw.offices[0]?.id ?? "");
    const [message, setMessage] = useState<string | null>(null);
    const [tone, setTone] = useState<MessageTone>("info");
    const [officeSuccess, setOfficeSuccess] = useState<OfficeSuccess | null>(null);
    const [isPending, startTransition] = useTransition();

    const officeOptions = raw.offices;
    const roleOptions = raw.roles.filter((role) => !role.company_id || role.company_id === company?.id);
    const officeRole = roleByKey(raw, ["office_manager", "office_user"]);
    const adminRole = roleByKey(raw, ["company_admin", "super_admin", "hq_executive"]);
    const selectedUser = raw.users.find((user) => user.id === selectedUserId) ?? null;
    const selectedOffice = raw.offices.find((office) => office.id === selectedOfficeId) ?? null;
    const selectedAssignment = raw.userOfficeRoles.find((assignment) => assignment.user_id === selectedUserId) ?? null;
    const selectedPin = raw.pinCredentials.find((pin) => pin.user_id === selectedUserId) ?? null;
    const lockedAccounts = useMemo(
        () => raw.users
            .map((user) => ({
                user,
                office: officeOptions.find((office) => office.id === user.default_office_id) ?? null,
                pin: raw.pinCredentials.find((item) => item.user_id === user.id) ?? null,
            }))
            .filter((item) => item.pin?.status === "locked"),
        [officeOptions, raw.pinCredentials, raw.users],
    );
    const incompleteOffices = useMemo(
        () => officeOptions.filter((office) => {
            const officeUsers = raw.users.filter((user) => user.default_office_id === office.id);
            const hasRole = raw.userOfficeRoles.some((role) => role.office_id === office.id);
            const hasActiveCredential = officeUsers.some((user) => raw.pinCredentials.some((pin) => pin.user_id === user.id && pin.status !== "revoked"));
            return office.status !== "archived" && (!officeUsers.length || !hasRole || !hasActiveCredential);
        }),
        [officeOptions, raw.pinCredentials, raw.userOfficeRoles, raw.users],
    );

    useEffect(() => {
        if (initialFocus === "collector") {
            setActiveTab("create");
            setCreateMode("collector");
        }
        if (initialFocus === "office") {
            setActiveTab("create");
            setCreateMode("office-account");
        }
    }, [initialFocus]);

    function run(action: () => Promise<unknown>, success: string) {
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

    function setOfficeField<K extends keyof OfficeWizardState>(key: K, value: OfficeWizardState[K]) {
        setOfficeWizard((current) => {
            const next = { ...current, [key]: value };
            if (key === "officeName" && !current.officeCode) next.officeCode = generateCode(String(value));
            if (key === "officeName" && !current.loginName) next.loginName = `${String(value).trim()} Office Login`.trim();
            return next;
        });
    }

    function createGuidedOffice() {
        run(async () => {
            const result = await createOfficeWithLogin({
                officeName: officeWizard.officeName,
                officeCode: officeWizard.officeCode,
                managerName: officeWizard.managerName,
                city: officeWizard.location,
                region: officeWizard.location,
                status: officeWizard.status,
                loginName: officeWizard.loginName,
                pin: officeWizard.pin,
                confirmPin: officeWizard.confirmPin,
                loginEmail: officeWizard.loginEmail,
                requirePasswordChange: officeWizard.requirePasswordChange,
            });
            setOfficeSuccess(result);
            setOfficeStep(5);
        }, "Office created successfully.");
    }

    function createExistingOfficeAccount(formData: FormData, accountType: "office" | "admin" = "office") {
        const roleId = accountType === "admin" ? adminRole?.id : String(formData.get("roleId") || officeRole?.id || "");
        const officeId = String(formData.get("officeId") || raw.offices[0]?.id || "");
        run(
            () => createOfficeAccount({
                fullName: String(formData.get("fullName") ?? ""),
                email: String(formData.get("email") ?? ""),
                pin: String(formData.get("pin") ?? ""),
                confirmPin: String(formData.get("confirmPin") ?? ""),
                officeId,
                roleId,
                accountType,
                status: String(formData.get("status") ?? "active"),
            }),
            accountType === "admin" ? "Admin account created." : "Office account created.",
        );
    }

    function createCollector(formData: FormData) {
        run(() => createFieldCollectorAccount(formData), "Field Collector account created.");
    }

    function createEmployee(formData: FormData, allRounder = false) {
        run(
            () => saveEmployee({
                fullName: String(formData.get("fullName") ?? ""),
                phone: String(formData.get("phone") ?? ""),
                officeId: allRounder ? "all_rounder" : String(formData.get("officeId") ?? ""),
                jobTitle: String(formData.get("jobTitle") ?? ""),
                pin: String(formData.get("pin") ?? ""),
                status: String(formData.get("status") ?? "active"),
            }),
            allRounder ? "All-Rounder employee created." : "Employee created.",
        );
    }

    function updateAccount(formData: FormData) {
        if (!selectedUser) return;
        run(
            () => updateOfficeAccount({
                userId: selectedUser.id,
                fullName: String(formData.get("editFullName") ?? selectedUser.full_name),
                officeId: String(formData.get("editOfficeId") ?? selectedUser.default_office_id ?? raw.offices[0]?.id ?? ""),
                roleId: String(formData.get("editRoleId") ?? selectedAssignment?.role_id ?? roleOptions[0]?.id ?? ""),
                status: String(formData.get("status") ?? selectedUser.status),
            }),
            "Account updated.",
        );
    }

    function resetPin(formData: FormData, userId = selectedUser?.id ?? "") {
        const targetUserId = String(formData.get("lockedUserId") ?? userId);
        run(
            () => resetOfficeAccountPin({ userId: targetUserId, pin: String(formData.get("newPin") ?? formData.get("lockedNewPin") ?? "") }),
            "PIN reset securely.",
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

    const nakiwogo = incompleteOffices.find((office) => String(office.office_name ?? office.name ?? "").toLowerCase().includes("nakiwogo"));

    return (
        <section className="enterprise-panel overflow-hidden">
            <div className="border-b border-slate-200 bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 p-5 text-white sm:p-6">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                    <div>
                        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-cyan-100">
                            <ShieldCheck size={14} />
                            Admin only
                        </div>
                        <h2 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Administration Centre</h2>
                        <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-300">
                            Create offices, accounts, collectors, and employees through a guided workflow. Creation forms are separated from management controls.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            setActiveTab("create");
                            setCreateMode(null);
                            setOfficeSuccess(null);
                            setOfficeStep(1);
                        }}
                        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white px-5 text-sm font-black text-slate-950 shadow-xl transition hover:bg-cyan-100"
                    >
                        <Wand2 size={18} />
                        Create New
                    </button>
                </div>
            </div>

            {!serviceRoleConfigured && (
                <div className="border-b border-amber-200 bg-amber-50 px-6 py-4 text-amber-900">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="mt-0.5 shrink-0" size={20} />
                        <div>
                            <p className="font-black">Service-role key required for account creation and PIN resets</p>
                            <p className="mt-1 text-sm font-bold">Viewing remains available, but Supabase Auth password/PIN operations require `SUPABASE_SERVICE_ROLE_KEY`.</p>
                        </div>
                    </div>
                </div>
            )}

            {message && (
                <div className={`border-b px-6 py-4 text-sm font-black ${tone === "success" ? "border-green-200 bg-green-50 text-green-700" : tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-blue-200 bg-blue-50 text-blue-700"}`}>
                    {isPending && <Loader2 size={15} className="mr-2 inline animate-spin" />}
                    {message}
                </div>
            )}

            <div className="border-b border-slate-200 bg-slate-50 p-3">
                <div className="flex gap-2 overflow-x-auto">
                    {[
                        ["create", "Create New"],
                        ["offices", "Offices"],
                        ["accounts", "Accounts"],
                        ["employees", "Employees"],
                        ["roles", "Roles and Permissions"],
                        ["incomplete", `Incomplete Setups (${incompleteOffices.length})`],
                        ["activity", "Recent Activity"],
                    ].map(([key, label]) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setActiveTab(key as TabKey)}
                            className={`mobile-nowrap rounded-2xl px-4 py-2 text-sm font-black transition ${activeTab === key ? "bg-slate-950 text-white" : "bg-white text-slate-600 hover:bg-slate-100"}`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="p-4 sm:p-6">
                {activeTab === "create" && (
                    <div className="space-y-5">
                        {!createMode ? (
                            <CreateChooser onSelect={setCreateMode} />
                        ) : (
                            <div className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                                <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <p className="text-xs font-black uppercase tracking-wide text-blue-600">What do you want to create?</p>
                                        <h3 className="mt-1 text-xl font-black text-slate-950">{createOptions.find((option) => option.key === createMode)?.title}</h3>
                                    </div>
                                    <button type="button" onClick={() => setCreateMode(null)} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-700">Change Type</button>
                                </div>
                                <div className="mt-5">
                                    {createMode === "office" && (
                                        <OfficeWizard
                                            isPending={isPending}
                                            officeSuccess={officeSuccess}
                                            onCreate={createGuidedOffice}
                                            onGeneratePin={() => {
                                                const pin = generatePin();
                                                setOfficeWizard((current) => ({ ...current, pin, confirmPin: pin }));
                                            }}
                                            onReset={() => {
                                                setOfficeWizard(emptyOfficeWizard);
                                                setOfficeStep(1);
                                                setOfficeSuccess(null);
                                            }}
                                            setShowPin={setShowPin}
                                            setStep={setOfficeStep}
                                            setValue={setOfficeField}
                                            showPin={showPin}
                                            state={officeWizard}
                                            step={officeStep}
                                        />
                                    )}
                                    {createMode === "office-account" && (
                                        <OfficeAccountForm
                                            disabled={isPending || !serviceRoleConfigured}
                                            officeOptions={officeOptions}
                                            roleOptions={roleOptions}
                                            onSubmit={(formData) => createExistingOfficeAccount(formData)}
                                        />
                                    )}
                                    {createMode === "collector" && <CollectorForm disabled={isPending || !serviceRoleConfigured} onSubmit={createCollector} />}
                                    {createMode === "employee" && <EmployeeForm disabled={isPending} offices={officeOptions} onSubmit={(formData) => createEmployee(formData)} />}
                                    {createMode === "all-rounder" && <AllRounderForm disabled={isPending} onSubmit={(formData) => createEmployee(formData, true)} />}
                                    {createMode === "admin" && (
                                        <AdminAccountForm
                                            disabled={isPending || !serviceRoleConfigured}
                                            offices={officeOptions}
                                            onSubmit={(formData) => createExistingOfficeAccount(formData, "admin")}
                                        />
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === "incomplete" && (
                    <IncompleteSetups
                        disabled={isPending || !serviceRoleConfigured}
                        incompleteOffices={incompleteOffices}
                        nakiwogo={nakiwogo}
                        onComplete={(formData) => createExistingOfficeAccount(formData)}
                        roleId={officeRole?.id ?? ""}
                    />
                )}

                {activeTab === "offices" && (
                    <OfficeManagement
                        disabled={isPending}
                        offices={officeOptions}
                        onDeactivate={(officeId) => run(() => deactivateOffice(officeId), "Office deactivated safely.")}
                        onEdit={editOffice}
                        selectedOffice={selectedOffice}
                        selectedOfficeId={selectedOfficeId}
                        setSelectedOfficeId={setSelectedOfficeId}
                    />
                )}

                {activeTab === "accounts" && (
                    <AccountManagement
                        disabled={isPending || !serviceRoleConfigured}
                        lockedAccounts={lockedAccounts}
                        officeOptions={officeOptions}
                        pinCredentials={raw.pinCredentials}
                        roleOptions={roleOptions}
                        selectedAssignment={selectedAssignment}
                        selectedPin={selectedPin}
                        selectedUser={selectedUser}
                        selectedUserId={selectedUserId}
                        setSelectedUserId={setSelectedUserId}
                        updateAccount={updateAccount}
                        resetPin={resetPin}
                        run={run}
                        users={raw.users}
                    />
                )}

                {activeTab === "employees" && (
                    <InfoGrid
                        items={[
                            { title: "Create Employee", detail: "Use Create New -> Employee for a focused fixed-office employee form." },
                            { title: "Create All-Rounder", detail: "Use Create New -> All-Rounder Employee for all-office staff." },
                            { title: "Employee Management", detail: "Open the full HR page for payroll, attendance, advances, lunch, and contracts.", href: "/office/admin/employees" },
                        ]}
                    />
                )}

                {activeTab === "roles" && (
                    <InfoGrid
                        items={[
                            { title: "Roles", detail: `${roleOptions.length} roles available for this company.` },
                            { title: "Office Manager", detail: officeRole ? "Default role is available for new office logins." : "Office Manager role missing. Apply default role migration." },
                            { title: "Admin Role", detail: adminRole ? "Company admin role is available." : "Admin role missing. Review role seeds." },
                        ]}
                    />
                )}

                {activeTab === "activity" && (
                    <RecentActivity events={raw.securityEvents} />
                )}
            </div>
        </section>
    );
}

function CreateChooser({ onSelect }: { onSelect: (mode: Exclude<CreateMode, null>) => void }) {
    return (
        <div>
            <div className="rounded-[1.75rem] border border-blue-100 bg-blue-50 p-5">
                <h3 className="text-xl font-black text-slate-950">Create New</h3>
                <p className="mt-1 text-sm font-bold text-slate-600">Choose one item. The system will show only the required fields for that setup.</p>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {createOptions.map((option) => (
                    <button key={option.key} type="button" onClick={() => onSelect(option.key)} className="group rounded-[1.5rem] border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl">
                        <span className={`grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br ${option.tone} text-white shadow-lg`}>{option.icon}</span>
                        <h4 className="mt-4 text-lg font-black text-slate-950">{option.title}</h4>
                        <p className="mt-1 min-h-10 text-sm font-semibold text-slate-500">{option.description}</p>
                        <span className="mt-4 inline-flex rounded-2xl bg-slate-950 px-4 py-2 text-sm font-black text-white group-hover:bg-blue-700">Start</span>
                    </button>
                ))}
            </div>
        </div>
    );
}

function OfficeWizard({
    isPending,
    officeSuccess,
    onCreate,
    onGeneratePin,
    onReset,
    setShowPin,
    setStep,
    setValue,
    showPin,
    state,
    step,
}: {
    isPending: boolean;
    officeSuccess: OfficeSuccess | null;
    onCreate: () => void;
    onGeneratePin: () => void;
    onReset: () => void;
    setShowPin: (value: boolean) => void;
    setStep: (step: number) => void;
    setValue: <K extends keyof OfficeWizardState>(key: K, value: OfficeWizardState[K]) => void;
    showPin: boolean;
    state: OfficeWizardState;
    step: number;
}) {
    const validStep1 = Boolean(state.officeName.trim() && state.officeCode.trim());
    const validStep2 = /^\d{6}$/.test(state.pin) && state.pin === state.confirmPin && state.loginName.trim();
    if (officeSuccess) return <OfficeSuccessPanel success={officeSuccess} onCreateAnother={onReset} />;

    return (
        <div className="space-y-5">
            <div className="grid gap-2 sm:grid-cols-4">
                {["Office details", "Office login", "Manager settings", "Review"].map((label, index) => (
                    <button
                        key={label}
                        type="button"
                        onClick={() => setStep(index + 1)}
                        className={`rounded-2xl px-3 py-3 text-left text-xs font-black uppercase tracking-wide ${step === index + 1 ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-500"}`}
                    >
                        Step {index + 1}<span className="block text-sm normal-case tracking-normal">{label}</span>
                    </button>
                ))}
            </div>

            {step === 1 && (
                <div className="grid gap-3 md:grid-cols-2">
                    <Input label="Office name" value={state.officeName} onChange={(value) => setValue("officeName", value)} placeholder="Nakiwogo" />
                    <Input label="Office code" value={state.officeCode} onChange={(value) => setValue("officeCode", value.toUpperCase())} placeholder="NAKIWOGO" />
                    <Input label="Location" value={state.location} onChange={(value) => setValue("location", value)} placeholder="Town / branch location" />
                    <Input label="Phone number" value={state.phone} onChange={(value) => setValue("phone", value)} placeholder="Office phone" />
                    <Select label="Status" value={state.status} onChange={(value) => setValue("status", value)} options={[["active", "Active"], ["inactive", "Inactive"]]} />
                </div>
            )}

            {step === 2 && (
                <div className="grid gap-3 md:grid-cols-2">
                    <Input label="Office login name" value={state.loginName} onChange={(value) => setValue("loginName", value)} placeholder="Nakiwogo Office Login" />
                    <Input label="Optional login email" value={state.loginEmail} onChange={(value) => setValue("loginEmail", value)} placeholder="office@example.com" type="email" />
                    <SecretInput label="Six-digit PIN or password" value={state.pin} onChange={(value) => setValue("pin", value.replace(/\D/g, "").slice(0, 6))} show={showPin} />
                    <SecretInput label="Confirm PIN or password" value={state.confirmPin} onChange={(value) => setValue("confirmPin", value.replace(/\D/g, "").slice(0, 6))} show={showPin} />
                    <div className="flex flex-wrap gap-2 md:col-span-2">
                        <button type="button" onClick={onGeneratePin} className="inline-flex items-center gap-2 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-black text-blue-700"><RefreshCcw size={16} /> Generate PIN</button>
                        <button type="button" onClick={() => setShowPin(!showPin)} className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-700">{showPin ? <EyeOff size={16} /> : <Eye size={16} />} {showPin ? "Hide" : "Show"} PIN</button>
                        <label className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-700">
                            <input type="checkbox" checked={state.requirePasswordChange} onChange={(event) => setValue("requirePasswordChange", event.target.checked)} />
                            Require password change on first login
                        </label>
                    </div>
                </div>
            )}

            {step === 3 && (
                <div className="grid gap-3 md:grid-cols-2">
                    <Input label="Assign office manager" value={state.managerName} onChange={(value) => setValue("managerName", value)} placeholder="Optional manager name" />
                    <Input label="GPS / geofence location" value={state.geofence} onChange={(value) => setValue("geofence", value)} placeholder="Optional coordinates or note" />
                    <Input label="Opening time" value={state.openingTime} onChange={(value) => setValue("openingTime", value)} type="time" />
                    <Input label="Closing time" value={state.closingTime} onChange={(value) => setValue("closingTime", value)} type="time" />
                </div>
            )}

            {step === 4 && (
                <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
                    <h4 className="text-lg font-black text-slate-950">Review and create</h4>
                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        <Review label="Office name" value={state.officeName || "Missing"} />
                        <Review label="Office code" value={state.officeCode || "Missing"} />
                        <Review label="Location" value={state.location || "Not set"} />
                        <Review label="Login name" value={state.loginName || "Missing"} />
                        <Review label="Credential type" value="Six-digit PIN" />
                        <Review label="Assigned manager" value={state.managerName || "Optional"} />
                        <Review label="Status" value={state.status} />
                    </div>
                </div>
            )}

            <div className="flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-between">
                <button type="button" disabled={step === 1} onClick={() => setStep(Math.max(1, step - 1))} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 disabled:opacity-50">Back</button>
                {step < 4 ? (
                    <button type="button" disabled={(step === 1 && !validStep1) || (step === 2 && !validStep2)} onClick={() => setStep(Math.min(4, step + 1))} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-50">Continue</button>
                ) : (
                    <button type="button" disabled={isPending || !validStep1 || !validStep2} onClick={onCreate} className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-emerald-100 disabled:opacity-50">
                        {isPending ? "Creating office..." : "Create Office"}
                    </button>
                )}
            </div>
        </div>
    );
}

function OfficeSuccessPanel({ success, onCreateAnother }: { success: OfficeSuccess; onCreateAnother: () => void }) {
    const copyText = `Office: ${success.officeName}\nOffice code: ${success.officeCode}\nLogin name: ${success.loginName}\nLogin email: ${success.loginEmail}\nStatus: ${success.status}`;
    return (
        <div className="rounded-[1.75rem] border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
            <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-600 text-white"><CheckCircle2 size={24} /></span>
                <div>
                    <h3 className="text-2xl font-black">Office created successfully</h3>
                    <p className="text-sm font-bold text-emerald-800">Do not display the PIN again after leaving this screen.</p>
                </div>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <Review label="Office name" value={success.officeName} />
                <Review label="Office code" value={success.officeCode} />
                <Review label="Login name" value={success.loginName} />
                <Review label="Status" value={success.status} />
                <Review label="Created by" value={success.createdBy} />
                <Review label="Created date" value={formatDate(success.createdAt)} />
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
                <button type="button" onClick={() => navigator.clipboard?.writeText(copyText)} className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-emerald-800"><Copy size={16} /> Copy Login Details</button>
                <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-emerald-800"><Printer size={16} /> Print Office Login Sheet</button>
                <Link href="/office/admin" className="inline-flex items-center rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white">Open Office</Link>
                <button type="button" onClick={onCreateAnother} className="rounded-2xl bg-emerald-700 px-4 py-3 text-sm font-black text-white">Create Another</button>
                <Link href="/office/admin" className="inline-flex items-center rounded-2xl border border-emerald-200 bg-emerald-100 px-4 py-3 text-sm font-black text-emerald-900">Return to Administration</Link>
            </div>
        </div>
    );
}

function OfficeAccountForm({ disabled, officeOptions, roleOptions, onSubmit }: { disabled: boolean; officeOptions: Props["raw"]["offices"]; roleOptions: Props["raw"]["roles"]; onSubmit: (formData: FormData) => void }) {
    return (
        <form action={onSubmit} className="grid gap-3 md:grid-cols-2">
            <NativeSelect name="officeId" label="Select office" options={officeOptions.map((office) => [office.id, office.office_name ?? office.name ?? "Office"])} />
            <NativeSelect name="roleId" label="Role" options={roleOptions.map((role) => [role.id, role.name])} />
            <NativeInput name="fullName" label="Account name" />
            <NativeInput name="email" label="Optional email / login email" type="email" />
            <NativeInput name="pin" label="Six-digit PIN or password" type="password" maxLength={6} />
            <NativeInput name="confirmPin" label="Confirm credential" type="password" maxLength={6} />
            <NativeSelect name="status" label="Status" options={[["active", "Active"], ["inactive", "Inactive"]]} />
            <Submit disabled={disabled} label="Create Office Account" />
        </form>
    );
}

function AdminAccountForm({ disabled, offices, onSubmit }: { disabled: boolean; offices: Props["raw"]["offices"]; onSubmit: (formData: FormData) => void }) {
    return (
        <form action={onSubmit} className="grid gap-3 md:grid-cols-2">
            <NativeSelect name="officeId" label="Default office context" options={offices.map((office) => [office.id, office.office_name ?? office.name ?? "Office"])} />
            <NativeInput name="fullName" label="Admin account name" />
            <NativeInput name="email" label="Admin email" type="email" />
            <NativeInput name="pin" label="Six-digit PIN or password" type="password" maxLength={6} />
            <NativeInput name="confirmPin" label="Confirm credential" type="password" maxLength={6} />
            <Submit disabled={disabled} label="Create Admin Account" />
        </form>
    );
}

function CollectorForm({ disabled, onSubmit }: { disabled: boolean; onSubmit: (formData: FormData) => void }) {
    return (
        <form action={onSubmit} className="grid gap-3 md:grid-cols-2">
            <NativeInput name="collectorName" label="Full name" />
            <NativeInput name="collectorPhone" label="Phone number" />
            <NativeInput name="collectorEmail" label="Email" type="email" />
            <NativeInput name="collectorPin" label="Six-digit PIN" type="password" maxLength={6} />
            <NativeSelect name="assignment" label="Assigned office" options={[["all", "All Offices"]]} />
            <NativeSelect name="status" label="Employment status" options={[["active", "Active"], ["suspended", "Suspended"]]} />
            <NativeSelect name="permissionProfile" label="Permission profile" options={[["collector_standard", "Collector Standard"]]} />
            <Submit disabled={disabled} label="Create Field Collector" />
        </form>
    );
}

function EmployeeForm({ disabled, offices, onSubmit }: { disabled: boolean; offices: Props["raw"]["offices"]; onSubmit: (formData: FormData) => void }) {
    return (
        <form action={onSubmit} className="grid gap-3 md:grid-cols-2">
            <NativeInput name="fullName" label="Full name" />
            <NativeInput name="phone" label="Phone" />
            <NativeSelect name="officeId" label="Office" options={offices.map((office) => [office.id, office.office_name ?? office.name ?? "Office"])} />
            <NativeInput name="jobTitle" label="Job title / role" />
            <NativeInput name="pin" label="PIN" type="password" maxLength={6} />
            <NativeSelect name="status" label="Status" options={[["active", "Active"], ["inactive", "Inactive"]]} />
            <Submit disabled={disabled} label="Create Employee" />
        </form>
    );
}

function AllRounderForm({ disabled, onSubmit }: { disabled: boolean; onSubmit: (formData: FormData) => void }) {
    return (
        <form action={onSubmit} className="grid gap-3 md:grid-cols-2">
            <NativeInput name="fullName" label="Full name" />
            <NativeInput name="phone" label="Phone" />
            <NativeInput name="jobTitle" label="Role" />
            <NativeInput name="pin" label="PIN" type="password" maxLength={6} />
            <NativeSelect name="status" label="Status" options={[["active", "Active"], ["inactive", "Inactive"]]} />
            <Review label="Allowed offices" value="All Offices" />
            <Submit disabled={disabled} label="Create All-Rounder Employee" />
        </form>
    );
}

function IncompleteSetups({ disabled, incompleteOffices, nakiwogo, onComplete, roleId }: { disabled: boolean; incompleteOffices: Props["raw"]["offices"]; nakiwogo: Props["raw"]["offices"][number] | undefined; onComplete: (formData: FormData) => void; roleId: string }) {
    if (!incompleteOffices.length) return <EmptyState title="No incomplete office setups" description="Every office has at least one account, role assignment, and credential." />;
    return (
        <div className="space-y-4">
            {nakiwogo && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-black text-amber-900">Nakiwogo was found in Incomplete Setup. Complete setup here instead of creating a duplicate office.</div>}
            <div className="grid gap-4 xl:grid-cols-2">
                {incompleteOffices.map((office) => (
                    <form key={office.id} action={onComplete} className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
                        <input type="hidden" name="officeId" value={office.id} />
                        <input type="hidden" name="roleId" value={roleId} />
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-lg font-black text-slate-950">{office.office_name ?? office.name}</p>
                                <p className="text-sm font-bold text-slate-500">{office.office_code ?? office.code ?? "No code"} · {office.city ?? office.region ?? "No location"}</p>
                            </div>
                            <StatusChip label="Incomplete" tone="orange" />
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                            <NativeInput name="fullName" label="Office login name" defaultValue={`${office.office_name ?? office.name} Office Login`} />
                            <NativeInput name="email" label="Optional login email" type="email" />
                            <NativeInput name="pin" label="Six-digit PIN" type="password" maxLength={6} />
                            <NativeInput name="confirmPin" label="Confirm PIN" type="password" maxLength={6} />
                        </div>
                        <Submit disabled={disabled} label="Complete Setup" />
                    </form>
                ))}
            </div>
        </div>
    );
}

function OfficeManagement({ disabled, offices, onDeactivate, onEdit, selectedOffice, selectedOfficeId, setSelectedOfficeId }: { disabled: boolean; offices: Props["raw"]["offices"]; onDeactivate: (officeId: string) => void; onEdit: (formData: FormData) => void; selectedOffice: Props["raw"]["offices"][number] | null; selectedOfficeId: string; setSelectedOfficeId: (id: string) => void }) {
    return (
        <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-3">
                {offices.map((office) => (
                    <button key={office.id} type="button" onClick={() => setSelectedOfficeId(office.id)} className={`w-full rounded-2xl border p-4 text-left ${selectedOfficeId === office.id ? "border-cyan-200 bg-cyan-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="font-black text-slate-950">{office.office_name ?? office.name}</p>
                                <p className="text-xs font-bold text-slate-500">{office.office_code ?? office.code ?? "No code"} · {office.city ?? office.region ?? "No location"}</p>
                            </div>
                            <StatusChip label={office.status ?? "unknown"} tone={office.status === "active" ? "green" : "orange"} />
                        </div>
                    </button>
                ))}
            </div>
            {selectedOffice ? (
                <form action={onEdit} className="rounded-[1.5rem] border border-slate-200 bg-white p-5">
                    <div className="grid gap-3 md:grid-cols-2">
                        <NativeInput name="editOfficeName" label="Office name" defaultValue={selectedOffice.office_name ?? selectedOffice.name ?? ""} />
                        <NativeInput name="editOfficeCode" label="Office code" defaultValue={selectedOffice.office_code ?? selectedOffice.code ?? ""} />
                        <NativeInput name="editManagerName" label="Manager name" defaultValue={selectedOffice.manager_name ?? ""} />
                        <NativeInput name="editCity" label="City / location" defaultValue={selectedOffice.city ?? ""} />
                        <NativeInput name="editRegion" label="Region" defaultValue={selectedOffice.region ?? ""} />
                        <NativeSelect name="editOfficeStatus" label="Status" defaultValue={selectedOffice.status ?? "active"} options={[["active", "Active"], ["inactive", "Inactive"], ["suspended", "Suspended"]]} />
                        <NativeInput name="editCollectionTarget" label="Collection target" defaultValue={String(selectedOffice.collection_target ?? "")} />
                        <NativeInput name="editExpenseBudget" label="Expense budget" defaultValue={String(selectedOffice.expense_budget ?? "")} />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                        <Submit disabled={disabled} label="Save Office" />
                        <button type="button" onClick={() => onDeactivate(selectedOffice.id)} disabled={disabled} className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-black text-red-700 disabled:opacity-60">Activate / Deactivate</button>
                    </div>
                </form>
            ) : <EmptyState title="Select an office" description="Choose an office to manage login, manager and status controls." />}
        </div>
    );
}

function AccountManagement({ disabled, lockedAccounts, officeOptions, pinCredentials, roleOptions, selectedAssignment, selectedPin, selectedUser, selectedUserId, setSelectedUserId, updateAccount, resetPin, run, users }: {
    disabled: boolean;
    lockedAccounts: Array<{ user: Props["raw"]["users"][number]; office: Props["raw"]["offices"][number] | null; pin: Props["raw"]["pinCredentials"][number] | null }>;
    officeOptions: Props["raw"]["offices"];
    pinCredentials: Props["raw"]["pinCredentials"];
    roleOptions: Props["raw"]["roles"];
    selectedAssignment: Props["raw"]["userOfficeRoles"][number] | null;
    selectedPin: Props["raw"]["pinCredentials"][number] | null;
    selectedUser: Props["raw"]["users"][number] | null;
    selectedUserId: string;
    setSelectedUserId: (id: string) => void;
    updateAccount: (formData: FormData) => void;
    resetPin: (formData: FormData) => void;
    run: (action: () => Promise<unknown>, success: string) => void;
    users: Props["raw"]["users"];
}) {
    return (
        <div className="space-y-5">
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                    <h3 className="font-black text-slate-950">Locked Account Recovery</h3>
                    <StatusChip label={`${lockedAccounts.length} locked`} tone={lockedAccounts.length ? "orange" : "green"} />
                </div>
                {lockedAccounts.length ? (
                    <div className="mt-3 grid gap-3 xl:grid-cols-2">
                        {lockedAccounts.map(({ user, office, pin }) => (
                            <form key={user.id} action={(formData) => resetPin(formData)} className="rounded-2xl border border-amber-200 bg-white p-4">
                                <input type="hidden" name="lockedUserId" value={user.id} />
                                <p className="font-black">{user.full_name}</p>
                                <p className="text-sm font-bold text-slate-500">{office?.office_name ?? "Company"} · Failed attempts: {pin?.failed_attempts ?? 0}</p>
                                <NativeInput name="newPin" label="New PIN" type="password" maxLength={6} />
                                <Submit disabled={disabled} label="Reset / Unlock" />
                            </form>
                        ))}
                    </div>
                ) : <p className="mt-3 text-sm font-bold text-emerald-700">No locked office accounts.</p>}
            </div>

            <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
                <div className="space-y-3">
                    {users.map((user) => {
                        const office = officeOptions.find((item) => item.id === user.default_office_id);
                        const pin = pinCredentials.find((item) => item.user_id === user.id);
                        return (
                            <button key={user.id} type="button" onClick={() => setSelectedUserId(user.id)} className={`w-full rounded-2xl border p-4 text-left ${selectedUserId === user.id ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="font-black text-slate-950">{user.full_name}</p>
                                        <p className="text-sm text-slate-500">{office?.office_name ?? "Company account"} · {user.email ?? "No email"}</p>
                                    </div>
                                    <StatusChip label={user.status} tone={user.status === "active" ? "green" : "orange"} />
                                </div>
                                <p className="mt-2 text-xs font-bold text-slate-500">PIN: {pin?.status ?? "missing"} · Last: {formatDate(pin?.last_used_at)}</p>
                            </button>
                        );
                    })}
                </div>
                {selectedUser ? (
                    <div className="space-y-4">
                        <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-xl font-black">{selectedUser.full_name}</p>
                                    <p className="text-sm text-slate-500">{selectedUser.email}</p>
                                </div>
                                <StatusChip label={selectedPin?.status ?? "no pin"} tone={selectedPin?.status === "active" ? "green" : "orange"} />
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-3">
                                <Review label="Current PIN" value={selectedPin?.admin_visible_pin ?? "Not recorded"} />
                                <Review label="Locked at" value={formatDate(selectedPin?.locked_at)} />
                                <Review label="Last login/PIN use" value={formatDate(selectedPin?.last_used_at)} />
                                <Review label="Failed attempts" value={String(selectedPin?.failed_attempts ?? 0)} />
                            </div>
                        </div>
                        <form action={updateAccount} className="rounded-[1.5rem] border border-slate-200 bg-white p-5">
                            <div className="grid gap-3 md:grid-cols-2">
                                <NativeInput name="editFullName" label="Full name" defaultValue={selectedUser.full_name} />
                                <NativeSelect name="status" label="Status" defaultValue={selectedUser.status} options={[["active", "Active"], ["inactive", "Inactive"], ["suspended", "Suspended"]]} />
                                <NativeSelect name="editOfficeId" label="Office" defaultValue={selectedUser.default_office_id ?? ""} options={officeOptions.map((office) => [office.id, office.office_name ?? office.name ?? "Office"])} />
                                <NativeSelect name="editRoleId" label="Role" defaultValue={selectedAssignment?.role_id ?? roleOptions[0]?.id ?? ""} options={roleOptions.map((role) => [role.id, role.name])} />
                            </div>
                            <Submit disabled={disabled} label="Update Account" />
                        </form>
                        <form action={resetPin} className="rounded-[1.5rem] border border-slate-200 bg-white p-5">
                            <NativeInput name="newPin" label="Reset PIN / Password" type="password" maxLength={6} />
                            <Submit disabled={disabled} label="Reset PIN / Password" />
                        </form>
                        <div className="grid gap-2 sm:grid-cols-2">
                            <button type="button" onClick={() => run(() => reactivateOfficeAccount(selectedUser.id), "Account reactivated.")} disabled={disabled} className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-800 disabled:opacity-60">Activate</button>
                            <button type="button" onClick={() => run(() => deactivateOfficeAccount(selectedUser.id), "Account deactivated and PIN revoked.")} disabled={disabled} className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-black text-red-700 disabled:opacity-60">Deactivate</button>
                        </div>
                    </div>
                ) : <EmptyState title="Select an account" description="Choose an account to manage login status and credential reset." />}
            </div>
        </div>
    );
}

function RecentActivity({ events }: { events: Props["raw"]["securityEvents"] }) {
    return (
        <div className="space-y-3">
            {events.slice(0, 12).map((event) => (
                <div key={event.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="font-black text-slate-950">{event.event_type}</p>
                    <p className="text-sm font-bold text-slate-500">{formatDate(event.created_at)} · {event.severity}</p>
                </div>
            ))}
            {!events.length && <EmptyState title="No recent activity" description="Account and office audit records will appear here." />}
        </div>
    );
}

function InfoGrid({ items }: { items: Array<{ title: string; detail: string; href?: string }> }) {
    return (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
                <div key={item.title} className="rounded-[1.5rem] border border-slate-200 bg-white p-5">
                    <BadgeCheck className="text-blue-600" size={22} />
                    <h3 className="mt-3 font-black text-slate-950">{item.title}</h3>
                    <p className="mt-1 text-sm font-bold text-slate-500">{item.detail}</p>
                    {item.href && <Link href={item.href} className="mt-4 inline-flex rounded-2xl bg-slate-950 px-4 py-2 text-sm font-black text-white">Open</Link>}
                </div>
            ))}
        </div>
    );
}

function Input({ label, value, onChange, placeholder = "", type = "text" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
    return (
        <label className="block text-sm font-black text-slate-700">
            {label}
            <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} type={type} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:border-blue-500 focus:bg-white" />
        </label>
    );
}

function SecretInput({ label, value, onChange, show }: { label: string; value: string; onChange: (value: string) => void; show: boolean }) {
    return <Input label={label} value={value} onChange={onChange} type={show ? "text" : "password"} placeholder="Exactly six digits" />;
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) {
    return (
        <label className="block text-sm font-black text-slate-700">
            {label}
            <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:border-blue-500 focus:bg-white">
                {options.map(([optionValue, labelText]) => <option key={optionValue} value={optionValue}>{labelText}</option>)}
            </select>
        </label>
    );
}

function NativeInput({ name, label, type = "text", maxLength, defaultValue = "" }: { name: string; label: string; type?: string; maxLength?: number; defaultValue?: string }) {
    return (
        <label className="block text-sm font-black text-slate-700">
            {label}
            <input name={name} type={type} maxLength={maxLength} defaultValue={defaultValue} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:border-blue-500 focus:bg-white" />
        </label>
    );
}

function NativeSelect({ name, label, options, defaultValue }: { name: string; label: string; options: Array<[string, string]>; defaultValue?: string }) {
    return (
        <label className="block text-sm font-black text-slate-700">
            {label}
            <select name={name} defaultValue={defaultValue ?? options[0]?.[0] ?? ""} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:border-blue-500 focus:bg-white">
                {options.map(([value, labelText]) => <option key={value} value={value}>{labelText}</option>)}
            </select>
        </label>
    );
}

function Submit({ disabled, label }: { disabled: boolean; label: string }) {
    return (
        <button disabled={disabled} className="mt-2 inline-flex min-h-12 items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-black text-white shadow-lg transition hover:bg-blue-700 disabled:opacity-60">
            {disabled ? "Working..." : label}
        </button>
    );
}

function Review({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-3">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</p>
            <p className="mt-1 truncate text-sm font-black text-slate-950">{value}</p>
        </div>
    );
}
