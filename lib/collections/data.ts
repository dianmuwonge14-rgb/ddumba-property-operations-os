import { getScopedSupabase } from "@/lib/auth/query";
import { requirePermission } from "@/lib/auth/permissions";
import { billingPeriodForDate, clampBillingDay, nextBillingDate } from "@/lib/tenants/billing-cycle";
import type {
    CollectionActionItem,
    CollectionActionRow,
    CollectionReportData,
    CollectionReportFilters,
    CollectionReportRow,
    FastPaymentRecentItem,
    FastPaymentRecentResult,
    CollectionKpis,
    CollectionRow,
    CollectionTenantResult,
    AdvanceRentAssistantItem,
    CollectionsPageData,
    CollectionsRecordsPageData,
    LandlordRow,
    LeaseRow,
    OfficeRow,
    PromiseRow,
    PropertyRow,
    RoomRow,
    TenantContributionBreakdown,
    TenantLedgerRow,
    TenantRentSponsor,
    TenantRow,
} from "./types";

type DynamicDb = {
    from: (table: string) => any;
};

const BUSINESS_TIME_ZONE = "Africa/Kampala";

type CollectionWithContribution = CollectionRow & {
    payment_source?: "tenant" | "employer" | null;
};

function businessDateOnly(value: string | null | undefined) {
    if (!value) return "No date";
    const parts = new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "2-digit",
        timeZone: BUSINESS_TIME_ZONE,
        year: "numeric",
    }).formatToParts(new Date(value));
    const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
    return `${part("year")}-${part("month")}-${part("day")}`;
}

function collectionPaymentDate(row: CollectionRow) {
    if (row.payment_date) {
        return row.payment_date.includes("T") ? businessDateOnly(row.payment_date) : row.payment_date.slice(0, 10);
    }
    return businessDateOnly(row.paid_at);
}

function collectionRecordedTime(row: CollectionRow) {
    return row.created_at ?? row.paid_at;
}

function businessTimeOnly(value: string | null | undefined) {
    if (!value) return "--";
    return new Intl.DateTimeFormat("en-UG", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: BUSINESS_TIME_ZONE,
    }).format(new Date(value));
}

async function optionalRows(query: Promise<{ data: unknown[] | null; error: { message: string } | null }>) {
    const result = await query;
    if (result.error && /does not exist|schema cache|Could not find/i.test(result.error.message ?? "")) return [];
    if (result.error) throw new Error(result.error.message);
    return result.data ?? [];
}

