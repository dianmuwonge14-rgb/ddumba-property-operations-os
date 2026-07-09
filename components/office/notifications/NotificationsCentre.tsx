"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellRing, CheckCircle2, Clock3, History, XCircle } from "lucide-react";
import { decidePaymentCorrection, decideTenantOutstandingBalanceAdjustment } from "@/app/actions/collections";
import { decideLandlordPaidExpenseRequest } from "@/app/actions/expenses";
import { decideLandlordPaymentDetails } from "@/app/actions/landlords";
import { reviewLandlordBulkRoomRequest } from "@/app/actions/properties";
import { decideRoomRentChange } from "@/app/actions/room-rent";
import { PageHero, StatusChip } from "@/components/office/shared/EnterpriseUI";
import type { NotificationAuditRow, NotificationLandlordBulkRoomRequest, NotificationLandlordPaymentDetailRequest, NotificationLandlordPaymentRequest, NotificationPaymentDateRequest, NotificationRentRequest, NotificationTenantBalanceAdjustmentRequest, NotificationsCentreData } from "@/lib/notifications/data";

type Props = {
    data: NotificationsCentreData;
};

type Filter = "pending" | "approved" | "rejected";
type ApprovalQueue =
    | "rent"
    | "payment"
    | "balance"
    | "landlordPayment"
    | "landlordPaymentDetail"
    | "landlordBulkRoom";
type BulkModalState = {
    decision: "approved" | "rejected";
    ids: string[];
    queue: ApprovalQueue;
    queueLabel: string;
} | null;
type ModalState =
    | { type: "reject"; request: NotificationRentRequest }
    | { type: "reason"; request: NotificationRentRequest }
    | { type: "history"; request: NotificationRentRequest }
    | null;
type PaymentModalState =
    | { type: "reject"; request: NotificationPaymentDateRequest }
    | { type: "reason"; request: NotificationPaymentDateRequest }
    | { type: "history"; request: NotificationPaymentDateRequest }
    | null;
type BalanceAdjustmentModalState =
    | { type: "reject"; request: NotificationTenantBalanceAdjustmentRequest }
    | { type: "reason"; request: NotificationTenantBalanceAdjustmentRequest }
    | null;
type LandlordPaymentModalState =
    | { type: "reject"; request: NotificationLandlordPaymentRequest }
    | { type: "reason"; request: NotificationLandlordPaymentRequest }
    | { type: "history"; request: NotificationLandlordPaymentRequest }
    | null;
type LandlordPaymentDetailModalState =
    | { type: "reject"; request: NotificationLandlordPaymentDetailRequest }
    | { type: "reason"; request: NotificationLandlordPaymentDetailRequest }
    | { type: "history"; request: NotificationLandlordPaymentDetailRequest }
    | null;
type LandlordBulkRoomModalState =
    | { type: "details"; request: NotificationLandlordBulkRoomRequest }
    | { type: "reject"; request: NotificationLandlordBulkRoomRequest }
    | null;

function money(value: number | string | null | undefined) {
    const numeric = Number(value ?? 0);
    return `UGX ${Math.round(Number.isFinite(numeric) ? numeric : 0).toLocaleString()}`;
}

function formatDate(value: string | null | undefined) {
    if (!value) return "Not dated";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "No effective date";
    return new Intl.DateTimeFormat("en-UG", {
        dateStyle: "medium",
        timeZone: "Africa/Kampala",
    }).format(date);
}

function lookup(rows: Array<{ id: string; name: string }>, id: string | null | undefined, fallback: string) {
    if (!id) return fallback;
    return (rows ?? []).find((row) => row.id === id)?.name ?? fallback;
}

function payloadText(payload: Record<string, unknown> | null | undefined, key: string, fallback = "") {
    const value = payload?.[key];
    return String(value ?? fallback).trim();
}

function payloadAmount(payload: Record<string, unknown> | null | undefined, key: string) {
    const value = Number(payload?.[key] ?? 0);
    return Number.isFinite(value) ? value : 0;
}

function paymentLookup(data: NotificationsCentreData, id: string | null | undefined) {
    return (data.lookups.payments ?? []).find((payment) => payment.id === id) ?? null;
}

function correctionTypeName(value: string | null | undefined) {
    if (value === "amount_change") return "Amount Change";
    if (value === "room_change") return "Room Change";
    if (value === "remove_payment") return "Remove Payment";
    return "Date Change";
}

function correctionOriginalValue(data: NotificationsCentreData, request: NotificationPaymentDateRequest, paymentAmount: number) {
    if (request.correction_type === "amount_change") return money(request.original_amount ?? paymentAmount);
    if (request.correction_type === "room_change") return lookup(data.lookups.rooms, request.original_room_id ?? request.room_id, "Unknown room");
    if (request.correction_type === "remove_payment") return "Active payment";
    return formatDate(request.original_payment_date);
}

function correctionRequestedValue(data: NotificationsCentreData, request: NotificationPaymentDateRequest) {
    if (request.correction_type === "amount_change") return money(request.requested_amount ?? 0);
    if (request.correction_type === "room_change") return lookup(data.lookups.rooms, request.requested_room_id, "Requested room");
    if (request.correction_type === "remove_payment") return "Void / remove from active collections";
    return formatDate(request.requested_payment_date);
}

