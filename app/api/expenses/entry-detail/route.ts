import { NextRequest, NextResponse } from "next/server";
import { isCompanyOperationalManager, requirePermission } from "@/lib/auth/permissions";
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

function normalizedRole(value: unknown) {
    return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isAllRounderEmployee(row: Record<string, unknown>) {
    return [row.employee_assignment_type, row.role, row.job_title].some((value) => normalizedRole(value) === "allrounder");
}

function isEligibleEmployee(row: Record<string, unknown>, activeOfficeId: string | null, canSeeAll: boolean) {
    if (String(row.status ?? "active").toLowerCase() !== "active") return false;
    if (canSeeAll) return true;
    const employeeOfficeId = typeof row.office_id === "string" ? row.office_id : null;
    return Boolean(activeOfficeId && employeeOfficeId === activeOfficeId) || isAllRounderEmployee(row);
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
        const canSeeAll = (context.isCompanyAdmin && !context.isOfficeMode) || isCompanyOperationalManager(context);
        const requestedOfficeId = request.nextUrl.searchParams.get("officeId")?.trim() || null;
        const selectedOfficeId = canSeeAll && requestedOfficeId && context.offices.some((office) => office.id === requestedOfficeId)
            ? requestedOfficeId
            : activeOfficeId;
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

        if (type === "landlord") {
            const [landlordResult, roomsResult, payablesResult, advancesResult, paymentsResult, adjustmentResult] = await Promise.all([
                db
                    .from("landlords")
                    .select("*")
                    .eq("company_id", companyId)
                    .eq("id", id)
                    .maybeSingle(),
                (() => {
                    let query = db
                        .from("rooms")
                        .select("id, office_id, status, monthly_rent, outstanding_balance, offices:office_id(id, office_name, name)")
                        .eq("company_id", companyId)
                        .eq("landlord_id", id)
                        .not("status", "in", "(archived,inactive,deleted,removed)");
                    if (selectedOfficeId) query = query.eq("office_id", selectedOfficeId);
                    return query;
                })(),
                db
                    .from("landlord_monthly_payables")
                    .select("*")
                    .eq("company_id", companyId)
                    .eq("landlord_id", id)
                    .neq("status", "archived")
                    .order("settlement_month", { ascending: false, nullsFirst: false })
                    .limit(36),
                db
                    .from("landlord_advances")
                    .select("*")
                    .eq("company_id", companyId)
                    .eq("landlord_id", id),
                db
                    .from("landlord_payments")
                    .select("*")
                    .eq("company_id", companyId)
                    .eq("landlord_id", id)
                    .not("status", "in", "(reversed,voided,deleted,cancelled,canceled)")
                    .order("paid_at", { ascending: false, nullsFirst: false })
                    .order("created_at", { ascending: false, nullsFirst: false })
                    .limit(1),
                db
                    .from("landlord_balance_adjustments")
                    .select("*")
                    .eq("company_id", companyId)
                    .eq("landlord_id", id)
                    .eq("status", "approved")
                    .order("effective_date", { ascending: false, nullsFirst: false })
                    .order("created_at", { ascending: false, nullsFirst: false })
                    .limit(1),
            ]);
            if (landlordResult.error) throw new Error(landlordResult.error.message);
            if (roomsResult.error) throw new Error(roomsResult.error.message);
            if (payablesResult.error && !/does not exist|schema cache/i.test(payablesResult.error.message ?? "")) throw new Error(payablesResult.error.message);
            if (advancesResult.error && !/does not exist|schema cache/i.test(advancesResult.error.message ?? "")) throw new Error(advancesResult.error.message);
            if (paymentsResult.error && !/does not exist|schema cache/i.test(paymentsResult.error.message ?? "")) throw new Error(paymentsResult.error.message);
            if (adjustmentResult.error && !/does not exist|schema cache/i.test(adjustmentResult.error.message ?? "")) throw new Error(adjustmentResult.error.message);
            const landlord = landlordResult.data as Record<string, unknown> | null;
            if (!landlord) throw new Error("Landlord not found.");
            const rooms = (roomsResult.data ?? []) as Array<Record<string, unknown>>;
            if (!canSeeAll && !rooms.length) throw new Error("This landlord is not attached to the active office.");
            const firstRoom = rooms[0];
            const office = firstRoom?.offices as Record<string, unknown> | null;
            const payables = ((payablesResult.data ?? []) as Array<Record<string, unknown>>).filter(activeStatus);
            const ledgerOutstandingBalance = payables.reduce((total, row) => total + amount(row.unpaid_balance ?? row.outstanding_amount ?? row.balance_due ?? row.net_payable), 0);
            const latestAdjustment = ((adjustmentResult.data ?? []) as Array<Record<string, unknown>>)[0] ?? null;
            const outstandingBalance = latestAdjustment ? amount(latestAdjustment.new_balance) : ledgerOutstandingBalance;
            const currentPayable = payables[0] ?? {};
            const advanceBalance = ((advancesResult.data ?? []) as Array<Record<string, unknown>>)
                .filter(activeStatus)
                .reduce((total, row) => total + amount(row.remaining_balance ?? row.balance ?? row.amount), 0);
            const lastPayment = ((paymentsResult.data ?? []) as Array<Record<string, unknown>>)[0] ?? null;
            const fullRentRoll = rooms.reduce((total, room) => total + amount(room.monthly_rent), 0);
            const occupiedRooms = rooms.filter((room) => !String(room.status ?? "").toLowerCase().includes("vacant") && !String(room.status ?? "").toLowerCase().includes("vacated")).length;
            const vacantRooms = rooms.filter((room) => String(room.status ?? "").toLowerCase().includes("vacant")).length;
            const vacatedWithDebt = rooms.filter((room) => String(room.status ?? "").toLowerCase().includes("vacated") || amount(room.outstanding_balance) > 0 && String(room.status ?? "").toLowerCase().includes("debt")).length;
            return NextResponse.json({
                detail: {
                    id: String(landlord.id),
                    name: String(landlord.full_name ?? "Landlord"),
                    officeId: typeof firstRoom?.office_id === "string" ? firstRoom.office_id : null,
                    officeName: String(office?.office_name ?? office?.name ?? "Office"),
                    location: String(landlord.location ?? landlord.address ?? ""),
                    outstandingBalance,
                    lastPaymentAmount: amount(lastPayment?.amount),
                    lastPaymentDate: lastPayment?.paid_at ? String(lastPayment.paid_at).slice(0, 10) : null,
                    landlordPaymentDate: String(landlord.payment_date ?? landlord.landlord_payment_date ?? landlord.preferred_payment_date ?? expenseDate).slice(0, 10),
                    landlordBillingDate: String(landlord.billing_date ?? landlord.landlord_billing_date ?? `${expenseDate.slice(0, 7)}-01`).slice(0, 10),
                    commissionType: String(landlord.commission_calculation_mode ?? landlord.commission_input_mode ?? ""),
                    commissionRate: Number.isFinite(Number(landlord.commission_rate)) ? Number(landlord.commission_rate) : null,
                    fullRentRoll: amount(currentPayable.full_rent_roll ?? currentPayable.gross_rent ?? fullRentRoll),
                    netPayable: amount(currentPayable.net_payable ?? currentPayable.amount_due ?? outstandingBalance),
                    portfolioValue: fullRentRoll,
                    totalRooms: rooms.length,
                    occupiedRooms,
                    vacantRooms,
                    vacatedWithDebt,
                    advanceBalance,
                    paymentStatus: outstandingBalance > 0 ? "Payable outstanding" : advanceBalance > 0 ? "Advance active" : "Settled",
                },
            }, { headers: { "Cache-Control": "no-store" } });
        }

        return NextResponse.json({ error: "Unsupported detail type." }, { status: 400 });
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Entry detail failed." }, { status: 400 });
    }
}
