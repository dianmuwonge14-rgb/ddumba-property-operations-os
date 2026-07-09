import VacantRoomsConsole from "@/components/office/vacant-rooms/VacantRoomsConsole";
import { requireCollectorContext } from "@/lib/collectors/data";
import { getVacantRoomsPageData } from "@/lib/vacant-rooms/data";

export default async function CollectorVacantRoomsPage() {
    await requireCollectorContext();
    const data = await getVacantRoomsPageData();

    return <VacantRoomsConsole data={data} />;
}
