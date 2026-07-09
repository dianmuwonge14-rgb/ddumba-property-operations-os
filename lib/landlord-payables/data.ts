import { requirePermission } from "@/lib/auth/permissions";
import { getScopedSupabase } from "@/lib/auth/query";
import type {
    LandlordAdvance,
    LandlordAdvanceGroup,
    LandlordMonthlyPayable,
    LandlordPayableGroup,
    LandlordPayablesData,
    LandlordPaymentApprovalRequest,
    LandlordPaymentOfficeOption,
    LandlordPaymentOption,
    PaidLandlordPayment,
} from "./types";

function amount(value: number | string | null | undefined) {
    return Number(value ?? 0) || 0;
}

function advanceTotal(row: Record<string, unknown>) {
    const explicitTotal = amount(row.total_repayable as number | string | null | undefined);
    if (explicitTotal > 0) return explicitTotal;
    const advanceAmount = amount(row.advance_amount as number | string | null | undefined);
    if (advanceAmount > 0) return advanceAmount;
    return amount(row.principal_amount as number | string | null | undefined) + amount(row.interest_amount as number | string | null | undefined);
}

function advanceRemaining(row: Record<string, unknown>) {
    const remainingTotal = amount(row.remaining_total_balance as number | string | null | undefined);
    if (remainingTotal > 0) return remainingTotal;
    const remainingBalance = amount(row.remaining_balance as number | string | null | undefined);
    if (remainingBalance > 0) return remainingBalance;
    const principalInterest = amount(row.remaining_principal_balance as number | string | null | undefined) + amount(row.remaining_interest_balance as number | string | null | undefined);
    if (principalInterest > 0) return principalInterest;
    return Math.max(0, advanceTotal(row) - amount(row.deducted_amount as number | string | null | undefined));
}

function isActiveAdvance(row: Record<string, unknown>) {
    const status = String(row.status ?? "pending").toLowerCase();
    const lifecycle = String(row.lifecycle_status ?? "active").toLowerCase();
    const approved = ["approved", "active", "partially_deducted"].includes(status)
        || Boolean(row.approved_by || row.approved_at || row.approved_date);
    return !["fully_deducted", "cleared", "cancelled", "rejected"].includes(status)
        && !["cleared", "cancelled", "rejected"].includes(lifecycle)
        && approved
        && advanceRemaining(row) > 0;
}

