"use server";

import { revalidatePath } from "next/cache";
import { logUserAction } from "@/lib/auth/audit";
import { canAccessOffice, hasPermission, requireAuth } from "@/lib/auth/permissions";
import { recordCollectionLedgerAndCash } from "@/lib/collections/payment-ledger";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { recalculateTenantScore } from "@/lib/tenants/scoring";
import { recordCollection } from "@/app/actions/collections";
import { refreshAffectedLandlordPayable } from "@/app/actions/room-rent";
import { vacateTenant } from "@/app/actions/tenants";
import { getMoveInPayableDecision, type LandlordPaymentState } from "@/lib/landlords/payable-cutoff";
import type { Database } from "@/types/database.types";

type Json = Database["public"]["Tables"]["audit_logs"]["Insert"]["after_data"];

export type MarkRoomOccupiedInput = {
    roomId: string;
    tenantName: string;
    tenantPhone: string;
    nationalId?: string | null;
    moveInDate: string;
    monthlyRent: number;
    moneyCollected: number;
    balanceDemanded: number;
    paymentMethod?: string;
    referenceNumber?: string | null;
    notes?: string | null;
};

export type ReplaceTenantFromPaymentsInput = {
    roomId: string;
    currentTenantId: string;
    newTenantName: string;
    newTenantPhone?: string | null;
    nationalId?: string | null;
    moveInDate: string;
    monthlyRent: number;
    paymentMade?: number;
    paymentDate: string;
    paymentMethod?: string;
    referenceNumber?: string | null;
    notes?: string | null;
};

function jsonSafe(value: unknown): Json {
    return JSON.parse(JSON.stringify(value ?? null)) as Json;
}

function assertAmount(value: number, label: string, allowZero = true) {
    if (!Number.isFinite(value) || value < 0 || (!allowZero && value <= 0)) {
        throw new Error(`${label} must be ${allowZero ? "zero or greater" : "greater than zero"}.`);
    }
}

function assertDate(value: string) {
    if (!value || Number.isNaN(Date.parse(`${value}T00:00:00`))) {
        throw new Error("Move-in date is required.");
    }
    return value.slice(0, 10);
}

function collectionNumber() {
    return `MOVEIN-${Date.now()}`;
}

async function getLandlordPaymentState(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, input: {
    companyId: string;
    landlordId: string | null;
    officeId: string | null;
    settlementMonth: string;
}): Promise<LandlordPaymentState | null> {
    if (!input.landlordId || !input.officeId) return null;
    const db = supabase as unknown as { from: (table: string) => any };
    const { data, error } = await db
        .from("landlord_monthly_payables")
        .select("amount_paid,last_paid_at,status")
        .eq("company_id", input.companyId)
        .eq("office_id", input.officeId)
        .eq("landlord_id", input.landlordId)
        .eq("settlement_month", input.settlementMonth)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return {
        amountPaid: data.amount_paid,
        lastPaidAt: data.last_paid_at,
        status: data.status,
    };
}

function settlementMonthFromDate(value: string) {
    return `${value.slice(0, 7)}-01`;
}

