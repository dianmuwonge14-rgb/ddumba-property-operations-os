import type { CollectionActionItem } from "@/lib/collections/types";

type Props = {
    items: CollectionActionItem[];
};

const colors: Record<string, string> = {
    call: "bg-blue-500",
    whatsapp: "bg-green-500",
    sms: "bg-purple-500",
    visit: "bg-orange-500",
    notice: "bg-red-500",
    payment_recorded: "bg-emerald-500",
    promise_created: "bg-indigo-500",
    promise_follow_up: "bg-slate-700",
};

function formatTime(value: string) {
    return new Intl.DateTimeFormat("en-UG", {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(new Date(value));
}

export default function CollectionTimeline({ items }: Props) {
    return (
        <div className="enterprise-panel p-6">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h2 className="text-2xl font-black">Collection Action History</h2>
                    <p className="text-slate-500">Latest office-scoped recovery activity</p>
                </div>

                <div className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-700">
                    {items.length} Activities
                </div>
            </div>

            {items.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-slate-500">
                    No collection actions recorded for the active office yet.
                </div>
            ) : (
                <div className="relative">
                    <div className="absolute left-5 top-0 bottom-0 w-1 bg-slate-200 rounded-full" />

                    <div className="space-y-8">
                        {items.map((item) => (
                            <div key={item.id} className="relative flex gap-5">
                                <div
                                    className={`w-10 h-10 rounded-full ${colors[item.action_type] ?? "bg-slate-500"} border-4 border-white shadow-lg z-10`}
                                />

                                <div className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
                                    <div className="flex justify-between items-start gap-4">
                                        <div>
                                            <h3 className="font-bold text-lg capitalize">
                                                {item.action_type.replaceAll("_", " ")}
                                            </h3>
                                            <p className="text-slate-600 mt-1">
                                                {item.notes || item.outcome || "No notes recorded."}
                                            </p>
                                            <p className="text-sm text-slate-500 mt-2">
                                                {item.tenantName ?? "Tenant not labelled"}
                                            </p>
                                        </div>

                                        <div className="text-right text-xs text-slate-500">
                                            {formatTime(item.created_at)}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
