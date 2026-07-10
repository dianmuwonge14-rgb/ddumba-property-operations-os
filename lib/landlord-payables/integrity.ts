import { landlordMonthlyDue, landlordMonthlyPaid, landlordMonthlyUnpaid, payableMonthKey, type LandlordPayableLike } from "@/lib/landlord-payables/payment-allocation";

type DbLike = { from: (table: string) => any };

export type LandlordPayableIntegrityIssue = {
    code:
        | "duplicate_monthly_payable"
        | "monthly_unpaid_mismatch"
        | "paid_later_month_before_older_unpaid"
        | "advance_with_unpaid_balance"
        | "duplicate_payment_allocation";
    message: string;
    month?: string;
    payableId?: string;
};

function amount(value: unknown) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function isActive(row: LandlordPayableLike) {
    const status = String(row.status ?? "").toLowerCase();
    return !["archived", "reversed", "void", "voided", "cancelled", "canceled", "deleted", "removed"].includes(status);
}

function rounded(value: number) {
    return Math.round(value);
}

export function validateLandlordPayableRows(rows: LandlordPayableLike[]): LandlordPayableIntegrityIssue[] {
    const issues: LandlordPayableIntegrityIssue[] = [];
    const activeRows = rows.filter(isActive);
    const monthGroups = new Map<string, LandlordPayableLike[]>();

    for (const row of activeRows) {
        const month = payableMonthKey(row).slice(0, 10);
        if (!month) continue;
        monthGroups.set(month, [...(monthGroups.get(month) ?? []), row]);
    }

    for (const [month, monthRows] of monthGroups.entries()) {
        if (monthRows.length > 1) {
            issues.push({
                code: "duplicate_monthly_payable",
                message: `Duplicate active landlord monthly payable rows exist for ${month}.`,
                month,
            });
        }
    }

    const sortedRows = [...activeRows].sort((a, b) => payableMonthKey(a).localeCompare(payableMonthKey(b)));
    for (const row of sortedRows) {
        const month = payableMonthKey(row).slice(0, 10);
        const monthlyDue = landlordMonthlyDue(row);
        const paid = landlordMonthlyPaid(row);
        const expectedUnpaid = Math.max(0, monthlyDue - Math.min(paid, monthlyDue));
        const storedUnpaid = amount(row.unpaid_balance);
        if (rounded(storedUnpaid) !== rounded(expectedUnpaid)) {
            issues.push({
                code: "monthly_unpaid_mismatch",
                message: `Stored unpaid balance for ${month} does not equal monthly net payable minus amount paid.`,
                month,
                payableId: String(row.id ?? ""),
            });
        }
        if (amount(row.advance_created) > 0 && sortedRows.some((candidate) => landlordMonthlyUnpaid(candidate) > 0)) {
            issues.push({
                code: "advance_with_unpaid_balance",
                message: `Landlord advance exists while genuine unpaid monthly balances remain.`,
                month,
                payableId: String(row.id ?? ""),
            });
        }
    }

    const firstUnpaidIndex = sortedRows.findIndex((row) => landlordMonthlyUnpaid(row) > 0);
    if (firstUnpaidIndex >= 0) {
        const firstUnpaidMonth = payableMonthKey(sortedRows[firstUnpaidIndex]);
        const laterPaid = sortedRows.slice(firstUnpaidIndex + 1).find((row) => landlordMonthlyPaid(row) > 0);
        if (laterPaid) {
            issues.push({
                code: "paid_later_month_before_older_unpaid",
                message: `A later month has a payment while older month ${firstUnpaidMonth.slice(0, 10)} still has an unpaid balance.`,
                month: payableMonthKey(laterPaid).slice(0, 10),
                payableId: String(laterPaid.id ?? ""),
            });
        }
    }

    return issues;
}

export function validateLandlordPaymentAllocations(rows: Array<Record<string, unknown>>): LandlordPayableIntegrityIssue[] {
    const issues: LandlordPayableIntegrityIssue[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
        const reference = String(row.reference ?? "").trim();
        const payableId = String(row.monthly_payable_id ?? "").trim();
        const amountKey = rounded(amount(row.amount));
        if (!reference || !payableId || amountKey <= 0) continue;
        const key = `${reference}:${payableId}:${amountKey}`;
        if (seen.has(key)) {
            issues.push({
                code: "duplicate_payment_allocation",
                message: `Duplicate landlord payment allocation detected for reference ${reference}.`,
                payableId,
            });
        }
        seen.add(key);
    }
    return issues;
}

export async function assertLandlordPayableIntegrity({
    companyId,
    db,
    landlordId,
    officeId,
}: {
    companyId: string;
    db: DbLike;
    landlordId: string;
    officeId: string;
}) {
    const [payablesResult, allocationsResult] = await Promise.all([
        db
            .from("landlord_monthly_payables")
            .select("*")
            .eq("company_id", companyId)
            .eq("office_id", officeId)
            .eq("landlord_id", landlordId)
            .neq("status", "archived"),
        db
            .from("landlord_monthly_payable_payments")
            .select("id,monthly_payable_id,amount,reference")
            .eq("company_id", companyId)
            .eq("office_id", officeId)
            .eq("landlord_id", landlordId),
    ]);

    if (payablesResult.error) throw new Error(payablesResult.error.message);
    if (allocationsResult.error) throw new Error(allocationsResult.error.message);

    const issues = [
        ...validateLandlordPayableRows((payablesResult.data ?? []) as LandlordPayableLike[]),
        ...validateLandlordPaymentAllocations((allocationsResult.data ?? []) as Array<Record<string, unknown>>),
    ];

    if (issues.length > 0) {
        const audit = await db.from("audit_logs").insert({
            action: "landlord_payable_integrity_failed",
            after_data: { issues, landlord_id: landlordId, office_id: officeId },
            company_id: companyId,
            entity_id: landlordId,
            entity_type: "landlord_payables",
        });
        if (audit.error) console.warn(`Unable to write landlord integrity audit: ${audit.error.message}`);
        throw new Error(`Landlord payable integrity check failed: ${issues.map((issue) => issue.message).join(" ")}`);
    }

    await db.from("audit_logs").insert({
        action: "landlord_payable_integrity_passed",
        after_data: { landlord_id: landlordId, office_id: officeId },
        company_id: companyId,
        entity_id: landlordId,
        entity_type: "landlord_payables",
    });
}
