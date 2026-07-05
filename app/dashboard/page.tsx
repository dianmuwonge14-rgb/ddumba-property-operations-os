import {
    LogIn,
    LogOut,
    Coffee,
    TimerReset,
    User,
    Calendar,
    Building2,
    Clock3,
    BarChart3
} from "lucide-react";

<img
    src="/ddumba-logo.png"
    alt="Ddumba Property Management"
    className="h-64 object-contain"
/>

export default function Dashboard() {

    const currentTime = new Date().toLocaleTimeString();

    return (
        <main className="min-h-screen bg-slate-100 p-6">
            <div className="max-w-7xl mx-auto space-y-6">

                {/* TOP SECTION */}
                <div className="bg-white rounded-3xl shadow-sm p-8 flex justify-between items-center">

                    {/* Left Side */}
                    <div className="flex flex-col items-center">
                        <img
                            src="/ddumba-logo.png"
                            alt="Ddumba Property Management"
                            className="h-56 object-contain"
                        />

                        <h1 className="text-4xl font-bold text-slate-900 -mt-4">
                            Welcome Back
                        </h1>
                    </div>

                    <div className="grid grid-cols-5 gap-4">

                        {/* Present */}
                        <div className="bg-green-50 rounded-2xl shadow-sm p-6 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 border border-green-100">
                            <div className="text-3xl mb-2">✅</div>
                            <p className="text-green-700 text-sm font-medium">Present</p>
                            <h2 className="text-4xl font-bold text-green-600">24</h2>
                        </div>

                        {/* Late */}
                        <div className="bg-orange-50 rounded-2xl shadow-sm p-6 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 border border-orange-100">
                            <div className="text-3xl mb-2">⏰</div>
                            <p className="text-orange-700 text-sm font-medium">Late</p>
                            <h2 className="text-4xl font-bold text-orange-500">2</h2>
                        </div>

                        {/* Absent */}
                        <div className="bg-red-50 rounded-2xl shadow-sm p-6 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 border border-red-100">
                            <div className="text-3xl mb-2">❌</div>
                            <p className="text-red-700 text-sm font-medium">Absent</p>
                            <h2 className="text-4xl font-bold text-red-600">1</h2>
                        </div>

                        {/* Hours */}
                        <div className="bg-blue-50 rounded-2xl shadow-sm p-6 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 border border-blue-100">
                            <div className="text-3xl mb-2">🕒</div>
                            <p className="text-blue-700 text-sm font-medium">Hours</p>
                            <h2 className="text-4xl font-bold text-blue-600">186</h2>
                        </div>

                        {/* Rate */}
                        <div className="bg-purple-50 rounded-2xl shadow-sm p-6 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 border border-purple-100">
                            <div className="text-3xl mb-2">📈</div>
                            <p className="text-purple-700 text-sm font-medium">Rate</p>
                            <h2 className="text-4xl font-bold text-purple-600">96%</h2>
                        </div>

                    </div>

                    {/* Right Side */}
                    <div className="space-y-6 w-[320px] pl-8 border-l border-slate-200">

                        {/* Employee */}
                        <div className="flex items-center gap-4">
                            <div className="bg-blue-50 p-3 rounded-xl">
                                <User size={24} className="text-blue-600" />
                            </div>

                            <div>
                                <p className="text-2xl font-bold text-slate-900">
                                    John Ssemanda
                                </p>

                                <div className="inline-flex items-center bg-slate-100 px-3 py-1 rounded-full mt-1">
                                    <span className="text-xs font-semibold text-slate-600 tracking-wide">
                                        ID: DPM-001
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Date */}
                        <div className="flex items-center gap-4">
                            <div className="bg-green-50 p-3 rounded-xl">
                                <Calendar size={24} className="text-green-600" />
                            </div>

                            <span className="text-lg text-gray-700">
                                13 Jun 2026
                            </span>
                        </div>

                        {/* Office */}
                        <div className="flex items-center gap-4">
                            <div className="bg-purple-50 p-3 rounded-xl">
                                <Building2 size={24} className="text-purple-600" />
                            </div>

                            <span className="text-lg text-gray-700">
                                Lugonjo Office
                            </span>
                        </div>

                        {/* Live Clock */}
                        <div className="flex items-center gap-4">
                            <div className="bg-orange-50 p-3 rounded-xl">
                                <Clock3 size={24} className="text-orange-600" />
                            </div>

                            <span className="text-xl font-bold text-green-600">
                                {currentTime}
                            </span>
                        </div>

                    </div>
                </div>

                {/* MIDDLE SECTION */}
                <div className="grid md:grid-cols-2 gap-6">

                    {/* Attendance Actions */}
                    <div className="bg-white rounded-3xl shadow-sm p-8">

                        <h2 className="text-3xl font-bold flex items-center gap-3 mb-8">
                            ⏱️ Attendance Actions
                        </h2>

                        <div className="space-y-5">

                            {/* CHECK IN */}
                            <button className="w-full bg-gradient-to-r from-green-500 to-green-600 text-white rounded-2xl p-6 flex items-center justify-between shadow-md hover:shadow-xl hover:scale-[1.02] transition-all duration-300">

                                <div className="flex items-center gap-4">
                                    <div className="bg-white/20 p-3 rounded-xl text-2xl">
                                        ↪️
                                    </div>

                                    <div className="text-left">
                                        <p className="text-2xl font-bold">
                                            CHECK IN
                                        </p>

                                        <p className="text-green-100 text-sm">
                                            Start your workday
                                        </p>
                                    </div>
                                </div>

                                <span className="text-green-100">
                                    Available
                                </span>

                            </button>

                            {/* START BREAK */}
                            <button className="w-full bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-2xl p-6 flex items-center justify-between shadow-md hover:shadow-xl hover:scale-[1.02] transition-all duration-300">

                                <div className="flex items-center gap-4">
                                    <div className="bg-white/20 p-3 rounded-xl text-2xl">
                                        ☕
                                    </div>

                                    <div className="text-left">
                                        <p className="text-2xl font-bold">
                                            START BREAK
                                        </p>

                                        <p className="text-orange-100 text-sm">
                                            Begin lunch or break
                                        </p>
                                    </div>
                                </div>

                                <span className="text-orange-100">
                                    Waiting
                                </span>

                            </button>

                            {/* END BREAK */}
                            <button className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-2xl p-6 flex items-center justify-between shadow-md hover:shadow-xl hover:scale-[1.02] transition-all duration-300">

                                <div className="flex items-center gap-4">
                                    <div className="bg-white/20 p-3 rounded-xl text-2xl">
                                        🔄
                                    </div>

                                    <div className="text-left">
                                        <p className="text-2xl font-bold">
                                            END BREAK
                                        </p>

                                        <p className="text-blue-100 text-sm">
                                            Resume working
                                        </p>
                                    </div>
                                </div>

                                <span className="text-blue-100">
                                    Waiting
                                </span>

                            </button>

                            {/* CHECK OUT */}
                            <button className="w-full bg-gradient-to-r from-red-500 to-red-600 text-white rounded-2xl p-6 flex items-center justify-between shadow-md hover:shadow-xl hover:scale-[1.02] transition-all duration-300">

                                <div className="flex items-center gap-4">
                                    <div className="bg-white/20 p-3 rounded-xl text-2xl">
                                        🚪
                                    </div>

                                    <div className="text-left">
                                        <p className="text-2xl font-bold">
                                            CHECK OUT
                                        </p>

                                        <p className="text-red-100 text-sm">
                                            End your workday
                                        </p>
                                    </div>
                                </div>

                                <span className="text-red-100">
                                    Waiting
                                </span>

                            </button>

                        </div>

                    </div>

                    {/* Today's Attendance */}
                    <div className="bg-white rounded-3xl shadow-sm p-8">

                        {/* Header */}
                        <h2 className="text-3xl font-bold flex items-center gap-3 mb-8">
                            📅 Today&apos;s Attendance
                        </h2>

                        {/* Check In */}
                        <div className="flex justify-between items-center border-b py-4">
                            <div className="flex items-center gap-3">
                                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                                <span className="text-lg">Check In</span>
                            </div>

                            <span className="font-semibold text-lg">
                                --:--
                            </span>
                        </div>

                        {/* Start Break */}
                        <div className="flex justify-between items-center border-b py-4">
                            <div className="flex items-center gap-3">
                                <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                                <span className="text-lg">Start Break</span>
                            </div>

                            <span className="font-semibold text-lg">
                                --:--
                            </span>
                        </div>

                        {/* End Break */}
                        <div className="flex justify-between items-center border-b py-4">
                            <div className="flex items-center gap-3">
                                <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                                <span className="text-lg">End Break</span>
                            </div>

                            <span className="font-semibold text-lg">
                                --:--
                            </span>
                        </div>

                        {/* Check Out */}
                        <div className="flex justify-between items-center border-b py-4">
                            <div className="flex items-center gap-3">
                                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                                <span className="text-lg">Check Out</span>
                            </div>

                            <span className="font-semibold text-lg">
                                --:--
                            </span>
                        </div>

                        {/* Status */}
                        <div className="flex justify-between items-center py-6">
                            <span className="text-xl font-semibold">
                                Status
                            </span>

                            <span className="bg-red-100 text-red-700 px-5 py-2 rounded-full font-semibold">
                                Not Checked In
                            </span>
                        </div>

                        {/* Total Hours */}
                        <div className="border-t pt-5">
                            <div className="flex justify-between items-center">
                                <span className="text-gray-500 font-medium">
                                    Total Hours Today
                                </span>

                                <span className="text-2xl font-bold text-green-600">
                                    00h 00m
                                </span>
                            </div>
                        </div>

                    </div>
                </div>

                {/* RECENT ATTENDANCE */}
                <div className="bg-white rounded-3xl shadow-sm p-8">

                    {/* Header */}
                    <div className="flex justify-between items-center mb-8">
                        <h2 className="text-3xl font-bold flex items-center gap-3">
                            📊 Recent Attendance
                        </h2>

                        <button className="bg-green-600 hover:bg-green-700 text-white px-5 py-3 rounded-xl font-medium transition-all duration-300">
                            View Full History
                        </button>
                    </div>

                    {/* Weekly Summary */}
                    <div className="grid grid-cols-3 gap-4 mb-8">

                        <div className="bg-green-50 border border-green-100 rounded-2xl p-5">
                            <p className="text-sm text-green-700 font-medium">
                                Days This Week
                            </p>
                            <h3 className="text-3xl font-bold text-green-600">
                                5
                            </h3>
                        </div>

                        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
                            <p className="text-sm text-blue-700 font-medium">
                                Avg Check In
                            </p>
                            <h3 className="text-3xl font-bold text-blue-600">
                                08:02
                            </h3>
                        </div>

                        <div className="bg-purple-50 border border-purple-100 rounded-2xl p-5">
                            <p className="text-sm text-purple-700 font-medium">
                                Avg Hours
                            </p>
                            <h3 className="text-3xl font-bold text-purple-600">
                                9.2h
                            </h3>
                        </div>

                    </div>

                    {/* Attendance Table */}
                    <div className="overflow-x-auto">

                        <table className="w-full">

                            <thead>
                                <tr className="bg-slate-100 text-slate-700">

                                    <th className="text-left p-4 rounded-l-xl">
                                        Date
                                    </th>

                                    <th className="text-left p-4">
                                        Check In
                                    </th>

                                    <th className="text-left p-4">
                                        Check Out
                                    </th>

                                    <th className="text-left p-4">
                                        Hours
                                    </th>

                                    <th className="text-left p-4 rounded-r-xl">
                                        Status
                                    </th>

                                </tr>
                            </thead>

                            <tbody>

                                <tr className="border-b hover:bg-green-50 transition-all">
                                    <td className="p-4">📅 12 Jun 2026 (Fri)</td>
                                    <td className="p-4">08:02 AM</td>
                                    <td className="p-4">05:31 PM</td>
                                    <td className="p-4 font-semibold">9h 29m</td>
                                    <td className="p-4">
                                        <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-medium">
                                            Present
                                        </span>
                                    </td>
                                </tr>

                                <tr className="border-b hover:bg-green-50 transition-all">
                                    <td className="p-4">📅 11 Jun 2026 (Thu)</td>
                                    <td className="p-4">08:01 AM</td>
                                    <td className="p-4">05:29 PM</td>
                                    <td className="p-4 font-semibold">9h 28m</td>
                                    <td className="p-4">
                                        <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-medium">
                                            Present
                                        </span>
                                    </td>
                                </tr>

                                <tr className="border-b hover:bg-green-50 transition-all">
                                    <td className="p-4">📅 10 Jun 2026 (Wed)</td>
                                    <td className="p-4">08:03 AM</td>
                                    <td className="p-4">05:30 PM</td>
                                    <td className="p-4 font-semibold">9h 27m</td>
                                    <td className="p-4">
                                        <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-medium">
                                            Present
                                        </span>
                                    </td>
                                </tr>

                                <tr className="border-b hover:bg-orange-50 transition-all">
                                    <td className="p-4">📅 09 Jun 2026 (Tue)</td>
                                    <td className="p-4">08:15 AM</td>
                                    <td className="p-4">05:28 PM</td>
                                    <td className="p-4 font-semibold">9h 13m</td>
                                    <td className="p-4">
                                        <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-sm font-medium">
                                            Late
                                        </span>
                                    </td>
                                </tr>

                                <tr className="hover:bg-green-50 transition-all">
                                    <td className="p-4">📅 06 Jun 2026 (Sat)</td>
                                    <td className="p-4">08:04 AM</td>
                                    <td className="p-4">05:32 PM</td>
                                    <td className="p-4 font-semibold">9h 28m</td>
                                    <td className="p-4">
                                        <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-medium">
                                            Present
                                        </span>
                                    </td>
                                </tr>

                            </tbody>

                        </table>

                    </div>

                </div>

            </div>
        </main>
    );
}
