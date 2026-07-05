import OfficeMergeCentre from "@/components/office/admin/OfficeMergeCentre";
import { requireCompanyAdminMode } from "@/lib/auth/permissions";
import { getOfficeMergeData } from "@/lib/office-merge/data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OfficeMergePage() {
    await requireCompanyAdminMode();
    const data = await getOfficeMergeData();

    return <OfficeMergeCentre data={data} />;
}
