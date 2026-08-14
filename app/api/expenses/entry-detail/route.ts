import { NextRequest, NextResponse } from "next/server";
import { isCompanyOperationalManager, requirePermission } from "@/lib/auth/permissions";
import { getLiveLandlordMonthlyNetPayable } from "@/lib/landlord-payables/live-net";
import { normalizeSettlementTiming, summarizeLandlordPayables } from "@/lib/landlord-payables/payment-allocation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function amount(value: unknown) {
    const numberValue = Number(value ?? 0);
    return Number.isFinite(numberValue) ? numberValue : 0;
}

function monthStart(value: string) {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : new Date().toISOString().slice(0, 10);
    return `${date.slice(0, 7)}-01`;
}

function activeStatus(row: Record<string, unknown>) {
    return !["rejected", "cancelled", "canceled", "reversed", "voided", "deleted", "archived"].includes(String(row.status ?? "").toLowerCase());
}

function activePaymentStatus(row: Record<string, unknown>) {
    return !["pending", "requested", "rejected", "cancelled", "canceled", "reversed", "voided", "deleted", "archived", "failed"].includes(String(row.status ?? "").toLowerCase());
}

function activeTenantStatus(row: Record<string, unknown>) {
    const status = String(row.status ?? "active").toLowerCase();
    return !["vacated", "vacant", "inactive", "archived", "deleted", "removed", "moved_out", "moved out"].some((value) => status.includes(value));
}

