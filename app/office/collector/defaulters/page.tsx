import DefaultersConsole from "@/components/office/defaulters/DefaultersConsole";
import { requireAuth } from "@/lib/auth/permissions";
import { isCollectorContext } from "@/lib/collectors/data";
import { getDefaultersPageData } from "@/lib/defaulters/data";
import { redirect } from "next/navigation";

function scalar(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
}

export default async function CollectorDefaultersPage({ searchParams }: { searchParams: Promise<{ officeId?: string | string[]; landlordId?: string | string[] }> }) {
    const context = await requireAuth();
    if (!isCollectorContext(context)) redirect("/office/defaulters");
    const params = await searchParams;
    const data = await getDefaultersPageData({
        admin: false,
        landlordId: scalar(params.landlordId) ?? null,
        officeId: scalar(params.officeId) ?? null,
    });
    return <DefaultersConsole data={data} />;
}
