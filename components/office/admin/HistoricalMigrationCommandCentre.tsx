"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, DatabaseZap, FileSearch, Loader2, ShieldCheck } from "lucide-react";
import { runHistoricalMigrationDryRun } from "@/app/actions/historical-migration";
import { StatusChip } from "@/components/office/shared/EnterpriseUI";
import type { HistoricalMigrationDryRunReport } from "@/lib/historical-migration/types";

export default function HistoricalMigrationCommandCentre() {
    const [report, setReport] = useState<HistoricalMigrationDryRunReport | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    function runDryRun() {
        startTransition(async () => {
            setError(null);
            try {
                setReport(await runHistoricalMigrationDryRun());
            } catch (caught) {
                setError(caught instanceof Error ? caught.message : "Dry-run failed.");
            }
        });
    }

    return (
        <section className="enterprise-panel overflow-hidden">
            <div className="border-b border-slate-200 bg-slate-950 p-6 text-white">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-center gap-3">
                        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-500">
                            <DatabaseZap size={23} />
                        </span>
                        <div>
                            <h2 className="text-xl font-black">Historical Migration Command Centre</h2>
                            <p className="text-sm text-slate-300">Dry-run workbook discovery, field mapping, duplicate analysis, and import estimates. No records are written in this mode.</p>
                        </div>
                    </div>
                    <button onClick={runDryRun} disabled={isPending} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-black text-slate-950 disabled:opacity-60">
                        {isPending ? <Loader2 className="animate-spin" size={17} /> : <FileSearch size={17} />}
                        Run Dry-Run Analysis
                    </button>
                </div>
            </div>

            {error && (
                <div className="border-b border-red-200 bg-red-50 p-5 text-sm font-bold text-red-700">
                    <AlertTriangle className="mr-2 inline" size={17} />
                    {error}
                </div>
            )}

            {!report ? (
                <div className="p-6">
                    <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                        <ShieldCheck className="mx-auto text-emerald-600" size={34} />
                        <h3 className="mt-3 text-xl font-black">Dry-run required before import</h3>
                        <p className="mx-auto mt-2 max-w-2xl text-sm font-bold text-slate-500">
                            This will read every worksheet in the connected master workbook, infer mappings, estimate records, and show duplicates before any import is allowed.
                        </p>
                    </div>
                </div>
            ) : (
                <div className="space-y-6 p-6">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
                        <Metric label="Rows discovered" value={report.totals.rowsDiscovered} />
                        <Metric label="Rows importable" value={report.totals.rowsImportable} />
                        <Metric label="Duplicates" value={report.totals.duplicatesMergedEstimate} />
                        <Metric label="Errors" value={report.totals.errors} />
                        <Metric label="Sheets" value={report.sheets.length} />
                        <Metric label="Mappings" value={report.mappings.length} />
                    </div>

                    <section className="rounded-3xl border border-slate-200 p-5">
                        <h3 className="font-black">Estimated Records</h3>
                        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
                            {Object.entries(report.totals).filter(([key]) => key.startsWith("estimated")).map(([key, value]) => (
                                <Metric key={key} label={key.replace("estimated", "").replace(/[A-Z]/g, " $&").trim()} value={Number(value)} compact />
                            ))}
                        </div>
                    </section>

                    <section className="rounded-3xl border border-slate-200 p-5">
                        <h3 className="font-black">Workbook Sheets Discovered</h3>
                        <div className="mt-4 overflow-x-auto">
                            <table className="enterprise-table min-w-[1200px]">
                                <thead><tr><th>Sheet</th><th>Rows</th><th>Columns</th><th>Header Row</th><th>Entities</th><th>Missing Columns</th><th>Unmapped Fields</th></tr></thead>
                                <tbody>
                                    {report.sheets.map((sheet) => (
                                        <tr key={sheet.name}>
                                            <td className="font-black">{sheet.name}</td>
                                            <td>{sheet.rowCount}</td>
                                            <td>{sheet.columnCount}</td>
                                            <td>{sheet.headerRow ?? "Not found"}</td>
                                            <td><div className="flex flex-wrap gap-1">{sheet.inferredEntities.map((entity) => <StatusChip key={entity} label={entity} tone={entity === "unknown" ? "orange" : "blue"} />)}</div></td>
                                            <td>{sheet.missingColumns.join(", ") || "None"}</td>
                                            <td>{sheet.unmappedFields.slice(0, 8).join(", ") || "None"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section className="rounded-3xl border border-slate-200 p-5">
                        <h3 className="font-black">Field Mapping Table</h3>
                        <div className="mt-4 max-h-[420px] overflow-auto">
                            <table className="enterprise-table min-w-[900px]">
                                <thead><tr><th>Sheet</th><th>Source Column</th><th>Target Entity</th><th>Target Field</th><th>Confidence</th></tr></thead>
                                <tbody>
                                    {report.mappings.map((mapping, index) => (
                                        <tr key={`${mapping.sheet}-${mapping.sourceColumn}-${index}`}>
                                            <td>{mapping.sheet}</td>
                                            <td className="font-black">{mapping.sourceColumn}</td>
                                            <td>{mapping.targetEntity}</td>
                                            <td>{mapping.targetField}</td>
                                            <td>{Math.round(mapping.confidence * 100)}%</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section className="rounded-3xl border border-slate-200 p-5">
                        <h3 className="font-black">Duplicate Resolution Signals</h3>
                        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
                            {Object.entries(report.duplicates).map(([key, value]) => <Metric key={key} label={key} value={value} compact />)}
                        </div>
                    </section>

                    <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
                        <p className="font-black">Approval gate</p>
                        <p className="mt-1 text-sm font-bold">No Supabase records have been imported. Review this dry-run report and approve before any write-mode migration is built or executed.</p>
                    </div>
                </div>
            )}
        </section>
    );
}

function Metric({ label, value, compact = false }: { label: string; value: number; compact?: boolean }) {
    return (
        <div className={`rounded-2xl border border-slate-200 bg-white ${compact ? "p-3" : "p-4"}`}>
            <p className="text-xs font-black uppercase text-slate-400">{label}</p>
            <p className="mt-1 text-2xl font-black text-slate-950">{value.toLocaleString()}</p>
        </div>
    );
}
