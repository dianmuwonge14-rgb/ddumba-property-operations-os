import { requirePermission } from "@/lib/auth/permissions";
import { getPromiseCentreData } from "@/lib/promises/data";
import PromiseCentre from "@/components/office/promises/PromiseCentre";

export default async function PromiseCentrePage() {
    const context = await requirePermission("collections.read");
    const data = await getPromiseCentreData();

    return (
        <PromiseCentre
            activeCompany={context.activeCompany}
            activeOffice={context.activeOffice}
            canManage={context.isCompanyAdmin || context.permissions.includes("collections.manage")}
            data={data}
        />
    );
}