function normalizeName(value: string | null | undefined) {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function currentSettlementMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function optionalQueryError(message: string | null | undefined) {
    return /does not exist|relation|schema cache|statement timeout|canceling statement/i.test(message ?? "");
}

async function safeRows(query: Promise<{ data: unknown[] | null; error: { message: string } | null }>) {
    const result = await query;
    if (result.error && optionalQueryError(result.error.message)) {
        console.warn("Optional landlord payments query skipped:", result.error.message);
        return { data: [], error: null };
    }
    return result;
}

function payableStatus(row: LandlordMonthlyPayable) {
    return String(row.status ?? "").trim().toLowerCase();
}

function isActivePayable(row: LandlordMonthlyPayable) {
    return !["archived", "reversed", "void", "voided", "cancelled", "canceled", "deleted", "removed"].includes(payableStatus(row));
}

function unpaidBalance(row: LandlordMonthlyPayable) {
    const monthlyDue = amount(row.monthly_net_payable)
        || amount(row.net_payable)
        || Math.max(0, amount(row.total_due) - amount(row.opening_arrears));
    if (monthlyDue > 0 || amount(row.amount_paid) > 0) {
        return Math.max(0, monthlyDue - Math.min(amount(row.amount_paid), monthlyDue));
    }
    return Math.max(0, amount(row.unpaid_balance));
}

function payableDeductions(row: LandlordMonthlyPayable) {
    return amount(row.vacant_room_deductions)
        + amount(row.vacated_tenant_debt_deductions)
        + amount(row.advance_deductions)
        + amount(row.other_deductions);
}

function isCurrentMonth(row: LandlordMonthlyPayable, currentMonth: string) {
    return String(row.settlement_month).slice(0, 7) === currentMonth.slice(0, 7);
}

export async function getLandlordPayablesData(): Promise<LandlordPayablesData> {
    const context = await requirePermission("landlords.view");
    const { supabase } = await getScopedSupabase();
    const companyId = context.activeCompany?.id;
    const activeOfficeId = context.activeOffice?.id;

    if (!companyId || (!context.canAccessAllOffices && !activeOfficeId)) {
        return emptyData();
    }

    const db = supabase as unknown as { from: (table: string) => any };
    let payablesQuery = db
        .from("landlord_monthly_payables")
        .select("*")
        .eq("company_id", companyId)
        .neq("status", "archived")
        .order("settlement_month", { ascending: false });

    if (!context.canAccessAllOffices && activeOfficeId) {
        payablesQuery = payablesQuery.eq("office_id", activeOfficeId);
    }

    let advancesQuery = db
        .from("landlord_advances")
        .select("*")
        .eq("company_id", companyId)
        .order("date_given", { ascending: false });

    let roomsQuery = db
        .from("rooms")
        .select("landlord_id, office_id")
        .eq("company_id", companyId)
        .not("landlord_id", "is", null);

    let paymentsQuery = db
        .from("landlord_payments")
        .select("*")
        .eq("company_id", companyId)
        .order("paid_at", { ascending: false });

    let approvalRequestsQuery = db
        .from("landlord_payment_expense_requests")
        .select("id,office_id,landlord_id,requested_amount,normal_payment_amount,advance_amount,payment_month,payment_date,payment_method,status,created_at,reviewed_at,admin_comment")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(50);

    let paymentDetailsQuery = db
        .from("landlord_payment_details")
        .select("*")
        .eq("company_id", companyId)
        .eq("status", "approved")
        .eq("is_active", true);

    if (!context.canAccessAllOffices && activeOfficeId) {
        advancesQuery = advancesQuery.eq("office_id", activeOfficeId);
        roomsQuery = roomsQuery.eq("office_id", activeOfficeId);
        paymentsQuery = paymentsQuery.eq("office_id", activeOfficeId);
        approvalRequestsQuery = approvalRequestsQuery.eq("office_id", activeOfficeId);
        paymentDetailsQuery = paymentDetailsQuery.eq("office_id", activeOfficeId);
    }

    const [payablesResult, advancesResult, landlordsResult, officesResult, roomsResult, paymentsResult, approvalRequestsResult, paymentDetailsResult] = await Promise.all([
        payablesQuery,
        advancesQuery,
        db.from("landlords").select("id, full_name, phone").eq("company_id", companyId).order("full_name", { ascending: true }),
        db.from("offices").select("id, name").eq("company_id", companyId).order("name", { ascending: true }),
        roomsQuery,
        paymentsQuery,
        safeRows(approvalRequestsQuery),
        safeRows(paymentDetailsQuery),
    ]);

    if (payablesResult.error) throw new Error(payablesResult.error.message);
    if (advancesResult.error) throw new Error(advancesResult.error.message);
    if (landlordsResult.error) throw new Error(landlordsResult.error.message);
    if (officesResult.error) throw new Error(officesResult.error.message);
    if (roomsResult.error) throw new Error(roomsResult.error.message);
    if (paymentsResult.error) throw new Error(paymentsResult.error.message);
    if (approvalRequestsResult.error) throw new Error(approvalRequestsResult.error.message);
    if (paymentDetailsResult.error) throw new Error(paymentDetailsResult.error.message);

    const offices = ((officesResult.data ?? []) as Array<{ id: string; name: string | null }>).map((office) => ({
        id: office.id,
        name: office.name ?? "Office",
    }));
    const officeById = new Map(offices.map((office) => [office.id, office.name]));
    const landlordRows = (landlordsResult.data ?? []) as Array<{ id: string; full_name: string | null; phone?: string | null }>;
    const landlordById = new Map(landlordRows.map((landlord) => [landlord.id, landlord.full_name ?? "Landlord"]));
    const landlordOfficeById = new Map<string, string | null>();
    for (const room of (roomsResult.data ?? []) as Array<{ landlord_id: string | null; office_id: string | null }>) {
        if (room.landlord_id && !landlordOfficeById.has(room.landlord_id)) landlordOfficeById.set(room.landlord_id, room.office_id);
    }

    const rows = ((payablesResult.data ?? []) as LandlordMonthlyPayable[]).filter(isActivePayable);
    const paymentDetailsByLandlord = new Map<string, LandlordPayableGroup["approvedPaymentDetails"]>();
    for (const detail of (paymentDetailsResult.data ?? []) as Array<Record<string, unknown>>) {
        const landlordId = String(detail.landlord_id ?? "");
        if (!landlordId) continue;
        const mapped = {
        id: String(detail.id),
        label: typeof detail.label === "string" ? detail.label : null,
        paymentMethod: String(detail.payment_method ?? "cash") === "mobile_money" ? "mobile_money" as const : String(detail.payment_method ?? "cash") === "bank" ? "bank" as const : "cash" as const,
        provider: typeof detail.provider === "string" ? detail.provider : null,
        accountName: typeof detail.account_name === "string" ? detail.account_name : null,
        accountNumber: typeof detail.account_number === "string" ? detail.account_number : null,
        isDefault: Boolean(detail.is_default),
        mobileMoneyProvider: typeof detail.mobile_money_provider === "string" ? detail.mobile_money_provider : null,
        mobileMoneyNumber: typeof detail.mobile_money_number === "string" ? detail.mobile_money_number : null,
        mobileMoneyAccountName: typeof detail.mobile_money_account_name === "string" ? detail.mobile_money_account_name : null,
        bankName: typeof detail.bank_name === "string" ? detail.bank_name : null,
        bankAccountNumber: typeof detail.bank_account_number === "string" ? detail.bank_account_number : null,
        bankAccountName: typeof detail.bank_account_name === "string" ? detail.bank_account_name : null,
        branch: typeof detail.branch === "string" ? detail.branch : null,
        };
        paymentDetailsByLandlord.set(landlordId, [...(paymentDetailsByLandlord.get(landlordId) ?? []), mapped]);
    }
    for (const [landlordId, details] of paymentDetailsByLandlord.entries()) {
        paymentDetailsByLandlord.set(landlordId, [...(details ?? [])].sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || String(a.label ?? "").localeCompare(String(b.label ?? ""))));
    }
    const groups = groupPayables(rows).map((group) => {
        const approvedPaymentDetails = paymentDetailsByLandlord.get(group.landlordId) ?? [];
        return {
            ...group,
            activePaymentDetail: approvedPaymentDetails.find((detail) => detail.isDefault) ?? approvedPaymentDetails[0] ?? null,
            approvedPaymentDetails,
        };
    });
    const currentMonth = currentSettlementMonth();
    const currentMonthRows = rows.filter((row) => isCurrentMonth(row, currentMonth));
    const unpaidBalanceRows = rows.filter((row) => unpaidBalance(row) > 0 && payableStatus(row) !== "paid");
    const paidLedgerRows = rows.filter((row) => unpaidBalance(row) <= 0 && (amount(row.amount_paid) > 0 || ["paid", "overpaid"].includes(payableStatus(row))));
    const unpaidLedgerRows = unpaidBalanceRows.filter((row) => amount(row.amount_paid) <= 0 || payableStatus(row) === "unpaid");
    const partialLedgerRows = unpaidBalanceRows.filter((row) => amount(row.amount_paid) > 0 || ["partial", "partially_paid"].includes(payableStatus(row)));
    const unpaidLandlordKeys = new Set(unpaidBalanceRows.map((row) => String(row.landlord_id || normalizeName(row.landlord_name))).filter(Boolean));
    const paidLandlordMonthKeys = new Set(paidLedgerRows.map((row) => `${row.landlord_id || normalizeName(row.landlord_name)}:${row.settlement_month}`));
    const partialLandlordMonthKeys = new Set(partialLedgerRows.map((row) => `${row.landlord_id || normalizeName(row.landlord_name)}:${row.settlement_month}`));
    const needsReviewLandlordKeys = new Set<string>();
    const unpaidMonthGroups = groupUnpaidByMonth(unpaidBalanceRows);
    const payableBySettlementId = new Map(rows.filter((row) => row.settlement_id).map((row) => [row.settlement_id, row]));
    const paidPayments = ((paymentsResult.data ?? []) as Array<Record<string, unknown>>).map((payment) => {
        const landlordId = typeof payment.landlord_id === "string" ? payment.landlord_id : null;
        const officeId = typeof payment.office_id === "string" ? payment.office_id : null;
        const payable = typeof payment.settlement_id === "string" ? payableBySettlementId.get(payment.settlement_id) : null;
        return {
            id: String(payment.id),
            landlordId,
            landlordName: landlordId ? landlordById.get(landlordId) ?? "Landlord" : "Landlord",
            officeId,
            officeName: officeId ? officeById.get(officeId) ?? "Office" : "Office",
            settlementMonth: payable?.settlement_month ?? String(payment.paid_at ?? payment.created_at ?? "").slice(0, 10),
            netPayable: amount(payable?.net_payable),
            amountPaid: amount(payment.amount as number | string | null | undefined),
            paymentMethod: String(payment.payment_method ?? "manual"),
            paymentDate: typeof payment.paid_at === "string" ? payment.paid_at : typeof payment.created_at === "string" ? payment.created_at : null,
            reference: typeof payment.payout_reference === "string" ? payment.payout_reference : null,
            paidBy: typeof payment.created_by === "string" ? payment.created_by : null,
        } satisfies PaidLandlordPayment;
    });
    const advances = ((advancesResult.data ?? []) as Array<Record<string, unknown>>).map((advance) => {
        const officeId = typeof advance.office_id === "string" ? advance.office_id : null;
        const landlordId = String(advance.landlord_id ?? "");
        return {
            ...(advance as unknown as Omit<LandlordAdvance, "landlordName" | "officeName">),
            advance_amount: advanceTotal(advance),
            remaining_balance: advanceRemaining(advance),
            landlordName: landlordById.get(landlordId) ?? "Landlord",
            officeName: officeId ? officeById.get(officeId) ?? "Office" : "Company",
        } as LandlordAdvance;
    });
    const approvalRequests = ((approvalRequestsResult.data ?? []) as Array<Record<string, unknown>>).map((request) => {
        const landlordId = typeof request.landlord_id === "string" ? request.landlord_id : null;
        const officeId = typeof request.office_id === "string" ? request.office_id : null;
        return {
            id: String(request.id),
            advanceAmount: amount(request.advance_amount as number | string | null | undefined),
            adminComment: typeof request.admin_comment === "string" ? request.admin_comment : null,
            landlordId,
            landlordName: landlordId ? landlordById.get(landlordId) ?? "Landlord" : "Landlord",
            normalPaymentAmount: amount(request.normal_payment_amount as number | string | null | undefined),
            officeId,
            officeName: officeId ? officeById.get(officeId) ?? "Office" : "Office",
            paymentDate: typeof request.payment_date === "string" ? request.payment_date : null,
            paymentMethod: String(request.payment_method ?? "cash"),
            paymentMonth: typeof request.payment_month === "string" ? request.payment_month : null,
            requestedAmount: amount(request.requested_amount as number | string | null | undefined),
            reviewedAt: typeof request.reviewed_at === "string" ? request.reviewed_at : null,
            status: String(request.status ?? "pending"),
            submittedAt: typeof request.created_at === "string" ? request.created_at : null,
        } satisfies LandlordPaymentApprovalRequest;
    });
    const advanceGroups = groupAdvances(advances);
    const scopedLandlordIds = new Set<string>([
        ...groups.map((group) => group.landlordId),
        ...advanceGroups.map((group) => group.landlordId),
        ...(roomsResult.data ?? []).map((room: { landlord_id: string | null }) => room.landlord_id).filter((id: string | null): id is string => Boolean(id)),
    ]);
    const landlordOptions: LandlordPaymentOption[] = landlordRows
        .filter((landlord) => context.canAccessAllOffices || scopedLandlordIds.has(landlord.id))
        .map((landlord) => {
            const officeId = landlordOfficeById.get(landlord.id) ?? activeOfficeId ?? null;
            return {
                id: landlord.id,
                name: landlord.full_name ?? "Landlord",
                officeId,
                officeName: officeId ? officeById.get(officeId) ?? "Office" : "Office",
            };
        });

    const officeOptions: LandlordPaymentOfficeOption[] = context.canAccessAllOffices
        ? offices
        : offices.filter((office) => office.id === activeOfficeId);

    return {
        company: context.activeCompany,
        activeOffice: context.activeOffice,
        canAccessAllOffices: context.canAccessAllOffices,
        canManage: context.isCompanyAdmin,
        rows,
        groups,
        unpaidMonthGroups,
        advances,
        advanceGroups,
        paidPayments,
        approvalRequests,
        landlords: landlordOptions,
        offices: officeOptions,
        summary: {
            totalUnpaidLandlordMoney: unpaidBalanceRows.reduce((total, row) => total + unpaidBalance(row), 0),
            totalUnpaidAcrossMonths: unpaidBalanceRows.reduce((total, row) => total + unpaidBalance(row), 0),
            unpaidLandlords: unpaidLandlordKeys.size,
            partialLandlords: partialLandlordMonthKeys.size,
            needsReviewLandlords: needsReviewLandlordKeys.size,
            totalOutstandingToLandlords: unpaidBalanceRows.reduce((total, row) => total + unpaidBalance(row), 0),
            oldestUnpaidMonth: unpaidBalanceRows.map((row) => row.settlement_month).sort()[0] ?? null,
            totalLandlordAdvances: advances
                .filter((advance) => !["rejected", "cancelled"].includes(String(advance.status ?? "").toLowerCase()))
                .reduce((total, advance) => total + advanceTotal(advance as unknown as Record<string, unknown>), 0),
            activeLandlordAdvances: advances
                .filter((advance) => isActiveAdvance(advance as unknown as Record<string, unknown>))
                .reduce((total, advance) => total + advanceRemaining(advance as unknown as Record<string, unknown>), 0),
            recoveryDeductions: unpaidBalanceRows.reduce((total, row) => total + amount(row.vacated_tenant_debt_deductions), 0),
            paidLandlords: paidLandlordMonthKeys.size,
            totalMoneyPaidToLandlords: paidLedgerRows.length > 0
                ? paidLedgerRows.reduce((total, row) => total + amount(row.amount_paid || row.net_payable), 0)
                : paidPayments.reduce((total, payment) => total + payment.amountPaid, 0),
        },
        debug: {
            currentMonthKey: currentMonth,
            totalPayableRows: currentMonthRows.length,
            paidRows: paidLedgerRows.length,
            unpaidRows: unpaidLedgerRows.length,
            partialRows: partialLedgerRows.length,
            unknownRows: 0,
            excludedRows: [],
        },
    };
}

