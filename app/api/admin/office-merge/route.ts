import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { logUserAction } from "@/lib/auth/audit";
import { getAuthContext } from "@/lib/auth/context";
import { COUNT_TABLES } from "@/lib/office-merge/constants";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

type LooseRow = Record<string, any>;

type OfficeMergeRequest = {
    action?: "process";
    accountHandling?: "move_all" | "deactivate_all" | "select";
    confirmation?: string;
    confirmNewOfficePin?: string;
    jobId?: string;
    newOfficeCode?: string;
    newOfficeLocation?: string;
    newOfficeName?: string;
    newOfficePin?: string;
    reasonNote?: string;
    selectedAccountIdsToDeactivate?: string[];
    selectedAccountIdsToMove?: string[];
    sourceOfficeId?: string;
    sourceOfficeIds?: string[];
};

const MERGE_ROW_BATCH_SIZE = 300;

const MERGE_MOVE_TABLES = [
    ...COUNT_TABLES.map((item) => item.table),
    "attendance_events",
    "tenant_rent_allocations",
    "tenant_ledger_entries",
    "cash_transactions",
    "office_cash_movements",
    "payment_receipts",
    "audit_logs",
].filter((table, index, tables) => tables.indexOf(table) === index && !["offices", "office_merge_batches", "office_merge_audit"].includes(table));

type MergeJobState = {
    version: 1;
    accountHandling: "reassign" | "disable";
    currentSourceIndex: number;
    currentTableIndex: number;
    destinationOfficeId: string;
    destinationOfficeName: string;
    movedCounts: Record<string, number>;
    preSnapshot: Record<string, unknown>;
    sourceOfficeIds: string[];
    sourceOfficeNames: Record<string, string>;
    startedAt: string;
};

function normalize(value: unknown) {
    return String(value ?? "").trim();
}

function normalizeCode(value: string) {
    return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function suggestedLoginEmail(loginName: string, companyId: string, salt?: string) {
    const safe = loginName.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, ".").replace(/^\.+|\.+$/g, "") || `office-${Date.now()}`;
    return `${safe}+${companyId.slice(0, 8)}${salt ? `.${salt.slice(0, 8)}` : ""}@ddumba.local`;
}

function isWeakPin(pin: string) {
    const repeated = /^(\d)\1{5}$/.test(pin);
    const sequential = ["012345", "123456", "234567", "345678", "456789", "987654", "876543", "765432", "654321"].includes(pin);
    return repeated || sequential;
}

function assertOfficePin(pin: string, confirmation: string) {
    if (!/^\d{6}$/.test(pin)) throw new Error("PIN must contain exactly six digits.");
    if (pin !== confirmation) throw new Error("PIN confirmation does not match.");
    if (isWeakPin(pin)) throw new Error("Choose a stronger six-digit PIN for the merged office.");
}

function jsonError(message: string, status = 400, code = "OFFICE_MERGE_FAILED", extra: Record<string, unknown> = {}) {
    return NextResponse.json({ code, message, success: false, ...extra }, { status });
}

function isInactive(status: string) {
    return ["archived", "deleted", "merged", "inactive"].includes(status.toLowerCase());
}

async function countOfficeRows(db: { from: (table: string) => any }, table: string, companyId: string, officeId: string) {
    const query = db.from(table).select("id", { count: "exact", head: true }).eq("office_id", officeId);
    const result = await (table === "offices" ? query.eq("id", officeId).eq("company_id", companyId) : query.eq("company_id", companyId));
    if (result.error) return 0;
    return Number(result.count ?? 0);
}

