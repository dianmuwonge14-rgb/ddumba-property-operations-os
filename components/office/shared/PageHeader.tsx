type Props = {
    title: string;
    subtitle: string;
    badge?: string;
};

export default function PageHeader({ title, subtitle, badge = "LIVE" }: Props) {
    return (
        <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
                <div className="inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-black uppercase text-blue-700">
                    Operations Command
                </div>
                <h1 className="mt-4 text-3xl font-black text-slate-950 sm:text-4xl xl:text-5xl">
                    {title}
                </h1>

                <p className="mt-2 max-w-3xl text-base text-slate-500 sm:text-lg">
                    {subtitle}
                </p>
            </div>

            <div className="enterprise-card px-5 py-4">
                <p className="text-xs text-slate-500">Operations Status</p>

                <div className="flex items-center gap-2 mt-1">
                    <span className="h-3 w-3 rounded-full bg-green-500" />
                    <span className="font-bold text-green-600">{badge}</span>
                </div>
            </div>
        </div>
    );
}
