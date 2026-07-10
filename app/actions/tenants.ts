"use server";

import { revalidatePath } from "next/cache";
import { canAccessOffice, requirePermission } from "@/lib/auth/permissions";
import { logUserAction } from "@/lib/auth/audit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { refreshAffectedLandlordPayable } from "@/app/actions/room-rent";
import type { Database } from "@/types/database.types";

type UpdateTenantContactInput = {
    tenantId: string;
    fullName: string;
    phone?: string;
};

type VacateTenantInput = {
    tenantId: string;
    vacateDate: string;
    clearBalance: boolean;
    effectiveDeductionMonth?: string;
    landlordRecoveryAmount?: number;
    landlordRecoveryMode?: "full" | "custom" | "none" | "admin_review";
    reason?: string;
};

type AssignReplacementTenantInput = {
    roomId: string;
    fullName: string;
    phone?: string;
    startDate: string;
};

type LooseSupabase = {
    from: (table: string) => {
        select: (columns: string) => {
            eq: (column: string, value: string) => unknown;
        };
        insert: (values: unknown) => {
            select: (columns: string) => {
                single: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
            };
        };
        update: (values: Record<string, unknown>) => {
            eq: (column: string, value: string) => {
                select?: (columns: string) => {
                    single: () => Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
                };
            };
        };
    };
};

type TenantRow = Database["public"]["Tables"]["tenants"]["Row"];
type LeaseRow = Database["public"]["Tables"]["leases"]["Row"];
type RoomRow = Database["public"]["Tables"]["rooms"]["Row"];
type PropertyRow = Database["public"]["Tables"]["properties"]["Row"];
type LandlordRow = Database["public"]["Tables"]["landlords"]["Row"];
type OfficeRow = Database["public"]["Tables"]["offices"]["Row"];
type AuditJson = Database["public"]["Tables"]["audit_logs"]["Insert"]["after_data"];

export async function updateTenantContact(input: UpdateTenantContactInput) {
    const context = await requirePermission("collections.manage");
    if (!context.activeCompany?.id) throw new Error("Active company is required.");
    const tenantId = input.tenantId.trim();
    const fullName = input.fullName.trim() || "Unnamed Tenant";
    const phone = input.phone?.trim() || null;
    if (!tenantId) throw new Error("Tenant is required.");

    const supabase = await createSupabaseServerClient();
    const { data: existing, error: existingError } = await supabase
        .from("tenants")
        .select("*")
        .eq("id", tenantId)
        .eq("company_id", context.activeCompany.id)
        .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (!existing) throw new Error("Tenant not found.");

    if (!context.canAccessAllOffices && !context.isCompanyAdmin && !canAccessOffice(context, existing.office_id)) {
        throw new Error("You can only edit tenants in your assigned office.");
    }

    const { data, error } = await supabase
        .from("tenants")
        .update({ full_name: fullName, phone })
        .eq("id", existing.id)
        .select("*")
        .single();
    if (error) throw new Error(error.message);

    await logUserAction({
        action: "tenant_contact_updated",
        entityType: "tenant",
        entityId: existing.id,
        beforeData: existing,
        afterData: data,
        companyId: context.activeCompany.id,
        officeId: existing.office_id,
    });

    revalidatePath("/office/collections");
    revalidatePath("/office/properties");
    revalidatePath("/office/admin");
    return data;
}

