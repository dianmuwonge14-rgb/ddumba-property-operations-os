import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AuthContext, Company, Office, Permission, Role, RoleAssignment, UserOfficeRole, UserProfile } from "@/lib/auth/types";

type DynamicDb = {
    from: (table: string) => any;
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export type DesktopLoginIdentity = {
    user_id: string | null;
    email: string | null;
    company_id: string | null;
    office_id: string | null;
    full_name: string | null;
    office_name?: string | null;
    is_company_admin: boolean;
    auth_mode: "admin" | "office" | "collector" | null;
    redirect_to: string | null;
    login_status?: "success" | "invalid" | "invalid_limit" | "locked" | "merged_office";
    attempts_remaining?: number | null;
    locked?: boolean | null;
};

const DESKTOP_SESSION_DAYS = 14;

function tokenHash(token: string) {
    return createHash("sha256").update(token).digest("hex");
}

function unique(values: Array<string | null | undefined>) {
    return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function hasCompanyWideScope(role: RoleAssignment) {
    return !role.office_id || role.scope === "company" || role.scope === "headquarters";
}

function isRoleAssignmentActive(assignment: UserOfficeRole) {
    const row = assignment as UserOfficeRole & { effective_from?: string | null; effective_to?: string | null; status?: string | null };
    const status = String(row.status ?? "active").toLowerCase();
    if (!["active", "approved", "current"].includes(status)) return false;
    const today = new Date().toISOString().slice(0, 10);
    const effectiveFrom = row.effective_from ? String(row.effective_from).slice(0, 10) : null;
    const effectiveTo = row.effective_to ? String(row.effective_to).slice(0, 10) : null;
    if (effectiveFrom && effectiveFrom > today) return false;
    if (effectiveTo && effectiveTo < today) return false;
    return true;
}

export function bearerTokenFromRequest(request: Request) {
    const value = request.headers.get("authorization") ?? "";
    const match = value.match(/^Bearer\s+(.+)$/i);
    return match?.[1]?.trim() || null;
}

export async function verifyDesktopLogin(input: {
    identifier: string;
    secret: string;
    userAgent: string | null;
}) {
    const db = createSupabaseAdminClient() as unknown as DynamicDb;
    const identifier = input.identifier.trim();
    const secret = input.secret.trim();
    if (secret.length < 4 || secret.length > 64) throw new Error("Enter a valid PIN/password.");

    const attempts: Array<[string, Record<string, unknown>]> = [];
    if (identifier) {
        attempts.push(["ddumba_v1_verify_read_only_manager_login", { p_identifier: identifier, p_secret: secret, p_user_agent: input.userAgent }]);
        attempts.push(["ddumba_v1_verify_personal_office_login", { p_identifier: identifier, p_secret: secret, p_user_agent: input.userAgent }]);
    }
    attempts.push(["ddumba_v1_verify_unified_login", { p_secret: secret, p_user_agent: input.userAgent }]);

    let lastError: string | null = null;
    for (const [fn, args] of attempts) {
        const { data, error } = await db.rpc(fn, args);
        if (error) {
            if (/function .* does not exist|schema cache/i.test(error.message ?? "")) continue;
            lastError = error.message;
            continue;
        }
        const identity = Array.isArray(data) ? data[0] as DesktopLoginIdentity | undefined : null;
        if (identity?.user_id || identity?.login_status) return identity;
    }
    if (lastError) throw new Error(lastError);
    return null;
}

export async function createDesktopSession(input: {
    deviceId: string;
    deviceName: string;
    identity: DesktopLoginIdentity;
    platform: string;
    userAgent: string | null;
}) {
    if (!input.identity.user_id || !input.identity.company_id || !input.identity.auth_mode) {
        throw new Error("Login profile is incomplete. Contact Admin.");
    }
    const token = `ddsk_${randomBytes(32).toString("base64url")}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + DESKTOP_SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const db = createSupabaseAdminClient() as unknown as DynamicDb;
    const context = await desktopContextForUser({
        authMode: input.identity.auth_mode,
        companyId: input.identity.company_id,
        officeId: input.identity.office_id,
        userId: input.identity.user_id,
    });

    await db.from("desktop_auth_sessions").insert({
        auth_mode: context.authMode,
        company_id: context.activeCompany?.id,
        device_id: input.deviceId,
        employee_id: (context.profile as unknown as { employee_id?: string | null } | null)?.employee_id ?? null,
        expires_at: expiresAt,
        last_seen_at: now.toISOString(),
        office_id: context.activeOffice?.id ?? null,
        scope: {
            canAccessAllOffices: context.canAccessAllOffices,
            officeIds: context.offices.map((office) => office.id),
            permissions: context.permissions,
            roles: context.roles.map((role) => role.role?.key).filter(Boolean),
        },
        status: "active",
        token_hash: tokenHash(token),
        user_id: context.profile?.id,
    });

    await db.from("desktop_devices").upsert({
        app_version: "0.1.0",
        company_id: context.activeCompany?.id,
        device_id: input.deviceId,
        device_name: input.deviceName.slice(0, 160) || "Desktop device",
        employee_id: (context.profile as unknown as { employee_id?: string | null } | null)?.employee_id ?? null,
        last_online_at: now.toISOString(),
        office_id: context.activeOffice?.id ?? null,
        platform: input.platform.slice(0, 80) || "desktop",
        status: "active",
        updated_at: now.toISOString(),
        user_agent: String(input.userAgent ?? "").slice(0, 400),
        user_id: context.profile?.id,
    }, { onConflict: "company_id,device_id" });

    return { context, expiresAt, token };
}

export async function requireDesktopContext(request: Request) {
    const token = bearerTokenFromRequest(request);
    if (!token) throw new Error("Desktop session is required.");
    const db = createSupabaseAdminClient() as unknown as DynamicDb;
    const { data: session, error } = await db
        .from("desktop_auth_sessions")
        .select("id, company_id, user_id, office_id, auth_mode, expires_at, status, device_id")
        .eq("token_hash", tokenHash(token))
        .eq("status", "active")
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!session) throw new Error("Desktop session has expired. Reconnect and sign in again.");
    if (new Date(String(session.expires_at)).getTime() <= Date.now()) {
        await db.from("desktop_auth_sessions").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", session.id);
        throw new Error("Desktop session has expired. Reconnect and sign in again.");
    }
    await db.from("desktop_auth_sessions").update({ last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", session.id);
    return desktopContextForUser({
        authMode: session.auth_mode as "admin" | "office" | "collector",
        companyId: session.company_id,
        officeId: session.office_id,
        userId: session.user_id,
    });
}

export async function desktopContextForUser(input: {
    authMode: "admin" | "office" | "collector";
    companyId: string;
    officeId: string | null;
    userId: string;
}): Promise<AuthContext> {
    const db = createSupabaseAdminClient() as unknown as DynamicDb;
    const { data: profile } = await db.from("users").select("*").eq("id", input.userId).eq("company_id", input.companyId).eq("status", "active").maybeSingle();
    if (!profile) throw new Error("Desktop user account is inactive or missing.");

    const { data: assignments } = await db.from("user_office_roles").select("*").eq("user_id", input.userId).eq("company_id", input.companyId);
    const activeAssignments = ((assignments ?? []) as UserOfficeRole[]).filter(isRoleAssignmentActive);
    const roleIds = unique(activeAssignments.map((assignment) => assignment.role_id));
    const { data: roles } = roleIds.length ? await db.from("roles").select("*").in("id", roleIds) : { data: [] as Role[] };
    const { data: rolePermissions } = roleIds.length
        ? await db.from("role_permissions").select("role_id, permissions(*)").in("role_id", roleIds)
        : { data: [] as Array<{ role_id: string; permissions: Permission | null }> };

    const permissionsByRole = new Map<string, Permission[]>();
    for (const row of rolePermissions ?? []) {
        const permission = row.permissions;
        if (!permission) continue;
        permissionsByRole.set(row.role_id, [...(permissionsByRole.get(row.role_id) ?? []), permission]);
    }

    const roleById = new Map(((roles ?? []) as Role[]).map((role) => [role.id, role]));
    const roleAssignments: RoleAssignment[] = activeAssignments.map((assignment) => ({
        ...assignment,
        permissions: permissionsByRole.get(assignment.role_id) ?? [],
        role: roleById.get(assignment.role_id) ?? null,
    }));
    const { data: companies } = await db.from("companies").select("*").eq("id", input.companyId).eq("status", "active");
    const activeCompany = (companies ?? [])[0] as Company | undefined;
    if (!activeCompany) throw new Error("Desktop company is inactive or missing.");

    const rawPermissionKeys = unique(roleAssignments.flatMap((assignment) => assignment.permissions.map((permission) => permission.key)));
    const roleKeys = unique(roleAssignments.map((assignment) => assignment.role?.key?.toLowerCase()));
    const rawCanAccessAllOffices = roleAssignments.some(hasCompanyWideScope);
    const rawIsCompanyAdmin = roleKeys.includes("company_admin") || roleKeys.includes("super_admin") || rawPermissionKeys.includes("settings.manage");
    const rawIsCompanyReadOnlyManager = roleKeys.includes("company_manager_read_only") || roleKeys.includes("executive_manager_read_only") || rawPermissionKeys.includes("admin.dashboard.read");
    const effectiveAuthMode = rawIsCompanyAdmin || rawIsCompanyReadOnlyManager ? "admin" : input.authMode;
    const officeIds = unique([
        (profile as UserProfile).default_office_id,
        effectiveAuthMode === "office" ? input.officeId : null,
        ...roleAssignments.map((assignment) => assignment.office_id),
    ]);

    let offices: Office[] = [];
    if (effectiveAuthMode === "collector" || (effectiveAuthMode === "admin" && (rawCanAccessAllOffices || rawIsCompanyAdmin || rawIsCompanyReadOnlyManager))) {
        const { data } = await db.from("offices").select("*").eq("company_id", input.companyId).ilike("status", "active").order("office_name");
        offices = data ?? [];
    } else if (officeIds.length) {
        const { data } = await db.from("offices").select("*").in("id", officeIds).ilike("status", "active").order("office_name");
        offices = data ?? [];
    }
    const activeOffice = offices.find((office) => office.id === input.officeId) ?? offices.find((office) => office.id === (profile as UserProfile).default_office_id) ?? offices[0] ?? null;
    const isOfficeMode = effectiveAuthMode === "office";
    const isCollectorMode = effectiveAuthMode === "collector";
    const canAccessAllOffices = !isOfficeMode && (rawCanAccessAllOffices || rawIsCompanyAdmin || rawIsCompanyReadOnlyManager);

    return {
        activeCompany,
        activeOffice,
        authMode: effectiveAuthMode,
        authUser: null,
        canAccessAllOffices,
        companies: [activeCompany],
        isAuthenticated: true,
        isCompanyAdmin: !isOfficeMode && !isCollectorMode && rawIsCompanyAdmin,
        isCompanyReadOnlyManager: !isOfficeMode && !isCollectorMode && rawIsCompanyReadOnlyManager && !rawIsCompanyAdmin,
        isOfficeMode,
        offices,
        permissions: isOfficeMode ? rawPermissionKeys.filter((permission) => !["settings.view", "settings.manage", "reports.manage"].includes(permission)) : rawPermissionKeys,
        profile: profile as UserProfile,
        roles: roleAssignments,
        sessionExpiresAt: null,
    };
}

export async function requestUserAgent() {
    const headerStore = await headers();
    return headerStore.get("user-agent");
}
