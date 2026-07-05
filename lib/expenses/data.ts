import { requirePermission } from "@/lib/auth/permissions";
import { getScopedSupabase } from "@/lib/auth/query";
import type {
    CashAccountRow,
    CollectionRow,
    EmployeeRow,
    ExpenseBalanceFilters,
    ExpenseBalanceReport,
    ExpenseCategoryRow,
    ExpenseItem,
    ExpenseKpis,
    ExpenseRow,
    ExpensesPageData,
    LandlordRow,
    PropertyRow,
    UserRow,
} from "./types";

function dayRange() {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function monthRange() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function dateOnly(value: string | null | undefined) {
    return value?.slice(0, 10) || "";
}

function monthBounds(monthKey: string | null | undefined) {
    const fallback = new Date().toISOString().slice(0, 7);
    const value = /^\d{4}-\d{2}$/.test(monthKey ?? "") ? String(monthKey) : fallback;
    const [year, month] = value.split("-").map(Number);
    const start = `${value}-01`;
    const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    return { start, end, month: value };
}

function resolveExpenseFilters(filters: ExpenseBalanceFilters = {}) {
    const today = new Date().toISOString().slice(0, 10);
    const currentMonth = today.slice(0, 7);
    const mode = filters.mode ?? "single_date";
    let startDate = filters.startDate || filters.singleDate || today;
    let endDate = filters.endDate || filters.singleDate || today;
    let singleMonth = filters.singleMonth || currentMonth;
    let startMonth = filters.startMonth || currentMonth;
    let endMonth = filters.endMonth || currentMonth;

    if (mode === "single_date") {
        startDate = filters.singleDate || today;
        endDate = startDate;
    }
    if (mode === "date_range") {
        startDate = filters.startDate || today;
        endDate = filters.endDate || startDate;
    }
    if (mode === "single_month") {
        const bounds = monthBounds(filters.singleMonth || currentMonth);
        singleMonth = bounds.month;
        startDate = bounds.start;
        endDate = bounds.end;
    }
    if (mode === "month_range") {
        const start = monthBounds(filters.startMonth || currentMonth);
        const end = monthBounds(filters.endMonth || start.month);
        startMonth = start.month;
        endMonth = end.month;
        startDate = start.start;
        endDate = end.end;
    }
    if (startDate > endDate) {
        [startDate, endDate] = [endDate, startDate];
    }

    return {
        mode,
        singleDate: filters.singleDate || today,
        startDate,
        endDate,
        singleMonth,
        startMonth,
        endMonth,
        officeId: filters.officeId ?? null,
    };
}

export async function getExpensesPageData(): Promise<ExpensesPageData> {
    const context = await requirePermission("expenses.read");
    const { supabase } = await getScopedSupabase();
    const companyId = context.activeCompany?.id;
    const officeId = context.activeOffice?.id;

    if (!companyId || (!context.isCompanyAdmin && !officeId)) return emptyData();
    const isAdmin = context.isCompanyAdmin && !context.isOfficeMode;
    const selectedOfficeId = isAdmin ? null : officeId ?? null;

    const [
        expensesResult,
        categoriesResult,
        propertiesResult,
        landlordsResult,
        collectionsResult,
        cashAccountsResult,
        usersResult,
        officesResult,
        roomsResult,
        employeesResult,
    ] = await Promise.all([
        (() => {
            let query = supabase
            .from("expenses")
            .select("*")
            .eq("company_id", companyId)
            .order("expense_date", { ascending: false, nullsFirst: false })
                .order("created_at", { ascending: false, nullsFirst: false });
            if (selectedOfficeId) query = query.eq("office_id", selectedOfficeId);
            return query.limit(500);
        })(),
        supabase
            .from("expense_categories")
            .select("*")
            .or(`company_id.eq.${companyId},company_id.is.null`)
            .eq("active", true)
            .order("name"),
        supabase
            .from("properties")
            .select("*")
            .eq("company_id", companyId)
            .neq("status", "archived")
            .order("property_name", { ascending: true, nullsFirst: false }),
        supabase.from("landlords").select("*").eq("company_id", companyId).neq("status", "archived").order("full_name"),
        (() => {
            let query = supabase.from("collections").select("*").eq("company_id", companyId);
            if (selectedOfficeId) query = query.eq("office_id", selectedOfficeId);
            return query;
        })(),
        (() => {
            let query = supabase.from("cash_accounts").select("*").eq("company_id", companyId).eq("status", "active");
            if (selectedOfficeId) query = query.eq("office_id", selectedOfficeId);
            return query;
        })(),
        supabase.from("users").select("*").eq("company_id", companyId).eq("status", "active"),
        supabase.from("offices").select("id, office_name, name").eq("company_id", companyId).order("office_name", { ascending: true, nullsFirst: false }),
        (() => {
            let query = supabase.from("rooms").select("id, landlord_id, office_id").eq("company_id", companyId).not("landlord_id", "is", null).not("status", "in", "(archived,inactive,deleted,removed)");
            if (selectedOfficeId) query = query.eq("office_id", selectedOfficeId);
            return query;
        })(),
        (() => {
            let query = supabase.from("employees").select("*").eq("company_id", companyId).neq("status", "terminated").order("full_name", { ascending: true, nullsFirst: false });
            if (selectedOfficeId) query = query.eq("office_id", selectedOfficeId);
            return query;
        })(),
    ]);

    for (const result of [
        expensesResult,
        categoriesResult,
        propertiesResult,
        landlordsResult,
        collectionsResult,
        cashAccountsResult,
        usersResult,
        officesResult,
        roomsResult,
        employeesResult,
    ]) {
        if (result.error) throw new Error(result.error.message);
    }

    const expenses = expensesResult.data ?? [];
    const categories = categoriesResult.data ?? [];
    const properties = propertiesResult.data ?? [];
    const landlords = landlordsResult.data ?? [];
    const collections = collectionsResult.data ?? [];
    const cashAccounts = cashAccountsResult.data ?? [];
    const users = usersResult.data ?? [];
    const offices = (officesResult.data ?? []).map((office) => ({
        id: office.id,
        name: office.office_name ?? office.name ?? "Office",
    }));
    const employees = (employeesResult.data ?? []) as EmployeeRow[];
    const officeById = new Map(offices.map((office) => [office.id, office.name]));
    const landlordOfficeById = new Map<string, string | null>();
    for (const room of (roomsResult.data ?? []) as Array<{ landlord_id: string | null; office_id: string | null }>) {
        if (room.landlord_id && !landlordOfficeById.has(room.landlord_id)) landlordOfficeById.set(room.landlord_id, room.office_id);
    }
    const visibleLandlordIds = new Set((roomsResult.data ?? []).map((room: { landlord_id: string | null }) => room.landlord_id).filter(Boolean));
    const landlordOptions = landlords
        .filter((landlord) => isAdmin || visibleLandlordIds.has(landlord.id))
        .map((landlord) => {
            const landlordOfficeId = landlordOfficeById.get(landlord.id) ?? selectedOfficeId ?? null;
            return {
                id: landlord.id,
                name: landlord.full_name ?? "Landlord",
                officeId: landlordOfficeId,
                officeName: landlordOfficeId ? officeById.get(landlordOfficeId) ?? "Office" : null,
            };
        });

    const items = hydrateExpenseItems(expenses, categories, properties, landlords, users);
    const landlordPaymentRequests = await getLandlordPaymentExpenseRequests({
        companyId,
        isAdmin,
        officeById,
        officeId: selectedOfficeId,
        landlordById: new Map(landlords.map((landlord) => [landlord.id, landlord.full_name ?? "Landlord"])),
        supabase,
    });
    const employeeExpenseRequests = await getEmployeeExpenseRequests({
        companyId,
        employeeById: new Map(employees.map((employee) => [employee.id, employee.full_name ?? "Employee"])),
        isAdmin,
        officeById,
        officeId: selectedOfficeId,
        supabase,
    });

    return {
        company: context.activeCompany,
        office: context.activeOffice,
        offices,
        categories,
        properties,
        landlords,
        landlordOptions,
        landlordPaymentRequests,
        employeeOptions: employees.map((employee) => ({
            id: employee.id,
            name: employee.full_name ?? "Employee",
            officeId: employee.office_id,
            officeName: employee.office_id ? officeById.get(employee.office_id) ?? "Office" : null,
            role: employee.role ?? employee.job_title ?? null,
        })),
        employeeExpenseRequests,
        cashAccounts,
        kpis: calculateKpis(expenses, properties, collections, cashAccounts),
        expenses: items,
    };
}

export async function getExpenseBalanceReportData(filters: ExpenseBalanceFilters = {}): Promise<ExpenseBalanceReport> {
    const context = await requirePermission("expenses.read");
    const { supabase } = await getScopedSupabase();
    const companyId = context.activeCompany?.id;
    const officeId = context.activeOffice?.id;
    const isAdmin = context.isCompanyAdmin && !context.isOfficeMode;
    const resolved = resolveExpenseFilters(filters);
    const generatedBy = context.profile?.full_name ?? context.profile?.email ?? "System";

    if (!companyId || (!isAdmin && !officeId)) {
        return {
            filters: resolved,
            generatedAt: new Date().toISOString(),
            generatedBy,
            isAdmin,
            officeName: "No office",
            totals: { totalCollections: 0, totalExpenses: 0, remainingBalance: 0, expenseRows: 0, paymentRows: 0 },
            expenses: [],
        };
    }

    const selectedOfficeId = isAdmin && resolved.officeId ? resolved.officeId : isAdmin ? null : officeId;
    let expenseQuery = supabase
        .from("expenses")
        .select("*")
        .eq("company_id", companyId)
        .gte("expense_date", resolved.startDate)
        .lte("expense_date", resolved.endDate)
        .order("expense_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true, nullsFirst: false })
        .order("id", { ascending: true });
    let collectionQuery = supabase
        .from("collections")
        .select("*")
        .eq("company_id", companyId)
        .gte("payment_date", resolved.startDate)
        .lte("payment_date", resolved.endDate)
        .order("payment_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true, nullsFirst: false })
        .order("id", { ascending: true });
    if (selectedOfficeId) {
        expenseQuery = expenseQuery.eq("office_id", selectedOfficeId);
        collectionQuery = collectionQuery.eq("office_id", selectedOfficeId);
    }

    const [expensesResult, collectionsResult, categoriesResult, propertiesResult, landlordsResult, usersResult, officesResult] = await Promise.all([
        expenseQuery,
        collectionQuery,
        supabase.from("expense_categories").select("*").or(`company_id.eq.${companyId},company_id.is.null`),
        supabase.from("properties").select("*").eq("company_id", companyId),
        supabase.from("landlords").select("*").eq("company_id", companyId),
        supabase.from("users").select("*").eq("company_id", companyId),
        supabase.from("offices").select("id, office_name, name").eq("company_id", companyId),
    ]);

    for (const result of [expensesResult, collectionsResult, categoriesResult, propertiesResult, landlordsResult, usersResult, officesResult]) {
        if (result.error) throw new Error(result.error.message);
    }

    const expenses = expensesResult.data ?? [];
    const collections = collectionsResult.data ?? [];
    const items = hydrateExpenseItems(expenses, categoriesResult.data ?? [], propertiesResult.data ?? [], landlordsResult.data ?? [], usersResult.data ?? []);
    const officeById = new Map((officesResult.data ?? []).map((office) => [office.id, office.office_name ?? office.name ?? "Office"]));
    const totalCollections = collections.reduce((total, collection) => total + Number(collection.amount_paid ?? collection.amount ?? 0), 0);
    const totalExpenses = sumExpenses(expenses);

    return {
        filters: resolved,
        generatedAt: new Date().toISOString(),
        generatedBy,
        isAdmin,
        officeName: selectedOfficeId ? officeById.get(selectedOfficeId) ?? "Selected office" : isAdmin ? "All offices" : context.activeOffice?.office_name ?? context.activeOffice?.name ?? "Office",
        totals: {
            totalCollections,
            totalExpenses,
            remainingBalance: totalCollections - totalExpenses,
            expenseRows: expenses.length,
            paymentRows: collections.length,
        },
        expenses: items.map((expense) => ({
            ...expense,
            officeName: expense.office_id ? officeById.get(expense.office_id) ?? null : null,
        }) as ExpenseItem),
    };
}

export async function getExpenseInActiveOffice(expenseId: string) {
    const context = await requirePermission("expenses.read");
    const { supabase } = await getScopedSupabase();
    if (!context.activeCompany?.id || !context.activeOffice?.id) throw new Error("Active company and office are required.");

    const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .eq("id", expenseId)
        .eq("company_id", context.activeCompany.id)
        .eq("office_id", context.activeOffice.id)
        .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw new Error("Expense not found in active office.");
    return data;
}

function hydrateExpenseItems(
    expenses: ExpenseRow[],
    categories: ExpenseCategoryRow[],
    properties: PropertyRow[],
    landlords: LandlordRow[],
    users: UserRow[],
): ExpenseItem[] {
    const categoryById = new Map(categories.map((category) => [category.id, category]));
    const propertyById = new Map(properties.map((property) => [property.id, property]));
    const landlordById = new Map(landlords.map((landlord) => [landlord.id, landlord]));
    const userById = new Map(users.map((user) => [user.id, user]));

    return expenses.map((expense) => {
        const property = expense.property_id ? propertyById.get(expense.property_id) ?? null : null;
        const landlord = property?.landlord_id ? landlordById.get(property.landlord_id) ?? null : null;
        const rejected = (expense.description ?? "").toLowerCase().includes("[rejected]");

        return {
            ...expense,
            categoryName: expense.category_id ? categoryById.get(expense.category_id)?.name ?? expense.category : expense.category,
            propertyName: property?.property_name ?? property?.name ?? null,
            landlordName: landlord?.full_name ?? null,
            submittedByName: expense.submitted_by ? userById.get(expense.submitted_by)?.full_name ?? null : null,
            approvalState: rejected ? "rejected" : expense.approved_at ? "approved" : "pending",
        };
    });
}

function calculateKpis(
    expenses: ExpenseRow[],
    properties: PropertyRow[],
    collections: CollectionRow[],
    cashAccounts: CashAccountRow[],
): ExpenseKpis {
    const today = dayRange();
    const month = monthRange();
    const totalExpenses = sumExpenses(expenses);
    const todayExpenses = sumExpenses(expenses.filter((expense) => expense.expense_date && expense.expense_date >= today.start && expense.expense_date <= today.end));
    const monthExpenses = sumExpenses(expenses.filter((expense) => expense.expense_date && expense.expense_date >= month.start && expense.expense_date <= month.end));
    const propertyIds = new Set(properties.map((property) => property.id));
    const propertyExpenses = sumExpenses(expenses.filter((expense) => expense.property_id && propertyIds.has(expense.property_id)));
    const collectionValue = collections.reduce((total, collection) => total + Number(collection.amount_paid ?? collection.amount ?? 0), 0);
    const netCashPosition = collectionValue - totalExpenses;

    return {
        totalExpenses,
        todayExpenses,
        monthExpenses,
        officeExpenses: totalExpenses,
        propertyExpenses,
        expenseRecoveryRate: totalExpenses ? Math.round((collectionValue / totalExpenses) * 100) : 0,
        netCashPosition: cashAccounts.length ? netCashPosition : netCashPosition,
    };
}

function sumExpenses(expenses: ExpenseRow[]) {
    return expenses.reduce((total, expense) => total + Number(expense.amount ?? 0), 0);
}

function emptyData(): ExpensesPageData {
    return {
        company: null,
        office: null,
        offices: [],
        categories: [],
        properties: [],
        landlords: [],
        landlordOptions: [],
        landlordPaymentRequests: [],
        employeeOptions: [],
        employeeExpenseRequests: [],
        cashAccounts: [],
        kpis: {
            totalExpenses: 0,
            todayExpenses: 0,
            monthExpenses: 0,
            officeExpenses: 0,
            propertyExpenses: 0,
            expenseRecoveryRate: 0,
            netCashPosition: 0,
        },
        expenses: [],
    };
}

async function getEmployeeExpenseRequests(input: {
    companyId: string;
    employeeById: Map<string, string>;
    isAdmin: boolean;
    officeById: Map<string, string>;
    officeId: string | null;
    supabase: { from: (table: string) => any };
}) {
    try {
        let query = input.supabase
            .from("employee_expense_requests")
            .select("*")
            .eq("company_id", input.companyId)
            .eq("active", true)
            .order("created_at", { ascending: false })
            .limit(100);
        if (!input.isAdmin && input.officeId) query = query.eq("office_id", input.officeId);
        const { data, error } = await query;
        if (error) {
            if (/relation .*employee_expense_requests|does not exist|schema cache/i.test(error.message ?? "")) return [];
            throw new Error(error.message);
        }
        return ((data ?? []) as Array<Record<string, unknown>>).map((request) => {
            const employeeId = String(request.employee_id ?? "");
            const officeId = String(request.office_id ?? "");
            return {
                id: String(request.id),
                employeeId,
                employeeName: input.employeeById.get(employeeId) ?? "Employee",
                officeId: officeId || null,
                officeName: input.officeById.get(officeId) ?? "Office",
                itemKey: String(request.requested_item_key ?? ""),
                itemName: String(request.requested_item_name ?? "Employee expense"),
                amount: Number(request.requested_amount ?? 0),
                allowedAmount: Number(request.allowed_amount ?? 0),
                alreadySpentAmount: Number(request.already_spent_amount ?? 0),
                remainingBefore: Number(request.remaining_allowance_before ?? 0),
                extraAmount: Number(request.extra_amount ?? 0),
                expenseDate: String(request.expense_date ?? ""),
                status: String(request.status ?? "pending"),
                note: typeof request.note === "string" ? request.note : null,
                createdAt: typeof request.created_at === "string" ? request.created_at : null,
                adminComment: typeof request.admin_comment === "string" ? request.admin_comment : null,
            };
        });
    } catch (error) {
        console.warn("Employee expense requests could not load:", error instanceof Error ? error.message : error);
        return [];
    }
}

async function getLandlordPaymentExpenseRequests(input: {
    companyId: string;
    isAdmin: boolean;
    officeById: Map<string, string>;
    officeId: string | null;
    landlordById: Map<string, string>;
    supabase: { from: (table: string) => any };
}) {
    try {
        let query = input.supabase
            .from("landlord_payment_expense_requests")
            .select("*")
            .eq("company_id", input.companyId)
            .order("created_at", { ascending: false })
            .limit(80);
        if (!input.isAdmin && input.officeId) query = query.eq("office_id", input.officeId);
        const { data, error } = await query;
        if (error) {
            if (/relation .*landlord_payment_expense_requests|does not exist/i.test(error.message ?? "")) return [];
            throw new Error(error.message);
        }
        return ((data ?? []) as Array<Record<string, unknown>>).map((request) => {
            const landlordId = String(request.landlord_id ?? "");
            const officeId = String(request.office_id ?? "");
            return {
                id: String(request.id),
                landlordId,
                landlordName: input.landlordById.get(landlordId) ?? "Landlord",
                officeId,
                officeName: input.officeById.get(officeId) ?? "Office",
                amount: Number(request.requested_amount ?? 0),
                normalPaymentAmount: Number(request.normal_payment_amount ?? request.requested_amount ?? 0),
                advanceAmount: Number(request.advance_amount ?? 0),
                currentNetPayable: Number(request.current_net_payable ?? 0),
                alreadyPaidAmount: Number(request.already_paid_amount ?? 0),
                outstandingAmount: Number(request.outstanding_amount ?? 0),
                flagReason: typeof request.flag_reason === "string" ? request.flag_reason : null,
                paymentDate: String(request.payment_date ?? ""),
                paymentMonth: typeof request.payment_month === "string" ? request.payment_month : null,
                paymentMethod: String(request.payment_method ?? "cash"),
                status: String(request.status ?? "pending"),
                notes: typeof request.notes === "string" ? request.notes : null,
                createdAt: typeof request.created_at === "string" ? request.created_at : null,
                adminComment: typeof request.admin_comment === "string" ? request.admin_comment : null,
            };
        });
    } catch (error) {
        console.warn("Landlord payment expense requests could not load:", error instanceof Error ? error.message : error);
        return [];
    }
}
