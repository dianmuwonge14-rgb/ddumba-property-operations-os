import { requireAuth } from "@/lib/auth/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AuthContext } from "@/lib/auth/types";
import { buildLandlordPaymentAllocationPlan, landlordMonthlyDue, normalizeSettlementTiming, summarizeLandlordPayables } from "@/lib/landlord-payables/payment-allocation";

type Db = {
    from: (table: string) => any;
};

const INITIAL_APPROVAL_LIMIT = 250;
const DEFAULT_NOTIFICATION_PAGE_SIZE = 10;
const MAX_NOTIFICATION_PAGE_SIZE = 50;

export type NotificationStatusFilter = "all" | "unread" | "read" | "pending" | "approved" | "rejected";
export type NotificationTypeFilter =
    | "all"
    | "payments"
    | "manual_adjustments"
    | "landlord_payments"
    | "expenses"
    | "salaries"
    | "vacate_requests"
    | "security_deposits"
    | "attendance"
    | "cash_banking"
    | "system";

export type NotificationFeedFilters = {
    officeId: string;
    page: number;
    pageSize: number;
    query: string;
    status: NotificationStatusFilter;
    type: NotificationTypeFilter;
};

export type NotificationRentRequest = {
    id: string;
    company_id: string;
    office_id: string | null;
    property_id: string | null;
    room_id: string;
    landlord_id: string | null;
    tenant_id: string | null;
    old_rent: number | string;
    new_rent: number | string;
    reason: string;
    effective_date: string;
    status: "pending" | "approved" | "rejected" | "direct_admin_change" | string;
    admin_comment: string | null;
    requested_by: string | null;
    decided_by: string | null;
    decided_at: string | null;
    created_at: string;
    updated_at: string;
};

export type NotificationPaymentDateRequest = {
    id: string;
    company_id: string;
    office_id: string | null;
    payment_id: string;
    room_id: string | null;
    tenant_id: string | null;
    correction_type?: "date_change" | "amount_change" | "room_change" | "remove_payment" | string;
    original_payment_date: string | null;
    requested_payment_date: string | null;
    original_amount?: number | string | null;
    requested_amount?: number | string | null;
    original_room_id?: string | null;
    requested_room_id?: string | null;
    original_tenant_id?: string | null;
    requested_tenant_id?: string | null;
    original_value?: Record<string, unknown> | null;
    requested_value?: Record<string, unknown> | null;
    reason: string;
    status: "pending" | "approved" | "rejected" | string;
    requested_by: string | null;
    reviewed_by: string | null;
    reviewed_at: string | null;
    admin_comment: string | null;
    created_at: string;
    updated_at: string;
};

export type NotificationTenantBalanceAdjustmentRequest = {
    id: string;
    company_id: string;
    office_id: string | null;
    room_id: string | null;
    tenant_id: string | null;
    old_balance: number | string;
    new_balance: number | string;
    adjustment_amount: number | string;
    effective_date: string;
    reason: string;
    notes: string | null;
    status: "pending" | "approved" | "rejected" | "direct_admin_change" | string;
    requested_by: string | null;
    approved_by: string | null;
    approved_at: string | null;
    admin_comment: string | null;
    created_at: string;
    updated_at: string;
};

export type NotificationPromiseChangeRequest = {
    id: string;
    company_id: string;
    office_id: string | null;
    promise_id: string;
    tenant_id: string | null;
    room_id: string | null;
    change_type: string;
    original_value: Record<string, unknown> | null;
    requested_value: Record<string, unknown> | null;
    reason: string;
    status: "pending" | "approved" | "rejected" | string;
    requested_by: string | null;
    requested_by_account_type: string | null;
    reviewed_by: string | null;
    reviewed_at: string | null;
    admin_comment: string | null;
    created_at: string | null;
    updated_at: string | null;
};

export type NotificationLandlordPaymentRequest = {
    id: string;
    company_id: string;
    office_id: string;
    landlord_id: string;
    expense_id: string | null;
    monthly_payable_id: string | null;
    requested_amount: number | string;
    normal_payment_amount?: number | string;
    advance_amount?: number | string;
    advance_recovery_amount?: number | string;
    advance_balance_after?: number | string;
    advance_balance_before?: number | string;
    cash_payment_amount?: number | string;
    current_net_payable?: number | string;
    already_paid_amount?: number | string;
    outstanding_amount?: number | string;
    active_advance_balance?: number | string;
    pending_request_amount?: number | string;
    flag_reason?: string | null;
    payment_month?: string | null;
    payment_date: string;
    payment_method: string;
    notes: string | null;
    status: "pending" | "approved" | "rejected" | string;
    submitted_by: string | null;
    reviewed_by: string | null;
    reviewed_at: string | null;
    admin_comment: string | null;
    approved_landlord_payment_id: string | null;
    approved_advance_id?: string | null;
    advance_agreement?: Record<string, unknown> | null;
    created_at: string | null;
    updated_at: string | null;
};

