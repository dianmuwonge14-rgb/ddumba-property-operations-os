import { BadgeCheck, Building2, CalendarDays, Cpu, Fingerprint, Gauge, KeyRound, Landmark, LockKeyhole, MapPin, MonitorSmartphone, Settings2, ShieldAlert, ShieldCheck, UsersRound } from "lucide-react";
import dynamic from "next/dynamic";
import { EmptyState, EnterpriseKpiCard, PageHero, StatusChip } from "@/components/office/shared/EnterpriseUI";
import type { AdminCentreData, AdminSeverity, AdminTone, AttendanceSecurityItem, DeviceManagementItem, EmployeeAdminItem, OfficeGovernanceItem, PermissionMatrixRole, PlatformConfigurationItem, RiskHeatMapItem, SecuritySignal } from "@/lib/admin-centre/types";
import type { EnrichedRoomRentChangeRequest } from "./AdminRoomRentCentre";
import type { ProductionReadinessStatus, ReadinessCheck } from "@/lib/production-readiness/types";

const OfficeAccountManagementCentre = dynamic(() => import("./OfficeAccountManagementCentre"), {
    loading: () => <PanelLoading label="Loading office account controls..." />,
});
const OneDriveMasterFileCentre = dynamic(() => import("./OneDriveMasterFileCentre"), {
    loading: () => <PanelLoading label="Loading OneDrive controls..." />,
});
const HistoricalMigrationCommandCentre = dynamic(() => import("./HistoricalMigrationCommandCentre"), {
    loading: () => <PanelLoading label="Loading migration tools..." />,
});
const LandlordAssignmentAuditCentre = dynamic(() => import("./LandlordAssignmentAuditCentre"), {
    loading: () => <PanelLoading label="Loading assignment audit..." />,
});
const LandlordCommissionImportCentre = dynamic(() => import("./LandlordCommissionImportCentre"), {
    loading: () => <PanelLoading label="Loading commission import..." />,
});
const AdminFinanceDrilldown = dynamic(() => import("./AdminFinanceDrilldown"), {
    loading: () => <PanelLoading label="Loading finance drilldown..." />,
});
const AdminRoomRentCentre = dynamic(() => import("./AdminRoomRentCentre"), {
    loading: () => <PanelLoading label="Loading room rent controls..." />,
});

type Props = {
    data: AdminCentreData;
    deferSecondary?: boolean;
};

function money(value: number) {
    return `UGX ${Math.round(value).toLocaleString()}`;
}

function formatDate(value: string | null) {
    if (!value) return "No activity";
    return new Intl.DateTimeFormat("en-UG", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Africa/Kampala",
    }).format(new Date(value));
}

function PanelLoading({ label }: { label: string }) {
    return (
        <div className="rounded-3xl border border-slate-200 bg-white p-5 text-sm font-bold text-slate-500 shadow-sm">
            {label}
        </div>
    );
}

