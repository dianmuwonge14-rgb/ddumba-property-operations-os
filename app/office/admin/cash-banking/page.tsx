import CashBankingConsole from "@/components/office/cash-banking/CashBankingConsole";
import { getCashBankingData } from "@/lib/cash-banking/data";

type Props = {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function scalar(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
}

export default async function AdminCashBankingPage({ searchParams }: Props) {
    const params = await searchParams;
    const data = await getCashBankingData({
        startDate: scalar(params.startDate),
        endDate: scalar(params.endDate),
        officeId: scalar(params.officeId) ?? null,
    });

    return <CashBankingConsole data={data} />;
}
