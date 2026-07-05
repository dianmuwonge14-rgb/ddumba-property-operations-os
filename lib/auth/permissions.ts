import { redirect } from "next/navigation";
import { getAuthContext } from "./context";
import type { AuthContext, PermissionKey } from "./types";

export function hasPermission(context: AuthContext, permission: PermissionKey) {
    if (context.isCompanyAdmin || context.permissions.includes(permission)) return true;

    const [module, action] = permission.split(".");
    if (!module || !action) return false;

    if ((action === "read" || action === "view") && context.permissions.includes(`${module}.manage`)) return true;
    if (action === "read" && context.permissions.includes(`${module}.view`)) return true;
    if (action === "view" && context.permissions.includes(`${module}.read`)) return true;

    return false;
}

export function hasAnyPermission(context: AuthContext, permissions: PermissionKey[]) {
    return context.isCompanyAdmin || permissions.some((permission) => context.permissions.includes(permission));
}

export function canAccessOffice(context: AuthContext, officeId: string | null | undefined) {
    if (!officeId) return context.canAccessAllOffices;
    if (context.canAccessAllOffices) return true;
    return context.offices.some((office) => office.id === officeId);
}

export function canAccessCompany(context: AuthContext, companyId: string | null | undefined) {
    if (!companyId) return false;
    return context.companies.some((company) => company.id === companyId);
}

export async function requireAuth() {
    const context = await getAuthContext();

    if (!context.isAuthenticated || !context.profile) {
        redirect("/");
    }

    return context;
}

export async function requirePermission(permission: PermissionKey) {
    const context = await requireAuth();

    if (!hasPermission(context, permission)) {
        redirect("/office");
    }

    return context;
}

export async function requireCompanyAdminMode() {
    const context = await requireAuth();

    if (!context.isCompanyAdmin || context.isOfficeMode) {
        redirect("/office");
    }

    return context;
}

export async function requireOfficeAccess(officeId: string) {
    const context = await requireAuth();

    if (!canAccessOffice(context, officeId)) {
        redirect("/office");
    }

    return context;
}