export type NotificationLandlordPaymentDetailRequest = {
    id: string;
    company_id: string;
    office_id: string | null;
    landlord_id: string;
    payment_method: "cash" | "mobile_money" | "bank" | string;
    label: string | null;
    provider: string | null;
    account_name: string | null;
    account_number: string | null;
    mobile_money_provider: string | null;
    mobile_money_number: string | null;
    mobile_money_account_name: string | null;
    bank_name: string | null;
    bank_account_number: string | null;
    bank_account_name: string | null;
    branch: string | null;
    notes: string | null;
    status: "pending" | "approved" | "rejected" | "archived" | string;
    is_active: boolean | null;
    is_default: boolean | null;
    requested_by: string | null;
    approved_by: string | null;
    approved_at: string | null;
    admin_comment: string | null;
    created_at: string | null;
    updated_at: string | null;
};

export type NotificationLandlordBulkRoomRequest = {
    id: string;
    company_id: string;
    office_id: string;
    requested_by: string | null;
    reviewed_by: string | null;
    reviewed_at: string | null;
    status: "pending" | "approved" | "rejected" | string;
    landlord_payload: Record<string, unknown> | null;
    rooms_payload: Array<Record<string, unknown>> | null;
    summary: Record<string, unknown> | null;
    created_landlord_id: string | null;
    admin_comment: string | null;
    created_at: string | null;
    updated_at: string | null;
};

export type NotificationExpenseApprovalRequest = {
    id: string;
    company_id: string | null;
    office_id: string | null;
    amount: number | string | null;
    category: string | null;
    item: string | null;
    description: string | null;
    expense_date: string | null;
    expense_number: string | null;
    payment_method?: string | null;
    submitted_by: string | null;
    approved_by: string | null;
    approved_at: string | null;
    status: "pending" | "approved" | "rejected" | string;
    created_at: string | null;
};

export type NotificationFeedRow = {
    id: string;
    company_id: string | null;
    office_id: string | null;
    title: string | null;
    message: string | null;
    action_url?: string | null;
    entity_type?: string | null;
    severity?: string | null;
    recipient_type: string | null;
    delivery_status: string | null;
    is_read: boolean | null;
    created_at: string | null;
};

export type NotificationLookupRow = {
    id: string;
    name: string;
    secondary?: string | null;
};

export type NotificationPaymentLookupRow = {
    id: string;
    amount: number;
    paidAt: string | null;
    method: string | null;
};

export type NotificationAuditRow = {
    id: string;
    action: string;
    actor_id: string | null;
    entity_id: string | null;
    entity_type: string;
    before_data: unknown;
    after_data: unknown;
    created_at: string;
};

export type NotificationsCentreData = {
    isAdmin: boolean;
    activeOfficeName: string | null;
    pendingApprovalCount: number;
    unreadNotificationCount: number;
    requests: NotificationRentRequest[];
    paymentDateRequests: NotificationPaymentDateRequest[];
    tenantBalanceAdjustmentRequests: NotificationTenantBalanceAdjustmentRequest[];
    promiseChangeRequests: NotificationPromiseChangeRequest[];
    landlordPaymentRequests: NotificationLandlordPaymentRequest[];
    landlordPaymentDetailRequests: NotificationLandlordPaymentDetailRequest[];
    landlordBulkRoomRequests: NotificationLandlordBulkRoomRequest[];
    expenseApprovalRequests: NotificationExpenseApprovalRequest[];
    notifications: NotificationFeedRow[];
    notificationFilters: NotificationFeedFilters;
    notificationCounts: {
        all: number;
        unread: number;
        pendingApprovals: number;
        read: number;
        filtered: number;
        pages: number;
    };
    officeFilterOptions: NotificationLookupRow[];
    lookups: {
        rooms: NotificationLookupRow[];
        tenants: NotificationLookupRow[];
        landlords: NotificationLookupRow[];
        offices: NotificationLookupRow[];
        users: NotificationLookupRow[];
        payments: NotificationPaymentLookupRow[];
    };
    auditEvents: NotificationAuditRow[];
};