export default function NotificationsCentre({ data }: Props) {
    const router = useRouter();
    const [filter, setFilter] = useState<Filter>("pending");
    const [modal, setModal] = useState<ModalState>(null);
    const [paymentModal, setPaymentModal] = useState<PaymentModalState>(null);
    const [balanceAdjustmentModal, setBalanceAdjustmentModal] = useState<BalanceAdjustmentModalState>(null);
    const [landlordPaymentModal, setLandlordPaymentModal] = useState<LandlordPaymentModalState>(null);
    const [landlordPaymentDetailModal, setLandlordPaymentDetailModal] = useState<LandlordPaymentDetailModalState>(null);
    const [landlordBulkRoomModal, setLandlordBulkRoomModal] = useState<LandlordBulkRoomModalState>(null);
    const [decisionNote, setDecisionNote] = useState("");
    const [paymentDecisionNote, setPaymentDecisionNote] = useState("");
    const [balanceAdjustmentDecisionNote, setBalanceAdjustmentDecisionNote] = useState("");
    const [landlordPaymentDecisionNote, setLandlordPaymentDecisionNote] = useState("");
    const [landlordPaymentDetailDecisionNote, setLandlordPaymentDetailDecisionNote] = useState("");
    const [landlordBulkRoomDecisionNote, setLandlordBulkRoomDecisionNote] = useState("");
    const [message, setMessage] = useState<string | null>(null);
    const [actionLabel, setActionLabel] = useState<string | null>(null);
    const [bulkModal, setBulkModal] = useState<BulkModalState>(null);
    const [bulkComment, setBulkComment] = useState("");
    const [selectedRentRequestIds, setSelectedRentRequestIds] = useState<string[]>([]);
    const [selectedPaymentRequestIds, setSelectedPaymentRequestIds] = useState<string[]>([]);
    const [selectedBalanceRequestIds, setSelectedBalanceRequestIds] = useState<string[]>([]);
    const [selectedLandlordPaymentRequestIds, setSelectedLandlordPaymentRequestIds] = useState<string[]>([]);
    const [selectedLandlordPaymentDetailRequestIds, setSelectedLandlordPaymentDetailRequestIds] = useState<string[]>([]);
    const [selectedLandlordBulkRoomRequestIds, setSelectedLandlordBulkRoomRequestIds] = useState<string[]>([]);
    const [localLandlordPaymentStatuses, setLocalLandlordPaymentStatuses] = useState<Record<string, "approved" | "rejected">>({});
    const [isPending, startTransition] = useTransition();

    const safeData = {
        ...data,
        auditEvents: data.auditEvents ?? [],
        lookups: {
            landlords: data.lookups?.landlords ?? [],
            offices: data.lookups?.offices ?? [],
            rooms: data.lookups?.rooms ?? [],
            tenants: data.lookups?.tenants ?? [],
            users: data.lookups?.users ?? [],
            payments: data.lookups?.payments ?? [],
        },
        notifications: data.notifications ?? [],
        paymentDateRequests: data.paymentDateRequests ?? [],
        tenantBalanceAdjustmentRequests: data.tenantBalanceAdjustmentRequests ?? [],
        landlordPaymentRequests: data.landlordPaymentRequests ?? [],
        landlordPaymentDetailRequests: data.landlordPaymentDetailRequests ?? [],
        landlordBulkRoomRequests: data.landlordBulkRoomRequests ?? [],
        requests: data.requests ?? [],
    };

    const requests = safeData.requests;
    const paymentDateRequests = safeData.paymentDateRequests;
    const pendingRequests = requests.filter((request) => request.status === "pending");
    const approvedRequests = requests.filter((request) => request.status === "approved" || request.status === "direct_admin_change");
    const rejectedRequests = requests.filter((request) => request.status === "rejected");
    const visibleRequests = filter === "pending" ? pendingRequests : filter === "approved" ? approvedRequests : rejectedRequests;
    const pendingPaymentDateRequests = paymentDateRequests.filter((request) => request.status === "pending");
    const approvedPaymentDateRequests = paymentDateRequests.filter((request) => request.status === "approved");
    const rejectedPaymentDateRequests = paymentDateRequests.filter((request) => request.status === "rejected");
    const visiblePaymentDateRequests = filter === "pending"
        ? pendingPaymentDateRequests
        : filter === "approved"
            ? approvedPaymentDateRequests
            : rejectedPaymentDateRequests;
    const pendingBalanceAdjustmentRequests = safeData.tenantBalanceAdjustmentRequests.filter((request) => request.status === "pending");
    const approvedBalanceAdjustmentRequests = safeData.tenantBalanceAdjustmentRequests.filter((request) => request.status === "approved" || request.status === "direct_admin_change");
    const rejectedBalanceAdjustmentRequests = safeData.tenantBalanceAdjustmentRequests.filter((request) => request.status === "rejected");
    const visibleBalanceAdjustmentRequests = filter === "pending"
        ? pendingBalanceAdjustmentRequests
        : filter === "approved"
            ? approvedBalanceAdjustmentRequests
            : rejectedBalanceAdjustmentRequests;
    const landlordPaymentRequests = safeData.landlordPaymentRequests.map((request) => {
        const localStatus = localLandlordPaymentStatuses[request.id];
        return localStatus ? { ...request, status: localStatus } : request;
    });
    const pendingLandlordPaymentRequests = landlordPaymentRequests.filter((request) => request.status === "pending");
    const approvedLandlordPaymentRequests = landlordPaymentRequests.filter((request) => request.status === "approved");
    const rejectedLandlordPaymentRequests = landlordPaymentRequests.filter((request) => request.status === "rejected");
    const visibleLandlordPaymentRequests = filter === "pending"
        ? pendingLandlordPaymentRequests
        : filter === "approved"
            ? approvedLandlordPaymentRequests
            : rejectedLandlordPaymentRequests;
    const pendingLandlordPaymentDetailRequests = safeData.landlordPaymentDetailRequests.filter((request) => request.status === "pending");
    const approvedLandlordPaymentDetailRequests = safeData.landlordPaymentDetailRequests.filter((request) => request.status === "approved");
    const rejectedLandlordPaymentDetailRequests = safeData.landlordPaymentDetailRequests.filter((request) => request.status === "rejected");
    const visibleLandlordPaymentDetailRequests = filter === "pending"
        ? pendingLandlordPaymentDetailRequests
        : filter === "approved"
            ? approvedLandlordPaymentDetailRequests
            : rejectedLandlordPaymentDetailRequests;
    const pendingLandlordBulkRoomRequests = safeData.landlordBulkRoomRequests.filter((request) => request.status === "pending");
    const approvedLandlordBulkRoomRequests = safeData.landlordBulkRoomRequests.filter((request) => request.status === "approved");
    const rejectedLandlordBulkRoomRequests = safeData.landlordBulkRoomRequests.filter((request) => request.status === "rejected");
    const visibleLandlordBulkRoomRequests = filter === "pending"
        ? pendingLandlordBulkRoomRequests
        : filter === "approved"
            ? approvedLandlordBulkRoomRequests
            : rejectedLandlordBulkRoomRequests;
    const feed = safeData.notifications.slice(0, 12);
    const auditEventsByRequest = (() => {
        const grouped = new Map<string, NotificationAuditRow[]>();
        for (const event of safeData.auditEvents) {
            if (!event.entity_id) continue;
            grouped.set(event.entity_id, [...(grouped.get(event.entity_id) ?? []), event]);
        }
        return grouped;
    })();

    function openRejectModal(request: NotificationRentRequest) {
        setMessage(null);
        setDecisionNote("");
        setModal({ type: "reject", request });
    }

    function openPaymentRejectModal(request: NotificationPaymentDateRequest) {
        setMessage(null);
        setPaymentDecisionNote("");
        setPaymentModal({ type: "reject", request });
    }

    function openBalanceAdjustmentRejectModal(request: NotificationTenantBalanceAdjustmentRequest) {
        setMessage(null);
        setBalanceAdjustmentDecisionNote("");
        setBalanceAdjustmentModal({ type: "reject", request });
    }

    function openLandlordPaymentRejectModal(request: NotificationLandlordPaymentRequest) {
        setMessage(null);
        setLandlordPaymentDecisionNote("");
        setLandlordPaymentModal({ type: "reject", request });
    }

    function openLandlordPaymentDetailRejectModal(request: NotificationLandlordPaymentDetailRequest) {
        setMessage(null);
        setLandlordPaymentDetailDecisionNote("");
        setLandlordPaymentDetailModal({ type: "reject", request });
    }

    function openLandlordBulkRoomRejectModal(request: NotificationLandlordBulkRoomRequest) {
        setMessage(null);
        setLandlordBulkRoomDecisionNote("");
        setLandlordBulkRoomModal({ type: "reject", request });
    }

    function executeDecision(request: NotificationRentRequest, decision: "approved" | "rejected", comment: string) {
        if (decision === "rejected" && !comment.trim()) {
            setMessage("Rejection reason is required.");
            return;
        }

        startTransition(async () => {
            try {
                setMessage(null);
                setActionLabel(decision === "approved" ? "Approving..." : "Rejecting...");
                await decideRoomRentChange({ requestId: request.id, decision, comment });
                setMessage(decision === "approved"
                    ? "Request approved. Room and tenant rent were updated."
                    : "Request rejected. Old rent was kept.");
                setModal(null);
                setDecisionNote("");
                router.refresh();
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Unable to process request.");
            } finally {
                setActionLabel(null);
            }
        });
    }

    function executePaymentDateDecision(request: NotificationPaymentDateRequest, decision: "approved" | "rejected", comment: string) {
        if (decision === "rejected" && !comment.trim()) {
            setMessage("Rejection reason is required.");
            return;
        }

        startTransition(async () => {
            try {
                setMessage(null);
                setActionLabel(decision === "approved" ? "Approving payment date..." : "Rejecting payment date...");
                await decidePaymentCorrection({ requestId: request.id, decision, comment });
                setMessage(decision === "approved"
                    ? "Payment correction approved. The payment record and balances were updated."
                    : "Payment correction rejected. Original payment record was kept.");
                setPaymentModal(null);
                setPaymentDecisionNote("");
                router.refresh();
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Unable to process payment date request.");
            } finally {
                setActionLabel(null);
            }
        });
    }

    function executeBalanceAdjustmentDecision(request: NotificationTenantBalanceAdjustmentRequest, decision: "approved" | "rejected", comment: string) {
        if (decision === "rejected" && !comment.trim()) {
            setMessage("Rejection reason is required.");
            return;
        }

        startTransition(async () => {
            try {
                setMessage(null);
                setActionLabel(decision === "approved" ? "Approving balance adjustment..." : "Rejecting balance adjustment...");
                await decideTenantOutstandingBalanceAdjustment({ adjustmentId: request.id, decision, comment });
                setMessage(decision === "approved"
                    ? "Outstanding balance adjustment approved. Tenant balance was updated live."
                    : "Outstanding balance adjustment rejected. Tenant balance was not changed.");
                setBalanceAdjustmentModal(null);
                setBalanceAdjustmentDecisionNote("");
                router.refresh();
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Unable to process outstanding balance adjustment.");
            } finally {
                setActionLabel(null);
            }
        });
    }

    function executeLandlordPaymentDecision(request: NotificationLandlordPaymentRequest, decision: "approved" | "rejected", comment: string) {
        if (decision === "rejected" && !comment.trim()) {
            setMessage("Rejection reason is required.");
            return;
        }

        startTransition(async () => {
            try {
                setMessage(null);
                setActionLabel(decision === "approved" ? "Approving landlord payment..." : "Rejecting landlord payment...");
                await decideLandlordPaidExpenseRequest({ requestId: request.id, decision, comment });
                setLocalLandlordPaymentStatuses((current) => ({ ...current, [request.id]: decision }));
                setMessage(decision === "approved"
                    ? "Landlord payment approved. The landlord ledger and reports were updated."
                    : "Landlord payment rejected. The landlord ledger was not affected.");
                setLandlordPaymentModal(null);
                setLandlordPaymentDecisionNote("");
                router.refresh();
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Unable to process landlord payment request.");
            } finally {
                setActionLabel(null);
            }
        });
    }

    function executeLandlordPaymentDetailDecision(request: NotificationLandlordPaymentDetailRequest, decision: "approved" | "rejected", comment: string) {
        if (decision === "rejected" && !comment.trim()) {
            setMessage("Rejection reason is required.");
            return;
        }

        startTransition(async () => {
            try {
                setMessage(null);
                setActionLabel(decision === "approved" ? "Approving payment details..." : "Rejecting payment details...");
                await decideLandlordPaymentDetails({ detailId: request.id, decision, comment });
                setMessage(decision === "approved"
                    ? "Landlord payment details approved. These details are now active for landlord payments."
                    : "Landlord payment details rejected. The active approved details were kept.");
                setLandlordPaymentDetailModal(null);
                setLandlordPaymentDetailDecisionNote("");
                router.refresh();
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Unable to process landlord payment details.");
            } finally {
                setActionLabel(null);
            }
        });
    }

    function executeLandlordBulkRoomDecision(request: NotificationLandlordBulkRoomRequest, decision: "approved" | "rejected", comment: string) {
        if (decision === "rejected" && !comment.trim()) {
            setMessage("Rejection reason is required.");
            return;
        }

        startTransition(async () => {
            try {
                setMessage(null);
                setActionLabel(decision === "approved" ? "Approving landlord inventory..." : "Rejecting landlord inventory...");
                await reviewLandlordBulkRoomRequest({ requestId: request.id, decision, adminComment: comment });
                setMessage(decision === "approved"
                    ? "New landlord and room inventory approved. Live properties, tenants, vacant rooms and dashboards were updated."
                    : "New landlord and room request rejected. No live landlord, room, or tenant data was created.");
                setLandlordBulkRoomModal(null);
                setLandlordBulkRoomDecisionNote("");
                router.refresh();
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Unable to process landlord inventory request.");
            } finally {
                setActionLabel(null);
            }
        });
    }

    function submitRejectDecision() {
        if (!modal || modal.type !== "reject") return;
        executeDecision(modal.request, "rejected", decisionNote);
    }

    function submitPaymentRejectDecision() {
        if (!paymentModal || paymentModal.type !== "reject") return;
        executePaymentDateDecision(paymentModal.request, "rejected", paymentDecisionNote);
    }

    function submitBalanceAdjustmentRejectDecision() {
        if (!balanceAdjustmentModal || balanceAdjustmentModal.type !== "reject") return;
        executeBalanceAdjustmentDecision(balanceAdjustmentModal.request, "rejected", balanceAdjustmentDecisionNote);
    }

    function submitLandlordPaymentRejectDecision() {
        if (!landlordPaymentModal || landlordPaymentModal.type !== "reject") return;
        executeLandlordPaymentDecision(landlordPaymentModal.request, "rejected", landlordPaymentDecisionNote);
    }

    function submitLandlordPaymentDetailRejectDecision() {
        if (!landlordPaymentDetailModal || landlordPaymentDetailModal.type !== "reject") return;
        executeLandlordPaymentDetailDecision(landlordPaymentDetailModal.request, "rejected", landlordPaymentDetailDecisionNote);
    }

    function submitLandlordBulkRoomRejectDecision() {
        if (!landlordBulkRoomModal || landlordBulkRoomModal.type !== "reject") return;
        executeLandlordBulkRoomDecision(landlordBulkRoomModal.request, "rejected", landlordBulkRoomDecisionNote);
    }

    function openBulkDecision(queue: ApprovalQueue, queueLabel: string, decision: "approved" | "rejected", ids: string[]) {
        const uniqueIds = Array.from(new Set(ids)).filter(Boolean);
        if (uniqueIds.length === 0) {
            setMessage("Select at least one pending request first.");
            return;
        }
        setBulkComment("");
        setBulkModal({ queue, queueLabel, decision, ids: uniqueIds });
    }

    function clearBulkSelection(queue: ApprovalQueue) {
        if (queue === "rent") setSelectedRentRequestIds([]);
        if (queue === "payment") setSelectedPaymentRequestIds([]);
        if (queue === "balance") setSelectedBalanceRequestIds([]);
        if (queue === "landlordPayment") setSelectedLandlordPaymentRequestIds([]);
        if (queue === "landlordPaymentDetail") setSelectedLandlordPaymentDetailRequestIds([]);
        if (queue === "landlordBulkRoom") setSelectedLandlordBulkRoomRequestIds([]);
    }

    function runBulkDecision() {
        if (!bulkModal) return;
        if (bulkModal.decision === "rejected" && !bulkComment.trim()) {
            setMessage("Rejection reason is required for bulk rejection.");
            return;
        }

        startTransition(async () => {
            try {
                setMessage(null);
                setActionLabel(`${bulkModal.decision === "approved" ? "Approving" : "Rejecting"} ${bulkModal.ids.length} ${bulkModal.queueLabel.toLowerCase()}...`);
                const comment = bulkModal.decision === "approved" ? bulkComment.trim() : bulkComment.trim();
                if (bulkModal.queue === "rent") {
                    for (const id of bulkModal.ids) await decideRoomRentChange({ requestId: id, decision: bulkModal.decision, comment });
                }
                if (bulkModal.queue === "payment") {
                    for (const id of bulkModal.ids) await decidePaymentCorrection({ requestId: id, decision: bulkModal.decision, comment });
                }
                if (bulkModal.queue === "balance") {
                    for (const id of bulkModal.ids) await decideTenantOutstandingBalanceAdjustment({ adjustmentId: id, decision: bulkModal.decision, comment });
                }
                if (bulkModal.queue === "landlordPayment") {
                    for (const id of bulkModal.ids) await decideLandlordPaidExpenseRequest({ requestId: id, decision: bulkModal.decision, comment });
                    setLocalLandlordPaymentStatuses((current) => {
                        const next = { ...current };
                        for (const id of bulkModal.ids) next[id] = bulkModal.decision;
                        return next;
                    });
                }
                if (bulkModal.queue === "landlordPaymentDetail") {
                    for (const id of bulkModal.ids) await decideLandlordPaymentDetails({ detailId: id, decision: bulkModal.decision, comment });
                }
                if (bulkModal.queue === "landlordBulkRoom") {
                    for (const id of bulkModal.ids) await reviewLandlordBulkRoomRequest({ requestId: id, decision: bulkModal.decision, adminComment: comment });
                }
                setMessage(`${bulkModal.ids.length} ${bulkModal.queueLabel.toLowerCase()} ${bulkModal.decision === "approved" ? "approved" : "rejected"}.`);
                clearBulkSelection(bulkModal.queue);
                setBulkModal(null);
                setBulkComment("");
                router.refresh();
            } catch (error) {
                setMessage(error instanceof Error ? error.message : "Unable to complete bulk action.");
            } finally {
                setActionLabel(null);
            }
        });
    }

    return (
        <main className="enterprise-page">
            <div className="enterprise-shell">
                <PageHero
                    title={safeData.isAdmin ? `Notifications (${safeData.pendingApprovalCount ?? pendingRequests.length})` : `Office Notifications (${safeData.unreadNotificationCount ?? 0})`}
                    subtitle={safeData.isAdmin ? "Pending approvals and company operational notifications." : `${safeData.activeOfficeName ?? "Office"} approvals, rejections, and operational notices.`}
                    badge={safeData.isAdmin ? "Admin → Notifications" : "Office → Notifications"}
                >
                    <div className="enterprise-card min-w-72 p-5">
                        <div className="flex items-center gap-3">
                            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-600 text-white">
                                <BellRing size={22} />
                            </span>
                            <div>
                                <p className="text-sm font-bold text-slate-500">{safeData.isAdmin ? "Pending Approvals" : "Unread Notices"}</p>
                                <p className="text-4xl font-black text-slate-950">{safeData.isAdmin ? safeData.pendingApprovalCount ?? pendingRequests.length : safeData.unreadNotificationCount ?? 0}</p>
                            </div>
                        </div>
                    </div>
                </PageHero>

                {safeData.isAdmin ? (
                    <>
                    <section className="enterprise-panel overflow-hidden">
                        <div className="border-b border-slate-200 p-5">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                <div>
                                    <h2 className="text-xl font-black text-slate-950">Pending Approvals</h2>
                                <p className="text-sm font-semibold text-slate-500">Room rent and payment date change requests are approved here. Audit Centre remains history-only.</p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <FilterButton active={filter === "pending"} label={`Pending (${pendingRequests.length + pendingPaymentDateRequests.length + pendingBalanceAdjustmentRequests.length + pendingLandlordPaymentRequests.length + pendingLandlordPaymentDetailRequests.length + pendingLandlordBulkRoomRequests.length})`} onClick={() => setFilter("pending")} />
                                    <FilterButton active={filter === "approved"} label={`Approved (${approvedRequests.length + approvedPaymentDateRequests.length + approvedBalanceAdjustmentRequests.length + approvedLandlordPaymentRequests.length + approvedLandlordPaymentDetailRequests.length + approvedLandlordBulkRoomRequests.length})`} onClick={() => setFilter("approved")} />
                                    <FilterButton active={filter === "rejected"} label={`Rejected (${rejectedRequests.length + rejectedPaymentDateRequests.length + rejectedBalanceAdjustmentRequests.length + rejectedLandlordPaymentRequests.length + rejectedLandlordPaymentDetailRequests.length + rejectedLandlordBulkRoomRequests.length})`} onClick={() => setFilter("rejected")} />
                                </div>
                            </div>
                            {message ? <p className="mt-4 rounded-2xl bg-blue-50 px-4 py-3 text-sm font-black text-blue-800">{message}</p> : null}
                            {actionLabel ? <p className="mt-3 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white">{actionLabel}</p> : null}
                        </div>
                        <BulkApprovalControls
                            disabled={isPending}
                            label="Rent change requests"
                            pendingIds={pendingRequests.map((request) => request.id)}
                            selectedIds={selectedRentRequestIds}
                            onChangeSelected={setSelectedRentRequestIds}
                            onBulk={(decision, ids) => openBulkDecision("rent", "Rent change requests", decision, ids)}
                        />
                        <ApprovalTable
                            data={safeData}
                            isPending={isPending}
                            selectedIds={selectedRentRequestIds}
                            requests={visibleRequests}
                            onToggleSelected={(id) => toggleSelectedId(selectedRentRequestIds, setSelectedRentRequestIds, id)}
                            onApprove={(request) => executeDecision(request, "approved", "")}
                            onReject={(request) => openRejectModal(request)}
                            onReason={(request) => setModal({ type: "reason", request })}
                            onHistory={(request) => setModal({ type: "history", request })}
                        />
                    </section>
                    <section className="enterprise-panel mt-6 overflow-hidden">
                        <div className="border-b border-slate-200 p-5">
                            <h2 className="text-xl font-black text-slate-950">Payment Correction Requests</h2>
                            <p className="text-sm font-semibold text-slate-500">Approve date, amount, and room corrections only after reviewing the office explanation.</p>
                        </div>
                        <BulkApprovalControls
                            disabled={isPending}
                            label="Payment correction requests"
                            pendingIds={pendingPaymentDateRequests.map((request) => request.id)}
                            selectedIds={selectedPaymentRequestIds}
                            onChangeSelected={setSelectedPaymentRequestIds}
                            onBulk={(decision, ids) => openBulkDecision("payment", "Payment correction requests", decision, ids)}
                        />
                        <PaymentDateApprovalTable
                            data={safeData}
                            isPending={isPending}
                            selectedIds={selectedPaymentRequestIds}
                            requests={visiblePaymentDateRequests}
                            onToggleSelected={(id) => toggleSelectedId(selectedPaymentRequestIds, setSelectedPaymentRequestIds, id)}
                            onApprove={(request) => executePaymentDateDecision(request, "approved", "")}
                            onReject={(request) => openPaymentRejectModal(request)}
                            onReason={(request) => setPaymentModal({ type: "reason", request })}
                            onHistory={(request) => setPaymentModal({ type: "history", request })}
                        />
                    </section>
                    <section className="enterprise-panel mt-6 overflow-hidden">
                        <div className="border-b border-slate-200 p-5">
                            <h2 className="text-xl font-black text-slate-950">Outstanding Balance Adjustment Requests</h2>
                            <p className="text-sm font-semibold text-slate-500">Approve office-requested tenant outstanding balance changes without deleting payment history.</p>
                        </div>
                        <BulkApprovalControls
                            disabled={isPending}
                            label="Outstanding balance requests"
                            pendingIds={pendingBalanceAdjustmentRequests.map((request) => request.id)}
                            selectedIds={selectedBalanceRequestIds}
                            onChangeSelected={setSelectedBalanceRequestIds}
                            onBulk={(decision, ids) => openBulkDecision("balance", "Outstanding balance requests", decision, ids)}
                        />
                        <BalanceAdjustmentApprovalTable
                            data={safeData}
                            isPending={isPending}
                            selectedIds={selectedBalanceRequestIds}
                            requests={visibleBalanceAdjustmentRequests}
                            onToggleSelected={(id) => toggleSelectedId(selectedBalanceRequestIds, setSelectedBalanceRequestIds, id)}
                            onApprove={(request) => executeBalanceAdjustmentDecision(request, "approved", "")}
                            onReject={(request) => openBalanceAdjustmentRejectModal(request)}
                            onReason={(request) => setBalanceAdjustmentModal({ type: "reason", request })}
                        />
                    </section>
                    <section className="enterprise-panel mt-6 overflow-hidden">
                        <div className="border-b border-slate-200 p-5">
                            <h2 className="text-xl font-black text-slate-950">Landlord Payment Approval Queue</h2>
                            <p className="text-sm font-semibold text-slate-500">Office-submitted landlord payments from Expenses are approved here before they affect landlord ledgers.</p>
                        </div>
                        <BulkApprovalControls
                            disabled={isPending}
                            label="Landlord payment requests"
                            pendingIds={pendingLandlordPaymentRequests.map((request) => request.id)}
                            selectedIds={selectedLandlordPaymentRequestIds}
                            onChangeSelected={setSelectedLandlordPaymentRequestIds}
                            onBulk={(decision, ids) => openBulkDecision("landlordPayment", "Landlord payment requests", decision, ids)}
                        />
                        <LandlordPaymentApprovalTable
                            data={safeData}
                            isPending={isPending}
                            selectedIds={selectedLandlordPaymentRequestIds}
                            requests={visibleLandlordPaymentRequests}
                            onToggleSelected={(id) => toggleSelectedId(selectedLandlordPaymentRequestIds, setSelectedLandlordPaymentRequestIds, id)}
                            onApprove={(request) => executeLandlordPaymentDecision(request, "approved", "")}
                            onReject={(request) => openLandlordPaymentRejectModal(request)}
                            onReason={(request) => setLandlordPaymentModal({ type: "reason", request })}
                            onHistory={(request) => setLandlordPaymentModal({ type: "history", request })}
                        />
                    </section>
                    <section className="enterprise-panel mt-6 overflow-hidden">
                        <div className="border-b border-slate-200 p-5">
                            <h2 className="text-xl font-black text-slate-950">New Landlord & Room Inventory Approval Queue</h2>
                            <p className="text-sm font-semibold text-slate-500">Review office-submitted landlords, rooms, occupied tenants, vacant rooms, and opening balances before they become live.</p>
                        </div>
                        <BulkApprovalControls
                            disabled={isPending}
                            label="Landlord inventory requests"
                            pendingIds={pendingLandlordBulkRoomRequests.map((request) => request.id)}
                            selectedIds={selectedLandlordBulkRoomRequestIds}
                            onChangeSelected={setSelectedLandlordBulkRoomRequestIds}
                            onBulk={(decision, ids) => openBulkDecision("landlordBulkRoom", "Landlord inventory requests", decision, ids)}
                        />
                        <LandlordBulkRoomApprovalTable
                            data={safeData}
                            isPending={isPending}
                            selectedIds={selectedLandlordBulkRoomRequestIds}
                            requests={visibleLandlordBulkRoomRequests}
                            onToggleSelected={(id) => toggleSelectedId(selectedLandlordBulkRoomRequestIds, setSelectedLandlordBulkRoomRequestIds, id)}
                            onApprove={(request) => executeLandlordBulkRoomDecision(request, "approved", "")}
                            onReject={(request) => openLandlordBulkRoomRejectModal(request)}
                            onViewDetails={(request) => setLandlordBulkRoomModal({ type: "details", request })}
                        />
                    </section>
                    <section className="enterprise-panel mt-6 overflow-hidden">
                        <div className="border-b border-slate-200 p-5">
                            <h2 className="text-xl font-black text-slate-950">Landlord Payment Details Approval Queue</h2>
                            <p className="text-sm font-semibold text-slate-500">Approve mobile money or bank details before they become active on landlord payment forms.</p>
                        </div>
                        <BulkApprovalControls
                            disabled={isPending}
                            label="Landlord payment detail requests"
                            pendingIds={pendingLandlordPaymentDetailRequests.map((request) => request.id)}
                            selectedIds={selectedLandlordPaymentDetailRequestIds}
                            onChangeSelected={setSelectedLandlordPaymentDetailRequestIds}
                            onBulk={(decision, ids) => openBulkDecision("landlordPaymentDetail", "Landlord payment detail requests", decision, ids)}
                        />
                        <LandlordPaymentDetailApprovalTable
                            data={safeData}
                            isPending={isPending}
                            selectedIds={selectedLandlordPaymentDetailRequestIds}
                            requests={visibleLandlordPaymentDetailRequests}
                            onToggleSelected={(id) => toggleSelectedId(selectedLandlordPaymentDetailRequestIds, setSelectedLandlordPaymentDetailRequestIds, id)}
                            onApprove={(request) => executeLandlordPaymentDetailDecision(request, "approved", "")}
                            onReject={(request) => openLandlordPaymentDetailRejectModal(request)}
                            onReason={(request) => setLandlordPaymentDetailModal({ type: "reason", request })}
                            onHistory={(request) => setLandlordPaymentDetailModal({ type: "history", request })}
                        />
                    </section>
                    </>
                ) : (
                    <OfficeNotificationFeed data={safeData} />
                )}

                {safeData.isAdmin ? (
                    <section className="enterprise-panel mt-6 p-5">
                        <h2 className="text-xl font-black text-slate-950">Other Approval Requests</h2>
                        <p className="mt-1 text-sm font-semibold text-slate-500">Future approval workflows will appear here beside rent and payment date requests.</p>
                        <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm font-bold text-slate-500">
                            No other approval request types are pending.
                        </div>
                    </section>
                ) : null}

                <section className="enterprise-panel mt-6 p-5">
                    <h2 className="text-xl font-black text-slate-950">{safeData.isAdmin ? "Notification Feed" : "Office Approval Updates"}</h2>
                    <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
                        {feed.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm font-bold text-slate-500">No notifications yet.</div>
                        ) : feed.map((notification) => (
                            <div key={notification.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="font-black text-slate-950">{notification.title ?? "Notification"}</p>
                                        <p className="mt-1 text-sm font-semibold text-slate-600">{notification.message ?? "No message."}</p>
                                    </div>
                                    <StatusChip label={notification.is_read ? "read" : "new"} tone={notification.is_read ? "slate" : "blue"} />
                                </div>
                                <p className="mt-3 text-xs font-bold text-slate-500">{formatDate(notification.created_at)}</p>
                            </div>
                        ))}
                    </div>
                </section>

                <RequestModal
                    actionLabel={actionLabel}
                    auditEvents={modal?.type === "history" ? auditEventsByRequest.get(modal.request.id) ?? [] : []}
                    data={safeData}
                    decisionNote={decisionNote}
                    isPending={isPending}
                    modal={modal}
                    onClose={() => {
                        if (!isPending) setModal(null);
                    }}
                    onDecisionNoteChange={setDecisionNote}
                    onSubmitRejectDecision={submitRejectDecision}
	                    relatedHistory={modal ? requests.filter((request) => request.room_id === modal.request.room_id) : []}
	                />
                <PaymentDateRequestModal
                    actionLabel={actionLabel}
                    auditEvents={paymentModal?.type === "history" ? auditEventsByRequest.get(paymentModal.request.id) ?? [] : []}
                    data={safeData}
                    decisionNote={paymentDecisionNote}
                    isPending={isPending}
                    modal={paymentModal}
                    onClose={() => {
                        if (!isPending) setPaymentModal(null);
                    }}
                    onDecisionNoteChange={setPaymentDecisionNote}
                    onSubmitRejectDecision={submitPaymentRejectDecision}
                    relatedHistory={paymentModal ? paymentDateRequests.filter((request) => request.payment_id === paymentModal.request.payment_id) : []}
                />
                <BalanceAdjustmentRequestModal
                    actionLabel={actionLabel}
                    data={safeData}
                    decisionNote={balanceAdjustmentDecisionNote}
                    isPending={isPending}
                    modal={balanceAdjustmentModal}
                    onClose={() => {
                        if (!isPending) setBalanceAdjustmentModal(null);
                    }}
                    onDecisionNoteChange={setBalanceAdjustmentDecisionNote}
                    onSubmitRejectDecision={submitBalanceAdjustmentRejectDecision}
                />
                <LandlordPaymentRequestModal
                    actionLabel={actionLabel}
                    auditEvents={landlordPaymentModal?.type === "history" ? auditEventsByRequest.get(landlordPaymentModal.request.id) ?? [] : []}
                    data={safeData}
                    decisionNote={landlordPaymentDecisionNote}
                    isPending={isPending}
                    modal={landlordPaymentModal}
                    onClose={() => {
                        if (!isPending) setLandlordPaymentModal(null);
                    }}
                    onDecisionNoteChange={setLandlordPaymentDecisionNote}
                    onSubmitRejectDecision={submitLandlordPaymentRejectDecision}
                    relatedHistory={landlordPaymentModal ? safeData.landlordPaymentRequests.filter((request) => request.landlord_id === landlordPaymentModal.request.landlord_id) : []}
                />
                <LandlordPaymentDetailRequestModal
                    actionLabel={actionLabel}
                    auditEvents={landlordPaymentDetailModal?.type === "history" ? auditEventsByRequest.get(landlordPaymentDetailModal.request.id) ?? [] : []}
                    data={safeData}
                    decisionNote={landlordPaymentDetailDecisionNote}
                    isPending={isPending}
                    modal={landlordPaymentDetailModal}
                    onClose={() => {
                        if (!isPending) setLandlordPaymentDetailModal(null);
                    }}
                    onDecisionNoteChange={setLandlordPaymentDetailDecisionNote}
                    onSubmitRejectDecision={submitLandlordPaymentDetailRejectDecision}
                    relatedHistory={landlordPaymentDetailModal ? safeData.landlordPaymentDetailRequests.filter((request) => request.landlord_id === landlordPaymentDetailModal.request.landlord_id) : []}
                />
                <LandlordBulkRoomRequestModal
                    actionLabel={actionLabel}
                    data={safeData}
                    decisionNote={landlordBulkRoomDecisionNote}
                    isPending={isPending}
                    modal={landlordBulkRoomModal}
                    onApprove={(request) => executeLandlordBulkRoomDecision(request, "approved", "")}
                    onClose={() => {
                        if (!isPending) setLandlordBulkRoomModal(null);
                    }}
                    onDecisionNoteChange={setLandlordBulkRoomDecisionNote}
                    onReject={(request) => openLandlordBulkRoomRejectModal(request)}
                    onSubmitRejectDecision={submitLandlordBulkRoomRejectDecision}
                />
                <BulkDecisionModal
                    comment={bulkComment}
                    isPending={isPending}
                    modal={bulkModal}
                    onChangeComment={setBulkComment}
                    onClose={() => {
                        if (!isPending) setBulkModal(null);
                    }}
                    onConfirm={runBulkDecision}
                />
            </div>
        </main>
    );
}

