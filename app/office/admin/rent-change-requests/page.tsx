import RentChangeRequestsCentre from "@/components/office/admin/RentChangeRequestsCentre";
import { getAdminCentreData } from "@/lib/admin-centre/data";
import { requireCompanyAdminMode } from "@/lib/auth/permissions";

export default async function RentChangeRequestsPage() {
    await requireCompanyAdminMode();
    const data = await getAdminCentreData();

    return <RentChangeRequestsCentre data={data} />;
}
