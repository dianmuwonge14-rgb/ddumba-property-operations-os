import { canPostTenantPayments, requireTenantPaymentEntryAccess } from "@/lib/auth/permissions";
import FastPaymentsEntry from "@/components/office/payments/FastPaymentsEntry";

export default async function OfficePaymentsPage() {
    const context = await requireTenantPaymentEntryAccess();

    return (
        <FastPaymentsEntry
            activeCompany={context.activeCompany}
            activeOffice={context.activeOffice}
            profile={context.profile}
            canPostPayments={canPostTenantPayments(context)}
            isAdmin={false}
        />
    );
}
