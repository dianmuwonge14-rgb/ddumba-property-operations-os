import {
    ArrowDownRight,
    ArrowUpRight,
    Circle,
    FileSearch,
    Minus,
    Search,
    ShieldCheck,
    Sparkles,
} from "lucide-react";

type Tone = "green" | "red" | "blue" | "orange" | "purple" | "slate" | "cyan";
type EnterpriseKpiCardProps = {
    title: string;
    value: string;
    tone?: Tone;
    trend?: "up" | "down" | "flat";
    trendLabel?: string;
    progress?: number;
    status?: string;
};

const toneMap: Record<Tone, { text: string; bg: string; bar: string; chip: string }> = {
    green: { text: "text-emerald-700", bg: "bg-emerald-50", bar: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700" },
    red: { text: "text-rose-700", bg: "bg-rose-50", bar: "bg-rose-500", chip: "bg-rose-50 text-rose-700" },
    blue: { text: "text-blue-700", bg: "bg-blue-50", bar: "bg-blue-500", chip: "bg-blue-50 text-blue-700" },
    orange: { text: "text-amber-700", bg: "bg-amber-50", bar: "bg-amber-500", chip: "bg-amber-50 text-amber-700" },
    purple: { text: "text-violet-700", bg: "bg-violet-50", bar: "bg-violet-500", chip: "bg-violet-50 text-violet-700" },
    slate: { text: "text-slate-800", bg: "bg-slate-50", bar: "bg-slate-500", chip: "bg-slate-100 text-slate-700" },
    cyan: { text: "text-cyan-700", bg: "bg-cyan-50", bar: "bg-cyan-500", chip: "bg-cyan-50 text-cyan-700" },
};

export function EnterpriseShell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return (
        <main className="enterprise-page">
            <div className={`enterprise-shell ${className}`}>
                {children}
            </div>
        </main>
    );
}

export function GlassPanel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
    return (
        <section className={`enterprise-panel ${className}`}>
            {children}
        </section>
    );
}

export function SectionTitle({
    eyebrow,
    title,
    description,
    action,
}: {
    eyebrow?: string;
    title: string;
    description?: string;
    action?: React.ReactNode;
}) {
    return (
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
                {eyebrow && <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">{eyebrow}</p>}
                <h2 className="mt-1 text-xl font-black text-slate-950 sm:text-2xl">{title}</h2>
                {description && <p className="mt-1 max-w-2xl text-sm font-semibold text-slate-500">{description}</p>}
            </div>
            {action && <div className="shrink-0">{action}</div>}
        </div>
    );
}

export function StatusPill({ label, tone = "slate" }: { label: string; tone?: Tone }) {
    return <StatusChip label={label} tone={tone} />;
}

export function PremiumKpiCard(props: EnterpriseKpiCardProps) {
    return <EnterpriseKpiCard {...props} />;
}

export function CommandHeader({
    title,
    subtitle,
    badge = "Live",
    children,
}: {
    title: string;
    subtitle: string;
    badge?: string;
    children?: React.ReactNode;
}) {
    return (
        <div className="relative z-10 mb-8 overflow-hidden rounded-[32px] border border-white/10 bg-slate-950/88 p-5 text-white shadow-2xl shadow-black/35 backdrop-blur-2xl sm:p-6 2xl:flex 2xl:items-end 2xl:justify-between 2xl:gap-6">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(59,130,246,0.38),transparent_30%),radial-gradient(circle_at_92%_18%,rgba(20,184,166,0.22),transparent_26%),linear-gradient(135deg,rgba(255,255,255,0.08),transparent_38%)]" />
            <div className="relative min-w-0">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-black uppercase text-cyan-100 shadow-sm sm:text-xs">
                    <ShieldCheck size={14} />
                    {badge}
                </div>
                <h1 className="mt-3 max-w-5xl text-3xl font-black text-white sm:text-4xl xl:text-5xl">{title}</h1>
                <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-300 sm:text-base">{subtitle}</p>
            </div>
            {children ? <div className="relative mt-5 shrink-0 2xl:mt-0">{children}</div> : null}
        </div>
    );
}

export function PageHero({
    title,
    subtitle,
    badge = "Live",
    children,
}: {
    title: string;
    subtitle: string;
    badge?: string;
    children?: React.ReactNode;
}) {
    return <CommandHeader title={title} subtitle={subtitle} badge={badge}>{children}</CommandHeader>;
}

