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
    accountHandling?: "move_all" | "deactivate_all" | "select";
    confirmation?: string;
    confirmNewOfficePin?: string;
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

function normalize(value: unknown) {
    return String(value ?? "").trim();
}

function normalizeCode(value: string) {
    return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function suggestedLoginEmail(loginName: string, companyId: string) {
    const safe = loginName.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, ".").replace(/^\.+|\.+$/g, "") || `office-${Date.now()}`;
    return `${safe}+${companyId.slice(0, 8)}@ddumba.local`;
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

        const admin = createSupabaseAdminClient();
        const db = admin as unknown as { from: (table: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any };

        const [{ data: duplicateName }, { data: duplicateCode }, { data: sourceRows, error: sourceError }] = await Promise.all([
            db.from("offices").select("id").eq("company_id", companyId).ilike("office_name", newOfficeName).not("status", "in", "(archived,deleted,merged)").limit(1).maybeSingle(),
            db.from("offices").select("id").eq("company_id", companyId).or(`office_code.eq.${newOfficeCode},code.eq.${newOfficeCode}`).not("status", "in", "(archived,deleted,merged)").limit(1).maybeSingle(),
            db.from("offices").select("id,name,office_name,status").eq("company_id", companyId).in("id", sourceOfficeIds),
        ]);
        if (sourceError) return jsonError(sourceError.message, 500, "OFFICE_MERGE_OFFICE_LOOKUP_FAILED");
        if (duplicateName?.id) return jsonError("Office name already exists.", 400, "OFFICE_MERGE_DUPLICATE_OFFICE_NAME");
        if (duplicateCode?.id) return jsonError("Office code already exists.", 400, "OFFICE_MERGE_DUPLICATE_OFFICE_CODE");

        const sourceOffices = ((sourceRows ?? []) as LooseRow[]).map((office) => ({
            id: String(office.id),
            name: normalize(office.office_name ?? office.name) || "Office",
            status: normalize(office.status || "active").toLowerCase(),
        }));
        if (sourceOffices.length !== sourceOfficeIds.length) return jsonError("One source office could not be found.", 404, "OFFICE_MERGE_SOURCE_NOT_FOUND");
        if (sourceOffices.some((office) => isInactive(office.status))) return jsonError("One source office is already inactive, archived, or merged.", 400, "OFFICE_MERGE_SOURCE_INACTIVE");

        const now = new Date().toISOString();
        const { data: office, error: officeError } = await db.from("offices").insert({
            address: newOfficeLocation || null,
            city: newOfficeLocation || null,
            code: newOfficeCode,
            company_id: companyId,
            name: newOfficeName,
            office_code: newOfficeCode,
            office_name: newOfficeName,
            status: "active",
            updated_at: now,
        }).select("id").single();
        if (officeError || !office?.id) return jsonError(officeError?.message ?? "New merged office could not be created.", 500, "OFFICE_MERGE_NEW_OFFICE_CREATE_FAILED");
        createdOfficeId = String(office.id);

        const loginName = `${newOfficeName} Account`;
        const loginEmail = suggestedLoginEmail(loginName, companyId);
        const { data: authUser, error: authError } = await admin.auth.admin.createUser({
            email: loginEmail,
            email_confirm: true,
            password: newOfficePin,
            user_metadata: {
                account_type: "office",
                default_office_id: createdOfficeId,
                full_name: loginName,
                login_name: loginName,
                source: "office_merge",
            },
        });
        if (authError || !authUser.user?.id) throw new Error(authError?.message ?? "New office login could not be created.");
        createdUserId = authUser.user.id;

        const { error: userError } = await db.from("users").upsert({
            account_type: "office",
            company_id: companyId,
            default_office_id: createdOfficeId,
            email: loginEmail,
            full_name: loginName,
            id: createdUserId,
            status: "active",
            updated_at: now,
        });
        if (userError) throw new Error(userError.message);

        const pinResult = await db.rpc("ddumba_v1_set_pin_credential", { p_pin: newOfficePin, p_status: "active", p_user_id: createdUserId });
        if (pinResult.error) throw new Error(pinResult.error.message);

        const roleId = await defaultOfficeRoleId(db, companyId);
        if (!roleId) throw new Error("Office Manager role is missing. Apply default roles migration first.");
        const { error: roleError } = await db.from("user_office_roles").insert({
            company_id: companyId,
            office_id: createdOfficeId,
            role_id: roleId,
            scope: "office",
            user_id: createdUserId,
        });
        if (roleError) throw new Error(roleError.message);

        const results = [];
        for (const sourceOfficeId of sourceOfficeIds) {
            const sourceOffice = sourceOffices.find((officeRow) => officeRow.id === sourceOfficeId);
            const affectedCounts = await loadServerCounts(db, companyId, sourceOfficeId);
            const rpcResult = await db.rpc("ddumba_merge_offices", {
                p_admin_user_id: context.profile.id,
                p_company_id: companyId,
                p_confirmation: "MERGE",
                p_destination_office_id: createdOfficeId,
                p_expected_counts: { ...affectedCounts, newOfficeCreated: true, pinConfigured: true },
                p_reason_note: normalize(body.reasonNote) || null,
                p_source_office_id: sourceOfficeId,
                p_user_handling: accountHandling,
            });
            if (rpcResult.error) throw new Error(rpcResult.error.message ?? "Office merge could not be completed.");
            const result = (rpcResult.data ?? {}) as LooseRow;
            const batchId = normalize(result.batch_id);
            results.push({
                accountsReassigned: Number(result.accounts_reassigned ?? affectedCounts.officeUsers ?? 0),
                batchId,
                mergeReference: normalize(result.merge_reference) || "MERGE",
                mergedAt: normalize(result.merged_at) || now,
                sourceOfficeName: normalize(result.source_office_name) || sourceOffice?.name || "Office",
                sourceStatus: normalize(result.source_status) || "merged",
                transferredCounts: (result.transferred_counts ?? affectedCounts) as Record<string, number>,
            });
            await logUserAction({
                action: "office_merge_completed",
                afterData: {
                    accounts_deactivated: accountHandling === "disable",
                    destinationOfficeId: createdOfficeId,
                    destinationOfficeName: newOfficeName,
                    mergeReference: normalize(result.merge_reference) || "MERGE",
                    pin_configured: true,
                },
                beforeData: { sourceOfficeId, sourceOfficeName: sourceOffice?.name },
                companyId,
                entityId: batchId,
                entityType: "office_merge_batch",
                officeId: createdOfficeId,
            });
        }

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
            code: "OFFICE_MERGE_COMPLETED",
            destinationOfficeId: office.id,
            destinationOfficeName: newOfficeName,
            durationMs: Date.now() - startedAt,
            newOfficeCode,
            pinConfigured: true,
            results,
            success: true,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Office merge could not be completed.";
        console.error("[office-merge] production merge request failed", { message, createdOfficeId, createdUserId });
        const companyId = (await getAuthContext().catch(() => null))?.activeCompany?.id ?? null;
        if (companyId) await cleanupCreatedOffice(createSupabaseAdminClient(), companyId, createdOfficeId, createdUserId);
        return jsonError(message, 500, "OFFICE_MERGE_UNHANDLED");
    }
}
