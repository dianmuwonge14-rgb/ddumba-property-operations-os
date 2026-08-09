"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Banknote, Bot, Camera, CheckCircle2, Download, Edit3, Eye, FileText, History, Loader2, Paperclip, Printer, ReceiptText, Search, Trash2, Upload, UserRound, WalletCards, X } from "lucide-react";
import { decideTreasuryCashRequest, submitTreasuryCashRequest } from "@/app/actions/cash-banking";
import { adminEditExpenseDirect, adminSafeDeleteExpense, approveExpense, createEmployeeExpenseFromExpenses, createExpense, createLandlordPaidExpenseRequest, decideEmployeeExpenseRequest, decideExpenseChangeRequest, decideLandlordExpenseEditRequest, decideLandlordPaidExpenseRequest, previewEmployeeExpense, previewLandlordPaymentExpense, rejectExpense, submitExpenseChangeRequest, submitLandlordExpenseEdit } from "@/app/actions/expenses";
import { currentBusinessDate, formatBusinessDate } from "@/lib/business-date";
import type { EmployeeExpensePreview, ExpenseBalanceFilters, ExpenseBalanceReport, ExpenseChangePayload, ExpenseItem, ExpensePeriodMode, ExpensesPageData, LandlordExpenseEditRequestType } from "@/lib/expenses/types";

type Props = {
    canManage: boolean;
    data: ExpensesPageData;
    initialFilters?: ExpenseBalanceFilters;
    isAdmin: boolean;
    isManager?: boolean;
};

