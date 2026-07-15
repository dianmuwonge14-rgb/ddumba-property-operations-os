"use server";

import { revalidatePath } from "next/cache";
import { logUserAction } from "@/lib/auth/audit";
import { canAccessOffice, hasPermission, requireAuth } from "@/lib/auth/permissions";
import { recordCollectionLedgerAndCash } from "@/lib/collections/payment-ledger";
import { billingAnchorDay, coveragePeriodForMoveIn, monthStart, summarizeMoveInPaymentCoverage } from "@/lib/collections/move-in-allocation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { recalculateTenantScore } from "@/lib/tenants/scoring";
import { refreshAffectedLandlordPayable } from "@/app/actions/room-rent";
import { vacateTenant } from "@/app/actions/tenants";
import { getMoveInPayableDecision, type LandlordPaymentState } from "@/lib/landlords/payable-cutoff";
import type { Database } from "@/types/database.types";

type Json = Database["public"]["Tables"]["audit_logs"]["Insert"]["after_data"];
type DynamicDb = {
    from: (table: string) => any;
};

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

function isMissingCoverageColumnError(error: { message?: string } | null | undefined) {
    return /coverage_start|coverage_end|coverage_index|remaining_credit|source_lease_id|schema cache|Could not find/i.test(error?.message ?? "");
}

async function createMoveInRentCharge(input: {
    actorId: string | null;
    companyId: string;
    leaseId: string;
    landlordId: string | null;
    monthlyRent: number;
    moveInDate: string;
    officeId: string;
    paidAmount: number;
    roomId: string;
    supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
    tenantId: string;
}) {
    const db = input.supabase as unknown as DynamicDb;
    const monthlyRent = Math.max(0, Number(input.monthlyRent));
    const amountPaid = Math.min(monthlyRent, Math.max(0, Number(input.paidAmount)));
    const outstandingAmount = Math.max(0, monthlyRent - amountPaid);
    const period = coveragePeriodForMoveIn(input.moveInDate, 0);
    const now = new Date().toISOString();
    const rentMonthPayload = {
        amount_paid: amountPaid,
        company_id: input.companyId,
        coverage_end: period.coverageEnd,
        coverage_index: 0,
        coverage_start: period.coverageStart,
        due_date: period.coverageStart,
        due_day: billingAnchorDay(input.moveInDate),
        landlord_id: input.landlordId,
        lease_id: input.leaseId,
        office_id: input.officeId,
        outstanding_amount: outstandingAmount,
        rent_amount: monthlyRent,
        rent_month: monthStart(period.coverageStart),
        room_id: input.roomId,
        source: "move_in_first_charge",
        status: outstandingAmount <= 0 ? "paid" : amountPaid > 0 ? "partial" : "unpaid",
        tenant_id: input.tenantId,
        updated_at: now,
    };
    const rentMonthInsert = await db.from("tenant_rent_months").upsert(rentMonthPayload, { onConflict: "company_id,tenant_id,rent_month" });
    if (rentMonthInsert.error) {
        if (!/coverage_start|coverage_end|coverage_index|schema cache|Could not find/i.test(rentMonthInsert.error.message ?? "")) {
            throw new Error(rentMonthInsert.error.message);
        }
        const fallbackInsert = await db.from("tenant_rent_months").upsert({
            ...rentMonthPayload,
            coverage_end: undefined,
            coverage_index: undefined,
            coverage_start: undefined,
        }, { onConflict: "company_id,tenant_id,rent_month" });
        if (fallbackInsert.error && !/does not exist|schema cache|Could not find/i.test(fallbackInsert.error.message ?? "")) {
            throw new Error(fallbackInsert.error.message);
        }
    }

    if (outstandingAmount > 0) {
        const ledgerInsert = await db.from("tenant_balance_ledger").insert({
            amount: outstandingAmount,
            balance_after: outstandingAmount,
            balance_before: 0,
            company_id: input.companyId,
            created_by: input.actorId,
            description: `Move-in rent charged for ${period.coverageStart} to ${period.coverageEnd}.`,
            entry_type: "debit",
            office_id: input.officeId,
            rent_month: monthStart(period.coverageStart),
            room_id: input.roomId,
            source_id: input.leaseId,
            source_type: "move_in_first_charge",
            tenant_id: input.tenantId,
        });
        if (ledgerInsert.error && !/does not exist|schema cache|Could not find/i.test(ledgerInsert.error.message ?? "")) {
            throw new Error(ledgerInsert.error.message);
        }
    }

    return { amountPaid, outstandingAmount, period };
}

