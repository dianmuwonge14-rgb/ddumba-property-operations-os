export default function AIDirector() {
    return (
        <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-lg">

            <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">
                    AI Director
                </h2>

                <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
            </div>

            <p className="text-slate-400 text-sm mt-2">
                Executive recommendations generated from office activity
            </p>

            <div className="mt-6 space-y-4">

                <div className="bg-slate-800 rounded-2xl p-4">
                    <div className="font-semibold text-amber-400">
                        Priority Action
                    </div>

                    <p className="mt-2 text-sm">
                        Follow up 8 overdue tenants worth UGX 14.2M.
                    </p>
                </div>

                <div className="bg-slate-800 rounded-2xl p-4">
                    <div className="font-semibold text-green-400">
                        Opportunity
                    </div>

                    <p className="mt-2 text-sm">
                        Kigungu Office can exceed target by 7% today.
                    </p>
                </div>

                <div className="bg-slate-800 rounded-2xl p-4">
                    <div className="font-semibold text-red-400">
                        Risk Alert
                    </div>

                    <p className="mt-2 text-sm">
                        3 landlords awaiting settlement beyond SLA.
                    </p>
                </div>

            </div>

        </div>
    );
}