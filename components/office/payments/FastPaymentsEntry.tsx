"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AlertTriangle, Banknote, BrainCircuit, CalendarDays, CheckCircle2, CreditCard, Eye, History, Home, Loader2, Pencil, ReceiptText, Search, ShieldCheck, Smartphone, Trash2, UserPlus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { adminCorrectPayment, recordCollection, requestPaymentCorrection, requestTenantOutstandingBalanceAdjustment } from "@/app/actions/collections";
import { recordCollectorPayment } from "@/app/actions/collectors";
import { replaceTenantFromPaymentsEntry } from "@/app/actions/room-occupancy";
import TenantContactCard from "@/components/office/shared/TenantContactCard";
import type { AdvanceRentAssistantItem, CollectionTenantResult, FastPaymentRecentItem, FastPaymentRecentTotals } from "@/lib/collections/types";
import type { Company, Office, UserProfile } from "@/lib/auth/types";

type Props = {
    activeCompany: Company | null;
    activeOffice: Office | null;
    profile: UserProfile | null;
    canPostPayments: boolean;
    entryMode?: "office" | "admin" | "collector";
    isAdmin: boolean;
};
type CorrectionType = "date_change" | "amount_change" | "room_change" | "remove_payment";
type CorrectionHistoryRow = {
    id: string;
    correction_type: CorrectionType | string | null;
    status: string | null;
    original_value: Record<string, unknown> | null;
    requested_value: Record<string, unknown> | null;
    reason: string | null;
    admin_comment: string | null;
    created_at: string | null;
    reviewed_at: string | null;
};
type NewTenantForm = {
    newTenantName: string;
    newTenantPhone: string;
    nationalId: string;
    moveInDate: string;
    monthlyRent: string;
    paymentMade: string;
    paymentMethod: string;
    referenceNumber: string;
    notes: string;
};
type BalanceAdjustmentForm = {
    effectiveDate: string;
    newBalance: string;
    notes: string;
    reason: string;
};

function today() {
    return new Date().toISOString().slice(0, 10);
}

function isDateOnly(value: string) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function money(value: number | null | undefined) {
    return `UGX ${Math.round(Number(value ?? 0)).toLocaleString()}`;
}

function normalize(value: string | null | undefined) {
    return String(value ?? "").trim().toLowerCase();
}

function amountToCollect(tenant: CollectionTenantResult | null) {
    if (!tenant) return 0;
    return liveOutstandingBalance(tenant);
}

function emptyPaymentTotals(): FastPaymentRecentTotals {
    return {
        bankAmount: 0,
        cashAmount: 0,
        chequeAmount: 0,
        mobileMoneyAmount: 0,
        outstandingBalance: 0,
        tenantCount: 0,
        totalAmount: 0,
        totalRows: 0,
    };
}

function liveOutstandingBalance(tenant: CollectionTenantResult | null) {
    if (!tenant) return 0;
    return Math.max(0, Number(tenant.outstandingBalance ?? tenant.tenant.balance ?? tenant.room?.outstanding_balance ?? 0));
}

function roomLabel(result: CollectionTenantResult) {
    return result.room?.room_number ?? "Unknown";
}

function assistantBadgeClass(severity: AdvanceRentAssistantItem["severity"]) {
    if (severity === "danger") return "border-rose-200 bg-rose-50 text-rose-800";
    if (severity === "warning") return "border-amber-200 bg-amber-50 text-amber-900";
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
}