function toggleSelectedId(selectedIds: string[], onChange: (ids: string[]) => void, id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((selectedId) => selectedId !== id) : [...selectedIds, id]);
}

function BulkApprovalControls({
    disabled,
    label,
    pendingIds,
    selectedIds,
    onBulk,
    onChangeSelected,
}: {
    disabled: boolean;
    label: string;
    pendingIds: string[];
    selectedIds: string[];
    onBulk: (decision: "approved" | "rejected", ids: string[]) => void;
    onChangeSelected: (ids: string[]) => void;
}) {
    const pendingSet = new Set(pendingIds);
    const selectedPendingIds = selectedIds.filter((id) => pendingSet.has(id));
    const allSelected = pendingIds.length > 0 && pendingIds.every((id) => selectedIds.includes(id));
    return (
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
            <label className="inline-flex items-center gap-3 text-sm font-black text-slate-700">
                <input
                    checked={allSelected}
                    disabled={disabled || pendingIds.length === 0}
                    type="checkbox"
                    onChange={(event) => onChangeSelected(event.target.checked ? pendingIds : [])}
                    className="h-4 w-4 rounded border-slate-300 text-blue-700"
                />
                Select All Pending <span className="text-slate-400">({pendingIds.length})</span>
            </label>
            <div className="flex flex-wrap gap-2">
                <button disabled={disabled || selectedPendingIds.length === 0} onClick={() => onBulk("approved", selectedPendingIds)} className="rounded-xl bg-emerald-700 px-3 py-2 text-xs font-black text-white disabled:opacity-40">
                    Approve Selected ({selectedPendingIds.length})
                </button>
                <button disabled={disabled || selectedPendingIds.length === 0} onClick={() => onBulk("rejected", selectedPendingIds)} className="rounded-xl bg-red-700 px-3 py-2 text-xs font-black text-white disabled:opacity-40">
                    Reject Selected ({selectedPendingIds.length})
                </button>
                <button disabled={disabled || pendingIds.length === 0} onClick={() => onBulk("approved", pendingIds)} className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-black text-emerald-800 disabled:opacity-40">
                    Approve All Pending
                </button>
                <button disabled={disabled || pendingIds.length === 0} onClick={() => onBulk("rejected", pendingIds)} className="rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-black text-red-800 disabled:opacity-40">
                    Reject All Pending
                </button>
            </div>
            <p className="text-xs font-bold text-slate-500">{label} use the same logic as single Approve/Reject.</p>
        </div>
    );
}