export default function AdminCommandCentre({ data, deferSecondary = false }: Props) {
    const serviceRoleConfigured = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
    const pendingRentChangeRequests = data.raw.rentChangeRequests.filter((request) => request.status === "pending").length;
    const roomRentApprovalRequests = buildRoomRentApprovalRequests(data);
    const landlordAssignmentAuditPreview = {
        ...data.landlordAssignmentAudit,
        issues: data.landlordAssignmentAudit.issues.slice(0, 80),
    };

    return (
        <main className="enterprise-page">
            <div className="enterprise-shell">
                <PageHero
                    title="Enterprise Security & Administration Centre"
                    subtitle={`${data.company?.name ?? "Company"} · administration, governance, employee control, role security, device trust, geofencing, compliance, and platform configuration`}
                    badge="Admin Command"
                >
                    <div className="rounded-3xl bg-slate-950 p-5 text-white shadow-xl">
                        <div className="flex items-center gap-3">
                            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-500">
                                <ShieldCheck size={24} />
                            </span>
                            <div>
                                <p className="text-sm text-slate-300">Security Health</p>
                                <p className="text-3xl font-black">{data.kpis.securityScore}%</p>
                            </div>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-3">
                            <DarkMini label="Compliance" value={`${data.kpis.complianceScore}%`} />
                            <DarkMini label="Risk Items" value={data.riskHeatMap.length.toString()} />
                        </div>
                    </div>
                </PageHero>

                <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
                    <EnterpriseKpiCard title="Companies" value={data.kpis.companies.toString()} tone="blue" trend="flat" trendLabel="accessible" progress={100} />
                    <EnterpriseKpiCard title="Offices" value={data.kpis.offices.toString()} tone="cyan" trend="up" trendLabel="governed" progress={data.governance.officeGovernanceScore} />
                    <EnterpriseKpiCard title="Employees" value={data.kpis.employees.toString()} tone="slate" trend="flat" trendLabel="directory" progress={100} />
                    <EnterpriseKpiCard title="Active Users" value={data.kpis.activeUsers.toString()} tone="green" trend="up" trendLabel="enabled" progress={percent(data.kpis.activeUsers, data.raw.users.length)} />
                    <EnterpriseKpiCard title="Roles" value={data.kpis.roles.toString()} tone="purple" trend="flat" trendLabel="access model" progress={100} />
                    <EnterpriseKpiCard title="Permissions" value={data.kpis.permissions.toString()} tone="orange" trend="flat" trendLabel="matrix" progress={100} />
                    <EnterpriseKpiCard title="Security Score" value={`${data.kpis.securityScore}%`} tone={data.kpis.securityScore >= 80 ? "green" : data.kpis.securityScore >= 60 ? "orange" : "red"} trend={data.kpis.securityScore >= 80 ? "up" : "down"} trendLabel="risk adjusted" progress={data.kpis.securityScore} />
                    <EnterpriseKpiCard title="Compliance Score" value={`${data.kpis.complianceScore}%`} tone={data.kpis.complianceScore >= 80 ? "green" : data.kpis.complianceScore >= 60 ? "orange" : "red"} trend={data.kpis.complianceScore >= 80 ? "up" : "down"} trendLabel="governance" progress={data.kpis.complianceScore} />
                </section>

                {data.productionReadiness && (
                    <section className="mt-6">
                        <ProductionReadinessCard status={data.productionReadiness} />
                    </section>
                )}

                <nav className="mt-6 flex flex-wrap gap-2 rounded-3xl border border-slate-200 bg-white p-3 shadow-sm" aria-label="Administration dashboard tabs">
                    <AdminTab href="#rent-roll" label="Rent Roll" />
                    <AdminTab href="/office/admin/rent-change-requests" label={`Rent Change Requests (${pendingRentChangeRequests})`} />
                    <AdminTab href="#room-rent-approvals" label="Dashboard Approvals" />
                    <AdminTab href="#landlord-assignment-audit" label="Landlord Assignment Audit" />
                    <AdminTab href="/office/admin/landlord-portfolio-audit" label="Portfolio Audit" />
                    <AdminTab href="#commission-import" label="Commission Import" />
                    <AdminTab href="/office/admin/commission-import-review" label="Commission Review Queue" />
                    <AdminTab href="#office-management" label="Office Management" />
                    <AdminTab href="#account-management" label="Office Accounts" />
                    <AdminTab href="#role-permissions" label="Roles & Permissions" />
                    <AdminTab href="#security-controls" label="Security Controls" />
                    <AdminTab href="#platform-config" label="Platform Configuration" />
                </nav>

                <section className="mt-6 grid grid-cols-1 gap-6 2xl:grid-cols-12">
                    <div className="2xl:col-span-7">
                        <ExecutiveAdministrationDashboard data={data} deferSecondary={deferSecondary} />
                    </div>
                    <div className="2xl:col-span-5">
                        <SecurityCommandCentre signals={data.securitySignals} />
                    </div>
                </section>

                {deferSecondary ? (
                    <DeferredAdminSections />
                ) : (
                    <>

                <section id="rent-roll" className="mt-6">
                    <AdminRentRollPanel data={data} />
                </section>

                <section className="mt-6">
                    <CompanyMonthlyFinancePanel data={data} />
                </section>

                <section id="commission-import" className="mt-6">
                    <LandlordCommissionImportCentre />
                </section>

                <section className="mt-6">
                    <LandlordAssignmentAuditCentre audit={landlordAssignmentAuditPreview} />
                </section>

                <section className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
                    <OfficeGovernanceCentre offices={data.offices} />
                    <EmployeeAdministrationCentre employees={data.employees} />
                </section>

                <section id="account-management" className="mt-6">
                    <OfficeAccountManagementCentre
                        company={data.company}
                        raw={{
                            offices: data.raw.offices,
                            roles: data.raw.roles,
                            users: data.raw.users,
                            userOfficeRoles: data.raw.userOfficeRoles,
                            pinCredentials: data.raw.pinCredentials,
                            securityEvents: data.raw.securityEvents,
                        }}
                        serviceRoleConfigured={serviceRoleConfigured}
                    />
                </section>

                <section id="role-permissions" className="mt-6">
                    <RolePermissionCentre roles={data.roles} permissions={data.permissions.length} />
                </section>

                <section id="security-controls" className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
                    <DeviceManagementCentre devices={data.devices} />
                    <GeofenceAttendanceSecurity policies={data.attendanceSecurity} />
                </section>

                <section className="mt-6">
                    <OneDriveMasterFileCentre config={data.oneDriveMaster} offices={data.raw.offices} />
                </section>

                <section className="mt-6">
                    <HistoricalMigrationCommandCentre />
                </section>

                <section className="mt-6">
                    <AdminRoomRentCentre pendingRequests={roomRentApprovalRequests} />
                </section>

                <section id="platform-config" className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
                    <PlatformConfigurationCentre items={data.platformConfiguration} />
                    <ComplianceGovernanceCentre data={data} />
                </section>
                    </>
                )}
            </div>
        </main>
    );
}

