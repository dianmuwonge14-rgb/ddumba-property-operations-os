import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/permissions";
import { normalizeOfflineTransactionUuid } from "@/lib/offline/idempotency";
import { OFFLINE_MUTATION_TYPES, type OfflineMutationEnvelope } from "@/lib/offline/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { recordCollection } from "@/app/actions/collections";

type DynamicDb = {
    from: (table: string) => any;
};

type SyncStatusRow = {
    sync_status: string | null;
};

type TenantPaymentPayload = {
    amount?: unknown;
    backdatingReason?: string;
    chequeReference?: string;
    collectorName?: string;
    notes?: string;
    payerName?: string;
    paymentDate?: string;
    paymentKind?: "tenant_normal" | "tenant_top_up" | "employer_sponsor" | "arrears" | "advance";
    paymentMethod?: string;
    paymentSource?: "tenant" | "employer";
    referenceNumber?: string;
    tenantId?: string;
};

function isUnsafeStructuralConflict(message: string) {
    return /tenant not found|room not found|vacated|inactive|office.*inactive|lease.*not found|permission|assigned office/i.test(message);
}

async function replayTenantPayment(input: {
    companyId: string;
    deviceId: string;
    localCreatedAt: string | null | undefined;
    payload: Record<string, unknown> | undefined;
    transactionUuid: string;
}) {
    const payload = (input.payload ?? {}) as TenantPaymentPayload;
    if (!payload.tenantId) throw new Error("Offline payment tenant is required.");
    return recordCollection({
        amount: Number(payload.amount),
        backdatingReason: payload.backdatingReason,
        chequeReference: payload.chequeReference,
        collectorName: payload.collectorName,
        notes: payload.notes,
        offlineDeviceId: input.deviceId,
        offlineLocalCreatedAt: input.localCreatedAt ?? undefined,
        offlineTransactionUuid: input.transactionUuid,
        payerName: payload.payerName,
        paymentDate: payload.paymentDate,
        paymentKind: payload.paymentKind,
        paymentMethod: payload.paymentMethod ?? "cash",
        paymentSource: payload.paymentSource,
        referenceNumber: payload.referenceNumber,
        tenantId: payload.tenantId,
    });
}

function errorResponse(code: string, message: string, status = 400) {
    return NextResponse.json({ success: false, code, message }, { status });
}

function employeeIdFromContext(context: Awaited<ReturnType<typeof requireAuth>>) {
    return (context.profile as unknown as { employee_id?: string | null } | null)?.employee_id ?? null;
}

export async function GET() {
    const context = await requireAuth();
    if (!context.activeCompany?.id || !context.profile?.id) {
        return errorResponse("AUTH_CONTEXT_MISSING", "Active company and user are required.");
    }

    const db = createSupabaseAdminClient() as unknown as DynamicDb;
    const { data, error } = await db
        .from("desktop_sync_mutations")
        .select("transaction_uuid, transaction_type, office_id, business_date, local_created_at, sync_status, retry_count, server_acknowledgement_id, synced_at, failure_reason")
        .eq("company_id", context.activeCompany.id)
        .eq("user_id", context.profile.id)
        .order("local_created_at", { ascending: false, nullsFirst: false })
        .limit(200);

    if (error) {
        return errorResponse("SYNC_STATUS_FAILED", "Offline sync status could not be loaded.", 500);
    }

    const rows = (data ?? []) as SyncStatusRow[];
    return NextResponse.json({
        success: true,
        mutations: rows,
        summary: {
            conflictCount: rows.filter((row) => row.sync_status === "conflict").length,
            failedCount: rows.filter((row) => row.sync_status === "failed").length,
            pendingCount: rows.filter((row) => ["saved_offline", "waiting_to_sync", "syncing"].includes(String(row.sync_status))).length,
            syncedCount: rows.filter((row) => row.sync_status === "synced").length,
        },
    });
}

