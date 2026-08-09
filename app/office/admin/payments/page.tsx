import { canPostTenantPayments, requireCompanyReadMode } from "@/lib/auth/permissions";
import FastPaymentsEntry from "@/components/office/payments/FastPaymentsEntry";

export default async function AdminPaymentsPage() {
    const context = await requireCompanyReadMode();
    const isManager = context.isCompanyReadOnlyManager;

    return (
        <FastPaymentsEntry
            activeCompany={context.activeCompany}
            activeOffice={context.activeOffice}
            profile={context.profile}
            canPostPayments={canPostTenantPayments(context)}
            entryMode={isManager ? "manager" : "admin"}
            isAdmin={context.isCompanyAdmin && !context.isOfficeMode}
            searchOffices={context.offices}
        />
    );
}