function groupUnpaidByMonth(rows: LandlordMonthlyPayable[]): LandlordPayablesData["unpaidMonthGroups"] {
    const grouped = new Map<string, LandlordMonthlyPayable[]>();
    for (const row of rows) {
        const monthKey = String(row.settlement_month).slice(0, 7);
        if (!monthKey) continue;
        grouped.set(monthKey, [...(grouped.get(monthKey) ?? []), row]);
    }

    return [...grouped.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([monthKey, monthRows]) => {
            const mappedRows = monthRows
                .map((row) => ({
                    id: row.id,
                    landlordId: row.landlord_id,
                    landlordName: row.landlord_name ?? "Landlord",
                    officeId: row.office_id,
                    officeName: row.office_name ?? "Office",
                    payableAmount: amount(row.net_payable ?? row.monthly_net_payable ?? row.total_due),
                    amountPaid: amount(row.amount_paid),
                    unpaidBalance: unpaidBalance(row),
                    deductions: payableDeductions(row),
                    status: payableStatus(row) || "unpaid",
                    settlementMonth: row.settlement_month,
                }))
                .sort((a, b) => b.unpaidBalance - a.unpaidBalance || a.landlordName.localeCompare(b.landlordName));
            return {
                monthKey,
                totalPayable: mappedRows.reduce((total, row) => total + row.payableAmount, 0),
                totalPaid: mappedRows.reduce((total, row) => total + row.amountPaid, 0),
                totalDeductions: mappedRows.reduce((total, row) => total + row.deductions, 0),
                totalUnpaid: mappedRows.reduce((total, row) => total + row.unpaidBalance, 0),
                rows: mappedRows,
            };
        });
}