async function loadServerCounts(db: { from: (table: string) => any }, companyId: string, officeId: string) {
    const counts: Record<string, number> = {};
    for (const item of COUNT_TABLES) counts[item.key] = 0;
    const [roomsResult, tenantsResult, propertiesResult] = await Promise.all([
        db.from("rooms").select("id,landlord_id,monthly_rent,status").eq("company_id", companyId).eq("office_id", officeId),
        db.from("tenants").select("id,status").eq("company_id", companyId).eq("office_id", officeId),
        db.from("properties").select("id,status").eq("company_id", companyId).eq("office_id", officeId),
    ]);
    const rooms = ((roomsResult.data ?? []) as LooseRow[]).filter((row) => !["archived", "deleted", "inactive"].includes(String(row.status ?? "").toLowerCase()));
    const landlordIds = new Set(rooms.map((row) => row.landlord_id ? String(row.landlord_id) : "").filter(Boolean));
    counts.landlords = landlordIds.size;
    counts.rooms = rooms.length;
    counts.tenants = ((tenantsResult.data ?? []) as LooseRow[]).filter((row) => !["archived", "deleted", "inactive", "vacated"].includes(String(row.status ?? "").toLowerCase())).length;
    counts.properties = ((propertiesResult.data ?? []) as LooseRow[]).filter((row) => !["archived", "deleted", "inactive"].includes(String(row.status ?? "").toLowerCase())).length;
    counts.rentRoll = rooms.reduce((total, row) => total + Number(row.monthly_rent ?? 0), 0);
    const countJobs = COUNT_TABLES
        .filter((item) => !["landlords", "properties", "rooms", "tenants"].includes(item.key))
        .map(async (item) => [item.key, await countOfficeRows(db, item.table, companyId, officeId)] as const);
    for (const [key, count] of await Promise.all(countJobs)) counts[key] = count;
    return counts;
}

