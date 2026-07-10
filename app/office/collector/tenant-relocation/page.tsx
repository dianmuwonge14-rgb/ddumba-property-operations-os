import TenantRelocationCentre from "@/components/office/tenant-relocation/TenantRelocationCentre";
import CollectorPageShell from "@/components/office/collectors/CollectorPageShell";
import { requireCollectorContext } from "@/lib/collectors/data";
import { getTenantRelocationPageData } from "@/lib/tenant-relocation/data";

export default async function CollectorTenantRelocationPage() {
    await requireCollectorContext();
    const data = await getTenantRelocationPageData();

    return (
        <CollectorPageShell
            title="Collector Tenant Relocation"
            subtitle="Review relocation history and submit collector relocation requests through the same live approval workflow."
        >
            <TenantRelocationCentre data={data} />
        </CollectorPageShell>
    );
}
