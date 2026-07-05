import { requireCompanyAdminMode } from "@/lib/auth/permissions";
import FastPaymentsEntry from "@/components/office/payments/FastPaymentsEntry";

export default async function AdminPaymentsPage() {
    const context = await requireCompanyAdminMode();

    return (
        <FastPaymentsEntry
            activeCompany={context.activeCompany}
            activeOffice={context.activeOffice}
            profile={context.profile}
            canPostPayments
            isAdmin
        />
    );
}