async function defaultOfficeRoleId(db: { from: (table: string) => any }, companyId: string) {
    const { data, error } = await db
        .from("roles")
        .select("id, company_id")
        .eq("key", "office_manager")
        .or(`company_id.eq.${companyId},company_id.is.null`)
        .order("company_id", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
    if (error) throw new Error(error.message);
    return data?.id ?? null;
}

async function cleanupCreatedOffice(admin: ReturnType<typeof createSupabaseAdminClient>, companyId: string, officeId: string | null, userId: string | null) {
    if (userId) {
        await admin.auth.admin.deleteUser(userId).catch(() => undefined);
        await admin.from("pin_credentials").delete().eq("user_id", userId);
        await admin.from("user_office_roles").delete().eq("user_id", userId);
        await admin.from("users").delete().eq("id", userId);
    }
    if (officeId) {
        await admin.from("offices").delete().eq("id", officeId).eq("company_id", companyId);
    }
}

async function officeHasMovedRows(db: { from: (table: string) => any }, companyId: string, officeId: string) {
    for (const table of MERGE_MOVE_TABLES.filter((item) => item !== "audit_logs")) {
        const { count, error } = await db.from(table).select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("office_id", officeId);
        if (!error && Number(count ?? 0) > 0) return true;
    }
    return false;
}

async function ensureOfficeLogin(params: {
    accountHandling: "reassign" | "disable";
    admin: ReturnType<typeof createSupabaseAdminClient>;
    companyId: string;
    db: { from: (table: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any };
    loginName: string;
    officeId: string;
    pin: string;
}) {
    const { accountHandling, admin, companyId, db, loginName, officeId, pin } = params;
    const { data: existingUser, error: existingUserError } = await db
        .from("users")
        .select("id")
        .eq("company_id", companyId)
        .eq("default_office_id", officeId)
        .eq("account_type", "office")
        .not("status", "in", "(archived,deleted,inactive)")
        .limit(1)
        .maybeSingle();
    if (existingUserError) throw new Error(existingUserError.message);
    const userId = existingUser?.id ? String(existingUser.id) : null;
    let createdUser = false;
    const roleId = await defaultOfficeRoleId(db, companyId);
    if (!roleId) throw new Error("Office Manager role is missing. Apply default roles migration first.");

    let officeUserId = userId;
    if (!officeUserId) {
        const loginEmail = suggestedLoginEmail(loginName, companyId, officeId);
        const { data: authUser, error: authError } = await admin.auth.admin.createUser({
            email: loginEmail,
            email_confirm: true,
            password: pin,
            user_metadata: {
                account_type: "office",
                default_office_id: officeId,
                full_name: loginName,
                login_name: loginName,
                source: "office_merge",
            },
        });
        if (authError || !authUser.user?.id) throw new Error(authError?.message ?? "New office login could not be created.");
        officeUserId = authUser.user.id;
        createdUser = true;
        const { error: userError } = await db.from("users").upsert({
            account_type: "office",
            company_id: companyId,
            default_office_id: officeId,
            email: loginEmail,
            full_name: loginName,
            id: officeUserId,
            status: "active",
            updated_at: new Date().toISOString(),
        });
        if (userError) throw new Error(userError.message);
    }

    const pinResult = await db.rpc("ddumba_v1_set_pin_credential", { p_pin: pin, p_status: "active", p_user_id: officeUserId });
    if (pinResult.error) throw new Error(pinResult.error.message);

    const { data: roleRow, error: roleLookupError } = await db
        .from("user_office_roles")
        .select("id")
        .eq("company_id", companyId)
        .eq("office_id", officeId)
        .eq("user_id", officeUserId)
        .limit(1)
        .maybeSingle();
    if (roleLookupError) throw new Error(roleLookupError.message);
    if (!roleRow?.id) {
        const { error: roleError } = await db.from("user_office_roles").insert({
            company_id: companyId,
            office_id: officeId,
            role_id: roleId,
            scope: "office",
            status: accountHandling === "disable" ? "inactive" : "active",
            user_id: officeUserId,
        });
        if (roleError) throw new Error(roleError.message);
    }
    return { createdUser, userId: officeUserId };
}

async function createOrReuseDestinationOffice(params: {
    companyId: string;
    db: { from: (table: string) => any };
    location: string;
    name: string;
    officeCode: string;
}) {
    const { companyId, db, location, name, officeCode } = params;
    const [{ data: duplicateName }, { data: duplicateCode }] = await Promise.all([
        db.from("offices").select("id,office_name,name,status").eq("company_id", companyId).ilike("office_name", name).not("status", "in", "(archived,deleted,merged)").limit(1).maybeSingle(),
        db.from("offices").select("id,office_name,name,status").eq("company_id", companyId).or(`office_code.eq.${officeCode},code.eq.${officeCode}`).not("status", "in", "(archived,deleted,merged)").limit(1).maybeSingle(),
    ]);

    const duplicateIds = [duplicateName?.id, duplicateCode?.id].filter(Boolean).map(String);
    const uniqueDuplicateIds = [...new Set(duplicateIds)];
    if (uniqueDuplicateIds.length > 1) throw new Error("Office name and office code belong to different existing offices.");
    if (uniqueDuplicateIds.length === 1) {
        const officeId = uniqueDuplicateIds[0];
        const hasMovedRows = await officeHasMovedRows(db, companyId, officeId);
        if (hasMovedRows) throw new Error("Office name or office code already exists.");
        return { created: false, id: officeId };
    }

    const now = new Date().toISOString();
    const { data: office, error: officeError } = await db.from("offices").insert({
        address: location || null,
        city: location || null,
        code: officeCode,
        company_id: companyId,
        name,
        office_code: officeCode,
        office_name: name,
        status: "active",
        updated_at: now,
    }).select("id").single();
    if (officeError || !office?.id) throw new Error(officeError?.message ?? "New merged office could not be created.");
    return { created: true, id: String(office.id) };
}

async function createPreSnapshot(db: { from: (table: string) => any }, companyId: string, sourceOfficeIds: string[]) {
    const offices: Record<string, Record<string, number>> = {};
    for (const officeId of sourceOfficeIds) offices[officeId] = await loadServerCounts(db, companyId, officeId);
    const combined: Record<string, number> = {};
    for (const counts of Object.values(offices)) {
        for (const [key, value] of Object.entries(counts)) combined[key] = (combined[key] ?? 0) + Number(value ?? 0);
    }
    return { combined, offices };
}

async function findExistingMergeJob(db: { from: (table: string) => any }, companyId: string, sourceOfficeIds: string[], destinationOfficeName: string) {
    const { data } = await db
        .from("office_merge_batches")
        .select("id,status,affected_counts,source_office_ids,new_office_id")
        .eq("company_id", companyId)
        .in("status", ["confirmed", "queued", "running"])
        .order("created_at", { ascending: false })
        .limit(20);
    const sourceSet = sourceOfficeIds.slice().sort().join("|");
    return ((data ?? []) as LooseRow[]).find((row) => {
        const rowSources = Array.isArray(row.source_office_ids) ? row.source_office_ids.map(String).sort().join("|") : "";
        return rowSources === sourceSet && normalize(row.affected_counts?.job?.destinationOfficeName).toLowerCase() === destinationOfficeName.toLowerCase();
    }) ?? null;
}

async function insertMergeAudit(db: { from: (table: string) => any }, payload: Record<string, unknown>) {
    await db.from("office_merge_audit").insert(payload).then(() => undefined, () => undefined);
}

async function saveJobState(db: { from: (table: string) => any }, batchId: string, state: MergeJobState, patch: Record<string, unknown> = {}) {
    await db.from("office_merge_batches").update({
        ...patch,
        affected_counts: { job: state, movedCounts: state.movedCounts, preSnapshot: state.preSnapshot },
    }).eq("id", batchId);
}

function jobProgress(state: MergeJobState) {
    const totalStages = Math.max(1, state.sourceOfficeIds.length * MERGE_MOVE_TABLES.length + state.sourceOfficeIds.length + 1);
    const completed = Math.min(totalStages, state.currentSourceIndex * (MERGE_MOVE_TABLES.length + 1) + state.currentTableIndex);
    return {
        currentStage: state.currentSourceIndex >= state.sourceOfficeIds.length ? "Final verification complete" : `Moving ${MERGE_MOVE_TABLES[state.currentTableIndex] ?? "source office archive"}`,
        percentage: Math.max(1, Math.min(99, Math.round((completed / totalStages) * 100))),
        recordsProcessed: Object.values(state.movedCounts).reduce((total, count) => total + Number(count ?? 0), 0),
        totalStages,
    };
}

async function createMergeJob(params: {
    accountHandling: "reassign" | "disable";
    actorId: string;
    companyId: string;
    db: { from: (table: string) => any };
    destinationOfficeId: string;
    destinationOfficeName: string;
    reasonNote: string;
    sourceOffices: Array<{ id: string; name: string }>;
}) {
    const { accountHandling, actorId, companyId, db, destinationOfficeId, destinationOfficeName, reasonNote, sourceOffices } = params;
    const sourceOfficeIds = sourceOffices.map((office) => office.id);
    const existingJob = await findExistingMergeJob(db, companyId, sourceOfficeIds, destinationOfficeName);
    if (existingJob?.id) {
        return {
            existing: true,
            id: String(existingJob.id),
            state: existingJob.affected_counts?.job as MergeJobState,
        };
    }
    const preSnapshot = await createPreSnapshot(db, companyId, sourceOfficeIds);
    const sourceOfficeNames = Object.fromEntries(sourceOffices.map((office) => [office.id, office.name]));
    const state: MergeJobState = {
        version: 1,
        accountHandling,
        currentSourceIndex: 0,
        currentTableIndex: 0,
        destinationOfficeId,
        destinationOfficeName,
        movedCounts: {},
        preSnapshot,
        sourceOfficeIds,
        sourceOfficeNames,
        startedAt: new Date().toISOString(),
    };
    const { data: batch, error } = await db.from("office_merge_batches").insert({
        affected_counts: { job: state, movedCounts: {}, preSnapshot },
        admin_user_id: actorId,
        company_id: companyId,
        confirmed_at: new Date().toISOString(),
        new_office_id: destinationOfficeId,
        new_office_name: destinationOfficeName,
        reason_note: reasonNote || null,
        source_office_ids: sourceOfficeIds,
        source_office_names: Object.values(sourceOfficeNames),
        status: "confirmed",
        warning_acknowledged: true,
    }).select("id").single();
    if (error || !batch?.id) throw new Error(error?.message ?? "Merge job could not be created.");
    return { existing: false, id: String(batch.id), state };
}

async function updateRowsForTable(params: {
    batchId: string;
    companyId: string;
    db: { from: (table: string) => any };
    destinationOfficeId: string;
    sourceOfficeId: string;
    sourceOfficeName: string;
    table: string;
}) {
    const { batchId, companyId, db, destinationOfficeId, sourceOfficeId, sourceOfficeName, table } = params;
    const selectResult = await db
        .from(table)
        .select("id")
        .eq("company_id", companyId)
        .eq("office_id", sourceOfficeId)
        .limit(MERGE_ROW_BATCH_SIZE);
    if (selectResult.error) {
        const message = String(selectResult.error.message ?? "");
        if (message.includes("Could not find the table") || message.includes("does not exist") || selectResult.error.code === "PGRST205") return { count: 0, skipped: true };
        throw new Error(`${table}: ${message}`);
    }
    const ids = ((selectResult.data ?? []) as LooseRow[]).map((row) => row.id).filter(Boolean);
    if (!ids.length) return { count: 0, skipped: false };
    const fullPatch = {
        merge_batch_id: batchId,
        merged_at: new Date().toISOString(),
        merged_into_office_id: destinationOfficeId,
        office_id: destinationOfficeId,
        original_office_id: sourceOfficeId,
        original_office_name: sourceOfficeName,
        updated_at: new Date().toISOString(),
    };
    let updateResult = await db.from(table).update(fullPatch).in("id", ids);
    if (updateResult.error) {
        updateResult = await db.from(table).update({ office_id: destinationOfficeId }).in("id", ids);
    }
    if (updateResult.error) throw new Error(`${table}: ${updateResult.error.message}`);
    return { count: ids.length, skipped: false };
}

async function processMergeJob(params: {
    actorId: string;
    companyId: string;
    db: { from: (table: string) => any };
    jobId: string;
}) {
    const { actorId, companyId, db, jobId } = params;
    const { data: batch, error } = await db
        .from("office_merge_batches")
        .select("id,status,affected_counts,new_office_id,new_office_name,source_office_ids,source_office_names")
        .eq("id", jobId)
        .eq("company_id", companyId)
        .maybeSingle();
    if (error || !batch?.id) throw new Error(error?.message ?? "Merge job could not be found.");
    let state = batch.affected_counts?.job as MergeJobState | undefined;
    if (!state?.destinationOfficeId) throw new Error("Merge job is missing durable state.");
    if (String(batch.status).toLowerCase() === "completed") {
        return { completed: true, state, progress: { ...jobProgress(state), percentage: 100 } };
    }

    if (state.currentSourceIndex >= state.sourceOfficeIds.length) {
        await saveJobState(db, jobId, state, { completed_at: new Date().toISOString(), status: "completed" });
        return { completed: true, state, progress: { ...jobProgress(state), percentage: 100 } };
    }

    const sourceOfficeId = state.sourceOfficeIds[state.currentSourceIndex];
    const sourceOfficeName = state.sourceOfficeNames[sourceOfficeId] ?? "Source office";
    const table = MERGE_MOVE_TABLES[state.currentTableIndex];
    if (table) {
        const moved = await updateRowsForTable({
            batchId: jobId,
            companyId,
            db,
            destinationOfficeId: state.destinationOfficeId,
            sourceOfficeId,
            sourceOfficeName,
            table,
        });
        if (moved.count > 0) {
            state = {
                ...state,
                movedCounts: {
                    ...state.movedCounts,
                    [table]: Number(state.movedCounts[table] ?? 0) + moved.count,
                },
            };
            await saveJobState(db, jobId, state, { status: "confirmed" });
            return { completed: false, state, progress: { ...jobProgress(state), currentStage: `Moving ${table}: ${moved.count} records this batch` } };
        }
        await insertMergeAudit(db, {
            action: moved.skipped ? "table_skipped" : "table_verified",
            after_data: { recordsMoved: Number(state.movedCounts[table] ?? 0), skipped: moved.skipped },
            before_data: {},
            company_id: companyId,
            entity_table: table,
            merge_batch_id: jobId,
            merged_into_office_id: state.destinationOfficeId,
            source_office_id: sourceOfficeId,
            source_office_name: sourceOfficeName,
        });
        state = { ...state, currentTableIndex: state.currentTableIndex + 1 };
        await saveJobState(db, jobId, state, { status: "confirmed" });
        return { completed: false, state, progress: { ...jobProgress(state), currentStage: moved.skipped ? `Skipped unavailable table ${table}` : `Verified ${table}` } };
    }

    const archivePatch = {
        merge_batch_id: jobId,
        merged_at: new Date().toISOString(),
        merged_by: actorId,
        merged_into_office_id: state.destinationOfficeId,
        status: "merged",
        updated_at: new Date().toISOString(),
    };
    const archiveResult = await db.from("offices").update(archivePatch).eq("id", sourceOfficeId).eq("company_id", companyId);
    if (archiveResult.error) throw new Error(`Archive ${sourceOfficeName}: ${archiveResult.error.message}`);
    await insertMergeAudit(db, {
        action: "source_office_archived_after_merge",
        after_data: archivePatch,
        before_data: { sourceOfficeId, sourceOfficeName },
        company_id: companyId,
        entity_table: "offices",
        entity_id: sourceOfficeId,
        merge_batch_id: jobId,
        merged_into_office_id: state.destinationOfficeId,
        source_office_id: sourceOfficeId,
        source_office_name: sourceOfficeName,
    });
    state = { ...state, currentSourceIndex: state.currentSourceIndex + 1, currentTableIndex: 0 };
    await saveJobState(db, jobId, state, { status: "confirmed" });
    return { completed: false, state, progress: { ...jobProgress(state), currentStage: `${sourceOfficeName} archived after verified transfer` } };
}

export async function POST(request: Request) {
    const startedAt = Date.now();
    let createdOfficeId: string | null = null;
    let createdUserId: string | null = null;
    try {
        const context = await getAuthContext();
        const companyId = context.activeCompany?.id;
        if (!context.isAuthenticated || !context.profile) return jsonError("Your Admin session expired. Please sign in again.", 401, "OFFICE_MERGE_AUTH_EXPIRED");
        if (!context.isCompanyAdmin || context.isOfficeMode) return jsonError("Permission denied. Only active Admin accounts can merge offices.", 403, "OFFICE_MERGE_PERMISSION_DENIED");
        if (!companyId) return jsonError("Active company is required.", 400, "OFFICE_MERGE_NO_COMPANY");

        const body = (await request.json().catch(() => null)) as OfficeMergeRequest | null;
        if (!body) return jsonError("Office merge request was not valid JSON.", 400, "OFFICE_MERGE_INVALID_JSON");
        const admin = createSupabaseAdminClient();
        const db = admin as unknown as { from: (table: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any };

        if (body.action === "process") {
            const jobId = normalize(body.jobId);
            if (!jobId) return jsonError("Merge job reference is required.", 400, "OFFICE_MERGE_JOB_REQUIRED");
            const step = await processMergeJob({ actorId: context.profile.id, companyId, db, jobId });
            if (step.completed) {
                revalidatePath("/office", "layout");
                revalidatePath("/office/admin/office-merge");
                revalidatePath("/office/admin");
                revalidatePath("/office/ceo");
                revalidatePath("/office/cash-banking");
                revalidatePath("/office/landlords");
                revalidatePath("/office/properties");
                revalidatePath("/office/payments");
                revalidatePath("/office/receipts");
            }
            return NextResponse.json({
                code: step.completed ? "OFFICE_MERGE_COMPLETED" : "OFFICE_MERGE_RUNNING",
                destinationOfficeId: step.state.destinationOfficeId,
                destinationOfficeName: step.state.destinationOfficeName,
                jobId,
                progress: step.progress,
                results: step.completed ? [{
                    accountsReassigned: Number(step.state.movedCounts.user_office_roles ?? 0),
                    batchId: jobId,
                    destinationOfficeName: step.state.destinationOfficeName,
                    mergeReference: `MERGE-${jobId.slice(0, 8).toUpperCase()}`,
                    mergedAt: new Date().toISOString(),
                    sourceOfficeName: Object.values(step.state.sourceOfficeNames).join(" + "),
                    sourceStatus: "merged",
                    transferredCounts: step.state.movedCounts,
                }] : [],
                success: true,
            });
        }

        const sourceOfficeIds = [...new Set([...(Array.isArray(body.sourceOfficeIds) ? body.sourceOfficeIds : []), body.sourceOfficeId].map(normalize).filter(Boolean))];
        const newOfficeName = normalize(body.newOfficeName).replace(/\s+/g, " ");
        const newOfficePin = normalize(body.newOfficePin);
        const confirmNewOfficePin = normalize(body.confirmNewOfficePin);
        const newOfficeCode = normalizeCode(body.newOfficeCode || newOfficeName);
        const newOfficeLocation = normalize(body.newOfficeLocation);
        const confirmation = normalize(body.confirmation);
        const accountHandling = body.accountHandling === "deactivate_all" ? "disable" : "reassign";

        if (sourceOfficeIds.length === 0) return jsonError("Select at least one source office.", 400, "OFFICE_MERGE_NO_SOURCE");
        if (!newOfficeName) return jsonError("New merged office name is required.", 400, "OFFICE_MERGE_NEW_OFFICE_NAME_REQUIRED");
        if (!newOfficeCode) return jsonError("Office code is required.", 400, "OFFICE_MERGE_NEW_OFFICE_CODE_REQUIRED");
        try {
            assertOfficePin(newOfficePin, confirmNewOfficePin);
        } catch (error) {
            return jsonError(error instanceof Error ? error.message : "Office PIN is invalid.", 400, "OFFICE_MERGE_PIN_INVALID");
        }
        if (confirmation.toUpperCase() !== "MERGE OFFICES") return jsonError("Type MERGE OFFICES to confirm this office merge.", 400, "OFFICE_MERGE_CONFIRMATION_REQUIRED");

        const [{ data: sourceRows, error: sourceError }] = await Promise.all([
            db.from("offices").select("id,name,office_name,status").eq("company_id", companyId).in("id", sourceOfficeIds),
        ]);
        if (sourceError) return jsonError(sourceError.message, 500, "OFFICE_MERGE_OFFICE_LOOKUP_FAILED");

        const sourceOffices = ((sourceRows ?? []) as LooseRow[]).map((office) => ({
            id: String(office.id),
            name: normalize(office.office_name ?? office.name) || "Office",
            status: normalize(office.status || "active").toLowerCase(),
        }));
        if (sourceOffices.length !== sourceOfficeIds.length) return jsonError("One source office could not be found.", 404, "OFFICE_MERGE_SOURCE_NOT_FOUND");
        if (sourceOffices.some((office) => isInactive(office.status))) return jsonError("One source office is already inactive, archived, or merged.", 400, "OFFICE_MERGE_SOURCE_INACTIVE");

        const destination = await createOrReuseDestinationOffice({
            companyId,
            db,
            location: newOfficeLocation,
            name: newOfficeName,
            officeCode: newOfficeCode,
        });
        createdOfficeId = destination.created ? destination.id : null;
        const loginName = `${newOfficeName} Account`;
        const loginResult = await ensureOfficeLogin({
            accountHandling,
            admin,
            companyId,
            db,
            loginName,
            officeId: destination.id,
            pin: newOfficePin,
        });
        createdUserId = loginResult.createdUser ? loginResult.userId : null;
        const mergeJob = await createMergeJob({
            accountHandling,
            actorId: context.profile.id,
            companyId,
            db,
            destinationOfficeId: destination.id,
            destinationOfficeName: newOfficeName,
            reasonNote: normalize(body.reasonNote),
            sourceOffices,
        });

        await logUserAction({
            action: mergeJob.existing ? "office_merge_job_resumed" : "office_merge_job_created",
            afterData: {
                accountHandling,
                destinationOfficeId: destination.id,
                destinationOfficeName: newOfficeName,
                jobId: mergeJob.id,
                pin_configured: true,
                sourceOfficeIds,
            },
            beforeData: { sourceOfficeIds },
            companyId,
            entityId: mergeJob.id,
            entityType: "office_merge_batch",
            officeId: destination.id,
        });

        createdOfficeId = null;
        createdUserId = null;

        revalidatePath("/office", "layout");
        revalidatePath("/office/admin/office-merge");
        revalidatePath("/office/admin");
        revalidatePath("/office/ceo");
        revalidatePath("/office/cash-banking");
        revalidatePath("/office/landlords");
        revalidatePath("/office/properties");
        revalidatePath("/office/payments");
        revalidatePath("/office/receipts");

        return NextResponse.json({
            async: true,
            code: mergeJob.existing ? "OFFICE_MERGE_JOB_RESUMED" : "OFFICE_MERGE_JOB_STARTED",
            destinationOfficeId: destination.id,
            destinationOfficeName: newOfficeName,
            durationMs: Date.now() - startedAt,
            jobId: mergeJob.id,
            newOfficeCode,
            pinConfigured: true,
            progress: jobProgress(mergeJob.state),
            results: [],
            success: true,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Office merge could not be completed.";
        console.error("[office-merge] production merge request failed", { message, createdOfficeId, createdUserId });
        const companyId = (await getAuthContext().catch(() => null))?.activeCompany?.id ?? null;
        if (companyId) await cleanupCreatedOffice(createSupabaseAdminClient(), companyId, createdOfficeId, createdUserId);
        const duplicateCode = message.toLowerCase().includes("office code") ? "OFFICE_MERGE_DUPLICATE_OFFICE_CODE" : null;
        const duplicateName = message.toLowerCase().includes("office name") ? "OFFICE_MERGE_DUPLICATE_OFFICE_NAME" : null;
        return jsonError(message, duplicateCode || duplicateName ? 400 : 500, duplicateCode ?? duplicateName ?? "OFFICE_MERGE_UNHANDLED");
    }
}
