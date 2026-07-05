import { AlertTriangle, CheckCircle2, FileSpreadsheet } from "lucide-react";
import { EmptyState, PageHero, StatusChip } from "@/components/office/shared/EnterpriseUI";
import type { CommissionReviewData } from "@/lib/landlord-commission-import/review-data";

type Props = {
    data: CommissionReviewData;
};

function money(value: number | null) {
    return value === null ? "n/a" : `UGX ${Math.round(value).toLocaleString()}`;
}

function formatDate(value: string | null) {
    if (!value) return "No import batch";
    return new Intl.DateTimeFormat("en-UG", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Africa/Kampala",
    }).format(new Date(value));
}

export default function CommissionImportReviewCentre({ data }: Props) {
    return (
        <main className="enterprise-page">
            <div className="enterprise-shell">
                <PageHero
                    title="Commission Import Review Queue"
                    subtitle={`${data.fileName ?? "No workbook"} · ${formatDate(data.createdAt)} · review-only rows were not imported`}
                    badge="Finance Controls"
                >
                    <div className="enterprise-card px-6 py-4">
                        <p className="text-sm font-bold text-slate-500">Imported safely</p>
                        <p className="text-3xl font-black text-emerald-700">{data.totals.importedRows}</p>
                    </div>
                </PageHero>

                <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5">
                    <Summary label="Workbook Rows" value={data.totals.totalRows.toLocaleString()} />
                    <Summary label="Imported" value={data.totals.importedRows.toLocaleString()} tone="text-emerald-700" />
                    <Summary label="Review Queue" value={data.totals.reviewRows.toLocaleString()} tone="text-amber-700" />
                    <Summary label="Unmatched" value={data.totals.unmatchedRows.toLocaleString()} tone="text-red-700" />
                    <Summary label="Invalid Values" value={data.totals.invalidRows.toLocaleString()} tone="text-red-700" />
                </section>

                <section className="enterprise-panel mt-6 overflow-hidden">
                    <div className="flex flex-col gap-3 border-b border-slate-200 p-6 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-center gap-3">
                            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-50 text-amber-700">
                                <FileSpreadsheet size={21} />
                            </span>
                            <div>
                                <h2 className="text-xl font-black text-slate-950">Rows Not Imported</h2>
                                <p className="text-sm font-semibold text-slate-500">
                                    These rows need manual review because the landlord was unmatched or the workbook amount does not reconcile with the current Supabase rent roll.
                                </p>
                            </div>
                        </div>
                        <StatusChip label={`${data.totals.reviewRows} rows`} tone={data.totals.reviewRows ? "orange" : "green"} />
                    </div>
                    <div className="overflow-x-auto">
                        <table className="enterprise-table">
                            <thead>
                                <tr>
                                    <th className="text-left">Row</th>
                                    <th className="text-left">Unmatched Landlord</th>
                                    <th className="text-left">Workbook Value</th>
                                    <th className="text-left">Supabase Value</th>
                                    <th className="text-left">Suggested Match</th>
                                    <th className="text-left">Reason</th>
                                    <th className="text-left">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.rows.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="p-6">
                                            <EmptyState title="No review rows" description="Every row in the latest commission workbook imported cleanly." />
                                        </td>
                                    </tr>
                                ) : data.rows.map((row) => (
                                    <tr key={row.id}>
                                        <td>{row.rowNumber}</td>
                                        <td>
                                            <p className="font-black text-slate-950">{row.landlordName}</p>
                                            <p className="text-xs font-bold text-slate-500">Confidence {row.confidence}%</p>
                                        </td>
                                        <td><span className="font-black">{money(row.workbookValue)}</span></td>
                                        <td>{money(row.supabaseValue)}</td>
                                        <td>
                                            {row.suggestedLandlordName ? (
                                                <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
                                                    <CheckCircle2 size={14} />
                                                    {row.suggestedLandlordName}
                                                </div>
                                            ) : (
                                                <span className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-700">
                                                    <AlertTriangle size={14} />
                                                    No safe match
                                                </span>
                                            )}
                                        </td>
                                        <td className="max-w-md text-sm font-semibold text-slate-600">{row.reason}</td>
                                        <td><StatusChip label={row.status} tone={row.status === "ambiguous" ? "orange" : "red"} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>
        </main>
    );
}

function Summary({ label, value, tone = "text-slate-950" }: { label: string; value: string; tone?: string }) {
    return (
        <div className="enterprise-card p-5">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
            <p className={`mt-2 text-2xl font-black ${tone}`}>{value}</p>
        </div>
    );
}