async function recordMoveInEntryPayment(input: {
    actorId: string | null;
    companyId: string;
    leaseId: string;
    landlordId: string | null;
    monthlyRent: number;
    moveInDate: string;
    notes?: string | null;
    officeId: string;
    paymentAmount: number;
    paymentDate: string;
    paymentMethod: string;
    propertyId: string | null;
    referenceNumber?: string | null;
    roomId: string;
    tenantId: string;
    tenantName: string | null;
    supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
}) {
    const db = input.supabase as unknown as DynamicDb;
    const coverage = summarizeMoveInPaymentCoverage({
        monthlyRent: input.monthlyRent,
        moveInDate: input.moveInDate,
        paymentAmount: input.paymentAmount,
    });
    const balanceBeforePayment = input.paymentAmount > 0 ? input.monthlyRent : 0;
    const balanceAfterPayment = coverage.firstCoverageOutstanding;
    const paidAt = new Date().toISOString();
    const savedNotes = [
        input.notes?.trim(),
        `New tenant entry payment. Coverage starts ${input.moveInDate}.`,
    ].filter(Boolean).join(" | ");

    const { data: collection, error: collectionError } = await db
        .from("collections")
        .insert({
            allocated_to_next_month: coverage.advanceAmount,
            amount: input.paymentAmount,
            amount_paid: input.paymentAmount,
            balance: balanceAfterPayment,
            balance_after_payment: balanceAfterPayment,
            balance_before_payment: balanceBeforePayment,
            collection_number: collectionNumber(),
            company_id: input.companyId,
            expected_amount: balanceBeforePayment,
            lease_id: input.leaseId,
            notes: savedNotes,
            office_id: input.officeId,
            paid_at: paidAt,
            payment_date: input.paymentDate,
            payment_method: input.paymentMethod,
            payment_source: "tenant",
            payer_name: input.tenantName,
            property_id: input.propertyId,
            recorded_by: input.actorId,
            reference_number: input.referenceNumber ?? null,
            room_id: input.roomId,
            status: "paid",
            tenant_id: input.tenantId,
            type: "rent",
            used_to_clear_outstanding: Math.min(input.paymentAmount, balanceBeforePayment),
        })
        .select("*")
        .single();
    if (collectionError) throw new Error(collectionError.message);

    if (coverage.allocations.length) {
        const allocationRows = coverage.allocations.map((allocation) => ({
            allocation_month: allocation.allocationMonth,
            allocation_source: "move_in_entry_payment",
            allocation_type: allocation.allocationType,
            amount_allocated: allocation.amountAllocated,
            company_id: input.companyId,
            coverage_end: allocation.coverageEnd,
            coverage_index: allocation.coverageIndex,
            coverage_start: allocation.coverageStart,
            is_historical_credit: false,
            office_id: input.officeId,
            payment_id: collection.id,
            remaining_credit: allocation.remainingCredit,
            room_id: input.roomId,
            source_lease_id: input.leaseId,
            tenant_id: input.tenantId,
        }));
        const allocationInsert = await db.from("tenant_rent_allocations").insert(allocationRows);
        if (allocationInsert.error) {
            if (!isMissingCoverageColumnError(allocationInsert.error)) throw new Error(allocationInsert.error.message);
            const fallbackInsert = await db.from("tenant_rent_allocations").insert(allocationRows.map((row) => ({
                allocation_month: row.allocation_month,
                allocation_source: row.allocation_source,
                allocation_type: row.allocation_type,
                amount_allocated: row.amount_allocated,
                company_id: row.company_id,
                is_historical_credit: row.is_historical_credit,
                office_id: row.office_id,
                payment_id: row.payment_id,
                room_id: row.room_id,
                tenant_id: row.tenant_id,
            })));
            if (fallbackInsert.error) throw new Error(fallbackInsert.error.message);
        }
    }

    const firstAllocation = coverage.allocations[0] ?? null;
    if (firstAllocation) {
        const rentMonthPayload = {
            amount_paid: coverage.firstPeriodPaid,
            company_id: input.companyId,
            coverage_end: firstAllocation.coverageEnd,
            coverage_index: firstAllocation.coverageIndex,
            coverage_start: firstAllocation.coverageStart,
            due_date: input.moveInDate,
            due_day: billingAnchorDay(input.moveInDate),
            landlord_id: input.landlordId,
            lease_id: input.leaseId,
            office_id: input.officeId,
            outstanding_amount: balanceAfterPayment,
            rent_amount: input.monthlyRent,
            rent_month: firstAllocation.allocationMonth,
            room_id: input.roomId,
            source: "move_in_entry_payment",
            status: balanceAfterPayment <= 0 ? "paid" : coverage.firstPeriodPaid > 0 ? "partial" : "unpaid",
            tenant_id: input.tenantId,
            updated_at: paidAt,
        };
        const rentMonthInsert = await db.from("tenant_rent_months").upsert(rentMonthPayload, { onConflict: "company_id,tenant_id,rent_month" });
        if (rentMonthInsert.error) {
            if (!/coverage_start|coverage_end|coverage_index|schema cache|Could not find/i.test(rentMonthInsert.error.message ?? "")) {
                throw new Error(rentMonthInsert.error.message);
            }
            const fallbackInsert = await db.from("tenant_rent_months").upsert({
                ...rentMonthPayload,
                coverage_end: undefined,
                coverage_index: undefined,
                coverage_start: undefined,
            }, { onConflict: "company_id,tenant_id,rent_month" });
            if (fallbackInsert.error && !/does not exist|schema cache|Could not find/i.test(fallbackInsert.error.message ?? "")) {
                throw new Error(fallbackInsert.error.message);
            }
        }
    }

    const [tenantUpdate, roomUpdate] = await Promise.all([
        db.from("tenants").update({ balance: balanceAfterPayment, updated_at: paidAt }).eq("id", input.tenantId).eq("company_id", input.companyId),
        db.from("rooms").update({ outstanding_balance: balanceAfterPayment, updated_at: paidAt }).eq("id", input.roomId).eq("company_id", input.companyId),
    ]);
    if (tenantUpdate.error) throw new Error(tenantUpdate.error.message);
    if (roomUpdate.error) throw new Error(roomUpdate.error.message);

    await recordCollectionLedgerAndCash({
        amount: input.paymentAmount,
        balanceAfter: balanceAfterPayment,
        balanceBefore: balanceBeforePayment,
        collectionId: collection.id,
        companyId: input.companyId,
        description: savedNotes,
        leaseId: input.leaseId,
        officeId: input.officeId,
        paidAt,
        recordedBy: input.actorId,
        supabase: input.supabase,
        tenantId: input.tenantId,
    });

    const actionInsert = await db.from("collection_actions").insert({
        action_type: "move_in_entry_payment_recorded",
        company_id: input.companyId,
        lease_id: input.leaseId,
        notes: `${savedNotes} First coverage paid UGX ${Math.round(coverage.firstPeriodPaid).toLocaleString("en-UG")}; advance UGX ${Math.round(coverage.advanceAmount).toLocaleString("en-UG")}; balance after UGX ${Math.round(balanceAfterPayment).toLocaleString("en-UG")}.`,
        office_id: input.officeId,
        outcome: "payment_recorded",
        performed_by: input.actorId,
        tenant_id: input.tenantId,
    });
    if (actionInsert.error) throw new Error(actionInsert.error.message);

    const balanceLedgerInsert = await db.from("tenant_balance_ledger").insert({
        amount: input.paymentAmount,
        balance_after: balanceAfterPayment,
        balance_before: balanceBeforePayment,
        company_id: input.companyId,
        created_by: input.actorId,
        description: `Move-in entry payment allocated from ${input.moveInDate}.`,
        entry_type: "credit",
        office_id: input.officeId,
        rent_month: firstAllocation?.allocationMonth ?? null,
        room_id: input.roomId,
        source_id: collection.id,
        source_type: "move_in_entry_payment",
        tenant_id: input.tenantId,
    });
    if (balanceLedgerInsert.error && !/does not exist|schema cache|Could not find/i.test(balanceLedgerInsert.error.message ?? "")) {
        throw new Error(balanceLedgerInsert.error.message);
    }

    await recalculateTenantScore({
        companyId: input.companyId,
        event: "collection_recorded",
        supabase: input.supabase,
        tenantId: input.tenantId,
    });

    return {
        ...collection,
        allocationSummary: {
            advanceAmount: coverage.advanceAmount,
            allocations: coverage.allocations,
            firstCoverageOutstanding: balanceAfterPayment,
            firstPeriodPaid: coverage.firstPeriodPaid,
            remainingBalance: balanceAfterPayment,
        },
    };
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

    const billingDay = billingAnchorDay(moveInDate);
    const openingBalance = Math.max(0, monthlyRent - paymentMade);
    const tenantPayload = {
        balance: openingBalance,
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
            outstanding_balance: openingBalance,
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

    let entryPayment: Awaited<ReturnType<typeof recordMoveInEntryPayment>> | null = null;
    if (paymentMade > 0) {
        entryPayment = await recordMoveInEntryPayment({
            actorId,
            companyId,
            leaseId: newLease.id,
            landlordId: roomBefore.landlord_id ?? null,
            monthlyRent,
            moveInDate,
            notes: input.notes ?? "New tenant entry payment",
            officeId,
            paymentAmount: paymentMade,
            paymentDate,
            paymentMethod: input.paymentMethod ?? "cash",
            propertyId,
            referenceNumber: input.referenceNumber ?? null,
            roomId,
            supabase,
            tenantId: newTenant.id,
            tenantName: newTenant.full_name ?? newTenantName,
        });
    } else {
        await createMoveInRentCharge({
            actorId,
            companyId,
            leaseId: newLease.id,
            landlordId: roomBefore.landlord_id ?? null,
            monthlyRent,
            moveInDate,
            officeId,
            paidAmount: 0,
            roomId,
            supabase,
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

    if (balanceDemanded < monthlyRent) {
        throw new Error("Balance demanded must include at least the first full monthly rent from the move-in date.");
    }
    const openingBalance = Math.max(0, monthlyRent - moneyCollected);
    const billingDay = billingAnchorDay(moveInDate);
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
        collection = await recordMoveInEntryPayment({
            actorId,
            companyId,
            leaseId: lease.id,
            landlordId: room.landlord_id ?? null,
            monthlyRent,
            moveInDate,
            notes: input.notes || "Move-in entry payment",
            officeId: room.office_id,
            paymentAmount: moneyCollected,
            paymentDate: moveInDate,
            paymentMethod: input.paymentMethod ?? "cash",
            propertyId,
            referenceNumber: input.referenceNumber || null,
            roomId: room.id,
            supabase,
            tenantId: tenant.id,
            tenantName: tenant.full_name ?? tenantName,
        });
    } else {
        await createMoveInRentCharge({
            actorId,
            companyId,
            leaseId: lease.id,
            landlordId: room.landlord_id ?? null,
            monthlyRent,
            moveInDate,
            officeId: room.office_id,
            paidAmount: 0,
            roomId: room.id,
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
