import CollectorBankingConsole from "@/components/office/collectors/CollectorBankingConsole";
import { getCollectorBankingPageData } from "@/lib/collector-banking/data";

export default async function CollectorBankingPage() {
    const data = await getCollectorBankingPageData();
    return <CollectorBankingConsole data={data} />;
}
