import BadDebtRecoveryCentre from "@/components/office/bad-debt/BadDebtRecoveryCentre";
import { getBadDebtRecoveryData } from "@/lib/bad-debt/data";

export default async function BadDebtRecoveryPage() {
    const data = await getBadDebtRecoveryData();
    return <BadDebtRecoveryCentre data={data} />;
}
