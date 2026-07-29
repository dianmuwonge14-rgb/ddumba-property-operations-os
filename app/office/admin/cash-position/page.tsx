import CashPositionCentre from "@/components/office/cash-position/CashPositionCentre";
import { getCashPositionCentreData } from "@/lib/cash-position-centre/data";

type Props = {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function scalar(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
}

export default async function AdminCashPositionCentrePage({ searchParams }: Props) {
    const params = await searchParams;
    const data = await getCashPositionCentreData({
        endDate: scalar(params.endDate),
        officeId: scalar(params.officeId) ?? null,
        paymentMethod: scalar(params.paymentMethod) ?? null,
        period: scalar(params.period) ?? null,
        startDate: scalar(params.startDate),
    });

    return <CashPositionCentre data={data} />;
}
