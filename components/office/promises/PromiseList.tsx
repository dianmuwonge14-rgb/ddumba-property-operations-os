import type { PromiseItem } from "@/lib/promises/types";
import { StatusChip } from "@/components/office/shared/EnterpriseUI";

type Props = {
    title: string;
    items: PromiseItem[];
    onSelect: (promise: PromiseItem) => void;
    tone: "red" | "blue" | "slate" | "green" | "orange";
    compact?: boolean;
};

const toneClasses = {
    red: "border-red-200 bg-red-50 text-red-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
    green: "border-green-200 bg-green-50 text-green-700",
    orange: "border-orange-200 bg-orange-50 text-orange-700",
};

export default function PromiseList({ title, items, onSelect, tone, compact = false }: Props) {
    return (
        <div className="enterprise-panel p-6">
            <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-xl">{title}</h2>
                <span className={`border rounded-full px-3 py-1 text-sm font-bold ${toneClasses[tone]}`}>
                    {items.length}
                </span>
            </div>

            <div className="space-y-3">
                {items.length === 0 ? (
                    <p className="text-slate-500">No promises in this bucket.</p>
                ) : items.map((promise) => (
                    <button
                        key={promise.id}
                        onClick={() => onSelect(promise)}
                        className="w-full rounded-2xl border border-slate-200 p-4 text-left transition hover:border-blue-500 hover:bg-blue-50"
                    >
                        <div className="flex justify-between gap-4">
                            <div>
                                <p className="font-bold">{promise.tenantName ?? "Tenant"}</p>
                                <p className="text-sm text-slate-500">
                                    {promise.roomNumber ? `Room ${promise.roomNumber}` : "No room"} · Due {promise.promised_date ?? promise.promise_date ?? "Not set"}
                                </p>
                            </div>
                            <p className="font-black text-slate-900">
                                UGX {Number(promise.promised_amount ?? promise.amount ?? 0).toLocaleString()}
                            </p>
                        </div>

                        {!compact && (
                            <div className="grid grid-cols-3 gap-3 mt-4 text-sm">
                                <div className="rounded-xl bg-slate-50 p-3">
                                    <p className="text-xs text-slate-500">Status</p>
                                    <div className="mt-1"><StatusChip label={promise.status ?? "open"} tone={tone === "red" ? "red" : tone === "green" ? "green" : tone === "orange" ? "orange" : "blue"} /></div>
                                </div>
                                <Info label="Follow-ups" value={String(promise.followups.length)} />
                                <Info label="Last Collection" value={promise.lastCollectionAmount ? `UGX ${promise.lastCollectionAmount.toLocaleString()}` : "None"} />
                            </div>
                        )}
                    </button>
                ))}
            </div>
        </div>
    );
}

function Info({ label, value }: { label: string; value: string }) {
    return (
        <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="font-semibold capitalize">{value}</p>
        </div>
    );
}
