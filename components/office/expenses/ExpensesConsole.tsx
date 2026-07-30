"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, Banknote, Bot, CheckCircle2, Download, Edit3, Eye, FileText, History, Loader2, Printer, ReceiptText, Search, Trash2, UserRound, WalletCards, X } from "lucide-react";
import { adminEditExpenseDirect, adminSafeDeleteExpense, approveExpense, createEmployeeExpenseFromExpenses, createExpense, createLandlordPaidExpenseRequest, decideEmployeeExpenseRequest, decideExpenseChangeRequest, previewEmployeeExpense, previewLandlordPaymentExpense, rejectExpense, submitExpenseChangeRequest } from "@/app/actions/expenses";
import type { EmployeeExpensePreview, ExpenseBalanceReport, ExpenseChangePayload, ExpenseItem, ExpensePeriodMode, ExpensesPageData } from "@/lib/expenses/types";

type Props = {
    canManage: boolean;
    data: ExpensesPageData;
    isAdmin: boolean;
};

function today() {
    return new Date().toISOString().slice(0, 10);
}

function thisMonth() {
    return today().slice(0, 7);
}

function addDays(dateValue: string, days: number) {
    const date = new Date(`${dateValue}T00:00:00`);
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
}

function startOfWeek(dateValue: string) {
    const date = new Date(`${dateValue}T00:00:00`);
    const day = date.getDay() || 7;
    date.setDate(date.getDate() - day + 1);
    return date.toISOString().slice(0, 10);
}

function money(value: number | string | null | undefined) {
    return `UGX ${Math.round(Number(value ?? 0)).toLocaleString()}`;
}

