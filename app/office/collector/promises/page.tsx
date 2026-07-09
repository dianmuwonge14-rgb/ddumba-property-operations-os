import PromiseCentre from "@/components/office/promises/PromiseCentre";
import { hasPermission } from "@/lib/auth/permissions";
import { requireCollectorContext } from "@/lib/collectors/data";
import { getPromiseCentreData } from "@/lib/promises/data";

export default async function CollectorPromisesPage() {
    const context = await requireCollectorContext();
    const data = await getPromiseCentreData();

    return (
        <PromiseCentre
            activeCompany={context.activeCompany}
            activeOffice={context.activeOffice}
            canManage={hasPermission(context, "collections.manage") || hasPermission(context, "promises.manage")}
            data={data}
            entryMode="collector"
        />
    );
}