function currentMonthStart(value = new Date()) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-01`;
}

function nextMonthStart(value = new Date()) {
    return new Date(Date.UTC(value.getFullYear(), value.getMonth() + 1, 1)).toISOString().slice(0, 10);
}

function monthLabelFromDate(value: string | null | undefined) {
    if (!value) return null;
    const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat("en-UG", {
        month: "long",
        timeZone: "UTC",
        year: "numeric",
    }).format(date);
}

function addMonthsToMonthStart(monthStart: string, months: number) {
    const [year, month] = monthStart.slice(0, 7).split("-").map(Number);
    return new Date(Date.UTC(year, month - 1 + months, 1)).toISOString().slice(0, 10);
}

function selectedMonthStart(month?: string | null) {
    if (month && /^\d{4}-\d{2}/.test(month)) return `${month.slice(0, 7)}-01`;
    return currentMonthStart();
}

function tenantBillingDay(tenant: TenantRow, lease: LeaseRow | null) {
    return clampBillingDay(lease?.billing_day ?? (tenant as TenantRow & { billing_day?: number | null }).billing_day ?? 1);
}

function tenantBillingPeriod(tenant: TenantRow, lease: LeaseRow | null, businessDate: string) {
    const billingDay = tenantBillingDay(tenant, lease);
    const leaseStartDate = lease?.start_date ?? tenant.created_at?.slice(0, 10) ?? null;
    return billingPeriodForDate({ billingDay, businessDate, leaseStartDate });
}

function todayRange() {
    const date = todayDateOnly();
    return { start: date, end: date, date };
}

export async function getFastPaymentRecentPayments(paymentDate: string, options?: {
    method?: string | null;
    page?: number | null;
    pageSize?: number | null;
    search?: string | null;
}): Promise<FastPaymentRecentResult> {
    const context = await requirePermission("collections.read");
    const { supabase } = await getScopedSupabase();
    const companyId = context.activeCompany?.id;
    const officeId = context.activeOffice?.id;
    const emptyTotals = {
        bankAmount: 0,
        cashAmount: 0,
        chequeAmount: 0,
        mobileMoneyAmount: 0,
        outstandingBalance: 0,
        tenantCount: 0,
        totalAmount: 0,
        totalRows: 0,
    };

    if (!companyId || !officeId) {
        return { pagination: { page: 1, pageSize: 25, totalPages: 1, totalRows: 0 }, payments: [], totals: emptyTotals };
    }

    const dateOnly = paymentDate.slice(0, 10);
    if (!dateOnly || Number.isNaN(Date.parse(dateOnly))) {
        return { pagination: { page: 1, pageSize: 25, totalPages: 1, totalRows: 0 }, payments: [], totals: emptyTotals };
    }

    const searchAllOffices = context.canAccessAllOffices || context.isCompanyAdmin;
    const pageSize = Math.max(10, Math.min(50, Number(options?.pageSize ?? 25) || 25));
    const page = Math.max(1, Number(options?.page ?? 1) || 1);
    const search = String(options?.search ?? "").trim().toLowerCase();
    const method = String(options?.method ?? "all").trim().toLowerCase();

    let collectionQuery = (supabase as unknown as DynamicDb)
        .from("collections")
        .select("*")
        .eq("company_id", companyId)
        .eq("payment_date", dateOnly)
        .or("status.is.null,status.not.in.(voided,removed_by_admin_approval,rejected,pending)")
        .order("payment_date", { ascending: true })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(2000);

    if (!searchAllOffices) {
        collectionQuery = collectionQuery.eq("office_id", officeId);
    }

    const { data: collections, error } = await collectionQuery;
    if (error) throw new Error(error.message);

    const rows = (collections ?? []) as CollectionRow[];
    const tenantIds = uniqueIds(rows.map((row) => row.tenant_id));
    const roomIds = uniqueIds(rows.map((row) => row.room_id));
    const officeIds = uniqueIds(rows.map((row) => row.office_id));
    const recordedByIds = uniqueIds(rows.map((row) => row.recorded_by));
    const paymentIds = uniqueIds(rows.map((row) => row.id));

    const [{ data: tenants }, { data: rooms }, { data: offices }, { data: users }, dateChangeRequests, correctionRequests] = await Promise.all([
        tenantIds.length ? supabase.from("tenants").select("id, full_name").eq("company_id", companyId).in("id", tenantIds) : { data: [] },
        roomIds.length ? supabase.from("rooms").select("id, room_number, landlord_id").eq("company_id", companyId).in("id", roomIds) : { data: [] },
        officeIds.length ? supabase.from("offices").select("id, office_name, name").eq("company_id", companyId).in("id", officeIds) : { data: [] },
        recordedByIds.length ? supabase.from("users").select("id, full_name").eq("company_id", companyId).in("id", recordedByIds) : { data: [] },
        paymentIds.length
            ? (supabase as unknown as DynamicDb)
                .from("payment_date_change_requests")
                .select("id, payment_id, requested_payment_date, status, created_at")
                .eq("company_id", companyId)
                .in("payment_id", paymentIds)
                .order("created_at", { ascending: false })
            : { data: [], error: null },
        paymentIds.length
            ? (supabase as unknown as DynamicDb)
                .from("payment_correction_requests")
                .select("id, payment_id, correction_type, status, created_at")
                .eq("company_id", companyId)
                .in("payment_id", paymentIds)
                .order("created_at", { ascending: false })
            : { data: [], error: null },
    ]);
    if (dateChangeRequests.error) throw new Error(dateChangeRequests.error.message);
    if (correctionRequests.error) throw new Error(correctionRequests.error.message);

    const landlordIds = uniqueIds((rooms ?? []).map((room) => room.landlord_id));
    const { data: landlords } = landlordIds.length
        ? await supabase.from("landlords").select("id, full_name").eq("company_id", companyId).in("id", landlordIds)
        : { data: [] };

    const tenantById = new Map((tenants ?? []).map((tenant) => [tenant.id, tenant]));
    const roomById = new Map((rooms ?? []).map((room) => [room.id, room]));
    const officeById = new Map((offices ?? []).map((office) => [office.id, office]));
    const userById = new Map((users ?? []).map((user) => [user.id, user]));
    const landlordById = new Map((landlords ?? []).map((landlord) => [landlord.id, landlord]));
    const dateRequestByPaymentId = new Map<string, Record<string, unknown>>();
    for (const request of (dateChangeRequests.data ?? []) as Record<string, unknown>[]) {
        const paymentId = String(request.payment_id ?? "");
        if (paymentId && !dateRequestByPaymentId.has(paymentId)) {
            dateRequestByPaymentId.set(paymentId, request);
        }
    }
    const correctionsByPaymentId = new Map<string, Record<string, unknown>[]>();
    for (const request of (correctionRequests.data ?? []) as Record<string, unknown>[]) {
        const paymentId = String(request.payment_id ?? "");
        if (paymentId) {
            const requests = correctionsByPaymentId.get(paymentId) ?? [];
            requests.push(request);
            correctionsByPaymentId.set(paymentId, requests);
        }
    }

    const payments = rows.map((row): FastPaymentRecentItem => {
        const room = row.room_id ? roomById.get(row.room_id) : null;
        const tenant = row.tenant_id ? tenantById.get(row.tenant_id) : null;
        const office = row.office_id ? officeById.get(row.office_id) : null;
        const user = row.recorded_by ? userById.get(row.recorded_by) : null;
        const landlord = room?.landlord_id ? landlordById.get(room.landlord_id) : null;
        const dateRequest = dateRequestByPaymentId.get(row.id);
        const dateRequestStatus = String(dateRequest?.status ?? "");
        const correctionHistory = correctionsByPaymentId.get(row.id) ?? [];
        const correctionRequest = correctionHistory.find((request) => String(request.status ?? "") === "pending") ?? correctionHistory[0];
        const correctionRequestStatus = String(correctionRequest?.status ?? "");
        const correctionRequestType = String(correctionRequest?.correction_type ?? "");

        return {
            id: row.id,
            paidAt: row.paid_at,
            paymentDate: collectionPaymentDate(row),
            roomId: row.room_id ?? null,
            tenantId: row.tenant_id ?? null,
            roomNumber: room?.room_number ?? "Unknown room",
            tenantName: tenant?.full_name ?? "Unnamed tenant",
            landlordName: landlord?.full_name ?? "No landlord",
            officeName: office?.office_name ?? office?.name ?? "No office",
            amount: Number(row.amount_paid ?? row.amount ?? 0),
            method: row.payment_method ?? "payment",
            paymentType: row.type ?? "rent",
            recordedBy: user?.full_name ?? "System",
            balanceAfter: Number(row.balance ?? 0),
            dateChangeRequestId: typeof dateRequest?.id === "string" ? dateRequest.id : null,
            dateChangeRequestStatus: dateRequestStatus === "pending" || dateRequestStatus === "approved" || dateRequestStatus === "rejected"
                ? dateRequestStatus
                : null,
            requestedPaymentDate: typeof dateRequest?.requested_payment_date === "string" ? dateRequest.requested_payment_date : null,
            correctionRequestId: typeof correctionRequest?.id === "string" ? correctionRequest.id : null,
            correctionRequestStatus: correctionRequestStatus === "pending" || correctionRequestStatus === "approved" || correctionRequestStatus === "rejected"
                ? correctionRequestStatus
                : null,
            correctionRequestType: correctionRequestType === "date_change" || correctionRequestType === "amount_change" || correctionRequestType === "room_change" || correctionRequestType === "remove_payment"
                ? correctionRequestType
                : null,
            isCorrected: correctionHistory.some((request) => String(request.status ?? "") === "approved"),
            correctionHistoryCount: correctionHistory.length,
        };
    });

    const filteredPayments = payments.filter((payment) => {
        const methodValue = payment.method.toLowerCase();
        const matchesMethod = method === "all" || !method
            ? true
            : method === "bank"
                ? (methodValue.includes("bank") || methodValue.includes("transfer")) && !methodValue.includes("cheque")
                : method === "mobile_money"
                    ? methodValue.includes("mobile")
                    : methodValue.includes(method);
        if (!matchesMethod) return false;
        if (!search) return true;
        return [
            payment.roomNumber,
            payment.tenantName,
            payment.landlordName,
            payment.officeName,
            payment.recordedBy,
        ].some((value) => value.toLowerCase().includes(search));
    });

    const latestBalanceByTenant = new Map<string, number>();
    for (const payment of filteredPayments) {
        const key = payment.tenantId ?? `${payment.roomNumber}:${payment.tenantName}`;
        latestBalanceByTenant.set(key, Math.max(0, payment.balanceAfter));
    }
    const methodTotal = (matcher: (methodValue: string) => boolean) => filteredPayments
        .filter((payment) => matcher(payment.method.toLowerCase()))
        .reduce((total, payment) => total + payment.amount, 0);
    const totalRows = filteredPayments.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    const safePage = Math.max(1, Math.min(page, totalPages));
    const start = (safePage - 1) * pageSize;

    return {
        pagination: {
            page: safePage,
            pageSize,
            totalPages,
            totalRows,
        },
        payments: filteredPayments.slice(start, start + pageSize),
        totals: {
            bankAmount: methodTotal((methodValue) => (methodValue.includes("bank") || methodValue.includes("transfer")) && !methodValue.includes("cheque")),
            cashAmount: methodTotal((methodValue) => methodValue.includes("cash")),
            chequeAmount: methodTotal((methodValue) => methodValue.includes("cheque")),
            mobileMoneyAmount: methodTotal((methodValue) => methodValue.includes("mobile")),
            outstandingBalance: [...latestBalanceByTenant.values()].reduce((total, value) => total + value, 0),
            tenantCount: new Set(filteredPayments.map((payment) => payment.tenantId ?? `${payment.roomNumber}:${payment.tenantName}`)).size,
            totalAmount: filteredPayments.reduce((total, payment) => total + payment.amount, 0),
            totalRows,
        },
    };
}

function monthRange() {
    const now = new Date();
    return monthBounds(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
}

function sumAmounts(rows: Array<{ amount_paid: number | null; amount: number | null }>) {
    return rows.reduce((total, row) => total + Number(row.amount_paid ?? row.amount ?? 0), 0);
}

function todayDateOnly() {
    return new Date().toISOString().slice(0, 10);
}

function isDateOnly(value: string | null | undefined) {
    return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function isMonthOnly(value: string | null | undefined) {
    return Boolean(value && /^\d{4}-\d{2}$/.test(value));
}

function monthBounds(month: string) {
    const [year, monthIndex] = month.split("-").map(Number);
    const start = new Date(Date.UTC(year, monthIndex - 1, 1));
    const end = new Date(Date.UTC(year, monthIndex, 0));
    return {
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
    };
}

function resolveCollectionReportDates(filters: CollectionReportFilters) {
    if (isDateOnly(filters.singleDate)) {
        return { startDate: filters.singleDate!, endDate: filters.singleDate! };
    }

    if (isMonthOnly(filters.singleMonth)) {
        return monthBounds(filters.singleMonth!);
    }

    if (isMonthOnly(filters.startMonth) || isMonthOnly(filters.endMonth)) {
        const startMonth = isMonthOnly(filters.startMonth) ? filters.startMonth! : filters.endMonth!;
        const endMonth = isMonthOnly(filters.endMonth) ? filters.endMonth! : startMonth;
        return {
            startDate: monthBounds(startMonth).startDate,
            endDate: monthBounds(endMonth).endDate,
        };
    }

    if (isDateOnly(filters.startDate) || isDateOnly(filters.endDate)) {
        const startDate = isDateOnly(filters.startDate) ? filters.startDate! : filters.endDate!;
        const endDate = isDateOnly(filters.endDate) ? filters.endDate! : startDate;
        return { startDate, endDate };
    }

    const today = todayDateOnly();
    return { startDate: today, endDate: today };
}

function startOfDateIso(date: string) {
    return date.slice(0, 10);
}

function endOfDateIso(date: string) {
    return date.slice(0, 10);
}

function normalizeCollectionFilter(value: string | null | undefined) {
    return String(value ?? "").trim().toLowerCase();
}

function collectionMethodBucket(method: string) {
    const normalized = normalizeCollectionFilter(method);
    if (normalized.includes("cheque") || normalized.includes("check")) return "cheque";
    if (normalized.includes("mobile") || normalized.includes("momo") || normalized.includes("airtel") || normalized.includes("mtn")) return "mobile";
    if (normalized.includes("bank") || normalized.includes("transfer")) return "bank";
    if (normalized.includes("cash")) return "cash";
    return "other";
}

function emptyCollectionReport(filters: Required<Pick<CollectionReportFilters, "singleDate">> & CollectionReportFilters, generatedBy: string, companyName: string, activeOfficeName: string | null, isAdmin: boolean): CollectionReportData {
    return {
        rows: [],
        totals: {
            totalAmount: 0,
            paymentCount: 0,
            tenantCount: 0,
            cashTotal: 0,
            bankTotal: 0,
            mobileMoneyTotal: 0,
            chequeTotal: 0,
            outstandingBalanceRemaining: 0,
        },
        filters,
        generatedAt: new Date().toISOString(),
        generatedBy,
        companyName,
        activeOfficeName,
        isAdmin,
    };
}

export async function getCollectionReportData(filters: CollectionReportFilters = {}): Promise<CollectionReportData> {
    const context = await requirePermission("collections.read");
    const { supabase } = await getScopedSupabase();
    const companyId = context.activeCompany?.id;
    const officeId = context.activeOffice?.id;
    const isAdmin = context.canAccessAllOffices || context.isCompanyAdmin;
    const generatedBy = context.profile?.full_name ?? context.profile?.email ?? "Current user";
    const companyName = context.activeCompany?.name ?? "DDUMBA OS";
    const resolvedDates = resolveCollectionReportDates(filters);
    const resolvedFilters = {
        ...filters,
        singleDate: filters.singleDate && isDateOnly(filters.singleDate) ? filters.singleDate : resolvedDates.startDate,
    };

    if (!companyId || (!isAdmin && !officeId)) {
        return emptyCollectionReport(resolvedFilters, generatedBy, companyName, context.activeOffice?.office_name ?? context.activeOffice?.name ?? null, isAdmin);
    }

    const selectedOfficeId = isAdmin && filters.officeId ? filters.officeId : isAdmin ? null : officeId;
    const officeNameById = new Map<string, string>();
    if (context.activeOffice?.id) {
        officeNameById.set(context.activeOffice.id, context.activeOffice.office_name ?? context.activeOffice.name ?? "Office");
    }
    for (const office of context.offices ?? []) {
        officeNameById.set(office.id, office.office_name ?? office.name ?? "Office");
    }

    let collectionQuery = (supabase as unknown as DynamicDb)
        .from("collections")
        .select("*")
        .eq("company_id", companyId)
        .or("status.is.null,status.not.in.(voided,removed_by_admin_approval,rejected,pending)")
        .gte("payment_date", startOfDateIso(resolvedDates.startDate))
        .lte("payment_date", endOfDateIso(resolvedDates.endDate))
        .order("payment_date", { ascending: true })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(2000);

    if (selectedOfficeId) {
        collectionQuery = collectionQuery.eq("office_id", selectedOfficeId);
    }

    const paymentMethodFilter = normalizeCollectionFilter(filters.paymentMethod);
    if (paymentMethodFilter) {
        collectionQuery = collectionQuery.ilike("payment_method", `%${escapeSupabaseLike(paymentMethodFilter)}%`);
    }

    const { data: collectionData, error } = await collectionQuery;
    if (error) throw new Error(error.message);

    const collections = (collectionData ?? []) as CollectionRow[];
    const tenantIds = uniqueIds(collections.map((row) => row.tenant_id));
    const roomIds = uniqueIds(collections.map((row) => row.room_id));
    const officeIds = uniqueIds(collections.map((row) => row.office_id));
    const recordedByIds = uniqueIds(collections.map((row) => row.recorded_by ?? row.collector_id));

    const [{ data: tenants }, { data: rooms }, { data: offices }, { data: users }] = await Promise.all([
        tenantIds.length ? supabase.from("tenants").select("id, full_name, phone").eq("company_id", companyId).in("id", tenantIds) : { data: [] },
        roomIds.length ? supabase.from("rooms").select("id, room_number, landlord_id").eq("company_id", companyId).in("id", roomIds) : { data: [] },
        officeIds.length ? supabase.from("offices").select("id, office_name, name").eq("company_id", companyId).in("id", officeIds) : { data: [] },
        recordedByIds.length ? supabase.from("users").select("id, full_name, email").eq("company_id", companyId).in("id", recordedByIds) : { data: [] },
    ]);

    const landlordIds = uniqueIds((rooms ?? []).map((room) => room.landlord_id));
    const { data: landlords } = landlordIds.length
        ? await supabase.from("landlords").select("id, full_name").eq("company_id", companyId).in("id", landlordIds)
        : { data: [] };

    const tenantById = new Map((tenants ?? []).map((tenant) => [tenant.id, tenant]));
    const roomById = new Map((rooms ?? []).map((room) => [room.id, room]));
    const officeById = new Map((offices ?? []).map((office) => [office.id, office]));
    const userById = new Map((users ?? []).map((user) => [user.id, user]));
    const landlordById = new Map((landlords ?? []).map((landlord) => [landlord.id, landlord]));

    const roomFilter = normalizeCollectionFilter(filters.room);
    const tenantFilter = normalizeCollectionFilter(filters.tenant);

    const rows: CollectionReportRow[] = collections
        .map((row) => {
            const room = row.room_id ? roomById.get(row.room_id) : null;
            const tenant = row.tenant_id ? tenantById.get(row.tenant_id) : null;
            const office = row.office_id ? officeById.get(row.office_id) : null;
            const user = row.recorded_by ? userById.get(row.recorded_by) : row.collector_id ? userById.get(row.collector_id) : null;
            const landlord = room?.landlord_id ? landlordById.get(room.landlord_id) : null;

            return {
                id: row.id,
                paidAt: row.paid_at,
                date: collectionPaymentDate(row),
                time: businessTimeOnly(collectionRecordedTime(row)),
                roomNumber: room?.room_number ?? "Unknown room",
                tenantName: tenant?.full_name ?? "Unnamed tenant",
                landlordName: landlord?.full_name ?? "No landlord",
                officeName: office?.office_name ?? office?.name ?? (row.office_id ? officeNameById.get(row.office_id) : null) ?? "No office",
                amountPaid: Number(row.amount_paid ?? row.amount ?? 0),
                remainingBalance: Number(row.balance ?? 0),
                paymentMethod: row.payment_method ?? "payment",
                recordedBy: user?.full_name ?? user?.email ?? "System",
            };
        })
        .filter((row) => {
            if (roomFilter && !normalizeCollectionFilter(row.roomNumber).includes(roomFilter)) return false;
            if (tenantFilter && !normalizeCollectionFilter(row.tenantName).includes(tenantFilter)) return false;
            return true;
        });

    const balanceByTenant = new Map<string, number>();
    for (const row of rows) {
        balanceByTenant.set(`${row.roomNumber}:${row.tenantName}`, row.remainingBalance);
    }

    const totals = rows.reduce(
        (acc, row) => {
            acc.totalAmount += row.amountPaid;
            const bucket = collectionMethodBucket(row.paymentMethod);
            if (bucket === "cash") acc.cashTotal += row.amountPaid;
            if (bucket === "bank") acc.bankTotal += row.amountPaid;
            if (bucket === "mobile") acc.mobileMoneyTotal += row.amountPaid;
            if (bucket === "cheque") acc.chequeTotal += row.amountPaid;
            return acc;
        },
        {
            totalAmount: 0,
            paymentCount: rows.length,
            tenantCount: new Set(rows.map((row) => `${row.roomNumber}:${row.tenantName}`)).size,
            cashTotal: 0,
            bankTotal: 0,
            mobileMoneyTotal: 0,
            chequeTotal: 0,
            outstandingBalanceRemaining: [...balanceByTenant.values()].reduce((total, value) => total + value, 0),
        },
    );

    return {
        rows,
        totals,
        filters: resolvedFilters,
        generatedAt: new Date().toISOString(),
        generatedBy,
        companyName,
        activeOfficeName: selectedOfficeId ? officeNameById.get(selectedOfficeId) ?? "Selected office" : isAdmin ? "All offices" : context.activeOffice?.office_name ?? context.activeOffice?.name ?? "Office",
        isAdmin,
    };
}

export async function getCollectionsRecordsPageData(filters: CollectionReportFilters = {}): Promise<CollectionsRecordsPageData> {
    const context = await requirePermission("collections.read");
    const report = await getCollectionReportData(filters);
    const isAdmin = context.canAccessAllOffices || context.isCompanyAdmin;
    const offices = isAdmin
        ? (context.offices ?? []).map((office) => ({
            id: office.id,
            name: office.office_name ?? office.name ?? "Office",
        }))
        : [];

    return {
        report,
        offices,
        isAdmin,
        generatedBy: report.generatedBy,
    };
}

export async function getCollectionsPageData(): Promise<CollectionsPageData> {
    const context = await requirePermission("collections.read");
    const { supabase } = await getScopedSupabase();
    const companyId = context.activeCompany?.id;
    const officeId = context.activeOffice?.id;

    if (!companyId || !officeId) {
        return {
            kpis: emptyKpis(),
            recentActions: [],
            duePromises: [],
        };
    }

    const today = todayRange();
    const month = monthRange();

    const [
        todayCollections,
        monthCollections,
        tenantBalanceRows,
        officeRooms,
        promisesDueToday,
        monthPromises,
        recentActions,
    ] = await Promise.all([
        supabase
            .from("collections")
            .select("amount, amount_paid")
            .eq("company_id", companyId)
            .eq("office_id", officeId)
            .gte("payment_date", today.start)
            .lte("payment_date", today.end),
        supabase
            .from("collections")
            .select("amount, amount_paid")
            .eq("company_id", companyId)
            .eq("office_id", officeId)
            .gte("payment_date", month.startDate)
            .lte("payment_date", month.endDate),
        supabase
            .from("tenants")
            .select("id, balance, office_id, room_id, status")
            .eq("company_id", companyId)
            .eq("status", "active"),
        supabase
            .from("rooms")
            .select("id, office_id")
            .eq("company_id", companyId)
            .eq("office_id", officeId),
        supabase
            .from("promises")
            .select("*, tenants(full_name)")
            .eq("company_id", companyId)
            .eq("office_id", officeId)
            .eq("promised_date", today.date)
            .neq("status", "fulfilled")
            .order("created_at", { ascending: false })
            .limit(10),
        supabase
            .from("promises")
            .select("status")
            .eq("company_id", companyId)
            .eq("office_id", officeId)
            .gte("promised_date", month.startDate)
            .lte("promised_date", month.endDate),
        supabase
            .from("collection_actions")
            .select("*, tenants(full_name)")
            .eq("company_id", companyId)
            .eq("office_id", officeId)
            .order("created_at", { ascending: false })
            .limit(12),
    ]);

    const promiseRows = monthPromises.data ?? [];
    const fulfilledPromises = promiseRows.filter((promise) => promise.status === "fulfilled").length;
    const promiseRecoveryRate = promiseRows.length
        ? Math.round((fulfilledPromises / promiseRows.length) * 100)
        : 0;

    return {
        kpis: {
            todayCollections: sumAmounts(todayCollections.data ?? []),
            monthCollections: sumAmounts(monthCollections.data ?? []),
            outstandingBalance: tenantOutstandingForOffice(
                tenantBalanceRows.data ?? [],
                officeRooms.data ?? [],
                officeId,
            ).reduce(
                (total, row) => total + Number(row.balance ?? 0),
                0,
            ),
            promisesDueToday: promisesDueToday.data?.length ?? 0,
            promiseRecoveryRate,
        },
        recentActions: (recentActions.data ?? []).map((action) => ({
            ...action,
            tenantName: extractTenantName(action.tenants),
        })),
        duePromises: (promisesDueToday.data ?? []).map((promise) => ({
            ...promise,
            tenantName: extractTenantName(promise.tenants),
        })),
    };
}

function tenantOutstandingForOffice<T extends { office_id: string | null; room_id: string | null; balance: number | null; status?: string | null }>(
    tenants: T[],
    rooms: Array<{ id: string; office_id: string | null }>,
    officeId: string,
) {
    const officeRoomIds = new Set(rooms.filter((room) => room.office_id === officeId).map((room) => room.id));
    return tenants.filter((tenant) =>
        tenant.status !== "import_review" &&
        (tenant.office_id === officeId || Boolean(tenant.room_id && officeRoomIds.has(tenant.room_id)))
    );
}

export async function searchCollectionTenants(query: string): Promise<CollectionTenantResult[]> {
    const term = query.trim();

    if (term.length < 2) {
        return [];
    }

    const context = await requirePermission("collections.read");
    const { supabase } = await getScopedSupabase();
    const companyId = context.activeCompany?.id;
    const officeId = context.activeOffice?.id;

    if (!companyId || !officeId) {
        return [];
    }

    const searchAllOffices = context.canAccessAllOffices || context.isCompanyAdmin;
    const roomIds = await findMatchingRoomIds(term, companyId, searchAllOffices ? null : officeId);
    const landlordRoomIds = await findMatchingLandlordRoomIds(term, companyId, searchAllOffices ? null : officeId);
    const matchedRoomIds = uniqueIds([...roomIds, ...landlordRoomIds]);
    const tenantById = new Map<string, TenantRow>();
    const escapedTerm = escapeSupabaseLike(term);

    const directTenantQuery = supabase
        .from("tenants")
        .select("*")
        .eq("company_id", companyId)
        .eq("status", "active")
        .or(`full_name.ilike.%${escapedTerm}%,phone.ilike.%${escapedTerm}%,tenant_code.ilike.%${escapedTerm}%`)
        .order("full_name")
        .limit(searchAllOffices ? 10 : 50);

    const { data: directTenants, error } = await directTenantQuery;

    if (error) {
        throw new Error(error.message);
    }

    for (const tenant of directTenants ?? []) {
        tenantById.set(tenant.id, tenant);
    }

    if (matchedRoomIds.length) {
        const [{ data: roomTenants, error: roomTenantError }, { data: roomLeases, error: leaseError }] = await Promise.all([
            supabase
                .from("tenants")
                .select("*")
                .eq("company_id", companyId)
                .eq("status", "active")
                .in("room_id", matchedRoomIds)
                .limit(25),
            supabase
                .from("leases")
                .select("*")
                .eq("company_id", companyId)
                .in("room_id", matchedRoomIds)
                .eq("status", "active")
                .limit(25),
        ]);

        if (roomTenantError) throw new Error(roomTenantError.message);
        if (leaseError) throw new Error(leaseError.message);

        for (const tenant of roomTenants ?? []) {
            if (searchAllOffices || tenant.office_id === officeId || !tenant.office_id) {
                tenantById.set(tenant.id, tenant);
            }
        }

        const leaseTenantIds = [...new Set((roomLeases ?? []).map((lease) => lease.tenant_id).filter((id): id is string => Boolean(id)))];
        if (leaseTenantIds.length) {
            const { data: leaseTenants, error: leaseTenantError } = await supabase
                .from("tenants")
                .select("*")
                .eq("company_id", companyId)
                .eq("status", "active")
                .in("id", leaseTenantIds);

            if (leaseTenantError) throw new Error(leaseTenantError.message);

            for (const tenant of leaseTenants ?? []) {
                tenantById.set(tenant.id, tenant);
            }
        }
    }

    const hydrated = await hydrateTenantResults([...tenantById.values()], companyId, searchAllOffices ? null : officeId);
    return hydrated
        .filter((result) => searchAllOffices || tenantResultBelongsToOffice(result, officeId))
        .sort((left, right) => scoreTenantSearchResult(left, term) - scoreTenantSearchResult(right, term))
        .slice(0, 10);
}

export async function lookupPaymentRoom(roomNumber: string, paymentDate?: string | null): Promise<CollectionTenantResult[]> {
    const term = roomNumber.trim();
    if (term.length < 2) return [];

    const context = await requirePermission("collections.read");
    const { supabase } = await getScopedSupabase();
    const companyId = context.activeCompany?.id;
    const officeId = context.activeOffice?.id;

    if (!companyId || !officeId) {
        return [];
    }

    const searchAllOffices = context.canAccessAllOffices || context.isCompanyAdmin;
    const paymentMonth = selectedMonthStart(paymentDate);
    const fastLookup = await (supabase as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }> })
        .rpc("lookup_payment_room_fast", {
            p_company_id: companyId,
            p_office_id: officeId,
            p_payment_month: paymentMonth,
            p_room_number: term,
            p_search_all: searchAllOffices,
    });
    if (!fastLookup.error && fastLookup.data?.length) {
        return hydrateFastPaymentRpcResults(fastLookup.data, companyId, paymentMonth);
    }

    const escapedTerm = escapeSupabaseLike(term);
    const roomColumns = "id, company_id, office_id, property_id, landlord_id, room_number, monthly_rent, outstanding_balance, status";
    const tenantColumns = "id, company_id, office_id, property_id, room_id, full_name, phone, monthly_rent, balance, status";
    let roomQuery = supabase
        .from("rooms")
        .select(roomColumns)
        .eq("company_id", companyId)
        .ilike("room_number", `${escapedTerm}%`)
        .order("room_number")
        .limit(searchAllOffices ? 20 : 5);

    if (!searchAllOffices) {
        roomQuery = roomQuery.eq("office_id", officeId);
    }

    let tenantQuery = supabase
        .from("tenants")
        .select(tenantColumns)
        .eq("company_id", companyId)
        .eq("status", "active")
        .or(`full_name.ilike.%${escapedTerm}%,phone.ilike.%${escapedTerm}%,tenant_code.ilike.%${escapedTerm}%`)
        .limit(searchAllOffices ? 20 : 10);

    if (!searchAllOffices) {
        tenantQuery = tenantQuery.eq("office_id", officeId);
    }

    const [{ data: rooms, error: roomError }, { data: directTenants, error: directTenantError }] = await Promise.all([
        roomQuery,
        tenantQuery,
    ]);
    if (roomError) throw new Error(roomError.message);
    if (directTenantError) throw new Error(directTenantError.message);

    const roomIds = uniqueIds([
        ...(rooms ?? []).map((room) => room.id),
        ...(directTenants ?? []).map((tenant) => tenant.room_id),
    ]);
    if (!roomIds.length && !directTenants?.length) return [];

    const [{ data: tenants, error: tenantError }, { data: leases, error: leaseError }] = await Promise.all([
        roomIds.length ? supabase
            .from("tenants")
            .select(tenantColumns)
            .eq("company_id", companyId)
            .eq("status", "active")
            .in("room_id", roomIds) : { data: [] as TenantRow[], error: null },
        roomIds.length ? supabase
            .from("leases")
            .select("id, company_id, office_id, property_id, room_id, tenant_id, monthly_rent, status")
            .eq("company_id", companyId)
            .eq("status", "active")
            .in("room_id", roomIds) : { data: [] as LeaseRow[], error: null },
    ]);

    if (tenantError) throw new Error(tenantError.message);
    if (leaseError) throw new Error(leaseError.message);

    const tenantById = new Map<string, TenantRow>();
    for (const tenant of directTenants ?? []) {
        tenantById.set(tenant.id, tenant as TenantRow);
    }
    for (const tenant of tenants ?? []) {
        tenantById.set(tenant.id, tenant as TenantRow);
    }

    const leaseTenantIds = uniqueIds((leases ?? []).map((lease) => lease.tenant_id));
    const missingLeaseTenantIds = leaseTenantIds.filter((tenantId) => !tenantById.has(tenantId));
    if (missingLeaseTenantIds.length) {
        const { data: leaseTenants, error: leaseTenantError } = await supabase
            .from("tenants")
            .select(tenantColumns)
            .eq("company_id", companyId)
            .eq("status", "active")
            .in("id", missingLeaseTenantIds);
        if (leaseTenantError) throw new Error(leaseTenantError.message);
        for (const tenant of leaseTenants ?? []) {
            tenantById.set(tenant.id, tenant as TenantRow);
        }
    }

    const normalizedTerm = normalizeSearchValue(term);
    const tenantsForRooms = [...tenantById.values()]
        .filter((tenant) => tenant.room_id && roomIds.includes(tenant.room_id))
        .sort((left, right) => String(left.full_name ?? "").localeCompare(String(right.full_name ?? "")));

    const hydrated = await hydrateFastPaymentTenantResults(tenantsForRooms, companyId, searchAllOffices ? null : officeId, paymentDate);
    return hydrated
        .filter((result) => {
            const room = normalizeSearchValue(result.room?.room_number);
            const name = normalizeSearchValue(result.tenant.full_name);
            const phone = normalizeSearchValue(result.tenant.phone);
            return room.startsWith(normalizedTerm) || room.includes(normalizedTerm) || name.includes(normalizedTerm) || phone.includes(normalizedTerm);
        })
        .filter((result) => searchAllOffices || tenantResultBelongsToOffice(result, officeId))
        .sort((left, right) => scoreTenantSearchResult(left, term) - scoreTenantSearchResult(right, term))
        .slice(0, searchAllOffices ? 20 : 10);
}

function fastPaymentRpcRowToTenantResult(row: Record<string, unknown>, paymentMonth: string): CollectionTenantResult {
    const monthlyRent = Number(row.lease_monthly_rent ?? row.tenant_monthly_rent ?? row.room_monthly_rent ?? 0);
    const outstandingBalance = Number(row.tenant_balance ?? row.room_outstanding_balance ?? 0);
    const currentMonthPaid = Number(row.current_month_paid ?? 0);
    const advanceRentBalance = Number(row.advance_rent_balance ?? 0);
    const rawAdvanceMonths = Array.isArray(row.advance_months) ? row.advance_months as Array<Record<string, unknown>> : [];
    const advanceRentMonths = rawAdvanceMonths.map((item) => {
        const month = String(item.month ?? "").slice(0, 10);
        return { month, label: monthLabelFromDate(month) ?? month, amount: Number(item.amount ?? 0) };
    }).filter((item) => item.month);
    const tenant = {
        id: String(row.tenant_id),
        company_id: null,
        office_id: row.tenant_office_id as string | null,
        property_id: row.tenant_property_id as string | null,
        room_id: row.room_id as string | null,
        full_name: row.tenant_name as string | null,
        phone: row.tenant_phone as string | null,
        monthly_rent: Number(row.tenant_monthly_rent ?? row.room_monthly_rent ?? 0),
        balance: outstandingBalance,
        status: "active",
    } as unknown as TenantRow;
    const room = {
        id: String(row.room_id),
        company_id: null,
        office_id: row.room_office_id as string | null,
        property_id: row.room_property_id as string | null,
        landlord_id: row.room_landlord_id as string | null,
        room_number: row.room_number as string | null,
        monthly_rent: Number(row.room_monthly_rent ?? 0),
        outstanding_balance: Number(row.room_outstanding_balance ?? 0),
        status: "occupied",
    } as unknown as RoomRow;
    const lease = row.lease_id ? {
        id: String(row.lease_id),
        company_id: null,
        office_id: row.lease_office_id as string | null,
        property_id: row.lease_property_id as string | null,
        room_id: row.room_id as string | null,
        tenant_id: row.tenant_id as string | null,
        billing_day: Number(row.lease_billing_day ?? row.tenant_billing_day ?? 1),
        start_date: row.lease_start_date as string | null,
        monthly_rent: Number(row.lease_monthly_rent ?? 0),
        status: "active",
    } as unknown as LeaseRow : null;
    const previousOutstandingBeforeLastPayment = Number(row.balance_before_last_payment ?? 0);
    const lastAmountPaid = Number(row.last_amount_paid ?? 0);
    const amountUsedToClearOutstanding = Number(row.used_to_clear_outstanding ?? Math.min(previousOutstandingBeforeLastPayment, lastAmountPaid));
    const amountAllocatedToNextMonth = Number(row.allocated_to_next_month ?? 0);
    const rentMonthAllocations = currentMonthPaid > 0 ? [{
        allocationType: "rent_month" as const,
        amountDue: monthlyRent,
        amountPaid: Math.min(monthlyRent, currentMonthPaid),
        label: monthLabelFromDate(paymentMonth) ?? paymentMonth,
        lastPaymentAmount: lastAmountPaid,
        month: paymentMonth,
        previouslyPaidAmount: Math.max(0, currentMonthPaid - lastAmountPaid),
        status: currentMonthPaid >= monthlyRent ? "paid" as const : "partial" as const,
    }] : [];

    return {
        tenant,
        room,
        property: null,
        office: null,
        landlord: null,
        lease,
        outstandingBalance,
        previousOutstandingBeforeLastPayment,
        totalDueBeforeLastPayment: previousOutstandingBeforeLastPayment,
        lastAmountPaid,
        amountUsedToClearOutstanding,
        amountAllocatedToNextMonth,
        monthlyRent,
        currentMonthPaid,
        advanceRentBalance,
        advanceRentMonths,
        rentMonthAllocations,
        billingAnniversaryDay: lease ? Number(lease.billing_day ?? 1) : Number(row.tenant_billing_day ?? 1),
        currentRentPeriod: null,
        lastRentChargeDate: null,
        nextRentChargeDate: null,
        nextMonthCoveredAmount: advanceRentMonths[0]?.amount ?? 0,
        nextAdvanceRentMonth: advanceRentMonths[0]?.label ?? null,
        sponsor: null,
        contribution: emptyContribution(monthlyRent),
        lastCollection: null,
        openPromise: null,
        collections: [],
        promises: [],
        ledgerEntries: [],
        actionHistory: [],
    };
}

async function hydrateFastPaymentRpcResults(rows: Array<Record<string, unknown>>, companyId: string, paymentMonth: string): Promise<CollectionTenantResult[]> {
    const { supabase } = await getScopedSupabase();
    const propertyIds = uniqueIds(rows.map((row) => row.room_property_id as string | null));
    const directLandlordIds = uniqueIds(rows.map((row) => row.room_landlord_id as string | null));
    const { data: properties } = propertyIds.length
        ? await supabase.from("properties").select("*").eq("company_id", companyId).in("id", propertyIds)
        : { data: [] as PropertyRow[] };
    const propertyById = new Map((properties ?? []).map((property) => [property.id, property]));
    const propertyLandlordIds = uniqueIds((properties ?? []).map((property) => property.landlord_id));
    const landlordIds = uniqueIds([...directLandlordIds, ...propertyLandlordIds]);
    const { data: landlords } = landlordIds.length
        ? await supabase.from("landlords").select("*").eq("company_id", companyId).in("id", landlordIds)
        : { data: [] as LandlordRow[] };
    const landlordById = new Map((landlords ?? []).map((landlord) => [landlord.id, landlord]));

    return rows.map((row) => {
        const result = fastPaymentRpcRowToTenantResult(row, paymentMonth);
        const property = result.room?.property_id ? propertyById.get(result.room.property_id) ?? null : null;
        const landlordId = result.room?.landlord_id ?? property?.landlord_id ?? null;
        return {
            ...result,
            property,
            landlord: landlordId ? landlordById.get(landlordId) ?? null : null,
            room: result.room ? { ...result.room, landlord_id: landlordId } as RoomRow : result.room,
        };
    });
}

export async function getAdvanceRentAssistant(month?: string | null): Promise<AdvanceRentAssistantItem[]> {
    const context = await requirePermission("collections.read");
    const { supabase } = await getScopedSupabase();
    const companyId = context.activeCompany?.id;
    const officeId = context.activeOffice?.id;

    if (!companyId || !officeId) {
        return [];
    }

    const searchAllOffices = context.canAccessAllOffices || context.isCompanyAdmin;
    const monthStart = selectedMonthStart(month);
    const nextMonth = addMonthsToMonthStart(monthStart, 1);

    let tenantQuery = supabase
        .from("tenants")
        .select("id, full_name, room_id, office_id, monthly_rent, balance, status")
        .eq("company_id", companyId)
        .eq("status", "active")
        .not("room_id", "is", null)
        .limit(500);

    if (!searchAllOffices) {
        tenantQuery = tenantQuery.eq("office_id", officeId);
    }

    const { data: tenants, error: tenantError } = await tenantQuery;
    if (tenantError) throw new Error(tenantError.message);

    const tenantRows = tenants ?? [];
    if (!tenantRows.length) return [];

    const tenantIds = uniqueIds(tenantRows.map((tenant) => tenant.id));
    const roomIds = uniqueIds(tenantRows.map((tenant) => tenant.room_id));
    const officeIds = uniqueIds(tenantRows.map((tenant) => tenant.office_id));

    const [roomsResult, officesResult, collectionRows, allocationRows] = await Promise.all([
        roomIds.length
            ? supabase.from("rooms").select("id, room_number, monthly_rent, outstanding_balance, office_id").eq("company_id", companyId).in("id", roomIds)
            : { data: [] as Array<Record<string, unknown>>, error: null },
        officeIds.length
            ? supabase.from("offices").select("id, office_name, name").eq("company_id", companyId).in("id", officeIds)
            : { data: [] as Array<Record<string, unknown>>, error: null },
        tenantIds.length
            ? optionalRows((supabase as unknown as DynamicDb)
                .from("collections")
                .select("id, tenant_id, amount, amount_paid, expected_amount, balance, balance_before_payment, balance_after_payment, used_to_clear_outstanding, allocated_to_next_month, payment_date, status")
                .eq("company_id", companyId)
                .in("tenant_id", tenantIds))
            : [],
        tenantIds.length
            ? optionalRows((supabase as unknown as DynamicDb)
                .from("tenant_rent_allocations")
                .select("tenant_id, payment_id, allocation_month, allocation_type, amount_allocated, allocation_source, is_historical_credit, coverage_start, coverage_end, coverage_index")
                .eq("company_id", companyId)
                .in("tenant_id", tenantIds))
            : [],
    ]);

    if (roomsResult.error) throw new Error(roomsResult.error.message);
    if (officesResult.error) throw new Error(officesResult.error.message);

    const roomsById = new Map((roomsResult.data ?? []).map((room) => [String(room.id), room]));
    const officesById = new Map((officesResult.data ?? []).map((office) => [String(office.id), office]));
    const collectionsByTenant = new Map<string, Array<Record<string, unknown>>>();
    for (const collection of collectionRows as Array<Record<string, unknown>>) {
        const tenantId = String(collection.tenant_id ?? "");
        if (!tenantId || ["voided", "removed_by_admin_approval", "rejected", "pending"].includes(String(collection.status ?? "").toLowerCase())) continue;
        collectionsByTenant.set(tenantId, [...(collectionsByTenant.get(tenantId) ?? []), collection]);
    }
    const allocationsByTenant = new Map<string, Array<Record<string, unknown>>>();
    for (const allocation of allocationRows as Array<Record<string, unknown>>) {
        const tenantId = String(allocation.tenant_id ?? "");
        if (!tenantId) continue;
        allocationsByTenant.set(tenantId, [...(allocationsByTenant.get(tenantId) ?? []), allocation]);
    }

    const items: AdvanceRentAssistantItem[] = [];
    for (const tenant of tenantRows) {
        const tenantId = String(tenant.id);
        const room = tenant.room_id ? roomsById.get(String(tenant.room_id)) : null;
        if (!room) continue;
        const office = officesById.get(String(tenant.office_id ?? room.office_id ?? ""));
        const roomNumber = String(room.room_number ?? "Unknown");
        const tenantName = String(tenant.full_name ?? "Unnamed tenant");
        const officeName = String(office?.office_name ?? office?.name ?? "Office");
        const monthlyRent = Number(tenant.monthly_rent ?? room.monthly_rent ?? 0);
        const outstandingBalance = Math.max(0, Number(tenant.balance ?? room.outstanding_balance ?? 0));
        const tenantAllocations = allocationsByTenant.get(tenantId) ?? [];
        const tenantCollections = collectionsByTenant.get(tenantId) ?? [];
        const currentMonthPaid = tenantAllocations
            .filter((allocation) => String(allocation.allocation_month ?? "").slice(0, 7) === monthStart.slice(0, 7))
            .reduce((total, allocation) => total + Number(allocation.amount_allocated ?? 0), 0);
        const futureAllocations = tenantAllocations
            .filter((allocation) => String(allocation.allocation_type) === "advance_month" && String(allocation.allocation_month ?? "").slice(0, 10) >= nextMonth)
            .sort((left, right) => String(left.allocation_month ?? "").localeCompare(String(right.allocation_month ?? "")));
        const advanceRentBalance = futureAllocations.reduce((total, allocation) => total + Number(allocation.amount_allocated ?? 0), 0);
        const monthsCovered = [...new Set(futureAllocations.map((allocation) => monthLabelFromDate(String(allocation.allocation_month ?? ""))).filter((value): value is string => Boolean(value)))];
        const rawCurrentMonthPaid = tenantCollections
            .filter((collection) => collectionPaymentDate(collection as CollectionRow).slice(0, 7) === monthStart.slice(0, 7))
            .reduce((total, collection) => total + Number(collection.amount_paid ?? collection.amount ?? 0), 0);
        const resolvedOverpayments: Array<{ amount: number; months: string[] }> = [];
        const unresolvedOverpayments: Array<{ amount: number; missing: number }> = [];
        for (const collection of tenantCollections) {
            const paid = Number(collection.amount_paid ?? collection.amount ?? 0);
            const totalDueBeforePayment = Number(collection.balance_before_payment ?? collection.expected_amount ?? 0);
            const excess = Math.max(0, paid - totalDueBeforePayment);
            if (excess <= 0) continue;

            const paymentDate = collectionPaymentDate(collection as CollectionRow);
            const paymentMonth = selectedMonthStart(paymentDate);
            const followOnAllocations = tenantAllocations.filter((allocation) => String(allocation.allocation_month ?? "").slice(0, 10) > paymentMonth);
            const exactFollowOn = followOnAllocations
                .filter((allocation) => String(allocation.payment_id ?? "") === String(collection.id ?? ""))
                .reduce((total, allocation) => total + Number(allocation.amount_allocated ?? 0), 0);
            const anyFollowOn = followOnAllocations
                .reduce((total, allocation) => total + Number(allocation.amount_allocated ?? 0), 0);
            const recordedNextMonth = Number(collection.allocated_to_next_month ?? 0);
            const covered = Math.max(exactFollowOn, Math.min(anyFollowOn, excess), recordedNextMonth);

            if (covered + 0.004 >= excess) {
                const months = [...new Set(followOnAllocations
                    .filter((allocation) => exactFollowOn > 0 ? String(allocation.payment_id ?? "") === String(collection.id ?? "") : true)
                    .map((allocation) => monthLabelFromDate(String(allocation.allocation_month ?? "")))
                    .filter((value): value is string => Boolean(value)))];
                resolvedOverpayments.push({ amount: excess, months });
            } else {
                unresolvedOverpayments.push({ amount: excess, missing: Math.max(0, excess - covered) });
            }
        }
        const hasOverpaymentWithoutAllocation = unresolvedOverpayments.length > 0;

        if (advanceRentBalance > 0) {
            items.push({
                id: `advance-${tenantId}`,
                type: advanceRentBalance >= monthlyRent * 2 ? "prepaid_multiple_months" : "advance_rent",
                severity: "success",
                roomNumber,
                tenantName,
                officeName,
                monthlyRent,
                currentMonthPaid,
                outstandingBalance,
                advanceRentBalance,
                monthsCovered,
                message: `Room ${roomNumber} has UGX ${Math.round(advanceRentBalance).toLocaleString()} already allocated to ${monthsCovered.join(", ") || "future rent"}.`,
            });
            continue;
        }

        if (resolvedOverpayments.length && !hasOverpaymentWithoutAllocation) {
            const resolvedAmount = resolvedOverpayments.reduce((total, item) => total + item.amount, 0);
            const resolvedMonths = [...new Set(resolvedOverpayments.flatMap((item) => item.months))];
            items.push({
                id: `resolved-${tenantId}`,
                type: "resolved",
                severity: "success",
                roomNumber,
                tenantName,
                officeName,
                monthlyRent,
                currentMonthPaid,
                outstandingBalance,
                advanceRentBalance,
                monthsCovered: resolvedMonths,
                message: `Room ${roomNumber} overpayment of UGX ${Math.round(resolvedAmount).toLocaleString()} is resolved and allocated to ${resolvedMonths.join(", ") || "the correct rent month"}.`,
            });
            continue;
        }

        if (hasOverpaymentWithoutAllocation) {
            const missingAmount = unresolvedOverpayments.reduce((total, item) => total + item.missing, 0);
            items.push({
                id: `missing-allocation-${tenantId}`,
                type: "allocation_mismatch",
                severity: "danger",
                roomNumber,
                tenantName,
                officeName,
                monthlyRent,
                currentMonthPaid: Math.min(rawCurrentMonthPaid, monthlyRent),
                outstandingBalance,
                advanceRentBalance,
                monthsCovered: [],
                message: `Room ${roomNumber} has UGX ${Math.round(missingAmount).toLocaleString()} of overpayment history that still needs a rent-month allocation.`,
            });
            continue;
        }

        if (outstandingBalance === 0 && monthlyRent > 0 && currentMonthPaid > 0 && currentMonthPaid < monthlyRent) {
            items.push({
                id: `coverage-mismatch-${tenantId}`,
                type: "coverage_mismatch",
                severity: "warning",
                roomNumber,
                tenantName,
                officeName,
                monthlyRent,
                currentMonthPaid,
                outstandingBalance,
                advanceRentBalance,
                monthsCovered: [],
                message: `Room ${roomNumber} shows zero balance, but current-month allocation is below rent. Review whether an earlier advance or manual adjustment cleared the balance.`,
            });
        }
    }

    return items
        .sort((left, right) => {
            const severityRank = { danger: 0, warning: 1, success: 2 };
            return severityRank[left.severity] - severityRank[right.severity] || right.advanceRentBalance - left.advanceRentBalance || left.roomNumber.localeCompare(right.roomNumber);
        })
        .slice(0, 20);
}

async function hydrateFastPaymentTenantResults(tenants: TenantRow[], companyId: string, officeId: string | null, paymentDate?: string | null) {
    const { supabase } = await getScopedSupabase();
    const tenantIds = tenants.map((tenant) => tenant.id);
    const roomIds = uniqueIds(tenants.map((tenant) => tenant.room_id));
    const [leases, rooms, collections, allocationRows, rentMonthRows] = await Promise.all([
        tenantIds.length ? supabase.from("leases").select("*").eq("company_id", companyId).in("tenant_id", tenantIds).eq("status", "active") : { data: [] as LeaseRow[] },
        roomIds.length ? supabase.from("rooms").select("*").eq("company_id", companyId).in("id", roomIds) : { data: [] as RoomRow[] },
        tenantIds.length
            ? supabase
                .from("collections")
                .select("*")
                .eq("company_id", companyId)
                .in("tenant_id", tenantIds)
                .or("status.is.null,status.not.in.(voided,removed_by_admin_approval,rejected,pending)")
                .order("payment_date", { ascending: false, nullsFirst: false })
                .order("created_at", { ascending: false, nullsFirst: false })
                .limit(80)
            : { data: [] as CollectionRow[] },
        tenantIds.length
            ? optionalRows((supabase as unknown as DynamicDb)
                .from("tenant_rent_allocations")
                .select("tenant_id, payment_id, allocation_month, allocation_type, amount_allocated, allocation_source, is_historical_credit, coverage_start, coverage_end, coverage_index")
                .eq("company_id", companyId)
                .in("tenant_id", tenantIds))
            : [],
        tenantIds.length
            ? optionalRows((supabase as unknown as DynamicDb)
                .from("tenant_rent_months")
                .select("tenant_id, due_date, coverage_start, created_at, source")
                .eq("company_id", companyId)
                .in("tenant_id", tenantIds)
                .order("due_date", { ascending: false }))
            : [],
    ]);
    const leaseRows = leases.data ?? [];
    const roomRows = rooms.data ?? [];
    const officeIds = uniqueIds([officeId, ...tenants.map((tenant) => tenant.office_id), ...roomRows.map((room) => room.office_id), ...leaseRows.map((lease) => lease.office_id)]);
    const propertyIds = uniqueIds([...tenants.map((tenant) => tenant.property_id), ...roomRows.map((room) => room.property_id)]);
    const initialLandlordIds = uniqueIds(roomRows.map((room) => room.landlord_id));
    const [{ data: offices }, { data: properties }] = await Promise.all([
        officeIds.length ? supabase.from("offices").select("*").eq("company_id", companyId).in("id", officeIds) : { data: [] as OfficeRow[] },
        propertyIds.length ? supabase.from("properties").select("*").eq("company_id", companyId).in("id", propertyIds) : { data: [] as PropertyRow[] },
    ]);
    const propertyLandlordIds = uniqueIds((properties ?? []).map((property) => property.landlord_id));
    const landlordIds = uniqueIds([...initialLandlordIds, ...propertyLandlordIds]);
    const { data: landlords } = landlordIds.length
        ? await supabase.from("landlords").select("*").eq("company_id", companyId).in("id", landlordIds)
        : { data: [] as LandlordRow[] };
    const leaseByTenant = new Map(leaseRows.map((lease) => [lease.tenant_id, lease]));
    const roomById = new Map(roomRows.map((room) => [room.id, room]));
    const officeById = new Map((offices ?? []).map((office) => [office.id, office]));
    const propertyById = new Map((properties ?? []).map((property) => [property.id, property]));
    const landlordById = new Map((landlords ?? []).map((landlord) => [landlord.id, landlord]));
    const collectionsByTenant = new Map<string, CollectionRow[]>();
    for (const collection of (collections.data ?? []) as CollectionRow[]) {
        if (!collection.tenant_id) continue;
        collectionsByTenant.set(collection.tenant_id, [...(collectionsByTenant.get(collection.tenant_id) ?? []), collection]);
    }
    const allocationsByTenant = new Map<string, Array<Record<string, unknown>>>();
    for (const allocation of allocationRows as Array<Record<string, unknown>>) {
        const tenantId = String(allocation.tenant_id ?? "");
        if (!tenantId) continue;
        allocationsByTenant.set(tenantId, [...(allocationsByTenant.get(tenantId) ?? []), allocation]);
    }
    const lastRentChargeByTenant = new Map<string, string>();
    for (const row of rentMonthRows as Array<Record<string, unknown>>) {
        const tenantId = String(row.tenant_id ?? "");
        const chargeDate = String(row.due_date ?? row.coverage_start ?? row.created_at ?? "").slice(0, 10);
        if (tenantId && chargeDate && !lastRentChargeByTenant.has(tenantId)) {
            lastRentChargeByTenant.set(tenantId, chargeDate);
        }
    }

    return tenants.map((tenant): CollectionTenantResult => {
        const lease = leaseByTenant.get(tenant.id) ?? null;
        const room = tenant.room_id ? roomById.get(tenant.room_id) ?? null : null;
        const tenantCollections = collectionsByTenant.get(tenant.id) ?? [];
        const lastCollection = tenantCollections[0] ?? null;
        const monthlyRent = Number(lease?.monthly_rent ?? tenant.monthly_rent ?? room?.monthly_rent ?? 0);
        const rawOutstandingBeforeLastPayment = Number((lastCollection as CollectionRow & { balance_before_payment?: number | null })?.balance_before_payment ?? lastCollection?.expected_amount ?? 0);
        const previousOutstandingBeforeLastPayment = Math.max(0, rawOutstandingBeforeLastPayment);
        const lastAmountPaid = Number(lastCollection?.amount_paid ?? lastCollection?.amount ?? 0);
        const tenantAllocations = allocationsByTenant.get(tenant.id) ?? [];
        const monthStart = selectedMonthStart(paymentDate);
        const upcomingMonth = addMonthsToMonthStart(monthStart, 1);
        const allocationByMonth = new Map<string, { historical: number; arrears: number; rent: number; advance: number; coverageStart: string | null; coverageEnd: string | null }>();
        for (const allocation of tenantAllocations) {
            const month = String(allocation.allocation_month ?? "").slice(0, 10);
            if (!month) continue;
            const current = allocationByMonth.get(month) ?? { historical: 0, arrears: 0, rent: 0, advance: 0, coverageStart: null, coverageEnd: null };
            const amount = Number(allocation.amount_allocated ?? 0);
            const type = String(allocation.allocation_type);
            const isHistoricalCredit = allocation.is_historical_credit === true || String(allocation.allocation_source ?? "") === "historical_credit";
            current.coverageStart ||= String(allocation.coverage_start ?? "") || null;
            current.coverageEnd ||= String(allocation.coverage_end ?? "") || null;
            if (isHistoricalCredit) current.historical += amount;
            else if (type === "arrears") current.arrears += amount;
            else if (type === "current_month") current.rent += amount;
            else if (type === "advance_month") current.advance += amount;
            allocationByMonth.set(month, current);
        }
        const sortedAllocationMonths = [...allocationByMonth.entries()].sort(([left], [right]) => left.localeCompare(right));
        const futureAdvanceAllocations = sortedAllocationMonths.filter(([month, values]) => month > monthStart && values.advance > 0);
        const advanceRentBalance = futureAdvanceAllocations.reduce((total, [, values]) => total + values.advance, 0);
        const advanceRentMonths = futureAdvanceAllocations.map(([month, values]) => ({ month, label: monthLabelFromDate(month) ?? month, amount: values.advance }));
        const rentMonthAllocations = sortedAllocationMonths.map(([month, values]) => {
            const isFuture = month > monthStart;
            const amountPaid = values.historical + values.arrears + values.rent + values.advance;
            const amountDue = monthlyRent > 0 ? monthlyRent : amountPaid;
            const allocationType = values.advance > 0 && isFuture ? "future_advance" as const : month.slice(0, 7) === monthStart.slice(0, 7) ? "rent_month" as const : "arrears_month" as const;
            const status = allocationType === "future_advance" ? "advance_paid" as const : amountPaid >= amountDue ? "paid" as const : "partial" as const;
            return { allocationType, amountDue, amountPaid, coverageEnd: values.coverageEnd, coverageStart: values.coverageStart, label: monthLabelFromDate(month) ?? month, lastPaymentAmount: values.arrears + values.rent + values.advance, month, previouslyPaidAmount: values.historical, status };
        });
        const businessDate = paymentDate?.slice(0, 10) || new Date().toISOString().slice(0, 10);
        const billingPeriod = tenantBillingPeriod(tenant, lease, businessDate);
        const currentRentPeriod = { start: billingPeriod.coverageStart, end: billingPeriod.coverageEnd };
        const billingAnniversaryDay = billingPeriod.billingDay;
        const nextCharge = nextBillingDate({
            billingDay: billingPeriod.billingDay,
            businessDate,
            leaseStartDate: lease?.start_date ?? tenant.created_at?.slice(0, 10) ?? null,
        });
        const currentMonthValues = sortedAllocationMonths.find(([month]) => month.slice(0, 7) === monthStart.slice(0, 7))?.[1];
        const currentMonthPaid = Math.min(monthlyRent, (currentMonthValues?.historical ?? 0) + (currentMonthValues?.rent ?? 0) + (currentMonthValues?.arrears ?? 0));
        const nextMonthCoveredAmount = sortedAllocationMonths.find(([month]) => month.slice(0, 7) === upcomingMonth.slice(0, 7))?.[1]?.advance ?? 0;
        const latestArrearsMonth = sortedAllocationMonths.filter(([, values]) => values.arrears > 0).map(([month]) => month).at(-1);
        const firstRentOrAdvanceAfterOutstanding = sortedAllocationMonths.find(([month, values]) => latestArrearsMonth ? month > latestArrearsMonth && (values.rent > 0 || values.advance > 0) : month > monthStart && (values.rent > 0 || values.advance > 0));
        const amountAllocatedToNextMonth = Number((lastCollection as CollectionRow & { allocated_to_next_month?: number | null })?.allocated_to_next_month ?? 0) ||
            (firstRentOrAdvanceAfterOutstanding ? firstRentOrAdvanceAfterOutstanding[1].rent + firstRentOrAdvanceAfterOutstanding[1].advance : 0);
        const amountUsedToClearOutstanding = Number((lastCollection as CollectionRow & { used_to_clear_outstanding?: number | null })?.used_to_clear_outstanding ?? 0) ||
            Math.min(previousOutstandingBeforeLastPayment, lastAmountPaid);
        const propertyId = tenant.property_id ?? room?.property_id ?? null;
        const property = propertyId ? propertyById.get(propertyId) ?? null : null;
        const landlordId = room?.landlord_id ?? property?.landlord_id ?? null;
        const resolvedOfficeId = lease?.office_id ?? room?.office_id ?? tenant.office_id ?? officeId;

        return {
            tenant,
            room: room ? { ...room, landlord_id: landlordId } as RoomRow : room,
            property,
            office: resolvedOfficeId ? officeById.get(resolvedOfficeId) ?? null : null,
            landlord: landlordId ? landlordById.get(landlordId) ?? null : null,
            lease,
            outstandingBalance: Number(tenant.balance ?? room?.outstanding_balance ?? 0),
            previousOutstandingBeforeLastPayment,
            totalDueBeforeLastPayment: rawOutstandingBeforeLastPayment,
            lastAmountPaid,
            amountUsedToClearOutstanding,
            amountAllocatedToNextMonth,
            monthlyRent,
            billingAnniversaryDay,
            currentRentPeriod,
            lastRentChargeDate: lastRentChargeByTenant.get(tenant.id) ?? null,
            nextRentChargeDate: nextCharge,
            currentMonthPaid,
            advanceRentBalance,
            advanceRentMonths,
            rentMonthAllocations,
            nextMonthCoveredAmount,
            nextAdvanceRentMonth: monthLabelFromDate(advanceRentMonths[0]?.month),
            sponsor: null,
            contribution: emptyContribution(monthlyRent),
            lastCollection,
            openPromise: null,
            collections: tenantCollections,
            promises: [],
            ledgerEntries: [],
            actionHistory: [],
        };
    });
}

export async function getTenantCollectionContext(tenantId: string) {
    const context = await requirePermission("collections.read");
    const { supabase } = await getScopedSupabase();
    const companyId = context.activeCompany?.id;
    const officeId = context.activeOffice?.id;

    if (!companyId || !officeId) {
        throw new Error("Active company and office are required.");
    }

    const { data: tenant, error } = await supabase
        .from("tenants")
        .select("*")
        .eq("id", tenantId)
        .eq("company_id", companyId)
        .maybeSingle();

    if (error) {
        throw new Error(error.message);
    }

    if (!tenant) {
        throw new Error("Tenant not found.");
    }

    const [result] = await hydrateTenantResults([tenant], companyId, officeId);
    const resolvedOfficeId = result?.lease?.office_id ?? result?.room?.office_id ?? result?.tenant.office_id ?? null;
    const canUseResolvedOffice = context.canAccessAllOffices || context.isCompanyAdmin || resolvedOfficeId === officeId;

    if (!result || !canUseResolvedOffice) {
        throw new Error("Tenant is not accessible from the active office context.");
    }

    return result;
}

async function findMatchingRoomIds(term: string, companyId: string, officeId: string | null) {
    const { supabase } = await getScopedSupabase();
    const escapedTerm = escapeSupabaseLike(term);
    const prefixPattern = `${escapedTerm}%`;
    const containsPattern = `%${escapedTerm}%`;

    let prefixQuery = supabase
        .from("rooms")
        .select("id, room_number")
        .eq("company_id", companyId)
        .ilike("room_number", prefixPattern)
        .order("room_number")
        .limit(25);

    if (officeId) {
        prefixQuery = prefixQuery.eq("office_id", officeId);
    }

    const { data: prefixRows } = await prefixQuery;
    const ids = uniqueIds((prefixRows ?? []).map((room) => room.id));

    if (ids.length >= 25) {
        return ids;
    }

    let containsQuery = supabase
        .from("rooms")
        .select("id, room_number")
        .eq("company_id", companyId)
        .ilike("room_number", containsPattern)
        .order("room_number")
        .limit(25);

    if (officeId) {
        containsQuery = containsQuery.eq("office_id", officeId);
    }

    const { data: containsRows } = await containsQuery;
    return uniqueIds([...ids, ...(containsRows ?? []).map((room) => room.id)]);
}

async function findMatchingLandlordRoomIds(term: string, companyId: string, officeId: string | null) {
    const { supabase } = await getScopedSupabase();
    const escapedTerm = escapeSupabaseLike(term);
    const { data: landlordRows } = await supabase
        .from("landlords")
        .select("id")
        .eq("company_id", companyId)
        .ilike("full_name", `%${escapedTerm}%`)
        .limit(20);

    const landlordIds = uniqueIds((landlordRows ?? []).map((landlord) => landlord.id));
    if (!landlordIds.length) {
        return [];
    }

    let roomQuery = supabase
        .from("rooms")
        .select("id")
        .eq("company_id", companyId)
        .in("landlord_id", landlordIds)
        .limit(25);

    if (officeId) {
        roomQuery = roomQuery.eq("office_id", officeId);
    }

    const { data: roomRows } = await roomQuery;
    return uniqueIds((roomRows ?? []).map((room) => room.id));
}

async function hydrateTenantResults(tenants: TenantRow[], companyId: string, officeId: string | null, paymentDate?: string | null) {
    const { supabase } = await getScopedSupabase();
    const tenantIds = tenants.map((tenant) => tenant.id);
    const roomIds = [...new Set(tenants.map((tenant) => tenant.room_id).filter((id): id is string => Boolean(id)))];

    const [leases, rooms, properties, office, collections, promises, ledgerEntries, actionHistory, sponsors, allocationRows, rentMonthRows] = await Promise.all([
        tenantIds.length
            ? supabase
                .from("leases")
                .select("*")
                .eq("company_id", companyId)
                .in("tenant_id", tenantIds)
                .eq("status", "active")
            : { data: [] as LeaseRow[] },
        roomIds.length
            ? supabase.from("rooms").select("*").eq("company_id", companyId).in("id", roomIds)
            : { data: [] as RoomRow[] },
        { data: [] as PropertyRow[] },
        officeId ? supabase.from("offices").select("*").eq("id", officeId).maybeSingle() : { data: null as OfficeRow | null },
        tenantIds.length
            ? supabase
                .from("collections")
                .select("*")
                .eq("company_id", companyId)
                .in("tenant_id", tenantIds)
                .order("paid_at", { ascending: false, nullsFirst: false })
            : { data: [] },
        tenantIds.length
            ? supabase
                .from("promises")
                .select("*")
                .eq("company_id", companyId)
                .in("tenant_id", tenantIds)
                .neq("status", "fulfilled")
                .order("promised_date", { ascending: true })
            : { data: [] as PromiseRow[] },
        tenantIds.length
            ? supabase
                .from("tenant_ledger_entries")
                .select("*")
                .eq("company_id", companyId)
                .in("tenant_id", tenantIds)
                .order("created_at", { ascending: false })
                .limit(100)
            : { data: [] as TenantLedgerRow[] },
        tenantIds.length
            ? supabase
                .from("collection_actions")
                .select("*")
                .eq("company_id", companyId)
                .in("tenant_id", tenantIds)
                .order("created_at", { ascending: false })
                .limit(100)
            : { data: [] as CollectionActionRow[] },
        tenantIds.length
            ? (supabase as unknown as DynamicDb)
                .from("tenant_rent_sponsors")
                .select("*")
                .eq("company_id", companyId)
                .in("tenant_id", tenantIds)
                .eq("status", "active")
            : { data: [] as TenantRentSponsor[] },
        tenantIds.length
            ? optionalRows((supabase as unknown as DynamicDb)
                .from("tenant_rent_allocations")
                .select("tenant_id, allocation_month, allocation_type, amount_allocated, coverage_start, coverage_end, coverage_index")
                .eq("company_id", companyId)
                .in("tenant_id", tenantIds))
            : [],
        tenantIds.length
            ? optionalRows((supabase as unknown as DynamicDb)
                .from("tenant_rent_months")
                .select("tenant_id, due_date, coverage_start, created_at, source")
                .eq("company_id", companyId)
                .in("tenant_id", tenantIds)
                .order("due_date", { ascending: false }))
            : [],
    ]);

    const leaseByTenant = new Map((leases.data ?? []).map((lease) => [lease.tenant_id, lease]));
    const roomById = new Map((rooms.data ?? []).map((room) => [room.id, room]));
    const sponsorRows = (sponsors.data ?? []) as TenantRentSponsor[];
    const sponsorByTenant = new Map<string, TenantRentSponsor>(sponsorRows.map((sponsor) => [sponsor.tenant_id, sponsor]));
    const allocationsByTenant = new Map<string, Array<Record<string, unknown>>>();
    for (const allocation of allocationRows as Array<Record<string, unknown>>) {
        const tenantId = String(allocation.tenant_id ?? "");
        if (!tenantId) continue;
        allocationsByTenant.set(tenantId, [...(allocationsByTenant.get(tenantId) ?? []), allocation]);
    }
    const lastRentChargeByTenant = new Map<string, string>();
    for (const row of rentMonthRows as Array<Record<string, unknown>>) {
        const tenantId = String(row.tenant_id ?? "");
        const chargeDate = String(row.due_date ?? row.coverage_start ?? row.created_at ?? "").slice(0, 10);
        if (tenantId && chargeDate && !lastRentChargeByTenant.has(tenantId)) {
            lastRentChargeByTenant.set(tenantId, chargeDate);
        }
    }

    const propertyIds = [...new Set([
        ...tenants.map((tenant) => tenant.property_id),
        ...(rooms.data ?? []).map((room) => room.property_id),
    ].filter((id): id is string => Boolean(id)))];
    const directLandlordIds = [...new Set([
        ...(rooms.data ?? []).map((room) => room.landlord_id),
    ].filter((id): id is string => Boolean(id)))];

    const officeIds = [...new Set([
        officeId,
        ...tenants.map((tenant) => tenant.office_id),
        ...(rooms.data ?? []).map((room) => room.office_id),
        ...(leases.data ?? []).map((lease) => lease.office_id),
    ].filter((id): id is string => Boolean(id)))];

    const [{ data: hydratedProperties }, { data: hydratedOffices }] = await Promise.all([
        propertyIds.length
            ? supabase.from("properties").select("*").eq("company_id", companyId).in("id", propertyIds)
            : { data: [] as PropertyRow[] },
        officeIds.length
            ? supabase.from("offices").select("*").eq("company_id", companyId).in("id", officeIds)
            : { data: [] as OfficeRow[] },
    ]);

    const propertyById = new Map((properties.data ?? []).map((property) => [property.id, property]));
    for (const property of hydratedProperties ?? []) {
        propertyById.set(property.id, property);
    }
    const propertyLandlordIds = [...new Set((hydratedProperties ?? []).map((property) => property.landlord_id).filter((id): id is string => Boolean(id)))];
    const landlordIds = [...new Set([...directLandlordIds, ...propertyLandlordIds])];
    const { data: hydratedLandlords } = landlordIds.length
        ? await supabase.from("landlords").select("*").eq("company_id", companyId).in("id", landlordIds)
        : { data: [] as LandlordRow[] };
    const officeById = new Map((hydratedOffices ?? []).map((officeRow) => [officeRow.id, officeRow]));
    const landlordById = new Map((hydratedLandlords ?? []).map((landlord) => [landlord.id, landlord]));
    if (office.data) {
        officeById.set(office.data.id, office.data as OfficeRow);
    }

    return tenants.map((tenant): CollectionTenantResult => {
        const lease = leaseByTenant.get(tenant.id) ?? null;
        const room = tenant.room_id ? roomById.get(tenant.room_id) ?? null : null;
        const propertyId = tenant.property_id ?? room?.property_id ?? null;
        const property = propertyId ? propertyById.get(propertyId) ?? null : null;
        const landlordId = room?.landlord_id ?? property?.landlord_id ?? null;
        const resolvedOfficeId = lease?.office_id ?? room?.office_id ?? tenant.office_id ?? officeId;
        const lastCollection =
            (collections.data ?? []).find((collection) => collection.tenant_id === tenant.id) ?? null;
        const openPromise = (promises.data ?? []).find((promise) => promise.tenant_id === tenant.id) ?? null;
        const tenantCollections = (collections.data ?? []).filter((collection) => collection.tenant_id === tenant.id);
        const monthlyRent = Number(lease?.monthly_rent ?? tenant.monthly_rent ?? room?.monthly_rent ?? 0);
        const lastAmountPaid = Number(lastCollection?.amount_paid ?? lastCollection?.amount ?? 0);
        const rawTotalDueBeforeLastPayment = Number((lastCollection as CollectionRow & { balance_before_payment?: number | null })?.balance_before_payment ?? lastCollection?.expected_amount ?? 0);
        const totalDueBeforeLastPayment = Math.max(0, rawTotalDueBeforeLastPayment);
        const previousOutstandingBeforeLastPayment = totalDueBeforeLastPayment;
        const sponsor = sponsorByTenant.get(tenant.id) ?? null;
        const tenantAllocations = allocationsByTenant.get(tenant.id) ?? [];
        const monthStart = selectedMonthStart(paymentDate);
        const upcomingMonth = addMonthsToMonthStart(monthStart, 1);
        const allocatedCurrentMonthPaid = tenantAllocations
            .filter((allocation) => String(allocation.allocation_type) === "current_month" && String(allocation.allocation_month ?? "").slice(0, 7) === monthStart.slice(0, 7))
            .reduce((total, allocation) => total + Number(allocation.amount_allocated ?? 0), 0);
        const rawCurrentMonthPaid = tenantCollections
            .filter((collection) => collectionPaymentDate(collection).slice(0, 7) === monthStart.slice(0, 7))
            .reduce((total, collection) => total + Number(collection.amount_paid ?? collection.amount ?? 0), 0);
        const currentMonthPaid = allocatedCurrentMonthPaid > 0 ? allocatedCurrentMonthPaid : Math.min(rawCurrentMonthPaid, monthlyRent);
        const futureAdvanceAllocations = tenantAllocations
            .filter((allocation) => String(allocation.allocation_type) === "advance_month" && String(allocation.allocation_month ?? "").slice(0, 10) >= upcomingMonth);
        const advanceRentBalance = futureAdvanceAllocations.reduce((total, allocation) => total + Number(allocation.amount_allocated ?? 0), 0);
        const advanceByMonth = new Map<string, number>();
        for (const allocation of futureAdvanceAllocations) {
            const month = String(allocation.allocation_month ?? "").slice(0, 10);
            if (!month) continue;
            advanceByMonth.set(month, (advanceByMonth.get(month) ?? 0) + Number(allocation.amount_allocated ?? 0));
        }
        const advanceRentMonths = [...advanceByMonth.entries()]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([month, amount]) => ({ month, label: monthLabelFromDate(month) ?? month, amount }));
        const collectionById = new Map(tenantCollections.map((collection) => [collection.id, collection]));
        const allocationByMonth = new Map<string, { arrears: number; rent: number; advance: number; implicitPriorPaid: number; coverageStart: string | null; coverageEnd: string | null }>();
        for (const allocation of tenantAllocations) {
            const type = String(allocation.allocation_type);
            const month = String(allocation.allocation_month ?? "").slice(0, 10);
            if (!month) continue;
            const current = allocationByMonth.get(month) ?? { arrears: 0, rent: 0, advance: 0, implicitPriorPaid: 0, coverageStart: null, coverageEnd: null };
            const amount = Number(allocation.amount_allocated ?? 0);
            const isHistoricalCredit = allocation.is_historical_credit === true || String(allocation.allocation_source ?? "") === "historical_credit";
            current.coverageStart ||= String(allocation.coverage_start ?? "") || null;
            current.coverageEnd ||= String(allocation.coverage_end ?? "") || null;
            if (isHistoricalCredit) {
                current.implicitPriorPaid += amount;
                allocationByMonth.set(month, current);
                continue;
            }
            if (type === "arrears") current.arrears += amount;
            if (type === "current_month") current.rent += amount;
            if (type === "advance_month") current.advance += amount;
            allocationByMonth.set(month, current);
        }
        const sortedAllocationMonths = [...allocationByMonth.entries()].sort(([left], [right]) => left.localeCompare(right));
        const amountUsedToClearOutstanding = Number((lastCollection as CollectionRow & { used_to_clear_outstanding?: number | null })?.used_to_clear_outstanding ?? 0) ||
            Math.min(previousOutstandingBeforeLastPayment, lastAmountPaid);
        const latestArrearsMonth = sortedAllocationMonths
            .filter(([, values]) => values.arrears > 0)
            .map(([month]) => month)
            .at(-1);
        const firstRentOrAdvanceAfterOutstanding = sortedAllocationMonths.find(([month, values]) => {
            if (latestArrearsMonth) return month > latestArrearsMonth && (values.rent > 0 || values.advance > 0);
            return month > monthStart && (values.rent > 0 || values.advance > 0);
        });
        const savedAllocatedToNextMonth = Number((lastCollection as CollectionRow & { allocated_to_next_month?: number | null })?.allocated_to_next_month ?? 0);
        const amountAllocatedToNextMonth = savedAllocatedToNextMonth || (firstRentOrAdvanceAfterOutstanding
            ? firstRentOrAdvanceAfterOutstanding[1].rent + firstRentOrAdvanceAfterOutstanding[1].advance
            : 0);
        const rentMonthAllocations = sortedAllocationMonths
            .map(([month, values]) => {
                const isFuture = month > monthStart;
                const isSelectedMonth = month.slice(0, 7) === monthStart.slice(0, 7);
                const amountPaid = values.implicitPriorPaid + values.arrears + values.rent + values.advance;
                const amountDue = values.arrears > 0
                    ? monthlyRent > 0
                        ? monthlyRent
                        : amountPaid
                    : monthlyRent > 0
                        ? monthlyRent
                        : amountPaid;
                const allocationType = values.advance > 0 && isFuture
                    ? "future_advance" as const
                    : isSelectedMonth
                        ? "rent_month" as const
                        : "arrears_month" as const;
                const status = allocationType === "future_advance"
                    ? "advance_paid" as const
                    : amountPaid >= amountDue
                        ? "paid" as const
                        : "partial" as const;
                return {
                    allocationType,
                    amountDue,
                    amountPaid,
                    coverageEnd: values.coverageEnd,
                    coverageStart: values.coverageStart,
                    label: monthLabelFromDate(month) ?? month,
                    lastPaymentAmount: values.arrears + values.rent + values.advance,
                    month,
                    previouslyPaidAmount: values.implicitPriorPaid,
                    status,
                };
            });
        const nextMonthCoveredAmount = tenantAllocations
            .filter((allocation) => String(allocation.allocation_type) === "advance_month" && String(allocation.allocation_month ?? "").slice(0, 7) === upcomingMonth.slice(0, 7))
            .reduce((total, allocation) => total + Number(allocation.amount_allocated ?? 0), 0);
        const nextAdvanceRentMonth = monthLabelFromDate(
            tenantAllocations
                .filter((allocation) => String(allocation.allocation_type) === "advance_month" && String(allocation.allocation_month ?? "").slice(0, 10) >= upcomingMonth)
                .sort((a, b) => String(a.allocation_month ?? "").localeCompare(String(b.allocation_month ?? "")))[0]?.allocation_month as string | null | undefined,
        );
        const businessDate = paymentDate?.slice(0, 10) || new Date().toISOString().slice(0, 10);
        const billingPeriod = tenantBillingPeriod(tenant, lease, businessDate);
        const currentRentPeriod = { start: billingPeriod.coverageStart, end: billingPeriod.coverageEnd };
        const billingAnniversaryDay = billingPeriod.billingDay;
        const nextCharge = nextBillingDate({
            billingDay: billingPeriod.billingDay,
            businessDate,
            leaseStartDate: lease?.start_date ?? tenant.created_at?.slice(0, 10) ?? null,
        });

        return {
            tenant,
            room: room ? { ...room, landlord_id: landlordId } as RoomRow : room,
            property,
            office: resolvedOfficeId ? officeById.get(resolvedOfficeId) ?? null : null,
            landlord: landlordId ? landlordById.get(landlordId) ?? null : null,
            lease,
            outstandingBalance: Number(tenant.balance ?? room?.outstanding_balance ?? 0),
            previousOutstandingBeforeLastPayment,
            totalDueBeforeLastPayment,
            lastAmountPaid,
            amountUsedToClearOutstanding,
            amountAllocatedToNextMonth,
            monthlyRent,
            billingAnniversaryDay,
            currentRentPeriod,
            lastRentChargeDate: lastRentChargeByTenant.get(tenant.id) ?? null,
            nextRentChargeDate: nextCharge,
            currentMonthPaid,
            advanceRentBalance,
            advanceRentMonths,
            rentMonthAllocations,
            nextMonthCoveredAmount,
            nextAdvanceRentMonth,
            sponsor,
            contribution: buildContributionBreakdown({ monthlyRent, sponsor, collections: tenantCollections }),
            lastCollection,
            openPromise,
            collections: tenantCollections,
            promises: (promises.data ?? []).filter((promise) => promise.tenant_id === tenant.id),
            ledgerEntries: (ledgerEntries.data ?? []).filter((entry) => entry.tenant_id === tenant.id),
            actionHistory: (actionHistory.data ?? []).filter((action) => action.tenant_id === tenant.id),
        };
    });
}

function emptyContribution(monthlyRent: number): TenantContributionBreakdown {
    return {
        hasSponsor: false,
        employerExpected: 0,
        employerReceivedThisMonth: 0,
        employerBalance: 0,
        tenantTopUpExpected: monthlyRent,
        tenantTopUpPaidThisMonth: 0,
        tenantTopUpBalance: monthlyRent,
        collectFromTenant: monthlyRent,
    };
}

function buildContributionBreakdown({
    monthlyRent,
    sponsor,
    collections,
}: {
    monthlyRent: number;
    sponsor: TenantRentSponsor | null;
    collections: CollectionRow[];
}): TenantContributionBreakdown {
    if (!sponsor) return emptyContribution(monthlyRent);

    const employerExpected = Math.max(0, Number(sponsor.covered_amount ?? 0));
    const tenantTopUpExpected = Math.max(0, Number(sponsor.tenant_top_up_amount ?? monthlyRent - employerExpected));
    const month = monthRange();
    const thisMonth = collections.filter((collection) => {
        const paidAt = collectionPaymentDate(collection);
        return Boolean(paidAt && paidAt >= month.startDate && paidAt <= month.endDate);
    }) as CollectionWithContribution[];
    const employerReceivedThisMonth = thisMonth
        .filter((collection) => collection.payment_source === "employer")
        .reduce((total, collection) => total + Number(collection.amount_paid ?? collection.amount ?? 0), 0);
    const tenantTopUpPaidThisMonth = thisMonth
        .filter((collection) => collection.payment_source !== "employer")
        .reduce((total, collection) => total + Number(collection.amount_paid ?? collection.amount ?? 0), 0);

    return {
        hasSponsor: true,
        employerExpected,
        employerReceivedThisMonth,
        employerBalance: Math.max(0, employerExpected - employerReceivedThisMonth),
        tenantTopUpExpected,
        tenantTopUpPaidThisMonth,
        tenantTopUpBalance: Math.max(0, tenantTopUpExpected - tenantTopUpPaidThisMonth),
        collectFromTenant: Math.max(0, tenantTopUpExpected - tenantTopUpPaidThisMonth),
    };
}

function tenantResultBelongsToOffice(result: CollectionTenantResult, officeId: string | null) {
    if (!officeId) return false;
    return (result.lease?.office_id ?? result.room?.office_id ?? result.tenant.office_id ?? null) === officeId;
}

function uniqueIds(ids: Array<string | null | undefined>) {
    return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

function escapeSupabaseLike(value: string) {
    return value.replace(/[\\%_]/g, "\\$&");
}

function normalizeSearchValue(value: string | null | undefined) {
    return String(value ?? "").trim().toLowerCase();
}

function scoreTenantSearchResult(result: CollectionTenantResult, term: string) {
    const lookup = normalizeSearchValue(term);
    const roomNumber = normalizeSearchValue(result.room?.room_number);
    const tenantName = normalizeSearchValue(result.tenant.full_name);
    const tenantPhone = normalizeSearchValue(result.tenant.phone);
    const landlordName = normalizeSearchValue(result.landlord?.full_name);

    if (roomNumber === lookup) return 0;
    if (roomNumber.startsWith(lookup)) return 1;
    if (tenantName.startsWith(lookup)) return 2;
    if (tenantPhone.startsWith(lookup)) return 3;
    if (landlordName.startsWith(lookup)) return 4;
    if (roomNumber.includes(lookup)) return 5;
    if (tenantName.includes(lookup)) return 6;
    if (tenantPhone.includes(lookup)) return 7;
    if (landlordName.includes(lookup)) return 8;
    return 9;
}

function extractTenantName(value: unknown) {
    if (Array.isArray(value)) {
        return typeof value[0]?.full_name === "string" ? value[0].full_name : null;
    }

    if (value && typeof value === "object" && "full_name" in value) {
        const name = (value as { full_name?: unknown }).full_name;
        return typeof name === "string" ? name : null;
    }

    return null;
}

function emptyKpis(): CollectionKpis {
    return {
        todayCollections: 0,
        monthCollections: 0,
        outstandingBalance: 0,
        promisesDueToday: 0,
        promiseRecoveryRate: 0,
    };
}
