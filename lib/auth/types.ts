import type { User } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export type Company = Database["public"]["Tables"]["companies"]["Row"];
export type Office = Database["public"]["Tables"]["offices"]["Row"];
export type UserProfile = Database["public"]["Tables"]["users"]["Row"];
export type Role = Database["public"]["Tables"]["roles"]["Row"];
export type Permission = Database["public"]["Tables"]["permissions"]["Row"];
export type UserOfficeRole = Database["public"]["Tables"]["user_office_roles"]["Row"];

export type RoleAssignment = UserOfficeRole & {
    role: Role | null;
    permissions: Permission[];
};

export type AuthContext = {
    authUser: User | null;
    profile: UserProfile | null;
    authMode: "admin" | "office";
    activeCompany: Company | null;
    activeOffice: Office | null;
    companies: Company[];
    offices: Office[];
    roles: RoleAssignment[];
    permissions: string[];
    isAuthenticated: boolean;
    isCompanyAdmin: boolean;
    canAccessAllOffices: boolean;
    isOfficeMode: boolean;
};

export type PermissionKey =
    | "dashboard.view"
    | "collections.view"
    | "collections.manage"
    | "promises.view"
    | "promises.manage"
    | "properties.view"
    | "properties.manage"
    | "landlords.view"
    | "landlords.manage"
    | "expenses.view"
    | "expenses.manage"
    | "attendance.view"
    | "attendance.manage"
    | "reports.view"
    | "settings.view"
    | "settings.manage"
    | "ai.view"
    | "notifications.view"
    | string;
