import FastPaymentsEntry from "@/components/office/payments/FastPaymentsEntry";
import CollectorPageShell from "@/components/office/collectors/CollectorPageShell";
import { requireCollectorContext } from "@/lib/collectors/data";

export default async function CollectorPaymentsPage() {
    const context = await requireCollectorContext();

    return (
        <CollectorPageShell
            title="Collector Payments Entry"
            subtitle="Use the same live tenant search, balance cards, receipt workflow, and allocation logic as the office payment entry."
        >
        <FastPaymentsEntry
            activeCompany={context.activeCompany}
            activeOffice={context.activeOffice}
            canPostPayments
            entryMode="collector"
            isAdmin={false}
            profile={context.profile}
        />
        </CollectorPageShell>
    );
}
