import { cache } from "react";
import { requirePermission } from "@/lib/auth/permissions";
import { getScopedSupabase } from "@/lib/auth/query";
import type { Database } from "@/types/database.types";
import type { SpreadsheetData, SpreadsheetRow } from "./types";

type CollectionRow = Database["public"]["Tables"]["collections"]["Row"];
type PromiseRow = Database["public"]["Tables"]["promises"]["Row"];
type ExpenseRow = Database["public"]["Tables"]["expenses"]["Row"];
type LandlordPaymentRow = Database["public"]["Tables"]["landlord_payments"]["Row"];
type AttendanceEventRow = Database["public"]["Tables"]["attendance_events"]["Row"];
type EmployeeRow = Database["public"]["Tables"]["employees"]["Row"];
type TenantRow = Database["public"]["Tables"]["tenants"]["Row"];
type RoomRow = Database["public"]["Tables"]["rooms"]["Row"];
type PropertyRow = Database["public"]["Tables"]["properties"]["Row"];
type LandlordRow = Database["public"]["Tables"]["landlords"]["Row"];
type UserRow = Database["public"]["Tables"]["users"]["Row"];
type OfficeRow = Database["public"]["Tables"]["offices"]["Row"];
type ExpenseCategoryRow = Database["public"]["Tables"]["expense_categories"]["Row"];
type AuditRow = Database["public"]["Tables"]["audit_logs"]["Row"];
type OfficeDailyReportRow = {
    id: string;
    company_id: string;
    office_id: string | null;
    report_date: string;
    submitted_by: string | null;
    total_collections: number | string | null;
    total_expenses: number | string | null;
    landlord_payments: number | string | null;
    vacant_rooms: number | null;
    new_tenants: number | null;
    broken_promises: number | null;
    challenges_faced: string | null;
    general_office_notes: string | null;
    status: string | null;
    submitted_at: string | null;
    created_at: string | null;
    updated_at: string | null;
};
type VacatedTenantDebtRow = {
    id: string;
    company_id: string;
    office_id: string | null;
    tenant_id: string | null;
    room_id: string | null;
    property_id: string | null;
    landlord_id: string | null;
    tenant_name: string | null;
    tenant_phone: string | null;
    room_number: string | null;
    property_name: string | null;
    landlord_name: string | null;
    original_amount: number | string | null;
    recovered_amount: number | string | null;
    remaining_amount: number | string | null;
    recovery_status: string | null;
    notes: string | null;
    created_by: string | null;
    created_at: string | null;
    updated_at: string | null;
};
type LandlordDebtDeductionRow = {
    id: string;
    company_id: string;
    office_id: string | null;
    landlord_id: string | null;
    tenant_id: string | null;
    room_id: string | null;
    property_id: string | null;
    vacated_tenant_debt_id: string | null;
    tenant_name: string | null;
    room_number: string | null;
    property_name: string | null;
    landlord_name: string | null;
    amount: number | string | null;
    applied_amount: number | string | null;
    status: string | null;
    notes: string | null;
    created_by: string | null;
    created_at: string | null;
    updated_at: string | null;
};

const PAGE_SIZE = 1000;
type SpreadsheetDataOptions = {
    maxRowsPerSource?: number | null;
    includeAuditStatus?: boolean;
};
type IdLookupClient = {
    from: (table: string) => {
        select: (columns: string) => {
            in: (column: string, values: string[]) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
        };
    };
};

function amount(value: number | string | null | undefined) {
    return Number(value ?? 0) || 0;
}

function dateValue(value: string | null | undefined) {
    return value ?? new Date().toISOString();
}

function rowDate(value: string | null | undefined) {
    return dateValue(value).slice(0, 10);
}

function auditStatus(auditsByEntity: Map<string, AuditRow[]>, entityId: string) {
    return auditsByEntity.has(entityId) ? "Audited" : "Pending Audit";
}

async function fetchAllRows<T>(query: {
    range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
}, maxRows: number | null = null) {
    const rows: T[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
        const to = maxRows ? Math.min(from + PAGE_SIZE - 1, maxRows - 1) : from + PAGE_SIZE - 1;
        const result = await query.range(from, to);
        if (result.error) throw new Error(result.error.message);
        rows.push(...(result.data ?? []));
        if ((result.data ?? []).length < PAGE_SIZE || (maxRows && rows.length >= maxRows)) break;
    }
    return rows;
}

function addId(ids: Set<string>, id: string | null | undefined) {
    if (id) ids.add(id);
}

