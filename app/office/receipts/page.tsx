import ReceiptHistoryConsole from "@/components/office/receipts/ReceiptHistoryConsole";
import { getReceiptHistoryData } from "@/lib/receipts/data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ReceiptsPage() {
    const data = await getReceiptHistoryData();
    return <ReceiptHistoryConsole error={data.error} receipts={data.receipts} />;
}
