"use server";

import { revalidatePath } from "next/cache";
import { requireAuth, requireCompanyAdminMode } from "@/lib/auth/permissions";
import { logUserAction } from "@/lib/auth/audit";
import { createNotificationWithEmail } from "@/lib/notifications/email";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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
    SubmitPromiseChangeRequestInput,
} from "@/lib/promises/types";

type Db = {
    from: (table: string) => any;
};

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
    revalidatePath("/office/collector/promises");
    revalidatePath("/office/notifications");
    revalidatePath("/office/admin/notifications");
    revalidatePath("/office/collections");
    revalidatePath("/office");
    revalidatePath("/office/dashboard");
    revalidatePath("/office/ceo");
    revalidatePath("/office/excellence");
    revalidatePath("/office/ai");
    revalidatePath("/office/automation");
    revalidatePath("/office/audit");
}

function isCollectorContext(context: Awaited<ReturnType<typeof requireAuth>>) {
    return context.authMode === "collector" || context.roles.some((role) => role.role?.key === "field_collector");
}

function promiseSnapshot(promise: Record<string, unknown>) {
    return {
        amount: Number(promise.promised_amount ?? promise.amount ?? 0),
        notes: typeof promise.notes === "string" ? promise.notes : null,
        promise_date: promise.promised_date ?? promise.promise_date ?? null,
        promised_amount: Number(promise.promised_amount ?? promise.amount ?? 0),
        promised_date: promise.promised_date ?? promise.promise_date ?? null,
        status: typeof promise.status === "string" ? promise.status : null,
    };
}

function requestedPromisePatch(input: {
    amount?: number;
    promise_date?: string;
    promised_amount?: number;
    promisedAmount?: number;
    promisedDate?: string;
    promised_date?: string;
    notes?: string | null;
    status?: string | null;
}) {
    const patch: Record<string, unknown> = {};
    const requestedAmount = input.promisedAmount ?? input.promised_amount ?? input.amount;
    const requestedDate = input.promisedDate ?? input.promised_date ?? input.promise_date;
    if (requestedAmount !== undefined) {
        const amount = Number(requestedAmount);
        assertAmount(amount);
        patch.amount = amount;
        patch.promised_amount = amount;
    }
    if (requestedDate !== undefined) {
        assertDate(requestedDate);
        patch.promise_date = requestedDate;
        patch.promised_date = requestedDate;
    }
    if (input.notes !== undefined) patch.notes = input.notes || null;
    if (input.status) patch.status = input.status;
    return patch;
}

async function notifyPromiseRequest(db: Db, input: {
    companyId: string;
    entityId: string;
    message: string;
    officeId: string | null;
    recipientType: "admin" | "office";
    severity: "information" | "success" | "warning" | "error";
    title: string;
}) {
    await createNotificationWithEmail(db, {
        action_url: "/office/notifications",
        channel: "in_app",
        company_id: input.companyId,
        delivery_status: "pending",
        entity_id: input.entityId,
        entity_type: "promise_change_request",
        is_read: false,
        message: input.message,
        office_id: input.officeId,
        recipient_type: input.recipientType,
        severity: input.severity,
        title: input.title,
    });
}

async function activeWriteContext() {
    const context = await requireAuth();
    const isCollector = context.authMode === "collector" || context.roles.some((role) => role.role?.key === "field_collector");
    const canManageCollections = context.isCompanyAdmin || context.permissions.includes("collections.manage");
    if (!isCollector && !canManageCollections) {
        throw new Error("You do not have permission to manage promises.");
    }
    if (!context.activeCompany?.id || (!isCollector && !context.activeOffice?.id)) {
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
        officeId: data.office_id ?? existing.office_id ?? context.activeOffice?.id,
    });

    revalidatePromiseWorkflow();
    return data;
}

export async function submitPromiseChangeRequest(input: SubmitPromiseChangeRequestInput) {
    const context = await activeWriteContext();
    const isCollector = isCollectorContext(context);
    const db = (isCollector ? createSupabaseAdminClient() : await createSupabaseServerClient()) as unknown as Db;
    if (!context.activeCompany?.id) throw new Error("Active company is required.");
    if (!input.reason?.trim()) throw new Error("Reason for promise change is required.");

    const existing = await getPromiseInActiveOffice(input.promiseId);
    if (!isCollector && !(context.isCompanyAdmin || context.canAccessAllOffices) && existing.office_id !== context.activeOffice?.id) {
        throw new Error("You can only request promise corrections for your active office.");
    }

    const patch = requestedPromisePatch({
        notes: input.notes,
        promisedAmount: input.promisedAmount,
        promisedDate: input.promisedDate,
        status: input.status,
    });
    if (!Object.keys(patch).length) throw new Error("Enter at least one promise field to change.");

    const { data: pending, error: pendingError } = await db
        .from("promise_change_requests")
        .select("id")
        .eq("company_id", context.activeCompany.id)
        .eq("promise_id", existing.id)
        .eq("change_type", input.changeType || "general_edit")
        .eq("status", "pending")
        .maybeSingle();
    if (pendingError) throw new Error(pendingError.message);
    if (pending) throw new Error("This promise already has a pending change request.");

    const officeId = existing.office_id ?? context.activeOffice?.id ?? null;
    const { data, error } = await db
        .from("promise_change_requests")
        .insert({
            change_type: input.changeType || "general_edit",
            company_id: context.activeCompany.id,
            office_id: officeId,
            original_value: promiseSnapshot(existing as Record<string, unknown>),
            promise_id: existing.id,
            reason: input.reason.trim(),
            requested_by: context.profile?.id ?? context.authUser?.id ?? null,
            requested_by_account_type: context.profile?.account_type ?? (isCollector ? "field_collector" : null),
            requested_value: patch,
            room_id: existing.room_id ?? null,
            status: "pending",
            tenant_id: existing.tenant_id ?? null,
        })
        .select("*")
        .single();
    if (error) {
        throw new Error(`Promise change request could not be created: ${error.message}`);
    }

    await notifyPromiseRequest(db, {
        companyId: context.activeCompany.id,
        entityId: data.id,
        message: `Promise correction requested${isCollector ? " by field collector" : ""}. Reason: ${input.reason.trim()}`,
        officeId,
        recipientType: "admin",
        severity: "warning",
        title: "Promise correction pending approval",
    });

    await logUserAction({
        action: "promise_change_request_created",
        entityType: "promise_change_request",
        entityId: data.id,
        companyId: context.activeCompany.id,
        officeId: officeId ?? undefined,
        beforeData: existing,
        afterData: data,
    });

    revalidatePromiseWorkflow();
    return data;
}

