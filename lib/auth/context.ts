import { cache } from "react";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AuthContext, Company, Office, Permission, Role, RoleAssignment, UserOfficeRole } from "./types";

const ACTIVE_COMPANY_COOKIE = "ddumba_active_company_id";
const ACTIVE_OFFICE_COOKIE = "ddumba_active_office_id";
const AUTH_MODE_COOKIE = "ddumba_auth_mode";
const SESSION_EXPIRES_COOKIE = "ddumba_session_expires_at";
const SESSION_EXPIRES_HINT_COOKIE = "ddumba_session_expires_hint";
const SESSION_DEVICE_COOKIE = "ddumba_session_device_id";
const SESSION_CONTROLLED_COOKIE = "ddumba_session_controlled";
const SESSION_DURATION_SECONDS = 60 * 60;
const SESSION_DURATION_MS = SESSION_DURATION_SECONDS * 1000;
const SESSION_WARNING_MS = 5 * 60 * 1000;

const sessionCookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
};

const sessionHintCookieOptions = {
    httpOnly: false,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
};

const sessionControlCookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
};

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

function isInvalidRefreshTokenError(error: unknown) {
    return /invalid refresh token|refresh token not found|refresh_token_not_found/i.test(error instanceof Error ? error.message : String(error ?? ""));
}

export const getAuthContext = cache(async (): Promise<AuthContext> => {
    const supabase = await createSupabaseServerClient();
    const cookieStore = await cookies();

    const { data: userResult } = await supabase.auth.getUser().catch((error) => {
        if (isInvalidRefreshTokenError(error)) {
            return { data: { user: null } };
        }
        throw error;
    });
    const authUser = userResult.user;
    const requestedOfficeId = cookieStore.get(ACTIVE_OFFICE_COOKIE)?.value;
    const authModeCookie = cookieStore.get(AUTH_MODE_COOKIE)?.value;
    const requestedAuthMode = authModeCookie === "collector"
        ? "collector"
        : authModeCookie === "office" || (!authModeCookie && requestedOfficeId)
            ? "office"
            : "admin";

    if (!authUser) {
        return emptyAuthContext();
    }

    const sessionExpiresAt = Number(cookieStore.get(SESSION_EXPIRES_COOKIE)?.value ?? 0);
    const hasControlledSession = cookieStore.get(SESSION_CONTROLLED_COOKIE)?.value === "1";
    if ((hasControlledSession && !sessionExpiresAt) || (sessionExpiresAt && sessionExpiresAt <= Date.now())) {
        return {
            ...emptyAuthContext(),
            authUser,
        };
    }

    const { data: profile } = await supabase
        .from("users")
        .select("*")
        .eq("id", authUser.id)
        .eq("status", "active")
        .maybeSingle();

    if (!profile) {
        return {
            ...emptyAuthContext(),
            authUser,
        };
    }

    const { data: assignments } = await supabase
        .from("user_office_roles")
        .select("*")
        .eq("user_id", profile.id)
        .eq("company_id", profile.company_id);

    const activeAssignments = (assignments ?? []).filter(isRoleAssignmentActive);
    const roleIds = unique(activeAssignments.map((assignment) => assignment.role_id));

    const { data: roles } = roleIds.length
        ? await supabase.from("roles").select("*").in("id", roleIds)
        : { data: [] as Role[] };

    const { data: rolePermissions } = roleIds.length
        ? await supabase
            .from("role_permissions")
            .select("role_id, permissions(*)")
            .in("role_id", roleIds)
        : { data: [] as Array<{ role_id: string; permissions: Permission | null }> };

    const permissionsByRole = new Map<string, Permission[]>();
    for (const row of rolePermissions ?? []) {
        const permission = row.permissions;
        if (!permission) continue;
        permissionsByRole.set(row.role_id, [
            ...(permissionsByRole.get(row.role_id) ?? []),
            permission,
        ]);
    }

    const roleById = new Map((roles ?? []).map((role) => [role.id, role]));
    const roleAssignments: RoleAssignment[] = activeAssignments.map((assignment) => ({
        ...assignment,
        role: roleById.get(assignment.role_id) ?? null,
        permissions: permissionsByRole.get(assignment.role_id) ?? [],
    }));

    const companyIds = unique([
        profile.company_id,
        ...roleAssignments.map((assignment) => assignment.company_id),
    ]);

    const { data: companies } = companyIds.length
        ? await supabase.from("companies").select("*").in("id", companyIds).eq("status", "active")
        : { data: [] as Company[] };

    const requestedCompanyId = cookieStore.get(ACTIVE_COMPANY_COOKIE)?.value;
    const activeCompany =
        companies?.find((company) => company.id === requestedCompanyId) ??
        companies?.find((company) => company.id === profile.company_id) ??
        companies?.[0] ??
        null;

    const companyRoles = roleAssignments.filter(
        (assignment) => assignment.company_id === activeCompany?.id,
    );
    const rawCanAccessAllOffices = companyRoles.some(hasCompanyWideScope);
    const rawPermissionKeys = unique(
        companyRoles.flatMap((assignment) => assignment.permissions.map((permission) => permission.key)),
    );
    const roleKeys = unique(companyRoles.map((assignment) => assignment.role?.key?.toLowerCase()));
    const rawIsCompanyAdmin =
        roleKeys.includes("company_admin") ||
        roleKeys.includes("super_admin") ||
        rawPermissionKeys.includes("settings.manage");
    const rawIsCompanyReadOnlyManager =
        roleKeys.includes("company_manager_read_only") ||
        roleKeys.includes("executive_manager_read_only") ||
        rawPermissionKeys.includes("admin.dashboard.read");
    const effectiveAuthMode = rawIsCompanyAdmin || rawIsCompanyReadOnlyManager ? "admin" : requestedAuthMode;
    const requestedAdminWideAccess = effectiveAuthMode === "admin" && (rawIsCompanyAdmin || rawIsCompanyReadOnlyManager);
    const officeIds = unique([
        profile.default_office_id,
        effectiveAuthMode === "office" ? requestedOfficeId : null,
        ...companyRoles.map((assignment) => assignment.office_id),
    ]);

    let offices: Office[] = [];
    if (activeCompany && (effectiveAuthMode === "collector" || (effectiveAuthMode === "admin" && (rawCanAccessAllOffices || requestedAdminWideAccess)))) {
        const { data } = await supabase
            .from("offices")
            .select("*")
            .eq("company_id", activeCompany.id)
            .ilike("status", "active")
            .order("office_name");
        offices = data ?? [];
    } else if (officeIds.length) {
        const { data } = await supabase
            .from("offices")
            .select("*")
            .in("id", officeIds)
            .ilike("status", "active")
            .order("office_name");
        offices = data ?? [];
    }

    const activeOffice =
        offices.find((office) => office.id === requestedOfficeId) ??
        offices.find((office) => office.id === profile.default_office_id) ??
        offices[0] ??
        null;

    const isOfficeMode = effectiveAuthMode === "office";
    const isCollectorMode = effectiveAuthMode === "collector";
    const canAccessAllOffices = !isOfficeMode && (rawCanAccessAllOffices || rawIsCompanyAdmin || rawIsCompanyReadOnlyManager);
    const isCompanyAdmin = !isOfficeMode && !isCollectorMode && rawIsCompanyAdmin;
    const isCompanyReadOnlyManager = !isOfficeMode && !isCollectorMode && rawIsCompanyReadOnlyManager && !rawIsCompanyAdmin;
    const permissionKeys = isOfficeMode
        ? rawPermissionKeys.filter((permission) => !["settings.view", "settings.manage", "reports.manage"].includes(permission))
        : rawPermissionKeys;

    return {
        authUser,
        profile,
        authMode: effectiveAuthMode,
        activeCompany,
        activeOffice,
        companies: companies ?? [],
        offices,
        roles: roleAssignments,
        permissions: permissionKeys,
        isAuthenticated: true,
        isCompanyAdmin,
        isCompanyReadOnlyManager,
        canAccessAllOffices,
        isOfficeMode,
        sessionExpiresAt: sessionExpiresAt || null,
    };
});

