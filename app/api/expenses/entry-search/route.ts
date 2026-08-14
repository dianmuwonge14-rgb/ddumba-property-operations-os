import { NextRequest, NextResponse } from "next/server";
import { isCompanyOperationalManager, requirePermission } from "@/lib/auth/permissions";
import { normalizeSettlementTiming, summarizeLandlordPayables } from "@/lib/landlord-payables/payment-allocation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function normalizeSearch(value: string) {
    return value.trim().replaceAll("%", "").replaceAll("_", "").slice(0, 80);
}

function compactSearch(value: unknown) {
    return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isRealEmployee(row: Record<string, unknown>) {
    const haystack = [
        row.account_type,
        row.assignment_type,
        row.employee_assignment_type,
        row.role,
        row.job_title,
        row.full_name,
        row.email,
    ].map((value) => String(value ?? "").toLowerCase()).join(" ");
    if (/\b(admin|system|shared login|office account|office manager login)\b/.test(haystack)) return false;
    return !["terminated", "archived", "deleted", "inactive"].includes(String(row.status ?? "").toLowerCase());
}

function normalizedRole(value: unknown) {
    return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isFieldCollector(row: Record<string, unknown>) {
    return [row.employee_assignment_type, row.assignment_type, row.role, row.job_title, row.position].some((value) => {
        const normalized = normalizedRole(value);
        return normalized === "fieldcollector" || normalized === "collector" || normalized === "allrounder";
    });
}

function isManager(row: Record<string, unknown>) {
    return [row.role, row.job_title, row.position, row.account_type].some((value) => normalizedRole(value).includes("manager"));
}

function amount(value: unknown) {
    const numberValue = Number(value ?? 0);
    return Number.isFinite(numberValue) ? numberValue : 0;
}

function currentSettlementMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function activeLandlordAdvance(row: Record<string, unknown>) {
    const status = String(row.status ?? "pending").toLowerCase();
    const lifecycle = String(row.lifecycle_status ?? "active").toLowerCase();
    return !["fully_deducted", "cleared", "cancelled", "rejected", "voided"].includes(status)
        && !["cleared", "cancelled", "rejected", "voided"].includes(lifecycle);
}

function landlordAdvanceRemaining(row: Record<string, unknown>) {
    return Math.max(
        amount(row.remaining_total_balance),
        amount(row.remaining_balance),
        amount(row.advance_amount) - amount(row.deducted_amount),
        0,
    );
}

function monthStart(value: string | null) {
    const source = value && /^\d{4}-\d{2}/.test(value) ? value : new Date().toISOString().slice(0, 10);
    return `${source.slice(0, 7)}-01`;
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

function salaryStatus(netSalary: number, alreadyPaid: number, remainingSalary: number, hasPendingRequest: boolean) {
    if (netSalary <= 0) return "Salary has not yet been configured";
    if (hasPendingRequest) return "Pending Admin Approval";
    if (remainingSalary <= 0) return "Paid";
    if (alreadyPaid > 0) return "Partially Paid";
    return "Upcoming";
}

export async function GET(request: NextRequest) {
    try {
        const context = await requirePermission("expenses.read");
        const supabase = await createSupabaseServerClient();
        const companyId = context.activeCompany?.id;
        const contextActiveOfficeId = context.activeOffice?.id ?? null;
        if (!companyId) throw new Error("Active company is required.");
        const type = request.nextUrl.searchParams.get("type");
        const q = normalizeSearch(request.nextUrl.searchParams.get("q") ?? "");
        if (!q) return NextResponse.json({ results: [] }, { headers: { "Cache-Control": "no-store" } });
        const like = `%${q}%`;
        const canSeeAll = context.isCompanyAdmin || isCompanyOperationalManager(context);
        const requestedOfficeId = request.nextUrl.searchParams.get("officeId")?.trim() || null;
        const activeOfficeId = canSeeAll && requestedOfficeId && context.offices.some((office) => office.id === requestedOfficeId)
            ? requestedOfficeId
            : contextActiveOfficeId;

        if (type === "employee") {
            const admin = createSupabaseAdminClient() as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
            const { data, error } = await admin.rpc("ddumba_v1_expense_employee_search", {
                p_company_id: companyId,
                p_office_id: activeOfficeId,
                p_query: q,
                // Keep the original company-wide permission explicit while the selected active office scopes entry submission.
                // p_include_all_offices: canSeeAll
                p_include_all_offices: canSeeAll && !activeOfficeId,
            });
            if (error) throw new Error(error.message);
            const results = ((data ?? []) as Array<Record<string, unknown>>)
                .map((row) => {
                    return {
                        id: String(row.employee_id),
                        name: String(row.employee_name ?? "Employee"),
                        officeId: typeof row.home_office_id === "string" ? row.home_office_id : null,
                        officeName: String(row.home_office_name ?? "Office"),
                        role: String(row.employee_position ?? "Employee"),
                        phone: typeof row.phone === "string" ? row.phone : null,
                        employeeCode: typeof row.employee_code === "string" ? row.employee_code : null,
                    };
                })
                .filter(isRealEmployee);
            return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
        }

        if (type === "salary_employee") {
            const admin = createSupabaseAdminClient() as unknown as { from: (table: string) => any };
            const salaryMonth = monthStart(request.nextUrl.searchParams.get("salaryMonth"));
            const [employeeResult, officeResult] = await Promise.all([
                admin
                    .from("employees")
                    .select("id, full_name, office_id, role, job_title, phone, email, status, employee_assignment_type, employee_code, basic_salary, salary_payment_day, salary_receiving_day")
                    .eq("company_id", companyId)
                    .order("full_name", { ascending: true, nullsFirst: false })
                    .limit(500),
                admin.from("offices").select("id, office_name, name").eq("company_id", companyId),
            ]);
            if (employeeResult.error) throw new Error(employeeResult.error.message);
            if (officeResult.error) throw new Error(officeResult.error.message);
            const offices = new Map<string, Record<string, unknown>>();
            for (const office of (officeResult.data ?? []) as Array<Record<string, unknown>>) {
                if (office.id) offices.set(String(office.id), office);
            }
            const queryNeedle = q.toLowerCase();
            const employees = ((employeeResult.data ?? []) as Array<Record<string, unknown>>)
                .filter(isRealEmployee)
                .filter((row) => String(row.status ?? "active").toLowerCase() === "active")
                .filter((row) => {
                    if (canSeeAll) return true;
                    const employeeOfficeId = typeof row.office_id === "string" ? row.office_id : null;
                    return Boolean(activeOfficeId && employeeOfficeId === activeOfficeId) || isFieldCollector(row) || isManager(row);
                })
                .filter((row) => {
                    const office = typeof row.office_id === "string" ? offices.get(row.office_id) : null;
                    const haystack = [
                        row.full_name,
                        row.phone,
                        row.employee_code,
                        row.role,
                        row.job_title,
                        row.position,
                        row.employee_assignment_type,
                        row.assignment_type,
                        office?.office_name,
                        office?.name,
                    ].map((value) => String(value ?? "").toLowerCase()).join(" ");
                    return haystack.includes(queryNeedle);
                })
                .filter((row, index, rows) => rows.findIndex((candidate) => String(candidate.id) === String(row.id)) === index)
                .slice(0, 20);
            const employeeIds = employees.map((employee) => String(employee.id)).filter(Boolean);
            const [profileRows, bonusRows, payrollExpenseRows, advanceRows, fineRows, paymentRows, pendingRows] = employeeIds.length
                ? await Promise.all([
                    admin.from("payroll_profiles").select("*").eq("company_id", companyId).in("employee_id", employeeIds),
                    admin.from("employee_bonuses").select("employee_id, amount").eq("company_id", companyId).in("employee_id", employeeIds).eq("month_key", salaryMonth).eq("active", true),
                    admin.from("employee_expenses").select("employee_id, amount").eq("company_id", companyId).in("employee_id", employeeIds).eq("month_key", salaryMonth).eq("active", true).eq("approved_for_payroll", true),
                    admin.from("employee_advances").select("employee_id, amount, remaining_balance, status, active").eq("company_id", companyId).in("employee_id", employeeIds).eq("month_key", salaryMonth).eq("active", true),
                    admin.from("employee_fines").select("employee_id, amount").eq("company_id", companyId).in("employee_id", employeeIds).eq("month_key", salaryMonth).eq("active", true),
                    admin.from("employee_salary_payments").select("employee_id, paid_amount").eq("company_id", companyId).in("employee_id", employeeIds).eq("month_key", salaryMonth),
                    admin.from("employee_salary_payment_requests").select("id, employee_id, status").eq("company_id", companyId).in("employee_id", employeeIds).eq("month_key", salaryMonth).eq("active", true),
                ])
                : [
                    { data: [], error: null },
                    { data: [], error: null },
                    { data: [], error: null },
                    { data: [], error: null },
                    { data: [], error: null },
                    { data: [], error: null },
                    { data: [], error: null },
                ];
            for (const result of [profileRows, bonusRows, payrollExpenseRows, advanceRows, fineRows, paymentRows, pendingRows]) {
                if (result.error && !/does not exist|schema cache/i.test(result.error.message ?? "")) throw new Error(result.error.message);
            }
            const profileByEmployee = new Map<string, Record<string, unknown>>();
            for (const profile of (profileRows.data ?? []) as Array<Record<string, unknown>>) {
                if (profile.employee_id && !profileByEmployee.has(String(profile.employee_id))) profileByEmployee.set(String(profile.employee_id), profile);
            }
            const sumFor = (rows: unknown, employeeId: string, field: string) => ((rows ?? []) as Array<Record<string, unknown>>)
                .filter((row) => String(row.employee_id ?? "") === employeeId)
                .reduce((total, row) => total + amount(row[field]), 0);
            const advanceFor = (employeeId: string) => ((advanceRows.data ?? []) as Array<Record<string, unknown>>)
                .filter((row) => String(row.employee_id ?? "") === employeeId)
                .filter((row) => ["approved", "active", "partially_deducted"].includes(String(row.status ?? "approved").toLowerCase()))
                .reduce((total, row) => total + Math.max(amount(row.remaining_balance), amount(row.amount)), 0);
            const pendingByEmployee = new Map<string, string>();
            for (const row of (pendingRows.data ?? []) as Array<Record<string, unknown>>) {
                if (String(row.status ?? "").toLowerCase() === "pending" && row.employee_id && row.id) pendingByEmployee.set(String(row.employee_id), String(row.id));
            }
            const results = employees
                .map((row) => {
                    const employeeId = String(row.id);
                    const profile = profileByEmployee.get(employeeId);
                    const payrollOfficeId = typeof profile?.office_id === "string" ? profile.office_id : typeof row.office_id === "string" ? row.office_id : null;
                    const office = payrollOfficeId ? offices.get(payrollOfficeId) : null;
                    const baseSalary = amount(profile?.base_salary ?? row.basic_salary);
                    const bonuses = sumFor(bonusRows.data, employeeId, "amount");
                    const payrollExpenses = sumFor(payrollExpenseRows.data, employeeId, "amount");
                    const advanceOutstanding = advanceFor(employeeId);
                    const fines = sumFor(fineRows.data, employeeId, "amount");
                    const netSalary = Math.max(0, baseSalary + bonuses - payrollExpenses - advanceOutstanding - fines);
                    const alreadyPaid = sumFor(paymentRows.data, employeeId, "paid_amount");
                    const remainingSalary = Math.max(0, netSalary - alreadyPaid);
                    const pendingSalaryRequestId = pendingByEmployee.get(employeeId) ?? null;
                    return {
                        id: employeeId,
                        name: String(row.full_name ?? "Employee"),
                        officeId: typeof row.office_id === "string" ? row.office_id : null,
                        officeName: String(office?.office_name ?? office?.name ?? "Company Payroll"),
                        payrollOfficeId,
                        payrollOfficeName: String(office?.office_name ?? office?.name ?? "Company Payroll"),
                        role: String(row.role ?? row.job_title ?? row.position ?? "Employee"),
                        phone: typeof row.phone === "string" ? row.phone : null,
                        employeeCode: typeof row.employee_code === "string" ? row.employee_code : null,
                        monthlySalary: netSalary,
                        baseSalary,
                        alreadyPaid,
                        remainingSalary,
                        salaryAdvanceOutstanding: advanceOutstanding,
                        previousSalaryAdvanceRecovery: advanceOutstanding,
                        eligibleAmountNow: remainingSalary,
                        salaryDueDate: salaryDueDate(salaryMonth, salaryPaymentDay(profile?.salary_payment_day ?? row.salary_payment_day ?? row.salary_receiving_day ?? 1)),
                        paymentStatus: salaryStatus(netSalary, alreadyPaid, remainingSalary, Boolean(pendingSalaryRequestId)),
                        pendingSalaryRequestId,
                    };
                });
            return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
        }

        if (type === "landlord") {
            const admin = createSupabaseAdminClient() as unknown as { from: (table: string) => any };
            const landlordOfficeFilterId = canSeeAll ? null : activeOfficeId;
            const indexSearchFilter = [
                `landlord_name.ilike.${like}`,
                `phone.ilike.${like}`,
                `office_name.ilike.${like}`,
                `location_text.ilike.${like}`,
                `room_numbers_text.ilike.${like}`,
                `tenant_names_text.ilike.${like}`,
                `searchable_text.ilike.${like}`,
                `normalized_name.ilike.${like}`,
            ].join(",");
            const landlordSearchFilter = [
                `full_name.ilike.${like}`,
                `phone.ilike.${like}`,
                `location.ilike.${like}`,
                `address.ilike.${like}`,
            ].join(",");
            const [searchIndexResult, fallbackLandlordResult] = await Promise.all([
                (() => {
                    let query = admin
                        .from("landlord_search_index")
                        .select("landlord_id, office_id, landlord_name, phone, office_name, location_text, room_numbers_text, tenant_names_text, searchable_text, room_count, rent_roll")
                        .eq("company_id", companyId)
                        .or(indexSearchFilter)
                        .order("landlord_name", { ascending: true, nullsFirst: false })
                        .limit(40);
                    if (landlordOfficeFilterId) query = query.eq("office_id", landlordOfficeFilterId);
                    return query;
                })(),
                canSeeAll && !landlordOfficeFilterId
                    ? admin
                        .from("landlords")
                        .select("id, full_name, phone, status, location, address, payment_date, settlement_timing")
                        .eq("company_id", companyId)
                        .neq("status", "archived")
                        .or(landlordSearchFilter)
                        .order("full_name", { ascending: true, nullsFirst: false })
                        .limit(40)
                    : Promise.resolve({ data: [], error: null }),
            ]);
            for (const result of [searchIndexResult, fallbackLandlordResult]) {
                if (result.error && !/does not exist|schema cache/i.test(result.error.message ?? "")) throw new Error(result.error.message);
            }
            const needle = q.toLowerCase();
            const compactNeedle = compactSearch(q);
            const currentMonth = currentSettlementMonth();
            const indexRows = (searchIndexResult.data ?? []) as Array<Record<string, unknown>>;
            const fallbackRows = canSeeAll
                ? ((fallbackLandlordResult.data ?? []) as Array<Record<string, unknown>>).map((landlord) => ({
                    landlord_id: landlord.id,
                    office_id: null,
                    landlord_name: landlord.full_name,
                    phone: landlord.phone,
                    office_name: null,
                    location_text: [landlord.location, landlord.address].filter(Boolean).join(" "),
                    room_numbers_text: "",
                    tenant_names_text: "",
                    searchable_text: [landlord.full_name, landlord.phone, landlord.location, landlord.address].filter(Boolean).join(" "),
                    room_count: 0,
                    rent_roll: 0,
                }))
                : [];
            const rowsByLandlord = new Map<string, Record<string, unknown>>();
            for (const row of [...indexRows, ...fallbackRows]) {
                const landlordId = String(row.landlord_id ?? "");
                if (landlordId && !rowsByLandlord.has(landlordId)) rowsByLandlord.set(landlordId, row);
            }
            const candidateLandlordIds = [...rowsByLandlord.keys()].slice(0, 40);
            if (!candidateLandlordIds.length) return NextResponse.json({ results: [] }, { headers: { "Cache-Control": "no-store" } });
            const [landlordResult, payableResult, advanceResult] = await Promise.all([
                admin
                    .from("landlords")
                    .select("id, full_name, phone, status, location, address, payment_date, settlement_timing")
                    .eq("company_id", companyId)
                    .neq("status", "archived")
                    .in("id", candidateLandlordIds),
                admin.from("landlord_monthly_payables").select("*").eq("company_id", companyId).neq("status", "archived").in("landlord_id", candidateLandlordIds),
                admin.from("landlord_advances").select("*").eq("company_id", companyId).in("landlord_id", candidateLandlordIds),
            ]);
            for (const result of [landlordResult, payableResult, advanceResult]) {
                if (result.error && !/does not exist|schema cache/i.test(result.error.message ?? "")) throw new Error(result.error.message);
            }
            const landlordRows = (landlordResult.data ?? []) as Array<Record<string, unknown>>;
            const landlordById = new Map(landlordRows.map((landlord) => [String(landlord.id), landlord]));
            const payablesByLandlord = new Map<string, Array<Record<string, unknown>>>();
            for (const payable of (payableResult.data ?? []) as Array<Record<string, unknown>>) {
                const landlordId = String(payable.landlord_id ?? "");
                if (!landlordId) continue;
                payablesByLandlord.set(landlordId, [...(payablesByLandlord.get(landlordId) ?? []), payable]);
            }
            const advancesByLandlord = new Map<string, Array<Record<string, unknown>>>();
            for (const advance of (advanceResult.data ?? []) as Array<Record<string, unknown>>) {
                const landlordId = String(advance.landlord_id ?? "");
                if (!landlordId) continue;
                advancesByLandlord.set(landlordId, [...(advancesByLandlord.get(landlordId) ?? []), advance]);
            }
            const results = [...rowsByLandlord.values()]
                .map((row) => {
                    const landlordId = String(row.landlord_id ?? "");
                    const landlord = landlordById.get(landlordId);
                    if (!landlord) return null;
                    const activeAdvanceBalance = (advancesByLandlord.get(landlordId) ?? []).filter(activeLandlordAdvance).reduce((total, advance) => total + landlordAdvanceRemaining(advance), 0);
                    const summary = summarizeLandlordPayables({
                        activeAdvanceBalance,
                        currentMonth,
                        payables: payablesByLandlord.get(landlordId) ?? [],
                        settlementTiming: landlord.settlement_timing as string | null,
                    });
                    const haystack = [
                        landlord.full_name,
                        landlord.phone,
                        landlord.location,
                        landlord.address,
                        row.landlord_name,
                        row.phone,
                        row.office_name,
                        row.location_text,
                        row.room_numbers_text,
                        row.tenant_names_text,
                        row.searchable_text,
                        summary.settlementTiming === "current_month" ? "current month" : "previous month",
                    ].map((value) => String(value ?? "").toLowerCase()).join(" ");
                    if (!haystack.includes(needle) && !compactSearch(haystack).includes(compactNeedle)) return null;
                    return {
                        id: landlordId,
                        name: String(landlord.full_name ?? "Landlord"),
                        officeId: typeof row.office_id === "string" ? row.office_id : null,
                        officeName: String(row.office_name ?? "Office"),
                        phone: typeof landlord.phone === "string" ? landlord.phone : typeof row.phone === "string" ? row.phone : null,
                        location: String(landlord.location ?? landlord.address ?? ""),
                        numberOfRooms: amount(row.room_count),
                        outstandingBalance: summary.totalOutstandingPayable,
                        currentMonthPendingSettlement: summary.currentMonthPendingSettlement,
                        settlementTiming: normalizeSettlementTiming(landlord.settlement_timing),
                    };
                })
                .filter(Boolean)
                .slice(0, 16);
            return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
        }

        return NextResponse.json({ error: "Unsupported search type." }, { status: 400 });
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Entry search failed." }, { status: 400 });
    }
}
