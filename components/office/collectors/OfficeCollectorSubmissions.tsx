"use client";

type Submission = Record<string, unknown> & { collectorName?: string };

const money = (value: unknown) => `UGX ${Math.round(Number(value ?? 0)).toLocaleString()}`;

export default function OfficeCollectorSubmissions({ submissions }: { submissions: Submission[] }) {
    if (!submissions.length) return null;
    return (
        <section className="mx-auto mt-5 max-w-7xl px-4">
            <div className="rounded-3xl border border-amber-300/20 bg-slate-950/80 p-5 text-white shadow-2xl shadow-black/25">
                <div>
                    <p className="text-xs font-black uppercase tracking-wide text-amber-300">Legacy Collector Handovers</p>
                    <h2 className="mt-1 text-xl font-black">Historical Money Submissions</h2>
                    <p className="mt-2 max-w-3xl text-sm font-bold leading-6 text-slate-300">Collector-to-office handovers are closed for new activity. These records remain visible for audit only; new Collector cash must be banked through Bank Collections with a deposit slip.</p>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {submissions.map((submission) => (
                        <div key={String(submission.id)} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="break-words font-black">{submission.collectorName ?? "Collector"}</p>
                                    <p className="break-words text-sm font-bold text-slate-400">{submission.reference ? `Ref ${submission.reference}` : "No reference"} · {String(submission.status ?? "pending")}</p>
                                </div>
                                <p className="shrink-0 text-lg font-black text-emerald-200">{money(submission.amount)}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