export async function vacateTenant(input: VacateTenantInput) {
    const context = await requirePermission("collections.manage");
    if (!context.activeCompany?.id) throw new Error("Active company is required.");

    const tenantId = input.tenantId.trim();
    const vacateDate = input.vacateDate?.trim();
    if (!tenantId) throw new Error("Tenant is required.");
    if (!vacateDate) throw new Error("Vacate date is required.");

    const parsedDate = new Date(`${vacateDate}T00:00:00`);
    if (Number.isNaN(parsedDate.getTime())) throw new Error("Enter a valid vacate date.");

    const supabase = await createSupabaseServerClient();
    const adminSupabase = createSupabaseAdminClient();
    const db = adminSupabase as unknown as LooseSupabase;
    const companyId = context.activeCompany.id;
    const userId = context.profile?.id ?? null;

    const { data: tenant, error: tenantError } = await supabase
        .from("tenants")
        .select("*")
        .eq("id", tenantId)
        .eq("company_id", companyId)
        .maybeSingle();
    if (tenantError) throw new Error(tenantError.message);
    if (!tenant) throw new Error("Tenant not found.");

    const { data: activeLease, error: leaseError } = await supabase
        .from("leases")
        .select("*")
        .eq("tenant_id", tenant.id)
        .eq("company_id", companyId)
        .eq("status", "active")
        .maybeSingle();
    if (leaseError) throw new Error(leaseError.message);

    const roomId = activeLease?.room_id ?? tenant.room_id;
    if (!roomId) throw new Error("Tenant is not linked to a room.");

    const { data: room, error: roomError } = await supabase
        .from("rooms")
        .select("*")
        .eq("id", roomId)
        .eq("company_id", companyId)
        .maybeSingle();
    if (roomError) throw new Error(roomError.message);
    if (!room) throw new Error("Room not found.");

    const officeId = activeLease?.office_id ?? room.office_id ?? tenant.office_id;
    if (!officeId || (!context.canAccessAllOffices && !context.isCompanyAdmin && !canAccessOffice(context, officeId))) {
        throw new Error("You can only vacate tenants in your assigned office.");
    }

    const propertyId = activeLease?.property_id ?? room.property_id ?? tenant.property_id;
    const [propertyResult, landlordResult, officeResult] = await Promise.all([
        propertyId
            ? supabase.from("properties").select("*").eq("id", propertyId).eq("company_id", companyId).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        (room.landlord_id || propertyId)
            ? fetchLandlordForRoom({ supabase, companyId, room, propertyId })
            : Promise.resolve({ data: null, error: null }),
        supabase.from("offices").select("*").eq("id", officeId).eq("company_id", companyId).maybeSingle(),
    ]);
    if (propertyResult.error) throw new Error(propertyResult.error.message);
    if (landlordResult.error) throw new Error(landlordResult.error.message);
    if (officeResult.error) throw new Error(officeResult.error.message);

    const property = propertyResult.data as PropertyRow | null;
    const landlord = landlordResult.data as LandlordRow | null;
    const office = officeResult.data as OfficeRow | null;
    const { amount: finalOutstanding, sources: outstandingSources } = await resolveVacateOutstandingBalance({
        supabase,
        tenant,
        room,
        activeLease,
    });
    const frozenDebt = input.clearBalance ? 0 : finalOutstanding;
    let recoveryDecision = resolveLandlordRecoveryDecision({
        effectiveDeductionMonth: input.effectiveDeductionMonth,
        finalOutstanding: frozenDebt,
        mode: input.landlordRecoveryMode,
        reason: input.reason,
        requestedAmount: input.landlordRecoveryAmount,
        vacateDate,
    });
    const now = new Date().toISOString();
    const reason = input.reason?.trim() || null;
    const snapshot = {
        tenant_name: tenant.full_name ?? "Unnamed Tenant",
        tenant_phone: tenant.phone ?? null,
        room_number: room.room_number ?? null,
        property_name: propertyName(property),
        landlord_name: landlord?.full_name ?? null,
        office_name: office?.office_name ?? office?.name ?? null,
    };
    if (recoveryDecision.amount > 0 && landlord?.id) {
        recoveryDecision = {
            ...recoveryDecision,
            effectiveMonth: await resolveRecoveryAppliedMonth({
                companyId,
                db: supabase,
                desiredMonth: recoveryDecision.effectiveMonth,
                landlordId: landlord.id,
                officeId,
            }),
        };
    }

    const { data: exitRecord, error: exitError } = await db
        .from("tenant_exit_records")
        .insert({
            company_id: companyId,
            office_id: officeId,
            tenant_id: tenant.id,
            lease_id: activeLease?.id ?? null,
            room_id: room.id,
            property_id: propertyId ?? null,
            landlord_id: landlord?.id ?? null,
            processed_by: userId,
            ...snapshot,
            vacate_date: vacateDate,
            final_outstanding_balance: frozenDebt,
            cleared_balance: input.clearBalance,
            exit_type: input.clearBalance ? "vacated_cleared" : "vacated_with_debt",
            reason_notes: [
                reason,
                `Landlord recovery method: ${recoveryDecision.method}.`,
                `Landlord recovery amount: UGX ${Math.round(recoveryDecision.amount).toLocaleString("en-UG")}.`,
                `Unrecovered amount: UGX ${Math.round(recoveryDecision.unrecoveredAmount).toLocaleString("en-UG")}.`,
                recoveryDecision.effectiveMonth ? `Effective recovery month: ${recoveryDecision.effectiveMonth}.` : "",
            ].filter(Boolean).join(" "),
        })
        .select("*")
        .single();
    if (exitError) throw new Error(exitError.message);

    let debtRecord: Record<string, unknown> | null = null;
    if (frozenDebt > 0) {
        const { data: debt, error: debtError } = await db
            .from("vacated_tenant_debts")
            .insert({
                company_id: companyId,
                office_id: officeId,
                tenant_exit_record_id: exitRecord!.id,
                tenant_id: tenant.id,
                lease_id: activeLease?.id ?? null,
                room_id: room.id,
                property_id: propertyId ?? null,
                landlord_id: landlord?.id ?? null,
                ...snapshot,
                original_amount: frozenDebt,
                recovered_amount: 0,
                remaining_amount: frozenDebt,
                recovery_status: recoveryDecision.amount > 0 ? recoveryDecision.status : "unassigned",
                notes: [
                    reason ?? `Frozen vacate balance from tenant/room/ledger outstanding: UGX ${Math.round(frozenDebt).toLocaleString("en-UG")}. Room rent: UGX ${Math.round(Number(room.monthly_rent ?? activeLease?.monthly_rent ?? tenant.monthly_rent ?? 0)).toLocaleString("en-UG")}.`,
                    `Landlord recovery method: ${recoveryDecision.method}.`,
                    `Landlord recovery amount: UGX ${Math.round(recoveryDecision.amount).toLocaleString("en-UG")}.`,
                    `Unrecovered amount: UGX ${Math.round(recoveryDecision.unrecoveredAmount).toLocaleString("en-UG")}.`,
                    recoveryDecision.effectiveMonth ? `Effective recovery month: ${recoveryDecision.effectiveMonth}.` : "",
                ].filter(Boolean).join(" "),
                created_by: userId,
            })
            .select("*")
            .single();
        if (debtError) throw new Error(debtError.message);
        debtRecord = debt;

        const { error: deductionError } = await db
            .from("landlord_debt_deductions")
            .insert({
                company_id: companyId,
                office_id: officeId,
                landlord_id: landlord?.id ?? null,
                tenant_id: tenant.id,
                room_id: room.id,
                property_id: propertyId ?? null,
                vacated_tenant_debt_id: debt!.id,
                tenant_name: snapshot.tenant_name,
                room_number: snapshot.room_number,
                property_name: snapshot.property_name,
                landlord_name: snapshot.landlord_name,
                office_name: snapshot.office_name,
                amount: recoveryDecision.amount,
                applied_amount: 0,
                status: recoveryDecision.status,
                vacate_date: vacateDate,
                advance_payment_month: recoveryDecision.effectiveMonth,
                applied_month: recoveryDecision.effectiveMonth,
                deduction_source_id: debt!.id,
                reason: recoveryDecision.reason,
                notes: [
                    recoveryDecision.note,
                    `Original outstanding after final payment: UGX ${Math.round(frozenDebt).toLocaleString("en-UG")}.`,
                    `Unrecovered amount not assigned to landlord: UGX ${Math.round(recoveryDecision.unrecoveredAmount).toLocaleString("en-UG")}.`,
                    `Room rent: UGX ${Math.round(Number(room.monthly_rent ?? activeLease?.monthly_rent ?? tenant.monthly_rent ?? 0)).toLocaleString("en-UG")}.`,
                ].join(" "),
                created_by: userId,
            })
            .select("*")
            .single();
        if (deductionError) throw new Error(deductionError.message);
    }

    if (activeLease) {
        const { error } = await supabase
            .from("leases")
            .update({ status: "terminated", end_date: vacateDate, updated_at: now })
            .eq("id", activeLease.id);
        if (error) throw new Error(error.message);
    }

    const tenantUpdate = await db
        .from("tenants")
        .update({
            status: "vacated",
            balance: frozenDebt,
            room_id: null,
            vacated_at: now,
            vacated_reason: reason,
            vacated_by: userId,
            previous_room_id: room.id,
            updated_at: now,
        })
        .eq("id", tenant.id);
    const updatedTenant = await tenantUpdate.select?.("*").single();
    if (updatedTenant?.error) throw new Error(updatedTenant.error.message);

    const { error: roomUpdateError } = await supabase
        .from("rooms")
        .update({ status: "vacant", outstanding_balance: 0, updated_at: now })
        .eq("id", room.id);
    if (roomUpdateError) throw new Error(roomUpdateError.message);

    const { error: roomHistoryError } = await supabase.from("room_status_history").insert({
        company_id: companyId,
        office_id: officeId,
        room_id: room.id,
        old_status: room.status,
        new_status: "vacant",
        reason: input.clearBalance ? "Tenant vacated with balance cleared." : "Tenant vacated with bad debt frozen.",
        changed_by: userId,
    });
    if (roomHistoryError) throw new Error(roomHistoryError.message);

    let refreshedPayable: Record<string, unknown> | null = null;
    if (landlord?.id) {
        refreshedPayable = await refreshAffectedLandlordPayable(db as unknown as Parameters<typeof refreshAffectedLandlordPayable>[0], {
            companyId,
            landlordId: landlord.id,
            officeId,
            settlementMonth: normalizeMonth(undefined, vacateDate),
            userId,
        }) as Record<string, unknown> | null;
        const searchIndexRefresh = await (adminSupabase as unknown as { rpc?: (name: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }> })
            .rpc?.("ddumba_v1_refresh_landlord_search_index", { p_landlord_id: landlord.id });
        if (searchIndexRefresh?.error) console.warn(`Landlord search index refresh failed after vacate: ${searchIndexRefresh.error.message}`);
    }

    const { error: collectionActionError } = await supabase.from("collection_actions").insert({
        company_id: companyId,
        office_id: officeId,
        tenant_id: tenant.id,
        lease_id: activeLease?.id ?? null,
        action_type: "tenant_vacated",
        outcome: input.clearBalance ? "cleared" : "bad_debt_created",
        notes: reason ?? (input.clearBalance ? "Vacated with balance cleared." : "Vacated without clearing outstanding balance."),
        performed_by: userId,
    });
    if (collectionActionError) throw new Error(collectionActionError.message);

    if (frozenDebt > 0) {
        const { error: ledgerError } = await supabase.from("tenant_ledger_entries").insert({
            company_id: companyId,
            office_id: officeId,
            tenant_id: tenant.id,
            lease_id: activeLease?.id ?? null,
            entry_type: "debit",
            source_type: "tenant_vacate",
            source_id: String(exitRecord!.id),
            amount: frozenDebt,
            balance_after: frozenDebt,
            description: "Vacated tenant debt frozen for landlord recovery. It will not carry to the next tenant.",
        });
        if (ledgerError) throw new Error(ledgerError.message);
    }

    await logUserAction({
        action: input.clearBalance ? "tenant_vacated_balance_cleared" : "tenant_vacated_bad_debt_created",
        entityType: "tenant",
        entityId: tenant.id,
        beforeData: auditJson({ tenant, lease: activeLease, room }),
        afterData: auditJson({ tenant: updatedTenant?.data, exitRecord, debtRecord, refreshedPayable, roomStatus: "vacant", outstandingSources, recoveryDecision }),
        companyId,
        officeId,
    });

    const notificationDb = supabase as unknown as { from: (table: string) => any };
    await notificationDb.from("notifications").insert([
        {
            channel: "in_app",
            company_id: companyId,
            created_at: now,
            delivery_status: "pending",
            is_read: false,
            message: `Room ${room.room_number ?? "Unnumbered"} became vacant after ${tenant.full_name ?? "tenant"} vacated. [vacancy:office:${officeId ?? "company"}:${room.id}:became:${vacateDate}]`,
            office_id: officeId,
            recipient_type: "office",
            title: "Room became vacant",
        },
        {
            channel: "in_app",
            company_id: companyId,
            created_at: now,
            delivery_status: "pending",
            is_read: false,
            message: `Room ${room.room_number ?? "Unnumbered"} became vacant in office ${officeId ?? "Needs review"}. [vacancy:admin:${officeId ?? "company"}:${room.id}:became:${vacateDate}]`,
            office_id: officeId,
            recipient_type: "admin",
            title: "Room became vacant",
        },
    ]).then((result: { error?: { message: string } | null }) => {
        if (result.error) console.warn("Vacancy notification failed:", result.error.message);
    });

    for (const path of [
        "/office/collections",
        "/office/payments",
        "/office/admin/payments",
        "/office/collector/payments",
        "/office/promises",
        "/office/collector/promises",
        "/office/landlords",
        "/office/properties",
        "/office/vacant-rooms",
        "/office/admin/vacant-rooms",
        "/office/collector/vacant-rooms",
        "/office/tenant-relocation",
        "/office/admin/tenant-relocation",
        "/office/collector/tenant-relocation",
        "/office/spreadsheet",
        "/office/admin",
        "/office/reports",
        "/office/ceo",
        "/office/audit",
        "/office/notifications",
    ]) {
        revalidatePath(path);
    }

    return {
        exitRecord,
        debtRecord,
        finalOutstanding: frozenDebt,
        roomStatus: "vacant",
    };
}

