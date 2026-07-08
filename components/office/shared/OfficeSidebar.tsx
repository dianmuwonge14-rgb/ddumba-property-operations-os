"use client";

import Link from "next/link";
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
    Gauge,
    GitMerge,
    HandCoins,
    Home,
    HousePlus,
    KeyRound,
    LineChart,
    Medal,
    Rocket,
    ReceiptText,
    Sheet,
    ShieldCheck,
    SlidersHorizontal,
    UserCog,
    UsersRound,
    WalletCards,
    Zap,
} from "lucide-react";
import type { AttendanceGateStatus } from "@/lib/attendance/gate";
import AttendanceAccountControls from "./AttendanceAccountControls";

const adminSections = [
    {
        label: "Executive Command",
        items: [
            { href: "/office", label: "Dashboard", icon: Home },
            { href: "/office/ceo", label: "CEO Command Centre", icon: Crown },
            { href: "/office/reports", label: "Executive Reporting", icon: BarChart3 },
            { href: "/office/excellence", label: "Office Excellence", icon: Medal },
        ],
    },
    {
        label: "Operations",
        items: [
            { href: "/office/collections", label: "Collections", icon: HandCoins },
            { href: "/office/admin/payments", label: "Payments Entry", icon: Banknote },
            { href: "/office/admin/cash-banking", label: "Cash Banking", icon: WalletCards },
            { href: "/office/admin/defaulters", label: "Defaulters", icon: AlertTriangle },
            { href: "/office/promises", label: "Promise Centre", icon: CalendarCheck },
            { href: "/office/spreadsheet", label: "Live Spreadsheet", icon: Sheet },
            { href: "/office/admin/attendance", label: "Attendance", icon: Gauge },
            { href: "/office/expenses", label: "Expenses", icon: ReceiptText },
            { href: "/office/automation", label: "Automation", icon: Zap },
        ],
    },
    {
        label: "Portfolio",
        items: [
            { href: "/office/properties", label: "Properties", icon: Building2 },
            { href: "/office/admin/vacant-rooms", label: "Vacant Rooms", icon: HousePlus },
            { href: "/office/admin/tenant-relocation", label: "Tenant Relocation", icon: GitMerge },
            { href: "/office/landlords", label: "Landlords Portfolio", icon: UsersRound },
            { href: "/office/landlord-payments", label: "Landlord Payments", icon: WalletCards },
            { href: "/office/bad-debt", label: "Bad Debt Recovery", icon: Archive },
        ],
    },
    {
        label: "Intelligence",
        items: [
            { href: "/office/ai", label: "AI Intelligence", icon: Bot },
            { href: "/office/notifications", label: "Notifications", icon: Bell },
            { href: "/office/dashboard", label: "Analytics", icon: LineChart },
        ],
    },
    {
        label: "Governance",
        items: [
            { href: "/office/audit", label: "Audit Centre", icon: Archive },
            { href: "/office/admin/data-integrity", label: "Data Integrity", icon: ShieldCheck },
            { href: "/office/admin/system-health", label: "System Health", icon: Gauge },
            { href: "/office/admin", label: "Administration", icon: SlidersHorizontal },
            { href: "/office/admin/employees", label: "Employees", icon: UserCog },
            { href: "/office/admin/office-merge", label: "Office Merge", icon: GitMerge },
            { href: "/office/admin/statements", label: "Statements Centre", icon: ReceiptText },
            { href: "/office/admin/rent-change-requests", label: "Rent Change Requests", icon: KeyRound },
            { href: "/office/launch", label: "Launch Readiness", icon: Rocket },
        ],
    },
];

const officeSections = [
    {
        label: "Operations",
        items: [
            { href: "/office", label: "Dashboard", icon: Home },
            { href: "/office/collections", label: "Collections", icon: HandCoins },
            { href: "/office/payments", label: "Payments Entry", icon: Banknote },
            { href: "/office/cash-banking", label: "Cash Banking", icon: WalletCards },
            { href: "/office/defaulters", label: "Defaulters", icon: AlertTriangle },
            { href: "/office/promises", label: "Promise Centre", icon: CalendarCheck },
            { href: "/office/expenses", label: "Expenses", icon: ReceiptText },
            { href: "/office/attendance", label: "Attendance", icon: Gauge },
            { href: "/office/employees", label: "Employees", icon: UserCog },
            { href: "/office/spreadsheet", label: "Daily Report", icon: Sheet },
            { href: "/office/notifications", label: "Notifications", icon: Bell },
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
        ],
    },
];

type Props = {
    isAdmin: boolean;
    officeName: string | null;
    attendance: AttendanceGateStatus;
    notificationCount: number;
};

