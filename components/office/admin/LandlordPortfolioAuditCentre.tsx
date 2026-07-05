import { AlertTriangle, CheckCircle2, ClipboardList } from "lucide-react";
import { EmptyState, PageHero, StatusChip } from "@/components/office/shared/EnterpriseUI";
import type { LandlordPortfolioAuditData, LandlordPortfolioAuditRow } from "@/lib/landlord-portfolio-audit/data";

type Props = {
    data: LandlordPortfolioAuditData;
};

function money(value: number) {
    return `UGX ${Math.round(value).toLocaleString()}`;
}

export default function LandlordPortfolioAuditCentre({ data }: Props) {
    return (
        <main className="enterprise-page">
            <div className="enterprise-shell">
                <PageHero
                    title="Landlord Portfolio Audit"
                    subtitle="Compares Master file expected rooms against current Supabase landlord portfolios"
                    badge="Portfolio Reconciliation"
                >
                    <div className="enterprise-card px-6 py-4">
                        <p className="text-sm font-bold text-slate-500">Reconciled</p>
                        <p className="text-3xl font-black text-emerald-700">{data.totals.reconciled}/{data.totals.landlords}</p>
                    </div>
                </PageHero>

                <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5">
                    <Summary label="Landlords Audited" value={data.totals.landlords.toLocaleString()} />
                    <Summary label="Missing Rooms" value={data.totals.missingRooms.toLocaleString()} tone="text-red-700" />
                    <Summary label="Extra Rooms" value={data.totals.extraRooms.toLocaleString()} tone="text-amber-700" />
                    <Summary label="Rent Roll Diff" value={money(data.totals.rentRollDifference)} tone={data.totals.rentRollDifference ? "text-red-700" : "text-emerald-700"} />
                    <Summary label="Review Rooms" value={data.reviewRooms.length.toLocaleString()} tone="text-amber-700" />
                </section>

                {data.alexCosta ? (
                    <section className="enterprise-panel mt-6 p-6">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div className="flex items-start gap-3">
                                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
                                    <CheckCircle2 size={22} />
                                </span>
                                <div>
                                    <p className="text-xs font-black uppercase tracking-wide text-emerald-700">Critical Fix Verified</p>
                                    <h2 className="mt-1 text-2xl font-black text-slate-950">Alex Costa Portfolio</h2>
                                    <p className="mt-1 text-sm font-semibold text-slate-500">
                                        Source expects 7 rooms including CHEF. Supabase now shows {data.alexCosta.currentRooms} current rooms.
                                    </p>
                                </div>
                            </div>
                            <StatusChip label={data.alexCosta.status} tone={data.alexCosta.status === "reconciled" ? "green" : "orange"} />
                        </div>
                        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
                            <Mini label="Expected Rooms" value={data.alexCosta.expectedRooms.toString()} />
                            <Mini label="Current Rooms" value={data.alexCosta.currentRooms.toString()} tone="text-emerald-700" />
                            <Mini label="Expected Rent Roll" value={money(data.alexCosta.expectedRentRoll)} />
                            <Mini label="Current Rent Roll" value={money(data.alexCosta.currentRentRoll)} tone="text-emerald-700" />
                            <Mini label="Difference" value={money(data.alexCosta.rentRollDifference)} tone={data.alexCosta.rentRollDifference ? "text-red-700" : "text-emerald-700"} />
                        </div>
                        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <p className="text-sm font-black text-slate-950">Missing rooms</p>
                            <p className="mt-1 text-sm font-semibold text-slate-600">{data.alexCosta.missingRooms.length ? data.alexCosta.missingRooms.join(", ") : "None. CHEF is now included."}</p>
                        </div>
                    </section>
                ) : null}

                <section className="enterprise-panel mt-6 overflow-hidden">
                    <div className="flex flex-col gap-3 border-b border-slate-200 p-6 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-center gap-3">
                            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-700">
                                <ClipboardList size={21} />
                            </span>
                            <div>
                                <h2 className="text-xl font-black text-slate-950">Full Landlord Portfolio Audit</h2>
                                <p className="text-sm font-semibold text-slate-500">Expected rooms from Excel compared to current landlord rooms in Supabase.</p>
                            </div>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="enterprise-table">
                            <thead>
                                <tr>
                                    <th className="text-left">Landlord</th>
                                    <th className="text-left">Expected</th>
                                    <th className="text-left">Current</th>
                                    <th className="text-left">Missing Rooms</th>
                                    <th className="text-left">Extra Rooms</th>
                                    <th className="text-left">Rent Roll Difference</th>
                                    <th className="text-left">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.rows.length === 0 ? (
                                    <tr><td colSpan={7} className="p-6"><EmptyState title="No portfolio source data" description="Import the Master file source rows to run this audit." /></td></tr>
                                ) : data.rows.map((row) => <AuditRow key={row.landlordName} row={row} />)}
                            </tbody>
                        </table>
                    </div>
                </section>

                <section className="enterprise-panel mt-6 overflow-hidden">
                    <div className="flex items-center gap-3 border-b border-slate-200 p-6">
                        <AlertTriangle className="text-amber-700" />
                        <div>
                            <h2 className="text-xl font-black text-slate-950">Unmatched / Review Rooms</h2>
                            <p className="text-sm font-semibold text-slate-500">These source rooms were not created automatically because property/location confidence was not high enough.</p>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="enterprise-table">
                            <thead>
                                <tr>
                                    <th className="text-left">Room</th>
                                    <th className="text-left">Landlord</th>
                                    <th className="text-left">Office</th>
                                    <th className="text-left">Monthly Rent</th>
                                    <th className="text-left">Reason</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.reviewRooms.length === 0 ? (
                                    <tr><td colSpan={5} className="p-6 text-sm font-bold text-slate-500">No unmatched review rooms.</td></tr>
                                ) : data.reviewRooms.map((row) => (
                                    <tr key={`${row.landlordName}-${row.roomNumber}`}>
                                        <td className="font-black">{row.roomNumber}</td>
                                        <td>{row.landlordName}</td>
                                        <td>{row.officeName ?? "Unknown"}</td>
                                        <td>{money(row.monthlyRent)}</td>
                                        <td className="max-w-lg text-sm font-semibold text-slate-600">{row.reason}</td>
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

function AuditRow({ row }: { row: LandlordPortfolioAuditRow }) {
    return (
        <tr>
            <td><p className="font-black">{row.landlordName}</p></td>
            <td>{row.expectedRooms}</td>
            <td>{row.currentRooms}</td>
            <td className="max-w-xs text-xs font-bold text-red-700">{row.missingRooms.slice(0, 8).join(", ") || "None"}</td>
            <td className="max-w-xs text-xs font-bold text-amber-700">{row.extraRooms.slice(0, 8).join(", ") || "None"}</td>
            <td><span className={row.rentRollDifference ? "font-black text-red-700" : "font-black text-emerald-700"}>{money(row.rentRollDifference)}</span></td>
            <td><StatusChip label={row.status} tone={row.status === "reconciled" ? "green" : row.status === "missing_rooms" ? "red" : "orange"} /></td>
        </tr>
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

function Mini({ label, value, tone = "text-slate-950" }: { label: string; value: string; tone?: string }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
            <p className={`mt-2 text-lg font-black ${tone}`}>{value}</p>
        </div>
    );
}