function expenseTime(expense: ExpenseItem) {
    const value = expense.created_at ?? expense.expense_date;
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function queryString(filters: ExpenseFilters) {
    const params = new URLSearchParams();
    params.set("mode", filters.mode);
    params.set("singleDate", filters.singleDate);
    params.set("startDate", filters.startDate);
    params.set("endDate", filters.endDate);
    params.set("singleMonth", filters.singleMonth);
    params.set("startMonth", filters.startMonth);
    params.set("endMonth", filters.endMonth);
    if (filters.officeId) params.set("officeId", filters.officeId);
    return params.toString();
}

type ExpenseFilters = {
    mode: ExpensePeriodMode;
    singleDate: string;
    startDate: string;
    endDate: string;
    singleMonth: string;
    startMonth: string;
    endMonth: string;
    officeId: string;
};

type LandlordPaymentPreview = Awaited<ReturnType<typeof previewLandlordPaymentExpense>>;
type ExpenseEntryMode = "landlord_payment" | "authorised" | "unauthorised";
type AuthorisedExpenseType = "employee_lunch" | "airtime" | "internet" | "transport_kampala";
type ExpenseModalMode = "view" | "edit" | "date" | "employee" | "history";
type EntrySearchResult = {
    id: string;
    name: string;
    officeId: string | null;
    officeName: string | null;
    location?: string | null;
    phone?: string | null;
    role?: string | null;
};
type EmployeeLunchDetail = EntrySearchResult & {
    position: string;
    dailyLunchAllocation: number;
    previousUnusedLunchBalance: number;
    lunchAvailableToday: number;
    totalUsableLunch: number;
    lunchUsedToday: number;
    remainingLunchBalance: number;
    lastLunchExpenseDate: string | null;
    approvalStatus: string;
};
type LandlordEntryDetail = EntrySearchResult & {
    outstandingBalance: number;
    lastPaymentAmount: number;
    lastPaymentDate: string | null;
    landlordPaymentDate: string | null;
    landlordBillingDate: string | null;
    commissionType: string | null;
    commissionRate: number | null;
    fullRentRoll: number;
    netPayable: number;
    portfolioValue: number;
    totalRooms: number;
    occupiedRooms: number;
    vacantRooms: number;
    vacatedWithDebt: number;
    advanceBalance: number;
    paymentStatus: string;
};

const AUTHORISED_EXPENSES: Array<{ value: AuthorisedExpenseType; label: string; amount: number }> = [
    { value: "employee_lunch", label: "Employee Lunch", amount: 7000 },
    { value: "airtime", label: "Airtime", amount: 30000 },
    { value: "internet", label: "Internet", amount: 110000 },
    { value: "transport_kampala", label: "Transport to Kampala", amount: 200000 },
];

function expenseField(expense: ExpenseItem, key: keyof ExpenseChangePayload) {
    const row = expense as ExpenseItem & {
        employee_id?: string | null;
        payment_method?: string | null;
        status?: string | null;
    };
    if (key === "amount") return Number(expense.amount ?? 0);
    if (key === "category") return expense.category ?? "";
    if (key === "categoryId") return expense.category_id ?? "";
    if (key === "description") return expense.description ?? "";
    if (key === "employeeId") return row.employee_id ?? expense.employeeId ?? "";
    if (key === "expenseDate") return expense.expense_date ?? "";
    if (key === "item") return expense.item ?? "";
    if (key === "officeId") return expense.office_id ?? "";
    if (key === "paymentMethod") return row.payment_method ?? expense.paymentMethod ?? "";
    if (key === "receiptUrl") return expense.receipt_url ?? "";
    if (key === "status") return row.status ?? expense.status ?? "approved";
    if (key === "vendor") return expense.vendor ?? "";
    return "";
}

export default function ExpensesConsole({ canManage, data, isAdmin }: Props) {
    const [filters, setFilters] = useState<ExpenseFilters>({
        mode: "single_date",
        singleDate: today(),
        startDate: today(),
        endDate: today(),
        singleMonth: thisMonth(),
        startMonth: thisMonth(),
        endMonth: thisMonth(),
        officeId: "",
    });
    const [expenseDate, setExpenseDate] = useState(today());
    const [entryMode, setEntryMode] = useState<ExpenseEntryMode>("landlord_payment");
    const [authorisedType, setAuthorisedType] = useState<AuthorisedExpenseType>("employee_lunch");
    const [expenseItem, setExpenseItem] = useState("");
    const [amount, setAmount] = useState("");
    const [landlordId, setLandlordId] = useState("");
    const [landlordSearch, setLandlordSearch] = useState("");
    const [landlordSearchResults, setLandlordSearchResults] = useState<EntrySearchResult[]>([]);
    const [selectedLandlordDetail, setSelectedLandlordDetail] = useState<LandlordEntryDetail | null>(null);
    const [loadingLandlordSearch, setLoadingLandlordSearch] = useState(false);
    const [loadingLandlordDetail, setLoadingLandlordDetail] = useState(false);
    const [paymentMonth, setPaymentMonth] = useState(thisMonth());
    const [paymentMethod, setPaymentMethod] = useState("cash");
    const [notes, setNotes] = useState("");
    const [employeeId, setEmployeeId] = useState("");
    const [employeeSearch, setEmployeeSearch] = useState("");
    const [employeeSearchResults, setEmployeeSearchResults] = useState<EntrySearchResult[]>([]);
    const [selectedEmployeeDetail, setSelectedEmployeeDetail] = useState<EmployeeLunchDetail | null>(null);
    const [loadingEmployeeSearch, setLoadingEmployeeSearch] = useState(false);
    const [loadingEmployeeDetail, setLoadingEmployeeDetail] = useState(false);
    const [employeePreview, setEmployeePreview] = useState<EmployeeExpensePreview | null>(null);
    const [loadingEmployeePreview, setLoadingEmployeePreview] = useState(false);
    const [landlordPreview, setLandlordPreview] = useState<LandlordPaymentPreview | null>(null);
    const [loadingLandlordPreview, setLoadingLandlordPreview] = useState(false);
    const [continueAsAdvance, setContinueAsAdvance] = useState(false);
    const [advanceAgreement, setAdvanceAgreement] = useState({
        repaymentType: "simple_advance",
        interestMode: "none",
        interestType: "none",
        interestValue: "",
        fixedInterestAmount: "",
        deductionStartDate: today(),
        deductionEndDate: "",
        paymentPlan: "one_time",
        monthlyDeductionAmount: "",
        principalClearanceMethod: "deducted_monthly",
    });
    const [report, setReport] = useState<ExpenseBalanceReport | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [latestExpenseId, setLatestExpenseId] = useState<string | null>(null);
    const [loadingReport, setLoadingReport] = useState(false);
    const [refreshToken, setRefreshToken] = useState(0);
    const [showPrintPreview, setShowPrintPreview] = useState(false);
    const [selectedExpenseIds, setSelectedExpenseIds] = useState<string[]>([]);
    const [expenseModal, setExpenseModal] = useState<null | { expense: ExpenseItem; mode: ExpenseModalMode }>(null);
    const [actionMessage, setActionMessage] = useState<string | null>(null);
    const [deleteReason, setDeleteReason] = useState("Admin safe delete");
    const [isPending, startTransition] = useTransition();
    const itemInputRef = useRef<HTMLInputElement | null>(null);
    const amountInputRef = useRef<HTMLInputElement | null>(null);
    const bottomRef = useRef<HTMLTableRowElement | null>(null);
    const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const employeeSearchAbortRef = useRef<AbortController | null>(null);
    const landlordSearchAbortRef = useRef<AbortController | null>(null);
    const detailAbortRef = useRef<AbortController | null>(null);

    const expenses = useMemo(() => report?.expenses ?? [], [report]);
    const activeOfficeName = data.office?.office_name ?? data.office?.name ?? "Office";
    const activeOfficeId = data.office?.id ?? "";
    const isEntebbeOperationsOffice = /entebbe operations/i.test(activeOfficeName);
    const totals = useMemo(
        () => report?.totals ?? { totalCollections: 0, totalExpenses: 0, remainingBalance: 0, expenseRows: 0, paymentRows: 0 },
        [report?.totals],
    );
    const periodLabel = report ? `${report.filters.startDate} to ${report.filters.endDate}` : filters.singleDate;
    const isLandlordPaidMode = entryMode === "landlord_payment";
    const isAuthorisedMode = entryMode === "authorised";
    const isEmployeeExpenseMode = isAuthorisedMode && authorisedType === "employee_lunch";
    const activeAuthorisedExpense = AUTHORISED_EXPENSES.find((item) => item.value === authorisedType) ?? AUTHORISED_EXPENSES[0];
    const selectedLandlordOption = selectedLandlordDetail;
    const selectedEmployeeOption = selectedEmployeeDetail;
    const currentMonthExpenses = useMemo(() => {
        const month = expenseDate.slice(0, 7) || thisMonth();
        return data.expenses.filter((expense) => {
            const status = String(expense.status ?? expense.approvalState ?? "").toLowerCase();
            if (["rejected", "cancelled", "canceled", "reversed", "voided", "deleted"].includes(status)) return false;
            if (activeOfficeId && expense.office_id && expense.office_id !== activeOfficeId) return false;
            return String(expense.expense_date ?? "").slice(0, 7) === month;
        });
    }, [activeOfficeId, data.expenses, expenseDate]);
    const authorisedUsage = useMemo(() => {
        const sumByNeedle = (needles: string[]) => currentMonthExpenses
            .filter((expense) => {
                const haystack = `${expense.item ?? ""} ${expense.category ?? ""} ${expense.categoryName ?? ""}`.toLowerCase();
                return needles.some((needle) => haystack.includes(needle));
            })
            .reduce((total, expense) => total + Number(expense.amount ?? 0), 0);
        const internetRows = currentMonthExpenses.filter((expense) => {
            const haystack = `${expense.item ?? ""} ${expense.category ?? ""} ${expense.categoryName ?? ""}`.toLowerCase();
            return haystack.includes("internet");
        });
        const transportRows = currentMonthExpenses.filter((expense) => {
            const haystack = `${expense.item ?? ""} ${expense.category ?? ""} ${expense.categoryName ?? ""}`.toLowerCase();
            return haystack.includes("transport to kampala");
        });
        return {
            airtimeUsed: sumByNeedle(["airtime"]),
            internetUsed: internetRows.reduce((total, expense) => total + Number(expense.amount ?? 0), 0),
            internetLastRecorded: internetRows[0]?.expense_date ?? internetRows[0]?.created_at ?? null,
            internetRecorded: internetRows.length > 0,
            transportUsed: transportRows.reduce((total, expense) => total + Number(expense.amount ?? 0), 0),
            transportTrips: transportRows.length,
        };
    }, [currentMonthExpenses]);
    const financeInsights = useMemo(() => buildFinanceInsights({
        expenses,
        employeeRequests: data.employeeExpenseRequests,
        requests: data.landlordPaymentRequests,
        totals,
    }), [data.employeeExpenseRequests, data.landlordPaymentRequests, expenses, totals]);

    const selectedExpenses = useMemo(() => expenses.filter((expense) => selectedExpenseIds.includes(expense.id)), [expenses, selectedExpenseIds]);

    useEffect(() => {
        itemInputRef.current?.focus();
        return () => {
            abortRef.current?.abort();
            employeeSearchAbortRef.current?.abort();
            landlordSearchAbortRef.current?.abort();
            detailAbortRef.current?.abort();
            if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
        };
    }, []);

    useEffect(() => {
        if (filters.mode === "single_date") setExpenseDate(filters.singleDate);
    }, [filters.mode, filters.singleDate]);

    useEffect(() => {
        const query = employeeSearch.trim();
        if (!isEmployeeExpenseMode || !query || query === selectedEmployeeDetail?.name) {
            employeeSearchAbortRef.current?.abort();
            setEmployeeSearchResults([]);
            setLoadingEmployeeSearch(false);
            return;
        }
        const controller = new AbortController();
        employeeSearchAbortRef.current?.abort();
        employeeSearchAbortRef.current = controller;
        setLoadingEmployeeSearch(true);
        const timer = setTimeout(() => {
            void (async () => {
                try {
                    const response = await fetch(`/api/expenses/entry-search?type=employee&q=${encodeURIComponent(query)}`, {
                        cache: "no-store",
                        signal: controller.signal,
                    });
                    const payload = await response.json();
                    if (controller.signal.aborted) return;
                    if (!response.ok) throw new Error(payload.error ?? "Employee search failed.");
                    setEmployeeSearchResults(payload.results ?? []);
                } catch (error) {
                    if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Employee search failed.");
                } finally {
                    if (!controller.signal.aborted) setLoadingEmployeeSearch(false);
                }
            })();
        }, 150);
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [employeeSearch, isEmployeeExpenseMode, selectedEmployeeDetail?.name]);

    useEffect(() => {
        const query = landlordSearch.trim();
        if (!isLandlordPaidMode || !query || query === selectedLandlordDetail?.name) {
            landlordSearchAbortRef.current?.abort();
            setLandlordSearchResults([]);
            setLoadingLandlordSearch(false);
            return;
        }
        const controller = new AbortController();
        landlordSearchAbortRef.current?.abort();
        landlordSearchAbortRef.current = controller;
        setLoadingLandlordSearch(true);
        const timer = setTimeout(() => {
            void (async () => {
                try {
                    const response = await fetch(`/api/expenses/entry-search?type=landlord&q=${encodeURIComponent(query)}`, {
                        cache: "no-store",
                        signal: controller.signal,
                    });
                    const payload = await response.json();
                    if (controller.signal.aborted) return;
                    if (!response.ok) throw new Error(payload.error ?? "Landlord search failed.");
                    setLandlordSearchResults(payload.results ?? []);
                } catch (error) {
                    if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Landlord search failed.");
                } finally {
                    if (!controller.signal.aborted) setLoadingLandlordSearch(false);
                }
            })();
        }, 150);
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [isLandlordPaidMode, landlordSearch, selectedLandlordDetail?.name]);

    function loadEntryDetail(type: "employee" | "landlord", id: string) {
        detailAbortRef.current?.abort();
        const controller = new AbortController();
        detailAbortRef.current = controller;
        if (type === "employee") setLoadingEmployeeDetail(true);
        if (type === "landlord") setLoadingLandlordDetail(true);
        void (async () => {
            try {
                const response = await fetch(`/api/expenses/entry-detail?type=${type}&id=${encodeURIComponent(id)}&expenseDate=${encodeURIComponent(expenseDate)}`, {
                    cache: "no-store",
                    signal: controller.signal,
                });
                const payload = await response.json();
                if (controller.signal.aborted) return;
                if (!response.ok) throw new Error(payload.error ?? "Selected record could not load.");
                if (type === "employee") setSelectedEmployeeDetail(payload.detail ?? null);
                if (type === "landlord") setSelectedLandlordDetail(payload.detail ?? null);
            } catch (error) {
                if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Selected record could not load.");
            } finally {
                if (!controller.signal.aborted) {
                    if (type === "employee") setLoadingEmployeeDetail(false);
                    if (type === "landlord") setLoadingLandlordDetail(false);
                }
            }
        })();
    }

    useEffect(() => {
        if (employeeId && isEmployeeExpenseMode) loadEntryDetail("employee", employeeId);
        if (landlordId && isLandlordPaidMode) loadEntryDetail("landlord", landlordId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [expenseDate, refreshToken]);

    useEffect(() => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setLoadingReport(true);
        void (async () => {
            try {
                const response = await fetch(`/api/expenses/balance-report?${queryString(filters)}`, {
                    cache: "no-store",
                    signal: controller.signal,
                });
                const payload = await response.json();
                if (controller.signal.aborted) return;
                if (!response.ok) throw new Error(payload.error ?? "Expense balance report could not load.");
                setReport(payload.report);
                setMessage(null);
            } catch (error) {
                if (controller.signal.aborted) return;
                setReport(null);
                setMessage(error instanceof Error ? error.message : "Expense balance report could not load.");
            } finally {
                if (!controller.signal.aborted) setLoadingReport(false);
            }
        })();
    }, [filters, refreshToken]);

    useEffect(() => {
        if (!latestExpenseId) return;
        bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, [latestExpenseId, expenses.length]);

    useEffect(() => {
        if (!isLandlordPaidMode || !landlordId || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
            setLandlordPreview(null);
            setContinueAsAdvance(false);
            return;
        }
        let cancelled = false;
        setLoadingLandlordPreview(true);
        const timer = setTimeout(() => {
            startTransition(async () => {
                try {
                    const preview = await previewLandlordPaymentExpense({
                        amount: Number(amount),
                        landlordId,
                        officeId: selectedLandlordOption?.officeId ?? null,
                        paymentMonth,
                    });
                    if (!cancelled) {
                        setLandlordPreview(preview);
                        if (preview.advanceAmount <= 0) setContinueAsAdvance(false);
                    }
                } catch (error) {
                    if (!cancelled) {
                        setLandlordPreview(null);
                        setMessage(error instanceof Error ? error.message : "Could not check landlord payable position.");
                    }
                } finally {
                    if (!cancelled) setLoadingLandlordPreview(false);
                }
            });
        }, 300);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [amount, isLandlordPaidMode, landlordId, paymentMonth, selectedLandlordOption?.officeId]);

    useEffect(() => {
        if (!isEmployeeExpenseMode || !employeeId || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
            setEmployeePreview(null);
            return;
        }
        let cancelled = false;
        setLoadingEmployeePreview(true);
        const timer = setTimeout(() => {
            startTransition(async () => {
                try {
                    const preview = await previewEmployeeExpense({
                        amount: Number(amount),
                        employeeId,
                        expenseDate,
                        expenseItem: "Lunch",
                        note: notes,
                    });
                    if (!cancelled) setEmployeePreview(preview);
                } catch (error) {
                    if (!cancelled) {
                        setEmployeePreview(null);
                        setMessage(error instanceof Error ? error.message : "Could not check employee allowance.");
                    }
                } finally {
                    if (!cancelled) setLoadingEmployeePreview(false);
                }
            });
        }, 250);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [amount, employeeId, expenseDate, isEmployeeExpenseMode, notes]);

    function updateFilter<Key extends keyof ExpenseFilters>(key: Key, value: ExpenseFilters[Key]) {
        setFilters((current) => ({ ...current, [key]: value }));
    }

    function applyExpenseListPreset(preset: "today" | "yesterday" | "week" | "month" | "custom_date" | "custom_range" | "all_dates") {
        const todayValue = today();
        if (preset === "today") {
            setFilters((current) => ({ ...current, mode: "single_date", singleDate: todayValue, startDate: todayValue, endDate: todayValue }));
            return;
        }
        if (preset === "yesterday") {
            const value = addDays(todayValue, -1);
            setFilters((current) => ({ ...current, mode: "single_date", singleDate: value, startDate: value, endDate: value }));
            return;
        }
        if (preset === "week") {
            setFilters((current) => ({ ...current, mode: "date_range", startDate: startOfWeek(todayValue), endDate: todayValue }));
            return;
        }
        if (preset === "month") {
            setFilters((current) => ({ ...current, mode: "single_month", singleMonth: todayValue.slice(0, 7) }));
            return;
        }
        if (preset === "custom_date") {
            const value = filters.singleDate || todayValue;
            setFilters((current) => ({ ...current, mode: "single_date", singleDate: value, startDate: value, endDate: value }));
            return;
        }
        if (preset === "custom_range") {
            setFilters((current) => ({ ...current, mode: "date_range", startDate: current.startDate || todayValue, endDate: current.endDate || current.startDate || todayValue }));
            return;
        }
        setFilters((current) => ({ ...current, mode: "all_dates" }));
    }

    function flashExpense(id: string) {
        if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
        setLatestExpenseId(id);
        highlightTimerRef.current = setTimeout(() => setLatestExpenseId(null), 2000);
    }

    function clearForNext() {
        setExpenseItem("");
        setAmount("");
        setNotes("");
        if (!isLandlordPaidMode) setLandlordId("");
        requestAnimationFrame(() => itemInputRef.current?.focus());
    }

    function saveExpense() {
        const trimmedItem = expenseItem.trim();
        const authorisedLabel = activeAuthorisedExpense.label;
        const value = Number(amount);
        if (entryMode === "unauthorised" && !trimmedItem) {
            setMessage("Enter expense name.");
            return;
        }
        if (entryMode === "unauthorised" && !notes.trim()) {
            setMessage("Enter the reason for this unauthorised expense.");
            return;
        }
        if (!Number.isFinite(value) || value <= 0) {
            setMessage("Enter amount spent.");
            return;
        }
        if (isLandlordPaidMode && !paymentMonth) {
            setMessage("Select payment month.");
            return;
        }
        if (isEmployeeExpenseMode && !employeeId) {
            setMessage("Select employee.");
            return;
        }
        if (isAuthorisedMode && authorisedType === "internet" && authorisedUsage.internetRecorded && !isAdmin) {
            setMessage("Internet has already been claimed this month.");
            return;
        }
        if (isAuthorisedMode && authorisedType === "transport_kampala" && !isEntebbeOperationsOffice) {
            setMessage("Transport to Kampala can only be recorded by Entebbe Operations Office.");
            return;
        }
        if (isEmployeeExpenseMode && !isAdmin) {
            const lunchAvailable = selectedEmployeeDetail?.remainingLunchBalance ?? employeePreview?.lunchBalanceBefore ?? 7000;
            if (employeePreview && value > lunchAvailable) {
                setMessage("Requested lunch amount exceeds the employee's available lunch balance. Submit to Admin for approval.");
                return;
            }
        }
        if (isLandlordPaidMode && !expenseDate) {
            setMessage("Select payment date.");
            return;
        }
        if (isLandlordPaidMode && landlordPreview?.advanceAmount && landlordPreview.advanceAmount > 0 && continueAsAdvance) {
            if (!advanceAgreement.deductionStartDate) {
                setMessage("Enter the advance deduction start date.");
                return;
            }
            if (advanceAgreement.paymentPlan !== "one_time" && Number(advanceAgreement.monthlyDeductionAmount || 0) <= 0) {
                setMessage("Enter the monthly deduction amount for the advance agreement.");
                return;
            }
        }

        startTransition(async () => {
            try {
                setMessage(null);
                if (isLandlordPaidMode) {
                    if (!landlordId) throw new Error("Select landlord.");
                    if (landlordPreview?.advanceAmount && landlordPreview.advanceAmount > 0 && !continueAsAdvance) {
                        setMessage(landlordPreview.normalPaymentAmount > 0
                            ? "This payment is partly normal payment and partly advance. Review the warning and click Continue as Advance before submitting."
                            : "Landlord has already received what they are supposed to get for this month. Review the warning and click Continue as Advance before submitting.");
                        return;
                    }
                    const request = await createLandlordPaidExpenseRequest({
                        advanceAgreement: landlordPreview?.advanceAmount && landlordPreview.advanceAmount > 0 ? {
                            ...advanceAgreement,
                            deductionStartDate: advanceAgreement.deductionStartDate || `${paymentMonth}-01`,
                            fixedInterestAmount: Number(advanceAgreement.fixedInterestAmount || 0),
                            interestRate: Number(advanceAgreement.interestValue || 0),
                            interestValue: Number(advanceAgreement.interestValue || 0),
                            monthlyDeductionAmount: Number(advanceAgreement.monthlyDeductionAmount || 0),
                            reason: notes || "Expense overpayment converted to landlord advance",
                        } : undefined,
                        amount: value,
                        expenseDate,
                        landlordId,
                        officeId: selectedLandlordOption?.officeId ?? null,
                        paymentMethod,
                        paymentMonth,
                        notes: notes || trimmedItem || undefined,
                    });
                    flashExpense(String(request.expense_id ?? request.id));
                    setMessage(isAdmin
                        ? "Landlord payment expense approved directly by Admin. Live totals are updating."
                        : "Pending approval created. Admin has been notified. No expense or landlord totals were changed.");
                } else if (isEmployeeExpenseMode) {
                    const result = await createEmployeeExpenseFromExpenses({
                        amount: value,
                        employeeId,
                        expenseDate,
                        expenseItem: "Lunch",
                        note: notes || trimmedItem || undefined,
                    });
                    flashExpense(String(result.expenseId ?? result.request?.id ?? Date.now()));
                    setMessage(isAdmin && result.preview.extraAmount > 0
                        ? "Employee expense approved directly by Admin."
                        : result.preview.extraAmount > 0
                        ? "Requested lunch amount exceeds the employee's available lunch balance. Submit to Admin for approval."
                        : `Employee lunch recorded. Remaining lunch balance: ${money(result.preview.remainingAllowance - result.preview.allowedPortion)}.`);
                } else {
                    const itemName = entryMode === "unauthorised" ? trimmedItem : authorisedLabel;
                    const categoryName = entryMode === "unauthorised" ? "Unauthorised Expenses" : "Authorised Expenses";
                    const saved = await createExpense({
                        amount: value,
                        category: categoryName,
                        description: notes || undefined,
                        expenseDate,
                        item: itemName,
                    });
                    flashExpense(saved.id);
                    setMessage(isAdmin
                        ? `${itemName} recorded and approved.`
                        : entryMode === "unauthorised"
                            ? "Sent for Admin Approval. Unauthorised expense submitted for Admin approval."
                            : `Sent for Admin Approval. ${itemName} submitted. Admin approval is required before cash position changes.`);
                }
                clearForNext();
                setContinueAsAdvance(false);
                setLandlordPreview(null);
                setEmployeePreview(null);
                setRefreshToken((token) => token + 1);
                if (isEmployeeExpenseMode && employeeId) loadEntryDetail("employee", employeeId);
                if (isLandlordPaidMode && landlordId) loadEntryDetail("landlord", landlordId);
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Expense could not be recorded.");
            }
        });
    }

    function exportCsv() {
        const header = ["Time", "Expense Item", "Amount Spent", "Office", "Recorded By"];
        const rows = expenses.map((expense) => [
            expenseTime(expense),
            expense.item ?? expense.expense_number ?? "Expense",
            String(Number(expense.amount ?? 0)),
            expense.officeName ?? report?.officeName ?? data.office?.office_name ?? data.office?.name ?? "Office",
            expense.submittedByName ?? "System",
        ]);
        const csv = [header, ...rows]
            .map((row) => row.map((cell) => `"${String(cell).replaceAll("\"", "\"\"")}"`).join(","))
            .join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `expense-balance-${report?.filters.startDate ?? filters.singleDate}-${report?.filters.endDate ?? filters.singleDate}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    }

    function exportSelectedExpenses() {
        const rowsToExport = selectedExpenses.length ? selectedExpenses : expenses;
        const header = ["Time", "Expense Item", "Amount Spent", "Office", "Recorded By", "Status"];
        const rows = rowsToExport.map((expense) => [
            expenseTime(expense),
            expense.item ?? expense.expense_number ?? "Expense",
            String(Number(expense.amount ?? 0)),
            expense.officeName ?? report?.officeName ?? data.office?.office_name ?? data.office?.name ?? "Office",
            expense.submittedByName ?? "System",
            expense.status ?? expense.approvalState,
        ]);
        const csv = [header, ...rows]
            .map((row) => row.map((cell) => `"${String(cell).replaceAll("\"", "\"\"")}"`).join(","))
            .join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `selected-expenses-${today()}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    }

    function adminDeleteSelected() {
        if (!isAdmin || !selectedExpenseIds.length) {
            setActionMessage("Select at least one expense first.");
            return;
        }
        startTransition(async () => {
            try {
                for (const expenseId of selectedExpenseIds) {
                    await adminSafeDeleteExpense({ expenseId, reason: deleteReason || "Admin bulk safe delete" });
                }
                setActionMessage(`${selectedExpenseIds.length} expense(s) safely deleted.`);
                setSelectedExpenseIds([]);
                setRefreshToken((token) => token + 1);
            } catch (error) {
                setActionMessage(error instanceof Error ? error.message : "Selected expenses could not be deleted.");
            }
        });
    }

    return (
        <main className="enterprise-page">
            <div className="enterprise-shell">
                <section className="mx-auto max-w-6xl overflow-hidden rounded-[28px] border border-white/10 bg-slate-950 p-5 text-white shadow-2xl shadow-black/25">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-black uppercase text-cyan-100">
                                <ReceiptText size={14} />
                                {isAdmin ? "Admin expenses" : "Office expenses"}
                            </div>
                            <h1 className="mt-3 text-3xl font-black sm:text-4xl">Expense Entry</h1>
                            <p className="mt-1 text-sm font-semibold text-slate-300">
                                {data.company?.name ?? "Company"} · {report?.officeName ?? (isAdmin ? "Admin view" : data.office?.office_name ?? data.office?.name ?? "Active office")}
                            </p>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[170px_150px_150px_150px]">
                            <label className="block">
                                <span className="text-xs font-black uppercase tracking-wide text-slate-300">Expense date</span>
                                <input
                                    type="date"
                                    value={expenseDate}
                                    onChange={(event) => setExpenseDate(event.target.value)}
                                    className="mt-1 h-12 w-full rounded-2xl border border-white/10 bg-white px-4 text-sm font-black text-slate-950 outline-none"
                                />
                            </label>
                            <label className="block">
                                <span className="text-xs font-black uppercase tracking-wide text-slate-300">View</span>
                                <select
                                    value={filters.mode}
                                    onChange={(event) => updateFilter("mode", event.target.value as ExpensePeriodMode)}
                                    className="mt-1 h-12 w-full rounded-2xl border border-white/10 bg-slate-900 px-3 text-sm font-black text-white outline-none"
                                >
                                    <option value="single_date">Single date</option>
                                    <option value="date_range">Date range</option>
                                    <option value="single_month">Single month</option>
                                    <option value="month_range">Month range</option>
                                    <option value="all_dates">All dates</option>
                                </select>
                            </label>
                            {isAdmin ? (
                                <label className="block sm:col-span-2">
                                    <span className="text-xs font-black uppercase tracking-wide text-slate-300">Office</span>
                                    <select
                                        value={filters.officeId}
                                        onChange={(event) => updateFilter("officeId", event.target.value)}
                                        className="mt-1 h-12 w-full rounded-2xl border border-white/10 bg-slate-900 px-3 text-sm font-black text-white outline-none"
                                    >
                                        <option value="">All offices</option>
                                        {data.offices.map((office) => (
                                            <option key={office.id} value={office.id}>{office.name}</option>
                                        ))}
                                    </select>
                                </label>
                            ) : null}
                        </div>
                    </div>
                </section>

                <section className="mx-auto mt-4 max-w-6xl rounded-[26px] border border-white/10 bg-slate-900 p-4 text-white shadow-2xl shadow-black/20">
                    <div className="grid gap-3 md:grid-cols-4">
                        {filters.mode === "all_dates" ? <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-black text-cyan-100">All Dates</div> : null}
                        <DateField visible={filters.mode === "single_date"} label="Single date" type="date" value={filters.singleDate} onChange={(value) => updateFilter("singleDate", value)} />
                        <DateField visible={filters.mode === "date_range"} label="Start date" type="date" value={filters.startDate} onChange={(value) => updateFilter("startDate", value)} />
                        <DateField visible={filters.mode === "date_range"} label="End date" type="date" value={filters.endDate} onChange={(value) => updateFilter("endDate", value)} />
                        <DateField visible={filters.mode === "single_month"} label="Single month" type="month" value={filters.singleMonth} onChange={(value) => updateFilter("singleMonth", value)} />
                        <DateField visible={filters.mode === "month_range"} label="Start month" type="month" value={filters.startMonth} onChange={(value) => updateFilter("startMonth", value)} />
                        <DateField visible={filters.mode === "month_range"} label="End month" type="month" value={filters.endMonth} onChange={(value) => updateFilter("endMonth", value)} />
                    </div>
                </section>

                <section className="mx-auto mt-5 max-w-6xl grid gap-3 md:grid-cols-5">
                    <BalanceCard label="Total Collections" value={money(totals.totalCollections)} hint={`${totals.paymentRows} payment rows`} tone="green" icon={<Banknote size={18} />} />
                    <BalanceCard label="Total Expenses" value={money(totals.totalExpenses)} hint={`${totals.expenseRows} expense rows`} tone="red" icon={<ReceiptText size={18} />} />
                    <BalanceCard label="Remaining Office Balance" value={money(totals.remainingBalance)} hint="Collections minus expenses" tone={totals.remainingBalance >= 0 ? "blue" : "red"} icon={<WalletCards size={18} />} />
                    <BalanceCard label="Number of expense rows" value={totals.expenseRows.toLocaleString()} hint={periodLabel} tone="slate" icon={<CheckCircle2 size={18} />} />
                    <BalanceCard label="Number of payment rows" value={totals.paymentRows.toLocaleString()} hint={report?.officeName ?? "Selected scope"} tone="slate" icon={<FileText size={18} />} />
                </section>

                <ExpenseFinanceAssistant insights={financeInsights} />

                <section className="mx-auto mt-5 max-w-6xl overflow-hidden rounded-[30px] border border-white/70 bg-white shadow-2xl shadow-slate-950/20">
                    <div className="border-b border-slate-200 bg-slate-950 p-4 text-white">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                                <p className="text-xs font-black uppercase tracking-wide text-cyan-200">Premium Expense Entry</p>
                                <h2 className="mt-1 text-2xl font-black">Record the correct workflow first</h2>
                                <p className="mt-1 text-sm font-semibold text-slate-300">Landlord payments, authorised office allowances, and unauthorised requests are routed separately.</p>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-3 lg:w-[560px]">
                                {([
                                    ["landlord_payment", "Landlord Payment"],
                                    ["authorised", "Authorised Expenses"],
                                    ["unauthorised", "Unauthorised Expenses"],
                                ] as Array<[ExpenseEntryMode, string]>).map(([mode, label]) => (
                                    <button
                                        key={`expense-entry-mode:${mode}`}
                                        type="button"
                                        onClick={() => {
                                            setEntryMode(mode);
                                            setMessage(null);
                                            setExpenseItem("");
                                            setAmount("");
                                        }}
                                        className={`h-12 rounded-2xl border px-3 text-sm font-black transition ${entryMode === mode ? "border-cyan-300 bg-cyan-300 text-slate-950 shadow-lg shadow-cyan-950/30" : "border-white/10 bg-white/10 text-white hover:bg-white/15"}`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="p-5">
                        {isLandlordPaidMode ? (
                            <div className="space-y-4">
                                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px_190px]">
                                    <label className="relative block">
                                        <span className="text-xs font-black uppercase tracking-wide text-slate-500">Search landlord</span>
                                        <div className="mt-1 flex h-16 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 focus-within:border-blue-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-100">
                                            <Search size={18} className="text-slate-400" />
                                            <input
                                                value={landlordSearch}
                                                onChange={(event) => {
                                                    setLandlordSearch(event.target.value);
                                                    setLandlordId("");
                                                    setSelectedLandlordDetail(null);
                                                }}
                                                placeholder="Type landlord name..."
                                                className="h-full min-w-0 flex-1 bg-transparent text-lg font-black text-slate-950 outline-none"
                                            />
                                            {landlordSearch ? <button type="button" onClick={() => { setLandlordSearch(""); setLandlordId(""); setSelectedLandlordDetail(null); setLandlordSearchResults([]); }} className="rounded-full p-1 text-slate-400 hover:bg-white hover:text-slate-700"><X size={16} /></button> : null}
                                        </div>
                                        {landlordSearchResults.length || loadingLandlordSearch ? (
                                            <div className="absolute z-30 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-950/20">
                                                {loadingLandlordSearch ? <div className="px-3 py-2 text-sm font-bold text-slate-500">Searching landlords...</div> : null}
                                                {landlordSearchResults.map((landlord) => (
                                                    <button key={`landlord-search:${landlord.id}:${landlord.officeId ?? "company"}`} type="button" onClick={() => {
                                                        setLandlordId(landlord.id);
                                                        setLandlordSearch(landlord.name);
                                                        setSelectedLandlordDetail(landlord as LandlordEntryDetail);
                                                        setLandlordSearchResults([]);
                                                        loadEntryDetail("landlord", landlord.id);
                                                    }} className="block w-full rounded-xl px-3 py-2 text-left hover:bg-blue-50">
                                                        <p className="text-sm font-black text-slate-950">{landlord.name}</p>
                                                        <p className="text-xs font-bold text-slate-500">{landlord.officeName ?? "Company"}{landlord.location ? ` · ${landlord.location}` : ""}</p>
                                                    </button>
                                                ))}
                                                {!loadingLandlordSearch && !landlordSearchResults.length ? <div className="px-3 py-2 text-sm font-bold text-slate-500">No landlord matches found.</div> : null}
                                            </div>
                                        ) : null}
                                    </label>
                                    <label className="block">
                                        <span className="text-xs font-black uppercase tracking-wide text-slate-500">Payment month</span>
                                        <input type="month" value={paymentMonth} onChange={(event) => setPaymentMonth(event.target.value)} className="mt-1 h-16 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-lg font-black text-slate-950 outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100" />
                                    </label>
                                    <label className="block">
                                        <span className="text-xs font-black uppercase tracking-wide text-slate-500">Payment method</span>
                                        <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="mt-1 h-16 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-lg font-black text-slate-950 outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100">
                                            <option value="cash">Cash</option>
                                            <option value="bank">Bank</option>
                                            <option value="mobile_money">Mobile Money</option>
                                            <option value="cheque">Cheque</option>
                                            <option value="other">Other</option>
                                        </select>
                                    </label>
                                </div>
                                {selectedLandlordOption ? (
                                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                        <PremiumEntryCard label="Landlord Name" value={selectedLandlordOption.name} />
                                        <PremiumEntryCard label="Location" value={selectedLandlordOption.location ?? "--"} />
                                        <PremiumEntryCard label="Office" value={selectedLandlordOption.officeName ?? activeOfficeName} />
                                        <PremiumEntryCard label="Outstanding Balance" value={loadingLandlordDetail ? "Loading..." : money(selectedLandlordDetail?.outstandingBalance ?? landlordPreview?.outstandingAmount ?? 0)} actionLabel="Edit" onAction={() => setMessage(isAdmin ? "Admin balance edits must post a controlled landlord ledger adjustment. Use the landlord settlement editor to apply the audited change." : "Office balance edits create an Admin approval request before they affect landlord totals.")} />
                                        <PremiumEntryCard label="Last Payment Amount" value={loadingLandlordDetail ? "Loading..." : money(selectedLandlordDetail?.lastPaymentAmount ?? 0)} />
                                        <PremiumEntryCard label="Last Payment Date" value={selectedLandlordDetail?.lastPaymentDate ?? "--"} />
                                        <PremiumEntryCard label="Landlord Payment Date" value={selectedLandlordDetail?.landlordPaymentDate?.slice(0, 10) ?? expenseDate} actionLabel="Edit" onAction={() => setMessage(isAdmin ? "Admin payment date edits are audited from the landlord settlement editor." : "Office payment date edits create an Admin approval request before approval.")} />
                                        <PremiumEntryCard label="Landlord Billing Date" value={selectedLandlordDetail?.landlordBillingDate?.slice(0, 10) ?? `${expenseDate.slice(0, 7)}-01`} actionLabel="Edit" onAction={() => setMessage(isAdmin ? "Admin billing date edits are audited from the landlord settlement editor." : "Office billing date edits create an Admin approval request before approval.")} />
                                        <PremiumEntryCard label="Commission Type" value={selectedLandlordOption.commissionType ?? "--"} />
                                        <PremiumEntryCard label="Commission Rate" value={selectedLandlordOption.commissionRate == null ? "--" : `${selectedLandlordOption.commissionRate}%`} />
                                        <PremiumEntryCard label="Full Rent Roll" value={money(selectedLandlordDetail?.fullRentRoll ?? 0)} />
                                        <PremiumEntryCard label="Net Payable" value={loadingLandlordDetail ? "Loading..." : money(selectedLandlordDetail?.netPayable ?? landlordPreview?.currentNetPayable ?? 0)} />
                                        <PremiumEntryCard label="Portfolio Value" value={money(selectedLandlordDetail?.portfolioValue ?? 0)} />
                                        <PremiumEntryCard label="Total Rooms" value={String(selectedLandlordDetail?.totalRooms ?? 0)} />
                                        <PremiumEntryCard label="Occupied Rooms" value={String(selectedLandlordDetail?.occupiedRooms ?? 0)} />
                                        <PremiumEntryCard label="Vacant Rooms" value={String(selectedLandlordDetail?.vacantRooms ?? 0)} />
                                        <PremiumEntryCard label="Vacated With Debt" value={String(selectedLandlordDetail?.vacatedWithDebt ?? 0)} />
                                        <PremiumEntryCard label="Advance Balance" value={money(selectedLandlordDetail?.advanceBalance ?? 0)} />
                                        <PremiumEntryCard label="Payment Status" value={selectedLandlordDetail?.paymentStatus ?? (landlordPreview ? (landlordPreview.advanceAmount > 0 ? "Review advance" : "Within payable") : "Enter amount")} />
                                    </div>
                                ) : (
                                    <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm font-bold text-slate-500">Search and select a landlord to load payment cards.</div>
                                )}
                                <LandlordPaymentAiPreview loading={loadingLandlordPreview} onContinue={() => setContinueAsAdvance(true)} onCancel={() => setContinueAsAdvance(false)} preview={landlordPreview} />
                                {landlordPreview && landlordPreview.advanceAmount > 0 && continueAsAdvance ? <AdvanceAgreementPanel agreement={advanceAgreement} advanceAmount={landlordPreview.advanceAmount} onChange={setAdvanceAgreement} paymentMonth={paymentMonth} /> : null}
                            </div>
                        ) : null}

                        {isAuthorisedMode ? (
                            <div className="space-y-4">
                                <div className="grid gap-3 md:grid-cols-4">
                                    {AUTHORISED_EXPENSES.filter((item) => item.value !== "transport_kampala" || isEntebbeOperationsOffice).map((item) => (
                                        <button key={`authorised-expense:${item.value}`} type="button" onClick={() => setAuthorisedType(item.value)} className={`rounded-2xl border p-4 text-left transition ${authorisedType === item.value ? "border-cyan-300 bg-cyan-50 shadow-lg shadow-cyan-100" : "border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50"}`}>
                                            <p className="text-sm font-black text-slate-950">{item.label}</p>
                                            <p className="mt-1 text-xs font-bold text-slate-500">{item.value === "employee_lunch" ? "UGX 7,000 per employee per day" : `${money(item.amount)} monthly allocation`}</p>
                                        </button>
                                    ))}
                                </div>
                                {isEmployeeExpenseMode ? (
                                    <>
                                        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                                            <label className="relative block">
                                                <span className="text-xs font-black uppercase tracking-wide text-slate-500">Search employee</span>
                                                <div className="mt-1 flex h-16 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 focus-within:border-blue-400 focus-within:bg-white focus-within:ring-4 focus:ring-blue-100">
                                                    <Search size={18} className="text-slate-400" />
                                                    <input value={employeeSearch} onChange={(event) => {
                                                        setEmployeeSearch(event.target.value);
                                                        setEmployeeId("");
                                                        setSelectedEmployeeDetail(null);
                                                    }} placeholder="Search employee name, phone or position..." className="h-full min-w-0 flex-1 bg-transparent text-lg font-black text-slate-950 outline-none" />
                                                    {employeeSearch ? <button type="button" onClick={() => { setEmployeeSearch(""); setEmployeeId(""); setSelectedEmployeeDetail(null); setEmployeeSearchResults([]); }} className="rounded-full p-1 text-slate-400 hover:bg-white hover:text-slate-700"><X size={16} /></button> : null}
                                                </div>
                                                {employeeSearchResults.length || loadingEmployeeSearch ? (
                                                    <div className="absolute z-30 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-950/20">
                                                        {loadingEmployeeSearch ? <div className="px-3 py-2 text-sm font-bold text-slate-500">Searching employees...</div> : null}
                                                        {employeeSearchResults.map((employee) => (
                                                            <button key={`employee-search:${employee.id}:${employee.officeId ?? "company"}`} type="button" onClick={() => {
                                                                setEmployeeId(employee.id);
                                                                setEmployeeSearch(employee.name);
                                                                setSelectedEmployeeDetail(employee as EmployeeLunchDetail);
                                                                setEmployeeSearchResults([]);
                                                                loadEntryDetail("employee", employee.id);
                                                            }} className="block w-full rounded-xl px-3 py-2 text-left hover:bg-blue-50">
                                                                <p className="text-sm font-black text-slate-950">{employee.name}</p>
                                                                <p className="text-xs font-bold text-slate-500">{employee.officeName ?? "Office"}{employee.role ? ` · ${employee.role}` : ""}{employee.phone ? ` · ${employee.phone}` : ""}</p>
                                                            </button>
                                                        ))}
                                                        {!loadingEmployeeSearch && !employeeSearchResults.length ? <div className="px-3 py-2 text-sm font-bold text-slate-500">No real employee matches found.</div> : null}
                                                    </div>
                                                ) : null}
                                            </label>
                                            <label className="block">
                                                <span className="text-xs font-black uppercase tracking-wide text-slate-500">Expense date</span>
                                                <input type="date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} className="mt-1 h-16 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-lg font-black text-slate-950 outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100" />
                                            </label>
                                        </div>
                                        {selectedEmployeeOption ? (
                                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                                <PremiumEntryCard label="Employee Name" value={selectedEmployeeOption.name} />
                                                <PremiumEntryCard label="Office" value={selectedEmployeeOption.officeName ?? activeOfficeName} />
                                                <PremiumEntryCard label="Position" value={selectedEmployeeDetail?.position ?? selectedEmployeeOption.role ?? "--"} />
                                                <PremiumEntryCard label="Daily Lunch Allocation" value={money(selectedEmployeeDetail?.dailyLunchAllocation ?? employeePreview?.dailyLunchAllowance ?? 7000)} />
                                                <PremiumEntryCard label="Previous Unused Lunch Balance" value={loadingEmployeeDetail ? "Loading..." : money(selectedEmployeeDetail?.previousUnusedLunchBalance ?? Math.max(0, (employeePreview?.lunchBalanceBefore ?? 0) - (employeePreview?.dailyLunchAllowance || 7000)))} />
                                                <PremiumEntryCard label="Lunch Available Today" value={loadingEmployeeDetail ? "Loading..." : money(selectedEmployeeDetail?.lunchAvailableToday ?? employeePreview?.remainingAllowance ?? 0)} />
                                                <PremiumEntryCard label="Total Usable Lunch" value={loadingEmployeeDetail ? "Loading..." : money(selectedEmployeeDetail?.totalUsableLunch ?? employeePreview?.remainingAllowance ?? 0)} />
                                                <PremiumEntryCard label="Lunch Used Today" value={loadingEmployeeDetail ? "Loading..." : money(selectedEmployeeDetail?.lunchUsedToday ?? 0)} />
                                                <PremiumEntryCard label="Remaining Lunch Balance" value={loadingEmployeeDetail ? "Loading..." : money(selectedEmployeeDetail?.remainingLunchBalance ?? Math.max(0, (employeePreview?.lunchBalanceBefore ?? 0) - Number(amount || 0)))} />
                                                <PremiumEntryCard label="Last Lunch Expense Date" value={selectedEmployeeDetail?.lastLunchExpenseDate ?? "--"} />
                                                <PremiumEntryCard label="Approval Status" value={selectedEmployeeDetail?.approvalStatus ?? (employeePreview?.approvalRequired ? "Approval required" : "Available")} />
                                            </div>
                                        ) : null}
                                        <EmployeeExpenseAiPreview loading={loadingEmployeePreview} preview={employeePreview} />
                                    </>
                                ) : null}
                                {authorisedType === "airtime" ? (
                                    <div className="grid gap-3 md:grid-cols-4">
                                        <PremiumEntryCard label="Monthly Airtime Allocation" value={money(30000)} />
                                        <PremiumEntryCard label="Airtime Used" value={money(authorisedUsage.airtimeUsed)} />
                                        <PremiumEntryCard label="Airtime Remaining" value={money(Math.max(0, 30000 - authorisedUsage.airtimeUsed))} />
                                        <PremiumEntryCard label="Current Month" value={expenseDate.slice(0, 7)} />
                                    </div>
                                ) : null}
                                {authorisedType === "internet" ? (
                                    <div className="grid gap-3 md:grid-cols-4">
                                        <PremiumEntryCard label="Monthly Allocation" value={money(110000)} />
                                        <PremiumEntryCard label="Current Month Status" value={authorisedUsage.internetRecorded ? "Internet has already been claimed this month." : "Available"} />
                                        <PremiumEntryCard label="Date Last Recorded" value={authorisedUsage.internetLastRecorded ? String(authorisedUsage.internetLastRecorded).slice(0, 10) : "--"} />
                                        <PremiumEntryCard label="Remaining Internet Allocation" value={money(authorisedUsage.internetRecorded ? 0 : 110000)} />
                                    </div>
                                ) : null}
                                {authorisedType === "transport_kampala" ? (
                                    <div className="grid gap-3 md:grid-cols-4">
                                        <PremiumEntryCard label="Monthly Allocation" value={money(200000)} />
                                        <PremiumEntryCard label="Used This Month" value={money(authorisedUsage.transportUsed)} />
                                        <PremiumEntryCard label="Remaining Balance" value={money(Math.max(0, 200000 - authorisedUsage.transportUsed))} />
                                        <PremiumEntryCard label="Trips Recorded" value={String(authorisedUsage.transportTrips)} />
                                    </div>
                                ) : null}
                            </div>
                        ) : null}

                        {entryMode === "unauthorised" ? (
                            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                                <label className="block">
                                    <span className="text-xs font-black uppercase tracking-wide text-slate-500">Expense Name</span>
                                    <input ref={itemInputRef} value={expenseItem} onChange={(event) => setExpenseItem(event.target.value)} placeholder="Describe the expense..." className="mt-1 h-16 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-2xl font-black text-slate-950 outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100" />
                                </label>
                                <label className="block">
                                    <span className="text-xs font-black uppercase tracking-wide text-slate-500">Expense date</span>
                                    <input type="date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} className="mt-1 h-16 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-lg font-black text-slate-950 outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100" />
                                </label>
                            </div>
                        ) : null}

                        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
                            <label className="block">
                                <span className="text-xs font-black uppercase tracking-wide text-slate-500">{entryMode === "unauthorised" ? "Reason / Supporting Notes" : "Supporting Notes"}</span>
                                <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={entryMode === "unauthorised" ? "Reason and notes required..." : "Optional notes..."} className="mt-1 h-16 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-lg font-black text-slate-950 outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100" />
                                {entryMode === "unauthorised" ? <span className="mt-1 block text-xs font-bold text-slate-500">Optional Attachment can be added to the approval request from Admin review.</span> : null}
                            </label>
                            <label className="block">
                                <span className="text-xs font-black uppercase tracking-wide text-slate-500">Amount</span>
                                <input ref={amountInputRef} value={amount} onChange={(event) => setAmount(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") saveExpense(); }} type="number" min="0" placeholder="UGX" className="mt-1 h-16 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-2xl font-black text-slate-950 outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100" />
                            </label>
                        </div>

                        {message ? <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">{message}</p> : null}
                        <div className="mt-5 flex flex-wrap items-center gap-3">
                            <button type="button" onClick={saveExpense} disabled={!canManage || isPending} className="inline-flex h-13 items-center gap-2 rounded-2xl bg-emerald-600 px-7 text-base font-black text-white shadow-lg shadow-emerald-100 transition hover:-translate-y-0.5 disabled:opacity-40">
                                {isPending ? <Loader2 className="animate-spin" size={18} /> : <ReceiptText size={18} />}
                                {isPending ? "Submitting..." : isLandlordPaidMode ? "Submit Landlord Payment" : isEmployeeExpenseMode ? "Record / Request Lunch" : entryMode === "unauthorised" ? "Submit for Admin Approval" : "Record / Request Authorised Expense"}
                            </button>
                            <button type="button" onClick={() => setShowPrintPreview(true)} className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700"><Printer size={16} />Print A4 Report</button>
                            <button type="button" onClick={() => setShowPrintPreview(true)} className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700"><Download size={16} />Export PDF</button>
                            <button type="button" onClick={exportCsv} className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700"><Download size={16} />Export CSV</button>
                            <span className="text-xs font-bold text-slate-500">{isAdmin ? "Admin overrides are audited immediately." : "Office entries that exceed limits or are unauthorised require Admin approval."}</span>
                        </div>
                    </div>
                </section>

                <LandlordPaymentRequestLedger requests={data.landlordPaymentRequests} />
                <GenericExpenseApprovalQueue
                    isAdmin={isAdmin}
                    requests={data.expenses.filter((expense) => (expense.status ?? expense.approvalState) === "pending")}
                    onReviewed={() => setRefreshToken((token) => token + 1)}
                />
                <EmployeeExpenseRequestLedger isAdmin={isAdmin} requests={data.employeeExpenseRequests} />
                <ExpenseChangeRequestLedger isAdmin={isAdmin} requests={data.expenseChangeRequests} onReviewed={() => setRefreshToken((token) => token + 1)} />

                <section className="mx-auto mt-5 max-w-6xl space-y-4">
                    <div className="overflow-hidden rounded-[26px] border border-white/70 bg-white shadow-2xl shadow-slate-950/15">
                        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                                <p className="text-xs font-black uppercase tracking-wide text-blue-600">Selected period ledger</p>
                                <h2 className="text-lg font-black text-slate-950">Recorded Expenses</h2>
                                <p className="mt-1 text-xs font-black uppercase tracking-wide text-slate-500">
                                    {filters.mode === "all_dates" ? "All Dates" : `Expense date: ${periodLabel}`}
                                </p>
                                {actionMessage ? <p className="mt-1 text-sm font-bold text-slate-600">{actionMessage}</p> : null}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                {[
                                    ["today", "Today"],
                                    ["yesterday", "Yesterday"],
                                    ["week", "This Week"],
                                    ["month", "This Month"],
                                    ["custom_date", "Custom Date"],
                                    ["custom_range", "Custom Range"],
                                    ["all_dates", "All Dates"],
                                ].map(([preset, label]) => (
                                    <button key={`expense-list-preset:${preset}`} type="button" onClick={() => applyExpenseListPreset(preset as Parameters<typeof applyExpenseListPreset>[0])} className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:border-blue-200 hover:bg-blue-50">
                                        {label}
                                    </button>
                                ))}
                                {filters.mode !== "all_dates" ? (
                                    <button type="button" onClick={() => applyExpenseListPreset("all_dates")} className="inline-flex h-9 items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-black text-slate-600 hover:bg-white">
                                        <X size={14} />
                                        Clear Date
                                    </button>
                                ) : null}
                                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">{loadingReport ? "Loading" : `${expenses.length} rows`}</span>
                                <button type="button" onClick={exportSelectedExpenses} className="inline-flex h-9 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700">
                                    <Download size={14} />
                                    Export Selected
                                </button>
                                {isAdmin ? (
                                    <>
                                        <input value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} placeholder="Delete reason" className="h-9 w-44 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-900" />
                                        <button type="button" disabled={isPending || !selectedExpenseIds.length} onClick={adminDeleteSelected} className="inline-flex h-9 items-center gap-1 rounded-xl bg-red-700 px-3 text-xs font-black text-white disabled:opacity-40">
                                            <Trash2 size={14} />
                                            Delete Selected
                                        </button>
                                    </>
                                ) : null}
                            </div>
                        </div>
                        <div className="max-h-[420px] overflow-auto scroll-smooth">
                            <table className="w-full min-w-[1480px] text-left text-sm">
                                <thead className="sticky top-0 bg-slate-950 text-xs uppercase text-slate-200">
                                    <tr>
                                        <th className="px-4 py-3">
                                            <input checked={expenses.length > 0 && expenses.every((expense) => selectedExpenseIds.includes(expense.id))} type="checkbox" onChange={(event) => setSelectedExpenseIds(event.target.checked ? expenses.map((expense) => expense.id) : [])} className="h-4 w-4 rounded border-slate-300 text-blue-700" />
                                        </th>
                                        <th className="px-4 py-3">Expense Date</th>
                                        <th className="px-4 py-3">Expense Type</th>
                                        <th className="px-4 py-3">Employee or Landlord</th>
                                        <th className="px-4 py-3">Office</th>
                                        <th className="px-4 py-3 text-right">Amount Spent</th>
                                        <th className="px-4 py-3">Recorded By</th>
                                        <th className="px-4 py-3">Approval Status</th>
                                        <th className="px-4 py-3">Approved By</th>
                                        <th className="px-4 py-3">Reason</th>
                                        <th className="px-4 py-3">Reference</th>
                                        <th className="px-4 py-3">Status</th>
                                        <th className="px-4 py-3">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {expenses.length ? expenses.map((expense) => (
                                        <tr key={expense.id} className={`border-b border-slate-100 transition-colors duration-700 ${expense.id === latestExpenseId ? "bg-emerald-100 ring-2 ring-inset ring-emerald-300" : "bg-white"}`}>
                                            <td className="px-4 py-3">
                                                <input checked={selectedExpenseIds.includes(expense.id)} type="checkbox" onChange={() => setSelectedExpenseIds((current) => current.includes(expense.id) ? current.filter((id) => id !== expense.id) : [...current, expense.id])} className="h-4 w-4 rounded border-slate-300 text-blue-700" />
                                            </td>
                                            <td className="px-4 py-3 font-bold text-slate-500">{expense.expense_date ?? expense.created_at?.slice(0, 10) ?? "--"}</td>
                                            <td className="px-4 py-3 font-black text-slate-950">{expense.item ?? expense.categoryName ?? expense.category ?? "Expense"}</td>
                                            <td className="px-4 py-3 font-bold text-slate-700">{expense.employeeName ?? expense.landlordName ?? expense.vendor ?? "--"}</td>
                                            <td className="px-4 py-3 font-bold text-slate-500">{expense.officeName ?? report?.officeName ?? data.office?.office_name ?? data.office?.name ?? "Office"}</td>
                                            <td className="px-4 py-3 text-right font-black text-red-700">{money(expense.amount)}</td>
                                            <td className="px-4 py-3 font-bold text-slate-500">{expense.submittedByName ?? "System"}</td>
                                            <td className="px-4 py-3"><StatusBadge status={expense.approvalState} /></td>
                                            <td className="px-4 py-3 font-bold text-slate-500">{(expense as ExpenseItem & { approved_by?: string | null }).approved_by ?? "--"}</td>
                                            <td className="max-w-[260px] truncate px-4 py-3 font-bold text-slate-500" title={expense.description ?? ""}>{expense.description ?? "--"}</td>
                                            <td className="px-4 py-3 font-bold text-slate-500">{expense.expense_number ?? expense.id.slice(0, 8)}</td>
                                            <td className="px-4 py-3"><StatusBadge status={expense.status ?? expense.approvalState} /></td>
                                            <td className="px-4 py-3">
                                                <div className="flex min-w-[260px] flex-wrap gap-1">
                                                    <IconAction label="View" icon={<Eye size={14} />} onClick={() => setExpenseModal({ expense, mode: "view" })} />
                                                    <IconAction label={isAdmin ? "Edit" : "Request Edit"} icon={<Edit3 size={14} />} onClick={() => setExpenseModal({ expense, mode: "edit" })} />
                                                    <IconAction label="Change Date" icon={<FileText size={14} />} onClick={() => setExpenseModal({ expense, mode: "date" })} />
                                                    <IconAction label="Assign Employee" icon={<UserRound size={14} />} onClick={() => setExpenseModal({ expense, mode: "employee" })} />
                                                    <IconAction label="History" icon={<History size={14} />} onClick={() => setExpenseModal({ expense, mode: "history" })} />
                                                </div>
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan={13} className="px-4 py-8 text-center font-bold text-slate-500">
                                                {loadingReport ? "Loading expenses..." : "No expenses recorded for this period yet."}
                                            </td>
                                        </tr>
                                    )}
                                    <tr ref={bottomRef} aria-hidden="true">
                                        <td colSpan={13} className="h-0 p-0" />
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="sticky bottom-0 rounded-[26px] border border-white/70 bg-white p-4 shadow-2xl shadow-slate-950/15">
                        <p className="text-xs font-black uppercase tracking-wide text-blue-600">Running totals</p>
                        <h2 className="text-lg font-black text-slate-950">Selected Period</h2>
                        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                            <Total label="Total collections" value={money(totals.totalCollections)} icon={<Banknote size={14} />} />
                            <Total label="Total expenses" value={money(totals.totalExpenses)} icon={<ReceiptText size={14} />} />
                            <Total label="Remaining balance" value={money(totals.remainingBalance)} icon={<WalletCards size={14} />} />
                            <Total label="Expense rows" value={totals.expenseRows.toLocaleString()} icon={<CheckCircle2 size={14} />} />
                            <Total label="Payment rows" value={totals.paymentRows.toLocaleString()} icon={<FileText size={14} />} />
                        </div>
                    </div>
                </section>
            </div>
            {showPrintPreview ? (
                <PrintPreview
                    companyName={data.company?.name ?? "Company"}
                    onClose={() => setShowPrintPreview(false)}
                    report={report}
                />
            ) : null}
            {expenseModal ? (
                <ExpenseActionModal
                    categories={data.categories}
                    employeeOptions={data.employeeOptions}
                    expense={expenseModal.expense}
                    isAdmin={isAdmin}
                    mode={expenseModal.mode}
                    offices={data.offices}
                    onClose={() => setExpenseModal(null)}
                    onDone={(text) => {
                        setActionMessage(text);
                        setExpenseModal(null);
                        setRefreshToken((token) => token + 1);
                    }}
                />
            ) : null}
        </main>
    );
}

function DateField({ label, onChange, type, value, visible }: { label: string; onChange: (value: string) => void; type: "date" | "month"; value: string; visible: boolean }) {
    if (!visible) return null;
    return (
        <label className="block">
            <span className="text-xs font-black uppercase tracking-wide text-slate-300">{label}</span>
            <input
                type={type}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="mt-1 h-11 w-full rounded-2xl border border-white/10 bg-white px-4 text-sm font-black text-slate-950 outline-none"
            />
        </label>
    );
}

function BalanceCard({ hint, icon, label, tone, value }: { hint: string; icon: ReactNode; label: string; tone: "blue" | "green" | "red" | "slate"; value: string }) {
    const toneClass = {
        blue: "border-blue-200 bg-blue-50 text-blue-800",
        green: "border-emerald-200 bg-emerald-50 text-emerald-800",
        red: "border-rose-200 bg-rose-50 text-rose-800",
        slate: "border-slate-200 bg-white text-slate-800",
    }[tone];
    return (
        <div className={`rounded-[24px] border p-4 shadow-xl shadow-slate-950/10 ${toneClass}`}>
            <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-black uppercase tracking-wide opacity-75">{label}</p>
                {icon}
            </div>
            <p className="mt-3 break-words text-2xl font-black leading-tight">{value}</p>
            <p className="mt-1 text-xs font-bold opacity-70">{hint}</p>
        </div>
    );
}

function PremiumEntryCard({ actionLabel, label, onAction, value }: { actionLabel?: string; label: string; onAction?: () => void; value: string }) {
    return (
        <div className="min-h-[124px] rounded-2xl border border-white/70 bg-gradient-to-br from-white via-slate-50 to-blue-50/70 p-4 shadow-xl shadow-slate-950/10 ring-1 ring-slate-900/5">
            <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
                {actionLabel && onAction ? (
                    <button type="button" onClick={onAction} className="inline-flex h-7 items-center gap-1 rounded-xl border border-blue-100 bg-white px-2 text-[11px] font-black text-blue-700 shadow-sm">
                        <Edit3 size={12} />
                        {actionLabel}
                    </button>
                ) : null}
            </div>
            <p className="mt-3 break-words text-xl font-black leading-tight text-slate-950">{value}</p>
        </div>
    );
}

function Total({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2">
            <span className="flex items-center gap-2 text-xs font-black text-slate-500">
                {icon}
                {label}
            </span>
            <span className="text-sm font-black text-slate-950">{value}</span>
        </div>
    );
}

function PrintPreview({ companyName, onClose, report }: { companyName: string; onClose: () => void; report: ExpenseBalanceReport | null }) {
    if (!report) return null;
    return (
        <div className="fixed inset-0 z-[150] overflow-auto bg-slate-950/80 p-4 backdrop-blur-sm">
            <div className="mx-auto max-w-5xl rounded-3xl bg-white p-5 shadow-2xl">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
                    <div>
                        <p className="text-xs font-black uppercase text-blue-700">Print preview</p>
                        <h2 className="text-xl font-black text-slate-950">Expense Balance Report</h2>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => window.print()} className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-black text-white">Print / Save PDF</button>
                        <button onClick={onClose} className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-700">Close</button>
                    </div>
                </div>
                <div className="print-report min-h-[1050px] bg-white p-6 text-slate-950">
                    <header className="border-b-2 border-slate-950 pb-4">
                        <p className="text-sm font-black uppercase tracking-wide text-slate-500">{companyName}</p>
                        <h1 className="mt-1 text-3xl font-black">Expense Balance Report</h1>
                        <div className="mt-3 grid gap-2 text-sm font-semibold sm:grid-cols-2">
                            <p>Period: {report.filters.startDate} to {report.filters.endDate}</p>
                            <p>Office: {report.officeName}</p>
                            <p>Generated: {new Date(report.generatedAt).toLocaleString()}</p>
                            <p>Generated by: {report.generatedBy}</p>
                        </div>
                    </header>
                    <section className="mt-5 grid gap-3 sm:grid-cols-3">
                        <ReportBox label="Collections" value={money(report.totals.totalCollections)} />
                        <ReportBox label="Expenses" value={money(report.totals.totalExpenses)} />
                        <ReportBox label="Remaining Balance" value={money(report.totals.remainingBalance)} />
                    </section>
                    <table className="mt-6 w-full border-collapse text-sm">
                        <thead>
                            <tr className="bg-slate-950 text-left text-white">
                                <th className="border border-slate-300 px-3 py-2">Time</th>
                                <th className="border border-slate-300 px-3 py-2">Expense Item</th>
                                <th className="border border-slate-300 px-3 py-2">Office</th>
                                <th className="border border-slate-300 px-3 py-2 text-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {report.expenses.map((expense) => (
                                <tr key={expense.id}>
                                    <td className="border border-slate-300 px-3 py-2">{expenseTime(expense)}</td>
                                    <td className="border border-slate-300 px-3 py-2 font-semibold">{expense.item ?? expense.expense_number ?? "Expense"}</td>
                                    <td className="border border-slate-300 px-3 py-2">{expense.officeName ?? report.officeName}</td>
                                    <td className="border border-slate-300 px-3 py-2 text-right font-bold">{money(expense.amount)}</td>
                                </tr>
                            ))}
                            <tr className="font-black">
                                <td colSpan={3} className="border border-slate-300 px-3 py-2 text-right">Total Expenses</td>
                                <td className="border border-slate-300 px-3 py-2 text-right">{money(report.totals.totalExpenses)}</td>
                            </tr>
                        </tbody>
                    </table>
                    <footer className="mt-10 grid gap-8 text-sm font-semibold sm:grid-cols-2">
                        <p>Prepared by: __________________________</p>
                        <p>Approved by: __________________________</p>
                    </footer>
                </div>
            </div>
        </div>
    );
}

function ExpenseFinanceAssistant({ insights }: { insights: Array<{ id: string; title: string; message: string; tone: "blue" | "amber" | "red" | "green" }> }) {
    return (
        <section className="mx-auto mt-5 max-w-6xl rounded-[28px] border border-cyan-300/20 bg-slate-950 p-5 text-white shadow-2xl shadow-black/25">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs font-black uppercase text-cyan-100">
                        <Bot size={14} />
                        AI Finance Assistant
                    </div>
                    <h2 className="mt-3 text-2xl font-black">Live expense and landlord-payment intelligence</h2>
                    <p className="mt-1 text-sm font-semibold text-slate-300">Flags approval queues, high spend, duplicate-risk patterns, and cash pressure from live Supabase data.</p>
                </div>
                <span className="rounded-full bg-white/10 px-3 py-2 text-xs font-black uppercase text-cyan-100">Live</span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
                {insights.map((insight) => (
                    <div key={`expense-ai:${insight.id}`} className={`rounded-2xl border p-4 ${insight.tone === "red" ? "border-rose-300/25 bg-rose-400/10" : insight.tone === "amber" ? "border-amber-300/25 bg-amber-400/10" : insight.tone === "green" ? "border-emerald-300/25 bg-emerald-400/10" : "border-cyan-300/25 bg-cyan-400/10"}`}>
                        <div className="flex items-center gap-2">
                            <AlertTriangle size={15} className={insight.tone === "red" ? "text-rose-200" : insight.tone === "amber" ? "text-amber-200" : insight.tone === "green" ? "text-emerald-200" : "text-cyan-200"} />
                            <p className="text-sm font-black">{insight.title}</p>
                        </div>
                        <p className="mt-2 text-sm font-semibold text-slate-300">{insight.message}</p>
                    </div>
                ))}
            </div>
        </section>
    );
}

function LandlordPaymentAiPreview({
    loading,
    onCancel,
    onContinue,
    preview,
}: {
    loading: boolean;
    onCancel: () => void;
    onContinue: () => void;
    preview: LandlordPaymentPreview | null;
}) {
    if (loading) {
        return <div className="mb-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-black text-blue-800">Checking live landlord payable position...</div>;
    }
    if (!preview) return null;
    const createsAdvance = preview.advanceAmount > 0;
    return (
        <section className={`mb-4 rounded-3xl border p-4 ${createsAdvance ? "border-amber-300 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div>
                    <p className={`text-xs font-black uppercase tracking-wide ${createsAdvance ? "text-amber-700" : "text-emerald-700"}`}>AI Finance Assistant</p>
                    <h3 className="mt-1 text-lg font-black text-slate-950">
                        {createsAdvance
                            ? preview.normalPaymentAmount > 0
                                ? "This payment is partly normal payment and partly advance."
                                : "Landlord has already received what they are supposed to get for this month."
                            : "This amount is within the landlord payable balance."}
                    </h3>
                    <p className="mt-1 text-sm font-bold text-slate-600">
                        Expected {money(preview.currentNetPayable)} · Already paid {money(preview.alreadyPaidAmount)} · Remaining payable {money(preview.outstandingAmount)}
                    </p>
                    <p className="mt-1 text-sm font-bold text-slate-600">
                        Active advances {money(preview.activeAdvanceBalance)} · Pending approvals {money(preview.pendingRequestAmount)}
                        {preview.duplicatePaymentRisk ? " · Duplicate payment risk detected" : ""}
                    </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 xl:w-[360px]">
                    <MiniFinance label="Normal payment" value={money(preview.normalPaymentAmount)} tone="green" />
                    <MiniFinance label="Advance portion" value={money(preview.advanceAmount)} tone={createsAdvance ? "amber" : "slate"} />
                </div>
            </div>
            {createsAdvance ? (
                <div className="mt-4 rounded-2xl border border-amber-300 bg-white p-4">
                    <p className="text-sm font-black text-amber-900">
                        The extra amount will be treated as a landlord advance. Are you sure you want to give this landlord an advance?
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" onClick={onCancel} className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-700">Cancel</button>
                        <button type="button" onClick={onContinue} className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-black text-white">Continue as Advance</button>
                    </div>
                </div>
            ) : null}
        </section>
    );
}

function MiniFinance({ label, tone, value }: { label: string; tone: "green" | "amber" | "slate"; value: string }) {
    const classes = tone === "green"
        ? "bg-emerald-100 text-emerald-800"
        : tone === "amber"
            ? "bg-amber-100 text-amber-800"
            : "bg-slate-100 text-slate-700";
    return (
        <div className={`rounded-2xl px-4 py-3 ${classes}`}>
            <p className="text-[11px] font-black uppercase opacity-70">{label}</p>
            <p className="mt-1 text-lg font-black">{value}</p>
        </div>
    );
}

function EmployeeExpenseAiPreview({ loading, preview }: { loading: boolean; preview: EmployeeExpensePreview | null }) {
    if (loading) {
        return <div className="mb-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-black text-blue-800">Checking live employee allowance...</div>;
    }
    if (!preview) return null;
    return (
        <section className={`mb-4 rounded-3xl border p-4 ${preview.extraAmount > 0 ? "border-amber-300 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
            <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div>
                    <p className={`text-xs font-black uppercase tracking-wide ${preview.extraAmount > 0 ? "text-amber-700" : "text-emerald-700"}`}>AI Employee Expense Assistant</p>
                    <h3 className="mt-1 text-lg font-black text-slate-950">
                        {preview.extraAmount > 0
                            ? `${preview.itemName} is above this employee's remaining allowance.`
                            : `${preview.itemName} is within this employee's allowance.`}
                    </h3>
                    <p className="mt-1 text-sm font-bold text-slate-600">
                        {preview.itemName.toLowerCase() === "lunch"
                            ? `Daily lunch ${money(preview.dailyLunchAllowance)} · Earned this month ${money(preview.lunchEarnedThisMonth)} · Taken ${money(preview.lunchTakenThisMonth)}`
                            : `Allowance ${money(preview.allowanceAmount)} · Already used ${money(preview.alreadySpentAmount)} · Pending ${money(preview.pendingAmount)}`}
                    </p>
                    <p className="mt-1 text-sm font-bold text-slate-600">
                        Available before this entry {money(preview.remainingAllowance)} · After entry {money(preview.lunchBalanceAfter || Math.max(0, preview.remainingAllowance - preview.allowedPortion))}
                    </p>
                    {preview.itemName.toLowerCase() === "lunch" ? (
                        <p className="mt-1 text-sm font-bold text-slate-600">
                            Attendance: {preview.presentForExpenseDate ? `working day (${preview.attendanceStatus})` : "not checked in / off day"} · Unused balance adds to salary at payroll.
                        </p>
                    ) : (
                        <p className="mt-1 text-sm font-bold text-slate-600">
                            Treatment: {preview.treatment === "employee_personal_expense" ? "salary deduction" : "company expense"}
                        </p>
                    )}
                    {preview.extraAmount > 0 ? (
                        <p className="mt-1 text-sm font-black text-amber-800">
                            Salary impact after Admin approval: {money(preview.salaryImpactAmount)} payroll deduction.
                        </p>
                    ) : null}
                    {preview.itemName.toLowerCase() === "lunch" && !preview.presentForExpenseDate ? (
                        <p className="mt-2 rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs font-black text-amber-800">
                            No attendance check-in was found for this date, so no new lunch allowance is earned for the day. Any amount above carried balance will require Admin approval.
                        </p>
                    ) : null}
                </div>
                <div className="grid gap-2 sm:grid-cols-2 xl:w-[360px]">
                    <MiniFinance label="Normal allowed" value={money(preview.allowedPortion)} tone="green" />
                    <MiniFinance label="Needs approval" value={money(preview.extraAmount)} tone={preview.extraAmount > 0 ? "amber" : "slate"} />
                </div>
            </div>
            {preview.extraAmount > 0 ? (
                <div className="mt-4 rounded-2xl border border-amber-300 bg-white p-4">
                    <p className="text-sm font-black text-amber-900">
                        {preview.itemName} allowance available is {money(preview.remainingAllowance)}. The entered amount leaves {money(preview.extraAmount)} above the available balance and must be reviewed before payroll is affected. Only Other expenses are salary deductible.
                    </p>
                </div>
            ) : null}
        </section>
    );
}

type AdvanceAgreementState = {
    repaymentType: string;
    interestMode: string;
    interestType: string;
    interestValue: string;
    fixedInterestAmount: string;
    deductionStartDate: string;
    deductionEndDate: string;
    paymentPlan: string;
    monthlyDeductionAmount: string;
    principalClearanceMethod: string;
};

function AdvanceAgreementPanel({
    advanceAmount,
    agreement,
    onChange,
    paymentMonth,
}: {
    advanceAmount: number;
    agreement: AdvanceAgreementState;
    onChange: (value: AdvanceAgreementState) => void;
    paymentMonth: string;
}) {
    const setField = (key: keyof AdvanceAgreementState, value: string) => onChange({ ...agreement, [key]: value });
    return (
        <section className="mb-4 rounded-3xl border border-blue-200 bg-slate-950 p-4 text-white">
            <p className="text-xs font-black uppercase tracking-wide text-blue-200">Landlord Advance / Loan Agreement</p>
            <h3 className="mt-1 text-xl font-black">Advance portion: {money(advanceAmount)}</h3>
            <p className="mt-1 text-sm font-semibold text-slate-300">Admin approval will create this advance only after review. No active advance is created now.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <AgreementField label="Recovery type">
                    <select value={agreement.repaymentType} onChange={(event) => setField("repaymentType", event.target.value)} className="mt-1 h-12 w-full rounded-2xl border border-white/10 bg-white px-4 text-sm font-black text-slate-950 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-400/20">
                        <option value="simple_advance">Simple advance</option>
                        <option value="principal_fixed_interest">Principal + fixed interest</option>
                        <option value="declining_balance_interest">Declining balance interest</option>
                        <option value="interest_only">Interest-only</option>
                        <option value="custom">Custom</option>
                    </select>
                </AgreementField>
                <AgreementField label="Interest mode">
                    <select value={agreement.interestMode} onChange={(event) => setField("interestMode", event.target.value)} className="mt-1 h-12 w-full rounded-2xl border border-white/10 bg-white px-4 text-sm font-black text-slate-950 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-400/20">
                        <option value="none">No interest</option>
                        <option value="fixed_principal">Fixed principal</option>
                        <option value="declining_balance">Declining balance</option>
                        <option value="interest_only">Interest only</option>
                    </select>
                </AgreementField>
                <AgreementField label="Interest entry">
                    <select value={agreement.interestType} onChange={(event) => setField("interestType", event.target.value)} className="mt-1 h-12 w-full rounded-2xl border border-white/10 bg-white px-4 text-sm font-black text-slate-950 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-400/20">
                        <option value="none">No interest</option>
                        <option value="fixed">Fixed amount</option>
                        <option value="percentage">Percentage</option>
                    </select>
                </AgreementField>
                <AgreementField label="Interest value">
                    <input value={agreement.interestValue} onChange={(event) => setField("interestValue", event.target.value)} placeholder="0" inputMode="numeric" className="mt-1 h-12 w-full rounded-2xl border border-white/10 bg-white px-4 text-sm font-black text-slate-950 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-400/20" />
                </AgreementField>
                <AgreementField label="Deduction starts">
                    <input type="date" value={agreement.deductionStartDate || `${paymentMonth}-01`} onChange={(event) => setField("deductionStartDate", event.target.value)} className="mt-1 h-12 w-full rounded-2xl border border-white/10 bg-white px-4 text-sm font-black text-slate-950 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-400/20" />
                </AgreementField>
                <AgreementField label="Expected end">
                    <input type="date" value={agreement.deductionEndDate} onChange={(event) => setField("deductionEndDate", event.target.value)} className="mt-1 h-12 w-full rounded-2xl border border-white/10 bg-white px-4 text-sm font-black text-slate-950 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-400/20" />
                </AgreementField>
                <AgreementField label="Payment plan">
                    <select value={agreement.paymentPlan} onChange={(event) => setField("paymentPlan", event.target.value)} className="mt-1 h-12 w-full rounded-2xl border border-white/10 bg-white px-4 text-sm font-black text-slate-950 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-400/20">
                        <option value="one_time">One-time deduction</option>
                        <option value="monthly">Monthly deduction</option>
                        <option value="custom">Custom instalments</option>
                    </select>
                </AgreementField>
                <AgreementField label="Deduct every month">
                    <input value={agreement.monthlyDeductionAmount} onChange={(event) => setField("monthlyDeductionAmount", event.target.value)} placeholder="UGX amount" inputMode="numeric" className="mt-1 h-12 w-full rounded-2xl border border-white/10 bg-white px-4 text-sm font-black text-slate-950 outline-none focus:border-blue-300 focus:ring-4 focus:ring-blue-400/20" />
                </AgreementField>
            </div>
        </section>
    );
}

function GenericExpenseApprovalQueue({ isAdmin, onReviewed, requests }: { isAdmin: boolean; onReviewed: () => void; requests: ExpenseItem[] }) {
    const [comments, setComments] = useState<Record<string, string>>({});
    const [message, setMessage] = useState<string | null>(null);
    const [pendingId, setPendingId] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    if (!isAdmin || !requests.length) return null;

    function decide(expense: ExpenseItem, decision: "approved" | "rejected") {
        const note = comments[expense.id]?.trim() ?? "";
        if (decision === "rejected" && !note) {
            setMessage("Enter a rejection reason before rejecting an expense.");
            return;
        }
        setPendingId(expense.id);
        startTransition(async () => {
            try {
                if (decision === "approved") {
                    await approveExpense({ expenseId: expense.id, notes: note || undefined });
                    setMessage("Expense approved. Cash Position Centre will reflect the outflow once.");
                } else {
                    await rejectExpense({ expenseId: expense.id, notes: note });
                    setMessage("Expense rejected. Cash position remains unchanged.");
                }
                setComments((current) => ({ ...current, [expense.id]: "" }));
                onReviewed();
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Expense decision failed.");
            } finally {
                setPendingId(null);
            }
        });
    }

    return (
        <section className="mx-auto mt-5 max-w-6xl overflow-hidden rounded-[26px] border border-amber-200 bg-white shadow-2xl shadow-slate-950/15">
            <div className="border-b border-amber-100 bg-amber-50 px-4 py-3">
                <p className="text-xs font-black uppercase tracking-wide text-amber-700">Admin approval centre</p>
                <h2 className="text-lg font-black text-slate-950">Pending Office Expenses</h2>
                <p className="mt-1 text-sm font-bold text-slate-600">Pending expenses are visible here but do not reduce cash until Admin approval.</p>
                {message ? <p className="mt-2 rounded-xl bg-white px-3 py-2 text-sm font-black text-slate-700">{message}</p> : null}
            </div>
            <div className="grid gap-3 p-4 lg:grid-cols-2">
                {requests.map((expense) => {
                    const note = comments[expense.id] ?? "";
                    const busy = isPending && pendingId === expense.id;
                    return (
                        <article key={`generic-expense-approval:${expense.id}`} className="min-w-0 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                    <p className="break-words text-base font-black text-slate-950">{expense.item ?? expense.expense_number ?? "Office expense"}</p>
                                    <p className="mt-1 text-xs font-bold text-slate-500">{expense.officeName ?? "Office"} · Submitted by {expense.submittedByName ?? "account"} · {expense.expense_date ?? "No date"}</p>
                                </div>
                                <span className="shrink-0 rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">{money(expense.amount)}</span>
                            </div>
                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                <MiniFinance label="Category" value={expense.categoryName ?? expense.category ?? "Expense"} tone="slate" />
                                <MiniFinance label="Cash impact now" value="UGX 0 pending" tone="amber" />
                                <MiniFinance label="Payment method" value={expense.paymentMethod ?? "Not set"} tone="slate" />
                                <MiniFinance label="Projected after approval" value={`-${money(expense.amount)}`} tone="amber" />
                            </div>
                            <label className="mt-3 block">
                                <span className="text-xs font-black uppercase tracking-wide text-slate-500">Admin note / rejection reason</span>
                                <input
                                    value={note}
                                    onChange={(event) => setComments((current) => ({ ...current, [expense.id]: event.target.value }))}
                                    placeholder="Required for rejection"
                                    className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-950 outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                                />
                            </label>
                            <div className="mt-3 flex flex-wrap gap-2">
                                <button disabled={isPending} onClick={() => decide(expense, "approved")} className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-black text-white disabled:opacity-40">
                                    {busy ? "Processing..." : "Approve"}
                                </button>
                                <button disabled={isPending} onClick={() => decide(expense, "rejected")} className="rounded-xl bg-rose-700 px-4 py-2 text-xs font-black text-white disabled:opacity-40">
                                    Reject
                                </button>
                                <a href={`/office/admin/cash-position?officeId=${encodeURIComponent(String(expense.office_id ?? ""))}`} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700">
                                    Open office cash position
                                </a>
                            </div>
                        </article>
                    );
                })}
            </div>
        </section>
    );
}

function AgreementField({ children, label }: { children: ReactNode; label: string }) {
    return (
        <label className="block">
            <span className="text-xs font-black uppercase tracking-wide text-slate-300">{label}</span>
            {children}
        </label>
    );
}

function LandlordPaymentRequestLedger({ requests }: { requests: ExpensesPageData["landlordPaymentRequests"] }) {
    if (!requests.length) return null;
    return (
        <section className="mx-auto mt-5 max-w-6xl overflow-hidden rounded-[26px] border border-white/70 bg-white shadow-2xl shadow-slate-950/15">
            <div className="border-b border-slate-200 px-4 py-3">
                <p className="text-xs font-black uppercase tracking-wide text-amber-600">Landlord payment approval queue</p>
                <h2 className="text-lg font-black text-slate-950">Expense-routed Landlord Payments</h2>
            </div>
            <div className="overflow-auto">
                <table className="w-full min-w-[900px] text-left text-sm">
                    <thead className="bg-slate-950 text-xs uppercase text-slate-200">
                        <tr>
                            <th className="px-4 py-3">Date</th>
                            <th className="px-4 py-3">Landlord</th>
                            <th className="px-4 py-3">Office</th>
                            <th className="px-4 py-3 text-right">Amount</th>
                            <th className="px-4 py-3 text-right">Cash Payment</th>
                            <th className="px-4 py-3 text-right">Advance Recovery</th>
                            <th className="px-4 py-3 text-right">New Advance</th>
                            <th className="px-4 py-3">Method</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Admin comment</th>
                        </tr>
                    </thead>
                    <tbody>
                        {requests.map((request) => (
                            <tr key={`landlord-payment-expense-request:${request.id}`} className="border-b border-slate-100">
                                <td className="px-4 py-3 font-bold text-slate-500">{request.paymentDate}</td>
                                <td className="px-4 py-3 font-black text-slate-950">{request.landlordName}</td>
                                <td className="px-4 py-3 font-bold text-slate-500">{request.officeName}</td>
                                <td className="px-4 py-3 text-right font-black text-slate-950">{money(request.amount)}</td>
                                <td className="px-4 py-3 text-right font-black text-emerald-700">{money(request.cashPaymentAmount)}</td>
                                <td className="px-4 py-3 text-right font-black text-indigo-700">{money(request.advanceRecoveryAmount)}</td>
                                <td className="px-4 py-3 text-right font-black text-amber-700">{money(request.advanceAmount)}</td>
                                <td className="px-4 py-3 font-bold capitalize text-slate-500">{request.paymentMethod.replaceAll("_", " ")}</td>
                                <td className="px-4 py-3"><StatusBadge status={request.status} /></td>
                                <td className="px-4 py-3 font-bold text-slate-500">{request.adminComment ?? request.notes ?? "No comment"}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

function EmployeeExpenseRequestLedger({ isAdmin, requests }: { isAdmin: boolean; requests: ExpensesPageData["employeeExpenseRequests"] }) {
    const [comments, setComments] = useState<Record<string, string>>({});
    const [message, setMessage] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [bulkModal, setBulkModal] = useState<null | { decision: "approved" | "rejected"; ids: string[] }>(null);
    const [bulkComment, setBulkComment] = useState("");
    const [isPending, startTransition] = useTransition();
    if (!requests.length) return null;
    const pendingRequests = requests.filter((request) => request.status === "pending");

    function decide(requestId: string, decision: "approved" | "rejected") {
        setMessage(null);
        startTransition(async () => {
            try {
                await decideEmployeeExpenseRequest({
                    requestId,
                    decision,
                    comment: comments[requestId] ?? "",
                });
                setMessage(decision === "approved" ? "Employee extra expense approved." : "Employee extra expense rejected.");
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Employee expense request could not be updated.");
            }
        });
    }

    function openBulk(decision: "approved" | "rejected", ids: string[]) {
        const uniqueIds = Array.from(new Set(ids)).filter(Boolean);
        if (!uniqueIds.length) {
            setMessage("Select at least one pending employee expense request first.");
            return;
        }
        setBulkComment("");
        setBulkModal({ decision, ids: uniqueIds });
    }

    function runBulk() {
        if (!bulkModal) return;
        if (bulkModal.decision === "rejected" && !bulkComment.trim()) {
            setMessage("Rejection reason is required.");
            return;
        }
        startTransition(async () => {
            try {
                for (const requestId of bulkModal.ids) {
                    await decideEmployeeExpenseRequest({
                        requestId,
                        decision: bulkModal.decision,
                        comment: bulkComment.trim(),
                    });
                }
                setMessage(`${bulkModal.ids.length} employee expense request(s) ${bulkModal.decision}.`);
                setSelectedIds([]);
                setBulkModal(null);
                setBulkComment("");
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Bulk employee expense review failed.");
            }
        });
    }

    return (
        <section className="mx-auto mt-5 max-w-6xl overflow-hidden rounded-[26px] border border-white/70 bg-white shadow-2xl shadow-slate-950/15">
            <div className="border-b border-slate-200 px-4 py-3">
                <p className="text-xs font-black uppercase tracking-wide text-blue-600">Employee expense approval queue</p>
                <h2 className="text-lg font-black text-slate-950">Above-Allowance Employee Expenses</h2>
                {message ? <p className="mt-2 text-sm font-bold text-slate-600">{message}</p> : null}
                {isAdmin && pendingRequests.length > 0 ? (
                    <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <label className="inline-flex items-center gap-2 text-xs font-black text-slate-700">
                            <input checked={pendingRequests.every((request) => selectedIds.includes(request.id))} disabled={isPending} type="checkbox" onChange={(event) => setSelectedIds(event.target.checked ? pendingRequests.map((request) => request.id) : [])} className="h-4 w-4 rounded border-slate-300 text-blue-700" />
                            Select All Pending ({pendingRequests.length})
                        </label>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <button disabled={isPending || selectedIds.length === 0} onClick={() => openBulk("approved", selectedIds)} className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-black text-white disabled:opacity-40">Approve Selected</button>
                            <button disabled={isPending || selectedIds.length === 0} onClick={() => openBulk("rejected", selectedIds)} className="rounded-xl bg-red-700 px-3 py-2 text-xs font-black text-white disabled:opacity-40">Reject Selected</button>
                            <button disabled={isPending} onClick={() => openBulk("approved", pendingRequests.map((request) => request.id))} className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-black text-emerald-800 disabled:opacity-40">Approve All Pending</button>
                            <button disabled={isPending} onClick={() => openBulk("rejected", pendingRequests.map((request) => request.id))} className="rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-black text-red-800 disabled:opacity-40">Reject All Pending</button>
                        </div>
                    </div>
                ) : null}
            </div>
            <div className="overflow-auto">
                <table className="w-full min-w-[1040px] text-left text-sm">
                    <thead className="bg-slate-950 text-xs uppercase text-slate-200">
                        <tr>
                            {isAdmin ? <th className="px-4 py-3">Select</th> : null}
                            <th className="px-4 py-3">Date</th>
                            <th className="px-4 py-3">Employee</th>
                            <th className="px-4 py-3">Item</th>
                            <th className="px-4 py-3">Office</th>
                            <th className="px-4 py-3 text-right">Entered</th>
                            <th className="px-4 py-3 text-right">Allowed</th>
                            <th className="px-4 py-3 text-right">Extra</th>
                            <th className="px-4 py-3">Status</th>
                            {isAdmin ? <th className="px-4 py-3">Admin action</th> : null}
                        </tr>
                    </thead>
                    <tbody>
                        {requests.map((request) => (
                            <tr key={`employee-expense-request:${request.id}`} className="border-b border-slate-100 align-top">
                                {isAdmin ? (
                                    <td className="px-4 py-3">
                                        {request.status === "pending" ? (
                                            <input checked={selectedIds.includes(request.id)} disabled={isPending} type="checkbox" onChange={() => setSelectedIds((current) => current.includes(request.id) ? current.filter((id) => id !== request.id) : [...current, request.id])} className="h-4 w-4 rounded border-slate-300 text-blue-700" />
                                        ) : null}
                                    </td>
                                ) : null}
                                <td className="px-4 py-3 font-bold text-slate-500">{request.expenseDate}</td>
                                <td className="px-4 py-3 font-black text-slate-950">{request.employeeName}</td>
                                <td className="px-4 py-3 font-bold text-slate-700">{request.itemName}</td>
                                <td className="px-4 py-3 font-bold text-slate-500">{request.officeName}</td>
                                <td className="px-4 py-3 text-right font-black text-slate-950">{money(request.amount)}</td>
                                <td className="px-4 py-3 text-right font-black text-emerald-700">{money(request.allowedAmount)}</td>
                                <td className="px-4 py-3 text-right font-black text-amber-700">{money(request.extraAmount)}</td>
                                <td className="px-4 py-3"><StatusBadge status={request.status} /></td>
                                {isAdmin ? (
                                    <td className="px-4 py-3">
                                        {request.status === "pending" ? (
                                            <div className="flex min-w-[280px] flex-col gap-2">
                                                <input value={comments[request.id] ?? ""} onChange={(event) => setComments((current) => ({ ...current, [request.id]: event.target.value }))} placeholder="Admin comment..." className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-900 outline-none" />
                                                <div className="flex gap-2">
                                                    <button disabled={isPending} onClick={() => decide(request.id, "approved")} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">Approve</button>
                                                    <button disabled={isPending} onClick={() => decide(request.id, "rejected")} className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">Reject</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="max-w-xs text-xs font-bold text-slate-500">{request.adminComment ?? request.note ?? "No comment"}</p>
                                        )}
                                    </td>
                                ) : null}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {bulkModal ? (
                <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/60 p-4">
                    <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
                        <h2 className="text-xl font-black text-slate-950">Confirm Bulk {bulkModal.decision === "approved" ? "Approval" : "Rejection"}</h2>
                        <p className="mt-2 text-sm font-semibold text-slate-600">You are about to {bulkModal.decision === "approved" ? "approve" : "reject"} {bulkModal.ids.length} pending requests. Continue?</p>
                        <label className="mt-4 block text-sm font-bold text-slate-700">
                            {bulkModal.decision === "rejected" ? "Rejection reason" : "Admin note optional"}
                            <textarea value={bulkComment} onChange={(event) => setBulkComment(event.target.value)} className="mt-2 min-h-28 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold" />
                        </label>
                        <div className="mt-5 flex flex-wrap justify-end gap-2">
                            <button disabled={isPending} onClick={() => setBulkModal(null)} className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-700 disabled:opacity-40">Cancel</button>
                            <button disabled={isPending} onClick={runBulk} className={`rounded-xl px-4 py-2 text-sm font-black text-white disabled:opacity-40 ${bulkModal.decision === "approved" ? "bg-emerald-700" : "bg-red-700"}`}>
                                {isPending ? "Processing..." : bulkModal.decision === "approved" ? "Approve Requests" : "Reject Requests"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </section>
    );
}

function ExpenseChangeRequestLedger({ isAdmin, onReviewed, requests }: { isAdmin: boolean; onReviewed: () => void; requests: ExpensesPageData["expenseChangeRequests"] }) {
    const [comments, setComments] = useState<Record<string, string>>({});
    const [message, setMessage] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [bulkModal, setBulkModal] = useState<null | { decision: "approved" | "rejected"; ids: string[] }>(null);
    const [bulkComment, setBulkComment] = useState("");
    const [isPending, startTransition] = useTransition();
    if (!requests.length) return null;
    const pendingRequests = requests.filter((request) => request.status === "pending");

    function decide(requestId: string, decision: "approved" | "rejected", comment = comments[requestId] ?? "") {
        setMessage(null);
        startTransition(async () => {
            try {
                await decideExpenseChangeRequest({ requestId, decision, comment });
                setMessage(decision === "approved" ? "Expense correction approved." : "Expense correction rejected.");
                onReviewed();
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Expense correction request could not be reviewed.");
            }
        });
    }

    function openBulk(decision: "approved" | "rejected", ids: string[]) {
        const uniqueIds = Array.from(new Set(ids)).filter(Boolean);
        if (!uniqueIds.length) {
            setMessage("Select at least one pending expense correction request.");
            return;
        }
        setBulkComment("");
        setBulkModal({ decision, ids: uniqueIds });
    }

    function runBulk() {
        if (!bulkModal) return;
        if (bulkModal.decision === "rejected" && !bulkComment.trim()) {
            setMessage("Rejection reason is required.");
            return;
        }
        startTransition(async () => {
            try {
                for (const id of bulkModal.ids) {
                    await decideExpenseChangeRequest({ requestId: id, decision: bulkModal.decision, comment: bulkComment.trim() });
                }
                setMessage(`${bulkModal.ids.length} expense correction request(s) ${bulkModal.decision}.`);
                setSelectedIds([]);
                setBulkModal(null);
                onReviewed();
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Bulk expense correction review failed.");
            }
        });
    }

    return (
        <section className="mx-auto mt-5 max-w-6xl overflow-hidden rounded-[26px] border border-white/70 bg-white shadow-2xl shadow-slate-950/15">
            <div className="border-b border-slate-200 px-4 py-3">
                <p className="text-xs font-black uppercase tracking-wide text-purple-600">Expense correction approval queue</p>
                <h2 className="text-lg font-black text-slate-950">Expense Change Requests</h2>
                {message ? <p className="mt-2 text-sm font-bold text-slate-600">{message}</p> : null}
                {isAdmin && pendingRequests.length ? (
                    <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <label className="inline-flex items-center gap-2 text-xs font-black text-slate-700">
                            <input checked={pendingRequests.every((request) => selectedIds.includes(request.id))} disabled={isPending} type="checkbox" onChange={(event) => setSelectedIds(event.target.checked ? pendingRequests.map((request) => request.id) : [])} className="h-4 w-4 rounded border-slate-300 text-purple-700" />
                            Select All Pending ({pendingRequests.length})
                        </label>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <button disabled={isPending || selectedIds.length === 0} onClick={() => openBulk("approved", selectedIds)} className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-black text-white disabled:opacity-40">Approve Selected</button>
                            <button disabled={isPending || selectedIds.length === 0} onClick={() => openBulk("rejected", selectedIds)} className="rounded-xl bg-red-700 px-3 py-2 text-xs font-black text-white disabled:opacity-40">Reject Selected</button>
                            <button disabled={isPending} onClick={() => openBulk("approved", pendingRequests.map((request) => request.id))} className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-black text-emerald-800 disabled:opacity-40">Approve All Pending</button>
                            <button disabled={isPending} onClick={() => openBulk("rejected", pendingRequests.map((request) => request.id))} className="rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-black text-red-800 disabled:opacity-40">Reject All Pending</button>
                        </div>
                    </div>
                ) : null}
            </div>
            <div className="overflow-auto">
                <table className="w-full min-w-[1120px] text-left text-sm">
                    <thead className="bg-slate-950 text-xs uppercase text-slate-200">
                        <tr>
                            {isAdmin ? <th className="px-4 py-3">Select</th> : null}
                            <th className="px-4 py-3">Submitted</th>
                            <th className="px-4 py-3">Expense</th>
                            <th className="px-4 py-3">Office</th>
                            <th className="px-4 py-3">Change</th>
                            <th className="px-4 py-3">Reason</th>
                            <th className="px-4 py-3">Requested By</th>
                            <th className="px-4 py-3">Status</th>
                            {isAdmin ? <th className="px-4 py-3">Admin action</th> : null}
                        </tr>
                    </thead>
                    <tbody>
                        {requests.map((request) => (
                            <tr key={`expense-change:${request.id}`} className="border-b border-slate-100 align-top">
                                {isAdmin ? (
                                    <td className="px-4 py-3">
                                        {request.status === "pending" ? (
                                            <input checked={selectedIds.includes(request.id)} disabled={isPending} type="checkbox" onChange={() => setSelectedIds((current) => current.includes(request.id) ? current.filter((id) => id !== request.id) : [...current, request.id])} className="h-4 w-4 rounded border-slate-300 text-purple-700" />
                                        ) : null}
                                    </td>
                                ) : null}
                                <td className="px-4 py-3 font-bold text-slate-500">{request.createdAt ? new Date(request.createdAt).toLocaleString() : "--"}</td>
                                <td className="px-4 py-3 font-black text-slate-950">{request.itemName}</td>
                                <td className="px-4 py-3 font-bold text-slate-500">{request.officeName}</td>
                                <td className="px-4 py-3 font-bold text-slate-700">{request.changeType.replaceAll("_", " ")}</td>
                                <td className="max-w-xs px-4 py-3 font-semibold text-slate-600">{request.reason}</td>
                                <td className="px-4 py-3 font-bold text-slate-500">{request.requestedByName}</td>
                                <td className="px-4 py-3"><StatusBadge status={request.status} /></td>
                                {isAdmin ? (
                                    <td className="px-4 py-3">
                                        {request.status === "pending" ? (
                                            <div className="flex min-w-[280px] flex-col gap-2">
                                                <input value={comments[request.id] ?? ""} onChange={(event) => setComments((current) => ({ ...current, [request.id]: event.target.value }))} placeholder="Admin comment..." className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-900 outline-none" />
                                                <div className="flex gap-2">
                                                    <button disabled={isPending} onClick={() => decide(request.id, "approved")} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">Approve</button>
                                                    <button disabled={isPending} onClick={() => decide(request.id, "rejected")} className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">Reject</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="max-w-xs text-xs font-bold text-slate-500">{request.adminComment ?? "No comment"}</p>
                                        )}
                                    </td>
                                ) : null}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {bulkModal ? (
                <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/60 p-4">
                    <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
                        <h2 className="text-xl font-black text-slate-950">Confirm Bulk {bulkModal.decision === "approved" ? "Approval" : "Rejection"}</h2>
                        <p className="mt-2 text-sm font-semibold text-slate-600">You are about to {bulkModal.decision === "approved" ? "approve" : "reject"} {bulkModal.ids.length} pending expense correction request(s). Continue?</p>
                        <label className="mt-4 block text-sm font-bold text-slate-700">
                            {bulkModal.decision === "rejected" ? "Rejection reason" : "Admin note optional"}
                            <textarea value={bulkComment} onChange={(event) => setBulkComment(event.target.value)} className="mt-2 min-h-28 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold" />
                        </label>
                        <div className="mt-5 flex flex-wrap justify-end gap-2">
                            <button disabled={isPending} onClick={() => setBulkModal(null)} className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-700 disabled:opacity-40">Cancel</button>
                            <button disabled={isPending} onClick={runBulk} className={`rounded-xl px-4 py-2 text-sm font-black text-white disabled:opacity-40 ${bulkModal.decision === "approved" ? "bg-emerald-700" : "bg-red-700"}`}>
                                {isPending ? "Processing..." : bulkModal.decision === "approved" ? "Approve Requests" : "Reject Requests"}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </section>
    );
}

function IconAction({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
    return (
        <button type="button" onClick={onClick} className="inline-flex h-8 items-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-black text-slate-700 hover:bg-slate-50">
            {icon}
            {label}
        </button>
    );
}

function ExpenseActionModal({
    categories,
    employeeOptions,
    expense,
    isAdmin,
    mode,
    offices,
    onClose,
    onDone,
}: {
    categories: ExpensesPageData["categories"];
    employeeOptions: ExpensesPageData["employeeOptions"];
    expense: ExpenseItem;
    isAdmin: boolean;
    mode: ExpenseModalMode;
    offices: ExpensesPageData["offices"];
    onClose: () => void;
    onDone: (message: string) => void;
}) {
    const [draft, setDraft] = useState<ExpenseChangePayload>({
        amount: Number(expense.amount ?? 0),
        category: expenseField(expense, "category") as string,
        categoryId: expenseField(expense, "categoryId") as string,
        description: expenseField(expense, "description") as string,
        employeeId: expenseField(expense, "employeeId") as string,
        expenseDate: expenseField(expense, "expenseDate") as string,
        item: expenseField(expense, "item") as string,
        officeId: expenseField(expense, "officeId") as string,
        paymentMethod: expenseField(expense, "paymentMethod") as string,
        receiptUrl: expenseField(expense, "receiptUrl") as string,
        status: expenseField(expense, "status") as string,
        vendor: expenseField(expense, "vendor") as string,
    });
    const [employeeQuery, setEmployeeQuery] = useState("");
    const [reason, setReason] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    const readOnly = mode === "view" || mode === "history";
    const filteredEmployees = useMemo(() => {
        const query = employeeQuery.trim().toLowerCase();
        if (!query) return employeeOptions.slice(0, 80);
        return employeeOptions.filter((employee) => [
            employee.name,
            employee.phone,
            employee.email,
            employee.role,
            employee.officeName,
            employee.assignmentType,
        ].some((value) => String(value ?? "").toLowerCase().includes(query))).slice(0, 80);
    }, [employeeOptions, employeeQuery]);

    function update<Key extends keyof ExpenseChangePayload>(key: Key, value: ExpenseChangePayload[Key]) {
        setDraft((current) => ({ ...current, [key]: value }));
    }

    function save() {
        if (!reason.trim()) {
            setError("Enter a reason for the expense change.");
            return;
        }
        const payload: ExpenseChangePayload = mode === "date"
            ? { expenseDate: draft.expenseDate }
            : mode === "employee"
                ? { employeeId: draft.employeeId }
                : draft;
        const changeType = mode === "date" ? "date_change" : mode === "employee" ? "employee_assignment" : "general_edit";
        setError(null);
        startTransition(async () => {
            try {
                if (isAdmin) {
                    await adminEditExpenseDirect({ changeType, expenseId: expense.id, reason, requested: payload });
                    onDone("Expense updated directly by Admin.");
                } else {
                    await submitExpenseChangeRequest({ changeType, expenseId: expense.id, reason, requested: payload });
                    onDone("Expense change request sent to Admin.");
                }
            } catch (saveError) {
                setError(saveError instanceof Error ? saveError.message : "Expense change could not be saved.");
            }
        });
    }

    return (
        <div className="fixed inset-0 z-[120] overflow-auto bg-slate-950/70 p-4 backdrop-blur-sm">
            <div className="mx-auto my-8 max-w-4xl rounded-[28px] bg-white p-5 shadow-2xl">
                <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <p className="text-xs font-black uppercase tracking-wide text-blue-700">{mode === "history" ? "Expense history" : mode === "view" ? "Expense details" : isAdmin ? "Admin direct expense edit" : "Expense correction request"}</p>
                        <h2 className="mt-1 text-2xl font-black text-slate-950">{expense.item ?? expense.expense_number ?? "Expense"}</h2>
                        <p className="mt-1 text-sm font-bold text-slate-500">{expense.officeName ?? "Office"} · {money(expense.amount)}</p>
                    </div>
                    <button type="button" onClick={onClose} className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-700">Close</button>
                </div>
                {mode === "history" ? (
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-700">
                        <p>Created: {expense.created_at ? new Date(expense.created_at).toLocaleString() : "--"}</p>
                        <p>Updated: {expense.updated_at ? new Date(expense.updated_at).toLocaleString() : "--"}</p>
                        <p>Approved: {expense.approved_at ? new Date(expense.approved_at).toLocaleString() : "Not approved timestamped"}</p>
                        <p>Status: {expense.status ?? expense.approvalState}</p>
                        <p>Recorded by: {expense.submittedByName ?? "System"}</p>
                    </div>
                ) : (
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <ModalField label="Amount">
                            <input disabled={readOnly || mode === "date" || mode === "employee"} type="number" value={draft.amount ?? ""} onChange={(event) => update("amount", Number(event.target.value))} className="modal-input" />
                        </ModalField>
                        <ModalField label="Expense date">
                            <input disabled={readOnly || mode === "employee"} type="date" value={draft.expenseDate ?? ""} onChange={(event) => update("expenseDate", event.target.value)} className="modal-input" />
                        </ModalField>
                        <ModalField label="Expense item">
                            <input disabled={readOnly || mode === "date" || mode === "employee"} value={draft.item ?? ""} onChange={(event) => update("item", event.target.value)} className="modal-input" />
                        </ModalField>
                        <ModalField label="Category">
                            <select disabled={readOnly || mode === "date" || mode === "employee"} value={draft.categoryId ?? ""} onChange={(event) => update("categoryId", event.target.value)} className="modal-input">
                                <option value="">Keep text category</option>
                                {categories.map((category) => <option key={`expense-modal-category:${category.id}`} value={category.id}>{category.name}</option>)}
                            </select>
                        </ModalField>
                        <ModalField label="Payment method">
                            <select disabled={readOnly || mode === "date" || mode === "employee"} value={draft.paymentMethod ?? ""} onChange={(event) => update("paymentMethod", event.target.value)} className="modal-input">
                                <option value="">Not specified</option>
                                <option value="cash">Cash</option>
                                <option value="mobile_money">Mobile Money</option>
                                <option value="bank">Bank</option>
                                <option value="cheque">Cheque</option>
                                <option value="other">Other</option>
                            </select>
                        </ModalField>
                        <ModalField label="Office">
                            <select disabled={readOnly || !isAdmin || mode === "date" || mode === "employee"} value={draft.officeId ?? ""} onChange={(event) => update("officeId", event.target.value)} className="modal-input">
                                <option value="">No office</option>
                                {offices.map((office) => <option key={`expense-modal-office:${office.id}`} value={office.id}>{office.name}</option>)}
                            </select>
                        </ModalField>
                        <div className="md:col-span-2">
                            <ModalField label="Employee / person responsible">
                                <input disabled={readOnly || mode === "date"} value={employeeQuery} onChange={(event) => setEmployeeQuery(event.target.value)} placeholder="Search name, phone, email, role, office..." className="modal-input mb-2" />
                                <select disabled={readOnly || mode === "date"} value={draft.employeeId ?? ""} onChange={(event) => update("employeeId", event.target.value)} className="modal-input">
                                    <option value="">No employee assigned</option>
                                    {filteredEmployees.map((employee) => (
                                        <option key={`expense-modal-employee:${employee.id}`} value={employee.id}>
                                            {employee.name}{employee.phone ? ` · ${employee.phone}` : ""}{employee.officeName ? ` · ${employee.officeName}` : ""}{employee.role ? ` · ${employee.role}` : ""}
                                        </option>
                                    ))}
                                </select>
                            </ModalField>
                        </div>
                        <ModalField label="Receipt / attachment URL">
                            <input disabled={readOnly || mode === "date" || mode === "employee"} value={draft.receiptUrl ?? ""} onChange={(event) => update("receiptUrl", event.target.value)} className="modal-input" />
                        </ModalField>
                        <ModalField label="Status">
                            <select disabled={readOnly || mode === "date" || mode === "employee"} value={draft.status ?? "approved"} onChange={(event) => update("status", event.target.value)} className="modal-input">
                                <option value="approved">Approved / Active</option>
                                <option value="pending">Pending</option>
                                <option value="rejected">Rejected</option>
                                <option value="deleted">Deleted</option>
                            </select>
                        </ModalField>
                        <div className="md:col-span-2">
                            <ModalField label="Notes">
                                <textarea disabled={readOnly || mode === "date" || mode === "employee"} value={draft.description ?? ""} onChange={(event) => update("description", event.target.value)} className="min-h-24 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100" />
                            </ModalField>
                        </div>
                    </div>
                )}
                {!readOnly ? (
                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <label className="block text-sm font-bold text-slate-700">
                            Reason for change
                            <textarea value={reason} onChange={(event) => setReason(event.target.value)} className="mt-2 min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900" />
                        </label>
                        {error ? <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">{error}</p> : null}
                        <div className="mt-4 flex flex-wrap justify-end gap-2">
                            <button disabled={isPending} onClick={onClose} className="rounded-xl bg-white px-4 py-2 text-sm font-black text-slate-700 disabled:opacity-40">Cancel</button>
                            <button disabled={isPending} onClick={save} className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-black text-white disabled:opacity-40">
                                {isPending ? "Saving..." : isAdmin ? "Update Expense Now" : "Send Change Request"}
                            </button>
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function ModalField({ children, label }: { children: ReactNode; label: string }) {
    return (
        <label className="block text-xs font-black uppercase tracking-wide text-slate-500">
            {label}
            <div className="mt-1">{children}</div>
        </label>
    );
}

function StatusBadge({ status }: { status: string }) {
    const normalized = status.toLowerCase();
    const className = normalized === "approved"
        ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
        : normalized === "rejected"
            ? "bg-rose-50 text-rose-700 ring-rose-100"
            : "bg-amber-50 text-amber-700 ring-amber-100";
    return <span className={`rounded-full px-3 py-1 text-xs font-black uppercase ring-1 ${className}`}>{status}</span>;
}

function buildFinanceInsights(input: {
    employeeRequests: ExpensesPageData["employeeExpenseRequests"];
    expenses: ExpenseItem[];
    requests: ExpensesPageData["landlordPaymentRequests"];
    totals: { totalCollections: number; totalExpenses: number; remainingBalance: number; expenseRows: number; paymentRows: number };
}) {
    const pending = input.requests.filter((request) => request.status === "pending");
    const pendingEmployee = input.employeeRequests.filter((request) => request.status === "pending");
    const employeeExtraAmount = pendingEmployee.reduce((total, request) => total + Number(request.extraAmount ?? 0), 0);
    const pendingAdvanceAmount = pending.reduce((total, request) => total + Number(request.advanceAmount ?? 0), 0);
    const rejected = input.requests.filter((request) => request.status === "rejected");
    const highExpenses = input.expenses.filter((expense) => Number(expense.amount ?? 0) >= 500_000);
    const duplicateRisk = new Map<string, number>();
    for (const request of pending) {
        const key = `${request.landlordId}:${request.paymentDate}:${Math.round(request.amount)}`;
        duplicateRisk.set(key, (duplicateRisk.get(key) ?? 0) + 1);
    }
    const duplicateCount = [...duplicateRisk.values()].filter((count) => count > 1).length;
    const insights = [
        pending.length
            ? { id: "pending-landlord-payments", title: `${pending.length} landlord payment approval(s) pending`, message: "Admin should approve or reject these before landlord ledgers are affected.", tone: "amber" as const }
            : { id: "no-pending-landlord-payments", title: "No pending landlord payment approvals", message: "Expense-routed landlord payment queue is clear.", tone: "green" as const },
        highExpenses.length
            ? { id: "high-expense-recorded", title: "High expense recorded", message: `${highExpenses.length} expense row(s) are UGX 500,000 or more in the selected scope.`, tone: "red" as const }
            : { id: "normal-expense-size", title: "Expense size looks normal", message: "No unusually large expense rows in the selected scope.", tone: "blue" as const },
        input.totals.remainingBalance < 0
            ? { id: "cash-pressure", title: "Office balance is negative", message: `Expenses exceed collections by ${money(Math.abs(input.totals.remainingBalance))}.`, tone: "red" as const }
            : { id: "cash-positive", title: "Office cash balance positive", message: `Collections exceed expenses by ${money(input.totals.remainingBalance)}.`, tone: "green" as const },
    ];
    if (duplicateCount) {
        insights.push({ id: "duplicate-landlord-payment-risk", title: "Possible duplicate landlord payment", message: `${duplicateCount} pending landlord payment pattern(s) share landlord, date, and amount.`, tone: "red" as const });
    }
    if (pendingAdvanceAmount > 0) {
        insights.push({ id: "landlord-advance-pending-approval", title: "Landlord advance pending approval", message: `${money(pendingAdvanceAmount)} is waiting for Admin approval as advance portions from landlord payments.`, tone: "amber" as const });
    }
    if (rejected.length) {
        insights.push({ id: "recent-rejections", title: "Rejected landlord payments exist", message: `${rejected.length} rejected request(s) need office follow-up.`, tone: "amber" as const });
    }
    if (pendingEmployee.length) {
        insights.push({ id: "employee-expense-pending-approval", title: "Employee expenses need approval", message: `${pendingEmployee.length} above-allowance request(s) worth ${money(employeeExtraAmount)} are pending Admin review.`, tone: "amber" as const });
    }
    return insights;
}

function ReportBox({ label, value }: { label: string; value: string }) {
    return (
        <div className="border border-slate-300 p-3">
            <p className="text-xs font-black uppercase text-slate-500">{label}</p>
            <p className="mt-1 text-xl font-black">{value}</p>
        </div>
    );
}