export async function replaceTenantFromPaymentsEntry(input: ReplaceTenantFromPaymentsInput) {
    const context = await requireAuth();
    const canManage =
        hasPermission(context, "properties.manage") ||
        hasPermission(context, "collections.manage") ||
        hasPermission(context, "landlords.manage");
    if (!canManage) throw new Error("You do not have permission to replace tenants.");
    if (!context.activeCompany?.id) throw new Error("Active company is required.");

    const roomId = input.roomId.trim();
    const currentTenantId = input.currentTenantId.trim();
    const newTenantName = input.newTenantName.trim();
    const moveInDate = assertDate(input.moveInDate);
    const paymentDate = assertDate(input.paymentDate);
    const monthlyRent = Number(input.monthlyRent);
    const paymentMade = Number(input.paymentMade ?? 0);

    if (!roomId) throw new Error("Room is required.");
    if (!currentTenantId) throw new Error("Current tenant is required.");
    if (!newTenantName) throw new Error("New tenant name is required.");
    assertAmount(monthlyRent, "Monthly rent", false);
    assertAmount(paymentMade, "Payment made");

    const supabase = await createSupabaseServerClient();
    const companyId = context.activeCompany.id;
    const actorId = context.profile?.id ?? context.authUser?.id ?? null;
    const now = new Date().toISOString();

    const { data: roomBefore, error: roomBeforeError } = await supabase
        .from("rooms")
        .select("*")
        .eq("id", roomId)
        .eq("company_id", companyId)
        .maybeSingle();
    if (roomBeforeError) throw new Error(roomBeforeError.message);
    if (!roomBefore) throw new Error("Room not found.");

    const { data: oldTenant, error: oldTenantError } = await supabase
        .from("tenants")
        .select("*")
        .eq("id", currentTenantId)
        .eq("company_id", companyId)
        .maybeSingle();
    if (oldTenantError) throw new Error(oldTenantError.message);
    if (!oldTenant) throw new Error("Current tenant not found.");

    const { data: oldLease } = await supabase
        .from("leases")
        .select("*")
        .eq("company_id", companyId)
        .eq("tenant_id", currentTenantId)
        .eq("status", "active")
        .maybeSingle();

    const officeId = oldLease?.office_id ?? roomBefore.office_id ?? oldTenant.office_id;
    if (!officeId || !canAccessOffice(context, officeId)) {
        throw new Error("You can only replace tenants in your assigned office.");
    }
    const propertyId = oldLease?.property_id ?? roomBefore.property_id ?? oldTenant.property_id;
    if (!propertyId) throw new Error("Room must be linked to a property/location before tenant replacement.");

    const vacateResult = await vacateTenant({
        clearBalance: false,
        reason: input.notes?.trim() || "Tenant replaced from Payments Entry with outstanding balance frozen for landlord recovery.",
        tenantId: currentTenantId,
        vacateDate: moveInDate,
    });

    const billingDay = new Date(`${moveInDate}T00:00:00`).getDate();
    const tenantPayload = {
        balance: 0,
        company_id: companyId,
        full_name: newTenantName,
        monthly_rent: monthlyRent,
        national_id: input.nationalId?.trim() || null,
        office_id: officeId,
        phone: input.newTenantPhone?.trim() || null,
        property_id: propertyId,
        room_id: roomId,
        status: "active",
        tenant_reliability_score: 75,
        tenant_risk_level: "Low Risk",
        tenant_score_reason: "Tenant replaced directly from Payments Entry.",
        tenant_score_updated_at: now,
        tenant_type: "residential",
        created_at: now,
        updated_at: now,
    };

    const { data: newTenant, error: newTenantError } = await supabase
        .from("tenants")
        .insert(tenantPayload)
        .select("*")
        .single();
    if (newTenantError) throw new Error(newTenantError.message);

    const { data: newLease, error: newLeaseError } = await supabase
        .from("leases")
        .insert({
            billing_day: billingDay,
            company_id: companyId,
            monthly_rent: monthlyRent,
            office_id: officeId,
            property_id: propertyId,
            room_id: roomId,
            start_date: moveInDate,
            status: "active",
            tenant_id: newTenant.id,
        })
        .select("*")
        .single();
    if (newLeaseError) throw new Error(newLeaseError.message);

    const roomDb = supabase as unknown as { from: (table: string) => any };
    const { data: updatedRoom, error: roomUpdateError } = await roomDb
        .from("rooms")
        .update({
            effective_start_date: moveInDate,
            explicitly_payable: false,
            monthly_rent: monthlyRent,
            outstanding_balance: 0,
            payable_notes: "Tenant replaced from Payments Entry. Old tenant debt is handled through landlord recovery.",
            status: "occupied",
            updated_at: now,
        })
        .eq("id", roomId)
        .eq("company_id", companyId)
        .select("*")
        .single();
    if (roomUpdateError) throw new Error(roomUpdateError.message);

    const settlementMonth = settlementMonthFromDate(moveInDate);
    const landlordPaymentState = await getLandlordPaymentState(supabase, {
        companyId,
        landlordId: roomBefore.landlord_id,
        officeId,
        settlementMonth,
    });
    const moveInPayableDecision = getMoveInPayableDecision({
        landlordPayment: landlordPaymentState,
        leaseStartDate: moveInDate,
        room: updatedRoom,
        settlementMonth,
        tenantActive: true,
    });
    const refreshedPayable = await refreshAffectedLandlordPayable(roomDb, {
        companyId,
        landlordId: roomBefore.landlord_id,
        officeId,
        settlementMonth,
        userId: actorId,
    });

    await supabase.from("room_status_history").insert({
        changed_by: actorId,
        company_id: companyId,
        new_status: "occupied",
        office_id: officeId,
        old_status: "vacant",
        reason: "New tenant replaced vacated tenant from Payments Entry.",
        room_id: roomId,
    });

    await supabase.from("collection_actions").insert({
        action_type: "tenant_replaced",
        company_id: companyId,
        lease_id: newLease.id,
        notes: `Old tenant ${oldTenant.full_name ?? "Unnamed tenant"} vacated with debt UGX ${Math.round(vacateResult.finalOutstanding).toLocaleString("en-UG")}; new tenant ${newTenant.full_name ?? newTenantName} started with UGX 0 outstanding. Landlord payable rule: ${moveInPayableDecision.reason}; included ${moveInPayableDecision.includedPayableAmount}; company extra profit ${moveInPayableDecision.companyExtraProfitAmount}. ${input.notes ?? ""}`.trim(),
        office_id: officeId,
        outcome: "new_tenant_added",
        performed_by: actorId,
        tenant_id: newTenant.id,
    });

    let entryPayment: Awaited<ReturnType<typeof recordCollection>> | null = null;
    if (paymentMade > 0) {
        entryPayment = await recordCollection({
            amount: paymentMade,
            notes: input.notes ?? "New tenant entry payment",
            paymentDate,
            paymentKind: "tenant_normal",
            paymentMethod: input.paymentMethod ?? "cash",
            paymentSource: "tenant",
            referenceNumber: input.referenceNumber ?? undefined,
            tenantId: newTenant.id,
        });
    }

    await logUserAction({
        action: "tenant_replaced_from_payments_entry",
        entityType: "room",
        entityId: roomId,
        companyId,
        officeId,
        beforeData: jsonSafe({ room: roomBefore, oldTenant, oldLease }),
        afterData: jsonSafe({
            debtAmount: vacateResult.finalOutstanding,
            entryPayment,
            newLease,
            newTenant,
            room: updatedRoom,
            vacateResult,
            landlordPayableCutoff: moveInPayableDecision,
            refreshedPayable,
        }),
    });

    for (const path of ["/office/payments", "/office/admin/payments", "/office/collections", "/office/landlords", "/office/landlord-payments", "/office/bad-debt", "/office/vacant-rooms", "/office/admin/vacant-rooms", "/office/admin", "/office/dashboard", "/office/audit"]) {
        revalidatePath(path);
    }

    return {
        debtAmount: vacateResult.finalOutstanding,
        entryPayment,
        lease: newLease,
        newTenant,
        room: updatedRoom,
        vacateResult,
    };
}