function addIds(ids: Set<string>, values: Array<string | null | undefined>) {
    for (const value of values) addId(ids, value);
}

function chunks<T>(values: T[], size = 500) {
    const output: T[][] = [];
    for (let index = 0; index < values.length; index += size) {
        output.push(values.slice(index, index + size));
    }
    return output;
}

async function fetchRowsByIds<T>(input: {
    supabase: IdLookupClient;
    table: string;
    ids: Set<string>;
}) {
    const rows: T[] = [];
    const values = [...input.ids];
    if (!values.length) return rows;

    for (const chunk of chunks(values)) {
        const result = await input.supabase.from(input.table).select("*").in("id", chunk);
        if (result.error) throw new Error(result.error.message);
        rows.push(...((result.data ?? []) as T[]));
    }

    return rows;
}

async function fetchAuditsByEntityIds(input: {
    supabase: IdLookupClient;
    companyId: string;
    ids: Set<string>;
}) {
    const rows: AuditRow[] = [];
    const values = [...input.ids];
    if (!values.length) return rows;

    for (const chunk of chunks(values)) {
        const result = await input.supabase.from("audit_logs").select("*").in("entity_id", chunk);
        if (result.error) throw new Error(result.error.message);
        rows.push(...((result.data ?? []) as AuditRow[]).filter((row) => row.company_id === input.companyId));
    }

    return rows;
}