export async function decidePromiseChangeRequest(input: {
    requestId: string;
    decision: "approved" | "rejected";
    comment?: string | null;
}) {
    const context = await requireCompanyAdminMode();
    const db = (await createSupabaseServerClient()) as unknown as Db;
    const companyId = context.activeCompany?.id;
    const actorId = context.profile?.id ?? context.authUser?.id ?? null;
    if (!companyId) throw new Error("Active company is required.");
    if (input.decision === "rejected" && !String(input.comment ?? "").trim()) throw new Error("Rejection reason is required.");

    const { data: request, error: requestError } = await db
        .from("promise_change_requests")
        .select("*")
        .eq("company_id", companyId)
        .eq("id", input.requestId)
        .maybeSingle();
    if (requestError) throw new Error(requestError.message);
    if (!request) throw new Error("Promise change request not found.");
    if (request.status !== "pending") throw new Error("This promise change request has already been reviewed.");

    const { data: promise, error: promiseError } = await db
        .from("promises")
        .select("*")
        .eq("company_id", companyId)
        .eq("id", request.promise_id)
        .maybeSingle();
    if (promiseError) throw new Error(promiseError.message);
    if (!promise) throw new Error("Promise not found.");

    const reviewedAt = new Date().toISOString();
    if (input.decision === "rejected") {
        const { data, error } = await db
            .from("promise_change_requests")
            .update({
                admin_comment: input.comment || null,
                reviewed_at: reviewedAt,
                reviewed_by: actorId,
                status: "rejected",
            })
            .eq("id", request.id)
            .select("*")
            .single();
        if (error) throw new Error(error.message);
        await notifyPromiseRequest(db, {
            companyId,
            entityId: request.id,
            message: `Admin rejected a promise correction${input.comment ? `: ${input.comment}` : "."}`,
            officeId: request.office_id ?? promise.office_id ?? null,
            recipientType: "office",
            severity: "error",
            title: "Promise correction rejected",
        });
        await logUserAction({
            action: "promise_change_request_rejected",
            entityType: "promise_change_request",
            entityId: request.id,
            companyId,
            officeId: request.office_id ?? promise.office_id ?? undefined,
            beforeData: request,
            afterData: data,
        });
        revalidatePromiseWorkflow();
        return data;
    }

    const patch = requestedPromisePatch((request.requested_value ?? {}) as {
        promisedAmount?: number;
        promisedDate?: string;
        notes?: string | null;
        status?: string | null;
    });
    const { data: updatedPromise, error: updateError } = await db
        .from("promises")
        .update(patch)
        .eq("id", request.promise_id)
        .eq("company_id", companyId)
        .select("*")
        .single();
    if (updateError) throw new Error(updateError.message);

    await addPromiseFollowup(updatedPromise.id, "edited", "Promise correction approved", input.comment ?? undefined);

    const { data: reviewedRequest, error: reviewError } = await db
        .from("promise_change_requests")
        .update({
            admin_comment: input.comment || null,
            reviewed_at: reviewedAt,
            reviewed_by: actorId,
            status: "approved",
        })
        .eq("id", request.id)
        .select("*")
        .single();
    if (reviewError) throw new Error(reviewError.message);

    await notifyPromiseRequest(db, {
        companyId,
        entityId: request.id,
        message: "Admin approved a promise correction. Promise Centre has been updated live.",
        officeId: updatedPromise.office_id ?? request.office_id ?? null,
        recipientType: "office",
        severity: "success",
        title: "Promise correction approved",
    });
    await logUserAction({
        action: "promise_change_request_approved",
        entityType: "promise_change_request",
        entityId: request.id,
        companyId,
        officeId: updatedPromise.office_id ?? request.office_id ?? undefined,
        beforeData: { request, promise },
        afterData: { request: reviewedRequest, promise: updatedPromise },
    });

    revalidatePromiseWorkflow();
    return reviewedRequest;
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
        officeId: promise.office_id ?? context.activeOffice?.id,
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
        context.activeOffice?.id;
    if (!resolvedOfficeId) throw new Error("Promise is missing office assignment.");
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
        officeId: data.office_id ?? existing.office_id ?? context.activeOffice?.id,
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
        officeId: data.office_id ?? existing.office_id ?? context.activeOffice?.id,
    });

    revalidatePromiseWorkflow();
    return data;
}
