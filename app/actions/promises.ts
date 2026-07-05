"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/permissions";
import { logUserAction } from "@/lib/auth/audit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantCollectionContext } from "@/lib/collections/data";
import { recordCollectionLedgerAndCash } from "@/lib/collections/payment-ledger";
import { getPromiseInActiveOffice, getPromiseTenantWriteContext } from "@/lib/promises/data";
import { recalculateTenantScore } from "@/lib/tenants/scoring";
import type {
    CreatePromiseInput,
    EditPromiseInput,
    PromiseFollowupInput,
    PromiseStateInput,
    ReschedulePromiseInput,
} from "@/lib/promises/types";

function assertAmount(amount: number) {
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Promise amount must be greater than zero.");
    }
}

function assertDate(value: string) {
    if (!value || Number.isNaN(Date.parse(value))) {
        throw new Error("Promise date is required.");
    }
}

function collectionNumber() {
    return `COL-${Date.now()}`;
}

function revalidatePromiseWorkflow() {
    revalidatePath("/office/promises");
    revalidatePath("/office/collections");
    revalidatePath("/office");
    revalidatePath("/office/dashboard");
    revalidatePath("/office/ceo");
    revalidatePath("/office/excellence");
    revalidatePath("/office/ai");
    revalidatePath("/office/automation");
    revalidatePath("/office/audit");
}

async function activeWriteContext() {
    const context = await requirePermission("collections.manage");
    if (!context.activeCompany?.id || !context.activeOffice?.id) {
        throw new Error("Active company and office are required.");
    }
    return context;
}

async function addPromiseFollowup(promiseId: string, actionType: string, outcome?: string, notes?: string) {
    const context = await activeWriteContext();
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
        .from("promise_followups")
        .insert({
            action_type: actionType,
            company_id: context.activeCompany!.id,
            notes: notes || null,
            outcome: outcome || null,
            performed_by: context.profile?.id ?? null,
            promise_id: promiseId,
        })
        .select("*")
        .single();

    if (error) {
        throw new Error(error.message);
    }

    return data;
}

async function addCollectionActionForPromise(promise: { tenant_id: string | null; lease_id: string | null; office_id: string | null }, actionType: string, outcome?: string, notes?: string) {
    const context = await activeWriteContext();
    if (!promise.tenant_id || !promise.office_id) return;
    const supabase = await createSupabaseServerClient();

    await supabase.from("collection_actions").insert({
        action_type: actionType,
        company_id: context.activeCompany!.id,
        lease_id: promise.lease_id,
        notes: notes || null,
        office_id: promise.office_id,
        outcome: outcome || null,
        performed_by: context.profile?.id ?? null,
        tenant_id: promise.tenant_id,
    });
}

export async function createPromise(input: CreatePromiseInput) {
    const context = await activeWriteContext();
    const tenantContext = await getPromiseTenantWriteContext(input.tenantId);
    const tenant = tenantContext.tenant;
    const amount = Number(input.promisedAmount);
    assertAmount(amount);
    assertDate(input.promisedDate);
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
        .from("promises")
        .insert({
            amount,
            company_id: context.activeCompany!.id,
            created_by: context.profile?.id ?? null,
            lease_id: tenantContext.lease?.id ?? null,
            notes: input.notes || null,
            office_id: tenantContext.officeId,
            promise_date: input.promisedDate,
            promised_amount: amount,
            promised_date: input.promisedDate,
            room_id: tenant.room_id ?? tenantContext.room?.id ?? null,
            status: "open",
            tenant_id: tenant.id,
        })
        .select("*")
        .single();

    if (error) throw new Error(error.message);

    await addPromiseFollowup(data.id, "created", "Promise created", input.notes);
    await addCollectionActionForPromise(data, "promise_created", "Promise created", input.notes);
    await recalculateTenantScore({
        supabase,
        companyId: context.activeCompany!.id,
        tenantId: tenant.id,
        event: "promise_created",
    });
    await logUserAction({
        action: "promise_created",
        entityType: "promise",
        entityId: data.id,
        companyId: context.activeCompany!.id,
        officeId: tenantContext.officeId,
        afterData: data,
    });

    revalidatePromiseWorkflow();
    return data;
}

