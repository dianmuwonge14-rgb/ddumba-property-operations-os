export default function MissionControl() {
    return (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm">

            <div className="px-6 py-5 border-b border-slate-200">

                <h2 className="text-xl font-bold">
                    Mission Control
                </h2>

                <p className="text-slate-500 text-sm mt-1">
                    Real-time operational activity across all offices
                </p>

            </div>

            <div className="p-6 space-y-4">

                <div className="flex items-start gap-4 p-4 rounded-2xl bg-green-50">
                    <div className="text-2xl">💰</div>

                    <div>
                        <h3 className="font-semibold">
                            Collection Received
                        </h3>

                        <p className="text-slate-600 text-sm">
                            Sarah collected UGX 850,000 from Kigungu Apartments
                        </p>

                        <p className="text-xs text-slate-400 mt-1">
                            2 minutes ago
                        </p>
                    </div>
                </div>

                <div className="flex items-start gap-4 p-4 rounded-2xl bg-blue-50">
                    <div className="text-2xl">🏢</div>

                    <div>
                        <h3 className="font-semibold">
                            Property Inspection
                        </h3>

                        <p className="text-slate-600 text-sm">
                            New inspection submitted for Lake View Residences
                        </p>

                        <p className="text-xs text-slate-400 mt-1">
                            12 minutes ago
                        </p>
                    </div>
                </div>

                <div className="flex items-start gap-4 p-4 rounded-2xl bg-amber-50">
                    <div className="text-2xl">⚠️</div>

                    <div>
                        <h3 className="font-semibold">
                            Promise Due Today
                        </h3>

                        <p className="text-slate-600 text-sm">
                            Tenant commitment expires at 5:00 PM
                        </p>

                        <p className="text-xs text-slate-400 mt-1">
                            High priority
                        </p>
                    </div>
                </div>

            </div>

        </div>
    );
}