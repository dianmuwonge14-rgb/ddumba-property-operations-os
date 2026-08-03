import DefaultersConsole from "@/components/office/defaulters/DefaultersConsole";
import { requireCompanyReadMode } from "@/lib/auth/permissions";
import { getDefaultersPageData } from "@/lib/defaulters/data";

export default async function AdminDefaultersPage() {
    await requireCompanyReadMode();
    const data = await getDefaultersPageData({ admin: true });
    return <DefaultersConsole data={data} />;
}