export const getSpreadsheetData = cache(async function getSpreadsheetData(options: SpreadsheetDataOptions = {}): Promise<SpreadsheetData> {
    const context = await requirePermission("reports.view");
    const { supabase } = await getScopedSupabase();
    const companyId = context.activeCompany?.id;
    const activeOfficeId = context.activeOffice?.id;
    if (!companyId) return emptyData();
    const maxRowsPerSource = options.maxRowsPerSource ?? null;
    const includeAuditStatus = options.includeAuditStatus ?? true;

    const officeScoped = !context.canAccessAllOffices && activeOfficeId;

    function scopeOffice<T extends { eq: (column: string, value: string) => T }>(query: T) {
        return officeScoped ? query.eq("office_id", activeOfficeId) : query;
    }

    const [
        officesData,
        collectionsData,
        promisesData,
        expensesData,
        landlordPaymentsData,
        attendanceData,
        dailyReportsData,
        vacatedDebtsData,
        landlordDeductionsData,
        categoriesData,
    ] = await Promise.all([
        fetchAllRows<OfficeRow>(supabase.from("offices").select("*").eq("company_id", companyId).order("office_name")),
        fetchAllRows<CollectionRow>(scopeOffice(supabase.from("collections").select("*").eq("company_id", companyId).order("paid_at", { ascending: false, nullsFirst: false })), maxRowsPerSource),
        fetchAllRows<PromiseRow>(scopeOffice(supabase.from("promises").select("*").eq("company_id", companyId).order("created_at", { ascending: false })), maxRowsPerSource),
        fetchAllRows<ExpenseRow>(scopeOffice(supabase.from("expenses").select("*").eq("company_id", companyId).order("expense_date", { ascending: false, nullsFirst: false })), maxRowsPerSource),
        fetchAllRows<LandlordPaymentRow>(scopeOffice(supabase.from("landlord_payments").select("*").eq("company_id", companyId).order("paid_at", { ascending: false, nullsFirst: false })), maxRowsPerSource),
        fetchAllRows<AttendanceEventRow>(scopeOffice(supabase.from("attendance_events").select("*").eq("company_id", companyId).order("event_time", { ascending: false })), maxRowsPerSource),
        fetchAllRows<OfficeDailyReportRow>(scopeOffice((supabase as unknown as { from: (table: string) => ReturnType<typeof supabase.from> }).from("office_daily_reports").select("*").eq("company_id", companyId).order("report_date", { ascending: false })), maxRowsPerSource),
        fetchAllRows<VacatedTenantDebtRow>(scopeOffice((supabase as unknown as { from: (table: string) => ReturnType<typeof supabase.from> }).from("vacated_tenant_debts").select("*").eq("company_id", companyId).order("created_at", { ascending: false })), maxRowsPerSource),
        fetchAllRows<LandlordDebtDeductionRow>(scopeOffice((supabase as unknown as { from: (table: string) => ReturnType<typeof supabase.from> }).from("landlord_debt_deductions").select("*").eq("company_id", companyId).order("created_at", { ascending: false })), maxRowsPerSource),
        fetchAllRows<ExpenseCategoryRow>(supabase.from("expense_categories").select("*").or(`company_id.eq.${companyId},company_id.is.null`)),
    ]);

    const offices = filterOffices(officesData, context.offices.map((office) => office.id), context.canAccessAllOffices);
    const officeIds = new Set(offices.map((office) => office.id));
    const collections = filterByOffice(collectionsData, officeIds, context.canAccessAllOffices);
    const promises = filterByOffice(promisesData, officeIds, context.canAccessAllOffices);
    const expenses = filterByOffice(expensesData, officeIds, context.canAccessAllOffices);
    const landlordPayments = filterByOffice(landlordPaymentsData, officeIds, context.canAccessAllOffices);
    const attendance = filterByOffice(attendanceData, officeIds, context.canAccessAllOffices);
    const dailyReports = filterByOffice(dailyReportsData, officeIds, context.canAccessAllOffices);
    const vacatedDebts = filterByOffice(vacatedDebtsData, officeIds, context.canAccessAllOffices);
    const landlordDeductions = filterByOffice(landlordDeductionsData, officeIds, context.canAccessAllOffices);

    const tenantIds = new Set<string>();
    const roomIds = new Set<string>();
    const propertyIds = new Set<string>();
    const landlordIds = new Set<string>();
    const employeeIds = new Set<string>();
    const userIds = new Set<string>();
    const entityIds = new Set<string>();

    for (const collection of collections) {
        addId(tenantIds, collection.tenant_id);
        addId(roomIds, collection.room_id);
        addId(propertyIds, collection.property_id);
        addIds(userIds, [collection.recorded_by, collection.collector_id]);
        addId(entityIds, collection.id);
    }
    for (const promise of promises) {
        addId(tenantIds, promise.tenant_id);
        addId(roomIds, promise.room_id);
        addId(userIds, promise.created_by);
        addId(entityIds, promise.id);
    }
    for (const expense of expenses) {
        addId(propertyIds, expense.property_id);
        addIds(userIds, [expense.entered_by, expense.submitted_by]);
        addId(entityIds, expense.id);
    }
    for (const payment of landlordPayments) {
        addId(landlordIds, payment.landlord_id);
        addId(userIds, payment.created_by);
        addId(entityIds, payment.id);
    }
    for (const event of attendance) {
        addId(employeeIds, event.employee_id);
        addId(userIds, event.user_id);
        addId(entityIds, event.id);
    }
    for (const report of dailyReports) {
        addId(userIds, report.submitted_by);
        addId(entityIds, report.id);
    }
    for (const debt of vacatedDebts) {
        addIds(userIds, [debt.created_by]);
        addIds(tenantIds, [debt.tenant_id]);
        addIds(roomIds, [debt.room_id]);
        addIds(propertyIds, [debt.property_id]);
        addIds(landlordIds, [debt.landlord_id]);
        addId(entityIds, debt.id);
    }
    for (const deduction of landlordDeductions) {
        addIds(userIds, [deduction.created_by]);
        addIds(tenantIds, [deduction.tenant_id]);
        addIds(roomIds, [deduction.room_id]);
        addIds(propertyIds, [deduction.property_id]);
        addIds(landlordIds, [deduction.landlord_id]);
        addId(entityIds, deduction.id);
    }

    const supabaseById = supabase as unknown as IdLookupClient;
    const [tenantsData, landlordsData, usersData, employeesData, auditsData] = await Promise.all([
        fetchRowsByIds<TenantRow>({ supabase: supabaseById, table: "tenants", ids: tenantIds }),
        fetchRowsByIds<LandlordRow>({ supabase: supabaseById, table: "landlords", ids: landlordIds }),
        fetchRowsByIds<UserRow>({ supabase: supabaseById, table: "users", ids: userIds }),
        fetchRowsByIds<EmployeeRow>({ supabase: supabaseById, table: "employees", ids: employeeIds }),
        includeAuditStatus ? fetchAuditsByEntityIds({ supabase: supabaseById, companyId, ids: entityIds }) : Promise.resolve([] as AuditRow[]),
    ]);

    for (const tenant of tenantsData) {
        addId(roomIds, tenant.room_id);
        addId(propertyIds, tenant.property_id);
    }

    const roomsData = await fetchRowsByIds<RoomRow>({ supabase: supabaseById, table: "rooms", ids: roomIds });
    for (const room of roomsData) addId(propertyIds, room.property_id);
    const propertiesData = await fetchRowsByIds<PropertyRow>({ supabase: supabaseById, table: "properties", ids: propertyIds });

    const tenantById = new Map(tenantsData.map((tenant) => [tenant.id, tenant]));
    const roomById = new Map(roomsData.map((room) => [room.id, room]));
    const propertyById = new Map(propertiesData.map((property) => [property.id, property]));
    const landlordById = new Map(landlordsData.map((landlord) => [landlord.id, landlord]));
    const userById = new Map(usersData.map((user) => [user.id, user]));
    const employeeById = new Map(employeesData.map((employee) => [employee.id, employee]));
    const officeById = new Map(offices.map((office) => [office.id, office]));
    const categoryById = new Map(categoriesData.map((category) => [category.id, category]));
    const auditsByEntity = new Map<string, AuditRow[]>();
    for (const audit of auditsData) {
        if (!audit.entity_id) continue;
        auditsByEntity.set(audit.entity_id, [...(auditsByEntity.get(audit.entity_id) ?? []), audit]);
    }

    const latestPromiseByTenant = new Map<string, PromiseRow>();
    for (const promise of promises) {
        if (promise.tenant_id && !latestPromiseByTenant.has(promise.tenant_id)) latestPromiseByTenant.set(promise.tenant_id, promise);
    }

    const rows: SpreadsheetRow[] = [
        ...collections.map((collection) => collectionRow(collection, {
            tenantById,
            roomById,
            propertyById,
            userById,
            officeById,
            auditsByEntity,
            latestPromiseByTenant,
        })),
        ...promises.map((promise) => promiseRow(promise, { tenantById, roomById, propertyById, userById, officeById, auditsByEntity })),
        ...expenses.map((expense) => expenseRow(expense, { propertyById, officeById, userById, categoryById, auditsByEntity })),
        ...landlordPayments.map((payment) => landlordPaymentRow(payment, { landlordById, officeById, userById, auditsByEntity })),
        ...attendance.map((event) => attendanceRow(event, { employeeById, officeById, userById, auditsByEntity })),
        ...dailyReports.map((report) => dailyReportRow(report, { officeById, userById, auditsByEntity })),
        ...vacatedDebts.map((debt) => vacatedDebtRow(debt, { tenantById, roomById, propertyById, landlordById, officeById, userById, auditsByEntity })),
        ...landlordDeductions.map((deduction) => landlordDeductionRow(deduction, { tenantById, roomById, propertyById, landlordById, officeById, userById, auditsByEntity })),
    ].sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime());

    return {
        company: context.activeCompany,
        activeOffice: context.activeOffice,
        canAccessAllOffices: context.canAccessAllOffices,
        loadedAt: new Date().toISOString(),
        error: null,
        rows,
        sourceCounts: {
            collections: collections.length,
            promises: promises.length,
            expenses: expenses.length,
            landlordPayments: landlordPayments.length,
            attendance: attendance.length,
            dailyReports: dailyReports.length,
            vacatedDebts: vacatedDebts.length,
            landlordDeductions: landlordDeductions.length,
        },
        offices,
        collectors: [...new Map(rows.filter((row) => row.createdBy && row.createdBy !== "Unassigned").map((row) => [row.createdBy, { id: row.createdBy, name: row.createdBy }])).values()],
        properties: [...new Map(rows.filter((row) => row.property && row.property !== "Unassigned").map((row) => [row.property, { id: row.property, name: row.property }])).values()],
        summary: {
            collections: rows.reduce((total, row) => total + row.amountPaid, 0),
            promises: rows.reduce((total, row) => total + row.promiseAmount, 0),
            expenses: rows.reduce((total, row) => total + row.expenses, 0),
            landlordPayments: rows.reduce((total, row) => total + row.paidLandlords, 0),
            attendance: rows.filter((row) => row.source === "attendance").length,
            dailyReports: rows.filter((row) => row.source === "daily_report").length,
            vacatedDebts: rows.filter((row) => row.source === "vacated_debt").reduce((total, row) => total + row.balanceAfter, 0),
            landlordDeductions: rows.filter((row) => row.source === "landlord_deduction").reduce((total, row) => total + row.settlementAmount, 0),
            balanceAfter: rows.reduce((total, row) => total + row.balanceAfter, 0),
        },
    };
});

