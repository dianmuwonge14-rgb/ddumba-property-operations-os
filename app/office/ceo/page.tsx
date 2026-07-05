import CeoCommandCentre from "@/components/office/ceo/CeoCommandCentre";
import { getCeoCommandData } from "@/lib/ceo-centre/data";
import { requireCompanyAdminMode } from "@/lib/auth/permissions";

export default async function CeoPage() {
    await requireCompanyAdminMode();
    const data = await getCeoCommandData();

    return <CeoCommandCentre data={data} />;
}
