import {
    LayoutDashboard,
    Users,
    Building2,
    CalendarDays,
    Clock3,
    FileText,
    Settings,
    LogOut,
    CheckCircle,
    AlertCircle,
    XCircle,
    TrendingUp
} from "lucide-react";

import Link from "next/link";

export default function AdminDashboard() {
    const now = new Date();
    const monthOptions = Array.from({ length: 3 }, (_, index) => {
        const month = new Date(now.getFullYear(), now.getMonth() - index, 1);
        return new Intl.DateTimeFormat("en-UG", { month: "long", year: "numeric", timeZone: "Africa/Kampala" }).format(month);
    });

    return (
        <div className="flex min-h-screen bg-slate-100">

            {/* SIDEBAR */}
            <aside className="w-72 bg-slate-900 text-white flex flex-col shadow-xl">

                <div className="p-6 border-b border-slate-800">
                    <img
                        src="/ddumba-logo.png"
                        alt="Ddumba"
                        className="h-14 object-contain"
                    />
                </div>

                <div className="p-6 border-b border-slate-800">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-slate-700 rounded-full flex items-center justify-center">
                            <Users size={20} />
                        </div>

                        <div>
                            <p className="font-semibold">Admin</p>
                            <p className="text-sm text-slate-400">
                                System Administrator
                            </p>
                        </div>
                    </div>
                </div>

                <nav className="flex-1 p-4 space-y-2">

                    <button className="w-full flex items-center gap-3 bg-green-600 p-3 rounded-xl">
                        <LayoutDashboard size={20} />
                        Dashboard
                    </button>

                    <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800">
                        <Users size={20} />
                        Employees
                    </button>

                    <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800">
                        <Building2 size={20} />
                        Offices
                    </button>

                    <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800">
                        <CalendarDays size={20} />
                        Schedules
                    </button>

                    <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800">
                        <Clock3 size={20} />
                        Attendance
                    </button>

                    <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800">
                        <FileText size={20} />
                        Reports
                    </button>

                    <Link
                        href="/admin/settings"
                        className="w-full flex items-center gap-3 p-3 hover:bg-slate-800 rounded-xl"
                    >
                        <Settings size={20} />
                        Settings
                    </Link>

                </nav>

                <div className="p-4">
                    <button className="w-full flex items-center gap-3 bg-red-600 p-3 rounded-xl">
                        <LogOut size={20} />
                        Logout
                    </button>
                </div>

            </aside>

            {/* MAIN CONTENT */}
            <main className="flex-1 p-8">

                {/* PAGE HEADER */}
                <div className="bg-white rounded-3xl shadow-sm p-8 mb-6">

                    <div className="flex justify-between items-center mb-8">

                        <div>
                            <h1 className="text-4xl font-bold text-slate-900">
                                Admin Dashboard
                            </h1>

                            <p className="text-gray-500 mt-2">
                                Welcome back, Administrator
                            </p>
                        </div>

                        <div className="bg-slate-100 px-5 py-3 rounded-xl font-medium">
                            📅 13 Jun 2026
                        </div>

                    </div>

                    {/* STATS */}
                    <div className="grid grid-cols-5 gap-5">

                        <div className="bg-white border rounded-2xl p-5 shadow-sm">
                            <div className="flex justify-between">
                                <div>
                                    <p className="text-gray-500 text-sm">
                                        Total Employees
                                    </p>
                                    <h2 className="text-4xl font-bold mt-2">
                                        15
                                    </h2>
                                </div>

                                <Users className="text-blue-500" />
                            </div>
                        </div>

                        <div className="bg-white border rounded-2xl p-5 shadow-sm">
                            <div className="flex justify-between">
                                <div>
                                    <p className="text-gray-500 text-sm">
                                        Present Today
                                    </p>
                                    <h2 className="text-4xl font-bold text-green-600 mt-2">
                                        12
                                    </h2>
                                </div>

                                <CheckCircle className="text-green-500" />
                            </div>
                        </div>

                        <div className="bg-white border rounded-2xl p-5 shadow-sm">
                            <div className="flex justify-between">
                                <div>
                                    <p className="text-gray-500 text-sm">
                                        Late
                                    </p>
                                    <h2 className="text-4xl font-bold text-orange-500 mt-2">
                                        2
                                    </h2>
                                </div>

                                <AlertCircle className="text-orange-500" />
                            </div>
                        </div>

                        <div className="bg-white border rounded-2xl p-5 shadow-sm">
                            <div className="flex justify-between">
                                <div>
                                    <p className="text-gray-500 text-sm">
                                        Absent
                                    </p>
                                    <h2 className="text-4xl font-bold text-red-600 mt-2">
                                        1
                                    </h2>
                                </div>

                                <XCircle className="text-red-500" />
                            </div>
                        </div>

                        <div className="bg-white border rounded-2xl p-5 shadow-sm">
                            <div className="flex justify-between">
                                <div>
                                    <p className="text-gray-500 text-sm">
                                        Attendance Rate
                                    </p>
                                    <h2 className="text-4xl font-bold text-purple-600 mt-2">
                                        96%
                                    </h2>
                                </div>

                                <TrendingUp className="text-purple-500" />
                            </div>
                        </div>

                    </div>

                </div>

                {/* PLACEHOLDER FOR SUMMARY TABLE */}
                <div className="bg-white rounded-3xl shadow-sm p-8">

                    <h2 className="text-2xl font-bold mb-6">
                        Today&apos;s Attendance Summary
                    </h2>

                    <div className="overflow-x-auto">

                        <table className="w-full">

                            <thead>

                                <tr className="bg-slate-100 text-slate-700">

                                    <th className="text-left p-4 rounded-l-xl">
                                        Office
                                    </th>

                                    <th className="text-center p-4">
                                        Total Employees
                                    </th>

                                    <th className="text-center p-4">
                                        Present
                                    </th>

                                    <th className="text-center p-4">
                                        Late
                                    </th>

                                    <th className="text-center p-4">
                                        Absent
                                    </th>

                                    <th className="text-center p-4 rounded-r-xl">
                                        Off Day
                                    </th>

                                </tr>

                            </thead>

                            <tbody>

                                <tr className="border-b hover:bg-slate-50">
                                    <td className="p-4">Lugonjo Office</td>
                                    <td className="text-center">4</td>
                                    <td className="text-center font-semibold text-green-600">4</td>
                                    <td className="text-center text-orange-500">0</td>
                                    <td className="text-center text-red-500">0</td>
                                    <td className="text-center text-blue-500">0</td>
                                </tr>

                                <tr className="border-b hover:bg-slate-50">
                                    <td className="p-4">Kigungu Office</td>
                                    <td className="text-center">4</td>
                                    <td className="text-center font-semibold text-green-600">3</td>
                                    <td className="text-center text-orange-500">0</td>
                                    <td className="text-center text-red-500">1</td>
                                    <td className="text-center text-blue-500">0</td>
                                </tr>

                                <tr className="border-b hover:bg-slate-50">
                                    <td className="p-4">Kapeeka Office</td>
                                    <td className="text-center">4</td>
                                    <td className="text-center font-semibold text-green-600">3</td>
                                    <td className="text-center text-orange-500">1</td>
                                    <td className="text-center text-red-500">0</td>
                                    <td className="text-center text-blue-500">0</td>
                                </tr>

                                <tr className="border-b hover:bg-slate-50">
                                    <td className="p-4">Mbale Office</td>
                                    <td className="text-center">3</td>
                                    <td className="text-center font-semibold text-green-600">2</td>
                                    <td className="text-center text-orange-500">1</td>
                                    <td className="text-center text-red-500">0</td>
                                    <td className="text-center text-blue-500">0</td>
                                </tr>

                                <tr className="bg-slate-50 font-bold">

                                    <td className="p-4">
                                        TOTAL
                                    </td>

                                    <td className="text-center">
                                        15
                                    </td>

                                    <td className="text-center text-green-600">
                                        12
                                    </td>

                                    <td className="text-center text-orange-500">
                                        2
                                    </td>

                                    <td className="text-center text-red-500">
                                        1
                                    </td>

                                    <td className="text-center text-blue-500">
                                        0
                                    </td>

                                </tr>

                            </tbody>

                        </table>

                    </div>

                    {/* ATTENDANCE REPORT */}
                    <div className="bg-white rounded-3xl shadow-sm p-8 mt-6">

                        <div className="flex justify-between items-center mb-6">

                            <div>
                                <h2 className="text-2xl font-bold">
                                    Attendance Report
                                </h2>

                                <p className="text-sm text-gray-500">
                                    Dashboard / Reports / Attendance Report
                                </p>
                            </div>

                            <div className="flex gap-3">

                                <button className="bg-green-600 hover:bg-green-700 text-white px-5 py-3 rounded-xl font-medium">
                                    Export Excel
                                </button>

                                <button className="bg-red-600 hover:bg-red-700 text-white px-5 py-3 rounded-xl font-medium">
                                    Export PDF
                                </button>

                            </div>

                        </div>

                        {/* Filters */}
                        <div className="grid grid-cols-5 gap-4 mb-8">

                            <select className="border rounded-xl p-3">
                                <option>All Offices</option>
                            </select>

                            <select className="border rounded-xl p-3">
                                <option>All Employees</option>
                            </select>

                            <input
                                type="date"
                                className="border rounded-xl p-3"
                            />

                            <input
                                type="date"
                                className="border rounded-xl p-3"
                            />

                            <button className="bg-green-600 text-white rounded-xl">
                                Search
                            </button>

                        </div>

                        {/* Report Table */}
                        <div className="overflow-x-auto">

                            <table className="w-full">

                                <thead>

                                    <tr className="bg-slate-100">

                                        <th className="p-4 text-left">#</th>
                                        <th className="p-4 text-left">Employee</th>
                                        <th className="p-4 text-left">Office</th>
                                        <th className="p-4 text-left">Date</th>
                                        <th className="p-4 text-left">Clock In</th>
                                        <th className="p-4 text-left">Lunch Out</th>
                                        <th className="p-4 text-left">Lunch In</th>
                                        <th className="p-4 text-left">Clock Out</th>
                                        <th className="p-4 text-left">Status</th>

                                    </tr>

                                </thead>

                                <tbody>

                                    <tr className="border-b">
                                        <td className="p-4">1</td>
                                        <td className="p-4">John Ssemanda</td>
                                        <td className="p-4">Lugonjo Office</td>
                                        <td className="p-4">13 Jun 2026</td>
                                        <td className="p-4">08:03 AM</td>
                                        <td className="p-4">01:01 PM</td>
                                        <td className="p-4">02:02 PM</td>
                                        <td className="p-4">05:04 PM</td>
                                        <td className="p-4 text-green-600 font-semibold">
                                            On Time
                                        </td>
                                    </tr>

                                    <tr className="border-b">
                                        <td className="p-4">2</td>
                                        <td className="p-4">Sarah Nakato</td>
                                        <td className="p-4">Lugonjo Office</td>
                                        <td className="p-4">13 Jun 2026</td>
                                        <td className="p-4">08:17 AM</td>
                                        <td className="p-4">01:00 PM</td>
                                        <td className="p-4">02:01 PM</td>
                                        <td className="p-4">05:02 PM</td>
                                        <td className="p-4 text-orange-500 font-semibold">
                                            Late
                                        </td>
                                    </tr>

                                    <tr className="border-b">
                                        <td className="p-4">3</td>
                                        <td className="p-4">David Kato</td>
                                        <td className="p-4">Kigungu Office</td>
                                        <td className="p-4">13 Jun 2026</td>
                                        <td className="p-4">07:55 AM</td>
                                        <td className="p-4">01:00 PM</td>
                                        <td className="p-4">02:00 PM</td>
                                        <td className="p-4">05:01 PM</td>
                                        <td className="p-4 text-green-600 font-semibold">
                                            On Time
                                        </td>
                                    </tr>

                                    <tr>
                                        <td className="p-4">4</td>
                                        <td className="p-4">Lydia Nambi</td>
                                        <td className="p-4">Kigungu Office</td>
                                        <td className="p-4">13 Jun 2026</td>
                                        <td className="p-4">--:--</td>
                                        <td className="p-4">--:--</td>
                                        <td className="p-4">--:--</td>
                                        <td className="p-4">--:--</td>
                                        <td className="p-4 text-red-600 font-semibold">
                                            Absent
                                        </td>
                                    </tr>

                                </tbody>

                            </table>

                        </div>

                    </div>

                    {/* EMPLOYEES SECTION */}
                    <div className="bg-white rounded-3xl shadow-sm p-8 mt-6">

                        <div className="flex justify-between items-center mb-6">

                            <div>
                                <h2 className="text-2xl font-bold">
                                    Employees
                                </h2>

                                <p className="text-gray-500">
                                    Manage all company employees
                                </p>
                            </div>

                            <button className="bg-green-600 hover:bg-green-700 text-white px-5 py-3 rounded-xl font-medium">
                                + Add Employee
                            </button>

                        </div>

                        <div className="overflow-x-auto">

                            <table className="w-full">

                                <thead>
                                    <tr className="bg-slate-100">

                                        <th className="p-4 text-left">ID</th>
                                        <th className="p-4 text-left">Employee</th>
                                        <th className="p-4 text-left">Office</th>
                                        <th className="p-4 text-left">PIN</th>
                                        <th className="p-4 text-left">Phone</th>
                                        <th className="p-4 text-left">Status</th>
                                        <th className="p-4 text-left">Actions</th>

                                    </tr>
                                </thead>

                                <tbody>

                                    <tr className="border-b hover:bg-slate-50">

                                        <td className="p-4 font-medium">
                                            DPM-001
                                        </td>

                                        <td className="p-4">
                                            John Ssemanda
                                        </td>

                                        <td className="p-4">
                                            Lugonjo Office
                                        </td>

                                        <td className="p-4">
                                            ••••••
                                        </td>

                                        <td className="p-4">
                                            0700123456
                                        </td>

                                        <td className="p-4">
                                            <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full">
                                                Active
                                            </span>
                                        </td>

                                        <td className="p-4 flex gap-2">

                                            <button className="bg-blue-100 text-blue-700 px-3 py-1 rounded-lg">
                                                Edit
                                            </button>

                                            <button className="bg-red-100 text-red-700 px-3 py-1 rounded-lg">
                                                Disable
                                            </button>

                                        </td>

                                    </tr>

                                    <tr className="border-b hover:bg-slate-50">

                                        <td className="p-4 font-medium">
                                            DPM-002
                                        </td>

                                        <td className="p-4">
                                            Sarah Nakato
                                        </td>

                                        <td className="p-4">
                                            Kigungu Office
                                        </td>

                                        <td className="p-4">
                                            ••••••
                                        </td>

                                        <td className="p-4">
                                            0700987654
                                        </td>

                                        <td className="p-4">
                                            <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full">
                                                Active
                                            </span>
                                        </td>

                                        <td className="p-4 flex gap-2">

                                            <button className="bg-blue-100 text-blue-700 px-3 py-1 rounded-lg">
                                                Edit
                                            </button>

                                            <button className="bg-red-100 text-red-700 px-3 py-1 rounded-lg">
                                                Disable
                                            </button>

                                        </td>

                                    </tr>

                                </tbody>

                            </table>

                        </div>

                        {/* OFFICES SECTION */}
                        <div className="bg-white rounded-3xl shadow-sm p-8 mt-6">

                            <div className="flex justify-between items-center mb-6">

                                <div>
                                    <h2 className="text-2xl font-bold">
                                        Offices Overview
                                    </h2>

                                    <p className="text-gray-500">
                                        Attendance performance by office
                                    </p>
                                </div>

                                <button className="bg-green-600 hover:bg-green-700 text-white px-5 py-3 rounded-xl">
                                    + Add Office
                                </button>

                            </div>

                            <div className="grid grid-cols-4 gap-5">

                                {/* Lugonjo */}
                                <div className="border rounded-2xl p-5 hover:shadow-lg transition">
                                    <h3 className="text-xl font-bold mb-3">
                                        Lugonjo Office
                                    </h3>

                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span>Total Employees</span>
                                            <span className="font-bold">4</span>
                                        </div>

                                        <div className="flex justify-between">
                                            <span>Present</span>
                                            <span className="font-bold text-green-600">4</span>
                                        </div>

                                        <div className="flex justify-between">
                                            <span>Late</span>
                                            <span className="font-bold text-orange-500">0</span>
                                        </div>

                                        <div className="flex justify-between">
                                            <span>Absent</span>
                                            <span className="font-bold text-red-600">0</span>
                                        </div>
                                    </div>

                                    <div className="mt-4">
                                        <div className="bg-slate-200 h-3 rounded-full">
                                            <div className="bg-green-500 h-3 rounded-full w-full"></div>
                                        </div>

                                        <p className="mt-2 text-green-600 font-semibold">
                                            100% Attendance
                                        </p>
                                    </div>
                                </div>

                                {/* Kigungu */}
                                <div className="border rounded-2xl p-5 hover:shadow-lg transition">
                                    <h3 className="text-xl font-bold mb-3">
                                        Kigungu Office
                                    </h3>

                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span>Total Employees</span>
                                            <span className="font-bold">4</span>
                                        </div>

                                        <div className="flex justify-between">
                                            <span>Present</span>
                                            <span className="font-bold text-green-600">3</span>
                                        </div>

                                        <div className="flex justify-between">
                                            <span>Late</span>
                                            <span className="font-bold text-orange-500">0</span>
                                        </div>

                                        <div className="flex justify-between">
                                            <span>Absent</span>
                                            <span className="font-bold text-red-600">1</span>
                                        </div>
                                    </div>

                                    <div className="mt-4">
                                        <div className="bg-slate-200 h-3 rounded-full">
                                            <div className="bg-green-500 h-3 rounded-full w-[75%]"></div>
                                        </div>

                                        <p className="mt-2 text-green-600 font-semibold">
                                            75% Attendance
                                        </p>
                                    </div>
                                </div>

                                {/* Kapeeka */}
                                <div className="border rounded-2xl p-5 hover:shadow-lg transition">
                                    <h3 className="text-xl font-bold mb-3">
                                        Kapeeka Office
                                    </h3>

                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span>Total Employees</span>
                                            <span className="font-bold">4</span>
                                        </div>

                                        <div className="flex justify-between">
                                            <span>Present</span>
                                            <span className="font-bold text-green-600">3</span>
                                        </div>

                                        <div className="flex justify-between">
                                            <span>Late</span>
                                            <span className="font-bold text-orange-500">1</span>
                                        </div>

                                        <div className="flex justify-between">
                                            <span>Absent</span>
                                            <span className="font-bold text-red-600">0</span>
                                        </div>
                                    </div>

                                    <div className="mt-4">
                                        <div className="bg-slate-200 h-3 rounded-full">
                                            <div className="bg-green-500 h-3 rounded-full w-[90%]"></div>
                                        </div>

                                        <p className="mt-2 text-green-600 font-semibold">
                                            90% Attendance
                                        </p>
                                    </div>
                                </div>

                                {/* Mbale */}
                                <div className="border rounded-2xl p-5 hover:shadow-lg transition">
                                    <h3 className="text-xl font-bold mb-3">
                                        Mbale Office
                                    </h3>

                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span>Total Employees</span>
                                            <span className="font-bold">3</span>
                                        </div>

                                        <div className="flex justify-between">
                                            <span>Present</span>
                                            <span className="font-bold text-green-600">2</span>
                                        </div>

                                        <div className="flex justify-between">
                                            <span>Late</span>
                                            <span className="font-bold text-orange-500">1</span>
                                        </div>

                                        <div className="flex justify-between">
                                            <span>Absent</span>
                                            <span className="font-bold text-red-600">0</span>
                                        </div>
                                    </div>

                                    <div className="mt-4">
                                        <div className="bg-slate-200 h-3 rounded-full">
                                            <div className="bg-green-500 h-3 rounded-full w-[85%]"></div>
                                        </div>

                                        <p className="mt-2 text-green-600 font-semibold">
                                            85% Attendance
                                        </p>
                                    </div>
                                </div>

                            </div>

                        </div>
                        {/* ATTENDANCE REPORTS */}
                        <div className="bg-white rounded-3xl shadow-sm p-8 mt-6">

                            <div className="flex justify-between items-center mb-8">

                                <div>
                                    <h2 className="text-2xl font-bold">
                                        Attendance Reports
                                    </h2>

                                    <p className="text-gray-500">
                                        Search and export attendance records
                                    </p>
                                </div>

                                <div className="flex gap-3">

                                    <button className="bg-green-600 hover:bg-green-700 text-white px-5 py-3 rounded-xl">
                                        Export Excel
                                    </button>

                                    <button className="bg-red-600 hover:bg-red-700 text-white px-5 py-3 rounded-xl">
                                        Export PDF
                                    </button>

                                </div>

                            </div>

                            {/* LIVE ACTIVITY FEED */}
                            <div className="bg-white rounded-3xl shadow-sm p-8 mt-6">

                                <div className="flex justify-between items-center mb-8">

                                    <div>
                                        <h2 className="text-2xl font-bold">
                                            Live Activity Feed
                                        </h2>

                                        <p className="text-gray-500">
                                            Real-time attendance activity across all offices
                                        </p>
                                    </div>

                                    <span className="bg-green-100 text-green-700 px-4 py-2 rounded-full font-medium">
                                        ● Live
                                    </span>

                                </div>

                                <div className="space-y-4">

                                    {/* Activity 1 */}
                                    <div className="flex items-start gap-4 border-l-4 border-green-500 bg-green-50 p-4 rounded-r-xl">

                                        <div className="bg-green-100 p-3 rounded-full">
                                            ✅
                                        </div>

                                        <div className="flex-1">
                                            <p className="font-semibold">
                                                John Ssemanda clocked in
                                            </p>

                                            <p className="text-gray-500 text-sm">
                                                Lugonjo Office • 08:03 AM
                                            </p>
                                        </div>

                                    </div>

                                    {/* Activity 2 */}
                                    <div className="flex items-start gap-4 border-l-4 border-orange-500 bg-orange-50 p-4 rounded-r-xl">

                                        <div className="bg-orange-100 p-3 rounded-full">
                                            ☕
                                        </div>

                                        <div className="flex-1">
                                            <p className="font-semibold">
                                                Sarah Nakato started lunch break
                                            </p>

                                            <p className="text-gray-500 text-sm">
                                                Kigungu Office • 01:00 PM
                                            </p>
                                        </div>

                                    </div>

                                    {/* Activity 3 */}
                                    <div className="flex items-start gap-4 border-l-4 border-blue-500 bg-blue-50 p-4 rounded-r-xl">

                                        <div className="bg-blue-100 p-3 rounded-full">
                                            🔄
                                        </div>

                                        <div className="flex-1">
                                            <p className="font-semibold">
                                                Peter Mugisha resumed work
                                            </p>

                                            <p className="text-gray-500 text-sm">
                                                Kapeeka Office • 02:02 PM
                                            </p>
                                        </div>

                                    </div>

                                    {/* Activity 4 */}
                                    <div className="flex items-start gap-4 border-l-4 border-red-500 bg-red-50 p-4 rounded-r-xl">

                                        <div className="bg-red-100 p-3 rounded-full">
                                            ❌
                                        </div>

                                        <div className="flex-1">
                                            <p className="font-semibold">
                                                David Kato marked absent
                                            </p>

                                            <p className="text-gray-500 text-sm">
                                                Mbale Office • Today
                                            </p>
                                        </div>

                                    </div>

                                    {/* Activity 5 */}
                                    <div className="flex items-start gap-4 border-l-4 border-purple-500 bg-purple-50 p-4 rounded-r-xl">

                                        <div className="bg-purple-100 p-3 rounded-full">
                                            👤
                                        </div>

                                        <div className="flex-1">
                                            <p className="font-semibold">
                                                New employee added
                                            </p>

                                            <p className="text-gray-500 text-sm">
                                                DPM-016 • Lugonjo Office
                                            </p>
                                        </div>

                                    </div>

                                </div>

                            </div>

                            {/* MONTHLY ATTENDANCE ANALYTICS */}
                            <div className="bg-white rounded-3xl shadow-sm p-8 mt-6">

                                <div className="flex justify-between items-center mb-8">

                                    <div>
                                        <h2 className="text-2xl font-bold">
                                            Monthly Attendance Analytics
                                        </h2>

                                        <p className="text-gray-500">
                                            Overview of attendance performance this month
                                        </p>
                                    </div>

                                    <select className="border rounded-xl px-4 py-2">
                                        {monthOptions.map((month) => (
                                            <option key={month}>{month}</option>
                                        ))}
                                    </select>

                                </div>

                                <div className="grid grid-cols-4 gap-5 mb-8">

                                    <div className="bg-green-50 rounded-2xl p-5">
                                        <p className="text-green-700">Present Days</p>
                                        <h3 className="text-4xl font-bold text-green-600">
                                            312
                                        </h3>
                                    </div>

                                    <div className="bg-orange-50 rounded-2xl p-5">
                                        <p className="text-orange-700">Late Arrivals</p>
                                        <h3 className="text-4xl font-bold text-orange-500">
                                            18
                                        </h3>
                                    </div>

                                    <div className="bg-red-50 rounded-2xl p-5">
                                        <p className="text-red-700">Absences</p>
                                        <h3 className="text-4xl font-bold text-red-600">
                                            7
                                        </h3>
                                    </div>

                                    <div className="bg-purple-50 rounded-2xl p-5">
                                        <p className="text-purple-700">Attendance Rate</p>
                                        <h3 className="text-4xl font-bold text-purple-600">
                                            96%
                                        </h3>
                                    </div>

                                </div>

                                {/* Simple Performance Bars */}

                                <div className="space-y-5">

                                    <div>
                                        <div className="flex justify-between mb-2">
                                            <span>Present</span>
                                            <span>96%</span>
                                        </div>

                                        <div className="bg-slate-200 h-4 rounded-full">
                                            <div className="bg-green-500 h-4 rounded-full w-[96%]"></div>
                                        </div>
                                    </div>

                                    <div>
                                        <div className="flex justify-between mb-2">
                                            <span>Late</span>
                                            <span>12%</span>
                                        </div>

                                        <div className="bg-slate-200 h-4 rounded-full">
                                            <div className="bg-orange-500 h-4 rounded-full w-[12%]"></div>
                                        </div>
                                    </div>

                                    <div>
                                        <div className="flex justify-between mb-2">
                                            <span>Absent</span>
                                            <span>4%</span>
                                        </div>

                                        <div className="bg-slate-200 h-4 rounded-full">
                                            <div className="bg-red-500 h-4 rounded-full w-[4%]"></div>
                                        </div>
                                    </div>

                                </div>

                            </div>

                            {/* TOP PERFORMERS */}
                            <div className="bg-white rounded-3xl shadow-sm p-8 mt-6">

                                <h2 className="text-2xl font-bold mb-6">
                                    Top Performing Employees
                                </h2>

                                <div className="grid grid-cols-3 gap-5">

                                    <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-6">
                                        <h3 className="font-bold text-lg">
                                            🥇 John Ssemanda
                                        </h3>

                                        <p className="text-gray-500">
                                            Attendance Rate
                                        </p>

                                        <p className="text-4xl font-bold text-yellow-600">
                                            100%
                                        </p>
                                    </div>

                                    <div className="bg-slate-50 border rounded-2xl p-6">
                                        <h3 className="font-bold text-lg">
                                            🥈 Sarah Nakato
                                        </h3>

                                        <p className="text-gray-500">
                                            Attendance Rate
                                        </p>

                                        <p className="text-4xl font-bold">
                                            98%
                                        </p>
                                    </div>

                                    <div className="bg-orange-50 border border-orange-200 rounded-2xl p-6">
                                        <h3 className="font-bold text-lg">
                                            🥉 Peter Mugisha
                                        </h3>

                                        <p className="text-gray-500">
                                            Attendance Rate
                                        </p>

                                        <p className="text-4xl font-bold text-orange-600">
                                            96%
                                        </p>
                                    </div>

                                </div>

                            </div>

                            {/* NOTIFICATIONS CENTER */}
                            <div className="bg-white rounded-3xl shadow-sm p-8 mt-6">

                                <div className="flex justify-between items-center mb-8">

                                    <div>
                                        <h2 className="text-2xl font-bold">
                                            🔔 Notifications Center
                                        </h2>

                                        <p className="text-gray-500">
                                            Important attendance and system alerts
                                        </p>
                                    </div>

                                    <span className="bg-red-100 text-red-700 px-4 py-2 rounded-full font-semibold">
                                        5 New Alerts
                                    </span>

                                </div>

                                <div className="space-y-4">

                                    {/* Late Arrival */}
                                    <div className="flex items-center gap-4 bg-orange-50 border-l-4 border-orange-500 p-4 rounded-r-xl">

                                        <div className="text-2xl">
                                            ⏰
                                        </div>

                                        <div>
                                            <p className="font-semibold">
                                                Sarah Nakato arrived late today.
                                            </p>

                                            <p className="text-sm text-gray-500">
                                                Kigungu Office • Arrived at 08:17 AM
                                            </p>
                                        </div>

                                    </div>

                                    {/* Absent Employee */}
                                    <div className="flex items-center gap-4 bg-red-50 border-l-4 border-red-500 p-4 rounded-r-xl">

                                        <div className="text-2xl">
                                            ❌
                                        </div>

                                        <div>
                                            <p className="font-semibold">
                                                David Kato is absent today.
                                            </p>

                                            <p className="text-sm text-gray-500">
                                                Mbale Office
                                            </p>
                                        </div>

                                    </div>

                                    {/* Forgot Checkout */}
                                    <div className="flex items-center gap-4 bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded-r-xl">

                                        <div className="text-2xl">
                                            ⚠️
                                        </div>

                                        <div>
                                            <p className="font-semibold">
                                                Peter Mugisha forgot to check out yesterday.
                                            </p>

                                            <p className="text-sm text-gray-500">
                                                Kapeeka Office
                                            </p>
                                        </div>

                                    </div>

                                    {/* Leave Notice */}
                                    <div className="flex items-center gap-4 bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-xl">

                                        <div className="text-2xl">
                                            📅
                                        </div>

                                        <div>
                                            <p className="font-semibold">
                                                Lydia Nambi is scheduled for leave tomorrow.
                                            </p>

                                            <p className="text-sm text-gray-500">
                                                Lugonjo Office
                                            </p>
                                        </div>

                                    </div>

                                    {/* System Alert */}
                                    <div className="flex items-center gap-4 bg-purple-50 border-l-4 border-purple-500 p-4 rounded-r-xl">

                                        <div className="text-2xl">
                                            🏢
                                        </div>

                                        <div>
                                            <p className="font-semibold">
                                                New office added successfully.
                                            </p>

                                            <p className="text-sm text-gray-500">
                                                Mbarara Office
                                            </p>
                                        </div>

                                    </div>

                                </div>

                            </div>


                            {/* Filters */}
                            <div className="grid grid-cols-5 gap-4 mb-8">

                                <select className="border rounded-xl p-3">
                                    <option>All Offices</option>
                                    <option>Lugonjo Office</option>
                                    <option>Kigungu Office</option>
                                    <option>Kapeeka Office</option>
                                    <option>Mbale Office</option>
                                </select>

                                <select className="border rounded-xl p-3">
                                    <option>All Employees</option>
                                </select>

                                <input
                                    type="date"
                                    className="border rounded-xl p-3"
                                />

                                <input
                                    type="date"
                                    className="border rounded-xl p-3"
                                />

                                <button className="bg-green-600 text-white rounded-xl">
                                    Search
                                </button>

                            </div>

                            {/* Report Table */}
                            <div className="overflow-x-auto">

                                <table className="w-full">

                                    <thead>
                                        <tr className="bg-slate-100">

                                            <th className="p-4 text-left">#</th>
                                            <th className="p-4 text-left">Employee</th>
                                            <th className="p-4 text-left">Office</th>
                                            <th className="p-4 text-left">Date</th>
                                            <th className="p-4 text-left">Clock In</th>
                                            <th className="p-4 text-left">Lunch Out</th>
                                            <th className="p-4 text-left">Lunch In</th>
                                            <th className="p-4 text-left">Clock Out</th>
                                            <th className="p-4 text-left">Status</th>

                                        </tr>
                                    </thead>

                                    <tbody>

                                        <tr className="border-b hover:bg-slate-50">
                                            <td className="p-4">1</td>
                                            <td className="p-4">John Ssemanda</td>
                                            <td className="p-4">Lugonjo Office</td>
                                            <td className="p-4">13 Jun 2026</td>
                                            <td className="p-4">08:03 AM</td>
                                            <td className="p-4">01:01 PM</td>
                                            <td className="p-4">02:02 PM</td>
                                            <td className="p-4">05:04 PM</td>
                                            <td className="p-4 text-green-600 font-semibold">
                                                On Time
                                            </td>
                                        </tr>

                                        <tr className="border-b hover:bg-slate-50">
                                            <td className="p-4">2</td>
                                            <td className="p-4">Sarah Nakato</td>
                                            <td className="p-4">Kigungu Office</td>
                                            <td className="p-4">13 Jun 2026</td>
                                            <td className="p-4">08:17 AM</td>
                                            <td className="p-4">01:00 PM</td>
                                            <td className="p-4">02:01 PM</td>
                                            <td className="p-4">05:02 PM</td>
                                            <td className="p-4 text-orange-500 font-semibold">
                                                Late
                                            </td>
                                        </tr>

                                        <tr className="hover:bg-slate-50">
                                            <td className="p-4">3</td>
                                            <td className="p-4">David Kato</td>
                                            <td className="p-4">Mbale Office</td>
                                            <td className="p-4">13 Jun 2026</td>
                                            <td className="p-4">--</td>
                                            <td className="p-4">--</td>
                                            <td className="p-4">--</td>
                                            <td className="p-4">--</td>
                                            <td className="p-4 text-red-600 font-semibold">
                                                Absent
                                            </td>
                                        </tr>

                                    </tbody>

                                </table>

                            </div>

                        </div>

                    </div>

                </div>

            </main>

        </div>
    );
}