export async function POST(request: Request) {
    const context = await requireAuth();
    if (!context.activeCompany?.id || !context.profile?.id) {
        return errorResponse("AUTH_CONTEXT_MISSING", "Active company and user are required.");
    }

    const body = await request.json().catch(() => null) as { deviceId?: string; mutations?: Partial<OfflineMutationEnvelope>[] } | null;
    const deviceId = String(body?.deviceId ?? "").trim();
    if (!deviceId) return errorResponse("DEVICE_ID_REQUIRED", "Desktop device ID is required.");
    if (!Array.isArray(body?.mutations)) return errorResponse("MUTATIONS_REQUIRED", "Offline mutations are required.");

    const db = createSupabaseAdminClient() as unknown as DynamicDb;
    const employeeId = employeeIdFromContext(context);
    const accepted: Array<{ transactionUuid: string; status: string }> = [];
    const rejected: Array<{ transactionUuid: string; reason: string }> = [];

    for (const mutation of body.mutations.slice(0, 100)) {
        const transactionUuid = normalizeOfflineTransactionUuid(mutation.transactionUuid);
        const transactionType = mutation.transactionType;
        if (!transactionUuid) {
            rejected.push({ transactionUuid: String(mutation.transactionUuid ?? "unknown"), reason: "Offline transaction UUID is invalid." });
            continue;
        }
        if (!transactionType || !OFFLINE_MUTATION_TYPES.includes(transactionType)) {
            rejected.push({ transactionUuid, reason: "Offline transaction type is not supported." });
            continue;
        }
        if (mutation.companyId !== context.activeCompany.id) {
            rejected.push({ transactionUuid, reason: "Offline transaction company does not match the authenticated company." });
            continue;
        }
        const officeId = mutation.officeId ?? context.activeOffice?.id ?? null;
        if (!officeId && !context.canAccessAllOffices) {
            rejected.push({ transactionUuid, reason: "Offline transaction office is required." });
            continue;
        }

        const { data: existing, error: existingError } = await db
            .from("desktop_sync_mutations")
            .select("transaction_uuid, sync_status")
            .eq("company_id", context.activeCompany.id)
            .eq("transaction_uuid", transactionUuid)
            .maybeSingle();
        if (existingError) {
            rejected.push({ transactionUuid, reason: "Offline transaction duplicate check failed." });
            continue;
        }
        if (existing) {
            accepted.push({ transactionUuid, status: String(existing.sync_status) });
            continue;
        }

        const insertPayload = {
            base_revision: mutation.baseRevision ?? null,
            business_date: String(mutation.businessDate ?? new Date().toISOString().slice(0, 10)).slice(0, 10),
            company_id: context.activeCompany.id,
            device_id: deviceId,
            employee_id: employeeId,
            local_created_at: mutation.localCreatedAt ?? new Date().toISOString(),
            office_id: officeId,
            payload: mutation.payload ?? {},
            retry_count: 0,
            sync_status: "waiting_to_sync",
            transaction_type: transactionType,
            transaction_uuid: transactionUuid,
            user_id: context.profile.id,
        };
        const { error } = await db.from("desktop_sync_mutations").insert(insertPayload);
        if (error) {
            rejected.push({ transactionUuid, reason: "Offline transaction could not be queued for sync." });
            continue;
        }

        if (transactionType !== "tenant_payment") {
            accepted.push({ transactionUuid, status: "waiting_to_sync" });
            continue;
        }

        const { data: mutationRow } = await db
            .from("desktop_sync_mutations")
            .select("id")
            .eq("company_id", context.activeCompany.id)
            .eq("transaction_uuid", transactionUuid)
            .maybeSingle();

        await db
            .from("desktop_sync_mutations")
            .update({ retry_count: 1, sync_status: "syncing", updated_at: new Date().toISOString() })
            .eq("company_id", context.activeCompany.id)
            .eq("transaction_uuid", transactionUuid);

        try {
            const payment = await replayTenantPayment({
                companyId: context.activeCompany.id,
                deviceId,
                localCreatedAt: mutation.localCreatedAt,
                payload: mutation.payload,
                transactionUuid,
            }) as Record<string, unknown>;
            await db
                .from("desktop_sync_mutations")
                .update({
                    server_acknowledgement_id: payment.id ?? null,
                    server_acknowledgement_table: "collections",
                    sync_status: "synced",
                    synced_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .eq("company_id", context.activeCompany.id)
                .eq("transaction_uuid", transactionUuid);
            accepted.push({
                transactionUuid,
                status: payment.alreadyProcessed ? "synced_already_processed" : "synced",
            });
        } catch (error) {
            const reason = error instanceof Error ? error.message : "Offline payment could not be synchronized.";
            const conflict = isUnsafeStructuralConflict(reason);
            await db
                .from("desktop_sync_mutations")
                .update({
                    failure_reason: reason,
                    sync_status: conflict ? "conflict" : "failed",
                    updated_at: new Date().toISOString(),
                })
                .eq("company_id", context.activeCompany.id)
                .eq("transaction_uuid", transactionUuid);
            if (conflict && mutationRow?.id) {
                await db.from("desktop_sync_conflicts").insert({
                    company_id: context.activeCompany.id,
                    conflict_reason: reason,
                    conflict_type: "tenant_payment_structural_conflict",
                    local_payload: mutation.payload ?? {},
                    mutation_id: mutationRow.id,
                    status: "pending_admin_review",
                });
            }
            if (conflict) {
                accepted.push({ transactionUuid, status: "conflict" });
            } else {
                rejected.push({ transactionUuid, reason });
            }
        }
    }

    await db
        .from("desktop_devices")
        .update({
            last_online_at: new Date().toISOString(),
            pending_count: accepted.filter((item) => item.status !== "synced").length,
            updated_at: new Date().toISOString(),
        })
        .eq("company_id", context.activeCompany.id)
        .eq("device_id", deviceId);

    return NextResponse.json({
        success: rejected.length === 0,
        accepted,
        conflicts: [],
        message: "Offline entries were queued. Financial posting is handled by the authoritative server sync worker.",
        rejected,
    }, { status: rejected.length ? 207 : 200 });
}
