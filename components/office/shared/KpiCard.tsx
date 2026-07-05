type Props = {
    label: string;
    value: string;
    note?: string;
    tone?: "green" | "red" | "blue" | "orange" | "dark";
    progress?: number;
};

export default function KpiCard({ label, value, note, tone = "dark", progress }: Props) {
    const colors = {
        green: "text-emerald-700 bg-emerald-500",
        red: "text-rose-700 bg-rose-500",
        blue: "text-blue-700 bg-blue-500",
        orange: "text-amber-700 bg-amber-500",
        dark: "text-slate-900",
    };
    const [textColor, barColor = "bg-slate-500"] = colors[tone].split(" ");
    const boundedProgress = Math.max(0, Math.min(100, progress ?? 0));

    return (
        <div className="enterprise-card min-h-36 p-5 transition hover:-translate-y-0.5 hover:shadow-xl">
            <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-bold text-slate-500">{label}</p>
                <span className="status-chip bg-slate-100 text-slate-700">Live</span>
            </div>

            <h2 className={`mt-4 text-3xl font-black ${textColor}`}>
                {value}
            </h2>

            {note && (
                <p className="mt-4 text-sm font-bold text-slate-500">
                    {note}
                </p>
            )}

            {typeof progress === "number" && (
                <div className="mt-3 h-2 rounded-full bg-slate-100">
                    <div className={`h-full rounded-full ${barColor}`} style={{ width: `${boundedProgress}%` }} />
                </div>
            )}
        </div>
    );
}
