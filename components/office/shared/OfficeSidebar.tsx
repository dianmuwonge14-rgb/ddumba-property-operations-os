"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
    AlertTriangle,
    Archive,
    Banknote,
    BarChart3,
    Bell,
    Bot,
    Building2,
    CalendarCheck,
    ClipboardCheck,
    Crown,
    FileBadge,
    Gauge,
    GitMerge,
    HandCoins,
    Home,
    HousePlus,
    KeyRound,
    Landmark,
    LineChart,
    Medal,
    Rocket,
    ReceiptText,
    Sheet,
    ShieldCheck,
    SlidersHorizontal,
    UserCog,
    UsersRound,
    Vault,
    WalletCards,
    Zap,
} from "lucide-react";
import type { AttendanceGateStatus } from "@/lib/attendance/gate";
import AttendanceAccountControls from "./AttendanceAccountControls";

const adminSections = [
    {
        label: "Executive Command",
        items: [
            { href: "/office/admin/cash-position", label: "Cash Position Centre", icon: Landmark },
            { href: "/office", label: "Dashboard", icon: Home },
        ],
    },
    {
        label: "Operations",
        items: [
            { href: "/office/admin/payments", label: "Payments Entry", icon: Banknote },
            { href: "/office/receipts", label: "Receipt History", icon: ReceiptText },
            { href: "/office/security-deposits", label: "Security Deposits", icon: Vault },
            { href: "/office/collections", label: "Collections", icon: HandCoins },
            { href: "/office/admin/defaulters", label: "Defaulters", icon: AlertTriangle },
            { href: "/office/promises", label: "Promise Centre", icon: CalendarCheck },
            { href: "/office/expenses", label: "Expenses", icon: ReceiptText },
            { href: "/office/admin/vacant-rooms", label: "Vacant Rooms", icon: HousePlus },
            { href: "/office/properties", label: "Properties", icon: Building2 },
            { href: "/office/admin/tenant-relocation", label: "Tenant Relocation", icon: GitMerge },
            { href: "/office/landlord-payments", label: "Landlord Payments", icon: WalletCards },
            { href: "/office/landlords", label: "Landlords Portfolio", icon: UsersRound },
            { href: "/office/notifications", label: "Notifications", icon: Bell },
            { href: "/office/admin/cash-banking", label: "Cash Banking", icon: WalletCards },
            { href: "/office/admin/collector-banking", label: "Bank Deposit Slips", icon: Landmark },
            { href: "/office/bad-debt", label: "Bad Debt Recovery", icon: Archive },
        ],
    },
    {
        label: "Management",
        items: [
            { href: "/office/admin/office-merge", label: "Office Merge", icon: GitMerge },
            { href: "/office/automation", label: "Automation", icon: Zap },
            { href: "/office/admin/attendance", label: "Attendance", icon: Gauge },
            { href: "/office/spreadsheet", label: "Live Spreadsheet", icon: Sheet },
            { href: "/office/reports", label: "Executive Reporting", icon: BarChart3 },
            { href: "/office/ceo", label: "CEO Command Centre", icon: Crown },
            { href: "/office/excellence", label: "Office Excellence", icon: Medal },
            { href: "/office/ai", label: "AI Intelligence", icon: Bot },
            { href: "/office/admin/statements", label: "Statements Centre", icon: ReceiptText },
            { href: "/office/admin/payroll", label: "Payroll Centre", icon: FileBadge },
            { href: "/office/admin/employees", label: "Employees", icon: UserCog },
            { href: "/office/admin", label: "Administration", icon: SlidersHorizontal },
        ],
    },
    {
        label: "Governance",
        items: [
            { href: "/office/audit", label: "Audit Centre", icon: Archive },
            { href: "/office/admin/system-health", label: "System Health", icon: Gauge },
            { href: "/office/admin/data-integrity", label: "Data Integrity", icon: ShieldCheck },
            { href: "/office/admin/rent-change-requests", label: "Rent Change Requests", icon: KeyRound },
            { href: "/office/dashboard", label: "Analytics", icon: LineChart },
            { href: "/office/launch", label: "Launch Readiness", icon: Rocket },
        ],
    },
];

