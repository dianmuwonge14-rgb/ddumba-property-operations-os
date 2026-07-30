import CashBankingConsole from "@/components/office/cash-banking/CashBankingConsole";
import OfficeCollectorSubmissions from "@/components/office/collectors/OfficeCollectorSubmissions";
import { getCashBankingData } from "@/lib/cash-banking/data";
import { getOfficeCollectorSubmissionData } from "@/lib/collectors/data";

type Props = {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function scalar(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
}

export default async function OfficeCashBankingPage({ searchParams }: Props) {
    const params = await searchParams;
    const data = await getCashBankingData({
        startDate: scalar(params.startDate),
        endDate: scalar(params.endDate),
    });
    const submissionsResult = await getOfficeCollectorSubmissionData().catch((error) => {
        console.warn("cash-banking optional collector submissions failed", {
            message: error instanceof Error ? error.message : String(error),
            route: "/office/cash-banking",
        });
        return [];
    });

    return (
        <>
            <OfficeCollectorSubmissions submissions={submissionsResult} />
            <CashBankingConsole data={data} />
        </>
    );
}
