"use client";

import { useMemo, useState, useTransition } from "react";
import { addAdminOfficeExpense, addLandlordAdvance, editLandlordAdvanceNote, markLandlordAdvanceDeducted } from "@/app/actions/admin-finance";
import type { LandlordRow, MonthlyFinanceSummary, OfficeRow } from "@/lib/admin-centre/types";

type Props = {
    finance: MonthlyFinanceSummary;
    landlords: LandlordRow[];
    offices: OfficeRow[];
};

function money(value: number) {
    return `UGX ${Math.round(value).toLocaleString()}`;
}

export default function AdminFinanceDrilldown({ finance, landlords, offices }: Props) {
    const [activePanel, setActivePanel] = useState<"advances" | "expenses" | "profit">("advances");
    const [message, setMessage] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    const [advanceForm, setAdvanceForm] = useState({
        landlordId: landlords[0]?.id ?? "",
        officeId: offices[0]?.id ?? "",
        amount: "",
        dateGiven: new Date().toISOString().slice(0, 10),
        reason: "",
        note: "",
    });
    const [expenseForm, setExpenseForm] = useState({
        officeId: offices[0]?.id ?? "",
        amount: "",
        category: "",
        item: "",
        vendor: "",
        description: "",
        expenseDate: new Date().toISOString().slice(0, 10),
    });

    const activeAdvances = useMemo(() =>
        finance.advances.filter((advance) => advance.status !== "fully_deducted" && advance.remainingAdvanceBalance > 0),
    [finance.advances]);

    function saveAdvance() {
        startTransition(async () => {
            try {
                setMessage(null);
                await addLandlordAdvance({
                    landlordId: advanceForm.landlordId,
                    officeId: advanceForm.officeId,
                    amount: Number(advanceForm.amount),
                    dateGiven: advanceForm.dateGiven,
                    reason: advanceForm.reason || null,
                    note: advanceForm.note || null,
                });
                setMessage("Landlord advance recorded.");
                setAdvanceForm((current) => ({ ...current, amount: "", reason: "", note: "" }));
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Unable to record advance.");
            }
        });
    }

    function saveExpense() {
        startTransition(async () => {
            try {
                setMessage(null);
                await addAdminOfficeExpense({
                    officeId: expenseForm.officeId,
                    amount: Number(expenseForm.amount),
                    category: expenseForm.category || null,
                    item: expenseForm.item || null,
                    vendor: expenseForm.vendor || null,
                    description: expenseForm.description || null,
                    expenseDate: expenseForm.expenseDate,
                });
                setMessage("Office expense recorded.");
                setExpenseForm((current) => ({ ...current, amount: "", item: "", vendor: "", description: "" }));
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Unable to record expense.");
            }
        });
    }

    function deductAdvance(advanceId: string) {
        startTransition(async () => {
            try {
                setMessage(null);
                await markLandlordAdvanceDeducted({ advanceId });
                setMessage("Advance marked deducted. Active advance balance will refresh.");
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Unable to deduct advance.");
            }
        });
    }

    function updateAdvanceNote(advanceId: string, note: string) {
        startTransition(async () => {
            try {
                setMessage(null);
                await editLandlordAdvanceNote({ advanceId, note });
                setMessage("Advance note updated.");
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Unable to update advance note.");
            }
        });
    }

    return (
        <div className="border-t border-white/10 bg-slate-900/80 p-5">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <FinanceButton
                    active={activePanel === "advances"}
                    label="Total Landlord Advances"
                    value={money(finance.activeLandlordAdvances)}
                    detail={`${activeAdvances.length} active advances`}
                    onClick={() => setActivePanel("advances")}
                />
                <FinanceButton
                    active={activePanel === "expenses"}
                    label="Total Expenses"
                    value={money(finance.offices.reduce((total, office) => total + office.expenses, 0))}
                    detail={`${finance.expenses.length} expense rows`}
                    onClick={() => setActivePanel("expenses")}
                />
                <FinanceButton
                    active={activePanel === "profit"}
                    label="Company Profit / Loss"
                    value={money(finance.profitLossThisMonth)}
                    detail={`Recovered: ${money(finance.advanceDeductionsRecovered + finance.recoveryDeductionsRecovered)}`}
                    onClick={() => setActivePanel("profit")}
                />
            </div>

            {message ? (
                <p className="mt-4 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-black text-white">{message}</p>
            ) : null}

            {activePanel === "advances" ? (
                <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[360px_1fr]">
                    <div className="rounded-3xl border border-white/10 bg-white p-4 text-slate-950">
                        <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">Add landlord advance</h3>
                        <div className="mt-3 space-y-3">
                            <select value={advanceForm.landlordId} onChange={(event) => setAdvanceForm((current) => ({ ...current, landlordId: event.target.value }))} className="field">
                                {landlords.map((landlord) => <option key={landlord.id} value={landlord.id}>{landlord.full_name}</option>)}
                            </select>
                            <select value={advanceForm.officeId} onChange={(event) => setAdvanceForm((current) => ({ ...current, officeId: event.target.value }))} className="field">
                                {offices.map((office) => <option key={office.id} value={office.id}>{office.office_name ?? office.name}</option>)}
                            </select>
                            <input className="field" inputMode="numeric" placeholder="Advance amount" value={advanceForm.amount} onChange={(event) => setAdvanceForm((current) => ({ ...current, amount: event.target.value }))} />
                            <input className="field" type="date" value={advanceForm.dateGiven} onChange={(event) => setAdvanceForm((current) => ({ ...current, dateGiven: event.target.value }))} />
                            <input className="field" placeholder="Reason" value={advanceForm.reason} onChange={(event) => setAdvanceForm((current) => ({ ...current, reason: event.target.value }))} />
                            <textarea className="field min-h-20" placeholder="Note" value={advanceForm.note} onChange={(event) => setAdvanceForm((current) => ({ ...current, note: event.target.value }))} />
                            <button disabled={isPending} onClick={saveAdvance} className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:opacity-50">Add Advance</button>
                        </div>
                    </div>
                    <div className="overflow-x-auto rounded-3xl border border-white/10 bg-white">
                        <table className="enterprise-table">
                            <thead><tr><th>Landlord</th><th>Office</th><th>Advance</th><th>Date</th><th>Deducted</th><th>Remaining</th><th>Status</th><th>Action</th></tr></thead>
                            <tbody>
                                {finance.advances.length === 0 ? (
                                    <tr><td colSpan={8} className="p-6 text-sm font-bold text-slate-500">No landlord advances recorded.</td></tr>
                                ) : finance.advances.map((advance) => (
                                    <tr key={advance.id}>
                                        <td><p className="font-black">{advance.landlordName}</p><p className="text-xs text-slate-500">{advance.reason}</p></td>
                                        <td>{advance.officeName}</td>
                                        <td>{money(advance.advanceAmount)}</td>
                                        <td>{advance.dateGiven}</td>
                                        <td>{money(advance.amountDeductedSoFar)}</td>
                                        <td><span className="font-black text-amber-700">{money(advance.remainingAdvanceBalance)}</span></td>
                                        <td><StatusText status={advance.status} /></td>
                                        <td className="space-y-2">
                                            <button disabled={isPending || advance.remainingAdvanceBalance <= 0} onClick={() => deductAdvance(advance.id)} className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-black text-white disabled:opacity-40">Deduct now</button>
                                            <button disabled={isPending} onClick={() => updateAdvanceNote(advance.id, advance.note || "Reviewed from finance drilldown")} className="ml-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700">Mark reviewed</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : null}

            {activePanel === "expenses" ? (
                <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[360px_1fr]">
                    <div className="rounded-3xl border border-white/10 bg-white p-4 text-slate-950">
                        <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">Add office expense</h3>
                        <div className="mt-3 space-y-3">
                            <select className="field" value={expenseForm.officeId} onChange={(event) => setExpenseForm((current) => ({ ...current, officeId: event.target.value }))}>
                                {offices.map((office) => <option key={office.id} value={office.id}>{office.office_name ?? office.name}</option>)}
                            </select>
                            <input className="field" inputMode="numeric" placeholder="Amount" value={expenseForm.amount} onChange={(event) => setExpenseForm((current) => ({ ...current, amount: event.target.value }))} />
                            <input className="field" placeholder="Expense type / category" value={expenseForm.category} onChange={(event) => setExpenseForm((current) => ({ ...current, category: event.target.value }))} />
                            <input className="field" placeholder="Paid by / vendor" value={expenseForm.vendor} onChange={(event) => setExpenseForm((current) => ({ ...current, vendor: event.target.value }))} />
                            <input className="field" type="date" value={expenseForm.expenseDate} onChange={(event) => setExpenseForm((current) => ({ ...current, expenseDate: event.target.value }))} />
                            <textarea className="field min-h-20" placeholder="Description / note" value={expenseForm.description} onChange={(event) => setExpenseForm((current) => ({ ...current, description: event.target.value }))} />
                            <button disabled={isPending} onClick={saveExpense} className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:opacity-50">Add Expense</button>
                        </div>
                    </div>
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                            <MiniList title="Expenses by office" rows={finance.expensesByOffice.map((row) => [row.officeName, money(row.total)])} />
                            <MiniList title="Expenses by category" rows={finance.expensesByCategory.map((row) => [row.category, money(row.total)])} />
                            <MiniList title="Daily expenses" rows={finance.dailyExpenses.map((row) => [row.date, money(row.total)])} />
                        </div>
                        <div className="overflow-x-auto rounded-3xl border border-white/10 bg-white">
                            <table className="enterprise-table">
                                <thead><tr><th>Office</th><th>Type</th><th>Amount</th><th>Date</th><th>Paid by</th><th>Note</th><th>Status</th><th>Receipt</th></tr></thead>
                                <tbody>
                                    {finance.expenses.length === 0 ? (
                                        <tr><td colSpan={8} className="p-6 text-sm font-bold text-slate-500">No expenses recorded this month.</td></tr>
                                    ) : finance.expenses.map((expense) => (
                                        <tr key={expense.id}>
                                            <td>{expense.officeName}</td>
                                            <td>{expense.expenseType}</td>
                                            <td>{money(expense.amount)}</td>
                                            <td>{expense.date}</td>
                                            <td>{expense.paidBy}</td>
                                            <td>{expense.note || "No note"}</td>
                                            <td><StatusText status={expense.approvalStatus} /></td>
                                            <td>{expense.receiptUrl ? <a href={expense.receiptUrl} className="font-black text-blue-700">Open</a> : "None"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            ) : null}

            {activePanel === "profit" ? (
                <div className="mt-5 overflow-x-auto rounded-3xl border border-white/10 bg-white">
                    <table className="enterprise-table">
                        <thead><tr><th>Office</th><th>Collections</th><th>Landlord payable</th><th>Advances given</th><th>Advances recovered</th><th>Expenses</th><th>Recovery deductions</th><th>Profit/Loss</th></tr></thead>
                        <tbody>
                            {finance.offices.map((office) => (
                                <tr key={office.officeId}>
                                    <td><p className="font-black">{office.officeName}</p><p className="text-xs text-slate-500">{office.collectionProgress}% collection progress</p></td>
                                    <td>{money(office.collectedThisMonth)}</td>
                                    <td>{money(office.expectedLandlordPayable)}</td>
                                    <td>{money(office.landlordAdvancesGiven)}</td>
                                    <td>{money(office.landlordAdvancesRecovered)}</td>
                                    <td>{money(office.expenses)}</td>
                                    <td>{money(office.recoveryDeductionsRecovered)}</td>
                                    <td><span className={office.profitLossThisMonth >= 0 ? "font-black text-emerald-700" : "font-black text-red-700"}>{money(office.profitLossThisMonth)}</span></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : null}
        </div>
    );
}

function FinanceButton({ active, detail, label, onClick, value }: { active: boolean; detail: string; label: string; onClick: () => void; value: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`rounded-3xl border p-4 text-left transition ${active ? "border-emerald-300 bg-emerald-400/15 text-white shadow-lg" : "border-white/10 bg-white/10 text-white hover:bg-white/15"}`}
        >
            <p className="text-xs font-black uppercase tracking-wide text-slate-300">{label}</p>
            <p className="mt-2 text-2xl font-black">{value}</p>
            <p className="mt-1 text-xs font-bold text-slate-300">{detail}</p>
        </button>
    );
}

function MiniList({ rows, title }: { title: string; rows: Array<[string, string]> }) {
    return (
        <div className="rounded-3xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">{title}</p>
            <div className="mt-3 space-y-2">
                {rows.length === 0 ? <p className="text-sm font-bold text-slate-500">No data</p> : rows.slice(0, 8).map(([label, value]) => (
                    <div key={`${title}-${label}`} className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-bold text-slate-600">{label}</span>
                        <span className="font-black text-slate-950">{value}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function StatusText({ status }: { status: string }) {
    const tone = status.includes("fully") || status === "approved"
        ? "bg-emerald-50 text-emerald-700"
        : status.includes("partial")
            ? "bg-blue-50 text-blue-700"
            : "bg-amber-50 text-amber-800";
    return <span className={`rounded-full px-3 py-1 text-xs font-black capitalize ${tone}`}>{status.replaceAll("_", " ")}</span>;
}
