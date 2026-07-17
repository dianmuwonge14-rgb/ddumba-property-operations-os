import { notFound } from "next/navigation";
import { TenantPaymentReceiptSlip } from "@/components/office/receipts/TenantPaymentReceipt";
import { autoPrintScript, firstParam, loadPrintableReceipt, paperWidth, receiptOnlyPrintCss } from "@/app/receipt-print/page";

export const dynamic = "force-dynamic";

type PageProps = {
    params: Promise<{ receiptId: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ReceiptPrintByIdPage({ params, searchParams }: PageProps) {
    const { receiptId } = await params;
    if (!receiptId) notFound();

    const query = await searchParams;
    const receipt = await loadPrintableReceipt(receiptId);
    const widthMm = paperWidth(query.width ?? query.paper);
    const autoPrint = firstParam(query.autoprint) === "1";

    return (
        <>
            <style dangerouslySetInnerHTML={{ __html: receiptOnlyPrintCss(widthMm) }} />
            <TenantPaymentReceiptSlip receipt={receipt} />
            {autoPrint ? <script dangerouslySetInnerHTML={{ __html: autoPrintScript(true) }} /> : null}
        </>
    );
}
