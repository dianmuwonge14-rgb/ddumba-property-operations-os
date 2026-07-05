"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, UploadCloud } from "lucide-react";
import {
    analyzeLandlordCommissionWorkbook,
    applyLandlordCommissionWorkbookImport,
    type CommissionImportPreview,
} from "@/app/actions/landlord-commission-import";
import { EmptyState, StatusChip } from "@/components/office/shared/EnterpriseUI";

function money(value: number | null | undefined) {
    return `UGX ${Math.round(Number(value ?? 0)).toLocaleString()}`;
}

function percent(value: number | null | undefined) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "n/a";
    return `${Number(value).toFixed(2)}%`;
}

export default function LandlordCommissionImportCentre() {
    const fileRef = useRef<HTMLInputElement | null>(null);
    const [preview, setPreview] = useState<CommissionImportPreview | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    const importableRows = useMemo(
        () => preview?.rows.filter((row) => row.matchStatus === "matched" && row.calculatedCommissionRate !== null).length ?? 0,
        [preview],
    );

    function buildFormData() {
        const file = fileRef.current?.files?.[0];
        if (!file) throw new Error("Choose the LANDLORD'S CUT Excel file first.");
        const formData = new FormData();
        formData.set("file", file);
        return formData;
    }

    function runDryRun() {
        startTransition(async () => {
            setError(null);
            setMessage(null);
            try {
                const result = await analyzeLandlordCommissionWorkbook(buildFormData());
                setPreview(result);
                setMessage("Dry-run complete. Review matched, unmatched, and ambiguous rows before importing.");
            } catch (caught) {
                setError(caught instanceof Error ? caught.message : "Dry-run failed.");
            }
        });
    }

    function applyImport() {
        startTransition(async () => {
            setError(null);
            setMessage(null);
            try {
                const formData = buildFormData();
                formData.set("approved", "yes");
                const result = await applyLandlordCommissionWorkbookImport(formData);
                setMessage(`Imported ${result.importedRows} landlord commission rows. Skipped ${result.skippedRows} rows for review.`);
            } catch (caught) {
                setError(caught instanceof Error ? caught.message : "Import failed.");
            }
        });
    }

    return (
        <section className="enterprise-panel overflow-hidden">
            <div className="border-b border-slate-200 bg-slate-950 p-6 text-white">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="flex gap-4">
                        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-500 text-white">
                            <FileSpreadsheet size={24} />
                        </span>
                        <div>
                            <p className="text-xs font-black uppercase tracking-wide text-emerald-300">Commission Excel Import</p>
                            <h2 className="mt-1 text-2xl font-black">Landlord Cut Import Centre</h2>
                            <p className="mt-1 max-w-3xl text-sm font-semibold text-slate-300">
                                Upload the landlord commission workbook, review matches, then approve safe updates to existing landlords only.
                            </p>
                        </div>
                    </div>
                    <StatusChip label="dry-run first" tone="blue" />
                </div>
            </div>

            <div className="grid grid-cols-1 gap-5 p-5 xl:grid-cols-12">
                <div className="xl:col-span-4">
                    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                        <p className="text-sm font-black text-slate-950">Upload workbook</p>
                        <p className="mt-1 text-sm font-semibold text-slate-500">
                            Expected columns include landlord, phone, office/property, commission %, commission amount, or landlord net payable.
                        </p>
                        <input
                            ref={fileRef}
                            type="file"
                            accept=".xlsx,.xls"
                            className="mt-4 w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-700"
                        />
                        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <button
                                type="button"
                                onClick={runDryRun}
                                disabled={isPending}
                                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
                            >
                                <UploadCloud size={17} />
                                Run Dry-Run
                            </button>
                            <button
                                type="button"
                                onClick={applyImport}
                                disabled={isPending || !preview || importableRows === 0}
                                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
                            >
                                <CheckCircle2 size={17} />
                                Apply Approved
                            </button>
                        </div>
                        {message ? (
                            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{message}</div>
                        ) : null}
                        {error ? (
                            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">{error}</div>
                        ) : null}
                    </div>
                </div>

                <div className="xl:col-span-8">
                    {!preview ? (
                        <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6">
                            <EmptyState
                                title="No dry-run yet"
                                description="Choose the commission workbook and run dry-run analysis. The system will show detected columns, matched landlords, review rows, and calculated totals before any write happens."
                            />
                        </div>
                    ) : (
                        <PreviewReport preview={preview} importableRows={importableRows} />
                    )}
                </div>
            </div>
        </section>
    );
}