export default function FastPaymentsEntry({
    activeCompany,
    activeOffice,
    canPostPayments,
    entryMode = "office",
    isAdmin,
    profile,
}: Props) {
    const [paymentDate, setPaymentDate] = useState(today());
    const [roomQuery, setRoomQuery] = useState("");
    const [results, setResults] = useState<CollectionTenantResult[]>([]);
    const [selectedTenant, setSelectedTenant] = useState<CollectionTenantResult | null>(null);
    const [amount, setAmount] = useState("");
    const [recentPayments, setRecentPayments] = useState<FastPaymentRecentItem[]>([]);
    const [recentTotals, setRecentTotals] = useState<FastPaymentRecentTotals>(() => emptyPaymentTotals());
    const [ledgerSearch, setLedgerSearch] = useState("");
    const [ledgerMethod, setLedgerMethod] = useState("all");
    const [ledgerPage, setLedgerPage] = useState(1);
    const [ledgerPageSize, setLedgerPageSize] = useState(25);
    const [ledgerTotalPages, setLedgerTotalPages] = useState(1);
    const [assistantItems, setAssistantItems] = useState<AdvanceRentAssistantItem[]>([]);
    const [assistantLoading, setAssistantLoading] = useState(false);
    const [loadingRecent, setLoadingRecent] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [allocationMessage, setAllocationMessage] = useState<string | null>(null);
    const [searching, setSearching] = useState(false);
    const [roomMatchesOpen, setRoomMatchesOpen] = useState(false);
    const [duplicateWarning, setDuplicateWarning] = useState<{ count: number } | null>(null);
    const [latestPaymentId, setLatestPaymentId] = useState<string | null>(null);
    const [correctionPayment, setCorrectionPayment] = useState<FastPaymentRecentItem | null>(null);
    const [correctionType, setCorrectionType] = useState<CorrectionType>("date_change");
    const [requestedValue, setRequestedValue] = useState("");
    const [correctionReason, setCorrectionReason] = useState("");
    const [historyPayment, setHistoryPayment] = useState<FastPaymentRecentItem | null>(null);
    const [historyRows, setHistoryRows] = useState<CorrectionHistoryRow[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [newTenantOpen, setNewTenantOpen] = useState(false);
    const [newTenantError, setNewTenantError] = useState<string | null>(null);
    const [balanceAdjustmentOpen, setBalanceAdjustmentOpen] = useState(false);
    const [balanceAdjustmentError, setBalanceAdjustmentError] = useState<string | null>(null);
    const [balanceAdjustmentForm, setBalanceAdjustmentForm] = useState<BalanceAdjustmentForm>({
        effectiveDate: today(),
        newBalance: "",
        notes: "",
        reason: "",
    });
    const [newTenantForm, setNewTenantForm] = useState<NewTenantForm>({
        moveInDate: today(),
        monthlyRent: "",
        nationalId: "",
        newTenantName: "",
        newTenantPhone: "",
        notes: "",
        paymentMade: "",
        paymentMethod: "cash",
        referenceNumber: "",
    });
    const [isPending, startTransition] = useTransition();
    const abortRef = useRef<AbortController | null>(null);
    const roomInputRef = useRef<HTMLInputElement | null>(null);
    const amountInputRef = useRef<HTMLInputElement | null>(null);
    const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const requestSeqRef = useRef(0);
    const prefillAppliedRef = useRef(false);

    const duplicateCount = selectedTenant
        ? recentPayments.filter((payment) => normalize(payment.roomNumber) === normalize(selectedTenant.room?.room_number)).length
        : 0;
    const selectedOfficeMismatch = Boolean(
        selectedTenant &&
        !isAdmin &&
        entryMode !== "collector" &&
        activeOffice?.id &&
        (selectedTenant.office?.id ?? selectedTenant.room?.office_id ?? selectedTenant.tenant.office_id) !== activeOffice.id,
    );
    const actorLabel = entryMode === "collector" ? `collector ${profile?.full_name ?? "Field Collector"}` : profile?.full_name ?? "Current user";

    useEffect(() => {
        roomInputRef.current?.focus();
    }, []);

    useEffect(() => {
        if (prefillAppliedRef.current || typeof window === "undefined") return;
        prefillAppliedRef.current = true;
        const requestedRoom = new URLSearchParams(window.location.search).get("room")?.trim();
        if (requestedRoom) {
            setRoomQuery(requestedRoom);
            setRoomMatchesOpen(true);
        }
    }, []);

    useEffect(() => {
        void loadRecentPayments(paymentDate, ledgerPage, ledgerPageSize, ledgerSearch, ledgerMethod);
        void loadAdvanceRentAssistant(paymentDate);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ledgerMethod, ledgerPage, ledgerPageSize, ledgerSearch, paymentDate]);

    useEffect(() => {
        const lookup = roomQuery.trim();
        setDuplicateWarning(null);
        if (lookup.length < 2) {
            abortRef.current?.abort();
            setResults([]);
            setSelectedTenant(null);
            setRoomMatchesOpen(false);
            setSearching(false);
            return;
        }

        const requestSeq = requestSeqRef.current + 1;
        requestSeqRef.current = requestSeq;
        const timer = setTimeout(() => {
            abortRef.current?.abort();
            const controller = new AbortController();
            abortRef.current = controller;
            setSearching(true);

            void (async () => {
                try {
                    const response = await fetch(`/api/collections/room-lookup?room=${encodeURIComponent(lookup)}&paymentDate=${encodeURIComponent(paymentDate)}`, {
                        cache: "no-store",
                        signal: controller.signal,
                    });
                    const payload = await response.json();

                    if (controller.signal.aborted || requestSeqRef.current !== requestSeq) return;
                    if (!response.ok) throw new Error(payload.error ?? "Room search failed.");

                    const nextResults = payload.results ?? [];
                    const nextTenant = nextResults.length === 1 ? nextResults[0] : null;
                    setResults(nextResults);
                    setSelectedTenant(nextTenant);
                    setRoomMatchesOpen(nextResults.length > 1);
                    setMessage(nextTenant ? null : nextResults.length ? "Select the correct room." : "No tenant/room found.");

                    if (nextTenant) {
                        requestAnimationFrame(() => amountInputRef.current?.focus());
                    }
                } catch (error) {
                    if (controller.signal.aborted) return;
                    setResults([]);
                    setSelectedTenant(null);
                    setRoomMatchesOpen(false);
                    setMessage(error instanceof Error ? error.message : "Room search failed.");
                } finally {
                    if (requestSeqRef.current === requestSeq && !controller.signal.aborted) setSearching(false);
                }
            })();
        }, 120);

        return () => clearTimeout(timer);
    }, [paymentDate, roomQuery]);

    useEffect(() => {
        return () => {
            abortRef.current?.abort();
            if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
        };
    }, []);

    function flashLatestPayment(paymentId: string) {
        if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
        setLatestPaymentId(paymentId);
        highlightTimerRef.current = setTimeout(() => setLatestPaymentId(null), 2000);
    }

    function selectRoomMatch(result: CollectionTenantResult) {
        setSelectedTenant(result);
        setRoomQuery(result.room?.room_number ?? roomQuery);
        setRoomMatchesOpen(false);
        setMessage(null);
        requestAnimationFrame(() => amountInputRef.current?.focus());
    }

    function handleTenantContactSaved(tenant: { id: string; full_name: string | null; phone: string | null }) {
        setSelectedTenant((current) => current?.tenant.id === tenant.id
            ? { ...current, tenant: { ...current.tenant, full_name: tenant.full_name, phone: tenant.phone } }
            : current);
        setResults((currentResults) => currentResults.map((result) => result.tenant.id === tenant.id
            ? { ...result, tenant: { ...result.tenant, full_name: tenant.full_name, phone: tenant.phone } }
            : result));
    }

    async function loadRecentPayments(date: string, page = ledgerPage, pageSize = ledgerPageSize, search = ledgerSearch, method = ledgerMethod) {
        setLoadingRecent(true);
        try {
            const params = new URLSearchParams({
                date,
                method,
                page: String(page),
                pageSize: String(pageSize),
                search,
            });
            const response = await fetch(`/api/collections/recent?${params.toString()}`, { cache: "no-store" });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error ?? "Selected-date payments could not load.");
            setRecentPayments(payload.payments ?? []);
            setRecentTotals(payload.totals ?? emptyPaymentTotals());
            setLedgerTotalPages(payload.pagination?.totalPages ?? 1);
            if (payload.pagination?.page && payload.pagination.page !== ledgerPage) {
                setLedgerPage(payload.pagination.page);
            }
        } catch (error) {
            setRecentPayments([]);
            setRecentTotals(emptyPaymentTotals());
            setLedgerTotalPages(1);
            setMessage(error instanceof Error ? error.message : "Selected-date payments could not load.");
        } finally {
            setLoadingRecent(false);
        }
    }

    async function loadAdvanceRentAssistant(date: string) {
        setAssistantLoading(true);
        try {
            const response = await fetch(`/api/collections/advance-rent-assistant?month=${encodeURIComponent(date.slice(0, 7))}`, { cache: "no-store" });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error ?? "Advance rent assistant could not load.");
            setAssistantItems(payload.items ?? []);
        } catch {
            setAssistantItems([]);
        } finally {
            setAssistantLoading(false);
        }
    }

    async function reloadRoomDetails(roomNumber: string, expectedTenantId?: string | null) {
        const response = await fetch(`/api/collections/room-lookup?room=${encodeURIComponent(roomNumber)}&paymentDate=${encodeURIComponent(paymentDate)}`, {
            cache: "no-store",
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Room details could not reload.");
        const nextResults = (payload.results ?? []) as CollectionTenantResult[];
        const nextTenant = nextResults.find((result) => result.tenant.id === expectedTenantId)
            ?? nextResults.find((result) => normalize(result.room?.room_number) === normalize(roomNumber))
            ?? nextResults[0]
            ?? null;
        setResults(nextResults);
        setSelectedTenant(nextTenant);
        setRoomQuery(nextTenant?.room?.room_number ?? roomNumber);
        setRoomMatchesOpen(nextResults.length > 1 && !nextTenant);
    }

    function clearForNextPayment() {
        setRoomQuery("");
        setResults([]);
        setSelectedTenant(null);
        setAmount("");
        setDuplicateWarning(null);
        requestAnimationFrame(() => roomInputRef.current?.focus());
    }

    function openNewTenantModal() {
        if (!selectedTenant) return;
        setMessage(null);
        setNewTenantError(null);
        setNewTenantForm({
            moveInDate: paymentDate,
            monthlyRent: String(Number(selectedTenant.monthlyRent ?? selectedTenant.room?.monthly_rent ?? 0) || ""),
            nationalId: "",
            newTenantName: "",
            newTenantPhone: "",
            notes: "",
            paymentMade: "",
            paymentMethod: "cash",
            referenceNumber: "",
        });
        setNewTenantOpen(true);
    }

    function openBalanceAdjustmentModal() {
        if (!selectedTenant) return;
        setBalanceAdjustmentError(null);
        setBalanceAdjustmentForm({
            effectiveDate: paymentDate,
            newBalance: String(liveOutstandingBalance(selectedTenant)),
            notes: "",
            reason: "",
        });
        setBalanceAdjustmentOpen(true);
    }

    function submitBalanceAdjustment() {
        if (!selectedTenant?.room?.id) {
            setBalanceAdjustmentError("Search and select a room before editing outstanding balance.");
            return;
        }
        const newBalance = Number(balanceAdjustmentForm.newBalance);
        if (!Number.isFinite(newBalance) || newBalance < 0) {
            setBalanceAdjustmentError("New outstanding balance must be zero or greater.");
            return;
        }
        if (!balanceAdjustmentForm.reason.trim()) {
            setBalanceAdjustmentError("Reason for change is required.");
            return;
        }
        if (!isDateOnly(balanceAdjustmentForm.effectiveDate)) {
            setBalanceAdjustmentError("Effective date is required.");
            return;
        }
        const selected = selectedTenant;
        startTransition(async () => {
            try {
                setMessage(null);
                setBalanceAdjustmentError(null);
                await requestTenantOutstandingBalanceAdjustment({
                    effectiveDate: balanceAdjustmentForm.effectiveDate,
                    newBalance,
                    notes: balanceAdjustmentForm.notes || null,
                    reason: balanceAdjustmentForm.reason,
                    roomId: selected.room!.id,
                    tenantId: selected.tenant.id,
                });
                setBalanceAdjustmentOpen(false);
                setMessage(isAdmin ? "Outstanding balance updated by Admin." : "Outstanding balance change sent to Admin for approval.");
                if (isAdmin) {
                    await reloadRoomDetails(selected.room?.room_number ?? roomQuery, selected.tenant.id);
                    void loadAdvanceRentAssistant(paymentDate);
                }
            } catch (error) {
                setBalanceAdjustmentError(error instanceof Error ? error.message : "Outstanding balance change could not be saved.");
            }
        });
    }

    function submitNewTenant() {
        const selectedRoomId = selectedTenant?.room?.id ?? null;
        const selectedRoomNumber = selectedTenant?.room?.room_number ?? "";
        if (!selectedTenant || !selectedRoomId) {
            setNewTenantError("Search and select a room before adding a new tenant.");
            return;
        }
        if (!newTenantForm.newTenantName.trim()) {
            setNewTenantError("New tenant name is required.");
            return;
        }
        if (!newTenantForm.newTenantPhone.trim()) {
            setNewTenantError("Phone number is required.");
            return;
        }
        if (!isDateOnly(newTenantForm.moveInDate)) {
            setNewTenantError("Select a valid move-in date.");
            return;
        }
        const monthlyRent = Number(newTenantForm.monthlyRent);
        if (!Number.isFinite(monthlyRent) || monthlyRent <= 0) {
            setNewTenantError("Monthly rent must be greater than zero.");
            return;
        }
        const paymentMade = Number(newTenantForm.paymentMade || 0);
        if (!Number.isFinite(paymentMade) || paymentMade < 0) {
            setNewTenantError("Payment made must be zero or greater.");
            return;
        }
        const currentTenant = selectedTenant;
        startTransition(async () => {
            try {
                setMessage(null);
                setNewTenantError(null);
                const result = await replaceTenantFromPaymentsEntry({
                    currentTenantId: currentTenant.tenant.id,
                    moveInDate: newTenantForm.moveInDate,
                    monthlyRent,
                    nationalId: newTenantForm.nationalId || null,
                    newTenantName: newTenantForm.newTenantName,
                    newTenantPhone: newTenantForm.newTenantPhone,
                    notes: newTenantForm.notes || null,
                    paymentDate,
                    paymentMade,
                    paymentMethod: newTenantForm.paymentMethod || "cash",
                    referenceNumber: newTenantForm.referenceNumber || null,
                    roomId: selectedRoomId,
                });
                setNewTenantOpen(false);
                setMessage(`New tenant ${result.newTenant.full_name ?? newTenantForm.newTenantName} added to room ${currentTenant.room?.room_number ?? "selected room"}.`);
                setAmount("");
                setDuplicateWarning(null);
                await reloadRoomDetails(selectedRoomNumber, result.newTenant.id);
                void loadRecentPayments(paymentDate);
                void loadAdvanceRentAssistant(paymentDate);
            } catch (error) {
                setNewTenantError(error instanceof Error ? error.message : "New tenant workflow could not be completed.");
            }
        });
    }

    function savePayment(confirmDuplicate = false) {
        if (!selectedTenant) {
            setMessage("Enter a valid room number first.");
            return;
        }
        if (!isDateOnly(paymentDate)) {
            setMessage("Select a valid payment date before recording.");
            return;
        }
        if (selectedOfficeMismatch) {
            setMessage("This room is outside your active office.");
            return;
        }

        const paidAmount = Number(amount);
        if (!Number.isFinite(paidAmount) || paidAmount <= 0) {
            setMessage("Enter amount paid.");
            return;
        }

        startTransition(async () => {
            try {
                setMessage(null);
                setAllocationMessage(null);
                if (!confirmDuplicate && duplicateCount > 0) {
                    setDuplicateWarning({ count: duplicateCount });
                    setMessage("This room already has a payment today.");
                    return;
                }

                const collection = entryMode === "collector"
                    ? await recordCollectorPayment({
                        amount: paidAmount,
                        paymentDate,
                        paymentMethod: "cash",
                        tenantId: selectedTenant.tenant.id,
                    })
                    : await recordCollection({
                        tenantId: selectedTenant.tenant.id,
                        amount: paidAmount,
                        paymentDate,
                        paymentMethod: "cash",
                        paymentKind: "tenant_normal",
                        paymentSource: "tenant",
                    });
                const allocationSummary = (collection as typeof collection & {
                    allocationSummary?: {
                        advanceAmount?: number;
                        allocations?: Array<{ allocationMonth: string; allocationType: string; amount: number }>;
                    };
                }).allocationSummary;
                if (allocationSummary?.advanceAmount && allocationSummary.advanceAmount > 0) {
                    const advanceMonths = (allocationSummary.allocations ?? []).filter((allocation: { allocationMonth: string; allocationType: string; amount: number }) => allocation.allocationType === "advance_month");
                    setAllocationMessage(`Tenant has paid ${money(allocationSummary.advanceAmount)} above this month's due amount. This extra has been allocated to ${advanceMonths.length > 1 ? "future rent months" : "next month's rent"}.`);
                } else {
                    setAllocationMessage(null);
                }

                const remainingBalance = Math.max(0, liveOutstandingBalance(selectedTenant) - paidAmount);
                const optimisticPayment: FastPaymentRecentItem = {
                    id: collection.id,
                    paidAt: collection.paid_at,
                    paymentDate,
                    roomNumber: selectedTenant.room?.room_number ?? "Unknown",
                    tenantName: selectedTenant.tenant.full_name ?? "Unnamed tenant",
                    landlordName: selectedTenant.landlord?.full_name ?? "No landlord",
                    officeName: selectedTenant.office?.office_name ?? selectedTenant.office?.name ?? activeOffice?.office_name ?? activeOffice?.name ?? "Office",
                    amount: Number(collection.amount_paid ?? paidAmount),
                    method: collection.payment_method ?? "cash",
                    paymentType: collection.type ?? "rent",
                    recordedBy: entryMode === "collector" ? `Entered by ${actorLabel}` : actorLabel,
                    balanceAfter: remainingBalance,
                    dateChangeRequestId: null,
                    dateChangeRequestStatus: null,
                    requestedPaymentDate: null,
                    correctionRequestId: null,
                    correctionRequestStatus: null,
                    correctionRequestType: null,
                    isCorrected: false,
                    correctionHistoryCount: 0,
                    roomId: selectedTenant.room?.id ?? null,
                    tenantId: selectedTenant.tenant.id,
                };
                setRecentPayments((current) => [...current.filter((payment) => payment.id !== optimisticPayment.id), optimisticPayment]);
                flashLatestPayment(optimisticPayment.id);
                setMessage(`Payment recorded for room ${roomLabel(selectedTenant)}.`);
                clearForNextPayment();
                void loadRecentPayments(paymentDate);
                void loadAdvanceRentAssistant(paymentDate);
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Payment could not be recorded.");
            }
        });
    }

    function openCorrectionRequest(payment: FastPaymentRecentItem, type: CorrectionType) {
        setMessage(null);
        setCorrectionPayment(payment);
        setCorrectionType(type);
        setRequestedValue(type === "date_change" ? payment.paymentDate ?? paymentDate : type === "amount_change" ? String(payment.amount) : type === "remove_payment" ? "Remove payment" : "");
        setCorrectionReason("");
    }

    function submitCorrectionRequest() {
        if (!correctionPayment) return;
        startTransition(async () => {
            try {
                setMessage(null);
                if (isAdmin) {
                    const result = await adminCorrectPayment({
                        correctionType,
                        correctedAmount: correctionType === "amount_change" ? Number(requestedValue) : undefined,
                        correctedPaymentDate: correctionType === "date_change" ? requestedValue : undefined,
                        correctedRoomNumber: correctionType === "room_change" ? requestedValue : undefined,
                        paymentId: correctionPayment.id,
                        reason: correctionReason,
                    });
                    setRecentPayments((current) => current.map((payment) => payment.id === correctionPayment.id
                        ? {
                            ...payment,
                            amount: correctionType === "amount_change" ? Number(result.payment.amount_paid ?? result.payment.amount ?? payment.amount) : payment.amount,
                            balanceAfter: Number(result.payment.balance ?? payment.balanceAfter),
                            correctionHistoryCount: payment.correctionHistoryCount + 1,
                            correctionRequestId: result.correction.id,
                            correctionRequestStatus: "approved" as const,
                            correctionRequestType: correctionType,
                            isCorrected: true,
                            paymentDate: correctionType === "date_change" ? String(result.payment.payment_date ?? requestedValue).slice(0, 10) : payment.paymentDate,
                            roomId: correctionType === "room_change" ? result.payment.room_id ?? payment.roomId : payment.roomId,
                            tenantId: correctionType === "room_change" ? result.payment.tenant_id ?? payment.tenantId : payment.tenantId,
                        }
                        : payment).filter((payment) => correctionType === "remove_payment" ? payment.id !== correctionPayment.id : true));
                    setMessage("Payment corrected successfully.");
                } else {
                    const request = await requestPaymentCorrection({
                        correctionType,
                        paymentId: correctionPayment.id,
                        reason: correctionReason,
                        requestedAmount: correctionType === "amount_change" ? Number(requestedValue) : undefined,
                        requestedPaymentDate: correctionType === "date_change" ? requestedValue : undefined,
                        requestedRoomNumber: correctionType === "room_change" ? requestedValue : undefined,
                    });
                    setRecentPayments((current) => current.map((payment) => payment.id === correctionPayment.id
                        ? {
                            ...payment,
                            correctionRequestId: request.id,
                            correctionRequestStatus: "pending",
                            correctionRequestType: correctionType,
                            correctionHistoryCount: payment.correctionHistoryCount + 1,
                        }
                        : payment));
                    setMessage("Payment correction request sent to Admin for approval.");
                }
                setCorrectionPayment(null);
                setCorrectionReason("");
                void loadRecentPayments(paymentDate);
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Payment correction could not be saved.");
            }
        });
    }

    async function openCorrectionHistory(payment: FastPaymentRecentItem) {
        setHistoryPayment(payment);
        setLoadingHistory(true);
        try {
            const response = await fetch(`/api/collections/payment-corrections?paymentId=${encodeURIComponent(payment.id)}`, { cache: "no-store" });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error ?? "Correction history could not load.");
            setHistoryRows(payload.history ?? []);
        } catch (error) {
            setHistoryRows([]);
            setMessage(error instanceof Error ? error.message : "Correction history could not load.");
        } finally {
            setLoadingHistory(false);
        }
    }

    return (
        <main className="enterprise-page">
            <div className="enterprise-shell">
                <section className="mx-auto max-w-5xl overflow-hidden rounded-[28px] border border-white/10 bg-slate-950 p-5 text-white shadow-2xl shadow-black/25">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-black uppercase text-cyan-100">
                                <ShieldCheck size={14} />
                                {entryMode === "collector" ? "Collector tenant payments" : isAdmin ? "Admin tenant payments" : "Office tenant payments"}
                            </div>
                            <h1 className="mt-3 text-3xl font-black sm:text-4xl">Tenant Payments Entry</h1>
                            <p className="mt-1 text-sm font-semibold text-slate-300">
                                {activeCompany?.name ?? "Company"} · {entryMode === "collector" || isAdmin ? "All offices" : activeOffice?.office_name ?? activeOffice?.name ?? "Active office"}
                            </p>
                        </div>
                        <label className="block sm:w-60">
                            <span className="text-xs font-black uppercase tracking-wide text-slate-300">Selected payment date</span>
                            <input
                                type="date"
                                value={paymentDate}
                                onChange={(event) => setPaymentDate(event.target.value)}
                                className="mt-1 h-13 w-full rounded-2xl border border-white/10 bg-white px-4 text-base font-black text-slate-950 outline-none"
                            />
                        </label>
                    </div>
                </section>

                <section className="mx-auto mt-5 max-w-6xl rounded-[30px] border border-white/70 bg-white p-5 shadow-2xl shadow-slate-950/20">
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                        <label className="block">
                            <span className="text-xs font-black uppercase tracking-wide text-slate-500">Room / tenant / phone</span>
                            <div className="relative mt-1">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={19} />
	                                <input
	                                    ref={roomInputRef}
	                                    value={roomQuery}
	                                    onChange={(event) => {
	                                        setRoomQuery(event.target.value);
	                                        setSelectedTenant(null);
	                                        setRoomMatchesOpen(true);
	                                    }}
	                                    placeholder="Type room, tenant name, or phone"
	                                    className="h-16 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-4 text-2xl font-black text-slate-950 outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
	                                />
	                                {searching ? <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-blue-600" size={20} /> : null}
	                            </div>
	                        </label>

                        <label className="block">
                            <span className="text-xs font-black uppercase tracking-wide text-slate-500">Amount paid</span>
                            <input
                                ref={amountInputRef}
                                value={amount}
                                onChange={(event) => setAmount(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") savePayment(false);
                                }}
                                type="number"
                                min="0"
                                placeholder="UGX"
                                className="mt-1 h-16 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-2xl font-black text-slate-950 outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
                            />
	                        </label>
	                    </div>
	
	                    {roomMatchesOpen && results.length > 1 ? (
	                        <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-3">
	                            <p className="text-sm font-black text-blue-950">Choose the correct room match.</p>
	                            <div className="mt-2 grid max-h-64 gap-2 overflow-auto sm:grid-cols-2">
	                                {results.map((result) => (
	                                    <button
	                                        key={`${result.tenant.id}:${result.room?.id ?? "no-room"}`}
	                                        type="button"
	                                        onClick={() => selectRoomMatch(result)}
	                                        className="rounded-xl border border-blue-100 bg-white p-3 text-left text-sm font-bold transition hover:border-blue-400 hover:shadow-sm"
	                                    >
	                                        <span className="flex items-center justify-between gap-2">
	                                            <span className="text-base font-black text-slate-950">Room {roomLabel(result)}</span>
	                                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black uppercase text-slate-600">
	                                                {result.room?.status ?? "active"}
	                                            </span>
	                                        </span>
	                                        <span className="mt-1 block text-slate-700">{result.tenant.full_name ?? "Unnamed tenant"}</span>
                                            <span className="mt-0.5 block text-xs text-slate-500">{result.tenant.phone ?? "No phone recorded"}</span>
	                                        <span className="mt-1 block text-xs text-slate-500">
	                                            {result.landlord?.full_name ?? "No landlord"} · Balance {money(liveOutstandingBalance(result))}
	                                            {isAdmin ? ` · ${result.office?.office_name ?? result.office?.name ?? "No office"}` : ""}
	                                        </span>
	                                    </button>
	                                ))}
	                            </div>
	                        </div>
	                    ) : null}

                    <TenantBalance isAdmin={isAdmin} onEditOutstanding={openBalanceAdjustmentModal} tenant={selectedTenant} />

                    {selectedTenant ? (
                        <div className="mt-4">
                            <TenantContactCard
                                landlordName={selectedTenant.landlord?.full_name}
                                officeName={selectedTenant.office?.office_name ?? selectedTenant.office?.name}
                                onSaved={handleTenantContactSaved}
                                roomNumber={selectedTenant.room?.room_number}
                                tenantId={selectedTenant.tenant.id}
                                tenantName={selectedTenant.tenant.full_name}
                                tenantPhone={selectedTenant.tenant.phone}
                            />
                        </div>
                    ) : null}

                    {selectedTenant ? (
                        <div className="mt-4 flex flex-col gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <p className="text-sm font-black text-slate-950">Tenant replacement</p>
                                <p className="mt-1 text-xs font-bold text-slate-500">
                                    Vacate the current tenant, keep their history separate, and add a new tenant to this room.
                                </p>
                            </div>
                            <button
                                type="button"
                                disabled={!canPostPayments || selectedOfficeMismatch || isPending}
                                onClick={openNewTenantModal}
                                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white shadow-lg shadow-slate-200 transition hover:-translate-y-0.5 disabled:opacity-40"
                            >
                                <UserPlus size={17} />
                                New Tenant
                            </button>
                        </div>
                    ) : null}

                    <AdvanceRentAssistantPanel items={assistantItems} loading={assistantLoading} />

                    {duplicateWarning ? (
                            <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-start gap-2 text-sm font-bold text-amber-900">
                                    <AlertTriangle className="mt-0.5 shrink-0" size={18} />
                                    <span>This room already has a payment today.</span>
                                </div>
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => savePayment(true)} disabled={isPending} className="h-10 rounded-xl bg-amber-600 px-4 text-sm font-black text-white shadow">
                                        Add another payment
                                    </button>
                                    <button type="button" onClick={() => setDuplicateWarning(null)} className="h-10 rounded-xl bg-white px-4 text-sm font-black text-amber-900 shadow">
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : null}

                    {message ? <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">{message}</p> : null}
                    {allocationMessage ? <p className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-800">{allocationMessage}</p> : null}

                    <div className="mt-5 flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => savePayment(false)}
                            disabled={!canPostPayments || !selectedTenant || selectedOfficeMismatch || isPending}
                            className="inline-flex h-13 items-center gap-2 rounded-2xl bg-emerald-600 px-7 text-base font-black text-white shadow-lg shadow-emerald-100 transition hover:-translate-y-0.5 disabled:opacity-40"
                        >
                            {isPending ? <Loader2 className="animate-spin" size={18} /> : <ReceiptText size={18} />}
                            Record Payment
                        </button>
                        <span className="text-xs font-bold text-slate-500">Press Enter in Amount Paid to record.</span>
                    </div>
                </section>

                <section className="mx-auto mt-5 max-w-6xl space-y-4">
	                    <RecordedPaymentsTable
                            ledgerMethod={ledgerMethod}
                            ledgerPage={ledgerPage}
                            ledgerPageSize={ledgerPageSize}
                            ledgerSearch={ledgerSearch}
                            latestPaymentId={latestPaymentId}
                            loading={loadingRecent}
                            isAdmin={isAdmin}
                            onMethodChange={(value) => {
                                setLedgerMethod(value);
                                setLedgerPage(1);
                            }}
                            onPageChange={setLedgerPage}
                            onPageSizeChange={(value) => {
                                setLedgerPageSize(value);
                                setLedgerPage(1);
                            }}
                            onSearchChange={(value) => {
                                setLedgerSearch(value);
                                setLedgerPage(1);
                            }}
                            onViewHistory={openCorrectionHistory}
                            onRequestCorrection={openCorrectionRequest}
                            payments={recentPayments}
                            totalPages={ledgerTotalPages}
                            totalRows={recentTotals.totalRows}
	                    />
	                    <PaymentTotals totals={recentTotals} />
                </section>
            </div>
            <PaymentCorrectionRequestModal
                correctionType={correctionType}
                isPending={isPending}
                onClose={() => {
                    if (!isPending) setCorrectionPayment(null);
                }}
                onReasonChange={setCorrectionReason}
                onRequestedValueChange={setRequestedValue}
                onSubmit={submitCorrectionRequest}
                isAdmin={isAdmin}
                payment={correctionPayment}
                reason={correctionReason}
                requestedValue={requestedValue}
            />
            <CorrectionHistoryModal
                loading={loadingHistory}
                onClose={() => {
                    setHistoryPayment(null);
                    setHistoryRows([]);
                }}
                payment={historyPayment}
                rows={historyRows}
            />
            <NewTenantModal
                form={newTenantForm}
                isPending={isPending}
                onChange={(patch) => setNewTenantForm((current) => ({ ...current, ...patch }))}
                onClose={() => {
                    if (!isPending) setNewTenantOpen(false);
                }}
                error={newTenantError}
                onSubmit={submitNewTenant}
                open={newTenantOpen}
                paymentDate={paymentDate}
                tenant={selectedTenant}
            />
            <BalanceAdjustmentModal
                error={balanceAdjustmentError}
                form={balanceAdjustmentForm}
                isAdmin={isAdmin}
                isPending={isPending}
                onChange={(patch) => setBalanceAdjustmentForm((current) => ({ ...current, ...patch }))}
                onClose={() => {
                    if (!isPending) setBalanceAdjustmentOpen(false);
                }}
                onSubmit={submitBalanceAdjustment}
                open={balanceAdjustmentOpen}
                tenant={selectedTenant}
            />
        </main>
    );
}

function NewTenantModal({
    error,
    form,
    isPending,
    onChange,
    onClose,
    onSubmit,
    open,
    paymentDate,
    tenant,
}: {
    error: string | null;
    form: NewTenantForm;
    isPending: boolean;
    onChange: (patch: Partial<NewTenantForm>) => void;
    onClose: () => void;
    onSubmit: () => void;
    open: boolean;
    paymentDate: string;
    tenant: CollectionTenantResult | null;
}) {
    if (!open || !tenant) return null;
    const outstanding = liveOutstandingBalance(tenant);
    const paymentMade = Math.max(0, Number(form.paymentMade || 0));
    const monthlyRent = Math.max(0, Number(form.monthlyRent || tenant.monthlyRent || 0));
    const entryAdvance = Math.max(0, paymentMade - monthlyRent);
    const willDeductLandlord = outstanding > 0;

    return (
        <div className="fixed inset-0 z-[130] flex items-center justify-center overflow-y-auto bg-slate-950/75 p-4 backdrop-blur-sm">
            <div className="my-6 w-full max-w-4xl overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-2xl">
                <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-950 p-5 text-white">
                    <div>
                        <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-black uppercase text-cyan-100">
                            <UserPlus size={14} />
                            New tenant workflow
                        </p>
                        <h2 className="mt-3 text-2xl font-black">Replace Tenant In Room {tenant.room?.room_number ?? "Unknown"}</h2>
                        <p className="mt-1 text-sm font-semibold text-slate-300">
                            Old tenant history stays separate. New tenant starts with a fresh balance.
                        </p>
                    </div>
                    <button type="button" disabled={isPending} onClick={onClose} className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-black text-white disabled:opacity-40">
                        Close
                    </button>
                </div>

                <div className="grid gap-5 p-5 lg:grid-cols-[1.1fr_0.9fr]">
                    <div className="space-y-4">
	                        <section className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
	                            <p className="text-xs font-black uppercase text-slate-500">Step 1 · Vacate current tenant</p>
	                            <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
	                                <p className="font-black text-slate-950">Vacate with outstanding balance</p>
	                                <p className="mt-1 text-xs font-bold text-slate-600">
	                                    The old tenant debt is frozen, sent to landlord recovery, and never carried to the new tenant.
	                                </p>
	                                <div className="mt-3 grid gap-2 sm:grid-cols-3">
	                                    <MiniStat label="Current old tenant" value={tenant.tenant.full_name ?? "Unnamed tenant"} />
	                                    <MiniStat label="Current outstanding" value={money(outstanding)} tone="text-rose-700" />
	                                    <MiniStat label="Landlord recovery deduction" value={money(outstanding)} tone="text-rose-700" />
	                                </div>
	                            </div>
	                        </section>

                        <section className="rounded-3xl border border-slate-200 bg-white p-4">
                            <p className="text-xs font-black uppercase text-slate-500">Step 2 · Enter new tenant</p>
                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
	                                <TextField label="New tenant name" value={form.newTenantName} onChange={(value) => onChange({ newTenantName: value })} placeholder="Full name" />
	                                <TextField label="Phone number" value={form.newTenantPhone} onChange={(value) => onChange({ newTenantPhone: value })} placeholder="Required phone" />
                                <TextField label="National ID" value={form.nationalId} onChange={(value) => onChange({ nationalId: value })} placeholder="Optional" />
                                <TextField label="Move-in date" type="date" value={form.moveInDate} onChange={(value) => onChange({ moveInDate: value })} />
                                <TextField label="Monthly rent" type="number" value={form.monthlyRent} onChange={(value) => onChange({ monthlyRent: value })} placeholder="UGX" />
                                <TextField label="Payment made" type="number" value={form.paymentMade} onChange={(value) => onChange({ paymentMade: value })} placeholder="UGX" />
                                <label className="block">
                                    <span className="text-xs font-black uppercase text-slate-500">Payment method</span>
                                    <select
                                        value={form.paymentMethod}
                                        onChange={(event) => onChange({ paymentMethod: event.target.value })}
                                        className="mt-1 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-black text-slate-950 outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
                                    >
                                        <option value="cash">Cash</option>
                                        <option value="mobile_money">Mobile money</option>
                                        <option value="bank">Bank</option>
                                        <option value="cheque">Cheque</option>
                                    </select>
                                </label>
                                <TextField label="Reference / note" value={form.referenceNumber} onChange={(value) => onChange({ referenceNumber: value })} placeholder="Optional" />
                            </div>
                            <label className="mt-3 block">
                                <span className="text-xs font-black uppercase text-slate-500">Reason / notes</span>
                                <textarea
                                    value={form.notes}
                                    onChange={(event) => onChange({ notes: event.target.value })}
                                    placeholder="Why the old tenant is leaving, or any entry-payment note..."
                                    className="mt-1 min-h-24 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-950 outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
                                />
                            </label>
                        </section>
                    </div>

                    <aside className="space-y-3">
                        <div className="rounded-3xl border border-slate-800 bg-slate-950 p-4 text-white">
                            <div className="flex items-center gap-2">
                                <BrainCircuit size={18} className="text-cyan-200" />
                                <p className="text-sm font-black">AI guidance</p>
                            </div>
                            <div className="mt-4 space-y-3">
                                <ModalMetric label="Current tenant" value={tenant.tenant.full_name ?? "Unnamed tenant"} />
                                <ModalMetric label="Current outstanding" value={money(outstanding)} />
                                <ModalMetric label="Landlord recovery" value={willDeductLandlord ? money(outstanding) : money(0)} tone={willDeductLandlord ? "text-rose-200" : "text-emerald-200"} />
	                                <ModalMetric label="New tenant opening balance" value={money(0)} />
                                <ModalMetric label="Entry advance rent" value={money(entryAdvance)} tone={entryAdvance > 0 ? "text-violet-200" : "text-slate-200"} />
                            </div>
                            <p className="mt-4 rounded-2xl bg-white/10 px-3 py-2 text-xs font-bold text-slate-200">
	                                Old tenant debt will be frozen and recovered from landlord payable. It will not carry to the new tenant.
                            </p>
                            {entryAdvance > 0 ? (
                                <p className="mt-2 rounded-2xl bg-violet-400/15 px-3 py-2 text-xs font-bold text-violet-100">
                                    Entry payment is above the first month rent. The extra will be allocated by the tenant rent allocation engine.
                                </p>
                            ) : null}
                        </div>
                        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                            <p className="text-xs font-black uppercase text-slate-500">Ledger impact</p>
                            <p className="mt-2 text-sm font-bold text-slate-700">
                                Payment date stays <span className="font-black text-slate-950">{paymentDate}</span>. Any entry payment will appear in the selected-date ledger.
                            </p>
                        </div>
                    </aside>
                </div>

	                <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 p-5">
	                    {error ? (
	                        <div className="mr-auto w-full rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-black text-rose-700 lg:w-auto">
	                            {error}
	                        </div>
	                    ) : null}
	                    <button type="button" disabled={isPending} onClick={onClose} className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-slate-700 shadow disabled:opacity-40">
	                        Cancel
	                    </button>
	                    <button type="button" disabled={isPending} onClick={onSubmit} className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-lg disabled:opacity-40">
	                        {isPending ? <Loader2 className="animate-spin" size={16} /> : <UserPlus size={16} />}
	                        {isPending ? "Saving..." : "Complete New Tenant"}
	                    </button>
                </div>
            </div>
        </div>
    );
}

function BalanceAdjustmentModal({
    error,
    form,
    isAdmin,
    isPending,
    onChange,
    onClose,
    onSubmit,
    open,
    tenant,
}: {
    error: string | null;
    form: BalanceAdjustmentForm;
    isAdmin: boolean;
    isPending: boolean;
    onChange: (patch: Partial<BalanceAdjustmentForm>) => void;
    onClose: () => void;
    onSubmit: () => void;
    open: boolean;
    tenant: CollectionTenantResult | null;
}) {
    if (!open || !tenant) return null;
    const currentBalance = liveOutstandingBalance(tenant);
    const newBalance = Number(form.newBalance || 0);
    const delta = Number.isFinite(newBalance) ? newBalance - currentBalance : 0;

    return (
        <div className="fixed inset-0 z-[140] flex items-center justify-center overflow-y-auto bg-slate-950/75 p-4 backdrop-blur-sm">
            <div className="my-6 w-full max-w-2xl overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-2xl">
                <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-950 p-5 text-white">
                    <div>
                        <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-black uppercase text-cyan-100">
                            <Pencil size={14} />
                            Edit outstanding balance
                        </p>
                        <h2 className="mt-3 text-2xl font-black">Room {tenant.room?.room_number ?? "Unknown"}</h2>
                        <p className="mt-1 text-sm font-semibold text-slate-300">
                            {isAdmin ? "Admin adjustment applies immediately." : "Office adjustment will wait for Admin approval."}
                        </p>
                    </div>
                    <button type="button" disabled={isPending} onClick={onClose} className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-black text-white disabled:opacity-40">
                        Close
                    </button>
                </div>
                <div className="grid gap-4 p-5 sm:grid-cols-2">
                    <MiniStat label="Room number" value={tenant.room?.room_number ?? "Unknown"} />
                    <MiniStat label="Tenant name" value={tenant.tenant.full_name ?? "Unnamed tenant"} />
                    <MiniStat label="Current outstanding" value={money(currentBalance)} tone="text-rose-700" />
                    <MiniStat label="Adjustment amount" value={`${delta >= 0 ? "+" : "-"}${money(Math.abs(delta))}`} tone={delta > 0 ? "text-rose-700" : delta < 0 ? "text-emerald-700" : "text-slate-700"} />
                    <TextField label="New outstanding balance" type="number" value={form.newBalance} onChange={(value) => onChange({ newBalance: value })} placeholder="UGX" />
                    <TextField label="Effective month/date" type="date" value={form.effectiveDate} onChange={(value) => onChange({ effectiveDate: value })} />
                    <label className="sm:col-span-2 block">
                        <span className="text-xs font-black uppercase text-slate-500">Reason for change</span>
                        <input
                            value={form.reason}
                            onChange={(event) => onChange({ reason: event.target.value })}
                            placeholder="Required reason"
                            className="mt-1 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-black text-slate-950 outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
                        />
                    </label>
                    <label className="sm:col-span-2 block">
                        <span className="text-xs font-black uppercase text-slate-500">Notes</span>
                        <textarea
                            value={form.notes}
                            onChange={(event) => onChange({ notes: event.target.value })}
                            placeholder="Optional notes"
                            className="mt-1 min-h-24 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-950 outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
                        />
                    </label>
                </div>
                <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 p-5">
                    {error ? <div className="mr-auto w-full rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-black text-rose-700 lg:w-auto">{error}</div> : null}
                    <button type="button" disabled={isPending} onClick={onClose} className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-slate-700 shadow disabled:opacity-40">
                        Cancel
                    </button>
                    <button type="button" disabled={isPending} onClick={onSubmit} className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-lg disabled:opacity-40">
                        {isPending ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                        {isAdmin ? "Apply Adjustment" : "Submit for Admin Approval"}
                    </button>
                </div>
            </div>
        </div>
    );
}

function TextField({ label, onChange, placeholder, type = "text", value }: { label: string; onChange: (value: string) => void; placeholder?: string; type?: string; value: string }) {
    return (
        <label className="block">
            <span className="text-xs font-black uppercase text-slate-500">{label}</span>
            <input
                type={type}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder}
                className="mt-1 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-black text-slate-950 outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
            />
        </label>
    );
}

function ModalMetric({ label, tone = "text-white", value }: { label: string; tone?: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/10 px-3 py-2">
            <span className="text-xs font-black uppercase text-slate-400">{label}</span>
            <span className={`text-sm font-black ${tone}`}>{value}</span>
        </div>
    );
}

function MiniStat({ label, tone = "text-slate-950", value }: { label: string; tone?: string; value: string }) {
    return (
        <div className="rounded-2xl border border-white bg-white px-3 py-2">
            <p className="text-[10px] font-black uppercase text-slate-400">{label}</p>
            <p className={`mt-1 truncate text-sm font-black ${tone}`}>{value}</p>
        </div>
    );
}

function TenantBalance({ isAdmin, onEditOutstanding, tenant }: { isAdmin: boolean; onEditOutstanding: () => void; tenant: CollectionTenantResult | null }) {
    if (!tenant) {
        return (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
                <p className="font-black text-slate-800">Tenant balance will appear here.</p>
            </div>
        );
    }

    return (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-black uppercase text-slate-400">Room number</p>
                <p className="mt-1 text-2xl font-black text-slate-950">{tenant.room?.room_number ?? "Unknown"}</p>
            </div>
            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                <p className="text-xs font-black uppercase text-amber-500">Outstanding Before Last Payment</p>
                <p className="mt-1 text-2xl font-black text-amber-700">{money(tenant.previousOutstandingBeforeLastPayment)}</p>
            </div>
            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                <p className="text-xs font-black uppercase text-blue-500">Current Month Rent</p>
                <p className="mt-1 text-2xl font-black text-blue-700">{money(tenant.monthlyRent)}</p>
            </div>
            <div className="rounded-2xl border border-cyan-100 bg-cyan-50 p-4">
                <p className="text-xs font-black uppercase text-cyan-500">Current Month Paid</p>
                <p className="mt-1 text-2xl font-black text-cyan-700">{money(tenant.currentMonthPaid)}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-black uppercase text-slate-500">Last Amount Paid</p>
                <p className="mt-1 text-2xl font-black text-slate-950">{money(tenant.lastAmountPaid)}</p>
            </div>
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
                <p className="text-xs font-black uppercase text-indigo-500">Used to Clear Outstanding</p>
                <p className="mt-1 text-2xl font-black text-indigo-700">{money(tenant.amountUsedToClearOutstanding)}</p>
            </div>
            <div className="rounded-2xl border border-teal-100 bg-teal-50 p-4">
                <p className="text-xs font-black uppercase text-teal-500">Allocated to Next Month</p>
                <p className="mt-1 text-2xl font-black text-teal-700">{money(tenant.amountAllocatedToNextMonth)}</p>
            </div>
            <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4">
                <div className="flex items-start justify-between gap-3">
                    <p className="text-xs font-black uppercase text-rose-400">Outstanding Balance</p>
                    <button
                        type="button"
                        onClick={onEditOutstanding}
                        className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-white px-2.5 py-1 text-[10px] font-black uppercase text-rose-700 shadow-sm hover:border-rose-300"
                    >
                        <Pencil size={12} />
                        Edit
                    </button>
                </div>
                <p className="mt-1 text-2xl font-black text-rose-700">{money(liveOutstandingBalance(tenant))}</p>
                <p className="mt-1 text-[11px] font-bold text-rose-500">
                    {isAdmin ? "Admin changes apply instantly." : "Office changes require Admin approval."}
                </p>
            </div>
            <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
                <p className="text-xs font-black uppercase text-violet-500">Advance Rent Balance</p>
                <p className="mt-1 text-2xl font-black text-violet-700">{money(tenant.advanceRentBalance)}</p>
                {tenant.advanceRentMonths.length ? (
                    <div className="mt-2 space-y-1">
                        <p className="text-xs font-black uppercase text-violet-500">Advance Month Paid</p>
                        {tenant.advanceRentMonths.map((advanceMonth) => (
                            <p key={`${advanceMonth.month}-${advanceMonth.amount}`} className="text-xs font-black text-violet-700">
                                {advanceMonth.label}: {money(advanceMonth.amount)}
                            </p>
                        ))}
                    </div>
                ) : (
                    <p className="mt-1 text-xs font-black text-violet-500">Advance Month Paid: None</p>
                )}
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                <p className="text-xs font-black uppercase text-emerald-500">Amount to Collect Now</p>
                <p className="mt-1 text-2xl font-black text-emerald-700">{money(amountToCollect(tenant))}</p>
            </div>
            {tenant.nextMonthCoveredAmount > 0 ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 xl:col-span-4">
                    <p className="text-sm font-black text-emerald-800">
                        Tenant has {money(tenant.nextMonthCoveredAmount)} already paid toward next month.
                        {tenant.nextAdvanceRentMonth ? ` Advance month: ${tenant.nextAdvanceRentMonth}.` : ""}
                    </p>
                </div>
            ) : tenant.advanceRentBalance > 0 ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 xl:col-span-4">
                    <p className="text-sm font-black text-emerald-800">
                        Tenant has {money(tenant.advanceRentBalance)} saved as advance rent for future months.
                    </p>
                </div>
            ) : null}
            {tenant.rentMonthAllocations.length ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 xl:col-span-4">
                    <p className="text-xs font-black uppercase text-slate-500">Month-by-month payment allocation</p>
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                        {tenant.rentMonthAllocations.map((allocation) => (
                            <div key={`${allocation.month}-${allocation.allocationType}`} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2">
                                <div>
                                    <p className="text-sm font-black text-slate-950">{allocation.label}</p>
                                    <p className="text-xs font-bold text-slate-500">
                                        {allocation.status === "advance_paid" ? "Advance Paid" : allocation.status === "paid" ? "Paid" : "Partially Paid"} {money(allocation.amountPaid)} / {money(allocation.amountDue)}
                                    </p>
                                    {allocation.previouslyPaidAmount > 0 ? (
                                        <p className="mt-0.5 text-[11px] font-bold text-slate-400">
                                            Includes previous {money(allocation.previouslyPaidAmount)} + last payment {money(allocation.lastPaymentAmount)}
                                        </p>
                                    ) : null}
                                </div>
                                <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black uppercase ${allocation.status === "partial" ? "bg-amber-100 text-amber-800" : allocation.status === "advance_paid" ? "bg-violet-100 text-violet-800" : "bg-emerald-100 text-emerald-800"}`}>
                                    {allocation.status === "advance_paid" ? "Advance" : allocation.status}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

function AdvanceRentAssistantPanel({ items, loading }: { items: AdvanceRentAssistantItem[]; loading: boolean }) {
    const advanceCount = items.filter((item) => item.type === "advance_rent" || item.type === "prepaid_multiple_months").length;
    const mismatchCount = items.filter((item) => item.type === "allocation_mismatch" || item.type === "coverage_mismatch").length;

    return (
        <section className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-950 text-white">
                        <BrainCircuit size={20} />
                    </span>
                    <div>
                        <p className="text-sm font-black text-slate-950">AI Advance Rent Assistant</p>
                        <p className="text-xs font-bold text-slate-500">Live Supabase scan for prepaid rooms and allocation mismatches.</p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-black">
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-800">{advanceCount} advance rooms</span>
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-900">{mismatchCount} review items</span>
                </div>
            </div>

            {loading ? (
                <div className="mt-3 flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-600">
                    <Loader2 className="animate-spin" size={16} />
                    Checking advance rent allocations...
                </div>
            ) : items.length ? (
                <div className="mt-3 grid gap-2 lg:grid-cols-2">
                    {items.slice(0, 6).map((item) => (
                        <div key={item.id} className={`rounded-2xl border p-3 ${assistantBadgeClass(item.severity)}`}>
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-sm font-black">Room {item.roomNumber}</p>
                                    <p className="mt-1 text-xs font-bold opacity-80">{item.tenantName} · {item.officeName}</p>
                                </div>
                                <span className="shrink-0 rounded-full bg-white/70 px-2 py-1 text-[10px] font-black uppercase">
                                    {item.type.replaceAll("_", " ")}
                                </span>
                            </div>
                            <p className="mt-2 text-xs font-bold">{item.message}</p>
                            <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] font-black">
                                <span>Rent {money(item.monthlyRent)}</span>
                                <span>Paid {money(item.currentMonthPaid)}</span>
                                <span>Advance {money(item.advanceRentBalance)}</span>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="mt-3 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-600">No advance-rent mismatches found for the selected month.</p>
            )}
        </section>
    );
}

function RecordedPaymentsTable({
    ledgerMethod,
    ledgerPage,
    ledgerPageSize,
    ledgerSearch,
    payments,
    loading,
    latestPaymentId,
    isAdmin,
    onMethodChange,
    onPageChange,
    onPageSizeChange,
    onSearchChange,
    onRequestCorrection,
    onViewHistory,
    totalPages,
    totalRows,
}: {
    ledgerMethod: string;
    ledgerPage: number;
    ledgerPageSize: number;
    ledgerSearch: string;
    payments: FastPaymentRecentItem[];
    loading: boolean;
    latestPaymentId: string | null;
    isAdmin: boolean;
    onMethodChange: (value: string) => void;
    onPageChange: (value: number) => void;
    onPageSizeChange: (value: number) => void;
    onSearchChange: (value: string) => void;
    onRequestCorrection: (payment: FastPaymentRecentItem, type: CorrectionType) => void;
    onViewHistory: (payment: FastPaymentRecentItem) => void;
    totalPages: number;
    totalRows: number;
}) {
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const bottomRef = useRef<HTMLTableRowElement | null>(null);

    useEffect(() => {
        if (!latestPaymentId) return;
        bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, [latestPaymentId, payments.length]);

    return (
        <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl shadow-slate-950/25">
            <div className="flex flex-col gap-3 border-b border-white/10 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <p className="text-xs font-black uppercase tracking-wide text-cyan-300">Selected date ledger</p>
                    <h2 className="text-lg font-black text-white">Recorded Payments</h2>
                </div>
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px_120px] lg:w-[580px]">
                    <label className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                        <input
                            value={ledgerSearch}
                            onChange={(event) => onSearchChange(event.target.value)}
                            placeholder="Search room or tenant"
                            className="h-9 w-full rounded-xl border border-white/10 bg-white/10 pl-9 pr-3 text-xs font-bold text-white outline-none placeholder:text-slate-400 focus:border-cyan-300"
                        />
                    </label>
                    <select
                        value={ledgerMethod}
                        onChange={(event) => onMethodChange(event.target.value)}
                        className="h-9 rounded-xl border border-white/10 bg-slate-900 px-3 text-xs font-black text-white outline-none focus:border-cyan-300"
                    >
                        <option value="all">All methods</option>
                        <option value="cash">Cash</option>
                        <option value="mobile_money">Mobile money</option>
                        <option value="bank">Bank</option>
                        <option value="cheque">Cheque</option>
                    </select>
                    <select
                        value={ledgerPageSize}
                        onChange={(event) => onPageSizeChange(Number(event.target.value))}
                        className="h-9 rounded-xl border border-white/10 bg-slate-900 px-3 text-xs font-black text-white outline-none focus:border-cyan-300"
                    >
                        <option value={10}>10 rows</option>
                        <option value={25}>25 rows</option>
                        <option value={50}>50 rows</option>
                    </select>
                </div>
            </div>
            <div ref={scrollRef} className="max-h-[390px] overflow-auto scroll-smooth bg-slate-900">
                <table className="w-full min-w-[1040px] border-separate border-spacing-0 text-left text-xs">
                    <thead className="sticky top-0 z-10 bg-slate-950 text-[10px] uppercase tracking-wide text-slate-300">
                        <tr>
                            <th className="px-3 py-2">Time</th>
                            <th className="px-3 py-2">Room</th>
                            <th className="px-3 py-2">Tenant</th>
                            <th className="px-3 py-2 text-right">Amount Paid</th>
                            <th className="px-3 py-2 text-right">Remaining Balance</th>
                            <th className="px-3 py-2">Payment Method</th>
                            <th className="px-3 py-2">Recorded By</th>
                            <th className="px-3 py-2">Status</th>
                            <th className="px-3 py-2 text-right">Actions</th>
		                        </tr>
                    </thead>
                    <tbody>
                        {payments.length ? payments.map((payment) => (
                            <tr
                                key={payment.id}
                                className={`transition-colors duration-700 ${payment.id === latestPaymentId ? "bg-emerald-500/20 ring-1 ring-inset ring-emerald-300" : "bg-slate-900 hover:bg-slate-800/80"}`}
                            >
                                <td className="border-b border-white/5 px-3 py-2 font-bold text-slate-400">{payment.paidAt ? new Date(payment.paidAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--"}</td>
                                <td className="border-b border-white/5 px-3 py-2 font-black text-white">{payment.roomNumber}</td>
                                <td className="border-b border-white/5 px-3 py-2 font-bold text-slate-200">{payment.tenantName}</td>
                                <td className="border-b border-white/5 px-3 py-2 text-right font-black text-emerald-300">{money(payment.amount)}</td>
                                <td className="border-b border-white/5 px-3 py-2 text-right font-black text-amber-300">{money(payment.balanceAfter)}</td>
                                <td className="border-b border-white/5 px-3 py-2 font-bold capitalize text-slate-300">{payment.method.replaceAll("_", " ")}</td>
                                <td className="border-b border-white/5 px-3 py-2 font-bold text-slate-400">{payment.recordedBy}</td>
                                <td className="border-b border-white/5 px-3 py-2">
                                    <CorrectionStatus payment={payment} />
                                </td>
                                <td className="border-b border-white/5 px-3 py-2 text-right">
                                    <div className="flex flex-nowrap justify-end gap-1">
                                        <CorrectionIconButton disabled={false} icon={Eye} label="View" onClick={() => onViewHistory(payment)} />
                                        <CorrectionIconButton disabled={!isAdmin && payment.correctionRequestStatus === "pending"} icon={CalendarDays} label="Date correction" onClick={() => onRequestCorrection(payment, "date_change")} />
                                        <CorrectionIconButton disabled={!isAdmin && payment.correctionRequestStatus === "pending"} icon={Pencil} label="Amount correction" onClick={() => onRequestCorrection(payment, "amount_change")} />
                                        <CorrectionIconButton disabled={!isAdmin && payment.correctionRequestStatus === "pending"} icon={Home} label="Room correction" onClick={() => onRequestCorrection(payment, "room_change")} />
                                        <CorrectionIconButton danger disabled={!isAdmin && payment.correctionRequestStatus === "pending"} icon={Trash2} label="Remove payment" onClick={() => onRequestCorrection(payment, "remove_payment")} />
                                        <CorrectionIconButton disabled={false} icon={History} label="History" onClick={() => onViewHistory(payment)} />
                                    </div>
                                </td>
		                            </tr>
                        )) : (
                            <tr>
                                <td colSpan={9} className="px-4 py-8 text-center font-bold text-slate-400">
                                    {loading ? "Loading payments..." : "No payments recorded for this date yet."}
                                </td>
                            </tr>
                        )}
	                        <tr ref={bottomRef} aria-hidden="true">
	                            <td colSpan={9} className="h-0 p-0" />
	                        </tr>
                    </tbody>
                </table>
            </div>
            <div className="flex flex-col gap-2 border-t border-white/10 bg-slate-950 px-4 py-3 text-xs font-black text-slate-300 sm:flex-row sm:items-center sm:justify-between">
                <span>{loading ? "Loading..." : `Showing ${payments.length} of ${totalRows.toLocaleString()} rows`}</span>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        disabled={ledgerPage <= 1 || loading}
                        onClick={() => onPageChange(Math.max(1, ledgerPage - 1))}
                        className="h-8 rounded-lg border border-white/10 px-3 text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        Prev
                    </button>
                    <span className="rounded-lg bg-white/10 px-3 py-2 text-white">Page {ledgerPage} / {totalPages}</span>
                    <button
                        type="button"
                        disabled={ledgerPage >= totalPages || loading}
                        onClick={() => onPageChange(Math.min(totalPages, ledgerPage + 1))}
                        className="h-8 rounded-lg border border-white/10 px-3 text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        Next
                    </button>
                </div>
            </div>
        </div>
    );
}

function CorrectionStatus({ payment }: { payment: FastPaymentRecentItem }) {
    const typeLabel = payment.correctionRequestType?.replaceAll("_", " ") ?? "correction";
    if (payment.correctionRequestStatus === "pending") {
        return (
            <span className="inline-flex rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-black uppercase text-amber-200">
                Pending {typeLabel}
            </span>
        );
    }
    if (payment.correctionRequestStatus === "approved") {
        return <span className="inline-flex rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-200">Corrected</span>;
    }
    if (payment.correctionRequestStatus === "rejected") {
        return <span className="inline-flex rounded-full bg-red-400/15 px-2 py-0.5 text-[10px] font-black uppercase text-red-200">Rejected</span>;
    }
    if (payment.isCorrected) {
        return <span className="inline-flex rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-200">Corrected</span>;
    }
    return <span className="text-[10px] font-bold uppercase text-slate-500">Active</span>;
}

function CorrectionIconButton({ danger = false, disabled, icon: Icon, label, onClick }: { danger?: boolean; disabled: boolean; icon: LucideIcon; label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
            title={disabled ? "Pending correction" : label}
            className={`grid h-8 w-8 place-items-center rounded-lg border text-white transition disabled:cursor-not-allowed disabled:opacity-35 ${danger ? "border-rose-400/30 bg-rose-500/15 hover:bg-rose-500/25" : "border-cyan-300/20 bg-white/10 hover:bg-white/20"}`}
        >
            <Icon size={14} />
        </button>
    );
}

function PaymentCorrectionRequestModal({
    correctionType,
    isAdmin,
    isPending,
    onClose,
    onReasonChange,
    onRequestedValueChange,
    onSubmit,
    payment,
    reason,
    requestedValue,
}: {
    correctionType: CorrectionType;
    isAdmin: boolean;
    isPending: boolean;
    onClose: () => void;
    onReasonChange: (value: string) => void;
    onRequestedValueChange: (value: string) => void;
    onSubmit: () => void;
    payment: FastPaymentRecentItem | null;
    reason: string;
    requestedValue: string;
}) {
    if (!payment) return null;
    const labels = {
        date_change: {
            title: isAdmin ? "Correct Payment Date" : "Request Date Change",
            eyebrow: isAdmin ? "Admin Direct Correction" : "Payment Date Correction",
            current: "Current Payment Date",
            requested: isAdmin ? "Correct Payment Date" : "Requested Correct Date",
            type: "date",
            placeholder: "Explain why this payment date needs correction...",
        },
        amount_change: {
            title: isAdmin ? "Correct Payment Amount" : "Request Amount Change",
            eyebrow: isAdmin ? "Admin Direct Correction" : "Payment Amount Correction",
            current: "Current Amount",
            requested: isAdmin ? "Correct Amount" : "Requested Correct Amount",
            type: "number",
            placeholder: "Explain why this payment amount needs correction...",
        },
        room_change: {
            title: isAdmin ? "Correct Payment Room" : "Request Room Change",
            eyebrow: isAdmin ? "Admin Direct Correction" : "Payment Room Correction",
            current: "Current Room",
            requested: isAdmin ? "Correct Room Number" : "Requested Correct Room Number",
            type: "text",
            placeholder: "Explain why this payment belongs to another room...",
        },
        remove_payment: {
            title: isAdmin ? "Remove Payment" : "Request Payment Removal",
            eyebrow: isAdmin ? "Admin Direct Removal" : "Payment Removal Request",
            current: "Current Payment",
            requested: "Requested Action",
            type: "text",
            placeholder: "Explain why this payment should be removed...",
        },
    }[correctionType];
    const currentValue = correctionType === "date_change"
        ? payment.paymentDate ?? "Missing payment date"
            : correctionType === "amount_change"
                ? money(payment.amount)
                : correctionType === "room_change"
                    ? payment.roomNumber
                    : `${payment.roomNumber} · ${money(payment.amount)} · ${payment.paymentDate ?? "No date"}`;
    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
            <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white shadow-2xl">
                <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
                    <div>
                        <p className="text-xs font-black uppercase text-blue-700">{labels.eyebrow}</p>
                        <h2 className="mt-1 text-2xl font-black text-slate-950">{labels.title}</h2>
                        <p className="mt-1 text-sm font-semibold text-slate-500">
                            {isAdmin ? "This correction applies immediately and is saved in audit history." : "Admin must approve before this completed payment is changed."}
                        </p>
                    </div>
                    <button type="button" disabled={isPending} onClick={onClose} className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-700 disabled:opacity-40">
                        Close
                    </button>
                </div>
                <div className="space-y-4 p-5">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <ModalDetail label="Room" value={payment.roomNumber} />
                        <ModalDetail label="Tenant" value={payment.tenantName} />
                        <ModalDetail label="Amount Paid" value={money(payment.amount)} />
                        <ModalDetail label={labels.current} value={currentValue} />
                    </div>
                    {correctionType !== "remove_payment" ? (
                    <label className="block">
                        <span className="text-xs font-black uppercase text-slate-500">{labels.requested}</span>
                        <input
                            type={labels.type}
                            value={requestedValue}
                            onChange={(event) => onRequestedValueChange(event.target.value)}
                            className="mt-1 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-black text-slate-950 outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
                        />
                    </label>
                    ) : (
                        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                            <p className="text-xs font-black uppercase text-red-500">{labels.requested}</p>
                            <p className="mt-1 text-sm font-black text-red-800">Void this payment after Admin approval. Pending removal will not change balances or totals.</p>
                        </div>
                    )}
                    <label className="block">
                        <span className="text-xs font-black uppercase text-slate-500">Reason / explanation</span>
                        <textarea
                            value={reason}
                            onChange={(event) => onReasonChange(event.target.value)}
                            placeholder={labels.placeholder}
                            className="mt-1 min-h-28 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-950 outline-none focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
                        />
                    </label>
                    <div className="flex flex-wrap justify-end gap-2">
                        <button type="button" disabled={isPending} onClick={onClose} className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-700 disabled:opacity-40">
                            Cancel
                        </button>
                        <button type="button" disabled={isPending} onClick={onSubmit} className="inline-flex items-center gap-2 rounded-2xl bg-blue-700 px-5 py-3 text-sm font-black text-white disabled:opacity-40">
                            {isPending ? <Loader2 className="animate-spin" size={16} /> : <CalendarDays size={16} />}
                            {correctionType === "remove_payment" ? (isAdmin ? "Remove Payment" : "Send Removal Request") : isAdmin ? "Apply Correction" : "Send To Admin"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ModalDetail({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-black uppercase text-slate-500">{label}</p>
            <p className="mt-1 text-sm font-black text-slate-950">{value}</p>
        </div>
    );
}

function CorrectionHistoryModal({
    loading,
    onClose,
    payment,
    rows,
}: {
    loading: boolean;
    onClose: () => void;
    payment: FastPaymentRecentItem | null;
    rows: CorrectionHistoryRow[];
}) {
    if (!payment) return null;

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
            <div className="w-full max-w-4xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
                <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
                    <div>
                        <p className="text-xs font-black uppercase text-emerald-700">Payment correction history</p>
                        <h2 className="mt-1 text-2xl font-black text-slate-950">{payment.roomNumber} · {payment.tenantName}</h2>
                        <p className="mt-1 text-sm font-semibold text-slate-500">Every approved, rejected, and pending correction is preserved here.</p>
                    </div>
                    <button type="button" onClick={onClose} className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-700">
                        Close
                    </button>
                </div>
                <div className="max-h-[65vh] overflow-auto p-5">
                    {loading ? (
                        <div className="flex items-center gap-2 rounded-2xl bg-slate-50 p-4 text-sm font-black text-slate-600">
                            <Loader2 className="animate-spin" size={16} />
                            Loading correction history...
                        </div>
                    ) : rows.length ? (
                        <div className="space-y-3">
                            {rows.map((row) => (
                                <div key={row.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                            <p className="text-sm font-black capitalize text-slate-950">{String(row.correction_type ?? "correction").replaceAll("_", " ")}</p>
                                            <p className="text-xs font-bold text-slate-500">{row.created_at ? new Date(row.created_at).toLocaleString() : "No timestamp"}</p>
                                        </div>
                                        <span className={`rounded-full px-2.5 py-1 text-xs font-black ${row.status === "approved" ? "bg-emerald-100 text-emerald-700" : row.status === "rejected" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>
                                            {row.status ?? "pending"}
                                        </span>
                                    </div>
                                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                        <HistoryJson label="Old value" value={row.original_value} />
                                        <HistoryJson label="New value" value={row.requested_value} />
                                    </div>
                                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                        <ModalDetail label="Reason" value={row.reason ?? "No reason provided"} />
                                        <ModalDetail label="Admin comment" value={row.admin_comment ?? "No admin comment"} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                            <p className="font-black text-slate-800">No correction history found for this payment.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function HistoryJson({ label, value }: { label: string; value: Record<string, unknown> | null }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-3">
            <p className="text-xs font-black uppercase text-slate-500">{label}</p>
            <pre className="mt-2 whitespace-pre-wrap break-words text-xs font-bold text-slate-700">{JSON.stringify(value ?? {}, null, 2)}</pre>
        </div>
    );
}

function PaymentTotals({ totals }: { totals: FastPaymentRecentTotals }) {
    const cards = [
        { label: "Total Collected", value: money(totals.totalAmount), icon: Banknote, tone: "from-emerald-500/20 to-emerald-950/40 text-emerald-200" },
        { label: "Cash Payments", value: money(totals.cashAmount), icon: Banknote, tone: "from-blue-500/20 to-blue-950/40 text-blue-200" },
        { label: "Mobile Money", value: money(totals.mobileMoneyAmount), icon: Smartphone, tone: "from-violet-500/20 to-violet-950/40 text-violet-200" },
        { label: "Outstanding Balance", value: money(totals.outstandingBalance), icon: AlertTriangle, tone: "from-amber-500/20 to-rose-950/40 text-amber-200" },
        { label: "Payment Rows", value: totals.totalRows.toLocaleString(), icon: CheckCircle2, tone: "from-slate-500/20 to-slate-950/40 text-slate-200" },
        { label: "Tenants Paid", value: totals.tenantCount.toLocaleString(), icon: ReceiptText, tone: "from-cyan-500/20 to-cyan-950/40 text-cyan-200" },
        { label: "Bank Payments", value: money(totals.bankAmount), icon: CreditCard, tone: "from-indigo-500/20 to-indigo-950/40 text-indigo-200" },
        { label: "Cheque Payments", value: money(totals.chequeAmount), icon: CreditCard, tone: "from-purple-500/20 to-purple-950/40 text-purple-200" },
    ];

    return (
        <div className="rounded-2xl border border-slate-700 bg-slate-950 p-4 shadow-2xl shadow-slate-950/20">
            <p className="text-xs font-black uppercase tracking-wide text-cyan-300">Running totals</p>
            <h2 className="text-lg font-black text-white">Selected Date</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {cards.map((total) => {
                    const Icon = total.icon;
                    return (
                        <div key={total.label} className={`rounded-xl border border-white/10 bg-gradient-to-br px-3 py-2 ${total.tone}`}>
                            <div className="flex items-center justify-between gap-2">
                                <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide">
                                    <Icon size={13} />
                                    {total.label}
                                </span>
                            </div>
                            <p className="mt-1 break-words text-base font-black text-white">{total.value}</p>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
