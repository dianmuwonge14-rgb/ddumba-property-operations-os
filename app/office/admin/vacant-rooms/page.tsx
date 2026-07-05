import { requireCompanyAdminMode } from "@/lib/auth/permissions";
import { getVacantRoomsPageData } from "@/lib/vacant-rooms/data";
import VacantRoomsConsole from "@/components/office/vacant-rooms/VacantRoomsConsole";

export default async function AdminVacantRoomsPage() {
    await requireCompanyAdminMode();
    const data = await getVacantRoomsPageData({ admin: true });
    return <VacantRoomsConsole data={data} />;
}