export async function editPromise(input: EditPromiseInput) {
    const context = await activeWriteContext();
    const existing = await getPromiseInActiveOffice(input.promiseId);
    const amount = Number(input.promisedAmount);
    assertAmount(amount);
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
        .from("promises")
        .update({
            amount,
            notes: input.notes || existing.notes,
            promised_amount: amount,
            promised_date: input.promisedDate,
            promise_date: input.promisedDate,
            status: existing.status === "broken" || existing.status === "fulfilled" ? existing.status : "open",
        })
        .eq("id", existing.id)
        .select("*")
        .single();

    if (error) throw new Error(error.message);

    await addPromiseFollowup(data.id, "edited", "Promise edited", input.notes);
    await logUserAction({
        action: "promise_edited",
        entityType: "promise",
        entityId: data.id,
        beforeData: existing,
        afterData: data,
        companyId: context.activeCompany!.id,
        officeId: context.activeOffice!.id,
    });

    revalidatePromiseWorkflow();
    return data;
}

export async function createPromiseFollowup(input: PromiseFollowupInput) {
    const context = await activeWriteContext();
    const promise = await getPromiseInActiveOffice(input.promiseId);
    const followup = await addPromiseFollowup(promise.id, input.actionType, input.outcome, input.notes);

    await addCollectionActionForPromise(promise, "promise_follow_up", input.outcome, input.notes);
    await logUserAction({
        action: "promise_followup_created",
        entityType: "promise_followup",
        entityId: followup.id,
        companyId: context.activeCompany!.id,
        officeId: context.activeOffice!.id,
        afterData: followup,
    });

    revalidatePromiseWorkflow();
    return followup;
}

export async function fulfilPromise(input: PromiseStateInput) {
    const context = await activeWriteContext();
    const existing = await getPromiseInActiveOffice(input.promiseId);

    if (!existing.tenant_id) {
        throw new Error("Promise is not linked to a tenant.");
    }

    const tenantContext = await getTenantCollectionContext(existing.tenant_id);
    const supabase = await createSupabaseServerClient();
    const amount = Number(existing.promised_amount ?? existing.amount ?? 0);
    assertAmount(amount);

    const resolvedOfficeId =
        existing.office_id ??
        tenantContext.lease?.office_id ??
        tenantContext.room?.office_id ??
        tenantContext.tenant.office_id ??
        context.activeOffice!.id;
    const balanceBefore = Math.max(0, tenantContext.outstandingBalance);
    const balance = Math.max(0, balanceBefore - amount);
    const paidAt = new Date().toISOString();

    const { data: collection, error: collectionError } = await supabase
        .from("collections")
        .insert({
            amount,
            amount_paid: amount,
            balance,
            collection_number: collectionNumber(),
            company_id: context.activeCompany!.id,
            expected_amount: tenantContext.outstandingBalance || tenantContext.monthlyRent,
            lease_id: existing.lease_id ?? tenantContext.lease?.id ?? null,
            notes: input.notes || `Promise payment recorded for ${amount}`,
            office_id: resolvedOfficeId,
            paid_at: paidAt,
            payment_method: "promise",
            property_id: tenantContext.property?.id ?? tenantContext.tenant.property_id,
            recorded_by: context.profile?.id ?? null,
            reference_number: `PROM-${existing.id.slice(0, 8)}-${Date.now()}`,
            room_id: tenantContext.room?.id ?? tenantContext.tenant.room_id,
            status: "paid",
            tenant_id: tenantContext.tenant.id,
            type: "rent",
        })
        .select("*")
        .single();

    if (collectionError) throw new Error(collectionError.message);

    await recordCollectionLedgerAndCash({
        amount,
        balanceAfter: balance,
        balanceBefore,
        collectionId: collection.id,
        companyId: context.activeCompany!.id,
        description: input.notes || `Promise payment recorded for ${amount}`,
        leaseId: existing.lease_id ?? tenantContext.lease?.id ?? null,
        officeId: resolvedOfficeId,
        recordedBy: context.profile?.id ?? null,
        supabase,
        tenantId: tenantContext.tenant.id,
    });

    const { error: tenantUpdateError } = await supabase
        .from("tenants")
        .update({ balance })
        .eq("id", tenantContext.tenant.id)
        .eq("company_id", context.activeCompany!.id);

    if (tenantUpdateError) throw new Error(tenantUpdateError.message);

    if (tenantContext.room?.id) {
        const { error: roomUpdateError } = await supabase
            .from("rooms")
            .update({ outstanding_balance: balance })
            .eq("id", tenantContext.room.id)
            .eq("company_id", context.activeCompany!.id);

        if (roomUpdateError) throw new Error(roomUpdateError.message);
    }

    const { data, error } = await supabase
        .from("promises")
        .update({
            fulfilled_at: paidAt,
            notes: input.notes || existing.notes,
            status: "fulfilled",
        })
        .eq("id", existing.id)
        .select("*")
        .single();

    if (error) throw new Error(error.message);

    await addPromiseFollowup(data.id, "fulfilled", "Promise paid", input.notes);
    await addCollectionActionForPromise(data, "payment_recorded", "promise_paid", input.notes || `Promise payment recorded for ${amount}`);
    await recalculateTenantScore({
        supabase,
        companyId: context.activeCompany!.id,
        tenantId: tenantContext.tenant.id,
        event: "promise_fulfilled",
    });

    await logUserAction({
        action: "collection_recorded",
        entityType: "collection",
        entityId: collection.id,
        companyId: context.activeCompany!.id,
        officeId: resolvedOfficeId,
        afterData: collection,
    });

    await logUserAction({
        action: "promise_paid",
        entityType: "promise",
        entityId: data.id,
        beforeData: existing,
        afterData: data,
        companyId: context.activeCompany!.id,
        officeId: resolvedOfficeId,
    });

    revalidatePromiseWorkflow();
    return data;
}

