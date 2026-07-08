import { cache } from "react";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AuthContext, Company, Office, Permission, Role, RoleAssignment } from "./types";

const ACTIVE_COMPANY_COOKIE = "ddumba_active_company_id";
const ACTIVE_OFFICE_COOKIE = "ddumba_active_office_id";
const AUTH_MODE_COOKIE = "ddumba_auth_mode";

function unique(values: Array<string | null | undefined>) {
    return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function hasCompanyWideScope(role: RoleAssignment) {
    return !role.office_id || role.scope === "company" || role.scope === "headquarters";
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

    const roleIds = unique(assignments?.map((assignment) => assignment.role_id) ?? []);

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
    const roleAssignments: RoleAssignment[] = (assignments ?? []).map((assignment) => ({
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
    const roleKeys = unique(companyRoles.map((assignment) => assignment.role?.key));
    const rawIsCompanyAdmin =
        roleKeys.includes("company_admin") ||
        roleKeys.includes("super_admin") ||
        rawPermissionKeys.includes("settings.manage");
    const requestedAdminWideAccess = requestedAuthMode === "admin" && rawIsCompanyAdmin;
    const officeIds = unique([
        profile.default_office_id,
        requestedAuthMode === "office" ? requestedOfficeId : null,
        ...companyRoles.map((assignment) => assignment.office_id),
    ]);

    let offices: Office[] = [];
    if (activeCompany && (requestedAuthMode === "collector" || (requestedAuthMode === "admin" && (rawCanAccessAllOffices || requestedAdminWideAccess)))) {
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

    const isOfficeMode = requestedAuthMode === "office";
    const isCollectorMode = requestedAuthMode === "collector";
    const canAccessAllOffices = !isOfficeMode && (rawCanAccessAllOffices || rawIsCompanyAdmin);
    const isCompanyAdmin = !isOfficeMode && !isCollectorMode && rawIsCompanyAdmin;
    const permissionKeys = isOfficeMode
        ? rawPermissionKeys.filter((permission) => !["settings.view", "settings.manage", "reports.manage"].includes(permission))
        : rawPermissionKeys;

    return {
        authUser,
        profile,
        authMode: requestedAuthMode,
        activeCompany,
        activeOffice,
        companies: companies ?? [],
        offices,
        roles: roleAssignments,
        permissions: permissionKeys,
        isAuthenticated: true,
        isCompanyAdmin,
        canAccessAllOffices,
        isOfficeMode,
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
        canAccessAllOffices: false,
        isOfficeMode: false,
    };
}

export { ACTIVE_COMPANY_COOKIE, ACTIVE_OFFICE_COOKIE, AUTH_MODE_COOKIE };
