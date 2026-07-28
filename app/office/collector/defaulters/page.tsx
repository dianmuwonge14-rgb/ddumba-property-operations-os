import DefaultersConsole from "@/components/office/defaulters/DefaultersConsole";
import { requireAuth } from "@/lib/auth/permissions";
import { isCollectorContext } from "@/lib/collectors/data";
import { getDefaultersPageData } from "@/lib/defaulters/data";
import { redirect } from "next/navigation";

export default async function CollectorDefaultersPage() {
    const context = await requireAuth();
    if (!isCollectorContext(context)) redirect("/office/defaulters");
    const data = await getDefaultersPageData({ admin: false });
    return <DefaultersConsole data={data} />;
}
