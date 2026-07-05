export default function ExecutiveScoreboard() {
    return (
        <div className="bg-white rounded-3xl border border-slate-200 p-6">

            <h2 className="font-bold text-xl mb-5">
                Executive Scoreboard
            </h2>

            <div className="space-y-4">

                <div className="flex justify-between">
                    <span>Collection Efficiency</span>
                    <span className="font-bold text-green-600">
                        92%
                    </span>
                </div>

                <div className="flex justify-between">
                    <span>Landlord Satisfaction</span>
                    <span className="font-bold text-blue-600">
                        96%
                    </span>
                </div>

                <div className="flex justify-between">
                    <span>Staff Productivity</span>
                    <span className="font-bold text-amber-600">
                        89%
                    </span>
                </div>

                <div className="flex justify-between">
                    <span>Promise Fulfillment</span>
                    <span className="font-bold text-purple-600">
                        91%
                    </span>
                </div>

            </div>

        </div>
    );
}