import VacantRoomsConsole from "@/components/office/vacant-rooms/VacantRoomsConsole";
import CollectorPageShell from "@/components/office/collectors/CollectorPageShell";
import { requireCollectorContext } from "@/lib/collectors/data";
import { getVacantRoomsPageData } from "@/lib/vacant-rooms/data";

export default async function CollectorVacantRoomsPage() {
    await requireCollectorContext();
    const data = await getVacantRoomsPageData();

    return (
        <CollectorPageShell
            title="Collector Vacant Rooms"
            subtitle="View the same live vacant-room inventory as Admin, with collector-safe request actions and search filters."
        >
            <VacantRoomsConsole data={data} />
        </CollectorPageShell>
    );
}
