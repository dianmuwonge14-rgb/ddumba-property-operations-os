"use client";

import { createContext, useContext, useMemo, useTransition } from "react";
import { setActiveCompany, setActiveOffice } from "@/app/actions/auth-context";
import type { AuthContext, Company, Office, PermissionKey } from "@/lib/auth/types";

type MultiOfficeContextValue = AuthContext & {
    isSwitchingContext: boolean;
    selectCompany: (companyId: string) => void;
    selectOffice: (officeId: string) => void;
    hasPermission: (permission: PermissionKey) => boolean;
};

const MultiOfficeContext = createContext<MultiOfficeContextValue | null>(null);

export function MultiOfficeProvider({
    initialContext,
    children,
}: {
    initialContext: AuthContext;
    children: React.ReactNode;
}) {
    const [isPending, startTransition] = useTransition();

    const value = useMemo<MultiOfficeContextValue>(() => ({
        ...initialContext,
        isSwitchingContext: isPending,
        selectCompany(companyId: Company["id"]) {
            startTransition(async () => {
                await setActiveCompany(companyId);
            });
        },
        selectOffice(officeId: Office["id"]) {
            startTransition(async () => {
                await setActiveOffice(officeId);
            });
        },
        hasPermission(permission: PermissionKey) {
            return initialContext.isCompanyAdmin || initialContext.permissions.includes(permission);
        },
    }), [initialContext, isPending]);

    return (
        <MultiOfficeContext.Provider value={value}>
            {children}
        </MultiOfficeContext.Provider>
    );
}

export function useMultiOffice() {
    const context = useContext(MultiOfficeContext);

    if (!context) {
        throw new Error("useMultiOffice must be used inside MultiOfficeProvider");
    }

    return context;
}
