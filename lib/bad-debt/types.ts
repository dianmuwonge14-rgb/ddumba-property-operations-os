import type { Company, Office } from "@/lib/auth/types";

export type VacatedDebtRegisterRow = {
    id: string;
    company_id: string;
    office_id: string;
    tenant_exit_record_id: string;
    tenant_id: string;
    lease_id: string | null;
    room_id: string | null;
    property_id: string | null;
    landlord_id: string | null;
    tenant_name: string | null;
    tenant_phone: string | null;
    room_number: string | null;
    property_name: string | null;
    landlord_name: string | null;
    office_name: string | null;
    original_amount: number | string;
    recovered_amount: number | string;
    remaining_amount: number | string;
    recovery_status: string;
    notes: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
    room_status: string | null;
    room_outstanding_balance: number;
    has_active_replacement_lease: boolean;
};

export type LandlordDeductionRegisterRow = {
    id: string;
    office_id: string;
    landlord_id: string | null;
    vacated_tenant_debt_id: string;
    settlement_id: string | null;
    tenant_name: string | null;
    room_number: string | null;
    property_name: string | null;
    landlord_name: string | null;
    office_name: string | null;
    amount: number | string;
    applied_amount: number | string;
    status: string;
    notes: string | null;
    created_at: string;
    updated_at: string;
};

export type BadDebtRecoveryData = {
    company: Company | null;
    activeOffice: Office | null;
    canAccessAllOffices: boolean;
    debts: VacatedDebtRegisterRow[];
    deductions: LandlordDeductionRegisterRow[];
    kpis: {
        totalVacatedDebt: number;
        totalRecovered: number;
        remainingRecovery: number;
        pendingDebtors: number;
        roomsReadyForCleanTenant: number;
    };
};
