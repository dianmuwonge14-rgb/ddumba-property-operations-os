import DefaultersConsole from "@/components/office/defaulters/DefaultersConsole";
import { requireCompanyAdminMode } from "@/lib/auth/permissions";
import { getDefaultersPageData } from "@/lib/defaulters/data";

export default async function AdminDefaultersPage() {
    await requireCompanyAdminMode();
    const data = await getDefaultersPageData({ admin: true });
    return <DefaultersConsole data={data} />;
}