async function resolveVacateOutstandingBalance({
    supabase,
    tenant,
    room,
    activeLease,
}: {
    supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
    tenant: TenantRow;
    room: RoomRow;
    activeLease: LeaseRow | null;
}) {
    const { data: latestLedgerEntry, error: ledgerError } = await supabase
        .from("tenant_ledger_entries")
        .select("balance_after, amount, entry_type, source_type, created_at")
        .eq("tenant_id", tenant.id)
        .eq("company_id", tenant.company_id ?? "")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (ledgerError) throw new Error(ledgerError.message);

    const sources = [
        { source: "tenant.balance", amount: Number(tenant.balance ?? 0) },
        { source: "room.outstanding_balance", amount: Number(room.outstanding_balance ?? 0) },
        { source: "latest_ledger.balance_after", amount: Number(latestLedgerEntry?.balance_after ?? 0) },
        { source: "tenant.outstanding_balance_bf", amount: Number((tenant as TenantRow & { outstanding_balance_bf?: number | null }).outstanding_balance_bf ?? 0) },
    ].filter((source) => Number.isFinite(source.amount) && source.amount > 0);

    const amount = sources.reduce((highest, source) => Math.max(highest, source.amount), 0);

    return {
        amount: Math.max(0, amount),
        sources: {
            tenant_balance: Number(tenant.balance ?? 0) || 0,
            room_outstanding_balance: Number(room.outstanding_balance ?? 0) || 0,
            latest_ledger_balance_after: Number(latestLedgerEntry?.balance_after ?? 0) || 0,
            outstanding_balance_bf: Number((tenant as TenantRow & { outstanding_balance_bf?: number | null }).outstanding_balance_bf ?? 0) || 0,
            selected_final_outstanding: Math.max(0, amount),
            room_monthly_rent: Number(room.monthly_rent ?? activeLease?.monthly_rent ?? tenant.monthly_rent ?? 0) || 0,
        },
    };
}

