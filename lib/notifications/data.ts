import { requireAuth } from "@/lib/auth/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AuthContext } from "@/lib/auth/types";

type Db = {
    from: (table: string) => any;
};

const INITIAL_APPROVAL_LIMIT = 50;
const INITIAL_NOTIFICATION_LIMIT = 50;

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

export type NotificationFeedRow = {
    id: string;
    company_id: string | null;
    office_id: string | null;
    title: string | null;
    message: string | null;
    action_url?: string | null;
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
    landlordPaymentRequests: NotificationLandlordPaymentRequest[];
    landlordPaymentDetailRequests: NotificationLandlordPaymentDetailRequest[];
    landlordBulkRoomRequests: NotificationLandlordBulkRoomRequest[];
    notifications: NotificationFeedRow[];
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
        const [rentRequests, paymentDateRequests, tenantBalanceAdjustmentRequests, landlordPaymentRequests, landlordPaymentDetailRequests, landlordBulkRoomRequests, advanceRequests, offDayRequests] = await Promise.all([
            db.from("room_rent_change_requests").select("id", { count: "exact", head: true }).eq("company_id", auth.activeCompany.id).eq("status", "pending"),
            db.from("payment_correction_requests").select("id", { count: "exact", head: true }).eq("company_id", auth.activeCompany.id).eq("status", "pending"),
            safeCount(db, "tenant_balance_adjustments", auth.activeCompany.id),
            safeCount(db, "landlord_payment_expense_requests", auth.activeCompany.id),
            safeCount(db, "landlord_payment_details", auth.activeCompany.id),
            safeCount(db, "landlord_bulk_room_requests", auth.activeCompany.id),
            db.from("employee_advance_requests").select("id", { count: "exact", head: true }).eq("company_id", auth.activeCompany.id).eq("status", "pending").eq("active", true),
            db.from("employee_off_day_requests").select("id", { count: "exact", head: true }).eq("company_id", auth.activeCompany.id).eq("status", "pending").eq("active", true),
        ]);
        return (rentRequests.count ?? 0) + (paymentDateRequests.count ?? 0) + (tenantBalanceAdjustmentRequests.count ?? 0) + (landlordPaymentRequests.count ?? 0) + (landlordPaymentDetailRequests.count ?? 0) + (landlordBulkRoomRequests.count ?? 0) + (advanceRequests.count ?? 0) + (offDayRequests.count ?? 0);
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
        .select("id")
        .eq("company_id", companyId)
        .eq("status", "pending")
        .limit(200);
    if (result.error && optionalQueryError(result.error.message)) return { count: 0 };
    return { count: result.error ? 0 : (result.data ?? []).length };
}

function optionalQueryError(message: string | null | undefined) {
    return /does not exist|relation|schema cache|statement timeout|canceling statement/i.test(message ?? "");
}

async function safeRows(query: Promise<{ data: unknown[] | null; error: { message: string } | null }>) {
    const result = await query;
    if (result.error && optionalQueryError(result.error.message)) {
        console.warn("Optional notifications query skipped:", result.error.message);
        return { data: [], error: null };
    }
    return result;
}

