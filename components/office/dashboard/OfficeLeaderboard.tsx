export default function OfficeLeaderboard() {
    const offices = [
        { rank: 1, office: "Kigungu", score: 92, tone: "bg-emerald-500", status: "Excellent" },
        { rank: 2, office: "Entebbe", score: 88, tone: "bg-blue-500", status: "Strong" },
        { rank: 3, office: "Kampala", score: 84, tone: "bg-amber-500", status: "Stable" },
    ];

    return (
        <div className="enterprise-panel p-6">

            <h2 className="text-xl font-bold mb-6">
                Office Rankings
            </h2>

            <div className="space-y-5">
                {offices.map((office) => (
                    <div key={office.office}>
                        <div className="mb-2 flex items-center justify-between">
                            <span className="inline-flex items-center gap-3 font-bold">
                                <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-950 text-sm text-white">{office.rank}</span>
                                {office.office}
                            </span>
                            <span className="status-chip bg-slate-100 text-slate-700">{office.status}</span>
                        </div>

                        <div className="h-3 rounded-full bg-slate-100">
                            <div className={`h-3 rounded-full ${office.tone}`} style={{ width: `${office.score}%` }} />
                        </div>
                    </div>
                ))}

            </div>

        </div>
    );
}