export function emptyAuthContext(): AuthContext {
    return {
        authUser: null,
        profile: null,
        authMode: "office",
        activeCompany: null,
        activeOffice: null,
        companies: [],
        offices: [],
        roles: [],
        permissions: [],
        isAuthenticated: false,
        isCompanyAdmin: false,
        isCompanyReadOnlyManager: false,
        canAccessAllOffices: false,
        isOfficeMode: false,
        sessionExpiresAt: null,
    };
}

function nextSessionExpiry() {
    return Date.now() + SESSION_DURATION_MS;
}

function sessionDeviceId(existing?: string | null) {
    return existing || crypto.randomUUID();
}

function setSessionCookies(cookieStore: {
    get?: (name: string) => { value?: string } | undefined;
    set: (name: string, value: string, options?: Record<string, unknown>) => void;
}) {
    const expiresAt = nextSessionExpiry();
    const deviceId = sessionDeviceId(cookieStore.get?.(SESSION_DEVICE_COOKIE)?.value ?? null);
    cookieStore.set(SESSION_EXPIRES_COOKIE, String(expiresAt), sessionCookieOptions);
    cookieStore.set(SESSION_EXPIRES_HINT_COOKIE, String(expiresAt), sessionHintCookieOptions);
    cookieStore.set(SESSION_DEVICE_COOKIE, deviceId, sessionCookieOptions);
    cookieStore.set(SESSION_CONTROLLED_COOKIE, "1", sessionControlCookieOptions);
    return { deviceId, expiresAt };
}

function clearSessionCookies(cookieStore: {
    delete: (name: string) => void;
}) {
    cookieStore.delete(SESSION_EXPIRES_COOKIE);
    cookieStore.delete(SESSION_EXPIRES_HINT_COOKIE);
    cookieStore.delete(SESSION_DEVICE_COOKIE);
    cookieStore.delete(SESSION_CONTROLLED_COOKIE);
}

export {
    ACTIVE_COMPANY_COOKIE,
    ACTIVE_OFFICE_COOKIE,
    AUTH_MODE_COOKIE,
    SESSION_DEVICE_COOKIE,
    SESSION_CONTROLLED_COOKIE,
    SESSION_DURATION_MS,
    SESSION_EXPIRES_COOKIE,
    SESSION_EXPIRES_HINT_COOKIE,
    SESSION_WARNING_MS,
    clearSessionCookies,
    setSessionCookies,
};