const officeSections = [
    {
        label: "Operations",
        items: [
            { href: "/office", label: "Dashboard", icon: Home },
            { href: "/office/payments", label: "Payments Entry", icon: Banknote },
            { href: "/office/receipts", label: "Receipt History", icon: ReceiptText },
            { href: "/office/security-deposits", label: "Security Deposits", icon: Vault },
            { href: "/office/collections", label: "Collections", icon: HandCoins },
            { href: "/office/defaulters", label: "Defaulters", icon: AlertTriangle },
            { href: "/office/promises", label: "Promise Centre", icon: CalendarCheck },
            { href: "/office/expenses", label: "Expenses", icon: ReceiptText },
            { href: "/office/notifications", label: "Notifications", icon: Bell },
            { href: "/office/cash-banking", label: "Cash Banking", icon: WalletCards },
            { href: "/office/instructions", label: "Instructions", icon: ClipboardCheck },
        ],
    },
    {
        label: "Portfolio",
        items: [
            { href: "/office/properties", label: "Properties", icon: Building2 },
            { href: "/office/vacant-rooms", label: "Vacant Rooms", icon: HousePlus },
            { href: "/office/tenant-relocation", label: "Tenant Relocation", icon: GitMerge },
            { href: "/office/landlords", label: "Landlords Portfolio", icon: UsersRound },
            { href: "/office/landlord-payments", label: "Landlord Payments", icon: WalletCards },
            { href: "/office/bad-debt", label: "Bad Debt Recovery", icon: Archive },
            { href: "/office/attendance", label: "Attendance", icon: Gauge },
            { href: "/office/salary", label: "My Salary", icon: FileBadge },
            { href: "/office/spreadsheet", label: "Daily Report", icon: Sheet },
            { href: "/office/employees", label: "Employees", icon: UserCog },
        ],
    },
];

const collectorSections = [
    {
        label: "Field Collector",
        items: [
            { href: "/office/collector", label: "Dashboard", icon: Home },
            { href: "/office/collector/payments", label: "Payments Entry", icon: Banknote },
            { href: "/office/collector/banking", label: "Bank Collections", icon: Landmark },
            { href: "/office/receipts", label: "Receipt History", icon: ReceiptText },
            { href: "/office/security-deposits", label: "Security Deposits", icon: Vault },
            { href: "/office/collector/daily", label: "Collections", icon: HandCoins },
            { href: "/office/collector/defaulters", label: "Defaulters", icon: AlertTriangle },
            { href: "/office/collector/promises", label: "Promise Centre", icon: CalendarCheck },
            { href: "/office/salary", label: "My Salary", icon: FileBadge },
            { href: "/office/collector/vacant-rooms", label: "Vacant Rooms", icon: HousePlus },
            { href: "/office/collector/tenant-relocation", label: "Tenant Relocation", icon: GitMerge },
            { href: "/office/expenses", label: "Expenses", icon: ReceiptText },
            { href: "/office/collector/instructions", label: "Instructions", icon: ClipboardCheck },
            { href: "/office/notifications", label: "Notifications", icon: Bell },
        ],
    },
];

type Props = {
    isCollector?: boolean;
    isAdmin: boolean;
    officeName: string | null;
    attendance: AttendanceGateStatus;
    notificationCount: number;
};

function themeForPath(pathname: string) {
    if (pathname.startsWith("/office/collector")) return "collections";
    if (pathname.startsWith("/office/admin")) return "admin";
    if (pathname.includes("/receipts")) return "payments";
    if (pathname.includes("/collections")) return "collections";
    if (pathname.includes("/payments")) return "payments";
    if (pathname.includes("/cash-banking") || pathname.includes("/cash-position")) return "cash";
    if (pathname.includes("/defaulters")) return "defaulters";
    if (pathname.includes("/promises")) return "promises";
    if (pathname.includes("/expenses")) return "expenses";
    if (pathname.includes("/attendance")) return "attendance";
    if (pathname.includes("/salary") || pathname.includes("/payroll")) return "employees";
    if (pathname.includes("/employees")) return "employees";
    if (pathname.includes("/properties")) return "properties";
    if (pathname.includes("/vacant-rooms")) return "vacant";
    if (pathname.includes("/tenant-relocation")) return "relocation";
    if (pathname.includes("/landlord-payments")) return "landlord-payments";
    if (pathname.includes("/landlords")) return "landlords";
    if (pathname.includes("/notifications")) return "notifications";
    if (pathname.includes("/reports") || pathname.includes("/spreadsheet") || pathname.includes("/statements")) return "reports";
    if (pathname === "/office" || pathname.includes("/dashboard") || pathname.includes("/ceo") || pathname.includes("/excellence")) return "dashboard";
    return "admin";
}

