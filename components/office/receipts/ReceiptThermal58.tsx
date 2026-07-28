import { TenantPaymentReceiptSlip, type TenantReceiptViewModel } from "@/components/office/receipts/TenantPaymentReceipt";

export const RECEIPT_THERMAL_ROOT_ID = "tenant-receipt-print-root";

export function ReceiptThermal58({ receipt }: { receipt: TenantReceiptViewModel }) {
    return <TenantPaymentReceiptSlip receipt={receipt} />;
}