export default function OfficeSidebar({ isAdmin, officeName, attendance, notificationCount }: Props) {
    const pathname = usePathname();
    const sections = isAdmin ? adminSections : officeSections;
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

    return (
        <>
            <header className="fixed inset-x-0 top-0 z-[80] border-b border-white/10 bg-slate-950/88 px-3 py-2.5 text-white shadow-2xl shadow-black/40 backdrop-blur-2xl sm:px-4 sm:py-3">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_0%,rgba(59,130,246,0.28),transparent_28%),radial-gradient(circle_at_86%_0%,rgba(20,184,166,0.18),transparent_26%)]" />
                <div className="relative mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-2 sm:flex-nowrap sm:gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-blue-500 via-cyan-400 to-emerald-400 text-white shadow-lg shadow-cyan-500/20 ring-1 ring-white/20 sm:h-11 sm:w-11">
                            <WalletCards size={19} />
                        </div>
                        <div className="min-w-0">
                            <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                                <p className="whitespace-nowrap text-xs font-black tracking-wide text-white sm:text-sm">DDUMBA OS</p>
                                <span className="mobile-nowrap rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[9px] font-black uppercase text-cyan-100 sm:px-2.5 sm:py-1 sm:text-[10px]">
                                    {isAdmin ? "Admin" : "Office"}
                                </span>
                            </div>
                            <p className="max-w-[58vw] truncate text-[11px] font-bold text-slate-400 sm:max-w-none sm:text-xs">{activeItem?.label ?? "Enterprise"} · {officeName ?? "Company"}</p>
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center justify-end gap-1.5 sm:gap-2">
                        <span className={`mobile-nowrap inline-flex max-w-[48vw] items-center gap-1 overflow-hidden rounded-full border px-2 py-1 text-[11px] font-black shadow-sm sm:max-w-none sm:px-3 sm:text-xs ${attendanceClass}`}>
                            <ShieldCheck className="shrink-0" size={13} />
                            <span className="truncate">{attendanceLabel}</span>
                        </span>
                        <AttendanceAccountControls attendance={attendance} />
                    </div>
                </div>
                <nav className="mobile-nav-scroll relative mx-auto mt-2 flex max-w-[1800px] gap-2 overflow-x-auto pb-1 sm:mt-3">
                    {sections.flatMap((section) => section.items).map((item) => {
                        const active = pathname === item.href || (item.href !== "/office" && pathname.startsWith(item.href));
                        const Icon = item.icon;
                        return (
                            <Link key={item.href} href={item.href} className={`mobile-nowrap inline-flex shrink-0 items-center gap-1.5 rounded-2xl px-2.5 py-2 text-[11px] font-black ring-1 transition sm:gap-2 sm:px-3 sm:text-xs ${active ? "bg-white text-slate-950 shadow-lg shadow-cyan-500/20 ring-white/30" : "bg-white/7 text-slate-300 ring-white/10 hover:bg-white/14 hover:text-white"}`}>
                                <Icon className="shrink-0" size={15} />
                                <span className="whitespace-nowrap">{item.href === "/office/notifications" && notificationCount > 0 ? `${item.label} (${notificationCount})` : item.label}</span>
                            </Link>
                        );
                    })}
                </nav>
            </header>
            <aside className="sticky top-32 z-20 hidden h-[calc(100vh-8rem)] w-80 shrink-0 border-r border-white/10 bg-slate-950/62 px-4 py-5 shadow-2xl shadow-black/30 backdrop-blur-2xl xl:block">
                <div className="enterprise-dark-panel mb-6 rounded-3xl p-5 text-white">
                    <div className="flex items-center gap-3">
                        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-500">
                            <WalletCards size={23} />
                        </div>
                        <div>
                            <h2 className="text-lg font-black">DDUMBA OS</h2>
                            <p className="text-xs text-slate-300">{isAdmin ? "Property Operations" : officeName ?? "Office Operations"}</p>
                        </div>
                    </div>
                    <div className="mt-5 flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3">
                        <span className="text-xs font-bold text-slate-300">{isAdmin ? "Enterprise Status" : "Attendance Status"}</span>
                        <span className={`inline-flex items-center gap-1 text-xs font-black ${attendance.required && !attendance.checkedIn ? "text-orange-300" : attendance.status === "late" ? "text-amber-300" : attendance.status === "absent" ? "text-red-300" : "text-emerald-300"}`}>
                            <ClipboardCheck size={14} />
                            {attendanceLabel}
                        </span>
                    </div>
                    <AttendanceAccountControls attendance={attendance} compact />
                </div>

                <nav className="space-y-6 overflow-y-auto pb-6">
                    {sections.map((section) => (
                        <div key={section.label}>
                            <p className="mb-2 px-3 text-xs font-black uppercase text-slate-500">{section.label}</p>
                            <div className="space-y-1">
                                {section.items.map((item) => {
                                    const active = pathname === item.href || (item.href !== "/office" && pathname.startsWith(item.href));
                                    const Icon = item.icon;
                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            className={`group flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-bold transition ${
                                                active
                                                    ? "bg-white text-slate-950 shadow-lg shadow-cyan-500/10 ring-1 ring-white/30"
                                                    : "text-slate-300 hover:bg-white/10 hover:text-white hover:shadow-sm"
                                            }`}
                                        >
                                            <span className={`grid h-9 w-9 place-items-center rounded-xl ${active ? "bg-gradient-to-br from-blue-600 to-cyan-500 text-white" : "bg-white/8 text-slate-400 group-hover:bg-white/12 group-hover:text-white"}`}>
                                                <Icon size={18} />
                                            </span>
                                            <span className="flex-1">
                                                {item.href === "/office/notifications" && notificationCount > 0 ? `${item.label} (${notificationCount})` : item.label}
                                            </span>
                                            {active && <span className="h-2 w-2 rounded-full bg-cyan-400 shadow-lg shadow-cyan-400/50" />}
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </nav>
            </aside>
        </>
    );
}
