import PageHeader from "@/components/office/shared/PageHeader";
import KpiCard from "@/components/office/shared/KpiCard";
export default function TopCollectors() {
    return (
        <div className="bg-white rounded-3xl border border-slate-200 p-6">

            <h2 className="text-xl font-bold mb-5">
                Top Collectors Today
            </h2>

            <div className="space-y-4">

                <div className="flex justify-between">
                    <span>🥇 Sarah</span>
                    <span className="font-bold">
                        UGX 4.8M
                    </span>
                </div>

                <div className="flex justify-between">
                    <span>🥈 Moses</span>
                    <span className="font-bold">
                        UGX 3.6M
                    </span>
                </div>

                <div className="flex justify-between">
                    <span>🥉 Brian</span>
                    <span className="font-bold">
                        UGX 2.7M
                    </span>
                </div>

            </div>

        </div>
    );
}