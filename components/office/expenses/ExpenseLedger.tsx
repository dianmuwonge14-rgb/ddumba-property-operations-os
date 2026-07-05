"use client";

import { useMemo, useState } from "react";
import type { CashAccountRow, ExpenseItem } from "@/lib/expenses/types";
import { SearchBox, StatusChip } from "@/components/office/shared/EnterpriseUI";

type Props = {
    expenses: ExpenseItem[];
    selectedExpense: ExpenseItem | null;
    onSelect: (expense: ExpenseItem) => void;
    cashAccounts: CashAccountRow[];
};

function money(value: number) {
    return `UGX ${Math.round(value).toLocaleString()}`;
}

export default function ExpenseLedger({ expenses, selectedExpense, onSelect, cashAccounts }: Props) {
    const [search, setSearch] = useState("");
    const visibleExpenses = useMemo(
        () => expenses.filter((expense) =>
            `${expense.item ?? ""} ${expense.expense_number ?? ""} ${expense.categoryName ?? ""} ${expense.propertyName ?? ""} ${expense.vendor ?? ""}`
                .toLowerCase()
                .includes(search.toLowerCase()),
        ),
        [expenses, search],
    );

    return (
        <div className="space-y-6">
            <div className="enterprise-panel p-6">
                <div className="mb-4 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div>
                        <h2 className="font-bold text-xl">Expense Ledger</h2>
                        <p className="text-sm text-slate-500">Company → office → property → expense ledger</p>
                    </div>
                    <span className="bg-slate-100 rounded-full px-3 py-1 text-sm font-bold">
                        {expenses.length} records
                    </span>
                </div>
                <div className="mb-4">
                    <SearchBox value={search} onChange={setSearch} placeholder="Search expenses..." />
                </div>

                <div className="overflow-x-auto">
                    <table className="enterprise-table">
                        <thead>
                            <tr>
                                <th className="text-left p-4">Expense</th>
                                <th className="text-left p-4">Category</th>
                                <th className="text-left p-4">Property</th>
                                <th className="text-left p-4">Landlord</th>
                                <th className="text-left p-4">Amount</th>
                                <th className="text-left p-4">State</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleExpenses.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-6 text-slate-500">No expenses recorded for this office.</td>
                                </tr>
                            ) : visibleExpenses.map((expense) => (
                                <tr
                                    key={expense.id}
                                    onClick={() => onSelect(expense)}
                                    className={`border-t cursor-pointer hover:bg-blue-50 ${selectedExpense?.id === expense.id ? "bg-blue-50" : ""}`}
                                >
                                    <td className="p-4">
                                        <p className="font-bold">{expense.item ?? expense.expense_number ?? "Expense"}</p>
                                        <p className="text-xs text-slate-500">{expense.expense_date ?? expense.created_at?.slice(0, 10) ?? "No date"}</p>
                                    </td>
                                    <td className="p-4">{expense.categoryName ?? "Uncategorised"}</td>
                                    <td className="p-4">{expense.propertyName ?? "Office"}</td>
                                    <td className="p-4">{expense.landlordName ?? "N/A"}</td>
                                    <td className="p-4 font-bold">{money(Number(expense.amount ?? 0))}</td>
                                    <td className="p-4">
                                        <StatusChip
                                            label={expense.approvalState}
                                            tone={expense.approvalState === "approved" ? "green" : expense.approvalState === "rejected" ? "red" : "orange"}
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="grid grid-cols-1 2xl:grid-cols-2 gap-6">
                <section className="enterprise-panel p-6">
                    <h2 className="font-bold text-xl mb-4">Expense Timeline</h2>
                    <div className="space-y-3">
                        {expenses.slice(0, 8).map((expense) => (
                            <div key={expense.id} className="rounded-2xl border border-slate-200 p-4 hover:bg-slate-50">
                                <div className="flex justify-between gap-4">
                                    <div>
                                        <p className="font-bold">{expense.item ?? "Expense"}</p>
                                        <p className="text-sm text-slate-500">
                                            {expense.approvalState} · {expense.propertyName ?? "Office"} · {expense.submittedByName ?? "System"}
                                        </p>
                                    </div>
                                    <p className="font-black">{money(Number(expense.amount ?? 0))}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="enterprise-panel p-6">
                    <h2 className="font-bold text-xl mb-4">Cash Accounts</h2>
                    <div className="space-y-3">
                        {cashAccounts.length === 0 ? (
                            <p className="text-slate-500">No active office cash accounts configured.</p>
                        ) : cashAccounts.map((account) => (
                            <div key={account.id} className="rounded-2xl border border-slate-200 p-4 hover:bg-slate-50">
                                <p className="font-bold">{account.name}</p>
                                <p className="text-sm text-slate-500 capitalize">{account.account_type} · {account.currency}</p>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
}
