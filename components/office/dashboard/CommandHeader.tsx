import { Bell, Bot, CalendarDays, CheckCircle2, Clock3, MapPin } from "lucide-react";

export default function CommandHeader() {
    const now = new Date();
    const businessDate = new Intl.DateTimeFormat("en-UG", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Africa/Kampala",
    }).format(now);
    const businessTime = new Intl.DateTimeFormat("en-UG", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "Africa/Kampala",
    }).format(now);

    return (
        <div className="enterprise-panel p-6 xl:p-8">

            <div className="flex flex-col gap-6 2xl:flex-row 2xl:items-center 2xl:justify-between">

                <div className="min-w-0">
                    <div className="inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-black uppercase text-blue-700">
                        Executive command
                    </div>
                    <h1 className="mt-4 text-3xl font-black text-slate-950 xl:text-4xl">
                        DDUMBA PROPERTY MANAGEMENT
                    </h1>

                    <p className="text-slate-500 mt-2">
                        Office Operations Command Centre
                    </p>

                    <div className="mt-4 flex flex-wrap gap-3 text-sm">

                        <span className="status-chip bg-slate-100 text-slate-700">
                            <MapPin size={14} />
                            Kigungu Office
                        </span>

                        <span className="status-chip bg-slate-100 text-slate-700">
                            <CalendarDays size={14} />
                            {businessDate}
                        </span>

                        <span className="status-chip bg-slate-100 text-slate-700">
                            <Clock3 size={14} />
                            {businessTime}
                        </span>

                    </div>
                </div>

                <div className="enterprise-card min-w-60 p-5 text-center">

                    <p className="text-slate-500 text-sm">
                        Office Collection Performance
                    </p>

                    <h2 className="text-5xl font-bold text-green-600">
                        92%
                    </h2>

                    <p className="text-slate-500">
                        Target Achievement
                    </p>

                </div>

                <div className="grid min-w-72 gap-2 text-sm">

                    <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                        <span className="inline-flex items-center gap-2"><Bell size={16} /> Notifications</span>
                        <strong>5</strong>
                    </div>

                    <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                        <span className="inline-flex items-center gap-2"><Bot size={16} /> AI Alerts</span>
                        <strong>2</strong>
                    </div>

                    <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                        <span>Pending Report</span>
                        <strong>1</strong>
                    </div>

                    <div className="flex items-center justify-between rounded-2xl bg-emerald-50 px-4 py-3 font-bold text-emerald-700">
                        <span className="inline-flex items-center gap-2"><CheckCircle2 size={16} /> Clocked In</span>
                    </div>

                </div>

            </div>

            {/* PERFORMANCE BANNER */}

            <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900">

                <h3 className="text-xl font-bold">
                    #1 Performing Office Today
                </h3>

                <p>
                    Kigungu Office is leading all offices with a 92% collection performance rate.
                </p>

            </div>

        </div>
    );
}
