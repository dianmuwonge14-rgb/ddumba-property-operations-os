import { requirePermission } from "@/lib/auth/permissions";
import { getScopedSupabase } from "@/lib/auth/query";
import { collectionAmount, uniqueFinanciallyEffectiveCollections } from "@/lib/collections/validity";
import type {
    CashAccountRow,
    CollectionRow,
    EmployeeRow,
    ExpenseBalanceFilters,
    ExpenseBalanceReport,
    ExpenseChangeRequestItem,
    ExpenseCategoryRow,
    ExpenseItem,
    ExpenseKpis,
    ExpenseReportCollectionItem,
    ExpenseRow,
    ExpensesPageData,
    LandlordExpenseEditRequestItem,
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

function expenseStatus(expense: Record<string, unknown>) {
    return String(expense.status ?? (expense.approved_at ? "approved" : "pending")).toLowerCase();
}

function isApprovedExpense(expense: Record<string, unknown>) {
    return expenseStatus(expense) === "approved";
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

    if (mode === "all_dates") {
        startDate = "1900-01-01";
        endDate = "2999-12-31";
    }
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
        cashTransactionsResult,
        treasuryRequestsResult,
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
        (() => {
            let query = (supabase as unknown as { from: (table: string) => any })
                .from("cash_transactions")
                .select("id, company_id, office_id, cash_account_id, amount, transaction_type, direction, source_type, source_id, transaction_date, occurred_at, created_at, description, notes, payment_method, reference, recorded_by, status, metadata")
                .eq("company_id", companyId)
                .order("transaction_date", { ascending: false, nullsFirst: false })
                .order("created_at", { ascending: false, nullsFirst: false })
                .limit(1000);
            if (selectedOfficeId) query = query.eq("office_id", selectedOfficeId);
            return query;
        })(),
        (async () => {
            let query = (supabase as unknown as { from: (table: string) => any })
                .from("treasury_cash_requests")
                .select("*")
                .eq("company_id", companyId)
                .order("created_at", { ascending: false })
                .limit(200);
            if (selectedOfficeId) query = query.eq("office_id", selectedOfficeId);
            const result = await query;
            if (result.error && /does not exist|schema cache|Could not find/i.test(result.error.message ?? "")) return { data: [], error: null };
            return result;
        })(),
        supabase.from("users").select("*").eq("company_id", companyId).eq("status", "active"),
        supabase.from("offices").select("id, office_name, name").eq("company_id", companyId).ilike("status", "active").is("merged_into_office_id", null).order("office_name", { ascending: true, nullsFirst: false }),
        (() => {
            let query = supabase.from("rooms").select("id, landlord_id, office_id, status, monthly_rent").eq("company_id", companyId).not("landlord_id", "is", null).not("status", "in", "(archived,inactive,deleted,removed)");
            if (selectedOfficeId) query = query.eq("office_id", selectedOfficeId);
            return query;
        })(),
        supabase.from("employees").select("*").eq("company_id", companyId).neq("status", "terminated").order("full_name", { ascending: true, nullsFirst: false }),
    ]);

    for (const result of [
        expensesResult,
        categoriesResult,
        propertiesResult,
        landlordsResult,
        collectionsResult,
        cashAccountsResult,
        cashTransactionsResult,
        treasuryRequestsResult,
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
    const collections = uniqueFinanciallyEffectiveCollections((collectionsResult.data ?? []) as CollectionRow[]);
    const cashAccounts = cashAccountsResult.data ?? [];
    const cashTransactions = cashTransactionsResult.data ?? [];
    const treasuryRequests = (treasuryRequestsResult.data ?? []) as Array<Record<string, unknown>>;
    const users = usersResult.data ?? [];
    const offices = (officesResult.data ?? []).map((office) => ({
        id: office.id,
        name: office.office_name ?? office.name ?? "Office",
    }));
    const employees = (employeesResult.data ?? []) as EmployeeRow[];
    const officeById = new Map(offices.map((office) => [office.id, office.name]));
    const employeeById = new Map(employees.map((employee) => [employee.id, employee.full_name ?? "Employee"]));
    const userById = new Map(users.map((user) => [user.id, user.full_name ?? user.email ?? "User"]));
    const landlordOfficeById = new Map<string, string | null>();
    type LandlordRoomRow = { landlord_id: string | null; office_id: string | null; status?: string | null; monthly_rent?: number | string | null };
    const landlordPortfolioById = new Map<string, { portfolioValue: number; numberOfRooms: number; occupiedRooms: number; vacantRooms: number; vacatedWithDebt: number }>();
    for (const room of (roomsResult.data ?? []) as LandlordRoomRow[]) {
        if (room.landlord_id && !landlordOfficeById.has(room.landlord_id)) landlordOfficeById.set(room.landlord_id, room.office_id);
        if (!room.landlord_id) continue;
        const current = landlordPortfolioById.get(room.landlord_id) ?? { portfolioValue: 0, numberOfRooms: 0, occupiedRooms: 0, vacantRooms: 0, vacatedWithDebt: 0 };
        const status = String(room.status ?? "").toLowerCase();
        current.numberOfRooms += 1;
        current.portfolioValue += Number(room.monthly_rent ?? 0);
        if (status.includes("vacant")) current.vacantRooms += 1;
        else if (status.includes("vacated") || status.includes("debt")) current.vacatedWithDebt += 1;
        else current.occupiedRooms += 1;
        landlordPortfolioById.set(room.landlord_id, current);
    }
    const visibleLandlordIds = new Set((roomsResult.data ?? []).map((room: { landlord_id: string | null }) => room.landlord_id).filter(Boolean));
    const landlordOptions = landlords
        .filter((landlord) => isAdmin || visibleLandlordIds.has(landlord.id))
        .map((landlord) => {
            const landlordOfficeId = landlordOfficeById.get(landlord.id) ?? selectedOfficeId ?? null;
            const rawLandlord = landlord as LandlordRow & Record<string, unknown>;
            const portfolio = landlordPortfolioById.get(landlord.id) ?? { portfolioValue: 0, numberOfRooms: 0, occupiedRooms: 0, vacantRooms: 0, vacatedWithDebt: 0 };
            return {
                id: landlord.id,
                name: landlord.full_name ?? "Landlord",
                officeId: landlordOfficeId,
                officeName: landlordOfficeId ? officeById.get(landlordOfficeId) ?? "Office" : null,
                location: typeof rawLandlord.location === "string" ? rawLandlord.location : typeof rawLandlord.address === "string" ? rawLandlord.address : null,
                commissionType: typeof rawLandlord.commission_calculation_mode === "string" ? rawLandlord.commission_calculation_mode : typeof rawLandlord.commission_input_mode === "string" ? rawLandlord.commission_input_mode : null,
                commissionRate: Number.isFinite(Number(rawLandlord.commission_rate)) ? Number(rawLandlord.commission_rate) : null,
                ...portfolio,
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
        employeeById,
        isAdmin,
        officeById,
        officeId: selectedOfficeId,
        supabase,
    });
    const expenseChangeRequests = await getExpenseChangeRequests({
        companyId,
        expensesById: new Map(items.map((expense) => [expense.id, expense])),
        isAdmin,
        officeById,
        officeId: selectedOfficeId,
        supabase,
        userById: new Map(users.map((user) => [user.id, user.full_name ?? user.email ?? "User"])),
    });
    const landlordExpenseEditRequests = await getLandlordExpenseEditRequests({
        companyId,
        isAdmin,
        landlordById: new Map(landlords.map((landlord) => [landlord.id, landlord.full_name ?? "Landlord"])),
        officeById,
        officeId: selectedOfficeId,
        supabase,
        userById: new Map(users.map((user) => [user.id, user.full_name ?? user.email ?? "User"])),
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
            phone: employee.phone ?? null,
            email: employee.email ?? null,
            assignmentType: (employee as Record<string, unknown>).employee_assignment_type ? String((employee as Record<string, unknown>).employee_assignment_type) : null,
        })),
        expenseChangeRequests,
        landlordExpenseEditRequests,
        employeeExpenseRequests,
        banking: buildBankingSnapshot({
            cashAccounts,
            cashTransactions,
            collections,
            expenses,
            officeById,
            offices,
            treasuryRequests,
            userById,
        }),
        treasuryCashRequests: hydrateTreasuryCashRequests({
            officeById,
            requests: treasuryRequests,
            userById,
        }),
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
            collections: [],
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
    const collections = uniqueFinanciallyEffectiveCollections((collectionsResult.data ?? []) as CollectionRow[]);
    const items = hydrateExpenseItems(expenses, categoriesResult.data ?? [], propertiesResult.data ?? [], landlordsResult.data ?? [], usersResult.data ?? []);
    const officeById = new Map((officesResult.data ?? []).map((office) => [office.id, office.office_name ?? office.name ?? "Office"]));
    const totalCollections = collections.reduce((total, collection) => total + collectionAmount(collection), 0);
    const approvedExpenses = expenses.filter(isApprovedExpense);
    const totalExpenses = sumExpenses(approvedExpenses);
    const collectionItems = hydrateCollectionItems(collections, usersResult.data ?? [], officeById);

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
            expenseRows: approvedExpenses.length,
            paymentRows: collections.length,
        },
        expenses: items.map((expense) => ({
            ...expense,
            officeName: expense.office_id ? officeById.get(expense.office_id) ?? null : null,
        }) as ExpenseItem),
        collections: collectionItems,
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
        const rawExpense = expense as ExpenseRow & {
            employee_id?: string | null;
            payment_method?: string | null;
            status?: string | null;
        };
        const property = expense.property_id ? propertyById.get(expense.property_id) ?? null : null;
        const landlord = property?.landlord_id ? landlordById.get(property.landlord_id) ?? null : null;
        const status = expenseStatus(rawExpense);

        return {
            ...expense,
            categoryName: expense.category_id ? categoryById.get(expense.category_id)?.name ?? expense.category : expense.category,
            employeeId: rawExpense.employee_id ?? null,
            employeeName: null,
            propertyName: property?.property_name ?? property?.name ?? null,
            landlordName: landlord?.full_name ?? null,
            paymentMethod: rawExpense.payment_method ?? null,
            submittedByName: expense.submitted_by ? userById.get(expense.submitted_by)?.full_name ?? null : null,
            approvalState: status === "approved" ? "approved" : status === "rejected" ? "rejected" : "pending",
            status: rawExpense.status ?? null,
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
    const approvedExpenses = expenses.filter(isApprovedExpense);
    const totalExpenses = sumExpenses(approvedExpenses);
    const todayExpenses = sumExpenses(approvedExpenses.filter((expense) => expense.expense_date && expense.expense_date >= today.start && expense.expense_date <= today.end));
    const monthExpenses = sumExpenses(approvedExpenses.filter((expense) => expense.expense_date && expense.expense_date >= month.start && expense.expense_date <= month.end));
    const propertyIds = new Set(properties.map((property) => property.id));
    const propertyExpenses = sumExpenses(approvedExpenses.filter((expense) => expense.property_id && propertyIds.has(expense.property_id)));
    const validCollections = uniqueFinanciallyEffectiveCollections(collections);
    const collectionValue = validCollections.reduce((total, collection) => total + collectionAmount(collection), 0);
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

function dateKey(value: unknown) {
    return typeof value === "string" ? value.slice(0, 10) : "";
}

function isApprovedLedger(row: Record<string, unknown>) {
    return ["approved", "completed", "posted"].includes(String(row.status ?? "approved").toLowerCase());
}

function signedCashAmount(row: Record<string, unknown>) {
    const amount = Number(row.amount ?? 0);
    const type = String(row.transaction_type ?? "").toLowerCase();
    const direction = String(row.direction ?? "").toLowerCase();
    return direction === "outflow" || type === "outflow" || type === "transfer_out" ? -amount : amount;
}

function metadataBankAccount(value: unknown) {
    if (!value || typeof value !== "object") return null;
    const metadata = value as Record<string, unknown>;
    return typeof metadata.bank_account_name === "string" ? metadata.bank_account_name : null;
}

function buildBankingSnapshot(input: {
    cashAccounts: Array<Record<string, unknown>>;
    cashTransactions: Array<Record<string, unknown>>;
    collections: CollectionRow[];
    expenses: ExpenseRow[];
    officeById: Map<string, string>;
    offices: Array<{ id: string; name: string }>;
    treasuryRequests: Array<Record<string, unknown>>;
    userById: Map<string, string>;
}): ExpensesPageData["banking"] {
    const today = new Date().toISOString().slice(0, 10);
    const accountById = new Map(input.cashAccounts.map((account) => [String(account.id), account]));
    const activeTransactions = input.cashTransactions.filter(isApprovedLedger);
    const officeCashTransactions = activeTransactions.filter((row) => accountById.get(String(row.cash_account_id))?.account_type === "office_cash");
    const bankTransactions = activeTransactions.filter((row) => accountById.get(String(row.cash_account_id))?.account_type === "bank");
    const adminCashTransactions = activeTransactions.filter((row) => accountById.get(String(row.cash_account_id))?.account_type === "hq_cash");
    const bankOutflows = officeCashTransactions.filter((row) => row.source_type === "bank_deposit" && String(row.transaction_type).toLowerCase() === "outflow");
    const adminHandovers = officeCashTransactions.filter((row) => ["office_to_admin_transfer", "admin_float"].includes(String(row.source_type ?? "")) && String(row.transaction_type).toLowerCase() === "outflow");
    const approvedExpenses = input.expenses.filter(isApprovedExpense);

    const summaries = input.offices.map((office) => {
        const officeId = office.id;
        const currentPhysicalOfficeCash = officeCashTransactions
            .filter((row) => row.office_id === officeId)
            .reduce((total, row) => total + signedCashAmount(row), 0);
        const collectionsToday = input.collections
            .filter((collection) => (collection as CollectionRow & Record<string, unknown>).office_id === officeId && dateKey((collection as CollectionRow & Record<string, unknown>).payment_date ?? (collection as CollectionRow & Record<string, unknown>).paid_at ?? collection.created_at) === today)
            .reduce((total, collection) => total + collectionAmount(collection), 0);
        const approvedExpensesToday = approvedExpenses
            .filter((expense) => expense.office_id === officeId && dateKey(expense.expense_date ?? expense.created_at) === today)
            .reduce((total, expense) => total + Number(expense.amount ?? 0), 0);
        const alreadyBankedToday = bankOutflows
            .filter((row) => row.office_id === officeId && dateKey(row.transaction_date ?? row.occurred_at ?? row.created_at) === today)
            .reduce((total, row) => total + Number(row.amount ?? 0), 0);
        const cashHandedToAdminToday = adminHandovers
            .filter((row) => row.office_id === officeId && dateKey(row.transaction_date ?? row.occurred_at ?? row.created_at) === today)
            .reduce((total, row) => total + Number(row.amount ?? 0), 0);
        const pendingBanking = input.treasuryRequests
            .filter((request) => request.office_id === officeId && request.request_type === "banking" && request.status === "pending")
            .reduce((total, request) => total + Number(request.amount ?? 0), 0);
        const pendingCashHandover = input.treasuryRequests
            .filter((request) => request.office_id === officeId && request.request_type === "cash_handover_admin" && request.status === "pending")
            .reduce((total, request) => total + Number(request.amount ?? 0), 0);
        return {
            officeId,
            officeName: office.name,
            currentPhysicalOfficeCash: Math.max(0, currentPhysicalOfficeCash),
            collectionsToday,
            approvedExpensesToday,
            alreadyBankedToday,
            cashHandedToAdminToday,
            pendingBanking,
            pendingCashHandover,
            eligibleAmountAvailableToBank: Math.max(0, currentPhysicalOfficeCash),
        };
    });

    const records = bankOutflows.map((row) => ({
        id: String(row.source_id ?? row.id),
        bankingDate: dateKey(row.transaction_date ?? row.occurred_at ?? row.created_at),
        officeId: typeof row.office_id === "string" ? row.office_id : null,
        officeName: typeof row.office_id === "string" ? input.officeById.get(row.office_id) ?? "Office" : "Office",
        amount: Number(row.amount ?? 0),
        method: typeof row.payment_method === "string" ? row.payment_method : "Bank",
        bankAccount: metadataBankAccount(row.metadata) ?? "Company Bank",
        reference: typeof row.reference === "string" ? row.reference : typeof row.source_id === "string" ? row.source_id : null,
        bankedBy: typeof row.recorded_by === "string" ? input.userById.get(row.recorded_by) ?? "User" : "User",
        status: String(row.status ?? "approved"),
        createdAt: typeof row.created_at === "string" ? row.created_at : null,
        notes: typeof row.notes === "string" ? row.notes : typeof row.description === "string" ? row.description : null,
    }));

    return {
        records,
        summaries,
        totals: {
            currentMoneyAtBank: bankTransactions.reduce((total, row) => total + signedCashAmount(row), 0),
            currentCashHeldByAdmin: adminCashTransactions.reduce((total, row) => total + signedCashAmount(row), 0),
        },
    };
}

function hydrateTreasuryCashRequests(input: {
    officeById: Map<string, string>;
    requests: Array<Record<string, unknown>>;
    userById: Map<string, string>;
}): ExpensesPageData["treasuryCashRequests"] {
    return input.requests.map((request) => {
        const officeId = String(request.office_id ?? "");
        const submittedBy = typeof request.submitted_by === "string" ? request.submitted_by : "";
        const approvedBy = typeof request.approved_by === "string" ? request.approved_by : "";
        return {
            id: String(request.id ?? ""),
            requestType: request.request_type === "cash_handover_admin" ? "cash_handover_admin" : "banking",
            officeId,
            officeName: input.officeById.get(officeId) ?? "Office",
            amount: Number(request.amount ?? 0),
            businessDate: dateKey(request.business_date ?? request.created_at),
            method: typeof request.method === "string" ? request.method : null,
            bankAccountName: typeof request.bank_account_name === "string" ? request.bank_account_name : null,
            reference: typeof request.reference === "string" ? request.reference : null,
            reason: String(request.reason ?? ""),
            notes: typeof request.notes === "string" ? request.notes : null,
            handedOverBy: typeof request.handed_over_by === "string" ? request.handed_over_by : null,
            receivedByAdminName: typeof request.received_by_admin_name === "string" ? request.received_by_admin_name : null,
            status: String(request.status ?? "pending"),
            submittedByName: input.userById.get(submittedBy) ?? "Office user",
            approvedByName: approvedBy ? input.userById.get(approvedBy) ?? "Admin" : null,
            createdAt: typeof request.created_at === "string" ? request.created_at : null,
            adminComment: typeof request.admin_comment === "string" ? request.admin_comment : null,
        };
    });
}

function hydrateCollectionItems(
    collections: CollectionRow[],
    users: UserRow[],
    officeById: Map<string, string>,
): ExpenseReportCollectionItem[] {
    const userById = new Map(users.map((user) => [user.id, user.full_name ?? user.email ?? "User"]));
    return collections.map((collection) => {
        const raw = collection as CollectionRow & Record<string, unknown>;
        const officeId = typeof raw.office_id === "string" ? raw.office_id : null;
        const collectionType = String(raw.type ?? raw.collection_type ?? "").toUpperCase();
        const isAdminCashTransfer = collectionType === "ADMIN_CASH_TRANSFER";
        const recordedBy = typeof raw.recorded_by === "string"
            ? raw.recorded_by
            : typeof raw.submitted_by === "string"
                ? raw.submitted_by
                : typeof raw.created_by === "string"
                    ? raw.created_by
                    : "";
        return {
            ...collection,
            amountValue: collectionAmount(raw),
            officeName: officeId ? officeById.get(officeId) ?? "Office" : null,
            paymentDate: typeof raw.payment_date === "string" ? raw.payment_date : typeof raw.paid_at === "string" ? raw.paid_at.slice(0, 10) : typeof raw.created_at === "string" ? raw.created_at.slice(0, 10) : null,
            paymentMethod: isAdminCashTransfer ? "Admin Cash Transfer" : typeof raw.payment_method === "string" ? raw.payment_method : null,
            receiptNumber: typeof raw.receipt_number === "string" ? raw.receipt_number : typeof raw.receipt_no === "string" ? raw.receipt_no : null,
            recordedByName: userById.get(recordedBy) ?? null,
            roomLabel: isAdminCashTransfer ? "Office cash" : typeof raw.room_number === "string" ? raw.room_number : typeof raw.room_label === "string" ? raw.room_label : null,
            tenantName: isAdminCashTransfer ? "Cash from Admin" : typeof raw.tenant_name === "string" ? raw.tenant_name : null,
        };
    });
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
        expenseChangeRequests: [],
        landlordExpenseEditRequests: [],
        employeeExpenseRequests: [],
        banking: {
            records: [],
            summaries: [],
            totals: {
                currentMoneyAtBank: 0,
                currentCashHeldByAdmin: 0,
            },
        },
        treasuryCashRequests: [],
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

async function getExpenseChangeRequests(input: {
    companyId: string;
    expensesById: Map<string, ExpenseItem>;
    isAdmin: boolean;
    officeById: Map<string, string>;
    officeId: string | null;
    supabase: { from: (table: string) => any };
    userById: Map<string, string>;
}): Promise<ExpenseChangeRequestItem[]> {
    try {
        let query = input.supabase
            .from("expense_change_requests")
            .select("*")
            .eq("company_id", input.companyId)
            .order("created_at", { ascending: false })
            .limit(150);
        if (!input.isAdmin && input.officeId) query = query.eq("office_id", input.officeId);
        const { data, error } = await query;
        if (error) {
            if (/relation .*expense_change_requests|does not exist|schema cache/i.test(error.message ?? "")) return [];
            throw new Error(error.message);
        }
        return ((data ?? []) as Array<Record<string, unknown>>).map((request) => {
            const expenseId = String(request.expense_id ?? "");
            const officeId = typeof request.office_id === "string" ? request.office_id : null;
            const expense = input.expensesById.get(expenseId);
            const requestedBy = typeof request.requested_by === "string" ? request.requested_by : "";
            const originalValue = isRecord(request.original_value) ? request.original_value : {};
            const requestedValue = isRecord(request.requested_value) ? request.requested_value : {};
            return {
                id: String(request.id),
                expenseId,
                officeId,
                officeName: officeId ? input.officeById.get(officeId) ?? "Office" : "Office",
                itemName: expense?.item ?? expense?.expense_number ?? String(request.change_type ?? "Expense"),
                amount: Number(expense?.amount ?? originalValue.amount ?? 0),
                changeType: String(request.change_type ?? "general_edit"),
                originalValue,
                requestedValue,
                reason: String(request.reason ?? ""),
                status: String(request.status ?? "pending"),
                requestedByName: input.userById.get(requestedBy) ?? "User",
                requestedByAccountType: typeof request.requested_by_account_type === "string" ? request.requested_by_account_type : null,
                createdAt: typeof request.created_at === "string" ? request.created_at : null,
                adminComment: typeof request.admin_comment === "string" ? request.admin_comment : null,
            };
        });
    } catch (error) {
        console.warn("Expense change requests could not load:", error instanceof Error ? error.message : error);
        return [];
    }
}

async function getLandlordExpenseEditRequests(input: {
    companyId: string;
    isAdmin: boolean;
    landlordById: Map<string, string>;
    officeById: Map<string, string>;
    officeId: string | null;
    supabase: { from: (table: string) => any };
    userById: Map<string, string>;
}): Promise<LandlordExpenseEditRequestItem[]> {
    try {
        let query = input.supabase
            .from("landlord_expense_edit_requests")
            .select("*")
            .eq("company_id", input.companyId)
            .order("created_at", { ascending: false })
            .limit(100);
        if (!input.isAdmin && input.officeId) query = query.eq("office_id", input.officeId);
        const { data, error } = await query;
        if (error) {
            if (/relation .*landlord_expense_edit_requests|does not exist|schema cache/i.test(error.message ?? "")) return [];
            throw new Error(error.message);
        }
        return ((data ?? []) as Array<Record<string, unknown>>).map((request) => {
            const landlordId = String(request.landlord_id ?? "");
            const officeId = typeof request.office_id === "string" ? request.office_id : null;
            const requestedBy = String(request.requested_by ?? "");
            return {
                id: String(request.id),
                landlordId,
                landlordName: input.landlordById.get(landlordId) ?? "Landlord",
                officeId,
                officeName: officeId ? input.officeById.get(officeId) ?? "Office" : "Office",
                requestType: String(request.request_type ?? "landlord_edit"),
                oldValue: isRecord(request.old_value) ? request.old_value : {},
                requestedValue: isRecord(request.requested_value) ? request.requested_value : {},
                effectiveDate: typeof request.effective_date === "string" ? request.effective_date : null,
                effectiveMonth: typeof request.effective_month === "string" ? request.effective_month : null,
                reason: String(request.reason ?? ""),
                status: String(request.status ?? "pending"),
                requestedByName: input.userById.get(requestedBy) ?? "User",
                createdAt: typeof request.created_at === "string" ? request.created_at : null,
                adminComment: typeof request.admin_comment === "string" ? request.admin_comment : null,
            };
        });
    } catch (error) {
        console.warn("Landlord edit requests could not load:", error instanceof Error ? error.message : error);
        return [];
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
                advanceRecoveryAmount: Number(request.advance_recovery_amount ?? 0),
                cashPaymentAmount: Number(request.cash_payment_amount ?? request.normal_payment_amount ?? request.requested_amount ?? 0),
                remainingAdvanceBalance: Number(request.advance_balance_after ?? 0),
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