function groupPayables(rows: LandlordMonthlyPayable[]): LandlordPayableGroup[] {
    const grouped = new Map<string, LandlordMonthlyPayable[]>();
    for (const row of rows) {
        const key = row.landlord_id;
        grouped.set(key, [...(grouped.get(key) ?? []), row]);
    }

    return [...grouped].map(([landlordId, groupRows]) => {
        const unpaidRows = groupRows.filter((row) => unpaidBalance(row) > 0 && payableStatus(row) !== "paid");
        const sortedRows = [...groupRows].sort((a, b) => String(b.settlement_month).localeCompare(String(a.settlement_month)));
        return {
            landlordId,
            landlordName: sortedRows[0]?.landlord_name ?? "Landlord",
            officeName: sortedRows[0]?.office_name ?? "Office",
            monthsUnpaid: unpaidRows.length,
            totalPayable: unpaidRows.reduce((total, row) => total + amount(row.net_payable ?? row.monthly_net_payable ?? row.total_due), 0),
            totalPaid: groupRows.reduce((total, row) => total + amount(row.amount_paid), 0),
            totalOutstanding: unpaidRows.reduce((total, row) => total + unpaidBalance(row), 0),
            oldestUnpaidMonth: unpaidRows.map((row) => row.settlement_month).sort()[0] ?? null,
            lastPaidAt: groupRows.map((row) => row.last_paid_at).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null,
            rows: sortedRows,
        };
    }).sort((a, b) => b.totalOutstanding - a.totalOutstanding || a.landlordName.localeCompare(b.landlordName));
}