function ProductionReadinessCard({ status }: { status: ProductionReadinessStatus }) {
    const primaryChecks = [
        "build",
        "typescript",
        "reconciliation",
        "integrity",
        "security",
        "backup",
        "uat",
        "deployment-package",
        "version",
    ];
    const checks = primaryChecks
        .map((id) => status.checks.find((item) => item.id === id))
        .filter((item): item is ReadinessCheck => Boolean(item));

    return (
        <div className="rounded-[1.75rem] border border-emerald-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-4">
                    <div className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20">
                        <BadgeCheck size={26} />
                    </div>
                    <div>
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Production Readiness</p>
                        <h2 className="mt-1 text-2xl font-black text-slate-950">{status.score}/100</h2>
                        <p className="text-sm font-bold text-slate-500">Current Version {status.version} · {status.environment}</p>
                    </div>
                </div>
                <a href="/office/admin/system-health" className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-slate-800">
                    System Health & Deployment
                </a>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {checks.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-black ${readinessDot(item.status)}`}>
                            {item.status === "pass" ? "✓" : item.status === "fail" ? "!" : "•"}
                        </span>
                        <span className="text-xs font-black text-slate-700">{item.label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function readinessDot(status: ReadinessCheck["status"]) {
    if (status === "pass") return "bg-emerald-600 text-white";
    if (status === "fail") return "bg-red-600 text-white";
    if (status === "warning") return "bg-amber-400 text-slate-950";
    return "bg-slate-300 text-slate-700";
}

function buildRoomRentApprovalRequests(data: AdminCentreData): EnrichedRoomRentChangeRequest[] {
    const roomById = new Map(data.raw.rooms.map((room) => [room.id, room]));
    const officeById = new Map(data.raw.offices.map((office) => [office.id, office.office_name ?? office.name ?? "Office"]));
    const landlordById = new Map(data.raw.landlords.map((landlord) => [landlord.id, landlord.full_name ?? "Landlord"]));
    const tenantById = new Map(data.raw.tenants.map((tenant) => [tenant.id, tenant.full_name ?? "Tenant"]));

    return data.raw.rentChangeRequests
        .filter((request) => request.status === "pending")
        .map((request) => ({
            ...request,
            roomNumber: roomById.get(request.room_id)?.room_number ?? "Unnumbered",
            officeName: request.office_id ? officeById.get(request.office_id) ?? "Office" : "Office",
            landlordName: request.landlord_id ? landlordById.get(request.landlord_id) ?? "No landlord" : "No landlord",
            tenantName: request.tenant_id ? tenantById.get(request.tenant_id) ?? "Vacant" : "Vacant",
        }));
}

function DeferredAdminSections() {
    const sections = [
        { title: "Audit Centre", href: "/office/audit", description: "Detailed audit history, approvals, and correction trails." },
        { title: "Governance", href: "#", description: "Office governance, employee controls, devices, and role security load outside the first screen." },
        { title: "Historical Reports", href: "/office/admin/statements", description: "Statements, historical reporting, and exports remain available from dedicated pages." },
        { title: "Analytics", href: "/office/ceo", description: "Executive reporting and analytical views load after the dashboard is interactive." },
        { title: "Room Rent Approvals", href: "/office/admin/rent-change-requests", description: "Rent approvals stay accessible without slowing the first admin dashboard render." },
        { title: "Landlord Portfolio Audit", href: "/office/admin/landlord-portfolio-audit", description: "Landlord assignment and portfolio audit is kept out of initial hydration." },
    ];

    return (
        <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <p className="text-xs font-black uppercase tracking-wide text-blue-600">Optimized Initial Load</p>
                    <h2 className="text-xl font-black text-slate-950">Secondary admin modules deferred</h2>
                    <p className="mt-1 text-sm font-semibold text-slate-500">
                        The executive dashboard loads first. Heavy audit, governance, reporting, and analytics modules are opened on demand.
                    </p>
                </div>
                <StatusChip label="first screen ready" tone="green" />
            </div>
            <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {sections.map((section) => (
                    <a
                        key={section.title}
                        href={section.href}
                        className="rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-blue-300 hover:bg-blue-50"
                    >
                        <p className="font-black text-slate-950">{section.title}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-500">{section.description}</p>
                    </a>
                ))}
            </div>
        </section>
    );
}

function AdminRentRollPanel({ data }: Props) {
    const total = data.rentRoll.companyTotal;
    return (
        <section className="enterprise-panel overflow-hidden">
            <div className="border-b border-slate-200 p-6">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <PanelTitle
                        icon={<Landmark size={20} />}
                        title="Admin Rent Roll"
                        description="Company-wide and office-level rent roll, occupancy, monthly collections, outstanding balances, and collection percentage."
                    />
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                        <Mini label="Company Rooms" value={total.rooms.toLocaleString()} />
                        <Mini label="Company Rent Roll" value={money(total.expectedMonthlyRent)} />
                        <Mini label="Collected" value={money(total.collectedThisMonth)} />
                        <Mini label="Outstanding" value={money(total.outstandingBalance)} />
                    </div>
                </div>
                <div className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 p-4">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div>
                            <p className="text-xs font-black uppercase tracking-wide text-amber-700">Landlord recovery reminders</p>
                            <h3 className="mt-1 text-lg font-black text-slate-950">Advance payment controls</h3>
                            <p className="mt-1 text-sm font-semibold text-slate-600">
                                Landlords with vacant rooms or unrecovered vacated-tenant debt should be reviewed before payment approval.
                            </p>
                        </div>
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                            <Mini label="Vacant-room landlords" value={data.landlordRecoveryReminders.landlordsWithVacantRooms.toLocaleString()} />
                            <Mini label="Debt-recovery landlords" value={data.landlordRecoveryReminders.landlordsWithUnrecoveredDebts.toLocaleString()} />
                            <Mini label="Recovery Pending" value={money(data.landlordRecoveryReminders.totalRecoveryPending)} />
                            <Mini label="Recovered" value={money(data.landlordRecoveryReminders.totalRecovered)} />
                        </div>
                    </div>
                    {data.landlordRecoveryReminders.items.length ? (
                        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
                            {data.landlordRecoveryReminders.items.slice(0, 6).map((item) => (
                                <div key={`${item.landlordId ?? item.landlordName}-${item.officeName}`} className="rounded-2xl border border-amber-200 bg-white p-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-black text-slate-950">{item.landlordName}</p>
                                            <p className="text-xs font-bold text-slate-500">{item.officeName}</p>
                                        </div>
                                        <StatusChip label="review" tone="orange" />
                                    </div>
                                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-bold">
                                        <span>Vacant: {item.vacantRooms}</span>
                                        <span className="text-red-700">Recovery: {money(item.pendingRecovery)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : null}
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="enterprise-table">
                    <thead>
                        <tr>
                            <th className="text-left">Office</th>
                            <th className="text-left">Rooms</th>
                            <th className="text-left">Occupied</th>
                            <th className="text-left">Vacant</th>
                            <th className="text-left">Monthly Rent Roll</th>
                            <th className="text-left">Collected This Month</th>
                            <th className="text-left">Outstanding</th>
                            <th className="text-left">Collection %</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.rentRoll.offices.length === 0 ? (
                            <tr><td colSpan={8} className="p-6"><EmptyState title="No rent roll data" description="Rooms and collections will appear here once offices have active room records." /></td></tr>
                        ) : data.rentRoll.offices.map((office) => (
                            <tr key={office.officeId}>
                                <td><p className="font-black">{office.officeName}</p></td>
                                <td>{office.rooms.toLocaleString()}</td>
                                <td>{office.occupiedRooms.toLocaleString()}</td>
                                <td>{office.vacantRooms.toLocaleString()}</td>
                                <td><span className="font-black">{money(office.expectedMonthlyRent)}</span></td>
                                <td><span className="font-black text-emerald-700">{money(office.collectedThisMonth)}</span></td>
                                <td><span className="font-black text-red-700">{money(office.outstandingBalance)}</span></td>
                                <td>
                                    <div className="min-w-36">
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="font-black">{office.collectionPercentage}%</span>
                                            <StatusChip label={office.collectionPercentage >= 80 ? "healthy" : office.collectionPercentage >= 50 ? "watch" : "low"} tone={scoreTone(office.collectionPercentage)} />
                                        </div>
                                        <div className="mt-2 h-2 rounded-full bg-slate-100">
                                            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${office.collectionPercentage}%` }} />
                                        </div>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        <tr className="bg-slate-950 text-white">
                            <td><p className="font-black">{total.officeName}</p></td>
                            <td>{total.rooms.toLocaleString()}</td>
                            <td>{total.occupiedRooms.toLocaleString()}</td>
                            <td>{total.vacantRooms.toLocaleString()}</td>
                            <td className="font-black">{money(total.expectedMonthlyRent)}</td>
                            <td className="font-black">{money(total.collectedThisMonth)}</td>
                            <td className="font-black">{money(total.outstandingBalance)}</td>
                            <td className="font-black">{total.collectionPercentage}%</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </section>
    );
}

