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
    const [data, submissions] = await Promise.all([
        getCashBankingData({
            startDate: scalar(params.startDate),
            endDate: scalar(params.endDate),
        }),
        getOfficeCollectorSubmissionData(),
    ]);

    return (
        <>
            <OfficeCollectorSubmissions submissions={submissions} />
            <CashBankingConsole data={data} />
        </>
    );
}