function filterOffices(offices: OfficeRow[], accessibleOfficeIds: string[], all: boolean) {
    const allowed = new Set(accessibleOfficeIds);
    return all ? offices : offices.filter((office) => allowed.has(office.id));
}

function filterByOffice<T extends { office_id: string | null }>(rows: T[], officeIds: Set<string>, all: boolean) {
    return all ? rows : rows.filter((row) => row.office_id && officeIds.has(row.office_id));
}

function person(userById: Map<string, UserRow>, id: string | null | undefined) {
    if (!id) return "Unassigned";
    return userById.get(id)?.full_name ?? "Unassigned";
}

function officeName(officeById: Map<string, OfficeRow>, id: string | null | undefined) {
    if (!id) return "Company";
    const office = officeById.get(id);
    return office?.office_name ?? office?.name ?? "Office";
}

function tenantBundle(input: { tenant?: TenantRow | null; room?: RoomRow | null; property?: PropertyRow | null }) {
    return {
        tenantName: input.tenant?.full_name ?? "Unassigned",
        phone: input.tenant?.phone ?? "",
        room: input.room?.room_number ?? "Unassigned",
        property: input.property?.property_name ?? input.property?.name ?? "Unassigned",
    };
}

function collectionRow(collection: CollectionRow, lookup: {
    tenantById: Map<string, TenantRow>;
    roomById: Map<string, RoomRow>;
    propertyById: Map<string, PropertyRow>;
    userById: Map<string, UserRow>;
    officeById: Map<string, OfficeRow>;
    auditsByEntity: Map<string, AuditRow[]>;
    latestPromiseByTenant: Map<string, PromiseRow>;
}): SpreadsheetRow {
    const tenant = collection.tenant_id ? lookup.tenantById.get(collection.tenant_id) : null;
    const room = collection.room_id ? lookup.roomById.get(collection.room_id) : tenant?.room_id ? lookup.roomById.get(tenant.room_id) : null;
    const property = collection.property_id ? lookup.propertyById.get(collection.property_id) : room?.property_id ? lookup.propertyById.get(room.property_id) : null;
    const promise = collection.tenant_id ? lookup.latestPromiseByTenant.get(collection.tenant_id) : null;
    const paid = amount(collection.amount_paid ?? collection.amount);
    const after = amount(collection.balance);
    const bundle = tenantBundle({ tenant, room, property });
    return {
        id: `collection-${collection.id}`,
        source: "collection",
        date: rowDate(collection.paid_at ?? collection.created_at),
        officeId: collection.office_id,
        officeName: officeName(lookup.officeById, collection.office_id),
        tenantName: bundle.tenantName,
        phone: bundle.phone,
        property: bundle.property,
        room: bundle.room,
        amountPaid: paid,
        balanceBefore: after + paid,
        balanceAfter: after,
        promiseAmount: amount(promise?.promised_amount ?? promise?.amount),
        promiseDate: promise?.promised_date ?? promise?.promise_date ?? null,
        promiseStatus: promise?.status ?? "",
        collectedBy: person(lookup.userById, collection.recorded_by ?? collection.collector_id),
        paymentMethod: collection.payment_method ?? "",
        collectionReference: collection.reference_number ?? collection.collection_number ?? "",
        transactionType: collection.type ?? collection.status ?? "collection",
        expenses: 0,
        expenseCategory: "",
        paidLandlords: 0,
        landlordName: "",
        settlementAmount: 0,
        notes: collection.notes ?? "",
        dateTime: dateValue(collection.paid_at ?? collection.created_at),
        createdAt: dateValue(collection.created_at),
        updatedAt: dateValue(collection.updated_at ?? collection.created_at),
        createdBy: person(lookup.userById, collection.recorded_by ?? collection.collector_id),
        auditStatus: auditStatus(lookup.auditsByEntity, collection.id),
    };
}