function PreviewReport({ preview, importableRows }: { preview: CommissionImportPreview; importableRows: number }) {
    const reviewRows = preview.rows.filter((row) => row.matchStatus !== "matched").slice(0, 12);
    const sampleRows = preview.rows.filter((row) => row.matchStatus === "matched").slice(0, 12);

    return (
        <div className="space-y-5">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <h3 className="text-xl font-black text-slate-950">{preview.fileName}</h3>
                        <p className="mt-1 text-sm font-bold text-slate-500">
                            Sheet: {preview.sheetName} · Columns: {preview.detectedColumns.join(", ")}
                        </p>
                    </div>
                    <StatusChip label={`${importableRows} safe rows`} tone={importableRows ? "green" : "orange"} />
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <Mini label="Total rows" value={preview.totalRows.toLocaleString()} />
                    <Mini label="Matched" value={preview.matchedRows.toLocaleString()} tone="text-emerald-700" />
                    <Mini label="Unmatched" value={preview.unmatchedRows.toLocaleString()} tone="text-red-700" />
                    <Mini label="Ambiguous" value={preview.ambiguousRows.toLocaleString()} tone="text-amber-700" />
                    <Mini label="Expected commission" value={money(preview.totalExpectedCompanyMonthlyCommission)} />
                    <Mini label="Landlord payable" value={money(preview.totalLandlordPayable)} />
                    <Mini label="Invalid" value={preview.invalidRows.toLocaleString()} tone="text-red-700" />
                    <Mini label="Status" value="Review before write" />
                </div>
            </div>

            <RowsTable title="Calculated commission preview" rows={sampleRows} />

            <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
                <div className="flex items-center gap-3">
                    <AlertTriangle className="text-amber-700" size={20} />
                    <div>
                        <h3 className="font-black text-slate-950">Rows requiring review</h3>
                        <p className="text-sm font-semibold text-slate-600">Unmatched, ambiguous, and invalid rows are never imported automatically.</p>
                    </div>
                </div>
                {reviewRows.length === 0 ? (
                    <p className="mt-4 text-sm font-bold text-emerald-700">No review rows detected in the first pass.</p>
                ) : (
                    <RowsTable title="Review list" rows={reviewRows} compact />
                )}
            </div>
        </div>
    );
}

function RowsTable({ title, rows, compact = false }: { title: string; rows: CommissionImportPreview["rows"]; compact?: boolean }) {
    return (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-4">
                <h3 className="font-black text-slate-950">{title}</h3>
            </div>
            <div className="overflow-x-auto">
                <table className="enterprise-table">
                    <thead>
                        <tr>
                            <th className="text-left">Row</th>
                            <th className="text-left">Workbook Landlord</th>
                            <th className="text-left">Matched Landlord</th>
                            <th className="text-left">Rent Roll</th>
                            <th className="text-left">Net Payable</th>
                            <th className="text-left">Commission</th>
                            <th className="text-left">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 ? (
                            <tr><td colSpan={7} className="p-5 text-sm font-bold text-slate-500">No rows to display.</td></tr>
                        ) : rows.map((row) => (
                            <tr key={`${row.rowNumber}-${row.landlordName}`}>
                                <td>{row.rowNumber}</td>
                                <td>
                                    <p className="font-black">{row.landlordName || "Missing"}</p>
                                    {!compact ? <p className="text-xs text-slate-500">{row.phone ?? row.officeOrProperty ?? ""}</p> : null}
                                </td>
                                <td>
                                    <p className="font-bold">{row.matchedLandlordName ?? "Needs review"}</p>
                                    <p className="text-xs text-slate-500">{row.matchReason}</p>
                                </td>
                                <td>{money(row.portfolioRentRoll)}</td>
                                <td>{money(row.calculatedLandlordNetPayable)}</td>
                                <td>{percent(row.calculatedCommissionRate)}</td>
                                <td><StatusChip label={row.matchStatus} tone={row.matchStatus === "matched" ? "green" : row.matchStatus === "ambiguous" ? "orange" : "red"} /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function Mini({ label, value, tone = "text-slate-950" }: { label: string; value: string; tone?: string }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">{label}</p>
            <p className={`mt-1 text-sm font-black ${tone}`}>{value}</p>
        </div>
    );
}
