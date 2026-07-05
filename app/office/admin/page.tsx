import AdminCommandCentre from "@/components/office/admin/AdminCommandCentre";
import { getAdminCentreOverviewData } from "@/lib/admin-centre/data";
import { requireCompanyAdminMode } from "@/lib/auth/permissions";

export default async function OfficeAdminPage() {
    await requireCompanyAdminMode();
    const data = await getAdminCentreOverviewData();

    return <AdminCommandCentre data={data} deferSecondary />;
}