function promiseRow(promise: PromiseRow, lookup: {
    tenantById: Map<string, TenantRow>;
    roomById: Map<string, RoomRow>;
    propertyById: Map<string, PropertyRow>;
    userById: Map<string, UserRow>;
    officeById: Map<string, OfficeRow>;
    auditsByEntity: Map<string, AuditRow[]>;
}): SpreadsheetRow {
    const tenant = promise.tenant_id ? lookup.tenantById.get(promise.tenant_id) : null;
    const room = promise.room_id ? lookup.roomById.get(promise.room_id) : tenant?.room_id ? lookup.roomById.get(tenant.room_id) : null;
    const property = room?.property_id ? lookup.propertyById.get(room.property_id) : tenant?.property_id ? lookup.propertyById.get(tenant.property_id) : null;
    const bundle = tenantBundle({ tenant, room, property });
    return {
        id: `promise-${promise.id}`,
        source: "promise",
        date: rowDate(promise.created_at),
        officeId: promise.office_id,
        officeName: officeName(lookup.officeById, promise.office_id),
        tenantName: bundle.tenantName,
        phone: bundle.phone,
        property: bundle.property,
        room: bundle.room,
        amountPaid: 0,
        balanceBefore: amount(tenant?.balance),
        balanceAfter: amount(tenant?.balance),
        promiseAmount: amount(promise.promised_amount ?? promise.amount),
        promiseDate: promise.promised_date ?? promise.promise_date,
        promiseStatus: promise.status ?? "",
        collectedBy: person(lookup.userById, promise.created_by),
        paymentMethod: "",
        collectionReference: "",
        transactionType: promise.status ?? "promise",
        expenses: 0,
        expenseCategory: "",
        paidLandlords: 0,
        landlordName: "",
        settlementAmount: 0,
        notes: promise.notes ?? "",
        dateTime: dateValue(promise.created_at),
        createdAt: dateValue(promise.created_at),
        updatedAt: dateValue(promise.updated_at ?? promise.created_at),
        createdBy: person(lookup.userById, promise.created_by),
        auditStatus: auditStatus(lookup.auditsByEntity, promise.id),
    };
}