function normalizeMonth(value: string | undefined, fallbackDate: string) {
    const candidate = value?.trim() || fallbackDate;
    const match = candidate.match(/^(\d{4})-(\d{2})/);
    if (!match) throw new Error("Enter a valid recovery month.");
    return `${match[1]}-${match[2]}-01`;
}

function nextMonth(value: string) {
    const date = new Date(`${value}T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + 1);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function resolveLandlordRecoveryDecision({
    effectiveDeductionMonth,
    finalOutstanding,
    mode,
    reason,
    requestedAmount,
    vacateDate,
}: {
    effectiveDeductionMonth?: string;
    finalOutstanding: number;
    mode?: VacateTenantInput["landlordRecoveryMode"];
    reason?: string;
    requestedAmount?: number;
    vacateDate: string;
}) {
    const debt = Math.max(0, Number(finalOutstanding) || 0);
    const recoveryMode = mode ?? (debt > 0 ? "full" : "none");
    const effectiveMonth = normalizeMonth(effectiveDeductionMonth, vacateDate);
    const trimmedReason = reason?.trim() ?? "";
    let amount = 0;
    let status = "no_landlord_recovery";
    let label = "No landlord deduction";

    if (debt <= 0) {
        return {
            amount: 0,
            effectiveMonth,
            method: "none",
            note: "Tenant balance was fully cleared before vacating. No landlord recovery deduction was created.",
            reason: trimmedReason || "Tenant vacated with cleared balance",
            status,
            unrecoveredAmount: 0,
        };
    }

    if (recoveryMode === "full") {
        amount = debt;
        status = "pending";
        label = "Deduct full remaining balance from landlord";
    } else if (recoveryMode === "custom" || recoveryMode === "admin_review") {
        const proposed = Number(requestedAmount ?? 0);
        if (!Number.isFinite(proposed) || proposed < 0) throw new Error("Landlord recovery amount must be zero or greater.");
        if (proposed > debt) throw new Error("Landlord recovery amount cannot exceed the tenant's remaining debt.");
        amount = proposed;
        status = recoveryMode === "admin_review" ? "pending_admin_review" : "pending";
        label = recoveryMode === "admin_review" ? "Admin review required" : "Custom landlord deduction";
        if (amount < debt && !trimmedReason) throw new Error("Reason is required when landlord recovery is lower than the full tenant debt.");
    } else if (recoveryMode === "none") {
        amount = 0;
        status = "no_landlord_recovery";
        label = "Do not deduct from landlord";
        if (!trimmedReason) throw new Error("Reason is required when no landlord deduction is selected.");
    } else {
        throw new Error("Select a valid landlord recovery option.");
    }

    const unrecoveredAmount = Math.max(0, debt - amount);
    return {
        amount,
        effectiveMonth,
        method: recoveryMode,
        note: `${label}. Landlord recovery amount UGX ${Math.round(amount).toLocaleString("en-UG")}; unrecovered amount UGX ${Math.round(unrecoveredAmount).toLocaleString("en-UG")}.`,
        reason: trimmedReason || label,
        status,
        unrecoveredAmount,
    };
}

async function resolveRecoveryAppliedMonth({
    companyId,
    db,
    desiredMonth,
    landlordId,
    officeId,
}: {
    companyId: string;
    db: Awaited<ReturnType<typeof createSupabaseServerClient>>;
    desiredMonth: string;
    landlordId: string;
    officeId: string;
}) {
    const looseDb = db as unknown as { from: (table: string) => any };
    const { data, error } = await looseDb
        .from("landlord_monthly_payables")
        .select("settlement_month, monthly_net_payable, net_payable, total_due, amount_paid, status")
        .eq("company_id", companyId)
        .eq("office_id", officeId)
        .eq("landlord_id", landlordId)
        .eq("settlement_month", desiredMonth)
        .maybeSingle();
    if (error) return desiredMonth;
    if (!data) return desiredMonth;
    const due = Number(data.monthly_net_payable ?? data.net_payable ?? data.total_due ?? 0);
    const paid = Number(data.amount_paid ?? 0);
    const isPaid = String(data.status ?? "").toLowerCase() === "paid" || (due > 0 && paid >= due);
    return isPaid ? nextMonth(desiredMonth) : desiredMonth;
}

export async function assignReplacementTenantToRoom(input: AssignReplacementTenantInput) {
    const context = await requirePermission("collections.manage");
    if (!context.activeCompany?.id) throw new Error("Active company is required.");

    const roomId = input.roomId.trim();
    const fullName = input.fullName.trim() || "Unnamed Tenant";
    const phone = input.phone?.trim() || null;
    const startDate = input.startDate?.trim();
    if (!roomId) throw new Error("Room is required.");
    if (!startDate) throw new Error("Lease start date is required.");
    if (Number.isNaN(new Date(`${startDate}T00:00:00`).getTime())) throw new Error("Enter a valid start date.");

    const supabase = await createSupabaseServerClient();
    const companyId = context.activeCompany.id;
    const userId = context.profile?.id ?? null;
    const now = new Date().toISOString();

    const { data: room, error: roomError } = await supabase
        .from("rooms")
        .select("*")
        .eq("id", roomId)
        .eq("company_id", companyId)
        .maybeSingle();
    if (roomError) throw new Error(roomError.message);
    if (!room) throw new Error("Room not found.");
    if (!room.property_id) throw new Error("Room must be linked to a property before assigning a replacement tenant.");
    const propertyId = room.property_id;

    const officeId = room.office_id;
    if (!officeId || (!context.canAccessAllOffices && !context.isCompanyAdmin && !canAccessOffice(context, officeId))) {
        throw new Error("You can only assign tenants in your assigned office.");
    }

    const { data: activeLease, error: activeLeaseError } = await supabase
        .from("leases")
        .select("*")
        .eq("room_id", room.id)
        .eq("status", "active")
        .maybeSingle();
    if (activeLeaseError) throw new Error(activeLeaseError.message);
    if (activeLease) throw new Error("This room already has an active tenant.");

    const monthlyRent = Number(room.monthly_rent ?? 0);
    const { data: tenant, error: tenantError } = await supabase
        .from("tenants")
        .insert({
            balance: 0,
            company_id: companyId,
            full_name: fullName,
            monthly_rent: monthlyRent,
            office_id: officeId,
            phone,
            property_id: propertyId,
            room_id: room.id,
            status: "active",
            tenant_reliability_score: 75,
            tenant_risk_level: "Low Risk",
            tenant_score_reason: "New replacement tenant starts with clean balance after room vacating workflow.",
            tenant_score_updated_at: now,
        })
        .select("*")
        .single();
    if (tenantError) throw new Error(tenantError.message);

    const { data: lease, error: leaseError } = await supabase
        .from("leases")
        .insert({
            company_id: companyId,
            office_id: officeId,
            property_id: propertyId,
            room_id: room.id,
            tenant_id: tenant.id,
            start_date: startDate,
            monthly_rent: monthlyRent,
            deposit_amount: 0,
            billing_day: 1,
            status: "active",
        })
        .select("*")
        .single();
    if (leaseError) throw new Error(leaseError.message);

    const { data: updatedRoom, error: roomUpdateError } = await supabase
        .from("rooms")
        .update({ status: "occupied", outstanding_balance: 0, updated_at: now })
        .eq("id", room.id)
        .select("*")
        .single();
    if (roomUpdateError) throw new Error(roomUpdateError.message);

    await Promise.all([
        supabase.from("room_status_history").insert({
            company_id: companyId,
            office_id: officeId,
            room_id: room.id,
            old_status: room.status,
            new_status: "occupied",
            reason: "Replacement tenant assigned with clean balance.",
            changed_by: userId,
        }),
    ]);

    await logUserAction({
        action: "replacement_tenant_assigned_clean_balance",
        entityType: "tenant",
        entityId: tenant.id,
        beforeData: auditJson({ room }),
        afterData: auditJson({ tenant, lease, room: updatedRoom }),
        companyId,
        officeId,
    });

    for (const path of ["/office/bad-debt", "/office/collections", "/office/landlords", "/office/properties", "/office/spreadsheet", "/office/audit"]) {
        revalidatePath(path);
    }

    return { tenant, lease, room: updatedRoom };
}

async function fetchLandlordForRoom({
    supabase,
    companyId,
    room,
    propertyId,
}: {
    supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
    companyId: string;
    room: RoomRow;
    propertyId: string | null | undefined;
}) {
    if (room.landlord_id) {
        return supabase.from("landlords").select("*").eq("id", room.landlord_id).eq("company_id", companyId).maybeSingle();
    }

    if (!propertyId) return { data: null, error: null };
    const { data: property, error: propertyError } = await supabase
        .from("properties")
        .select("landlord_id")
        .eq("id", propertyId)
        .eq("company_id", companyId)
        .maybeSingle();
    if (propertyError) return { data: null, error: propertyError };
    if (!property?.landlord_id) return { data: null, error: null };
    return supabase.from("landlords").select("*").eq("id", property.landlord_id).eq("company_id", companyId).maybeSingle();
}

function propertyName(property: PropertyRow | null) {
    return property?.property_name ?? property?.name ?? property?.village ?? property?.address ?? null;
}

function auditJson(value: unknown): AuditJson {
    return JSON.parse(JSON.stringify(value)) as AuditJson;
}
