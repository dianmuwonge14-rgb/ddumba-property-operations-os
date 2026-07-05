import { hasPermission, requireAuth } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import { getTenantRelocationPageData } from "@/lib/tenant-relocation/data";
import TenantRelocationCentre from "@/components/office/tenant-relocation/TenantRelocationCentre";

export default async function OfficeTenantRelocationPage() {
    const context = await requireAuth();
    if (!hasPermission(context, "collections.read") && !hasPermission(context, "properties.read")) {
        redirect("/office");
    }

    const data = await getTenantRelocationPageData({ admin: false });
    return <TenantRelocationCentre data={data} />;
}
