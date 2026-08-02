import AdminCollectorBankingConsole from "@/components/office/collectors/AdminCollectorBankingConsole";
import { getAdminCollectorBankingData } from "@/lib/collector-banking/data";

export default async function AdminCollectorBankingPage() {
    const data = await getAdminCollectorBankingData();
    return <AdminCollectorBankingConsole data={data} />;
}