function BulkDecisionModal({
    comment,
    isPending,
    modal,
    onChangeComment,
    onClose,
    onConfirm,
}: {
    comment: string;
    isPending: boolean;
    modal: BulkModalState;
    onChangeComment: (value: string) => void;
    onClose: () => void;
    onConfirm: () => void;
}) {
    if (!modal) return null;
    const action = modal.decision === "approved" ? "approve" : "reject";
    return (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/60 p-4">
            <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
                <h2 className="text-xl font-black text-slate-950">Confirm Bulk {modal.decision === "approved" ? "Approval" : "Rejection"}</h2>
                <p className="mt-2 text-sm font-semibold text-slate-600">
                    You are about to {action} {modal.ids.length} pending requests. Continue?
                </p>
                <p className="mt-2 text-xs font-black uppercase tracking-wide text-slate-400">{modal.queueLabel}</p>
                <label className="mt-4 block text-sm font-bold text-slate-700">
                    {modal.decision === "rejected" ? "Rejection reason" : "Admin note optional"}
                    <textarea
                        value={comment}
                        onChange={(event) => onChangeComment(event.target.value)}
                        className="mt-2 min-h-28 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900"
                        placeholder={modal.decision === "rejected" ? "Required reason for rejecting these requests" : "Optional note for the audit trail"}
                    />
                </label>
                <div className="mt-5 flex flex-wrap justify-end gap-2">
                    <button disabled={isPending} onClick={onClose} className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-700 disabled:opacity-40">Cancel</button>
                    <button disabled={isPending} onClick={onConfirm} className={`rounded-xl px-4 py-2 text-sm font-black text-white disabled:opacity-40 ${modal.decision === "approved" ? "bg-emerald-700" : "bg-red-700"}`}>
                        {isPending ? "Processing..." : modal.decision === "approved" ? "Approve Requests" : "Reject Requests"}
                    </button>
                </div>
            </div>
        </div>
    );
}

