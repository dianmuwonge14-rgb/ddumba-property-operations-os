import { requireCompanyReadMode } from "@/lib/auth/permissions";
import FastPaymentsEntry from "@/components/office/payments/FastPaymentsEntry";

export default async function AdminPaymentsPage() {
    const context = await requireCompanyReadMode();
    const readOnly = context.isCompanyReadOnlyManager;

    return (
        <FastPaymentsEntry
            activeCompany={context.activeCompany}
            activeOffice={context.activeOffice}
            profile={context.profile}
            canPostPayments={!readOnly}
            isAdmin={!readOnly}
            searchOffices={context.offices}
        />
    );
}
