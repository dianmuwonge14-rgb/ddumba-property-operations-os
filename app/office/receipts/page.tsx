import ReceiptHistoryConsole from "@/components/office/receipts/ReceiptHistoryConsole";
import { getReceiptHistoryData } from "@/lib/receipts/data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function scalar(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
}

export default async function ReceiptsPage({ searchParams }: Props) {
    const params = await searchParams;
    const data = await getReceiptHistoryData({
        collectorId: scalar(params.collectorId) ?? null,
        endDate: scalar(params.endDate) ?? scalar(params.dateTo) ?? null,
        officeId: scalar(params.officeId) ?? null,
        startDate: scalar(params.startDate) ?? scalar(params.dateFrom) ?? null,
    });
    return <ReceiptHistoryConsole error={data.error} receipts={data.receipts} />;
}
