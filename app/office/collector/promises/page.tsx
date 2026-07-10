import PromiseCentre from "@/components/office/promises/PromiseCentre";
import CollectorPageShell from "@/components/office/collectors/CollectorPageShell";
import { requireCollectorContext } from "@/lib/collectors/data";
import { getPromiseCentreData } from "@/lib/promises/data";

export default async function CollectorPromisesPage() {
    const context = await requireCollectorContext();
    const data = await getPromiseCentreData();

    return (
        <CollectorPageShell
            title="Collector Promise Entry"
            subtitle="Search every tenant live, capture promises against the correct room and office, and keep the office Promise Centre updated."
        >
        <PromiseCentre
            activeCompany={context.activeCompany}
            activeOffice={context.activeOffice}
            canManage
            data={data}
            entryMode="collector"
        />
        </CollectorPageShell>
    );
}
