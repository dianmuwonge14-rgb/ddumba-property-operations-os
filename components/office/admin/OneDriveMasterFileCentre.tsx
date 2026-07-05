"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Cloud, Loader2, RefreshCcw, Save } from "lucide-react";
import { connectOneDriveMasterFile, syncOneDriveMasterFile } from "@/app/actions/onedrive-master";
import { StatusChip } from "@/components/office/shared/EnterpriseUI";
import type { AdminCentreData, OfficeRow } from "@/lib/admin-centre/types";

type Props = {
    config: AdminCentreData["oneDriveMaster"];
    offices: OfficeRow[];
};

export default function OneDriveMasterFileCentre({ config, offices }: Props) {
    const [message, setMessage] = useState<string | null>(null);
    const [tone, setTone] = useState<"success" | "error" | "info">("info");
    const [isPending, startTransition] = useTransition();

    function syncNow() {
        startTransition(async () => {
            setMessage(null);
            try {
                const result = await syncOneDriveMasterFile();
                setTone(result.ok ? "success" : "error");
                setMessage(result.message);
            } catch (error) {
                setTone("error");
                setMessage(error instanceof Error ? error.message : "Sync failed.");
            }
        });
    }

    return (
        <section className="enterprise-panel overflow-hidden">
            <div className="border-b border-slate-200 bg-slate-950 p-6 text-white">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-center gap-3">
                        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-500">
                            <Cloud size={23} />
                        </span>
                        <div>
                            <h2 className="text-xl font-black">OneDrive Master Excel File</h2>
                            <p className="text-sm text-slate-300">Supabase remains the live database. This sync writes reporting rows into the official master workbook.</p>
                        </div>
                    </div>
                    <StatusChip label={config?.lastSyncStatus ?? "never"} tone={statusTone(config?.lastSyncStatus)} />
                </div>
            </div>

            <form action={connectOneDriveMasterFile} className="grid grid-cols-1 gap-6 p-6 xl:grid-cols-12">
                <div className="xl:col-span-5">
                    <h3 className="font-black">Import Workbook Archive</h3>
                    <p className="mt-1 text-sm font-bold text-slate-500">Workbook sync is disabled for live operations. Approved imports are stored in Supabase, which is now the source of truth.</p>
                    <div className="mt-4 space-y-3">
                        <label className="block">
                            <span className="text-xs font-black uppercase text-slate-400">Provider</span>
                            <select name="provider" defaultValue={config?.provider ?? "microsoft_graph"} className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold">
                                <option value="microsoft_graph">Import reference only</option>
                                <option value="local_file">Disabled local workbook path</option>
                            </select>
                        </label>
                        <Input name="localFilePath" label="Local workbook path (disabled)" defaultValue={config?.localFilePath ?? ""} />
                        <Input name="webUrl" label="OneDrive web URL" defaultValue={config?.webUrl ?? ""} />
                        <Input name="driveId" label="Microsoft Graph Drive ID" defaultValue="" />
                        <Input name="itemId" label="Microsoft Graph Item ID" defaultValue="" />
                        <Input name="companySheetName" label="Company consolidated sheet" defaultValue={config?.companySheetName ?? "DDUMBA COMPANY SYNC"} />
                    </div>
                </div>

                <div className="xl:col-span-7">
                    <h3 className="font-black">Office Sheet Mapping</h3>
                    <p className="mt-1 text-sm font-bold text-slate-500">Each office writes only to its mapped tab. Office users never receive admin/company sheets from the app.</p>
                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                        {offices.map((office) => (
                            <Input
                                key={office.id}
                                name={`officeSheet:${office.id}`}
                                label={office.office_name}
                                defaultValue={config?.officeSheetMap?.[office.id] ?? `DDUMBA ${office.office_name}`}
                            />
                        ))}
                    </div>
                    <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                            <Mini label="Last Sync" value={config?.lastSyncAt ? formatDate(config.lastSyncAt) : "Never"} />
                            <Mini label="Source" value={config?.provider === "microsoft_graph" ? "Microsoft Graph" : "Mounted workbook"} />
                            <Mini label="Sheets" value={`${Object.keys(config?.officeSheetMap ?? {}).length + 1}`} />
                        </div>
                        {config?.lastSyncError && (
                            <div className="mt-4 flex gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
                                <AlertTriangle size={18} />
                                {config.lastSyncError}
                            </div>
                        )}
                    </div>
                    <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                        <button className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white">
                            <Save size={17} />
                            Save Connection
                        </button>
                        <button type="button" onClick={syncNow} disabled={isPending} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-700 px-5 py-3 text-sm font-black text-white disabled:opacity-60">
                            {isPending ? <Loader2 className="animate-spin" size={17} /> : <RefreshCcw size={17} />}
                            Sync Master Workbook Now
                        </button>
                    </div>
                </div>
            </form>

            {message && (
                <div className={`border-t px-6 py-4 text-sm font-black ${tone === "success" ? "border-green-200 bg-green-50 text-green-700" : tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-blue-200 bg-blue-50 text-blue-700"}`}>
                    {tone === "success" ? <CheckCircle2 className="mr-2 inline" size={16} /> : null}
                    {message}
                </div>
            )}
        </section>
    );
}

function Input({ name, label, defaultValue }: { name: string; label: string; defaultValue: string }) {
    return (
        <label className="block">
            <span className="text-xs font-black uppercase text-slate-400">{label}</span>
            <input name={name} defaultValue={defaultValue} className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none focus:border-blue-500 focus:bg-white" />
        </label>
    );
}

function Mini({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl bg-white p-3">
            <p className="text-xs font-bold text-slate-400">{label}</p>
            <p className="mt-1 truncate text-sm font-black text-slate-900">{value}</p>
        </div>
    );
}

function statusTone(status: string | null | undefined) {
    if (status === "success") return "green";
    if (status === "error") return "red";
    return "orange";
}

function formatDate(value: string) {
    return new Intl.DateTimeFormat("en-UG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Kampala" }).format(new Date(value));
}