function expenseRow(expense: ExpenseRow, lookup: {
    propertyById: Map<string, PropertyRow>;
    officeById: Map<string, OfficeRow>;
    userById: Map<string, UserRow>;
    categoryById: Map<string, ExpenseCategoryRow>;
    auditsByEntity: Map<string, AuditRow[]>;
}): SpreadsheetRow {
    const property = expense.property_id ? lookup.propertyById.get(expense.property_id) : null;
    const category = expense.category_id ? lookup.categoryById.get(expense.category_id) : null;
    return {
        id: `expense-${expense.id}`,
        source: "expense",
        date: rowDate(expense.expense_date ?? expense.created_at),
        officeId: expense.office_id,
        officeName: officeName(lookup.officeById, expense.office_id),
        tenantName: "",
        phone: "",
        property: property?.property_name ?? property?.name ?? "Unassigned",
        room: "",
        amountPaid: 0,
        balanceBefore: 0,
        balanceAfter: 0,
        promiseAmount: 0,
        promiseDate: null,
        promiseStatus: "",
        collectedBy: "",
        paymentMethod: "",
        collectionReference: expense.expense_number ?? "",
        transactionType: "expense",
        expenses: amount(expense.amount),
        expenseCategory: category?.name ?? expense.category ?? expense.item ?? "Expense",
        paidLandlords: 0,
        landlordName: "",
        settlementAmount: 0,
        notes: expense.description ?? expense.vendor ?? "",
        dateTime: dateValue(expense.expense_date ?? expense.created_at),
        createdAt: dateValue(expense.created_at),
        updatedAt: dateValue(expense.updated_at ?? expense.created_at),
        createdBy: person(lookup.userById, expense.entered_by ?? expense.submitted_by),
        auditStatus: auditStatus(lookup.auditsByEntity, expense.id),
    };
}

function landlordPaymentRow(payment: LandlordPaymentRow, lookup: {
    landlordById: Map<string, LandlordRow>;
    officeById: Map<string, OfficeRow>;
    userById: Map<string, UserRow>;
    auditsByEntity: Map<string, AuditRow[]>;
}): SpreadsheetRow {
    const landlord = payment.landlord_id ? lookup.landlordById.get(payment.landlord_id) : null;
    return {
        id: `landlord-${payment.id}`,
        source: "landlord_payment",
        date: rowDate(payment.paid_at ?? payment.created_at),
        officeId: payment.office_id,
        officeName: officeName(lookup.officeById, payment.office_id),
        tenantName: "",
        phone: "",
        property: "",
        room: "",
        amountPaid: 0,
        balanceBefore: 0,
        balanceAfter: 0,
        promiseAmount: 0,
        promiseDate: null,
        promiseStatus: "",
        collectedBy: "",
        paymentMethod: payment.payment_method ?? "",
        collectionReference: payment.payout_reference ?? "",
        transactionType: payment.status ?? "landlord_payment",
        expenses: 0,
        expenseCategory: "",
        paidLandlords: amount(payment.amount),
        landlordName: landlord?.full_name ?? "Landlord",
        settlementAmount: amount(payment.amount),
        notes: "",
        dateTime: dateValue(payment.paid_at ?? payment.created_at),
        createdAt: dateValue(payment.created_at),
        updatedAt: dateValue(payment.updated_at ?? payment.created_at),
        createdBy: person(lookup.userById, payment.created_by),
        auditStatus: auditStatus(lookup.auditsByEntity, payment.id),
    };
}

