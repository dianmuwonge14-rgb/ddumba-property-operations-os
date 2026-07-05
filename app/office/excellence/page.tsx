import { getDashboardLiveData } from "@/lib/dashboard-live/data";
import OfficeExcellenceLeague from "@/components/office/dashboard-live/OfficeExcellenceLeague";
import { requireCompanyAdminMode } from "@/lib/auth/permissions";

export default async function OfficeExcellencePage() {
    await requireCompanyAdminMode();
    const data = await getDashboardLiveData();

    return <OfficeExcellenceLeague data={data} />;
}
