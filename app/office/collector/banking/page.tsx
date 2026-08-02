import CollectorBankingConsole from "@/components/office/collectors/CollectorBankingConsole";
import { getCollectorBankingPageData } from "@/lib/collector-banking/data";
import { redirect } from "next/navigation";

export default async function CollectorBankingPage() {
    const data = await getCollectorBankingPageData().catch((error) => {
        if (error instanceof Error && /Field Collector account required/i.test(error.message)) {
            redirect("/office");
        }
        throw error;
    });
    return <CollectorBankingConsole data={data} />;
}
