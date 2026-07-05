import { requireCompanyAdminMode } from "@/lib/auth/permissions";
import { getTenantRelocationPageData } from "@/lib/tenant-relocation/data";
import TenantRelocationCentre from "@/components/office/tenant-relocation/TenantRelocationCentre";

export default async function AdminTenantRelocationPage() {
    await requireCompanyAdminMode();
    const data = await getTenantRelocationPageData({ admin: true });
    return <TenantRelocationCentre data={data} />;
}
