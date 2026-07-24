export type SecurityDepositStatus =
    | "held"
    | "partially_used_by_company"
    | "fully_used_by_company"
    | "refund_pending"
    | "refunded"
    | "retained"
    | "partially_refunded"
    | "applied_to_tenant_charges";

export type SecurityDepositRegisterRow = {
    id: string;
    company_id: string;
    office_id: string | null;
    tenant_id: string | null;
    room_id: string | null;
    landlord_id: string | null;
    lease_id: string | null;
    amount: number | string;
    amount_refunded: number | string;
    amount_retained: number | string;
    amount_applied_to_charges: number | string;
    amount_used_by_company: number | string;
    amount_restored_by_company: number | string;
    liability_balance: number | string;
    cash_available: number | string;
    company_shortfall: number | string;
    date_received: string;
    payment_method: string | null;
    reference_number: string | null;
    receipt_number: string;
    status: SecurityDepositStatus | string;
    recorded_by: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
    tenant?: { full_name: string | null; phone: string | null } | null;
    room?: { room_number: string | null } | null;
    landlord?: { full_name: string | null } | null;
    office?: { office_name: string | null; name: string | null } | null;
};

export type SecurityDepositSummary = {
    totalHeld: number;
    totalAvailable: number;
    totalUsedByCompany: number;
    totalRefunded: number;
    totalRetained: number;
    totalPendingSettlement: number;
    totalShortfall: number;
    totalRecords: number;
};

export type SecurityDepositPageData = {
    isAdmin: boolean;
    activeOfficeId: string | null;
    deposits: SecurityDepositRegisterRow[];
    summary: SecurityDepositSummary;
    warnings: string[];
};
