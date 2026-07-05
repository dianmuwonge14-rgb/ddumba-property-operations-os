"use client";

import { useState, useTransition } from "react";
import {
    approveExpense,
    createExpense,
    createExpenseCategory,
    editExpense,
    rejectExpense,
} from "@/app/actions/expenses";
import type { ExpenseCategoryRow, ExpenseItem, PropertyRow } from "@/lib/expenses/types";

type Props = {
    canManage: boolean;
    categories: ExpenseCategoryRow[];
    properties: PropertyRow[];
    selectedExpense: ExpenseItem | null;
    onSaved: () => void;
};

export default function ExpenseCommandPanel({ canManage, categories, properties, selectedExpense, onSaved }: Props) {
    const [amount, setAmount] = useState("");
    const [categoryId, setCategoryId] = useState("");
    const [propertyId, setPropertyId] = useState("");
    const [item, setItem] = useState("");
    const [vendor, setVendor] = useState("");
    const [expenseDate, setExpenseDate] = useState("");
    const [description, setDescription] = useState("");
    const [receiptUrl, setReceiptUrl] = useState("");
    const [categoryName, setCategoryName] = useState("");
    const [categoryKey, setCategoryKey] = useState("");
    const [message, setMessage] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    function run(action: () => Promise<unknown>, success: string) {
        startTransition(async () => {
            try {
                setMessage(null);
                await action();
                setMessage(success);
                onSaved();
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Action failed.");
            }
        });
    }

    function payload() {
        const category = categories.find((item) => item.id === (categoryId || selectedExpense?.category_id));
        return {
            amount: Number(amount || selectedExpense?.amount || 0),
            categoryId: categoryId || selectedExpense?.category_id || undefined,
            category: category?.name ?? selectedExpense?.category ?? undefined,
            propertyId: propertyId || selectedExpense?.property_id || undefined,
            item: item || selectedExpense?.item || undefined,
            vendor: vendor || selectedExpense?.vendor || undefined,
            description: description || selectedExpense?.description || undefined,
            expenseDate: expenseDate || selectedExpense?.expense_date || undefined,
            receiptUrl: receiptUrl || selectedExpense?.receipt_url || undefined,
        };
    }

    function saveNew() {
        run(() => createExpense(payload()), "Expense created.");
    }

    function saveEdit() {
        if (!selectedExpense) {
            setMessage("Select an expense first.");
            return;
        }
        run(() => editExpense({ ...payload(), expenseId: selectedExpense.id }), "Expense updated.");
    }

    function saveApprove() {
        if (!selectedExpense) {
            setMessage("Select an expense first.");
            return;
        }
        run(() => approveExpense({ expenseId: selectedExpense.id, notes: description || undefined }), "Expense approved.");
    }

    function saveReject() {
        if (!selectedExpense) {
            setMessage("Select an expense first.");
            return;
        }
        run(() => rejectExpense({ expenseId: selectedExpense.id, notes: description || undefined }), "Expense rejected.");
    }

    function saveCategory() {
        run(
            () => createExpenseCategory({
                key: categoryKey || categoryName,
                name: categoryName,
            }),
            "Expense category created.",
        );
    }

    return (
        <div className="rounded-3xl bg-white p-4 shadow-lg">
            <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                    <h2 className="text-lg font-black text-slate-950">Expense Command</h2>
                    <p className="text-xs font-semibold text-slate-500">
                        {selectedExpense ? selectedExpense.item ?? selectedExpense.expense_number : "Create and manage expenses"}
                    </p>
                </div>
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
                    {isPending ? "Saving" : "Ready"}
                </span>
            </div>

            <div className="grid grid-cols-1 gap-2 xl:grid-cols-3">
                <input
                    value={item}
                    onChange={(event) => setItem(event.target.value)}
                    placeholder={selectedExpense?.item ?? "Expense item"}
                    className="h-11 rounded-xl border px-3 text-sm font-semibold"
                />
                <input
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    type="number"
                    min="0"
                    placeholder={selectedExpense?.amount?.toString() ?? "Amount"}
                    className="h-11 rounded-xl border px-3 text-sm font-semibold"
                />
                <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="h-11 rounded-xl border px-3 text-sm font-semibold">
                    <option value="">Select category</option>
                    {categories.map((category) => (
                        <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                </select>
                <select value={propertyId} onChange={(event) => setPropertyId(event.target.value)} className="h-11 rounded-xl border px-3 text-sm font-semibold">
                    <option value="">Office expense</option>
                    {properties.map((property) => (
                        <option key={property.id} value={property.id}>{property.property_name ?? property.name}</option>
                    ))}
                </select>
                <input
                    value={vendor}
                    onChange={(event) => setVendor(event.target.value)}
                    placeholder={selectedExpense?.vendor ?? "Vendor"}
                    className="h-11 rounded-xl border px-3 text-sm font-semibold"
                />
                <input
                    value={expenseDate}
                    onChange={(event) => setExpenseDate(event.target.value)}
                    type="date"
                    className="h-11 rounded-xl border px-3 text-sm font-semibold"
                />
                <input
                    value={receiptUrl}
                    onChange={(event) => setReceiptUrl(event.target.value)}
                    placeholder={selectedExpense?.receipt_url ?? "Receipt URL"}
                    className="h-11 rounded-xl border px-3 text-sm font-semibold xl:col-span-2"
                />
                <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Description, approval note, or rejection reason"
                    className="h-11 resize-none rounded-xl border px-3 py-2 text-sm font-semibold"
                />
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
                <Button disabled={!canManage || isPending} onClick={saveNew}>Create</Button>
                <Button disabled={!canManage || isPending || !selectedExpense} onClick={saveEdit}>Edit</Button>
                <Button disabled={!canManage || isPending || !selectedExpense} onClick={saveApprove} tone="green">Approve</Button>
                <Button disabled={!canManage || isPending || !selectedExpense} onClick={saveReject} tone="red">Reject</Button>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <h3 className="mb-2 text-sm font-black">Expense Categories</h3>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_auto]">
                <input
                    value={categoryName}
                    onChange={(event) => setCategoryName(event.target.value)}
                    placeholder="Category name"
                    className="h-10 rounded-xl border bg-white px-3 text-sm font-semibold"
                />
                <input
                    value={categoryKey}
                    onChange={(event) => setCategoryKey(event.target.value)}
                    placeholder="Category key"
                    className="h-10 rounded-xl border bg-white px-3 text-sm font-semibold"
                />
                <Button disabled={!canManage || isPending} onClick={saveCategory}>Add Category</Button>
                </div>
            </div>

            {message && <p className="mt-4 text-sm text-slate-600">{message}</p>}
        </div>
    );
}

function Button({
    disabled,
    onClick,
    children,
    tone = "dark",
}: {
    disabled: boolean;
    onClick: () => void;
    children: React.ReactNode;
    tone?: "dark" | "green" | "red";
}) {
    const toneClass = {
        dark: "bg-slate-900 hover:bg-slate-800",
        green: "bg-green-600 hover:bg-green-700",
        red: "bg-red-600 hover:bg-red-700",
    }[tone];

    return (
        <button disabled={disabled} onClick={onClick} className={`${toneClass} h-10 rounded-xl px-3 text-xs font-black text-white disabled:opacity-40`}>
            {children}
        </button>
    );
}
