import { cache } from "react";
import { requirePermission } from "@/lib/auth/permissions";
import { getScopedSupabase } from "@/lib/auth/query";
import type { Database } from "@/types/database.types";
import type { BadDebtRecoveryData, LandlordDeductionRegisterRow, VacatedDebtRegisterRow } from "./types";

type RoomRow = Database["public"]["Tables"]["rooms"]["Row"];
type LeaseRow = Database["public"]["Tables"]["leases"]["Row"];

function money(value: number | string | null | undefined) {
    return Number(value ?? 0) || 0;
}

export const getBadDebtRecoveryData = cache(async function getBadDebtRecoveryData(): Promise<BadDebtRecoveryData> {
    const context = await requirePermission("collections.view");
    const { supabase } = await getScopedSupabase();
    const companyId = context.activeCompany?.id;
    const activeOfficeId = context.activeOffice?.id;

    if (!companyId || (!context.canAccessAllOffices && !activeOfficeId)) {
        return emptyData();
    }

    const scoped = !context.canAccessAllOffices && activeOfficeId;
    const loose = supabase as unknown as { from: (table: string) => any };
    let debtsQuery = loose
        .from("vacated_tenant_debts")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
    let deductionsQuery = loose
        .from("landlord_debt_deductions")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });

    if (scoped) {
        debtsQuery = debtsQuery.eq("office_id", activeOfficeId);
        deductionsQuery = deductionsQuery.eq("office_id", activeOfficeId);
    }

    const [debtsResult, deductionsResult] = await Promise.all([debtsQuery, deductionsQuery]);
    if (debtsResult.error) throw new Error(debtsResult.error.message);
    if (deductionsResult.error) throw new Error(deductionsResult.error.message);

    const rawDebts = (debtsResult.data ?? []) as VacatedDebtRegisterRow[];
    const deductions = (deductionsResult.data ?? []) as LandlordDeductionRegisterRow[];
    const roomIds = [...new Set(rawDebts.map((debt) => debt.room_id).filter((id): id is string => Boolean(id)))];

    const [roomsResult, leasesResult] = roomIds.length
        ? await Promise.all([
            supabase.from("rooms").select("*").in("id", roomIds),
            supabase.from("leases").select("*").in("room_id", roomIds).eq("status", "active"),
        ])
        : [{ data: [] as RoomRow[], error: null }, { data: [] as LeaseRow[], error: null }];
    if (roomsResult.error) throw new Error(roomsResult.error.message);
    if (leasesResult.error) throw new Error(leasesResult.error.message);

    const roomById = new Map((roomsResult.data ?? []).map((room) => [room.id, room]));
    const activeLeaseRoomIds = new Set((leasesResult.data ?? []).map((lease) => lease.room_id));
    const debts = rawDebts.map((debt) => {
        const room = debt.room_id ? roomById.get(debt.room_id) : null;
        return {
            ...debt,
            room_status: room?.status ?? null,
            room_outstanding_balance: money(room?.outstanding_balance),
            has_active_replacement_lease: debt.room_id ? activeLeaseRoomIds.has(debt.room_id) : false,
        };
    });

    return {
        company: context.activeCompany,
        activeOffice: context.activeOffice,
        canAccessAllOffices: context.canAccessAllOffices,
        debts,
        deductions,
        kpis: {
            totalVacatedDebt: debts.reduce((total, debt) => total + money(debt.original_amount), 0),
            totalRecovered: debts.reduce((total, debt) => total + money(debt.recovered_amount), 0),
            remainingRecovery: debts.reduce((total, debt) => total + money(debt.remaining_amount), 0),
            pendingDebtors: debts.filter((debt) => money(debt.remaining_amount) > 0).length,
            roomsReadyForCleanTenant: debts.filter((debt) => debt.room_id && !debt.has_active_replacement_lease && money(debt.room_outstanding_balance) === 0).length,
        },
    };
});

function emptyData(): BadDebtRecoveryData {
    return {
        company: null,
        activeOffice: null,
        canAccessAllOffices: false,
        debts: [],
        deductions: [],
        kpis: {
            totalVacatedDebt: 0,
            totalRecovered: 0,
            remainingRecovery: 0,
            pendingDebtors: 0,
            roomsReadyForCleanTenant: 0,
        },
    };
}
