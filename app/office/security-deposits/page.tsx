import SecurityDepositsConsole from "@/components/office/security-deposits/SecurityDepositsConsole";
import { getSecurityDepositsPageData } from "@/lib/security-deposits/data";

export default async function SecurityDepositsPage() {
    const data = await getSecurityDepositsPageData();
    return <SecurityDepositsConsole data={data} />;
}