export async function getNotificationsCentreData(): Promise<NotificationsCentreData> {
    const context = await requireAuth();
    if (!context.activeCompany?.id) throw new Error("Active company is required.");
    const db = await createSupabaseServerClient() as unknown as Db;
    const isAdmin = context.isCompanyAdmin && !context.isOfficeMode;

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

    let landlordPaymentRequestQuery = db
        .from("landlord_payment_expense_requests")
        .select("id,company_id,office_id,landlord_id,expense_id,monthly_payable_id,requested_amount,normal_payment_amount,advance_amount,current_net_payable,already_paid_amount,outstanding_amount,active_advance_balance,pending_request_amount,flag_reason,payment_month,payment_date,payment_method,notes,status,submitted_by,reviewed_by,reviewed_at,admin_comment,approved_landlord_payment_id,approved_advance_id,advance_agreement,created_at,updated_at")
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

    let notificationQuery = db
        .from("notifications")
        .select("id,company_id,office_id,title,message,recipient_type,delivery_status,is_read,created_at,action_url")
        .eq("company_id", context.activeCompany.id)
        .order("created_at", { ascending: false })
        .limit(INITIAL_NOTIFICATION_LIMIT);

    if (isAdmin) {
        notificationQuery = notificationQuery.eq("recipient_type", "admin");
    } else {
        notificationQuery = notificationQuery
            .eq("recipient_type", "office")
            .eq("office_id", context.activeOffice?.id);
    }

    const [requestResult, paymentDateRequestResult, tenantBalanceAdjustmentResult, landlordPaymentRequestResult, landlordPaymentDetailRequestResult, landlordBulkRoomRequestResult, notificationResult] = await Promise.all([
        safeRows(requestQuery),
        safeRows(paymentDateRequestQuery),
        safeRows(tenantBalanceAdjustmentQuery),
        safeRows(landlordPaymentRequestQuery),
        safeRows(landlordPaymentDetailRequestQuery),
        safeRows(landlordBulkRoomRequestQuery),
        safeRows(notificationQuery),
    ]);
    if (requestResult.error) throw new Error(requestResult.error.message);
    if (paymentDateRequestResult.error) throw new Error(paymentDateRequestResult.error.message);
    if (tenantBalanceAdjustmentResult.error) throw new Error(tenantBalanceAdjustmentResult.error.message);
    if (notificationResult.error) throw new Error(notificationResult.error.message);

    const requests = (requestResult.data ?? []) as NotificationRentRequest[];
    const paymentDateRequests = (paymentDateRequestResult.data ?? []) as NotificationPaymentDateRequest[];
    const tenantBalanceAdjustmentRequests = (tenantBalanceAdjustmentResult.data ?? []) as NotificationTenantBalanceAdjustmentRequest[];
    const landlordPaymentRequests = (landlordPaymentRequestResult.data ?? []) as NotificationLandlordPaymentRequest[];
    const landlordPaymentDetailRequests = (landlordPaymentDetailRequestResult.data ?? []) as NotificationLandlordPaymentDetailRequest[];
    const landlordBulkRoomRequests = (landlordBulkRoomRequestResult.data ?? []) as NotificationLandlordBulkRoomRequest[];
    const notifications = (notificationResult.data ?? []) as NotificationFeedRow[];
    const requestIds = requests.map((request) => request.id);
    const paymentDateRequestIds = paymentDateRequests.map((request) => request.id);
    const paymentIds = unique(paymentDateRequests.map((request) => request.payment_id));

    const roomIds = unique([
        ...requests.map((request) => request.room_id),
        ...paymentDateRequests.map((request) => request.room_id),
        ...paymentDateRequests.map((request) => request.original_room_id),
        ...paymentDateRequests.map((request) => request.requested_room_id),
        ...tenantBalanceAdjustmentRequests.map((request) => request.room_id),
    ]);
    const tenantIds = unique([
        ...requests.map((request) => request.tenant_id),
        ...paymentDateRequests.map((request) => request.tenant_id),
        ...paymentDateRequests.map((request) => request.original_tenant_id),
        ...paymentDateRequests.map((request) => request.requested_tenant_id),
        ...tenantBalanceAdjustmentRequests.map((request) => request.tenant_id),
    ]);
    const landlordIds = unique([...requests.map((request) => request.landlord_id), ...landlordPaymentRequests.map((request) => request.landlord_id), ...landlordPaymentDetailRequests.map((request) => request.landlord_id)]);
    const officeIds = unique([...requests.map((request) => request.office_id), ...paymentDateRequests.map((request) => request.office_id), ...tenantBalanceAdjustmentRequests.map((request) => request.office_id), ...landlordPaymentRequests.map((request) => request.office_id), ...landlordPaymentDetailRequests.map((request) => request.office_id), ...landlordBulkRoomRequests.map((request) => request.office_id)]);
    const userIds = unique([
        ...requests.map((request) => request.requested_by),
        ...requests.map((request) => request.decided_by),
        ...paymentDateRequests.map((request) => request.requested_by),
        ...paymentDateRequests.map((request) => request.reviewed_by),
        ...tenantBalanceAdjustmentRequests.map((request) => request.requested_by),
        ...tenantBalanceAdjustmentRequests.map((request) => request.approved_by),
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
    const allApprovalIds = [...requestIds, ...paymentDateRequestIds, ...tenantBalanceAdjustmentRequestIds, ...landlordPaymentRequestIds, ...landlordPaymentDetailRequestIds, ...landlordBulkRoomRequestIds];

    const [rooms, tenants, landlords, offices, users, payments] = await Promise.all([
        roomIds.length ? safeRows(db.from("rooms").select("id, room_number").in("id", roomIds).limit(200)) : { data: [], error: null },
        tenantIds.length ? safeRows(db.from("tenants").select("id, full_name, phone").in("id", tenantIds).limit(200)) : { data: [], error: null },
        landlordIds.length ? safeRows(db.from("landlords").select("id, full_name, phone").in("id", landlordIds).limit(200)) : { data: [], error: null },
        officeIds.length ? safeRows(db.from("offices").select("id, office_name, name").in("id", officeIds).limit(50)) : { data: [], error: null },
        userIds.length ? safeRows(db.from("users").select("id, full_name, email").in("id", userIds).limit(200)) : { data: [], error: null },
        paymentIds.length ? safeRows(db.from("collections").select("id, amount, amount_paid, paid_at, payment_method").eq("company_id", context.activeCompany.id).in("id", paymentIds).limit(200)) : { data: [], error: null },
    ]);

    const auditEvents = { data: [], error: null };

    const pendingApprovalCount = requests.filter((request) => request.status === "pending").length
        + paymentDateRequests.filter((request) => request.status === "pending").length
        + tenantBalanceAdjustmentRequests.filter((request) => request.status === "pending").length
        + landlordPaymentRequests.filter((request) => request.status === "pending").length
        + landlordPaymentDetailRequests.filter((request) => request.status === "pending").length
        + landlordBulkRoomRequests.filter((request) => request.status === "pending").length;
    const unreadNotificationCount = notifications.filter((notification) => notification.is_read === false).length;

    return {
        activeOfficeName: context.activeOffice?.office_name ?? context.activeOffice?.name ?? null,
        isAdmin,
	        pendingApprovalCount,
	        unreadNotificationCount,
	        requests,
	        paymentDateRequests,
            tenantBalanceAdjustmentRequests,
            landlordPaymentRequests,
            landlordPaymentDetailRequests,
            landlordBulkRoomRequests,
        notifications,
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
