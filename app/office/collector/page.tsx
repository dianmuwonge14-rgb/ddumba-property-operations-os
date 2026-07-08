import CollectorConsole from "@/components/office/collectors/CollectorConsole";
import { getCollectorDashboardData } from "@/lib/collectors/data";

export default async function CollectorDashboardPage() {
    const data = await getCollectorDashboardData();
    return <CollectorConsole data={data} mode="dashboard" />;
}
