import { requirePermission } from "@/lib/auth/permissions";
import { getPropertiesPageData } from "@/lib/properties/data";
import PropertiesConsole from "@/components/office/properties/PropertiesConsole";

export default async function PropertiesPage() {
    const context = await requirePermission("properties.read");
    const data = await getPropertiesPageData();

    return (
        <PropertiesConsole
            canManage={context.isCompanyAdmin || context.permissions.includes("properties.manage")}
            data={data}
            isAdmin={context.isCompanyAdmin && !context.isOfficeMode}
        />
    );
}