export async function markRoomOccupied(input: MarkRoomOccupiedInput) {
    const context = await requireAuth();
    const canManage =
        hasPermission(context, "properties.manage") ||
        hasPermission(context, "collections.manage") ||
        hasPermission(context, "landlords.manage");
    if (!canManage) throw new Error("You do not have permission to mark rooms occupied.");
    if (!context.activeCompany?.id) throw new Error("Active company is required.");

    const tenantName = input.tenantName.trim();
    if (!tenantName) throw new Error("Tenant name is required.");
    const moveInDate = assertDate(input.moveInDate);
    const monthlyRent = Number(input.monthlyRent);
    const moneyCollected = Number(input.moneyCollected);
    const balanceDemanded = Number(input.balanceDemanded);
    assertAmount(monthlyRent, "Monthly rent", false);
    assertAmount(moneyCollected, "Money collected");
    assertAmount(balanceDemanded, "Balance demanded");
    if (moneyCollected > balanceDemanded) {
        throw new Error("Money collected cannot be greater than balance demanded.");
    }

    const supabase = await createSupabaseServerClient();
    const companyId = context.activeCompany.id;
    const actorId = context.profile?.id ?? context.authUser?.id ?? null;
    const now = new Date().toISOString();

    const { data: room, error: roomError } = await supabase
        .from("rooms")
        .select("*")
        .eq("id", input.roomId)
        .eq("company_id", companyId)
        .maybeSingle();
    if (roomError) throw new Error(roomError.message);
    if (!room) throw new Error("Room not found.");
    if (!canAccessOffice(context, room.office_id)) throw new Error("You cannot manage this office room.");

    const currentStatus = String(room.status ?? "").toLowerCase();
    if (currentStatus !== "vacant") {
        throw new Error("Only vacant rooms can be marked occupied from this workflow.");
    }

    const propertyId = room.property_id;
    if (!propertyId) throw new Error("Room must be linked to a property/location before occupancy.");
    if (!room.office_id) throw new Error("Room must be linked to an office before occupancy.");

    const openingBalance = Math.max(0, balanceDemanded - moneyCollected);
    const billingDay = new Date(`${moveInDate}T00:00:00`).getDate();
    const tenantPayload = {
        balance: openingBalance,
        company_id: companyId,
        full_name: tenantName,
        monthly_rent: monthlyRent,
        national_id: input.nationalId?.trim() || null,
        office_id: room.office_id,
        phone: input.tenantPhone.trim() || null,
        property_id: propertyId,
        room_id: room.id,
        status: "active",
        tenant_reliability_score: 75,
        tenant_risk_level: "Low Risk",
        tenant_score_reason: "Tenant moved into vacant room.",
        tenant_score_updated_at: now,
        tenant_type: "residential",
        updated_at: now,
    };

    const { data: tenant, error: tenantError } = await supabase
        .from("tenants")
        .insert({ ...tenantPayload, created_at: now })
        .select("*")
        .single();
    if (tenantError) throw new Error(tenantError.message);

    const { data: lease, error: leaseError } = await supabase
        .from("leases")
        .insert({
            billing_day: billingDay,
            company_id: companyId,
            monthly_rent: monthlyRent,
            office_id: room.office_id,
            property_id: propertyId,
            room_id: room.id,
            start_date: moveInDate,
            status: "active",
            tenant_id: tenant.id,
        })
        .select("*")
        .single();
    if (leaseError) throw new Error(leaseError.message);

    const roomDb = supabase as unknown as { from: (table: string) => any };
    const { data: updatedRoom, error: roomUpdateError } = await roomDb
        .from("rooms")
        .update({
            effective_start_date: moveInDate,
            explicitly_payable: false,
            monthly_rent: monthlyRent,
            outstanding_balance: openingBalance,
            payable_notes: "Occupied through room action workflow.",
            status: "occupied",
            updated_at: now,
        })
        .eq("id", room.id)
        .eq("company_id", companyId)
        .select("*")
        .single();
    if (roomUpdateError) throw new Error(roomUpdateError.message);

    const settlementMonth = settlementMonthFromDate(moveInDate);
    const landlordPaymentState = await getLandlordPaymentState(supabase, {
        companyId,
        landlordId: room.landlord_id,
        officeId: room.office_id,
        settlementMonth,
    });
    const moveInPayableDecision = getMoveInPayableDecision({
        landlordPayment: landlordPaymentState,
        leaseStartDate: moveInDate,
        room: updatedRoom,
        settlementMonth,
        tenantActive: true,
    });
    const refreshedPayable = await refreshAffectedLandlordPayable(roomDb, {
        companyId,
        landlordId: room.landlord_id,
        officeId: room.office_id,
        settlementMonth,
        userId: actorId,
    });

    let collection: Record<string, unknown> | null = null;
    if (moneyCollected > 0) {
        const { data, error } = await supabase
            .from("collections")
            .insert({
                amount: moneyCollected,
                amount_paid: moneyCollected,
                balance: openingBalance,
                collection_number: collectionNumber(),
                company_id: companyId,
                expected_amount: balanceDemanded,
                lease_id: lease.id,
                notes: input.notes || "Move-in entry payment",
                office_id: room.office_id,
                paid_at: now,
                payment_date: moveInDate,
                payment_method: input.paymentMethod ?? "cash",
                property_id: propertyId,
                recorded_by: actorId,
                reference_number: input.referenceNumber || null,
                room_id: room.id,
                status: "paid",
                tenant_id: tenant.id,
                type: "move_in",
            })
            .select("*")
            .single();
        if (error) throw new Error(error.message);
        collection = data;

        await recordCollectionLedgerAndCash({
            amount: moneyCollected,
            balanceAfter: openingBalance,
            balanceBefore: balanceDemanded,
            collectionId: data.id,
            companyId,
            description: input.notes || "Move-in entry payment",
            leaseId: lease.id,
            officeId: room.office_id,
            recordedBy: actorId,
            supabase,
            tenantId: tenant.id,
        });
    }

    await supabase.from("collection_actions").insert({
        action_type: "visit",
        company_id: companyId,
        lease_id: lease.id,
        notes: `Room marked occupied. Balance demanded ${balanceDemanded}; collected ${moneyCollected}; outstanding ${openingBalance}. Landlord payable rule: ${moveInPayableDecision.reason}; included ${moveInPayableDecision.includedPayableAmount}; company extra profit ${moveInPayableDecision.companyExtraProfitAmount}. ${input.notes ?? ""}`.trim(),
        office_id: room.office_id,
        outcome: "room_occupied",
        performed_by: actorId,
        tenant_id: tenant.id,
    });

    await recalculateTenantScore({
        supabase,
        companyId,
        tenantId: tenant.id,
        event: moneyCollected > 0 ? "collection_recorded" : "balance_changed",
    });

    await logUserAction({
        action: "room_marked_occupied",
        entityType: "room",
        entityId: room.id,
        companyId,
        officeId: room.office_id,
        beforeData: jsonSafe(room),
        afterData: jsonSafe({
            room: updatedRoom,
            landlord_id: room.landlord_id,
            old_status: room.status,
            new_status: "occupied",
            tenant,
            lease,
            collection,
            landlordPayableCutoff: moveInPayableDecision,
            refreshedPayable,
            money_collected: moneyCollected,
            balance_demanded: balanceDemanded,
            opening_balance: openingBalance,
            user: actorId,
            timestamp: now,
        }),
    });

    const notificationDb = supabase as unknown as { from: (table: string) => any };
    await notificationDb.from("notifications").insert([
        {
            channel: "in_app",
            company_id: companyId,
            created_at: now,
            delivery_status: "pending",
            is_read: false,
            message: `Room ${room.room_number ?? "Unnumbered"} has been occupied by ${tenant.full_name ?? tenantName}. [vacancy:office:${room.office_id ?? "company"}:${room.id}:occupied:${moveInDate}]`,
            office_id: room.office_id,
            recipient_type: "office",
            title: "Vacant room occupied",
        },
        {
            channel: "in_app",
            company_id: companyId,
            created_at: now,
            delivery_status: "pending",
            is_read: false,
            message: `Room ${room.room_number ?? "Unnumbered"} in office ${room.office_id ?? "Needs review"} has been occupied. [vacancy:admin:${room.office_id ?? "company"}:${room.id}:occupied:${moveInDate}]`,
            office_id: room.office_id,
            recipient_type: "admin",
            title: "Vacant room occupied",
        },
    ]).then((result: { error?: { message: string } | null }) => {
        if (result.error) console.warn("Vacancy occupied notification failed:", result.error.message);
    });

    for (const path of ["/office/landlords", "/office/properties", "/office/vacant-rooms", "/office/admin/vacant-rooms", "/office/defaulters", "/office/admin/defaulters", "/office/collections", "/office/spreadsheet", "/office/dashboard", "/office/admin", "/office/ceo", "/office/excellence", "/office/audit"]) {
        revalidatePath(path);
    }

    return { room: updatedRoom, tenant, lease, collection, openingBalance };
}
