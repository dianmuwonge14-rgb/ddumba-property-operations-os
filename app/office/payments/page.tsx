import { requirePermission } from "@/lib/auth/permissions";
import FastPaymentsEntry from "@/components/office/payments/FastPaymentsEntry";

export default async function OfficePaymentsPage() {
    const context = await requirePermission("collections.payment.post");

    return (
        <FastPaymentsEntry
            activeCompany={context.activeCompany}
            activeOffice={context.activeOffice}
            profile={context.profile}
            canPostPayments={context.isCompanyAdmin || context.permissions.includes("collections.payment.post")}
            isAdmin={false}
        />
    );
}
