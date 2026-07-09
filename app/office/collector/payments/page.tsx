import FastPaymentsEntry from "@/components/office/payments/FastPaymentsEntry";
import { requireCollectorContext } from "@/lib/collectors/data";

export default async function CollectorPaymentsPage() {
    const context = await requireCollectorContext();

    return (
        <FastPaymentsEntry
            activeCompany={context.activeCompany}
            activeOffice={context.activeOffice}
            canPostPayments
            entryMode="collector"
            isAdmin={false}
            profile={context.profile}
        />
    );
}