function normalizedRole(value: unknown) {
    return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isAllRounderEmployee(row: Record<string, unknown>) {
    return [row.employee_assignment_type, row.role, row.job_title].some((value) => normalizedRole(value) === "allrounder");
}

function isFieldCollectorEmployee(row: Record<string, unknown>) {
    return [row.employee_assignment_type, row.role, row.job_title, row.position].some((value) => {
        const normalized = normalizedRole(value);
        return normalized === "fieldcollector" || normalized === "collector" || normalized === "allrounder";
    });
}

function isManagerEmployee(row: Record<string, unknown>) {
    return [row.role, row.job_title, row.position, row.account_type].some((value) => normalizedRole(value).includes("manager"));
}

function isEligibleEmployee(row: Record<string, unknown>, activeOfficeId: string | null, canSeeAll: boolean) {
    if (String(row.status ?? "active").toLowerCase() !== "active") return false;
    if (canSeeAll) return true;
    const employeeOfficeId = typeof row.office_id === "string" ? row.office_id : null;
    return Boolean(activeOfficeId && employeeOfficeId === activeOfficeId) || isAllRounderEmployee(row);
}

function isEligibleSalaryEmployee(row: Record<string, unknown>, activeOfficeId: string | null, canSeeAll: boolean) {
    if (String(row.status ?? "active").toLowerCase() !== "active") return false;
    if (canSeeAll) return true;
    const employeeOfficeId = typeof row.office_id === "string" ? row.office_id : null;
    return Boolean(activeOfficeId && employeeOfficeId === activeOfficeId) || isFieldCollectorEmployee(row) || isManagerEmployee(row);
}

function salaryPaymentDay(value: unknown) {
    const parsed = Math.trunc(amount(value));
    return Math.min(31, Math.max(1, parsed || 1));
}

function salaryDueDate(monthKey: string, day: number) {
    const [year, month] = monthKey.slice(0, 7).split("-").map(Number);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const safeDay = Math.min(lastDay, Math.max(1, day));
    return `${monthKey.slice(0, 7)}-${String(safeDay).padStart(2, "0")}`;
}

function salaryPeriodLabel(monthKey: string) {
    return new Date(`${monthKey.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString("en-UG", { month: "long", year: "numeric", timeZone: "UTC" });
}

function currentSettlementMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function monthLabel(value: string | null | undefined) {
    if (!value) return null;
    return new Date(`${value.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString("en-UG", { month: "long", year: "numeric", timeZone: "UTC" });
}

function landlordAdvanceRemaining(row: Record<string, unknown>) {
    return Math.max(
        amount(row.remaining_total_balance),
        amount(row.remaining_balance),
        amount(row.advance_amount) - amount(row.deducted_amount),
        0,
    );
}

function activeLandlordAdvance(row: Record<string, unknown>) {
    const status = String(row.status ?? "pending").toLowerCase();
    const lifecycle = String(row.lifecycle_status ?? "active").toLowerCase();
    return !["fully_deducted", "cleared", "cancelled", "rejected", "voided"].includes(status)
        && !["cleared", "cancelled", "rejected", "voided"].includes(lifecycle);
}

export async function GET(request: NextRequest) {
    try {
        const context = await requirePermission("expenses.read");
        const supabase = await createSupabaseServerClient();
        const db = supabase as unknown as { from: (table: string) => any };
        const companyId = context.activeCompany?.id;
        const activeOfficeId = context.activeOffice?.id ?? null;
        if (!companyId) throw new Error("Active company is required.");
        const type = request.nextUrl.searchParams.get("type");
        const id = request.nextUrl.searchParams.get("id") ?? "";
        const expenseDate = request.nextUrl.searchParams.get("expenseDate") ?? new Date().toISOString().slice(0, 10);
        const canSeeAll = context.isCompanyAdmin || isCompanyOperationalManager(context);
        const requestedOfficeId = request.nextUrl.searchParams.get("officeId")?.trim() || null;
        const selectedOfficeId = canSeeAll && requestedOfficeId && context.offices.some((office) => office.id === requestedOfficeId)
            ? requestedOfficeId
            : activeOfficeId;
        const landlordOfficeFilterId = canSeeAll ? null : selectedOfficeId;
        if (!id) throw new Error("Select a record.");

        if (type === "employee") {
            const admin = createSupabaseAdminClient() as unknown as { from: (table: string) => any };
            const employeeQuery = admin
                .from("employees")
                .select("id, full_name, office_id, role, job_title, phone, email, status, employee_assignment_type, offices:office_id(id, office_name, name)")
                .eq("company_id", companyId)
                .eq("id", id);
            const [employeeResult, ledgerResult, expenseResult, requestResult] = await Promise.all([
                employeeQuery.maybeSingle(),
                admin
                    .from("employee_lunch_ledger")
                    .select("entry_type, ledger_date, earned_amount, taken_amount, active")
                    .eq("company_id", companyId)
                    .eq("employee_id", id)
                    .eq("month_key", monthStart(expenseDate))
                    .eq("active", true),
                admin
                    .from("employee_expenses")
                    .select("amount, expense_date, status, active, category")
                    .eq("company_id", companyId)
                    .eq("employee_id", id)
                    .eq("month_key", monthStart(expenseDate))
                    .eq("category", "lunch")
                    .eq("active", true),
                admin
                    .from("employee_expense_requests")
                    .select("requested_amount, extra_amount, expense_date, status, requested_item_key, active")
                    .eq("company_id", companyId)
                    .eq("employee_id", id)
                    .eq("month_key", monthStart(expenseDate))
                    .eq("requested_item_key", "lunch")
                    .eq("active", true),
            ]);
            if (employeeResult.error) throw new Error(employeeResult.error.message);
            if (ledgerResult.error && !/does not exist|schema cache/i.test(ledgerResult.error.message ?? "")) throw new Error(ledgerResult.error.message);
            if (expenseResult.error && !/does not exist|schema cache/i.test(expenseResult.error.message ?? "")) throw new Error(expenseResult.error.message);
            if (requestResult.error && !/does not exist|schema cache/i.test(requestResult.error.message ?? "")) throw new Error(requestResult.error.message);
            const employee = employeeResult.data as Record<string, unknown> | null;
            if (!employee) throw new Error("Employee not found.");
            if (!isEligibleEmployee(employee, selectedOfficeId, canSeeAll)) {
                throw new Error("Only active employees in your office or company-wide All Rounders can be selected for authorised employee expenses.");
            }
            const office = employee.offices as Record<string, unknown> | null;
            const dailyAllocation = 7000;
            const ledgerRows = (ledgerResult.data ?? []) as Array<Record<string, unknown>>;
            const expenseRows = ((expenseResult.data ?? []) as Array<Record<string, unknown>>).filter(activeStatus);
            const pendingRows = ((requestResult.data ?? []) as Array<Record<string, unknown>>).filter((row) => String(row.status ?? "").toLowerCase() === "pending");
            const earnedBefore = ledgerRows
                .filter((row) => String(row.entry_type) === "earned" && String(row.ledger_date).slice(0, 10) < expenseDate)
                .reduce((total, row) => total + amount(row.earned_amount), 0);
            const takenBefore = ledgerRows
                .filter((row) => String(row.entry_type) === "taken" && String(row.ledger_date).slice(0, 10) < expenseDate)
                .reduce((total, row) => total + amount(row.taken_amount), 0);
            const previousUnusedLunchBalance = Math.max(0, earnedBefore - takenBefore);
            const ledgerTakenToday = ledgerRows
                .filter((row) => String(row.entry_type) === "taken" && String(row.ledger_date).slice(0, 10) === expenseDate)
                .reduce((total, row) => total + amount(row.taken_amount), 0);
            const approvedExpenseToday = expenseRows
                .filter((row) => String(row.expense_date).slice(0, 10) === expenseDate && String(row.status ?? "").toLowerCase() === "approved")
                .reduce((total, row) => total + amount(row.amount), 0);
            const pendingToday = pendingRows
                .filter((row) => String(row.expense_date).slice(0, 10) === expenseDate)
                .reduce((total, row) => total + amount(row.extra_amount ?? row.requested_amount), 0);
            const lunchUsedToday = Math.max(ledgerTakenToday, approvedExpenseToday);
            const totalBeforeTodayUse = previousUnusedLunchBalance + dailyAllocation;
            const remainingLunchBalance = Math.max(0, totalBeforeTodayUse - lunchUsedToday - pendingToday);
            const lunchDates = [...expenseRows, ...ledgerRows]
                .map((row) => String(row.expense_date ?? row.ledger_date ?? "").slice(0, 10))
                .filter(Boolean)
                .sort();
            const lastLunchExpenseDate = lunchDates.length ? lunchDates[lunchDates.length - 1] : null;
            return NextResponse.json({
                detail: {
                    id: String(employee.id),
                    name: String(employee.full_name ?? "Employee"),
                    officeId: typeof employee.office_id === "string" ? employee.office_id : null,
                    officeName: String(office?.office_name ?? office?.name ?? "Office"),
                    employeeHomeOfficeId: typeof employee.office_id === "string" ? employee.office_id : null,
                    employeeHomeOfficeName: String(office?.office_name ?? office?.name ?? "Office"),
                    submittingOfficeId: selectedOfficeId,
                    submittingOfficeName: String(context.offices.find((office) => office.id === selectedOfficeId)?.office_name ?? context.offices.find((office) => office.id === selectedOfficeId)?.name ?? context.activeOffice?.office_name ?? context.activeOffice?.name ?? "Submitting office"),
                    position: String(employee.role ?? employee.job_title ?? ""),
                    dailyLunchAllocation: dailyAllocation,
                    previousUnusedLunchBalance,
                    lunchAvailableToday: remainingLunchBalance,
                    totalUsableLunch: remainingLunchBalance,
                    lunchUsedToday,
                    remainingLunchBalance,
                    lastLunchExpenseDate,
                    approvalStatus: pendingToday > 0 ? "Pending approval" : lunchUsedToday > 0 ? "Approved" : "Available",
                },
            }, { headers: { "Cache-Control": "no-store" } });
        }

        if (type === "salary_employee") {
            const admin = createSupabaseAdminClient() as unknown as { from: (table: string) => any };
            const salaryMonth = monthStart(request.nextUrl.searchParams.get("salaryMonth") ?? expenseDate);
            const [employeeResult, profileRows, officeRows, bonusRows, expenseRows, advanceRows, fineRows, existingPayments, pendingRows] = await Promise.all([
                admin
                    .from("employees")
                    .select("id, full_name, office_id, role, job_title, phone, email, status, employee_assignment_type, basic_salary, salary_payment_day, salary_receiving_day, offices:office_id(id, office_name, name)")
                    .eq("company_id", companyId)
                    .eq("id", id)
                    .maybeSingle(),
                admin.from("payroll_profiles").select("*").eq("company_id", companyId).eq("employee_id", id).limit(1),
                admin.from("offices").select("id, office_name, name").eq("company_id", companyId),
                admin.from("employee_bonuses").select("amount").eq("company_id", companyId).eq("employee_id", id).eq("month_key", salaryMonth).eq("active", true),
                admin.from("employee_expenses").select("amount").eq("company_id", companyId).eq("employee_id", id).eq("month_key", salaryMonth).eq("active", true).eq("approved_for_payroll", true),
                admin.from("employee_advances").select("amount,remaining_balance,status,active").eq("company_id", companyId).eq("employee_id", id).eq("month_key", salaryMonth).eq("active", true),
                admin.from("employee_fines").select("amount").eq("company_id", companyId).eq("employee_id", id).eq("month_key", salaryMonth).eq("active", true),
                admin.from("employee_salary_payments").select("paid_amount").eq("company_id", companyId).eq("employee_id", id).eq("month_key", salaryMonth),
                admin.from("employee_salary_payment_requests").select("id,requested_amount,status,requesting_office_id").eq("company_id", companyId).eq("employee_id", id).eq("month_key", salaryMonth).eq("active", true),
            ]);
            if (employeeResult.error) throw new Error(employeeResult.error.message);
            for (const result of [profileRows, officeRows, bonusRows, expenseRows, advanceRows, fineRows, existingPayments]) {
                if (result.error && !/does not exist|schema cache/i.test(result.error.message ?? "")) throw new Error(result.error.message);
            }
            if (pendingRows.error && !/does not exist|schema cache/i.test(pendingRows.error.message ?? "")) throw new Error(pendingRows.error.message);
            const employee = employeeResult.data as Record<string, unknown> | null;
            if (!employee) throw new Error("Employee not found.");
            if (!isEligibleSalaryEmployee(employee, selectedOfficeId, canSeeAll)) {
                throw new Error("This employee is not available for salary payment from the selected office.");
            }
            const profile = ((profileRows.data ?? []) as Array<Record<string, unknown>>)[0] ?? null;
            const officeById = new Map<string, Record<string, unknown>>();
            for (const officeRow of (officeRows.data ?? []) as Array<Record<string, unknown>>) {
                if (officeRow.id) officeById.set(String(officeRow.id), officeRow);
            }
            const employeeOffice = employee.offices as Record<string, unknown> | null;
            const payrollOfficeId = typeof profile?.office_id === "string" ? profile.office_id : typeof employee.office_id === "string" ? employee.office_id : null;
            const office = payrollOfficeId ? officeById.get(payrollOfficeId) ?? employeeOffice : employeeOffice;
            const bonuses = ((bonusRows.data ?? []) as Array<Record<string, unknown>>).reduce((total, row) => total + amount(row.amount), 0);
            const expenses = ((expenseRows.data ?? []) as Array<Record<string, unknown>>).reduce((total, row) => total + amount(row.amount), 0);
            const advanceOutstanding = ((advanceRows.data ?? []) as Array<Record<string, unknown>>)
                .filter((row) => ["approved", "active", "partially_deducted"].includes(String(row.status ?? "approved").toLowerCase()))
                .reduce((total, row) => total + Math.max(amount(row.remaining_balance), amount(row.amount)), 0);
            const fines = ((fineRows.data ?? []) as Array<Record<string, unknown>>).reduce((total, row) => total + amount(row.amount), 0);
            const monthlySalary = amount(profile?.base_salary ?? employee.basic_salary);
            const deductions = expenses + advanceOutstanding + fines;
            const netSalary = Math.max(0, monthlySalary + bonuses - deductions);
            const alreadyPaid = ((existingPayments.data ?? []) as Array<Record<string, unknown>>).reduce((total, row) => total + amount(row.paid_amount), 0);
            const remainingSalary = Math.max(0, netSalary - alreadyPaid);
            const pendingRequest = ((pendingRows.data ?? []) as Array<Record<string, unknown>>).find((row) => String(row.status ?? "").toLowerCase() === "pending") ?? null;
            const dueDate = salaryDueDate(salaryMonth, salaryPaymentDay(profile?.salary_payment_day ?? employee.salary_payment_day ?? employee.salary_receiving_day ?? 1));
            const status = netSalary <= 0
                ? "Salary has not yet been configured"
                : pendingRequest
                    ? "Pending Admin Approval"
                    : remainingSalary <= 0
                        ? "Paid"
                        : alreadyPaid > 0
                            ? "Partially Paid"
                            : "Upcoming";
            return NextResponse.json({
                detail: {
                    id: String(employee.id),
                    name: String(employee.full_name ?? "Employee"),
                    position: String(employee.role ?? employee.job_title ?? "Employee"),
                    officeId: typeof employee.office_id === "string" ? employee.office_id : null,
                    officeName: String(office?.office_name ?? office?.name ?? "Company Payroll"),
                    payrollOfficeId,
                    payrollOfficeName: String(office?.office_name ?? office?.name ?? "Company Payroll"),
                    submittingOfficeId: selectedOfficeId,
                    submittingOfficeName: String(context.offices.find((office) => office.id === selectedOfficeId)?.office_name ?? context.offices.find((office) => office.id === selectedOfficeId)?.name ?? context.activeOffice?.office_name ?? context.activeOffice?.name ?? "Submitting office"),
                    salaryMonth,
                    salaryMonthLabel: salaryPeriodLabel(salaryMonth),
                    salaryDueDate: dueDate,
                    monthlySalary: netSalary,
                    baseSalary: monthlySalary,
                    alreadyPaid,
                    remainingSalary,
                    salaryAdvanceOutstanding: advanceOutstanding,
                    previousSalaryAdvanceRecovery: advanceOutstanding,
                    eligibleAmountNow: remainingSalary,
                    paymentStatus: status,
                    pendingSalaryRequestId: pendingRequest?.id ? String(pendingRequest.id) : null,
                },
            }, { headers: { "Cache-Control": "no-store" } });
        }

        if (type === "landlord") {
            const admin = createSupabaseAdminClient() as unknown as { from: (table: string) => any };
            const [landlordResult, roomsResult, propertyLinkResult, payablesResult, advancesResult, paymentsResult, adjustmentResult, propertyResult, searchIndexResult] = await Promise.all([
                admin
                    .from("landlords")
                    .select("*")
                    .eq("company_id", companyId)
                    .eq("id", id)
                    .maybeSingle(),
                (() => {
                    let query = admin
                        .from("rooms")
                        .select("id, office_id, property_id, landlord_id, room_number, status, monthly_rent, outstanding_balance, updated_at, offices:office_id(id, office_name, name), properties:property_id(id, landlord_id, property_name, name, location)")
                        .eq("company_id", companyId)
                        .not("status", "in", "(archived,inactive,deleted,removed)");
                    if (landlordOfficeFilterId) query = query.eq("office_id", landlordOfficeFilterId);
                    return query;
                })(),
                admin
                    .from("property_landlords")
                    .select("property_id, landlord_id")
                    .eq("company_id", companyId)
                    .eq("landlord_id", id),
                admin
                    .from("landlord_monthly_payables")
                    .select("*")
                    .eq("company_id", companyId)
                    .eq("landlord_id", id)
                    .neq("status", "archived")
                    .order("settlement_month", { ascending: false, nullsFirst: false })
                    .limit(36),
                admin
                    .from("landlord_advances")
                    .select("*")
                    .eq("company_id", companyId)
                    .eq("landlord_id", id),
                admin
                    .from("landlord_payments")
                    .select("*")
                    .eq("company_id", companyId)
                    .eq("landlord_id", id)
                    .order("paid_at", { ascending: false, nullsFirst: false })
                    .order("created_at", { ascending: false, nullsFirst: false })
                    .limit(12),
                admin
                    .from("landlord_balance_adjustments")
                    .select("*")
                    .eq("company_id", companyId)
                    .eq("landlord_id", id)
                    .eq("status", "approved")
                    .order("effective_date", { ascending: false, nullsFirst: false })
                    .order("created_at", { ascending: false, nullsFirst: false })
                    .limit(1),
                admin
                    .from("properties")
                    .select("id, landlord_id, property_name, name, location")
                    .eq("company_id", companyId),
                admin
                    .from("landlord_search_index")
                    .select("office_id, office_name, room_count, rent_roll, room_numbers_text, location_text")
                    .eq("company_id", companyId)
                    .eq("landlord_id", id)
                    .maybeSingle(),
            ]);
            if (landlordResult.error) throw new Error(landlordResult.error.message);
            if (roomsResult.error) throw new Error(roomsResult.error.message);
            if (propertyLinkResult.error && !/does not exist|schema cache/i.test(propertyLinkResult.error.message ?? "")) throw new Error(propertyLinkResult.error.message);
            if (payablesResult.error && !/does not exist|schema cache/i.test(payablesResult.error.message ?? "")) throw new Error(payablesResult.error.message);
            if (advancesResult.error && !/does not exist|schema cache/i.test(advancesResult.error.message ?? "")) throw new Error(advancesResult.error.message);
            if (paymentsResult.error && !/does not exist|schema cache/i.test(paymentsResult.error.message ?? "")) throw new Error(paymentsResult.error.message);
            if (adjustmentResult.error && !/does not exist|schema cache/i.test(adjustmentResult.error.message ?? "")) throw new Error(adjustmentResult.error.message);
            if (propertyResult.error && !/does not exist|schema cache/i.test(propertyResult.error.message ?? "")) throw new Error(propertyResult.error.message);
            if (searchIndexResult.error && !/does not exist|schema cache/i.test(searchIndexResult.error.message ?? "")) throw new Error(searchIndexResult.error.message);
            const landlord = landlordResult.data as Record<string, unknown> | null;
            if (!landlord) throw new Error("Landlord not found.");
            const propertiesById = new Map(((propertyResult.data ?? []) as Array<Record<string, unknown>>).map((property) => [String(property.id), property]));
            const linkedPropertyIds = new Set(
                ((propertyLinkResult.data ?? []) as Array<Record<string, unknown>>)
                    .map((row) => String(row.property_id ?? ""))
                    .filter(Boolean),
            );
            for (const property of propertiesById.values()) {
                if (String(property.landlord_id ?? "") === id) linkedPropertyIds.add(String(property.id));
            }
            const rooms = ((roomsResult.data ?? []) as Array<Record<string, unknown>>).filter((room) => {
                if (String(room.landlord_id ?? "") === id) return true;
                const propertyId = String(room.property_id ?? "");
                const property = room.properties as Record<string, unknown> | null;
                return linkedPropertyIds.has(propertyId) || String(property?.landlord_id ?? "") === id;
            });
            if (!canSeeAll && !rooms.length) throw new Error("This landlord is not attached to the active office.");
            const roomIds = rooms.map((room) => String(room.id ?? "")).filter(Boolean);
            const [tenantsResult, exitsResult, statusHistoryResult] = await Promise.all([
                roomIds.length
                    ? admin
                        .from("tenants")
                        .select("id, full_name, room_id, previous_room_id, status, balance, updated_at")
                        .eq("company_id", companyId)
                        .or(`room_id.in.(${roomIds.join(",")}),previous_room_id.in.(${roomIds.join(",")})`)
                        .order("updated_at", { ascending: false, nullsFirst: false })
                        .limit(5000)
                    : { data: [], error: null },
                roomIds.length
                    ? admin
                        .from("tenant_exit_records")
                        .select("room_id,vacate_date,created_at")
                        .eq("company_id", companyId)
                        .in("room_id", roomIds)
                        .order("vacate_date", { ascending: false, nullsFirst: false })
                        .order("created_at", { ascending: false, nullsFirst: false })
                    : { data: [], error: null },
                roomIds.length
                    ? admin
                        .from("room_status_history")
                        .select("room_id,new_status,created_at")
                        .eq("company_id", companyId)
                        .in("room_id", roomIds)
                        .order("created_at", { ascending: false, nullsFirst: false })
                        .limit(5000)
                    : { data: [], error: null },
            ]);
            if (tenantsResult.error && !/does not exist|schema cache/i.test(tenantsResult.error.message ?? "")) throw new Error(tenantsResult.error.message);
            if (exitsResult.error && !/does not exist|schema cache/i.test(exitsResult.error.message ?? "")) throw new Error(exitsResult.error.message);
            if (statusHistoryResult.error && !/does not exist|schema cache/i.test(statusHistoryResult.error.message ?? "")) throw new Error(statusHistoryResult.error.message);
            const tenants = (tenantsResult.data ?? []) as Array<Record<string, unknown>>;
            const activeTenantByRoom = new Map<string, Record<string, unknown>>();
            const previousTenantByRoom = new Map<string, Record<string, unknown>>();
            for (const tenant of tenants) {
                const roomId = String(tenant.room_id ?? "");
                if (roomId && activeTenantStatus(tenant) && !activeTenantByRoom.has(roomId)) activeTenantByRoom.set(roomId, tenant);
                const previousRoomId = String(tenant.previous_room_id ?? tenant.room_id ?? "");
                if (previousRoomId && !activeTenantStatus(tenant) && !previousTenantByRoom.has(previousRoomId)) previousTenantByRoom.set(previousRoomId, tenant);
            }
            const latestVacateDateByRoom = new Map<string, string>();
            for (const exit of (exitsResult.data ?? []) as Array<Record<string, unknown>>) {
                const roomId = String(exit.room_id ?? "");
                if (roomId && !latestVacateDateByRoom.has(roomId)) latestVacateDateByRoom.set(roomId, String(exit.vacate_date ?? exit.created_at ?? "").slice(0, 10));
            }
            const latestVacantHistoryByRoom = new Map<string, string>();
            for (const history of (statusHistoryResult.data ?? []) as Array<Record<string, unknown>>) {
                const roomId = String(history.room_id ?? "");
                const nextStatus = String(history.new_status ?? "").toLowerCase();
                if (roomId && !latestVacantHistoryByRoom.has(roomId) && nextStatus.includes("vacant")) latestVacantHistoryByRoom.set(roomId, String(history.created_at ?? "").slice(0, 10));
            }
            const searchIndex = searchIndexResult.data as Record<string, unknown> | null;
            const firstRoom = rooms[0];
            const office = firstRoom?.offices as Record<string, unknown> | null;
            const officeScope = landlordOfficeFilterId;
            const payables = ((payablesResult.data ?? []) as Array<Record<string, unknown>>)
                .filter(activeStatus)
                .filter((row) => !officeScope || String(row.office_id ?? "") === officeScope);
            const activeAdvances = ((advancesResult.data ?? []) as Array<Record<string, unknown>>)
                .filter(activeLandlordAdvance)
                .filter((row) => !officeScope || String(row.office_id ?? "") === officeScope);
            const advanceBalance = activeAdvances.reduce((total, row) => total + landlordAdvanceRemaining(row), 0);
            const currentMonth = currentSettlementMonth();
            const settlementTiming = normalizeSettlementTiming(landlord.settlement_timing);
            const summary = summarizeLandlordPayables({
                activeAdvanceBalance: advanceBalance,
                currentMonth,
                payables,
                settlementTiming,
            });
            const latestAdjustment = ((adjustmentResult.data ?? []) as Array<Record<string, unknown>>)[0] ?? null;
            const currentPayable = payables.find((row) => String(row.settlement_month ?? "").slice(0, 10) === summary.payablePeriod) ?? payables[0] ?? {};
            const lastPayment = ((paymentsResult.data ?? []) as Array<Record<string, unknown>>)
                .filter(activePaymentStatus)
                .filter((row) => !officeScope || String(row.office_id ?? "") === officeScope)[0] ?? null;
            const fullRentRoll = rooms.reduce((total, room) => total + amount(room.monthly_rent), 0) || amount(searchIndex?.rent_roll);
            const detailOfficeId = typeof firstRoom?.office_id === "string" ? firstRoom.office_id : typeof searchIndex?.office_id === "string" ? searchIndex.office_id : selectedOfficeId ?? "";
            const liveNet = detailOfficeId
                ? await getLiveLandlordMonthlyNetPayable({
                    companyId,
                    db: admin,
                    landlordId: id,
                    officeId: detailOfficeId,
                    settlementMonth: summary.payablePeriod ?? currentMonth,
                })
                : null;
            const liveNetPayable = amount(currentPayable.net_payable ?? currentPayable.amount_due ?? currentPayable.total_due) || liveNet?.netPayable || 0;
            const liveFullRentRoll = amount(currentPayable.full_rent_roll ?? currentPayable.gross_rent) || liveNet?.fullRentRoll || fullRentRoll;
            const ledgerOutstandingBalance = summary.totalOutstandingPayable || Math.max(0, liveNetPayable - amount(currentPayable.amount_paid ?? currentPayable.paid_amount ?? currentPayable.landlord_payments));
            const outstandingBalance = latestAdjustment ? amount(latestAdjustment.new_balance) : ledgerOutstandingBalance;
            const isVacantRoom = (room: Record<string, unknown>) => {
                const status = String(room.status ?? "").toLowerCase();
                const roomId = String(room.id ?? "");
                return status.includes("vacant") || status.includes("vacated") || !activeTenantByRoom.has(roomId);
            };
            const occupiedRooms = rooms.filter((room) => !isVacantRoom(room)).length;
            const vacantRooms = rooms.filter(isVacantRoom).length;
            const vacatedWithDebt = rooms.filter((room) => String(room.status ?? "").toLowerCase().includes("vacated") || amount(room.outstanding_balance) > 0 && String(room.status ?? "").toLowerCase().includes("debt")).length;
            const vacantRoomDetails = rooms
                .filter(isVacantRoom)
                .map((room) => {
                    const property = typeof room.property_id === "string" ? propertiesById.get(room.property_id) : null;
                    const roomId = String(room.id);
                    const previousTenant = previousTenantByRoom.get(roomId);
                    return {
                        id: roomId,
                        monthlyRent: amount(room.monthly_rent),
                        outstandingTenantDebt: amount(room.outstanding_balance),
                        previousTenant: String(previousTenant?.full_name ?? ""),
                        property: String(property?.property_name ?? property?.name ?? property?.location ?? "Property"),
                        roomNumber: String(room.room_number ?? "Room"),
                        vacantSince: latestVacateDateByRoom.get(roomId) ?? latestVacantHistoryByRoom.get(roomId) ?? (typeof room.updated_at === "string" ? String(room.updated_at).slice(0, 10) : null),
                    };
                });
            const deductionRows = [
                { type: "Commission", amount: amount(currentPayable.commission_amount) || liveNet?.commissionAmount || 0, period: summary.payablePeriod, reason: "Landlord commission", date: String(currentPayable.updated_at ?? currentPayable.created_at ?? "").slice(0, 10), reference: String(currentPayable.id ?? "") },
                { type: "Vacant Room Deduction", amount: amount(currentPayable.vacant_room_deductions) || liveNet?.vacantRoomDeductions || 0, period: summary.payablePeriod, reason: "Vacant rooms deducted from payable", date: String(currentPayable.updated_at ?? currentPayable.created_at ?? "").slice(0, 10), reference: String(currentPayable.id ?? "") },
                { type: "Unrecovered Tenant Debt", amount: amount(currentPayable.vacated_tenant_debt_deductions) || liveNet?.recoveryDeduction || 0, period: summary.payablePeriod, reason: "Unrecovered tenant debt", date: String(currentPayable.updated_at ?? currentPayable.created_at ?? "").slice(0, 10), reference: String(currentPayable.id ?? "") },
                { type: "Previous Advance Recovery", amount: amount(currentPayable.advance_deductions) || liveNet?.advanceDeduction || 0, period: summary.payablePeriod, reason: "Landlord advance recovery", date: String(currentPayable.updated_at ?? currentPayable.created_at ?? "").slice(0, 10), reference: String(currentPayable.id ?? "") },
                { type: "Other Approved Deduction", amount: amount(currentPayable.other_deductions), period: summary.payablePeriod, reason: String(currentPayable.reasons_notes ?? currentPayable.accounting_notes ?? "Other approved deduction"), date: String(currentPayable.updated_at ?? currentPayable.created_at ?? "").slice(0, 10), reference: String(currentPayable.id ?? "") },
            ].filter((row) => row.amount > 0);
            const totalDeductions = deductionRows.reduce((total, row) => total + row.amount, 0);
            const lastPaymentAmount = amount(lastPayment?.amount ?? lastPayment?.amount_paid ?? lastPayment?.payment_amount ?? lastPayment?.paid_amount);
            const lastPaymentDate = typeof lastPayment?.paid_at === "string"
                ? String(lastPayment.paid_at).slice(0, 10)
                : typeof lastPayment?.payment_date === "string"
                    ? String(lastPayment.payment_date).slice(0, 10)
                    : typeof lastPayment?.created_at === "string"
                        ? String(lastPayment.created_at).slice(0, 10)
                        : null;
            return NextResponse.json({
                detail: {
                    id: String(landlord.id),
                    name: String(landlord.full_name ?? "Landlord"),
                    officeId: typeof firstRoom?.office_id === "string" ? firstRoom.office_id : typeof searchIndex?.office_id === "string" ? searchIndex.office_id : null,
                    officeName: String(office?.office_name ?? office?.name ?? searchIndex?.office_name ?? "Office"),
                    location: String(landlord.location ?? landlord.address ?? searchIndex?.location_text ?? ""),
                    outstandingBalance,
                    lastPaymentAmount,
                    lastPaymentDate,
                    landlordPaymentDate: String(landlord.payment_date ?? landlord.landlord_payment_date ?? landlord.preferred_payment_date ?? expenseDate).slice(0, 10),
                    landlordBillingDate: String(landlord.billing_date ?? landlord.landlord_billing_date ?? `${expenseDate.slice(0, 7)}-01`).slice(0, 10),
                    paymentDueDate: String(landlord.payment_date ?? landlord.landlord_payment_date ?? landlord.preferred_payment_date ?? "").slice(0, 10) || null,
                    commissionType: String(landlord.commission_calculation_mode ?? landlord.commission_input_mode ?? ""),
                    commissionRate: Number.isFinite(Number(landlord.commission_rate)) ? Number(landlord.commission_rate) : null,
                    fullRentRoll: liveFullRentRoll,
                    netPayable: summary.currentMonthNetPayable || liveNetPayable || outstandingBalance,
                    portfolioValue: fullRentRoll,
                    totalRooms: rooms.length || amount(searchIndex?.room_count),
                    occupiedRooms,
                    vacantRooms,
                    vacatedWithDebt,
                    advanceBalance,
                    currentMonthPendingSettlement: summary.currentMonthPendingSettlement,
                    deductionBreakdown: deductionRows,
                    lastPaymentReference: typeof lastPayment?.payout_reference === "string" ? lastPayment.payout_reference : typeof lastPayment?.reference === "string" ? lastPayment.reference : null,
                    payablePeriod: summary.payablePeriod,
                    payablePeriodLabel: monthLabel(summary.payablePeriod),
                    portfolioGross: liveFullRentRoll,
                    settlementCycleLabel: settlementTiming === "current_month" ? "Current Month" : "Previous Month",
                    settlementTiming,
                    totalDeductions,
                    vacantRoomDetails,
                    paymentStatus: outstandingBalance > 0 ? "Payable outstanding" : advanceBalance > 0 ? "Advance active" : "Settled",
                },
            }, { headers: { "Cache-Control": "no-store" } });
        }

        return NextResponse.json({ error: "Unsupported detail type." }, { status: 400 });
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Entry detail failed." }, { status: 400 });
    }
}