function attendanceRow(event: AttendanceEventRow, lookup: {
    employeeById: Map<string, EmployeeRow>;
    officeById: Map<string, OfficeRow>;
    userById: Map<string, UserRow>;
    auditsByEntity: Map<string, AuditRow[]>;
}): SpreadsheetRow {
    const employee = lookup.employeeById.get(event.employee_id);
    return {
        id: `attendance-${event.id}`,
        source: "attendance",
        date: rowDate(event.event_time ?? event.created_at),
        officeId: event.office_id,
        officeName: officeName(lookup.officeById, event.office_id),
        tenantName: "",
        phone: employee?.phone ?? "",
        property: "",
        room: "",
        amountPaid: 0,
        balanceBefore: 0,
        balanceAfter: 0,
        promiseAmount: 0,
        promiseDate: null,
        promiseStatus: "",
        collectedBy: employee?.full_name ?? person(lookup.userById, event.user_id),
        paymentMethod: "",
        collectionReference: event.id,
        transactionType: event.event_type ?? "attendance",
        expenses: 0,
        expenseCategory: "",
        paidLandlords: 0,
        landlordName: "",
        settlementAmount: 0,
        notes: `${event.status ?? "valid"}${event.source ? ` · ${event.source}` : ""}`,
        dateTime: dateValue(event.event_time ?? event.created_at),
        createdAt: dateValue(event.created_at ?? event.event_time),
        updatedAt: dateValue(event.created_at ?? event.event_time),
        createdBy: employee?.full_name ?? person(lookup.userById, event.user_id),
        auditStatus: auditStatus(lookup.auditsByEntity, event.id),
    };
}

function dailyReportRow(report: OfficeDailyReportRow, lookup: {
    officeById: Map<string, OfficeRow>;
    userById: Map<string, UserRow>;
    auditsByEntity: Map<string, AuditRow[]>;
}): SpreadsheetRow {
    return {
        id: `daily-report-${report.id}`,
        source: "daily_report",
        date: report.report_date,
        officeId: report.office_id,
        officeName: officeName(lookup.officeById, report.office_id),
        tenantName: "",
        phone: "",
        property: "",
        room: "",
        amountPaid: amount(report.total_collections),
        balanceBefore: 0,
        balanceAfter: 0,
        promiseAmount: 0,
        promiseDate: null,
        promiseStatus: `${report.broken_promises ?? 0} broken`,
        collectedBy: person(lookup.userById, report.submitted_by),
        paymentMethod: "",
        collectionReference: report.id,
        transactionType: report.status ?? "daily_report",
        expenses: amount(report.total_expenses),
        expenseCategory: "Daily office report",
        paidLandlords: amount(report.landlord_payments),
        landlordName: "",
        settlementAmount: amount(report.landlord_payments),
        notes: [
            `${report.vacant_rooms ?? 0} vacant rooms`,
            `${report.new_tenants ?? 0} new tenants`,
            report.challenges_faced,
            report.general_office_notes,
        ].filter(Boolean).join(" · "),
        dateTime: dateValue(report.submitted_at ?? report.created_at),
        createdAt: dateValue(report.created_at ?? report.submitted_at),
        updatedAt: dateValue(report.updated_at ?? report.submitted_at ?? report.created_at),
        createdBy: person(lookup.userById, report.submitted_by),
        auditStatus: auditStatus(lookup.auditsByEntity, report.id),
    };
}