function CompanyMonthlyFinancePanel({ data }: Props) {
    const finance = data.monthlyFinance;
    const lastSynced = new Date(finance.lastSyncedAt);
    return (
        <section className="enterprise-panel overflow-hidden">
            <div className="border-b border-slate-200 bg-slate-950 p-6 text-white">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <PanelTitle
                        icon={<Gauge size={20} />}
                        title="Monthly Profit Intelligence"
                        description="Live company commission income, landlord payable, collections, landlord payments, recovery deductions, and profit/loss by office."
                        inverted
                    />
                    <div className="flex flex-col items-start gap-2 xl:items-end">
                        <StatusChip label={finance.liveDataStatus === "live" ? `${finance.collectionProgress}% collected` : "Live data could not load"} tone={finance.liveDataStatus === "live" ? finance.collectionProgress >= 75 ? "green" : finance.collectionProgress >= 45 ? "orange" : "red" : "red"} />
                        <p className="text-xs font-bold text-slate-300">
                            Last synced: {Number.isNaN(lastSynced.getTime()) ? "Not available" : lastSynced.toLocaleString("en-UG")}
                        </p>
                    </div>
                </div>
                {finance.liveDataStatus === "error" ? (
                    <div className="mt-4 rounded-2xl border border-red-300/30 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-100">
                        Live data could not load{finance.liveDataError ? `: ${finance.liveDataError}` : "."}
                    </div>
                ) : null}
                {finance.payrollModuleStatus ? (
                    <div className="mt-4 rounded-2xl border border-amber-300/30 bg-amber-500/10 px-4 py-3 text-sm font-bold text-amber-100">
                        {finance.payrollModuleStatus} Payroll values are shown as UGX 0 while landlord, collections, expenses, advances, recovery, and profit data continue loading live.
                    </div>
                ) : null}
                <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
                    <DarkMini label="Expected Company Commission" value={money(finance.expectedMonthlyCompanyCommissionIncome)} />
                    <DarkMini label="Expected Landlord Payable" value={money(finance.expectedLandlordPayableThisMonth)} />
                    <DarkMini label="Total Landlord Money Held" value={money(finance.totalLandlordMoneyHeld)} />
                    <DarkMini label="Unpaid Landlords" value={finance.unpaidLandlords.toLocaleString()} />
                    <DarkMini label="Paid Landlords" value={finance.paidLandlords.toLocaleString()} />
                    <DarkMini label="Total Outstanding To Landlords" value={money(finance.totalOutstandingToLandlords)} />
                    <DarkMini label="Expected Monthly Profit" value={money(finance.expectedMonthlyProfit)} />
                    <DarkMini label="Collected This Month" value={money(finance.totalCollectedFromTenantsThisMonth)} />
                    <DarkMini label="Landlord Advances" value={money(finance.activeLandlordAdvances)} />
                    <DarkMini label="Total Expenses" value={money(finance.offices.reduce((total, office) => total + office.expenses, 0))} />
                    <DarkMini label="Employee Salaries Paid" value={money(finance.employeeSalaryPayments)} />
                    <DarkMini label="Payroll Liability" value={money(finance.employeePayrollLiability)} />
                    <DarkMini label="Fine Savings" value={money(finance.employeeFineSavings)} />
                    <DarkMini label="Advance Recovered" value={money(finance.advanceDeductionsRecovered)} />
                    <DarkMini label="Recovery Deductions" value={money(finance.recoveryDeductionsPending)} />
                    <DarkMini label="Month P/L" value={money(finance.profitLossThisMonth)} />
                </div>
            </div>
            <AdminFinanceDrilldown finance={finance} landlords={data.raw.landlords} offices={data.raw.offices} />
            <div className="overflow-x-auto">
                <table className="enterprise-table">
                    <thead>
                        <tr>
                            <th className="text-left">Office</th>
                            <th className="text-left">Rent Roll</th>
                            <th className="text-left">Company Commission</th>
                            <th className="text-left">Landlord Payable</th>
                            <th className="text-left">Advances</th>
                            <th className="text-left">Collected</th>
                            <th className="text-left">Landlord Paid</th>
                            <th className="text-left">Expenses</th>
                            <th className="text-left">Outstanding</th>
                            <th className="text-left">Profit/Loss</th>
                        </tr>
                    </thead>
                    <tbody>
                        {finance.offices.length === 0 ? (
                            <tr><td colSpan={10} className="p-6"><EmptyState title="No office finance data" description="Office finance intelligence appears when rooms, collections, and landlord payment records exist." /></td></tr>
                        ) : finance.offices.map((office) => (
                            <tr key={office.officeId}>
                                <td>
                                    <p className="font-black">{office.officeName}</p>
                                    <p className="text-xs font-bold text-slate-500">{office.collectionProgress}% collection progress</p>
                                </td>
                                <td>{money(office.expectedRentRoll)}</td>
                                <td><span className="font-black text-blue-700">{money(office.expectedCompanyCommission)}</span></td>
                                <td>{money(office.expectedLandlordPayable)}</td>
                                <td>{money(office.landlordAdvancesGiven)}</td>
                                <td><span className="font-black text-emerald-700">{money(office.collectedThisMonth)}</span></td>
                                <td>{money(office.landlordPaymentsMade)}</td>
                                <td>{money(office.expenses)}</td>
                                <td><span className="font-black text-red-700">{money(office.outstandingTenantBalances)}</span></td>
                                <td><span className={office.profitLossThisMonth >= 0 ? "font-black text-emerald-700" : "font-black text-red-700"}>{money(office.profitLossThisMonth)}</span></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

function AdminTab({ href, label }: { href: string; label: string }) {
    return (
        <a href={href} className="rounded-2xl bg-slate-50 px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-blue-700 hover:text-white">
            {label}
        </a>
    );
}

function ExecutiveAdministrationDashboard({ data, deferSecondary = false }: Props) {
    const scorecards = [
        { label: "Company Health", value: data.kpis.complianceScore, icon: Landmark },
        { label: "Office Health", value: data.governance.officeGovernanceScore, icon: Building2 },
        { label: "Security Health", value: data.governance.securityScore, icon: LockKeyhole },
        { label: "Compliance Health", value: data.governance.complianceScore, icon: BadgeCheck },
    ];
    return (
        <section className="enterprise-panel p-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h2 className="text-xl font-black">Executive Administration Dashboard</h2>
                    <p className="text-sm text-slate-500">Company health, office health, security health, compliance health, and risk heat map.</p>
                </div>
                <StatusChip label="executive view" tone="blue" />
            </div>
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {scorecards.map((card) => {
                    const Icon = card.icon;
                    return (
                        <article key={card.label} className="rounded-3xl border border-slate-200 p-5">
                            <div className="flex items-center justify-between">
                                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-700"><Icon size={20} /></span>
                                <StatusChip label={`${card.value}%`} tone={scoreTone(card.value)} />
                            </div>
                            <p className="mt-4 font-black">{card.label}</p>
                            <div className="mt-4 h-3 rounded-full bg-slate-100">
                                <div className="h-full rounded-full bg-blue-500" style={{ width: `${card.value}%` }} />
                            </div>
                        </article>
                    );
                })}
            </div>
            <div className="mt-6">
                <RiskHeatMap items={data.riskHeatMap} />
            </div>
            {deferSecondary ? (
                <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800">
                    Initial dashboard mode: executive KPIs, risk, and security are loaded first; detailed modules are deferred.
                </div>
            ) : null}
        </section>
    );
}

function RiskHeatMap({ items }: { items: RiskHeatMapItem[] }) {
    return (
        <div>
            <div className="flex items-center gap-2">
                <ShieldAlert size={18} className="text-rose-700" />
                <h3 className="font-black">Risk Heat Map</h3>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {items.length === 0 ? (
                    <div className="md:col-span-2 xl:col-span-3"><EmptyState title="No risk signals" description="Administration, security, and governance signals are currently clean." /></div>
                ) : items.map((item) => (
                    <article key={item.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="truncate font-black">{item.label}</p>
                                <p className="mt-1 text-xs font-bold text-slate-400">{item.category}</p>
                            </div>
                            <StatusChip label={item.severity} tone={severityTone(item.severity)} />
                        </div>
                        <div className="mt-3 h-2 rounded-full bg-slate-100">
                            <div className={`h-full rounded-full ${riskBar(item.riskScore)}`} style={{ width: `${item.riskScore}%` }} />
                        </div>
                    </article>
                ))}
            </div>
        </div>
    );
}

function SecurityCommandCentre({ signals }: { signals: SecuritySignal[] }) {
    return (
        <section className="rounded-3xl bg-slate-950 p-6 text-white shadow-xl">
            <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-rose-500"><Fingerprint size={21} /></span>
                <div>
                    <h2 className="text-xl font-black">Security Command Centre</h2>
                    <p className="text-sm text-slate-300">Login, PIN, device, suspicious access, and security alerts.</p>
                </div>
            </div>
            <div className="mt-5 grid gap-3">
                {signals.map((signal) => (
                    <div key={signal.id} className="rounded-2xl bg-white/10 p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="font-black">{signal.title}</p>
                                <p className="mt-1 text-sm text-slate-300">{signal.description}</p>
                            </div>
                            <span className={`rounded-full px-3 py-1 text-xs font-black ${darkSeverity(signal.severity)}`}>{signal.count}</span>
                        </div>
                        <p className="mt-3 text-xs font-bold uppercase text-slate-400">{signal.status}</p>
                    </div>
                ))}
            </div>
        </section>
    );
}

function OfficeGovernanceCentre({ offices }: { offices: OfficeGovernanceItem[] }) {
    return (
        <section className="enterprise-panel overflow-hidden">
            <PanelHeader icon={<Building2 size={20} />} title="Office Governance Centre" description="Offices, targets, status, managers, holidays, schedules, and geofences." count={`${offices.length} offices`} />
            <div className="overflow-x-auto">
                <table className="enterprise-table">
                    <thead>
                        <tr>
                            <th className="text-left">Office</th>
                            <th className="text-left">Manager</th>
                            <th className="text-left">Targets</th>
                            <th className="text-left">Controls</th>
                            <th className="text-left">Score</th>
                            <th className="text-left">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {offices.length === 0 ? (
                            <tr><td colSpan={6} className="p-6"><EmptyState title="No offices found" description="Office governance data will appear once offices are configured." /></td></tr>
                        ) : offices.map((office) => (
                            <tr key={office.id}>
                                <td><p className="font-black">{office.name}</p></td>
                                <td>{office.manager}</td>
                                <td><span className="font-bold">{money(office.collectionTarget)}</span><p className="text-xs text-slate-500">Budget {money(office.expenseBudget)}</p></td>
                                <td>{office.schedules} schedules · {office.holidays} holidays · {office.geofences} geofences</td>
                                <td><ScorePill score={office.governanceScore} /></td>
                                <td><StatusChip label={office.status} tone={office.status === "active" ? "green" : "orange"} /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

function EmployeeAdministrationCentre({ employees }: { employees: EmployeeAdminItem[] }) {
    const active = employees.filter((employee) => employee.status === "active").length;
    const suspended = employees.filter((employee) => ["suspended", "inactive", "terminated"].includes(employee.status)).length;
    return (
        <section className="enterprise-panel p-6">
            <PanelTitle icon={<UsersRound size={20} />} title="Employee Administration Centre" description="Directory, active/suspended employees, assignments, attendance health, and performance." />
            <div className="mt-5 grid grid-cols-2 gap-3">
                <Mini label="Active" value={active.toString()} />
                <Mini label="Suspended/Inactive" value={suspended.toString()} />
            </div>
            <div className="mt-5 grid gap-3">
                {employees.length === 0 ? (
                    <EmptyState title="No employees found" description="Employee administration data will appear once employees are connected." />
                ) : employees.slice(0, 10).map((employee) => (
                    <article key={employee.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="font-black">{employee.name}</p>
                                <p className="text-sm text-slate-500">{employee.officeName} · {employee.role}</p>
                            </div>
                            <StatusChip label={employee.status} tone={employee.status === "active" ? "green" : "orange"} />
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-3">
                            <Mini label="Attendance" value={`${employee.attendanceHealth}%`} />
                            <Mini label="Performance" value={`${employee.performanceScore}%`} />
                            <Mini label="Devices" value={employee.deviceCount.toString()} />
                        </div>
                    </article>
                ))}
            </div>
        </section>
    );
}

function RolePermissionCentre({ roles, permissions }: { roles: PermissionMatrixRole[]; permissions: number }) {
    return (
        <section className="enterprise-panel overflow-hidden">
            <PanelHeader icon={<KeyRound size={20} />} title="Role & Permission Centre" description="Roles, permissions, matrix coverage, access scopes, office-level permissions, and company-level permissions." count={`${permissions} permissions`} />
            <div className="overflow-x-auto">
                <table className="enterprise-table">
                    <thead>
                        <tr>
                            <th className="text-left">Role</th>
                            <th className="text-left">Scope</th>
                            <th className="text-left">Assignments</th>
                            <th className="text-left">Permission Coverage</th>
                            <th className="text-left">Permission Matrix</th>
                        </tr>
                    </thead>
                    <tbody>
                        {roles.length === 0 ? (
                            <tr><td colSpan={5} className="p-6"><EmptyState title="No roles found" description="Roles and permission matrix data will appear once access roles are configured." /></td></tr>
                        ) : roles.map((role) => (
                            <tr key={role.roleId}>
                                <td><p className="font-black">{role.roleName}</p></td>
                                <td><StatusChip label={role.scope} tone={role.scope === "system" ? "purple" : "blue"} /></td>
                                <td>{role.assignmentCount}</td>
                                <td><ScorePill score={percent(role.permissionKeys.length, permissions)} /></td>
                                <td>
                                    <div className="flex max-w-3xl flex-wrap gap-2">
                                        {role.permissionKeys.slice(0, 12).map((permission) => (
                                            <span key={permission} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{permission}</span>
                                        ))}
                                        {role.permissionKeys.length > 12 ? <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">+{role.permissionKeys.length - 12}</span> : null}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

function DeviceManagementCentre({ devices }: { devices: DeviceManagementItem[] }) {
    return (
        <section className="enterprise-panel p-6">
            <PanelTitle icon={<MonitorSmartphone size={20} />} title="Device Management Centre" description="Registered devices, trust state, history, last activity, and risk score." />
            <div className="mt-5 grid gap-3">
                {devices.length === 0 ? (
                    <EmptyState title="No registered devices" description="Device trust and attendance lock records will appear here." />
                ) : devices.slice(0, 10).map((device) => (
                    <article key={device.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="font-black">{device.deviceName}</p>
                                <p className="text-sm text-slate-500">{device.userName} · {device.platform}</p>
                            </div>
                            <StatusChip label={device.trust} tone={device.trust === "trusted" ? "green" : "orange"} />
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-3">
                            <Mini label="Risk" value={`${device.riskScore}%`} />
                            <Mini label="History" value={device.historyCount.toString()} />
                            <Mini label="Last Seen" value={formatDate(device.lastActivity)} />
                        </div>
                    </article>
                ))}
            </div>
        </section>
    );
}

function GeofenceAttendanceSecurity({ policies }: { policies: AttendanceSecurityItem[] }) {
    return (
        <section className="enterprise-panel p-6">
            <PanelTitle icon={<MapPin size={20} />} title="Geofence & Attendance Security" description="Office geofences, GPS validation, device rules, and check-in restrictions." />
            <div className="mt-5 grid gap-3">
                {policies.length === 0 ? (
                    <EmptyState title="No attendance security policies" description="GPS validation and approved-device rules will appear once policies are configured." />
                ) : policies.slice(0, 10).map((policy) => (
                    <article key={policy.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="font-black">{policy.name}</p>
                                <p className="text-sm text-slate-500">{policy.officeName} · check-in {policy.checkInTime} · grace {policy.graceMinutes}m</p>
                            </div>
                            <StatusChip label={`${policy.gpsPassRate}% GPS`} tone={scoreTone(policy.gpsPassRate)} />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <StatusChip label={policy.requireGps ? "GPS required" : "GPS optional"} tone={policy.requireGps ? "green" : "orange"} />
                            <StatusChip label={policy.requireApprovedDevice ? "approved device" : "open device"} tone={policy.requireApprovedDevice ? "green" : "orange"} />
                            <StatusChip label={`${policy.geofences} geofences`} tone={policy.geofences ? "blue" : "orange"} />
                        </div>
                    </article>
                ))}
            </div>
        </section>
    );
}

function PlatformConfigurationCentre({ items }: { items: PlatformConfigurationItem[] }) {
    return (
        <section className="enterprise-panel p-6">
            <PanelTitle icon={<Settings2 size={20} />} title="Platform Configuration Centre" description="Company settings, branding, notifications, automation, audit, and AI settings." />
            <div className="mt-5 grid gap-3">
                {items.map((item) => {
                    const progress = percent(item.configured, item.total);
                    return (
                        <article key={item.id} className="rounded-2xl border border-slate-200 p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <p className="font-black">{item.title}</p>
                                    <p className="text-sm text-slate-500">{item.configured} of {item.total} configured</p>
                                </div>
                                <StatusChip label={item.status} tone={progress >= 90 ? "green" : progress >= 50 ? "orange" : "red"} />
                            </div>
                            <div className="mt-3 h-2 rounded-full bg-slate-100">
                                <div className="h-full rounded-full bg-cyan-500" style={{ width: `${progress}%` }} />
                            </div>
                        </article>
                    );
                })}
            </div>
        </section>
    );
}

function ComplianceGovernanceCentre({ data }: Props) {
    const cards = [
        { label: "Compliance Score", value: data.governance.complianceScore, icon: BadgeCheck },
        { label: "Security Score", value: data.governance.securityScore, icon: LockKeyhole },
        { label: "Audit Score", value: data.governance.auditScore, icon: Cpu },
        { label: "Data Integrity", value: data.governance.dataIntegrityScore, icon: Gauge },
        { label: "Office Governance", value: data.governance.officeGovernanceScore, icon: CalendarDays },
    ];
    return (
        <section className="rounded-3xl bg-slate-950 p-6 text-white shadow-xl">
            <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-500"><ShieldCheck size={21} /></span>
                <div>
                    <h2 className="text-xl font-black">Compliance & Governance Centre</h2>
                    <p className="text-sm text-slate-300">Security, audit, integrity, and office governance scorecards.</p>
                </div>
            </div>
            <div className="mt-5 grid gap-3">
                {cards.map((card) => {
                    const Icon = card.icon;
                    return (
                        <div key={card.label} className="rounded-2xl bg-white/10 p-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <Icon size={18} className="text-slate-300" />
                                    <p className="font-black">{card.label}</p>
                                </div>
                                <span className="text-xl font-black">{card.value}%</span>
                            </div>
                            <div className="mt-3 h-2 rounded-full bg-white/10">
                                <div className="h-full rounded-full bg-blue-400" style={{ width: `${card.value}%` }} />
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

function PanelHeader({ icon, title, description, count }: { icon: React.ReactNode; title: string; description: string; count: string }) {
    return (
        <div className="border-b border-slate-200 p-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <PanelTitle icon={icon} title={title} description={description} />
                <StatusChip label={count} tone="blue" />
            </div>
        </div>
    );
}

function PanelTitle({ icon, title, description, inverted = false }: { icon: React.ReactNode; title: string; description: string; inverted?: boolean }) {
    return (
        <div className="flex items-center gap-3">
            <span className={`grid h-11 w-11 place-items-center rounded-2xl ${inverted ? "bg-white/10 text-emerald-300" : "bg-blue-50 text-blue-700"}`}>{icon}</span>
            <div>
                <h2 className={`text-xl font-black ${inverted ? "text-white" : ""}`}>{title}</h2>
                <p className={`text-sm ${inverted ? "text-slate-300" : "text-slate-500"}`}>{description}</p>
            </div>
        </div>
    );
}

function ScorePill({ score }: { score: number }) {
    return <StatusChip label={`${score}%`} tone={scoreTone(score)} />;
}

function Mini({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-1 font-black">{value}</p>
        </div>
    );
}

function DarkMini({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl bg-white/10 p-3">
            <p className="text-xs text-slate-300">{label}</p>
            <p className="mt-1 text-2xl font-black">{value}</p>
        </div>
    );
}

function percent(numerator: number, denominator: number) {
    if (!denominator) return 0;
    return Math.max(0, Math.min(100, Math.round((numerator / denominator) * 100)));
}

function scoreTone(score: number): AdminTone {
    if (score >= 85) return "green";
    if (score >= 65) return "blue";
    if (score >= 45) return "orange";
    return "red";
}

function severityTone(severity: AdminSeverity): AdminTone {
    if (severity === "critical") return "red";
    if (severity === "high") return "orange";
    if (severity === "medium") return "blue";
    if (severity === "low") return "slate";
    return "green";
}

function darkSeverity(severity: AdminSeverity) {
    if (severity === "critical") return "bg-rose-100 text-rose-700";
    if (severity === "high") return "bg-amber-100 text-amber-800";
    if (severity === "medium") return "bg-blue-100 text-blue-700";
    if (severity === "low") return "bg-slate-100 text-slate-700";
    return "bg-emerald-100 text-emerald-700";
}

function riskBar(score: number) {
    if (score >= 75) return "bg-rose-500";
    if (score >= 50) return "bg-amber-500";
    if (score >= 25) return "bg-blue-500";
    return "bg-emerald-500";
}
