import { requireCompanyReadMode } from "@/lib/auth/permissions";
import { getTenantRelocationPageData } from "@/lib/tenant-relocation/data";
import TenantRelocationCentre from "@/components/office/tenant-relocation/TenantRelocationCentre";

export default async function AdminTenantRelocationPage() {
    await requireCompanyReadMode();
    const data = await getTenantRelocationPageData({ admin: true });
    return <TenantRelocationCentre data={data} />;
}