export function EnterpriseKpiCard({
    title,
    value,
    tone = "slate",
    trend = "flat",
    trendLabel = "Current period",
    progress,
    status = "Live",
}: EnterpriseKpiCardProps) {
    const colors = toneMap[tone];
    const TrendIcon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;
    const boundedProgress = Math.max(0, Math.min(100, progress ?? 0));

    return (
        <div className="enterprise-card group relative min-h-36 overflow-hidden p-5 transition duration-200 hover:-translate-y-1 hover:border-blue-200 hover:shadow-2xl">
            <div className={`absolute inset-x-0 top-0 h-1.5 ${colors.bar}`} />
            <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-blue-500/10 blur-2xl transition group-hover:bg-cyan-400/20" />
            <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-bold text-slate-500">{title}</p>
                <span className={`status-chip ${colors.chip}`}>{status}</span>
            </div>
            <div className={`mt-4 text-3xl font-black tracking-tight sm:text-4xl ${colors.text}`}>{value}</div>
            <div className="mt-4 flex items-center justify-between gap-3 text-xs font-bold text-slate-500">
                <span className={`inline-flex items-center gap-1 ${trend === "down" ? "text-rose-600" : trend === "up" ? "text-emerald-600" : "text-slate-500"}`}>
                    <TrendIcon size={15} />
                    {trendLabel}
                </span>
                {typeof progress === "number" && <span>{boundedProgress}%</span>}
            </div>
            {typeof progress === "number" && (
                <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100 shadow-inner">
                    <div className={`h-full rounded-full ${colors.bar} shadow-sm`} style={{ width: `${boundedProgress}%` }} />
                </div>
            )}
        </div>
    );
}

export function StatusChip({ label, tone = "slate" }: { label: string; tone?: Tone }) {
    return (
        <span className={`status-chip ${toneMap[tone].chip}`}>
            <Circle size={8} fill="currentColor" />
            {label}
        </span>
    );
}

export function SearchBox({
    value,
    onChange,
    placeholder,
}: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
}) {
    return (
        <label className="relative block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
            <input
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder}
                className="w-full rounded-2xl border border-slate-200 bg-white/95 py-3 pl-10 pr-4 text-sm font-semibold outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            />
        </label>
    );
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
    return (
        <div className="enterprise-card relative flex min-h-56 flex-col items-center justify-center overflow-hidden p-8 text-center">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400" />
            <div className="mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-slate-950 text-white shadow-xl">
                <FileSearch size={28} />
            </div>
            <h3 className="text-lg font-black text-slate-900">{title}</h3>
            <p className="mt-2 max-w-md text-sm text-slate-500">{description}</p>
            {action && <div className="mt-5">{action}</div>}
        </div>
    );
}

export function LoadingSkeleton() {
    return (
        <main className="enterprise-page">
            <div className="enterprise-shell">
                <div className="mb-8 flex flex-col gap-5 2xl:flex-row 2xl:items-end 2xl:justify-between">
                    <div className="space-y-4">
                        <div className="skeleton-pulse h-8 w-44 rounded-full" />
                        <div className="skeleton-pulse h-12 w-full max-w-xl rounded-2xl" />
                        <div className="skeleton-pulse h-5 w-full max-w-2xl rounded-xl" />
                    </div>
                    <div className="rounded-3xl bg-slate-950 p-5 text-white shadow-xl">
                        <div className="flex items-center gap-3">
                            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-500">
                                <Sparkles size={24} />
                            </div>
                            <div>
                                <div className="skeleton-pulse h-4 w-24 rounded-xl bg-white/20" />
                                <div className="skeleton-pulse mt-3 h-7 w-40 rounded-xl bg-white/20" />
                            </div>
                        </div>
                    </div>
                </div>
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5">
                    {Array.from({ length: 10 }).map((_, index) => (
                        <div key={index} className="enterprise-card p-5">
                            <div className="skeleton-pulse h-4 w-28 rounded-xl" />
                            <div className="skeleton-pulse mt-5 h-9 w-32 rounded-xl" />
                            <div className="skeleton-pulse mt-5 h-2 w-full rounded-full" />
                        </div>
                    ))}
                </div>
                <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-12">
                    <div className="enterprise-card h-96 xl:col-span-4" />
                    <div className="enterprise-card h-96 xl:col-span-8" />
                </div>
            </div>
        </main>
    );
}