function ApprovalTable({
    data,
    isPending,
    selectedIds = [],
    requests,
    onToggleSelected,
    onApprove,
    onReject,
    onReason,
    onHistory,
}: {
    data: NotificationsCentreData;
    isPending: boolean;
    selectedIds?: string[];
    requests: NotificationRentRequest[];
    onToggleSelected?: (id: string) => void;
    onApprove: (request: NotificationRentRequest) => void;
    onReject: (request: NotificationRentRequest) => void;
    onReason: (request: NotificationRentRequest) => void;
    onHistory: (request: NotificationRentRequest) => void;
}) {
    return (
        <div className="overflow-x-auto">
            <table className="enterprise-table">
                <thead>
                    <tr>
                        <th className="text-left">Select</th>
                        <th className="text-left">Tenant</th>
                        <th className="text-left">Room</th>
                        <th className="text-left">Landlord</th>
                        <th className="text-left">Office</th>
                        <th className="text-left">Current Rent</th>
                        <th className="text-left">Proposed Rent</th>
                        <th className="text-left">Difference</th>
                        <th className="text-left">Reason</th>
                        <th className="text-left">Requested By</th>
                        <th className="text-left">Request Date</th>
                        <th className="text-left">Effective Date</th>
                        <th className="text-left">Status</th>
                        <th className="text-left">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {requests.length === 0 ? (
                        <tr><td colSpan={14} className="p-6 text-sm font-bold text-slate-500">No rent change requests in this state.</td></tr>
                    ) : requests.map((request) => {
                        const difference = Number(request.new_rent ?? 0) - Number(request.old_rent ?? 0);
                        return (
                            <tr key={request.id}>
                                <td>
                                    {request.status === "pending" ? (
                                        <input checked={selectedIds.includes(request.id)} type="checkbox" onChange={() => onToggleSelected?.(request.id)} className="h-4 w-4 rounded border-slate-300 text-blue-700" />
                                    ) : null}
                                </td>
                                <td>{lookup(data.lookups.tenants, request.tenant_id, "Vacant / no tenant")}</td>
                                <td>{lookup(data.lookups.rooms, request.room_id, "Unnumbered")}</td>
                                <td>{lookup(data.lookups.landlords, request.landlord_id, "No landlord")}</td>
                                <td>{lookup(data.lookups.offices, request.office_id, "Needs review")}</td>
                                <td>{money(request.old_rent)}</td>
                                <td><span className="font-black text-blue-700">{money(request.new_rent)}</span></td>
                                <td><span className={difference >= 0 ? "font-black text-emerald-700" : "font-black text-red-700"}>{difference >= 0 ? "+" : ""}{money(difference)}</span></td>
                                <td>
                                    <div className="max-w-72">
                                        <p className="line-clamp-2 text-xs font-bold text-slate-600">{request.reason}</p>
                                        <button type="button" onClick={() => onReason(request)} className="mt-1 text-xs font-black text-blue-700 hover:text-blue-900">
                                            View full reason
                                        </button>
                                    </div>
                                </td>
                                <td>{lookup(data.lookups.users, request.requested_by, "Unknown user")}</td>
                                <td>{formatDate(request.created_at)}</td>
                                <td>{formatDate(request.effective_date)}</td>
                                <td><RequestStatus request={request} /></td>
                                <td>
                                    <div className="flex flex-wrap gap-2">
                                        {request.status === "pending" ? (
                                            <>
                                                <button type="button" disabled={isPending} onClick={() => onApprove(request)} className="inline-flex items-center gap-1 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-black text-white disabled:opacity-40">
                                                    <CheckCircle2 size={14} /> {isPending ? "Approving..." : "Approve"}
                                                </button>
                                                <button type="button" disabled={isPending} onClick={() => onReject(request)} className="inline-flex items-center gap-1 rounded-xl bg-red-700 px-3 py-2 text-xs font-black text-white disabled:opacity-40">
                                                    <XCircle size={14} /> {isPending ? "Rejecting..." : "Reject"}
                                                </button>
                                            </>
                                        ) : null}
                                        <button type="button" onClick={() => onHistory(request)} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">
                                            <History size={14} /> View History
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

function PaymentDateApprovalTable({
    data,
    isPending,
    selectedIds = [],
    requests,
    onToggleSelected,
    onApprove,
    onReject,
    onReason,
    onHistory,
}: {
    data: NotificationsCentreData;
    isPending: boolean;
    selectedIds?: string[];
    requests: NotificationPaymentDateRequest[];
    onToggleSelected?: (id: string) => void;
    onApprove: (request: NotificationPaymentDateRequest) => void;
    onReject: (request: NotificationPaymentDateRequest) => void;
    onReason: (request: NotificationPaymentDateRequest) => void;
    onHistory: (request: NotificationPaymentDateRequest) => void;
}) {
    return (
        <div className="overflow-x-auto">
            <table className="enterprise-table">
                <thead>
                    <tr>
                        <th className="text-left">Select</th>
                        <th className="text-left">Tenant</th>
                        <th className="text-left">Room</th>
                        <th className="text-left">Office</th>
                        <th className="text-left">Amount</th>
                        <th className="text-left">Type</th>
                        <th className="text-left">Current Value</th>
                        <th className="text-left">Requested Value</th>
                        <th className="text-left">Reason</th>
                        <th className="text-left">Requested By</th>
                        <th className="text-left">Submitted</th>
                        <th className="text-left">Status</th>
                        <th className="text-left">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {requests.length === 0 ? (
                        <tr><td colSpan={13} className="p-6 text-sm font-bold text-slate-500">No payment correction requests in this state.</td></tr>
                    ) : requests.map((request) => {
                        const payment = paymentLookup(data, request.payment_id);
                        return (
                            <tr key={request.id}>
                                <td>
                                    {request.status === "pending" ? (
                                        <input checked={selectedIds.includes(request.id)} type="checkbox" onChange={() => onToggleSelected?.(request.id)} className="h-4 w-4 rounded border-slate-300 text-blue-700" />
                                    ) : null}
                                </td>
                                <td>{lookup(data.lookups.tenants, request.tenant_id, "Unknown tenant")}</td>
                                <td>{lookup(data.lookups.rooms, request.room_id, "Unknown room")}</td>
                                <td>{lookup(data.lookups.offices, request.office_id, "Needs review")}</td>
                                <td>{money(payment?.amount ?? 0)}</td>
                                <td>{correctionTypeName(request.correction_type)}</td>
                                <td><span className="font-black text-red-700">{correctionOriginalValue(data, request, payment?.amount ?? 0)}</span></td>
                                <td><span className="font-black text-blue-700">{correctionRequestedValue(data, request)}</span></td>
                                <td>
                                    <div className="max-w-72">
                                        <p className="line-clamp-2 text-xs font-bold text-slate-600">{request.reason || "No reason provided."}</p>
                                        <button type="button" onClick={() => onReason(request)} className="mt-1 text-xs font-black text-blue-700 hover:text-blue-900">
                                            View full reason
                                        </button>
                                    </div>
                                </td>
                                <td>{lookup(data.lookups.users, request.requested_by, "Unknown user")}</td>
                                <td>{formatDate(request.created_at)}</td>
                                <td><PaymentDateStatus request={request} /></td>
                                <td>
                                    <div className="flex flex-wrap gap-2">
                                        {request.status === "pending" ? (
                                            <>
                                                <button type="button" disabled={isPending} onClick={() => onApprove(request)} className="inline-flex items-center gap-1 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-black text-white disabled:opacity-40">
                                                    <CheckCircle2 size={14} /> {isPending ? "Approving..." : "Approve"}
                                                </button>
                                                <button type="button" disabled={isPending} onClick={() => onReject(request)} className="inline-flex items-center gap-1 rounded-xl bg-red-700 px-3 py-2 text-xs font-black text-white disabled:opacity-40">
                                                    <XCircle size={14} /> {isPending ? "Rejecting..." : "Reject"}
                                                </button>
                                            </>
                                        ) : null}
                                        <button type="button" onClick={() => onHistory(request)} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">
                                            <History size={14} /> View History
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

function BalanceAdjustmentApprovalTable({
    data,
    isPending,
    selectedIds = [],
    requests,
    onToggleSelected,
    onApprove,
    onReject,
    onReason,
}: {
    data: NotificationsCentreData;
    isPending: boolean;
    selectedIds?: string[];
    requests: NotificationTenantBalanceAdjustmentRequest[];
    onToggleSelected?: (id: string) => void;
    onApprove: (request: NotificationTenantBalanceAdjustmentRequest) => void;
    onReject: (request: NotificationTenantBalanceAdjustmentRequest) => void;
    onReason: (request: NotificationTenantBalanceAdjustmentRequest) => void;
}) {
    return (
        <div className="overflow-x-auto">
            <table className="enterprise-table">
                <thead>
                    <tr>
                        <th className="text-left">Select</th>
                        <th className="text-left">Room</th>
                        <th className="text-left">Tenant</th>
                        <th className="text-left">Office</th>
                        <th className="text-right">Old Balance</th>
                        <th className="text-right">New Balance</th>
                        <th className="text-right">Change</th>
                        <th className="text-left">Effective</th>
                        <th className="text-left">Reason</th>
                        <th className="text-left">Requested By</th>
                        <th className="text-left">Status</th>
                        <th className="text-left">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {requests.length === 0 ? (
                        <tr><td colSpan={12} className="p-6 text-sm font-bold text-slate-500">No outstanding balance adjustment requests in this state.</td></tr>
                    ) : requests.map((request) => (
                        <tr key={`tenant-balance-adjustment:${request.id}`}>
                            <td>
                                {request.status === "pending" ? (
                                    <input checked={selectedIds.includes(request.id)} type="checkbox" onChange={() => onToggleSelected?.(request.id)} className="h-4 w-4 rounded border-slate-300 text-blue-700" />
                                ) : null}
                            </td>
                            <td className="font-black text-slate-950">{lookup(data.lookups.rooms, request.room_id, "Unknown room")}</td>
                            <td>{lookup(data.lookups.tenants, request.tenant_id, "Unknown tenant")}</td>
                            <td>{lookup(data.lookups.offices, request.office_id, "Needs review")}</td>
                            <td className="text-right font-black text-rose-700">{money(request.old_balance)}</td>
                            <td className="text-right font-black text-emerald-700">{money(request.new_balance)}</td>
                            <td className="text-right font-black text-slate-900">{money(request.adjustment_amount)}</td>
                            <td>{formatDate(request.effective_date)}</td>
                            <td>
                                <div className="max-w-72">
                                    <p className="line-clamp-2 text-xs font-bold text-slate-600">{request.reason || "No reason provided."}</p>
                                    <button type="button" onClick={() => onReason(request)} className="mt-1 text-xs font-black text-blue-700 hover:text-blue-900">
                                        View full reason
                                    </button>
                                </div>
                            </td>
                            <td>{lookup(data.lookups.users, request.requested_by, "Unknown user")}</td>
                            <td><StatusChip label={String(request.status ?? "pending")} tone={request.status === "approved" || request.status === "direct_admin_change" ? "green" : request.status === "rejected" ? "red" : "orange"} /></td>
                            <td>
                                <div className="flex flex-wrap gap-2">
                                    {request.status === "pending" ? (
                                        <>
                                            <button type="button" disabled={isPending} onClick={() => onApprove(request)} className="inline-flex items-center gap-1 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-black text-white disabled:opacity-40">
                                                <CheckCircle2 size={14} /> {isPending ? "Approving..." : "Approve"}
                                            </button>
                                            <button type="button" disabled={isPending} onClick={() => onReject(request)} className="inline-flex items-center gap-1 rounded-xl bg-red-700 px-3 py-2 text-xs font-black text-white disabled:opacity-40">
                                                <XCircle size={14} /> {isPending ? "Rejecting..." : "Reject"}
                                            </button>
                                        </>
                                    ) : null}
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function LandlordPaymentApprovalTable({
    data,
    isPending,
    selectedIds = [],
    requests,
    onToggleSelected,
    onApprove,
    onReject,
    onReason,
    onHistory,
}: {
    data: NotificationsCentreData;
    isPending: boolean;
    selectedIds?: string[];
    requests: NotificationLandlordPaymentRequest[];
    onToggleSelected?: (id: string) => void;
    onApprove: (request: NotificationLandlordPaymentRequest) => void;
    onReject: (request: NotificationLandlordPaymentRequest) => void;
    onReason: (request: NotificationLandlordPaymentRequest) => void;
    onHistory: (request: NotificationLandlordPaymentRequest) => void;
}) {
    return (
        <div className="overflow-x-auto">
            <table className="enterprise-table">
                <thead>
                    <tr>
                        <th className="text-left">Select</th>
                        <th className="text-left">Office</th>
                        <th className="text-left">Landlord</th>
                        <th className="text-left">Payment Date</th>
                        <th className="text-left">Amount</th>
                        <th className="text-left">Split</th>
                        <th className="text-left">Live Position</th>
                        <th className="text-left">Method</th>
                        <th className="text-left">Notes</th>
                        <th className="text-left">Submitted By</th>
                        <th className="text-left">Submitted</th>
                        <th className="text-left">Status</th>
                        <th className="text-left">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {requests.length === 0 ? (
                        <tr><td colSpan={13} className="p-6 text-sm font-bold text-slate-500">No landlord payment requests in this state.</td></tr>
                    ) : requests.map((request) => (
                        <tr key={`landlord-payment-approval:${request.id}`}>
                            <td>
                                {request.status === "pending" ? (
                                    <input checked={selectedIds.includes(request.id)} type="checkbox" onChange={() => onToggleSelected?.(request.id)} className="h-4 w-4 rounded border-slate-300 text-blue-700" />
                                ) : null}
                            </td>
                            <td>{lookup(data.lookups.offices, request.office_id, "Needs review")}</td>
                            <td className="font-black text-slate-950">{lookup(data.lookups.landlords, request.landlord_id, "Unknown landlord")}</td>
                            <td>{formatDate(request.payment_date)}</td>
                            <td><span className="font-black text-blue-700">{money(request.requested_amount)}</span></td>
                            <td>
                                <div className="space-y-1 text-xs font-bold">
                                    <p className="text-emerald-700">Payment: {money(request.normal_payment_amount ?? request.requested_amount)}</p>
                                    <p className={Number(request.advance_amount ?? 0) > 0 ? "text-amber-700" : "text-slate-400"}>Advance: {money(request.advance_amount ?? 0)}</p>
                                </div>
                            </td>
                            <td>
                                <div className="space-y-1 text-xs font-bold text-slate-600">
                                    <p>Net: {money(request.current_net_payable ?? 0)}</p>
                                    <p>Paid: {money(request.already_paid_amount ?? 0)}</p>
                                    <p>Outstanding: {money(request.outstanding_amount ?? 0)}</p>
                                </div>
                            </td>
                            <td className="capitalize">{request.payment_method.replaceAll("_", " ")}</td>
                            <td>
                                <div className="max-w-72">
                                    <p className="line-clamp-2 text-xs font-bold text-slate-600">{request.notes || "No note provided."}</p>
                                    <button type="button" onClick={() => onReason(request)} className="mt-1 text-xs font-black text-blue-700 hover:text-blue-900">
                                        View full reason
                                    </button>
                                </div>
                            </td>
                            <td>{lookup(data.lookups.users, request.submitted_by, "Unknown user")}</td>
                            <td>{formatDate(request.created_at)}</td>
                            <td><LandlordPaymentStatus request={request} /></td>
                            <td>
                                <div className="flex flex-wrap gap-2">
                                    {request.status === "pending" ? (
                                        <>
                                            <button type="button" disabled={isPending} onClick={() => onApprove(request)} className="inline-flex items-center gap-1 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-black text-white disabled:opacity-40">
                                                <CheckCircle2 size={14} /> {isPending ? "Approving..." : "Approve"}
                                            </button>
                                            <button type="button" disabled={isPending} onClick={() => onReject(request)} className="inline-flex items-center gap-1 rounded-xl bg-red-700 px-3 py-2 text-xs font-black text-white disabled:opacity-40">
                                                <XCircle size={14} /> {isPending ? "Rejecting..." : "Reject"}
                                            </button>
                                        </>
                                    ) : null}
                                    <button type="button" onClick={() => onHistory(request)} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">
                                        <History size={14} /> View History
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function LandlordPaymentDetailApprovalTable({
    data,
    isPending,
    selectedIds = [],
    requests,
    onToggleSelected,
    onApprove,
    onReject,
    onReason,
    onHistory,
}: {
    data: NotificationsCentreData;
    isPending: boolean;
    selectedIds?: string[];
    requests: NotificationLandlordPaymentDetailRequest[];
    onToggleSelected?: (id: string) => void;
    onApprove: (request: NotificationLandlordPaymentDetailRequest) => void;
    onReject: (request: NotificationLandlordPaymentDetailRequest) => void;
    onReason: (request: NotificationLandlordPaymentDetailRequest) => void;
    onHistory: (request: NotificationLandlordPaymentDetailRequest) => void;
}) {
    return (
        <div className="overflow-x-auto">
            <table className="enterprise-table">
                <thead>
                    <tr>
                        <th className="text-left">Select</th>
                        <th className="text-left">Office</th>
                        <th className="text-left">Landlord</th>
                        <th className="text-left">Method</th>
                        <th className="text-left">Approved Details</th>
                        <th className="text-left">Notes</th>
                        <th className="text-left">Requested By</th>
                        <th className="text-left">Submitted</th>
                        <th className="text-left">Status</th>
                        <th className="text-left">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {requests.length === 0 ? (
                        <tr><td colSpan={10} className="p-6 text-sm font-bold text-slate-500">No landlord payment-detail requests in this state.</td></tr>
                    ) : requests.map((request) => (
                        <tr key={`landlord-payment-detail-approval:${request.id}`}>
                            <td>
                                {request.status === "pending" ? (
                                    <input checked={selectedIds.includes(request.id)} type="checkbox" onChange={() => onToggleSelected?.(request.id)} className="h-4 w-4 rounded border-slate-300 text-blue-700" />
                                ) : null}
                            </td>
                            <td>{lookup(data.lookups.offices, request.office_id, "Needs review")}</td>
                            <td className="font-black text-slate-950">{lookup(data.lookups.landlords, request.landlord_id, "Unknown landlord")}</td>
                            <td>
                                <p className="font-black capitalize text-slate-950">{request.payment_method.replaceAll("_", " ")}</p>
                                {request.label ? <p className="text-xs font-bold text-slate-500">{request.label}</p> : null}
                            </td>
                            <td>
                                <PaymentDetailSummary request={request} />
                            </td>
                            <td>
                                <div className="max-w-72">
                                    <p className="line-clamp-2 text-xs font-bold text-slate-600">{request.notes || request.admin_comment || "No note provided."}</p>
                                    <button type="button" onClick={() => onReason(request)} className="mt-1 text-xs font-black text-blue-700 hover:text-blue-900">
                                        View full reason
                                    </button>
                                </div>
                            </td>
                            <td>{lookup(data.lookups.users, request.requested_by, "Unknown user")}</td>
                            <td>{formatDate(request.created_at)}</td>
                            <td><LandlordPaymentDetailStatus request={request} /></td>
                            <td>
                                <div className="flex flex-wrap gap-2">
                                    {request.status === "pending" ? (
                                        <>
                                            <button type="button" disabled={isPending} onClick={() => onApprove(request)} className="inline-flex items-center gap-1 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-black text-white disabled:opacity-40">
                                                <CheckCircle2 size={14} /> {isPending ? "Approving..." : "Approve"}
                                            </button>
                                            <button type="button" disabled={isPending} onClick={() => onReject(request)} className="inline-flex items-center gap-1 rounded-xl bg-red-700 px-3 py-2 text-xs font-black text-white disabled:opacity-40">
                                                <XCircle size={14} /> {isPending ? "Rejecting..." : "Reject"}
                                            </button>
                                        </>
                                    ) : null}
                                    <button type="button" onClick={() => onHistory(request)} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">
                                        <History size={14} /> View History
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function LandlordBulkRoomApprovalTable({
    data,
    isPending,
    selectedIds = [],
    requests,
    onToggleSelected,
    onApprove,
    onReject,
    onViewDetails,
    readOnly = false,
}: {
    data: NotificationsCentreData;
    isPending: boolean;
    selectedIds?: string[];
    requests: NotificationLandlordBulkRoomRequest[];
    onToggleSelected?: (id: string) => void;
    onApprove: (request: NotificationLandlordBulkRoomRequest) => void;
    onReject: (request: NotificationLandlordBulkRoomRequest) => void;
    onViewDetails: (request: NotificationLandlordBulkRoomRequest) => void;
    readOnly?: boolean;
}) {
    return (
        <div className="overflow-x-auto">
            <table className="enterprise-table">
                <thead>
                    <tr>
                        {!readOnly ? <th className="text-left">Select</th> : null}
                        <th className="text-left">Submitted</th>
                        <th className="text-left">Office</th>
                        <th className="text-left">Landlord</th>
                        <th className="text-left">Rooms</th>
                        <th className="text-left">Occupied</th>
                        <th className="text-left">Vacant</th>
                        <th className="text-left">Opening Outstanding</th>
                        <th className="text-left">Rent Roll</th>
                        <th className="text-left">Requested By</th>
                        <th className="text-left">Status</th>
                        <th className="text-left">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {requests.length === 0 ? (
                        <tr><td colSpan={readOnly ? 11 : 12} className="p-6 text-sm font-bold text-slate-500">No new landlord and room inventory requests in this state.</td></tr>
                    ) : requests.map((request) => {
                        const summary = request.summary ?? {};
                        const landlordPayload = request.landlord_payload ?? {};
                        return (
                            <tr key={`landlord-bulk-room-approval:${request.id}`}>
                                {!readOnly ? (
                                    <td>
                                        {request.status === "pending" ? (
                                            <input checked={selectedIds.includes(request.id)} type="checkbox" onChange={() => onToggleSelected?.(request.id)} className="h-4 w-4 rounded border-slate-300 text-blue-700" />
                                        ) : null}
                                    </td>
                                ) : null}
                                <td>{formatDate(request.created_at)}</td>
                                <td>{lookup(data.lookups.offices, request.office_id, "Needs review")}</td>
                                <td className="font-black text-slate-950">{payloadText(landlordPayload, "landlordName", "New landlord")}</td>
                                <td>{payloadAmount(summary, "totalRooms").toLocaleString()}</td>
                                <td>{payloadAmount(summary, "occupiedRooms").toLocaleString()}</td>
                                <td>{payloadAmount(summary, "vacantRooms").toLocaleString()}</td>
                                <td>{money(payloadAmount(summary, "openingOutstanding"))}</td>
                                <td><span className="font-black text-blue-700">{money(payloadAmount(summary, "rentRoll"))}</span></td>
                                <td>{lookup(data.lookups.users, request.requested_by, "Unknown user")}</td>
                                <td><LandlordBulkRoomStatus request={request} /></td>
                                <td>
                                    <div className="flex flex-wrap gap-2">
                                        {!readOnly ? <button type="button" onClick={() => onViewDetails(request)} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">
                                            View Details
                                        </button> : null}
                                        {!readOnly && request.status === "pending" ? (
                                            <>
                                                <button type="button" disabled={isPending} onClick={() => onApprove(request)} className="inline-flex items-center gap-1 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-black text-white disabled:opacity-40">
                                                    <CheckCircle2 size={14} /> {isPending ? "Approving..." : "Approve"}
                                                </button>
                                                <button type="button" disabled={isPending} onClick={() => onReject(request)} className="inline-flex items-center gap-1 rounded-xl bg-red-700 px-3 py-2 text-xs font-black text-white disabled:opacity-40">
                                                    <XCircle size={14} /> {isPending ? "Rejecting..." : "Reject"}
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
    );
}

function OfficeNotificationFeed({ data }: { data: NotificationsCentreData }) {
    const officeRequests = data.requests.filter((request) => request.status !== "pending");
    const officePaymentDateRequests = data.paymentDateRequests.filter((request) => request.status !== "pending");
    const officeLandlordPaymentRequests = data.landlordPaymentRequests.filter((request) => request.status !== "pending");
    const officeLandlordPaymentDetailRequests = data.landlordPaymentDetailRequests.filter((request) => request.status !== "pending");
    const officeLandlordBulkRoomRequests = data.landlordBulkRoomRequests.filter((request) => request.status !== "pending");

    return (
        <div className="space-y-6">
            <section className="enterprise-panel overflow-hidden">
                <div className="border-b border-slate-200 p-5">
                    <h2 className="text-xl font-black text-slate-950">Rent Change Decisions</h2>
                    <p className="text-sm font-semibold text-slate-500">Approved and rejected room rent change requests for your office.</p>
                </div>
                <ApprovalTable
                    data={data}
                    isPending={false}
                    requests={officeRequests}
                    onApprove={() => undefined}
                    onReject={() => undefined}
                    onReason={() => undefined}
                    onHistory={() => undefined}
                />
            </section>
            <section className="enterprise-panel overflow-hidden">
                <div className="border-b border-slate-200 p-5">
                    <h2 className="text-xl font-black text-slate-950">Payment Date Change Decisions</h2>
                    <p className="text-sm font-semibold text-slate-500">Approved and rejected tenant payment date corrections for your office.</p>
                </div>
                <PaymentDateApprovalTable
                    data={data}
                    isPending={false}
                    requests={officePaymentDateRequests}
                    onApprove={() => undefined}
                    onReject={() => undefined}
                    onReason={() => undefined}
                    onHistory={() => undefined}
                />
            </section>
            <section className="enterprise-panel overflow-hidden">
                <div className="border-b border-slate-200 p-5">
                    <h2 className="text-xl font-black text-slate-950">Landlord Payment Decisions</h2>
                    <p className="text-sm font-semibold text-slate-500">Approved and rejected landlord payments submitted from Expenses.</p>
                </div>
                <LandlordPaymentApprovalTable
                    data={data}
                    isPending={false}
                    requests={officeLandlordPaymentRequests}
                    onApprove={() => undefined}
                    onReject={() => undefined}
                    onReason={() => undefined}
                    onHistory={() => undefined}
                />
            </section>
            <section className="enterprise-panel overflow-hidden">
                <div className="border-b border-slate-200 p-5">
                    <h2 className="text-xl font-black text-slate-950">Landlord Payment Detail Decisions</h2>
                    <p className="text-sm font-semibold text-slate-500">Approved and rejected mobile money or bank detail requests for your office landlords.</p>
                </div>
                <LandlordPaymentDetailApprovalTable
                    data={data}
                    isPending={false}
                    requests={officeLandlordPaymentDetailRequests}
                    onApprove={() => undefined}
                    onReject={() => undefined}
                    onReason={() => undefined}
                    onHistory={() => undefined}
                />
            </section>
            <section className="enterprise-panel overflow-hidden">
                <div className="border-b border-slate-200 p-5">
                    <h2 className="text-xl font-black text-slate-950">New Landlord & Room Decisions</h2>
                    <p className="text-sm font-semibold text-slate-500">Approved and rejected landlord inventory requests submitted by your office.</p>
                </div>
                <LandlordBulkRoomApprovalTable
                    data={data}
                    isPending={false}
                    requests={officeLandlordBulkRoomRequests}
                    onApprove={() => undefined}
                    onReject={() => undefined}
                    onViewDetails={() => undefined}
                    readOnly
                />
            </section>
        </div>
    );
}

function FilterButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
    return (
        <button type="button" onClick={onClick} className={`rounded-2xl px-4 py-2 text-sm font-black transition ${active ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
            {label}
        </button>
    );
}

function RequestStatus({ request }: { request: NotificationRentRequest }) {
    if (request.status === "approved" || request.status === "direct_admin_change") return <StatusChip label={request.status === "direct_admin_change" ? "admin changed" : "approved"} tone="green" />;
    if (request.status === "rejected") return <StatusChip label="rejected" tone="red" />;
    return <StatusChip label="pending" tone="orange" />;
}

function LandlordPaymentStatus({ request }: { request: NotificationLandlordPaymentRequest }) {
    if (request.status === "approved") return <StatusChip label="approved" tone="green" />;
    if (request.status === "rejected") return <StatusChip label="rejected" tone="red" />;
    return <StatusChip label="pending" tone="orange" />;
}

function LandlordPaymentDetailStatus({ request }: { request: NotificationLandlordPaymentDetailRequest }) {
    if (request.status === "approved") return <StatusChip label={request.is_default ? "default approved" : request.is_active ? "approved" : "approved"} tone="green" />;
    if (request.status === "rejected") return <StatusChip label="rejected" tone="red" />;
    if (request.status === "archived") return <StatusChip label="archived" tone="slate" />;
    return <StatusChip label="pending" tone="orange" />;
}

function LandlordBulkRoomStatus({ request }: { request: NotificationLandlordBulkRoomRequest }) {
    if (request.status === "approved") return <StatusChip label="approved" tone="green" />;
    if (request.status === "rejected") return <StatusChip label="rejected" tone="red" />;
    return <StatusChip label="pending" tone="orange" />;
}

function PaymentDateStatus({ request }: { request: NotificationPaymentDateRequest }) {
    if (request.status === "approved") return <StatusChip label="approved" tone="green" />;
    if (request.status === "rejected") return <StatusChip label="rejected" tone="red" />;
    return <StatusChip label="pending" tone="orange" />;
}

function PaymentDetailSummary({ request }: { request: NotificationLandlordPaymentDetailRequest }) {
    if (request.payment_method === "mobile_money") {
        return (
            <div className="space-y-1 text-xs font-bold text-slate-600">
                <p>{request.provider ?? request.mobile_money_provider ?? "Mobile money"}</p>
                <p>{request.account_number ?? request.mobile_money_number ?? "No number"}</p>
                <p>{request.account_name ?? request.mobile_money_account_name ?? "No account name"}</p>
            </div>
        );
    }
    if (request.payment_method === "bank") {
        return (
            <div className="space-y-1 text-xs font-bold text-slate-600">
                <p>{request.provider ?? request.bank_name ?? "No bank"}</p>
                <p>{request.account_number ?? request.bank_account_number ?? "No account number"}</p>
                <p>{request.account_name ?? request.bank_account_name ?? "No account name"}</p>
            </div>
        );
    }
    return <p className="text-xs font-bold text-slate-600">Cash payment. No account details required.</p>;
}

function LandlordBulkRoomRequestModal({
    actionLabel,
    data,
    decisionNote,
    isPending,
    modal,
    onApprove,
    onClose,
    onDecisionNoteChange,
    onReject,
    onSubmitRejectDecision,
}: {
    actionLabel: string | null;
    data: NotificationsCentreData;
    decisionNote: string;
    isPending: boolean;
    modal: LandlordBulkRoomModalState;
    onApprove: (request: NotificationLandlordBulkRoomRequest) => void;
    onClose: () => void;
    onDecisionNoteChange: (value: string) => void;
    onReject: (request: NotificationLandlordBulkRoomRequest) => void;
    onSubmitRejectDecision: () => void;
}) {
    if (!modal) return null;
    const { request } = modal;
    const landlord = request.landlord_payload ?? {};
    const rooms = Array.isArray(request.rooms_payload) ? request.rooms_payload : [];
    const summary = request.summary ?? {};
    const isReject = modal.type === "reject";

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
            <section className="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-[28px] bg-white shadow-2xl">
                <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-950 p-5 text-white">
                    <div>
                        <p className="text-xs font-black uppercase tracking-wide text-cyan-200">New Landlord & Room Inventory Approval</p>
                        <h2 className="mt-2 text-2xl font-black">{isReject ? "Reject inventory request" : payloadText(landlord, "landlordName", "New landlord")}</h2>
                        <p className="mt-1 text-sm font-semibold text-slate-300">
                            {lookup(data.lookups.offices, request.office_id, "Needs review")} · submitted {formatDate(request.created_at)}
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className="rounded-2xl bg-white/10 px-3 py-2 text-sm font-black text-white" disabled={isPending}>
                        Close
                    </button>
                </div>
                <div className="max-h-[calc(90vh-90px)] overflow-y-auto p-5">
                    <div className="grid gap-4 md:grid-cols-4">
                        <MiniSummary label="Rooms" value={payloadAmount(summary, "totalRooms").toLocaleString()} />
                        <MiniSummary label="Occupied" value={payloadAmount(summary, "occupiedRooms").toLocaleString()} />
                        <MiniSummary label="Vacant" value={payloadAmount(summary, "vacantRooms").toLocaleString()} />
                        <MiniSummary label="Rent Roll" value={money(payloadAmount(summary, "rentRoll"))} />
                    </div>

                    <div className="mt-5 grid gap-4 lg:grid-cols-[340px_1fr]">
                        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                            <h3 className="text-sm font-black uppercase text-slate-500">Landlord details</h3>
                            <div className="mt-3 space-y-2 text-sm font-bold text-slate-700">
                                <p><span className="text-slate-500">Name:</span> {payloadText(landlord, "landlordName", "New landlord")}</p>
                                <p><span className="text-slate-500">Phone:</span> {payloadText(landlord, "phone", "Not provided")}</p>
                                <p><span className="text-slate-500">Email:</span> {payloadText(landlord, "email", "Not provided")}</p>
                                <p><span className="text-slate-500">National ID:</span> {payloadText(landlord, "nationalId", "Not provided")}</p>
                                <p><span className="text-slate-500">Commission:</span> {payloadText(landlord, "commissionType", "percentage")} · {payloadAmount(landlord, "commissionValue").toLocaleString()}</p>
                                <p><span className="text-slate-500">Payment methods:</span> {payloadText(landlord, "paymentMethods", "Not provided")}</p>
                                <p><span className="text-slate-500">Requested by:</span> {lookup(data.lookups.users, request.requested_by, "Unknown user")}</p>
                                <p><span className="text-slate-500">Status:</span> {request.status}</p>
                            </div>
                            {payloadText(landlord, "notes") ? (
                                <p className="mt-3 rounded-2xl bg-white p-3 text-xs font-bold text-slate-600">{payloadText(landlord, "notes")}</p>
                            ) : null}
                        </div>

                        <div className="rounded-3xl border border-slate-200 bg-white">
                            <div className="border-b border-slate-200 p-4">
                                <h3 className="text-sm font-black uppercase text-slate-500">Submitted rooms and tenants</h3>
                                <p className="mt-1 text-xs font-bold text-slate-500">Occupied rooms create tenants on approval. Vacant rooms go live as available inventory.</p>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="enterprise-table">
                                    <thead>
                                        <tr>
                                            <th className="text-left">Room</th>
                                            <th className="text-left">Status</th>
                                            <th className="text-left">Rent</th>
                                            <th className="text-left">Property/location</th>
                                            <th className="text-left">Tenant</th>
                                            <th className="text-left">Tenant phone</th>
                                            <th className="text-left">Opening outstanding</th>
                                            <th className="text-left">Move-in/start</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rooms.length === 0 ? (
                                            <tr><td colSpan={8} className="p-5 text-sm font-bold text-slate-500">No room details stored on this request.</td></tr>
                                        ) : rooms.map((room, index) => (
                                            <tr key={`${request.id}:room:${payloadText(room, "roomNumber", String(index))}:${index}`}>
                                                <td className="font-black text-slate-950">{payloadText(room, "roomNumber", "Unnumbered")}</td>
                                                <td><StatusChip label={payloadText(room, "status", "vacant")} tone={payloadText(room, "status") === "occupied" ? "green" : "orange"} /></td>
                                                <td>{money(payloadAmount(room, "monthlyRent"))}</td>
                                                <td>{payloadText(room, "propertyName", payloadText(room, "location", "Not provided"))}</td>
                                                <td>{payloadText(room, "tenantName", "No tenant")}</td>
                                                <td>{payloadText(room, "tenantPhone", "Not provided")}</td>
                                                <td>{payloadText(room, "outstandingMode") === "has_outstanding" ? money(payloadAmount(room, "outstandingBalance")) : "UGX 0"}</td>
                                                <td>{payloadText(room, "moveInDate", payloadText(room, "startDate", "Not dated"))}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    {isReject ? (
                        <div className="mt-5 rounded-3xl border border-red-200 bg-red-50 p-4">
                            <label className="text-xs font-black uppercase text-red-700">Rejection reason</label>
                            <textarea value={decisionNote} onChange={(event) => onDecisionNoteChange(event.target.value)} className="mt-2 min-h-28 w-full rounded-2xl border border-red-200 bg-white p-3 text-sm font-bold text-slate-800 outline-none focus:border-red-500" />
                        </div>
                    ) : null}

                    <div className="mt-5 flex flex-wrap justify-end gap-3">
                        {!isReject && request.status === "pending" ? (
                            <>
                                <button type="button" disabled={isPending} onClick={() => onReject(request)} className="rounded-2xl bg-red-700 px-5 py-3 text-sm font-black text-white disabled:opacity-50">
                                    Reject
                                </button>
                                <button type="button" disabled={isPending} onClick={() => onApprove(request)} className="rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-black text-white disabled:opacity-50">
                                    {isPending ? actionLabel ?? "Approving..." : "Approve and Create Live"}
                                </button>
                            </>
                        ) : null}
                        {isReject ? (
                            <button type="button" disabled={isPending} onClick={onSubmitRejectDecision} className="rounded-2xl bg-red-700 px-5 py-3 text-sm font-black text-white disabled:opacity-50">
                                {isPending ? actionLabel ?? "Rejecting..." : "Confirm Rejection"}
                            </button>
                        ) : null}
                    </div>
                </div>
            </section>
        </div>
    );
}

function MiniSummary({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-black uppercase text-slate-500">{label}</p>
            <p className="mt-2 text-xl font-black text-slate-950">{value}</p>
        </div>
    );
}

function RequestModal({
    actionLabel,
    auditEvents,
    data,
    decisionNote,
    isPending,
    modal,
    onClose,
    onDecisionNoteChange,
    onSubmitRejectDecision,
    relatedHistory,
}: {
    actionLabel: string | null;
    auditEvents: NotificationAuditRow[];
    data: NotificationsCentreData;
    decisionNote: string;
    isPending: boolean;
    modal: ModalState;
    onClose: () => void;
    onDecisionNoteChange: (value: string) => void;
    onSubmitRejectDecision: () => void;
    relatedHistory: NotificationRentRequest[];
}) {
    if (!modal) return null;

    const { request } = modal;
    const title = modal.type === "reject"
            ? "Reject Rent Change"
            : modal.type === "reason"
                ? "Full Request Reason"
                : "Rent Change History";
    const tenant = lookup(data.lookups.tenants, request.tenant_id, "Vacant / no tenant");
    const room = lookup(data.lookups.rooms, request.room_id, "Unnumbered");
    const landlord = lookup(data.lookups.landlords, request.landlord_id, "No landlord");
    const office = lookup(data.lookups.offices, request.office_id, "Needs review");
    const requester = lookup(data.lookups.users, request.requested_by, "Unknown user");

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
            <div className="max-h-[88vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl">
                <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white/95 p-5 backdrop-blur">
                    <div>
                        <p className="text-xs font-black uppercase text-blue-700">Admin Notifications</p>
                        <h2 className="mt-1 text-2xl font-black text-slate-950">{title}</h2>
                        <p className="mt-1 text-sm font-semibold text-slate-500">{tenant} · Room {room} · {office}</p>
                    </div>
                    <button type="button" disabled={isPending} onClick={onClose} className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-700 disabled:opacity-40">
                        Close
                    </button>
                </div>

                <div className="space-y-5 p-5">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <Detail label="Tenant" value={tenant} />
                        <Detail label="Room" value={room} />
                        <Detail label="Landlord" value={landlord} />
                        <Detail label="Office" value={office} />
                        <Detail label="Current Rent" value={money(request.old_rent)} />
                        <Detail label="Proposed Rent" value={money(request.new_rent)} />
                        <Detail label="Difference" value={money(Number(request.new_rent ?? 0) - Number(request.old_rent ?? 0))} />
                        <Detail label="Requested By" value={requester} />
                        <Detail label="Request Date" value={formatDate(request.created_at)} />
                        <Detail label="Effective Date" value={formatDate(request.effective_date)} />
                        <Detail label="Status" value={request.status} />
                        <Detail label="Decision Date" value={formatDate(request.decided_at)} />
                    </div>

                    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <h3 className="text-sm font-black uppercase text-slate-500">Full Reason</h3>
                        <p className="mt-2 whitespace-pre-wrap text-base font-semibold leading-7 text-slate-900">{request.reason || "No reason provided."}</p>
                    </section>

                    {modal.type === "reject" ? (
                        <section className="rounded-2xl border border-slate-200 bg-white p-4">
                            <label className="text-sm font-black text-slate-700">
                                Rejection reason
                            </label>
                            <textarea
                                value={decisionNote}
                                onChange={(event) => onDecisionNoteChange(event.target.value)}
                                className="mt-2 min-h-28 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                                placeholder="Required reason sent to the office account..."
                            />
                            <div className="mt-4 flex flex-wrap justify-end gap-2">
                                <button type="button" disabled={isPending} onClick={onClose} className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-700 disabled:opacity-40">
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    disabled={isPending}
                                    onClick={onSubmitRejectDecision}
                                    className="rounded-2xl bg-red-700 px-5 py-3 text-sm font-black text-white disabled:opacity-40"
                                >
                                    {actionLabel ?? "Reject Request"}
                                </button>
                            </div>
                        </section>
                    ) : null}

                    {modal.type === "history" ? (
                        <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <h3 className="text-sm font-black uppercase text-slate-500">Request History</h3>
                                <div className="mt-3 space-y-3">
                                    {relatedHistory.map((history) => (
                                        <div key={history.id} className="rounded-2xl bg-slate-50 p-4">
                                            <div className="flex items-center justify-between gap-3">
                                                <RequestStatus request={history} />
                                                <span className="text-xs font-bold text-slate-500">{formatDate(history.created_at)}</span>
                                            </div>
                                            <p className="mt-2 text-sm font-black text-slate-950">{money(history.old_rent)} → {money(history.new_rent)}</p>
                                            <p className="mt-1 text-sm font-semibold text-slate-600">{history.reason}</p>
                                            {history.admin_comment ? <p className="mt-2 text-xs font-bold text-slate-500">Admin decision: {history.admin_comment}</p> : null}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <h3 className="text-sm font-black uppercase text-slate-500">Audit Events</h3>
                                <div className="mt-3 space-y-3">
                                    {auditEvents.length === 0 ? (
                                        <p className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-500">No audit events found for this request yet.</p>
                                    ) : auditEvents.map((event) => (
                                        <div key={event.id} className="rounded-2xl bg-slate-50 p-4">
                                            <p className="text-sm font-black text-slate-950">{event.action}</p>
                                            <p className="mt-1 text-xs font-bold text-slate-500">{formatDate(event.created_at)} · {lookup(data.lookups.users, event.actor_id, "System / unknown user")}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </section>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

function PaymentDateRequestModal({
    actionLabel,
    auditEvents,
    data,
    decisionNote,
    isPending,
    modal,
    onClose,
    onDecisionNoteChange,
    onSubmitRejectDecision,
    relatedHistory,
}: {
    actionLabel: string | null;
    auditEvents: NotificationAuditRow[];
    data: NotificationsCentreData;
    decisionNote: string;
    isPending: boolean;
    modal: PaymentModalState;
    onClose: () => void;
    onDecisionNoteChange: (value: string) => void;
    onSubmitRejectDecision: () => void;
    relatedHistory: NotificationPaymentDateRequest[];
}) {
    if (!modal) return null;

    const { request } = modal;
    const payment = paymentLookup(data, request.payment_id);
    const title = modal.type === "reject"
        ? "Reject Payment Correction"
        : modal.type === "reason"
            ? "Full Payment Correction Reason"
            : "Payment Correction History";
    const tenant = lookup(data.lookups.tenants, request.tenant_id, "Unknown tenant");
    const room = lookup(data.lookups.rooms, request.room_id, "Unknown room");
    const office = lookup(data.lookups.offices, request.office_id, "Needs review");
    const requester = lookup(data.lookups.users, request.requested_by, "Unknown user");
    const reviewer = lookup(data.lookups.users, request.reviewed_by, "Not reviewed");

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
            <div className="max-h-[88vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl">
                <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white/95 p-5 backdrop-blur">
                    <div>
                        <p className="text-xs font-black uppercase text-blue-700">Admin Notifications</p>
                        <h2 className="mt-1 text-2xl font-black text-slate-950">{title}</h2>
                        <p className="mt-1 text-sm font-semibold text-slate-500">{tenant} · Room {room} · {office}</p>
                    </div>
                    <button type="button" disabled={isPending} onClick={onClose} className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-700 disabled:opacity-40">
                        Close
                    </button>
                </div>

                <div className="space-y-5 p-5">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <Detail label="Tenant" value={tenant} />
                        <Detail label="Room" value={room} />
                        <Detail label="Office" value={office} />
                        <Detail label="Amount Paid" value={money(payment?.amount ?? 0)} />
                        <Detail label="Correction Type" value={correctionTypeName(request.correction_type)} />
                        <Detail label="Current Value" value={correctionOriginalValue(data, request, payment?.amount ?? 0)} />
                        <Detail label="Requested Value" value={correctionRequestedValue(data, request)} />
                        <Detail label="Requested By" value={requester} />
                        <Detail label="Submitted" value={formatDate(request.created_at)} />
                        <Detail label="Status" value={request.status} />
                        <Detail label="Reviewed By" value={reviewer} />
                        <Detail label="Reviewed At" value={formatDate(request.reviewed_at)} />
                        <Detail label="Payment Method" value={payment?.method?.replaceAll("_", " ") ?? "Not recorded"} />
                    </div>

                    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <h3 className="text-sm font-black uppercase text-slate-500">Full Reason</h3>
                        <p className="mt-2 whitespace-pre-wrap text-base font-semibold leading-7 text-slate-900">{request.reason || "No reason provided."}</p>
                    </section>

                    {modal.type === "reject" ? (
                        <section className="rounded-2xl border border-slate-200 bg-white p-4">
                            <label className="text-sm font-black text-slate-700">
                                Rejection reason
                            </label>
                            <textarea
                                value={decisionNote}
                                onChange={(event) => onDecisionNoteChange(event.target.value)}
                                className="mt-2 min-h-28 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                                placeholder="Required reason sent to the office account..."
                            />
                            <div className="mt-4 flex flex-wrap justify-end gap-2">
                                <button type="button" disabled={isPending} onClick={onClose} className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-700 disabled:opacity-40">
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    disabled={isPending}
                                    onClick={onSubmitRejectDecision}
                                    className="rounded-2xl bg-red-700 px-5 py-3 text-sm font-black text-white disabled:opacity-40"
                                >
                                    {actionLabel ?? "Reject Request"}
                                </button>
                            </div>
                        </section>
                    ) : null}

                    {modal.type === "history" ? (
                        <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <h3 className="text-sm font-black uppercase text-slate-500">Request History</h3>
                                <div className="mt-3 space-y-3">
                                    {relatedHistory.length === 0 ? (
                                        <p className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-500">No history found for this payment.</p>
                                    ) : relatedHistory.map((history) => (
                                        <div key={history.id} className="rounded-2xl bg-slate-50 p-4">
                                            <div className="flex items-center justify-between gap-3">
                                                <PaymentDateStatus request={history} />
                                                <span className="text-xs font-bold text-slate-500">{formatDate(history.created_at)}</span>
                                            </div>
                                            <p className="mt-2 text-sm font-black text-slate-950">{correctionOriginalValue(data, history, payment?.amount ?? 0)} → {correctionRequestedValue(data, history)}</p>
                                            <p className="mt-1 text-sm font-semibold text-slate-600">{history.reason}</p>
                                            {history.admin_comment ? <p className="mt-2 text-xs font-bold text-slate-500">Admin decision: {history.admin_comment}</p> : null}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <h3 className="text-sm font-black uppercase text-slate-500">Audit Events</h3>
                                <div className="mt-3 space-y-3">
                                    {auditEvents.length === 0 ? (
                                        <p className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-500">No audit events found for this request yet.</p>
                                    ) : auditEvents.map((event) => (
                                        <div key={event.id} className="rounded-2xl bg-slate-50 p-4">
                                            <p className="text-sm font-black text-slate-950">{event.action}</p>
                                            <p className="mt-1 text-xs font-bold text-slate-500">{formatDate(event.created_at)} · {lookup(data.lookups.users, event.actor_id, "System / unknown user")}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </section>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

function BalanceAdjustmentRequestModal({
    actionLabel,
    data,
    decisionNote,
    isPending,
    modal,
    onClose,
    onDecisionNoteChange,
    onSubmitRejectDecision,
}: {
    actionLabel: string | null;
    data: NotificationsCentreData;
    decisionNote: string;
    isPending: boolean;
    modal: BalanceAdjustmentModalState;
    onClose: () => void;
    onDecisionNoteChange: (value: string) => void;
    onSubmitRejectDecision: () => void;
}) {
    if (!modal) return null;
    const request = modal.request;
    const isReject = modal.type === "reject";
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
            <div className="w-full max-w-xl rounded-[28px] border border-slate-200 bg-white shadow-2xl">
                <div className="border-b border-slate-200 p-5">
                    <p className="text-xs font-black uppercase tracking-wide text-blue-700">Outstanding balance adjustment</p>
                    <h2 className="mt-2 text-2xl font-black text-slate-950">{isReject ? "Reject balance adjustment" : "Balance adjustment details"}</h2>
                </div>
                <div className="grid gap-3 p-5 sm:grid-cols-2">
                    <Detail label="Room" value={lookup(data.lookups.rooms, request.room_id, "Unknown room")} />
                    <Detail label="Tenant" value={lookup(data.lookups.tenants, request.tenant_id, "Unknown tenant")} />
                    <Detail label="Office" value={lookup(data.lookups.offices, request.office_id, "Needs review")} />
                    <Detail label="Effective date" value={formatDate(request.effective_date)} />
                    <Detail label="Old balance" value={money(request.old_balance)} />
                    <Detail label="New balance" value={money(request.new_balance)} />
                    <Detail label="Adjustment" value={money(request.adjustment_amount)} />
                    <Detail label="Requested by" value={lookup(data.lookups.users, request.requested_by, "Unknown user")} />
                    <div className="sm:col-span-2 rounded-2xl bg-slate-50 p-4">
                        <p className="text-xs font-black uppercase text-slate-500">Reason</p>
                        <p className="mt-1 text-sm font-bold text-slate-800">{request.reason || "No reason supplied."}</p>
                        {request.notes ? <p className="mt-2 text-xs font-semibold text-slate-500">{request.notes}</p> : null}
                    </div>
                    {isReject ? (
                        <label className="sm:col-span-2">
                            <span className="text-sm font-black text-slate-700">Rejection reason</span>
                            <textarea
                                value={decisionNote}
                                onChange={(event) => onDecisionNoteChange(event.target.value)}
                                className="mt-2 min-h-28 w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                                placeholder="Explain why this balance change is rejected..."
                            />
                        </label>
                    ) : null}
                </div>
                <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 p-5">
                    <button type="button" disabled={isPending} onClick={onClose} className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-slate-700 shadow disabled:opacity-40">
                        Close
                    </button>
                    {isReject ? (
                        <button type="button" disabled={isPending} onClick={onSubmitRejectDecision} className="rounded-2xl bg-red-700 px-5 py-3 text-sm font-black text-white disabled:opacity-40">
                            {actionLabel ?? "Reject Request"}
                        </button>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

function LandlordPaymentRequestModal({
    actionLabel,
    auditEvents,
    data,
    decisionNote,
    isPending,
    modal,
    onClose,
    onDecisionNoteChange,
    onSubmitRejectDecision,
    relatedHistory,
}: {
    actionLabel: string | null;
    auditEvents: NotificationAuditRow[];
    data: NotificationsCentreData;
    decisionNote: string;
    isPending: boolean;
    modal: LandlordPaymentModalState;
    onClose: () => void;
    onDecisionNoteChange: (value: string) => void;
    onSubmitRejectDecision: () => void;
    relatedHistory: NotificationLandlordPaymentRequest[];
}) {
    if (!modal) return null;

    const { request } = modal;
    const title = modal.type === "reject"
        ? "Reject Landlord Payment"
        : modal.type === "reason"
            ? "Full Landlord Payment Note"
            : "Landlord Payment History";
    const landlord = lookup(data.lookups.landlords, request.landlord_id, "Unknown landlord");
    const office = lookup(data.lookups.offices, request.office_id, "Needs review");
    const requester = lookup(data.lookups.users, request.submitted_by, "Unknown user");
    const reviewer = lookup(data.lookups.users, request.reviewed_by, "Not reviewed");

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
            <div className="max-h-[88vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl">
                <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white/95 p-5 backdrop-blur">
                    <div>
                        <p className="text-xs font-black uppercase text-blue-700">Admin Notifications</p>
                        <h2 className="mt-1 text-2xl font-black text-slate-950">{title}</h2>
                        <p className="mt-1 text-sm font-semibold text-slate-500">{landlord} · {office}</p>
                    </div>
                    <button type="button" disabled={isPending} onClick={onClose} className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-700 disabled:opacity-40">
                        Close
                    </button>
                </div>

                <div className="space-y-5 p-5">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <Detail label="Office" value={office} />
                        <Detail label="Landlord" value={landlord} />
                        <Detail label="Amount" value={money(request.requested_amount)} />
                        <Detail label="Normal Payment Portion" value={money(request.normal_payment_amount ?? request.requested_amount)} />
                        <Detail label="Advance Portion" value={money(request.advance_amount ?? 0)} />
                        <Detail label="Current Net Payable" value={money(request.current_net_payable ?? 0)} />
                        <Detail label="Already Paid" value={money(request.already_paid_amount ?? 0)} />
                        <Detail label="Outstanding" value={money(request.outstanding_amount ?? 0)} />
                        <Detail label="Flag Reason" value={String(request.flag_reason ?? "normal_payment").replaceAll("_", " ")} />
                        <Detail label="Payment Date" value={formatDate(request.payment_date)} />
                        <Detail label="Payment Month" value={formatDate(request.payment_month)} />
                        <Detail label="Method" value={request.payment_method.replaceAll("_", " ")} />
                        <Detail label="Submitted By" value={requester} />
                        <Detail label="Submitted" value={formatDate(request.created_at)} />
                        <Detail label="Status" value={request.status} />
                        <Detail label="Reviewed By" value={reviewer} />
                        <Detail label="Reviewed At" value={formatDate(request.reviewed_at)} />
                        <Detail label="Admin Comment" value={request.admin_comment ?? "No comment"} />
                        <Detail label="Linked Payment" value={request.approved_landlord_payment_id ?? "Not approved"} />
                        <Detail label="Linked Advance" value={request.approved_advance_id ?? "No advance"} />
                    </div>

                    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <h3 className="text-sm font-black uppercase text-slate-500">Full Note / Reason</h3>
                        <p className="mt-2 whitespace-pre-wrap text-base font-semibold leading-7 text-slate-900">{request.notes || "No note provided."}</p>
                    </section>

                    {modal.type === "reject" ? (
                        <section className="rounded-2xl border border-slate-200 bg-white p-4">
                            <label className="text-sm font-black text-slate-700">Rejection reason</label>
                            <textarea
                                value={decisionNote}
                                onChange={(event) => onDecisionNoteChange(event.target.value)}
                                className="mt-2 min-h-28 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                                placeholder="Required reason sent to the office account..."
                            />
                            <div className="mt-4 flex flex-wrap justify-end gap-2">
                                <button type="button" disabled={isPending} onClick={onClose} className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-700 disabled:opacity-40">
                                    Cancel
                                </button>
                                <button type="button" disabled={isPending} onClick={onSubmitRejectDecision} className="rounded-2xl bg-red-700 px-5 py-3 text-sm font-black text-white disabled:opacity-40">
                                    {actionLabel ?? "Reject Request"}
                                </button>
                            </div>
                        </section>
                    ) : null}

                    {modal.type === "history" ? (
                        <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <h3 className="text-sm font-black uppercase text-slate-500">Landlord Payment Request History</h3>
                                <div className="mt-3 space-y-3">
                                    {relatedHistory.length === 0 ? (
                                        <p className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-500">No history found for this landlord.</p>
                                    ) : relatedHistory.map((history) => (
                                        <div key={history.id} className="rounded-2xl bg-slate-50 p-4">
                                            <div className="flex items-center justify-between gap-3">
                                                <LandlordPaymentStatus request={history} />
                                                <span className="text-xs font-bold text-slate-500">{formatDate(history.created_at)}</span>
                                            </div>
                                            <p className="mt-2 text-sm font-black text-slate-950">{money(history.requested_amount)} · {history.payment_method.replaceAll("_", " ")}</p>
                                            <p className="mt-1 text-sm font-semibold text-slate-600">{history.notes || "No note"}</p>
                                            {history.admin_comment ? <p className="mt-2 text-xs font-bold text-slate-500">Admin decision: {history.admin_comment}</p> : null}
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <h3 className="text-sm font-black uppercase text-slate-500">Audit Events</h3>
                                <div className="mt-3 space-y-3">
                                    {auditEvents.length === 0 ? (
                                        <p className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-500">No audit events found for this request yet.</p>
                                    ) : auditEvents.map((event) => (
                                        <div key={event.id} className="rounded-2xl bg-slate-50 p-4">
                                            <p className="text-sm font-black text-slate-950">{event.action}</p>
                                            <p className="mt-1 text-xs font-bold text-slate-500">{formatDate(event.created_at)} · {lookup(data.lookups.users, event.actor_id, "System / unknown user")}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </section>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

function LandlordPaymentDetailRequestModal({
    actionLabel,
    auditEvents,
    data,
    decisionNote,
    isPending,
    modal,
    onClose,
    onDecisionNoteChange,
    onSubmitRejectDecision,
    relatedHistory,
}: {
    actionLabel: string | null;
    auditEvents: NotificationAuditRow[];
    data: NotificationsCentreData;
    decisionNote: string;
    isPending: boolean;
    modal: LandlordPaymentDetailModalState;
    onClose: () => void;
    onDecisionNoteChange: (value: string) => void;
    onSubmitRejectDecision: () => void;
    relatedHistory: NotificationLandlordPaymentDetailRequest[];
}) {
    if (!modal) return null;

    const { request } = modal;
    const title = modal.type === "reject"
        ? "Reject Landlord Payment Details"
        : modal.type === "reason"
            ? "Full Payment Detail Request"
            : "Payment Detail History";
    const landlord = lookup(data.lookups.landlords, request.landlord_id, "Unknown landlord");
    const office = lookup(data.lookups.offices, request.office_id, "Needs review");
    const requester = lookup(data.lookups.users, request.requested_by, "Unknown user");
    const reviewer = lookup(data.lookups.users, request.approved_by, "Not reviewed");

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
            <div className="max-h-[88vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl">
                <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white/95 p-5 backdrop-blur">
                    <div>
                        <p className="text-xs font-black uppercase text-blue-700">Admin Notifications</p>
                        <h2 className="mt-1 text-2xl font-black text-slate-950">{title}</h2>
                        <p className="mt-1 text-sm font-semibold text-slate-500">{landlord} · {office}</p>
                    </div>
                    <button type="button" disabled={isPending} onClick={onClose} className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-700 disabled:opacity-40">
                        Close
                    </button>
                </div>

                <div className="space-y-5 p-5">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <Detail label="Office" value={office} />
                        <Detail label="Landlord" value={landlord} />
                        <Detail label="Label" value={request.label ?? "No label"} />
                        <Detail label="Payment Method" value={request.payment_method.replaceAll("_", " ")} />
                        <Detail label="Provider" value={request.provider ?? request.mobile_money_provider ?? request.bank_name ?? "Not applicable"} />
                        <Detail label="Account / Phone Number" value={request.account_number ?? request.mobile_money_number ?? request.bank_account_number ?? "Not applicable"} />
                        <Detail label="Account Name" value={request.account_name ?? request.mobile_money_account_name ?? request.bank_account_name ?? "Not applicable"} />
                        <Detail label="Branch / Notes" value={request.branch ?? "Not recorded"} />
                        <Detail label="Submitted By" value={requester} />
                        <Detail label="Submitted" value={formatDate(request.created_at)} />
                        <Detail label="Status" value={request.status} />
                        <Detail label="Active" value={request.is_active ? "Yes" : "No"} />
                        <Detail label="Default" value={request.is_default ? "Yes" : "No"} />
                        <Detail label="Reviewed By" value={reviewer} />
                        <Detail label="Reviewed At" value={formatDate(request.approved_at)} />
                    </div>

                    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <h3 className="text-sm font-black uppercase text-slate-500">Full Note / Admin Comment</h3>
                        <p className="mt-2 whitespace-pre-wrap text-base font-semibold leading-7 text-slate-900">{request.notes || request.admin_comment || "No note provided."}</p>
                    </section>

                    {modal.type === "reject" ? (
                        <section className="rounded-2xl border border-slate-200 bg-white p-4">
                            <label className="text-sm font-black text-slate-700">Rejection reason</label>
                            <textarea
                                value={decisionNote}
                                onChange={(event) => onDecisionNoteChange(event.target.value)}
                                className="mt-2 min-h-28 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                                placeholder="Required reason sent to the office account..."
                            />
                            <div className="mt-4 flex flex-wrap justify-end gap-2">
                                <button type="button" disabled={isPending} onClick={onClose} className="rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-700 disabled:opacity-40">
                                    Cancel
                                </button>
                                <button type="button" disabled={isPending} onClick={onSubmitRejectDecision} className="rounded-2xl bg-red-700 px-5 py-3 text-sm font-black text-white disabled:opacity-40">
                                    {actionLabel ?? "Reject Details"}
                                </button>
                            </div>
                        </section>
                    ) : null}

                    {modal.type === "history" ? (
                        <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <h3 className="text-sm font-black uppercase text-slate-500">Payment Detail History</h3>
                                <div className="mt-3 space-y-3">
                                    {relatedHistory.length === 0 ? (
                                        <p className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-500">No history found for this landlord.</p>
                                    ) : relatedHistory.map((history) => (
                                        <div key={history.id} className="rounded-2xl bg-slate-50 p-4">
                                            <div className="flex items-center justify-between gap-3">
                                                <LandlordPaymentDetailStatus request={history} />
                                                <span className="text-xs font-bold text-slate-500">{formatDate(history.created_at)}</span>
                                            </div>
                                            <p className="mt-2 text-sm font-black capitalize text-slate-950">{history.payment_method.replaceAll("_", " ")}</p>
                                            <div className="mt-2"><PaymentDetailSummary request={history} /></div>
                                            {history.admin_comment ? <p className="mt-2 text-xs font-bold text-slate-500">Admin decision: {history.admin_comment}</p> : null}
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <h3 className="text-sm font-black uppercase text-slate-500">Audit Events</h3>
                                <div className="mt-3 space-y-3">
                                    {auditEvents.length === 0 ? (
                                        <p className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-500">No audit events found for this request yet.</p>
                                    ) : auditEvents.map((event) => (
                                        <div key={event.id} className="rounded-2xl bg-slate-50 p-4">
                                            <p className="text-sm font-black text-slate-950">{event.action}</p>
                                            <p className="mt-1 text-xs font-bold text-slate-500">{formatDate(event.created_at)} · {lookup(data.lookups.users, event.actor_id, "System / unknown user")}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </section>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

function Detail({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-black uppercase text-slate-500">{label}</p>
            <p className="mt-1 text-sm font-black text-slate-950">{value}</p>
        </div>
    );
}
