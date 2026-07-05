import { hasPermission, requireAuth } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";
import DefaultersConsole from "@/components/office/defaulters/DefaultersConsole";
import { getDefaultersPageData } from "@/lib/defaulters/data";

export default async function OfficeDefaultersPage() {
    const context = await requireAuth();
    if (!hasPermission(context, "collections.read") && !hasPermission(context, "properties.read")) {
        redirect("/office");
    }

    const data = await getDefaultersPageData({ admin: false });
    return <DefaultersConsole data={data} />;
}
