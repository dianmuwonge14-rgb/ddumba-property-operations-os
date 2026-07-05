export default function SettingsPage() {
    return (
        <main className="min-h-screen bg-slate-50 p-6">
            <div className="max-w-7xl mx-auto">

                {/* HEADER */}
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900">
                            System Settings
                        </h1>

                        <p className="text-slate-500 mt-1">
                            Configure company, offices, attendance, payroll, security,
                            notifications, AI services and integrations.
                        </p>
                    </div>

                    <div className="flex gap-3 mt-4 lg:mt-0">
                        <button className="px-5 py-3 rounded-xl border bg-white hover:bg-slate-100">
                            Create Backup
                        </button>

                        <button className="px-5 py-3 rounded-xl border bg-white hover:bg-slate-100">
                            Export Settings
                        </button>

                        <button className="px-6 py-3 rounded-xl bg-green-600 text-white hover:bg-green-700">
                            Save Changes
                        </button>
                    </div>
                </div>

                <div className="grid xl:grid-cols-3 gap-6">

                    {/* MAIN CONTENT */}
                    <div className="xl:col-span-2 space-y-6">

                        {/* ORGANISATION COMMAND CENTRE */}

                        <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">

                            {/* HEADER */}

                            <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-800 p-6">

                                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">

                                    <div>

                                        <h2 className="text-3xl font-bold text-white">
                                            Organisation Command Centre
                                        </h2>

                                        <p className="text-blue-100 mt-1">
                                            Manage company identity, compliance, operations and platform health.
                                        </p>

                                    </div>

                                    <div className="flex gap-2">

                                        <span className="px-4 py-2 rounded-xl bg-emerald-500/20 text-emerald-100 text-sm font-medium">
                                            ● Operational
                                        </span>

                                        <span className="px-4 py-2 rounded-xl bg-blue-500/20 text-blue-100 text-sm font-medium">
                                            Enterprise Plan
                                        </span>

                                    </div>

                                </div>

                            </div>

                            <div className="p-6 space-y-8">

                                {/* EXECUTIVE DASHBOARD */}

                                <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">

                                    <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Organisation Health</p>
                                        <h3 className="text-3xl font-bold text-blue-700 mt-2">98%</h3>
                                        <p className="text-xs text-blue-600 mt-2">
                                            Excellent
                                        </p>
                                    </div>

                                    <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Employees</p>
                                        <h3 className="text-3xl font-bold text-emerald-700 mt-2">18</h3>
                                        <p className="text-xs text-emerald-600 mt-2">
                                            Across all offices
                                        </p>
                                    </div>

                                    <div className="bg-purple-50 border border-purple-100 rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Properties Managed</p>
                                        <h3 className="text-3xl font-bold text-purple-700 mt-2">152</h3>
                                        <p className="text-xs text-purple-600 mt-2">
                                            Active portfolio
                                        </p>
                                    </div>

                                    <div className="bg-orange-50 border border-orange-100 rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Attendance Rate</p>
                                        <h3 className="text-3xl font-bold text-orange-700 mt-2">98%</h3>
                                        <p className="text-xs text-orange-600 mt-2">
                                            Last 30 days
                                        </p>
                                    </div>

                                </div>

                                {/* LIVE SERVICES */}

                                <div className="border rounded-3xl p-5">

                                    <div className="flex items-center justify-between mb-5">

                                        <h3 className="font-bold text-lg">
                                            Connected Services
                                        </h3>

                                        <button className="text-blue-600 font-medium text-sm">
                                            View Integrations
                                        </button>

                                    </div>

                                    <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">

                                        <div className="flex items-center justify-between p-4 bg-green-50 rounded-2xl border">
                                            <span>WhatsApp</span>
                                            <span className="text-green-600 font-semibold">
                                                Connected
                                            </span>
                                        </div>

                                        <div className="flex items-center justify-between p-4 bg-green-50 rounded-2xl border">
                                            <span>Email</span>
                                            <span className="text-green-600 font-semibold">
                                                Connected
                                            </span>
                                        </div>

                                        <div className="flex items-center justify-between p-4 bg-green-50 rounded-2xl border">
                                            <span>AI Engine</span>
                                            <span className="text-green-600 font-semibold">
                                                Active
                                            </span>
                                        </div>

                                        <div className="flex items-center justify-between p-4 bg-green-50 rounded-2xl border">
                                            <span>Backups</span>
                                            <span className="text-green-600 font-semibold">
                                                Running
                                            </span>
                                        </div>

                                    </div>

                                </div>

                                {/* COMPANY PROFILE */}

                                <div className="border rounded-3xl p-6 bg-slate-50">

                                    <div className="flex flex-col lg:flex-row gap-5 items-center">

                                        <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white text-3xl font-bold">
                                            DP
                                        </div>

                                        <div className="flex-1">

                                            <h3 className="text-2xl font-bold">
                                                Ddumba Property Management
                                            </h3>

                                            <p className="text-slate-500">
                                                Enterprise Workforce & Property Operations Platform
                                            </p>

                                            <div className="flex flex-wrap gap-2 mt-3">

                                                <span className="px-3 py-1 rounded-full bg-green-100 text-green-700 text-sm">
                                                    Verified Organisation
                                                </span>

                                                <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-sm">
                                                    5 Active Offices
                                                </span>

                                            </div>

                                        </div>

                                        <button className="px-5 py-3 rounded-xl bg-blue-600 text-white hover:bg-blue-700">
                                            Upload Logo
                                        </button>

                                    </div>

                                </div>

                                {/* COMPANY IDENTITY */}

                                <div>

                                    <h3 className="font-bold text-xl mb-5">
                                        Company Identity
                                    </h3>

                                    <div className="grid md:grid-cols-2 gap-4">

                                        <input className="w-full border rounded-xl p-3" placeholder="Company Name" />
                                        <input className="w-full border rounded-xl p-3" placeholder="Trading Name" />
                                        <input className="w-full border rounded-xl p-3" placeholder="Registration Number" />
                                        <input className="w-full border rounded-xl p-3" placeholder="TIN Number" />
                                        <input className="w-full border rounded-xl p-3" placeholder="Company Classification" />
                                        <input className="w-full border rounded-xl p-3" placeholder="Industry" />

                                    </div>

                                </div>

                                {/* CONTACT CENTRE */}

                                <div>

                                    <h3 className="font-bold text-xl mb-5">
                                        Contact Centre
                                    </h3>

                                    <div className="grid md:grid-cols-2 gap-4">

                                        <input className="w-full border rounded-xl p-3" placeholder="Company Email" />
                                        <input className="w-full border rounded-xl p-3" placeholder="Support Email" />
                                        <input className="w-full border rounded-xl p-3" placeholder="Primary Phone" />
                                        <input className="w-full border rounded-xl p-3" placeholder="Alternative Phone" />
                                        <input className="w-full border rounded-xl p-3 md:col-span-2" placeholder="Website" />

                                    </div>

                                </div>

                                {/* REGIONAL CONFIGURATION */}

                                <div>

                                    <h3 className="font-bold text-xl mb-5">
                                        Regional Configuration
                                    </h3>

                                    <div className="grid md:grid-cols-3 gap-4">

                                        <select className="border rounded-xl p-3">
                                            <option>Country</option>
                                            <option>Uganda</option>
                                        </select>

                                        <select className="border rounded-xl p-3">
                                            <option>Currency</option>
                                            <option>UGX</option>
                                            <option>USD</option>
                                        </select>

                                        <select className="border rounded-xl p-3">
                                            <option>Timezone</option>
                                            <option>Africa/Kampala</option>
                                        </select>

                                    </div>

                                </div>

                                {/* EXECUTIVE ACTIONS */}

                                <div className="border-t pt-6">

                                    <h3 className="font-bold text-xl mb-5">
                                        Executive Actions
                                    </h3>

                                    <div className="flex flex-wrap gap-3">

                                        <button className="px-5 py-3 bg-slate-900 text-white rounded-xl">
                                            Generate Executive Report
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            Export Company Profile
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            View Audit History
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            Open Analytics
                                        </button>

                                    </div>

                                </div>

                            </div>

                        </div>

                        {/* Offices */}
                        {/* MULTI OFFICE COMMAND CENTRE */}

                        <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">

                            {/* HEADER */}

                            <div className="bg-gradient-to-r from-emerald-700 via-green-700 to-teal-800 p-6">

                                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">

                                    <div>

                                        <h2 className="text-3xl font-bold text-white">
                                            Multi Office Command Centre
                                        </h2>

                                        <p className="text-emerald-100 mt-1">
                                            Manage branches, workforce distribution, geofence zones and operational performance.
                                        </p>

                                    </div>

                                    <div className="flex flex-wrap gap-2">

                                        <span className="px-4 py-2 rounded-xl bg-white/20 text-white text-sm">
                                            5 Active Offices
                                        </span>

                                        <span className="px-4 py-2 rounded-xl bg-white/20 text-white text-sm">
                                            152 Properties
                                        </span>

                                    </div>

                                </div>

                            </div>

                            <div className="p-6">

                                {/* EXECUTIVE OVERVIEW */}

                                <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-5">

                                    <div className="bg-emerald-50 border border-emerald-100 rounded-3xl p-5">

                                        <p className="text-sm text-slate-500">
                                            Active Offices
                                        </p>

                                        <h3 className="text-4xl font-bold text-emerald-700 mt-2">
                                            5
                                        </h3>

                                        <p className="text-sm text-emerald-600 mt-2">
                                            All offices operational
                                        </p>

                                    </div>

                                    <div className="bg-blue-50 border border-blue-100 rounded-3xl p-5">

                                        <p className="text-sm text-slate-500">
                                            Employees
                                        </p>

                                        <h3 className="text-4xl font-bold text-blue-700 mt-2">
                                            18
                                        </h3>

                                        <p className="text-sm text-blue-600 mt-2">
                                            Across all branches
                                        </p>

                                    </div>

                                    <div className="bg-purple-50 border border-purple-100 rounded-3xl p-5">

                                        <p className="text-sm text-slate-500">
                                            Properties Managed
                                        </p>

                                        <h3 className="text-4xl font-bold text-purple-700 mt-2">
                                            152
                                        </h3>

                                        <p className="text-sm text-purple-600 mt-2">
                                            Active portfolio
                                        </p>

                                    </div>

                                    <div className="bg-orange-50 border border-orange-100 rounded-3xl p-5">

                                        <p className="text-sm text-slate-500">
                                            Attendance Rate
                                        </p>

                                        <h3 className="text-4xl font-bold text-orange-700 mt-2">
                                            98%
                                        </h3>

                                        <p className="text-sm text-orange-600 mt-2">
                                            Last 30 days
                                        </p>

                                    </div>

                                </div>

                                {/* BRANCH HEALTH */}

                                <div className="mt-6 grid md:grid-cols-3 gap-5">

                                    <div className="border rounded-3xl p-5">

                                        <p className="text-sm text-slate-500">
                                            Occupancy Rate
                                        </p>

                                        <h3 className="text-3xl font-bold mt-2">
                                            94%
                                        </h3>

                                        <p className="text-green-600 text-sm mt-2">
                                            +3.2% this month
                                        </p>

                                    </div>

                                    <div className="border rounded-3xl p-5">

                                        <p className="text-sm text-slate-500">
                                            Rent Collection
                                        </p>

                                        <h3 className="text-3xl font-bold mt-2">
                                            92%
                                        </h3>

                                        <p className="text-green-600 text-sm mt-2">
                                            UGX 48.5M collected
                                        </p>

                                    </div>

                                    <div className="border rounded-3xl p-5">

                                        <p className="text-sm text-slate-500">
                                            Geofence Compliance
                                        </p>

                                        <h3 className="text-3xl font-bold mt-2">
                                            99%
                                        </h3>

                                        <p className="text-green-600 text-sm mt-2">
                                            Excellent
                                        </p>

                                    </div>

                                </div>

                            </div>

                        </div>
                        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6">

                            <div>

                                <h3 className="text-2xl font-bold">
                                    Branch Portfolio
                                </h3>

                                <p className="text-slate-500">
                                    Performance overview across all operational offices.
                                </p>

                            </div>

                            <div className="flex gap-3 mt-4 lg:mt-0">

                                <button className="px-5 py-3 rounded-xl border hover:bg-slate-50">
                                    Export Portfolio
                                </button>

                                <button className="px-5 py-3 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700">
                                    Add Office
                                </button>

                            </div>

                        </div>

                        <div className="grid xl:grid-cols-2 gap-6">

                            {/* ENTEBBE OFFICE */}

                            <div className="border rounded-3xl p-6 hover:shadow-xl transition-all">

                                <div className="flex justify-between items-start">

                                    <div>

                                        <h4 className="text-xl font-bold">
                                            Entebbe Main Office
                                        </h4>

                                        <p className="text-slate-500">
                                            Lugonjo, Entebbe
                                        </p>

                                    </div>

                                    <span className="px-3 py-1 rounded-full bg-green-100 text-green-700 text-sm font-medium">
                                        Active
                                    </span>

                                </div>

                                {/* KPIs */}

                                <div className="grid grid-cols-2 gap-4 mt-6">

                                    <div className="bg-slate-50 rounded-2xl p-4">
                                        <p className="text-xs text-slate-500">Employees</p>
                                        <h5 className="text-2xl font-bold">8</h5>
                                    </div>

                                    <div className="bg-slate-50 rounded-2xl p-4">
                                        <p className="text-xs text-slate-500">Properties</p>
                                        <h5 className="text-2xl font-bold">64</h5>
                                    </div>

                                    <div className="bg-slate-50 rounded-2xl p-4">
                                        <p className="text-xs text-slate-500">Inspectors</p>
                                        <h5 className="text-2xl font-bold">2</h5>
                                    </div>

                                    <div className="bg-slate-50 rounded-2xl p-4">
                                        <p className="text-xs text-slate-500">Field Agents</p>
                                        <h5 className="text-2xl font-bold">2</h5>
                                    </div>

                                </div>

                                {/* PERFORMANCE */}

                                <div className="mt-6 border-t pt-5 space-y-3">

                                    <div className="flex justify-between">
                                        <span>Attendance Rate</span>
                                        <span className="font-bold text-green-600">99%</span>
                                    </div>

                                    <div className="flex justify-between">
                                        <span>Occupancy Rate</span>
                                        <span className="font-bold">96%</span>
                                    </div>

                                    <div className="flex justify-between">
                                        <span>Outstanding Rent</span>
                                        <span className="font-bold">UGX 1.2M</span>
                                    </div>

                                    <div className="flex justify-between">
                                        <span>Geofence Compliance</span>
                                        <span className="font-bold text-green-600">100%</span>
                                    </div>

                                </div>

                                {/* ACTIONS */}

                                <div className="flex flex-wrap gap-2 mt-6">

                                    <button className="px-4 py-2 bg-blue-600 text-white rounded-xl">
                                        Analytics
                                    </button>

                                    <button className="px-4 py-2 border rounded-xl">
                                        Employees
                                    </button>

                                    <button className="px-4 py-2 border rounded-xl">
                                        Properties
                                    </button>

                                    <button className="px-4 py-2 border rounded-xl">
                                        Settings
                                    </button>

                                </div>

                            </div>

                            {/* KAMPALA OFFICE */}

                            <div className="border rounded-3xl p-6 hover:shadow-xl transition-all">

                                <div className="flex justify-between items-start">

                                    <div>

                                        <h4 className="text-xl font-bold">
                                            Kampala Office
                                        </h4>

                                        <p className="text-slate-500">
                                            Kampala Central
                                        </p>

                                    </div>

                                    <span className="px-3 py-1 rounded-full bg-green-100 text-green-700 text-sm font-medium">
                                        Active
                                    </span>

                                </div>

                                <div className="grid grid-cols-2 gap-4 mt-6">

                                    <div className="bg-slate-50 rounded-2xl p-4">
                                        <p className="text-xs text-slate-500">Employees</p>
                                        <h5 className="text-2xl font-bold">6</h5>
                                    </div>

                                    <div className="bg-slate-50 rounded-2xl p-4">
                                        <p className="text-xs text-slate-500">Properties</p>
                                        <h5 className="text-2xl font-bold">51</h5>
                                    </div>

                                    <div className="bg-slate-50 rounded-2xl p-4">
                                        <p className="text-xs text-slate-500">Inspectors</p>
                                        <h5 className="text-2xl font-bold">1</h5>
                                    </div>

                                    <div className="bg-slate-50 rounded-2xl p-4">
                                        <p className="text-xs text-slate-500">Field Agents</p>
                                        <h5 className="text-2xl font-bold">1</h5>
                                    </div>

                                </div>

                                <div className="mt-6 border-t pt-5 space-y-3">

                                    <div className="flex justify-between">
                                        <span>Attendance Rate</span>
                                        <span className="font-bold text-green-600">97%</span>
                                    </div>

                                    <div className="flex justify-between">
                                        <span>Occupancy Rate</span>
                                        <span className="font-bold">92%</span>
                                    </div>

                                    <div className="flex justify-between">
                                        <span>Outstanding Rent</span>
                                        <span className="font-bold">UGX 850K</span>
                                    </div>

                                    <div className="flex justify-between">
                                        <span>Geofence Compliance</span>
                                        <span className="font-bold text-green-600">99%</span>
                                    </div>

                                </div>

                                <div className="flex flex-wrap gap-2 mt-6">

                                    <button className="px-4 py-2 bg-blue-600 text-white rounded-xl">
                                        Analytics
                                    </button>

                                    <button className="px-4 py-2 border rounded-xl">
                                        Employees
                                    </button>

                                    <button className="px-4 py-2 border rounded-xl">
                                        Properties
                                    </button>

                                    <button className="px-4 py-2 border rounded-xl">
                                        Settings
                                    </button>

                                </div>

                            </div>

                        </div>
                        <div className="flex items-center justify-between mb-6">

                            <div>

                                <h3 className="text-2xl font-bold">
                                    Office Configuration & Geofence Intelligence
                                </h3>

                                <p className="text-slate-500">
                                    Configure branch settings, attendance zones, GPS restrictions and office hierarchy.
                                </p>

                            </div>

                            <button className="px-5 py-3 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700">
                                Save Configuration
                            </button>

                        </div>

                        <div className="grid xl:grid-cols-2 gap-6">

                            {/* OFFICE DETAILS */}

                            <div className="border rounded-3xl p-6">

                                <h4 className="font-bold text-lg mb-5">
                                    Office Details
                                </h4>

                                <div className="grid gap-4">

                                    <input
                                        className="border rounded-xl p-3"
                                        placeholder="Office Name"
                                    />

                                    <input
                                        className="border rounded-xl p-3"
                                        placeholder="Office Code"
                                    />

                                    <select className="border rounded-xl p-3">
                                        <option>Branch Type</option>
                                        <option>Head Office</option>
                                        <option>Regional Office</option>
                                        <option>Field Office</option>
                                    </select>

                                    <input
                                        className="border rounded-xl p-3"
                                        placeholder="Region"
                                    />

                                    <input
                                        className="border rounded-xl p-3"
                                        placeholder="Office Manager"
                                    />

                                    <input
                                        className="border rounded-xl p-3"
                                        placeholder="Office Phone"
                                    />

                                    <input
                                        className="border rounded-xl p-3"
                                        placeholder="Office Email"
                                    />

                                    <input
                                        className="border rounded-xl p-3"
                                        placeholder="Office Address"
                                    />

                                </div>

                            </div>

                            {/* GPS & GEOFENCE */}

                            <div className="border rounded-3xl p-6">

                                <h4 className="font-bold text-lg mb-5">
                                    Geofence Intelligence
                                </h4>

                                <div className="grid gap-4">

                                    <input
                                        className="border rounded-xl p-3"
                                        placeholder="Latitude"
                                    />

                                    <input
                                        className="border rounded-xl p-3"
                                        placeholder="Longitude"
                                    />

                                    <input
                                        className="border rounded-xl p-3"
                                        placeholder="Geofence Radius (Meters)"
                                    />

                                    <select className="border rounded-xl p-3">
                                        <option>GPS Accuracy Requirement</option>
                                        <option>10 Meters</option>
                                        <option>20 Meters</option>
                                        <option>50 Meters</option>
                                    </select>

                                </div>

                                <div className="mt-6 space-y-4">

                                    <label className="flex justify-between items-center">
                                        <span>Require GPS Attendance</span>
                                        <input type="checkbox" defaultChecked />
                                    </label>

                                    <label className="flex justify-between items-center">
                                        <span>Block Remote Check-In</span>
                                        <input type="checkbox" defaultChecked />
                                    </label>

                                    <label className="flex justify-between items-center">
                                        <span>Allow Admin Override</span>
                                        <input type="checkbox" />
                                    </label>

                                    <label className="flex justify-between items-center">
                                        <span>Track Location During Shift</span>
                                        <input type="checkbox" defaultChecked />
                                    </label>

                                </div>

                            </div>

                        </div>

                        {/* GEOFENCE HEALTH */}

                        <div className="grid md:grid-cols-3 gap-5 mt-6">

                            <div className="border rounded-3xl p-5">

                                <p className="text-sm text-slate-500">
                                    Protected Offices
                                </p>

                                <h4 className="text-3xl font-bold mt-2">
                                    5
                                </h4>

                                <p className="text-green-600 text-sm mt-2">
                                    All branches protected
                                </p>

                            </div>

                            <div className="border rounded-3xl p-5">

                                <p className="text-sm text-slate-500">
                                    GPS Compliance
                                </p>

                                <h4 className="text-3xl font-bold mt-2">
                                    99%
                                </h4>

                                <p className="text-green-600 text-sm mt-2">
                                    Excellent
                                </p>

                            </div>

                            <div className="border rounded-3xl p-5">

                                <p className="text-sm text-slate-500">
                                    Blocked Attempts
                                </p>

                                <h4 className="text-3xl font-bold mt-2">
                                    17
                                </h4>

                                <p className="text-orange-600 text-sm mt-2">
                                    This month
                                </p>

                            </div>

                        </div>
                        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6">

                            <div>

                                <h3 className="text-2xl font-bold">
                                    Workforce Allocation & Office Hierarchy
                                </h3>

                                <p className="text-slate-500">
                                    Manage staffing levels, office leadership and workforce distribution across branches.
                                </p>

                            </div>

                            <button className="px-5 py-3 rounded-xl bg-blue-600 text-white hover:bg-blue-700">
                                Allocate Workforce
                            </button>

                        </div>

                        {/* WORKFORCE OVERVIEW */}

                        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-5 mb-6">

                            <div className="border rounded-3xl p-5 bg-blue-50">
                                <p className="text-sm text-slate-500">Employees</p>
                                <h4 className="text-3xl font-bold mt-2">18</h4>
                            </div>

                            <div className="border rounded-3xl p-5 bg-purple-50">
                                <p className="text-sm text-slate-500">Inspectors</p>
                                <h4 className="text-3xl font-bold mt-2">3</h4>
                            </div>

                            <div className="border rounded-3xl p-5 bg-emerald-50">
                                <p className="text-sm text-slate-500">Field Agents</p>
                                <h4 className="text-3xl font-bold mt-2">4</h4>
                            </div>

                            <div className="border rounded-3xl p-5 bg-orange-50">
                                <p className="text-sm text-slate-500">Office Managers</p>
                                <h4 className="text-3xl font-bold mt-2">5</h4>
                            </div>

                        </div>

                        <div className="grid xl:grid-cols-2 gap-6">

                            {/* OFFICE HIERARCHY */}

                            <div className="border rounded-3xl p-6">

                                <h4 className="font-bold text-lg mb-5">
                                    Office Leadership Structure
                                </h4>

                                <div className="space-y-4">

                                    <div className="border rounded-2xl p-4">

                                        <div className="flex justify-between">

                                            <div>
                                                <h5 className="font-semibold">
                                                    Entebbe Office
                                                </h5>
                                                <p className="text-sm text-slate-500">
                                                    Branch Manager: Sarah Namugenyi
                                                </p>
                                            </div>

                                            <span className="text-green-600 font-medium">
                                                Active
                                            </span>

                                        </div>

                                    </div>

                                    <div className="border rounded-2xl p-4">

                                        <div className="flex justify-between">

                                            <div>
                                                <h5 className="font-semibold">
                                                    Kampala Office
                                                </h5>
                                                <p className="text-sm text-slate-500">
                                                    Branch Manager: David Kato
                                                </p>
                                            </div>

                                            <span className="text-green-600 font-medium">
                                                Active
                                            </span>

                                        </div>

                                    </div>

                                </div>

                            </div>

                            {/* STAFF ASSIGNMENT */}

                            <div className="border rounded-3xl p-6">

                                <h4 className="font-bold text-lg mb-5">
                                    Workforce Assignment
                                </h4>

                                <div className="grid gap-4">

                                    <select className="border rounded-xl p-3">
                                        <option>Select Office</option>
                                    </select>

                                    <select className="border rounded-xl p-3">
                                        <option>Assign Manager</option>
                                    </select>

                                    <select className="border rounded-xl p-3">
                                        <option>Assign Inspector</option>
                                    </select>

                                    <select className="border rounded-xl p-3">
                                        <option>Assign Field Agent</option>
                                    </select>

                                    <select className="border rounded-xl p-3">
                                        <option>Assign Accountant</option>
                                    </select>

                                </div>

                            </div>

                        </div>

                        {/* STAFFING HEALTH */}

                        <div className="grid md:grid-cols-3 gap-5 mt-6">

                            <div className="border rounded-3xl p-5">

                                <p className="text-sm text-slate-500">
                                    Staffing Capacity
                                </p>

                                <h4 className="text-3xl font-bold mt-2">
                                    91%
                                </h4>

                                <p className="text-green-600 text-sm mt-2">
                                    Well staffed
                                </p>

                            </div>

                            <div className="border rounded-3xl p-5">

                                <p className="text-sm text-slate-500">
                                    Inspector Coverage
                                </p>

                                <h4 className="text-3xl font-bold mt-2">
                                    100%
                                </h4>

                                <p className="text-green-600 text-sm mt-2">
                                    All branches covered
                                </p>

                            </div>

                            <div className="border rounded-3xl p-5">

                                <p className="text-sm text-slate-500">
                                    Field Agent Coverage
                                </p>

                                <h4 className="text-3xl font-bold mt-2">
                                    95%
                                </h4>

                                <p className="text-orange-600 text-sm mt-2">
                                    1 vacancy remaining
                                </p>

                            </div>

                        </div>
                        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6">

                            <div>

                                <h3 className="text-2xl font-bold">
                                    Branch Analytics & Performance Intelligence
                                </h3>

                                <p className="text-slate-500">
                                    Real-time branch performance, attendance intelligence and operational insights.
                                </p>

                            </div>

                            <div className="flex gap-3 mt-4 lg:mt-0">

                                <button className="px-5 py-3 border rounded-xl">
                                    Export Analytics
                                </button>

                                <button className="px-5 py-3 bg-indigo-600 text-white rounded-xl">
                                    Generate Executive Report
                                </button>

                            </div>

                        </div>

                        {/* PERFORMANCE KPIs */}

                        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-5">

                            <div className="bg-indigo-50 border rounded-3xl p-5">

                                <p className="text-sm text-slate-500">
                                    Average Attendance
                                </p>

                                <h4 className="text-4xl font-bold text-indigo-700 mt-2">
                                    98%
                                </h4>

                                <p className="text-green-600 text-sm mt-2">
                                    +2.1% this month
                                </p>

                            </div>

                            <div className="bg-emerald-50 border rounded-3xl p-5">

                                <p className="text-sm text-slate-500">
                                    Rent Collection
                                </p>

                                <h4 className="text-4xl font-bold text-emerald-700 mt-2">
                                    92%
                                </h4>

                                <p className="text-green-600 text-sm mt-2">
                                    UGX 48.5M collected
                                </p>

                            </div>

                            <div className="bg-purple-50 border rounded-3xl p-5">

                                <p className="text-sm text-slate-500">
                                    Occupancy Rate
                                </p>

                                <h4 className="text-4xl font-bold text-purple-700 mt-2">
                                    94%
                                </h4>

                                <p className="text-green-600 text-sm mt-2">
                                    Strong performance
                                </p>

                            </div>

                            <div className="bg-orange-50 border rounded-3xl p-5">

                                <p className="text-sm text-slate-500">
                                    Productivity Index
                                </p>

                                <h4 className="text-4xl font-bold text-orange-700 mt-2">
                                    89%
                                </h4>

                                <p className="text-orange-600 text-sm mt-2">
                                    Needs improvement
                                </p>

                            </div>

                        </div>

                        {/* OFFICE RANKINGS */}

                        <div className="border rounded-3xl p-6 mt-6">

                            <div className="flex items-center justify-between mb-5">

                                <h4 className="font-bold text-xl">
                                    Office Performance Rankings
                                </h4>

                                <span className="text-sm text-slate-500">
                                    Updated live
                                </span>

                            </div>

                            <div className="space-y-4">

                                <div className="flex justify-between items-center border rounded-2xl p-4">

                                    <div>
                                        <h5 className="font-semibold">
                                            🥇 Entebbe Office
                                        </h5>
                                        <p className="text-sm text-slate-500">
                                            Attendance 99% • Occupancy 96%
                                        </p>
                                    </div>

                                    <span className="font-bold text-green-600">
                                        Score 98
                                    </span>

                                </div>

                                <div className="flex justify-between items-center border rounded-2xl p-4">

                                    <div>
                                        <h5 className="font-semibold">
                                            🥈 Kampala Office
                                        </h5>
                                        <p className="text-sm text-slate-500">
                                            Attendance 97% • Occupancy 92%
                                        </p>
                                    </div>

                                    <span className="font-bold text-blue-600">
                                        Score 95
                                    </span>

                                </div>

                                <div className="flex justify-between items-center border rounded-2xl p-4">

                                    <div>
                                        <h5 className="font-semibold">
                                            🥉 Mukono Office
                                        </h5>
                                        <p className="text-sm text-slate-500">
                                            Attendance 95% • Occupancy 90%
                                        </p>
                                    </div>

                                    <span className="font-bold text-orange-600">
                                        Score 91
                                    </span>

                                </div>

                            </div>

                        </div>

                        {/* AI INSIGHTS */}

                        <div className="border rounded-3xl p-6 mt-6 bg-gradient-to-r from-indigo-50 to-purple-50">

                            <div className="flex items-center justify-between mb-5">

                                <h4 className="font-bold text-xl">
                                    AI Performance Insights
                                </h4>

                                <span className="px-3 py-1 rounded-full bg-purple-100 text-purple-700 text-sm">
                                    AI Active
                                </span>

                            </div>

                            <div className="space-y-4">

                                <div className="border rounded-2xl p-4 bg-white">

                                    <h5 className="font-semibold">
                                        Attendance Trend
                                    </h5>

                                    <p className="text-slate-600 mt-2">
                                        Attendance improved by 2.1% across all branches over the last 30 days.
                                    </p>

                                </div>

                                <div className="border rounded-2xl p-4 bg-white">

                                    <h5 className="font-semibold">
                                        Staffing Recommendation
                                    </h5>

                                    <p className="text-slate-600 mt-2">
                                        Mukono Office may require one additional field agent to maintain service levels.
                                    </p>

                                </div>

                                <div className="border rounded-2xl p-4 bg-white">

                                    <h5 className="font-semibold">
                                        Revenue Opportunity
                                    </h5>

                                    <p className="text-slate-600 mt-2">
                                        Improving occupancy by 3% could increase monthly rental revenue significantly.
                                    </p>

                                </div>

                            </div>

                        </div>
                        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6">

                            <div>

                                <h3 className="text-2xl font-bold">
                                    Branch Operations & Executive Actions
                                </h3>

                                <p className="text-slate-500">
                                    Launch reports, audits, reviews and branch-wide operational tasks.
                                </p>

                            </div>

                            <button className="px-5 py-3 rounded-xl bg-slate-900 text-white hover:bg-slate-800">
                                Executive Dashboard
                            </button>

                        </div>

                        {/* OPERATIONS GRID */}

                        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-5">

                            <button className="border rounded-3xl p-6 text-left hover:shadow-lg transition">

                                <div className="text-4xl mb-4">
                                    📊
                                </div>

                                <h4 className="font-bold text-lg">
                                    Branch Performance Report
                                </h4>

                                <p className="text-slate-500 mt-2">
                                    Generate detailed office performance analytics.
                                </p>

                            </button>

                            <button className="border rounded-3xl p-6 text-left hover:shadow-lg transition">

                                <div className="text-4xl mb-4">
                                    👥
                                </div>

                                <h4 className="font-bold text-lg">
                                    Workforce Audit
                                </h4>

                                <p className="text-slate-500 mt-2">
                                    Review staffing levels and workforce allocation.
                                </p>

                            </button>

                            <button className="border rounded-3xl p-6 text-left hover:shadow-lg transition">

                                <div className="text-4xl mb-4">
                                    📍
                                </div>

                                <h4 className="font-bold text-lg">
                                    Geofence Audit
                                </h4>

                                <p className="text-slate-500 mt-2">
                                    Verify GPS compliance and attendance security.
                                </p>

                            </button>

                            <button className="border rounded-3xl p-6 text-left hover:shadow-lg transition">

                                <div className="text-4xl mb-4">
                                    🏢
                                </div>

                                <h4 className="font-bold text-lg">
                                    Office Review
                                </h4>

                                <p className="text-slate-500 mt-2">
                                    Conduct branch-level operational reviews.
                                </p>

                            </button>

                        </div>

                        {/* EXECUTIVE ACTIONS */}

                        <div className="border rounded-3xl p-6 mt-6">

                            <h4 className="font-bold text-xl mb-5">
                                Executive Actions
                            </h4>

                            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">

                                <button className="px-5 py-4 bg-blue-600 text-white rounded-2xl hover:bg-blue-700">
                                    Generate Executive Report
                                </button>

                                <button className="px-5 py-4 bg-emerald-600 text-white rounded-2xl hover:bg-emerald-700">
                                    Export Branch Data
                                </button>

                                <button className="px-5 py-4 bg-purple-600 text-white rounded-2xl hover:bg-purple-700">
                                    Run AI Analysis
                                </button>

                                <button className="px-5 py-4 border rounded-2xl hover:bg-slate-50">
                                    Office Ranking Review
                                </button>

                                <button className="px-5 py-4 border rounded-2xl hover:bg-slate-50">
                                    Property Distribution Report
                                </button>

                                <button className="px-5 py-4 border rounded-2xl hover:bg-slate-50">
                                    Rent Collection Review
                                </button>

                            </div>

                        </div>

                        {/* SYSTEM STATUS */}

                        <div className="grid md:grid-cols-3 gap-5 mt-6">

                            <div className="border rounded-3xl p-5 bg-green-50">

                                <p className="text-sm text-slate-500">
                                    Branch Status
                                </p>

                                <h4 className="text-3xl font-bold text-green-700 mt-2">
                                    Healthy
                                </h4>

                                <p className="text-green-600 text-sm mt-2">
                                    All offices operational
                                </p>

                            </div>

                            <div className="border rounded-3xl p-5 bg-blue-50">

                                <p className="text-sm text-slate-500">
                                    AI Monitoring
                                </p>

                                <h4 className="text-3xl font-bold text-blue-700 mt-2">
                                    Active
                                </h4>

                                <p className="text-blue-600 text-sm mt-2">
                                    Real-time analytics enabled
                                </p>

                            </div>

                            <div className="border rounded-3xl p-5 bg-purple-50">

                                <p className="text-sm text-slate-500">
                                    Compliance Score
                                </p>

                                <h4 className="text-3xl font-bold text-purple-700 mt-2">
                                    97%
                                </h4>

                                <p className="text-purple-600 text-sm mt-2">
                                    Excellent compliance
                                </p>

                            </div>

                        </div>
                        {/* HEADER */}

                        <div className="bg-gradient-to-r from-indigo-700 via-purple-700 to-indigo-900 p-6">

                            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">

                                <div>

                                    <h2 className="text-3xl font-bold text-white">
                                        Role & Permission Command Centre
                                    </h2>

                                    <p className="text-indigo-100 mt-1">
                                        Manage user access, approval chains, permissions and office authority levels.
                                    </p>

                                </div>

                                <div className="flex gap-2">

                                    <span className="px-4 py-2 rounded-xl bg-white/20 text-white text-sm">
                                        8 Active Roles
                                    </span>

                                    <span className="px-4 py-2 rounded-xl bg-white/20 text-white text-sm">
                                        18 Users
                                    </span>

                                </div>

                            </div>

                        </div>

                        <div className="p-6 space-y-8">

                            {/* SECURITY OVERVIEW */}

                            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-5">

                                <div className="bg-indigo-50 border rounded-3xl p-5">
                                    <p className="text-sm text-slate-500">
                                        Active Roles
                                    </p>
                                    <h3 className="text-4xl font-bold text-indigo-700 mt-2">
                                        8
                                    </h3>
                                </div>

                                <div className="bg-green-50 border rounded-3xl p-5">
                                    <p className="text-sm text-slate-500">
                                        Permission Groups
                                    </p>
                                    <h3 className="text-4xl font-bold text-green-700 mt-2">
                                        24
                                    </h3>
                                </div>

                                <div className="bg-orange-50 border rounded-3xl p-5">
                                    <p className="text-sm text-slate-500">
                                        Pending Approvals
                                    </p>
                                    <h3 className="text-4xl font-bold text-orange-700 mt-2">
                                        3
                                    </h3>
                                </div>

                                <div className="bg-purple-50 border rounded-3xl p-5">
                                    <p className="text-sm text-slate-500">
                                        Security Score
                                    </p>
                                    <h3 className="text-4xl font-bold text-purple-700 mt-2">
                                        97%
                                    </h3>
                                </div>

                            </div>

                            {/* ROLE DIRECTORY */}

                            <div className="border rounded-3xl p-6">

                                <div className="flex justify-between items-center mb-5">

                                    <h3 className="font-bold text-xl">
                                        System Roles
                                    </h3>

                                    <button className="px-5 py-3 bg-indigo-600 text-white rounded-xl">
                                        Create Role
                                    </button>

                                </div>

                                <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">

                                    <div className="border rounded-2xl p-4">
                                        <h4 className="font-bold">Super Admin</h4>
                                        <p className="text-sm text-slate-500 mt-2">
                                            Full system access
                                        </p>
                                    </div>

                                    <div className="border rounded-2xl p-4">
                                        <h4 className="font-bold">Director</h4>
                                        <p className="text-sm text-slate-500 mt-2">
                                            Executive oversight
                                        </p>
                                    </div>

                                    <div className="border rounded-2xl p-4">
                                        <h4 className="font-bold">Office Manager</h4>
                                        <p className="text-sm text-slate-500 mt-2">
                                            Branch operations
                                        </p>
                                    </div>

                                    <div className="border rounded-2xl p-4">
                                        <h4 className="font-bold">Property Inspector</h4>
                                        <p className="text-sm text-slate-500 mt-2">
                                            Inspection management
                                        </p>
                                    </div>

                                </div>

                            </div>

                            {/* PERMISSION MATRIX */}

                            <div className="border rounded-3xl p-6">

                                <h3 className="font-bold text-xl mb-5">
                                    Permission Matrix
                                </h3>

                                <div className="overflow-x-auto">

                                    <table className="w-full">

                                        <thead>

                                            <tr className="border-b">

                                                <th className="text-left py-3">Permission</th>
                                                <th>Admin</th>
                                                <th>Director</th>
                                                <th>Manager</th>
                                                <th>Inspector</th>

                                            </tr>

                                        </thead>

                                        <tbody>

                                            <tr className="border-b">
                                                <td className="py-3">Manage Offices</td>
                                                <td>✅</td>
                                                <td>✅</td>
                                                <td>✅</td>
                                                <td>❌</td>
                                            </tr>

                                            <tr className="border-b">
                                                <td className="py-3">Manage Payroll</td>
                                                <td>✅</td>
                                                <td>✅</td>
                                                <td>❌</td>
                                                <td>❌</td>
                                            </tr>

                                            <tr className="border-b">
                                                <td className="py-3">View Reports</td>
                                                <td>✅</td>
                                                <td>✅</td>
                                                <td>✅</td>
                                                <td>✅</td>
                                            </tr>

                                        </tbody>

                                    </table>

                                </div>

                            </div>

                        </div>

                        {/* Attendance */}
                        {/* HEADER */}

                        <div className="bg-gradient-to-r from-cyan-700 via-blue-700 to-indigo-800 p-6">

                            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">

                                <div>

                                    <h2 className="text-3xl font-bold text-white">
                                        Attendance Control Centre
                                    </h2>

                                    <p className="text-cyan-100 mt-1">
                                        Configure attendance policies, monitor compliance and manage workforce attendance intelligence.
                                    </p>

                                </div>

                                <div className="flex gap-2">

                                    <span className="px-4 py-2 rounded-xl bg-white/20 text-white text-sm">
                                        Attendance 98%
                                    </span>

                                    <span className="px-4 py-2 rounded-xl bg-white/20 text-white text-sm">
                                        18 Employees
                                    </span>

                                </div>

                            </div>

                        </div>

                        <div className="p-6 space-y-8">

                            {/* ATTENDANCE OVERVIEW */}

                            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-5">

                                <div className="bg-cyan-50 border rounded-3xl p-5">

                                    <p className="text-sm text-slate-500">
                                        Attendance Rate
                                    </p>

                                    <h3 className="text-4xl font-bold text-cyan-700 mt-2">
                                        98%
                                    </h3>

                                </div>

                                <div className="bg-green-50 border rounded-3xl p-5">

                                    <p className="text-sm text-slate-500">
                                        Present Today
                                    </p>

                                    <h3 className="text-4xl font-bold text-green-700 mt-2">
                                        17
                                    </h3>

                                </div>

                                <div className="bg-orange-50 border rounded-3xl p-5">

                                    <p className="text-sm text-slate-500">
                                        Late Employees
                                    </p>

                                    <h3 className="text-4xl font-bold text-orange-700 mt-2">
                                        1
                                    </h3>

                                </div>

                                <div className="bg-red-50 border rounded-3xl p-5">

                                    <p className="text-sm text-slate-500">
                                        Absent Today
                                    </p>

                                    <h3 className="text-4xl font-bold text-red-700 mt-2">
                                        0
                                    </h3>

                                </div>

                            </div>

                            {/* ATTENDANCE RULES */}

                            <div className="border rounded-3xl p-6">

                                <h3 className="font-bold text-xl mb-5">
                                    Attendance Rules
                                </h3>

                                <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">

                                    <input
                                        className="border rounded-xl p-3"
                                        placeholder="Work Start Time"
                                    />

                                    <input
                                        className="border rounded-xl p-3"
                                        placeholder="Work End Time"
                                    />

                                    <input
                                        className="border rounded-xl p-3"
                                        placeholder="Grace Period (Minutes)"
                                    />

                                    <input
                                        className="border rounded-xl p-3"
                                        placeholder="Minimum Hours"
                                    />

                                </div>

                            </div>

                            {/* CLOCKING SETTINGS */}

                            <div className="border rounded-3xl p-6">

                                <h3 className="font-bold text-xl mb-5">
                                    Clocking Controls
                                </h3>

                                <div className="space-y-4">

                                    <label className="flex justify-between">
                                        <span>Require Clock In</span>
                                        <input type="checkbox" defaultChecked />
                                    </label>

                                    <label className="flex justify-between">
                                        <span>Require Lunch Out</span>
                                        <input type="checkbox" defaultChecked />
                                    </label>

                                    <label className="flex justify-between">
                                        <span>Require Lunch In</span>
                                        <input type="checkbox" defaultChecked />
                                    </label>

                                    <label className="flex justify-between">
                                        <span>Require Clock Out</span>
                                        <input type="checkbox" defaultChecked />
                                    </label>

                                </div>

                            </div>

                            {/* AI ATTENDANCE INSIGHTS */}

                            <div className="border rounded-3xl p-6 bg-gradient-to-r from-cyan-50 to-blue-50">

                                <div className="flex justify-between items-center mb-5">

                                    <h3 className="font-bold text-xl">
                                        AI Attendance Insights
                                    </h3>

                                    <span className="px-3 py-1 bg-blue-100 rounded-full text-blue-700 text-sm">
                                        AI Active
                                    </span>

                                </div>

                                <div className="space-y-4">

                                    <div className="bg-white border rounded-2xl p-4">

                                        <h4 className="font-semibold">
                                            Attendance Trend
                                        </h4>

                                        <p className="text-slate-600 mt-2">
                                            Attendance improved by 2.4% over the last month.
                                        </p>

                                    </div>

                                    <div className="bg-white border rounded-2xl p-4">

                                        <h4 className="font-semibold">
                                            Late Arrival Prediction
                                        </h4>

                                        <p className="text-slate-600 mt-2">
                                            One employee is showing a recurring late-arrival pattern.
                                        </p>

                                    </div>

                                </div>

                            </div>

                            {/* EXECUTIVE ACTIONS */}

                            <div className="border-t pt-6">

                                <h3 className="font-bold text-xl mb-5">
                                    Attendance Operations
                                </h3>

                                <div className="flex flex-wrap gap-3">

                                    <button className="px-5 py-3 bg-cyan-600 text-white rounded-xl">
                                        Generate Attendance Report
                                    </button>

                                    <button className="px-5 py-3 border rounded-xl">
                                        Export Attendance Data
                                    </button>

                                    <button className="px-5 py-3 border rounded-xl">
                                        Attendance Audit
                                    </button>

                                    <button className="px-5 py-3 border rounded-xl">
                                        View Attendance Trends
                                    </button>

                                </div>

                            </div>

                        </div>

                        {/* WORK SCHEDULE CENTRE */}

                        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">

                            {/* HEADER */}

                            <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-800 p-6">

                                <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">

                                    <div>

                                        <h2 className="text-3xl font-bold text-white">
                                            Work Schedule Centre
                                        </h2>

                                        <p className="text-blue-100 mt-2">
                                            Configure shifts, working hours, attendance policies and workforce scheduling.
                                        </p>

                                    </div>

                                    <div className="flex flex-wrap gap-2">

                                        <div className="px-4 py-2 bg-white/20 rounded-xl text-white text-sm">
                                            5 Offices
                                        </div>

                                        <div className="px-4 py-2 bg-white/20 rounded-xl text-white text-sm">
                                            12 Active Shifts
                                        </div>

                                        <div className="px-4 py-2 bg-white/20 rounded-xl text-white text-sm">
                                            Enterprise Scheduling
                                        </div>

                                    </div>

                                </div>

                            </div>

                            <div className="p-6 space-y-6">

                                {/* OVERVIEW */}

                                <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">

                                    <div className="bg-blue-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Active Shifts</p>
                                        <h3 className="text-3xl font-bold text-blue-700 mt-2">12</h3>
                                    </div>

                                    <div className="bg-green-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Employees Scheduled</p>
                                        <h3 className="text-3xl font-bold text-green-700 mt-2">18</h3>
                                    </div>

                                    <div className="bg-orange-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Weekly Hours</p>
                                        <h3 className="text-3xl font-bold text-orange-700 mt-2">48</h3>
                                    </div>

                                    <div className="bg-purple-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Compliance</p>
                                        <h3 className="text-3xl font-bold text-purple-700 mt-2">99%</h3>
                                    </div>

                                </div>

                                {/* SHIFT CONFIGURATION */}

                                <div className="border rounded-3xl p-6">

                                    <div className="flex justify-between items-center mb-6">

                                        <h3 className="font-bold text-xl">
                                            Shift Configuration
                                        </h3>

                                        <button className="px-5 py-3 bg-indigo-600 text-white rounded-xl">
                                            Create Shift
                                        </button>

                                    </div>

                                    <div className="grid md:grid-cols-2 gap-4">

                                        <input
                                            className="border rounded-xl p-3"
                                            placeholder="Shift Name"
                                        />

                                        <select className="border rounded-xl p-3">
                                            <option>Select Office</option>
                                        </select>

                                        <input
                                            type="time"
                                            className="border rounded-xl p-3"
                                        />

                                        <input
                                            type="time"
                                            className="border rounded-xl p-3"
                                        />

                                        <input
                                            className="border rounded-xl p-3"
                                            placeholder="Break Duration (Minutes)"
                                        />

                                        <input
                                            className="border rounded-xl p-3"
                                            placeholder="Grace Period (Minutes)"
                                        />

                                    </div>

                                </div>

                                {/* WORKING DAYS */}

                                <div className="border rounded-3xl p-6">

                                    <h3 className="font-bold text-xl mb-6">
                                        Working Days
                                    </h3>

                                    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">

                                        <button className="p-4 rounded-xl bg-green-100 text-green-700 font-semibold">
                                            Monday
                                        </button>

                                        <button className="p-4 rounded-xl bg-green-100 text-green-700 font-semibold">
                                            Tuesday
                                        </button>

                                        <button className="p-4 rounded-xl bg-green-100 text-green-700 font-semibold">
                                            Wednesday
                                        </button>

                                        <button className="p-4 rounded-xl bg-green-100 text-green-700 font-semibold">
                                            Thursday
                                        </button>

                                        <button className="p-4 rounded-xl bg-green-100 text-green-700 font-semibold">
                                            Friday
                                        </button>

                                        <button className="p-4 rounded-xl bg-slate-100 text-slate-500 font-semibold">
                                            Saturday
                                        </button>

                                        <button className="p-4 rounded-xl bg-slate-100 text-slate-500 font-semibold">
                                            Sunday
                                        </button>

                                    </div>

                                </div>

                                {/* SCHEDULE POLICIES */}

                                <div className="border rounded-3xl p-6">

                                    <h3 className="font-bold text-xl mb-6">
                                        Scheduling Policies
                                    </h3>

                                    <div className="space-y-4">

                                        <label className="flex justify-between">
                                            <span>Allow Flexible Hours</span>
                                            <input type="checkbox" />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Enforce Shift Start Time</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Require Shift Approval</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Auto Assign Schedules</span>
                                            <input type="checkbox" />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Enable Rotational Shifts</span>
                                            <input type="checkbox" />
                                        </label>

                                    </div>

                                </div>

                                {/* LIVE SHIFTS */}

                                <div className="border rounded-3xl p-6">

                                    <h3 className="font-bold text-xl mb-6">
                                        Active Shift Templates
                                    </h3>

                                    <div className="space-y-4">

                                        <div className="border rounded-2xl p-4 flex justify-between">

                                            <div>
                                                <h4 className="font-semibold">
                                                    Standard Office Shift
                                                </h4>

                                                <p className="text-sm text-slate-500">
                                                    08:00 AM - 05:00 PM
                                                </p>
                                            </div>

                                            <span className="text-green-600 font-semibold">
                                                Active
                                            </span>

                                        </div>

                                        <div className="border rounded-2xl p-4 flex justify-between">

                                            <div>
                                                <h4 className="font-semibold">
                                                    Field Operations Shift
                                                </h4>

                                                <p className="text-sm text-slate-500">
                                                    07:00 AM - 06:00 PM
                                                </p>
                                            </div>

                                            <span className="text-green-600 font-semibold">
                                                Active
                                            </span>

                                        </div>

                                    </div>

                                </div>

                                {/* AI INSIGHTS */}

                                <div className="border rounded-3xl p-6 bg-gradient-to-r from-blue-50 to-indigo-50">

                                    <h3 className="font-bold text-xl mb-5">
                                        AI Workforce Intelligence
                                    </h3>

                                    <div className="space-y-4">

                                        <div className="bg-white border rounded-2xl p-4">

                                            <h4 className="font-semibold">
                                                Scheduling Insight
                                            </h4>

                                            <p className="text-slate-600 mt-2">
                                                Peak attendance occurs between 8:00 AM and 9:00 AM across all offices.
                                            </p>

                                        </div>

                                        <div className="bg-white border rounded-2xl p-4">

                                            <h4 className="font-semibold">
                                                Optimization Recommendation
                                            </h4>

                                            <p className="text-slate-600 mt-2">
                                                Consider staggered shifts for field agents to improve coverage and reduce travel congestion.
                                            </p>

                                        </div>

                                    </div>

                                </div>

                                {/* ACTIONS */}

                                <div className="border-t pt-6">

                                    <div className="flex flex-wrap gap-3">

                                        <button className="px-5 py-3 bg-indigo-600 text-white rounded-xl">
                                            Save Schedules
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            Shift Calendar
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            Schedule Report
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            Workforce Planning
                                        </button>

                                    </div>

                                </div>

                            </div>

                        </div>


                        {/* GEOFENCE CONTROL CENTRE */}

                        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">

                            {/* HEADER */}

                            <div className="bg-gradient-to-r from-emerald-700 via-teal-700 to-cyan-800 p-6">

                                <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">

                                    <div>

                                        <h2 className="text-3xl font-bold text-white">
                                            Geofence Control Centre
                                        </h2>

                                        <p className="text-emerald-100 mt-2">
                                            Manage office geofences, attendance boundaries, GPS validation and anti-fraud controls.
                                        </p>

                                    </div>

                                    <div className="flex flex-wrap gap-2">

                                        <div className="px-4 py-2 bg-white/20 rounded-xl text-white text-sm">
                                            5 Offices
                                        </div>

                                        <div className="px-4 py-2 bg-white/20 rounded-xl text-white text-sm">
                                            GPS Protected
                                        </div>

                                        <div className="px-4 py-2 bg-white/20 rounded-xl text-white text-sm">
                                            Live Monitoring
                                        </div>

                                    </div>

                                </div>

                            </div>

                            <div className="p-6 space-y-6">

                                {/* OVERVIEW */}

                                <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">

                                    <div className="bg-emerald-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Active Geofences</p>
                                        <h3 className="text-3xl font-bold text-emerald-700 mt-2">5</h3>
                                    </div>

                                    <div className="bg-blue-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">GPS Check-ins Today</p>
                                        <h3 className="text-3xl font-bold text-blue-700 mt-2">187</h3>
                                    </div>

                                    <div className="bg-orange-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Rejected Attempts</p>
                                        <h3 className="text-3xl font-bold text-orange-700 mt-2">6</h3>
                                    </div>

                                    <div className="bg-purple-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">GPS Accuracy</p>
                                        <h3 className="text-3xl font-bold text-purple-700 mt-2">99%</h3>
                                    </div>

                                </div>

                                {/* OFFICE GEOFENCES */}

                                <div className="border rounded-3xl p-6">

                                    <div className="flex justify-between items-center mb-6">

                                        <h3 className="font-bold text-xl">
                                            Office Geofences
                                        </h3>

                                        <button className="px-5 py-3 bg-emerald-600 text-white rounded-xl">
                                            Add Geofence
                                        </button>

                                    </div>

                                    <div className="space-y-4">

                                        <div className="border rounded-2xl p-5 flex justify-between items-center">

                                            <div>
                                                <h4 className="font-bold">
                                                    Kampala Head Office
                                                </h4>

                                                <p className="text-sm text-slate-500">
                                                    Radius: 100m
                                                </p>
                                            </div>

                                            <span className="px-3 py-1 rounded-full bg-green-100 text-green-700">
                                                Active
                                            </span>

                                        </div>

                                        <div className="border rounded-2xl p-5 flex justify-between items-center">

                                            <div>
                                                <h4 className="font-bold">
                                                    Entebbe Office
                                                </h4>

                                                <p className="text-sm text-slate-500">
                                                    Radius: 150m
                                                </p>
                                            </div>

                                            <span className="px-3 py-1 rounded-full bg-green-100 text-green-700">
                                                Active
                                            </span>

                                        </div>

                                    </div>

                                </div>

                                {/* GEOFENCE SETTINGS */}

                                <div className="border rounded-3xl p-6">

                                    <h3 className="font-bold text-xl mb-6">
                                        GPS Security Policies
                                    </h3>

                                    <div className="space-y-4">

                                        <label className="flex justify-between">
                                            <span>Require GPS Verification</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Block GPS Spoofing</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Block Mock Locations</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Require High Accuracy GPS</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Allow Field Agent Overrides</span>
                                            <input type="checkbox" />
                                        </label>

                                    </div>

                                </div>

                                {/* LIVE EVENTS */}

                                <div className="border rounded-3xl p-6">

                                    <h3 className="font-bold text-xl mb-6">
                                        Geofence Activity Feed
                                    </h3>

                                    <div className="space-y-4">

                                        <div className="border-l-4 border-green-500 bg-slate-50 p-4 rounded-r-xl">
                                            Employee clocked in within Kampala geofence.
                                        </div>

                                        <div className="border-l-4 border-orange-500 bg-slate-50 p-4 rounded-r-xl">
                                            GPS check-in rejected outside Entebbe office boundary.
                                        </div>

                                        <div className="border-l-4 border-blue-500 bg-slate-50 p-4 rounded-r-xl">
                                            New geofence radius updated by administrator.
                                        </div>

                                    </div>

                                </div>

                                {/* AI INSIGHTS */}

                                <div className="border rounded-3xl p-6 bg-gradient-to-r from-emerald-50 to-cyan-50">

                                    <h3 className="font-bold text-xl mb-5">
                                        AI Geofence Intelligence
                                    </h3>

                                    <div className="space-y-4">

                                        <div className="bg-white border rounded-2xl p-4">

                                            <h4 className="font-semibold">
                                                Attendance Analysis
                                            </h4>

                                            <p className="text-slate-600 mt-2">
                                                Most rejected attendance attempts occur within 200 metres of office boundaries.
                                            </p>

                                        </div>

                                        <div className="bg-white border rounded-2xl p-4">

                                            <h4 className="font-semibold">
                                                Security Recommendation
                                            </h4>

                                            <p className="text-slate-600 mt-2">
                                                Increase Kampala office radius from 100m to 120m to reduce false rejections.
                                            </p>

                                        </div>

                                    </div>

                                </div>

                                {/* ACTIONS */}

                                <div className="border-t pt-6">

                                    <div className="flex flex-wrap gap-3">

                                        <button className="px-5 py-3 bg-emerald-600 text-white rounded-xl">
                                            Save Geofences
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            View Map
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            Activity Logs
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            Export Report
                                        </button>

                                    </div>

                                </div>

                            </div>

                        </div>


                        {/* PUBLIC HOLIDAY MANAGEMENT CENTRE */}

                        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">

                            {/* HEADER */}

                            <div className="bg-gradient-to-r from-rose-700 via-pink-700 to-fuchsia-800 p-6">

                                <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">

                                    <div>

                                        <h2 className="text-3xl font-bold text-white">
                                            Public Holiday Management Centre
                                        </h2>

                                        <p className="text-pink-100 mt-2">
                                            Manage national holidays, office closures, special working days and payroll holiday policies.
                                        </p>

                                    </div>

                                    <div className="flex flex-wrap gap-2">

                                        <div className="px-4 py-2 bg-white/20 rounded-xl text-white text-sm">
                                            15 Holidays
                                        </div>

                                        <div className="px-4 py-2 bg-white/20 rounded-xl text-white text-sm">
                                            Auto Sync
                                        </div>

                                        <div className="px-4 py-2 bg-white/20 rounded-xl text-white text-sm">
                                            Payroll Linked
                                        </div>

                                    </div>

                                </div>

                            </div>

                            <div className="p-6 space-y-6">

                                {/* OVERVIEW */}

                                <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">

                                    <div className="bg-pink-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">National Holidays</p>
                                        <h3 className="text-3xl font-bold text-pink-700 mt-2">15</h3>
                                    </div>

                                    <div className="bg-green-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Upcoming</p>
                                        <h3 className="text-3xl font-bold text-green-700 mt-2">3</h3>
                                    </div>

                                    <div className="bg-orange-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Office Closures</p>
                                        <h3 className="text-3xl font-bold text-orange-700 mt-2">2</h3>
                                    </div>

                                    <div className="bg-purple-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Holiday Overtime</p>
                                        <h3 className="text-3xl font-bold text-purple-700 mt-2">2.5x</h3>
                                    </div>

                                </div>

                                {/* HOLIDAY REGISTRY */}

                                <div className="border rounded-3xl p-6">

                                    <div className="flex justify-between items-center mb-6">

                                        <h3 className="font-bold text-xl">
                                            Holiday Registry
                                        </h3>

                                        <button className="px-5 py-3 bg-pink-600 text-white rounded-xl">
                                            Add Holiday
                                        </button>

                                    </div>

                                    <div className="space-y-4">

                                        <div className="border rounded-2xl p-4 flex justify-between">
                                            <div>
                                                <h4 className="font-semibold">
                                                    Independence Day
                                                </h4>
                                                <p className="text-sm text-slate-500">
                                                    9 October
                                                </p>
                                            </div>

                                            <span className="text-green-600 font-semibold">
                                                Active
                                            </span>
                                        </div>

                                        <div className="border rounded-2xl p-4 flex justify-between">
                                            <div>
                                                <h4 className="font-semibold">
                                                    Christmas Day
                                                </h4>
                                                <p className="text-sm text-slate-500">
                                                    25 December
                                                </p>
                                            </div>

                                            <span className="text-green-600 font-semibold">
                                                Active
                                            </span>
                                        </div>

                                    </div>

                                </div>

                                {/* HOLIDAY RULES */}

                                <div className="border rounded-3xl p-6">

                                    <h3 className="font-bold text-xl mb-6">
                                        Holiday Policies
                                    </h3>

                                    <div className="space-y-4">

                                        <label className="flex justify-between">
                                            <span>Exclude Holidays From Attendance</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Apply Holiday Overtime Rates</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Notify Employees Automatically</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Auto Update Payroll Rules</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Allow Office Specific Holidays</span>
                                            <input type="checkbox" />
                                        </label>

                                    </div>

                                </div>

                                {/* AI HOLIDAY INTELLIGENCE */}

                                <div className="border rounded-3xl p-6 bg-gradient-to-r from-pink-50 to-rose-50">

                                    <h3 className="font-bold text-xl mb-5">
                                        AI Holiday Intelligence
                                    </h3>

                                    <div className="space-y-4">

                                        <div className="bg-white border rounded-2xl p-4">

                                            <h4 className="font-semibold">
                                                Workforce Forecast
                                            </h4>

                                            <p className="text-slate-600 mt-2">
                                                Upcoming holiday week is expected to reduce workforce availability by 22%.
                                            </p>

                                        </div>

                                        <div className="bg-white border rounded-2xl p-4">

                                            <h4 className="font-semibold">
                                                Payroll Impact
                                            </h4>

                                            <p className="text-slate-600 mt-2">
                                                Holiday overtime projections indicate an additional payroll cost of UGX 1.2M.
                                            </p>

                                        </div>

                                    </div>

                                </div>

                                {/* ACTIONS */}

                                <div className="border-t pt-6">

                                    <div className="flex flex-wrap gap-3">

                                        <button className="px-5 py-3 bg-pink-600 text-white rounded-xl">
                                            Save Holidays
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            Import Calendar
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            Notify Staff
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            Holiday Report
                                        </button>

                                    </div>

                                </div>

                            </div>

                        </div>


                        {/* OVERTIME INTELLIGENCE CENTRE */}

                        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">

                            {/* HEADER */}

                            <div className="bg-gradient-to-r from-orange-700 via-amber-700 to-yellow-700 p-6">

                                <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">

                                    <div>

                                        <h2 className="text-3xl font-bold text-white">
                                            Overtime Intelligence Centre
                                        </h2>

                                        <p className="text-orange-100 mt-2">
                                            Monitor overtime activity, approval workflows, labor compliance and payroll impact.
                                        </p>

                                    </div>

                                    <div className="flex flex-wrap gap-2">

                                        <div className="px-4 py-2 bg-white/20 rounded-xl text-white text-sm">
                                            124 Hours This Month
                                        </div>

                                        <div className="px-4 py-2 bg-white/20 rounded-xl text-white text-sm">
                                            18 Employees
                                        </div>

                                        <div className="px-4 py-2 bg-white/20 rounded-xl text-white text-sm">
                                            AI Monitoring
                                        </div>

                                    </div>

                                </div>

                            </div>

                            <div className="p-6 space-y-6">

                                {/* KPI OVERVIEW */}

                                <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">

                                    <div className="bg-orange-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Overtime Hours</p>
                                        <h3 className="text-3xl font-bold text-orange-700 mt-2">124</h3>
                                    </div>

                                    <div className="bg-green-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Approved</p>
                                        <h3 className="text-3xl font-bold text-green-700 mt-2">118</h3>
                                    </div>

                                    <div className="bg-red-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Rejected</p>
                                        <h3 className="text-3xl font-bold text-red-700 mt-2">6</h3>
                                    </div>

                                    <div className="bg-blue-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Cost Impact</p>
                                        <h3 className="text-3xl font-bold text-blue-700 mt-2">
                                            UGX 3.8M
                                        </h3>
                                    </div>

                                </div>

                                {/* OVERTIME RULES */}

                                <div className="border rounded-3xl p-6">

                                    <h3 className="font-bold text-xl mb-6">
                                        Overtime Configuration
                                    </h3>

                                    <div className="grid md:grid-cols-2 gap-4">

                                        <input
                                            className="border rounded-xl p-3"
                                            placeholder="Daily Overtime Threshold (Hours)"
                                        />

                                        <input
                                            className="border rounded-xl p-3"
                                            placeholder="Weekly Overtime Threshold"
                                        />

                                        <input
                                            className="border rounded-xl p-3"
                                            placeholder="Weekday Multiplier (1.5x)"
                                        />

                                        <input
                                            className="border rounded-xl p-3"
                                            placeholder="Weekend Multiplier (2.0x)"
                                        />

                                        <input
                                            className="border rounded-xl p-3"
                                            placeholder="Holiday Multiplier (2.5x)"
                                        />

                                        <input
                                            className="border rounded-xl p-3"
                                            placeholder="Maximum Monthly Overtime"
                                        />

                                    </div>

                                </div>

                                {/* APPROVAL POLICIES */}

                                <div className="border rounded-3xl p-6">

                                    <h3 className="font-bold text-xl mb-6">
                                        Approval Policies
                                    </h3>

                                    <div className="space-y-4">

                                        <label className="flex justify-between">
                                            <span>Require Manager Approval</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Require Director Approval Above 10 Hours</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Auto Reject Excessive Overtime</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Allow Emergency Overtime</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Payroll Integration Enabled</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                    </div>

                                </div>

                                {/* ACTIVE REQUESTS */}

                                <div className="border rounded-3xl p-6">

                                    <h3 className="font-bold text-xl mb-6">
                                        Overtime Requests
                                    </h3>

                                    <div className="space-y-4">

                                        <div className="border rounded-2xl p-4 flex justify-between items-center">

                                            <div>
                                                <h4 className="font-semibold">
                                                    John Manager
                                                </h4>
                                                <p className="text-sm text-slate-500">
                                                    4 Hours • Kampala Office
                                                </p>
                                            </div>

                                            <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full">
                                                Pending
                                            </span>

                                        </div>

                                        <div className="border rounded-2xl p-4 flex justify-between items-center">

                                            <div>
                                                <h4 className="font-semibold">
                                                    Sarah Agent
                                                </h4>
                                                <p className="text-sm text-slate-500">
                                                    3 Hours • Entebbe Office
                                                </p>
                                            </div>

                                            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full">
                                                Approved
                                            </span>

                                        </div>

                                    </div>

                                </div>

                                {/* AI INSIGHTS */}

                                <div className="border rounded-3xl p-6 bg-gradient-to-r from-orange-50 to-amber-50">

                                    <h3 className="font-bold text-xl mb-5">
                                        AI Overtime Intelligence
                                    </h3>

                                    <div className="space-y-4">

                                        <div className="bg-white border rounded-2xl p-4">

                                            <h4 className="font-semibold">
                                                Cost Analysis
                                            </h4>

                                            <p className="text-slate-600 mt-2">
                                                Overtime costs increased 8% this month due to inspection workload.
                                            </p>

                                        </div>

                                        <div className="bg-white border rounded-2xl p-4">

                                            <h4 className="font-semibold">
                                                Workforce Recommendation
                                            </h4>

                                            <p className="text-slate-600 mt-2">
                                                Consider adding one field officer to reduce recurring overtime in Kampala.
                                            </p>

                                        </div>

                                    </div>

                                </div>

                                {/* ACTIONS */}

                                <div className="border-t pt-6">

                                    <div className="flex flex-wrap gap-3">

                                        <button className="px-5 py-3 bg-orange-600 text-white rounded-xl">
                                            Save Rules
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            Approval Queue
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            Cost Analysis
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            Export Report
                                        </button>

                                    </div>

                                </div>

                            </div>

                        </div>


                        {/* Payroll */}
                        {/* HEADER */}

                        <div className="bg-gradient-to-r from-green-700 via-emerald-700 to-teal-800 p-6">

                            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">

                                <div>

                                    <h2 className="text-3xl font-bold text-white">
                                        Payroll Intelligence Centre
                                    </h2>

                                    <p className="text-green-100 mt-1">
                                        Salary processing, overtime intelligence, deductions, allowances and payroll analytics.
                                    </p>

                                </div>

                                <div className="flex gap-2">

                                    <span className="px-4 py-2 rounded-xl bg-white/20 text-white text-sm">
                                        Monthly Cycle
                                    </span>

                                    <span className="px-4 py-2 rounded-xl bg-white/20 text-white text-sm">
                                        Payroll Ready
                                    </span>

                                </div>

                            </div>

                        </div>

                        <div className="p-6 space-y-8">

                            {/* EXECUTIVE PAYROLL OVERVIEW */}

                            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-5">

                                <div className="bg-green-50 border rounded-3xl p-5">
                                    <p className="text-sm text-slate-500">
                                        Projected Payroll
                                    </p>
                                    <h3 className="text-4xl font-bold text-green-700 mt-2">
                                        UGX 14.8M
                                    </h3>
                                </div>

                                <div className="bg-blue-50 border rounded-3xl p-5">
                                    <p className="text-sm text-slate-500">
                                        Overtime Cost
                                    </p>
                                    <h3 className="text-4xl font-bold text-blue-700 mt-2">
                                        UGX 760K
                                    </h3>
                                </div>

                                <div className="bg-orange-50 border rounded-3xl p-5">
                                    <p className="text-sm text-slate-500">
                                        Deductions
                                    </p>
                                    <h3 className="text-4xl font-bold text-orange-700 mt-2">
                                        UGX 120K
                                    </h3>
                                </div>

                                <div className="bg-purple-50 border rounded-3xl p-5">
                                    <p className="text-sm text-slate-500">
                                        Payroll Accuracy
                                    </p>
                                    <h3 className="text-4xl font-bold text-purple-700 mt-2">
                                        100%
                                    </h3>
                                </div>

                            </div>

                            {/* PAYROLL RULES */}

                            <div className="border rounded-3xl p-6">

                                <h3 className="font-bold text-xl mb-5">
                                    Payroll Rules & Configuration
                                </h3>

                                <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">

                                    <input
                                        className="border rounded-xl p-3"
                                        placeholder="Overtime Rate"
                                    />

                                    <input
                                        className="border rounded-xl p-3"
                                        placeholder="Weekend Rate"
                                    />

                                    <input
                                        className="border rounded-xl p-3"
                                        placeholder="Holiday Rate"
                                    />

                                    <input
                                        className="border rounded-xl p-3"
                                        placeholder="Late Deduction"
                                    />

                                    <input
                                        className="border rounded-xl p-3"
                                        placeholder="Absent Deduction"
                                    />

                                    <input
                                        className="border rounded-xl p-3"
                                        placeholder="Transport Allowance"
                                    />

                                </div>

                            </div>

                            {/* PAYROLL WORKFLOW */}

                            <div className="border rounded-3xl p-6">

                                <h3 className="font-bold text-xl mb-5">
                                    Payroll Processing Workflow
                                </h3>

                                <div className="grid md:grid-cols-4 gap-4">

                                    <div className="border rounded-2xl p-4 text-center">
                                        <h4 className="font-bold">1</h4>
                                        <p className="text-sm mt-2">
                                            Attendance Verification
                                        </p>
                                    </div>

                                    <div className="border rounded-2xl p-4 text-center">
                                        <h4 className="font-bold">2</h4>
                                        <p className="text-sm mt-2">
                                            Overtime Calculation
                                        </p>
                                    </div>

                                    <div className="border rounded-2xl p-4 text-center">
                                        <h4 className="font-bold">3</h4>
                                        <p className="text-sm mt-2">
                                            Payroll Approval
                                        </p>
                                    </div>

                                    <div className="border rounded-2xl p-4 text-center">
                                        <h4 className="font-bold">4</h4>
                                        <p className="text-sm mt-2">
                                            Payment Processing
                                        </p>
                                    </div>

                                </div>

                            </div>

                            {/* AI PAYROLL INSIGHTS */}

                            <div className="border rounded-3xl p-6 bg-gradient-to-r from-green-50 to-emerald-50">

                                <div className="flex justify-between items-center mb-5">

                                    <h3 className="font-bold text-xl">
                                        AI Payroll Insights
                                    </h3>

                                    <span className="px-3 py-1 bg-green-100 rounded-full text-green-700 text-sm">
                                        AI Active
                                    </span>

                                </div>

                                <div className="space-y-4">

                                    <div className="bg-white border rounded-2xl p-4">

                                        <h4 className="font-semibold">
                                            Payroll Optimization
                                        </h4>

                                        <p className="text-slate-600 mt-2">
                                            Overtime costs increased by 6% this month compared to the previous payroll cycle.
                                        </p>

                                    </div>

                                    <div className="bg-white border rounded-2xl p-4">

                                        <h4 className="font-semibold">
                                            Cost Forecast
                                        </h4>

                                        <p className="text-slate-600 mt-2">
                                            Payroll expenditure is projected to remain within budget this quarter.
                                        </p>

                                    </div>

                                </div>

                            </div>

                            {/* EXECUTIVE ACTIONS */}

                            <div className="border-t pt-6">

                                <h3 className="font-bold text-xl mb-5">
                                    Payroll Operations
                                </h3>

                                <div className="flex flex-wrap gap-3">

                                    <button className="px-5 py-3 bg-green-600 text-white rounded-xl">
                                        Generate Payroll
                                    </button>

                                    <button className="px-5 py-3 border rounded-xl">
                                        Export Payroll
                                    </button>

                                    <button className="px-5 py-3 border rounded-xl">
                                        Payroll Audit
                                    </button>

                                    <button className="px-5 py-3 border rounded-xl">
                                        Cost Analysis
                                    </button>

                                    <button className="px-5 py-3 border rounded-xl">
                                        Salary Review
                                    </button>

                                </div>

                            </div>

                        </div>

                        {/* NOTIFICATION CENTRE */}

                        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">

                            {/* HEADER */}

                            <div className="bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-800 p-6">

                                <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">

                                    <div>

                                        <h2 className="text-3xl font-bold text-white">
                                            Notification Centre
                                        </h2>

                                        <p className="text-blue-100 mt-2">
                                            Manage alerts, reminders, announcements and multi-channel communication across the organisation.
                                        </p>

                                    </div>

                                    <div className="flex flex-wrap gap-2">

                                        <div className="px-4 py-2 bg-white/20 rounded-xl text-white text-sm">
                                            47 Active Rules
                                        </div>

                                        <div className="px-4 py-2 bg-white/20 rounded-xl text-white text-sm">
                                            Live Delivery
                                        </div>

                                        <div className="px-4 py-2 bg-white/20 rounded-xl text-white text-sm">
                                            Multi Channel
                                        </div>

                                    </div>

                                </div>

                            </div>

                            <div className="p-6 space-y-6">

                                {/* OVERVIEW */}

                                <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">

                                    <div className="bg-blue-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Sent Today</p>
                                        <h3 className="text-3xl font-bold text-blue-700 mt-2">1,284</h3>
                                    </div>

                                    <div className="bg-green-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Delivery Rate</p>
                                        <h3 className="text-3xl font-bold text-green-700 mt-2">99.6%</h3>
                                    </div>

                                    <div className="bg-orange-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Pending</p>
                                        <h3 className="text-3xl font-bold text-orange-700 mt-2">18</h3>
                                    </div>

                                    <div className="bg-purple-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Automation Rules</p>
                                        <h3 className="text-3xl font-bold text-purple-700 mt-2">47</h3>
                                    </div>

                                </div>

                                {/* CHANNELS */}

                                <div className="border rounded-3xl p-6">

                                    <h3 className="font-bold text-xl mb-6">
                                        Notification Channels
                                    </h3>

                                    <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">

                                        <div className="border rounded-2xl p-5">
                                            <h4 className="font-bold">WhatsApp</h4>
                                            <p className="text-green-600 mt-2">Connected</p>
                                        </div>

                                        <div className="border rounded-2xl p-5">
                                            <h4 className="font-bold">Email</h4>
                                            <p className="text-green-600 mt-2">Connected</p>
                                        </div>

                                        <div className="border rounded-2xl p-5">
                                            <h4 className="font-bold">SMS</h4>
                                            <p className="text-green-600 mt-2">Connected</p>
                                        </div>

                                        <div className="border rounded-2xl p-5">
                                            <h4 className="font-bold">Push</h4>
                                            <p className="text-green-600 mt-2">Connected</p>
                                        </div>

                                    </div>

                                </div>

                                {/* AUTOMATED ALERTS */}

                                <div className="border rounded-3xl p-6">

                                    <h3 className="font-bold text-xl mb-6">
                                        Automated Notifications
                                    </h3>

                                    <div className="space-y-4">

                                        <label className="flex justify-between">
                                            <span>Late Arrival Alerts</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Attendance Reminders</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Payroll Notifications</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Rent Due Reminders</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Inspection Alerts</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Maintenance Alerts</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                    </div>

                                </div>

                                {/* EXECUTIVE ANNOUNCEMENTS */}

                                <div className="border rounded-3xl p-6">

                                    <h3 className="font-bold text-xl mb-6">
                                        Broadcast Centre
                                    </h3>

                                    <div className="space-y-4">

                                        <input
                                            className="border rounded-xl p-3 w-full"
                                            placeholder="Announcement Title"
                                        />

                                        <textarea
                                            className="border rounded-xl p-3 w-full h-32"
                                            placeholder="Write announcement..."
                                        />

                                        <div className="flex gap-3">

                                            <button className="px-5 py-3 bg-blue-600 text-white rounded-xl">
                                                Send Broadcast
                                            </button>

                                            <button className="px-5 py-3 border rounded-xl">
                                                Schedule
                                            </button>

                                        </div>

                                    </div>

                                </div>

                                {/* AI COMMUNICATION INSIGHTS */}

                                <div className="border rounded-3xl p-6 bg-gradient-to-r from-blue-50 to-indigo-50">

                                    <h3 className="font-bold text-xl mb-5">
                                        AI Communication Intelligence
                                    </h3>

                                    <div className="space-y-4">

                                        <div className="bg-white border rounded-2xl p-4">

                                            <h4 className="font-semibold">
                                                Delivery Performance
                                            </h4>

                                            <p className="text-slate-600 mt-2">
                                                WhatsApp notifications achieve the highest engagement rate at 98.4%.
                                            </p>

                                        </div>

                                        <div className="bg-white border rounded-2xl p-4">

                                            <h4 className="font-semibold">
                                                Recommendation
                                            </h4>

                                            <p className="text-slate-600 mt-2">
                                                Schedule rent reminders 3 days before due dates for maximum collection effectiveness.
                                            </p>

                                        </div>

                                    </div>

                                </div>

                                {/* ACTIONS */}

                                <div className="border-t pt-6">

                                    <div className="flex flex-wrap gap-3">

                                        <button className="px-5 py-3 bg-blue-600 text-white rounded-xl">
                                            Save Settings
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            Notification Logs
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            Delivery Analytics
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            Test Notifications
                                        </button>

                                    </div>

                                </div>

                            </div>

                        </div>


                        {/* WhatsApp */}
                        {/* HEADER */}

                        <div className="bg-gradient-to-r from-green-600 via-emerald-600 to-green-800 p-6">

                            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">

                                <div>

                                    <h2 className="text-3xl font-bold text-white">
                                        WhatsApp Command Centre
                                    </h2>

                                    <p className="text-green-100 mt-1">
                                        Manage WhatsApp Business integration, employee notifications, tenant messaging and automated communications.
                                    </p>

                                </div>

                                <div className="flex gap-2">

                                    <span className="px-4 py-2 rounded-xl bg-white/20 text-white text-sm">
                                        Connected
                                    </span>

                                    <span className="px-4 py-2 rounded-xl bg-white/20 text-white text-sm">
                                        Business API
                                    </span>

                                </div>

                            </div>

                        </div>

                        <div className="p-6 space-y-8">

                            {/* EXECUTIVE OVERVIEW */}

                            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-5">

                                <div className="bg-green-50 border rounded-3xl p-5">
                                    <p className="text-sm text-slate-500">
                                        Messages Today
                                    </p>
                                    <h3 className="text-4xl font-bold text-green-700 mt-2">
                                        342
                                    </h3>
                                </div>

                                <div className="bg-blue-50 border rounded-3xl p-5">
                                    <p className="text-sm text-slate-500">
                                        Delivery Rate
                                    </p>
                                    <h3 className="text-4xl font-bold text-blue-700 mt-2">
                                        99.4%
                                    </h3>
                                </div>

                                <div className="bg-orange-50 border rounded-3xl p-5">
                                    <p className="text-sm text-slate-500">
                                        Failed Messages
                                    </p>
                                    <h3 className="text-4xl font-bold text-orange-700 mt-2">
                                        2
                                    </h3>
                                </div>

                                <div className="bg-purple-50 border rounded-3xl p-5">
                                    <p className="text-sm text-slate-500">
                                        Active Automations
                                    </p>
                                    <h3 className="text-4xl font-bold text-purple-700 mt-2">
                                        18
                                    </h3>
                                </div>

                            </div>

                            {/* CONNECTION SETTINGS */}

                            <div className="border rounded-3xl p-6">

                                <h3 className="font-bold text-xl mb-5">
                                    WhatsApp Business Configuration
                                </h3>

                                <div className="grid md:grid-cols-2 gap-4">

                                    <input
                                        className="border rounded-xl p-3"
                                        placeholder="Business Phone Number"
                                    />

                                    <input
                                        className="border rounded-xl p-3"
                                        placeholder="WhatsApp Business ID"
                                    />

                                    <input
                                        className="border rounded-xl p-3"
                                        placeholder="API Key"
                                    />

                                    <input
                                        className="border rounded-xl p-3"
                                        placeholder="Webhook URL"
                                    />

                                </div>

                            </div>

                            {/* AUTOMATED NOTIFICATIONS */}

                            <div className="border rounded-3xl p-6">

                                <h3 className="font-bold text-xl mb-5">
                                    Automated Notifications
                                </h3>

                                <div className="space-y-4">

                                    <label className="flex justify-between">
                                        <span>Attendance Alerts</span>
                                        <input type="checkbox" defaultChecked />
                                    </label>

                                    <label className="flex justify-between">
                                        <span>Late Arrival Alerts</span>
                                        <input type="checkbox" defaultChecked />
                                    </label>

                                    <label className="flex justify-between">
                                        <span>Payroll Notifications</span>
                                        <input type="checkbox" defaultChecked />
                                    </label>

                                    <label className="flex justify-between">
                                        <span>Inspection Updates</span>
                                        <input type="checkbox" defaultChecked />
                                    </label>

                                    <label className="flex justify-between">
                                        <span>Rent Collection Reminders</span>
                                        <input type="checkbox" defaultChecked />
                                    </label>

                                    <label className="flex justify-between">
                                        <span>Maintenance Alerts</span>
                                        <input type="checkbox" defaultChecked />
                                    </label>

                                </div>

                            </div>

                            {/* MESSAGE TEMPLATES */}

                            <div className="border rounded-3xl p-6">

                                <h3 className="font-bold text-xl mb-5">
                                    Communication Templates
                                </h3>

                                <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">

                                    <div className="border rounded-2xl p-4">
                                        <h4 className="font-semibold">
                                            Attendance Reminder
                                        </h4>
                                    </div>

                                    <div className="border rounded-2xl p-4">
                                        <h4 className="font-semibold">
                                            Payroll Notification
                                        </h4>
                                    </div>

                                    <div className="border rounded-2xl p-4">
                                        <h4 className="font-semibold">
                                            Inspection Update
                                        </h4>
                                    </div>

                                    <div className="border rounded-2xl p-4">
                                        <h4 className="font-semibold">
                                            Rent Reminder
                                        </h4>
                                    </div>

                                    <div className="border rounded-2xl p-4">
                                        <h4 className="font-semibold">
                                            Maintenance Notice
                                        </h4>
                                    </div>

                                    <div className="border rounded-2xl p-4">
                                        <h4 className="font-semibold">
                                            Office Announcement
                                        </h4>
                                    </div>

                                </div>

                            </div>

                            {/* AI COMMUNICATION INSIGHTS */}

                            <div className="border rounded-3xl p-6 bg-gradient-to-r from-green-50 to-emerald-50">

                                <h3 className="font-bold text-xl mb-5">
                                    AI Communication Insights
                                </h3>

                                <div className="space-y-4">

                                    <div className="bg-white border rounded-2xl p-4">
                                        <h4 className="font-semibold">
                                            Engagement Analysis
                                        </h4>

                                        <p className="text-slate-600 mt-2">
                                            Attendance reminders have a 98% read rate and improve punctuality significantly.
                                        </p>
                                    </div>

                                    <div className="bg-white border rounded-2xl p-4">
                                        <h4 className="font-semibold">
                                            Delivery Intelligence
                                        </h4>

                                        <p className="text-slate-600 mt-2">
                                            Communication delivery remains above target across all offices.
                                        </p>
                                    </div>

                                </div>

                            </div>

                            {/* COMMAND ACTIONS */}

                            <div className="border-t pt-6">

                                <h3 className="font-bold text-xl mb-5">
                                    Communication Operations
                                </h3>

                                <div className="flex flex-wrap gap-3">

                                    <button className="px-5 py-3 bg-green-600 text-white rounded-xl">
                                        Test Connection
                                    </button>

                                    <button className="px-5 py-3 border rounded-xl">
                                        Send Test Message
                                    </button>

                                    <button className="px-5 py-3 border rounded-xl">
                                        View Message Logs
                                    </button>

                                    <button className="px-5 py-3 border rounded-xl">
                                        Export Analytics
                                    </button>

                                    <button className="px-5 py-3 border rounded-xl">
                                        Notification Audit
                                    </button>

                                </div>

                            </div>

                        </div>

                        {/* EMAIL COMMUNICATION CENTRE */}

                        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">

                            {/* HEADER */}

                            <div className="bg-gradient-to-r from-slate-700 via-slate-800 to-slate-900 p-6">

                                <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">

                                    <div>

                                        <h2 className="text-3xl font-bold text-white">
                                            Email Communication Centre
                                        </h2>

                                        <p className="text-slate-300 mt-2">
                                            Manage email infrastructure, templates, campaigns, transactional messages and executive communications.
                                        </p>

                                    </div>

                                    <div className="flex flex-wrap gap-2">

                                        <div className="px-4 py-2 bg-white/10 rounded-xl text-white text-sm">
                                            12 Templates
                                        </div>

                                        <div className="px-4 py-2 bg-white/10 rounded-xl text-white text-sm">
                                            SMTP Connected
                                        </div>

                                        <div className="px-4 py-2 bg-white/10 rounded-xl text-white text-sm">
                                            99.8% Delivery
                                        </div>

                                    </div>

                                </div>

                            </div>

                            <div className="p-6 space-y-6">

                                {/* OVERVIEW */}

                                <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">

                                    <div className="bg-blue-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Emails Today</p>
                                        <h3 className="text-3xl font-bold text-blue-700 mt-2">2,184</h3>
                                    </div>

                                    <div className="bg-green-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Delivery Rate</p>
                                        <h3 className="text-3xl font-bold text-green-700 mt-2">99.8%</h3>
                                    </div>

                                    <div className="bg-orange-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Pending Queue</p>
                                        <h3 className="text-3xl font-bold text-orange-700 mt-2">16</h3>
                                    </div>

                                    <div className="bg-purple-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Templates</p>
                                        <h3 className="text-3xl font-bold text-purple-700 mt-2">12</h3>
                                    </div>

                                </div>

                                {/* SMTP CONFIGURATION */}

                                <div className="border rounded-3xl p-6">

                                    <h3 className="font-bold text-xl mb-6">
                                        SMTP Configuration
                                    </h3>

                                    <div className="grid md:grid-cols-2 gap-4">

                                        <input
                                            className="border rounded-xl p-3"
                                            placeholder="SMTP Host"
                                        />

                                        <input
                                            className="border rounded-xl p-3"
                                            placeholder="SMTP Port"
                                        />

                                        <input
                                            className="border rounded-xl p-3"
                                            placeholder="Username"
                                        />

                                        <input
                                            className="border rounded-xl p-3"
                                            placeholder="Password"
                                            type="password"
                                        />

                                        <input
                                            className="border rounded-xl p-3 md:col-span-2"
                                            placeholder="From Email Address"
                                        />

                                    </div>

                                </div>

                                {/* EMAIL TEMPLATES */}

                                <div className="border rounded-3xl p-6">

                                    <div className="flex justify-between items-center mb-6">

                                        <h3 className="font-bold text-xl">
                                            Email Templates
                                        </h3>

                                        <button className="px-5 py-3 bg-slate-800 text-white rounded-xl">
                                            Create Template
                                        </button>

                                    </div>

                                    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">

                                        <div className="border rounded-2xl p-4">
                                            Rent Reminder
                                        </div>

                                        <div className="border rounded-2xl p-4">
                                            Lease Renewal
                                        </div>

                                        <div className="border rounded-2xl p-4">
                                            Payroll Slip
                                        </div>

                                        <div className="border rounded-2xl p-4">
                                            Attendance Alert
                                        </div>

                                        <div className="border rounded-2xl p-4">
                                            Inspection Report
                                        </div>

                                        <div className="border rounded-2xl p-4">
                                            Executive Report
                                        </div>

                                    </div>

                                </div>

                                {/* EMAIL POLICIES */}

                                <div className="border rounded-3xl p-6">

                                    <h3 className="font-bold text-xl mb-6">
                                        Communication Policies
                                    </h3>

                                    <div className="space-y-4">

                                        <label className="flex justify-between">
                                            <span>Send Payroll Emails Automatically</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Send Rent Reminders Automatically</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Send Executive Reports</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Track Opens & Clicks</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Archive Email History</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                    </div>

                                </div>

                                {/* AI EMAIL INSIGHTS */}

                                <div className="border rounded-3xl p-6 bg-gradient-to-r from-slate-50 to-blue-50">

                                    <h3 className="font-bold text-xl mb-5">
                                        AI Communication Intelligence
                                    </h3>

                                    <div className="space-y-4">

                                        <div className="bg-white border rounded-2xl p-4">

                                            <h4 className="font-semibold">
                                                Engagement Insight
                                            </h4>

                                            <p className="text-slate-600 mt-2">
                                                Rent reminder emails sent 5 days before due dates show the highest collection rates.
                                            </p>

                                        </div>

                                        <div className="bg-white border rounded-2xl p-4">

                                            <h4 className="font-semibold">
                                                Delivery Optimization
                                            </h4>

                                            <p className="text-slate-600 mt-2">
                                                Tuesday morning emails achieve the highest open rates across tenants.
                                            </p>

                                        </div>

                                    </div>

                                </div>

                                {/* ACTIONS */}

                                <div className="border-t pt-6">

                                    <div className="flex flex-wrap gap-3">

                                        <button className="px-5 py-3 bg-slate-800 text-white rounded-xl">
                                            Save Settings
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            Send Test Email
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            Email Logs
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            Delivery Analytics
                                        </button>

                                    </div>

                                </div>

                            </div>

                        </div>


                        {/* AUTOMATION ENGINE CENTRE */}

                        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">

                            {/* HEADER */}

                            <div className="bg-gradient-to-r from-violet-700 via-purple-700 to-fuchsia-900 p-6">

                                <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">

                                    <div>

                                        <h2 className="text-3xl font-bold text-white">
                                            Automation Engine Centre
                                        </h2>

                                        <p className="text-purple-100 mt-2">
                                            Create workflows, automate operations and orchestrate business processes across the organisation.
                                        </p>

                                    </div>

                                    <div className="flex flex-wrap gap-2">

                                        <div className="px-4 py-2 bg-white/20 rounded-xl text-white text-sm">
                                            67 Active Workflows
                                        </div>

                                        <div className="px-4 py-2 bg-white/20 rounded-xl text-white text-sm">
                                            AI Enabled
                                        </div>

                                        <div className="px-4 py-2 bg-white/20 rounded-xl text-white text-sm">
                                            Enterprise Automation
                                        </div>

                                    </div>

                                </div>

                            </div>

                            <div className="p-6 space-y-6">

                                {/* OVERVIEW */}

                                <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">

                                    <div className="bg-purple-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Active Workflows</p>
                                        <h3 className="text-3xl font-bold text-purple-700 mt-2">67</h3>
                                    </div>

                                    <div className="bg-green-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Tasks Today</p>
                                        <h3 className="text-3xl font-bold text-green-700 mt-2">1,482</h3>
                                    </div>

                                    <div className="bg-blue-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Success Rate</p>
                                        <h3 className="text-3xl font-bold text-blue-700 mt-2">99.8%</h3>
                                    </div>

                                    <div className="bg-orange-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">AI Automations</p>
                                        <h3 className="text-3xl font-bold text-orange-700 mt-2">24</h3>
                                    </div>

                                </div>

                                {/* WORKFLOW TEMPLATES */}

                                <div className="border rounded-3xl p-6">

                                    <div className="flex justify-between items-center mb-6">

                                        <h3 className="font-bold text-xl">
                                            Workflow Templates
                                        </h3>

                                        <button className="px-5 py-3 bg-purple-600 text-white rounded-xl">
                                            Create Workflow
                                        </button>

                                    </div>

                                    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">

                                        <div className="border rounded-2xl p-5">
                                            <h4 className="font-bold">Attendance Enforcement</h4>
                                            <p className="text-sm text-slate-500 mt-2">
                                                Auto flag late arrivals.
                                            </p>
                                        </div>

                                        <div className="border rounded-2xl p-5">
                                            <h4 className="font-bold">Payroll Processing</h4>
                                            <p className="text-sm text-slate-500 mt-2">
                                                Auto-generate payroll.
                                            </p>
                                        </div>

                                        <div className="border rounded-2xl p-5">
                                            <h4 className="font-bold">Rent Reminders</h4>
                                            <p className="text-sm text-slate-500 mt-2">
                                                Send reminders automatically.
                                            </p>
                                        </div>

                                        <div className="border rounded-2xl p-5">
                                            <h4 className="font-bold">Inspection Scheduling</h4>
                                            <p className="text-sm text-slate-500 mt-2">
                                                Auto-create inspections.
                                            </p>
                                        </div>

                                        <div className="border rounded-2xl p-5">
                                            <h4 className="font-bold">Maintenance Escalation</h4>
                                            <p className="text-sm text-slate-500 mt-2">
                                                Escalate unresolved tickets.
                                            </p>
                                        </div>

                                        <div className="border rounded-2xl p-5">
                                            <h4 className="font-bold">Executive Reporting</h4>
                                            <p className="text-sm text-slate-500 mt-2">
                                                Deliver weekly reports.
                                            </p>
                                        </div>

                                    </div>

                                </div>

                                {/* AUTOMATION RULES */}

                                <div className="border rounded-3xl p-6">

                                    <h3 className="font-bold text-xl mb-6">
                                        Automation Policies
                                    </h3>

                                    <div className="space-y-4">

                                        <label className="flex justify-between">
                                            <span>Automatic Payroll Generation</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Automatic Rent Reminders</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Attendance Escalation</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Maintenance Escalation</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>AI Executive Summaries</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Auto Archive Completed Tasks</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                    </div>

                                </div>

                                {/* SCHEDULED JOBS */}

                                <div className="border rounded-3xl p-6">

                                    <h3 className="font-bold text-xl mb-6">
                                        Scheduled Jobs
                                    </h3>

                                    <div className="space-y-4">

                                        <div className="border rounded-2xl p-4 flex justify-between">
                                            <div>
                                                <h4 className="font-semibold">
                                                    Daily Attendance Summary
                                                </h4>
                                                <p className="text-sm text-slate-500">
                                                    Runs every day at 6:00 PM
                                                </p>
                                            </div>

                                            <span className="text-green-600 font-semibold">
                                                Active
                                            </span>
                                        </div>

                                        <div className="border rounded-2xl p-4 flex justify-between">
                                            <div>
                                                <h4 className="font-semibold">
                                                    Weekly Executive Report
                                                </h4>
                                                <p className="text-sm text-slate-500">
                                                    Runs every Monday
                                                </p>
                                            </div>

                                            <span className="text-green-600 font-semibold">
                                                Active
                                            </span>
                                        </div>

                                    </div>

                                </div>

                                {/* AI AUTOMATION INSIGHTS */}

                                <div className="border rounded-3xl p-6 bg-gradient-to-r from-purple-50 to-fuchsia-50">

                                    <h3 className="font-bold text-xl mb-5">
                                        AI Automation Intelligence
                                    </h3>

                                    <div className="space-y-4">

                                        <div className="bg-white border rounded-2xl p-4">

                                            <h4 className="font-semibold">
                                                Efficiency Insight
                                            </h4>

                                            <p className="text-slate-600 mt-2">
                                                Automations saved approximately 42 staff-hours this week.
                                            </p>

                                        </div>

                                        <div className="bg-white border rounded-2xl p-4">

                                            <h4 className="font-semibold">
                                                Optimization Opportunity
                                            </h4>

                                            <p className="text-slate-600 mt-2">
                                                Converting manual inspection scheduling into automation could reduce admin workload by 18%.
                                            </p>

                                        </div>

                                    </div>

                                </div>

                                {/* ACTIONS */}

                                <div className="border-t pt-6">

                                    <div className="flex flex-wrap gap-3">

                                        <button className="px-5 py-3 bg-purple-600 text-white rounded-xl">
                                            Save Workflows
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            Workflow Logs
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            Run Test
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            Export Rules
                                        </button>

                                    </div>

                                </div>

                            </div>

                        </div>


                        {/* AI */}
                        {/* HEADER */}

                        <div className="bg-gradient-to-r from-purple-700 via-indigo-700 to-purple-900 p-6">

                            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">

                                <div>

                                    <h2 className="text-3xl font-bold text-white">
                                        AI Command Centre
                                    </h2>

                                    <p className="text-purple-100 mt-1">
                                        Predict workforce trends, analyze operations, forecast payroll and generate executive intelligence.
                                    </p>

                                </div>

                                <div className="flex gap-2">

                                    <span className="px-4 py-2 rounded-xl bg-white/20 text-white text-sm">
                                        AI Active
                                    </span>

                                    <span className="px-4 py-2 rounded-xl bg-white/20 text-white text-sm">
                                        Enterprise Intelligence
                                    </span>

                                </div>

                            </div>

                        </div>

                        <div className="p-6 space-y-8">

                            {/* AI OVERVIEW */}

                            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-5">

                                <div className="bg-purple-50 border rounded-3xl p-5">

                                    <p className="text-sm text-slate-500">
                                        AI Reports
                                    </p>

                                    <h3 className="text-4xl font-bold text-purple-700 mt-2">
                                        126
                                    </h3>

                                </div>

                                <div className="bg-indigo-50 border rounded-3xl p-5">

                                    <p className="text-sm text-slate-500">
                                        Predictions
                                    </p>

                                    <h3 className="text-4xl font-bold text-indigo-700 mt-2">
                                        58
                                    </h3>

                                </div>

                                <div className="bg-green-50 border rounded-3xl p-5">

                                    <p className="text-sm text-slate-500">
                                        Accuracy Rate
                                    </p>

                                    <h3 className="text-4xl font-bold text-green-700 mt-2">
                                        97%
                                    </h3>

                                </div>

                                <div className="bg-orange-50 border rounded-3xl p-5">

                                    <p className="text-sm text-slate-500">
                                        Active Models
                                    </p>

                                    <h3 className="text-4xl font-bold text-orange-700 mt-2">
                                        12
                                    </h3>

                                </div>

                            </div>

                            {/* AI MODULES */}

                            <div className="border rounded-3xl p-6">

                                <h3 className="font-bold text-xl mb-5">
                                    AI Intelligence Modules
                                </h3>

                                <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">

                                    <div className="border rounded-2xl p-5">
                                        <h4 className="font-bold">
                                            Attendance Intelligence
                                        </h4>
                                        <p className="text-sm text-slate-500 mt-2">
                                            Predict absenteeism and late arrivals.
                                        </p>
                                    </div>

                                    <div className="border rounded-2xl p-5">
                                        <h4 className="font-bold">
                                            Payroll Forecasting
                                        </h4>
                                        <p className="text-sm text-slate-500 mt-2">
                                            Forecast payroll costs and overtime.
                                        </p>
                                    </div>

                                    <div className="border rounded-2xl p-5">
                                        <h4 className="font-bold">
                                            Rent Collection Intelligence
                                        </h4>
                                        <p className="text-sm text-slate-500 mt-2">
                                            Predict collection trends and risks.
                                        </p>
                                    </div>

                                    <div className="border rounded-2xl p-5">
                                        <h4 className="font-bold">
                                            Property Intelligence
                                        </h4>
                                        <p className="text-sm text-slate-500 mt-2">
                                            Analyze occupancy and vacancies.
                                        </p>
                                    </div>

                                    <div className="border rounded-2xl p-5">
                                        <h4 className="font-bold">
                                            Workforce Intelligence
                                        </h4>
                                        <p className="text-sm text-slate-500 mt-2">
                                            Monitor staffing efficiency.
                                        </p>
                                    </div>

                                    <div className="border rounded-2xl p-5">
                                        <h4 className="font-bold">
                                            Executive Intelligence
                                        </h4>
                                        <p className="text-sm text-slate-500 mt-2">
                                            Generate board-level summaries.
                                        </p>
                                    </div>

                                </div>

                            </div>

                            {/* AI INSIGHTS FEED */}

                            <div className="border rounded-3xl p-6 bg-gradient-to-r from-purple-50 to-indigo-50">

                                <h3 className="font-bold text-xl mb-5">
                                    Live AI Insights
                                </h3>

                                <div className="space-y-4">

                                    <div className="bg-white border rounded-2xl p-4">
                                        <h4 className="font-semibold">
                                            Attendance Prediction
                                        </h4>

                                        <p className="text-slate-600 mt-2">
                                            Attendance is projected to improve by 3% next month based on current patterns.
                                        </p>
                                    </div>

                                    <div className="bg-white border rounded-2xl p-4">
                                        <h4 className="font-semibold">
                                            Payroll Forecast
                                        </h4>

                                        <p className="text-slate-600 mt-2">
                                            Payroll costs are expected to remain within budget targets.
                                        </p>
                                    </div>

                                    <div className="bg-white border rounded-2xl p-4">
                                        <h4 className="font-semibold">
                                            Occupancy Opportunity
                                        </h4>

                                        <p className="text-slate-600 mt-2">
                                            Increasing occupancy by 4% could significantly improve rental income.
                                        </p>
                                    </div>

                                </div>

                            </div>

                            {/* AI AUTOMATION */}

                            <div className="border rounded-3xl p-6">

                                <h3 className="font-bold text-xl mb-5">
                                    AI Automation
                                </h3>

                                <div className="space-y-4">

                                    <label className="flex justify-between">
                                        <span>Automatic Executive Reports</span>
                                        <input type="checkbox" defaultChecked />
                                    </label>

                                    <label className="flex justify-between">
                                        <span>Attendance Predictions</span>
                                        <input type="checkbox" defaultChecked />
                                    </label>

                                    <label className="flex justify-between">
                                        <span>Payroll Forecasting</span>
                                        <input type="checkbox" defaultChecked />
                                    </label>

                                    <label className="flex justify-between">
                                        <span>Risk Detection</span>
                                        <input type="checkbox" defaultChecked />
                                    </label>

                                </div>

                            </div>

                            {/* EXECUTIVE ACTIONS */}

                            <div className="border-t pt-6">

                                <h3 className="font-bold text-xl mb-5">
                                    AI Operations
                                </h3>

                                <div className="flex flex-wrap gap-3">

                                    <button className="px-5 py-3 bg-purple-600 text-white rounded-xl">
                                        Run Full Analysis
                                    </button>

                                    <button className="px-5 py-3 border rounded-xl">
                                        Generate Executive Summary
                                    </button>

                                    <button className="px-5 py-3 border rounded-xl">
                                        View AI Reports
                                    </button>

                                    <button className="px-5 py-3 border rounded-xl">
                                        Export Predictions
                                    </button>

                                </div>

                            </div>

                        </div>

                        {/* REPORTS & ANALYTICS CENTRE */}

                        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">

                            {/* HEADER */}

                            <div className="bg-gradient-to-r from-indigo-800 via-blue-800 to-cyan-800 p-6">

                                <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">

                                    <div>

                                        <h2 className="text-3xl font-bold text-white">
                                            Reports & Analytics Centre
                                        </h2>

                                        <p className="text-blue-100 mt-2">
                                            Executive dashboards, operational analytics, AI intelligence and enterprise reporting.
                                        </p>

                                    </div>

                                    <div className="flex flex-wrap gap-2">

                                        <div className="px-4 py-2 bg-white/20 rounded-xl text-white text-sm">
                                            142 Reports
                                        </div>

                                        <div className="px-4 py-2 bg-white/20 rounded-xl text-white text-sm">
                                            AI Analytics
                                        </div>

                                        <div className="px-4 py-2 bg-white/20 rounded-xl text-white text-sm">
                                            Live Data
                                        </div>

                                    </div>

                                </div>

                            </div>

                            <div className="p-6 space-y-6">

                                {/* KPI DASHBOARD */}

                                <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">

                                    <div className="bg-green-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Monthly Revenue</p>
                                        <h3 className="text-3xl font-bold text-green-700 mt-2">
                                            UGX 48.5M
                                        </h3>
                                    </div>

                                    <div className="bg-blue-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Occupancy Rate</p>
                                        <h3 className="text-3xl font-bold text-blue-700 mt-2">
                                            94%
                                        </h3>
                                    </div>

                                    <div className="bg-orange-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Attendance Score</p>
                                        <h3 className="text-3xl font-bold text-orange-700 mt-2">
                                            98%
                                        </h3>
                                    </div>

                                    <div className="bg-purple-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Collection Rate</p>
                                        <h3 className="text-3xl font-bold text-purple-700 mt-2">
                                            96%
                                        </h3>
                                    </div>

                                </div>

                                {/* REPORT LIBRARY */}

                                <div className="border rounded-3xl p-6">

                                    <div className="flex justify-between items-center mb-6">

                                        <h3 className="font-bold text-xl">
                                            Report Library
                                        </h3>

                                        <button className="px-5 py-3 bg-indigo-600 text-white rounded-xl">
                                            Generate Report
                                        </button>

                                    </div>

                                    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">

                                        <div className="border rounded-2xl p-5">
                                            <h4 className="font-bold">
                                                Attendance Report
                                            </h4>
                                            <p className="text-sm text-slate-500 mt-2">
                                                Workforce attendance analysis
                                            </p>
                                        </div>

                                        <div className="border rounded-2xl p-5">
                                            <h4 className="font-bold">
                                                Payroll Report
                                            </h4>
                                            <p className="text-sm text-slate-500 mt-2">
                                                Salary and deductions summary
                                            </p>
                                        </div>

                                        <div className="border rounded-2xl p-5">
                                            <h4 className="font-bold">
                                                Property Performance
                                            </h4>
                                            <p className="text-sm text-slate-500 mt-2">
                                                Occupancy and revenue analysis
                                            </p>
                                        </div>

                                        <div className="border rounded-2xl p-5">
                                            <h4 className="font-bold">
                                                Rent Collection
                                            </h4>
                                            <p className="text-sm text-slate-500 mt-2">
                                                Collection trends and arrears
                                            </p>
                                        </div>

                                        <div className="border rounded-2xl p-5">
                                            <h4 className="font-bold">
                                                Inspection Report
                                            </h4>
                                            <p className="text-sm text-slate-500 mt-2">
                                                Property inspection activity
                                            </p>
                                        </div>

                                        <div className="border rounded-2xl p-5">
                                            <h4 className="font-bold">
                                                Executive Board Report
                                            </h4>
                                            <p className="text-sm text-slate-500 mt-2">
                                                Strategic performance summary
                                            </p>
                                        </div>

                                    </div>

                                </div>

                                {/* REPORT SCHEDULING */}

                                <div className="border rounded-3xl p-6">

                                    <h3 className="font-bold text-xl mb-6">
                                        Scheduled Reports
                                    </h3>

                                    <div className="space-y-4">

                                        <div className="border rounded-2xl p-4 flex justify-between">

                                            <div>
                                                <h4 className="font-semibold">
                                                    Weekly Executive Report
                                                </h4>

                                                <p className="text-sm text-slate-500">
                                                    Every Monday at 08:00
                                                </p>
                                            </div>

                                            <span className="text-green-600 font-semibold">
                                                Active
                                            </span>

                                        </div>

                                        <div className="border rounded-2xl p-4 flex justify-between">

                                            <div>
                                                <h4 className="font-semibold">
                                                    Monthly Financial Summary
                                                </h4>

                                                <p className="text-sm text-slate-500">
                                                    1st Day of Every Month
                                                </p>
                                            </div>

                                            <span className="text-green-600 font-semibold">
                                                Active
                                            </span>

                                        </div>

                                    </div>

                                </div>

                                {/* AI INSIGHTS */}

                                <div className="border rounded-3xl p-6 bg-gradient-to-r from-indigo-50 to-blue-50">

                                    <h3 className="font-bold text-xl mb-5">
                                        AI Analytics Intelligence
                                    </h3>

                                    <div className="space-y-4">

                                        <div className="bg-white border rounded-2xl p-4">

                                            <h4 className="font-semibold">
                                                Revenue Forecast
                                            </h4>

                                            <p className="text-slate-600 mt-2">
                                                Rental revenue is projected to increase by 6.8% next quarter based on current occupancy trends.
                                            </p>

                                        </div>

                                        <div className="bg-white border rounded-2xl p-4">

                                            <h4 className="font-semibold">
                                                Workforce Insight
                                            </h4>

                                            <p className="text-slate-600 mt-2">
                                                Attendance consistency is highest in Entebbe and Kampala offices.
                                            </p>

                                        </div>

                                        <div className="bg-white border rounded-2xl p-4">

                                            <h4 className="font-semibold">
                                                Collection Risk
                                            </h4>

                                            <p className="text-slate-600 mt-2">
                                                Three properties show increased arrears risk and require follow-up.
                                            </p>

                                        </div>

                                    </div>

                                </div>

                                {/* ACTIONS */}

                                <div className="border-t pt-6">

                                    <div className="flex flex-wrap gap-3">

                                        <button className="px-5 py-3 bg-indigo-600 text-white rounded-xl">
                                            Generate Analytics
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            Export PDF
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            Export Excel
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            Schedule Report
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            AI Forecast
                                        </button>

                                    </div>

                                </div>

                            </div>

                        </div>


                        {/* Property Management */}
                        {/* PROPERTY MANAGEMENT COMMAND CENTRE */}

                        <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden mt-6">

                            {/* HEADER */}

                            <div className="bg-gradient-to-r from-amber-700 via-orange-700 to-red-700 p-6">

                                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">

                                    <div>

                                        <h2 className="text-3xl font-bold text-white">
                                            Property Management Command Centre
                                        </h2>

                                        <p className="text-orange-100 mt-1">
                                            Manage properties, occupancy, inspections, maintenance and revenue performance.
                                        </p>

                                    </div>

                                    <div className="flex gap-2">

                                        <span className="px-4 py-2 rounded-xl bg-white/20 text-white text-sm">
                                            152 Properties
                                        </span>

                                        <span className="px-4 py-2 rounded-xl bg-white/20 text-white text-sm">
                                            94% Occupancy
                                        </span>

                                    </div>

                                </div>

                            </div>

                            <div className="p-6 space-y-8">

                                {/* EXECUTIVE OVERVIEW */}

                                <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-5">

                                    <div className="bg-orange-50 border rounded-3xl p-5">

                                        <p className="text-sm text-slate-500">
                                            Total Properties
                                        </p>

                                        <h3 className="text-4xl font-bold text-orange-700 mt-2">
                                            152
                                        </h3>

                                    </div>

                                    <div className="bg-green-50 border rounded-3xl p-5">

                                        <p className="text-sm text-slate-500">
                                            Occupied Units
                                        </p>

                                        <h3 className="text-4xl font-bold text-green-700 mt-2">
                                            143
                                        </h3>

                                    </div>

                                    <div className="bg-blue-50 border rounded-3xl p-5">

                                        <p className="text-sm text-slate-500">
                                            Vacant Units
                                        </p>

                                        <h3 className="text-4xl font-bold text-blue-700 mt-2">
                                            9
                                        </h3>

                                    </div>

                                    <div className="bg-purple-50 border rounded-3xl p-5">

                                        <p className="text-sm text-slate-500">
                                            Monthly Revenue
                                        </p>

                                        <h3 className="text-4xl font-bold text-purple-700 mt-2">
                                            UGX 48.5M
                                        </h3>

                                    </div>

                                </div>

                                {/* PROPERTY PORTFOLIO */}

                                <div className="border rounded-3xl p-6">

                                    <div className="flex justify-between items-center mb-5">

                                        <h3 className="font-bold text-xl">
                                            Property Portfolio
                                        </h3>

                                        <button className="px-5 py-3 bg-orange-600 text-white rounded-xl">
                                            Add Property
                                        </button>

                                    </div>

                                    <div className="grid xl:grid-cols-2 gap-5">

                                        <div className="border rounded-3xl p-5">

                                            <h4 className="font-bold text-xl">
                                                Sunrise Apartments
                                            </h4>

                                            <p className="text-slate-500">
                                                Entebbe
                                            </p>

                                            <div className="grid grid-cols-2 gap-4 mt-5">

                                                <div>
                                                    <p className="text-xs text-slate-500">
                                                        Units
                                                    </p>
                                                    <p className="font-bold">
                                                        24
                                                    </p>
                                                </div>

                                                <div>
                                                    <p className="text-xs text-slate-500">
                                                        Occupancy
                                                    </p>
                                                    <p className="font-bold text-green-600">
                                                        96%
                                                    </p>
                                                </div>

                                                <div>
                                                    <p className="text-xs text-slate-500">
                                                        Revenue
                                                    </p>
                                                    <p className="font-bold">
                                                        UGX 8.2M
                                                    </p>
                                                </div>

                                                <div>
                                                    <p className="text-xs text-slate-500">
                                                        Maintenance
                                                    </p>
                                                    <p className="font-bold">
                                                        2 Open
                                                    </p>
                                                </div>

                                            </div>

                                        </div>

                                    </div>

                                </div>

                                {/* PROPERTY CONFIGURATION */}

                                <div className="border rounded-3xl p-6">

                                    <h3 className="font-bold text-xl mb-5">
                                        Property Configuration
                                    </h3>

                                    <div className="grid md:grid-cols-2 gap-4">

                                        <input
                                            className="border rounded-xl p-3"
                                            placeholder="Property Name"
                                        />

                                        <input
                                            className="border rounded-xl p-3"
                                            placeholder="Property Code"
                                        />

                                        <input
                                            className="border rounded-xl p-3"
                                            placeholder="Property Owner"
                                        />

                                        <input
                                            className="border rounded-xl p-3"
                                            placeholder="Property Manager"
                                        />

                                        <input
                                            className="border rounded-xl p-3 md:col-span-2"
                                            placeholder="Property Address"
                                        />

                                    </div>

                                </div>

                                {/* AI PROPERTY INSIGHTS */}

                                <div className="border rounded-3xl p-6 bg-gradient-to-r from-orange-50 to-amber-50">

                                    <h3 className="font-bold text-xl mb-5">
                                        AI Property Intelligence
                                    </h3>

                                    <div className="space-y-4">

                                        <div className="bg-white border rounded-2xl p-4">

                                            <h4 className="font-semibold">
                                                Occupancy Forecast
                                            </h4>

                                            <p className="text-slate-600 mt-2">
                                                Occupancy is expected to increase by 3% next month.
                                            </p>

                                        </div>

                                        <div className="bg-white border rounded-2xl p-4">

                                            <h4 className="font-semibold">
                                                Revenue Projection
                                            </h4>

                                            <p className="text-slate-600 mt-2">
                                                Rental income remains above forecast targets.
                                            </p>

                                        </div>

                                    </div>

                                </div>

                                {/* EXECUTIVE ACTIONS */}

                                <div className="border-t pt-6">

                                    <h3 className="font-bold text-xl mb-5">
                                        Property Operations
                                    </h3>

                                    <div className="flex flex-wrap gap-3">

                                        <button className="px-5 py-3 bg-orange-600 text-white rounded-xl">
                                            Portfolio Report
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            Occupancy Report
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            Revenue Analysis
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            Maintenance Review
                                        </button>

                                    </div>

                                </div>

                            </div>

                        </div>

                    </div>

                    {/* SIDEBAR */}
                    <div className="space-y-6">

                        {/* BRANDING & WHITE LABEL CENTRE */}

                        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">

                            {/* HEADER */}

                            <div className="bg-gradient-to-r from-violet-800 via-purple-800 to-fuchsia-900 p-6">

                                <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">

                                    <div>

                                        <h2 className="text-3xl font-bold text-white">
                                            Branding & White Label Centre
                                        </h2>

                                        <p className="text-purple-100 mt-2">
                                            Customize company identity, client portals, white-label deployments and enterprise branding.
                                        </p>

                                    </div>

                                    <div className="flex flex-wrap gap-2">

                                        <div className="px-4 py-2 bg-white/20 rounded-xl text-white text-sm">
                                            White Label Ready
                                        </div>

                                        <div className="px-4 py-2 bg-white/20 rounded-xl text-white text-sm">
                                            Multi Brand
                                        </div>

                                        <div className="px-4 py-2 bg-white/20 rounded-xl text-white text-sm">
                                            SaaS Enabled
                                        </div>

                                    </div>

                                </div>

                            </div>

                            <div className="p-6 space-y-6">

                                {/* BRAND OVERVIEW */}

                                <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">

                                    <div className="bg-purple-50 border rounded-2xl p-5">

                                        <p className="text-sm text-slate-500">
                                            Active Brands
                                        </p>

                                        <h3 className="text-3xl font-bold text-purple-700 mt-2">
                                            3
                                        </h3>

                                    </div>

                                    <div className="bg-blue-50 border rounded-2xl p-5">

                                        <p className="text-sm text-slate-500">
                                            Client Portals
                                        </p>

                                        <h3 className="text-3xl font-bold text-blue-700 mt-2">
                                            12
                                        </h3>

                                    </div>

                                    <div className="bg-green-50 border rounded-2xl p-5">

                                        <p className="text-sm text-slate-500">
                                            Custom Domains
                                        </p>

                                        <h3 className="text-3xl font-bold text-green-700 mt-2">
                                            8
                                        </h3>

                                    </div>

                                    <div className="bg-orange-50 border rounded-2xl p-5">

                                        <p className="text-sm text-slate-500">
                                            White Label Clients
                                        </p>

                                        <h3 className="text-3xl font-bold text-orange-700 mt-2">
                                            5
                                        </h3>

                                    </div>

                                </div>

                                {/* COMPANY BRANDING */}

                                <div className="border rounded-3xl p-6">

                                    <h3 className="font-bold text-xl mb-6">
                                        Company Branding
                                    </h3>

                                    <div className="grid md:grid-cols-2 gap-4">

                                        <input
                                            className="border rounded-xl p-3"
                                            placeholder="Company Name"
                                        />

                                        <input
                                            className="border rounded-xl p-3"
                                            placeholder="Company Tagline"
                                        />

                                        <input
                                            className="border rounded-xl p-3"
                                            placeholder="Primary Brand Color"
                                        />

                                        <input
                                            className="border rounded-xl p-3"
                                            placeholder="Secondary Brand Color"
                                        />

                                        <input
                                            className="border rounded-xl p-3 md:col-span-2"
                                            placeholder="Company Website"
                                        />

                                    </div>

                                    <div className="grid md:grid-cols-3 gap-4 mt-6">

                                        <button className="border rounded-2xl p-6">
                                            Upload Logo
                                        </button>

                                        <button className="border rounded-2xl p-6">
                                            Upload Favicon
                                        </button>

                                        <button className="border rounded-2xl p-6">
                                            Upload Login Background
                                        </button>

                                    </div>

                                </div>

                                {/* WHITE LABEL SETTINGS */}

                                <div className="border rounded-3xl p-6">

                                    <h3 className="font-bold text-xl mb-6">
                                        White Label Controls
                                    </h3>

                                    <div className="space-y-4">

                                        <label className="flex justify-between">
                                            <span>Enable White Label Mode</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Hide Ddumba Branding</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Custom Login Screen</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Custom Email Branding</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Custom PDF Branding</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                    </div>

                                </div>

                                {/* CLIENT PORTALS */}

                                <div className="border rounded-3xl p-6">

                                    <h3 className="font-bold text-xl mb-6">
                                        Client & Tenant Portals
                                    </h3>

                                    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">

                                        <div className="border rounded-2xl p-5">
                                            <h4 className="font-bold">
                                                Owner Portal
                                            </h4>
                                            <p className="text-slate-500 mt-2">
                                                Financial reports and portfolio access
                                            </p>
                                        </div>

                                        <div className="border rounded-2xl p-5">
                                            <h4 className="font-bold">
                                                Tenant Portal
                                            </h4>
                                            <p className="text-slate-500 mt-2">
                                                Rent payments and maintenance requests
                                            </p>
                                        </div>

                                        <div className="border rounded-2xl p-5">
                                            <h4 className="font-bold">
                                                Contractor Portal
                                            </h4>
                                            <p className="text-slate-500 mt-2">
                                                Assigned maintenance jobs
                                            </p>
                                        </div>

                                    </div>

                                </div>

                                {/* CUSTOM DOMAINS */}

                                <div className="border rounded-3xl p-6">

                                    <h3 className="font-bold text-xl mb-6">
                                        Domain Management
                                    </h3>

                                    <div className="grid md:grid-cols-2 gap-4">

                                        <input
                                            className="border rounded-xl p-3"
                                            placeholder="portal.yourcompany.com"
                                        />

                                        <input
                                            className="border rounded-xl p-3"
                                            placeholder="Custom Domain"
                                        />

                                    </div>

                                </div>

                                {/* AI BRAND INTELLIGENCE */}

                                <div className="border rounded-3xl p-6 bg-gradient-to-r from-purple-50 to-pink-50">

                                    <h3 className="font-bold text-xl mb-5">
                                        AI Brand Intelligence
                                    </h3>

                                    <div className="space-y-4">

                                        <div className="bg-white border rounded-2xl p-4">

                                            <h4 className="font-semibold">
                                                Brand Consistency Score
                                            </h4>

                                            <p className="text-slate-600 mt-2">
                                                Your branding consistency across email, reports and portals is currently 96%.
                                            </p>

                                        </div>

                                        <div className="bg-white border rounded-2xl p-4">

                                            <h4 className="font-semibold">
                                                SaaS Readiness
                                            </h4>

                                            <p className="text-slate-600 mt-2">
                                                Your platform is fully prepared for multi-tenant white-label deployments.
                                            </p>

                                        </div>

                                    </div>

                                </div>

                                {/* ACTIONS */}

                                <div className="border-t pt-6">

                                    <div className="flex flex-wrap gap-3">

                                        <button className="px-5 py-3 bg-purple-700 text-white rounded-xl">
                                            Save Branding
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            Preview Portal
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            Generate Brand Kit
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            White Label Wizard
                                        </button>

                                    </div>

                                </div>

                            </div>

                        </div>


                        {/* ROLE & PERMISSION CENTRE */}

                        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">

                            {/* HEADER */}

                            <div className="bg-gradient-to-r from-cyan-700 via-blue-700 to-indigo-900 p-6">

                                <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">

                                    <div>
                                        <h2 className="text-3xl font-bold text-white">
                                            Role & Permission Centre
                                        </h2>

                                        <p className="text-blue-100 mt-2">
                                            Control user access, office permissions, approval workflows and enterprise security.
                                        </p>
                                    </div>

                                    <div className="flex flex-wrap gap-2">

                                        <div className="px-4 py-2 bg-white/20 rounded-xl text-white text-sm">
                                            8 Roles
                                        </div>

                                        <div className="px-4 py-2 bg-white/20 rounded-xl text-white text-sm">
                                            18 Users
                                        </div>

                                        <div className="px-4 py-2 bg-white/20 rounded-xl text-white text-sm">
                                            RBAC Enabled
                                        </div>

                                    </div>

                                </div>

                            </div>

                            {/* BODY */}

                            <div className="p-6 space-y-6">

                                {/* STATS */}

                                <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">

                                    <div className="p-5 rounded-2xl bg-blue-50 border">
                                        <p className="text-sm text-slate-500">Active Roles</p>
                                        <h3 className="text-3xl font-bold text-blue-700 mt-2">8</h3>
                                    </div>

                                    <div className="p-5 rounded-2xl bg-green-50 border">
                                        <p className="text-sm text-slate-500">Users Assigned</p>
                                        <h3 className="text-3xl font-bold text-green-700 mt-2">18</h3>
                                    </div>

                                    <div className="p-5 rounded-2xl bg-purple-50 border">
                                        <p className="text-sm text-slate-500">Permission Sets</p>
                                        <h3 className="text-3xl font-bold text-purple-700 mt-2">42</h3>
                                    </div>

                                    <div className="p-5 rounded-2xl bg-orange-50 border">
                                        <p className="text-sm text-slate-500">Protected Offices</p>
                                        <h3 className="text-3xl font-bold text-orange-700 mt-2">5</h3>
                                    </div>

                                </div>

                                {/* ROLES */}

                                <div className="border rounded-3xl p-6">

                                    <div className="flex justify-between items-center mb-6">

                                        <h3 className="text-xl font-bold">
                                            Enterprise Roles
                                        </h3>

                                        <button className="px-5 py-3 bg-blue-600 text-white rounded-xl">
                                            Create Role
                                        </button>

                                    </div>

                                    <div className="grid xl:grid-cols-2 gap-4">

                                        <div className="border rounded-2xl p-5">
                                            <h4 className="font-bold">Director</h4>
                                            <p className="text-slate-500 mt-2">
                                                Full access to all modules.
                                            </p>
                                        </div>

                                        <div className="border rounded-2xl p-5">
                                            <h4 className="font-bold">Office Manager</h4>
                                            <p className="text-slate-500 mt-2">
                                                Office operations and staff management.
                                            </p>
                                        </div>

                                        <div className="border rounded-2xl p-5">
                                            <h4 className="font-bold">HR Manager</h4>
                                            <p className="text-slate-500 mt-2">
                                                Attendance and workforce management.
                                            </p>
                                        </div>

                                        <div className="border rounded-2xl p-5">
                                            <h4 className="font-bold">Accountant</h4>
                                            <p className="text-slate-500 mt-2">
                                                Payroll and financial operations.
                                            </p>
                                        </div>

                                        <div className="border rounded-2xl p-5">
                                            <h4 className="font-bold">Field Agent</h4>
                                            <p className="text-slate-500 mt-2">
                                                Mobile workforce access.
                                            </p>
                                        </div>

                                        <div className="border rounded-2xl p-5">
                                            <h4 className="font-bold">Property Inspector</h4>
                                            <p className="text-slate-500 mt-2">
                                                Inspection and reporting access.
                                            </p>
                                        </div>

                                    </div>

                                </div>

                                {/* SECURITY RULES */}

                                <div className="border rounded-3xl p-6">

                                    <h3 className="font-bold text-xl mb-6">
                                        Permission Policies
                                    </h3>

                                    <div className="space-y-4">

                                        <label className="flex justify-between">
                                            <span>Require Approval For Role Changes</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Office Restricted Access</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Department Based Permissions</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Temporary Access Expiry</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                    </div>

                                </div>

                                {/* ACTIONS */}

                                <div className="border-t pt-6">

                                    <div className="flex flex-wrap gap-3">

                                        <button className="px-5 py-3 bg-blue-600 text-white rounded-xl">
                                            Save Permissions
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            View Audit Log
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            Export Roles
                                        </button>

                                    </div>

                                </div>

                            </div>

                        </div>


                        {/* FIELD AGENT OPERATIONS CENTRE */}

                        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">

                            {/* HEADER */}

                            <div className="bg-gradient-to-r from-amber-600 via-orange-600 to-red-700 p-6">

                                <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">

                                    <div>

                                        <h2 className="text-3xl font-bold text-white">
                                            Field Agent Operations Centre
                                        </h2>

                                        <p className="text-orange-100 mt-2">
                                            Manage mobile workforce, property visits, rent collections, inspections and field operations.
                                        </p>

                                    </div>

                                    <div className="flex flex-wrap gap-2">

                                        <div className="px-4 py-2 bg-white/20 rounded-xl text-white text-sm">
                                            12 Agents
                                        </div>

                                        <div className="px-4 py-2 bg-white/20 rounded-xl text-white text-sm">
                                            38 Active Tasks
                                        </div>

                                        <div className="px-4 py-2 bg-white/20 rounded-xl text-white text-sm">
                                            GPS Tracking Active
                                        </div>

                                    </div>

                                </div>

                            </div>

                            <div className="p-6 space-y-6">

                                {/* EXECUTIVE OVERVIEW */}

                                <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">

                                    <div className="bg-orange-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Field Agents</p>
                                        <h3 className="text-3xl font-bold text-orange-700 mt-2">12</h3>
                                    </div>

                                    <div className="bg-green-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Active Today</p>
                                        <h3 className="text-3xl font-bold text-green-700 mt-2">11</h3>
                                    </div>

                                    <div className="bg-blue-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Tasks Completed</p>
                                        <h3 className="text-3xl font-bold text-blue-700 mt-2">146</h3>
                                    </div>

                                    <div className="bg-purple-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Collection Rate</p>
                                        <h3 className="text-3xl font-bold text-purple-700 mt-2">94%</h3>
                                    </div>

                                </div>

                                {/* AGENT ASSIGNMENT */}

                                <div className="border rounded-3xl p-6">

                                    <div className="flex justify-between items-center mb-6">

                                        <h3 className="font-bold text-xl">
                                            Agent Assignment
                                        </h3>

                                        <button className="px-5 py-3 bg-orange-600 text-white rounded-xl">
                                            Assign Task
                                        </button>

                                    </div>

                                    <div className="grid md:grid-cols-2 gap-4">

                                        <input
                                            className="border rounded-xl p-3"
                                            placeholder="Agent Name"
                                        />

                                        <select className="border rounded-xl p-3">
                                            <option>Select Office</option>
                                        </select>

                                        <select className="border rounded-xl p-3">
                                            <option>Task Type</option>
                                            <option>Rent Collection</option>
                                            <option>Property Visit</option>
                                            <option>Tenant Follow-up</option>
                                            <option>Inspection Support</option>
                                        </select>

                                        <input
                                            className="border rounded-xl p-3"
                                            placeholder="Property / Area"
                                        />

                                    </div>

                                </div>

                                {/* LIVE FIELD STATUS */}

                                <div className="border rounded-3xl p-6">

                                    <h3 className="font-bold text-xl mb-6">
                                        Live Field Status
                                    </h3>

                                    <div className="space-y-4">

                                        <div className="border rounded-2xl p-4 flex justify-between items-center">

                                            <div>
                                                <h4 className="font-bold">
                                                    John Agent
                                                </h4>

                                                <p className="text-sm text-slate-500">
                                                    Rent Collection • Entebbe
                                                </p>
                                            </div>

                                            <span className="px-3 py-1 rounded-full bg-green-100 text-green-700">
                                                Active
                                            </span>

                                        </div>

                                        <div className="border rounded-2xl p-4 flex justify-between items-center">

                                            <div>
                                                <h4 className="font-bold">
                                                    Sarah Agent
                                                </h4>

                                                <p className="text-sm text-slate-500">
                                                    Property Visit • Kampala
                                                </p>
                                            </div>

                                            <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-700">
                                                On Route
                                            </span>

                                        </div>

                                    </div>

                                </div>

                                {/* FIELD SECURITY */}

                                <div className="border rounded-3xl p-6">

                                    <h3 className="font-bold text-xl mb-6">
                                        Field Security Policies
                                    </h3>

                                    <div className="space-y-4">

                                        <label className="flex justify-between">
                                            <span>Require GPS Tracking</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Require Geofence Validation</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Require Photo Evidence</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Require Task Check-In</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Manager Approval For Closure</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                    </div>

                                </div>

                                {/* AI INSIGHTS */}

                                <div className="border rounded-3xl p-6 bg-gradient-to-r from-orange-50 to-red-50">

                                    <h3 className="font-bold text-xl mb-5">
                                        AI Field Intelligence
                                    </h3>

                                    <div className="space-y-4">

                                        <div className="bg-white border rounded-2xl p-4">

                                            <h4 className="font-semibold">
                                                Productivity Insight
                                            </h4>

                                            <p className="text-slate-600 mt-2">
                                                Field collections increased 11% this month compared to the previous period.
                                            </p>

                                        </div>

                                        <div className="bg-white border rounded-2xl p-4">

                                            <h4 className="font-semibold">
                                                Route Optimization
                                            </h4>

                                            <p className="text-slate-600 mt-2">
                                                AI recommends consolidating 3 property visits to reduce travel costs.
                                            </p>

                                        </div>

                                    </div>

                                </div>

                                {/* ACTIONS */}

                                <div className="border-t pt-6">

                                    <div className="flex flex-wrap gap-3">

                                        <button className="px-5 py-3 bg-orange-600 text-white rounded-xl">
                                            Dispatch Agents
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            View Routes
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            Export Activity
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            Agent Performance
                                        </button>

                                    </div>

                                </div>

                            </div>

                        </div>


                        {/* PROPERTY INSPECTOR CENTRE */}

                        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">

                            {/* HEADER */}

                            <div className="bg-gradient-to-r from-indigo-700 via-blue-700 to-cyan-800 p-6">

                                <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">

                                    <div>

                                        <h2 className="text-3xl font-bold text-white">
                                            Property Inspector Centre
                                        </h2>

                                        <p className="text-blue-100 mt-2">
                                            Manage inspections, property condition reports, compliance audits and maintenance verification.
                                        </p>

                                    </div>

                                    <div className="flex flex-wrap gap-2">

                                        <div className="px-4 py-2 bg-white/20 rounded-xl text-white text-sm">
                                            6 Inspectors
                                        </div>

                                        <div className="px-4 py-2 bg-white/20 rounded-xl text-white text-sm">
                                            42 Active Inspections
                                        </div>

                                        <div className="px-4 py-2 bg-white/20 rounded-xl text-white text-sm">
                                            Live Tracking
                                        </div>

                                    </div>

                                </div>

                            </div>

                            <div className="p-6 space-y-6">

                                {/* OVERVIEW */}

                                <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">

                                    <div className="bg-blue-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Inspectors</p>
                                        <h3 className="text-3xl font-bold text-blue-700 mt-2">6</h3>
                                    </div>

                                    <div className="bg-green-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Completed This Month</p>
                                        <h3 className="text-3xl font-bold text-green-700 mt-2">184</h3>
                                    </div>

                                    <div className="bg-orange-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Pending Reviews</p>
                                        <h3 className="text-3xl font-bold text-orange-700 mt-2">8</h3>
                                    </div>

                                    <div className="bg-purple-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Compliance Score</p>
                                        <h3 className="text-3xl font-bold text-purple-700 mt-2">98%</h3>
                                    </div>

                                </div>

                                {/* INSPECTION CREATION */}

                                <div className="border rounded-3xl p-6">

                                    <div className="flex justify-between items-center mb-6">

                                        <h3 className="font-bold text-xl">
                                            Schedule Inspection
                                        </h3>

                                        <button className="px-5 py-3 bg-blue-600 text-white rounded-xl">
                                            Create Inspection
                                        </button>

                                    </div>

                                    <div className="grid md:grid-cols-2 gap-4">

                                        <input
                                            className="border rounded-xl p-3"
                                            placeholder="Property Name"
                                        />

                                        <select className="border rounded-xl p-3">
                                            <option>Select Inspector</option>
                                        </select>

                                        <select className="border rounded-xl p-3">
                                            <option>Inspection Type</option>
                                            <option>Move In</option>
                                            <option>Move Out</option>
                                            <option>Routine</option>
                                            <option>Damage Assessment</option>
                                            <option>Compliance Audit</option>
                                        </select>

                                        <input
                                            className="border rounded-xl p-3"
                                            placeholder="Inspection Date"
                                        />

                                    </div>

                                </div>

                                {/* LIVE INSPECTIONS */}

                                <div className="border rounded-3xl p-6">

                                    <h3 className="font-bold text-xl mb-6">
                                        Active Inspections
                                    </h3>

                                    <div className="space-y-4">

                                        <div className="border rounded-2xl p-4 flex justify-between items-center">

                                            <div>
                                                <h4 className="font-bold">
                                                    Sunrise Apartments
                                                </h4>

                                                <p className="text-sm text-slate-500">
                                                    Routine Inspection
                                                </p>
                                            </div>

                                            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full">
                                                In Progress
                                            </span>

                                        </div>

                                        <div className="border rounded-2xl p-4 flex justify-between items-center">

                                            <div>
                                                <h4 className="font-bold">
                                                    Palm Estate
                                                </h4>

                                                <p className="text-sm text-slate-500">
                                                    Move Out Inspection
                                                </p>
                                            </div>

                                            <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full">
                                                Scheduled
                                            </span>

                                        </div>

                                    </div>

                                </div>

                                {/* INSPECTION REQUIREMENTS */}

                                <div className="border rounded-3xl p-6">

                                    <h3 className="font-bold text-xl mb-6">
                                        Inspection Policies
                                    </h3>

                                    <div className="space-y-4">

                                        <label className="flex justify-between">
                                            <span>Require Photo Evidence</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Require GPS Verification</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Require Digital Signature</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Require Condition Scoring</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Manager Review Required</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                    </div>

                                </div>

                                {/* AI INSIGHTS */}

                                <div className="border rounded-3xl p-6 bg-gradient-to-r from-blue-50 to-indigo-50">

                                    <h3 className="font-bold text-xl mb-5">
                                        AI Inspection Intelligence
                                    </h3>

                                    <div className="space-y-4">

                                        <div className="bg-white border rounded-2xl p-4">

                                            <h4 className="font-semibold">
                                                Maintenance Risk Detection
                                            </h4>

                                            <p className="text-slate-600 mt-2">
                                                AI has identified 4 properties likely to require maintenance within 30 days.
                                            </p>

                                        </div>

                                        <div className="bg-white border rounded-2xl p-4">

                                            <h4 className="font-semibold">
                                                Compliance Forecast
                                            </h4>

                                            <p className="text-slate-600 mt-2">
                                                Property compliance remains above target across all managed locations.
                                            </p>

                                        </div>

                                    </div>

                                </div>

                                {/* ACTIONS */}

                                <div className="border-t pt-6">

                                    <div className="flex flex-wrap gap-3">

                                        <button className="px-5 py-3 bg-blue-600 text-white rounded-xl">
                                            Inspection Dashboard
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            Export Reports
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            View Evidence
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            Inspector Performance
                                        </button>

                                    </div>

                                </div>

                            </div>

                        </div>


                        {/* DEVICE MANAGEMENT CENTRE */}

                        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">

                            {/* HEADER */}

                            <div className="bg-gradient-to-r from-violet-700 via-purple-700 to-indigo-900 p-6">

                                <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">

                                    <div>

                                        <h2 className="text-3xl font-bold text-white">
                                            Device Management Centre
                                        </h2>

                                        <p className="text-purple-100 mt-2">
                                            Manage trusted devices, attendance terminals, employee phones and security compliance.
                                        </p>

                                    </div>

                                    <div className="flex flex-wrap gap-2">

                                        <div className="px-4 py-2 bg-white/20 rounded-xl text-white text-sm">
                                            24 Devices
                                        </div>

                                        <div className="px-4 py-2 bg-white/20 rounded-xl text-white text-sm">
                                            22 Trusted
                                        </div>

                                        <div className="px-4 py-2 bg-white/20 rounded-xl text-white text-sm">
                                            2 Blocked
                                        </div>

                                    </div>

                                </div>

                            </div>

                            {/* BODY */}

                            <div className="p-6 space-y-6">

                                {/* OVERVIEW */}

                                <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">

                                    <div className="bg-purple-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Registered Devices</p>
                                        <h3 className="text-3xl font-bold text-purple-700 mt-2">24</h3>
                                    </div>

                                    <div className="bg-green-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Trusted Devices</p>
                                        <h3 className="text-3xl font-bold text-green-700 mt-2">22</h3>
                                    </div>

                                    <div className="bg-red-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Blocked Devices</p>
                                        <h3 className="text-3xl font-bold text-red-700 mt-2">2</h3>
                                    </div>

                                    <div className="bg-blue-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Active Sessions</p>
                                        <h3 className="text-3xl font-bold text-blue-700 mt-2">18</h3>
                                    </div>

                                </div>

                                {/* DEVICE LIST */}

                                <div className="border rounded-3xl p-6">

                                    <div className="flex justify-between items-center mb-6">

                                        <h3 className="text-xl font-bold">
                                            Device Registry
                                        </h3>

                                        <button className="px-5 py-3 bg-purple-600 text-white rounded-xl">
                                            Register Device
                                        </button>

                                    </div>

                                    <div className="space-y-4">

                                        <div className="border rounded-2xl p-4 flex justify-between items-center">

                                            <div>
                                                <h4 className="font-bold">
                                                    Office Desktop #001
                                                </h4>
                                                <p className="text-sm text-slate-500">
                                                    Kampala Head Office
                                                </p>
                                            </div>

                                            <span className="px-3 py-1 rounded-full bg-green-100 text-green-700">
                                                Trusted
                                            </span>

                                        </div>

                                        <div className="border rounded-2xl p-4 flex justify-between items-center">

                                            <div>
                                                <h4 className="font-bold">
                                                    Samsung Galaxy A55
                                                </h4>
                                                <p className="text-sm text-slate-500">
                                                    Field Agent Device
                                                </p>
                                            </div>

                                            <span className="px-3 py-1 rounded-full bg-green-100 text-green-700">
                                                Active
                                            </span>

                                        </div>

                                        <div className="border rounded-2xl p-4 flex justify-between items-center">

                                            <div>
                                                <h4 className="font-bold">
                                                    Unknown Device
                                                </h4>
                                                <p className="text-sm text-slate-500">
                                                    Login Attempt Detected
                                                </p>
                                            </div>

                                            <span className="px-3 py-1 rounded-full bg-red-100 text-red-700">
                                                Blocked
                                            </span>

                                        </div>

                                    </div>

                                </div>

                                {/* DEVICE SECURITY */}

                                <div className="border rounded-3xl p-6">

                                    <h3 className="font-bold text-xl mb-6">
                                        Device Security Policies
                                    </h3>

                                    <div className="space-y-4">

                                        <label className="flex justify-between">
                                            <span>Allow Trusted Devices Only</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Block Rooted Devices</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Block Jailbroken Devices</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Require Device Verification</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Enforce Device Expiry</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                    </div>

                                </div>

                                {/* AI DEVICE INSIGHTS */}

                                <div className="border rounded-3xl p-6 bg-gradient-to-r from-purple-50 to-indigo-50">

                                    <h3 className="font-bold text-xl mb-5">
                                        AI Device Intelligence
                                    </h3>

                                    <div className="space-y-4">

                                        <div className="bg-white border rounded-2xl p-4">

                                            <h4 className="font-semibold">
                                                Security Observation
                                            </h4>

                                            <p className="text-slate-600 mt-2">
                                                Two devices have not checked in for more than 14 days and should be reviewed.
                                            </p>

                                        </div>

                                        <div className="bg-white border rounded-2xl p-4">

                                            <h4 className="font-semibold">
                                                Device Health Forecast
                                            </h4>

                                            <p className="text-slate-600 mt-2">
                                                All registered attendance devices are operating normally.
                                            </p>

                                        </div>

                                    </div>

                                </div>

                                {/* ACTIONS */}

                                <div className="border-t pt-6">

                                    <div className="flex flex-wrap gap-3">

                                        <button className="px-5 py-3 bg-purple-600 text-white rounded-xl">
                                            Save Changes
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            Export Devices
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            Security Audit
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            Device Logs
                                        </button>

                                    </div>

                                </div>

                            </div>

                        </div>


                        {/* PIN & ACCESS CONTROL CENTRE */}

                        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">

                            {/* HEADER */}

                            <div className="bg-gradient-to-r from-emerald-700 via-green-700 to-teal-900 p-6">

                                <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">

                                    <div>

                                        <h2 className="text-3xl font-bold text-white">
                                            PIN & Access Control Centre
                                        </h2>

                                        <p className="text-green-100 mt-2">
                                            Secure workforce authentication, attendance access control and enterprise security policies.
                                        </p>

                                    </div>

                                    <div className="flex flex-wrap gap-2">

                                        <div className="px-4 py-2 bg-white/20 rounded-xl text-white text-sm">
                                            PIN Security Active
                                        </div>

                                        <div className="px-4 py-2 bg-white/20 rounded-xl text-white text-sm">
                                            18 Employees
                                        </div>

                                        <div className="px-4 py-2 bg-white/20 rounded-xl text-white text-sm">
                                            MFA Ready
                                        </div>

                                    </div>

                                </div>

                            </div>

                            <div className="p-6 space-y-6">

                                {/* SECURITY OVERVIEW */}

                                <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">

                                    <div className="bg-green-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Active PIN Users</p>
                                        <h3 className="text-3xl font-bold text-green-700 mt-2">18</h3>
                                    </div>

                                    <div className="bg-blue-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Successful Logins</p>
                                        <h3 className="text-3xl font-bold text-blue-700 mt-2">1,284</h3>
                                    </div>

                                    <div className="bg-orange-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Failed Attempts</p>
                                        <h3 className="text-3xl font-bold text-orange-700 mt-2">7</h3>
                                    </div>

                                    <div className="bg-purple-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Security Score</p>
                                        <h3 className="text-3xl font-bold text-purple-700 mt-2">99%</h3>
                                    </div>

                                </div>

                                {/* PIN POLICY */}

                                <div className="border rounded-3xl p-6">

                                    <h3 className="font-bold text-xl mb-6">
                                        PIN Security Policies
                                    </h3>

                                    <div className="grid md:grid-cols-2 gap-4">

                                        <input
                                            className="border rounded-xl p-3"
                                            placeholder="Minimum PIN Length"
                                        />

                                        <input
                                            className="border rounded-xl p-3"
                                            placeholder="PIN Expiry (Days)"
                                        />

                                        <input
                                            className="border rounded-xl p-3"
                                            placeholder="Maximum Failed Attempts"
                                        />

                                        <input
                                            className="border rounded-xl p-3"
                                            placeholder="Auto Lock Duration (Minutes)"
                                        />

                                    </div>

                                    <div className="space-y-4 mt-6">

                                        <label className="flex justify-between">
                                            <span>Require Unique PINs</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Force PIN Rotation</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Prevent PIN Reuse</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Require Office Verification</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                    </div>

                                </div>

                                {/* ACCESS CONTROL */}

                                <div className="border rounded-3xl p-6">

                                    <h3 className="font-bold text-xl mb-6">
                                        Access Restrictions
                                    </h3>

                                    <div className="space-y-4">

                                        <label className="flex justify-between">
                                            <span>Restrict By Office</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Restrict By Device</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Restrict By GPS Location</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Restrict By Working Hours</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Require Manager Approval For Overrides</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                    </div>

                                </div>

                                {/* ATTENDANCE ACCESS MATRIX */}

                                <div className="border rounded-3xl p-6">

                                    <h3 className="font-bold text-xl mb-6">
                                        Attendance Access Matrix
                                    </h3>

                                    <div className="overflow-x-auto">

                                        <table className="w-full">

                                            <thead>

                                                <tr className="border-b">

                                                    <th className="text-left py-3">Role</th>
                                                    <th>Clock In</th>
                                                    <th>Clock Out</th>
                                                    <th>Edit Records</th>
                                                    <th>Approve Changes</th>

                                                </tr>

                                            </thead>

                                            <tbody>

                                                <tr className="border-b">
                                                    <td className="py-3">Employee</td>
                                                    <td>✅</td>
                                                    <td>✅</td>
                                                    <td>❌</td>
                                                    <td>❌</td>
                                                </tr>

                                                <tr className="border-b">
                                                    <td className="py-3">Manager</td>
                                                    <td>✅</td>
                                                    <td>✅</td>
                                                    <td>✅</td>
                                                    <td>✅</td>
                                                </tr>

                                                <tr>
                                                    <td className="py-3">Director</td>
                                                    <td>✅</td>
                                                    <td>✅</td>
                                                    <td>✅</td>
                                                    <td>✅</td>
                                                </tr>

                                            </tbody>

                                        </table>

                                    </div>

                                </div>

                                {/* AI SECURITY INSIGHTS */}

                                <div className="border rounded-3xl p-6 bg-gradient-to-r from-green-50 to-emerald-50">

                                    <h3 className="font-bold text-xl mb-5">
                                        AI Access Intelligence
                                    </h3>

                                    <div className="space-y-4">

                                        <div className="bg-white border rounded-2xl p-4">

                                            <h4 className="font-semibold">
                                                Security Observation
                                            </h4>

                                            <p className="text-slate-600 mt-2">
                                                No suspicious attendance activity detected across all offices during the last 30 days.
                                            </p>

                                        </div>

                                        <div className="bg-white border rounded-2xl p-4">

                                            <h4 className="font-semibold">
                                                Risk Assessment
                                            </h4>

                                            <p className="text-slate-600 mt-2">
                                                PIN security compliance remains above enterprise target thresholds.
                                            </p>

                                        </div>

                                    </div>

                                </div>

                                {/* ACTIONS */}

                                <div className="border-t pt-6">

                                    <div className="flex flex-wrap gap-3">

                                        <button className="px-5 py-3 bg-green-600 text-white rounded-xl">
                                            Save Policies
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            Reset PINs
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            View Access Logs
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            Run Security Review
                                        </button>

                                    </div>

                                </div>

                            </div>

                        </div>


                        {/* Security */}
                        {/* HEADER */}

                        <div className="bg-gradient-to-r from-red-700 via-rose-700 to-red-900 p-6">

                            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">

                                <div>

                                    <h2 className="text-3xl font-bold text-white">
                                        Security Command Centre
                                    </h2>

                                    <p className="text-red-100 mt-1">
                                        Manage authentication, device security, office access, threat detection and compliance controls.
                                    </p>

                                </div>

                                <div className="flex gap-2">

                                    <span className="px-4 py-2 rounded-xl bg-white/20 text-white text-sm">
                                        Security Score 97%
                                    </span>

                                    <span className="px-4 py-2 rounded-xl bg-white/20 text-white text-sm">
                                        Protected
                                    </span>

                                </div>

                            </div>

                        </div>

                        <div className="p-6 space-y-8">

                            {/* SECURITY OVERVIEW */}

                            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-5">

                                <div className="bg-red-50 border rounded-3xl p-5">
                                    <p className="text-sm text-slate-500">
                                        Security Score
                                    </p>
                                    <h3 className="text-4xl font-bold text-red-700 mt-2">
                                        97%
                                    </h3>
                                </div>

                                <div className="bg-green-50 border rounded-3xl p-5">
                                    <p className="text-sm text-slate-500">
                                        Protected Users
                                    </p>
                                    <h3 className="text-4xl font-bold text-green-700 mt-2">
                                        18
                                    </h3>
                                </div>

                                <div className="bg-orange-50 border rounded-3xl p-5">
                                    <p className="text-sm text-slate-500">
                                        Threats Blocked
                                    </p>
                                    <h3 className="text-4xl font-bold text-orange-700 mt-2">
                                        24
                                    </h3>
                                </div>

                                <div className="bg-blue-50 border rounded-3xl p-5">
                                    <p className="text-sm text-slate-500">
                                        Trusted Devices
                                    </p>
                                    <h3 className="text-4xl font-bold text-blue-700 mt-2">
                                        22
                                    </h3>
                                </div>

                            </div>

                            {/* AUTHENTICATION */}

                            <div className="border rounded-3xl p-6">

                                <h3 className="font-bold text-xl mb-5">
                                    Authentication & Access Control
                                </h3>

                                <div className="space-y-4">

                                    <label className="flex justify-between">
                                        <span>Require Two-Factor Authentication</span>
                                        <input type="checkbox" defaultChecked />
                                    </label>

                                    <label className="flex justify-between">
                                        <span>Force Strong Passwords</span>
                                        <input type="checkbox" defaultChecked />
                                    </label>

                                    <label className="flex justify-between">
                                        <span>Password Expiry Policy</span>
                                        <input type="checkbox" defaultChecked />
                                    </label>

                                    <label className="flex justify-between">
                                        <span>Single Session Enforcement</span>
                                        <input type="checkbox" defaultChecked />
                                    </label>

                                </div>

                            </div>

                            {/* DEVICE SECURITY */}

                            <div className="border rounded-3xl p-6">

                                <h3 className="font-bold text-xl mb-5">
                                    Device Management & Security
                                </h3>

                                <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">

                                    <div className="border rounded-2xl p-4">
                                        <h4 className="font-bold">
                                            Registered Devices
                                        </h4>
                                        <p className="text-2xl font-bold mt-2">
                                            24
                                        </p>
                                    </div>

                                    <div className="border rounded-2xl p-4">
                                        <h4 className="font-bold">
                                            Trusted Devices
                                        </h4>
                                        <p className="text-2xl font-bold mt-2">
                                            22
                                        </p>
                                    </div>

                                    <div className="border rounded-2xl p-4">
                                        <h4 className="font-bold">
                                            Blocked Devices
                                        </h4>
                                        <p className="text-2xl font-bold mt-2">
                                            2
                                        </p>
                                    </div>

                                    <div className="border rounded-2xl p-4">
                                        <h4 className="font-bold">
                                            Active Sessions
                                        </h4>
                                        <p className="text-2xl font-bold mt-2">
                                            18
                                        </p>
                                    </div>

                                </div>

                            </div>

                            {/* GEOFENCE SECURITY */}

                            <div className="border rounded-3xl p-6">

                                <h3 className="font-bold text-xl mb-5">
                                    Attendance & Geofence Security
                                </h3>

                                <div className="space-y-4">

                                    <label className="flex justify-between">
                                        <span>Block GPS Spoofing</span>
                                        <input type="checkbox" defaultChecked />
                                    </label>

                                    <label className="flex justify-between">
                                        <span>Block VPN Attendance</span>
                                        <input type="checkbox" defaultChecked />
                                    </label>

                                    <label className="flex justify-between">
                                        <span>Require GPS Accuracy</span>
                                        <input type="checkbox" defaultChecked />
                                    </label>

                                    <label className="flex justify-between">
                                        <span>Require Approved Device</span>
                                        <input type="checkbox" defaultChecked />
                                    </label>

                                </div>

                            </div>

                            {/* AI THREAT INTELLIGENCE */}

                            <div className="border rounded-3xl p-6 bg-gradient-to-r from-red-50 to-orange-50">

                                <h3 className="font-bold text-xl mb-5">
                                    AI Threat Intelligence
                                </h3>

                                <div className="space-y-4">

                                    <div className="bg-white border rounded-2xl p-4">

                                        <h4 className="font-semibold">
                                            Suspicious Login Detection
                                        </h4>

                                        <p className="text-slate-600 mt-2">
                                            No abnormal login patterns detected across all offices.
                                        </p>

                                    </div>

                                    <div className="bg-white border rounded-2xl p-4">

                                        <h4 className="font-semibold">
                                            Device Risk Analysis
                                        </h4>

                                        <p className="text-slate-600 mt-2">
                                            Two devices require administrator review.
                                        </p>

                                    </div>

                                </div>

                            </div>

                            {/* EXECUTIVE SECURITY ACTIONS */}

                            <div className="border-t pt-6">

                                <h3 className="font-bold text-xl mb-5">
                                    Security Operations
                                </h3>

                                <div className="flex flex-wrap gap-3">

                                    <button className="px-5 py-3 bg-red-600 text-white rounded-xl">
                                        Run Security Audit
                                    </button>

                                    <button className="px-5 py-3 border rounded-xl">
                                        Review Devices
                                    </button>

                                    <button className="px-5 py-3 border rounded-xl">
                                        View Security Logs
                                    </button>

                                    <button className="px-5 py-3 border rounded-xl">
                                        Export Audit Report
                                    </button>

                                    <button className="px-5 py-3 border rounded-xl">
                                        Force User Re-Authentication
                                    </button>

                                </div>

                            </div>

                        </div>

                        {/* INTEGRATION MARKETPLACE CENTRE */}

                        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">

                            {/* HEADER */}

                            <div className="bg-gradient-to-r from-cyan-700 via-sky-700 to-blue-900 p-6">

                                <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">

                                    <div>

                                        <h2 className="text-3xl font-bold text-white">
                                            Integration Marketplace Centre
                                        </h2>

                                        <p className="text-cyan-100 mt-2">
                                            Connect your workforce, payroll, property management and communication systems with external platforms.
                                        </p>

                                    </div>

                                    <div className="flex flex-wrap gap-2">

                                        <div className="px-4 py-2 bg-white/20 rounded-xl text-white text-sm">
                                            28 Integrations
                                        </div>

                                        <div className="px-4 py-2 bg-white/20 rounded-xl text-white text-sm">
                                            API Ready
                                        </div>

                                        <div className="px-4 py-2 bg-white/20 rounded-xl text-white text-sm">
                                            Enterprise Connected
                                        </div>

                                    </div>

                                </div>

                            </div>

                            <div className="p-6 space-y-6">

                                {/* OVERVIEW */}

                                <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">

                                    <div className="bg-cyan-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Connected Apps</p>
                                        <h3 className="text-3xl font-bold text-cyan-700 mt-2">14</h3>
                                    </div>

                                    <div className="bg-green-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Healthy Connections</p>
                                        <h3 className="text-3xl font-bold text-green-700 mt-2">14</h3>
                                    </div>

                                    <div className="bg-orange-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">API Calls Today</p>
                                        <h3 className="text-3xl font-bold text-orange-700 mt-2">24,851</h3>
                                    </div>

                                    <div className="bg-purple-50 border rounded-2xl p-5">
                                        <p className="text-sm text-slate-500">Marketplace Apps</p>
                                        <h3 className="text-3xl font-bold text-purple-700 mt-2">28</h3>
                                    </div>

                                </div>

                                {/* COMMUNICATIONS */}

                                <div className="border rounded-3xl p-6">

                                    <h3 className="font-bold text-xl mb-6">
                                        Communications
                                    </h3>

                                    <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">

                                        <div className="border rounded-2xl p-5">
                                            <h4 className="font-bold">WhatsApp Business</h4>
                                            <p className="text-green-600 mt-2">Connected</p>
                                        </div>

                                        <div className="border rounded-2xl p-5">
                                            <h4 className="font-bold">Twilio SMS</h4>
                                            <p className="text-green-600 mt-2">Connected</p>
                                        </div>

                                        <div className="border rounded-2xl p-5">
                                            <h4 className="font-bold">Gmail</h4>
                                            <p className="text-green-600 mt-2">Connected</p>
                                        </div>

                                        <div className="border rounded-2xl p-5">
                                            <h4 className="font-bold">Microsoft Outlook</h4>
                                            <p className="text-green-600 mt-2">Connected</p>
                                        </div>

                                    </div>

                                </div>

                                {/* FINANCE */}

                                <div className="border rounded-3xl p-6">

                                    <h3 className="font-bold text-xl mb-6">
                                        Finance & Payments
                                    </h3>

                                    <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">

                                        <div className="border rounded-2xl p-5">
                                            <h4 className="font-bold">MTN Mobile Money</h4>
                                            <p className="text-green-600 mt-2">Connected</p>
                                        </div>

                                        <div className="border rounded-2xl p-5">
                                            <h4 className="font-bold">Airtel Money</h4>
                                            <p className="text-green-600 mt-2">Connected</p>
                                        </div>

                                        <div className="border rounded-2xl p-5">
                                            <h4 className="font-bold">Flutterwave</h4>
                                            <p className="text-green-600 mt-2">Connected</p>
                                        </div>

                                        <div className="border rounded-2xl p-5">
                                            <h4 className="font-bold">Stripe</h4>
                                            <p className="text-green-600 mt-2">Connected</p>
                                        </div>

                                    </div>

                                </div>

                                {/* AI & PRODUCTIVITY */}

                                <div className="border rounded-3xl p-6">

                                    <h3 className="font-bold text-xl mb-6">
                                        AI & Productivity
                                    </h3>

                                    <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">

                                        <div className="border rounded-2xl p-5">
                                            <h4 className="font-bold">OpenAI</h4>
                                            <p className="text-green-600 mt-2">Connected</p>
                                        </div>

                                        <div className="border rounded-2xl p-5">
                                            <h4 className="font-bold">Google Maps</h4>
                                            <p className="text-green-600 mt-2">Connected</p>
                                        </div>

                                        <div className="border rounded-2xl p-5">
                                            <h4 className="font-bold">Google Drive</h4>
                                            <p className="text-green-600 mt-2">Connected</p>
                                        </div>

                                        <div className="border rounded-2xl p-5">
                                            <h4 className="font-bold">Microsoft 365</h4>
                                            <p className="text-green-600 mt-2">Connected</p>
                                        </div>

                                    </div>

                                </div>

                                {/* API CONFIGURATION */}

                                <div className="border rounded-3xl p-6">

                                    <h3 className="font-bold text-xl mb-6">
                                        API Gateway
                                    </h3>

                                    <div className="grid md:grid-cols-2 gap-4">

                                        <input
                                            className="border rounded-xl p-3"
                                            placeholder="API Base URL"
                                        />

                                        <input
                                            className="border rounded-xl p-3"
                                            placeholder="Webhook Endpoint"
                                        />

                                        <input
                                            className="border rounded-xl p-3"
                                            placeholder="API Key"
                                        />

                                        <input
                                            className="border rounded-xl p-3"
                                            placeholder="Secret Key"
                                            type="password"
                                        />

                                    </div>

                                </div>

                                {/* AI INTEGRATION INSIGHTS */}

                                <div className="border rounded-3xl p-6 bg-gradient-to-r from-cyan-50 to-blue-50">

                                    <h3 className="font-bold text-xl mb-5">
                                        AI Integration Intelligence
                                    </h3>

                                    <div className="space-y-4">

                                        <div className="bg-white border rounded-2xl p-4">

                                            <h4 className="font-semibold">
                                                Connection Health
                                            </h4>

                                            <p className="text-slate-600 mt-2">
                                                All production integrations are operating normally with 99.99% uptime.
                                            </p>

                                        </div>

                                        <div className="bg-white border rounded-2xl p-4">

                                            <h4 className="font-semibold">
                                                Recommendation
                                            </h4>

                                            <p className="text-slate-600 mt-2">
                                                Enable Power BI integration for executive dashboards and portfolio analytics.
                                            </p>

                                        </div>

                                    </div>

                                </div>

                                {/* ACTIONS */}

                                <div className="border-t pt-6">

                                    <div className="flex flex-wrap gap-3">

                                        <button className="px-5 py-3 bg-cyan-600 text-white rounded-xl">
                                            Save Integrations
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            Test Connections
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            API Logs
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            Marketplace
                                        </button>

                                    </div>

                                </div>

                            </div>

                        </div>


                        {/* Audit */}
                        {/* HEADER */}

                        <div className="bg-gradient-to-r from-slate-700 via-slate-800 to-black p-6">

                            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">

                                <div>

                                    <h2 className="text-3xl font-bold text-white">
                                        Audit & Compliance Centre
                                    </h2>

                                    <p className="text-slate-300 mt-1">
                                        Monitor system activity, compliance controls, user actions and regulatory reporting.
                                    </p>

                                </div>

                                <div className="flex gap-2">

                                    <span className="px-4 py-2 rounded-xl bg-white/10 text-white text-sm">
                                        Compliance Score 98%
                                    </span>

                                    <span className="px-4 py-2 rounded-xl bg-white/10 text-white text-sm">
                                        Audit Active
                                    </span>

                                </div>

                            </div>

                        </div>

                        <div className="p-6 space-y-8">

                            {/* COMPLIANCE OVERVIEW */}

                            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-5">

                                <div className="bg-green-50 border rounded-3xl p-5">

                                    <p className="text-sm text-slate-500">
                                        Compliance Score
                                    </p>

                                    <h3 className="text-4xl font-bold text-green-700 mt-2">
                                        98%
                                    </h3>

                                </div>

                                <div className="bg-blue-50 border rounded-3xl p-5">

                                    <p className="text-sm text-slate-500">
                                        Audit Events Today
                                    </p>

                                    <h3 className="text-4xl font-bold text-blue-700 mt-2">
                                        154
                                    </h3>

                                </div>

                                <div className="bg-orange-50 border rounded-3xl p-5">

                                    <p className="text-sm text-slate-500">
                                        Policy Violations
                                    </p>

                                    <h3 className="text-4xl font-bold text-orange-700 mt-2">
                                        2
                                    </h3>

                                </div>

                                <div className="bg-purple-50 border rounded-3xl p-5">

                                    <p className="text-sm text-slate-500">
                                        Retention Period
                                    </p>

                                    <h3 className="text-4xl font-bold text-purple-700 mt-2">
                                        7Y
                                    </h3>

                                </div>

                            </div>

                            {/* AUDIT LOG STREAM */}

                            <div className="border rounded-3xl p-6">

                                <div className="flex justify-between items-center mb-5">

                                    <h3 className="font-bold text-xl">
                                        Live Audit Stream
                                    </h3>

                                    <button className="px-4 py-2 border rounded-xl">
                                        View Full Logs
                                    </button>

                                </div>

                                <div className="space-y-4">

                                    <div className="border-l-4 border-green-500 bg-slate-50 p-4 rounded-r-2xl">
                                        <p className="font-medium">
                                            Payroll Approved
                                        </p>
                                        <p className="text-sm text-slate-500 mt-1">
                                            Director approved June payroll • 10:24 AM
                                        </p>
                                    </div>

                                    <div className="border-l-4 border-blue-500 bg-slate-50 p-4 rounded-r-2xl">
                                        <p className="font-medium">
                                            Attendance Rule Updated
                                        </p>
                                        <p className="text-sm text-slate-500 mt-1">
                                            Grace period changed from 10 to 15 minutes
                                        </p>
                                    </div>

                                    <div className="border-l-4 border-orange-500 bg-slate-50 p-4 rounded-r-2xl">
                                        <p className="font-medium">
                                            Office Access Granted
                                        </p>
                                        <p className="text-sm text-slate-500 mt-1">
                                            New office manager assigned to Kampala Office
                                        </p>
                                    </div>

                                </div>

                            </div>

                            {/* COMPLIANCE CONTROLS */}

                            <div className="border rounded-3xl p-6">

                                <h3 className="font-bold text-xl mb-5">
                                    Compliance Controls
                                </h3>

                                <div className="space-y-4">

                                    <label className="flex justify-between">
                                        <span>Immutable Audit Logs</span>
                                        <input type="checkbox" defaultChecked />
                                    </label>

                                    <label className="flex justify-between">
                                        <span>Payroll Change Tracking</span>
                                        <input type="checkbox" defaultChecked />
                                    </label>

                                    <label className="flex justify-between">
                                        <span>Attendance Edit Tracking</span>
                                        <input type="checkbox" defaultChecked />
                                    </label>

                                    <label className="flex justify-between">
                                        <span>Property Record Tracking</span>
                                        <input type="checkbox" defaultChecked />
                                    </label>

                                    <label className="flex justify-between">
                                        <span>User Activity Monitoring</span>
                                        <input type="checkbox" defaultChecked />
                                    </label>

                                </div>

                            </div>

                            {/* REGULATORY REPORTING */}

                            <div className="border rounded-3xl p-6">

                                <h3 className="font-bold text-xl mb-5">
                                    Regulatory & Governance Reports
                                </h3>

                                <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">

                                    <button className="border rounded-2xl p-5 hover:bg-slate-50 text-left">
                                        Attendance Audit Report
                                    </button>

                                    <button className="border rounded-2xl p-5 hover:bg-slate-50 text-left">
                                        Payroll Compliance Report
                                    </button>

                                    <button className="border rounded-2xl p-5 hover:bg-slate-50 text-left">
                                        Security Audit Report
                                    </button>

                                    <button className="border rounded-2xl p-5 hover:bg-slate-50 text-left">
                                        Executive Governance Report
                                    </button>

                                </div>

                            </div>

                            {/* AI COMPLIANCE INSIGHTS */}

                            <div className="border rounded-3xl p-6 bg-gradient-to-r from-slate-50 to-blue-50">

                                <h3 className="font-bold text-xl mb-5">
                                    AI Compliance Intelligence
                                </h3>

                                <div className="space-y-4">

                                    <div className="bg-white border rounded-2xl p-4">

                                        <h4 className="font-semibold">
                                            Compliance Risk Analysis
                                        </h4>

                                        <p className="text-slate-600 mt-2">
                                            No critical compliance risks detected across payroll, attendance or office operations.
                                        </p>

                                    </div>

                                    <div className="bg-white border rounded-2xl p-4">

                                        <h4 className="font-semibold">
                                            Audit Recommendation
                                        </h4>

                                        <p className="text-slate-600 mt-2">
                                            Consider quarterly permission reviews for office managers and supervisors.
                                        </p>

                                    </div>

                                </div>

                            </div>

                            {/* EXECUTIVE ACTIONS */}

                            <div className="border-t pt-6">

                                <h3 className="font-bold text-xl mb-5">
                                    Compliance Operations
                                </h3>

                                <div className="flex flex-wrap gap-3">

                                    <button className="px-5 py-3 bg-slate-900 text-white rounded-xl">
                                        Run Compliance Audit
                                    </button>

                                    <button className="px-5 py-3 border rounded-xl">
                                        Export Audit Logs
                                    </button>

                                    <button className="px-5 py-3 border rounded-xl">
                                        Generate Governance Report
                                    </button>

                                    <button className="px-5 py-3 border rounded-xl">
                                        Review Violations
                                    </button>

                                </div>

                            </div>

                        </div>

                        {/* Regional */}


                        {/* Backups */}
                        {/* BACKUP & RECOVERY CENTRE */}

                        <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden mt-6">

                            {/* HEADER */}

                            <div className="bg-gradient-to-r from-sky-700 via-blue-700 to-indigo-900 p-6">

                                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">

                                    <div>

                                        <h2 className="text-3xl font-bold text-white">
                                            Backup & Recovery Centre
                                        </h2>

                                        <p className="text-blue-100 mt-1">
                                            Protect company data, automate backups, monitor recovery readiness and manage disaster recovery.
                                        </p>

                                    </div>

                                    <div className="flex gap-2">

                                        <span className="px-4 py-2 rounded-xl bg-white/20 text-white text-sm">
                                            Backup Healthy
                                        </span>

                                        <span className="px-4 py-2 rounded-xl bg-white/20 text-white text-sm">
                                            Recovery Ready
                                        </span>

                                    </div>

                                </div>

                            </div>

                            <div className="p-6 space-y-8">

                                {/* BACKUP OVERVIEW */}

                                <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-5">

                                    <div className="bg-blue-50 border rounded-3xl p-5">

                                        <p className="text-sm text-slate-500">
                                            Last Backup
                                        </p>

                                        <h3 className="text-2xl font-bold text-blue-700 mt-2">
                                            Today
                                        </h3>

                                        <p className="text-sm text-blue-600 mt-2">
                                            02:00 AM
                                        </p>

                                    </div>

                                    <div className="bg-green-50 border rounded-3xl p-5">

                                        <p className="text-sm text-slate-500">
                                            Success Rate
                                        </p>

                                        <h3 className="text-4xl font-bold text-green-700 mt-2">
                                            100%
                                        </h3>

                                    </div>

                                    <div className="bg-purple-50 border rounded-3xl p-5">

                                        <p className="text-sm text-slate-500">
                                            Stored Backups
                                        </p>

                                        <h3 className="text-4xl font-bold text-purple-700 mt-2">
                                            184
                                        </h3>

                                    </div>

                                    <div className="bg-orange-50 border rounded-3xl p-5">

                                        <p className="text-sm text-slate-500">
                                            Storage Used
                                        </p>

                                        <h3 className="text-4xl font-bold text-orange-700 mt-2">
                                            1.8 GB
                                        </h3>

                                    </div>

                                </div>

                                {/* BACKUP CONFIGURATION */}

                                <div className="border rounded-3xl p-6">

                                    <h3 className="font-bold text-xl mb-5">
                                        Backup Configuration
                                    </h3>

                                    <div className="space-y-4">

                                        <label className="flex justify-between">
                                            <span>Automatic Daily Backups</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Database Snapshots</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Encrypted Backups</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                        <label className="flex justify-between">
                                            <span>Backup Verification</span>
                                            <input type="checkbox" defaultChecked />
                                        </label>

                                    </div>

                                </div>

                                {/* STORAGE DESTINATIONS */}

                                <div className="border rounded-3xl p-6">

                                    <h3 className="font-bold text-xl mb-5">
                                        Storage Destinations
                                    </h3>

                                    <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">

                                        <div className="border rounded-2xl p-5">
                                            <h4 className="font-bold">
                                                AWS S3
                                            </h4>
                                            <p className="text-green-600 mt-2">
                                                Connected
                                            </p>
                                        </div>

                                        <div className="border rounded-2xl p-5">
                                            <h4 className="font-bold">
                                                Google Drive
                                            </h4>
                                            <p className="text-green-600 mt-2">
                                                Connected
                                            </p>
                                        </div>

                                        <div className="border rounded-2xl p-5">
                                            <h4 className="font-bold">
                                                OneDrive
                                            </h4>
                                            <p className="text-green-600 mt-2">
                                                Connected
                                            </p>
                                        </div>

                                        <div className="border rounded-2xl p-5">
                                            <h4 className="font-bold">
                                                Local Storage
                                            </h4>
                                            <p className="text-green-600 mt-2">
                                                Active
                                            </p>
                                        </div>

                                    </div>

                                </div>

                                {/* DISASTER RECOVERY */}

                                <div className="border rounded-3xl p-6">

                                    <h3 className="font-bold text-xl mb-5">
                                        Disaster Recovery
                                    </h3>

                                    <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">

                                        <div className="border rounded-2xl p-5">

                                            <p className="text-sm text-slate-500">
                                                Recovery Readiness
                                            </p>

                                            <h4 className="text-3xl font-bold mt-2">
                                                98%
                                            </h4>

                                        </div>

                                        <div className="border rounded-2xl p-5">

                                            <p className="text-sm text-slate-500">
                                                Recovery Time
                                            </p>

                                            <h4 className="text-3xl font-bold mt-2">
                                                15 min
                                            </h4>

                                        </div>

                                        <div className="border rounded-2xl p-5">

                                            <p className="text-sm text-slate-500">
                                                Last Recovery Test
                                            </p>

                                            <h4 className="text-lg font-bold mt-2">
                                                3 Days Ago
                                            </h4>

                                        </div>

                                        <div className="border rounded-2xl p-5">

                                            <p className="text-sm text-slate-500">
                                                Test Result
                                            </p>

                                            <h4 className="text-3xl font-bold text-green-600 mt-2">
                                                Pass
                                            </h4>

                                        </div>

                                    </div>

                                </div>

                                {/* AI BACKUP INTELLIGENCE */}

                                <div className="border rounded-3xl p-6 bg-gradient-to-r from-blue-50 to-indigo-50">

                                    <h3 className="font-bold text-xl mb-5">
                                        AI Backup Intelligence
                                    </h3>

                                    <div className="space-y-4">

                                        <div className="bg-white border rounded-2xl p-4">

                                            <h4 className="font-semibold">
                                                Backup Health Analysis
                                            </h4>

                                            <p className="text-slate-600 mt-2">
                                                Backup health is excellent with no failed jobs detected in the last 90 days.
                                            </p>

                                        </div>

                                        <div className="bg-white border rounded-2xl p-4">

                                            <h4 className="font-semibold">
                                                Storage Forecast
                                            </h4>

                                            <p className="text-slate-600 mt-2">
                                                Current storage allocation will remain sufficient for approximately 18 months.
                                            </p>

                                        </div>

                                    </div>

                                </div>

                                {/* EXECUTIVE ACTIONS */}

                                <div className="border-t pt-6">

                                    <h3 className="font-bold text-xl mb-5">
                                        Backup Operations
                                    </h3>

                                    <div className="flex flex-wrap gap-3">

                                        <button className="px-5 py-3 bg-blue-600 text-white rounded-xl">
                                            Backup Now
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            Restore Backup
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            Recovery Test
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            Export Backup Logs
                                        </button>

                                        <button className="px-5 py-3 border rounded-xl">
                                            Disaster Recovery Report
                                        </button>

                                    </div>

                                </div>

                            </div>

                        </div>

                    </div>

                </div>
            </div>
        </main>
    );
}