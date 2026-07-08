import CollectorConsole from "@/components/office/collectors/CollectorConsole";
import { getCollectorDashboardData } from "@/lib/collectors/data";

export default async function CollectorPromisesPage() {
    const data = await getCollectorDashboardData();
    return <CollectorConsole data={data} mode="promises" />;
}
