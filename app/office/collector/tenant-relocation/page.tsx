import TenantRelocationCentre from "@/components/office/tenant-relocation/TenantRelocationCentre";
import { requireCollectorContext } from "@/lib/collectors/data";
import { getTenantRelocationPageData } from "@/lib/tenant-relocation/data";

export default async function CollectorTenantRelocationPage() {
    await requireCollectorContext();
    const data = await getTenantRelocationPageData();

    return <TenantRelocationCentre data={data} />;
}