function groupAdvances(rows: LandlordAdvance[]): LandlordAdvanceGroup[] {
    const grouped = new Map<string, LandlordAdvance[]>();
    for (const row of rows) {
        grouped.set(row.landlord_id, [...(grouped.get(row.landlord_id) ?? []), row]);
    }

    return [...grouped].map(([landlordId, groupRows]) => {
        const activeRows = groupRows.filter((row) => {
            return isActiveAdvance(row as unknown as Record<string, unknown>);
        });
        const pendingRows = groupRows.filter((row) => String(row.status ?? "pending").toLowerCase() === "pending" && !row.approved_by);
        const rejectedRows = groupRows.filter((row) => ["rejected", "cancelled"].includes(String(row.status ?? "").toLowerCase()));
        const totalAdvanced = groupRows.reduce((total, row) => total + advanceTotal(row as unknown as Record<string, unknown>), 0);
        const totalDeducted = groupRows.reduce((total, row) => total + amount(row.deducted_amount), 0);
        const remainingBalance = activeRows.reduce((total, row) => total + advanceRemaining(row as unknown as Record<string, unknown>), 0);
        return {
            landlordId,
            landlordName: groupRows[0]?.landlordName ?? "Landlord",
            officeName: groupRows[0]?.officeName ?? "Office",
            totalAdvanced,
            totalDeducted,
            remainingBalance,
            nextDeductionMonth: activeRows
                .map((row) => row.deduction_start_date ?? row.date_given)
                .filter((value): value is string => Boolean(value))
                .sort()[0] ?? null,
            status: activeRows.some((row) => String(row.lifecycle_status ?? "") === "paused")
                ? "paused"
                : activeRows.length > 0
                    ? totalDeducted > 0
                        ? "partially_deducted"
                        : "active"
                    : pendingRows.length > 0
                        ? "pending"
                        : rejectedRows.length === groupRows.length
                            ? "rejected"
                            : "fully_deducted",
            advances: [...groupRows].sort((a, b) => String(b.date_given).localeCompare(String(a.date_given))),
        };
    }).sort((a, b) => b.remainingBalance - a.remainingBalance || a.landlordName.localeCompare(b.landlordName));
}

function emptyData(): LandlordPayablesData {
    return {
        company: null,
        activeOffice: null,
        canAccessAllOffices: false,
        canManage: false,
        rows: [],
        groups: [],
        unpaidMonthGroups: [],
        advances: [],
        advanceGroups: [],
        paidPayments: [],
        approvalRequests: [],
        landlords: [],
        offices: [],
        summary: {
            totalUnpaidLandlordMoney: 0,
            totalUnpaidAcrossMonths: 0,
            unpaidLandlords: 0,
            partialLandlords: 0,
            needsReviewLandlords: 0,
            totalOutstandingToLandlords: 0,
            oldestUnpaidMonth: null,
            totalLandlordAdvances: 0,
            activeLandlordAdvances: 0,
            recoveryDeductions: 0,
            paidLandlords: 0,
            totalMoneyPaidToLandlords: 0,
        },
        debug: {
            currentMonthKey: currentSettlementMonth(),
            totalPayableRows: 0,
            paidRows: 0,
            unpaidRows: 0,
            partialRows: 0,
            unknownRows: 0,
            excludedRows: [],
        },
    };
}