export default function OfficeSidebar({ isAdmin, isCollector = false, officeName, attendance, notificationCount }: Props) {
    const pathname = usePathname();
    const moduleTheme = themeForPath(pathname);
    const sections = isCollector ? collectorSections : isAdmin ? adminSections : officeSections;
    const logoHref = isAdmin ? "/office/admin/cash-position" : isCollector ? "/office/collector" : "/office";
    const activeItem = sections.flatMap((section) => section.items).find((item) => pathname === item.href || (item.href !== "/office" && pathname.startsWith(item.href)));
    const checkInTime = attendance.firstCheckIn
        ? new Intl.DateTimeFormat("en-UG", { timeZone: "Africa/Kampala", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(attendance.firstCheckIn))
        : null;
    const statusLabel = attendance.status === "on_time" ? "On Time" : attendance.status === "late" ? "Late" : attendance.status === "absent" ? "Absent" : attendance.status === "checked_out" ? "Checked out" : "Check in required";
    const attendanceLabel = attendance.required ? attendance.checkedIn ? `${checkInTime ?? "Checked in"} · ${statusLabel}` : statusLabel : "Admin mode";
    const attendanceClass = attendance.required && !attendance.checkedIn
        ? "border-amber-400/30 bg-amber-400/10 text-amber-100"
        : attendance.status === "late"
            ? "border-amber-400/30 bg-amber-400/10 text-amber-100"
            : attendance.status === "absent"
                ? "border-red-400/30 bg-red-400/10 text-red-100"
                : "border-emerald-400/30 bg-emerald-400/10 text-emerald-100";

    useEffect(() => {
        document.documentElement.dataset.moduleTheme = moduleTheme;
        return () => {
            delete document.documentElement.dataset.moduleTheme;
        };
    }, [moduleTheme]);

    return (
        <>
            <header className={`app-sticky-header fixed inset-x-0 top-0 z-[80] border-b border-white/10 bg-slate-950/88 px-3 py-2.5 text-white shadow-2xl shadow-black/40 backdrop-blur-2xl sm:px-4 sm:py-3 ${isCollector ? "collector-top-header" : ""}`}>
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_0%,rgba(59,130,246,0.28),transparent_28%),radial-gradient(circle_at_86%_0%,rgba(20,184,166,0.18),transparent_26%)]" />
                <div className="app-header-main relative mx-auto grid max-w-[1800px] grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                        <a href={logoHref} aria-label="Open role landing page" className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-blue-500 via-cyan-400 to-emerald-400 text-white shadow-lg shadow-cyan-500/20 ring-1 ring-white/20 transition hover:scale-105 motion-reduce:transform-none sm:h-11 sm:w-11">
                            <WalletCards size={19} />
                        </a>
                        <div className="min-w-0">
                            <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                                <p className="whitespace-nowrap text-xs font-black tracking-wide text-white sm:text-sm">DDUMBA OS</p>
                                <span className="mobile-nowrap rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[9px] font-black uppercase text-cyan-100 sm:px-2.5 sm:py-1 sm:text-[10px]">
                                    {isAdmin ? "Admin" : isCollector ? "Collector" : "Office"}
                                </span>
                            </div>
                            <p className="max-w-[58vw] truncate text-[11px] font-bold text-slate-400 sm:max-w-none sm:text-xs">{activeItem?.label ?? "Enterprise"} · {officeName ?? "Company"}</p>
                        </div>
                    </div>
                    <div className="app-header-controls flex min-w-0 items-center gap-1.5 overflow-x-auto pb-0.5 sm:justify-end sm:gap-2 sm:overflow-visible sm:pb-0">
                        <span className={`mobile-nowrap inline-flex max-w-[52vw] shrink-0 items-center gap-1 overflow-hidden rounded-full border px-2 py-1 text-[11px] font-black shadow-sm sm:max-w-none sm:px-3 sm:text-xs ${attendanceClass}`}>
                            <ShieldCheck className="shrink-0" size={13} />
                            <span className="truncate">{attendanceLabel}</span>
                        </span>
                        <AttendanceAccountControls attendance={attendance} />
                    </div>
                </div>
                <nav className={`app-top-nav mobile-nav-scroll relative mx-auto mt-2 flex max-w-[1800px] gap-2 overflow-x-auto pb-1 sm:mt-3 ${isCollector ? "collector-top-nav" : ""}`}>
                    {sections.flatMap((section) => section.items).map((item) => {
                        const active = pathname === item.href || (item.href !== "/office" && pathname.startsWith(item.href));
                        const Icon = item.icon;
                        return (
                            <a key={item.href} href={item.href} className={`mobile-nowrap inline-flex shrink-0 items-center gap-1.5 rounded-2xl px-2.5 py-2 text-[11px] font-black ring-1 transition sm:gap-2 sm:px-3 sm:text-xs ${active ? "bg-white text-slate-950 shadow-lg shadow-cyan-500/20 ring-white/30" : "bg-white/7 text-slate-300 ring-white/10 hover:bg-white/14 hover:text-white"}`}>
                                <Icon className="shrink-0" size={15} />
                                <span className="whitespace-nowrap">{item.href === "/office/notifications" && notificationCount > 0 ? `${item.label} (${notificationCount})` : item.label}</span>
                            </a>
                        );
                    })}
                </nav>
            </header>
        </>
    );
}