function vacatedDebtRow(debt: VacatedTenantDebtRow, lookup: {
    tenantById: Map<string, TenantRow>;
    roomById: Map<string, RoomRow>;
    propertyById: Map<string, PropertyRow>;
    landlordById: Map<string, LandlordRow>;
    officeById: Map<string, OfficeRow>;
    userById: Map<string, UserRow>;
    auditsByEntity: Map<string, AuditRow[]>;
}): SpreadsheetRow {
    const tenant = debt.tenant_id ? lookup.tenantById.get(debt.tenant_id) : null;
    const room = debt.room_id ? lookup.roomById.get(debt.room_id) : null;
    const property = debt.property_id ? lookup.propertyById.get(debt.property_id) : null;
    const landlord = debt.landlord_id ? lookup.landlordById.get(debt.landlord_id) : null;
    return {
        id: `vacated-debt-${debt.id}`,
        source: "vacated_debt",
        date: rowDate(debt.created_at),
        officeId: debt.office_id,
        officeName: officeName(lookup.officeById, debt.office_id),
        tenantName: debt.tenant_name ?? tenant?.full_name ?? "Vacated tenant",
        phone: debt.tenant_phone ?? tenant?.phone ?? "",
        property: debt.property_name ?? property?.property_name ?? property?.name ?? "Unassigned",
        room: debt.room_number ?? room?.room_number ?? "Unassigned",
        amountPaid: 0,
        balanceBefore: amount(debt.original_amount),
        balanceAfter: amount(debt.remaining_amount),
        promiseAmount: 0,
        promiseDate: null,
        promiseStatus: debt.recovery_status ?? "pending",
        collectedBy: "",
        paymentMethod: "",
        collectionReference: debt.id,
        transactionType: "vacated_tenant_debt",
        expenses: 0,
        expenseCategory: "",
        paidLandlords: 0,
        landlordName: debt.landlord_name ?? landlord?.full_name ?? "Landlord",
        settlementAmount: amount(debt.recovered_amount),
        notes: debt.notes ?? "Vacated tenant debt frozen for landlord recovery.",
        dateTime: dateValue(debt.created_at),
        createdAt: dateValue(debt.created_at),
        updatedAt: dateValue(debt.updated_at ?? debt.created_at),
        createdBy: person(lookup.userById, debt.created_by),
        auditStatus: auditStatus(lookup.auditsByEntity, debt.id),
    };
}

function landlordDeductionRow(deduction: LandlordDebtDeductionRow, lookup: {
    tenantById: Map<string, TenantRow>;
    roomById: Map<string, RoomRow>;
    propertyById: Map<string, PropertyRow>;
    landlordById: Map<string, LandlordRow>;
    officeById: Map<string, OfficeRow>;
    userById: Map<string, UserRow>;
    auditsByEntity: Map<string, AuditRow[]>;
}): SpreadsheetRow {
    const tenant = deduction.tenant_id ? lookup.tenantById.get(deduction.tenant_id) : null;
    const room = deduction.room_id ? lookup.roomById.get(deduction.room_id) : null;
    const property = deduction.property_id ? lookup.propertyById.get(deduction.property_id) : null;
    const landlord = deduction.landlord_id ? lookup.landlordById.get(deduction.landlord_id) : null;
    return {
        id: `landlord-deduction-${deduction.id}`,
        source: "landlord_deduction",
        date: rowDate(deduction.created_at),
        officeId: deduction.office_id,
        officeName: officeName(lookup.officeById, deduction.office_id),
        tenantName: deduction.tenant_name ?? tenant?.full_name ?? "Vacated tenant",
        phone: tenant?.phone ?? "",
        property: deduction.property_name ?? property?.property_name ?? property?.name ?? "Unassigned",
        room: deduction.room_number ?? room?.room_number ?? "Unassigned",
        amountPaid: 0,
        balanceBefore: amount(deduction.amount),
        balanceAfter: Math.max(0, amount(deduction.amount) - amount(deduction.applied_amount)),
        promiseAmount: 0,
        promiseDate: null,
        promiseStatus: deduction.status ?? "pending",
        collectedBy: "",
        paymentMethod: "landlord deduction",
        collectionReference: deduction.id,
        transactionType: "landlord_debt_deduction",
        expenses: 0,
        expenseCategory: "",
        paidLandlords: 0,
        landlordName: deduction.landlord_name ?? landlord?.full_name ?? "Landlord",
        settlementAmount: amount(deduction.applied_amount),
        notes: deduction.notes ?? "Deduction from landlord payable for vacated tenant debt.",
        dateTime: dateValue(deduction.created_at),
        createdAt: dateValue(deduction.created_at),
        updatedAt: dateValue(deduction.updated_at ?? deduction.created_at),
        createdBy: person(lookup.userById, deduction.created_by),
        auditStatus: auditStatus(lookup.auditsByEntity, deduction.id),
    };
}

function emptyData(): SpreadsheetData {
    return {
        company: null,
        activeOffice: null,
        canAccessAllOffices: false,
        loadedAt: new Date().toISOString(),
        error: null,
        rows: [],
        sourceCounts: { collections: 0, promises: 0, expenses: 0, landlordPayments: 0, attendance: 0, dailyReports: 0, vacatedDebts: 0, landlordDeductions: 0 },
        offices: [],
        collectors: [],
        properties: [],
        summary: { collections: 0, promises: 0, expenses: 0, landlordPayments: 0, attendance: 0, dailyReports: 0, vacatedDebts: 0, landlordDeductions: 0, balanceAfter: 0 },
    };
}