function today() {
    return currentBusinessDate();
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

function formatDateTime(value: string | null | undefined) {
    if (!value) return "--";
    return new Intl.DateTimeFormat("en-UG", {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(new Date(value));
}

const EXPENSE_PROOF_ACCEPT = "image/jpeg,image/jpg,image/png,image/heic,image/heif,application/pdf";

type ProofPayload = {
    base64: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
};

function fileSizeLabel(bytes: number) {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function proofPayloadFromFile(file: File): Promise<ProofPayload> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Supporting proof could not be read. Replace it or remove it before submitting."));
        reader.onload = () => {
            const dataUrl = String(reader.result ?? "");
            resolve({
                base64: dataUrl.includes(",") ? dataUrl.split(",").pop() ?? "" : dataUrl,
                fileName: file.name,
                fileSize: file.size,
                mimeType: file.type || "application/octet-stream",
            });
        };
        reader.readAsDataURL(file);
    });
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
type ExpenseEntryMode = "landlord_payment" | "authorised" | "unauthorised" | "banking" | "cash_handover_admin";
type AuthorisedExpenseType = "employee_lunch" | "airtime" | "internet" | "transport_kampala";
type ExpenseModalMode = "view" | "edit" | "date" | "employee" | "history";
type SummaryDrilldownKind = "collections" | "adminCapitalInjection" | "expenses";
type RecordDatePreset = "today" | "yesterday" | "week" | "month" | "custom_date" | "custom_range" | "all_dates";
type RecordTableFilters = {
    datePreset: RecordDatePreset;
    customDate: string;
    startDate: string;
    endDate: string;
    officeId: string;
};
type LandlordEditModalState = {
    requestType: LandlordExpenseEditRequestType;
    landlord: LandlordEntryDetail;
};
type EntrySearchResult = {
    id: string;
    name: string;
    officeId: string | null;
    officeName: string | null;
    location?: string | null;
    phone?: string | null;
    role?: string | null;
    employeeCode?: string | null;
};
type EmployeeLunchDetail = EntrySearchResult & {
    position: string;
    employeeHomeOfficeId?: string | null;
    employeeHomeOfficeName?: string | null;
    submittingOfficeId?: string | null;
    submittingOfficeName?: string | null;
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

function defaultRecordTableFilters(): RecordTableFilters {
    const value = today();
    return {
        customDate: value,
        datePreset: "all_dates",
        endDate: value,
        officeId: "",
        startDate: value,
    };
}

function resolveRecordFilterRange(filters: RecordTableFilters) {
    const todayValue = today();
    if (filters.datePreset === "all_dates") return { label: "All Dates", start: null, end: null };
    if (filters.datePreset === "today") return { label: "Today", start: todayValue, end: todayValue };
    if (filters.datePreset === "yesterday") {
        const value = addDays(todayValue, -1);
        return { label: "Yesterday", start: value, end: value };
    }
    if (filters.datePreset === "week") return { label: "This Week", start: startOfWeek(todayValue), end: todayValue };
    if (filters.datePreset === "month") {
        const month = thisMonth();
        const [year, monthNumber] = month.split("-").map(Number);
        const end = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
        return { label: "This Month", start: `${month}-01`, end };
    }
    if (filters.datePreset === "custom_date") {
        const value = filters.customDate || todayValue;
        return { label: value, start: value, end: value };
    }
    const start = filters.startDate || todayValue;
    const end = filters.endDate || start;
    return start <= end
        ? { label: `${start} to ${end}`, start, end }
        : { label: `${end} to ${start}`, start: end, end: start };
}

function isDateInRange(value: string | null | undefined, range: { start: string | null; end: string | null }) {
    if (!range.start || !range.end) return true;
    const date = String(value ?? "").slice(0, 10);
    if (!date) return false;
    return date >= range.start && date <= range.end;
}

function normalizeStatus(status: string | null | undefined) {
    return String(status ?? "").toLowerCase();
}

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

export default function ExpensesConsole({ canManage, data, initialFilters, isAdmin, isManager = false }: Props) {
    const [filters, setFilters] = useState<ExpenseFilters>({
        mode: initialFilters?.mode ?? "single_date",
        singleDate: initialFilters?.singleDate ?? today(),
        startDate: initialFilters?.startDate ?? initialFilters?.singleDate ?? today(),
        endDate: initialFilters?.endDate ?? initialFilters?.singleDate ?? today(),
        singleMonth: initialFilters?.singleMonth ?? thisMonth(),
        startMonth: initialFilters?.startMonth ?? initialFilters?.singleMonth ?? thisMonth(),
        endMonth: initialFilters?.endMonth ?? initialFilters?.singleMonth ?? thisMonth(),
        officeId: initialFilters?.officeId ?? "",
    });
    const [expenseDate, setExpenseDate] = useState(today());
    const [backdatingReason, setBackdatingReason] = useState("");
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
    const [entryOfficeId, setEntryOfficeId] = useState(data.office?.id ?? data.offices[0]?.id ?? "");
    const [bankingOfficeId, setBankingOfficeId] = useState(data.office?.id ?? data.offices[0]?.id ?? "");
    const [bankingMethod, setBankingMethod] = useState("Bank deposit");
    const [bankingBankAccount, setBankingBankAccount] = useState("Company Bank");
    const [bankingReference, setBankingReference] = useState("");
    const [handoverBy, setHandoverBy] = useState("");
    const [handoverReceivedBy, setHandoverReceivedBy] = useState("");
    const [notes, setNotes] = useState("");
    const [proofFile, setProofFile] = useState<File | null>(null);
    const [proofPreviewUrl, setProofPreviewUrl] = useState<string | null>(null);
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
    const [landlordEditModal, setLandlordEditModal] = useState<LandlordEditModalState | null>(null);
    const [summaryDrilldown, setSummaryDrilldown] = useState<SummaryDrilldownKind | null>(null);
    const [actionMessage, setActionMessage] = useState<string | null>(null);
    const [deleteReason, setDeleteReason] = useState("Admin safe delete");
    const [isPending, startTransition] = useTransition();
    const itemInputRef = useRef<HTMLInputElement | null>(null);
    const amountInputRef = useRef<HTMLInputElement | null>(null);
    const proofCameraInputRef = useRef<HTMLInputElement | null>(null);
    const proofUploadInputRef = useRef<HTMLInputElement | null>(null);
    const bottomRef = useRef<HTMLTableRowElement | null>(null);
    const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const employeeSearchAbortRef = useRef<AbortController | null>(null);
    const landlordSearchAbortRef = useRef<AbortController | null>(null);
    const detailAbortRef = useRef<AbortController | null>(null);

    const expenses = useMemo(() => report?.expenses ?? [], [report]);
    const activeOfficeName = data.office?.office_name ?? data.office?.name ?? "Office";
    const activeOfficeId = data.office?.id ?? "";
    const canSelectEntryOffice = isAdmin || isManager;
    const selectedEntryOfficeId = canSelectEntryOffice ? entryOfficeId : activeOfficeId;
    const selectedEntryOfficeName = data.offices.find((office) => office.id === selectedEntryOfficeId)?.name ?? activeOfficeName;
    const isSelectedEntryEntebbeOperationsOffice = /entebbe operations/i.test(selectedEntryOfficeName);
    const isEntebbeOperationsOffice = isSelectedEntryEntebbeOperationsOffice;
    const totals = useMemo(
        () => report?.totals ?? { totalCollections: 0, adminCapitalInjectionTotal: 0, totalExpenses: 0, remainingBalance: 0, expenseRows: 0, paymentRows: 0 },
        [report?.totals],
    );
    const periodLabel = report ? `${report.filters.startDate} to ${report.filters.endDate}` : filters.singleDate;
    const isLandlordPaidMode = entryMode === "landlord_payment";
    const isAuthorisedMode = entryMode === "authorised";
    const isBankingMode = entryMode === "banking";
    const isCashHandoverMode = entryMode === "cash_handover_admin";
    const isEmployeeExpenseMode = isAuthorisedMode && authorisedType === "employee_lunch";
    const currentKampalaDate = today();
    const adminBackdatedExpense = isAdmin && expenseDate < currentKampalaDate;
    const trimmedBackdatingReason = backdatingReason.trim();
    const activeAuthorisedExpense = AUTHORISED_EXPENSES.find((item) => item.value === authorisedType) ?? AUTHORISED_EXPENSES[0];
    const selectedLandlordOption = selectedLandlordDetail;
    const selectedEmployeeOption = selectedEmployeeDetail;
    const currentMonthExpenses = useMemo(() => {
        const month = expenseDate.slice(0, 7) || thisMonth();
        return data.expenses.filter((expense) => {
            const status = String(expense.status ?? expense.approvalState ?? "").toLowerCase();
            if (["rejected", "cancelled", "canceled", "reversed", "voided", "deleted"].includes(status)) return false;
            if (!canSelectEntryOffice && activeOfficeId && expense.office_id && expense.office_id !== activeOfficeId) return false;
            if (canSelectEntryOffice && selectedEntryOfficeId && expense.office_id && expense.office_id !== selectedEntryOfficeId) return false;
            return String(expense.expense_date ?? "").slice(0, 7) === month;
        });
    }, [activeOfficeId, canSelectEntryOffice, data.expenses, expenseDate, selectedEntryOfficeId]);
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
    const expenseEntryModes = useMemo(() => ([
        ["landlord_payment", "Landlord Payment"],
        ["authorised", "Authorised Expenses"],
        ["unauthorised", "Unauthorised Expenses"],
        ...(!isManager ? [
            ["banking", "Banking"],
            ["cash_handover_admin", "Cash Handover to Admin"],
        ] : []),
    ] as Array<[ExpenseEntryMode, string]>), [isManager]);

    const selectedExpenses = useMemo(() => expenses.filter((expense) => selectedExpenseIds.includes(expense.id)), [expenses, selectedExpenseIds]);
    const selectedBankingSummary = useMemo(() => {
        const officeId = isAdmin ? bankingOfficeId : activeOfficeId;
        return data.banking.summaries.find((summary) => summary.officeId === officeId) ?? data.banking.summaries[0] ?? null;
    }, [activeOfficeId, bankingOfficeId, data.banking.summaries, isAdmin]);
    const amountToBank = Number(amount || 0);
    const expectedOfficeCashAfterBanking = Math.max(0, (selectedBankingSummary?.currentPhysicalOfficeCash ?? 0) - (Number.isFinite(amountToBank) ? amountToBank : 0));
    const expectedMoneyAtBankAfterBanking = data.banking.totals.currentMoneyAtBank + (Number.isFinite(amountToBank) ? amountToBank : 0);
    const expectedAdminCashAfterHandover = data.banking.totals.currentCashHeldByAdmin + (Number.isFinite(amountToBank) ? amountToBank : 0);

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
        return () => {
            if (proofPreviewUrl) URL.revokeObjectURL(proofPreviewUrl);
        };
    }, [proofPreviewUrl]);

    function selectProofFile(file: File | null) {
        if (proofPreviewUrl) URL.revokeObjectURL(proofPreviewUrl);
        if (!file) {
            setProofFile(null);
            setProofPreviewUrl(null);
            return;
        }
        setProofFile(file);
        setProofPreviewUrl(file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
    }

    function clearProofFile() {
        selectProofFile(null);
        if (proofCameraInputRef.current) proofCameraInputRef.current.value = "";
        if (proofUploadInputRef.current) proofUploadInputRef.current.value = "";
    }

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
                    const params = new URLSearchParams({ type: "employee", q: query });
                    if (selectedEntryOfficeId) params.set("officeId", selectedEntryOfficeId);
                    const response = await fetch(`/api/expenses/entry-search?type=employee&${params.toString().replace(/^type=employee&?/, "")}`, {
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
    }, [employeeSearch, isEmployeeExpenseMode, selectedEmployeeDetail?.name, selectedEntryOfficeId]);

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
                    const params = new URLSearchParams({ type: "landlord", q: query });
                    if (selectedEntryOfficeId) params.set("officeId", selectedEntryOfficeId);
                    const response = await fetch(`/api/expenses/entry-search?type=landlord&${params.toString().replace(/^type=landlord&?/, "")}`, {
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
    }, [isLandlordPaidMode, landlordSearch, selectedEntryOfficeId, selectedLandlordDetail?.name]);

    function loadEntryDetail(type: "employee" | "landlord", id: string) {
        detailAbortRef.current?.abort();
        const controller = new AbortController();
        detailAbortRef.current = controller;
        if (type === "employee") setLoadingEmployeeDetail(true);
        if (type === "landlord") setLoadingLandlordDetail(true);
        void (async () => {
            try {
                const params = new URLSearchParams({ id, expenseDate });
                if (selectedEntryOfficeId) params.set("officeId", selectedEntryOfficeId);
                const response = await fetch(`/api/expenses/entry-detail?type=${type}&${params.toString()}`, {
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
                        officeId: selectedLandlordOption?.officeId ?? selectedEntryOfficeId ?? null,
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
    }, [amount, isLandlordPaidMode, landlordId, paymentMonth, selectedEntryOfficeId, selectedLandlordOption?.officeId]);

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
                        officeId: selectedEntryOfficeId || null,
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

    function openLandlordEdit(requestType: LandlordExpenseEditRequestType) {
        if (!selectedLandlordDetail) {
            setMessage("Select a landlord first.");
            return;
        }
        setMessage(null);
        setLandlordEditModal({ landlord: selectedLandlordDetail, requestType });
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
        clearProofFile();
        if (!isLandlordPaidMode) setLandlordId("");
        requestAnimationFrame(() => itemInputRef.current?.focus());
    }

    function saveExpense() {
        const trimmedItem = expenseItem.trim();
        const authorisedLabel = activeAuthorisedExpense.label;
        const value = Number(amount);
        if (isAdmin && expenseDate > currentKampalaDate) {
            setMessage("Future-dated entries are not permitted.");
            return;
        }
        if (adminBackdatedExpense && !trimmedBackdatingReason) {
            setMessage("A backdating reason is required.");
            return;
        }
        if (isCashHandoverMode) {
            if (!selectedBankingSummary?.officeId) {
                setMessage("Select the office handing cash to Admin.");
                return;
            }
            if (!Number.isFinite(value) || value <= 0) {
                setMessage("Enter the handover amount.");
                return;
            }
            if (value > selectedBankingSummary.eligibleAmountAvailableToBank) {
                setMessage(`Amount exceeds eligible office cash. Available: ${money(selectedBankingSummary.eligibleAmountAvailableToBank)}.`);
                return;
            }
            if (!handoverBy.trim()) {
                setMessage("Enter who handed over the cash.");
                return;
            }
            if (!handoverReceivedBy.trim()) {
                setMessage("Enter the Admin receiver.");
                return;
            }
            if (!notes.trim()) {
                setMessage("Enter a reason for the cash handover.");
                return;
            }
            startTransition(async () => {
                try {
                    setMessage(null);
                    const result = await submitTreasuryCashRequest({
                        amount: value,
                        backdatingReason: adminBackdatedExpense ? trimmedBackdatingReason : null,
                        businessDate: expenseDate,
                        handedOverBy: handoverBy,
                        notes,
                        officeId: selectedBankingSummary.officeId,
                        reason: notes,
                        receivedByAdminName: handoverReceivedBy,
                        reference: bankingReference.trim() || null,
                        requestType: "cash_handover_admin",
                    });
                    setMessage((result as { pending?: boolean }).pending
                        ? "Cash Handover to Admin submitted for Admin approval. No cash balance or expense total changed yet."
                        : "Cash Handover to Admin approved and posted. Office cash, Admin cash and expense totals are updating.");
                    setAmount("");
                    setBankingReference("");
                    setHandoverBy("");
                    setHandoverReceivedBy("");
                    setNotes("");
                    setRefreshToken((token) => token + 1);
                } catch (error) {
                    setMessage(error instanceof Error ? error.message : "Cash handover could not be submitted.");
                }
            });
            return;
        }
        if (isBankingMode) {
            if (!selectedBankingSummary?.officeId) {
                setMessage("Select the office whose physical cash is being banked.");
                return;
            }
            if (!Number.isFinite(value) || value <= 0) {
                setMessage("Enter the amount to bank.");
                return;
            }
            if (value > selectedBankingSummary.eligibleAmountAvailableToBank) {
                setMessage(`Amount exceeds eligible office cash. Available: ${money(selectedBankingSummary.eligibleAmountAvailableToBank)}.`);
                return;
            }
            if (!bankingBankAccount.trim()) {
                setMessage("Bank account is required.");
                return;
            }
            startTransition(async () => {
                try {
                    setMessage(null);
                    const idempotentReference = bankingReference.trim() || `EXP-BANK-${selectedBankingSummary.officeId.slice(0, 8)}-${expenseDate}-${value}`;
                    const result = await submitTreasuryCashRequest({
                        amount: value,
                        backdatingReason: adminBackdatedExpense ? trimmedBackdatingReason : null,
                        bankAccountName: bankingBankAccount.trim(),
                        businessDate: expenseDate,
                        method: bankingMethod || "Bank deposit",
                        notes: notes || "Banking recorded from Expenses page.",
                        officeId: selectedBankingSummary.officeId,
                        reason: notes || "Banking recorded from Expenses page.",
                        reference: idempotentReference,
                        requestType: "banking",
                    });
                    setMessage((result as { pending?: boolean }).pending
                        ? "Banking request submitted for Admin approval. Collections and Company Cash Position are unchanged."
                        : "Banking completed. Office cash decreased and Money at Bank increased; Company Cash Position is unchanged.");
                    setAmount("");
                    setBankingReference("");
                    setNotes("");
                    setRefreshToken((token) => token + 1);
                } catch (error) {
                    setMessage(error instanceof Error ? error.message : "Banking could not be completed.");
                }
            });
            return;
        }
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
                        backdatingReason: adminBackdatedExpense ? trimmedBackdatingReason : null,
                        expenseDate,
                        landlordId,
                        officeId: selectedLandlordOption?.officeId ?? selectedEntryOfficeId ?? null,
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
                        backdatingReason: adminBackdatedExpense ? trimmedBackdatingReason : null,
                        employeeId,
                        expenseDate,
                        expenseItem: "Lunch",
                        note: notes || trimmedItem || undefined,
                        officeId: selectedEntryOfficeId || null,
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
                    const supportingProof = entryMode === "unauthorised" && proofFile ? await proofPayloadFromFile(proofFile) : null;
                    const saved = await createExpense({
                        amount: value,
                        backdatingReason: adminBackdatedExpense ? trimmedBackdatingReason : null,
                        category: categoryName,
                        description: notes || undefined,
                        expenseDate,
                        item: itemName,
                        officeId: selectedEntryOfficeId || null,
                        supportingProof,
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
                                <span className="text-xs font-black uppercase tracking-wide text-slate-300">{isAdmin ? "Entry Date" : "Current Date"}</span>
                                <input
                                    type="date"
                                    value={expenseDate}
                                    max={currentKampalaDate}
                                    onChange={(event) => {
                                        if (!isAdmin) return;
                                        setExpenseDate(event.target.value);
                                    }}
                                    readOnly={!isAdmin}
                                    aria-label={`${isAdmin ? "Entry Date" : "Current Date"}, ${formatBusinessDate(expenseDate)}`}
                                    className={`mt-1 h-12 w-full rounded-2xl border border-white/10 bg-white/90 px-4 text-sm font-black text-slate-700 outline-none ${isAdmin ? "cursor-pointer focus:ring-4 focus:ring-cyan-300/30" : "cursor-not-allowed"}`}
                                />
                                {isAdmin ? <span className="mt-2 inline-flex rounded-full border border-cyan-300/30 bg-cyan-400/10 px-2 py-1 text-[10px] font-black uppercase text-cyan-100">Admin backdate authority</span> : null}
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
                        {adminBackdatedExpense ? (
                            <label className="mt-4 block">
                                <span className="text-xs font-black uppercase tracking-wide text-amber-100">Backdating Reason</span>
                                <textarea
                                    value={backdatingReason}
                                    onChange={(event) => setBackdatingReason(event.target.value)}
                                    placeholder="Example: Previous-day transaction omitted"
                                    className="mt-1 min-h-20 w-full rounded-2xl border border-amber-200/40 bg-white px-4 py-3 text-sm font-bold text-slate-950 outline-none focus:ring-4 focus:ring-amber-300/30"
                                />
                            </label>
                        ) : null}
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

                <section className="mx-auto mt-5 max-w-6xl grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                    <BalanceCard
                        interactive
                        label="Total Collections"
                        value={money(totals.totalCollections)}
                        hint={`${totals.paymentRows} payment rows · Open records`}
                        tone="green"
                        icon={<Banknote size={18} />}
                        onClick={() => setSummaryDrilldown("collections")}
                    />
                    <BalanceCard
                        interactive
                        label="Admin Capital Injection"
                        value={money(totals.adminCapitalInjectionTotal)}
                        hint="Admin-funded cash received in selected period"
                        tone="blue"
                        icon={<WalletCards size={18} />}
                        onClick={() => setSummaryDrilldown("adminCapitalInjection")}
                    />
                    <BalanceCard
                        interactive
                        label="Total Expenses"
                        value={money(totals.totalExpenses)}
                        hint={`${totals.expenseRows} approved expense rows · Open records`}
                        tone="red"
                        icon={<ReceiptText size={18} />}
                        onClick={() => setSummaryDrilldown("expenses")}
                    />
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
                            <div className={`grid gap-2 sm:grid-cols-2 ${isManager ? "lg:w-[560px] lg:grid-cols-3" : "lg:w-[860px] lg:grid-cols-5"}`}>
                                {expenseEntryModes.map(([mode, label]) => (
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
                        {canSelectEntryOffice ? (
                            <div className="mb-5 rounded-3xl border border-blue-100 bg-blue-50 p-4">
                                <label className="block">
                                    <span className="text-xs font-black uppercase tracking-wide text-blue-800">{isManager ? "Manager Expense Entry Office" : "Expense Entry Office"}</span>
                                    <select
                                        value={entryOfficeId}
                                        onChange={(event) => {
                                            setEntryOfficeId(event.target.value);
                                            setMessage(null);
                                            setSelectedLandlordDetail(null);
                                            setLandlordId("");
                                            setLandlordSearch("");
                                            setEmployeeId("");
                                            setEmployeeSearch("");
                                            setSelectedEmployeeDetail(null);
                                        }}
                                        className="mt-2 h-14 w-full rounded-2xl border border-blue-200 bg-white px-4 text-base font-black text-slate-950 outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                                    >
                                        {data.offices.map((office) => (
                                            <option key={office.id} value={office.id}>{office.name}</option>
                                        ))}
                                    </select>
                                    <span className="mt-2 block text-xs font-bold text-blue-900">
                                        {isManager ? "Manager-entered expenses are saved to this office and remain Pending Admin Approval." : "Select the office that owns this expense entry."}
                                    </span>
                                </label>
                            </div>
                        ) : null}
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
                                    <div className="space-y-4">
                                        <PremiumCardSection title="Landlord Summary">
                                            <PremiumEntryCard label="Landlord Name" value={selectedLandlordOption.name} />
                                            <PremiumEntryCard label="Office" value={selectedLandlordOption.officeName ?? selectedEntryOfficeName} />
                                            <PremiumEntryCard label="Location" value={selectedLandlordOption.location ?? "--"} />
                                            <PremiumEntryCard label="Payment Status" value={selectedLandlordDetail?.paymentStatus ?? (landlordPreview ? (landlordPreview.advanceAmount > 0 ? "Review advance" : "Within payable") : "Enter amount")} />
                                        </PremiumCardSection>
                                        <PremiumCardSection title="Financial Position" featured>
                                            <PremiumEntryCard featured label="Outstanding Balance" value={loadingLandlordDetail ? "Loading..." : money(selectedLandlordDetail?.outstandingBalance ?? landlordPreview?.outstandingAmount ?? 0)} actionLabel="Edit" onAction={() => openLandlordEdit("landlord_outstanding_balance_edit")} />
                                            <PremiumEntryCard featured label="Net Payable" value={loadingLandlordDetail ? "Loading..." : money(selectedLandlordDetail?.netPayable ?? landlordPreview?.currentNetPayable ?? 0)} />
                                            <PremiumEntryCard featured label="Last Payment Amount" value={loadingLandlordDetail ? "Loading..." : money(selectedLandlordDetail?.lastPaymentAmount ?? 0)} />
                                            <PremiumEntryCard featured label="Full Rent Roll" value={money(selectedLandlordDetail?.fullRentRoll ?? 0)} />
                                            <PremiumEntryCard label="Commission Rate" value={selectedLandlordOption.commissionRate == null ? "--" : `${selectedLandlordOption.commissionRate}%`} />
                                            <PremiumEntryCard label="Commission Type" value={selectedLandlordOption.commissionType ?? "--"} />
                                            <PremiumEntryCard label="Advance Balance" value={money(selectedLandlordDetail?.advanceBalance ?? 0)} />
                                        </PremiumCardSection>
                                        <PremiumCardSection title="Payment Schedule">
                                            <PremiumEntryCard label="Last Payment Date" value={selectedLandlordDetail?.lastPaymentDate ?? "--"} />
                                            <PremiumEntryCard label="Landlord Payment Date" value={selectedLandlordDetail?.landlordPaymentDate?.slice(0, 10) ?? expenseDate} actionLabel="Edit" onAction={() => openLandlordEdit("landlord_payment_date_edit")} />
                                            <PremiumEntryCard label="Landlord Billing Date" value={selectedLandlordDetail?.landlordBillingDate?.slice(0, 10) ?? `${expenseDate.slice(0, 7)}-01`} actionLabel="Edit" onAction={() => openLandlordEdit("landlord_billing_date_edit")} />
                                        </PremiumCardSection>
                                        <PremiumCardSection title="Portfolio">
                                            <PremiumEntryCard label="Total Rooms" value={String(selectedLandlordDetail?.totalRooms ?? 0)} />
                                            <PremiumEntryCard label="Occupied Rooms" value={String(selectedLandlordDetail?.occupiedRooms ?? 0)} />
                                            <PremiumEntryCard label="Vacant Rooms" value={String(selectedLandlordDetail?.vacantRooms ?? 0)} />
                                            <PremiumEntryCard label="Vacated With Debt" value={String(selectedLandlordDetail?.vacatedWithDebt ?? 0)} />
                                            <PremiumEntryCard label="Portfolio Value" value={money(selectedLandlordDetail?.portfolioValue ?? 0)} />
                                        </PremiumCardSection>
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
                                                    }} placeholder="Search All Rounder name, phone, code, role or office..." className="h-full min-w-0 flex-1 bg-transparent text-lg font-black text-slate-950 outline-none" />
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
                                                                <p className="text-xs font-bold text-slate-500">{employee.officeName ?? "Office"}{employee.role ? ` · ${employee.role}` : ""}{employee.employeeCode ? ` · ${employee.employeeCode}` : ""}{employee.phone ? ` · ${employee.phone}` : ""}</p>
                                                            </button>
                                                        ))}
                                                        {!loadingEmployeeSearch && !employeeSearchResults.length ? <div className="px-3 py-2 text-sm font-bold text-slate-500">No real employee matches found.</div> : null}
                                                    </div>
                                                ) : null}
                                            </label>
                                            <label className="block">
                                                <span className="text-xs font-black uppercase tracking-wide text-slate-500">Current Date</span>
                                                <input type="date" value={expenseDate} readOnly aria-label={`Current Date, ${formatBusinessDate(expenseDate)}`} className="mt-1 h-16 w-full cursor-not-allowed rounded-2xl border border-slate-200 bg-slate-100 px-4 text-lg font-black text-slate-700 outline-none" />
                                            </label>
                                        </div>
                                        {selectedEmployeeOption ? (
                                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                                <PremiumEntryCard label="Employee Name" value={selectedEmployeeOption.name} />
                                                <PremiumEntryCard label="Employee Home Office" value={selectedEmployeeDetail?.employeeHomeOfficeName ?? selectedEmployeeOption.officeName ?? selectedEntryOfficeName} />
                                                <PremiumEntryCard label="Submitting Office" value={selectedEmployeeDetail?.submittingOfficeName ?? selectedEntryOfficeName} />
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
                                    <span className="text-xs font-black uppercase tracking-wide text-slate-500">Current Date</span>
                                    <input type="date" value={expenseDate} readOnly aria-label={`Current Date, ${formatBusinessDate(expenseDate)}`} className="mt-1 h-16 w-full cursor-not-allowed rounded-2xl border border-slate-200 bg-slate-100 px-4 text-lg font-black text-slate-700 outline-none" />
                                </label>
                            </div>
                        ) : null}

                        {isBankingMode ? (
                            <div className="space-y-4">
                                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_190px_220px]">
                                    <label className="block">
                                        <span className="text-xs font-black uppercase tracking-wide text-slate-500">Office</span>
                                        {isAdmin ? (
                                            <select value={bankingOfficeId} onChange={(event) => setBankingOfficeId(event.target.value)} className="mt-1 h-16 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-lg font-black text-slate-950 outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100">
                                                {data.banking.summaries.map((summary) => (
                                                    <option key={`banking-office:${summary.officeId}`} value={summary.officeId}>{summary.officeName}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <div className="mt-1 flex h-16 items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 text-lg font-black text-slate-950">{selectedBankingSummary?.officeName ?? activeOfficeName}</div>
                                        )}
                                    </label>
                                    <label className="block">
                                        <span className="text-xs font-black uppercase tracking-wide text-slate-500">Current Date</span>
                                        <input type="date" value={expenseDate} readOnly aria-label={`Current Date, ${formatBusinessDate(expenseDate)}`} className="mt-1 h-16 w-full cursor-not-allowed rounded-2xl border border-slate-200 bg-slate-100 px-4 text-lg font-black text-slate-700 outline-none" />
                                    </label>
                                    <label className="block">
                                        <span className="text-xs font-black uppercase tracking-wide text-slate-500">Payment / Transfer Method</span>
                                        <select value={bankingMethod} onChange={(event) => setBankingMethod(event.target.value)} className="mt-1 h-16 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-lg font-black text-slate-950 outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100">
                                            <option value="Bank deposit">Bank deposit</option>
                                            <option value="Mobile money transfer">Mobile money transfer</option>
                                            <option value="Cash deposit">Cash deposit</option>
                                            <option value="Other">Other</option>
                                        </select>
                                    </label>
                                </div>
                                <div className="grid gap-4 md:grid-cols-2">
                                    <label className="block">
                                        <span className="text-xs font-black uppercase tracking-wide text-slate-500">Bank Account</span>
                                        <input value={bankingBankAccount} onChange={(event) => setBankingBankAccount(event.target.value)} placeholder="Configured bank account" className="mt-1 h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base font-black text-slate-950 outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100" />
                                    </label>
                                    <label className="block">
                                        <span className="text-xs font-black uppercase tracking-wide text-slate-500">Deposit Slip / Reference</span>
                                        <input value={bankingReference} onChange={(event) => setBankingReference(event.target.value)} placeholder="Optional reference" className="mt-1 h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base font-black text-slate-950 outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100" />
                                    </label>
                                </div>
                                <PremiumCardSection title="Banking Live Summary" featured>
                                    <PremiumEntryCard featured label="Office Name" value={selectedBankingSummary?.officeName ?? activeOfficeName} />
                                    <PremiumEntryCard featured label="Current Physical Office Cash" value={money(selectedBankingSummary?.currentPhysicalOfficeCash ?? 0)} />
                                    <PremiumEntryCard label="Collections Today" value={money(selectedBankingSummary?.collectionsToday ?? 0)} />
                                    <PremiumEntryCard label="Approved Expenses Today" value={money(selectedBankingSummary?.approvedExpensesToday ?? 0)} />
                                    <PremiumEntryCard label="Already Banked Today" value={money(selectedBankingSummary?.alreadyBankedToday ?? 0)} />
                                    <PremiumEntryCard label="Cash Handed to Admin Today" value={money(selectedBankingSummary?.cashHandedToAdminToday ?? 0)} />
                                    <PremiumEntryCard featured label="Eligible Amount Available to Bank" value={money(selectedBankingSummary?.eligibleAmountAvailableToBank ?? 0)} />
                                    <PremiumEntryCard label="Amount Being Banked" value={money(Number.isFinite(amountToBank) ? amountToBank : 0)} />
                                    <PremiumEntryCard label="Expected Office Cash After Banking" value={money(expectedOfficeCashAfterBanking)} />
                                    <PremiumEntryCard label="Current Money at Bank" value={money(data.banking.totals.currentMoneyAtBank)} />
                                    <PremiumEntryCard featured label="Expected Money at Bank After Banking" value={money(expectedMoneyAtBankAfterBanking)} />
                                </PremiumCardSection>
                                <p className="rounded-2xl border border-cyan-100 bg-cyan-50 px-4 py-3 text-sm font-bold text-cyan-900">
                                    Banking transfers physical office cash to Money at Bank. It does not change collections, approved expenses, landlord payments or Company Cash Position.
                                </p>
                            </div>
                        ) : null}

                        {isCashHandoverMode ? (
                            <div className="space-y-4">
                                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_190px_220px]">
                                    <label className="block">
                                        <span className="text-xs font-black uppercase tracking-wide text-slate-500">Office</span>
                                        {isAdmin ? (
                                            <select value={bankingOfficeId} onChange={(event) => setBankingOfficeId(event.target.value)} className="mt-1 h-16 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-lg font-black text-slate-950 outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100">
                                                {data.banking.summaries.map((summary) => (
                                                    <option key={`handover-office:${summary.officeId}`} value={summary.officeId}>{summary.officeName}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <div className="mt-1 flex h-16 items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 text-lg font-black text-slate-950">{selectedBankingSummary?.officeName ?? activeOfficeName}</div>
                                        )}
                                    </label>
                                    <label className="block">
                                        <span className="text-xs font-black uppercase tracking-wide text-slate-500">Current Date</span>
                                        <input type="date" value={expenseDate} readOnly aria-label={`Current Date, ${formatBusinessDate(expenseDate)}`} className="mt-1 h-16 w-full cursor-not-allowed rounded-2xl border border-slate-200 bg-slate-100 px-4 text-lg font-black text-slate-700 outline-none" />
                                    </label>
                                    <label className="block">
                                        <span className="text-xs font-black uppercase tracking-wide text-slate-500">Acknowledgement / Reference</span>
                                        <input value={bankingReference} onChange={(event) => setBankingReference(event.target.value)} placeholder="Optional reference" className="mt-1 h-16 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-lg font-black text-slate-950 outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100" />
                                    </label>
                                </div>
                                <div className="grid gap-4 md:grid-cols-2">
                                    <label className="block">
                                        <span className="text-xs font-black uppercase tracking-wide text-slate-500">Handed Over By</span>
                                        <input value={handoverBy} onChange={(event) => setHandoverBy(event.target.value)} placeholder="Office staff name" className="mt-1 h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base font-black text-slate-950 outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100" />
                                    </label>
                                    <label className="block">
                                        <span className="text-xs font-black uppercase tracking-wide text-slate-500">Received By Admin</span>
                                        <input value={handoverReceivedBy} onChange={(event) => setHandoverReceivedBy(event.target.value)} placeholder="Admin receiver" className="mt-1 h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-base font-black text-slate-950 outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100" />
                                    </label>
                                </div>
                                <PremiumCardSection title="Cash Handover Live Summary" featured>
                                    <PremiumEntryCard featured label="Current Physical Office Cash" value={money(selectedBankingSummary?.currentPhysicalOfficeCash ?? 0)} />
                                    <PremiumEntryCard label="Pending Banking" value={money(selectedBankingSummary?.pendingBanking ?? 0)} />
                                    <PremiumEntryCard label="Pending Cash Handover" value={money(selectedBankingSummary?.pendingCashHandover ?? 0)} />
                                    <PremiumEntryCard label="Approved Expenses Today" value={money(selectedBankingSummary?.approvedExpensesToday ?? 0)} />
                                    <PremiumEntryCard featured label="Amount Available for Handover" value={money(selectedBankingSummary?.eligibleAmountAvailableToBank ?? 0)} />
                                    <PremiumEntryCard label="Handover Amount" value={money(Number.isFinite(amountToBank) ? amountToBank : 0)} />
                                    <PremiumEntryCard label="Expected Office Cash After Approval" value={money(expectedOfficeCashAfterBanking)} />
                                    <PremiumEntryCard label="Current Cash Held by Admin" value={money(data.banking.totals.currentCashHeldByAdmin)} />
                                    <PremiumEntryCard featured label="Expected Admin Cash After Approval" value={money(expectedAdminCashAfterHandover)} />
                                </PremiumCardSection>
                                <p className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">
                                    Cash Handover to Admin is an approved cash outflow: after Admin approval it reduces office cash, increases Admin-held cash and counts in approved expenses.
                                </p>
                            </div>
                        ) : null}

                        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
                            <label className="block">
                                <span className="text-xs font-black uppercase tracking-wide text-slate-500">{entryMode === "unauthorised" || isCashHandoverMode ? "Reason / Supporting Notes" : isBankingMode ? "Banking Notes" : "Supporting Notes"}</span>
                                <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={entryMode === "unauthorised" ? "Reason and notes required..." : isCashHandoverMode ? "Reason for handing cash to Admin..." : isBankingMode ? "Controlled banking notes..." : "Optional notes..."} className="mt-1 h-16 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-lg font-black text-slate-950 outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100" />
                                {entryMode === "unauthorised" ? <span className="mt-1 block text-xs font-bold text-slate-500">Optional - attach a receipt, slip, invoice or other proof for Admin review.</span> : null}
                            </label>
                            <label className="block">
                                <span className="text-xs font-black uppercase tracking-wide text-slate-500">{isCashHandoverMode ? "Handover Amount" : isBankingMode ? "Amount to Bank" : "Amount"}</span>
                                <input ref={amountInputRef} value={amount} onChange={(event) => setAmount(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") saveExpense(); }} type="number" min="0" placeholder="UGX" className="mt-1 h-16 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-2xl font-black text-slate-950 outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100" />
                            </label>
                        </div>

                        {entryMode === "unauthorised" ? (
                            <section className="mt-4 rounded-3xl border border-dashed border-blue-200 bg-blue-50/70 p-4">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                    <div className="min-w-0">
                                        <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-blue-700"><Paperclip size={15} />Attach Proof - Optional</p>
                                        <p className="mt-1 text-sm font-bold text-slate-600">Optional - attach a receipt, slip, invoice or other proof for Admin review.</p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <button type="button" onClick={() => proofCameraInputRef.current?.click()} className="inline-flex h-10 items-center gap-2 rounded-2xl bg-slate-950 px-4 text-xs font-black text-white">
                                            <Camera size={15} />Take Photo
                                        </button>
                                        <button type="button" onClick={() => proofUploadInputRef.current?.click()} className="inline-flex h-10 items-center gap-2 rounded-2xl border border-blue-200 bg-white px-4 text-xs font-black text-blue-800">
                                            <Upload size={15} />Upload Photo / Slip
                                        </button>
                                    </div>
                                </div>
                                <input
                                    ref={proofCameraInputRef}
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    className="hidden"
                                    onChange={(event) => selectProofFile(event.target.files?.[0] ?? null)}
                                />
                                <input
                                    ref={proofUploadInputRef}
                                    type="file"
                                    accept={EXPENSE_PROOF_ACCEPT}
                                    className="hidden"
                                    onChange={(event) => selectProofFile(event.target.files?.[0] ?? null)}
                                />
                                {proofFile ? (
                                    <div className="mt-4 grid gap-3 rounded-2xl border border-blue-100 bg-white p-3 sm:grid-cols-[96px_minmax(0,1fr)_auto] sm:items-center">
                                        {proofPreviewUrl ? (
                                            <img src={proofPreviewUrl} alt="Selected expense proof preview" className="h-24 w-24 rounded-2xl border border-slate-200 object-cover" />
                                        ) : (
                                            <div className="flex h-24 w-24 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-500">
                                                <FileText size={30} />
                                            </div>
                                        )}
                                        <div className="min-w-0">
                                            <p className="break-words text-sm font-black text-slate-950">{proofFile.name}</p>
                                            <p className="mt-1 text-xs font-bold text-slate-500">{proofFile.type || "Unknown type"} · {fileSizeLabel(proofFile.size)}</p>
                                            <p className="mt-1 text-xs font-semibold text-slate-500">This proof will be stored privately for Admin review.</p>
                                        </div>
                                        <div className="flex flex-wrap gap-2 sm:justify-end">
                                            <button type="button" onClick={() => proofUploadInputRef.current?.click()} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">Replace</button>
                                            <button type="button" onClick={clearProofFile} className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-black text-rose-700">Remove</button>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="mt-3 rounded-2xl bg-white px-3 py-2 text-xs font-bold text-slate-500">No attachment selected. You can still submit this unauthorised expense.</p>
                                )}
                            </section>
                        ) : null}

                        {message ? <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">{message}</p> : null}
                        <div className="mt-5 flex flex-wrap items-center gap-3">
                            <button type="button" onClick={saveExpense} disabled={!canManage || isPending} className="inline-flex h-13 items-center gap-2 rounded-2xl bg-emerald-600 px-7 text-base font-black text-white shadow-lg shadow-emerald-100 transition hover:-translate-y-0.5 disabled:opacity-40">
                                {isPending ? <Loader2 className="animate-spin" size={18} /> : <ReceiptText size={18} />}
                                {isPending ? "Submitting..." : isCashHandoverMode ? "Submit Cash Handover to Admin" : isBankingMode ? "Bank Office Cash" : isLandlordPaidMode ? "Submit Landlord Payment" : isEmployeeExpenseMode ? "Record / Request Lunch" : entryMode === "unauthorised" ? "Submit for Admin Approval" : "Record / Request Authorised Expense"}
                            </button>
                            <button type="button" onClick={() => setShowPrintPreview(true)} className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700"><Printer size={16} />Print A4 Report</button>
                            <button type="button" onClick={() => setShowPrintPreview(true)} className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700"><Download size={16} />Export PDF</button>
                            <button type="button" onClick={exportCsv} className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700"><Download size={16} />Export CSV</button>
                            <span className="text-xs font-bold text-slate-500">{isCashHandoverMode ? "Office handovers wait for Admin approval before cash or expenses change." : isBankingMode ? "Banking is a cash-location transfer, not an expense." : isAdmin ? "Admin overrides are audited immediately." : "Office entries that exceed limits or are unauthorised require Admin approval."}</span>
                        </div>
                    </div>
                </section>

                <LandlordPaymentRequestLedger activeOfficeName={activeOfficeName} isAdmin={isAdmin} offices={data.offices} requests={data.landlordPaymentRequests} />
                <GenericExpenseApprovalQueue
                    isAdmin={isAdmin}
                    requests={data.expenses.filter((expense) => (expense.status ?? expense.approvalState) === "pending")}
                    onReviewed={() => setRefreshToken((token) => token + 1)}
                />
                <EmployeeExpenseRequestLedger isAdmin={isAdmin} requests={data.employeeExpenseRequests} />
                <LandlordEditRequestLedger isAdmin={isAdmin} requests={data.landlordExpenseEditRequests} onReviewed={() => setRefreshToken((token) => token + 1)} />
                <TreasuryCashRequestLedger activeOfficeName={activeOfficeName} isAdmin={isAdmin} requests={data.treasuryCashRequests} onReviewed={() => setRefreshToken((token) => token + 1)} />
                <BankingRecordsLedger activeOfficeName={activeOfficeName} banking={data.banking} isAdmin={isAdmin} offices={data.offices} />
                <ExpenseChangeRequestLedger activeOfficeName={activeOfficeName} isAdmin={isAdmin} offices={data.offices} requests={data.expenseChangeRequests} onReviewed={() => setRefreshToken((token) => token + 1)} />

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
            {summaryDrilldown ? (
                <SummaryDrilldownModal
                    kind={summaryDrilldown}
                    onClose={() => setSummaryDrilldown(null)}
                    report={report}
                />
            ) : null}
            {landlordEditModal ? (
                <LandlordEditModal
                    expenseDate={expenseDate}
                    isAdmin={isAdmin}
                    modal={landlordEditModal}
                    onClose={() => setLandlordEditModal(null)}
                    onDone={(text) => {
                        setMessage(text);
                        setLandlordEditModal(null);
                        setRefreshToken((token) => token + 1);
                        if (landlordId) loadEntryDetail("landlord", landlordId);
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

function BalanceCard({ hint, icon, interactive = false, label, onClick, tone, value }: { hint: string; icon: ReactNode; interactive?: boolean; label: string; onClick?: () => void; tone: "blue" | "green" | "red" | "slate"; value: string }) {
    const toneClass = {
        blue: "border-blue-200 bg-blue-50 text-blue-800",
        green: "border-emerald-200 bg-emerald-50 text-emerald-800",
        red: "border-rose-200 bg-rose-50 text-rose-800",
        slate: "border-slate-200 bg-white text-slate-800",
    }[tone];
    const className = `rounded-[24px] border p-4 text-left shadow-xl shadow-slate-950/10 transition ${toneClass} ${interactive ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-2xl focus:outline-none focus:ring-4 focus:ring-cyan-200 active:scale-[0.99]" : ""}`;
    const content = (
        <>
            <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-black uppercase tracking-wide opacity-75">{label}</p>
                {icon}
            </div>
            <p className="mt-3 break-words text-2xl font-black leading-tight">{value}</p>
            <p className="mt-1 text-xs font-bold opacity-70">{hint}</p>
        </>
    );
    if (interactive && onClick) {
        return (
            <button type="button" onClick={onClick} className={className} aria-label={`Open ${label} records`}>
                {content}
            </button>
        );
    }
    return (
        <div className={className}>
            {content}
        </div>
    );
}

function SummaryDrilldownModal({ kind, onClose, report }: { kind: SummaryDrilldownKind; onClose: () => void; report: ExpenseBalanceReport | null }) {
    useEffect(() => {
        const handleKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [onClose]);
    const isCollections = kind === "collections" || kind === "adminCapitalInjection";
    const expenses = useMemo(() => (report?.expenses ?? []).filter((expense) => normalizeStatus(expense.status ?? expense.approvalState) === "approved"), [report?.expenses]);
    const collections = useMemo(() => {
        const rows = report?.collections ?? [];
        return kind === "adminCapitalInjection" ? rows.filter((collection) => collection.collectionSourceKey === "admin_capital_injection") : rows;
    }, [kind, report?.collections]);
    const total = isCollections
        ? collections.reduce((sum, collection) => sum + Number(collection.amountValue ?? 0), 0)
        : expenses.reduce((sum, expense) => sum + Number(expense.amount ?? 0), 0);
    const count = isCollections ? collections.length : expenses.length;
    const title = kind === "adminCapitalInjection" ? "Admin Capital Injection Records" : isCollections ? "Total Collections Records" : "Total Expenses Records";
    const officeLabel = report?.officeName ?? "Selected scope";
    const period = report ? `${report.filters.startDate} to ${report.filters.endDate}` : "Current filter";
    const collectionUrl = report
        ? `/office/collections?startDate=${encodeURIComponent(report.filters.startDate)}&endDate=${encodeURIComponent(report.filters.endDate)}${report.filters.officeId ? `&officeId=${encodeURIComponent(report.filters.officeId)}` : ""}${kind === "adminCapitalInjection" ? "&collectionSource=admin_capital_injection" : ""}`
        : "/office/collections";

    return (
        <div className="fixed inset-0 z-[130] overflow-auto bg-slate-950/70 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
            <div className="relative mx-auto my-8 max-w-6xl overflow-hidden rounded-[30px] bg-white shadow-2xl shadow-slate-950/30">
                <button type="button" onClick={onClose} className="absolute right-4 top-4 z-10 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white shadow-lg transition hover:bg-white hover:text-slate-950 focus:outline-none focus:ring-4 focus:ring-cyan-200" aria-label="Close records drill-down">
                    <X size={18} />
                </button>
                <div className="bg-slate-950 p-5 pr-20 text-white">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                            <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">Filtered drill-down</p>
                            <h2 className="mt-2 text-2xl font-black">{title}</h2>
                            <p className="mt-1 text-sm font-bold text-slate-300">{period} · {officeLabel}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {isCollections ? (
                                <a href={collectionUrl} className="inline-flex min-h-10 items-center rounded-xl bg-cyan-300 px-4 text-sm font-black text-slate-950 hover:bg-cyan-200">
                                    Open Collections
                                </a>
                            ) : null}
                            <button type="button" onClick={onClose} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white/10 px-4 text-sm font-black text-white hover:bg-white/15 focus:outline-none focus:ring-4 focus:ring-cyan-200"><X size={16} />Close</button>
                        </div>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <MiniDrilldownCard label="Matching Records" value={count.toLocaleString()} />
                        <MiniDrilldownCard label="Visible Total" value={money(total)} />
                        <MiniDrilldownCard label="Scope" value={officeLabel} />
                    </div>
                </div>
                <div className="overflow-auto">
                    {isCollections ? (
                        <table className="w-full min-w-[1180px] text-left text-sm">
                            <thead className="bg-slate-100 text-xs uppercase text-slate-500">
                                <tr>
                                    <th className="px-4 py-3">Business Date</th>
                                    <th className="px-4 py-3">Receipt</th>
                                    <th className="px-4 py-3">Tenant / Room</th>
                                    <th className="px-4 py-3">Destination Office</th>
                                    <th className="px-4 py-3">Source</th>
                                    <th className="px-4 py-3">Method</th>
                                    <th className="px-4 py-3">Reference</th>
                                    <th className="px-4 py-3">Purpose / Notes</th>
                                    <th className="px-4 py-3">Recorded By</th>
                                    <th className="px-4 py-3">Created</th>
                                    <th className="px-4 py-3">Audit</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3 text-right">Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {collections.map((collection) => (
                                    <tr key={`summary-collection:${collection.id}`} className="border-b border-slate-100 hover:bg-emerald-50/60">
                                        <td className="px-4 py-3 font-bold text-slate-500">{collection.paymentDate ?? "--"}</td>
                                        <td className="px-4 py-3 font-black text-slate-950">{collection.receiptNumber ?? collection.id}</td>
                                        <td className="px-4 py-3 font-bold text-slate-700">{collection.tenantName ?? "Tenant"}{collection.roomLabel ? ` · ${collection.roomLabel}` : ""}</td>
                                        <td className="px-4 py-3 font-bold text-slate-500">{collection.officeName ?? officeLabel}</td>
                                        <td className="px-4 py-3 font-bold text-slate-500">{collection.collectionSourceLabel}</td>
                                        <td className="px-4 py-3 font-bold capitalize text-slate-500">{collection.paymentMethod?.replaceAll("_", " ") ?? "--"}</td>
                                        <td className="px-4 py-3 font-bold text-slate-500">{collection.reference ?? "--"}</td>
                                        <td className="max-w-xs px-4 py-3 font-bold text-slate-500">
                                            <span className="block break-words">{collection.purpose ?? "--"}</span>
                                            {collection.notes ? <span className="mt-1 block break-words text-xs font-semibold text-slate-400">{collection.notes}</span> : null}
                                        </td>
                                        <td className="px-4 py-3 font-bold text-slate-500">{collection.recordedByName ?? "System"}</td>
                                        <td className="px-4 py-3 font-bold text-slate-500">{collection.createdAt ? formatDateTime(collection.createdAt) : "--"}</td>
                                        <td className="px-4 py-3 font-bold text-slate-500">{collection.auditReference ?? "--"}</td>
                                        <td className="px-4 py-3 font-bold text-slate-500">{collection.statusLabel}</td>
                                        <td className="px-4 py-3 text-right font-black text-emerald-700">{money(collection.amountValue)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <table className="w-full min-w-[980px] text-left text-sm">
                            <thead className="bg-slate-100 text-xs uppercase text-slate-500">
                                <tr>
                                    <th className="px-4 py-3">Expense Date</th>
                                    <th className="px-4 py-3">Expense</th>
                                    <th className="px-4 py-3">Office</th>
                                    <th className="px-4 py-3">Recorded By</th>
                                    <th className="px-4 py-3">Status</th>
                                    <th className="px-4 py-3 text-right">Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {expenses.map((expense) => (
                                    <tr key={`summary-expense:${expense.id}`} className="border-b border-slate-100 hover:bg-rose-50/60">
                                        <td className="px-4 py-3 font-bold text-slate-500">{expense.expense_date ?? "--"}</td>
                                        <td className="px-4 py-3 font-black text-slate-950">{expense.item ?? expense.expense_number ?? "Expense"}</td>
                                        <td className="px-4 py-3 font-bold text-slate-500">{expense.officeName ?? officeLabel}</td>
                                        <td className="px-4 py-3 font-bold text-slate-500">{expense.submittedByName ?? "System"}</td>
                                        <td className="px-4 py-3"><StatusBadge status={expense.status ?? expense.approvalState} /></td>
                                        <td className="px-4 py-3 text-right font-black text-rose-700">{money(expense.amount)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
                {!count ? <p className="p-5 text-sm font-bold text-slate-500">No matching records were found for the selected filters.</p> : null}
            </div>
        </div>
    );
}

function MiniDrilldownCard({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
            <p className="text-xs font-black uppercase tracking-wide text-cyan-100">{label}</p>
            <p className="mt-1 break-words text-lg font-black text-white">{value}</p>
        </div>
    );
}

function PremiumCardSection({ children, featured = false, title }: { children: ReactNode; featured?: boolean; title: string }) {
    return (
        <section className="rounded-[24px] border border-slate-200/80 bg-white/80 p-3 shadow-xl shadow-slate-950/10 ring-1 ring-white/70">
            <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">{title}</h3>
                <span className={`h-2 w-2 rounded-full ${featured ? "bg-cyan-400" : "bg-slate-300"}`} />
            </div>
            <div className={`grid gap-3 md:grid-cols-2 ${featured ? "xl:grid-cols-4" : "xl:grid-cols-4"}`}>{children}</div>
        </section>
    );
}

function PremiumEntryCard({ actionLabel, featured = false, label, onAction, value }: { actionLabel?: string; featured?: boolean; label: string; onAction?: () => void; value: string }) {
    return (
        <div className={`group min-h-[132px] rounded-2xl border p-4 shadow-xl shadow-slate-950/10 ring-1 transition hover:-translate-y-0.5 hover:shadow-2xl ${featured ? "border-cyan-100 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 text-white ring-cyan-300/20" : "border-white/70 bg-gradient-to-br from-white via-slate-50 to-blue-50/70 text-slate-950 ring-slate-900/5"}`}>
            <div className="flex items-start justify-between gap-3">
                <p className={`text-xs font-black uppercase tracking-wide ${featured ? "text-cyan-100/80" : "text-slate-500"}`}>{label}</p>
                {actionLabel && onAction ? (
                    <button type="button" onClick={onAction} className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-blue-100 bg-white px-3 text-xs font-black text-blue-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 focus:outline-none focus:ring-4 focus:ring-blue-200 active:scale-[0.98]">
                        <Edit3 size={12} />
                        {actionLabel}
                    </button>
                ) : null}
            </div>
            <p className={`mt-3 break-words font-black leading-tight ${featured ? "text-2xl text-white" : "text-xl text-slate-950"}`}>{value}</p>
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
    if (!requests.length) return null;

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
                <p className="text-xs font-black uppercase tracking-wide text-amber-700">{isAdmin ? "Admin approval centre" : "Expense approval status"}</p>
                <h2 className="text-lg font-black text-slate-950">Pending Office Expenses</h2>
                <p className="mt-1 text-sm font-bold text-slate-600">{isAdmin ? "Pending expenses are visible here but do not reduce cash until Admin approval." : "Manager-entered expenses remain pending until Admin approval."}</p>
                {message ? <p className="mt-2 rounded-xl bg-white px-3 py-2 text-sm font-black text-slate-700">{message}</p> : null}
            </div>
            <div className="grid gap-3 p-4 lg:grid-cols-2">
                {requests.map((expense) => {
                    const note = comments[expense.id] ?? "";
                    const busy = isPending && pendingId === expense.id;
                    const proofPath = String((expense as ExpenseItem & { supporting_document?: string | null }).supporting_document ?? "");
                    const proofName = String((expense as ExpenseItem & { supporting_document_original_name?: string | null }).supporting_document_original_name ?? "Supporting proof");
                    const proofMime = String((expense as ExpenseItem & { supporting_document_mime_type?: string | null }).supporting_document_mime_type ?? "");
                    const hasProof = Boolean(proofPath);
                    const proofUrl = `/api/expenses/proof/${encodeURIComponent(expense.id)}`;
                    return (
                        <article key={`generic-expense-approval:${expense.id}`} className="min-w-0 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                    <p className="break-words text-base font-black text-slate-950">{expense.item ?? expense.expense_number ?? "Office expense"}</p>
                                    <p className="mt-1 text-xs font-bold text-slate-500">{expense.officeName ?? "Office"} · Submitted by {expense.submittedByName ?? "account"} · {expense.expense_date ?? "No date"}</p>
                                </div>
                                <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">{money(expense.amount)}</span>
                                    <span className={hasProof ? "rounded-full bg-blue-100 px-3 py-1 text-xs font-black text-blue-800" : "rounded-full bg-slate-200 px-3 py-1 text-xs font-black text-slate-600"}>
                                        {hasProof ? "Proof Attached" : "No Attachment"}
                                    </span>
                                </div>
                            </div>
                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                <MiniFinance label="Category" value={expense.categoryName ?? expense.category ?? "Expense"} tone="slate" />
                                <MiniFinance label="Cash impact now" value="UGX 0 pending" tone="amber" />
                                <MiniFinance label="Payment method" value={expense.paymentMethod ?? "Not set"} tone="slate" />
                                <MiniFinance label="Projected after approval" value={`-${money(expense.amount)}`} tone="amber" />
                            </div>
                            <section className="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
                                <p className="text-xs font-black uppercase tracking-wide text-slate-500">Supporting Proof</p>
                                {hasProof ? (
                                    <div className="mt-2 grid gap-3 sm:grid-cols-[88px_minmax(0,1fr)] sm:items-center">
                                        {proofMime.startsWith("image/") ? (
                                            <img src={proofUrl} alt={`${proofName} thumbnail`} className="h-24 w-24 rounded-2xl border border-slate-200 object-cover" loading="lazy" />
                                        ) : (
                                            <div className="flex h-24 w-24 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-500"><FileText size={28} /></div>
                                        )}
                                        <div className="min-w-0">
                                            <p className="break-words text-sm font-black text-slate-950">{proofName}</p>
                                            <p className="mt-1 text-xs font-bold text-slate-500">{proofMime || "Private supporting document"}</p>
                                            <div className="mt-2 flex flex-wrap gap-2">
                                                <a href={proofUrl} target="_blank" rel="noreferrer" className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white">View Full Size</a>
                                                <a href={`${proofUrl}?download=1`} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">Download</a>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-sm font-bold text-slate-500">No supporting proof attached.</p>
                                )}
                            </section>
                            {isAdmin ? (
                                <label className="mt-3 block">
                                    <span className="text-xs font-black uppercase tracking-wide text-slate-500">Admin note / rejection reason</span>
                                    <input
                                        value={note}
                                        onChange={(event) => setComments((current) => ({ ...current, [expense.id]: event.target.value }))}
                                        placeholder="Required for rejection"
                                        className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-950 outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
                                    />
                                </label>
                            ) : null}
                            <div className="mt-3 flex flex-wrap gap-2">
                                {isAdmin ? (
                                    <>
                                        <button disabled={isPending} onClick={() => decide(expense, "approved")} className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-black text-white disabled:opacity-40">
                                            {busy ? "Processing..." : "Approve"}
                                        </button>
                                        <button disabled={isPending} onClick={() => decide(expense, "rejected")} className="rounded-xl bg-rose-700 px-4 py-2 text-xs font-black text-white disabled:opacity-40">
                                            Reject
                                        </button>
                                    </>
                                ) : (
                                    <span className="rounded-xl bg-amber-100 px-4 py-2 text-xs font-black text-amber-800">Awaiting Admin decision</span>
                                )}
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

function LandlordPaymentRequestLedger({ activeOfficeName, isAdmin, offices, requests }: { activeOfficeName: string; isAdmin: boolean; offices: ExpensesPageData["offices"]; requests: ExpensesPageData["landlordPaymentRequests"] }) {
    const router = useRouter();
    const [filters, setFilters] = useState<RecordTableFilters>(() => defaultRecordTableFilters());
    const [isPending, startTransition] = useTransition();
    const [message, setMessage] = useState<string | null>(null);
    const [pendingDecisionId, setPendingDecisionId] = useState<string | null>(null);
    const [selected, setSelected] = useState<ExpensesPageData["landlordPaymentRequests"][number] | null>(null);
    const range = useMemo(() => resolveRecordFilterRange(filters), [filters]);
    const visibleRequests = useMemo(() => requests.filter((request) => {
        if (isAdmin && filters.officeId && request.officeId !== filters.officeId) return false;
        return isDateInRange(request.paymentDate, range);
    }), [filters.officeId, isAdmin, range, requests]);
    const total = useMemo(() => visibleRequests.reduce((sum, request) => sum + Number(request.amount ?? 0), 0), [visibleRequests]);
    const officeLabel = isAdmin && filters.officeId ? offices.find((office) => office.id === filters.officeId)?.name ?? "Selected office" : isAdmin ? "All Offices" : activeOfficeName;
    function decide(request: ExpensesPageData["landlordPaymentRequests"][number], decision: "approved" | "rejected") {
        if (pendingDecisionId) return;
        const comment = decision === "rejected"
            ? window.prompt("Enter the rejection reason for this landlord payment request.") ?? ""
            : window.prompt("Confirm approval note. Leave blank if not needed.") ?? "";
        if (decision === "rejected" && !comment.trim()) {
            setMessage("A rejection reason is required.");
            return;
        }
        setMessage(null);
        setPendingDecisionId(request.id);
        startTransition(async () => {
            try {
                await decideLandlordPaidExpenseRequest({ requestId: request.id, decision, comment });
                setMessage(decision === "approved"
                    ? `Landlord payment of ${money(request.amount)} for ${request.landlordName} was approved successfully.`
                    : `Landlord payment request for ${request.landlordName} was rejected.`);
                setSelected(null);
                router.refresh();
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Unable to process landlord payment request.");
            } finally {
                setPendingDecisionId(null);
            }
        });
    }
    if (!requests.length) return null;
    return (
        <section className="mx-auto mt-5 max-w-6xl overflow-hidden rounded-[26px] border border-white/70 bg-white shadow-2xl shadow-slate-950/15">
            <div className="border-b border-slate-200 px-4 py-3">
                <p className="text-xs font-black uppercase tracking-wide text-amber-600">Landlord payment approval queue</p>
                <h2 className="text-lg font-black text-slate-950">Expense-routed Landlord Payments</h2>
                {message ? <p className="mt-2 rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm font-black text-slate-800">{message}</p> : null}
                <RecordTableFilterBar
                    activeOfficeName={activeOfficeName}
                    filters={filters}
                    isAdmin={isAdmin}
                    label="Expense Routed Landlord Payments"
                    offices={offices}
                    onChange={setFilters}
                />
                <RecordTableSummary count={visibleRequests.length} dateLabel={range.label} officeLabel={officeLabel} total={total} />
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
                            <th className="px-4 py-3">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {visibleRequests.map((request) => {
                            const busy = isPending && pendingDecisionId === request.id;
                            const isPendingRequest = String(request.status).toLowerCase() === "pending";
                            return (
                                <tr key={`landlord-payment-expense-request:${request.id}`} onClick={() => setSelected(request)} className="cursor-pointer border-b border-slate-100 hover:bg-amber-50/70">
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
                                    <td className="px-4 py-3">
                                        <div className="flex flex-wrap gap-2">
                                            <button type="button" onClick={(event) => { event.stopPropagation(); setSelected(request); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-amber-100">
                                                View
                                            </button>
                                            {isAdmin && isPendingRequest ? (
                                                <>
                                                    <button type="button" disabled={isPending} onClick={(event) => { event.stopPropagation(); decide(request, "approved"); }} className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-black text-white shadow-lg shadow-emerald-900/15 hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus:ring-4 focus:ring-emerald-100">
                                                        {busy ? "Approving..." : "Approve"}
                                                    </button>
                                                    <button type="button" disabled={isPending} onClick={(event) => { event.stopPropagation(); decide(request, "rejected"); }} className="rounded-xl bg-rose-700 px-3 py-2 text-xs font-black text-white shadow-lg shadow-rose-900/15 hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus:ring-4 focus:ring-rose-100">
                                                        Reject
                                                    </button>
                                                </>
                                            ) : null}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            {!visibleRequests.length ? <p className="p-5 text-sm font-bold text-slate-500">No landlord payment records match the selected filters.</p> : null}
            {selected ? (
                <RecordDetailsModal
                    onClose={() => setSelected(null)}
                    rows={[
                        ["Date", selected.paymentDate],
                        ["Landlord", selected.landlordName],
                        ["Office", selected.officeName],
                        ["Amount", money(selected.amount)],
                        ["Cash Payment", money(selected.cashPaymentAmount)],
                        ["Advance Recovery", money(selected.advanceRecoveryAmount)],
                        ["New Advance", money(selected.advanceAmount)],
                        ["Method", selected.paymentMethod.replaceAll("_", " ")],
                        ["Status", selected.status],
                        ["Admin Comment", selected.adminComment ?? selected.notes ?? "No comment"],
                    ]}
                    title="Landlord Payment Record"
                />
            ) : null}
        </section>
    );
}

function RecordTableFilterBar({
    activeOfficeName,
    filters,
    isAdmin,
    label,
    offices,
    onChange,
}: {
    activeOfficeName: string;
    filters: RecordTableFilters;
    isAdmin: boolean;
    label: string;
    offices: ExpensesPageData["offices"];
    onChange: (filters: RecordTableFilters) => void;
}) {
    const range = resolveRecordFilterRange(filters);
    const officeName = isAdmin && filters.officeId ? offices.find((office) => office.id === filters.officeId)?.name ?? "Selected office" : null;
    const update = <Key extends keyof RecordTableFilters>(key: Key, value: RecordTableFilters[Key]) => onChange({ ...filters, [key]: value });
    const clearDate = () => onChange({ ...filters, datePreset: "all_dates" });
    const clearOffice = () => onChange({ ...filters, officeId: "" });
    const clearAll = () => onChange(defaultRecordTableFilters());

    return (
        <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-3">
            <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)_minmax(0,1fr)_180px]">
                <label className="block">
                    <span className="text-xs font-black uppercase tracking-wide text-slate-500">Date filter</span>
                    <div className="mt-1 flex h-11 items-center rounded-2xl border border-slate-200 bg-white px-2">
                        <select value={filters.datePreset} onChange={(event) => update("datePreset", event.target.value as RecordDatePreset)} className="min-w-0 flex-1 bg-transparent text-sm font-black text-slate-900 outline-none">
                            <option value="today">Today</option>
                            <option value="yesterday">Yesterday</option>
                            <option value="week">This Week</option>
                            <option value="month">This Month</option>
                            <option value="custom_date">Custom Date</option>
                            <option value="custom_range">Custom Date Range</option>
                            <option value="all_dates">All Dates</option>
                        </select>
                        <button type="button" onClick={clearDate} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={`Clear ${label} date filter`}>
                            <X size={15} />
                        </button>
                    </div>
                </label>
                {filters.datePreset === "custom_date" ? (
                    <label className="block">
                        <span className="text-xs font-black uppercase tracking-wide text-slate-500">Custom date</span>
                        <input type="date" value={filters.customDate} onChange={(event) => update("customDate", event.target.value)} className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-900 outline-none" />
                    </label>
                ) : null}
                {filters.datePreset === "custom_range" ? (
                    <>
                        <label className="block">
                            <span className="text-xs font-black uppercase tracking-wide text-slate-500">Start date</span>
                            <input type="date" value={filters.startDate} onChange={(event) => update("startDate", event.target.value)} className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-900 outline-none" />
                        </label>
                        <label className="block">
                            <span className="text-xs font-black uppercase tracking-wide text-slate-500">End date</span>
                            <input type="date" value={filters.endDate} onChange={(event) => update("endDate", event.target.value)} className="mt-1 h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-900 outline-none" />
                        </label>
                    </>
                ) : (
                    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
                        <p className="text-xs font-black uppercase tracking-wide text-slate-500">Selected date range</p>
                        <p className="mt-1 text-sm font-black text-slate-900">{range.label}</p>
                    </div>
                )}
                {isAdmin ? (
                    <label className="block">
                        <span className="text-xs font-black uppercase tracking-wide text-slate-500">Office filter</span>
                        <div className="mt-1 flex h-11 items-center rounded-2xl border border-slate-200 bg-white px-2">
                            <select value={filters.officeId} onChange={(event) => update("officeId", event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm font-black text-slate-900 outline-none">
                                <option value="">All Offices</option>
                                {offices.map((office) => <option key={`${label}:office-filter:${office.id}`} value={office.id}>{office.name}</option>)}
                            </select>
                            <button type="button" onClick={clearOffice} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={`Clear ${label} office filter`}>
                                <X size={15} />
                            </button>
                        </div>
                    </label>
                ) : (
                    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
                        <p className="text-xs font-black uppercase tracking-wide text-slate-500">Office</p>
                        <p className="mt-1 text-sm font-black text-slate-900">{activeOfficeName}</p>
                    </div>
                )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wide text-slate-500">Showing results for:</span>
                {filters.datePreset === "all_dates" && !filters.officeId ? <span className="text-xs font-bold text-slate-500">All authorised records</span> : null}
                {filters.datePreset !== "all_dates" ? <FilterChip label={`Date: ${range.label}`} onClear={clearDate} /> : null}
                {officeName ? <FilterChip label={`Office: ${officeName}`} onClear={clearOffice} /> : null}
                <button type="button" onClick={clearAll} className="ml-auto rounded-xl bg-slate-950 px-3 py-2 text-xs font-black uppercase tracking-wide text-white hover:bg-slate-800">
                    Clear All Filters
                </button>
            </div>
        </div>
    );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
    return (
        <button type="button" onClick={onClear} className="inline-flex min-h-8 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-100">
            {label}
            <X size={13} />
        </button>
    );
}

function RecordTableSummary({ count, dateLabel, officeLabel, total }: { count: number; dateLabel: string; officeLabel: string; total: number }) {
    return (
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
            <MiniFinance label="Matching records" value={count.toLocaleString()} tone="slate" />
            <MiniFinance label="Visible total" value={money(total)} tone="green" />
            <MiniFinance label="Selected date" value={dateLabel} tone="slate" />
            <MiniFinance label="Selected office" value={officeLabel} tone="slate" />
        </div>
    );
}

function RecordDetailsModal({ onClose, rows, title }: { onClose: () => void; rows: Array<[string, string]>; title: string }) {
    useEffect(() => {
        const handleKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [onClose]);
    return (
        <div className="fixed inset-0 z-[120] overflow-auto bg-slate-950/70 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
            <div className="relative mx-auto my-8 max-w-2xl overflow-hidden rounded-[28px] bg-white shadow-2xl shadow-slate-950/30">
                <button type="button" onClick={onClose} className="absolute right-4 top-4 z-10 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-white/10 bg-white/10 text-white shadow-lg transition hover:bg-white hover:text-slate-950 focus:outline-none focus:ring-4 focus:ring-cyan-200" aria-label="Close record details">
                    <X size={18} />
                </button>
                <div className="flex items-start justify-between gap-3 bg-slate-950 p-5 pr-20 text-white">
                    <div>
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">Record details</p>
                        <h2 className="mt-2 text-2xl font-black">{title}</h2>
                    </div>
                    <button type="button" onClick={onClose} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-black hover:bg-white/15 focus:outline-none focus:ring-4 focus:ring-cyan-200"><X size={16} />Close</button>
                </div>
                <div className="grid gap-3 p-5 sm:grid-cols-2">
                    {rows.map(([label, value]) => (
                        <div key={`${title}:${label}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                            <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
                            <p className="mt-1 break-words text-sm font-black text-slate-950">{value}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
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

function LandlordEditModal({
    expenseDate,
    isAdmin,
    modal,
    onClose,
    onDone,
}: {
    expenseDate: string;
    isAdmin: boolean;
    modal: LandlordEditModalState;
    onClose: () => void;
    onDone: (message: string) => void;
}) {
    const currentValue = modal.requestType === "landlord_outstanding_balance_edit"
        ? modal.landlord.outstandingBalance
        : modal.requestType === "landlord_payment_date_edit"
            ? modal.landlord.landlordPaymentDate?.slice(0, 10) ?? expenseDate
            : modal.landlord.landlordBillingDate?.slice(0, 10) ?? `${expenseDate.slice(0, 7)}-01`;
    const [newValue, setNewValue] = useState(String(currentValue ?? ""));
    const [reason, setReason] = useState("");
    const [effectiveDate, setEffectiveDate] = useState(expenseDate);
    const [effectiveMonth, setEffectiveMonth] = useState(expenseDate.slice(0, 7));
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    const isBalance = modal.requestType === "landlord_outstanding_balance_edit";
    const title = isBalance ? "Outstanding Balance Edit" : modal.requestType === "landlord_payment_date_edit" ? "Landlord Payment Date Edit" : "Landlord Billing Date Edit";
    const adjustmentAmount = isBalance ? Number(newValue || 0) - Number(currentValue || 0) : 0;

    function save() {
        if (!reason.trim()) {
            setError("Reason is required.");
            return;
        }
        setError(null);
        startTransition(async () => {
            try {
                const result = await submitLandlordExpenseEdit({
                    effectiveDate,
                    effectiveMonth,
                    landlordId: modal.landlord.id,
                    newValue: isBalance ? Number(newValue) : newValue,
                    officeId: modal.landlord.officeId,
                    oldValue: currentValue,
                    reason: reason.trim(),
                    requestType: modal.requestType,
                });
                onDone(result.direct ? `${title} applied by Admin.` : `${title} sent for Admin approval.`);
            } catch (saveError) {
                setError(saveError instanceof Error ? saveError.message : "Landlord edit could not be saved.");
            }
        });
    }

    return (
        <div className="fixed inset-0 z-[140] overflow-auto bg-slate-950/70 p-4 backdrop-blur-sm">
            <div className="mx-auto my-8 max-w-3xl overflow-hidden rounded-[28px] bg-white shadow-2xl shadow-slate-950/30">
                <div className="bg-slate-950 p-5 text-white">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-200">{isAdmin ? "Admin direct landlord edit" : "Landlord edit approval request"}</p>
                            <h2 className="mt-2 text-2xl font-black">{title}</h2>
                            <p className="mt-1 text-sm font-bold text-slate-300">{modal.landlord.name} · {modal.landlord.officeName ?? "Office"}</p>
                        </div>
                        <button type="button" disabled={isPending} onClick={onClose} className="inline-flex min-h-10 items-center justify-center rounded-xl bg-white/10 px-4 text-sm font-black text-white hover:bg-white/15 disabled:opacity-40">Close</button>
                    </div>
                </div>
                <div className="grid gap-3 p-5 md:grid-cols-2">
                    <ModalField label="Landlord name">
                        <input readOnly value={modal.landlord.name} className="modal-input" />
                    </ModalField>
                    <ModalField label="Office">
                        <input readOnly value={modal.landlord.officeName ?? "Office"} className="modal-input" />
                    </ModalField>
                    <ModalField label={isBalance ? "Current outstanding balance" : modal.requestType === "landlord_payment_date_edit" ? "Current payment date" : "Current billing date"}>
                        <input readOnly value={isBalance ? money(currentValue) : String(currentValue ?? "")} className="modal-input" />
                    </ModalField>
                    <ModalField label={isBalance ? "New requested balance" : modal.requestType === "landlord_payment_date_edit" ? "New payment date" : "New billing date"}>
                        <input type={isBalance ? "number" : "date"} value={newValue} onChange={(event) => setNewValue(event.target.value)} className="modal-input" />
                    </ModalField>
                    {isBalance ? (
                        <ModalField label="Adjustment amount">
                            <input readOnly value={money(adjustmentAmount)} className="modal-input" />
                        </ModalField>
                    ) : (
                        <ModalField label="Effective month">
                            <input type="month" value={effectiveMonth} onChange={(event) => setEffectiveMonth(event.target.value)} className="modal-input" />
                        </ModalField>
                    )}
                    <ModalField label="Effective date">
                        <input type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} className="modal-input" />
                    </ModalField>
                    <div className="md:col-span-2">
                        <ModalField label="Reason">
                            <textarea value={reason} onChange={(event) => setReason(event.target.value)} className="min-h-28 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100" />
                        </ModalField>
                    </div>
                </div>
                {error ? <p className="mx-5 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</p> : null}
                <div className="flex flex-wrap justify-end gap-2 p-5">
                    <button type="button" disabled={isPending} onClick={onClose} className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-700 disabled:opacity-40">Cancel</button>
                    <button type="button" disabled={isPending} onClick={save} className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-black text-white disabled:opacity-40">
                        {isPending ? "Saving..." : isAdmin ? "Apply Now" : "Submit for Approval"}
                    </button>
                </div>
            </div>
        </div>
    );
}

function BankingRecordsLedger({ activeOfficeName, banking, isAdmin, offices }: { activeOfficeName: string; banking: ExpensesPageData["banking"]; isAdmin: boolean; offices: ExpensesPageData["offices"] }) {
    const [filters, setFilters] = useState<RecordTableFilters>(() => defaultRecordTableFilters());
    const [status, setStatus] = useState("");
    const [method, setMethod] = useState("");
    const [selected, setSelected] = useState<ExpensesPageData["banking"]["records"][number] | null>(null);
    const range = useMemo(() => resolveRecordFilterRange(filters), [filters]);
    const visibleRecords = useMemo(() => banking.records.filter((record) => {
        if (isAdmin && filters.officeId && record.officeId !== filters.officeId) return false;
        if (status && normalizeStatus(record.status) !== normalizeStatus(status)) return false;
        if (method && record.method !== method) return false;
        return isDateInRange(record.bankingDate, range);
    }), [banking.records, filters.officeId, isAdmin, method, range, status]);
    const total = useMemo(() => visibleRecords.reduce((sum, record) => sum + Number(record.amount ?? 0), 0), [visibleRecords]);
    const methods = useMemo(() => Array.from(new Set(banking.records.map((record) => record.method).filter(Boolean))).sort(), [banking.records]);
    const officeLabel = isAdmin && filters.officeId ? offices.find((office) => office.id === filters.officeId)?.name ?? "Selected office" : isAdmin ? "All Offices" : activeOfficeName;

    return (
        <section className="mx-auto mt-5 max-w-6xl overflow-hidden rounded-[26px] border border-white/70 bg-white shadow-2xl shadow-slate-950/15">
            <div className="border-b border-slate-200 px-4 py-3">
                <p className="text-xs font-black uppercase tracking-wide text-emerald-600">Treasury transfer history</p>
                <h2 className="text-lg font-black text-slate-950">Banking Records</h2>
                <RecordTableFilterBar
                    activeOfficeName={activeOfficeName}
                    filters={filters}
                    isAdmin={isAdmin}
                    label="Banking Records"
                    offices={offices}
                    onChange={setFilters}
                />
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="block">
                        <span className="text-xs font-black uppercase tracking-wide text-slate-500">Status</span>
                        <div className="mt-1 flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3">
                            <select value={status} onChange={(event) => setStatus(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm font-black text-slate-900 outline-none">
                                <option value="">All Statuses</option>
                                <option value="approved">Approved</option>
                                <option value="completed">Completed</option>
                                <option value="posted">Posted</option>
                                <option value="pending">Pending</option>
                            </select>
                            {status ? <button type="button" onClick={() => setStatus("")} className="rounded-full p-1 text-slate-400 hover:bg-white hover:text-slate-700" aria-label="Clear banking status filter"><X size={14} /></button> : null}
                        </div>
                    </label>
                    <label className="block">
                        <span className="text-xs font-black uppercase tracking-wide text-slate-500">Method</span>
                        <div className="mt-1 flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3">
                            <select value={method} onChange={(event) => setMethod(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm font-black text-slate-900 outline-none">
                                <option value="">All Methods</option>
                                {methods.map((option) => <option key={`banking-method:${option}`} value={option}>{option}</option>)}
                            </select>
                            {method ? <button type="button" onClick={() => setMethod("")} className="rounded-full p-1 text-slate-400 hover:bg-white hover:text-slate-700" aria-label="Clear banking method filter"><X size={14} /></button> : null}
                        </div>
                    </label>
                </div>
                <RecordTableSummary count={visibleRecords.length} dateLabel={range.label} officeLabel={officeLabel} total={total} />
            </div>
            <div className="overflow-auto">
                <table className="w-full min-w-[1120px] text-left text-sm">
                    <thead className="bg-slate-950 text-xs uppercase text-slate-200">
                        <tr>
                            <th className="px-4 py-3">Banking Date</th>
                            <th className="px-4 py-3">Office</th>
                            <th className="px-4 py-3 text-right">Amount</th>
                            <th className="px-4 py-3">Method</th>
                            <th className="px-4 py-3">Bank Account</th>
                            <th className="px-4 py-3">Reference</th>
                            <th className="px-4 py-3">Banked By</th>
                            <th className="px-4 py-3">Approval Status</th>
                            <th className="px-4 py-3">Created Time</th>
                            <th className="px-4 py-3">Notes</th>
                            <th className="px-4 py-3">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {visibleRecords.map((record) => (
                            <tr key={`banking-record:${record.id}`} onClick={() => setSelected(record)} className="cursor-pointer border-b border-slate-100 hover:bg-emerald-50/70">
                                <td className="px-4 py-3 font-bold text-slate-500">{record.bankingDate || "--"}</td>
                                <td className="px-4 py-3 font-black text-slate-950">{record.officeName}</td>
                                <td className="px-4 py-3 text-right font-black text-emerald-700">{money(record.amount)}</td>
                                <td className="px-4 py-3 font-bold text-slate-500">{record.method}</td>
                                <td className="px-4 py-3 font-bold text-slate-500">{record.bankAccount}</td>
                                <td className="px-4 py-3 font-bold text-slate-500">{record.reference ?? "--"}</td>
                                <td className="px-4 py-3 font-bold text-slate-500">{record.bankedBy}</td>
                                <td className="px-4 py-3"><StatusBadge status={record.status} /></td>
                                <td className="px-4 py-3 font-bold text-slate-500">{record.createdAt ? new Date(record.createdAt).toLocaleString() : "--"}</td>
                                <td className="max-w-xs px-4 py-3 font-semibold text-slate-600">{record.notes ?? "--"}</td>
                                <td className="px-4 py-3">
                                    <button type="button" onClick={(event) => { event.stopPropagation(); setSelected(record); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-emerald-100">
                                        View
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {!visibleRecords.length ? <p className="p-5 text-sm font-bold text-slate-500">No banking records match the selected filters.</p> : null}
            {selected ? (
                <RecordDetailsModal
                    onClose={() => setSelected(null)}
                    rows={[
                        ["Banking Date", selected.bankingDate || "--"],
                        ["Office", selected.officeName],
                        ["Amount", money(selected.amount)],
                        ["Method", selected.method],
                        ["Bank Account", selected.bankAccount],
                        ["Reference", selected.reference ?? "--"],
                        ["Banked By", selected.bankedBy],
                        ["Approval Status", selected.status],
                        ["Created Time", selected.createdAt ? new Date(selected.createdAt).toLocaleString() : "--"],
                        ["Notes", selected.notes ?? "--"],
                    ]}
                    title="Banking Record"
                />
            ) : null}
        </section>
    );
}

function TreasuryCashRequestLedger({ activeOfficeName, isAdmin, onReviewed, requests }: { activeOfficeName: string; isAdmin: boolean; onReviewed: () => void; requests: ExpensesPageData["treasuryCashRequests"] }) {
    const [comments, setComments] = useState<Record<string, string>>({});
    const [message, setMessage] = useState<string | null>(null);
    const [selected, setSelected] = useState<ExpensesPageData["treasuryCashRequests"][number] | null>(null);
    const [isPending, startTransition] = useTransition();
    const visibleRequests = requests.filter((request) => request.status === "pending" || isAdmin);

    if (!visibleRequests.length) return null;

    function decide(requestId: string, decision: "approved" | "rejected") {
        startTransition(async () => {
            try {
                const result = await decideTreasuryCashRequest({ requestId, decision, adminComment: comments[requestId] ?? undefined });
                setMessage(decision === "approved"
                    ? `${result.requestType === "cash_handover_admin" ? "Cash Handover to Admin" : "Banking"} approved and posted.`
                    : "Treasury request rejected.");
                onReviewed();
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Treasury request could not be reviewed.");
            }
        });
    }

    return (
        <section className="mx-auto mt-5 max-w-6xl overflow-hidden rounded-[26px] border border-white/70 bg-white shadow-2xl shadow-slate-950/15">
            <div className="border-b border-slate-200 px-4 py-3">
                <p className="text-xs font-black uppercase tracking-wide text-amber-600">Treasury approval queue</p>
                <h2 className="text-lg font-black text-slate-950">Banking and Cash Handover Requests</h2>
                <p className="mt-1 text-xs font-bold text-slate-500">{isAdmin ? "Admin can approve or reject pending treasury movements." : `Showing requests for ${activeOfficeName}.`}</p>
                {message ? <p className="mt-2 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">{message}</p> : null}
            </div>
            <div className="overflow-auto">
                <table className="w-full min-w-[1260px] text-left text-sm">
                    <thead className="bg-slate-950 text-xs uppercase text-slate-200">
                        <tr>
                            <th className="px-4 py-3">Date</th>
                            <th className="px-4 py-3">Request Type</th>
                            <th className="px-4 py-3">Office</th>
                            <th className="px-4 py-3 text-right">Amount</th>
                            <th className="px-4 py-3">Method</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Submitted By</th>
                            <th className="px-4 py-3">Approved By</th>
                            <th className="px-4 py-3">Reason</th>
                            <th className="px-4 py-3">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {visibleRequests.map((request) => (
                            <tr key={`treasury-cash-request:${request.id}`} onClick={() => setSelected(request)} className="cursor-pointer border-b border-slate-100 align-top hover:bg-amber-50/70">
                                <td className="px-4 py-3 font-bold text-slate-500">{request.businessDate || request.createdAt?.slice(0, 10) || "--"}</td>
                                <td className="px-4 py-3 font-black text-slate-950">{request.requestType === "cash_handover_admin" ? "Cash Handover to Admin" : "Banking"}</td>
                                <td className="px-4 py-3 font-bold text-slate-700">{request.officeName}</td>
                                <td className="px-4 py-3 text-right font-black text-slate-950">{money(request.amount)}</td>
                                <td className="px-4 py-3 font-bold text-slate-500">{request.method ?? "--"}</td>
                                <td className="px-4 py-3"><StatusBadge status={request.status} /></td>
                                <td className="px-4 py-3 font-bold text-slate-500">{request.submittedByName ?? "--"}</td>
                                <td className="px-4 py-3 font-bold text-slate-500">{request.approvedByName ?? "--"}</td>
                                <td className="max-w-xs px-4 py-3 font-semibold text-slate-600">{request.reason ?? request.notes ?? "--"}</td>
                                <td className="px-4 py-3">
                                    {isAdmin && request.status === "pending" ? (
                                        <div className="flex min-w-[330px] flex-col gap-2" onClick={(event) => event.stopPropagation()}>
                                            <input value={comments[request.id] ?? ""} onChange={(event) => setComments((current) => ({ ...current, [request.id]: event.target.value }))} placeholder="Admin comment..." className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-900 outline-none" />
                                            <div className="flex flex-wrap gap-2">
                                                <button type="button" disabled={isPending} onClick={() => decide(request.id, "approved")} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">Approve</button>
                                                <button type="button" disabled={isPending} onClick={() => decide(request.id, "rejected")} className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">Reject</button>
                                                <button type="button" disabled={isPending} onClick={() => setSelected(request)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-50">View</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <button type="button" onClick={(event) => { event.stopPropagation(); setSelected(request); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-amber-100">
                                            View
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {selected ? (
                <RecordDetailsModal
                    onClose={() => setSelected(null)}
                    rows={[
                        ["Date", selected.businessDate || "--"],
                        ["Request Type", selected.requestType === "cash_handover_admin" ? "Cash Handover to Admin" : "Banking"],
                        ["Office", selected.officeName],
                        ["Amount", money(selected.amount)],
                        ["Method", selected.method ?? "--"],
                        ["Bank Account", selected.bankAccountName ?? "--"],
                        ["Reference", selected.reference ?? "--"],
                        ["Handed Over By", selected.handedOverBy ?? "--"],
                        ["Received By Admin", selected.receivedByAdminName ?? "--"],
                        ["Submitted By", selected.submittedByName ?? "--"],
                        ["Approved By", selected.approvedByName ?? "--"],
                        ["Status", selected.status],
                        ["Reason", selected.reason ?? "--"],
                        ["Notes", selected.notes ?? "--"],
                        ["Admin Comment", selected.adminComment ?? "--"],
                    ]}
                    title="Treasury Cash Request"
                />
            ) : null}
        </section>
    );
}

function LandlordEditRequestLedger({ isAdmin, onReviewed, requests }: { isAdmin: boolean; onReviewed: () => void; requests: ExpensesPageData["landlordExpenseEditRequests"] }) {
    const [comments, setComments] = useState<Record<string, string>>({});
    const [message, setMessage] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    const visibleRequests = requests.filter((request) => request.status === "pending" || isAdmin);
    if (!visibleRequests.length) return null;

    function decide(requestId: string, decision: "approved" | "rejected" | "more_info") {
        startTransition(async () => {
            try {
                await decideLandlordExpenseEditRequest({ requestId, decision, comment: comments[requestId] ?? undefined });
                setMessage(decision === "approved" ? "Landlord edit approved." : decision === "more_info" ? "More information requested." : "Landlord edit rejected.");
                onReviewed();
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Landlord edit request could not be reviewed.");
            }
        });
    }

    return (
        <section className="mx-auto mt-5 max-w-6xl overflow-hidden rounded-[26px] border border-white/70 bg-white shadow-2xl shadow-slate-950/15">
            <div className="border-b border-slate-200 px-4 py-3">
                <p className="text-xs font-black uppercase tracking-wide text-blue-600">Landlord edit approval list</p>
                <h2 className="text-lg font-black text-slate-950">Landlord Card Edit Requests</h2>
                {message ? <p className="mt-2 text-sm font-bold text-slate-600">{message}</p> : null}
            </div>
            <div className="overflow-auto">
                <table className="w-full min-w-[1180px] text-left text-sm">
                    <thead className="bg-slate-950 text-xs uppercase text-slate-200">
                        <tr>
                            <th className="px-4 py-3">Requested</th>
                            <th className="px-4 py-3">Landlord</th>
                            <th className="px-4 py-3">Request Type</th>
                            <th className="px-4 py-3">Old Value</th>
                            <th className="px-4 py-3">New Value</th>
                            <th className="px-4 py-3">Reason</th>
                            <th className="px-4 py-3">Office</th>
                            <th className="px-4 py-3">Requested By</th>
                            <th className="px-4 py-3">Status</th>
                            {isAdmin ? <th className="px-4 py-3">Admin Action</th> : null}
                        </tr>
                    </thead>
                    <tbody>
                        {visibleRequests.map((request) => (
                            <tr key={`landlord-edit-request:${request.id}`} className="border-b border-slate-100 align-top">
                                <td className="px-4 py-3 font-bold text-slate-500">{request.createdAt ? new Date(request.createdAt).toLocaleString() : "--"}</td>
                                <td className="px-4 py-3 font-black text-slate-950">{request.landlordName}</td>
                                <td className="px-4 py-3 font-bold text-slate-700">{request.requestType.replaceAll("_", " ")}</td>
                                <td className="px-4 py-3 font-bold text-slate-500">{formatRequestValue(request.oldValue.value)}</td>
                                <td className="px-4 py-3 font-black text-slate-950">{formatRequestValue(request.requestedValue.value)}</td>
                                <td className="max-w-xs px-4 py-3 font-semibold text-slate-600">{request.reason}</td>
                                <td className="px-4 py-3 font-bold text-slate-500">{request.officeName}</td>
                                <td className="px-4 py-3 font-bold text-slate-500">{request.requestedByName}</td>
                                <td className="px-4 py-3"><StatusBadge status={request.status} /></td>
                                {isAdmin ? (
                                    <td className="px-4 py-3">
                                        {request.status === "pending" ? (
                                            <div className="flex min-w-[310px] flex-col gap-2">
                                                <input value={comments[request.id] ?? ""} onChange={(event) => setComments((current) => ({ ...current, [request.id]: event.target.value }))} placeholder="Admin comment..." className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-900 outline-none" />
                                                <div className="flex flex-wrap gap-2">
                                                    <button disabled={isPending} onClick={() => decide(request.id, "approved")} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">Approve</button>
                                                    <button disabled={isPending} onClick={() => decide(request.id, "rejected")} className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">Reject</button>
                                                    <button disabled={isPending} onClick={() => decide(request.id, "more_info")} className="rounded-xl bg-amber-500 px-3 py-2 text-xs font-black text-slate-950 disabled:opacity-50">More Info</button>
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
        </section>
    );
}

function formatRequestValue(value: unknown) {
    if (typeof value === "number") return money(value);
    if (typeof value === "string" && /^\d+(\.\d+)?$/.test(value)) return money(Number(value));
    return String(value ?? "--");
}

function ExpenseChangeRequestLedger({ activeOfficeName, isAdmin, offices, onReviewed, requests }: { activeOfficeName: string; isAdmin: boolean; offices: ExpensesPageData["offices"]; onReviewed: () => void; requests: ExpensesPageData["expenseChangeRequests"] }) {
    const [comments, setComments] = useState<Record<string, string>>({});
    const [message, setMessage] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [bulkModal, setBulkModal] = useState<null | { decision: "approved" | "rejected"; ids: string[] }>(null);
    const [bulkComment, setBulkComment] = useState("");
    const [filters, setFilters] = useState<RecordTableFilters>(() => defaultRecordTableFilters());
    const [selected, setSelected] = useState<ExpensesPageData["expenseChangeRequests"][number] | null>(null);
    const [isPending, startTransition] = useTransition();
    if (!requests.length) return null;
    const range = resolveRecordFilterRange(filters);
    const visibleRequests = requests.filter((request) => {
        if (isAdmin && filters.officeId && request.officeId !== filters.officeId) return false;
        return isDateInRange(request.createdAt, range);
    });
    const pendingRequests = visibleRequests.filter((request) => request.status === "pending");
    const total = visibleRequests.reduce((sum, request) => sum + Number(request.amount ?? 0), 0);
    const officeLabel = isAdmin && filters.officeId ? offices.find((office) => office.id === filters.officeId)?.name ?? "Selected office" : isAdmin ? "All Offices" : activeOfficeName;

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
                <RecordTableFilterBar
                    activeOfficeName={activeOfficeName}
                    filters={filters}
                    isAdmin={isAdmin}
                    label="Expense Change Requests"
                    offices={offices}
                    onChange={setFilters}
                />
                <RecordTableSummary count={visibleRequests.length} dateLabel={range.label} officeLabel={officeLabel} total={total} />
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
                <table className="w-full min-w-[1280px] text-left text-sm">
                    <thead className="bg-slate-950 text-xs uppercase text-slate-200">
                        <tr>
                            {isAdmin ? <th className="px-4 py-3">Select</th> : null}
                            <th className="px-4 py-3">Submitted Date</th>
                            <th className="px-4 py-3">Expense</th>
                            <th className="px-4 py-3">Office</th>
                            <th className="px-4 py-3">Change Type</th>
                            <th className="px-4 py-3">Old Value</th>
                            <th className="px-4 py-3">Requested New Value</th>
                            <th className="px-4 py-3">Reason</th>
                            <th className="px-4 py-3">Requested By</th>
                            <th className="px-4 py-3">Status</th>
                            {isAdmin ? <th className="px-4 py-3">Admin action</th> : null}
                        </tr>
                    </thead>
                    <tbody>
                        {visibleRequests.map((request) => (
                            <tr key={`expense-change:${request.id}`} onClick={() => setSelected(request)} className="cursor-pointer border-b border-slate-100 align-top hover:bg-purple-50/70">
                                {isAdmin ? (
                                    <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                                        {request.status === "pending" ? (
                                            <input checked={selectedIds.includes(request.id)} disabled={isPending} type="checkbox" onChange={() => setSelectedIds((current) => current.includes(request.id) ? current.filter((id) => id !== request.id) : [...current, request.id])} className="h-4 w-4 rounded border-slate-300 text-purple-700" />
                                        ) : null}
                                    </td>
                                ) : null}
                                <td className="px-4 py-3 font-bold text-slate-500">{request.createdAt ? new Date(request.createdAt).toLocaleString() : "--"}</td>
                                <td className="px-4 py-3 font-black text-slate-950">{request.itemName}</td>
                                <td className="px-4 py-3 font-bold text-slate-500">{request.officeName}</td>
                                <td className="px-4 py-3 font-bold text-slate-700">{request.changeType.replaceAll("_", " ")}</td>
                                <td className="px-4 py-3 font-bold text-slate-500">{formatRequestValue(request.originalValue.value ?? request.originalValue.amount ?? request.originalValue.status ?? request.originalValue.expenseDate)}</td>
                                <td className="px-4 py-3 font-black text-slate-950">{formatRequestValue(request.requestedValue.value ?? request.requestedValue.amount ?? request.requestedValue.status ?? request.requestedValue.expenseDate)}</td>
                                <td className="max-w-xs px-4 py-3 font-semibold text-slate-600">{request.reason}</td>
                                <td className="px-4 py-3 font-bold text-slate-500">{request.requestedByName}</td>
                                <td className="px-4 py-3"><StatusBadge status={request.status} /></td>
                                {isAdmin ? (
                                    <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
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
            {!visibleRequests.length ? <p className="p-5 text-sm font-bold text-slate-500">No expense change requests match the selected filters.</p> : null}
            {selected ? (
                <RecordDetailsModal
                    onClose={() => setSelected(null)}
                    rows={[
                        ["Submitted Date", selected.createdAt ? new Date(selected.createdAt).toLocaleString() : "--"],
                        ["Expense", selected.itemName],
                        ["Office", selected.officeName],
                        ["Change Type", selected.changeType.replaceAll("_", " ")],
                        ["Old Value", formatRequestValue(selected.originalValue.value ?? selected.originalValue.amount ?? selected.originalValue.status ?? selected.originalValue.expenseDate)],
                        ["Requested New Value", formatRequestValue(selected.requestedValue.value ?? selected.requestedValue.amount ?? selected.requestedValue.status ?? selected.requestedValue.expenseDate)],
                        ["Reason", selected.reason],
                        ["Requested By", selected.requestedByName],
                        ["Status", selected.status],
                        ["Admin Comment", selected.adminComment ?? "No comment"],
                    ]}
                    title="Expense Change Request"
                />
            ) : null}
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
    const proofPath = String((expense as ExpenseItem & { supporting_document?: string | null }).supporting_document ?? "");
    const proofName = String((expense as ExpenseItem & { supporting_document_original_name?: string | null }).supporting_document_original_name ?? "Supporting proof");
    const proofMime = String((expense as ExpenseItem & { supporting_document_mime_type?: string | null }).supporting_document_mime_type ?? "");
    const proofUploadedAt = String((expense as ExpenseItem & { supporting_document_uploaded_at?: string | null }).supporting_document_uploaded_at ?? "");
    const proofUrl = `/api/expenses/proof/${encodeURIComponent(expense.id)}`;

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
                        <p>Supporting proof: {proofPath ? proofName : "No supporting proof attached."}</p>
                        {proofUploadedAt ? <p>Proof uploaded: {new Date(proofUploadedAt).toLocaleString()}</p> : null}
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
                <section className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-black uppercase tracking-wide text-slate-500">Supporting Proof</p>
                    {proofPath ? (
                        <div className="mt-3 grid gap-3 sm:grid-cols-[96px_minmax(0,1fr)] sm:items-center">
                            {proofMime.startsWith("image/") ? (
                                <img src={proofUrl} alt={`${proofName} thumbnail`} className="h-24 w-24 rounded-2xl border border-slate-200 object-cover" loading="lazy" />
                            ) : (
                                <div className="flex h-24 w-24 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500"><FileText size={30} /></div>
                            )}
                            <div className="min-w-0">
                                <p className="break-words text-sm font-black text-slate-950">{proofName}</p>
                                <p className="mt-1 text-xs font-bold text-slate-500">{proofMime || "Private supporting document"}</p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    <a href={proofUrl} target="_blank" rel="noreferrer" className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white">View Full Size</a>
                                    <a href={`${proofUrl}?download=1`} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">Download</a>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <p className="mt-2 rounded-xl bg-white px-3 py-2 text-sm font-bold text-slate-500">No supporting proof attached.</p>
                    )}
                </section>
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
    totals: { totalCollections: number; adminCapitalInjectionTotal: number; totalExpenses: number; remainingBalance: number; expenseRows: number; paymentRows: number };
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
