import { notFound } from "next/navigation";
import { ReceiptA4 } from "@/components/office/receipts/ReceiptA4";
import { ReceiptThermal58 } from "@/components/office/receipts/ReceiptThermal58";
import { autoPrintScript, firstParam, loadPrintableReceipt, paperWidth, receiptA4PrintCss, receiptOnlyPrintCss, ReceiptPrintActions, receiptPageControlsScript, receiptPrintLayout } from "@/app/receipt-print/page";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

type PageProps = {
    params: Promise<{ receiptId: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ReceiptPrintByIdPage({ params, searchParams }: PageProps) {
    const { receiptId } = await params;
    if (!receiptId) notFound();

    const query = await searchParams;
    const receipt = await loadPrintableReceipt(receiptId);
    const layout = receiptPrintLayout(query.layout, query.width ?? query.paper);
    const widthMm = paperWidth(query.width ?? query.paper);
    const autoPrint = firstParam(query.autoprint) === "1";

    return (
        <>
            <style dangerouslySetInnerHTML={{ __html: layout === "a4" ? receiptA4PrintCss() : receiptOnlyPrintCss(widthMm) }} />
            {layout === "a4" ? <ReceiptA4 receipt={receipt} /> : <ReceiptThermal58 receipt={receipt} />}
            <ReceiptPrintActions layout={layout} receiptId={receipt.id} widthMm={widthMm} />
            <script dangerouslySetInnerHTML={{ __html: receiptPageControlsScript(widthMm, receipt.id, layout) }} />
            {autoPrint ? <script dangerouslySetInnerHTML={{ __html: autoPrintScript(true) }} /> : null}
        </>
    );
}