export async function markBrokenPromise(input: PromiseStateInput) {
    return setPromiseStatus(input, "broken", "broken", "Promise broken");
}

export async function reschedulePromise(input: ReschedulePromiseInput) {
    const context = await activeWriteContext();
    const existing = await getPromiseInActiveOffice(input.promiseId);
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
        .from("promises")
        .update({
            notes: input.notes || existing.notes,
            promise_date: input.promisedDate,
            promised_date: input.promisedDate,
            status: "rescheduled",
        })
        .eq("id", existing.id)
        .select("*")
        .single();

    if (error) throw new Error(error.message);

    await addPromiseFollowup(data.id, "rescheduled", `Rescheduled to ${input.promisedDate}`, input.notes);
    await addCollectionActionForPromise(data, "promise_rescheduled", `Rescheduled to ${input.promisedDate}`, input.notes);
    await logUserAction({
        action: "promise_rescheduled",
        entityType: "promise",
        entityId: data.id,
        beforeData: existing,
        afterData: data,
        companyId: context.activeCompany!.id,
        officeId: context.activeOffice!.id,
    });

    revalidatePromiseWorkflow();
    return data;
}

async function setPromiseStatus(input: PromiseStateInput, status: "fulfilled" | "broken", actionType: string, outcome: string) {
    const context = await activeWriteContext();
    const existing = await getPromiseInActiveOffice(input.promiseId);
    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
        .from("promises")
        .update({
            fulfilled_at: status === "fulfilled" ? new Date().toISOString() : null,
            notes: input.notes || existing.notes,
            status,
        })
        .eq("id", existing.id)
        .select("*")
        .single();

    if (error) throw new Error(error.message);

    await addPromiseFollowup(data.id, actionType, outcome, input.notes);
    await addCollectionActionForPromise(data, `promise_${actionType}`, outcome, input.notes);
    if (data.tenant_id) {
        await recalculateTenantScore({
            supabase,
            companyId: context.activeCompany!.id,
            tenantId: data.tenant_id,
            event: status === "broken" ? "promise_broken" : "promise_fulfilled",
        });
    }
    await logUserAction({
        action: `promise_${actionType}`,
        entityType: "promise",
        entityId: data.id,
        beforeData: existing,
        afterData: data,
        companyId: context.activeCompany!.id,
        officeId: context.activeOffice!.id,
    });

    revalidatePromiseWorkflow();
    return data;
}
