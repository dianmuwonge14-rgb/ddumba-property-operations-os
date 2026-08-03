import AdminCommandCentre from "@/components/office/admin/AdminCommandCentre";
import { getAdminCentreOverviewData } from "@/lib/admin-centre/data";
import { requireCompanyReadMode } from "@/lib/auth/permissions";

export default async function OfficeAdminPage() {
    await requireCompanyReadMode();
    const data = await getAdminCentreOverviewData();

    return <AdminCommandCentre data={data} deferSecondary />;
}