function unique(values: Array<string | null | undefined>) {
    return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

export async function getNotificationBadgeCount(context?: AuthContext) {
    const auth = context ?? await requireAuth();
    if (!auth.activeCompany?.id) return 0;
    const db = await createSupabaseServerClient() as unknown as Db;

    if (auth.isCompanyAdmin && !auth.isOfficeMode) {
        const [rentRequests, paymentDateRequests, tenantBalanceAdjustmentRequests, promiseChangeRequests, landlordPaymentRequests, landlordPaymentDetailRequests, landlordBulkRoomRequests, expenseApprovalRequests, advanceRequests, offDayRequests] = await Promise.all([
            db.from("room_rent_change_requests").select("id", { count: "exact", head: true }).eq("company_id", auth.activeCompany.id).eq("status", "pending"),
            db.from("payment_correction_requests").select("id", { count: "exact", head: true }).eq("company_id", auth.activeCompany.id).eq("status", "pending"),
            safeCount(db, "tenant_balance_adjustments", auth.activeCompany.id),
            safeCount(db, "promise_change_requests", auth.activeCompany.id),
            safeCount(db, "landlord_payment_expense_requests", auth.activeCompany.id),
            safeCount(db, "landlord_payment_details", auth.activeCompany.id),
            safeCount(db, "landlord_bulk_room_requests", auth.activeCompany.id),
            safeCount(db, "expenses", auth.activeCompany.id),
            db.from("employee_advance_requests").select("id", { count: "exact", head: true }).eq("company_id", auth.activeCompany.id).eq("status", "pending").eq("active", true),
            db.from("employee_off_day_requests").select("id", { count: "exact", head: true }).eq("company_id", auth.activeCompany.id).eq("status", "pending").eq("active", true),
        ]);
        return (rentRequests.count ?? 0) + (paymentDateRequests.count ?? 0) + (tenantBalanceAdjustmentRequests.count ?? 0) + (promiseChangeRequests.count ?? 0) + (landlordPaymentRequests.count ?? 0) + (landlordPaymentDetailRequests.count ?? 0) + (landlordBulkRoomRequests.count ?? 0) + (expenseApprovalRequests.count ?? 0) + (advanceRequests.count ?? 0) + (offDayRequests.count ?? 0);
    }

    if (!auth.activeOffice?.id) return 0;
    const { count } = await db
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("company_id", auth.activeCompany.id)
        .eq("office_id", auth.activeOffice.id)
        .eq("recipient_type", "office")
        .eq("is_read", false);
    return count ?? 0;
}

async function safeCount(db: Db, table: string, companyId: string) {
    const result = await db
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("status", "pending");
    if (result.error && optionalQueryError(result.error.message)) return { count: 0 };
    return { count: result.error ? 0 : result.count ?? 0 };
}

function optionalQueryError(message: string | null | undefined) {
    return /does not exist|relation|schema cache|statement timeout|canceling statement/i.test(message ?? "");
}

async function safeRows(query: Promise<{ count?: number | null; data: unknown[] | null; error: { message: string } | null }>) {
    const result = await query;
    if (result.error && optionalQueryError(result.error.message)) {
        console.warn("Optional notifications query skipped:", result.error.message);
        return { data: [], error: null };
    }
    return result;
}

function firstParam(value: string | string[] | undefined, fallback = "") {
    if (Array.isArray(value)) return String(value[0] ?? fallback);
    return String(value ?? fallback);
}

function normalizePageSize(value: string | string[] | undefined) {
    const parsed = Number(firstParam(value, String(DEFAULT_NOTIFICATION_PAGE_SIZE)));
    if (parsed === 25 || parsed === 50) return parsed;
    return DEFAULT_NOTIFICATION_PAGE_SIZE;
}

function normalizePositiveInt(value: string | string[] | undefined, fallback: number) {
    const parsed = Math.floor(Number(firstParam(value, String(fallback))));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeStatusFilter(value: string | string[] | undefined): NotificationStatusFilter {
    const normalized = firstParam(value, "all").toLowerCase();
    if (["unread", "read", "pending", "approved", "rejected"].includes(normalized)) return normalized as NotificationStatusFilter;
    return "all";
}

function normalizeTypeFilter(value: string | string[] | undefined): NotificationTypeFilter {
    const normalized = firstParam(value, "all").toLowerCase();
    if (["payments", "manual_adjustments", "landlord_payments", "expenses", "salaries", "vacate_requests", "security_deposits", "attendance", "cash_banking", "system"].includes(normalized)) {
        return normalized as NotificationTypeFilter;
    }
    return "all";
}

export function normalizeNotificationFeedFilters(searchParams?: Record<string, string | string[] | undefined>): NotificationFeedFilters {
    return {
        officeId: firstParam(searchParams?.office, "all") || "all",
        page: normalizePositiveInt(searchParams?.page, 1),
        pageSize: Math.min(MAX_NOTIFICATION_PAGE_SIZE, normalizePageSize(searchParams?.pageSize)),
        query: firstParam(searchParams?.q, "").trim().slice(0, 120),
        status: normalizeStatusFilter(searchParams?.status),
        type: normalizeTypeFilter(searchParams?.type),
    };
}

function applyNotificationStatusFilter(query: any, status: NotificationStatusFilter) {
    if (status === "unread") return query.eq("is_read", false);
    if (status === "read") return query.eq("is_read", true);
    if (status === "pending") return query.or("title.ilike.%pending%,message.ilike.%pending%,delivery_status.ilike.%pending%");
    if (status === "approved") return query.or("title.ilike.%approved%,message.ilike.%approved%,delivery_status.ilike.%approved%");
    if (status === "rejected") return query.or("title.ilike.%rejected%,message.ilike.%rejected%,delivery_status.ilike.%rejected%");
    return query;
}

function applyNotificationTypeFilter(query: any, type: NotificationTypeFilter) {
    const patterns: Record<NotificationTypeFilter, string[]> = {
        all: [],
        attendance: ["attendance"],
        cash_banking: ["cash", "bank", "banking", "handover", "mobile money"],
        expenses: ["expense"],
        landlord_payments: ["landlord payment", "landlord_payment"],
        manual_adjustments: ["manual balance", "balance adjustment", "tenant_balance_adjustment", "landlord_balance"],
        payments: ["payment", "collection", "receipt", "correction"],
        salaries: ["salary", "payroll"],
        security_deposits: ["security deposit", "deposit"],
        system: ["system", "integrity", "automation", "health"],
        vacate_requests: ["vacate", "vacancy", "move out"],
    };
    const terms = patterns[type] ?? [];
    if (!terms.length) return query;
    return query.or(terms.flatMap((term) => [
        `title.ilike.%${term}%`,
        `message.ilike.%${term}%`,
        `entity_type.ilike.%${term.replaceAll(" ", "_")}%`,
        `action_url.ilike.%${term.replaceAll(" ", "-")}%`,
    ]).join(","));
}

function applyNotificationSearchFilter(query: any, search: string) {
    if (!search) return query;
    const escaped = search.replaceAll("%", "\\%").replaceAll("_", "\\_");
    return query.or([
        `title.ilike.%${escaped}%`,
        `message.ilike.%${escaped}%`,
        `action_url.ilike.%${escaped}%`,
        `entity_type.ilike.%${escaped}%`,
    ].join(","));
}

function baseNotificationQuery(db: Db, companyId: string, isAdmin: boolean, officeId: string | null | undefined) {
    let query = db.from("notifications").select("id", { count: "exact", head: true }).eq("company_id", companyId);
    if (isAdmin) return query.eq("recipient_type", "admin");
    return query.eq("recipient_type", "office").eq("office_id", officeId);
}

export async function getNotificationsCentreData(searchParams?: Record<string, string | string[] | undefined>): Promise<NotificationsCentreData> {
    const context = await requireAuth();
    if (!context.activeCompany?.id) throw new Error("Active company is required.");
    const db = await createSupabaseServerClient() as unknown as Db;
    const isAdmin = context.isCompanyAdmin && !context.isOfficeMode;
    const filters = normalizeNotificationFeedFilters(searchParams);

    let requestQuery = db
        .from("room_rent_change_requests")
        .select("id,company_id,office_id,property_id,room_id,landlord_id,tenant_id,old_rent,new_rent,reason,effective_date,status,admin_comment,requested_by,decided_by,decided_at,created_at,updated_at")
        .eq("company_id", context.activeCompany.id)
        .order("created_at", { ascending: false })
        .limit(INITIAL_APPROVAL_LIMIT);

    if (!isAdmin) {
        if (!context.activeOffice?.id) throw new Error("Active office is required.");
        requestQuery = requestQuery.eq("office_id", context.activeOffice.id);
    }

    let paymentDateRequestQuery = db
        .from("payment_correction_requests")
        .select("id,company_id,office_id,payment_id,room_id,tenant_id,correction_type,original_payment_date,requested_payment_date,original_amount,requested_amount,original_room_id,requested_room_id,original_tenant_id,requested_tenant_id,original_value,requested_value,reason,status,requested_by,reviewed_by,reviewed_at,admin_comment,created_at,updated_at")
        .eq("company_id", context.activeCompany.id)
        .order("created_at", { ascending: false })
        .limit(INITIAL_APPROVAL_LIMIT);

    if (!isAdmin) {
        paymentDateRequestQuery = paymentDateRequestQuery.eq("office_id", context.activeOffice?.id);
    }

    let tenantBalanceAdjustmentQuery = db
        .from("tenant_balance_adjustments")
        .select("id,company_id,office_id,room_id,tenant_id,old_balance,new_balance,adjustment_amount,effective_date,reason,notes,status,requested_by,approved_by,approved_at,admin_comment,created_at,updated_at")
        .eq("company_id", context.activeCompany.id)
        .order("created_at", { ascending: false })
        .limit(INITIAL_APPROVAL_LIMIT);

    if (!isAdmin) {
        tenantBalanceAdjustmentQuery = tenantBalanceAdjustmentQuery.eq("office_id", context.activeOffice?.id);
    }

    let promiseChangeRequestQuery = db
        .from("promise_change_requests")
        .select("id,company_id,office_id,promise_id,tenant_id,room_id,change_type,original_value,requested_value,reason,status,requested_by,requested_by_account_type,reviewed_by,reviewed_at,admin_comment,created_at,updated_at")
        .eq("company_id", context.activeCompany.id)
        .order("created_at", { ascending: false })
        .limit(INITIAL_APPROVAL_LIMIT);

    if (!isAdmin) {
        promiseChangeRequestQuery = promiseChangeRequestQuery.eq("office_id", context.activeOffice?.id);
    }

    let landlordPaymentRequestQuery = db
        .from("landlord_payment_expense_requests")
        .select("*")
        .eq("company_id", context.activeCompany.id)
        .order("created_at", { ascending: false })
        .limit(INITIAL_APPROVAL_LIMIT);

    if (!isAdmin) {
        landlordPaymentRequestQuery = landlordPaymentRequestQuery.eq("office_id", context.activeOffice?.id);
    }

    let landlordPaymentDetailRequestQuery = db
        .from("landlord_payment_details")
        .select("id,company_id,office_id,landlord_id,payment_method,label,provider,account_name,account_number,mobile_money_provider,mobile_money_number,mobile_money_account_name,bank_name,bank_account_number,bank_account_name,branch,notes,status,is_active,is_default,requested_by,approved_by,approved_at,admin_comment,created_at,updated_at")
        .eq("company_id", context.activeCompany.id)
        .order("created_at", { ascending: false })
        .limit(INITIAL_APPROVAL_LIMIT);

    if (!isAdmin) {
        landlordPaymentDetailRequestQuery = landlordPaymentDetailRequestQuery.eq("office_id", context.activeOffice?.id);
    }

    let landlordBulkRoomRequestQuery = db
        .from("landlord_bulk_room_requests")
        .select("id,company_id,office_id,requested_by,reviewed_by,reviewed_at,status,landlord_payload,rooms_payload,summary,created_landlord_id,admin_comment,created_at,updated_at")
        .eq("company_id", context.activeCompany.id)
        .order("created_at", { ascending: false })
        .limit(INITIAL_APPROVAL_LIMIT);

    if (!isAdmin) {
        landlordBulkRoomRequestQuery = landlordBulkRoomRequestQuery.eq("office_id", context.activeOffice?.id);
    }

    let expenseApprovalRequestQuery = db
        .from("expenses")
        .select("id,company_id,office_id,amount,category,item,description,expense_date,expense_number,payment_method,submitted_by,approved_by,approved_at,status,created_at")
        .eq("company_id", context.activeCompany.id)
        .order("created_at", { ascending: false })
        .limit(INITIAL_APPROVAL_LIMIT);

    if (!isAdmin) {
        expenseApprovalRequestQuery = expenseApprovalRequestQuery.eq("office_id", context.activeOffice?.id);
    }

    let notificationQuery = db
        .from("notifications")
        .select("id,company_id,office_id,title,message,recipient_type,delivery_status,is_read,created_at,action_url,entity_type,severity", { count: "exact" })
        .eq("company_id", context.activeCompany.id)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false });

    if (isAdmin) {
        notificationQuery = notificationQuery.eq("recipient_type", "admin");
        if (filters.officeId !== "all") notificationQuery = notificationQuery.eq("office_id", filters.officeId);
    } else {
        notificationQuery = notificationQuery
            .eq("recipient_type", "office")
            .eq("office_id", context.activeOffice?.id);
    }
    notificationQuery = applyNotificationSearchFilter(applyNotificationTypeFilter(applyNotificationStatusFilter(notificationQuery, filters.status), filters.type), filters.query);
    const from = (filters.page - 1) * filters.pageSize;
    const to = from + filters.pageSize - 1;
    notificationQuery = notificationQuery.range(from, to);

    const [requestResult, paymentDateRequestResult, tenantBalanceAdjustmentResult, promiseChangeRequestResult, landlordPaymentRequestResult, landlordPaymentDetailRequestResult, landlordBulkRoomRequestResult, expenseApprovalRequestResult, notificationResult] = await Promise.all([
        safeRows(requestQuery),
        safeRows(paymentDateRequestQuery),
        safeRows(tenantBalanceAdjustmentQuery),
        safeRows(promiseChangeRequestQuery),
        safeRows(landlordPaymentRequestQuery),
        safeRows(landlordPaymentDetailRequestQuery),
        safeRows(landlordBulkRoomRequestQuery),
        safeRows(expenseApprovalRequestQuery),
        safeRows(notificationQuery),
    ]);
    if (requestResult.error) throw new Error(requestResult.error.message);
    if (paymentDateRequestResult.error) throw new Error(paymentDateRequestResult.error.message);
    if (tenantBalanceAdjustmentResult.error) throw new Error(tenantBalanceAdjustmentResult.error.message);
    if (notificationResult.error) throw new Error(notificationResult.error.message);

    const requests = (requestResult.data ?? []) as NotificationRentRequest[];
    const paymentDateRequests = (paymentDateRequestResult.data ?? []) as NotificationPaymentDateRequest[];
    const tenantBalanceAdjustmentRequests = (tenantBalanceAdjustmentResult.data ?? []) as NotificationTenantBalanceAdjustmentRequest[];
    const promiseChangeRequests = (promiseChangeRequestResult.data ?? []) as NotificationPromiseChangeRequest[];
    const landlordPaymentRequests = (landlordPaymentRequestResult.data ?? []) as NotificationLandlordPaymentRequest[];
    const landlordPaymentDetailRequests = (landlordPaymentDetailRequestResult.data ?? []) as NotificationLandlordPaymentDetailRequest[];
    const landlordBulkRoomRequests = (landlordBulkRoomRequestResult.data ?? []) as NotificationLandlordBulkRoomRequest[];
    const expenseApprovalRequests = (expenseApprovalRequestResult.data ?? []) as NotificationExpenseApprovalRequest[];
    const notifications = (notificationResult.data ?? []) as NotificationFeedRow[];
    const filteredNotificationCount = Number(notificationResult.count ?? notifications.length);
    const requestIds = requests.map((request) => request.id);
    const paymentDateRequestIds = paymentDateRequests.map((request) => request.id);
    const paymentIds = unique(paymentDateRequests.map((request) => request.payment_id));

    const roomIds = unique([
        ...requests.map((request) => request.room_id),
        ...paymentDateRequests.map((request) => request.room_id),
        ...paymentDateRequests.map((request) => request.original_room_id),
        ...paymentDateRequests.map((request) => request.requested_room_id),
        ...tenantBalanceAdjustmentRequests.map((request) => request.room_id),
        ...promiseChangeRequests.map((request) => request.room_id),
    ]);
    const tenantIds = unique([
        ...requests.map((request) => request.tenant_id),
        ...paymentDateRequests.map((request) => request.tenant_id),
        ...paymentDateRequests.map((request) => request.original_tenant_id),
        ...paymentDateRequests.map((request) => request.requested_tenant_id),
        ...tenantBalanceAdjustmentRequests.map((request) => request.tenant_id),
        ...promiseChangeRequests.map((request) => request.tenant_id),
    ]);
    const landlordIds = unique([...requests.map((request) => request.landlord_id), ...landlordPaymentRequests.map((request) => request.landlord_id), ...landlordPaymentDetailRequests.map((request) => request.landlord_id)]);
    const officeIds = unique([...requests.map((request) => request.office_id), ...paymentDateRequests.map((request) => request.office_id), ...tenantBalanceAdjustmentRequests.map((request) => request.office_id), ...promiseChangeRequests.map((request) => request.office_id), ...landlordPaymentRequests.map((request) => request.office_id), ...landlordPaymentDetailRequests.map((request) => request.office_id), ...landlordBulkRoomRequests.map((request) => request.office_id)]);
    const userIds = unique([
        ...requests.map((request) => request.requested_by),
        ...requests.map((request) => request.decided_by),
        ...paymentDateRequests.map((request) => request.requested_by),
        ...paymentDateRequests.map((request) => request.reviewed_by),
        ...tenantBalanceAdjustmentRequests.map((request) => request.requested_by),
        ...tenantBalanceAdjustmentRequests.map((request) => request.approved_by),
        ...promiseChangeRequests.map((request) => request.requested_by),
        ...promiseChangeRequests.map((request) => request.reviewed_by),
        ...landlordPaymentRequests.map((request) => request.submitted_by),
        ...landlordPaymentRequests.map((request) => request.reviewed_by),
        ...landlordPaymentDetailRequests.map((request) => request.requested_by),
        ...landlordPaymentDetailRequests.map((request) => request.approved_by),
        ...landlordBulkRoomRequests.map((request) => request.requested_by),
        ...landlordBulkRoomRequests.map((request) => request.reviewed_by),
    ]);
    const landlordPaymentRequestIds = landlordPaymentRequests.map((request) => request.id);
    const landlordPaymentDetailRequestIds = landlordPaymentDetailRequests.map((request) => request.id);
    const landlordBulkRoomRequestIds = landlordBulkRoomRequests.map((request) => request.id);
    const tenantBalanceAdjustmentRequestIds = tenantBalanceAdjustmentRequests.map((request) => request.id);
    const promiseChangeRequestIds = promiseChangeRequests.map((request) => request.id);
    const allApprovalIds = [...requestIds, ...paymentDateRequestIds, ...tenantBalanceAdjustmentRequestIds, ...promiseChangeRequestIds, ...landlordPaymentRequestIds, ...landlordPaymentDetailRequestIds, ...landlordBulkRoomRequestIds];

    const scopedNotificationCountQuery = baseNotificationQuery(db, context.activeCompany.id, isAdmin, context.activeOffice?.id);
    const scopedUnreadCountQuery = baseNotificationQuery(db, context.activeCompany.id, isAdmin, context.activeOffice?.id).eq("is_read", false);
    const [rooms, tenants, landlords, offices, users, payments, landlordPaymentPayables, allActiveOffices, scopedNotificationCount, scopedUnreadNotificationCount] = await Promise.all([
        roomIds.length ? safeRows(db.from("rooms").select("id, room_number").in("id", roomIds).limit(200)) : { data: [], error: null },
        tenantIds.length ? safeRows(db.from("tenants").select("id, full_name, phone").in("id", tenantIds).limit(200)) : { data: [], error: null },
        landlordIds.length ? safeRows(db.from("landlords").select("id, full_name, phone, settlement_timing").in("id", landlordIds).limit(200)) : { data: [], error: null },
        officeIds.length ? safeRows(db.from("offices").select("id, office_name, name").in("id", officeIds).limit(50)) : { data: [], error: null },
        userIds.length ? safeRows(db.from("users").select("id, full_name, email").in("id", userIds).limit(200)) : { data: [], error: null },
        paymentIds.length ? safeRows(db.from("collections").select("id, amount, amount_paid, paid_at, payment_method").eq("company_id", context.activeCompany.id).in("id", paymentIds).limit(200)) : { data: [], error: null },
        landlordPaymentRequests.length && landlordIds.length
            ? safeRows(db
                .from("landlord_monthly_payables")
                .select("*")
                .eq("company_id", context.activeCompany.id)
                .in("landlord_id", landlordIds)
                .neq("status", "archived")
                .order("settlement_month", { ascending: true }))
            : { data: [], error: null },
        safeRows(db.from("offices").select("id, office_name, name").eq("company_id", context.activeCompany.id).ilike("status", "active").order("office_name").limit(500)),
        scopedNotificationCountQuery,
        scopedUnreadCountQuery,
    ]);

    const livePayablesByLandlordOffice = new Map<string, Array<Record<string, unknown>>>();
    const settlementTimingByLandlordId = new Map<string, string>();
    for (const landlord of (landlords.data ?? []) as Array<Record<string, unknown>>) {
        settlementTimingByLandlordId.set(String(landlord.id ?? ""), normalizeSettlementTiming(landlord.settlement_timing));
    }
    for (const row of (landlordPaymentPayables.data ?? []) as Array<Record<string, unknown>>) {
        const key = `${row.landlord_id ?? ""}:${row.office_id ?? ""}`;
        livePayablesByLandlordOffice.set(key, [...(livePayablesByLandlordOffice.get(key) ?? []), row]);
    }
    const liveLandlordPaymentRequests = landlordPaymentRequests.map((request) => {
        const rows = livePayablesByLandlordOffice.get(`${request.landlord_id ?? ""}:${request.office_id ?? ""}`) ?? [];
        const paymentMonth = String(request.payment_month ?? request.payment_date ?? "").slice(0, 10);
        const settlementTiming = settlementTimingByLandlordId.get(String(request.landlord_id ?? "")) ?? "previous_month";
        const scopedRows = paymentMonth ? rows.filter((row) => String(row.settlement_month ?? "").slice(0, 10) <= paymentMonth) : rows;
        const summary = summarizeLandlordPayables({ currentMonth: paymentMonth || null, payables: scopedRows, settlementTiming });
        const plan = buildLandlordPaymentAllocationPlan({
            advanceRecoveryAmount: Number(request.advance_recovery_amount ?? 0) || 0,
            amount: Number(request.requested_amount ?? 0) || 0,
            currentMonth: paymentMonth || undefined,
            payables: scopedRows,
            settlementTiming,
        });
        return {
            ...request,
            already_paid_amount: summary.alreadyPaidAmount,
            current_net_payable: summary.currentMonthNetPayable || scopedRows
                .filter((row) => String(row.settlement_month ?? "").slice(0, 10) === paymentMonth)
                .reduce((total, row) => total + landlordMonthlyDue(row), 0),
            normal_payment_amount: plan.normalPaymentAmount,
            advance_amount: plan.advanceAmount,
            advance_recovery_amount: plan.advanceRecoveryAmount,
            advance_balance_after: Math.max(0, Number(request.active_advance_balance ?? 0) - plan.advanceRecoveryAmount),
            cash_payment_amount: plan.cashPayableToLandlord,
            outstanding_amount: summary.totalOutstandingPayable,
            flag_reason: plan.advanceAmount > 0
                ? plan.normalPaymentAmount > 0 ? "partial_overpayment_live_recalculated" : "overpayment_creates_advance_live_recalculated"
                : "normal_payment_live_recalculated",
        };
    });

    const auditEvents = { data: [], error: null };

    const pendingApprovalCount = requests.filter((request) => request.status === "pending").length
        + paymentDateRequests.filter((request) => request.status === "pending").length
        + tenantBalanceAdjustmentRequests.filter((request) => request.status === "pending").length
        + promiseChangeRequests.filter((request) => request.status === "pending").length
        + landlordPaymentRequests.filter((request) => request.status === "pending").length
        + landlordPaymentDetailRequests.filter((request) => request.status === "pending").length
        + landlordBulkRoomRequests.filter((request) => request.status === "pending").length
        + expenseApprovalRequests.filter((request) => request.status === "pending").length;
    const unreadNotificationCount = scopedUnreadNotificationCount.count ?? notifications.filter((notification) => notification.is_read === false).length;
    const allNotificationCount = scopedNotificationCount.count ?? filteredNotificationCount;
    const readNotificationCount = Math.max(0, allNotificationCount - unreadNotificationCount);
    const pages = Math.max(1, Math.ceil(filteredNotificationCount / filters.pageSize));

    return {
        activeOfficeName: context.activeOffice?.office_name ?? context.activeOffice?.name ?? null,
        isAdmin,
	        pendingApprovalCount,
	        unreadNotificationCount,
	        requests,
	        paymentDateRequests,
            tenantBalanceAdjustmentRequests,
            promiseChangeRequests,
            landlordPaymentRequests: liveLandlordPaymentRequests,
            landlordPaymentDetailRequests,
            landlordBulkRoomRequests,
            expenseApprovalRequests,
        notifications,
        notificationCounts: {
            all: allNotificationCount,
            filtered: filteredNotificationCount,
            pages,
            pendingApprovals: pendingApprovalCount,
            read: readNotificationCount,
            unread: unreadNotificationCount,
        },
        notificationFilters: {
            ...filters,
            page: Math.min(filters.page, pages),
        },
        officeFilterOptions: ((allActiveOffices.data ?? []) as Array<Record<string, unknown>>).map((office) => ({
            id: String(office.id),
            name: String(office.office_name ?? office.name ?? "Office"),
        })),
        lookups: {
            rooms: ((rooms.data ?? []) as Array<Record<string, unknown>>).map((room) => ({
                id: String(room.id),
                name: String(room.room_number ?? "Unnumbered"),
            })),
            tenants: ((tenants.data ?? []) as Array<Record<string, unknown>>).map((tenant) => ({
                id: String(tenant.id),
                name: String(tenant.full_name ?? "Tenant"),
                secondary: typeof tenant.phone === "string" ? tenant.phone : null,
            })),
            landlords: ((landlords.data ?? []) as Array<Record<string, unknown>>).map((landlord) => ({
                id: String(landlord.id),
                name: String(landlord.full_name ?? "Landlord"),
                secondary: typeof landlord.phone === "string" ? landlord.phone : null,
            })),
            offices: ((offices.data ?? []) as Array<Record<string, unknown>>).map((office) => ({
                id: String(office.id),
                name: String(office.office_name ?? office.name ?? "Office"),
            })),
	            users: ((users.data ?? []) as Array<Record<string, unknown>>).map((user) => ({
	                id: String(user.id),
	                name: String(user.full_name ?? user.email ?? "User"),
	            })),
	            payments: ((payments.data ?? []) as Array<Record<string, unknown>>).map((payment) => ({
	                amount: Number(payment.amount_paid ?? payment.amount ?? 0),
	                id: String(payment.id),
	                method: typeof payment.payment_method === "string" ? payment.payment_method : null,
	                paidAt: typeof payment.paid_at === "string" ? payment.paid_at : null,
	            })),
	        },
        auditEvents: (auditEvents.data ?? []) as NotificationAuditRow[],
    };
}
